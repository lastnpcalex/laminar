/**
 * LighthuggerBuilder v3 - Authentic Long Patience high-res GLB hull & sculpted
 * cryo-ice fused with parametric non-intersecting Zando hulls, clean Gothic buttress
 * cones, rich procedural surface greebling, architectural Shuttle Port launch bays,
 * and 3 propulsion pod architectures (zero internal lab ice-bores, zero front clipping).
 */
(function (root) {
  'use strict';

  var G = root.LighthuggerGenome;

  function canvasTex(T, w, h, draw) {
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    if (T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  function decodeBase64(s) {
    var bin = atob(s);
    var buf = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function createSharedAssets(T, DR) {
    var texLoader = new T.TextureLoader();
    function loadDataTex(uri, isSRGB, repX, repY) {
      if (!uri) return null;
      var tex = texLoader.load(uri);
      tex.wrapS = tex.wrapT = T.RepeatWrapping;
      if (repX && repY) tex.repeat.set(repX, repY);
      if (isSRGB && T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
      tex.anisotropy = 4;
      return tex;
    }

    var texData = (DR && DR.textures) || {};
    var hullBaseTex = loadDataTex(texData.hullBaseColor, true, 2, 2);
    var hullNormTex = loadDataTex(texData.hullNormal, false, 2, 2);

    // High-detail procedural kilometer-scale hull albedo, bump & roughness maps tailored per hull architecture
    // Multi-scale strakes, chamfered bevel seams, recessed machinery trenches, cryo-manifolds, rivets & micro-ports
    function drawGreebledHullStyle(g, w, h, styleKey, mode) {
      var isBump = mode === 'bump' || mode === true;
      var isRough = mode === 'rough';
      var isScalar = isBump || isRough;
      var seedMap = { ogive: 42071, gothic: 51903, faceted: 64217, heavy: 78139 };
      var r = G.mulberry32(seedMap[styleKey] || 42071);

      var baseCol = isRough
        ? '#686868'
        : isBump ? '#7a7a7a'
        : styleKey === 'ogive' ? '#848eab'
        : styleKey === 'gothic' ? '#585c76'
        : styleKey === 'faceted' ? '#6a758f'
        : '#626b84';
      g.fillStyle = baseCol;
      g.fillRect(0, 0, w, h);

      if (!isScalar) {
        var bg = g.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0.0, 'rgba(14, 18, 34, 0.36)');
        bg.addColorStop(0.35, 'rgba(195, 210, 240, 0.09)');
        bg.addColorStop(0.68, 'rgba(20, 24, 42, 0.24)');
        bg.addColorStop(1.0, 'rgba(12, 14, 28, 0.36)');
        g.fillStyle = bg;
        g.fillRect(0, 0, w, h);
      }

      // Helper: draw recessed dark machinery trench filled with cross-trusses, pipe runs & micro service lights
      function drawMachineryTrench(tx, ty, tw, th, vertical) {
        g.fillStyle = isRough ? 'rgba(224,224,224,0.95)' : isBump ? 'rgba(22,22,22,0.94)' : 'rgba(12,15,26,0.90)';
        g.fillRect(tx, ty, tw, th);
        g.strokeStyle = isRough ? 'rgba(110,110,110,0.6)' : isBump ? 'rgba(228,228,228,0.62)' : 'rgba(176,194,232,0.34)';
        g.lineWidth = 1.2;
        g.strokeRect(tx, ty, tw, th);

        var nPipes = 2 + Math.floor(r() * 3);
        for (var pi = 0; pi < nPipes; pi++) {
          if (vertical) {
            var px = tx + 3 + (pi + 0.5) * ((tw - 6) / nPipes);
            g.fillStyle = isRough ? 'rgba(72,72,72,0.90)' : isBump ? 'rgba(188,188,188,0.86)' : 'rgba(104,120,156,0.86)';
            g.fillRect(px - 1, ty + 2, 2.2, th - 4);
            if (!isScalar) {
              g.fillStyle = 'rgba(218,232,255,0.44)';
              g.fillRect(px - 0.3, ty + 2, 0.8, th - 4);
            }
          } else {
            var py = ty + 3 + (pi + 0.5) * ((th - 6) / nPipes);
            g.fillStyle = isRough ? 'rgba(72,72,72,0.90)' : isBump ? 'rgba(188,188,188,0.86)' : 'rgba(104,120,156,0.86)';
            g.fillRect(tx + 2, py - 1, tw - 4, 2.2);
          }
        }
        g.fillStyle = isRough ? 'rgba(104,104,104,0.85)' : isBump ? 'rgba(216,216,216,0.78)' : 'rgba(70,80,108,0.90)';
        var span = vertical ? th : tw;
        var step = 11 + Math.floor(r() * 9);
        for (var pos = step * 0.5; pos < span - 4; pos += step) {
          if (vertical) g.fillRect(tx + 1, ty + pos, tw - 2, 2);
          else g.fillRect(tx + pos, ty + 1, 2, th - 2);
        }
        // Subtle recessed maintenance bay micro-viewports inside dark hull trenches
        if (!isScalar && r() < 0.34 && tw > 22 && th > 10) {
          var litC = r() < 0.65 ? 'rgba(255, 206, 132, 0.52)' : 'rgba(116, 232, 255, 0.48)';
          g.fillStyle = litC;
          for (var wi = 0; wi < 3; wi++) {
            g.fillRect(tx + 4 + wi * 6, ty + th * 0.5 - 1, 3, 2);
          }
        }
      }

      // Helper: crisp chamfered plate bevel (specular top-left edge, dark AO bottom-right edge) + corner rivets
      function drawPlateBevel(x, y, pw, ph) {
        if (pw < 16 || ph < 12) return;
        if (isRough) {
          g.strokeStyle = 'rgba(54,54,54,0.65)';
          g.lineWidth = 1.0;
          g.strokeRect(x + 2, y + 2, pw - 4, ph - 4);
          return;
        }
        g.strokeStyle = isBump ? 'rgba(226,226,226,0.52)' : 'rgba(214,228,255,0.28)';
        g.lineWidth = 1.0;
        g.beginPath();
        g.moveTo(x + 2, y + ph - 2);
        g.lineTo(x + 2, y + 2);
        g.lineTo(x + pw - 2, y + 2);
        g.stroke();
        g.strokeStyle = isBump ? 'rgba(18,18,18,0.72)' : 'rgba(8,10,18,0.58)';
        g.beginPath();
        g.moveTo(x + pw - 2, y + 2);
        g.lineTo(x + pw - 2, y + ph - 2);
        g.lineTo(x + 2, y + ph - 2);
        g.stroke();
        // Corner weld fasteners / inspection rivets
        g.fillStyle = isBump ? 'rgba(232,232,232,0.56)' : 'rgba(18,22,36,0.55)';
        g.fillRect(x + 4, y + 4, 1.5, 1.5);
        g.fillRect(x + pw - 5.5, y + 4, 1.5, 1.5);
        g.fillRect(x + 4, y + ph - 5.5, 1.5, 1.5);
        g.fillRect(x + pw - 5.5, y + ph - 5.5, 1.5, 1.5);
      }

      if (styleKey === 'faceted') {
        // Interlocking angled RAM armor facets, beveled chevron ribs, & recessed emitter slats
        var nBands = 12;
        var bandH = h / nBands;
        for (var row = 0; row < nBands; row++) {
          var y0 = row * bandH;
          var xOff = (row % 2) * -58;
          while (xOff < w + 96) {
            var pw = 54 + Math.floor(r() * 98);
            var slant = (row % 2 === 0 ? 1 : -1) * (12 + Math.floor(r() * 16));
            var t = r();
            g.fillStyle = isRough
              ? ('rgb(' + Math.round(62 + t * 52) + ',' + Math.round(62 + t * 52) + ',' + Math.round(62 + t * 52) + ')')
              : isBump
                ? ('rgb(' + Math.round(92 + t * 62) + ',' + Math.round(92 + t * 62) + ',' + Math.round(92 + t * 62) + ')')
                : ('rgb(' + Math.round(78 + t * 58) + ',' + Math.round(90 + t * 62) + ',' + Math.round(118 + t * 68) + ')');
            g.beginPath();
            g.moveTo(xOff + 2, y0 + 2);
            g.lineTo(xOff + pw - 2, y0 + 2);
            g.lineTo(xOff + pw - 2 + slant, y0 + bandH - 2);
            g.lineTo(xOff + 2 + slant, y0 + bandH - 2);
            g.closePath();
            g.fill();
            g.strokeStyle = isRough ? 'rgba(218,218,218,0.92)' : isBump ? 'rgba(20,20,20,0.94)' : 'rgba(10,13,22,0.86)';
            g.lineWidth = 2.0;
            g.stroke();

            if (!isRough) {
              g.strokeStyle = isBump ? 'rgba(218,218,218,0.48)' : 'rgba(210,226,255,0.24)';
              g.lineWidth = 1.0;
              g.beginPath();
              g.moveTo(xOff + 4, y0 + 4);
              g.lineTo(xOff + pw - 4, y0 + 4);
              g.stroke();
            }
            if (r() < 0.34 && pw > 68) {
              drawMachineryTrench(xOff + pw * 0.24, y0 + bandH * 0.28, pw * 0.46, bandH * 0.44, false);
            }
            xOff += pw;
          }
        }
      } else if (styleKey === 'gothic') {
        // Cathedral-ark vaulted rib bays, lancet arch recesses, flying-buttress mullions & ember gallery slits
        var gCols = 14, colW = w / gCols;
        for (var c = 0; c < gCols; c++) {
          var gx = c * colW;
          g.fillStyle = isRough ? 'rgba(66,66,66,0.9)' : isBump ? 'rgba(232,232,232,0.78)' : 'rgba(48,52,74,0.94)';
          g.fillRect(gx, 0, 7, h);
          g.fillStyle = isRough ? 'rgba(52,52,52,0.8)' : isBump ? 'rgba(186,186,186,0.68)' : 'rgba(120,130,164,0.62)';
          g.fillRect(gx + 2, 0, 2, h);

          var tiers = 6, tierH = h / tiers;
          for (var tr = 0; tr < tiers; tr++) {
            var gy = tr * tierH;
            var tone = r();
            g.fillStyle = isRough
              ? ('rgb(' + Math.round(78 + tone * 58) + ',' + Math.round(78 + tone * 58) + ',' + Math.round(78 + tone * 58) + ')')
              : isBump
                ? ('rgb(' + Math.round(82 + tone * 54) + ',' + Math.round(82 + tone * 54) + ',' + Math.round(82 + tone * 54) + ')')
                : ('rgb(' + Math.round(64 + tone * 48) + ',' + Math.round(68 + tone * 50) + ',' + Math.round(92 + tone * 56) + ')');
            g.fillRect(gx + 8, gy + 3, colW - 10, tierH - 6);
            drawPlateBevel(gx + 8, gy + 3, colW - 10, tierH - 6);
            g.strokeStyle = isRough ? 'rgba(218,218,218,0.9)' : isBump ? 'rgba(18,18,18,0.94)' : 'rgba(10,12,20,0.88)';
            g.lineWidth = 1.6;
            g.strokeRect(gx + 8, gy + 3, colW - 10, tierH - 6);

            var bx = gx + 12, bw = colW - 18, by = gy + 7, bh = tierH - 14;
            if (r() < 0.34) {
              drawMachineryTrench(bx, by, bw, bh, true);
            } else {
              var nLancets = 3 + Math.floor(r() * 2);
              var lw = (bw - 4) / nLancets;
              for (var li = 0; li < nLancets; li++) {
                var lx = bx + 2 + li * lw;
                g.fillStyle = isRough ? 'rgba(220,220,220,0.92)' : isBump ? 'rgba(26,26,26,0.90)' : 'rgba(14,16,28,0.90)';
                g.beginPath();
                g.moveTo(lx + 1, by + bh);
                g.lineTo(lx + 1, by + bh * 0.35);
                g.lineTo(lx + lw * 0.45, by);
                g.lineTo(lx + lw - 2, by + bh * 0.35);
                g.lineTo(lx + lw - 2, by + bh);
                g.closePath();
                g.fill();
                if (!isScalar && r() < 0.30) {
                  g.fillStyle = 'rgba(255, 184, 96, 0.64)';
                  g.fillRect(lx + lw * 0.32, by + bh * 0.45, Math.max(2, lw * 0.26), 4);
                }
              }
            }
          }
        }
      } else {
        // 'ogive' & 'heavy': Asymmetric multi-scale longitudinal strakes + recessed cryo-trenches & thermal tile grids
        var bands = styleKey === 'heavy' ? 10 : 14;
        var yAccum = 0;
        for (var bi = 0; bi < bands; bi++) {
          var bandH2 = bi === bands - 1 ? (h - yAccum) : Math.round((h / bands) * (0.68 + r() * 0.64));
          bandH2 = Math.max(18, Math.min(h - yAccum, bandH2));
          var xCur = -Math.floor(r() * 48);
          while (xCur < w + 48) {
            var segW = (styleKey === 'heavy' ? 42 : 58) + Math.floor(r() * 116);
            var tone2 = r();
            if (isRough) {
              var rv = Math.round((styleKey === 'ogive' ? 62 : 76) + tone2 * 56);
              g.fillStyle = 'rgb(' + rv + ',' + rv + ',' + rv + ')';
            } else if (isBump) {
              var bv = Math.round(94 + tone2 * 64);
              g.fillStyle = 'rgb(' + bv + ',' + bv + ',' + bv + ')';
            } else {
              var baseV = styleKey === 'ogive' ? 116 : 90;
              var shade = Math.round(baseV + tone2 * 64);
              g.fillStyle = 'rgb(' + Math.round(shade * 0.90) + ',' + Math.round(shade * 0.97) + ',' + Math.min(255, Math.round(shade * 1.13)) + ')';
            }
            g.fillRect(xCur + 1.5, yAccum + 1.5, segW - 3, bandH2 - 3);
            drawPlateBevel(xCur + 1.5, yAccum + 1.5, segW - 3, bandH2 - 3);

            // Micro thermal-tile sub-seams on larger armor plates
            if (r() < 0.48 && segW > 64 && bandH2 > 22) {
              var inset = 5 + Math.floor(r() * 4);
              g.strokeStyle = isRough ? 'rgba(130,130,130,0.45)' : isBump ? 'rgba(208,208,208,0.45)' : 'rgba(190,208,242,0.22)';
              g.lineWidth = 1;
              g.strokeRect(xCur + inset, yAccum + inset, segW - inset * 2, bandH2 - inset * 2);
              if (segW > 94) {
                g.beginPath();
                g.moveTo(xCur + segW * 0.5, yAccum + inset);
                g.lineTo(xCur + segW * 0.5, yAccum + bandH2 - inset);
                g.stroke();
              }
            }
            g.strokeStyle = isRough ? 'rgba(218,218,218,0.90)' : isBump ? 'rgba(20,20,20,0.90)' : 'rgba(12,15,28,0.82)';
            g.lineWidth = 1.6;
            g.strokeRect(xCur + 1, yAccum + 1, segW - 2, bandH2 - 2);

            if (r() < 0.44 && segW > 52 && bandH2 > 22) {
              var padX = 7 + Math.floor(r() * 10);
              var padY = 5 + Math.floor(r() * Math.max(2, bandH2 * 0.25));
              var tW = Math.max(18, segW - padX * 2 - Math.floor(r() * 18));
              var tH = Math.max(9, bandH2 - padY * 2);
              drawMachineryTrench(xCur + padX, yAccum + padY, tW, tH, styleKey === 'heavy' && r() < 0.4);
            } else if (!isScalar && r() < 0.16 && bandH2 > 20) {
              g.fillStyle = styleKey === 'heavy' ? 'rgba(224, 134, 62, 0.38)' : 'rgba(110, 186, 232, 0.26)';
              g.fillRect(xCur + 6, yAccum + bandH2 * 0.42, segW - 12, 2.5);
            }
            xCur += segW;
          }
          yAccum += bandH2;
          if (yAccum >= h) break;
        }
      }

      // Continuous multi-strand superconducting & cryo-coolant spine trunks
      var nTrunks = styleKey === 'heavy' ? 8 : styleKey === 'gothic' ? 6 : 5;
      for (var ci = 0; ci < nTrunks; ci++) {
        var cx = Math.floor(((ci + 0.3 + r() * 0.4) / nTrunks) * (w - 16));
        var cw = styleKey === 'heavy' ? (3.5 + r() * 3.5) : (2.2 + r() * 2.2);
        g.fillStyle = isRough ? 'rgba(210,210,210,0.85)' : isBump ? 'rgba(24,24,24,0.86)' : 'rgba(14,17,30,0.86)';
        g.fillRect(cx - 2, 0, cw + 4, h);
        g.fillStyle = isRough ? 'rgba(64,64,64,0.90)' : isBump ? 'rgba(228,228,228,0.82)' : 'rgba(68,80,114,0.90)';
        g.fillRect(cx, 0, cw, h);
        if (!isScalar) {
          g.fillStyle = 'rgba(208,224,255,0.48)';
          g.fillRect(cx + cw * 0.32, 0, Math.max(1, cw * 0.26), h);
        }
      }

      // Hypervelocity micrometeoroid pitting & relativistic dust weathering micro-streaks
      for (var st = 0; st < 880; st++) {
        var sx = r() * w, sy = r() * h, sl = 12 + r() * 58;
        g.fillStyle = isRough ? 'rgba(176,176,176,0.28)' : isBump ? 'rgba(46,46,46,0.32)' : 'rgba(14,18,32,0.24)';
        g.fillRect(sx, sy, 1.3, sl);
      }
    }

    var hullStyles = {};
    ['ogive', 'gothic', 'faceted', 'heavy'].forEach(function (sk) {
      var bMap = canvasTex(T, 1024, 512, function (g, w, h) { drawGreebledHullStyle(g, w, h, sk, 'base'); });
      bMap.repeat.set(3, 3);
      var dMap = canvasTex(T, 1024, 512, function (g, w, h) { drawGreebledHullStyle(g, w, h, sk, 'bump'); });
      dMap.repeat.set(3, 3);
      var rMap = canvasTex(T, 512, 256, function (g, w, h) { drawGreebledHullStyle(g, w, h, sk, 'rough'); });
      rMap.repeat.set(3, 3);
      if (T.NoColorSpace) { dMap.colorSpace = T.NoColorSpace; rMap.colorSpace = T.NoColorSpace; }
      hullStyles[sk] = { base: bMap, bump: dMap, rough: rMap };
    });
    var hullPlateBaseTex = hullStyles.ogive.base;
    var hullPlateBumpTex = hullStyles.ogive.bump;
    var hullPlateRoughTex = hullStyles.ogive.rough;

    // Elevated Long Patience crystalline glacier texture (subsurface strata, sapphire fractures, ISM ablation streaks & glints)
    var frostTex = canvasTex(T, 1024, 1024, function (g, w, h) {
      g.fillStyle = '#d0edf7';
      g.fillRect(0, 0, w, h);

      var grad = g.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0.00, 'rgba(244, 252, 255, 0.98)');
      grad.addColorStop(0.28, 'rgba(186, 228, 248, 0.92)');
      grad.addColorStop(0.56, 'rgba(228, 247, 255, 0.95)');
      grad.addColorStop(0.82, 'rgba(156, 210, 238, 0.94)');
      grad.addColorStop(1.00, 'rgba(216, 240, 252, 0.97)');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);

      var r = G.mulberry32(7331);
      // Broad subsurface glacial depth pockets (deep cyan-teal optical depth under translucent crust)
      for (var dp = 0; dp < 48; dp++) {
        var dx = r() * w, dy = r() * h, dr = 38 + r() * 96;
        var gDep = g.createRadialGradient(dx, dy, 4, dx, dy, dr);
        gDep.addColorStop(0.0, r() < 0.6 ? 'rgba(64, 148, 192, 0.34)' : 'rgba(255, 255, 255, 0.38)');
        gDep.addColorStop(1.0, 'rgba(180, 228, 248, 0)');
        g.fillStyle = gDep;
        g.beginPath(); g.arc(dx, dy, dr, 0, Math.PI * 2); g.fill();
      }
      // Fine crystalline ice needles & longitudinal relativistic ISM ablation streaks
      for (var f = 0; f < 4200; f++) {
        var fx = r() * w, fy = r() * h;
        var flen = 6 + r() * 34;
        var fang = (r() - 0.5) * 0.28;
        g.strokeStyle = r() < 0.72 ? 'rgba(255, 255, 255, 0.76)' : 'rgba(112, 194, 236, 0.58)';
        g.lineWidth = 0.7 + r() * 1.6;
        g.beginPath();
        g.moveTo(fx, fy);
        g.lineTo(fx + flen * Math.cos(fang), fy + flen * Math.sin(fang));
        g.stroke();
      }

      // Deep sapphire pressure-fracture crevasses with bright sunlit frost rims
      for (var c = 0; c < 110; c++) {
        var cx = r() < 0.65 ? r() * 480 : r() * w;
        var cy = r() * h;
        var segs = 4 + Math.floor(r() * 6);
        g.strokeStyle = 'rgba(38, 118, 166, 0.72)';
        g.lineWidth = 1.6 + r() * 2.4;
        g.beginPath();
        g.moveTo(cx, cy);
        var pts = [[cx, cy]];
        for (var s = 0; s < segs; s++) {
          cx += (r() - 0.45) * 44;
          cy += (r() - 0.5) * 34;
          pts.push([cx, cy]);
          g.lineTo(cx, cy);
        }
        g.stroke();

        g.strokeStyle = 'rgba(255, 255, 255, 0.82)';
        g.lineWidth = 1.0;
        g.beginPath();
        g.moveTo(pts[0][0] + 1.2, pts[0][1] - 1.2);
        for (var s2 = 1; s2 < pts.length; s2++) {
          g.lineTo(pts[s2][0] + 1.2, pts[s2][1] - 1.2);
        }
        g.stroke();
      }

      g.fillStyle = 'rgba(255, 255, 255, 0.38)';
      for (var p = 0; p < 7200; p++) {
        g.fillRect(r() * w, r() * h, 1.4, 1.4);
      }
    });

    // High-res 1024x1024 Glacial Bumps, Relativistic Ablation Rilles & Tiered Impact Crater Bump Map
    var frostCraterBumpTex = canvasTex(T, 1024, 1024, function (g, w, h) {
      g.fillStyle = '#808080';
      g.fillRect(0, 0, w, h);
      var r = G.mulberry32(99173);
      for (var m = 0; m < 88; m++) {
        var mx = r() * w, my = r() * h, mr = 42 + r() * 116;
        var bright = r() < 0.55;
        var gr = g.createRadialGradient(mx, my, 4, mx, my, mr);
        gr.addColorStop(0, bright ? 'rgba(238,238,238,0.44)' : 'rgba(34,34,34,0.42)');
        gr.addColorStop(1, 'rgba(128,128,128,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.arc(mx, my, mr, 0, Math.PI * 2);
        g.fill();
      }
      // Fine longitudinal ISM erosion grooves / glacial flutes
      for (var fl = 0; fl < 320; fl++) {
        var lx = r() * w, ly = r() * h, ll = 36 + r() * 110;
        g.strokeStyle = fl % 2 === 0 ? 'rgba(218,218,218,0.28)' : 'rgba(42,42,42,0.28)';
        g.lineWidth = 1.2 + r() * 2.2;
        g.beginPath(); g.moveTo(lx, ly); g.lineTo(lx + ll, ly + (r() - 0.5) * 10); g.stroke();
      }
      for (var c = 0; c < 64; c++) {
        var cx = r() * w, cy = r() * h, cr = 14 + r() * 48;
        var rim = g.createRadialGradient(cx, cy, cr * 0.52, cx, cy, cr * 1.28);
        rim.addColorStop(0.0, 'rgba(18,18,18,0.90)');
        rim.addColorStop(0.60, 'rgba(52,52,52,0.74)');
        rim.addColorStop(0.84, 'rgba(248,248,248,0.88)');
        rim.addColorStop(1.0, 'rgba(128,128,128,0)');
        g.fillStyle = rim;
        g.beginPath();
        g.arc(cx, cy, cr * 1.28, 0, Math.PI * 2);
        g.fill();
      }
    });
    frostCraterBumpTex.repeat.set(2, 2);
    if (T.NoColorSpace) frostCraterBumpTex.colorSpace = T.NoColorSpace;

    // Circumferential Waist City-Window Collar Emissive Map (multi-tier habitation decks & structural pilasters)
    var cityCollarTex = canvasTex(T, 1024, 256, function (g, w, h) {
      g.fillStyle = '#05060c';
      g.fillRect(0, 0, w, h);
      var r = G.mulberry32(8821);
      g.fillStyle = '#121524';
      g.fillRect(0, 14, w, h - 28);
      // Recessed deck overhang shadow ledges
      for (var dy = 24; dy < h - 20; dy += 28) {
        g.fillStyle = '#080912';
        g.fillRect(0, dy, w, 6);
      }

      var rows = [32, 60, 88, 116, 144, 172, 200, 224];
      rows.forEach(function (ry, ri) {
        var x = 4;
        while (x < w - 8) {
          var segW = 4 + Math.floor(r() * 18);
          var gap = 2 + Math.floor(r() * 8);
          if (r() > 0.14) {
            var pick = r();
            g.fillStyle = pick < 0.52 ? '#ffe5ad' : pick < 0.82 ? '#e8f7ff' : '#66f0ff';
            g.fillRect(x, ry, segW, ri % 2 === 0 ? 7 : 5);
            if (segW > 10) {
              g.fillStyle = 'rgba(10, 12, 22, 0.72)';
              g.fillRect(x + Math.floor(segW * 0.5), ry, 1.5, ri % 2 === 0 ? 7 : 5);
            }
          }
          x += segW + gap;
        }
      });

      // Heavy armored vertical structural pilasters dividing city bays
      for (var bx = 0; bx < w; bx += 64) {
        g.fillStyle = '#070810';
        g.fillRect(bx, 0, 10, h);
        g.fillStyle = 'rgba(110, 212, 255, 0.34)';
        g.fillRect(bx + 4, 14, 2, h - 28);
      }
    });

    // Gothic Spire Ember Pinprick Lights + Cathedral Panel Map
    var gothicEmberTex = canvasTex(T, 1024, 512, function (g, w, h) {
      g.fillStyle = '#05050a';
      g.fillRect(0, 0, w, h);
      var r = G.mulberry32(19937);
      g.strokeStyle = 'rgba(32, 34, 52, 0.6)';
      g.lineWidth = 2;
      for (var y = 16; y < h; y += 28) {
        g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
      }
      for (var x = 0; x < w; x += 32) {
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
      }
      for (var i = 0; i < 1600; i++) {
        var px = Math.floor(r() * w);
        var py = Math.floor(r() * h);
        var pw = 1 + (r() < 0.35 ? 2 : 1);
        var ph = 1 + (r() < 0.2 ? 1 : 0);
        var cPick = r();
        g.fillStyle = cPick < 0.55 ? '#ff7b29' : cPick < 0.85 ? '#ffd080' : '#ff3219';
        g.fillRect(px, py, pw, ph);
      }
    });

    var heatTex = canvasTex(T, 512, 128, function (g, w, h) {
      var grad = g.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0.00, '#18070a');
      grad.addColorStop(0.24, '#590b12');
      grad.addColorStop(0.50, '#c81d08');
      grad.addColorStop(0.74, '#ff4d00');
      grad.addColorStop(0.90, '#ffa324');
      grad.addColorStop(1.00, '#fff7dc');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    });

    var radTex = canvasTex(T, 256, 256, function (g, w, h) {
      var grad = g.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0.0, '#ff5338');
      grad.addColorStop(0.35, '#b8171c');
      grad.addColorStop(0.75, '#6e0d18');
      grad.addColorStop(1.0, '#2c0710');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255, 160, 140, 0.24)';
      g.lineWidth = 2;
      for (var x = 10; x < w; x += 16) {
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
      }
    });

    var plumeVert =
      'varying vec2 vUv; varying vec3 vN; varying vec3 vV;' +
      'void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0);' +
      ' vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }';

    var plumeFragOuter =
      'uniform vec3 uColor; uniform float uOn; uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;' +
      'void main(){' +
      '  float ndv = max(1e-4, abs(dot(vN, vV)));' +
      '  float c = pow(ndv, 1.55);' +
      '  float axial = clamp(vUv.y, 0.0, 1.0);' +
      '  float pinch = 0.78 + 0.22 * cos((1.0 - axial) * 28.0 - uTime * 16.0) * smoothstep(0.15, 0.92, axial);' +
      '  float streak = 0.84 + 0.16 * sin(vUv.x * 37.699 + (1.0 - axial) * 14.0 - uTime * 22.0);' +
      '  float throat = pow(axial, 5.5) * 0.65;' +
      '  float a = (pow(max(1e-4, axial), 2.05) * pinch * streak + throat) * c * uOn;' +
      '  vec3 col = mix(uColor, vec3(0.86, 0.95, 1.0), clamp(throat * 1.15, 0.0, 0.78));' +
      '  vec3 lit = col * a * 2.85;' +
      '  gl_FragColor = vec4(vec3(1.0) - exp(-lit), clamp(a, 0.0, 1.0));' +
      '}';

    var plumeFragCore =
      'uniform vec3 uColor; uniform float uOn; uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;' +
      'void main(){' +
      '  float ndv = max(1e-4, abs(dot(vN, vV)));' +
      '  float c = pow(ndv, 1.08);' +
      '  float axial = clamp(vUv.y, 0.0, 1.0);' +
      '  float diamond = pow(0.5 + 0.5 * cos((1.0 - axial) * 34.0 - uTime * 18.0), 2.2);' +
      '  float jet = pow(max(1e-4, axial), 1.65) * (0.76 + 0.38 * diamond * smoothstep(0.12, 0.96, axial));' +
      '  float a = jet * c * uOn;' +
      '  vec3 hot = mix(uColor, vec3(1.0, 0.99, 1.0), smoothstep(0.45, 0.98, axial) * 0.72 + diamond * 0.24);' +
      '  vec3 lit = hot * a * 3.55;' +
      '  gl_FragColor = vec4(vec3(1.0) - exp(-lit), clamp(a, 0.0, 1.0));' +
      '}';

    // Pre-decode ALL genuine DR.lighthugger groups in native right-handed orientation:
    // +X forward bow, +Y dorsal (shuttle hatches & top lights), +-Z starboard/port lateral!
    var LH = DR && DR.lighthugger ? DR.lighthugger : null;
    var groupsByName = {};
    var podGroups = [];
    var aftHullGroups = [];

    // Sample normalized radial profile along ax for exact greeble/shuttle-port seating!
    var aftProfileY = new Float32Array(33);
    var aftProfileZ = new Float32Array(33);
    var fwdProfileY = new Float32Array(33);
    var fwdProfileZ = new Float32Array(33);
    var AFT_ANG_BINS = 24;
    var aftPolar = new Float32Array(33 * AFT_ANG_BINS);

    function isPodName(name) {
      return (
        name === '04_Integrated_Pylons' ||
        name === '05_Ramjet_Nacelle_Shells' ||
        name === '06_Open_Inlet_And_Exhaust_Rims' ||
        name === '07_Through_Ducts' ||
        name === '08_Projecting_Intake_Centerbodies' ||
        name === '09_Stationary_Intake_Supports'
      );
    }

    if (LH && Array.isArray(LH.groups)) {
      LH.groups.forEach(function (g) {
        var n = g.count, lo = g.min, sp = g.span, ulo = g.uvMin, usp = g.uvSpan;
        var pq = new Int16Array(decodeBase64(g.position));
        var nq = new Int8Array(decodeBase64(g.normal));
        var uq = new Uint16Array(decodeBase64(g.uv));
        var iq = new Uint16Array(decodeBase64(g.index));

        var ax = new Float32Array(n);
        var ay = new Float32Array(n);
        var az = new Float32Array(n);
        var nx = new Float32Array(n);
        var ny = new Float32Array(n);
        var nz = new Float32Array(n);
        var uv = new Float32Array(n * 2);

        for (var k = 0; k < n; k++) {
          ax[k] = lo[0] + (pq[3 * k] + 32768) / 65535 * sp[0];
          ay[k] = lo[1] + (pq[3 * k + 1] + 32768) / 65535 * sp[1];
          var zVal = lo[2] + (pq[3 * k + 2] + 32768) / 65535 * sp[2];
          if (g.name === '04_Integrated_Pylons') {
            if (zVal > 1.36) zVal = 1.36;
            else if (zVal < -1.36) zVal = -1.36;
          }
          az[k] = zVal;
          nx[k] = nq[3 * k] / 127;
          ny[k] = nq[3 * k + 1] / 127;
          nz[k] = nq[3 * k + 2] / 127;
          uv[2 * k] = ulo[0] + uq[2 * k] / 65535 * usp[0];
          uv[2 * k + 1] = ulo[1] + uq[2 * k + 1] / 65535 * usp[1];

          if (g.name === '01_Hull') {
            var ti = clamp(Math.round((-ax[k] / 6.3) * 32), 0, 32);
            var ellY = ay[k] / 0.904;
            var ellZ = az[k] / 1.31;
            aftProfileY[ti] = Math.max(aftProfileY[ti], Math.abs(ellY));
            aftProfileZ[ti] = Math.max(aftProfileZ[ti], Math.abs(ellZ));
            var rPolar = Math.hypot(ellY, ellZ);
            if (rPolar > 0.04) {
              var phiEll = Math.atan2(ellZ, ellY);
              if (phiEll < 0) phiEll += Math.PI * 2;
              var ai = Math.round((phiEll / (Math.PI * 2)) * AFT_ANG_BINS) % AFT_ANG_BINS;
              var idxP = ti * AFT_ANG_BINS + ai;
              if (rPolar > aftPolar[idxP]) aftPolar[idxP] = rPolar;
            }
          } else if (g.name === '02_Ice_Lance_Shell' && ax[k] >= 0) {
            var ui = clamp(Math.round((ax[k] / 12.6) * 32), 0, 32);
            fwdProfileY[ui] = Math.max(fwdProfileY[ui], Math.abs(ay[k]) / 0.904);
            fwdProfileZ[ui] = Math.max(fwdProfileZ[ui], Math.abs(az[k]) / 1.31);
          }
        }

        var part = {
          name: g.name,
          material: g.material,
          count: n,
          ax: ax, ay: ay, az: az,
          nx: nx, ny: ny, nz: nz,
          uv: uv,
          index: iq
        };
        groupsByName[g.name] = part;
        if (isPodName(g.name)) podGroups.push(part);
        else if (
          g.name !== '02_Ice_Lance_Shell' &&
          g.name !== '03_Structure_Beneath_Ice'
        ) {
          aftHullGroups.push(part);
        }
      });

      // Fill any sparse profile bins smoothly and close forward tip cleanly to a cometary point
      for (var bi = 1; bi < 33; bi++) {
        if (aftProfileY[bi] < 0.05) aftProfileY[bi] = aftProfileY[bi - 1] * 0.92;
        if (aftProfileZ[bi] < 0.05) aftProfileZ[bi] = aftProfileZ[bi - 1] * 0.92;
        if (fwdProfileY[bi] < 0.015) fwdProfileY[bi] = fwdProfileY[bi - 1] * 0.78;
        if (fwdProfileZ[bi] < 0.015) fwdProfileZ[bi] = fwdProfileZ[bi - 1] * 0.78;
      }
      aftProfileY[0] = Math.max(0.98, aftProfileY[0]);
      aftProfileZ[0] = Math.max(0.98, aftProfileZ[0]);
      // Fill empty polar bins by circular neighbor smoothing + axial fallback
      for (var tiP = 0; tiP < 33; tiP++) {
        for (var aiP = 0; aiP < AFT_ANG_BINS; aiP++) {
          var pIdx = tiP * AFT_ANG_BINS + aiP;
          if (aftPolar[pIdx] < 0.04) {
            var prevA = aftPolar[tiP * AFT_ANG_BINS + ((aiP - 1 + AFT_ANG_BINS) % AFT_ANG_BINS)];
            var nextA = aftPolar[tiP * AFT_ANG_BINS + ((aiP + 1) % AFT_ANG_BINS)];
            var fallback = 0.5 * (aftProfileY[tiP] + aftProfileZ[tiP]);
            aftPolar[pIdx] = (prevA > 0.04 && nextA > 0.04) ? 0.5 * (prevA + nextA) : (prevA > 0.04 ? prevA : (nextA > 0.04 ? nextA : fallback));
          }
        }
      }
      fwdProfileY[31] = Math.min(fwdProfileY[31], 0.045);
      fwdProfileZ[31] = Math.min(fwdProfileZ[31], 0.045);
      fwdProfileY[32] = 0.004;
      fwdProfileZ[32] = 0.004;
    }

    return {
      LH: LH,
      groupsByName: groupsByName,
      podGroups: podGroups,
      aftHullGroups: aftHullGroups,
      profiles: {
        aftY: aftProfileY,
        aftZ: aftProfileZ,
        aftPolar: aftPolar,
        aftAngBins: AFT_ANG_BINS,
        fwdY: fwdProfileY,
        fwdZ: fwdProfileZ
      },
      textures: {
        hullBase: hullBaseTex,
        hullNorm: hullNormTex,
        hullPlateBase: hullPlateBaseTex,
        hullPlateBump: hullPlateBumpTex,
        hullPlateRough: hullPlateRoughTex,
        hullStyles: hullStyles,
        frost: frostTex,
        frostCraterBump: frostCraterBumpTex,
        cityCollar: cityCollarTex,
        gothicEmber: gothicEmberTex,
        heat: heatTex,
        rad: radTex
      },
      shaders: {
        plumeVert: plumeVert,
        plumeFragOuter: plumeFragOuter,
        plumeFragCore: plumeFragCore
      }
    };
  }

  function sampleProfile(arr, tNorm) {
    var pos = clamp(tNorm, 0, 1) * (arr.length - 1);
    var lo = Math.floor(pos), hi = Math.min(arr.length - 1, lo + 1);
    return lerp(arr[lo], arr[hi], pos - lo);
  }

  // Forward hull dimensionless radius r(u) for u in [0..1] (0 = waist seam, 1 = bow tip)
  function evalHullRadius(shared, hullShape, curve, u, phi) {
    var uClamped = clamp(u, 0, 1);
    if (hullShape === 'long-patience' && shared.profiles.fwdY[0] > 0.1) {
      var rY = sampleProfile(shared.profiles.fwdY, uClamped);
      var rZ = sampleProfile(shared.profiles.fwdZ, uClamped);
      var c = Math.cos(phi), s = Math.sin(phi);
      var blend = Math.sqrt(rY * rY * c * c + rZ * rZ * s * s);
      if (uClamped > 0.84) {
        var tp = (uClamped - 0.84) / 0.16;
        blend *= (1 - tp * tp * 0.94);
      }
      return Math.max(0.003, blend);
    }
    var base;
    if (hullShape === 'ogive-spindle') {
      var p = 1.25 + curve * 1.10;
      base = Math.pow(Math.max(0, 1 - Math.pow(uClamped, p)), 0.58 + (1 - curve) * 0.26);
    } else if (hullShape === 'bulbous-ram') {
      base = Math.pow(Math.max(0, 1 - uClamped * uClamped), 0.42 + (1 - curve) * 0.28) *
             (1 + 0.12 * Math.sin(uClamped * Math.PI));
    } else if (hullShape === 'faceted-lance') {
      var expF = 0.65 + (1 - curve) * 0.52;
      base = Math.pow(Math.max(0, 1 - uClamped), expF);
      var nSides = 8;
      var sector = (Math.PI * 2) / nSides;
      var localA = ((phi % sector) + sector) % sector - sector * 0.5;
      var polyFactor = Math.cos(sector * 0.5) / Math.max(0.55, Math.cos(localA));
      base *= lerp(1.0, polyFactor, 0.72);
    } else {
      // 'needle-spire'
      var expN = 0.72 + (1 - curve) * 0.68;
      base = Math.pow(Math.max(0, 1 - uClamped), expN);
    }
    return Math.max(0.004, base);
  }

  // Aft cone dimensionless radius r(t) for t in [0..1] (0 = waist seam, 1 = stern)
  // Smooth clean taper to apex (0.004) with zero blunt cylindrical funnel stem!
  function evalAftRadius(shared, aftShape, greebles, t, phi) {
    var tc = clamp(t, 0, 1);
    if (aftShape === 'long-patience-aft' && shared.profiles.aftY[0] > 0.1) {
      var rY = sampleProfile(shared.profiles.aftY, tc);
      var rZ = sampleProfile(shared.profiles.aftZ, tc);
      var c = Math.cos(phi), s = Math.sin(phi);
      return Math.max(0.18, Math.sqrt(rY * rY * c * c + rZ * rZ * s * s));
    }
    if (aftShape === 'sleek-ogive') {
      var og = Math.pow(Math.max(0, 1 - Math.pow(tc, 1.52)), 0.72);
      var blister = (0.03 + 0.055 * greebles) * Math.sin(tc * Math.PI) * (1 - tc) * Math.pow(Math.max(0, Math.cos(6 * phi)), 2);
      return Math.max(0.004, og + blister);
    }
    if (aftShape === 'twin-boom') {
      return Math.max(0.004, Math.pow(Math.max(0, 1 - tc), 1.08));
    }
    // 'gothic-bastion' (architectural terraced spire tapering cleanly to a sharp stern apex)
    var spire = Math.pow(Math.max(0, 1 - tc), 0.86);
    var terrace = (0.015 + 0.028 * greebles) * Math.sin(tc * Math.PI * 14.0) * Math.pow(Math.max(0, 1 - tc), 1.15);
    return Math.max(0.004, spire + terrace);
  }

  function buildRevolvedGeometry(T, NU, NV, sampleFn, withColors, capEnd) {
    var cols = NV + 1;
    var sideCount = (NU + 1) * cols;
    var count = sideCount + (capEnd ? cols : 0);
    var pos = new Float32Array(count * 3);
    var uv = new Float32Array(count * 2);
    var col = withColors ? new Float32Array(count * 3) : null;
    var out = { x: 0, y: 0, z: 0, r: 1, g: 1, b: 1 };

    var p = 0;
    for (var iu = 0; iu <= NU; iu++) {
      var u = iu / NU;
      for (var iv = 0; iv <= NV; iv++) {
        var v = iv / NV;
        var phi = iv === NV ? 0 : v * Math.PI * 2;
        sampleFn(u, phi, out);
        pos[3 * p] = out.x;
        pos[3 * p + 1] = out.y;
        pos[3 * p + 2] = out.z;
        uv[2 * p] = v * 3.0;
        uv[2 * p + 1] = u * 2.0;
        if (col) {
          col[3 * p] = out.r;
          col[3 * p + 1] = out.g;
          col[3 * p + 2] = out.b;
        }
        p++;
      }
    }

    var idx = [];
    var forward = pos[NU * cols * 3] > pos[0];
    for (var i = 0; i < NU; i++) {
      for (var j = 0; j < NV; j++) {
        var a = i * cols + j;
        var b = a + 1;
        var c = (i + 1) * cols + j;
        var d = c + 1;
        if (forward) idx.push(a, b, c, b, d, c);
        else idx.push(a, c, b, b, c, d);
      }
    }

    if (capEnd) {
      // Separate rim vertices preserve the hard edge of the end plate.
      var center = count - 1;
      pos[center * 3] = pos[NU * cols * 3];
      for (var j = 0; j < NV; j++) {
        var rim = sideCount + j;
        var src = NU * cols + j;
        pos.set(pos.subarray(src * 3, src * 3 + 3), rim * 3);
        uv[2 * rim] = 0.5 + 0.5 * Math.cos(j * 2 * Math.PI / NV);
        uv[2 * rim + 1] = 0.5 + 0.5 * Math.sin(j * 2 * Math.PI / NV);
        if (col) col.set(col.subarray(src * 3, src * 3 + 3), rim * 3);
        var next = sideCount + (j + 1) % NV;
        if (forward) idx.push(center, rim, next);
        else idx.push(center, next, rim);
      }
      uv[2 * center] = uv[2 * center + 1] = 0.5;
      if (col) col.set(col.subarray(sideCount * 3, sideCount * 3 + 3), center * 3);
    }
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new T.BufferAttribute(uv, 2));
    if (col) geo.setAttribute('color', new T.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    var normals = geo.attributes.normal;
    var seamNormal = new T.Vector3();
    for (var row = 0; row <= NU; row++) {
      var first = row * cols, last = first + NV;
      seamNormal.set(normals.getX(first) + normals.getX(last),
        normals.getY(first) + normals.getY(last), normals.getZ(first) + normals.getZ(last)).normalize();
      normals.setXYZ(first, seamNormal.x, seamNormal.y, seamNormal.z);
      normals.setXYZ(last, seamNormal.x, seamNormal.y, seamNormal.z);
    }
    return geo;
  }

  // Exact surface point & outward radial unit normal on aft hull (phi = 0 is +Y dorsal, phi = PI/2 is +Z starboard)
  function evalAftPoint(shared, aftShape, greebles, seamX, aftSpan, rySeam, rzSeam, t, phi, insetScale) {
    var rNorm = evalAftRadius(shared, aftShape, greebles, t, phi) * (insetScale || 1.0);
    var c = Math.cos(phi), s = Math.sin(phi);
    return {
      x: seamX - t * aftSpan,
      y: rySeam * rNorm * c,
      z: rzSeam * rNorm * s,
      ny: c,
      nz: s,
      ry: rySeam * rNorm,
      rz: rzSeam * rNorm
    };
  }

  function evalExactAftRadius(shared, aftShape, greebles, t, phi) {
    if (aftShape === 'long-patience-aft' && shared.profiles.aftPolar && shared.profiles.aftAngBins) {
      var bins = shared.profiles.aftAngBins;
      var polar = shared.profiles.aftPolar;
      var tPos = clamp(t, 0, 1) * 32;
      var t0 = Math.floor(tPos), t1 = Math.min(32, t0 + 1), ft = tPos - t0;
      var pWrap = ((phi % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      var aPos = (pWrap / (Math.PI * 2)) * bins;
      var a0 = Math.floor(aPos) % bins, a1 = (a0 + 1) % bins, fa = aPos - Math.floor(aPos);
      var r00 = polar[t0 * bins + a0], r01 = polar[t0 * bins + a1];
      var r10 = polar[t1 * bins + a0], r11 = polar[t1 * bins + a1];
      return Math.max(0.14, lerp(lerp(r00, r01, fa), lerp(r10, r11, fa), ft));
    }
    return evalAftRadius(shared, aftShape, greebles, t, phi);
  }

  function evalExactAftPoint(shared, aftShape, greebles, seamX, aftSpan, rySeam, rzSeam, t, phi, insetScale) {
    var rNorm = evalExactAftRadius(shared, aftShape, greebles, t, phi) * (insetScale || 1.0);
    var c = Math.cos(phi), s = Math.sin(phi);
    return {
      x: seamX - t * aftSpan,
      y: rySeam * rNorm * c,
      z: rzSeam * rNorm * s,
      ny: c,
      nz: s,
      ry: rySeam * rNorm,
      rz: rzSeam * rNorm
    };
  }

  // Build clean solid architectural Gothic buttress fins curving along the aft cone
  function buildGothicButtresses(T, shared, seamX, aftSpan, rySeam, rzSeam, greebles, matDark, matAccent) {
    var grp = new T.Group();
    grp.name = 'Gothic_Buttresses';
    var nRibs = 8;
    var segs = 12;

    for (var rIdx = 0; rIdx < nRibs; rIdx++) {
      var phi = (rIdx * Math.PI * 2) / nRibs;
      var ribShape = new T.Shape();
      // Start seated inside hull surface so zero gap appears
      var pStart = evalAftPoint(shared, 'gothic-bastion', greebles, seamX, aftSpan, rySeam, rzSeam, 0.06, phi, 0.86);
      ribShape.moveTo(-aftSpan * 0.06, Math.hypot(pStart.y, pStart.z));

      for (var si = 1; si <= segs; si++) {
        var t = 0.06 + (si / segs) * 0.88;
        var pt = evalAftPoint(shared, 'gothic-bastion', greebles, seamX, aftSpan, rySeam, rzSeam, t, phi, 1.0);
        var rBase = Math.hypot(pt.y, pt.z);
        var finH = (0.28 + 0.55 * greebles) * Math.sin((si / segs) * Math.PI);
        ribShape.lineTo(-aftSpan * t, rBase + finH);
      }
      var pEnd = evalAftPoint(shared, 'gothic-bastion', greebles, seamX, aftSpan, rySeam, rzSeam, 0.96, phi, 0.84);
      ribShape.lineTo(-aftSpan * 0.96, Math.hypot(pEnd.y, pEnd.z));
      ribShape.closePath();

      var extGeo = new T.ExtrudeGeometry(ribShape, { depth: 0.14, bevelEnabled: false });
      extGeo.translate(0, 0, -0.07);
      var ribMesh = new T.Mesh(extGeo, rIdx % 2 === 0 ? matDark : matAccent);
      // Local shape x = axial -X, local shape y = radial outward +Y -> rotate around X by phi
      var holder = new T.Group();
      holder.rotation.x = phi;
      ribMesh.position.x = seamX;
      holder.add(ribMesh);
      grp.add(holder);
    }

    // Terraced cathedral armor collar rings
    [0.24, 0.48, 0.72, 0.90].forEach(function (tRing) {
      var rNorm = evalAftRadius(shared, 'gothic-bastion', greebles, tRing, 0);
      var ringGeo = new T.TorusGeometry(1.0, 0.045, 8, 36);
      var ring = new T.Mesh(ringGeo, matDark);
      ring.rotation.y = Math.PI * 0.5;
      // TorusGeometry in XY plane rotated by Y=90 lies in YZ plane; scale X->Z, Y->Y
      ring.scale.set(rzSeam * rNorm * 1.04, rySeam * rNorm * 1.04, 1);
      ring.position.x = seamX - tRing * aftSpan;
      grp.add(ring);
    });

    return grp;
  }

  // Canonical angular helpers (evalAftPoint convention: phi = 0 is +Y dorsal, PI/2 is +Z starboard)
  function wrapAngleRad(a) {
    var TWO_PI = Math.PI * 2;
    var r = ((a + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
    return r;
  }

  function angDistRad(a, b) {
    return Math.abs(wrapAngleRad(a - b));
  }

  function computeArchAngles(P) {
    var rollAngles =
      P.arch === 'twin-v' ? [-Math.PI / 2, Math.PI / 2] :
      P.arch === 'tri' ? [0, (2 * Math.PI) / 3, -(2 * Math.PI) / 3] :
      P.arch === 'quad' ? [Math.PI / 4, (3 * Math.PI) / 4, -(3 * Math.PI) / 4, -Math.PI / 4] :
      P.arch === 'hex' ? [0, Math.PI / 3, (2 * Math.PI) / 3, Math.PI, -(2 * Math.PI) / 3, -Math.PI / 3] :
      [0, Math.PI];

    var twinBoom = P.aftShape === 'twin-boom';
    var finAngles = [];
    if (P.fins === 2 || P.fins === 4) {
      if (P.arch === 'twin-v') {
        finAngles = P.fins === 2
          ? (twinBoom ? [Math.PI * 0.32, -Math.PI * 0.32] : [Math.PI * 0.5, -Math.PI * 0.5])
          : [Math.PI * 0.25, -Math.PI * 0.25, Math.PI * 0.75, -Math.PI * 0.75];
      } else if (P.arch === 'tri') {
        finAngles = P.fins === 2
          ? [Math.PI / 6, (5 * Math.PI) / 6]
          : [0.16 * Math.PI, 0.84 * Math.PI, -0.34 * Math.PI, -0.66 * Math.PI];
      } else if (P.arch === 'quad') {
        finAngles = P.fins === 2
          ? [0, Math.PI]
          : (twinBoom
            ? [0.10 * Math.PI, -0.10 * Math.PI, 0.90 * Math.PI, -0.90 * Math.PI]
            : [0, Math.PI * 0.5, Math.PI, -Math.PI * 0.5]);
      } else if (P.arch === 'hex') {
        finAngles = P.fins === 2
          ? [0, Math.PI]
          : [Math.PI / 3, (2 * Math.PI) / 3, -(2 * Math.PI) / 3, -Math.PI / 3];
      } else {
        finAngles = P.fins === 2
          ? [0, Math.PI]
          : [Math.PI * 0.22, -Math.PI * 0.22, Math.PI * 0.78, -Math.PI * 0.78];
      }
    }
    return { rollAngles: rollAngles, finAngles: finAngles };
  }

  function makeKeepoutHelper(zones) {
    zones = zones || [];
    function isBlocked(phi, t, extraRad) {
      var pad = extraRad || 0;
      for (var i = 0; i < zones.length; i++) {
        var z = zones[i];
        if (t >= z.tMin && t <= z.tMax && angDistRad(phi, z.phi) < (z.hw + pad)) {
          return true;
        }
      }
      return false;
    }
    function pickClearPhi(preferredPhi, t, extraRad) {
      if (!isBlocked(preferredPhi, t, extraRad)) return preferredPhi;
      for (var step = 1; step <= 18; step++) {
        var delta = step * 0.17;
        if (!isBlocked(preferredPhi + delta, t, extraRad)) return wrapAngleRad(preferredPhi + delta);
        if (!isBlocked(preferredPhi - delta, t, extraRad)) return wrapAngleRad(preferredPhi - delta);
      }
      return preferredPhi;
    }
    return { isBlocked: isBlocked, pickClearPhi: pickClearPhi };
  }

  // Helper to place oriented box/cylinder instances along hull normals without heap bloat
  function setSurfaceMatrix(T, m4, posVec, nrmVec, sx, sy, sz, qTmp, upVec, scaleVec) {
    qTmp.setFromUnitVectors(upVec, nrmVec);
    scaleVec.set(sx, sy, sz);
    m4.compose(posVec, qTmp, scaleVec);
  }

  // Hull surface sampling + oriented instance placement helpers, shared by the stock greebles and the
  // style kits (window.LighthuggerStyleKits). commitInstances(geo, mat, matrices, parent?) adds an
  // InstancedMesh to `parent` (default targetGroup) and returns it (null when no instances).
  function makeSurfaceHelpers(T, shared, P, seamX, aftSpan, fwdSpan, rySeam, rzSeam, isTwinRam, targetGroup) {
    var gAmt = P.greebles;

    function evalForePoint(u, phi, insetScale) {
      var rNorm = evalHullRadius(shared, P.hullShape, P.hullCurve, u, phi) * (insetScale || 1.0);
      var c = Math.cos(phi), s = Math.sin(phi);
      return {
        x: seamX + u * fwdSpan,
        y: rySeam * rNorm * c,
        z: rzSeam * rNorm * s,
        ny: c,
        nz: s
      };
    }

    function evalAftSurf(t, phi, insetScale) {
      if (isTwinRam) {
        var c = Math.cos(phi), s = Math.sin(phi);
        var tipClose = t > 0.86 ? (1.0 - Math.pow((t - 0.86) / 0.14, 1.5) * 0.96) : 1.0;
        var rNormT = evalHullRadius(shared, P.hullShape, P.hullCurve, t, phi) * 0.98 * tipClose * (insetScale || 1.0);
        return {
          x: seamX - t * aftSpan,
          y: rySeam * rNormT * c,
          z: rzSeam * rNormT * s,
          ny: c,
          nz: s
        };
      }
      return evalExactAftPoint(shared, P.aftShape, gAmt, seamX, aftSpan, rySeam, rzSeam, t, phi, insetScale);
    }

    // Compute exact surface tangent along ship axial +X and outward normal at (side, param, phi)
    function evalSurfaceFrame(isFore, param, phi, insetScale) {
      var pt = isFore ? evalForePoint(param, phi, insetScale) : evalAftSurf(param, phi, insetScale);
      var eps = 0.018;
      var pFore = isFore
        ? evalForePoint(clamp(param + eps, 0, 1), phi, insetScale)
        : evalAftSurf(clamp(param - eps, 0, 1), phi, insetScale);
      var pAft = isFore
        ? evalForePoint(clamp(param - eps, 0, 1), phi, insetScale)
        : evalAftSurf(clamp(param + eps, 0, 1), phi, insetScale);
      var tanVec = new T.Vector3(pFore.x - pAft.x, pFore.y - pAft.y, pFore.z - pAft.z);
      if (tanVec.lengthSq() < 1e-8) tanVec.set(1, 0, 0);
      else tanVec.normalize();
      var radApprox = new T.Vector3(0, pt.ny, pt.nz);
      if (radApprox.lengthSq() < 1e-8) radApprox.set(0, 1, 0);
      else radApprox.normalize();
      var biVec = new T.Vector3().crossVectors(tanVec, radApprox);
      if (biVec.lengthSq() < 1e-8) biVec.set(0, 0, 1);
      else biVec.normalize();
      var nrmOut = new T.Vector3().crossVectors(biVec, tanVec).normalize();
      if (nrmOut.dot(radApprox) < 0) {
        nrmOut.negate();
        biVec.negate();
      }
      return { pt: pt, t: tanVec, n: nrmOut, b: biVec };
    }

    var pTmp = new T.Vector3();
    var sTmp = new T.Vector3();
    var m4 = new T.Matrix4();
    var mRot = new T.Matrix4();
    var qFrame = new T.Quaternion();

    function pushFramed(list, frame, lengthX, heightY, widthZ, liftN, offT, offB) {
      var px = frame.pt.x + frame.n.x * (liftN || 0) + frame.t.x * (offT || 0) + frame.b.x * (offB || 0);
      var py = frame.pt.y + frame.n.y * (liftN || 0) + frame.t.y * (offT || 0) + frame.b.y * (offB || 0);
      var pz = frame.pt.z + frame.n.z * (liftN || 0) + frame.t.z * (offT || 0) + frame.b.z * (offB || 0);
      pTmp.set(px, py, pz);
      mRot.makeBasis(frame.t, frame.n, frame.b);
      qFrame.setFromRotationMatrix(mRot);
      sTmp.set(lengthX, heightY, widthZ);
      m4.compose(pTmp, qFrame, sTmp);
      list.push(m4.clone());
    }

    function pushCustomRot(list, frame, lengthX, heightY, widthZ, liftN, offT, offB, tiltT, tiltB) {
      var px = frame.pt.x + frame.n.x * (liftN || 0) + frame.t.x * (offT || 0) + frame.b.x * (offB || 0);
      var py = frame.pt.y + frame.n.y * (liftN || 0) + frame.t.y * (offT || 0) + frame.b.y * (offB || 0);
      var pz = frame.pt.z + frame.n.z * (liftN || 0) + frame.t.z * (offT || 0) + frame.b.z * (offB || 0);
      pTmp.set(px, py, pz);
      var nLoc = frame.n.clone().addScaledVector(frame.t, tiltT || 0).addScaledVector(frame.b, tiltB || 0).normalize();
      var bLoc = new T.Vector3().crossVectors(frame.t, nLoc).normalize();
      var tLoc = new T.Vector3().crossVectors(nLoc, bLoc).normalize();
      mRot.makeBasis(tLoc, nLoc, bLoc);
      qFrame.setFromRotationMatrix(mRot);
      sTmp.set(lengthX, heightY, widthZ);
      m4.compose(pTmp, qFrame, sTmp);
      list.push(m4.clone());
    }

    var negNTmp = new T.Vector3();
    function pushAxialPipe(list, frame, radius, lengthX, liftN, offT, offB) {
      var px = frame.pt.x + frame.n.x * (liftN || 0) + frame.t.x * (offT || 0) + frame.b.x * (offB || 0);
      var py = frame.pt.y + frame.n.y * (liftN || 0) + frame.t.y * (offT || 0) + frame.b.y * (offB || 0);
      var pz = frame.pt.z + frame.n.z * (liftN || 0) + frame.t.z * (offT || 0) + frame.b.z * (offB || 0);
      pTmp.set(px, py, pz);
      // Right-handed basis (det = +1) mapping local +Y (CylinderGeometry axis) to axial frame.t
      negNTmp.copy(frame.n).negate();
      mRot.makeBasis(negNTmp, frame.t, frame.b);
      qFrame.setFromRotationMatrix(mRot);
      sTmp.set(radius, lengthX, radius);
      m4.compose(pTmp, qFrame, sTmp);
      list.push(m4.clone());
    }

    function commitInstances(geo, mat, matrices, parent) {
      if (!matrices || !matrices.length) {
        geo.dispose();
        return null;
      }
      var im = new T.InstancedMesh(geo, mat, matrices.length);
      for (var i = 0; i < matrices.length; i++) {
        im.setMatrixAt(i, matrices[i]);
      }
      im.instanceMatrix.needsUpdate = true;
      (parent || targetGroup).add(im);
      return im;
    }

    return {
      evalForePoint: evalForePoint,
      evalAftSurf: evalAftSurf,
      evalSurfaceFrame: evalSurfaceFrame,
      pushFramed: pushFramed,
      pushCustomRot: pushCustomRot,
      pushAxialPipe: pushAxialPipe,
      commitInstances: commitInstances
    };
  }

  // Build inspired kilometer-scale (2-5 km vessel) Revelation Space micro-architecture using GPU InstancedMesh
  function buildHullGreebles(T, shared, P, rng, seamX, aftSpan, fwdSpan, rySeam, rzSeam, mats, keepout, optsG) {
    var grp = new T.Group();
    grp.name = 'Hull_Greebles';
    var gAmt = P.greebles;
    if (gAmt < 0.05) return grp;
    keepout = keepout || makeKeepoutHelper([]);
    optsG = optsG || {};
    var foreLimit = optsG.foreLimit || 0;
    var aftLimit = optsG.aftLimit != null ? optsG.aftLimit : 0.86;
    var aftMin = optsG.aftMin != null ? optsG.aftMin : 0.07;
    var foreMin = optsG.foreMin != null ? optsG.foreMin : 0.04;
    var evalForeBareEnd = optsG.evalForeBareEnd || function () { return foreLimit; };
    var evalAftBareEnd = optsG.evalAftBareEnd || function () { return aftLimit; };
    var foreRingLimit = optsG.foreRingLimit != null ? optsG.foreRingLimit : foreLimit;
    var aftRingLimit = optsG.aftRingLimit != null ? optsG.aftRingLimit : aftLimit;
    var doAft = aftLimit > aftMin + 0.06;
    var doFore = foreLimit > foreMin + 0.06;
    var detailScale = optsG.detailScale != null ? optsG.detailScale : 1.0;
    var isTwinRamG = !!optsG.isTwinRam;
    var styleKey = optsG.hullStyleKey || 'ogive';
    var isGothicG = styleKey === 'gothic';
    var isHeavyG = styleKey === 'heavy';
    var isFacetG = styleKey === 'faceted';

    var trimMat = mats.trim || mats.hull;
    var cryoMat = mats.cryo || trimMat;
    var obsMat = mats.obsidian || mats.dark;

    var surf = makeSurfaceHelpers(T, shared, P, seamX, aftSpan, fwdSpan, rySeam, rzSeam, isTwinRamG, grp);
    var evalSurfaceFrame = surf.evalSurfaceFrame;
    var pushFramed = surf.pushFramed;
    var pushCustomRot = surf.pushCustomRot;
    var pushAxialPipe = surf.pushAxialPipe;
    var commitInstances = surf.commitInstances;

    var darkBoxes = [];
    var trimBoxes = [];
    var hullBoxes = [];
    var amberLit = [];
    var cyanLit = [];
    var radVanes = [];
    var cryoSpheres = [];
    var cryoPipes = [];
    var dishCones = [];
    var mastSpireMats = [];

    function evalAftRibRad(tR, phiR) {
      if (isTwinRamG) {
        var tipC = tR > 0.86 ? (1.0 - Math.pow((tR - 0.86) / 0.14, 1.5) * 0.96) : 1.0;
        return evalHullRadius(shared, P.hullShape, P.hullCurve, tR, phiR) * 0.98 * tipC;
      }
      return evalExactAftRadius(shared, P.aftShape, gAmt, tR, phiR);
    }

    // 1. Monumental Titanium Exoskeleton Bulkhead Ribs & Notched Anchor Lugs
    if (aftRingLimit > aftMin + 0.06) {
      var nRibs = Math.max(2, Math.round((4 + gAmt * 7) * clamp((aftRingLimit - aftMin) / 0.72, 0.25, 1.0) * detailScale));
      for (var ri = 0; ri < nRibs; ri++) {
        var tRib = lerp(aftMin + 0.02, Math.min(0.84, aftRingLimit), ri / Math.max(1, nRibs - 1));
        var rNormY = evalAftRibRad(tRib, 0);
        var rNormZ = evalAftRibRad(tRib, Math.PI * 0.5);
        var ribRing = new T.Mesh(new T.TorusGeometry(1.0, (0.024 + 0.015 * gAmt) * (isHeavyG ? 1.25 : 1.0), 8, 48), trimMat);
        ribRing.scale.set(rzSeam * rNormZ * 1.006, rySeam * rNormY * 1.006, 1);
        ribRing.rotation.y = Math.PI * 0.5;
        ribRing.position.x = seamX - tRib * aftSpan;
        grp.add(ribRing);

        if (detailScale > 0.5) {
          for (var li = 0; li < 4; li++) {
            var phiLug = keepout.pickClearPhi(li * Math.PI * 0.5 + (isGothicG ? Math.PI * 0.125 : 0), tRib, 0.09);
            if (keepout.isBlocked(phiLug, tRib, 0.05) || tRib > evalAftBareEnd(phiLug)) continue;
            var frLug = evalSurfaceFrame(false, tRib, phiLug, 0.996);
            // Flush axial structural rib clamp gussets (low-profile, never poky)
            pushFramed(darkBoxes, frLug, 0.42, 0.055, 0.24, 0.025, 0, 0);
            pushFramed(trimBoxes, frLug, 0.34, 0.072, 0.16, 0.042, 0, 0);
            if ((ri + li) % 3 === 0) {
              pushFramed(cyanLit, frLug, 0.065, 0.022, 0.045, 0.072, 0, 0);
            }
          }
        }
      }
    }
    if (foreRingLimit > foreMin + 0.06) {
      var nFwdRibs = Math.max(2, Math.round((foreRingLimit - foreMin) * (6 + gAmt * 6) * detailScale));
      for (var fr = 0; fr < nFwdRibs; fr++) {
        var uRib = lerp(foreMin + 0.02, foreRingLimit - 0.02, fr / Math.max(1, nFwdRibs - 1));
        var frY = evalHullRadius(shared, P.hullShape, P.hullCurve, uRib, 0);
        var frZ = evalHullRadius(shared, P.hullShape, P.hullCurve, uRib, Math.PI * 0.5);
        var fRing = new T.Mesh(new T.TorusGeometry(1.0, 0.022 + 0.012 * gAmt, 8, 48), trimMat);
        fRing.scale.set(rzSeam * frZ * 1.004, rySeam * frY * 1.004, 1);
        fRing.rotation.y = Math.PI * 0.5;
        fRing.position.x = seamX + uRib * fwdSpan;
        grp.add(fRing);
      }
    }

    // 2. Contour-Hugging Dorsal/Ventral Superstructure Viaducts, Cryo Mains & Archetype Buttresses
    function addSpineRun(isFore, paramStart, paramEnd, rawPhi, nSegs, scaleW, primaryAxis) {
      var midP = 0.5 * (paramStart + paramEnd);
      var phiMid = keepout.pickClearPhi(rawPhi, midP, 0.12);
      if (!isFore && keepout.isBlocked(phiMid, midP, 0.06)) return;
      var maxAtPhi = Math.min(paramEnd, (isFore ? evalForeBareEnd(phiMid) : evalAftBareEnd(phiMid)) - 0.025);
      if (maxAtPhi <= paramStart + 0.05) return;
      for (var si = 0; si < nSegs; si++) {
        var p0 = lerp(paramStart, maxAtPhi, si / nSegs);
        var p1 = lerp(paramStart, maxAtPhi, (si + 1) / nSegs);
        var pm = 0.5 * (p0 + p1);
        if (!isFore && keepout.isBlocked(phiMid, pm, 0.03)) continue;
        var f0 = evalSurfaceFrame(isFore, p0, phiMid, 0.996);
        var f1 = evalSurfaceFrame(isFore, p1, phiMid, 0.996);
        var fM = evalSurfaceFrame(isFore, pm, phiMid, 0.996);
        var segLen = Math.hypot(f1.pt.x - f0.pt.x, f1.pt.y - f0.pt.y, f1.pt.z - f0.pt.z) * 0.96;
        if (segLen < 0.22) continue;

        // Twin brushed-titanium trench coamings flanking deep recessed obsidian machinery bed
        var railGap = (0.14 + 0.08 * gAmt) * scaleW;
        pushFramed(trimBoxes, fM, segLen, 0.11 * scaleW, 0.075 * scaleW, 0.045 * scaleW, 0, -railGap);
        pushFramed(trimBoxes, fM, segLen, 0.11 * scaleW, 0.075 * scaleW, 0.045 * scaleW, 0, railGap);
        pushFramed(darkBoxes, fM, segLen * 0.98, 0.062 * scaleW, railGap * 1.75, 0.020 * scaleW, 0, 0);

        // Twin cylindrical cryo-coolant feed pipelines + flanged clamp saddles bridging bulkhead bay
        if (detailScale > 0.45) {
          pushAxialPipe(cryoPipes, fM, 0.030 * scaleW, segLen * 0.98, 0.072 * scaleW, 0, -0.046 * scaleW);
          pushAxialPipe(cryoPipes, fM, 0.030 * scaleW, segLen * 0.98, 0.072 * scaleW, 0, 0.046 * scaleW);
          pushFramed(darkBoxes, fM, 0.055 * scaleW, 0.095 * scaleW, railGap * 1.38, 0.068 * scaleW, segLen * 0.28, 0);
          pushFramed(darkBoxes, fM, 0.055 * scaleW, 0.095 * scaleW, railGap * 1.38, 0.068 * scaleW, -segLen * 0.28, 0);
        }

        // Cross-girders, gothic vaulted flying ribs, stealth chines, or foundry bunkers
        if (isGothicG && primaryAxis) {
          pushCustomRot(trimBoxes, fM, 0.11 * scaleW, 0.36 * scaleW, 0.068 * scaleW, 0.15 * scaleW, 0, -railGap * 1.15, 0, -0.45);
          pushCustomRot(trimBoxes, fM, 0.11 * scaleW, 0.36 * scaleW, 0.068 * scaleW, 0.15 * scaleW, 0, railGap * 1.15, 0, 0.45);
          pushFramed(amberLit, fM, segLen * 0.42, 0.032 * scaleW, railGap * 0.72, 0.10 * scaleW, 0, 0);
        } else if (isHeavyG && primaryAxis && si % 2 === 0) {
          pushFramed(trimBoxes, fM, segLen * 0.56, 0.16 * scaleW, railGap * 2.15, 0.085 * scaleW, 0, 0);
          pushFramed(darkBoxes, fM, segLen * 0.42, 0.10 * scaleW, railGap * 1.45, 0.15 * scaleW, 0, 0);
        } else if (isFacetG && primaryAxis) {
          pushFramed(trimBoxes, fM, segLen * 0.94, 0.15 * scaleW, 0.095 * scaleW, 0.105 * scaleW, 0, 0);
        } else {
          pushFramed(trimBoxes, fM, 0.090 * scaleW, 0.115 * scaleW, railGap * 2.45, 0.058 * scaleW, 0, 0);
        }

        if (si % 2 === 0 && detailScale > 0.5) {
          pushFramed(cyanLit, fM, 0.068 * scaleW, 0.024 * scaleW, 0.026 * scaleW, 0.082 * scaleW, 0, -railGap);
          pushFramed(cyanLit, fM, 0.068 * scaleW, 0.024 * scaleW, 0.026 * scaleW, 0.082 * scaleW, 0, railGap);
        }
        // Axially aligned conformal sensor rail fin (pointing along hull tangent, never surface-normal)
        if (primaryAxis && si % 3 === 1 && detailScale > 0.55) {
          pushAxialPipe(cryoPipes, fM, 0.020 * scaleW, segLen * 0.62, 0.098 * scaleW, 0, 0);
        }
      }
    }

    var spineAngles = isGothicG
      ? [Math.PI * 0.125, -Math.PI * 0.875, Math.PI * 0.375, -Math.PI * 0.375]
      : (isHeavyG
          ? [0.22, -0.22, 1.18, -1.18]
          : [0, Math.PI, Math.PI * 0.5, -Math.PI * 0.5]);
    var nSpines = gAmt > 0.45 ? 4 : 2;
    for (var spi = 0; spi < nSpines; spi++) {
      var spScale = spi < 2 ? 1.15 : 0.85;
      if (doAft) {
        addSpineRun(false, aftMin, Math.min(0.82, aftLimit), spineAngles[spi], Math.max(2, Math.round(7 * detailScale) + 2), spScale, spi < 2);
      }
      if (doFore) {
        addSpineRun(true, foreMin, foreLimit - 0.02, spineAngles[spi], Math.max(2, Math.round((foreLimit - foreMin) * 9 * detailScale)), spScale, spi < 2);
      }
    }

    // 3. Low-Profile Axially-Streamlined Command Conning Fairings & Sensor Booms (zero tall masts)
    if (detailScale > 0.5 && gAmt >= 0.22) {
      function addBridgeCitadel(isFore, param, phiPref, sc) {
        var phiC = keepout.pickClearPhi(phiPref, param, 0.15);
        if (!isFore && keepout.isBlocked(phiC, param, 0.08)) return;
        var bareEndC = isFore ? evalForeBareEnd(phiC) : evalAftBareEnd(phiC);
        var pMinC = isFore ? foreMin + 0.02 : aftMin + 0.03;
        if (bareEndC < pMinC + 0.08) return;
        param = clamp(param, pMinC + 0.02, bareEndC - 0.04);
        var fr = evalSurfaceFrame(isFore, param, phiC, 0.996);
        var bLen = 1.85 * sc, bWid = 0.56 * sc;
        // Sleek terraced axial blister hugging the hull contour
        pushFramed(trimBoxes, fr, bLen, 0.11 * sc, bWid, 0.045 * sc, 0, 0);
        pushFramed(darkBoxes, fr, bLen * 0.82, 0.10 * sc, bWid * 0.82, 0.11 * sc, -0.04 * sc, 0);
        pushFramed(amberLit, fr, bLen * 0.66, 0.028 * sc, bWid * 0.86, 0.135 * sc, -0.02 * sc, 0);
        pushFramed(trimBoxes, fr, bLen * 0.62, 0.085 * sc, bWid * 0.62, 0.175 * sc, -0.10 * sc, 0);
        pushFramed(cyanLit, fr, bLen * 0.42, 0.024 * sc, bWid * 0.66, 0.195 * sc, -0.08 * sc, 0);
        // Twin axially-swept forward interferometer booms (pointing parallel to hull axis +X)
        pushAxialPipe(cryoPipes, fr, 0.024 * sc, bLen * 0.58, 0.17 * sc, bLen * 0.34, bWid * 0.24);
        pushAxialPipe(cryoPipes, fr, 0.024 * sc, bLen * 0.58, 0.17 * sc, bLen * 0.34, -bWid * 0.24);
      }

      if (doAft && aftLimit > aftMin + 0.10) {
        var aftCitT = clamp(aftMin + (aftLimit - aftMin) * 0.34, aftMin + 0.04, aftLimit - 0.04);
        addBridgeCitadel(false, aftCitT, isGothicG ? 0.38 : 0.0, 0.96 + 0.35 * gAmt);
        if (aftLimit > 0.48) {
          addBridgeCitadel(false, Math.min(0.54, aftLimit * 0.78), isGothicG ? -2.76 : Math.PI, 0.82 + 0.28 * gAmt);
        }
      }
      if (doFore && foreLimit > foreMin + 0.10) {
        addBridgeCitadel(true, clamp(foreMin + (foreLimit - foreMin) * 0.42, foreMin + 0.03, foreLimit - 0.03), 0.0, 0.94 + 0.34 * gAmt);
        if (foreLimit > 0.52) {
          addBridgeCitadel(true, clamp(foreLimit * 0.76, 0.28, 0.64), Math.PI, 0.76 + 0.24 * gAmt);
        }
      }
    }

    // 4. Spaceframe Truss Cradles & Frosted Cryo-Dewar Sphere Tank Farms
    function addCryoSphereBay(isFore, param, rawPhi, bayScale) {
      var phiB = keepout.pickClearPhi(rawPhi, param, 0.14);
      if (!isFore && keepout.isBlocked(phiB, param, 0.07)) return;
      var bareEndB = isFore ? evalForeBareEnd(phiB) : evalAftBareEnd(phiB);
      var pMinB = isFore ? foreMin + 0.02 : aftMin + 0.03;
      if (bareEndB < pMinB + 0.07) return;
      param = clamp(param, pMinB + 0.02, bareEndB - 0.035);
      var fr = evalSurfaceFrame(isFore, param, phiB, 0.996);
      pushFramed(darkBoxes, fr, 1.24 * bayScale, 0.06 * bayScale, 0.64 * bayScale, 0.015 * bayScale, 0, 0);
      [-0.50, 0, 0.50].forEach(function (ox) {
        pushFramed(trimBoxes, fr, 0.055 * bayScale, 0.24 * bayScale, 0.60 * bayScale, 0.12 * bayScale, ox * bayScale, 0);
      });
      [-0.27, 0.27].forEach(function (oz) {
        pushFramed(trimBoxes, fr, 1.16 * bayScale, 0.042 * bayScale, 0.042 * bayScale, 0.23 * bayScale, 0, oz * bayScale);
      });
      var rSp = 0.114 * bayScale;
      for (var ix = -1; ix <= 1; ix++) {
        for (var iz = -1; iz <= 1; iz += 2) {
          pushFramed(cryoSpheres, fr, rSp, rSp, rSp, 0.128 * bayScale, ix * 0.30 * bayScale, iz * 0.135 * bayScale);
        }
      }
      pushAxialPipe(cryoPipes, fr, 0.036 * bayScale, 1.20 * bayScale, 0.22 * bayScale, 0, 0);
    }

    if (doAft && aftLimit > aftMin + 0.12) {
      var cryoPhis = isHeavyG ? [0.24, -0.24, 1.18, -1.18] : [0.46, -0.46, 2.52, -2.52];
      var nCryo = gAmt > 0.45 ? 4 : 2;
      for (var ci = 0; ci < nCryo; ci++) {
        var tCryo = clamp(aftMin + 0.08 + (ci % 2) * 0.16, aftMin + 0.05, aftLimit - 0.05);
        if (tCryo < aftLimit - 0.04) addCryoSphereBay(false, tCryo, cryoPhis[ci], 1.04);
      }
    }
    if (doFore && foreLimit > foreMin + 0.12) {
      var uCryo = clamp(foreMin + (foreLimit - foreMin) * 0.50, foreMin + 0.04, foreLimit - 0.04);
      addCryoSphereBay(true, uCryo, 0.52, 1.00);
      addCryoSphereBay(true, uCryo, -0.52, 1.00);
    }

    // 5. Flush Recessed Launch Bays & Drone/Shuttle Docking Trenches (axially aligned, zero poky vanes)
    function addLaunchBay(isFore, param, rawPhi, bayScale) {
      var phiR = keepout.pickClearPhi(rawPhi, param, 0.13);
      if (!isFore && keepout.isBlocked(phiR, param, 0.07)) return;
      var bareEndR = isFore ? evalForeBareEnd(phiR) : evalAftBareEnd(phiR);
      var pMinR = isFore ? foreMin + 0.02 : aftMin + 0.03;
      if (bareEndR < pMinR + 0.07) return;
      param = clamp(param, pMinR + 0.02, bareEndR - 0.035);
      var fr = evalSurfaceFrame(isFore, param, phiR, 0.996);
      // Dark recessed armored deck trench framed by flush longitudinal coaming rails & sliding blast doors
      pushFramed(darkBoxes, fr, 1.48 * bayScale, 0.052 * bayScale, 0.62 * bayScale, 0.018 * bayScale, 0, 0);
      pushFramed(trimBoxes, fr, 1.56 * bayScale, 0.082 * bayScale, 0.068 * bayScale, 0.044 * bayScale, 0, -0.29 * bayScale);
      pushFramed(trimBoxes, fr, 1.56 * bayScale, 0.082 * bayScale, 0.068 * bayScale, 0.044 * bayScale, 0, 0.29 * bayScale);
      // Split armored blast-door leaves at both axial ends + recessed magnetic launch catapult rails
      pushFramed(hullBoxes, fr, 0.28 * bayScale, 0.078 * bayScale, 0.56 * bayScale, 0.048 * bayScale, 0.58 * bayScale, 0);
      pushFramed(hullBoxes, fr, 0.28 * bayScale, 0.078 * bayScale, 0.56 * bayScale, 0.048 * bayScale, -0.58 * bayScale, 0);
      pushFramed(amberLit, fr, 0.92 * bayScale, 0.024 * bayScale, 0.036 * bayScale, 0.048 * bayScale, 0, -0.14 * bayScale);
      pushFramed(amberLit, fr, 0.92 * bayScale, 0.024 * bayScale, 0.036 * bayScale, 0.048 * bayScale, 0, 0.14 * bayScale);
      pushFramed(cyanLit, fr, 0.065 * bayScale, 0.032 * bayScale, 0.46 * bayScale, 0.056 * bayScale, 0.42 * bayScale, 0);
      pushFramed(cyanLit, fr, 0.065 * bayScale, 0.032 * bayScale, 0.46 * bayScale, 0.056 * bayScale, -0.42 * bayScale, 0);
    }

    if (doAft && aftLimit > 0.28 && detailScale > 0.5) {
      var radPhis = [1.08, -1.08, 2.06, -2.06];
      var nRad = gAmt > 0.50 ? 4 : 2;
      for (var rdi = 0; rdi < nRad; rdi++) {
        var tRad = clamp(aftMin + 0.12 + (rdi > 1 ? 0.18 : 0), aftMin + 0.06, aftLimit - 0.05);
        if (tRad < aftLimit - 0.04) addLaunchBay(false, tRad, radPhis[rdi], 0.96);
      }
    }
    if (doFore && foreLimit > 0.38 && detailScale > 0.5) {
      var uRad = clamp(foreMin + (foreLimit - foreMin) * 0.62, foreMin + 0.06, foreLimit - 0.04);
      addLaunchBay(true, uRad, 1.12, 0.88);
      addLaunchBay(true, uRad, -1.12, 0.88);
    }

    // 6. Axially-Aligned Low-Profile Weapons Turrets (Twin Railgun Batteries & Optical Laser Turrets)
    if (detailScale > 0.55 && gAmt >= 0.25) {
      var turretSites = [];
      if (doAft && aftLimit > 0.26) {
        var td = clamp(aftLimit - 0.10, aftMin + 0.06, 0.66);
        turretSites.push({ fore: false, p: td, phi: 0.34, kind: 'railgun' });
        turretSites.push({ fore: false, p: td, phi: -0.34, kind: 'railgun' });
        turretSites.push({ fore: false, p: clamp(aftMin + 0.14, aftMin + 0.05, aftLimit - 0.06), phi: Math.PI - 0.42, kind: 'laser' });
        turretSites.push({ fore: false, p: clamp(aftMin + 0.14, aftMin + 0.05, aftLimit - 0.06), phi: -Math.PI + 0.42, kind: 'laser' });
      }
      if (doFore && foreLimit > 0.22) {
        turretSites.push({ fore: true, p: clamp(foreLimit * 0.66, foreMin + 0.04, 0.70), phi: 0.0, kind: 'railgun' });
        turretSites.push({ fore: true, p: clamp(foreLimit * 0.48, foreMin + 0.04, 0.56), phi: 0.92, kind: 'laser' });
      }
      turretSites.forEach(function (ts) {
        var phiD = keepout.pickClearPhi(ts.phi, ts.p, 0.11);
        if (!ts.fore && keepout.isBlocked(phiD, ts.p, 0.05)) return;
        var bareEndD = ts.fore ? evalForeBareEnd(phiD) : evalAftBareEnd(phiD);
        var pMinD = ts.fore ? foreMin + 0.02 : aftMin + 0.03;
        if (bareEndD < pMinD + 0.05) return;
        var pSite = clamp(ts.p, pMinD + 0.01, bareEndD - 0.025);
        var fr = evalSurfaceFrame(ts.fore, pSite, phiD, 0.996);
        var aim = ts.fore ? 1 : -1;
        // Flush armored turret barbette ring seated into the hull
        pushFramed(darkBoxes, fr, 0.48, 0.075, 0.44, 0.032, 0, 0);
        if (ts.kind === 'railgun') {
          // Low-slung twin electromagnetic railgun turret pointing parallel to the hull axis
          pushFramed(trimBoxes, fr, 0.52, 0.11, 0.36, 0.095, -aim * 0.05, 0);
          pushFramed(darkBoxes, fr, 0.34, 0.06, 0.24, 0.155, -aim * 0.12, 0);
          // Twin long parallel rail barrels + glowing cyan accelerator rails along hull tangent
          pushAxialPipe(cryoPipes, fr, 0.026, 0.96, 0.115, aim * 0.46, 0.088);
          pushAxialPipe(cryoPipes, fr, 0.026, 0.96, 0.115, aim * 0.46, -0.088);
          pushFramed(cyanLit, fr, 0.78, 0.018, 0.032, 0.115, aim * 0.44, 0);
          pushFramed(trimBoxes, fr, 0.12, 0.055, 0.24, 0.115, aim * 0.32, 0);
        } else {
          // Low-slung point-defense laser turret: armored faceted optical dome + twin axial beam emitters
          pushFramed(trimBoxes, fr, 0.44, 0.10, 0.40, 0.09, 0, 0);
          pushFramed(cryoSpheres, fr, 0.145, 0.095, 0.145, 0.135, aim * 0.02, 0);
          pushAxialPipe(cryoPipes, fr, 0.024, 0.46, 0.125, aim * 0.24, 0.085);
          pushAxialPipe(cryoPipes, fr, 0.024, 0.46, 0.125, aim * 0.24, -0.085);
          pushFramed(cyanLit, fr, 0.048, 0.042, 0.048, 0.125, aim * 0.47, 0.085);
          pushFramed(cyanLit, fr, 0.048, 0.042, 0.048, 0.125, aim * 0.47, -0.085);
          pushFramed(amberLit, fr, 0.18, 0.024, 0.24, 0.145, -aim * 0.14, 0);
        }
      });
    }

    // 7. Coherent Longitudinal Armor Strake Terraces & Illuminated Crew Hab Galleries
    function addStrakeAndWindowDecks(isFore, pMin, pMax, countBays) {
      for (var bi = 0; bi < countBays; bi++) {
        var rawPhi = ((bi % 16) / 16) * Math.PI * 2 + 0.10 + (rng() - 0.5) * 0.14;
        var pm = lerp(pMin, pMax, (bi + rng() * 0.65) / countBays);
        var phiB = keepout.pickClearPhi(rawPhi, pm, 0.07);
        var bareEndB = (isFore ? evalForeBareEnd(phiB) : evalAftBareEnd(phiB)) - 0.025;
        if (bareEndB <= pMin + 0.02) continue;
        pm = lerp(pMin, Math.min(pMax, bareEndB), (bi + rng() * 0.65) / countBays);
        if (!isFore && keepout.isBlocked(phiB, pm, 0.04)) continue;
        var fr = evalSurfaceFrame(isFore, pm, phiB, 0.994);
        var lenX = 0.56 + rng() * 0.64;
        var widZ = 0.22 + rng() * 0.24;
        var hY = 0.055 + rng() * 0.036;
        pushFramed(bi % 3 === 2 ? hullBoxes : trimBoxes, fr, lenX, hY, widZ, hY * 0.36, 0, 0);
        if (bi % 2 === 0) {
          pushFramed(darkBoxes, fr, lenX * 0.76, hY * 0.95, widZ * 0.62, hY * 1.05, 0, 0);
          pushFramed(trimBoxes, fr, lenX * 0.62, hY * 0.52, widZ * 0.48, hY * 1.55, 0, 0);
        }
        if (bi % 2 === 0 && detailScale > 0.45) {
          var nWins = 4 + Math.floor(rng() * 5);
          var winMatArr = (bi % 4 === 0) ? cyanLit : amberLit;
          var stripW = lenX * 0.78;
          pushFramed(trimBoxes, fr, stripW + 0.10, 0.030, 0.082, hY + 0.054, 0, 0);
          for (var wi = 0; wi < nWins; wi++) {
            var ox = lerp(-stripW * 0.42, stripW * 0.42, wi / Math.max(1, nWins - 1));
            pushFramed(winMatArr, fr, 0.058, 0.026, 0.062, hY + 0.028, ox, 0);
          }
        }
      }
    }

    if (doAft) {
      var aftBays = Math.max(12, Math.round((30 + gAmt * 64) * clamp((aftLimit - aftMin) / 0.80, 0.24, 1.0) * detailScale));
      addStrakeAndWindowDecks(false, aftMin + 0.02, Math.min(0.84, aftLimit - 0.02), aftBays);
    }
    if (doFore) {
      var foreBays = Math.max(10, Math.round((24 + gAmt * 52) * clamp(foreLimit - foreMin, 0.22, 1.0) * detailScale));
      addStrakeAndWindowDecks(true, foreMin + 0.01, foreLimit - 0.02, foreBays);
    }

    commitInstances(new T.BoxGeometry(1, 1, 1), obsMat, darkBoxes);
    commitInstances(new T.BoxGeometry(1, 1, 1), trimMat, trimBoxes);
    commitInstances(new T.BoxGeometry(1, 1, 1), mats.hull, hullBoxes);
    commitInstances(new T.BoxGeometry(1, 1, 1), mats.amberLight, amberLit);
    commitInstances(new T.BoxGeometry(1, 1, 1), mats.cyanGlow, cyanLit);
    commitInstances(new T.BoxGeometry(1, 1, 1), mats.rad || mats.dark, radVanes);
    commitInstances(new T.SphereGeometry(1, 12, 8), cryoMat, cryoSpheres);
    commitInstances(new T.CylinderGeometry(1, 1, 1, 8), cryoMat, cryoPipes);
    commitInstances(new T.CylinderGeometry(1.0, 0.24, 1.0, 14, 1, true), cryoMat, dishCones);
    commitInstances(new T.CylinderGeometry(0.35, 1.0, 1.0, 6), trimMat, mastSpireMats);

    // 8. Seam Bulkhead Clamp Rings locking the Glacier Ice to the Titanium Aft Chassis
    if (gAmt > 0.22) {
      for (var si = 0; si < 2; si++) {
        var xs = seamX + (si === 0 ? 0.34 : -0.82);
        var tRingS = xs < seamX ? clamp((seamX - xs) / aftSpan, 0, 1) : 0;
        var rYScale = xs < seamX ? evalAftRibRad(tRingS, 0) : 0.996;
        var rZScale = xs < seamX ? evalAftRibRad(tRingS, Math.PI * 0.5) : 0.996;
        var ring = new T.Mesh(new T.TorusGeometry(1.0, 0.028, 8, 48), trimMat);
        ring.scale.set(rzSeam * rZScale * 1.006, rySeam * rYScale * 1.006, 1);
        ring.rotation.y = Math.PI * 0.5;
        ring.position.x = xs;
        grp.add(ring);
      }
    }

    return grp;
  }

  // Build Kilometre-Scale Recessed Shuttle Bays, Access Airlocks, & Weapons Casemates
  // Supports aft-hull, equatorial waist citadel, through-ice fore/aft shafts, or combined placement
  function buildShuttlePorts(T, shared, P, seamX, aftSpan, fwdSpan, rySeam, rzSeam, mats, keepout, iceCfg) {
    var grp = new T.Group();
    grp.name = 'Shuttle_Ports';
    // Bay mouths (pos + outward normal) for shuttle traffic, and casemate muzzles for weapon FX.
    // grp sits in rootGroup with an identity transform, so these are rootGroup-local coordinates.
    var portAnchors = [];
    var casemateMuzzles = { rail: [], fel: [], railDirs: [], felDirs: [] };
    grp.userData.portAnchors = portAnchors;
    grp.userData.casemateMuzzles = casemateMuzzles;
    function pushAnchor(kind, pt, nrm, lift) {
      portAnchors.push({
        kind: kind,
        pos: [pt.x + nrm.x * lift, pt.y + nrm.y * lift, pt.z + nrm.z * lift],
        normal: [nrm.x, nrm.y, nrm.z]
      });
    }
    var nPorts = P.shuttlePorts | 0;
    if (nPorts <= 0) return grp;
    keepout = keepout || makeKeepoutHelper([]);
    iceCfg = iceCfg || {};
    var symMode = P.iceSymmetry || 'fore';
    var zone = P.portPlacement || 'aft-hull';
    var iceOn = P.iceCoverage > 0.02;
    var uIceStart = iceCfg.uIceStart != null ? iceCfg.uIceStart : 0.0;
    var aftIceStart = iceCfg.aftStartMin != null ? iceCfg.aftStartMin : 0.04;
    var hasAftIce = symMode === 'bi-cone' || symMode === 'twin-ram';
    var isTwinRam = symMode === 'twin-ram';

    function sampleIceOuterNorm(mesh, isFore, tTarget, phiTarget) {
      if (!mesh || !mesh.geometry || !mesh.geometry.attributes || !mesh.geometry.attributes.position) return null;
      var pos = mesh.geometry.attributes.position.array;
      var span = isFore ? fwdSpan : aftSpan;
      var xTarget = isFore ? (seamX + tTarget * span) : (seamX - tTarget * span);
      var dxTol = Math.max(0.55, span * 0.055);
      var bestR = 0, hits = 0;
      for (var i = 0; i < pos.length; i += 3) {
        if (Math.abs(pos[i] - xTarget) > dxTol) continue;
        var ny = pos[i + 1] / Math.max(0.05, rySeam);
        var nz = pos[i + 2] / Math.max(0.05, rzSeam);
        var dPhi = wrapAngleRad(Math.atan2(nz, ny) - phiTarget);
        if (Math.abs(dPhi) > 0.30) continue;
        var rn = Math.hypot(ny, nz);
        if (rn > bestR) { bestR = rn; hits++; }
      }
      return hits > 0 ? bestR : null;
    }

    // Exact surface point on Fore (+X) or Aft (-X) hull or outer cryo-ice surface at (side, tPos, phi)
    function evalMount(side, tPos, phi) {
      var c = Math.cos(phi), s = Math.sin(phi);
      var tC = clamp(tPos, 0.01, 0.94);
      var rHull;
      if (side === 'fore') {
        rHull = evalHullRadius(shared, P.hullShape, P.hullCurve, tC, phi);
      } else {
        rHull = isTwinRam
          ? evalHullRadius(shared, P.hullShape, P.hullCurve, tC, phi)
          : evalAftRadius(shared, P.aftShape, P.greebles, tC, phi);
      }
      var x = side === 'fore' ? (seamX + tC * fwdSpan) : (seamX - tC * aftSpan);
      var rx = rySeam * rHull;
      var rz = rzSeam * rHull;
      var inIce = iceOn && ((side === 'fore' && tC >= Math.max(0.015, uIceStart + 0.015)) || (side === 'aft' && hasAftIce && tC >= aftIceStart));
      var yOut = rx * c;
      var zOut = rz * s;
      var iceDepth = 0;
      if (inIce) {
        var meshRef = side === 'fore' ? iceCfg.foreMesh : iceCfg.aftMesh;
        var sampledR = sampleIceOuterNorm(meshRef, side === 'fore', tC, phi);
        if (sampledR != null && sampledR > rHull * 0.92) {
          yOut = rySeam * sampledR * c;
          zOut = rzSeam * sampledR * s;
          iceDepth = Math.max(0.28, (sampledR - rHull) * Math.max(rySeam, rzSeam) + 0.38);
        } else {
          var iceExtra = (iceCfg.thickBase || 0.24) * 1.1 + 0.22;
          yOut = (rx + iceExtra) * c;
          zOut = (rz + iceExtra) * s;
          iceDepth = iceExtra + 0.42;
        }
      }
      return {
        x: x,
        y: yOut,
        z: zOut,
        ny: c,
        nz: s,
        nxHint: side === 'fore' ? 0.14 : -0.10,
        iceDepth: iceDepth
      };
    }

    // Tiny streamlined ~18-24m wedge shuttle craft docked inside 120m fleet launch bays
    function makeMiniShuttle(scaleS) {
      var sg = new T.Group();
      var body = new T.Mesh(new T.ConeGeometry(0.058 * scaleS, 0.34 * scaleS, 6), mats.hull);
      body.rotation.z = -Math.PI * 0.5;
      sg.add(body);
      var wing = new T.Mesh(new T.BoxGeometry(0.16 * scaleS, 0.018 * scaleS, 0.22 * scaleS), mats.dark);
      wing.position.x = -0.04 * scaleS;
      sg.add(wing);
      var glow = new T.Mesh(new T.BoxGeometry(0.030 * scaleS, 0.024 * scaleS, 0.065 * scaleS), mats.cyanGlow);
      glow.position.x = -0.16 * scaleS;
      sg.add(glow);
      return sg;
    }

    // Main Multi-Deck Hangar Launch Bay (seats flush on bare metal OR punches armored shaft through ice cone)
    function makeHangarBay(side, tPos, phi, bayW, bayH, bayL, hasShuttle) {
      var pt = evalMount(side, tPos, phi);
      var bay = new T.Group();
      bay.position.set(pt.x, pt.y, pt.z);
      var nrmOut = new T.Vector3(pt.nxHint, pt.ny, pt.nz).normalize();
      bay.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), nrmOut);
      pushAnchor('hangar', pt, nrmOut, 0.22);

      var shaftDepth = Math.max(bayH * 1.85, pt.iceDepth + 0.52);
      var outerFrame = new T.Mesh(new T.BoxGeometry(bayL * 1.08, shaftDepth, bayW * 1.08), mats.dark);
      outerFrame.position.y = -shaftDepth * 0.5 + 0.14;
      bay.add(outerFrame);

      if (pt.iceDepth > 0.05) {
        var iceBaffle = new T.Mesh(new T.BoxGeometry(bayL * 1.24, 0.13, bayW * 1.24), mats.hull);
        iceBaffle.position.y = 0.07;
        bay.add(iceBaffle);
        var thermalTrim = new T.Mesh(new T.BoxGeometry(bayL * 1.18, 0.04, bayW * 1.18), mats.amberLight);
        thermalTrim.position.y = 0.125;
        bay.add(thermalTrim);
      }

      var railL = new T.Mesh(new T.BoxGeometry(bayL * 1.06, 0.11, 0.085), mats.hull);
      railL.position.set(0, 0.16, bayW * 0.48);
      bay.add(railL);
      var railR = railL.clone();
      railR.position.z = -bayW * 0.48;
      bay.add(railR);

      [-0.24, 0, 0.24].forEach(function (rx) {
        var gantry = new T.Mesh(new T.BoxGeometry(0.055, 0.055, bayW * 0.98), mats.hull);
        gantry.position.set(rx * bayL, 0.21, 0);
        bay.add(gantry);
      });

      var deckBase = new T.Mesh(new T.BoxGeometry(bayL * 0.88, 0.04, bayW * 0.76), mats.dark);
      deckBase.position.y = 0.11;
      bay.add(deckBase);

      [-0.16, 0.16].forEach(function (dz) {
        var laneStrip = new T.Mesh(new T.BoxGeometry(bayL * 0.80, 0.032, 0.038), mats.amberLight);
        laneStrip.position.set(0, 0.132, dz * bayW);
        bay.add(laneStrip);
      });

      [-1, 1].forEach(function (endSign) {
        var door = new T.Mesh(new T.BoxGeometry(bayL * 0.19, 0.13, bayW * 0.94), mats.hull);
        door.position.set(endSign * bayL * 0.40, 0.16, 0);
        bay.add(door);

        var navStrobe = new T.Mesh(new T.BoxGeometry(0.075, 0.065, bayW * 0.84), mats.cyanGlow);
        navStrobe.position.set(endSign * bayL * 0.28, 0.175, 0);
        bay.add(navStrobe);
      });

      if (hasShuttle) {
        var s1 = makeMiniShuttle(1.05);
        s1.position.set(0.16, 0.18, 0.10);
        bay.add(s1);
        var s2 = makeMiniShuttle(0.84);
        s2.position.set(-0.28, 0.175, -0.11);
        s2.rotation.y = 0.22;
        bay.add(s2);
      }

      return bay;
    }

    // Circular Pressurized Access Airlock & Cutter Docking Shaft
    function makeCircularDockPort(side, tPos, phi, rad) {
      var pt = evalMount(side, tPos, phi);
      var port = new T.Group();
      port.position.set(pt.x, pt.y, pt.z);
      var nrmOut = new T.Vector3(pt.nxHint * 0.7, pt.ny, pt.nz).normalize();
      port.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), nrmOut);
      pushAnchor('dock', pt, nrmOut, 0.20);

      var shaftH = Math.max(0.30, pt.iceDepth + 0.46);
      var sleeve = new T.Mesh(new T.CylinderGeometry(rad * 1.15, rad * 1.38, shaftH, 16), mats.dark);
      sleeve.position.y = -shaftH * 0.5 + 0.14;
      port.add(sleeve);

      if (pt.iceDepth > 0.05) {
        var iceBumper = new T.Mesh(new T.CylinderGeometry(rad * 1.32, rad * 1.48, 0.10, 16), mats.hull);
        iceBumper.position.y = 0.07;
        port.add(iceBumper);
      }

      var collar = new T.Mesh(new T.TorusGeometry(rad * 1.06, 0.058, 8, 24), mats.hull);
      collar.rotation.x = Math.PI * 0.5;
      collar.position.y = 0.15;
      port.add(collar);

      var sealGlow = new T.Mesh(new T.CylinderGeometry(rad * 0.76, rad * 0.76, 0.04, 16), mats.amberLight);
      sealGlow.position.y = 0.145;
      port.add(sealGlow);

      var lockBeacon = new T.Mesh(new T.TorusGeometry(rad * 0.52, 0.032, 6, 16), mats.cyanGlow);
      lockBeacon.rotation.x = Math.PI * 0.5;
      lockBeacon.position.y = 0.17;
      port.add(lockBeacon);

      return port;
    }

    // Low-Profile Armored Weapons Turret: Axial Twin-Railgun Battery & Point-Defense Laser Dome
    var weaponSeq = 0;
    function makeWeaponsPort(side, tPos, phi, scaleW) {
      var pt = evalMount(side, tPos, phi);
      var s = (scaleW || 1.0) * 1.12;
      var isLaser = (weaponSeq++ % 2) === 1;
      var wpn = new T.Group();
      wpn.position.set(pt.x, pt.y, pt.z);
      var nrmOut = new T.Vector3(pt.nxHint * 0.8, pt.ny, pt.nz).normalize();
      wpn.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), nrmOut);

      var shaftH = Math.max(0.28, pt.iceDepth + 0.42);
      var barbette = new T.Mesh(new T.CylinderGeometry(0.36 * s, 0.44 * s, shaftH, 10), mats.dark);
      barbette.position.y = -shaftH * 0.5 + 0.09;
      wpn.add(barbette);

      var shroudRing = new T.Mesh(new T.CylinderGeometry(0.40 * s, 0.46 * s, 0.075 * s, 10), mats.hull);
      shroudRing.position.y = 0.09;
      wpn.add(shroudRing);

      if (pt.iceDepth > 0.05) {
        var rim = new T.Mesh(new T.TorusGeometry(0.42 * s, 0.030 * s, 6, 16), mats.amberLight);
        rim.rotation.x = Math.PI * 0.5;
        rim.position.y = 0.08;
        wpn.add(rim);
      }

      var aimDirX = side === 'fore' ? 1 : -1;
      if (isLaser) {
        // Sleek low-profile laser emitter turret (faceted armored dome + twin axial beam lenses)
        var dome = new T.Mesh(new T.SphereGeometry(0.24 * s, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), mats.hull);
        dome.scale.set(1.25, 0.72, 1.05);
        dome.position.y = 0.11;
        wpn.add(dome);
        [-0.095 * s, 0.095 * s].forEach(function (bz) {
          var shroud = new T.Mesh(new T.CylinderGeometry(0.038 * s, 0.048 * s, 0.42 * s, 8), mats.dark);
          shroud.rotation.z = -aimDirX * Math.PI * 0.49;
          shroud.position.set(aimDirX * 0.28 * s, 0.16 * s, bz);
          wpn.add(shroud);
          var lens = new T.Mesh(new T.CylinderGeometry(0.034 * s, 0.034 * s, 0.05 * s, 10), mats.cyanGlow);
          lens.rotation.z = -aimDirX * Math.PI * 0.49;
          lens.position.set(aimDirX * 0.50 * s, 0.17 * s, bz);
          wpn.add(lens);
        });
      } else {
        // Low-profile axial twin-railgun battery (long parallel electromagnetic rails lying along hull)
        var turret = new T.Mesh(new T.BoxGeometry(0.56 * s, 0.13 * s, 0.38 * s), mats.hull);
        turret.position.set(-aimDirX * 0.05 * s, 0.155, 0);
        wpn.add(turret);
        [-0.105 * s, 0.105 * s].forEach(function (bz) {
          var barrel = new T.Mesh(new T.CylinderGeometry(0.030 * s, 0.038 * s, 0.92 * s, 8), mats.dark);
          barrel.rotation.z = -aimDirX * Math.PI * 0.485;
          barrel.position.set(aimDirX * 0.52 * s, 0.175 * s, bz);
          wpn.add(barrel);
          var muzzle = new T.Mesh(new T.CylinderGeometry(0.028 * s, 0.028 * s, 0.06 * s, 8), mats.cyanGlow);
          muzzle.rotation.z = -aimDirX * Math.PI * 0.485;
          muzzle.position.set(aimDirX * 0.98 * s, 0.195 * s, bz);
          wpn.add(muzzle);
        });
        // Central glowing electromagnetic rail accelerator core between twin barrels
        var coil = new T.Mesh(new T.BoxGeometry(0.76 * s, 0.024 * s, 0.06 * s), mats.cyanGlow);
        coil.position.set(aimDirX * 0.48 * s, 0.175 * s, 0);
        wpn.add(coil);
      }

      var capSlit = new T.Mesh(new T.BoxGeometry(0.18 * s, 0.032 * s, 0.24 * s), mats.amberLight);
      capSlit.position.set(-aimDirX * 0.12 * s, 0.225, 0);
      wpn.add(capSlit);

      wpn.updateMatrix();
      var muzzleLocal = isLaser ? new T.Vector3(aimDirX * 0.50 * s, 0.17 * s, 0) : new T.Vector3(aimDirX * 0.98 * s, 0.195 * s, 0);
      var muzzleW = muzzleLocal.applyMatrix4(wpn.matrix);
      var aimW = new T.Vector3(aimDirX, 0, 0).applyQuaternion(wpn.quaternion).normalize();
      casemateMuzzles[isLaser ? 'fel' : 'rail'].push([muzzleW.x, muzzleW.y, muzzleW.z]);
      casemateMuzzles[isLaser ? 'felDirs' : 'railDirs'].push([aimW.x, aimW.y, aimW.z]);

      return wpn;
    }

    var waistAftT = clamp((iceCfg.collarW ? (iceCfg.collarW * 0.78) : 1.3) / Math.max(1, aftSpan), 0.05, Math.max(0.06, aftIceStart - 0.025));
    var waistForeT = clamp((iceCfg.collarW ? (iceCfg.collarW * 0.48) : 0.8) / Math.max(1, fwdSpan), 0.025, Math.max(0.03, uIceStart > 0.03 ? uIceStart - 0.015 : 0.04));

    if (zone === 'waist') {
      var wtLatA = keepout.pickClearPhi(Math.PI * 0.46, waistAftT, 0.18);
      var wtLatB = keepout.pickClearPhi(-wtLatA, waistAftT, 0.18);
      if (nPorts >= 2) {
        grp.add(makeHangarBay('aft', waistAftT, wtLatA, 0.76, 0.26, 1.82, true));
        grp.add(makeHangarBay('aft', waistAftT, wtLatB, 0.76, 0.26, 1.82, false));
      }
      if (nPorts >= 4) {
        var wtDorA = keepout.pickClearPhi(0.08, waistForeT, 0.14);
        var wtDorB = keepout.pickClearPhi(Math.PI + 0.08, waistAftT, 0.14);
        grp.add(makeCircularDockPort('fore', waistForeT, wtDorA, 0.35));
        grp.add(makeWeaponsPort('aft', waistAftT + 0.015, wtDorB, 1.20));
      }
      if (nPorts >= 6) {
        var wpPhiA = keepout.pickClearPhi(2.15, waistForeT, 0.14);
        var wpPhiB = keepout.pickClearPhi(-2.15, waistAftT, 0.14);
        grp.add(makeWeaponsPort('fore', waistForeT + 0.01, wpPhiA, 1.15));
        grp.add(makeCircularDockPort('aft', waistAftT + 0.02, wpPhiB, 0.33));
      }
    } else if (zone === 'through-ice') {
      if (nPorts >= 2) {
        var fPhi = keepout.pickClearPhi(Math.PI * 0.40, 0.10, 0.12);
        var aPhi = keepout.pickClearPhi(-Math.PI * 0.40, 0.32, 0.16);
        grp.add(makeHangarBay('fore', 0.30, fPhi, 0.82, 0.28, 1.92, true));
        grp.add(makeHangarBay('aft', 0.32, aPhi, 0.82, 0.28, 1.92, false));
      }
      if (nPorts >= 4) {
        var fDor = keepout.pickClearPhi(0.16, 0.10, 0.12);
        var aVen = keepout.pickClearPhi(Math.PI - 0.16, 0.46, 0.14);
        grp.add(makeWeaponsPort('fore', 0.46, fDor, 1.48));
        grp.add(makeWeaponsPort('aft', 0.46, aVen, 1.48));
      }
      if (nPorts >= 6) {
        var fCut = keepout.pickClearPhi(-2.10, 0.12, 0.12);
        var aCut = keepout.pickClearPhi(2.10, 0.44, 0.14);
        grp.add(makeCircularDockPort('fore', 0.40, fCut, 0.38));
        grp.add(makeCircularDockPort('aft', 0.40, aCut, 0.38));
      }
    } else if (zone === 'all-zones') {
      var wzA = keepout.pickClearPhi(Math.PI * 0.48, waistAftT, 0.16);
      var wzB = keepout.pickClearPhi(-wzA, 0.34, 0.16);
      if (nPorts >= 2) {
        grp.add(makeHangarBay('aft', waistAftT, wzA, 0.76, 0.26, 1.78, true));
        grp.add(makeWeaponsPort('fore', 0.34, wzB, 1.44));
      }
      if (nPorts >= 4) {
        grp.add(makeCircularDockPort('fore', waistForeT, keepout.pickClearPhi(0.14, waistForeT, 0.12), 0.35));
        grp.add(makeHangarBay('aft', 0.36, keepout.pickClearPhi(-wzA * 0.7, 0.36, 0.16), 0.72, 0.25, 1.66, false));
      }
      if (nPorts >= 6) {
        grp.add(makeWeaponsPort('aft', 0.48, keepout.pickClearPhi(Math.PI * 0.86, 0.48, 0.14), 1.42));
        grp.add(makeCircularDockPort('fore', 0.44, keepout.pickClearPhi(-Math.PI * 0.82, 0.08, 0.12), 0.36));
      }
    } else {
      // 'aft-hull': canonical aft-cone launch bays, circular cutter ports, + aft defense turret
      var latT = P.aftShape === 'long-patience-aft' ? 0.58 : 0.20;
      var latPref = P.arch === 'twin-h' ? 0.82 : Math.PI * 0.5;
      var latPhiA = keepout.pickClearPhi(latPref, latT, 0.18);
      var latPhiB = keepout.pickClearPhi(-latPhiA, latT, 0.18);
      if (nPorts >= 2) {
        grp.add(makeHangarBay('aft', latT, latPhiA, 0.68, 0.24, 1.72, true));
        grp.add(makeHangarBay('aft', latT, latPhiB, 0.68, 0.24, 1.72, false));
      }
      if (nPorts >= 4) {
        var dorT = P.aftShape === 'long-patience-aft' ? 0.72 : 0.44;
        var dorPhiA = keepout.pickClearPhi(P.arch === 'twin-v' ? 0.68 : 0.42, dorT, 0.14);
        var dorPhiB = keepout.pickClearPhi(dorPhiA - Math.PI, dorT, 0.14);
        grp.add(makeCircularDockPort('aft', dorT, dorPhiA, 0.30));
        grp.add(makeWeaponsPort('aft', dorT, dorPhiB, 1.04));
      }
      if (nPorts >= 6) {
        var aftT = 0.64;
        var aftPhiA = keepout.pickClearPhi(2.26, aftT, 0.16);
        var aftPhiB = keepout.pickClearPhi(-2.26, aftT, 0.16);
        grp.add(makeHangarBay('aft', aftT, aftPhiA, 0.54, 0.20, 1.32, true));
        grp.add(makeWeaponsPort('aft', aftT, aftPhiB, 1.02));
      }
    }

    return grp;
  }

  function hash3N(ix, iy, iz, seed) {
    var n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 1274126177) + Math.imul(seed | 0, 1597334677);
    n = (n ^ (n >>> 13)) | 0;
    n = Math.imul(n, 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }

  function smoothNoise3D(x, y, z, seed) {
    var ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    var fx = x - ix, fy = y - iy, fz = z - iz;
    var ux = fx * fx * (3 - 2 * fx);
    var uy = fy * fy * (3 - 2 * fy);
    var uz = fz * fz * (3 - 2 * fz);
    var n000 = hash3N(ix, iy, iz, seed);
    var n100 = hash3N(ix + 1, iy, iz, seed);
    var n010 = hash3N(ix, iy + 1, iz, seed);
    var n110 = hash3N(ix + 1, iy + 1, iz, seed);
    var n001 = hash3N(ix, iy, iz + 1, seed);
    var n101 = hash3N(ix + 1, iy, iz + 1, seed);
    var n011 = hash3N(ix, iy + 1, iz + 1, seed);
    var n111 = hash3N(ix + 1, iy + 1, iz + 1, seed);
    var nx00 = lerp(n000, n100, ux), nx10 = lerp(n010, n110, ux);
    var nx01 = lerp(n001, n101, ux), nx11 = lerp(n011, n111, ux);
    return lerp(lerp(nx00, nx10, uy), lerp(nx01, nx11, uy), uz);
  }

  function fbm3D(x, y, z, seed) {
    var sum = 0, amp = 0.55, freq = 1.0, norm = 0;
    for (var o = 0; o < 3; o++) {
      sum += amp * (smoothNoise3D(x * freq, y * freq, z * freq, seed + o * 97) * 2 - 1);
      norm += amp;
      amp *= 0.5;
      freq *= 2.07;
    }
    return sum / norm;
  }

  function makeCraterField(rng, count) {
    var list = [];
    for (var i = 0; i < count; i++) {
      var uC = 0.14 + rng() * 0.72;
      var rU = 0.036 + rng() * 0.056;
      var stretch = 1.0 / Math.max(0.28, 1.0 - uC * 0.72);
      list.push({
        u: uC,
        phi: rng() * Math.PI * 2,
        rU: rU,
        rPhi: clamp((0.20 + rng() * 0.30) * Math.min(1.65, Math.sqrt(stretch)), 0.18, 0.72),
        depth: 0.14 + rng() * 0.14,
        rim: 0.11 + rng() * 0.12
      });
    }
    return list;
  }

  function evalIceSurfaceRelief(u, phi, sTex, seed, craters) {
    if (sTex <= 0.01) return { disp: 0, shade: 1.0 };
    var cp = Math.cos(phi), sp = Math.sin(phi);
    var macro = fbm3D(u * 4.8, cp * 2.2, sp * 2.2, seed);
    var meso = fbm3D(u * 10.5 + 3.1, cp * 4.4, sp * 4.4, seed + 503);
    var bumpDisp = sTex * (0.20 * macro + 0.08 * meso);
    var craterDisp = 0;
    var shade = 1.0 + sTex * 0.10 * macro;
    for (var i = 0; i < craters.length; i++) {
      var c = craters[i];
      var du = (u - c.u) / c.rU;
      if (Math.abs(du) > 1.5) continue;
      var dPhi = wrapAngleRad(phi - c.phi) / c.rPhi;
      var d = Math.hypot(du, dPhi);
      if (d < 1.45) {
        if (d < 1.0) {
          var bowl = (1 - d * d);
          craterDisp -= sTex * c.depth * bowl;
          shade -= sTex * 0.24 * bowl;
        }
        var rimW = Math.exp(-Math.pow((d - 1.02) / 0.19, 2));
        craterDisp += sTex * c.rim * rimW;
        shade += sTex * 0.14 * rimW;
      }
    }
    return {
      disp: bumpDisp + craterDisp,
      shade: clamp(shade, 0.62, 1.15)
    };
  }

  // -----------------------------------------------------------------------------------------------
  // HULL HARDPOINTS: RCS vernier quad-blocks + coilgun / UV FEL / spinal gamma-lance mounts.
  // Every mount is seated on bare metal (fore shoulder band, waist collar, or aft flank) using the
  // same radius functions that sculpt the hull, on a plinth sunk below the skin so curvature never
  // opens a gap. Each RCS plume cone has its origin at the exact nozzle lip and points out along the
  // bell axis, so a plume cannot render detached from its nozzle.
  // -----------------------------------------------------------------------------------------------
  var RCS_PLUME_VERT =
    'varying vec2 vUv; varying vec3 vN; varying vec3 vV;' +
    'void main(){' +
    '  vUv = uv;' +
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);' +
    '  vN = normalize(normalMatrix * normal);' +
    '  vV = normalize(-mv.xyz);' +
    '  gl_Position = projectionMatrix * mv;' +
    '}';
  // Supersonic cold-plasma vernier jet: white-cyan throat at the lip, Prandtl-Meyer expansion sheath,
  // drifting Mach-node shimmer, smooth axial and Fresnel radial fades (no hard quad edges).
  var RCS_PLUME_FRAG =
    'uniform float uOn; uniform float uTime; uniform float uSeed;' +
    'uniform vec3 uCore; uniform vec3 uEdge;' +
    'varying vec2 vUv; varying vec3 vN; varying vec3 vV;' +
    'void main(){' +
    '  float s = clamp(vUv.y, 0.0, 1.0);' +
    '  float facing = abs(dot(normalize(vN), normalize(vV)));' +
    '  float body = pow(max(facing, 0.0001), 1.35);' +
    '  float core = pow(max(facing, 0.0001), 6.0);' +
    '  float throat = exp(-s * 10.0);' +
    '  float tail = pow(max(1.0 - s, 0.0), 1.7);' +
    '  float lipFade = smoothstep(0.0, 0.025, s);' +
    '  float shock = smoothstep(0.05, 0.16, s) * (1.0 - smoothstep(0.42, 0.75, s));' +
    '  float mach = 0.5 + 0.5 * cos(s * 46.0 - uTime * 31.0 + uSeed * 6.2831);' +
    '  float diamonds = 1.0 + shock * (mach * mach * 0.85 - 0.30);' +
    '  float flick = 0.86 + 0.14 * sin(uTime * 63.0 + uSeed * 17.0) * sin(uTime * 23.0 + uSeed * 5.0);' +
    '  float fan = (1.0 - core) * smoothstep(0.0, 0.3, s) * tail;' +
    '  float a = (body * tail * 0.70 + core * (throat * 1.8 + tail * 0.55) + fan * 0.18) * diamonds * flick * lipFade * uOn;' +
    '  vec3 col = mix(uEdge, uCore, clamp(core * 1.3 + throat * 1.2, 0.0, 1.0));' +
    '  col = mix(col, vec3(1.0), clamp(throat * core * 1.4, 0.0, 1.0));' +
    '  gl_FragColor = vec4(col * a * 3.4, clamp(a, 0.0, 1.0));' +
    '}';

  // c: { shared, P, seamX, fwdSpan, aftSpan, rySeam, rzSeam, isTwinRam, collarW, collarScale, keepout,
  //      evalForeBareEnd, evalAftBareEnd, trackMat, mats: { hull, dark, trim, amberLight } }
  // Mount-local frame: +X axial (toward bow), +Y outward hull normal, +Z = X cross Y.
  function buildHullHardpoints(T, c) {
    var grp = new T.Group();
    grp.name = 'Hull_Hardpoints';
    var rcsGrp = new T.Group();
    rcsGrp.name = 'RCS_Thruster_Pods';
    grp.add(rcsGrp);
    var wpnGrp = new T.Group();
    wpnGrp.name = 'Hull_Weapons';
    grp.add(wpnGrp);

    var surf = makeSurfaceHelpers(T, c.shared, c.P, c.seamX, c.aftSpan, c.fwdSpan, c.rySeam, c.rzSeam, c.isTwinRam, grp);
    var s = clamp(Math.min(c.rySeam, c.rzSeam) * 0.15, 0.22, 0.48);
    var cw = c.collarW;
    var collarA = c.rySeam * c.collarScale;
    var collarB = c.rzSeam * c.collarScale;
    var collarFwdX = c.seamX + cw * 0.35;
    var collarAftX = c.seamX - cw * 0.65;
    var cmX = c.seamX;

    function V(x, y, z) { return new T.Vector3(x, y, z); }
    function arr(v) { return [v.x, v.y, v.z]; }
    function frameFrom(pt, tv, nv) {
      var t = tv.clone().normalize();
      var n = nv.clone().addScaledVector(t, -nv.dot(t)).normalize();
      var b = new T.Vector3().crossVectors(t, n).normalize();
      return { p: V(pt.x, pt.y, pt.z), t: t, n: n, b: b };
    }
    function hullFrame(isFore, param, phi) {
      var f = surf.evalSurfaceFrame(isFore, param, phi);
      return frameFrom(f.pt, f.t, f.n);
    }
    // Waist collar is an elliptic cylinder (collarA, collarB) spanning [collarAftX, collarFwdX].
    function collarFrame(x, phi) {
      var cph = Math.cos(phi), sph = Math.sin(phi);
      var n = V(0, collarB * cph, collarA * sph).normalize();
      return frameFrom({ x: x, y: collarA * cph, z: collarB * sph }, V(1, 0, 0), n);
    }
    function aftRadiusAt(t, phi) {
      var f = surf.evalAftSurf(t, phi);
      return Math.hypot(f.y, f.z);
    }
    function foreStation(phi) {
      var uMin = (cw * 0.35 + s * 0.9) / Math.max(1, c.fwdSpan);
      var uBare = c.evalForeBareEnd(phi) - (s * 0.8) / Math.max(1, c.fwdSpan) - 0.012;
      if (uBare < uMin) return null;
      var u = Math.min(uBare, uMin + 0.04);
      return { frame: hullFrame(true, u, phi), mount: 'fore-hull', phi: phi, param: u };
    }
    function aftStation(phi, tCap) {
      var tMin = (cw * 0.65 + s * 1.0) / Math.max(1, c.aftSpan);
      var tTop = Math.min(tCap, c.evalAftBareEnd(phi) - (s * 0.9) / Math.max(1, c.aftSpan) - 0.015);
      for (var t = tTop; t >= tMin; t -= 0.02) {
        var pad = clamp((s * 0.9) / Math.max(0.4, aftRadiusAt(t, phi)), 0.06, 0.5);
        var ph = c.keepout.pickClearPhi(phi, t, pad);
        if (angDistRad(ph, phi) > 0.95) continue;
        if (c.keepout.isBlocked(ph, t, pad)) continue;
        if (c.evalAftBareEnd(ph) - 0.015 < t) continue;
        return { frame: hullFrame(false, t, ph), mount: 'aft-hull', phi: ph, param: t };
      }
      return null;
    }
    function collarStation(x, phi) {
      return { frame: collarFrame(x, phi), mount: 'collar', phi: phi, param: x };
    }
    function mountMatrix(fr) {
      var m = new T.Matrix4().makeBasis(fr.t, fr.n, fr.b);
      m.setPosition(fr.p);
      return m;
    }

    // Instanced part batches (one draw call per geometry+material pair across every mount)
    var batches = {}, batchOrder = [];
    var tmpM = new T.Matrix4(), tmpS = new T.Vector3();
    function addPart(key, geo, mat, mountM, pos, quat, sx, sy, sz) {
      var bt = batches[key];
      if (!bt) {
        bt = batches[key] = { geo: geo, mat: mat, list: [], rcs: key.indexOf('rcs') === 0 };
        batchOrder.push(key);
      }
      tmpS.set(sx, sy, sz);
      tmpM.compose(pos, quat, tmpS);
      bt.list.push(new T.Matrix4().multiplyMatrices(mountM, tmpM));
    }
    var gBox = new T.BoxGeometry(1, 1, 1);
    var gCyl = new T.CylinderGeometry(1, 1, 1, 14, 1, false);
    var gBell = new T.CylinderGeometry(1, 0.46, 1, 16, 1, true);
    gBell.translate(0, -0.5, 0);
    var gTorus = new T.TorusGeometry(1, 0.16, 8, 22);
    var gDome = new T.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
    var gDisc = new T.CircleGeometry(1, 22);
    gDisc.rotateX(-Math.PI * 0.5);
    var qId = new T.Quaternion();
    var qAxX = new T.Quaternion().setFromAxisAngle(V(0, 0, 1), -Math.PI * 0.5);   // cylinder +Y -> +X
    var qRingX = new T.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI * 0.5);  // torus axis +Z -> +X
    var qRingY = new T.Quaternion().setFromAxisAngle(V(1, 0, 0), Math.PI * 0.5);  // torus axis +Z -> -Y

    var rcsMat = c.trackMat(new T.MeshStandardMaterial({ color: 0x3b4356, metalness: 0.86, roughness: 0.30, emissive: 0x05070c }));
    var bellMat = c.trackMat(new T.MeshStandardMaterial({
      color: 0x26282f, metalness: 0.94, roughness: 0.22, emissive: 0x3b1606, emissiveIntensity: 0.55, side: T.DoubleSide
    }));
    var armorMat = c.mats.hull;
    var darkMat = c.mats.dark;
    var trimMat = c.mats.trim || c.mats.hull;
    var stripMat = c.mats.amberLight || trimMat;
    var coilMat = c.trackMat(new T.MeshBasicMaterial({ color: 0xffb35c }));
    var felMat = c.trackMat(new T.MeshBasicMaterial({ color: 0x5dffd0 }));
    var lanceMat = c.trackMat(new T.MeshBasicMaterial({ color: 0xb48cff }));
    var missileMat = c.trackMat(new T.MeshBasicMaterial({ color: 0xff6840 }));
    var pdcMat = c.trackMat(new T.MeshBasicMaterial({ color: 0x70f2ff }));

    // ---- RCS vernier quad-blocks -------------------------------------------------------------
    var jets = [];
    var rExit = s * 0.10, bellLen = s * 0.26, plumeLen = s * 10.5;
    var plumeGeo = new T.CylinderGeometry(s * 1.55, rExit * 0.92, plumeLen, 18, 8, true);
    plumeGeo.translate(0, plumeLen * 0.5, 0);   // base ring (uv.y = 0) sits exactly on the nozzle lip
    var hB = s * 0.61;
    var yAxis = V(0, 1, 0);

    function addJet(mountM, mountQ, base, d, role, station, phiTag) {
      var lipL = base.clone().addScaledVector(d, bellLen);
      var qL = new T.Quaternion().setFromUnitVectors(yAxis, d);
      addPart('rcsBell', gBell, bellMat, mountM, lipL, qL, rExit, bellLen, rExit);
      var lipW = lipL.clone().applyMatrix4(mountM);
      var dirW = d.clone().applyQuaternion(mountQ).normalize();
      var mat = c.trackMat(new T.ShaderMaterial({
        uniforms: {
          uOn: { value: 0 },
          uTime: { value: 0 },
          uSeed: { value: (jets.length * 0.6180339) % 1.0 },
          uCore: { value: new T.Color(0.86, 0.97, 1.0) },
          uEdge: { value: new T.Color(0.28, 0.72, 1.0) }
        },
        vertexShader: RCS_PLUME_VERT,
        fragmentShader: RCS_PLUME_FRAG,
        transparent: true,
        blending: T.AdditiveBlending,
        depthWrite: false,
        side: T.DoubleSide
      }));
      var mesh = new T.Mesh(plumeGeo, mat);
      mesh.name = 'RCS_Plume_' + station + '_' + role;
      mesh.position.copy(lipW);
      mesh.quaternion.copy(mountQ).multiply(qL);
      mesh.visible = false;
      mesh.renderOrder = 6;
      rcsGrp.add(mesh);
      // Pitch/yaw couples use the station's lever sign (fore +, aft -) and the pure radial thrust, so a
      // block seated near the waist (collar fallback) still joins the correct couple; the small axial
      // cant only keeps the plume off the hull. Roll uses the true tangential moment about +X.
      var lever = Math.max(Math.abs(lipW.x - cmX), 0.25 * (c.fwdSpan + c.aftSpan) * 0.5);
      var rEff = V((station === 'fore' ? 1 : -1) * lever, lipW.y, lipW.z);
      var fRad = V(0, -dirW.y, -dirW.z);
      if (fRad.lengthSq() < 1e-8) fRad.set(0, -1, 0);
      fRad.normalize();
      var tau = new T.Vector3().crossVectors(rEff, fRad);
      var yz = Math.hypot(tau.y, tau.z) || 1;
      var tauRoll = lipW.y * (-dirW.z) - lipW.z * (-dirW.y);
      jets.push({
        mesh: mesh, mat: mat, role: role, station: station, phi: phiTag,
        pos: lipW, dir: dirW, wy: tau.y / yz, wz: tau.z / yz, rollSign: tauRoll >= 0 ? 1 : -1, val: 0
      });
    }

    function buildRcsBlock(st, station) {
      var mountM = mountMatrix(st.frame);
      var mountQ = new T.Quaternion().setFromRotationMatrix(mountM);
      var cant = station === 'fore' ? 1 : -1;
      // sunk anodized plinth, vernier block body, trim cap, propellant feed saddle
      addPart('rcsPlinth', gBox, rcsMat, mountM, V(0, 0, 0), qId, s * 1.25, s * 0.50, s * 1.10);
      addPart('rcsBody', gBox, rcsMat, mountM, V(0, s * 0.40, 0), qId, s * 1.0, s * 0.42, s * 0.90);
      addPart('rcsCap', gBox, trimMat, mountM, V(0, s * 0.635, 0), qId, s * 0.88, s * 0.05, s * 0.78);
      addPart('rcsFeed', gBox, darkMat, mountM, V(-cant * s * 0.72, s * 0.16, 0), qId, s * 0.50, s * 0.12, s * 0.16);
      addPart('rcsStrip', gBox, stripMat, mountM, V(cant * s * 0.51, s * 0.40, 0), qId, s * 0.03, s * 0.10, s * 0.70);
      var cR = Math.cos(0.21), sR = Math.sin(0.21);
      var cT = Math.cos(0.24), sT = Math.sin(0.24);
      addJet(mountM, mountQ, V(0, hB, 0), V(cant * sR, cR, 0).normalize(), 'radial', station, st.phi);
      addJet(mountM, mountQ, V(0, s * 0.40, s * 0.45), V(0, sT, cT).normalize(), 'roll', station, st.phi);
      addJet(mountM, mountQ, V(0, s * 0.40, -s * 0.45), V(0, sT, -cT).normalize(), 'roll', station, st.phi);
      return { station: station, mount: st.mount, phi: st.phi, pos: arr(st.frame.p), normal: arr(st.frame.n) };
    }

    var rcsBlocks = [];
    var cardinal = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
    cardinal.forEach(function (phi) {
      var st = foreStation(phi) || collarStation(collarFwdX - s * 0.75, wrapAngleRad(phi + Math.PI * 0.25));
      rcsBlocks.push(buildRcsBlock(st, 'fore'));
    });
    var aftRcsT = [];
    cardinal.forEach(function (phi) {
      var st = aftStation(phi, 0.62) || collarStation(collarAftX + s * 0.75, wrapAngleRad(phi + Math.PI * 0.25));
      aftRcsT.push(st.mount === 'aft-hull' ? st.param : -1);
      rcsBlocks.push(buildRcsBlock(st, 'aft'));
    });

    // ---- Weapons -------------------------------------------------------------------------------
    var hp = {
      rail: [], fel: [], lance: [], missile: [], pdc: [],
      railDirs: [], felDirs: [], lanceDirs: [], missileDirs: [], pdcDirs: []
    };
    function pushHp(kind, mountM, fr, local, dirW) {
      hp[kind].push(arr(local.clone().applyMatrix4(mountM)));
      hp[kind + 'Dirs'].push(arr(dirW.clone().normalize()));
    }

    // Hypervelocity coilgun: armored barbette, twin rails, glowing coil yokes, muzzle brake
    function buildRail(st, aim) {
      var fr = st.frame, m = mountMatrix(fr);
      addPart('wRailBarbette', gCyl, darkMat, m, V(0, 0, 0), qId, s * 0.62, s * 0.50, s * 0.62);
      addPart('wRailBody', gBox, armorMat, m, V(-aim * s * 0.10, s * 0.40, 0), qId, s * 1.05, s * 0.36, s * 0.80);
      [-1, 1].forEach(function (zs) {
        addPart('wRailBar', gBox, darkMat, m, V(aim * s * 0.80, s * 0.50, zs * s * 0.17), qId, s * 1.60, s * 0.09, s * 0.10);
      });
      [0.30, 0.66, 1.02, 1.38].forEach(function (xk) {
        addPart('wRailCoil', gBox, coilMat, m, V(aim * s * xk, s * 0.50, 0), qId, s * 0.09, s * 0.20, s * 0.50);
      });
      addPart('wRailBrake', gBox, darkMat, m, V(aim * s * 1.62, s * 0.50, 0), qId, s * 0.14, s * 0.16, s * 0.48);
      addPart('wRailCap', gBox, stripMat, m, V(-aim * s * 0.30, s * 0.60, 0), qId, s * 0.45, s * 0.05, s * 0.50);
      pushHp('rail', m, fr, V(aim * s * 1.70, s * 0.50, 0), fr.t.clone().multiplyScalar(aim));
    }
    // UV free-electron laser: sunk ring plinth, armored dome, mirror aperture and bezel
    function buildFel(st) {
      var fr = st.frame, m = mountMatrix(fr);
      addPart('wFelPlinth', gCyl, darkMat, m, V(0, 0, 0), qId, s * 0.70, s * 0.45, s * 0.70);
      addPart('wFelCollar', gTorus, armorMat, m, V(0, s * 0.22, 0), qRingY, s * 0.66, s * 0.66, s * 0.66);
      addPart('wFelDome', gDome, armorMat, m, V(0, s * 0.18, 0), qId, s * 0.58, s * 0.48, s * 0.58);
      addPart('wFelLens', gDisc, felMat, m, V(0, s * 0.665, 0), qId, s * 0.26, 1, s * 0.26);
      addPart('wFelBezel', gTorus, darkMat, m, V(0, s * 0.66, 0), qRingY, s * 0.28, s * 0.28, s * 0.28);
      pushHp('fel', m, fr, V(0, s * 0.70, 0), fr.n);
    }
    // Spinal gamma lance / RKV accelerator: axial barrel on saddles with magnetic-pinch collars
    function buildLance(st, lenB) {
      var fr = st.frame, m = mountMatrix(fr);
      var yB = s * 0.46;
      [-0.30, 0.30].forEach(function (xk) {
        addPart('wLanceSaddle', gBox, armorMat, m, V(xk * lenB, s * 0.12, 0), qId, s * 0.22, s * 0.56, s * 0.40);
      });
      addPart('wLanceBarrel', gCyl, darkMat, m, V(0, yB, 0), qAxX, s * 0.14, lenB, s * 0.14);
      [-0.36, -0.18, 0.0, 0.18, 0.36].forEach(function (xk) {
        addPart('wLancePinch', gTorus, lanceMat, m, V(xk * lenB, yB, 0), qRingX, s * 0.24, s * 0.24, s * 0.24);
      });
      addPart('wLanceHead', gCyl, armorMat, m, V(lenB * 0.5 - s * 0.10, yB, 0), qAxX, s * 0.22, s * 0.20, s * 0.22);
      addPart('wLanceEmitter', gTorus, lanceMat, m, V(lenB * 0.5, yB, 0), qRingX, s * 0.25, s * 0.25, s * 0.25);
      pushHp('lance', m, fr, V(lenB * 0.5 + s * 0.05, yB, 0), fr.t);
    }
    // Cold-launch orbital VLS missile pod: armored box cell with dual launch tubes & orange status strip
    function buildMissilePod(st) {
      var fr = st.frame, m = mountMatrix(fr);
      addPart('wMslHousing', gBox, armorMat, m, V(0, s * 0.22, 0), qId, s * 1.10, s * 0.44, s * 0.86);
      [-1, 1].forEach(function (xs) {
        addPart('wMslTube', gCyl, darkMat, m, V(xs * s * 0.26, s * 0.44, 0), qId, s * 0.18, s * 0.22, s * 0.18);
        addPart('wMslCap', gTorus, missileMat, m, V(xs * s * 0.26, s * 0.56, 0), qRingY, s * 0.20, s * 0.20, s * 0.20);
      });
      addPart('wMslStrip', gBox, missileMat, m, V(s * 0.56, s * 0.24, 0), qId, s * 0.05, s * 0.12, s * 0.62);
      pushHp('missile', m, fr, V(s * 0.26, s * 0.62, 0), fr.t.clone().multiplyScalar(0.55).addScaledVector(fr.n, 0.84));
    }
    // Compact gimbaled close-in point-defense laser dome
    function buildPdc(st) {
      var fr = st.frame, m = mountMatrix(fr);
      addPart('wPdcPlinth', gCyl, darkMat, m, V(0, s * 0.08, 0), qId, s * 0.36, s * 0.26, s * 0.36);
      addPart('wPdcDome', gDome, armorMat, m, V(0, s * 0.18, 0), qId, s * 0.32, s * 0.30, s * 0.32);
      addPart('wPdcEye', gDisc, pdcMat, m, V(0, s * 0.485, 0), qId, s * 0.15, 1, s * 0.15);
      addPart('wPdcCollar', gTorus, pdcMat, m, V(0, s * 0.24, 0), qRingY, s * 0.35, s * 0.35, s * 0.35);
      pushHp('pdc', m, fr, V(0, s * 0.52, 0), fr.n);
    }

    var nRail = c.P.wpnRail != null ? Math.round(c.P.wpnRail) : 4;
    var nFel = c.P.wpnFel != null ? Math.round(c.P.wpnFel) : 2;
    var nLance = c.P.wpnLance != null ? Math.round(c.P.wpnLance) : 2;
    var nMissile = c.P.wpnMissile != null ? Math.round(c.P.wpnMissile) : 2;
    var nPdc = c.P.wpnPdc != null ? Math.round(c.P.wpnPdc) : 2;

    var railX = Math.max(collarAftX + s * 0.70, collarFwdX - s * 1.80);
    var railSlots = [
      { kind: 'collar', x: railX, phi: Math.PI * 0.5, aim: 1 },
      { kind: 'collar', x: railX, phi: -Math.PI * 0.5, aim: 1 },
      { kind: 'aft', phi: Math.PI * 0.5, idx: 1, aim: -1 },
      { kind: 'aft', phi: -Math.PI * 0.5, idx: 3, aim: -1 },
      { kind: 'collar', x: c.seamX - cw * 0.12, phi: 0.88, aim: 1 },
      { kind: 'collar', x: c.seamX - cw * 0.12, phi: -0.88, aim: 1 }
    ];
    for (var ri = 0; ri < Math.min(nRail, railSlots.length); ri++) {
      var rs = railSlots[ri];
      if (rs.kind === 'collar') {
        buildRail(collarStation(rs.x, rs.phi), rs.aim);
      } else {
        var rcsT = aftRcsT[rs.idx];
        var cap = rcsT > 0 ? rcsT - (s * 2.6) / Math.max(1, c.aftSpan) : 0.40;
        var stR = aftStation(rs.phi, Math.min(0.40, cap)) || collarStation(c.seamX - cw * 0.38, rs.phi + 0.16);
        if (stR) buildRail(stR, rs.aim);
      }
    }

    var felX = c.seamX - cw * 0.30;
    var felPhis = [0, Math.PI, 0.36, Math.PI - 0.36];
    for (var fi = 0; fi < Math.min(nFel, felPhis.length); fi++) {
      buildFel(collarStation(fi < 2 ? felX : c.seamX + cw * 0.08, felPhis[fi]));
    }

    var lanceBack = collarAftX + s * 0.30, lanceMuz = collarFwdX - s * 0.15;
    var lanceLen = Math.max(s * 1.6, lanceMuz - lanceBack);
    var lanceX = (lanceBack + lanceMuz) * 0.5;
    var lancePhis = [0.50, -0.50, Math.PI - 0.50, -Math.PI + 0.50];
    for (var li = 0; li < Math.min(nLance, lancePhis.length); li++) {
      buildLance(collarStation(lanceX, lancePhis[li]), lanceLen);
    }

    var mslPhis = [1.05, -1.05, 2.08, -2.08];
    var mslX = c.seamX + cw * 0.04;
    for (var mi = 0; mi < Math.min(nMissile, mslPhis.length); mi++) {
      buildMissilePod(collarStation(mi < 2 ? mslX : c.seamX - cw * 0.36, mslPhis[mi]));
    }

    var pdcPhis = [0.22, -0.22, Math.PI - 0.22, -Math.PI + 0.22];
    for (var pi = 0; pi < Math.min(nPdc, pdcPhis.length); pi++) {
      buildPdc(collarStation(pi < 2 ? (collarFwdX - s * 0.35) : (collarAftX + s * 0.35), pdcPhis[pi]));
    }

    // ---- Commit instanced batches --------------------------------------------------------------
    var usedGeo = [];
    batchOrder.forEach(function (key) {
      var bt = batches[key];
      var im = new T.InstancedMesh(bt.geo, bt.mat, bt.list.length);
      for (var i = 0; i < bt.list.length; i++) im.setMatrixAt(i, bt.list[i]);
      im.instanceMatrix.needsUpdate = true;
      im.name = key;
      im.frustumCulled = false;
      (bt.rcs ? rcsGrp : wpnGrp).add(im);
      if (usedGeo.indexOf(bt.geo) < 0) usedGeo.push(bt.geo);
    });
    [gBox, gCyl, gBell, gTorus, gDome, gDisc].forEach(function (g) {
      if (usedGeo.indexOf(g) < 0) g.dispose();
    });

    return { group: grp, jets: jets, rcsBlocks: rcsBlocks, hardpoints: hp, scale: s };
  }

  function buildVessel(T, shared, genome, opts) {
    opts = opts || {};
    var gNorm = G.normalize(genome);
    var P = gNorm.P;
    var rng = G.mulberry32(gNorm.seed);
    var ph1 = rng() * Math.PI * 2;
    var ph2 = rng() * Math.PI * 2;
    var ph3 = rng() * Math.PI * 2;

    var symMode = P.iceSymmetry || 'fore';
    var hasAftIce = symMode === 'bi-cone' || symMode === 'twin-ram';
    var isTwinRam = symMode === 'twin-ram';
    var reversibleDrive = symMode === 'fore';

    var baseScale = 30.0 / (shared.LH ? shared.LH.extras.needle_length_units : 12.6);
    var seamX = -5.5;
    var needleScale = 0.64 + P.needleLen * 0.74;
    var aftScale = 0.62 + P.aftLen * 0.78;
    var girthScale = 0.70 + P.girth * 0.66;
    var flatY = 1.0 - 0.36 * P.flatten;

    var baseAftUnits = shared.LH ? shared.LH.extras.stub_length_units : 6.3;
    var fwdSpan = (shared.LH ? shared.LH.extras.needle_length_units : 12.6) * baseScale * needleScale;
    var aftSpan = baseAftUnits * baseScale * aftScale;
    if (isTwinRam) {
      aftSpan = Math.max(aftSpan, fwdSpan * 0.94);
      aftScale = aftSpan / (baseAftUnits * baseScale);
    }
    var bowX = seamX + fwdSpan;
    var sternX = seamX - aftSpan;

    var rySeam = 0.904 * baseScale * girthScale * flatY;
    var rzSeam = 1.31 * baseScale * girthScale;
    var nacScale = 0.70 + P.nacelleSize * 0.56;

    var ownedMaterials = [];
    function trackMat(m) {
      ownedMaterials.push(m);
      return m;
    }

    var isSleek = P.aftShape === 'sleek-ogive' || P.hullShape === 'ogive-spindle';
    var sTex = P.surfaceTex != null ? P.surfaceTex : 0.0;
    var asym = P.borderAsym != null ? P.borderAsym : 0.0;
    var thickBase = (lerp(0.018, 0.18, P.iceThick) + sTex * 0.14) * girthScale;
    var hullMat = trackMat(new T.MeshStandardMaterial({
      color: isSleek ? 0xdbe2ee : 0xcad2e0,
      map: shared.textures.hullBase || null,
      normalMap: shared.textures.hullNorm || null,
      normalScale: new T.Vector2(0.85, 0.85),
      metalness: isSleek ? 0.76 : 0.66,
      roughness: isSleek ? 0.28 : 0.38
    }));
    var hullStyleKey =
      P.hullShape === 'faceted-lance' ? 'faceted' :
      (P.hullShape === 'needle-spire' || (P.hullShape === 'long-patience' && P.aftShape === 'gothic-bastion')) ? 'gothic' :
      (P.hullShape === 'bulbous-ram' || (P.hullShape === 'long-patience' && P.aftShape === 'twin-boom')) ? 'heavy' :
      (P.aftShape === 'gothic-bastion') ? 'gothic' :
      (P.aftShape === 'twin-boom') ? 'heavy' : 'ogive';
    var styleMaps = (shared.textures.hullStyles && shared.textures.hullStyles[hullStyleKey]) || {
      base: shared.textures.hullPlateBase,
      bump: shared.textures.hullPlateBump,
      rough: shared.textures.hullPlateRough
    };
    var procHullMat = styleMaps.base ? trackMat(new T.MeshStandardMaterial({
      color: isSleek ? 0xd2dcee : 0xc0cadc,
      map: styleMaps.base,
      bumpMap: styleMaps.bump,
      bumpScale: 0.28,
      roughnessMap: styleMaps.rough || null,
      metalness: isSleek ? 0.76 : 0.70,
      roughness: styleMaps.rough ? (isSleek ? 0.86 : 0.96) : (isSleek ? 0.30 : 0.40)
    })) : hullMat;

    var darkMat = trackMat(new T.MeshStandardMaterial({
      color: 0x161724,
      metalness: 0.78,
      roughness: 0.36,
      side: T.DoubleSide
    }));

    var trimMat = trackMat(new T.MeshStandardMaterial({
      color: 0xdbe4f4,
      emissive: new T.Color(0x182238),
      emissiveIntensity: 0.24,
      metalness: 0.72,
      roughness: 0.26,
      side: T.DoubleSide
    }));

    var cryoMat = trackMat(new T.MeshStandardMaterial({
      color: 0x9edbf4,
      emissive: new T.Color(0x0c283e),
      emissiveIntensity: 0.28,
      metalness: 0.38,
      roughness: 0.24,
      side: T.DoubleSide
    }));

    var obsidianMat = trackMat(new T.MeshStandardMaterial({
      color: 0x0c0e17,
      metalness: 0.80,
      roughness: 0.42,
      side: T.DoubleSide
    }));

    var aftGothicMat = trackMat(new T.MeshStandardMaterial({
      color: 0x24263a,
      map: styleMaps.base || null,
      bumpMap: styleMaps.bump || null,
      bumpScale: 0.26,
      roughnessMap: styleMaps.rough || null,
      emissive: new T.Color(0xff9248),
      emissiveMap: shared.textures.gothicEmber,
      emissiveIntensity: 0.35 + P.cityLights * 1.65,
      metalness: 0.74,
      roughness: styleMaps.rough ? 0.94 : 0.42
    }));

    var collarMat = trackMat(new T.MeshStandardMaterial({
      color: 0x202436,
      emissive: new T.Color(0xffffff),
      emissiveMap: shared.textures.cityCollar,
      emissiveIntensity: 0.15 + P.cityLights * 2.0,
      metalness: 0.66,
      roughness: 0.36,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    }));

    var amberLightMat = trackMat(new T.MeshBasicMaterial({ color: 0xffd07a }));
    var cyanGlowMat = trackMat(new T.MeshBasicMaterial({ color: 0x56eeff, side: T.DoubleSide }));

    // Authentic Long Patience Ice Material (smooth blend into obsidian/crimson when iceTint > 0)
    var iceColor = new T.Color(0xf4fcff).lerp(new T.Color(0xb8b2c4), P.iceTint * 0.72);
    var iceEmissive = new T.Color(0x0c3242).lerp(new T.Color(0x280c12), P.iceTint);
    var iceMat = trackMat(new T.MeshStandardMaterial({
      color: iceColor,
      map: shared.textures.frost,
      bumpMap: shared.textures.frostCraterBump || null,
      bumpScale: Math.max(0.06, sTex * 0.34),
      roughness: lerp(0.46, 0.38, P.iceTint),
      metalness: lerp(0.06, 0.22, P.iceTint),
      transparent: true,
      opacity: lerp(0.78, 0.91, P.iceTint),
      side: T.FrontSide,
      emissive: iceEmissive,
      emissiveIntensity: 0.38,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    }));

    var iceProcMat = trackMat(new T.MeshStandardMaterial({
      color: 0xffffff,
      map: shared.textures.frost,
      bumpMap: shared.textures.frostCraterBump || null,
      bumpScale: lerp(0.07, 0.38, sTex),
      vertexColors: true,
      roughness: lerp(0.42, 0.52, sTex * (1 - P.iceTint * 0.5)),
      metalness: lerp(0.07, 0.22, P.iceTint),
      transparent: true,
      opacity: lerp(0.84, 0.94, P.iceTint),
      emissive: iceEmissive,
      emissiveIntensity: 0.38,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    }));

    var spikeMat = trackMat(new T.MeshStandardMaterial({
      color: 0xffffff,
      map: shared.textures.heat,
      emissiveMap: shared.textures.heat,
      emissive: new T.Color(0xffffff),
      emissiveIntensity: 1.85,
      roughness: 0.28,
      metalness: 0.35
    }));

    var cowlHeatMat = trackMat(new T.MeshStandardMaterial({
      color: 0x240810,
      emissive: P.podStyle === 'canted-bell' ? 0x38d8ff : 0xff3b18,
      emissiveIntensity: 1.4,
      roughness: 0.32,
      metalness: 0.45,
      side: T.DoubleSide
    }));

    var revCowlHeatMat = trackMat(new T.MeshStandardMaterial({
      color: 0x0b1222,
      emissive: P.podStyle === 'canted-bell' ? 0x4ae0ff : 0x5cc4ff,
      emissiveIntensity: 0.24,
      roughness: 0.34,
      metalness: 0.48,
      side: T.DoubleSide
    }));

    var ductHeatMat = trackMat(new T.MeshStandardMaterial({
      color: 0x2e0b08,
      emissive: 0xff4d0a,
      emissiveIntensity: 1.18,
      roughness: 0.35,
      metalness: 0.3,
      side: T.DoubleSide
    }));

    var radiatorMat = trackMat(new T.MeshStandardMaterial({
      color: 0xffffff,
      map: shared.textures.rad,
      emissiveMap: shared.textures.rad,
      emissive: new T.Color(0xd92626),
      emissiveIntensity: 0.95,
      roughness: 0.40,
      metalness: 0.28,
      side: T.DoubleSide
    }));

    var outerCol = P.podStyle === 'canted-bell' ? 0x2c9bff : P.podStyle === 'annular-shroud' ? 0xb84dff : 0x8e48ff;
    var coreCol = P.podStyle === 'canted-bell' ? 0xdffbff : P.podStyle === 'annular-shroud' ? 0xffb8f0 : 0x8cffc4;
    var plumeScale = opts.plumeScale || (opts.corridorMode ? 9.5 : 1.0);
    var isCorridor = !!opts.corridorMode;

    var plumeOuterMat = trackMat(new T.ShaderMaterial({
      uniforms: { uColor: { value: new T.Color(outerCol) }, uOn: { value: 1.0 }, uTime: { value: 0.0 } },
      vertexShader: shared.shaders.plumeVert,
      fragmentShader: isCorridor
        ? 'uniform vec3 uColor; uniform float uOn; varying vec2 vUv; varying vec3 vN; varying vec3 vV;' +
          'void main(){ float c = pow(max(1e-4, abs(dot(vN, vV))), 1.05); float a = pow(max(1e-4, vUv.y), 1.15) * (0.45 + 0.55 * c) * uOn;' +
          ' gl_FragColor = vec4(uColor * a * 3.8, clamp(a, 0.0, 1.0)); }'
        : shared.shaders.plumeFragOuter,
      transparent: true,
      blending: T.AdditiveBlending,
      depthWrite: false,
      side: T.DoubleSide
    }));

    var plumeCoreMat = trackMat(new T.ShaderMaterial({
      uniforms: { uColor: { value: new T.Color(coreCol) }, uOn: { value: 1.0 }, uTime: { value: 0.0 } },
      vertexShader: shared.shaders.plumeVert,
      fragmentShader: isCorridor
        ? 'uniform vec3 uColor; uniform float uOn; varying vec2 vUv; varying vec3 vN; varying vec3 vV;' +
          'void main(){ float c = pow(max(1e-4, abs(dot(vN, vV))), 0.85); float a = pow(max(1e-4, vUv.y), 0.92) * c * uOn;' +
          ' gl_FragColor = vec4(uColor * a * 4.6, clamp(a, 0.0, 1.0)); }'
        : shared.shaders.plumeFragCore,
      transparent: true,
      blending: T.AdditiveBlending,
      depthWrite: false,
      side: T.DoubleSide
    }));

    var plumeMeshes = [];
    var heatMatList = [spikeMat, cowlHeatMat, ductHeatMat];
    var heatBase = heatMatList.map(function (m) { return m.emissiveIntensity; });
    var rootGroup = new T.Group();
    rootGroup.name = gNorm.name;
    var spinnerGroup = new T.Group();
    rootGroup.add(spinnerGroup);
    var iceMeshRef = null;
    var aftIceMeshRef = null;

    // -- 0. SURFACE STYLE KITS (window.LighthuggerStyleKits, contract #110 [B]) ----------
    // Kits run in a fixed order. Each kit blends by its own weight and its share of the total
    // active weight (ctx.styleShares), so mixed styles stay cohesive instead of stacking.
    var styleKitOrder = ['gnostic', 'gothic', 'sleek', 'giger', 'coade', 'dune', 'cathedral'];
    var styleKitKeys = { gnostic: 'styleGnostic', gothic: 'styleGothic', sleek: 'styleSleek', giger: 'styleGiger', coade: 'styleCoade', dune: 'styleDune', cathedral: 'styleCathedral' };
    var styleWeights = {}, styleShares = {}, styleTotal = 0;
    styleKitOrder.forEach(function (id) {
      var w = clamp(Number(P[styleKitKeys[id]]) || 0, 0, 1);
      styleWeights[id] = w;
      if (w > 0.02) styleTotal += w;
    });
    styleKitOrder.forEach(function (id) {
      styleShares[id] = (styleTotal > 0 && styleWeights[id] > 0.02) ? styleWeights[id] / styleTotal : 0;
    });
    var kitRegistry = root.LighthuggerStyleKits || {};
    var activeKits = [];
    styleKitOrder.forEach(function (id) {
      var kit = kitRegistry[id];
      if (!kit) return;
      var w = clamp(Number(P[kit.weightKey || styleKitKeys[id]]) || 0, 0, 1);
      if (w > 0.02) activeKits.push({ id: id, kit: kit, w: w });
    });
    function runStyleKits(phase) {
      activeKits.forEach(function (k) {
        if (typeof k.kit[phase] !== 'function') return;
        try {
          k.kit[phase](styleCtx);
        } catch (err) {
          if (typeof console !== 'undefined' && console.warn) console.warn('Lighthugger style kit ' + k.id + '.' + phase + ' failed:', err);
        }
      });
    }
    // Stealth (sleek), Dune Brutalist (dune), and Gothic Cathedral (gothic) dominance quiets stock
    // hull clutter so each sculptural architectural kit owns the vessel silhouette cleanly.
    var sleekDom = styleWeights.sleek * styleShares.sleek;
    var duneDom = styleWeights.dune * styleShares.dune;
    var gothicDom = styleWeights.gothic * styleShares.gothic;
    var cathedralDom = styleWeights.cathedral * styleShares.cathedral;
    // Gothic Cathedral pylon/nacelle integration (skeletal arched pylons + bell-tower nacelle shrouds)
    // is gated strictly on the cathedral weight so every other preset keeps its stock engine hardware.
    var cathApi = (styleWeights.cathedral > 0.30 && kitRegistry.cathedral &&
      typeof kitRegistry.cathedral.buildPylonGeometry === 'function' &&
      typeof kitRegistry.cathedral.buildNacelleShroud === 'function') ? kitRegistry.cathedral : null;
    var greebleDetailMul = Math.max(0.18, 1 - 0.55 * sleekDom - 0.80 * duneDom - 0.65 * gothicDom - 0.72 * cathedralDom);
    collarMat.emissiveIntensity *= (1 - 0.45 * sleekDom - 0.55 * duneDom);
    aftGothicMat.emissiveIntensity *= (1 - 0.40 * sleekDom - 0.72 * duneDom);

    var styleGroup = new T.Group();
    styleGroup.name = 'Style_Kits';
    rootGroup.add(styleGroup);
    var styleSurf = makeSurfaceHelpers(T, shared, P, seamX, aftSpan, fwdSpan, rySeam, rzSeam, isTwinRam, styleGroup);
    var styleCtx = {
      T: T,
      G: G,
      P: P,
      genome: gNorm,
      rng: G.mulberry32((gNorm.seed ^ 0x5717e5) | 0),
      rootGroup: rootGroup,
      styleGroup: styleGroup,
      spinnerGroup: spinnerGroup,
      trackMat: trackMat,
      shared: shared,
      seamX: seamX,
      fwdSpan: fwdSpan,
      aftSpan: aftSpan,
      bowX: bowX,
      sternX: sternX,
      rySeam: rySeam,
      rzSeam: rzSeam,
      girthScale: girthScale,
      flatY: flatY,
      nacScale: nacScale,
      aftPodPush: 0,
      icePresent: P.iceCoverage > 0.02,
      hasAftIce: hasAftIce,
      isTwinRam: isTwinRam,
      hideIce: !!opts.hideIce,
      isCorridor: !!opts.corridorMode,
      detailScale: opts.corridorMode ? 0.42 : 1.0,
      hullStyleKey: hullStyleKey,
      styleWeights: styleWeights,
      styleShares: styleShares,
      styleTotal: styleTotal,
      mats: {
        hull: hullMat,
        procHull: procHullMat,
        dark: darkMat,
        trim: trimMat,
        cryo: cryoMat,
        obsidian: obsidianMat,
        aftGothic: aftGothicMat,
        collar: collarMat,
        amberLight: amberLightMat,
        cyanGlow: cyanGlowMat,
        rad: radiatorMat,
        radiator: radiatorMat,
        ice: iceMat,
        iceProc: iceProcMat,
        spike: spikeMat,
        cowlHeat: cowlHeatMat,
        ductHeat: ductHeatMat
      },
      heatMatList: heatMatList,
      heatBase: heatBase,
      plumeMeshes: plumeMeshes,
      evalForePoint: styleSurf.evalForePoint,
      evalAftSurf: styleSurf.evalAftSurf,
      evalSurfaceFrame: styleSurf.evalSurfaceFrame,
      evalForeBareEnd: function () { return 0.90; },
      evalAftBareEnd: function () { return 0.86; },
      pushFramed: styleSurf.pushFramed,
      pushCustomRot: styleSurf.pushCustomRot,
      pushAxialPipe: styleSurf.pushAxialPipe,
      commitInstances: styleSurf.commitInstances,
      keepout: makeKeepoutHelper([])
    };
    runStyleKits('applyMaterials');
    // Unify ALL conjoiner-spike vessels (including stock Long Patience) onto our sculpted
    // dual-ended Conjoiner nacelles so reverse braking burns cleanly out of an open forward
    // deceleration throat instead of through a projecting ramjet centerbody spike.
    var useSculptedConjoiner = (P.podStyle === 'conjoiner-spike');
    if (useSculptedConjoiner) {
      cowlHeatMat.color.setHex(0x0b1224);
      cowlHeatMat.emissive.setHex(0x5ea8ff);
      cowlHeatMat.emissiveIntensity = 1.15;
      ductHeatMat.color.setHex(0x0e1428);
      ductHeatMat.emissive.setHex(0x4c7eff);
      ductHeatMat.emissiveIntensity = 0.82;
    }
    // Kits may retune heat emissives; re-baseline so setPlumeIntensity scales from the styled values.
    for (var hbi = 0; hbi < heatMatList.length; hbi++) heatBase[hbi] = heatMatList[hbi].emissiveIntensity;
    [iceMat, iceProcMat].forEach(function (m) {
      m.userData = m.userData || {};
      m.userData.baseEmissive = m.emissiveIntensity;
    });

    // -- 1. FORWARD PROW & GENUINE LONG PATIENCE SCULPTED ICE SHIELD --------
    var collarW = 1.48 + P.girth * 0.38;
    var zone = P.portPlacement || 'aft-hull';
    var icePresent = P.iceCoverage > 0.02;
    var hasWaistZone = (zone === 'waist' || zone === 'all-zones') && (P.shuttlePorts | 0) > 0;
    var foreCollarClear = (hasAftIce || hasWaistZone)
      ? clamp((collarW * (hasWaistZone ? 0.92 : 0.42)) / Math.max(1, fwdSpan), 0.02, 0.14)
      : 0.0;
    // When a rolling centrifuge spin ring is installed on a bi-cone/twin-ram vessel, reserve a
    // clean bare-hull raceway bay (t = 0.08..0.26) aft of the waist so the track never clips ice!
    var aftCollarClear = hasAftIce
      ? clamp((collarW * (hasWaistZone ? 1.58 : 0.88)) / Math.max(1, aftSpan), isTwinRam ? 0.06 : 0.08, 0.28)
      : 0.04;
    if (P.habRing && hasAftIce) {
      aftCollarClear = Math.max(aftCollarClear, 0.27);
    }
    var uIceStart = icePresent ? Math.max(foreCollarClear, lerp(0.62, 0.0, clamp((P.iceCoverage - 0.02) / 0.98, 0, 1))) : 1.0;

    if (P.hullShape === 'long-patience' && shared.groupsByName['02_Ice_Lance_Shell']) {
      // A. Genuine 03_Structure_Beneath_Ice (strictly inset <= 0.88 so it NEVER Z-fights with Exposed_Fwd_Hull!)
      var innerPart = shared.groupsByName['03_Structure_Beneath_Ice'];
      if (innerPart) {
        var ni = innerPart.count;
        var posIn = new Float32Array(ni * 3), nrmIn = new Float32Array(ni * 3);
        for (var ki = 0; ki < ni; ki++) {
          var iax = innerPart.ax[ki], iay = innerPart.ay[ki], iarZ = innerPart.az[ki];
          var radialSafety = iax > 0.2 ? lerp(0.88, 0.78, clamp(iax / 3.0, 0, 1)) : 0.88;
          posIn[3 * ki] = seamX + baseScale * iax * needleScale;
          posIn[3 * ki + 1] = baseScale * iay * girthScale * flatY * radialSafety;
          posIn[3 * ki + 2] = baseScale * iarZ * girthScale * radialSafety;
          nrmIn[3 * ki] = innerPart.nx[ki];
          nrmIn[3 * ki + 1] = innerPart.ny[ki];
          nrmIn[3 * ki + 2] = innerPart.nz[ki];
        }
        var inGeo = new T.BufferGeometry();
        inGeo.setAttribute('position', new T.BufferAttribute(posIn, 3));
        inGeo.setAttribute('normal', new T.BufferAttribute(nrmIn, 3));
        inGeo.setAttribute('uv', new T.BufferAttribute(innerPart.uv, 2));
        inGeo.setIndex(new T.BufferAttribute(innerPart.index, 1));
        inGeo.computeVertexNormals();
        var inMesh = new T.Mesh(inGeo, hullMat);
        inMesh.name = '03_Structure_Beneath_Ice';
        rootGroup.add(inMesh);
      }

      // Always build a watertight armored inner prow core from seam to tip so sliding/asymmetric ice NEVER leaves gaps
      var fwdCoreEnd = icePresent ? 0.992 : 1.0;
      function coreInsetAt(uPos) {
        return icePresent ? (uPos > uIceStart + 0.04 ? lerp(0.985, 0.86, clamp((uPos - uIceStart) / 0.38, 0, 1)) : 0.985) : 0.985;
      }
      var bareGeo = buildRevolvedGeometry(T, 44, 52, function (s, phi, out) {
        var u = s * fwdCoreEnd;
        var rNorm = evalHullRadius(shared, 'long-patience', P.hullCurve, u, phi);
        var asymEnv = icePresent ? 1.0 : (1 + 0.03 * asym * Math.cos(phi - 0.52) * Math.sin(u * Math.PI));
        var inset = coreInsetAt(u);
        out.x = seamX + u * fwdSpan;
        out.y = rySeam * rNorm * inset * asymEnv * Math.cos(phi);
        out.z = rzSeam * rNorm * inset * asymEnv * Math.sin(phi);
      }, false, true);
      var bareMesh = new T.Mesh(bareGeo, hullMat);
      bareMesh.name = 'Exposed_Fwd_Hull';
      rootGroup.add(bareMesh);

      // B. Genuine 20,672-tri Sculpted Long Patience Ice Lance (`02_Ice_Lance_Shell`)
      if (icePresent) {
        var icePart = shared.groupsByName['02_Ice_Lance_Shell'];
        var nc = icePart.count;
        var posIc = new Float32Array(nc * 3), nrmIc = new Float32Array(nc * 3);
        var thickGain = 1.004 + 0.16 * P.iceThick + 0.06 * sTex;
        var lpCraters = sTex > 0.02 ? makeCraterField(rng, 10 + Math.round(sTex * 10)) : [];

        for (var kc = 0; kc < nc; kc++) {
          var ax = icePart.ax[kc], ay = icePart.ay[kc], az = icePart.az[kc];
          var uRaw = clamp(ax / 12.6, 0, 1);
          var ang = Math.atan2(az, ay);
          var asymCut = asym > 0.02 ? clamp(asym * (0.16 + 0.22 * Math.cos(ang - 0.55 - ph1 * 0.4) + 0.09 * Math.sin(3 * ang + ph2)), 0, 0.42) : 0;
          var uBaseLP = clamp(uIceStart + asymCut, 0, 0.84);
          var uMapped = ax >= 0
            ? lerp(uBaseLP, 1.0, ax / 12.6)
            : lerp(Math.max(0, uBaseLP - 0.015), uBaseLP, clamp((ax + 0.19) / 0.19, 0, 1));
          var sx = seamX + uMapped * fwdSpan;
          var sy = baseScale * ay * girthScale * flatY;
          var sz = baseScale * az * girthScale;

          // When rear edge is pulled forward by sliders/asymmetry, rescale cross-section to hug the local core taper cleanly
          if (uMapped > uRaw + 0.004) {
            var rSrc = Math.max(0.04, evalHullRadius(shared, 'long-patience', P.hullCurve, uRaw, ang));
            var rDst = evalHullRadius(shared, 'long-patience', P.hullCurve, clamp(uMapped, 0, 1), ang);
            var shrink = clamp(rDst / rSrc, 0.02, 1.02);
            var blendFit = lerp(shrink, 1.0, Math.pow(uRaw, 2.2) * 0.25);
            sy *= blendFit;
            sz *= blendFit;
          }

          // Serrated glacial rear skirt warp + optional asymmetric bias
          if (ax < 1.8) {
            var sw = 1.0 - clamp((ax + 0.2) / 2.0, 0, 1);
            sx += sw * sw * P.skirtJagged * 0.55 * (Math.sin(ang * 5 + ph1) * 0.6 + Math.cos(ang * 8 + ph2) * 0.4);
            sx += sw * asym * 1.15 * Math.cos(ang - 0.55 - ph1 * 0.4);
          }

          // Smooth Long Patience 3D cometary glacier ridges (zero Valley clipping over 03_Structure!)
          if (uRaw > 0.18) {
            var uMid = (uRaw - 0.18) / 0.82;
            var midBell = Math.sin(uMid * Math.PI);
            var c1 = Math.sin(ang * 3 + sx * 0.42 + ph1);
            var c2 = Math.cos(ang * 5 - sx * 0.70 + ph2) * 0.55;
            var c3 = Math.sin(ang * 7 + sx * 1.10 + ph3) * 0.28;
            var wave = 0.55 * c1 + 0.30 * c2 + 0.15 * c3;
            // Inner skeleton ends at uRaw ~ 0.57; clamp negative troughs there >= 0.94!
            var minRad = uRaw < 0.60 ? 0.94 : 0.78;
            var tipPinch = 1.0 - (0.72 - 0.12 * P.crags) * Math.pow(uMid, 4.5);
            var radialMod = tipPinch * Math.max(minRad, 1.0 + (0.04 + 0.22 * P.crags) * midBell * wave);
            sx += (0.12 + 0.24 * P.crags) * midBell * (0.65 * c1 + 0.35 * c2);
            var r0 = Math.hypot(sy, sz);
            if (uMid > 0.992 && r0 < 0.24) sx += 0.22 * (1.0 - r0 / 0.24);
            sy *= radialMod;
            sz *= radialMod;
          }

          var skirtSeal = (uIceStart > 0.005 || asym > 0.02 || P.skirtJagged > 0.02) && uRaw < 0.06
            ? lerp(1.003, thickGain, clamp(uRaw / 0.06, 0, 1))
            : thickGain;
          var iceGain = skirtSeal;
          if (sTex > 0.02 && uRaw > 0.06) {
            var relLP = evalIceSurfaceRelief(uRaw, ang, sTex, gNorm.seed, lpCraters);
            var envLP = Math.sin(uRaw * Math.PI);
            iceGain = Math.max(1.002, skirtSeal + relLP.disp * 0.26 * envLP);
          }
          posIc[3 * kc] = sx + uRaw * uRaw * (0.008 + 0.12 * P.iceThick);
          var outY = sy * iceGain;
          var outZ = sz * iceGain;
          // Enforce strict minimum outer envelope above Exposed_Fwd_Hull so uneven sliders/valleys never expose inner metal gaps
          var uActual = clamp((posIc[3 * kc] - seamX) / Math.max(0.1, fwdSpan), 0, 1.0);
          var rHullLocal = evalHullRadius(shared, 'long-patience', P.hullCurve, uActual, ang);
          var curRNorm = Math.hypot(outY / Math.max(0.04, rySeam), outZ / Math.max(0.04, rzSeam));
          if (ax < 0) {
            var tuckMax = rHullLocal * 0.996;
            if (curRNorm > tuckMax && curRNorm > 1e-4) {
              var kTuck = tuckMax / curRNorm;
              outY *= kTuck;
              outZ *= kTuck;
            }
          } else {
            var tipSafe = uActual > 0.95 ? (1.0 - clamp((uActual - 0.95) / 0.05, 0, 1) * 0.55) : 1.0;
            var minEnv = rHullLocal * coreInsetAt(uActual) * (ax < 0.15 ? 1.015 : 1.028) * tipSafe;
            if (curRNorm < minEnv && curRNorm > 1e-4) {
              var kPush = minEnv / curRNorm;
              outY *= kPush;
              outZ *= kPush;
            }
          }
          posIc[3 * kc + 1] = outY;
          posIc[3 * kc + 2] = outZ;
          nrmIc[3 * kc] = icePart.nx[kc];
          nrmIc[3 * kc + 1] = icePart.ny[kc];
          nrmIc[3 * kc + 2] = icePart.nz[kc];
        }

        var iceGeo = new T.BufferGeometry();
        iceGeo.setAttribute('position', new T.BufferAttribute(posIc, 3));
        iceGeo.setAttribute('normal', new T.BufferAttribute(nrmIc, 3));
        iceGeo.setAttribute('uv', new T.BufferAttribute(icePart.uv, 2));
        iceGeo.setIndex(new T.BufferAttribute(icePart.index, 1));
        iceGeo.computeVertexNormals();

        iceMeshRef = new T.Mesh(iceGeo, iceMat);
        iceMeshRef.name = '02_Ice_Lance_Shell';
        iceMeshRef.renderOrder = 3;
        rootGroup.add(iceMeshRef);
      }
    } else {
      // Parametric Zando Forward Hulls (ogive-spindle, needle-spire, faceted-lance, bulbous-ram)
      var fwdGeo = buildRevolvedGeometry(T, 64, 64, function (s, phi, out) {
        var u = 1 - (1 - s) * (1 - s);
        var rNorm = evalHullRadius(shared, P.hullShape, P.hullCurve, u, phi);
        var asymHull = 1 + 0.055 * asym * Math.cos(phi - 0.52) * Math.sin(u * Math.PI);
        var scaleIn = 0.98 * asymHull;
        out.x = seamX + u * fwdSpan;
        out.y = rySeam * rNorm * scaleIn * Math.cos(phi);
        out.z = rzSeam * rNorm * scaleIn * Math.sin(phi);
      }, false, true);
      var fwdMesh = new T.Mesh(fwdGeo, procHullMat);
      fwdMesh.name = 'Forward_Hull';
      rootGroup.add(fwdMesh);

      if (icePresent) {
        var cragAmp = 0.018 + P.crags * 0.085;
        var craters = sTex > 0.02 ? makeCraterField(rng, 10 + Math.round(sTex * 12)) : [];
        var procIceGeo = buildRevolvedGeometry(T, 88, 84, function (s, phi, out) {
          var jag = 0.50 * Math.sin(phi * 5 + ph1) + 0.32 * Math.cos(phi * 9 - ph2) + 0.18 * Math.sin(phi * 15 + ph3);
          var oblique = asym * (0.28 * Math.cos(phi - 0.55 - ph1 * 0.4) + 0.14 * Math.sin(2 * phi + 0.95 - ph2 * 0.3));
          var tongue = (0.10 * asym + 0.08 * P.skirtJagged) * (0.55 * Math.sin(phi * 3 + ph1) + 0.30 * Math.cos(phi * 6 - ph2) + 0.15 * Math.sin(phi * 11 + ph3));
          var uStartPhi = clamp(uIceStart + asym * 0.18 + oblique + P.skirtJagged * 0.070 * jag + tongue, 0.01, 0.86);
          var u = lerp(uStartPhi, 1.0, 1 - (1 - s) * (1 - s));
          var rHull = evalHullRadius(shared, P.hullShape, P.hullCurve, u, phi) * (1 + 0.055 * asym * Math.cos(phi - 0.52) * Math.sin(u * Math.PI));

          var skirtStep = Math.pow(Math.min(1.0, s * 7.5), 0.72);
          var tipTaper = 1.0 - Math.pow(s, 3.2);
          var phAsym = phi + asym * 0.45 * Math.sin(u * Math.PI);
          var flute = 0.55 * Math.sin(phAsym * 4 + s * 6.0 + ph1) + 0.30 * Math.cos(phAsym * 7 - s * 9.5 + ph2) + 0.15 * Math.sin(phAsym * 12 + s * 14.0 + ph3);
          var relief = sTex > 0.02 ? evalIceSurfaceRelief(u, phi, sTex, gNorm.seed, craters) : { disp: 0, shade: 1.0 };
          var bodyEnv = Math.sin(Math.min(1.0, s) * Math.PI);
          var rawDR = thickBase * lerp(0.14, 1, skirtStep) * tipTaper * (1 + cragAmp * flute) +
            relief.disp * (0.35 + 0.65 * bodyEnv) * skirtStep * tipTaper * girthScale;
          var minSafeDR = 0.014 * girthScale * skirtStep * tipTaper;
          var dR = Math.max(minSafeDR, rawDR);

          // Strict clearance > metal core everywhere, sculpted glacial bumps & craters, asymmetric trailing edge
          out.x = seamX + u * fwdSpan + s * s * (0.004 + thickBase * 0.65);
          out.y = (rySeam * rHull + dR) * Math.cos(phi);
          out.z = (rzSeam * rHull + dR) * Math.sin(phi);

          var edgeFrost = s < 0.05 ? lerp(1.12, 1.0, s / 0.05) : 1.0;
          var ridgeBright = clamp(0.5 + 0.5 * flute, 0, 1);
          var cryoR = lerp(0.76, 0.97, ridgeBright) * relief.shade * edgeFrost;
          var cryoG = lerp(0.90, 0.99, ridgeBright) * relief.shade * edgeFrost;
          var cryoB = lerp(0.97, 1.00, ridgeBright) * lerp(1.0, relief.shade, 0.55) * edgeFrost;
          var obsR = lerp(0.16, 0.92, Math.pow(s, 1.45)) * relief.shade;
          var obsG = lerp(0.14, 0.20, Math.pow(s, 1.45)) * relief.shade;
          var obsB = lerp(0.22, 0.18, Math.pow(s, 1.45)) * relief.shade;
          out.r = clamp(lerp(cryoR, obsR, P.iceTint), 0.08, 1.0);
          out.g = clamp(lerp(cryoG, obsG, P.iceTint), 0.08, 1.0);
          out.b = clamp(lerp(cryoB, obsB, P.iceTint), 0.12, 1.0);
        }, true, true);

        iceMeshRef = new T.Mesh(procIceGeo, iceProcMat);
        iceMeshRef.name = 'Procedural_Hull_Ice';
        iceMeshRef.renderOrder = 3;
        rootGroup.add(iceMeshRef);
      }
    }

    // -- 2. ILLUMINATED MID-BODY WAIST CITY-WINDOW COLLAR -------------------
    if (iceMeshRef) iceMeshRef.visible = !opts.hideIce;
    var collarScale = (P.hullShape === 'long-patience' && icePresent) ? (1.022 + 0.036 * P.iceThick) : 1.018;
    if (hasAftIce && icePresent) collarScale = Math.max(collarScale, 1.036);
    var collarGeo = buildRevolvedGeometry(T, 6, 56, function (u, phi, out) {
      var lip = (u < 0.16 || u > 0.84) ? collarScale * 1.006 : collarScale;
      out.x = (seamX - collarW * 0.65) + u * collarW;
      out.y = rySeam * lip * Math.cos(phi);
      out.z = rzSeam * lip * Math.sin(phi);
    }, false);
    var collarMesh = new T.Mesh(collarGeo, collarMat);
    collarMesh.name = 'Waist_City_Collar';
    rootGroup.add(collarMesh);

    // -- 3. AFT CHASSIS / REAR CONE ARCHITECTURES ---------------------------
    if (isTwinRam) {
      var symAftGeo = buildRevolvedGeometry(T, 64, 64, function (s, phi, out) {
        var t = 1 - (1 - s) * (1 - s);
        var rNorm = evalHullRadius(shared, P.hullShape, P.hullCurve, t, phi);
        var asymHull = 1 + 0.055 * asym * Math.cos(phi - 0.52) * Math.sin(t * Math.PI);
        var tipClose = t > 0.86 ? (1.0 - Math.pow((t - 0.86) / 0.14, 1.5) * 0.96) : 1.0;
        var scaleIn = 0.98 * asymHull * tipClose;
        out.x = seamX - t * aftSpan;
        out.y = rySeam * rNorm * scaleIn * Math.cos(phi);
        out.z = rzSeam * rNorm * scaleIn * Math.sin(phi);
      }, false, true);
      var symAftMesh = new T.Mesh(symAftGeo, procHullMat);
      symAftMesh.name = 'Twin_Ram_Aft_Core';
      rootGroup.add(symAftMesh);
    } else if (P.aftShape === 'long-patience-aft' && shared.aftHullGroups.length) {
      // Authentic DR.lighthugger 01_Hull + native 09..14 Shuttle Ports, Dorsal Hatches & Warm Port Lights!
      var aftGroupMats = [hullMat, iceMat, darkMat, darkMat, amberLightMat];
      shared.aftHullGroups.forEach(function (part) {
        var n = part.count;
        var pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
        for (var k = 0; k < n; k++) {
          pos[3 * k] = seamX + baseScale * part.ax[k] * aftScale;
          pos[3 * k + 1] = baseScale * part.ay[k] * girthScale * flatY;
          pos[3 * k + 2] = baseScale * part.az[k] * girthScale;
          nrm[3 * k] = part.nx[k];
          nrm[3 * k + 1] = part.ny[k];
          nrm[3 * k + 2] = part.nz[k];
        }
        var geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.BufferAttribute(pos, 3));
        geo.setAttribute('normal', new T.BufferAttribute(nrm, 3));
        geo.setAttribute('uv', new T.BufferAttribute(part.uv, 2));
        geo.setIndex(new T.BufferAttribute(part.index, 1));
        geo.computeVertexNormals();
        var mesh = new T.Mesh(geo, aftGroupMats[part.material] || hullMat);
        mesh.name = part.name;
        rootGroup.add(mesh);
      });
    } else {
      var aftMatChoice = P.aftShape === 'gothic-bastion' ? aftGothicMat : procHullMat;
      var aftGeo = buildRevolvedGeometry(T, 44, 56, function (t, phi, out) {
        var rNorm = evalAftRadius(shared, P.aftShape, P.greebles, t, phi);
        var asymAft = 1 + 0.04 * asym * Math.cos(phi - 0.52) * Math.sin(t * Math.PI);
        out.x = seamX - t * aftSpan;
        out.y = rySeam * rNorm * asymAft * Math.cos(phi);
        out.z = rzSeam * rNorm * asymAft * Math.sin(phi);
      }, false, false);
      var aftMesh = new T.Mesh(aftGeo, aftMatChoice);
      aftMesh.name = 'Aft_Cone';
      rootGroup.add(aftMesh);

      if (P.aftShape === 'gothic-bastion' && styleWeights.gothic <= 0.25 && styleWeights.cathedral <= 0.25) {
        rootGroup.add(buildGothicButtresses(T, shared, seamX, aftSpan, rySeam, rzSeam, P.greebles, obsidianMat, trimMat));
      } else if (P.aftShape === 'twin-boom') {
        [-1, 1].forEach(function (side) {
          var bLen = aftSpan * 0.90;
          var boomGeo = new T.ConeGeometry(rySeam * 0.24, bLen, 16);
          boomGeo.rotateZ(Math.PI * 0.5);
          var boom = new T.Mesh(boomGeo, procHullMat);
          boom.position.set(seamX - bLen * 0.54, 0, side * rzSeam * 0.64);
          rootGroup.add(boom);
        });
        var strut = new T.Mesh(new T.BoxGeometry(aftSpan * 0.16, rySeam * 0.14, rzSeam * 1.28), darkMat);
        strut.position.set(seamX - aftSpan * 0.36, 0, 0);
        rootGroup.add(strut);
      }
    }

    // -- 3B. SYMMETRIC AFT CRYO-ICE SHIELD ('bi-cone' or 'twin-ram' for Flip & Burn) --
    if (icePresent && hasAftIce) {
      var aftCragAmp = 0.018 + P.crags * 0.085;
      var aftCraters = sTex > 0.02 ? makeCraterField(G.mulberry32(gNorm.seed ^ 0x5f3759df), 10 + Math.round(sTex * 12)) : [];
      var aftStartMin = aftCollarClear;
      var aftIceExt = isTwinRam ? 1.02 : (P.aftShape === 'long-patience-aft' ? 1.22 : 1.12);
      var aftIceSpan = aftSpan * aftIceExt;
      var aftIceGeo = buildRevolvedGeometry(T, 84, 76, function (s, phi, out) {
        var jag = 0.50 * Math.sin(phi * 5 - ph1) + 0.32 * Math.cos(phi * 9 + ph2) + 0.18 * Math.sin(phi * 15 - ph3);
        var oblique = asym * (0.26 * Math.cos(phi + 0.42 + ph1 * 0.35) + 0.13 * Math.sin(2 * phi - 0.85 + ph2 * 0.25));
        var tongue = (0.09 * asym + 0.08 * P.skirtJagged) * (0.55 * Math.sin(phi * 3 - ph1) + 0.30 * Math.cos(phi * 6 + ph2));
        var tStartPhi = clamp(uIceStart + aftStartMin + asym * 0.16 + oblique + P.skirtJagged * 0.070 * jag + tongue, aftStartMin, 0.86);
        var sProg = 1 - (1 - s) * (1 - s);
        var uStartSpan = tStartPhi / aftIceExt;
        var uIce = lerp(uStartSpan, 1.0, sProg);
        var xPos = seamX - uIce * aftIceSpan - s * s * (0.004 + thickBase * 0.45);
        var tHull = clamp((seamX - xPos) / Math.max(0.1, aftSpan), 0, 1.0);
        var rMetal = isTwinRam
          ? evalHullRadius(shared, P.hullShape, P.hullCurve, tHull, phi) * (1 + 0.055 * asym * Math.cos(phi - 0.52) * Math.sin(tHull * Math.PI))
          : evalAftRadius(shared, P.aftShape, P.greebles, tHull, phi) * (1 + 0.04 * asym * Math.cos(phi - 0.52) * Math.sin(tHull * Math.PI));

        // Close aft ice lance smoothly to a rounded/pointed cometary apex over any blunt metal tail
        var closeStart = isTwinRam ? 0.84 : 0.62;
        var closeFrac = clamp((s - closeStart) / (1.0 - closeStart), 0, 1);
        var tipClosure = Math.max(0.008, 1.0 - Math.pow(closeFrac, isTwinRam ? 1.55 : 1.45) * 0.992);

        var skirtStep = Math.pow(Math.min(1.0, s * 7.5), 0.72);
        var tipTaper = 1.0 - Math.pow(s, 2.75);
        var phAsym = phi - asym * 0.40 * Math.sin(tHull * Math.PI);
        var flute = 0.55 * Math.sin(phAsym * 4 + s * 6.0 - ph1) + 0.30 * Math.cos(phAsym * 7 - s * 9.5 - ph2) + 0.15 * Math.sin(phAsym * 12 + s * 14.0 - ph3);
        var relief = sTex > 0.02 ? evalIceSurfaceRelief(tHull, phi, sTex, gNorm.seed + 7919, aftCraters) : { disp: 0, shade: 1.0 };
        var bodyEnv = Math.sin(Math.min(1.0, s) * Math.PI);
        var aftBaseThick = Math.max(thickBase, (isTwinRam ? 0.04 : 0.10) * girthScale);
        var rawDR = aftBaseThick * lerp(0.16, 1.04, skirtStep) * tipTaper * (1 + aftCragAmp * flute) +
          relief.disp * (0.35 + 0.65 * bodyEnv) * skirtStep * tipTaper * girthScale;
        var minSafeDR = (isTwinRam ? 0.018 : 0.065) * girthScale * skirtStep * tipTaper;
        var dR = Math.max(minSafeDR, rawDR);

        out.x = xPos;
        out.y = (rySeam * rMetal * tipClosure + dR) * Math.cos(phi);
        out.z = (rzSeam * rMetal * tipClosure + dR) * Math.sin(phi);

        var edgeFrost = s < 0.05 ? lerp(1.12, 1.0, s / 0.05) : 1.0;
        var ridgeBright = clamp(0.5 + 0.5 * flute, 0, 1);
        var cryoR = lerp(0.76, 0.97, ridgeBright) * relief.shade * edgeFrost;
        var cryoG = lerp(0.90, 0.99, ridgeBright) * relief.shade * edgeFrost;
        var cryoB = lerp(0.97, 1.00, ridgeBright) * lerp(1.0, relief.shade, 0.55) * edgeFrost;
        var obsR = lerp(0.16, 0.92, Math.pow(s, 1.45)) * relief.shade;
        var obsG = lerp(0.14, 0.20, Math.pow(s, 1.45)) * relief.shade;
        var obsB = lerp(0.22, 0.18, Math.pow(s, 1.45)) * relief.shade;
        out.r = clamp(lerp(cryoR, obsR, P.iceTint), 0.08, 1.0);
        out.g = clamp(lerp(cryoG, obsG, P.iceTint), 0.08, 1.0);
        out.b = clamp(lerp(cryoB, obsB, P.iceTint), 0.12, 1.0);
      }, true, true);

      var aftIceMat = trackMat(iceProcMat.clone());
      aftIceMat.userData = Object.assign({}, iceProcMat.userData || {});
      aftIceMeshRef = new T.Mesh(aftIceGeo, aftIceMat);
      aftIceMeshRef.name = 'Aft_Ice_Shield';
      aftIceMeshRef.renderOrder = 3;
      aftIceMeshRef.visible = !opts.hideIce;
      rootGroup.add(aftIceMeshRef);
    }

    // -- 4. CANONICAL KEEPOUTS + GREEBLING + ARCHITECTURAL SHUTTLE/ACCESS/WEAPONS PORTS -------
    var archAngles = computeArchAngles(P);
    var rollAngles = archAngles.rollAngles;
    var finAngles = archAngles.finAngles;
    // Pre-compute rolling spin-ring station & outer clearance envelope so engines, pylons, fins,
    // greebles, and style kits NEVER clip the rolling habitat ring or its stationary rail track!
    var spinRingT = P.habRing ? (hasAftIce ? 0.16 : 0.66) : -1;
    var spinRingX = P.habRing ? (seamX - aftSpan * spinRingT) : 0;
    var spinTrackR = 0;
    var spinRingR = 0;
    var spinRingOuterR = 0;
    if (P.habRing) {
      var rySR = rySeam * (isTwinRam ? evalHullRadius(shared, P.hullShape, P.hullCurve, spinRingT, 0) : evalAftRadius(shared, P.aftShape, P.greebles, spinRingT, 0));
      var rzSR = rzSeam * (isTwinRam ? evalHullRadius(shared, P.hullShape, P.hullCurve, spinRingT, Math.PI * 0.5) : evalAftRadius(shared, P.aftShape, P.greebles, spinRingT, Math.PI * 0.5));
      var boomPadSR = (!isTwinRam && P.aftShape === 'twin-boom') ? (rzSeam * 0.24) : 0;
      spinTrackR = Math.max(rySR, rzSR) + boomPadSR + 0.22 * girthScale;
      spinRingR = spinTrackR + 0.50 * girthScale;
      spinRingOuterR = spinRingR + 0.24 * girthScale;
    }

    var blockedZones = [];
    var podHw = rollAngles.length >= 6 ? 0.22 : 0.30;
    var sculptSparStance = (P.podStyle === 'conjoiner-spike' && P.aftShape !== 'long-patience-aft' && (styleWeights.gothic > 0.30 || styleWeights.dune > 0.30 || styleWeights.cathedral > 0.30));
    var habPylonShiftT = (P.habRing && hasAftIce) ? 0.44 : 0;
    var podTMin = P.habRing && hasAftIce ? 0.28 : (P.podStyle === 'canted-bell' ? 0.16 : (sculptSparStance ? 0.30 : 0.02));
    var podTMax = P.habRing && hasAftIce ? 0.72 : (P.podStyle === 'canted-bell' ? 0.58 : (sculptSparStance ? 0.64 : (P.podStyle === 'annular-shroud' ? 0.46 : 0.58)));
    rollAngles.forEach(function (rPhi) {
      blockedZones.push({ phi: wrapAngleRad(rPhi + Math.PI * 0.5), tMin: podTMin, tMax: podTMax, hw: podHw });
    });
    if (P.habRing) {
      // Reserve full 360-degree circumferential band around the mechanical rolling track bay
      blockedZones.push({ phi: 0, tMin: Math.max(0.02, spinRingT - 0.09), tMax: Math.min(0.95, spinRingT + 0.09), hw: Math.PI + 0.1 });
    }
    var finHw = finAngles.length >= 4 ? 0.12 : 0.18;
    var finKeepMin = (P.habRing && hasAftIce) ? 0.30 : 0.06;
    var finKeepMax = (P.habRing && !hasAftIce) ? 0.54 : 0.68;
    finAngles.forEach(function (fPhi) {
      blockedZones.push({ phi: wrapAngleRad(fPhi), tMin: finKeepMin, tMax: finKeepMax, hw: finHw });
    });
    if (!isTwinRam && P.aftShape === 'twin-boom') {
      blockedZones.push({ phi: Math.PI * 0.5, tMin: 0.02, tMax: 0.96, hw: 0.38 });
      blockedZones.push({ phi: -Math.PI * 0.5, tMin: 0.02, tMax: 0.96, hw: 0.38 });
    } else if (!isTwinRam && P.aftShape === 'gothic-bastion' && styleWeights.gothic <= 0.25 && styleWeights.cathedral <= 0.25) {
      for (var bi = 0; bi < 8; bi++) {
        blockedZones.push({ phi: wrapAngleRad((bi * Math.PI) / 4), tMin: 0.03, tMax: 0.96, hw: 0.14 });
      }
    } else if (!isTwinRam && P.aftShape === 'long-patience-aft') {
      blockedZones.push({ phi: Math.PI * 0.5, tMin: 0.42, tMax: 0.84, hw: 0.30 });
      blockedZones.push({ phi: -Math.PI * 0.5, tMin: 0.42, tMax: 0.84, hw: 0.30 });
    }
    var keepout = makeKeepoutHelper(blockedZones);

    var helperMats = {
      hull: procHullMat,
      dark: darkMat,
      trim: trimMat,
      cryo: cryoMat,
      obsidian: obsidianMat,
      amberLight: amberLightMat,
      cyanGlow: cyanGlowMat,
      rad: radiatorMat
    };
    var aftGreebleMin = clamp((collarW * 0.76) / Math.max(1, aftSpan), 0.07, 0.24);
    var foreGreebleMin = clamp((collarW * 0.44) / Math.max(1, fwdSpan), 0.04, 0.14);
    function evalForeBareEnd(phi) {
      if (!icePresent) return 0.90;
      if (P.hullShape === 'long-patience') {
        var asymCut = asym > 0.02 ? clamp(asym * (0.16 + 0.22 * Math.cos(phi - 0.55 - ph1 * 0.4) + 0.09 * Math.sin(3 * phi + ph2)), 0, 0.42) : 0;
        return clamp(uIceStart + asymCut - 0.035 - 0.045 * P.skirtJagged, 0.0, 0.88);
      }
      var jag = 0.50 * Math.sin(phi * 5 + ph1) + 0.32 * Math.cos(phi * 9 - ph2) + 0.18 * Math.sin(phi * 15 + ph3);
      var oblique = asym * (0.28 * Math.cos(phi - 0.55 - ph1 * 0.4) + 0.14 * Math.sin(2 * phi + 0.95 - ph2 * 0.3));
      var tongue = (0.10 * asym + 0.08 * P.skirtJagged) * (0.55 * Math.sin(phi * 3 + ph1) + 0.30 * Math.cos(phi * 6 - ph2) + 0.15 * Math.sin(phi * 11 + ph3));
      return clamp(uIceStart + asym * 0.18 + oblique + P.skirtJagged * 0.070 * jag + tongue - 0.04, 0.0, 0.86);
    }
    function evalAftBareEnd(phi) {
      if (!(hasAftIce && icePresent)) return 0.86;
      var jag = 0.50 * Math.sin(phi * 5 - ph1) + 0.32 * Math.cos(phi * 9 + ph2) + 0.18 * Math.sin(phi * 15 - ph3);
      var oblique = asym * (0.26 * Math.cos(phi + 0.42 + ph1 * 0.35) + 0.13 * Math.sin(2 * phi - 0.85 + ph2 * 0.25));
      var tongue = (0.09 * asym + 0.08 * P.skirtJagged) * (0.55 * Math.sin(phi * 3 - ph1) + 0.30 * Math.cos(phi * 6 + ph2));
      return clamp(uIceStart + aftCollarClear + asym * 0.16 + oblique + P.skirtJagged * 0.070 * jag + tongue - 0.045, 0.0, 0.78);
    }
    var foreGreebleLimit = 0, foreRingLimit = 1;
    var aftGreebleLimit = 0, aftRingLimit = 1;
    for (var gi = 0; gi < 16; gi++) {
      var phiG = (gi * Math.PI * 2) / 16;
      var fEnd = evalForeBareEnd(phiG);
      var aEnd = evalAftBareEnd(phiG);
      if (fEnd > foreGreebleLimit) foreGreebleLimit = fEnd;
      if (fEnd < foreRingLimit) foreRingLimit = fEnd;
      if (aEnd > aftGreebleLimit) aftGreebleLimit = aEnd;
      if (aEnd < aftRingLimit) aftRingLimit = aEnd;
    }
    if (aftGreebleLimit > aftGreebleMin + 0.06 || foreGreebleLimit > foreGreebleMin + 0.06) {
      rootGroup.add(buildHullGreebles(T, shared, P, rng, seamX, aftSpan, fwdSpan, rySeam, rzSeam, helperMats, keepout, {
        foreMin: foreGreebleMin,
        aftMin: aftGreebleMin,
        foreLimit: foreGreebleLimit,
        aftLimit: aftGreebleLimit,
        foreRingLimit: foreRingLimit,
        aftRingLimit: aftRingLimit,
        evalForeBareEnd: evalForeBareEnd,
        evalAftBareEnd: evalAftBareEnd,
        isTwinRam: isTwinRam,
        hullStyleKey: hullStyleKey,
        detailScale: (isCorridor ? 0.42 : 1.0) * greebleDetailMul
      }));
    }
    var shuttlePortGroup = buildShuttlePorts(T, shared, P, seamX, aftSpan, fwdSpan, rySeam, rzSeam, helperMats, keepout, {
      uIceStart: uIceStart,
      aftStartMin: aftCollarClear,
      collarW: collarW,
      thickBase: thickBase,
      foreMesh: iceMeshRef,
      aftMesh: aftIceMeshRef
    });
    rootGroup.add(shuttlePortGroup);

    // -- 4B. HULL HARDPOINTS: RCS vernier quad-blocks + coilgun / UV FEL / gamma-lance mounts ----
    var hardpointKit = null;
    if (!isCorridor) {
      hardpointKit = buildHullHardpoints(T, {
        shared: shared, P: P, seamX: seamX, fwdSpan: fwdSpan, aftSpan: aftSpan,
        rySeam: rySeam, rzSeam: rzSeam, isTwinRam: isTwinRam,
        collarW: collarW, collarScale: collarScale, keepout: keepout,
        evalForeBareEnd: evalForeBareEnd, evalAftBareEnd: evalAftBareEnd,
        trackMat: trackMat,
        mats: { hull: procHullMat, dark: darkMat, trim: trimMat, amberLight: amberLightMat }
      });
      rootGroup.add(hardpointKit.group);
    }
    var rcsJets = hardpointKit ? hardpointKit.jets : [];
    var rcsClock = -1;
    var weaponHardpoints = {
      rail: [], fel: [], lance: [], missile: [], pdc: [],
      railDirs: [], felDirs: [], lanceDirs: [], missileDirs: [], pdcDirs: []
    };
    if (hardpointKit) {
      ['rail', 'fel', 'lance', 'missile', 'pdc', 'railDirs', 'felDirs', 'lanceDirs', 'missileDirs', 'pdcDirs'].forEach(function (k) {
        weaponHardpoints[k] = hardpointKit.hardpoints[k].slice();
      });
    }
    var casemates = shuttlePortGroup.userData.casemateMuzzles || {};
    ['rail', 'fel'].forEach(function (k) {
      (casemates[k] || []).forEach(function (p, i) {
        weaponHardpoints[k].push(p.slice());
        weaponHardpoints[k + 'Dirs'].push(((casemates[k + 'Dirs'] || [])[i] || [1, 0, 0]).slice());
      });
    });
    var shuttlePortAnchors = (shuttlePortGroup.userData.portAnchors || []).map(function (a) {
      return { kind: a.kind, pos: a.pos.slice(), normal: a.normal.slice() };
    });
    if (!shuttlePortAnchors.length) {
      // No bays fitted: berth on the waist collar's ventral flanks (bare metal, clear of the weapons).
      [Math.PI * 0.75, -Math.PI * 0.75].forEach(function (phiA) {
        var cA = Math.cos(phiA), sA = Math.sin(phiA);
        var ay = rySeam * collarScale, az = rzSeam * collarScale;
        var nA = new T.Vector3(0, az * cA, ay * sA).normalize();
        shuttlePortAnchors.push({
          kind: 'collar',
          pos: [seamX - collarW * 0.15 + nA.x * 0.2, ay * cA + nA.y * 0.2, az * sA + nA.z * 0.2],
          normal: [nA.x, nA.y, nA.z]
        });
      });
    }

    // -- 5. PROPULSION NACELLE ARRAY (Automatic Reversible vs Flip & Burn architecture) --------
    // Single-bow-ice ('fore') vessels automatically fit bidirectional REVERSIBLE Conjoiner drives
    // (forward deceleration bell + aft acceleration bell) to keep the bow ice aimed into the ISM.
    // Bi-cone / twin-ram vessels fit unidirectional high-expansion aft-only Flip & Burn engines.
    // holder.rotation.x = phiRot rotates local +Z to (0, -sin(phiRot), cos(phiRot))
    // In evalAftPoint convention (phi = 0 is +Y dorsal, PI/2 is +Z starboard), pod azimuth is phiRot + PI/2
    var aftPodPush = (hasAftIce && icePresent) ? (thickBase * 1.15 + 0.36) : 0;
    var plumeR = (isCorridor ? 0.56 : 0.72) * nacScale;
    var pLenOut = 74 * plumeScale;
    var pLenCore = 94 * plumeScale;
    var plumeOuterGeo = new T.CylinderGeometry(plumeR, plumeR * (isCorridor ? 0.08 : 0.16), pLenOut, 24, 1, true);
    plumeOuterGeo.rotateZ(-Math.PI / 2);
    var plumeCoreGeo = new T.CylinderGeometry(plumeR * 0.46, plumeR * (isCorridor ? 0.04 : 0.08), pLenCore, 20, 1, true);
    plumeCoreGeo.rotateZ(-Math.PI / 2);
    var plumeFwdOuterGeo = new T.CylinderGeometry(plumeR * 0.92, plumeR * (isCorridor ? 0.08 : 0.16), pLenOut * 0.88, 24, 1, true);
    plumeFwdOuterGeo.rotateZ(Math.PI / 2);
    var plumeFwdCoreGeo = new T.CylinderGeometry(plumeR * 0.42, plumeR * (isCorridor ? 0.04 : 0.08), pLenCore * 0.88, 20, 1, true);
    plumeFwdCoreGeo.rotateZ(Math.PI / 2);

    var shroudRingT = -1;
    if (P.podStyle === 'conjoiner-spike' && shared.LH) {
      var basePodCenterZ = shared.LH.extras.nacelle_lateral_units * baseScale;
      var baseSeamR = shared.LH.extras.seam_radius_units * baseScale;
      var sparPushZ = sculptSparStance ? (2.15 * nacScale) : (P.aftShape !== 'long-patience-aft' ? 0.72 * nacScale : 0);
      var sparShiftX = (P.habRing && hasAftIce) ? (-aftSpan * habPylonShiftT) : (sculptSparStance ? (-aftSpan * 0.26) : 0);

      if (!useSculptedConjoiner && shared.podGroups.length) {
        // Pure authentic Long Patience DR.lighthugger Conjoiner spike nacelles (clean original mesh,
        // no floating attachments; forward braking plumes anchor cleanly at the forward inlet).
        var singlePodGeos = [];
        var maxPodForeX = -1e9;

        shared.podGroups.forEach(function (part) {
          var iq = part.index;
          var keepTris = [];
          for (var t = 0; t < iq.length; t += 3) {
            var i0 = iq[t], i1 = iq[t + 1], i2 = iq[t + 2];
            var cz = (part.az[i0] + part.az[i1] + part.az[i2]) / 3;
            if (cz >= 0) keepTris.push(i0, i1, i2);
          }
          if (!keepTris.length) return;

          var n = part.count;
          var pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
          for (var k = 0; k < n; k++) {
            var ax = part.ax[k], ay = part.ay[k], az = part.az[k];
            var rawX = baseScale * ax * nacScale;
            if (part.name === '08_Projecting_Intake_Centerbodies' && ax > 0) {
              rawX *= (0.94 + 0.36 * P.nacelleSize);
            }
            var rawY = baseScale * ay * nacScale;
            var rawZ = baseScale * az;
            var localZ = basePodCenterZ + (rawZ - basePodCenterZ) * nacScale;
            if (part.name === '04_Integrated_Pylons' && rawZ < basePodCenterZ - 0.3) {
              localZ = Math.max(-0.25, Math.min(localZ, rawZ * 0.68));
            }
            pos[3 * k] = seamX + rawX;
            pos[3 * k + 1] = rawY;
            pos[3 * k + 2] = localZ;
            if (pos[3 * k] > maxPodForeX) maxPodForeX = pos[3 * k];
            nrm[3 * k] = part.nx[k];
            nrm[3 * k + 1] = part.ny[k];
            nrm[3 * k + 2] = part.nz[k];
          }
          var geo = new T.BufferGeometry();
          geo.setAttribute('position', new T.BufferAttribute(pos, 3));
          geo.setAttribute('normal', new T.BufferAttribute(nrm, 3));
          geo.setAttribute('uv', new T.BufferAttribute(part.uv, 2));
          geo.setIndex(keepTris);
          geo.computeVertexNormals();

          var pMat =
            part.name === '08_Projecting_Intake_Centerbodies' ? spikeMat :
            part.name === '06_Open_Inlet_And_Exhaust_Rims' ? cowlHeatMat :
            part.name === '07_Through_Ducts' ? ductHeatMat :
            part.name === '04_Integrated_Pylons' ? darkMat : hullMat;

          singlePodGeos.push({ geo: geo, mat: pMat });
        });

        var lpExitX = seamX + shared.LH.extras.nacelle_exhaust_units * baseScale * nacScale;
        var lpForeX = isFinite(maxPodForeX) && maxPodForeX > seamX ? (maxPodForeX - 0.25 * nacScale) : (seamX + 4.1 * nacScale);

        rollAngles.forEach(function (phi) {
          var holder = new T.Group();
          holder.rotation.x = phi;
          var s = Math.sin(phi), c = Math.cos(phi);
          var hullRAtPhi = 1 / Math.sqrt((s * s) / (rySeam * rySeam) + (c * c) / (rzSeam * rzSeam));
          var podInner = new T.Group();
          podInner.position.z = (hullRAtPhi - baseSeamR) + (nacScale - 1) * 0.60 + aftPodPush;
          singlePodGeos.forEach(function (pg) {
            podInner.add(new T.Mesh(pg.geo, pg.mat));
          });
          if (aftPodPush > 0.04 || Math.abs(podInner.position.z) > 0.05 || P.arch !== 'twin-h') {
            var innerZ0 = Math.max(0.25, hullRAtPhi * 0.56);
            var outerZ0 = basePodCenterZ + podInner.position.z + 0.06 * nacScale;
            if (outerZ0 > innerZ0 + 0.14) {
              var pShape0 = new T.Shape();
              var midZ0 = lerp(innerZ0, outerZ0, 0.56);
              pShape0.moveTo(seamX - 0.96 * baseScale * nacScale, innerZ0);
              pShape0.quadraticCurveTo(seamX - 0.44 * baseScale * nacScale, midZ0, seamX - 0.42 * baseScale * nacScale, outerZ0);
              pShape0.lineTo(seamX + 0.42 * baseScale * nacScale, outerZ0);
              pShape0.quadraticCurveTo(seamX + 0.48 * baseScale * nacScale, midZ0, seamX + 0.94 * baseScale * nacScale, innerZ0);
              pShape0.closePath();
              if (cathApi) {
                holder.add(new T.Mesh(cathApi.buildPylonGeometry(styleCtx, {
                  cx: seamX,
                  zIn: innerZ0,
                  zTop: outerZ0,
                  zHull: hullRAtPhi * 0.94,
                  halfIn: 0.95 * baseScale * nacScale,
                  halfMid: 0.46 * baseScale * nacScale,
                  halfOut: 0.42 * baseScale * nacScale,
                  depth: 0.20 * nacScale,
                  rad: 0.075 * nacScale,
                  podR: 0.90 * nacScale
                }), darkMat));
              } else {
                var strutGeo0 = new T.ExtrudeGeometry(pShape0, { depth: 0.20 * nacScale, bevelEnabled: false });
                strutGeo0.rotateX(Math.PI * 0.5);
                strutGeo0.translate(0, 0.10 * nacScale, 0);
                holder.add(new T.Mesh(strutGeo0, darkMat));
              }
            }
          }
          var fmOuterLp = new T.Mesh(plumeFwdOuterGeo, plumeOuterMat);
          fmOuterLp.position.set(lpForeX + pLenOut * 0.44, 0, basePodCenterZ);
          fmOuterLp.visible = false;
          podInner.add(fmOuterLp);
          plumeMeshes.push({ mesh: fmOuterLp, len: pLenOut * 0.88, nozzleX: lpForeX, dir: 1 });
          var fmCoreLp = new T.Mesh(plumeFwdCoreGeo, plumeCoreMat);
          fmCoreLp.position.set(lpForeX + pLenCore * 0.44, 0, basePodCenterZ);
          fmCoreLp.visible = false;
          podInner.add(fmCoreLp);
          plumeMeshes.push({ mesh: fmCoreLp, len: pLenCore * 0.88, nozzleX: lpForeX, dir: 1 });

          var bmOuterLp = new T.Mesh(plumeOuterGeo, plumeOuterMat);
          bmOuterLp.position.set(lpExitX - pLenOut * 0.5, 0, basePodCenterZ);
          podInner.add(bmOuterLp);
          plumeMeshes.push({ mesh: bmOuterLp, len: pLenOut, nozzleX: lpExitX, dir: -1 });
          var bmCoreLp = new T.Mesh(plumeCoreGeo, plumeCoreMat);
          bmCoreLp.position.set(lpExitX - pLenCore * 0.5, 0, basePodCenterZ);
          podInner.add(bmCoreLp);
          plumeMeshes.push({ mesh: bmCoreLp, len: pLenCore, nozzleX: lpExitX, dir: -1 });
          holder.add(podInner);
          rootGroup.add(holder);
        });
      } else {
        // Unified monolithic sculpted Conjoiner drive nacelles (Reynolds sketch / Gothic / Dune):
        // Reversible mode features an integrated overhanging armored upper brow (+Z), sculpted cheek
        // V-notch (+-Y), stepped lower chin (-Z), beveled thick lip, and deep shadowed cavernous maw.
        // Flip & Burn mode features a seamless swept closed chisel spearhead prow + extended aft bell.
        var podLen = (10.6 + 1.0 * P.nacelleSize) * nacScale;
        var podR = 1.02 * nacScale;
        var xAft = seamX - podLen * 0.46;
        var xFore = seamX + podLen * 0.54;
        var fbAftExtLen = reversibleDrive ? 0 : (podLen * 0.18);

        function evalConjoinerCross(phi) {
          var c = Math.cos(phi), s = Math.sin(phi);
          var dorsalCrest = Math.exp(-Math.pow((1 - c) * 2.1, 2));
          var ventralKeel = Math.exp(-Math.pow((1 + c) * 2.5, 2));
          var octFacet = 1.0 + 0.052 * Math.cos(4 * phi) + 0.028 * Math.cos(2 * phi);
          return {
            c: c,
            s: s,
            rY: podR * 0.92 * octFacet,
            rZ: podR * (1.08 + 0.14 * dorsalCrest + 0.06 * ventralKeel) * octFacet
          };
        }

        function evalConjoinerLip(u, phi) {
          var cs = evalConjoinerCross(phi);
          var c = cs.c, s = cs.s;
          var groove1 = -0.044 * Math.exp(-Math.pow((u - 0.11) / 0.016, 2));
          var groove2 = -0.048 * Math.exp(-Math.pow((u - 0.22) / 0.018, 2));
          var waistFlute = -0.040 * Math.exp(-Math.pow((u - 0.53) / 0.022, 2));
          var collarBand = 0.050 * Math.exp(-Math.pow((u - 0.72) / 0.038, 2));
          var rEnv;
          var xPos = lerp(xAft, xFore, u);

          if (u < 0.06) {
            rEnv = lerp(0.80, 0.90, u / 0.06);
          } else if (u < 0.26) {
            rEnv = lerp(0.90, 0.95, (u - 0.06) / 0.20) + groove1 + groove2;
          } else if (u < 0.36) {
            var sh = (u - 0.26) / 0.10;
            rEnv = lerp(0.95, 1.06, sh * sh * (3 - 2 * sh));
          } else if (u < 0.70) {
            rEnv = lerp(1.06, 0.99, (u - 0.36) / 0.34) + waistFlute + collarBand;
          } else {
            var sF = clamp((u - 0.70) / 0.30, 0, 1);
            var sFSm = sF * sF * (3 - 2 * sF);
            if (reversibleDrive) {
              // Broad rugged overhanging brow visor (+Z), sculpted recessed cheek jaw, stepped lower chin (-Z)
              var browBand = Math.pow(clamp(c * 1.45, 0, 1), 0.68);
              var chinBand = Math.pow(clamp(-c * 1.35, 0, 1), 0.76);
              var cheekNotch = Math.pow(s * s, 1.35);
              rEnv = lerp(0.99, 1.06, Math.sin(sF * Math.PI * 0.62)) - 0.045 * sF * sF + 0.055 * browBand * sFSm + collarBand;
              xPos += podLen * Math.pow(sF, 1.18) * (0.135 * browBand + 0.048 * chinBand - 0.068 * cheekNotch);
            } else {
              // Flip & Burn closed chiseled ogive spearhead prow (closes cleanly to 0.002 around pod axis)
              var prowClose = sF >= 0.999 ? 0.002 : Math.max(0.002, Math.pow(Math.max(0, 1 - sF), 0.68));
              rEnv = 1.02 * prowClose + collarBand * (1 - sF);
              xPos += podLen * 0.25 * sFSm;
            }
          }
          // Subtle longitudinal armor panel ribs along mid-casing
          var midMask = Math.sin(clamp((u - 0.24) / 0.56, 0, 1) * Math.PI);
          var panelRib = 0.024 * midMask * Math.pow(Math.max(0, Math.cos(6 * phi)), 4);
          rEnv = Math.max(0.002, rEnv + panelRib);
          return {
            x: xPos,
            rY: cs.rY * rEnv,
            rZ: cs.rZ * rEnv,
            c: c,
            s: s
          };
        }

        // 1. Main monolithic outer nacelle shell (capEnd=false so off-axis Flip&Burn prow never draws to z=0!)
        var outerShellGeo = buildRevolvedGeometry(T, 48, 44, function (u, phi, out) {
          var p = evalConjoinerLip(u, phi);
          out.x = p.x;
          out.y = -p.rY * p.s;
          out.z = basePodCenterZ + p.rZ * p.c;
        }, false, false);

        // 2. Deeply recessed dark aft exhaust throat + thick beveled rear collar (inward normals)
        var xAftDeep = xAft + podLen * 0.22;
        var innerAftGeo = buildRevolvedGeometry(T, 12, 36, function (u, phi, out) {
          var lip = evalConjoinerLip(0, phi);
          var xPos, rK;
          if (u < 0.14) {
            var b = u / 0.14;
            xPos = lerp(lip.x, lip.x + podLen * 0.025, b);
            rK = lerp(1.00, 0.80, b);
          } else {
            var tIn = (u - 0.14) / 0.86;
            xPos = lerp(lip.x + podLen * 0.025, xAftDeep, tIn);
            rK = lerp(0.80, 0.34, tIn * tIn * 0.65 + tIn * 0.35);
          }
          out.x = xPos;
          out.y = lip.rY * rK * lip.s;
          out.z = basePodCenterZ + lip.rZ * rK * lip.c;
        }, false, false);

        var aftBulkheadGeo = new T.CircleGeometry(podR * 0.42, 20);
        aftBulkheadGeo.rotateY(-Math.PI * 0.5);
        var aftCoreGeo = new T.ConeGeometry(podR * 0.32, podLen * 0.16, 18);
        aftCoreGeo.rotateZ(Math.PI * 0.5);
        var aftGlowRingGeo = new T.TorusGeometry(podR * 0.50, 0.055 * nacScale, 8, 24);
        aftGlowRingGeo.rotateY(Math.PI * 0.5);

        // 3. Reversible rolled-bevel forward maw rim (hullMat) + deep cavernous throat (obsidianMat) OR Flip & Burn aft bell
        var mawBevelLipGeo = null;
        var innerMawGeo = null;
        var fwdBulkheadGeo = null;
        var fwdCoreGeo = null;
        var fwdGlowRingGeo = null;
        var mawBaffleGeo = null;
        var fbBellShellGeo = null;
        var fbBellInnerGeo = null;
        var xMawDeep = xFore - podLen * 0.30;

        if (reversibleDrive) {
          // Rolled armored cowl bezel in hullMat: u=0 outer lip -> u=0.45 front nose -> u=1 inner lip (forward=true, 100% outward normals)
          mawBevelLipGeo = buildRevolvedGeometry(T, 8, 44, function (u, phi, out) {
            var lip = evalConjoinerLip(1.0, phi);
            var ang = u * Math.PI;
            var rK = lerp(1.00, 0.78, u);
            var xPos = lip.x + Math.sin(ang) * podLen * 0.022 + u * podLen * 0.004;
            out.x = xPos;
            out.y = -lip.rY * rK * lip.s;
            out.z = basePodCenterZ + lip.rZ * rK * lip.c;
          }, false, false);
          innerMawGeo = buildRevolvedGeometry(T, 16, 44, function (u, phi, out) {
            var lip = evalConjoinerLip(1.0, phi);
            var tEase = u * u * (3 - 2 * u);
            var xPos = lerp(xMawDeep, lip.x + podLen * 0.004, u);
            var rK = lerp(0.36, 0.78, tEase);
            out.x = xPos;
            out.y = lip.rY * rK * lip.s;
            out.z = basePodCenterZ + lip.rZ * rK * lip.c;
          }, false, false);
          fwdBulkheadGeo = new T.CircleGeometry(podR * 0.44, 20);
          fwdBulkheadGeo.rotateY(Math.PI * 0.5);
          fwdCoreGeo = new T.ConeGeometry(podR * 0.28, podLen * 0.15, 16);
          fwdCoreGeo.rotateZ(-Math.PI * 0.5);
          fwdGlowRingGeo = new T.TorusGeometry(podR * 0.44, 0.048 * nacScale, 8, 24);
          fwdGlowRingGeo.rotateY(Math.PI * 0.5);
          mawBaffleGeo = new T.BoxGeometry(podLen * 0.18, 0.075 * nacScale, 0.20 * nacScale);
        } else {
          // Flip & Burn flared high-expansion aft nozzle shroud (seamless extension behind xAft)
          fbBellShellGeo = buildRevolvedGeometry(T, 14, 36, function (u, phi, out) {
            var lip = evalConjoinerLip(0, phi);
            var flare = lerp(1.24, 0.96, Math.pow(u, 0.78));
            out.x = lerp(xAft - fbAftExtLen, xAft + podLen * 0.04, u);
            out.y = -lip.rY * flare * lip.s;
            out.z = basePodCenterZ + lip.rZ * flare * lip.c;
          }, false, false);
          fbBellInnerGeo = buildRevolvedGeometry(T, 10, 36, function (u, phi, out) {
            var lip = evalConjoinerLip(0, phi);
            var flare = lerp(1.14, 0.82, Math.pow(u, 0.75));
            out.x = lerp(xAft - fbAftExtLen, xAft + podLen * 0.02, u);
            out.y = lip.rY * flare * lip.s;
            out.z = basePodCenterZ + lip.rZ * flare * lip.c;
          }, false, false);
        }

        // 4. Sculpted monolithic exterior armor spine, carved flank cheek plates, and recessed cooling ribs
        var spineShape = new T.Shape();
        spineShape.moveTo(xAft + podLen * 0.24, basePodCenterZ + podR * 0.92);
        spineShape.lineTo(xAft + podLen * 0.34, basePodCenterZ + podR * 1.34);
        spineShape.lineTo(xFore - podLen * (reversibleDrive ? 0.02 : 0.14), basePodCenterZ + podR * (reversibleDrive ? 1.30 : 1.08));
        spineShape.lineTo(xFore + podLen * (reversibleDrive ? 0.11 : 0.04), basePodCenterZ + podR * (reversibleDrive ? 1.12 : 0.56));
        spineShape.lineTo(xFore - podLen * 0.10, basePodCenterZ + podR * 0.88);
        spineShape.closePath();
        var dorsalSpineGeo = new T.ExtrudeGeometry(spineShape, { depth: 0.36 * nacScale, bevelEnabled: false });
        dorsalSpineGeo.rotateX(Math.PI * 0.5);
        dorsalSpineGeo.translate(0, 0.18 * nacScale, 0);

        var flankPlateGeo = new T.BoxGeometry(podLen * 0.42, 0.18 * nacScale, 0.52 * nacScale);
        var flankSlotGeo = new T.BoxGeometry(podLen * 0.34, 0.21 * nacScale, 0.12 * nacScale);
        var aftBandGeo = new T.CylinderGeometry(podR * 0.98, podR * 0.94, podLen * 0.055, 24);
        aftBandGeo.rotateZ(-Math.PI * 0.5);
        var trimSpineGeo = new T.BoxGeometry(podLen * 0.56, 0.09 * nacScale, 0.09 * nacScale);

        var aftNozSculptX = xAft - fbAftExtLen + podLen * 0.04;
        // Seat forward deceleration plume cleanly inside the open forward maw ahead of fwdCore (zero burn-through!)
        var fwdNozSculptX = xFore - podLen * 0.14;

        // Gothic bell-tower shroud (ribs, cloister-arcade tracery frames, stained-glass slits, spire crown) built
        // once from the exact casing profile and shared by every nacelle; exhaust apertures stay unobstructed.
        var cathShroud = cathApi ? cathApi.buildNacelleShroud(styleCtx, {
          lip: evalConjoinerLip,
          centerZ: basePodCenterZ,
          podLen: podLen,
          podR: podR,
          mats: { stone: hullMat, trim: trimMat }
        }) : null;

        rollAngles.forEach(function (phi) {
          var holder = new T.Group();
          holder.rotation.x = phi;
          var s = Math.sin(phi), c = Math.cos(phi);
          var hullRAtPhi = 1 / Math.sqrt((s * s) / (rySeam * rySeam) + (c * c) / (rzSeam * rzSeam));
          // Enforce strict radial clearance past hull, fore/aft ice, twin side booms, and rolling spin ring!
          var azPod = wrapAngleRad(phi + Math.PI * 0.5);
          var boomClear = (!isTwinRam && P.aftShape === 'twin-boom' && Math.min(angDistRad(azPod, Math.PI * 0.5), angDistRad(azPod, -Math.PI * 0.5)) < 0.65)
            ? (rzSeam * 0.94 + podR * 1.25)
            : 0;
          var iceClear = icePresent ? (hullRAtPhi + thickBase * 1.15 + podR * 1.28) : (hullRAtPhi + podR * 1.22);
          var ringClear = P.habRing ? (spinRingOuterR + podR * 1.32 + 0.36) : 0;
          var minPodCenterZ = Math.max(iceClear, boomClear, ringClear);
          var defaultPodZ = basePodCenterZ + (hullRAtPhi - baseSeamR) + (nacScale - 1) * 0.60 + aftPodPush + sparPushZ;
          var targetPodCenterZ = Math.max(defaultPodZ, minPodCenterZ);
          var podInner = new T.Group();
          podInner.position.x = sparShiftX;
          podInner.position.z = targetPodCenterZ - basePodCenterZ;

          podInner.add(new T.Mesh(outerShellGeo, hullMat));
          podInner.add(new T.Mesh(innerAftGeo, obsidianMat));
          var ab = new T.Mesh(aftBulkheadGeo, obsidianMat);
          ab.position.set(xAftDeep - 0.02 * nacScale, 0, basePodCenterZ);
          podInner.add(ab);
          var ac = new T.Mesh(aftCoreGeo, cowlHeatMat);
          ac.position.set(xAftDeep - podLen * 0.05, 0, basePodCenterZ);
          podInner.add(ac);
          var agr = new T.Mesh(aftGlowRingGeo, ductHeatMat);
          agr.position.set(xAft + podLen * 0.10, 0, basePodCenterZ);
          podInner.add(agr);

          podInner.add(new T.Mesh(dorsalSpineGeo, hullMat));
          if (cathShroud) podInner.add(cathShroud.makeGroup());
          if (styleWeights.gothic > 0.25 || styleWeights.sleek > 0.25 || styleWeights.cathedral > 0.25) {
            var tr = new T.Mesh(trimSpineGeo, trimMat);
            tr.position.set(seamX + podLen * 0.12, 0, basePodCenterZ + podR * 1.32);
            podInner.add(tr);
          }
          // Monolithic hull-material cheek armor plates with recessed dark heat-radiator louvers
          [-1, 1].forEach(function (sideY) {
            var plate = new T.Mesh(flankPlateGeo, hullMat);
            plate.position.set(seamX + podLen * 0.04, sideY * podR * 0.90, basePodCenterZ + podR * 0.04);
            podInner.add(plate);
            var slot = new T.Mesh(flankSlotGeo, darkMat);
            slot.position.set(seamX + podLen * 0.04, sideY * podR * 0.91, basePodCenterZ + podR * 0.04);
            podInner.add(slot);
          });
          var aftBand = new T.Mesh(aftBandGeo, darkMat);
          aftBand.position.set(xAft + podLen * 0.17, 0, basePodCenterZ);
          podInner.add(aftBand);

          if (reversibleDrive) {
            podInner.add(new T.Mesh(mawBevelLipGeo, hullMat));
            podInner.add(new T.Mesh(innerMawGeo, obsidianMat));
            var fb = new T.Mesh(fwdBulkheadGeo, obsidianMat);
            fb.position.set(xMawDeep + 0.02 * nacScale, 0, basePodCenterZ);
            podInner.add(fb);
            var fc = new T.Mesh(fwdCoreGeo, revCowlHeatMat);
            fc.position.set(xMawDeep + podLen * 0.06, 0, basePodCenterZ);
            podInner.add(fc);
            var fgr = new T.Mesh(fwdGlowRingGeo, revCowlHeatMat);
            fgr.position.set(xMawDeep + podLen * 0.11, 0, basePodCenterZ);
            podInner.add(fgr);
            // Internal recessed intake guide vanes tucked cleanly inside upper brow and lower chin
            [-0.32, 0, 0.32].forEach(function (vy) {
              var topVane = new T.Mesh(mawBaffleGeo, darkMat);
              topVane.position.set(xMawDeep + podLen * 0.13, vy * podR, basePodCenterZ + podR * 0.64);
              podInner.add(topVane);
              var botVane = new T.Mesh(mawBaffleGeo, darkMat);
              botVane.position.set(xMawDeep + podLen * 0.12, vy * podR, basePodCenterZ - podR * 0.58);
              podInner.add(botVane);
            });
            var fmOuterS = new T.Mesh(plumeFwdOuterGeo, plumeOuterMat);
            fmOuterS.position.set(fwdNozSculptX + pLenOut * 0.44, 0, basePodCenterZ);
            fmOuterS.visible = false;
            podInner.add(fmOuterS);
            plumeMeshes.push({ mesh: fmOuterS, len: pLenOut * 0.88, nozzleX: fwdNozSculptX, dir: 1 });
            var fmCoreS = new T.Mesh(plumeFwdCoreGeo, plumeCoreMat);
            fmCoreS.position.set(fwdNozSculptX + pLenCore * 0.44, 0, basePodCenterZ);
            fmCoreS.visible = false;
            podInner.add(fmCoreS);
            plumeMeshes.push({ mesh: fmCoreS, len: pLenCore * 0.88, nozzleX: fwdNozSculptX, dir: 1 });
          } else {
            podInner.add(new T.Mesh(fbBellShellGeo, darkMat));
            podInner.add(new T.Mesh(fbBellInnerGeo, obsidianMat));
          }

          // Slender swept Reynolds-style engine spar with curved hull-root fillet & nacelle saddle fairing
          var innerZ = Math.max(0.25, hullRAtPhi * 0.54);
          var outerZ = basePodCenterZ + podInner.position.z - podR * 0.36;
          if (outerZ > innerZ + 0.14) {
            var sparX = seamX + sparShiftX;
            var pShapeC = new T.Shape();
            var chordIn = (sculptSparStance ? 1.68 : 1.24) * baseScale * nacScale;
            var chordMid = (sculptSparStance ? 0.44 : 0.62) * baseScale * nacScale;
            var chordOut = (sculptSparStance ? 1.05 : 0.92) * baseScale * nacScale;
            var midZ = lerp(innerZ, outerZ, 0.54);
            pShapeC.moveTo(sparX - chordIn * 0.88, innerZ);
            pShapeC.quadraticCurveTo(sparX - chordMid * 0.68, midZ, sparX - chordOut * 0.82, outerZ + podR * 0.25);
            pShapeC.lineTo(sparX + chordOut * 0.82, outerZ + podR * 0.25);
            pShapeC.quadraticCurveTo(sparX + chordMid * 0.72, midZ, sparX + chordIn * 0.86, innerZ);
            pShapeC.closePath();
            if (cathApi) {
              // Skeletal Gothic flying-buttress arch strut: pointed ogival openings, oculi and carved ribs
              var tPylCath = clamp((seamX - sparX) / Math.max(1, aftSpan), 0, 0.9);
              var rNormPylCath = evalAftRadius(shared, P.aftShape, P.greebles, clamp(tPylCath - 0.06, 0, 1), wrapAngleRad(phi + Math.PI * 0.5));
              holder.add(new T.Mesh(cathApi.buildPylonGeometry(styleCtx, {
                cx: sparX,
                zIn: innerZ,
                zTop: outerZ + podR * 0.25,
                zPodInner: targetPodCenterZ - podR * 0.94,
                zHull: hullRAtPhi * Math.max(0.5, rNormPylCath) + 0.04 * nacScale,
                halfIn: chordIn * 0.87,
                halfMid: chordMid * 0.70,
                halfOut: chordOut * 0.82,
                depth: (sculptSparStance ? 0.20 : 0.24) * nacScale,
                rad: 0.075 * nacScale,
                podR: podR
              }), hullMat));
            } else {
              var strutGeo = new T.ExtrudeGeometry(pShapeC, { depth: (sculptSparStance ? 0.20 : 0.24) * nacScale, bevelEnabled: false });
              strutGeo.rotateX(Math.PI * 0.5);
              strutGeo.translate(0, (sculptSparStance ? 0.10 : 0.12) * nacScale, 0);
              holder.add(new T.Mesh(strutGeo, hullMat));

              var ribThick = (sculptSparStance ? 0.10 : 0.12) * nacScale;
              var spanBridge = outerZ - innerZ;
              var armorSpine = new T.Mesh(new T.BoxGeometry(chordMid * 0.52, ribThick, spanBridge), darkMat);
              armorSpine.position.set(sparX, 0, innerZ + spanBridge * 0.5);
              holder.add(armorSpine);
            }
          }

          var bmOuterS = new T.Mesh(plumeOuterGeo, plumeOuterMat);
          bmOuterS.position.set(aftNozSculptX - pLenOut * 0.5, 0, basePodCenterZ);
          podInner.add(bmOuterS);
          plumeMeshes.push({ mesh: bmOuterS, len: pLenOut, nozzleX: aftNozSculptX, dir: -1 });
          var bmCoreS = new T.Mesh(plumeCoreGeo, plumeCoreMat);
          bmCoreS.position.set(aftNozSculptX - pLenCore * 0.5, 0, basePodCenterZ);
          podInner.add(bmCoreS);
          plumeMeshes.push({ mesh: bmCoreS, len: pLenCore, nozzleX: aftNozSculptX, dir: -1 });
          holder.add(podInner);
          rootGroup.add(holder);
        });
      }
    } else {
      var mountT = (P.habRing && hasAftIce) ? 0.44 : (P.podStyle === 'canted-bell' ? 0.36 : 0.16);
      var mountX = seamX - aftSpan * mountT;
      var podLen = (P.podStyle === 'canted-bell' ? 6.4 : 8.6) * nacScale;
      var podR = (P.podStyle === 'canted-bell' ? 0.68 : 0.86) * nacScale;
      var aftBellMult = reversibleDrive ? 1.0 : 1.28;

      // CylinderGeometry(radiusTop, radiusBottom): rotateZ(-PI/2) puts radiusTop at +X (FORE) and radiusBottom at -X (AFT)!
      var cowlingGeo = new T.CylinderGeometry(podR * (reversibleDrive ? 0.62 : 0.44), podR * 0.72, podLen * 0.44, 24);
      cowlingGeo.rotateZ(-Math.PI * 0.5);
      var waistGeo = new T.CylinderGeometry(podR * 0.72, podR * 0.56, podLen * 0.14, 24);
      waistGeo.rotateZ(-Math.PI * 0.5);
      var bellGeo = new T.CylinderGeometry(podR * 0.56, podR * (1.08 * (reversibleDrive ? 1.0 : 1.12)), podLen * 0.50 * aftBellMult, 24, 1, true);
      bellGeo.rotateZ(-Math.PI * 0.5);
      var fwdBellGeo = new T.CylinderGeometry(podR * 1.02, podR * 0.56, podLen * 0.42, 24, 1, true);
      fwdBellGeo.rotateZ(-Math.PI * 0.5);
      var innerChamberGeo = new T.ConeGeometry(podR * 0.54, podLen * 0.44, 20);
      innerChamberGeo.rotateZ(Math.PI * 0.5);
      var pinchCoreGeo = new T.ConeGeometry(podR * 0.24, podLen * 0.48, 16);
      pinchCoreGeo.rotateZ(Math.PI * 0.5);
      var fwdPinchGeo = new T.ConeGeometry(podR * 0.24, podLen * 0.38, 16);
      fwdPinchGeo.rotateZ(-Math.PI * 0.5);
      var noseConeGeo = new T.ConeGeometry(podR * 0.44, podLen * 0.30, 24);
      noseConeGeo.rotateZ(-Math.PI * 0.5);

      var cathShroudFallback = cathApi ? cathApi.buildNacelleShroud(styleCtx, {
        lip: function (u, phi) {
          var xLocal = lerp(-podLen * 0.16, podLen * 0.40, u);
          var rFrac = u < 0.25 ? lerp(0.62, 0.74, u / 0.25) : lerp(0.74, reversibleDrive ? 0.66 : 0.50, (u - 0.25) / 0.75);
          var rRad = podR * rFrac;
          return { x: xLocal, rY: rRad, rZ: rRad, c: Math.cos(phi), s: Math.sin(phi) };
        },
        centerZ: 0,
        podLen: podLen * 0.62,
        podR: podR * 0.74,
        mats: { stone: hullMat, trim: trimMat }
      }) : null;

      var maxPodRad = 0;
      rollAngles.forEach(function (phi) {
        var holder = new T.Group();
        holder.rotation.x = phi;
        var s = Math.sin(phi), c = Math.cos(phi);
        var rNorm = isTwinRam
          ? evalHullRadius(shared, P.hullShape, P.hullCurve, mountT, Math.PI * 0.5 + phi)
          : evalAftRadius(shared, P.aftShape, P.greebles, mountT, Math.PI * 0.5 + phi);
        var ryLocal = rySeam * rNorm, rzLocal = rzSeam * rNorm;
        var hullR = 1 / Math.sqrt((s * s) / Math.max(0.04, ryLocal * ryLocal) + (c * c) / Math.max(0.04, rzLocal * rzLocal));
        var hullSeamR = 1 / Math.sqrt((s * s) / (rySeam * rySeam) + (c * c) / (rzSeam * rzSeam));
        var azPod2 = wrapAngleRad(phi + Math.PI * 0.5);
        var boomClear2 = (!isTwinRam && P.aftShape === 'twin-boom' && Math.min(angDistRad(azPod2, Math.PI * 0.5), angDistRad(azPod2, -Math.PI * 0.5)) < 0.65)
          ? (rzSeam * 0.94 + podR * 1.25)
          : 0;
        var ringClear2 = P.habRing ? (spinRingOuterR + podR * 1.32 + 0.36) : 0;
        var seamClear2 = (mountX + podLen * 0.5 > seamX - 1.0) ? (hullSeamR + (icePresent ? thickBase * 1.15 : 0) + podR * 1.25) : 0;
        var podZ = Math.max(
          hullR + (P.podStyle === 'canted-bell' ? 1.62 : 1.26) * nacScale + aftPodPush,
          boomClear2,
          ringClear2,
          seamClear2
        );
        maxPodRad = Math.max(maxPodRad, podZ);

        // Slender swept structural pylon bounded strictly from inner hull (0.74*hullR) into pod core
        var zIn = hullR * 0.74;
        var zOut = podZ - podR * 0.34;
        var pShape = new T.Shape();
        pShape.moveTo(mountX + podLen * 0.32, zIn);
        pShape.lineTo(mountX + podLen * 0.14, zOut);
        pShape.lineTo(mountX - podLen * 0.10, zOut);
        pShape.lineTo(mountX - podLen * 0.08, zIn);
        pShape.closePath();
        if (cathApi && zOut > zIn + 0.30) {
          holder.add(new T.Mesh(cathApi.buildPylonGeometry(styleCtx, {
            cx: mountX + podLen * 0.03,
            zIn: zIn,
            zTop: zOut,
            zPodInner: podZ - podR * 0.74,
            zHull: hullR * 0.98,
            halfIn: podLen * 0.20,
            halfMid: podLen * 0.15,
            halfOut: podLen * 0.12,
            depth: 0.16 * nacScale,
            rad: 0.07 * nacScale,
            podR: podR
          }), hullMat));
        } else {
          var pylonGeo = new T.ExtrudeGeometry(pShape, { depth: 0.16 * nacScale, bevelEnabled: false });
          pylonGeo.rotateX(Math.PI * 0.5);
          pylonGeo.translate(0, 0.08 * nacScale, 0);
          holder.add(new T.Mesh(pylonGeo, hullMat));
        }

        var assembly = new T.Group();
        assembly.position.set(mountX, 0, podZ);
        if (P.podStyle === 'canted-bell') assembly.rotation.y = reversibleDrive ? 0.06 : 0.04;

        var cowl = new T.Mesh(cowlingGeo, hullMat);
        cowl.position.x = podLen * 0.18;
        assembly.add(cowl);
        if (cathShroudFallback) assembly.add(cathShroudFallback.makeGroup());

        var waist = new T.Mesh(waistGeo, darkMat);
        waist.position.x = -podLen * 0.10;
        assembly.add(waist);

        var bell = new T.Mesh(bellGeo, darkMat);
        bell.position.x = -podLen * (0.17 + 0.25 * aftBellMult);
        assembly.add(bell);

        var chamber = new T.Mesh(innerChamberGeo, darkMat);
        chamber.position.x = -podLen * 0.30;
        assembly.add(chamber);

        var pinchCore = new T.Mesh(pinchCoreGeo, cowlHeatMat);
        pinchCore.position.x = -podLen * (0.42 + 0.06 * aftBellMult);
        assembly.add(pinchCore);

        if (reversibleDrive) {
          // Seamless integrated reversible forward deceleration cowl + recessed dark chamber
          var fwdBellGrp = new T.Group();
          fwdBellGrp.position.x = podLen * 0.36;
          if (P.podStyle === 'canted-bell') fwdBellGrp.rotation.y = -0.10;
          var fBell = new T.Mesh(fwdBellGeo, P.podStyle === 'annular-shroud' ? hullMat : darkMat);
          fBell.position.x = podLen * 0.16;
          fwdBellGrp.add(fBell);
          var fBack = new T.Mesh(new T.CircleGeometry(podR * 0.54, 20), obsidianMat);
          fBack.rotation.y = Math.PI * 0.5;
          fBack.position.x = podLen * 0.02;
          fwdBellGrp.add(fBack);
          var fCore = new T.Mesh(fwdPinchGeo, revCowlHeatMat);
          fCore.position.x = podLen * 0.12;
          fwdBellGrp.add(fCore);
          var fRim = new T.Mesh(new T.TorusGeometry(podR * 0.98, 0.065 * nacScale, 10, 24), P.podStyle === 'annular-shroud' ? trimMat : darkMat);
          fRim.rotation.y = Math.PI * 0.5;
          fRim.position.x = podLen * 0.36;
          fwdBellGrp.add(fRim);
          var fwdNozX = podLen * 0.24;
          var fmOuter2 = new T.Mesh(plumeFwdOuterGeo, plumeOuterMat);
          fmOuter2.position.set(fwdNozX + pLenOut * 0.44, 0, 0);
          fmOuter2.visible = false;
          fwdBellGrp.add(fmOuter2);
          plumeMeshes.push({ mesh: fmOuter2, len: pLenOut * 0.88, nozzleX: fwdNozX, dir: 1 });
          var fmCore2 = new T.Mesh(plumeFwdCoreGeo, plumeCoreMat);
          fmCore2.position.set(fwdNozX + pLenCore * 0.44, 0, 0);
          fmCore2.visible = false;
          fwdBellGrp.add(fmCore2);
          plumeMeshes.push({ mesh: fmCore2, len: pLenCore * 0.88, nozzleX: fwdNozX, dir: 1 });
          assembly.add(fwdBellGrp);
        } else if (P.podStyle === 'annular-shroud') {
          var intakeLip = new T.Mesh(new T.CircleGeometry(podR * 0.42, 20), darkMat);
          intakeLip.rotation.y = Math.PI * 0.5;
          intakeLip.position.x = podLen * 0.41;
          assembly.add(intakeLip);
          var spike = new T.Mesh(new T.ConeGeometry(podR * 0.36, podLen * 0.56, 18), spikeMat);
          spike.rotation.z = -Math.PI * 0.5;
          spike.position.x = podLen * 0.56;
          assembly.add(spike);
        } else {
          // Flip & Burn closed aerodynamic titanium nosecone
          var nose = new T.Mesh(noseConeGeo, hullMat);
          nose.position.x = podLen * 0.54;
          assembly.add(nose);
        }

        var aftNozX = -podLen * (0.42 + 0.26 * aftBellMult);
        var bmOuter = new T.Mesh(plumeOuterGeo, plumeOuterMat);
        bmOuter.position.set(aftNozX - pLenOut * 0.5, 0, 0);
        assembly.add(bmOuter);
        plumeMeshes.push({ mesh: bmOuter, len: pLenOut, nozzleX: aftNozX, dir: -1 });
        var bmCore = new T.Mesh(plumeCoreGeo, plumeCoreMat);
        bmCore.position.set(aftNozX - pLenCore * 0.5, 0, 0);
        assembly.add(bmCore);
        plumeMeshes.push({ mesh: bmCore, len: pLenCore, nozzleX: aftNozX, dir: -1 });

        holder.add(assembly);
        rootGroup.add(holder);
      });

      if (P.podStyle === 'annular-shroud') {
        var rOffAftY = rySeam * (isTwinRam ? evalHullRadius(shared, P.hullShape, P.hullCurve, mountT, 0) : evalAftRadius(shared, P.aftShape, P.greebles, mountT, 0));
        var rOffAftZ = rzSeam * (isTwinRam ? evalHullRadius(shared, P.hullShape, P.hullCurve, mountT, Math.PI * 0.5) : evalAftRadius(shared, P.aftShape, P.greebles, mountT, Math.PI * 0.5));
        var podYShroud = Math.max(rOffAftY + 1.26 * nacScale + aftPodPush, maxPodRad);
        var podZShroud = Math.max(rOffAftZ + 1.26 * nacScale + aftPodPush, maxPodRad);
        var baseShroudR = Math.max(maxPodRad, podZShroud, 0.5);
        var shroudRing = new T.Mesh(new T.TorusGeometry(baseShroudR, 0.16 * nacScale, 10, 48), hullMat);
        shroudRing.rotation.y = Math.PI * 0.5;
        shroudRing.scale.set(podZShroud / baseShroudR, podYShroud / baseShroudR, 1);
        var shroudX = mountX + podLen * 0.14;
        shroudRing.position.x = shroudX;
        shroudRingT = clamp((seamX - shroudX) / Math.max(1, aftSpan), 0.02, 0.72);
        rootGroup.add(shroudRing);
      }
    }

    // -- 6. OPTIONAL SWEPT CRIMSON WINGLETS / RADIATORS (CONTOUR-FITTED, ZERO COLLISION) --
    var coadeFinSuppress = clamp((styleWeights.coade * styleShares.coade - 0.25) / 0.45, 0, 1);
    var stockFinScale = 1 - coadeFinSuppress;
    if (finAngles.length && stockFinScale > 0.08) {
      var tFin0 = clamp((collarW * 0.68) / Math.max(1, aftSpan), 0.06, 0.18);
      if (P.habRing && hasAftIce) tFin0 = Math.max(tFin0, spinRingT + 0.14);
      if (shroudRingT > 0) tFin0 = Math.max(tFin0, shroudRingT + 0.10);
      var tFin1 = Math.min(0.84, Math.max(tFin0 + 0.26, (P.habRing && !hasAftIce) ? (spinRingT - 0.10) : 0.60));
      if (tFin1 > tFin0 + 0.08) {
        var finSpan = (Math.max(rySeam, rzSeam) * (P.arch === 'hex' ? 1.18 : 1.54) + aftPodPush * 0.65) * stockFinScale;

        finAngles.forEach(function (fa) {
          var finWrap = new T.Group();
          finWrap.rotation.x = fa;
          var c = Math.cos(fa), s = Math.sin(fa);
          var rEllip = 1 / Math.sqrt((c * c) / (rySeam * rySeam) + (s * s) / (rzSeam * rzSeam));
          var xRoot0 = seamX - tFin0 * aftSpan;
          var xRoot1 = seamX - tFin1 * aftSpan;
          var rTipBase = isTwinRam ? evalHullRadius(shared, P.hullShape, P.hullCurve, tFin0, fa) : evalAftRadius(shared, P.aftShape, P.greebles, tFin0, fa);
          var rTip = rEllip * rTipBase * 0.90 + finSpan;

          var fShape = new T.Shape();
          for (var fi = 0; fi <= 8; fi++) {
            var tf = lerp(tFin0, tFin1, fi / 8);
            var rLNorm = isTwinRam ? evalHullRadius(shared, P.hullShape, P.hullCurve, tf, fa) : evalAftRadius(shared, P.aftShape, P.greebles, tf, fa);
            var rLocal = rEllip * rLNorm * 0.88;
            if (fi === 0) fShape.moveTo(seamX - tf * aftSpan, rLocal);
            else fShape.lineTo(seamX - tf * aftSpan, rLocal);
          }
          fShape.lineTo(xRoot1 - aftSpan * 0.05, rTip * 0.94);
          fShape.lineTo(xRoot0 - (xRoot0 - xRoot1) * 0.72, rTip);
          fShape.closePath();

          var fGeo = new T.ExtrudeGeometry(fShape, { depth: 0.075, bevelEnabled: false });
          fGeo.translate(0, 0, -0.0375);
          finWrap.add(new T.Mesh(fGeo, radiatorMat));
          rootGroup.add(finWrap);
        });
      }
    }

    // -- 7. COUNTER-ROTATING SPIN-GRAVITY HAB RING ON STATIONARY TWIN-RAIL BEARING TRACK --
    // The stationary raceway drum + twin titanium circular rails + hull stanchions bolt to the
    // bare hull bay (clear of fore/aft ice, pods, pylons & fins). Articulated roller bogies on
    // spinnerGroup visibly roll around the twin rails carrying the centrifuge habitat ring.
    if (P.habRing) {
      var ringX = spinRingX;
      var trackR = spinTrackR;
      var ringR = spinRingR;
      var railHalfW = 0.28 * girthScale;
      var trackGrp = new T.Group();
      trackGrp.name = 'Spin_Ring_Bearing_Track';

      // Recessed dark magnetic-induction raceway drum hugging the bare hull
      var drumGeo = new T.CylinderGeometry(trackR - 0.04 * girthScale, trackR - 0.04 * girthScale, railHalfW * 2.5, 48, 1, false);
      drumGeo.rotateZ(-Math.PI * 0.5);
      var drumMesh = new T.Mesh(drumGeo, darkMat);
      drumMesh.position.x = ringX;
      trackGrp.add(drumMesh);

      // Twin parallel circular machined titanium guide rails
      [-1, 1].forEach(function (sideRail) {
        var railGeo = new T.TorusGeometry(trackR, 0.068 * girthScale, 10, 56);
        railGeo.rotateY(Math.PI * 0.5);
        var railMesh = new T.Mesh(railGeo, trimMat);
        railMesh.position.x = ringX + sideRail * railHalfW;
        trackGrp.add(railMesh);
      });

      // 12 structural stanchion pedestals bolting the twin-rail track firmly into the bare hull
      var stanchionGeo = new T.BoxGeometry(railHalfW * 2.15, 0.34 * girthScale, 0.16 * girthScale);
      for (var sti = 0; sti < 12; sti++) {
        var stPhi = (sti / 12) * Math.PI * 2;
        var stMesh = new T.Mesh(stanchionGeo, hullMat);
        var stMidR = trackR - 0.16 * girthScale;
        stMesh.position.set(ringX, stMidR * Math.cos(stPhi), stMidR * Math.sin(stPhi));
        stMesh.rotation.x = stPhi;
        trackGrp.add(stMesh);
      }
      rootGroup.add(trackGrp);

      // Rotating centrifuge habitat ring & 8 articulated roller-bogie carriages riding the twin rails
      var torus = new T.Mesh(new T.TorusGeometry(ringR, 0.19 * girthScale, 14, 56), hullMat);
      torus.rotation.y = Math.PI * 0.5;
      torus.position.x = ringX;
      spinnerGroup.add(torus);

      var bogieGap = Math.max(0.18, ringR - trackR);
      var bogieCarGeo = new T.BoxGeometry(railHalfW * 2.55, 0.16 * girthScale, 0.24 * girthScale);
      var bogieWheelGeo = new T.CylinderGeometry(0.085 * girthScale, 0.085 * girthScale, 0.14 * girthScale, 12);
      var bogieArmGeo = new T.BoxGeometry(0.18 * girthScale, bogieGap * 0.96, 0.14 * girthScale);
      var ribRingGeo = new T.TorusGeometry(0.205 * girthScale, 0.032 * girthScale, 8, 14);
      for (var bgi = 0; bgi < 8; bgi++) {
        var bgPhi = (bgi / 8) * Math.PI * 2;
        var bgHolder = new T.Group();
        bgHolder.rotation.x = bgPhi;
        bgHolder.position.x = ringX;
        // Bogie carriage straddling the twin circular rails
        var car = new T.Mesh(bogieCarGeo, darkMat);
        car.position.set(0, trackR + 0.07 * girthScale, 0);
        bgHolder.add(car);
        // Twin bogie clamp rollers gripping each rail
        [-1, 1].forEach(function (rwSide) {
          var wh = new T.Mesh(bogieWheelGeo, trimMat);
          wh.position.set(rwSide * railHalfW, trackR + 0.02 * girthScale, 0);
          bgHolder.add(wh);
        });
        // Radial suspension strut from bogie carriage up to centrifuge ring (zero hull/ice penetration!)
        var arm = new T.Mesh(bogieArmGeo, hullMat);
        arm.position.set(0, trackR + bogieGap * 0.5, 0);
        bgHolder.add(arm);
        // Structural circumferential rib frame wrapping around the centrifuge ring cross-section
        var rib = new T.Mesh(ribRingGeo, trimMat);
        rib.position.set(0, ringR, 0);
        bgHolder.add(rib);
        spinnerGroup.add(bgHolder);
      }

      // Panoramic warm amber habitat window strips around both flanks of the rolling ring
      var winGeo = new T.BoxGeometry(0.16 * girthScale, 0.08 * girthScale, 0.14 * girthScale);
      for (var wn = 0; wn < 24; wn++) {
        var wa = (wn * Math.PI * 2) / 24;
        var wMesh = new T.Mesh(winGeo, amberLightMat);
        wMesh.position.set(ringX + 0.15 * girthScale, (ringR + 0.05 * girthScale) * Math.cos(wa), (ringR + 0.05 * girthScale) * Math.sin(wa));
        wMesh.rotation.x = wa;
        spinnerGroup.add(wMesh);
      }
    }

    // -- 8. SURFACE STYLE KIT GEOMETRY (layered over the finished stock hull) ------------
    styleCtx.aftPodPush = aftPodPush;
    styleCtx.icePresent = icePresent;
    styleCtx.uIceStart = uIceStart;
    styleCtx.collarW = collarW;
    styleCtx.thickBase = thickBase;
    styleCtx.keepout = keepout;
    styleCtx.evalForeBareEnd = evalForeBareEnd;
    styleCtx.evalAftBareEnd = evalAftBareEnd;
    styleCtx.rollAngles = rollAngles;
    styleCtx.finAngles = finAngles;
    styleCtx.iceMesh = iceMeshRef;
    styleCtx.aftIceMesh = aftIceMeshRef;
    runStyleKits('buildGeometry');
    // Heat materials a kit registered (e.g. glowing radiator wings) follow the torch too.
    for (var hbj = heatBase.length; hbj < heatMatList.length; hbj++) heatBase[hbj] = heatMatList[hbj].emissiveIntensity;

    // Extract sampled surface points directly from sculpted/procedural fore & aft ice carapaces
    var iceSpawnPts = [];
    var actualMaxIceX = bowX;
    var actualMinAftIceX = sternX;
    function sampleIceSurface(mesh, isFore, limitSamples) {
      if (!mesh || !mesh.geometry || !mesh.geometry.attributes || !mesh.geometry.attributes.position) return;
      var arr = mesh.geometry.attributes.position.array;
      var nv = Math.floor(arr.length / 3);
      var extreme = isFore ? -1e9 : 1e9;
      for (var iv = 0; iv < nv; iv++) {
        var vx = arr[3 * iv];
        if (isFore && vx > extreme) extreme = vx;
        if (!isFore && vx < extreme) extreme = vx;
      }
      if (isFore && extreme > -1e8) actualMaxIceX = extreme;
      if (!isFore && extreme < 1e8) actualMinAftIceX = Math.min(actualMinAftIceX, extreme);
      var stride = Math.max(1, Math.floor(nv / limitSamples));
      for (var isv = 0; isv < nv; isv += stride) {
        var sxI = arr[3 * isv];
        var syI = arr[3 * isv + 1];
        var szI = arr[3 * isv + 2];
        var sideOk = isFore ? (sxI >= seamX - 1.5) : (sxI <= seamX + 1.5);
        if (sideOk && Math.hypot(syI, szI) >= 0.04) {
          iceSpawnPts.push([sxI, syI, szI]);
        }
      }
    }
    sampleIceSurface(iceMeshRef, true, aftIceMeshRef ? 320 : 480);
    sampleIceSurface(aftIceMeshRef, false, 200);
    if (iceSpawnPts.length < 24) {
      for (var fb = 0; fb < 180; fb++) {
        var uFb = lerp(0.12, 0.96, fb / 180);
        var phFb = fb * 2.39996;
        var rFb = evalHullRadius(shared, P.hullShape, P.hullCurve, uFb, phFb);
        iceSpawnPts.push([seamX + uFb * fwdSpan, rySeam * rFb * Math.cos(phFb), rzSeam * rFb * Math.sin(phFb)]);
      }
    }

    var iceMeshes = [];
    if (iceMeshRef) iceMeshes.push(iceMeshRef);
    if (aftIceMeshRef) iceMeshes.push(aftIceMeshRef);
    var iceBasePos = null;
    var iceFrac = 1;
    var cherenkovFore = 0, cherenkovAft = 0;
    var iceVisibleFlag = !opts.hideIce;
    iceMeshes.forEach(function (m) {
      if (m.material) {
        if (!m.material.userData) m.material.userData = {};
        if (!m.material.userData.baseEmissiveCol && m.material.emissive) {
          m.material.userData.baseEmissiveCol = m.material.emissive.clone();
        }
        if (m.material.userData.baseEmissive == null) {
          m.material.userData.baseEmissive = m.material.emissiveIntensity;
        }
      }
    });
    var cherenkovTarget = new T.Color(0x28b6ff);
    var cherenkovHot = new T.Color(0xa6dcff);
    function syncIceLuminescence() {
      for (var mi2 = 0; mi2 < iceMeshes.length; mi2++) {
        var meshI = iceMeshes[mi2];
        var imatI = meshI && meshI.material;
        if (!imatI || !imatI.emissive) continue;
        var gCh = (meshI === iceMeshRef ? cherenkovFore : cherenkovAft) * clamp(iceFrac * 1.15, 0, 1);
        var baseColI = imatI.userData.baseEmissiveCol || iceEmissive;
        var baseEmI = imatI.userData.baseEmissive != null ? imatI.userData.baseEmissive : 0.38;
        imatI.emissive.copy(baseColI);
        if (gCh > 0.002) {
          var hotMix = clamp((gCh - 0.55) / 0.45, 0, 1);
          imatI.emissive.lerp(cherenkovTarget, clamp(gCh * 0.92, 0, 0.92));
          if (hotMix > 0) imatI.emissive.lerp(cherenkovHot, hotMix * 0.48);
        }
        imatI.emissiveIntensity = baseEmI * (0.35 + 0.65 * iceFrac) + gCh * 1.65;
      }
    }

    var podCountEst = P.arch === 'hex' ? 6 : P.arch === 'quad' ? 4 : P.arch === 'tri' ? 3 : 2;
    var lorePlumeKm = Math.round((240 + P.nacelleSize * 460 + podCountEst * 55) * (isCorridor ? 1.15 : 1.0));

    return {
      group: rootGroup,
      spinner: spinnerGroup,
      iceMesh: iceMeshRef,
      aftIceMesh: aftIceMeshRef,
      iceMeshes: iceMeshes,
      setIceVisible: function (vis) {
        iceVisibleFlag = !!vis;
        for (var i = 0; i < iceMeshes.length; i++) iceMeshes[i].visible = iceVisibleFlag && iceFrac > 0.015;
      },
      plumeOuterMat: plumeOuterMat,
      plumeCoreMat: plumeCoreMat,
      bowX: actualMaxIceX,
      sternX: actualMinAftIceX,
      seamX: seamX,
      rySeam: rySeam,
      rzSeam: rzSeam,
      plumeKm: lorePlumeKm,
      hasIce: icePresent,
      hasAftIce: !!(hasAftIce && icePresent),
      reversibleDrive: reversibleDrive,
      iceSpawnPts: iceSpawnPts,
      specs: G.computeSpecs(gNorm),
      styleWeights: {
        gnostic: styleWeights.gnostic,
        gothic: styleWeights.gothic,
        sleek: styleWeights.sleek,
        giger: styleWeights.giger,
        coade: styleWeights.coade,
        dune: styleWeights.dune,
        cathedral: styleWeights.cathedral
      },
      styleShares: styleShares,
      styleKitsApplied: activeKits.map(function (k) { return k.id; }),
      // Hull-bolted hardpoints in rootGroup-local coordinates (transform with group.matrixWorld).
      weaponHardpoints: weaponHardpoints,
      shuttlePortAnchors: shuttlePortAnchors,
      rcsJetCount: rcsJets.length,
      rcsBlocks: hardpointKit ? hardpointKit.rcsBlocks : [],
      rcsJetInfo: function () {
        return rcsJets.map(function (j) {
          return {
            role: j.role, station: j.station, val: j.val, firing: j.val > 0.03,
            pos: [j.pos.x, j.pos.y, j.pos.z], dir: [j.dir.x, j.dir.y, j.dir.z]
          };
        });
      },
      // tx = roll (+X torque), ty = yaw (+ = nose to starboard), tz = pitch (+ = nose up), each in [-1..1].
      // Each nozzle's torque about the waist (r x F) decides whether it belongs to the commanded couple:
      // radial nozzles carry pitch/yaw, tangential nozzles carry roll. Returns the count of live jets.
      setRcsTorque: function (tx, ty, tz, timeS) {
        if (!rcsJets.length) return 0;
        var cRoll = clamp(Number(tx) || 0, -1, 1);
        var cYawT = -clamp(Number(ty) || 0, -1, 1);
        var cPitch = clamp(Number(tz) || 0, -1, 1);
        var now = (typeof timeS === 'number' && isFinite(timeS)) ? timeS : (rcsClock < 0 ? 0 : rcsClock + 1 / 60);
        var dtR = rcsClock < 0 ? 1 / 60 : clamp(now - rcsClock, 0, 0.1);
        rcsClock = now;
        var firing = 0;
        for (var ji = 0; ji < rcsJets.length; ji++) {
          var j = rcsJets[ji];
          var drive = j.role === 'roll' ? cRoll * j.rollSign : (cYawT * j.wy + cPitch * j.wz);
          var target = drive > 0.04 ? clamp(0.32 + 0.68 * drive, 0, 1) : 0;
          var rate = target > j.val ? 34 : 11;
          j.val += (target - j.val) * (1 - Math.exp(-rate * dtR));
          if (j.val < 0.004) j.val = 0;
          var live = j.val > 0.03;
          j.mesh.visible = live;
          if (!live) continue;
          firing++;
          j.mat.uniforms.uOn.value = Math.pow(j.val, 0.7);
          j.mat.uniforms.uTime.value = now;
          j.mesh.scale.set(0.75 + 0.25 * j.val, 0.45 + 0.55 * j.val, 0.75 + 0.25 * j.val);
        }
        return firing;
      },
      // thrustVal: 0.08 idle .. ~1.45 full torch; boostRatio (0..3); dirSign: -1 aft exhaust, +1 forward braking
      setPlumeIntensity: function (val, boostRatio, dirSign, timeS) {
        var v = Math.max(0, Number(val) || 0);
        var b = clamp(Number(boostRatio) || 0, 0, 3);
        var fireFwd = reversibleDrive && dirSign === 1;
        var on = v * (1 + 0.18 * b);
        plumeOuterMat.uniforms.uOn.value = on;
        plumeCoreMat.uniforms.uOn.value = on;
        if (typeof timeS === 'number' && isFinite(timeS)) {
          plumeOuterMat.uniforms.uTime.value = timeS;
          plumeCoreMat.uniforms.uTime.value = timeS;
        }
        var stretch = (0.22 + 0.78 * Math.min(v, 1.5)) * (1 + 0.5 * b);
        var girth = 0.72 + 0.28 * Math.min(v, 1.5) + 0.22 * b;
        for (var pi = 0; pi < plumeMeshes.length; pi++) {
          var pm = plumeMeshes[pi];
          var isFwdPlume = pm.dir === 1;
          var active = fireFwd ? isFwdPlume : !isFwdPlume;
          pm.mesh.visible = active && v > 0.01;
          if (!active) continue;
          pm.mesh.scale.set(stretch, girth, girth);
          pm.mesh.position.x = pm.nozzleX + (isFwdPlume ? 1 : -1) * pm.len * 0.5 * stretch;
        }
        var heatK = 0.14 + 1.05 * Math.min(v, 1.5) + 0.55 * b;
        for (var hi = 0; hi < heatMatList.length; hi++) {
          heatMatList[hi].emissiveIntensity = heatBase[hi] * (fireFwd ? 0.28 : heatK);
        }
        if (revCowlHeatMat) {
          revCowlHeatMat.emissiveIntensity = fireFwd ? (1.85 * heatK) : (0.16 + 0.14 * Math.min(v, 1.0));
        }
      },
      setCherenkovGlow: function (foreVal, aftVal) {
        var nf = clamp(Number(foreVal) || 0, 0, 1.25);
        var na = clamp(Number(aftVal) || 0, 0, 1.25);
        if (Math.abs(nf - cherenkovFore) < 0.003 && Math.abs(na - cherenkovAft) < 0.003) return;
        cherenkovFore = nf;
        cherenkovAft = na;
        syncIceLuminescence();
      },
      // frac 1 = freshly glazed, 0 = ablated down to the metal. Thins the shell radially (strongest
      // at the prow tip) and retreats the tip aft so the visual tracks S.iceIntegrity.
      setIceIntegrity: function (frac) {
        var f = clamp(Number(frac), 0, 1);
        if (!isFinite(f)) f = 1;
        if (iceBasePos && Math.abs(f - iceFrac) < 0.004) return;
        iceFrac = f;
        if (!iceBasePos) {
          iceBasePos = iceMeshes.map(function (m) { return m.geometry.attributes.position.array.slice(0); });
        }
        var spanF = Math.max(1, actualMaxIceX - seamX);
        var spanA = Math.max(1, seamX - actualMinAftIceX);
        var loss = 1 - f;
        for (var mi = 0; mi < iceMeshes.length; mi++) {
          var mesh = iceMeshes[mi];
          var isFore = mesh === iceMeshRef;
          var pos = mesh.geometry.attributes.position;
          var arr = pos.array, base = iceBasePos[mi];
          for (var vi = 0; vi < arr.length; vi += 3) {
            var bx = base[vi], by = base[vi + 1], bz = base[vi + 2];
            var e, nx;
            if (isFore) {
              var u = clamp((bx - seamX) / spanF, 0, 1);
              e = loss * (0.30 + 0.70 * Math.pow(u, 1.4));
              nx = bx - e * 0.10 * spanF * u * u;
            } else {
              var w = clamp((seamX - bx) / spanA, 0, 1);
              e = loss * (0.22 + 0.45 * Math.pow(w, 1.2));
              nx = bx + e * 0.08 * spanA * w * w;
            }
            var k = 1 - 0.19 * e;
            arr[vi] = nx;
            arr[vi + 1] = by * k;
            arr[vi + 2] = bz * k;
          }
          pos.needsUpdate = true;
          var imat = mesh.material;
          if (imat) {
            if (imat.userData.baseOpacity == null) imat.userData.baseOpacity = imat.opacity;
            imat.opacity = imat.userData.baseOpacity * (0.20 + 0.80 * f);
          }
          mesh.visible = iceVisibleFlag && f > 0.015;
        }
        syncIceLuminescence();
      },
      dispose: function () {
        rootGroup.traverse(function (o) {
          if (o.geometry) o.geometry.dispose();
        });
        ownedMaterials.forEach(function (m) {
          m.dispose();
        });
      }
    };
  }

  root.LighthuggerBuilder = {
    createSharedAssets: createSharedAssets,
    buildVessel: buildVessel
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
