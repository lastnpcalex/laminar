/**
 * LighthuggerShuttles - BattleTech-style DropShip torch-shuttle traffic (window.LighthuggerShuttles).
 *
 * Scale: 1 scene unit = 100 m (UNITS_PER_KM = 10). A 3.5-4.5 km Lighthugger is 35-45 u; the DropShips
 * hulls are authored at the sizes below, then rendered at HULL_SCALE (0.55x) so even a Behemoth is
 * dwarfed by the ship it services:
 *   Leopard  (Aerodyne wedge)        65.5 x 51.6 x 22.4 m  ->  0.72 x 0.56 x 0.26 u  (drawn ~0.40 x 0.31 x 0.14)
 *   Union    (Spheroid egg)          81.5 x 81.5 x 78 m    ->  0.85 x 0.85 x 0.82 u  (drawn ~0.47 x 0.47 x 0.45)
 *   Overlord (Tall Spheroid)         101 x 101 x 139 m     ->  1.05 x 1.05 x 1.42 u  (drawn ~0.58 x 0.58 x 0.78)
 *   Behemoth (Bulk cargo Spheroid)   200 x 200 x 275 m     ->  1.95 x 1.95 x 2.65 u  (drawn ~1.07 x 1.07 x 1.46)
 * Plume length and nav strobe sprite sizes are not scaled, so torches and lights stay legible.
 *
 * Every hull is built nose +Y with its torch bell at -Y; the GLSL plume is parented at the bell exit.
 * Seven ships fly cubic brachistochrone legs between the Lighthugger's shuttle bays and the station's
 * non-rotating axial spindle hub: accelerate (0..0.45), 180 deg turnover with the torch dimmed
 * (0.45..0.55), braking burn bell-first (0.55..0.96), then a short berth/depart fade (0.96..1.0).
 * Each path is pushed clear of the station's ring sphere and the Lighthugger hull capsule.
 *
 * API: create(T, parent) -> { group, update(dt, t, env) -> activeCount, setVisible(v), info(), dispose() }
 *   env = { visible, ports: [{ pos: [x,y,z], normal: [x,y,z] }], hub: { pos, axis },
 *           avoidSphere: { center, radius }, avoidCapsule: { a, b, radius } }   (all world space)
 *
 * ASCII only; strings use \uXXXX escapes.
 */
(function (root) {
  'use strict';

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function smooth01(x) { var t = clamp(x, 0, 1); return t * t * (3 - 2 * t); }
  function frac(x) { return x - Math.floor(x); }
  function hash1(n) { return frac(Math.sin(n * 127.1 + 311.7) * 43758.5453); }

  var CLASSES = {
    leopard: { label: 'LEOPARD', form: 'aerodyne', legS: 14, plumeLen: 3.1, plumeR: 0.085, strobe: 0.14 },
    dart: { label: 'DART', form: 'pinnace', legS: 12, plumeLen: 2.6, plumeR: 0.068, strobe: 0.12 },
    cutter: { label: 'CUTTER', form: 'workboat', legS: 16, plumeLen: 3.4, plumeR: 0.095, strobe: 0.14 },
    union: { label: 'UNION', form: 'lander', legS: 18, plumeLen: 3.8, plumeR: 0.115, strobe: 0.16 }
  };
  var FLEET = ['leopard', 'dart', 'cutter', 'leopard', 'union', 'dart', 'cutter'];
  // Sleek smaller shuttle hulls so craft read cleanly as crisp shuttles launching from bays.
  var HULL_SCALE = 0.38;
  var GLOW_KEEP = 1.45;  // throat glow = plumeR(scaled) * 5 * GLOW_KEEP ~= 0.8x the pre-scale glow

  var PLUME_VERT =
    'varying vec2 vUv; varying vec3 vN; varying vec3 vV;' +
    'void main(){' +
    '  vUv = uv;' +
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);' +
    '  vN = normalize(normalMatrix * normal);' +
    '  vV = normalize(-mv.xyz);' +
    '  gl_Position = projectionMatrix * mv;' +
    '}';
  // Fusion mini-torch: blue-white diamond core at the bell, soft violet-blue plasma tail.
  var PLUME_FRAG =
    'uniform float uOn; uniform float uTime; uniform float uSeed;' +
    'varying vec2 vUv; varying vec3 vN; varying vec3 vV;' +
    'void main(){' +
    '  float s = clamp(1.0 - vUv.y, 0.0, 1.0);' +
    '  float facing = abs(dot(normalize(vN), normalize(vV)));' +
    '  float core = pow(max(facing, 0.0001), 5.0);' +
    '  float body = pow(facing, 2.0);' +
    '  float lip = smoothstep(0.0, 0.02, s);' +
    '  float tail = pow(max(1.0 - s, 0.0), 1.35);' +
    '  float coreLen = exp(-s * 4.5);' +
    '  float dia = 0.5 + 0.5 * cos(s * 34.0 - uTime * 18.0 + uSeed * 6.2831);' +
    '  float diamonds = 1.0 + (1.0 - smoothstep(0.10, 0.45, s)) * smoothstep(0.02, 0.06, s) * (dia * dia * 1.2 - 0.35);' +
    '  float flick = 0.90 + 0.10 * sin(uTime * 47.0 + uSeed * 11.0);' +
    '  float a = (core * coreLen * 2.2 + body * tail * 0.55) * diamonds * flick * lip * uOn;' +
    '  vec3 hot = vec3(0.92, 0.96, 1.0);' +
    '  vec3 blue = vec3(0.32, 0.58, 1.0);' +
    '  vec3 violet = vec3(0.48, 0.36, 1.0);' +
    '  vec3 col = mix(mix(violet, blue, tail), hot, clamp(core * coreLen * 1.5, 0.0, 1.0));' +
    '  gl_FragColor = vec4(col * a * 2.3, clamp(a, 0.0, 1.0));' +
    '}';

  function create(T, parent) {
    if (!T) return null;
    var group = new T.Group();
    group.name = 'DropShip_Traffic';
    group.visible = false;
    if (parent && parent.add) parent.add(group);

    var disposables = [];
    function own(x) { disposables.push(x); return x; }

    // Soft radial glow texture for strobes and throat glow (skipped without a DOM)
    var glowTex = null;
    if (typeof document !== 'undefined' && document.createElement) {
      var cv = document.createElement('canvas');
      cv.width = cv.height = 64;
      var g2 = cv.getContext('2d');
      if (g2) {
        var grad = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0.0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.22, 'rgba(255,255,255,0.75)');
        grad.addColorStop(0.55, 'rgba(255,255,255,0.18)');
        grad.addColorStop(1.0, 'rgba(255,255,255,0)');
        g2.fillStyle = grad;
        g2.fillRect(0, 0, 64, 64);
        glowTex = own(new T.CanvasTexture(cv));
      }
    }

    var mats = {
      hull: own(new T.MeshStandardMaterial({ color: 0x939cad, metalness: 0.58, roughness: 0.46 })),
      armor: own(new T.MeshStandardMaterial({ color: 0x5c6575, metalness: 0.66, roughness: 0.40 })),
      dark: own(new T.MeshStandardMaterial({ color: 0x1b1e26, metalness: 0.74, roughness: 0.38 })),
      accent: own(new T.MeshStandardMaterial({ color: 0xb98a34, metalness: 0.50, roughness: 0.42, emissive: 0x2a1600, emissiveIntensity: 0.4 })),
      window: own(new T.MeshBasicMaterial({ color: 0xffd890 })),
      bell: own(new T.MeshStandardMaterial({ color: 0x2a2a31, metalness: 0.92, roughness: 0.24, emissive: 0x5a2a10, emissiveIntensity: 0.6, side: T.DoubleSide }))
    };

    function mesh(geo, mat, parentG, x, y, z) {
      own(geo);
      var m = new T.Mesh(geo, mat);
      m.position.set(x || 0, y || 0, z || 0);
      parentG.add(m);
      return m;
    }

    // Egg profile (nose +Y). bulge > 0 widens the ventral (engine) half like a BattleTech spheroid.
    function eggRadius(R, H, bulge, y) {
      var tt = clamp((2 * y) / H, -1, 1);
      return R * Math.sqrt(Math.max(0, 1 - tt * tt)) * (1 - bulge * tt) / (1 + bulge * 0.35);
    }
    function eggLathe(R, H, bulge, baseR) {
      var pts = [];
      var n = 28;
      pts.push(new T.Vector2(0, -H * 0.5));
      for (var i = 0; i <= n; i++) {
        var y = -H * 0.5 + (i / n) * H;
        var r = eggRadius(R, H, bulge, y);
        if (i === 0) r = Math.max(r, baseR);
        pts.push(new T.Vector2(Math.max(0.0005, r), y));
      }
      pts.push(new T.Vector2(0, H * 0.5));
      return new T.LatheGeometry(pts, 32);
    }
    function ringAt(R, H, bulge, y, tube, mat, g, scaleOut) {
      var r = eggRadius(R, H, bulge, y) * (scaleOut || 1.01);
      var tg = new T.TorusGeometry(Math.max(0.01, r), tube, 6, 40);
      tg.rotateX(Math.PI * 0.5);
      return mesh(tg, mat, g, 0, y, 0);
    }
    function meridians(R, H, count, tube, mat, g) {
      for (var k = 0; k < count; k++) {
        var tg = new T.TorusGeometry(R * 1.008, tube, 4, 48);
        var m = mesh(tg, mat, g, 0, 0, 0);
        m.scale.set(1, (H * 0.5) / R, 1);
        m.rotation.y = (k / count) * Math.PI;
      }
    }
    function bell(rTop, rBot, len, yTop, g) {
      var bg = new T.CylinderGeometry(rTop, rBot, len, 16, 1, true);
      return mesh(bg, mats.bell, g, 0, yTop - len * 0.5, 0);
    }

    // ---- Hull builders: each returns { exitY, halfW, topY } in ship-local units ----------------
    function buildLeopard(g) {
      // Sleek delta-wing aerodyne shuttle with chined fuselage, swept wings & twin nacelles
      var nose = new T.ConeGeometry(0.14, 0.44, 4);
      nose.rotateY(Math.PI * 0.25);
      var nM = mesh(nose, mats.hull, g, 0, 0.34, 0);
      nM.scale.set(1.15, 1, 0.58);
      var fus = new T.CylinderGeometry(0.14, 0.17, 0.52, 4, 1, false);
      fus.rotateY(Math.PI * 0.25);
      var f = mesh(fus, mats.hull, g, 0, -0.10, 0);
      f.scale.set(1.18, 1, 0.56);
      mesh(new T.BoxGeometry(0.66, 0.18, 0.024), mats.armor, g, 0, -0.18, 0);
      mesh(new T.BoxGeometry(0.36, 0.16, 0.024), mats.armor, g, 0, -0.02, 0);
      [-1, 1].forEach(function (sx) {
        mesh(new T.CylinderGeometry(0.036, 0.044, 0.38, 10), mats.armor, g, sx * 0.20, -0.16, 0);
        mesh(new T.BoxGeometry(0.025, 0.14, 0.032), mats.accent, g, sx * 0.32, -0.20, 0);
      });
      mesh(new T.BoxGeometry(0.11, 0.18, 0.065), mats.armor, g, 0, 0.12, 0.07);
      mesh(new T.BoxGeometry(0.095, 0.036, 0.014), mats.window, g, 0, 0.18, 0.106);
      mesh(new T.BoxGeometry(0.16, 0.06, 0.08), mats.dark, g, 0, -0.35, 0);
      bell(0.055, 0.095, 0.10, -0.38, g);
      return { exitY: -0.48, halfW: 0.34, topY: 0.56 };
    }
    function buildDart(g) {
      // Needle-nosed courier pinnace: long sleek fuselage, dorsal fin & twin inline outriggers
      var body = new T.ConeGeometry(0.11, 0.78, 6);
      var bM = mesh(body, mats.hull, g, 0, 0.12, 0);
      bM.scale.set(1.0, 1, 0.65);
      var aft = new T.CylinderGeometry(0.105, 0.085, 0.32, 6);
      var aM = mesh(aft, mats.armor, g, 0, -0.30, 0);
      aM.scale.set(1.0, 1, 0.65);
      mesh(new T.BoxGeometry(0.50, 0.14, 0.018), mats.armor, g, 0, -0.24, 0);
      mesh(new T.BoxGeometry(0.02, 0.22, 0.14), mats.accent, g, 0, -0.26, 0.07);
      mesh(new T.BoxGeometry(0.075, 0.032, 0.016), mats.window, g, 0, 0.18, 0.065);
      bell(0.045, 0.078, 0.09, -0.46, g);
      return { exitY: -0.55, halfW: 0.26, topY: 0.52 };
    }
    function buildCutter(g) {
      // Angular orbital utility / ice-harvester shuttle with twin forward cargo pods & spine truss
      mesh(new T.BoxGeometry(0.16, 0.76, 0.12), mats.hull, g, 0, 0.0, 0);
      var prow = new T.ConeGeometry(0.11, 0.24, 4);
      prow.rotateY(Math.PI * 0.25);
      mesh(prow, mats.armor, g, 0, 0.50, 0);
      mesh(new T.BoxGeometry(0.12, 0.036, 0.016), mats.window, g, 0, 0.32, 0.066);
      [-1, 1].forEach(function (sx) {
        mesh(new T.BoxGeometry(0.08, 0.34, 0.09), mats.accent, g, sx * 0.15, 0.04, 0);
        mesh(new T.CylinderGeometry(0.035, 0.042, 0.26, 8), mats.dark, g, sx * 0.16, -0.26, 0);
      });
      mesh(new T.BoxGeometry(0.42, 0.07, 0.025), mats.armor, g, 0, -0.24, 0);
      bell(0.06, 0.10, 0.11, -0.38, g);
      return { exitY: -0.49, halfW: 0.24, topY: 0.62 };
    }
    function buildUnion(g) {
      // Compact faceted conical-ogive lander (streamlined, never a giant bulbous sphere)
      var R = 0.25, H = 0.78, bu = 0.05;
      mesh(eggLathe(R, H, bu, 0.11), mats.hull, g, 0, 0, 0);
      meridians(R * 0.99, H, 4, 0.008, mats.armor, g);
      ringAt(R, H, bu, -0.06, 0.018, mats.armor, g, 1.02);
      ringAt(R, H, bu, 0.24, 0.010, mats.window, g, 1.0);
      for (var k = 0; k < 4; k++) {
        var a = (k / 4) * Math.PI * 2 + Math.PI * 0.25;
        var fin = mesh(new T.BoxGeometry(0.14, 0.22, 0.022), mats.armor, g, Math.cos(a) * (R + 0.04), -0.20, Math.sin(a) * (R + 0.04));
        fin.rotation.y = -a;
      }
      bell(0.065, 0.115, 0.10, -H * 0.5, g);
      return { exitY: -H * 0.5 - 0.10, halfW: R + 0.10, topY: H * 0.5 };
    }

    function strobe(color, size, g, x, y, z) {
      if (!glowTex) return null;
      var sm = own(new T.SpriteMaterial({ map: glowTex, color: color, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
      var sp = new T.Sprite(sm);
      sp.position.set(x, y, z);
      sp.scale.setScalar(size);
      g.add(sp);
      return sp;
    }

    // ---- Fleet ----------------------------------------------------------------------------------
    var ships = FLEET.map(function (key, i) {
      var cls = CLASSES[key];
      var holder = new T.Group();
      holder.name = 'DropShip_' + cls.label + '_' + i;
      holder.visible = false;
      group.add(holder);
      var body = new T.Group();
      holder.add(body);
      // Hull meshes live in a 0.55x sub-group; plume and strobes are re-anchored to the scaled hull
      // so the torch still leaves the bell lip and the nav lights sit on the flanks.
      var hullG = new T.Group();
      hullG.name = 'DropShip_Hull';
      hullG.scale.setScalar(HULL_SCALE);
      body.add(hullG);
      var raw = key === 'leopard' ? buildLeopard(hullG) : key === 'dart' ? buildDart(hullG) :
        key === 'cutter' ? buildCutter(hullG) : buildUnion(hullG);
      var dims = { exitY: raw.exitY * HULL_SCALE, halfW: raw.halfW * HULL_SCALE, topY: raw.topY * HULL_SCALE };
      var plumeR = cls.plumeR * HULL_SCALE;
      var plumeMat = own(new T.ShaderMaterial({
        uniforms: { uOn: { value: 0 }, uTime: { value: 0 }, uSeed: { value: hash1(i + 3) } },
        vertexShader: PLUME_VERT,
        fragmentShader: PLUME_FRAG,
        transparent: true,
        blending: T.AdditiveBlending,
        depthWrite: false,
        side: T.DoubleSide
      }));
      // Plume radius follows the bell; length stays full-size so the torch reads at fleet distance.
      var pGeo = own(new T.CylinderGeometry(plumeR, plumeR * 2.6, cls.plumeLen, 20, 8, true));
      pGeo.translate(0, -cls.plumeLen * 0.5, 0);  // top ring (uv.y = 1) sits exactly on the bell exit
      var plume = new T.Mesh(pGeo, plumeMat);
      plume.position.set(0, dims.exitY, 0);
      plume.renderOrder = 6;
      body.add(plume);
      var throat = strobe(0xbcd6ff, plumeR * 5.0 * GLOW_KEEP, body, 0, dims.exitY, 0);
      var jets = [-1,1].map(side => strobe(0xa9f4ff,cls.strobe*1.7,body,
        side*dims.halfW*.68,dims.exitY*.72,0));
      var navR = strobe(0xff3030, cls.strobe, body, -dims.halfW, 0, 0);
      var navG = strobe(0x30ff60, cls.strobe, body, dims.halfW, 0, 0);
      var navW = strobe(0xffffff, cls.strobe * 1.25, body, 0, dims.topY + 0.02, 0);
      return {
        key: key, cls: cls, holder: holder, body: body, plume: plume, plumeMat: plumeMat,
        jets: jets, throat: throat, navR: navR, navG: navG, navW: navW, dims: dims, hull: hullG, plumeR: plumeR,
        period: cls.legS * (0.92 + 0.16 * hash1(i * 7 + 1)),
        offset: i / FLEET.length + 0.13 * hash1(i * 13 + 5),
        laneAng: hash1(i * 17 + 2) * Math.PI * 2,
        laneMag: 0.06 + 0.08 * hash1(i * 19 + 9),
        slot: (i / FLEET.length) * Math.PI * 2,
        state: { u: 0, phase: 'idle', outbound: true, port: 0 }
      };
    });

    var V3 = function (a) { return new T.Vector3(a[0], a[1], a[2]); };
    var tA = new T.Vector3(), tB = new T.Vector3(), tC = new T.Vector3(), tD = new T.Vector3();
    var basisM = new T.Matrix4();
    var activeCount = 0;

    function bez(p0, p1, p2, p3, s, out) {
      var is = 1 - s;
      var a = is * is * is, b = 3 * is * is * s, c = 3 * is * s * s, d = s * s * s;
      return out.set(
        a * p0.x + b * p1.x + c * p2.x + d * p3.x,
        a * p0.y + b * p1.y + c * p2.y + d * p3.y,
        a * p0.z + b * p1.z + c * p2.z + d * p3.z
      );
    }
    function perpBasis(v) {
      var ref = Math.abs(v.y) < 0.9 ? new T.Vector3(0, 1, 0) : new T.Vector3(1, 0, 0);
      var e1 = new T.Vector3().crossVectors(v, ref).normalize();
      var e2 = new T.Vector3().crossVectors(v, e1).normalize();
      return [e1, e2];
    }

    // Path point with clearance pushouts: station ring sphere everywhere, hull capsule away from the bay.
    function pathPoint(leg, s, env, out) {
      bez(leg.p0, leg.p1, leg.p2, leg.p3, clamp(s, 0, 1), out);
      var sph = env.avoidSphere;
      if (sph) {
        tA.subVectors(out, sph.c);
        var dl = tA.length();
        if (dl < sph.r && dl > 1e-6) out.addScaledVector(tA, (sph.r/dl - 1) * smooth01((leg.outbound ? 1-s : s)/0.12));
      }
      var cap = env.avoidCapsule;
      if (cap) {
        var portDist = leg.outbound ? s : 1 - s;
        var wCap = smooth01(portDist / 0.16);
        if (wCap > 0) {
          tB.subVectors(cap.b, cap.a);
          var len2 = Math.max(1e-6, tB.lengthSq());
          var k = clamp(tC.subVectors(out, cap.a).dot(tB) / len2, 0, 1);
          tD.copy(cap.a).addScaledVector(tB, k);
          tA.subVectors(out, tD);
          var dc = tA.length();
          if (dc < cap.r && dc > 1e-6) {
            var push = (cap.r - dc) * wCap;
            out.addScaledVector(tA, push / dc);
          }
        }
      }
      return out;
    }

    function makeLeg(sh, outbound, portIdx, env) {
      var port = env.portsW[portIdx % env.portsW.length];
      var hubP = env.hubW.pos.clone();
      var hubN = env.hubW.axis.clone();
      var hb = perpBasis(hubN);
      var slotR = 0.55 + 0.30 * (FLEET.indexOf(sh.key) % 3);
      hubP.addScaledVector(hb[0], Math.cos(sh.slot) * slotR).addScaledVector(hb[1], Math.sin(sh.slot) * slotR);
      // Launch right from the bay hatch mouth along bay normal so shuttles never bulge through solid hull plating
      var bayClear = 0.22;
      var bayP = port.pos.clone().addScaledVector(port.normal, bayClear);
      hubP.addScaledVector(hubN, 0.22);
      var a = outbound ? bayP : hubP, an = outbound ? port.normal : hubN;
      var b = outbound ? hubP : bayP, bn = outbound ? hubN : port.normal;
      var chord = new T.Vector3().subVectors(b, a);
      var L = Math.max(1, chord.length());
      var cb = perpBasis(chord.clone().normalize());
      var lane = cb[0].clone().multiplyScalar(Math.cos(sh.laneAng)).addScaledVector(cb[1], Math.sin(sh.laneAng)).multiplyScalar(sh.laneMag * L);
      var k = 0.34 * L;
      var legUp = cb[0].clone();
      return {
        outbound: outbound, L: L, legUp: legUp,
        p0: a.clone(), p1: a.clone().addScaledVector(an, k).add(lane),
        p2: b.clone().addScaledVector(bn, k).add(lane), p3: b.clone()
      };
    }

    function updateShip(sh, t, env, dt, mode) {
      var i = ships.indexOf(sh);
      var flight = sh.flight;
      if (!flight) {
        if (mode === 'recall') { sh.holder.visible = false; return false; }
        flight = sh.flight = { elapsed: -i * (mode === 'harvest' ? 0.55 : 0.9), outbound: true,
          period: mode === 'harvest' ? (6.2 + 0.35 * i) : sh.period, mode: mode, ctx: env };
      }
      if (mode === 'recall' || flight.mode !== mode) flight.recalled = true;
      flight.elapsed += dt;
      if (flight.elapsed < 0 && flight.recalled) {
        sh.flight = null;
        sh.holder.visible = false;
        return false;
      }
      if (!flight.recalled) flight.ctx = env;
      env = Object.assign({}, flight.ctx, {portsW: env.portsW, avoidCapsule: env.avoidCapsule, distant: env.distant});
      if (flight.elapsed >= flight.period) {
        if (!flight.outbound && flight.recalled) {
          sh.flight = null;
          sh.holder.visible = false;
          return false;
        }
        flight.elapsed %= flight.period;
        flight.outbound = !flight.outbound;
      }
      var u = clamp(flight.elapsed / flight.period, 0, 1);
      var outbound = flight.outbound, portIdx = i % env.portsW.length;
      var leg = makeLeg(sh, outbound, portIdx, env);

      var distant = !!env.distant && flight.mode === 'harvest';
      var dwellStart = distant ? 1.0 : (flight.mode === 'harvest' && outbound ? .90 : .98);
      var w = clamp(u / dwellStart, 0, 1);
      var sPath = 0.6*w + 0.4*smooth01(w);
      var pos = pathPoint(leg, sPath, env, new T.Vector3());
      var e = 0.004;
      var pA = pathPoint(leg, Math.max(0, sPath - e), env, new T.Vector3());
      var pB = pathPoint(leg, Math.min(1, sPath + e), env, new T.Vector3());
      var tan = pB.sub(pA);
      if (tan.lengthSq() < 1e-10) tan.subVectors(leg.p3, leg.p2);
      if (tan.lengthSq() < 1e-10) tan.subVectors(leg.p3, leg.p0);
      tan.normalize();

      // Torchship attitude: nose along motion while accelerating, 180 deg turnover, bell-first brake
      var theta = distant ? (outbound ? 0 : Math.PI) : Math.PI * smooth01((u - 0.44) / 0.12);
      var side = leg.legUp.clone().addScaledVector(tan, -leg.legUp.dot(tan));
      if (side.lengthSq() < 1e-8) side = perpBasis(tan)[0];
      side.normalize();
      var wv = new T.Vector3().crossVectors(side, tan);
      var nose = tan.clone().multiplyScalar(Math.cos(theta)).addScaledVector(wv, Math.sin(theta)).normalize();
      var zAx = new T.Vector3().crossVectors(side, nose).normalize();
      basisM.makeBasis(side, nose, zAx);
      sh.holder.quaternion.setFromRotationMatrix(basisM);
      sh.holder.position.copy(pos);

      // Torch envelope (distant sorties streak out continuously and fade cleanly into deep space)
      var distFade = distant
        ? (outbound ? (1 - smooth01((u - 0.72) / 0.22)) : smooth01((u - 0.08) / 0.22))
        : 1.0;
      var on = distant
        ? smooth01((u - 0.08) / 0.04) * smooth01((0.92 - u) / 0.06) * distFade
        : (u < 0.44 ? smooth01((u-0.09)/0.04)*smooth01((0.44-u)/0.04)
          : smooth01((u-0.56)/0.04)*smooth01((0.90-u)/0.04));
      var rcs = (u < 0.09 || u > 0.90) && flight.elapsed >= 0 ? (0.30+0.22*Math.sin(t*13+i)) * distFade : 0;
      var dFrom = pos.distanceTo(leg.p0), dTo = pos.distanceTo(leg.p3);
      var room = u < 0.5 ? (dFrom / (sh.cls.plumeLen * 0.6) + 0.15) : (dTo / (sh.cls.plumeLen * 0.8) + 0.10);
      on *= smooth01((Math.min(dFrom,dTo)-sh.dims.halfW*1.7)/Math.max(.1,sh.dims.halfW));
      sh.jets.forEach(function(jet,k) {
        if (!jet) return;
        jet.visible = rcs > 0.02;
        jet.material.opacity = rcs*(.7+.3*Math.sin(t*21+k));
      });
      var lenK = clamp(0.25 + 0.75 * on, 0, 1.2) * clamp(room, 0, 1);
      sh.plume.visible = on > 0.02 && lenK > 0.02;
      sh.plumeMat.uniforms.uOn.value = on;
      sh.plumeMat.uniforms.uTime.value = t;
      sh.plume.scale.set(0.8 + 0.25 * on, Math.max(0.02, lenK), 0.8 + 0.25 * on);
      if (sh.throat) {
        sh.throat.visible = on + rcs > 0.02;
        sh.throat.material.opacity = clamp(on + rcs, 0, 1);
        sh.throat.scale.setScalar(sh.plumeR * GLOW_KEEP * (rcs ? 1.7 : 3.0 + 2.5 * on));
      }

      // Smooth bay hatch egress/ingress + deep-space distance envelope
      var hatchEnv = smooth01(u / 0.055) * smooth01((1 - u) / 0.055) * distFade;
      sh.body.scale.setScalar(0.18 + 0.82 * hatchEnv);
      sh.holder.visible = flight.elapsed >= 0 && hatchEnv > 0.02;

      // Aviation strobes: steady-pulsing red/green, double-flash white
      var navPulse = 0.70 + 0.30 * Math.sin(t * 3.1 + i);
      if (sh.navR) sh.navR.material.opacity = navPulse;
      if (sh.navG) sh.navG.material.opacity = navPulse;
      if (sh.navW) {
        var ph = (t + i * 0.37) % 1.3;
        sh.navW.material.color.setHex(flight.mode === 'harvest' && outbound && u > .90 ? 0x78ffee : 0xffffff);
        sh.navW.material.opacity = flight.mode === 'harvest' && outbound && u > .90 ? .8 : (ph < 0.06 || (ph > 0.18 && ph < 0.24)) ? 1.0 : 0.05;
      }

      sh.state.u = u;
      sh.state.outbound = outbound;
      sh.state.port = portIdx;
      sh.state.phase = u < 0.09 ? 'egress' : u < 0.44 ? 'accelerate' : u < 0.56 ? 'flip' : u < 0.90 ? 'brake' : u >= 0.96 && outbound && flight.mode === 'harvest' ? 'extract' : 'berth';
      return sh.holder.visible;
    }

    function update(dt, t, env) {
      env = env || {};
      var mode = env.mode || (env.visible ? 'station' : 'off');
      var ok = mode !== 'off' && env.ports && env.ports.length && env.hub && env.hub.pos && env.hub.axis;
      if (mode !== 'harvest') ships.forEach(sh => { sh.harvestDone = false; });
      if (!ok) {
        ships.forEach(sh => { sh.flight = null; sh.holder.visible = false; });
        group.visible = false;
        activeCount = 0;
        return 0;
      }
      var portsW = env.ports.map(function (p) {
        return { pos: V3(p.pos), normal: V3(p.normal).normalize() };
      });
      var ctx = {
        portsW: portsW,
        hubW: { pos: V3(env.hub.pos), axis: V3(env.hub.axis).normalize() },
        distant: !!env.distant,
        avoidSphere: env.avoidSphere ? { c: V3(env.avoidSphere.center), r: env.avoidSphere.radius } : null,
        avoidCapsule: env.avoidCapsule ? { a: V3(env.avoidCapsule.a), b: V3(env.avoidCapsule.b), r: env.avoidCapsule.radius } : null
      };
      group.visible = true;
      var n = 0;
      var tt = typeof t === 'number' && isFinite(t) ? t : 0;
      for (var i = 0; i < ships.length; i++) {
        if (updateShip(ships[i], tt, ctx, Math.max(0, dt || 0), mode)) n++;
      }
      activeCount = n;
      group.visible = n > 0;
      return n;
    }

    function setVisible(v) {
      group.visible = !!v;
      if (!v) activeCount = 0;
    }

    function info() {
      return ships.map(function (sh) {
        return {
          cls: sh.cls.label, form: sh.cls.form, visible: sh.holder.visible && group.visible,
          phase: sh.state.phase, u: sh.state.u, outbound: sh.state.outbound, port: sh.state.port,
          pos: [sh.holder.position.x, sh.holder.position.y, sh.holder.position.z]
        };
      });
    }

    function dispose() {
      if (group.parent) group.parent.remove(group);
      disposables.forEach(function (d) { if (d && d.dispose) d.dispose(); });
      disposables = [];
    }

    return {
      group: group,
      classes: CLASSES,
      fleet: FLEET.slice(),
      update: update,
      setVisible: setVisible,
      get activeCount() { return activeCount; },
      info: info,
      dispose: dispose
    };
  }

  root.LighthuggerShuttles = { create: create, classes: CLASSES, fleet: FLEET.slice() };
})(typeof globalThis !== 'undefined' ? globalThis : this);
