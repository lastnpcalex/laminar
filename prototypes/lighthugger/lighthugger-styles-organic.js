/**
 * LighthuggerStylesOrganic - Blended 3D organic & biomechanical hull style kits
 * for window.LighthuggerStyleKits:
 *   1. gnostic (P.styleGnostic 0..1) - Gnostic Ascension / Melding Plague
 *   2. giger   (P.styleGiger   0..1) - H.R. Giger Biomech / Black Xenomorph
 *
 * Pure ASCII, UMD-compatible, static cached procedural CanvasTextures, and
 * per-build material tracking via ctx.trackMat(mat).
 */
(function (root) {
  'use strict';

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
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
    var mul = (ctx && ctx.G && typeof ctx.G.mulberry32 === 'function')
      ? ctx.G.mulberry32
      : fallbackMulberry32;
    var base = 0x51a7b39d;
    if (ctx && typeof ctx.rng === 'function') {
      base = Math.floor(ctx.rng() * 2147483647) | 0;
    }
    return mul((base ^ salt) | 0);
  }

  // Compute smooth normalized blending share across all 5 active style sliders.
  function computeStyleShare(P, ownKey) {
    var w = clamp(Number(P && P[ownKey]) || 0, 0, 1);
    if (w <= 0.02) return { w: 0, share: 0, isTexOwner: false };
    var keys = ['styleGnostic', 'styleGothic', 'styleSleek', 'styleGiger', 'styleCoade', 'styleDune', 'styleCathedral'];
    var otherSum = 0;
    var maxOther = 0;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k === ownKey) continue;
      var wk = clamp(Number(P && P[k]) || 0, 0, 1);
      otherSum += wk;
      if (wk > maxOther) maxOther = wk;
    }
    var share = otherSum <= 0.02 ? w : clamp(w / Math.max(1.0, w + otherSum * 0.65), 0, 1);
    var isTexOwner = w >= 0.25 && w >= maxOther;
    return { w: w, share: share, isTexOwner: isTexOwner };
  }

  // ---------------------------------------------------------------------------
  // Static Procedural CanvasTextures (512x512, cached once per Three instance)
  // ---------------------------------------------------------------------------
  var TEX_CACHE = null;
  var TEX_CACHE_T = null;

  function makeCanvas(w, h) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    var g = c.getContext && c.getContext('2d');
    if (!g) return null;
    return { canvas: c, ctx: g };
  }

  function wrapDraw(w, h, fn) {
    for (var ox = -w; ox <= w; ox += w) {
      for (var oy = -h; oy <= h; oy += h) {
        fn(ox, oy);
      }
    }
  }

  function finishTex(T, c, isSRGB, repX, repY) {
    var tex = new T.CanvasTexture(c);
    tex.wrapS = T.RepeatWrapping;
    tex.wrapT = T.RepeatWrapping;
    if (repX && repY) tex.repeat.set(repX, repY);
    if (isSRGB && T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  }

  function createGnosticTextures(T) {
    // Lore-accurate Revelation Space Melding Plague (Nostalgia for Infinity):
    // Charred gunmetal & blackened iron hull warped by nanotech corruption into melted baroque
    // ribs, fused metallic striations, oxidized rust seams, and subtle deep arterial ember cracks.
    var W = 512, H = 512;
    var alb = makeCanvas(W, H);
    var bmp = makeCanvas(W, H);
    var ems = makeCanvas(W, H);
    if (!alb || !bmp || !ems) return null;

    var ga = alb.ctx, gb = bmp.ctx, ge = ems.ctx;
    var r = fallbackMulberry32(71041);

    // Charred obsidian-gunmetal base (Nostalgia for Infinity dark armored hull)
    ga.fillStyle = '#191a20';
    ga.fillRect(0, 0, W, H);
    gb.fillStyle = '#767676';
    gb.fillRect(0, 0, W, H);
    ge.fillStyle = '#000000';
    ge.fillRect(0, 0, W, H);

    // Warped, partially melted hull plating grid
    ga.strokeStyle = 'rgba(7, 7, 10, 0.85)';
    gb.strokeStyle = 'rgba(26, 26, 26, 0.85)';
    ga.lineWidth = 2;
    gb.lineWidth = 2;
    for (var py = 0; py < H; py += 64) {
      ga.beginPath(); ga.moveTo(0, py); ga.lineTo(W, py); ga.stroke();
      gb.beginPath(); gb.moveTo(0, py); gb.lineTo(W, py); gb.stroke();
    }
    for (var px = 0; px < W; px += 128) {
      ga.beginPath(); ga.moveTo(px, 0); ga.lineTo(px, H); ga.stroke();
      gb.beginPath(); gb.moveTo(px, 0); gb.lineTo(px, H); gb.stroke();
    }

    // Oxidized iron-rust, charred graphite, and dark tarnished pewter plaque zones
    for (var pi = 0; pi < 40; pi++) {
      var cx = r() * W;
      var cy = r() * H;
      var rad = 26 + r() * 72;
      var kind = r();
      var colA = kind < 0.50
        ? 'rgba(42, 43, 50, 0.54)'
        : kind < 0.80
          ? 'rgba(74, 46, 36, 0.42)'
          : 'rgba(62, 56, 54, 0.44)';
      var bumpMid = kind < 0.50 ? 'rgba(54, 54, 54, 0.44)' : 'rgba(182, 182, 182, 0.36)';
      wrapDraw(W, H, function (ox, oy) {
        var grA = ga.createRadialGradient(cx + ox, cy + oy, 3, cx + ox, cy + oy, rad);
        grA.addColorStop(0.0, colA);
        grA.addColorStop(0.65, kind < 0.80 ? 'rgba(30, 26, 28, 0.25)' : 'rgba(48, 34, 28, 0.22)');
        grA.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
        ga.fillStyle = grA;
        ga.beginPath();
        ga.arc(cx + ox, cy + oy, rad, 0, Math.PI * 2);
        ga.fill();

        var grB = gb.createRadialGradient(cx + ox, cy + oy, 3, cx + ox, cy + oy, rad);
        grB.addColorStop(0.0, bumpMid);
        grB.addColorStop(1.0, 'rgba(120, 120, 120, 0)');
        gb.fillStyle = grB;
        gb.beginPath();
        gb.arc(cx + ox, cy + oy, rad, 0, Math.PI * 2);
        gb.fill();
      });
    }

    // Melted, weeping metallic striations & fused baroque iron tendrils flowing across plating
    for (var bi = 0; bi < 140; bi++) {
      var bx = r() * W;
      var by = r() * H;
      var len = 26 + r() * 82;
      var ang = (r() - 0.5) * 0.58;
      var bw = 1.4 + r() * 3.4;
      var dx = Math.cos(ang) * len;
      var dy = Math.sin(ang) * len;
      var tone = r();
      var curveSag = (r() - 0.5) * 16;
      ga.strokeStyle = tone < 0.55
        ? 'rgba(98, 94, 96, 0.36)'
        : 'rgba(124, 84, 62, 0.28)';
      ga.lineWidth = bw;
      gb.strokeStyle = 'rgba(222, 222, 222, 0.48)';
      gb.lineWidth = bw;
      wrapDraw(W, H, function (ox, oy) {
        ga.beginPath();
        ga.moveTo(bx + ox, by + oy);
        ga.quadraticCurveTo(bx + ox + dx * 0.5, by + oy + dy * 0.5 + curveSag, bx + ox + dx, by + oy + dy);
        ga.stroke();
        gb.beginPath();
        gb.moveTo(bx + ox, by + oy);
        gb.lineTo(bx + ox + dx, by + oy + dy);
        gb.stroke();
      });
    }

    // Cracked nanotech fracture seams & deep arterial ember fissures (NO neon-green slime!)
    for (var vi = 0; vi < 28; vi++) {
      var vx = r() * W;
      var vy = r() * H;
      var pts = [{ x: vx, y: vy }];
      var dir = r() * Math.PI * 2;
      var segs = 7 + Math.floor(r() * 6);
      for (var vs = 0; vs < segs; vs++) {
        dir += (r() - 0.5) * 0.90;
        vx += Math.cos(dir) * (16 + r() * 20);
        vy += Math.sin(dir) * (16 + r() * 20);
        pts.push({ x: vx, y: vy });
      }
      var isCrimson = r() < 0.45;
      var showVeinEm = (vi % 2 === 0 || r() < 0.42);
      var lw = 1.8 + r() * 2.4;
      var glowCol = isCrimson ? 'rgba(224, 72, 34, 0.72)' : 'rgba(255, 148, 56, 0.68)';
      var haloCol = isCrimson ? 'rgba(160, 32, 16, 0.22)' : 'rgba(196, 86, 22, 0.20)';

      wrapDraw(W, H, function (ox, oy) {
        ga.strokeStyle = 'rgba(8, 7, 10, 0.86)';
        ga.lineWidth = lw + 2.4;
        ga.lineCap = 'round';
        ga.beginPath();
        ga.moveTo(pts[0].x + ox, pts[0].y + oy);
        for (var k = 1; k < pts.length; k++) ga.lineTo(pts[k].x + ox, pts[k].y + oy);
        ga.stroke();

        ga.strokeStyle = isCrimson ? 'rgba(116, 56, 42, 0.62)' : 'rgba(118, 92, 68, 0.58)';
        ga.lineWidth = lw * 0.85;
        ga.stroke();

        gb.strokeStyle = 'rgba(224, 224, 224, 0.65)';
        gb.lineWidth = lw;
        gb.lineCap = 'round';
        gb.beginPath();
        gb.moveTo(pts[0].x + ox, pts[0].y + oy);
        for (var k2 = 1; k2 < pts.length; k2++) gb.lineTo(pts[k2].x + ox, pts[k2].y + oy);
        gb.stroke();

        if (showVeinEm) {
          ge.lineCap = 'round';
          ge.strokeStyle = haloCol;
          ge.lineWidth = lw * 2.2;
          ge.beginPath();
          ge.moveTo(pts[0].x + ox, pts[0].y + oy);
          for (var k3 = 1; k3 < pts.length; k3++) ge.lineTo(pts[k3].x + ox, pts[k3].y + oy);
          ge.stroke();

          ge.strokeStyle = glowCol;
          ge.lineWidth = Math.max(1.0, lw * 0.42);
          ge.stroke();
        }
      });
    }

    // Recessed warped viewport slits & melted nanotech ulceration pits
    for (var ci = 0; ci < 52; ci++) {
      var px0 = r() * W;
      var py0 = r() * H;
      var pr = 4 + r() * 11;
      var litPit = r() < 0.48;
      wrapDraw(W, H, function (ox, oy) {
        var cxp = px0 + ox;
        var cyp = py0 + oy;
        if (cxp + pr * 1.6 < 0 || cxp - pr * 1.6 > W || cyp + pr * 1.6 < 0 || cyp - pr * 1.6 > H) return;

        var grAl = ga.createRadialGradient(cxp, cyp, pr * 0.15, cxp, cyp, pr * 1.2);
        grAl.addColorStop(0.0, litPit ? 'rgba(196, 86, 36, 0.85)' : 'rgba(16, 14, 18, 0.92)');
        grAl.addColorStop(0.55, 'rgba(32, 30, 34, 0.88)');
        grAl.addColorStop(0.84, 'rgba(92, 86, 84, 0.78)');
        grAl.addColorStop(1.0, 'rgba(20, 20, 24, 0)');
        ga.fillStyle = grAl;
        ga.beginPath();
        ga.arc(cxp, cyp, pr * 1.2, 0, Math.PI * 2);
        ga.fill();

        var grBm = gb.createRadialGradient(cxp, cyp, pr * 0.1, cxp, cyp, pr * 1.2);
        grBm.addColorStop(0.0, 'rgba(22, 22, 22, 0.94)');
        grBm.addColorStop(0.58, 'rgba(64, 64, 64, 0.80)');
        grBm.addColorStop(0.84, 'rgba(240, 240, 240, 0.92)');
        grBm.addColorStop(1.0, 'rgba(120, 120, 120, 0)');
        gb.fillStyle = grBm;
        gb.beginPath();
        gb.arc(cxp, cyp, pr * 1.2, 0, Math.PI * 2);
        gb.fill();

        if (litPit) {
          var grEm = ge.createRadialGradient(cxp, cyp, 0.8, cxp, cyp, pr * 0.72);
          grEm.addColorStop(0.0, 'rgba(255, 174, 88, 0.92)');
          grEm.addColorStop(0.50, 'rgba(210, 64, 28, 0.55)');
          grEm.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
          ge.fillStyle = grEm;
          ge.beginPath();
          ge.arc(cxp, cyp, pr * 0.72, 0, Math.PI * 2);
          ge.fill();
        }
      });
    }

    // Fine pinprick surviving deck windows shining dimly through the plagued hull
    for (var sp = 0; sp < 160; sp++) {
      var sx = r() * W;
      var sy = r() * H;
      var sw = 1.6 + r() * 2.4;
      ge.fillStyle = r() < 0.38 ? 'rgba(232, 82, 38, 0.82)' : 'rgba(255, 174, 82, 0.86)';
      ge.fillRect(sx, sy, sw, 1.4 + r() * 1.8);
    }

    return {
      plagueAlbedoTex: finishTex(T, alb.canvas, true, 2, 2),
      plagueBumpTex: finishTex(T, bmp.canvas, false, 2, 2),
      plagueEmissiveTex: finishTex(T, ems.canvas, true, 2, 2)
    };
  }

  function createGigerTextures(T) {
    var W = 512, H = 512;
    var alb = makeCanvas(W, H);
    var bmp = makeCanvas(W, H);
    if (!alb || !bmp) return null;

    var ga = alb.ctx, gb = bmp.ctx;
    var r = fallbackMulberry32(84299);

    // Pitch-black glossy wet exoskeleton base
    ga.fillStyle = '#090b10';
    ga.fillRect(0, 0, W, H);
    gb.fillStyle = '#606060';
    gb.fillRect(0, 0, W, H);

    // Broad sleek oily obsidian sheen bands
    var grad = ga.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0.00, 'rgba(12, 15, 22, 0.8)');
    grad.addColorStop(0.28, 'rgba(30, 35, 48, 0.45)');
    grad.addColorStop(0.50, 'rgba(8, 10, 15, 0.9)');
    grad.addColorStop(0.78, 'rgba(26, 31, 42, 0.45)');
    grad.addColorStop(1.00, 'rgba(12, 15, 22, 0.8)');
    ga.fillStyle = grad;
    ga.fillRect(0, 0, W, H);

    // Repetitive segmented bone-rib flutes across longitudinal tracks (seamless 16px period)
    var flutePeriod = 16;
    for (var y = 0; y < H; y += flutePeriod) {
      ga.fillStyle = 'rgba(6, 7, 11, 0.92)';
      ga.fillRect(0, y, W, 5);
      ga.fillStyle = 'rgba(36, 41, 52, 0.55)';
      ga.fillRect(0, y + 6, W, 6);
      ga.fillStyle = 'rgba(72, 82, 104, 0.32)';
      ga.fillRect(0, y + 8, W, 2);

      gb.fillStyle = 'rgba(22, 22, 22, 0.88)';
      gb.fillRect(0, y, W, 5);
      gb.fillStyle = 'rgba(210, 210, 210, 0.82)';
      gb.fillRect(0, y + 6, W, 7);
      gb.fillStyle = 'rgba(244, 244, 244, 0.65)';
      gb.fillRect(0, y + 8, W, 3);
    }

    // Longitudinal braided biomechanical cable conduits & sulcus troughs
    var nStripes = 16;
    var stripeW = W / nStripes;
    for (var si = 0; si < nStripes; si++) {
      var sx = si * stripeW;
      var isHoseBand = si % 3 === 1;
      if (isHoseBand) {
        // Dark deep anatomical recessed hose channel
        ga.fillStyle = 'rgba(7, 8, 12, 0.92)';
        ga.fillRect(sx + 2, 0, stripeW - 4, H);
        gb.fillStyle = 'rgba(24, 24, 24, 0.92)';
        gb.fillRect(sx + 2, 0, stripeW - 4, H);

        // Twin corrugated cables inside channel
        var cOff = [stripeW * 0.34, stripeW * 0.66];
        for (var ci = 0; ci < cOff.length; ci++) {
          var cx = sx + cOff[ci];
          ga.fillStyle = 'rgba(26, 30, 40, 0.95)';
          ga.fillRect(cx - 4, 0, 8, H);
          ga.fillStyle = 'rgba(62, 70, 90, 0.48)';
          ga.fillRect(cx - 1.2, 0, 2.4, H);
          gb.fillStyle = 'rgba(196, 196, 196, 0.92)';
          gb.fillRect(cx - 4, 0, 8, H);
          // Corrugation ticks every 8px
          for (var ty = 0; ty < H; ty += 8) {
            ga.fillStyle = 'rgba(4, 5, 8, 0.85)';
            ga.fillRect(cx - 4.5, ty, 9, 2.2);
            gb.fillStyle = 'rgba(32, 32, 32, 0.92)';
            gb.fillRect(cx - 4.5, ty, 9, 2.4);
          }
        }
      } else {
        // Smooth chitin armor strake with wet-ink seam highlight
        ga.fillStyle = 'rgba(18, 22, 31, 0.52)';
        ga.fillRect(sx + 4, 0, stripeW - 8, H);
        ga.fillStyle = 'rgba(56, 64, 82, 0.25)';
        ga.fillRect(sx + 6, 0, 2, H);
        gb.fillStyle = 'rgba(164, 164, 164, 0.42)';
        gb.fillRect(sx + 4, 0, stripeW - 8, H);
      }
    }

    // Interlocking cranial skull-plate seams & anatomical vertebra sockets
    for (var ri = 0; ri < 24; ri++) {
      var rx = r() * W;
      var ry = r() * H;
      var rr = 10 + r() * 20;
      wrapDraw(W, H, function (ox, oy) {
        var cxr = rx + ox;
        var cyr = ry + oy;
        if (cxr + rr * 2 < 0 || cxr - rr * 2 > W || cyr + rr * 2 < 0 || cyr - rr * 2 > H) return;

        var gAl = ga.createRadialGradient(cxr, cyr, rr * 0.2, cxr, cyr, rr * 1.15);
        gAl.addColorStop(0.0, 'rgba(4, 5, 8, 0.96)');
        gAl.addColorStop(0.58, 'rgba(36, 41, 52, 0.88)');
        gAl.addColorStop(0.84, 'rgba(68, 76, 94, 0.55)');
        gAl.addColorStop(1.0, 'rgba(9, 11, 16, 0)');
        ga.fillStyle = gAl;
        ga.beginPath();
        ga.arc(cxr, cyr, rr * 1.15, 0, Math.PI * 2);
        ga.fill();

        var gBm = gb.createRadialGradient(cxr, cyr, rr * 0.15, cxr, cyr, rr * 1.15);
        gBm.addColorStop(0.0, 'rgba(12, 12, 12, 0.96)');
        gBm.addColorStop(0.62, 'rgba(232, 232, 232, 0.95)');
        gBm.addColorStop(0.88, 'rgba(40, 40, 40, 0.72)');
        gBm.addColorStop(1.0, 'rgba(120, 120, 120, 0)');
        gb.fillStyle = gBm;
        gb.beginPath();
        gb.arc(cxr, cyr, rr * 1.15, 0, Math.PI * 2);
        gb.fill();
      });
    }

    return {
      gigerAlbedoTex: finishTex(T, alb.canvas, true, 3, 2),
      gigerBumpTex: finishTex(T, bmp.canvas, false, 3, 2)
    };
  }

  function getTextures(T) {
    if (TEX_CACHE && TEX_CACHE_T === T) return TEX_CACHE;
    if (typeof document === 'undefined' || !document.createElement) return null;
    var gn = createGnosticTextures(T);
    var gi = createGigerTextures(T);
    if (!gn && !gi) return null;
    TEX_CACHE = {
      plagueAlbedoTex: gn ? gn.plagueAlbedoTex : null,
      plagueBumpTex: gn ? gn.plagueBumpTex : null,
      plagueEmissiveTex: gn ? gn.plagueEmissiveTex : null,
      gigerAlbedoTex: gi ? gi.gigerAlbedoTex : null,
      gigerBumpTex: gi ? gi.gigerBumpTex : null
    };
    TEX_CACHE_T = T;
    return TEX_CACHE;
  }

  // ---------------------------------------------------------------------------
  // Shared Organic & Biomech Procedural Geometry Builders
  // ---------------------------------------------------------------------------
  function makePlagueBoilGeo(T, detail) {
    var geo = new T.IcosahedronGeometry(1.0, detail);
    var pos = geo.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i);
      var y = pos.getY(i);
      var z = pos.getZ(i);
      var lobe = 1.0 + 0.24 * Math.sin(x * 4.3 + y * 2.9) +
        0.16 * Math.cos(z * 5.1 - x * 3.2) +
        0.10 * Math.sin((y + z) * 7.4);
      var ySquash = y < 0 ? 0.55 : 0.92;
      pos.setXYZ(i, x * lobe, y * lobe * ySquash, z * lobe);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  function makeBoneSpurGeo(T) {
    var sh = new T.Shape();
    sh.moveTo(-0.36, -0.18);
    sh.lineTo(0.38, -0.18);
    sh.lineTo(0.28, 0.16);
    sh.lineTo(0.14, 0.48);
    sh.lineTo(-0.08, 0.86);
    sh.lineTo(-0.24, 1.02);
    sh.lineTo(-0.32, 0.72);
    sh.lineTo(-0.22, 0.34);
    sh.lineTo(-0.38, 0.08);
    sh.closePath();
    var geo = new T.ExtrudeGeometry(sh, {
      depth: 0.28,
      bevelEnabled: true,
      bevelThickness: 0.07,
      bevelSize: 0.06,
      bevelSegments: 1
    });
    geo.translate(0, 0, -0.14);
    geo.computeVertexNormals();
    return geo;
  }

  function makeGigerVertebraGeo(T) {
    var sh = new T.Shape();
    sh.moveTo(-0.48, -0.16);
    sh.lineTo(0.48, -0.16);
    sh.lineTo(0.36, 0.18);
    sh.lineTo(0.12, 0.58);
    sh.lineTo(-0.26, 1.00);
    sh.lineTo(-0.44, 0.94);
    sh.lineTo(-0.22, 0.46);
    sh.lineTo(-0.38, 0.14);
    sh.closePath();
    var geo = new T.ExtrudeGeometry(sh, {
      depth: 0.22,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.05,
      bevelSegments: 1
    });
    geo.translate(0, 0, -0.11);
    geo.computeVertexNormals();
    return geo;
  }

  function makeGigerRibSegGeo(T) {
    var geo = new T.CylinderGeometry(0.42, 0.48, 1.0, 8);
    geo.rotateX(Math.PI * 0.5);
    return geo;
  }

  function makeGigerDomeGeo(T, segU, segV) {
    var geo = new T.SphereGeometry(1.0, segU || 26, segV || 18);
    var pos = geo.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i);
      var y = pos.getY(i);
      var z = pos.getZ(i);
      // Elongated Xenomorph cranial dome: rounded bulbous +X brow, tapered swept -X tail
      var aftTaper = x < 0 ? (1.0 - 0.52 * Math.pow(-x, 1.35)) : (1.0 + 0.08 * Math.sin(x * Math.PI));
      var crownArch = y > 0
        ? (0.84 + 0.26 * Math.cos(x * 1.15) - 0.14 * Math.max(0, -x))
        : 0.36;
      var keel = y > 0.25 ? (1.0 + 0.08 * Math.exp(-z * z * 8.0)) : 1.0;
      pos.setXYZ(i, x, y * crownArch * keel, z * aftTaper);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  function makeFlushTorusGeo(T, rTube, radialSegs, tubularSegs) {
    var geo = new T.TorusGeometry(1.0, rTube, radialSegs, tubularSegs);
    geo.rotateX(Math.PI * 0.5);
    return geo;
  }

  function makeAxialTorusGeo(T, rTube, radialSegs, tubularSegs) {
    var geo = new T.TorusGeometry(1.0, rTube, radialSegs, tubularSegs);
    geo.rotateY(Math.PI * 0.5);
    return geo;
  }

  // Estimate outer ice surface lift above bare hull so features never vanish under ice
  function estimateIceLift(ctx, isFore, param) {
    if (!ctx.icePresent || ctx.hideIce) return 0;
    var P = ctx.P || {};
    var gScale = ctx.girthScale || 1.0;
    var thick = clamp(Number(P.iceThick) || 0, 0, 1);
    var base = lerp(0.02, 0.20, thick) * gScale;
    var crag = clamp(Number(P.crags) || 0, 0, 1) * 0.08 * gScale;
    if (isFore && P.hullShape === 'long-patience') {
      base = Math.max(base, (0.04 + 0.22 * thick) * gScale);
    }
    var edgeFade = clamp(param * 6.0, 0.2, 1.0) * (1.0 - Math.pow(clamp(param, 0, 1), 3.0) * 0.75);
    return (base + crag) * edgeFade;
  }

  function safeBareEnd(fn, phi, fallback) {
    if (typeof fn !== 'function') return fallback;
    var v = fn(phi);
    return isFinite(v) ? v : fallback;
  }

  function pickClearOrOffset(keepout, prefPhi, param, pad) {
    if (!keepout || typeof keepout.isBlocked !== 'function') return { phi: prefPhi, ok: true };
    if (!keepout.isBlocked(prefPhi, param, pad)) return { phi: prefPhi, ok: true };
    if (typeof keepout.pickClearPhi === 'function') {
      var cand = keepout.pickClearPhi(prefPhi, param, pad);
      if (!keepout.isBlocked(cand, param, pad * 0.6)) return { phi: cand, ok: true };
    }
    return { phi: prefPhi, ok: false };
  }

  function buildTubeMesh(T, pts, radius, tubularSegs, radialSegs, mat) {
    if (!pts || pts.length < 3 || !T.CatmullRomCurve3 || !T.TubeGeometry) return null;
    var curve = new T.CatmullRomCurve3(pts);
    var geo = new T.TubeGeometry(curve, tubularSegs, radius, radialSegs, false);
    return new T.Mesh(geo, mat);
  }

  function safeSetNormalScale(mat, scaleFactor) {
    if (mat && mat.normalMap && mat.normalScale) {
      mat.userData = mat.userData || {};
      if (mat.userData._baseNormalScaleX == null) {
        mat.userData._baseNormalScaleX = mat.normalScale.x;
        mat.userData._baseNormalScaleY = mat.normalScale.y;
      }
      var k = clamp(scaleFactor, 0.2, 1.0);
      mat.normalScale.set(mat.userData._baseNormalScaleX * k, mat.userData._baseNormalScaleY * k);
    }
  }

  // ---------------------------------------------------------------------------
  // 1. GNOSTIC ASCENSION KIT (Plague-Ridden / Melding Plague)
  // ---------------------------------------------------------------------------
  var gnosticKit = {
    id: 'gnostic',
    weightKey: 'styleGnostic',

    applyMaterials: function (ctx) {
      if (!ctx || !ctx.T || !ctx.P || !ctx.mats) return;
      var T = ctx.T;
      var P = ctx.P;
      var st = computeStyleShare(P, 'styleGnostic');
      if (st.w <= 0.02) return;

      var w = st.w;
      var bw = st.share;
      var mats = ctx.mats;
      var tex = getTextures(T);

      // Lore-accurate Nostalgia for Infinity Melding Plague palette:
      // Charred gunmetal, blackened obsidian-iron, corroded bone-pewter, & deep arterial crimson-amber
      var colCharredIron = new T.Color(0x282930);
      var colObsidianDark = new T.Color(0x16171d);
      var colHullPlague = new T.Color(0x52525c);
      var colCorrodedAlloy = new T.Color(0x7c746c);
      var colArterialRed = new T.Color(0xd94b26);
      var colEmberAmber = new T.Color(0xff9238);
      var colDeepEmber = new T.Color(0x3a180d);
      var colIceChar = new T.Color(0x9ca4ae);
      var colIceEm = new T.Color(0x1b222c);

      if (mats.hull) {
        mats.hull.color.lerp(colHullPlague, bw * 0.88);
        mats.hull.roughness = lerp(mats.hull.roughness, 0.72, bw * 0.82);
        mats.hull.metalness = lerp(mats.hull.metalness, 0.28, bw * 0.76);
        if (mats.hull.emissive) {
          mats.hull.emissive.lerp(new T.Color(0x222026), bw * 0.72);
          mats.hull.emissiveIntensity = lerp(mats.hull.emissiveIntensity || 0.0, 0.30, bw);
        }
        if (st.isTexOwner && tex && tex.plagueAlbedoTex) {
          mats.hull.map = tex.plagueAlbedoTex;
          mats.hull.bumpMap = tex.plagueBumpTex;
          mats.hull.bumpScale = 0.32 * w;
          safeSetNormalScale(mats.hull, 1.0 - 0.55 * bw);
          mats.hull.needsUpdate = true;
        }
      }

      if (mats.procHull) {
        mats.procHull.color.lerp(colHullPlague, bw * 0.88);
        mats.procHull.roughness = lerp(mats.procHull.roughness, 0.72, bw * 0.82);
        mats.procHull.metalness = lerp(mats.procHull.metalness, 0.30, bw * 0.76);
        if (st.isTexOwner && tex && tex.plagueAlbedoTex) {
          mats.procHull.map = tex.plagueAlbedoTex;
          mats.procHull.bumpMap = tex.plagueBumpTex;
          mats.procHull.bumpScale = 0.36 * w;
          mats.procHull.needsUpdate = true;
        }
      }

      if (mats.dark) {
        mats.dark.color.lerp(colObsidianDark, bw * 0.80);
        mats.dark.roughness = lerp(mats.dark.roughness, 0.68, bw * 0.72);
        mats.dark.metalness = lerp(mats.dark.metalness, 0.34, bw * 0.65);
      }

      if (mats.obsidian) {
        mats.obsidian.color.lerp(colObsidianDark, bw * 0.76);
        mats.obsidian.roughness = lerp(mats.obsidian.roughness, 0.70, bw * 0.70);
      }

      if (mats.trim) {
        mats.trim.color.lerp(colCorrodedAlloy, bw * 0.82);
        mats.trim.roughness = lerp(mats.trim.roughness, 0.64, bw * 0.74);
        mats.trim.metalness = lerp(mats.trim.metalness, 0.36, bw * 0.65);
        if (mats.trim.emissive) {
          mats.trim.emissive.lerp(colDeepEmber, bw * 0.68);
          mats.trim.emissiveIntensity = lerp(mats.trim.emissiveIntensity || 0.24, 0.30, bw * 0.55);
        }
      }

      if (mats.cryo) {
        mats.cryo.color.lerp(new T.Color(0x6e7682), bw * 0.76);
        if (mats.cryo.emissive) mats.cryo.emissive.lerp(colDeepEmber, bw * 0.65);
      }

      if (mats.aftGothic) {
        mats.aftGothic.color.lerp(colCharredIron, bw * 0.88);
        mats.aftGothic.roughness = lerp(mats.aftGothic.roughness, 0.72, bw * 0.78);
        mats.aftGothic.metalness = lerp(mats.aftGothic.metalness, 0.32, bw * 0.70);
        if (mats.aftGothic.emissive) {
          mats.aftGothic.emissive.lerp(colEmberAmber, bw * 0.84);
          mats.aftGothic.emissiveIntensity = lerp(mats.aftGothic.emissiveIntensity || 0.5, 0.72 + (P.cityLights || 0) * 1.25, bw);
        }
        if (st.isTexOwner && tex && tex.plagueAlbedoTex) {
          mats.aftGothic.map = tex.plagueAlbedoTex;
          mats.aftGothic.bumpMap = tex.plagueBumpTex;
          mats.aftGothic.bumpScale = 0.34 * w;
          if (w >= 0.42 && tex.plagueEmissiveTex) {
            mats.aftGothic.emissiveMap = tex.plagueEmissiveTex;
          }
          mats.aftGothic.needsUpdate = true;
        }
      }

      if (mats.collar) {
        mats.collar.color.lerp(colCharredIron, bw * 0.86);
        mats.collar.roughness = lerp(mats.collar.roughness, 0.70, bw * 0.74);
        if (mats.collar.emissive) {
          mats.collar.emissive.lerp(colEmberAmber, bw * 0.82);
        }
        if (st.isTexOwner && w >= 0.45 && tex && tex.plagueEmissiveTex) {
          mats.collar.emissiveMap = tex.plagueEmissiveTex;
          mats.collar.emissiveIntensity = lerp(mats.collar.emissiveIntensity || 0.5, 0.85 + (P.cityLights || 0) * 1.35, bw);
          mats.collar.needsUpdate = true;
        }
      }

      if (mats.amberLight && mats.amberLight.color) {
        mats.amberLight.color.lerp(colEmberAmber, bw * 0.78);
      }

      if (mats.cyanGlow && mats.cyanGlow.color) {
        mats.cyanGlow.color.lerp(colArterialRed, bw * 0.82);
      }

      var radMat = mats.rad || mats.radiator;
      if (radMat) {
        if (radMat.emissive) radMat.emissive.lerp(colArterialRed, bw * 0.45);
      }

      // Scarred dark-charred glacier ice (NOT toxic neon green moss!)
      if (w > 0.35) {
        var iw = clamp((w - 0.35) / 0.65, 0, 1) * (bw / Math.max(0.05, w));
        if (mats.ice) {
          mats.ice.color.lerp(colIceChar, 0.32 * iw);
          if (mats.ice.emissive) mats.ice.emissive.lerp(colIceEm, 0.45 * iw);
          mats.ice.roughness = lerp(mats.ice.roughness, 0.56, 0.35 * iw);
        }
        if (mats.iceProc) {
          mats.iceProc.color.lerp(colIceChar, 0.32 * iw);
          if (mats.iceProc.emissive) mats.iceProc.emissive.lerp(colIceEm, 0.45 * iw);
          mats.iceProc.roughness = lerp(mats.iceProc.roughness, 0.56, 0.35 * iw);
        }
      }
    },

    buildGeometry: function (ctx) {
      if (!ctx || !ctx.T || !ctx.P || !ctx.rootGroup) return;
      var P = ctx.P;
      var w = clamp(Number(P.styleGnostic) || 0, 0, 1);
      if (w <= 0.02) return;

      var T = ctx.T;
      var track = typeof ctx.trackMat === 'function' ? ctx.trackMat : function (m) { return m; };
      var tex = getTextures(T);
      var rng = makeRng(ctx, 0x474e4f53);
      var detail = ctx.detailScale != null ? ctx.detailScale : 1.0;
      var isCorridor = !!ctx.isCorridor;
      var gScale = ctx.girthScale || 1.0;
      var keepout = ctx.keepout;
      var gigerActive = clamp(Number(P.styleGiger) || 0, 0, 1);

      var aftMin = clamp((1.5 + gScale * 0.4) * 0.72 / Math.max(1, ctx.aftSpan || 14), 0.07, 0.22);
      var foreMin = clamp((1.5 + gScale * 0.4) * 0.40 / Math.max(1, ctx.fwdSpan || 30), 0.04, 0.12);

      // Melding Plague warped alloy, corroded iron-bone & glowing arterial breach materials
      var fleshMat = track(new T.MeshStandardMaterial({
        color: 0x3b3c44,
        map: tex ? tex.plagueAlbedoTex : null,
        bumpMap: tex ? tex.plagueBumpTex : null,
        bumpScale: 0.38 * w,
        emissive: new T.Color(0x1f1d22),
        emissiveIntensity: 0.36,
        roughness: 0.68,
        metalness: 0.32
      }));

      var boneMat = track(new T.MeshStandardMaterial({
        color: 0x6c6560,
        bumpMap: tex ? tex.plagueBumpTex : null,
        bumpScale: 0.24 * w,
        emissive: new T.Color(0x282320),
        emissiveIntensity: 0.30,
        roughness: 0.72,
        metalness: 0.28
      }));

      var tendrilMat = track(new T.MeshStandardMaterial({
        color: 0x343238,
        map: tex ? tex.plagueAlbedoTex : null,
        bumpMap: tex ? tex.plagueBumpTex : null,
        bumpScale: 0.32 * w,
        emissiveMap: tex ? tex.plagueEmissiveTex : null,
        emissive: new T.Color(0xe05828),
        emissiveIntensity: 0.46 + 0.55 * w,
        roughness: 0.60,
        metalness: 0.38
      }));

      var sporeGreenMat = track(new T.MeshStandardMaterial({
        color: 0x6e2414,
        emissive: new T.Color(0xd94422),
        emissiveIntensity: 0.92 + 0.85 * w,
        roughness: 0.40,
        metalness: 0.14
      }));

      var sporeAmberMat = track(new T.MeshStandardMaterial({
        color: 0x8e4a1c,
        emissive: new T.Color(0xff9636),
        emissiveIntensity: 0.90 + 0.80 * w,
        roughness: 0.36,
        metalness: 0.14
      }));

      var grp = new T.Group();
      grp.name = 'Style_Gnostic_Plague';

      var boilFleshMats = [];
      var boilBoneMats = [];
      var sporeGreenMats = [];
      var sporeAmberMats = [];
      var craterRingMats = [];
      var spurBoneMats = [];
      var spurFleshMats = [];

      // 1. Asymmetric Clustered Plague Boil / Nodule Clusters
      var nClusters = Math.max(4, Math.round((isCorridor ? 6 : 16) * (0.40 + 0.60 * w) * clamp(detail, 0.4, 1.2)));
      var boilScale = (0.35 + 0.85 * w) * gScale;

      for (var ci = 0; ci < nClusters; ci++) {
        var useFore = ci % 5 >= 3;
        var rawPhi = (rng() * Math.PI * 2);
        var param = 0.2;
        var isOnIce = false;

        if (!useFore) {
          var aftEnd = safeBareEnd(ctx.evalAftBareEnd, rawPhi, 0.82);
          if (aftEnd < aftMin + 0.08) useFore = true;
          else {
            param = lerp(aftMin + 0.02, Math.min(0.76, aftEnd - 0.02), rng());
            var pk = pickClearOrOffset(keepout, rawPhi, param, 0.08);
            if (!pk.ok) continue;
            rawPhi = pk.phi;
          }
        }
        if (useFore) {
          var foreEnd = safeBareEnd(ctx.evalForeBareEnd, rawPhi, 0.90);
          if (foreEnd > foreMin + 0.08 && (ci % 2 === 0 || !ctx.icePresent)) {
            param = lerp(foreMin, foreEnd - 0.02, rng());
          } else {
            param = lerp(Math.max(0.03, foreEnd), clamp(foreEnd + 0.26, 0.14, 0.68), rng());
            isOnIce = ctx.icePresent && !ctx.hideIce && param >= foreEnd;
          }
        }

        var fr = ctx.evalSurfaceFrame(useFore, param, rawPhi, 0.985);
        var iceLift = isOnIce ? estimateIceLift(ctx, useFore, param) : 0;
        var rMain = (0.16 + rng() * 0.17) * boilScale;
        var baseLift = iceLift + rMain * 0.22;

        ctx.pushCustomRot(
          boilFleshMats,
          fr,
          rMain * (1.1 + rng() * 0.45),
          rMain * (0.8 + rng() * 0.35),
          rMain * (1.0 + rng() * 0.4),
          baseLift,
          0,
          0,
          (rng() - 0.5) * 0.35,
          (rng() - 0.5) * 0.35
        );

        var nSub = isCorridor ? 2 : (3 + Math.floor(rng() * 3));
        for (var sb = 0; sb < nSub; sb++) {
          var angS = rng() * Math.PI * 2;
          var distS = rMain * (0.72 + rng() * 0.65);
          var rSub = rMain * (0.42 + rng() * 0.38);
          var subList = sb % 3 === 2 ? boilBoneMats : boilFleshMats;
          ctx.pushCustomRot(
            subList,
            fr,
            rSub * (1.0 + rng() * 0.35),
            rSub * (0.85 + rng() * 0.3),
            rSub * (1.0 + rng() * 0.35),
            baseLift * 0.8 + rSub * 0.2,
            Math.cos(angS) * distS,
            Math.sin(angS) * distS,
            (rng() - 0.5) * 0.5,
            (rng() - 0.5) * 0.5
          );
          if (sb === 0) {
            var spList = rng() < 0.38 ? sporeAmberMats : sporeGreenMats;
            ctx.pushFramed(
              spList,
              fr,
              rSub * 0.45,
              rSub * 0.42,
              rSub * 0.45,
              baseLift + rSub * 0.62,
              Math.cos(angS) * distS * 0.65,
              Math.sin(angS) * distS * 0.65
            );
          }
        }
      }

      // 2. Bioluminescent Spore Pustule Vents (Cratered Rings on Dorsal & Flank Sections)
      if (w > 0.08) {
        var nVents = Math.max(3, Math.round((isCorridor ? 4 : 12) * (0.35 + 0.65 * w) * clamp(detail, 0.4, 1.1)));
        var ventPhis = [0.28, -0.34, 1.18, -1.24, 2.15, -2.08, 0.68, -0.74, 1.68, -1.72, 2.75, -2.72];
        for (var vi = 0; vi < nVents; vi++) {
          var vFore = vi % 3 === 2;
          var vPhi = ventPhis[vi % ventPhis.length] + (rng() - 0.5) * 0.22;
          var vParam;
          var vIceLift = 0;
          if (!vFore) {
            var vAftEnd = safeBareEnd(ctx.evalAftBareEnd, vPhi, 0.80);
            if (vAftEnd < aftMin + 0.06) vFore = true;
            else {
              vParam = lerp(aftMin + 0.04, Math.min(0.70, vAftEnd - 0.03), (vi + 0.4) / nVents);
              var vpk = pickClearOrOffset(keepout, vPhi, vParam, 0.08);
              if (!vpk.ok) continue;
              vPhi = vpk.phi;
            }
          }
          if (vFore) {
            var vForeEnd = safeBareEnd(ctx.evalForeBareEnd, vPhi, 0.90);
            vParam = vForeEnd > foreMin + 0.08
              ? lerp(foreMin + 0.02, vForeEnd - 0.03, rng())
              : lerp(0.05, 0.48, rng());
            if (ctx.icePresent && !ctx.hideIce && vParam >= vForeEnd) {
              vIceLift = estimateIceLift(ctx, true, vParam);
            }
          }
          var vfr = ctx.evalSurfaceFrame(vFore, vParam, vPhi, 0.99);
          var rVent = (0.17 + rng() * 0.11) * (0.45 + 0.70 * w) * gScale;
          ctx.pushFramed(craterRingMats, vfr, rVent, rVent * 0.95, rVent, vIceLift + rVent * 0.18, 0, 0);

          var domeList = (vi % 3 === 1) ? sporeAmberMats : sporeGreenMats;
          ctx.pushFramed(domeList, vfr, rVent * 0.72, rVent * 0.56, rVent * 0.72, vIceLift + rVent * 0.12, 0, 0);

          if (!isCorridor) {
            for (var sat = 0; sat < 3; sat++) {
              var sAng = sat * (Math.PI * 2 / 3) + rng() * 0.5;
              ctx.pushFramed(
                sat === 0 ? sporeAmberMats : sporeGreenMats,
                vfr,
                rVent * 0.24,
                rVent * 0.24,
                rVent * 0.24,
                vIceLift + rVent * 0.25,
                Math.cos(sAng) * rVent * 1.15,
                Math.sin(sAng) * rVent * 1.15
              );
            }
          }
        }
      }

      // 3. Creeping Techno-Organic Tendril / Vein Conduits (Aft -> Waist -> Ice Border)
      if (w > 0.10) {
        var nTendrils = isCorridor ? 2 : Math.max(3, Math.round(6 * (0.42 + 0.58 * w)));
        var tSegs = isCorridor ? 10 : 22;
        var baseTendrilPhis = [0.42, -0.58, 1.38, -1.46, 2.48, -2.52];
        for (var ti = 0; ti < nTendrils; ti++) {
          var phiStart = baseTendrilPhis[ti % baseTendrilPhis.length] + (rng() - 0.5) * 0.18;
          var tAftStart = lerp(0.42, 0.78, rng());
          var uForeEnd = clamp(safeBareEnd(ctx.evalForeBareEnd, phiStart, 0.55) + 0.14 + 0.16 * w, 0.18, 0.76);
          var freq = 1.6 + rng() * 1.4;
          var phase = rng() * Math.PI * 2;
          var amp = 0.22 + rng() * 0.18;
          var pts = [];
          var phiCur = phiStart;

          for (var si = 0; si <= tSegs; si++) {
            var sNorm = si / tSegs;
            var isF = sNorm > 0.45;
            var pLocal;
            if (!isF) {
              pLocal = lerp(tAftStart, 0.0, sNorm / 0.45);
            } else {
              pLocal = lerp(0.0, uForeEnd, (sNorm - 0.45) / 0.55);
            }

            var targetPhi = phiStart + amp * Math.sin(sNorm * Math.PI * freq + phase);
            if (!isF && keepout && keepout.isBlocked(targetPhi, pLocal, 0.07)) {
              var nudged = keepout.pickClearPhi(targetPhi, pLocal, 0.09);
              targetPhi = lerp(phiCur, nudged, 0.55);
            }
            phiCur = targetPhi;

            var frT = ctx.evalSurfaceFrame(isF, pLocal, phiCur, 0.992);
            var acrossCollar = Math.exp(-Math.pow((sNorm - 0.45) / 0.08, 2));
            var iceBoost = (isF && ctx.icePresent && !ctx.hideIce && pLocal > safeBareEnd(ctx.evalForeBareEnd, phiCur, 0.9))
              ? estimateIceLift(ctx, true, pLocal)
              : 0;
            var endRoot = Math.sin(sNorm * Math.PI);
            var lift = (0.045 + 0.04 * w * endRoot + 0.11 * acrossCollar + iceBoost) * gScale;
            var vPos = new T.Vector3(
              frT.pt.x + frT.n.x * lift,
              frT.pt.y + frT.n.y * lift,
              frT.pt.z + frT.n.z * lift
            );
            pts.push(vPos);

            if (!isCorridor && si > 1 && si < tSegs - 1 && si % 5 === 0) {
              var nodeR = (0.068 + 0.045 * w) * gScale;
              ctx.pushFramed(
                (si + ti) % 2 === 0 ? sporeGreenMats : sporeAmberMats,
                frT,
                nodeR * 1.15,
                nodeR * 0.95,
                nodeR * 1.15,
                lift,
                0,
                0
              );
            }
          }

          var rTube = (0.046 + 0.052 * w) * gScale;
          var tubeMesh = buildTubeMesh(T, pts, rTube, isCorridor ? 12 : 24, isCorridor ? 5 : 6, tendrilMat);
          if (tubeMesh) grp.add(tubeMesh);
        }

        // Helical creeping skirt tendril hugging lower border of fore cryo-ice carapace
        if (ctx.icePresent && !isCorridor) {
          var skirtPts = [];
          var skSegs = 24;
          var skPhase = rng() * Math.PI * 2;
          for (var ki = 0; ki <= skSegs; ki++) {
            var kPhi = (ki / skSegs) * Math.PI * 2 + 0.12 * Math.sin(ki * 0.9 + skPhase);
            var uSk = clamp(safeBareEnd(ctx.evalForeBareEnd, kPhi, 0.15) + 0.025 + 0.03 * Math.sin(kPhi * 3 + skPhase), 0.03, 0.80);
            var frSk = ctx.evalSurfaceFrame(true, uSk, kPhi, 0.995);
            var lSk = (0.055 + 0.035 * w) * gScale + estimateIceLift(ctx, true, uSk) * 0.65;
            skirtPts.push(new T.Vector3(
              frSk.pt.x + frSk.n.x * lSk,
              frSk.pt.y + frSk.n.y * lSk,
              frSk.pt.z + frSk.n.z * lSk
            ));
          }
          var skTube = buildTubeMesh(T, skirtPts, (0.040 + 0.044 * w) * gScale, 28, 6, tendrilMat);
          if (skTube) grp.add(skTube);
        }
      }

      // 4. Asymmetric Jagged Ossified Bone-Coral Spurs & Warped Reliquary Ribs (w > 0.25)
      if (w > 0.25) {
        var rw = clamp((w - 0.25) / 0.75, 0, 1);
        var nSpurs = Math.max(4, Math.round((isCorridor ? 5 : 14) * rw));
        var shoulderBias = gigerActive > 0.22 ? 0.34 : 0.12;
        for (var spi = 0; spi < nSpurs; spi++) {
          var sFore = spi % 3 === 1;
          var sideSign = spi % 2 === 0 ? 1 : -1;
          var basePhi = (spi % 4 < 2 ? 0 : Math.PI) + sideSign * (shoulderBias + rng() * 0.42);
          var sParam;
          var sIceLift = 0;

          if (!sFore) {
            var sAftEnd = safeBareEnd(ctx.evalAftBareEnd, basePhi, 0.80);
            if (sAftEnd < aftMin + 0.08) sFore = true;
            else {
              sParam = lerp(aftMin + 0.05, Math.min(0.76, sAftEnd - 0.04), rng());
              var spk = pickClearOrOffset(keepout, basePhi, sParam, 0.09);
              if (!spk.ok) continue;
              basePhi = spk.phi;
            }
          }
          if (sFore) {
            var sForeEnd = safeBareEnd(ctx.evalForeBareEnd, basePhi, 0.85);
            sParam = sForeEnd > foreMin + 0.08
              ? lerp(foreMin + 0.02, sForeEnd - 0.04, rng())
              : lerp(0.06, 0.56, rng());
            if (ctx.icePresent && !ctx.hideIce && sParam >= sForeEnd) {
              sIceLift = estimateIceLift(ctx, true, sParam);
            }
          }

          var frSp = ctx.evalSurfaceFrame(sFore, sParam, basePhi, 0.96);
          var spH = (0.24 + rng() * 0.34) * (0.25 + 0.90 * rw) * gScale + sIceLift;
          var spL = (0.22 + rng() * 0.20) * (0.55 + 0.45 * rw) * gScale;
          var spW = (0.16 + rng() * 0.14) * (0.55 + 0.45 * rw) * gScale;
          var tiltT = -0.38 - rng() * 0.36;
          var tiltB = sideSign * (0.14 + rng() * 0.28);

          ctx.pushCustomRot(spurBoneMats, frSp, spL, spH, spW, 0.02 * gScale, 0, 0, tiltT, tiltB);
          // Secondary coral tine jutting from spur base
          if (!isCorridor) {
            ctx.pushCustomRot(
              spurFleshMats,
              frSp,
              spL * 0.72,
              spH * 0.62,
              spW * 0.72,
              0.02 * gScale,
              0.10 * gScale,
              sideSign * 0.12 * gScale,
              tiltT + 0.42,
              tiltB + sideSign * 0.28
            );
          }
        }

        // Warped asymmetrical reliquary arch ribs
        if (!isCorridor) {
          var nWarped = Math.round(3 + 4 * rw);
          for (var wri = 0; wri < nWarped; wri++) {
            var wFore = wri % 2 === 1 && safeBareEnd(ctx.evalForeBareEnd, 0.5, 0) > foreMin + 0.12;
            var wParam = wFore
              ? lerp(foreMin + 0.04, Math.min(0.60, safeBareEnd(ctx.evalForeBareEnd, 0.5, 0.6) - 0.04), (wri + 0.5) / nWarped)
              : lerp(aftMin + 0.06, 0.68, (wri + 0.4) / nWarped);
            var arcStart = (wri % 2 === 0 ? 0.25 : -0.35) + (rng() - 0.5) * 0.4;
            var arcDir = wri % 2 === 0 ? 1 : -1;
            var arcLen = 0.85 + rng() * 0.55;
            var nSegR = 5;
            for (var rsi = 0; rsi < nSegR; rsi++) {
              var fracR = (rsi + 0.5) / nSegR;
              var phiR = arcStart + arcDir * fracR * arcLen;
              var pCurR = wParam + 0.04 * Math.sin(fracR * Math.PI) * (wri % 2 === 0 ? 1 : -1);
              if (!wFore && keepout && keepout.isBlocked(phiR, pCurR, 0.06)) continue;
              var frW = ctx.evalSurfaceFrame(wFore, pCurR, phiR, 0.988);
              var segThick = (0.10 + 0.10 * rw) * Math.sin(fracR * Math.PI * 0.9 + 0.15) * gScale;
              ctx.pushCustomRot(
                rsi % 2 === 0 ? spurBoneMats : spurFleshMats,
                frW,
                0.22 * gScale,
                segThick,
                0.38 * gScale,
                segThick * 0.35,
                0,
                0,
                0.18 * (rng() - 0.5),
                arcDir * 0.16
              );
            }
          }
        }
      }

      if (boilFleshMats.length) {
        ctx.commitInstances(makePlagueBoilGeo(T, 1), fleshMat, boilFleshMats);
      }
      if (boilBoneMats.length) {
        ctx.commitInstances(makePlagueBoilGeo(T, 1), boneMat, boilBoneMats);
      }
      // Subtle recessed arterial ember slits instead of cartoon glowing spore spheres
      if (sporeGreenMats.length) {
        ctx.commitInstances(new T.BoxGeometry(1.15, 0.42, 0.38), sporeGreenMat, sporeGreenMats);
      }
      if (sporeAmberMats.length) {
        ctx.commitInstances(new T.BoxGeometry(1.05, 0.38, 0.36), sporeAmberMat, sporeAmberMats);
      }
      if (craterRingMats.length) {
        ctx.commitInstances(makeFlushTorusGeo(T, 0.30, 7, 14), boneMat, craterRingMats);
      }
      if (spurBoneMats.length) {
        ctx.commitInstances(makeBoneSpurGeo(T), boneMat, spurBoneMats);
      }
      if (spurFleshMats.length) {
        ctx.commitInstances(makeBoneSpurGeo(T), fleshMat, spurFleshMats);
      }

      ctx.rootGroup.add(grp);
    }
  };

  // ---------------------------------------------------------------------------
  // 2. H.R. GIGER BIOMECH KIT (Black Xenomorph)
  // ---------------------------------------------------------------------------
  var gigerKit = {
    id: 'giger',
    weightKey: 'styleGiger',

    applyMaterials: function (ctx) {
      if (!ctx || !ctx.T || !ctx.P || !ctx.mats) return;
      var T = ctx.T;
      var P = ctx.P;
      var st = computeStyleShare(P, 'styleGiger');
      if (st.w <= 0.02) return;

      var w = st.w;
      var bw = st.share;
      var mats = ctx.mats;
      var tex = getTextures(T);

      var colPitchBlack = new T.Color(0x090b10);
      var colObsidianExo = new T.Color(0x131720);
      var colBoneRib = new T.Color(0x242934);
      var colIceSmoked = new T.Color(0x1f2630);
      var colPaleGlow = new T.Color(0x9ec8e8);
      var colGhostEm = new T.Color(0x528ab8);

      if (mats.hull) {
        mats.hull.color.lerp(colObsidianExo, bw * 0.92);
        mats.hull.metalness = lerp(mats.hull.metalness, 0.78, bw * 0.86);
        mats.hull.roughness = lerp(mats.hull.roughness, 0.18, bw * 0.88);
        if (st.isTexOwner && tex && tex.gigerAlbedoTex) {
          mats.hull.map = tex.gigerAlbedoTex;
          mats.hull.bumpMap = tex.gigerBumpTex;
          mats.hull.bumpScale = 0.28 * w;
          safeSetNormalScale(mats.hull, 1.0 - 0.5 * bw);
          mats.hull.needsUpdate = true;
        }
      }

      if (mats.procHull) {
        mats.procHull.color.lerp(colObsidianExo, bw * 0.92);
        mats.procHull.metalness = lerp(mats.procHull.metalness, 0.76, bw * 0.86);
        mats.procHull.roughness = lerp(mats.procHull.roughness, 0.19, bw * 0.88);
        if (st.isTexOwner && tex && tex.gigerAlbedoTex) {
          mats.procHull.map = tex.gigerAlbedoTex;
          mats.procHull.bumpMap = tex.gigerBumpTex;
          mats.procHull.bumpScale = 0.34 * w;
          mats.procHull.needsUpdate = true;
        }
      }

      if (mats.dark) {
        mats.dark.color.lerp(colPitchBlack, bw * 0.90);
        mats.dark.metalness = lerp(mats.dark.metalness, 0.82, bw * 0.82);
        mats.dark.roughness = lerp(mats.dark.roughness, 0.17, bw * 0.86);
      }

      if (mats.obsidian) {
        mats.obsidian.color.lerp(colPitchBlack, bw * 0.88);
        mats.obsidian.metalness = lerp(mats.obsidian.metalness, 0.84, bw * 0.80);
        mats.obsidian.roughness = lerp(mats.obsidian.roughness, 0.16, bw * 0.88);
      }

      if (mats.trim) {
        mats.trim.color.lerp(colBoneRib, bw * 0.92);
        mats.trim.metalness = lerp(mats.trim.metalness, 0.74, bw * 0.78);
        mats.trim.roughness = lerp(mats.trim.roughness, 0.21, bw * 0.84);
        if (mats.trim.emissive) {
          mats.trim.emissive.lerp(new T.Color(0x090e18), bw * 0.80);
          mats.trim.emissiveIntensity = lerp(mats.trim.emissiveIntensity || 0.24, 0.14, bw * 0.6);
        }
      }

      if (mats.cryo) {
        mats.cryo.color.lerp(new T.Color(0x364254), bw * 0.84);
        mats.cryo.metalness = lerp(mats.cryo.metalness, 0.68, bw * 0.75);
        mats.cryo.roughness = lerp(mats.cryo.roughness, 0.20, bw * 0.75);
        if (mats.cryo.emissive) mats.cryo.emissive.lerp(new T.Color(0x0c1b2c), bw * 0.78);
      }

      if (mats.aftGothic) {
        mats.aftGothic.color.lerp(colObsidianExo, bw * 0.90);
        mats.aftGothic.metalness = lerp(mats.aftGothic.metalness, 0.78, bw * 0.80);
        mats.aftGothic.roughness = lerp(mats.aftGothic.roughness, 0.20, bw * 0.86);
        if (mats.aftGothic.emissive) {
          mats.aftGothic.emissive.lerp(colGhostEm, bw * 0.72);
          mats.aftGothic.emissiveIntensity = (mats.aftGothic.emissiveIntensity || 0.5) * (1.0 - 0.55 * bw);
        }
        if (st.isTexOwner && tex && tex.gigerAlbedoTex) {
          mats.aftGothic.map = tex.gigerAlbedoTex;
          mats.aftGothic.bumpMap = tex.gigerBumpTex;
          mats.aftGothic.bumpScale = 0.30 * w;
          mats.aftGothic.needsUpdate = true;
        }
      }

      if (mats.collar) {
        mats.collar.color.lerp(colPitchBlack, bw * 0.88);
        mats.collar.metalness = lerp(mats.collar.metalness, 0.76, bw * 0.78);
        mats.collar.roughness = lerp(mats.collar.roughness, 0.19, bw * 0.84);
        if (mats.collar.emissive) {
          mats.collar.emissive.lerp(colPaleGlow, bw * 0.76);
          mats.collar.emissiveIntensity = (mats.collar.emissiveIntensity || 0.4) * (1.0 - 0.48 * bw);
        }
      }

      if (mats.amberLight && mats.amberLight.color) {
        mats.amberLight.color.lerp(new T.Color(0xb8c8da), bw * 0.78);
      }

      if (mats.cyanGlow && mats.cyanGlow.color) {
        mats.cyanGlow.color.lerp(colPaleGlow, bw * 0.65);
      }

      var radG = mats.rad || mats.radiator;
      if (radG) {
        radG.color.lerp(new T.Color(0x141822), bw * 0.88);
        if (radG.emissive) radG.emissive.lerp(new T.Color(0x2c4258), bw * 0.82);
        if (typeof radG.emissiveIntensity === 'number') radG.emissiveIntensity *= (1 - 0.55 * bw);
        radG.roughness = lerp(radG.roughness, 0.22, bw * 0.82);
        radG.metalness = lerp(radG.metalness, 0.78, bw * 0.78);
      }

      if (w > 0.30) {
        var iw = clamp((w - 0.30) / 0.70, 0, 1) * (bw / Math.max(0.05, w));
        var colDarkEm = new T.Color(0x09101a);
        if (mats.ice) {
          mats.ice.color.lerp(colIceSmoked, 0.84 * iw);
          if (mats.ice.emissive) mats.ice.emissive.lerp(colDarkEm, 0.85 * iw);
          mats.ice.emissiveIntensity = lerp(mats.ice.emissiveIntensity || 0.38, 0.18, 0.72 * iw);
          mats.ice.roughness = lerp(mats.ice.roughness, 0.16, 0.82 * iw);
          mats.ice.metalness = lerp(mats.ice.metalness, 0.38, 0.74 * iw);
          mats.ice.opacity = lerp(mats.ice.opacity || 0.8, 0.92, 0.48 * iw);
        }
        if (mats.iceProc) {
          mats.iceProc.color.lerp(colIceSmoked, 0.84 * iw);
          if (mats.iceProc.emissive) mats.iceProc.emissive.lerp(colDarkEm, 0.85 * iw);
          mats.iceProc.emissiveIntensity = lerp(mats.iceProc.emissiveIntensity || 0.38, 0.18, 0.72 * iw);
          mats.iceProc.roughness = lerp(mats.iceProc.roughness, 0.16, 0.82 * iw);
          mats.iceProc.metalness = lerp(mats.iceProc.metalness, 0.38, 0.74 * iw);
          mats.iceProc.opacity = lerp(mats.iceProc.opacity || 0.86, 0.94, 0.45 * iw);
        }
      }
    },

    buildGeometry: function (ctx) {
      if (!ctx || !ctx.T || !ctx.P || !ctx.rootGroup) return;
      var P = ctx.P;
      var w = clamp(Number(P.styleGiger) || 0, 0, 1);
      if (w <= 0.02) return;

      var T = ctx.T;
      var track = typeof ctx.trackMat === 'function' ? ctx.trackMat : function (m) { return m; };
      var tex = getTextures(T);
      var detail = ctx.detailScale != null ? ctx.detailScale : 1.0;
      var isCorridor = !!ctx.isCorridor;
      var gScale = ctx.girthScale || 1.0;
      var keepout = ctx.keepout;

      var aftMin = clamp((1.5 + gScale * 0.4) * 0.70 / Math.max(1, ctx.aftSpan || 14), 0.06, 0.22);
      var foreMin = clamp((1.5 + gScale * 0.4) * 0.38 / Math.max(1, ctx.fwdSpan || 30), 0.04, 0.12);

      var chitinWetMat = track(new T.MeshStandardMaterial({
        color: 0x0b0e14,
        bumpMap: tex ? tex.gigerBumpTex : null,
        bumpScale: 0.05 * w,
        metalness: 0.80,
        roughness: 0.16
      }));

      var ribMat = track(new T.MeshStandardMaterial({
        color: 0x343c4c,
        map: tex ? tex.gigerAlbedoTex : null,
        bumpMap: tex ? tex.gigerBumpTex : null,
        bumpScale: 0.34 * w,
        metalness: 0.74,
        roughness: 0.19
      }));

      var tendonMat = track(new T.MeshStandardMaterial({
        color: 0x1d2330,
        map: tex ? tex.gigerAlbedoTex : null,
        bumpMap: tex ? tex.gigerBumpTex : null,
        bumpScale: 0.40 * w,
        metalness: 0.78,
        roughness: 0.18
      }));

      var jointMat = track(new T.MeshStandardMaterial({
        color: 0x3d4759,
        metalness: 0.84,
        roughness: 0.16
      }));

      var grp = new T.Group();
      grp.name = 'Style_Giger_Biomech';

      var vertMats = [];
      var jointMats = [];
      var ribSegMats = [];
      var clampRingMats = [];

      // 1. Dorsal Xenomorph Vertebral Spine Crest (Stern -> Collar -> Fore Hull)
      var nAftVerts = Math.max(4, Math.round((isCorridor ? 5 : 10) * (0.45 + 0.55 * w)));
      var nForeVerts = Math.max(3, Math.round((isCorridor ? 4 : 9) * (0.45 + 0.55 * w)));
      var spineHBase = (0.34 + 0.44 * w) * gScale;

      function placeVertebraStation(isFore, param, scaleProfile) {
        var phiPref = 0.0;
        var phis = [phiPref];
        if (!isFore && keepout && keepout.isBlocked(0.0, param, 0.08)) {
          var clearA = !keepout.isBlocked(0.24, param, 0.06);
          var clearB = !keepout.isBlocked(-0.24, param, 0.06);
          phis = [];
          if (clearA) phis.push(0.24);
          if (clearB) phis.push(-0.24);
          if (!phis.length) return;
        }
        for (var pi = 0; pi < phis.length; pi++) {
          var phiV = phis[pi];
          var foreBare = safeBareEnd(ctx.evalForeBareEnd, phiV, 0.90);
          var iceLift = (isFore && ctx.icePresent && !ctx.hideIce && param >= foreBare)
            ? estimateIceLift(ctx, true, param) : 0;
          var fr = ctx.evalSurfaceFrame(isFore, param, phiV, 0.95);
          var hV = spineHBase * scaleProfile + iceLift;
          var lV = (0.42 + 0.18 * w) * gScale * lerp(0.7, 1.0, scaleProfile);
          var wV = (0.24 + 0.14 * w) * gScale;
          ctx.pushCustomRot(vertMats, fr, lV, hV, wV, 0.02 * gScale, 0, 0, -0.14, 0);
          ctx.pushFramed(
            jointMats,
            fr,
            lV * 0.42,
            (0.14 + 0.10 * w) * gScale + iceLift * 0.45,
            wV * 1.15,
            0.05 * gScale + iceLift * 0.4,
            0,
            0
          );
        }
      }

      for (var av = 0; av < nAftVerts; av++) {
        var tV = lerp(0.05, 0.84, av / Math.max(1, nAftVerts - 1));
        var profA = 0.68 + 0.36 * Math.sin((1.0 - tV) * Math.PI * 0.72);
        placeVertebraStation(false, tV, profA);
      }

      var domeForeU = w > 0.20 ? clamp(lerp(0.14, 0.24, clamp((w - 0.20) / 0.80, 0, 1)), 0.08, 0.34) : -1;
      var maxForeSpineU = clamp(Math.max(safeBareEnd(ctx.evalForeBareEnd, 0, 0.48), 0.56), 0.30, 0.84);
      for (var fv = 0; fv < nForeVerts; fv++) {
        var uV = lerp(0.03, maxForeSpineU, fv / Math.max(1, nForeVerts - 1));
        if (domeForeU > 0 && w > 0.30 && Math.abs(uV - domeForeU) < 0.085) continue;
        var profF = 1.0 - 0.42 * Math.pow(uV / maxForeSpineU, 1.35);
        placeVertebraStation(true, uV, profF);
      }

      // Iconic paired curved Xenomorph dorsal exhaust tubes flanking the spine behind the dome
      if (w > 0.35 && !isCorridor) {
        var hornSites = [0.14, 0.30];
        for (var hi = 0; hi < hornSites.length; hi++) {
          var ht = hornSites[hi];
          for (var hSide = -1; hSide <= 1; hSide += 2) {
            var hPhi = hSide * 0.24;
            if (keepout && keepout.isBlocked(hPhi, ht, 0.08)) continue;
            var frH0 = ctx.evalSurfaceFrame(false, ht, hPhi, 0.96);
            var hornPts = [];
            for (var hs = 0; hs <= 5; hs++) {
              var hf = hs / 5;
              var pStep = ht + hf * 0.14;
              var phiStep = hPhi + hSide * hf * 0.14;
              var frHp = ctx.evalSurfaceFrame(false, clamp(pStep, 0.02, 0.92), phiStep, 0.98);
              var hLift = (0.04 + Math.sin(hf * Math.PI * 0.65) * (0.58 + 0.44 * w)) * gScale;
              hornPts.push(new T.Vector3(
                frHp.pt.x + frHp.n.x * hLift,
                frHp.pt.y + frHp.n.y * hLift,
                frHp.pt.z + frHp.n.z * hLift
              ));
            }
            var hMesh = buildTubeMesh(T, hornPts, (0.068 + 0.052 * w) * gScale, 14, 7, ribMat);
            if (hMesh) grp.add(hMesh);
            ctx.pushFramed(jointMats, frH0, 0.19 * gScale, 0.15 * gScale, 0.21 * gScale, 0.06 * gScale, 0, 0);
          }
        }
      }

      // 2. Articulated Sweeping Ribcage Hoops (Port & Starboard Thoracic Ribs)
      if (w > 0.04) {
        var hoopParams = [];
        var nAftHoops = isCorridor ? 3 : Math.round(4 + 3 * w);
        for (var ah = 0; ah < nAftHoops; ah++) {
          var tH = lerp(aftMin + 0.03, 0.72, ah / Math.max(1, nAftHoops - 1));
          hoopParams.push({ isFore: false, param: tH });
        }
        var fEndMax = safeBareEnd(ctx.evalForeBareEnd, Math.PI * 0.5, 0.70);
        var nForeHoops = isCorridor ? 2 : Math.round(2 + 3 * w);
        var fLimit = Math.max(foreMin + 0.14, Math.min(0.68, fEndMax - 0.02));
        for (var fh = 0; fh < nForeHoops; fh++) {
          var uH = lerp(foreMin + 0.02, fLimit, fh / Math.max(1, nForeHoops - 1));
          hoopParams.push({ isFore: true, param: uH });
        }

        var nArcSegs = isCorridor ? 5 : 9;
        for (var hpi = 0; hpi < hoopParams.length; hpi++) {
          var hp = hoopParams[hpi];
          for (var side = -1; side <= 1; side += 2) {
            var prevBlocked = true;
            for (var as = 0; as < nArcSegs; as++) {
              var f0 = as / nArcSegs;
              var f1 = (as + 1) / nArcSegs;
              var fm = 0.5 * (f0 + f1);
              var phi0 = side * lerp(0.24, 2.48, f0);
              var phi1 = side * lerp(0.24, 2.48, f1);
              var phim = 0.5 * (phi0 + phi1);
              var p0 = hp.param + (hp.isFore ? -0.025 : 0.025) * Math.sin(f0 * Math.PI);
              var p1 = hp.param + (hp.isFore ? -0.025 : 0.025) * Math.sin(f1 * Math.PI);
              var pm = 0.5 * (p0 + p1);
              if (!hp.isFore && keepout && keepout.isBlocked(phim, pm, 0.06)) {
                prevBlocked = true;
                continue;
              }

              var fr0 = ctx.evalSurfaceFrame(hp.isFore, clamp(p0, 0.01, 0.90), phi0, 0.992);
              var fr1 = ctx.evalSurfaceFrame(hp.isFore, clamp(p1, 0.01, 0.90), phi1, 0.992);
              var frM = ctx.evalSurfaceFrame(hp.isFore, clamp(pm, 0.01, 0.90), phim, 0.992);

              var iceL = (hp.isFore && ctx.icePresent && !ctx.hideIce && pm >= safeBareEnd(ctx.evalForeBareEnd, phim, 0.9))
                ? estimateIceLift(ctx, true, pm) * 0.85 : 0;
              var segArc = Math.hypot(fr1.pt.x - fr0.pt.x, fr1.pt.y - fr0.pt.y, fr1.pt.z - fr0.pt.z) * 1.18;
              if (segArc < 0.08) continue;

              var archEnv = 0.45 + 0.55 * Math.sin(fm * Math.PI);
              var ribThick = (0.09 + 0.11 * w) * archEnv * gScale;
              var ribChord = (0.14 + 0.12 * w) * gScale;
              var ribLift = ribThick * 0.42 + 0.02 * gScale + iceL;

              ctx.pushFramed(ribSegMats, frM, ribChord, ribThick, segArc, ribLift, 0, 0);
              if (prevBlocked || as === nArcSegs - 1 || (!isCorridor && as % 3 === 1)) {
                ctx.pushFramed(jointMats, frM, ribChord * 1.35, ribThick * 1.18, ribChord * 1.15, ribLift, 0, 0);
              }
              prevBlocked = false;
            }
          }
        }
      }

      // 3. Braided Biomech Tendon Conduits Arcing Across Waist & Fuselage Drums
      if (w > 0.08) {
        var tendonPairs = isCorridor ? 1 : (w > 0.45 ? 3 : 2);
        var baseTendonPhis = [0.64, 1.32, 2.26];
        var tSegs = isCorridor ? 10 : 20;

        for (var tpi = 0; tpi < tendonPairs; tpi++) {
          for (var tSide = -1; tSide <= 1; tSide += 2) {
            var phiPrefT = tSide * baseTendonPhis[tpi];
            var tStart = 0.52 + tpi * 0.08;
            var uEnd = clamp(0.10 + tpi * 0.05, 0.08, 0.30);
            var ptsT = [];
            var phiTrack = phiPrefT;

            for (var ts = 0; ts <= tSegs; ts++) {
              var sf = ts / tSegs;
              var isFT = sf > 0.62;
              var pT = !isFT ? lerp(tStart, 0.0, sf / 0.62) : lerp(0.0, uEnd, (sf - 0.62) / 0.38);
              var desiredPhi = phiPrefT + tSide * 0.10 * Math.sin(sf * Math.PI * 1.5);
              if (!isFT && keepout && keepout.isBlocked(desiredPhi, pT, 0.08)) {
                desiredPhi = lerp(phiTrack, keepout.pickClearPhi(desiredPhi, pT, 0.10), 0.6);
              }
              phiTrack = desiredPhi;

              var frC = ctx.evalSurfaceFrame(isFT, pT, phiTrack, 0.994);
              var iceC = (isFT && ctx.icePresent && !ctx.hideIce && pT >= safeBareEnd(ctx.evalForeBareEnd, phiTrack, 0.9))
                ? estimateIceLift(ctx, true, pT) : 0;
              var archLift = Math.sin(sf * Math.PI) * (0.20 + 0.32 * w) * gScale;
              var cLift = 0.05 * gScale + archLift + iceC;
              ptsT.push(new T.Vector3(
                frC.pt.x + frC.n.x * cLift,
                frC.pt.y + frC.n.y * cLift,
                frC.pt.z + frC.n.z * cLift
              ));

              if (!isCorridor && ts > 0 && ts < tSegs && ts % 5 === 0) {
                var rCl = (0.07 + 0.055 * w) * gScale;
                ctx.pushFramed(clampRingMats, frC, rCl * 1.8, rCl * 1.15, rCl * 1.15, cLift, 0, 0);
              }
            }

            var rCable = (0.054 + 0.056 * w) * gScale;
            var cableMesh = buildTubeMesh(T, ptsT, rCable, isCorridor ? 12 : 22, isCorridor ? 5 : 7, tendonMat);
            if (cableMesh) grp.add(cableMesh);
          }
        }
      }

      // 4. Elongated Slick Dome Carapace Cowlings (Xenomorph Skull Fairing over Dorsal Spine)
      if (w > 0.20) {
        var dw = clamp((w - 0.20) / 0.80, 0, 1);
        var domeGeo = makeGigerDomeGeo(T, isCorridor ? 14 : 26, isCorridor ? 10 : 18);

        domeForeU = clamp(lerp(0.14, 0.24, dw), 0.08, 0.34);
        var domeFr = ctx.evalSurfaceFrame(true, domeForeU, 0.0, 0.94);
        var domeIceLift = (ctx.icePresent && !ctx.hideIce && domeForeU >= safeBareEnd(ctx.evalForeBareEnd, 0, 0.9))
          ? estimateIceLift(ctx, true, domeForeU) * 0.72 : 0;

        var shipLenScale = clamp(((ctx.fwdSpan || 30) + (ctx.aftSpan || 14)) / 44, 0.75, 1.5);
        var domeLen = (1.8 + 3.0 * dw) * shipLenScale;
        var domeH = (0.20 + 0.72 * dw) * gScale + domeIceLift * 0.55;
        var domeW = (0.28 + 0.42 * dw) * (ctx.rzSeam || 3.0) * 0.42;

        var domeMesh = new T.Mesh(domeGeo, chitinWetMat);
        var mRot = new T.Matrix4().makeBasis(domeFr.t, domeFr.n, domeFr.b);
        domeMesh.quaternion.setFromRotationMatrix(mRot);
        var dLift = domeH * 0.14 + domeIceLift * 0.45;
        domeMesh.position.set(
          domeFr.pt.x + domeFr.n.x * dLift,
          domeFr.pt.y + domeFr.n.y * dLift,
          domeFr.pt.z + domeFr.n.z * dLift
        );
        domeMesh.scale.set(domeLen, domeH, domeW);
        grp.add(domeMesh);

        // Paired lateral cranial cheek-flanges bracketing the primary dome
        if (!isCorridor) {
          for (var cfSide = -1; cfSide <= 1; cfSide += 2) {
            ctx.pushCustomRot(
              ribSegMats,
              domeFr,
              domeLen * 0.82,
              domeH * 0.32,
              domeW * 0.45,
              dLift + domeH * 0.05,
              -domeLen * 0.12,
              cfSide * domeW * 0.82,
              -0.06,
              cfSide * 0.28
            );
          }
        }

        // Secondary aft dorsal carapace shroud when dorsal aft is clear of keepout
        if (dw > 0.30 && (!keepout || !keepout.isBlocked(0.0, 0.48, 0.18))) {
          var aftDomeFr = ctx.evalSurfaceFrame(false, 0.48, 0.0, 0.94);
          var aftDomeMesh = new T.Mesh(makeGigerDomeGeo(T, isCorridor ? 12 : 20, isCorridor ? 8 : 14), chitinWetMat);
          var mRotAft = new T.Matrix4().makeBasis(aftDomeFr.t, aftDomeFr.n, aftDomeFr.b);
          aftDomeMesh.quaternion.setFromRotationMatrix(mRotAft);
          var aLift = domeH * 0.10;
          aftDomeMesh.position.set(
            aftDomeFr.pt.x + aftDomeFr.n.x * aLift,
            aftDomeFr.pt.y + aftDomeFr.n.y * aLift,
            aftDomeFr.pt.z + aftDomeFr.n.z * aLift
          );
          aftDomeMesh.scale.set(domeLen * 0.72, domeH * 0.72, domeW * 0.76);
          grp.add(aftDomeMesh);
        }
      }

      if (vertMats.length) {
        ctx.commitInstances(makeGigerVertebraGeo(T), ribMat, vertMats);
      }
      if (jointMats.length) {
        ctx.commitInstances(new T.SphereGeometry(1.0, 8, 6), jointMat, jointMats);
      }
      if (ribSegMats.length) {
        ctx.commitInstances(makeGigerRibSegGeo(T), ribMat, ribSegMats);
      }
      if (clampRingMats.length) {
        ctx.commitInstances(makeAxialTorusGeo(T, 0.34, 7, 14), jointMat, clampRingMats);
      }

      ctx.rootGroup.add(grp);
    }
  };

  root.LighthuggerStyleKits = root.LighthuggerStyleKits || {};
  root.LighthuggerStyleKits.gnostic = gnosticKit;
  root.LighthuggerStyleKits.giger = gigerKit;

  if (typeof module === 'object' && module.exports) {
    module.exports = {
      gnostic: gnosticKit,
      giger: gigerKit
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
