/* Dead Reckoning: the muon detector as an instrument with real error.
 * Muons coast down an evacuated bore through the ship's ice prow. When one decays, its
 * electron (beta near 1) makes a flash of Cherenkov light in the ice, and sensor strings
 * record which 100 m section the decay happened in. The decay positions follow
 * exp(-x / L) with L = beta gamma c tau, so a histogram of them measures the speed.
 * Counts are Poisson; each section's sensors have a different (hidden) efficiency that
 * falls toward the stern, and the station's certified beam lets a team measure those
 * efficiencies. Skipping that calibration biases the measured speed low.
 * Plain functions, tested in Node. */
(function (root, factory) {
  var DR = root.DR || (root.DR = {});
  var api = factory(DR.physics || require("./physics.js"), DR.rng || require("./rng.js"));
  DR.muonlab = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (P, R) {
  "use strict";

  var CHANNEL = 1200;                          // m of bore inside the ice
  var WIDTH = 100;                             // m per sensor section
  var SECTIONS = [];                           // section centres, m from the bow face
  for (var c = WIDTH / 2; c < CHANNEL; c += WIDTH) SECTIONS.push(c);
  var BEAM_BETA = 0.8;                         // the station's certified calibration beam
  var FLUX = 80;                               // muons per second entering the bore
  var N_ICE = 1.31;                            // refractive index of ice (visible light)

  // Average distance (m) a muon moving at beta travels before it decays.
  function decayLength(beta) { return P.betaGamma(beta) * P.MUON_CTAU; }

  // Cherenkov angle (degrees) for a particle at beta in ice, or null below threshold.
  function cherenkovAngle(beta) {
    var c = 1 / (N_ICE * beta);
    return c < 1 ? Math.acos(c) * 180 / Math.PI : null;
  }

  // Hidden values for one mission: the ship's speed, and section efficiencies that fall
  // toward the stern (older sensors, cloudier ice) with a little scatter.
  function mission(seed) {
    var r = R.makeRng(seed, "muonlab", 1);
    var beta = r.range(0.6, 0.95), grad = r.range(0.06, 0.12);
    var eff = SECTIONS.map(function (x) { return 0.9 * (1 - grad * x / 1000) * (1 + 0.015 * r.normal()); });
    // The colony at Station 3 closes on the ship at 0.50c to 0.78c in the ship frame (v < 0: it comes
    // toward the bow). Its speed w in the station frame follows by velocity addition. A separate stream,
    // so the ship speed and detector values of existing codes do not change.
    var rc = R.makeRng(seed, "colony", 1), colonyV = -rc.range(0.5, 0.78);
    var colonyW = P.addVelocities(colonyV, beta);
    return { seed: seed, beta: beta, grad: grad, eff: eff, colonyV: colonyV, colonyW: colonyW };
  }

  // Fraction of muons entering the bore that decay inside section k.
  function sectionFraction(beta, k) {
    var L = decayLength(beta), a = k * WIDTH;
    return Math.exp(-a / L) - Math.exp(-(a + WIDTH) / L);
  }

  // A counting run: muons at speed beta; add(dt) adds dt seconds of recorded decays and
  // returns the new counts per section (so a display can show each one).
  function Run(m, beta, stream) {
    this.rates = SECTIONS.map(function (x, k) { return FLUX * m.eff[k] * sectionFraction(beta, k); });
    this.counts = SECTIONS.map(function () { return 0; });
    this.seconds = 0;
    this.rng = R.makeRng(m.seed, stream, 0);
  }
  Run.prototype.add = function (dt) {
    var fresh = [];
    for (var k = 0; k < this.rates.length; k++) {
      var n = this.rng.poisson(this.rates[k] * dt);
      this.counts[k] += n; fresh.push(n);
    }
    this.seconds += dt;
    return fresh;
  };
  Run.prototype.total = function () { return this.counts.reduce(function (s, n) { return s + n; }, 0); };

  // Weighted straight-line fit of ln(n) against section centre. v is the variance of each n.
  // N(x) = exp(intercept) exp(-x / L).
  function fitDecay(n, v) {
    var xs = [], ys = [], ws = [], k;
    for (k = 0; k < SECTIONS.length; k++) {
      if (n[k] > 0 && v[k] > 0) { xs.push(SECTIONS[k]); ys.push(Math.log(n[k])); ws.push(n[k] * n[k] / v[k]); }
    }
    if (xs.length < 3) return null;
    var sw = 0, sx = 0, sy = 0, i;
    for (i = 0; i < xs.length; i++) { sw += ws[i]; sx += ws[i] * xs[i]; sy += ws[i] * ys[i]; }
    var xb = sx / sw, yb = sy / sw, sxx = 0, sxy = 0;
    for (i = 0; i < xs.length; i++) { var dx = xs[i] - xb; sxx += ws[i] * dx * dx; sxy += ws[i] * dx * (ys[i] - yb); }
    var slope = sxy / sxx, slopeErr = Math.sqrt(1 / sxx), intercept = yb - slope * xb, chi2 = 0;
    for (i = 0; i < xs.length; i++) { var res = ys[i] - intercept - slope * xs[i]; chi2 += ws[i] * res * res; }
    var ok = slope < 0;
    return {
      slope: slope, slopeErr: slopeErr, intercept: intercept, N0: Math.exp(intercept),
      interceptVar: 1 / sw + xb * xb / sxx, slopeVar: 1 / sxx, interceptSlopeCov: -xb / sxx,
      chi2: chi2, dof: xs.length - 2, ok: ok,
      L: ok ? -1 / slope : Infinity, LErr: ok ? slopeErr / (slope * slope) : Infinity
    };
  }

  // Section efficiencies relative to section 1, from a run with the certified beam.
  function calibration(counts) {
    var S = SECTIONS.map(function (x, k) { return sectionFraction(BEAM_BETA, k); });
    var e = counts.map(function (N, k) { return (N / S[k]) / (counts[0] / S[0]); });
    var de = counts.map(function (N, k) { return k === 0 ? 0 : e[k] * Math.sqrt(1 / N + 1 / counts[0]); });
    return { e: e, de: de };
  }

  // Counts divided by the calibrated efficiencies (or left raw without a calibration),
  // with variances that include the calibration's own uncertainty.
  function corrected(counts, cal) {
    var n = counts.map(function (N, k) { return cal ? N / cal.e[k] : N; });
    var v = counts.map(function (N, k) {
      if (!cal) return N;
      var rel = cal.de[k] / cal.e[k];
      return N / (cal.e[k] * cal.e[k]) + n[k] * n[k] * rel * rel;
    });
    return { n: n, v: v };
  }

  // Speed from a fitted decay length: L = beta gamma c tau.
  function speedFromFit(fit) {
    if (!fit || !fit.ok) return null;
    var x = fit.L / P.MUON_CTAU, beta = x / Math.sqrt(1 + x * x);
    var err = fit.LErr / P.MUON_CTAU / Math.pow(1 + x * x, 1.5);
    return { beta: beta, err: err };
  }

  return {
    SECTIONS: SECTIONS, WIDTH: WIDTH, CHANNEL: CHANNEL, BEAM_BETA: BEAM_BETA, FLUX: FLUX, N_ICE: N_ICE,
    decayLength: decayLength, cherenkovAngle: cherenkovAngle, mission: mission, sectionFraction: sectionFraction,
    Run: Run, fitDecay: fitDecay, calibration: calibration, corrected: corrected, speedFromFit: speedFromFit
  };
});
