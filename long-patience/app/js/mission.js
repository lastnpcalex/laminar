/* Dead Reckoning mission page: a three.js lighthugger scene behind electroluminescent
 * instrument panels. The briefing shows length contraction and time dilation against a
 * row of station buoys (with a choice of frame), then the ice-prow muon detector.
 * Station 1 calibrates the detector at rest and then measures the ship's speed.
 * Station 2 calibrates a spectrograph and measures starlight Doppler shifts ahead and behind.
 * Station 3 launches a cargo shuttle using relativistic velocity addition to dock with a moving platform.
 * All numbers come from physics.js, muonlab.js, and spectrolab.js; the 3D scene renders them live. */
(function () {
  "use strict";
  var DR = window.DR, P = DR.physics, R = DR.rng, M = DR.muonlab, SP = DR.spectrolab, T = window.THREE3;
  var $ = function (id) { return document.getElementById(id); };
  var each = function (sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); };

  var U = 40;                              // metres per scene unit
  var BOW = 23;                            // bow tip, scene x
  var ICE_END = BOW - M.CHANNEL / U;       // the seam where the ice prow meets the aft cone (scene x = -7)
  // The lighthugger asset (app/js/lighthugger-mesh.js) is scaled uniformly, so its ice needle spans the 1200 m bore
  var LH = DR.lighthugger, LH_SCALE = (BOW - ICE_END) / LH.extras.needle_length_units;
  var STERN = ICE_END - LH.extras.stub_length_units * LH_SCALE;
  var NEEDLE_R = LH.extras.seam_radius_units * LH_SCALE;             // ice radius at the seam, scene units (about 130 m)
  var NAC_Y = LH.extras.nacelle_lateral_units * LH_SCALE;            // ramjet pods, above and below the bore
  var EXIT_X = ICE_END + LH.extras.nacelle_exhaust_units * LH_SCALE; // ramjet nozzles, just aft of the seam
  var SHIP_M = (BOW - STERN) * U;          // metres at rest
  var STUDENT_CAL_HITS = 2000;             // hits needed in the weakest of the twelve sections
  var STUDENT_FLIGHT_HITS = 600;           // hits in the flight run before the nav computer unlocks
  var SLOWMO = 2;                          // briefing: microseconds of station time per real second
  var CU = 300 / U;                        // c in scene units per microsecond
  var BUOY = 200 / U;                      // buoy spacing, scene units
  var NBUOY = 197, SPAN = NBUOY * BUOY;    // a long row, so the moving one never runs out
  var RULER_Y = 11, STATION_BG = [15, 26, -115], STATION_DOCK = [BOW + 48.5, 0, 0];

  // ---- mission -------------------------------------------------------------------------
  var code = null;
  try {
    var q = new URLSearchParams(location.search).get("code");
    if (q) code = R.decodeCode(q).code;
  } catch (e) { code = null; }
  if (!code) code = R.randomCode();
  var m = M.mission(R.decodeCode(code).seed);
  var ideal = { seed: 271828, eff: M.SECTIONS.map(function () { return 1; }) };
  var started = false;

  var S = {
    step: "title", beta: 0.94, frame: "station", log: false, clock: 0, framesSeen: { station: false, ship: false },
    // Motion is essential to the lab demonstrations, including on reduced-motion desktops.
    motion: true,
    calRun: new M.Run(m, M.BEAM_BETA, "cal"), calOn: false, cal: null, calCounts: null, calSeconds: 0,
    flRun: new M.Run(m, m.beta, "flight"), flOn: false, recorded: null, flAnalyzed: false,
    demo: null, dopplerFrame: "rest", dopplerRecede: false, scale: 10, targetScale: 10, currScale: 10, scopeTheta: 30, scopeAz: 40, scopeIR: false, approachIR: false, scopeViewMode: "telescope", sxTarget: null, sxKey: "", sxSeen: {}, specView: null, lastSpec: null, faults: 0,
    terminalTriggered: false, speedVerified: false,
    // Station 2 state
    lamp: null, spectroCal: false, specDir: "bow", starBow: null, starStern: null, spectroSpeed: null,
    // Station 3 state
    platformW: m.colonyW, attempts: [], shuttleLaunched: false, shuttleDocked: false, shuttleMismatch: null, outcome: null, boomT: 0, platformEst: null, platformLineNm: null, starPicks: {}, lampLines: null, scopeMsg: null,
    shuttlePos: 0, shuttleVel: 0, courierPhase: "rails", colonyClock: 0, holdT: 0, driftT: 0, retClock0: 0, colonyD: 1, returnMismatch: null,
    returnLaunched: false, returnDocked: false, returnPos: 0, returnVel: 0, radiatorSelected: false, dockAttempted: false, dockSolverFailed: false, returnOutcome: null
  };

  // Camera presets: target x, y, z, yaw, pitch, distance.
  // Elevated Y centers the ship in the upper half of the viewport above the AR window.
  var STEPS = {
    title:         { where: "Briefing",                  cam: [0, 0, 0, 0.72, 0.16, 75],      engines: true },
    length:        { where: "Briefing 1 of 3",           cam: [0, 2.0, 0, 0, 0.08, 126],     ruler: true },
    time:          { where: "Briefing 2 of 3",           cam: [0, 2.0, 0, 0, 0.08, 126],     ruler: true, clocks: true },
    muons:         { where: "Briefing 3 of 3",           cam: [2, 5.5, 0, 0.14, 0.16, 90],    graph: true },
    doppler:       { where: "Briefing: Doppler",          cam: [0, 1.5, 0, 0, 0.1, 148],      engines: true },
    cal:           { where: "Station 1: calibrate",      cam: [3, 9.5, -10, 0.30, 0.20, 114], graph: true, dock: true },
    flight:        { where: "Station 1: measure",        cam: [1, 2.5, 0, -0.24, 0.22, 78],   graph: true, engines: true },
    next:          { where: "Station 1: done",           cam: [0, 0, 0, 0.72, 0.16, 56],      engines: true },
    "spectro-cal": { where: "Sextant: calibrate",        cam: [4, -4.0, 0, 0.22, 0.24, 56],     spectro: true },
    "spectro-star":{ where: "Sextant: starlight",         cam: [8, -3.5, 0, 0.08, 0.22, 58],   spectro: true },
    dock:          { where: "Sextant: waypoint search",  cam: [8, -3.5, 0, 0.08, 0.22, 58],   spectro: true },
    courier:       { where: "Probe control: courier",    cam: [0, 5, 0, 0.36, 0.16, 130], shuttle: true, engines: true },
    summary:       { where: "Mission certified",         cam: [0, 0, 0, 0.72, 0.16, 56],      engines: true }
  };
  if (typeof window !== "undefined") window.DR_STEPS = STEPS;

  // ---- formatting ----------------------------------------------------------------------
  function f(x, d) { return Number(x).toFixed(d); }
  function pm(x, e) { var d = e > 0 && e < 0.001 ? 4 : 3; return f(x, d) + " ± " + f(e, d); }
  function announce(text) { var s = $("status"); s.textContent = ""; setTimeout(function () { s.textContent = text; }, 30); }
  function niceCeil(v) {
    var p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1e-9)))), r = v / p;
    return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10) * p;
  }
  // Tick spacing of 1, 2 or 5 times a power of ten, giving about `want` ticks over 0..top
  function calReady() {
    return Math.min.apply(null, S.calRun.counts) >= STUDENT_CAL_HITS;
  }
  function calNeedText() {
    return "Count until every section has at least " + STUDENT_CAL_HITS + " hits (the weakest section sets your precision), then store the calibration.";
  }
  function flightReady() {
    return S.flRun.total() >= STUDENT_FLIGHT_HITS;
  }
  function niceStep(top, want) {
    var raw = Math.max(top, 1e-9) / want, p = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / p;
    return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10) * p;
  }
  function gammaOf(b) { return P.gamma(Math.min(b, 0.999)); }
  function xAt(d) { return BOW - d / U; }                       // bore position in the ship, scene x
  // Ice radius at scene x: accurate taper from NEEDLE_R at the seam to 0.24 at the blunt nose
  function halfWidth(x) {
    var u = Math.max(0, Math.min(1, (BOW - x) / (BOW - ICE_END)));
    return 0.24 + (NEEDLE_R - 0.24) * Math.pow(u, 0.95);
  }
  // The needle is circular in section, so its half-thickness equals its radius
  function iceHalfT(x) { return halfWidth(x); }
  // Radius for sensor rings, flashes and labels: the local radius of the ice
  function iceR(x) { return halfWidth(x); }

  // ---- the catalog sky -------------------------------------------------------------------
  // One star database serves every sextant task. The sky is 3,200 field stars; the brightest 100 are
  // named catalog entries, and nearby catalog stars are joined into constellations. Four signature
  // stars sit at fixed rest-frame bearings. Whatever the sextant is pointed at is looked up here.
  var RAD = Math.PI / 180, SKY_R = 520;
  var SIGNATURE = [
    { id: "A", name: "Acrux", con: "Crux", az: 40, T: 28000 },
    { id: "B", name: "Vega", con: "Lyra", az: 305, T: 9500 },
    { id: "C", name: "Arcturus", con: "Bootes", az: 200, T: 4300 },
    { id: "D", name: "Betelgeuse", con: "Orion", az: 130, T: 3400 }
  ];
  var STAR_NAMES = ["Sirius", "Canopus", "Rigel", "Procyon", "Capella", "Achernar", "Hadar", "Altair", "Aldebaran", "Antares",
    "Spica", "Pollux", "Fomalhaut", "Deneb", "Mimosa", "Regulus", "Adhara", "Castor", "Gacrux", "Shaula", "Bellatrix", "Elnath",
    "Miaplacidus", "Alnilam", "Alnair", "Alnitak", "Alioth", "Mirfak", "Dubhe", "Wezen", "Sargas", "Avior", "Alkaid", "Menkalinan",
    "Atria", "Alhena", "Peacock", "Alphard", "Hamal", "Algieba", "Diphda", "Nunki", "Menkent", "Mirach", "Alpheratz", "Rasalhague",
    "Kochab", "Saiph", "Denebola", "Algol", "Thuban", "Alcyone", "Sadr", "Mizar", "Albireo", "Almach", "Alphecca", "Alshain", "Alderamin", "Ankaa",
    "Arneb", "Ascella", "Aspidiske", "Caph", "Cor Caroli", "Cursa", "Dschubba", "Edasich", "Eltanin", "Enif", "Furud", "Gienah", "Graffias",
    "Hassaleh", "Izar", "Kaus Media", "Kornephoros", "Larawag", "Markab", "Matar", "Megrez", "Merak", "Mintaka", "Muphrid", "Naos", "Phad",
    "Rasalgethi", "Rotanev", "Sabik", "Scheat", "Schedar", "Segin", "Sheratan", "Tarazed", "Unukalhai", "Vindemiatrix", "Zaurak", "Zosma"];
  var CON_NAMES = ["Crux", "Lyra", "Bootes", "Orion", "Cygnus", "Scorpius", "Cassiopeia", "Ursa Major", "Centaurus", "Leo", "Gemini", "Taurus"];
  var DB_SIZE = 100;
  // Cool infrared sources, as the thermal array sees them. They carry no names until a spectrum is taken.
  // Directions are bearings in the ship frame. The colony and its look-alike appear only once the courier
  // is being planned. The colony moves along a track parallel to the flight axis, so from far off it sits
  // 1.2 degrees from the bow. The line is generated at that angle; the collinear formula students use is
  // then off by under 0.2 nm (below one spectrograph pixel) and under 0.001 in w.
  var THERMAL = [
    { id: "IR-1", kind: "radiator", T: 600, theta: 1.2, az: 92.5, stage: "dock" },
    { id: "IR-2", kind: "thermal", T: 1100, theta: 6.5, az: 67.2, stage: "dock" },
    { id: "IR-3", kind: "thermal", T: 900, theta: 47, az: 250 },
    { id: "IR-4", kind: "thermal", T: 1400, theta: 128, az: 20 },
    { id: "IR-5", kind: "dust", T: 320, theta: 66, az: 160 }
  ];
  function spectralClass(T) {
    var bands = [[30000, 52000, "O"], [10000, 30000, "B"], [7500, 10000, "A"], [6000, 7500, "F"], [5200, 6000, "G"], [3700, 5200, "K"], [2000, 3700, "M"]];
    for (var i = 0; i < bands.length; i++) {
      if (T >= bands[i][0]) return bands[i][2] + Math.min(9, Math.floor(10 * (bands[i][1] - T) / (bands[i][1] - bands[i][0])));
    }
    return "M9";
  }
  // ---- 3D scene ------------------------------------------------------------------------
  var G = null;
  try { if (T) { G = build3d(); if (typeof window !== "undefined") window.DR_G = G; } } catch (e) { G = null; if (window.console) console.warn("3D view off:", e); }
  if (!G) $("nogl").hidden = false;

  function canvasTex(w, h, draw) {
    var c = document.createElement("canvas"); c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }
  function glowTex() {
    return canvasTex(64, 64, function (g, w) {
      var r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.25, "rgba(255,255,255,.55)"); r.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = r; g.fillRect(0, 0, w, w);
    });
  }
  function hash(a, b, c) { var h = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453; return (h - Math.floor(h)) * 2 - 1; }
  function alongX(g) { g.rotateZ(-Math.PI / 2); return g; }   // cylinder axis y -> x, top at +x
  function rod(a, b, r, mat) {
    var d = new T.Vector3().subVectors(b, a), mesh = new T.Mesh(new T.CylinderGeometry(r, r, d.length(), 8), mat);
    mesh.position.copy(a).addScaledVector(d, 0.5);
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
    return mesh;
  }

  // Approximate blackbody color (T in kelvin), components 0..1 (Tanner Helland algorithm)
  function bbColor(T) {
    var t = Math.min(40000, Math.max(1000, T)) / 100, r, g, b;
    r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = t >= 66 ? 255 : (t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307);
    return [
      Math.min(255, Math.max(0, r)) / 255,
      Math.min(255, Math.max(0, g)) / 255,
      Math.min(255, Math.max(0, b)) / 255
    ];
  }

  // Colour multiplier for a surface whose light is a blackbody at Trest, seen with Doppler factor D
  // (observed / emitted frequency). The observed light is a blackbody at D * Trest, so the multiplier is the
  // ratio of the two blackbody colours, scaled so its largest channel is 1 (hue only; brightness separate).
  var SUN_K = 5800;
  function dopplerTint(Trest, D) {
    var a = bbColor(Trest * D), b = bbColor(Trest);
    var t = [a[0] / Math.max(b[0], 1e-3), a[1] / Math.max(b[1], 1e-3), a[2] / Math.max(b[2], 1e-3)];
    var mx = Math.max(t[0], t[1], t[2], 1e-6);
    return [t[0] / mx, t[1] / mx, t[2] / mx];
  }

  function updateStars(starMesh, catalog, beta) {
    var b = Math.max(0, Math.min(0.992, beta));
    var pos = starMesh.geometry.attributes.position.array;
    var col = starMesh.geometry.attributes.color.array;
    var n = catalog.length;

    for (var i = 0; i < n; i++) {
      var s = catalog[i];
      var cosR = s.x0; // cosine with flight axis +x
      var cosO = b > 0 ? P.aberrate(b, cosR) : cosR;
      var sinR = Math.sqrt(Math.max(0, 1 - cosR * cosR));
      var sinO = Math.sqrt(Math.max(0, 1 - cosO * cosO));
      var k = sinR > 1e-6 ? sinO / sinR : 0;

      // Relativistic Doppler frequency factor: delta = nu_obs / nu_rest = gamma * (1 + beta * cosR).
      // A shifted blackbody has temperature delta * T; bbColor approximates its display colour.
      var delta = b > 0 ? P.frequencyFactor(b, cosR) : 1;
      var rgb = bbColor(s.T * delta);

      // Brightness rises with delta (bolometric flux goes as delta^4). A screen cannot show that range,
      // so the gain is compressed to a monotonic, capped curve: ahead brighter, astern dimmer.
      var I = s.b * (0.45 + 0.55 * Math.min(3.2, delta));
      var r = rgb[0], g = rgb[1], bl = rgb[2];

      var o = 3 * i;
      pos[o] = SKY_R * cosO;
      pos[o + 1] = SKY_R * (k * s.y0);
      pos[o + 2] = SKY_R * (k * s.z0);

      col[o] = Math.min(2.5, r * I);
      col[o + 1] = Math.min(2.5, g * I);
      col[o + 2] = Math.min(2.5, bl * I);
    }
    starMesh.geometry.attributes.position.needsUpdate = true;
    starMesh.geometry.attributes.color.needsUpdate = true;
  }

  function getEffectiveBeta() {
    var st = STEPS[S.step] || STEPS.title;
    if (st.dock) return 0; // Docked at Waypoint Station (cal)
    if (st.ruler && !(S.step === "length" && S.frame === "ship")) return 0; // Time briefing uses the station frame.
    if (S.step === "flight" || S.step === "next" || S.step === "courier" || S.step === "summary" || isSextantStep(S.step)) {
      return (m && typeof m.beta === "number") ? m.beta : 0.85;
    }
    return typeof S.beta === "number" ? S.beta : 0.80;
  }

  function build3d() {
    var canvas = $("scene");
    var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    var scene = new T.Scene();
    scene.fog = new T.FogExp2(0x010708, 0.0016);
    var camera = new T.PerspectiveCamera(42, 1, 0.08, 1800);

    // lights: warm primary key, soft cyan rim, violet aft rim to accentuate hull lines
    var ambient = new T.AmbientLight(0x223242, 1.8); scene.add(ambient);
    var sun = new T.DirectionalLight(0xfff0dd, 3.2); sun.position.set(40, 50, 45); scene.add(sun);
    var blueRim = new T.DirectionalLight(0x40a0ff, 2.2); blueRim.position.set(-50, -20, -40); scene.add(blueRim);
    var aftRim = new T.DirectionalLight(0x7560e0, 1.6); aftRim.position.set(-70, 20, 25); scene.add(aftRim);
    // Courier run: one sunlike illuminant, so the only colour change on the colony is its Doppler shift.
    var courierFill = new T.DirectionalLight(0xfff0dd, 0); courierFill.position.set(-60, 25, 35); scene.add(courierFill);

    // Slipstream ice snow (peels off the tapered bow cone from x <= BOW and flows aft; never fore of BOW)
    var ND = 32, dp = new Float32Array(ND * 6), dust = [];
    for (var i = 0; i < ND; i++) {
      var dAng = Math.random() * Math.PI * 2;
      var dr0 = 0.08 + Math.random() * 0.55;
      var px0 = (ICE_END - 26) + (i / ND) * (BOW - (ICE_END - 26));
      var p0 = { x: px0, r0: dr0, ny: Math.cos(dAng), nz: Math.sin(dAng) };
      dust.push(p0);
      dp[6 * i] = p0.x; dp[6 * i + 1] = p0.ny * 0.2; dp[6 * i + 2] = p0.nz * 0.2;
      dp[6 * i + 3] = Math.min(BOW, p0.x + 0.36); dp[6 * i + 4] = p0.ny * 0.2; dp[6 * i + 5] = p0.nz * 0.2;
    }
    var dg = new T.BufferGeometry(); dg.setAttribute("position", new T.BufferAttribute(dp, 3));
    var dustLines = new T.LineSegments(dg, new T.LineBasicMaterial({ color: 0xc2ebff, transparent: true, opacity: 0.62, depthTest: true, depthWrite: false }));
    dustLines.renderOrder = 4;
    scene.add(dustLines);

    // Hypervelocity Relativistic Spallation Streaks (intermittent micro-ablation off glacial ice shield)
    var N_SPALL = 40;
    var spallPos = new Float32Array(N_SPALL * 6); // 2 vertices per streak line
    var spallCol = new Float32Array(N_SPALL * 6);
    var spallGeo = new T.BufferGeometry();
    spallGeo.setAttribute("position", new T.BufferAttribute(spallPos, 3));
    spallGeo.setAttribute("color", new T.BufferAttribute(spallCol, 3));

    var spallMat = new T.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: T.AdditiveBlending,
      depthTest: true,
      depthWrite: false
    });
    var spallLines = new T.LineSegments(spallGeo, spallMat);
    spallLines.renderOrder = 4;

    var spallStreaks = [];
    for (var sn = 0; sn < N_SPALL; sn++) {
      spallStreaks.push({
        active: false,
        spawnX: 0,
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        maxLen: 1.0,
        life: 0, maxLife: 0.5
      });
    }

    // ---- Relativistic background starfield ----
    var N_STARS = 3200;
    var starCatalog = [];
    var skyRng = R.makeRng(137, "starfield", 0);
    for (var is = 0; is < N_STARS; is++) {
      var sx0 = 2 * skyRng.uniform() - 1; // cosine with flight axis +x
      var sphi = 2 * Math.PI * skyRng.uniform();
      var ss0 = Math.sqrt(Math.max(0, 1 - sx0 * sx0));
      var sy0 = ss0 * Math.cos(sphi);
      var sz0 = ss0 * Math.sin(sphi);
      if (skyRng.uniform() < 0.42) {
        // A dense galactic band, like the Milky Way in a wide-field telescope.
        sy0 *= 0.16 + skyRng.uniform() * 0.16;
        var sinv = 1 / Math.sqrt(sx0 * sx0 + sy0 * sy0 + sz0 * sz0);
        sx0 *= sinv; sy0 *= sinv; sz0 *= sinv;
      }
      var sT_rest = Math.exp(skyRng.range(Math.log(3200), Math.log(24000)));
      var sb0 = Math.pow(skyRng.uniform(), 2.4) * 0.85 + 0.25;
      starCatalog.push({ x0: sx0, y0: sy0, z0: sz0, T: sT_rest, b: sb0 });
    }

    var starPos = new Float32Array(N_STARS * 3);
    var starCol = new Float32Array(N_STARS * 3);
    var starGeo = new T.BufferGeometry();
    starGeo.setAttribute("position", new T.BufferAttribute(starPos, 3));
    starGeo.setAttribute("color", new T.BufferAttribute(starCol, 3));

    var starDiscTex = canvasTex(64, 64, function (g, w) {
      var r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      r.addColorStop(0, "rgba(255,255,255,1)");
      r.addColorStop(0.2, "rgba(255,255,255,0.92)");
      r.addColorStop(0.5, "rgba(255,255,255,0.32)");
      r.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = r; g.fillRect(0, 0, w, w);
    });

    var starMat = new T.PointsMaterial({
      size: 3.3,
      map: starDiscTex,
      vertexColors: true,
      transparent: true,
      blending: T.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: false,
      fog: false
    });
    var starPoints = new T.Points(starGeo, starMat);
    starPoints.frustumCulled = false;
    scene.add(starPoints);

    // ---- Catalog sky: signature stars, named database stars, constellations, IR sources ----
    var refStarGroup = new T.Group(); scene.add(refStarGroup);
    var STAR_INFO = {
      A: { name: "Acrux", type: "B0.5IV", tempK: 28000, color: 0x75d5ff, hex: "#8ad8ff" },
      B: { name: "Vega", type: "A0V", tempK: 9500, color: 0xdff5ff, hex: "#f0f8ff" },
      C: { name: "Arcturus", type: "K1.5III", tempK: 4300, color: 0xffbe6b, hex: "#ffbe6b" },
      D: { name: "Betelgeuse", type: "M1-2Ia", tempK: 3400, color: 0xff6262, hex: "#ff7575" }
    };
    // The four signature stars take the first four catalog slots, at their fixed rest-frame bearings.
    SP.STAR_CATALOG.forEach(function (st, k) {
      var r = st.restDeg * RAD, a = SIGNATURE[k].az * RAD;
      starCatalog[k] = { x0: Math.cos(r), y0: Math.sin(r) * Math.cos(a), z0: Math.sin(r) * Math.sin(a), T: SIGNATURE[k].T, b: 1.35 };
    });
    var db = [], dbOfIdx = {}, nameCursor = 0;
    starCatalog.map(function (s, i) { return i; })
      .sort(function (a, b) { return (starCatalog[b].b - starCatalog[a].b) || (a - b); })
      .slice(0, DB_SIZE).forEach(function (idx, rank) {
        var s = starCatalog[idx], sig = idx < SIGNATURE.length ? SIGNATURE[idx] : null;
        var entry = { idx: idx, rank: rank, name: sig ? sig.name : STAR_NAMES[nameCursor++], con: "", T: s.T, cls: spectralClass(s.T),
          restDeg: Math.acos(Math.max(-1, Math.min(1, s.x0))) / RAD, sig: sig ? sig.id : "" };
        db.push(entry); dbOfIdx[idx] = entry;
      });
    function restAngle(i, j) {
      var a = starCatalog[i], b = starCatalog[j];
      return Math.acos(Math.max(-1, Math.min(1, a.x0 * b.x0 + a.y0 * b.y0 + a.z0 * b.z0))) / RAD;
    }
    // Constellations: each is a seed star plus its nearest unclaimed neighbours, joined by a minimum spanning tree.
    var clusters = [], claimed = {}, conNext = 0;
    function growCluster(seed, name) {
      var members = [seed];
      db.map(function (e) { return e.idx; }).filter(function (i) { return i !== seed && !claimed[i]; })
        .map(function (i) { return { i: i, d: restAngle(seed, i) }; })
        .sort(function (p, q) { return p.d - q.d; })
        .slice(0, 4).forEach(function (c) { if (c.d < 46) members.push(c.i); });
      if (members.length < 3) return false;
      var lines = [], inTree = [0];
      while (inTree.length < members.length) {
        var best = null;
        inTree.forEach(function (a) {
          members.forEach(function (_, b) {
            if (inTree.indexOf(b) >= 0) return;
            var ang = restAngle(members[a], members[b]);
            if (!best || ang < best.ang) best = { a: a, b: b, ang: ang };
          });
        });
        lines.push([best.a, best.b]); inTree.push(best.b);
      }
      members.forEach(function (i) { claimed[i] = true; dbOfIdx[i].con = name; });
      clusters.push({ name: name, members: members, lines: lines });
      return true;
    }
    SIGNATURE.forEach(function (sg, k) { growCluster(k, CON_NAMES[k]); conNext = k + 1; });
    db.forEach(function (e) {
      if (claimed[e.idx] || conNext >= CON_NAMES.length || clusters.length >= 10) return;
      if (growCluster(e.idx, CON_NAMES[conNext])) conNext++;
    });

    var starHaloTex = canvasTex(256, 256, function (g, w) {
      var cx = w / 2, cy = w / 2;
      var rOuter = g.createRadialGradient(cx, cy, 0, cx, cy, cx);
      rOuter.addColorStop(0.0, "rgba(255,255,255,0.85)");
      rOuter.addColorStop(0.14, "rgba(255,255,255,0.55)");
      rOuter.addColorStop(0.35, "rgba(255,255,255,0.14)");
      rOuter.addColorStop(0.70, "rgba(255,255,255,0.02)");
      rOuter.addColorStop(1.0, "rgba(255,255,255,0)");
      g.fillStyle = rOuter; g.fillRect(0, 0, w, w);
      var rCore = g.createRadialGradient(cx, cy, 0, cx, cy, 30);
      rCore.addColorStop(0.0, "rgba(255,255,255,1.0)");
      rCore.addColorStop(0.3, "rgba(255,255,255,0.9)");
      rCore.addColorStop(1.0, "rgba(255,255,255,0)");
      g.fillStyle = rCore; g.beginPath(); g.arc(cx, cy, 30, 0, Math.PI * 2); g.fill();
      // Diffraction spikes from the telescope support vanes.
      function spike(angle, length, baseWidth) {
        g.save(); g.translate(cx, cy); g.rotate(angle);
        var grad = g.createLinearGradient(0, 0, length, 0);
        grad.addColorStop(0, "rgba(255,255,255,0.9)"); grad.addColorStop(0.3, "rgba(255,255,255,0.45)"); grad.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = grad; g.beginPath(); g.moveTo(0, -baseWidth / 2); g.lineTo(length, 0); g.lineTo(0, baseWidth / 2); g.closePath(); g.fill();
        g.restore();
      }
      [0, Math.PI / 2, Math.PI, Math.PI * 1.5].forEach(function (a) { spike(a, cx * 0.95, 2.6); });
    });
    // Bright catalog stars: the same stars as the field, drawn again with a halo and diffraction spikes.
    var dbPos = new Float32Array(DB_SIZE * 3), dbCol = new Float32Array(DB_SIZE * 3);
    var dbGeo = new T.BufferGeometry();
    dbGeo.setAttribute("position", new T.BufferAttribute(dbPos, 3));
    dbGeo.setAttribute("color", new T.BufferAttribute(dbCol, 3));
    var dbMat = new T.PointsMaterial({ size: 34, map: starHaloTex, vertexColors: true, transparent: true, blending: T.AdditiveBlending,
      depthWrite: false, sizeAttenuation: false, fog: false });
    var dbPoints = new T.Points(dbGeo, dbMat);
    dbPoints.frustumCulled = false; scene.add(dbPoints);
    var dbWorld = db.map(function () { return new T.Vector3(); });
    function syncDb() {
      var sp = starPoints.geometry.attributes.position.array, sc = starPoints.geometry.attributes.color.array;
      dbPoints.position.copy(starPoints.position);
      for (var k = 0; k < db.length; k++) {
        var o = 3 * db[k].idx, q = 3 * k;
        dbPos[q] = sp[o]; dbPos[q + 1] = sp[o + 1]; dbPos[q + 2] = sp[o + 2];
        dbCol[q] = sc[o] * 0.8; dbCol[q + 1] = sc[o + 1] * 0.8; dbCol[q + 2] = sc[o + 2] * 0.8;
        dbWorld[k].set(sp[o], sp[o + 1], sp[o + 2]).add(starPoints.position);
      }
      dbGeo.attributes.position.needsUpdate = true; dbGeo.attributes.color.needsUpdate = true;
    }
    var lineCount = 0;
    clusters.forEach(function (c) { lineCount += c.lines.length; });
    var constellationGeo = new T.BufferGeometry();
    constellationGeo.setAttribute("position", new T.BufferAttribute(new Float32Array(lineCount * 2 * 3), 3));
    var constellationLines = new T.LineSegments(constellationGeo, new T.LineBasicMaterial({ color: 0x58c9c1, transparent: true, opacity: 0.5, depthWrite: false }));
    constellationLines.frustumCulled = false; scene.add(constellationLines);
    var conCentroids = clusters.map(function () { return new T.Vector3(); });
    // Faint planetarium grid: meridians and parallels every 30 degrees.
    var skyGridGeo = new T.BufferGeometry(), gridVerts = [];
    for (var ga = 0; ga < 12; ga++) {
      var az0 = ga * 30 * Math.PI / 180;
      for (var gt = 0; gt < 18; gt++) {
        var t0 = gt * 10 * Math.PI / 180, t1 = (gt + 1) * 10 * Math.PI / 180;
        gridVerts.push(436*Math.cos(t0),436*Math.sin(t0)*Math.cos(az0),436*Math.sin(t0)*Math.sin(az0),
                       436*Math.cos(t1),436*Math.sin(t1)*Math.cos(az0),436*Math.sin(t1)*Math.sin(az0));
      }
    }
    for (var gp = 1; gp < 6; gp++) {
      var th0 = gp * 30 * Math.PI / 180;
      for (var gz = 0; gz < 36; gz++) {
        var a0 = gz * 10 * Math.PI / 180, a1 = (gz + 1) * 10 * Math.PI / 180;
        gridVerts.push(436*Math.cos(th0),436*Math.sin(th0)*Math.cos(a0),436*Math.sin(th0)*Math.sin(a0),
                       436*Math.cos(th0),436*Math.sin(th0)*Math.cos(a1),436*Math.sin(th0)*Math.sin(a1));
      }
    }
    skyGridGeo.setAttribute("position", new T.BufferAttribute(new Float32Array(gridVerts), 3));
    var skyGrid = new T.LineSegments(skyGridGeo, new T.LineBasicMaterial({ color: 0x2a7a76, transparent: true, opacity: 0.2, depthWrite: false }));
    skyGrid.frustumCulled = false; refStarGroup.add(skyGrid);
    // Infrared sources: invisible to the optical sight, dark blobs on the white-cold thermal array.
    var thermalGroup = new T.Group(); scene.add(thermalGroup); thermalGroup.visible = false;
    var thermalSprites = THERMAL.map(function (src) {
      var sp = new T.Sprite(new T.SpriteMaterial({ map: glowTex(), color: 0x0b0b0b, transparent: true, depthWrite: false, depthTest: false }));
      sp.scale.set(12, 12, 1); thermalGroup.add(sp); return sp;
    });

    // =========================================================================
    // ---- Slick AAA Procedural Celestial Bodies in Deep Background ----
    // =========================================================================
    function makePlanetNoise(seed) {
      var s = seed % 2147483647; if (s <= 0) s += 2147483646;
      function rnd() { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }
      var p = new Uint8Array(512);
      for (var i = 0; i < 256; i++) p[i] = i;
      for (var j = 255; j > 0; j--) { var k = Math.floor(rnd() * (j + 1)), t = p[j]; p[j] = p[k]; p[k] = t; }
      for (var l = 0; l < 256; l++) p[256 + l] = p[l];
      function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
      function grad(h, x, y) {
        switch (h & 3) { case 0: return x + y; case 1: return -x + y; case 2: return x - y; default: return -x - y; }
      }
      return function (x, y) {
        var X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
        var xf = x - Math.floor(x), yf = y - Math.floor(y);
        var u = fade(xf), v = fade(yf);
        var aa = p[p[X] + Y], ab = p[p[X] + Y + 1], ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1];
        var x1 = grad(aa, xf, yf) * (1 - u) + grad(ba, xf - 1, yf) * u;
        var x2 = grad(ab, xf, yf - 1) * (1 - u) + grad(bb, xf - 1, yf - 1) * u;
        return x1 * (1 - v) + x2 * v;
      };
    }

    // 1. Procedural Super-Neptune Frost Giant ("Glacies-9")
    function renderFrostGiantCanvas(ctx, W, H) {
      var img = ctx.createImageData(W, H), d = img.data;
      var n1 = makePlanetNoise(8821), n2 = makePlanetNoise(5432), n3 = makePlanetNoise(1993);
      for (var y = 0; y < H; y++) {
        var v = y / H, cosLat = Math.cos((v - 0.5) * Math.PI), jet = Math.sin(v * Math.PI * 8) * 0.12;
        for (var x = 0; x < W; x++) {
          var u = x / W, a = u * Math.PI * 2, cx = Math.cos(a) * 2.0, cz = Math.sin(a) * 2.0, cy = v * 4.0;
          var q = n1(cx * 1.5 + jet, cy * 1.5), r = n2(cz * 2.5 + q * 0.8, cy * 2.5), turb = r + n3(cx * 6.0, cy * 6.0) * 0.3;
          var belt = Math.sin(v * Math.PI * 12 + turb * 1.0) * 0.5 + 0.5;
          var red = 0.05 + 0.12 * belt + 0.16 * Math.pow(cosLat, 1.8);
          var grn = 0.16 + 0.36 * belt + 0.32 * Math.pow(cosLat, 1.4);
          var blu = 0.38 + 0.44 * belt + 0.18 * Math.pow(cosLat, 0.9);
          var dxSpot = ((u - 0.42 + 1.5) % 1.0) - 0.5, dySpot = (v - 0.63) * 2.2, rSpot = Math.sqrt(dxSpot * dxSpot * 5.0 + dySpot * dySpot);
          if (rSpot < 0.14) { var sf = Math.pow(1.0 - rSpot / 0.14, 1.8); red = red * (1 - sf * 0.8) + 0.01 * sf; grn = grn * (1 - sf * 0.7) + 0.03 * sf; blu = blu * (1 - sf * 0.5) + 0.12 * sf; }
          var idx = (y * W + x) * 4;
          d[idx] = Math.min(255, red * 255); d[idx + 1] = Math.min(255, grn * 255); d[idx + 2] = Math.min(255, blu * 255); d[idx + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    }

    // 2. Procedural Jovian Gas Giant ("Aeolus Prime")
    function renderJovianCanvas(ctx, W, H) {
      var img = ctx.createImageData(W, H), d = img.data;
      var n1 = makePlanetNoise(3311), n2 = makePlanetNoise(7744), n3 = makePlanetNoise(9922);
      for (var y = 0; y < H; y++) {
        var v = y / H, cosLat = Math.cos((v - 0.5) * Math.PI), jet = Math.sin(v * Math.PI * 14) * 0.16;
        for (var x = 0; x < W; x++) {
          var u = x / W, a = u * Math.PI * 2, cx = Math.cos(a) * 2.2, cz = Math.sin(a) * 2.2, cy = v * 4.5;
          var q = n1(cx * 1.6 + jet, cy * 1.6), r = n2(cz * 2.8 + q * 0.9, cy * 2.8), turb = r + n3(cx * 7.0, cy * 7.0) * 0.35;
          var belt = Math.sin(v * Math.PI * 16 + turb * 1.1) * 0.5 + 0.5;
          var red = 0.72 + 0.22 * belt - 0.15 * Math.pow(cosLat, 2.0);
          var grn = 0.50 + 0.28 * (1.0 - belt) - 0.12 * Math.pow(cosLat, 2.0);
          var blu = 0.32 + 0.22 * Math.pow(1.0 - belt, 2.0);
          var dxSpot = ((u - 0.65 + 1.5) % 1.0) - 0.5, dySpot = (v - 0.68) * 2.4, rSpot = Math.sqrt(dxSpot * dxSpot * 4.2 + dySpot * dySpot);
          if (rSpot < 0.16) { var sf = Math.pow(1.0 - rSpot / 0.16, 1.6); red = red * (1 - sf * 0.2) + 0.88 * sf; grn = grn * (1 - sf * 0.6) + 0.22 * sf; blu = blu * (1 - sf * 0.7) + 0.15 * sf; }
          var idx = (y * W + x) * 4;
          d[idx] = Math.min(255, red * 255); d[idx + 1] = Math.min(255, grn * 255); d[idx + 2] = Math.min(255, blu * 255); d[idx + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    }

    // 3. Procedural Sub-Stellar Brown Dwarf ("Pyre-Delta", Class T - Photorealistic, Non-Glowing)
    function renderBrownDwarfCanvas(ctx, W, H) {
      var img = ctx.createImageData(W, H), d = img.data;
      var n1 = makePlanetNoise(4419), n2 = makePlanetNoise(8812), n3 = makePlanetNoise(2231);
      for (var y = 0; y < H; y++) {
        var v = y / H, jet = Math.sin(v * Math.PI * 10) * 0.14;
        for (var x = 0; x < W; x++) {
          var u = x / W, a = u * Math.PI * 2, cx = Math.cos(a) * 2.2, cz = Math.sin(a) * 2.2, cy = v * 4.2;
          var q = n1(cx * 1.8 + jet, cy * 1.8), r = n2(cz * 3.2 + q * 1.0, cy * 3.2), turb = r + n3(cx * 8.0, cy * 8.0) * 0.3;
          var belt = Math.sin(v * Math.PI * 14 + turb * 1.2) * 0.5 + 0.5;
          var red = 0.28 + 0.22 * belt;
          var grn = 0.10 + 0.12 * belt * belt;
          var blu = 0.05 + 0.06 * (1.0 - belt);
          var idx = (y * W + x) * 4;
          d[idx] = Math.min(255, red * 255); d[idx + 1] = Math.min(255, grn * 255); d[idx + 2] = Math.min(255, blu * 255); d[idx + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    }

    // 4. Procedural Cryo-Moon / Planetoid ("Triton-Beta")
    function renderCryoMoonCanvas(ctx, W, H) {
      var img = ctx.createImageData(W, H), d = img.data;
      var n1 = makePlanetNoise(7123), n2 = makePlanetNoise(3901);
      for (var y = 0; y < H; y++) {
        var v = y / H;
        for (var x = 0; x < W; x++) {
          var u = x / W, a = u * Math.PI * 2, cx = Math.cos(a) * 2.5, cz = Math.sin(a) * 2.5, cy = v * 5.0;
          var crags = n1(cx * 3.0, cy * 3.0) * 0.5 + n2(cx * 9.0, cz * 9.0) * 0.25;
          var lineae = Math.pow(Math.max(0, 1.0 - Math.abs(n1(cx * 5.5, cy * 5.5)) * 3.0), 2.0);
          var red = 0.55 + 0.25 * crags - 0.22 * lineae;
          var grn = 0.62 + 0.26 * crags - 0.18 * lineae;
          var blu = 0.70 + 0.25 * crags - 0.05 * lineae;
          var idx = (y * W + x) * 4;
          d[idx] = Math.min(255, red * 255); d[idx + 1] = Math.min(255, grn * 255); d[idx + 2] = Math.min(255, blu * 255); d[idx + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    }

    // 5. Procedural Rings Texture (fine division stripes)
    function renderRingCanvas(ctx, W, H) {
      var grad = ctx.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0.00, "rgba(0,0,0,0)");
      grad.addColorStop(0.15, "rgba(170, 225, 255, 0.65)");
      grad.addColorStop(0.48, "rgba(215, 245, 255, 0.90)");
      grad.addColorStop(0.64, "rgba(0, 0, 0, 0.02)"); // Cassini division
      grad.addColorStop(0.68, "rgba(175, 225, 255, 0.75)");
      grad.addColorStop(0.92, "rgba(0, 0, 0, 0.04)"); // Encke gap
      grad.addColorStop(1.00, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    var frostGiantTex = canvasTex(1024, 512, renderFrostGiantCanvas);
    var jovianTex = canvasTex(1024, 512, renderJovianCanvas);
    var brownDwarfTex = canvasTex(1024, 512, renderBrownDwarfCanvas);
    var cryoMoonTex = canvasTex(512, 256, renderCryoMoonCanvas);
    // Longitude wraps, but opposite poles must never be sampled across one another.
    [frostGiantTex, jovianTex, brownDwarfTex, cryoMoonTex].forEach(function (tex) {
      tex.wrapT = T.ClampToEdgeWrapping;
      tex.needsUpdate = true;
    });
    var ringTex = canvasTex(1024, 16, renderRingCanvas);

    // Single Celestial Group for Sequential Procedural Flyby Encounters (NO Clumping, NO Fake Glow!)
    var celestialGroup = new T.Group();
    scene.add(celestialGroup);

    var planetMat = new T.MeshStandardMaterial({
      map: frostGiantTex,
      roughness: 0.65,
      metalness: 0.0,
      transparent: true,
      fog: false
    });
    var planetMesh = new T.Mesh(new T.SphereGeometry(32, 64, 48), planetMat);
    celestialGroup.add(planetMesh);

    // Realistic Ring Geometry
    var ringGeo = new T.RingGeometry(44, 82, 96);
    var rPos = ringGeo.attributes.position, rUvs = ringGeo.attributes.uv;
    for (var ri = 0; ri < rPos.count; ri++) {
      var rx = rPos.getX(ri), ry = rPos.getY(ri);
      rUvs.setXY(ri, (Math.sqrt(rx * rx + ry * ry) - 44) / (82 - 44), 0.5);
    }
    var ringMat = new T.MeshStandardMaterial({
      map: ringTex,
      side: T.DoubleSide,
      transparent: true,
      opacity: 0.88,
      roughness: 0.8,
      fog: false
    });
    var ringMesh = new T.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI * 0.42;
    ringMesh.rotation.y = Math.PI * 0.12;
    celestialGroup.add(ringMesh);

    // Escort Cryo-Moon
    var moonMat = new T.MeshStandardMaterial({ map: cryoMoonTex, roughness: 0.8, transparent: true, fog: false });
    var cryoMoonMesh = new T.Mesh(new T.SphereGeometry(6.5, 36, 28), moonMat);
    // Keep clear of the planet even after contraction along the x axis.
    cryoMoonMesh.position.set(12, -48, 0);
    celestialGroup.add(cryoMoonMesh);

    // Catalog of distinct procedural worlds encountered sequentially (kept below the upper histogram)
    var WORLDS = [
      { name: "Glacies-9",   tex: frostGiantTex, radius: 32, rings: true,  moon: true,  y: -26, z: -230 },
      { name: "Aeolus Prime", tex: jovianTex,     radius: 36, rings: false, moon: false, y: -28, z: -240 },
      { name: "Pyre-Delta",   tex: brownDwarfTex, radius: 28, rings: false, moon: false, y: -24, z: -210 }
    ];

    function setEncounterWorld(idx) {
      var w = WORLDS[idx % WORLDS.length];
      planetMat.map = w.tex;
      planetMat.needsUpdate = true;
      ringMesh.visible = false;
      cryoMoonMesh.visible = !!w.moon;
      var s = (w.radius || 32) / 32;
      planetMesh.scale.set(s, s, s);
    }
    setEncounterWorld(0);

    var encounter = {
      worldIdx: 0,
      distX: 380,
      phase: "approach",
      transitTimer: 0
    };

    // ---- ship model ----
    var ship = new T.Group(); scene.add(ship);
    ship.add(spallLines);
    var iceSurfacePoints = [];
    var glow = glowTex();

    // High-resolution 2K PBR textures from reference asset
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
    var hullBaseColorTex = loadDataTex(texData.hullBaseColor, true, 2, 2);
    var hullNormalTex = loadDataTex(texData.hullNormal, false, 2, 2);
    var iceBaseColorTex = loadDataTex(texData.iceBaseColor, true, 2, 1);
    var iceNormalTex = loadDataTex(texData.iceNormal, false, 2, 1);

    // Carbon composite hull, weave on steel grey so the body reads against the starfield
    var carbonTex = canvasTex(512, 512, function (g, w, h) {
      g.fillStyle = "#8f99a6"; g.fillRect(0, 0, w, h);
      g.fillStyle = "rgba(32, 40, 52, 0.4)";
      for (var y = 0; y < h; y += 4) {
        for (var x = (y % 8 === 0 ? 0 : 2); x < w; x += 4) g.fillRect(x, y, 2, 2);
      }
      g.strokeStyle = "rgba(10, 14, 18, 0.75)"; g.lineWidth = 1;
      for (var k = 0; k < h; k += 32) { g.beginPath(); g.moveTo(0, k); g.lineTo(w, k); g.stroke(); }
      for (var m0 = 0; m0 < w; m0 += 64) { g.beginPath(); m0 && g.moveTo(m0, 0); g.lineTo(m0, h); g.stroke(); }
    });

    var hullMat = new T.MeshStandardMaterial({
      color: 0xffffff,
      map: hullBaseColorTex || carbonTex,
      normalMap: hullNormalTex || null,
      normalScale: new T.Vector2(0.9, 0.9),
      metalness: 0.65,
      roughness: 0.40
    });
    var dark = new T.MeshStandardMaterial({ color: 0x161a20, metalness: 0.75, roughness: 0.35 });
    var violet = new T.MeshBasicMaterial({ color: 0x8a70ff });

    // 1) ICE PROW AND HULL: the lighthugger asset, decoded from app/js/lighthugger-mesh.js. Asset x runs forward from the
    // seam at 0 to the needle tip. Asset y (up) becomes scene z and asset z (lateral) becomes -y, so the twin ramjets sit
    // above and below the bore. Each group keeps its asset material, and its UVs map the same 2K textures.
    function lhBytes(s) {
      var bin = atob(s), buf = new Uint8Array(bin.length);
      for (var bi = 0; bi < bin.length; bi++) buf[bi] = bin.charCodeAt(bi);
      return buf.buffer;
    }
    function lhGeometry(g) {
      var n = g.count, lo = g.min, sp = g.span, ulo = g.uvMin, usp = g.uvSpan;
      var pq = new Int16Array(lhBytes(g.position)), nq = new Int8Array(lhBytes(g.normal));
      var uq = new Uint16Array(lhBytes(g.uv)), iq = new Uint16Array(lhBytes(g.index));
      var pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2);
      for (var k = 0; k < n; k++) {
        var ax = lo[0] + (pq[3 * k] + 32768) / 65535 * sp[0];
        var ay = lo[1] + (pq[3 * k + 1] + 32768) / 65535 * sp[1];
        var az = lo[2] + (pq[3 * k + 2] + 32768) / 65535 * sp[2];

        // Eliminate pylon penetration into ramjet through-ducts
        if (g.name === "04_Integrated_Pylons") {
          if (az > 1.36) az = 1.36;
          else if (az < -1.36) az = -1.36;
        }

        var sx = ICE_END + LH_SCALE * ax;
        var sy = -LH_SCALE * az;
        var sz = LH_SCALE * ay;

        // Procedural 3D cometary ice sculpting for the forward shield:
        // Low-frequency undulating glacial ridges that taper cleanly toward a fine sculpted nose tip
        // so adjacent triangles never fold or leave a flat truncated disc when viewed close up.
        if (g.name === "02_Ice_Lance_Shell" && sx > 5.0) {
          var u = Math.max(0, Math.min(1, (sx - 5.0) / (BOW - 5.0))); // 0 at sx=5.0, 1 at BOW (23.0)
          var ang = Math.atan2(sz, sy);
          var r0 = Math.sqrt(sy * sy + sz * sz);
          var c1 = Math.sin(ang * 3 + sx * 0.45);
          var c2 = Math.cos(ang * 5 - sx * 0.75 + 1.4) * 0.55;
          var c3 = Math.sin(ang * 7 + sx * 1.15 - 0.8) * 0.25;
          var midTaper = Math.sin(u * Math.PI);
          var tipPinch = 1.0 - 0.86 * Math.pow(u, 4.5);
          var radialMod = tipPinch * Math.max(0.76, 1.0 + 0.18 * midTaper * (0.55 * c1 + 0.30 * c2 + 0.15 * c3));

          sx += 0.25 * midTaper * (0.65 * c1 + 0.35 * c2);
          if (u > 0.992 && r0 < 0.235) sx += 0.26 * (1.0 - r0 / 0.24);
          sy *= radialMod;
          sz *= radialMod;
        }

        pos[3 * k] = sx; pos[3 * k + 1] = sy; pos[3 * k + 2] = sz;
        nrm[3 * k] = nq[3 * k] / 127; nrm[3 * k + 1] = -nq[3 * k + 2] / 127; nrm[3 * k + 2] = nq[3 * k + 1] / 127;
        uv[2 * k] = ulo[0] + uq[2 * k] / 65535 * usp[0]; uv[2 * k + 1] = ulo[1] + uq[2 * k + 1] / 65535 * usp[1];
      }
      var geo = new T.BufferGeometry();
      geo.setAttribute("position", new T.BufferAttribute(pos, 3));
      geo.setAttribute("normal", new T.BufferAttribute(nrm, 3));
      geo.setAttribute("uv", new T.BufferAttribute(uv, 2));
      geo.setIndex(new T.BufferAttribute(iq, 1));
      if (g.name === "02_Ice_Lance_Shell") {
        geo.computeVertexNormals();
      }
      return geo;
    }

    // High-resolution procedural frosty crystalline ice micro-texture
    var frostTex = canvasTex(1024, 1024, function (g, w, h) {
      g.fillStyle = "#d4eff7";
      g.fillRect(0, 0, w, h);

      // Deep cryogenic gradient wash
      var grad = g.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0.0, "rgba(240, 250, 255, 0.96)");
      grad.addColorStop(0.3, "rgba(195, 230, 248, 0.90)");
      grad.addColorStop(0.65, "rgba(225, 245, 255, 0.94)");
      grad.addColorStop(1.0, "rgba(180, 222, 242, 0.96)");
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);

      // Fine frost dendritic needles and crystalline grain along starship axis
      for (var f = 0; f < 3800; f++) {
        var fx = Math.random() * w, fy = Math.random() * h;
        var flen = 5 + Math.random() * 28;
        var fang = (Math.random() - 0.5) * 0.35;
        g.strokeStyle = Math.random() < 0.7 ? "rgba(255, 255, 255, 0.72)" : "rgba(145, 210, 240, 0.58)";
        g.lineWidth = 0.8 + Math.random() * 1.8;
        g.beginPath();
        g.moveTo(fx, fy);
        g.lineTo(fx + flen * Math.cos(fang), fy + flen * Math.sin(fang));
        g.stroke();
      }

      // Glacial fractures & cryo-cracks across whole body, dense near forward bow (x in [0, 450])
      for (var c = 0; c < 85; c++) {
        var cx = Math.random() < 0.65 ? Math.random() * 450 : Math.random() * w;
        var cy = Math.random() * h;
        var segs = 4 + Math.floor(Math.random() * 6);
        g.strokeStyle = "rgba(55, 135, 175, 0.65)";
        g.lineWidth = 1.8 + Math.random() * 2.5;
        g.beginPath(); g.moveTo(cx, cy);
        var curX = cx, curY = cy;
        var pts = [[curX, curY]];
        for (var s = 0; s < segs; s++) {
          curX += (Math.random() - 0.45) * 45;
          curY += (Math.random() - 0.5) * 35;
          pts.push([curX, curY]);
          g.lineTo(curX, curY);
        }
        g.stroke();

        // Bright crystalline frost highlight on one side of fracture
        g.strokeStyle = "rgba(255, 255, 255, 0.75)";
        g.lineWidth = 1.0;
        g.beginPath();
        g.moveTo(pts[0][0] + 1, pts[0][1] - 1);
        for (var s2 = 1; s2 < pts.length; s2++) {
          g.lineTo(pts[s2][0] + 1, pts[s2][1] - 1);
        }
        g.stroke();
      }

      // Frosted crystalline surface stippling
      g.fillStyle = "rgba(255, 255, 255, 0.35)";
      for (var p = 0; p < 8500; p++) {
        var px = Math.random() * w, py = Math.random() * h;
        g.fillRect(px, py, 1.5, 1.5);
      }
    });

    // Translucent frosty glacial ice shield (lighting computed from sculpted 3D crystal normals)
    var iceMat = new T.MeshStandardMaterial({
      color: 0xf4fcff,
      map: frostTex,
      roughness: 0.55,
      metalness: 0.05,
      transparent: true,
      opacity: 0.76,
      side: T.FrontSide,
      emissive: 0x0c3242,
      emissiveIntensity: 0.38,
      depthWrite: true
    });
    var lightMat = new T.MeshBasicMaterial({ color: 0xffc070 });

    // Ramjet heat: the intake spikes glow red-hot from compression, and the rims and throats glow with them
    var heatTex = canvasTex(512, 128, function (g, w, h) {
      // In Three.js ConeGeometry with flipY=true, y=0 (top of canvas) is apex tip (V=1), y=h is base (V=0)
      var grad = g.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0.00, "#180808"); // dark thermal base alloy
      grad.addColorStop(0.20, "#500900"); // dull thermal cherry glow
      grad.addColorStop(0.45, "#b51200"); // deep thermal red
      grad.addColorStop(0.68, "#ff3800"); // incandescent fiery orange-red
      grad.addColorStop(0.85, "#ff8a00"); // bright orange shock layer
      grad.addColorStop(0.95, "#ffdb44"); // incandescent yellow-hot
      grad.addColorStop(1.00, "#ffffff"); // white-hot stagnation point at tip
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);

      // Micro-texture: fine longitudinal thermal boundary-layer streak lines
      g.fillStyle = "rgba(255, 210, 140, 0.14)";
      for (var y = 0; y < h; y += 4) {
        if (Math.random() < 0.45) {
          var startX = w * (0.2 + Math.random() * 0.3);
          g.fillRect(startX, y, w - startX, 2);
        }
      }
    });
    // Glowing red-hot from compression heating, with an incandescent thermal gradient and bloom
    var spikeMat = new T.MeshStandardMaterial({
      color: 0xffffff,
      map: heatTex,
      emissiveMap: heatTex,
      emissive: new T.Color(0xffffff),
      emissiveIntensity: 1.85,
      roughness: 0.28,
      metalness: 0.35
    });
    var cowlHeatMat = new T.MeshStandardMaterial({
      color: 0x240808,
      emissive: 0xff3b11,
      emissiveIntensity: 1.45,
      roughness: 0.32,
      metalness: 0.4
    });
    var ductHeatMat = new T.MeshStandardMaterial({
      color: 0x300c05,
      emissive: 0xff4a00,
      emissiveIntensity: 1.25,
      roughness: 0.35,
      metalness: 0.3
    });

    // Asset materials by index: 0 metal hull, 1 ice, 2 dark structural metal, 3 machined steel, 4 port lights
    var lhMaterials = [hullMat, iceMat, dark, dark, lightMat];
    var lhByName = {
      "06_Open_Inlet_And_Exhaust_Rims": cowlHeatMat,
      "07_Through_Ducts": ductHeatMat,
      "08_Projecting_Intake_Centerbodies": spikeMat
    };
    LH.groups.forEach(function (g) {
      var geo = lhGeometry(g);
      var mesh = new T.Mesh(geo, lhByName[g.name] || lhMaterials[g.material]);
      mesh.name = g.name;
      if (g.name === "02_Ice_Lance_Shell") {
        mesh.renderOrder = 3;
        var surface = geo.attributes.position;
        for (var vi = 0; vi < surface.count; vi++) {
          var px = surface.getX(vi), py = surface.getY(vi), pz = surface.getZ(vi);
          if (px > ICE_END + 2 && px < BOW - 0.5 && py * py + pz * pz > 0.09) {
            iceSurfacePoints.push([px, py, pz]);
          }
        }
      }
      ship.add(mesh);
    });

    // The evacuated bore is the muon channel. It is not drawn: the sensor rings and flashes mark it.
    var boreMat = new T.MeshBasicMaterial({ color: 0x2a8f86 });

    // Muon detector: glass optical modules, IceCube-style. Each sensor section has a ring of modules inside the ice,
    // around the bore, and each angle has a string of modules along the bore. A flash lights the module nearest its angle.
    var NSEC = M.SECTIONS.length, PER = 10, NDOM = NSEC * PER;
    var domMat = new T.MeshStandardMaterial({
      color: 0x72a5b8,
      roughness: 0.45,
      metalness: 0.05,
      emissive: 0x02121a,
      emissiveIntensity: 0.18,
      transparent: true,
      opacity: 0.35,
      depthWrite: false
    });
    var doms = new T.InstancedMesh(new T.SphereGeometry(0.032, 10, 8), domMat, NDOM);
    doms.renderOrder = 1; doms.frustumCulled = false;
    var domGlow = new Float32Array(NDOM), domM = new T.Matrix4(), domIdle = new T.Color(0.22, 0.42, 0.58), domXYZ = [];
    for (var sd = 0; sd < NSEC; sd++) {
      var dsx = xAt(M.SECTIONS[sd]);
      var du = Math.max(0, Math.min(1, (dsx - 5.0) / (BOW - 5.0)));
      var localIceR = iceR(dsx) * (1.0 - 0.86 * Math.pow(du, 4.5));
      var inIce = dsx <= BOW && dsx >= (ICE_END - 0.5);
      // Snugly embedded inside the solid ice core surrounding the bore; never protruding into vacuum
      var dsr = Math.min(0.55 * localIceR, 0.16 + 0.55 * Math.pow((BOW - dsx) / (BOW - ICE_END), 1.2));
      for (var jd = 0; jd < PER; jd++) {
        var dan = jd * 2 * Math.PI / PER, ddy = dsr * Math.cos(dan), ddz = dsr * Math.sin(dan);
        if (inIce) {
          domM.makeTranslation(dsx, ddy, ddz);
        } else {
          domM.makeScale(0, 0, 0); // No photodetectors where there is no ice
        }
        doms.setMatrixAt(sd * PER + jd, domM);
        doms.setColorAt(sd * PER + jd, domIdle);
        domXYZ.push(dsx, ddy, ddz);
      }
    }
    ship.add(doms);
    // Strings: the modules at each angle, joined along the bore
    var strPos = [];
    for (var jsi = 0; jsi < PER; jsi++) {
      for (var ssi = 0; ssi < NSEC - 1; ssi++) {
        var ia = 3 * (ssi * PER + jsi), ib = 3 * ((ssi + 1) * PER + jsi);
        strPos.push(domXYZ[ia], domXYZ[ia + 1], domXYZ[ia + 2], domXYZ[ib], domXYZ[ib + 1], domXYZ[ib + 2]);
      }
    }
    var strGeo = new T.BufferGeometry();
    strGeo.setAttribute("position", new T.BufferAttribute(new Float32Array(strPos), 3));
    var strMesh = new T.LineSegments(strGeo, new T.LineBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.10, depthWrite: false }));
    strMesh.renderOrder = 1;
    ship.add(strMesh);

    // Exhaust plumes: each beam starts at a ramjet nozzle and fades aft
    var exMat = new T.ShaderMaterial({
      uniforms: { uColor: { value: new T.Color(0x8a5cff) }, uOn: { value: 1 } },
      vertexShader: "varying vec2 vUv; varying vec3 vN; varying vec3 vV;" +
        "void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0);" +
        " vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
      fragmentShader: "uniform vec3 uColor; uniform float uOn; varying vec2 vUv; varying vec3 vN; varying vec3 vV;" +
        "void main(){ float c = pow(abs(dot(vN, vV)), 2.0); float a = pow(vUv.y, 2.6) * c * uOn;" +
        " gl_FragColor = vec4(uColor * a * 2.5, a); }",
      transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide
    });
    var exCoreMat = new T.ShaderMaterial({
      uniforms: { uColor: { value: new T.Color(0xdacaff) }, uOn: { value: 1 } },
      vertexShader: "varying vec2 vUv; varying vec3 vN; varying vec3 vV;" +
        "void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0);" +
        " vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
      fragmentShader: "uniform vec3 uColor; uniform float uOn; varying vec2 vUv; varying vec3 vN; varying vec3 vV;" +
        "void main(){ float c = pow(abs(dot(vN, vV)), 1.3); float a = pow(vUv.y, 2.0) * c * uOn;" +
        " gl_FragColor = vec4(uColor * a * 3.5, a); }",
      transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide
    });
    function engineBeam(x, y, rad0, len, m) {
      var g = alongX(new T.CylinderGeometry(rad0, rad0 * 0.2, len, 32, 1, true));
      var bm = new T.Mesh(g, m || exMat); bm.position.set(x - len / 2, y, 0); ship.add(bm);
    }
    // The nozzle rims are about 0.72 scene units in radius, so each plume starts at the rim
    engineBeam(EXIT_X, NAC_Y, 0.72, 75, exMat);
    engineBeam(EXIT_X, NAC_Y, 0.36, 95, exCoreMat);
    engineBeam(EXIT_X, -NAC_Y, 0.72, 75, exMat);
    engineBeam(EXIT_X, -NAC_Y, 0.36, 95, exCoreMat);

    // ---- detector display above the prow: histogram, fit, axes ----
    var RAIL = 7.6, H = 7.5;
    var graph = new T.Group(); ship.add(graph);
    var lineMat = new T.LineBasicMaterial({ color: 0x3fae9c, transparent: true, opacity: 0.55 });
    var gridMat = new T.LineBasicMaterial({ color: 0x6fe6cd, transparent: true, opacity: 0.36, depthWrite: false });
    function seg(a, b, mat) { return new T.Line(new T.BufferGeometry().setFromPoints([a, b]), mat || lineMat); }
    // Horizontal baseline rail and vertical Y-axis bar
    graph.add(seg(new T.Vector3(xAt(0), RAIL, 0), new T.Vector3(xAt(M.CHANNEL), RAIL, 0)));
    graph.add(seg(new T.Vector3(xAt(0) + 0.6, RAIL, 0), new T.Vector3(xAt(0) + 0.6, RAIL + H + 0.6, 0)));
    // Dynamic horizontal grid lines across the channel that slide smoothly with Y scale
    var gridLines = [0, 1, 2, 3].map(function () {
      var l = seg(new T.Vector3(xAt(0) + 0.6, 0, 0), new T.Vector3(xAt(M.CHANNEL), 0, 0), gridMat);
      graph.add(l);
      return l;
    });
    // Dynamic tick notches on the vertical axis that slide with the grid lines
    var tickNotches = [0, 1, 2, 3].map(function () {
      var tn = seg(new T.Vector3(xAt(0) + 0.6, 0, 0), new T.Vector3(xAt(0) + 1.2, 0, 0), lineMat);
      graph.add(tn);
      return tn;
    });
    graph.add(seg(new T.Vector3(xAt(0) + 0.3, RAIL + H + 0.6, 0), new T.Vector3(xAt(0) + 0.9, RAIL + H + 0.6, 0)));
    var faint = new T.LineBasicMaterial({ color: 0x3fae9c, transparent: true, opacity: 0.18 });
    graph.add(seg(new T.Vector3(xAt(0), 0.4, 0), new T.Vector3(xAt(0), RAIL, 0), faint));
    graph.add(seg(new T.Vector3(xAt(M.CHANNEL), iceR(ICE_END) * 0.7, 0), new T.Vector3(xAt(M.CHANNEL), RAIL, 0), faint));
    var barGeo = new T.BoxGeometry(M.WIDTH / U - 0.35, 1, 0.5); barGeo.translate(0, 0.5, 0);
    var barMat = new T.MeshBasicMaterial({ color: 0xc47a22, transparent: true, opacity: 0.85 });
    var bars = M.SECTIONS.map(function (x) {
      var bar = new T.Mesh(barGeo, barMat.clone()); bar.position.set(xAt(x), RAIL, 0); bar.scale.y = 0.001; bar.userData.previous = 0; bar.userData.heat = 0; graph.add(bar); return bar;
    });
    var caps = M.SECTIONS.map(function (x) {
      var cap = new T.Mesh(barGeo, new T.MeshBasicMaterial({ color: 0xffe8a0, transparent: true, opacity: 0, depthWrite: false }));
      cap.position.set(xAt(x), RAIL, 0); graph.add(cap); return cap;
    });
    var checkCanvas = document.createElement("canvas"); checkCanvas.width = checkCanvas.height = 128;
    var checkCtx = checkCanvas.getContext("2d"); checkCtx.font = "bold 100px sans-serif"; checkCtx.textAlign = "center"; checkCtx.textBaseline = "middle"; checkCtx.fillStyle = "#67ff96"; checkCtx.fillText("✓", 64, 64);
    var checkTexture = new T.CanvasTexture(checkCanvas);
    var checks = M.SECTIONS.map(function (x) {
      var check = new T.Sprite(new T.SpriteMaterial({ map: checkTexture, transparent: true, depthTest: false }));
      check.scale.set(1.8, 1.8, 1); check.position.set(xAt(x), RAIL, 0.5); check.visible = false; graph.add(check); return check;
    });
    var errorGeo = new T.BufferGeometry();
    errorGeo.setAttribute("position", new T.BufferAttribute(new Float32Array(M.SECTIONS.length * 18), 3));
    var graphErrors = new T.LineSegments(errorGeo, new T.LineBasicMaterial({ color: 0xfff0ce }));
    graphErrors.frustumCulled = false; graph.add(graphErrors);
    var fitCurve = new T.Mesh(new T.BufferGeometry(), new T.MeshBasicMaterial({ color: 0x9ff6e6 })); graph.add(fitCurve);
    var fitLow = new T.Mesh(new T.BufferGeometry(), new T.MeshBasicMaterial({ color: 0x9ff6e6, transparent: true, opacity: 0.5 })); graph.add(fitLow);
    var fitHigh = new T.Mesh(new T.BufferGeometry(), new T.MeshBasicMaterial({ color: 0x9ff6e6, transparent: true, opacity: 0.5 })); graph.add(fitHigh);
    var refCurve = new T.Mesh(new T.BufferGeometry(), new T.MeshBasicMaterial({ color: 0x2fa896, transparent: true, opacity: 0.6 })); graph.add(refCurve);
    function setCurve(mesh, fn, top) {
      mesh.geometry.dispose();
      if (!fn) { mesh.geometry = new T.BufferGeometry(); return; }
      var pts = [];
      for (var d = 0; d <= M.CHANNEL; d += 25) pts.push(new T.Vector3(xAt(d), RAIL + H * Math.min(fn(d) / top, 1.2), 0));
      mesh.geometry = new T.TubeGeometry(new T.CatmullRomCurve3(pts), 96, 0.07, 6);
    }

    // ---- Cherenkov flashes: authentic Frank-Tamm near-UV/blue dual shock cones & ice scatter ----
    var NE = 120, thetaC = M.cherenkovAngle(0.9999) * Math.PI / 180, CL = 1.4;
    var coneGeo = new T.ConeGeometry(CL * Math.tan(thetaC), CL, 24, 1, true); coneGeo.translate(0, -CL / 2, 0);
    var cones = new T.InstancedMesh(coneGeo, new T.MeshBasicMaterial({ color: 0x3d94ff, transparent: true, opacity: 0.55,
      blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }), NE);
    cones.renderOrder = 2; cones.frustumCulled = false;

    // High-intensity inner shock cone (Mach sheath)
    var innerGeo = new T.ConeGeometry(CL * Math.tan(thetaC) * 0.45, CL * 1.05, 16, 1, true); innerGeo.translate(0, -CL * 0.525, 0);
    var innerCones = new T.InstancedMesh(innerGeo, new T.MeshBasicMaterial({ color: 0x9be8ff, transparent: true, opacity: 0.85,
      blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }), NE);
    innerCones.renderOrder = 2; innerCones.frustumCulled = false;

    // Volumetric scattering halo in the frosted crystalline ice
    var haloGeo = new T.SphereGeometry(1.0, 12, 10);
    var halos = new T.InstancedMesh(haloGeo, new T.MeshBasicMaterial({ color: 0x1d5eff, transparent: true, opacity: 0.28,
      blending: T.AdditiveBlending, depthWrite: false }), NE);
    halos.renderOrder = 2; halos.frustumCulled = false;

    var vp = new Float32Array(NE * 3), vc = new Float32Array(NE * 3), vgeo = new T.BufferGeometry();
    vgeo.setAttribute("position", new T.BufferAttribute(vp, 3)); vgeo.setAttribute("color", new T.BufferAttribute(new Float32Array(NE * 3), 3));
    var vertices = new T.Points(vgeo, new T.PointsMaterial({ size: 1.6, map: glow, vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
    vertices.renderOrder = 2; vertices.frustumCulled = false;
    var events = [], black = new T.Color(0, 0, 0);
    for (i = 0; i < NE; i++) {
      events.push({ life: 0, x: 0, y: 0, z: 0, s: 0, q: new T.Quaternion() });
      var zeroM = new T.Matrix4().makeScale(0.001, 0.001, 0.001);
      cones.setMatrixAt(i, zeroM); cones.setColorAt(i, black);
      innerCones.setMatrixAt(i, zeroM); innerCones.setColorAt(i, black);
      halos.setMatrixAt(i, zeroM); halos.setColorAt(i, black);
    }
    ship.add(cones); ship.add(innerCones); ship.add(halos); ship.add(vertices);

    // ---- High-Fidelity O'Neill Cylinder Colony Generator (GLB Asset) ----
    var oneillTemplate = null, oneillCallbacks = [];
    function loadOneillAsset(cb) {
      if (oneillTemplate) { cb(oneillTemplate.clone(true)); return; }
      oneillCallbacks.push(cb);
      if (oneillCallbacks.length > 1) return;
      if (!DR.oneillGlbBase64) {
        console.warn("oneillGlbBase64 asset not present");
        return;
      }
      try {
        var bin = window.atob(DR.oneillGlbBase64);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        var ldr = new T.GLTFLoader();
        ldr.parse(bytes.buffer, "", function (gltf) {
          var model = gltf.scene;
          // Cylinder longitudinal axis in model is Z; rotate to align along world X
          model.rotation.y = Math.PI / 2;
          // Scale so the axial docking collar matches X = -48.5
          var s = 48.5 / 65.6;
          model.scale.set(s, s, s);
          // Fix O'Neill spin-gravity surfaces: grass/landscape belongs on the INNER face of the
          // armored land bands (facing the central axis), viewed THROUGH transparent windows.
          var habitatMat = null, landMeshes = [];
          model.traverse(function (o) {
            if (!o.isMesh || !o.material) return;
            o.castShadow = false;
            o.receiveShadow = false;
            var mName = (o.material.name || "").toLowerCase();
            var nName = (o.name || "").toLowerCase();
            if (mName.indexOf("habitat") >= 0 || nName.indexOf("landscape through window") >= 0) {
              habitatMat = o.material;
              o.visible = false;
            } else if (mName.indexOf("window") >= 0 && mName.indexOf("glazing") >= 0) {
              o.material = o.material.clone();
              o.material.transparent = true;
              o.material.opacity = 0.24;
              o.material.depthWrite = false;
            } else if (nName.indexOf("armored land band") >= 0) {
              landMeshes.push(o);
            }
            if (o.material.isMeshStandardMaterial) {
              o.material.roughness = Math.max(0.25, o.material.roughness || 0.5);
            }
          });
          if (habitatMat) {
            var innerMat = habitatMat.clone();
            innerMat.side = T.BackSide;
            landMeshes.forEach(function (land) {
              land.material = land.material.clone();
              land.material.side = T.FrontSide;
              var inner = new T.Mesh(land.geometry, innerMat);
              inner.name = land.name + " (inner spin-gravity surface)";
              inner.scale.set(0.992, 0.992, 0.998);
              land.add(inner);
            });
          }
          oneillTemplate = model;
          var q = oneillCallbacks;
          oneillCallbacks = [];
          q.forEach(function (f) { f(model.clone(true)); });
        }, function (err) {
          console.error("Error parsing oneill glb:", err);
        });
      } catch (err) {
        console.error("Failed to decode oneillGlbBase64:", err);
      }
    }

    function createONeillColony(hasRadiators, labelName) {
      var root = new T.Group();
      var spinner = new T.Group();
      root.add(spinner);

      loadOneillAsset(function (m) {
        spinner.add(m);
      });

      // Forward axial docking ring at X = -48.5
      var dockRing = new T.Mesh(new T.TorusGeometry(1.8, 0.22, 12, 48), violet);
      dockRing.rotation.y = Math.PI / 2; dockRing.position.x = -48.5; root.add(dockRing);

      // Station 3 radiator rings (antimatter drive waste heat dispersion)
      var radRings = [];
      if (hasRadiators) {
        var radMat = new T.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.95 });
        for (var ri = 0; ri < 4; ri++) {
          var rm = new T.Mesh(new T.TorusGeometry(14.2 + ri * 0.45, 0.12, 8, 64), radMat);
          rm.rotation.y = Math.PI / 2; rm.position.x = -28 - ri * 1.5;
          root.add(rm); radRings.push(rm);
        }
      }

      // Navigational beacon lights along the colony hub and perimeter
      var navMat = new T.MeshBasicMaterial({ color: 0xff4a3a }), navs = [];
      for (var kNav = 0; kNav < 6; kNav++) {
        var an = kNav * Math.PI / 3;
        var nv1 = new T.Mesh(new T.SphereGeometry(0.35, 8, 8), navMat);
        nv1.position.set(-12, 16.0 * Math.cos(an), 16.0 * Math.sin(an)); root.add(nv1); navs.push(nv1);
        var nv2 = new T.Mesh(new T.SphereGeometry(0.25, 8, 8), navMat);
        nv2.position.set(-48.5, 2.4 * Math.cos(an), 2.4 * Math.sin(an)); root.add(nv2); navs.push(nv2);
      }

      return { root: root, spinner: spinner, rings: [], navs: navs, radRings: radRings, dockRing: dockRing };
    }

    // Station 1: Waypoint Station (O'Neill Cylinder) stationed alongside ship
    var stationData = createONeillColony(false, "Waypoint Station");
    var station = stationData.root; scene.add(station);
    station.position.set(0, 26, -38);
    station.rotation.set(0, 0.08, 0.04);

    // Auxiliary accelerator, aligned with the bow and the detector bore.
    var calConduit = new T.Group(); scene.add(calConduit);
    var beamMat = new T.MeshBasicMaterial({ color: 0xff4da6, transparent: true, opacity: 0.65 });
    var auxiliary = new T.Mesh(new T.OctahedronGeometry(2.2, 0), new T.MeshBasicMaterial({ color: 0x5fe8d8, wireframe: true }));
    auxiliary.position.set(BOW + 32, 0, 0); calConduit.add(auxiliary);
    var conduitLine = rod(new T.Vector3(BOW + 32, 0, 0), new T.Vector3(ICE_END, 0, 0), 0.18, beamMat);
    calConduit.add(conduitLine);

    // A second lighthugger, distinct from Long Patience: a shielded bow, open spine,
    // rotating habitation wheel, radiator vanes and an aft service dock.
    function createColonyShip() {
      var root = new T.Group(), spinner = new T.Group(), navs = [], radRings = [];
      root.name = "Nova Archimedes · colony ship"; root.add(spinner);
      var hull = new T.MeshStandardMaterial({ color: 0x65777c, metalness: 0.72, roughness: 0.42 });
      var hullDark = new T.MeshStandardMaterial({ color: 0x253d45, metalness: 0.75, roughness: 0.42 });
      var shield = new T.MeshStandardMaterial({ color: 0x90a8ad, metalness: 0.45, roughness: 0.55 });
      var panel = new T.MeshStandardMaterial({ color: 0x243c43, metalness: 0.55, roughness: 0.58, side: T.DoubleSide });
      var seams = new T.MeshStandardMaterial({ color: 0x788c88, metalness: 0.65, roughness: 0.45 });
      var beacon = new T.MeshBasicMaterial({ color: 0xff8b5b });
      var glow = new T.MeshBasicMaterial({ color: 0xffdca3 });
      function part(geometry, material, x, y, z, parent) {
        var mesh = new T.Mesh(geometry, material); mesh.position.set(x, y, z); (parent || root).add(mesh); return mesh;
      }
      part(alongX(new T.CylinderGeometry(2.7, 3.4, 67, 8)), hullDark, -2, 0, 0);
      [-26, -13, 2, 17, 27].forEach(function (x, i) {
        var module = part(alongX(new T.CylinderGeometry(i === 4 ? 4.2 : 3.6, 3.6, i === 4 ? 7 : 9, 12)), hull, x, 0, 0);
        module.name = "habitat module " + (i + 1);
        [-2.8, 2.8].forEach(function (dx) {
          var seam = part(new T.TorusGeometry(3.65, 0.16, 6, 24), seams, x + dx, 0, 0); seam.rotation.y = Math.PI / 2;
        });
      });
      // The broad, faceted forward shield is a different silhouette from Long Patience's needle.
      var prow = part(alongX(new T.CylinderGeometry(5.3, 9.8, 7, 12)), shield, 34, 0, 0); prow.name = "forward shield";
      part(alongX(new T.ConeGeometry(5.3, 9, 12)), shield, 42, 0, 0);
      [31, 35, 38].forEach(function (x, j) {
        var rim = part(new T.TorusGeometry(9.2 - j * 1.25, 0.2, 6, 32), hullDark, x, 0, 0); rim.rotation.y = Math.PI / 2;
      });
      // Four folded-panel radiator vanes, with visible framing and an H-alpha beacon rail.
      for (var side = 0; side < 4; side++) {
        var vane = new T.Group(); vane.rotation.x = side * Math.PI / 2; root.add(vane);
        var vanePlate = part(new T.BoxGeometry(39, 13, 0.22), panel, -5, 11, 0, vane); vanePlate.name = "radiator vane " + (side + 1);
        [-24.5, 14.5].forEach(function (x) { part(new T.BoxGeometry(0.36, 13.4, 0.35), seams, x, 11, 0, vane); });
        for (var fin = 0; fin < 9; fin++) part(new T.BoxGeometry(0.15, 13, 0.28), seams, -22 + fin * 4.25, 11, 0.03, vane);
        [4.5, 17.5].forEach(function (y) { part(new T.BoxGeometry(39.5, 0.25, 0.3), seams, -5, y, 0, vane); });
        var emitter = part(new T.BoxGeometry(26, 0.18, 0.24), beacon, -5, 17.25, 0.17, vane); radRings.push(emitter);
      }
      // A small wheel spins about the flight axis while the structural spine remains fixed.
      var wheel = part(new T.TorusGeometry(7.4, 0.72, 10, 48), hull, 11, 0, 0, spinner); wheel.rotation.y = Math.PI / 2;
      var wheelInner = part(new T.TorusGeometry(6.25, 0.14, 6, 48), seams, 11, 0, 0, spinner); wheelInner.rotation.y = Math.PI / 2;
      for (var spoke = 0; spoke < 10; spoke++) {
        var a = spoke * 2 * Math.PI / 10, y = Math.cos(a), z = Math.sin(a);
        spinner.add(rod(new T.Vector3(11, 2.9 * y, 2.9 * z), new T.Vector3(11, 7.2 * y, 7.2 * z), 0.15, seams));
        var cabin = part(new T.BoxGeometry(2.8, 1.1, 1.6), hull, 11, 7.4 * y, 7.4 * z, spinner); cabin.rotation.x = a;
        var windowLight = part(new T.SphereGeometry(0.18, 6, 6), glow, 9.45, 7.4 * y, 7.4 * z, spinner); windowLight.name = "habitat window";
      }
      // Aft propulsion modules surround a separate, accessible docking collar.
      [-1, 1].forEach(function (ySign) { [-1, 1].forEach(function (zSign) {
        var y = 5.1 * ySign, z = 5.1 * zSign;
        part(alongX(new T.CylinderGeometry(1.2, 1.9, 9, 16)), hullDark, -31, y, z);
        part(alongX(new T.CylinderGeometry(1.9, 1.25, 3, 16, 1, true)), hull, -37, y, z);
        root.add(rod(new T.Vector3(-27, 2 * ySign, 2 * zSign), new T.Vector3(-31, y, z), 0.3, seams));
      }); });
      part(alongX(new T.CylinderGeometry(1.2, 1.4, 9, 12)), hullDark, -43, 0, 0);
      var dockRing = part(new T.TorusGeometry(1.8, 0.22, 12, 48), seams, -48.5, 0, 0); dockRing.rotation.y = Math.PI / 2;
      for (var n = 0; n < 6; n++) {
        var na = n * Math.PI / 3;
        var nav = part(new T.SphereGeometry(0.19, 8, 8), beacon, -48.45, 2.05 * Math.cos(na), 2.05 * Math.sin(na)); navs.push(nav);
      }
      return { root: root, spinner: spinner, rings: [], navs: navs, radRings: radRings, dockRing: dockRing };
    }

    // Station 3: colony ship Nova Archimedes on the intercept vector.
    var colonyData = createColonyShip();
    var colony = colonyData.root; scene.add(colony);
    colony.position.set(85, 14, -45);
    colony.rotation.set(0, -Math.PI * 0.95, -0.05);
    colony.visible = false;

    // ---- station buoys for length contraction / time dilation ----
    var buoyGeo = new T.OctahedronGeometry(0.5, 0);
    var buoys = new T.InstancedMesh(buoyGeo, new T.MeshBasicMaterial({ color: 0xffffff }), NBUOY);
    buoys.frustumCulled = false;
    for (i = 0; i < NBUOY; i++) buoys.setColorAt(i, new T.Color(i % 5 === 0 ? 0x9ff6e6 : 0x3f9c8e));
    scene.add(buoys);
    var rulerLine = seg(new T.Vector3(-SPAN / 2, RULER_Y, 0), new T.Vector3(SPAN / 2, RULER_Y, 0), faint); scene.add(rulerLine);
    var gateMat = new T.LineBasicMaterial({ color: 0xffd08a, transparent: true, opacity: 0.7 });
    var gates = [0, 1].map(function () {
      var l = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]), gateMat); scene.add(l); return l;
    });

    // clocks for time-dilation page
    function makeClock(size, color) {
      var g = new T.Group();
      g.add(new T.Mesh(new T.RingGeometry(size * 0.9, size, 64), new T.MeshBasicMaterial({ color: color })));
      for (var t = 0; t < 12; t++) {
        var tick = new T.Mesh(new T.PlaneGeometry(size * 0.05, size * 0.18), new T.MeshBasicMaterial({ color: 0x5fcab7 }));
        var a3 = t * Math.PI / 6; tick.position.set(0.78 * size * Math.sin(a3), 0.78 * size * Math.cos(a3), 0); tick.rotation.z = -a3; g.add(tick);
      }
      var face = new T.Mesh(new T.CircleGeometry(size * 0.9, 48), new T.MeshBasicMaterial({ color: 0x02110f, transparent: true, opacity: 0.9, depthWrite: false }));
      face.position.z = -0.03; g.add(face);
      var hg = new T.PlaneGeometry(size * 0.22, size * 0.78); hg.translate(0, size * 0.39, 0);
      var hand = new T.Mesh(hg, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthTest: false, depthWrite: false, side: T.DoubleSide })); hand.position.z = 0.12; hand.renderOrder = 20; g.add(hand);
      scene.add(g);
      return { g: g, hand: hand };
    }
    var buoyClocks = [-2, -1, 0, 1, 2].map(function (k) { var c = makeClock(2.7, 0x8ff5dd); c.x = k * 25; return c; });
    var shipClock = makeClock(3.3, 0xffd08a);

    // Enlarged hydrogen discharge lamp for the Doppler briefing.
    var demoLamp = new T.Group(); scene.add(demoLamp); demoLamp.visible = false;
    var lampGlass = new T.Mesh(new T.CylinderGeometry(5, 5, 28, 40, 1, true), new T.MeshBasicMaterial({ color: 0xfd6bcf, transparent: true, opacity: 0.32, side: T.DoubleSide, depthWrite: false }));
    var lampCore = new T.Mesh(new T.CylinderGeometry(2.0, 2.0, 27, 24), new T.MeshBasicMaterial({ color: 0xffbdf0 }));
    demoLamp.add(lampGlass); demoLamp.add(lampCore);
    [-15, 15].forEach(function (y) { var socket = new T.Mesh(new T.CylinderGeometry(5.4, 5.4, 3, 32), new T.MeshStandardMaterial({ color: 0x40545f, metalness: .8, roughness: .3 })); socket.position.y = y; demoLamp.add(socket); });
    var lampGlow = new T.PointLight(0xff70c8, 2, 45); demoLamp.add(lampGlow);

    // A luminous, expanding vacuum exhaust. Its layered shader fades the plume instead of drawing a solid cone.
    function makeTorchPlume(outerColor, coreColor) {
      var group = new T.Group(), level = { value: 0 }, time = { value: 0 };
      var vertex = "varying vec2 vUv; varying vec3 vN; varying vec3 vEye;" +
        "void main(){vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.0);" +
        "vN=normalize(normalMatrix*normal); vEye=normalize(-mv.xyz); gl_Position=projectionMatrix*mv;}";
      var fragment = "uniform vec3 uColor; uniform float uLevel; uniform float uTime; uniform float uStrength;" +
        "varying vec2 vUv; varying vec3 vN; varying vec3 vEye;" +
        "void main(){float t=vUv.y; float fade=smoothstep(0.0,0.18,t)*pow(t,1.1);" +
        "float face=pow(abs(dot(normalize(vN),normalize(vEye))),0.65);" +
        "float shimmer=0.88+0.12*sin(24.0*t-5.0*uTime+sin(vUv.x*6.283));" +
        "float a=uLevel*uStrength*fade*(0.28+0.72*face)*shimmer; gl_FragColor=vec4(uColor,a);}";
      function layer(length, endRadius, startRadius, color, strength) {
        var material = new T.ShaderMaterial({ uniforms: { uColor: { value: new T.Color(color) }, uLevel: level, uTime: time, uStrength: { value: strength } },
          vertexShader: vertex, fragmentShader: fragment, transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
        var mesh = new T.Mesh(alongX(new T.CylinderGeometry(startRadius, endRadius, length, 24, 16, true)), material);
        mesh.position.x = -1.6 - length / 2; mesh.renderOrder = 3; group.add(mesh);
      }
      layer(10.5, 1.35, 0.22, outerColor, 0.38);
      layer(5.2, 0.42, 0.14, coreColor, 0.58);
      var nozzleGlow = new T.Sprite(new T.SpriteMaterial({ map: starDiscTex, color: coreColor, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
      nozzleGlow.position.x = -1.65; nozzleGlow.scale.set(1.4, 1.4, 1); group.add(nozzleGlow);
      return { group: group, controls: { level: level, time: time, glow: nozzleGlow.material } };
    }

    // ---- Station 3: Courier Probe (sized to pop out of Lighthugger cargo bay) ----
    function makeCourierHull(bodyMaterial, accentColor) {
      var hull = new T.Group();
      var shell = new T.Mesh(alongX(new T.CylinderGeometry(0.48, 0.56, 2.1, 12)), bodyMaterial);
      var nose = new T.Mesh(alongX(new T.ConeGeometry(0.48, 1.1, 12)), bodyMaterial); nose.position.x = 1.6;
      var bell = new T.Mesh(alongX(new T.CylinderGeometry(0.48, 0.72, 0.6, 12, 1, true)), dark); bell.position.x = -1.35;
      hull.add(shell); hull.add(nose); hull.add(bell);
      var accent = new T.MeshBasicMaterial({ color: accentColor });
      [-1, 1].forEach(function (side) {
        var fin = new T.Mesh(new T.BoxGeometry(1.25, 0.09, 0.95), bodyMaterial); fin.position.set(-0.15, 0, side * 0.75); hull.add(fin);
        var light = new T.Mesh(new T.SphereGeometry(0.075, 8, 8), accent); light.position.set(0.35, 0.32, side * 0.24); hull.add(light);
      });
      return hull;
    }
    var shuttleGroup = new T.Group(); scene.add(shuttleGroup);
    var outboundTorch = makeTorchPlume(0x37c8f4, 0xc8f7ff), shutPlume = outboundTorch.group, shutPlumeMat = outboundTorch.controls;
    shuttleGroup.add(makeCourierHull(dark, 0x71e5ff)); shuttleGroup.add(shutPlume);
    shuttleGroup.scale.set(0.35, 0.35, 0.35); // physically fits within 11.2m cargo bay!
    shuttleGroup.visible = false;

    // Return shuttle launched by colony with replacement quantum navigation processor
    var returnGroup = new T.Group(); scene.add(returnGroup);
    var inboundTorch = makeTorchPlume(0xff9b56, 0xffe8c9), retPlume = inboundTorch.group, retPlumeMat = inboundTorch.controls;
    var retCore = new T.Mesh(new T.SphereGeometry(0.4, 12, 12), new T.MeshBasicMaterial({ color: 0xffd08a }));
    retCore.position.set(0.5, 0.5, 0);
    returnGroup.add(makeCourierHull(hullMat, 0xffd08a)); returnGroup.add(retPlume); returnGroup.add(retCore);
    returnGroup.scale.set(0.35, 0.35, 0.35);
    returnGroup.visible = false;

    // Impact flash and ejecta: a brief hot bloom, then independently moving fragments in vacuum.
    var boomGroup = new T.Group(); scene.add(boomGroup);
    boomGroup.position.set(36.2, 14, -45); boomGroup.visible = false;
    var boomCore = new T.Sprite(new T.SpriteMaterial({ map: starDiscTex, color: 0xfff5dc, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
    var boomGlow = new T.Sprite(new T.SpriteMaterial({ map: starDiscTex, color: 0xff8b48, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
    var ejectaCount = 140, debrisPos = new Float32Array(ejectaCount * 3), ejectaVelocity = [];
    for (var bi = 0; bi < ejectaCount; bi++) {
      var bu = hash(bi, 3, 7), bth = Math.PI * hash(bi, 5, 2), brr = Math.sqrt(1 - bu * bu);
      var ev = new T.Vector3(-0.55 - Math.abs(brr * Math.cos(bth)), bu, brr * Math.sin(bth)).normalize();
      ejectaVelocity.push(ev.multiplyScalar(1.8 + 4.2 * Math.abs(hash(bi, 8, 1))));
    }
    var debrisGeo = new T.BufferGeometry(); debrisGeo.setAttribute("position", new T.BufferAttribute(debrisPos, 3));
    var boomDebris = new T.Points(debrisGeo, new T.PointsMaterial({ size: 1.15, map: starDiscTex, color: 0xffb776, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
    boomDebris.frustumCulled = false;
    boomGroup.add(boomGlow); boomGroup.add(boomCore); boomGroup.add(boomDebris);
    var fragments = [], fragmentGeo = new T.TetrahedronGeometry(0.22, 0), fragmentMat = new T.MeshStandardMaterial({ color: 0x9b7866, emissive: 0x51220c, emissiveIntensity: 1.4, metalness: 0.6, roughness: 0.48 });
    var boomFragments = new T.Group(); scene.add(boomFragments); boomFragments.visible = false;
    for (var fi = 0; fi < 55; fi++) {
      var fragment = new T.Mesh(fragmentGeo, fragmentMat), direction = ejectaVelocity[(fi * 13) % ejectaCount].clone().multiplyScalar(0.35 + 0.28 * Math.abs(hash(fi, 2, 9)));
      fragment.userData.velocity = direction; fragment.scale.set(0.5 + 0.9 * Math.abs(hash(fi, 7, 4)), 0.35 + 0.5 * Math.abs(hash(fi, 2, 5)), 0.55 + 0.8 * Math.abs(hash(fi, 3, 1)));
      boomFragments.add(fragment); fragments.push(fragment);
    }

    return {
      renderer: renderer, scene: scene, camera: camera, canvas: canvas,
      lights: { ambient: ambient, blueRim: blueRim, aftRim: aftRim, courierFill: courierFill },
      ship: ship, demoLamp: demoLamp, lampCore: lampCore, lampGlass: lampGlass, lampGlow: lampGlow, ice: iceMat, boreMat: boreMat, doms: doms, domGlow: domGlow,
      station: station, stationData: stationData, calConduit: calConduit,
      colony: colony, colonyData: colonyData, platform: colony,
      dockParts: calConduit, beamMat: beamMat,
      navs: stationData.navs.concat(colonyData.navs),
      oneillRings: stationData.rings.concat(colonyData.rings),
      exMat: exMat, exCoreMat: exCoreMat, dust: dust, dustGeo: dg, dustLines: dustLines, graph: graph, bars: bars, caps: caps, checks: checks, graphErrors: graphErrors,
      celestialGroup: celestialGroup, planetMesh: planetMesh, ringMesh: ringMesh, cryoMoonMesh: cryoMoonMesh, encounter: encounter, WORLDS: WORLDS, setEncounterWorld: setEncounterWorld, spallGeo: spallGeo, spallStreaks: spallStreaks, iceSurfacePoints: iceSurfacePoints, spallTimer: 0,
      grid: gridLines, gridLines: gridLines, tickNotches: tickNotches,
      gridMat: gridMat, gridPulse: 0,
      fitCurve: fitCurve, fitLow: fitLow, fitHigh: fitHigh, refCurve: refCurve, setCurve: setCurve, RAIL: RAIL, H: H,
      cones: cones, innerCones: innerCones, halos: halos, vgeo: vgeo, events: events, evNext: 0, secGlow: M.SECTIONS.map(function () { return 0; }),
      buoys: buoys, rulerLine: rulerLine, gates: gates, buoyClocks: buoyClocks, shipClock: shipClock,
      shuttle: shuttleGroup, shutPlume: shutPlume, shutPlumeMat: shutPlumeMat,
      returnShuttle: returnGroup, retPlume: retPlume, retPlumeMat: retPlumeMat,
      boom: boomGroup, boomCore: boomCore, boomGlow: boomGlow, boomDebris: boomDebris, ejectaVelocity: ejectaVelocity, fragments: fragments, boomFragments: boomFragments, fragmentMat: fragmentMat,
      stars: starPoints, starCatalog: starCatalog, starBeta: -1,
      db: db, dbOfIdx: dbOfIdx, dbPoints: dbPoints, dbMat: dbMat, dbWorld: dbWorld, syncDb: syncDb, clusters: clusters, conCentroids: conCentroids,
      refStarGroup: refStarGroup, constellationLines: constellationLines, skyGrid: skyGrid,
      thermalGroup: thermalGroup, thermalSprites: thermalSprites, STAR_INFO: STAR_INFO,
      m4: new T.Matrix4(), v: new T.Vector3(), s: new T.Vector3(), c: new T.Color(), down: new T.Vector3(0, -1, 0), dir: new T.Vector3()
    };
  }

  // ---- camera: presets eased per step, plus a view controller (puck, arrow keys, drag) and zoom ----
  var cam = STEPS.title.cam.slice(), user = { yaw: 0, pitch: 0, zoom: 1, panX: 0, panY: 0 }, drag = null;
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function isSextantStep(step) { return step === "spectro-cal" || step === "spectro-star" || step === "dock"; }
  function sextantOn() { return isSextantStep(S.step); }

  // Zoom is a distance scale for the orbit camera and a field-of-view scale for the sextant, so the
  // magnification is 24 degrees / FOV = 1 / zoom. The sextant reaches a 0.08 degree field (x300).
  var ZOOM_MAX = 3.0;
  function zoomMin() { return sextantOn() ? 0.08 / 24 : 0.03; }
  function zoomFactor() { return 1 / user.zoom; }
  function zoomLabel() { var z = zoomFactor(); return "×" + (z >= 100 ? f(z, 0) : f(z, 1)); }
  function updateZoomHud() {
    var label = zoomLabel();
    var keys = $("view-zoom-level"); if (keys) keys.textContent = label;
    var dial = $("spacenav-value"); if (dial) dial.textContent = label;
  }
  function setZoom(z) { user.zoom = clamp(z, zoomMin(), ZOOM_MAX); updateZoomHud(); }
  function zoomBy(factor) { setZoom(user.zoom * factor); }
  function updateViewMode() {
    var sx = sextantOn();
    if ($("spacenav-mode")) $("spacenav-mode").textContent = sx ? "SLEW SEXTANT" : "ORBIT VIEW";
    if ($("view-keys-turn")) $("view-keys-turn").textContent = sx ? "slew sextant" : "turn view";
  }

  // The puck and the arrow keys are rate controllers: how far you tilt sets how fast the view turns.
  var view = { x: 0, y: 0, zoomHold: 0, keys: {} };
  function viewVector() {
    var kx = (view.keys.ArrowRight ? 1 : 0) - (view.keys.ArrowLeft ? 1 : 0);
    var ky = (view.keys.ArrowUp ? 1 : 0) - (view.keys.ArrowDown ? 1 : 0);
    var fine = view.keys.Shift ? 0.3 : 1;
    return { x: clamp(view.x + kx * 0.75 * fine, -1, 1), y: clamp(view.y + ky * 0.75 * fine, -1, 1) };
  }
  function applyViewRate(dt) {
    if (view.zoomHold) zoomBy(Math.exp(view.zoomHold * dt * 1.7));
    var v = viewVector(), mag = Math.hypot(v.x, v.y);
    if (mag < 0.03) return;
    var gain = Math.pow(mag, 1.4) / mag;                       // gentle near the centre, full rate at the stop
    var vx = v.x * gain, vy = v.y * gain;
    if (sextantOn()) {
      cancelSlew();
      var rate = 70 * clamp(G.camera.fov / 24, 0.004, 1.4);     // degrees per second at full tilt, finer when zoomed in
      rotateScopeAim(-vx * rate * dt, vy * rate * dt);
    } else {
      user.yaw += vx * 1.6 * dt;
      user.pitch = clamp(user.pitch + vy * 1.2 * dt, -1.1, 1.1);
    }
  }
  (function bindViewController() {
    var base = $("spacenav-base"), knob = $("spacenav-knob");
    if (!base || !knob) return;
    var REACH = 22, pointer = null, cx = 0, cy = 0;
    function tilt(e) {
      var dx = e.clientX - cx, dy = e.clientY - cy, d = Math.hypot(dx, dy);
      if (d > REACH) { dx *= REACH / d; dy *= REACH / d; }
      knob.style.transform = "translate(" + f(dx, 1) + "px," + f(dy, 1) + "px)";
      view.x = dx / REACH; view.y = -dy / REACH;
    }
    function release() {
      if (pointer === null) return;
      pointer = null; view.x = 0; view.y = 0;
      knob.classList.remove("active"); knob.style.transform = "";
    }
    base.addEventListener("pointerdown", function (e) {
      if (e.button > 0) return;
      var r = base.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      pointer = e.pointerId; base.setPointerCapture(pointer);
      knob.classList.add("active"); knob.focus({ preventScroll: true }); tilt(e); e.preventDefault();
    });
    base.addEventListener("pointermove", function (e) { if (pointer === e.pointerId) tilt(e); });
    base.addEventListener("pointerup", release);
    base.addEventListener("pointercancel", release);
    base.addEventListener("wheel", function (e) { e.preventDefault(); zoomBy(Math.exp(e.deltaY * (sextantOn() ? 0.0022 : 0.001))); }, { passive: false });
    // Zoom buttons: a click steps, holding keeps zooming.
    var holdTimer = null;
    function zoomDown(dir) {
      return function (e) {
        if (e.button > 0) return;
        zoomBy(dir > 0 ? 1 / 1.35 : 1.35);
        clearTimeout(holdTimer);
        holdTimer = setTimeout(function () { view.zoomHold = -dir; }, 280);
        e.currentTarget.setPointerCapture(e.pointerId);
      };
    }
    function zoomUp() { clearTimeout(holdTimer); view.zoomHold = 0; }
    [["zoom-in", 1], ["zoom-out", -1]].forEach(function (pair) {
      var b = $(pair[0]); if (!b) return;
      b.addEventListener("pointerdown", zoomDown(pair[1]));
      b.addEventListener("pointerup", zoomUp);
      b.addEventListener("pointercancel", zoomUp);
      b.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); zoomBy(pair[1] > 0 ? 1 / 1.35 : 1.35); } });
    });
    updateZoomHud(); updateViewMode();
  })();
  if (G) {
    G.canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    G.canvas.addEventListener("pointerdown", function (e) {
      drag = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, button: e.button, shift: e.shiftKey };
      cancelSlew();
      G.canvas.setPointerCapture(e.pointerId);
    });
    G.canvas.addEventListener("pointermove", function (e) {
      if (!drag) { showSkyHover(e); return; }
      var isPan = !sextantOn() && (drag.button === 2 || drag.button === 1 || drag.shift || e.shiftKey);
      if (isPan) {
        user.panX -= (e.clientX - drag.x) * 0.04 * user.zoom;
        user.panY += (e.clientY - drag.y) * 0.04 * user.zoom;
        drag.x = e.clientX;
        drag.y = e.clientY;
        return;
      }
      if (sextantOn()) {
        // Grab the sky: the point under the cursor stays under the cursor. Horizontal drag yaws the
        // sight and vertical drag pitches it, so the view never rolls around the bow axis.
        var k = scopeDegPerPixel();
        rotateScopeAim((e.clientX - drag.x) * k, (e.clientY - drag.y) * k);
        drag.x = e.clientX;
        drag.y = e.clientY;
        return;
      }
      user.yaw -= (e.clientX - drag.x) * 0.006;
      user.pitch = clamp(user.pitch + (e.clientY - drag.y) * 0.005, -1.1, 1.1);
      drag.x = e.clientX;
      drag.y = e.clientY;
    });
    G.canvas.addEventListener("pointerup", function (e) {
      if (drag && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 5 && sextantOn()) {
        var hit = skyTargetAt(e.clientX, e.clientY);
        if (hit) slewToDir(hit.dir);
      }
      drag = null;
    });
    G.canvas.addEventListener("pointercancel", function () { drag = null; });
    G.canvas.addEventListener("wheel", function (e) {
      e.preventDefault(); zoomBy(Math.exp(e.deltaY * (sextantOn() ? 0.0022 : 0.001)));
    }, { passive: false });

  }
  // Station panels dock to the right edge on wide screens. The camera's view window is shifted so the
  // scene stays centred in the space the panel leaves free, and --dock-w lets CSS centre the sight there.
  // The three sextant tasks share one panel; every other step has a panel of its own.
  function panelId(step) { return isSextantStep(step) ? "s-sextant" : step === "courier" ? "s-dock" : "s-" + step; }
  function dockedPanel() {
    var p = $(panelId(S.step));
    return p && p.classList.contains("panel") && !p.hidden ? p : null;
  }
  function activeCard() {
    var p = $(panelId(S.step));
    return p && p.classList.contains("card") && !p.hidden ? p : null;
  }
  // Wide screens: the console sits at the right edge. Narrow screens (phones): it is a sheet along the bottom.
  function bottomInstrument() { return S.step === "cal" || S.step === "flight" || S.step === "courier" || sextantOn(); }
  function dockWidth() { var p = dockedPanel(); return p && window.innerWidth > 900 && !bottomInstrument() ? p.offsetWidth + 24 : 0; }
  function dockHeight() { var p = dockedPanel(); return p && (window.innerWidth <= 900 || bottomInstrument()) ? p.offsetHeight : 0; }
  function applyDock() {
    var d = dockWidth(), dh = dockHeight();
    var card = activeCard(), ch = card ? card.offsetHeight : 0;
    document.documentElement.style.setProperty("--dock-w", d + "px");
    document.documentElement.style.setProperty("--dock-h", dh + "px");
    document.documentElement.style.setProperty("--card-h", ch + "px");
    if (!G) return;
    var w = window.innerWidth, h = window.innerHeight;
    var hud = document.querySelector("header.hud"), topH = hud ? Math.ceil(hud.getBoundingClientRect().bottom) : 0;
    var activeBox = dockedPanel() || card;
    // Shift the camera window so scene targets sit centred in the clear band between HUD and console/card.
    if (d > 0) {
      G.camera.setViewOffset(w, h, d / 2, dh / 2, w, h);
    } else if (activeBox && !activeBox.hidden && activeBox.offsetHeight > 0) {
      var offY = Math.max(0, (h - activeBox.getBoundingClientRect().top - topH) / 2);
      G.camera.setViewOffset(w, h, 0, offY, w, h);
    } else {
      G.camera.clearViewOffset();
    }
    G.camera.updateProjectionMatrix();
  }
  function resize() {
    if (!G) return;
    var w = window.innerWidth, h = window.innerHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    G._w = w; G._h = h;
    G.renderer.setPixelRatio(dpr);
    G.renderer.setSize(w, h, false);
    G.camera.aspect = w / h;
    G.camera.updateProjectionMatrix();
    applyDock();
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { applyDock(); });
  window.addEventListener("resize", resize);
  if (window.ResizeObserver) {
    var panelObserver = new ResizeObserver(function () { applyDock(); });
    each(".panel, .card", function (box) { panelObserver.observe(box); });
  }
  resize();

  // ---- frame kinematics for the briefing ----
  function wrap(x, period) { return x - period * Math.round(x / period); }
  function kin() {
    var b = S.beta, g = gammaOf(b), shipFrame = S.step === "length" && S.frame === "ship";
    var t = S.clock;
    if (shipFrame) return { b: b, g: g, ship: true, shipX: 0, shipScale: 1, offset: 48 - b * CU * t, rulerScale: 1 / g, t: t };
    if (S.step === "length") return { b: b, g: g, ship: false, shipX: -46 + b * CU * t, shipScale: 1 / g, offset: 0, rulerScale: 1, t: t };
    return { b: b, g: g, ship: false, shipX: -46 + b * CU * t, shipScale: 1 / g, offset: 0, rulerScale: 1, t: t };
  }
  function buoyX(i, k) {
    var X = (i - (NBUOY - 1) / 2) * BUOY;
    return k.ship ? wrap(X * k.rulerScale + k.offset, SPAN * k.rulerScale) : X;
  }

  // ---- DOM labels projected from the scene ----
  var labelBox = $("labels"), labels = [];
  function label(text, steps, where, cls) {
    var el = document.createElement("span"); el.textContent = text; if (cls) el.className = cls; labelBox.appendChild(el);
    var l = { el: el, steps: steps, where: where }; labels.push(l); return l;
  }
  var L3 = {};
  if (G) {
    var V3 = function (x, y, z) { return new T.Vector3(x, y, z || 0); };
    var onShip = function (x, y) { return function () { return G.ship.localToWorld(V3(x, y)); }; };
    var GR = ["muons", "cal", "flight"];
    label("0 m", GR, onShip(xAt(0), G.RAIL - 0.9), "dim");
    label("600 m", GR, onShip(xAt(600), G.RAIL - 0.9), "dim");
    label("1200 m", GR, onShip(xAt(1200), G.RAIL - 0.9), "dim");
    L3.tick1 = label("", GR, function () { return G.ship.localToWorld(V3(xAt(0) + 2.2, L3.tick1.yPos || (G.RAIL + G.H * 0.33))); }, "dim tick");
    L3.tick2 = label("", GR, function () { return G.ship.localToWorld(V3(xAt(0) + 2.2, L3.tick2.yPos || (G.RAIL + G.H * 0.66))); }, "dim tick");
    L3.tick3 = label("", GR, function () { return G.ship.localToWorld(V3(xAt(0) + 2.2, L3.tick3.yPos || (G.RAIL + G.H))); }, "dim tick");
    L3.eq = label("", GR, onShip(xAt(820), G.RAIL + G.H + 1.6), "eq");
    label("MUONS ENTER", ["muons"], onShip(BOW + 1.5, -2.2));
    label("THICK ICE SHIELD (1200 m)", ["muons"], onShip(xAt(850), -(iceHalfT(xAt(850)) + 1.4)));
    label("HYDROGEN LAMP · ENLARGED", ["doppler"], function () { return G.demoLamp.position.clone().add(V3(0, 20)); });
    L3.hullTag = label("", ["doppler"], function () { return G.ship.position.clone().add(V3(10, 15)); }, "clock");
    label("WAYPOINT STATION", ["length", "time", "cal"], function () { return G.station.localToWorld(V3(22, 16)); });
    var SXS = ["spectro-cal", "spectro-star", "dock"];
    var skyPoint3 = function (theta, az) {
      var t = theta * RAD, a = az * RAD;
      return V3(440 * Math.cos(t), 440 * Math.sin(t) * Math.cos(a), 440 * Math.sin(t) * Math.sin(a));
    };
    L3.waypoint = label("WAYPOINT · SEARCH REGION", ["dock"], function () { return skyPoint3(THERMAL[0].theta + 3.2, THERMAL[0].az + 180); }, "waypoint-tag");   // across the bow pole from IR-1, so the tags never overlap
    L3.waypoint.show = function () { return !S.shuttleLaunched; };
    L3.measured = label("", ["length"], function () { return V3(G.gateMid, RULER_Y - 1.4); }, "clock");
    L3.frame = label("", ["length", "time"], function () { return V3(0, RULER_Y + 8); }, "scene-banner");
    L3.buoyNums = [];
    for (var i = 0; i < NBUOY; i += 5) (function (i) {
      var X = (i - (NBUOY - 1) / 2) * BUOY;
      if (Math.abs(X) > 60) return;
      L3.buoyNums.push(label((X + 50) * U + " m", ["length"], function () { return V3(buoyX(i, kin()), RULER_Y + 1.5); }, "dim"));
    })(i);
    L3.shipClock = label("", ["time"], function () { return G.shipClock.g.position.clone().add(V3(0, -3.4)); }, "clock clock-below");
    L3.buoyClock = label("", ["time"], function () { return G.nearClock.g.position.clone().add(V3(0, 2.9)); }, "clock clock-above");
    // AR overlay for the sextant: catalog star names, constellation names, and infrared source tags.
    function fovLimit() { var fov = G.camera.fov; return fov > 45 ? 12 : fov > 20 ? 36 : fov > 8 ? 64 : DB_SIZE; }
    L3.dbLabels = G.db.map(function (e, k) {
      var lbl = label("★ " + e.name + " " + e.cls, SXS, function () { return G.dbWorld[k]; }, "star-3d-tag");
      lbl.dbIdx = e.idx; lbl.rank = e.rank;
      lbl.show = function (l) {
        var locked = !!(S.sxTarget && S.sxTarget.idx === l.dbIdx);
        l.el.classList.toggle("locked", locked);
        return locked || l.rank < fovLimit();
      };
      return lbl;
    });
    L3.conLabels = G.clusters.map(function (c, k) {
      var lbl = label(c.name.toUpperCase(), SXS, function () { return G.conCentroids[k]; }, "ar-constellation");
      lbl.show = function () { return G.camera.fov > 7; };
      return lbl;
    });
    L3.thermalPos = THERMAL.map(function (src) { return skyPoint3(src.theta, src.az); });
    L3.thermalLabels = THERMAL.map(function (src, i) {
      var lbl = label(src.id, SXS, function () { return L3.thermalPos[i]; }, "app-target-tag");
      lbl.show = function () { return thermalVisible(src); };
      return lbl;
    });
  }
  var VP = T ? new T.Vector3() : null;
  function placeLabels() {
    var w = window.innerWidth, h = window.innerHeight, dockPx = dockWidth(), dockV = dockHeight();
    var hud = document.querySelector("header.hud"), topFloor = hud ? Math.ceil(hud.getBoundingClientRect().bottom) + 6 : 52;
    var sextant = sextantOn();
    var shownBuoyLxs = [];
    labels.forEach(function (l) {
      if (l.steps.indexOf(S.step) < 0 || !l.el.textContent) { l.el.style.display = "none"; return; }
      if (l.show && !l.show(l)) { l.el.style.display = "none"; return; }
      if (l.el.classList.contains("scene-banner")) {
        l.el.style.display = "";
        l.el.style.left = (w - dockPx) / 2 + "px";
        l.el.style.top = topFloor + "px";
        return;
      }
      VP.copy(l.where()).project(G.camera);
      if (VP.z > 1 || Math.abs(VP.x) > 1.05 || Math.abs(VP.y) > 1.05) { l.el.style.display = "none"; return; }
      var lx = (VP.x + 1) / 2 * w, free = w - dockPx;
      var ly = (1 - VP.y) / 2 * h;
      var panel = dockedPanel();
      var bottomFloor = panel && (window.innerWidth <= 900 || bottomInstrument()) ? panel.getBoundingClientRect().top - 10 : h - dockV;
      if (lx > free || ly > bottomFloor) { l.el.style.display = "none"; return; }   // behind the docked console
      if (sextant && ly < topFloor) { l.el.style.display = "none"; return; }
      if (L3.buoyNums && L3.buoyNums.indexOf(l) >= 0) {
        if (shownBuoyLxs.some(function (px) { return Math.abs(lx - px) < 80; })) { l.el.style.display = "none"; return; }
        shownBuoyLxs.push(lx);
      }
      l.el.style.display = "";
      if (!sextant) {
        var isEq = l.el.classList.contains("eq");
        var isAbove = l.el.classList.contains("clock-above");
        if (l.el.classList.contains("clock") || isEq) {
          var hw = (l.el.offsetWidth || 150) / 2;
          lx = clamp(lx, hw + 10, Math.max(hw + 10, free - hw - 10));
        }
        var bannerOffset = (S.step === "length" || S.step === "time") ? 26 : 0;
        var minY = topFloor + bannerOffset + (isEq ? (l.el.offsetHeight || 82) + 4 : isAbove ? (l.el.offsetHeight || 18) + 8 : 12);
        if (ly < minY) ly = Math.min(minY, Math.max(topFloor, h - dockV - 10));
      }
      l.el.style.left = lx + "px";
      l.el.style.top = ly + "px";
    });
  }

  // ---- briefing readouts ----
  function readBriefing() {
    var b = S.beta, g = gammaOf(b), L = M.decayLength(b);
    each("input.beta", function (el) { el.value = Math.max(Number(el.min), b); el.setAttribute("aria-valuetext", f(Number(el.value), 2) + " c"); });
    each("output.beta-out", function (el) { el.textContent = f(b, 2) + "c"; });
    $("r-length").textContent = S.frame === "station"
      ? "Station frame: the buoys are at rest and the ship moves at " + f(b, 2) + "c.\nShip length measured against the buoys: " + f(SHIP_M / g, 0) +
        " m (" + f(SHIP_M, 0) + " m at rest).\nγ = " + f(g, 2)
      : "Ship frame: the ship is at rest, " + f(SHIP_M, 0) + " m long. The buoys move at " + f(b, 2) + "c.\nBuoy spacing measured from the ship: " +
        f(200 / g, 0) + " m (200 m at rest).\nγ = " + f(g, 2);
    $("r-time").textContent = "γ = " + f(g, 2) + "\nWhile the station clocks advance 10.0 µs, the ship clock advances " + f(10 / g, 1) +
      (b < 0.01 ? " µs.\nAt rest together, both clocks advance at the same rate." : " µs.\nFrom the ship's frame it is the station's clocks that run slow.");
    $("r-muons").textContent = "Average decay distance L = βγcτ = " + f(L, 0) + " m\nWithout time dilation it would be βcτ = " +
      f(b * P.MUON_CTAU, 0) + " m.\nFit the decays for L, and L gives your speed.";
    drawDopplerBriefing();
    each("button.frame", function (el) { el.setAttribute("aria-pressed", el.getAttribute("data-frame") === S.frame ? "true" : "false"); });
    var lengthNext = document.querySelector('#s-length [data-go="time"]');
    if (lengthNext) lengthNext.disabled = !(S.framesSeen.station && S.framesSeen.ship);
    if ($("length-progress")) $("length-progress").textContent = S.framesSeen.station && S.framesSeen.ship ? "Both frames viewed. Continue when ready." : "View both the station frame and ship frame to continue.";
  }
  // Approximate visible color of a wavelength (Bruton), then mix the four Balmer lines. At rest this is
  // the familiar pink hydrogen glow; approach drives it blue, recession red. The eye's response fades at
  // both ends of the band, and a line shifted outside 380-780 nm gives no visible light at all.
  function waveRGB(nm) {
    if (!(nm >= 380 && nm <= 780)) return [0, 0, 0];
    var r = 0, g = 0, b = 0, edge = nm < 420 ? 0.3 + 0.7 * (nm - 380) / 40 : nm > 700 ? 0.3 + 0.7 * (780 - nm) / 80 : 1;
    if (nm < 440) { r = -(nm - 440) / 60; b = 1; }
    else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
    else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
    else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
    else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
    else { r = 1; }
    return [edge * Math.max(0, Math.min(1, r)), edge * Math.max(0, Math.min(1, g)), edge * Math.max(0, Math.min(1, b))];
  }
  function balmerColor(shift) {
    var lines = [[656.28, 1], [486.13, 0.55], [434.05, 0.35], [410.17, 0.25]], r = 0, g = 0, b = 0, w = 0;
    lines.forEach(function (l) {
      var rgb = waveRGB(l[0] * shift);
      r += rgb[0] * l[1]; g += rgb[1] * l[1]; b += rgb[2] * l[1]; w += l[1];
    });
    r /= w; g /= w; b /= w;
    // Hue is normalised; when every line has left the visible band the lamp gives no visible light.
    var mx = Math.max(r, g, b);
    if (mx < 0.02) return [0, 0, 0];
    return [Math.min(1, r / mx), Math.min(1, g / mx), Math.min(1, b / mx)];
  }
  // Tint the ship's hull as a blackbody seen at observed temperature T0 (kelvin); null restores it.
  var hullTint = { list: null, on: false };
  function applyHullTint(T0) {
    if (!G) return;
    if (!hullTint.list) {
      hullTint.list = [];
      G.ship.traverse(function (o) {
        if (!o.isMesh || !o.material) return;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (mt) {
          if (!mt.color || hullTint.list.some(function (e) { return e.mat === mt; })) return;
          hullTint.list.push({ mat: mt, color: mt.color.clone(), emissive: mt.emissive ? mt.emissive.clone() : null, ei: mt.emissiveIntensity });
        });
      });
    }
    if (T0 == null) {
      if (!hullTint.on) return;
      hullTint.list.forEach(function (e) {
        e.mat.color.copy(e.color);
        if (e.emissive) { e.mat.emissive.copy(e.emissive); e.mat.emissiveIntensity = e.ei; }
      });
      hullTint.on = false;
      return;
    }
    // The hull glows as a 3,200 K blackbody; seen at T0 it is exactly a T0 blackbody, so its emission takes
    // that colour, and reflected light takes the same ratio of colours. No extra exaggeration.
    var mul = dopplerTint(3200, T0 / 3200), glowC = bbColor(T0);
    hullTint.list.forEach(function (e) {
      e.mat.color.setRGB(e.color.r * mul[0], e.color.g * mul[1], e.color.b * mul[2]);
      if (e.emissive) { e.mat.emissive.setRGB(0.35 * glowC[0], 0.35 * glowC[1], 0.35 * glowC[2]); e.mat.emissiveIntensity = 1; }
    });
    hullTint.on = true;
  }
  function dopplerShift() {
    if (S.dopplerFrame !== "ship") return 1;
    return S.dopplerRecede ? Math.sqrt((1 + S.beta) / (1 - S.beta)) : Math.sqrt((1 - S.beta) / (1 + S.beta));
  }
  function drawDopplerBB() {
    var svg = $("p-doppler-bb"); if (!svg) return;
    while (svg.lastChild && svg.lastChild.nodeName !== "title") svg.removeChild(svg.lastChild);
    // The lamp frame sees the hull approaching (or receding) with the opposite sign.
    var hullShift = S.dopplerFrame === "lamp"
      ? (S.dopplerRecede ? Math.sqrt((1 + S.beta) / (1 - S.beta)) : Math.sqrt((1 - S.beta) / (1 + S.beta)))
      : 1;
    var T0 = 3200, T = T0 / hullShift;
    var x = function (nm) { return 48 + (nm - 300) / 800 * 600; };
    function planck(nm, temp) {
      var um = nm / 1000, exponent = 14387.77 / (um * temp);
      return 1 / (Math.pow(um, 5) * Math.expm1(exponent));
    }
    var vals = [], rest = [], max = 0, i, nm;
    for (i = 0; i <= 140; i++) {
      nm = 300 + 800 * i / 140;
      var a = planck(nm, T), b = planck(nm, T0);
      vals.push(a); rest.push(b); max = Math.max(max, a, b);
    }
    var defs = el("defs", {}, svg);
    var grad = el("linearGradient", { id: "doppler-band-bb", x1: "0", x2: "1" }, defs);
    [[0, "#2b123f"], [0.2, "#1f4c9a"], [0.42, "#1f8f88"], [0.62, "#7bbf3a"], [0.8, "#d9b63a"], [0.92, "#d7652a"], [1, "#5a0f16"]].forEach(function (stop) {
      el("stop", { offset: stop[0], "stop-color": stop[1] }, grad);
    });
    var g = el("g", {}, svg);
    el("rect", { x: 48, y: 20, width: 600, height: 20, fill: "url(#doppler-band-bb)", opacity: 0.32, stroke: "#417574" }, g);
    [400, 500, 600, 700, 800, 900, 1000].forEach(function (tmpNm) {
      el("line", { x1: x(tmpNm), x2: x(tmpNm), y1: 40, y2: 80, "class": "grid" }, g);
      el("text", { x: x(tmpNm), y: 93, "text-anchor": "middle", style: "font-size:9px;fill:#92c9c4" }, g, String(tmpNm));
    });
    el("line", { x1: 48, x2: 648, y1: 80, y2: 80, "class": "axis" }, g);
    var restPath = "", path = "";
    rest.forEach(function (v, k) {
      var xx = x(300 + 800 * k / 140).toFixed(1);
      restPath += (k ? "L" : "M") + xx + " " + (78 - 54 * v / max).toFixed(1);
    });
    vals.forEach(function (v, k) {
      var xx = x(300 + 800 * k / 140).toFixed(1);
      path += (k ? "L" : "M") + xx + " " + (78 - 54 * v / max).toFixed(1);
    });
    el("path", { d: restPath, fill: "none", stroke: "#5f847f", "stroke-width": 1, "stroke-dasharray": "3 3", opacity: 0.8 }, g);
    el("path", { d: path, fill: "none", stroke: "#ffb779", "stroke-width": 2.2 }, g);
    el("line", { x1: x(656.28), x2: x(656.28), y1: 16, y2: 80, stroke: "#e8c686", "stroke-dasharray": "4 3" }, g);
    el("text", { x: 52, y: 12, style: "font-size:10px;fill:#ffd99a" }, g, "HULL CONTINUUM · 3,200 K rest" + (Math.abs(hullShift - 1) > 0.001 ? " → " + f(T, 0) + " K observed" : ""));
    el("text", { x: 648, y: 12, "text-anchor": "end", style: "font-size:9px;fill:#92c9c4" }, g, "peak " + f(2897771.9 / T, 0) + " nm");
    var cap = $("cap-hull");
    if (cap) cap.textContent = "HULL · blackbody · 3,200 K rest" + (Math.abs(hullShift - 1) > 0.001 ? " · " + f(T, 0) + " K observed" : "");
  }
  function drawDopplerBriefing() {
    var svg = $("p-doppler"); if (!svg) return;
    while (svg.lastChild && svg.lastChild.nodeName !== "title") svg.removeChild(svg.lastChild);
    var frame = S.dopplerFrame, shift = dopplerShift();
    var wave = 656.28 * shift, x = function (nm) { return 48 + (nm - 60) / 700 * 600; };
    var defs = el("defs", {}, svg);
    var grad = el("linearGradient", { id: "doppler-band", x1: "0", x2: "1" }, defs);
    [[0, "#2b123f"], [0.18, "#3b1f6b"], [0.34, "#1f4c9a"], [0.48, "#1f8f88"], [0.62, "#7bbf3a"], [0.76, "#d9b63a"], [0.88, "#d7652a"], [1, "#5a0f16"]].forEach(function (stop) {
      el("stop", { offset: stop[0], "stop-color": stop[1] }, grad);
    });
    var g = el("g", {}, svg);
    el("rect", { x: 48, y: 25, width: 600, height: 32, fill: "url(#doppler-band)", opacity: 0.45, stroke: "#417574" }, g);
    [[100,"UV"],[400,"violet"],[550,"green"],[700,"red"]].forEach(function (p) { el("text", {x:x(p[0]),y:76,"text-anchor":"middle",style:"fill:#92c9c4;font-size:10px"}, g,p[0]+" nm · "+p[1]); });
    el("line", {x1:x(656.28),x2:x(656.28),y1:17,y2:63,stroke:"#e8c686","stroke-dasharray":"4 3"},g);
    [[656.28, "H-alpha"], [486.13, "H-beta"], [434.05, "H-gamma"], [410.17, "H-delta"]].forEach(function (line) {
      var shifted = line[0] * shift, xx = x(shifted);
      if (shifted < 60 || shifted > 760) return;
      el("line", { x1: xx, x2: xx, y1: 22, y2: 64, stroke: "#ffe9f4", "stroke-width": line[1] === "H-alpha" ? 5 : 2.2, opacity: line[1] === "H-alpha" ? 1 : 0.55 }, g);

    });
    if (wave < 60 || wave > 760) {
      el("text", { x: wave > 760 ? 646 : 50, y: 42, "text-anchor": wave > 760 ? "end" : "start", style: "font-size:10px;fill:#ffb0a0" }, g, "H-α out of band → " + f(wave, 0) + " nm");
    } else {
      el("line", {x1:x(wave),x2:x(wave),y1:24,y2:58,stroke:frame === "ship" ? "#70b8ff" : "#ff6d8c","stroke-width":5},g);
    }
    el("text", {x:48,y:13,style:"fill:#e8c686;font-size:11px"},g,"REST H-α 656.3 nm (dashed) · observed "+f(wave,1)+" nm");
    $("r-doppler").textContent = frame === "ship"
      ? "Ship frame: the hull is at rest at 3,200 K. The relative motion shifts the lamp's H-α line to " + f(wave, 1) + " nm; compare it with 656.3 nm."
      : frame === "lamp"
        ? "Lamp frame: the lamp is at rest at 656.3 nm. The hull continuum shifts to an apparent " + f(3200 / (S.dopplerRecede ? Math.sqrt((1 + S.beta) / (1 - S.beta)) : Math.sqrt((1 - S.beta) / (1 + S.beta))), 0) + " K."
        : "Shared rest frame: both at rest. The lamp line sits at 656.3 nm and the hull continuum peaks near 906 nm.";
    each("[data-doppler-frame]", function (button) { button.setAttribute("aria-pressed", String(button.getAttribute("data-doppler-frame") === frame)); });
    each("[data-doppler-dir]", function (button) { button.setAttribute("aria-pressed", String((button.getAttribute("data-doppler-dir") === "recede") === !!S.dopplerRecede)); button.disabled = frame === "rest"; });
    var dopSliderRow = $("doppler-slider-row");
    if (dopSliderRow) {
      var dopInp = dopSliderRow.querySelector("input.beta"), dopOut = dopSliderRow.querySelector("output.beta-out");
      dopSliderRow.classList.toggle("is-disabled", frame === "rest");
      if (dopInp) dopInp.disabled = frame === "rest";
      if (dopOut && frame === "rest") dopOut.textContent = "0.00c (rest)";
      else if (dopOut) dopOut.textContent = f(S.beta, 2) + "c";
    }
    drawDopplerBB();
  }
  each("[data-doppler-frame]", function (button) { button.addEventListener("click", function () { S.dopplerFrame = button.getAttribute("data-doppler-frame"); drawDopplerBriefing(); }); });
  each("[data-doppler-dir]", function (button) { button.addEventListener("click", function () { S.dopplerRecede = button.getAttribute("data-doppler-dir") === "recede"; drawDopplerBriefing(); }); });
  each("input.beta", function (el) {
    el.addEventListener("input", function () { S.beta = Number(el.value); S.clock = 0; S.demo = null; readBriefing(); });
  });
  each("button.frame", function (el) {
    el.addEventListener("click", function () {
      S.frame = el.getAttribute("data-frame"); S.framesSeen[S.frame] = true; S.clock = 0; readBriefing();
      announce(S.frame === "station" ? "Station frame." : "Ship frame.");
    });
  });

  // ---- the lab: tables, plots and live fits ----
  function makeTable(id, heads) {
    var t = $(id), cells = [], tr = document.createElement("tr");
    heads.forEach(function (h) { var th = document.createElement("th"); th.scope = "col"; th.textContent = h; tr.appendChild(th); });
    var thead = document.createElement("thead"); thead.appendChild(tr); t.appendChild(thead);
    var tb = document.createElement("tbody");
    M.SECTIONS.forEach(function (x, k) {
      var row = document.createElement("tr"), rc = [];
      heads.forEach(function (h, j) {
        var c = document.createElement(j === 0 ? "th" : "td");
        if (j === 0) { c.scope = "row"; c.textContent = String(k + 1); }
        if (j === 1) c.textContent = (x - M.WIDTH / 2) + "–" + (x + M.WIDTH / 2);
        row.appendChild(c); rc.push(c);
      });
      tb.appendChild(row); cells.push(rc);
    });
    t.appendChild(tb);
    return cells;
  }
  var calCells = makeTable("t-cal", ["Section", "Range (m)", "Decays", "Rel. efficiency"]);
  var flCells = makeTable("t-fl", ["Section", "Range (m)", "Decays", "Corrected"]);

  var SVGNS = "http://www.w3.org/2000/svg";
  function el(name, attrs, parent, text) {
    var e = document.createElementNS(SVGNS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  // Histogram of decay positions with error bars, the fit, and an optional reference curve.
  function drawPlot(svg, n, v, fit, ref, eq) {
    while (svg.lastChild && svg.lastChild.nodeName !== "title") svg.removeChild(svg.lastChild);
    var W = 380, Hh = 210, x0 = 48, x1 = W - 12, y0 = Hh - 30, y1 = 40, log = S.log;
    var maxN = Math.max.apply(null, n.map(function (c, k) { return c + Math.sqrt(v[k] || 0); }).concat([ref ? ref(0) : 0, 1]));
    var top, bot, ys;
    if (log) {
      var pos = n.filter(function (c) { return c > 0; });
      top = Math.ceil(Math.log10(maxN * 1.05)); bot = Math.min(top - 1, Math.floor(Math.log10(pos.length ? Math.min.apply(null, pos) : 1)));
      ys = function (c) { return c > 0 ? y0 - (y0 - y1) * (Math.log10(c) - bot) / (top - bot) : y0; };
    } else {
      top = niceCeil(maxN * 1.05);
      ys = function (c) { return y0 - (y0 - y1) * Math.max(0, c) / top; };
    }
    var xs = function (d) { return x0 + (x1 - x0) * d / M.CHANNEL; };
    var g = el("g", {}, svg);
    var ticks;
    if (log) {
      ticks = [];
      for (var p = bot; p <= top; p++) ticks.push(Math.pow(10, p));
    } else {
      var st = niceStep(top, 5);
      ticks = [0];
      for (var tv = st; tv <= top * 1.0001; tv += st) ticks.push(tv);
    }
    ticks.forEach(function (t) {
      el("line", { x1: x0, x2: x1, y1: ys(t), y2: ys(t), "class": "grid" }, g);
      el("text", { x: x0 - 5, y: ys(t) + 3, "text-anchor": "end" }, g, t >= 1e5 ? t.toExponential(0).replace("e+", "e") : (t >= 1000 && !log ? String(t / 1000) + "k" : String(t)));
    });
    [0, 300, 600, 900, 1200].forEach(function (d) { el("text", { x: xs(d), y: y0 + 13, "text-anchor": "middle" }, g, String(d)); });
    el("text", { x: (x0 + x1) / 2, y: y0 + 26, "text-anchor": "middle" }, g, "position along the bore (m)");
    el("line", { x1: x0, x2: x1, y1: y0, y2: y0, "class": "axis" }, g);
    M.SECTIONS.forEach(function (x, k) {
      var a = xs(x - M.WIDTH / 2) + 1, b = xs(x + M.WIDTH / 2) - 1, yt = ys(n[k]);
      var locked = S.step === "cal" && n[k] >= STUDENT_CAL_HITS;
      var r = el("rect", { x: a, y: Math.min(yt, y0), width: b - a, height: Math.max(0, y0 - yt), rx: 2, "class": "bar", style: locked ? "fill:#36d875" : "" }, g);
      el("title", {}, r, "Section " + (k + 1) + ", " + (x - 50) + "–" + (x + 50) + " m: " + f(n[k], 0) + " decays");
      if (locked) el("text", { x: (a + b) / 2, y: Math.max(y1 + 10, yt - 3), "text-anchor": "middle", style: "fill:#62ff9a;font-size:12px;font-weight:bold" }, g, "✓");
      var e = Math.sqrt(v[k] || 0);
      if (n[k] > 0 && e > 0) el("line", { x1: (a + b) / 2, x2: (a + b) / 2, y1: ys(n[k] + e), y2: ys(Math.max(n[k] - e, log ? n[k] * 0.5 : 0)), "class": "err" }, g);
    });
    function curve(fn, cls, dash) {
      var dpath = "";
      for (var d = 0; d <= M.CHANNEL; d += 20) dpath += (d ? "L" : "M") + f(xs(d), 1) + " " + f(Math.max(y1 - 6, ys(fn(d))), 1);
      var p = el("path", { d: dpath, "class": cls }, g);
      if (dash) { p.setAttribute("stroke-dasharray", "4 3"); p.setAttribute("style", "stroke-width:1.5;stroke:#6fbfae"); }
    }
    if (ref) curve(ref, "fit", true);
    if (fit) curve(function (d) { return fit.N0 * Math.exp(fit.slope * d); }, "fit");
    el("rect", { x: x0, y: 7, width: 10, height: 8, rx: 2, "class": "bar" }, g);
    el("text", { x: x0 + 14, y: 14 }, g, "decays per 100 m");
    el("line", { x1: x0 + 132, x2: x0 + 148, y1: 11, y2: 11, "class": "fit" }, g);
    el("text", { x: x0 + 152, y: 14 }, g, "fit");
    if (ref) {
      el("line", { x1: x0 + 180, x2: x0 + 196, y1: 11, y2: 11, "class": "fit", "stroke-dasharray": "4 3", style: "stroke-width:1.5;stroke:#6fbfae" }, g);
      el("text", { x: x0 + 200, y: 14 }, g, "ideal sensors");
    }
    if (eq) el("text", { x: x0, y: 30, "class": "eq" }, g, eq);
  }

  // Calibrated spectra in nm (Station 2). Before calibration the lamp is shown on the raw pixel scale, so its
  // lines sit off their reference wavelengths. After calibration the axis is corrected.
  function peakNear(flux, nominalPixel, halfWidth, sign) {
    var lo = Math.max(0, Math.floor(nominalPixel - halfWidth)), hi = Math.min(flux.length - 1, Math.ceil(nominalPixel + halfWidth));
    var best = lo;
    for (var i = lo; i <= hi; i++) { if (sign * flux[i] > sign * flux[best]) best = i; }
    return best;
  }

  // Calibrated wavelength of a raw pixel, from the stored lamp calibration
  function calNm(p) { return SP.pixelToNmNominal((p - S.lamp.pOffset) / S.lamp.pScale); }

  // ======================================================================================
  // The sextant: one set of tools for every sighting task. A telescope on a gimbal (the 3D view), an
  // all-sky map, a catalog lookup for whatever sits in the reticle, a thermal infrared array, and one
  // spectrograph. Calibration, starlight and the colony search differ only in what they ask the student to find.
  // ======================================================================================

  // ---- spectrograph plot: one detector for every source --------------------------------------
  // flux is on the raw pixel axis. The x axis is wavelength: calibrated once the lamp calibration is
  // stored (opts.calib), nominal before that. The wheel zooms the wavelength window around the cursor,
  // a double click resets it, and a click marks the wavelength under the pointer.
  var SPEC = { W: 600, H: 150, x0: 36, x1: 588, y0: 124, y1: 12 };
  function specWindow() { return S.specView || [SP.LAMBDA_MIN, SP.LAMBDA_MAX]; }
  function specX(nm) { var w = specWindow(); return SPEC.x0 + (SPEC.x1 - SPEC.x0) * (nm - w[0]) / (w[1] - w[0]); }
  function drawSpectrum(svg, flux, kind, opts) {
    opts = opts || {};
    S.lastSpec = { flux: flux, kind: kind, opts: opts };
    while (svg.lastChild && svg.lastChild.nodeName !== "title") svg.removeChild(svg.lastChild);
    var win = specWindow(), lo = win[0], hi = win[1], np = flux.length;
    var nmOf = function (p) { return opts.calib && S.lamp ? calNm(p) : SP.pixelToNmNominal(p); };
    var ys = function (v) { return SPEC.y0 - (SPEC.y0 - SPEC.y1) * Math.max(0, Math.min(1.15, v)); };
    var g = el("g", {}, svg);
    var step = niceStep(hi - lo, 8), first = Math.ceil(lo / step) * step;
    for (var nm = first; nm <= hi + 1e-6; nm += step) {
      var px = specX(nm);
      el("line", { x1: px, x2: px, y1: SPEC.y1, y2: SPEC.y0, "class": "grid" }, g);
      el("text", { x: px, y: SPEC.y0 + 11, "text-anchor": "middle", style: "font-size:9px;" }, g, String(Math.round(nm * 100) / 100));
    }
    el("line", { x1: SPEC.x0, x2: SPEC.x1, y1: SPEC.y0, y2: SPEC.y0, "class": "axis" }, g);
    el("text", { x: (SPEC.x0 + SPEC.x1) / 2, y: SPEC.H - 3, "text-anchor": "middle", style: "font-size:9px;" }, g,
      "wavelength, nm " + (opts.calib ? "(calibrated)" : "(raw instrument scale)") + " · wheel zooms · click marks");
    var path = "", pen = false;
    for (var p = 0; p < np; p++) {
      var x = specX(nmOf(p));
      if (x < SPEC.x0 - 2 || x > SPEC.x1 + 2) { pen = false; continue; }
      path += (pen ? "L" : "M") + f(x, 1) + " " + f(ys(flux[p]), 1); pen = true;
    }
    el("path", { d: path, style: "stroke:" + (kind === "lamp" ? "#48e6ff" : kind === "thermal" ? "#ffb779" : "#ffd08a") + ";fill:none;stroke-width:1.7;" }, g);
    if (opts.rest) {
      var rx = specX(opts.rest);
      if (rx >= SPEC.x0 && rx <= SPEC.x1) {
        el("line", { x1: rx, x2: rx, y1: SPEC.y1, y2: SPEC.y0, style: "stroke:#8a9aa6;stroke-width:1;stroke-dasharray:3 3;" }, g);
        el("text", { x: rx + 3, y: SPEC.y1 + 8, style: "fill:#8a9aa6;font-size:9px;" }, g, "rest " + f(opts.rest, 1));
      }
    }
    (opts.lines || []).forEach(function (ln) {
      var lx = specX(ln.nm);
      if (lx < SPEC.x0 || lx > SPEC.x1) return;
      el("line", { x1: lx, x2: lx, y1: SPEC.y0, y2: SPEC.y1 + 12, style: "stroke:" + ln.color + ";stroke-width:1.6;opacity:.85;" }, g);
      el("text", { x: lx, y: SPEC.y1 + 9, "text-anchor": "middle", style: "fill:" + ln.color + ";font-size:9px;" }, g, ln.label);
    });
    if (S.markNm != null) {
      var mx = specX(S.markNm);
      if (mx >= SPEC.x0 && mx <= SPEC.x1) {
        el("line", { x1: mx, x2: mx, y1: SPEC.y1, y2: SPEC.y0, style: "stroke:#5fe8d8;stroke-width:1.4;" }, g);
        el("rect", { x: Math.max(SPEC.x0, Math.min(SPEC.x1 - 62, mx - 31)), y: SPEC.y1 + 14, width: 62, height: 14, rx: 3, style: "fill:rgba(6,26,34,.92);stroke:#5fe8d8;" }, g);
        el("text", { x: Math.max(SPEC.x0 + 31, Math.min(SPEC.x1 - 31, mx)), y: SPEC.y1 + 24, "text-anchor": "middle", style: "fill:#5fe8d8;font-size:9px;font-weight:700;" }, g, f(S.markNm, 1) + " nm");
      }
    }
    var cur = el("g", { style: "display:none;pointer-events:none" }, g);
    el("line", { x1: 0, x2: 0, y1: SPEC.y1, y2: SPEC.y0, style: "stroke:#8ff5dd;stroke-width:1;stroke-dasharray:2 2;" }, cur);
    el("text", { x: 0, y: SPEC.y0 - 4, style: "fill:#8ff5dd;font-size:10px;font-weight:700;" }, cur, "");
    svg._cursor = cur;
    bindSpectrograph(svg);
  }
  function redrawSpectrum() {
    var last = S.lastSpec, svg = $("p-spec-star");
    if (last && svg) drawSpectrum(svg, last.flux, last.kind, last.opts);
  }
  function svgPoint(svg, e, w, h) {
    var ctm = svg.getScreenCTM && svg.getScreenCTM();
    if (ctm) {
      try {
        var pt = svg.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        var mapped = pt.matrixTransform(ctm.inverse());
        return { x: mapped.x, y: mapped.y };
      } catch (err) {}
    }
    var r = svg.getBoundingClientRect();
    var scale = Math.min(r.width / w, r.height / h) || 1;
    var ox = (r.width - w * scale) / 2, oy = (r.height - h * scale) / 2;
    return { x: (e.clientX - r.left - ox) / scale, y: (e.clientY - r.top - oy) / scale };
  }
  function bindSpectrograph(svg) {
    if (svg._boundSpec) return;
    svg._boundSpec = true;
    svg.style.cursor = "crosshair";
    function nmAt(e) {
      var pt = svgPoint(svg, e, SPEC.W, SPEC.H), w = specWindow();
      return w[0] + clamp((pt.x - SPEC.x0) / (SPEC.x1 - SPEC.x0), 0, 1) * (w[1] - w[0]);
    }
    svg.addEventListener("pointermove", function (e) {
      var cur = svg._cursor;
      if (!cur || !S.lastSpec) return;
      var nm = nmAt(e), x = specX(nm);
      cur.style.display = "";
      cur.firstChild.setAttribute("x1", x); cur.firstChild.setAttribute("x2", x);
      var tag = cur.lastChild;
      tag.textContent = f(nm, 1) + " nm";
      tag.setAttribute("x", x > SPEC.x1 - 60 ? x - 52 : x + 4);
    });
    svg.addEventListener("pointerleave", function () { if (svg._cursor) svg._cursor.style.display = "none"; });
    svg.addEventListener("click", function (e) {
      if (!S.lastSpec) return;
      S.markNm = nmAt(e);
      if (S.step === "dock" && $("rad-nm")) { $("rad-nm").value = f(S.markNm, 1); updateObjectives(); }
      redrawSpectrum();
      announce("Marked " + f(S.markNm, 1) + " nanometres.");
    });
    svg.addEventListener("dblclick", function () { S.specView = null; redrawSpectrum(); });
    svg.addEventListener("wheel", function (e) {
      if (!S.lastSpec) return;
      e.preventDefault();
      var w = specWindow(), at = nmAt(e), span = (w[1] - w[0]) * Math.exp(e.deltaY * 0.002);
      span = clamp(span, 6, SP.LAMBDA_MAX - SP.LAMBDA_MIN);
      var frac = (at - w[0]) / (w[1] - w[0]), a = at - frac * span;
      a = clamp(a, SP.LAMBDA_MIN, SP.LAMBDA_MAX - span);
      S.specView = span >= SP.LAMBDA_MAX - SP.LAMBDA_MIN - 1 ? null : [a, a + span];
      redrawSpectrum();
    }, { passive: false });
  }

  // ---- the sky: what the sextant can see ----------------------------------------------------
  var SKY = { W: 340, H: 150, R: 62, cy: 82, bowX: 85, sternX: 255 };
  function skyPoint(thetaDeg, azDeg) {
    var bow = thetaDeg <= 90, rr = (bow ? thetaDeg : 180 - thetaDeg) / 90 * SKY.R, az = azDeg * RAD;
    var cx = bow ? SKY.bowX : SKY.sternX;
    return { x: cx + rr * Math.sin(az), y: SKY.cy - rr * Math.cos(az), cx: cx, rr: rr, bow: bow };
  }
  // Inverse of skyPoint: the sky direction under a point of the map.
  function skyVecAt(sx, sy) {
    var bow = sx < SKY.W / 2, cx = bow ? SKY.bowX : SKY.sternX;
    var dx = sx - cx, dy = SKY.cy - sy;
    var az = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
    var rr = Math.min(90, Math.hypot(dx, dy) / SKY.R * 90);
    var theta = (bow ? rr : 180 - rr) * RAD, a = az * RAD;
    return new T.Vector3(Math.cos(theta), Math.sin(theta) * Math.cos(a), Math.sin(theta) * Math.sin(a));
  }
  var THERMAL_DIRS = T ? THERMAL.map(function (src) {
    var t = src.theta * RAD, a = src.az * RAD;
    return new T.Vector3(Math.cos(t), Math.sin(t) * Math.cos(a), Math.sin(t) * Math.sin(a));
  }) : [];
  // Infrared sources show only on the thermal array, and the colony search belongs to Station 3.
  function thermalVisible(src) { return !!G && S.scopeIR && sextantOn() && (src.stage !== "dock" || S.step === "dock") && !S.shuttleLaunched; }
  function pad4(n) { return ("0000" + n).slice(-4); }
  function fmtK(T0) { return Math.round(T0 / 100) * 100 + " K"; }
  function dirTheta(v) { return Math.acos(clamp(v.x, -1, 1)) / RAD; }
  function dirAz(v) { return (Math.atan2(v.z, v.y) / RAD + 360) % 360; }
  // Observed direction of catalog star i, from the aberrated field the 3D view is drawing.
  function starObsDir(i, out) {
    var a = G.stars.geometry.attributes.position.array, o = 3 * i;
    return out.set(a[o], a[o + 1], a[o + 2]).multiplyScalar(1 / SKY_R);
  }
  function starInfo(idx) {
    var s = G.starCatalog[idx], e = G.dbOfIdx[idx], v = starObsDir(idx, new T.Vector3());
    return { kind: "star", key: "s" + idx, idx: idx, name: e ? e.name : "Field star SC-" + pad4(idx), db: !!e, cls: e ? e.cls : spectralClass(s.T),
      con: e ? e.con : "", T: s.T, restDeg: dirTheta(new T.Vector3(s.x0, 0, 0)), theta: dirTheta(v), az: dirAz(v), dir: v };
  }
  function thermalInfo(k) {
    var src = THERMAL[k], v = THERMAL_DIRS[k];
    return { kind: "thermal", key: "t" + k, k: k, src: src, name: src.id, theta: src.theta, az: src.az, dir: v };
  }
  // Reticle tolerance scales with the field of view, so the ring always looks about the same size.
  function sxTolDeg() { return Math.max(0.035, G.camera.fov * 0.047); }
  function findTarget(aim, tolDeg) {
    var arr = G.stars.geometry.attributes.position.array, n = arr.length / 3, inv = 1 / SKY_R;
    var bestC = Math.cos(tolDeg * RAD), star = -1, thermal = -1;
    for (var i = 0; i < n; i++) {
      var c = (arr[3 * i] * aim.x + arr[3 * i + 1] * aim.y + arr[3 * i + 2] * aim.z) * inv;
      if (c > bestC) { bestC = c; star = i; }
    }
    THERMAL.forEach(function (src, k) {
      if (!thermalVisible(src)) return;
      var c = THERMAL_DIRS[k].dot(aim);
      if (c > bestC) { bestC = c; thermal = k; star = -1; }
    });
    return thermal >= 0 ? thermalInfo(thermal) : (star >= 0 ? starInfo(star) : null);
  }
  function updateLock() {
    var hit = findTarget(scopeVec(), sxTolDeg()), key = hit ? hit.key : "";
    S.sxTarget = hit;
    if (key !== S.sxKey) { S.sxKey = key; renderTargetCard(); updateObjectives(); }
  }
  // The star or source under a screen point, for hover and click-to-slew.
  var tmpP = T ? new T.Vector3() : null;
  function skyTargetAt(clientX, clientY) {
    if (!G || !sextantOn()) return null;
    var arr = G.stars.geometry.attributes.position.array, n = arr.length / 3, w = innerWidth, h = innerHeight, best = null;
    function consider(px, py, pz, reach, make) {
      tmpP.set(px, py, pz).project(G.camera);
      if (tmpP.z > 1) return;
      var d = Math.hypot(clientX - (tmpP.x + 1) * w / 2, clientY - (1 - tmpP.y) * h / 2);
      if (d < reach && (!best || d / reach < best.score)) best = { score: d / reach, make: make };
    }
    for (var i = 0; i < n; i++) {
      consider(arr[3 * i] + G.stars.position.x, arr[3 * i + 1] + G.stars.position.y, arr[3 * i + 2] + G.stars.position.z, G.dbOfIdx[i] ? 20 : 9, i);
    }
    THERMAL.forEach(function (src, k) {
      if (!thermalVisible(src)) return;
      var v = THERMAL_DIRS[k];
      consider(v.x * 440, v.y * 440, v.z * 440, 26, "t" + k);
    });
    if (!best) return null;
    var made = typeof best.make === "string" ? thermalInfo(+best.make.slice(1)) : starInfo(best.make);
    return { info: made, dir: made.dir, text: (made.kind === "star" ? (made.db ? made.name.toUpperCase() + " · " + made.cls : made.name.toUpperCase()) : "THERMAL SOURCE " + made.name) + " · click to slew" };
  }
  function showSkyHover(e) {
    var box = $("scope-hover"), hit = skyTargetAt(e.clientX, e.clientY);
    if (!box) return;
    box.hidden = !hit;
    if (hit) { box.textContent = hit.text; box.style.left = (e.clientX + 14) + "px"; box.style.top = (e.clientY + 14) + "px"; }
  }

  // ---- aim: a direction in the ship frame -------------------------------------------------
  // theta is the angle from the bow, az the angle about the bow axis (0 = the ship's up, 90 = starboard).
  // Keeping the aim as a vector lets the mouse, the puck and the arrow keys rotate the view in screen
  // space: a horizontal drag never changes the elevation and the horizon never rolls.
  function scopeAngle() {
    var value = Number(S.scopeTheta);
    return isFinite(value) ? clamp(value, 0, 180) : 90;
  }
  function scopeVec() {
    var t = scopeAngle() * RAD, a = S.scopeAz * RAD;
    return new T.Vector3(Math.cos(t), Math.sin(t) * Math.cos(a), Math.sin(t) * Math.sin(a));
  }
  function setScopeAim(v) {
    v.normalize();
    // Keep the sight off the exact zenith/nadir: the azimuth is undefined there and lookAt loses its heading.
    var elev = Math.asin(clamp(v.y, -1, 1)), cap = 89.5 * RAD;
    if (Math.abs(elev) > cap) {
      var flat = Math.hypot(v.x, v.z), sign = elev > 0 ? 1 : -1;
      if (flat < 1e-5) { v.x = 1; v.z = 0; flat = 1; }
      v.set(v.x / flat * Math.cos(cap), sign * Math.sin(cap), v.z / flat * Math.cos(cap));
    }
    var theta = dirTheta(v);
    if (Math.sin(theta * RAD) > 1e-4) S.scopeAz = dirAz(v);
    setScopeAngle(theta);
  }
  function rotateScopeAim(yawDeg, pitchDeg) {
    var v = scopeVec(), up = new T.Vector3(0, 1, 0);
    v.applyAxisAngle(up, yawDeg * RAD);
    var right = new T.Vector3().crossVectors(v, up);
    if (right.lengthSq() < 1e-8) right.set(0, 0, 1); else right.normalize();
    v.applyAxisAngle(right, pitchDeg * RAD);
    setScopeAim(v);
  }
  function scopeDegPerPixel() {
    var h = (G && G.renderer && G.renderer.domElement ? G.renderer.domElement.clientHeight : window.innerHeight) || 900;
    var fov = G && G.camera ? G.camera.fov : 24;
    return Math.max(fov / h, 0.00005);
  }
  // Smooth slew: pointing at a star glides there instead of jumping.
  var slew = null;
  function slewToDir(v) { slew = { v: v.clone().normalize() }; }
  function cancelSlew() { slew = null; }
  function stepSlew(dt) {
    if (!slew) return;
    var cur = scopeVec(), ang = cur.angleTo(slew.v);
    if (ang < 0.002 * RAD * Math.max(1, G.camera.fov)) { setScopeAim(slew.v); slew = null; return; }
    setScopeAim(cur.lerp(slew.v, 1 - Math.exp(-dt * 8)));
  }
  var scopeDrawQueued = false;
  function scheduleScopeDraw() {
    if (scopeDrawQueued) return;
    scopeDrawQueued = true;
    requestAnimationFrame(function () { scopeDrawQueued = false; refreshSextantUI(); });
  }
  function setScopeAngle(deg) {
    S.scopeTheta = clamp(deg, 0, 180);
    S.scopeMsg = null;
    scheduleScopeDraw();
  }
  function snapToNearestStar() {
    var aim = scopeVec(), best = null, tmp = new T.Vector3();
    G.db.forEach(function (e) {
      var v = starObsDir(e.idx, tmp), ang = v.angleTo(aim);
      if (!best || ang < best.ang) best = { ang: ang, dir: v.clone() };
    });
    if (best) slewToDir(best.dir);
  }

  // ---- the all-sky map -----------------------------------------------------------------
  function drawSky() {
    var svg = $("p-scope");
    if (!svg || !G || !sextantOn()) return;
    while (svg.lastChild && svg.lastChild.nodeName !== "title") svg.removeChild(svg.lastChild);
    svg.setAttribute("viewBox", "0 0 " + SKY.W + " " + SKY.H);
    var g = el("g", {}, svg), R0 = SKY.R, cy = SKY.cy, tmp = new T.Vector3();
    el("rect", { x: 0, y: 0, width: SKY.W, height: SKY.H, fill: "rgba(1, 8, 14, 0.95)" }, g);
    [{ cx: SKY.bowX, title: "BOW SKY", rings: [30, 60] }, { cx: SKY.sternX, title: "STERN SKY", rings: [150, 120] }].forEach(function (disc) {
      el("circle", { cx: disc.cx, cy: cy, r: R0, fill: "rgba(4, 18, 26, 0.9)", stroke: "rgba(111, 230, 205, 0.7)", "stroke-width": 1.2 }, g);
      el("line", { x1: disc.cx - R0, x2: disc.cx + R0, y1: cy, y2: cy, stroke: "rgba(111, 230, 205, 0.12)" }, g);
      el("line", { x1: disc.cx, x2: disc.cx, y1: cy - R0, y2: cy + R0, stroke: "rgba(111, 230, 205, 0.12)" }, g);
      disc.rings.forEach(function (deg) {
        var rr = (deg <= 90 ? deg : 180 - deg) / 90 * R0;
        el("circle", { cx: disc.cx, cy: cy, r: rr, fill: "none", stroke: "rgba(111, 230, 205, 0.2)", "stroke-dasharray": "2 3" }, g);
        el("text", { x: disc.cx + 2, y: cy - rr + 8, style: "font-size:7px;fill:#5fa89a;" }, g, deg + "°");
      });
      el("text", { x: disc.cx, y: 10, "text-anchor": "middle", style: "font-size:8px;font-weight:700;fill:#8ff5dd;letter-spacing:.08em;" }, g, disc.title);
    });
    var at = function (e) { var v = starObsDir(e.idx, tmp); return skyPoint(dirTheta(v), dirAz(v)); };
    // Constellations first, then the named stars on top.
    G.clusters.forEach(function (c) {
      c.lines.forEach(function (ln) {
        var a = at(G.dbOfIdx[c.members[ln[0]]]), b = at(G.dbOfIdx[c.members[ln[1]]]);
        if (a.bow === b.bow) el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: "rgba(111,230,205,.28)", "stroke-dasharray": "2 2" }, g);
      });
    });
    G.db.forEach(function (e) {
      var pt = at(e), locked = !!(S.sxTarget && S.sxTarget.idx === e.idx), picked = pickedIds().indexOf(e.idx) >= 0;
      var info = e.sig ? G.STAR_INFO[e.sig] : null, hex = info ? info.hex : "#d6ecff";
      el("circle", { cx: pt.x, cy: pt.y, r: locked ? 3.6 : (e.rank < 10 ? 2.4 : 1.6), fill: picked ? "#5fe8d8" : hex }, g);
      if (locked || picked || e.rank < 9) {
        el("text", { x: pt.x + 4, y: pt.y - 3, style: "font-size:7px;fill:" + (picked || locked ? "#5fe8d8" : "#9fd9ce") + ";text-shadow:0 0 3px #000;" }, g, e.name);
      }
    });
    THERMAL.forEach(function (src) {
      if (!thermalVisible(src)) return;
      var pt = skyPoint(src.theta, src.az);
      el("circle", { cx: pt.x, cy: pt.y, r: 3.4, fill: "none", stroke: "#ffb779", "stroke-width": 1.2 }, g);
      el("text", { x: pt.x + 5, y: pt.y + 8, style: "font-size:7px;fill:#ffb779;" }, g, src.id);
    });
    if (S.step === "dock") {
      var wp = skyPoint(THERMAL[0].theta, THERMAL[0].az);
      el("circle", { cx: wp.x, cy: wp.y, r: 10, fill: "none", stroke: "#ffca74", "stroke-dasharray": "3 3" }, g);
      el("text", { x: wp.x + 12, y: wp.y - 8, style: "font-size:7px;fill:#ffca74;" }, g, "WAYPOINT");
    }
    // Where the telescope points, drawn at its true field of view.
    var theta = scopeAngle(), sight = skyPoint(theta, S.scopeAz), locked = !!S.sxTarget;
    var fovR = Math.max(2.6, G.camera.fov / 2 * R0 / 90);
    el("circle", { cx: sight.x, cy: sight.y, r: fovR, fill: "none", stroke: locked ? "#5fe8d8" : "#ffffff", "stroke-width": 1.3 }, g);
    el("line", { x1: sight.x - fovR - 3, x2: sight.x + fovR + 3, y1: sight.y, y2: sight.y, stroke: locked ? "#5fe8d8" : "#fff", "stroke-width": .6 }, g);
    el("line", { x1: sight.x, x2: sight.x, y1: sight.y - fovR - 3, y2: sight.y + fovR + 3, stroke: locked ? "#5fe8d8" : "#fff", "stroke-width": .6 }, g);
  }
  function bindSkyMap() {
    var svg = $("p-scope");
    if (!svg || svg._boundScope) return;
    svg._boundScope = true;
    var dragging = false;
    function point(e) {
      return svgPoint(svg, e, SKY.W, SKY.H);
    }
    // Pick a named star or visible infrared source under the pointer; otherwise aim at the sky point.
    function nearestMarked(p) {
      var best = null, tmp = new T.Vector3();
      G.db.forEach(function (e) {
        var v = starObsDir(e.idx, tmp), pt = skyPoint(dirTheta(v), dirAz(v)), d = Math.hypot(p.x - pt.x, p.y - pt.y);
        if (d < 8 && (!best || d < best.d)) best = { d: d, dir: v.clone() };
      });
      THERMAL.forEach(function (src, k) {
        if (!thermalVisible(src)) return;
        var pt = skyPoint(src.theta, src.az), d = Math.hypot(p.x - pt.x, p.y - pt.y);
        if (d < 9 && (!best || d < best.d)) best = { d: d, dir: THERMAL_DIRS[k].clone() };
      });
      return best;
    }
    svg.addEventListener("pointerdown", function (e) {
      var p = point(e), hit = nearestMarked(p);
      if (hit) { slewToDir(hit.dir); return; }
      cancelSlew(); dragging = true; svg.setPointerCapture(e.pointerId);
      setScopeAim(skyVecAt(p.x, p.y));
    });
    svg.addEventListener("pointermove", function (e) { if (dragging) { var p = point(e); setScopeAim(skyVecAt(p.x, p.y)); } });
    svg.addEventListener("pointerup", function () { dragging = false; });
    svg.addEventListener("pointercancel", function () { dragging = false; });
  }

  // ---- the panel: target card, readouts, objectives --------------------------------------
  function pickedIds() {
    var ids = [];
    if (S.starPicks.bow) ids.push(S.starPicks.bow.idx);
    if (S.starPicks.aft) ids.push(S.starPicks.aft.idx);
    return ids;
  }
  function idleHint() {
    if (S.step === "dock") return "Switch to IR and look near the waypoint bearing for a cool source. Stars still show as dark dots.";
    if (S.step === "spectro-cal") return "Strike the lamp first. The sky is here too, for after the calibration is stored.";
    return "Turn the view with the controller or drag the sky. Named stars are catalog entries; dotted lines join constellations.";
  }
  function renderTargetCard() {
    var t = S.sxTarget, box = $("sx-target"), nameEl = $("sx-target-name"), meta = $("sx-target-meta"), lock = $("scope-lock");
    if (!box) return;
    if (!t) {
      box.setAttribute("data-state", "none");
      nameEl.textContent = "NO LOCK";
      meta.textContent = idleHint();
      if (lock) { lock.textContent = "TAKE SPECTRUM"; lock.classList.remove("pulse-ready"); lock.disabled = true; lock.title = "Slew the reticle onto a star or infrared source first"; }
      return;
    }
    box.setAttribute("data-state", "lock");
    if (lock) { lock.disabled = false; lock.title = "Record the spectrum of the locked target [Space]"; }
    if (t.kind === "star") {
      nameEl.textContent = t.name.toUpperCase();
      meta.textContent = (t.db
        ? t.cls + " · " + fmtK(t.T) + " · " + (t.con ? t.con + " · " : "") + "catalog θᵣ " + f(t.restDeg, 1) + "° · sextant θ " + f(t.theta, 1) + "°"
        : "Uncatalogued field star · " + fmtK(t.T) + " · sextant θ " + f(t.theta, 1) + "°");
    } else {
      nameEl.textContent = "THERMAL SOURCE " + t.name;
      meta.textContent = (S.sxSeen[t.key] || "Unidentified infrared source") + " · sextant θ " + f(t.theta, 1) + "° · az " + f(t.az, 0) + "°";
    }
    if (lock) { lock.textContent = "TAKE SPECTRUM · " + (t.kind === "star" ? t.name.toUpperCase() : t.name); lock.classList.add("pulse-ready"); }
  }
  function updateScopeBadge() {
    var th = $("scope-theta"), az = $("scope-az");
    if (th && document.activeElement !== th) th.value = f(scopeAngle(), 1);
    if (az && document.activeElement !== az) az.value = f(S.scopeAz, 0);
    if ($("sx-fov") && G) $("sx-fov").textContent = "FOV " + (G.camera.fov < 1 ? f(G.camera.fov, 2) : f(G.camera.fov, 1)) + "° · " + zoomLabel();
  }
  function refreshSextantUI() {
    if (!sextantOn() || !G) return;
    bindSkyMap();
    updateScopeBadge();
    drawSky();
    var picks = $("sx-picks");
    if (picks && S.step === "spectro-star") {
      var b = S.starPicks.bow, a = S.starPicks.aft;
      picks.innerHTML = "<strong>MEASURE</strong> Blue-shifted: " + (b ? b.name + " ✓ " + f(b.lambdaNm, 1) + " nm" : "—") +
        " · Red-shifted: " + (a ? a.name + " ✓ " + f(a.lambdaNm, 1) + " nm" : "—") + ". Then solve for β.";
    }
    var rec = $("spec-record"); if (rec) rec.disabled = !(S.starPicks.bow && S.starPicks.aft);
    var tc = $("dock-to-courier"); if (tc) tc.disabled = S.platformEst == null;
    var chip = $("sx-cal-chip");
    if (chip) { chip.setAttribute("data-state", S.spectroCal ? "on" : "off"); chip.textContent = S.spectroCal ? "CAL · stored ✓" : "CAL · not stored"; }
    updateObjectives();
  }
  function updateSpectroStar() { refreshSextantUI(); }
  // What the sextant tells the student after an action; four lines at most, so the panel never changes size.
  function setSextantReadout(lines) {
    var out = $("r-spec-star");
    if (out) out.textContent = lines.filter(Boolean).slice(0, 4).join("\n");
  }
  function setSource(label) { if ($("sx-source-label")) $("sx-source-label").textContent = label; }
  function sextantIdleText() {
    if (S.step === "spectro-cal") return ["Strike the lamp. Each bright line should sit at a known hydrogen wavelength;", "the instrument's offset shows as the gap. Store the calibration to remove it."];
    if (S.step === "dock") return ["Switch to IR. Cool sources are black on white. Centre one near the waypoint", "bearing and take its spectrum: a thermal continuum, with or without a line."];
    return ["Slew onto a star, centre it in the ring, and take its spectrum.", "You need one blue-shifted and one red-shifted star."];
  }

  // ---- taking a spectrum ----------------------------------------------------------------------
  function planck(nm, temp) {
    var um = nm / 1000, exponent = Math.min(700, 14387.77 / (um * temp));
    return 1 / (Math.pow(um, 5) * Math.expm1(exponent));
  }
  function takeSpectrum() {
    if (!S.lamp || !S.spectroCal) {
      setSextantReadout(["Store the lamp calibration first: it sets the wavelength scale.", ""]);
      sysAlert("The spectrograph zero-point is unset. Store the hydrogen lamp calibration before taking a spectrum.", { title: "SPECTRO // UNCALIBRATED", code: "SP-102" });
      return;
    }
    var t = S.sxTarget;
    if (!t) {
      S.scopeMsg = "No target in the reticle.";
      setSextantReadout(["No target in the reticle at θ " + f(scopeAngle(), 1) + "°.", "Slew onto a star or source and centre it in the ring."]);
      sysAlert("No target in the reticle. Slew the sight onto a star or an infrared source, then take the spectrum.", { title: "SIGHT // NO ACQUISITION", code: "SG-204" });
      return;
    }
    S.markNm = null; S.specView = null;
    var svg = $("p-spec-star");
    if (t.kind === "star") takeStarSpectrum(t, svg); else takeThermalSpectrum(t, svg);
    refreshSextantUI();
  }
  function takeStarSpectrum(t, svg) {
    var spec = SP.starSpectrumAt(m.seed + t.idx * 7919, m.beta, t.theta, S.lamp.pOffset, S.lamp.pScale);
    var haDetPx = S.lamp.pOffset + S.lamp.pScale * SP.nmToPixelNominal(656.28 * spec.factor);
    var inBand = haDetPx >= 4 && haDetPx <= SP.NPIX - 5;
    var dip = inBand ? peakNear(spec.flux, haDetPx, 6, -1) : -1;
    var head = t.name.toUpperCase() + " · " + (t.db ? t.cls : fmtK(t.T)) + " · θ " + f(t.theta, 2) + "°";
    setSource(t.name.toUpperCase());
    if (!inBand || spec.flux[dip] > 0.7 || dip < 4 || dip > SP.NPIX - 5) {
      drawSpectrum(svg, spec.flux, "star", { calib: true, rest: 656.28 });
      setSextantReadout([head, "No H-α line falls inside the spectrograph window (" + SP.LAMBDA_MIN + "–" + SP.LAMBDA_MAX + " nm) at this bearing.", "Any remaining dip is a higher Balmer line (H-β or H-γ). Try a star at a different angle from the bow."]);
      sysAlert("The shifted H-alpha line falls outside the spectrograph window at this bearing (any remaining dip is H-beta or H-gamma). Try a star with a different shift.", { title: "SPECTRO // LINE OUT OF BAND", code: "SP-311" });
      return;
    }
    var lamObs = calNm(dipCentre(spec.flux, dip)), fMeas = lamObs / 656.28;
    var roots = SP.solveBetaFromDoppler(fMeas, t.theta);
    var kind = fMeas < 1 ? "bow" : "aft", shift = kind === "bow" ? "blue-shifted" : "red-shifted";
    var lines = [{ nm: lamObs, label: "H-α", color: "#ff4d4d" }];
    if (S.step !== "spectro-star") {
      drawSpectrum(svg, spec.flux, "star", { calib: true, rest: 656.28, lines: lines });
      sxSeen(t, "Star · " + shift);
      setSextantReadout([head, "Likely star: smooth continuum with hydrogen absorption lines.", "H-α dip at " + f(lamObs, 1) + " nm (" + shift + ")."]);
      return;
    }
    if (!roots.length) {
      drawSpectrum(svg, spec.flux, "star", { calib: true, rest: 656.28, lines: lines });
      setSextantReadout([head, "This Doppler shift has no consistent speed at this bearing.", "Recalibrate the lamp and try again."]);
      sysAlert("The measured shift has no consistent speed at this bearing. Recheck the lamp calibration and the line centre.", { title: "SOLVER // NO CONSISTENT ROOT", code: "SP-422" });
      return;
    }
    var b1 = stationOneBeta();
    var best = roots.slice().sort(function (a, b) { return Math.abs(a - b1) - Math.abs(b - b1); })[0];
    S.starPicks[kind] = { id: t.name, idx: t.idx, name: t.name, thetaDeg: t.theta, lambdaNm: lamObs, beta: best, flux: Array.from(spec.flux) };
    drawSpectrum(svg, spec.flux, "star", { calib: true, rest: 656.28, lines: lines });
    sxSeen(t, "Star · " + shift);
    var other = kind === "bow" ? S.starPicks.aft : S.starPicks.bow;
    setSextantReadout([head, "Observed H-α dip: " + f(lamObs, 1) + " nm (" + shift + ").",
      other ? "Both shifts recorded. Run the starlight solver." : "Now find a " + (kind === "bow" ? "red" : "blue") + "-shifted star: look toward the " + (kind === "bow" ? "stern" : "bow") + "."]);
  }
  function takeThermalSpectrum(t, svg) {
    var src = t.src, lamNm = null, shift;
    if (src.kind === "radiator") { lamNm = SP.radiatorLineNm(m.beta, S.platformW, src.theta); shift = lamNm / 656.28; }
    else shift = P.dopplerFromObservedAngle(m.beta, Math.cos(t.theta * RAD));
    var Tobs = src.T / shift, flux = new Float32Array(SP.NPIX), peak = 0, i, nmI;
    for (i = 0; i < SP.NPIX; i++) {
      nmI = SP.pixelToNmNominal(i);
      peak = Math.max(peak, planck(nmI, Tobs));
    }
    for (i = 0; i < SP.NPIX; i++) flux[i] = 0.04 + 0.8 * planck(SP.pixelToNmNominal(i), Tobs) / peak;
    // Rebuilt on the raw pixel axis the lamp calibration maps back to wavelength.
    var raw = new Float32Array(SP.NPIX);
    for (i = 0; i < SP.NPIX; i++) {
      var q = (i - S.lamp.pOffset) / S.lamp.pScale, lo = Math.floor(q), fr = q - lo;
      var a0 = flux[clamp(lo, 0, SP.NPIX - 1)], a1 = flux[clamp(lo + 1, 0, SP.NPIX - 1)];
      raw[i] = a0 + (a1 - a0) * fr;
    }
    var lines = [];
    if (lamNm != null) {
      var pc = SP.nmToPixelNominal(lamNm) * S.lamp.pScale + S.lamp.pOffset;
      for (i = 0; i < SP.NPIX; i++) raw[i] += 0.9 * Math.exp(-0.5 * Math.pow((i - pc) / 2.4, 2));
    }
    drawSpectrum(svg, raw, "thermal", { calib: true, lines: lines });
    setSource(t.name + " · IR");
    var wien = 2897771.9 / Tobs;
    var summary = "Smooth continuum, no absorption lines. Wien peak ≈ " + f(wien / 1000, 1) + " µm → " + fmtK(Tobs) + (wien > SP.LAMBDA_MAX ? " (beyond the window)" : "") + ".";
    var seen;
    if (lamNm != null) {
      seen = "Thermal source with a hydrogen emission line";
      S.radiatorFlux = Array.from(raw);
      S.radiatorSelected = true; S.colonySeen = true;
      if ($("rad-solve")) $("rad-solve").disabled = false;
      setSextantReadout([t.name + " · THERMAL BEACON · θ " + f(t.theta, 1) + "° · " + summary, "Narrow H-α emission spike detected. Click its peak, then solve w."]);
      if ($("colony-sensor-status")) { $("colony-sensor-status").textContent = "IR-1 beacon"; $("colony-sensor-status").className = "badge ok"; }
    } else {
      seen = "Cool thermal object · " + fmtK(Tobs);
      S.radiatorSelected = false;
      if ($("rad-solve")) $("rad-solve").disabled = true;
      setSextantReadout([t.name + " · COOL THERMAL OBJECT · θ " + f(t.theta, 1) + "° · " + summary, "No emission line: not the colony's hydrogen beacon."]);
      if ($("colony-sensor-status")) { $("colony-sensor-status").textContent = t.name + ": no beacon"; $("colony-sensor-status").className = "badge warn"; }
    }
    sxSeen(t, seen);
    runDiagnostics("spectra");
  }
  function sxSeen(t, text) { S.sxSeen[t.key] = text; S.sxKey = ""; }

  // ---- controls ----------------------------------------------------------------------------
  function initScopeInteractive() {
    bindSkyMap();
    var irBtn = $("scope-ir-toggle");
    if (irBtn && !irBtn._bound) {
      irBtn._bound = true;
      irBtn.addEventListener("click", function () {
        S.scopeIR = !S.scopeIR; S.approachIR = S.scopeIR;
        irBtn.setAttribute("aria-pressed", String(S.scopeIR));
        irBtn.textContent = "IR SIGHT: " + (S.scopeIR ? "ON" : "OFF");
        S.sxKey = ""; S.markNm = null;
        runDiagnostics("ir");
        refreshSextantUI();
      });
    }
    var th = $("scope-theta"), az = $("scope-az");
    if (th && !th._bound) {
      th._bound = true;
      th.addEventListener("change", function () {
        var value = Number(this.value);
        cancelSlew();
        if (this.value !== "" && isFinite(value)) setScopeAngle(value); else setScopeAngle(scopeAngle());
        this.value = f(scopeAngle(), 1);
      });
    }
    if (az && !az._bound) {
      az._bound = true;
      az.addEventListener("change", function () {
        var value = Number(this.value);
        cancelSlew();
        if (this.value !== "" && isFinite(value)) { S.scopeAz = ((value % 360) + 360) % 360; setScopeAngle(scopeAngle()); }
        this.value = f(S.scopeAz, 0);
      });
    }
    var snap = $("btn-snap-nearest");
    if (snap && !snap._bound) { snap._bound = true; snap.addEventListener("click", snapToNearestStar); }
    var lock = $("scope-lock");
    if (lock && !lock._bound) { lock._bound = true; lock.addEventListener("click", takeSpectrum); }
  }

  // Draw Docking Gauge (Station 3)
  function drawDockGauge(svg, mismatch, tol) {
    while (svg.lastChild && svg.lastChild.nodeName !== "title") svg.removeChild(svg.lastChild);
    var W = 380, Hh = 120, cx = W / 2, cy = 60, scale = 1200; // px per c
    var g = el("g", {}, svg);

    // Center target axis
    el("line", { x1: cx, x2: cx, y1: 15, y2: Hh - 15, "class": "axis" }, g);
    el("text", { x: cx, y: 12, "text-anchor": "middle", style: "fill:#5fe8d8;font-size:10px;" }, g, "Zero mismatch: dock");

    // Tolerance band (green shaded box)
    var bw = tol * scale;
    el("rect", { x: cx - bw, y: 22, width: bw * 2, height: Hh - 44, rx: 3, "class": "target-band" }, g);
    el("text", { x: cx - bw - 4, y: Hh - 6, "text-anchor": "end", style: "fill:#5fe8d8;font-size:9px;" }, g, "−" + tol.toFixed(3) + "c");
    el("text", { x: cx + bw + 4, y: Hh - 6, "text-anchor": "start", style: "fill:#5fe8d8;font-size:9px;" }, g, "+" + tol.toFixed(3) + "c");

    // Shuttle arrival marker
    if (mismatch != null) {
      var mx = cx + Math.max(-170, Math.min(170, mismatch * scale));
      var docked = Math.abs(mismatch) <= tol;
      el("line", { x1: mx, x2: mx, y1: 18, y2: Hh - 18, style: "stroke:" + (docked ? "#5fe8d8" : "#ff5252") + ";stroke-width:3;" }, g);
      el("polygon", { points: (mx - 6) + ",24 " + (mx + 6) + ",24 " + mx + ",34", style: "fill:" + (docked ? "#5fe8d8" : "#ff5252") }, g);
      var labelAnchor = mx < 90 ? "start" : mx > W - 90 ? "end" : "middle";
      var labelX = mx + (labelAnchor === "start" ? 6 : labelAnchor === "end" ? -6 : 0);
      el("text", { x: labelX, y: 46, "text-anchor": labelAnchor, style: "fill:" + (docked ? "#5fe8d8" : "#ff5252") + ";font-weight:bold;font-size:11px;" }, g,
        (mismatch >= 0 ? "+" : "") + f(mismatch, 4) + "c (" + (docked ? "DOCKED" : "MISSED") + ")");
    }
  }

  var live = { cal: null, fl: null, speed: null, flN: null, flV: null };
  function eqLine(fit) { return "N(x) = N₀ exp(−x/L)   N₀ = " + f(fit.N0, 0) + "   L = " + f(fit.L, 0) + " ± " + f(fit.LErr, 0) + " m"; }

  function readLab() {
    var c = S.calRun.counts, k, ns = M.SECTIONS.length;
    for (k = 0; k < ns; k++) calCells[k][2].textContent = String(c[k]);
    var calNow = c[0] > 0 ? M.calibration(c) : null;
    for (k = 0; k < ns; k++) calCells[k][3].textContent = calNow && c[k] > 0 ? (k === 0 ? "1 (reference)" : pm(calNow.e[k], calNow.de[k])) : "";
    live.cal = M.fitDecay(c, c);
    var calFitOk = live.cal && live.cal.ok && S.calRun.seconds > 0;
    var lines = ["Beam time: " + f(S.calRun.seconds, 0) + " s   Decays: " + S.calRun.total()];
    if (calFitOk) lines.push("Fit to raw counts: L = " + f(live.cal.L, 0) + " ± " + f(live.cal.LErr, 0) + " m");
    lines.push("Certified beam, 0.800c: L = " + f(M.decayLength(M.BEAM_BETA), 0) + " m");
    var storeBtn = $("cal-store");
    if (S.cal) {
      lines.push("✓ Calibration stored (" + f(S.calSeconds, 0) + " s of beam). Beam deactivated.");
      if (storeBtn) { storeBtn.textContent = "Calibration stored ✓"; storeBtn.disabled = true; }
    } else {
      if (storeBtn) { storeBtn.textContent = "Store calibration"; storeBtn.disabled = !calReady(); }
      if (!calReady()) {
        lines.push("Store unlocks at " + STUDENT_CAL_HITS + " hits in every section (weakest so far: " + Math.min.apply(null, c) + "/" + STUDENT_CAL_HITS + ").");
      }
    }
    $("r-cal-fit").textContent = lines.join("\n");

    var n = S.flRun.counts, cor = M.corrected(n, S.cal);
    for (k = 0; k < ns; k++) {
      flCells[k][2].textContent = String(n[k]);
      flCells[k][3].textContent = S.cal ? f(cor.n[k], 0) : "–";
    }
    var canFit = (S.flRun.seconds >= 2 && S.flRun.total() >= 15);
    var liveFit = canFit ? M.fitDecay(cor.n, cor.v) : null;
    live.fl = (liveFit && liveFit.ok) ? liveFit : null;
    live.flN = cor.n; live.flV = cor.v;
    live.speed = (S.flAnalyzed && live.fl) ? M.speedFromFit(live.fl) : null;
    lines = ["Counting time: " + f(S.flRun.seconds, 0) + " s   Decays: " + S.flRun.total()];
    if (live.fl && live.fl.ok) {
      var gamma = Math.sqrt(1 + Math.pow(live.fl.L / P.MUON_CTAU, 2));
      var tauObs = 2.197 * gamma;
      var vNewton = live.fl.L / P.MUON_CTAU;
      lines.push("Live Fit Decay Length: L = " + f(live.fl.L, 0) + " ± " + f(live.fl.LErr, 0) + " m   χ² = " + f(live.fl.chi2, 1) + " for " + live.fl.dof + " dof");
      if (S.flAnalyzed && S.speedVerified) {
        lines.push("Dilated Lifetime: τ = " + f(tauObs, 2) + " µs (Rest τ₀ = 2.20 µs, γ = " + f(gamma, 2) + ")");
        if (live.speed && S.speedVerified) lines.push("Speed: β = " + pm(live.speed.beta, live.speed.err));
      }

      // Update glitch box line
      var gLine = $("glitch-fit-line");
      if (gLine) {
        gLine.textContent = "> FIT DECAY LENGTH: L = " + f(live.fl.L, 0) + " ± " + f(live.fl.LErr, 0) + " m";
      }

      // Update terminal modal diagnostic lines
      if ($("m-log-fit")) $("m-log-fit").textContent = "> FIT DECAY LENGTH: L = " + f(live.fl.L, 0) + " ± " + f(live.fl.LErr, 0) + " m";
      if ($("m-log-newton")) $("m-log-newton").textContent = "> NAIVE INVERSION: v/c = L/(cτ₀) = " + f(vNewton, 3) + "  (" + f(vNewton * 299792, 0) + " km/s)";
    }
    if (!S.flAnalyzed) {
      if (flightReady()) {
        lines.push("Enough data (" + S.flRun.total() + " decays in " + f(S.flRun.seconds, 0) + " s). Click 'Run Nav Computer' to execute solver.");
      } else {
        lines.push("Collecting muon decay events along the 1200 m bore... " + S.flRun.total() + "/" + STUDENT_FLIGHT_HITS + " hits before the nav computer unlocks.");
      }
    }
    $("r-fl-fit").textContent = lines.join("\n");
    updateObjectives();
    var cs = $("cal-state");
    cs.textContent = S.cal ? "CALIBRATED: corrections from " + f(S.calSeconds, 0) + " s of station beam."
      : "UNCALIBRATED: counts are not corrected for sensor sensitivity.";
    cs.className = "cal-state " + (S.cal ? "ok" : "warn");
    var anBtn = $("fl-analyze");
    if (anBtn) {
      var ready = flightReady();
      anBtn.disabled = !ready;
      if (ready && !S.flAnalyzed) {
        anBtn.classList.add("pulse-ready");
      } else {
        anBtn.classList.remove("pulse-ready");
      }
      anBtn.textContent = (S.flAnalyzed && live.fl && live.fl.ok) ? "Re-Run Nav Computer" : "Run Nav Computer";
    }
    $("fl-record").disabled = !(S.flAnalyzed && live.speed && S.speedVerified);
    if (!S.speedVerified) {
      $("fl-record").textContent = "Relativistic Override Required";
      if ($("fl-next-station")) $("fl-next-station").disabled = true;
    } else {
      $("fl-record").textContent = "Continue to Station 1 review →";
      if ($("fl-next-station")) {
        $("fl-next-station").disabled = false;
        $("fl-next-station").classList.add("reveal");
      }
    }

    if (S.step === "cal") {
      var c0 = c[0], Lb = M.decayLength(M.BEAM_BETA);
      drawPlot($("p-cal"), c, c, calFitOk ? live.cal : null,
        c0 > 0 ? function (d) { return c0 * Math.exp(-(d - M.SECTIONS[0]) / Lb); } : null, calFitOk ? eqLine(live.cal) : "");
    }
    if (S.step === "flight") drawPlot($("p-fl"), cor.n, cor.v, live.fl && live.fl.ok ? live.fl : null, null, live.fl && live.fl.ok ? eqLine(live.fl) : "");
  }

  // 3D histogram, fit, and smooth scale lerping
  function updateGraph(dt) {
    if (!G) return;
    dt = dt || 0.016;
    var n = null, variance = null, fit = null, ref = null, eq = "";
    if (S.step === "muons" && S.demo) {
      n = S.demo.counts; variance = n; var fd = M.fitDecay(n, n);
      if (fd && fd.ok && S.demo.total() > 30) fit = fd;
      eq = "N(x) = N₀ exp(−x/L)\nexpected L = " + f(M.decayLength(S.beta), 0) + " m" + (fit ? "\nfit L = " + f(fit.L, 0) + " ± " + f(fit.LErr, 0) + " m" : "");
    } else if (S.step === "cal") {
      n = S.calRun.counts; variance = n;
      if (live.cal && live.cal.ok && S.calRun.seconds > 0) fit = live.cal;
      var c0 = n[0], Lb = M.decayLength(M.BEAM_BETA);
      if (c0 > 0) ref = function (d) { return c0 * Math.exp(-(d - M.SECTIONS[0]) / Lb); };
      eq = fit ? "N(x) = N₀ exp(−x/L)\nN₀ = " + f(fit.N0, 0) + "\nL = " + f(fit.L, 0) + " ± " + f(fit.LErr, 0) + " m\n(beam: 878 m)" : "";
    } else if (S.step === "flight") {
      n = live.flN; variance = live.flV;
      if (live.fl && live.fl.ok) fit = live.fl;
      eq = fit ? "N(x) = N₀ exp(−x/L)\nN₀ = " + f(fit.N0, 0) + "\nL = " + f(fit.L, 0) + " ± " + f(fit.LErr, 0) + " m" +
        (live.speed && S.speedVerified ? "\nβ = " + pm(live.speed.beta, live.speed.err) : "") : "";
    }
    var maxN = n ? Math.max.apply(null, n) : 0;
    var target = niceCeil(Math.max(10, maxN * 1.15));

    // Smooth Y-axis scale transitions (no jarring jumps)
    if (target !== S.targetScale) {
      S.targetScale = target;
      if (G) G.gridPulse = 1.0;
      var pill = $("scale-pill");
      if (pill) {
        pill.textContent = "Y-Scale: 0–" + target;
        pill.classList.remove("scale-pulse");
        void pill.offsetWidth;
        pill.classList.add("scale-pulse");
      }
    }
    if (G && Math.abs(S.targetScale - S.currScale) > 0.4) {
      G.gridPulse = Math.max(G.gridPulse || 0, 0.65);
    }
    if (G && G.gridPulse > 0) {
      G.gridPulse = Math.max(0, G.gridPulse - dt * 2.2);
      if (G.gridMat) G.gridMat.opacity = 0.36 + 0.44 * G.gridPulse;
    }
    S.currScale += (S.targetScale - S.currScale) * Math.min(1, dt * 5);

    var ep = G.graphErrors.geometry.attributes.position;
    G.bars.forEach(function (bar, k) {
      var value = n ? n[k] : 0;
      if (value < bar.userData.previous) bar.userData.fresh = 0;
      if (value > bar.userData.previous) {
        bar.userData.heat = 1;
        bar.userData.fresh = (bar.userData.fresh || 0) + value - bar.userData.previous;
      }
      bar.userData.previous = value;
      bar.userData.heat = Math.max(0, bar.userData.heat - dt * 1.4);
      bar.userData.fresh = (bar.userData.fresh || 0) * Math.exp(-dt * 2);
      var locked = S.step === "cal" && value >= STUDENT_CAL_HITS;
      bar.material.color.setHex(locked ? 0x36d875 : 0xc47a22);
      bar.scale.y = value > 0 ? Math.max(0.001, G.H * value / S.currScale) : 0.001;
      var freshHeight = Math.min(bar.scale.y, G.H * bar.userData.fresh / S.currScale);
      G.caps[k].scale.y = Math.max(0.001, freshHeight);
      G.caps[k].position.y = G.RAIL + bar.scale.y - freshHeight;
      G.caps[k].material.opacity = value > 0 ? bar.userData.heat : 0;
      G.checks[k].visible = locked;
      G.checks[k].position.y = G.RAIL + bar.scale.y + 1;
      var err = variance && variance[k] > 0 ? Math.sqrt(variance[k]) : 0;
      var lo = G.RAIL + G.H * Math.max(0, value - err) / S.currScale;
      var hi = G.RAIL + G.H * Math.min(S.currScale * 1.2, value + err) / S.currScale;
      var x = xAt(M.SECTIONS[k]), z = 0.4, i = k * 6;
      ep.setXYZ(i, x, lo, z); ep.setXYZ(i + 1, x, hi, z);
      ep.setXYZ(i + 2, x - 0.4, lo, z); ep.setXYZ(i + 3, x + 0.4, lo, z);
      ep.setXYZ(i + 4, x - 0.4, hi, z); ep.setXYZ(i + 5, x + 0.4, hi, z);
    });
    ep.needsUpdate = true;

    // Dynamic gliding grid lines and tick labels
    var scale = S.currScale;
    var step = niceStep(scale, 3);
    var ticks = [L3.tick1, L3.tick2, L3.tick3];
    for (var gi = 0; gi < G.gridLines.length; gi++) {
      var val = (gi + 1) * step;
      var yRel = (val / scale) * G.H;
      var yPos = G.RAIL + yRel;
      var inRange = yRel <= G.H * 1.02;
      G.gridLines[gi].visible = inRange;
      if (G.tickNotches && G.tickNotches[gi]) G.tickNotches[gi].visible = inRange;
      if (inRange) {
        G.gridLines[gi].position.y = yPos;
        if (G.tickNotches && G.tickNotches[gi]) G.tickNotches[gi].position.y = yPos;
      }
      if (gi < ticks.length && ticks[gi]) {
        if (inRange && n) {
          ticks[gi].el.textContent = String(val);
          ticks[gi].yPos = yPos;
        } else {
          ticks[gi].el.textContent = "";
        }
      }
    }
    if (L3.eq) L3.eq.el.textContent = eq;
    G.setCurve(G.fitCurve, fit ? function (d) { return fit.N0 * Math.exp(fit.slope * d); } : null, S.currScale);
    function band(d, sign) {
      var v = Math.max(0, fit.interceptVar + 2 * d * fit.interceptSlopeCov + d * d * fit.slopeVar);
      return Math.exp(fit.intercept + fit.slope * d + sign * Math.sqrt(v));
    }
    G.setCurve(G.fitLow, fit ? function (d) { return band(d, -1); } : null, S.currScale);
    G.setCurve(G.fitHigh, fit ? function (d) { return band(d, 1); } : null, S.currScale);
    G.setCurve(G.refCurve, ref, S.currScale);
  }

  // ---- briefing walk-through: callout tips, and a Next button that appears after a short wait ----
  var COACH = {
    length: [
      { at: "ship", text: "In the station frame, compare the moving ship's bow and stern against the stationary markers." },
      { at: "ship", text: "Watch the ship pass the markers. Change the speed and compare its measured length." },
      { sel: "#r-length", text: "Now watch from the ship: the ship is at rest and the station markers are moving. Compare their spacing." }
    ],
    time: [
      { sel: "#s-time .slider", text: "Compare the ship clock with the synchronized station clocks. The demonstration is paused while you set the speed." },
      { at: "shipClock", text: "Watch the ship's clock move as it passes the synchronized station clocks." },
      { at: "buoyClock", text: "Compare the hands and readings as the ship passes each buoy: which clock advances less?" },
      { sel: "#r-time", text: "The readout compares the two clocks. This ratio is the factor \u03b3 you will use all lab." }
    ],
    muons: [
      { at: "prow", text: "The next waypoint maintains an idealized guidepost of slow muons. The moving ship sees them enter the ice bore; sensors record where they decay." },
      { at: "graph", text: "This paused example shows a previously collected sample. Each bar counts decays in one 100 m section; new events will add to its top." },
      { at: "graph", text: "The horizontal axis is distance into the bore; the vertical axis is the number of decays. Uncertainty whiskers show counting uncertainty." },
      { at: "graph", text: "The curve is an exponential fit, N(x) = N₀ exp(−x/L). L is the distance over which the surviving population falls by a factor of e." },
      { sel: "#s-muons .slider", text: "After these tips, change the speed and watch the counts grow. Faster muons experience more time dilation in the ship frame and travel farther before decaying." },
      { sel: "#r-muons", text: "A measured decay length L tells us the muons' speed. We will use the guidepost beam to infer our own speed." }
    ],
    doppler: [
      { sel: "[data-doppler-frame=rest]", text: "Start with the lamp and ship together at rest. Hydrogen's H-α line has a known rest wavelength of 656.3 nm." },
      { sel: "[data-doppler-frame=lamp]", text: "In the lamp frame the ship approaches, but the lamp emits at its rest wavelength. Select the ship frame to see what its detector receives." },
      { sel: "[data-doppler-frame=ship]", text: "In the ship frame the lamp approaches. The received line shifts toward shorter wavelengths. Compare it with the dashed rest reference." },
      { sel: "#s-doppler .slider", text: "Change speed and compare the line positions. The relativistic Doppler relation turns a measured wavelength shift into a speed." }
    ],
    cal: [
      { sel: "#cal-run", text: "Start the certified beam. Compare the twelve detector sections as their counts grow." },
      { sel: "#cal-store", text: "Wait until every section turns green, then store the calibration before departure." }
    ],
    flight: [
      { sel: "#fl-run", text: "Start counting the muons from the local beacon. The fit estimates a decay length." },
      { sel: "#fl-analyze", text: "Once enough events are recorded, run the navigation computer and use the fit to calculate your speed." }
    ],
    "spectro-cal": [
      { sel: "#spacenav", text: "This is the sextant station. The view controller turns the telescope: tilt the cap and the sight slews, and the harder you tilt, the faster it goes. The + and \u2212 buttons zoom, down to a 0.1\u00b0 field. The arrow keys and [ ] do the same." },
      { sel: "#p-scope", text: "The all-sky map shows the bow sky and the stern sky. The white circle is where the telescope points, drawn at its true field of view. Click the map to slew there, or click a named star to centre it." },
      { sel: "#sx-target", text: "Whatever sits in the reticle is looked up in the star catalog: its name, spectral class and temperature, and its catalog bearing against where you actually see it." },
      { sel: "#scope-ir-toggle", text: "The infrared array swaps the view: white is cold, black is hot. Cool sources that give off no visible light show up as dark blobs." },
      { sel: "#p-spec-star", text: "One spectrograph serves every source. Roll the wheel over it to zoom the wavelength axis, and click to mark a wavelength." },
      { sel: "#spec-cal-run", text: "Strike the hydrogen lamp. Its lines belong at known wavelengths, so the gap between where they land and where they belong is the instrument's offset." },
      { sel: "#spec-cal-store", text: "Store the calibration. Every spectrum you take afterwards uses it." }
    ],
    "spectro-star": [
      { sel: "#p-scope", text: "Same sextant, new job. Stars carry names, and dotted lines join them into constellations: use them as signposts. Aberration has squeezed the whole sky toward the bow." },
      { sel: "#scope-lock", text: "Centre a star in the ring and take its spectrum. Find one blue-shifted star and one red-shifted star." },
      { sel: "#spec-record", text: "With both shifts recorded, run the starlight solver and calculate your speed from them." }
    ],
    dock: [
      { sel: "#scope-ir-toggle", text: "Same sextant again. The colony ship is a cool thermal source, so switch the infrared array on: white is cold, black is hot." },
      { sel: "#p-scope", text: "The dashed ring marks the waypoint search region. Cool sources appear as orange circles. Slew to one near the ring, centre it, and take its spectrum." },
      { sel: "#sx-target", text: "A star's spectrum shows absorption lines. A thermal object shows a smooth continuum. The colony ship's hydrogen beacon puts an emission line on top of it." },
      { sel: "#rad-nm", text: "Click the emission peak on the spectrum, then calculate the colony ship's speed w from it and your ship speed. Use w hint for a starting point." },
      { sel: "#dock-to-courier", text: "With w verified, open probe control to program the courier." }
    ],
    courier: [
      { sel: "#shuttle-u", text: "Program the outbound launch speed u\u2032 in the ship frame. It must bring the courier to the colony's speed." },
      { sel: "#return-u", text: "And the return speed u\u2033, in the colony frame, to catch the ship." },
      { sel: "#dock-solver-run", text: "The rendezvous computer shares the faulty core. Run it, watch it fail, then use velocity addition yourself." },
      { sel: "#shuttle-launch", text: "Check the signs, then launch. A failed docking returns you here to try again." }
    ]
  };
  var NEXT_DELAY_MS = 6000;
  var coachState = { step: null, i: 0, done: {}, revealed: {}, timer: null, hl: null, active: false };
  // While a tip plays, the rest of the lab is inert: it cannot be clicked, focused or dragged.
  function setCoachLock(on) {
    document.body.classList.toggle("coach-active", on);
    ["spacenav", "view-keys"].forEach(function (id) { var n = $(id); if (n) { if (on) n.setAttribute("inert", ""); else n.removeAttribute("inert"); } });
    var main = document.querySelector("main");
    if (main) { if (on) main.setAttribute("inert", ""); else main.removeAttribute("inert"); }
    if (on) { view.x = 0; view.y = 0; view.zoomHold = 0; view.keys = {}; }
  }
  function coachClear() {
    if (coachState.hl) { coachState.hl.classList.remove("coach-hl"); coachState.hl = null; }
    var c = $("coach"); if (c) c.hidden = true;
    coachState.active = false;
    setCoachLock(false);
    $("coach-scene-marker").hidden = true;
  }
  function revealNext(step) {
    var card = $("s-" + step), btn = card && card.querySelector(".buttons .primary");
    coachState.revealed[step] = true;
    if (btn) { btn.classList.remove("gated"); btn.classList.add("reveal"); }
  }
  function placeCoach() {
    var c = $("coach"), st = coachState, tips = COACH[st.step];
    if (!c || !tips || c.hidden) return;
    var tip = tips[st.i];
    var target = tip.sel ? document.querySelector(tip.sel) : null;
    var W = window.innerWidth, H = window.innerHeight, cw = c.offsetWidth, ch = c.offsetHeight, arrow = $("coach-arrow");
    var x, y, below = false, marker = $("coach-scene-marker"), scenePoint = null;
    if (!target && tip.at && G && G.camera) {
      if (tip.at === "shipClock" && G.shipClock) scenePoint = G.shipClock.g.position.clone();
      else if (tip.at === "buoyClock" && G.nearClock) scenePoint = G.nearClock.g.position.clone();
      else if (tip.at === "prow") scenePoint = G.ship.localToWorld(new T.Vector3(xAt(400), 0, 0));
      else if (tip.at === "graph") scenePoint = G.ship.localToWorld(new T.Vector3(xAt(600), G.RAIL + G.H * 0.55, 0));
      else if (tip.at === "ship") scenePoint = G.ship.localToWorld(new T.Vector3(0, 0, 0));
      if (scenePoint) {
        scenePoint.project(G.camera);
        if (scenePoint.z <= 1 && Math.abs(scenePoint.x) <= 1 && Math.abs(scenePoint.y) <= 1) {
          x = (scenePoint.x + 1) * W / 2; var pointY = (1 - scenePoint.y) * H / 2;
          marker.hidden = false; marker.style.left = x + "px"; marker.style.top = pointY + "px";
          // Place scene-anchored hints in the upper empty sky band so they never block
          // the ship, buoys, or clocks, while keeping the marker & arrow on the target.
          y = Math.max(54, Math.min(pointY - ch - 48, H * 0.14));
          below = false;
        } else scenePoint = null;
      }
    }
    if (target) {
      var r = target.getBoundingClientRect();
      x = r.left + r.width / 2;
      var card = target.closest(".panel, .card");
      var cr = card ? card.getBoundingClientRect() : null;
      if (cr && cr.bottom > H - 48 && cr.top > H * 0.30) { y = cr.top - ch - 14; below = false; }
      else { y = r.top - ch - 14; }
      if (y < 54) y = 54;
      if (!cr && y < 60) { y = r.bottom + 14; below = true; }
    } else if (!scenePoint) {
      marker.hidden = true;
      x = (W - dockWidth()) / 2; y = Math.max(70, (H - dockHeight()) * 0.28);
    }
    if (target) marker.hidden = true;
    // A tip describes the panel it points into, so it must not sit on top of it.
    // Scene-anchored tips can otherwise land inside a tall station panel on short screens.
    var bottomPanel = document.querySelector(".panel[data-station]:not([hidden]), main > .card:not([hidden])");
    if (bottomPanel) {
      var prTop = bottomPanel.getBoundingClientRect().top;
      var gap = 12;
      if (y + ch > prTop - gap) y = Math.max(54, prTop - ch - gap);
      below = false;
    }
    var left = Math.max(8, Math.min(W - cw - 8, x - cw / 2));
    // During the briefing demos (length, time, muons, doppler), place the coach box in the
    // lower-right empty starfield (below the station clocks/ship, above the bottom card/dial).
    var isBriefingStep = st.step === "length" || st.step === "time" || st.step === "muons" || st.step === "doppler";
    if (isBriefingStep) {
      var bpTop = bottomPanel ? bottomPanel.getBoundingClientRect().top : H - 220;
      left = Math.max(16, W - cw - 20);
      y = Math.max(290, Math.min(H - ch - 130, bpTop - ch - 14));
      c.style.left = left + "px";
      c.style.top = y + "px";
      arrow.style.display = "none";
      return;
    }
    var movingSceneTip = !!tip.at && (st.step === "length" || st.step === "time") && st.i > 0 && S.motion;
    if (!movingSceneTip || !st.positionFixed) { c.style.left = left + "px"; c.style.top = y + "px"; st.positionFixed = movingSceneTip; }
    if (movingSceneTip) { arrow.style.display = "none"; return; }
    arrow.style.display = target || scenePoint ? "" : "none";
    arrow.style.left = Math.max(14, Math.min(cw - 14, x - left)) + "px";
    arrow.className = "coach-arrow" + (below ? " up" : "");
  }
  function setPanelMinimized(box, min) {
    if (!box) return;
    box.classList.toggle("is-minimized", !!min);
    var btn = box.querySelector(".btn-panel-min");
    if (btn) {
      btn.setAttribute("aria-expanded", String(!min));
      btn.setAttribute("aria-label", min ? "Expand control panel" : "Minimize control panel");
      btn.title = min ? "Expand controls" : "Minimize controls to view 3D scene";
      btn.textContent = min ? "▴" : "▾";
    }
    applyDock();
  }
  (function bindPanelMinimize() {
    each(".panel[data-station], main > .card", function (box) {
      if (box.id === "s-mission-lost") return;
      var host = box.querySelector(".panel-header-row") || box;
      if (host.querySelector(".btn-panel-min")) return;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-panel-min";
      btn.setAttribute("aria-expanded", "true");
      btn.setAttribute("aria-label", "Minimize control panel");
      btn.title = "Minimize controls to view 3D scene";
      btn.textContent = "▾";
      btn.addEventListener("click", function () { setPanelMinimized(box, !box.classList.contains("is-minimized")); });
      if (host === box) box.insertBefore(btn, box.firstChild);
      else host.appendChild(btn);
    });
  })();

  function showCoach() {
    var st = coachState, tips = COACH[st.step];
    if (!tips) return;
    var activeBox = dockedPanel() || activeCard();
    if (activeBox && activeBox.classList.contains("is-minimized")) setPanelMinimized(activeBox, false);
    var tip = tips[st.i], c = $("coach");
    st.positionFixed = false;
    if (st.hl) st.hl.classList.remove("coach-hl");
    st.hl = tip.sel ? document.querySelector(tip.sel) : null;
    if (st.hl) {
      st.hl.classList.add("coach-hl");
      // On a short viewport the panel is shortened while a tip plays, so pull the
      // highlighted control into the visible part of the panel.
      if (st.hl.scrollIntoView) st.hl.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    $("coach-text").textContent = tip.text;
    $("coach-count").textContent = (st.i + 1) + " / " + tips.length;
    $("coach-next").textContent = st.i === tips.length - 1 ? "Done" : "Next";
    st.active = true;
    c.hidden = false;
    setCoachLock(true);
    placeCoach();
  }
  function endCoach() {
    var step = coachState.step;
    if (step) { coachState.done[step] = true; if (step === "length" || step === "time" || step === "muons") revealNext(step); }
    coachClear();
  }
  function startBriefingAssist(step) {
    clearTimeout(coachState.timer);
    coachClear();
    coachState.step = COACH[step] ? step : null;
    var card = $("s-" + step), btn = card && card.querySelector(".buttons .primary");
    if (!COACH[step]) return;
    if (btn && (step === "length" || step === "time" || step === "muons") && !coachState.revealed[step]) {
      btn.classList.add("gated"); btn.classList.remove("reveal");
      setTimeout(function () { if (!coachState.revealed[step]) revealNext(step); }, NEXT_DELAY_MS);
    }
    if (!coachState.done[step]) {
      coachState.i = 0;
      coachState.timer = setTimeout(function () { if (S.step === step) showCoach(); }, (step === "length" || step === "time" || step === "muons" || step === "doppler") ? 0 : 900);
    }
  }
  if ($("coach-next")) $("coach-next").addEventListener("click", function () {
    var tips = COACH[coachState.step];
    if (!tips) return;
    if (coachState.i >= tips.length - 1) endCoach(); else {
      coachState.i++;
      if (coachState.step === "length" && coachState.i === 2) {
        S.frame = "ship"; S.framesSeen.ship = true; S.clock = 0; readBriefing();
      }
      if (coachState.step === "doppler" && coachState.i <= 2) {
        S.dopplerFrame = coachState.i === 1 ? "lamp" : coachState.i === 2 ? "ship" : "rest";
        drawDopplerBriefing();
      }
      showCoach();
    }
  });
  if ($("coach-skip")) $("coach-skip").addEventListener("click", endCoach);
  window.addEventListener("resize", placeCoach);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && $("coach") && !$("coach").hidden) endCoach(); });

  // ---- data thresholds (single protocol) ----
  function renderMode() {
    var need = $("cal-need");
    if (need) need.textContent = calNeedText();
  }

  // ---- mission progress and running log ----
  var TRACK_OF = { title: 0, length: 0, time: 0, muons: 0, doppler: 0, cal: 1, flight: 1, next: 1, "spectro-cal": 2, "spectro-star": 2, dock: 3, courier: 3, summary: 4 };
  function updateTrack(step) {
    var at = TRACK_OF[step];
    each("#mission-track li", function (li, i) {
      li.classList.toggle("done", i < at);
      li.classList.toggle("here", i === at);
      if (i === at) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
  }
  function setObjective(rail, key, state) {
    var el = document.querySelector("#" + rail + " [data-obj='" + key + "']");
    if (!el) return;
    el.classList.toggle("done", state === "done");
    el.classList.toggle("active", state === "active");
  }
  function updateObjectives() {
    setObjective("obj-mcal", "count", calReady() || S.cal ? "done" : "active");
    setObjective("obj-mcal", "store", S.cal ? "done" : (calReady() ? "active" : ""));
    setObjective("obj-mflight", "count", flightReady() ? "done" : "active");
    setObjective("obj-mflight", "fit", S.flAnalyzed ? "done" : (flightReady() ? "active" : ""));
    setObjective("obj-mflight", "beta", S.recorded ? "done" : (S.flAnalyzed ? "active" : ""));
    setObjective("obj-cal", "lamp", S.lampLines ? "done" : "active");
    setObjective("obj-cal", "store", S.spectroCal ? "done" : (S.lampLines ? "active" : ""));
    setObjective("obj-star", "bow", S.starPicks.bow ? "done" : "active");
    setObjective("obj-star", "aft", S.starPicks.aft ? "done" : "active");
    setObjective("obj-star", "beta", S.spectroSpeed != null ? "done" : (S.starPicks.bow && S.starPicks.aft ? "active" : ""));
    var lineRead = !!($("rad-nm") && $("rad-nm").value.trim() !== "");
    var sourceFound = !!S.colonySeen || !!(S.sxTarget && S.sxTarget.kind === "thermal");
    setObjective("obj-dock", "thermal", S.colonySeen ? "done" : "active");
    setObjective("obj-dock", "line", S.radiatorSelected ? "done" : (sourceFound ? "active" : ""));
    setObjective("obj-dock", "w", S.platformEst != null ? "done" : (lineRead ? "active" : ""));
    setObjective("obj-probe", "launch", S.shuttleLaunched ? "done" : (S.platformEst != null ? "active" : ""));
    setObjective("obj-probe", "return", S.returnDocked ? "done" : (S.shuttleLaunched ? "active" : ""));
  }
  function updateMissionLog() {
    var log = $("mission-log");
    if (!log) return;
    var muon = S.recorded ? S.recorded.beta : null, spec = S.spectroSpeed != null ? S.spectroSpeed : null;
    var briefingStep = S.step === "title" || S.step === "length" || S.step === "time" || S.step === "muons" || S.step === "doppler";
    log.hidden = briefingStep || (muon == null && spec == null && S.platformEst == null);
    $("log-muon").textContent = muon == null ? "–" : f(muon, 3) + " ± " + f(S.recorded.err, 3);
    $("log-spec").textContent = spec == null ? "–" : f(spec, 3);
    $("log-colony").textContent = S.platformEst == null ? "–" : (S.platformEst >= 0 ? "+" : "") + f(S.platformEst, 3) + "c";
    var chk = $("log-check");
    if (muon != null && spec != null) {
      var d = Math.abs(muon - spec), agree = d <= Math.max(0.02, 2 * S.recorded.err);
      chk.textContent = (agree ? "✓ Methods agree" : "✗ Methods disagree") + " (Δβ = " + f(d, 3) + ")";
      chk.className = "mission-log-check " + (agree ? "ok" : "warn");
    } else {
      chk.textContent = "";
      chk.className = "mission-log-check";
    }
    updateObjectives();
  }

  // The sextant panel is one workstation for three tasks: its title, objectives, task strip and footer
  // buttons follow the step; the tools themselves never move.
  var SX_TITLES = {
    "spectro-cal": { tag: "Sextant", h: "Calibrate", help: "spectro-cal" },
    "spectro-star": { tag: "Sextant", h: "Starlight", help: "spectro-star" },
    dock: { tag: "Sextant", h: "Waypoint search", help: "dock" }
  };
  function syncSextantChrome(step) {
    var t = SX_TITLES[step];
    if (!t) return;
    $("sx-tag").textContent = t.tag; $("h-sextant").textContent = t.h; $("sx-help").setAttribute("data-help", t.help);
    each("#s-sextant [data-sx-for]", function (n) {
      var list = n.getAttribute("data-sx-for").split(" ");
      n.hidden = list.indexOf(step) < 0;
    });
  }

  // ---- navigation ----
  function go(step) {
    if (S.step === "length" && step === "time" && !(S.framesSeen.station && S.framesSeen.ship)) return;
    var prev = S.step;
    if (typeof window !== "undefined") { window.DR_GO = go; window.DR_LIVE = live; window.DR_S = S; window.DR_M = m; }
    S.step = step;
    if (step !== "cal") setBeam(false);
    if (step !== "flight") setCounting(false);
    if (step === "length" || step === "time") S.clock = 0;
    if (step === "length") { S.beta = 0.94; S.framesSeen[S.frame] = true; }
    if (step === "time") S.beta = 0.85;
    if (step === "muons") { S.beta = 0.85; S.demo = null; }
    if (step === "doppler") S.beta = 0.60;
    if (step === "flight" && !S.flAnalyzed) {
      var flGlitch = $("fl-glitch"); if (flGlitch) flGlitch.hidden = true;
      var flCard = $("flight-override-card"); if (flCard) flCard.hidden = true;
    }

    each(".card, .panel", function (n) { n.hidden = true; });
    var shown = $(panelId(step));
    if (shown) {
      shown.hidden = false;
      setPanelMinimized(shown, false);
    }
    syncSextantChrome(step);
    $("where").textContent = STEPS[step].where;
    updateTrack(step);
    startBriefingAssist(step);
    readBriefing();
    renderMode();
    updateMissionLog();
    user = { yaw: 0, pitch: 0, zoom: 1, panX: 0, panY: 0 };
    window.DR_VIEW = user;
    updateZoomHud(); updateViewMode();
    S.targetScale = 10; S.currScale = 10;
    applyDock();
    var h = shown ? shown.querySelector("h2") : null;
    if (h) {
      h.tabIndex = -1;
      if (started) h.focus({ preventScroll: true });
      announce(STEPS[step].where + ". " + h.textContent);
    }
    var hud = $("sx-hud");
    if (hud) hud.hidden = !isSextantStep(step);
    if (isSextantStep(step)) {
      if (!isSextantStep(prev) && G) G.starBeta = -1;           // the sky snaps to the true aberration, so lock-on matches what is drawn
      if (step === "dock" && prev !== "courier") S.scopeAz = 92;
      if (step === "dock" && prev !== "courier") setScopeAngle(8);
      cancelSlew();
      initScopeInteractive();
      S.sxKey = ""; S.sxTarget = null;
      if (prev !== step) setSextantReadout(sextantIdleText());
      if ($("scope-ir-toggle")) { $("scope-ir-toggle").setAttribute("aria-pressed", String(S.scopeIR)); $("scope-ir-toggle").textContent = "IR SIGHT: " + (S.scopeIR ? "ON" : "OFF"); }
      renderTargetCard();
      refreshSextantUI();
    } else if (G && G.camera && G.camera.fov !== 45) {
      G.camera.fov = 45;
      G.camera.updateProjectionMatrix();
    }
    if (step === "dock" || step === "courier") updateDockView();
    readLab(); updateGraph(0.016);
  }
  if (window.innerWidth <= 900 && $("nav-fault")) $("nav-fault").open = false;   // keep the phone sheet short; the header stays as a summary
  each("[data-go]", function (b) { b.addEventListener("click", function () { go(b.getAttribute("data-go")); }); });

  // Instruction Drawer buttons
  each(".btn-card-help", function (b) {
    b.addEventListener("click", function () {
      var step = b.getAttribute("data-help") || S.step;
      openInstructionDrawer(step);
    });
  });
  if ($("btn-hud-help")) $("btn-hud-help").addEventListener("click", function () {
    toggleInstructionDrawer();
  });
  if ($("drawer-close-btn")) $("drawer-close-btn").addEventListener("click", function () {
    closeInstructionDrawer();
  });
  if ($("drawer-backdrop")) $("drawer-backdrop").addEventListener("click", function () {
    closeInstructionDrawer();
  });

  function setBeam(on) {
    var wasOn = S.calOn;
    S.calOn = on;
    var b = $("cal-run");
    if (b) { b.textContent = on ? "Beam off" : "Beam on"; b.setAttribute("aria-pressed", String(on)); }
    if (wasOn && !on) readLab();
  }
  function setCounting(on) {
    var wasOn = S.flOn;
    S.flOn = on;
    var b = $("fl-run");
    if (b) { b.textContent = on ? "Stop counting" : "Start counting"; b.setAttribute("aria-pressed", String(on)); }
    if (wasOn && !on) readLab();
  }
  if ($("cal-run")) $("cal-run").addEventListener("click", function () { setBeam(!S.calOn); announce(S.calOn ? "Beam on." : "Beam off."); });
  if ($("fl-run")) $("fl-run").addEventListener("click", function () {
    setCounting(!S.flOn);
    if (S.flOn) S.flAnalyzed = false;
    announce(S.flOn ? "Counting." : "Counting stopped.");
  });
  if ($("fl-analyze")) $("fl-analyze").addEventListener("click", function () {
    if (!flightReady()) {
      var need = "At least " + STUDENT_FLIGHT_HITS + " hits are required.";
      announce("More data needed. " + need);
      var r = $("r-fl-fit");
      if (r) r.textContent = "Counting time: " + f(S.flRun.seconds, 0) + " s   Decays: " + S.flRun.total() + "\n⚠ Insufficient data. " + need;
      return;
    }
    if (S.flOn) setCounting(false);
    S.flAnalyzed = true;
    readLab();
    if (!S.speedVerified) {
      S.terminalTriggered = true;
      openTerminalModal();
    } else {
      announce("Muon data analyzed. Decay fit computed: L = " + f(live.fl.L, 0) + " m.");
    }
  });
  if ($("cal-store")) $("cal-store").addEventListener("click", function () {
    S.calCounts = S.calRun.counts.slice();
    S.cal = M.calibration(S.calCounts); S.calSeconds = S.calRun.seconds;
    setBeam(false);
    readLab(); announce("Calibration stored from " + f(S.calSeconds, 0) + " seconds of beam. Beam deactivated.");
  });
  each("button.plotscale", function (b) {
    b.addEventListener("click", function () {
      S.log = !S.log;
      each("button.plotscale", function (o) { o.setAttribute("aria-pressed", String(S.log)); });
      readLab();
    });
  });

  function download(name, text) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }
  if ($("cal-csv")) $("cal-csv").addEventListener("click", function () {
    var c = S.calRun.counts, cal = c[0] > 0 ? M.calibration(c) : null;
    var rows = ["# Dead Reckoning calibration, mission " + code, "# certified beam beta 0.800, beam time " + f(S.calRun.seconds, 0) + " s",
      "section,start_m,end_m,centre_m,decays,rel_efficiency,rel_efficiency_err"];
    M.SECTIONS.forEach(function (x, k) {
      rows.push([k + 1, x - 50, x + 50, x, c[k], cal ? f(cal.e[k], 4) : "", cal ? f(cal.de[k], 4) : ""].join(","));
    });
    download("calibration-" + code + ".csv", rows.join("\n") + "\n");
  });
  if ($("fl-csv")) $("fl-csv").addEventListener("click", function () {
    var n = S.flRun.counts, cor = M.corrected(n, S.cal);
    var rows = ["# Dead Reckoning flight, mission " + code, "# counting time " + f(S.flRun.seconds, 0) + " s, " + (S.cal ? "calibrated" : "uncalibrated"),
      "section,start_m,end_m,centre_m,decays,corrected,corrected_err"];
    M.SECTIONS.forEach(function (x, k) {
      rows.push([k + 1, x - 50, x + 50, x, n[k], S.cal ? f(cor.n[k], 1) : "", S.cal ? f(Math.sqrt(cor.v[k]), 1) : ""].join(","));
    });
    download("flight-" + code + ".csv", rows.join("\n") + "\n");
  });
  if ($("sx-csv")) $("sx-csv").addEventListener("click", function () {
    if (!S.lamp && !S.lastSpec && !S.starPicks.bow && !S.starPicks.aft) { announce("Record a spectrum before downloading."); return; }
    var rows = ["# Sextant spectrograph, mission " + code, "section,source,observed_angle_deg,pixel,wavelength_nm,flux"];
    if (S.lamp) S.lamp.flux.forEach(function (v, i) { rows.push(["lamp","hydrogen lamp","",i,f(SP.pixelToNmNominal(i),2),f(v,5)].join(",")); });
    ["bow", "aft"].forEach(function (direction) {
      var p = S.starPicks[direction]; if (!p) return;
      if (!p.flux) { rows.push([direction,p.name,f(p.thetaDeg,2),"",f(p.lambdaNm,2),""].join(",")); return; }
      p.flux.forEach(function (v, i) { rows.push([direction,p.name,f(p.thetaDeg,2),i,f(S.lamp ? calNm(i) : SP.pixelToNmNominal(i),2),f(v,5)].join(",")); });
    });
    if (S.lastSpec && S.lastSpec.kind === "thermal") S.lastSpec.flux.forEach(function (v, i) { rows.push(["thermal",$("sx-source-label").textContent,"",i,f(S.lamp ? calNm(i) : SP.pixelToNmNominal(i),2),f(v,5)].join(",")); });
    download("sextant-" + code + ".csv", rows.join("\n") + "\n");
  });
  if ($("dock-csv")) $("dock-csv").addEventListener("click", function () {
    var rows = ["# Rendezvous observations, mission " + code, "metric,value,unit",
      "observed_halpha," + ($("rad-nm").value || "") + ",nm", "verified_colony_speed," + (S.platformEst == null ? "" : S.platformEst) + ",c",
      "outbound_speed," + ($("shuttle-u").value || "") + ",c", "return_speed," + ($("return-u").value || "") + ",c",
      "outcome," + (S.outcome || "pending") + ","];
    download("rendezvous-" + code + ".csv", rows.join("\n") + "\n");
  });

  var dlg = $("skip");
  if ($("depart")) $("depart").addEventListener("click", function () {
    if (S.cal) { go("flight"); return; }
    if (dlg && dlg.showModal) dlg.showModal();
    else if (window.confirm("Depart without a calibration? Your measured speed will be biased.")) go("flight");
  });
  if ($("skip-back")) $("skip-back").addEventListener("click", function () { dlg.close(); $("cal-run").focus(); });
  if ($("skip-go")) $("skip-go").addEventListener("click", function () { dlg.close(); go("flight"); });

  var alertSerial = 0;
  // AR-OS style system alert. Inline readouts stay for accessibility and tests; this is the
  // operator-facing failure surface, styled like a ship console rather than lab feedback.
  function sysAlert(message, opts) {
    opts = opts || {};
    var host = $("sys-alerts");
    if (!host) return;
    var box = document.createElement("div");
    box.className = "sys-alert " + (opts.kind || "error");
    var head = document.createElement("div"); head.className = "sys-alert-head";
    var title = document.createElement("span"); title.textContent = opts.title || "OPS // FAULT";
    var code = document.createElement("span"); code.textContent = opts.code || ("E-" + (100 + (++alertSerial)));
    head.appendChild(title); head.appendChild(code);
    var body = document.createElement("div"); body.className = "sys-alert-body"; body.textContent = message;
    box.appendChild(head); box.appendChild(body); host.appendChild(box);
    while (host.children.length > 3) host.removeChild(host.firstChild);
    setTimeout(function () {
      box.classList.add("out");
      setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 220);
    }, opts.ttl || 5600);
    if (opts.fault) diagBurst({ kind: "fault", count: 2, at: box });
  }

  // ---- diagnostic windows -------------------------------------------------------------------
  // Short-lived terminal windows that open at the moment something fails, scrawl fast diagnostic
  // jargon, and close. They never take input. Each failure makes the diagnostic computer a little
  // more certain what the fault is, so the last window of a burst states its current conclusion.
  var rnd = Math.random;
  function pick(a) { return a[Math.floor(rnd() * a.length)]; }
  function hx(n) { var s = ""; for (var i = 0; i < n; i++) s += "0123456789abcdef".charAt(Math.floor(rnd() * 16)); return s; }
  function ascii(n) { var s = ""; for (var i = 0; i < n; i++) s += pick([".", ".", "N", "V", "-", "S", "Y", "c", "o", "r", "e", "0", "x"]); return s; }
  function dec(lo, hi) { return Math.floor(lo + rnd() * (hi - lo)); }
  var SVC = ["relcore", "inertiald", "navbus", "spectrod", "gimbal-ctl", "icebore-adc", "probe-link", "rz-solver", "cal-store", "irarray"];
  var FILES = ["core/invert.c", "core/lorentz.c", "bus/can3.c", "dsp/fft.c", "nvram/page.c", "sched/rt.c", "optics/gimbal.c"];
  var FUNCS = ["lorentz_invert", "solve_beta_newton", "bus_arbitrate", "nvram_commit", "adc_sample_bank", "pll_relock", "fit_decay_length", "doppler_ratio"];
  var DIAG_LINES = [
    function () { var b = []; for (var i = 0; i < 8; i++) b.push(hx(2)); return "0x" + hx(8) + "  " + b.join(" ") + "  |" + ascii(8) + "|"; },
    function () { return "#" + dec(0, 16) + " 0x" + hx(12) + " in " + pick(FUNCS) + " (" + pick(["L", "beta", "gamma", "x", "buf"]) + "=" + (rnd() * 9).toFixed(3) + ") " + pick(FILES) + ":" + dec(20, 900); },
    function () {
      var msg = pick(["segfault at 0000000000000018 ip 00007f" + hx(6) + " sp 00007ffd" + hx(6), "CRC 0x" + hx(4) + " != 0x" + hx(4) + " retry " + dec(1, 9) + "/9",
        "watchdog bite, restarting", "ECC corrected 3 bits page 0x" + hx(2), "timeout waiting for ack (" + pick(["dev/imu0", "dev/adc2", "dev/can3"]) + ")"]);
      return "[" + (rnd() * 9000 + 100).toFixed(3) + "] " + pick(SVC) + "[" + dec(1000, 9999) + "]: " + msg;
    },
    function () { return pick(["PSU-A", "PSU-B", "BUS-3", "ADC-2", "IMU-0"]) + " " + (rnd() * 3 + 10).toFixed(2) + "V " + (rnd() * 40 + 20).toFixed(1) + "C " + pick(["OK", "OK", "WARN", "FAIL"]); },
    function () { return "r" + dec(0, 16) + "=0x" + hx(16) + " r" + dec(0, 16) + "=0x" + hx(16); },
    function () { return "probe " + pick(["dev/imu0", "dev/adc2", "dev/can3", "dev/nvram"]) + " ... " + pick(["ok", "ok", "timeout", "bad crc", "busy"]); },
    function () { return "strace: " + pick(["read", "write", "ioctl", "futex", "mmap"]) + "(" + dec(0, 30) + ", 0x" + hx(8) + ", " + dec(0, 4096) + ") = " + pick(["-1 EIO", "-1 ETIMEDOUT", "0", "512", "-1 EFAULT"]); }
  ];
  var DIAG_TITLES = ["journalctl -f -u relcore", "dmesg -w", "gdb -p 2218 -batch -ex bt", "strace -f -p 2218", "memtest --core 0", "bus-probe --all", "fsck.nvram /dev/nvram0", "tail -f /var/log/navbus"];
  var DIAG_CONF = [34, 58, 79, 91, 97];
  var diagWins = [], diagRaf = 0;
  function diagBurst(opts) {
    var host = $("diagnostic-windows");
    if (!host) return;
    var fault = opts.kind === "fault", count = opts.count || 3;
    if (fault) S.faults++;
    var W = window.innerWidth, H = window.innerHeight, panel = dockedPanel();
    var openModal = document.querySelector(".modal-backdrop:not([hidden]) .modal-dialog");
    var mRect = openModal ? openModal.getBoundingClientRect() : null;
    var rect = opts.at && opts.at.getBoundingClientRect ? opts.at.getBoundingClientRect() : null;
    var dRect = (mRect && mRect.width > 400) ? mRect : null;
    var topLimit = dRect ? 56 : 64;
    var bottomLimit = dRect ? H - 16 : (panel ? panel.getBoundingClientRect().top - 8 : H - 60);
    var ox = rect ? rect.left + rect.width / 2 : W * 0.5, oy = rect ? rect.top + rect.height / 2 : H * 0.34;
    var base = rect ? Math.min(rect.width / 2, W * 0.26) * 0.75 : 100, margin = Math.max(100, W * 0.08);
    var t0 = performance.now();
    host.hidden = false;
    for (var i = 0; i < count; i++) {
      var ww = Math.min(240, dec(205, Math.max(215, Math.round(W * 0.18)))), hh = dec(96, 132), side = (i + dec(0, 2)) % 2 ? 1 : -1;
      var x, y;
      if (dRect) {
        var gap = 10, edge = W >= 1440 ? 84 : 12;
        var leftMax = dRect.left - ww - gap, rightMin = dRect.right + gap, rightMax = W - ww - edge;
        var leftOk = leftMax >= edge, rightOk = rightMin <= rightMax;
        if (!leftOk && !rightOk) continue;
        if (side > 0 && !rightOk) side = -1;
        else if (side < 0 && !leftOk) side = 1;
        x = side > 0
          ? clamp(rightMin + rnd() * Math.max(0, rightMax - rightMin), rightMin, rightMax)
          : clamp(leftMax - rnd() * Math.max(0, leftMax - edge), edge, leftMax);
        y = dRect.top + 20 + rnd() * Math.max(30, dRect.height * 0.5);
      } else if (!fault && W >= 1100) {
        x = W - ww - 20 - rnd() * 40;
        y = clamp(bottomLimit - hh - 8 - rnd() * 50, topLimit, Math.max(topLimit, bottomLimit - hh));
      } else {
        x = side > 0 ? ox + base + rnd() * 90 : ox - base - rnd() * 90 - ww;
        x = clamp(x, margin, W - ww - margin);
        y = oy - 70 + (rnd() - 0.5) * 170;
      }
      y = clamp(y, topLimit, Math.max(topLimit, bottomLimit - hh));
      var node = document.createElement("div");
      node.className = "diagnostic-window" + (fault ? " warn" : "");
      node.style.left = x + "px"; node.style.top = y + "px"; node.style.width = ww + "px"; node.style.display = "none";
      var head = document.createElement("div"); head.className = "diag-head";
      var title = document.createElement("span"); title.textContent = pick(DIAG_TITLES);
      var status = document.createElement("span"); status.textContent = fault ? "FAULT" : "LIVE";
      head.appendChild(title); head.appendChild(status);
      var body = document.createElement("div"); body.className = "diag-body"; body.style.height = (hh - 22) + "px";
      node.appendChild(head); node.appendChild(body); host.appendChild(node);
      var life = dec(950, 1700), last = i === count - 1;
      diagWins.push({ node: node, body: body, start: t0 + i * dec(60, 130), end: 0, life: life, next: 0, gap: dec(16, 30), lines: 0, shown: false,
        final: fault && last ? "DIAG> relcore fault " + DIAG_CONF[Math.min(S.faults - 1, DIAG_CONF.length - 1)] + "%" : "", finished: false });
    }
    if (!diagRaf) diagRaf = requestAnimationFrame(diagTick);
  }
  function diagLine(w, text, cls) {
    var row = document.createElement("div");
    row.className = "diag-line" + (cls ? " " + cls : "");
    row.textContent = text;
    w.body.appendChild(row);
    while (w.body.children.length > 12) w.body.removeChild(w.body.firstChild);
  }
  function diagTick(now) {
    diagRaf = 0;
    var host = $("diagnostic-windows");
    for (var i = diagWins.length - 1; i >= 0; i--) {
      var w = diagWins[i];
      if (now < w.start) continue;
      if (!w.shown) { w.shown = true; w.node.style.display = ""; w.end = now + w.life; w.next = now; }
      if (!w.finished) {
        while (now >= w.next && now < w.end - 260) { diagLine(w, pick(DIAG_LINES)(), ""); w.next += w.gap; }
        if (now >= w.end - 260) { w.finished = true; if (w.final) diagLine(w, w.final, "diag-final"); w.node.classList.add("settle"); }
      }
      if (now >= w.end) {
        w.node.classList.add("out");
        (function (node) { setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 170); })(w.node);
        diagWins.splice(i, 1);
      }
    }
    if (diagWins.length) diagRaf = requestAnimationFrame(diagTick);
    else if (host) setTimeout(function () { if (!diagWins.length) host.hidden = true; }, 260);
  }
  // Named bursts: a failing core opens several fast windows; a routine action opens two quiet ones.
  var DIAG_KINDS = {
    muon: { kind: "fault", count: 3, at: "#glitch-modal .modal-dialog" },
    star: { kind: "fault", count: 3, at: "#star-solver-modal .modal-dialog" },
    dock: { kind: "fault", count: 3, at: "#dock-solver-fault" },
    ir: { kind: "info", count: 1, at: "#scope-ir-toggle" },
    spectra: { kind: "info", count: 1, at: "#scope-lock" },
    lamp: { kind: "info", count: 1, at: "#spec-cal-run" },
    launch: { kind: "info", count: 1, at: "#shuttle-launch" }
  };
  function runDiagnostics(kind) {
    var spec = DIAG_KINDS[kind] || DIAG_KINDS.dock;
    diagBurst({ kind: spec.kind, count: spec.count, at: document.querySelector(spec.at) });
  }
  function openTerminalModal() {
    coachClear();
    var modal = $("glitch-modal");
    if (!modal) return;
    solverCancel();
    var subluminal = false;
    if (live.fl && live.fl.ok) {
      var vNewton = live.fl.L / P.MUON_CTAU;
      subluminal = vNewton < 1;
      if ($("m-log-fit")) $("m-log-fit").textContent = "> FIT DECAY LENGTH: L = " + f(live.fl.L, 0) + " ± " + f(live.fl.LErr, 0) + " m";
      if ($("m-log-newton")) $("m-log-newton").textContent = "> NAIVE INVERSION: v/c = L/(cτ₀) = " + f(vNewton, 3) + "  (" + f(vNewton * 299792, 0) + " km/s)";
      if ($("m-log-err")) $("m-log-err").textContent = subluminal
        ? "nav-solve: ERROR 0x7E: Lorentz factor γ omitted; classical inversion rejected"
        : "nav-solve: ERROR 0x7E: result exceeds light speed; rejected";
    }
    if (!S.speedVerified) {
      if ($("modal-beta-input")) { $("modal-beta-input").value = ""; $("modal-beta-input").disabled = false; }
      if ($("modal-submit-btn")) $("modal-submit-btn").disabled = false;
      if ($("modal-feedback")) { $("modal-feedback").className = "term-feedback"; $("modal-feedback").textContent = ""; }
    }
    modal.hidden = false;
    startSolverRun();
    announce(subluminal
      ? "NAV-SYS error: classical inversion rejected. Manual relativistic calculation required."
      : "NAV-SYS error: unphysical speed exceeding c detected. Manual relativistic calculation required.");
  }

  // Solver run-through: the terminal streams character by character, driven by the frame clock so the speed is the
  // same at any frame rate. Unrevealed text stays in the layout (hidden), so lines never reflow while they type.
  var SOLVER_CPS = 110, SOLVER_LINE_GAP_MS = 220, SOLVER_GLITCH_MS = 560;
  var solverRaf = 0, solverStream = null;
  var reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  function solverCancel() {
    if (solverRaf) cancelAnimationFrame(solverRaf);
    solverRaf = 0;
    if (solverStream) {
      solverStream.items.forEach(function (it) {
        it.nodes.forEach(function (nd) { nd.vis.nodeValue = nd.full; if (nd.hid.parentNode) nd.hid.parentNode.removeChild(nd.hid); });
      });
      solverStream = null;
    }
  }
  function followTermNode(body, node, pad) {
    if (!body || !node) return;
    var bRect = body.getBoundingClientRect(), nRect = node.getBoundingClientRect();
    var over = nRect.bottom - bRect.bottom + (pad || 12);
    if (over > 0) body.scrollTop += over;
  }
  function solverFinish() {
    solverCancel();
    var modal = $("glitch-modal");
    if (!modal) return;
    modal.classList.remove("solver-glitch");
    modal.querySelectorAll(".is-pending").forEach(function (el) { el.classList.remove("is-pending"); });
    var cursor = modal.querySelector(".term-cursor");
    if (cursor) cursor.remove();
    var skip = $("modal-skip-btn"); if (skip) skip.hidden = true;
    var inp = $("modal-beta-input"); if (inp) inp.focus({ preventScroll: true });
    if (!modal.hidden) followTermNode($("modal-terminal-log"), modal.querySelector(".term-manual"), 12);
    // The terminal is the operator surface. The old inline fault cards duplicated its input and
    // tripled the flight console's height, so they stay out of the fixed-height rack.
    if (!S.speedVerified && !modal.hidden) {
      sysAlert("Relativistic correction core offline. Compute beta from the fitted decay length in the emergency terminal.", { kind: "warn", title: "NAV-SYS // CORE FAULT", code: "NV-404", ttl: 7000, fault: true });
    }
  }
  function prepStreamItem(el) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null), texts = [];
    while (walker.nextNode()) { if (walker.currentNode.nodeValue.length) texts.push(walker.currentNode); }
    var nodes = texts.map(function (n) {
      var full = n.nodeValue, hid = document.createElement("span");
      hid.className = "term-rest"; hid.textContent = full; n.nodeValue = "";
      n.parentNode.insertBefore(hid, n.nextSibling);
      return { vis: n, hid: hid, full: full };
    });
    return { el: el, nodes: nodes, total: nodes.reduce(function (t, nd) { return t + nd.full.length; }, 0) };
  }
  function startSolverRun() {
    var modal = $("glitch-modal"), body = $("modal-terminal-log"), card = modal.querySelector(".modal-input-card");
    solverCancel();
    modal.classList.remove("solver-glitch");
    var skip = $("modal-skip-btn"); if (skip) { skip.hidden = false; skip.focus({ preventScroll: true }); }
    // Always stream the terminal log (even when OS prefers-reduced-motion is set on school laptops).

    var lineEls = Array.prototype.slice.call(body.querySelectorAll(".term-line"));
    lineEls.forEach(function (line) { line.classList.remove("is-live"); });
    var items = lineEls.map(prepStreamItem);
    body.querySelectorAll(".term-calc").forEach(function (el) { el.classList.add("is-pending"); });
    if (card) card.classList.add("is-pending");
    if (body) body.scrollTop = 0;

    var cursor = modal.querySelector(".term-cursor");
    if (!cursor) { cursor = document.createElement("span"); cursor.className = "term-cursor"; cursor.textContent = "\u2588"; }
    var stream = solverStream = { items: items };

    var idx = 0, acc = 0, last = 0, wait = 0, glitchLeft = 0, done = false;
    function placeCursor(item, shown) {
      var left = shown, spot = null;
      for (var k = 0; k < item.nodes.length; k++) {
        var nd = item.nodes[k];
        if (left <= nd.full.length) { spot = nd; break; }
        left -= nd.full.length;
      }
      spot = spot || item.nodes[item.nodes.length - 1];
      if (spot && spot.hid.parentNode) spot.hid.parentNode.insertBefore(cursor, spot.hid);
      else item.el.appendChild(cursor);
    }
    function setShown(item, shown) {
      var left = shown;
      item.nodes.forEach(function (nd) {
        var k = Math.max(0, Math.min(nd.full.length, left));
        nd.vis.nodeValue = nd.full.slice(0, k); nd.hid.textContent = nd.full.slice(k);
        left -= nd.full.length;
      });
    }
    function begin(item) {
      var wrap = item.el.closest(".term-calc");
      if (wrap) wrap.classList.remove("is-pending");
      item.el.classList.add("is-live");
    }
    function frame(now) {
      if (stream !== solverStream) return;
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
      if (glitchLeft > 0) {
        glitchLeft -= dt * 1000;
        if (glitchLeft <= 0) modal.classList.remove("solver-glitch");
      }
      if (wait > 0) { wait -= dt * 1000; solverRaf = requestAnimationFrame(frame); return; }
      if (idx >= items.length) {
        if (!done) { done = true; if (card) card.classList.remove("is-pending"); setTimeout(function () { if (stream === solverStream) solverFinish(); }, 650); }
        solverRaf = requestAnimationFrame(frame); return;
      }
      var item = items[idx];
      if (!item.started) {
        // Each fault line shakes as it appears.
        if (!item.glitched && item.el.classList.contains("term-err")) {
          item.glitched = true; modal.classList.add("solver-glitch"); glitchLeft = SOLVER_GLITCH_MS;
          diagBurst({ kind: "fault", count: 2, at: modal.querySelector(".modal-dialog") });
        }
        item.started = true; item.shown = 0; begin(item);
      }
      acc += dt * SOLVER_CPS;
      var step = Math.floor(acc);
      if (step > 0) {
        acc -= step;
        item.shown = Math.min(item.total, item.shown + step);
        setShown(item, item.shown);
        placeCursor(item, item.shown);
        followTermNode(body, (cursor && cursor.parentNode) ? cursor : item.el, 16);
        // brief beat after punctuation so it reads like a person-paced terminal, not a counter
        var ch = item.nodes.length ? (function () { var l = item.shown, t = ""; item.nodes.forEach(function (nd) { if (l > 0) { t = nd.full.slice(0, Math.min(l, nd.full.length)); l -= nd.full.length; } }); return t.charAt(t.length - 1); })() : "";
        if (ch === "." || ch === ":" || ch === ",") wait = 55;
      }
      if (item.shown >= item.total) { idx++; wait = Math.max(wait, SOLVER_LINE_GAP_MS); acc = 0; }
      solverRaf = requestAnimationFrame(frame);
    }
    if (items[0]) { items[0].started = true; items[0].shown = 0; begin(items[0]); }
    solverRaf = requestAnimationFrame(frame);
  }

  function closeTerminalModal() {
    solverFinish();
    var modal = $("glitch-modal");
    if (modal) modal.hidden = true;
    var manualInp = $("fl-beta-manual");
    if (manualInp && manualInp.offsetParent !== null) manualInp.focus();
    else if ($("fl-record")) $("fl-record").focus();
  }

  function validateAndRecordSpeed(inputVal, feedbackEl) {
    if (!feedbackEl) feedbackEl = $("modal-feedback") || $("fl-beta-feedback");
    if (!live.speed || !live.fl || !live.fl.ok) {
      feedbackEl.className = "term-feedback err";
      feedbackEl.textContent = "Error: collect enough data and run the nav computer before entering a calculation.";
      return false;
    }
    var val = parseFloat(inputVal);
    if (isNaN(val) || val <= 0) {
      feedbackEl.className = "term-feedback err";
      feedbackEl.textContent = "Error: Enter a valid positive number for β = v/c (e.g. 0.854).";
      return false;
    }
    if (val >= 1.0) {
      var vNewton = live.fl.L / P.MUON_CTAU;
      feedbackEl.className = "term-feedback err";
      if (Math.abs(val - vNewton) < 0.05) {
        feedbackEl.textContent = "The classical result exceeds c. Use the relativistic relation between L and β, then try again.";
      } else {
        feedbackEl.textContent = "Causality violation: β = " + f(val, 3) + " ≥ 1.0 reaches or exceeds c. Special relativity requires β < 1.0. Invert L = βγcτ₀ to solve for β.";
      }
      return false;
    }

    var targetBeta = live.speed.beta;
    var diff = Math.abs(val - targetBeta);
    var tol = Math.max(0.018, live.speed.err * 2.0);
    if (diff <= tol) {
      S.speedVerified = true;
      S.recorded = { beta: val, err: live.speed.err, calibrated: !!S.cal, seconds: S.flRun.seconds,
        counts: S.flRun.counts.slice(),
        calibration: S.cal ? { e: S.cal.e.slice(), de: S.cal.de.slice() } : null };
      feedbackEl.className = "term-feedback ok";
      feedbackEl.textContent = "✓ RELATIVISTIC CALCULATION VERIFIED: β = " + f(val, 3) + " (Fit: " + pm(targetBeta, live.speed.err) + "). Inertial lock acquired! Speed recorded.";

      if ($("modal-beta-input")) { $("modal-beta-input").value = String(val); $("modal-beta-input").disabled = true; }
      if ($("modal-submit-btn")) $("modal-submit-btn").disabled = true;
      if ($("fl-beta-manual")) { $("fl-beta-manual").value = String(val); $("fl-beta-manual").disabled = true; }
      if ($("fl-beta-submit")) $("fl-beta-submit").disabled = true;
      var otherFb = (feedbackEl === $("modal-feedback")) ? $("fl-beta-feedback") : $("modal-feedback");
      if (otherFb) {
        otherFb.className = "term-feedback ok";
        otherFb.textContent = feedbackEl.textContent;
      }

      var alertHost = $("sys-alerts");
      if (alertHost) alertHost.innerHTML = "";
      diagWins.forEach(function (w) { if (w.node && w.node.parentNode) w.node.parentNode.removeChild(w.node); });
      diagWins.length = 0;
      if ($("diagnostic-windows")) $("diagnostic-windows").hidden = true;

      var recBtn = $("fl-record");
      if (recBtn) {
        recBtn.disabled = false;
        recBtn.textContent = "Proceed to Station 1 Review";
        recBtn.classList.add("primary");
        var nextBtn = $("fl-next-station");
        if (nextBtn) { nextBtn.disabled = false; nextBtn.classList.add("reveal"); }
      }

      $("r-recorded").textContent = "β = " + pm(S.recorded.beta, S.recorded.err) + "\n" +
        (S.recorded.calibrated ? "Calibrated Muon Detector" : "Uncalibrated Muon Detector") + ", " + f(S.recorded.seconds, 0) + " s of counting.\nMission code " + code;

      announce("Relativistic speed verified: beta " + f(val, 3) + ". Navigation lock acquired.");

      setTimeout(function () {
        closeTerminalModal();
        go("next");
      }, 1400);
      return true;
    } else {
      feedbackEl.className = "term-feedback err";
      feedbackEl.textContent = "That speed does not match the fitted decay length L = " + f(live.fl.L, 0) + " m. Check L = βγcτ₀ with cτ₀ = " + f(P.MUON_CTAU, 1) + " m and enter β to 3 decimal places.";
      return false;
    }
  }

  // Terminal modal & manual override event listeners
  if ($("modal-close-btn")) $("modal-close-btn").addEventListener("click", closeTerminalModal);
  if ($("modal-inspect-btn")) $("modal-inspect-btn").addEventListener("click", closeTerminalModal);
  if ($("btn-reopen-modal")) $("btn-reopen-modal").addEventListener("click", openTerminalModal);
  if ($("modal-skip-btn")) $("modal-skip-btn").addEventListener("click", solverFinish);
  // Handle Escape and trap Tab focus within terminal modal
  document.addEventListener("keydown", function (e) {
    var modal = $("glitch-modal");
    if (!modal || modal.hidden) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeTerminalModal();
      return;
    }
    if (e.key === "Tab") {
      var focusables = modal.querySelectorAll("button:not([hidden]):not([disabled]), input:not([hidden]):not([disabled])");
      var list = Array.prototype.slice.call(focusables);
      if (list.length === 0) return;
      var first = list[0], last = list[list.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first || !modal.contains(document.activeElement)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last || !modal.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  });

  if ($("modal-submit-btn")) $("modal-submit-btn").addEventListener("click", function () {
    validateAndRecordSpeed($("modal-beta-input").value, $("modal-feedback"));
  });
  if ($("modal-beta-input")) $("modal-beta-input").addEventListener("keydown", function (e) {
    if (e.key === "Enter") validateAndRecordSpeed($("modal-beta-input").value, $("modal-feedback"));
  });

  if ($("fl-beta-submit")) $("fl-beta-submit").addEventListener("click", function () {
    validateAndRecordSpeed($("fl-beta-manual").value, $("fl-beta-feedback"));
  });
  if ($("fl-beta-manual")) $("fl-beta-manual").addEventListener("keydown", function (e) {
    if (e.key === "Enter") validateAndRecordSpeed($("fl-beta-manual").value, $("fl-beta-feedback"));
  });

  if ($("fl-next-station")) $("fl-next-station").addEventListener("click", function () {
    if (!live.speed) return;
    if (!S.speedVerified) {
      openTerminalModal();
      return;
    }
    go("next");
  });
  if ($("fl-record")) $("fl-record").addEventListener("click", function () {
    if (!live.speed) return;
    if (!S.speedVerified) {
      openTerminalModal();
      return;
    }
    go("next");
  });

  // Station 1's speed: the muon bore measurement the student predicts from
  function stationOneBeta() { return S.recorded ? S.recorded.beta : m.beta; }
  // Speed used for the shuttle: the spectrograph result if the student has it, otherwise Station 1
  // The two independent measurements are averaged when both exist, as the debrief does
  function shipBeta() {
    if (S.recorded && S.spectroSpeed) return (S.recorded.beta + S.spectroSpeed) / 2;
    return S.recorded ? S.recorded.beta : (S.spectroSpeed || m.beta);
  }

  // Sub-pixel centre of an extremum (absorption dip or emission peak) via a 3-point parabola
  function dipCentre(flux, i) {
    if (i < 1 || i > flux.length - 2) return i;
    var a = flux[i - 1], b = flux[i], c = flux[i + 1], den = a - 2 * b + c;
    if (den === 0) return i;
    var delta = 0.5 * (a - c) / den;
    return Math.abs(delta) <= 0.6 ? i + delta : i;
  }

  function dipPixel(flux) {
    var best = 0;
    for (var i = 1; i < flux.length; i++) { if (flux[i] < flux[best]) best = i; }
    return best;
  }

  var lampTimer = 0;
  if ($("spec-cal-run")) $("spec-cal-run").addEventListener("click", function () {
    var plasma = $("discharge-plasma"), arc = $("discharge-arc"), status = $("discharge-status");
    if (arc) {
      arc.classList.remove("strike");
      void arc.offsetWidth;
      arc.classList.add("strike");
    }
    if (plasma) plasma.classList.remove("active");
    if (status) status.textContent = "Arc striking · ionizing low-pressure H₂";
    clearTimeout(lampTimer);
    lampTimer = setTimeout(function () {
      if (plasma) plasma.classList.add("active");
      if (status) status.textContent = "Plasma steady · Balmer lines H-α, H-β, H-γ";
      S.lamp = SP.lampSpectrum(m.seed);
      var lines = SP.KEY_LINES.map(function (kl) {
        return { id: kl.id, name: kl.name, restNm: kl.restNm, color: kl.color,
          pixel: dipCentre(S.lamp.flux, peakNear(S.lamp.flux, SP.nmToPixelNominal(kl.restNm), 12, 1)) };
      });
      S.lampLines = lines; S.markNm = null; S.specView = null;
      setSource("HYDROGEN (H I) LAMP");
      drawSpectrum($("p-spec-star"), S.lamp.flux, "lamp", { lines: lines.map(function (l) {
        return { nm: SP.pixelToNmNominal(l.pixel), label: l.name, color: l.color }; }) });
      var rows = lines.map(function (l) {
        var found = SP.pixelToNmNominal(l.pixel), off = found - l.restNm;
        return l.name + ": found at " + f(found, 1) + " nm, reference " + f(l.restNm, 1) + " nm, offset " + (off >= 0 ? "+" : "") + f(off, 1) + " nm";
      });
      setSextantReadout(["Hydrogen lamp recorded. Every line is shifted from its reference wavelength (scale + offset error):"].concat(rows));
      $("spec-cal-store").disabled = !!S.spectroCal;
      runDiagnostics("lamp");
      refreshSextantUI();
      announce("Hydrogen discharge lamp struck. Calibration emission spectrum recorded.");
    }, 380);
  });

  if ($("spec-cal-store")) $("spec-cal-store").addEventListener("click", function () {
    if (!S.lamp) return;
    S.spectroCal = true;
    $("spec-cal-next").disabled = false;
    var b = $("spec-cal-store");
    if (b) { b.textContent = "CAL STORED ✓"; b.disabled = true; }
    var status = $("discharge-status");
    if (status) status.textContent = "Calibration stored ✓ · scale aligned";
    drawSpectrum($("p-spec-star"), S.lamp.flux, "lamp", { calib: true, lines: (S.lampLines || []).map(function (l) {
      return { nm: l.restNm, label: l.name, color: l.color }; }) });
    setSextantReadout(["✓ Calibration stored: the lamp lines now sit at their reference wavelengths.", "Every spectrum you take from here on uses this scale.", "Continue to the sky."]);
    refreshSextantUI();
    announce("Spectrograph calibrated against the hydrogen lamp.");
  });

  if ($("spec-cal-next")) $("spec-cal-next").addEventListener("click", function () {
    S.scopeMsg = null;
    go("spectro-star");
  });

  var starRunSerial = 0;
  function finishStarRun() {
    starRunSerial++;
    each("#star-solver-modal .term-line", function (line) { line.hidden = false; });
    $("star-manual").hidden = false; $("star-solver-skip").hidden = true;
    $("star-beta-input").focus({preventScroll:true});
  }
  $("star-solver-skip").addEventListener("click", finishStarRun);
  if ($("spec-record")) $("spec-record").addEventListener("click", function () {
    var b = S.starPicks.bow, a = S.starPicks.aft;
    if (!b || !a) return;
    coachClear();
    $("star-solver-data").textContent = b.name + ": θ = " + f(b.thetaDeg, 2) + "°, λ = " + f(b.lambdaNm, 1) + " nm\n" + a.name + ": θ = " + f(a.thetaDeg, 2) + "°, λ = " + f(a.lambdaNm, 1) + " nm";
    $("star-beta-feedback").textContent = "";
    $("star-solver-modal").hidden = false;
    var sb = document.querySelector("#star-solver-modal .modal-body");
    if (sb) sb.scrollTop = 0;
    var lines = Array.prototype.slice.call(document.querySelectorAll("#star-solver-modal .term-line")), serial = ++starRunSerial;
    $("star-manual").hidden = true; $("star-solver-skip").hidden = false;
    lines.forEach(function (line, i) {
      line.hidden = true; line.classList.remove("is-live");
      setTimeout(function () {
        if (serial !== starRunSerial) return;
        line.hidden = false; line.classList.add("is-live");
        if (line.classList.contains("term-err")) diagBurst({ kind: "fault", count: 2, at: document.querySelector("#star-solver-modal .modal-dialog") });
      }, 250 + 430 * i);
    });
    setTimeout(function () { if (serial === starRunSerial) finishStarRun(); }, 450 + 430 * lines.length);
    $("star-solver-skip").focus({preventScroll:true});
  });
  if ($("star-solver-close")) $("star-solver-close").addEventListener("click", function () { starRunSerial++; $("star-solver-modal").hidden = true; $("spec-record").focus(); });
  if ($("star-beta-input")) $("star-beta-input").addEventListener("keydown", function (event) {
    if (event.key === "Enter") { event.preventDefault(); $("star-beta-submit").click(); }
    if (event.key === "Escape") { event.preventDefault(); $("star-solver-close").click(); }
  });
  if ($("star-beta-submit")) $("star-beta-submit").addEventListener("click", function () {
    var b = S.starPicks.bow, a = S.starPicks.aft, raw = $("star-beta-input").value.trim(), value = Number(raw);
    if (!b || !a || !raw || !isFinite(value) || value <= 0 || value >= 1) {
      $("star-beta-feedback").textContent = "Enter a speed between 0 and 1.";
      sysAlert("Enter a dimensionless speed between 0 and 1.", { title: "SOLVER // BAD INPUT", code: "SL-700" });
      return;
    }
    var expected = (b.beta + a.beta) / 2;
    if (Math.abs(value - expected) > 0.03) {
      $("star-beta-feedback").textContent = "That speed does not match both spectra. Check the angles and wavelength ratios.";
      sysAlert("The entered speed does not reproduce both measured line shifts. Recheck the angles and wavelength ratios.", { title: "SOLVER // INPUT REJECTED", code: "SL-701" });
      return;
    }
    S.starBow = b.lambdaNm; S.starStern = a.lambdaNm; S.spectroSpeed = value;
    $("star-solver-modal").hidden = true;
    go("dock");
  });

  // ---- Station 3: ring radiators, shuttle launch ----
  function updateDockView() {
    var muon = S.recorded ? S.recorded.beta : null, star = S.spectroSpeed != null ? S.spectroSpeed : null;
    var shipText = "SHIP β · ";
    if (muon != null && star != null) shipText += f((muon + star) / 2, 4) + " adopted (muon " + f(muon, 3) + " / star " + f(star, 3) + ")";
    else if (muon != null) shipText += f(muon, 4) + " (muon)";
    else if (star != null) shipText += f(star, 4) + " (starlight)";
    else shipText += "awaiting";
    $("dock-telemetry-ship").textContent = shipText;
    $("dock-telemetry-platform").textContent = S.platformEst == null
      ? "COLONY w · pending"
      : "COLONY w " + (S.platformEst >= 0 ? "+" : "") + f(S.platformEst, 4) + "c";
    $("dock-telemetry-platform").className = "badge " + (S.platformEst == null ? "warn" : "ok");
    updateMissionLog();
    var gauge = $("p-dock-gauge");
    if (gauge) gauge.removeAttribute("hidden");
    // Once the probe is away, the programming form gives way to the flight gauge. This keeps the
    // courier workspace at one fixed height through launch, transit and return.
    if ($("s-dock")) $("s-dock").classList.toggle("launched", !!S.shuttleLaunched);
    drawDockGauge(gauge, S.dockAttempted ? S.shuttleMismatch : null, 0.015);
    if (sextantOn()) refreshSextantUI();
  }

  if ($("dock-to-courier")) $("dock-to-courier").addEventListener("click", function () {
    if (S.platformEst == null) return;
    go("courier");
  });

  if ($("rad-solve")) $("rad-solve").addEventListener("click", function () {
    if (!S.radiatorSelected) {
      $("r-rad").textContent = "Find and select the radiator source first.";
      sysAlert("No thermal source spectrum is loaded. Find the radiator and acquire its spectrum first.", { title: "COLONY // NO SOURCE", code: "CV-010" });
      return;
    }
    var lam = Number($("rad-nm").value);
    if (!(lam > SP.LAMBDA_MIN && lam < SP.LAMBDA_MAX)) {
      $("r-rad").textContent = "Enter the line's wavelength, read from the radiator spectrum, between " + SP.LAMBDA_MIN + " and " + SP.LAMBDA_MAX + " nm.";
      sysAlert("The line wavelength is outside the spectrograph range. Read the H-alpha centre from the acquired spectrum.", { title: "COLONY // BAD WAVELENGTH", code: "CV-021" });
      return;
    }
    var trueRadNm = SP.radiatorLineNm(m.beta, S.platformW, THERMAL[0].theta);
    if (Math.abs(lam - trueRadNm) > 15) {
      $("r-rad").textContent = "That wavelength is not on IR-1's narrow emission peak. Zoom in on the sharp spike above the curve and click its crest.";
      sysAlert("The entered wavelength does not match the radiator's narrow H-alpha emission peak. Zoom in on the sharp spike and click its tip.", { title: "COLONY // PEAK MISMATCH", code: "CV-022" });
      return;
    }
    var rawW = $("rad-w").value.trim(), proposedW = Number(rawW);
    if (!rawW || !isFinite(proposedW) || Math.abs(proposedW) >= 1) {
      $("r-rad").textContent = "Enter your calculated signed colony speed, with magnitude below c.";
      sysAlert("Enter the calculated signed colony speed with magnitude below c.", { title: "COLONY // BAD SPEED", code: "CV-030" });
      return;
    }
    var expectedW = SP.platformSpeedFromLine(shipBeta(), lam);
    if (Math.abs(proposedW - expectedW) > 0.02) {
      $("r-rad").textContent = "That speed does not match the wavelength and ship speed. Recheck the Doppler and velocity-addition relations.";
      sysAlert("The entered w does not reproduce the measured line and the ship speed. Recheck the Doppler and velocity-addition relations.", { title: "COLONY // SPEED MISMATCH", code: "CV-031" });
      return;
    }
    S.platformEst = proposedW; S.platformLineNm = lam;
    $("r-rad").textContent = "Colony speed verified: w = " + f(S.platformEst, 4) + "c. Use it to plan the courier's outbound and return velocities.";
    updateDockView();
  });
  if ($("rad-nm")) $("rad-nm").addEventListener("input", updateObjectives);
  if ($("rad-nm")) $("rad-nm").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && $("rad-solve")) $("rad-solve").click();
  });

  if ($("shuttle-calc-help")) $("shuttle-calc-help").addEventListener("click", function () {
    if (S.platformEst == null) {
      announce("Read the ring radiators first: the colony's speed is not known yet.");
      return;
    }
    var optU = P.launchVelocity(S.platformEst, shipBeta());
    $("shuttle-u").value = f(optU, 4);
    announce("Optimal relativistic launch velocity computed: " + f(optU, 4) + "c.");
  });
  if ($("shuttle-u")) $("shuttle-u").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && $("shuttle-launch")) $("shuttle-launch").click();
  });

  if ($("dock-solver-run")) $("dock-solver-run").addEventListener("click", function () {
    if (S.platformEst == null) {
      $("r-dock").textContent = "Acquire the radiator spectrum and calculate the colony speed first.";
      sysAlert("Rendezvous computer blocked: no verified colony speed. Acquire the thermal spectrum and verify w first.", { title: "NAV // NO COLONY SPEED", code: "NV-500" });
      return;
    }
    S.dockSolverFailed = true;
    runDiagnostics("dock");
    var fault = $("dock-solver-fault"); fault.hidden = false;
    fault.classList.remove("is-live"); void fault.offsetWidth; fault.classList.add("is-live");
    announce("Rendezvous solver failed. Calculate the shuttle speed manually.");
  });

  if ($("shuttle-launch")) $("shuttle-launch").addEventListener("click", function () {
    var uPrime = Number($("shuttle-u").value);
    var returnValue = $("return-u").value.trim(), returnSpeed = Number(returnValue);
    if (!S.dockSolverFailed) {
      $("r-dock").textContent = "Run the rendezvous computer first.";
      sysAlert("The rendezvous computer has not been queried. Run it, then program the manual solution.", { title: "NAV // SOLVER NOT RUN", code: "NV-501" });
      return;
    }
    if (S.platformEst == null || $("shuttle-u").value.trim() === "" || !isFinite(uPrime) || Math.abs(uPrime) >= 1) {
      $("r-dock").textContent = "Measure the radiator line and enter a signed launch velocity with magnitude below c.";
      sysAlert("Launch solution incomplete: enter a signed outbound velocity with magnitude below c.", { title: "COURIER // NO OUTBOUND", code: "CR-610" });
      return;
    }
    if (!returnValue || !isFinite(returnSpeed) || Math.abs(returnSpeed) >= 1) {
      $("r-dock").textContent = "Program a signed return velocity with magnitude below c before launch.";
      sysAlert("Return leg unprogrammed. Enter a signed return velocity before launch.", { title: "COURIER // NO RETURN", code: "CR-611" });
      return;
    }
    if (S.shuttleLaunched) return;
    runDiagnostics("launch");
    var res = SP.evaluateDocking(uPrime, m.beta, S.platformW, 0.015);
    var outcome = SP.dockOutcome(res.mismatch, res.tolSpeed);
    S.shuttleMismatch = res.mismatch;
    S.shuttleDocked = false;
    S.outcome = outcome;
    S.shuttleLaunched = true;
    S.dockAttempted = false;
    S.shuttlePos = 0; S.shuttleVel = uPrime; S.boomT = 0;
    S.returnLaunched = false; S.returnDocked = false; S.returnPos = 0; S.returnOutcome = null; S.returnMismatch = null;
    S.courierPhase = "out"; S.colonyClock = 0; S.holdT = 0; S.driftT = 0;
    $("dock-finish").disabled = true;

    drawDockGauge($("p-dock-gauge"), null, res.tolSpeed);
    $("r-dock").textContent = "Courier launched at u\u2032 = " + signed(uPrime, 4) + "c. The tracking camera follows it; docking and the return run automatically.";
    $("shuttle-launch").disabled = true;
    $("shuttle-u").disabled = true;
    $("return-u").disabled = true;
    updateDockView();
  });

  // Docking resolves on arrival (stepCourier); the button remains only as a manual trigger.
  $("dock-attempt").addEventListener("click", function () {
    if (S.shuttleLaunched && S.shuttlePos >= 1) resolveOutbound();
  });

  // Values the team measured or entered; never the hidden mission values.
  function adoptedBeta() {
    var b1 = S.recorded ? S.recorded.beta : null, b2 = S.spectroSpeed != null ? S.spectroSpeed : null;
    return b1 != null && b2 != null ? (b1 + b2) / 2 : (b1 != null ? b1 : b2);
  }
  if ($("dock-finish")) $("dock-finish").addEventListener("click", function () {
    var b1 = S.recorded ? S.recorded.beta : null, b2 = S.spectroSpeed, bA = adoptedBeta();
    var last = S.attempts[S.attempts.length - 1];
    $("r-summary-body").textContent = [
      "Mission code: " + code,
      "1. Muon bore: β = " + (b1 == null ? "not measured" : pm(b1, S.recorded.err)) + " (detector calibration " + ((S.recorded ? S.recorded.calibrated : S.cal) ? "stored" : "skipped") + ")",
      "2. Starlight Doppler: β = " + (b2 == null ? "not measured" : f(b2, 4)) + (b1 != null && b2 != null ? " (difference " + f(Math.abs(b1 - b2), 4) + ")" : ""),
      "Adopted ship speed: β = " + (bA == null ? "–" : f(bA, 4) + " (γ = " + f(gammaOf(bA), 3) + ")"),
      "3. Colony speed (station frame): w = " + (S.platformEst == null ? "–" : signed(S.platformEst, 4) + "c"),
      "4. Courier: docked on attempt " + S.attempts.length + "; outbound mismatch " + (last ? signed(last.outMismatch, 4) : "–") + "c, return mismatch " + (last && last.retMismatch != null ? signed(last.retMismatch, 4) : "–") + "c",
      "Replacement core installed."
    ].join("\n");
    go("summary");
  });

  function csvCell(v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function missionCsv() {
    var rows = [["section", "item", "quantity", "value", "uncertainty", "unit", "note"]];
    function row(sec, item, qty, val, err, unit, note) { rows.push([sec, item, qty, val, err, unit, note]); }
    function num(x, d) { if (x == null || !isFinite(x)) return ""; var t = f(x, d); return Number(t) === 0 ? f(0, d) : t; }
    row("mission", "", "mission code", code, "", "", "replay with ?code=" + code);
    row("mission", "", "exported", new Date().toISOString(), "", "", "");
    // Station 1: calibration and flight runs, section by section
    var cc = S.calCounts || S.calRun.counts, cal = S.cal;
    row("muon_calibration", "", "certified beam speed", "0.800", "", "c", "station accelerator");
    row("muon_calibration", "", "beam time", num(S.calSeconds || S.calRun.seconds, 0), "", "s", cal ? "stored" : "not stored");
    M.SECTIONS.forEach(function (x, k) {
      row("muon_calibration", "section " + (k + 1) + " (" + (x - 50) + "-" + (x + 50) + " m)", "decays", cc[k], num(Math.sqrt(cc[k]), 1), "count", "");
      if (cal) row("muon_calibration", "section " + (k + 1), "relative efficiency", num(cal.e[k], 4), num(cal.de[k], 4), "", k === 0 ? "reference section" : "");
    });
    if (S.calCounts && S.calRun.counts.some(function (v, k) { return v !== S.calCounts[k]; })) {
      row("muon_calibration_later", "", "beam time", num(S.calRun.seconds, 0), "", "s", "later cumulative run; stored calibration unchanged");
      M.SECTIONS.forEach(function (x, k) {
        row("muon_calibration_later", "section " + (k + 1) + " (" + (x - 50) + "-" + (x + 50) + " m)", "decays", S.calRun.counts[k], num(Math.sqrt(S.calRun.counts[k]), 1), "count", "");
      });
    }
    var recordedRun = S.recorded && S.recorded.counts;
    var n = recordedRun || S.flRun.counts, flightCal = recordedRun ? S.recorded.calibration : S.cal;
    var cor = M.corrected(n, flightCal), fit = n.reduce(function (a, b) { return a + b; }, 0) > 15 ? M.fitDecay(cor.n, cor.v) : null;
    row("muon_flight", "", "counting time", num(recordedRun ? S.recorded.seconds : S.flRun.seconds, 0), "", "s", (flightCal ? "efficiency-corrected" : "uncorrected") + (recordedRun ? "; at speed verification" : ""));
    M.SECTIONS.forEach(function (x, k) {
      row("muon_flight", "section " + (k + 1) + " (" + (x - 50) + "-" + (x + 50) + " m)", "decays", n[k], num(Math.sqrt(n[k]), 1), "count", "");
      if (flightCal) row("muon_flight", "section " + (k + 1), "corrected decays", num(cor.n[k], 1), num(Math.sqrt(cor.v[k]), 1), "count", "");
    });
    if (recordedRun && S.flRun.counts.some(function (v, k) { return v !== recordedRun[k]; })) {
      row("muon_flight_later", "", "counting time", num(S.flRun.seconds, 0), "", "s", "later cumulative run; recorded speed unchanged");
      M.SECTIONS.forEach(function (x, k) {
        row("muon_flight_later", "section " + (k + 1) + " (" + (x - 50) + "-" + (x + 50) + " m)", "decays", S.flRun.counts[k], num(Math.sqrt(S.flRun.counts[k]), 1), "count", "");
      });
    }
    if (fit && fit.ok) {
      row("muon_flight", "fit N(x) = N0 exp(-x/L)", "decay length L", num(fit.L, 1), num(fit.LErr, 1), "m", "");
      row("muon_flight", "fit N(x) = N0 exp(-x/L)", "N0", num(fit.N0, 1), "", "count", "");
    }
    row("muon_flight", "", "muon c tau0", num(P.MUON_CTAU, 2), "", "m", "PDG lifetime");
    row("muon_flight", "", "ship speed (team)", S.recorded ? num(S.recorded.beta, 4) : "", S.recorded ? num(S.recorded.err, 4) : "", "c", "from L = beta gamma c tau0");
    // Station 2: lamp calibration and starlight
    (S.lampLines || []).forEach(function (l) {
      row("spectrograph_lamp", l.name, "line pixel", num(l.pixel, 2), "", "pixel", "reference " + f(l.restNm, 2) + " nm");
      if (S.spectroCal) row("spectrograph_lamp", l.name, "calibrated wavelength", num(calNm(l.pixel), 2), "", "nm", "");
    });
    ["bow", "aft"].forEach(function (dir) {
      var p = S.starPicks[dir]; if (!p) return;
      row("starlight", p.name, "observed angle from bow", num(p.thetaDeg, 2), "", "deg", dir === "bow" ? "blue-shifted" : "red-shifted");
      row("starlight", p.name, "H-alpha observed", num(p.lambdaNm, 2), "", "nm", "rest 656.28 nm");
      row("starlight", p.name, "wavelength ratio", num(p.lambdaNm / 656.28, 5), "", "", "f = gamma (1 - beta cos theta)");
    });
    row("starlight", "", "ship speed (team)", num(S.spectroSpeed, 4), "", "c", "");
    var bA = adoptedBeta();
    if (S.recorded && S.spectroSpeed != null) row("comparison", "", "muon minus starlight", num(S.recorded.beta - S.spectroSpeed, 4), num(S.recorded.err, 4), "c", "");
    row("comparison", "", "adopted ship speed", num(bA, 4), "", "c", "mean of the two methods");
    row("comparison", "", "adopted gamma", bA == null ? "" : num(gammaOf(bA), 4), "", "", "");
    // Station 3: the colony and every courier attempt
    row("colony", "IR-1", "observed angle from bow", num(THERMAL[0].theta, 2), "", "deg", "radiator beacon");
    var currentLine = $("rad-nm").value.trim();
    row("colony", "IR-1", "H-alpha observed", S.platformLineNm == null ? currentLine : num(S.platformLineNm, 2), "", "nm", "rest 656.28 nm" + (S.platformLineNm == null ? "" : "; used for verified w"));
    if (S.platformLineNm != null && currentLine && Number(currentLine) !== S.platformLineNm) {
      row("colony", "IR-1", "H-alpha current field", currentLine, "", "nm", "changed after w was verified");
    }
    row("colony", "", "colony speed w (team; station frame)", num(S.platformEst, 4), "", "c", "verified");
    S.attempts.forEach(function (a) {
      var tag = "attempt " + a.n;
      row("courier", tag, "outbound u' (ship frame)", num(a.uOut, 4), "", "c", "");
      row("courier", tag, "return u'' (colony frame)", num(a.uRet, 4), "", "c", "");
      row("courier", tag, "outbound arrival mismatch", num(a.outMismatch, 4), "", "c", a.outOutcome);
      row("courier", tag, "return arrival mismatch", num(a.retMismatch, 4), "", "c", a.retOutcome);
    });
    row("courier", "", "docking tolerance", "0.015", "", "c", "");
    row("courier", "", "core recovered", S.returnDocked ? "yes" : "no", "", "", "");
    // Recorded spectra, wavelength-calibrated where the lamp calibration is stored
    function spectrum(name, flux) {
      if (!flux) return;
      Array.prototype.forEach.call(flux, function (v, i) {
        row("spectrum", name, "flux", f(v, 5), "", "", "pixel " + i + ", " + (S.spectroCal ? f(calNm(i), 2) + " nm" : f(SP.pixelToNmNominal(i), 2) + " nm uncalibrated"));
      });
    }
    if (S.lamp) spectrum("hydrogen lamp", S.lamp.flux);
    ["bow", "aft"].forEach(function (dir) { var p = S.starPicks[dir]; if (p) spectrum(p.name, p.flux); });
    spectrum("IR-1 radiator", S.radiatorFlux);
    return rows.map(function (r) { return r.map(csvCell).join(","); }).join("\n") + "\n";
  }
  if ($("btn-export-all")) $("btn-export-all").addEventListener("click", function () {
    download("dead-reckoning-" + code + ".csv", missionCsv());
  });
  if (typeof window !== "undefined") window.DR_CSV = missionCsv;

  if ($("btn-restart")) $("btn-restart").addEventListener("click", function () {
    location.href = location.pathname;
  });

  // ---- Station 3: courier run in the ship frame ----
  // Scene layout (compressed): the colony's dock face meets the probe at x = MEET_X on a track offset
  // (Y, Z) from the flight axis. Progress is counted in "p-units": the colony covers K scene units per p-unit,
  // which stands for its true ship-frame speed |v|. Every other velocity is scaled the same way, so speed
  // ratios (and the gamma factors drawn from them) are exact.
  var CR = { K: 330, MEET_X: 110, Y: 14, Z: -45, RATE: 0.11, HOLD: 0.35, LIFT: 0.06, RET_END: 0.88, DRIFT_S: 2.4, BOOM_S: 2.6 };
  var CR_TMP = T ? new T.Vector3() : null;
  function colonyV() { return m.colonyV; }
  function colonyDock(c) { return new T.Vector3(CR.MEET_X + CR.K * (1 - c), CR.Y, CR.Z); }
  function colonyCentre(c) { var d = colonyDock(c); d.x += 48.5 / P.gamma(colonyV()); return d; }
  function bayPoint(lift) { return new T.Vector3(ICE_END - 1.48 * LH_SCALE, 0.95 * LH_SCALE + (lift || 0), 0.24 * LH_SCALE); }
  // Cubic Hermite path from P0 (tangent T0) to P1 (tangent T1); derivatives are per unit of u.
  function hermite(P0, T0, P1, T1, u) {
    var u2 = u * u, u3 = u2 * u;
    var pos = new T.Vector3()
      .addScaledVector(P0, 2 * u3 - 3 * u2 + 1).addScaledVector(T0, u3 - 2 * u2 + u)
      .addScaledVector(P1, -2 * u3 + 3 * u2).addScaledVector(T1, u3 - u2);
    var vel = new T.Vector3()
      .addScaledVector(P0, 6 * u2 - 6 * u).addScaledVector(T0, 3 * u2 - 4 * u + 1)
      .addScaledVector(P1, -6 * u2 + 6 * u).addScaledVector(T1, 3 * u2 - 2 * u);
    var acc = new T.Vector3()
      .addScaledVector(P0, 12 * u - 6).addScaledVector(T0, 6 * u - 4)
      .addScaledVector(P1, -12 * u + 6).addScaledVector(T1, 6 * u - 2);
    return { pos: pos, vel: vel, acc: acc };
  }
  // Scene velocity per p-unit to a velocity in units of c.
  function toBeta(vScene) { return vScene.multiplyScalar(Math.abs(colonyV()) / CR.K); }
  function sceneVx(beta) { return CR.K * beta / Math.abs(colonyV()); }
  // Outbound probe: lifts from the bay, arcs cleanly above & port of Long Patience's ice prow,
  // then flies to the colony's dock, arriving with its programmed ship-frame velocity u'.
  function probeOut(p, driftT) {
    var top = bayPoint(1.5), endV = sceneVx(S.shuttleVel), span = 1 - CR.LIFT;
    if (driftT > 0) {
      var dp = driftT * CR.RATE, end = colonyDock(1);
      return { pos: end.add(new T.Vector3(endV * dp, 0, 0)), vel: new T.Vector3(S.shuttleVel, 0, 0), acc: null };
    }
    if (p < CR.LIFT) {
      var lift = p / CR.LIFT, liftFraction = lift * lift * (3 - 2 * lift);
      return { pos: bayPoint(1.5 * liftFraction),
        vel: toBeta(new T.Vector3(0, 1.5 * 6 * lift * (1 - lift) / CR.LIFT, 0)),
        acc: new T.Vector3(0, 1 - 2 * lift, 0) };
    }
    var launchTangent = new T.Vector3(0, 18, -14);
    var h = hermite(top, launchTangent, colonyDock(1), new T.Vector3(endV * span, 0, 0), (p - CR.LIFT) / span);
    return { pos: h.pos, vel: toBeta(h.vel.multiplyScalar(1 / span)), acc: h.acc };
  }
  // Return courier: leaves the dock at the colony's velocity, arcs clear of both hulls, and
  // arrives at the bay with ship-frame velocity equal to its arrival mismatch, then settles.
  function probeBack(r, driftT) {
    var span = CR.RET_END, top = bayPoint(1.5), endV = sceneVx(S.returnMismatch || 0);
    if (driftT > 0) {
      var dp = driftT * CR.RATE;
      return { pos: top.add(new T.Vector3(endV * dp, 0, 0)), vel: new T.Vector3(S.returnMismatch || 0, 0, 0), acc: null };
    }
    if (r >= span) {
      var settle = (r - span) / (1 - span), settleFraction = settle * settle * (3 - 2 * settle);
      return { pos: new T.Vector3().lerpVectors(top, bayPoint(0), settleFraction),
        vel: toBeta(new T.Vector3(0, -1.5 * 6 * settle * (1 - settle) / (1 - span), 0)),
        acc: new T.Vector3(0, 2 * settle - 1, 0) };
    }
    var start = colonyDock(S.retClock0);
    var approachTangent = new T.Vector3(endV * span, -14, 10);
    var h = hermite(start, new T.Vector3(-CR.K * span, 0, 0), top, approachTangent, r / span);
    return { pos: h.pos, vel: toBeta(h.vel.multiplyScalar(1 / span)), acc: h.acc };
  }
  // Relativistic kinetic energy for a 250-ton (2.5e5 kg) courier probe: E_k = (gamma - 1) m c^2.
  var PROBE_MASS_KG = 250000;
  var C_LIGHT = 2.998e8;
  var J_PER_GT_TNT = 4.184e18;
  function formatRelativisticImpact(dvBeta) {
    var b = Math.min(0.999999, Math.abs(dvBeta || 0));
    var g = P.gamma(b);
    var ek = (g - 1) * PROBE_MASS_KG * C_LIGHT * C_LIGHT;
    var gt = ek / J_PER_GT_TNT;
    var exp = ek > 0 ? Math.floor(Math.log10(ek)) : 0;
    var mant = ek > 0 ? (ek / Math.pow(10, exp)).toFixed(1) : "0.0";
    var gtStr = gt >= 10 ? f(gt, 0) + " Gt" : gt >= 0.1 ? f(gt, 1) + " Gt" : f(gt * 1000, 0) + " Mt";
    return { ek: ek, gt: gt, scale: clamp(Math.log10(Math.max(1e17, ek) / 1e17), 0.8, 3.6),
      text: "250-ton probe impact at \u0394v = " + f(b, 3) + "c (\u03b3 = " + f(g, 4) + ", E_k = " + mant + "\u00d710^" + exp + " J \u2248 " + gtStr + " TNT)" };
  }
  // Check whether a probe position clips through Long Patience's hull or the colony cylinder.
  function checkHullClip(pos, phase, prog) {
    if (!pos) return null;
    // Long Patience envelope (skip initial lift & final settle right at the bay)
    var checkShip = (phase === "out" && prog > 0.14) || (phase === "ret" && prog < CR.RET_END * 0.90) || phase === "drift" || phase === "rdrift";
    if (checkShip && pos.x >= STERN - 1.5 && pos.x <= BOW + 1.0) {
      var rShip = Math.hypot(pos.y, pos.z);
      var hullR = pos.x > ICE_END ? Math.max(0.4, 2.2 * (1 - (pos.x - ICE_END) / Math.max(1, BOW - ICE_END))) : 2.6;
      if (rShip < hullR) return "Long Patience hull";
    }
    // Nova Archimedes cylinder envelope (skip exact dock face)
    var checkCol = (phase === "out" && prog < 0.96) || (phase === "ret" && prog > 0.08) || phase === "drift" || phase === "rdrift";
    if (checkCol) {
      var dock = colonyDock(S.colonyClock);
      var colLen = 97 / P.gamma(colonyV());
      if (pos.x >= dock.x + 2.5 && pos.x <= dock.x + colLen) {
        var rCol = Math.hypot(pos.y - CR.Y, pos.z - CR.Z);
        if (rCol < 11.5) return "Nova Archimedes hull";
      }
    }
    return null;
  }
  // Place a craft: nose along its thrust (acceleration), plume behind, and the whole craft contracted by
  // 1/gamma along its ship-frame velocity: M = Translate * Contract * Rotate * Scale.
  var X_AXIS = T ? new T.Vector3(1, 0, 0) : null;
  function placeCraft(g, pos, betaVec, acc, plumeMat, plume) {
    if (!g) return;
    var q = new T.Quaternion();
    var aim = acc && acc.lengthSq() > 1e-6 ? acc.clone().normalize() : (betaVec && betaVec.lengthSq() > 1e-8 ? betaVec.clone().normalize() : X_AXIS);
    q.setFromUnitVectors(X_AXIS, aim);
    var rs = new T.Matrix4().compose(new T.Vector3(), q, new T.Vector3(0.35, 0.35, 0.35));
    var b = betaVec ? Math.min(1 - Number.EPSILON, betaVec.length()) : 0, C = new T.Matrix4();
    if (b > 1e-4) {
      var n = betaVec.clone().normalize(), k = 1 - 1 / P.gamma(b);
      C.set(1 - k * n.x * n.x, -k * n.x * n.y, -k * n.x * n.z, 0,
        -k * n.y * n.x, 1 - k * n.y * n.y, -k * n.y * n.z, 0,
        -k * n.z * n.x, -k * n.z * n.y, 1 - k * n.z * n.z, 0,
        0, 0, 0, 1);
    }
    g.matrixAutoUpdate = false;
    g.matrix.multiplyMatrices(C, rs).setPosition(pos);
    g.matrixWorldNeedsUpdate = true;
    if (plumeMat) { plumeMat.level.value = plume; plumeMat.glow.opacity = plume * 0.8; }
    g.userData.beta = b;
  }
  // The colony's look in the ship frame. Its hull is lit by sunlike lamps (5,800 K), so reflected light takes
  // the Doppler tint of a 5,800 D kelvin blackbody. The radiator rings shine in H-alpha and the nav lights at
  // 630 nm; both lines are shifted to lambda / D, and may leave the visible band entirely.
  var colonyTint = { mats: [], count: -1 };
  function tintColony(D) {
    var meshes = [];
    G.colony.traverse(function (o) { if (o.isMesh && o.material) meshes.push(o); });
    if (meshes.length !== colonyTint.count) {
      colonyTint.mats = [];
      meshes.forEach(function (o) {
        if (!o.userData.tintOwn) { o.material = o.material.clone(); o.userData.tintOwn = true; o.userData.base = o.material.color ? o.material.color.clone() : null; }
        colonyTint.mats.push(o);
      });
      colonyTint.count = meshes.length;
    }
    // Beaming brightens an approaching source steeply; the gain is compressed so the hue is not clipped.
    var hull = dopplerTint(SUN_K, D), gain = clamp(Math.pow(D, 0.25), 0.7, 1.25);
    var rad = waveRGB(656.28 / D), nav = waveRGB(630 / D);
    var radRings = G.colonyData.radRings || [], navs = G.colonyData.navs || [];
    colonyTint.mats.forEach(function (o) {
      var base = o.userData.base; if (!base) return;
      var line = radRings.indexOf(o) >= 0 ? rad : navs.indexOf(o) >= 0 ? nav : null;
      if (line) o.material.color.setRGB(line[0], line[1], line[2]);
      else o.material.color.setRGB(base.r * hull[0] * gain, base.g * hull[1] * gain, base.b * hull[2] * gain);
    });
  }
  // Courier phases: rails, out, hold, ret, home; failures: drift (missed colony), boom (struck colony),
  // rdrift (return missed the ship). Every failure rolls back to the courier plan.
  function stepCourier(dt) {
    var ph = S.courierPhase, adv = dt * CR.RATE;
    if (ph === "rails") { S.colonyClock = 0; return; }
    if (ph === "home") { if (S.colonyClock < 4) S.colonyClock += adv; return; }
    S.colonyClock += adv;
    if (ph === "out") {
      S.shuttlePos = Math.min(1, S.shuttlePos + adv);
      S.colonyClock = S.shuttlePos;
      var clipOut = checkHullClip(probeOut(S.shuttlePos, 0).pos, "out", S.shuttlePos);
      if (clipOut) {
        S.boomPos = probeOut(S.shuttlePos, 0).pos.clone();
        S.boomReason = "The outbound courier clipped the " + clipOut + " (" + formatRelativisticImpact(S.shuttleVel).text + ").";
        S.boomScale = formatRelativisticImpact(S.shuttleVel).scale;
        S.courierPhase = "boom"; S.boomT = 0; return;
      }
      if (S.shuttlePos >= 1) resolveOutbound();
    } else if (ph === "hold") {
      S.holdT += adv;
      if (S.holdT >= CR.HOLD) launchReturn();
    } else if (ph === "ret") {
      S.returnPos = Math.min(1, S.returnPos + adv);
      var clipRet = checkHullClip(probeBack(S.returnPos, 0).pos, "ret", S.returnPos);
      if (clipRet) {
        S.boomPos = probeBack(S.returnPos, 0).pos.clone();
        S.boomReason = "The return courier clipped the " + clipRet + " (" + formatRelativisticImpact(S.returnVel).text + ").";
        S.boomScale = formatRelativisticImpact(S.returnVel).scale;
        S.courierPhase = "boom"; S.boomT = 0; return;
      }
      if (S.returnOutcome === "boom" && S.returnPos >= CR.RET_END) {
        S.boomPos = bayPoint(0);
        S.boomReason = "The return courier struck Long Patience's bay " + f(Math.abs(S.returnMismatch), 3) + "c too fast (" + formatRelativisticImpact(S.returnMismatch).text + ").";
        S.boomScale = formatRelativisticImpact(S.returnMismatch).scale;
        S.courierPhase = "boom"; S.boomT = 0; return;
      }
      if (S.returnOutcome !== "docked" && S.returnPos >= CR.RET_END) { S.courierPhase = "rdrift"; S.driftT = 0; }
      else if (S.returnPos >= 1) returnHome();
    } else if (ph === "drift" || ph === "rdrift") {
      S.driftT += dt;
      if (S.driftT >= CR.DRIFT_S) courierFailed(ph === "drift"
        ? "The courier reached the colony moving " + f(Math.abs(S.shuttleMismatch), 3) + "c too slowly in the colony frame and drifted away from the dock."
        : "The return courier reached Long Patience with a " + (S.returnMismatch >= 0 ? "+" : "") + f(S.returnMismatch, 3) + "c mismatch and could not dock. The core was not recovered.");
    } else if (ph === "boom") {
      S.boomT += dt;
      if (S.boomT >= CR.BOOM_S) courierFailed(S.boomReason || ("The courier struck the colony's dock " + f(Math.abs(S.shuttleMismatch), 3) + "c too fast (" + formatRelativisticImpact(S.shuttleMismatch).text + ")."));
    }
  }
  function resolveOutbound() {
    if (S.dockAttempted) return;
    S.dockAttempted = true;
    drawDockGauge($("p-dock-gauge"), S.shuttleMismatch, 0.015);
    if (S.outcome === "docked") {
      S.shuttleDocked = true; S.courierPhase = "hold"; S.holdT = 0;
      $("r-dock").textContent = "DOCKED at Nova Archimedes (arrival mismatch " + signed(S.shuttleMismatch, 4) + "c). Exchanging cargo; the return courier launches next.";
      announce("Courier docked at the colony.");
    } else if (S.outcome === "boom") {
      var imp = formatRelativisticImpact(S.shuttleMismatch);
      S.boomPos = null; S.boomScale = imp.scale;
      S.boomReason = "The courier struck the colony's dock " + f(Math.abs(S.shuttleMismatch), 3) + "c too fast (" + imp.text + ").";
      S.courierPhase = "boom"; S.boomT = 0;
      $("r-dock").textContent = "COLLISION: " + imp.text + ".";
    } else {
      S.courierPhase = "drift"; S.driftT = 0;
      $("r-dock").textContent = "MISSED: arrival mismatch " + signed(S.shuttleMismatch, 4) + "c.";
    }
  }
  function launchReturn() {
    var u = Number($("return-u").value);
    S.returnVel = u;
    S.returnMismatch = P.relativeVelocity(P.addVelocities(u, S.platformW), m.beta);
    S.returnOutcome = Math.abs(S.returnMismatch) <= 0.015 ? "docked" : (S.returnMismatch > 0.015 ? "boom" : "missed");
    S.returnLaunched = true; S.returnPos = 0; S.returnDocked = false; S.retClock0 = S.colonyClock;
    S.courierPhase = "ret";
    var inStat = $("inbound-status");
    if (inStat) { inStat.textContent = "Return courier underway with the core"; inStat.className = "badge warn"; }
    $("r-dock").textContent = "Return courier launched with the replacement core at u″ = " + signed(u, 4) + "c (colony frame).";
    announce("Return courier launched with the replacement core.");
  }
  function returnHome() {
    S.returnLaunched = false; S.returnDocked = true; S.courierPhase = "home";
    logAttempt();
    var inStat = $("inbound-status");
    if (inStat) { inStat.textContent = "Core aboard · ready to install"; inStat.className = "badge ok"; }
    $("dock-finish").disabled = false;
    $("r-dock").textContent = "Return docked (arrival mismatch " + signed(S.returnMismatch, 4) + "c). The core is aboard.";
    updateObjectives();
  }
  function logAttempt() {
    S.attempts.push({
      n: S.attempts.length + 1,
      uOut: S.shuttleVel, uRet: Number($("return-u").value),
      outMismatch: S.shuttleMismatch, outOutcome: S.outcome,
      retMismatch: S.returnOutcome ? S.returnMismatch : null, retOutcome: S.returnOutcome || (S.outcome === "docked" ? "pending" : "not launched")
    });
  }
  // A failed exchange does not end the expedition: mission control restores the last save point, the
  // courier plan, with the measured ship and colony speeds kept.
  function courierFailed(reason) {
    if (S.courierPhase === "failed") return;
    logAttempt();
    S.courierPhase = "failed";
    coachClear();
    $("s-dock").hidden = true;
    $("mission-lost-reason").textContent = reason;
    $("s-mission-lost").hidden = false;
    $("mission-reload").focus();
  }
  function resetCourier() {
    S.shuttleLaunched = false; S.shuttleDocked = false; S.dockAttempted = false; S.shuttleMismatch = null; S.outcome = null;
    S.boomT = 0; S.shuttlePos = 0; S.holdT = 0; S.driftT = 0; S.colonyClock = 0; S.courierPhase = "rails";
    S.returnLaunched = false; S.returnDocked = false; S.returnPos = 0; S.returnOutcome = null; S.returnMismatch = null;
    $("shuttle-launch").disabled = false; $("return-u").disabled = false; $("shuttle-u").disabled = false;
    $("dock-finish").disabled = true;
    var inStat = $("inbound-status");
    if (inStat) { inStat.textContent = "Courier on launch rails"; inStat.className = "badge ok"; }
    drawDockGauge($("p-dock-gauge"), null, 0.015);
  }
  function signed(x, d) { var t = f(x, d); return Number(t) === 0 ? f(0, d) : (x > 0 ? "+" : "") + t; }
  // Chase camera: behind the outbound probe looking toward the colony, wide on the colony at the dock,
  // then behind the return courier looking back at the ship. Null hands back the station's orbit camera.
  function courierCamTarget() {
    var ph = S.courierPhase, p;
    if (ph === "out") {
      // Follow the courier closely, then widen toward the dock as it approaches.
      p = probeOut(S.shuttlePos, 0).pos;
      var dk = colonyDock(S.colonyClock), gap = p.distanceTo(dk);
      var nearDock = clamp(1 - gap / 95, 0, 1);
      p.lerp(dk, 0.2 * nearDock);
      return [p.x, p.y, p.z, -0.8, 0.22, 20 + 22 * nearDock];
    }
    if (ph === "boom") { p = colonyDock(S.colonyClock); return [p.x, p.y, p.z, -0.45, 0.25, 38]; }
    if (ph === "hold" || ph === "drift") { p = colonyCentre(S.colonyClock); return [p.x, p.y, p.z, -0.35, 0.22, 120]; }
    if (ph === "ret" || ph === "rdrift") {
      p = probeBack(S.returnPos, ph === "rdrift" ? S.driftT : 0).pos;
      var bay = bayPoint(1.5), gapB = p.distanceTo(bay);
      var nearBay = clamp(1 - gapB / 95, 0, 1);
      p.lerp(bay, 0.2 * nearBay);
      return [p.x, p.y, p.z, 0.8, 0.22, 20 + 22 * nearBay];
    }
    return null;
  }
  // Tracking readout over the 3D view. The numbers that would give away u' appear only after a docking.
  function updateTrackHud(cv, cg, D) {
    var hud = $("track-hud"); if (!hud) return;
    var ph = S.courierPhase, flying = ph !== "rails" && ph !== "failed" && ph !== "home";
    hud.hidden = !flying;
    if (!flying) return;
    var lines = ["SHIP-FRAME MAP · simultaneous positions · distance and time compressed"];
    var colour = D > 1.005 ? "blue-shifted" : D < 0.995 ? "red-shifted" : "unshifted";
    if (S.shuttleDocked) {
      lines.push("Colony ship v = " + signed(cv, 3) + "c · γ = " + f(cg, 3) + " · length and wheel rate ×" + f(1 / cg, 3));
      var craft = ph === "ret" || ph === "rdrift" ? G.returnShuttle : G.shuttle;
      lines.push("Doppler to camera D = " + f(D, 2) + " (" + colour + ")" + (craft && craft.userData.beta > 0.001 ? " · courier |β| = " + f(craft.userData.beta, 3) : ""));
    } else {
      lines.push("Colony ship contracted along its motion; colour " + colour + " (D = " + f(D, 2) + ")");
    }
    hud.textContent = lines.join("\n");
  }
  if (typeof window !== "undefined") window.DR_COURIER = { CR: CR, probeOut: probeOut, probeBack: probeBack, colonyDock: colonyDock, colonyCentre: colonyCentre };
  if ($("mission-reload")) $("mission-reload").addEventListener("click", function () {
    $("s-mission-lost").hidden = true;
    resetCourier();
    go("courier");
    $("r-dock").textContent = "Rolled back to the courier plan (attempt " + (S.attempts.length + 1) + "). Recheck the signs and frames of u′ and u″, then launch again.";
  });

  // Essential scene motion stays enabled; instructional tips still pause demonstrations.


  // ---- animation ----
  function spawn(fresh, beta, cap) {
    var total = 0, k;
    for (k = 0; k < fresh.length; k++) total += fresh[k];
    if (!G || !S.motion) return;
    var show = Math.min(total, cap);
    for (var s = 0; s < show; s++) {
      var pick = Math.floor(Math.random() * total);
      for (k = 0; k < fresh.length && pick >= fresh[k]; k++) pick -= fresh[k];
      var ev = G.events[G.evNext]; G.evNext = (G.evNext + 1) % G.events.length;
      ev.life = 1;
      var secX = xAt((k + Math.random()) * M.WIDTH);
      // Decay point sits inside the ice, near the bore; the flash is sized to the local ice radius
      var ang = Math.random() * 2 * Math.PI, Rl = iceR(secX);
      var rIce = (0.15 + 0.3 * Math.random()) * Rl;
      ev.x = secX;
      ev.y = rIce * Math.cos(ang);
      ev.z = rIce * Math.sin(ang);
      ev.s = 0.35 * Rl;
      // The electron leaves isotropically in the muon frame at nearly c; in the ship frame its direction is
      // aberrated toward the muon's motion (aft): cos = (cos' + beta)/(1 + beta cos'). The Cherenkov cone opens
      // around that direction.
      var cp = 2 * Math.random() - 1, ph = 2 * Math.PI * Math.random();
      var cl = (cp + beta) / (1 + beta * cp), sl = Math.sqrt(Math.max(0, 1 - cl * cl));
      G.dir.set(-cl, sl * Math.cos(ph), sl * Math.sin(ph)).normalize();
      ev.q.setFromUnitVectors(G.down, G.dir);
      G.secGlow[k] = Math.min(1.2, G.secGlow[k] + 0.25);
      // The module nearest the flash's angle, in the ring of its section, lights up
      var perRing = G.domGlow.length / M.SECTIONS.length, jHit = Math.round(ang / (2 * Math.PI / perRing)) % perRing;
      G.domGlow[k * perRing + jHit] = Math.min(1.2, G.domGlow[k * perRing + jHit] + 1);
    }
  }

  function stepEvents(dt) {
    var vp = G.vgeo.attributes.position.array, vc = G.vgeo.attributes.color.array;
    G.events.forEach(function (ev, i) {
      if (ev.life > 0) ev.life = Math.max(0, ev.life - dt / 0.55);
      var l = ev.life, grow = 0.25 + 0.75 * Math.sqrt(1 - l);
      G.v.set(ev.x, ev.y, ev.z);
      if (l > 0) {
        G.s.set(grow * ev.s, grow * ev.s, grow * ev.s);
        G.m4.compose(G.v, ev.q, G.s);
        G.cones.setMatrixAt(i, G.m4);
        if (G.innerCones) G.innerCones.setMatrixAt(i, G.m4);

        // Volumetric halo scales with ice scatter
        if (G.halos) {
          var hs = grow * ev.s * 1.4;
          G.s.set(hs, hs, hs);
          G.m4.compose(G.v, ev.q, G.s);
          G.halos.setMatrixAt(i, G.m4);
        }

        var a = Math.pow(l, 1.5);
        // Outer Frank-Tamm Cherenkov cone: electric cerulean/violet
        G.cones.setColorAt(i, G.c.setRGB(0.12 * a, 0.48 * a, 1.35 * a));
        // Inner shock core: high-intensity cyan-white
        if (G.innerCones) G.innerCones.setColorAt(i, G.c.setRGB(0.38 * a, 0.88 * a, 1.5 * a));
        // Diffuse volumetric halo in frosted ice: deep sapphire glow
        if (G.halos) G.halos.setColorAt(i, G.c.setRGB(0.05 * a, 0.25 * a, 0.70 * a));

        vp[3 * i] = ev.x; vp[3 * i + 1] = ev.y; vp[3 * i + 2] = ev.z;
        var fl = Math.pow(l, 2.5);
        // Brilliant vertex core flash
        vc[3 * i] = 0.9 * fl; vc[3 * i + 1] = 1.6 * fl; vc[3 * i + 2] = 2.5 * fl;
      } else {
        G.s.set(0.001, 0.001, 0.001);
        G.m4.compose(G.v, ev.q, G.s);
        G.cones.setMatrixAt(i, G.m4);
        if (G.innerCones) G.innerCones.setMatrixAt(i, G.m4);
        if (G.halos) G.halos.setMatrixAt(i, G.m4);
        vc[3 * i] = 0; vc[3 * i + 1] = 0; vc[3 * i + 2] = 0;
      }
    });
    G.cones.instanceMatrix.needsUpdate = true; G.cones.instanceColor.needsUpdate = true;
    if (G.innerCones) { G.innerCones.instanceMatrix.needsUpdate = true; G.innerCones.instanceColor.needsUpdate = true; }
    if (G.halos) { G.halos.instanceMatrix.needsUpdate = true; G.halos.instanceColor.needsUpdate = true; }
    G.vgeo.attributes.position.needsUpdate = true; G.vgeo.attributes.color.needsUpdate = true;

    // Modules glow where a flash lands: idle glass, warm white on a hit, fading back
    var dc = G.doms, ND = G.domGlow.length;
    for (var q = 0; q < ND; q++) {
      G.domGlow[q] *= Math.exp(-dt * 4);
      var hot = Math.min(1, G.domGlow[q]);
      dc.setColorAt(q, G.c.setRGB(0.20 + 0.80 * hot, 0.38 + 0.62 * hot, 0.50 + 0.50 * hot));
    }
    dc.instanceColor.needsUpdate = true;
    for (var k2 = 0; k2 < M.SECTIONS.length; k2++) G.secGlow[k2] *= Math.exp(-dt * 4);
  }

  function dustRadiusAt(rDrift, localX) {
    var lx = Math.max(ICE_END, Math.min(BOW, localX));
    var u = Math.max(0, Math.min(1, (lx - 5.0) / (BOW - 5.0)));
    var tipSurface = iceR(lx) * (1.0 - 0.86 * Math.pow(u, 4.5));
    var aftProgress = Math.max(0, (BOW - localX) / (BOW - ICE_END));
    return tipSurface + 0.12 + rDrift * aftProgress;
  }
  function stepDust(dt, streaming, speed) {
    var a = G.dustGeo.attributes.position.array, v = streaming && S.motion ? 28 + 48 * speed : 0, len = 0.36;
    var sx = (G.ship && G.ship.position) ? G.ship.position.x : 0;
    var ss = (G.ship && G.ship.scale && G.ship.scale.x) ? G.ship.scale.x : 1;
    var bowWorld = sx + BOW * ss;
    G.dustLines.visible = !!streaming;
    G.dust.forEach(function (p, i) {
      p.x -= v * dt;
      if (p.x < sx + (ICE_END - 26) * ss || p.x > bowWorld) {
        p.x = sx + (BOW - Math.random() * 2.5) * ss;
        p.r0 = 0.08 + Math.random() * 0.55;
        var ang = Math.random() * Math.PI * 2;
        p.ny = Math.cos(ang);
        p.nz = Math.sin(ang);
      }
      var headX = Math.min(bowWorld, p.x);
      var rHead = dustRadiusAt(p.r0, (headX - sx) / ss);
      var tailX = Math.min(bowWorld, headX + len);
      var rTail = dustRadiusAt(p.r0, (tailX - sx) / ss);
      a[6 * i] = headX; a[6 * i + 1] = p.ny * rHead; a[6 * i + 2] = p.nz * rHead;
      a[6 * i + 3] = tailX; a[6 * i + 4] = p.ny * rTail; a[6 * i + 5] = p.nz * rTail;
    });
    G.dustGeo.attributes.position.needsUpdate = true;
  }

  function stepSpall(dt, streaming, speed) {
    if (!G.spallGeo || !G.spallStreaks) return;
    var pos = G.spallGeo.attributes.position.array;
    var col = G.spallGeo.attributes.color.array;
    var streaks = G.spallStreaks;

    if (!streaming || !S.motion || speed <= 0.05) {
      var cleared = false;
      for (var ci = 0; ci < streaks.length; ci++) {
        if (streaks[ci].active) {
          streaks[ci].active = false;
          cleared = true;
          for (var k = 0; k < 6; k++) {
            pos[6 * ci + k] = 0;
            col[6 * ci + k] = 0;
          }
        }
      }
      if (cleared) {
        G.spallGeo.attributes.position.needsUpdate = true;
        G.spallGeo.attributes.color.needsUpdate = true;
      }
      return;
    }

    G.spallTimer = (G.spallTimer || 0) + dt;

    // Subtle, intermittent micro-spallation bursts (occasional cosmic dust graze)
    // 3.6s cycle with short 0.45s burst windows; sparse calm in between
    var cycle = G.spallTimer % 3.6;
    var isBurst = (cycle < 0.45) || (cycle > 1.9 && cycle < 2.35);
    var spawnRate = isBurst ? 0.35 : 0.025; // per available streak per second
    var speedMult = Math.max(0.35, speed / 0.85);

    function spawnStreak(s) {
      // Use the actual sculpted mesh, in ship coordinates, as the detachment point, lifted clear outside the ice cone.
      var point = G.iceSurfacePoints[Math.floor(Math.random() * G.iceSurfacePoints.length)];
      if (!point) return;
      var r = Math.hypot(point[1], point[2]);
      var radialScale = r > 1e-4 ? (r + 0.18) / r : 1;
      s.spawnX = s.x = point[0];
      s.y = point[1] * radialScale;
      s.z = point[2] * radialScale;
      // Follow the widening shield as the fragment drifts aft.
      var vr = 2.1 + Math.random() * 0.7;
      s.vy = point[1] / r * vr;
      s.vz = point[2] / r * vr;
      // Controlled, readable velocity flowing aft along the boundary layer
      s.vx = -(14 + Math.random() * 14) * speedMult;
      s.maxLen = (0.7 + Math.random() * 0.9) * speedMult;
      s.life = 0;
      s.maxLife = 0.45 + Math.random() * 0.35;
      s.active = true;
    }

    for (var i = 0; i < streaks.length; i++) {
      var s = streaks[i];
      if (!s.active) {
        if (Math.random() < 1 - Math.exp(-spawnRate * dt)) spawnStreak(s);
      } else {
        s.life += dt;
        if (s.life >= s.maxLife || s.x < -80) {
          s.active = false;
          for (var k = 0; k < 6; k++) {
            pos[6 * i + k] = 0;
            col[6 * i + k] = 0;
          }
          continue;
        }

        // Gentle slipstream acceleration aft; keep streaks outside the widening ice envelope.
        s.vx -= 24 * dt * speedMult;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.z += s.vz * dt;
        var sr = Math.hypot(s.y, s.z);
        var minSpallR = iceR(Math.max(ICE_END, Math.min(BOW, s.x))) + 0.20;
        if (sr < minSpallR && sr > 1e-4) {
          var push = minSpallR / sr;
          s.y *= push;
          s.z *= push;
        }

        var prog = s.life / s.maxLife;
        // Fade in smoothly at spawn so it doesn't pop in, fade out as it flies aft
        var alpha = prog < 0.12 ? (prog / 0.12) : Math.pow(1 - prog, 1.6);

        // Ensure streak tail never projects in front of the detachment point on the ice!
        var curLen = Math.min(s.maxLen, Math.max(0, s.spawnX - s.x));
        var tailX = Math.min(s.spawnX, s.x + curLen);
        var tailY = s.y - s.vy * 0.025;
        var tailZ = s.z - s.vz * 0.025;
        var tr = Math.hypot(tailY, tailZ);
        var minTailR = iceR(Math.max(ICE_END, Math.min(BOW, tailX))) + 0.18;
        if (tr < minTailR && tr > 1e-4) {
          var tPush = minTailR / tr;
          tailY *= tPush;
          tailZ *= tPush;
        }

        // Head vertex (leading front in motion, at s.x since s.vx < 0)
        pos[6 * i]     = s.x;
        pos[6 * i + 1] = s.y;
        pos[6 * i + 2] = s.z;

        // Tail vertex (trailing behind aft of the head, never forward of spawnX)
        pos[6 * i + 3] = tailX;
        pos[6 * i + 4] = tailY;
        pos[6 * i + 5] = tailZ;

        // Diamond white at head, fading pale Cherenkov cyan at tail
        col[6 * i]     = 0.95 * alpha;
        col[6 * i + 1] = 0.98 * alpha;
        col[6 * i + 2] = 1.00 * alpha;

        col[6 * i + 3] = 0.40 * alpha;
        col[6 * i + 4] = 0.75 * alpha;
        col[6 * i + 5] = 0.95 * alpha;
      }
    }
    G.spallGeo.attributes.position.needsUpdate = true;
    G.spallGeo.attributes.color.needsUpdate = true;
  }

  function stepRuler(st) {
    var on = !!st.ruler;
    // The bow faces +x while the ship moves right in the station frame.
    G.ship.rotation.y = 0;
    G.buoys.visible = G.rulerLine.visible = on;
    G.gates.forEach(function (g) { g.visible = on && S.step === "length"; });
    G.buoyClocks.forEach(function (c) { c.g.visible = !!st.clocks; });
    G.shipClock.g.visible = !!st.clocks;
    if (!on) {
      G.ship.position.x = 0; G.ship.scale.x = 1;
      if (st.dock) { G.station.position.set(0, 26, -38); G.station.scale.set(1, 1, 1); }
      return;
    }
    var k = kin();
    if ((S.step === "length" && ((k.ship && k.offset < -60) || (!k.ship && k.shipX > 75))) || (S.step !== "length" && !k.ship && k.shipX > 75)) { S.clock = 0; k = kin(); }
    if (!S.motion && !k.ship && k.b > 0) { S.clock = 60 / (k.b * CU); k = kin(); }
    G.ship.position.x = k.shipX; G.ship.scale.x = k.shipScale;
    for (var i = 0; i < NBUOY; i++) {
      G.v.set(buoyX(i, k), RULER_Y, 0);
      var s = i % 5 === 0 ? 1.25 : 0.8;
      G.s.set(s * (k.ship ? k.rulerScale : 1), s, s);   // each buoy contracts by exactly 1/gamma
      G.m4.compose(G.v, G.ship.quaternion, G.s); G.buoys.setMatrixAt(i, G.m4);
    }
    G.buoys.instanceMatrix.needsUpdate = true;
    var heading = 1;
    var bowX = k.shipX + heading * BOW * k.shipScale, sternX = k.shipX + heading * STERN * k.shipScale;
    [bowX, sternX].forEach(function (x, j) {
      var p = G.gates[j].geometry.attributes.position;
      p.setXYZ(0, x, 0.5, 0); p.setXYZ(1, x, RULER_Y, 0); p.needsUpdate = true;
    });
    G.gateMid = (bowX + sternX) / 2;
    if (L3.measured) {
      L3.measured.el.textContent = k.ship ? "SHIP " + f(SHIP_M, 0) + " m   BUOYS " + f(200 / k.g, 0) + " m APART" : "SHIP " + f(SHIP_M / k.g, 0) + " m";
      L3.frame.el.textContent = k.ship ? "SHIP FRAME: SHIP AT REST" : "STATION FRAME: BUOYS AT REST";
    }
    if (k.ship) { G.station.position.set(wrap(STATION_BG[0] * k.rulerScale + k.offset, SPAN * k.rulerScale), STATION_BG[1], STATION_BG[2]); G.station.scale.set(k.rulerScale, 1, 1); }
    else { G.station.position.fromArray(STATION_BG); G.station.scale.set(1, 1, 1); }
    if (st.clocks) {
      var tS = k.t, tP = k.t / k.g, near = G.buoyClocks[0], best = 1e9;
      G.buoyClocks.forEach(function (c) {
        c.g.position.set(c.x, RULER_Y + 3.4, 0); c.hand.rotation.z = -tS * Math.PI / 5;
        var dd = Math.abs(c.x - k.shipX); if (dd < best) { best = dd; near = c; }
      });
      G.nearClock = near;
      G.shipClock.g.position.set(k.shipX, -8.5, 0); G.shipClock.hand.rotation.z = -tP * Math.PI / 5;
      L3.shipClock.el.textContent = "SHIP CLOCK " + f(tP, 1) + " µs";
      L3.buoyClock.el.textContent = "STATION CLOCKS " + f(tS, 1) + " µs";
      L3.frame.el.textContent = "STATION FRAME: BUOYS AT REST, CLOCKS SYNCHRONIZED";
    }
  }

  var last = performance.now(), labTimer = 0;
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (S.calOn) spawn(S.calRun.add(dt * 12), M.BEAM_BETA, 3);
    if (S.flOn) spawn(S.flRun.add(dt * 12), m.beta, 3);
    if (S.step === "muons") {
      if (!S.demo) { S.demo = new M.Run(ideal, S.beta, "demo"); S.demo.add(30); S.targetScale = 10; S.currScale = 10; }
      if (!coachState.active && S.demo.total() < 6000) spawn(S.demo.add(dt * 4), S.beta, 6);
    }
    var coachPaused = coachState.active && ((S.step === "length" || S.step === "time") ? coachState.i === 0 : true);
    if (S.motion && !coachPaused && (S.step === "length" || S.step === "time")) S.clock += dt * SLOWMO;
    labTimer += dt;
    if (labTimer > 0.25) { labTimer = 0; if (S.calOn || S.flOn) readLab(); }
    if (G) draw(dt);
    if (coachState.active) placeCoach();
    requestAnimationFrame(frame);
  }

  function draw(dt) {
    var cw = G.canvas.clientWidth || window.innerWidth, ch = G.canvas.clientHeight || window.innerHeight;
    if (cw > 0 && ch > 0 && (cw !== G._w || ch !== G._h)) resize();
    var st = STEPS[S.step] || STEPS.title, k = S.motion ? 1 - Math.exp(-dt * 2.2) : 1;
    G.camera.up.set(0, 1, 0);   // the telescope may have leaned the up vector near a pole
    var sextant = sextantOn();
    applyViewRate(dt);
    if (sextant) stepSlew(dt);
    if (S.step === "doppler") {
      var dc = STEPS.doppler.cam;
      if (S.dopplerFrame === "ship") { dc[0] = 50; dc[1] = 8; dc[2] = 0; dc[3] = -Math.PI / 2; dc[4] = 0.02; dc[5] = 102; }
      else if (S.dopplerFrame === "lamp") { dc[0] = -28; dc[1] = 6; dc[2] = 0; dc[3] = 1.1; dc[4] = 0.02; dc[5] = 125; }   // beside the line of sight, so the lamp never hides the ship
      else { dc[0] = 11; dc[1] = 1.5; dc[2] = 0; dc[3] = 0; dc[4] = 0.02; dc[5] = 148; }
    }
    var follow = S.step === "courier" ? courierCamTarget() : null, kc = k;
    if (follow) { st = Object.create(st); st.cam = follow; kc = S.motion ? 1 - Math.exp(-dt * 6) : 1; }
    for (var i = 0; i < 6; i++) cam[i] += (st.cam[i] - cam[i]) * kc;
    var targetX = cam[0] + user.panX;
    var targetY = cam[1] + user.panY;
    var targetZ = cam[2];
    var yaw = cam[3] + user.yaw, pitch = Math.max(-1.3, Math.min(1.3, cam[4] + user.pitch)), dist = cam[5] * user.zoom;
    G.camera.position.set(targetX + dist * Math.sin(yaw) * Math.cos(pitch), targetY + dist * Math.sin(pitch), targetZ + dist * Math.cos(yaw) * Math.cos(pitch));
    G.camera.lookAt(targetX, targetY, targetZ);

    G.graph.visible = !!st.graph;
    G.station.visible = !!(st.dock || st.ruler);
    G.calConduit.visible = !!st.dock;
    G.beamMat.opacity = S.calOn ? 0.95 : 0.25;
    if (G.oneillRings) {
      G.oneillRings.forEach(function (r, ri) {
        r.rotation.x += dt * (ri % 2 === 0 ? 0.18 : -0.18);
      });
    }
    if (G.stationData && G.stationData.spinner) G.stationData.spinner.rotation.x += dt * 0.08;
    // The colony spins once per its own period; in the ship frame its clock runs slow by 1/gamma.
    if (G.colonyData && G.colonyData.spinner) G.colonyData.spinner.rotation.x += dt * 0.08 / (st.shuttle ? P.gamma(colonyV()) : 1);
    stepRuler(st);
    G.ship.visible = !sextant;
    G.demoLamp.visible = S.step === "doppler";
    // In the lamp frame the hull is the moving, shifted source: tint it by its Doppler-shifted blackbody colour.
    var hullObs = S.step === "doppler" && S.dopplerFrame === "lamp"
      ? 3200 / (S.dopplerRecede ? Math.sqrt((1 + S.beta) / (1 - S.beta)) : Math.sqrt((1 - S.beta) / (1 + S.beta))) : null;
    applyHullTint(hullObs);
    if (L3.hullTag) L3.hullTag.el.textContent = hullObs == null ? "" : "HULL · 3,200 K at rest → " + f(hullObs, 0) + " K seen from the lamp";
    if (G.demoLamp.visible && G.lampCore) {
      var tint = balmerColor(S.dopplerFrame === "ship" ? dopplerShift() : 1);
      G.lampCore.material.color.setRGB(tint[0], tint[1], tint[2]);
      G.lampGlass.material.color.setRGB(tint[0], tint[1], tint[2]);
      G.lampGlow.color.setRGB(tint[0], tint[1], tint[2]);
    }
    if (G.demoLamp.visible) {
      G.ship.position.x = -28;
      G.demoLamp.position.set(50, 7, 0);

    }

    // Engine exhaust plumes (the twin pods)
    var on = st.engines ? 1 : 0;
    var targetEx = on * (S.motion ? 0.93 + 0.07 * Math.sin(now() * 31) : 1);
    G.exMat.uniforms.uOn.value += (targetEx - G.exMat.uniforms.uOn.value) * Math.max(k, 0.2);
    if (G.exCoreMat) G.exCoreMat.uniforms.uOn.value += (targetEx - G.exCoreMat.uniforms.uOn.value) * Math.max(k, 0.2);
    G.navs.forEach(function (n, j) { n.visible = !S.motion || Math.sin(now() * 3 + j) > -0.2; });
    var counting = (S.step === "cal" && S.calOn) || (S.step === "flight" && S.flOn) || S.step === "muons";
    G.boreMat.color.setHex(counting ? 0x5fe8d8 : 0x2a8f86);

    // ---- Station 3: the courier run, drawn in the ship frame ----
    // The colony moves along a track parallel to the flight axis at its true ship-frame velocity v (< 0, toward
    // the bow side). It is contracted along x by 1/gamma_v, its spin is slowed by 1/gamma_v, and its colour is
    // the Doppler-shifted light reaching the camera. The probe and return courier follow smooth paths that
    // start and end at the programmed velocities and are contracted along their own velocity. This is a
    // simultaneous-position map, not a light-travel-time image; distances, times and colours are illustrative.
    if (G.shuttle && G.colony && G.boom) {
      var cv = colonyV(), cg = P.gamma(cv), courierStep = !!st.shuttle;
      G.shutPlumeMat.time.value = G.retPlumeMat.time.value = now();
      var neutral = courierStep && S.courierPhase !== "rails" && S.courierPhase !== "failed";
      G.lights.blueRim.intensity = neutral ? 0 : 2.2;
      G.lights.aftRim.intensity = neutral ? 0 : 1.6;
      G.lights.courierFill.intensity = neutral ? 2.4 : 0;
      G.lights.ambient.color.setHex(neutral ? 0x2b2b2b : 0x223242);
      G.colony.visible = courierStep;
      G.shuttle.visible = false;
      if (G.returnShuttle) G.returnShuttle.visible = false;
      G.boom.visible = false; G.boomFragments.visible = false;
      if (courierStep) {
        stepCourier(dt);
        var cc = colonyCentre(S.colonyClock);
        G.colony.position.copy(cc);
        G.colony.rotation.set(0, 0, 0);
        G.colony.scale.set(1 / cg, 1, 1);
        var nC = G.v.copy(cc).sub(G.camera.position).normalize();
        var Dc = 1 / (cg * (1 + cv * nC.x));
        S.colonyD = Dc;
        tintColony(Dc);
        var ph = S.courierPhase;
        if (ph === "out" || ph === "drift" || (ph === "boom" && S.boomT < 0.05)) {
          var po = probeOut(S.shuttlePos, ph === "drift" ? S.driftT : 0);
          placeCraft(G.shuttle, po.pos, po.vel, po.acc, G.shutPlumeMat, ph === "drift" ? 0 : 0.95);
          G.shuttle.visible = ph !== "boom";
        } else if (ph === "hold") {
          var dockAt = colonyDock(S.colonyClock);
          placeCraft(G.shuttle, dockAt, CR_TMP.set(cv, 0, 0), null, G.shutPlumeMat, 0);
          G.shuttle.visible = true;
        } else if (ph === "rails" || ph === "home" || ph === "ret" || ph === "rdrift") {
          // The outbound probe stays docked at the colony after the exchange; on the rails it sits in the bay.
          if (ph === "rails") { placeCraft(G.shuttle, bayPoint(0), null, null, G.shutPlumeMat, 0); G.shuttle.visible = true; }
        }
        if (ph === "ret" || ph === "rdrift") {
          var pr = probeBack(S.returnPos, ph === "rdrift" ? S.driftT : 0);
          placeCraft(G.returnShuttle, pr.pos, pr.vel, pr.acc, G.retPlumeMat, ph === "rdrift" ? 0 : 0.95);
          G.returnShuttle.visible = true;
        }
        if (ph === "boom") {
          var bp = S.boomPos ? S.boomPos : colonyDock(S.colonyClock), blastTime = S.boomT;
          var bScale = S.boomScale || 1.5;
          G.boom.position.copy(bp); G.boom.visible = true;
          G.boomFragments.visible = true; G.boomFragments.position.copy(bp);
          var flash = Math.exp(-blastTime * 3.8), glowSize = (3.5 + 8.5 * (1 - Math.exp(-blastTime * 2.2))) * bScale;
          G.boomCore.scale.set((2.2 + 7.5 * flash) * bScale, (2.2 + 7.5 * flash) * bScale, 1); G.boomCore.material.opacity = 0.98 * flash;
          G.boomGlow.scale.set(glowSize, glowSize, 1); G.boomGlow.material.opacity = 0.78 * Math.exp(-blastTime * 1.2);
          var ejecta = G.boomDebris.geometry.attributes.position;
          G.ejectaVelocity.forEach(function (v, index) { ejecta.setXYZ(index, v.x * blastTime * bScale, v.y * blastTime * bScale, v.z * blastTime * bScale); });
          ejecta.needsUpdate = true; G.boomDebris.material.opacity = Math.max(0, 0.95 - blastTime / 3);
          G.fragments.forEach(function (fragment, index) {
            fragment.position.copy(fragment.userData.velocity).multiplyScalar(blastTime * bScale);
            fragment.rotation.set(blastTime * (index % 3 + 1), blastTime * (index % 4 + 1), blastTime * (index % 5 + 1));
          });
          G.fragmentMat.emissiveIntensity = 1.8 * Math.exp(-blastTime * 1.0);
        }
        updateTrackHud(cv, cg, Dc);
      } else {
        G.colony.scale.set(1, 1, 1);
        if ($("track-hud")) $("track-hud").hidden = true;
      }
    }

    var stationFrame = st.ruler && !(S.step === "length" && S.frame === "ship");
    stepDust(dt, !st.dock && !stationFrame && !sextant, S.step === "flight" ? m.beta : S.beta);
    stepSpall(dt, !st.dock && !stationFrame && !sextant, S.step === "flight" ? m.beta : S.beta);
    stepEvents(dt);
    if (st.graph) updateGraph(dt);
    G.buoyClocks.concat([G.shipClock]).forEach(function (c) { if (c.g.visible) c.g.quaternion.copy(G.camera.quaternion); });

    // The sextant: a telescope at the ship's centre, aimed by the scope bearing and azimuth.
    var xh = $("telescope-crosshair");
    if (xh) { xh.style.display = sextant ? "" : "none"; xh.classList.toggle("locked", sextant && !!S.sxTarget); }
    if (sextant) {
      var targetFov = clamp(24 * user.zoom, 0.08, 60);
      if (Math.abs(Math.log(G.camera.fov / targetFov)) > 0.001) {
        G.camera.fov = S.motion ? G.camera.fov * Math.pow(targetFov / G.camera.fov, 1 - Math.exp(-Math.max(dt, 0.001) * 9)) : targetFov;
        G.camera.updateProjectionMatrix();
      }
      if ($("telescope-mag")) $("telescope-mag").textContent = "MAG ×" + (24 / G.camera.fov >= 100 ? f(24 / G.camera.fov, 0) : f(24 / G.camera.fov, 1)) + " · FOV " + (G.camera.fov < 1 ? f(G.camera.fov, 2) : f(G.camera.fov, 1)) + "°";
      if ($("sx-hud-mode")) $("sx-hud-mode").textContent = S.scopeIR ? "THERMAL IR · WHITE COLD / BLACK HOT" : "OPTICAL";
      var aimV = scopeVec();
      G.camera.position.set(0, 0, 0);
      G.camera.up.set(0, 1, 0);
      if (Math.abs(aimV.y) > 0.9995) G.camera.up.set(1, 0, 0);
      G.camera.lookAt(aimV.x * 440, aimV.y * 440, aimV.z * 440);
    } else if (G.camera.fov !== 45) {
      G.camera.fov = 45;
      G.camera.updateProjectionMatrix();
    }

    // Background relativistic starfield positioning and Doppler/aberration update
    if (G.stars) {
      G.stars.position.copy(G.camera.position);
      var targetBeta = getEffectiveBeta();
      if (G.starBeta < 0) {
        G.starBeta = targetBeta;
        updateStars(G.stars, G.starCatalog, G.starBeta);
      } else if (Math.abs(targetBeta - G.starBeta) > 0.0005) {
        G.starBeta += (targetBeta - G.starBeta) * (1 - Math.exp(-dt * 4.5));
        updateStars(G.stars, G.starCatalog, G.starBeta);
      }
    }

    // Procedural Sequential Planetary Encounter Engine (Approach -> Flyby Abeam -> Recede -> Next World)
    if (G.celestialGroup && G.encounter) {
      // The planet flyby is a cruise backdrop; it is off while the courier run is being tracked.
      var isDockedOrStationFrame = !!st.dock || !!st.ruler || S.step === "doppler" || sextant || (S.step === "courier" && S.courierPhase !== "rails");
      G.celestialGroup.visible = !isDockedOrStationFrame;

      if (G.celestialGroup.visible) {
        var enc = G.encounter;
        var bEff = Math.max(0, Math.min(0.992, G.starBeta >= 0 ? G.starBeta : getEffectiveBeta()));
        var gEff = gammaOf(bEff);
        var isCruising = S.motion && dt > 0 && !isDockedOrStationFrame;
        var vRel = (16.0 * bEff / 0.85);

        if (isCruising) {
          if (enc.phase !== "transit") {
            enc.distX -= vRel * dt;
            if (enc.distX > 80) {
              enc.phase = "approach";
            } else if (enc.distX >= -80) {
              enc.phase = "flyby";
            } else {
              enc.phase = "recede";
            }
            if (enc.distX < -380) {
              enc.phase = "transit";
              enc.transitTimer = 0;
              G.celestialGroup.visible = false;
            }
          } else {
            enc.transitTimer += dt;
            G.celestialGroup.visible = false;
            // 4.0 second peaceful transit through deep starfield before next world approaches
            if (enc.transitTimer > 4.0) {
              enc.worldIdx = (enc.worldIdx + 1) % G.WORLDS.length;
              G.setEncounterWorld(enc.worldIdx);
              enc.distX = 380;
              enc.phase = "approach";
              G.celestialGroup.visible = true;
            }
          }
        }

        if (G.celestialGroup.visible) {
          var curWorld = G.WORLDS[enc.worldIdx % G.WORLDS.length];
          // Position world along its procedural flyby path in the upper celestial sky
          G.celestialGroup.position.set(enc.distX, curWorld.y, curWorld.z);
          // Lorentz length contraction along the starship's flight axis (+x): 1 / gamma
          var invGamma = Math.max(0.12, 1.0 / gEff);
          G.celestialGroup.scale.set(invGamma, 1, 1);
          var fade = Math.min(1, Math.max(0, (380 - Math.abs(enc.distX)) / 100));
          G.planetMesh.material.opacity = fade;
          G.cryoMoonMesh.material.opacity = fade;
          var orbit = G.spallTimer * 0.035;
          G.cryoMoonMesh.position.set(12, -48 * Math.cos(orbit), -48 * Math.sin(orbit));

          // Slow axial rotation; in the ship frame the world's clock runs slow by 1/gamma
          if (G.planetMesh) G.planetMesh.rotation.y += dt * 0.04 / gEff;

          // Relativistic Doppler factor for light reaching the ship from the drawn direction
          var distToWorld = Math.sqrt(enc.distX * enc.distX + curWorld.y * curWorld.y + curWorld.z * curWorld.z);
          var cosObserved = enc.distX / distToWorld;
          var D_world = bEff > 0 ? 1 / (gEff * (1 - bEff * cosObserved)) : 1;

            // Approximate the world as reflecting a sunlike illuminant; the tint is a display-colour estimate.
          if (G.planetMesh && G.planetMesh.material) {
            var tw = dopplerTint(SUN_K, D_world);
            G.planetMesh.material.color.setRGB(tw[0], tw[1], tw[2]);
            if (G.cryoMoonMesh && G.cryoMoonMesh.material) G.cryoMoonMesh.material.color.setRGB(tw[0], tw[1], tw[2]);
          }
        }
      }
    }

    // Catalog overlays for the sextant: bright-star halos, constellation lines, infrared sources.
    var thermalSight = S.scopeIR && sextant;
    G.refStarGroup.visible = sextant;
    G.dbPoints.visible = sextant;
    G.constellationLines.visible = sextant;
    G.thermalGroup.visible = thermalSight;
    if (sextant) {
      G.syncDb();
      var ca = G.constellationLines.geometry.attributes.position, ci = 0;
      G.clusters.forEach(function (c, k) {
        var ctr = G.conCentroids[k].set(0, 0, 0);
        c.lines.forEach(function (ln) {
          var a = G.dbWorld[G.dbOfIdx[c.members[ln[0]]].rank], b = G.dbWorld[G.dbOfIdx[c.members[ln[1]]].rank];
          ca.setXYZ(ci++, a.x, a.y, a.z); ca.setXYZ(ci++, b.x, b.y, b.z);
        });
        c.members.forEach(function (i) { ctr.add(G.dbWorld[G.dbOfIdx[i].rank]); });
        ctr.multiplyScalar(1 / c.members.length);
      });
      ca.needsUpdate = true;
      var fovScale = Math.max(0.04, G.camera.fov / 24);
      THERMAL.forEach(function (src, k) {
        var sp = G.thermalSprites[k];
        sp.visible = thermalVisible(src);
        sp.position.copy(THERMAL_DIRS[k]).multiplyScalar(440);
        sp.scale.setScalar((src.kind === "radiator" ? 14 : 11) * fovScale);
      });
      updateLock();
    }
    G.dbMat.color.setHex(thermalSight ? 0x3c3c3c : 0xffffff);
    G.dbMat.blending = thermalSight ? T.NormalBlending : T.AdditiveBlending;
    G.scene.background = thermalSight ? new T.Color(0xe7eeeb) : null;
    G.stars.visible = true;
    G.stars.material.blending = thermalSight ? T.NormalBlending : T.AdditiveBlending;
    G.stars.material.color.setHex(thermalSight ? 0x242424 : 0xffffff);
    G.stars.material.size = thermalSight ? 2.8 : 2.3;
    G.stars.material.opacity = thermalSight ? 0.85 : 0.78;
    document.body.classList.toggle("ir-sight", thermalSight);
    if (G.skyGrid) { G.skyGrid.material.color.setHex(thermalSight ? 0x6f8f8b : 0x2a7a76); G.skyGrid.material.opacity = thermalSight ? 0.32 : 0.2; }
    if (G.constellationLines) { G.constellationLines.material.color.setHex(thermalSight ? 0x3f625d : 0x58c9c1); G.constellationLines.material.opacity = thermalSight ? 0.72 : 0.5; }

    G.renderer.render(G.scene, G.camera);
    placeLabels();
  }
  function now() { return performance.now() / 1000; }

  // ---- Flight Operations & Physics Instruction Manual ----
  // The tool tour shared by every sextant task: the same instruments, a different question each time.
  var SEXTANT_TOOLS = {
    heading: "The Sextant Station (same tools for every sighting task)",
    steps: [
      "<strong>View controller:</strong> tilt the puck (or use the arrow keys) to slew the telescope; the harder the tilt, the faster it turns. <kbd>[</kbd> <kbd>]</kbd> or the + / − buttons zoom, down to a 0.1° field. You can also drag the sky, click a star to centre it, or click the all-sky map.",
      "<strong>Target card:</strong> whatever sits in the ring is looked up in the star catalog: name, spectral class, temperature, and its catalog bearing against the bearing you measure.",
      "<strong>All-sky map:</strong> bow sky and stern sky as two discs. The white circle is the telescope's field of view. Dotted lines join stars into constellations.",
      "<strong>IR sight:</strong> the thermal array. White is cold, black is hot.",
      "<strong>Spectrograph:</strong> one detector for every source. Roll the wheel to zoom the wavelength axis, click to mark a wavelength.",
      "<kbd>T</kbd> slews to the nearest catalog star, <kbd>Space</kbd> takes a spectrum, <kbd>R</kbd> resets the zoom."
    ]
  };

  var INSTRUCTIONS = {
    title: {
      title: "Lighthugger Operations & Relativistic Kinematics",
      sections: [
        {
          heading: "Relativistic Spaceflight Overview",
          text: "Cruising at speeds comparable to the speed of light c requires relativistic kinematics. Time dilation and Lorentz contraction alter all onboard observations.",
          eq: "γ = 1 / √(1 − β²),  β = v / c",
          desc: "Lorentz factor: scales time dilation and length contraction"
        },
        {
          heading: "Navigation Mission Overview",
          text: "Due to nav-computer sensor corruption, you must measure ship speed β through two independent physical experiments:",
          steps: [
            "<strong>Station 1:</strong> Muon decay distribution along the 1200 m ice-prow detector bore.",
            "<strong>Station 2:</strong> Optical spectrograph measurement of relativistic aberration and Doppler shifted starlight.",
            "<strong>Station 3:</strong> Relativistic velocity addition to rendezvous with the colony ship Nova Archimedes."
          ]
        },
        {
          heading: "Cockpit Controls & Keyboard Shortcuts",
          keys: [
            { k: "Left Drag", d: "Orbit camera / Slew telescope" },
            { k: "Right / Shift Drag", d: "Pan camera vertically / horizontally" },
            { k: "[ / ]", d: "Zoom view out / in (wheel or the dial also work)" },
            { k: "W / S", d: "Pan camera Up / Down" },
            { k: "A / D or ← / →", d: "Slew optical telescope" },
            { k: "1, 2, 3, 4", d: "Instant slew to Star A, B, C, D" },
            { k: "Space / Enter", d: "Acquire & Lock targeted star" },
            { k: "T", d: "Target nearest star" },
            { k: "R / 0", d: "Reset camera view" },
            { k: "? / H", d: "Toggle this instruction manual" },
            { k: "Esc", d: "Close drawer or terminal" }
          ]
        }
      ]
    },
    cal: {
      title: "Station 1 // Muon Detector Calibration",
      sections: [
        {
          heading: "Detector Segment Sensitivity",
          text: "The forward 1200 m ice prow contains 12 sensor sections (100 m each, centered at x_k = 50 m to 1150 m). Due to crystal aging, each section has a distinct detection efficiency relative to Section 1 (x₁ = 50 m) against the certified 0.800c beam (L_beam = 878.2 m):",
          eq: "e_k = (C_k / C₁) · exp[(x_k − x₁) / L_beam]",
          desc: "Efficiency of section k relative to Section 1"
        },
        {
          heading: "Calibration Procedure",
          steps: [
            "Press <strong>Beam on</strong> to inject test muons at certified β = 0.800c.",
            "Wait until every section reaches at least " + STUDENT_CAL_HITS + " hits (all 12 bars turn green).",
            "Press <strong>Store calibration</strong>, then record L_raw, C₁, C₁₂, and e₁₂ before clicking <strong>Undock and depart</strong>."
          ]
        }
      ]
    },
    flight: {
      title: "Station 1 // Muon Speed Measurement",
      sections: [
        {
          heading: "Muon Decay Kinematics",
          text: "At rest, muons decay with mean proper lifetime τ₀ = 2.197 μs (cτ₀ = 658.65 m). When moving at speed v = βc relative to the ship, their lifetime in the ship frame is dilated by γ.",
          eq: "L = β γ c τ₀ = [β / √(1 − β²)] · (c τ₀)",
          desc: "Characteristic decay length in ship frame"
        },
        {
          heading: "Count Distribution Fit",
          text: "The observed count in section k at position x_k follows an exponential decay law:",
          eq: "N(x) = N₀ · η_k · exp(−x / L)",
          desc: "Exponential fit to calibrated counts recovers decay length L"
        },
        {
          heading: "Manual Override",
          text: "Click <strong>Run Nav Computer</strong> after collecting at least " + STUDENT_FLIGHT_HITS + " total hits. Because the automatic inversion fails, use your fitted L from the readout and your lab handout relation to solve for β."
        }
      ]
    },
    "spectro-cal": {
      title: "Sextant // Calibrating the Spectrograph",
      sections: [
        SEXTANT_TOOLS,
        {
          heading: "Balmer Spectral Dispersion",
          text: "The diffraction spectrograph spans 100–1400 nm. Before observing stars, calibrate its pixel offset and dispersion scale against the onboard hydrogen discharge lamp's three Balmer lines:",
          eq: "λ(p) = λ₀ + s · p",
          desc: "Calibrated wavelength map aligned to hydrogen reference lines"
        },
        {
          heading: "Standard Hydrogen Balmer Lines",
          steps: [
            "<strong>H-α:</strong> 656.28 nm (red)",
            "<strong>H-β:</strong> 486.13 nm (cyan)",
            "<strong>H-γ:</strong> 434.05 nm (violet)"
          ]
        },
        {
          heading: "Procedure",
          steps: [
            "Press <strong>Strike lamp</strong> and compare where each bright emission line (H-α, H-β, H-γ) lands against its known reference wavelength.",
            "Press <strong>Store cal</strong>. The wavelength axis aligns to the reference lines for every spectrum taken afterward, then press <strong>Continue to the sky →</strong>."
          ]
        }
      ]
    },
    "spectro-star": {
      title: "Sextant // Aberration & Doppler Starlight",
      sections: [
        SEXTANT_TOOLS,
        {
          heading: "Relativistic Aberration of Light",
          text: "The star catalog gives each star's bearing in the stars' own rest frame, θ_rest. The sextant measures the bearing from your bow as you see it, θ_obs. Because the ship is moving, starlight arrives bunched toward the bow, so the whole sky is squeezed forward:",
          eq: "cos θ_obs = (cos θ_rest + β) / (1 + β cos θ_rest)",
          desc: "Aberration equation: forward concentration of starlight"
        },
        {
          heading: "Relativistic Doppler Shift",
          text: "Starlight wavelength shifts according to the relativistic Doppler formula at the observed angle θ_obs:",
          eq: "f = λ_obs / λ_rest = γ (1 − β cos θ_obs)",
          desc: "Doppler factor f: < 1 is blue-shifted, > 1 is red-shifted"
        },
        {
          heading: "Procedure",
          steps: [
            "Use the named stars and the dotted constellation lines as signposts. Slew onto any star, blue-shifted toward the bow and red-shifted toward the stern, and centre it in the ring. Any star can be locked, named or not.",
            "Press <strong>Take spectrum [Space]</strong>. The sextant reports the H-α dip. Take one blue-shifted star and one red-shifted star.",
            "Use <strong>f = γ(1 − β cos θ)</strong> with each star's θ and wavelength ratio λ/656.28 nm to solve for β, then run the starlight solver and enter your speed.",
            "Compare each catalog θ_rest with the θ you read on the sextant: the difference is what the aberration equation explains."
          ]
        }
      ]
    },
    dock: {
      title: "Sextant // Finding the Colony Ship",
      sections: [
        SEXTANT_TOOLS,
        {
          heading: "Thermal Sources & the Infrared Array",
          steps: [
            "The colony ship's radiators are cool, so they are faint in visible light. Switch <strong>IR sight</strong> on: the view inverts to white-cold, black-hot, and cool sources show as dark blobs.",
            "The dashed ring marks the waypoint search region. Other cool objects, such as brown dwarfs, are decoys: a thermal source is not necessarily the colony ship.",
            "Take a spectrum of each candidate. A star shows absorption lines on a smooth continuum; a thermal object shows a blackbody continuum. The colony ship's hydrogen beacon adds one narrow emission line."
          ]
        },
        {
          heading: "Radiator Doppler",
          text: "The beacon emits H-α at 656.28 nm in the colony ship's own frame. Call its signed velocity relative to Long Patience v. The colony ship lies almost dead ahead (1.2°), so the line is approximately:",
          eq: "λ_obs ≈ 656.28 nm · √((1 + v) / (1 − v))",
          desc: "This relation uses the colony ship's velocity relative to Long Patience; the requested w and measured ship speed β are in the station frame."
        },
        {
          heading: "Procedure",
          steps: [
            "Click the emission peak on the spectrum to mark its wavelength; the H-α box fills with it. Zoom the wavelength axis with the wheel for a sharper reading.",
            "Calculate the colony ship's signed speed w from the line and your ship speed β, enter it, and press <strong>Verify w</strong>.",
            "Open probe control to program the courier."
          ]
        }
      ]
    },
    "calculate-w": {
      title: "Hint // Colony ship speed",
      sections: [
        {
          heading: "Measurements",
          text: "Mark the emission peak and compare its observed wavelength with the H-α rest wavelength, 656.28 nm. Is the beacon blue-shifted or red-shifted?"
        },
        {
          heading: "Relative motion",
          text: "The colony ship is almost directly ahead. What velocity does the Doppler shift tell you about, and relative to which ship? Use the Doppler relation from your lab materials."
        },
        {
          heading: "Compare frames",
          text: "The requested w and your ship speed β are measured in the station frame. Use the average of your muon and starlight speeds for β (or the available measurement if you have only one), and consider how relativistic velocity addition connects the frames. Enter a signed value in units of c."
        }
      ]
    },
    "calculate-courier": {
      title: "Hint // Courier launch speeds",
      sections: [
        {
          heading: "Frames and signs",
          text: "Use the displayed Long Patience speed β and verified colony ship speed w. Both are signed velocities in the station frame, in units of c; positive is Long Patience's direction of travel."
        },
        {
          heading: "Plan each rendezvous",
          text: "For each courier, identify which ship it must match and the frame in which its launch velocity is entered. Use relativistic velocity addition and your lab materials to determine the signed outbound and return velocities."
        },
        {
          heading: "Launch",
          text: "Run the rendezvous computer, enter both calculated speeds and launch. A failed docking returns you to this plan with your measurements preserved."
        }
      ]
    },
    courier: {
      title: "Probe Control // Courier Rendezvous",
      sections: [
        {
          heading: "Frames and Signs",
          text: "Three frames: the station frame (where the ship moves at β and the colony at w), the ship frame, and the colony frame. Positive is the ship's direction of travel. A courier moving at u′ relative to the ship moves, in the station frame, at:",
          eq: "u = (u′ + β) / (1 + u′β)   [velocities in units of c]",
          desc: "Einstein velocity addition. Galilean addition, u = u′ + β, fails at these speeds."
        },
        {
          heading: "Matching Each Target",
          text: "The outbound courier must end up moving with the colony (u = w). The return courier, launched from the colony, must end up moving with the ship. Solve the addition formula for the velocity relative to the frame each courier starts from.",
          eq: "u′: courier relative to the ship   ·   u″: return courier relative to the colony",
          desc: "Each docking succeeds only within ±0.015c of the target's velocity."
        },
        {
          heading: "Procedure",
          steps: [
            "The rendezvous computer shares the faulty core. Run it, watch it fail, and calculate u′ and u″ yourself from your β and w.",
            "Launch. The ship-frame map follows the courier to the colony and the return courier back. It shows simultaneous positions and Lorentz-contracted lengths; colours and the flight path are illustrative. A real camera image also includes light-travel-time effects, which this map omits.",
            "A failed docking restores the save point at this console with your measurements kept. Every attempt is logged in the mission data.",
            "At the debrief, download the complete mission data (CSV) and include it in your lab report."
          ]
        }
      ]
    }
  };

  function openInstructionDrawer(stepKey) {
    var key = stepKey || S.step || "title";
    var data = INSTRUCTIONS[key] || INSTRUCTIONS.title;
    var drawer = $("instruction-drawer");
    var backdrop = $("drawer-backdrop");
    var titleEl = $("drawer-title");
    var bodyEl = $("drawer-body");
    if (!drawer || !backdrop || !titleEl || !bodyEl) return;

    titleEl.textContent = data.title;
    bodyEl.innerHTML = "";

    function renderMathHtml(raw, allowTags) {
      var out = String(raw);
      if (!allowTags) {
        out = out.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      }
      return out.replace(/([ηCxθλτβγeL])_([A-Za-z0-9]+)/g, "$1<sub>$2</sub>");
    }

    data.sections.forEach(function (sec) {
      var sDiv = document.createElement("div");
      sDiv.className = "drawer-section";

      var h3 = document.createElement("h3");
      h3.textContent = sec.heading;
      sDiv.appendChild(h3);

      if (sec.text) {
        var p = document.createElement("p");
        p.innerHTML = renderMathHtml(sec.text, true);
        sDiv.appendChild(p);
      }

      if (sec.eq) {
        var eqBox = document.createElement("div");
        eqBox.className = "drawer-eq-box";
        var eqLine = document.createElement("div");
        eqLine.className = "eq-line";
        eqLine.innerHTML = renderMathHtml(sec.eq, false);
        eqBox.appendChild(eqLine);
        if (sec.desc) {
          var eqDesc = document.createElement("div");
          eqDesc.className = "eq-desc";
          eqDesc.innerHTML = renderMathHtml(sec.desc, false);
          eqBox.appendChild(eqDesc);
        }
        sDiv.appendChild(eqBox);
      }

      if (sec.steps) {
        var ol = document.createElement("ol");
        ol.className = "drawer-step-list";
        sec.steps.forEach(function (st) {
          var li = document.createElement("li");
          li.innerHTML = renderMathHtml(st, true);
          ol.appendChild(li);
        });
        sDiv.appendChild(ol);
      }

      if (sec.keys) {
        var kGrid = document.createElement("div");
        kGrid.className = "drawer-key-ref";
        sec.keys.forEach(function (kObj) {
          var item = document.createElement("div");
          item.className = "drawer-key-item";
          var badge = document.createElement("span");
          badge.className = "drawer-key-badge";
          badge.textContent = kObj.k;
          var desc = document.createElement("span");
          desc.textContent = kObj.d;
          item.appendChild(badge);
          item.appendChild(desc);
          kGrid.appendChild(item);
        });
        sDiv.appendChild(kGrid);
      }

      bodyEl.appendChild(sDiv);
    });

    backdrop.hidden = false;
    drawer.hidden = false;
  }

  function closeInstructionDrawer() {
    var drawer = $("instruction-drawer");
    var backdrop = $("drawer-backdrop");
    if (drawer) drawer.hidden = true;
    if (backdrop) backdrop.hidden = true;
  }

  function toggleInstructionDrawer() {
    var drawer = $("instruction-drawer");
    if (drawer && !drawer.hidden) {
      closeInstructionDrawer();
    } else {
      openInstructionDrawer();
    }
  }

  // Global Keyboard Navigation & Cockpit Controls
  function typingTarget(t) { return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable); }
  function modalOpen() {
    var a = $("glitch-modal"), b = $("star-solver-modal");
    return (a && !a.hidden) || (b && !b.hidden);
  }
  window.addEventListener("keydown", function (e) {
    if (typingTarget(e.target)) {
      if (e.key === "Escape") { e.target.blur(); closeInstructionDrawer(); }
      return;
    }
    if (e.key === "?" || e.key === "h" || e.key === "H") {
      e.preventDefault();
      toggleInstructionDrawer();
      return;
    }
    if (e.key === "Escape") {
      closeInstructionDrawer();
      var gm = $("glitch-modal");
      if (gm && !gm.hidden) gm.hidden = true;
      return;
    }
    // While a tip plays, or a terminal is open, the lab underneath does not respond.
    if (document.body.classList.contains("coach-active") || modalOpen()) return;
    if (e.key === "Shift") view.keys.Shift = true;
    // The arrow keys drive the same rate controller as the puck.
    if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      view.keys[e.key] = true;
      return;
    }
    if (sextantOn()) {
      if (e.key === "t" || e.key === "T") { snapToNearestStar(); return; }
      var onControl = e.target && (e.target.tagName === "BUTTON" || e.target.tagName === "A" || e.target.tagName === "SUMMARY");
      if ((e.key === " " || e.key === "Enter") && !onControl) {
        e.preventDefault();
        if ($("scope-lock")) $("scope-lock").click();
        return;
      }
    }
    // Zoom. Brackets sit under the right hand; minus and equals also work.
    if (e.key === "]" || e.key === "}" || e.key === "=" || e.key === "+") {
      e.preventDefault();
      zoomBy(1 / 1.35);
      return;
    } else if (e.key === "[" || e.key === "{" || e.key === "-" || e.key === "_") {
      e.preventDefault();
      zoomBy(1.35);
      return;
    }
    if (e.key === "r" || e.key === "R" || e.key === "0") {
      user.panX = 0; user.panY = 0; user.yaw = 0; user.pitch = 0;
      setZoom(1);
    }
  });
  window.addEventListener("keyup", function (e) { delete view.keys[e.key]; });
  window.addEventListener("blur", function () { view.keys = {}; view.zoomHold = 0; });

  readBriefing();
  go("title");
  initScopeInteractive();
  started = true;
  requestAnimationFrame(frame);
})();






