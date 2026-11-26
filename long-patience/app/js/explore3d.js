/* Dead Reckoning: the explore pictures in 3D. Four WebGL scenes driven by one speed
 * control. The numbers come from explore.js and the drawing from gl3d.js; the labels
 * are real text laid over each picture. Without WebGL the readouts still work. */
(function () {
  "use strict";
  if (typeof document === "undefined" || !document.getElementById("explore-root")) return;
  var DR = window.DR, E = DR.explore, P = DR.physics, H = DR.hydrogen, G = DR.gl3d;
  var translate = G.translate, rotZ = G.rotZ, mul = G.mul;
  var $ = function (id) { return document.getElementById(id); };
  var MINUS = "−", TIMES = "×", GAMMA = "γ", ALPHA = "α", DEG = "°";
  var CH = E.CHANNEL_M, CNT = E.COUNTERS_M;
  var SPAWN_RATE = 3, FLY_SPEED = 170, FLASH_S = 0.35;
  var SKY_R = 400, PI2 = 2 * Math.PI, C45 = Math.SQRT1_2;

  var beta = 0.66, pod = 0.5, clockT = 0, lightView = "ahead";
  var muons = { list: [], N: 0, passed: CNT.map(function () { return 0; }), flashes: [], acc: 0 };
  var dirty = true;

  var COL = {
    ice: [0.74, 0.9, 1.0], hull: [0.32, 0.35, 0.4], metal: [0.62, 0.66, 0.72], dark: [0.16, 0.17, 0.2],
    amber: [1.0, 0.72, 0.32], cyan: [0.4, 0.95, 1.0], red: [1.0, 0.32, 0.26], white: [1.0, 0.95, 0.82],
    blue: [0.45, 0.8, 1.0], grey: [0.55, 0.58, 0.64]
  };

  function f2(x) { return x.toFixed(2); }
  function pct(x) { return Math.round(x * 100) + "%"; }

  // ---------- small helpers ----------
  function glowArray(list) {
    var a = new Float32Array(list.length * 7);
    for (var i = 0; i < list.length; i++) for (var k = 0; k < 7; k++) a[i * 7 + k] = list[i][k];
    return a;
  }
  function vtx(p, c) { return [p[0], p[1], p[2], 0, 1, 0, c[0], c[1], c[2]]; }
  // Distance along the muon channel (m) to the scene's x position: bow at +6, stern at -6.
  function xOf(d) { return 6 - 12 * d / CH; }

  // Approximate colour of a visible wavelength (nm), with the eye's fall-off at both ends.
  function wavelengthRGB(nm) {
    var r = 0, g = 0, b = 0;
    if (nm < 440) { r = -(nm - 440) / 60; b = 1; }
    else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
    else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
    else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
    else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
    else { r = 1; }
    var f = 1;
    if (nm < 420) f = 0.3 + 0.7 * (nm - 380) / 40;
    else if (nm > 700) f = 0.3 + 0.7 * (750 - nm) / 50;
    return [r * f, g * f, b * f];
  }
  function spectrumColor(nm) {
    if (nm >= 380 && nm <= 750) return wavelengthRGB(nm);
    if (nm < 380) return [0.22, 0.1, 0.48];   // ultraviolet: dim violet
    return [0.38, 0.12, 0.08];                 // infrared: dim red
  }
  // Blackbody colour (T in kelvin), components 0..1.
  function bbColor(T) {
    var t = Math.min(40000, Math.max(1000, T)) / 100, r, g, b;
    r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = t >= 66 ? 255 : (t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307);
    return [r, g, b].map(function (v) { return Math.min(255, Math.max(0, v)) / 255; });
  }

  // Background stars, as glow points on a sphere around the scene.
  function starArray(n, radius, smin, smax) {
    var r = DR.rng.makeRng(7, "bg", 0), list = [];
    for (var i = 0; i < n; i++) {
      var z = 2 * r.uniform() - 1, ph = PI2 * r.uniform(), s = Math.sqrt(1 - z * z);
      var b = 0.35 + 0.65 * r.uniform();
      list.push([radius * s * Math.cos(ph), radius * z, radius * s * Math.sin(ph), b, b * 0.95, b, smin + (smax - smin) * r.uniform()]);
    }
    return glowArray(list);
  }
  // The star catalogue for the sky: rest-frame directions (forward = +x), temperature, brightness.
  function skyStars() {
    var r = DR.rng.makeRng(1, "sky", 0), out = [];
    for (var i = 0; i < 1600; i++) {
      var z = 2 * r.uniform() - 1, ph = PI2 * r.uniform(), s = Math.sqrt(1 - z * z);
      out.push({ d: [s * Math.cos(ph), s * Math.sin(ph), z],
                 T: Math.exp(r.range(Math.log(3000), Math.log(25000))),
                 b: Math.pow(r.uniform(), 3) * 0.9 + 0.1 });
    }
    return out;
  }

  // ---------- geometry ----------
  // The light-hugger-style ship at rest length. Travel is along +x, with the bow at +x.
  function shipGeo() {
    var g = new G.Geo();
    G.tubeX(g, 0.36, 0.36, -4.0, 4.1, 24, COL.hull, true);       // spine
    G.tubeX(g, 0.6, 0.46, -4.8, -4.0, 24, COL.dark, true);       // engine bell
    G.tubeX(g, 0.95, 0.95, 0.9, 4.6, 36, COL.ice, true);         // ice shield
    G.tubeX(g, 0.95, 0.12, 4.6, 6.0, 36, COL.ice, true);         // prow
    [-2.2, -0.6, 1.0].forEach(function (x) { G.torusX(g, 0.92, 0.07, x, 20, 10, COL.metal); }); // habitat rings
    return g;
  }
  function clockGeo(r) {
    var g = new G.Geo();
    G.discZ(g, r, 40, COL.white);
    for (var i = 0; i < 12; i++) {
      var a = i / 12 * PI2;
      G.box(g, Math.sin(a) * r * 0.84, Math.cos(a) * r * 0.84, 0.01, r * 0.07, r * 0.14, 0.02, COL.dark);
    }
    G.box(g, 0, 0, 0.012, r * 0.1, r * 0.1, 0.02, COL.dark);
    return g;
  }
  function handGeo(len, w, col) {
    var g = new G.Geo();
    G.box(g, 0, len / 2, 0.03, w, len, 0.03, col);
    return g;
  }
  function iceGeo() {
    var g = new G.Geo();
    G.tubeX(g, 1.5, 1.5, -7, 7, 40, COL.ice, true);
    G.tubeX(g, 1.5, 0.25, 7, 8.6, 40, COL.ice, true);
    return g;
  }
  function countersGeo() {
    var g = new G.Geo();
    CNT.forEach(function (d) { G.torusX(g, 1.62, 0.07, xOf(d), 28, 10, COL.amber); });
    return g;
  }
  function tubeGeo(x0, x1, rad, col) {
    var g = new G.Geo();
    G.tubeX(g, rad, rad, x0, x1, 8, col, false);
    return g;
  }
  function boxGeo(cx, cy, cz, sx, sy, sz, col) {
    var g = new G.Geo();
    G.box(g, cx, cy, cz, sx, sy, sz, col);
    return g;
  }
  function sphereGeo(r, col) {
    var g = new G.Geo();
    G.sphere(g, r, 20, col);
    return g;
  }
  // An arrow along +x: a body of unit length (scaled to the arrow) and a head of fixed size.
  function arrowBodyGeo(col) { var g = new G.Geo(); G.tubeX(g, 0.09, 0.09, 0, 1, 14, col, true); return g; }
  function arrowHeadGeo(col) { var g = new G.Geo(); G.tubeX(g, 0.24, 0, 0, 0.45, 18, col, true); return g; }

  // ---------- labels: real text laid over a picture ----------
  function Labels(box, r) { this.box = box; this.r = r; this.map = {}; }
  Labels.prototype.reset = function () {
    for (var k in this.map) this.map[k].style.display = "none";
  };
  Labels.prototype.put = function (key, text, pos) {
    var el = this.map[key];
    if (!el) {
      el = document.createElement("span");
      el.className = "tag";
      this.box.appendChild(el);
      this.map[key] = el;
    }
    if (el.textContent !== text) el.textContent = text;
    var p = this.r.project(pos);
    if (!p) { el.style.display = "none"; return; }
    el.style.display = "";
    el.style.left = p.x.toFixed(1) + "px";
    el.style.top = p.y.toFixed(1) + "px";
  };

  // ---------- scene 1: moving clocks and rulers ----------
  function clocksScene(r, labels) {
    var ship = r.mesh(shipGeo());
    var faceS = r.mesh(clockGeo(1.1)), faceK = r.mesh(clockGeo(0.42));
    var handsS = [r.mesh(handGeo(0.55, 0.08, COL.amber)), r.mesh(handGeo(0.9, 0.05, COL.amber))];
    var handsK = [r.mesh(handGeo(0.22, 0.05, COL.cyan)), r.mesh(handGeo(0.36, 0.035, COL.cyan))];
    var track = r.mesh(tubeGeo(-19, 19, 0.035, COL.grey));
    var stars = r.glowMesh(starArray(300, 70, 1.0, 2.2));
    var engine = r.glowMesh(glowArray([[0, 0, 0, 1, 0.55, 0.2, 80]]));
    return {
      update: function () {},
      draw: function () {
        r.camera([0, 2.6, 15.5], [0, 0.4, 0], 46);
        r.begin();
        r.drawGlow(stars, null, { gain: 0.8 });
        r.drawEmit(track, translate(0, -1.25, 0), { gain: 0.9 });
        var gam = P.gamma(beta), s = 1 / gam;
        var xs = -18 + ((clockT * (0.8 + 3.0 * beta)) % 36);
        // the station clock, on the left
        var sc = translate(-8.5, 2.5, 0), a = PI2 * clockT / 8;
        r.drawLit(faceS, sc, {});
        r.drawLit(handsS[0], mul(sc, rotZ(-a / 12)), { emit: [0.12, 0.07, 0] });
        r.drawLit(handsS[1], mul(sc, rotZ(-a)), { emit: [0.12, 0.07, 0] });
        // the ship: a ghost at its length at rest, then the ship as the station measures it
        r.drawLit(ship, translate(xs, 0, 0), { alpha: 0.22, emit: [0.12, 0.3, 0.45] });
        var sh = mul(translate(xs, 0, 0), G.scaleXYZ(s, 1, 1));
        r.drawLit(ship, sh, {});
        var face = mul(sh, translate(-1.6, 0, 0.42)), ak = PI2 * (clockT / gam) / 8;
        r.drawLit(faceK, face, {});
        r.drawLit(handsK[0], mul(face, rotZ(-ak / 12)), { emit: [0, 0.06, 0.08] });
        r.drawLit(handsK[1], mul(face, rotZ(-ak)), { emit: [0, 0.06, 0.08] });
        // a glow at the engine
        r.updateGlow(engine, glowArray([[xs - 4.4 * s, 0, 0, 1, 0.55, 0.2, 80]]));
        r.drawGlow(engine, null, { gain: 0.9 });
        labels.put("station", "station clock", [-8.5, 4.3, 0]);
        labels.put("ship", "ship clock", [xs - 1.6 * s, 1.5, 0.4]);
      }
    };
  }

  // ---------- scene 2: starlight, as the sky (aberration) or the spectrum (Doppler) ----------
  function lightScene(r, labels) {
    var stars = skyStars();
    var sky = r.glowMesh(glowArray([[0, 0, 0, 0, 0, 0, 0]]));
    var zs = [2.3, 0, -2.3];
    var ribbons = [r.mesh(new G.Geo()), r.mesh(new G.Geo()), r.mesh(new G.Geo())];

    // Each star is moved to where the crew sees it, and coloured by its Doppler factor.
    function updateSky() {
      var list = [];
      stars.forEach(function (s) {
        var cR = s.d[0], cO = (cR + beta) / (1 + beta * cR);
        var sR = Math.sqrt(Math.max(0, 1 - cR * cR)), sO = Math.sqrt(Math.max(0, 1 - cO * cO));
        var k = sR > 1e-9 ? sO / sR : 0;
        var delta = P.frequencyFactor(beta, cR);
        var T = s.T * delta, I = s.b * Math.min(4, delta * delta);
        if (T < 1500) I *= T / 1500;
        var c = bbColor(T), b = Math.min(1, 0.25 + I);
        list.push([SKY_R * cO, SKY_R * s.d[1] * k, SKY_R * s.d[2] * k, c[0] * b, c[1] * b, c[2] * b, 1.2 + 2.6 * Math.sqrt(I)]);
      });
      var sign = lightView === "behind" ? -1 : 1;
      for (var i = 0; i < 120; i++) {
        var ph = i / 120 * PI2;
        list.push([SKY_R * sign * C45, SKY_R * C45 * Math.cos(ph), SKY_R * C45 * Math.sin(ph), 0.5, 0.9, 1.0, 3.4]);
      }
      r.updateGlow(sky, glowArray(list));
    }
    // The spectrum: three bands (ahead, at rest, behind), with the hydrogen lines dipping
    // to their observed wavelengths.
    function updateSpectrum() {
      var rows = [P.dopplerBow(beta), 1, P.dopplerStern(beta)];
      rows.forEach(function (f, idx) {
        var lines = H.LINES.map(function (L) { return L.nm * f; });
        var geo = new G.Geo(), n = 320, z = zs[idx], samples = [];
        for (var i = 0; i < n; i++) {
          var nm = 100 * Math.pow(10, i / (n - 1) * Math.log10(50));
          var x = -6 + 12 * i / (n - 1), c = spectrumColor(nm), dip = 1;
          for (var j = 0; j < lines.length; j++) {
            var w = 0.0035 * lines[j], e = (nm - lines[j]) / w;
            if (Math.abs(e) < 4) dip *= 1 - 0.85 * Math.exp(-0.5 * e * e);
          }
          samples.push({ x: x, c: [c[0] * dip, c[1] * dip, c[2] * dip] });
        }
        for (i = 0; i < n - 1; i++) {
          var a = samples[i], b = samples[i + 1];
          geo.quad(vtx([a.x, 0, z - 0.45], a.c), vtx([a.x, 0, z + 0.45], a.c),
                   vtx([b.x, 0, z + 0.45], b.c), vtx([b.x, 0, z - 0.45], b.c));
        }
        r.setArray(ribbons[idx], geo.data(), 9);
      });
    }

    return {
      update: function () { if (lightView === "spectrum") updateSpectrum(); else updateSky(); },
      draw: function () {
        if (lightView === "spectrum") {
          r.camera([0, 8.2, 11.5], [0, 0, 0.2], 42);
          r.begin();
          ribbons.forEach(function (m) { r.drawEmit(m, null, { gain: 1 }); });
          ["ahead", "at rest", "behind"].forEach(function (name, idx) { labels.put("row" + idx, name, [6.5, 0.2, zs[idx]]); });
          [100, 1000, 5000].forEach(function (nm) {
            labels.put("tick" + nm, nm + " nm", [-6 + 12 * Math.log10(nm / 100) / Math.log10(50), 0, 3.7]);
          });
        } else {
          var sign = lightView === "behind" ? -1 : 1;
          r.camera([0, 0, 0], [sign, 0, 0], 96, [0, 1, 0]);
          r.begin();
          r.drawGlow(sky, null, { gain: 1 });
          labels.put("ring", "45" + DEG, [SKY_R * sign * C45, SKY_R * C45, 0]);
          labels.put("centre", sign > 0 ? "straight ahead" : "straight behind", [SKY_R * sign, 0, 0]);
        }
      }
    };
  }

  // ---------- scene 3: the speed limit ----------
  function speedScene(r, labels) {
    var track = r.mesh(tubeGeo(-6.2, 6.2, 0.03, COL.grey));
    var wallG = new G.Geo();
    G.box(wallG, 4.8, 1.4, 0, 0.03, 2.6, 2.0, COL.red);
    G.box(wallG, -4.8, 1.4, 0, 0.03, 2.6, 2.0, COL.red);
    var walls = r.mesh(wallG);
    // The barrier is the two thin sheets; beyond them the pod's speed is shown by its sparks.
    var shipM = r.mesh(sphereGeo(0.42, COL.blue));
    var podU = r.mesh(sphereGeo(0.3, COL.white));
    var podS = r.mesh(sphereGeo(0.3, COL.red));
    var arrows = {
      ship: { body: r.mesh(arrowBodyGeo(COL.blue)), head: r.mesh(arrowHeadGeo(COL.blue)) },
      simple: { body: r.mesh(arrowBodyGeo(COL.amber)), head: r.mesh(arrowHeadGeo(COL.amber)) },
      relative: { body: r.mesh(arrowBodyGeo(COL.white)), head: r.mesh(arrowHeadGeo(COL.white)) }
    };
    var flash = r.glowMesh(glowArray([[0, 0, 0, 0, 0, 0, 0]]));
    function X(v) { return v / 1.25 * 6; }
    // An arrow from x0 to x1 at height y. The head sits at x1, so a negative arrow points back.
    function arrow(a, x0, x1, y) {
      var L = x1 - x0;
      if (Math.abs(L) < 1e-6) return;
      var sg = L > 0 ? 1 : -1;
      r.drawLit(a.body, mul(translate(x0, y, 0), G.scaleXYZ(L, 1, 1)), {});
      r.drawLit(a.head, mul(translate(x1 - 0.45 * sg, y, 0), G.scaleXYZ(sg, 1, 1)), {});
    }
    return {
      update: function () {},
      draw: function () {
        r.camera([0, 4.0, 10.8], [0, 0.5, 0], 46);
        r.begin();
        r.drawEmit(track, null, { gain: 0.9 });
        r.drawEmit(walls, null, { alpha: 0.35, gain: 1.1 });
        var u = E.combinedSpeed(beta, pod), simple = E.simpleSum(beta, pod);
        arrow(arrows.ship, X(0), X(beta), 1.1);
        arrow(arrows.simple, X(beta), X(simple), 0.7);
        arrow(arrows.relative, X(0), X(u), 0.3);
        r.drawLit(shipM, translate(X(beta), 0, 0), {});
        r.drawLit(podU, translate(X(u), 0, 0), { emit: [0.25, 0.22, 0.1] });
        var beyond = Math.abs(simple) > 1;
        r.drawLit(podS, translate(X(simple), 0, 0), { alpha: beyond ? 0.55 : 1, emit: [0.2, 0.04, 0.02] });
        if (beyond) {
          // sparks along the barrier the simple pod has crossed
          var sg = simple > 0 ? 1 : -1, list = [];
          for (var i = 0; i < 9; i++) {
            var y = 0.3 + i * 0.27, pulse = 0.6 + 0.4 * Math.sin(clockT * 8 + i);
            list.push([X(sg), y, 0, 1.0 * pulse, 0.45 * pulse, 0.2 * pulse, 30]);
          }
          r.updateGlow(flash, glowArray(list));
          r.drawGlow(flash, null, { gain: 1 });
        }
        labels.put("ship", "ship " + f2(beta) + "c", [X(beta), 2.0, 0]);
        labels.put("simple", "simple " + f2(simple) + "c" + (beyond ? " (past c)" : ""), [Math.min(X(simple), 6.2), 1.35, 0]);
        labels.put("relative", "relativity " + f2(u) + "c", [X(u), -0.9, 0.4]);
        labels.put("cplus", "c", [4.8, 3.0, 0]);
        labels.put("cminus", MINUS + "c", [-4.8, 3.0, 0]);
      }
    };
  }

  // ---------- scene 4: muons in the ice shield ----------
  function muonScene(r, labels) {
    var ice = r.mesh(iceGeo());
    var strip = r.mesh(boxGeo(0, 1.58, 0, 12.4, 0.06, 0.18, COL.cyan));
    var rings = r.mesh(countersGeo());
    var unit = r.mesh(boxGeo(0, 0, 0, 1, 1, 1, COL.amber));
    var parts = r.glowMesh(glowArray([[0, 0, 0, 0, 0, 0, 0]]));
    var base = 1.62, maxH = 3.4;
    return {
      update: function () {},
      draw: function () {
        r.camera([0.6, 5.4, 18.5], [0, 0.2, 0], 42);
        r.begin();
        r.drawLit(ice, null, { spec: 0.9 });
        r.drawEmit(strip, null, { gain: 1.3 });
        r.drawEmit(rings, null, { gain: 1.2 });
        // one bar per counter: the fraction of muons that reached it
        CNT.forEach(function (d, k) {
          var f = muons.N ? muons.passed[k] / muons.N : 0, h = Math.max(0.02, f * maxH);
          r.drawLit(unit, mul(translate(xOf(d), base + h / 2, 0), G.scaleXYZ(0.5, h, 0.5)), { emit: [0.2, 0.11, 0.03] });
          labels.put("c" + k, d + " m", [xOf(d), -2.1, 0]);
        });
        // the prediction curve, the muons in flight, and a flash where one decays
        var list = [], i;
        for (i = 0; i < 90; i++) {
          var d2 = i / 89 * CH;
          list.push([xOf(d2), base + E.surviveFraction(d2, beta) * maxH, 0, 0.45, 0.9, 1.0, 6]);
        }
        muons.list.forEach(function (m) { list.push([xOf(m.x), base + 0.04, 0, 1.0, 0.85, 0.45, 20]); });
        muons.flashes.forEach(function (fl) {
          var t = fl.age / FLASH_S, k2 = 1 - t;
          list.push([xOf(fl.x), base + 0.04, 0, k2, 0.35 * k2, 0.2 * k2, 18 + 48 * t]);
        });
        r.updateGlow(parts, glowArray(list));
        r.drawGlow(parts, null, { gain: 1 });
      }
    };
  }

  // ---------- the muon count (same logic as the numbers in explore.js) ----------
  function resetMuons() {
    muons.list = []; muons.N = 0; muons.passed = CNT.map(function () { return 0; }); muons.flashes = []; muons.acc = 0;
  }
  // Adds n muons at once, for people who do not want to wait for the animation.
  function fire(n) {
    var ds = [];
    for (var i = 0; i < n; i++) ds.push(E.decayDistanceM(beta, 1 - Math.random()));
    E.countPassed(ds, CNT).forEach(function (v, k) { muons.passed[k] += v; });
    muons.N += n;
  }
  // A muon is counted once it is resolved (it decays or leaves the channel), so every bar uses the same total.
  function stepMuons(dt) {
    muons.acc += dt * SPAWN_RATE;
    while (muons.acc >= 1) {
      muons.acc -= 1;
      muons.list.push({ x: 0, d: E.decayDistanceM(beta, 1 - Math.random()), next: 0, hits: CNT.map(function () { return 0; }) });
    }
    muons.list = muons.list.filter(function (m) {
      m.x += FLY_SPEED * dt;
      while (m.next < CNT.length && m.x >= CNT[m.next] && m.d >= CNT[m.next]) { m.hits[m.next] = 1; m.next++; }
      var decayed = m.x >= m.d, exited = m.x >= CH;
      if (!decayed && !exited) return true;
      if (decayed) muons.flashes.push({ x: m.d, age: 0 });
      m.hits.forEach(function (h, k) { muons.passed[k] += h; });
      muons.N++;
      return false;
    });
    muons.flashes.forEach(function (f) { f.age += dt; });
    muons.flashes = muons.flashes.filter(function (f) { return f.age < FLASH_S; });
  }

  // ---------- readouts: the numbers, from the same model ----------
  function readouts() {
    var g = P.gamma(beta), k = 1 / g;
    $("read-clocks").textContent =
      "On the ship, 1 s passes while the station sees " + f2(g) + " s.\n" +
      "Seen from the station, the ship is " + f2(k) + " of its length at rest.\n" +
      "Solid ship: as the station measures it. Ghost: its length at rest.";
    if (lightView === "spectrum") {
      var ha = H.find("H-alpha").nm;
      $("read-light").textContent = "H" + ALPHA + " is " + Math.round(ha) + " nm at rest.\n" +
        "Ahead: " + Math.round(ha * P.dopplerBow(beta)) + " nm.   Behind: " + Math.round(ha * P.dopplerStern(beta)) + " nm.";
    } else {
      var sign = lightView === "behind" ? -1 : 1;
      $("read-light").textContent = "Inside the 45" + DEG + " ring: " + pct(P.fractionWithin(beta, 45, sign)) +
        " of stars (" + pct(P.fractionWithin(0, 45, sign)) + " at rest).";
    }
    var u = E.combinedSpeed(beta, pod), simple = E.simpleSum(beta, pod);
    $("read-speed").textContent = "Relativity: (" + f2(beta) + " + " + f2(pod) + ") / (1 + " + f2(beta) + " " + TIMES + " " + f2(pod) + ") = " + f2(u) + "c.\n" +
      "Adding the simple way gives " + f2(simple) + "c" + (simple >= 1 ? ", faster than light." : ".");
    var L = E.decayLengthM(beta), meas = muons.N ? muons.passed[4] / muons.N : 0, pred = E.surviveFraction(1000, beta);
    $("read-muons").textContent = "Decay length " + Math.round(L) + " m.   Muons counted: " + muons.N + ".\n" +
      (muons.N ? "Reaching 1000 m: " + pct(meas) + " measured, " + pct(pred) + " predicted."
               : "Fire 100 muons, or let them fly, and the bars fill in.");
  }

  // ---------- set-up ----------
  var noGL = false;
  function initScene(canvasId, labelsId, make) {
    try {
      var r = new G.Renderer($(canvasId));
      var labels = new Labels($(labelsId), r);
      var s = make(r, labels);
      s.r = r; s.labels = labels;
      return s;
    } catch (e) {
      noGL = true;
      if (window.console) console.error(e);
      return null;
    }
  }
  var scenes = [
    initScene("scene-clocks", "labels-clocks", clocksScene),
    initScene("scene-light", "labels-light", lightScene),
    initScene("scene-speed", "labels-speed", speedScene),
    initScene("scene-muons", "labels-muons", muonScene)
  ].filter(Boolean);
  if (noGL) $("gl-note").hidden = false;

  function draw() {
    if (dirty) { scenes.forEach(function (s) { s.update(); }); dirty = false; }
    scenes.forEach(function (s) { s.r.resize(); s.labels.reset(); s.draw(); });
    readouts();
  }

  function setBeta(b) {
    beta = b; dirty = true;
    $("beta-out").textContent = f2(beta);
    $("gamma-out").textContent = GAMMA + " = " + f2(P.gamma(beta));
    resetMuons();
  }
  $("beta").addEventListener("input", function () { setBeta(+this.value); });
  $("pod").addEventListener("input", function () {
    pod = +this.value; $("pod-out").textContent = f2(pod) + "c";
  });
  $("light-view").addEventListener("change", function () {
    lightView = this.value; dirty = true;
  });
  $("fire").addEventListener("click", function () { fire(100); });
  $("clear").addEventListener("click", function () { resetMuons(); });
  window.addEventListener("resize", draw);

  var last = null;
  function frame(now) {
    var dt = last === null ? 0 : Math.min(0.05, (now - last) / 1000);
    last = now;
    clockT += dt;
    stepMuons(dt);
    draw();
    window.requestAnimationFrame(frame);
  }

  pod = +$("pod").value;
  $("pod-out").textContent = f2(pod) + "c";
  lightView = $("light-view").value;
  setBeta(+$("beta").value);
  // These animations demonstrate the physics even when the desktop requests reduced motion.
  window.requestAnimationFrame(frame);
})();
