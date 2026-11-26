/* Dead Reckoning: lab state, simulated instruments and the command layer.
 * The panel and the terminal both drive the lab only through Lab#exec(text),
 * so every action is available in both and is recorded in the action log. */
(function (root, factory) {
  var DR = root.DR || (root.DR = {});
  var api = factory(DR.physics || require("./physics.js"),
                    DR.rng || require("./rng.js"),
                    DR.hydrogen || require("./hydrogen.js"),
                    DR.text || require("./text.js"));
  DR.lab = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (P, R, H, T) {
  "use strict";

  var CFG = {
    counters: [0, 250, 500, 750, 1000],   // m, ship-frame positions along the channel
    muonFlux: 40,                          // muons/s entering the channel
    lifetimeRate: 50,                      // stopped-muon decays/s in the calibration target
    colocateFlux: 200,                     // muons/s through the co-located counters
    times: [10, 60, 300],                  // allowed counting times, s
    histBinUs: 0.5, histBins: 40,          // decay-time histogram, microseconds
    npix: 2048,
    lineSigmaPx: 1.6,
    lampNoise: 0.004, starNoise: 0.008,
    stars: [
      { id: "B1", deg: 0.4 }, { id: "B2", deg: 1.1 }, { id: "B3", deg: 1.8 },
      { id: "S1", deg: 178.2 }, { id: "S2", deg: 179.0 }, { id: "S3", deg: 179.6 }
    ],
    maxLaunches: 3,
    calibrationMaxRmsPx: 0.5,
    betaRange: [0.60, 0.95]
  };

  // ---------- hidden parameters (from the team code) ----------

  function muonSigmaEta(beta, eff2) {
    var T = 300, ctau = P.MUON_CTAU, slope = -1 / (P.betaGamma(beta) * ctau);
    var w = CFG.counters.map(function (x, i) {
      return (i === 0 ? 1 : eff2) * CFG.muonFlux * T * Math.exp(slope * x);
    });
    var sw = 0, swx = 0;
    w.forEach(function (wi, i) { sw += wi; swx += wi * CFG.counters[i]; });
    var xbar = swx / sw, sxx = 0;
    w.forEach(function (wi, i) { var d = CFG.counters[i] - xbar; sxx += wi * d * d; });
    var nc = CFG.colocateFlux * 60;
    var sLnRatio = Math.sqrt(1 / nc + 1 / (nc * eff2));
    var dSlope = sLnRatio * w[0] * Math.abs(CFG.counters[0] - xbar) / sxx;
    var sSlope = Math.sqrt(1 / sxx + dSlope * dSlope);
    var sBetaGamma = sSlope / (slope * slope * ctau);
    return sBetaGamma / P.gamma(beta);
  }

  function hiddenParams(seed) {
    var r = R.makeRng(seed, "params", 0);
    var beta = r.range(CFG.betaRange[0], CFG.betaRange[1]);
    var eff2 = r.range(0.90, 1.00);
    var spec = {
      L0: Math.log(95) + r.range(-0.03, 0.03),
      L1: Math.log(5200) + r.range(-0.03, 0.03),
      k: (r.uniform() < 0.5 ? -1 : 1) * r.range(0.04, 0.08)
    };
    var stars = CFG.stars.map(function (s) {
      return { id: s.id, deg: s.deg, vr: r.normal() * 20e3 / P.C };
    });
    var tolEta = Math.max(0.02, 4 * muonSigmaEta(beta, eff2));
    var w = null, tries = 0;
    while (tries++ < 500) {
      var cand = r.range(-0.6, 0.9);
      var g = cand - beta;   // the Galilean launch speed
      var galOk = Math.abs(g) >= 1 ||
        Math.abs(P.rapidity(g) + P.rapidity(beta) - P.rapidity(cand)) >= 10 * tolEta;
      if (galOk && Math.abs(cand - beta) > 0.1) { w = cand; break; }
    }
    if (w === null) throw new Error("No valid platform speed for seed " + seed);
    return { beta: beta, eff2: eff2, spec: spec, stars: stars, w: w, tolEta: tolEta,
             tolSpeed: Math.tanh(tolEta) };
  }

  // ---------- spectrograph ----------

  function lnLambdaAt(spec, p) {
    var s = p / (CFG.npix - 1);
    return spec.L0 + (spec.L1 - spec.L0) * s + spec.k * s * (s - 1);
  }

  function makeSpectrum(hidden, kind, factor, rng) {
    var n = CFG.npix, flux = new Array(n), lnl = new Array(n);
    var sigmaLn = CFG.lineSigmaPx * (hidden.spec.L1 - hidden.spec.L0) / (n - 1);
    for (var p = 0; p < n; p++) lnl[p] = lnLambdaAt(hidden.spec, p);
    var lines = H.LINES.map(function (L) { return { ln: Math.log(L.nm * factor), L: L }; })
      .filter(function (x) { return x.ln > lnl[0] - 0.05 && x.ln < lnl[n - 1] + 0.05; });
    for (p = 0; p < n; p++) {
      var f;
      if (kind === "lamp") {
        f = 0.02;
        for (var i = 0; i < lines.length; i++) {
          var d = (lnl[p] - lines[i].ln) / sigmaLn;
          if (d > -8 && d < 8) f += lines[i].L.strength * Math.exp(-0.5 * d * d);
        }
        f += CFG.lampNoise * rng.normal();
      } else {
        var cont = 0.9 + 0.2 * (p / (n - 1));
        f = cont;
        for (var j = 0; j < lines.length; j++) {
          var e = (lnl[p] - lines[j].ln) / sigmaLn;
          if (e > -8 && e < 8) f *= 1 - lines[j].L.depth * Math.exp(-0.5 * e * e);
        }
        f += CFG.starNoise * cont * rng.normal();
      }
      flux[p] = Math.round(f * 1e4) / 1e4;
    }
    return flux;
  }

  function percentile(arr, q) {
    var a = arr.slice().sort(function (x, y) { return x - y; });
    return a[Math.min(a.length - 1, Math.max(0, Math.floor(q * (a.length - 1))))];
  }

  // Find emission (lamp) or absorption (star) lines; centroid with uncertainty.
  function findPeaks(flux, kind) {
    var n = flux.length, sig = new Array(n), p;
    if (kind === "lamp") {
      var base = percentile(flux, 0.5);
      for (p = 0; p < n; p++) sig[p] = flux[p] - base;
    } else {
      var half = 40;
      for (p = 0; p < n; p++) {
        var lo = Math.max(0, p - half), hi = Math.min(n, p + half + 1);
        sig[p] = percentile(flux.slice(lo, hi), 0.85) - flux[p];
      }
    }
    var diffs = [];
    for (p = 1; p < n; p++) diffs.push(Math.abs(flux[p] - flux[p - 1]));
    var noise = percentile(diffs, 0.5) / 0.6745 / Math.SQRT2 * 1.0;
    var sm = sig.map(function (v, i) {
      return (sig[Math.max(0, i - 1)] + v + sig[Math.min(n - 1, i + 1)]) / 3;
    });
    var peaks = [];
    for (p = 4; p < n - 4; p++) {
      if (sm[p] < 6 * noise) continue;
      var isMax = true;
      for (var k = -3; k <= 3; k++) if (k !== 0 && sm[p + k] > sm[p]) { isMax = false; break; }
      if (!isMax) continue;
      var sw = 0, swp = 0;
      for (k = -4; k <= 4; k++) { var s = Math.max(0, sig[p + k]); sw += s; swp += s * (p + k); }
      if (sw <= 0) continue;
      var c = swp / sw, v = 0;
      for (k = -4; k <= 4; k++) { var dd = p + k - c; v += dd * dd; }
      var err = noise * Math.sqrt(v) / sw;
      var last = peaks[peaks.length - 1];
      if (last && c - last.pixel < 3) { if (sig[p] > last.height) peaks.pop(); else continue; }
      peaks.push({ pixel: c, err: err, height: sig[p] });
    }
    return peaks;
  }

  // ---------- small numerics ----------

  function weightedLine(xs, ys, ws) {
    var sw = 0, sx = 0, sy = 0;
    for (var i = 0; i < xs.length; i++) { sw += ws[i]; sx += ws[i] * xs[i]; sy += ws[i] * ys[i]; }
    var xb = sx / sw, yb = sy / sw, sxx = 0, sxy = 0;
    for (i = 0; i < xs.length; i++) {
      var dx = xs[i] - xb; sxx += ws[i] * dx * dx; sxy += ws[i] * dx * (ys[i] - yb);
    }
    var slope = sxy / sxx, icpt = yb - slope * xb;
    var chi2 = 0;
    for (i = 0; i < xs.length; i++) { var r = ys[i] - icpt - slope * xs[i]; chi2 += ws[i] * r * r; }
    return { slope: slope, intercept: icpt, slopeErr: Math.sqrt(1 / sxx),
             interceptErr: Math.sqrt(1 / sw + xb * xb / sxx), chi2: chi2, dof: xs.length - 2 };
  }

  function polyFit(xs, ys, order) {
    var m = order + 1, A = [], b = [];
    for (var i = 0; i < m; i++) { A.push(new Array(m).fill(0)); b.push(0); }
    xs.forEach(function (x, k) {
      for (var i = 0; i < m; i++) {
        b[i] += ys[k] * Math.pow(x, i);
        for (var j = 0; j < m; j++) A[i][j] += Math.pow(x, i + j);
      }
    });
    for (var c = 0; c < m; c++) {                 // Gaussian elimination, partial pivoting
      var piv = c;
      for (var r = c + 1; r < m; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      var t = A[c]; A[c] = A[piv]; A[piv] = t; var tb = b[c]; b[c] = b[piv]; b[piv] = tb;
      if (Math.abs(A[c][c]) < 1e-300) throw new Error("singular fit");
      for (r = c + 1; r < m; r++) {
        var f = A[r][c] / A[c][c];
        for (var j = c; j < m; j++) A[r][j] -= f * A[c][j];
        b[r] -= f * b[c];
      }
    }
    var coef = new Array(m);
    for (c = m - 1; c >= 0; c--) {
      var s = b[c];
      for (j = c + 1; j < m; j++) s -= A[c][j] * coef[j];
      coef[c] = s / A[c][c];
    }
    return coef;
  }

  function evalPoly(coef, x) { var y = 0; for (var i = coef.length - 1; i >= 0; i--) y = y * x + coef[i]; return y; }
  function dPoly(coef, x) { var y = 0; for (var i = coef.length - 1; i >= 1; i--) y = y * x + i * coef[i]; return y; }

  function fmt(x, d) { return (x >= 0 ? "" : "−") + Math.abs(x).toFixed(d); }
  function sgn(x, d) { return Math.abs(x) < 0.5 * Math.pow(10, -d) ? "+" + (0).toFixed(d) : (x > 0 ? "+" : "−") + Math.abs(x).toFixed(d); }

  // ---------- the lab ----------

  function Lab(codeText) {
    var dec = R.decodeCode(codeText);
    this.code = dec.code;
    this.seed = dec.seed;
    this.hidden = hiddenParams(dec.seed);
    this.station = "muon";
    this.idx = { lifetime: 0, colocate: 0, count: 0, lamp: 0, star: 0 };
    this.lifetime = { hist: new Array(CFG.histBins).fill(0), decays: 0, seconds: 0, fit: null };
    this.colocate = { n1: 0, n2: 0, seconds: 0 };
    this.counts = { n: CFG.counters.map(function () { return 0; }), seconds: 0, runs: [], fit: null };
    this.lamp = null;
    this.assign = {};      // peak index -> line id
    this.calibration = null;
    this.spectra = {};     // star id -> { flux, peaks, seconds }
    this.current = null;   // id of the spectrum shown last ("lamp" or a star id)
    this.launches = [];
    this.log = [];
    this.listeners = [];
  }

  Lab.CFG = CFG;

  Lab.prototype.onChange = function (fn) { this.listeners.push(fn); };
  Lab.prototype.emit = function (res) { this.listeners.forEach(function (fn) { fn(res); }); };

  Lab.prototype.status = function () {
    var lifetimeOk = !!(this.lifetime.fit && this.lifetime.fit.ok);
    var colocateOk = this.colocate.seconds > 0;
    return {
      lifetimeOk: lifetimeOk,
      colocateOk: colocateOk,
      muonUnlocked: lifetimeOk && colocateOk,
      lampRecorded: !!this.lamp,
      calibrated: !!(this.calibration && this.calibration.ok),
      launchesLeft: CFG.maxLaunches - this.launches.length,
      docked: this.launches.some(function (l) { return l.docked; })
    };
  };

  Lab.prototype.efficiencyRatio = function () {
    var c = this.colocate;
    if (!c.seconds || !c.n1 || !c.n2) return null;
    var r = c.n2 / c.n1;
    return { ratio: r, err: r * Math.sqrt(1 / c.n1 + 1 / c.n2) };
  };

  Lab.prototype.wavelengthOf = function (pixel, err) {
    var cal = this.calibration;
    if (!cal) return null;
    var s = pixel / (CFG.npix - 1);
    var ln = evalPoly(cal.coef, s), disp = dPoly(cal.coef, s) / (CFG.npix - 1);
    var nm = Math.exp(ln);
    return { nm: nm, err: nm * Math.abs(disp) * (err || 0) };
  };

  // ---------- commands ----------

  var HELP = [
    "Commands (type help <command> for details):",
    "  status                       what is unlocked and what is left to do",
    "  station muon|spectro|dock    switch station",
    "  calibrate lifetime <10|60|300>  record stopped-muon decays",
    "  fit lifetime                 fit the decay-time histogram",
    "  calibrate colocate <10|60|300>  counters side by side: efficiency ratio",
    "  count <10|60|300>            count muons at all five channel counters",
    "  fit counts                   fit ln(N) against counter position",
    "  lamp                         record the hydrogen calibration lamp",
    "  lines                        rest wavelengths of hydrogen lines",
    "  peaks [lamp|<star>]          list line positions in a spectrum",
    "  assign <peak#> <line>        match a lamp peak to a line, e.g. assign 3 H-alpha",
    "  unassign <peak#>|all         remove assignments",
    "  fit calibration linear|quadratic  fit pixel -> wavelength",
    "  stars                        list targets and their angles",
    "  point <star>                 record a star spectrum, e.g. point B1",
    "  platform                     platform beacon data and docking limits",
    "  launch <speed>               launch the pod at <speed> (fraction of c, ship frame)",
    "  show <lifetime|colocate|counts|lamp|calibration|<star>|launches>  data table",
    "  export                       download all data as a CSV file",
    "  log                          list everything you have done",
    "  code                         show this team's code",
    "  about                        what this lab is and how it works",
    "  explain <topic>              explain a station or a figure (explain alone lists topics)",
    "  glossary                     meanings of the symbols and terms"
  ];

  var DETAIL = {
    calibrate: "calibrate lifetime <seconds> records decays of muons stopped in the calibration target and adds them to the histogram. calibrate colocate <seconds> places counter 2 beside counter 1 so both see the same muons; the count ratio N2/N1 is counter 2's efficiency relative to counter 1. Counters 3 to 5 have the same efficiency as counter 2.",
    count: "count <seconds> counts muons at the five counters (0, 250, 500, 750 and 1000 m along the channel). Counts from repeated runs are added together. Unlocks after the lifetime fit and the co-located run.",
    fit: "fit lifetime: weighted straight-line fit of ln(counts) against decay time. fit counts: weighted straight-line fit of ln(N / efficiency) against counter position, using your measured efficiency ratio. fit calibration linear|quadratic: fits ln(wavelength) as a polynomial in pixel number using your lamp line assignments.",
    assign: "assign <peak#> <line> matches a numbered lamp peak (from peaks lamp) to a hydrogen line name from the lines list, e.g. assign 4 Pa-alpha. Use at least five lines spread across the band.",
    launch: "launch <speed> launches the cargo pod at <speed>, a signed fraction of c measured in the ship frame (positive = toward the bow). You have " + CFG.maxLaunches + " pods.",
    point: "point <star> records a spectrum of a star. B1 to B3 are near the bow (direction of travel); S1 to S3 are near the stern. Requires a passing spectrograph calibration.",
    peaks: "peaks lists line positions (pixel and uncertainty) in the lamp spectrum or a star spectrum. After calibration, wavelengths are shown too."
  };

  function out(lines, extra) {
    var r = { ok: true, lines: Array.isArray(lines) ? lines : [lines] };
    for (var k in extra) r[k] = extra[k];
    return r;
  }
  function fail(msg) { return { ok: false, lines: [msg] }; }

  function parseSeconds(tok) {
    var t = Number(String(tok || "").replace(/s$/i, ""));
    if (CFG.times.indexOf(t) < 0) return null;
    return t;
  }

  Lab.prototype.exec = function (text, opts) {
    opts = opts || {};
    var raw = String(text || "").trim();
    if (!raw) return fail("Type a command. Type help for a list.");
    var tok = raw.split(/\s+/), cmd = tok[0].toLowerCase(), arg = (tok[1] || "").toLowerCase();
    var res;
    try { res = this.dispatch(cmd, arg, tok); }
    catch (e) { res = fail("Error: " + e.message); }
    res.command = raw;
    if (res.ok && res.mutates) this.log.push({ cmd: raw, t: opts.time || new Date().toISOString() });
    if (!opts.silent) this.emit(res);
    return res;
  };

  Lab.prototype.dispatch = function (cmd, arg, tok) {
    var self = this, st, r, i;
    switch (cmd) {
      case "help": case "?":
        if (arg && DETAIL[arg]) return out(DETAIL[arg]);
        return out(HELP);

      case "code":
        return out("Team code: " + this.code);

      case "about": case "explain": case "glossary":
        return T.command(tok.join(" "));

      case "status": {
        st = this.status();
        var mark = function (b) { return b ? "done" : "not yet"; };
        return out([
          "Station: " + this.station,
          "Muon lifetime fit: " + mark(st.lifetimeOk) + ";  co-located counter run: " + mark(st.colocateOk),
          "Channel counters: " + (st.muonUnlocked ? "unlocked" : "locked (finish both calibrations)"),
          "Lamp spectrum: " + mark(st.lampRecorded) + ";  spectrograph calibration: " + (st.calibrated ? "passed" : "not passed"),
          "Pods left: " + st.launchesLeft + (st.docked ? " (docked!)" : "")
        ]);
      }

      case "station":
        if (["muon", "spectro", "dock"].indexOf(arg) < 0) return fail("Usage: station muon, station spectro or station dock.");
        this.station = arg;
        return out("Station: " + { muon: "muon flight channel", spectro: "spectrograph", dock: "pod launch" }[arg] + ".", { station: arg });

      case "calibrate": {
        var secs = parseSeconds(tok[2]);
        if (arg === "lifetime") {
          if (!secs) return fail("Usage: calibrate lifetime 10, 60 or 300.");
          r = R.makeRng(this.seed, "lifetime", this.idx.lifetime++);
          var n = r.poisson(CFG.lifetimeRate * secs), kept = 0;
          for (i = 0; i < n; i++) {
            var tUs = r.exponential(P.MUON_TAU * 1e6);
            var bin = Math.floor(tUs / CFG.histBinUs);
            if (bin < CFG.histBins) { this.lifetime.hist[bin]++; kept++; }
          }
          this.lifetime.decays += kept; this.lifetime.seconds += secs;
          return out("Recorded " + kept + " decays in " + secs + " s (" + this.lifetime.decays + " total). Type fit lifetime when you have enough.",
                     { mutates: true, dataset: "lifetime" });
        }
        if (arg === "colocate") {
          if (!secs) return fail("Usage: calibrate colocate 10, 60 or 300.");
          r = R.makeRng(this.seed, "colocate", this.idx.colocate++);
          var mean = CFG.colocateFlux * secs;
          var n1 = r.poisson(mean), n2 = r.poisson(mean * this.hidden.eff2);
          this.colocate.n1 += n1; this.colocate.n2 += n2; this.colocate.seconds += secs;
          var er = this.efficiencyRatio();
          return out(["Co-located run, " + secs + " s: counter 1 = " + n1 + ", counter 2 = " + n2 + ".",
                      "Totals: N1 = " + this.colocate.n1 + ", N2 = " + this.colocate.n2 +
                      ";  N2/N1 = " + er.ratio.toFixed(4) + " ± " + er.err.toFixed(4) + "."],
                     { mutates: true, dataset: "colocate" });
        }
        return fail("Usage: calibrate lifetime <seconds> or calibrate colocate <seconds>.");
      }

      case "count": {
        if (!this.status().muonUnlocked) return fail("Channel counters are locked. Finish the lifetime fit and the co-located run first (type status).");
        var s = parseSeconds(arg);
        if (!s) return fail("Usage: count 10, 60 or 300.");
        r = R.makeRng(this.seed, "count", this.idx.count++);
        var h = this.hidden, run = [];
        CFG.counters.forEach(function (x, k) {
          var eff = k === 0 ? 1 : h.eff2;
          run.push(r.poisson(CFG.muonFlux * s * eff * P.survival(x, h.beta)));
        });
        run.forEach(function (v, k) { self.counts.n[k] += v; });
        this.counts.seconds += s;
        this.counts.runs.push({ seconds: s, n: run });
        return out(["Counted for " + s + " s: " + run.map(function (v, k) { return "C" + (k + 1) + " " + v; }).join(", ") + ".",
                    "Running totals (" + this.counts.seconds + " s): " + this.counts.n.join(", ") + ". Type fit counts to fit."],
                   { mutates: true, dataset: "counts", flash: true });
      }

      case "fit": return this.fit(arg, tok);

      case "lamp": {
        r = R.makeRng(this.seed, "lamp", this.idx.lamp++);
        var flux = makeSpectrum(this.hidden, "lamp", 1, r);
        this.lamp = { flux: flux, peaks: findPeaks(flux, "lamp") };
        this.assign = {}; this.calibration = null; this.current = "lamp";
        return out(["Lamp spectrum recorded; " + this.lamp.peaks.length + " emission peaks found.",
                    "Type peaks lamp to list them, lines for the hydrogen line list, then assign peaks to lines."],
                   { mutates: true, dataset: "lamp" });
      }

      case "lines": {
        var rows = H.LINES.map(function (L) {
          return "  " + (L.id + "          ").slice(0, 11) + L.series.padEnd(9) + " n=" + L.upper + "→" + L.lower + "   " + L.nm.toFixed(2) + " nm";
        });
        return out(["Hydrogen lines, rest wavelengths in vacuum:"].concat(rows), { table: "lines" });
      }

      case "peaks": {
        var id = (tok[1] || this.current || "").toUpperCase();
        var spec = id === "LAMP" ? this.lamp : this.spectra[id];
        if (!spec) return fail(id ? "No spectrum named " + id + " yet." : "Record a spectrum first (lamp or point <star>).");
        this.current = id === "LAMP" ? "lamp" : id;
        var lines = [(id === "LAMP" ? "Lamp" : "Star " + id) + " peaks (" + spec.peaks.length + "):"];
        spec.peaks.forEach(function (pk, k) {
          var wl = self.wavelengthOf(pk.pixel, pk.err);
          var a = id === "LAMP" && self.assign[k] ? "   assigned " + self.assign[k] : "";
          lines.push("  #" + (k + 1) + "  pixel " + pk.pixel.toFixed(2) + " ± " + pk.err.toFixed(2) +
                     (wl ? "   λ = " + wl.nm.toFixed(2) + " ± " + Math.max(wl.err, 0.005).toFixed(2) + " nm" : "") + a);
        });
        return out(lines, { dataset: id === "LAMP" ? "lamp" : id });
      }

      case "assign": {
        if (!this.lamp) return fail("Record the lamp first.");
        var k = parseInt(tok[1], 10) - 1, line = H.find(tok[2] || "");
        if (!(k >= 0 && k < this.lamp.peaks.length)) return fail("No lamp peak #" + tok[1] + ". Type peaks lamp to see the numbers.");
        if (!line) return fail("Unknown line '" + (tok[2] || "") + "'. Type lines for the names (e.g. H-alpha, Ly-alpha, Pa-beta).");
        for (var key in this.assign) if (this.assign[key] === line.id && Number(key) !== k) delete this.assign[key];
        this.assign[k] = line.id; this.calibration = null;
        return out("Peak #" + (k + 1) + " (pixel " + this.lamp.peaks[k].pixel.toFixed(2) + ") assigned to " + line.id + " (" + line.nm.toFixed(2) + " nm).",
                   { mutates: true, dataset: "lamp" });
      }

      case "unassign": {
        if (arg === "all") { this.assign = {}; this.calibration = null; return out("All assignments removed.", { mutates: true, dataset: "lamp" }); }
        var u = parseInt(arg, 10) - 1;
        if (!(u in this.assign)) return fail("Peak #" + arg + " is not assigned.");
        delete this.assign[u]; this.calibration = null;
        return out("Peak #" + (u + 1) + " unassigned.", { mutates: true, dataset: "lamp" });
      }

      case "stars":
        return out(["Targets (angle from the direction of travel, measured on board):"].concat(
          CFG.stars.map(function (s) { return "  " + s.id + "  " + s.deg.toFixed(1) + "°" + (self.spectra[s.id] ? "   (recorded)" : ""); })));

      case "point": {
        if (!this.status().calibrated) return fail("Star pointing is locked until the spectrograph calibration passes.");
        var sid = (tok[1] || "").toUpperCase();
        var star = null;
        this.hidden.stars.forEach(function (s) { if (s.id === sid) star = s; });
        if (!star) return fail("Unknown target. Type stars for the list.");
        r = R.makeRng(this.seed, "star", this.idx.star++);
        var cosObs = Math.cos(star.deg * Math.PI / 180);
        var factor = P.dopplerFromObservedAngle(this.hidden.beta, cosObs) * Math.sqrt((1 + star.vr) / (1 - star.vr));
        var fl = makeSpectrum(this.hidden, "star", factor, r);
        this.spectra[sid] = { flux: fl, peaks: findPeaks(fl, "star") };
        this.current = sid;
        return out("Spectrum of " + sid + " recorded; " + this.spectra[sid].peaks.length + " absorption lines found. Type peaks " + sid + " to list them.",
                   { mutates: true, dataset: sid });
      }

      case "platform": {
        var hh = this.hidden;
        return out(["Platform beacon: platform velocity relative to the local rest frame = " + sgn(hh.w, 4) + "c",
                    "  (positive = same direction as the ship's motion).",
                    "Pod docking thrusters can absorb a velocity mismatch of up to " + hh.tolSpeed.toFixed(3) + "c, measured by the platform.",
                    "Pods left: " + (CFG.maxLaunches - this.launches.length) + "."]);
      }

      case "launch": {
        if (this.launches.length >= CFG.maxLaunches) return fail("No pods left.");
        var v = Number(String(tok[1] || "").replace(/c$/i, ""));
        if (!isFinite(v) || tok[1] === undefined) return fail("Usage: launch <speed>, e.g. launch -0.42 (fraction of c, ship frame).");
        if (Math.abs(v) >= 1) return fail("Launch refused: a pod cannot be launched at or above the speed of light. Nothing was used.");
        var hd = this.hidden;
        var uRest = P.addVelocities(v, hd.beta);
        var mismatch = P.relativeVelocity(uRest, hd.w);
        var docked = Math.abs(P.rapidity(mismatch)) <= hd.tolEta;
        var rec = { speed: v, uRest: uRest, mismatch: mismatch, docked: docked };
        this.launches.push(rec);
        var left = CFG.maxLaunches - this.launches.length;
        var msg = docked
          ? ["DOCKED. The pod reached the platform with a mismatch of " + sgn(mismatch, 4) + "c, within the " + hd.tolSpeed.toFixed(3) + "c thruster limit."]
          : ["DOCKING FAILED. Relative to the platform the pod moves at " + sgn(mismatch, 4) + "c (" +
             (mismatch > 0 ? "too fast in the direction of travel" : "too slow; it falls behind or recedes") +
             "); the thrusters can absorb only " + hd.tolSpeed.toFixed(3) + "c.", "Pods left: " + left + "."];
        return out(msg, { mutates: true, dataset: "launches", launch: rec });
      }

      case "show": return this.show(arg || (tok[1] || ""));

      case "log":
        if (!this.log.length) return out("Nothing recorded yet.");
        return out(this.log.map(function (e, k) { return "  " + (k + 1) + ". " + e.t.slice(11, 19) + "  " + e.cmd; }));

      case "export":
        return out("Data file prepared: " + this.exportName() + ".", { download: { name: this.exportName(), text: this.exportCsv() } });

      default:
        return fail("Unknown command '" + cmd + "'. Type help for a list.");
    }
  };

  Lab.prototype.fit = function (arg, tok) {
    var self = this;
    if (arg === "lifetime") {
      var h = this.lifetime.hist, ts = [], ys = [], ws = [];
      h.forEach(function (n, k) { if (n >= 10) { ts.push((k + 0.5) * CFG.histBinUs); ys.push(Math.log(n)); ws.push(n); } });
      if (ts.length < 4) return fail("Not enough data: record more decays (calibrate lifetime 60).");
      var f = weightedLine(ts, ys, ws);
      var tau = -1 / f.slope, tauErr = f.slopeErr / (f.slope * f.slope);
      var ok = Math.abs(tau - P.MUON_TAU * 1e6) <= 5 * tauErr;
      this.lifetime.fit = { tau: tau, tauErr: tauErr, slope: f.slope, slopeErr: f.slopeErr, intercept: f.intercept, ok: ok,
                            chi2: f.chi2, dof: f.dof };
      return out(["Lifetime fit: τ = " + tau.toFixed(3) + " ± " + tauErr.toFixed(3) + " µs  (χ² = " + f.chi2.toFixed(1) + " for " + f.dof + " degrees of freedom).",
                  ok ? "Consistent with the published muon lifetime, 2.197 µs. Lifetime calibration done."
                     : "Not consistent with the published lifetime (2.197 µs). Record more decays and fit again."],
                 { mutates: true, dataset: "lifetime" });
    }
    if (arg === "counts") {
      var er = this.efficiencyRatio();
      if (!this.counts.seconds) return fail("No counts yet. Type count 60.");
      var xs = [], y = [], w = [];
      for (var k = 0; k < CFG.counters.length; k++) {
        var N = this.counts.n[k];
        if (N < 5) continue;
        var eff = k === 0 ? 1 : er.ratio;
        xs.push(CFG.counters[k]); y.push(Math.log(N / eff)); w.push(N);
      }
      if (xs.length < 3) return fail("Not enough counts. Count for longer.");
      var g = weightedLine(xs, y, w);
      var L = -1 / g.slope, Lerr = g.slopeErr / (g.slope * g.slope);
      this.counts.fit = { slope: g.slope, slopeErr: g.slopeErr, intercept: g.intercept, decayLength: L, decayLengthErr: Lerr,
                          chi2: g.chi2, dof: g.dof, ratioUsed: er.ratio };
      return out(["Fit of ln(N/efficiency) vs position (efficiency ratio " + er.ratio.toFixed(4) + " applied to counters 2–5):",
                  "  slope = " + fmt(g.slope * 1000, 4) + " ± " + (g.slopeErr * 1000).toFixed(4) + " per km",
                  "  decay length = −1/slope = " + L.toFixed(0) + " ± " + Lerr.toFixed(0) + " m   (χ² = " + g.chi2.toFixed(1) + ", " + g.dof + " dof)",
                  "The uncertainty above is from counting statistics only; the efficiency-ratio uncertainty is not included."],
                 { mutates: true, dataset: "counts" });
    }
    if (arg === "calibration") {
      if (!this.lamp) return fail("Record the lamp first.");
      var order = (tok[2] || "").toLowerCase() === "linear" ? 1 : (tok[2] || "").toLowerCase() === "quadratic" ? 2 : 0;
      if (!order) return fail("Usage: fit calibration linear or fit calibration quadratic.");
      var keys = Object.keys(this.assign);
      if (keys.length < order + 3) return fail("Assign at least " + (order + 3) + " lamp peaks to lines first.");
      var ss = [], lnl = [], names = [];
      keys.forEach(function (key) {
        ss.push(self.lamp.peaks[key].pixel / (CFG.npix - 1));
        var L2 = H.find(self.assign[key]); lnl.push(Math.log(L2.nm)); names.push({ k: Number(key), id: L2.id, nm: L2.nm });
      });
      var coef = polyFit(ss, lnl, order);
      var sq = 0, resid = [];
      ss.forEach(function (s, i) {
        var disp = dPoly(coef, s) / (CFG.npix - 1);
        var rp = (lnl[i] - evalPoly(coef, s)) / disp;
        resid.push(rp); sq += rp * rp;
      });
      var rms = Math.sqrt(sq / ss.length);
      var nmVals = names.map(function (n) { return n.nm; });
      var span = Math.min.apply(null, nmVals) < 300 && Math.max.apply(null, nmVals) > 2000;
      var ok2 = order === 2 && keys.length >= 5 && rms < CFG.calibrationMaxRmsPx && span;
      this.calibration = { order: order, coef: coef, rmsPx: rms, ok: ok2, points: names.map(function (n, i) {
        return { peak: n.k + 1, line: n.id, nm: n.nm, pixel: self.lamp.peaks[n.k].pixel, residualPx: resid[i] }; }) };
      var lines = ["Calibration fit (" + (order === 2 ? "quadratic" : "linear") + ", " + keys.length + " lines): rms residual " + rms.toFixed(2) + " pixels."];
      this.calibration.points.forEach(function (p) {
        lines.push("  " + (p.line + "          ").slice(0, 11) + "pixel " + p.pixel.toFixed(2) + "   residual " + sgn(p.residualPx, 2) + " px");
      });
      if (ok2) lines.push("Calibration passed. Star pointing unlocked.");
      else if (!span) lines.push("Not passed: use lines spread across the band (at least one below 300 nm and one above 2000 nm).");
      else if (order === 1) lines.push("Not passed: a linear fit leaves residuals of " + rms.toFixed(1) + " px. Look at the pattern of residuals, then try quadratic.");
      else if (keys.length < 5) lines.push("Not passed: use at least five lines.");
      else lines.push("Not passed: residuals are larger than " + CFG.calibrationMaxRmsPx + " px. Check your assignments; one may be wrong.");
      return out(lines, { mutates: true, dataset: "calibration" });
    }
    return fail("Usage: fit lifetime, fit counts, or fit calibration linear|quadratic.");
  };

  // Data tables: { caption, columns, rows }
  Lab.prototype.table = function (name) {
    var self = this, n = String(name || "").toLowerCase();
    if (n === "lifetime") return { caption: "Stopped-muon decay times (" + this.lifetime.decays + " decays)",
      columns: ["bin start (µs)", "bin end (µs)", "decays"],
      rows: this.lifetime.hist.map(function (c, k) { return [(k * CFG.histBinUs).toFixed(1), ((k + 1) * CFG.histBinUs).toFixed(1), c]; }) };
    if (n === "colocate") { var er = this.efficiencyRatio();
      return { caption: "Co-located counter run", columns: ["seconds", "N1", "N2", "N2/N1", "uncertainty"],
        rows: [[this.colocate.seconds, this.colocate.n1, this.colocate.n2, er ? er.ratio.toFixed(4) : "", er ? er.err.toFixed(4) : ""]] }; }
    if (n === "counts") return { caption: "Channel counter totals (" + this.counts.seconds + " s)",
      columns: ["counter", "position (m)", "counts"],
      rows: CFG.counters.map(function (x, k) { return ["C" + (k + 1), x, self.counts.n[k]]; }) };
    if (n === "calibration") { if (!this.calibration) return null;
      return { caption: "Spectrograph calibration points (rms " + this.calibration.rmsPx.toFixed(2) + " px)",
        columns: ["peak", "line", "rest wavelength (nm)", "pixel", "residual (px)"],
        rows: this.calibration.points.map(function (p) { return [p.peak, p.line, p.nm.toFixed(3), p.pixel.toFixed(2), p.residualPx.toFixed(2)]; }) }; }
    if (n === "launches") return { caption: "Pod launches", columns: ["#", "launch speed (c, ship frame)", "result"],
      rows: this.launches.map(function (l, k) { return [k + 1, sgn(l.speed, 4), l.docked ? "docked" : "failed"]; }) };
    var id = n.toUpperCase(), spec = id === "LAMP" ? this.lamp : this.spectra[id];
    if (spec) return { caption: (id === "LAMP" ? "Lamp" : "Star " + id) + " line positions",
      columns: ["#", "pixel", "uncertainty (px)", "wavelength (nm)", "uncertainty (nm)"].concat(id === "LAMP" ? ["assigned line"] : []),
      rows: spec.peaks.map(function (pk, k) {
        var wl = self.wavelengthOf(pk.pixel, pk.err);
        var row = [k + 1, pk.pixel.toFixed(2), pk.err.toFixed(2), wl ? wl.nm.toFixed(2) : "", wl ? Math.max(wl.err, 0.005).toFixed(2) : ""];
        if (id === "LAMP") row.push(self.assign[k] || "");
        return row; }) };
    return null;
  };

  Lab.prototype.show = function (name) {
    var t = this.table(name);
    if (!t) return fail("No data named '" + name + "' yet. Try lifetime, colocate, counts, lamp, calibration, a star id, or launches.");
    var lines = [t.caption + ":", "  " + t.columns.join(" | ")];
    t.rows.forEach(function (r) { lines.push("  " + r.join(" | ")); });
    return out(lines, { tableData: t });
  };

  Lab.prototype.exportName = function () { return "dead-reckoning-" + this.code + ".csv"; };

  Lab.prototype.exportCsv = function () {
    var self = this, parts = [];
    function esc(v) { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    function section(t) {
      if (!t) return;
      parts.push("# " + t.caption);
      parts.push(t.columns.map(esc).join(","));
      t.rows.forEach(function (r) { parts.push(r.map(esc).join(",")); });
      parts.push("");
    }
    parts.push("# Dead Reckoning relativity lab data", "# team code," + this.code, "# lab version,1", "# exported," + new Date().toISOString(), "");
    ["lifetime", "colocate", "counts", "calibration", "lamp"].forEach(function (n) { section(self.table(n)); });
    Object.keys(this.spectra).sort().forEach(function (id) { section(self.table(id)); });
    if (this.lamp) section({ caption: "Lamp spectrum (raw)", columns: ["pixel", "intensity"], rows: this.lamp.flux.map(function (f, p) { return [p, f]; }) });
    Object.keys(this.spectra).sort().forEach(function (id) {
      section({ caption: "Star " + id + " spectrum (raw)", columns: ["pixel", "intensity"], rows: self.spectra[id].flux.map(function (f, p) { return [p, f]; }) });
    });
    section(this.table("launches"));
    section({ caption: "Action log", columns: ["time", "command"], rows: this.log.map(function (e) { return [e.t, e.cmd]; }) });
    return parts.join("\n");
  };

  // Rebuild a lab from its code and action log (all randomness is keyed, so this is exact).
  Lab.replay = function (code, log) {
    var lab = new Lab(code);
    (log || []).forEach(function (e) { lab.exec(e.cmd, { silent: true, time: e.t }); });
    return lab;
  };

  // Instructor key: expected values for a team code.
  Lab.key = function (code) {
    var dec = R.decodeCode(code), h = hiddenParams(dec.seed), b = h.beta;
    var bg = P.betaGamma(b);
    return {
      code: dec.code, beta: b, gamma: P.gamma(b), betaGamma: bg, rapidity: P.rapidity(b),
      efficiencyRatio: h.eff2,
      decayLength: bg * P.MUON_CTAU, slopePerKm: -1000 / (bg * P.MUON_CTAU),
      survivalAt1000: P.survival(1000, b),
      dopplerBow: P.dopplerBow(b), dopplerStern: P.dopplerStern(b),
      sternBowRatio: P.dopplerStern(b) / P.dopplerBow(b),
      platformW: h.w, launchSpeed: P.launchVelocity(h.w, b), galileanLaunch: h.w - b,
      tolSpeed: h.tolSpeed, tolEta: h.tolEta,
      calibration: h.spec, stars: h.stars,
      muonSigmaEta300s: muonSigmaEta(b, h.eff2)
    };
  };

  return { Lab: Lab, CFG: CFG, hiddenParams: hiddenParams, findPeaks: findPeaks, makeSpectrum: makeSpectrum,
           lnLambdaAt: lnLambdaAt, weightedLine: weightedLine, polyFit: polyFit, muonSigmaEta: muonSigmaEta };
});
