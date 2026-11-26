/* Dead Reckoning: Station 2 Spectrograph and Station 3 Shuttle rendezvous mechanics.
 * Pure functions, fully testable in Node.js and usable in the browser. */
(function (root, factory) {
  var DR = root.DR || (root.DR = {});
  var api = factory(
    DR.physics || require("./physics.js"),
    DR.hydrogen || require("./hydrogen.js"),
    DR.rng || require("./rng.js")
  );
  DR.spectrolab = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (P, H, R) {
  "use strict";

  var NPIX = 512;
  var LAMBDA_MIN = 100; // nm: include the far-UV at the highest mission speeds
  var LAMBDA_MAX = 1400; // nm

  function pixelToNmNominal(p) {
    return LAMBDA_MIN + (LAMBDA_MAX - LAMBDA_MIN) * (p / (NPIX - 1));
  }

  function nmToPixelNominal(nm) {
    return (nm - LAMBDA_MIN) / (LAMBDA_MAX - LAMBDA_MIN) * (NPIX - 1);
  }

  // Key Balmer lines used for calibration and measurement
  var KEY_LINES = [
    { id: "H-gamma", name: "H-γ", restNm: 434.05, color: "#8a5cff" },
    { id: "H-beta",  name: "H-β", restNm: 486.13, color: "#28d7c4" },
    { id: "H-alpha", name: "H-α", restNm: 656.28, color: "#ff4d4d" }
  ];

  // Calibration lamp: hydrogen emission lines + detector read noise
  function lampSpectrum(seed) {
    var r = R.makeRng(seed, "lamp", 1);
    // Slight random pixel offset and nonlinear dispersion distortion
    var pOffset = r.range(-4, 4);
    var pScale = r.range(0.98, 1.02);
    var flux = new Float32Array(NPIX);

    // Baseline noise
    for (var p = 0; p < NPIX; p++) {
      flux[p] = Math.max(0.01, 0.03 + 0.012 * r.normal());
    }

    // Add emission lines
    KEY_LINES.forEach(function (line) {
      var pTrue = nmToPixelNominal(line.restNm);
      var pCen = pTrue * pScale + pOffset;
      var sigma = 2.4; // line width in pixels
      var amp = line.id === "H-alpha" ? 0.95 : line.id === "H-beta" ? 0.65 : 0.45;
      var minP = Math.max(0, Math.floor(pCen - 4 * sigma));
      var maxP = Math.min(NPIX - 1, Math.ceil(pCen + 4 * sigma));
      for (var i = minP; i <= maxP; i++) {
        var d = (i - pCen) / sigma;
        flux[i] += amp * Math.exp(-0.5 * d * d);
      }
    });

    return { flux: flux, pOffset: pOffset, pScale: pScale };
  }

  // Starlight: continuum with Doppler-shifted hydrogen absorption troughs
  function starSpectrum(seed, beta, direction, pOffset, pScale) {
    pOffset = pOffset || 0;
    pScale = pScale || 1.0;
    var r = R.makeRng(seed, "star_" + direction, 2);
    var factor = direction === "bow" ? P.dopplerBow(beta) : P.dopplerStern(beta);
    var flux = new Float32Array(NPIX);

    // Continuum with gentle slope
    for (var p = 0; p < NPIX; p++) {
      var frac = p / (NPIX - 1);
      flux[p] = 0.85 + 0.15 * frac + 0.02 * r.normal();
    }

    // Absorption lines shifted by Doppler factor
    KEY_LINES.forEach(function (line) {
      var shiftedNm = line.restNm * factor;
      if (shiftedNm >= LAMBDA_MIN - 20 && shiftedNm <= LAMBDA_MAX + 20) {
        var pTrue = nmToPixelNominal(shiftedNm);
        var pCen = pTrue * pScale + pOffset;
        var sigma = 2.8;
        var depth = line.id === "H-alpha" ? 0.65 : line.id === "H-beta" ? 0.50 : 0.35;
        var minP = Math.max(0, Math.floor(pCen - 4 * sigma));
        var maxP = Math.min(NPIX - 1, Math.ceil(pCen + 4 * sigma));
        for (var i = minP; i <= maxP; i++) {
          var d = (i - pCen) / sigma;
          flux[i] *= (1 - depth * Math.exp(-0.5 * d * d));
        }
      }
    });

    return { flux: flux, factor: factor, direction: direction };
  }

  // Calculate speed from stern / bow wavelength ratio
  // R = lambda_stern / lambda_bow = (1 + beta) / (1 - beta)
  // beta = (R - 1) / (R + 1)
  function speedFromDopplerRatio(lambdaBow, lambdaStern) {
    if (!lambdaBow || !lambdaStern || lambdaBow <= 0 || lambdaStern <= lambdaBow) return null;
    var ratio = lambdaStern / lambdaBow;
    var beta = P.betaFromSternBowRatio(ratio);
    return { ratio: ratio, beta: beta };
  }

  // Shuttle docking physics:
  // Given ship beta, platform w (in rest frame), and launch velocity uPrime (ship frame)
  function evaluateDocking(uPrime, beta, platformW, tolSpeed) {
    tolSpeed = tolSpeed || 0.015;
    var uRest = P.addVelocities(uPrime, beta);
    var mismatch = P.relativeVelocity(uRest, platformW);
    var docked = Math.abs(mismatch) <= tolSpeed;
    var optimalUPrime = P.launchVelocity(platformW, beta);
    return {
      uPrime: uPrime,
      uRest: uRest,
      platformW: platformW,
      mismatch: mismatch,
      docked: docked,
      optimalUPrime: optimalUPrime,
      tolSpeed: tolSpeed,
      galileanMismatch: (uPrime + beta) - platformW
    };
  }

  // ---- Star scoper and ring radiators (Stations 2 and 3) ----
  var H_ALPHA_NM = 656.28;

  // Reference stars, by rest-frame angle from the flight axis (degrees, bow = 0)
  var STAR_CATALOG = [
    { id: "A", restDeg: 70 },
    { id: "B", restDeg: 85 },
    { id: "C", restDeg: 130 },
    { id: "D", restDeg: 150 }
  ];

  // Observed angle (degrees from the bow) of a star at rest-frame angle restDeg, seen from a ship at beta
  function observedAngleDeg(restDeg, beta) {
    var c = P.aberrate(beta, Math.cos(restDeg * Math.PI / 180));
    return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI;
  }

  // Starlight seen at observed angle thetaObsDeg. Lines shift by f = lambda_obs / lambda_rest = gamma (1 - beta cos theta)
  function starSpectrumAt(seed, beta, thetaObsDeg, pOffset, pScale) {
    pOffset = pOffset || 0;
    pScale = pScale || 1.0;
    var r = R.makeRng(seed, "scope", 2);
    var factor = P.dopplerFromObservedAngle(beta, Math.cos(thetaObsDeg * Math.PI / 180));
    var flux = new Float32Array(NPIX);
    for (var p = 0; p < NPIX; p++) {
      var frac = p / (NPIX - 1);
      flux[p] = 0.85 + 0.15 * frac + 0.02 * r.normal();
    }
    KEY_LINES.forEach(function (line) {
      var shiftedNm = line.restNm * factor;
      if (shiftedNm >= LAMBDA_MIN - 20 && shiftedNm <= LAMBDA_MAX + 20) {
        var pCen = nmToPixelNominal(shiftedNm) * pScale + pOffset;
        var sigma = 2.8;
        var depth = line.id === "H-alpha" ? 0.65 : line.id === "H-beta" ? 0.50 : 0.35;
        var minP = Math.max(0, Math.floor(pCen - 4 * sigma));
        var maxP = Math.min(NPIX - 1, Math.ceil(pCen + 4 * sigma));
        for (var i = minP; i <= maxP; i++) {
          var d = (i - pCen) / sigma;
          flux[i] *= (1 - depth * Math.exp(-0.5 * d * d));
        }
      }
    });
    return { flux: flux, factor: factor, thetaObsDeg: thetaObsDeg };
  }

  // Speed from one star. Solve f = gamma (1 - beta cos theta) for beta: the quadratic has up to two roots,
  // because the Doppler factor at a fixed angle can fit two speeds. Returns the roots inside (-1, 1).
  function solveBetaFromDoppler(factor, thetaObsDeg) {
    if (!(factor > 0)) return [];
    var c = Math.cos(thetaObsDeg * Math.PI / 180), s2 = 1 - c * c;
    var f2 = factor * factor;
    var disc = f2 * (f2 - s2);
    if (disc < 0) return [];
    var q = Math.sqrt(disc), den = c * c + f2;
    var roots = [(c - q) / den, (c + q) / den].filter(function (b) { return b > -1 && b < 1; });
    return roots.filter(function (b, i) { return roots.indexOf(b) === i; });
  }

  // Ring radiators on the platform emit H-alpha. In the ship frame the platform moves along the flight axis at
  // the signed velocity v = (w - beta)/(1 - w beta) (negative: toward the bow). Seen at observed angle theta from
  // the bow, the light arrives with lambda_obs / lambda_emit = gamma_v (1 + v cos theta). On the axis (theta = 0)
  // that is the collinear factor sqrt((1 + v)/(1 - v)).
  function radiatorFactor(beta, w, thetaObsDeg) {
    var v = P.relativeVelocity(w, beta), c = Math.cos((thetaObsDeg || 0) * Math.PI / 180);
    return thetaObsDeg ? P.gamma(v) * (1 + v * c) : Math.sqrt((1 + v) / (1 - v));
  }
  function radiatorLineNm(beta, w, thetaObsDeg) {
    return H_ALPHA_NM * radiatorFactor(beta, w, thetaObsDeg);
  }

  // Platform speed in the station frame, from a measured radiator line and the ship's speed
  function platformSpeedFromLine(beta, lambdaNm) {
    var f = lambdaNm / H_ALPHA_NM;
    var v = (f * f - 1) / (f * f + 1);
    return P.addVelocities(v, beta);
  }

  // Docking outcome from the arrival mismatch: inside the margin docks; too fast explodes on the platform;
  // too slow falls short of it
  function dockOutcome(mismatch, tolSpeed) {
    if (Math.abs(mismatch) <= tolSpeed) return "docked";
    return mismatch > 0 ? "boom" : "short";
  }

  return {
    NPIX: NPIX,
    LAMBDA_MIN: LAMBDA_MIN,
    LAMBDA_MAX: LAMBDA_MAX,
    KEY_LINES: KEY_LINES,
    pixelToNmNominal: pixelToNmNominal,
    nmToPixelNominal: nmToPixelNominal,
    lampSpectrum: lampSpectrum,
    starSpectrum: starSpectrum,
    speedFromDopplerRatio: speedFromDopplerRatio,
    evaluateDocking: evaluateDocking,
    H_ALPHA_NM: H_ALPHA_NM,
    STAR_CATALOG: STAR_CATALOG,
    observedAngleDeg: observedAngleDeg,
    starSpectrumAt: starSpectrumAt,
    solveBetaFromDoppler: solveBetaFromDoppler,
    radiatorFactor: radiatorFactor,
    radiatorLineNm: radiatorLineNm,
    platformSpeedFromLine: platformSpeedFromLine,
    dockOutcome: dockOutcome
  };
});
