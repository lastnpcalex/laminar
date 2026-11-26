/* Dead Reckoning: sky chart. What the crew sees looking straight ahead or straight
 * behind, drawn as a dome: the center is straight ahead, the outer edge is 90 degrees
 * away, and the dashed ring is 45 degrees out. WebGL draws the stars when it is
 * available and 2D canvas otherwise; the ring and labels are a 2D overlay.
 * The chart is an illustration. Every measurement comes from a panel readout. */
(function (root) {
  "use strict";
  var DR = root.DR;
  var P = DR.physics;
  var DOME = 0.9;               // dome radius as a fraction of half the screen height
  var HALF_PI = Math.PI / 2;
  var N_STARS = 2600;

  // ---------- star catalog (same sky for every team) ----------
  function makeSky(n) {
    var r = DR.rng.makeRng(1, "sky", 0), stars = [];
    for (var i = 0; i < n; i++) {
      var z = 2 * r.uniform() - 1, phi = 2 * Math.PI * r.uniform(), s = Math.sqrt(1 - z * z);
      stars.push({ d: [s * Math.cos(phi), s * Math.sin(phi), z],
                   T: Math.exp(r.range(Math.log(3000), Math.log(25000))),
                   b: Math.pow(r.uniform(), 3) * 0.9 + 0.1 });
    }
    return stars;
  }

  // Approximate blackbody color (T in kelvin), components 0..1.
  function bbColor(T) {
    var t = Math.min(40000, Math.max(1000, T)) / 100, r, g, b;
    r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = t >= 66 ? 255 : (t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307);
    return [r, g, b].map(function (v) { return Math.min(255, Math.max(0, v)) / 255; });
  }

  // What the crew sees: each star's direction in the ship's frame, and its color.
  // The frequency factor is above 1 (bluer, brighter) for most of the sky and below 1
  // (redder, dimmer) only toward the stern.
  function appearance(stars, beta) {
    return stars.map(function (s) {
      var c = s.d[2], cObs = beta ? P.aberrate(beta, c) : c;
      var sinR = Math.sqrt(Math.max(0, 1 - c * c)), sinO = Math.sqrt(Math.max(0, 1 - cObs * cObs));
      var k = sinR > 1e-9 ? sinO / sinR : 0;
      var delta = P.frequencyFactor(beta, c);
      var T = s.T * delta, I = s.b * Math.min(4, delta * delta);
      if (T < 1500) I *= T / 1500;                   // shifted mostly into the infrared
      return { d: [s.d[0] * k, s.d[1] * k, cObs], col: bbColor(T), I: I };
    });
  }

  var STAR_VS = [
    "attribute vec3 aDir; attribute vec3 aCol; attribute float aSize;",
    "uniform float uSign; uniform float uAspect; uniform float uScale;",
    "varying vec3 vCol;",
    "void main() {",
    "  float zf = uSign * aDir.z;",
    "  if (zf <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vCol = vec3(0.0); return; }",
    "  float r = acos(min(zf, 1.0)) / 1.5707963;",
    "  float phi = atan(aDir.y, aDir.x);",
    "  gl_Position = vec4(" + DOME + " * r * cos(phi) * uAspect, " + DOME + " * r * sin(phi), 0.0, 1.0);",
    "  gl_PointSize = aSize * uScale;",
    "  vCol = aCol;",
    "}"
  ].join("\n");
  var STAR_FS = "precision mediump float; varying vec3 vCol; void main() { vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0) discard; gl_FragColor = vec4(vCol * (1.0 - r * r), 1.0); }";

  function View(canvas, overlay, summary) {
    this.canvas = canvas; this.overlay = overlay; this.summary = summary;
    this.sky = makeSky(N_STARS);
    this.beta = null; this.mode = "bow"; this.enabled = true; this.dirty = true;
    this.gl = null; this.broken = false; this.app = null; this.dpr = 1;
    try { this.initGL(); } catch (e) { this.gl = null; }
    var self = this;
    canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); self.gl = null; self.dirty = true; self.safeDraw(); });
    window.addEventListener("resize", function () { self.safeDraw(); });
  }

  View.prototype.initGL = function () {
    var gl = this.canvas.getContext("webgl", { antialias: true, alpha: false });
    if (!gl) return;
    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, STAR_VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, STAR_FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    this.prog = prog;
    this.buf = gl.createBuffer();
    this.gl = gl;
  };

  // A ship at rest is shown until a team code sets the speed.
  View.prototype.effectiveBeta = function () { return this.mode === "rest" || this.beta === null ? 0 : this.beta; };

  View.prototype.upload = function () {
    this.app = appearance(this.sky, this.effectiveBeta());
    if (this.gl) {
      var gl = this.gl, data = new Float32Array(this.app.length * 7);
      this.app.forEach(function (s, i) {
        var b = Math.min(1, 0.25 + s.I);
        data.set([s.d[0], s.d[1], s.d[2], s.col[0] * b, s.col[1] * b, s.col[2] * b, 1.2 + 2.6 * Math.sqrt(s.I)], i * 7);
      });
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    }
    this.dirty = false;
  };

  View.prototype.updateSummary = function () {
    var pct = function (x) { return Math.round(x * 100) + "%"; };
    if (this.beta === null) { this.summary.textContent = "Enter a team code to see your ship's sky. Until then, the sky shows a ship at rest."; return; }
    var b = this.effectiveBeta();
    if (this.mode === "rest") {
      this.summary.textContent = "Ship at rest: " + pct(P.fractionWithin(0, 45, 1)) + " of stars lie inside the 45° ring.";
    } else if (this.mode === "bow") {
      this.summary.textContent = "Ahead of the ship: " + pct(P.fractionWithin(b, 45, 1)) + " of stars lie inside the 45° ring (" +
        pct(P.fractionWithin(0, 45, 1)) + " at rest).";
    } else {
      this.summary.textContent = "Behind the ship: " + pct(P.fractionWithin(b, 45, -1)) + " of stars lie inside the 45° ring (" +
        pct(P.fractionWithin(0, 45, -1)) + " at rest).";
    }
  };

  View.prototype.drawGL = function () {
    var gl = this.gl, w = this.canvas.width, h = this.canvas.height;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    var F = 4, p = this.prog;
    var aDir = gl.getAttribLocation(p, "aDir"), aCol = gl.getAttribLocation(p, "aCol"), aSize = gl.getAttribLocation(p, "aSize");
    gl.enableVertexAttribArray(aDir); gl.vertexAttribPointer(aDir, 3, gl.FLOAT, false, 7 * F, 0);
    gl.enableVertexAttribArray(aCol); gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 7 * F, 3 * F);
    gl.enableVertexAttribArray(aSize); gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, 7 * F, 6 * F);
    gl.uniform1f(gl.getUniformLocation(p, "uSign"), this.mode === "stern" ? -1 : 1);
    gl.uniform1f(gl.getUniformLocation(p, "uAspect"), h / w);
    gl.uniform1f(gl.getUniformLocation(p, "uScale"), this.dpr);
    gl.drawArrays(gl.POINTS, 0, this.app.length);
    gl.disableVertexAttribArray(aDir); gl.disableVertexAttribArray(aCol); gl.disableVertexAttribArray(aSize);
  };

  // Same geometry as the shader: angle from the centre maps to radius linearly.
  View.prototype.draw2d = function () {
    var ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    var w = this.canvas.width, h = this.canvas.height, dpr = this.dpr;
    var R = DOME * h / 2, cx = w / 2, cy = h / 2, sign = this.mode === "stern" ? -1 : 1;
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
    this.app.forEach(function (s) {
      var zf = sign * s.d[2];
      if (zf <= 0) return;
      var r = Math.acos(Math.min(zf, 1)) / HALF_PI, phi = Math.atan2(s.d[1], s.d[0]);
      var px = cx + R * r * Math.cos(phi), py = cy - R * r * Math.sin(phi);
      var b = Math.min(1, 0.25 + s.I);
      ctx.fillStyle = "rgb(" + Math.round(s.col[0] * b * 255) + "," + Math.round(s.col[1] * b * 255) + "," + Math.round(s.col[2] * b * 255) + ")";
      var q = (0.6 + 1.3 * Math.sqrt(s.I)) * dpr;
      ctx.fillRect(px - q, py - q, 2 * q, 2 * q);
    });
  };

  View.prototype.drawOverlay = function () {
    var c = this.overlay, ctx = c.getContext("2d");
    var w = c.width, h = c.height, dpr = this.dpr;
    var R = DOME * h / 2, cx = w / 2, cy = h / 2;
    var css = getComputedStyle(document.documentElement);
    var accent = css.getPropertyValue("--plot2").trim() || "#7fd8ff";
    var dim = css.getPropertyValue("--dim").trim() || "#d7a35a";
    var family = getComputedStyle(this.canvas).fontFamily || "monospace";
    ctx.clearRect(0, 0, w, h);
    function ring(rad, colour, dash, width) {
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 2 * Math.PI);
      ctx.setLineDash(dash); ctx.strokeStyle = colour; ctx.lineWidth = width * dpr; ctx.stroke();
    }
    ring(R, dim, [], 1);                              // 90 degrees
    ring(R * 0.5, accent, [6 * dpr, 5 * dpr], 2);     // 45 degrees
    ctx.setLineDash([]);
    ctx.beginPath();                                  // crosshair at the center
    ctx.moveTo(cx - 8 * dpr, cy); ctx.lineTo(cx + 8 * dpr, cy);
    ctx.moveTo(cx, cy - 8 * dpr); ctx.lineTo(cx, cy + 8 * dpr);
    ctx.strokeStyle = dim; ctx.lineWidth = dpr; ctx.stroke();
    ctx.font = (13 * dpr) + "px " + family;
    // Each label sits on a dark backing so it reads over the stars.
    function tag(text, x, y, align, colour) {
      var tw = ctx.measureText(text).width, pad = 3 * dpr, h = 17 * dpr;
      var left = align === "center" ? x - tw / 2 : x;
      ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
      ctx.fillRect(left - pad, y, tw + 2 * pad, h);
      ctx.fillStyle = colour; ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillText(text, left, y + 1 * dpr);
    }
    tag("45°", cx + R * 0.5 + 4 * dpr, cy - 22 * dpr, "left", accent);
    tag("90°", cx + R + 4 * dpr, cy - 22 * dpr, "left", dim);
    tag(this.mode === "stern" ? "behind" : "ahead", cx, cy + 10 * dpr, "center", dim);
  };

  // Resizes both canvases to the screen, then redraws stars and overlay.
  View.prototype.draw = function () {
    if (!this.enabled || !this.canvas.clientWidth) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var w = Math.max(320, Math.round(this.canvas.clientWidth * dpr));
    var h = Math.max(180, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
      this.overlay.width = w; this.overlay.height = h;
      this.dirty = true;
    }
    this.dpr = dpr;
    if (this.dirty) this.upload();
    this.updateSummary();
    if (this.gl) this.drawGL(); else this.draw2d();
    this.drawOverlay();
  };

  View.prototype.safeDraw = function () {
    if (this.broken) return;
    try { this.draw(); }
    catch (e) {
      this.broken = true;
      this.summary.textContent = "The sky view could not be drawn on this computer. All instruments still work.";
      if (window.console) console.error(e);
    }
  };

  View.prototype.setBeta = function (b) { this.beta = b; this.dirty = true; this.safeDraw(); };
  View.prototype.setMode = function (m) { this.mode = m; this.dirty = true; this.safeDraw(); };
  View.prototype.setEnabled = function (on) { this.enabled = on; this.safeDraw(); };

  DR.View = View;
})(typeof globalThis !== "undefined" ? globalThis : this);
