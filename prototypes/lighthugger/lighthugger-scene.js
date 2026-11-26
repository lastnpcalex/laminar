/**
 * LighthuggerScene - multi-scale 3D space renderer (window.LighthuggerScene).
 *
 * Frame: scene axes are the SHIP frame. The Lighthugger rests at (0,0,0), bow +X, dorsal +Y,
 * starboard +Z; stern/plumes -X. The chase camera defaults to astern looking FORWARD (+X), so
 * accelerating forward piles aberrated stars up AHEAD in the centre of view, departing worlds
 * recede astern, and arriving stars swell from ahead.
 *
 * Dual-scale angular-preserving proxy projection (normal depth buffer, near 0.25 / far 40000):
 *   1 scene unit = 0.1 km inside 450 km (3.5 km ship ~ 35 u; 1.4 km station at 12 km = 14 u at 120 u).
 *   Beyond 450 km every body (planet, rings, moons, station, host star, binary, NPC) is placed at
 *   D_render in 4500..18000 along its (aberrated) true bearing, with R_render = D_render * R/d so the
 *   angular radius is exact; 1/gamma contraction along the velocity axis, Doppler tint and beaming applied.
 *   The projection is continuous in d, so nothing pops between AU, 0.001 LY and 4 LY.
 *
 * ASCII only; strings use \uXXXX escapes.
 */
(function (root) {
  'use strict';

  var RAD = Math.PI / 180;
  var UNITS_PER_KM = 10;                 // 1 scene unit = 0.1 km = 100 m
  var LOCAL_MAX_KM = 450;
  var LOCAL_MAX_UNITS = LOCAL_MAX_KM * UNITS_PER_KM;
  var SHELL_FAR = 18000;
  var SKY_R = 34000;                     // catalog starfield radius (beyond every body shell)
  var MW_R = 38000;                      // Milky Way dome radius (< camera far)
  var MARK_R = 30000;                    // sextant contact / reticle marker radius
  var CAM_NEAR = 0.60;
  var CAM_FAR = 40000;
  var LY_KM = 9.46073047e12;
  var AU_KM = 149597870.7;
  var STATION_KM = 1.4;
  var SHIP_KM = 3.5;
  var DEFAULT_YAW = Math.PI - 0.44;
  var DEFAULT_PITCH = 0.20;
  var DEFAULT_ZOOM = 0.76;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function num(v, d) { return isNum(v) ? v : d; }
  function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function norm3(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); }
  function add3(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function scale3(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function cross3(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function unit3(a) {
    var n = norm3(a);
    return n > 1e-30 ? [a[0] / n, a[1] / n, a[2] / n] : [1, 0, 0];
  }
  function arr3(v, fb) {
    if (!v) return fb || null;
    if (Array.isArray(v) && v.length >= 3 && isNum(v[0]) && isNum(v[1]) && isNum(v[2])) return [v[0], v[1], v[2]];
    if (isNum(v.x) && isNum(v.y) && isNum(v.z)) return [v.x, v.y, v.z];
    return fb || null;
  }

  // -- Photometry helpers (ported from the flight app so the scene is self-contained) --------------
  function bbColor(temp) {
    var t = clamp(temp, 650, 80000) / 100;
    if (temp < 1000) {
      var redFade = Math.exp(-2.8 * (1000 - temp) / 360);
      return [0.85 * redFade, 0.07 * redFade, 0.01 * redFade];
    }
    var r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
    var g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    var b = t >= 66 ? 255 : (t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307);
    var col = [clamp(r, 0, 255) / 255, clamp(g, 0, 255) / 255, clamp(b, 0, 255) / 255];
    if (temp > 12000) {
      var uvPush = clamp(Math.log(temp / 12000) / 2.2, 0, 0.72);
      col[0] = lerp(col[0], 0.42, uvPush);
      col[1] = lerp(col[1], 0.62, uvPush);
      col[2] = Math.max(col[2], 1.0);
    }
    return col;
  }

  function dopplerTint(Trest, D) {
    var a = bbColor(Trest * D), b = bbColor(Trest);
    var wienGain = D < 1.0 ? clamp(Math.pow(D, 1.8), 0.06, 1.0) : 1.0;
    var rt = (a[0] / Math.max(b[0], 0.02)) * wienGain;
    var gt = (a[1] / Math.max(b[1], 0.02)) * wienGain;
    var bt = (a[2] / Math.max(b[2], 0.02)) * wienGain;
    var mx = Math.max(rt, gt, bt, 1e-6);
    if (mx > 1.0) { rt /= mx; gt /= mx; bt /= mx; }
    return [clamp(rt, 0.03, 1.0), clamp(gt, 0.02, 1.0), clamp(bt, 0.02, 1.0)];
  }

  function relBeamGain(D) {
    var raw = Math.pow(clamp(D, 0.08, 6.0), 3.0);
    return raw / (1.0 + 0.28 * raw);
  }

  // Relativistic aberration: cosR = bearing in the rest (system/galaxy) frame, cosO = bearing seen
  // by the ship moving at +beta along +X. Stars/bodies pile up toward +X (ahead) as beta grows.
  function aberrateCos(beta, cosR) {
    return clamp((cosR + beta) / (1 + beta * cosR), -1, 1);
  }

  // Dual-scale radial map: true 1:1 (0.1 km/unit) inside 450 km, a smooth 4500..18000 shell beyond.
  function shellDistance(dKm) {
    var d = Math.max(dKm, 1e-6);
    var du = d * UNITS_PER_KM;
    if (du <= LOCAL_MAX_UNITS) return du;
    var t = Math.log(d / LOCAL_MAX_KM) / Math.LN10;
    return LOCAL_MAX_UNITS + (SHELL_FAR - LOCAL_MAX_UNITS) * t / (t + 4);
  }

  function fmtDist(km) {
    if (!isFinite(km)) return '--';
    if (km < 1) return (km * 1000).toFixed(0) + ' M';
    if (km < 1000) return km.toFixed(km < 10 ? 2 : 1) + ' KM';
    if (km < 1.0e7) return Math.round(km).toLocaleString('en-US') + ' KM';
    if (km < 0.02 * LY_KM) return (km / AU_KM).toFixed(2) + ' AU';
    return (km / LY_KM).toFixed(km < LY_KM ? 4 : 2) + ' LY';
  }

  function hexToRgb(hex) {
    return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
  }

  function create(canvasEl, initialState) {
    var T = root.THREE3 || root.THREE;
    var Builder = root.LighthuggerBuilder;
    var Galaxy = root.LighthuggerGalaxy;
    var Genome = root.LighthuggerGenome;
    var Orbits = root.LighthuggerOrbits;
    var C_KMS = (Orbits && Orbits.C_KMS) || 299792.458;
    var DR = root.DR || {};
    if (!T || !Builder || !Galaxy || !canvasEl) return null;
    initialState = initialState || {};

    var reducedMotionMQ = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)');
    var defaultReduced = !!(reducedMotionMQ && reducedMotionMQ.matches);

    var renderer;
    try {
      renderer = new T.WebGLRenderer({ canvas: canvasEl, antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      return null;
    }
    var gfx = {
      aa: ['off', 'fxaa', 'msaa4', 'ssaa2'].indexOf(initialState.graphics && initialState.graphics.aa) >= 0 ? initialState.graphics.aa : 'msaa4',
      renderScale: clamp(num(initialState.graphics && initialState.graphics.renderScale, 1), 0.5, 2.0),
      autoOrbit: (initialState.graphics && initialState.graphics.autoOrbit != null) ? !!initialState.graphics.autoOrbit : true
    };
    var baseDpr = Math.min(root.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(clamp(baseDpr * gfx.renderScale, 0.75, 3));
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;

    var glCtx = renderer.getContext ? renderer.getContext() : null;
    var canFloatRT = !!(renderer.capabilities && renderer.capabilities.isWebGL2 && glCtx &&
      (glCtx.getExtension('EXT_color_buffer_float') || glCtx.getExtension('EXT_color_buffer_half_float')));
    var postRT = null;
    var postScene = new T.Scene();
    var postCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    var postGeo = new T.PlaneGeometry(2, 2);
    var ACES_GLSL =
      'vec3 lhAces(vec3 x, float expScale){' +
      '  x *= expScale * 0.6;' +
      '  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);' +
      '}' +
      'vec3 lhSrgb(vec3 c){' +
      '  vec3 lo = c * 12.92;' +
      '  vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;' +
      '  return mix(lo, hi, step(vec3(0.0031308), c));' +
      '}';
    var copyMat = new T.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uExposure: { value: 1.18 }, uToneMap: { value: canFloatRT ? 1.0 : 0.0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader:
        'uniform sampler2D tDiffuse; uniform float uExposure; uniform float uToneMap; varying vec2 vUv;' + ACES_GLSL +
        'void main(){ vec4 c = texture2D(tDiffuse, vUv);' +
        '  vec3 col = uToneMap > 0.5 ? lhSrgb(lhAces(c.rgb, uExposure)) : c.rgb;' +
        '  gl_FragColor = vec4(col, c.a); }',
      depthTest: false, depthWrite: false, toneMapped: false
    });
    var fxaaMat = new T.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uTexel: { value: new T.Vector2(1 / 800, 1 / 450) }, uExposure: { value: 1.18 }, uToneMap: { value: canFloatRT ? 1.0 : 0.0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader:
        'uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uExposure; uniform float uToneMap; varying vec2 vUv;' + ACES_GLSL +
        'vec3 tap(vec2 uv){ vec3 c = texture2D(tDiffuse, uv).rgb; return uToneMap > 0.5 ? lhSrgb(lhAces(c, uExposure)) : c; }' +
        'float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }' +
        'void main(){' +
        '  vec2 d = uTexel;' +
        '  vec3 cM = tap(vUv); vec3 cNW = tap(vUv + vec2(-d.x, d.y)); vec3 cNE = tap(vUv + vec2(d.x, d.y));' +
        '  vec3 cSW = tap(vUv + vec2(-d.x, -d.y)); vec3 cSE = tap(vUv + vec2(d.x, -d.y));' +
        '  float lM = luma(cM), lNW = luma(cNW), lNE = luma(cNE), lSW = luma(cSW), lSE = luma(cSE);' +
        '  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));' +
        '  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));' +
        '  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));' +
        '  float dirReduce = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);' +
        '  float rcpDir = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);' +
        '  dir = clamp(dir * rcpDir, vec2(-8.0), vec2(8.0)) * d;' +
        '  vec3 rgbA = 0.5 * (tap(vUv + dir * (1.0 / 3.0 - 0.5)) + tap(vUv + dir * (2.0 / 3.0 - 0.5)));' +
        '  vec3 rgbB = rgbA * 0.5 + 0.25 * (tap(vUv + dir * -0.5) + tap(vUv + dir * 0.5));' +
        '  float lB = luma(rgbB);' +
        '  vec3 res = (lB < lMin || lB > lMax) ? rgbA : rgbB;' +
        '  gl_FragColor = vec4(res, 1.0);' +
        '}',
      depthTest: false, depthWrite: false, toneMapped: false
    });
    var postQuad = new T.Mesh(postGeo, fxaaMat);
    postQuad.frustumCulled = false;
    postScene.add(postQuad);
    function ensurePostRT(cw, ch) {
      var rtMul = gfx.aa === 'ssaa2' ? clamp(Math.max(1.5, gfx.renderScale * 1.5), 1, 2.5) : gfx.renderScale;
      var rw = clamp(Math.round(cw * baseDpr * rtMul), 1, 4096);
      var rh = clamp(Math.round(ch * baseDpr * rtMul), 1, 4096);
      if (!postRT || postRT.width !== rw || postRT.height !== rh) {
        if (postRT) postRT.dispose();
        postRT = new T.WebGLRenderTarget(rw, rh, {
          minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat,
          type: canFloatRT ? T.HalfFloatType : T.UnsignedByteType, depthBuffer: true, stencilBuffer: false
        });
      }
      return postRT;
    }

    var scene = new T.Scene();           // no fog: shells reach 18000 units
    var camera = new T.PerspectiveCamera(44, 1, CAM_NEAR, CAM_FAR);
    scene.add(new T.AmbientLight(0x2d2448, 2.0));
    var sun = new T.DirectionalLight(0xfff1e0, 3.2);
    sun.position.set(52, 42, 56);
    scene.add(sun);
    var uvRim = new T.DirectionalLight(0x8e54ff, 2.15);
    uvRim.position.set(-64, 24, 30);
    scene.add(uvRim);
    var cryoRim = new T.DirectionalLight(0x45e8a8, 1.45);
    cryoRim.position.set(-45, -26, -42);
    scene.add(cryoRim);

    // Docked Station Observation Concourse (curved centrifugal panoramic window corridor)
    function buildConcourseRig() {
      var grp = new T.Group();
      grp.name = 'Station_Concourse_Gallery';
      grp.visible = false;
      var cFloor = document.createElement('canvas');
      cFloor.width = 512; cFloor.height = 512;
      var gf = cFloor.getContext('2d');
      gf.fillStyle = '#9aa6b4';
      gf.fillRect(0, 0, 512, 512);
      gf.strokeStyle = 'rgba(42, 52, 66, 0.55)';
      gf.lineWidth = 3;
      for (var gx = 0; gx < 512; gx += 64) { gf.beginPath(); gf.moveTo(gx, 0); gf.lineTo(gx, 512); gf.stroke(); }
      for (var gy = 0; gy < 512; gy += 64) { gf.beginPath(); gf.moveTo(0, gy); gf.lineTo(512, gy); gf.stroke(); }
      // Glowing cyan centrifugal walkway guide stripe positioned right in front of the panoramic window sill
      gf.fillStyle = 'rgba(30, 38, 52, 0.45)';
      gf.fillRect(0, 0, 512, 34);
      gf.fillRect(0, 478, 512, 34);
      gf.fillStyle = '#2de4f2';
      gf.fillRect(0, 62, 512, 16);
      gf.fillStyle = 'rgba(45, 228, 242, 0.28)';
      gf.fillRect(0, 54, 512, 32);
      var floorTex = new T.CanvasTexture(cFloor);
      floorTex.wrapS = floorTex.wrapT = T.RepeatWrapping;
      floorTex.repeat.set(4, 1);
      if (T.SRGBColorSpace) floorTex.colorSpace = T.SRGBColorSpace;

      var wallMat = new T.MeshStandardMaterial({ color: 0xcbd5e2, roughness: 0.44, metalness: 0.26 });
      var mullionMat = new T.MeshStandardMaterial({ color: 0xaab8c9, roughness: 0.34, metalness: 0.42 });
      var trimMat = new T.MeshStandardMaterial({ color: 0x2c3648, roughness: 0.40, metalness: 0.58 });
      var floorMat = new T.MeshStandardMaterial({ map: floorTex, roughness: 0.34, metalness: 0.18 });
      var stripMat = new T.MeshBasicMaterial({ color: 0xeaf8ff });
      var accentMat = new T.MeshBasicMaterial({ color: 0x3ef0ff });
      var mats = [wallMat, mullionMat, trimMat, floorMat, stripMat, accentMat];

      // Build a sweeping 115-degree curved observation gallery arc (radius R=15, 11 bays, corridor width 4.8, height 3.0)
      // Viewer stands inside the arc looking outward across -Z through giant panoramic bay windows framed by mullions.
      var R = 15.0;
      var bays = 11;
      var spanAng = 2.02;
      var segLen = (R * spanAng / bays) * 1.03;
      var floorGeo = new T.BoxGeometry(segLen, 0.24, 4.8);
      var ceilGeo = new T.BoxGeometry(segLen, 0.26, 4.8);
      var sillGeo = new T.BoxGeometry(segLen, 0.34, 0.42);
      var headGeo = new T.BoxGeometry(segLen, 0.32, 0.44);
      var backWallGeo = new T.BoxGeometry(segLen, 3.2, 0.32);
      var pillarGeo = new T.BoxGeometry(0.24, 3.1, 0.38);
      var pillarTrimGeo = new T.BoxGeometry(0.045, 2.38, 0.045);
      var ribGeo = new T.BoxGeometry(0.22, 0.18, 4.8);
      var lightGeo = new T.BoxGeometry(segLen * 0.72, 0.045, 0.22);
      var backPanelGeo = new T.BoxGeometry(segLen * 0.76, 1.35, 0.08);
      var sTrimGeo = new T.BoxGeometry(segLen * 0.99, 0.055, 0.48);
      var railGeo = new T.BoxGeometry(segLen * 0.94, 0.04, 0.045);
      var postGeo = new T.BoxGeometry(0.045, 0.24, 0.045);
      var geos = [floorGeo, ceilGeo, sillGeo, headGeo, backWallGeo, pillarGeo, pillarTrimGeo, ribGeo, lightGeo, backPanelGeo, sTrimGeo, railGeo, postGeo];

      for (var i = 0; i < bays; i++) {
        var a = ((i + 0.5) / bays - 0.5) * spanAng;
        var bay = new T.Group();
        bay.position.set(Math.sin(a) * R, 0, R - Math.cos(a) * R);
        bay.rotation.y = a;
        var fl = new T.Mesh(floorGeo, floorMat); fl.position.set(0, -1.37, 0); bay.add(fl);
        var cl = new T.Mesh(ceilGeo, wallMat); cl.position.set(0, 1.91, 0); bay.add(cl);
        var sl = new T.Mesh(sillGeo, wallMat); sl.position.set(0, -1.08, -2.20); bay.add(sl);
        var hd = new T.Mesh(headGeo, wallMat); hd.position.set(0, 1.63, -2.20); bay.add(hd);
        var sTrim = new T.Mesh(sTrimGeo, trimMat); sTrim.position.set(0, -0.89, -2.20); bay.add(sTrim);
        var hTrim = new T.Mesh(sTrimGeo, trimMat); hTrim.position.set(0, 1.46, -2.20); bay.add(hTrim);
        var rail = new T.Mesh(railGeo, mullionMat); rail.position.set(0, -0.74, -2.02); bay.add(rail);
        var pL = new T.Mesh(postGeo, trimMat); pL.position.set(-segLen * 0.34, -0.86, -2.02); bay.add(pL);
        var pR = new T.Mesh(postGeo, trimMat); pR.position.set(segLen * 0.34, -0.86, -2.02); bay.add(pR);
        var bw = new T.Mesh(backWallGeo, wallMat); bw.position.set(0, 0.28, 2.38); bay.add(bw);
        var bp = new T.Mesh(backPanelGeo, trimMat); bp.position.set(0, -0.22, 2.20); bay.add(bp);
        var railA = new T.Mesh(railGeo, accentMat); railA.position.set(0, 0.72, 2.20); bay.add(railA);
        var lt1 = new T.Mesh(lightGeo, stripMat); lt1.position.set(0, 1.76, -1.55); bay.add(lt1);
        var lt2 = new T.Mesh(lightGeo, stripMat); lt2.position.set(0, 1.76, -0.45); bay.add(lt2);
        var lt3 = new T.Mesh(lightGeo, stripMat); lt3.position.set(0, 1.76, 0.85); bay.add(lt3);
        grp.add(bay);

        var aEdge = (i / bays - 0.5) * spanAng;
        var frame = new T.Group();
        frame.position.set(Math.sin(aEdge) * R, 0, R - Math.cos(aEdge) * R);
        frame.rotation.y = aEdge;
        var pil = new T.Mesh(pillarGeo, mullionMat); pil.position.set(0, 0.28, -2.18); frame.add(pil);
        var pAcc = new T.Mesh(pillarTrimGeo, accentMat); pAcc.position.set(0, 0.28, -1.98); frame.add(pAcc);
        var rib = new T.Mesh(ribGeo, mullionMat); rib.position.set(0, 1.72, 0); frame.add(rib);
        grp.add(frame);
      }
      // Close the final right-hand mullion edge
      var aLast = 0.5 * spanAng;
      var lastFrame = new T.Group();
      lastFrame.position.set(Math.sin(aLast) * R, 0, R - Math.cos(aLast) * R);
      lastFrame.rotation.y = aLast;
      var pilLast = new T.Mesh(pillarGeo, mullionMat); pilLast.position.set(0, 0.28, -2.18); lastFrame.add(pilLast);
      var pAccLast = new T.Mesh(pillarTrimGeo, accentMat); pAccLast.position.set(0, 0.28, -1.98); lastFrame.add(pAccLast);
      var ribLast = new T.Mesh(ribGeo, mullionMat); ribLast.position.set(0, 1.72, 0); lastFrame.add(ribLast);
      grp.add(lastFrame);
      var intLight1 = new T.PointLight(0xeef6ff, 2.8, 28, 1.3);
      intLight1.position.set(0, 1.35, 0.6);
      grp.add(intLight1);
      var intLight2 = new T.PointLight(0x88d8ff, 1.4, 24, 1.4);
      intLight2.position.set(-4.8, 1.05, 0.8);
      grp.add(intLight2);
      var intLight3 = new T.PointLight(0xffe6c8, 1.4, 24, 1.4);
      intLight3.position.set(4.8, 1.05, 0.8);
      grp.add(intLight3);

      scene.add(grp);
      return {
        group: grp,
        dispose: function () {
          scene.remove(grp);
          geos.forEach(function (g) { g.dispose(); });
          mats.forEach(function (m) { m.dispose(); });
          floorTex.dispose();
        }
      };
    }
    var concourseRig = buildConcourseRig();
    var lastPlanetLight = new T.Vector3(0.65, 0.45, 0.60).normalize();
    var tmpInvMat = new T.Matrix4();
    var tmpCamLoc = new T.Vector3();
    var tmpOriginLoc = new T.Vector3();
    var tmpLightEnd = new T.Vector3();
    var tmpLightLoc = new T.Vector3();

    var shared = Builder.createSharedAssets(T, DR);

    // Camera state the helm may mutate directly (or override per frame through snap.cam).
    var cam = {
      orbitYaw: DEFAULT_YAW,
      orbitPitch: DEFAULT_PITCH,
      orbitZoom: DEFAULT_ZOOM,
      sxZoom: 1.0,
      tacticalZoom: 1.0,
      tacticalYaw: 0.62,
      tacticalPitch: 0.58
    };
    if (initialState.cam) {
      for (var ck in initialState.cam) if (isNum(initialState.cam[ck])) cam[ck] = initialState.cam[ck];
    }

    // ------------------------------------------------------------------------------------------
    // Disc / halo textures
    // ------------------------------------------------------------------------------------------
    function makeDiscTex(size, withSpikes) {
      var c = document.createElement('canvas');
      c.width = c.height = size;
      var g = c.getContext('2d'), h = size / 2;
      var gr = g.createRadialGradient(h, h, 0, h, h, h);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.22, 'rgba(255,255,255,0.85)');
      gr.addColorStop(0.55, 'rgba(255,255,255,0.22)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, size, size);
      if (withSpikes) {
        g.strokeStyle = 'rgba(255,255,255,0.68)';
        g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(4, h); g.lineTo(size - 4, h);
        g.moveTo(h, 4); g.lineTo(h, size - 4);
        g.stroke();
      }
      var tex = new T.CanvasTexture(c);
      if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
      return tex;
    }
    function makeRingTex(size) {
      var c = document.createElement('canvas');
      c.width = c.height = size;
      var g = c.getContext('2d'), h = size / 2;
      g.strokeStyle = '#fff';
      g.lineWidth = size * 0.07;
      g.beginPath();
      g.arc(h, h, h * 0.74, 0, Math.PI * 2);
      g.stroke();
      var tex = new T.CanvasTexture(c);
      if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
      return tex;
    }
    var discTex = makeDiscTex(64, false);
    var spikeTex = makeDiscTex(128, true);
    var haloTex = makeDiscTex(128, false);
    var ringTex = makeRingTex(64);

    // ------------------------------------------------------------------------------------------
    // Ship holder: shipFrame (position/orientation) > shipHolder (flip) > vessel
    // ------------------------------------------------------------------------------------------
    var shipFrame = new T.Group();
    scene.add(shipFrame);
    var shipHolder = new T.Group();
    shipFrame.add(shipHolder);

    // Player hull damage sparks + charred wreck debris (attached inside shipHolder)
    var playerDamageSparks = (function () {
      var list = [];
      var coords = [
        [14, 1.8, 0.9], [9, -1.6, -1.2], [3, 2.5, -1.6], [-2, -2.2, 1.8], [-7, 2.0, 1.5],
        [-11, -1.8, -1.4], [11, 0.8, -2.0], [1, -2.6, 0.4], [-5, 2.7, -0.7], [-14, 1.1, 1.9]
      ];
      for (var i = 0; i < coords.length; i++) {
        var sm = new T.SpriteMaterial({
          map: haloTex, color: (i % 2 === 0 ? 0xff9a3c : 0xff4d42), transparent: true,
          opacity: 0, depthWrite: false, blending: T.AdditiveBlending
        });
        var sp = new T.Sprite(sm);
        sp.position.set(coords[i][0], coords[i][1], coords[i][2]);
        sp.scale.set(2.4, 2.4, 1);
        sp.visible = false;
        shipHolder.add(sp);
        list.push({ sprite: sp, mat: sm, phase: i * 1.37 });
      }
      return list;
    })();
    var playerWreckGroup = (function () {
      var grp = new T.Group();
      grp.visible = false;
      var cGeo = new T.BoxGeometry(1, 0.42, 0.65);
      var cMat = new T.MeshStandardMaterial({
        color: 0x262226, emissive: 0x3b1208, emissiveIntensity: 0.75,
        roughness: 0.85, metalness: 0.45, flatShading: true
      });
      var chunks = [];
      for (var i = 0; i < 12; i++) {
        var m = new T.Mesh(cGeo, cMat);
        var a = i * 1.93;
        m.position.set(-14 + (i * 2.5) % 28, Math.sin(a) * 2.2, Math.cos(a * 1.3) * 2.4);
        m.rotation.set(a, a * 0.7, a * 1.4);
        m.scale.set(2.6 + (i % 3) * 1.2, 1.1 + (i % 2) * 0.6, 1.4 + ((i + 1) % 3) * 0.6);
        grp.add(m);
        chunks.push(m);
      }
      var embers = [];
      for (var j = 0; j < 6; j++) {
        var em = new T.SpriteMaterial({
          map: haloTex, color: 0xff6a2a, transparent: true, opacity: 0.55,
          depthWrite: false, blending: T.AdditiveBlending
        });
        var sp = new T.Sprite(em);
        sp.position.set(-10 + j * 4.2, Math.sin(j * 1.7) * 1.6, Math.cos(j * 2.1) * 1.6);
        sp.scale.set(3.8, 3.8, 1);
        grp.add(sp);
        embers.push({ sprite: sp, mat: em, phase: j * 1.1 });
      }
      shipHolder.add(grp);
      return {
        group: grp,
        chunks: chunks,
        embers: embers,
        dispose: function () {
          cGeo.dispose();
          cMat.dispose();
          embers.forEach(function (e) { e.mat.dispose(); });
        }
      };
    })();
    var fxGroup = new T.Group();            // ablation, ISM streaks, plasma (ship-frame axes)
    scene.add(fxGroup);
    var dockClampGeo = new T.BufferGeometry();
    dockClampGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(6), 3));
    dockClampGeo.setAttribute('color', new T.BufferAttribute(new Float32Array([0.25, 1, 1, 1, 0.65, 0.2]), 3));
    var dockClampLine = new T.Line(dockClampGeo, new T.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false
    }));
    dockClampLine.name = 'dockClampLine';
    dockClampLine.frustumCulled = false;
    // Never drawn: a straight non-rotating tether sliced through the station's spinning hab rings.
    // Berthing is shown by DropShip shuttle traffic between the bays and the axial spindle hub instead.
    dockClampLine.visible = false;
    scene.add(dockClampLine);

    // ---- Hull weapon FX (world space; muzzles re-read from vessel.group.matrixWorld every frame) ----
    var weaponFxGroup = new T.Group();
    weaponFxGroup.name = 'weaponFxGroup';
    scene.add(weaponFxGroup);
    var BEAM_VERT =
      'varying vec2 vUv; varying vec3 vN; varying vec3 vV;' +
      'void main(){' +
      '  vUv = uv;' +
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);' +
      '  vN = normalize(normalMatrix * normal);' +
      '  vV = normalize(-mv.xyz);' +
      '  gl_Position = projectionMatrix * mv;' +
      '}';
    // Collimated beam: hot core + bloom halo; uRings adds relativistic Cherenkov shock rings (lance).
    var BEAM_FRAG =
      'uniform vec3 uCore; uniform vec3 uHalo; uniform float uOn; uniform float uTime;' +
      'uniform float uLen; uniform float uRings;' +
      'varying vec2 vUv; varying vec3 vN; varying vec3 vV;' +
      'void main(){' +
      '  float s = clamp(vUv.y, 0.0, 1.0);' +
      '  float facing = abs(dot(normalize(vN), normalize(vV)));' +
      '  float core = pow(max(facing, 0.0001), 9.0);' +
      '  float halo = pow(max(facing, 0.0001), 1.6);' +
      '  float dist = s * uLen;' +
      '  float head = smoothstep(0.0, 0.15, dist);' +
      '  float far = 1.0 - smoothstep(0.55, 1.0, s);' +
      '  float ring = uRings * pow(0.5 + 0.5 * cos(dist * 0.9 - uTime * 40.0), 6.0);' +
      '  float flick = 0.90 + 0.10 * sin(uTime * 90.0 + dist * 0.05);' +
      '  float a = (core * 1.6 + halo * 0.45 + ring * halo * 0.9) * head * far * flick * uOn;' +
      '  vec3 col = mix(uHalo, uCore, clamp(core * 1.4 + ring * 0.3, 0.0, 1.0));' +
      '  gl_FragColor = vec4(col * a * 2.2, clamp(a, 0.0, 1.0));' +
      '}';
    var beamGeo = new T.CylinderGeometry(1, 1, 1, 16, 1, true);
    beamGeo.translate(0, 0.5, 0);           // base ring at the muzzle, unit length along +Y
    var tracerGeo = new T.SphereGeometry(1, 8, 6);
    var weaponFx = { lastSeq: null, lastEnemySeq: null, lastPdcSeq: null, shots: [], beams: [], flashes: [], tracers: [], active: 0, enemyActive: 0, lastMode: null };
    var WEAPON_RANGE = 1800;
    var TRACER_SPEED = 1400;
    var hitJoltTimer = 0, lastHitSeqSeen = 0;

    // 3D Orbital Projectile & AI Missile Trails + Warhead Meshes
    var projectileFxGroup = new T.Group();
    projectileFxGroup.name = 'projectileFxGroup';
    scene.add(projectileFxGroup);
    var MAX_PROJ_SLOTS = 40;
    var PROJ_TRAIL_PTS = 40;
    var projHeadGeo = new T.SphereGeometry(1, 10, 8);
    var projSlots = [];
    var projPoolActive = 0;
    for (var piS = 0; piS < MAX_PROJ_SLOTS; piS++) {
      var pLineGeo = new T.BufferGeometry();
      var pArr = new Float32Array(PROJ_TRAIL_PTS * 3);
      pLineGeo.setAttribute('position', new T.BufferAttribute(pArr, 3));
      var pLineMat = new T.LineBasicMaterial({
        color: 0xffb35c, transparent: true, opacity: 0.90, depthWrite: false
      });
      var pLine = new T.Line(pLineGeo, pLineMat);
      pLine.frustumCulled = false;
      pLine.visible = false;
      pLine.renderOrder = 7;
      projectileFxGroup.add(pLine);

      var pHeadMat = new T.MeshBasicMaterial({ color: 0xffd9a0 });
      var pHead = new T.Mesh(projHeadGeo, pHeadMat);
      pHead.frustumCulled = false;
      pHead.visible = false;
      pHead.renderOrder = 8;
      projectileFxGroup.add(pHead);

      var pFlareMat = new T.SpriteMaterial({
        map: haloTex, color: 0xff8a3c, transparent: true, opacity: 0.9,
        depthWrite: false, blending: T.AdditiveBlending
      });
      var pFlare = new T.Sprite(pFlareMat);
      pFlare.visible = false;
      pFlare.renderOrder = 9;
      projectileFxGroup.add(pFlare);

      projSlots.push({
        line: pLine, lineGeo: pLineGeo, lineMat: pLineMat,
        head: pHead, headMat: pHeadMat, flare: pFlare, flareMat: pFlareMat
      });
    }

    // 3D Explosions, shockwave rings, and tumbling glowing hull debris
    var explosionFxGroup = new T.Group();
    explosionFxGroup.name = 'explosionFxGroup';
    scene.add(explosionFxGroup);
    var expFireGeo = new T.IcosahedronGeometry(1, 2);
    var expRingGeo = new T.RingGeometry(0.76, 1.0, 32);
    var expShardGeo = new T.BoxGeometry(1, 0.35, 0.6);
    var explosionFx = { lastSeq: null, active: 0, slots: [] };
    for (var exS = 0; exS < 6; exS++) {
      var eGrp = new T.Group();
      eGrp.visible = false;
      var fMat = new T.MeshBasicMaterial({
        color: 0xffaa44, transparent: true, opacity: 0.95,
        depthWrite: false, blending: T.AdditiveBlending
      });
      var fMesh = new T.Mesh(expFireGeo, fMat);
      fMesh.frustumCulled = false;
      fMesh.renderOrder = 9;
      eGrp.add(fMesh);

      var rMat = new T.MeshBasicMaterial({
        color: 0xffd27d, transparent: true, opacity: 0.85,
        side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending
      });
      var rMesh = new T.Mesh(expRingGeo, rMat);
      rMesh.frustumCulled = false;
      rMesh.renderOrder = 9;
      eGrp.add(rMesh);

      var flMat = new T.SpriteMaterial({
        map: haloTex, color: 0xffe4b8, transparent: true, opacity: 0.95,
        depthWrite: false, blending: T.AdditiveBlending
      });
      var flSpr = new T.Sprite(flMat);
      flSpr.renderOrder = 10;
      eGrp.add(flSpr);

      var shards = [];
      for (var shI = 0; shI < 16; shI++) {
        var phi = shI * 2.3999632;
        var cosT = 1 - ((shI + 0.5) / 16) * 2;
        var sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
        var dMat = new T.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.95 });
        var dMesh = new T.Mesh(expShardGeo, dMat);
        dMesh.frustumCulled = false;
        dMesh.renderOrder = 8;
        eGrp.add(dMesh);
        shards.push({
          mesh: dMesh,
          mat: dMat,
          dir: new T.Vector3(sinT * Math.cos(phi), cosT, sinT * Math.sin(phi)),
          speed: 22 + (shI % 5) * 9,
          spin: [1.8 + (shI % 3), -2.4 + (shI % 4), 1.3 + (shI % 5)]
        });
      }
      explosionFxGroup.add(eGrp);
      explosionFx.slots.push({
        busy: false, t0: 0, dur: 2.4, scale: 1.6,
        group: eGrp, fire: fMesh, fireMat: fMat, ring: rMesh, ringMat: rMat,
        flare: flSpr, flareMat: flMat, shards: shards
      });
    }
    function allocBeam() {
      for (var i = 0; i < weaponFx.beams.length; i++) if (!weaponFx.beams[i].busy) return weaponFx.beams[i];
      var mat = new T.ShaderMaterial({
        uniforms: {
          uCore: { value: new T.Color(1, 1, 1) }, uHalo: { value: new T.Color(0.2, 1, 0.7) },
          uOn: { value: 0 }, uTime: { value: 0 }, uLen: { value: 1 }, uRings: { value: 0 }
        },
        vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG,
        transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide
      });
      var m = new T.Mesh(beamGeo, mat);
      m.frustumCulled = false;
      m.renderOrder = 7;
      m.visible = false;
      weaponFxGroup.add(m);
      var b = { mesh: m, mat: mat, busy: false };
      weaponFx.beams.push(b);
      return b;
    }
    function allocFlash() {
      for (var i = 0; i < weaponFx.flashes.length; i++) if (!weaponFx.flashes[i].busy) return weaponFx.flashes[i];
      var sm = new T.SpriteMaterial({ map: haloTex, color: 0xffffff, transparent: true, depthWrite: false, blending: T.AdditiveBlending });
      var sp = new T.Sprite(sm);
      sp.visible = false;
      sp.renderOrder = 8;
      weaponFxGroup.add(sp);
      var f = { sprite: sp, mat: sm, busy: false };
      weaponFx.flashes.push(f);
      return f;
    }
    function allocTracer() {
      for (var i = 0; i < weaponFx.tracers.length; i++) if (!weaponFx.tracers[i].busy) return weaponFx.tracers[i];
      var mm = new T.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, depthWrite: false, blending: T.AdditiveBlending });
      var m = new T.Mesh(tracerGeo, mm);
      m.frustumCulled = false;
      m.renderOrder = 7;
      m.visible = false;
      weaponFxGroup.add(m);
      var tr = { mesh: m, mat: mm, busy: false };
      weaponFx.tracers.push(tr);
      return tr;
    }
    var shuttleFleet = null;
    var shuttleDiag = { active: 0 };
    var rcsDiag = { firing: 0 };

    // Reusable crystalline ice deposit builder for per-system mapped H2O deposits (+ rogue void fallback)
    function makeIceDepositMesh(dep, seed) {
      var group = new T.Group();
      group.name = 'IceDeposit_' + ((dep && dep.id) || seed || 'body');
      var radiusModel = 3.8;
      var iceGeo = new T.IcosahedronGeometry(radiusModel, 2);
      var hPos = iceGeo.attributes.position;
      var s0 = ((seed || 1) % 97) * 0.13 + 1.0;
      for (var hi = 0; hi < hPos.count; hi++) {
        var hx = hPos.getX(hi), hy = hPos.getY(hi), hz = hPos.getZ(hi);
        var nH = 0.80 + 0.36 * (Math.sin(hx * 1.9 + hy * 2.7 + s0) * Math.cos(hz * 2.1 - hx * 1.3 - s0) * 0.5 + 0.5);
        hPos.setXYZ(hi, hx * nH * 1.15, hy * nH * 0.82, hz * nH * 1.05);
      }
      iceGeo.computeVertexNormals();
      var colHex = (dep && /comet/i.test(dep.kind || '')) ? 0xaeeeff : 0xc2f2ff;
      var iceMat = new T.MeshStandardMaterial({
        color: colHex,
        emissive: 0x164c78,
        emissiveIntensity: 0.48,
        roughness: 0.24,
        metalness: 0.14,
        flatShading: true
      });
      var core = new T.Mesh(iceGeo, iceMat);
      core.renderOrder = 2;
      group.add(core);
      var shardGeo = new T.IcosahedronGeometry(0.92, 1);
      var shardMat = new T.MeshStandardMaterial({
        color: 0xe6fbff,
        emissive: 0x246b9e,
        emissiveIntensity: 0.52,
        roughness: 0.20,
        metalness: 0.10,
        flatShading: true
      });
      for (var siH = 0; siH < 6; siH++) {
        var shMesh = new T.Mesh(shardGeo, shardMat);
        var shAng = (siH / 6) * Math.PI * 2 + s0 * 0.4;
        shMesh.position.set(Math.cos(shAng) * 5.6, Math.sin(shAng * 2) * 1.8, Math.sin(shAng) * 5.6);
        shMesh.scale.setScalar(0.55 + (siH % 3) * 0.30);
        shMesh.rotation.set(siH * 0.7 + s0, siH * 1.1, siH * 0.4);
        group.add(shMesh);
      }
      var comaMat = new T.SpriteMaterial({
        map: haloTex,
        color: 0x99ecff,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
        blending: T.AdditiveBlending
      });
      var coma = new T.Sprite(comaMat);
      coma.scale.set(20, 20, 1);
      group.add(coma);
      var sparks = [];
      for (var spI = 0; spI < 4; spI++) {
        var spM = new T.SpriteMaterial({
          map: haloTex,
          color: 0x70f8ff,
          transparent: true,
          opacity: 0.0,
          depthWrite: false,
          blending: T.AdditiveBlending
        });
        var spS = new T.Sprite(spM);
        var spA = (spI / 4) * Math.PI * 2 + 0.4;
        spS.position.set(Math.cos(spA) * 4.5, (spI % 2 ? 1.4 : -1.4), Math.sin(spA) * 4.5);
        spS.scale.set(3.2, 3.2, 1);
        group.add(spS);
        sparks.push({ sprite: spS, mat: spM, phase: spI * 1.7 + s0 });
      }
      return {
        group: group,
        comaMat: comaMat,
        sparks: sparks,
        dispose: function () {
          iceGeo.dispose();
          iceMat.dispose();
          shardGeo.dispose();
          shardMat.dispose();
          comaMat.dispose();
          for (var k = 0; k < sparks.length; k++) sparks[k].mat.dispose();
        }
      };
    }
    // Only shown in deep interstellar void (>0.015 ly from any star) during emergency rogue H2O extraction
    var rogueIceRig = makeIceDepositMesh({ id: 'rogue', name: 'ROGUE GLACIER', kind: 'comet' }, 999);
    rogueIceRig.group.name = 'Harvest_Rogue_Ice';
    rogueIceRig.group.visible = false;
    scene.add(rogueIceRig.group);
    var activeIceDepositDiag = { id: null, distKm: null, visible: false };

    var vessel = null;
    var vesselGenome = initialState.genome || null;
    var hideIceFlag = !!initialState.hideIce;
    function shipLengthUnits() {
      if (!vessel) return 38;
      return Math.max(10, (vessel.bowX || 22) - (vessel.sternX || -18));
    }

    function rebuildPlayerShip(genome, hideIce) {
      if (genome) vesselGenome = genome;
      if (typeof hideIce === 'boolean') hideIceFlag = hideIce;
      if (vessel) {
        shipHolder.remove(vessel.group);
        vessel.dispose();
        vessel = null;
      }
      if (!vesselGenome) return null;
      vessel = Builder.buildVessel(T, shared, vesselGenome, { hideIce: hideIceFlag });
      shipHolder.add(vessel.group);
      lastIceFrac = -1;
      return vessel;
    }

    // ------------------------------------------------------------------------------------------
    // Sky: Milky Way dome (GPU aberration), catalog stars, sextant overlay
    // ------------------------------------------------------------------------------------------
    var mwMat = new T.ShaderMaterial({
      uniforms: {
        uBeta: { value: 0.0 },
        uGamma: { value: 1.0 },
        uBoost: { value: new T.Vector3(1, 0, 0) },
        uGalFromShip: { value: new T.Matrix3() },
        uIrMode: { value: 0.0 }
      },
      vertexShader:
        'varying vec3 vLocalDir;' +
        'void main(){' +
        '  vLocalDir = position;' +
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);' +
        '}',
      fragmentShader:
        'uniform float uBeta;' +
        'uniform float uGamma;' +
        'uniform vec3 uBoost;' +
        'uniform mat3 uGalFromShip;' +
        'uniform float uIrMode;' +
        'varying vec3 vLocalDir;' +
        'float hash3(vec3 p){ p = fract(p * 0.3183099 + 0.13); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }' +
        'float noise3(vec3 x){' +
        '  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);' +
        '  return mix(mix(mix(hash3(i + vec3(0,0,0)), hash3(i + vec3(1,0,0)), f.x),' +
        '                 mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),' +
        '             mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),' +
        '                 mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);' +
        '}' +
        'float fbm(vec3 p){' +
        '  float v = 0.0; float a = 0.52;' +
        '  for(int i=0; i<4; i++){ v += a * noise3(p); p = p * 2.07 + vec3(1.7, 9.2, 4.3); a *= 0.5; }' +
        '  return v;' +
        '}' +
        'vec3 planckApprox(float T){' +
        '  float tC = clamp(T, 650.0, 48000.0);' +
        '  float xr = 22135.0 / tC; float xg = 26644.0 / tC; float xb = 32700.0 / tC;' +
        '  float g = 2.20 * exp(xr - xg) * (1.0 - exp(-xr)) / max(1e-6, 1.0 - exp(-xg));' +
        '  float b = 6.30 * exp(xr - xb) * (1.0 - exp(-xr)) / max(1e-6, 1.0 - exp(-xb));' +
        '  vec3 c = vec3(1.0, g, b);' +
        '  float mx = max(c.r, max(c.g, c.b));' +
        '  return pow(clamp(c / mx, vec3(1e-5), vec3(1.0)), vec3(0.76));' +
        '}' +
        'void main(){' +
        '  vec3 nObs = normalize(vLocalDir);' +
        '  float cosO = clamp(dot(nObs, uBoost), -1.0, 1.0);' +
        '  vec3 nRest = normalize((nObs - cosO * uBoost) / uGamma + (cosO - uBeta) * uBoost);' +
        '  vec3 gDir = normalize(uGalFromShip * nRest);' +
        '  float cTilt = cos(0.48), sTilt = sin(0.48);' +
        '  float by = gDir.y * cTilt + gDir.z * sTilt;' +
        '  float bz = -gDir.y * sTilt + gDir.z * cTilt;' +
        '  float bx = gDir.x;' +
        '  float n1 = fbm(vec3(bx, by * 2.2, bz) * 3.4);' +
        '  float n2 = fbm(vec3(bx, by * 3.8, bz) * 7.8 + 4.1);' +
        '  float disk = exp(-by * by * 32.0) * (0.42 + 0.85 * n1);' +
        '  vec3 coreV = normalize(vec3(cos(0.8), 0.0, sin(0.8)));' +
        '  float bulge = exp(-dot(vec3(bx, by * 1.4, bz) - coreV, vec3(bx, by * 1.4, bz) - coreV) * 3.8);' +
        '  float dustRift = 1.0 - 0.62 * exp(-by * by * 240.0) * smoothstep(0.32, 0.72, n2);' +
        '  float starDense = clamp((disk * 0.88 + bulge * 0.78) * dustRift, 0.0, 1.45);' +
        '  float coldDust = exp(-by * by * 90.0) * n2;' +
        '  float delta = 1.0 / max(0.04, uGamma * (1.0 - uBeta * cosO));' +
        '  float beam = pow(delta, 2.5);' +
        '  float beamSoft = beam / (1.0 + 0.36 * beam);' +
        '  float starT = 4300.0 * delta;' +
        '  float wienFade = starT < 1200.0 ? exp(-2.4 * (1200.0 - starT) / 560.0) : 1.0;' +
        '  float aftVis = max(0.16 * wienFade, beamSoft) * mix(0.45, 1.0, wienFade);' +
        '  vec3 starRgb = planckApprox(starT) * (starDense * 0.24 * aftVis);' +
        '  float irIntoVis = smoothstep(1600.0, 4200.0, 950.0 * delta);' +
        '  vec3 dustRgb = planckApprox(1150.0 * delta) * (coldDust * irIntoVis * 0.12 * beamSoft);' +
        '  vec3 col = starRgb + dustRgb;' +
        '  if (uIrMode > 0.5) {' +
        '    float irSignal = clamp(coldDust * 0.36 + starDense * 0.14, 0.0, 0.45);' +
        '    gl_FragColor = vec4(vec3(0.06, 0.14, 0.11) * irSignal, clamp(irSignal * 1.4, 0.0, 0.85));' +
        '    return;' +
        '  }' +
        '  gl_FragColor = vec4(col, 1.0);' +
        '}',
      side: T.BackSide,
      transparent: true,
      blending: T.AdditiveBlending,
      depthWrite: false,
      fog: false
    });
    var mwDome = new T.Mesh(new T.SphereGeometry(MW_R, 48, 32), mwMat);
    mwDome.renderOrder = -10;
    mwDome.frustumCulled = false;
    scene.add(mwDome);

    // 4400 field stars; slots 0..N_SYS-1 are the navigable catalog + frontier systems.
    var SYSTEMS = Galaxy.ALL_SYSTEMS || Galaxy.SYSTEMS || [];
    var N_SYS = SYSTEMS.length;
    var N_STARS = 4400;
    var starCat = [];
    (function buildStarCatalog() {
      var rng = (Genome && Genome.mulberry32) ? Genome.mulberry32(137) : Math.random;
      function normal() {
        var u = Math.max(1e-9, rng()), v = rng();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      }
      for (var i = 0; i < N_SYS; i++) {
        starCat.push({ gx: 1, gy: 0, gz: 0, x0: 1, y0: 0, z0: 0, T: SYSTEMS[i].T, b: 1.45, sysId: SYSTEMS[i].id });
      }
      var tiltBand = 0.48;
      var cbT = Math.cos(tiltBand), sbT = Math.sin(tiltBand);
      for (var s = N_SYS; s < N_STARS; s++) {
        var inBand = rng() < 0.62;
        var lon = rng() * Math.PI * 2;
        var lat = inBand ? clamp(normal() * 0.13, -0.55, 0.55) : Math.asin(2 * rng() - 1);
        var cl = Math.cos(lat);
        var bx = cl * Math.cos(lon), by = Math.sin(lat), bz = cl * Math.sin(lon);
        var gx = bx, gy = by * cbT - bz * sbT, gz = by * sbT + bz * cbT;
        var lo = Math.log(inBand && rng() < 0.35 ? 3400 : 3200);
        var hi = Math.log(inBand && rng() < 0.35 ? 8500 : 24000);
        var sT = Math.exp(lo + (hi - lo) * rng());
        var coreBoost = inBand ? (0.68 + 0.92 * Math.pow(0.5 + 0.5 * Math.cos(lon - 0.8), 2.0)) : 0.45;
        var sb = Math.pow(rng(), 1.65) * 1.15 + coreBoost * 0.65;
        starCat.push({ gx: gx, gy: gy, gz: gz, x0: gx, y0: gy, z0: gz, T: sT, b: sb, sysId: null });
      }
    })();

    var starGeo = new T.BufferGeometry();
    starGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(N_STARS * 3), 3));
    starGeo.setAttribute('color', new T.BufferAttribute(new Float32Array(N_STARS * 3), 3));
    var starMat = new T.PointsMaterial({
      size: 3.4, map: discTex, vertexColors: true, transparent: true,
      blending: T.AdditiveBlending, depthWrite: false, sizeAttenuation: false, fog: false
    });
    var starPoints = new T.Points(starGeo, starMat);
    starPoints.frustumCulled = false;
    scene.add(starPoints);

    var dbList = [];
    for (var di = 0; di < N_SYS; di++) dbList.push(di);
    var dbGeo = new T.BufferGeometry();
    dbGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(N_SYS * 3), 3));
    dbGeo.setAttribute('color', new T.BufferAttribute(new Float32Array(N_SYS * 3), 3));
    var dbMat = new T.PointsMaterial({
      size: 22, map: spikeTex, vertexColors: true, transparent: true,
      blending: T.AdditiveBlending, depthWrite: false, sizeAttenuation: false, fog: false
    });
    var dbPoints = new T.Points(dbGeo, dbMat);
    dbPoints.frustumCulled = false;
    scene.add(dbPoints);

    var sxOverlay = new T.Group();
    (function buildSkyGrid() {
      var v = [], eq = [];
      for (var ga = 0; ga < 12; ga++) {
        var az0 = ga * 30 * RAD;
        for (var gt = 0; gt < 30; gt++) {
          var t0 = gt * 6 * RAD, t1 = (gt + 1) * 6 * RAD;
          v.push(
            SKY_R * 0.9 * Math.cos(t0), SKY_R * 0.9 * Math.sin(t0) * Math.cos(az0), SKY_R * 0.9 * Math.sin(t0) * Math.sin(az0),
            SKY_R * 0.9 * Math.cos(t1), SKY_R * 0.9 * Math.sin(t1) * Math.cos(az0), SKY_R * 0.9 * Math.sin(t1) * Math.sin(az0)
          );
        }
      }
      [30, 60, 90, 120, 150].forEach(function (deg) {
        var th = deg * RAD, dst = deg === 90 ? eq : v;
        for (var gs = 0; gs < 72; gs++) {
          var a0 = gs * 5 * RAD, a1 = (gs + 1) * 5 * RAD;
          dst.push(
            SKY_R * 0.9 * Math.cos(th), SKY_R * 0.9 * Math.sin(th) * Math.cos(a0), SKY_R * 0.9 * Math.sin(th) * Math.sin(a0),
            SKY_R * 0.9 * Math.cos(th), SKY_R * 0.9 * Math.sin(th) * Math.cos(a1), SKY_R * 0.9 * Math.sin(th) * Math.sin(a1)
          );
        }
      });
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(new Float32Array(v), 3));
      var gridMat = new T.LineBasicMaterial({ color: 0x7c6cf0, transparent: true, opacity: 0.44, depthWrite: false });
      var grid = new T.LineSegments(g, gridMat);
      grid.frustumCulled = false;
      sxOverlay.add(grid);

      var gEq = new T.BufferGeometry();
      gEq.setAttribute('position', new T.BufferAttribute(new Float32Array(eq), 3));
      var eqMat = new T.LineBasicMaterial({ color: 0x63ff8d, transparent: true, opacity: 0.62, depthWrite: false });
      var eqLoop = new T.LineSegments(gEq, eqMat);
      eqLoop.frustumCulled = false;
      sxOverlay.add(eqLoop);
      sxOverlay.userData.gridMat = gridMat;
      sxOverlay.userData.eqMat = eqMat;
    })();
    sxOverlay.visible = false;
    scene.add(sxOverlay);

    var starState = { key: '', ir: false, activeIdx: -2, valid: false };
    var lastStarFrame = null;

    // ------------------------------------------------------------------------------------------
    // Frame description helpers
    // ------------------------------------------------------------------------------------------
    function readBasis(snap) {
      var b = snap.basis || snap.shipBasis;
      var f = b && arr3(b.f), y = b && arr3(b.y), z = b && arr3(b.z);
      if (f && y && z) return { f: unit3(f), y: unit3(y), z: unit3(z) };
      var h = unit3(arr3(snap.headingGal) || [1, 0, 0]);
      var refUp = Math.abs(h[1]) > 0.92 ? [1, 0, 0] : [0, 1, 0];
      var zz = unit3(cross3(h, refUp));
      var yy = unit3(cross3(zz, h));
      return { f: h, y: yy, z: zz };
    }

    function makeFrame(basis, beta, gamma, observerKm, velocityGal, observerVelKmS) {
      var b = clamp(beta, 0, 0.999999);
      var g = gamma > 1 ? gamma : 1 / Math.sqrt(1 - b * b);
      var m4 = new T.Matrix4().set(
        basis.f[0], basis.f[1], basis.f[2], 0,
        basis.y[0], basis.y[1], basis.y[2], 0,
        basis.z[0], basis.z[1], basis.z[2], 0,
        0, 0, 0, 1
      );
      var q = new T.Quaternion().setFromRotationMatrix(m4);
      var boost = velocityGal ? unit3([dot3(velocityGal, basis.f), dot3(velocityGal, basis.y), dot3(velocityGal, basis.z)]) : [1, 0, 0];
      var boostQ = new T.Quaternion();
      if (b > 1e-5) {
        if (boost[0] < -0.9999) {
          boostQ.setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI);
        } else {
          boostQ.setFromUnitVectors(new T.Vector3(1, 0, 0), new T.Vector3(boost[0], boost[1], boost[2]).normalize());
        }
      }
      var boostQInv = boostQ.clone().invert();
      return {
        f: basis.f, y: basis.y, z: basis.z, beta: b, gamma: g, invG: 1 / g,
        boost: boost, boostQ: boostQ, boostQInv: boostQInv, q: q,
        observerKm: observerKm || [0, 0, 0],
        observerVelKmS: observerVelKmS || null
      };
    }

    // World direction -> ship frame -> aberrated observed unit vector (+ Doppler factor).
    function observe(dWorld, fr) {
      var sx = dot3(dWorld, fr.f), sy = dot3(dWorld, fr.y), sz = dot3(dWorld, fr.z);
      var dK = Math.sqrt(sx * sx + sy * sy + sz * sz);
      if (dK < 1e-9) return { dKm: 1e-9, n: [1, 0, 0], cosO: 1, D: 1 };
      var nx = sx / dK, ny = sy / dK, nz = sz / dK;
      var b = fr.beta;
      if (b <= 1e-6) return { dKm: dK, n: [nx, ny, nz], cosO: nx, D: 1 };
      var boost = fr.boost;
      var cosR = clamp(nx * boost[0] + ny * boost[1] + nz * boost[2], -1, 1);
      var cosO = aberrateCos(b, cosR);
      var D = fr.gamma * (1 + b * cosR), k = 1 / D, shift = cosO - cosR * k;
      var n = [nx * k + boost[0] * shift, ny * k + boost[1] * shift, nz * k + boost[2] * shift];
      return { dKm: dK, n: n, cosO: cosO, D: D };
    }

    // ------------------------------------------------------------------------------------------
    // Relativistic material capture / tint
    // ------------------------------------------------------------------------------------------
    function captureMats(rootObj) {
      var list = [], seen = [];
      if (!rootObj) return list;
      rootObj.traverse(function (o) {
        var m = o.material;
        if (!m || seen.indexOf(m) >= 0) return;
        seen.push(m);
        if (m.uniforms && m.uniforms.uColor) {
          list.push({ mat: m, shader: true, base: m.uniforms.uColor.value.clone() });
        } else if (m.color) {
          list.push({
            mat: m, shader: false, base: m.color.clone(),
            baseEm: m.emissive ? m.emissive.clone() : null,
            baseEmInt: typeof m.emissiveIntensity === 'number' ? m.emissiveIntensity : 1.0
          });
        }
      });
      return list;
    }
    function applyTint(list, Trest, D, gain) {
      if (!list || !list.length) return;
      var tint = dopplerTint(Trest, D);
      var g = clamp(gain, 0.14, 2.6);
      for (var i = 0; i < list.length; i++) {
        var rec = list[i];
        if (rec.shader) {
          rec.mat.uniforms.uColor.value.setRGB(
            clamp(rec.base.r * tint[0] * g, 0, 2.5), clamp(rec.base.g * tint[1] * g, 0, 2.5), clamp(rec.base.b * tint[2] * g, 0, 2.5));
        } else {
          rec.mat.color.setRGB(
            clamp(rec.base.r * tint[0] * g, 0, 2.5), clamp(rec.base.g * tint[1] * g, 0, 2.5), clamp(rec.base.b * tint[2] * g, 0, 2.5));
          if (rec.baseEm && rec.mat.emissive) {
            rec.mat.emissive.setRGB(
              clamp(rec.baseEm.r * tint[0] * g, 0, 2.5), clamp(rec.baseEm.g * tint[1] * g, 0, 2.5), clamp(rec.baseEm.b * tint[2] * g, 0, 2.5));
            rec.mat.emissiveIntensity = rec.baseEmInt * clamp(g, 0.25, 2.2);
          }
        }
      }
    }
    function restoreTint(list) {
      if (!list) return;
      for (var i = 0; i < list.length; i++) {
        var rec = list[i];
        if (rec.shader) rec.mat.uniforms.uColor.value.copy(rec.base);
        else {
          rec.mat.color.copy(rec.base);
          if (rec.baseEm && rec.mat.emissive) { rec.mat.emissive.copy(rec.baseEm); rec.mat.emissiveIntensity = rec.baseEmInt; }
        }
      }
    }

    // ------------------------------------------------------------------------------------------
    // Active system: bodies (planet, rings, moons, station, host star, binary, NPC)
    // ------------------------------------------------------------------------------------------
    var bodyRoot = new T.Group();
    scene.add(bodyRoot);
    var st = { sys: null, sysIdx: -1, simTimeS: 0, diorama: null };
    var bodies = [];
    var bodyByKey = {};
    var extraDispose = [];

    function sysPlanet(idx) {
      var ps = st.sys && st.sys.planets;
      if (ps && ps[idx]) return ps[idx];
      return st.sys ? st.sys.planet : null;
    }
    function primaryStateKm(ref, t) {
      // returns star-relative world position of a body ref {kind,planetIdx,moonIdx}
      if (!st.sys) return [0, 0, 0];
      if (!ref || ref.kind === 'star' || !Galaxy.getBodyWorldState) return [0, 0, 0];
      var s = Galaxy.getBodyWorldState(st.sys, ref, t);
      return s && s.rKm ? [s.rKm[0], s.rKm[1], s.rKm[2]] : [0, 0, 0];
    }
    function primaryWorldState(ref, t) {
      if (!st.sys || !ref || ref.kind === 'star' || !Galaxy.getBodyWorldState) {
        return { rKm: [0, 0, 0], vKmS: [0, 0, 0] };
      }
      var s = Galaxy.getBodyWorldState(st.sys, ref, t);
      return {
        rKm: s && s.rKm ? [s.rKm[0], s.rKm[1], s.rKm[2]] : [0, 0, 0],
        vKmS: s && s.vKmS ? [s.vKmS[0], s.vKmS[1], s.vKmS[2]] : [0, 0, 0]
      };
    }
    function keplerOrbitalState(el, mu, t) {
      if (!(el && el.a > 0 && mu > 0)) return { rKm: [0, 0, 0], vKmS: [0, 0, 0] };
      var e = clamp(el.e || 0, 0, 0.95);
      var n = Math.sqrt(mu / (el.a * el.a * el.a));
      var tau = Math.PI * 2;
      var M = ((((el.M0 || 0) + n * (t || 0)) % tau) + tau) % tau;
      var E = M;
      for (var it = 0; it < 8; it++) {
        E = E - (E - e * Math.sin(E) - M) / Math.max(1e-6, 1 - e * Math.cos(E));
      }
      var nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E * 0.5), Math.sqrt(1 - e) * Math.cos(E * 0.5));
      if (Orbits && Orbits.elementsToState) {
        return Orbits.elementsToState({
          a: el.a, e: e, iRad: el.iRad || 0,
          omegaAscRad: el.omegaAscRad || 0, argPeriRad: el.argPeriRad || 0, nuRad: nu
        }, mu);
      }
      var r = el.a * (1 - e * Math.cos(E));
      var ci = Math.cos(el.iRad || 0), si = Math.sin(el.iRad || 0);
      var cu = Math.cos(nu), su = Math.sin(nu);
      return { rKm: [r * cu, r * su * ci, r * su * si], vKmS: [-n * el.a * su, n * el.a * cu * ci, n * el.a * cu * si] };
    }

    var STELLAR_NOISE_GLSL =
      'float sHash3(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }' +
      'float sNoise3(vec3 x){' +
      '  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);' +
      '  return mix(mix(mix(sHash3(i), sHash3(i + vec3(1.0,0.0,0.0)), f.x),' +
      '                 mix(sHash3(i + vec3(0.0,1.0,0.0)), sHash3(i + vec3(1.0,1.0,0.0)), f.x), f.y),' +
      '             mix(mix(sHash3(i + vec3(0.0,0.0,1.0)), sHash3(i + vec3(1.0,0.0,1.0)), f.x),' +
      '                 mix(sHash3(i + vec3(0.0,1.0,1.0)), sHash3(i + vec3(1.0,1.0,1.0)), f.x), f.y), f.z);' +
      '}' +
      'float sFbm4(vec3 p){' +
      '  float v = 0.0; float a = 0.54;' +
      '  for (int i = 0; i < 4; i++) { v += a * sNoise3(p); p = p * 2.12 + vec3(1.9, 7.3, 3.7); a *= 0.5; }' +
      '  return v;' +
      '}' +
      'float sCells3(vec3 p){' +
      '  float v = 0.0; float a = 0.56;' +
      '  for (int i = 0; i < 3; i++) { float n = 1.0 - abs(sNoise3(p) * 2.0 - 1.0); v += a * n * n; p = p * 2.25 + vec3(4.1, 2.3, 8.5); a *= 0.48; }' +
      '  return v;' +
      '}';

    var starPool = {};
    function makeStarEntry(key, name, kind, tempK, radiusKm, getPos) {
      var col = (Galaxy.starRgbFromTemp ? Galaxy.starRgbFromTemp(tempK) : [1, 0.94, 0.82]);
      var seedVal = ((tempK || 5778) % 887) * 0.11 + (key === 'binary' ? 19.7 : 3.1);
      var cached = starPool[key];
      if (cached) {
        Object.assign(cached,{name:name,T:tempK,physR:radiusKm,getPos:getPos,baseCol:col});
        cached.coreMat.uniforms.uSeed.value=seedVal;
        cached.haloMat.uniforms.uSeed.value=seedVal;
        bodyRoot.add(cached.holder,cached.halo);
        bodies.push(cached);
        bodyByKey[key]=cached;
        return cached;
      }
      var coreMat = new T.ShaderMaterial({
        uniforms: {
          uColor: { value: new T.Color(col[0], col[1], col[2]) },
          uTempK: { value: Number(tempK) || 5778 },
          uGain: { value: 1.0 },
          uTime: { value: 0.0 },
          uSeed: { value: seedVal }
        },
        vertexShader:
          'varying vec3 vSphere;' +
          'varying vec3 vWorldN;' +
          'varying vec3 vViewV;' +
          'void main(){' +
          '  vSphere = normalize(position);' +
          '  vec4 wp = modelMatrix * vec4(position, 1.0);' +
          '  vWorldN = normalize(mat3(modelMatrix) * normal);' +
          '  vViewV = normalize(cameraPosition - wp.xyz);' +
          '  gl_Position = projectionMatrix * viewMatrix * wp;' +
          '}',
        fragmentShader:
          'uniform vec3 uColor; uniform float uTempK; uniform float uGain; uniform float uTime; uniform float uSeed;' +
          'varying vec3 vSphere; varying vec3 vWorldN; varying vec3 vViewV;' +
          STELLAR_NOISE_GLSL +
          'void main(){' +
          '  vec3 sp = normalize(vSphere);' +
          '  float ndv = clamp(dot(normalize(vWorldN), normalize(vViewV)), 0.0, 1.0);' +
          '  float cellFreq = uTempK < 3900.0 ? 5.5 : (uTempK > 7500.0 ? 13.0 : 9.5);' +
          '  vec3 tDrift = vec3(uTime * 0.09, -uTime * 0.07, uTime * 0.08) + vec3(uSeed);' +
          '  float gran = sCells3(sp * cellFreq + tDrift);' +
          '  float superG = sFbm4(sp * (cellFreq * 0.42) - tDrift * 0.55);' +
          '  float belt = exp(-pow((abs(sp.y) - 0.24) / 0.22, 2.0));' +
          '  float spot = smoothstep(0.66, 0.80, superG) * belt * (uTempK > 8200.0 ? 0.25 : 0.72);' +
          '  float faculae = smoothstep(0.56, 0.70, gran) * pow(1.0 - ndv, 1.4) * 0.55;' +
          // Physical Eddington limb darkening + hot core + chromospheric spicule rim
          '  float limb = 0.34 + 0.66 * pow(max(1e-4, ndv), 0.52);' +
          '  float boil = (0.58 + 0.95 * gran + 0.25 * superG) * (1.0 - spot * 0.58) + faculae;' +
          '  vec3 coolEdge = uColor * vec3(1.02, 0.76, 0.52);' +
          // Keep the hot core tinted (blue-white for A-types) so granulation survives the display shoulder
          '  vec3 hotCore = mix(uColor, vec3(1.0, 0.99, 1.0), 0.30);' +
          '  float cellL = limb * boil;' +
          '  vec3 surf = mix(coolEdge, hotCore, clamp(cellL * 0.75, 0.0, 1.0));' +
          '  surf *= 0.35 + 0.90 * cellL;' +
          '  float chromo = pow(max(1e-4, 1.0 - ndv), 4.2) * (0.6 + 0.6 * gran);' +
          '  surf += uColor * chromo * 0.85;' +
          '  vec3 outC = surf * (0.90 + 0.30 * limb) * uGain;' +
          // Filmic display shoulder: roll highlights off smoothly instead of clipping the disk to flat white
          '  outC = vec3(1.0) - exp(-1.25 * outC);' +
          '  gl_FragColor = vec4(outC, 1.0);' +
          '}',
        fog: false
      });
      coreMat.color = coreMat.uniforms.uColor.value;
      var geo = new T.SphereGeometry(1, 48, 36);
      var mesh = new T.Mesh(geo, coreMat);
      var haloGeo = new T.PlaneGeometry(1, 1);
      var haloMat = new T.ShaderMaterial({
        uniforms: {
          uColor: { value: new T.Color(col[0], col[1], col[2]) },
          uOpacity: { value: 0.94 },
          uTime: { value: 0.0 },
          uSeed: { value: seedVal }
        },
        vertexShader:
          'varying vec2 vUv;' +
          'void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader:
          'uniform vec3 uColor; uniform float uOpacity; uniform float uTime; uniform float uSeed;' +
          'varying vec2 vUv;' +
          STELLAR_NOISE_GLSL +
          'void main(){' +
          '  vec2 p = (vUv - 0.5) * 2.0;' +
          '  float r = length(p);' +
          '  if (r >= 0.99) discard;' +
          '  float edgeFade = smoothstep(0.99, 0.56, r);' +
          '  float ang = atan(p.y, p.x);' +
          '  float stream = sFbm4(vec3(cos(ang) * 2.6, sin(ang) * 2.6, r * 3.2 - uTime * 0.14 + uSeed));' +
          '  float kCorona = exp(-r * 5.2) * 0.95 + (0.14 / (0.08 + r * r * 5.5)) * (0.68 + 0.64 * stream);' +
          '  float sp4 = pow(max(0.0, cos(ang * 2.0)), 36.0) * exp(-r * 3.2) * 0.42;' +
          '  float spDiag = pow(max(0.0, cos((ang + 0.7854) * 2.0)), 48.0) * exp(-r * 4.4) * 0.20;' +
          '  float glow = (kCorona + sp4 + spDiag) * edgeFade * uOpacity;' +
          '  if (glow < 0.003) discard;' +
          '  vec3 cHot = mix(uColor, vec3(1.0, 0.99, 1.0), clamp(exp(-r * 7.5) * 0.75, 0.0, 0.75));' +
          '  vec3 outH = cHot * glow;' +
          '  gl_FragColor = vec4(outH / (vec3(1.0) + 0.22 * outH), clamp(glow, 0.0, 1.0));' +
          '}',
        transparent: true,
        blending: T.AdditiveBlending,
        depthWrite: false,
        side: T.DoubleSide,
        fog: false
      });
      haloMat.color = haloMat.uniforms.uColor.value;
      var halo = new T.Mesh(haloGeo, haloMat);
      halo.frustumCulled = false;
      bodyRoot.add(halo);
      return starPool[key] = addBody({
        key: key, name: name, kind: kind, T: tempK, physR: radiusKm, modelR: 1, model: mesh,
        halo: halo, haloMat: haloMat, coreMat: coreMat, baseCol: col, getPos: getPos, isStar: true, noAlign: true
      });
    }

    function addBody(o) {
      var holder = new T.Group();
      var orient = new T.Group();
      var align = new T.Group();
      if (!o.noAlign) align.rotation.x = Math.PI / 2;   // model +Y pole -> world +Z orbit normal
      holder.add(orient);
      orient.add(align);
      align.add(o.model);
      bodyRoot.add(holder);
      o.holder = holder;
      o.orient = orient;
      o.align = align;
      o.mats = o.isStar ? null : captureMats(o.model);
      o.tinted = false;
      o.vis = { dKm: 0, D: 0, Rr: 0, angRad: 0, n: [1, 0, 0], mode: 'local', visible: false, delta: 1 };
      bodies.push(o);
      bodyByKey[o.key] = o;
      return o;
    }

    function clearSystem() {
      for (var i = 0; i < bodies.length; i++) {
        var b = bodies[i];
        bodyRoot.remove(b.holder);
        if (b.halo) bodyRoot.remove(b.halo);
      }
      bodies.length = 0;
      bodyByKey = {};
      if (st.diorama && st.diorama.dispose) {
        try { st.diorama.dispose(); } catch (e) { /* diorama already torn down */ }
      }
      st.diorama = null;
      for (var k = 0; k < extraDispose.length; k++) {
        if (extraDispose[k] && extraDispose[k].dispose) extraDispose[k].dispose();
      }
      extraDispose.length = 0;
    }

    function planetColorFor(p) {
      var k = p && p.kind || '';
      if (/ice-giant/.test(k)) return 0x7fb8d8;
      if (/giant|saturn|disk|clouds/.test(k)) return 0xc9a27a;
      if (/ocean/.test(k)) return 0x4f86b8;
      if (/eyeball|rock/.test(k)) return 0xa4745c;
      return 0x8aa07f;
    }

    function mountWorldEffects(entry, body, primary) {
      var kind = body.kind || '', radius = entry.modelR;
      entry.effectMaterials = [];
      function mount(node, skipScale) {
        if (!skipScale) node.scale.multiplyScalar(radius);
        entry.model.add(node);
        node.traverse(function(child) {
          if (child.geometry && !extraDispose.includes(child.geometry)) extraDispose.push(child.geometry);
          if (child.material && !extraDispose.includes(child.material)) {
            extraDispose.push(child.material);
            entry.effectMaterials.push(child.material);
          }
        });
      }
      var giant = /giant|saturnian|clouds|disk|brown-dwarf/.test(kind);
      var atmoProf = !primary && Galaxy.bodyAtmoProfile
        ? Galaxy.bodyAtmoProfile(body, entry.kind === 'moon', (entry.planetIdx || 0) * 197 + (entry.moonIdx || 0) * 613)
        : null;
      if (atmoProf && Galaxy.createVolumetricAtmoMaterial) {
        var rIn = body.ringStyle === 'debris' ? 1.48 : 1.32;
        var rOut = body.ringStyle === 'debris' ? 3.65 : 2.15;
        var atmoMat = Galaxy.createVolumetricAtmoMaterial(T, 1.0, atmoProf, !!body.hasRings, rIn, rOut, body.ringStyle || 'saturn');
        var shell = new T.Mesh(new T.SphereGeometry(atmoProf.ratio, 64, 48), atmoMat);
        shell.renderOrder = 2;
        entry.volAtmo = { mesh: shell, mat: atmoMat, prof: atmoProf };
        mount(shell, false);
      }
      if (giant || body.name === 'Earth') mount(Galaxy.createAuroraRig(T));
      if (/^(Enceladus|Europa|Triton)$/.test(body.name) || kind === 'cryovolcanic') {
        var spray = new T.Mesh(new T.ConeGeometry(.052,.26,16,1,true), Galaxy.emissionMaterial(T,
          'float spray=(.35+.65*vUv.y)*(.7+.3*sin(vUv.x*25.+vUv.y*9.-uTime*3.)); gl_FragColor=vec4(.57,.87,1.,spray*.34);'));
        spray.position.y=-1.12;
        mount(spray);
      }
      if (body.isComet) {
        entry.comet = Galaxy.createCometRig(T);
        mount(entry.comet);
      }
      if (!primary && body.hasRings) {
        var mat = Galaxy.createSaturnianRingMaterial(T,body.ringPalette,1,body.ringStyle);
        var ring = new T.Mesh(Galaxy.makeRadialRingGeometry(T,1.32,2.15,96,2),mat);
        ring.rotation.x = -Math.PI/2;
        entry.rings = {ringMat:mat,ringMesh:ring};
        mount(ring);
      }
    }
    function rebuildSystem(sys, simTimeS, mode) {
      var dioramaOnly = !!mode;
      st.flybyOnly = mode === 'flyby';
      clearSystem();
      st.sys = sys || null;
      st.simTimeS = isNum(simTimeS) ? simTimeS : st.simTimeS;
      st.sysIdx = sys && SYSTEMS ? SYSTEMS.indexOf(sys) : -1;
      starState.valid = false;
      if (!dioramaOnly) {
        for (var cid in corridor) disposeCorridor(cid);
      }
      if (!sys) return null;

      var dio = !st.flybyOnly && Galaxy.buildSystemDiorama ? Galaxy.buildSystemDiorama(T, shared, Builder, sys) : null;
      st.diorama = dio;
      var t0 = st.simTimeS;

      // Host star
      var starR = sys.starRadiusKm || 695700;
      makeStarEntry('star', (sys.name || 'STAR') + '', 'star', sys.T || 5778, starR, function () { return [0, 0, 0]; });

      // Binary companion (physical separation ~ |offset| / 10 AU, along the catalog offset direction)
      if (sys.binary) {
        var off = arr3(sys.binary.offset) || [-30, 20, -100];
        var sepKm = Math.max(2, norm3(off) / 10) * AU_KM;
        var bDir = unit3(off);
        var bR = /^D/.test(sys.binary.cls || '') ? 8000 : starR * clamp(sys.binary.scale || 0.7, 0.2, 1.2);
        makeStarEntry('binary', sys.binary.name || 'COMPANION', 'binary', sys.binary.T || 5000, bR,
          function () { return scale3(bDir, sepKm); });
      }

      if (st.flybyOnly) return null;

      // Planets
      var planets = sys.planets && sys.planets.length ? sys.planets : (sys.planet ? [sys.planet] : []);
      planets.forEach(function (p, j) {
        var key = j === 0 ? 'planet' : 'planet' + j;
        var model, modelR, cMat = null, hasDio = (j === 0 && dio && dio.planetGroup);
        if (hasDio) {
          model = dio.planetGroup;
          modelR = dio.planetRadius || 28;
        } else {
          var geo = Galaxy.makeBodyGeometry(T,p,false);
          cMat = Galaxy.createCelestialBodyMaterial
            ? Galaxy.createCelestialBodyMaterial(T, {
                name: p.name || ('planet-' + j),
                kind: p.kind || '',
                isMoon: false,
                col: planetColorFor(p),
                seed: (sys.T || 5778) + (j + 1) * 409
              })
            : new T.MeshStandardMaterial({ color: planetColorFor(p), roughness: 0.78, metalness: 0.04, fog: false });
          model = new T.Mesh(geo, cMat);
          modelR = 1;
          extraDispose.push(geo, cMat);
        }
        var pSegs = hasDio ? 64 : (geo && geo.parameters && geo.parameters.widthSegments) || null;
        var e = addBody({
          key: key, name: (p.name || ('PLANET ' + (j + 1))) + '', kind: 'planet', T: sys.T || 5778,
          physR: p.radiusKm || 6400, modelR: modelR, model: model, planetIdx: j, celestialMat: cMat, spin: hasDio ? 0 : 0.032,
          geoSegments: pSegs,
          paletteId: Galaxy.gasGiantPalette && /saturnian|giant|disk|clouds/.test(p.kind || '')
            ? Galaxy.gasGiantPalette(p, (sys.T || 5778) + (j === 0 ? sys.name.charCodeAt(0) * 137 : (j + 1) * 409)).id : null,
          rings: hasDio && dio.ringMesh ? dio : null,
          getPos: function (t) { return primaryStateKm({ kind: 'planet', planetIdx: j }, t); }
        });
        if (hasDio) { e.dioramaPlanet = true; }
        mountWorldEffects(e,p,hasDio);
        // Moons of this planet
        (p.moons || []).forEach(function (m, k) {
          if (!m.radiusKm || !m.orbitRadiusKm) return;
          var mg = Galaxy.makeBodyGeometry(T,m,true);
          var mm = Galaxy.createCelestialBodyMaterial
            ? Galaxy.createCelestialBodyMaterial(T, {
                name: m.name || ('moon-' + j + '-' + k),
                isMoon: true, kind: m.kind,
                col: m.col || 0xc8d2e0,
                seed: (sys.T || 5778) + (j + 1) * 197 + (k + 1) * 613
              })
            : new T.MeshStandardMaterial({ color: m.col || 0xc8d2e0, roughness: 0.78, metalness: 0.04, fog: false });
          extraDispose.push(mg, mm);
          var mSegs = (mg && mg.parameters && mg.parameters.widthSegments) || null;
          var moonEntry = addBody({
            key: 'moon:' + j + ':' + k, name: (m.name || ('MOON ' + (k + 1))) + '', kind: 'moon', T: sys.T || 5778,
            physR: m.radiusKm, modelR: 1, model: new T.Mesh(mg, mm), planetIdx: j, moonIdx: k, celestialMat: mm, spin: 0.024,
            geoSegments: mSegs,
            getPos: function (t) { return primaryStateKm({ kind: 'moon', planetIdx: j, moonIdx: k }, t); }
          });
          mountWorldEffects(moonEntry,m,false);
        });
      });

      // Mapped per-system H2O ice deposits on deterministic Keplerian orbits
      var sysDeps = Galaxy.getSystemIceDeposits ? Galaxy.getSystemIceDeposits(sys) : [];
      sysDeps.forEach(function (dep, di) {
        var meshObj = makeIceDepositMesh(dep, (sys.T || 5778) + di * 37);
        extraDispose.push(meshObj);
        addBody({
          key: 'ice:' + dep.id,
          depositId: dep.id,
          deposit: dep,
          name: (dep.name || ('ICE-' + (di + 1))) + '',
          kind: 'ice-deposit',
          T: 180,
          physR: dep.radiusKm || 10,
          modelR: 5.5,
          model: meshObj.group,
          iceMesh: meshObj,
          noAlign: true,
          spin: 0.075,
          getPos: function (t) {
            return Galaxy.getIceDepositWorldState ? Galaxy.getIceDepositWorldState(sys, dep, t).rKm : [0, 0, 0];
          }
        });
      });

      // Station & local patrolling NPCs only exist in inhabited systems
      var parentIdx = (sys.station && sys.station.parentPlanetIdx) || 0;
      var parentPlanet = sysPlanet(parentIdx);
      if (parentPlanet && Orbits && Orbits.ensureBodyGravity) {
        Orbits.ensureBodyGravity(parentPlanet, { muKm3S2: sys.muStarKm3S2 }, false);
      }
      if (sys.station) {
        var stationPos = function (t) { return primaryStateKm({ kind: 'station', planetIdx: parentIdx }, t); };
        if (dio && dio.station && dio.station.group) {
          var sg = dio.station.group;
          sg.position.set(0, 0, 0);
          sg.rotation.set(0, 0, 0);
          sg.scale.setScalar(1);
          addBody({
            key: 'station', name: (sys.station.name || 'STATION') + '', kind: 'station', T: 5200,
            physR: STATION_KM * 0.5, modelR: 7.2, model: sg, noAlign: true, getPos: stationPos, spin: 0.12
          });
        }

        // Local orbital NPC Lighthuggers on genuine Keplerian trajectories around parentPlanet (driven by simTimeS)
        var stOrbitR = sys.station.orbitRadiusKm || ((parentPlanet ? parentPlanet.radiusKm : 60000) * 3.6);
        var stInc = sys.station.incRad || 0.07;
        var stPhase = sys.station.phaseRad || 1.4;
        var parentMu = (parentPlanet && parentPlanet.muKm3S2) || 37931207;
        if (dio && dio.npcVessel && dio.npcVessel.group) {
          var ng = dio.npcVessel.group;
          ng.position.set(0, 0, 0);
          ng.rotation.set(0, 0, 0);
          ng.traverse(function (ch) { ch.frustumCulled = false; });
          var npcLen = Math.max(10, (dio.npcVessel.bowX || 22) - (dio.npcVessel.sternX || -18));
          dio.npcVessel.setPlumeIntensity(0.28);
          var npcEl = { a: stOrbitR * 1.00004, e: 0.00025, iRad: stInc + 0.00008, omegaAscRad: 0, argPeriRad: 0, M0: stPhase + 0.00009 };
          var getNpcOrbit = function (t) {
            var pW = primaryWorldState({ kind: 'planet', planetIdx: parentIdx }, t);
            var rel = keplerOrbitalState(npcEl, parentMu, t);
            return { rKm: add3(pW.rKm, rel.rKm), vKmS: add3(pW.vKmS, rel.vKmS), relVKmS: rel.vKmS };
          };
          addBody({
            key: 'npc', name: (dio.npcGenome && dio.npcGenome.name || 'NPC LIGHTHUGGER') + '', kind: 'npc', T: 4800,
            physR: SHIP_KM * 0.5, modelR: npcLen * 0.5, model: ng, noAlign: true, npcVessel: dio.npcVessel,
            getOrbitState: getNpcOrbit,
            getPos: function (t) { return getNpcOrbit(t).rKm; }
          });
        }
        if (Genome && Builder) {
          var npc2Seed = ((sys.T || 5778) * 31 + sys.id.charCodeAt(0) * 709) | 0;
          var npc2Genome = Genome.randomGenome(npc2Seed);
          var npc2Vessel = Builder.buildVessel(T, shared, npc2Genome, { hideIce: false });
          if (npc2Vessel && npc2Vessel.group) {
            var ng2 = npc2Vessel.group;
            ng2.position.set(0, 0, 0);
            ng2.rotation.set(0, 0, 0);
            ng2.traverse(function (ch) { ch.frustumCulled = false; });
            var npc2Len = Math.max(10, (npc2Vessel.bowX || 22) - (npc2Vessel.sternX || -18));
            npc2Vessel.setPlumeIntensity(0.22);
            extraDispose.push({ dispose: function () { npc2Vessel.dispose(); } });
            var npc2El = { a: stOrbitR * 1.05, e: 0.04, iRad: stInc + 0.14, omegaAscRad: 0.45, argPeriRad: 0.25, M0: stPhase - 0.55 };
            var getNpc2Orbit = function (t) {
              var pW = primaryWorldState({ kind: 'planet', planetIdx: parentIdx }, t);
              var rel = keplerOrbitalState(npc2El, parentMu, t);
              return { rKm: add3(pW.rKm, rel.rKm), vKmS: add3(pW.vKmS, rel.vKmS), relVKmS: rel.vKmS };
            };
            addBody({
              key: 'npc2', name: (npc2Genome && npc2Genome.name || 'ORBITAL LIGHTHUGGER') + '', kind: 'npc', T: 4950,
              physR: SHIP_KM * 0.5, modelR: npc2Len * 0.5, model: ng2, noAlign: true, npcVessel: npc2Vessel,
              getOrbitState: getNpc2Orbit,
              getPos: function (t) { return getNpc2Orbit(t).rKm; }
            });
          }
        }
      }
      return dio;
    }

    // ------------------------------------------------------------------------------------------
    // Orbit curves + markers
    // ------------------------------------------------------------------------------------------
    var ORBIT_PTS = 320;
    function makeCurve(color, segments) {
      var n = segments ? (ORBIT_PTS - 1) * 2 : ORBIT_PTS;
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(new Float32Array(n * 3), 3));
      var m = new T.ShaderMaterial({
        uniforms: { uColor: { value: new T.Color(color) }, uOpacity: { value: 0.92 } },
        vertexShader: 'varying vec3 vWorld; varying float vFade;' +
          'void main(){ vec4 w = modelMatrix * vec4(position,1.0); vWorld=w.xyz;' +
          'vFade=smoothstep(52.0,115.0,min(length(w.xyz),distance(w.xyz,cameraPosition)));' +
          'gl_Position=projectionMatrix*viewMatrix*w; }',
        // Fragment distance masks only the immediate ship hull volume without hiding close trajectories.
        fragmentShader: 'uniform vec3 uColor; uniform float uOpacity; varying vec3 vWorld; varying float vFade;' +
          'void main(){ float d=min(length(vWorld),distance(vWorld,cameraPosition));' +
          'float a=uOpacity*vFade*smoothstep(52.0,115.0,d); if(a<0.001) discard; gl_FragColor=vec4(uColor,a); }',
        transparent: true, depthWrite: false, polygonOffset: true,
        polygonOffsetFactor: -1, polygonOffsetUnits: -1
      });
      var obj = segments ? new T.LineSegments(g, m) : new T.Line(g, m);
      obj.frustumCulled = false;
      obj.visible = false;
      obj.renderOrder = 5;
      obj.userData.proj = new Float32Array(ORBIT_PTS * 3);
      scene.add(obj);
      return obj;
    }
    function makeRibbon(color, dashed) {
      var vCount = ORBIT_PTS * 2;
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(new Float32Array(vCount * 3), 3));
      g.setAttribute('aSide', new T.BufferAttribute(new Float32Array(vCount), 1));
      g.setAttribute('aArc', new T.BufferAttribute(new Float32Array(vCount), 1));
      var idx = [];
      for (var i = 0; i < ORBIT_PTS - 1; i++) {
        var i0 = i * 2, i1 = i0 + 1, i2 = i0 + 2, i3 = i0 + 3;
        idx.push(i0, i2, i1, i1, i2, i3);
      }
      g.setIndex(idx);
      var m = new T.ShaderMaterial({
        uniforms: {
          uColor: { value: new T.Color(color) },
          uOpacity: { value: 0.22 },
          uDash: { value: dashed ? 1.0 : 0.0 },
          uTime: { value: 0.0 }
        },
        vertexShader:
          'attribute float aSide; attribute float aArc;' +
          'varying float vSide; varying float vArc; varying float vFade;' +
          'void main(){' +
          '  vSide = aSide; vArc = aArc;' +
          '  vec4 w = modelMatrix * vec4(position, 1.0);' +
          '  vFade = smoothstep(52.0, 115.0, min(length(w.xyz), distance(w.xyz, cameraPosition)));' +
          '  gl_Position = projectionMatrix * viewMatrix * w;' +
          '}',
        fragmentShader:
          'uniform vec3 uColor; uniform float uOpacity; uniform float uDash; uniform float uTime;' +
          'varying float vSide; varying float vArc; varying float vFade;' +
          'void main(){' +
          '  if (vFade < 0.002) discard;' +
          '  float core = 0.18 + 0.82 * exp(-vSide * vSide * 8.0);' +
          '  float pulse = uDash > 0.5 ? (0.28 + 0.72 * smoothstep(-0.15, 0.55, sin(vArc * 96.0 - uTime * 4.2))) : 1.0;' +
          '  float a = uOpacity * vFade * core * pulse;' +
          '  if (a < 0.002) discard;' +
          '  gl_FragColor = vec4(uColor * (1.0 + 0.45 * core), a);' +
          '}',
        transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false
      });
      var mesh = new T.Mesh(g, m);
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.renderOrder = 4;
      scene.add(mesh);
      return mesh;
    }
    var curveCurrent = makeCurve(0x63ff8d, false);
    var curveTransfer = makeCurve(0x00f0ff, true);
    var curveTarget = makeCurve(0xffb84d, false);
    var ribbonCurrent = makeRibbon(0x63ff8d, false);
    var ribbonTransfer = makeRibbon(0x00f0ff, true);
    var ribbonTarget = makeRibbon(0xffb84d, false);
    var curveCache = { cur: { key: '', pts: null }, xfer: { key: '', pts: null }, tgt: { key: '', pts: null } };

    var GUIDE_COUNT = 5;
    var gPts = [];
    for (var gk = 0; gk < 8; gk++) {
      var ga2 = gk * Math.PI * 0.25;
      gPts.push(new T.Vector3(Math.cos(ga2), Math.sin(ga2), 0));
    }
    var guideGeo = new T.BufferGeometry().setFromPoints(gPts);
    var guideMat = new T.LineBasicMaterial({
      color: 0x63ff8d, transparent: true, opacity: 0.34,
      depthWrite: false, blending: T.AdditiveBlending, fog: false
    });
    var guideRings = [];
    for (var gi = 0; gi < GUIDE_COUNT; gi++) {
      var grMesh = new T.LineLoop(guideGeo, guideMat);
      grMesh.visible = false;
      grMesh.renderOrder = 5;
      grMesh.frustumCulled = false;
      scene.add(grMesh);
      guideRings.push(grMesh);
    }

    // 3D Holographic Burn Node Gate (outer torus + inner diamond + dv thrust vector arrow)
    var nodeGate = new T.Group();
    nodeGate.visible = false;
    var nodeOuterMat = new T.MeshBasicMaterial({
      color: 0xffb84d, transparent: true, opacity: 0.78,
      depthTest: false, depthWrite: false, blending: T.AdditiveBlending, fog: false
    });
    var nodeOuterRing = new T.Mesh(new T.TorusGeometry(1.0, 0.032, 10, 48), nodeOuterMat);
    var nodeDiamondPts = [
      new T.Vector3(0, 0.56, 0), new T.Vector3(0.56, 0, 0),
      new T.Vector3(0, -0.56, 0), new T.Vector3(-0.56, 0, 0), new T.Vector3(0, 0.56, 0)
    ];
    var nodeDiamondGeo = new T.BufferGeometry().setFromPoints(nodeDiamondPts);
    var nodeInnerMat = new T.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.92, depthTest: false, depthWrite: false });
    var nodeInnerDiamond = new T.Line(nodeDiamondGeo, nodeInnerMat);
    var nodeArrowGroup = new T.Group();
    var nodeArrowShaftGeo = new T.CylinderGeometry(0.032, 0.032, 1.0, 8);
    nodeArrowShaftGeo.translate(0, 0.5, 0);
    var nodeArrowTipGeo = new T.ConeGeometry(0.11, 0.32, 10);
    nodeArrowTipGeo.translate(0, 1.14, 0);
    var nodeArrowMat = new T.MeshBasicMaterial({
      color: 0x63ff8d, transparent: true, opacity: 0.88,
      depthTest: false, depthWrite: false, blending: T.AdditiveBlending, fog: false
    });
    nodeArrowGroup.add(new T.Mesh(nodeArrowShaftGeo, nodeArrowMat));
    nodeArrowGroup.add(new T.Mesh(nodeArrowTipGeo, nodeArrowMat));
    nodeArrowGroup.visible = false;
    [nodeOuterRing, nodeInnerDiamond, nodeArrowGroup].forEach(function (ch) {
      ch.renderOrder = 8;
      ch.frustumCulled = false;
    });
    nodeGate.add(nodeOuterRing);
    nodeGate.add(nodeInnerDiamond);
    nodeGate.add(nodeArrowGroup);
    scene.add(nodeGate);

    function makeMarker(color, tex, sz) {
      var m = new T.SpriteMaterial({ map: tex, color: color, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, fog: false });
      var s = new T.Sprite(m);
      s.visible = false;
      s.renderOrder = 8;
      s.userData.pxAng = sz;
      scene.add(s);
      return s;
    }
    var mkPe = makeMarker(0x63ff8d, ringTex, 0.024);
    var mkAp = makeMarker(0x63ff8d, ringTex, 0.024);
    var mkNode = makeMarker(0xffb84d, spikeTex, 0.036);
    var mkTransferPe = makeMarker(0x00f0ff, ringTex, 0.028);

    function elKey(el, mu) {
      return [el.a, el.e, el.iRad, Math.abs(el.iRad || 0) < 1e-4 ? 0 : el.omegaAscRad,
        el.e < 1e-4 ? 0 : el.argPeriRad, el.rp, mu].map(function (v) {
        return isNum(v) ? v.toPrecision(7) : 'x';
      }).join('|');
    }
    function pickEl(o) {
      if (!o) return null;
      if (o.el) return o.el;
      if (o.predictedTransferEl) return o.predictedTransferEl;
      if (o.targetEl) return o.targetEl;
      if (isNum(o.a) && isNum(o.e)) return o;
      if (isNum(o.rpKm) || isNum(o.radiusKm)) {
        var rp = o.rpKm || o.radiusKm, ra = o.raKm || rp;
        return {
          a: (rp + ra) / 2, e: (ra - rp) / (ra + rp), rp: rp, ra: ra, iRad: o.incRad || 0,
          omegaAscRad: o.lanRad || 0, argPeriRad: o.argPeriRad || 0, nuRad: 0
        };
      }
      return null;
    }
    function sampleCached(cache, o, mu, anchorNuRad) {
      var el = pickEl(o);
      if (!el || !Orbits || !(mu > 0)) return null;
      if (isNum(anchorNuRad)) {
        // Dense forward sampling right out of the ship's current true anomaly for kink-free Helm curves.
        var stableLoc = Object.assign({}, el);
        var ptsLoc = [];
        var bound = stableLoc.e < 1;
        var span = bound ? Math.PI * 2 : 0.72;
        var per = null;
        try {
          for (var lj = 0; lj < ORBIT_PTS; lj++) {
            var u = lj / (ORBIT_PTS - 1);
            var off = bound ? (Math.pow(u, 1.55) * span) : (Math.pow(u, 1.55) * span);
            ptsLoc.push(Orbits.elementsToState(Object.assign({}, stableLoc, { nuRad: anchorNuRad + off }), mu).rKm);
          }
          if (bound) ptsLoc[ORBIT_PTS - 1] = ptsLoc[0].slice();
          per = Orbits.elementsToState(Object.assign({}, stableLoc, { nuRad: 0 }), mu).rKm;
          var apo = bound ? Orbits.elementsToState(Object.assign({}, stableLoc, { nuRad: Math.PI }), mu).rKm : null;
          return { points: ptsLoc, periapsis: per, apoapsis: apo };
        } catch (eLoc) { /* fall through to standard sampling */ }
      }
      var key = elKey(el, mu);
      if (cache.key === key && cache.pts) return cache.pts;
      var out = null;
      // Canonicalize the sampling origin as well as the cache key: otherwise a small
      // change in a/e would resample the same circle at a noisy periapsis angle.
      var stableEl = Object.assign({}, el);
      if (stableEl.e < 1e-4) stableEl.argPeriRad = 0;
      if (Math.abs(stableEl.iRad || 0) < 1e-4) stableEl.omegaAscRad = 0;
      try { out = Orbits.sampleOrbitPoints(stableEl, mu, ORBIT_PTS); } catch (e) { out = null; }
      // sampleOrbitPoints spans -PI..+PI for bound ellipses. Close to the exact
      // first vertex rather than allowing roundoff to leave a tiny seam.
      if (out && out.points && stableEl.e < 1) out.points[out.points.length - 1] = out.points[0].slice();
      cache.key = key;
      cache.pts = out && out.points ? out : null;
      return cache.pts;
    }
    function explicitPoints(o) {
      if (o && Array.isArray(o.points) && o.points.length > 2) {
        return { points: o.points, periapsis: o.periapsis || null, apoapsis: o.apoapsis || null };
      }
      return null;
    }

    // Project world-km offset relative to the observer into a scene position; returns D (units).
    function projectWorld(dWorld, fr, out) {
      var o = observe(dWorld, fr);
      var D = shellDistance(o.dKm);
      out[0] = o.n[0] * D; out[1] = o.n[1] * D; out[2] = o.n[2] * D;
      return o;
    }

    function fillRibbon(ribbon, projPts, count, widthFrac, dashed) {
      if (!ribbon || !projPts || count < 2) { if (ribbon) ribbon.visible = false; return; }
      var pos = ribbon.geometry.attributes.position.array;
      var side = ribbon.geometry.attributes.aSide.array;
      var arc = ribbon.geometry.attributes.aArc.array;
      var cxCam = camera.position.x, cyCam = camera.position.y, czCam = camera.position.z;
      for (var i = 0; i < ORBIT_PTS; i++) {
        var idx = Math.min(i, count - 1);
        var px = projPts[3 * idx], py = projPts[3 * idx + 1], pz = projPts[3 * idx + 2];
        var iA = Math.max(0, idx - 1), iB = Math.min(count - 1, idx + 1);
        var tx = projPts[3 * iB] - projPts[3 * iA];
        var ty = projPts[3 * iB + 1] - projPts[3 * iA + 1];
        var tz = projPts[3 * iB + 2] - projPts[3 * iA + 2];
        var vx = cxCam - px, vy = cyCam - py, vz = czCam - pz;
        var sx = vy * tz - vz * ty, sy = vz * tx - vx * tz, sz = vx * ty - vy * tx;
        var sl = Math.sqrt(sx * sx + sy * sy + sz * sz);
        if (sl > 1e-9) { sx /= sl; sy /= sl; sz /= sl; }
        else { sx = 0; sy = 1; sz = 0; }
        var distCam = Math.sqrt(vx * vx + vy * vy + vz * vz);
        var halfW = clamp(distCam * widthFrac, 0.55, 58);
        var v2 = i * 2;
        pos[v2 * 3] = px - sx * halfW; pos[v2 * 3 + 1] = py - sy * halfW; pos[v2 * 3 + 2] = pz - sz * halfW;
        pos[(v2 + 1) * 3] = px + sx * halfW; pos[(v2 + 1) * 3 + 1] = py + sy * halfW; pos[(v2 + 1) * 3 + 2] = pz + sz * halfW;
        side[v2] = -1; side[v2 + 1] = 1;
        var uArc = i / Math.max(1, count - 1);
        arc[v2] = uArc; arc[v2 + 1] = uArc;
      }
      ribbon.geometry.attributes.position.needsUpdate = true;
      ribbon.geometry.attributes.aSide.needsUpdate = true;
      ribbon.geometry.attributes.aArc.needsUpdate = true;
      ribbon.visible = true;
      if (dashed && ribbon.material.uniforms.uTime) ribbon.material.uniforms.uTime.value = anim.t;
    }

    function fillCurve(curve, set, primaryKm, fr, segments, ribbon, ribbonFrac) {
      if (!set || !set.points || set.points.length < 2) {
        curve.visible = false;
        if (ribbon) ribbon.visible = false;
        return;
      }
      var pts = set.points;
      var attr = curve.geometry.attributes.position;
      var arr = attr.array;
      var proj = curve.userData.proj;
      var tmp = [0, 0, 0];
      var total = pts.length;
      var obs = fr.observerKm;
      for (var k = 0; k < ORBIT_PTS; k++) {
        var srcIdx = total <= ORBIT_PTS
          ? Math.min(k, total - 1)
          : Math.min(total - 1, Math.round(k * (total - 1) / (ORBIT_PTS - 1)));
        var p = pts[srcIdx];
        var dW = [primaryKm[0] + p[0] - obs[0], primaryKm[1] + p[1] - obs[1], primaryKm[2] + p[2] - obs[2]];
        projectWorld(dW, fr, tmp);
        proj[3 * k] = tmp[0]; proj[3 * k + 1] = tmp[1]; proj[3 * k + 2] = tmp[2];
      }
      var validPts = Math.min(total, ORBIT_PTS);
      if (segments) {
        for (var i = 0; i < ORBIT_PTS - 1; i++) {
          var on = (i % 2 === 0) && i + 1 < validPts;
          var o6 = i * 6, iA = Math.min(i, validPts - 1), iB = Math.min(i + 1, validPts - 1);
          arr[o6] = proj[3 * iA]; arr[o6 + 1] = proj[3 * iA + 1]; arr[o6 + 2] = proj[3 * iA + 2];
          if (on) {
            arr[o6 + 3] = proj[3 * iB]; arr[o6 + 4] = proj[3 * iB + 1]; arr[o6 + 5] = proj[3 * iB + 2];
          } else {
            arr[o6 + 3] = proj[3 * iA]; arr[o6 + 4] = proj[3 * iA + 1]; arr[o6 + 5] = proj[3 * iA + 2];
          }
        }
      } else {
        for (var j = 0; j < ORBIT_PTS; j++) {
          var idxJ = Math.min(j, validPts - 1);
          arr[3 * j] = proj[3 * idxJ]; arr[3 * j + 1] = proj[3 * idxJ + 1]; arr[3 * j + 2] = proj[3 * idxJ + 2];
        }
      }
      attr.needsUpdate = true;
      curve.visible = true;
      if (ribbon) fillRibbon(ribbon, proj, validPts, ribbonFrac || 0.0045, segments);
    }

    function placeMarker(mk, kmRelPrimary, primaryKm, fr, tmp) {
      if (!kmRelPrimary) { mk.visible = false; return null; }
      var obs = fr.observerKm;
      var dW = [primaryKm[0] + kmRelPrimary[0] - obs[0], primaryKm[1] + kmRelPrimary[1] - obs[1], primaryKm[2] + kmRelPrimary[2] - obs[2]];
      var o = projectWorld(dW, fr, tmp);
      mk.position.set(tmp[0], tmp[1], tmp[2]);
      var D = Math.sqrt(tmp[0] * tmp[0] + tmp[1] * tmp[1] + tmp[2] * tmp[2]);
      mk.scale.setScalar(Math.max(1e-3, D * mk.userData.pxAng * clamp(camera.fov / 44, 0.04, 1.6)));
      mk.visible = true;
      return { vec: new T.Vector3(tmp[0], tmp[1], tmp[2]), dKm: o.dKm };
    }

    // ------------------------------------------------------------------------------------------
    // Corridor vessels (genome contacts) + sextant contact markers
    // ------------------------------------------------------------------------------------------
    var corridorGroup = new T.Group();
    scene.add(corridorGroup);
    var contactGroup = new T.Group();
    scene.add(contactGroup);
    var corridor = {};
    var contactSprites = {};

    function disposeCorridor(id) {
      var c = corridor[id];
      if (!c) return;
      corridorGroup.remove(c.holder);
      c.vessel.dispose();
      delete corridor[id];
    }
    function ensureContact(ct) {
      var id = ct.id || ct.name;
      if (!contactSprites[id]) {
        var isV = ct.kind === 'vessel';
        var sm = new T.SpriteMaterial({
          map: isV ? spikeTex : discTex, color: isV ? 0xff9d72 : 0x554466, transparent: true,
          opacity: isV ? 0.85 : 0.0, depthWrite: false, depthTest: false
        });
        var sp = new T.Sprite(sm);
        contactGroup.add(sp);
        contactSprites[id] = sp;
      }
      if (ct.genome && !corridor[id] && Builder) {
        var v = Builder.buildVessel(T, shared, ct.genome, { hideIce: false, corridorMode: true, plumeScale: 9.5 });
        v.group.traverse(function (ch) { ch.frustumCulled = false; });
        var holder = new T.Group();
        var orient = new T.Group();
        holder.add(orient);
        orient.add(v.group);
        corridorGroup.add(holder);
        corridor[id] = { holder: holder, orient: orient, vessel: v, mats: captureMats(v.group) };
      }
    }
    function pruneContacts(list) {
      var keep = {};
      for (var i = 0; i < list.length; i++) keep[list[i].id || list[i].name] = true;
      for (var id in contactSprites) {
        if (!keep[id]) {
          contactGroup.remove(contactSprites[id]);
          contactSprites[id].material.dispose();
          delete contactSprites[id];
        }
      }
      for (var cid in corridor) if (!keep[cid]) disposeCorridor(cid);
    }

    // ------------------------------------------------------------------------------------------
    // Acceleration FX: ablation flakes, ISM streaks, Cherenkov bow glow
    // ------------------------------------------------------------------------------------------
    var N_DUST = 160;
    var dustPos = new Float32Array(N_DUST * 6);
    var dustMeta = [];
    for (var dI = 0; dI < N_DUST; dI++) {
      var maxTr = 12.0 + Math.random() * 20.0;
      var radAng = Math.random() * Math.PI * 2;
      dustMeta.push({
        ptIdx: dI * 3, dist: Math.random() * maxTr, maxTrail: maxTr, speedMul: 0.72 + Math.random() * 0.56,
        vy: Math.sin(radAng) * (0.28 + Math.random() * 0.65), vz: Math.cos(radAng) * (0.28 + Math.random() * 0.65)
      });
    }
    var dustGeo = new T.BufferGeometry();
    dustGeo.setAttribute('position', new T.BufferAttribute(dustPos, 3));
    var dustMat = new T.LineBasicMaterial({ color: 0xe6f8ff, transparent: true, opacity: 0.86, depthWrite: false });
    var dustLines = new T.LineSegments(dustGeo, dustMat);
    dustLines.frustumCulled = false;
    dustLines.visible = false;
    fxGroup.add(dustLines);

    var N_AMB = 240;
    var ambPos = new Float32Array(N_AMB * 6);
    var ambMeta = [];
    for (var aI = 0; aI < N_AMB; aI++) {
      var angA = Math.random() * Math.PI * 2, radA = 8 + Math.random() * 78;
      ambMeta.push({ x: -145 + Math.random() * 290, y: Math.cos(angA) * radA, z: Math.sin(angA) * radA, mul: 0.72 + Math.random() * 0.56 });
    }
    var ambGeo = new T.BufferGeometry();
    ambGeo.setAttribute('position', new T.BufferAttribute(ambPos, 3));
    var ambMat = new T.LineBasicMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.22, depthWrite: false });
    var ambLines = new T.LineSegments(ambGeo, ambMat);
    ambLines.frustumCulled = false;
    ambLines.visible = false;
    fxGroup.add(ambLines);

    // Physically grounded 3D conical GLSL ISM ionization / Cherenkov bow-shock sheath
    // (hugs the actual leading ice cone; driven strictly by relativistic P_ism = beta * gamma * (gamma - 1))
    var ismSheathGeo = (function () {
      var g = new T.CylinderGeometry(0.022, 1.0, 1.0, 56, 22, true);
      g.translate(0, 0.5, 0);
      g.rotateZ(-Math.PI * 0.5); // base at x = 0 (vUv.y = 0), apex at x = +1 (vUv.y = 1)
      var pos = g.attributes.position;
      for (var vi = 0; vi < pos.count; vi++) {
        var ux = clamp(pos.getX(vi), 0, 1);
        var ogive = Math.pow(Math.max(0.001, 1.0 - ux), 0.72) / Math.max(0.022, 1.0 - ux * 0.978);
        pos.setY(vi, pos.getY(vi) * ogive);
        pos.setZ(vi, pos.getZ(vi) * ogive);
      }
      pos.needsUpdate = true;
      g.computeVertexNormals();
      return g;
    })();
    var ismSheathMat = new T.ShaderMaterial({
      uniforms: {
        uIntensity: { value: 0.0 },
        uCherenkov: { value: 0.0 },
        uWarnHot: { value: 0.0 },
        uTime: { value: 0.0 }
      },
      vertexShader:
        'varying vec2 vUv;' +
        'varying vec3 vWorldN;' +
        'varying vec3 vViewV;' +
        'void main(){' +
        '  vUv = uv;' +
        '  vec4 wp = modelMatrix * vec4(position, 1.0);' +
        '  vWorldN = normalize(mat3(modelMatrix) * normal);' +
        '  vViewV = normalize(cameraPosition - wp.xyz);' +
        '  gl_Position = projectionMatrix * viewMatrix * wp;' +
        '}',
      fragmentShader:
        'uniform float uIntensity; uniform float uCherenkov; uniform float uWarnHot; uniform float uTime;' +
        'varying vec2 vUv; varying vec3 vWorldN; varying vec3 vViewV;' +
        'void main(){' +
        '  if (uIntensity < 0.002) discard;' +
        '  float s = clamp(vUv.y, 0.0, 1.0);' + // 1 = leading stagnation apex, 0 = waist skirt
        '  float ang = vUv.x * 6.2831853;' +
        '  float ndv = abs(dot(normalize(vWorldN), normalize(vViewV)));' +
        // Thin limb-hugging shock boundary layer (leaves central starfield crystal clear, glows at cone silhouette & apex)
        '  float fresnel = pow(max(1e-4, 1.0 - ndv), 2.1) * 0.88 + 0.12;' +
        '  float flow1 = 0.5 + 0.5 * sin(ang * 9.0 + (1.0 - s) * 22.0 - uTime * 15.0);' +
        '  float flow2 = 0.5 + 0.5 * cos(ang * 17.0 - (1.0 - s) * 34.0 - uTime * 23.0);' +
        '  float filament = 0.62 + 0.38 * (0.6 * flow1 + 0.4 * flow2);' +
        '  float stagCap = pow(s, 4.8) * 0.95;' +
        '  float wakeEnvelope = smoothstep(0.02, 0.24, s) * pow(s, 1.35);' +
        '  float alpha = clamp((wakeEnvelope * fresnel * filament * 0.56 + stagCap * 0.44) * uIntensity, 0.0, 0.72);' +
        '  if (alpha < 0.003) discard;' +
        '  vec3 h2Ion = vec3(0.32, 0.78, 1.00);' +
        '  vec3 cherenkovCol = mix(vec3(0.18, 0.58, 1.00), vec3(0.56, 0.42, 1.00), (1.0 - s) * 0.55);' +
        '  vec3 baseCol = mix(h2Ion, cherenkovCol, uCherenkov);' +
        '  baseCol = mix(baseCol, vec3(0.86, 0.96, 1.00), clamp(stagCap * 0.85, 0.0, 0.85));' +
        '  vec3 sputterCol = mix(vec3(1.00, 0.42, 0.14), vec3(1.00, 0.86, 0.55), stagCap);' +
        '  vec3 col = mix(baseCol, sputterCol, uWarnHot) * alpha * 1.95;' +
        '  gl_FragColor = vec4(col / (vec3(1.0) + 0.35 * col), alpha);' +
        '}',
      transparent: true,
      blending: T.AdditiveBlending,
      depthWrite: false,
      side: T.DoubleSide,
      fog: false
    });
    var ismSheath = new T.Mesh(ismSheathGeo, ismSheathMat);
    ismSheath.visible = false;
    ismSheath.renderOrder = 4;
    ismSheath.frustumCulled = false;
    fxGroup.add(ismSheath);
    var ismDiag = { power: 0, active: false, sheathIntensity: 0, cherenkovFore: 0, cherenkovAft: 0 };

    var snowInfo = { count: 0, min: [0, 0, 0], max: [0, 0, 0], meanDir: [0, 0, 0], windDir: [0, 0, 0], plumeDir: [-1, 0, 0], againstPlumeFrac: 0, active: false };

    // ------------------------------------------------------------------------------------------
    // Runtime animation state
    // ------------------------------------------------------------------------------------------
    var anim = {
      prevFlip: 0, flipRate: 0, kick: 0, plumeOn: 0.08, thrustG: 0, nodeDistKm: null, lastIce: 1, t: 0,
      view: 'helm', beta: 0, gamma: 1, fov: 44, paneShift: 0, shake: 0,
      menuSway: 0, menuSwayT: 0, menuDragged: false, menuActive: false, menuHoldUntil: 0,
      menuYaw: DEFAULT_YAW, menuPitch: DEFAULT_PITCH, menuZoom: DEFAULT_ZOOM
    };
    var lastIceFrac = -1;
    var lastSnap = {};
    var anchors = [];
    var lastContacts = [];
    var lastFrame = null;
    var lastView = 'helm';
    var lastHostObs = null;
    var lastTargetVec = new T.Vector3();
    var canvasSize = { w: 0, h: 0, clear: -1, pr: 0 };
    var viewOffset = { ox: 0, oy: 0 };
    var lastInfo = { bodies: [] };

    function syncViewOffset(w, h, ox, oy) {
      var cw = Math.max(1, w);
      var ch = Math.max(1, h);
      var rx = Math.round(ox || 0);
      var ry = Math.round(oy || 0);
      var asp = cw / ch;
      if (rx === viewOffset.ox && ry === viewOffset.oy && Math.abs(camera.aspect - asp) < 1e-6) return;
      viewOffset.ox = rx;
      viewOffset.oy = ry;
      camera.aspect = asp;
      if (rx !== 0 || ry !== 0) camera.setViewOffset(cw, ch, rx, ry, cw, ch);
      else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    }
    function applyViewOffset(w, h, clearPx) {
      var oy = (clearPx > 10 && h > clearPx + 120) ? Math.round(clearPx * 0.45) : 0;
      syncViewOffset(w, h, 0, oy);
    }
    function resize(w, h, clearPx) {
      var cw = Math.max(1, Math.floor(w || canvasEl.clientWidth || 800));
      var ch = Math.max(1, Math.floor(h || canvasEl.clientHeight || 450));
      var cp = Math.round(num(clearPx, 0));
      var pr = clamp(baseDpr * gfx.renderScale, 0.75, 3);
      if (Math.abs(renderer.getPixelRatio() - pr) > 1e-4) renderer.setPixelRatio(pr);
      if (cw !== canvasSize.w || ch !== canvasSize.h || Math.abs(pr - canvasSize.pr) > 1e-4) {
        renderer.setSize(cw, ch, false);
        canvasSize.w = cw; canvasSize.h = ch; canvasSize.pr = pr;
        viewOffset.ox = 1e9; viewOffset.oy = 1e9; // force projection sync after backing-buffer resize
        if (postRT) { postRT.dispose(); postRT = null; }
      }
      canvasSize.clear = cp;
      applyViewOffset(cw, ch, cp);
    }
    function pauseMenuOrbit(sec) {
      anim.menuHoldUntil = anim.t + Math.max(0.5, num(sec, 6.0));
    }
    function setGraphics(patch) {
      if (!patch || typeof patch !== 'object') return Object.assign({}, gfx);
      if (['off', 'fxaa', 'msaa4', 'ssaa2'].indexOf(patch.aa) >= 0) gfx.aa = patch.aa;
      if (patch.renderScale != null) gfx.renderScale = clamp(num(patch.renderScale, 1), 0.5, 2.0);
      if (patch.autoOrbit != null) gfx.autoOrbit = !!patch.autoOrbit;
      if (postRT) { postRT.dispose(); postRT = null; }
      canvasSize.pr = -1;
      resize(canvasEl.clientWidth, canvasEl.clientHeight, canvasSize.clear >= 0 ? canvasSize.clear : 0);
      return Object.assign({}, gfx);
    }
    function commitMenuSway() {
      anim.menuSway = 0;
      if (anim.menuActive) {
        anim.menuHoldUntil = anim.t + 6.0;
        anim.menuYaw = cam.orbitYaw;
        anim.menuPitch = cam.orbitPitch;
        anim.menuZoom = cam.orbitZoom;
      }
    }

    function resolveView(snap) {
      if (snap.view === 'menu' || snap.menuShowcase) return 'menu';
      var v = snap.view || snap.mode;
      if (v === 'tactical') v = 'orbit';
      if (v === 'helm' || v === 'drydock' || v === 'orbit' || v === 'sextant') return v;
      if (snap.sextant) return 'sextant';
      if (snap.tactical || (snap.cam && snap.cam.tactical)) return 'orbit';
      if (snap.drydock) return 'drydock';
      return 'helm';
    }

    function scopeAim(snap) {
      var s = arr3(snap.scope) || arr3(snap.scopeVec) || arr3(snap.aim);
      if (s) return unit3(s);
      var th = clamp(num(snap.scopeTheta, 16.5), 0, 180) * RAD;
      var az = num(snap.scopeAz, 0) * RAD;
      return [Math.cos(th), Math.sin(th) * Math.cos(az), Math.sin(th) * Math.sin(az)];
    }

    // Ship position relative to the host star (km, world axes).
    function resolveShipStarKm(snap, t) {
      var ov = arr3(snap.shipRelStarKm);
      if (ov) return ov;
      var orb = snap.orbit;
      var gal = null;
      var pg = arr3(snap.posGal);
      if (pg && st.sys && st.sys.xyz) {
        var dg = [pg[0] - st.sys.xyz[0], pg[1] - st.sys.xyz[1], pg[2] - st.sys.xyz[2]];
        gal = scale3(dg, LY_KM);
      }
      var rKm = orb && arr3(orb.rKm);
      if (rKm && (snap.mode !== 'interstellar' || !gal)) {
        var kind = orb.primary || orb.focusSoi || orb.focus || 'star';
        var ref = kind === 'moon'
          ? { kind: 'moon', planetIdx: orb.planetIdx || 0, moonIdx: orb.moonIdx || 0 }
          : kind === 'planet'
            ? { kind: 'planet', planetIdx: orb.planetIdx || 0 }
            : { kind: 'star' };
        return add3(primaryStateKm(ref, t), rKm);
      }
      if (gal) return gal;
      // no state supplied: park 12 km astern of the station so the scene is still meaningful
      var stn = bodyByKey.station;
      if (stn) { var sp = stn.getPos(t); return [sp[0] - 12, sp[1], sp[2]]; }
      return [AU_KM, 0, 0];
    }

    function primaryFor(snap, focus) {
      var orb = snap.orbit;
      if (focus && focus.kind) return focus;
      var kind = orb && (orb.primary || orb.focusSoi || orb.focus);
      if (kind === 'moon') return { kind: 'moon', planetIdx: orb.planetIdx || 0, moonIdx: orb.moonIdx || 0 };
      if (kind === 'planet') return { kind: 'planet', planetIdx: orb.planetIdx || 0 };
      return { kind: 'star' };
    }
    function muFor(ref) {
      if (!st.sys) return 0;
      if (ref.kind === 'star') return st.sys.muStarKm3S2 || 0;
      var p = sysPlanet(ref.planetIdx || 0);
      if (ref.kind === 'moon') {
        var m = p && p.moons && p.moons[ref.moonIdx || 0];
        if (!m) return 0;
        if (m.muKm3S2 > 0) return m.muKm3S2;
        return Orbits && Orbits.ensureBodyGravity ? Orbits.ensureBodyGravity(m, p, true).muKm3S2 : 0;
      }
      return p && p.muKm3S2 || 0;
    }

    // ------------------------------------------------------------------------------------------
    // Catalog star update (CPU aberration, Planck tint, beaming) + MW dome uniforms
    // ------------------------------------------------------------------------------------------
    function updateStarField(fr, posGal, ir, gammaV, snap) {
      var boostAxis = fr.boost;
      var hostVisible = !!(bodyByKey.star && bodyByKey.star.holder.visible && bodyRoot.visible);
      var discList = snap && Array.isArray(snap.discoveredSystems) ? snap.discoveredSystems : [];
      var key = [hostVisible, discList.length, fr.beta.toFixed(8), ...boostAxis.map(v => v.toFixed(5)),
        fr.f[0].toFixed(5), fr.f[1].toFixed(5), fr.f[2].toFixed(5),
        fr.y[0].toFixed(5), fr.y[1].toFixed(5), fr.y[2].toFixed(5),
        posGal ? posGal.map(v => v.toFixed(5)).join(',') : '-'].join('|');
      mwMat.uniforms.uBeta.value = fr.beta;
      mwMat.uniforms.uGamma.value = fr.gamma;
      mwMat.uniforms.uBoost.value.set(boostAxis[0], boostAxis[1], boostAxis[2]);
      mwMat.uniforms.uGalFromShip.value.set(
        fr.f[0], fr.y[0], fr.z[0],
        fr.f[1], fr.y[1], fr.z[1],
        fr.f[2], fr.y[2], fr.z[2]);
      mwMat.uniforms.uIrMode.value = ir ? 1.0 : 0.0;
      if (starState.valid && starState.key === key && starState.ir === ir && starState.activeIdx === st.sysIdx) return;
      starState.valid = true; starState.key = key; starState.ir = ir; starState.activeIdx = st.sysIdx;

      var pos = starGeo.attributes.position.array;
      var col = starGeo.attributes.color.array;
      var b = fr.beta, g = fr.gamma;
      var discMap = {};
      for (var dIdx = 0; dIdx < discList.length; dIdx++) discMap[discList[dIdx]] = true;
      for (var si = 0; si < N_SYS; si++) {
        var sys = SYSTEMS[si];
        var s0 = starCat[si];
        var dx = posGal ? sys.xyz[0] - posGal[0] : sys.xyz[0];
        var dy = posGal ? sys.xyz[1] - posGal[1] : sys.xyz[1];
        var dz = posGal ? sys.xyz[2] - posGal[2] : sys.xyz[2];
        var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        var charted = !sys.procedural || !!discMap[sys.id];
        s0.charted = charted;
        if (dist < 1e-10) { s0.gx = 1; s0.gy = 0; s0.gz = 0; s0.b = 2.55; }
        else {
          s0.hidden = false;
          s0.gx = dx / dist; s0.gy = dy / dist; s0.gz = dz / dist;
          var nearBoost = dist < 4.0 ? (1.25 / (0.65 + dist * 0.5)) : 0;
          s0.b = charted ? clamp(1.85 - 0.16 * Math.log(1 + dist) + nearBoost, 0.85, 2.55) : 0.55;
        }
        s0.hidden = si === st.sysIdx && hostVisible;   // host star is drawn by its angular-exact proxy
      }
      for (var i = 0; i < N_STARS; i++) {
        var s = starCat[i];
        var o = 3 * i;
        if (s.hidden) { col[o] = col[o + 1] = col[o + 2] = 0; pos[o] = SKY_R; pos[o + 1] = pos[o + 2] = 0; continue; }
        var rx = s.gx * fr.f[0] + s.gy * fr.f[1] + s.gz * fr.f[2];
        var ry = s.gx * fr.y[0] + s.gy * fr.y[1] + s.gz * fr.y[2];
        var rz = s.gx * fr.z[0] + s.gy * fr.z[1] + s.gz * fr.z[2];
        s.x0 = clamp(rx, -1, 1); s.y0 = ry; s.z0 = rz;
        var cosR = clamp(rx * boostAxis[0] + ry * boostAxis[1] + rz * boostAxis[2], -1, 1);
        var cosO = b > 1e-5 ? aberrateCos(b, cosR) : cosR;
        var delta = b > 1e-5 ? g * (1 + b * cosR) : 1.0;
        var k = 1 / delta, shift = cosO - cosR * k;
        var Tobs = s.T * delta;
        var rgb = bbColor(Tobs);
        var wienVis = Tobs < 1100 ? Math.exp(-3.0 * (1100 - Tobs) / 420) : 1.0;
        var rawBeam = Math.pow(clamp(delta, 0.04, 8.0), 3.0) * wienVis;
        var hdr = rawBeam / (1.0 + 0.32 * rawBeam);
        var floorI = i < N_SYS && starCat[i].charted !== false ? 0.16 : 0.04;
        var I = s.b * Math.max(floorI, hdr);
        var peak = Math.max(rgb[0], rgb[1], rgb[2], 1e-4);
        var boost = Math.min(2.6, peak * I) / peak;
        pos[o] = SKY_R * (k * rx + shift * boostAxis[0]);
        pos[o + 1] = SKY_R * (k * ry + shift * boostAxis[1]);
        pos[o + 2] = SKY_R * (k * rz + shift * boostAxis[2]);
        col[o] = rgb[0] * boost; col[o + 1] = rgb[1] * boost; col[o + 2] = rgb[2] * boost;
      }
      starGeo.attributes.position.needsUpdate = true;
      starGeo.attributes.color.needsUpdate = true;
      var dp = dbGeo.attributes.position.array, dc = dbGeo.attributes.color.array;
      for (var d = 0; d < N_SYS; d++) {
        dp[3 * d] = pos[3 * d]; dp[3 * d + 1] = pos[3 * d + 1]; dp[3 * d + 2] = pos[3 * d + 2];
        var beaconOn = starCat[d].charted !== false ? 0.9 : 0.0;
        dc[3 * d] = col[3 * d] * beaconOn; dc[3 * d + 1] = col[3 * d + 1] * beaconOn; dc[3 * d + 2] = col[3 * d + 2] * beaconOn;
      }
      dbGeo.attributes.position.needsUpdate = true;
      dbGeo.attributes.color.needsUpdate = true;
      lastStarFrame = fr;
    }

    function starObsDir(idx) {
      var a = starGeo.attributes.position.array, o = 3 * idx;
      return new T.Vector3(a[o] / SKY_R, a[o + 1] / SKY_R, a[o + 2] / SKY_R);
    }

    // ------------------------------------------------------------------------------------------
    // Body placement (the dual-scale angular-preserving proxy projection)
    // ------------------------------------------------------------------------------------------
    var tmpV = [0, 0, 0];
    function placeBodies(fr, t, animDt, tacticalMode, snap) {
      var obs = fr.observerKm;
      dockClampLine.visible = false;
      var starEntry = bodyByKey.star;
      var starWorld = [0, 0, 0];
      var hostObs = null;
      var mission = snap.mode === 'interstellar' && snap.mission;
      var veilLy = 0.015;
      var localBlend = 1;
      if (mission && st.sys.id === mission.destId) {
        localBlend = 1 - smoothstep01(snap.missionRemLy / veilLy);
      } else if (mission && st.sys.id === mission.departureId) {
        localBlend = 1 - smoothstep01(mission.travelledLy / veilLy);
      }
      var curHarvDepId = (snap.iceHarvest && snap.iceHarvest.active && snap.iceHarvest.depositId)
        || (snap.multiHop && snap.multiHop.harvestSite && snap.multiHop.harvestSite.depositId)
        || (snap.iceHarvestSite && snap.iceHarvestSite.depositId) || null;
      activeIceDepositDiag.id = null;
      activeIceDepositDiag.distKm = null;
      activeIceDepositDiag.visible = false;
      for (var i = 0; i < bodies.length; i++) {
        var e = bodies[i];
        var posKm = e.getPos(t);
        e.posKm = posKm;
        var dW = [posKm[0] - obs[0], posKm[1] - obs[1], posKm[2] - obs[2]];
        var o = observe(dW, fr);
        var dKm = Math.max(o.dKm, e.physR * 1.0005);
        var D = shellDistance(dKm);
        var ratio = clamp(e.physR / dKm, 0, 0.995);
        var Rr = D * ratio;
        var mode = dKm * UNITS_PER_KM <= LOCAL_MAX_UNITS ? 'local' : 'proxy';
        var angRad = Math.asin(ratio);
        // exact true size inside the local range (strictly smaller than D so origin stays outside body)
        if (mode === 'local') Rr = Math.min(e.physR * UNITS_PER_KM, D * 0.995);
        if (e.kind === 'ice-deposit') {
          var isActDep = !!(curHarvDepId && e.depositId === curHarvDepId);
          if (mode !== 'local' && (isActDep || o.dKm < 2.5e6) && localBlend > 0.001) {
            Rr = Math.max(Rr, D * (isActDep ? 0.0065 : 0.0028));
          }
        }
        if (!e.isStar) Rr *= localBlend;
        var sc = Rr / e.modelR;
        e.holder.position.set(o.n[0] * D, o.n[1] * D, o.n[2] * D);
        if (e.key === 'station' && !tacticalMode && (snap.docked || snap.menuShowcase || snap.view === 'menu')) {
          var hullFlip = num(snap.flipVisualRad, 0);
          // Park cleanly abeam on the planet (-Z) side of the waist collar while berthed or showcasing on Menu.
          var berth = new T.Vector3(
            10 * Math.cos(hullFlip) - 30 * Math.sin(hullFlip),
            7.5,
            -30 * Math.cos(hullFlip) - 10 * Math.sin(hullFlip)
          );
          e.holder.position.copy(berth);
          dockClampLine.visible = false;
        }
        // Cap visual Lorentz pancake compression along actual 3D boost direction fr.boost
        var bodyInvG = Math.max(0.10, fr.invG);
        var sx = sc * bodyInvG;
        if (fr.boostQ) e.holder.quaternion.copy(fr.boostQ);
        else e.holder.quaternion.identity();
        e.holder.scale.set(Math.max(1e-4, sx), Math.max(1e-4, sc), Math.max(1e-4, sc));
        if (fr.boostQInv) e.orient.quaternion.copy(fr.boostQInv).multiply(fr.q);
        else e.orient.quaternion.copy(fr.q);
        e.vis.dKm = o.dKm; e.vis.D = D; e.vis.Rr = Rr; e.vis.angRad = angRad; e.vis.n = o.n;
        e.vis.mode = mode; e.vis.delta = o.D; e.vis.pos = e.holder.position;
        // Orbital NPC Lighthuggers are visible in system views whenever not hidden by deep interstellar flight.
        var curView = resolveView(snap);
        var npcMaxKm = curView === 'sextant' ? 2500000 : 400000;
        e.holder.visible = e.kind === 'ice-deposit'
          ? (localBlend > 0.001 && (mode === 'local' || o.dKm < 2.5e7 || e.depositId === curHarvDepId))
          : (localBlend > 0.001 && (e.kind !== 'npc' || (o.dKm < npcMaxKm &&
            (curView === 'sextant' || curView === 'orbit' ||
            (curView === 'helm' && !snap.menuShowcase && (snap.mode !== 'interstellar' || snap.transitStage === 'capture'))))));
        e.vis.visible = e.holder.visible;
        if (e.kind === 'ice-deposit' && e.depositId === curHarvDepId) {
          activeIceDepositDiag.id = e.depositId;
          activeIceDepositDiag.distKm = Math.round(o.dKm);
          activeIceDepositDiag.visible = !!e.holder.visible;
        }

        if (e.isStar) {
          var haloAng = clamp(angRad * 7.2, e.kind === 'binary' ? 0.0065 : 0.0085, 1.15);
          e.halo.position.set(o.n[0] * D, o.n[1] * D, o.n[2] * D);
          e.halo.scale.setScalar(Math.max(1e-3, D * haloAng * 2.15));
          e.core = e.holder;
          var deltaS = fr.beta > 1e-5 ? o.D : 1.0;
          var tint = fr.beta > 1e-5 ? dopplerTint(e.T, o.D) : [1, 1, 1];
          var gain = fr.beta > 1e-5 ? clamp(relBeamGain(o.D), 0.2, 2.2) : 1.0;
          e.coreMat.color.setRGB(e.baseCol[0] * tint[0], e.baseCol[1] * tint[1], e.baseCol[2] * tint[2]);
          if (e.coreMat.uniforms) {
            e.coreMat.uniforms.uTempK.value = clamp(e.T * deltaS, 700, 60000);
            e.coreMat.uniforms.uGain.value = gain;
            e.coreMat.uniforms.uTime.value = anim.t;
          }
          e.haloMat.color.setRGB(e.baseCol[0] * tint[0] * gain, e.baseCol[1] * tint[1] * gain, e.baseCol[2] * tint[2] * gain);
          if (e.haloMat.uniforms) {
            e.haloMat.uniforms.uOpacity.value = clamp(0.94 * (0.55 + 0.45 * gain), 0.2, 1.0);
            e.haloMat.uniforms.uTime.value = anim.t;
          }
          e.holder.visible = Rr > D * 0.0012 || mode === 'local';
          if (e.key === 'star') { starWorld = posKm; hostObs = { n: o.n, D: D, delta: o.D, dKm: o.dKm }; }
        }
      }
      lastHostObs = hostObs;

      // Lighting + per-body relativistic tint, spin, ring shader uniforms
      var lightWorld = unit3(sub3(starWorld, tacticalMode ? (fr.shipKm || obs) : obs));
      var sunSc = [dot3(lightWorld, fr.f), dot3(lightWorld, fr.y), dot3(lightWorld, fr.z)];
      sun.position.set(sunSc[0] * 140, sunSc[1] * 140, sunSc[2] * 140);
      if (starEntry && starEntry.coreMat) {
        var sc2 = starEntry.baseCol;
        sun.color.setRGB(lerp(1, sc2[0], 0.55), lerp(1, sc2[1], 0.55), lerp(1, sc2[2], 0.55));
      }
      for (var j = 0; j < bodies.length; j++) {
        var b = bodies[j];
        if (b.isStar) continue;
        var toStar = unit3(sub3(starWorld, b.posKm));
        var Ls = new T.Vector3(dot3(toStar, fr.f), dot3(toStar, fr.y), dot3(toStar, fr.z));
        if (!b.lastLs) b.lastLs = new T.Vector3();
        b.lastLs.copy(Ls);
        var relOn = fr.beta > 1e-4;
        var Dw = b.vis.delta;
        var npcRelState = b.npcVessel && b.getOrbitState ? b.getOrbitState(t) : null;
        if (b.npcVessel && npcRelState && Orbits && Orbits.computeRelativisticContact3D && fr.observerVelKmS) {
          var boN = scale3(fr.observerVelKmS, 1 / C_KMS);
          var btN = scale3(npcRelState.vKmS || [0, 0, 0], 1 / C_KMS);
          var nRestN = unit3(sub3(npcRelState.rKm || b.posKm, obs));
          var resN = Orbits.computeRelativisticContact3D(boN, btN, nRestN);
          Dw = resN.D;
          b.vis.delta = Dw;
          relOn = relOn || resN.betaRelMag > 1e-4;
        }
        var gainB = relBeamGain(Dw);
        var tintEffect = relOn ? dopplerTint(b.T, Dw) : [1, 1, 1];
        var gEffect = relOn ? clamp(gainB, 0.16, 1.85) : 1.0;
        if (b.effectMaterials) for (var mi=0;mi<b.effectMaterials.length;mi++) {
          var u = b.effectMaterials[mi].uniforms;
          if (!u) continue;
          if (u.uLightDir) u.uLightDir.value.copy(Ls);
          if (u.uTime) u.uTime.value=anim.t;
          if (u.uDopplerTint) u.uDopplerTint.value.set(tintEffect[0], tintEffect[1], tintEffect[2]);
          if (u.uDopplerGain != null) u.uDopplerGain.value = gEffect;
          if (u.uPlanetCenter) {
            u.uPlanetCenter.value.copy(b.holder.position);
            u.uPlanetRadius.value=b.vis.Rr;
            u.uGammaX.value=Math.min(10,fr.gamma);
          }
        }
        if (b.comet) {
          var orbit = Galaxy.getBodyWorldState(st.sys,{kind:'planet',planetIdx:b.planetIdx},t);
          var vel = orbit.vKmS, rig = b.comet.userData;
          var inverse = b.comet.getWorldQuaternion(new T.Quaternion()).invert();
          var tailAxis = new T.Vector3(0,-1,0);
          rig.ion.quaternion.setFromUnitVectors(tailAxis,Ls.clone().negate().applyQuaternion(inverse).normalize());
          var trail = new T.Vector3(-dot3(vel,fr.f),-dot3(vel,fr.y),-dot3(vel,fr.z));
          rig.dust.quaternion.setFromUnitVectors(tailAxis,trail.applyQuaternion(inverse).normalize());
          rig.coma.quaternion.copy(inverse).multiply(camera.quaternion);
        }
        if (b.dioramaPlanet && st.diorama) {
          var dio = st.diorama;
          lastPlanetLight.copy(Ls);
          var tintP = relOn ? dopplerTint(b.T, Dw) : [1, 1, 1];
          var gP = relOn ? clamp(gainB, 0.16, 1.85) : 1.0;
          dio.planetMat.color.setRGB(clamp(tintP[0] * gP, 0.06, 1.85), clamp(tintP[1] * gP, 0.06, 1.85), clamp(tintP[2] * gP, 0.06, 1.85));
          dio.atmoMat.uniforms.uLightDir.value.copy(Ls);
          dio.atmoMat.uniforms.uDopplerTint.value.set(tintP[0], tintP[1], tintP[2]);
          dio.atmoMat.uniforms.uDopplerGain.value = gP;
          if (dio.ringMat) {
            dio.ringMat.uniforms.uPlanetCenter.value.copy(b.holder.position);
            dio.ringMat.uniforms.uPlanetRadius.value = b.vis.Rr;
            dio.ringMat.uniforms.uLightDir.value.copy(Ls);
            dio.ringMat.uniforms.uDopplerTint.value.set(tintP[0], tintP[1], tintP[2]);
            dio.ringMat.uniforms.uDopplerGain.value = gP;
            dio.ringMat.uniforms.uGammaX.value = Math.min(10.0, fr.gamma);
          }
          if (animDt > 0 && !lastReduced) dio.planetMesh.rotation.y += (animDt * 0.045) / fr.gamma;
        } else {
          if (b.celestialMat && b.celestialMat.uniforms) {
            b.celestialMat.uniforms.uLightDir.value.copy(Ls);
            b.celestialMat.uniforms.uTime.value = anim.t;
          }
          if (b.volAtmo && b.volAtmo.mat && b.volAtmo.mat.uniforms) {
            var tintVA = relOn ? dopplerTint(b.T, Dw) : [1, 1, 1];
            var gVA = relOn ? clamp(gainB, 0.16, 1.85) : 1.0;
            b.volAtmo.mat.uniforms.uDopplerTint.value.set(tintVA[0], tintVA[1], tintVA[2]);
            b.volAtmo.mat.uniforms.uDopplerGain.value = gVA;
          }
          if (b.mats && b.mats.length) {
            if (relOn) { applyTint(b.mats, b.T, Dw, gainB); b.tinted = true; }
            else if (b.tinted) { restoreTint(b.mats); b.tinted = false; }
          }
        }
        if (b.spin && animDt > 0 && !lastReduced) b.model.rotation.y += (animDt * b.spin) / fr.gamma;
        if (b.iceMesh && b.holder.visible) {
          var depMining = !!(curHarvDepId && b.depositId === curHarvDepId && snap.iceHarvest && snap.iceHarvest.active && (snap.iceHarvest.phase === 'collecting' || snap.iceHarvest.phase === 'outbound'));
          b.iceMesh.comaMat.opacity = depMining ? (0.46 + 0.14 * Math.sin(anim.t * 5.2)) : (curHarvDepId === b.depositId ? 0.34 : 0.22);
          for (var isp = 0; isp < b.iceMesh.sparks.length; isp++) {
            var spItem = b.iceMesh.sparks[isp];
            var spPulse = depMining ? Math.max(0, Math.sin(anim.t * 9.5 + spItem.phase)) : 0;
            spItem.mat.opacity = Math.pow(spPulse, 2.0) * 0.85;
            spItem.sprite.scale.setScalar(2.4 + spPulse * 1.8);
          }
        }
        if (b.npcVessel) {
          var stNpc = b.getOrbitState ? b.getOrbitState(t) : null;
          if (stNpc && stNpc.relVKmS) {
            var vHatW = unit3(stNpc.relVKmS);
            if (!b._bowAxis) b._bowAxis = new T.Vector3(1, 0, 0);
            if (!b._dirW) b._dirW = new T.Vector3();
            b._dirW.set(vHatW[0], vHatW[1], vHatW[2]);
            b.model.quaternion.setFromUnitVectors(b._bowAxis, b._dirW);
          }
          var npcEnt = combatEntFor(snap, 'body:' + b.key);
          b.npcVessel.setPlumeIntensity(npcEnt && npcEnt.destroyed ? 0 : 0.26, 0.08, -1, anim.t);
        }
        if (b.key === 'station' || b.key === 'npc' || b.key === 'npc2') {
          var bEnt = combatEntFor(snap, 'body:' + b.key);
          var isDest = Boolean(bEnt && bEnt.destroyed);
          if (b.model) b.model.visible = !isDest;
          if (isDest || (bEnt && (bEnt.state === 'damaged' || bEnt.state === 'critical'))) {
            ensureBodyDamageRig(b);
          }
          if (b.wreckGroup) {
            b.wreckGroup.visible = isDest;
            if (isDest && !lastReduced) b.wreckGroup.rotation.y += animDt * 0.22;
          }
          if (b.breachSparks) {
            var nOn = isDest || !bEnt ? 0 : (bEnt.state === 'critical' ? 8 : (bEnt.state === 'damaged' ? 4 : 0));
            for (var spB = 0; spB < b.breachSparks.length; spB++) {
              var bs = b.breachSparks[spB];
              var showSp = !isDest && spB < nOn;
              bs.sprite.visible = showSp;
              if (showSp) {
                var pulseB = Math.max(0, Math.sin(anim.t * 14 + bs.phase));
                bs.mat.opacity = 0.28 + 0.68 * Math.pow(pulseB, 2);
                bs.sprite.scale.setScalar((b.modelR || 4) * (0.28 + 0.22 * pulseB));
              }
            }
          }
        }
      }
    }

    // ------------------------------------------------------------------------------------------
    // The per-frame update
    // ------------------------------------------------------------------------------------------
    var lastReduced = defaultReduced;
    var tmpVec = new T.Vector3();

    // ---- Hull weapons, enemy retaliation fire, hit flashes & 3D explosions ----
    var fxMuz = new T.Vector3(), fxDir = new T.Vector3(), fxUp = new T.Vector3(0, 1, 0);
    function combatEntFor(snap, id) {
      var ents = snap && snap.combat && snap.combat.entities;
      return ents && id ? (ents[id] || null) : null;
    }
    function ensureBodyDamageRig(b) {
      if (!b || b.breachSparks) return;
      var rad = Math.max(1.5, b.modelR || 4.0);
      var sparks = [];
      for (var i = 0; i < 8; i++) {
        var phi = i * 2.3999632;
        var sm = new T.SpriteMaterial({
          map: haloTex, color: (i % 2 === 0 ? 0xff9a3c : 0xff4d42), transparent: true,
          opacity: 0, depthWrite: false, blending: T.AdditiveBlending
        });
        var sp = new T.Sprite(sm);
        sp.position.set(Math.cos(phi) * rad * 0.72, ((i % 3) - 1) * rad * 0.45, Math.sin(phi) * rad * 0.72);
        sp.visible = false;
        b.orient.add(sp);
        sparks.push({ sprite: sp, mat: sm, phase: i * 1.73 });
        extraDispose.push(sm);
      }
      var wGrp = new T.Group();
      wGrp.visible = false;
      var wGeo = new T.BoxGeometry(rad * 0.42, rad * 0.16, rad * 0.28);
      var wMat = new T.MeshStandardMaterial({
        color: 0x2a2428, emissive: 0x4b1808, emissiveIntensity: 0.75,
        roughness: 0.82, metalness: 0.4, flatShading: true
      });
      extraDispose.push(wGeo, wMat);
      for (var k = 0; k < 10; k++) {
        var ang = k * 2.1;
        var mesh = new T.Mesh(wGeo, wMat);
        mesh.position.set(Math.cos(ang) * rad * 0.7, Math.sin(ang * 1.4) * rad * 0.42, Math.sin(ang) * rad * 0.7);
        mesh.rotation.set(ang, ang * 0.6, ang * 1.3);
        mesh.scale.setScalar(0.65 + (k % 3) * 0.35);
        wGrp.add(mesh);
      }
      b.orient.add(wGrp);
      b.breachSparks = sparks;
      b.wreckGroup = wGrp;
    }
    function resolveEntityWorldPos(key, targetId) {
      if (key && bodyByKey[key] && bodyByKey[key].holder) {
        return bodyByKey[key].holder.position.clone();
      }
      var cid = targetId ? String(targetId).replace(/^contact:/, '') : key;
      if (cid && corridor[cid] && corridor[cid].holder) {
        return corridor[cid].holder.position.clone();
      }
      var wList = lastSnap && lastSnap.hud && Array.isArray(lastSnap.hud.bodies) ? lastSnap.hud.bodies : [];
      var hit = wList.find(function (x) { return x.key === key || x.id === targetId; });
      if (hit && hit.dir) return new T.Vector3(hit.dir[0], hit.dir[1], hit.dir[2]).multiplyScalar(320);
      return new T.Vector3(240, 28, -95);
    }
    function triggerExplosion(worldPos, scale) {
      var slot = null;
      for (var i = 0; i < explosionFx.slots.length; i++) {
        if (!explosionFx.slots[i].busy) { slot = explosionFx.slots[i]; break; }
      }
      if (!slot) slot = explosionFx.slots[0];
      slot.busy = true;
      slot.t0 = anim.t;
      slot.dur = 2.4;
      slot.scale = clamp(num(scale, 1.6), 0.7, 3.6);
      slot.group.position.copy(worldPos || new T.Vector3(0, 0, 0));
      slot.group.visible = true;
    }
    function updateExplosions(snap, allowed) {
      var ev = snap && snap.combat && snap.combat.explosionEvent;
      if (ev && ev.seq != null && ev.seq !== explosionFx.lastSeq) {
        var nowMs = root.performance && root.performance.now ? root.performance.now() : 0;
        var stale = isNum(ev.perfAt) && nowMs > 0 && (nowMs - ev.perfAt > 3000);
        explosionFx.lastSeq = ev.seq;
        if (allowed && !stale) {
          var posW = ev.isPlayer ? new T.Vector3(0, 0, 0) : resolveEntityWorldPos(ev.targetKey, ev.targetId);
          triggerExplosion(posW, ev.scale || 1.6);
        }
      }
      var t = anim.t, active = 0;
      for (var i = 0; i < explosionFx.slots.length; i++) {
        var sl = explosionFx.slots[i];
        if (!sl.busy) continue;
        var age = t - sl.t0;
        if (!allowed || age < 0 || age > sl.dur) {
          sl.busy = false;
          sl.group.visible = false;
          continue;
        }
        var sc = sl.scale;
        var fireK = clamp(1 - age / 1.65, 0, 1);
        sl.fire.visible = fireK > 0.01;
        if (sl.fire.visible) {
          var fSize = (3.5 + 18.0 * Math.pow(age / 1.65, 0.55)) * sc;
          sl.fire.scale.setScalar(fSize);
          sl.fireMat.color.setRGB(1.0, 0.35 + 0.55 * fireK, 0.08 + 0.55 * Math.pow(fireK, 2));
          sl.fireMat.opacity = Math.pow(fireK, 1.35) * 0.92;
        }
        var ringK = clamp(1 - age / 1.35, 0, 1);
        sl.ring.visible = ringK > 0.01;
        if (sl.ring.visible) {
          sl.ring.scale.setScalar((5.0 + 38.0 * (age / 1.35)) * sc);
          sl.ring.lookAt(camera.position);
          sl.ringMat.opacity = ringK * 0.85;
        }
        var flareK = clamp(1 - age / 0.55, 0, 1);
        sl.flare.visible = flareK > 0.01;
        if (sl.flare.visible) {
          sl.flare.scale.setScalar((26 + 34 * (1 - flareK)) * sc);
          sl.flareMat.opacity = flareK;
        }
        var shardK = clamp(1 - age / sl.dur, 0, 1);
        for (var j = 0; j < sl.shards.length; j++) {
          var sh = sl.shards[j];
          var d = sh.speed * age * sc * 0.55;
          sh.mesh.position.copy(sh.dir).multiplyScalar(d);
          sh.mesh.rotation.set(sh.spin[0] * age, sh.spin[1] * age, sh.spin[2] * age);
          sh.mesh.scale.setScalar((0.7 + 0.5 * (j % 3)) * sc * (0.45 + 0.55 * shardK));
          sh.mat.color.setRGB(0.25 + 0.75 * shardK, 0.14 + 0.45 * shardK * shardK, 0.12);
          sh.mat.opacity = clamp(shardK * 1.4, 0, 1);
        }
        active++;
      }
      explosionFx.active = active;
    }
    function weaponMuzzles(kind) {
      var hp = vessel && vessel.weaponHardpoints;
      var list = hp && hp[kind];
      if (list && list.length) return list;
      if (kind === 'lance' && hp && hp.fel && hp.fel.length) return hp.fel;
      return vessel ? [[vessel.seamX || 0, (vessel.rySeam || 3) * 1.05, 0]] : [];
    }
    function spawnWeaponEvent(ev) {
      var dir = unit3(arr3(ev.targetDir, [1, 0, 0]));
      var mode = ev.mode === 'relativistic' ? 'relativistic' : 'newtonian';
      var g = clamp(num(ev.gammaBoost, 1), 1, 150);
      var t0 = anim.t;
      var shots = weaponFx.shots;
      weaponFx.lastMode = mode;
      if (ev.kind === 'missile') {
        weaponMuzzles('missile').forEach(function (p, i) {
          shots.push({ kind: 'fel', src: p, dir: dir, beamLen: 26, t0: t0 + i * 0.04, dur: 0.24, gamma: 1 });
        });
      } else if (mode === 'relativistic') {
        weaponMuzzles('lance').forEach(function (p, i) {
          shots.push({ kind: 'lance', src: p, dir: dir, t0: t0 + i * 0.03, dur: 1.0, gamma: g });
        });
      } else {
        weaponMuzzles('fel').forEach(function (p, i) {
          shots.push({ kind: 'fel', src: p, dir: dir, t0: t0 + i * 0.02, dur: 0.55, gamma: 1 });
        });
        weaponMuzzles('rail').forEach(function (p, i) {
          for (var r = 0; r < 3; r++) {
          shots.push({ kind: 'rail', src: p, dir: dir, t0: t0 + 0.03 + i * 0.04 + r * 0.06, dur: 0.24, gamma: 1 });
          }
        });
      }
      if (ev.hit && ev.targetKey) {
        var hitW = resolveEntityWorldPos(ev.targetKey, ev.targetId);
        shots.push({ kind: 'burst', burst: true, originFixed: hitW, t0: t0 + 0.04, dur: 0.36, rel: mode === 'relativistic' });
      }
      while (shots.length > 96) releaseShot(shots.shift());
    }
    function spawnPdcEvent(ev, fr) {
      if (!vessel || !ev) return;
      var dir = arr3(ev.dirShip);
      if (!dir && arr3(ev.hitWorldKm) && fr) {
        var oP = observe(sub3(ev.hitWorldKm, fr.observerKm), fr);
        dir = oP.n;
      }
      dir = unit3(dir || [1, 0, 0]);
      var muzzles = weaponMuzzles('pdc');
      var t0 = anim.t;
      var beamL = clamp(num(ev.distKm, 25) * UNITS_PER_KM, 45, 950);
      for (var i = 0; i < Math.min(2, muzzles.length || 1); i++) {
        weaponFx.shots.push({
          kind: 'fel', src: muzzles[i] || [0, 4, 0], dir: dir,
          beamLen: beamL, t0: t0 + i * 0.03, dur: 0.30, gamma: 1
        });
      }
      if (fr && arr3(ev.hitWorldKm)) {
        var oHit = observe(sub3(ev.hitWorldKm, fr.observerKm), fr);
        var dHit = shellDistance(oHit.dKm);
        weaponFx.shots.push({
          kind: 'burst', burst: true,
          originFixed: new T.Vector3(oHit.n[0] * dHit, oHit.n[1] * dHit, oHit.n[2] * dHit),
          t0: t0 + 0.02, dur: 0.28, rel: false
        });
      }
      while (weaponFx.shots.length > 96) releaseShot(weaponFx.shots.shift());
    }
    function updateProjectileFx(fr, snap, allowed, tactical) {
      var list = (allowed && Array.isArray(snap.projectiles)) ? snap.projectiles : [];
      var used = 0;
      for (var i = 0; i < list.length && used < MAX_PROJ_SLOTS; i++) {
        var p = list[i];
        if (!p || !arr3(p.worldRKm)) continue;
        var slot = projSlots[used++];
        var useRel = !tactical && Array.isArray(p.relTrailKm) && p.relTrailKm.length >= 2;
        var trail = useRel
          ? p.relTrailKm
          : (Array.isArray(p.worldTrailKm) && p.worldTrailKm.length >= 2 ? p.worldTrailKm : [p.worldRKm, p.worldRKm]);
        var posAttr = slot.lineGeo.attributes.position;
        var posArr = posAttr.array;
        var nPts = Math.max(2, Math.min(PROJ_TRAIL_PTS, trail.length));
        for (var k = 0; k < nPts; k++) {
          var srcIdx = k === nPts - 1 ? (trail.length - 1) : Math.min(trail.length - 1, Math.round(k * (trail.length - 1) / (nPts - 1)));
          var pt = trail[srcIdx];
          var dW = useRel
            ? [pt[0], pt[1], pt[2]]
            : [pt[0] - fr.observerKm[0], pt[1] - fr.observerKm[1], pt[2] - fr.observerKm[2]];
          var op = observe(dW, fr);
          var Dp = shellDistance(op.dKm);
          posArr[3 * k] = op.n[0] * Dp;
          posArr[3 * k + 1] = op.n[1] * Dp;
          posArr[3 * k + 2] = op.n[2] * Dp;
        }
        slot.lineGeo.setDrawRange(0, nPts);
        posAttr.needsUpdate = true;
        var isMsl = p.kind === 'missile', isEnemy = p.owner === 'enemy', isRkv = p.kind === 'rkv';
        var colHex = isEnemy ? 0xff4d68 : isMsl ? 0xff9a3c : isRkv ? 0xc078ff : 0xffd478;
        slot.lineMat.color.setHex(colHex);
        slot.lineMat.opacity = isMsl ? 0.94 : 0.78;
        slot.line.visible = true;

        var lastK = nPts - 1;
        var hx = posArr[3 * lastK], hy = posArr[3 * lastK + 1], hz = posArr[3 * lastK + 2];
        var dHead = Math.hypot(hx, hy, hz);
        var hScale = clamp(dHead * (isMsl ? 0.008 : 0.0022), isMsl ? 0.65 : 0.22, isMsl ? 16 : 4.2);
        slot.head.position.set(hx, hy, hz);
        slot.head.scale.setScalar(hScale);
        slot.headMat.color.setHex(colHex);
        slot.head.visible = true;

        if (isMsl && p.burning) {
          slot.flare.position.set(hx, hy, hz);
          slot.flare.scale.setScalar(hScale * (3.6 + 0.8 * Math.sin(anim.t * 28 + i)));
          slot.flareMat.color.setHex(isEnemy ? 0xff667a : 0xffbb55);
          slot.flare.visible = true;
        } else {
          slot.flare.visible = false;
        }
      }
      for (var u = used; u < MAX_PROJ_SLOTS; u++) {
        projSlots[u].line.visible = false;
        projSlots[u].head.visible = false;
        projSlots[u].flare.visible = false;
      }
      projPoolActive = used;
    }
    function spawnEnemyWeaponEvent(ev) {
      var originW = resolveEntityWorldPos(ev.attackerKey, ev.attackerId);
      var missOff = ev.hit
        ? new T.Vector3(((ev.seq % 5) - 2) * 0.9, ((ev.seq % 3) - 1) * 0.7, (((ev.seq + 2) % 5) - 2) * 0.9)
        : new T.Vector3(6, 13, -12);
      var dstW = shipFrame.position.clone().add(missOff);
      var deltaW = dstW.clone().sub(originW);
      var distW = Math.max(8, deltaW.length());
      var dirW = deltaW.normalize();
      var t0 = anim.t;
      var shots = weaponFx.shots;
      var dirArr = [dirW.x, dirW.y, dirW.z];
      var rel = Boolean(ev.rel);
      for (var b = 0; b < 2; b++) {
        var jVec = new T.Vector3((b - 0.5) * 1.8, (b % 2 ? 1.1 : -1.1), 0);
        shots.push({
          kind: rel ? 'lance' : 'fel',
          enemy: true,
          rel: rel,
          originFixed: originW.clone().add(jVec),
          dir: dirArr,
          beamLen: Math.min(distW, WEAPON_RANGE),
          t0: t0 + b * 0.05,
          dur: rel ? 0.78 : 0.48,
          gamma: rel ? 2.2 : 1
        });
      }
      for (var r = 0; r < 3; r++) {
        shots.push({
          kind: 'rail',
          enemy: true,
          originFixed: originW.clone(),
          dir: dirArr,
          t0: t0 + r * 0.08,
          dur: clamp(distW / (TRACER_SPEED * 1.15), 0.16, 1.1),
          gamma: 1
        });
      }
      if (ev.hit) {
        shots.push({ kind: 'burst', enemy: true, burst: true, originFixed: dstW.clone(), t0: t0 + 0.06, dur: 0.34, rel: rel });
      }
      while (shots.length > 96) releaseShot(shots.shift());
    }
    function releaseShot(sh) {
      if (!sh) return;
      if (sh.beam) { sh.beam.busy = false; sh.beam.mesh.visible = false; sh.beam = null; }
      if (sh.tracer) { sh.tracer.busy = false; sh.tracer.mesh.visible = false; sh.tracer = null; }
      if (sh.flash) { sh.flash.busy = false; sh.flash.sprite.visible = false; sh.flash = null; }
    }
    function updateWeaponFx(snap, allowed) {
      var ev = snap.weaponEvent;
      if (ev && ev.seq != null && ev.seq !== weaponFx.lastSeq) {
        var nowMs = root.performance && root.performance.now ? root.performance.now() : 0;
        var stale = isNum(ev.at) && nowMs > 0 && (nowMs - ev.at > 2500);
        weaponFx.lastSeq = ev.seq;
        if (vessel && allowed && !stale) spawnWeaponEvent(ev);
      }
      var ew = snap.combat && snap.combat.enemyWeaponEvent;
      if (ew && ew.seq != null && ew.seq !== weaponFx.lastEnemySeq) {
        var nowMsE = root.performance && root.performance.now ? root.performance.now() : 0;
        var staleE = isNum(ew.perfAt) && nowMsE > 0 && (nowMsE - ew.perfAt > 2500);
        weaponFx.lastEnemySeq = ew.seq;
        if (allowed && !staleE) spawnEnemyWeaponEvent(ew);
      }
      var pdc = snap.combat && snap.combat.pdcEvent;
      if (pdc && pdc.seq != null && pdc.seq !== weaponFx.lastPdcSeq) {
        var nowMsP = root.performance && root.performance.now ? root.performance.now() : 0;
        var staleP = isNum(pdc.perfAt) && nowMsP > 0 && (nowMsP - pdc.perfAt > 2500);
        weaponFx.lastPdcSeq = pdc.seq;
        if (allowed && !staleP) spawnPdcEvent(pdc, lastFrame);
      }
      var shots = weaponFx.shots;
      if (!vessel || !allowed) {
        while (shots.length) releaseShot(shots.pop());
        weaponFx.active = 0;
        weaponFx.enemyActive = 0;
        return;
      }
      shipFrame.updateMatrixWorld(true);
      var mw = vessel.group.matrixWorld;
      var t = anim.t, active = 0, enemyActive = 0;
      for (var i = shots.length - 1; i >= 0; i--) {
        var sh = shots[i];
        var age = t - sh.t0;
        if (age < 0) continue;
        if (age > sh.dur) { releaseShot(sh); shots.splice(i, 1); continue; }
        if (sh.burst) {
          if (!sh.flash) { sh.flash = allocFlash(); sh.flash.busy = true; }
          var bk = 1 - age / sh.dur;
          var bsp = sh.flash.sprite;
          bsp.visible = true;
          bsp.position.copy(sh.originFixed);
          bsp.scale.setScalar((sh.enemy ? 7.5 : 10.5) * (0.4 + 0.8 * (1 - bk)));
          sh.flash.mat.color.setHex(sh.rel ? 0xe080ff : 0xff8a3c);
          sh.flash.mat.opacity = bk;
          if (sh.enemy) enemyActive++;
          continue;
        }
        if (sh.originFixed) fxMuz.copy(sh.originFixed);
        else fxMuz.set(sh.src[0], sh.src[1], sh.src[2]).applyMatrix4(mw);
        fxDir.set(sh.dir[0], sh.dir[1], sh.dir[2]);
        var flashLife = sh.kind === 'lance' ? 0.6 : (sh.kind === 'fel' ? 0.25 : 0.09);
        var gk = clamp(1 + Math.log(sh.gamma) / 3, 1, 2.6);
        if (sh.kind === 'rail') {
          if (!sh.tracer) {
            sh.tracer = allocTracer();
            sh.tracer.busy = true;
            sh.origin = fxMuz.clone();
          }
          var dist = age * TRACER_SPEED;
          var trm = sh.tracer.mesh;
          trm.visible = true;
          trm.position.copy(sh.origin).addScaledVector(fxDir, dist + 1.4);
          trm.quaternion.setFromUnitVectors(fxUp, fxDir);
          trm.scale.set(sh.enemy ? 0.16 : 0.11, sh.enemy ? 2.0 : 1.4, sh.enemy ? 0.16 : 0.11);
          sh.tracer.mat.color.setHex(sh.enemy ? 0xff5a3c : 0xffd9a0);
          sh.tracer.mat.opacity = clamp(1 - dist / WEAPON_RANGE, 0, 1) * 0.95;
        } else {
          if (!sh.beam) { sh.beam = allocBeam(); sh.beam.busy = true; }
          var lance = sh.kind === 'lance';
          var attack = lance ? 0.08 : 0.04;
          var relStart = lance ? 0.75 : 0.38;
          var on = clamp(age / attack, 0, 1) * (1 - smoothstep01((age - relStart) / Math.max(0.05, sh.dur - relStart)));
          var grow = clamp(age / 0.06, 0, 1);
          var L = Math.max(0.5, (sh.beamLen || WEAPON_RANGE) * grow);
          var rad = lance ? 0.42 * gk : 0.20;
          var bm = sh.beam.mesh, u = sh.beam.mat.uniforms;
          bm.visible = true;
          bm.position.copy(fxMuz);
          bm.quaternion.setFromUnitVectors(fxUp, fxDir);
          bm.scale.set(rad, L, rad);
          if (sh.enemy) {
            if (lance) {
              u.uCore.value.setRGB(1.0, 0.78, 0.96);
              u.uHalo.value.setRGB(1.0, 0.08, 0.30);
              u.uRings.value = 1.0;
            } else {
              u.uCore.value.setRGB(1.0, 0.92, 0.72);
              u.uHalo.value.setRGB(1.0, 0.16, 0.08);
              u.uRings.value = 0.0;
            }
            u.uOn.value = on;
          } else if (lance) {
            u.uCore.value.setRGB(0.98, 0.95, 1.0);
            u.uHalo.value.setRGB(clamp(0.62 - 0.08 * (gk - 1), 0.3, 0.7), 0.36, 1.0);
            u.uRings.value = 1.0;
            u.uOn.value = on * (1.0 + 0.25 * (gk - 1));
          } else {
            u.uCore.value.setRGB(0.85, 1.0, 0.95);
            u.uHalo.value.setRGB(0.12, 0.95, 0.70);
            u.uRings.value = 0.0;
            u.uOn.value = on;
          }
          u.uLen.value = L;
          u.uTime.value = t;
        }
        if (age < flashLife) {
          if (!sh.flash) { sh.flash = allocFlash(); sh.flash.busy = true; }
          var fk = 1 - age / flashLife;
          var sp = sh.flash.sprite;
          sp.visible = true;
          sp.position.copy(fxMuz);
          var fs = sh.kind === 'lance' ? 4.5 * gk : (sh.kind === 'fel' ? 2.2 : 1.3);
          sp.scale.setScalar(fs * (0.6 + 0.4 * fk));
          sh.flash.mat.color.setHex(sh.enemy ? 0xff6242 : (sh.kind === 'lance' ? 0xc9a8ff : (sh.kind === 'fel' ? 0x7dffd8 : 0xffcf8a)));
          sh.flash.mat.opacity = fk;
        } else if (sh.flash) {
          sh.flash.busy = false;
          sh.flash.sprite.visible = false;
          sh.flash = null;
        }
        if (sh.enemy) enemyActive++;
        else active++;
      }
      weaponFx.active = active;
      weaponFx.enemyActive = enemyActive;
    }
    function smoothstep01(x) { var k = clamp(x, 0, 1); return k * k * (3 - 2 * k); }

    // ---- DropShip torch-shuttle traffic between the bays and the station's axial spindle hub ----
    function updateShuttleTraffic(snap, view, concourseMode, animDt) {
      if (!shuttleFleet && root.LighthuggerShuttles && typeof root.LighthuggerShuttles.create === 'function') {
        shuttleFleet = root.LighthuggerShuttles.create(T, scene);
      }
      if (!shuttleFleet) { shuttleDiag.active = 0; return; }
      var stE = bodyByKey.station;
      var harvesting = !!snap.multiHop?.harvesting || !!snap.iceHarvest?.active || snap.iceHarvestTrafficS > 0;
      var alongside = !!stE && stE.holder.visible && !!stE.vis && stE.vis.mode === 'local';
      var mode = !vessel || snap.destroyed || view === 'sextant' || view === 'orbit' || snap.mode === 'interstellar' && !harvesting ? 'off'
        : harvesting ? 'harvest' : alongside && (snap.docked || snap.menuShowcase) ? 'station' : 'recall';
      if (mode === 'off') {
        rogueIceRig.group.visible = false;
        shuttleDiag.active = shuttleFleet.update(0, anim.t, { mode: 'off' });
        return;
      }
      shipFrame.updateMatrixWorld(true);
      var mw = vessel.group.matrixWorld;
      var ports = (vessel.shuttlePortAnchors || []).map(function (a) {
        var p = new T.Vector3(a.pos[0], a.pos[1], a.pos[2]).applyMatrix4(mw);
        var n = new T.Vector3(a.normal[0], a.normal[1], a.normal[2]).transformDirection(mw);
        return { pos: [p.x, p.y, p.z], normal: [n.x, n.y, n.z] };
      });
      var center = new T.Vector3();
      var axis = new T.Vector3(0, 1, 0);
      var shipC = new T.Vector3(((vessel.bowX || 22) + (vessel.sternX || -18)) * 0.5, 0, 0).applyMatrix4(mw);
      var clearR = 8;
      var distantSortie = false;
      if (alongside && !harvesting) {
        rogueIceRig.group.visible = false;
        stE.holder.updateMatrixWorld(true);
        stE.holder.getWorldPosition(center);
        axis.transformDirection(stE.model.matrixWorld);
        clearR = Math.max(num(stE.vis.Rr, 7), (stE.modelR || 7.2) * Math.max(stE.holder.scale.y, 1e-3)) * 1.22 + 0.8;
      } else {
        // Aim DropShips along the true world vector to the active mapped ice deposit (or rogue ice in interstellar void)
        var activeDepId = (snap.iceHarvest && snap.iceHarvest.depositId)
          || (snap.multiHop && snap.multiHop.harvestSite && snap.multiHop.harvestSite.depositId)
          || (snap.iceHarvestSite && snap.iceHarvestSite.depositId) || null;
        var target = (activeDepId && bodyByKey['ice:' + activeDepId])
          || bodies.find(function (b) { return b.kind === 'ice-deposit' && b.holder.visible; });
        if (target && target.holder && target.holder.visible) {
          rogueIceRig.group.visible = false;
          target.holder.updateMatrixWorld(true);
          var targetPosW = target.holder.getWorldPosition(new T.Vector3());
          var toTarget = targetPosW.clone().sub(shipC);
          var distU = toTarget.length();
          if (target.vis && target.vis.mode === 'local' && distU <= 260) {
            center.copy(targetPosW);
            axis.copy(toTarget.lengthSq() > 1e-4 ? toTarget.negate().normalize() : new T.Vector3(-0.76, -0.16, 0.63));
            clearR = Math.max(num(target.vis.Rr, 4.2), 3.6) * 1.18;
          } else {
            // Distant deposit: streak toward true celestial bearing and fade past ~190+ scene units
            distantSortie = true;
            var bearing = toTarget.lengthSq() > 1e-4 ? toTarget.normalize() : new T.Vector3(0.76, 0.16, -0.63);
            var farReach = Math.max(195, shipLengthUnits() * 3.8);
            center.copy(shipC).addScaledVector(bearing, farReach);
            axis.copy(bearing).negate();
            clearR = 6.0;
          }
          activeIceDepositDiag.id = target.depositId || activeIceDepositDiag.id;
          activeIceDepositDiag.distKm = Math.round(num(target.vis && target.vis.dKm, activeIceDepositDiag.distKm || 0));
          activeIceDepositDiag.visible = true;
        } else {
          // Deep interstellar emergency harvest outside any star system's local veil
          var voidDir = new T.Vector3(0.76, 0.16, -0.63).transformDirection(mw).normalize();
          var rogueDist = Math.max(62, shipLengthUnits() * 1.48);
          center.copy(shipC).addScaledVector(voidDir, rogueDist);
          axis.copy(voidDir).negate();
          clearR = 5.4;
          rogueIceRig.group.visible = (mode === 'harvest');
          if (rogueIceRig.group.visible) {
            rogueIceRig.group.position.copy(center);
            if (!lastReduced) {
              rogueIceRig.group.rotation.y += animDt * 0.18;
              rogueIceRig.group.rotation.x += animDt * 0.06;
              rogueIceRig.group.rotation.z = Math.sin(anim.t * 0.25) * 0.12;
            }
            var mining = snap.iceHarvest && snap.iceHarvest.active && (snap.iceHarvest.phase === 'collecting' || snap.iceHarvest.phase === 'outbound');
            rogueIceRig.comaMat.opacity = mining ? (0.42 + 0.12 * Math.sin(anim.t * 5.2)) : 0.28;
            for (var spIdx = 0; spIdx < rogueIceRig.sparks.length; spIdx++) {
              var sp = rogueIceRig.sparks[spIdx];
              var pulse = mining ? Math.max(0, Math.sin(anim.t * 9.5 + sp.phase)) : 0;
              sp.mat.opacity = Math.pow(pulse, 2.0) * 0.85;
              sp.sprite.scale.setScalar(2.4 + pulse * 1.8);
            }
          }
        }
      }
      if (axis.dot(shipC.clone().sub(center)) < 0) axis.negate();
      var hub = center.clone().addScaledVector(axis, clearR);
      var capA = new T.Vector3(vessel.sternX || -18, 0, 0).applyMatrix4(mw);
      var capB = new T.Vector3(vessel.bowX || 22, 0, 0).applyMatrix4(mw);
      var warpNow = Math.max(1, num(snap.effectiveWarp, 1));
      var shuttleDt = mode === 'harvest'
        ? animDt * clamp(0.32 + Math.log10(warpNow) * 0.46, 0.32, 2.4)
        : animDt;
      shuttleDiag.active = shuttleFleet.update(shuttleDt, anim.t, {
        mode: mode,
        distant: distantSortie,
        ports: ports,
        hub: { pos: [hub.x, hub.y, hub.z], axis: [axis.x, axis.y, axis.z] },
        avoidSphere: { center: [center.x, center.y, center.z], radius: clearR * 0.92 },
        avoidCapsule: {
          a: [capA.x, capA.y, capA.z], b: [capB.x, capB.y, capB.z],
          radius: Math.max(vessel.rySeam || 3, vessel.rzSeam || 3) * 1.35 + 0.6
        }
      }) | 0;
    }

    function update(dt, uiDt, snap) {
      snap = snap || {};
      var animDt = clamp(isNum(uiDt) ? uiDt : (isNum(dt) ? dt : 0.016), 0, 0.1);
      anim.t += animDt;
      lastSnap = snap;
      var reduced = typeof snap.reducedMotion === 'boolean' ? snap.reducedMotion : defaultReduced;
      lastReduced = reduced;

      // canvas sizing (supports an optional deck clearance view offset without reallocating WebGL buffers)
      var clearPx = resolveView(snap) === 'helm' ? Math.round(num(snap.deckClearPx, 0)) : 0;
      var cw = Math.max(1, Math.floor(canvasEl.clientWidth || (canvasEl.parentNode && canvasEl.parentNode.clientWidth) || 800));
      var ch = Math.max(1, Math.floor(canvasEl.clientHeight || (canvasEl.parentNode && canvasEl.parentNode.clientHeight) || 450));
      var prNow = Math.min(root.devicePixelRatio || 1, 2);
      if (Math.abs(prNow - renderer.getPixelRatio()) > 1e-4) renderer.setPixelRatio(prNow);
      if (cw !== canvasSize.w || ch !== canvasSize.h || Math.abs(prNow - canvasSize.pr) > 1e-4 ||
          Math.abs(canvasEl.width - Math.round(cw * prNow)) > 2 || Math.abs(canvasEl.height - Math.round(ch * prNow)) > 2) {
        resize(cw, ch, clearPx);
      } else if (clearPx !== canvasSize.clear) {
        canvasSize.clear = clearPx;
        applyViewOffset(cw, ch, clearPx);
      }

      // ---- state ----
      var view = resolveView(snap);
      anim.view = view; lastView = view;
      var sextant = view === 'sextant';
      var tactical = view === 'orbit';
      var drydock = view === 'drydock';
      var menu = view === 'menu';
      var ir = sextant && !!snap.irSight;
      var simT = isNum(snap.simTimeS) ? snap.simTimeS : st.simTimeS;
      st.simTimeS = simT;
      var beta = menu ? 0 : clamp(num(snap.beta, 0), 0, 0.999999);
      var gammaS = menu ? 1 : clamp(isNum(snap.gamma) && snap.gamma >= 1 ? snap.gamma : 1 / Math.sqrt(1 - beta * beta), 1, 150);
      var thrustG = menu ? 0 : num(snap.thrustG, num(snap.thrustCmdG, 0));
      var thrustMag = Math.abs(thrustG);
      var basis = readBasis(snap);
      var posGal = arr3(snap.posGal);

      var cY = snap.cam && isNum(snap.cam.orbitYaw) ? snap.cam.orbitYaw : cam.orbitYaw;
      var cP = snap.cam && isNum(snap.cam.orbitPitch) ? snap.cam.orbitPitch : cam.orbitPitch;
      var cZ = snap.cam && isNum(snap.cam.orbitZoom) ? snap.cam.orbitZoom : cam.orbitZoom;
      var cSx = snap.cam && isNum(snap.cam.sxZoom) ? snap.cam.sxZoom : cam.sxZoom;
      var cTz = snap.cam && isNum(snap.cam.tacticalZoom) ? snap.cam.tacticalZoom : cam.tacticalZoom;
      var concourseWant = (snap.drydockCam === 'concourse' || !!snap.concourseView) && !sextant && !tactical && (!!snap.docked || menu || drydock);
      var loupe = (snap.screen || view) === 'helm' && !concourseWant ? num(snap.aberrationZoom, 1) : 1;
      if (menu) {
        if (!anim.menuActive) {
          anim.menuYaw = cY; anim.menuPitch = cP; anim.menuZoom = cZ;
          anim.menuSway = 0;
          anim.menuHoldUntil = concourseWant ? 1e9 : 0;
        } else {
          var dyMenu = cY - anim.menuYaw;
          var dpMenu = cP - anim.menuPitch;
          var dzMenu = cZ - anim.menuZoom;
          if (Math.abs(dyMenu) > 1e-5 || Math.abs(dpMenu) > 1e-5 || Math.abs(dzMenu) > 1e-5 || concourseWant) {
            anim.menuHoldUntil = anim.t + 6.0;
          } else if (gfx.autoOrbit && !reduced && anim.t >= anim.menuHoldUntil && (!snap.cam || snap.cam === cam)) {
            cam.orbitYaw += animDt * 0.16;
            cY = cam.orbitYaw;
          }
        }
        anim.menuYaw = cY; anim.menuPitch = cP; anim.menuZoom = cZ;
        anim.menuSway = 0;
      } else {
        anim.menuSway = 0;
      }
      anim.menuActive = menu;
      if (isNum(cam.zoomTarget)) {
        var remaining = cam.zoomTarget - cZ;
        cZ += remaining * (reduced ? 1 : 1 - Math.exp(-animDt * 10));
        if (Math.abs(cam.zoomTarget - cZ) < 0.0001) { cZ = cam.zoomTarget; cam.zoomTarget = null; }
        cam.orbitZoom = cZ;
      }
      anim.camYaw = cY; anim.camPitch = cP; anim.camZoom = cZ;

      // flip animation (180 deg Flip & Burn), smoothed hull rotation
      var flip = num(snap.flipVisualRad, 0);
      var flipRate = animDt > 1e-5 ? (flip - anim.prevFlip) / animDt : 0;
      anim.flipRate += (flipRate - anim.flipRate) * (1 - Math.exp(-animDt * 14));
      anim.prevFlip = flip;
      var cosF = Math.cos(flip), sinF = Math.sin(flip);
      var steerYaw = clamp(num(snap.steerVisYaw, 0), -1.2, 1.2);
      var steerPitch = clamp(num(snap.steerVisPitch, 0), -1.2, 1.2);
      var steerRoll = clamp(num(snap.steerVisRoll, 0), -1.2, 1.2);
      if (isNum(snap.yawRate)) steerYaw = clamp(snap.yawRate / 0.76, -1.2, 1.2);
      if (isNum(snap.pitchRate)) steerPitch = clamp(snap.pitchRate / 0.76, -1.2, 1.2);

      // ---- ship + vessel visuals ----
      shipHolder.rotation.y = flip;
      var curHitSeq = snap.combat && snap.combat.playerHitSeq != null ? Number(snap.combat.playerHitSeq) : 0;
      if (curHitSeq > lastHitSeqSeen) { hitJoltTimer = 0.38; lastHitSeqSeen = curHitSeq; }
      else if (curHitSeq < lastHitSeqSeen) { lastHitSeqSeen = curHitSeq; hitJoltTimer = 0; }
      if (hitJoltTimer > 0) hitJoltTimer = Math.max(0, hitJoltTimer - animDt);

      var playerDead = Boolean(snap.destroyed);
      playerWreckGroup.group.visible = playerDead;
      if (playerDead && !reduced) {
        playerWreckGroup.chunks.forEach(function (ch, idxC) {
          ch.rotation.x += animDt * (0.25 + 0.1 * (idxC % 3));
          ch.rotation.y += animDt * (0.18 - 0.12 * (idxC % 2));
        });
        playerWreckGroup.embers.forEach(function (em) {
          em.mat.opacity = 0.25 + 0.45 * Math.max(0, Math.sin(anim.t * 4.5 + em.phase));
        });
      }
      var dmgStateP = String(snap.damageState || 'nominal');
      var playerSparksOn = playerDead ? 0 : (dmgStateP === 'critical' ? playerDamageSparks.length : (dmgStateP === 'damaged' ? 4 : 0));
      for (var pdi = 0; pdi < playerDamageSparks.length; pdi++) {
        var ps = playerDamageSparks[pdi];
        var showPs = pdi < playerSparksOn && !tactical && !sextant;
        ps.sprite.visible = showPs;
        if (showPs) {
          var flk = Math.max(0, Math.sin(anim.t * 16 + ps.phase));
          ps.mat.opacity = 0.22 + 0.72 * Math.pow(flk, 2);
          ps.sprite.scale.setScalar(1.6 + 2.2 * flk);
        }
      }

      if (vessel) {
        vessel.group.visible = !playerDead;
        vessel.group.rotation.x = playerDead ? 0 : clamp(steerYaw * 0.24 + steerRoll * 0.36, -0.44, 0.44);
        vessel.group.rotation.y = playerDead ? 0 : clamp(-steerYaw * 0.16, -0.22, 0.22);
        vessel.group.rotation.z = playerDead ? 0 : clamp(steerPitch * 0.18, -0.24, 0.24);
        var plumeOn = playerDead ? 0 : (thrustMag > 0.02 ? clamp(0.62 + 0.52 * thrustMag, 0.62, 1.5) : (beta > 0.01 ? 0.24 : 0.08));
        anim.plumeOn += (plumeOn - anim.plumeOn) * (reduced ? 1 : (1 - Math.exp(-animDt * 9)));
        anim.thrustG = playerDead ? 0 : thrustG;
        var boostRatio = !playerDead && thrustMag > 0.02 ? clamp(thrustMag * (0.65 + 1.45 * beta + 0.25 * (gammaS - 1)), 0, 3) : 0;
        var plumeDirSign = (snap.reversibleDrive && thrustG < -0.02) ? 1 : -1;
        // Modulate burn ramp subtly while mid-flip so 180 deg flip-and-burn turns and roars into alignment
        var alignCos = snap.flip ? Math.cos(flip - Math.PI) : Math.cos(flip);
        var flipBurnMod = (!snap.reversibleDrive && thrustMag > 0.02) ? clamp((alignCos + 0.45) / 1.45, 0.24, 1.0) : 1.0;
        vessel.setPlumeIntensity(playerDead ? 0 : anim.plumeOn * flipBurnMod, boostRatio * flipBurnMod, plumeDirSign, anim.t);
        if (vessel.spinner && !reduced && !playerDead) vessel.spinner.rotation.x += animDt * 0.45;
        var iceF = clamp(num(snap.iceIntegrity, 1), 0, 1);
        if (Math.abs(iceF - lastIceFrac) > 0.004 && vessel.setIceIntegrity) {
          vessel.setIceIntegrity(iceF);
          lastIceFrac = iceF;
        }
        if (typeof snap.hideIce === 'boolean' && snap.hideIce !== hideIceFlag) {
          hideIceFlag = snap.hideIce;
          if (vessel.setIceVisible) vessel.setIceVisible(!hideIceFlag);
        }
        // Hull RCS couples: live while undocked on Helm (incl. the SAS counter-burns after release);
        // otherwise commanded to zero so any lit jets decay smoothly.
        if (vessel.setRcsTorque) {
          var rcsLive = view === 'helm' && !snap.docked && !playerDead;
          var rq = rcsLive && Array.isArray(snap.rcsTorque) ? snap.rcsTorque : null;
          rcsDiag.firing = vessel.setRcsTorque(rq ? num(rq[0], 0) : 0, rq ? num(rq[1], 0) : 0, rq ? num(rq[2], 0) : 0, anim.t) | 0;
        } else {
          rcsDiag.firing = 0;
        }
      } else {
        rcsDiag.firing = 0;
      }

      // acceleration kick/lag value (smoothed, 0 in sextant)
      var kickTarget = (sextant || reduced) ? 0 : clamp(thrustG / 2.0, -1, 1);
      anim.kick += (kickTarget - anim.kick) * (1 - Math.exp(-animDt * 2.2));

      // ---- observer frame ----
      var shipStarKm = resolveShipStarKm(snap, simT);
      if (menu && bodyByKey.station) shipStarKm = bodyByKey.station.getPos(simT);
      var observerKm, fr, tacticalTarget = null, tacticalR = 0;
      if (tactical) {
        var orbRef = primaryFor(snap, snap.orbitFocus);
        var primaryKm = primaryStateKm(orbRef, simT);
        var radius = 1;
        var orb = snap.orbit;
        var elc = orb && (orb.el || pickEl(orb));
        if (elc) radius = Math.max(elc.ra && isFinite(elc.ra) ? elc.ra : 0, elc.radiusKm || 0, elc.rp || 0);
        if (!(radius > 1)) {
          var pp = orbRef.kind === 'planet' || orbRef.kind === 'moon' ? sysPlanet(orbRef.planetIdx || 0) : null;
          var mm = orbRef.kind === 'moon' && pp && pp.moons ? pp.moons[orbRef.moonIdx || 0] : null;
          radius = mm ? mm.radiusKm * 4 : pp ? pp.radiusKm * 4 : (st.sys ? st.sys.starRadiusKm * 4 : 1e6);
        }
        var pObj = orbRef.kind === 'planet' || orbRef.kind === 'moon' ? sysPlanet(orbRef.planetIdx || 0) : null;
        var mObj = orbRef.kind === 'moon' && pObj && pObj.moons ? pObj.moons[orbRef.moonIdx || 0] : null;
        var pRad = mObj ? (mObj.radiusKm || 2000) : pObj ? (pObj.radiusKm || 6000) : (st.sys && st.sys.starRadiusKm || 7e5);
        tacticalR = Math.max(radius * 2.7, pRad * 3.2) * clamp(cTz, 0.12, 12);
        var ty = num(snap.cam && snap.cam.tacticalYaw, cam.tacticalYaw);
        var tp = num(snap.cam && snap.cam.tacticalPitch, cam.tacticalPitch);
        var dirT = [Math.cos(tp) * Math.cos(ty), Math.cos(tp) * Math.sin(ty), Math.sin(tp)];
        observerKm = add3(primaryKm, scale3(dirT, tacticalR));
        tacticalTarget = primaryKm;
        fr = makeFrame({ f: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }, 0, 1, observerKm);
        fr.shipKm = shipStarKm;
      } else {
        observerKm = shipStarKm;
        var shipWorldSt = snap.mode !== 'interstellar' && snap.orbit ? null : null;
        var shipVelVec = arr3(snap.observerVelKmS) || (snap.velocityGal ? scale3(unit3(snap.velocityGal), beta * C_KMS) : scale3(basis.f, beta * C_KMS));
        fr = makeFrame(basis, beta, gammaS, observerKm, snap.mode === 'interstellar' ? arr3(snap.velocityGal) : shipVelVec, shipVelVec);
      }
      lastFrame = fr;
      anim.beta = fr.beta; anim.gamma = fr.gamma;

      // Sync camera FOV before placing stars, sprites, and corridor vessels so Sextant magnification has zero 1-frame lag.
      var concourseMode = concourseWant;
      var concourseFov = clamp(56 * clamp(cZ / DEFAULT_ZOOM, 0.56, 1.24), 32, 68);
      var fovGoal = sextant ? clamp(24 * cSx, 0.08, 60) : (concourseMode ? concourseFov : 44);
      if (loupe > 1) fovGoal = 52 / loupe;
      else if (!sextant && !tactical && !drydock && !menu && !concourseMode && !reduced) fovGoal += Math.abs(anim.kick) * 2.6;
      if (Math.abs(camera.fov - fovGoal) > 0.0005) {
        if (reduced) camera.fov = fovGoal;
        else if (sextant) {
          camera.fov = Math.exp(lerp(Math.log(Math.max(0.05, camera.fov)), Math.log(Math.max(0.05, fovGoal)), 1 - Math.exp(-animDt * 14)));
        } else {
          camera.fov = camera.fov + (fovGoal - camera.fov) * (1 - Math.exp(-animDt * 8));
        }
        camera.updateProjectionMatrix();
      }
      if (sextant) camera.position.set(0, 0, 0);

      // ---- starfield / Milky Way ----
      // ---- bodies ----
      bodyRoot.visible = !ir;
      if (st.sys) placeBodies(fr, simT, animDt, tactical, snap);
      updateStarField(fr, posGal, ir, fr.gamma, snap);

      // ---- ship placement for tactical view ----
      var shipD = 0;
      if (tactical) {
        var dShip = sub3(shipStarKm, observerKm);
        var oS = observe(dShip, fr);
        shipD = shellDistance(oS.dKm);
        shipFrame.position.set(oS.n[0] * shipD, oS.n[1] * shipD, oS.n[2] * shipD);
        var iconScale = Math.max(1.0, (shipD * 0.05) / shipLengthUnits());
        if (oS.dKm * UNITS_PER_KM <= LOCAL_MAX_UNITS) iconScale = Math.max(1.0, iconScale);
        shipFrame.scale.setScalar(iconScale);
        var qb = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(
          new T.Vector3(basis.f[0], basis.f[1], basis.f[2]),
          new T.Vector3(basis.y[0], basis.y[1], basis.y[2]),
          new T.Vector3(basis.z[0], basis.z[1], basis.z[2])));
        shipFrame.quaternion.copy(qb);
        shipFrame.userData.iconScale = iconScale;
      } else {
        shipFrame.position.set(0, 0, 0);
        shipFrame.scale.setScalar(1);
        shipFrame.quaternion.identity();
      }
      var camViewHelm = (view === 'helm' && !snap.docked && !concourseMode) ? (snap.camViewMode || 'low') : 'low';
      shipFrame.visible = !sextant && loupe <= 1 && !(view === 'helm' && (!!snap.hideShip || camViewHelm === 'first'));
      if (vessel) shipFrame.updateMatrixWorld(true);

      // ---- orbit curves + 3D ribbons + holographic burn gate ----
      var curP = primaryFor(snap, null);
      var showOrbits = (tactical || view === 'helm') && !ir && st.sys && (snap.showOrbits !== false) &&
        (view !== 'helm' || Boolean(snap.showOrbitsInHelm));
      [curveCurrent, curveTransfer, curveTarget].forEach(function (c) {
        c.material.uniforms.uOpacity.value = tactical ? 0.94 : 0.90;
      });
      ribbonCurrent.material.uniforms.uOpacity.value = tactical ? 0.20 : 0.24;
      ribbonTransfer.material.uniforms.uOpacity.value = tactical ? 0.24 : 0.28;
      ribbonTarget.material.uniforms.uOpacity.value = tactical ? 0.18 : 0.22;
      var peInfo = null, apInfo = null, nodeInfo = null;
      curveCurrent.visible = curveTransfer.visible = curveTarget.visible = false;
      ribbonCurrent.visible = ribbonTransfer.visible = ribbonTarget.visible = false;
      mkPe.visible = mkAp.visible = mkNode.visible = mkTransferPe.visible = false;
      nodeGate.visible = false;
      for (var gri = 0; gri < guideRings.length; gri++) guideRings[gri].visible = false;
      anim.nodeDistKm = null;
      if (showOrbits) {
        var orbSpec = snap.orbits || {};
        var curSrc = orbSpec.current || (snap.orbit && (snap.orbit.el ? snap.orbit : null));
        if (!curSrc && snap.orbit && arr3(snap.orbit.rKm) && arr3(snap.orbit.vKmS) && Orbits && muFor(curP) > 0) {
          try { curSrc = { el: Orbits.stateToElements(arr3(snap.orbit.rKm), arr3(snap.orbit.vKmS), snap.orbit.muKm3S2 || muFor(curP)) }; } catch (e1) { curSrc = null; }
        }
        var curRef = (orbSpec.current && orbSpec.current.focusRef) || curP;
        var curMu = (curSrc && curSrc.muKm3S2) || (snap.orbit && snap.orbit.muKm3S2) || muFor(curRef);
        var anchorNu = !tactical && pickEl(curSrc) ? pickEl(curSrc).nuRad : null;
        var curSet = explicitPoints(curSrc) || sampleCached(curveCache.cur, curSrc, curMu, anchorNu);
        var curPrimaryKm = primaryStateKm(curRef, simT);
        if (curSet) {
          fillCurve(curveCurrent, curSet, curPrimaryKm, fr, false, ribbonCurrent, tactical ? 0.0015 : 0.0018);
          var elNow = pickEl(curSrc);
          if (elNow && elNow.e > 0.004 && curSet.periapsis) {
            peInfo = placeMarker(mkPe, curSet.periapsis, curPrimaryKm, fr, tmpV);
            if (curSet.apoapsis) apInfo = placeMarker(mkAp, curSet.apoapsis, curPrimaryKm, fr, tmpV);
          }
          if (!tactical && curveCurrent.userData.proj) {
            var pArr = curveCurrent.userData.proj;
            var gIdx = 0;
            var nextTargetDist = 140;
            for (var gp = 1; gp < ORBIT_PTS - 2 && gIdx < guideRings.length; gp++) {
              var gx = pArr[3 * gp], gy = pArr[3 * gp + 1], gz = pArr[3 * gp + 2];
              var gd = Math.sqrt(gx * gx + gy * gy + gz * gz);
              if (gd >= nextTargetDist && gd < 6500) {
                var txG = pArr[3 * (gp + 1)] - gx, tyG = pArr[3 * (gp + 1) + 1] - gy, tzG = pArr[3 * (gp + 1) + 2] - gz;
                var tl = Math.sqrt(txG * txG + tyG * tyG + tzG * tzG);
                if (tl > 1e-5) {
                  var grM = guideRings[gIdx++];
                  grM.position.set(gx, gy, gz);
                  grM.lookAt(gx + txG / tl, gy + tyG / tl, gz + tzG / tl);
                  grM.scale.setScalar(clamp(gd * 0.018, 2.2, 34));
                  grM.visible = true;
                  nextTargetDist *= 2.25;
                }
              }
            }
          }
        }
        if (orbSpec.transfer) {
          var xRef = orbSpec.transfer.focusRef || curRef;
          var xMu = orbSpec.transfer.muKm3S2 || muFor(xRef);
          var xSet = explicitPoints(orbSpec.transfer) || sampleCached(curveCache.xfer, orbSpec.transfer, xMu);
          if (xSet) fillCurve(curveTransfer, xSet, primaryStateKm(xRef, simT), fr, true, ribbonTransfer, tactical ? 0.0020 : 0.0024);
        }
        var currentEl = pickEl(curSrc), targetEl = pickEl(orbSpec.target);
        var sameFocus = !orbSpec.target || !orbSpec.target.focusRef ||
          (orbSpec.target.focusRef.kind === curRef.kind && (orbSpec.target.focusRef.planetIdx || 0) === (curRef.planetIdx || 0) &&
           (orbSpec.target.focusRef.moonIdx || 0) === (curRef.moonIdx || 0));
        var matchedTarget = sameFocus && currentEl && targetEl && Math.abs(currentEl.a - targetEl.a) /
          Math.max(1, Math.abs(currentEl.a)) < 0.01 && Math.abs(currentEl.e - targetEl.e) < 0.01;
        if (orbSpec.target && !matchedTarget && (tactical || (snap.burn && snap.burn.active) || snap.selectedTargetId)) {
          var tRef = orbSpec.target.focusRef || curRef;
          var tMu = orbSpec.target.muKm3S2 || muFor(tRef);
          var tSet = explicitPoints(orbSpec.target) || sampleCached(curveCache.tgt, orbSpec.target, tMu);
          if (tSet) fillCurve(curveTarget, tSet, primaryStateKm(tRef, simT), fr, false, ribbonTarget, tactical ? 0.0017 : 0.0020);
        }
        var bn = snap.burnNode;
        if (bn) {
          var bnRel = arr3(bn.rKm) || arr3(bn.posKm);
          if (bnRel) {
            var bnRef = bn.focusRef || curRef;
            var bnPrimKm = primaryStateKm(bnRef, simT);
            nodeInfo = placeMarker(mkNode, bnRel, bnPrimKm, fr, tmpV);
            if (!tactical) {
              var gateCol = bn.isFiring ? 0x63ff8d : 0xffb84d;
              nodeOuterMat.color.setHex(gateCol);
              nodeInnerMat.color.setHex(bn.isFiring ? 0x00f0ff : 0xffe49e);
              var nVec = arr3(bn.dvVecKmS);
              var dirGate = new T.Vector3(1, 0, 0);
              if (nVec) {
                var nuB = unit3(nVec);
                dirGate.set(dot3(nuB, fr.f), dot3(nuB, fr.y), dot3(nuB, fr.z)).normalize();
                nodeArrowGroup.visible = true;
                nodeArrowGroup.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dirGate);
              } else {
                nodeArrowGroup.visible = false;
              }
              if (nodeInfo && nodeInfo.dKm < 8.0) {
                var gateDist = bn.isFiring ? 72 : 90;
                var bxG = (bn.isFiring ? 1 : dirGate.x) * gateDist;
                var byG = (bn.isFiring ? 0 : dirGate.y) * gateDist;
                var bzG = (bn.isFiring ? 0 : dirGate.z) * gateDist;
                nodeGate.position.set(bxG, byG, bzG);
                nodeGate.scale.setScalar(bn.isFiring ? (5.2 + 0.8 * Math.sin(anim.t * 8)) : 5.5);
                mkNode.position.copy(nodeGate.position);
                mkNode.scale.setScalar(bn.isFiring ? 3.8 : 3.2);
                nodeInfo.vec.copy(nodeGate.position);
              } else if (nodeInfo) {
                nodeGate.position.copy(nodeInfo.vec);
                var gScale = clamp(nodeGate.position.length() * 0.018, 5.0, 260);
                nodeGate.scale.setScalar(gScale);
              }
              nodeGate.lookAt(camera.position);
              nodeOuterRing.rotation.z = anim.t * (bn.isFiring ? 2.4 : 0.85);
              nodeInnerDiamond.rotation.z = -anim.t * (bn.isFiring ? 3.2 : 1.15);
              nodeGate.visible = true;
              anim.nodeDistKm = nodeInfo ? nodeInfo.dKm : 0;
              var nxRel = arr3(bn.nextNodeRKm);
              if (nxRel) placeMarker(mkTransferPe, nxRel, bnPrimKm, fr, tmpV);
            }
          }
        }
      }

      // ---- contacts / corridor vessels ----
      var contacts = Array.isArray(snap.contacts) ? snap.contacts : [];
      lastContacts = contacts;
      pruneContacts(contacts);
      var camPos = camera.position;
      var curFov = camera.fov;
      for (var ci = 0; ci < contacts.length; ci++) {
        var ct = contacts[ci];
        ensureContact(ct);
        var id = ct.id || ct.name;
        var ov = arr3(ct.obsVec) || [1, 0, 0];
        var ctEnt = combatEntFor(snap, 'contact:' + id);
        var ctDead = Boolean(ctEnt && ctEnt.destroyed);
        var spr = contactSprites[id];
        if (spr) {
          spr.position.set(ov[0] * MARK_R, ov[1] * MARK_R, ov[2] * MARK_R);
          var isV = ct.kind === 'vessel';
          var fovScale = Math.max(0.04, curFov / 24);
          spr.visible = !ctDead && sextant && (isV || ir);
          var reticleFade = ct.genome && curFov < 6.0 ? clamp(curFov / 6.0, 0.14, 1.0) : 1.0;
          spr.material.opacity = (ir ? 0.92 : (isV ? 0.75 : 0.0)) * reticleFade;
          spr.material.color.setHex(ir ? 0x0b1610 : 0xd39bff);
          spr.scale.setScalar((isV ? 11 : 15) * fovScale * (MARK_R / 450));
        }
        var cv = corridor[id];
        if (cv) {
          var rng = sextant ? num(ct.range3d, 420) : (900 + num(ct.range3d, 420) * 2.4);
          cv.holder.visible = !ctDead && !snap.docked && (sextant || (snap.mode === 'interstellar' && !ir && !menu));
          var nx = camPos.x + ov[0] * rng, ny = camPos.y + ov[1] * rng, nz = camPos.z + ov[2] * rng;
          if (!cv._bow) cv._bow = new T.Vector3(1, 0, 0);
          if (!cv._dir) cv._dir = new T.Vector3();
          if (!cv._relDir) cv._relDir = new T.Vector3();
          if (!cv._qHull) cv._qHull = new T.Quaternion();
          if (!cv._qRel) cv._qRel = new T.Quaternion();
          var velDir = arr3(ct.obsVelDir);
          if (velDir) {
            cv._dir.set(velDir[0], velDir[1], velDir[2]).normalize();
            if (cv._dir.x < -0.9999) cv._qHull.setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI);
            else cv._qHull.setFromUnitVectors(cv._bow, cv._dir);
          } else {
            cv._qHull.identity();
          }
          var relVelDir = arr3(ct.obsRelVelDir) || velDir;
          var gRelCV = num(ct.gRel, 1.0);
          var invGCV = Math.max(0.08, 1 / gRelCV);
          if (relVelDir && gRelCV > 1.0005) {
            cv._relDir.set(relVelDir[0], relVelDir[1], relVelDir[2]).normalize();
            if (cv._relDir.x < -0.9999) cv._qRel.setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI);
            else cv._qRel.setFromUnitVectors(cv._bow, cv._relDir);
          } else {
            cv._qRel.copy(cv._qHull);
          }
          cv.holder.position.set(nx, ny, nz);
          cv.holder.quaternion.copy(cv._qRel);
          var bsCV = sextant ? 0.16 : 0.045;
          cv.holder.scale.set(bsCV * invGCV, bsCV, bsCV);
          cv.orient.quaternion.copy(cv._qRel).invert().multiply(cv._qHull);
          cv.prevPos = [nx, ny, nz];
          var Dcv = num(ct.D, 1.0);
          var optDim = (!ir && Dcv < 0.30) ? clamp(Dcv / 0.30, 0.16, 1.0) : 1.0;
          applyTint(cv.mats, num(ct.T, 800) * 6.0, Dcv, relBeamGain(Dcv) * optDim);
          cv.vessel.setPlumeIntensity(clamp(0.75 + 0.6 * Math.abs(num(ct.w, 0.5)), 0.7, 1.35) * (ir ? 1.15 : optDim), 0.45, -1, anim.t);
        }
      }
      contactGroup.visible = sextant;
      sxOverlay.visible = sextant;
      if (sextant && sxOverlay.userData.gridMat) {
        sxOverlay.userData.gridMat.color.setHex(ir ? 0x227744 : 0x7c6cf0);
        sxOverlay.userData.gridMat.opacity = ir ? 0.56 : 0.44;
        sxOverlay.userData.eqMat.color.setHex(ir ? 0x2ca858 : 0x63ff8d);
        sxOverlay.userData.eqMat.opacity = ir ? 0.72 : 0.62;
      }
      dbPoints.visible = sextant;

      // ---- acceleration & ISM effects (ship-frame axes; hidden in sextant, tactical, and 1st-person) ----
      var fxOn = !sextant && !tactical && !ir;
      fxGroup.visible = fxOn;
      var firstPersonOrHidden = (view === 'helm' && (!!snap.hideShip || camViewHelm === 'first')) || loupe > 1 || playerDead;
      var hasVesselMat = !!(vessel && vessel.group);
      var vWorldQ = new T.Quaternion();
      if (hasVesselMat) vessel.group.getWorldQuaternion(vWorldQ);
      var bowVec3 = new T.Vector3(1, 0, 0);
      if (hasVesselMat) bowVec3.applyQuaternion(vWorldQ);
      else bowVec3.set(cosF, 0, -sinF);
      var bowVec = [bowVec3.x, bowVec3.y, bowVec3.z];    // ship +X (bow) in current travel/scene frame
      var sternVec = [-bowVec3.x, -bowVec3.y, -bowVec3.z]; // ship -X (stern / aft engine bells)
      var revBraking = !!(snap.reversibleDrive && thrustG < -0.02);
      // Plumes fire out of aft bells (-X local -> sternVec) normally and during 180 deg Flip & Burn;
      // single bow-ice reversible ships fire forward braking nozzles (+X local -> bowVec) without flipping.
      // By Newton's 3rd Law, thrust acceleration always opposes the exhaust plume vector!
      var plumeDir = revBraking ? bowVec : sternVec;
      var accelDir = [-plumeDir[0], -plumeDir[1], -plumeDir[2]];
      var hasFlakes = vessel && vessel.hasIce && !hideIceFlag && vessel.iceSpawnPts && vessel.iceSpawnPts.length > 0;
      var canAblate = fxOn && !firstPersonOrHidden && hasFlakes && (thrustMag > 0.04 || beta > 0.02);
      dustLines.visible = canAblate;
      snowInfo.active = canAblate;
      snowInfo.plumeDir = plumeDir;
      snowInfo.accelDir = accelDir;
      snowInfo.plumeDirSign = plumeDirSign;
      snowInfo.flipRad = flip;
      if (canAblate) {
        // Flakes fall away from the thrust vector: -accel (= plumeDir) while burning (so a retrograde
        // Flip & Burn sheds them out along the engine's exhaust axis), else inertial ISM wind -vHat = -X.
        var wind = thrustMag > 0.04 ? plumeDir : [-1, 0, 0];
        snowInfo.windDir = wind;
        var wV = new T.Vector3(wind[0], wind[1], wind[2]);
        var u1 = Math.abs(wV.y) < 0.9 ? new T.Vector3(0, 1, 0).cross(wV).normalize() : new T.Vector3(1, 0, 0).cross(wV).normalize();
        var u2 = new T.Vector3().crossVectors(wV, u1).normalize();
        var dp = dustGeo.attributes.position.array;
        var spawn = vessel.iceSpawnPts;
        var nPts = spawn.length;
        var accelDrive = thrustMag * 15.0 + beta * 18.0 + 1.8;
        var streakLen = clamp(0.28 + thrustMag * 0.65 + beta * 1.15, 0.25, 2.2);
        var invCov = clamp(1.0 - clamp(num(snap.iceIntegrity, 1), 0, 1) * 0.35, 0.45, 1.0);
        dustMat.opacity = clamp(0.45 + thrustMag * 0.24 + beta * 0.22, 0.45, 0.92);
        var mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
        var spTmp = new T.Vector3();
        for (var di2 = 0; di2 < N_DUST; di2++) {
          var dm = dustMeta[di2];
          if (!reduced) {
            dm.dist += accelDrive * dm.speedMul * animDt;
            if (dm.dist > dm.maxTrail) { dm.dist = 0; dm.ptIdx = (dm.ptIdx + 17) % nPts; }
          }
          var sp0 = spawn[dm.ptIdx % nPts];
          // Spawn points transform with full vessel world matrix (flip + steering pitch/yaw/roll)
          if (hasVesselMat) {
            spTmp.set(sp0[0], sp0[1], sp0[2]).applyMatrix4(vessel.group.matrixWorld);
            var wx0 = spTmp.x, wy0 = spTmp.y, wz0 = spTmp.z;
          } else {
            var wx0 = sp0[0] * cosF + sp0[2] * sinF;
            var wy0 = sp0[1];
            var wz0 = -sp0[0] * sinF + sp0[2] * cosF;
          }
          var spread = (0.04 + 0.08 * invCov) * dm.dist;
          var hx = wx0 + wV.x * dm.dist + (u1.x * dm.vy + u2.x * dm.vz) * spread;
          var hy = wy0 + wV.y * dm.dist + (u1.y * dm.vy + u2.y * dm.vz) * spread;
          var hz = wz0 + wV.z * dm.dist + (u1.z * dm.vy + u2.z * dm.vz) * spread;
          var tailBack = Math.min(dm.dist, streakLen);
          var tdist = dm.dist - tailBack;
          var tspread = (0.04 + 0.08 * invCov) * tdist;
          var tx = wx0 + wV.x * tdist + (u1.x * dm.vy + u2.x * dm.vz) * tspread;
          var ty2 = wy0 + wV.y * tdist + (u1.y * dm.vy + u2.y * dm.vz) * tspread;
          var tz = wz0 + wV.z * tdist + (u1.z * dm.vy + u2.z * dm.vz) * tspread;
          dp[6 * di2] = hx; dp[6 * di2 + 1] = hy; dp[6 * di2 + 2] = hz;
          dp[6 * di2 + 3] = tx; dp[6 * di2 + 4] = ty2; dp[6 * di2 + 5] = tz;
          if (hx < mn[0]) mn[0] = hx; if (hy < mn[1]) mn[1] = hy; if (hz < mn[2]) mn[2] = hz;
          if (hx > mx[0]) mx[0] = hx; if (hy > mx[1]) mx[1] = hy; if (hz > mx[2]) mx[2] = hz;
        }
        dustGeo.attributes.position.needsUpdate = true;
        snowInfo.count = N_DUST; snowInfo.min = mn; snowInfo.max = mx;
        snowInfo.meanDir = wind.slice();
        snowInfo.againstPlumeFrac = (wind[0] * plumeDir[0] + wind[1] * plumeDir[1] + wind[2] * plumeDir[2]) < -1e-6 ? 1 : 0;
      } else {
        snowInfo.count = 0;
      }

      // ISM corridor streaks always flow along -X (inertial wind -vHat; stars/planets stay ahead of the ship)
      var showAmb = fxOn && beta > 0.08;
      ambLines.visible = showAmb;
      if (showAmb) {
        var ap = ambGeo.attributes.position.array;
        var ambSpeed = 52 * beta * Math.min(2.6, 0.75 + 0.35 * gammaS);
        var ambLen = 0.14 + 1.35 * beta * Math.min(2.4, gammaS);
        ambMat.opacity = clamp(0.06 + (beta - 0.08) * 0.28, 0.05, 0.34);
        ambMat.color.setHex(beta > 0.65 ? 0x9cd8ff : 0xd8f0ff);
        for (var ai2 = 0; ai2 < N_AMB; ai2++) {
          var am = ambMeta[ai2];
          if (!reduced) { am.x -= ambSpeed * am.mul * animDt; if (am.x < -145) am.x += 290; }
          ap[6 * ai2] = am.x; ap[6 * ai2 + 1] = am.y; ap[6 * ai2 + 2] = am.z;
          ap[6 * ai2 + 3] = am.x + ambLen * am.mul; ap[6 * ai2 + 4] = am.y; ap[6 * ai2 + 5] = am.z;
        }
        ambGeo.attributes.position.needsUpdate = true;
      }

      // Physically grounded relativistic ISM ionization shock sheath + internal Cherenkov ice luminescence:
      // Driven strictly by P_ism = beta * gamma * (gamma - 1) (zero throttle dependence!).
      var ismPower = (beta > 1e-4 && gammaS > 1.0) ? beta * gammaS * (gammaS - 1.0) : 0.0;
      var iceNow = clamp(num(snap.iceIntegrity, 1), 0, 1);
      var bowLeading = cosF >= 0;
      var hasLeadIce = !!(vessel && vessel.hasIce && !hideIceFlag && iceNow > 0.015 && (bowLeading || vessel.hasAftIce));
      var unshieldedStern = !!(vessel && (!bowLeading && !vessel.hasAftIce || !vessel.hasIce || iceNow <= 0.015));
      var sheathStrength = ismPower > 0.012
        ? clamp(Math.log(1.0 + (ismPower - 0.012) * 3.8) / 2.6, 0, 1.0)
        : 0.0;
      if (hasLeadIce) sheathStrength *= (0.28 + 0.72 * iceNow);
      var cherenkovFrac = clamp((beta - 0.58) / 0.32, 0, 1);
      var cherenkovGlow = hasLeadIce && ismPower > 0.04
        ? clamp(Math.log(1.0 + (ismPower - 0.04) * 2.4) / 2.3, 0, 1.05) * (0.35 + 0.65 * cherenkovFrac)
        : 0.0;
      var showSheath = fxOn && !firstPersonOrHidden && vessel && sheathStrength > 0.015 && Math.abs(cosF) > 0.25;
      ismSheath.visible = showSheath;
      if (showSheath) {
        var vSeamX = isNum(vessel.seamX) ? vessel.seamX : -5.5;
        var xBase = bowLeading ? vSeamX : -vSeamX;
        var xTip = bowLeading ? ((vessel.bowX || 22) + 0.55) : (-(vessel.sternX || -18) + 0.55);
        var coneLen = Math.max(4.0, (xTip - xBase) * Math.abs(cosF));
        var ryS = Math.max(1.2, (vessel.rySeam || 3.2) * 1.07);
        var rzS = Math.max(1.2, (vessel.rzSeam || 4.2) * 1.07);
        if (hasVesselMat) {
          var sBase = new T.Vector3(vSeamX * Math.abs(cosF), 0, 0).applyMatrix4(vessel.group.matrixWorld);
          ismSheath.position.copy(sBase);
          ismSheath.quaternion.copy(vWorldQ);
          if (!bowLeading) ismSheath.quaternion.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.PI));
        } else {
          ismSheath.position.set(xBase * Math.abs(cosF), 0, 0);
          ismSheath.quaternion.identity();
        }
        ismSheath.scale.set(coneLen, ryS, rzS);
        ismSheathMat.uniforms.uIntensity.value = sheathStrength * Math.abs(cosF);
        ismSheathMat.uniforms.uCherenkov.value = cherenkovFrac;
        ismSheathMat.uniforms.uWarnHot.value = unshieldedStern ? 1.0 : clamp((0.12 - iceNow) / 0.12, 0, 1);
        ismSheathMat.uniforms.uTime.value = anim.t;
      }
      if (vessel && vessel.setCherenkovGlow) {
        vessel.setCherenkovGlow(
          bowLeading ? cherenkovGlow : 0,
          (!bowLeading && vessel.hasAftIce) ? cherenkovGlow : 0
        );
      }
      ismDiag.power = ismPower;
      ismDiag.active = showSheath;
      ismDiag.sheathIntensity = showSheath ? sheathStrength : 0;
      ismDiag.cherenkovFore = bowLeading ? cherenkovGlow : 0;
      ismDiag.cherenkovAft = (!bowLeading && vessel && vessel.hasAftIce) ? cherenkovGlow : 0;

      // ---- camera ----
      concourseRig.group.visible = concourseMode;
      var lookTarget = new T.Vector3();
      var wantOx = 0;
      var wantOy = (view === 'helm' && !concourseMode && clearPx > 10 && ch > clearPx + 120) ? Math.round(clearPx * 0.45) : 0;

      if (sextant) {
        syncViewOffset(cw, ch, 0, 0);
        var aim = scopeAim(snap);
        camera.position.set(0, 0, 0);
        if (Math.abs(aim[1]) > 0.998) camera.up.set(-1, 0, 0);
        else camera.up.set(0, 1, 0);
        camera.lookAt(aim[0] * 1000, aim[1] * 1000, aim[2] * 1000);
        lookTarget.set(aim[0] * 1000, aim[1] * 1000, aim[2] * 1000);
      } else if (loupe > 1) {
        syncViewOffset(cw, ch, 0, 0);
        camera.position.set(0, 0, 0);
        var prograde = snap.mode === 'interstellar' ? fr.boost : arr3(snap.hud && snap.hud.progradeShip) || fr.boost;
        camera.up.set(Math.abs(prograde[1]) > 0.998 ? 1 : 0, Math.abs(prograde[1]) > 0.998 ? 0 : 1, 0);
        lookTarget.set(prograde[0] * 1000, prograde[1] * 1000, prograde[2] * 1000);
        camera.lookAt(lookTarget);
      } else if (tactical) {
        syncViewOffset(cw, ch, 0, 0);
        camera.position.set(0, 0, 0);
        camera.up.set(0, 0, 1);
        var tgt = sub3(tacticalTarget, observerKm);
        var oT = observe(tgt, fr);
        var Dt = shellDistance(oT.dKm);
        lookTarget.set(oT.n[0] * Dt, oT.n[1] * Dt, oT.n[2] * Dt);
        camera.lookAt(lookTarget);
      } else if (concourseMode) {
        syncViewOffset(cw, ch, 0, 0);
        var midXc = vessel ? ((vessel.bowX || 22) + (vessel.sternX || -18)) * 0.5 : 2;
        var pDir = (bodyByKey.planet && bodyByKey.planet.holder.position.lengthSq() > 1)
          ? bodyByKey.planet.holder.position.clone().normalize()
          : new T.Vector3(0.28, -0.08, -0.95).normalize();
        // Position the curved observation corridor opposite the ringed planet so the moored Lighthugger
        // and the giant ringed world both frame majestically outside the panoramic bay windows.
        var cPos = pDir.clone().multiplyScalar(-64).add(new T.Vector3(0, 3.8, 0));
        concourseRig.group.position.copy(cPos);
        concourseRig.group.up.set(0, 1, 0);
        concourseRig.group.lookAt(cPos.x * 2 - midXc, cPos.y * 2, cPos.z * 2);
        concourseRig.group.updateMatrixWorld(true);
        if (bodyByKey.station) bodyByKey.station.holder.visible = false;
        dockClampLine.visible = false;
        var panY = clamp(cY - DEFAULT_YAW, -1.05, 1.05);
        var panP = clamp(cP - DEFAULT_PITCH, -0.42, 0.42);
        var eyeLocal = new T.Vector3(0, 0.34, 1.55);
        var lookLocal = new T.Vector3(Math.sin(panY) * 26, 0.14 + Math.sin(panP) * 14, -Math.cos(panY) * 26);
        camera.position.copy(eyeLocal).applyMatrix4(concourseRig.group.matrixWorld);
        lookTarget.copy(lookLocal).applyMatrix4(concourseRig.group.matrixWorld);
        camera.up.set(0, 1, 0);
        camera.lookAt(lookTarget);
      } else {
        var shiftGoal = (menu || drydock) ? 0 : num(snap.paneShiftX, 0);
        anim.paneShift = reduced ? shiftGoal : anim.paneShift + (shiftGoal - anim.paneShift) * (1 - Math.exp(-animDt * 10));
        var midX = vessel ? ((vessel.bowX || 22) + (vessel.sternX || -18)) * 0.5 : 2;
        var halfLen = Math.max(12, shipLengthUnits() * 0.5);
        var aspectNow = cw / Math.max(1, ch);
        var halfVertTan = Math.tan(camera.fov * RAD * 0.5);
        var halfHorizTan = Math.max(0.08, halfVertTan * aspectNow);
        var zoomFactor = clamp(cZ / DEFAULT_ZOOM, 0.18, 6.0);
        var fitDist = 76 * DEFAULT_ZOOM;

        // Analytic frustum framing via camera.setViewOffset keeps the ship centered in the open sky
        // corridor while orbit distance stays 100% constant on rotation and strictly monotonic on zoom.
        if (menu) {
          if (aspectNow >= 1) {
            var menuDoc = canvasEl.ownerDocument;
            var menuCanvasRect = canvasEl.getBoundingClientRect();
            var menuLeftEl = menuDoc.querySelector('#lh-menu-left');
            var menuRightEl = menuDoc.querySelector('#lh-menu-right');
            var menuLeftR = menuLeftEl && menuLeftEl.getBoundingClientRect();
            var menuRightR = menuRightEl && menuRightEl.getBoundingClientRect();
            var openL = 0, openR = menuCanvasRect.width || cw, haveRack = false;
            if (menuLeftR && menuLeftR.width > 1 && menuLeftR.height > 1 && menuLeftR.right > menuCanvasRect.left) {
              openL = Math.max(openL, menuLeftR.right - menuCanvasRect.left); haveRack = true;
            }
            if (menuRightR && menuRightR.width > 1 && menuRightR.height > 1 && menuRightR.left < menuCanvasRect.right) {
              openR = Math.min(openR, menuRightR.left - menuCanvasRect.left); haveRack = true;
            }
            var menuW = Math.max(1, menuCanvasRect.width || cw);
            var openFracM = clamp((openR - openL) / menuW, 0.32, 1);
            var targetCenterX = haveRack ? ((openL + openR) * 0.5) : (menuW * 0.5);
            wantOx = Math.abs(targetCenterX - menuW * 0.5) > 2 ? Math.round((menuW * 0.5 - targetCenterX) * (cw / menuW)) : 0;
            wantOy = 0;
            fitDist = Math.max(52, halfLen / Math.max(0.16, openFracM * 0.78 * halfHorizTan));
          } else {
            wantOx = 0;
            wantOy = Math.round(ch * 0.20);
            fitDist = Math.max(64, halfLen / Math.max(0.12, 0.80 * halfHorizTan));
          }
        } else if (drydock) {
          if (aspectNow >= 1) {
            var architect = canvasEl.ownerDocument.querySelector('#lh-screen-drydock .lh-split-panel');
            var canvasRect = canvasEl.getBoundingClientRect();
            var panelRect = architect && architect.getBoundingClientRect();
            var dockW = Math.max(1, canvasRect.width || cw);
            var openFrac = 1;
            if (panelRect && panelRect.width > 1 && panelRect.left > canvasRect.left) {
              var openRight = panelRect.left - canvasRect.left;
              openFrac = clamp(openRight / dockW, 0.30, 1);
              wantOx = Math.round((dockW * 0.5 - openRight * 0.5) * (cw / dockW));
            }
            wantOy = 0;
            fitDist = Math.max(46, halfLen / Math.max(0.16, openFrac * 0.80 * halfHorizTan));
          } else {
            wantOx = 0;
            wantOy = Math.round(ch * 0.24);
            fitDist = Math.max(64, halfLen / Math.max(0.12, 0.80 * halfHorizTan));
          }
        } else {
          // Helm chase / viewpoint presets: 3rd person (low), 3rd person (high), or close 1st person cockpit
          var helmView = (!snap.docked && !concourseMode) ? (snap.camViewMode || 'low') : 'low';
          if (helmView === 'first') {
            fitDist = 5.4;
          } else if (helmView === 'high') {
            fitDist = aspectNow < 1
              ? Math.max(88 * DEFAULT_ZOOM, halfLen / Math.max(0.12, 0.78 * halfHorizTan))
              : (88 * DEFAULT_ZOOM);
          } else {
            fitDist = aspectNow < 1
              ? Math.max(76 * DEFAULT_ZOOM, halfLen / Math.max(0.12, 0.82 * halfHorizTan))
              : (76 * DEFAULT_ZOOM);
          }
        }

        syncViewOffset(cw, ch, wantOx, wantOy);
        var helmViewMode = (!drydock && !menu && !concourseMode && !snap.docked) ? (snap.camViewMode || 'low') : 'low';
        var dist = helmViewMode === 'first'
          ? 2.8
          : clamp(fitDist * zoomFactor, Math.max(10, halfLen * 0.34), Math.max(280, halfLen * 20));
        var steerLagY = (!drydock && !menu && !concourseMode && !reduced && helmViewMode !== 'first') ? steerYaw * 0.12 : 0;
        var steerLagP = (!drydock && !menu && !concourseMode && !reduced && helmViewMode !== 'first') ? -steerPitch * 0.08 : 0;
        var effY = cY + steerLagY;
        var effP = clamp(cP + steerLagP, -1.4, 1.4);
        var pivotX = helmViewMode === 'first' ? (vessel ? Math.max(4, (vessel.bowX || 22) * 0.56) : 10) : midX;
        var pivotY = helmViewMode === 'first' ? 0.35 : 0;
        var cxCam = Math.cos(effP) * Math.cos(effY) * dist + pivotX;
        var cyCam = Math.sin(effP) * dist + pivotY;
        var czCam = Math.cos(effP) * Math.sin(effY) * dist;
        var camVec = new T.Vector3(cxCam, cyCam, czCam);
        var chaseFrame = view === 'helm' && !snap.docked && !concourseMode;
        if (helmViewMode === 'first') {
          lookTarget.set(
            pivotX - Math.cos(effP) * Math.cos(effY) * 28,
            pivotY - Math.sin(effP) * 28,
            -Math.cos(effP) * Math.sin(effY) * 28
          );
        } else if (helmViewMode === 'high') {
          lookTarget.set(chaseFrame ? (midX + 4) : midX, chaseFrame ? 0.4 : 0.8, 0);
        } else {
          lookTarget.set(chaseFrame ? (midX + 6) : midX, chaseFrame ? -1.4 : 0, 0);
        }
        if (!drydock && !menu && !reduced && Math.abs(anim.kick) > 1e-4) {
          // camera lags behind the ship under thrust: pulled opposite the acceleration vector
          var lagVec = new T.Vector3(accelDir[0], accelDir[1], accelDir[2]).multiplyScalar(-Math.abs(anim.kick) * 7.0);
          camVec.add(lagVec);
          lookTarget.addScaledVector(lagVec, 0.35);
        }
        if (!drydock && !menu && !reduced && thrustMag > 0.05) {
          var shk = 0.012 * Math.min(1, thrustMag);
          camVec.y += Math.sin(anim.t * 9.5) * shk;
          camVec.z += Math.sin(anim.t * 7.8 + 1.3) * shk;
        }
        if (hitJoltTimer > 0 && !reduced && !drydock && !menu) {
          var jk = (hitJoltTimer / 0.38) * 1.15;
          camVec.x += Math.sin(anim.t * 58) * jk * 0.45;
          camVec.y += Math.cos(anim.t * 73) * jk;
          camVec.z += Math.sin(anim.t * 64 + 0.9) * jk * 0.8;
        }
        if (Math.abs(anim.paneShift) > 0.02) {
          var fwdC = new T.Vector3().subVectors(lookTarget, camVec).normalize();
          var rightC = new T.Vector3().crossVectors(fwdC, new T.Vector3(0, 1, 0)).normalize();
          camVec.addScaledVector(rightC, anim.paneShift);
          lookTarget.addScaledVector(rightC, anim.paneShift);
        }
        // Keep chase camera eye strictly outside every visible celestial sphere (planet/moon/star).
        var camNearPad = Math.max(camera.near * 3, 2.2);
        for (var ccPass = 0; ccPass < 2; ccPass++) {
          for (var ccI = 0; ccI < bodies.length; ccI++) {
            var ccB = bodies[ccI];
            if (!ccB || !ccB.holder || !ccB.holder.visible) continue;
            if (ccB.kind !== 'planet' && ccB.kind !== 'moon' && !ccB.isStar) continue;
            var ccVisR = Math.max(0, num(ccB.vis && ccB.vis.Rr, 0));
            if (!(ccVisR > 0.01)) continue;
            var ccPos = ccB.holder.position;
            var ccMinR = ccVisR + camNearPad;
            var ccDx = camVec.x - ccPos.x, ccDy = camVec.y - ccPos.y, ccDz = camVec.z - ccPos.z;
            var ccDist = Math.sqrt(ccDx * ccDx + ccDy * ccDy + ccDz * ccDz);
            if (ccDist < ccMinR) {
              var outX = ccDx, outY = ccDy, outZ = ccDz, outL = ccDist;
              if (outL < 1e-6) {
                outX = lookTarget.x - ccPos.x; outY = lookTarget.y - ccPos.y; outZ = lookTarget.z - ccPos.z;
                outL = Math.sqrt(outX * outX + outY * outY + outZ * outZ);
              }
              if (outL < 1e-6) { outX = 0; outY = 1; outZ = 0; outL = 1; }
              var ccScale = ccMinR / outL;
              camVec.set(ccPos.x + outX * ccScale, ccPos.y + outY * ccScale, ccPos.z + outZ * ccScale);
            }
          }
        }
        camera.position.copy(camVec);
        camera.up.set(0, 1, 0);
        camera.lookAt(lookTarget);
      }
      lastTargetVec.copy(lookTarget);
      camera.updateMatrixWorld(true);
      for (var hiB = 0; hiB < bodies.length; hiB++) {
        if (bodies[hiB].isStar && bodies[hiB].halo) {
          bodies[hiB].halo.quaternion.copy(camera.quaternion);
        }
      }

      // sky recenters on the camera (starfield & MW dome sit beyond every body shell)
      mwDome.position.copy(camera.position);
      starPoints.position.copy(camera.position);
      dbPoints.position.copy(camera.position);
      sxOverlay.position.copy(camera.position);
      starMat.size = loupe > 1 ? 2.6 : 3.4;
      dbMat.size = loupe > 1 ? 15 : 22;

      // IR / normal sextant optics
      if (sextant) {
        scene.background = ir ? new T.Color(0xe6eeea) : null;
        starMat.blending = ir ? T.NormalBlending : T.AdditiveBlending;
        starMat.color.setHex(ir ? 0x222824 : 0xffffff);
        dbMat.blending = ir ? T.NormalBlending : T.AdditiveBlending;
        dbMat.color.setHex(ir ? 0x28322c : 0xffffff);
        mwMat.blending = ir ? T.NormalBlending : T.AdditiveBlending;
      } else {
        scene.background = null;
        starMat.blending = T.AdditiveBlending;
        starMat.color.setHex(0xffffff);
        mwMat.blending = T.AdditiveBlending;
      }

      // Sync exact object-space camera & light vectors for volumetric atmosphere & cloud ring shadows
      if (st.diorama && bodyByKey.planet && bodyByKey.planet.dioramaPlanet) {
        var pBody = bodyByKey.planet;
        pBody.holder.updateMatrixWorld(true);
        tmpInvMat.copy(st.diorama.planetGroup.matrixWorld).invert();
        tmpCamLoc.copy(camera.position).applyMatrix4(tmpInvMat);
        tmpOriginLoc.copy(pBody.holder.position).applyMatrix4(tmpInvMat);
        tmpLightEnd.copy(pBody.holder.position).add(lastPlanetLight).applyMatrix4(tmpInvMat);
        tmpLightLoc.subVectors(tmpLightEnd, tmpOriginLoc).normalize();
        if (st.diorama.atmoMat && st.diorama.atmoMat.uniforms) {
          st.diorama.atmoMat.uniforms.uCamLocal.value.copy(tmpCamLoc);
          st.diorama.atmoMat.uniforms.uLightLocal.value.copy(tmpLightLoc);
          var insideAtmo = tmpCamLoc.length() < (st.diorama.atmoMat.uniforms.uAtmoR.value * 1.03);
          var wantAtmoSide = insideAtmo ? T.BackSide : T.FrontSide;
          if (st.diorama.atmoMat.side !== wantAtmoSide) {
            st.diorama.atmoMat.side = wantAtmoSide;
            st.diorama.atmoMat.needsUpdate = true;
          }
        }
        if (st.diorama.planetMat && st.diorama.planetMat.uniforms) {
          st.diorama.planetMat.uniforms.uCamLocal.value.copy(tmpCamLoc);
          st.diorama.planetMat.uniforms.uLightLocal.value.copy(tmpLightLoc);
          st.diorama.planetMat.uniforms.uSpinY.value = st.diorama.planetMesh ? st.diorama.planetMesh.rotation.y : 0;
          if (st.diorama.planetMat.uniforms.uTime) st.diorama.planetMat.uniforms.uTime.value = anim.t;
        }
      }
      for (var va = 0; va < bodies.length; va++) {
        var bVA = bodies[va];
        if (!bVA.volAtmo || bVA.dioramaPlanet) continue;
        var showAtmo = bVA.holder.visible && (bVA.vis.angRad > 0.004 || bVA.vis.dKm < bVA.physR * 150);
        bVA.volAtmo.mesh.visible = showAtmo;
        if (!showAtmo) continue;
        bVA.holder.updateMatrixWorld(true);
        tmpInvMat.copy(bVA.volAtmo.mesh.parent.matrixWorld).invert();
        tmpCamLoc.copy(camera.position).applyMatrix4(tmpInvMat);
        tmpOriginLoc.copy(bVA.holder.position).applyMatrix4(tmpInvMat);
        tmpLightEnd.copy(bVA.holder.position).add(bVA.lastLs || lastPlanetLight).applyMatrix4(tmpInvMat);
        tmpLightLoc.subVectors(tmpLightEnd, tmpOriginLoc).normalize();
        var vaU = bVA.volAtmo.mat.uniforms;
        vaU.uCamLocal.value.copy(tmpCamLoc);
        vaU.uLightLocal.value.copy(tmpLightLoc);
        var inBAtmo = tmpCamLoc.length() < (vaU.uAtmoR.value * 1.03);
        var wantBSide = inBAtmo ? T.BackSide : T.FrontSide;
        if (bVA.volAtmo.mat.side !== wantBSide) {
          bVA.volAtmo.mat.side = wantBSide;
          bVA.volAtmo.mat.needsUpdate = true;
        }
      }

      dockClampLine.visible = false;
      updateWeaponFx(snap, !concourseMode);
      updateProjectileFx(fr, snap, !concourseMode && !sextant, tactical);
      updateExplosions(snap, !concourseMode);
      updateShuttleTraffic(snap, view, concourseMode, animDt);

      if (gfx.aa === 'msaa4') {
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
      } else {
        var rtPost = ensurePostRT(cw, ch);
        renderer.setRenderTarget(rtPost);
        renderer.clear();
        renderer.render(scene, camera);
        postQuad.material = gfx.aa === 'off' ? copyMat : fxaaMat;
        copyMat.uniforms.tDiffuse.value = rtPost.texture;
        fxaaMat.uniforms.tDiffuse.value = rtPost.texture;
        fxaaMat.uniforms.uTexel.value.set(1 / rtPost.width, 1 / rtPost.height);
        renderer.setRenderTarget(null);
        renderer.render(postScene, postCam);
      }
      buildAnchors(snap, fr, view, { pe: peInfo, ap: apInfo, node: nodeInfo }, tactical);
    }

    // ------------------------------------------------------------------------------------------
    // Labels
    // ------------------------------------------------------------------------------------------
    function addAnchor(list, key, text, vec, prio, cls, action, dKm) {
      list.push({ key: key, text: text, vec: vec.clone ? vec.clone() : new T.Vector3(vec[0], vec[1], vec[2]), prio: prio, cls: cls, action: action, dKm: dKm });
    }

    function buildAnchors(snap, fr, view, marks, tactical) {
      var list = [];
      var sextant = view === 'sextant';
      var helm = view === 'helm' && !tactical;
      var cruise = snap && snap.mode === 'interstellar';
      var ir = sextant && !!snap.irSight;
      function combatSuffix(id) {
        var ce = combatEntFor(snap, id);
        if (!ce) return { tag: '', cls: '', ent: null };
        if (ce.destroyed) return { tag: ' [WRECK]', cls: ' is-destroyed', ent: ce };
        var pct = Math.round(clamp(ce.hullFrac != null ? ce.hullFrac : 1, 0, 1) * 100);
        if (ce.hostile) return { tag: ' [HOSTILE ' + pct + '%]', cls: ' is-hostile', ent: ce };
        if (ce.state === 'damaged' || ce.state === 'critical') {
          return { tag: ' [' + (ce.state === 'critical' ? 'CRIT ' : 'DMG ') + pct + '%]', cls: ' is-hostile', ent: ce };
        }
        return { tag: '', cls: '', ent: ce };
      }
      if (st.sys && !ir) {
        for (var i = 0; i < bodies.length; i++) {
          var b = bodies[i];
          if (!b.holder.visible) continue;
          var pos = b.holder.position;
          var distTxt = ' \u00b7 ' + fmtDist(b.vis.dKm);
          var nm = String(b.name || '').toUpperCase();
          if (helm && cruise && !['departure', 'approach', 'capture'].includes(snap.transitStage) &&
              !snap.multiHop?.harvesting) {
            if (b.key === 'star' && b.vis.dKm < 0.06 * LY_KM) {
              addAnchor(list, 'star', 'HOST STAR \u00b7 ' + nm + distTxt, pos, 76, 'is-star', 'target:star', b.vis.dKm);
            }
            continue;
          }
          if (b.key === 'star') addAnchor(list, 'star', 'STAR \u00b7 ' + nm + distTxt, pos, 70, 'is-star', 'target:star', b.vis.dKm);
          else if (b.key === 'binary') {
            if (!helm) addAnchor(list, 'binary', 'COMPANION \u00b7 ' + nm + distTxt, pos, 40, 'is-star', 'target:binary', b.vis.dKm);
          } else if (b.key === 'planet') addAnchor(list, 'planet', nm + distTxt, pos, 82, 'is-planet', 'target:planet', b.vis.dKm);
          else if (b.kind === 'planet') {
            // Suppress distant outer planets on Helm to keep the viewport clean; show in Orbit Nav & Sextant
            if (!helm) addAnchor(list, b.key, nm + distTxt, pos, 30, 'is-planet', 'target:planet:' + b.planetIdx, b.vis.dKm);
          } else if (b.kind === 'moon') {
            var actPi = (snap.orbit && snap.orbit.planetIdx) || 0;
            if ((b.planetIdx === 0 || b.planetIdx === actPi) && (!helm || b.vis.dKm < 450000)) {
              addAnchor(list, b.key, 'MOON \u00b7 ' + nm + distTxt, pos, 50, 'is-moon', 'target:moon:' + b.moonIdx, b.vis.dKm);
            }
          } else if (b.key === 'station') {
            var stTag = combatSuffix('body:station');
            addAnchor(list, 'station', 'STATION \u00b7 ' + nm + distTxt + stTag.tag, pos, 92, 'is-station' + stTag.cls, 'target:station', b.vis.dKm);
          } else if (b.kind === 'ice-deposit') {
            var depActId = (snap.iceHarvest && snap.iceHarvest.active && snap.iceHarvest.depositId)
              || (snap.multiHop && snap.multiHop.harvestSite && snap.multiHop.harvestSite.depositId);
            var isActIceDep = !!(b.depositId && b.depositId === depActId);
            if (!helm || isActIceDep || b.vis.dKm < 2.5e6) {
              addAnchor(list, b.key, 'ICE \u00b7 ' + nm + distTxt, pos, isActIceDep ? 88 : 42, 'is-ice', 'target:' + b.depositId, b.vis.dKm);
            }
          } else if (b.key === 'npc' || b.key === 'npc2') {
            var nTag = combatSuffix('body:' + b.key);
            var nShow = !helm || b.vis.dKm < 600 || (nTag.ent && (nTag.ent.hostile || nTag.ent.state !== 'nominal'));
            if (nShow) addAnchor(list, b.key, 'SHIP \u00b7 ' + nm + distTxt + nTag.tag, pos, nTag.ent && nTag.ent.hostile ? 84 : 54, 'is-npc' + nTag.cls, b.key, b.vis.dKm);
          }
        }
      }
      if (tactical) {
        addAnchor(list, 'ship', 'YOU', shipFrame.position, 95, 'is-ship', 'ship', 0);
      }
      if (!cruise) {
        if (marks.pe) addAnchor(list, 'pe', 'PE', marks.pe.vec, 58, 'is-pe', 'pe', marks.pe.dKm);
        if (marks.ap) addAnchor(list, 'ap', 'AP', marks.ap.vec, 58, 'is-ap', 'ap', marks.ap.dKm);
        if (marks.node) {
          var bnS = snap && snap.burnNode;
          var bnTxt = 'BURN NODE';
          if (bnS && bnS.isFiring) {
            bnTxt = 'IGNITING \u00b7 ' + String(bnS.label || 'BURN').toUpperCase() + ' \u00b7 ' + Math.round((bnS.burnProgress || 0) * 100) + '%';
          } else if (bnS && bnS.label) {
            var bnT = isNum(bnS.dtS) && bnS.dtS > 1 ? (' \u00b7 T-' + (bnS.dtS < 90 ? Math.round(bnS.dtS) + 's' : bnS.dtS < 5400 ? (bnS.dtS / 60).toFixed(1) + 'm' : (bnS.dtS / 3600).toFixed(1) + 'h')) : '';
            var bnD = marks.node.dKm > 10 ? (' \u00b7 ' + fmtDist(marks.node.dKm)) : '';
            bnTxt = 'BURN \u00b7 ' + String(bnS.label).toUpperCase() + bnT + bnD;
          }
          addAnchor(list, 'node', bnTxt, marks.node.vec, 90, 'is-node', 'node', marks.node.dKm);
        }
      }

      // destination star: aberrated catalog bearing (or the host star proxy when we are at the destination)
      var destId = snap.courseDestId;
      if (destId && !tactical) {
        var di = -1;
        for (var q = 0; q < N_SYS; q++) if (SYSTEMS[q].id === destId) { di = q; break; }
        var ds = di >= 0 ? SYSTEMS[di] : (Galaxy.getSystem ? Galaxy.getSystem(destId) : null);
        if (ds) {
          var isVisitedDest = !ds.procedural || (Array.isArray(snap.visitedSystems) && snap.visitedSystems.indexOf(ds.id) >= 0);
          var destLabelName = isVisitedDest ? String(ds.name).toUpperCase() : ('UNIDENTIFIED ' + (ds.signalId || ds.id.toUpperCase()));
          if (ds.id === (st.sys && st.sys.id) && bodyByKey.star) {
            addAnchor(list, 'dest', 'DEST \u00b7 ' + destLabelName, bodyByKey.star.holder.position, 86, 'is-dest', 'dest:' + destId, bodyByKey.star.vis.dKm);
          } else {
            var posGal = arr3(snap.posGal);
            var dVec = posGal ? sub3(ds.xyz, posGal) : ds.xyz;
            var dLy = norm3(dVec);
            var dv = di >= 0 ? starObsDir(di) : (function () { var od = observe(dVec, fr); return new T.Vector3(od.n[0], od.n[1], od.n[2]); })();
            addAnchor(list, 'dest', 'DEST \u00b7 ' + destLabelName + (posGal ? ' \u00b7 ' + dLy.toFixed(dLy < 1 ? 3 : 2) + ' LY' : ''),
              dv.clone().multiplyScalar(1000).add(camera.position), cruise ? 94 : 74, 'is-dest', 'dest:' + destId, dLy * LY_KM);
          }
        }
      }
      // corridor vessels: show in Sextant or Interstellar cruise (not while orbiting/docked on Helm!)
      if (!tactical && (sextant || cruise)) {
        var maxVessels = sextant ? lastContacts.length : 2;
        for (var c = 0; c < lastContacts.length && c < maxVessels; c++) {
          var ct = lastContacts[c];
          if (ct.kind !== 'vessel') continue;
          var cid = ct.id || ct.name;
          var cv = corridor[cid];
          var ov = arr3(ct.obsVec) || [1, 0, 0];
          var cp = cv ? cv.holder.position.clone() : new T.Vector3(ov[0], ov[1], ov[2]).multiplyScalar(MARK_R).add(camera.position);
          var cTag = combatSuffix('contact:' + cid);
          addAnchor(list, 'contact:' + cid, String(ct.name || cid).toUpperCase() + (isNum(ct.rangeKm) ? ' \u00b7 ' + fmtDist(ct.rangeKm) : '') + cTag.tag,
            cp, (cTag.ent && cTag.ent.hostile) ? 86 : 65, 'is-contact' + cTag.cls, 'contact:' + cid, num(ct.rangeKm, 0));
        }
      }
      anchors = list;
    }

    function projectLabels(W, H, snap) {
      W = W || canvasEl.clientWidth || 800;
      H = H || canvasEl.clientHeight || 450;
      var out = [];
      var v = new T.Vector3();
      for (var i = 0; i < anchors.length; i++) {
        var a = anchors[i];
        v.copy(a.vec).project(camera);
        // Strictly inside view frustum: never clamp off-screen bodies onto viewport edges
        if (!(v.z > -1 && v.z < 1)) continue;
        var x = (v.x * 0.5 + 0.5) * W;
        var y = (-v.y * 0.5 + 0.5) * H;
        var estWidth = Math.ceil(String(a.text).length * 6.8) + 22;
        if (x < 18 || x > W - Math.min(estWidth + 12, W * 0.35) || y < 22 || y > H - 26) continue;
        out.push({ key: a.key, text: a.text, x: x, y: y, prio: a.prio, cls: a.cls, action: a.action, dKm: a.dKm });
      }
      out.sort(function (p, q) {
        if (q.prio !== p.prio) return q.prio - p.prio;
        return p.key < q.key ? -1 : (p.key > q.key ? 1 : 0);
      });
      return out;
    }

    // ------------------------------------------------------------------------------------------
    // Sextant lock
    // ------------------------------------------------------------------------------------------
    function thetaAz(v) {
      var th = Math.acos(clamp(v.x, -1, 1)) / RAD;
      var az = ((Math.atan2(v.z, v.y) / RAD) + 360) % 360;
      return { theta: th, az: az };
    }
    function findSextantLock(aimVec, fovDeg, contacts, irSight) {
      var aimA = aimVec && aimVec.x !== undefined ? [aimVec.x, aimVec.y, aimVec.z] : (arr3(aimVec) || scopeAim(lastSnap));
      var aim = new T.Vector3(aimA[0], aimA[1], aimA[2]).normalize();
      var fov = isNum(fovDeg) ? fovDeg : camera.fov;
      var list = contacts || lastContacts || [];
      var tolDeg = Math.max(0.06, fov * 0.055);
      var bestCos = Math.cos(tolDeg * RAD);
      var best = null;
      for (var k = 0; k < list.length; k++) {
        var ct = list[k];
        if (ct.kind === 'dust' && !irSight) continue;
        var ov = arr3(ct.obsVec);
        if (!ov) continue;
        var dir = new T.Vector3(ov[0], ov[1], ov[2]).normalize();
        var c = dir.dot(aim);
        if (c > bestCos) {
          bestCos = c;
          best = {
            key: 'c' + k, kind: ct.kind, name: ct.name, role: ct.role, hasLine: ct.hasLine, w: ct.w, T: ct.T,
            theta: ct.theta, az: ct.az, dir: dir, contact: ct
          };
        }
      }
      if (best) return best;

      // system bodies (angular-exact): lock when the aim falls inside the apparent disc
      if (st.sys && !irSight) {
        var bodyHit = null, bodyCos = -2;
        for (var bi = 0; bi < bodies.length; bi++) {
          var b = bodies[bi];
          if (!b.vis || !b.vis.visible || b.kind === 'planet' && b.key !== 'planet') continue;
          var bn = new T.Vector3(b.vis.n[0], b.vis.n[1], b.vis.n[2]).normalize();
          var bc = bn.dot(aim);
          var rad = Math.max(tolDeg * RAD * 0.8, b.vis.angRad * 1.04);
          if (bc > Math.cos(Math.min(rad, 1.5)) && bc > bodyCos) { bodyCos = bc; bodyHit = { b: b, dir: bn }; }
        }
        if (bodyHit) {
          var ta0 = thetaAz(bodyHit.dir);
          return {
            key: 'b:' + bodyHit.b.key, kind: 'body', bodyKind: bodyHit.b.kind, name: bodyHit.b.name,
            T: bodyHit.b.T, theta: ta0.theta, az: ta0.az, dir: bodyHit.dir, dKm: bodyHit.b.vis.dKm
          };
        }
      }

      var pos = starGeo.attributes.position.array;
      var starHit = -1;
      for (var i = 0; i < N_STARS; i++) {
        if (starCat[i].hidden) continue;
        var cs = (pos[3 * i] * aim.x + pos[3 * i + 1] * aim.y + pos[3 * i + 2] * aim.z) / SKY_R;
        if (cs > bestCos) { bestCos = cs; starHit = i; }
      }
      if (starHit >= 0) {
        var s = starCat[starHit];
        var isSys = starHit < N_SYS;
        var sv = starObsDir(starHit);
        var ta = thetaAz(sv);
        return {
          key: 's' + starHit, kind: 'star', idx: starHit, sysId: isSys ? SYSTEMS[starHit].id : null,
          name: isSys ? SYSTEMS[starHit].name : ('Milky Way Star MW-' + starHit),
          cls: isSys ? SYSTEMS[starHit].cls : spectralClass(s.T), T: s.T, theta: ta.theta, az: ta.az, dir: sv
        };
      }
      return null;
    }
    function spectralClass(temp) {
      var bands = [[30000, 52000, 'O'], [10000, 30000, 'B'], [7500, 10000, 'A'], [6000, 7500, 'F'], [5200, 6000, 'G'], [3700, 5200, 'K'], [2000, 3700, 'M']];
      for (var i = 0; i < bands.length; i++) {
        if (temp >= bands[i][0]) return bands[i][2] + Math.min(9, Math.floor(10 * (bands[i][1] - temp) / (bands[i][1] - bands[i][0])));
      }
      return 'M8';
    }

    function projectDir(dir3, W, H) {
      if (!dir3) return null;
      W = W || canvasEl.clientWidth || 800;
      H = H || canvasEl.clientHeight || 450;
      var dLen = Math.hypot(dir3[0], dir3[1], dir3[2]);
      if (!(dLen > 1e-9)) return null;
      tmpVec.set((dir3[0] / dLen) * 10000, (dir3[1] / dLen) * 10000, (dir3[2] / dLen) * 10000).add(camera.position);
      tmpVec.project(camera);
      return {
        x: (tmpVec.x * 0.5 + 0.5) * W,
        y: (-tmpVec.y * 0.5 + 0.5) * H,
        inFront: tmpVec.z > -1 && tmpVec.z < 1,
        ndcX: tmpVec.x,
        ndcY: tmpVec.y
      };
    }

    function getStarVectorPairs(W, H, snap) {
      snap = snap || lastSnap;
      var posGal = snap && arr3(snap.posGal), fr = lastFrame;
      if (!posGal || !fr) return [];
      var destId = snap.courseDestId || snap.destId || snap.selectedDestId;
      var candidates = SYSTEMS.map(function (sys) {
        var delta = sub3(sys.xyz, posGal);
        return { sys:sys, delta:delta, distLy:norm3(delta), isTarget:sys.id === destId };
      }).filter(function (entry) {
        return entry.distLy > 1e-9;
      }).sort(function (a, b) {
        return Number(b.isTarget) - Number(a.isTarget) || a.distLy - b.distLy;
      });
      var cameraForward = camera.getWorldDirection(new T.Vector3());
      var pairs = candidates.slice(0, candidates[0]?.isTarget ? 15 : 14);
      return pairs.map(function (entry) {
        var dir = unit3(entry.delta);
        var rest = [dot3(dir, fr.f), dot3(dir, fr.y), dot3(dir, fr.z)];
        var app = observe(dir, fr).n;
        var r = projectDir(rest, W, H), a = projectDir(app, W, H);
        var restInFront = rest[0] * cameraForward.x + rest[1] * cameraForward.y + rest[2] * cameraForward.z > 1e-9;
        var appInFront = app[0] * cameraForward.x + app[1] * cameraForward.y + app[2] * cameraForward.z > 1e-9;
        var shiftPx = Math.hypot(a.x - r.x, a.y - r.y);
        return {id:entry.sys.id, name:entry.sys.name, distLy:entry.distLy, isTarget:entry.isTarget,
          restX:r.x, restY:r.y, restInFront:restInFront, appX:a.x, appY:a.y, appInFront:appInFront,
          shiftPx:Number.isFinite(shiftPx) ? shiftPx : null};
      });
    }

    // Project a scene point [x,y,z] (or vessel-local when space === 'vessel') to canvas pixels.
    var tmpProj = new T.Vector3();
    function projectPoint(p3, W, H, space) {
      var p = arr3(p3);
      if (!p) return null;
      W = W || canvasEl.clientWidth || 800;
      H = H || canvasEl.clientHeight || 450;
      tmpProj.set(p[0], p[1], p[2]);
      if (space === 'vessel' && vessel) {
        shipFrame.updateMatrixWorld(true);
        tmpProj.applyMatrix4(vessel.group.matrixWorld);
      }
      var behind = tmpProj.clone().applyMatrix4(camera.matrixWorldInverse).z >= 0;
      tmpProj.project(camera);
      return {
        x: (tmpProj.x * 0.5 + 0.5) * W,
        y: (-tmpProj.y * 0.5 + 0.5) * H,
        inFront: !behind && tmpProj.z > -1 && tmpProj.z < 1,
        ndcX: tmpProj.x,
        ndcY: tmpProj.y
      };
    }

    function getHudTargets() {
      var list = [];
      for (var i = 0; i < bodies.length; i++) {
        var b = bodies[i];
        if (!b.vis || !b.vis.n) continue;
        if (b.key === 'station' || b.key === 'npc' || b.key === 'npc2' || b.key === 'planet' || b.key === 'star') {
          var vPos = b.holder.position.clone().sub(camera.position);
          var vl = vPos.length();
          var dir = vl > 1e-4 ? [vPos.x / vl, vPos.y / vl, vPos.z / vl] : b.vis.n.slice();
          list.push({
            id: 'body:' + b.key,
            key: b.key,
            kind: b.kind,
            name: b.name,
            dir: dir,
            dKm: b.vis.dKm,
            angRad: b.vis.angRad,
            D: b.vis.delta || 1
          });
        }
      }
      return list;
    }

    // ------------------------------------------------------------------------------------------
    // Diagnostics
    // ------------------------------------------------------------------------------------------
    function getSceneInfo() {
      var list = bodies.map(function (b) {
        return {
          key: b.key, kind: b.kind, name: b.name, dKm: b.vis.dKm, renderDist: b.vis.D, renderRadius: b.vis.Rr,
          angRadiusDeg: b.vis.angRad / RAD, mode: b.vis.mode, physRadiusKm: b.physR,
          paletteId: b.paletteId || null,
          volAtmo: Boolean(b.volAtmo || b.dioramaPlanet),
          geoSegments: b.geoSegments || null,
          posKm: b.posKm ? b.posKm.slice() : null,
          dir: b.vis.n ? b.vis.n.slice() : null
        };
      });
      var inf = renderer.info;
      return {
        ok: true, view: lastView, systemId: st.sys ? st.sys.id : null, simTimeS: st.simTimeS,
        unitKm: 1 / UNITS_PER_KM, localMaxKm: LOCAL_MAX_KM, shellNear: LOCAL_MAX_UNITS, shellFar: SHELL_FAR,
        near: CAM_NEAR, far: CAM_FAR, skyRadius: SKY_R, shipLengthUnits: shipLengthUnits(), shipLengthKm: SHIP_KM,
        camera: {
          x: camera.position.x, y: camera.position.y, z: camera.position.z, fov: camera.fov,
          dist: camera.position.distanceTo(lastTargetVec),
          offsetX: viewOffset.ox, offsetY: viewOffset.oy,
          yaw: anim.camYaw != null ? anim.camYaw : cam.orbitYaw, pitch: anim.camPitch != null ? anim.camPitch : cam.orbitPitch,
          zoom: anim.camZoom != null ? anim.camZoom : cam.orbitZoom
        },
        defaults: { yaw: DEFAULT_YAW, pitch: DEFAULT_PITCH, zoom: DEFAULT_ZOOM },
        bodies: list, labelCount: anchors.length, orbitCurves: {
          current: curveCurrent.visible, transfer: curveTransfer.visible, target: curveTarget.visible,
          nodeGate: nodeGate.visible, nodeDistKm: anim.nodeDistKm
        },
        plumeOn: anim.plumeOn, thrustG: anim.thrustG,
        drawCalls: inf && inf.render ? inf.render.calls : 0, triangles: inf && inf.render ? inf.render.triangles : 0,
        corridorVessels: Object.keys(corridor).length, hasVessel: !!vessel,
        rcsJetsFiring: rcsDiag.firing, rcsJetCount: vessel && vessel.rcsJetCount ? vessel.rcsJetCount : 0,
        weaponBeamsActive: weaponFx.active, weaponMode: weaponFx.lastMode,
        enemyShotsActive: weaponFx.enemyActive, explosionsActive: explosionFx.active,
        playerDestroyed: Boolean(lastSnap && lastSnap.destroyed),
        weaponHardpointCount: vessel && vessel.weaponHardpoints ? {
          rail: vessel.weaponHardpoints.rail.length,
          fel: vessel.weaponHardpoints.fel.length,
          lance: vessel.weaponHardpoints.lance.length,
          missile: (vessel.weaponHardpoints.missile || []).length,
          pdc: (vessel.weaponHardpoints.pdc || []).length
        } : null,
        projectilesActive: projPoolActive,
        shuttlesActive: shuttleDiag.active,
        iceDepositCount: bodies.filter(function (b) { return b.kind === 'ice-deposit'; }).length,
        activeIceDepositId: activeIceDepositDiag.id,
        activeIceDepositDistKm: activeIceDepositDiag.distKm,
        harvestIcebergVisible: !!(activeIceDepositDiag.visible || rogueIceRig.group.visible),
        shuttlePortAnchors: vessel && vessel.shuttlePortAnchors ? vessel.shuttlePortAnchors.length : 0,
        dockWireVisible: false,
        ismSheath: {
          power: ismDiag.power,
          active: ismDiag.active,
          intensity: ismDiag.sheathIntensity,
          cherenkovFore: ismDiag.cherenkovFore,
          cherenkovAft: ismDiag.cherenkovAft
        },
        reducedMotion: lastReduced,
        graphics: { aa: gfx.aa, renderScale: gfx.renderScale, autoOrbit: gfx.autoOrbit }
      };
    }
    function getRelativitySnapshot() {
      var star = bodyByKey.star;
      var sample = [];
      var betaNow = anim.beta;
      [0.9, 0.0, -0.9].forEach(function (cr) {
        sample.push({ cosRest: cr, cosObs: aberrateCos(betaNow, cr), doppler: anim.gamma * (1 + betaNow * cr) });
      });
      return {
        beta: anim.beta, gamma: anim.gamma, invGamma: 1 / anim.gamma,
        headingGal: lastFrame ? lastFrame.f.slice() : [1, 0, 0],
        hostStar: star ? { dKm: star.vis.dKm, dopplerD: star.vis.delta, bearing: star.vis.n.slice(), renderDist: star.vis.D } : null,
        aberrationSamples: sample, boostAxis: lastFrame ? lastFrame.boost.slice() : [1, 0, 0],
        planetHolderQuat: bodyByKey.planet && bodyByKey.planet.holder ? bodyByKey.planet.holder.quaternion.toArray() : null,
        planetHolderScale: bodyByKey.planet && bodyByKey.planet.holder ? bodyByKey.planet.holder.scale.toArray() : null,
        corridorRel: Object.keys(corridor).map(function (id) {
          var c = corridor[id];
          return {
            id: id,
            scale: c.holder.scale.toArray(),
            holderQuat: c.holder.quaternion.toArray()
          };
        }),
        ahead: 'stars/bodies concentrate toward prograde as beta grows',
        chaseCamera: { yaw: anim.camYaw != null ? anim.camYaw : cam.orbitYaw, pitch: anim.camPitch != null ? anim.camPitch : cam.orbitPitch }, view: lastView
      };
    }
    function getSnowBounds() {
      return {
        active: snowInfo.active, count: snowInfo.count, min: snowInfo.min.slice(), max: snowInfo.max.slice(),
        flakeDir: snowInfo.windDir.slice(), plumeDir: snowInfo.plumeDir.slice(),
        accelDir: (snowInfo.accelDir || [1, 0, 0]).slice(),
        plumeDirSign: snowInfo.plumeDirSign != null ? snowInfo.plumeDirSign : -1,
        flipRad: snowInfo.flipRad != null ? snowInfo.flipRad : 0,
        againstPlumeFrac: snowInfo.againstPlumeFrac,
        shipLength: shipLengthUnits()
      };
    }

    function resetCamera() {
      cam.orbitYaw = DEFAULT_YAW; cam.orbitPitch = DEFAULT_PITCH; cam.orbitZoom = DEFAULT_ZOOM; cam.zoomTarget = null;
      cam.sxZoom = 1; cam.tacticalZoom = 1;
      anim.menuSway = 0; anim.menuHoldUntil = 0;
      anim.menuYaw = DEFAULT_YAW; anim.menuPitch = DEFAULT_PITCH; anim.menuZoom = DEFAULT_ZOOM;
    }

    function dispose() {
      clearSystem();
      Object.values(starPool).forEach(star => {
        star.model.geometry.dispose();
        star.halo.geometry.dispose();
        star.coreMat.dispose();
        star.haloMat.dispose();
      });
      for (var id in corridor) disposeCorridor(id);
      for (var cid in contactSprites) contactSprites[cid].material.dispose();
      contactSprites = {};
      if (vessel) { vessel.dispose(); vessel = null; }
      if (concourseRig) concourseRig.dispose();
      dockClampGeo.dispose(); dockClampLine.material.dispose();
      while (weaponFx.shots.length) releaseShot(weaponFx.shots.pop());
      weaponFx.beams.forEach(function (b) { b.mat.dispose(); });
      weaponFx.flashes.forEach(function (f) { f.mat.dispose(); });
      weaponFx.tracers.forEach(function (tr) { tr.mat.dispose(); });
      beamGeo.dispose(); tracerGeo.dispose(); projHeadGeo.dispose();
      projSlots.forEach(function (ps) { ps.lineGeo.dispose(); ps.lineMat.dispose(); ps.headMat.dispose(); ps.flareMat.dispose(); });
      explosionFx.slots.forEach(function (sl) {
        sl.fireMat.dispose(); sl.ringMat.dispose(); sl.flareMat.dispose();
        sl.shards.forEach(function (sh) { sh.mat.dispose(); });
      });
      expFireGeo.dispose(); expRingGeo.dispose(); expShardGeo.dispose();
      playerDamageSparks.forEach(function (ps) { ps.mat.dispose(); });
      playerWreckGroup.dispose();
      if (shuttleFleet) { shuttleFleet.dispose(); shuttleFleet = null; }
      scene.remove(rogueIceRig.group);
      rogueIceRig.dispose();
      [starGeo, dbGeo, dustGeo, ambGeo, ismSheathGeo].forEach(function (g) { g.dispose(); });
      [starMat, dbMat, dustMat, ambMat, mwMat, ismSheathMat].forEach(function (m) { m.dispose(); });
      [discTex, spikeTex, haloTex, ringTex].forEach(function (t) { t.dispose(); });
      [curveCurrent, curveTransfer, curveTarget, ribbonCurrent, ribbonTransfer, ribbonTarget].forEach(function (c) { c.geometry.dispose(); c.material.dispose(); });
      guideGeo.dispose(); guideMat.dispose();
      nodeOuterRing.geometry.dispose(); nodeOuterMat.dispose();
      nodeDiamondGeo.dispose(); nodeInnerMat.dispose();
      nodeArrowShaftGeo.dispose(); nodeArrowTipGeo.dispose(); nodeArrowMat.dispose();
      [mkPe, mkAp, mkNode, mkTransferPe].forEach(function (m) { m.material.dispose(); });
      if (postRT) { postRT.dispose(); postRT = null; }
      postGeo.dispose(); copyMat.dispose(); fxaaMat.dispose();
      renderer.dispose();
    }

    // ---- initial content ----
    if (vesselGenome) rebuildPlayerShip(vesselGenome, hideIceFlag);
    if (initialState.sys) rebuildSystem(initialState.sys, initialState.simTimeS, !!initialState.dioramaOnly);
    resize(canvasEl.clientWidth, canvasEl.clientHeight, 0);

    var ctrl = {
      camera: camera,
      renderer: renderer,
      scene: scene,
      cam: cam,
      defaults: { yaw: DEFAULT_YAW, pitch: DEFAULT_PITCH, zoom: DEFAULT_ZOOM },
      constants: { unitKm: 1 / UNITS_PER_KM, localMaxKm: LOCAL_MAX_KM, shellNear: LOCAL_MAX_UNITS, shellFar: SHELL_FAR, skyRadius: SKY_R },
      get vessel() { return vessel; },
      rebuildPlayerShip: rebuildPlayerShip,
      rebuildSystem: rebuildSystem,
      get flybyOnly() { return !!st.flybyOnly; },
      update: update,
      resize: resize,
      resetCamera: resetCamera,
      commitMenuSway: commitMenuSway,
      pauseMenuOrbit: pauseMenuOrbit,
      setGraphics: setGraphics,
      getGraphics: function () { return Object.assign({}, gfx); },
      projectLabels: projectLabels,
      projectDir: projectDir,
      projectPoint: projectPoint,
      getStarVectorPairs: getStarVectorPairs,
      getShuttleInfo: function () { return shuttleFleet ? shuttleFleet.info() : []; },
      getHudTargets: getHudTargets,
      findSextantLock: findSextantLock,
      starObsDir: starObsDir,
      starIndexOf: function (sysId) { for (var i = 0; i < N_SYS; i++) if (SYSTEMS[i].id === sysId) return i; return -1; },
      shellDistance: shellDistance,
      setIceIntegrity: function (f) { if (vessel && vessel.setIceIntegrity) { vessel.setIceIntegrity(f); lastIceFrac = f; } },
      setThrust: function (g, boost) { if (vessel) vessel.setPlumeIntensity(Math.abs(g) > 0.02 ? clamp(0.48 + 0.45 * Math.abs(g), 0.48, 1.45) : 0.08, boost || 0); },
      getSceneInfo: getSceneInfo,
      getRelativitySnapshot: getRelativitySnapshot,
      getSnowBounds: getSnowBounds,
      dispose: dispose
    };
    return ctrl;
  }

  root.LighthuggerScene = {
    create: create,
    constants: {
      UNITS_PER_KM: UNITS_PER_KM, LOCAL_MAX_KM: LOCAL_MAX_KM, SHELL_FAR: SHELL_FAR, SKY_R: SKY_R,
      DEFAULT_YAW: DEFAULT_YAW, DEFAULT_PITCH: DEFAULT_PITCH, DEFAULT_ZOOM: DEFAULT_ZOOM
    },
    shellDistance: shellDistance,
    aberrateCos: aberrateCos,
    dopplerTint: dopplerTint,
    relBeamGain: relBeamGain
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
