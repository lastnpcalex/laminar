/* Dead Reckoning: a small WebGL toolkit for the explore pictures. It draws lit solids
 * (ice, hulls, rings) with a directional light and a rim light, unlit colour, translucent
 * surfaces, and additive glow points. No dependencies. Scene units are chosen by the
 * scene that uses the toolkit. */
(function (root, factory) {
  var DR = root.DR || (root.DR = {});
  DR.gl3d = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // ---------- matrices: column-major, as WebGL expects ----------
  function ident() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }

  function mul(a, b) {
    var o = new Float32Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      var s = 0;
      for (var k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
    return o;
  }
  function translate(x, y, z) { var m = ident(); m[12] = x; m[13] = y; m[14] = z; return m; }
  function scaleXYZ(x, y, z) { var m = ident(); m[0] = x; m[5] = y; m[10] = z; return m; }
  function rotZ(a) {
    var c = Math.cos(a), s = Math.sin(a), m = ident();
    m[0] = c; m[1] = s; m[4] = -s; m[5] = c;
    return m;
  }
  function perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far), m = new Float32Array(16);
    m[0] = f / aspect; m[5] = f; m[10] = (far + near) * nf; m[11] = -1; m[14] = 2 * far * near * nf;
    return m;
  }
  function norm(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function lookAt(eye, target, up) {
    var z = norm([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
    var x = norm(cross(up, z)), y = cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
      -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
  }
  function applyM(m, p) {
    return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
            m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
            m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
            m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15]];
  }
  // Normal matrix: inverse transpose of the model's upper 3x3, so normals stay right when
  // the model is squeezed (length contraction). Cofactors divided by the determinant.
  function normal3(m) {
    var a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
    var det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    if (Math.abs(det) < 1e-12) return new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    var k = 1 / det;
    return new Float32Array([
      (e * i - f * h) * k, (c * h - b * i) * k, (b * f - c * e) * k,
      (f * g - d * i) * k, (a * i - c * g) * k, (c * d - a * f) * k,
      (d * h - e * g) * k, (b * g - a * h) * k, (a * e - b * d) * k
    ]);
  }

  // ---------- geometry (CPU side). Lit vertex: position(3), normal(3), colour(3). ----------
  function V(p, n, c) { return [p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2]]; }
  function Geo() { this.v = []; }
  Geo.prototype.tri = function (a, b, c) {
    for (var i = 0; i < 9; i++) this.v.push(a[i]);
    for (i = 0; i < 9; i++) this.v.push(b[i]);
    for (i = 0; i < 9; i++) this.v.push(c[i]);
  };
  Geo.prototype.quad = function (a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); };
  Geo.prototype.data = function () { return new Float32Array(this.v); };

  // A tube along the x axis from x0 to x1, radius r0 to r1 (r1 = 0 makes a cone).
  function tubeX(g, r0, r1, x0, x1, seg, col, caps) {
    var dr = (r1 - r0) / (x1 - x0);
    for (var i = 0; i < seg; i++) {
      var t0 = i / seg * 2 * Math.PI, t1 = (i + 1) / seg * 2 * Math.PI;
      var c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
      var n0 = norm([-dr, c0, s0]), n1 = norm([-dr, c1, s1]);
      g.quad(V([x0, r0 * c0, r0 * s0], n0, col), V([x0, r0 * c1, r0 * s1], n1, col),
             V([x1, r1 * c1, r1 * s1], n1, col), V([x1, r1 * c0, r1 * s0], n0, col));
    }
    if (caps) {
      if (r0 > 0) discX(g, r0, x0, -1, seg, col);
      if (r1 > 0) discX(g, r1, x1, 1, seg, col);
    }
  }
  function discX(g, r, x, sign, seg, col) {
    var n = [sign, 0, 0];
    for (var i = 0; i < seg; i++) {
      var t0 = i / seg * 2 * Math.PI, t1 = (i + 1) / seg * 2 * Math.PI;
      g.tri(V([x, 0, 0], n, col), V([x, r * Math.cos(t0), r * Math.sin(t0)], n, col),
            V([x, r * Math.cos(t1), r * Math.sin(t1)], n, col));
    }
  }
  // A ring around the x axis, centred at x = cx: major radius R, tube radius r.
  function torusX(g, R, r, cx, seg, segT, col) {
    function P(a, b) { return [cx + r * Math.sin(b), (R + r * Math.cos(b)) * Math.cos(a), (R + r * Math.cos(b)) * Math.sin(a)]; }
    function N(a, b) { return [Math.sin(b), Math.cos(b) * Math.cos(a), Math.cos(b) * Math.sin(a)]; }
    for (var i = 0; i < seg; i++) for (var j = 0; j < segT; j++) {
      var a0 = i / seg * 2 * Math.PI, a1 = (i + 1) / seg * 2 * Math.PI;
      var b0 = j / segT * 2 * Math.PI, b1 = (j + 1) / segT * 2 * Math.PI;
      g.quad(V(P(a0, b0), N(a0, b0), col), V(P(a1, b0), N(a1, b0), col),
             V(P(a1, b1), N(a1, b1), col), V(P(a0, b1), N(a0, b1), col));
    }
  }
  function sphere(g, r, seg, col) {
    var rings = Math.max(4, Math.round(seg / 2));
    function P(th, ph) { return [r * Math.sin(th) * Math.cos(ph), r * Math.cos(th), r * Math.sin(th) * Math.sin(ph)]; }
    for (var i = 0; i < rings; i++) for (var j = 0; j < seg; j++) {
      var t0 = i / rings * Math.PI, t1 = (i + 1) / rings * Math.PI;
      var p0 = j / seg * 2 * Math.PI, p1 = (j + 1) / seg * 2 * Math.PI;
      var a = P(t0, p0), b = P(t1, p0), c = P(t1, p1), d = P(t0, p1);
      g.quad(V(a, norm(a), col), V(b, norm(b), col), V(c, norm(c), col), V(d, norm(d), col));
    }
  }
  // A box centred at (cx, cy, cz) with sizes sx, sy, sz.
  function box(g, cx, cy, cz, sx, sy, sz, col) {
    var x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    var faces = [
      [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]],
      [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]],
      [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0]],
      [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]],
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]],
      [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [0, 0, -1]]
    ];
    faces.forEach(function (f) {
      var n = f[4];
      g.quad(V(f[0], n, col), V(f[1], n, col), V(f[2], n, col), V(f[3], n, col));
    });
  }
  // A flat disc in the xy plane, facing +z.
  function discZ(g, r, seg, col) {
    var n = [0, 0, 1];
    for (var i = 0; i < seg; i++) {
      var t0 = i / seg * 2 * Math.PI, t1 = (i + 1) / seg * 2 * Math.PI;
      g.tri(V([0, 0, 0], n, col), V([r * Math.cos(t0), r * Math.sin(t0), 0], n, col), V([r * Math.cos(t1), r * Math.sin(t1), 0], n, col));
    }
  }

  // ---------- shaders ----------
  var LIT_VS = [
    "attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol;",
    "uniform mat4 uMVP; uniform mat4 uModel; uniform mat3 uNM;",
    "varying vec3 vN; varying vec3 vP; varying vec3 vC;",
    "void main() {",
    "  vec4 wp = uModel * vec4(aPos, 1.0);",
    "  vP = wp.xyz; vN = uNM * aNor; vC = aCol;",
    "  gl_Position = uMVP * vec4(aPos, 1.0);",
    "}"
  ].join("\n");
  var LIT_FS = [
    "precision mediump float;",
    "varying vec3 vN; varying vec3 vP; varying vec3 vC;",
    "uniform vec3 uLight; uniform vec3 uEye; uniform vec3 uEmit; uniform float uAlpha; uniform float uSpec;",
    "void main() {",
    "  vec3 n = normalize(vN);",
    "  vec3 l = normalize(uLight);",
    "  vec3 v = normalize(uEye - vP);",
    "  float diff = max(dot(n, l), 0.0);",
    "  float spec = pow(max(dot(n, normalize(l + v)), 0.0), 36.0) * uSpec;",
    "  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);",
    "  vec3 col = vC * (0.20 + 0.85 * diff) + vec3(spec) + rim * vec3(0.20, 0.35, 0.55) + uEmit;",
    "  gl_FragColor = vec4(col, uAlpha);",
    "}"
  ].join("\n");
  var EMIT_VS = [
    "attribute vec3 aPos; attribute vec3 aCol;",
    "uniform mat4 uMVP; varying vec3 vC;",
    "void main() { vC = aCol; gl_Position = uMVP * vec4(aPos, 1.0); }"
  ].join("\n");
  var EMIT_FS = [
    "precision mediump float; varying vec3 vC; uniform float uGain; uniform float uAlpha;",
    "void main() { gl_FragColor = vec4(vC * uGain, uAlpha); }"
  ].join("\n");
  var GLOW_VS = [
    "attribute vec3 aPos; attribute vec3 aCol; attribute float aSize;",
    "uniform mat4 uMVP; uniform float uScale; uniform float uGain; varying vec3 vC;",
    "void main() {",
    "  gl_Position = uMVP * vec4(aPos, 1.0);",
    "  gl_PointSize = aSize * uScale;",
    "  vC = aCol * uGain;",
    "}"
  ].join("\n");
  var GLOW_FS = [
    "precision mediump float; varying vec3 vC;",
    "void main() {",
    "  vec2 d = gl_PointCoord - vec2(0.5);",
    "  float r2 = 4.0 * dot(d, d);",
    "  if (r2 > 1.0) discard;",
    "  float a = 1.0 - r2; a = a * a;",
    "  gl_FragColor = vec4(vC * a, 1.0);",
    "}"
  ].join("\n");

  function program(gl, vs, fs) {
    function sh(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  function link(gl, vs, fs, names) {
    var prog = program(gl, vs, fs), attr = {};
    names.forEach(function (n) { attr[n] = gl.getAttribLocation(prog, n); });
    return { prog: prog, attr: attr, uni: {} };
  }
  function bind(gl, pr, mesh, layout) {
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buf);
    for (var i = 0; i < layout.length; i++) {
      var loc = pr.attr[layout[i][0]];
      if (loc === undefined || loc < 0) continue;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, layout[i][1], gl.FLOAT, false, mesh.stride * 4, layout[i][2] * 4);
    }
  }
  function unbind(gl, pr) {
    for (var k in pr.attr) if (pr.attr[k] >= 0) gl.disableVertexAttribArray(pr.attr[k]);
  }
  function setBlend(gl, on) {
    if (on) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); }
    else { gl.disable(gl.BLEND); gl.depthMask(true); }
  }

  // ---------- the renderer: one per picture ----------
  function Renderer(canvas) {
    var gl = canvas.getContext("webgl", { antialias: true, alpha: false });
    if (!gl) throw new Error("WebGL is not available");
    this.gl = gl; this.canvas = canvas;
    this.lit = link(gl, LIT_VS, LIT_FS, ["aPos", "aNor", "aCol"]);
    this.emit = link(gl, EMIT_VS, EMIT_FS, ["aPos", "aCol"]);
    this.glow = link(gl, GLOW_VS, GLOW_FS, ["aPos", "aCol", "aSize"]);
    this.light = norm([-0.45, 0.8, 0.55]);
    this.eye = [0, 0, 0];
    this.view = ident(); this.proj = ident(); this.vp = ident();
    this.cssW = 600; this.cssH = 338; this.dpr = 1;
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
  }

  // Sizes the drawing buffer to the canvas, at 16:9, in device pixels.
  Renderer.prototype.resize = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(240, this.canvas.clientWidth || 600), h = Math.round(w * 9 / 16);
    var pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (this.canvas.width !== pw || this.canvas.height !== ph) { this.canvas.width = pw; this.canvas.height = ph; }
    this.cssW = w; this.cssH = h; this.dpr = dpr;
  };
  Renderer.prototype.camera = function (eye, target, fovDeg, up) {
    this.eye = eye;
    this.view = lookAt(eye, target, up || [0, 1, 0]);
    this.proj = perspective(fovDeg * Math.PI / 180, this.cssW / this.cssH, 0.05, 5000);
    this.vp = mul(this.proj, this.view);
  };
  Renderer.prototype.begin = function () {
    var gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  };
  Renderer.prototype.uni = function (pr, name) {
    if (!(name in pr.uni)) pr.uni[name] = this.gl.getUniformLocation(pr.prog, name);
    return pr.uni[name];
  };

  // Meshes: lit/emit meshes from a Geo (stride 9); glow point sets (stride 7).
  Renderer.prototype.mesh = function (geo) {
    var gl = this.gl, buf = gl.createBuffer(), data = geo.data();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return { buf: buf, count: data.length / 9, stride: 9 };
  };
  Renderer.prototype.setArray = function (mesh, arr, stride) {
    var gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buf);
    gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW);
    mesh.count = arr.length / stride; mesh.stride = stride;
  };
  Renderer.prototype.glowMesh = function (arr) {
    var gl = this.gl, buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW);
    return { buf: buf, count: arr.length / 7, stride: 7 };
  };
  Renderer.prototype.updateGlow = function (mesh, arr) { this.setArray(mesh, arr, 7); };

  // Lit solid. alpha < 1 draws translucent. emit adds light from the surface itself.
  Renderer.prototype.drawLit = function (mesh, model, o) {
    o = o || {};
    var gl = this.gl, pr = this.lit, m = model || ident();
    var alpha = o.alpha === undefined ? 1 : o.alpha;
    gl.useProgram(pr.prog);
    setBlend(gl, alpha < 1);
    bind(gl, pr, mesh, [["aPos", 3, 0], ["aNor", 3, 3], ["aCol", 3, 6]]);
    gl.uniformMatrix4fv(this.uni(pr, "uMVP"), false, mul(this.vp, m));
    gl.uniformMatrix4fv(this.uni(pr, "uModel"), false, m);
    gl.uniformMatrix3fv(this.uni(pr, "uNM"), false, normal3(m));
    gl.uniform3fv(this.uni(pr, "uLight"), this.light);
    gl.uniform3fv(this.uni(pr, "uEye"), this.eye);
    gl.uniform3fv(this.uni(pr, "uEmit"), o.emit || [0, 0, 0]);
    gl.uniform1f(this.uni(pr, "uAlpha"), alpha);
    gl.uniform1f(this.uni(pr, "uSpec"), o.spec === undefined ? 0.5 : o.spec);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    unbind(gl, pr);
    setBlend(gl, false);
  };
  // Unlit colour, for light sources such as tracks and the barrier.
  Renderer.prototype.drawEmit = function (mesh, model, o) {
    o = o || {};
    var gl = this.gl, pr = this.emit, m = model || ident();
    var alpha = o.alpha === undefined ? 1 : o.alpha;
    gl.useProgram(pr.prog);
    setBlend(gl, alpha < 1);
    bind(gl, pr, mesh, [["aPos", 3, 0], ["aCol", 3, 6]]);
    gl.uniformMatrix4fv(this.uni(pr, "uMVP"), false, mul(this.vp, m));
    gl.uniform1f(this.uni(pr, "uGain"), o.gain === undefined ? 1 : o.gain);
    gl.uniform1f(this.uni(pr, "uAlpha"), alpha);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    unbind(gl, pr);
    setBlend(gl, false);
  };
  // Additive glow points: stars, muons, flashes, the rings of the sky.
  Renderer.prototype.drawGlow = function (mesh, model, o) {
    o = o || {};
    var gl = this.gl, pr = this.glow, m = model || ident();
    gl.useProgram(pr.prog);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
    bind(gl, pr, mesh, [["aPos", 3, 0], ["aCol", 3, 3], ["aSize", 1, 6]]);
    gl.uniformMatrix4fv(this.uni(pr, "uMVP"), false, mul(this.vp, m));
    gl.uniform1f(this.uni(pr, "uScale"), this.dpr * (o.scale || 1));
    gl.uniform1f(this.uni(pr, "uGain"), o.gain === undefined ? 1 : o.gain);
    gl.drawArrays(gl.POINTS, 0, mesh.count);
    unbind(gl, pr);
    gl.disable(gl.BLEND); gl.depthMask(true);
  };

  // Projects a world point to CSS pixels of the canvas (for text labels); null if behind the camera.
  Renderer.prototype.project = function (p) {
    var c = applyM(this.vp, [p[0], p[1], p[2]]);
    if (c[3] <= 0.0001) return null;
    return { x: (c[0] / c[3] * 0.5 + 0.5) * this.cssW, y: (0.5 - c[1] / c[3] * 0.5) * this.cssH };
  };

  return {
    ident: ident, mul: mul, translate: translate, scaleXYZ: scaleXYZ, rotZ: rotZ,
    Geo: Geo, tubeX: tubeX, torusX: torusX, sphere: sphere, box: box, discZ: discZ,
    Renderer: Renderer
  };
});
