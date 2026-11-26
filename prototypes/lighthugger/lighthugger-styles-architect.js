/**
 * LighthuggerStylesArchitect - Blended 3D architectural hull style kits
 * for window.LighthuggerStyleKits:
 *   1. gothic (P.styleGothic 0..1) - Gothic Futurism: cathedral / voidship (flying buttresses,
 *      spires, amber lancet + rose windows, brass trim on slate-iron)
 *   2. sleek  (P.styleSleek  0..1) - Sleek Futurism: Nighthawk / B-2 stealth (matte RAM hull,
 *      angular chines, faceted shroud fairings, flying-wing blades, buried exhaust baffles)
 *   3. coade  (P.styleCoade  0..1) - Children of a Dead Earth: pale paneled modules, gold stage
 *      collars, quilted MLI drums, radomes, MLI-barrel turrets, X-braced truss bays, and cross-plus
 *      glowing radiator wings (clean stern cone with no back-cone rocket nozzles)
 *
 * Pure ASCII, plain ES5, static cached procedural CanvasTextures (one set per Three instance),
 * and per-build material tracking via ctx.trackMat(mat).
 */
(function (root) {
  'use strict';

  var STYLE_KEYS = ['styleGnostic', 'styleGothic', 'styleSleek', 'styleGiger', 'styleCoade', 'styleDune', 'styleCathedral'];

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function sstep(a, b, x) {
    var t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function fallbackMulberry32(seed) {
    var a = seed | 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeRng(ctx, salt) {
    var mul = (ctx && ctx.G && typeof ctx.G.mulberry32 === 'function') ? ctx.G.mulberry32 : fallbackMulberry32;
    var base = 0x51a7b39d;
    if (ctx && typeof ctx.rng === 'function') base = Math.floor(ctx.rng() * 2147483647) | 0;
    return mul((base ^ salt) | 0);
  }

  // Weight, normalized share, blend factor k and texture-ownership flag for one kit.
  function kitState(ctx, id, key) {
    var P = (ctx && ctx.P) || {};
    var w = clamp(Number(P[key]) || 0, 0, 1);
    if (w <= 0.02) return { w: 0, share: 0, k: 0, own: false };
    var share = (ctx.styleShares && ctx.styleShares[id] != null) ? Number(ctx.styleShares[id]) : 1;
    if (!(share > 0)) share = 1;
    var maxOther = 0;
    for (var i = 0; i < STYLE_KEYS.length; i++) {
      if (STYLE_KEYS[i] === key) continue;
      var wo = clamp(Number(P[STYLE_KEYS[i]]) || 0, 0, 1);
      if (wo > maxOther) maxOther = wo;
    }
    return {
      w: w,
      share: share,
      k: clamp(w * (0.40 + 0.60 * share), 0, 1),
      own: w >= 0.25 && w >= maxOther - 0.04
    };
  }

  function tracker(ctx) {
    return typeof ctx.trackMat === 'function' ? ctx.trackMat : function (m) { return m; };
  }

  function mixColor(T, col, hex, a) {
    if (col && a > 0) col.lerp(new T.Color(hex), clamp(a, 0, 1));
  }

  function mixNum(mat, key, val, a) {
    if (mat && typeof mat[key] === 'number') mat[key] = lerp(mat[key], val, clamp(a, 0, 1));
  }

  // ---------------------------------------------------------------------------
  // Static procedural CanvasTextures (cached once per Three instance)
  // ---------------------------------------------------------------------------
  var TEX = { T: null, sets: {} };

  function makeCanvas(w, h) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    var g = c.getContext && c.getContext('2d');
    if (!g) return null;
    return { canvas: c, g: g };
  }

  function finishTex(T, cv, srgb, rx, ry) {
    var t = new T.CanvasTexture(cv.canvas);
    t.wrapS = T.RepeatWrapping;
    t.wrapT = T.RepeatWrapping;
    if (rx && ry) t.repeat.set(rx, ry);
    if (srgb && T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  }

  function getTex(T, name, builder) {
    if (TEX.T !== T) {
      TEX.T = T;
      TEX.sets = {};
    }
    if (TEX.sets[name] === undefined) {
      var made = null;
      try {
        made = builder(T);
      } catch (err) {
        made = null;
      }
      TEX.sets[name] = made;
    }
    return TEX.sets[name];
  }

  function rgb(r, g, b) {
    return 'rgb(' + Math.round(clamp(r, 0, 255)) + ',' + Math.round(clamp(g, 0, 255)) + ',' + Math.round(clamp(b, 0, 255)) + ')';
  }

  // Pointed (lancet) arch path inside box x,y,w,h; apex at the top.
  function archPath(g, x, y, w, h) {
    var sp = y + h * 0.38;
    var mx = x + w * 0.5;
    g.beginPath();
    g.moveTo(x, y + h);
    g.lineTo(x, sp);
    g.quadraticCurveTo(x, y + h * 0.14, mx, y);
    g.quadraticCurveTo(x + w, y + h * 0.14, x + w, sp);
    g.lineTo(x + w, y + h);
    g.closePath();
  }

  // Gaudi Sagrada Familia stained-glass palette (amber-gold, saffron, rose-crimson, sunlit emerald)
  var GLASS = ['#ffbe48', '#ff962e', '#ffd978', '#ff6b4a', '#7ce078', '#ffad36'];

  function paintGlass(g, x, y, w, h, r) {
    var tw = 8, th = 10;
    for (var ty = y; ty < y + h; ty += th) {
      for (var tx = x; tx < x + w; tx += tw) {
        g.fillStyle = GLASS[Math.floor(r() * GLASS.length)];
        g.fillRect(tx, ty, tw - 1, th - 1);
      }
    }
    var gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, 'rgba(255,240,200,0.35)');
    gr.addColorStop(1, 'rgba(120,40,10,0.30)');
    g.fillStyle = gr;
    g.fillRect(x, y, w, h);
  }

  function createGothicTextures(T) {
    // Monumental Cathedral Voidship (Gothic x Sagrada Familia carved dark-travertine & weathered slate-limestone):
    // 1) albedo/bump/glow: deeply recessed carved gothic buttress arcades, stone tracery, and pinpoint amber nave lights
    // 2) stoneHull/stoneBump: monolithic carved gothic-travertine ashlar & fluted masonry for nacelles & pylons
    var W = 1024, H = 1024, CW = 48, CH = 96;
    var alb = makeCanvas(W, H), bmp = makeCanvas(W, H), glw = makeCanvas(W, H);
    var shA = makeCanvas(512, 512), shB = makeCanvas(512, 512);
    var rose = makeCanvas(256, 256), lan = makeCanvas(64, 128);
    if (!alb || !bmp || !glw || !shA || !shB || !rose || !lan) return null;
    var ga = alb.g, gb = bmp.g, ge = glw.g;
    var gsa = shA.g, gsb = shB.g;
    var r = fallbackMulberry32(40404);

    // Clean carved weathered slate-limestone ashlar for nacelles, pylons, and buttress flanks
    gsa.fillStyle = '#6d6965';
    gsa.fillRect(0, 0, 512, 512);
    gsb.fillStyle = '#848484';
    gsb.fillRect(0, 0, 512, 512);
    var i, row, col;
    for (row = 0; row < 16; row++) {
      var ry = row * 32;
      gsa.fillStyle = row % 4 === 0 ? '#847f79' : '#6b6763';
      gsa.fillRect(0, ry, 512, 30);
      gsa.fillStyle = '#2d2a28';
      gsa.fillRect(0, ry + 30, 512, 2);
      gsb.fillStyle = row % 4 === 0 ? '#c8c8c8' : '#949494';
      gsb.fillRect(0, ry, 512, 30);
      gsb.fillStyle = '#202020';
      gsb.fillRect(0, ry + 30, 512, 2);
      var off = (row % 2) * 32;
      for (col = 0; col < 8; col++) {
        var rx = (col * 64 + off) % 512;
        var tint = (r() - 0.5) * 16;
        gsa.fillStyle = rgb(112 + tint, 108 + tint, 103 + tint);
        gsa.fillRect(rx + 2, ry + 2, 60, 26);
        gsa.fillStyle = '#332f2c';
        gsa.fillRect(rx, ry, 2, 30);
        gsb.fillStyle = '#2c2c2c';
        gsb.fillRect(rx, ry, 2, 30);
      }
    }
    for (row = 0; row < 4; row++) {
      var by = row * 128;
      gsa.fillStyle = '#9c968e';
      gsa.fillRect(0, by, 512, 5);
      gsa.fillStyle = '#221f1e';
      gsa.fillRect(0, by + 5, 512, 3);
      gsb.fillStyle = '#f0f0f0';
      gsb.fillRect(0, by, 512, 5);
      gsb.fillStyle = '#141414';
      gsb.fillRect(0, by + 5, 512, 3);
    }
    for (i = 0; i < 4500; i++) {
      var sx0 = r() * 512, sy0 = r() * 512;
      gsa.fillStyle = r() < 0.5 ? 'rgba(220,215,205,0.06)' : 'rgba(18,16,15,0.10)';
      gsa.fillRect(sx0, sy0, 2 + r() * 3, 1 + r() * 2);
    }

    // Deep cathedral slate-travertine base for gothic nave arcades
    ga.fillStyle = '#4e4a47';
    ga.fillRect(0, 0, W, H);
    gb.fillStyle = '#808080';
    gb.fillRect(0, 0, W, H);
    ge.fillStyle = '#000000';
    ge.fillRect(0, 0, W, H);

    for (i = 0; i < 8500; i++) {
      var nx = r() * W, ny = r() * H;
      var light = r() < 0.5;
      ga.fillStyle = light
        ? 'rgba(205,198,188,' + (0.04 + r() * 0.07).toFixed(3) + ')'
        : 'rgba(16,14,14,' + (0.06 + r() * 0.10).toFixed(3) + ')';
      ga.fillRect(nx, ny, 2 + r() * 4, 1 + r() * 3);
    }

    // Horizontal stone cornice courses, deeply recessed gothic lancet bays, and warm pinpoint nave lights
    var cols = Math.floor(W / CW), rows = Math.floor(H / CH);
    for (var cj = 0; cj < rows; cj++) {
      ga.fillStyle = '#868078';
      ga.fillRect(0, cj * CH, W, 6);
      ga.fillStyle = '#1b1918';
      ga.fillRect(0, cj * CH + 6, W, 4);
      gb.fillStyle = '#f0f0f0';
      gb.fillRect(0, cj * CH, W, 6);
      gb.fillStyle = '#141414';
      gb.fillRect(0, cj * CH + 6, W, 4);

      for (var ci = 0; ci < cols; ci++) {
        var x0 = ci * CW, y0 = cj * CH;
        // Fluted cathedral stone pier
        ga.fillStyle = '#746f68';
        ga.fillRect(x0, y0, 8, CH);
        ga.fillStyle = '#9b958c';
        ga.fillRect(x0 + 2, y0, 2, CH);
        ga.fillStyle = '#252220';
        ga.fillRect(x0 + 7, y0, 2, CH);
        gb.fillStyle = '#e0e0e0';
        gb.fillRect(x0, y0, 8, CH);

        for (var sub = 0; sub < 2; sub++) {
          var ax = x0 + 10 + sub * 18, ay = y0 + 13, aw = 14, ah = CH - 20;
          archPath(ga, ax, ay, aw, ah);
          ga.fillStyle = '#121010';
          ga.fill();
          ga.strokeStyle = '#8b857d';
          ga.lineWidth = 1.4;
          ga.stroke();
          archPath(gb, ax, ay, aw, ah);
          gb.fillStyle = '#101010';
          gb.fill();
          gb.strokeStyle = '#ececec';
          gb.lineWidth = 1.4;
          gb.stroke();

          var nSlats = 5;
          for (var sl = 0; sl < nSlats; sl++) {
            var sy = ay + 12 + sl * ((ah - 14) / nSlats);
            ga.fillStyle = '#524e4a';
            ga.fillRect(ax + 1, sy, aw - 2, 2.2);
            gb.fillStyle = '#bcbcbc';
            gb.fillRect(ax + 1, sy, aw - 2, 2.2);
            if (r() < 0.58) {
              var gCol = GLASS[Math.floor(r() * GLASS.length)];
              ge.fillStyle = gCol;
              ge.fillRect(ax + 4, sy + 3.0, aw - 8, 2.4);
              ga.fillStyle = 'rgba(255,204,102,0.28)';
              ga.fillRect(ax + 4, sy + 3.0, aw - 8, 2.4);
            }
          }
        }
      }
    }
    for (i = 0; i < 80; i++) {
      var sx2 = r() * W, sh2 = 50 + r() * 200, sw2 = 2 + r() * 9;
      var sg = ga.createLinearGradient(0, 0, 0, sh2);
      sg.addColorStop(0, 'rgba(14,12,12,0.0)');
      sg.addColorStop(0.4, 'rgba(14,12,12,0.28)');
      sg.addColorStop(1, 'rgba(14,12,12,0.0)');
      ga.save();
      ga.translate(sx2, r() * (H - sh2));
      ga.fillStyle = sg;
      ga.fillRect(0, 0, sw2, sh2);
      ga.restore();
    }

    // Rose window (radial stained glass petals)
    var gr = rose.g;
    gr.fillStyle = '#000000';
    gr.fillRect(0, 0, 256, 256);
    var cx = 128, cy = 128, petals = 12;
    for (var p = 0; p < petals; p++) {
      var a0 = (p / petals) * Math.PI * 2, a1 = ((p + 1) / petals) * Math.PI * 2;
      gr.fillStyle = GLASS[p % GLASS.length];
      gr.beginPath();
      gr.moveTo(cx, cy);
      gr.arc(cx, cy, 120, a0, a1);
      gr.closePath();
      gr.fill();
      gr.fillStyle = GLASS[(p * 3 + 2) % GLASS.length];
      gr.beginPath();
      gr.arc(cx + Math.cos((a0 + a1) * 0.5) * 82, cy + Math.sin((a0 + a1) * 0.5) * 82, 22, 0, Math.PI * 2);
      gr.fill();
    }
    gr.strokeStyle = '#140802';
    gr.lineWidth = 3.5;
    for (p = 0; p < petals; p++) {
      var aa = (p / petals) * Math.PI * 2;
      gr.beginPath();
      gr.moveTo(cx, cy);
      gr.lineTo(cx + Math.cos(aa) * 122, cy + Math.sin(aa) * 122);
      gr.stroke();
    }
    gr.lineWidth = 4;
    [34, 62, 100, 120].forEach(function (rad) {
      gr.beginPath();
      gr.arc(cx, cy, rad, 0, Math.PI * 2);
      gr.stroke();
    });
    gr.fillStyle = '#fff2c4';
    gr.beginPath();
    gr.arc(cx, cy, 18, 0, Math.PI * 2);
    gr.fill();

    // Fine lancet window glass
    var gl = lan.g;
    gl.fillStyle = '#000000';
    gl.fillRect(0, 0, 64, 128);
    paintGlass(gl, 0, 0, 64, 128, r);
    gl.fillStyle = '#180c04';
    gl.fillRect(29, 0, 6, 128);
    gl.fillRect(0, 42, 64, 4);
    gl.fillRect(0, 82, 64, 4);

    return {
      albedo: finishTex(T, alb, true, 4, 3),
      bump: finishTex(T, bmp, false, 4, 3),
      glow: finishTex(T, glw, true, 4, 3),
      stoneHull: finishTex(T, shA, true, 2, 2),
      stoneBump: finishTex(T, shB, false, 2, 2),
      rose: finishTex(T, rose, true),
      lancet: finishTex(T, lan, true)
    };
  }

  function createSleekTextures(T) {
    var W = 512, H = 512;
    var alb = makeCanvas(W, H), bmp = makeCanvas(W, H);
    if (!alb || !bmp) return null;
    var ga = alb.g, gb = bmp.g;
    var r = fallbackMulberry32(51177);

    ga.fillStyle = '#141722';
    ga.fillRect(0, 0, W, H);
    gb.fillStyle = '#808080';
    gb.fillRect(0, 0, W, H);

    // Faceted RAM tile mosaic: alternating-diagonal triangles with a whisper of tonal variance
    var cw = 64, ch = 64, i, j;
    for (j = 0; j < H / ch; j++) {
      for (i = 0; i < W / cw; i++) {
        var x0 = i * cw, y0 = j * ch;
        var flip = (i + j) % 2 === 0;
        var d1 = (r() - 0.35) * 9, d2 = (r() - 0.35) * 9;
        ga.fillStyle = rgb(20 + d1, 23 + d1, 34 + d1);
        ga.beginPath();
        if (flip) { ga.moveTo(x0, y0); ga.lineTo(x0 + cw, y0); ga.lineTo(x0, y0 + ch); }
        else { ga.moveTo(x0, y0); ga.lineTo(x0 + cw, y0); ga.lineTo(x0 + cw, y0 + ch); }
        ga.closePath();
        ga.fill();
        ga.fillStyle = rgb(20 + d2, 23 + d2, 34 + d2);
        ga.beginPath();
        if (flip) { ga.moveTo(x0 + cw, y0); ga.lineTo(x0 + cw, y0 + ch); ga.lineTo(x0, y0 + ch); }
        else { ga.moveTo(x0, y0); ga.lineTo(x0, y0 + ch); ga.lineTo(x0 + cw, y0 + ch); }
        ga.closePath();
        ga.fill();
      }
    }
    // Sawtooth panel seams (horizontal) + straight joints (vertical)
    ga.lineWidth = 1.5;
    gb.lineWidth = 2;
    for (j = 0; j < H / ch; j++) {
      var yy = j * ch;
      ga.strokeStyle = '#272d40';
      gb.strokeStyle = '#2c2c2c';
      ga.beginPath();
      gb.beginPath();
      for (var x = 0; x <= W; x += 16) {
        var up = (x / 16) % 2 === 0;
        ga.lineTo(x, yy + (up ? 0 : 5));
        gb.lineTo(x, yy + (up ? 0 : 5));
      }
      ga.stroke();
      gb.stroke();
      gb.strokeStyle = '#a8a8a8';
      gb.lineWidth = 1;
      gb.beginPath();
      for (x = 0; x <= W; x += 16) {
        gb.lineTo(x, yy + 3 + (((x / 16) % 2 === 0) ? 0 : 5));
      }
      gb.stroke();
      gb.lineWidth = 2;
    }
    for (i = 0; i < W / 128; i++) {
      ga.strokeStyle = '#222838';
      gb.strokeStyle = '#303030';
      ga.beginPath();
      ga.moveTo(i * 128, 0);
      ga.lineTo(i * 128, H);
      ga.stroke();
      gb.beginPath();
      gb.moveTo(i * 128, 0);
      gb.lineTo(i * 128, H);
      gb.stroke();
    }
    for (i = 0; i < 1800; i++) {
      ga.fillStyle = 'rgba(' + (r() < 0.5 ? '255,255,255' : '0,0,0') + ',' + (0.025 + r() * 0.03).toFixed(3) + ')';
      ga.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2);
    }
    return {
      albedo: finishTex(T, alb, true),
      bump: finishTex(T, bmp, false)
    };
  }

  // CoaDE: panel albedo/bump, quilted MLI albedo/bump and hot radiator emissive.
  function createCoadeTextures(T) {
    var W = 512, H = 512;
    var alb = makeCanvas(W, H), bmp = makeCanvas(W, H);
    var mlA = makeCanvas(W, H), mlB = makeCanvas(W, H);
    var rad = makeCanvas(128, 256);
    if (!alb || !bmp || !mlA || !mlB || !rad) return null;
    var ga = alb.g, gb = bmp.g;
    var r = fallbackMulberry32(90210);
    var i, j;

    ga.fillStyle = '#cfd5db';
    ga.fillRect(0, 0, W, H);
    gb.fillStyle = '#8c8c8c';
    gb.fillRect(0, 0, W, H);

    // Riveted rectangular hull panels in irregular rows
    var y = 0;
    var rowH = [72, 56, 88, 64, 80, 72, 80];
    for (j = 0; j < rowH.length && y < H; j++) {
      var h = rowH[j], x = 0;
      var colW = [96, 64, 128, 80, 64, 80];
      var ci = j % colW.length;
      while (x < W) {
        var pw = Math.min(colW[ci % colW.length], W - x);
        ci++;
        var tone = (r() - 0.55) * 14;
        ga.fillStyle = rgb(207 + tone, 213 + tone, 219 + tone);
        ga.fillRect(x, y, pw, h);
        ga.strokeStyle = '#8b9299';
        ga.lineWidth = 1.5;
        ga.strokeRect(x + 0.5, y + 0.5, pw - 1, h - 1);
        gb.strokeStyle = '#4a4a4a';
        gb.lineWidth = 2;
        gb.strokeRect(x + 1, y + 1, pw - 2, h - 2);
        ga.fillStyle = '#98a0a8';
        gb.fillStyle = '#d8d8d8';
        for (var rx = x + 6; rx < x + pw - 4; rx += 12) {
          ga.fillRect(rx, y + 4, 2, 2);
          ga.fillRect(rx, y + h - 6, 2, 2);
          gb.fillRect(rx, y + 4, 2, 2);
          gb.fillRect(rx, y + h - 6, 2, 2);
        }
        x += pw;
      }
      y += h;
    }

    // Dark recessed inspection hatches with a lighter frame
    for (i = 0; i < 7; i++) {
      var hx = 20 + Math.floor(r() * (W - 100)), hy = 20 + Math.floor(r() * (H - 70));
      var hw = 34 + Math.floor(r() * 30), hh = 22 + Math.floor(r() * 18);
      ga.fillStyle = '#b8bec5';
      ga.fillRect(hx - 3, hy - 3, hw + 6, hh + 6);
      ga.fillStyle = '#3a3f46';
      ga.fillRect(hx, hy, hw, hh);
      ga.fillStyle = '#5a6068';
      ga.fillRect(hx + 3, hy + hh * 0.5 - 1, hw - 6, 2);
      gb.fillStyle = '#505050';
      gb.fillRect(hx, hy, hw, hh);
    }
    // Orange / yellow stencil stripes
    for (i = 0; i < 5; i++) {
      var sx = Math.floor(r() * (W - 80)), sy = Math.floor(r() * (H - 20));
      var hazard = i % 2 === 0;
      for (var k = 0; k < 6; k++) {
        ga.fillStyle = (hazard && k % 2 === 1) ? '#1c1c1e' : (hazard ? '#e0a21c' : '#d96b27');
        if (hazard) {
          ga.beginPath();
          ga.moveTo(sx + k * 10, sy + 12);
          ga.lineTo(sx + k * 10 + 10, sy);
          ga.lineTo(sx + k * 10 + 16, sy);
          ga.lineTo(sx + k * 10 + 6, sy + 12);
          ga.closePath();
          ga.fill();
        } else if (k < 2) {
          ga.fillRect(sx, sy + k * 6, 50, 3);
        }
      }
    }
    // Vertical ladder / handrail decals
    for (i = 0; i < 3; i++) {
      var lx = 30 + Math.floor(r() * (W - 70)), ly = 10 + Math.floor(r() * (H - 150));
      ga.strokeStyle = '#59606a';
      ga.lineWidth = 2;
      ga.beginPath();
      ga.moveTo(lx, ly);
      ga.lineTo(lx, ly + 120);
      ga.moveTo(lx + 14, ly);
      ga.lineTo(lx + 14, ly + 120);
      ga.stroke();
      ga.lineWidth = 1.5;
      for (var rg = 6; rg < 120; rg += 12) {
        ga.beginPath();
        ga.moveTo(lx, ly + rg);
        ga.lineTo(lx + 14, ly + rg);
        ga.stroke();
      }
      gb.fillStyle = '#c0c0c0';
      gb.fillRect(lx - 1, ly, 3, 120);
      gb.fillRect(lx + 13, ly, 3, 120);
    }
    // Exhaust grime streaks
    for (i = 0; i < 42; i++) {
      var gx = r() * W, gh = 60 + r() * 200, gw = 4 + r() * 14;
      var gy = r() * (H - gh);
      var gg = ga.createLinearGradient(0, gy, 0, gy + gh);
      var ga0 = 0.05 + r() * 0.12;
      gg.addColorStop(0, 'rgba(60,54,48,0)');
      gg.addColorStop(0.25, 'rgba(60,54,48,' + ga0.toFixed(3) + ')');
      gg.addColorStop(1, 'rgba(60,54,48,0)');
      ga.fillStyle = gg;
      ga.fillRect(gx, gy, gw, gh);
    }

    // Quilted / crinkled MLI foil
    var ma = mlA.g, mb = mlB.g;
    ma.fillStyle = '#e6e9ec';
    ma.fillRect(0, 0, W, H);
    mb.fillStyle = '#808080';
    mb.fillRect(0, 0, W, H);
    var cell = 32;
    for (j = 0; j < H / cell; j++) {
      for (i = 0; i < W / cell; i++) {
        var cx = i * cell + cell * 0.5, cy = j * cell + cell * 0.5;
        var gq = mb.createRadialGradient(cx, cy, 1, cx, cy, cell * 0.72);
        gq.addColorStop(0, 'rgb(205,205,205)');
        gq.addColorStop(1, 'rgb(70,70,70)');
        mb.save();
        mb.beginPath();
        mb.moveTo(cx, cy - cell * 0.5);
        mb.lineTo(cx + cell * 0.5, cy);
        mb.lineTo(cx, cy + cell * 0.5);
        mb.lineTo(cx - cell * 0.5, cy);
        mb.closePath();
        mb.clip();
        mb.fillStyle = gq;
        mb.fillRect(cx - cell, cy - cell, cell * 2, cell * 2);
        mb.restore();
        var sg = ma.createRadialGradient(cx - 4, cy - 4, 1, cx, cy, cell * 0.7);
        sg.addColorStop(0, 'rgba(255,255,255,0.55)');
        sg.addColorStop(1, 'rgba(120,128,140,0.30)');
        ma.save();
        ma.beginPath();
        ma.moveTo(cx, cy - cell * 0.5);
        ma.lineTo(cx + cell * 0.5, cy);
        ma.lineTo(cx, cy + cell * 0.5);
        ma.lineTo(cx - cell * 0.5, cy);
        ma.closePath();
        ma.clip();
        ma.fillStyle = sg;
        ma.fillRect(cx - cell, cy - cell, cell * 2, cell * 2);
        ma.restore();
      }
    }
    for (i = 0; i < 380; i++) {
      var qx = r() * W, qy = r() * H, ql = 6 + r() * 18, qa = r() * Math.PI;
      var light = r() < 0.5;
      mb.strokeStyle = light ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.26)';
      mb.lineWidth = 1;
      mb.beginPath();
      mb.moveTo(qx, qy);
      mb.lineTo(qx + Math.cos(qa) * ql, qy + Math.sin(qa) * ql);
      mb.stroke();
      ma.strokeStyle = light ? 'rgba(255,255,255,0.30)' : 'rgba(90,96,108,0.20)';
      ma.lineWidth = 1;
      ma.beginPath();
      ma.moveTo(qx, qy);
      ma.lineTo(qx + Math.cos(qa) * ql, qy + Math.sin(qa) * ql);
      ma.stroke();
    }

    // Radiator emissive: slatted grid, hottest at the root (canvas bottom = v 0), cooler to the tip
    var gr = rad.g;
    gr.fillStyle = '#120403';
    gr.fillRect(0, 0, 128, 256);
    var slat = 8;
    for (var sy2 = 0; sy2 < 256; sy2 += slat) {
      var hot = 1 - (sy2 + slat * 0.5) / 256;
      var hh2 = Math.pow(hot, 0.85);
      var cr = lerp(0x4a, 0xff, hh2), cg = lerp(0x0d, 0x4b, hh2), cb = lerp(0x05, 0x18, hh2);
      var sgr = gr.createLinearGradient(0, sy2, 0, sy2 + slat);
      sgr.addColorStop(0, rgb(cr * 1.0, cg * 1.0, cb * 1.0));
      sgr.addColorStop(0.55, rgb(cr * 0.62, cg * 0.55, cb * 0.5));
      sgr.addColorStop(1, rgb(cr * 0.18, cg * 0.14, cb * 0.12));
      gr.fillStyle = sgr;
      gr.fillRect(0, sy2, 128, slat - 1);
      gr.fillStyle = rgb(cr, cg + 24 * hh2, cb + 12 * hh2);
      gr.fillRect(0, sy2, 128, 1);
    }
    gr.fillStyle = 'rgba(8,2,2,0.75)';
    for (var vx = 0; vx <= 128; vx += 64) gr.fillRect(vx - 1, 0, 2, 256);

    return {
      panelAlbedo: finishTex(T, alb, true),
      panelBump: finishTex(T, bmp, false),
      mliAlbedo: finishTex(T, mlA, true),
      mliBump: finishTex(T, mlB, false),
      radiator: finishTex(T, rad, true)
    };
  }

  // ---------------------------------------------------------------------------
  // Hull-conforming geometry helpers (shared by all three kits)
  // ---------------------------------------------------------------------------
  function makeUnits(T) {
    var cone4 = new T.ConeGeometry(1, 1, 4);
    cone4.rotateY(Math.PI / 4);
    return {
      box: new T.BoxGeometry(1, 1, 1),
      cyl: new T.CylinderGeometry(1, 1, 1, 14),
      cyl8: new T.CylinderGeometry(1, 1, 1, 8),
      cone8: new T.ConeGeometry(1, 1, 8),
      cone4: cone4,
      sphere: new T.SphereGeometry(1, 14, 10)
    };
  }

  function safeCommit(ctx, geo, mat, list, parent) {
    if (!list || !list.length) {
      geo.dispose();
      return null;
    }
    var im = ctx.commitInstances(geo, mat, list, parent);
    if (im) im.frustumCulled = false;
    return im;
  }

  function bareEnd(ctx, isFore, phi) {
    var fn = isFore ? ctx.evalForeBareEnd : ctx.evalAftBareEnd;
    var fb = isFore ? 0.90 : 0.86;
    if (typeof fn !== 'function') return fb;
    var v = fn(phi);
    return isFinite(v) ? v : fb;
  }

  function bareMin(ctx, isFore) {
    var m = 1;
    for (var i = 0; i < 8; i++) m = Math.min(m, bareEnd(ctx, isFore, i * Math.PI / 4));
    return m;
  }

  function clearPhi(ctx, pref, p, isFore, pad) {
    var k = ctx.keepout;
    if (isFore || !k || typeof k.isBlocked !== 'function') return pref;
    var ph = k.isBlocked(pref, p, pad) ? k.pickClearPhi(pref, p, pad) : pref;
    return k.isBlocked(ph, p, pad * 0.6) ? null : ph;
  }

  function surfXYZ(ctx, isFore, p, phi, lift) {
    var pt = isFore ? ctx.evalForePoint(p, phi, 1.0) : ctx.evalAftSurf(p, phi, 1.0);
    return new ctx.T.Vector3(pt.x, pt.y + lift * Math.cos(phi), pt.z + lift * Math.sin(phi));
  }

  function hullRadii(ctx, isFore, p) {
    var a = isFore ? ctx.evalForePoint(p, 0, 1.0) : ctx.evalAftSurf(p, 0, 1.0);
    var b = isFore ? ctx.evalForePoint(p, Math.PI * 0.5, 1.0) : ctx.evalAftSurf(p, Math.PI * 0.5, 1.0);
    return { x: a.x, ry: Math.max(0.02, Math.abs(a.y)), rz: Math.max(0.02, Math.abs(b.z)) };
  }

  // Elliptical ring that hugs the hull section at param p (absolute lift in world units).
  function addRing(ctx, parent, isFore, p, tube, mat, lift) {
    var T = ctx.T;
    var r = hullRadii(ctx, isFore, p);
    var ry = r.ry + lift, rz = r.rz + lift;
    var avg = 0.5 * (ry + rz);
    var m = new T.Mesh(new T.TorusGeometry(1, tube / Math.max(0.2, avg), 8, 56), mat);
    m.scale.set(rz, ry, avg);
    m.rotation.y = Math.PI * 0.5;
    m.position.x = r.x;
    parent.add(m);
    return m;
  }

  // Grid patch on the hull between params p0..p1 and angles phi0..phi1.
  // liftFn(a, b, rad, p, phi) -> absolute outward lift. Winding is auto-oriented outward.
  function buildPatch(ctx, isFore, p0, p1, phi0, phi1, nU, nV, liftFn, uvRep) {
    var T = ctx.T;
    var rows = nU + 1, cols = nV + 1;
    var pos = new Float32Array(rows * cols * 3);
    var uv = new Float32Array(rows * cols * 2);
    var rep = uvRep || [1, 1];
    var k = 0, q = 0, i, j;
    for (i = 0; i < rows; i++) {
      var a = i / nU;
      var p = lerp(p0, p1, a);
      for (j = 0; j < cols; j++) {
        var b = j / nV;
        var phi = lerp(phi0, phi1, b);
        var pt = isFore ? ctx.evalForePoint(p, phi, 1.0) : ctx.evalAftSurf(p, phi, 1.0);
        var rad = Math.sqrt(pt.y * pt.y + pt.z * pt.z);
        var L = liftFn(a, b, rad, p, phi);
        pos[k++] = pt.x;
        pos[k++] = pt.y + L * Math.cos(phi);
        pos[k++] = pt.z + L * Math.sin(phi);
        uv[q++] = a * rep[0];
        uv[q++] = b * rep[1];
      }
    }
    // Probe the middle cell to decide the winding that faces outward.
    var mi = Math.floor(nU / 2), mj = Math.floor(nV / 2);
    var ia = (mi * cols + mj) * 3, ib = (mi * cols + mj + 1) * 3, ic = ((mi + 1) * cols + mj) * 3;
    var e1x = pos[ic] - pos[ia], e1y = pos[ic + 1] - pos[ia + 1], e1z = pos[ic + 2] - pos[ia + 2];
    var e2x = pos[ib] - pos[ia], e2y = pos[ib + 1] - pos[ia + 1], e2z = pos[ib + 2] - pos[ia + 2];
    var nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    var phiMid = lerp(phi0, phi1, (mj + 0.5) / nV);
    var flip = (ny * Math.cos(phiMid) + nz * Math.sin(phiMid)) < 0;
    var idx = [];
    for (i = 0; i < nU; i++) {
      for (j = 0; j < nV; j++) {
        var va = i * cols + j, vb = va + 1, vc = va + cols, vd = vc + 1;
        if (flip) idx.push(va, vb, vc, vb, vd, vc);
        else idx.push(va, vc, vb, vb, vc, vd);
      }
    }
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new T.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    if (Math.abs(phi1 - phi0) >= Math.PI * 2 - 1e-3) {
      var nrm = geo.attributes.normal;
      for (i = 0; i < rows; i++) {
        var f = i * cols, l = f + nV;
        var sx = nrm.getX(f) + nrm.getX(l), sy = nrm.getY(f) + nrm.getY(l), sz = nrm.getZ(f) + nrm.getZ(l);
        var sl = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
        nrm.setXYZ(f, sx / sl, sy / sl, sz / sl);
        nrm.setXYZ(l, sx / sl, sy / sl, sz / sl);
      }
    }
    return geo;
  }

  // Tilted strut inside the (normal, tangent) plane of a surface frame.
  function pushStrut(ctx, list, fr, tA, nA, tB, nB, thick, wide, offB) {
    var dt = tB - tA, dn = nB - nA;
    var len = Math.sqrt(dt * dt + dn * dn);
    if (len < 1e-4) return;
    if (Math.abs(dn) < 1e-4) dn = dn < 0 ? -1e-4 : 1e-4;
    ctx.pushCustomRot(list, fr, thick, len, wide, (nA + nB) * 0.5, (tA + tB) * 0.5, offB || 0, dt / dn, 0);
  }

  // World-space segment helper (cylinder / square strut from point a to point b).
  function makeSegPusher(T) {
    var up = new T.Vector3(0, 1, 0);
    var q = new T.Quaternion();
    var m = new T.Matrix4();
    var pos = new T.Vector3();
    var sc = new T.Vector3();
    var dir = new T.Vector3();
    return function (list, a, b, rad, radZ) {
      dir.subVectors(b, a);
      var len = dir.length();
      if (len < 1e-5) return;
      dir.multiplyScalar(1 / len);
      q.setFromUnitVectors(up, dir);
      pos.addVectors(a, b).multiplyScalar(0.5);
      sc.set(rad, len, radZ != null ? radZ : rad);
      m.compose(pos, q, sc);
      list.push(m.clone());
    };
  }

  // Lancet / rose glass geometry lying in the (tangent, binormal) plane, normal along +n.
  function makeLancetGeo(T) {
    var s = new T.Shape();
    s.moveTo(0, 0);
    s.lineTo(1, 0);
    s.lineTo(1, 0.62);
    s.quadraticCurveTo(1, 0.88, 0.5, 1);
    s.quadraticCurveTo(0, 0.88, 0, 0.62);
    s.lineTo(0, 0);
    var g = new T.ShapeGeometry(s);
    g.translate(-0.5, -0.5, 0);
    g.rotateX(-Math.PI * 0.5);
    return g;
  }

  function makeDiscGeo(T, segs) {
    var g = new T.CircleGeometry(1, segs || 28);
    g.rotateX(-Math.PI * 0.5);
    return g;
  }

  function makeRingGeo(T, rIn, rOut, segs) {
    var g = new T.RingGeometry(rIn, rOut, segs || 48);
    g.rotateX(-Math.PI * 0.5);
    return g;
  }

  // Solid closed Gothic x Sagrada Familia fluted needle-cathedral spire (axis +Y, 0..1; razor needle tip, zero pom-poms!)
  function makeSagradaTowerGeo(T) {
    var NU = 18, NV = 12;
    var pos = [], uv = [], idx = [];
    for (var iu = 0; iu <= NU; iu++) {
      var h = iu / NU;
      var baseR;
      if (h < 0.22) {
        // Massive stepped gothic stone pedestal blending seamlessly into the cathedral superstructure
        baseR = lerp(1.38, 0.88, h / 0.22);
      } else if (h < 0.62) {
        // Tiered carved Gothic belfry & tapered buttress shaft with crisp stone cornice ledges
        var hs = (h - 0.22) / 0.40;
        var ledge = 0.09 * Math.exp(-Math.pow((hs - 0.35) / 0.05, 2)) + 0.07 * Math.exp(-Math.pow((hs - 0.82) / 0.045, 2));
        baseR = lerp(0.88, 0.42, Math.pow(hs, 0.85)) + ledge;
      } else {
        // Slender concave-tapered Gothic cathedral needle spire closing cleanly to a razor apex
        var hn = (h - 0.62) / 0.38;
        baseR = Math.max(0.005, 0.42 * Math.pow(Math.max(0, 1 - hn), 1.45));
      }
      for (var iv = 0; iv <= NV; iv++) {
        var phi = (iv / NV) * Math.PI * 2;
        // Crisp 4-fold / 8-fold Gothic cruciform fluted stone ribs
        var flute = 1.0 + 0.14 * Math.cos(4 * phi) * (1 - 0.55 * h) + 0.06 * Math.cos(8 * phi) * (1 - 0.7 * h);
        var rad = Math.max(0.004, baseR * flute);
        pos.push(rad * Math.cos(phi), h, rad * Math.sin(phi));
        uv.push((iv / NV) * 1.5, h * 2.5);
      }
    }
    var cols = NV + 1;
    // Outward winding: (c-a) x (b-a) = (+cos(phi), 0, +sin(phi)) -> strictly outward normals!
    for (var i = 0; i < NU; i++) {
      for (var j = 0; j < NV; j++) {
        var a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    var botCenter = pos.length / 3;
    pos.push(0, 0, 0);
    uv.push(0.5, 0.5);
    for (var jb = 0; jb < NV; jb++) idx.push(botCenter, jb, jb + 1);
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('uv', new T.BufferAttribute(new Float32Array(uv), 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // Stepped Gothic flying-buttress finned pier block (monolithic stepped spire-base buttress wall)
  function makeTrencadisFinialGeo(T) {
    // Slender Gothic crocket needle pinnacle (NO bulbous pom-pom ball!)
    var NU = 10, NV = 8;
    var pos = [], uv = [], idx = [];
    for (var iu = 0; iu <= NU; iu++) {
      var h = iu / NU;
      var rad = Math.max(0.004, 0.28 * Math.pow(Math.max(0, 1 - h), 1.35));
      for (var iv = 0; iv <= NV; iv++) {
        var phi = (iv / NV) * Math.PI * 2;
        pos.push(rad * Math.cos(phi), h, rad * Math.sin(phi));
        uv.push(iv / NV, h);
      }
    }
    var cols = NV + 1;
    for (var i = 0; i < NU; i++) {
      for (var j = 0; j < NV; j++) {
        var a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    var botC = pos.length / 3;
    pos.push(0, 0, 0);
    uv.push(0.5, 0.5);
    for (var jf = 0; jf < NV; jf++) idx.push(botC, jf, jf + 1);
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('uv', new T.BufferAttribute(new Float32Array(uv), 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // ---------------------------------------------------------------------------
  // 1. GOTHIC / BASILICA CATHEDRAL KIT (Monumental Carved Slate-Travertine Cathedral Voidship)
  // ---------------------------------------------------------------------------
  var gothicKit = {
    id: 'gothic',
    weightKey: 'styleGothic',

    applyMaterials: function (ctx) {
      if (!ctx || !ctx.T || !ctx.P || !ctx.mats) return;
      var T = ctx.T;
      var st = kitState(ctx, 'gothic', 'styleGothic');
      if (st.w <= 0.02) return;
      var w = st.w, k = st.k;
      var mats = ctx.mats;
      var tex = getTex(T, 'gothic', createGothicTextures);

      // Neutral weathered cathedral slate-travertine for nacelles & pylons (resists green/violet rim cast!)
      if (mats.hull) {
        mixColor(T, mats.hull.color, (st.own && tex) ? 0x9c9892 : 0x86817b, k * 0.94);
        mixNum(mats.hull, 'metalness', 0.24, k * 0.90);
        mixNum(mats.hull, 'roughness', 0.72, k * 0.90);
        if (mats.hull.emissive) {
          mixColor(T, mats.hull.emissive, 0x262422, k * 0.85);
          mats.hull.emissiveMap = null;
          mats.hull.emissiveIntensity = lerp(mats.hull.emissiveIntensity || 0, 0.22, k);
        }
        if (st.own && tex && tex.stoneHull) {
          mats.hull.map = tex.stoneHull;
          mats.hull.bumpMap = tex.stoneBump;
          mats.hull.bumpScale = 0.42 * w;
          mats.hull.roughnessMap = null;
          mats.hull.needsUpdate = true;
        }
      }

      // Deeply carved dark-limestone cathedral nave with pinpoint warm golden stained-glass bays
      [mats.procHull, mats.aftGothic].forEach(function (m) {
        if (!m) return;
        mixColor(T, m.color, (st.own && tex) ? 0x847e77 : 0x726d67, k * 0.95);
        mixNum(m, 'metalness', 0.22, k * 0.92);
        mixNum(m, 'roughness', 0.76, k * 0.92);
        if (m.emissive) {
          mixColor(T, m.emissive, 0xffbe52, k * 0.94);
          m.emissiveMap = (st.own && tex) ? tex.glow : null;
          m.emissiveIntensity = lerp(m.emissiveIntensity || 0.20, 1.25 + (ctx.P.cityLights || 0.4) * 1.10, k);
        }
        if (st.own && tex) {
          m.map = tex.albedo;
          m.bumpMap = tex.bump;
          m.bumpScale = 0.54 * w;
          m.roughnessMap = null;
          m.needsUpdate = true;
        }
      });

      [mats.dark, mats.obsidian].forEach(function (m) {
        if (!m) return;
        mixColor(T, m.color, 0x272526, k * 0.88);
        mixNum(m, 'metalness', 0.42, k * 0.84);
        mixNum(m, 'roughness', 0.58, k * 0.84);
        if (m.emissive) {
          mixColor(T, m.emissive, 0x141315, k * 0.80);
          m.emissiveIntensity = lerp(m.emissiveIntensity || 0, 0.14, k);
        }
      });
      if (mats.trim) {
        // Pale carved gothic stone vault ribs & aged pewter-bronze moldings
        mixColor(T, mats.trim.color, 0xb8b2a8, k * 0.92);
        mixNum(mats.trim, 'metalness', 0.34, k * 0.86);
        mixNum(mats.trim, 'roughness', 0.52, k * 0.86);
        if (mats.trim.emissive) {
          mixColor(T, mats.trim.emissive, 0x2c2926, k * 0.85);
          mixNum(mats.trim, 'emissiveIntensity', 0.20, k * 0.75);
        }
      }
      if (mats.collar) {
        mixColor(T, mats.collar.color, 0x625e59, k * 0.88);
        mixNum(mats.collar, 'metalness', 0.24, k * 0.88);
        mixNum(mats.collar, 'roughness', 0.74, k * 0.88);
        if (mats.collar.emissive) mixColor(T, mats.collar.emissive, 0xffbe52, k * 0.92);
        if (st.own && w >= 0.35 && tex) {
          mats.collar.map = tex.albedo;
          mats.collar.emissiveMap = tex.glow;
          mats.collar.emissiveIntensity = lerp(mats.collar.emissiveIntensity || 0.5, 1.20 + (ctx.P.cityLights || 0.4) * 1.15, k);
          mats.collar.needsUpdate = true;
        }
      }
      if (mats.amberLight && mats.amberLight.color) mixColor(T, mats.amberLight.color, 0xffc658, k * 0.90);
      if (mats.cyanGlow && mats.cyanGlow.color) mixColor(T, mats.cyanGlow.color, 0x90d8e8, k * 0.55);
      if (mats.cryo) {
        mixColor(T, mats.cryo.color, 0x9c9892, k * 0.60);
        mixNum(mats.cryo, 'roughness', 0.76, k * 0.65);
        if (mats.cryo.emissive) mixColor(T, mats.cryo.emissive, 0x201f1e, k * 0.45);
      }
      var rad = mats.rad || mats.radiator;
      if (rad) {
        mixColor(T, rad.color, 0x524840, k * 0.78);
        if (rad.emissive) mixColor(T, rad.emissive, 0xd88224, k * 0.80);
        if (typeof rad.emissiveIntensity === 'number') rad.emissiveIntensity *= (1 - 0.35 * k);
      }
      [mats.ice, mats.iceProc].forEach(function (m) {
        if (!m) return;
        mixColor(T, m.color, 0xf2f4f7, k * 0.16);
      });
    },

    buildGeometry: function (ctx) {
      if (!ctx || !ctx.T || !ctx.P || !ctx.rootGroup) return;
      var st = kitState(ctx, 'gothic', 'styleGothic');
      var w = st.w;
      if (w <= 0.02) return;

      var T = ctx.T;
      var track = tracker(ctx);
      var tex = getTex(T, 'gothic', createGothicTextures);
      var rng = makeRng(ctx, 0x474f5448);
      var detail = clamp(ctx.detailScale != null ? ctx.detailScale : 1, 0.4, 1.2);
      var s = Math.min(ctx.rySeam, ctx.rzSeam);
      var fullR = Math.sqrt(ctx.rySeam * ctx.rySeam + ctx.rzSeam * ctx.rzSeam);
      var aftSpan = ctx.aftSpan;
      var U = makeUnits(T);
      var grp = new T.Group();
      grp.name = 'Style_Gothic_Cathedral';

      // Monumental weathered cathedral ironstone & pale carved limestone -- zero yellow pom-poms!
      var towerStoneMat = track(new T.MeshStandardMaterial({
        color: tex ? 0x8a857e : 0x7b7670,
        map: tex && tex.stoneHull ? tex.stoneHull : (tex ? tex.albedo : null),
        bumpMap: tex && tex.stoneBump ? tex.stoneBump : (tex ? tex.bump : null),
        bumpScale: 0.44 * w,
        emissive: new T.Color(0x22201e),
        emissiveIntensity: 0.22,
        metalness: 0.24,
        roughness: 0.72
      }));
      var buttressMat = track(new T.MeshStandardMaterial({
        color: 0x5c5854,
        map: tex && tex.stoneHull ? tex.stoneHull : null,
        bumpMap: tex && tex.stoneBump ? tex.stoneBump : null,
        bumpScale: 0.36 * w,
        emissive: new T.Color(0x1a1918),
        emissiveIntensity: 0.18,
        metalness: 0.30,
        roughness: 0.68
      }));
      var archRibMat = track(new T.MeshStandardMaterial({
        color: 0xb0aaa0,
        emissive: new T.Color(0x282624),
        emissiveIntensity: 0.20,
        metalness: 0.28,
        roughness: 0.62
      }));
      var ironMat = track(new T.MeshStandardMaterial({
        color: 0x262425,
        emissive: new T.Color(0x121112),
        emissiveIntensity: 0.14,
        metalness: 0.48,
        roughness: 0.54
      }));
      var glassMat = track(new T.MeshStandardMaterial({
        color: 0x2a1808,
        emissive: new T.Color(0xffbe48),
        emissiveMap: tex ? tex.lancet : null,
        emissiveIntensity: 1.55 + 0.85 * w,
        metalness: 0.08,
        roughness: 0.38,
        side: T.DoubleSide
      }));
      var roseMat = track(new T.MeshStandardMaterial({
        color: 0x2a1808,
        emissive: new T.Color(0xffc24c),
        emissiveMap: tex ? tex.rose : null,
        emissiveIntensity: 1.60 + 0.85 * w,
        metalness: 0.08,
        roughness: 0.38,
        side: T.DoubleSide
      }));
      var lanternMat = track(new T.MeshBasicMaterial({ color: 0xffd268 }));

      var towerMats = [], needleMats = [], buttressBoxes = [], archBoxes = [], ironBoxes = [];
      var lancets = [], roses = [], roseRings = [], lanterns = [];

      var aftMinBare = bareMin(ctx, false);
      var foreMinBare = bareMin(ctx, true);

      function localScale(fr) {
        var loc = Math.sqrt(fr.pt.y * fr.pt.y + fr.pt.z * fr.pt.z) / Math.max(1e-3, fullR);
        return s * clamp(loc * 1.15, 0.36, 1.15);
      }

      var tmpMat = new T.Matrix4();
      var upY = new T.Vector3(0, 1, 0);

      // Push a solid hull-rooted slender Gothic cathedral spire tapering to a clean stone needle!
      function pushCathedralSpire(bx, by, bz, dirVec, rad, len, addNeedle) {
        if (!(len > 0.06 && rad > 0.012)) return;
        var d = dirVec.clone().normalize();
        var q = new T.Quaternion().setFromUnitVectors(upY, d);
        tmpMat.compose(new T.Vector3(bx, by, bz), q, new T.Vector3(rad, len, rad));
        towerMats.push(tmpMat.clone());
        if (addNeedle) {
          var nLen = len * 0.28;
          tmpMat.compose(
            new T.Vector3(bx + d.x * (len * 0.88), by + d.y * (len * 0.88), bz + d.z * (len * 0.88)),
            q,
            new T.Vector3(rad * 0.35, nLen, rad * 0.35)
          );
          needleMats.push(tmpMat.clone());
        }
      }

      function pushSegment(list, ax, ay, az, bx, by, bz, thA, thB) {
        var dx = bx - ax, dy = by - ay, dz = bz - az;
        var len = Math.hypot(dx, dy, dz);
        if (len < 1e-4) return;
        var dir = new T.Vector3(dx / len, dy / len, dz / len);
        var q = new T.Quaternion().setFromUnitVectors(upY, dir);
        tmpMat.compose(
          new T.Vector3(0.5 * (ax + bx), 0.5 * (ay + by), 0.5 * (az + bz)),
          q,
          new T.Vector3(thA, len, thB)
        );
        list.push(tmpMat.clone());
      }

      // Stepped solid architectural Gothic flying-buttress wall supporting the cathedral skyline
      function pushButtressRib(x0, r0, x1, r1, dirY, dirZ, th) {
        var nSeg = 4;
        for (var k = 0; k < nSeg; k++) {
          var f0 = k / nSeg, f1 = (k + 1) / nSeg;
          var xa = lerp(x0, x1, f0), xb = lerp(x0, x1, f1);
          var ra = lerp(r0, r1, f0) + Math.sin(f0 * Math.PI) * s * 0.08;
          var rb = lerp(r0, r1, f1) + Math.sin(f1 * Math.PI) * s * 0.08;
          pushSegment(archBoxes, xa, ra * dirY, ra * dirZ, xb, rb * dirY, rb * dirZ, th, th * 0.82);
        }
      }

      // --- 1. Dense Monolithic Gothic Cathedral Citadel + Tapered Tiered Spire Tail ---
      var aftEnd = Math.min(0.95, aftMinBare - 0.015);
      var aftStart = 0.012;
      if (aftEnd - aftStart > 0.14) {
        // 8 deeply carved concentric gothic cornice & gallery rings stepping cleanly down the entire aft hull
        var galleryTs = [0.032, 0.11, 0.20, 0.30, 0.42, 0.55, 0.69, 0.82];
        for (var gi = 0; gi < galleryTs.length; gi++) {
          var tg = galleryTs[gi];
          if (tg > aftEnd - 0.02) continue;
          var gFrac = gi / (galleryTs.length - 1);
          var gRad = s * lerp(0.082, 0.032, gFrac) * (0.85 + 0.28 * w);
          addRing(ctx, grp, false, tg, gRad, towerStoneMat, gRad * 1.15);
          addRing(ctx, grp, false, tg + 0.010, gRad * 0.48, ironMat, gRad * 1.65);
        }

        // Dense shoulder-to-shoulder Gothic cathedral bastion piers + slender needle-spire crown!
        // Modeled as one continuous, brooding Gothic cathedral skyline hugging the forward nave
        // (t = 0.05..0.38) and stepping smoothly down the tapered aft spire!
        var nBays = Math.max(18, Math.round(24 * detail));
        for (var bi = 0; bi < nBays; bi++) {
          var phi = (bi / nBays) * Math.PI * 2;
          var isGrand = (bi % 3 === 0);
          var isMid = (bi % 3 === 1);

          // Continuous stepped bastion wall pier running from waist collar to mid-nave (gives MASSIVE architectural volume!)
          if (isClear(ctx, false, phi, 0.17, 0.10)) {
            var frBase = ctx.evalSurfaceFrame(false, 0.17, phi, 0.996);
            var slB = localScale(frBase);
            var pierDepth = slB * (isGrand ? 0.26 : 0.17) * (0.76 + 0.34 * w);
            var pierLen = aftSpan * (isGrand ? 0.26 : 0.20);
            ctx.pushFramed(buttressBoxes, frBase, pierLen, slB * 0.082, pierDepth, pierDepth * 0.35, 0, 0);
            // Upper stepped gothic nave clerestory block sitting directly atop the pier
            if (isGrand) {
              ctx.pushFramed(buttressBoxes, frBase, pierLen * 0.66, slB * 0.062, pierDepth * 0.85, pierDepth * 0.82, 0, 0);
            }
          }

          // Tiered dense cluster of slender Gothic needle spires rising seamlessly out of the bastion piers
          var spireRows = [
            { t: 0.070, hK: isGrand ? 0.48 : 0.30, rK: isGrand ? 0.095 : 0.068, tilt: 0.05 },
            { t: 0.145, hK: isGrand ? 0.78 : (isMid ? 0.56 : 0.40), rK: isGrand ? 0.125 : 0.088, tilt: 0.01 },
            { t: 0.225, hK: isGrand ? 0.66 : (isMid ? 0.46 : 0.34), rK: isGrand ? 0.112 : 0.078, tilt: -0.04 },
            { t: 0.315, hK: isGrand ? 0.44 : 0.28, rK: isGrand ? 0.090 : 0.064, tilt: -0.08 },
            { t: 0.420, hK: isGrand ? 0.28 : 0.18, rK: isGrand ? 0.072 : 0.050, tilt: -0.12 }
          ];
          for (var ri = 0; ri < spireRows.length; ri++) {
            var rowS = spireRows[ri];
            if (rowS.t > aftEnd - 0.05) continue;
            if (!isGrand && ri >= 3) continue;
            var rPhi = phi + (ri % 2) * (Math.PI / nBays) * 0.45;
            if (!isClear(ctx, false, rPhi, rowS.t, 0.11)) continue;
            var fr = ctx.evalSurfaceFrame(false, rowS.t, rPhi, 0.996);
            var rSurf = Math.hypot(fr.pt.y, fr.pt.z);
            if (rSurf < 1e-3) continue;
            var dirY = fr.pt.y / rSurf, dirZ = fr.pt.z / rSurf;
            var jit = 0.90 + 0.22 * rng();
            var spR = s * rowS.rK * (0.80 + 0.26 * w);
            var spH = s * rowS.hK * (0.76 + 0.36 * w) * jit;
            var rRoot = Math.max(0.10, rSurf - spR * 0.58);
            var dSp = new T.Vector3(rowS.tilt, dirY, dirZ).normalize();
            pushCathedralSpire(fr.pt.x, rRoot * dirY, rRoot * dirZ, dSp, spR, spH + spR * 0.58, isGrand && ri <= 2);

            // Sweeping stone flying buttress ribs tying every grand crossing tower seamlessly into the nave
            if (isGrand && (ri === 1 || ri === 2)) {
              var fbTh = spR * 0.34;
              var rMid = rSurf + spH * 0.42;
              pushButtressRib(fr.pt.x, rMid, fr.pt.x + s * 0.42, rSurf * 0.94, dirY, dirZ, fbTh);
              pushButtressRib(fr.pt.x, rMid, fr.pt.x - s * 0.52, rSurf * 0.90, dirY, dirZ, fbTh);
            }

            // Pinpoint warm golden cathedral sanctuary lights tucked deep between the piers (NOT glowing yellow tips!)
            if (ri <= 2 && rng() < 0.72) {
              var rLan = rSurf + spR * 0.65;
              tmpMat.compose(
                new T.Vector3(fr.pt.x, rLan * dirY, rLan * dirZ),
                new T.Quaternion(),
                new T.Vector3(s * 0.042, s * 0.022, s * 0.022)
              );
              lanterns.push(tmpMat.clone());
            }
          }

          // Tall glowing stained-glass lancet windows tucked in the dark recesses between grand buttress piers
          if (!isGrand && isClear(ctx, false, phi, 0.16, 0.08)) {
            var frW = ctx.evalSurfaceFrame(false, 0.16, phi, 0.998);
            var slW = localScale(frW);
            var flipZ = frW.b.y > 0 ? -1 : 1;
            ctx.pushFramed(lancets, frW, slW * 0.10, 1, slW * (0.28 + 0.10 * w) * flipZ, slW * 0.048, 0, 0);
          }
        }

        // Four sculpted cathedral transept stained-glass rose portals
        [Math.PI * 0.5, -Math.PI * 0.5, 0, Math.PI].forEach(function (phiR) {
          var tRose = 0.20;
          if (!isClear(ctx, false, phiR, tRose, 0.14)) return;
          var frR = ctx.evalSurfaceFrame(false, tRose, phiR, 1.0);
          var rr = s * (0.20 + 0.06 * w);
          ctx.pushFramed(roses, frR, rr, 1, rr, s * 0.085, 0, 0);
          ctx.pushFramed(roseRings, frR, rr * 1.14, 1, rr * 1.14, s * 0.092, 0, 0);
        });

        // 12 continuous tapered carved gothic buttress spine ribs sweeping cleanly down to stern tip
        var nSpines = 12;
        for (var ribI = 0; ribI < nSpines; ribI++) {
          var phiRib = (ribI / nSpines) * Math.PI * 2;
          for (var rs = 0; rs < 8; rs++) {
            var tr0 = lerp(aftStart + 0.02, aftEnd, rs / 8);
            var tr1 = lerp(aftStart + 0.02, aftEnd, (rs + 1) / 8);
            var trm = 0.5 * (tr0 + tr1);
            if (!isClear(ctx, false, phiRib, trm, 0.08)) continue;
            var frR2 = ctx.evalSurfaceFrame(false, trm, phiRib, 0.996);
            var slR = localScale(frR2);
            var segL = (tr1 - tr0) * aftSpan * 1.06;
            ctx.pushFramed(buttressBoxes, frR2, segL, slR * 0.092, slR * 0.056, slR * 0.042, 0, 0);
            if (ribI % 2 === 0) {
              ctx.pushFramed(ironBoxes, frR2, segL * 0.96, slR * 0.032, slR * 0.072, slR * 0.078, 0, 0);
            }
          }
        }

        // Slender stone cathedral needle finial crowning the tapered stern tip (-X)
        if (aftEnd > 0.84) {
          var xSternTip = ctx.seamX - aftEnd * aftSpan;
          pushCathedralSpire(xSternTip + s * 0.16, 0, 0, new T.Vector3(-1, 0, 0), s * 0.11, s * 1.25, true);
        }
      }

      // Carved stone cloister parapet forward of seam if bow ice is pulled back
      if (foreMinBare > 0.08) {
        var fEndG = Math.min(0.16, foreMinBare - 0.02);
        [0.015, fEndG].forEach(function (pp) {
          addRing(ctx, grp, true, pp, s * 0.042, archRibMat, s * 0.046);
        });
        for (var fc = 0; fc < 12; fc++) {
          var phiF = (fc / 12) * Math.PI * 2;
          var frF = ctx.evalSurfaceFrame(true, fEndG * 0.5, phiF, 0.994);
          var rF = Math.hypot(frF.pt.y, frF.pt.z);
          if (rF > 1e-3) {
            var dYF = frF.pt.y / rF, dZF = frF.pt.z / rF;
            pushCathedralSpire(frF.pt.x, (rF - s * 0.04) * dYF, (rF - s * 0.04) * dZF, new T.Vector3(0.25, dYF, dZF), s * 0.064, s * 0.34, false);
          }
        }
      }

      safeCommit(ctx, makeSagradaTowerGeo(T), towerStoneMat, towerMats, grp);
      safeCommit(ctx, makeTrencadisFinialGeo(T), archRibMat, needleMats, grp);
      safeCommit(ctx, U.box, buttressMat, buttressBoxes, grp);
      safeCommit(ctx, U.box.clone(), archRibMat, archBoxes, grp);
      safeCommit(ctx, U.box.clone(), ironMat, ironBoxes, grp);
      safeCommit(ctx, makeLancetGeo(T), glassMat, lancets, grp);
      safeCommit(ctx, makeDiscGeo(T, 36), roseMat, roses, grp);
      var rrGeo = new T.TorusGeometry(1, 0.08, 8, 36);
      rrGeo.rotateX(-Math.PI * 0.5);
      safeCommit(ctx, rrGeo, archRibMat, roseRings, grp);
      safeCommit(ctx, U.box.clone(), lanternMat, lanterns, grp);

      ctx.rootGroup.add(grp);
    }
  };

  // ---------------------------------------------------------------------------
  // Shared helpers for the sleek + coade kits
  // ---------------------------------------------------------------------------
  function flatShade(geo) {
    var g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.computeVertexNormals();
    return g;
  }

  function scaleUV(geo, su, sv) {
    var uv = geo.attributes.uv;
    if (!uv) return geo;
    for (var i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    uv.needsUpdate = true;
    return geo;
  }

  function profAt(arr, a) {
    var i = Math.round(clamp(a, 0, 1) * (arr.length - 1));
    return arr[i];
  }

  // Flat-shaded prism from an XZ outline; the top outline is shrunk by topK for chamfered edges.
  function makePrismGeo(T, pts, yBot, yTop, topK) {
    var n = pts.length, cx = 0, cz = 0, i;
    for (i = 0; i < n; i++) {
      cx += pts[i][0];
      cz += pts[i][1];
    }
    cx /= n;
    cz /= n;
    var pos = [], uv = [];
    function v(x, y, z) {
      pos.push(x, y, z);
      uv.push(x * 0.22, z * 0.22);
    }
    for (i = 0; i < n; i++) {
      var j = (i + 1) % n;
      var ta = [cx + (pts[i][0] - cx) * topK, cz + (pts[i][1] - cz) * topK];
      var tb = [cx + (pts[j][0] - cx) * topK, cz + (pts[j][1] - cz) * topK];
      v(cx, yTop, cz); v(ta[0], yTop, ta[1]); v(tb[0], yTop, tb[1]);
      v(cx, yBot, cz); v(pts[j][0], yBot, pts[j][1]); v(pts[i][0], yBot, pts[i][1]);
      v(pts[i][0], yBot, pts[i][1]); v(pts[j][0], yBot, pts[j][1]); v(tb[0], yTop, tb[1]);
      v(pts[i][0], yBot, pts[i][1]); v(tb[0], yTop, tb[1]); v(ta[0], yTop, ta[1]);
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('uv', new T.BufferAttribute(new Float32Array(uv), 2));
    g.computeVertexNormals();
    return g;
  }

  function isClear(ctx, isFore, phi, p, pad) {
    var k = ctx.keepout;
    if (isFore || !k || typeof k.isBlocked !== 'function') return true;
    return !k.isBlocked(phi, p, pad);
  }

  // Largest p (p0..p1) such that the whole prefix stays outside the aft keepout zones.
  function clearSpan(ctx, isFore, phi, p0, p1, pad) {
    var last = p0;
    for (var i = 0; i <= 12; i++) {
      var p = lerp(p0, p1, i / 12);
      if (!isClear(ctx, isFore, phi, p, pad)) return i === 0 ? null : last;
      last = p;
    }
    return p1;
  }

  // Glowing materials follow the torch: register for setPlumeIntensity with a matching baseline.
  function addHeat(ctx, mat) {
    if (!ctx.heatMatList) return;
    ctx.heatMatList.push(mat);
    if (ctx.heatBase) ctx.heatBase.push(mat.emissiveIntensity);
  }

  // ---------------------------------------------------------------------------
  // 2. SLEEK FUTURISM KIT (Nighthawk F-117 / B-2 / Hopeless Diamond stealth)
  // ---------------------------------------------------------------------------
  var sleekKit = {
    id: 'sleek',
    weightKey: 'styleSleek',

    applyMaterials: function (ctx) {
      if (!ctx || !ctx.T || !ctx.P || !ctx.mats) return;
      var T = ctx.T;
      var st = kitState(ctx, 'sleek', 'styleSleek');
      if (st.w <= 0.02) return;
      var w = st.w, k = st.k;
      var mats = ctx.mats;
      var tex = getTex(T, 'sleek', createSleekTextures);

      function ram(m, bumpAmt) {
        if (!m) return;
        mixColor(T, m.color, (st.own && tex) ? 0xe6eaf6 : 0x1a1e2c, k * 0.9);
        mixNum(m, 'metalness', 0.40, k * 0.9);
        mixNum(m, 'roughness', 0.70, k * 0.9);
        if (st.own && tex) {
          m.map = tex.albedo;
          m.bumpMap = tex.bump;
          m.bumpScale = bumpAmt * w;
          m.needsUpdate = true;
        }
      }
      ram(mats.hull, 0.22);
      ram(mats.procHull, 0.26);
      ram(mats.aftGothic, 0.22);
      if (mats.aftGothic && mats.aftGothic.emissive) mixColor(T, mats.aftGothic.emissive, 0x2a1008, k * 0.7);

      [mats.dark, mats.obsidian].forEach(function (m) {
        if (!m) return;
        mixColor(T, m.color, 0x0e1019, k * 0.85);
        mixNum(m, 'roughness', 0.62, k * 0.7);
        mixNum(m, 'metalness', 0.34, k * 0.7);
      });
      if (mats.trim) {
        mixColor(T, mats.trim.color, 0x2a2f40, k * 0.85);
        mixNum(mats.trim, 'metalness', 0.46, k * 0.8);
        mixNum(mats.trim, 'roughness', 0.58, k * 0.8);
        if (mats.trim.emissive) mixColor(T, mats.trim.emissive, 0x0a0c14, k * 0.7);
      }
      if (mats.collar) {
        mixColor(T, mats.collar.color, 0x181b27, k * 0.85);
        if (mats.collar.emissive) mixColor(T, mats.collar.emissive, 0x5a2410, k * 0.6);
        mats.collar.emissiveIntensity = (mats.collar.emissiveIntensity || 0) * (1 - 0.3 * k);
      }
      [mats.amberLight, mats.cyanGlow].forEach(function (m) {
        if (!m) return;
        if (m.color) mixColor(T, m.color, 0x7a2a12, k * 0.5);
        if (m.emissive) mixColor(T, m.emissive, 0x7a2a12, k * 0.5);
        if (typeof m.emissiveIntensity === 'number') m.emissiveIntensity *= (1 - 0.35 * k);
      });
      if (mats.cryo) {
        mixColor(T, mats.cryo.color, 0x3a4258, k * 0.5);
        mixNum(mats.cryo, 'roughness', 0.6, k * 0.5);
      }
      var radS = mats.rad || mats.radiator;
      if (radS) {
        mixColor(T, radS.color, 0x181c28, k * 0.90);
        if (radS.emissive) mixColor(T, radS.emissive, 0x2e1008, k * 0.88);
        if (typeof radS.emissiveIntensity === 'number') radS.emissiveIntensity *= (1 - 0.74 * k);
        mixNum(radS, 'roughness', 0.72, k * 0.8);
        mixNum(radS, 'metalness', 0.40, k * 0.6);
      }
      [mats.ice, mats.iceProc].forEach(function (m) {
        if (!m) return;
        mixColor(T, m.color, 0xaab6d0, k * 0.18);
        if (m.emissive) mixColor(T, m.emissive, 0x182030, k * 0.3);
      });
    },

    buildGeometry: function (ctx) {
      if (!ctx || !ctx.T || !ctx.P || !ctx.rootGroup) return;
      var st = kitState(ctx, 'sleek', 'styleSleek');
      var w = st.w;
      if (w <= 0.02) return;

      var T = ctx.T;
      var track = tracker(ctx);
      var tex = getTex(T, 'sleek', createSleekTextures);
      var rng = makeRng(ctx, 0x534c4b31);
      var detail = clamp(ctx.detailScale != null ? ctx.detailScale : 1, 0.4, 1.2);
      var s = Math.min(ctx.rySeam, ctx.rzSeam);
      var fullR = Math.sqrt(ctx.rySeam * ctx.rySeam + ctx.rzSeam * ctx.rzSeam);
      var aftSpan = ctx.aftSpan;
      var grp = new T.Group();
      grp.name = 'Style_Sleek_Stealth';

      var ramMat = track(new T.MeshStandardMaterial({
        color: tex ? 0xe6eaf6 : 0x161926,
        map: tex ? tex.albedo : null,
        bumpMap: tex ? tex.bump : null,
        bumpScale: 0.20 * w,
        metalness: 0.40,
        roughness: 0.70
      }));
      var facetMat = track(new T.MeshStandardMaterial({
        color: tex ? 0xdfe3f2 : 0x1a1e2c,
        map: tex ? tex.albedo : null,
        metalness: 0.46,
        roughness: 0.62,
        side: T.DoubleSide
      }));
      var bladeMat = track(new T.MeshStandardMaterial({
        color: tex ? 0xd2d7e8 : 0x12141f,
        map: tex ? tex.albedo : null,
        bumpMap: tex ? tex.bump : null,
        bumpScale: 0.12 * w,
        metalness: 0.44,
        roughness: 0.66,
        side: T.DoubleSide
      }));
      var ventMat = track(new T.MeshStandardMaterial({
        color: 0x07080c,
        metalness: 0.30,
        roughness: 0.78
      }));
      var emberMat = track(new T.MeshStandardMaterial({
        color: 0x1a0a06,
        emissive: new T.Color(0x8a2208),
        emissiveIntensity: 0.35 + 0.35 * w,
        metalness: 0.2,
        roughness: 0.7
      }));
      addHeat(ctx, emberMat);

      var foreMinBare = bareMin(ctx, true);
      var aftMinBare = bareMin(ctx, false);

      function localLift(rad) {
        return s * clamp((rad / Math.max(1e-3, fullR)) * 1.15, 0.42, 1.15);
      }

      // --- 1. Sweeping angular chines along the port / starboard horizon --------------------
      function chine(isFore, phiC, pA, pB) {
        var span = clearSpan(ctx, isFore, phiC, pA, pB, 0.14);
        if (span === null || span - pA < (isFore ? 0.07 : 0.12)) return;
        var H = s * (0.09 + 0.13 * w);
        var geo = buildPatch(ctx, isFore, pA, span, phiC - 0.24, phiC + 0.24, Math.max(5, Math.round(8 * detail)), 4,
          function (a, b, rad) {
            var taper = Math.pow(Math.max(0, Math.sin(Math.PI * a)), 0.72);
            var ridge = 1 - Math.abs(2 * b - 1);
            return 0.012 + localLift(rad) * (H / s) * ridge * taper;
          }, [3, 1]);
        grp.add(new T.Mesh(flatShade(geo), facetMat));
      }
      var aftChineEnd = Math.min(0.80, aftMinBare - 0.05);
      var foreChineEnd = Math.min(0.55, foreMinBare - 0.05);
      [Math.PI * 0.5, -Math.PI * 0.5].forEach(function (phiH) {
        chine(false, phiH, 0.04, aftChineEnd);
        chine(true, phiH, 0.03, foreChineEnd);
      });

      // --- 2. Faceted trapezoidal shroud fairings (F-117 / Hopeless Diamond planes) ------------
      var PROF = [0.0, 0.55, 1.0, 1.0, 1.0, 0.55, 0.0];
      function shroud(isFore, phiC, pA, pB, halfW, hMul) {
        var span = clearSpan(ctx, isFore, phiC, pA, pB, 0.12);
        if (span === null || span - pA < (isFore ? 0.06 : 0.10)) return;
        var H = s * (0.07 + 0.09 * w) * hMul;
        var geo = buildPatch(ctx, isFore, pA, span, phiC - halfW, phiC + halfW, 6, 6,
          function (a, b, rad) {
            return 0.012 + localLift(rad) * (H / s) * profAt(PROF, a) * profAt(PROF, b);
          }, [2, 1]);
        grp.add(new T.Mesh(flatShade(geo), ramMat));
      }
      shroud(false, 0, 0.10, Math.min(0.62, aftMinBare - 0.05), 0.42, 1.0);
      shroud(true, 0, 0.05, Math.min(0.50, foreMinBare - 0.05), 0.38, 0.85);
      if (w > 0.4) shroud(false, Math.PI, 0.12, Math.min(0.50, aftMinBare - 0.05), 0.36, 0.7);

      // Octagonal waist shroud: chamfered collar planes where the stock collar sits
      var OCT = [0.22, 1.0, 1.0, 1.0, 0.22];
      [false, true].forEach(function (isFore) {
        var pA = 0.0, pB = isFore ? Math.min(0.07, foreMinBare - 0.01) : 0.095;
        if (pB - pA < 0.04) return;
        var Hc = s * (0.05 + 0.05 * w);
        var geo = buildPatch(ctx, isFore, pA, pB, Math.PI / 8, Math.PI * 2 + Math.PI / 8, 4, 8,
          function (a, b, rad) {
            return 0.015 + localLift(rad) * (Hc / s) * profAt(OCT, a);
          }, [1, 4]);
        grp.add(new T.Mesh(flatShade(geo), ramMat));
      });

      // --- 3. Swept B-2 flying-wing blade fairings with sawtooth trailing edges --------------
      if (w > 0.25) {
        var pA = 0.14;
        var pB = Math.min(0.60, aftMinBare - 0.06);
        if (pB - pA > 0.12) {
          [1, -1].forEach(function (sgn) {
            var phiH = sgn * Math.PI * 0.5;
            var pEnd = clearSpan(ctx, false, phiH, pA, pB, 0.16);
            if (pEnd === null || pEnd - pA < 0.1) return;
            var r0 = hullRadii(ctx, false, pEnd).rz * 0.86;
            var x0 = ctx.seamX - pA * aftSpan, x1 = ctx.seamX - pEnd * aftSpan;
            var chord = x0 - x1;
            var span = s * (0.8 + 1.5 * w) * (0.6 + 0.4 * sstep(0.25, 0.7, w));
            var sweep = chord * 0.95;
            var tipC = chord * 0.38;
            var xt = x0 - sweep;
            var corner = [xt - tipC, r0 + span * 0.94];
            var rootEnd = [x1, r0];
            var pts = [[x0, r0], [xt, r0 + span], corner];
            var teeth = 5, tooth = chord * 0.07;
            for (var q = 1; q < teeth; q++) {
              var f = q / teeth;
              var bx = corner[0] + (rootEnd[0] - corner[0]) * f;
              var bz = corner[1] + (rootEnd[1] - corner[1]) * f;
              pts.push([bx + ((q % 2 === 1) ? tooth : -tooth * 0.3), bz]);
            }
            pts.push(rootEnd);
            var zs = pts.map(function (pt) { return [pt[0], sgn * pt[1]]; });
            var thick = s * (0.035 + 0.02 * w);
            var geo = makePrismGeo(T, zs, -thick * 0.5, thick * 0.5, 0.82);
            var mesh = new T.Mesh(geo, bladeMat);
            mesh.position.y = 0;
            grp.add(mesh);
            // Dorsal root fillet blending the blade into the fuselage
            var geoF = buildPatch(ctx, false, pA, pEnd, phiH - sgn * 0.0, phiH - sgn * 0.30, 6, 3,
              function (a, b, rad) {
                var taper = Math.pow(Math.max(0, Math.sin(Math.PI * a)), 0.6);
                return 0.01 + localLift(rad) * 0.07 * taper * (1 - b);
              }, [2, 1]);
            grp.add(new T.Mesh(flatShade(geoF), ramMat));
          });
        }
      }

      // --- 4. Buried zig-zag exhaust baffles with faint deep-ember seams --------------------
      var slats = [], embers = [], vents = [];
      var ventPhis = [Math.PI * 0.30, Math.PI * 0.70, -Math.PI * 0.30, -Math.PI * 0.70];
      ventPhis.forEach(function (phiV) {
        var pV = Math.min(0.74, bareEnd(ctx, false, phiV) - 0.05);
        if (pV < 0.4) return;
        var ph = clearPhi(ctx, phiV, pV, false, 0.10);
        if (ph === null) return;
        var fr = ctx.evalSurfaceFrame(false, pV, ph, 0.99);
        var sl = localLift(Math.sqrt(fr.pt.y * fr.pt.y + fr.pt.z * fr.pt.z));
        var vl = Math.min(aftSpan * 0.14, sl * 0.9), vw = sl * 0.28;
        ctx.pushFramed(vents, fr, vl, sl * 0.012, vw, 0.012, 0, 0);
        var nS = 4;
        for (var i = 0; i < nS; i++) {
          var offT = (i / (nS - 1) - 0.5) * vl * 0.82;
          var tilt = (i % 2 === 0) ? 0.85 : -0.85;
          ctx.pushCustomRot(slats, fr, vl * 0.26, sl * 0.014, vw * 0.96, 0.03, offT, 0, tilt, 0);
          if (i < nS - 1) ctx.pushFramed(embers, fr, vl * 0.10, sl * 0.006, vw * 0.8, 0.018, offT + vl * 0.11, 0);
        }
      });

      safeCommit(ctx, new T.BoxGeometry(1, 1, 1), ventMat, vents, grp);
      safeCommit(ctx, new T.BoxGeometry(1, 1, 1), ramMat, slats, grp);
      safeCommit(ctx, new T.BoxGeometry(1, 1, 1), emberMat, embers, grp);

      ctx.rootGroup.add(grp);
    }
  };

  // ---------------------------------------------------------------------------
  // 3. CHILDREN OF A DEAD EARTH KIT (pale paneled modules, gold collars, MLI, radiator cross)
  // ---------------------------------------------------------------------------
  var coadeKit = {
    id: 'coade',
    weightKey: 'styleCoade',

    applyMaterials: function (ctx) {
      if (!ctx || !ctx.T || !ctx.P || !ctx.mats) return;
      var T = ctx.T;
      var st = kitState(ctx, 'coade', 'styleCoade');
      if (st.w <= 0.02) return;
      var w = st.w, k = st.k;
      var mats = ctx.mats;
      var tex = getTex(T, 'coade', createCoadeTextures);

      function pale(m, bumpAmt) {
        if (!m) return;
        mixColor(T, m.color, (st.own && tex) ? 0xf4f7fa : 0xcfd5db, k * 0.92);
        mixNum(m, 'metalness', 0.28, k * 0.9);
        mixNum(m, 'roughness', 0.68, k * 0.9);
        if (m.emissive) mixColor(T, m.emissive, 0x0c0e10, k * 0.6);
        if (st.own && tex) {
          m.map = tex.panelAlbedo;
          m.bumpMap = tex.panelBump;
          m.bumpScale = bumpAmt * w;
          m.needsUpdate = true;
        }
      }
      pale(mats.hull, 0.35);
      pale(mats.procHull, 0.40);
      pale(mats.aftGothic, 0.35);
      if (mats.aftGothic) {
        mats.aftGothic.emissiveIntensity = (mats.aftGothic.emissiveIntensity || 0) * (1 - 0.88 * k);
      }
      [mats.dark, mats.obsidian].forEach(function (m) {
        if (!m) return;
        mixColor(T, m.color, 0x3a3f46, k * 0.85);
        mixNum(m, 'metalness', 0.55, k * 0.6);
        mixNum(m, 'roughness', 0.52, k * 0.6);
      });
      if (mats.trim) {
        mixColor(T, mats.trim.color, 0xd8a436, k * 0.95);
        mixNum(mats.trim, 'metalness', 0.85, k * 0.9);
        mixNum(mats.trim, 'roughness', 0.24, k * 0.9);
        if (mats.trim.emissive) mixColor(T, mats.trim.emissive, 0x2a1a04, k * 0.8);
      }
      if (mats.collar) {
        mixColor(T, mats.collar.color, 0xd8a436, k * 0.9);
        mixNum(mats.collar, 'metalness', 0.85, k * 0.8);
        mixNum(mats.collar, 'roughness', 0.24, k * 0.8);
        if (mats.collar.emissive) mixColor(T, mats.collar.emissive, 0x3a2606, k * 0.9);
        mats.collar.emissiveIntensity = (mats.collar.emissiveIntensity || 0) * (1 - 0.85 * k);
      }
      if (mats.cryo) {
        mixColor(T, mats.cryo.color, 0xeef1f4, k * 0.5);
        mixNum(mats.cryo, 'roughness', 0.45, k * 0.5);
      }
      var rad = mats.rad || mats.radiator;
      if (rad) {
        mixColor(T, rad.color, 0x2a0e08, k * 0.6);
        if (rad.emissive) mixColor(T, rad.emissive, 0xff4b18, k * 0.8);
      }
      if (mats.amberLight && mats.amberLight.color) mixColor(T, mats.amberLight.color, 0xe0a21c, k * 0.5);
      if (mats.cyanGlow && mats.cyanGlow.color) mixColor(T, mats.cyanGlow.color, 0xcdf4ff, k * 0.5);
      [mats.ice, mats.iceProc].forEach(function (m) {
        if (!m) return;
        mixColor(T, m.color, 0xf2f6fa, k * 0.2);
      });
    },

    buildGeometry: function (ctx) {
      if (!ctx || !ctx.T || !ctx.P || !ctx.rootGroup) return;
      var st = kitState(ctx, 'coade', 'styleCoade');
      var w = st.w;
      if (w <= 0.02) return;

      var T = ctx.T;
      var track = tracker(ctx);
      var tex = getTex(T, 'coade', createCoadeTextures);
      var rng = makeRng(ctx, 0x434f4144);
      var detail = clamp(ctx.detailScale != null ? ctx.detailScale : 1, 0.4, 1.2);
      var s = Math.min(ctx.rySeam, ctx.rzSeam);
      var fullR = Math.sqrt(ctx.rySeam * ctx.rySeam + ctx.rzSeam * ctx.rzSeam);
      var aftSpan = ctx.aftSpan;
      var seg = makeSegPusher(T);
      var grp = new T.Group();
      grp.name = 'Style_Coade_Savages';

      var paleMat = track(new T.MeshStandardMaterial({
        color: tex ? 0xf4f7fa : 0xcfd5db,
        map: tex ? tex.panelAlbedo : null,
        bumpMap: tex ? tex.panelBump : null,
        bumpScale: 0.35,
        metalness: 0.28,
        roughness: 0.68
      }));
      var mliMat = track(new T.MeshStandardMaterial({
        color: tex ? 0xffffff : 0xeef1f4,
        map: tex ? tex.mliAlbedo : null,
        bumpMap: tex ? tex.mliBump : null,
        bumpScale: 0.9,
        metalness: 0.55,
        roughness: 0.34
      }));
      var goldMat = track(new T.MeshStandardMaterial({
        color: 0xd8a436,
        emissive: new T.Color(0x3a2606),
        emissiveIntensity: 0.25,
        metalness: 0.85,
        roughness: 0.24
      }));
      var frameMat = track(new T.MeshStandardMaterial({
        color: 0x3b4048,
        metalness: 0.75,
        roughness: 0.42
      }));
      var darkMat = track(new T.MeshStandardMaterial({
        color: 0x14171b,
        metalness: 0.35,
        roughness: 0.70,
        side: T.DoubleSide
      }));
      var orangeMat = track(new T.MeshStandardMaterial({
        color: 0xd96b27,
        emissive: new T.Color(0x6a2a08),
        emissiveIntensity: 0.6,
        metalness: 0.3,
        roughness: 0.5
      }));
      var domeMat = track(new T.MeshStandardMaterial({
        color: 0xf4f6f8,
        metalness: 0.12,
        roughness: 0.32
      }));
      var lensMat = track(new T.MeshStandardMaterial({
        color: 0x0a1218,
        emissive: new T.Color(0x2fa8c8),
        emissiveIntensity: 0.55,
        metalness: 0.6,
        roughness: 0.15
      }));
      var pipMat = track(new T.MeshStandardMaterial({
        color: 0x300808,
        emissive: new T.Color(0xff2a1a),
        emissiveIntensity: 1.6,
        metalness: 0.1,
        roughness: 0.5
      }));
      var radMat = track(new T.MeshStandardMaterial({
        color: 0x200806,
        emissive: new T.Color(tex ? 0xffffff : 0xd23a14),
        emissiveMap: tex ? tex.radiator : null,
        emissiveIntensity: 1.28,
        metalness: 0.25,
        roughness: 0.55,
        side: T.DoubleSide
      }));
      addHeat(ctx, radMat);

      var aftBare = bareMin(ctx, false);
      var foreBare = bareMin(ctx, true);
      var aEnd = Math.min(0.74, aftBare - 0.04);
      var fEnd = Math.min(0.50, foreBare - 0.03);

      var paleBox = [], paleCyl = [], mliBox = [], mliCyl = [], goldCyl = [], goldBox = [];
      var darkCyl = [], darkBox = [], domes = [], lensCyl = [], frameBox = [], frameCyl = [], orangeBox = [], pips = [];

      function localS(fr) {
        var loc = Math.sqrt(fr.pt.y * fr.pt.y + fr.pt.z * fr.pt.z) / Math.max(1e-3, fullR);
        return s * clamp(loc * 1.15, 0.42, 1.15);
      }

      function ringAt(isFore, p) {
        addRing(ctx, grp, isFore, p, s * (0.05 + 0.02 * w), goldMat, s * 0.05);
      }

      function sleeve(isFore, pA, pB, mat, lift, uRep) {
        if (pB - pA < 0.03) return;
        var geo = buildPatch(ctx, isFore, pA, pB, 0, Math.PI * 2, 4, 40,
          function () { return lift; }, uRep);
        grp.add(new T.Mesh(geo, mat));
      }

      // --- 1. Stacked modules: pale paneled sleeves, MLI drums and gold stage collars ----------
      var sl = s * 0.035;
      var aftStations = [], aftBay = null;
      if (aEnd - 0.10 > 0.12) {
        var span = aEnd - 0.10;
        if (aEnd >= 0.50) {
          var m1 = lerp(0.10, aEnd, 0.36), m2 = lerp(0.10, aEnd, 0.68);
          sleeve(false, 0.10, m1 - 0.008, paleMat, sl, [4, 2]);
          sleeve(false, m2 + 0.008, aEnd, mliMat, s * 0.05, [5, 2]);
          aftBay = [m1 + 0.012, m2 - 0.012];
          aftStations = [0.10, m1, m2, aEnd];
        } else {
          var mm = lerp(0.10, aEnd, 0.55);
          sleeve(false, 0.10, mm - 0.008, paleMat, sl, [4, 2]);
          sleeve(false, mm + 0.008, aEnd, mliMat, s * 0.05, [5, 2]);
          aftStations = [0.10, mm, aEnd];
        }
      }
      aftStations.forEach(function (p) { ringAt(false, p); });
      var foreStations = [];
      var fSleeve = null;
      if (fEnd - 0.04 > 0.10) {
        sleeve(true, 0.045, fEnd, mliMat, s * 0.045, [4, 2]);
        foreStations = [0.012, fEnd];
        fSleeve = [0.045, fEnd];
        if (fEnd > 0.30) foreStations.push(lerp(0.045, fEnd, 0.5));
      } else if (foreBare > 0.06) {
        foreStations = [0.012];
      }
      foreStations.forEach(function (p) { ringAt(true, p); });

      // Gold collar girdling the waist citadel joint
      ringAt(false, 0.012);
      if (foreBare > 0.06) ringAt(true, 0.006);

      // --- 2. Quilted MLI propellant canisters strapped to the flanks -----------------------
      if (aftStations.length >= 3) {
        var pc0 = aftStations[0] + 0.02, pc1 = aftStations[1] - 0.02;
        [Math.PI * 0.5, -Math.PI * 0.5].forEach(function (phiF) {
          [-0.30, 0.30].forEach(function (dphi) {
            var pm = (pc0 + pc1) * 0.5;
            var phC = clearPhi(ctx, phiF + dphi, pm, false, 0.10);
            if (phC === null) return;
            var fr = ctx.evalSurfaceFrame(false, pm, phC, 0.99);
            var sc = localS(fr);
            var len = Math.max(0.2, (pc1 - pc0) * aftSpan * 0.9);
            var rr = sc * 0.10;
            ctx.pushAxialPipe(mliCyl, fr, rr, len, sl + rr * 0.9, 0, 0);
            [-0.5, 0.5].forEach(function (e) {
              ctx.pushAxialPipe(goldCyl, fr, rr * 1.10, sc * 0.03, sl + rr * 0.9, e * len, 0);
            });
          });
        });
      }

      // --- 3. White hemispherical radomes + twin-lens sensor cupolas -------------------------
      function addRadome(isFore, p, phiPref, rMul) {
        var ph = clearPhi(ctx, phiPref, p, isFore, 0.12);
        if (ph === null) return;
        var fr = ctx.evalSurfaceFrame(isFore, p, ph, 0.99);
        var sc = localS(fr);
        var rr = sc * 0.20 * rMul;
        var base = isFore ? s * 0.045 : sl;
        ctx.pushFramed(goldCyl, fr, rr * 1.16, sc * 0.035, rr * 1.16, base, 0, 0);
        ctx.pushFramed(domes, fr, rr, rr, rr, base + sc * 0.012, 0, 0);
      }
      function addSensorPod(isFore, p, phiPref) {
        var ph = clearPhi(ctx, phiPref, p, isFore, 0.12);
        if (ph === null) return;
        var fr = ctx.evalSurfaceFrame(isFore, p, ph, 0.99);
        var sc = localS(fr);
        var base = isFore ? s * 0.045 : sl;
        var hl = sc * 0.26, hh = sc * 0.12, hw = sc * 0.22;
        ctx.pushFramed(paleBox, fr, hl, hh, hw, base + hh * 0.5, 0, 0);
        ctx.pushFramed(goldCyl, fr, hw * 0.55, sc * 0.03, hw * 0.55, base + 0.01, 0, 0);
        [-1, 1].forEach(function (side) {
          ctx.pushAxialPipe(lensCyl, fr, sc * 0.045, sc * 0.05, base + hh * 0.5, hl * 0.5, side * hw * 0.28);
          ctx.pushAxialPipe(goldCyl, fr, sc * 0.056, sc * 0.015, base + hh * 0.5, hl * 0.5 - sc * 0.03, side * hw * 0.28);
        });
      }
      if (aEnd > 0.2) {
        var pr1 = lerp(0.10, aEnd, 0.20);
        addRadome(false, pr1, 0, 1.0);
        addRadome(false, lerp(0.10, aEnd, 0.78), Math.PI, 0.85);
        addSensorPod(false, lerp(0.10, aEnd, 0.52), Math.PI);
        if (w > 0.45) addRadome(false, lerp(0.10, aEnd, 0.52), Math.PI * 0.5, 0.65);
      }
      if (fSleeve) {
        addRadome(true, lerp(fSleeve[0], fSleeve[1], 0.25), 0, 0.9);
        addSensorPod(true, lerp(fSleeve[0], fSleeve[1], 0.70), 0);
      }

      // --- 4. Boxy turrets on gold ring pedestals with MLI-wrapped barrels ------------------
      function addTurret(isFore, p, phiPref, scl) {
        var ph = clearPhi(ctx, phiPref, p, isFore, 0.14);
        if (ph === null) return;
        var fr = ctx.evalSurfaceFrame(isFore, p, ph, 0.99);
        var sc = localS(fr) * scl;
        var base = isFore ? s * 0.045 : sl;
        var ped = sc * 0.06;
        ctx.pushFramed(goldCyl, fr, sc * 0.24, ped, sc * 0.24, base + ped * 0.5, 0, 0);
        var hh = sc * 0.16;
        ctx.pushFramed(mliBox, fr, sc * 0.34, hh, sc * 0.30, base + ped + hh * 0.5, 0, 0);
        ctx.pushFramed(goldBox, fr, sc * 0.36, sc * 0.02, sc * 0.32, base + ped + hh, 0, 0);
        var bl = sc * (0.55 + 0.2 * w), br = sc * 0.04;
        var by = base + ped + hh * 0.55;
        [-1, 1].forEach(function (side) {
          var ob = side * sc * 0.085;
          ctx.pushAxialPipe(mliCyl, fr, br, bl, by, sc * 0.17 + bl * 0.5, ob);
          ctx.pushAxialPipe(goldCyl, fr, br * 1.28, sc * 0.025, by, sc * 0.17 + sc * 0.03, ob);
          ctx.pushAxialPipe(darkCyl, fr, br * 0.78, sc * 0.05, by, sc * 0.17 + bl + sc * 0.012, ob);
        });
      }
      if (aEnd > 0.2) {
        var pT = lerp(0.10, aEnd, 0.28);
        addTurret(false, pT, 0, 1.0);
        if (w > 0.35) addTurret(false, lerp(0.10, aEnd, 0.62), Math.PI, 0.9);
      }
      if (fSleeve && w > 0.3) addTurret(true, lerp(fSleeve[0], fSleeve[1], 0.55), Math.PI, 0.8);

      // --- 5. Open X-braced structural truss bays ------------------------------------------
      function trussBay(isFore, pA, pB, nSeg) {
        if (pB - pA < 0.06) return;
        var corners = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
        var lift = s * 0.20;
        var pts = [], hullPts = [], i, k;
        for (i = 0; i <= nSeg; i++) {
          var p = lerp(pA, pB, i / nSeg);
          pts.push([]);
          hullPts.push([]);
          for (k = 0; k < 4; k++) {
            if (isClear(ctx, isFore, corners[k], p, 0.10)) {
              pts[i].push(surfXYZ(ctx, isFore, p, corners[k], lift));
              hullPts[i].push(surfXYZ(ctx, isFore, p, corners[k], 0));
            } else {
              pts[i].push(null);
              hullPts[i].push(null);
            }
          }
        }
        var rb = s * 0.030, rd = s * 0.016;
        for (i = 0; i <= nSeg; i++) {
          for (k = 0; k < 4; k++) {
            var a = pts[i][k], b = pts[i][(k + 1) % 4];
            if (a && b) seg(frameBox, a, b, rd * 1.2, rd * 1.2);
            if (a) {
              var jm = new T.Matrix4();
              jm.compose(a, new T.Quaternion(), new T.Vector3(s * 0.055, s * 0.055, s * 0.055));
              orangeBox.push(jm);
              if ((i === 0 || i === nSeg) && hullPts[i][k]) seg(frameCyl, hullPts[i][k], a, rd * 0.9);
            }
            if (i < nSeg) {
              var a1 = pts[i + 1][k];
              if (a && a1) seg(frameCyl, a, a1, rb);
              var b1 = pts[i + 1][(k + 1) % 4];
              if (a && b1) seg(frameCyl, a, b1, rd);
              if (b && a1) seg(frameCyl, b, a1, rd);
            }
          }
        }
      }
      if (aftBay) trussBay(false, aftBay[0], aftBay[1], 2);
      if (fSleeve && fEnd > 0.34) trussBay(true, lerp(fSleeve[0], fSleeve[1], 0.55), fEnd - 0.01, 2);

      // --- 6. Cross / Plus glowing radiator wings (independent of P.fins) ----------------
      if (w > 0.12 && aEnd > 0.12) {
        var scale = 0.35 + 0.65 * sstep(0.12, 0.55, w);
        var cand = [0, Math.PI / 4];
        var bestPsi = 0, bestBlocked = 99;
        cand.forEach(function (psi) {
          var nb = 0;
          for (var q = 0; q < 4; q++) {
            [0.16, 0.24, 0.32].forEach(function (pp) {
              if (!isClear(ctx, false, psi + q * Math.PI * 0.5, pp, 0.10)) nb++;
            });
          }
          if (nb < bestBlocked) {
            bestBlocked = nb;
            bestPsi = psi;
          }
        });

        var addWing = function (isFore, phiW, pA, pB, spanW, tag) {
          var chordP = pB - pA;
          var sp = isFore ? ctx.fwdSpan : aftSpan;
          var rootR = function (p) {
            var pt = isFore ? ctx.evalForePoint(p, phiW, 1.0) : ctx.evalAftSurf(p, phiW, 1.0);
            return Math.sqrt(pt.y * pt.y + pt.z * pt.z) * 0.96;
          };
          var xOf = function (p) { return isFore ? ctx.seamX + p * sp : ctx.seamX - p * sp; };
          var xa = xOf(pA), xb = xOf(pB);
          var ra = rootR(pA), rb2 = rootR(pB);
          var rTipBase = Math.max(ra, rb2);
          var rTip = rTipBase + spanW;
          var cy = Math.cos(phiW), sz = Math.sin(phiW);
          var V = function (x, r) { return new T.Vector3(x, r * cy, r * sz); };
          var xaT = lerp(xa, xb, 0.14), xbT = lerp(xb, xa, 0.14);
          var v00 = V(xa, ra), v10 = V(xb, rb2), v11 = V(xbT, rTip), v01 = V(xaT, rTip);

          // Glowing gridded radiator panel (hot root v=0 -> cool tip v=1)
          var pos = new Float32Array([
            v00.x, v00.y, v00.z, v10.x, v10.y, v10.z, v11.x, v11.y, v11.z, v01.x, v01.y, v01.z
          ]);
          var uv = new Float32Array([0, 0, 2, 0, 2, 1, 0, 1]);
          var g = new T.BufferGeometry();
          g.setAttribute('position', new T.BufferAttribute(pos, 3));
          g.setAttribute('uv', new T.BufferAttribute(uv, 2));
          g.setIndex([0, 1, 2, 0, 2, 3]);
          g.computeVertexNormals();
          var panel = new T.Mesh(g, radMat);
          grp.add(panel);

          var th = s * 0.028;
          seg(frameBox, v00, v10, th, th);
          seg(frameBox, v01, v11, th, th);
          seg(frameBox, v00, v01, th, th);
          seg(frameBox, v10, v11, th, th);
          var mA = v00.clone().lerp(v10, 0.5), mB = v01.clone().lerp(v11, 0.5);
          seg(frameBox, mA, mB, th * 0.8, th * 0.8);
          [0.33, 0.66].forEach(function (f) {
            seg(frameBox, v00.clone().lerp(v01, f), v10.clone().lerp(v11, f), th * 0.7, th * 0.7);
          });
          seg(frameCyl, v00, v11, th * 0.35);
          seg(frameCyl, v10, v01, th * 0.35);

          // Root stand-offs with orange corner markers; red navigation pips at the tip corners
          [v00, v10].forEach(function (rp) {
            var hp = rp.clone();
            var inward = new T.Vector3(0, -cy, -sz).multiplyScalar(s * 0.10);
            hp.add(inward);
            seg(frameCyl, rp, hp, th * 0.8);
            var om = new T.Matrix4();
            om.compose(rp, new T.Quaternion(), new T.Vector3(s * 0.06, s * 0.06, s * 0.06));
            orangeBox.push(om);
          });
          [v01, v11].forEach(function (tp) {
            var pm = new T.Matrix4();
            pm.compose(tp, new T.Quaternion(), new T.Vector3(s * 0.035, s * 0.035, s * 0.035));
            pips.push(pm);
          });
        };

        var chordA = Math.min(0.24, (s * (1.7 + 1.5 * w)) / Math.max(1, aftSpan));
        var pwA = 0.16, pwB = Math.min(aEnd, pwA + Math.max(0.11, chordA));
        var spanAft = s * (1.35 + 1.85 * w) * scale;
        for (var qa = 0; qa < 4; qa++) {
          var phiWing = bestPsi + qa * Math.PI * 0.5;
          var okW = [pwA, (pwA + pwB) * 0.5, pwB].every(function (pp) { return isClear(ctx, false, phiWing, pp, 0.06); });
          if (!okW) continue;
          addWing(false, phiWing, pwA, pwB, spanAft, 'aft');
        }
        if (fEnd > 0.16 && w > 0.2) {
          var pfA = 0.06, pfB = Math.min(fEnd, pfA + 0.10);
          for (var qf = 0; qf < 4; qf++) {
            addWing(true, bestPsi + Math.PI / 4 + qf * Math.PI * 0.5, pfA, pfB, spanAft * 0.42, 'fore');
          }
        }
      }

      // --- 7. Clean structural stern termination (no back-cone rocket nozzles; propulsion is
      // strictly outboard Conjoiner drive pods).
      if (aftBare > 0.88) {
        addRing(ctx, grp, false, 0.88, s * (0.032 + 0.014 * w), goldMat, s * 0.022);
      }

      var UCyl = function () { return new T.CylinderGeometry(1, 1, 1, 14); };
      var UBox = function () { return new T.BoxGeometry(1, 1, 1); };
      var UCyl8 = function () { return new T.CylinderGeometry(1, 1, 1, 8); };
      var domeG = new T.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
      safeCommit(ctx, UBox(), paleMat, paleBox, grp);
      safeCommit(ctx, UCyl(), paleMat, paleCyl, grp);
      safeCommit(ctx, UBox(), mliMat, mliBox, grp);
      safeCommit(ctx, UCyl(), mliMat, mliCyl, grp);
      safeCommit(ctx, UCyl(), goldMat, goldCyl, grp);
      safeCommit(ctx, UBox(), goldMat, goldBox, grp);
      safeCommit(ctx, UCyl(), darkMat, darkCyl, grp);
      safeCommit(ctx, UBox(), darkMat, darkBox, grp);
      safeCommit(ctx, domeG, domeMat, domes, grp);
      safeCommit(ctx, UCyl(), lensMat, lensCyl, grp);
      safeCommit(ctx, UBox(), frameMat, frameBox, grp);
      safeCommit(ctx, UCyl8(), frameMat, frameCyl, grp);
      safeCommit(ctx, UBox(), orangeMat, orangeBox, grp);
      safeCommit(ctx, new T.SphereGeometry(1, 8, 6), pipMat, pips, grp);

      ctx.rootGroup.add(grp);
    }
  };

  // ---------------------------------------------------------------------------
  // 4. DUNE BRUTALIST ISOLINE KIT (Carved Weathered Sandstone Isolines & Cave-Like Coffered Monolith)
  // ---------------------------------------------------------------------------
  function createDuneTextures(T) {
    // High-definition 1024x1024 tightly packed sedimentary topographic isoline strata & porous desert stone
    var W = 1024, H = 1024;
    var alb = makeCanvas(W, H), bmp = makeCanvas(W, H), cofA = makeCanvas(512, 512), cofB = makeCanvas(512, 512);
    if (!alb || !bmp || !cofA || !cofB) return null;
    var ga = alb.g, gb = bmp.g;
    var imgA = ga.createImageData(W, H);
    var imgB = gb.createImageData(W, H);
    var dA = imgA.data, dB = imgB.data;
    var TWO_PI = Math.PI * 2;
    for (var y = 0; y < H; y++) {
      var v = y / H;
      var tv = v * TWO_PI;
      for (var x = 0; x < W; x++) {
        var u = x / W;
        var tu = u * TWO_PI;
        // Multi-octave organic domain warp for flowing canyon-wall topographic isolines
        var wx = 0.24 * Math.sin(tv * 2.0 + Math.cos(tu * 2.0)) + 0.12 * Math.cos(tu * 3.0 - tv * 2.0) + 0.05 * Math.sin(tv * 5.0 - tu * 4.0);
        var wy = 0.22 * Math.cos(tu * 2.0 - Math.sin(tv * 3.0)) + 0.10 * Math.sin(tv * 4.0 + tu * 2.0) + 0.04 * Math.cos(tu * 6.0 + tv * 3.0);
        var su = tu + wx * TWO_PI * 0.26;
        var sv = tv + wy * TWO_PI * 0.26;
        var hField =
          0.40 * Math.sin(sv * 2.0 + 0.72 * Math.sin(su * 1.0)) +
          0.25 * Math.cos(su * 2.0 - sv * 1.0 + 0.55 * Math.cos(sv * 2.0)) +
          0.18 * Math.sin(sv * 4.0 + su * 2.0) +
          0.11 * Math.cos(su * 4.0 - sv * 3.0) +
          0.06 * Math.sin(su * 7.0 + sv * 5.0);
        // Tightly packed 22-band geological contour strata
        var levels = 22.0;
        var z = (hField * 0.5 + 0.5) * levels + v * 8.0;
        var band = Math.floor(z);
        var frac = z - band;
        // Deep eroded canyon undercut groove + sunlit sandstone ridge lip + smooth windswept terrace
        var groove = sstep(0.0, 0.22, frac) * (1.0 - 0.52 * sstep(0.84, 1.0, frac));
        var lip = sstep(0.18, 0.28, frac) * (1.0 - sstep(0.30, 0.44, frac));
        // Fine horizontal aeolian wind-erosion striations + porous sandstone grain
        var windRille = 0.065 * Math.sin(tv * 64.0 + su * 2.0);
        var nh = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        var grit = (nh - Math.floor(nh) - 0.5) * 16.0;
        var bandTint = ((band * 37) % 9) / 8.0;
        // Sun-bleached Arrakis desert sandstone / limestone ochre / rammed earth
        var baseR = lerp(186, 226, bandTint) + grit * 0.85;
        var baseG = lerp(150, 190, bandTint) + grit * 0.68;
        var baseB = lerp(104, 140, bandTint) + grit * 0.48;
        var shade = lerp(0.14, 1.04, groove) + lip * 0.22 + windRille;
        var idx = (y * W + x) * 4;
        dA[idx] = clamp(Math.round(baseR * shade), 0, 255);
        dA[idx + 1] = clamp(Math.round(baseG * shade), 0, 255);
        dA[idx + 2] = clamp(Math.round(baseB * shade), 0, 255);
        dA[idx + 3] = 255;
        var bv = clamp(Math.round(lerp(18, 218, groove) + lip * 36 + windRille * 40 + grit * 0.55), 0, 255);
        dB[idx] = bv;
        dB[idx + 1] = bv;
        dB[idx + 2] = bv;
        dB[idx + 3] = 255;
      }
    }
    ga.putImageData(imgA, 0, 0);
    gb.putImageData(imgB, 0, 0);

    // Deep subterranean cave-like brutalist coffered sandstone grid texture
    var CW = 512, CH = 512;
    var ca = cofA.g, cb = cofB.g;
    var r = fallbackMulberry32(74190);
    ca.fillStyle = '#c49b6c';
    ca.fillRect(0, 0, CW, CH);
    cb.fillStyle = '#d4d4d4';
    cb.fillRect(0, 0, CW, CH);
    var cell = 64;
    for (var cy = 0; cy < CH; cy += cell) {
      for (var cx = 0; cx < CW; cx += cell) {
        var tone = (r() - 0.5) * 18;
        ca.fillStyle = rgb(206 + tone, 164 + tone * 0.8, 114 + tone * 0.6);
        ca.fillRect(cx, cy, cell, cell);
        // Pitch-dark subterranean cavernous recess with stepped stone lintel shadow
        ca.fillStyle = '#18100a';
        ca.fillRect(cx + 11, cy + 11, cell - 22, cell - 22);
        ca.fillStyle = '#4d3722';
        ca.fillRect(cx + 11, cy + 11, cell - 22, 6);
        ca.fillRect(cx + 11, cy + 11, 5, cell - 22);
        if (r() < 0.22) {
          ca.fillStyle = '#d89b4c';
          ca.fillRect(cx + 18, cy + 29, cell - 36, 3);
        }
        cb.fillStyle = '#e6e6e6';
        cb.fillRect(cx, cy, cell, cell);
        cb.fillStyle = '#161616';
        cb.fillRect(cx + 11, cy + 11, cell - 22, cell - 22);
      }
    }
    return {
      albedo: finishTex(T, alb, true, 2, 2),
      bump: finishTex(T, bmp, false, 2, 2),
      cofferAlbedo: finishTex(T, cofA, true, 3, 2),
      cofferBump: finishTex(T, cofB, false, 3, 2)
    };
  }

  var duneKit = {
    id: 'dune',
    weightKey: 'styleDune',

    applyMaterials: function (ctx) {
      if (!ctx || !ctx.T || !ctx.P || !ctx.mats) return;
      var T = ctx.T;
      var st = kitState(ctx, 'dune', 'styleDune');
      if (st.w <= 0.02) return;
      var w = st.w, k = st.k;
      var mats = ctx.mats;
      var tex = getTex(T, 'dune', createDuneTextures);

      function sandstone(m, bumpAmt, tintHex) {
        if (!m) return;
        mixColor(T, m.color, (st.own && tex) ? 0xf5d6a6 : (tintHex || 0xd0a26c), k * 0.96);
        mixNum(m, 'metalness', 0.04, k * 0.94);
        mixNum(m, 'roughness', 0.88, k * 0.94);
        if (m.emissive) {
          mixColor(T, m.emissive, 0xc49256, k * 0.94);
          m.emissiveIntensity = lerp(m.emissiveIntensity || 0.0, 0.48, k);
        }
        if (st.own && tex) {
          m.map = tex.albedo;
          m.bumpMap = tex.bump;
          m.bumpScale = bumpAmt * w;
          m.emissiveMap = tex.albedo;
          m.roughnessMap = null;
          m.needsUpdate = true;
        }
      }
      sandstone(mats.hull, 0.58, 0xd0a26c);
      sandstone(mats.procHull, 0.64, 0xd0a26c);
      sandstone(mats.aftGothic, 0.56, 0xbc8c58);
      if (mats.aftGothic) mats.aftGothic.emissiveIntensity = lerp(mats.aftGothic.emissiveIntensity || 0.3, 0.46, k);

      [mats.dark, mats.obsidian].forEach(function (m) {
        if (!m) return;
        mixColor(T, m.color, 0x422d1a, k * 0.90);
        mixNum(m, 'metalness', 0.06, k * 0.88);
        mixNum(m, 'roughness', 0.90, k * 0.88);
        if (m.emissive) {
          mixColor(T, m.emissive, 0x26180c, k * 0.85);
          m.emissiveIntensity = lerp(m.emissiveIntensity || 0, 0.20, k);
        }
        if (st.own && tex) {
          m.map = tex.albedo;
          m.bumpMap = tex.bump;
          m.bumpScale = 0.34 * w;
          m.emissiveMap = tex.albedo;
          m.needsUpdate = true;
        }
      });
      if (mats.trim) {
        mixColor(T, mats.trim.color, 0xe4c698, k * 0.92);
        mixNum(mats.trim, 'metalness', 0.06, k * 0.90);
        mixNum(mats.trim, 'roughness', 0.84, k * 0.90);
        if (mats.trim.emissive) mixColor(T, mats.trim.emissive, 0x281a0c, k * 0.8);
      }
      if (mats.collar) {
        mixColor(T, mats.collar.color, 0x765636, k * 0.88);
        mixNum(mats.collar, 'metalness', 0.06, k * 0.86);
        mixNum(mats.collar, 'roughness', 0.86, k * 0.86);
        if (mats.collar.emissive) mixColor(T, mats.collar.emissive, 0xffbe66, k * 0.75);
      }
      if (mats.cryo) {
        mixColor(T, mats.cryo.color, 0xc2a072, k * 0.65);
        mixNum(mats.cryo, 'roughness', 0.80, k * 0.7);
      }
      if (mats.amberLight && mats.amberLight.color) mixColor(T, mats.amberLight.color, 0xffc670, k * 0.7);
      if (mats.cyanGlow && mats.cyanGlow.color) mixColor(T, mats.cyanGlow.color, 0x9ce2f0, k * 0.35);
      [mats.ice, mats.iceProc].forEach(function (m) {
        if (!m) return;
        mixColor(T, m.color, 0xf2f7fc, k * 0.18);
      });
    },

    buildGeometry: function (ctx) {
      if (!ctx || !ctx.T || !ctx.P || !ctx.rootGroup) return;
      var st = kitState(ctx, 'dune', 'styleDune');
      var w = st.w;
      if (w <= 0.02) return;

      var T = ctx.T;
      var track = tracker(ctx);
      var tex = getTex(T, 'dune', createDuneTextures);
      var rng = makeRng(ctx, 0x44554e45);
      var detail = clamp(ctx.detailScale != null ? ctx.detailScale : 1, 0.4, 1.2);
      var s = Math.min(ctx.rySeam, ctx.rzSeam);
      var fullR = Math.sqrt(ctx.rySeam * ctx.rySeam + ctx.rzSeam * ctx.rzSeam);
      var aftSpan = ctx.aftSpan;
      var grp = new T.Group();
      grp.name = 'Style_Dune_Brutalist';

      var stoneMat = track(new T.MeshStandardMaterial({
        color: tex ? 0xf5d6a6 : 0xd0a26c,
        map: tex ? tex.albedo : null,
        bumpMap: tex ? tex.bump : null,
        bumpScale: 0.64 * w,
        emissive: new T.Color(0xc49256),
        emissiveMap: tex ? tex.albedo : null,
        emissiveIntensity: 0.48,
        metalness: 0.04,
        roughness: 0.88,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      }));
      var cofferStoneMat = track(new T.MeshStandardMaterial({
        color: tex ? 0xe8c89a : 0xbc905e,
        map: tex ? tex.cofferAlbedo : null,
        bumpMap: tex ? tex.cofferBump : null,
        bumpScale: 0.56 * w,
        emissive: new T.Color(0x9a7040),
        emissiveMap: tex ? tex.cofferAlbedo : null,
        emissiveIntensity: 0.42,
        metalness: 0.04,
        roughness: 0.88,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      }));
      var deepShadowMat = track(new T.MeshStandardMaterial({
        color: 0x181008,
        emissive: new T.Color(0x0a0603),
        emissiveIntensity: 0.14,
        metalness: 0.04,
        roughness: 0.94
      }));
      var slitGlowMat = track(new T.MeshBasicMaterial({ color: 0xffc670 }));

      var aftMinBare = bareMin(ctx, false);
      var foreMinBare = bareMin(ctx, true);
      var stoneBoxes = [], shadowBoxes = [], slitBoxes = [];

      function localS(fr) {
        var loc = Math.sqrt(fr.pt.y * fr.pt.y + fr.pt.z * fr.pt.z) / Math.max(1e-3, fullR);
        return s * clamp(loc * 1.15, 0.42, 1.15);
      }

      // --- 1. Midship Brutalist Coffered Waffle Lattice & Cave-Like Horizontal Ingresses -----
      var cofStart = 0.015;
      var cofEnd = Math.min(0.30, aftMinBare - 0.05);
      if (cofEnd - cofStart > 0.09) {
        var coreGeo = buildPatch(ctx, false, cofStart, cofEnd, 0, Math.PI * 2, 6, 48,
          function () { return s * 0.020; }, [3, 6]);
        grp.add(new T.Mesh(coreGeo, cofferStoneMat));

        // 8 heavy carved-sandstone slab rings forming deep subterranean horizontal gallery bays
        var nRings = Math.max(6, Math.round((6 + 3 * w) * detail));
        for (var ri = 0; ri < nRings; ri++) {
          var tr = lerp(cofStart, cofEnd, ri / Math.max(1, nRings - 1));
          var isEnd = (ri === 0 || ri === nRings - 1);
          var rThick = s * (isEnd ? 0.062 : 0.038) * (0.72 + 0.35 * w);
          addRing(ctx, grp, false, tr, rThick, stoneMat, s * (isEnd ? 0.095 : 0.080));
        }

        // 24 deep brutalist axial rib piers carving square cavernous coffers around 360 deg
        var nPiers = Math.max(16, Math.round((18 + 6 * w) * detail));
        var cofLen = (cofEnd - cofStart) * aftSpan;
        var tMidC = 0.5 * (cofStart + cofEnd);
        for (var pi = 0; pi < nPiers; pi++) {
          var phiP = (pi / nPiers) * Math.PI * 2;
          if (!isClear(ctx, false, phiP, tMidC, 0.11)) continue;
          var frP = ctx.evalSurfaceFrame(false, tMidC, phiP, 0.996);
          var slP = localS(frP);
          var ribH = slP * (0.105 + 0.060 * w);
          var ribW = slP * 0.066;
          ctx.pushFramed(stoneBoxes, frP, cofLen * 1.02, ribH, ribW, ribH * 0.52, 0, 0);
          // Deep pitch-dark cave-like subterranean well + narrow recessed horizontal slot aperture
          var phiGap = phiP + Math.PI / nPiers;
          if (isClear(ctx, false, phiGap, tMidC, 0.08)) {
            var frG = ctx.evalSurfaceFrame(false, tMidC, phiGap, 0.996);
            ctx.pushFramed(shadowBoxes, frG, cofLen * 0.86, slP * 0.042, slP * 0.14, slP * 0.028, 0, 0);
            if (pi % 2 === 0 && rng() < 0.52) {
              ctx.pushFramed(slitBoxes, frG, cofLen * 0.24, slP * 0.015, slP * 0.078, slP * 0.052, (rng() - 0.5) * cofLen * 0.45, 0);
            }
          }
        }
      }

      // --- 2. High-Resolution 3D Sculpted Sedimentary Topographic Isoline Strata -------------
      // Flowing geological rock contour shelves wrapping across the waist, spar roots & stern taper!
      var isoStart = Math.max(cofEnd - 0.015, 0.26);
      var isoEnd = Math.min(0.96, aftMinBare - 0.02);
      if (isoEnd - isoStart > 0.12) {
        var nU = Math.max(36, Math.round(52 * detail));
        var nV = Math.max(48, Math.round(64 * detail));
        var isoGeo = buildPatch(ctx, false, isoStart, isoEnd, 0, Math.PI * 2, nU, nV,
          function (a, b, rad, p, phi) {
            var env = Math.sin(clamp(a, 0, 1) * Math.PI);
            // Flowing wind-carved geological contour topography wrapping organically around the waist & stern
            var warp = 0.54 * Math.sin(phi * 3.0 + a * 5.8) + 0.34 * Math.cos(phi * 5.0 - a * 8.4) + 0.20 * Math.sin(phi * 2.0 + a * 12.5);
            var h = a * 15.5 + warp * (0.72 + 0.35 * env);
            var band = Math.floor(h);
            var f = h - band;
            // Dramatic stepped rock isoline shelf: deep eroded undercut + smooth windswept plateau
            var step = sstep(0.06, 0.28, f) * (1.0 - 0.24 * sstep(0.84, 1.0, f));
            var swell = 0.05 + 0.16 * Math.exp(-Math.pow((a - 0.12) / 0.22, 2));
            return s * (0.024 + (swell + 0.11 * step) * (0.44 + 0.56 * env) * (0.58 + 0.42 * w));
          }, [3, 4]);
        grp.add(new T.Mesh(isoGeo, stoneMat));

        // Concentric carved monolithic sedimentary terrace rings + recessed cave slot ingresses
        var nTerr = Math.max(7, Math.round(9 * detail));
        for (var ti2 = 0; ti2 < nTerr; ti2++) {
          var fTerr = (ti2 + 0.5) / nTerr;
          var tTerr = lerp(isoStart + 0.04, isoEnd - 0.04, fTerr);
          addRing(ctx, grp, false, tTerr, s * lerp(0.056, 0.022, fTerr) * w, stoneMat, s * lerp(0.058, 0.024, fTerr));
          if (ti2 < nTerr - 2 && ti2 % 2 === 0) {
            for (var sSlot = 0; sSlot < 4; sSlot++) {
              var phiSlot = sSlot * Math.PI * 0.5 + 0.38;
              if (!isClear(ctx, false, phiSlot, tTerr, 0.10)) continue;
              var frSl = ctx.evalSurfaceFrame(false, tTerr, phiSlot, 0.996);
              var slS = localS(frSl);
              ctx.pushFramed(shadowBoxes, frSl, slS * 0.16, slS * 0.048, slS * 0.36, slS * 0.052, 0, 0);
            }
          }
        }
      }

      // --- 3. Sculpted Carved-Rock Pylon Root Buttress Fillets -------------------------------
      var rolls = ctx.rollAngles || [0, Math.PI];
      rolls.forEach(function (rPhi) {
        var phiPylon = rPhi + Math.PI * 0.5;
        var pRoot = clamp(0.28, cofStart + 0.04, Math.max(0.32, isoStart + 0.08));
        if (pRoot > aftMinBare - 0.06) return;
        var frR = ctx.evalSurfaceFrame(false, pRoot, phiPylon, 0.996);
        var slR = localS(frR);
        // Stepped monolithic sandstone saddle hugging each engine spar root
        ctx.pushFramed(stoneBoxes, frR, slR * 0.95, slR * 0.14, slR * 0.42, slR * 0.08, 0, 0);
        ctx.pushFramed(stoneBoxes, frR, slR * 0.68, slR * 0.18, slR * 0.28, slR * 0.16, 0, 0);
      });

      // Narrow carved sandstone collar ahead of seam if forward hull is exposed
      if (foreMinBare > 0.08) {
        var fEndD = Math.min(0.22, foreMinBare - 0.02);
        var fIso = buildPatch(ctx, true, 0.015, fEndD, 0, Math.PI * 2, 10, 40,
          function (a, b, rad, p, phi) {
            var h = a * 4.5 + 0.35 * Math.sin(phi * 3.0 + a * 4.0);
            var step = sstep(0.10, 0.35, h - Math.floor(h));
            return s * (0.02 + 0.045 * step * Math.sin(a * Math.PI)) * w;
          }, [1.5, 3]);
        grp.add(new T.Mesh(fIso, stoneMat));
      }

      safeCommit(ctx, new T.BoxGeometry(1, 1, 1), stoneMat, stoneBoxes, grp);
      safeCommit(ctx, new T.BoxGeometry(1, 1, 1), deepShadowMat, shadowBoxes, grp);
      safeCommit(ctx, new T.BoxGeometry(1, 1, 1), slitGlowMat, slitBoxes, grp);

      ctx.rootGroup.add(grp);
    }
  };

  // ---------------------------------------------------------------------------
  // 5. GOTHIC CATHEDRAL KIT (P.styleCathedral 0..1)
  //    Dark grayish cast concrete, intricate crocketed High-Gothic spires,
  //    pointed wimperg gables, openwork flying buttresses & rose tracery -- 100% AXIALLY ALIGNED (+X)!
  // ---------------------------------------------------------------------------
  function createCathedralConcreteTextures(T) {
    var W = 1024, H = 1024, CW = 32, CH = 48;
    var alb = makeCanvas(W, H), bmp = makeCanvas(W, H), glw = makeCanvas(W, H);
    var chA = makeCanvas(512, 512), chB = makeCanvas(512, 512);
    var rose = makeCanvas(512, 512), lan = makeCanvas(64, 128);
    if (!alb || !bmp || !glw || !chA || !chB || !rose || !lan) return null;
    var ga = alb.g, gb = bmp.g, ge = glw.g;
    var gca = chA.g, gcb = chB.g;
    var r = fallbackMulberry32(71489);
    var i, row, col;

    // 1. Monolithic dark grayish board-formed architectural concrete (high-density ashlar courses for km-scale)
    gca.fillStyle = '#757370';
    gca.fillRect(0, 0, 512, 512);
    gcb.fillStyle = '#848484';
    gcb.fillRect(0, 0, 512, 512);
    for (row = 0; row < 32; row++) {
      var ry = row * 16;
      var vTone = (row % 8 === 0) ? 136 : 114 + (r() - 0.5) * 14;
      gca.fillStyle = rgb(vTone + 2, vTone, vTone - 3);
      gca.fillRect(0, ry, 512, 15);
      gca.fillStyle = '#2c2b2a';
      gca.fillRect(0, ry + 15, 512, 1);
      gcb.fillStyle = row % 8 === 0 ? '#d8d8d8' : '#969696';
      gcb.fillRect(0, ry, 512, 15);
      gcb.fillStyle = '#181818';
      gcb.fillRect(0, ry + 15, 512, 1);
      var off = (row % 2) * 16;
      for (col = 0; col < 16; col++) {
        var rx = (col * 32 + off) % 512;
        var dt = (r() - 0.5) * 16;
        gca.fillStyle = rgb(120 + dt, 118 + dt, 114 + dt);
        gca.fillRect(rx + 1, ry + 1, 30, 13);
        gca.fillStyle = '#363534';
        gca.fillRect(rx, ry, 1, 15);
        gcb.fillStyle = '#282828';
        gcb.fillRect(rx, ry, 1, 15);
      }
    }
    // Chiseled pale ash-concrete Gothic stringcourse moldings
    for (row = 0; row < 8; row++) {
      var by = row * 64;
      gca.fillStyle = '#b4b1ab';
      gca.fillRect(0, by, 512, 3);
      gca.fillStyle = '#242322';
      gca.fillRect(0, by + 3, 512, 2);
      gcb.fillStyle = '#f2f2f2';
      gcb.fillRect(0, by, 512, 3);
      gcb.fillStyle = '#101010';
      gcb.fillRect(0, by + 3, 512, 2);
    }
    for (i = 0; i < 7500; i++) {
      var cx0 = r() * 512, cy0 = r() * 512;
      gca.fillStyle = r() < 0.5 ? 'rgba(218,215,210,0.08)' : 'rgba(24,23,22,0.13)';
      gca.fillRect(cx0, cy0, 1 + r() * 2, 1 + r() * 2);
    }

    // 2. Micro-scaled multi-kilometer High-Gothic concrete nave arcades (32x21 = 672 fine stories/bays per tile!)
    ga.fillStyle = '#62605d';
    ga.fillRect(0, 0, W, H);
    gb.fillStyle = '#808080';
    gb.fillRect(0, 0, W, H);
    ge.fillStyle = '#000000';
    ge.fillRect(0, 0, W, H);
    for (i = 0; i < 12000; i++) {
      var nx = r() * W, ny = r() * H;
      ga.fillStyle = r() < 0.5 ? 'rgba(212,209,204,0.07)' : 'rgba(20,19,19,0.13)';
      ga.fillRect(nx, ny, 1.5 + r() * 2, 1 + r() * 2);
    }

    var CATH_GLASS = ['#ffbe55', '#ffd784', '#ff7d38', '#d63d34', '#5c8dff', '#58c9b8', '#ffe4ad', '#b86bff'];
    var cols = Math.floor(W / CW), rows = Math.floor(H / CH);
    for (var cj = 0; cj < rows; cj++) {
      // Fine carved concrete cornice drip-moldings
      ga.fillStyle = '#a29f99';
      ga.fillRect(0, cj * CH, W, 3);
      ga.fillStyle = '#201f1e';
      ga.fillRect(0, cj * CH + 3, W, 2);
      gb.fillStyle = '#f0f0f0';
      gb.fillRect(0, cj * CH, W, 3);
      gb.fillStyle = '#121212';
      gb.fillRect(0, cj * CH + 3, W, 2);

      for (var ci = 0; ci < cols; ci++) {
        var x0 = ci * CW, y0 = cj * CH;
        // Slender clustered Gothic compound pier
        ga.fillStyle = '#827f7a';
        ga.fillRect(x0, y0, 5, CH);
        ga.fillStyle = '#adaaa4';
        ga.fillRect(x0 + 1, y0, 1, CH);
        ga.fillStyle = '#242322';
        ga.fillRect(x0 + 4, y0, 1, CH);
        gb.fillStyle = '#e2e2e2';
        gb.fillRect(x0, y0, 5, CH);

        // Triple micro-pointed Gothic traceried lancets per bay for monumental km-scale depth
        for (var sub = 0; sub < 3; sub++) {
          var ax = x0 + 6 + sub * 8, ay = y0 + 7, aw = 6, ah = CH - 22;
          archPath(ga, ax, ay, aw, ah);
          ga.fillStyle = '#1a1918';
          ga.fill();
          ga.strokeStyle = '#a4a19b';
          ga.lineWidth = 0.9;
          ga.stroke();
          archPath(gb, ax, ay, aw, ah);
          gb.fillStyle = '#0c0c0c';
          gb.fill();
          gb.strokeStyle = '#e6e6e6';
          gb.lineWidth = 0.9;
          gb.stroke();

          // Slender center mullion & pinpoint stained-glass panes
          ga.fillStyle = '#787570';
          ga.fillRect(ax + aw * 0.5 - 0.5, ay + 5, 1, ah - 6);
          for (var tr = 0; tr < 3; tr++) {
            var ty = ay + 6 + tr * 6;
            if (r() < 0.34) {
              var gc = CATH_GLASS[Math.floor(r() * CATH_GLASS.length)];
              ge.fillStyle = gc;
              ge.fillRect(ax + 1, ty, 2, 4);
              if (r() < 0.72) ge.fillRect(ax + 3.5, ty, 1.8, 4);
              ga.fillStyle = 'rgba(235,216,178,0.18)';
              ga.fillRect(ax + 1, ty, aw - 2, 4);
            }
          }
        }

        // Delicate ribbed groin-vault spandrel band under each micro-arcade
        var vx = x0 + 6, vy = y0 + CH - 13, vw = CW - 8, vh = 10;
        ga.fillStyle = '#2a2927';
        ga.fillRect(vx, vy, vw, vh);
        gb.fillStyle = '#202020';
        gb.fillRect(vx, vy, vw, vh);
        ga.strokeStyle = '#aea9a2';
        ga.lineWidth = 1.2;
        gb.strokeStyle = '#ececec';
        gb.lineWidth = 1.3;
        ga.beginPath();
        ga.moveTo(vx, vy);
        ga.lineTo(vx + vw, vy + vh);
        ga.moveTo(vx + vw, vy);
        ga.lineTo(vx, vy + vh);
        ga.stroke();
        gb.beginPath();
        gb.moveTo(vx, vy);
        gb.lineTo(vx + vw, vy + vh);
        gb.moveTo(vx + vw, vy);
        gb.lineTo(vx, vy + vh);
        gb.stroke();
      }
    }
    // Weathered vertical concrete rain-runoff streaks
    for (i = 0; i < 110; i++) {
      var sx2 = r() * W, sh2 = 55 + r() * 210, sw2 = 1.5 + r() * 6;
      var sg = ga.createLinearGradient(0, 0, 0, sh2);
      sg.addColorStop(0, 'rgba(16,18,24,0.0)');
      sg.addColorStop(0.4, 'rgba(16,18,24,0.28)');
      sg.addColorStop(1, 'rgba(16,18,24,0.0)');
      ga.save();
      ga.translate(sx2, r() * (H - sh2));
      ga.fillStyle = sg;
      ga.fillRect(0, 0, sw2, sh2);
      ga.restore();
    }

    // 3. High-Resolution 512x512 Chartres/Notre-Dame Stained-Glass Rose Window (sapphire, ruby, gold, emerald, violet)
    var gr = rose.g;
    gr.fillStyle = '#0a0a0d';
    gr.fillRect(0, 0, 512, 512);
    var cx = 256, cy = 256;
    var ROSE_OUTER = ['#2b5eff', '#e33b42', '#ffbc42', '#39c6a3', '#8c52ff', '#ff7b38'];
    var ROSE_INNER = ['#ffe084', '#ff595e', '#4895ef', '#ffd166', '#b565ff', '#52e5c2'];

    // Outer 24-petal radiating stained-glass wheel
    var nOut = 24;
    for (var po = 0; po < nOut; po++) {
      var a0 = (po / nOut) * Math.PI * 2, a1 = ((po + 1) / nOut) * Math.PI * 2;
      var am = 0.5 * (a0 + a1);
      gr.fillStyle = ROSE_OUTER[po % ROSE_OUTER.length];
      gr.beginPath();
      gr.moveTo(cx, cy);
      gr.arc(cx, cy, 240, a0, a1);
      gr.closePath();
      gr.fill();
      // Circular outer quatrefoil jewel medallions
      gr.fillStyle = ROSE_INNER[(po * 2 + 1) % ROSE_INNER.length];
      gr.beginPath();
      gr.arc(cx + Math.cos(am) * 194, cy + Math.sin(am) * 194, 21, 0, Math.PI * 2);
      gr.fill();
      gr.strokeStyle = '#181a20';
      gr.lineWidth = 4;
      gr.stroke();
    }
    // Middle 12-petal trefoil lancet arcade
    var nMid = 12;
    for (var pm = 0; pm < nMid; pm++) {
      var m0 = (pm / nMid) * Math.PI * 2, m1 = ((pm + 1) / nMid) * Math.PI * 2;
      var mm = 0.5 * (m0 + m1);
      gr.fillStyle = ROSE_INNER[pm % ROSE_INNER.length];
      gr.beginPath();
      gr.moveTo(cx, cy);
      gr.arc(cx, cy, 146, m0, m1);
      gr.closePath();
      gr.fill();
      gr.fillStyle = ROSE_OUTER[(pm + 2) % ROSE_OUTER.length];
      gr.beginPath();
      gr.arc(cx + Math.cos(mm) * 106, cy + Math.sin(mm) * 106, 20, 0, Math.PI * 2);
      gr.fill();
    }
    // Heavy carved concrete stone tracery spokes & concentric mullions
    gr.strokeStyle = '#191b22';
    gr.lineWidth = 6.5;
    for (po = 0; po < nOut; po++) {
      var ao = (po / nOut) * Math.PI * 2;
      gr.beginPath();
      gr.moveTo(cx + Math.cos(ao) * 44, cy + Math.sin(ao) * 44);
      gr.lineTo(cx + Math.cos(ao) * 246, cy + Math.sin(ao) * 246);
      gr.stroke();
    }
    gr.lineWidth = 9.0;
    for (pm = 0; pm < nMid; pm++) {
      var am2 = (pm / nMid) * Math.PI * 2;
      gr.beginPath();
      gr.moveTo(cx, cy);
      gr.lineTo(cx + Math.cos(am2) * 246, cy + Math.sin(am2) * 246);
      gr.stroke();
    }
    [44, 86, 146, 168, 224, 244].forEach(function (rad, idx) {
      gr.strokeStyle = idx === 2 || idx === 5 ? '#15171c' : '#23262e';
      gr.lineWidth = idx === 2 || idx === 5 ? 10 : 6;
      gr.beginPath();
      gr.arc(cx, cy, rad, 0, Math.PI * 2);
      gr.stroke();
    });
    // Fine bright stone edge highlight inside tracery rings
    gr.strokeStyle = 'rgba(180,176,170,0.45)';
    gr.lineWidth = 2;
    [86, 146, 224].forEach(function (rad) {
      gr.beginPath();
      gr.arc(cx, cy, rad, 0, Math.PI * 2);
      gr.stroke();
    });
    // Radiant golden-ivory sanctuary center rosette
    gr.fillStyle = '#fff0c4';
    gr.beginPath();
    gr.arc(cx, cy, 34, 0, Math.PI * 2);
    gr.fill();
    gr.strokeStyle = '#181a20';
    gr.lineWidth = 5;
    gr.stroke();
    gr.fillStyle = '#ff9838';
    gr.beginPath();
    gr.arc(cx, cy, 14, 0, Math.PI * 2);
    gr.fill();

    // 4. Fine multi-story stained-glass lancet texture (delicate leaded panes, varied jewel/candlelight glow)
    var gl = lan.g;
    gl.fillStyle = '#0c0d10';
    gl.fillRect(0, 0, 64, 128);
    var LAN_GLASS = ['#ffb84d', '#ffd685', '#ff7b3b', '#cf3c36', '#4f82ff', '#48b8a8', '#2a241c', '#181920'];
    for (var ly = 0; ly < 128; ly += 8) {
      for (var lx = 0; lx < 64; lx += 6) {
        // Leave ~28% panes dim/dark so lancets read as intricate multi-deck interiors, never solid yellow bars
        var pick = r() < 0.28 ? '#17191f' : LAN_GLASS[Math.floor(r() * 6)];
        gl.fillStyle = pick;
        gl.fillRect(lx + 1, ly + 1, 4, 6);
      }
    }
    // Crisp stone mullions & transom bars splitting the lancet into many fine decks
    gl.fillStyle = '#16181e';
    gl.fillRect(29, 0, 6, 128);
    gl.fillRect(14, 0, 2, 128);
    gl.fillRect(48, 0, 2, 128);
    for (var lt = 16; lt < 128; lt += 16) gl.fillRect(0, lt, 64, 3);

    return {
      albedo: finishTex(T, alb, true, 8, 6),
      bump: finishTex(T, bmp, false, 8, 6),
      glow: finishTex(T, glw, true, 8, 6),
      concreteHull: finishTex(T, chA, true, 4, 4),
      concreteBump: finishTex(T, chB, false, 4, 4),
      rose: finishTex(T, rose, true),
      lancet: finishTex(T, lan, true)
    };
  }

  // ---------------------------------------------------------------------------
  // Cathedral geometry factories (all authored in ship space: +X forward / spire apex, +Y outward normal)
  // ---------------------------------------------------------------------------
  var CATH_TAU = Math.PI * 2;
  // Aspect ratio (height : width) of the slender multi-km twin-lancet tracery windows
  var CATH_WIN_AR = 4.6;

  // Flat plates are authored x = width, y = height (apex +y), z = extrusion; remap to ship frame:
  // height -> +X (apex forward), width -> Z, thickness -> +Y (outward normal). Pure cyclic permutation (det +1).
  function cathAxialPlate(T, g) {
    g.applyMatrix4(new T.Matrix4().makeBasis(new T.Vector3(0, 0, 1), new T.Vector3(1, 0, 0), new T.Vector3(0, 1, 0)));
    return g;
  }

  // Pointed (ogival) lancet outline on a Shape/Path: centre cx, half-width hw, sill y0, springline ySp, apex yTop.
  function cathOgive(p, cx, hw, y0, ySp, yTop, k) {
    var kk = k != null ? k : 0.30;
    p.moveTo(cx - hw, y0);
    p.lineTo(cx - hw, ySp);
    p.quadraticCurveTo(cx - hw, ySp + (yTop - ySp) * kk, cx, yTop);
    p.quadraticCurveTo(cx + hw, ySp + (yTop - ySp) * kk, cx + hw, ySp);
    p.lineTo(cx + hw, y0);
    p.closePath();
    return p;
  }

  // Merge transformed copies of small geometries into one static BufferGeometry (one draw call).
  // parts: [{ g: BufferGeometry, m: Matrix4 }]. Source geometries are left untouched.
  function cathMergeParts(T, parts) {
    var datas = [], total = 0, i, j;
    for (i = 0; i < parts.length; i++) {
      var g = parts[i].g.index ? parts[i].g.toNonIndexed() : parts[i].g.clone();
      if (parts[i].m) g.applyMatrix4(parts[i].m);
      datas.push(g);
      total += g.attributes.position.count;
    }
    var P = new Float32Array(total * 3), N = new Float32Array(total * 3), UV = new Float32Array(total * 2);
    var o = 0;
    for (i = 0; i < datas.length; i++) {
      var d = datas[i];
      var pa = d.attributes.position.array;
      var na = d.attributes.normal ? d.attributes.normal.array : null;
      var ua = d.attributes.uv ? d.attributes.uv.array : null;
      var nv = d.attributes.position.count;
      for (j = 0; j < nv * 3; j++) {
        P[o * 3 + j] = pa[j];
        N[o * 3 + j] = na ? na[j] : 0;
      }
      if (ua) for (j = 0; j < nv * 2; j++) UV[o * 2 + j] = ua[j];
      o += nv;
      d.dispose();
    }
    var out = new T.BufferGeometry();
    out.setAttribute('position', new T.BufferAttribute(P, 3));
    out.setAttribute('normal', new T.BufferAttribute(N, 3));
    out.setAttribute('uv', new T.BufferAttribute(UV, 2));
    return out;
  }

  // Watertight closed razor-slender High-Gothic crocketed fleche (axis +Y, 0..1; base at y=0).
  // Stepped plinth -> slim belfry shaft with three gallery cornices -> long concave needle studded with
  // crocket spines on its four corner arrises -> fleur finial closing to a hair-thin apex.
  function makeCathedralSpireGeo(T) {
    var NU = 38, NV = 12;
    var pos = [], uv = [], idx = [];
    for (var iu = 0; iu <= NU; iu++) {
      var h = iu / NU;
      var baseR, crk = 0;
      if (h < 0.012) {
        baseR = lerp(0.30, 1.05, h / 0.012);
      } else if (h < 0.04) {
        baseR = lerp(1.05, 0.80, (h - 0.012) / 0.028);
      } else if (h < 0.20) {
        var hb = (h - 0.04) / 0.16;
        var cornice =
          0.14 * Math.exp(-Math.pow((hb - 0.10) / 0.06, 2)) +
          0.12 * Math.exp(-Math.pow((hb - 0.55) / 0.055, 2)) +
          0.16 * Math.exp(-Math.pow((hb - 0.97) / 0.055, 2));
        baseR = lerp(0.76, 0.52, hb) + cornice;
      } else if (h < 0.935) {
        var hs = (h - 0.20) / 0.735;
        baseR = Math.max(0.028, 0.52 * Math.pow(Math.max(0, 1 - hs), 1.22));
        crk = Math.pow(Math.max(0, Math.sin(hs * Math.PI * 13.0)), 3) * (1 - hs * 0.55) * 0.85;
      } else {
        var hf = (h - 0.935) / 0.065;
        baseR = Math.max(0.003, 0.028 * (1 - hf)) + 0.020 * Math.exp(-Math.pow((hf - 0.35) / 0.18, 2));
      }
      for (var iv = 0; iv <= NV; iv++) {
        var phi = (iv / NV) * CATH_TAU;
        var flute = 0.10 * Math.cos(8 * phi) * (0.35 + 0.65 * (1 - h));
        var arris = 0.12 * Math.cos(4 * phi) * (1 - h);
        var corner = Math.pow(Math.max(0, Math.cos(4 * phi)), 2);
        var rad = Math.max(0.003, baseR * (1.0 + flute + arris + crk * corner));
        pos.push(rad * Math.cos(phi), h, rad * Math.sin(phi));
        uv.push((iv / NV) * 1.5, h * 6.0);
      }
    }
    var cols = NV + 1;
    // Outward winding: (c-a) x (b-a) = (+cos(phi), 0, +sin(phi)) -> strictly outward normals
    for (var i = 0; i < NU; i++) {
      for (var j = 0; j < NV; j++) {
        var a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    var botC = pos.length / 3;
    pos.push(0, 0, 0);
    uv.push(0.5, 0.5);
    for (var jb = 0; jb < NV; jb++) idx.push(botC, jb, jb + 1);
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('uv', new T.BufferAttribute(new Float32Array(uv), 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // Razor-slender secondary crocket pinnacle (axis +Y, 0..1; closed bottom)
  function makeCathedralPinnacleGeo(T) {
    var NU = 24, NV = 8;
    var pos = [], uv = [], idx = [];
    for (var iu = 0; iu <= NU; iu++) {
      var h = iu / NU;
      var collar = 0.16 * Math.exp(-Math.pow((h - 0.22) / 0.05, 2));
      var knop = 0.060 * Math.exp(-Math.pow((h - 0.91) / 0.035, 2));
      var baseR = h < 0.22
        ? lerp(0.84, 0.56, h / 0.22)
        : Math.max(0.004, 0.50 * Math.pow(Math.max(0, 1 - (h - 0.22) / 0.78), 1.55));
      var crock = h > 0.28 && h < 0.88 ? Math.pow(Math.max(0, Math.sin(h * Math.PI * 12.0)), 3) * 0.7 : 0;
      for (var iv = 0; iv <= NV; iv++) {
        var phi = (iv / NV) * CATH_TAU;
        var corner = Math.pow(Math.max(0, Math.cos(4 * phi)), 2);
        var rad = Math.max(0.004, (baseR + collar + knop) * (1.0 + 0.10 * Math.cos(4 * phi) * (1 - 0.45 * h) + crock * corner));
        pos.push(rad * Math.cos(phi), h, rad * Math.sin(phi));
        uv.push(iv / NV, h * 3.0);
      }
    }
    var cols = NV + 1;
    for (var i = 0; i < NU; i++) {
      for (var j = 0; j < NV; j++) {
        var a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    var botC = pos.length / 3;
    pos.push(0, 0, 0);
    uv.push(0.5, 0.5);
    for (var jb = 0; jb < NV; jb++) idx.push(botC, jb, jb + 1);
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('uv', new T.BufferAttribute(new Float32Array(uv), 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // Sculpted 3D Pointed Gothic Wimperg / Ogival Arch Gable Flourish (peaks along +X in local framed space)
  function makeCathedralGableGeo(T) {
    // Shape in XY (X = axial forward peak, Y = tangential width), extruded radially along Z then mapped to framed coords
    var s = new T.Shape();
    s.moveTo(-0.48, -0.48);
    s.lineTo(-0.08, -0.48);
    s.lineTo(0.14, -0.34);
    s.lineTo(0.18, -0.37);
    s.lineTo(0.36, -0.20);
    s.lineTo(0.40, -0.23);
    s.lineTo(0.60, 0.0);
    s.lineTo(0.40, 0.23);
    s.lineTo(0.36, 0.20);
    s.lineTo(0.18, 0.37);
    s.lineTo(0.14, 0.34);
    s.lineTo(-0.08, 0.48);
    s.lineTo(-0.48, 0.48);
    s.closePath();
    // Pointed ogival lancet cutout inside the concrete gable frame
    var hole = new T.Path();
    hole.moveTo(-0.44, -0.27);
    hole.lineTo(-0.06, -0.27);
    hole.quadraticCurveTo(0.16, -0.21, 0.30, 0.0);
    hole.quadraticCurveTo(0.16, 0.21, -0.06, 0.27);
    hole.lineTo(-0.44, 0.27);
    hole.closePath();
    s.holes.push(hole);
    var g = new T.ExtrudeGeometry(s, { depth: 1.0, bevelEnabled: false, curveSegments: 8 });
    g.translate(0, 0, -0.5);
    g.rotateX(-Math.PI * 0.5);
    g.computeVertexNormals();
    return g;
  }

  // Twin-lancet pointed-arch tracery frame (unit width 1, length CATH_WIN_AR, apex at +X): ogival outer arch,
  // two pointed lancet openings split by a stone mullion, quatrefoil-style oculus in the arch head. Frame
  // skirt sinks 0.25 below the base plane so it always seats into the hull; face stands 0.30 proud.
  function makeCathedralWindowFrameGeo(T) {
    var AR = CATH_WIN_AR;
    var sh = cathOgive(new T.Shape(), 0, 0.5, 0, AR - 1.5, AR, 0.30);
    [-0.23, 0.23].forEach(function (cx) {
      sh.holes.push(cathOgive(new T.Path(), cx, 0.185, 0.16, AR - 2.2, AR - 1.05, 0.30));
    });
    var oc = new T.Path();
    oc.absarc(0, AR - 0.64, 0.105, 0, CATH_TAU, false);
    sh.holes.push(oc);
    var g = new T.ExtrudeGeometry(sh, { depth: 0.55, bevelEnabled: false, curveSegments: 6 });
    g.translate(0, 0, -0.25);
    cathAxialPlate(T, g);
    return g;
  }

  // Stained-glass fill for the twin lancets + oculus, recessed 0.12 above the base plane
  function makeCathedralWindowGlassGeo(T) {
    var AR = CATH_WIN_AR;
    var shapes = [];
    [-0.23, 0.23].forEach(function (cx) {
      shapes.push(cathOgive(new T.Shape(), cx, 0.19, 0.16, AR - 2.2, AR - 1.05, 0.30));
    });
    var oc = new T.Shape();
    oc.absarc(0, AR - 0.64, 0.11, 0, CATH_TAU, false);
    shapes.push(oc);
    var g = new T.ShapeGeometry(shapes, 6);
    var pa = g.attributes.position, ua = g.attributes.uv;
    for (var i = 0; i < pa.count; i++) ua.setXY(i, pa.getX(i) + 0.5, pa.getY(i) / AR);
    g.translate(0, 0, 0.12);
    cathAxialPlate(T, g);
    return g;
  }

  // Shared warm stained-glass material (amber / gold / sapphire / crimson via the lancet emissive map)
  function cathGlassMat(ctx, tex, w) {
    var cache = ctx.cathCache || (ctx.cathCache = {});
    if (cache.glass) return cache.glass;
    var T = ctx.T;
    cache.glass = tracker(ctx)(new T.MeshStandardMaterial({
      color: 0x1a1510,
      emissive: new T.Color(tex && tex.lancet ? 0xffffff : 0xffc870),
      emissiveMap: tex && tex.lancet ? tex.lancet : null,
      emissiveIntensity: 1.25 + 0.45 * (w != null ? w : 1),
      metalness: 0.08,
      roughness: 0.40,
      side: T.DoubleSide
    }));
    return cache.glass;
  }

  // Shared circular rose-window stained-glass material (Chartres jewel glass)
  function cathRoseMat(ctx, tex, w) {
    var cache = ctx.cathCache || (ctx.cathCache = {});
    if (cache.rose) return cache.rose;
    var T = ctx.T;
    cache.rose = tracker(ctx)(new T.MeshStandardMaterial({
      color: 0x1c1816,
      emissive: new T.Color(tex && tex.rose ? 0xffffff : 0xffd690),
      emissiveMap: tex && tex.rose ? tex.rose : null,
      emissiveIntensity: 1.75 + 0.75 * (w != null ? w : 1),
      metalness: 0.08,
      roughness: 0.34,
      side: T.DoubleSide
    }));
    return cache.rose;
  }

  // Skeletal Gothic flying-buttress arch strut (replaces the flat engine-spar plate). Returns ONE merged
  // geometry in holder space (X axial, Y tangential, Z radial-out): thin flared plate pierced by a central
  // pointed ogival arch, twin flank lancets and oculi, with four sweeping carved buttress ribs.
  // o: cx, zIn, zTop, zHull (first visible z), halfIn, halfMid, halfOut, depth, rad, podR
  function cathPylonGeometry(T, o) {
    var depth = o.depth, zIn = o.zIn, zTop = o.zTop, cx = o.cx;
    var midZ = lerp(zIn, zTop, 0.54);
    var sh = new T.Shape();
    sh.moveTo(cx - o.halfIn, zIn);
    sh.quadraticCurveTo(cx - o.halfMid, midZ, cx - o.halfOut, zTop);
    sh.lineTo(cx + o.halfOut, zTop);
    sh.quadraticCurveTo(cx + o.halfMid, midZ, cx + o.halfIn, zIn);
    sh.closePath();

    // outline half-width at height z (right-hand edge)
    function hwAt(z) {
      var prevZ = zIn, prevX = o.halfIn;
      for (var i = 1; i <= 32; i++) {
        var tt = i / 32, mt = 1 - tt;
        var zz = mt * mt * zIn + 2 * mt * tt * midZ + tt * tt * zTop;
        var xx = mt * mt * o.halfIn + 2 * mt * tt * o.halfMid + tt * tt * o.halfOut;
        if (zz >= z) {
          var f = (z - prevZ) / Math.max(1e-6, zz - prevZ);
          return lerp(prevX, xx, clamp(f, 0, 1));
        }
        prevZ = zz;
        prevX = xx;
      }
      return o.halfOut;
    }

    var zb = Math.max(o.zHull, zIn + 0.10);
    var zVisTop = o.zPodInner != null ? o.zPodInner : (zTop - Math.max(0.30, o.podR * 0.50));
    var zt = zVisTop - Math.max(0.14, o.podR * 0.16);
    var H = zt - zb;
    if (H > 0.72) {
      // central pointed ogival arch opening cleanly below the nacelle inner casing so the sharp Gothic point shows broadside
      var hwC = Math.min(0.42 * H, 0.62 * hwAt(zb + 0.78 * H));
      if (hwC > 0.16) {
        var ySpC = Math.max(zb + 0.20 * H, zt - 1.75 * hwC);
        sh.holes.push(cathOgive(new T.Path(), cx, hwC, zb, ySpC, zt, 0.30));
        // twin flank lancets in the haunches + oculi above them
        var hwF = Math.max(0.10, 0.42 * hwC);
        var zTopF = zb + 0.60 * H;
        [-1, 1].forEach(function (sd) {
          var cF = cx + sd * (hwC + 0.34 * hwC + hwF);
          var edge = Math.abs(cF - cx) + hwF + 0.10;
          if (edge < hwAt(zTopF + 0.35 * hwF * 2)) {
            sh.holes.push(cathOgive(new T.Path(), cF, hwF, zb, zTopF - 1.7 * hwF, zTopF, 0.30));
            var oc = new T.Path();
            var ocR = 0.34 * hwF;
            oc.absarc(cF, zTopF + 0.40 * hwF + ocR, ocR, 0, CATH_TAU, false);
            if (Math.abs(cF - cx) + ocR + 0.10 < hwAt(zTopF + 0.40 * hwF + ocR * 2)) sh.holes.push(oc);
          }
        });
      }
    }
    var web = new T.ExtrudeGeometry(sh, { depth: depth, bevelEnabled: false, curveSegments: 6 });
    web.rotateX(Math.PI * 0.5);
    web.translate(0, depth * 0.5, 0);

    var parts = [{ g: web, m: null }];
    // four sweeping carved flying-buttress ribs (two per tangential face) hugging the flared silhouette
    var yOffs = [-depth * 0.64, depth * 0.64];
    [-1, 1].forEach(function (sd) {
      yOffs.forEach(function (yo) {
        var curve = new T.QuadraticBezierCurve3(
          new T.Vector3(cx + sd * o.halfIn * 0.96, yo, zb - 0.10),
          new T.Vector3(cx + sd * o.halfIn * 1.02, yo, zb + 0.74 * H),
          new T.Vector3(cx + sd * o.halfOut * 0.56, yo, zTop - 0.04)
        );
        parts.push({ g: new T.TubeGeometry(curve, 16, o.rad, 6, false), m: null });
      });
    });
    var merged = cathMergeParts(T, parts);
    parts.forEach(function (pp) { pp.g.dispose(); });
    return merged;
  }

  // Gothic bell-tower shroud for a conjoiner nacelle: longitudinal stone ribs, a cloister arcade of pointed
  // twin-lancet tracery frames with warm stained-glass slits, and a crown of slender axial spires/pinnacles
  // standing OUTSIDE the maw (fore and aft exhaust apertures stay clear). Returns { makeGroup(): Group }.
  // o: lip(u, phi) -> {x, rY, rZ, c, s}; centerZ, podLen, podR, mats {stone, trim}
  function cathNacelleShroud(ctx, o) {
    var T = ctx.T;
    var tex = getTex(T, 'cathedral', createCathedralConcreteTextures);
    var w = clamp(Number(ctx.P && ctx.P.styleCathedral) || 1, 0, 1);
    var glass = cathGlassMat(ctx, tex, w);
    var roseMat = cathRoseMat(ctx, tex, w);
    var cyl = new T.CylinderGeometry(1, 1, 1, 8);
    var frameGeo = makeCathedralWindowFrameGeo(T);
    var glassGeo = makeCathedralWindowGlassGeo(T);
    var gableGeo = makeCathedralGableGeo(T);
    var roseDiscGeo = makeDiscGeo(T, 32);
    var roseRingGeo = new T.TorusGeometry(1, 0.11, 8, 32);
    roseRingGeo.rotateX(-Math.PI * 0.5);
    var spireGeo = makeCathedralSpireGeo(T);
    var pinGeo = makeCathedralPinnacleGeo(T);
    var upY = new T.Vector3(0, 1, 0);
    var fwdQ = new T.Quaternion().setFromEuler(new T.Euler(0, 0, -Math.PI * 0.5));
    var stoneParts = [], trimParts = [], glassParts = [], roseParts = [];
    var podR = o.podR, podLen = o.podLen, cz = o.centerZ;

    function pointAt(u, phi, lift) {
      var l = o.lip(u, phi);
      var nY = -l.s / l.rY, nZ = l.c / l.rZ;
      var nl = Math.hypot(nY, nZ) || 1;
      nY /= nl;
      nZ /= nl;
      return {
        p: new T.Vector3(l.x, -l.rY * l.s + nY * lift, cz + l.rZ * l.c + nZ * lift),
        n: new T.Vector3(0, nY, nZ),
        rad: 0.5 * (l.rY + l.rZ)
      };
    }
    function addSeg(list, a, b, rad) {
      var dir = new T.Vector3().subVectors(b, a);
      var len = dir.length();
      if (len < 1e-4) return;
      dir.multiplyScalar(1 / len);
      var q = new T.Quaternion().setFromUnitVectors(upY, dir);
      var m = new T.Matrix4().compose(new T.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new T.Vector3(rad, len, rad));
      list.push({ g: cyl, m: m });
    }

    // Multi-kilometer scaled cloister arcade: 18 fine narrow bays stacked across 2 crisp clerestory tiers!
    var nArc = 18, stepA = CATH_TAU / nArc, j, k;
    var tiersU = [0.30, 0.52];
    for (var ti = 0; ti < tiersU.length; ti++) {
      var uTier = tiersU[ti];
      for (j = 0; j < nArc; j++) {
        var phiA = j * stepA;
        // Leave side cardinal rose portals clear on the upper tier so stained-glass roses shine cleanly
        var nearSideRose = ti === 1 && (Math.abs(Math.sin(phiA)) > 0.94 || Math.cos(phiA) > 0.95);
        if (nearSideRose) continue;
        var pm = pointAt(uTier, phiA, 0);
        var Wd = 0.36 * (CATH_TAU * pm.rad / nArc);
        var Ln = CATH_WIN_AR * Wd;
        var uB = uTier - 0.5 * Ln / podLen;
        var pb = pointAt(uB, phiA, 0.0);
        var tV = new T.Vector3(1, 0, 0);
        var bV = new T.Vector3().crossVectors(tV, pm.n).normalize();
        var basis = new T.Matrix4().makeBasis(tV, pm.n, bV);
        var q = new T.Quaternion().setFromRotationMatrix(basis);
        var m = new T.Matrix4().compose(new T.Vector3(pb.p.x, pm.p.y, pm.p.z), q, new T.Vector3(Wd, Wd, Wd));
        stoneParts.push({ g: frameGeo, m: m });
        glassParts.push({ g: glassGeo, m: m });
        if ((j + ti) % 2 === 0) {
          var mg = new T.Matrix4().compose(
            new T.Vector3(pb.p.x + Ln * 0.96, pm.p.y + pm.n.y * Wd * 0.14, pm.p.z + pm.n.z * Wd * 0.14),
            q,
            new T.Vector3(Wd * 1.15, Wd * 0.34, Wd * 1.18)
          );
          trimParts.push({ g: gableGeo, m: mg });
        }
      }
    }
    // Glowing circular stained-glass rose medallions on the outer & dorsal/ventral flanks of each nacelle
    [0, Math.PI * 0.5, -Math.PI * 0.5].forEach(function (phiRose) {
      var pr = pointAt(0.51, phiRose, podR * 0.045);
      var tVr = new T.Vector3(1, 0, 0);
      var bVr = new T.Vector3().crossVectors(tVr, pr.n).normalize();
      var qR = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(tVr, pr.n, bVr));
      var rR = podR * 0.21;
      roseParts.push({ g: roseDiscGeo, m: new T.Matrix4().compose(pr.p, qR, new T.Vector3(rR, 1, rR)) });
      trimParts.push({ g: roseRingGeo, m: new T.Matrix4().compose(pr.p, qR, new T.Vector3(rR * 1.12, 1, rR * 1.12)) });
      trimParts.push({
        g: gableGeo,
        m: new T.Matrix4().compose(
          new T.Vector3(pr.p.x + rR * 0.65, pr.p.y + pr.n.y * rR * 0.04, pr.p.z + pr.n.z * rR * 0.04),
          qR,
          new T.Vector3(rR * 1.6, rR * 0.28, rR * 1.8)
        )
      });
    });
    // Fine circumferential stone stringcourse rings separating the nacelle clerestory tiers
    [0.20, 0.41, 0.63].forEach(function (uRing) {
      var prevR = null;
      for (j = 0; j <= nArc; j++) {
        var ptR = pointAt(uRing, (j % nArc) * stepA, podR * 0.025).p;
        if (prevR) addSeg(trimParts, prevR, ptR, podR * 0.018);
        prevR = ptR;
      }
    });
    // Slender longitudinal stone colonnette ribs between the fine arcade bays
    for (j = 0; j < nArc; j++) {
      var phiR = (j + 0.5) * stepA;
      var prev = null;
      for (k = 0; k <= 8; k++) {
        var cur = pointAt(lerp(0.14, 0.68, k / 8), phiR, podR * 0.020);
        if (prev) addSeg(trimParts, prev, cur.p, podR * (j % 3 === 0 ? 0.024 : 0.015));
        prev = cur.p;
      }
    }
    // Crown of slender axial spires & crocketed pinnacles standing proud of the cowling shoulder on flying braces
    var nCrown = 10, stepC = CATH_TAU / nCrown, uRoot = 0.58;
    for (j = 0; j < nCrown * 2; j++) {
      var big = (j % 2 === 0);
      var phiC = j * stepC * 0.5 + stepC * 0.25;
      var cC = Math.cos(phiC), sC = Math.sin(phiC);
      if (cC < -0.35) continue;
      var spR = podR * (big ? 0.088 : 0.055);
      var spLen = podLen * (big ? 0.42 : 0.26);
      var l0 = o.lip(uRoot, phiC);
      var d0 = Math.hypot(l0.rY * sC, l0.rZ * cC) || 1;
      var dmax = d0;
      for (k = 1; k <= 10; k++) {
        var lk = o.lip(lerp(uRoot, 1.0, k / 10), phiC);
        dmax = Math.max(dmax, Math.hypot(lk.rY * sC, lk.rZ * cC));
      }
      var dC = dmax + podR * (big ? 0.32 : 0.20);
      var dY = -l0.rY * sC / d0, dZ = l0.rZ * cC / d0;
      var xRoot = l0.x;
      var base = new T.Vector3(xRoot, dC * dY, cz + dC * dZ);
      trimParts.push({ g: big ? spireGeo : pinGeo, m: new T.Matrix4().compose(base, fwdQ, new T.Vector3(spR, spLen, spR)) });
      [0.06, 0.22].forEach(function (fb, bi) {
        var xs = xRoot + spLen * fb;
        var lb = o.lip(clamp(uRoot + (xs - xRoot) / podLen - 0.05, 0.05, 0.98), phiC);
        var d1 = Math.hypot(lb.rY * sC, lb.rZ * cC) || 1;
        var anchor = new T.Vector3(lb.x, (d1 - podR * 0.02) * (-lb.rY * sC / d1), cz + (d1 - podR * 0.02) * (lb.rZ * cC / d1));
        var tieTop = new T.Vector3(xs, (dC - spR * 0.6) * dY, cz + (dC - spR * 0.6) * dZ);
        addSeg(trimParts, anchor, tieTop, podR * (bi === 0 ? 0.024 : 0.017));
      });
    }

    var stoneGeo = cathMergeParts(T, stoneParts);
    var trimGeo = trimParts.length ? cathMergeParts(T, trimParts) : null;
    var glassOut = cathMergeParts(T, glassParts);
    var roseOut = roseParts.length ? cathMergeParts(T, roseParts) : null;
    cyl.dispose();
    frameGeo.dispose();
    glassGeo.dispose();
    gableGeo.dispose();
    roseDiscGeo.dispose();
    roseRingGeo.dispose();
    spireGeo.dispose();
    pinGeo.dispose();
    return {
      makeGroup: function () {
        var g = new T.Group();
        g.name = 'Cathedral_Nacelle_Shroud';
        g.add(new T.Mesh(stoneGeo, o.mats.stone));
        if (trimGeo) g.add(new T.Mesh(trimGeo, o.mats.trim));
        g.add(new T.Mesh(glassOut, glass));
        if (roseOut) g.add(new T.Mesh(roseOut, roseMat));
        return g;
      }
    };
  }

  var cathedralKit = {
    id: 'cathedral',
    weightKey: 'styleCathedral',

    // Engine pylon / nacelle integration helpers consumed by lighthugger-builder.js when cathedral > 0.30
    buildPylonGeometry: function (ctx, o) {
      return cathPylonGeometry(ctx.T, o);
    },
    buildNacelleShroud: function (ctx, o) {
      return cathNacelleShroud(ctx, o);
    },

    applyMaterials: function (ctx) {
      if (!ctx || !ctx.T || !ctx.P || !ctx.mats) return;
      var T = ctx.T;
      var st = kitState(ctx, 'cathedral', 'styleCathedral');
      if (st.w <= 0.02) return;
      var w = st.w, k = st.k;
      var mats = ctx.mats;
      var tex = getTex(T, 'cathedral', createCathedralConcreteTextures);

      // Helper: monolithic dark grayish architectural cast concrete (neutral-warm cement gray cancels scene rim tints!)
      function castConcrete(m, texMap, bumpMap, colHex, emHex, emInt, bumpAmt) {
        if (!m) return;
        mixColor(T, m.color, (st.own && texMap) ? colHex : 0x6a6864, k * 0.96);
        mixNum(m, 'metalness', 0.06, k * 0.94);
        mixNum(m, 'roughness', 0.90, k * 0.94);
        if (m.emissive) {
          mixColor(T, m.emissive, emHex, k * 0.94);
          m.emissiveIntensity = lerp(m.emissiveIntensity || 0.0, emInt, k);
        }
        if (st.own && texMap) {
          m.map = texMap;
          m.bumpMap = bumpMap || null;
          m.bumpScale = bumpAmt * w;
          m.emissiveMap = texMap;
          m.roughnessMap = null;
          m.needsUpdate = true;
        }
      }

      // Nacelles, swept pylons & forward hull collar: clean board-formed dark gray concrete (ZERO tint, ZERO orange glow!)
      castConcrete(mats.hull, tex && tex.concreteHull, tex && tex.concreteBump, 0x9c9994, 0x5c5a57, 0.52, 0.56);
      castConcrete(mats.procHull, tex && tex.concreteHull, tex && tex.concreteBump, 0x94918c, 0x565451, 0.50, 0.54);

      // Tapered aft nave hull & waist collar: carved dark concrete Gothic arcades (pure neutral dark gray concrete!)
      castConcrete(mats.aftGothic, tex && tex.albedo, tex && tex.bump, 0x928f8a, 0x52504d, 0.48, 0.58);
      castConcrete(mats.collar, tex && tex.albedo, tex && tex.bump, 0x8a8782, 0x4c4a47, 0.46, 0.52);

      [mats.dark, mats.obsidian].forEach(function (m) {
        if (!m) return;
        mixColor(T, m.color, 0x3a3937, k * 0.92);
        mixNum(m, 'metalness', 0.10, k * 0.88);
        mixNum(m, 'roughness', 0.90, k * 0.88);
        if (m.emissive) {
          mixColor(T, m.emissive, 0x222120, k * 0.86);
          m.emissiveIntensity = lerp(m.emissiveIntensity || 0, 0.28, k);
        }
        if (st.own && tex && tex.concreteHull) {
          m.map = tex.concreteHull;
          m.bumpMap = tex.concreteBump;
          m.bumpScale = 0.30 * w;
          m.emissiveMap = tex.concreteHull;
          m.needsUpdate = true;
        }
      });
      if (mats.trim) {
        // Chiseled lighter ash-gray concrete Gothic moldings, nacelle spire crowns & vault ribs
        castConcrete(mats.trim, tex && tex.concreteHull, tex && tex.concreteBump, 0xcac6bf, 0x8c8982, 0.58, 0.36);
      }
      if (mats.amberLight && mats.amberLight.color) mixColor(T, mats.amberLight.color, 0xffd590, k * 0.86);
      if (mats.cyanGlow && mats.cyanGlow.color) mixColor(T, mats.cyanGlow.color, 0xa8cce0, k * 0.65);
      if (mats.cryo) {
        mixColor(T, mats.cryo.color, 0x868c96, k * 0.65);
        mixNum(mats.cryo, 'roughness', 0.84, k * 0.70);
        if (mats.cryo.emissive) mixColor(T, mats.cryo.emissive, 0x262930, k * 0.60);
      }
      var rad = mats.rad || mats.radiator;
      if (rad) {
        mixColor(T, rad.color, 0x4a4e56, k * 0.82);
        if (rad.emissive) mixColor(T, rad.emissive, 0xc87a36, k * 0.72);
        if (typeof rad.emissiveIntensity === 'number') rad.emissiveIntensity *= (1 - 0.38 * k);
      }
      [mats.ice, mats.iceProc].forEach(function (m) {
        if (!m) return;
        mixColor(T, m.color, 0xecf1f7, k * 0.18);
      });
    },

    buildGeometry: function (ctx) {
      if (!ctx || !ctx.T || !ctx.P || !ctx.rootGroup) return;
      var st = kitState(ctx, 'cathedral', 'styleCathedral');
      var w = st.w;
      if (w <= 0.02) return;

      var T = ctx.T;
      var track = tracker(ctx);
      var tex = getTex(T, 'cathedral', createCathedralConcreteTextures);
      var rng = makeRng(ctx, 0x43415448);
      var detail = clamp(ctx.detailScale != null ? ctx.detailScale : 1, 0.4, 1.2);
      var s = Math.min(ctx.rySeam, ctx.rzSeam);
      var aftSpan = ctx.aftSpan;
      var U = makeUnits(T);
      var grp = new T.Group();
      grp.name = 'Style_Gothic_Cathedral_Concrete';

      // Dark grayish brutalist-Gothic concrete + lighter chiseled ash-concrete spires & flourishes + shadow cavities
      // Neutral-warm cement gray + textured emissiveMap self-fill holds crisp photographic concrete gray on
      // sunlit AND shadowed sides, resisting the scene's mint/purple rim lights!
      var darkConcreteMat = track(new T.MeshStandardMaterial({
        color: tex ? 0x8e8b87 : 0x5c5a57,
        map: tex && tex.concreteHull ? tex.concreteHull : null,
        bumpMap: tex && tex.concreteBump ? tex.concreteBump : null,
        bumpScale: 0.54 * w,
        emissive: new T.Color(0x52504d),
        emissiveMap: tex && tex.concreteHull ? tex.concreteHull : null,
        emissiveIntensity: 0.50,
        metalness: 0.06,
        roughness: 0.90
      }));
      var spireConcreteMat = track(new T.MeshStandardMaterial({
        color: tex ? 0xc4c1ba : 0x88847e,
        map: tex && tex.concreteHull ? tex.concreteHull : null,
        bumpMap: tex && tex.concreteBump ? tex.concreteBump : null,
        bumpScale: 0.48 * w,
        emissive: new T.Color(0x9c9890),
        emissiveMap: tex && tex.concreteHull ? tex.concreteHull : null,
        emissiveIntensity: 0.74,
        metalness: 0.06,
        roughness: 0.86
      }));
      var flourishTrimMat = track(new T.MeshStandardMaterial({
        color: tex ? 0xd0ccc4 : 0xa09c96,
        map: tex && tex.concreteHull ? tex.concreteHull : null,
        bumpMap: tex && tex.concreteBump ? tex.concreteBump : null,
        bumpScale: 0.36 * w,
        emissive: new T.Color(0x949088),
        emissiveMap: tex && tex.concreteHull ? tex.concreteHull : null,
        emissiveIntensity: 0.62,
        metalness: 0.08,
        roughness: 0.84
      }));
      var glassMat = cathGlassMat(ctx, tex, w);
      var roseMat = cathRoseMat(ctx, tex, w);
      var lanternMat = track(new T.MeshBasicMaterial({ color: 0xffdfa2 }));

      var spireMats = [], pinMats = [], gableMats = [];
      var ribList = [], vaultList = [], flyList = [], bossList = [];
      var winFrames = [], winGlass = [], roses = [], roseRings = [], lanterns = [];

      var aftMinBare = bareMin(ctx, false);
      var foreMinBare = bareMin(ctx, true);

      function iceShieldR(dirY, dirZ) {
        return Math.hypot(ctx.rySeam * dirY, ctx.rzSeam * dirZ);
      }

      function hullPt(tVal, phiVal) {
        return ctx.evalAftSurf(clamp(tVal, 0.005, 0.99), phiVal, 1.0);
      }

      function hullRadAt(tVal, phiVal) {
        var p = hullPt(tVal, phiVal);
        return Math.hypot(p.y, p.z);
      }

      function isSpireClear(phiVal, tBase, tTip, pad) {
        return (
          isClear(ctx, false, phiVal, tBase, pad) &&
          isClear(ctx, false, phiVal, 0.5 * (tBase + tTip), pad) &&
          isClear(ctx, false, phiVal, tTip, pad)
        );
      }

      // AXIAL FORWARD (+X) quaternion: rotates local +Y spire axis onto ship +X (toward bow ice cone!)
      var fwdAxisQuat = new T.Quaternion().setFromEuler(new T.Euler(0, 0, -Math.PI * 0.5));
      var aftAxisQuat = new T.Quaternion().setFromEuler(new T.Euler(0, 0, Math.PI * 0.5));
      var upY = new T.Vector3(0, 1, 0);
      var tmpMat = new T.Matrix4();
      var tmpQ = new T.Quaternion();

      // Push a watertight axial (+X) High-Gothic spire rooted solidly at xBase
      function pushAxialSpire(xBase, yPos, zPos, rad, len, isMajor) {
        if (!(len > 0.12 && rad > 0.008)) return;
        tmpMat.compose(new T.Vector3(xBase, yPos, zPos), fwdAxisQuat, new T.Vector3(rad, len, rad));
        if (isMajor) spireMats.push(tmpMat.clone());
        else pinMats.push(tmpMat.clone());
      }

      // World-space round stone member from a to b (cylinder scaled to rad x len x rad)
      function pushSegment(list, ax, ay, az, bx, by, bz, rad) {
        var dx = bx - ax, dy = by - ay, dz = bz - az;
        var len = Math.hypot(dx, dy, dz);
        if (len < 1e-4) return;
        var dir = new T.Vector3(dx / len, dy / len, dz / len);
        tmpQ.setFromUnitVectors(upY, dir);
        tmpMat.compose(
          new T.Vector3(0.5 * (ax + bx), 0.5 * (ay + by), 0.5 * (az + bz)),
          tmpQ,
          new T.Vector3(rad, len, rad)
        );
        list.push(tmpMat.clone());
      }

      // Thin sweeping flying-buttress arch in the (axial x, radial r) meridian plane at azimuth (dirY, dirZ):
      // from the free-standing pier (xO, rO) forward & inward to the hull wall (xI, rI), bowed forward/outward.
      function pushFlyer(dirY, dirZ, xO, rO, xI, rI, bow, radO, radI, rCap) {
        var dx = xI - xO, dr = rI - rO;
        var cX = 0.5 * (xO + xI) + bow * (-dr);
        var cR = 0.5 * (rO + rI) + bow * dx;
        var n = 10, px = xO, pr = rO;
        for (var i = 1; i <= n; i++) {
          var u = i / n, mu = 1 - u;
          var x = mu * mu * xO + 2 * mu * u * cX + u * u * xI;
          var r = Math.min(rCap, mu * mu * rO + 2 * mu * u * cR + u * u * rI);
          pushSegment(flyList, px, pr * dirY, pr * dirZ, x, r * dirY, r * dirZ, lerp(radO, radI, u));
          px = x;
          pr = r;
        }
      }

      var nBay = detail < 0.6 ? 14 : 28;
      var bay = CATH_TAU / nBay;
      var aftEnd = Math.min(0.94, aftMinBare - 0.015);
      var aftStart = 0.014;

      if (aftEnd - aftStart > 0.14) {
        // ---- A. Multi-kilometer micro-scaled clerestory: 9-12 narrow gothic stories x 28 bays ----
        function bayChordMin(tv) {
          var m = 1e9;
          for (var bi = 0; bi < nBay; bi++) {
            var pa = hullPt(tv, bi * bay), pb = hullPt(tv, (bi + 1) * bay);
            m = Math.min(m, Math.hypot(pb.y - pa.y, pb.z - pa.z));
          }
          return m;
        }
        var rows = [];
        var tCur = 0.038;
        for (var rg = 0; rg < 14; rg++) {
          var Wt = 0.36 * bayChordMin(tCur + 0.035);
          var tB = tCur + (CATH_WIN_AR * Wt) / aftSpan;
          Wt = 0.36 * bayChordMin(0.5 * (tCur + tB));
          tB = tCur + (CATH_WIN_AR * Wt) / aftSpan;
          if (tB > aftEnd - 0.025 || Wt < s * 0.024) break;
          rows.push({ tA: tCur, tB: tB, W: Wt });
          tCur = tB + 0.042;
        }

        // Helper: place a monumental or choir stained-glass circular rose window with stone tracery ring + pointed wimperg gable
        function pushRosePortal(tPos, phiPos, radiusR, withGable, withFlankPins) {
          if (!isClear(ctx, false, phiPos, tPos, 0.06)) return false;
          var frRo = ctx.evalSurfaceFrame(false, tPos, phiPos, 1.0);
          var spanT = Math.min(0.08, (radiusR / Math.max(1e-3, aftSpan)) * 1.15);
          var rUpR = Math.max(
            hullRadAt(tPos, phiPos),
            hullRadAt(clamp(tPos - spanT, 0.01, 0.98), phiPos),
            hullRadAt(clamp(tPos + spanT, 0.01, 0.98), phiPos)
          );
          var liftRo = rUpR - hullRadAt(tPos, phiPos) + radiusR * 0.16;
          ctx.pushFramed(roses, frRo, radiusR, 1, radiusR, liftRo, 0, 0);
          ctx.pushFramed(roseRings, frRo, radiusR * 1.15, 1, radiusR * 1.15, liftRo, 0, 0);
          ctx.pushFramed(roseRings, frRo, radiusR * 0.56, 1, radiusR * 0.56, liftRo + radiusR * 0.03, 0, 0);
          if (withGable) {
            ctx.pushFramed(gableMats, frRo, radiusR * 1.85, radiusR * 0.30, radiusR * 2.05, liftRo - radiusR * 0.04, radiusR * 0.62, 0);
          }
          if (withFlankPins) {
            var dPhiPin = Math.min(0.16, (radiusR * 1.25) / Math.max(0.2, hullRadAt(tPos, phiPos)));
            [-dPhiPin, dPhiPin].forEach(function (dp) {
              var frP = ctx.evalSurfaceFrame(false, tPos + spanT * 0.3, phiPos + dp, 1.0);
              var rP = Math.hypot(frP.pt.y, frP.pt.z);
              if (rP > 1e-3) {
                var py = frP.pt.y / rP, pz = frP.pt.z / rP;
                pushAxialSpire(frP.pt.x - radiusR * 0.35, (rP + radiusR * 0.14) * py, (rP + radiusR * 0.14) * pz, radiusR * 0.18, radiusR * 3.4, false);
              }
            });
          }
          return true;
        }

        // Monumental stained-glass circular rose portals: 4 cardinal forward transept roses + 4 staggered mid-choir roses + 6 apse oculi
        var roseZones = [
          { t: 0.135, phis: [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5], r: s * 0.245, gable: true, pins: true },
          { t: 0.295, phis: [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75], r: s * 0.195, gable: true, pins: true },
          { t: 0.485, phis: [0, Math.PI * 0.333, Math.PI * 0.667, Math.PI, Math.PI * 1.333, Math.PI * 1.667], r: s * 0.13, gable: true, pins: false }
        ];
        var placedRoses = [];
        roseZones.forEach(function (rz) {
          if (rz.t > aftEnd - 0.08) return;
          rz.phis.forEach(function (ph) {
            // Try preferred angle, else nudge slightly clear of engine pylons/ports
            var tried = [0, 0.22, -0.22, 0.36, -0.36];
            for (var ti = 0; ti < tried.length; ti++) {
              var pTry = (ph + tried[ti] + CATH_TAU) % CATH_TAU;
              if (pushRosePortal(rz.t, pTry, rz.r, rz.gable, rz.pins)) {
                placedRoses.push({ t: rz.t, phi: pTry, dt: (rz.r / Math.max(1e-3, aftSpan)) * 1.35, dPhi: Math.min(0.42, (rz.r * 1.55) / Math.max(0.25, hullRadAt(rz.t, pTry))) });
                break;
              }
            }
          });
        });

        function nearRose(tVal, phiVal) {
          for (var rzi = 0; rzi < placedRoses.length; rzi++) {
            var pr = placedRoses[rzi];
            if (Math.abs(tVal - pr.t) < pr.dt) {
              var dp = Math.abs(Math.atan2(Math.sin(phiVal - pr.phi), Math.cos(phiVal - pr.phi)));
              if (dp < pr.dPhi) return true;
            }
          }
          return false;
        }

        // Micro-scaled lancet windows (frame + stained glass + pointed gablets) across every narrow bay & story
        rows.forEach(function (row, ri) {
          var tC = 0.5 * (row.tA + row.tB);
          for (var bi = 0; bi < nBay; bi++) {
            var phiC = (bi + 0.5) * bay;
            if (nearRose(tC, phiC)) continue;
            if (!(isClear(ctx, false, phiC, row.tA, 0.04) && isClear(ctx, false, phiC, tC, 0.04) && isClear(ctx, false, phiC, row.tB, 0.04))) continue;
            var fr = ctx.evalSurfaceFrame(false, tC, phiC, 1.0);
            var rC = hullRadAt(tC, phiC), rUp = rC;
            for (var sj = 0; sj <= 4; sj++) rUp = Math.max(rUp, hullRadAt(lerp(row.tA, row.tB, sj / 4), phiC));
            var lift = (rUp - rC) + row.W * 0.02;
            var offT = -0.5 * CATH_WIN_AR * row.W;
            ctx.pushFramed(winFrames, fr, row.W, row.W, row.W, lift, offT, 0);
            ctx.pushFramed(winGlass, fr, row.W, row.W, row.W, lift, offT, 0);
            // Carved pointed wimperg gablets crowning alternating micro-lancets for rich Gothic facade texture
            if ((bi + ri) % 2 === 0 && detail >= 0.7) {
              ctx.pushFramed(gableMats, fr, row.W * 1.25, row.W * 0.34, row.W * 1.25, lift + row.W * 0.14, 0.5 * CATH_WIN_AR * row.W, 0);
            }
          }
          // Vault band aft of this row: crisp intersecting diagonal groin ribs + tiny clerestory sanctuary lanterns
          var tV0 = row.tB + 0.008;
          var tV1 = (ri + 1 < rows.length ? rows[ri + 1].tA : Math.min(aftEnd - 0.018, row.tB + 0.042)) - 0.008;
          if (tV1 - tV0 < 0.016) return;
          for (var bj = 0; bj < nBay; bj++) {
            var phiL = bj * bay, phiR = (bj + 1) * bay;
            var phiMid = (bj + 0.5) * bay;
            var tVm = 0.5 * (tV0 + tV1);
            if (nearRose(tVm, phiMid)) continue;
            if (!(isClear(ctx, false, phiMid, tVm, 0.04) && isClear(ctx, false, phiL, tVm, 0.025) && isClear(ctx, false, phiR, tVm, 0.025))) continue;
            for (var dg = 0; dg < 2; dg++) {
              var pPrev = null;
              for (var si = 0; si <= 4; si++) {
                var uu = si / 4;
                var tt = lerp(tV0, tV1, uu);
                var ph = dg === 0 ? lerp(phiL, phiR, uu) : lerp(phiR, phiL, uu);
                var hp = hullPt(tt, ph);
                var hr = Math.hypot(hp.y, hp.z) || 1;
                var lf = s * (0.011 + 0.014 * Math.sin(uu * Math.PI));
                var cur = [hp.x, hp.y + hp.y / hr * lf, hp.z + hp.z / hr * lf];
                if (pPrev) pushSegment(vaultList, pPrev[0], pPrev[1], pPrev[2], cur[0], cur[1], cur[2], s * 0.0085);
                pPrev = cur;
              }
            }
            var hb = hullPt(tVm, phiMid);
            var hbr = Math.hypot(hb.y, hb.z) || 1;
            tmpMat.compose(
              new T.Vector3(hb.x, hb.y + hb.y / hbr * s * 0.022, hb.z + hb.z / hbr * s * 0.022),
              new T.Quaternion(),
              new T.Vector3(s * 0.018, s * 0.018, s * 0.018)
            );
            bossList.push(tmpMat.clone());
            // Scattered pinpoint clerestory gallery lights (tiny multi-km scale cues)
            if ((bj * 7 + ri * 13) % 5 === 0) {
              tmpMat.compose(
                new T.Vector3(hb.x, hb.y + hb.y / hbr * s * 0.016, hb.z + hb.z / hbr * s * 0.016),
                new T.Quaternion(),
                new T.Vector3(s * 0.010, s * 0.010, s * 0.010)
              );
              lanterns.push(tmpMat.clone());
            }
          }
        });

        // Delicate stringcourse cornice rings capping every window story
        rows.forEach(function (row) {
          var ringTube = s * 0.0095;
          addRing(ctx, grp, false, row.tB + 0.004, ringTube, flourishTrimMat, ringTube * 1.5);
          addRing(ctx, grp, false, row.tA - 0.003, ringTube, flourishTrimMat, ringTube * 1.5);
        });

        // Slender clustered longitudinal colonnette ribs (28 bays for fine kilometer-scale vertical relief)
        for (var ribI = 0; ribI < nBay; ribI++) {
          var phiRb = ribI * bay;
          var heavy = (ribI % 4 === 0);
          var prv = null;
          for (var rs = 0; rs * 0.026 + aftStart + 0.01 <= aftEnd; rs++) {
            var trb = aftStart + 0.01 + rs * 0.026;
            if (!isClear(ctx, false, phiRb, trb, 0.05)) { prv = null; continue; }
            var hq = hullPt(trb, phiRb);
            var hqr = Math.hypot(hq.y, hq.z) || 1;
            var lq = s * (heavy ? 0.022 : 0.013);
            var cp = [hq.x, hq.y + hq.y / hqr * lq, hq.z + hq.z / hqr * lq];
            if (prv) pushSegment(ribList, prv[0], prv[1], prv[2], cp[0], cp[1], cp[2], s * (heavy ? 0.018 : 0.010));
            prv = cp;
          }
        }

        // ---- B. Monumental Central Cathedral Crossing Spires & Axial Spine Belfry Towers ----
        // Test all 4 cardinal meridians (so twin-horizontal AND twin-vertical engine layouts BOTH get soaring
        // central cathedral crossing spires along the unobstructed open ridges!), plus fore/aft crossing spires
        // stepping clear of the engine pylon arches!
        var centralClusters = [
          { tBase: 0.44, tTip: 0.015, liftR: 0.52, spR: 0.132, nFlank: 4, flankSpread: 0.18, major: true },
          { tBase: 0.60, tTip: 0.11, liftR: 0.42, spR: 0.102, nFlank: 4, flankSpread: 0.16, major: true },
          { tBase: 0.74, tTip: 0.26, liftR: 0.30, spR: 0.078, nFlank: 2, flankSpread: 0.14, major: false }
        ];
        [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5].forEach(function (spinePhi) {
          centralClusters.forEach(function (cl) {
            if (cl.tBase > aftEnd - 0.05) return;
            if (!isSpireClear(spinePhi, cl.tBase, cl.tTip, 0.12)) return;
            var frC = ctx.evalSurfaceFrame(false, cl.tBase, spinePhi, 0.996);
            var rSurfC = Math.hypot(frC.pt.y, frC.pt.z);
            if (rSurfC < 1e-3) return;
            var dyC = frC.pt.y / rSurfC, dzC = frC.pt.z / rSurfC;
            var rIceC = iceShieldR(dyC, dzC);
            var spRC = s * cl.spR * (0.86 + 0.18 * w);
            var rTowerC = clamp(Math.max(rSurfC + s * cl.liftR, rIceC * 1.02), rSurfC + spRC * 1.8, rIceC * 1.24);
            var tTipC = cl.tTip;
            var gC = 0;
            while (gC < 12 && tTipC < cl.tBase - 0.12 && rTowerC < hullRadAt(tTipC, spinePhi) + spRC * 1.4) {
              tTipC += 0.02;
              gC++;
            }
            var xBaseC = frC.pt.x - s * 0.08;
            var xTipC = Math.min(ctx.seamX - 0.04, ctx.seamX - tTipC * aftSpan);
            var lenC = xTipC - xBaseC;
            if (lenC < s * 1.1) return;

            // Soaring central crossing spire + glowing belfry lantern bead
            pushAxialSpire(xBaseC, rTowerC * dyC, rTowerC * dzC, spRC, lenC, true);
            tmpMat.compose(
              new T.Vector3(xBaseC + lenC * 0.18, (rTowerC - spRC * 0.65) * dyC, (rTowerC - spRC * 0.65) * dzC),
              new T.Quaternion(),
              new T.Vector3(s * 0.022, s * 0.022, s * 0.022)
            );
            lanterns.push(tmpMat.clone());
            // Quadruple sweeping flying-buttress arches anchoring the central crossing tower into the hull
            [0.08, 0.26, 0.46, 0.64].forEach(function (ff, fi) {
              var xO = xBaseC + lenC * ff;
              var xI = Math.min(ctx.seamX - 0.20, xO + lenC * (0.20 - fi * 0.015));
              var tIn = clamp((ctx.seamX - xI) / aftSpan, 0.02, 0.95);
              var rIn = hullRadAt(tIn, spinePhi) + s * 0.01;
              var rOut = rTowerC - spRC * 0.45;
              if (rOut > rIn + s * 0.08) {
                pushFlyer(dyC, dzC, xO, rOut, xI, rIn, 0.28, spRC * 0.34, spRC * 0.24, rIceC * 1.22);
              }
            });
            // Flanking cluster of delicate corner belfry pinnacles around the crossing spire
            for (var fl = 0; fl < cl.nFlank; fl++) {
              var signA = (fl % 2 === 0 ? 1 : -1);
              var ringStep = Math.floor(fl / 2) + 1;
              var flPhi = spinePhi + signA * cl.flankSpread * ringStep;
              if (!isSpireClear(flPhi, cl.tBase, tTipC + 0.05, 0.08)) continue;
              var fDirY = Math.cos(flPhi), fDirZ = Math.sin(flPhi);
              var rFl = Math.max(hullRadAt(cl.tBase, flPhi) + spRC * 1.2, rTowerC - spRC * (0.55 * ringStep));
              pushAxialSpire(xBaseC + lenC * 0.06, rFl * fDirY, rFl * fDirZ, spRC * 0.44, lenC * (0.72 - 0.12 * ringStep), false);
              var xTie = xBaseC + lenC * 0.22;
              pushSegment(flyList, xTie, rTowerC * dyC, rTowerC * dzC, xTie, rFl * fDirY, rFl * fDirZ, spRC * 0.18);
            }
          });
        });

        // Also place monumental aft-of-pylon choir crossing spires on the pylon meridians so broadside profiles
        // have soaring dorsal/ventral cathedral spire silhouettes above and below the main nave!
        [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5].forEach(function (mPhi) {
          var tB2 = 0.78, tT2 = 0.54;
          if (tB2 > aftEnd - 0.04) return;
          if (!isSpireClear(mPhi, tB2, tT2, 0.08)) return;
          var frM = ctx.evalSurfaceFrame(false, tB2, mPhi, 0.996);
          var rSM = Math.hypot(frM.pt.y, frM.pt.z);
          if (rSM < 1e-3) return;
          var dyM = frM.pt.y / rSM, dzM = frM.pt.z / rSM;
          var rIceM = iceShieldR(dyM, dzM);
          var spRM = s * 0.090 * (0.85 + 0.18 * w);
          var rTM = clamp(rSM + s * 0.36, rSM + spRM * 1.8, rIceM * 0.96);
          var xBM = frM.pt.x - s * 0.06;
          var xTM = ctx.seamX - tT2 * aftSpan;
          var lenM = xTM - xBM;
          if (lenM > s * 0.8) {
            pushAxialSpire(xBM, rTM * dyM, rTM * dzM, spRM, lenM, true);
            [0.14, 0.44].forEach(function (ff2) {
              var xO2 = xBM + lenM * ff2;
              var xI2 = xO2 + lenM * 0.22;
              var tIn2 = clamp((ctx.seamX - xI2) / aftSpan, 0.04, 0.95);
              var rIn2 = hullRadAt(tIn2, mPhi) + s * 0.01;
              if (rTM - spRM * 0.45 > rIn2 + s * 0.08) {
                pushFlyer(dyM, dzM, xO2, rTM - spRM * 0.45, xI2, rIn2, 0.26, spRM * 0.32, spRM * 0.22, rIceM * 0.96);
              }
            });
          }
        });

        // ---- C. Free-standing slender outer pier forest (12 piers/ring) tied by triple flying buttresses ----
        var pierTiers = [
          // Outer crown: 12 tall razor-slender crocketed needle piers hugging the glacier rim
          { n: 12, phOff: 0.5, tBase: 0.54, tTip: 0.065, rFrac: 0.96, spK: 0.056, nFly: 3, major: true },
          // Mid choir ring, staggered between the outer piers
          { n: 12, phOff: 0.0, tBase: 0.70, tTip: 0.20, rFrac: 0.77, spK: 0.048, nFly: 2, major: false },
          // Inner apse ring stepping down toward the stern
          { n: 10, phOff: 0.5, tBase: 0.83, tTip: 0.40, rFrac: 0.55, spK: 0.042, nFly: 2, major: false }
        ];
        pierTiers.forEach(function (tier) {
          if (tier.tBase > aftEnd - 0.04) return;
          var nP = Math.max(6, Math.round(tier.n * Math.min(1, detail + 0.2)));
          var phOff = tier.phOff * (CATH_TAU / nP);
          for (var pi = 0; pi < nP; pi++) {
            var phi = (pi / nP) * CATH_TAU + phOff;
            var tTipS = tier.tTip;
            if (!isSpireClear(phi, tier.tBase, tTipS, 0.10)) continue;
            var fr = ctx.evalSurfaceFrame(false, tier.tBase, phi, 0.996);
            var rSurf = Math.hypot(fr.pt.y, fr.pt.z);
            if (rSurf < 1e-3) continue;
            var dirY = fr.pt.y / rSurf, dirZ = fr.pt.z / rSurf;
            var rIce = iceShieldR(dirY, dirZ);
            var jit = 0.94 + 0.12 * rng();
            var spR = s * tier.spK * (0.82 + 0.22 * w) * jit;
            var rTower = clamp(rIce * tier.rFrac, rSurf + spR * 1.6, rIce * 1.0 - spR * 0.45);

            var tTip = tTipS;
            var guard = 0;
            while (guard < 14 && tTip < tier.tBase - 0.12 && rTower < hullRadAt(tTip, phi) + spR * 1.5) {
              tTip += 0.02;
              guard++;
            }
            var xBase = fr.pt.x - s * 0.04;
            var xTip = Math.min(ctx.seamX - 0.16, ctx.seamX - tTip * aftSpan);
            var spLen = xTip - xBase;
            if (spLen < s * 0.9) continue;

            // 1) razor-slender crocketed fleche pier
            pushAxialSpire(xBase, rTower * dirY, rTower * dirZ, spR, spLen, true);

            // 2) double/triple-tier thin flying-buttress arches springing from the pier to the hull rib line
            var flyFr = [0.10, 0.34, 0.58];
            for (var fi = 0; fi < tier.nFly; fi++) {
              var xO = xBase + spLen * flyFr[fi];
              var span = spLen * (0.19 - fi * 0.015);
              var xI = Math.min(ctx.seamX - 0.25, xO + span);
              var tIn = clamp((ctx.seamX - xI) / aftSpan, 0.02, 0.96);
              var rIn = hullRadAt(tIn, phi) + s * 0.010;
              var rOut = rTower - spR * 0.55;
              if (rOut > rIn + s * 0.10) {
                pushFlyer(dirY, dirZ, xO, rOut, xI, rIn, 0.26, spR * 0.36, spR * 0.26, rIce * 0.995);
              }
            }

            // 3) outboard pinnacle capping the pier where the upper flyer lands its thrust
            if (tier.major || tier.nFly >= 2) {
              var xCap = xBase + spLen * flyFr[tier.nFly - 1];
              var rCap = Math.min(rIce * 1.01, rTower + spR * 1.55);
              if (rCap > rTower + spR * 0.9) {
                pushAxialSpire(xCap - s * 0.02, rCap * dirY, rCap * dirZ, spR * 0.42, spLen * (tier.major ? 0.32 : 0.22), false);
                pushSegment(flyList, xCap, rTower * dirY, rTower * dirZ, xCap, rCap * dirY, rCap * dirZ, spR * 0.22);
              }
            }

            // 4) tiny warm sanctuary bead glowing where the lowest flyer meets the pier
            if (rng() < 0.75) {
              tmpMat.compose(
                new T.Vector3(xBase + spLen * 0.10, (rTower - spR * 1.05) * dirY, (rTower - spR * 1.05) * dirZ),
                new T.Quaternion(),
                new T.Vector3(s * 0.012, s * 0.012, s * 0.012)
              );
              lanterns.push(tmpMat.clone());
            }
          }
        });

        // Twin slender needle pinnacles flanking each engine spar root (pylon bell-tower flankers)
        var rolls = ctx.rollAngles || [0, Math.PI];
        rolls.forEach(function (rPhi) {
          var phiPylon = rPhi + Math.PI * 0.5;
          var pRoot = 0.46;
          if (pRoot > aftEnd - 0.08) return;
          [-0.28, 0.28].forEach(function (dPhi) {
            var pPhi = phiPylon + dPhi;
            var frSide = ctx.evalSurfaceFrame(false, pRoot, pPhi, 1.0);
            var rS = Math.hypot(frSide.pt.y, frSide.pt.z);
            if (rS > 1e-3) {
              var dy = frSide.pt.y / rS, dz = frSide.pt.z / rS;
              var rP = rS + s * 0.10;
              pushAxialSpire(frSide.pt.x - s * 0.04, rP * dy, rP * dz, s * 0.032, s * 2.1, false);
            }
          });
        });

        // Clean slender axial concrete stern spire + 6-pinnacle stern crown closing the rear apex (-X)
        if (aftEnd > 0.82) {
          var xSternTip = ctx.seamX - aftEnd * aftSpan;
          tmpMat.compose(new T.Vector3(xSternTip + s * 0.20, 0, 0), aftAxisQuat, new T.Vector3(s * 0.085, s * 1.75, s * 0.085));
          spireMats.push(tmpMat.clone());
          for (var scI = 0; scI < 6; scI++) {
            var scPhi = scI * (CATH_TAU / 6) + Math.PI / 6;
            var scR = s * 0.20;
            pushAxialSpire(xSternTip + s * 0.18, scR * Math.cos(scPhi), scR * Math.sin(scPhi), s * 0.030, s * 1.25, false);
          }
        }
      }

      // Narrow dark-concrete axial parapet crown ahead of seam if forward bow ice is pulled back
      if (foreMinBare > 0.08) {
        var fEndC = Math.min(0.18, foreMinBare - 0.02);
        [0.015, fEndC].forEach(function (pp) {
          addRing(ctx, grp, true, pp, s * 0.030, flourishTrimMat, s * 0.036);
        });
        for (var fc = 0; fc < 12; fc++) {
          var phiF = (fc / 12) * Math.PI * 2;
          var frF = ctx.evalSurfaceFrame(true, fEndC * 0.5, phiF, 0.994);
          var rF = Math.hypot(frF.pt.y, frF.pt.z);
          if (rF > 1e-3) {
            pushAxialSpire(frF.pt.x - s * 0.10, frF.pt.y * 1.02, frF.pt.z * 1.02, s * 0.040, s * 0.62, false);
          }
        }
      }

      safeCommit(ctx, makeCathedralSpireGeo(T), spireConcreteMat, spireMats, grp);
      safeCommit(ctx, makeCathedralPinnacleGeo(T), flourishTrimMat, pinMats, grp);
      safeCommit(ctx, makeCathedralGableGeo(T), flourishTrimMat, gableMats, grp);
      safeCommit(ctx, makeCathedralWindowFrameGeo(T), darkConcreteMat, winFrames, grp);
      safeCommit(ctx, makeCathedralWindowGlassGeo(T), glassMat, winGlass, grp);
      safeCommit(ctx, U.cyl8, flourishTrimMat, ribList, grp);
      safeCommit(ctx, U.cyl8.clone(), flourishTrimMat, vaultList, grp);
      safeCommit(ctx, U.cyl8.clone(), spireConcreteMat, flyList, grp);
      safeCommit(ctx, U.sphere, flourishTrimMat, bossList, grp);
      safeCommit(ctx, makeDiscGeo(T, 36), roseMat, roses, grp);
      var rrGeoC = new T.TorusGeometry(1, 0.09, 8, 36);
      rrGeoC.rotateX(-Math.PI * 0.5);
      safeCommit(ctx, rrGeoC, flourishTrimMat, roseRings, grp);
      safeCommit(ctx, U.box.clone(), lanternMat, lanterns, grp);

      ctx.rootGroup.add(grp);
    }
  };

  root.LighthuggerStyleKits = root.LighthuggerStyleKits || {};
  root.LighthuggerStyleKits.gothic = gothicKit;
  root.LighthuggerStyleKits.sleek = sleekKit;
  root.LighthuggerStyleKits.coade = coadeKit;
  root.LighthuggerStyleKits.dune = duneKit;
  root.LighthuggerStyleKits.cathedral = cathedralKit;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
