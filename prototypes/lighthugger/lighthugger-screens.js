/**
 * LighthuggerScreens - full-page game UI layer for canvas/lighthugger.html.
 *
 * Owns every DOM control outside the WebGL canvas: the helm telemetry pill,
 * screen bar, helm flight strip, Knight KG-2100 console interaction, and the
 * overlay screens (menu + startup customizer, orbits, starmap, drydock,
 * sextant, archive, manual). All input is forwarded to the app through the
 * `actions` object given to init(); all readouts come from the `snap` object
 * given to sync(). Every snap key is optional; where the app leaves one out,
 * the screens derive what they can from LighthuggerGalaxy / LighthuggerOrbits /
 * LighthuggerGenome directly. The ATProto drawer talks to
 * window.LighthuggerATProto for identity/PDS calls; archive storage itself
 * goes through the app's archive actions so its cached snap.archive stays fresh.
 *
 * Keyboard owned here: Esc N M Y X ? / K F 0 1-4, and A for the archive
 * (Shift+A on helm/sextant, where plain A is yaw). Held flight keys stay in app.
 * zoomBy(f), zoomOsc(f): f < 1 zooms in (multiplies distance / window span).
 */
(function (root) {
  'use strict';

  var doc = root.document;
  if (!doc) return;

  var SCREENS = { helm: 1, menu: 1, orbits: 1, starmap: 1, drydock: 1, sextant: 1, archive: 1, manual: 1 };
  // The seven blendable surface styles, in genome STYLE_KEYS order.
  var STYLE_DEFS = [
    ['styleGnostic', 'Melding Plague', 'PLG', 'gnostic'],
    ['styleGothic', 'Sagrada Basilica', 'SGR', 'gothic'],
    ['styleSleek', 'Sleek Nighthawk', 'SLK', 'sleek'],
    ['styleGiger', 'Giger Xenomorph', 'GIG', 'giger'],
    ['styleCoade', 'Orbital Modular', 'MOD', 'coade'],
    ['styleDune', 'Dune Brutalist', 'DUN', 'dune'],
    ['styleCathedral', 'Gothic Cathedral', 'GTH', 'cathedral']
  ];
  var STYLE_KEY_SET = { styleGnostic: 1, styleGothic: 1, styleSleek: 1, styleGiger: 1, styleCoade: 1, styleDune: 1, styleCathedral: 1 };
  // Showcase presets get a style tag on their chip.
  var PRESET_TAGS = { 'gnostic-plague': 'Plague', 'cathedral-basilica': 'Sagrada', 'nighthawk-diamond': 'Sleek',
    'giger-xenomorph': 'Giger', 'coade-savages': 'Modular', 'coade-savage': 'Modular', 'dune-monolith': 'Dune', 'cathedral-gothic': 'Gothic' };
  var G0_KMS2 = 0.00980665;
  var AU_KM = 149597870.7;
  var C_KMS = 299792.458;
  var GAMMA_SWITCH_BETA = 0.99;
  var BETA = '\u03b2', GAMMA = '\u03b3', TAU = '\u03c4', DELTA = '\u0394', ETA = '\u03b7', LAMBDA = '\u03bb';
  var MID = ' \u00b7 ', DASH = '\u2014', CREDIT = '\u20b5', TIMES = '\u00d7';

  var A = {};
  var S = {
    inited: false,
    screen: 'menu',
    lastSnapScreen: null,
    started: false,
    kgOpen: false,
    puckActive: false,
    snap: {},
    lastSyncAt: 0,
    thrustLocal: 0,
    orbitSoi: null,
    orbitView: { zoom: 1, panX: 0, panY: 0, dirty: true, lastDraw: 0, hits: [], hover: null, scale: 1, w: 0, h: 0, frameOff: [0, 0, 0], bodyRadiusKm: 1, muKm3S2: 1, soi: 'planet' },
    selTarget: null,
    lastSnapTarget: null,
    star: { yaw: 0.55, tilt: 1.02, zoom: 1, mwZoom: 1, scale: 'linear', sel: null, filter: '', dirty: true, lastDraw: 0, hits: [] },
    lastSnapStar: null,
    accelG: 1,
    betaCap: 1,
    dtab: 'hull',
    cztab: 'hull',
    mtab: 'orbits',
    atab: 'vessels',
    menuTab: 'launch',
    arc: { filter: '', inspectKind: null, inspectId: null, previewKey: '', listKey: '', atpBusy: false, atpNote: '', atpLink: '' },
    pendingGenome: null,
    pendingTimer: 0,
    toastSeq: null,
    toastTimer: 0,
    flashTimer: 0,
    labels: {},
    labelState: {},
    cache: {},
    keys: {},
    o3: null, o3At: 0, o3Diag: null, o3Hill: true, o3Lag: true, o3Ice: true,
    burns: [], selBurn: -1, chainKey: '[]', trimStep: 0.01, circMode: 'now',
    rollIn: { cap: 0, ring: 0 }, rollOut: 0,
    launchPos: null,
    wpnReticle: { bx: null, by: null, tx: null, ty: null, lx: null, ly: null, tgtId: null },
    wpnLockBox: null,
    chrono: { galAng: 0, tauAng: 0, lastAt: 0 },
    settingsOpen: false,
    tutorialOpen: false,
    tutorialStep: 0,
    tutorialShowOnLaunch: true,
    audioPopOpen: false,
    photoMode: false,
    lastUiSliderAt: 0,
    lastUiFlashAt: 0,
    orbitHintSys: null
  };

  // ------------------------------------------------------------------ utils
  function $(id) { return doc.getElementById(id); }
  function qa(sel, el) { return Array.prototype.slice.call((el || doc).querySelectorAll(sel)); }
  function num(v, d) { var n = Number(v); return Number.isFinite(n) ? n : d; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function isArr3(v) { return Array.isArray(v) && v.length >= 2 && Number.isFinite(v[0]); }
  function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], (a[2] || 0) - (b[2] || 0)]; }
  function add3(a, b) { return [a[0] + b[0], a[1] + b[1], (a[2] || 0) + (b[2] || 0)]; }
  function len3(a) { return Math.hypot(a[0], a[1], a[2] || 0); }

  function call(name) {
    var f = A[name];
    if (typeof f !== 'function') return undefined;
    try { return f.apply(null, Array.prototype.slice.call(arguments, 1)); }
    catch (e) { if (root.console) root.console.warn('[LighthuggerScreens] action ' + name + ' failed', e); }
    return undefined;
  }
  function setText(el, t) {
    if (!el) return;
    t = t == null ? '' : String(t);
    if (el.__lhT !== t) { el.textContent = t; el.__lhT = t; }
  }
  function setPressed(el, on) {
    if (!el) return;
    var v = on ? 'true' : 'false';
    if (el.getAttribute('aria-pressed') !== v) el.setAttribute('aria-pressed', v);
  }
  function setHidden(el, hide) { if (el && el.hidden !== !!hide) el.hidden = !!hide; }
  function setData(el, k, v) { if (el && el.dataset[k] !== String(v)) el.dataset[k] = v; }
  function setDisabled(el, off) { if (el && el.disabled !== !!off) el.disabled = !!off; }
  function el(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function commas(x) { return Math.round(x).toLocaleString('en-US'); }
  function fmtKm(km) {
    if (!Number.isFinite(km)) return DASH;
    var a = Math.abs(km);
    if (a >= 0.05 * AU_KM) return (km / AU_KM).toFixed(a >= 10 * AU_KM ? 1 : 3) + ' AU';
    if (a >= 1e6) return (km / 1e6).toFixed(2) + ' Mkm';
    if (a >= 1000) return commas(km) + ' km';
    if (a >= 1) return km.toFixed(1) + ' km';
    return Math.round(km * 1000) + ' m';
  }
  var WARP_MAX_MUL = 31557600 * 2.2;
  function formatPhysicalClock(simS) {
    var total = Math.max(0, Math.floor(num(simS, 0)));
    var sec = total % 60;
    var totalMin = Math.floor(total / 60);
    var min = totalMin % 60;
    var totalHr = Math.floor(totalMin / 60);
    var hr = totalHr % 24;
    var totalDays = Math.floor(totalHr / 24);
    var days = totalDays % 365;
    var yrs = Math.floor(totalDays / 365);
    var p2 = function (n) { return n < 10 ? ('0' + n) : String(n); };
    var p3 = function (n) { return n < 10 ? ('00' + n) : n < 100 ? ('0' + n) : String(n); };
    return p2(yrs) + 'y ' + p3(days) + 'd ' + p2(hr) + ':' + p2(min) + ':' + p2(sec);
  }
  function formatWarpShort(w) {
    var warp = Math.max(1, num(w, 1));
    if (warp < 1.35) return '1\u00d7';
    if (warp < 1000) return Math.round(warp) + '\u00d7';
    if (warp < 1e6) return (warp / 1000).toFixed(warp < 1e4 ? 1 : 0) + 'k\u00d7';
    if (warp < 3.15576e6) return (warp / 1e6).toFixed(2) + 'M\u00d7';
    return (warp / 31557600).toFixed(warp / 31557600 >= 1 ? 2 : 3) + ' yr/s';
  }
  function warpToNorm(w) {
    return clamp(Math.log10(Math.max(1, num(w, 1))) / Math.log10(WARP_MAX_MUL), 0, 1);
  }
  function normToWarp(u) {
    return Math.pow(10, clamp(num(u, 0), 0, 1) * Math.log10(WARP_MAX_MUL));
  }
  function fmtDur(s) {
    if (!Number.isFinite(s)) return DASH;
    s = Math.max(0, s);
    if (s < 120) return s.toFixed(0) + ' s';
    if (s < 7200) return (s / 60).toFixed(1) + ' min';
    if (s < 172800) return (s / 3600).toFixed(1) + ' h';
    if (s < 63115200) return (s / 86400).toFixed(1) + ' d';
    return (s / 31557600).toFixed(2) + ' yr';
  }
  function fmtYr(y) {
    if (!Number.isFinite(y)) return DASH;
    if (y < 0.1) return (y * 365.25).toFixed(1) + ' d';
    if (y >= 1000) return commas(y) + ' yr';
    return y.toFixed(2) + ' yr';
  }
  function fmtPct(f, digits) {
    if (!Number.isFinite(f)) return DASH;
    var p = f * 100;
    if (digits == null) digits = p !== 0 && Math.abs(p) < 0.1 ? 4 : p < 10 ? 2 : 1;
    return p.toFixed(digits) + '%';
  }
  function upper(s) { return String(s || '').toUpperCase(); }

  // --------------------------------------------------------- data helpers
  function Gx() { return root.LighthuggerGalaxy; }
  function Ox() { return root.LighthuggerOrbits; }
  function Gn() { return root.LighthuggerGenome; }
  function getSys(id) {
    var G = Gx();
    if (!G) return null;
    if (G.getSystem) return G.getSystem(id);
    var list = G.ALL_SYSTEMS || G.SYSTEMS;
    if (!list || !list.length) return null;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return id ? null : list[0];
  }
  function curSys(s) { return getSys(s.systemId || 'sol') || getSys(null); }
  function getSpecs(s) {
    if (s.rocketSpecs && Number.isFinite(s.rocketSpecs.dryMassMt)) return s.rocketSpecs;
    if (s.specs && Number.isFinite(s.specs.dryMassMt)) return s.specs;
    var key = s.genome ? JSON.stringify(s.genome.P || s.genome) : 'default';
    if (S.cache.specsKey === key) return S.cache.specs;
    var G = Gn(), out = null;
    try { if (G && G.computeRocketSpecs) out = G.computeRocketSpecs(s.genome || G.PRESETS[0]); } catch (e) { out = null; }
    S.cache.specsKey = key; S.cache.specs = out;
    return out;
  }
  function genomeP(s) {
    if (s.genome && s.genome.P) return s.genome.P;
    var G = Gn();
    return G && G.PRESETS ? G.normalize(G.PRESETS[0]).P : {};
  }
  function bodyWorld(sys, ref, t) {
    var G = Gx();
    try { return G.getBodyWorldState(sys, ref, t || 0).rKm; } catch (e) { return [0, 0, 0]; }
  }
  function orbitMu(s, sys) {
    var o = s.orbit || {};
    if (o.muKm3S2) return o.muKm3S2;
    if (!sys) return 0;
    if (o.focusSoi === 'star') return sys.muStarKm3S2;
    var p = sys.planets && sys.planets[o.planetIdx || 0];
    return p ? p.muKm3S2 : sys.muStarKm3S2;
  }
  function inTransit(s) {
    return s.mode === 'interstellar' || (!s.docked && !s.orbit && num(s.beta, 0) > 0.001);
  }
  var TRANSIT_STAGE_LABELS = {
    departure: 'DEPARTURE BURN', accelerate: 'ACCEL CRUISE',
    turnover: 'MIDPOINT TURNOVER', brake: 'DECEL BURN',
    approach: 'SYSTEM APPROACH', capture: 'ORBITAL CAPTURE',
    coast: 'COAST', cruise: 'CRUISE'
  };
  function transitLabel(s) {
    return s.transitStageLabel || TRANSIT_STAGE_LABELS[s.transitStage || s.missionPhase] || '';
  }

  // ------------------------------------------------------------ screens
  function showScreen(name, fromSnap) {
    if (!SCREENS[name]) name = 'helm';
    if (name === 'orbits' && !fromSnap && S.snap && S.snap.inDeepSpace) {
      flash('DEEP SPACE (> 1 LIGHT-WEEK FROM NEAREST STAR) -- USE STARMAP [M]', 'warn');
      if (S.screen === 'orbits') name = 'helm';
      else return;
    }
    if (name !== 'menu') S.started = true;
    var prev = S.screen;
    if (prev === name) return;
    S.screen = name;
    var main = $('main');
    setData(main, 'screen', name);
    qa('[data-screen-panel]').forEach(function (p) { setHidden(p, p.dataset.screenPanel !== name); });
    syncScreenBar(name);
    syncKgToggle();
    setHidden($('lh-reticle'), name !== 'sextant');
    syncNoticePlacement();
    if (name === 'orbits') { S.orbitView.dirty = true; if (S.o3) { S.o3At = 0; syncOrbit3D(S.snap, true); } syncDeepSpace(S.snap); }
    if (name === 'starmap') { S.star.dirty = true; renderSysList(); }
    if (name === 'menu') { syncMenu(S.snap); syncCustomizer(S.snap); }
    if (name === 'archive') { S.arc.listKey = ''; S.arc.previewKey = ''; refreshAtpStatus(); }
    if (prev === 'menu' || prev === 'drydock') flushGenome();
    if (!fromSnap) {
      call('setScreen', name);
      if (name === 'sextant') call('toggleSextant', true);
      else if (prev === 'sextant') call('toggleSextant', false);
    }
    if (name !== 'helm' && name !== 'sextant') hideLabels();
    var focusEl = name === 'helm' ? $('lh-scene') : null;
    if (!fromSnap && focusEl && doc.activeElement && doc.activeElement !== doc.body &&
        doc.activeElement.closest && doc.activeElement.closest('.lh-screen')) {
      try { focusEl.focus({ preventScroll: true }); } catch (e) {}
    }
  }
  function toggleScreen(name) { showScreen(S.screen === name ? 'helm' : name); }
  // The invariant top bar lights whichever screen is active (HELM glows green on the helm).
  function syncScreenBar(name) {
    qa('#lh-screenbar [data-screen-btn]').forEach(function (b) { setPressed(b, b.dataset.screenBtn === name); });
  }
  function syncKgToggle() {
    var b = $('btn-kg-unstow');
    if (b) b.setAttribute('aria-expanded', S.kgOpen ? 'true' : 'false');
  }
  var LAYER_LABELS = {
    'music-orbital': 'ORBITAL MUSIC',
    'music-interstellar': 'ISTL MUSIC',
    'music-combat': 'COMBAT MUSIC',
    'bed-cabin': 'HULL',
    'bed-planetary': 'SATURN RADIO',
    'bed-interstellar': 'JUPITER RADIO',
    'bed-sheath': 'BOW SHEATH',
    'stem-drive': 'TORCH',
    'stem-rcs': 'RCS',
    'stem-harvest': 'HARVEST'
  };
  function syncAudioUi(s) {
    s = s || S.snap || {};
    var a = call('getAudioConfig') || s.audio || { enabled: true, master: 0.78, music: 0.68, drive: 0.78, ambience: 0.32, ui: 0.85, reverb: true };
    var enabled = a.enabled !== false;
    var reverbOn = a.reverb !== false;
    var tb = $('btn-audio-toggle');
    if (tb) {
      setData(tb, 'muted', enabled ? '0' : '1');
      tb.setAttribute('aria-expanded', S.audioPopOpen ? 'true' : 'false');
      tb.title = enabled
        ? 'Audio mixer (right-click or Shift+M to mute)'
        : 'Audio muted (right-click or Shift+M to unmute)';
    }
    var muteBtns = [$('btn-set-audio-mute'), $('btn-pop-audio-mute')];
    for (var mi = 0; mi < muteBtns.length; mi++) {
      var mb = muteBtns[mi];
      if (!mb) continue;
      setPressed(mb, enabled);
      setText(mb, enabled ? 'AUDIO ON' : 'MUTED');
    }
    var revBtns = [
      [$('btn-set-audio-reverb'), 'HULL IR ON', 'HULL IR OFF'],
      [$('btn-pop-audio-reverb'), 'IR ON', 'IR OFF']
    ];
    for (var ri = 0; ri < revBtns.length; ri++) {
      var rb = revBtns[ri][0];
      if (!rb) continue;
      setPressed(rb, reverbOn);
      setText(rb, reverbOn ? revBtns[ri][1] : revBtns[ri][2]);
    }
    var sliders = [
      ['rng-audio-master', 'out-audio-master', a.master, 0.78],
      ['rng-audio-music', 'out-audio-music', a.music, 0.68],
      ['rng-audio-drive', 'out-audio-drive', a.drive, 0.78],
      ['rng-audio-amb', 'out-audio-amb', a.ambience, 0.32],
      ['rng-audio-ui', 'out-audio-ui', a.ui, 0.85],
      ['rng-pop-master', 'out-pop-master', a.master, 0.78],
      ['rng-pop-music', 'out-pop-music', a.music, 0.68],
      ['rng-pop-drive', 'out-pop-drive', a.drive, 0.78],
      ['rng-pop-amb', 'out-pop-amb', a.ambience, 0.32],
      ['rng-pop-ui', 'out-pop-ui', a.ui, 0.85]
    ];
    for (var i = 0; i < sliders.length; i++) {
      var rEl = $(sliders[i][0]), oEl = $(sliders[i][1]);
      var pct = Math.round(clamp(num(sliders[i][2], sliders[i][3]), 0, 1) * 100);
      if (rEl && doc.activeElement !== rEl) rEl.value = String(pct);
      if (oEl) setText(oEl, pct + '%');
    }
    var d = call('getAudioDiagnostics');
    var popLayers = $('lh-pop-layers');
    if (popLayers) {
      if (!enabled) {
        setText(popLayers, 'ACTIVE: MUTED');
      } else if (d && Array.isArray(d.activeLayers) && d.activeLayers.length) {
        var mapped = d.activeLayers.map(function (id) { return LAYER_LABELS[id] || id; });
        setText(popLayers, 'ACTIVE: ' + mapped.join(' // '));
      } else {
        setText(popLayers, 'ACTIVE: STANDBY');
      }
    }
    var st = $('lh-audio-status');
    if (st) {
      if (d && d.supported) {
        var ready = Number(d.stemsLoaded || 0), total = Number(d.stemsTotal || 0);
        var stateTxt = !enabled ? 'MUTED' : d.unlocked ? 'ACTIVE' : 'READY (CLICK TO UNLOCK)';
        var irTxt = d.convolverReady ? (reverbOn ? ' // HULL IR ON' : ' // HULL IR BYPASS') : '';
        setText(st, 'NASA PD STEMS + MUSIC: ' + ready + '/' + (total || '?') + ' ' + stateTxt + irTxt);
      } else {
        setText(st, 'NASA PD STEMS + MUSIC: AUDIO HARDWARE UNAVAILABLE');
      }
    }
  }
  function setAudioPopOpen(open) {
    S.audioPopOpen = !!open;
    if (S.audioPopOpen && S.settingsOpen) setSettingsOpen(false);
    var pop = $('lh-audio-popover');
    if (pop) setHidden(pop, !S.audioPopOpen);
    syncAudioUi(S.snap);
  }
  function setPhotoMode(on) {
    S.photoMode = !!on;
    if (doc.body) doc.body.classList.toggle('lh-photo-mode', S.photoMode);
    setData($('main'), 'photo', S.photoMode ? '1' : '0');
    setPressed($('btn-photo-mode'), S.photoMode);
    setHidden($('btn-photo-exit'), !S.photoMode);
    if (S.photoMode) {
      if (S.audioPopOpen) setAudioPopOpen(false);
      if (S.settingsOpen) setSettingsOpen(false);
    }
    call('resizeScene');
    try { root.dispatchEvent(new root.Event('resize')); } catch (e) {}
    root.requestAnimationFrame(function () {
      call('resizeScene');
      try { root.dispatchEvent(new root.Event('resize')); } catch (e) {}
    });
  }
  var TUTORIAL_KEY = 'lh_tutorial_v1';
  var TUTORIAL_STEPS = [
    {
      tag: '01 // SHIP ARCHITECT & WEAPONS',
      title: 'DESIGN YOUR LIGHTHUGGER',
      img: 'prototypes/lighthugger/screenshots/step-01-architect.jpg',
      imgAlt: 'Drydock and Ship Architect preview showing a Gothic Cathedral hull',
      lead: 'Shape a 3+ km Conjoiner torchship in the Menu Customizer or Drydock [Y] before undocking.',
      bullets: [
        'HULL & ICE SHIELD: Bow-ice hulls hold their shield forward and brake with reverse thrust (-g). Dual-ice bi-cone hulls flip 180 deg at midpoint.',
        'WEAPONS BAY: Balance Core Power (MW) and Radiator Heat (MW) across Coilguns, UV FELs, Gamma Lances, Orbital Missiles, and automated PDCs.'
      ]
    },
    {
      tag: '02 // HELM MOUSE & KEY CONTROLS',
      title: 'FREE PILOT & CAMERA CONTROLS',
      img: 'prototypes/lighthugger/screenshots/step-02-helm.jpg',
      imgAlt: 'Undocked helm flight near Titan Cryo-Spindle with Fighter HUD active',
      lead: 'When undocked on Helm in PILOT mode, mouse and keyboard work together without fighting each other:',
      bullets: [
        'LEFT CLICK + HOLD & DRAG: Steer pitch up/down and yaw smoothly like a flight stick.',
        'RIGHT CLICK + HOLD & DRAG: Rotate external camera freely around your ship; scroll zooms.',
        'LEFT CLICK (WHEN WPN ARMED): Fire active guns; press [Q] or click MSL for AI missiles, [Tab] to cycle targets.',
        'KEYBOARD: [W]/[S] torch throttle (-2g..+2g), [A]/[D] yaw, [Z]/[C] roll, [F] brake/flip.'
      ]
    },
    {
      tag: '03 // ORBIT NAVIGATOR [N]',
      title: 'KEPLERIAN BURNS & TRANSFERS',
      img: 'prototypes/lighthugger/screenshots/step-03-orbits.jpg',
      imgAlt: 'Orbit Navigator 3D chronoscope plotting a transfer toward Titan',
      lead: 'Switch to Orbit Nav [N] to plot fuel-free Hohmann transfers, rendezvous, and continuous flip-burns.',
      bullets: [
        'DRAG & ZOOM: Drag the 3D chronoscope to inspect inclination, Hill spheres, Lagrange points, and mapped ice deposits.',
        'EXEC & WATCH: Commit burn chains directly onto the Helm and monitor burn gates in [V] 3D ORB overlay.'
      ]
    },
    {
      tag: '04 // 3D STARMAP [M] & 50 LY FRONTIER',
      title: 'CHART THE MILKY WAY',
      img: 'prototypes/lighthugger/screenshots/step-04-starmap.jpg',
      imgAlt: '3D Galactic Starmap showing nearby stars and the 50 LY frontier',
      lead: 'Explore 28 curated systems plus an endless rolling 50 LY frontier across the Milky Way disk.',
      bullets: [
        '3D ROTATION: Drag anywhere on the starmap to rotate yaw and tilt smoothly above or below the galactic plane.',
        'MILKY WAY ZOOM: Zoom all the way out or click MILKY WAY to inspect your galactocentric sector.',
        'FRONTIER SIGNALS: ~40% of procedural stars hold inhabited stations; ~60% are uninhabited ice worlds marked UNIDENTIFIED until surveyed.'
      ]
    },
    {
      tag: '05 // RELATIVISTIC FLIGHT & SURVIVAL',
      title: 'ABERRATION, DOPPLER & H-I SHIELDING',
      img: 'prototypes/lighthugger/screenshots/step-05-relativistic.jpg',
      imgAlt: 'Relativistic cruise with Cherenkov bow shock glowing across the ice cone',
      lead: 'Accelerating past 0.1c compresses starlight ahead (blueshift + aberration) and runs ship time slower than galactic epochs.',
      bullets: [
        'REL HUD [R] & SEXTANT [X]: Compare rest-frame star directions against Lorentz-aberrated directions and inspect Doppler shifts.',
        'ICE & RADIATORS: Deploy DropShips to harvest ring or comet ice, and dock at stations (or watch SAFE gamma governor) before hull ablation.'
      ]
    },
    {
      tag: '06 // ORBITAL COMBAT & ARCHIVES',
      title: 'KINETIC ORBITS, MISSILES & SAVES',
      img: 'prototypes/lighthugger/screenshots/step-06-combat.jpg',
      imgAlt: 'Orbital combat near Saturn with locked hostile target and weapons armed',
      lead: 'Physical rounds obey the gravity well around worlds, and your Archive [A] preserves custom ships and voyages.',
      bullets: [
        'ORBITAL SLUGS & AI MISSILES: Coilgun/RKV slugs coast along curved Keplerian orbits while AI missiles run ProNav + gravity-compensated intercept.',
        'SAVE STATES: Voyages auto-save locally; use ARCHIVE [A] for snapshots, JSON bundles, and portable LH3 share codes.'
      ]
    }
  ];
  function loadTutorialPrefs() {
    S.tutorialShowOnLaunch = true;
    try {
      var raw = root.localStorage && root.localStorage.getItem(TUTORIAL_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.showOnLaunch === false) S.tutorialShowOnLaunch = false;
      }
    } catch (e) {}
  }
  function saveTutorialPrefs() {
    try {
      if (root.localStorage) {
        root.localStorage.setItem(TUTORIAL_KEY, JSON.stringify({ showOnLaunch: !!S.tutorialShowOnLaunch }));
      }
    } catch (e) {}
  }
  function syncTutorialControls() {
    var chk = $('chk-tut-launch');
    if (chk && chk.checked !== !!S.tutorialShowOnLaunch) chk.checked = !!S.tutorialShowOnLaunch;
    var btn = $('btn-set-tut-auto');
    if (btn) {
      setPressed(btn, !!S.tutorialShowOnLaunch);
      setText(btn, S.tutorialShowOnLaunch ? 'ON LAUNCH: ON' : 'ON LAUNCH: OFF');
    }
  }
  function renderTutorialStep() {
    var total = TUTORIAL_STEPS.length;
    var idx = clamp(num(S.tutorialStep, 0), 0, total - 1);
    S.tutorialStep = idx;
    var step = TUTORIAL_STEPS[idx];
    setText($('lh-tut-step-badge'), 'STEP ' + (idx + 1) + ' / ' + total);
    setText($('lh-tut-tag'), step.tag);
    setText($('lh-tut-title'), step.title);
    var tutImg = $('lh-tut-img');
    if (tutImg && step.img) {
      if (tutImg.getAttribute('src') !== step.img) tutImg.setAttribute('src', step.img);
      tutImg.setAttribute('alt', step.imgAlt || step.title);
    }
    var copy = $('lh-tut-body');
    if (copy) {
      copy.textContent = '';
      copy.appendChild(el('p', '', step.lead));
      if (Array.isArray(step.bullets) && step.bullets.length) {
        var ul = el('ul', 'lh-tut-list');
        step.bullets.forEach(function (line) {
          var colon = line.indexOf(':');
          var li = doc.createElement('li');
          if (colon > 0 && colon < 34) {
            li.appendChild(el('strong', '', line.slice(0, colon + 1)));
            li.appendChild(doc.createTextNode(line.slice(colon + 1)));
          } else {
            li.textContent = line;
          }
          ul.appendChild(li);
        });
        copy.appendChild(ul);
      }
    }
    var dots = $('lh-tut-dots');
    if (dots) {
      dots.textContent = '';
      for (var i = 0; i < total; i++) {
        var dBtn = el('button', 'lh-tut-dot', String(i + 1));
        dBtn.type = 'button';
        dBtn.dataset.tutStep = String(i);
        dBtn.setAttribute('role', 'tab');
        dBtn.setAttribute('aria-selected', i === idx ? 'true' : 'false');
        dots.appendChild(dBtn);
      }
    }
    setDisabled($('btn-tut-prev'), idx === 0);
    setText($('btn-tut-next'), idx === total - 1 ? 'FLY NOW' : 'NEXT');
    syncTutorialControls();
  }
  function setTutorialOpen(open, stepIdx) {
    S.tutorialOpen = !!open;
    if (Number.isInteger(stepIdx)) S.tutorialStep = clamp(stepIdx, 0, TUTORIAL_STEPS.length - 1);
    if (S.tutorialOpen) {
      if (S.settingsOpen) setSettingsOpen(false);
      if (S.audioPopOpen) setAudioPopOpen(false);
      renderTutorialStep();
    }
    var mod = $('lh-tutorial-modal');
    if (mod) setHidden(mod, !S.tutorialOpen);
  }
  function syncSettings(s) {
    s = s || S.snap || {};
    var g = s.graphics || call('getGraphics') || { aa: 'msaa4', renderScale: 1, autoOrbit: true };
    qa('[data-gfx-aa]').forEach(function (b) { setPressed(b, b.dataset.gfxAa === g.aa); });
    qa('[data-gfx-scale]').forEach(function (b) { setPressed(b, Math.abs(num(b.dataset.gfxScale, 1) - num(g.renderScale, 1)) < 0.05); });
    var ao = $('btn-set-autoorbit');
    if (ao) {
      setPressed(ao, !!g.autoOrbit);
      setText(ao, g.autoOrbit ? 'AUTO-ORBIT ON' : 'AUTO-ORBIT OFF');
    }
    var vo = $('btn-set-vectors');
    if (vo) {
      var vecOn = !!(s.showOrbitsInHelm != null ? s.showOrbitsInHelm : s.vectors);
      setPressed(vo, vecOn);
      setText(vo, vecOn ? '3D ORB ON' : '3D ORB OFF');
    }
    var ob = $('btn-settings-open');
    if (ob) ob.setAttribute('aria-expanded', S.settingsOpen ? 'true' : 'false');
    syncTutorialControls();
    syncAudioUi(s);
  }
  function setSettingsOpen(open) {
    S.settingsOpen = !!open;
    if (S.settingsOpen && S.audioPopOpen) setAudioPopOpen(false);
    if (S.settingsOpen && S.tutorialOpen) setTutorialOpen(false);
    var mod = $('lh-settings-modal');
    if (mod) setHidden(mod, !S.settingsOpen);
    syncSettings(S.snap);
  }
  function setKgOpen(open) {
    S.kgOpen = !!open;
    setData($('main'), 'kg', S.kgOpen ? 'open' : 'closed');
    setHidden($('kg-deck'), !S.kgOpen);
    syncKgToggle();
  }
  function toggleStationDeck(button) {
    var bays = $(button.getAttribute('aria-controls'));
    setHidden(bays, !bays.hidden);
    button.setAttribute('aria-expanded', String(!bays.hidden));
    setText(button, bays.hidden ? '\u25b2 DEPLOY' : '\u25bc STOW');
    S.o3At = 0;
    S.orbitView.dirty = true;
  }

  function isScopeVisible() {
    return S.screen === 'sextant';
  }
  function syncDeepSpace(s) {
    var deep = !!(s && s.inDeepSpace);
    var navBtn = $('btn-nav-orbits');
    if (navBtn) {
      setDisabled(navBtn, deep);
      navBtn.classList.toggle('is-disabled', deep);
      navBtn.title = deep
        ? 'Deep space (> 1 light-week from nearest star) -- use STARMAP [M]'
        : 'Orbital Navigator [N]';
    }
    var scr = $('lh-screen-orbits'), slate = $('lh-orbit-deepspace');
    if (scr) scr.classList.toggle('is-deepspace', deep);
    if (slate) {
      setHidden(slate, !deep);
      if (deep) {
        var nearName = upper((s && s.nearestStarName) || 'SOL');
        var distLy = num(s && s.nearestStarDistLy, NaN);
        setText($('lh-deep-dist'), 'NEAREST STAR: ' + nearName + (Number.isFinite(distLy) ? MID + distLy.toFixed(2) + ' LY (> 1 LIGHT-WEEK)' : ''));
      }
    }
  }

  // ------------------------------------------------------------ keyboard
  function isTyping(t) {
    if (!t) return false;
    var tag = (t.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'select') return true;
    if (tag === 'input') {
      var ty = (t.type || '').toLowerCase();
      return ty !== 'range' && ty !== 'checkbox' && ty !== 'button';
    }
    return !!t.isContentEditable;
  }
  function onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key;
    if (isTyping(e.target)) {
      if (k === 'Escape') e.target.blur();
      return;
    }
    var lk = k && k.length === 1 ? k.toLowerCase() : k;
    var handled = true;
    switch (lk) {
      case 'Escape':
        if (S.photoMode) setPhotoMode(false);
        else if (S.tutorialOpen) setTutorialOpen(false);
        else if (S.audioPopOpen) setAudioPopOpen(false);
        else if (S.settingsOpen) setSettingsOpen(false);
        else if (S.screen === 'helm' || S.screen === 'menu') setSettingsOpen(true);
        else showScreen('helm');
        break;
      case 'n': toggleScreen('orbits'); break;
      case 'm':
        if (e.shiftKey) {
          var mNext = call('toggleAudioMute');
          if (S.snap && mNext) S.snap.audio = mNext;
          syncAudioUi(Object.assign({}, S.snap, { audio: mNext }));
          call('playUiSound', 'toggle');
        } else {
          toggleScreen('starmap');
        }
        break;
      case 'y': toggleScreen('drydock'); break;
      case 'x': toggleScreen('sextant'); break;
      case '?': case '/': toggleScreen('manual'); break;
      case 'k': if (S.screen !== 'helm') showScreen('helm'); setKgOpen(!S.kgOpen); break;
      case 'c': {
        if (S.screen === 'helm' && !(S.snap && S.snap.docked)) { handled = false; break; }
        var curCam = (S.snap.drydock && S.snap.drydock.cam) || S.snap.drydockCam || 'orbit';
        var nextCam = curCam === 'concourse' ? 'orbit' : 'concourse';
        call('setDrydockCam', nextCam);
        qa('[data-dcam]').forEach(function (b) { setPressed(b, b.dataset.dcam === nextCam); });
        break;
      }
      case 'f': call('toggleFlip'); break;
      case 'v': call('toggleVectors'); break;
      case 'h':
        if (e.shiftKey) {
          setPhotoMode(!S.photoMode);
          call('playUiSound', 'tab');
          break;
        }
        if (S.screen === 'helm') { call('toggleHudFlight'); break; }
        handled = false;
        break;
      case 'r': if (S.screen === 'helm') { call('toggleHudRel'); break; } handled = false; break;
      case 'g': if (S.screen === 'helm') { call('toggleHudWeapons'); break; } handled = false; break;
      case 'l': if (S.screen === 'helm') { call('toggleCamLock'); break; } handled = false; break;
      case 'u': if (S.screen === 'helm') { call('toggleHideShip'); break; } handled = false; break;
      case '0': localThrust(0); call('stopAll'); break;
      case '1': call('setTimeWarp', 1); break;
      case '2': call('setTimeWarp', 100); break;
      case '3': call('setTimeWarp', 10000); break;
      case '4': call('setTimeWarp', 1000000); break;
      case '5': call('setTimeWarp', 'interstellar'); break;
      case '6': call('setTimeWarp', 'hyper'); break;
      default: handled = false;
    }
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  }
  // Capture-phase so the app's held-key listener never sees an archive keypress as yaw-left.
  // Plain A steers on the helm and sextant, so there the archive needs Shift+A.
  function onArchiveKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
    if (!e.key || e.key.toLowerCase() !== 'a') return;
    var flight = S.screen === 'helm' || S.screen === 'sextant';
    if (flight && !e.shiftKey) return;
    if (!e.repeat) toggleScreen('archive');
    e.preventDefault(); e.stopPropagation();
  }

  // ------------------------------------------------------------ helm HUD
  var MODE_LABEL = { docked: 'DOCKED', orbit: 'ORBIT', burn: 'BURNING', interstellar: 'INTERSTELLAR',
    coast: 'COAST', escape: 'ESCAPE', arrival: 'ARRIVAL' };
  var THERMAL_TXT = { nominal: 'NOMINAL', elevated: 'ELEVATED', critical: 'CRITICAL ABLATION' };

  // Conjoiner core thermal state: snap.thermal (app) first, then flat snap fields.
  function coreThermal(s) {
    var t = s.thermal || {};
    var heat = clamp(num(t.coreHeat, num(s.coreHeat, 0)), 0, 1);
    var state = t.state || s.thermalState || (heat >= 0.96 ? 'overload' : heat >= 0.8 ? 'hot' : heat >= 0.55 ? 'warm' : 'nominal');
    var specs = getSpecs(s) || {};
    return {
      heat: heat, state: state, governor: !!(t.governor || s.thermalGovernor),
      sustainedG: num(t.sustainedAccelG, num(specs.sustainedAccelG, NaN)),
      headroom: num(t.headroom, num(specs.thermalHeadroom, NaN))
    };
  }

  function syncTelemetry(s) {
    var sys = curSys(s), o = s.orbit || {};
    var mode = s.mode || (s.docked ? 'docked' : (inTransit(s) ? 'interstellar' : 'orbit'));
    if (s.burn && s.burn.active && mode === 'orbit') mode = 'burn';
    var ship = $('lh-tm-ship'), shipName = upper(s.shipName || (s.genome && s.genome.name) || 'Long Patience');
    setText(ship, shipName);
    if (ship && ship.title !== shipName) ship.title = shipName;
    var modeEl = $('lh-tm-mode');
    setText(modeEl, MODE_LABEL[mode] || upper(mode));
    setData(modeEl, 'mode', mode);

    var planet = sys && sys.planets && sys.planets[o.planetIdx || 0];
    var bodyName = o.bodyName || (o.focusSoi === 'star' ? (sys && sys.name) : (planet && planet.name));
    var where = [upper(s.systemName || (sys && sys.name) || '')];
    if (inTransit(s)) where.push('\u2192 ' + upper(s.destName || DASH));
    else {
      if (bodyName) where.push(upper(bodyName) + (o.focusSoi === 'star' ? ' SOI' : ''));
      if (s.docked) where.push(upper(s.stationName || (sys && sys.station && sys.station.name) || ''));
    }
    setText($('lh-tm-where'), where.filter(Boolean).join(inTransit(s) ? ' ' : MID));

    if (inTransit(s)) {
      var tmBeta = clamp(num(s.beta, 0), 0, 0.999999);
      var tmGamma = Math.max(1, num(s.gamma, 1));
      if (tmBeta >= GAMMA_SWITCH_BETA) {
        setText($('lh-tm-k1'), GAMMA); setText($('lh-tm-v1'), tmGamma.toFixed(2));
        setText($('lh-tm-k2'), BETA); setText($('lh-tm-v2'), tmBeta.toFixed(5) + 'c');
      } else {
        setText($('lh-tm-k1'), BETA); setText($('lh-tm-v1'), tmBeta.toFixed(4) + 'c');
        setText($('lh-tm-k2'), GAMMA); setText($('lh-tm-v2'), tmGamma.toFixed(3));
      }
      setText($('lh-tm-k3'), 'DIST');
      setText($('lh-tm-v3'), Number.isFinite(s.distToDestLy) ? s.distToDestLy.toFixed(3) + ' LY' : DASH);
    } else {
      var R = num(o.bodyRadiusKm, o.focusSoi === 'star' ? (sys ? sys.starRadiusKm : 0) : (planet ? planet.radiusKm : 0));
      var el0 = o.el || {};
      var rp = num(el0.rp, NaN), ra = num(el0.ra, NaN);
      var pe = num(o.peAltKm, rp - R), ap = num(o.apAltKm, ra - R);
      var radius = isArr3(o.rKm) ? len3(o.rKm) : NaN;
      var alt = num(o.altKm, radius - R);
      var v = num(o.vOrbKmS, isArr3(o.vKmS) ? len3(o.vKmS) : NaN);
      setText($('lh-tm-k1'), 'PE / AP');
      setText($('lh-tm-v1'), Number.isFinite(pe) ? fmtKm(pe) + ' / ' + (Number.isFinite(ap) && el0.e < 1 ? fmtKm(ap) : 'ESC') : DASH);
      setText($('lh-tm-k2'), 'ALT');
      setText($('lh-tm-v2'), s.docked ? 'BERTH' : fmtKm(alt));
      setText($('lh-tm-k3'), 'V ORB');
      setText($('lh-tm-v3'), Number.isFinite(v) && !s.docked ? v.toFixed(3) + ' km/s' : DASH);
    }
    var thr = Number.isFinite(s.thrustG) ? s.thrustG : num(s.thrustCmdG, 0);
    var revBrk = !!s.reversibleDrive && thr < -0.02;
    setText($('lh-tm-thrust'), (thr >= 0 ? '+' : '') + thr.toFixed(2) + 'g' + (revBrk ? ' REV' : s.flip ? ' FLIP' : ''));

    var th = coreThermal(s), ice = clamp(num(s.iceIntegrity, 1), 0, 1);
    var hull = clamp(num(s.hullIntegrity, 1), 0, 1);
    var dmgState = String(s.damageState || (hull <= 0 ? 'destroyed' : hull <= 0.35 ? 'critical' : hull <= 0.70 ? 'damaged' : 'nominal'));
    var fc = $('lh-tm-core-fill'), fi = $('lh-tm-ice-fill'), fh = $('lh-tm-hull-fill');
    if (fc) { fc.style.width = (th.heat * 100).toFixed(1) + '%'; setData(fc, 'state', th.state); }
    if (fi) { fi.style.width = (ice * 100).toFixed(1) + '%'; setData(fi, 'low', ice < 0.3 ? '1' : '0'); }
    if (fh) { fh.style.width = (hull * 100).toFixed(1) + '%'; setData(fh, 'state', dmgState); }
    setText($('lh-tm-core'), fmtPct(th.heat, 0) + (th.governor ? String.fromCharCode(0x2193) : ''));
    setText($('lh-tm-ice'), fmtPct(ice, 0));
    setText($('lh-tm-hull'), fmtPct(hull, 0));
    setText($('lh-tm-drive'), 'CONJOINER // ' + (s.reversibleDrive === false ? 'FLIP-BURN' : 'REVERSIBLE') + (Number.isFinite(th.sustainedG) ? MID + 'SUST ' + th.sustainedG.toFixed(2) + 'g' : '') +
      (th.governor ? MID + 'GOVERNED' : ''));

    // The status row reports whichever is worse: H-I ISM ablation, core heat, combat alert, or hull damage.
    var lvl = (s.ablation && s.ablation.warningLevel) || 'nominal', txt = THERMAL_TXT[lvl] || upper(lvl);
    var lblTxt = 'H-I ISM // CORE';
    if (inTransit(s)) {
      lblTxt = s.flip && s.hasAftIce ? 'H-I ISM // AFT ICE' : 'H-I ISM // BOW ICE';
    }
    var coreLvl = th.state === 'overload' ? 'critical' : th.state === 'hot' ? 'elevated' : 'nominal';
    var rank = { nominal: 0, elevated: 1, critical: 2 };
    if ((rank[coreLvl] || 0) > (rank[lvl] || 0)) { lvl = coreLvl; txt = 'CORE ' + upper(th.state); }
    else if (inTransit(s) && lvl === 'nominal') { txt = 'SHIELDED'; }
    var combatHostile = Boolean(s.combat && s.combat.hostileCount > 0 && s.combat.alertS > 0);
    var curRank = rank[lvl] || 0;
    if (s.destroyed) { lvl = 'critical'; txt = 'VESSEL LOST'; lblTxt = 'HULL STATUS'; }
    else if (dmgState === 'critical' && curRank <= 2) { lvl = 'critical'; txt = 'HULL CRITICAL'; lblTxt = 'HULL STATUS'; }
    else if (combatHostile && curRank < 2) { lvl = 'elevated'; txt = 'UNDER FIRE'; lblTxt = 'TACTICAL'; }
    else if (dmgState === 'damaged' && curRank < 1) { lvl = 'elevated'; txt = 'HULL DAMAGED'; lblTxt = 'HULL STATUS'; }
    setText($('lh-tm-thermal-lbl'), lblTxt);
    setData($('lh-tm-thermal'), 'level', lvl);
    setText($('lh-tm-thermal-txt'), txt);

    var d = s.dock || {}, dockTxt;
    if (s.docked) {
      dockTxt = 'NEXT: UNDOCK' + MID + '[N] ORBITS' + MID + '[M] JUMP';
    } else if (s.burn && s.burn.active) {
      dockTxt = 'AUTO-BURN' + MID + upper(s.burn.label || 'ORBIT') + (Number.isFinite(s.burn.progress) ? ' ' + Math.round(s.burn.progress * 100) + '%' : '');
    } else if (inTransit(s)) {
      var phLbl = transitLabel(s) || 'CRUISE';
      var remTxt = Number.isFinite(s.missionRemLy) ? (MID + s.missionRemLy.toFixed(2) + ' LY') : '';
      dockTxt = phLbl + (s.destName ? ' \u2192 ' + upper(s.destName) : '') + remTxt;
    } else if (d.inRange) {
      dockTxt = 'CORRIDOR LOCK' + MID + 'DOCK & RE-GLAZE';
    } else if (Number.isFinite(d.distKm)) {
      dockTxt = 'DOCK ' + fmtKm(d.distKm) + MID + '[N] MATCH' + MID + '[M] JUMP';
    } else {
      dockTxt = 'ORBIT' + MID + '[N] ORBITS' + MID + '[M] STARMAP';
    }
    var dEl = $('lh-tm-dock');
    setText(dEl, dockTxt);
    setData(dEl, 'ok', s.docked || d.inRange ? '1' : '0');
    setData(dEl, 'transit', inTransit(s) ? '1' : '0');
    var clk = 'EPOCH ' + num(s.epochYear, 2370).toFixed(2) + MID + TAU + ' ' + num(s.tauYears, 0).toFixed(2) + ' yr';
    var warp = Math.max(1, num(s.effectiveWarp, 1));
    var warpRate = warp >= 31557600 * 0.05 ? 'rel' : (warp >= 1.35 ? 'fast' : 'realtime');
    var warpShort = formatWarpShort(warp);
    var autoTag = (s.burn && s.burn.firing) ? '1\u00d7 IGNITION'
      : warp < 1.35 ? '1\u00d7 REALTIME'
      : ((s.autoClock || (s.burn && s.burn.active) || inTransit(s)) ? 'AUTO ' : 'WARP ') + warpShort;
    var simT = Math.max(0, num(s.simTimeS, 0));
    var digitalClock = formatPhysicalClock(simT);
    setText($('lh-tm-clock'), digitalClock + MID + warpShort);
    setText($('kg-clock-text'), digitalClock + MID + clk + MID + warpShort);
    setText($('kg-stowed-clock'), digitalClock + MID + warpShort);
    var cwEl = $('lh-chrono-warp');
    var rateTag = (s.burn && s.burn.firing) ? 'fast' : warpRate;
    setText(cwEl, autoTag);
    setData(cwEl, 'rate', rateTag);
    setData($('lh-chrono-led'), 'rate', rateTag);
    setText($('lh-chrono-epoch'), digitalClock);
    var gammaVal = Math.max(1, num(s.gamma, 1));
    var invG = 1 / gammaVal;
    var subTxt = 'EP ' + num(s.epochYear, 2370).toFixed(2) + MID + TAU + ' +' + num(s.tauYears, 0).toFixed(2) + ' yr';
    if (s.burn && s.burn.active) {
      subTxt += MID + (s.burn.firing ? 'IGNITION' : ('BURN T-' + fmtDur(s.burn.etaS)));
    } else if (inTransit(s) || gammaVal > 1.02) {
      subTxt += MID + GAMMA + ' ' + gammaVal.toFixed(2);
    } else {
      subTxt += MID + (s.autoClock ? 'AUTO' : 'MANUAL');
    }
    setText($('lh-chrono-sub'), subTxt);
    var dilFill = $('lh-chrono-dil-fill');
    if (dilFill) dilFill.style.width = (invG * 100).toFixed(1) + '%';
    setText($('lh-chrono-dil-pct'), invG >= 0.1 ? (Math.round(invG * 100) + '%') : ((invG * 100).toFixed(1) + '%'));
    var wNorm = warpToNorm(warp);
    var wTicks = $('kg-warp-vernier-ticks');
    if (wTicks) wTicks.style.backgroundPosition = (-(wNorm * 240)).toFixed(1) + 'px 0';
    var wWheel = $('kg-warp-vernier');
    if (wWheel) wWheel.setAttribute('aria-valuenow', wNorm.toFixed(3));
    setText($('kg-warp-vernier-cap'), 'WARP TRIM ' + warpShort + ' \u2194');
    drawChronoDial(s, warp, gammaVal, rateTag);
  }
  function drawChronoDial(s, warp, gammaVal, rateTag) {
    var cv = $('lh-chrono-dial');
    if (!cv) return;
    var ctx = cv.getContext('2d');
    if (!ctx) return;
    var W = cv.width || 120, H = cv.height || 120, cx = W / 2, cy = H / 2, R = Math.min(cx, cy) - 4;
    var now = performance.now();
    var dt = S.chrono.lastAt ? Math.min(0.1, Math.max(0, (now - S.chrono.lastAt) / 1000)) : 0.016;
    S.chrono.lastAt = now;
    var omega = warp < 1.35 ? 0.55 : Math.min(9.5, 0.55 + Math.log10(warp) * 1.25);
    var dGal = dt * omega * (s.reducedMotion ? 0 : 1);
    S.chrono.galAng = (S.chrono.galAng + dGal) % (Math.PI * 2);
    S.chrono.tauAng = (S.chrono.tauAng + dGal / Math.max(1, gammaVal)) % (Math.PI * 2);

    ctx.clearRect(0, 0, W, H);
    var bg = ctx.createRadialGradient(cx - 8, cy - 8, 4, cx, cy, R);
    bg.addColorStop(0, '#182433');
    bg.addColorStop(0.68, '#0b121c');
    bg.addColorStop(1, '#05080f');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    // 60 outer galactic bezel tick marks
    for (var i = 0; i < 60; i++) {
      var a = (i / 60) * Math.PI * 2 - Math.PI / 2;
      var major = i % 5 === 0;
      var r0 = R - (major ? 7 : 4), r1 = R - 1;
      ctx.strokeStyle = major ? 'rgba(182, 224, 255, 0.72)' : 'rgba(116, 152, 184, 0.34)';
      ctx.lineWidth = major ? 1.5 : 0.9;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }

    var galCol = rateTag === 'rel' ? '#3ae8ff' : rateTag === 'fast' ? '#ffc94d' : '#7ae8ff';
    var gAng = S.chrono.galAng - Math.PI / 2;
    var tAng = S.chrono.tauAng - Math.PI / 2;

    // Outer Galactic Coordinate Ring (t)
    ctx.strokeStyle = 'rgba(120, 210, 255, 0.16)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(cx, cy, R - 11, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = galCol;
    ctx.lineWidth = 3.6;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, cy, R - 11, gAng - 0.95, gAng); ctx.stroke();

    // Inner Ship Proper Time Ring (tau)
    ctx.strokeStyle = 'rgba(99, 255, 141, 0.14)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(cx, cy, R - 23, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#63ff8d';
    ctx.lineWidth = 3.6;
    ctx.beginPath(); ctx.arc(cx, cy, R - 23, tAng - 0.95, tAng); ctx.stroke();

    // Sweeping Galactic & Proper-time hands
    ctx.lineCap = 'round';
    ctx.strokeStyle = galCol;
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(gAng) * (R - 8), cy + Math.sin(gAng) * (R - 8));
    ctx.stroke();

    ctx.strokeStyle = '#8affab';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(tAng) * (R - 20), cy + Math.sin(tAng) * (R - 20));
    ctx.stroke();

    // Central pivot jewel
    ctx.fillStyle = '#d8f4ff';
    ctx.beginPath(); ctx.arc(cx, cy, 4.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#071420';
    ctx.beginPath(); ctx.arc(cx, cy, 1.8, 0, Math.PI * 2); ctx.fill();
  }

  function derivePrimary(s) {
    if (s.primaryAction && s.primaryAction.id) return s.primaryAction;
    if (s.burn && s.burn.active) return { id: 'cancel', label: 'CANCEL BURN' };
    if (inTransit(s)) return { id: 'abort', label: 'ABORT TRANSIT' };
    if (s.docked) return { id: 'undock', label: 'UNDOCK' };
    if (s.dock && s.dock.inRange) return { id: 'dock', label: 'DOCK & RE-GLAZE' };
    if (S.selTarget) return { id: 'match', label: 'MATCH ORBIT' };
    return { id: 'orbits', label: 'PLAN ORBIT [N]' };
  }
  function runPrimary(id) {
    switch (id) {
      case 'undock': call('undock'); break;
      case 'dock': call('dock'); break;
      case 'match': executeOrbit(); break;
      case 'cancel': call('cancelOrbitBurn'); break;
      case 'abort': call('abortInterstellar'); break;
      case 'orbits': showScreen('orbits'); break;
      case 'starmap': showScreen('starmap'); break;
      default: if (typeof A[id] === 'function') call(id);
    }
  }

  function warpKey(w) { return w == null ? '1' : String(w); }
  function syncHelmStrip(s) {
    var thr = currentThrust(s);
    qa('#lh-helm-strip [data-thrust-set]').forEach(function (b) {
      setPressed(b, Math.abs(num(b.dataset.thrustSet, 99) - thr) < 0.011);
    });
    var flipStripBtn = doc.querySelector('#lh-helm-strip [data-helm="flip"]');
    var isRev = s.reversibleDrive !== false;
    if (flipStripBtn) {
      setText(flipStripBtn, isRev ? 'REV BRAKE' : 'FLIP 180\u00b0');
      flipStripBtn.title = isRev
        ? 'Single bow-ice hull: reverse thrust (-g) slows down without flipping [F]'
        : 'Dual-ice hull: flip 180 deg and fire aft main bells forward to brake [F]';
      setPressed(flipStripBtn, isRev ? thr < -0.02 : !!s.flip);
    }
    var w = s.autoClock ? 'auto' : warpKey(s.timeWarp);
    qa('[data-warp]').forEach(function (b) {
      var dw = b.dataset.warp;
      setPressed(b, dw === w);
      setDisabled(b, !!s.docked && dw !== 'auto' && dw !== '1');
    });
    var att = s.attitude || 'prograde';
    qa('[data-att]').forEach(function (b) {
      if (b.dataset.att === 'normal') setText(b, att === 'antinormal' ? 'ANTI-NRM' : 'NORMAL');
      if (b.dataset.att === 'manual') b.title = 'A/D or Arrows yaw, Q/E or Arrows pitch, Z/C roll. Steering releases attitude lock. Turn rate scales by 1/gamma.';
      if (b.dataset.att === 'retrograde') b.title = 'Align retrograde [B]';
      setPressed(b, b.dataset.att === att || (att === 'antinormal' && b.dataset.att === 'normal'));
    });
    var hud = s.hud || {};
    var hudRel = !!hud.rel;
    var hudFlt = !!hud.flight && !hudRel;
    var hudWpn = !!hud.weapons;
    var camLock = !!hud.camLock;
    var hideShip = !!hud.hideShip;
    qa('#lh-helm-strip [data-hud-toggle]').forEach(function (b) {
      var k = b.dataset.hudToggle;
      setPressed(b, k === 'flt' ? hudFlt : k === 'rel' ? hudRel : k === 'wpn' ? hudWpn : k === 'hide' ? hideShip : camLock);
    });
    var pa = derivePrimary(s), btn = $('lh-primary-action');
    var deckBtn = $('lh-deck-primary');
    if (deckBtn) { setText(deckBtn, pa.label); deckBtn.dataset.action = pa.id; }
    if (btn) {
      setText(btn, pa.label || upper(pa.id));
      setData(btn, 'action', pa.id);
      setDisabled(btn, pa.enabled === false);
    }
  }

  function syncWarning(s) {
    var w = s.warning, lvl = (s.ablation && s.ablation.warningLevel) || 'nominal';
    var title = '', text = '', level = '';
    if (w && w.text) { title = w.title || 'WARNING'; text = w.text; level = w.level || 'elevated'; }
    else if (lvl === 'critical') { title = 'CRITICAL ABLATION'; text = 'Ice shield losing mass fast. Reduce ' + BETA + ', fly bow-first, or brake.'; level = 'critical'; }
    else if (!s.docked && coreThermal(s).heat >= 0.8) {
      title = 'CORE HOT'; level = 'elevated';
      text = 'Conjoiner core at ' + fmtPct(coreThermal(s).heat, 0) + '. Ease the torch or coast so the radiators can shed heat.';
    }
    var box = $('lh-warning'), el = $('lh-warn');
    var source = w && w.source || '';
    if (el.dataset.source !== source) el.dataset.source = source;
    var spin = el.dataset.source === 'spin';
    var host = spin ? $('main') : $('lh-notice-stack');
    if (box.parentNode !== host) host.prepend(box);
    if (spin) {
      var navBottom = $('lh-screenbar').getBoundingClientRect().bottom;
      var telemetryBottom = $('lh-telemetry').getBoundingClientRect().bottom;
      var deckTop = $('lh-bottom').getBoundingClientRect().top;
      var onRight = root.innerWidth >= 601 && telemetryBottom + 30 > deckTop;
      var top = Math.ceil((onRight ? navBottom : Math.max(navBottom, telemetryBottom)) - host.getBoundingClientRect().top) + 6;
      setData(box, 'side', onRight ? 'right' : 'left');
      if (box.style.getPropertyValue('--lh-spin-top') !== top + 'px') box.style.setProperty('--lh-spin-top', top + 'px');
    }
    var displayTitle = title, displayText = text;
    if (spin && text) {
      var spinVal = Math.max(0, num(s.spinG, 0));
      var gTxt = (spinVal >= 10 ? Math.round(spinVal) : spinVal.toFixed(1)) + 'g';
      displayTitle = level === 'critical' ? 'SPIN CAP' : 'SPIN WARN';
      displayText = gTxt + MID + (level === 'critical' ? 'RCS CAPPED <5g' : 'EASE ROTATION');
      var fullTip = title + ' - ' + text;
      if (el.title !== fullTip) el.title = fullTip;
    } else if (el.title) {
      el.title = '';
    }
    setHidden(box, !text);
    if (text) { setData(box, 'level', level); setText($('lh-warning-title'), displayTitle); setText($('lh-warning-text'), displayText); }
  }

  function syncHarvestBar(s) {
    var bar = $('lh-harvest-bar');
    if (!bar) return;
    var h = s.iceHarvest || {};
    var active = !!h.active;
    setHidden(bar, !active);
    if (!active) return;
    var p = clamp(num(h.progress, 0), 0, 1);
    var pct = Math.round(p * 100);
    var phaseTxt = h.phase === 'outbound' ? 'EN ROUTE'
      : h.phase === 'collecting' ? 'MINING H2O ICE' : 'RETURNING';
    var icePct = Math.round(clamp(num(s.iceIntegrity, num(s.iceShield, 1)), 0, 1) * 100);
    var remSim = Number.isFinite(h.remainingSimS) ? h.remainingSimS : num(h.timerS, 0);
    var distTxt = (Number.isFinite(h.distKm) && h.distKm > 0) ? (fmtKm(h.distKm) + MID) : '';
    var warp = Math.max(1, num(s.effectiveWarp, 1));
    var rateLbl = warp < 1.35 ? 'REALTIME 1\u00d7 (SLOW)' : ((s.autoClock ? 'AUTO ' : 'WARP ') + formatWarpShort(warp));
    setText($('lh-harvest-title'), 'COLLECTING ICE FROM SYSTEM');
    setText($('lh-harvest-pct'), pct + '%');
    var fill = $('lh-harvest-fill');
    if (fill) fill.style.width = (p * 100).toFixed(1) + '%';
    setText($('lh-harvest-sub'), (h.siteName ? upper(h.siteName) + MID : '') + distTxt + phaseTxt + MID + 'ETA ' + fmtDur(remSim) + MID + 'ICE ' + icePct + '%' + MID + rateLbl);
  }

  // --------------------------------------------------------- KG console
  function currentThrust(s) {
    var g = Number.isFinite(s.thrustCmdG) ? s.thrustCmdG : num(s.thrustG, S.thrustLocal);
    S.thrustLocal = g;
    return g;
  }
  function localThrust(g) {
    S.thrustLocal = g;
    paintThrottle(g);
    return g;
  }
  function sendThrust(g) {
    var command = clamp(Math.round(g * 100) / 100, -2, 2);
    var accepted = call('setThrustG', command);
    localThrust(Number.isFinite(accepted) ? accepted : command);
  }
  function paintThrottle(g) {
    var slot = $('kg-quadrant-slot'), h = $('kg-throttle-handle'), fill = $('kg-slot-fill');
    if (!slot || !h) return;
    var t = (2 - g) / 4; // 0 at +2g top, 1 at -2g bottom
    h.style.top = (8 + t * 84).toFixed(2) + '%';
    h.setAttribute('aria-valuenow', g.toFixed(2));
    h.classList.toggle('is-retro', g < 0);
    if (fill) {
      var mid = 50, pos = 8 + t * 84;
      fill.style.top = Math.min(mid, pos).toFixed(2) + '%';
      fill.style.height = Math.abs(pos - mid).toFixed(2) + '%';
      fill.classList.toggle('is-retro', g < 0);
    }
    var vt = $('kg-vernier-ticks');
    if (vt) vt.style.backgroundPosition = (g * 60).toFixed(1) + 'px 0';
    var vw = $('kg-vernier-wheel');
    if (vw) vw.setAttribute('aria-valuenow', g.toFixed(2));
  }
  function syncKg(s) {
    if (!S.kgOpen && S.screen !== 'sextant') return;
    var g = currentThrust(s);
    paintThrottle(g);
    var beta = clamp(num(s.beta, 0), 0, 0.999999);
    var gamma = Math.max(1, num(s.gamma, 1));
    var eta = Math.max(0, num(s.eta, 0));
    var useGamma = beta >= GAMMA_SWITCH_BETA;
    var drum = $('kg-vel-drum');
    if (drum) drum.classList.toggle('is-gamma', useGamma);
    setText($('kg-vel-lbl'), useGamma ? ('LORENTZ ' + GAMMA) : ('VEL ' + BETA));
    setText($('out-drive-beta'), useGamma ? (GAMMA + ' ' + gamma.toFixed(2)) : (beta.toFixed(3) + 'c'));
    setText($('out-drive-kin'), (g >= 0 ? '+' : '') + g.toFixed(2) + 'g' + MID +
      (useGamma ? (BETA + ' ' + beta.toFixed(5) + 'c') : (GAMMA + ' ' + gamma.toFixed(2))) +
      MID + ETA + ' ' + eta.toFixed(2));
    var att = upper(s.attitude || 'prograde'), badge = $('kg-att-badge');
    var isRevKg = s.reversibleDrive !== false;
    var revKg = isRevKg && g < -0.02;
    setText(badge, revKg ? 'REV THRUST (-G)' : s.flip ? 'FLIPPED 180\u00b0' : att);
    if (badge) badge.classList.toggle('is-retro', revKg || !!s.flip || att === 'RETROGRADE');
    var swFlip = $('sw-flip'), swFlipLbl = $('sw-flip-lbl');
    if (swFlipLbl) setText(swFlipLbl, isRevKg ? 'REV BRAKE' : 'FLIP 180\u00b0');
    if (swFlip) {
      swFlip.title = isRevKg
        ? 'Bow-ice hull: reverse thrust (-g) keeps ice forward into ISM [F]'
        : 'Dual-ice hull: flip 180 deg so aft main bells fire forward to brake [F]';
      setPressed(swFlip, isRevKg ? g < -0.02 : !!s.flip);
    }
    var pm = s.puckMode === 'cam' ? 'cam' : 'steer', pmb = $('btn-puck-mode');
    qa('[data-puck-mode]').forEach(function (b) { setPressed(b, b.dataset.puckMode === pm); });
    setText(pmb, pm === 'cam' ? 'PUCK: CAMERA LOOK' : 'PUCK: PILOT (SNAP)');
    setData(pmb, 'mode', pm);
    setPressed(pmb, pm !== 'steer');
    var vm = s.camViewMode === 'high' || s.camViewMode === 'first' ? s.camViewMode : 'low';
    var cvBtn = $('btn-cam-view');
    if (cvBtn) {
      setData(cvBtn, 'camView', vm);
      setPressed(cvBtn, vm !== 'low');
      setText($('lbl-cam-view'), vm === 'first' ? '1ST PERS' : vm === 'high' ? '3RD HIGH' : '3RD LOW');
    }
    setHidden($('kg-vec-lock'), !s.vecProgradeLock);
    setPressed($('btn-vectors'), !!(s.showOrbitsInHelm != null ? s.showOrbitsInHelm : s.vectors));
    var hud = s.hud || {};
    var kgRel = !!hud.rel;
    setPressed($('sw-hud-flt'), !!hud.flight && !kgRel);
    setPressed($('sw-hud-rel'), kgRel);
    setPressed($('sw-hud-wpn'), !!hud.weapons);
    setPressed($('sw-cam-lock'), !!hud.camLock);
    setPressed($('sw-hide-ship'), !!hud.hideShip);
    if (Number.isFinite(s.zoom)) setText($('kg-zoom-val'), TIMES + s.zoom.toFixed(1));
    syncRollUi(s);
    var om = (s.osc && s.osc.mode) || 'spec';
    qa('[data-osc-mode]').forEach(function (b) { setPressed(b, b.dataset.oscMode === om); });
    var sr = $('kg-scope-readout');
    if (sr) {
      var lock = s.sextant && s.sextant.lock;
      var win = (s.osc && s.osc.windowNm) || [380, 760];
      if (om === 'vec') {
        setText(sr, useGamma ? (GAMMA + ' ' + gamma.toFixed(2) + MID + ETA + ' ' + eta.toFixed(2)) : (BETA + ' ' + beta.toFixed(4) + 'c' + MID + GAMMA + ' ' + gamma.toFixed(2)));
      } else if (om === 'lamp') {
        setText(sr, 'H-\u03b1 656.3' + MID + Math.round(win[0]) + '-' + Math.round(win[1]) + ' nm');
      } else if (lock && Number.isFinite(lock.lambdaObs)) {
        setText(sr, 'H-\u03b1 ' + lock.lambdaObs.toFixed(1) + ' nm' + MID + 'D ' + num(lock.D, 1).toFixed(2));
      } else {
        setText(sr, LAMBDA + ' ' + Math.round(win[0]) + '-' + Math.round(win[1]) + ' nm' + MID + 'D ' + num(hud.destDopplerD, 1).toFixed(2));
      }
    }
  }

  function syncRelControls(s) {
    var ice = num(s.iceShield, num(s.iceIntegrity, 1)), beta = num(s.beta, 0);
    var harvest = !!s.canHarvestIce || (ice < 0.99 && beta < 0.02);
    var brake = ice < 0.25 && beta > 0.05;
    setPressed($('btn-fine-steer'), !!s.fineSteer);
    var loupe = num(s.aberrationZoom, 1);
    setText($('lbl-aberration-loupe'), 'LOUPE ' + loupe + 'x');
    setPressed($('btn-aberration-loupe'), loupe > 1);
    setPressed($('btn-rest-frame'), !!s.hudRestFrame);
    setPressed($('btn-rel-gov'), !!s.relGov);
    var iceBtn = $('btn-ice-harvest'), brakeBtn = $('btn-emerg-brake');
    setHidden(iceBtn, !harvest);
    setDisabled(iceBtn, !harvest);
    iceBtn.title = s.iceHarvestSite ? s.iceHarvestSite.name : 'Harvest ice with DropShips';
    setHidden(brakeBtn, !brake);
    setDisabled(brakeBtn, !brake);
  }

  // Floating fire-control pod: absolutely positioned above the deck, so arming WPN never changes deck height.
  function syncWpnPod(s) {
    var bar = $('kg-wpn-bar');
    if (!bar) return;
    var hud = s.hud || {};
    var on = !!hud.weapons;
    setHidden(bar, !on);
    if (!on) return;
    var rel = weaponIsRel(s);
    var counts = (s.weaponBudget && s.weaponBudget.counts) || {};
    var mslCnt = counts.missile != null ? counts.missile : 2;
    var mb = $('kg-wpn-mode');
    setText(mb, (rel ? 'REL // GAMMA LANCE' : 'NEWT // COILGUN + UV FEL') + (mslCnt > 0 ? ' + MSL' : ''));
    if (mb) { mb.classList.toggle('is-rel', rel); mb.classList.toggle('is-newt', !rel); }
    var mslBtn = $('btn-wpn-msl');
    if (mslBtn) {
      setDisabled(mslBtn, mslCnt <= 0 || !!s.docked || !!s.destroyed);
      setText(mslBtn, mslCnt > 0 ? ('MSL (' + mslCnt + ')') : 'MSL 0');
    }
    var locked = !!(hud.weaponLockOn && hud.weaponTarget);
    var lockBtn = $('btn-wpn-lock');
    if (lockBtn) {
      setPressed(lockBtn, locked);
      setText(lockBtn, locked ? 'UNLOCK' : 'LOCK TGT');
    }
    var wt = locked ? hud.weaponTarget : null;
    setText($('kg-wpn-tgt'), wt ? (upper(wt.name || wt.id) + (Number.isFinite(wt.dKm) ? MID + fmtKm(wt.dKm) : '')) : 'BORESIGHT (FWD)');
    var hpWrap = $('kg-wpn-hp'), hpFill = $('kg-wpn-hp-fill'), hpTxt = $('kg-wpn-hp-txt');
    var showHp = Boolean(wt && wt.destructible);
    if (hpWrap) setHidden(hpWrap, !showHp);
    if (showHp) {
      var hFrac = clamp(num(wt.hullFrac, 1), 0, 1);
      var tState = String(wt.damageState || (wt.destroyed ? 'destroyed' : 'nominal'));
      if (hpFill) {
        hpFill.style.width = (hFrac * 100).toFixed(1) + '%';
        setData(hpFill, 'state', tState);
        setData(hpFill, 'hostile', wt.hostile ? '1' : '0');
      }
      var pctTxt = wt.destroyed ? 'WRECK'
        : wt.hostile ? ('HOSTILE ' + Math.round(hFrac * 100) + '%')
        : tState === 'critical' ? ('CRIT ' + Math.round(hFrac * 100) + '%')
        : tState === 'damaged' ? ('DMG ' + Math.round(hFrac * 100) + '%')
        : (Math.round(hFrac * 100) + '%');
      setText(hpTxt, pctTxt);
    }
  }
  function weaponIsRel(s) {
    var hud = s.hud || {};
    var m = hud.weaponMode || s.weaponMode;
    return m ? m === 'relativistic' : !!hud.rel;
  }

  // Half-circular constrained roll arc slider (-90 deg .. +90 deg) and live omega / spin-g readout.
  function syncRollUi(s) {
    var ring = $('kg-roll-ring'), arc = $('kg-roll-arc'), thumb = $('kg-roll-thumb'), axes = $('kg-puck-axes');
    var av = Array.isArray(s.angVel) ? num(s.angVel[0], 0) : 0; // rad/s about the roll axis
    var omegaDeg = av * 180 / Math.PI;
    var spinG = Math.max(0, num(s.spinG, 0));
    var cmd = S.rollOut;
    var vis = clamp(Math.abs(cmd) > 0.02 ? cmd : av / 0.42, -1, 1);
    var rolling = Math.abs(vis) > 0.04;
    var theta = vis * (Math.PI / 2);
    var px = 62 + 46 * Math.sin(theta);
    var py = 55 - 46 * Math.cos(theta);
    if (ring) {
      ring.classList.toggle('is-rolling', rolling);
      ring.style.setProperty('--roll-deg', (vis * 90).toFixed(1) + 'deg');
      ring.setAttribute('aria-valuenow', vis.toFixed(2));
    }
    if (arc) {
      var dStr = Math.abs(vis) < 0.015
        ? 'M 62 9 L 62 9'
        : ('M 62 9 A 46 46 0 0 ' + (vis > 0 ? '1 ' : '0 ') + px.toFixed(2) + ' ' + py.toFixed(2));
      if (arc.__d !== dStr) { arc.setAttribute('d', dStr); arc.__d = dStr; }
    }
    if (thumb) {
      thumb.style.left = (px / 124 * 100).toFixed(2) + '%';
      thumb.style.top = (py / 98 * 100).toFixed(2) + '%';
      thumb.style.transform = 'translate(-50%, -50%) rotate(' + (vis * 90).toFixed(1) + 'deg)';
      thumb.classList.toggle('is-rolling', rolling);
    }
    if (!axes || S.puckActive) return;
    var spinning = Math.abs(cmd) > 0.02 || Math.abs(omegaDeg) > 0.3 || spinG >= 0.5;
    var crit = spinG >= 3.8;
    var warn = !crit && spinG > 2.0;
    if (spinning) {
      setText(axes, '\u03c9 ' + (omegaDeg >= 0 ? '+' : '-') + Math.abs(omegaDeg).toFixed(1) + '\u00b0/s' + MID + (crit ? 'SPIN CAP ' : 'SPIN ') + spinG.toFixed(1) + 'g');
    } else {
      var rVis = num(s.steerVisRoll, 0);
      if (Math.abs(rVis) > 0.04) setText(axes, 'ROLL ' + (rVis > 0 ? 'STBD +' : 'PORT ') + rVis.toFixed(2));
      else setText(axes, 'X +0.00' + MID + 'Y +0.00');
    }
    axes.classList.toggle('is-warn', spinning && warn);
    axes.classList.toggle('is-crit', spinning && crit);
  }

  // --------------------------------------------------- collimated fighter HUD
  function drawFlightHud(s) {
    var cv = $('lh-hud-canvas');
    if (!cv) return;
    if (S.screen !== 'helm') return;
    var hud = s.hud || {};
    var onRel = !!hud.rel;
    var onFlt = hud.flight !== false && !onRel;
    var onWpn = !!hud.weapons;
    var rect = cv.getBoundingClientRect();
    var W = Math.max(1, Math.round(rect.width || cv.clientWidth || 800));
    var H = Math.max(1, Math.round(rect.height || cv.clientHeight || 450));
    var dpr = Math.min(root.devicePixelRatio || 1, 2);
    var pw = Math.round(W * dpr), ph = Math.round(H * dpr);
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    var ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var nowHudMs = performance.now();
    var hitAge = nowHudMs - num(s.combat && s.combat.playerHitAt, -99999);
    var hitFlash = hitAge >= 0 && hitAge < 650 ? (1 - hitAge / 650) : 0;
    var critPulse = (!s.destroyed && s.damageState === 'critical') ? (0.14 + 0.10 * Math.sin(nowHudMs * 0.008)) : 0;
    var edgeAlpha = Math.max(hitFlash * 0.42, critPulse);
    if (edgeAlpha > 0.01) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 52, 82, ' + edgeAlpha.toFixed(3) + ')';
      ctx.lineWidth = hitFlash > 0 ? 18 : 10;
      ctx.strokeRect(0, 0, W, H);
      ctx.restore();
    }
    if (!onFlt && !onRel && !onWpn) return;

    var clearPx = api.getDeckClearPx ? api.getDeckClearPx() : 0;
    var warning = $('lh-warning');
    var hasNotice = !!((!warning.hidden && $('lh-warn').dataset.source !== 'spin') || !$('lh-flash').hidden || !$('lh-epoch-toast').hidden);
    var topClear = W < 600 ? 84 : 56;
    var botClear = Math.max(24, clearPx + 14);
    var glassTop = topClear;
    var glassBot = Math.max(glassTop + 120, H - botClear);
    var glassH = glassBot - glassTop;
    var cx = W * 0.5;
    var cy = glassTop + glassH * 0.46;
    var proj = typeof hud.projectDir === 'function' ? hud.projectDir : null;
    function project(dir) {
      if (!proj || !dir) return null;
      return proj(dir, W, H);
    }

    var bowP = project([1, 0, 0]);
    var bx = (bowP && bowP.inFront && bowP.x > 60 && bowP.x < W - 60 && bowP.y > glassTop + 26 && bowP.y < glassBot - 22) ? bowP.x : cx;
    var by = (bowP && bowP.inFront && bowP.x > 60 && bowP.x < W - 60 && bowP.y > glassTop + 26 && bowP.y < glassBot - 22) ? bowP.y : cy;
    var ladCy = clamp(by, glassTop + 66, glassBot - 66);
    var bowOffAxis = !(bowP && bowP.inFront && Math.hypot(bowP.x - cx, bowP.y - cy) < Math.min(W, glassH) * 0.44);
    var transit = inTransit(s);
    var compact = W < 700 || glassH < 230;
    var tiny = W < 440;
    var o = s.orbit || {};
    var el0 = o.el || {};
    var thr = Number.isFinite(s.thrustG) ? s.thrustG : num(s.thrustCmdG, 0);
    var beta = clamp(num(s.beta, 0), 0, 0.99999);
    var gamma = Math.max(1, num(s.gamma, 1));
    var eta = Math.max(0, num(s.eta, 0));

    function pill(x, y, text, fg, bg, border, align, small) {
      ctx.save();
      ctx.font = '600 ' + (small ? 9 : 10) + 'px "Share Tech Mono", monospace';
      var tw = ctx.measureText(text).width;
      var padX = small ? 4 : 5, h = small ? 13 : 15;
      var rx = align === 'right' ? x - tw - padX * 2 : align === 'center' ? x - tw * 0.5 - padX : x;
      var ry = y - h * 0.5;
      ctx.fillStyle = bg || 'rgba(3, 16, 10, 0.72)';
      ctx.strokeStyle = border || fg;
      ctx.lineWidth = 1;
      ctx.fillRect(rx, ry, tw + padX * 2, h);
      ctx.strokeRect(rx + 0.5, ry + 0.5, tw + padX * 2 - 1, h - 1);
      ctx.fillStyle = fg;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, rx + padX, y + 0.5);
      ctx.restore();
    }

    function drawCornerBrackets(x, y, rad, lenB, col, lw) {
      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = lw || 1.3;
      ctx.beginPath();
      ctx.moveTo(x - rad, y - rad + lenB); ctx.lineTo(x - rad, y - rad); ctx.lineTo(x - rad + lenB, y - rad);
      ctx.moveTo(x + rad - lenB, y - rad); ctx.lineTo(x + rad, y - rad); ctx.lineTo(x + rad, y - rad + lenB);
      ctx.moveTo(x - rad, y + rad - lenB); ctx.lineTo(x - rad, y + rad); ctx.lineTo(x - rad + lenB, y + rad);
      ctx.moveTo(x + rad - lenB, y + rad); ctx.lineTo(x + rad, y + rad); ctx.lineTo(x + rad, y + rad - lenB);
      ctx.stroke();
      ctx.restore();
    }

    // ==================== 1. FIGHTER ORBITAL & FLIGHT HUD (FLT HUD) ====================
    if (onFlt) {
      var G_MAIN = 'rgba(99, 255, 141, 0.86)';
      var G_SOFT = 'rgba(99, 255, 141, 0.36)';
      var G_BRIGHT = '#cbffd9';
      var G_AMBER = '#ffaa4d';

      ctx.save();
      ctx.strokeStyle = G_MAIN;
      ctx.fillStyle = G_MAIN;
      ctx.shadowColor = 'rgba(99, 255, 141, 0.45)';
      ctx.shadowBlur = 4;

      // A. Top collimated heading compass tape (yields cleanly when top-center notice banner is visible)
      if (!tiny && !hasNotice) {
        var hdgVec = Array.isArray(s.headingGal) ? s.headingGal : [1, 0, 0];
        var hdgDeg = ((Math.atan2(hdgVec[1], hdgVec[0]) * 180 / Math.PI) + 360) % 360;
        var tapeW = Math.min(280, W * 0.34);
        var tapeY = glassTop + 15;
        var pxPerDeg = tapeW / 60;
        ctx.save();
        ctx.beginPath();
        ctx.rect(cx - tapeW * 0.5, tapeY - 12, tapeW, 24);
        ctx.clip();
        ctx.strokeStyle = G_SOFT;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - tapeW * 0.5, tapeY + 5);
        ctx.lineTo(cx + tapeW * 0.5, tapeY + 5);
        ctx.stroke();
        var startDeg = Math.floor((hdgDeg - 35) / 5) * 5;
        ctx.font = '10px "Share Tech Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        for (var d = startDeg; d <= hdgDeg + 35; d += 5) {
          var normD = ((d % 360) + 360) % 360;
          var xTick = cx + (d - hdgDeg) * pxPerDeg;
          var major = normD % 15 === 0;
          ctx.strokeStyle = major ? G_MAIN : G_SOFT;
          ctx.beginPath();
          ctx.moveTo(xTick, tapeY + 5);
          ctx.lineTo(xTick, tapeY + (major ? -3 : 1));
          ctx.stroke();
          if (major) {
            ctx.fillStyle = G_MAIN;
            var lbl = normD === 0 ? '000' : normD === 90 ? '090' : normD === 180 ? '180' : normD === 270 ? '270' : String(normD);
            ctx.fillText(lbl, xTick, tapeY - 4);
          }
        }
        // Carets on heading tape for prograde & station / dest
        if (!transit && hud.progradeShip) {
          var proAz = Math.atan2(hud.progradeShip[2], hud.progradeShip[0]) * 180 / Math.PI;
          if (Math.abs(proAz) < 32) {
            var pxPro = cx + proAz * pxPerDeg;
            ctx.fillStyle = G_BRIGHT;
            ctx.beginPath();
            ctx.moveTo(pxPro, tapeY + 5); ctx.lineTo(pxPro - 4, tapeY + 11); ctx.lineTo(pxPro + 4, tapeY + 11);
            ctx.closePath(); ctx.fill();
          }
        }
        if (hud.destObsDirShip) {
          var dstAz = Math.atan2(hud.destObsDirShip[2], hud.destObsDirShip[0]) * 180 / Math.PI;
          if (Math.abs(dstAz) < 32) {
            var pxDst = cx + dstAz * pxPerDeg;
            ctx.fillStyle = '#00f0ff';
            ctx.beginPath();
            ctx.moveTo(pxDst, tapeY + 5); ctx.lineTo(pxDst - 4, tapeY + 11); ctx.lineTo(pxDst + 4, tapeY + 11);
            ctx.closePath(); ctx.fill();
          }
        }
        ctx.restore();
        // Center heading readout box
        var hdgStr = String(Math.round(hdgDeg) % 360).padStart(3, '0') + '\u00b0';
        pill(cx, tapeY + 14, hdgStr, G_BRIGHT, 'rgba(3, 18, 10, 0.85)', G_MAIN, 'center');
      }

      // B. Collimated pitch ladder & horizon centered on projected bow boresight
      var ladderH = Math.min(168, glassH * 0.48);
      var ladderW = Math.min(148, W * 0.19);
      var bankRad = clamp(num(s.steerVisYaw, 0) * 0.24 + num(s.steerVisRoll, 0) * 0.38, -0.46, 0.46);
      var proS = hud.progradeShip || [1, 0, 0];
      var pitchDeg = clamp(Math.asin(clamp(-proS[1], -1, 1)) * 180 / Math.PI, -45, 45);
      var pxPerPitch = ladderH / 40;
      ctx.save();
      ctx.beginPath();
      ctx.rect(bx - ladderW * 0.65, ladCy - ladderH * 0.55, ladderW * 1.3, ladderH * 1.1);
      ctx.clip();
      ctx.translate(bx, ladCy);
      ctx.rotate(-bankRad);
      ctx.font = '9px "Share Tech Mono", monospace';
      ctx.textBaseline = 'middle';
      for (var pg = -30; pg <= 30; pg += 10) {
        var py = (pitchDeg - pg) * pxPerPitch;
        if (Math.abs(py) > ladderH * 0.56) continue;
        var gap = pg === 0 ? 22 : 26;
        var half = pg === 0 ? ladderW * 0.54 : ladderW * 0.34;
        ctx.strokeStyle = pg === 0 ? 'rgba(99, 255, 141, 0.62)' : 'rgba(99, 255, 141, 0.38)';
        ctx.lineWidth = pg === 0 ? 1.25 : 1;
        ctx.setLineDash(pg < 0 ? [5, 4] : []);
        ctx.beginPath();
        ctx.moveTo(-half, py); ctx.lineTo(-gap, py);
        ctx.moveTo(gap, py); ctx.lineTo(half, py);
        if (pg !== 0) {
          var hook = pg > 0 ? 5 : -5;
          ctx.moveTo(-half, py); ctx.lineTo(-half, py + hook);
          ctx.moveTo(half, py); ctx.lineTo(half, py + hook);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        if (pg !== 0 && !compact) {
          ctx.fillStyle = 'rgba(170, 255, 196, 0.65)';
          ctx.textAlign = 'right';
          ctx.fillText((pg > 0 ? '+' : '') + pg, -half - 4, py);
          ctx.textAlign = 'left';
          ctx.fillText((pg > 0 ? '+' : '') + pg, half + 4, py);
        }
      }
      ctx.restore();

      // C. Fixed aircraft/spacecraft waterline boresight (- v -) on bow projection
      ctx.save();
      ctx.strokeStyle = G_BRIGHT;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(bx - 16, by); ctx.lineTo(bx - 6, by);
      ctx.lineTo(bx, by + 6); ctx.lineTo(bx + 6, by);
      ctx.lineTo(bx + 16, by);
      ctx.stroke();
      ctx.fillStyle = G_BRIGHT;
      ctx.fillRect(bx - 1, by - 1, 2, 2);
      if (bowOffAxis && bowP) {
        var angB = Math.atan2(bowP.y - cy, bowP.x - cx);
        if (!bowP.inFront) angB += Math.PI;
        var ptrR = Math.min(72, glassH * 0.25);
        var pxB = cx + Math.cos(angB) * ptrR, pyB = cy + Math.sin(angB) * ptrR;
        ctx.strokeStyle = G_SOFT;
        ctx.beginPath();
        ctx.arc(pxB, pyB, 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      // D. True 3D-projected orbital vector markers (Prograde, Retrograde, Normal, Radial, Station)
      if (!transit && !s.docked) {
        var vecSpecs = [
          { dir: hud.progradeShip, sym: 'pro', col: '#63ff8d', tag: 'PRO' },
          { dir: hud.progradeShip ? [-hud.progradeShip[0], -hud.progradeShip[1], -hud.progradeShip[2]] : null, sym: 'ret', col: G_AMBER, tag: 'RET' },
          { dir: hud.normalShip, sym: 'nrm', col: 'rgba(130, 232, 255, 0.72)', tag: 'NRM' },
          { dir: hud.radialShip, sym: 'rad', col: 'rgba(196, 174, 255, 0.64)', tag: 'RAD' }
        ];
        vecSpecs.forEach(function (vs) {
          var p = project(vs.dir);
          if (!p || !p.inFront) return;
          if (p.x < 30 || p.x > W - 30 || p.y < glassTop + 12 || p.y > glassBot - 12) return;
          ctx.save();
          ctx.strokeStyle = vs.col;
          ctx.fillStyle = vs.col;
          ctx.lineWidth = 1.35;
          if (vs.sym === 'pro' || vs.sym === 'ret') {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
            ctx.moveTo(p.x - 13, p.y); ctx.lineTo(p.x - 6, p.y);
            ctx.moveTo(p.x + 6, p.y); ctx.lineTo(p.x + 13, p.y);
            ctx.moveTo(p.x, p.y - 6); ctx.lineTo(p.x, p.y - 11);
            if (vs.sym === 'ret') {
              ctx.moveTo(p.x - 4, p.y - 4); ctx.lineTo(p.x + 4, p.y + 4);
              ctx.moveTo(p.x + 4, p.y - 4); ctx.lineTo(p.x - 4, p.y + 4);
            }
            ctx.stroke();
          } else if (vs.sym === 'nrm') {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y - 7); ctx.lineTo(p.x - 6, p.y + 5); ctx.lineTo(p.x + 6, p.y + 5);
            ctx.closePath(); ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y - 6); ctx.lineTo(p.x + 6, p.y); ctx.lineTo(p.x, p.y + 6); ctx.lineTo(p.x - 6, p.y);
            ctx.closePath(); ctx.stroke();
          }
          ctx.font = '9px "Share Tech Mono", monospace';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(vs.tag, p.x + 10, p.y - 8);
          ctx.restore();
        });

        // Station orbital diamond bracket
        var stBody = (hud.bodies || []).find(function (b) { return b.key === 'station'; });
        if (stBody && stBody.dir) {
          var ps = project(stBody.dir);
          if (ps && ps.inFront && ps.x > 40 && ps.x < W - 40 && ps.y > glassTop + 14 && ps.y < glassBot - 14) {
            ctx.save();
            ctx.strokeStyle = '#ffc828';
            ctx.fillStyle = '#ffc828';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(ps.x, ps.y - 8); ctx.lineTo(ps.x + 8, ps.y); ctx.lineTo(ps.x, ps.y + 8); ctx.lineTo(ps.x - 8, ps.y);
            ctx.closePath(); ctx.stroke();
            ctx.font = '9px "Share Tech Mono", monospace';
            ctx.textAlign = 'left';
            ctx.fillText('STN ' + fmtKm(stBody.dKm), ps.x + 11, ps.y + 1);
            ctx.restore();
          }
        }
      }

      // E. Left & right collimated fighter side tapes (Speed / Thrust on left, Altitude / PE-AP on right)
      if (!compact && (!onRel || !transit)) {
        var tapeH = Math.min(164, glassH * 0.50);
        var halfOff = Math.min(W * 0.27, Math.max(158, W * 0.20));
        var xL = Math.max(290, cx - halfOff);
        var xR = Math.min(W - 96, cx + halfOff);
        if (xR - xL > 260) {
          // Left Velocity Tape
          var vNow = transit ? beta * C_KMS : (isArr3(o.vKmS) ? len3(o.vKmS) : num(o.vOrbKmS, 0));
          var yTopT = cy - tapeH * 0.5;
          ctx.strokeStyle = G_SOFT;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(xL, yTopT); ctx.lineTo(xL, yTopT + tapeH);
          ctx.moveTo(xL - 8, yTopT); ctx.lineTo(xL, yTopT);
          ctx.moveTo(xL - 8, yTopT + tapeH); ctx.lineTo(xL, yTopT + tapeH);
          ctx.stroke();
          var vStep = vNow > 200 ? 50 : vNow > 20 ? 5 : 1;
          var vSpan = vStep * 5;
          var vStart = Math.floor((vNow - vSpan) / vStep) * vStep;
          ctx.font = '9px "Share Tech Mono", monospace';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          for (var vv = vStart; vv <= vNow + vSpan; vv += vStep) {
            if (vv < 0) continue;
            var yv = cy - ((vv - vNow) / vSpan) * (tapeH * 0.48);
            if (yv < yTopT + 6 || yv > yTopT + tapeH - 6) continue;
            ctx.strokeStyle = G_SOFT;
            ctx.beginPath(); ctx.moveTo(xL - 6, yv); ctx.lineTo(xL, yv); ctx.stroke();
            ctx.fillStyle = 'rgba(155, 248, 185, 0.58)';
            ctx.fillText(vv.toFixed(vStep < 1 ? 1 : 0), xL - 9, yv);
          }
          // Circular & Escape velocity carets on left tape
          if (!transit && Number.isFinite(hud.vCircKmS)) {
            var yVc = clamp(cy - ((hud.vCircKmS - vNow) / vSpan) * (tapeH * 0.48), yTopT + 8, yTopT + tapeH - 8);
            ctx.fillStyle = G_BRIGHT;
            ctx.fillRect(xL + 2, yVc - 1.5, 6, 3);
          }
          if (!transit && Number.isFinite(hud.vEscKmS)) {
            var yVe = clamp(cy - ((hud.vEscKmS - vNow) / vSpan) * (tapeH * 0.48), yTopT + 8, yTopT + tapeH - 8);
            ctx.fillStyle = G_AMBER;
            ctx.fillRect(xL + 2, yVe - 1.5, 6, 3);
          }
          var fltUseG = transit && beta >= GAMMA_SWITCH_BETA;
          pill(xL - 4, cy, transit ? (fltUseG ? (GAMMA + ' ' + gamma.toFixed(2)) : ('V ' + beta.toFixed(3) + 'c')) : ('V ' + vNow.toFixed(2) + ' km/s'), fltUseG ? '#00f0ff' : G_BRIGHT, 'rgba(3, 18, 10, 0.86)', fltUseG ? '#00f0ff' : G_MAIN, 'right');
          // Compact vertical G-load bar beside left tape
          var gBarH = 64, gBarX = xL - 8, gBarY = yTopT + tapeH + 14;
          ctx.strokeStyle = G_SOFT;
          ctx.strokeRect(gBarX - 4, gBarY, 5, gBarH);
          var gFrac = clamp(thr / 2, -1, 1);
          ctx.fillStyle = thr < -0.02 ? G_AMBER : G_MAIN;
          var gMid = gBarY + gBarH * 0.5;
          ctx.fillRect(gBarX - 3, gFrac >= 0 ? gMid - gFrac * (gBarH * 0.48) : gMid, 3, Math.abs(gFrac) * (gBarH * 0.48));
          ctx.fillStyle = thr < -0.02 ? G_AMBER : G_BRIGHT;
          ctx.textAlign = 'right';
          ctx.fillText((thr >= 0 ? '+' : '') + thr.toFixed(2) + 'g', gBarX - 9, gMid);

          // Right Altitude / Apsis Tape
          var altNow = transit ? (num(s.distToDestLy, 0)) : num(o.altKm, 0);
          ctx.strokeStyle = G_SOFT;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(xR, yTopT); ctx.lineTo(xR, yTopT + tapeH);
          ctx.moveTo(xR, yTopT); ctx.lineTo(xR + 8, yTopT);
          ctx.moveTo(xR, yTopT + tapeH); ctx.lineTo(xR + 8, yTopT + tapeH);
          ctx.stroke();
          for (var rt = -4; rt <= 4; rt++) {
            var yr = cy + rt * (tapeH * 0.11);
            ctx.strokeStyle = rt === 0 ? G_MAIN : G_SOFT;
            ctx.beginPath(); ctx.moveTo(xR, yr); ctx.lineTo(xR + (rt % 2 === 0 ? 7 : 4), yr); ctx.stroke();
          }
          var altStr = s.docked ? 'BERTH' : transit ? (Number.isFinite(s.distToDestLy) ? s.distToDestLy.toFixed(2) + ' LY' : 'DEEP') : fmtKm(altNow);
          pill(xR + 4, cy, 'ALT ' + altStr, G_BRIGHT, 'rgba(3, 18, 10, 0.86)', G_MAIN, 'left');
          if (!transit && el0) {
            var R0 = num(o.bodyRadiusKm, 0);
            var peA = num(el0.rp, NaN) - R0, apA = num(el0.ra, NaN) - R0;
            ctx.font = '9px "Share Tech Mono", monospace';
            ctx.textAlign = 'left';
            ctx.fillStyle = 'rgba(180, 255, 204, 0.8)';
            if (Number.isFinite(peA)) ctx.fillText('PE ' + fmtKm(peA), xR + 6, yTopT + tapeH + 14);
            if (Number.isFinite(apA) && el0.e < 1) ctx.fillText('AP ' + fmtKm(apA), xR + 6, yTopT + tapeH + 26);
            else if (el0.e >= 1) { ctx.fillStyle = G_AMBER; ctx.fillText('AP ESCAPE', xR + 6, yTopT + tapeH + 26); }
            var vr = num(hud.vRadKmS, 0);
            if (!s.docked && Math.abs(vr) > 0.005) {
              ctx.fillStyle = vr >= 0 ? G_MAIN : G_AMBER;
              ctx.fillText('Vr ' + (vr >= 0 ? '+' : '') + vr.toFixed(2), xR + 6, yTopT - 10);
            }
          }
        }
      }

      // F. Bottom-of-glass flight status strip (just above KG-2100 deck)
      var camTag = hud.camLock ? 'CAM LOCK' : 'FREE LOOK';
      var attTag = upper(s.attitude || 'prograde');
      var planTag = '';
      if (s.burn && s.burn.active) planTag = '  // BURN ' + Math.round(num(s.burn.progress, 0) * 100) + '%';
      else if (s.hasActiveOrbitPlan) {
        var tgtTag = s.selectedTargetId ? upper(String(s.selectedTargetId).replace(/^[^:]+:/, ''))
          : (s.maneuverChain && s.maneuverChain.length ? (s.maneuverChain.length + ' NODE' + (s.maneuverChain.length > 1 ? 'S' : '')) : 'TRANSFER');
        planTag = '  // PLAN: ' + tgtTag;
      }
      var stLine = '[' + camTag + ']  ' + attTag + planTag;
      pill(cx, glassBot - 9, stLine, G_MAIN, 'rgba(3, 16, 10, 0.72)', G_SOFT, 'center');
      ctx.restore();
    }

    // ==================== 2. RELATIVISTIC INTERSTELLAR NAV HUD (REL HUD) ====================
    if (onRel) {
      var C_CYAN = '#00f0ff';
      var C_VIO = '#c084ff';
      var C_GOLD = '#ffc828';
      var C_RED = '#ff4d6d';

      ctx.save();
      ctx.shadowColor = 'rgba(0, 240, 255, 0.45)';
      ctx.shadowBlur = 5;

      // A. True 3D-projected Relativistic Aberration Cones (30 deg, 60 deg, and 90 deg Doppler D=1.0 Neutral Equator!)
      var cones = [
        { deg: 30, col: 'rgba(0, 240, 255, 0.30)', dash: [4, 5], lw: 1.0, lbl: '30\u00b0' },
        { deg: 60, col: 'rgba(192, 132, 255, 0.34)', dash: [5, 5], lw: 1.0, lbl: '60\u00b0' },
        { deg: 90, col: 'rgba(0, 240, 255, 0.82)', dash: [], lw: 1.5, lbl: '90\u00b0 EQ \u00b7 D=1.0' }
      ];
      cones.forEach(function (cone) {
        var cosR = Math.cos(cone.deg * Math.PI / 180);
        var cosO = clamp((cosR + beta) / (1 + beta * cosR), -0.9999, 0.9999);
        var sinO = Math.sqrt(Math.max(0, 1 - cosO * cosO));
        // Only draw rings that sit in front of the ship (cosO > 0.08) so low-beta 90 deg equator doesn't clip weirdly
        if (cosO < 0.08) return;
        ctx.save();
        ctx.strokeStyle = cone.col;
        ctx.lineWidth = cone.lw;
        ctx.setLineDash(cone.dash);
        ctx.beginPath();
        var started = false, topPt = null, NSEG = 64;
        for (var i = 0; i <= NSEG; i++) {
          var ph = (i / NSEG) * Math.PI * 2;
          var p = project([cosO, sinO * Math.cos(ph), sinO * Math.sin(ph)]);
          if (!p || !p.inFront) { started = false; continue; }
          if (!started) { ctx.moveTo(p.x, p.y); started = true; }
          else ctx.lineTo(p.x, p.y);
          if (i === 0) topPt = p;
        }
        ctx.stroke();
        ctx.setLineDash([]);
        if (topPt && topPt.inFront && topPt.x > 60 && topPt.x < W - 60 && topPt.y > glassTop + 18 && topPt.y < glassBot - 18) {
          ctx.font = '600 9px "Share Tech Mono", monospace';
          ctx.fillStyle = cone.deg === 90 ? C_CYAN : C_VIO;
          ctx.textAlign = 'center';
          ctx.fillText(cone.lbl, topPt.x, topPt.y - 6);
        }
        ctx.restore();
      });

      if (beta > 0.08 && s.hudRestFrame && typeof hud.getStarVectorPairs === 'function') {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, glassTop, W, Math.max(0, Math.min(H, H - botClear) - glassTop));
        ctx.clip();
        ctx.shadowBlur = 0;
        var rawPairs = hud.getStarVectorPairs(W, H) || [];
        var maxRefTethers = gamma >= 18 ? 1 : gamma >= 8 ? 2 : gamma >= 3 ? 3 : 5;
        var minAngSep = gamma >= 8 ? 0.65 : 0.42;
        var refAlpha = gamma >= 8 ? 0.26 : 0.34;
        var drawnRef = 0;
        var usedAngles = [];
        var usedPts = [];
        var orderedPairs = rawPairs.slice().sort(function (a, b) {
          if (!!b.isTarget !== !!a.isTarget) return b.isTarget ? 1 : -1;
          return num(b.shiftPx, 0) - num(a.shiftPx, 0);
        });
        orderedPairs.forEach(function (pair) {
          if (!pair.restInFront || !Number.isFinite(pair.restX) || !Number.isFinite(pair.restY)) return;
          var x = pair.restX, y = pair.restY;
          var hasApp = pair.appInFront && Number.isFinite(pair.appX) && Number.isFinite(pair.appY);
          if (!pair.isTarget) {
            if (drawnRef >= maxRefTethers) return;
            if (x < 24 || x > W - 24 || y < glassTop + 14 || y > glassBot - 14) return;
            if (hasApp && Math.hypot(pair.appX - x, pair.appY - y) < 12) return;
            var ang = Math.atan2(y - by, x - bx);
            for (var ai = 0; ai < usedAngles.length; ai++) {
              var dAng = Math.abs(Math.atan2(Math.sin(ang - usedAngles[ai]), Math.cos(ang - usedAngles[ai])));
              if (dAng < minAngSep) return;
            }
            for (var pi = 0; pi < usedPts.length; pi++) {
              if (Math.hypot(x - usedPts[pi][0], y - usedPts[pi][1]) < 52) return;
            }
            usedAngles.push(ang);
            usedPts.push([x, y]);
            drawnRef++;
          } else {
            usedAngles.push(Math.atan2(y - by, x - bx));
            usedPts.push([x, y]);
          }
          var size = pair.isTarget ? 5 : 3;
          ctx.lineWidth = pair.isTarget ? 1.25 : 0.85;
          if (hasApp) {
            var ex = pair.appX, ey = pair.appY;
            if (!pair.isTarget) {
              var dxB = ex - bx, dyB = ey - by, dB = Math.hypot(dxB, dyB);
              if (dB < 22) {
                var sx = x - ex, sy = y - ey, sLen = Math.hypot(sx, sy);
                if (sLen > 24) {
                  var trim = Math.min(sLen - 8, 22 - dB);
                  ex += (sx / sLen) * trim;
                  ey += (sy / sLen) * trim;
                }
              }
            }
            ctx.strokeStyle = pair.isTarget ? 'rgba(255, 209, 117, 0.82)' : ('rgba(110, 225, 255, ' + refAlpha.toFixed(2) + ')');
            ctx.setLineDash([3, 5]);
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
            ctx.setLineDash([]);
          }
          ctx.strokeStyle = pair.isTarget ? '#ffd175' : 'rgba(161, 233, 255, 0.62)';
          ctx.beginPath(); ctx.moveTo(x, y - size); ctx.lineTo(x + size, y);
          ctx.lineTo(x, y + size); ctx.lineTo(x - size, y); ctx.closePath(); ctx.stroke();
        });
        ctx.restore();
      }

      // Destination star optical reticle.
      if (hud.destObsDirShip) {
        var pObs = project(hud.destObsDirShip);
        if (pObs && pObs.inFront && pObs.x > 24 && pObs.x < W - 24 && pObs.y > glassTop + 10 && pObs.y < glassBot - 10) {
          drawCornerBrackets(pObs.x, pObs.y, 12, 5, C_CYAN, 1.4);
          var dTxt = 'OPTICAL' + (Number.isFinite(hud.destDopplerD) ? (' \u00b7 D ' + hud.destDopplerD.toFixed(2) + 'x') : '');
          var optY = pObs.y + 22 <= glassBot - 16 ? pObs.y + 22 : Math.max(glassTop + 14, pObs.y - 22);
          var destLbl = $('lh-labels') && $('lh-labels').querySelector('.lh-label.dest:not([hidden])');
          if (destLbl) {
            var dr = destLbl.getBoundingClientRect();
            if (dr.width > 0 && dr.height > 0) {
              var dl = dr.left - rect.left, drR = dr.right - rect.left;
              var dt = dr.top - rect.top, db = dr.bottom - rect.top;
              var halfW = Math.max(48, dTxt.length * 3.3 + 8);
              if (pObs.x + halfW > dl - 4 && pObs.x - halfW < drR + 4 && optY + 9 > dt - 3 && optY - 9 < db + 3) {
                var aboveY = Math.min(pObs.y - 22, dt - 11);
                var belowY = Math.max(pObs.y + 22, db + 11);
                optY = aboveY >= glassTop + 12 ? aboveY : Math.min(glassBot - 12, belowY);
              }
            }
          }
          pill(pObs.x, optY, dTxt, C_CYAN, 'rgba(4, 18, 28, 0.84)', C_CYAN, 'center');
        }
      }

      var dRem = Number.isFinite(s.missionRemLy) ? s.missionRemLy : s.distToDestLy;
      var dStop = num(hud.stoppingDistLy, 0);
      var cueTxt = beta > 0.03 ? 'FREE RELATIVISTIC' : 'REL NAV STANDBY';
      var cueCol = C_CYAN;
      var stage = s.transitStage || s.missionPhase;
      var stageLbl = inTransit(s) ? transitLabel(s) : '';
      var turnover = stage === 'turnover';
      if (stage === 'brake' || (!s.transitStage && Number.isFinite(dRem) && dStop >= dRem * 0.88 && beta > 0.05)) {
        cueTxt = s.reversibleDrive === false ? 'BRAKE NOW \u00b7 FLIP 180' : 'BRAKE NOW \u00b7 REV-TORCH';
        cueCol = C_GOLD;
      } else if (Number.isFinite(dRem)) cueTxt = (stageLbl ? 'DEST ' + dRem.toFixed(2)
        : 'TURNOVER ' + Math.max(0, 0.5 * (dRem - dStop)).toFixed(2)) + ' LY';

      var rightPills = [];
      var relReadoutX = W - 14;
      var rightAlign = 'right';

      // C. Left Relativistic Kinematics Scale (beta / gamma / eta / SAFE beta)
      if (!compact) {
        var rH = Math.min(168, glassH * 0.52);
        var offR = Math.min(W * 0.30, Math.max(176, W * 0.22));
        var rxL = Math.max(288, cx - offR);
        var rxR = Math.min(W - 260, cx + offR);
        if (rxR - rxL > 280) {
          var yRTop = cy - rH * 0.5;
          ctx.strokeStyle = 'rgba(0, 240, 255, 0.45)';
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(rxL, yRTop); ctx.lineTo(rxL, yRTop + rH);
          ctx.stroke();
          // Scale switches to logarithmic Lorentz gamma above 0.99c so high-gamma acceleration remains legible
          var relUseG = beta >= GAMMA_SWITCH_BETA;
          var barFrac = relUseG
            ? clamp(Math.log10(Math.max(1, gamma)) / Math.log10(130), 0, 1)
            : clamp(eta / 4.0, 0, 1);
          ctx.fillStyle = relUseG ? C_VIO : C_CYAN;
          ctx.fillRect(rxL - 3, yRTop + rH * (1 - barFrac), 3, rH * barFrac);
          // Safe beta tick
          var specsR = getSpecs(s) || {};
          var safeB = clamp(num(specsR.maxSafeBetaPct, 95) / 100, 0.2, 0.9999);
          var safeGamma = 1 / Math.sqrt(Math.max(1e-8, 1 - safeB * safeB));
          var safeFrac = relUseG
            ? clamp(Math.log10(Math.max(1, safeGamma)) / Math.log10(130), 0, 1)
            : clamp(Math.atanh(safeB) / 4.0, 0, 1);
          var ySafe = yRTop + rH * (1 - safeFrac);
          ctx.strokeStyle = C_GOLD;
          ctx.beginPath(); ctx.moveTo(rxL - 10, ySafe); ctx.lineTo(rxL + 4, ySafe); ctx.stroke();
          ctx.font = '9px "Share Tech Mono", monospace';
          ctx.fillStyle = C_GOLD;
          ctx.textAlign = 'right';
          ctx.fillText('SAFE', rxL - 12, ySafe + 3);

          if (relUseG) {
            pill(rxL - 6, cy - 12, GAMMA + ' ' + gamma.toFixed(2), C_CYAN, 'rgba(4, 18, 28, 0.88)', C_CYAN, 'right');
            pill(rxL - 6, cy + 8, BETA + ' ' + beta.toFixed(5) + 'c \u00b7 ' + ETA + ' ' + eta.toFixed(2), C_VIO, 'rgba(18, 10, 34, 0.84)', C_VIO, 'right');
          } else {
            pill(rxL - 6, cy - 12, BETA + ' ' + beta.toFixed(4) + 'c', C_CYAN, 'rgba(4, 18, 28, 0.86)', C_CYAN, 'right');
            pill(rxL - 6, cy + 8, GAMMA + ' ' + gamma.toFixed(2) + ' \u00b7 ' + ETA + ' ' + eta.toFixed(2), C_VIO, 'rgba(18, 10, 34, 0.84)', C_VIO, 'right');
          }

          // Right Stopping Distance (d_stop) vs Destination Range & Brachistochrone Turnover Cue
          var dtRatio = 'dt/d' + TAU + ' ' + gamma.toFixed(2) + 'x';
          ctx.strokeStyle = 'rgba(192, 132, 255, 0.45)';
          ctx.beginPath();
          ctx.moveTo(rxR, yRTop); ctx.lineTo(rxR, yRTop + rH);
          ctx.stroke();
          if (Number.isFinite(dRem) && dRem > 1e-4) {
            var stopFrac = clamp(dStop / dRem, 0, 1);
            ctx.fillStyle = stopFrac > 0.85 ? C_GOLD : C_VIO;
            ctx.fillRect(rxR, yRTop + rH * (1 - stopFrac), 4, rH * stopFrac);
          }
          rightPills.push({ text: 'STOP ' + dStop.toFixed(2) + ' LY', fg: C_CYAN, bg: 'rgba(4, 18, 28, 0.86)', border: C_CYAN, small: false });
          rightPills.push({ text: dtRatio, fg: C_VIO, bg: 'rgba(18, 10, 34, 0.84)', border: C_VIO, small: false });
          relReadoutX = rxR + 6;
          rightAlign = 'left';
        }
      }

      if (stageLbl) {
        var stageCol = turnover || stage === 'brake' ? C_GOLD : C_CYAN;
        rightPills.push({ text: stageLbl, fg: stageCol, bg: 'rgba(6, 16, 26, 0.86)', border: stageCol, small: true });
      }
      if (cueTxt) {
        rightPills.push({ text: cueTxt, fg: cueCol, bg: 'rgba(6, 16, 26, 0.86)', border: cueCol, small: true });
      }

      // D. Bow ISM Ram-Flux & Ice Shield Endurance Arc
      var arcR = Math.min(82, glassH * 0.27);
      var ismLvl = (s.ablation && s.ablation.warningLevel) || 'nominal';
      var arcCol = ismLvl === 'critical' ? C_RED : ismLvl === 'elevated' ? C_GOLD : C_CYAN;
      var iceFraction = clamp(num(s.iceShield, num(s.iceIntegrity, 1)), 0, 1);
      var icePct = Math.round(iceFraction * 100);
      var endur = hud.iceEnduranceYr;
      var endurStr = !Number.isFinite(endur) || endur > 99 ? '>99 yr' : (endur.toFixed(1) + ' yr');
      var posture = s.flip ? (s.hasAftIce ? 'AFT ICE FLIP-BURN' : 'UNSHIELDED STERN!') : 'BOW ICE SHIELDED';
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.22)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(bx, by, arcR, Math.PI * 0.25, Math.PI * 0.75);
      ctx.stroke();
      ctx.strokeStyle = arcCol;
      ctx.beginPath();
      ctx.arc(bx, by, arcR, Math.PI * 0.25, Math.PI * (0.25 + 0.50 * iceFraction));
      ctx.stroke();
      if (rightAlign === 'right' && W < 440) posture = s.flip ? posture : 'BOW ICE';
      rightPills.push({ text: posture + MID + 'ICE ' + icePct + '%' + MID + endurStr, fg: arcCol, bg: 'rgba(4, 14, 24, 0.82)', border: arcCol, small: true });
      var loupe = num(s.aberrationZoom, 1);
      if (loupe > 1) {
        rightPills.push({
          text: 'LOUPE ' + loupe + 'x' + MID + 'FOV ' + (52 / loupe).toFixed(1) + ' deg',
          fg: C_CYAN, bg: 'rgba(4, 14, 24, 0.82)', border: 'rgba(0, 240, 255, 0.4)', small: true
        });
      }
      var gapP = 5, glassBot = H - botClear;
      var totalH = rightPills.reduce(function (sum, item, idx) {
        return sum + (item.small ? 13 : 15) + (idx ? gapP : 0);
      }, 0);
      var yCur = clamp(cy - totalH * 0.5, glassTop + 10, Math.max(glassTop + 10, glassBot - totalH - 6));
      rightPills.forEach(function (item) {
        var ph = item.small ? 13 : 15;
        if (yCur + ph <= glassBot + 2) {
          pill(relReadoutX, yCur + ph * 0.5, item.text, item.fg, item.bg, item.border, rightAlign, item.small);
        }
        yCur += ph + gapP;
      });
      ctx.restore();
    }

    // ==================== 3. TACTICAL WEAPONS & FIRE-CONTROL HUD (WPN HUD) ====================
    if (!onWpn) S.wpnLockBox = null;
    if (onWpn) {
      var W_AMB = '#ffaa33';
      var W_RED = '#ff4d68';
      var W_SOFT = 'rgba(255, 170, 51, 0.36)';
      var ringR = Math.min(72, glassH * 0.24);
      var nowMs = performance.now();
      var fireAge = nowMs - num(hud.weaponFireAt, 0);
      var firing = fireAge >= 0 && fireAge < 520;
      var fireK = firing ? (1 - fireAge / 520) : 0;

      ctx.save();
      ctx.shadowColor = 'rgba(255, 110, 50, 0.45)';
      ctx.shadowBlur = 5;

      // Low-pass filter the boresight reticle so camera easing or micro-jitter never makes it jump.
      var wr = S.wpnReticle;
      var rawBx = (bowP && bowP.inFront) ? clamp(bowP.x, 64, W - 64) : cx;
      var rawBy = (bowP && bowP.inFront) ? clamp(bowP.y, glassTop + 30, glassBot - 26) : cy;
      if (wr.bx == null || Math.hypot(rawBx - wr.bx, rawBy - wr.by) > 220) {
        wr.bx = rawBx; wr.by = rawBy;
      } else {
        wr.bx += (rawBx - wr.bx) * 0.24;
        wr.by += (rawBy - wr.by) * 0.24;
      }
      var wbx = wr.bx, wby = wr.by;

      // A. Collimated gunnery / cache-weapon sighting ring around bow boresight
      ctx.strokeStyle = W_SOFT;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.arc(wbx, wby, ringR, -0.35, 0.35);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(wbx, wby, ringR, Math.PI - 0.35, Math.PI + 0.35);
      ctx.stroke();
      // Left arc: weapon charge; Right arc: core thermal envelope
      var charge = firing ? clamp(fireAge / 520, 0, 1) : 1;
      var heat = clamp(num(s.coreHeat, 0), 0, 1);
      ctx.strokeStyle = W_AMB;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(wbx, wby, ringR + 6, Math.PI * 0.72, Math.PI * (0.72 + 0.56 * charge));
      ctx.stroke();
      ctx.strokeStyle = heat > 0.8 ? W_RED : W_AMB;
      ctx.beginPath();
      ctx.arc(wbx, wby, ringR + 6, -Math.PI * 0.28, -Math.PI * 0.28 + Math.PI * 0.56 * Math.max(0.06, heat));
      ctx.stroke();

      // Inner aiming pips
      ctx.strokeStyle = W_AMB;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(wbx - 12, wby); ctx.lineTo(wbx - 4, wby);
      ctx.moveTo(wbx + 4, wby); ctx.lineTo(wbx + 12, wby);
      ctx.moveTo(wbx, wby - 12); ctx.lineTo(wbx, wby - 4);
      ctx.moveTo(wbx, wby + 4); ctx.lineTo(wbx, wby + 12);
      ctx.stroke();

      S.wpnLockBox = null;
      var wbCounts = (s.weaponBudget && s.weaponBudget.counts) || {};
      var hasMslMount = wbCounts.missile == null ? true : wbCounts.missile > 0;
      var wpnLblY = Math.max(glassTop + (hasNotice ? 56 : 36), wby - ringR - 14);
      pill(wbx, wpnLblY, 'WPN ' + (weaponIsRel(s) ? 'REL // GAMMA LANCE' : 'NEWT // COILGUN + FEL') + (hasMslMount ? ' + MSL' : ''), firing ? W_RED : W_AMB, 'rgba(34, 10, 12, 0.86)', firing ? W_RED : W_AMB, 'center');

      // B. Explicit target lock bracket (only when player locks a target; default is free-fire forward boresight)
      var tgt = hud.weaponLockOn ? hud.weaponTarget : null;
      var aimX = wbx, aimY = wby;
      if (tgt && tgt.dir) {
        if (wr.tgtId !== tgt.id) {
          wr.tgtId = tgt.id; wr.tx = null; wr.ty = null; wr.lx = null; wr.ly = null;
        }
        var pt = project(tgt.dir);
        var onScreen = !!(pt && pt.inFront && pt.x > 26 && pt.x < W - 26 && pt.y > glassTop + 14 && pt.y < glassBot - 14);
        if (onScreen) {
          if (wr.tx == null || Math.hypot(pt.x - wr.tx, pt.y - wr.ty) > 220) {
            wr.tx = pt.x; wr.ty = pt.y;
          } else {
            wr.tx += (pt.x - wr.tx) * 0.22;
            wr.ty += (pt.y - wr.ty) * 0.22;
          }
          var tx = wr.tx, ty = wr.ty;
          var relB = num(tgt.relBeta, 0);
          var leadDx = clamp((tx - wbx) * 0.05 + relB * 18, -36, 36);
          var leadDy = clamp((ty - wby) * 0.05 - Math.abs(relB) * 8, -26, 26);
          var rawLx = clamp(tx + leadDx, 28, W - 28);
          var rawLy = clamp(ty + leadDy, glassTop + 16, glassBot - 16);
          if (wr.lx == null || Math.hypot(rawLx - wr.lx, rawLy - wr.ly) > 220) {
            wr.lx = rawLx; wr.ly = rawLy;
          } else {
            wr.lx += (rawLx - wr.lx) * 0.22;
            wr.ly += (rawLy - wr.ly) * 0.22;
          }
          var lx = wr.lx, ly = wr.ly;
          aimX = lx; aimY = ly;
          var locked = Math.hypot(lx - wbx, ly - wby) < ringR * 0.95;
          var boxCol = locked ? W_RED : W_AMB;

          drawCornerBrackets(tx, ty, 16, 6, boxCol, 1.5);
          // Lead pipper & dashed trajectory link
          ctx.strokeStyle = W_SOFT;
          ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(lx, ly); ctx.stroke();
          ctx.setLineDash([]);
          ctx.strokeStyle = boxCol;
          ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.arc(lx, ly, 7, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = boxCol;
          ctx.fillRect(lx - 1.5, ly - 1.5, 3, 3);

          var dVal = num(tgt.D, 1);
          var info1 = upper(tgt.name || tgt.id) + (Number.isFinite(tgt.dKm) ? (' \u00b7 ' + fmtKm(tgt.dKm)) : '');
          var info2 = (locked ? 'SOL LOCK' : 'LOCKED') + ' \u00b7 D ' + dVal.toFixed(2) + 'x \u00b7 ' + (Math.abs(relB) > 0.01 ? (relB.toFixed(2) + 'c') : 'LOCAL');
          var pAlign = tx > W - 210 ? 'right' : 'left';
          var pOff = pAlign === 'right' ? -20 : 20;
          var tyBox = clamp(ty, glassTop + 26, glassBot - 44);
          pill(tx + pOff, tyBox - 7, info1, boxCol, 'rgba(32, 10, 12, 0.84)', boxCol, pAlign);
          pill(tx + pOff, tyBox + 10, info2, '#ffd6a8', 'rgba(24, 10, 12, 0.80)', W_SOFT, pAlign);
          ctx.save();
          ctx.font = '600 10px "Share Tech Mono", monospace';
          var boxW = Math.max(ctx.measureText(info1).width, ctx.measureText(info2).width, 136) + 22;
          ctx.restore();
          S.wpnLockBox = {
            l: pAlign === 'right' ? (tx + pOff - boxW - 4) : (tx + pOff - 4),
            r: pAlign === 'right' ? (tx + pOff + 4) : (tx + pOff + boxW + 4),
            t: tyBox - 22,
            b: tyBox + 38
          };
          if (tgt.destructible) {
            var bw = 62, bxHp = pAlign === 'right' ? (tx + pOff - bw) : (tx + pOff);
            var hFracT = clamp(num(tgt.hullFrac, 1), 0, 1);
            var shFracT = clamp(num(tgt.shieldFrac, 0), 0, 1);
            var barColT = tgt.destroyed ? '#8b83a8' : (tgt.damageState === 'critical' ? W_RED : (tgt.hostile || tgt.damageState === 'damaged' ? W_AMB : '#63ff8d'));
            ctx.fillStyle = 'rgba(18, 6, 10, 0.82)';
            ctx.fillRect(bxHp, tyBox + 21, bw, 9);
            ctx.fillStyle = '#6de6ff';
            ctx.fillRect(bxHp + 1, tyBox + 22, (bw - 2) * shFracT, 2.5);
            ctx.fillStyle = barColT;
            ctx.fillRect(bxHp + 1, tyBox + 25.5, (bw - 2) * hFracT, 3.5);
            ctx.font = '600 9px "Share Tech Mono", monospace';
            ctx.fillStyle = barColT;
            ctx.textAlign = pAlign;
            var hpLbl = tgt.destroyed ? 'WRECK' : ((tgt.hostile ? 'HOSTILE ' : '') + Math.round(hFracT * 100) + '%');
            ctx.fillText(hpLbl, pAlign === 'right' ? (bxHp - 4) : (bxHp + bw + 4), tyBox + 28);
          }
        } else if (pt) {
          // Off-screen target edge chevron on sighting ring
          var angT = Math.atan2(pt.y - wby, pt.x - wbx);
          if (!pt.inFront) angT += Math.PI;
          var chX = wbx + Math.cos(angT) * (ringR + 18), chY = wby + Math.sin(angT) * (ringR + 18);
          ctx.save();
          ctx.translate(chX, chY);
          ctx.rotate(angT);
          ctx.fillStyle = W_AMB;
          ctx.beginPath();
          ctx.moveTo(7, 0); ctx.lineTo(-5, -5); ctx.lineTo(-2, 0); ctx.lineTo(-5, 5);
          ctx.closePath(); ctx.fill();
          ctx.restore();
          pill(wbx, Math.min(glassBot - 18, wby + ringR + (onRel ? 34 : 16)), 'TGT OFF-AXIS: ' + upper(tgt.name || tgt.id), W_AMB, 'rgba(32, 10, 12, 0.84)', W_AMB, 'center');
        }
      } else {
        wr.tgtId = null; wr.tx = null; wr.ty = null; wr.lx = null; wr.ly = null;
        pill(wbx, Math.min(glassBot - 18, wby + ringR + (onRel ? 34 : 16)), 'BORESIGHT // FREE-FIRE', '#ffd6a8', 'rgba(28, 10, 12, 0.82)', W_SOFT, 'center');
      }

      // C. Aim-point flash only: the beams themselves are rendered in 3D from the real hull hardpoints.
      if (firing) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 224, 150, ' + (0.95 * fireK).toFixed(2) + ')';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(aimX, aimY, 8 + (1 - fireK) * 24, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }

    // ==================== 4. RCS SAS / SPIN-G INDICATOR ====================
    var sasSpinG = Math.max(0, num(s.spinG, 0));
    if (s.rcsDamping || sasSpinG > 2.0) {
      var sasCrit = sasSpinG >= 3.8;
      var sasCol = sasCrit ? '#ff4d68' : sasSpinG > 2.0 ? '#ffaa33' : '#7ff6ff';
      var sasTxt = (s.rcsDamping ? 'SAS' + MID : '') + (sasCrit ? 'SPIN CAP ' : 'SPIN ') + sasSpinG.toFixed(1) + 'g';
      if ($('lh-warn').dataset.source !== 'spin') {
        pill(W - 14, glassTop + 3, sasTxt, sasCol, 'rgba(4, 14, 24, 0.68)', 'rgba(126, 195, 221, 0.34)', 'right', true);
      }
    }
  }

  function bindThrottle() {
    var slot = $('kg-quadrant-slot'), handle = $('kg-throttle-handle');
    if (!slot) return;
    var dragging = false;
    function gFromY(y) {
      var r = slot.getBoundingClientRect();
      var t = clamp(((y - r.top) / r.height - 0.08) / 0.84, 0, 1);
      var g = 2 - 4 * t;
      // Narrow center detent allows an exact engine cut with a continuous response.
      g = Math.sign(g) * Math.max(0, Math.abs(g) - 0.025) * 2 / 1.975;
      return g;
    }
    slot.addEventListener('pointerdown', function (e) {
      dragging = true;
      try { slot.setPointerCapture(e.pointerId); } catch (err) {}
      if (handle) handle.classList.add('is-dragging');
      sendThrust(gFromY(e.clientY));
      e.preventDefault();
    });
    slot.addEventListener('pointermove', function (e) { if (dragging) sendThrust(gFromY(e.clientY)); });
    function end() { dragging = false; if (handle) handle.classList.remove('is-dragging'); }
    slot.addEventListener('pointerup', end);
    slot.addEventListener('pointercancel', end);
    if (handle) handle.addEventListener('keydown', function (e) {
      var g = S.thrustLocal, d = { ArrowUp: 0.1, ArrowRight: 0.1, ArrowDown: -0.1, ArrowLeft: -0.1, PageUp: 1, PageDown: -1 }[e.key];
      if (e.key === 'Home') { sendThrust(2); e.preventDefault(); }
      else if (e.key === 'End') { sendThrust(-2); e.preventDefault(); }
      else if (d) { sendThrust(g + d); e.preventDefault(); e.stopPropagation(); }
    });
    var wheel = $('kg-vernier-wheel');
    if (wheel) {
      var vx = null, g0 = 0;
      wheel.addEventListener('pointerdown', function (e) {
        vx = e.clientX; g0 = S.thrustLocal;
        try { wheel.setPointerCapture(e.pointerId); } catch (err) {}
        e.preventDefault();
      });
      wheel.addEventListener('pointermove', function (e) {
        if (vx == null) return;
        sendThrust(g0 + (e.clientX - vx) * 0.004);
      });
      wheel.addEventListener('pointerup', function () { vx = null; });
      wheel.addEventListener('pointercancel', function () { vx = null; });
      wheel.addEventListener('wheel', function (e) {
        sendThrust(S.thrustLocal + (e.deltaY < 0 ? 0.02 : -0.02));
        e.preventDefault();
      }, { passive: false });
      wheel.addEventListener('keydown', function (e) {
        var d = { ArrowRight: 0.01, ArrowUp: 0.01, ArrowLeft: -0.01, ArrowDown: -0.01 }[e.key];
        if (d) { sendThrust(S.thrustLocal + d); e.preventDefault(); e.stopPropagation(); }
      });
    }
  }

  function bindWarpVernier() {
    var wheel = $('kg-warp-vernier');
    if (!wheel) return;
    var vx = null, u0 = 0;
    function curNorm() {
      var w = Math.max(1, num(S.snap && S.snap.effectiveWarp, 1));
      return warpToNorm(w);
    }
    function applyNorm(u) {
      var clamped = clamp(u, 0, 1);
      var nextW = clamped <= 0.01 ? 1 : Math.round(normToWarp(clamped));
      call('setTimeWarpExact', nextW);
      var wTicks = $('kg-warp-vernier-ticks');
      if (wTicks) wTicks.style.backgroundPosition = (-(clamped * 240)).toFixed(1) + 'px 0';
      wheel.setAttribute('aria-valuenow', clamped.toFixed(3));
      setText($('kg-warp-vernier-cap'), 'WARP TRIM ' + formatWarpShort(nextW) + ' \u2194');
    }
    wheel.addEventListener('pointerdown', function (e) {
      vx = e.clientX; u0 = curNorm();
      try { wheel.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    });
    wheel.addEventListener('pointermove', function (e) {
      if (vx == null) return;
      applyNorm(u0 + (e.clientX - vx) / 140);
    });
    wheel.addEventListener('pointerup', function () { vx = null; });
    wheel.addEventListener('pointercancel', function () { vx = null; });
    wheel.addEventListener('wheel', function (e) {
      applyNorm(curNorm() + (e.deltaY < 0 ? 0.04 : -0.04));
      e.preventDefault();
    }, { passive: false });
    wheel.addEventListener('keydown', function (e) {
      var d = { ArrowRight: 0.04, ArrowUp: 0.04, ArrowLeft: -0.04, ArrowDown: -0.04 }[e.key];
      if (d) { applyNorm(curNorm() + d); e.preventDefault(); e.stopPropagation(); }
    });
  }

  function bindPuck() {
    var well = $('kg-puck-well'), knob = $('kg-puck-knob');
    if (!well || !knob) return;
    var active = false;
    function apply(x, y, on) {
      S.puckActive = !!on;
      knob.style.transform = 'translate(' + (x * 32).toFixed(1) + '%, ' + (-y * 32).toFixed(1) + '%)';
      setText($('kg-puck-axes'), 'X ' + (x >= 0 ? '+' : '') + x.toFixed(2) + MID + 'Y ' + (y >= 0 ? '+' : '') + y.toFixed(2));
      call('setPuckInput', x, y, on);
    }
    function fromEvent(e) {
      var r = well.getBoundingClientRect(), rad = r.width / 2;
      var x = (e.clientX - r.left - rad) / rad, y = -(e.clientY - r.top - rad) / rad;
      var m = Math.hypot(x, y);
      if (m > 1) { x /= m; y /= m; }
      return [x, y];
    }
    well.addEventListener('pointerdown', function (e) {
      active = true;
      try { well.setPointerCapture(e.pointerId); } catch (err) {}
      var p = fromEvent(e); apply(p[0], p[1], true);
      e.preventDefault();
    });
    well.addEventListener('pointermove', function (e) { if (active) { var p = fromEvent(e); apply(p[0], p[1], true); } });
    function end() { if (!active) return; active = false; apply(0, 0, false); }
    well.addEventListener('pointerup', end);
    well.addEventListener('pointercancel', end);
    knob.addEventListener('keydown', function (e) {
      var v = { ArrowLeft: [-0.6, 0], ArrowRight: [0.6, 0], ArrowUp: [0, 0.6], ArrowDown: [0, -0.6] }[e.key];
      if (!v) return;
      apply(v[0], v[1], true);
      e.preventDefault(); e.stopPropagation();
    });
    knob.addEventListener('keyup', function (e) {
      if (/^Arrow/.test(e.key)) apply(0, 0, false);
    });
  }

  // One commanded roll value, fed by the end-cap buttons, the thumb-wheel and the twist collar.
  function quantRoll(v) {
    v = clamp(v, -1, 1);
    return Math.abs(v) < 0.04 ? 0 : Math.round(v * 100) / 100;
  }
  function rollSet(src, v) {
    S.rollIn[src] = v;
    var out = clamp(S.rollIn.cap || S.rollIn.ring || 0, -1, 1);
    if (out === S.rollOut) return;
    S.rollOut = out;
    call('setRollInput', out);
  }
  function bindRollRing() {
    var ring = $('kg-roll-ring');
    if (!ring) return;
    var active = false, pid = null;
    function valFromPointer(e) {
      var r = ring.getBoundingClientRect();
      var cx = r.left + r.width * (62 / 124);
      var cy = r.top + r.height * (55 / 98);
      var dx = e.clientX - cx;
      var dy = e.clientY - cy;
      var ang = Math.atan2(dx, -dy);
      var half = Math.PI / 2;
      return clamp(ang, -half, half) / half;
    }
    ring.addEventListener('pointerdown', function (e) {
      if (e.target.closest && (e.target.closest('#kg-puck-well') || e.target.closest('#btn-roll-left') || e.target.closest('#btn-roll-right'))) return;
      active = true; pid = e.pointerId;
      ring.classList.add('is-grab');
      try { ring.setPointerCapture(e.pointerId); } catch (err) {}
      rollSet('ring', quantRoll(valFromPointer(e)));
      e.preventDefault();
    });
    ring.addEventListener('pointermove', function (e) {
      if (!active || e.pointerId !== pid) return;
      rollSet('ring', quantRoll(valFromPointer(e)));
    });
    function end() {
      if (!active) return;
      active = false; pid = null;
      ring.classList.remove('is-grab');
      rollSet('ring', 0);
    }
    ring.addEventListener('pointerup', end);
    ring.addEventListener('pointercancel', end);
    ring.addEventListener('lostpointercapture', end);
    ring.addEventListener('keydown', function (e) {
      if (e.target !== ring) return;
      var d = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      if (!d) return;
      rollSet('ring', d); e.preventDefault(); e.stopPropagation();
    });
    ring.addEventListener('keyup', function (e) { if (e.target === ring && /^Arrow(Left|Right)$/.test(e.key)) rollSet('ring', 0); });
    ring.addEventListener('blur', function () { if (!active) rollSet('ring', 0); });
  }

  function bindScope() {
    var cv = $('kg-scope-canvas');
    if (!cv) return;
    cv.addEventListener('wheel', function (e) {
      call('zoomOsc', e.deltaY < 0 ? 1 / 1.25 : 1.25);
      e.preventDefault();
    }, { passive: false });
    cv.addEventListener('pointermove', function (e) {
      var r = cv.getBoundingClientRect();
      var win = (S.snap.osc && S.snap.osc.windowNm) || [380, 760];
      var f = clamp((e.clientX - r.left) / Math.max(1, r.width), 0, 1);
      call('setHoverNm', win[0] + f * (win[1] - win[0]));
    });
    cv.addEventListener('pointerleave', function () { call('setHoverNm', null); });
    cv.addEventListener('dblclick', function () { call('resetSpecWindow'); });
  }

  // ------------------------------------------------------------- labels
  function hideLabels() {
    Object.keys(S.labels).forEach(function (k) { setHidden(S.labels[k], true); });
    Object.keys(S.labelState).forEach(function (k) { S.labelState[k].vis = false; });
  }
  function syncLabels(s) {
    var host = $('lh-labels');
    if (!host) return;
    if (S.screen !== 'helm' && S.screen !== 'sextant') { hideLabels(); return; }
    var list = Array.isArray(s.labels) ? s.labels : [], seen = {};
    var hostRect = host.getBoundingClientRect();
    var hudBoxes = [];
    var boxNodes = S.screen === 'helm'
      ? [$('lh-telemetry'), $('kg-sidecar-stack'), $('lh-screenbar'), $('lh-bottom'), $('kg-wpn-bar'), $('lh-notice-stack'), $('lh-warning')]
      : [$('kg-sextant-deck'), $('lh-sx-banner'), $('lh-notice-stack')];
    boxNodes.forEach(function (elHud) {
      if (!elHud || elHud.hidden) return;
      var r = elHud.getBoundingClientRect();
      if (r.width > 2 && r.height > 2) {
        hudBoxes.push({
          l: r.left - hostRect.left - 8,
          r: r.right - hostRect.left + 8,
          t: r.top - hostRect.top - 6,
          b: r.bottom - hostRect.top + 6
        });
      }
    });
    var wpnLocked = S.screen === 'helm' && s.hud && s.hud.weapons && s.hud.weaponLockOn && s.hud.weaponTarget;
    var wpnWt = wpnLocked ? s.hud.weaponTarget : null;
    if (wpnLocked && S.wpnLockBox) hudBoxes.push(S.wpnLockBox);
    if (!s.hud || !s.hud.weapons) S.wpnLockBox = null;
    var placed = [];
    var maxLabels = S.screen === 'sextant' ? 10 : ((s.mode === 'interstellar' || s.burnNode || (s.burn && s.burn.active)) ? 8 : 6);
    var padX = 10, padY = 6;
    for (var i = 0; i < list.length && placed.length < maxLabels; i++) {
      var L = list[i];
      if (!L || !Number.isFinite(L.x) || !Number.isFinite(L.y)) continue;
      var key = String(L.key || L.text || i);
      if (wpnWt && (key === wpnWt.id || key === wpnWt.key || ('body:' + key) === wpnWt.id || ('contact:' + key) === wpnWt.id || key === ('contact:' + wpnWt.key))) {
        continue;
      }
      var st = S.labelState[key];
      if (!st) st = S.labelState[key] = { x: L.x, y: L.y, vis: false };
      // Smooth screen-space tracking (prevents jitter/flicker in fast turns or relativistic flight).
      var dx = L.x - st.x, dy = L.y - st.y;
      if (!st.vis || Math.hypot(dx, dy) > 140) {
        st.x = L.x; st.y = L.y;
      } else {
        st.x += dx * 0.30;
        st.y += dy * 0.30;
      }
      var lx = Math.round(st.x);
      var ly = Math.round(st.y);
      var lw = Math.min(250, Math.max(46, String(L.text || '').length * 6.8 + 18));
      var lh = 19;
      var edgeM = st.vis ? 6 : 16;
      if (ly < edgeM || ly > hostRect.height - (edgeM + 4) || lx < edgeM || lx + lw > hostRect.width - edgeM) continue;
      // Suppress AR labels sitting beneath active HUD panels (zero overlap, 6px hysteresis for visible labels)
      var hPad = st.vis ? -4 : 4;
      var underHud = false;
      for (var hb = 0; hb < hudBoxes.length; hb++) {
        var bx = hudBoxes[hb];
        if (lx + lw > bx.l - hPad && lx < bx.r + hPad && ly + lh * 0.5 > bx.t - hPad && ly - lh * 0.5 < bx.b + hPad) {
          underHud = true;
          break;
        }
      }
      if (underHud) continue;
      // Non-flipping priority suppression: never shove labels +/-20px vertically on collisions;
      // keep higher-priority anchors stationary and cleanly hide colliding lower-priority tags.
      var cPad = st.vis ? 2 : padY;
      var collides = false;
      for (var p = 0; p < placed.length; p++) {
        var o = placed[p];
        if (lx < o.x + o.w + padX && lx + lw + padX > o.x && Math.abs(ly - o.y) < lh + cPad) {
          collides = true;
          break;
        }
      }
      if (collides) continue;
      placed.push({ x: lx, y: ly, w: lw });
      seen[key] = 1;
      st.vis = true;
      var n = S.labels[key];
      if (!n) {
        n = el('div', 'lh-label');
        n.addEventListener('click', function (ev) {
          var a = ev.currentTarget.dataset.action;
          if (a) { call('onLabelAction', a); ev.stopPropagation(); }
        });
        host.appendChild(n);
        S.labels[key] = n;
      }
      var cls = 'lh-label' + (L.cls ? ' ' + L.cls : '') + (L.action ? ' is-action' : '');
      if (n.className !== cls) n.className = cls;
      setText(n, L.text);
      if (L.action) setData(n, 'action', L.action); else if (n.dataset.action) delete n.dataset.action;
      n.style.transform = 'translate3d(' + lx + 'px,' + ly + 'px,0)';
      setHidden(n, false);
    }
    Object.keys(S.labels).forEach(function (k) {
      if (!seen[k]) {
        setHidden(S.labels[k], true);
        if (S.labelState[k]) S.labelState[k].vis = false;
      }
    });
  }

  // ------------------------------------------------------- toast / flash
  function showToast(t) {
    if (!t) return;
    setText($('lh-toast-title'), t.title || '');
    setText($('lh-toast-meta'), t.meta || '');
    setText($('lh-toast-body'), t.body || '');
    setHidden($('lh-epoch-toast'), false);
    clearTimeout(S.toastTimer);
    S.toastTimer = setTimeout(function () { setHidden($('lh-epoch-toast'), true); }, num(t.ms, 9000));
  }
  function flash(text, level) {
    var f = $('lh-flash');
    if (!f) return;
    setText(f, text);
    setData(f, 'level', level || 'info');
    setHidden(f, false);
    clearTimeout(S.flashTimer);
    S.flashTimer = setTimeout(function () { setHidden(f, true); }, 2600);
    var lvl = String(level || 'info').toLowerCase();
    if (lvl === 'critical' || lvl === 'danger' || lvl === 'warn' || lvl === 'elevated' || lvl === 'deny') {
      var nowF = performance.now();
      if (nowF - S.lastUiFlashAt > 350) {
        S.lastUiFlashAt = nowF;
        call('playUiSound', (lvl === 'critical' || lvl === 'danger') ? 'alarm' : 'deny');
      }
    }
  }

  // -------------------------------------------------------------- menu
  function syncMenu(s) {
    s = s || {};
    var cur = s.savedVoyage ? [s.savedVoyage.shipName, s.savedVoyage.systemName || s.savedVoyage.currentSystemId, 'EPOCH ' + num(s.savedVoyage.epochYear, 0).toFixed(2)].join(' // ') : '';
    var saved = s.savedVoyage;
    setHidden($('btn-menu-continue'), !saved);
    setText($('lh-menu-saved'), cur);
    var started = s.started != null ? !!s.started : S.started;
    setText($('btn-menu-resume'), started ? 'RESUME BRIDGE' : 'LAUNCH BRIDGE');
    var sys = curSys(s);
    var bits = [upper(s.systemName || (sys && sys.name) || 'SOL')];
    if (inTransit(s)) bits.push('IN TRANSIT \u2192 ' + upper(s.destName || ''));
    else if (s.docked) bits.push(upper(s.stationName || (sys && sys.station && sys.station.name) || ''), 'BERTHED');
    else bits.push('IN ORBIT');
    bits.push(CREDIT + commas(num(s.credits, 450)));
    setText($('lh-menu-status'), bits.filter(Boolean).join(MID));
    syncCustomizer(s);
    syncLaunchKey(s);
  }

  // Floats #btn-ship-launch-undock just under the projected hull, clamped to the open sky corridor.
  function syncLaunchKey(s) {
    var btn = $('btn-ship-launch-undock'), scr = $('lh-screen-menu');
    if (!btn || !scr || scr.hidden) return;
    var hideIt = s.docked === false;
    setHidden(btn, hideIt);
    if (hideIt) { S.launchPos = null; return; }
    var sr = scr.getBoundingClientRect();
    if (!(sr.width > 0 && sr.height > 0)) return;
    var pad = 8, left = pad, right = sr.width - pad, top = pad, bottom = sr.height - pad;
    var bar = doc.querySelector('.lh-screenbar');
    if (bar) { var br = bar.getBoundingClientRect(); if (br.height > 0) top = Math.max(top, br.bottom - sr.top + 6); }
    var tabs = doc.querySelector('.lh-menu-tabs');
    var sheet = !!(tabs && tabs.offsetParent !== null);
    if (sheet) { var tr = tabs.getBoundingClientRect(); bottom = Math.min(bottom, tr.top - sr.top - 6); }
    ['lh-menu-left', 'lh-menu-right'].forEach(function (id) {
      var rack = $(id);
      if (!rack || rack.offsetParent === null) return;
      var rr = rack.getBoundingClientRect();
      if (!(rr.width > 0)) return;
      if (sheet) bottom = Math.min(bottom, rr.top - sr.top - 6);
      else if (rr.left - sr.left + rr.width / 2 < sr.width / 2) left = Math.max(left, rr.right - sr.left + pad);
      else right = Math.min(right, rr.left - sr.left - pad);
    });
    var avail = right - left;
    btn.style.maxWidth = Math.max(0, avail) + 'px';
    var bw = Math.min(btn.offsetWidth || 150, Math.max(avail, 0)), bh = btn.offsetHeight || 34;
    var squeezed = avail < 96 || bottom - top < bh + 24;
    btn.classList.toggle('is-squeezed', squeezed);
    if (squeezed) { S.launchPos = null; return; }
    var tx = (left + right) / 2, ty = top + (bottom - top) * 0.74;
    var hud = s.hud;
    if (hud && typeof hud.projectPoint === 'function' && Array.isArray(hud.shipBottomLocal)) {
      var sc = $('lh-scene'), cr = sc ? sc.getBoundingClientRect() : sr;
      var p = null, W = cr.width || sr.width, H = cr.height || sr.height, lowY = NaN;
      try { p = hud.projectPoint(hud.shipBottomLocal, W, H, 'vessel'); } catch (err) { p = null; }
      if (p && p.inFront !== false && Number.isFinite(p.x) && Number.isFinite(p.y)) {
        lowY = p.y;
        // The hull is a long spar: under an oblique camera its bow or stern projects lower than midship.
        var info = null, lb = hud.shipBottomLocal, bb = hud.shipBoundsLocal, pts = null;
        if (bb && ['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ'].every(function (k) { return Number.isFinite(bb[k]); })) {
          pts = [];
          [bb.minX, bb.maxX].forEach(function (x) { [bb.minY, bb.maxY].forEach(function (y) { [bb.minZ, bb.maxZ].forEach(function (z) { pts.push([x, y, z]); }); }); });
        } else {
          var si = typeof A.getSceneInfo === 'function' ? A.getSceneInfo : (root.__LH_APP && root.__LH_APP.getSceneInfo);
          try { info = typeof si === 'function' ? si() : null; } catch (err2) { info = null; }
          var half = info && num(info.shipLengthUnits, 0) > 0 ? info.shipLengthUnits * 0.5 : 0;
          if (half > 0) pts = [[lb[0] - half, 0, 0], [lb[0] + half, 0, 0], [lb[0] - half, lb[1], lb[2]], [lb[0] + half, lb[1], lb[2]]];
        }
        if (pts) {
          pts.forEach(function (pt) {
            var q = null;
            try { q = hud.projectPoint(pt, W, H, 'vessel'); } catch (err3) { q = null; }
            if (q && q.inFront !== false && Number.isFinite(q.y)) lowY = Math.max(lowY, q.y);
          });
        }
        tx = p.x + (cr.left - sr.left); ty = lowY + (cr.top - sr.top) + 16;
      }
    }
    var halfW = bw / 2;
    tx = avail < bw ? (left + right) / 2 : clamp(tx, left + halfW, right - halfW);
    ty = clamp(ty, top, bottom - bh);
    var pos = S.launchPos;
    if (!pos) pos = S.launchPos = { x: tx, y: ty };
    else { pos.x += (tx - pos.x) * 0.3; pos.y += (ty - pos.y) * 0.3; }
    btn.style.left = clamp(pos.x, left + halfW, Math.max(left + halfW, right - halfW)).toFixed(1) + 'px';
    btn.style.top = clamp(pos.y, top, Math.max(top, bottom - bh)).toFixed(1) + 'px';
  }

  function clearPendingGenome() {
    clearTimeout(S.pendingTimer);
    S.pendingTimer = 0;
    S.pendingGenome = null;
  }
  function scheduleGenomeParam(key, val) {
    if (!S.pendingGenome) S.pendingGenome = {};
    S.pendingGenome[key] = val;
    clearTimeout(S.pendingTimer);
    S.pendingTimer = setTimeout(flushGenome, 24);
  }
  function flushGenome() {
    clearTimeout(S.pendingTimer);
    S.pendingTimer = 0;
    var patch = S.pendingGenome;
    if (!patch) return;
    S.pendingGenome = null;
    if (typeof A.setGenomeParams === 'function') call('setGenomeParams', patch);
    else Object.keys(patch).forEach(function (k) { call('setGenomeParam', k, patch[k]); });
  }
  function applyStylePatch(patch) {
    clearPendingGenome();
    if (typeof A.setGenomeParams === 'function') call('setGenomeParams', patch);
    else Object.keys(patch).forEach(function (k) { call('setGenomeParam', k, patch[k]); });
  }
  function formatStyleMix(P) {
    var parts = [];
    STYLE_DEFS.forEach(function (d) {
      var pct = Math.round(clamp(num(P[d[0]], 0), 0, 1) * 100);
      if (pct >= 3) parts.push({ tag: d[2], pct: pct });
    });
    if (!parts.length) return 'STOCK HULL';
    parts.sort(function (a, b) { return b.pct - a.pct; });
    return parts.slice(0, 3).map(function (p) { return p.tag + ' ' + p.pct + '%'; }).join(' + ');
  }
  function buildChipGroup(host, label, key, values, labels, type, extra) {
    if (label) host.appendChild(el('p', 'lh-sec-title', label));
    var g = el('div', 'lh-chip-grid');
    g.setAttribute('role', 'group');
    if (label) g.setAttribute('aria-label', label);
    values.forEach(function (v) {
      var b = el('button', 'acidburn-button', labels ? (labels[v] || String(v)) : String(v));
      b.type = 'button'; b.dataset.gkey = key; b.dataset.gval = String(v); b.dataset.gtype = type || 'str';
      b.setAttribute('aria-pressed', 'false');
      g.appendChild(b);
    });
    if (extra) extra(g);
    host.appendChild(g);
    return g;
  }
  function buildDialList(host, prefix, list, badgeFn) {
    var wrap = el('div', 'lh-dial-list');
    list.forEach(function (d) {
      var lab = el('label', 'lh-dial');
      var id = prefix + '-dial-' + d[0];
      lab.htmlFor = id;
      var head = el('span', 'lh-dial-head');
      head.appendChild(el('span', '', d[1] + (badgeFn ? badgeFn(d) : '')));
      var v = el('span', 'lh-dial-val', '');
      v.id = prefix + '-val-' + d[0];
      head.appendChild(v);
      lab.appendChild(head);
      var inp = el('input');
      inp.type = 'range'; inp.min = '0'; inp.max = '100'; inp.step = '1';
      inp.id = id; inp.dataset.gdial = d[0];
      lab.appendChild(inp);
      wrap.appendChild(lab);
    });
    host.appendChild(wrap);
    return wrap;
  }
  function buildPresetChips(host, randId) {
    var G = Gn();
    if (!G) return;
    (G.PRESETS || []).forEach(function (p) {
      var b = el('button', 'acidburn-button', p.name);
      b.type = 'button'; b.dataset.preset = p.id; b.setAttribute('aria-pressed', 'false');
      if (PRESET_TAGS[p.id]) {
        var tag = el('span', 'lh-preset-tag', PRESET_TAGS[p.id]);
        b.appendChild(tag);
      }
      host.appendChild(b);
    });
    var rnd = el('button', 'acidburn-button', '+ random');
    rnd.type = 'button'; rnd.id = randId;
    host.appendChild(rnd);
  }
  function syncGenomeWidgets(scope, s) {
    if (!scope) return;
    var P = genomeP(s);
    qa('[data-gkey]', scope).forEach(function (b) {
      var k = b.dataset.gkey, v = P[k];
      if (b.dataset.gtype === 'bool') setPressed(b, !!v);
      else setPressed(b, String(v) === b.dataset.gval);
    });
    var cov = clamp(num(P.iceCoverage, 1), 0, 1);
    var covMode = cov < 0.05 ? 'bare' : cov < 0.88 ? 'cap' : 'full';
    qa('[data-ice-cover]', scope).forEach(function (b) {
      setPressed(b, b.dataset.iceCover === covMode);
    });
    qa('[data-preset]', scope).forEach(function (b) {
      var pid = s.presetId || (s.genome && s.genome.presetId);
      setPressed(b, !!(pid && pid === b.dataset.preset));
    });
    qa('[data-gdial]', scope).forEach(function (inp) {
      var k = inp.dataset.gdial;
      var pending = S.pendingGenome && S.pendingGenome[k] != null;
      var v = (pending ? S.pendingGenome[k] : num(P[k], STYLE_KEY_SET[k] ? 0 : 0.5)) * 100;
      if (!pending && doc.activeElement !== inp && Math.abs(num(inp.value, -1) - v) > 0.5) inp.value = Math.round(v);
      var shown = Math.round(num(inp.value, v)) + '%';
      setText($('cz-val-' + k), shown);
      setText($('dd-val-' + k), shown);
    });
  }
  function setIceCover(mode) {
    var P = genomeP(S.snap);
    var curThick = clamp(num(P.iceThick, 0.36), 0, 1);
    var patch = mode === 'bare'
      ? { iceCoverage: 0 }
      : mode === 'cap'
        ? { iceCoverage: 0.65, iceThick: Math.max(curThick, 0.24) }
        : { iceCoverage: 1.0, iceThick: Math.max(curThick, 0.36) };
    applyStylePatch(patch);
    var dd = (S.snap && S.snap.drydock) || {};
    var isCutaway = dd.cutaway != null ? !!dd.cutaway : !!S.snap.hideIce;
    if (mode !== 'bare' && isCutaway) {
      call('toggleCutawayIce');
      syncCutaways(false);
    }
  }
  function syncCutaways(on) {
    qa('[data-cutaway]').forEach(function (b) { setPressed(b, !!on); });
  }
  function buildHullControls(host, prefix, G) {
    buildChipGroup(host, 'BOW / FORWARD HULL', 'hullShape', G.HULL_SHAPES, G.HULL_LABELS);
    buildChipGroup(host, 'REAR CONE', 'aftShape', G.AFT_SHAPES, G.AFT_LABELS);
    buildChipGroup(host, 'RADIATOR FINS & SPIN HAB', 'fins', [0, 2, 4], { 0: '0 FINS', 2: '2 WINGLETS', 4: '4 VANES' }, 'num', function (fg) {
      var hab = el('button', 'acidburn-button', 'SPIN RING');
      hab.type = 'button'; hab.dataset.gkey = 'habRing'; hab.dataset.gtype = 'bool'; hab.setAttribute('aria-pressed', 'false');
      fg.appendChild(hab);
    });
    buildChipGroup(host, 'SHUTTLE & WEAPON PORTS', 'shuttlePorts', [0, 2, 4, 6], { 0: '0 PORTS', 2: '2 BAYS', 4: '4 BAYS', 6: '6 BAYS' }, 'num');
    buildChipGroup(host, 'PORT ZONE', 'portPlacement', G.PORT_PLACEMENTS, G.PORT_PLACEMENT_LABELS);
    host.appendChild(el('p', 'lh-sec-title', 'PROPORTIONS'));
    buildDialList(host, prefix, [
      ['needleLen', 'Forward hull length'],
      ['aftLen', 'Rear cone length'],
      ['girth', 'Waist beam / girth'],
      ['hullCurve', 'Ogive curvature'],
      ['flatten', 'Blade ellipticity'],
      ['greebles', 'Greebling & trusses'],
      ['cityLights', 'City-collar lights']
    ]);
  }
  function buildStyleControls(host, prefix, G) {
    host.appendChild(el('p', 'lh-sec-title', 'QUICK SOLO / STOCK'));
    var sg = el('div', 'lh-chip-grid');
    var clr = el('button', 'acidburn-button', 'STOCK (0%)');
    clr.type = 'button'; clr.dataset.styleSolo = 'none';
    sg.appendChild(clr);
    STYLE_DEFS.forEach(function (d) {
      var b = el('button', 'acidburn-button', '100% ' + d[2]);
      b.type = 'button'; b.dataset.styleSolo = d[0];
      sg.appendChild(b);
    });
    host.appendChild(sg);
    host.appendChild(el('p', 'lh-sec-title', 'PROCEDURAL SURFACE BLEND (0-100%)'));
    buildDialList(host, prefix, STYLE_DEFS.map(function (d) { return [d[0], d[1] + ' [' + d[2] + ']']; }));
    var descs = G.STYLE_DESCRIPTIONS || {};
    var notes = el('ul', 'lh-vault-list lh-style-notes');
    STYLE_DEFS.forEach(function (d) {
      var txt = descs[d[0]];
      if (txt) notes.appendChild(el('li', '', d[2] + ': ' + txt));
    });
    if (notes.children.length) host.appendChild(notes);
  }
  function buildIceControls(host, prefix, G) {
    host.appendChild(el('p', 'lh-sec-title', 'BOW ICE COVERAGE'));
    var cg = el('div', 'lh-chip-grid');
    cg.setAttribute('role', 'group');
    cg.setAttribute('aria-label', 'Bow ice coverage');
    [['bare', '0% BARE BOW'], ['cap', '65% ICE CAP'], ['full', '100% FULL BOW ICE']].forEach(function (it) {
      var b = el('button', 'acidburn-button', it[1]);
      b.type = 'button'; b.dataset.iceCover = it[0]; b.setAttribute('aria-pressed', 'false');
      cg.appendChild(b);
    });
    host.appendChild(cg);
    buildChipGroup(host, 'ICE SYMMETRY (FLIP & BURN)', 'iceSymmetry', G.ICE_SYMMETRIES, G.ICE_SYMMETRY_LABELS);
    buildChipGroup(host, 'BOW DESIGN / SHAPE', 'hullShape', G.HULL_SHAPES, G.HULL_LABELS);
    host.appendChild(el('p', 'lh-sec-title', 'ICE SHIELD DESIGN'));
    buildDialList(host, prefix, [
      ['iceCoverage', 'Hull ice coverage'],
      ['iceThick', 'Ice layer thickness'],
      ['surfaceTex', 'Surface relief'],
      ['borderAsym', 'Asymmetric border'],
      ['skirtJagged', 'Skirt serration'],
      ['crags', 'Glacial ridges'],
      ['iceTint', 'Cryo-blue \u2192 obsidian']
    ]);
  }
  function buildDriveControls(host, prefix, G) {
    buildChipGroup(host, 'TORCH POD STYLE', 'podStyle', G.POD_STYLES, G.POD_LABELS);
    buildChipGroup(host, 'ENGINE PLACEMENT / SYMMETRY', 'arch', G.ARCHS, G.ARCH_LABELS);
    host.appendChild(el('p', 'lh-sec-title', 'ENGINE SIZE'));
    buildDialList(host, prefix, [['nacelleSize', 'Pod & plume scale']]);
  }
  function buildWeaponsControls(host, prefix, G) {
    if (!host || !G || !G.WEAPON_KEYS) return;
    host.appendChild(el('p', 'lh-sec-title', 'POWER & THERMAL BUDGET'));
    var bud = el('div', 'lh-wpn-budget');
    function makeMeter(lbl, role) {
      var m = el('div', 'lh-wpn-meter');
      var top = el('div', '');
      top.style.display = 'flex'; top.style.justifyContent = 'space-between';
      top.appendChild(el('span', '', lbl));
      var val = el('strong', '', '0 / 0 MW');
      val.dataset.wpnRole = role + '-val';
      top.appendChild(val);
      m.appendChild(top);
      var tr = el('div', 'lh-wpn-track');
      var fl = el('div', 'lh-wpn-fill');
      fl.dataset.wpnRole = role + '-fill';
      tr.appendChild(fl);
      m.appendChild(tr);
      return m;
    }
    bud.appendChild(makeMeter('CORE POWER', 'power'));
    bud.appendChild(makeMeter('RADIATOR HEAT', 'heat'));
    var warn = el('div', 'lh-wpn-warn', '');
    warn.dataset.wpnRole = 'warn';
    warn.hidden = true;
    bud.appendChild(warn);
    host.appendChild(bud);

    host.appendChild(el('p', 'lh-sec-title', 'LOADOUT PRESETS'));
    var pg = el('div', 'lh-chip-grid');
    (G.WEAPON_PRESETS || []).forEach(function (pr) {
      var b = el('button', 'acidburn-button', pr.label);
      b.type = 'button'; b.dataset.wpnPreset = pr.id; b.setAttribute('aria-pressed', 'false');
      pg.appendChild(b);
    });
    host.appendChild(pg);

    host.appendChild(el('p', 'lh-sec-title', 'ORDNANCE HARDPOINTS (+' + CREDIT + '15 / MOUNT)'));
    var list = el('div', 'lh-wpn-list');
    (G.WEAPON_KEYS || []).forEach(function (k) {
      var sp = G.WEAPON_SPECS[k];
      if (!sp) return;
      var row = el('div', 'lh-wpn-row');
      var meta = el('div', 'lh-wpn-meta');
      meta.appendChild(el('strong', '', sp.label));
      meta.appendChild(el('span', '', sp.powerMW + ' MW PWR / ' + sp.heatMW + ' MW HEAT' + MID + sp.desc));
      row.appendChild(meta);
      var step = el('div', 'lh-wpn-step');
      var minus = el('button', 'acidburn-button', '-');
      minus.type = 'button'; minus.dataset.wpnKey = k; minus.dataset.wpnDelta = '-1';
      minus.setAttribute('aria-label', 'Remove ' + sp.label);
      var cnt = el('span', 'lh-wpn-cnt', String(sp.def));
      cnt.dataset.wpnCnt = k;
      var plus = el('button', 'acidburn-button', '+');
      plus.type = 'button'; plus.dataset.wpnKey = k; plus.dataset.wpnDelta = '1';
      plus.setAttribute('aria-label', 'Add ' + sp.label);
      step.appendChild(minus); step.appendChild(cnt); step.appendChild(plus);
      row.appendChild(step);
      list.appendChild(row);
    });
    host.appendChild(list);
  }
  function syncWeaponsPanel(scope, s) {
    var G = Gn();
    if (!scope || !G || !G.computeWeaponBudget) return;
    s = s || {};
    var specs = getSpecs(s);
    var P = genomeP(s);
    var gNow = Object.assign({}, s.genome || {}, { P: P });
    var b = (s.weaponBudget && s.weaponBudget.powerBudgetMW) ? s.weaponBudget : G.computeWeaponBudget(gNow, specs);
    var pVal = scope.querySelector('[data-wpn-role="power-val"]');
    var pFill = scope.querySelector('[data-wpn-role="power-fill"]');
    var hVal = scope.querySelector('[data-wpn-role="heat-val"]');
    var hFill = scope.querySelector('[data-wpn-role="heat-fill"]');
    var warn = scope.querySelector('[data-wpn-role="warn"]');
    setText(pVal, commas(b.powerUsedMW) + ' / ' + commas(b.powerBudgetMW) + ' MW');
    setText(hVal, commas(b.heatUsedMW) + ' / ' + commas(b.heatBudgetMW) + ' MW');
    if (pFill) {
      pFill.style.width = Math.min(100, (b.powerFrac || 0) * 100).toFixed(1) + '%';
      pFill.classList.toggle('is-over', !!b.overPower);
    }
    if (hFill) {
      hFill.style.width = Math.min(100, (b.heatFrac || 0) * 100).toFixed(1) + '%';
      hFill.classList.toggle('is-over', !!b.overHeat);
    }
    if (warn) {
      setHidden(warn, !!b.withinBudget);
      if (!b.withinBudget) {
        setText(warn, (b.overPower ? 'POWER OVER BUDGET ' : '') + (b.overHeat ? 'RADIATOR HEAT OVER BUDGET' : '') + ' -- INCREASE ENGINE / FINS / RADIATORS OR TRIM MOUNTS');
      }
    }
    (G.WEAPON_KEYS || []).forEach(function (k) {
      var sp = G.WEAPON_SPECS[k];
      var c = P[k] != null ? Math.round(P[k]) : sp.def;
      var cntEl = scope.querySelector('[data-wpn-cnt="' + k + '"]');
      setText(cntEl, String(c));
      var minus = scope.querySelector('[data-wpn-key="' + k + '"][data-wpn-delta="-1"]');
      var plus = scope.querySelector('[data-wpn-key="' + k + '"][data-wpn-delta="1"]');
      if (minus) setDisabled(minus, c <= sp.min);
      if (plus) {
        var canAdd = c < sp.max &&
          (b.powerUsedMW + sp.powerMW <= b.powerBudgetMW) &&
          (b.heatUsedMW + sp.heatMW <= b.heatBudgetMW);
        setDisabled(plus, !canAdd);
      }
    });
    qa('[data-wpn-preset]', scope).forEach(function (btn) {
      var pr = (G.WEAPON_PRESETS || []).find(function (x) { return x.id === btn.dataset.wpnPreset; });
      if (!pr) return;
      var match = (G.WEAPON_KEYS || []).every(function (wk) {
        var curV = P[wk] != null ? Math.round(P[wk]) : G.WEAPON_SPECS[wk].def;
        return curV === pr.P[wk];
      });
      setPressed(btn, match);
    });
  }
  function renderDriveSpecs(dl, specs) {
    if (!dl || !specs) return;
    var rows = [
      ['LENGTH', commas(specs.totalM) + ' m'],
      ['HULL + ICE MASS', specs.dryMassMt.toFixed(2) + ' Mt'],
      ['DRIVE MODE', specs.driveModeLabel || (specs.reversibleDrive === false ? 'FLIP & BURN (BI-CONE)' : 'REVERSIBLE (G-FLIP)')],
      ['VACUUM CORE', Math.round(num(specs.coreRatingGW, 0)) + ' GW'],
      ['RADIATOR', Math.round(num(specs.radiatorMW, 0)) + ' MW'],
      ['HEADROOM / SUST', num(specs.thermalHeadroom, 1).toFixed(2) + 'x / ' + num(specs.sustainedAccelG, 1).toFixed(2) + 'g'],
      ['EXHAUST v\u2091', specs.exhaustVelC.toFixed(2) + 'c'],
      ['MAX / SAFE ' + BETA, specs.maxAccelG.toFixed(2) + 'g / ' + specs.maxSafeBetaPct.toFixed(1) + '%']
    ];
    var key = JSON.stringify(rows);
    if (dl.__key !== key) {
      dl.__key = key; dl.textContent = '';
      rows.forEach(function (r) {
        var d = el('div'); d.appendChild(el('dt', '', r[0])); d.appendChild(el('dd', '', r[1])); dl.appendChild(d);
      });
    }
  }
  function buildCustomizer() {
    var G = Gn(), presets = $('lh-cz-presets'), shape = $('lh-cz-shape'), ice = $('lh-cz-ice-body'), styles = $('lh-cz-styles'), drive = $('lh-cz-drive-body'), wpn = $('lh-cz-weapons');
    if (!G || !presets || presets.__built) return;
    presets.__built = true;
    buildPresetChips(presets, 'btn-cz-random');
    if (shape) buildHullControls(shape, 'cz', G);
    if (ice) buildIceControls(ice, 'cz', G);
    if (styles) {
      styles.textContent = '';
      buildStyleControls(styles, 'cz', G);
    }
    if (drive) buildDriveControls(drive, 'cz', G);
    if (wpn) buildWeaponsControls(wpn, 'cz', G);
  }
  function syncCustomizer(s) {
    buildCustomizer();
    s = s || {};
    var P = genomeP(s);
    setText($('lh-cz-name'), upper(s.shipName || (s.genome && s.genome.name) || 'Long Patience'));
    setText($('lh-cz-mix'), formatStyleMix(P));
    syncGenomeWidgets($('lh-menu-right'), s);
    syncWeaponsPanel($('lh-cz-weapons'), s);
    var specs = getSpecs(s);
    if (specs) {
      setText($('lh-cz-shield'), (specs.reversibleDrive === false ? 'FLIP & BURN (BI-CONE)' : 'REVERSIBLE DRIVE (BOW ICE)') + MID + 'SHIELD ' + fmtPct(specs.iceShieldRating, 0) + MID + 'ICE ' + specs.iceMt.toFixed(2) + ' Mt' + MID + 'SAFE ' + BETA + ' ' + specs.maxSafeBetaPct.toFixed(0) + '%');
      renderDriveSpecs($('lh-cz-specs'), specs);
    }
    var dd = s.drydock || {};
    var cam = dd.cam || s.drydockCam || 'orbit';
    qa('#lh-menu-right [data-dcam]').forEach(function (b) { setPressed(b, b.dataset.dcam === cam); });
    syncCutaways(dd.cutaway != null ? !!dd.cutaway : !!s.hideIce);
  }
  function switchMenuTab(tab) {
    S.menuTab = tab === 'custom' ? 'custom' : 'launch';
    setData($('lh-screen-menu'), 'menutab', S.menuTab);
    qa('[data-menutab]').forEach(function (b) {
      if (b.tagName === 'BUTTON') b.setAttribute('aria-selected', b.dataset.menutab === S.menuTab ? 'true' : 'false');
    });
  }

  // ------------------------------------------------------ canvas helpers
  function fitCanvas(cv) {
    var dpr = Math.min(2, root.devicePixelRatio || 1);
    var w = Math.max(1, cv.clientWidth), h = Math.max(1, cv.clientHeight);
    var W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }
  function niceStep(x) {
    var p = Math.pow(10, Math.floor(Math.log10(x))), m = x / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }
  function bindPanZoom(cv, onDrag, onZoom, onTap) {
    var pts = {}, last = null, moved = 0, pinch = 0, dragBtn = 0, hadButtons = false;
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    cv.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') {
        if (e.button !== 0 && e.button !== 2) return;
        pts = {};
      }
      dragBtn = e.button || 0;
      hadButtons = (e.buttons || 0) > 0;
      pts[e.pointerId] = [e.clientX, e.clientY];
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
      last = [e.clientX, e.clientY]; moved = 0; pinch = 0;
    });
    cv.addEventListener('pointermove', function (e) {
      if (!pts[e.pointerId]) return;
      if (e.pointerType === 'mouse' && hadButtons && e.buttons === 0) { up(e); return; }
      pts[e.pointerId] = [e.clientX, e.clientY];
      var ids = Object.keys(pts);
      if (ids.length >= 2) {
        var a = pts[ids[0]], b = pts[ids[1]], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) onZoom(d / pinch, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        pinch = d; moved += 10;
        return;
      }
      if (!last) return;
      var dx = e.clientX - last[0], dy = e.clientY - last[1];
      moved += Math.abs(dx) + Math.abs(dy);
      last = [e.clientX, e.clientY];
      if (moved > 3) onDrag(dx, dy, e);
    });
    function up(e) {
      var wasTap = Object.keys(pts).length === 1 && moved <= 4 && (e.pointerType !== 'mouse' || dragBtn === 0);
      delete pts[e.pointerId];
      if (!Object.keys(pts).length) { last = null; pinch = 0; }
      if (wasTap && onTap && e.type === 'pointerup') onTap(e);
    }
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('lostpointercapture', up);
    root.addEventListener('blur', function () { pts = {}; last = null; pinch = 0; });
    cv.addEventListener('wheel', function (e) {
      onZoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY);
      e.preventDefault();
    }, { passive: false });
  }

  // ---------------------------------------------- orbital navigator data
  function computeTargets(s) {
    if (Array.isArray(s.targetOrbits) && s.targetOrbits.length) return s.targetOrbits;
    var now = performance.now(), o = s.orbit, custR = num(s.customOrbitKm, NaN);
    var cKey = (s.systemId || '') + '|' + (o && o.focusSoi || '') + '|' + (o && o.planetIdx || 0) + '|' + (Number.isFinite(custR) ? Math.round(custR) : '');
    if (S.cache.tgtAt && now - S.cache.tgtAt < 500 && S.cache.tgtKey === cKey) return S.cache.targets;
    var O = Ox(), G = Gx(), sys = curSys(s), out = [];
    if (O && G && o && isArr3(o.rKm) && isArr3(o.vKmS) && sys) {
      var mu = orbitMu(s, sys), pIdx = o.focusSoi === 'star' ? -1 : (o.planetIdx || 0);
      var accel = burnAccelG(s) * G0_KMS2;
      var list = [];
      try { list = G.getSystemTargetOrbits(sys, pIdx, o.rKm, mu, num(s.simTimeS, 0)) || []; } catch (e) { list = []; }
      var bodyR = num(o.bodyRadiusKm, o.focusSoi === 'star' ? sys.starRadiusKm : (sys.planets[o.planetIdx || 0] ? sys.planets[o.planetIdx || 0].radiusKm : 0));
      if (Number.isFinite(custR) && custR > bodyR * 1.04) {
        list = [{
          id: 'custom',
          label: 'CUSTOM ORBIT (' + fmtKm(Math.max(0, custR - bodyR)) + ')',
          kind: 'custom',
          radiusKm: custR, rpKm: custR, raKm: custR, incRad: 0, lanRad: 0
        }].concat(list);
      }
      out = list.map(function (tg) {
        var r = Object.assign({}, tg);
        try {
          var plan = O.planHohmannTransfer(o.rKm, o.vKmS, mu, tg);
          r.dvKmS = plan.totalDvKmS;
          r.transferS = num(plan.transferTimeS, 0) + num(plan.waitTimeS, 0);
          r.burnS = r.dvKmS / accel;
          r.plan = plan;
        } catch (e) { r.plan = null; }
        return r;
      });
    }
    S.cache.tgtAt = now; S.cache.tgtKey = cKey; S.cache.targets = out;
    return out;
  }
  // Reactionless drive: a burn costs time and heat, never propellant. Plan at sustained thrust.
  function burnAccelG(s) {
    var specs = getSpecs(s) || {};
    return Math.max(0.05, num(coreThermal(s).sustainedG, num(specs.maxAccelG, 1)));
  }
  function selectedTargetObj(s) {
    var list = computeTargets(s);
    for (var i = 0; i < list.length; i++) if (list[i].id === S.selTarget) return list[i];
    return null;
  }
  function curvePoints(c, mu) {
    if (!c) return null;
    if (Array.isArray(c.points)) return { points: c.points };
    var O = Ox();
    if (!O || !c.el || !Number.isFinite(c.el.e)) return null;
    try { return O.sampleOrbitPoints(c.el, c.muKm3S2 || mu, 220); } catch (e) { return null; }
  }
  function orbitCurves(s, sys) {
    var o = s.orbit || {}, mu = orbitMu(s, sys), O = Ox();
    var src = s.orbits || {}, cur = src.current, xfer = src.transfer, tgt = src.target;
    var nodes = Array.isArray(s.burnNodes) ? s.burnNodes.slice() : null;
    if (!cur && O && isArr3(o.rKm) && isArr3(o.vKmS)) {
      var el0 = o.el;
      if (!el0) { try { el0 = O.stateToElements(o.rKm, o.vKmS, mu); } catch (e) { el0 = null; } }
      if (el0) cur = { el: el0, muKm3S2: mu };
    }
    var sel = (!xfer || !tgt || !nodes) ? selectedTargetObj(s) : null;
    var plan = sel && sel.plan;
    if (plan && O) {
      if (!xfer && plan.predictedTransferEl && plan.transferTimeS > 0) xfer = { el: plan.predictedTransferEl, muKm3S2: mu };
      if (!tgt && plan.targetEl && sel.kind !== 'escape') tgt = { el: plan.targetEl, muKm3S2: mu };
      if (!nodes && cur && cur.el) {
        nodes = [];
        try { nodes.push({ kind: 'burn1', label: 'BURN 1', rKm: O.elementsToState(Object.assign({}, cur.el, { nuRad: plan.dv1NodeNuRad }), mu).rKm }); } catch (e) {}
        if (plan.transferTimeS > 0 && plan.predictedTransferEl && plan.dv2KmS > 1e-6) {
          try { nodes.push({ kind: 'burn2', label: 'BURN 2', rKm: O.elementsToState(Object.assign({}, plan.predictedTransferEl, { nuRad: Math.PI }), mu).rKm }); } catch (e) {}
        }
      }
    }
    return { current: curvePoints(cur, mu), transfer: curvePoints(xfer, mu), target: curvePoints(tgt, mu), nodes: nodes || [] };
  }

  // ------------------------------------------------- orbital navigator UI
  function renderTargets(s) {
    var host = $('lh-target-list');
    if (!host) return;
    var list = computeTargets(s);
    var key = list.map(function (t) {
      return t.id + ':' + (Number.isFinite(t.dvKmS) ? t.dvKmS.toFixed(3) : '') + ':' + (Number.isFinite(t.transferS) ? Math.round(t.transferS / 60) : '');
    }).join('|') + '#' + S.selTarget;
    if (host.__key === key) return;
    host.__key = key;
    host.textContent = '';
    if (!list.length) {
      var emptyMsg = s.docked ? 'Undock to plan orbital maneuvers.'
        : (s.mode === 'interstellar' && !(s.multiHop && s.multiHop.harvesting)
          ? 'Interstellar transit: enter a star gravity well to plot orbits.'
          : 'No orbital targets in range.');
      host.appendChild(el('p', 'lh-empty', emptyMsg));
      return;
    }
    list.forEach(function (t) {
      var b = el('button', 'lh-target');
      b.type = 'button';
      b.setAttribute('role', 'option');
      b.dataset.targetId = t.id;
      b.setAttribute('aria-selected', t.id === S.selTarget ? 'true' : 'false');
      if (t.feasible === false) b.classList.add('is-infeasible');
      if (t.kind === 'ice-deposit') b.classList.add('is-ice-deposit');
      b.appendChild(el('strong', 'lh-target-name', upper(t.label || t.id)));
      var meta = el('span', 'lh-target-meta');
      meta.appendChild(el('span', '', DELTA + 'v ' + (Number.isFinite(t.dvKmS) ? t.dvKmS.toFixed(3) + ' km/s' : DASH)));
      meta.appendChild(el('span', '', Number.isFinite(t.transferS) ? fmtDur(t.transferS) : DASH));
      meta.appendChild(el('span', '', 'BURN ' + (Number.isFinite(t.burnS) ? fmtDur(t.burnS) : DASH)));
      b.appendChild(meta);
      host.appendChild(b);
    });
  }
  function activeStarName(s) {
    var sys = curSys(s || S.snap);
    return upper((sys && sys.name) || 'SOL');
  }
  function setOrbitHint(message, s) {
    setText($('lh-orbit-hint'), message + MID + 'SCROLL ZOOM OUT TO ' + activeStarName(s) + ' & SYSTEM VEIL');
  }
  function flipBurnPlan(s) {
    var orbits = s.orbits || {}, transfer = orbits.transfer;
    return orbits.brachistochrone || (transfer && transfer.isBrachistochrone && transfer);
  }
  function shortTargetLabel(raw, starName) {
    var txt = upper(raw).replace(/[^A-Z0-9-]+/g, ' ').trim();
    if (starName && txt.indexOf(starName + ' ') === 0 && txt.length > starName.length + 1) {
      txt = txt.slice(starName.length + 1).trim();
    }
    if (txt.length <= 9) return txt;
    var words = txt.split(/\s+/), picked = '';
    for (var i = 0; i < words.length; i++) {
      var cand = picked ? (picked + ' ' + words[i]) : words[i];
      if (cand.length <= 9) picked = cand;
      else break;
    }
    if (picked) return picked;
    return words[0].slice(0, 8);
  }
  function syncOrbitQuickLabels(s) {
    var capBtn = $('btn-orbit-capture'), capLbl = $('lbl-orbit-capture');
    if (capBtn && capLbl) {
      var sel = selectedTargetObj(s || S.snap);
      if (sel && (sel.kind === 'moon' || sel.kind === 'planet')) {
        var shortTgt = shortTargetLabel(sel.label || sel.id, activeStarName(s));
        setText(capLbl, 'ORBIT ' + shortTgt);
        capBtn.title = 'Plot transfer and safe capture orbit around ' + upper(sel.label || sel.id);
      } else if (sel && sel.kind === 'station') {
        setText(capLbl, 'ORBIT STN');
        capBtn.title = 'Plot transfer to station orbit';
      } else if (sel && sel.kind === 'ice-deposit') {
        setText(capLbl, 'ORBIT ICE');
        capBtn.title = 'Plot transfer to ' + upper(sel.label || sel.id);
      } else {
        setText(capLbl, 'ORBIT');
        capBtn.title = 'Plot a transfer and safe capture orbit around the selected target';
      }
    }
    var cm = S.circMode || 'now';
    qa('[data-circ-mode]').forEach(function (b) { setPressed(b, b.dataset.circMode === cm); });
    var circBtn = doc.querySelector('#lh-quick-row [data-quick-burn="circularize"]');
    if (circBtn) {
      var circLbl = circBtn.querySelector('.lh-quick-lbl');
      if (circLbl) setText(circLbl, cm === 'now' ? 'CIRC' : ('CIRC ' + upper(cm)));
    }
  }
  function syncOrbitPanel(s) {
    var sys = curSys(s), o = s.orbit || {};
    if (sys && sys.id !== S.orbitHintSys) {
      S.orbitHintSys = sys.id;
      setOrbitHint('PICK TARGET' + MID + 'TAP ORBIT OR FLIP-BURN' + MID + 'EXEC & WATCH ON HELM', s);
    }
    if (s.selectedTargetId !== undefined && s.selectedTargetId !== S.lastSnapTarget) {
      S.lastSnapTarget = s.selectedTargetId;
      S.selTarget = s.selectedTargetId;
    }
    renderTargets(s);
    syncOrbitQuickLabels(s);
    var soi = S.orbitSoi || o.focusSoi || 'planet';
    var d3 = S.o3 ? (S.o3Diag || {}) : null;
    if (d3 && d3.frame) soi = d3.frame === 'star' ? 'star' : 'planet';
    if (!S.o3) qa('[data-orbit-frame]').forEach(function (b) { setPressed(b, b.dataset.orbitFrame === soi); });
    var planet = sys && sys.planets && sys.planets[(d3 && d3.planetIdx != null ? d3.planetIdx : o.planetIdx) || 0];
    var gravPrimary = s.orbitPrimary || o.primary || o.focusSoi || 'planet';
    var oPlanet = sys && sys.planets && sys.planets[o.planetIdx || 0];
    var oMoon = oPlanet && oPlanet.moons && oPlanet.moons[o.moonIdx || 0];
    var gravLabel = upper(s.orbitPrimaryLabel || o.bodyName ||
      (gravPrimary === 'star' ? (sys && sys.name) : gravPrimary === 'moon' ? (oMoon && oMoon.name) : (oPlanet && oPlanet.name)) ||
      'PRIMARY');
    var viewFrame = (d3 && d3.frame) || s.orbitViewFrame || soi;
    var viewPlanetIdx = d3 && d3.planetIdx != null ? d3.planetIdx : (o.planetIdx || 0);
    var viewMoonIdx = d3 && d3.moonIdx != null ? d3.moonIdx : (o.moonIdx || 0);
    var viewPlanet = sys && sys.planets && sys.planets[viewPlanetIdx];
    var viewMoon = viewPlanet && viewPlanet.moons && viewPlanet.moons[viewMoonIdx];
    var viewLabel = viewFrame === 'moon' ? upper((viewMoon && viewMoon.name) || 'MOON')
      : viewFrame === 'star' ? upper((sys && sys.name) || 'STAR')
      : viewFrame === 'planet' ? upper((viewPlanet && viewPlanet.name) || 'PLANET')
      : viewFrame === 'synodic' ? 'SYNODIC'
      : viewFrame === 'target' ? (function () {
          var selT = selectedTargetObj(s);
          return (selT ? upper(selT.label || selT.id) : 'TARGET') +
            (d3 && d3.closestApproachKm != null ? (MID + 'CA ' + fmtKm(d3.closestApproachKm)) : '');
        })()
      : upper(viewFrame);
    var sameBody = viewFrame === gravPrimary &&
      (gravPrimary !== 'planet' || viewPlanetIdx === (o.planetIdx || 0)) &&
      (gravPrimary !== 'moon' || (viewPlanetIdx === (o.planetIdx || 0) && viewMoonIdx === (o.moonIdx || 0)));
    var noteTxt = sameBody ? ('GRAV: ' + gravLabel + ' (SOI)') : ('GRAV: ' + gravLabel + MID + 'VIEW: ' + viewLabel);
    setText($('lh-orbit-note'), noteTxt);
    if (S.o3) syncOrbit3DPanel(s, d3);

    var e = o.el || (S.cache.lastCurEl || null), lines = [];
    if (isArr3(o.rKm) && e) {
      var R = num(o.bodyRadiusKm, o.focusSoi === 'star' ? (sys ? sys.starRadiusKm : 0) : (planet ? planet.radiusKm : 0));
      lines.push('a ' + fmtKm(num(e.a, NaN)) + MID + 'e ' + num(e.e, 0).toFixed(4) + MID + 'i ' + (num(e.iRad, 0) * 180 / Math.PI).toFixed(2) + '\u00b0');
      lines.push('PE ' + fmtKm(num(e.rp, NaN) - R) + MID + 'AP ' + (e.e < 1 ? fmtKm(num(e.ra, NaN) - R) : 'ESCAPE') + MID + 'T ' + (Number.isFinite(e.periodS) ? fmtDur(e.periodS) : DASH));
    } else lines.push(s.docked ? 'BERTHED' + MID + 'UNDOCK TO ENTER ORBIT' : 'NO ORBIT SOLUTION');
    setText($('lh-orbit-elements'), lines.join('\n'));

    var node = s.node || {};
    var selB = S.o3 && S.selBurn >= 0 ? S.burns[S.selBurn] : null;
    var trimDigits = S.trimStep <= 0.001 ? 3 : 2;
    qa('#lh-node-trim .lh-trim-row').forEach(function (row) {
      var axis = row.dataset.axis;
      var v = selB ? num(selB[axis === 'prograde' ? 'dvP' : axis === 'normal' ? 'dvN' : 'dvR'], NaN) : num(node[axis + 'KmS'], NaN);
      var inp = row.querySelector('input'), out = row.querySelector('output');
      if (inp && inp.step !== String(S.trimStep)) inp.step = String(S.trimStep);
      if (Number.isFinite(v) && inp && doc.activeElement !== inp) inp.value = v;
      setText(out, num(inp && inp.value, 0).toFixed(trimDigits));
    });

    var sel = selectedTargetObj(s), plan = sel && sel.plan, flip = flipBurnPlan(s), sum;
    var flipButton = $('btn-flip-burn');
    setDisabled(flipButton, s.docked || inTransit(s) || !!(s.burn && s.burn.active) || !isArr3(o.rKm) || !sel || sel.kind === 'escape');
    setPressed(flipButton, !!flip);
    if (flip) {
      var peak = Number.isFinite(flip.peakSpeedKmS) ? flip.peakSpeedKmS.toFixed(2) + ' km/s' : DASH;
      sum = 'HIGH-G FLIP-BURN (' + num(flip.accelG, num(s.brachAccelG, 1)).toFixed(1) + 'g)' +
        '\nTOF ' + fmtDur(flip.tofS) + MID + 'FLIP AT ' + fmtDur(flip.tFlipS) + MID + 'PEAK ' + peak;
      if (flip.valid === false) sum += '\nNO CLEAR FLIP-BURN PATH';
    } else if (!sel) sum = S.selTarget ? 'Target ' + upper(S.selTarget) + ' selected.' : 'Select a target orbit to preview the transfer.';
    else {
      sum = upper(sel.label) + '\n' + DELTA + 'v ' + (Number.isFinite(sel.dvKmS) ? sel.dvKmS.toFixed(3) : DASH) + ' km/s';
      if (plan) sum += '  (' + num(plan.dv1KmS, 0).toFixed(3) + ' + ' + num(plan.dv2KmS, 0).toFixed(3) + ')';
      sum += '\nTRANSFER ' + fmtDur(num(sel.transferS, NaN));
      if (plan && plan.waitTimeS > 1) sum += MID + 'NODE IN ' + fmtDur(plan.waitTimeS);
      sum += '\nBURN ' + (Number.isFinite(sel.burnS) ? fmtDur(sel.burnS) : DASH) + ' @ ' + burnAccelG(s).toFixed(2) + 'g' + MID + 'REACTIONLESS: NO PROPELLANT DRAW';
    }
    setText($('lh-orbit-plan'), sum);
    var b = s.burn || {}, bs = $('lh-burn-status');
    setHidden(bs, !b.active);
    if (b.active) {
      var t = upper(b.label || b.phase || 'BURNING');
      if (Number.isFinite(b.remainingDvKmS)) t += MID + DELTA + 'v LEFT ' + b.remainingDvKmS.toFixed(3) + ' km/s';
      if (Number.isFinite(b.etaS)) t += MID + 'T-' + fmtDur(b.etaS);
      if (Number.isFinite(b.progress)) t += MID + Math.round(b.progress * 100) + '%';
      setText(bs, t);
    }
    var chainReady = S.burns.some(function (node) { return burnDv(node) > 1e-6; });
    var canCommit = flip ? flip.valid !== false : (S.burns.length ? chainReady : !!(S.selTarget || hasNodeDv(s)));
    setDisabled($('btn-orbit-execute'), !!s.docked || !!b.active || !canCommit);
    var execWatch = $('btn-orbit-exec-watch');
    if (execWatch) {
      setDisabled(execWatch, !b.active && (s.docked || !canCommit));
      setText(execWatch, b.active ? 'WATCH ON HELM' : s.docked ? 'UNDOCK FIRST' : 'EXEC & WATCH');
      execWatch.classList.toggle('is-live', !!b.active);
    }
    setDisabled($('btn-orbit-cancel'), !b.active);
    var aw = $('chk-autowarp');
    if (aw && s.autoWarp != null && doc.activeElement !== aw) aw.checked = !!s.autoWarp;
  }
  function hasNodeDv(s) {
    var n = s.node || {};
    return Math.abs(num(n.progradeKmS, 0)) + Math.abs(num(n.normalKmS, 0)) + Math.abs(num(n.radialKmS, 0)) > 1e-6;
  }
  function targetLabel(id, s) {
    var list = (s && s.targetOrbits) || [];
    var hit = list.find(function (t) { return t.id === id; });
    if (hit && hit.label) return hit.label;
    var sys = curSys(s || S.snap || {});
    if (sys && Array.isArray(sys.planets)) {
      for (var pi = 0; pi < sys.planets.length; pi++) {
        var p = sys.planets[pi];
        if (p.id === id) return upper(p.name || id);
        for (var mi = 0; mi < (p.moons || []).length; mi++) {
          if (p.moons[mi].id === id) return upper(p.moons[mi].name || id);
        }
      }
    }
    return upper(id);
  }
  function executeOrbit() {
    var aw = $('chk-autowarp'), autoWarp = aw ? aw.checked : true;
    var s = S.snap || {};
    if (s.docked) {
      flash('Docking clamp engaged -- undock before executing orbital burns.', 'warn');
      return false;
    }
    var ok = false;
    if (S.burns.length && !flipBurnPlan(s)) {
      call('setAutoWarp', autoWarp);
      ok = !!call('executeManeuverChain', S.burns);
    } else {
      ok = !!call('executeOrbitBurn', { autoWarp: autoWarp, targetId: S.selTarget });
    }
    if (!ok) {
      flash('No executable maneuver plotted -- select a target or click ORBIT / FLIP-BURN.', 'warn');
      setOrbitHint('CANNOT EXECUTE' + MID + 'SELECT A TARGET BODY OR MANEUVER');
    }
    return ok;
  }

  // ---------------------------------------- 3D chronoscope glue (LighthuggerOrbit3D)
  function chainKey(list) {
    return JSON.stringify((list || []).map(function (b) {
      return [Math.round(num(b.dtS, 0)), Math.round(num(b.dvP, 0) * 1e6), Math.round(num(b.dvN, 0) * 1e6), Math.round(num(b.dvR, 0) * 1e6)];
    }));
  }
  function burnDv(b) { return Math.hypot(num(b.dvP, 0), num(b.dvN, 0), num(b.dvR, 0)); }
  function pushChain(selIdx) {
    if (flipBurnPlan(S.snap) && !(S.snap.burn && S.snap.burn.active)) call('selectTargetOrbit', S.selTarget);
    S.chainKey = chainKey(S.burns);
    call('setManeuverChain', S.burns, selIdx);
  }
  function o3Callbacks() {
    return {
      onSelectTarget: function (id) {
        var res = call('selectTargetOrbit', id);
        var label = targetLabel(id, S.snap);
        if (!res) {
          var blocked = S.snap && S.snap.burn && S.snap.burn.active;
          var msg = blocked ? 'Cancel active burn before switching SOI targets.' : 'Cannot plot orbit to ' + label + '.';
          flash(msg, 'warn');
          setOrbitHint(upper(msg));
          return;
        }
        if (S.burns.length && S.burns[0] && S.burns[0].id === 'orbit-dep' && S.selTarget !== id) {
          S.burns = []; S.selBurn = -1; S.chainKey = '[]';
          if (S.o3) S.o3.setBurns([], -1);
          renderBurnChain(S.snap);
        }
        S.selTarget = id; S.cache.tgtAt = 0; S.o3At = 0;
        var host = $('lh-target-list'); if (host) host.__key = '';
        syncOrbitQuickLabels(S.snap);
        setOrbitHint('PLOTTED ' + label + MID + 'TAP ORBIT OR FLIP-BURN');
      },
      onSelectCustomOrbit: function (rKm) {
        S.selTarget = 'custom'; S.cache.tgtAt = 0;
        var host = $('lh-target-list'); if (host) host.__key = '';
        call('selectCustomOrbit', rKm);
        setOrbitHint('CUSTOM ORBIT R ' + fmtKm(rKm) + MID + 'EXEC & WATCH TO MATCH');
      },
      onFocusBody: function (frame, planetIdx, moonIdx) {
        S.orbitSoi = frame === 'star' ? 'star' : 'planet';
        S.cache.tgtAt = 0; S.o3At = 0;
        call('setFocusSoi', frame, planetIdx, moonIdx);
      },
      onBurnsChange: function (burns, idx) {
        S.burns = burns || []; S.selBurn = idx;
        pushChain(idx);
        renderBurnChain(S.snap);
      },
      onSelectBurn: function (idx) {
        S.selBurn = idx;
        pushChain(idx);
        renderBurnChain(S.snap);
      },
      onHint: function (text) {
        var up = upper(text);
        setOrbitHint(up);
        if (/ALREADY CIRCULAR/i.test(up)) flash(up, 'info');
      }
    };
  }
  // Adopt a chain that changed outside the chronoscope (cleared on undock, restored, etc.).
  function syncChainFromSnap(s) {
    if (!Array.isArray(s.maneuverChain)) return;
    var key = chainKey(s.maneuverChain);
    if (key === S.chainKey) return;
    S.chainKey = key;
    S.burns = s.maneuverChain.map(function (b) { return Object.assign({}, b); });
    S.selBurn = S.burns.length ? clamp(Math.round(num(s.selectedBurnIdx, 0)), 0, S.burns.length - 1) : -1;
    if (S.o3) S.o3.setBurns(S.burns, S.selBurn);
    renderBurnChain(s);
  }
  function syncOrbit3D(s, force) {
    if (!S.o3) return;
    var now = performance.now();
    if (!force && now - S.o3At < 70) return;
    S.o3At = now;
    syncChainFromSnap(s);
    S.o3.update(s, { selectedTargetId: S.selTarget });
    S.o3Diag = S.o3.getDiagnostics();
  }
  function syncOrbit3DPanel(s, d) {
    d = d || {};
    var frame = d.frame || 'planet';
    var sys = curSys(s), pIdx = d.planetIdx != null ? d.planetIdx : ((s.orbit || {}).planetIdx || 0);
    var planet = sys && sys.planets && sys.planets[pIdx];
    var moons = (planet && planet.moons) || [];
    var selObj = selectedTargetObj(s);
    var selIsMoon = !!(selObj && selObj.kind === 'moon') || moons.some(function (m) { return m.id === S.selTarget; });
    var showMoonFrame = moons.length > 0 && (frame === 'moon' || selIsMoon);
    setText($('btn-orbit-star'), upper((sys && sys.name) || 'STAR') + ' SYSTEM');
    setText($('btn-orbit-planet'), upper((planet && planet.name) || 'PLANET') + ' (SOI)');
    var moonBtn = $('btn-orbit-moon');
    if (moonBtn) {
      setHidden(moonBtn, !showMoonFrame);
      setDisabled(moonBtn, !showMoonFrame);
      if (showMoonFrame) {
        var moonDispIdx = frame === 'moon' ? (d.moonIdx || 0)
          : (selObj && selObj.focusRef && selObj.focusRef.kind === 'moon' ? selObj.focusRef.moonIdx : (d.moonIdx || 0));
        var curMoon = moons[moonDispIdx];
        setText(moonBtn, curMoon ? upper(curMoon.name) : 'MOON');
      }
    }
    qa('[data-orbit-frame]').forEach(function (b) { setPressed(b, b.dataset.orbitFrame === frame); });
    setPressed($('btn-orbit-hill'), S.o3Hill);
    setPressed($('btn-orbit-lagrange'), S.o3Lag);
    setPressed($('btn-orbit-ice'), S.o3Ice);
    setPressed($('btn-orbit-top'), Number.isFinite(d.pitch) && d.pitch >= Math.PI / 2 - 0.02);
    setPressed($('btn-orbit-ship'), !!d.centeredOnShip);
    renderMoonChips(s, d);
    renderBurnChain(s);
    syncBurnDelay();
    var noOrbit = !isArr3((s.orbit || {}).rKm);
    qa('[data-quick-burn]:not(#btn-flip-burn)').forEach(function (b) { setDisabled(b, noOrbit); });
    setDisabled($('btn-orbit-add-ship'), noOrbit);
  }
  function syncBurnDelay() {
    var slider = $('rng-burn-delay');
    var context = S.o3 && S.o3.getBurnContext ? S.o3.getBurnContext(S.selBurn) : null;
    setDisabled(slider, !context);
    if (doc.activeElement !== slider || !context) {
      slider.max = context ? Math.max(1, Math.ceil(context.maxDtS)) : 1;
      slider.value = context ? Math.round(context.dtS) : 0;
    }
    setText($('val-burn-delay'), context ? fmtDur(context.dtS) : DASH);
  }

  function renderMoonChips(s, d) {
    var host = $('lh-moon-chips');
    if (!host) return;
    var sys = curSys(s), pIdx = d.planetIdx || 0;
    var planet = sys && sys.planets && sys.planets[pIdx];
    var moons = (planet && planet.moons) || [];
    var activeMoon = d.frame === 'moon' ? (d.moonIdx || 0) : -1;
    var key = pIdx + ':' + moons.map(function (m) { return m.id || m.name; }).join(',') + ':' + activeMoon + ':' + (S.selTarget || '');
    if (host.__key === key) return;
    host.__key = key;
    host.textContent = '';
    setHidden(host, !moons.length);
    moons.forEach(function (m, k) {
      var b = el('button', 'acidburn-button kg-chrono-btn', upper(m.name));
      b.type = 'button';
      b.dataset.moonIdx = String(k);
      b.title = 'Select & view close-orbit frame around ' + m.name;
      b.setAttribute('aria-pressed', k === activeMoon ? 'true' : 'false');
      if (m.id && S.selTarget === m.id) b.classList.add('is-selected');
      host.appendChild(b);
    });
  }
  function renderBurnChain(s) {
    var host = $('lh-burn-chain');
    if (!host) return;
    var g = burnAccelG(s || S.snap);
    var key = S.burns.map(function (b) { return [num(b.dtS, 0), num(b.dvP, 0), num(b.dvN, 0), num(b.dvR, 0)].join(','); }).join('|') + '#' + S.selBurn + '#' + g.toFixed(2);
    if (host.__key === key) return;
    host.__key = key;
    host.textContent = '';
    var tot = $('lh-chain-total');
    if (!S.burns.length) {
      host.appendChild(el('p', 'lh-empty', 'No burns queued. Use a quick maneuver or select a target.'));
      setText(tot, '');
      return;
    }
    var t = 0, total = 0;
    S.burns.forEach(function (b, i) {
      t += num(b.dtS, 0);
      var dv = burnDv(b);
      total += dv;
      var row = el('div', 'lh-burn-row');
      var pick = el('button', 'lh-burn-pick');
      pick.type = 'button';
      pick.dataset.burnPick = String(i);
      pick.setAttribute('role', 'option');
      pick.setAttribute('aria-selected', i === S.selBurn ? 'true' : 'false');
      pick.appendChild(el('strong', '', '#' + (i + 1)));
      pick.appendChild(el('span', '', 'T+' + fmtDur(t)));
      pick.appendChild(el('span', '', DELTA + 'v ' + dv.toFixed(2) + ' km/s'));
      pick.appendChild(el('span', '', 'BURN ' + fmtDur(dv / (g * G0_KMS2))));
      if (b.label) pick.appendChild(el('span', '', upper(b.label)));
      var del = el('button', 'lh-burn-del', '\u00d7');
      del.type = 'button';
      del.dataset.burnDel = String(i);
      del.setAttribute('aria-label', 'Delete burn #' + (i + 1));
      row.appendChild(pick);
      row.appendChild(del);
      host.appendChild(row);
    });
    setText(tot, 'TOTAL ' + DELTA + 'v ' + total.toFixed(2) + ' km/s');
  }
  // Trim sliders edit the selected burn while a chain exists; otherwise they drive the classic node.
  function trimBurn(axis, value, additive) {
    if (!S.o3 || S.selBurn < 0 || !S.burns[S.selBurn]) return false;
    var key = axis === 'prograde' ? 'dvP' : axis === 'normal' ? 'dvN' : 'dvR';
    var b = S.burns[S.selBurn];
    b[key] = clamp(additive ? num(b[key], 0) + value : value, -5, 5);
    S.o3.setBurns(S.burns, S.selBurn);
    pushChain(S.selBurn);
    renderBurnChain(S.snap);
    return true;
  }
  function setOrbitFrame(frame) {
    if (!S.o3 && frame !== 'star' && frame !== 'planet') { setOrbitHint('3D CHRONOSCOPE UNAVAILABLE'); return; }
    var d = S.o3 ? (S.o3Diag || S.o3.getDiagnostics()) : {};
    var s = S.snap, sys = curSys(s);
    var pi = d.planetIdx != null ? d.planetIdx : ((s.orbit || {}).planetIdx || 0), mi = d.moonIdx || 0;
    var planet = sys && sys.planets && sys.planets[pi];
    var nMoons = planet && planet.moons ? planet.moons.length : 0;
    if (frame === 'moon' && !nMoons) { setOrbitHint('NO MOONS AROUND THIS WORLD'); return; }
    if (frame === 'moon') {
      var selM = selectedTargetObj(s);
      if (selM && selM.focusRef && selM.focusRef.kind === 'moon' && selM.focusRef.planetIdx === pi) {
        mi = selM.focusRef.moonIdx;
      } else if (planet && planet.moons && planet.moons[mi] && planet.moons[mi].id) {
        var primNow = s.orbitPrimary || (s.orbit && (s.orbit.primary || s.orbit.focusSoi)) || 'planet';
        if (primNow !== 'moon') {
          S.selTarget = planet.moons[mi].id;
          S.cache.tgtAt = 0;
          call('selectTargetOrbit', S.selTarget);
        }
      }
    }
    var mArg = frame === 'synodic' && (d.frame === 'star' || S.orbitSoi === 'star' || !nMoons) ? -1 : mi;
    if (S.o3) S.o3.setFrame(frame, pi, mArg);
    S.orbitSoi = frame === 'star' ? 'star' : 'planet';
    S.orbitView.panX = S.orbitView.panY = 0; S.orbitView.zoom = 1; S.orbitView.dirty = true;
    S.cache.tgtAt = 0; S.o3At = 0;
    call('setFocusSoi', frame, pi, mArg >= 0 ? mArg : undefined);
    if (S.o3) syncOrbit3D(S.snap, true);
    syncOrbitPanel(S.snap);
  }

  function drawOrbits(s, force) {
    var cv = $('lh-orbit-canvas');
    if (!cv || S.screen !== 'orbits' || S.o3) return;
    var now = performance.now();
    if (!force && !S.orbitView.dirty && now - S.orbitView.lastDraw < 50) return;
    S.orbitView.lastDraw = now; S.orbitView.dirty = false;
    var f = fitCanvas(cv), ctx = f.ctx, w = f.w, h = f.h;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#05050d'; ctx.fillRect(0, 0, w, h);

    var sys = curSys(s), o = s.orbit || {}, t = num(s.simTimeS, 0);
    var pIdx = o.planetIdx || 0, planet = sys && sys.planets && sys.planets[pIdx];
    var soi = S.orbitSoi || o.focusSoi || 'planet';
    if (!planet) soi = 'star';
    var planetPos = sys ? bodyWorld(sys, { kind: 'planet', planetIdx: pIdx }, t) : [0, 0, 0];
    var frameOff = [0, 0, 0]; // add to orbit-frame vectors to get view-frame vectors
    if ((o.focusSoi || 'planet') === 'planet' && soi === 'star') frameOff = planetPos;
    if (o.focusSoi === 'star' && soi === 'planet') frameOff = [-planetPos[0], -planetPos[1], -planetPos[2]];
    var ship = isArr3(o.rKm) ? add3(o.rKm, frameOff) : (s.docked && sys && planet ? sub3(bodyWorld(sys, { kind: 'station', planetIdx: pIdx }, t), soi === 'star' ? [0, 0, 0] : planetPos) : null);
    var curves = orbitCurves(s, sys);
    if (curves.current && curves.current.points) S.cache.lastCurEl = (o.el || null);

    // extent for fit
    var ext = 1;
    if (soi === 'planet' && planet) {
      ext = planet.radiusKm * (planet.hasRings ? 3 : 4);
      if (sys.station && sys.station.parentPlanetIdx === pIdx) ext = Math.max(ext, sys.station.orbitRadiusKm * 1.25);
    } else if (sys) {
      sys.planets.forEach(function (p) { ext = Math.max(ext, p.orbitRadiusAU * AU_KM * 1.15); });
    }
    if (ship) ext = Math.max(ext, len3(ship) * 1.25);
    [curves.current, curves.target].forEach(function (c) {
      if (!c || !c.points) return;
      c.points.forEach(function (p) { var r = len3(add3(p, frameOff)); if (r < ext * 6) ext = Math.max(ext, r * 1.08); });
    });
    var V = S.orbitView;
    var scale = Math.min(w, h) / 2 / ext * V.zoom;
    var bodyR = soi === 'planet' && planet ? planet.radiusKm : (sys ? sys.starRadiusKm : 1);
    var muView = soi === 'planet' && planet ? planet.muKm3S2 : (sys ? sys.muStarKm3S2 : orbitMu(s, sys));
    V.scale = scale; V.w = w; V.h = h; V.frameOff = frameOff; V.bodyRadiusKm = bodyR; V.muKm3S2 = muView; V.soi = soi; V.hits = [];
    function X(p) { return w / 2 + (p[0] - V.panX) * scale; }
    function Y(p) { return h / 2 - (p[1] - V.panY) * scale; }
    function circle(cx, cy, r) { ctx.beginPath(); ctx.arc(cx, cy, Math.max(0.5, r), 0, Math.PI * 2); }
    function ring(center, radius, style, width, dash) {
      ctx.save(); ctx.strokeStyle = style; ctx.lineWidth = width || 1; ctx.setLineDash(dash || []);
      circle(X(center), Y(center), radius * scale); ctx.stroke(); ctx.restore();
    }
    function path(pts, off, style, width, dash) {
      if (!pts || pts.length < 2) return;
      ctx.save(); ctx.strokeStyle = style; ctx.lineWidth = width; ctx.setLineDash(dash || []);
      ctx.beginPath();
      for (var i = 0; i < pts.length; i++) {
        var p = add3(pts[i], off), x = X(p), y = Y(p);
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke(); ctx.restore();
    }
    function tag(p, text, color, dy) {
      ctx.save(); ctx.font = '11px "Share Tech Mono", monospace'; ctx.fillStyle = color;
      ctx.textAlign = 'left'; ctx.fillText(text, X(p) + 7, Y(p) + (dy || -6)); ctx.restore();
    }

    // Chronoscope P1 phosphor radial & cartesian graticule
    ctx.save(); ctx.strokeStyle = 'rgba(99, 255, 141, 0.06)'; ctx.lineWidth = 1;
    for (var gx = (w / 2) % 60; gx < w; gx += 60) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
    for (var gy = (h / 2) % 60; gy < h; gy += 60) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke(); }
    // Subtle outer chronoscope bearing ring
    var compR = Math.min(w, h) * 0.455;
    if (compR > 90) {
      ctx.strokeStyle = 'rgba(99, 255, 141, 0.14)';
      ctx.beginPath(); ctx.arc(w / 2, h / 2, compR, 0, Math.PI * 2); ctx.stroke();
      ctx.font = '9px "Share Tech Mono", monospace';
      ctx.fillStyle = 'rgba(130, 240, 170, 0.42)';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (var deg = 0; deg < 360; deg += 15) {
        var radA = (deg - 90) * Math.PI / 180;
        var major = deg % 90 === 0;
        var rIn = compR - (major ? 8 : deg % 45 === 0 ? 5 : 3);
        ctx.beginPath();
        ctx.moveTo(w / 2 + Math.cos(radA) * rIn, h / 2 + Math.sin(radA) * rIn);
        ctx.lineTo(w / 2 + Math.cos(radA) * compR, h / 2 + Math.sin(radA) * compR);
        ctx.stroke();
        if (major) {
          ctx.fillText(String(deg).padStart(3, '0') + '\u00b0', w / 2 + Math.cos(radA) * (compR + 12), h / 2 + Math.sin(radA) * (compR + 12));
        }
      }
    }
    ctx.restore();

    var origin = [0, 0, 0];
    if (soi === 'planet' && planet) {
      var R = planet.radiusKm;
      if (planet.hasRings) {
        ctx.save(); ctx.fillStyle = 'rgba(232, 200, 140, 0.16)';
        ctx.beginPath(); ctx.arc(X(origin), Y(origin), 2.27 * R * scale, 0, Math.PI * 2);
        ctx.arc(X(origin), Y(origin), 1.24 * R * scale, 0, Math.PI * 2, true); ctx.fill('evenodd'); ctx.restore();
        ring(origin, 2.27 * R, 'rgba(232,200,140,0.45)', 1);
        ring(origin, 1.24 * R, 'rgba(232,200,140,0.3)', 1);
      }
      var gr = ctx.createRadialGradient(X(origin), Y(origin), R * scale * 0.2, X(origin), Y(origin), R * scale * 1.08);
      gr.addColorStop(0, '#d9c49a'); gr.addColorStop(0.9, '#7a6440'); gr.addColorStop(1, 'rgba(120,180,255,0.0)');
      ctx.fillStyle = gr; circle(X(origin), Y(origin), R * scale); ctx.fill();
      ring(origin, R * 1.03, 'rgba(120,200,255,0.55)', 2);
      tag(origin, upper(planet.name), '#e8dcc0', -(R * scale) - 6);
      (planet.moons || []).forEach(function (m, k) {
        var isSelM = S.selTarget === m.id;
        ring(origin, m.orbitRadiusKm, isSelM ? 'rgba(255,200,40,0.75)' : 'rgba(191,0,255,0.35)', isSelM ? 1.5 : 1, [3, 5]);
        var mp = sub3(bodyWorld(sys, { kind: 'moon', planetIdx: pIdx, moonIdx: k }, t), planetPos);
        var mx = X(mp), my = Y(mp);
        ctx.fillStyle = isSelM ? '#ffc828' : '#cbb9ff'; circle(mx, my, Math.max(3, m.radiusKm * scale)); ctx.fill();
        tag(mp, upper(m.name), isSelM ? '#ffc828' : '#cbb9ff');
        V.hits.push({ id: m.id, kind: 'moon', label: upper(m.name), x: mx, y: my, radiusKm: m.orbitRadiusKm });
      });
      if (sys.station && sys.station.parentPlanetIdx === pIdx) {
        var isSelS = S.selTarget === 'station';
        ring(origin, sys.station.orbitRadiusKm, isSelS ? 'rgba(255,200,40,0.75)' : 'rgba(0,255,255,0.28)', isSelS ? 1.5 : 1, [2, 4]);
        var sp = sub3(bodyWorld(sys, { kind: 'station', planetIdx: pIdx }, t), planetPos);
        var sx0 = X(sp), sy0 = Y(sp);
        ctx.save(); ctx.strokeStyle = isSelS ? '#ffc828' : '#00ffff'; ctx.lineWidth = 1.6;
        ctx.strokeRect(sx0 - 4.5, sy0 - 4.5, 9, 9); ctx.restore();
        tag(sp, upper(sys.station.name), isSelS ? '#ffc828' : '#7ff');
        V.hits.push({ id: 'station', kind: 'station', label: upper(sys.station.name), x: sx0, y: sy0, radiusKm: sys.station.orbitRadiusKm });
      }
    } else if (sys) {
      var sr = ctx.createRadialGradient(X(origin), Y(origin), 0, X(origin), Y(origin), 14);
      sr.addColorStop(0, '#fff8e0'); sr.addColorStop(1, 'rgba(255,200,80,0)');
      ctx.fillStyle = sr; circle(X(origin), Y(origin), 14); ctx.fill();
      ctx.fillStyle = '#ffe9a8'; circle(X(origin), Y(origin), Math.max(3, sys.starRadiusKm * scale)); ctx.fill();
      tag(origin, upper(sys.name), '#ffe9a8', -12);
      sys.planets.forEach(function (p, j) {
        var isSelP = S.selTarget === p.id;
        ring(origin, p.orbitRadiusAU * AU_KM, isSelP ? 'rgba(255,200,40,0.8)' : j === pIdx ? 'rgba(232,200,140,0.5)' : 'rgba(191,0,255,0.3)', isSelP ? 1.5 : 1, [3, 5]);
        var pp = bodyWorld(sys, { kind: 'planet', planetIdx: j }, t);
        var px0 = X(pp), py0 = Y(pp);
        ctx.fillStyle = isSelP ? '#ffc828' : j === pIdx ? '#e8c88c' : '#b9a6ff'; circle(px0, py0, Math.max(3.5, p.radiusKm * scale)); ctx.fill();
        tag(pp, upper(p.name), isSelP ? '#ffc828' : j === pIdx ? '#e8c88c' : '#cbb9ff');
        V.hits.push({ id: p.id, kind: 'planet', planetIdx: j, label: upper(p.name), x: px0, y: py0, radiusKm: p.orbitRadiusAU * AU_KM });
      });
    }

    // Highlight active custom plotted orbit ring cleanly
    if (Number.isFinite(s.customOrbitKm) && s.customOrbitKm > bodyR * 1.04 && S.selTarget === 'custom') {
      ring(origin, s.customOrbitKm, 'rgba(0, 240, 255, 0.82)', 1.6, [6, 4]);
      tag([0, s.customOrbitKm, 0], 'CUSTOM ALT ' + fmtKm(s.customOrbitKm - bodyR), '#00f0ff', -6);
    }

    if (curves.target) path(curves.target.points, frameOff, 'rgba(255,200,40,0.85)', 1.6);
    if (curves.transfer) path(curves.transfer.points, frameOff, 'rgba(0,255,255,0.9)', 1.6, [7, 5]);
    if (curves.current) {
      path(curves.current.points, frameOff, 'rgba(0,255,136,0.95)', 2);
      [['periapsis', 'PE'], ['apoapsis', 'AP']].forEach(function (pa) {
        var p = curves.current[pa[0]];
        if (!isArr3(p)) return;
        p = add3(p, frameOff);
        ctx.fillStyle = '#00ff88'; circle(X(p), Y(p), 3.5); ctx.fill();
        tag(p, pa[1], '#00ff88', 14);
      });
    }
    curves.nodes.forEach(function (n) {
      if (!isArr3(n.rKm)) return;
      var p = add3(n.rKm, frameOff), x = X(p), y = Y(p);
      var col = n.kind === 'burn2' ? '#ffc828' : n.kind === 'pe' || n.kind === 'ap' ? '#00ff88' : '#00ffff';
      ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 6); ctx.lineTo(x - 6, y); ctx.closePath(); ctx.stroke();
      ctx.restore();
      tag(p, n.label || upper(n.kind), col, 16);
    });
    if (ship) {
      var vel = isArr3(o.vKmS) ? o.vKmS : [1, 0, 0], ang = Math.atan2(-vel[1], vel[0]);
      ctx.save(); ctx.translate(X(ship), Y(ship)); ctx.rotate(ang);
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, 5); ctx.lineTo(-3, 0); ctx.lineTo(-6, -5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      tag(ship, upper(s.shipName || 'SHIP'), '#ffffff', -10);
    }

    // Interactive chronoscope choice-space hover cursor & live transfer estimator
    var hv = V.hover;
    if (hv && Number.isFinite(hv.x) && Number.isFinite(hv.y)) {
      var bestHit = null, bestD = 24;
      V.hits.forEach(function (hh) {
        var d = Math.hypot(hh.x - hv.x, hh.y - hv.y);
        if (d < bestD) { bestD = d; bestHit = hh; }
      });
      ctx.save();
      if (bestHit) {
        ring(origin, bestHit.radiusKm, 'rgba(99, 255, 141, 0.72)', 1.4, [4, 3]);
        ctx.strokeStyle = '#63ff8d'; ctx.lineWidth = 1.6;
        var hr = 11, hb = 4;
        ctx.beginPath();
        ctx.moveTo(bestHit.x - hr, bestHit.y - hr + hb); ctx.lineTo(bestHit.x - hr, bestHit.y - hr); ctx.lineTo(bestHit.x - hr + hb, bestHit.y - hr);
        ctx.moveTo(bestHit.x + hr - hb, bestHit.y - hr); ctx.lineTo(bestHit.x + hr, bestHit.y - hr); ctx.lineTo(bestHit.x + hr, bestHit.y - hr + hb);
        ctx.moveTo(bestHit.x - hr, bestHit.y + hr - hb); ctx.lineTo(bestHit.x - hr, bestHit.y + hr); ctx.lineTo(bestHit.x - hr + hb, bestHit.y + hr);
        ctx.moveTo(bestHit.x + hr - hb, bestHit.y + hr); ctx.lineTo(bestHit.x + hr, bestHit.y + hr); ctx.lineTo(bestHit.x + hr, bestHit.y + hr - hb);
        ctx.stroke();
        var hitMsg = 'CLICK PLOT ' + bestHit.label + (bestHit.kind === 'planet' ? (MID + 'DBL-CLICK ENTER SOI') : '');
        ctx.font = '600 10px "Share Tech Mono", monospace';
        var tw0 = ctx.measureText(hitMsg).width;
        var tx0 = clamp(bestHit.x + 14, 12, Math.max(12, w - tw0 - 20));
        var ty0 = clamp(bestHit.y - 16, 20, h - 22);
        ctx.fillStyle = 'rgba(3, 18, 10, 0.88)'; ctx.strokeStyle = '#63ff8d'; ctx.lineWidth = 1;
        ctx.fillRect(tx0 - 5, ty0 - 11, tw0 + 10, 17); ctx.strokeRect(tx0 - 4.5, ty0 - 10.5, tw0 + 9, 16);
        ctx.fillStyle = '#cbffd9'; ctx.fillText(hitMsg, tx0, ty0 + 1);
      } else {
        var wxH = V.panX + (hv.x - w / 2) / scale, wyH = V.panY - (hv.y - h / 2) / scale;
        var rHoverKm = Math.hypot(wxH, wyH);
        if (rHoverKm > bodyR * 1.04) {
          ring(origin, rHoverKm, 'rgba(99, 255, 141, 0.55)', 1.25, [5, 4]);
          ctx.strokeStyle = 'rgba(99, 255, 141, 0.85)'; ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(hv.x - 8, hv.y); ctx.lineTo(hv.x + 8, hv.y);
          ctx.moveTo(hv.x, hv.y - 8); ctx.lineTo(hv.x, hv.y + 8);
          ctx.stroke();
          var vCirc = muView > 0 ? Math.sqrt(muView / rHoverKm) : 0;
          var dvNote = '';
          if (ship && muView > 0) {
            var rS = Math.max(bodyR * 1.02, len3(ship));
            var aT = 0.5 * (rS + rHoverKm);
            var dvEst = Math.abs(Math.sqrt(muView * (2 / rS - 1 / aT)) - Math.sqrt(muView / rS)) +
              Math.abs(Math.sqrt(muView / rHoverKm) - Math.sqrt(muView * (2 / rHoverKm - 1 / aT)));
            dvNote = MID + DELTA + 'v ~' + dvEst.toFixed(2) + ' km/s';
          }
          var hMsg = 'CLICK CUSTOM ALT ' + fmtKm(rHoverKm - bodyR) + MID + 'Vc ' + vCirc.toFixed(2) + ' km/s' + dvNote;
          ctx.font = '600 10px "Share Tech Mono", monospace';
          var tw1 = ctx.measureText(hMsg).width;
          var tx1 = clamp(hv.x + 14, 12, Math.max(12, w - tw1 - 20));
          var ty1 = clamp(hv.y - 14, 20, h - 22);
          ctx.fillStyle = 'rgba(3, 18, 10, 0.88)'; ctx.strokeStyle = 'rgba(99, 255, 141, 0.72)'; ctx.lineWidth = 1;
          ctx.fillRect(tx1 - 5, ty1 - 11, tw1 + 10, 17); ctx.strokeRect(tx1 - 4.5, ty1 - 10.5, tw1 + 9, 16);
          ctx.fillStyle = '#cbffd9'; ctx.fillText(hMsg, tx1, ty1 + 1);
        }
      }
      ctx.restore();
    }

    // scale bar
    var target = 120 / scale, step = niceStep(target), px = step * scale;
    var lbl = step >= 0.05 * AU_KM ? (step / AU_KM).toPrecision(2) + ' AU' : commas(step) + ' km';
    ctx.save(); ctx.strokeStyle = '#63ff8d'; ctx.fillStyle = '#63ff8d'; ctx.lineWidth = 1.5;
    var bx = 24, by = h - 18;
    ctx.beginPath(); ctx.moveTo(bx, by - 5); ctx.lineTo(bx, by); ctx.lineTo(bx + px, by); ctx.lineTo(bx + px, by - 5); ctx.stroke();
    ctx.font = '11px "Share Tech Mono", monospace'; ctx.fillText(lbl, bx, by - 8);
    ctx.restore();
  }

  // ------------------------------------------------------------ starmap
  function starColor(T) {
    T = num(T, 5800);
    if (T >= 25000) return '#9bb0ff';
    if (T >= 10000) return '#aabfff';
    if (T >= 7500) return '#cad7ff';
    if (T >= 6000) return '#f8f7ff';
    if (T >= 5200) return '#fff4ea';
    if (T >= 3700) return '#ffd2a1';
    return '#ff9f5a';
  }
  function starSize(cls) {
    var c = String(cls || 'G').charAt(0);
    return { O: 4.2, B: 3.9, A: 3.6, F: 3.2, G: 3, K: 2.6, M: 2.1, D: 1.8 }[c] || 2.6;
  }
  function originXyz(s) {
    if (inTransit(s) && isArr3(s.posGal)) return s.posGal;
    var sys = curSys(s);
    return sys ? sys.xyz : [0, 0, 0];
  }
  function selStar(s) { return getSys(S.star.sel) || getSys(s.selectedDestId || s.destId) || null; }

  function previewHopRoute(s, dest) {
    if (!dest || (curSys(s) || {}).id === dest.id) return null;
    var preview = s.multiHopPreview;
    return preview && preview.toId === dest.id ? preview : call('getMultiHopPreview', dest.id);
  }

  function syncMultiHop(s, dest) {
    var slider = $('rng-max-hop'), maxHop = num(s.maxHopLy, 15);
    if (doc.activeElement !== slider) slider.value = maxHop;
    setText($('val-max-hop'), slider.value + ' LY');

    var flight = s.multiHop || {}, active = !!flight.active;
    var route = active ? flight.route : previewHopRoute(s, dest);
    var host = $('lh-multihop-plan'), launch = $('btn-launch-multihop');
    var hasHops = route && route.hops && route.hops.length > 0;
    setDisabled(launch, active || inTransit(s) || !hasHops);
    setText(launch, 'LAUNCH MULTI-HOP (' + (hasHops ? num(route.accelG, 1) : 1) + 'g)');
    var status = active ? flight.phase + ':' + flight.legIdx : '';
    if (host.__route === route && host.__status === status) return;
    host.__route = route;
    host.__status = status;
    host.textContent = '';
    S.star.dirty = true;
    setData(host, 'overLimit', !!(route && route.overLimit));
    if (!hasHops) {
      host.appendChild(el('p', 'lh-empty', 'Select a destination to plot the route.'));
      return;
    }

    var summary = route.totalDistLy.toFixed(2) + ' LY' + MID + route.totalProperYr.toFixed(1) + ' yr aboard';
    if (route.overLimit) summary += MID + 'SHORTEST FEASIBLE HOP LIMIT ' + route.maxLegLy.toFixed(2) + ' LY';
    if (active) summary = (flight.phase === 'harvesting' ? 'HARVESTING' : 'IN TRANSIT') + ' #' + (flight.legIdx + 1) + MID + summary;
    host.appendChild(el('p', 'lh-hop-summary', summary));
    var list = el('ol', 'lh-hop-list');
    route.hops.forEach(function (hop, i) {
      var row = el('li', 'lh-hop-leg' + (active && flight.legIdx === i ? ' is-current' : ''));
      row.appendChild(el('strong', '', '#' + (i + 1) + ' ' + hop.fromName + ' \u2192 ' + hop.toName));
      row.appendChild(el('span', '', hop.distLy.toFixed(2) + ' LY' + MID + hop.accelG + 'g FLIP-BURN' + MID + GAMMA + ' ' + hop.peakGamma.toFixed(2)));
      if (hop.iceStop) {
        var site = hop.iceStop;
        var stop = i < route.hops.length - 1 ? 'DROPSHIP STOP' : 'ARRIVAL ICE SITE';
        row.appendChild(el('span', 'lh-hop-ice', '\u25c7 ' + stop + MID + site.name + ' (' + site.kind.replace(/-/g, ' ') + ')'));
      }
      list.appendChild(row);
    });
    host.appendChild(list);
  }
  function computeStarPlan(s) {
    var O = Ox(), dest = selStar(s), specs = getSpecs(s);
    if (!O || !dest || !specs) return null;
    var d = len3(sub3(dest.xyz, originXyz(s)));
    var dKey = inTransit(s) ? d.toFixed(2) : d.toFixed(4);
    var key = [dest.id, dKey, S.accelG, S.betaCap, specs.dryMassMt, specs.radiatorMW, specs.thermalHeadroom].join('|');
    if (S.cache.planKey === key) return S.cache.plan;
    // Reactionless: mass is constant, so the plan only depends on hull mass and thermal rating.
    var mass = num(s.massMt, num(specs.totalMassMt, specs.dryMassMt));
    var plan = null;
    try {
      plan = O.planRelativisticMission(d, S.accelG, specs, s.genome || null, { massMt: mass, maxBetaCap: S.betaCap < 0.999 ? S.betaCap : 1 });
      plan.dest = dest;
    } catch (e) { plan = null; }
    S.cache.planKey = key; S.cache.plan = plan;
    return plan;
  }
  function isSurveyed(sys, s) {
    if (!sys || !sys.procedural) return true;
    var vis = s && Array.isArray(s.visitedSystems) ? s.visitedSystems : [];
    return vis.indexOf(sys.id) >= 0;
  }
  function displayStarName(sys, s) {
    if (!sys) return '';
    if (isSurveyed(sys, s)) return sys.name;
    return 'UNIDENTIFIED ' + (sys.signalId || String(sys.id || '').toUpperCase());
  }
  function syncStarPanel(s) {
    var snapDest = s.selectedDestId || s.starDestId || s.destId || null;
    if (snapDest !== S.lastSnapStar) { S.lastSnapStar = snapDest; if (snapDest) { S.star.sel = snapDest; S.star.dirty = true; } }
    if (!S.star.sel) { var c0 = curSys(s); S.star.sel = c0 && c0.id === 'sol' ? 'rigil' : 'sol'; }
    var dest = selStar(s), here = curSys(s);
    qa('[data-starscale]').forEach(function (b) { setPressed(b, b.dataset.starscale === S.star.scale); });
    if (dest) {
      var d = len3(sub3(dest.xyz, originXyz(s)));
      var surv = isSurveyed(dest, s);
      var dName = displayStarName(dest, s);
      setText($('lh-star-name'), upper(dName));
      setText($('lh-star-dist'), d.toFixed(2) + ' LY');
      if (surv) {
        setText($('lh-star-sub'), [dest.cls, commas(dest.T) + ' K', dest.faction || 'UNINHABITED', dest.station ? dest.station.name : 'NO STATION'].filter(Boolean).join(MID));
        setText($('lh-star-lore'), (dest.exoNote ? dest.exoNote + '. ' : '') + (dest.lore || ''));
      } else {
        setText($('lh-star-sub'), ['UNIDENTIFIED SIGNAL', dest.cls, commas(dest.T) + ' K', 'FLY HERE TO SURVEY'].join(MID));
        setText($('lh-star-lore'), 'Astrometric beacon detected inside your 50 LY rolling sensor horizon. Jump here to reveal colony station or catalog designation and planetary bodies.');
      }
      var bl = $('lh-star-bodies'), bkey = dest.id + (surv ? ':S' : ':U');
      if (bl && bl.__key !== bkey) {
        bl.__key = bkey; bl.textContent = '';
        if (!surv) {
          bl.appendChild(el('li', '', 'SURVEY REQUIRED TO MAP PLANETS & STATIONS'));
        } else {
          if (dest.binary) bl.appendChild(el('li', 'is-star', 'COMPANION ' + upper(dest.binary.name) + MID + dest.binary.cls));
          (dest.planets || []).forEach(function (p) {
            var li = el('li', '', upper(p.name) + MID + num(p.orbitRadiusAU, 0).toFixed(3) + ' AU' + MID + commas(p.radiusKm) + ' km' + (p.hasRings ? MID + 'RINGS' : ''));
            bl.appendChild(li);
            (p.moons || []).forEach(function (m) {
              bl.appendChild(el('li', 'is-moon', '\u2514 ' + upper(m.name || 'MOON') + (m.orbitRadiusKm ? MID + fmtKm(m.orbitRadiusKm) : '')));
            });
          });
        }
      }
    }
    setText($('val-accel'), S.accelG.toFixed(2) + 'g');
    setText($('val-betacap'), S.betaCap >= 0.999 ? 'OFF' : S.betaCap.toFixed(3) + 'c');
    var plan = computeStarPlan(s), risk = $('lh-plan-risk');
    if (plan && dest) {
      setText($('pl-d'), plan.distLy.toFixed(3) + ' LY' + (plan.coastDistLy > 1e-4 ? MID + 'COAST ' + plan.coastDistLy.toFixed(2) : ''));
      setText($('pl-tau'), fmtYr(plan.tauYears));
      setText($('pl-dt'), fmtYr(plan.coordYears));
      setText($('pl-peak'), plan.peakBeta.toFixed(4) + 'c / ' + plan.peakGamma.toFixed(2));
      setText($('pl-drive'), (s.reversibleDrive === false ? 'FLIP & BURN' : 'REVERSIBLE (-G)'));
      var thPeak = num(plan.thermalPeakPct, 0), thEl = $('pl-thermal');
      setText(thEl, thPeak.toFixed(0) + '%' + (thPeak >= 96 ? ' OVERLOAD' : thPeak >= 80 ? ' HOT' : ''));
      if (thEl) thEl.dataset.bad = thPeak >= 96 ? '1' : '0';
      var ice = num(plan.iceAblationEst, 0), iceEl = $('pl-ice');
      setText(iceEl, fmtPct(Math.min(1, ice), 1));
      if (iceEl) iceEl.dataset.bad = ice >= 0.45 ? '1' : '0';
      setText($('pl-arrive'), (num(s.epochYear, 2370) + num(plan.coordYears, 0)).toFixed(2));
      var specs = getSpecs(s), lvl = plan.warningLevel || 'nominal';
      if (specs && plan.peakBeta * 100 > specs.maxSafeBetaPct && lvl === 'nominal') lvl = 'elevated';
      var txt = (plan.warningText ? upper(plan.warningText) + MID : '') +
        'ISM ABLATION ' + (THERMAL_TXT[lvl] || upper(lvl)) + MID + 'EST. ICE LOSS ' + fmtPct(Math.min(1, ice), 1);
      if (specs && plan.peakBeta * 100 > specs.maxSafeBetaPct) txt += MID + 'ABOVE SAFE ' + BETA + ' ' + specs.maxSafeBetaPct.toFixed(0) + '%';
      setData(risk, 'level', lvl);
      setText(risk, txt);
      var lb = $('btn-launch-transit');
      setText(lb, 'LAUNCH RELATIVISTIC TRANSIT \u2192 ' + upper(displayStarName(dest, s)));
      setDisabled(lb, here && dest.id === here.id && !inTransit(s));
    } else {
      ['pl-d', 'pl-tau', 'pl-dt', 'pl-peak', 'pl-drive', 'pl-thermal', 'pl-ice', 'pl-arrive'].forEach(function (id) { setText($(id), DASH); });
      setText(risk, 'SELECT A STAR');
    }
    syncMultiHop(s, dest);
    renderCharters(s);
    var fCount = num(s.frontierCount, (s.discoveredSystems || []).length);
    var vCount = Array.isArray(s.visitedSystems) ? s.visitedSystems.length : 1;
    var origNow = originXyz(s), origKey = Math.round(origNow[0] / 5) + ',' + Math.round(origNow[2] / 5);
    if ((here && (!S.cache.sysListHere || (!inTransit(s) && S.cache.sysListHere !== here.id))) ||
        S.cache.frontierCount !== fCount || S.cache.visitedCount !== vCount || S.cache.originKey !== origKey) {
      renderSysList();
      S.star.dirty = true;
    }
  }
  function visibleSystems(s) {
    var G = Gx();
    if (!G) return [];
    if (G.getVisibleSystems) {
      return G.getVisibleSystems((s && s.discoveredSystems) || [], originXyz(s || {}));
    }
    return G.SYSTEMS || [];
  }
  function renderCharters(s) {
    var host = $('lh-charter-list');
    if (!host) return;
    var list = Array.isArray(s.charters) ? s.charters : [];
    var key = JSON.stringify(list.map(function (c) { return [c.id, c.accepted, c.reward]; })) + (s.activeCharter && (s.activeCharter.id || s.activeCharter));
    if (host.__key === key) return;
    host.__key = key; host.textContent = '';
    if (!list.length) { host.appendChild(el('p', 'lh-empty', 'No charters posted at this berth.')); return; }
    list.forEach(function (c) {
      var row = el('div', 'lh-charter' + (c.accepted ? ' is-active' : ''));
      var txt = el('div', 'lh-charter-txt');
      txt.appendChild(el('strong', '', upper(c.title || c.id)));
      txt.appendChild(el('span', '', [c.destName ? '\u2192 ' + upper(c.destName) : '', Number.isFinite(c.reward) ? CREDIT + commas(c.reward) : '', c.detail || ''].filter(Boolean).join(MID)));
      row.appendChild(txt);
      var b = el('button', 'acidburn-button', c.accepted ? 'active' : 'accept');
      b.type = 'button'; b.dataset.charter = c.id; b.disabled = !!c.accepted;
      row.appendChild(b);
      host.appendChild(row);
    });
  }
  function renderSysList() {
    var host = $('lh-sys-list'), G = Gx();
    if (!host || !G) return;
    var s = S.snap, here = curSys(s), origin = originXyz(s), f = S.star.filter.trim().toLowerCase();
    S.cache.sysListHere = here && here.id;
    S.cache.frontierCount = num(s.frontierCount, (s.discoveredSystems || []).length);
    S.cache.visitedCount = Array.isArray(s.visitedSystems) ? s.visitedSystems.length : 1;
    S.cache.originKey = Math.round(origin[0] / 5) + ',' + Math.round(origin[2] / 5);
    var rows = visibleSystems(s).map(function (sys) { return { sys: sys, d: len3(sub3(sys.xyz, origin)) }; })
      .filter(function (r) {
        if (!f) return true;
        var dn = displayStarName(r.sys, s);
        return (dn + ' ' + r.sys.name + ' ' + r.sys.real + ' ' + r.sys.cls + ' ' + (r.sys.faction || '') + ' ' + (r.sys.signalId || '')).toLowerCase().indexOf(f) >= 0;
      })
      .sort(function (a, b) { return a.d - b.d; });
    if (host.previousElementSibling) setText(host.previousElementSibling, 'CATALOG (' + rows.length + ' SYSTEMS)');
    host.textContent = '';
    rows.forEach(function (r) {
      var b = el('button', 'lh-sys');
      b.type = 'button'; b.dataset.star = r.sys.id;
      b.setAttribute('aria-pressed', r.sys.id === S.star.sel ? 'true' : 'false');
      if (here && r.sys.id === here.id) b.classList.add('is-here');
      var surv = isSurveyed(r.sys, s);
      b.appendChild(el('span', 'lh-sys-dot')).style.background = starColor(r.sys.T);
      b.appendChild(el('strong', '', upper(displayStarName(r.sys, s))));
      var tag = r.sys.procedural ? (surv ? (r.sys.station ? ' \u00b7 FRT' : ' \u00b7 FRT \u00b7 UNINHAB') : ' \u00b7 FRT \u00b7 UNID') : '';
      b.appendChild(el('span', 'lh-sys-cls', r.sys.cls + tag));
      b.appendChild(el('span', 'lh-sys-d', r.d.toFixed(2) + ' LY'));
      host.appendChild(b);
    });
    if (!rows.length) host.appendChild(el('p', 'lh-empty', 'No stars match.'));
  }
  function pickStar(id) {
    if (!getSys(id)) return;
    S.star.sel = id; S.star.dirty = true;
    qa('#lh-sys-list [data-star]').forEach(function (b) { setPressed(b, b.dataset.star === id); });
    call('selectStarDest', id);
    call('plotStarCourse', { accelG: S.accelG, betaCap: S.betaCap < 0.999 ? S.betaCap : null });
  }

  function buildMilkyWayCloud(G) {
    if (S.cache.mwCloud) return S.cache.mwCloud;
    var MW = (G && G.MILKY_WAY) || { radiusLy: 52000, solXyzMw: [1500, 65, 26560], barHalfLenLy: 13500, barAngleRad: 0.49, arms: [
      { offsetRad: 0.35, color: '#8ad8ff' },
      { offsetRad: Math.PI * 0.5 + 0.35, color: '#9ee8ff' },
      { offsetRad: Math.PI + 0.35, color: '#ffc88a' },
      { offsetRad: Math.PI * 1.5 + 0.35, color: '#b4a8ff' }
    ] };
    var solR = Math.hypot(MW.solXyzMw[0], MW.solXyzMw[2]) || 26602;
    var solTh = Math.atan2(MW.solXyzMw[2], MW.solXyzMw[0]);
    var pitchK = 0.22;
    var seed = 0x51a7b39d;
    function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    var pts = [];
    for (var i = 0; i < 280; i++) {
      var u = (rnd() - 0.5) * 2 * MW.barHalfLenLy * 0.95;
      var v = (rnd() - 0.5) * 2 * 4400 * (1 - 0.5 * Math.abs(u) / MW.barHalfLenLy);
      var ca = Math.cos(MW.barAngleRad), sa = Math.sin(MW.barAngleRad);
      var by = (rnd() + rnd() - 1) * 1800 * (1 - 0.55 * Math.abs(u) / MW.barHalfLenLy);
      pts.push({ x: u * ca - v * sa, y: by, z: u * sa + v * ca, r: 1.0 + rnd() * 1.6, col: rnd() < 0.6 ? '#ffe29c' : '#ffbf70', a: 0.26 + rnd() * 0.45 });
    }
    for (var j = 0; j < 1050; j++) {
      var arm = MW.arms[j % MW.arms.length];
      var rad = 6000 + Math.pow(rnd(), 0.72) * (MW.radiusLy - 7500);
      var scatter = (rnd() + rnd() - 1) * (0.28 + rad / 140000);
      var ang = solTh + arm.offsetRad - 0.35 + Math.log(Math.max(4000, rad) / solR) / pitchK + scatter;
      pts.push({ x: rad * Math.cos(ang), y: (rnd() + rnd() - 1) * 420, z: rad * Math.sin(ang), r: 0.8 + rnd() * 1.4, col: arm.color || '#9ee8ff', a: 0.22 + rnd() * 0.48 });
    }
    for (var o = 0; o < 120; o++) {
      var orR = solR - 3200 + (rnd() - 0.5) * 2400;
      var orA = solTh + (rnd() - 0.5) * 0.28;
      pts.push({ x: orR * Math.cos(orA), y: (rnd() + rnd() - 1) * 250, z: orR * Math.sin(orA), r: 0.9 + rnd() * 1.1, col: '#6cf0ff', a: 0.25 + rnd() * 0.42 });
    }
    S.cache.mwCloud = pts;
    return pts;
  }
  function drawMilkyWayMap(ctx, w, h, s, St, G) {
    St.hits = [];
    var origin = originXyz(s);
    var MW = (G && G.MILKY_WAY) || { radiusLy: 52000, solXyzMw: [1500, 65, 26560], coreXyzSol: [-1500, -65, -26560], arms: [] };
    var mwInfo = G.getMilkyWayInfo ? G.getMilkyWayInfo(origin) : {
      mwXyz: [MW.solXyzMw[0] + origin[0], MW.solXyzMw[1] + origin[1], MW.solXyzMw[2] + origin[2]],
      galRadiusLy: MW.solRadiusLy || 26602, sectorLabel: 'ORION SPUR', solDistLy: len3(origin)
    };
    var mwPos = mwInfo.mwXyz || mwInfo.galXyz || MW.solXyzMw;
    var mwZ = St.mwZoom || 1;
    var scale = (Math.min(w, h) * 0.44 / (MW.radiusLy || 52000)) * mwZ;
    var focusK = clamp((mwZ - 1.3) / 4.2, 0, 0.85);
    var fx = mwPos[0] * focusK, fy = (mwPos[1] || 0) * focusK, fz = mwPos[2] * focusK;
    var cy0 = Math.cos(St.yaw), sy0 = Math.sin(St.yaw), ct = Math.cos(St.tilt), stl = Math.sin(St.tilt);
    function PM(gx, gy, gz) {
      var dx = gx - fx, dy = (gy || 0) - fy, dz = gz - fz;
      var x1 = dx * cy0 - dz * sy0, z1 = dx * sy0 + dz * cy0;
      var y2 = dy * ct - z1 * stl;
      return [w / 2 + x1 * scale, h / 2 - y2 * scale];
    }
    var gCore = PM(0, 0, 0);
    var glow = ctx.createRadialGradient(gCore[0], gCore[1], 2, gCore[0], gCore[1], Math.max(40, 14000 * scale));
    glow.addColorStop(0, 'rgba(255, 218, 130, 0.42)');
    glow.addColorStop(0.45, 'rgba(180, 110, 255, 0.14)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(gCore[0], gCore[1], Math.max(40, 14000 * scale), 0, Math.PI * 2); ctx.fill();

    ctx.save();
    for (var kr = 10000; kr <= 50000; kr += 10000) {
      ctx.beginPath();
      for (var ai = 0; ai <= 72; ai++) {
        var aa = ai / 72 * Math.PI * 2;
        var qp = PM(kr * Math.cos(aa), 0, kr * Math.sin(aa));
        if (ai) ctx.lineTo(qp[0], qp[1]); else ctx.moveTo(qp[0], qp[1]);
      }
      ctx.closePath();
      ctx.strokeStyle = kr === 50000 ? 'rgba(191, 0, 255, 0.36)' : 'rgba(100, 180, 255, 0.20)';
      ctx.lineWidth = 1;
      ctx.stroke();
      var rkP = PM(kr, 0, 0);
      ctx.font = '600 9px "Share Tech Mono", monospace';
      ctx.fillStyle = 'rgba(170, 215, 255, 0.65)';
      ctx.fillText((kr / 1000) + ' kLY', rkP[0] + 4, rkP[1] - 3);
    }
    var pts = buildMilkyWayCloud(G);
    for (var pi = 0; pi < pts.length; pi++) {
      var sp = pts[pi], pp = PM(sp.x, sp.y || 0, sp.z);
      ctx.globalAlpha = sp.a;
      ctx.fillStyle = sp.col;
      ctx.fillRect(pp[0] - sp.r * 0.5, pp[1] - sp.r * 0.5, sp.r, sp.r);
    }
    ctx.globalAlpha = 1;

    var solR0 = Math.hypot(MW.solXyzMw[0], MW.solXyzMw[2]) || 26602;
    var solTh0 = Math.atan2(MW.solXyzMw[2], MW.solXyzMw[0]);
    (MW.arms || []).forEach(function (arm) {
      var armR = 29000;
      var angA = solTh0 + arm.offsetRad - 0.35 + Math.log(armR / solR0) / 0.22;
      var ap = PM(armR * Math.cos(angA), 0, armR * Math.sin(angA));
      ctx.font = '600 9px "Share Tech Mono", monospace';
      ctx.fillStyle = arm.color || '#9ee8ff';
      ctx.fillText(arm.name, ap[0] + 5, ap[1] + 3);
    });

    ctx.fillStyle = '#ffd978';
    ctx.beginPath(); ctx.arc(gCore[0], gCore[1], 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.font = '600 10px "Share Tech Mono", monospace';
    ctx.fillText('SGR A* CORE', gCore[0] + 8, gCore[1] + 4);

    var visList = visibleSystems(s);
    visList.forEach(function (vs) {
      if (!vs || !vs.xyz) return;
      var vp = PM(MW.solXyzMw[0] + vs.xyz[0], MW.solXyzMw[1] + vs.xyz[1], MW.solXyzMw[2] + vs.xyz[2]);
      ctx.fillStyle = vs.id === 'sol' ? '#fff3a0' : vs.procedural ? '#4bffc7' : '#8be8ff';
      ctx.beginPath(); ctx.arc(vp[0], vp[1], vs.id === 'sol' ? 4 : 2, 0, Math.PI * 2); ctx.fill();
    });
    var solP = PM(MW.solXyzMw[0], MW.solXyzMw[1], MW.solXyzMw[2]);
    ctx.strokeStyle = '#ffd978'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(solP[0], solP[1], 7, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff5b8'; ctx.font = '600 10px "Share Tech Mono", monospace';
    ctx.fillText('SOL (ORION SPUR)', solP[0] + 10, solP[1] - 4);

    var shipP = PM(mwPos[0], mwPos[1] || 0, mwPos[2]);
    ctx.strokeStyle = '#00f0ff'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(shipP[0], shipP[1], 8, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(shipP[0], shipP[1] - 5); ctx.lineTo(shipP[0] + 4, shipP[1] + 4); ctx.lineTo(shipP[0] - 4, shipP[1] + 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#00f0ff'; ctx.font = '600 11px "Share Tech Mono", monospace';
    ctx.fillText('YOU // ' + upper(mwInfo.sectorLabel || 'ORION SPUR'), shipP[0] + 11, shipP[1] + 12);

    ctx.fillStyle = 'rgba(6, 12, 24, 0.78)';
    ctx.strokeStyle = 'rgba(99, 255, 141, 0.35)';
    ctx.lineWidth = 1;
    ctx.fillRect(14, h - 76, 308, 62);
    ctx.strokeRect(14, h - 76, 308, 62);
    ctx.fillStyle = '#8efce0';
    ctx.font = '600 11px "Share Tech Mono", monospace';
    ctx.fillText('MILKY WAY GALAXY // 104 kLY DISK', 22, h - 57);
    ctx.fillStyle = '#d4e9ff';
    ctx.font = '10px "Share Tech Mono", monospace';
    ctx.fillText('GALACTOCENTRIC R: ' + (num(mwInfo.galRadiusLy, 26602) / 1000).toFixed(2) + ' kLY  (' + upper(mwInfo.sectorLabel || 'ORION SPUR') + ')', 22, h - 41);
    ctx.fillText('DIST FROM SOL: ' + num(mwInfo.solDistLy, 0).toFixed(1) + ' LY  //  SCROLL IN TO RETURN', 22, h - 25);
    ctx.restore();
  }
  function drawStarmap(s, force) {
    var cv = $('lh-starmap-canvas'), G = Gx();
    if (!cv || !G || S.screen !== 'starmap') return;
    var now = performance.now(), St = S.star;
    if (!force && !St.dirty && now - St.lastDraw < 66) return;
    St.lastDraw = now; St.dirty = false;
    var f = fitCanvas(cv), ctx = f.ctx, w = f.w, h = f.h;
    ctx.fillStyle = '#04040b'; ctx.fillRect(0, 0, w, h);
    if (St.scale === 'milkyway') {
      drawMilkyWayMap(ctx, w, h, s, St, G);
      return;
    }
    var here = curSys(s), origin = originXyz(s), visSys = visibleSystems(s);
    var originDist = len3(origin);
    var center = (St.scale === 'local' || originDist > 65) ? origin : [0, 0, 0];
    var ext = 1;
    if (St.scale === 'local') ext = 9;
    else {
      ext = 110;
      visSys.forEach(function (sys) { ext = Math.max(ext, len3(sub3(sys.xyz, center)) * 1.05); });
    }
    var scale = Math.min(w, h) / 2 / ext * St.zoom;
    var cy0 = Math.cos(St.yaw), sy0 = Math.sin(St.yaw), ct = Math.cos(St.tilt), stl = Math.sin(St.tilt);
    function P(p) {
      var dx = p[0] - center[0], dy = p[1] - center[1], dz = p[2] - center[2];
      var x1 = dx * cy0 - dz * sy0, z1 = dx * sy0 + dz * cy0;
      var y2 = dy * ct - z1 * stl, z2 = dy * stl + z1 * ct;
      return [w / 2 + x1 * scale, h / 2 - y2 * scale, z2];
    }
    var plane = [center[0], 0, center[2]];
    function planePoint(r, angle) {
      return P([plane[0] + r * Math.cos(angle), plane[1], plane[2] + r * Math.sin(angle)]);
    }
    function ringPath(r) {
      ctx.beginPath();
      for (var i = 0; i <= 72; i++) {
        var q = planePoint(r, i / 72 * Math.PI * 2);
        if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]);
      }
      ctx.closePath();
    }
    var linear = St.scale !== 'local';
    var ringStep = linear ? 20 : niceStep(ext / 3.5);
    var lastRing = linear ? (ext <= 112 ? 100 : Math.ceil(ext / 20) * 20) : Math.floor(ext * 1.6 / ringStep) * ringStep;
    var pivot = P(plane);
    ringPath(lastRing);
    ctx.fillStyle = 'rgba(86, 156, 212, 0.075)';
    ctx.fill();
    var fogLy = num(G.FRONTIER_FOG_LY, 50);
    if (linear && lastRing > fogLy) {
      ctx.save();
      ctx.beginPath();
      for (var fi = 0; fi <= 72; fi++) {
        var fq = planePoint(lastRing, fi / 72 * Math.PI * 2);
        if (fi) ctx.lineTo(fq[0], fq[1]); else ctx.moveTo(fq[0], fq[1]);
      }
      ctx.closePath();
      for (var fj = 72; fj >= 0; fj--) {
        var iq = planePoint(fogLy, fj / 72 * Math.PI * 2);
        if (fj === 72) ctx.moveTo(iq[0], iq[1]); else ctx.lineTo(iq[0], iq[1]);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(18, 12, 34, 0.56)';
      ctx.fill('evenodd');
      var scanClear = function (pos3d, colRgba) {
        var cp = P(pos3d), cr = Math.max(22, Math.min(72, num(G.FRONTIER_SCAN_RADIUS_LY, 28) * scale * 0.45));
        var sg = ctx.createRadialGradient(cp[0], cp[1], 0, cp[0], cp[1], cr);
        sg.addColorStop(0, colRgba);
        sg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.arc(cp[0], cp[1], cr, 0, Math.PI * 2); ctx.fill();
      };
      if (len3(origin) >= 35) scanClear(origin, 'rgba(0, 224, 255, 0.16)');
      visSys.forEach(function (fs) { if (fs.procedural) scanClear(fs.xyz, 'rgba(75, 255, 199, 0.14)'); });
      ringPath(fogLy);
      ctx.setLineDash([7, 5]);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = 'rgba(186, 128, 255, 0.52)';
      ctx.stroke();
      ctx.setLineDash([]);
      var fLblP = planePoint(fogLy, -St.yaw + Math.PI * 0.14);
      var fTxt = originDist > 65 ? (fogLy + ' LY SENSOR HORIZON // SHIP') : (fogLy + ' LY FRONTIER // SENSOR FOG');
      ctx.font = '600 10px "Share Tech Mono", monospace';
      ctx.strokeStyle = '#060b17'; ctx.lineWidth = 3;
      ctx.strokeText(fTxt, fLblP[0] + 4, fLblP[1] - 4);
      ctx.fillStyle = 'rgba(206, 170, 255, 0.85)';
      ctx.fillText(fTxt, fLblP[0] + 4, fLblP[1] - 4);
      ctx.restore();
    }
    ctx.beginPath();
    for (var spoke = 0; spoke < 12; spoke++) {
      var edge = planePoint(lastRing, spoke * Math.PI / 6);
      ctx.moveTo(pivot[0], pivot[1]); ctx.lineTo(edge[0], edge[1]);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(119, 187, 237, 0.22)';
    ctx.stroke();
    ctx.font = '600 10px "Share Tech Mono", monospace';
    for (var r = ringStep; r <= lastRing + 1e-6; r += ringStep) {
      ringPath(r);
      ctx.strokeStyle = r % (ringStep * 2) === 0 || r === lastRing
        ? 'rgba(110, 210, 255, 0.58)' : 'rgba(140, 175, 255, 0.40)';
      ctx.stroke();
      var lp = planePoint(r, -St.yaw);
      var label = r.toFixed(r < 1 ? 1 : 0) + ' LY';
      if (lp[0] + ctx.measureText(label).width + 4 > w - 6 || lp[1] < 54) lp = planePoint(r, Math.PI / 4 - St.yaw);
      ctx.strokeStyle = '#060b17';
      ctx.lineWidth = 3;
      ctx.strokeText(label, lp[0] + 3, lp[1] - 3);
      ctx.lineWidth = 1;
      ctx.fillStyle = '#c2ecff';
      ctx.fillText(label, lp[0] + 3, lp[1] - 3);
    }
    var dest = selStar(s), plan = computeStarPlan(s);
    // stars, back to front
    var items = visSys.map(function (sys) { var q = P(sys.xyz); return { sys: sys, q: q, base: P([sys.xyz[0], 0, sys.xyz[2]]) }; });
    items.sort(function (a, b) { return a.q[2] - b.q[2]; });
    var flt = St.filter.trim().toLowerCase();
    St.hits = [];
    var labels = [], occupied = [];
    function mapLabel(word, x, y, priority) {
      labels.push({word:word, x:x, y:y, priority:priority, font:ctx.font, color:ctx.fillStyle});
    }
    var flight = s.multiHop || {};
    var route = flight.active ? flight.route : previewHopRoute(s, dest);
    var hops = route ? route.hops : [];
    var harvestMarkers = [];
    if (flight.active || hops.length > 1) {
      ctx.save();
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.shadowBlur = 7;
      ctx.setLineDash([8, 4]);
      hops.forEach(function (hop, i) {
        var from = getSys(hop.fromId), to = getSys(hop.toId);
        if (!from || !to) return;
        var a = P(from.xyz), b = P(to.xyz);
        if (flight.active && i < flight.legIdx) ctx.strokeStyle = 'rgba(110, 210, 255, 0.34)';
        else ctx.strokeStyle = i % 2 ? '#4bffc7' : '#68dfff';
        ctx.shadowColor = ctx.strokeStyle;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        if (i < hops.length - 1 && hop.iceStop) harvestMarkers.push({ point: b, index: i, site: hop.iceStop });
      });
      ctx.restore();
    }
    items.forEach(function (it) {
      var sys = it.sys, q = it.q, isSel = dest && sys.id === dest.id, isHere = here && sys.id === here.id && !inTransit(s);
      var surv = isSurveyed(sys, s), dName = displayStarName(sys, s);
      var dim = flt && (dName + ' ' + sys.name + ' ' + sys.real + ' ' + sys.cls).toLowerCase().indexOf(flt) < 0;
      ctx.save(); ctx.globalAlpha = dim ? 0.25 : 1;
      ctx.strokeStyle = 'rgba(191,0,255,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(it.base[0], it.base[1]); ctx.stroke();
      ctx.fillStyle = 'rgba(191,0,255,0.5)'; ctx.fillRect(it.base[0] - 1, it.base[1] - 1, 2, 2);
      var rad = starSize(sys.cls) * (isSel ? 1.4 : 1);
      var g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], rad * 3);
      g.addColorStop(0, starColor(sys.T)); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q[0], q[1], rad * 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = starColor(sys.T); ctx.beginPath(); ctx.arc(q[0], q[1], rad, 0, Math.PI * 2); ctx.fill();
      if (sys.procedural) {
        ctx.strokeStyle = surv ? (sys.station ? '#4bffc7' : '#a8c4ff') : '#d59cff'; ctx.lineWidth = 1.3;
        var dr = rad + 3.5;
        ctx.beginPath();
        ctx.moveTo(q[0], q[1] - dr); ctx.lineTo(q[0] + dr, q[1]);
        ctx.lineTo(q[0], q[1] + dr); ctx.lineTo(q[0] - dr, q[1]);
        ctx.closePath(); ctx.stroke();
      }
      if (isSel || isHere) {
        ctx.strokeStyle = isSel ? '#ffc828' : '#00ff88'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(q[0], q[1], rad + 5, 0, Math.PI * 2); ctx.stroke();
      }
      var showName = isSel || isHere || sys.procedural || St.zoom > 1.6 || St.scale === 'local' || /^(sol|rigil|sirius|vega|altair|procyon|tauceti|epseri|fomalhaut|pollux)$/.test(sys.id);
      if (showName && !dim) {
        ctx.font = (isSel || isHere ? '12px' : '10px') + ' "Share Tech Mono", monospace';
        ctx.fillStyle = isSel ? '#ffc828' : isHere ? '#00ff88' : !surv ? '#ddb6ff' : sys.procedural ? '#8efce0' : 'rgba(220,230,255,0.8)';
        mapLabel(upper(dName), q[0] + rad + 4, q[1] - rad - 2, isSel ? 4 : isHere ? 3 : sys.procedural ? 2 : 1);
      }
      ctx.restore();
      St.hits.push({ id: sys.id, x: q[0], y: q[1] });
    });
    if ((Array.isArray(G.FRONTIER_SYSTEMS) || Array.isArray(G.DYNAMIC_SYSTEMS)) && len3(origin) >= num(G.FRONTIER_REVEAL_SOL_LY, 40) - 2) {
      var discSet = new Set(Array.isArray(s.discoveredSystems) ? s.discoveredSystems : []);
      var pools = (G.FRONTIER_SYSTEMS || []).concat(G.DYNAMIC_SYSTEMS || []);
      pools.forEach(function (fs) {
        if (!fs || discSet.has(fs.id) || len3(sub3(fs.xyz, origin)) > 65) return;
        var pq = P(fs.xyz);
        ctx.save();
        ctx.strokeStyle = 'rgba(186, 128, 255, 0.48)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(pq[0], pq[1], 4, 0, Math.PI * 2); ctx.stroke();
        ctx.font = '9px "Share Tech Mono", monospace';
        ctx.fillStyle = 'rgba(206, 170, 255, 0.72)';
        ctx.fillText('?', pq[0] + 6, pq[1] + 3);
        ctx.restore();
      });
    }
    harvestMarkers.forEach(function (mark) {
      var q = mark.point, size = 6;
      ctx.save();
      ctx.fillStyle = '#062235'; ctx.strokeStyle = '#adf1ff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(q[0], q[1] - size); ctx.lineTo(q[0] + size, q[1]);
      ctx.lineTo(q[0], q[1] + size); ctx.lineTo(q[0] - size, q[1]); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.font = '600 10px "Share Tech Mono", monospace';
      ctx.fillStyle = '#adf1ff';
      mapLabel('#' + (mark.index + 1) + ' ' + upper(mark.site.bodyName || mark.site.name), q[0] + 9, q[1] - 8, 5);
      ctx.restore();
    });
    // The direct transit preview still supplies turnover markers for a single leg.
    if (!flight.active && hops.length < 2 && dest && plan && (!here || dest.id !== here.id || inTransit(s))) {
      var a = P(origin), b = P(dest.xyz);
      ctx.save(); ctx.strokeStyle = 'rgba(0,255,255,0.85)'; ctx.lineWidth = 1.6; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.restore();
      var D = Math.max(1e-9, plan.distLy), dir = sub3(dest.xyz, origin);
      var brakeWord = s.reversibleDrive === false ? 'FLIP / BRAKE' : 'REV BRAKE';
      var midWord = s.reversibleDrive === false ? 'FLIP 180\u00b0' : 'REV BRAKE';
      var marks = plan.coastDistLy > 1e-4 ? [[plan.flipDistLy / D, 'BURN END'], [1 - plan.flipDistLy / D, brakeWord]] : [[0.5, midWord]];
      marks.forEach(function (m) {
        var p = P([origin[0] + dir[0] * m[0], origin[1] + dir[1] * m[0], origin[2] + dir[2] * m[0]]);
        ctx.save(); ctx.strokeStyle = '#ffc828'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(p[0], p[1] - 6); ctx.lineTo(p[0] + 6, p[1]); ctx.lineTo(p[0], p[1] + 6); ctx.lineTo(p[0] - 6, p[1]); ctx.closePath(); ctx.stroke();
        ctx.fillStyle = '#ffc828'; ctx.font = '10px "Share Tech Mono", monospace';
        if (Math.hypot(b[0]-a[0], b[1]-a[1]) > 70) mapLabel(m[1], p[0]+8, p[1]+12, 2);
        ctx.restore();
      });
    }
    if (inTransit(s) && isArr3(s.posGal)) {
      var sp = P(s.posGal);
      var spBase = P([s.posGal[0], 0, s.posGal[2]]);
      var mObj = s.mission || null;
      var depSys = (mObj && mObj.departureId && getSys(mObj.departureId)) || here;
      var remDest = (mObj && mObj.destId && getSys(mObj.destId)) || dest;
      ctx.save();
      if (depSys && isArr3(depSys.xyz)) {
        var dp = P(depSys.xyz);
        ctx.strokeStyle = '#63ff8d';
        ctx.lineWidth = 2.2;
        ctx.shadowBlur = 7;
        ctx.shadowColor = '#63ff8d';
        ctx.beginPath(); ctx.moveTo(dp[0], dp[1]); ctx.lineTo(sp[0], sp[1]); ctx.stroke();
      }
      if (remDest && isArr3(remDest.xyz)) {
        var rp = P(remDest.xyz);
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.85)';
        ctx.lineWidth = 1.6;
        ctx.shadowBlur = 5;
        ctx.shadowColor = '#00f0ff';
        ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(sp[0], sp[1]); ctx.lineTo(rp[0], rp[1]); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.72)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(sp[0], sp[1]); ctx.lineTo(spBase[0], spBase[1]); ctx.stroke();
      ctx.fillStyle = '#00f0ff';
      ctx.beginPath(); ctx.arc(spBase[0], spBase[1], 2.5, 0, Math.PI * 2); ctx.fill();
      var sb = num(s.beta, 0), sg = Math.max(1, num(s.gamma, 1));
      var spdTag = sb >= GAMMA_SWITCH_BETA ? (GAMMA + ' ' + sg.toFixed(2)) : (sb.toFixed(3) + 'c');
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(sp[0], sp[1] - 7); ctx.lineTo(sp[0] + 5, sp[1] + 5); ctx.lineTo(sp[0] - 5, sp[1] + 5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '11px "Share Tech Mono", monospace';
      mapLabel(upper(s.shipName || 'SHIP') + ' ' + spdTag, sp[0] + 8, sp[1] + 4, 6);
      ctx.restore();
    }
    labels.sort(function(a,b) { return b.priority-a.priority; }).forEach(function(label) {
      ctx.font = label.font;
      var x = label.x, width = ctx.measureText(label.word).width;
      [0, 15, -15].some(function(offset) {
        var y = label.y + offset;
        if (occupied.some(function(r) { return x < r.right+3 && x+width+3 > r.x && Math.abs(y-r.y) < 14; })) return false;
        ctx.fillStyle = label.color; ctx.fillText(label.word,x,y);
        occupied.push({x:x,right:x+width,y:y}); return true;
      });
    });
    // galactic north axis gizmo & chronoscope reticle ring
    var gz0 = [44, h - 40], up = P([center[0], center[1] + 1, center[2]]), c0 = P(center);
    var ux = up[0] - c0[0], uy = up[1] - c0[1], ul = Math.hypot(ux, uy) || 1;
    ctx.save();
    var smR = Math.min(w, h) * 0.455;
    if (smR > 90) {
      ctx.strokeStyle = 'rgba(99, 255, 141, 0.12)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(w / 2, h / 2, smR, 0, Math.PI * 2); ctx.stroke();
      for (var sd = 0; sd < 360; sd += 30) {
        var sa = sd * Math.PI / 180;
        ctx.beginPath();
        ctx.moveTo(w / 2 + Math.cos(sa) * (smR - 5), h / 2 + Math.sin(sa) * (smR - 5));
        ctx.lineTo(w / 2 + Math.cos(sa) * smR, h / 2 + Math.sin(sa) * smR);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = 'rgba(191,0,255,0.8)'; ctx.fillStyle = 'rgba(191,0,255,0.9)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(gz0[0], gz0[1]); ctx.lineTo(gz0[0] + ux / ul * 22, gz0[1] + uy / ul * 22); ctx.stroke();
    ctx.font = '10px "Share Tech Mono", monospace'; ctx.fillText('GAL N', gz0[0] - 14, gz0[1] + 16);
    ctx.restore();
  }

  // ------------------------------------------------------------ drydock
  function buildDrydock() {
    var G = Gn();
    var hull = $('lh-dd-hull'), styles = $('lh-dd-styles'), ice = $('lh-dd-ice'), prop = $('lh-dd-prop'), wpn = $('lh-dd-weapons');
    if (!G || !hull || hull.__built) return;
    hull.__built = true;
    hull.appendChild(el('p', 'lh-sec-title', 'ARCHETYPES'));
    var pg = el('div', 'lh-chip-grid');
    buildPresetChips(pg, 'btn-random-ship');
    hull.appendChild(pg);
    buildHullControls(hull, 'dd', G);

    if (styles) buildStyleControls(styles, 'dd', G);

    buildIceControls(ice, 'dd', G);
    var shield = el('div', 'lh-readout');
    shield.id = 'lh-dd-shield';
    ice.appendChild(shield);

    buildDriveControls(prop, 'dd', G);
    prop.appendChild(el('p', 'lh-sec-title', 'CONJOINER DRIVE SPECIFICATIONS'));
    var dl = el('dl', 'lh-plan-grid lh-specs');
    dl.id = 'lh-dd-specs';
    prop.appendChild(dl);

    if (wpn) buildWeaponsControls(wpn, 'dd', G);
  }
  function syncDrydock(s) {
    buildDrydock();
    var dd = s.drydock || {};
    syncGenomeWidgets($('lh-screen-drydock'), s);
    syncWeaponsPanel($('lh-dd-weapons'), s);
    var specs = getSpecs(s), sl = $('lh-dd-specs');
    if (specs && sl) {
      renderDriveSpecs(sl, specs);
      setText($('lh-dd-shield'), (specs.reversibleDrive === false ? 'FLIP & BURN (BI-CONE)' : 'REVERSIBLE DRIVE (BOW ICE)') + MID + 'SHIELD ' + fmtPct(specs.iceShieldRating, 0) + MID + 'ICE ' + specs.iceMt.toFixed(2) + ' Mt' + MID + 'SAFE ' + BETA + ' ' + specs.maxSafeBetaPct.toFixed(0) + '%');
    }
    var G = Gn();
    var wBudget = (s.weaponBudget && s.weaponBudget.powerBudgetMW) ? s.weaponBudget : (G && G.computeWeaponBudget ? G.computeWeaponBudget(s.genome, specs) : { withinBudget: true });
    var budgetOk = wBudget.withinBudget !== false;
    var berthOk = dd.berthOk != null ? !!dd.berthOk : !!s.docked;
    var stFallback = curSys(s) && curSys(s).station && curSys(s).station.name;
    setText($('lh-dd-berth'), berthOk ? 'BERTH: ' + upper(dd.berthName || s.stationName || stFallback || '') : 'NOT BERTHED' + MID + 'PREVIEW ONLY');
    setText($('lh-dd-credits'), CREDIT + commas(num(s.credits, 0)));
    var dirty = !!dd.dirty;
    var costTxt = dirty ? 'REFIT COST: ' + CREDIT + commas(num(dd.cost, 0)) : 'REFIT: NO CHANGES';
    setText($('lh-dd-cost'), costTxt);
    var canCommission = (dd.canCommission != null ? !!dd.canCommission : (berthOk && dirty && num(s.credits, 0) >= num(dd.cost, 0))) && budgetOk;
    var lockTxt = !dirty ? '' : !budgetOk ? 'OVER POWER / HEAT BUDGET' : !berthOk ? 'DOCK TO COMMISSION' : num(s.credits, 0) < num(dd.cost, 0) ? 'INSUFFICIENT ' + CREDIT : 'READY';
    setText($('lh-dd-lock'), lockTxt);
    setDisabled($('btn-commission'), !canCommission);
    setDisabled($('btn-revert'), !dirty);
    setDisabled($('btn-refuel'), !s.docked);
    syncCutaways(!!dd.cutaway);
    var cam = dd.cam || 'orbit';
    qa('[data-dcam]').forEach(function (b) { setPressed(b, b.dataset.dcam === cam); });
    renderVault(s);
  }
  function renderVault(s) {
    var host = $('lh-vault-list');
    if (!host) return;
    var dd = s.drydock || {}, list = dd.vault;
    if (!Array.isArray(list)) {
      var G = Gn();
      if (!S.cache.fleet || performance.now() - S.cache.fleetAt > 3000) {
        try { S.cache.fleet = G && G.loadFleet ? G.loadFleet() : []; } catch (e) { S.cache.fleet = []; }
        S.cache.fleetAt = performance.now();
      }
      list = S.cache.fleet.map(function (g, i) { return { id: i, name: g.name }; });
    }
    var key = JSON.stringify(list.map(function (v) { return [v.id, v.name]; }));
    if (host.__key === key) return;
    host.__key = key; host.textContent = '';
    if (!list.length) { host.appendChild(el('li', 'lh-empty', 'Vault empty.')); return; }
    list.forEach(function (v) {
      var li = el('li', 'lh-vault-item');
      li.appendChild(el('span', '', upper(v.name)));
      var lb = el('button', 'acidburn-button', 'load'); lb.type = 'button'; lb.dataset.vaultLoad = String(v.id);
      var db = el('button', 'acidburn-button lh-danger', 'del'); db.type = 'button'; db.dataset.vaultDel = String(v.id);
      li.appendChild(lb); li.appendChild(db);
      host.appendChild(li);
    });
  }
  function shareFeedback(msg, ok) {
    var f = $('lh-share-feedback');
    if (!f) return;
    setText(f, msg); setData(f, 'ok', ok ? '1' : '0'); setHidden(f, false);
  }

  // ------------------------------------------------------------ sextant
  function syncSextant(s) {
    var sx = s.sextant || {}, lock = sx.lock || null;
    var opticalMag = num(sx.mag, 1);
    qa('[data-sx-mag]').forEach(function (b) {
      setPressed(b, Math.abs(opticalMag - num(b.dataset.sxMag, 1)) < 0.05);
    });
    setText($('lh-sx-mag'), (sx.irSight ? 'THERMAL IR' : 'OPTICAL') + MID + 'MAG ' + TIMES + num(sx.mag, 1).toFixed(1));
    setText($('lh-sx-coords'), '\u03b8 ' + num(sx.theta, 0).toFixed(1) + '\u00b0' + MID + '\u03c6 ' + num(sx.phi, 0).toFixed(0) + '\u00b0');
    setText($('lh-sx-scale'), lock ? 'LOCK ' + upper(lock.name) : 'NO LOCK');
    setPressed($('sw-ir'), !!sx.irSight);
    setPressed($('sw-autosolve'), sx.autoSolve !== false);
    if (lock) {
      setText($('el-target-val'), upper(lock.name));
      setText($('el-target-sub'), upper(lock.kind || '') + (lock.rangeLabel ? MID + lock.rangeLabel : ''));
      setText($('el-line-val'), Number.isFinite(lock.D) ? 'D ' + lock.D.toFixed(4) : DASH);
      setText($('el-line-sub'), Number.isFinite(lock.lambdaObs) ? 'H-\u03b1 ' + lock.lambdaObs.toFixed(1) + ' nm' : 'H-\u03b1 656.3 nm REF');
      setText($('el-rel-val'), Number.isFinite(lock.betaRel) ? (lock.betaRel >= 0 ? '+' : '') + lock.betaRel.toFixed(4) + 'c' : DASH);
      setText($('el-rel-sub'), Number.isFinite(lock.betaRel) ? (lock.betaRel > 0 ? 'RECEDING' : 'APPROACHING') : 'SAMPLE TO SOLVE');
    } else {
      setText($('el-target-val'), DASH); setText($('el-target-sub'), 'SNAP NEAREST TO ACQUIRE');
      setText($('el-line-val'), DASH); setText($('el-line-sub'), 'H-\u03b1 656.3 nm REF');
      setText($('el-rel-val'), DASH); setText($('el-rel-sub'), '\u00a0');
    }
    var sxBeta = clamp(num(s.beta, 0), 0, 0.999999);
    var sxGamma = Math.max(1, num(s.gamma, 1));
    if (sxBeta >= GAMMA_SWITCH_BETA) {
      setText($('el-world-val'), GAMMA + ' ' + sxGamma.toFixed(2));
      setText($('el-world-sub'), BETA + ' ' + sxBeta.toFixed(5) + 'c');
    } else {
      setText($('el-world-val'), sxBeta.toFixed(4) + 'c');
      setText($('el-world-sub'), GAMMA + ' ' + sxGamma.toFixed(3));
    }
    setDisabled($('btn-sample-doppler'), !lock);
    setDisabled($('btn-match-vel'), !(lock && Number.isFinite(lock.betaRel)));
    setDisabled($('btn-sx-plot'), !(lock && /star|system/.test(lock.kind || 'star')));

    var hail = sx.hail, card = $('lh-comms-card');
    setHidden(card, !hail);
    if (hail) {
      setText($('lh-comms-ship'), upper(hail.ship || 'CONTACT'));
      setText($('lh-comms-carrier'), upper(hail.carrier || 'TIGHTBEAM'));
      setText($('lh-comms-captain'), hail.captain || '');
      setText($('lh-comms-quote'), hail.quote ? '\u201c' + hail.quote + '\u201d' : '');
      setText($('lh-comms-rumor'), hail.rumor || '');
      setHidden($('btn-comms-plot'), !hail.rumorDestId);
    }
    var host = $('lh-contacts-list'), list = Array.isArray(sx.contacts) ? sx.contacts : [];
    var key = JSON.stringify(list.map(function (c) { return [c.id, c.name, c.rangeLabel, Number.isFinite(c.beta) ? c.beta.toFixed(3) : '']; }));
    if (host && host.__key !== key) {
      host.__key = key; host.textContent = '';
      if (!list.length) host.appendChild(el('p', 'lh-empty', 'No corridor contacts in range.'));
      list.forEach(function (c) {
        var row = el('div', 'lh-contact');
        var t = el('div', 'lh-contact-txt');
        t.appendChild(el('strong', '', upper(c.name)));
        t.appendChild(el('span', '', [upper(c.kind || ''), c.rangeLabel || '', Number.isFinite(c.beta) ? BETA + ' ' + c.beta.toFixed(3) : ''].filter(Boolean).join(MID)));
        row.appendChild(t);
        var b = el('button', 'acidburn-button', 'hail');
        b.type = 'button'; b.dataset.hail = c.id;
        row.appendChild(b);
        host.appendChild(row);
      });
    }
    var log = $('lh-log-list'), entries = Array.isArray(s.log) ? s.log.slice(-8).reverse() : [];
    var lkey = entries.join('\n');
    if (log && log.__key !== lkey) {
      log.__key = lkey; log.textContent = '';
      if (!entries.length) log.appendChild(el('li', 'lh-empty', 'No fixes logged.'));
      entries.forEach(function (t) { log.appendChild(el('li', '', String(t))); });
    }
    drawSkymap(sx);
  }
  function drawSkymap(sx) {
    var svg = $('lh-skymap-svg');
    if (!svg) return;
    var sky = Array.isArray(sx.sky) ? sx.sky : [];
    var key = sky.map(function (p) { return p.name + Math.round(num(p.theta, 0)) + ':' + Math.round(num(p.phi, 0)); }).join('|') + Math.round(num(sx.theta, 0)) + ':' + Math.round(num(sx.phi, 0));
    if (svg.__key === key) return;
    svg.__key = key;
    var NS = 'http://www.w3.org/2000/svg', R = 48, C = [[60, 56], [176, 56]];
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    function mk(tag, attrs, text) {
      var n = doc.createElementNS(NS, tag);
      Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
      if (text) n.textContent = text;
      svg.appendChild(n); return n;
    }
    C.forEach(function (c, i) {
      mk('circle', { cx: c[0], cy: c[1], r: R, class: 'sk-hemi' });
      mk('circle', { cx: c[0], cy: c[1], r: (R * 0.67).toFixed(1), class: 'sk-grid' });
      mk('circle', { cx: c[0], cy: c[1], r: (R * 0.33).toFixed(1), class: 'sk-grid' });
      mk('line', { x1: c[0] - R, y1: c[1], x2: c[0] + R, y2: c[1], class: 'sk-grid' });
      mk('line', { x1: c[0], y1: c[1] - R, x2: c[0], y2: c[1] + R, class: 'sk-grid' });
      var diag = R * Math.SQRT1_2;
      mk('line', { x1: (c[0] - diag).toFixed(1), y1: (c[1] - diag).toFixed(1), x2: (c[0] + diag).toFixed(1), y2: (c[1] + diag).toFixed(1), class: 'sk-grid-diag' });
      mk('line', { x1: (c[0] - diag).toFixed(1), y1: (c[1] + diag).toFixed(1), x2: (c[0] + diag).toFixed(1), y2: (c[1] - diag).toFixed(1), class: 'sk-grid-diag' });
      for (var tk = 0; tk < 12; tk++) {
        var ta = tk * Math.PI / 6;
        var rt = tk % 3 === 0 ? R - 4 : R - 2.5;
        mk('line', {
          x1: (c[0] + Math.cos(ta) * rt).toFixed(1), y1: (c[1] + Math.sin(ta) * rt).toFixed(1),
          x2: (c[0] + Math.cos(ta) * R).toFixed(1), y2: (c[1] + Math.sin(ta) * R).toFixed(1),
          class: 'sk-grid'
        });
      }
      mk('text', { x: c[0], y: c[1] + R + 7, class: 'sk-cap' }, i ? 'STERN' : 'BOW');
    });
    function place(theta, phi) {
      theta = num(theta, 0); var stern = theta > 90, r = (stern ? 180 - theta : theta) / 90 * R, a = num(phi, 0) * Math.PI / 180;
      var c = C[stern ? 1 : 0];
      // phi=0 is dorsal +Y (12 o'clock / top); phi=90 is starboard +Z (3 o'clock / right on bow hemisphere).
      return [c[0] + (stern ? -1 : 1) * r * Math.sin(a), c[1] - r * Math.cos(a)];
    }
    sky.slice(0, 80).forEach(function (p) {
      var q = place(p.theta, p.phi);
      mk('circle', { cx: q[0].toFixed(1), cy: q[1].toFixed(1), r: p.kind === 'contact' ? 2.2 : 1.6, class: 'sk-dot sk-' + (p.kind || 'star') });
    });
    var q0 = place(sx.theta, sx.phi);
    mk('circle', { cx: q0[0].toFixed(1), cy: q0[1].toFixed(1), r: 4.5, class: 'sk-aim' });
    mk('line', { x1: (q0[0] - 7).toFixed(1), y1: q0[1].toFixed(1), x2: (q0[0] - 2.5).toFixed(1), y2: q0[1].toFixed(1), class: 'sk-aim' });
    mk('line', { x1: (q0[0] + 2.5).toFixed(1), y1: q0[1].toFixed(1), x2: (q0[0] + 7).toFixed(1), y2: q0[1].toFixed(1), class: 'sk-aim' });
    mk('line', { x1: q0[0].toFixed(1), y1: (q0[1] - 7).toFixed(1), x2: q0[0].toFixed(1), y2: (q0[1] - 2.5).toFixed(1), class: 'sk-aim' });
    mk('line', { x1: q0[0].toFixed(1), y1: (q0[1] + 2.5).toFixed(1), x2: q0[0].toFixed(1), y2: (q0[1] + 7).toFixed(1), class: 'sk-aim' });
  }

  // --------------------------------------------------- archive & ATProto UI
  function arcFeedback(msg, ok) {
    var f = $('lh-arc-feedback');
    if (!f) return;
    setText(f, msg);
    setData(f, 'ok', ok ? '1' : '0');
    setHidden(f, !msg);
  }
  function setSoloStyle(key) {
    var patch = {};
    STYLE_DEFS.forEach(function (d) { patch[d[0]] = d[0] === key ? 1 : 0; });
    applyStylePatch(patch);
  }
  function buildStyleBars(mix) {
    mix = mix || {};
    var wrap = el('div', 'lh-style-bars');
    STYLE_DEFS.forEach(function (d) {
      var pct = clamp(Math.round(num(mix[d[3]], 0)), 0, 100);
      var row = el('div', 'lh-sbar' + (pct > 0 ? ' is-nonzero' : ''));
      row.title = d[1] + ': ' + pct + '%';
      row.appendChild(el('span', 'lh-sbar-k', d[2]));
      var track = el('span', 'lh-sbar-t');
      var fill = el('span', 'lh-sbar-f');
      fill.style.width = pct + '%';
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(el('span', 'lh-sbar-v', pct + '%'));
      wrap.appendChild(row);
    });
    return wrap;
  }
  function arcBtn(label, act, id, cls, off) {
    var b = el('button', cls || 'acidburn-button', label);
    b.type = 'button'; b.dataset.arcAct = act; b.dataset.arcId = id;
    if (off) b.disabled = true;
    return b;
  }
  function getArchiveData(s) {
    var live = call('listArchive');
    if (live && live.available) return live;
    if (s && s.archive && s.archive.available) return s.archive;
    return live || { available: !!root.LighthuggerATProto, rev: -1, vessels: [], missions: [] };
  }
  function renderArchive(s) {
    var arc = getArchiveData(s);
    var vessels = Array.isArray(arc.vessels) ? arc.vessels : [];
    var missions = Array.isArray(arc.missions) ? arc.missions : [];
    setText($('lh-arc-count-v'), String(vessels.length));
    setText($('lh-arc-count-m'), String(missions.length));
    setText($('lh-arc-lex'), 'agency.lastnpcalex.lighthugger.' + (S.atab === 'missions' ? 'mission' : 'vessel'));

    var f = (S.arc.filter || '').trim().toLowerCase();
    var lkey = [arc.rev, S.atab, f, S.arc.inspectKind || '', S.arc.inspectId || ''].join('|');
    if (S.arc.listKey === lkey) return;
    S.arc.listKey = lkey;

    var vHost = $('lh-arc-vessels'), mHost = $('lh-arc-missions');
    if (vHost) {
      vHost.textContent = '';
      var vf = vessels.filter(function (v) {
        if (!f) return true;
        return [v.name, v.notes, v.origin, v.hullStyle, (v.tags || []).join(' ')].join(' ').toLowerCase().indexOf(f) >= 0;
      });
      if (!vf.length) {
        vHost.appendChild(el('li', 'lh-empty', vessels.length ? 'No vessels match filter.' : 'No archived vessels yet. Save the current ship above.'));
      } else {
        vf.forEach(function (v) {
          var inspecting = S.arc.inspectKind === 'vessel' && S.arc.inspectId === v.id;
          var li = el('li', 'lh-arc-item' + (inspecting ? ' is-inspecting' : ''));
          var head = el('div', 'lh-arc-head');
          head.appendChild(el('strong', '', upper(v.name)));
          var badge = v.sync && v.sync.uri ? 'SYNCED' : v.sync && v.sync.staged ? 'STAGED' : upper(v.origin || 'LOCAL');
          head.appendChild(el('span', 'lh-arc-badge', badge));
          li.appendChild(head);
          var metaTxt = [v.hullStyle ? upper(v.hullStyle) : '', v.notes || '', v.updatedAt ? String(v.updatedAt).slice(0, 10) : ''].filter(Boolean).join(MID);
          if (metaTxt) li.appendChild(el('p', 'lh-arc-meta', metaTxt));
          li.appendChild(buildStyleBars(v.styleMix));
          var acts = el('div', 'lh-btn-row lh-arc-acts');
          acts.appendChild(arcBtn('load draft', 'load-v', v.id));
          acts.appendChild(arcBtn('commission', 'comm-v', v.id));
          acts.appendChild(arcBtn('inspect json', 'insp-v', v.id));
          acts.appendChild(arcBtn('stage sync', 'stage-v', v.id));
          acts.appendChild(arcBtn('clone', 'clone-v', v.id));
          acts.appendChild(arcBtn('del', 'del-v', v.id, 'acidburn-button lh-danger'));
          li.appendChild(acts);
          vHost.appendChild(li);
        });
      }
    }

    if (mHost) {
      mHost.textContent = '';
      var mf = missions.filter(function (m) {
        if (!f) return true;
        return [m.name, m.notes, m.systemName, m.currentSystemId, m.vesselName].join(' ').toLowerCase().indexOf(f) >= 0;
      });
      if (!mf.length) {
        mHost.appendChild(el('li', 'lh-empty', missions.length ? 'No voyages match filter.' : 'No voyage snapshots saved yet.'));
      } else {
        mf.forEach(function (m) {
          var inspecting = S.arc.inspectKind === 'mission' && S.arc.inspectId === m.id;
          var li = el('li', 'lh-arc-item' + (inspecting ? ' is-inspecting' : ''));
          var head = el('div', 'lh-arc-head');
          head.appendChild(el('strong', '', upper(m.name)));
          var badge = m.sync && m.sync.uri ? 'SYNCED' : m.sync && m.sync.staged ? 'STAGED' : (m.restorable ? 'READY' : 'INCOMPLETE');
          head.appendChild(el('span', 'lh-arc-badge', badge));
          li.appendChild(head);
          var bits = [
            upper(m.systemName || m.currentSystemId || 'SOL'),
            Number.isFinite(m.epochYear) ? 'EPOCH ' + m.epochYear.toFixed(2) : '',
            m.vesselName ? upper(m.vesselName) : '',
            Number.isFinite(m.iceIntegrity) ? 'ICE ' + Math.round(m.iceIntegrity * 100) + '%' : '',
            Number.isFinite(m.coreHeat) ? 'CORE ' + Math.round(m.coreHeat * 100) + '%' : '',
            m.notes || ''
          ].filter(Boolean);
          li.appendChild(el('p', 'lh-arc-meta', bits.join(MID)));
          if (m.styleMix) li.appendChild(buildStyleBars(m.styleMix));
          var acts = el('div', 'lh-btn-row lh-arc-acts');
          acts.appendChild(arcBtn('restore voyage', 'load-m', m.id, 'acidburn-button lh-launch-btn', !m.restorable));
          acts.appendChild(arcBtn('inspect json', 'insp-m', m.id));
          acts.appendChild(arcBtn('stage sync', 'stage-m', m.id));
          acts.appendChild(arcBtn('del', 'del-m', m.id, 'acidburn-button lh-danger'));
          li.appendChild(acts);
          mHost.appendChild(li);
        });
      }
    }
  }
  function syncArchivePreview(s) {
    var pre = $('lh-atproto-preview'), titleEl = $('lh-arc-inspect-title');
    if (!pre) return;
    var kind = S.arc.inspectKind, id = S.arc.inspectId, ap = root.LighthuggerATProto;
    var gKey = s && s.genome ? JSON.stringify(s.genome.P || s.genome) : 'none';
    var pKey = [kind || 'draft', id || '', kind ? 'item' : gKey].join('|');
    if (S.arc.previewKey === pKey) return;
    S.arc.previewKey = pKey;

    var env = null, title = 'CURRENT DRAFT (UNSAVED)';
    if (kind && id) {
      env = call('inspectArchiveRecord', kind, id);
      if (env) title = upper(kind) + ' // ' + id;
      else { S.arc.inspectKind = null; S.arc.inspectId = null; }
    }
    if (!env && ap && typeof ap.buildVesselRecord === 'function') {
      try {
        var rec = ap.buildVesselRecord({
          name: (s && s.shipName) || (s && s.genome && s.genome.name) || 'Long Patience',
          genome: (s && s.genome) || (Gn() && Gn().PRESETS && Gn().PRESETS[0]),
          origin: S.started ? 'voyage-draft' : 'startup-draft'
        }, Gn());
        var envStatus = ap.getEnvironmentStatus ? ap.getEnvironmentStatus() : {};
        env = ap.buildCreateRecordEnvelope({
          repoDid: (envStatus && envStatus.did) || 'did:plc:unlinked',
          collection: rec.$type,
          record: rec
        });
      } catch (e) { env = { error: e.message || String(e) }; }
    }
    setText(titleEl, title);
    setText(pre, env ? JSON.stringify(env, null, 2) : '{}');
  }
  function renderOutbox() {
    var host = $('lh-atp-outbox'), ap = root.LighthuggerATProto;
    if (!host) return;
    host.textContent = '';
    var items = ap && ap.listOutbox ? ap.listOutbox() : [];
    if (!items.length) {
      host.appendChild(el('li', 'lh-empty', 'Outbox empty. Use STAGE FOR SYNC on an archived ship or voyage.'));
      return;
    }
    items.forEach(function (it) {
      var li = el('li', 'lh-vault-item');
      var nm = (it.record && (it.record.name || it.record.title)) || it.id;
      li.appendChild(el('span', '', upper(it.kind) + ' // ' + nm));
      li.appendChild(arcBtn('unstage', 'unstage', it.id, 'acidburn-button lh-danger'));
      host.appendChild(li);
    });
  }
  function refreshAtpStatus(note) {
    if (note !== undefined) S.arc.atpNote = String(note || '');
    var stEl = $('lh-atp-status'), linkEl = $('lh-atp-link'), ap = root.LighthuggerATProto;
    if (!stEl) return;
    if (!ap || !ap.getEnvironmentStatus) {
      setText(stEl, 'ATProto adapter unavailable.');
      return;
    }
    var env = ap.getEnvironmentStatus();
    var lines = [
      'SESSION: ' + (env.did ? '@' + env.handle + ' (' + (env.authMode || 'connected') + ') -> ' + (env.pdsUrl || '') : 'NOT CONNECTED (LOCAL ARCHIVE MODE)'),
      'CONTEXT: ' + (env.canRunOAuthRedirect
        ? 'HOSTED HTTPS (OAuth 2.0 PKCE redirect ready)'
        : env.isIframe
          ? 'IFRAME / CANVAS SANDBOX (OAuth redirect blocked; JSON export & App Password XRPC active)'
          : 'LOCAL / DEV ORIGIN (OAuth requires https://lastnpcalex.agency; App Password / JWT XRPC active)'),
      'DETAIL: ' + env.reason
    ];
    if (S.arc.atpNote) lines.push('STATUS: ' + S.arc.atpNote);
    setText(stEl, lines.join('\n'));
    setDisabled($('btn-atp-disconnect'), !env.did);
    if (linkEl) {
      linkEl.textContent = '';
      var url = S.arc.atpLink;
      if (url && (url.indexOf('https://') === 0 || url.indexOf('http://') === 0)) {
        setHidden(linkEl, false);
        linkEl.appendChild(el('span', '', 'OAUTH AUTHORIZE URL (open in top-level browser tab): '));
        var a = el('a', '', url);
        a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        linkEl.appendChild(a);
      } else {
        setHidden(linkEl, true);
      }
    }
    renderOutbox();
  }
  function syncArchive(s) {
    renderArchive(s || S.snap);
    syncArchivePreview(s || S.snap);
    if (!S.cache.atpInited) { S.cache.atpInited = true; refreshAtpStatus(); }
  }

  // ------------------------------------------------------------- binding
  function bindDom() {
    doc.addEventListener('keydown', onKeyDown);
    doc.addEventListener('keydown', onArchiveKey, true);
    doc.addEventListener('contextmenu', function (e) {
      var bt = e.target && e.target.closest ? e.target.closest('#btn-audio-toggle') : null;
      if (!bt) return;
      e.preventDefault();
      var aRm = call('toggleAudioMute');
      if (S.snap && aRm) S.snap.audio = aRm;
      syncAudioUi(Object.assign({}, S.snap, { audio: aRm }));
      call('playUiSound', 'toggle');
    });
    doc.addEventListener('click', function (e) {
      if (e.target && e.target.id === 'lh-settings-modal') { setSettingsOpen(false); return; }
      if (e.target && e.target.id === 'lh-tutorial-modal') { setTutorialOpen(false); return; }
      if (S.audioPopOpen) {
        var popEl = $('lh-audio-popover'), btnAud = $('btn-audio-toggle');
        if (popEl && !popEl.contains(e.target) && (!btnAud || !btnAud.contains(e.target))) {
          setAudioPopOpen(false);
        }
      }
      var t = e.target.closest ? e.target.closest('button, [data-star]') : null;
      if (!t || !$('main').contains(t)) return;
      if (t.closest('#lh-menu-right')) call('pauseMenuOrbit', 6);
      var ds = t.dataset;
      if (!t.disabled && t.id !== 'btn-audio-toggle' && t.id !== 'btn-pop-audio-mute' &&
          t.id !== 'btn-pop-audio-reverb' && t.id !== 'btn-set-audio-mute' && t.id !== 'btn-set-audio-reverb') {
        if (t.id === 'btn-sample-doppler') call('playUiSound', 'sample');
        else if (t.id === 'btn-ship-launch-undock' || t.id === 'btn-orbit-execute' ||
            t.id === 'btn-orbit-exec-watch' || t.id === 'btn-orbit-flip-exec' ||
            t.id === 'btn-cz-save' || t.id === 'btn-menu-continue' ||
            t.id === 'btn-wreck-recommission') {
          call('playUiSound', 'confirm');
        } else if (ds.screenBtn || ds.dtab || ds.cztab || ds.mtab || ds.atab || ds.menutab ||
            t.id === 'btn-photo-mode' || t.id === 'btn-photo-exit' || t.id === 'btn-settings-open' ||
            t.id === 'btn-settings-close' || t.id === 'btn-set-close' || t.id === 'btn-pop-audio-close' ||
            t.id === 'btn-wreck-menu') {
          call('playUiSound', 'tab');
        } else if (t.id === 'btn-wpn-guard' || t.id === 'btn-set-autoorbit' || t.id === 'btn-set-vectors' ||
            ds.hudToggle || ds.helm === 'flip' || ds.gfxAa || ds.gfxScale || ds.oscMode ||
            (t.classList && (t.classList.contains('kg-switch') || t.classList.contains('lh-set-tog') || t.classList.contains('lh-pop-tog')))) {
          call('playUiSound', 'toggle');
        } else {
          call('playUiSound', 'click');
        }
      }
      if (ds.gfxAa) {
        var gAa = call('setGraphics', { aa: ds.gfxAa });
        syncSettings(Object.assign({}, S.snap, { graphics: gAa || S.snap.graphics }));
        return;
      }
      if (ds.gfxScale) {
        var gSc = call('setGraphics', { renderScale: num(ds.gfxScale, 1) });
        syncSettings(Object.assign({}, S.snap, { graphics: gSc || S.snap.graphics }));
        return;
      }
      if (ds.screenBtn) { setSettingsOpen(false); showScreen(ds.screenBtn); return; }
      if (ds.thrustSet != null) { sendThrust(num(ds.thrustSet, 0)); return; }
      if (ds.warp) { call('setTimeWarp', (ds.warp === 'interstellar' || ds.warp === 'hyper' || ds.warp === 'auto') ? ds.warp : num(ds.warp, 1)); qa('[data-warp]').forEach(function (b) { setPressed(b, b.dataset.warp === ds.warp); }); return; }
      if (ds.att) { call('setAttitudeMode', ds.att === 'normal' && S.snap.attitude === 'normal' ? 'antinormal' : ds.att); return; }
      if (ds.helm === 'flip') { call('toggleFlip'); return; }
      if (ds.helm === 'stop') { localThrust(0); call('stopAll'); return; }
      if (ds.hudToggle) {
        var ht = ds.hudToggle;
        if (ht === 'flt') call('toggleHudFlight');
        else if (ht === 'rel') call('toggleHudRel');
        else if (ht === 'wpn') call('toggleHudWeapons');
        else if (ht === 'hide') call('toggleHideShip');
        else if (ht === 'lock') call('toggleCamLock');
        return;
      }
      if (ds.sxMag) {
        call('zoomBy', num((S.snap.sextant || {}).mag, 1) / num(ds.sxMag, 1));
        return;
      }
      if (ds.oscMode) { call('setOscMode', ds.oscMode); qa('[data-osc-mode]').forEach(function (b) { setPressed(b, b === t); }); return; }
      if (ds.scenario) { flushGenome(); S.started = true; call('loadScenario', ds.scenario); showScreen('helm'); return; }
      if (ds.orbitFrame) { setOrbitFrame(ds.orbitFrame); return; }
      if (ds.moonIdx != null) {
        var md = S.o3Diag || {};
        var mpi = md.planetIdx != null ? md.planetIdx : ((S.snap.orbit || {}).planetIdx || 0);
        var mmi = num(ds.moonIdx, 0);
        var sysM = curSys(S.snap), plM = sysM && sysM.planets && sysM.planets[mpi], moM = plM && plM.moons && plM.moons[mmi];
        var primM = S.snap.orbitPrimary || (S.snap.orbit && (S.snap.orbit.primary || S.snap.orbit.focusSoi)) || 'planet';
        if (moM && moM.id && primM !== 'moon') {
          S.selTarget = moM.id;
          S.cache.tgtAt = 0;
          var tHost = $('lh-target-list'); if (tHost) tHost.__key = '';
          call('selectTargetOrbit', moM.id);
        }
        if (S.o3) S.o3.setFrame('moon', mpi, mmi);
        S.orbitSoi = 'planet'; S.cache.tgtAt = 0; S.o3At = 0;
        call('setFocusSoi', 'moon', mpi, mmi);
        if (S.o3) syncOrbit3D(S.snap, true);
        syncOrbitPanel(S.snap);
        return;
      }
      if (ds.circMode) {
        var cmVal = ds.circMode === 'pe' ? 'pe' : ds.circMode === 'ap' ? 'ap' : 'now';
        S.circMode = cmVal;
        syncOrbitQuickLabels(S.snap);
        setOrbitHint('CIRC EPOCH: ' + (cmVal === 'now' ? 'IMMEDIATE' : cmVal === 'pe' ? 'PERIAPSIS (PE)' : 'APOAPSIS (AP)'));
        return;
      }
      if (ds.quickBurn) {
        var qb = ds.quickBurn;
        var snapForO3 = Object.assign({}, S.snap, { selectedTargetId: S.selTarget });
        if (qb === 'orbit') {
          var orbRes = typeof A.plotOrbitCapture === 'function' ? call('plotOrbitCapture', S.selTarget) : null;
          if (orbRes) {
            if (orbRes.targetId) { S.selTarget = orbRes.targetId; S.cache.tgtAt = 0; }
            if (orbRes.valid) {
              if (Array.isArray(orbRes.burns)) {
                S.burns = orbRes.burns.map(function (b) { return Object.assign({}, b); });
                S.selBurn = S.burns.length - 1;
                S.chainKey = chainKey(S.burns);
                if (S.o3) S.o3.setBurns(S.burns, S.selBurn);
                renderBurnChain(S.snap);
              }
              S.o3At = 0; S.orbitView.dirty = true;
              if (orbRes.alreadyInOrbit) {
                var inMsg = 'ALREADY IN ' + upper(orbRes.targetLabel || orbRes.primaryLabel || 'TARGET') + ' ORBIT';
                flash(inMsg, 'info');
                setOrbitHint(inMsg);
              } else {
                var capMsg = 'PLOTTED ORBIT ' + upper(orbRes.targetLabel || S.selTarget || 'TARGET') + MID +
                  DELTA + 'v ' + num(orbRes.totalDvKmS, 0).toFixed(2) + ' km/s';
                flash(capMsg, 'info');
                setOrbitHint(capMsg + MID + 'EXEC & WATCH TO CAPTURE');
              }
            } else {
              flash('NO CLEAR CAPTURE ORBIT FOUND FOR TARGET', 'warn');
              setOrbitHint('NO CLEAR CAPTURE ORBIT FOUND');
            }
          } else if (S.o3) {
            S.o3.update(snapForO3, { selectedTargetId: S.selTarget });
            var bBefore = S.burns.length;
            S.o3.addQuickBurn('orbit', snapForO3);
            if (S.burns.length === bBefore) S.o3.addQuickBurn('rendezvous', snapForO3);
          } else {
            setOrbitHint('3D CHRONOSCOPE UNAVAILABLE');
          }
          syncOrbitQuickLabels(S.snap);
        } else if (qb === 'brachistochrone') {
          var flip = call('plotBrachistochroneOrbit', S.selTarget);
          if (flip) {
            if (flip.valid !== false) {
              S.burns = []; S.selBurn = -1; S.chainKey = '[]';
              call('clearManeuverChain');
              if (S.o3) S.o3.setBurns([], -1);
              renderBurnChain(S.snap);
              setOrbitHint('PLOTTED FLIP-BURN TO ' + upper(flip.label || S.selTarget || 'TARGET') + MID + DELTA + 'v ' + num(flip.totalDvKmS, 0).toFixed(2) + ' km/s');
            } else {
              flash('NO CLEAR FLIP-BURN PATH -- TRY ORBIT', 'warn');
              setOrbitHint('NO CLEAR FLIP-BURN PATH -- TRY ORBIT');
            }
            S.o3At = 0;
            S.orbitView.dirty = true;
          } else {
            flash('SELECT A TARGET ORBIT FOR FLIP-BURN', 'warn');
          }
        } else if (qb === 'circularize') {
          var cm = S.circMode || 'now';
          var replaceChain = S.burns.length === 0 || (S.burns.length === 1 && S.burns[0].kind === 'circularize');
          if (replaceChain && typeof A.circularizeOrbit === 'function') {
            var cRes = call('circularizeOrbit', cm);
            if (cRes) {
              var pLbl = upper(cRes.primaryLabel || S.snap.orbitPrimaryLabel || 'PRIMARY');
              if (cRes.alreadyCircular) {
                S.burns = []; S.selBurn = -1; S.chainKey = '[]';
                if (S.o3) S.o3.setBurns([], -1);
                renderBurnChain(S.snap);
                var cMsg = 'ALREADY CIRCULAR AROUND ' + pLbl + MID + 'dv ' + num(cRes.dvKmS, 0).toFixed(2) + ' km/s';
                flash(cMsg, 'info');
                setOrbitHint(cMsg);
              } else if (!cRes.valid) {
                var fMsg = 'NO APOAPSIS ON ESCAPE AROUND ' + pLbl;
                flash(fMsg, 'warn');
                setOrbitHint(fMsg);
              } else {
                if (Array.isArray(cRes.burns)) {
                  S.burns = cRes.burns.map(function (b) { return Object.assign({}, b); });
                  S.selBurn = S.burns.length - 1;
                  S.chainKey = chainKey(S.burns);
                  if (S.o3) S.o3.setBurns(S.burns, S.selBurn);
                  renderBurnChain(S.snap);
                }
                S.o3At = 0; S.orbitView.dirty = true;
                var okC = 'CIRCULARIZE AROUND ' + pLbl + (cm !== 'now' ? ' @ ' + upper(cm) : '') + MID +
                  'dv ' + num(cRes.dvKmS, 0).toFixed(2) + ' km/s';
                flash(okC, 'info');
                setOrbitHint(okC);
              }
            }
          } else if (S.o3) {
            S.o3.update(snapForO3, { selectedTargetId: S.selTarget });
            var prevCircLen = S.burns.length;
            var o3Kind = cm === 'pe' ? 'circularize-pe' : cm === 'ap' ? 'circularize-ap' : 'circularize';
            S.o3.addQuickBurn(o3Kind, snapForO3, { mode: cm });
            if (S.burns.length > prevCircLen) {
              setOrbitHint('CIRC BURN #' + S.burns.length + (cm !== 'now' ? ' @ ' + upper(cm) : '') + MID + 'EXEC & WATCH TO RUN');
            }
          } else {
            setOrbitHint('3D CHRONOSCOPE UNAVAILABLE');
          }
        } else if (S.o3) {
          S.o3.update(snapForO3, { selectedTargetId: S.selTarget });
          S.o3.addQuickBurn(qb, snapForO3);
        } else {
          setOrbitHint('3D CHRONOSCOPE UNAVAILABLE');
        }
        var moreBox = $('lh-quick-more');
        if (moreBox && !moreBox.hidden && moreBox.contains(t)) {
          setHidden(moreBox, true);
          var moreBtn = $('btn-orbit-more');
          if (moreBtn) { moreBtn.setAttribute('aria-expanded', 'false'); setPressed(moreBtn, false); }
        }
        return;
      }
      if (ds.burnPick != null) {
        var bi = num(ds.burnPick, -1);
        if (S.o3 && bi >= 0 && bi < S.burns.length) {
          S.selBurn = bi;
          S.o3.setBurns(S.burns, bi);
          pushChain(bi);
          renderBurnChain(S.snap);
        }
        return;
      }
      if (ds.burnDel != null) { if (S.o3) S.o3.removeBurn(num(ds.burnDel, -1)); return; }
      if (ds.soi && S.o3) { setOrbitFrame(ds.soi); return; }
      if (ds.soi) { S.orbitSoi = ds.soi; S.orbitView.panX = S.orbitView.panY = 0; S.orbitView.zoom = 1; S.orbitView.dirty = true; S.cache.tgtAt = 0; call('setFocusSoi', ds.soi); return; }
      if (ds.puckMode) {
        var nextPm = ds.puckMode;
        call('setPuckMode', nextPm);
        qa('[data-puck-mode]').forEach(function (b) { setPressed(b, b.dataset.puckMode === nextPm); });
        var capEl = $('btn-puck-mode');
        setText(capEl, nextPm === 'cam' ? 'PUCK: CAMERA LOOK' : nextPm === 'vec' ? 'PUCK: PROGRADE TRIM' : 'PUCK: MANUAL PILOT');
        setData(capEl, 'mode', nextPm);
        setPressed(capEl, nextPm !== 'steer');
        return;
      }
      if (ds.trimStep) {
        S.trimStep = clamp(num(ds.trimStep, 0.01), 0.001, 0.5);
        qa('[data-trim-step]').forEach(function (b) { setPressed(b, Math.abs(num(b.dataset.trimStep, 0) - S.trimStep) < 1e-6); });
        var td = S.trimStep <= 0.001 ? 3 : 2;
        qa('#lh-node-trim .lh-trim-row').forEach(function (row) {
          var inp = row.querySelector('input'), out = row.querySelector('output');
          if (inp) inp.step = String(S.trimStep);
          if (out && inp) setText(out, num(inp.value, 0).toFixed(td));
        });
        return;
      }
      if (ds.targetId) {
        S.selTarget = ds.targetId; S.orbitView.dirty = true; S.o3At = 0;
        var host = $('lh-target-list'); if (host) host.__key = '';
        call('selectTargetOrbit', ds.targetId);
        syncOrbitQuickLabels(S.snap);
        if (S.o3) syncOrbit3D(S.snap, true);
        return;
      }
      if (ds.tutStep != null) {
        var stepNum = num(ds.tutStep, 0);
        if (stepNum >= 0 && stepNum < TUTORIAL_STEPS.length) { S.tutorialStep = stepNum; renderTutorialStep(); }
        return;
      }
      if (ds.starscale) {
        S.star.scale = ds.starscale;
        if (ds.starscale === 'milkyway') S.star.mwZoom = 1; else S.star.zoom = 1;
        qa('[data-starscale]').forEach(function (b) { setPressed(b, b.dataset.starscale === S.star.scale); });
        S.star.dirty = true;
        return;
      }
      if (ds.star) { pickStar(ds.star); return; }
      if (ds.wpnPreset) {
        var Gp = Gn(), pr = Gp && (Gp.WEAPON_PRESETS || []).find(function (x) { return x.id === ds.wpnPreset; });
        if (pr) {
          flushGenome();
          (Gp.WEAPON_KEYS || []).forEach(function (wk) { call('setGenomeParam', wk, pr.P[wk]); });
        }
        return;
      }
      if (ds.wpnKey && ds.wpnDelta) {
        var Gw = Gn(), sp = Gw && Gw.WEAPON_SPECS && Gw.WEAPON_SPECS[ds.wpnKey];
        if (sp) {
          flushGenome();
          var curP = genomeP(S.snap || {});
          var curC = curP[ds.wpnKey] != null ? Math.round(curP[ds.wpnKey]) : sp.def;
          var nextC = clamp(curC + Math.round(num(ds.wpnDelta, 0)), sp.min, sp.max);
          if (nextC !== curC) {
            if (nextC > curC && Gw.computeWeaponBudget) {
              var candG = Object.assign({}, (S.snap && S.snap.genome) || {}, { P: Object.assign({}, curP, (function () { var o = {}; o[ds.wpnKey] = nextC; return o; })()) });
              var cb = Gw.computeWeaponBudget(candG, getSpecs(S.snap || {}));
              if (!cb.withinBudget) return;
            }
            call('setGenomeParam', ds.wpnKey, nextC);
          }
        }
        return;
      }
      if (ds.charter) { call('acceptCharter', ds.charter); return; }
      if (ds.dtab) { switchTab('dtab', 'dpanel', ds.dtab); return; }
      if (ds.cztab) { switchTab('cztab', 'czpanel', ds.cztab); return; }
      if (ds.mtab) { switchTab('mtab', 'mpanel', ds.mtab); return; }
      if (ds.atab) { switchTab('atab', 'apanel', ds.atab); S.arc.listKey = ''; syncArchive(S.snap); return; }
      if (ds.menutab) { switchMenuTab(ds.menutab); return; }
      if (ds.preset) { clearPendingGenome(); call('selectPreset', ds.preset); return; }
      if (ds.styleSolo) { setSoloStyle(ds.styleSolo); return; }
      if (ds.iceCover) { setIceCover(ds.iceCover); return; }
      if (ds.cutaway) { call('toggleCutawayIce'); syncCutaways(!(t.getAttribute('aria-pressed') === 'true')); return; }
      if (ds.gkey) {
        flushGenome();
        var v = ds.gtype === 'num' ? num(ds.gval, 0) : ds.gtype === 'bool' ? !(t.getAttribute('aria-pressed') === 'true') : ds.gval;
        call('setGenomeParam', ds.gkey, v);
        if (ds.gtype === 'bool') setPressed(t, v);
        return;
      }
      if (ds.dcam) { call('setDrydockCam', ds.dcam); qa('[data-dcam]').forEach(function (b) { setPressed(b, b.dataset.dcam === ds.dcam); }); return; }
      if (ds.vaultLoad != null) { call('loadFromVault', isNaN(+ds.vaultLoad) ? ds.vaultLoad : +ds.vaultLoad); return; }
      if (ds.vaultDel != null) { call('deleteFromVault', isNaN(+ds.vaultDel) ? ds.vaultDel : +ds.vaultDel); S.cache.fleetAt = 0; return; }
      if (ds.hail) { call('hailContact', ds.hail); return; }
      if (ds.arcAct && ds.arcId) {
        var id = ds.arcId, act = ds.arcAct, r = null;
        if (act === 'load-v') { r = call('loadArchiveVessel', id, false); S.arc.inspectKind = 'vessel'; S.arc.inspectId = id; S.arc.previewKey = ''; S.arc.listKey = ''; }
        else if (act === 'comm-v') { r = call('loadArchiveVessel', id, true); S.arc.inspectKind = 'vessel'; S.arc.inspectId = id; S.arc.previewKey = ''; S.arc.listKey = ''; }
        else if (act === 'insp-v') { S.arc.inspectKind = 'vessel'; S.arc.inspectId = id; S.arc.previewKey = ''; S.arc.listKey = ''; syncArchive(S.snap); return; }
        else if (act === 'stage-v') { r = call('stageArchiveForSync', 'vessel', id); S.arc.listKey = ''; refreshAtpStatus(r && r.msg); }
        else if (act === 'clone-v') { r = call('cloneArchiveVessel', id); S.arc.listKey = ''; }
        else if (act === 'del-v') { r = call('deleteArchiveVessel', id); if (S.arc.inspectId === id) { S.arc.inspectKind = null; S.arc.inspectId = null; } S.arc.previewKey = ''; S.arc.listKey = ''; }
        else if (act === 'load-m') { r = call('loadMissionSnapshot', id, { closeMenu: true }); if (r && r.ok) showScreen('helm'); }
        else if (act === 'insp-m') { S.arc.inspectKind = 'mission'; S.arc.inspectId = id; S.arc.previewKey = ''; S.arc.listKey = ''; syncArchive(S.snap); return; }
        else if (act === 'stage-m') { r = call('stageArchiveForSync', 'mission', id); S.arc.listKey = ''; refreshAtpStatus(r && r.msg); }
        else if (act === 'del-m') { r = call('deleteMissionSnapshot', id); if (S.arc.inspectId === id) { S.arc.inspectKind = null; S.arc.inspectId = null; } S.arc.previewKey = ''; S.arc.listKey = ''; }
        else if (act === 'unstage' && root.LighthuggerATProto) { root.LighthuggerATProto.clearOutboxItem(id); S.arc.listKey = ''; refreshAtpStatus('Removed item from outbox.'); return; }
        if (r && r.msg) arcFeedback(r.msg, !!r.ok);
        syncArchive(S.snap);
        return;
      }
      if (ds.nudge) {
        var row = t.closest('.lh-trim-row'), axis = row && row.dataset.axis, inp = row && row.querySelector('input');
        var step = S.trimStep || 0.01, td2 = step <= 0.001 ? 3 : 2;
        var dv = num(ds.nudge, 0) * step;
        if (inp) { inp.value = clamp(num(inp.value, 0) + dv, -5, 5).toFixed(td2); setText(row.querySelector('output'), num(inp.value, 0).toFixed(td2)); }
        if (!trimBurn(axis, dv, true)) call('nudgeNodeDv', axis, dv, false);
        S.orbitView.dirty = true;
        return;
      }
      switch (t.id) {
        case 'btn-wreck-recommission': call('recommissionShip'); showScreen('helm'); break;
        case 'btn-wreck-menu': call('recommissionShip'); showScreen('menu'); break;
        case 'lh-primary-action': runPrimary(ds.action); break;
        case 'lh-deck-primary': runPrimary(ds.action); break;
        case 'btn-kg-unstow': if (S.screen !== 'helm') showScreen('helm'); setKgOpen(true); break;
        case 'kg-fold-btn': setKgOpen(false); break;
        case 'sw-flip': call('toggleFlip'); break;
        case 'sw-allstop': localThrust(0); call('stopAll'); break;
        case 'sw-hud-flt': call('toggleHudFlight'); break;
        case 'sw-hud-rel': call('toggleHudRel'); break;
        case 'btn-wpn-guard':
          var coverOpen = t.getAttribute('aria-expanded') !== 'true';
          var coverLabel = coverOpen ? 'Close WPN safety cover' : 'Lift WPN safety cover';
          t.setAttribute('aria-expanded', String(coverOpen));
          t.setAttribute('aria-label', coverLabel);
          t.title = coverLabel;
          setText(t.firstElementChild, coverOpen ? 'SHUT' : 'LIFT');
          setDisabled($('sw-hud-wpn'), !coverOpen);
          break;
        case 'sw-hud-wpn': call('toggleHudWeapons'); break;
        case 'btn-fine-steer': call('toggleFineSteer'); break;
        case 'btn-aberration-loupe': call('cycleAberrationZoom'); break;
        case 'btn-rest-frame': call('toggleHudRestFrame'); break;
        case 'btn-rel-gov': call('toggleRelGovernor'); break;
        case 'btn-ice-harvest': call('harvestIceWithDropships'); break;
        case 'btn-emerg-brake': call('emergencyBrakeToSafeBeta'); break;
        case 'btn-orbit-stow':
        case 'btn-sextant-stow': toggleStationDeck(t); break;
        case 'sw-cam-lock': call('toggleCamLock'); break;
        case 'sw-hide-ship': call('toggleHideShip'); break;
        case 'btn-osc-zin': call('zoomOsc', 1 / 1.35); break;
        case 'btn-osc-rst': call('resetSpecWindow'); break;
        case 'btn-osc-zout': call('zoomOsc', 1.35); break;
        case 'btn-wpn-lock': call('toggleWeaponLock'); break;
        case 'btn-wpn-cycle': call('cycleWeaponTarget'); break;
        case 'btn-wpn-fire': call('fireWeaponPulse'); break;
        case 'btn-wpn-msl': call('launchMissileSalvo'); break;
        case 'btn-vectors': call('toggleVectors'); break;
        case 'btn-cam-view': call('cycleCamViewMode'); break;
        case 'btn-puck-mode': {
          var puckMode = (S.snap && S.snap.puckMode) || ($('btn-puck-mode') && $('btn-puck-mode').dataset.mode) || 'steer';
          var nextMode = puckMode === 'steer' ? 'cam' : 'steer';
          call('setPuckMode', nextMode);
          qa('[data-puck-mode]').forEach(function (b) { setPressed(b, b.dataset.puckMode === nextMode); });
          var pmCap = $('btn-puck-mode');
          setText(pmCap, nextMode === 'cam' ? 'PUCK: CAMERA LOOK' : 'PUCK: PILOT (SNAP)');
          setData(pmCap, 'mode', nextMode);
          setPressed(pmCap, nextMode !== 'steer');
          break;
        }
        case 'btn-zoom-in': call('zoomBy', 1 / 1.2); break;
        case 'btn-zoom-out': call('zoomBy', 1.2); break;
        case 'btn-zoom-reset': call('resetCamera'); break;
        case 'btn-menu-resume': flushGenome(); showScreen('helm'); break;
        case 'btn-ship-launch-undock': {
          flushGenome();
          S.started = true;
          var launched = call('launchAndUndock');
          if (launched !== true) call('undock');
          showScreen('helm');
          break;
        }
        case 'btn-menu-continue': call('continueSavedVoyage'); showScreen('helm'); break;
        case 'btn-menu-reset':
          if (root.confirm ? root.confirm('Reset the voyage? Ship, credits and epoch return to the Sol start.') : true) { call('resetVoyage'); S.started = false; syncMenu(S.snap); }
          break;
        case 'btn-cz-random': clearPendingGenome(); call('randomizeShip'); break;
        case 'btn-cz-save': {
          flushGenome();
          var czRes = call('saveShipToArchive', (S.snap.shipName || 'Custom Lighthugger'), 'Saved from startup customizer');
          flash(czRes && czRes.ok ? czRes.msg : 'Saved to archive.', czRes && czRes.ok === false ? 'warn' : 'nominal');
          break;
        }
        case 'btn-orbit-fit':
          if (S.o3) S.o3.resetView();
          S.orbitView.zoom = 1; S.orbitView.panX = S.orbitView.panY = 0; S.orbitView.dirty = true;
          break;
        case 'btn-orbit-ship':
          if (S.o3 && S.o3.centerOnShip) { S.o3.centerOnShip(); S.o3At = 0; syncOrbit3D(S.snap, true); }
          break;
        case 'btn-orbit-add-ship':
          if (S.o3 && S.o3.addBurnAtShip) { S.o3.addBurnAtShip(); S.o3At = 0; syncOrbit3D(S.snap, true); }
          break;
        case 'btn-orbit-hill': S.o3Hill = !S.o3Hill; if (S.o3) S.o3.setShowHill(S.o3Hill); setPressed(t, S.o3Hill); break;
        case 'btn-orbit-lagrange': S.o3Lag = !S.o3Lag; if (S.o3) S.o3.setShowLagrange(S.o3Lag); setPressed(t, S.o3Lag); break;
        case 'btn-orbit-ice': S.o3Ice = !S.o3Ice; if (S.o3) S.o3.setShowIceDeposits(S.o3Ice); setPressed(t, S.o3Ice); break;
        case 'btn-orbit-top': if (S.o3) { S.o3.setTopDown(); S.o3At = 0; } break;
        case 'btn-orbit-more': {
          var moreDrawer = $('lh-quick-more');
          if (moreDrawer) {
            var openMore = moreDrawer.hidden;
            setHidden(moreDrawer, !openMore);
            t.setAttribute('aria-expanded', openMore ? 'true' : 'false');
            setPressed(t, openMore);
            syncOrbitQuickLabels(S.snap);
          }
          break;
        }
        case 'btn-orbit-execute': executeOrbit(); break;
        case 'btn-orbit-exec-watch':
          if ((S.snap.burn && S.snap.burn.active) || executeOrbit()) showScreen('helm');
          break;
        case 'btn-orbit-cancel': call('cancelOrbitBurn'); break;
        case 'btn-star-flat': {
          var flatNow = Math.abs(S.star.tilt) > 1.5;
          S.star.tilt = flatNow ? 0.85 : Math.PI / 2;
          S.star.dirty = true;
          setPressed(t, !flatNow);
          drawStarmap(S.snap, true);
          break;
        }
        case 'btn-launch-transit':
          call('engageInterstellar', { accelG: S.accelG, betaCap: S.betaCap < 0.999 ? S.betaCap : null, destId: S.star.sel });
          showScreen('helm');
          break;
        case 'btn-launch-multihop':
          call('plotStarCourse', { destId: S.star.sel, accelG: S.accelG });
          if (call('launchMultiHopRoute', S.star.sel, num($('rng-max-hop').value, 15))) showScreen('helm');
          break;
        case 'btn-abort-transit':
          if (S.snap.multiHop && S.snap.multiHop.active) call('abortMultiHopRoute');
          else call('abortInterstellar');
          break;
        case 'btn-random-ship': clearPendingGenome(); call('randomizeShip'); break;
        case 'btn-commission': call('commissionDraft'); break;
        case 'btn-revert': call('revertDraft'); break;
        case 'btn-refuel': call('refuelAndReglaze'); break;
        case 'btn-save-ship': {
          var nm = $('inp-ship-name');
          call('saveToVault', (nm && nm.value.trim()) || S.snap.shipName || 'Lighthugger');
          S.cache.fleetAt = 0;
          shareFeedback('Saved to fleet vault.', true);
          break;
        }
        case 'btn-copy-code': {
          var code = call('exportShareCode') || (S.snap.drydock && S.snap.drydock.shareCode) || '';
          var inpc = $('inp-share-code');
          if (inpc) inpc.value = code;
          if (code && root.navigator && root.navigator.clipboard) {
            root.navigator.clipboard.writeText(code).then(function () { shareFeedback('Share code copied.', true); }, function () { shareFeedback('Code ready; copy it manually.', true); });
          } else shareFeedback(code ? 'Code ready; copy it manually.' : 'No code available.', !!code);
          break;
        }
        case 'btn-load-code': {
          var ci = $('inp-share-code'), res = call('importShareCode', ci ? ci.value.trim() : '');
          if (res && typeof res === 'object') shareFeedback(res.msg || (res.ok ? 'Hull loaded into draft.' : 'Invalid code.'), !!res.ok);
          else shareFeedback(res === false ? 'Invalid code.' : 'Hull loaded into draft.', res !== false);
          break;
        }
        case 'btn-arc-save-ship': {
          var sn = $('inp-arc-ship-name'), sno = $('inp-arc-ship-notes');
          var sr = call('saveShipToArchive', sn ? sn.value : '', sno ? sno.value : '');
          if (sr && sr.ok) {
            if (sn) sn.value = ''; if (sno) sno.value = '';
            S.arc.inspectKind = 'vessel'; S.arc.inspectId = sr.id;
            switchTab('atab', 'apanel', 'vessels');
          }
          S.arc.previewKey = ''; S.arc.listKey = '';
          arcFeedback(sr ? sr.msg : 'Archive unavailable.', !!(sr && sr.ok));
          syncArchive(S.snap);
          break;
        }
        case 'btn-arc-save-voyage': {
          var vn = $('inp-arc-voy-name'), vno = $('inp-arc-voy-notes');
          var vr = call('saveMissionSnapshot', vn ? vn.value : '', vno ? vno.value : '');
          if (vr && vr.ok) {
            if (vn) vn.value = ''; if (vno) vno.value = '';
            S.arc.inspectKind = 'mission'; S.arc.inspectId = vr.id;
            switchTab('atab', 'apanel', 'missions');
          }
          S.arc.previewKey = ''; S.arc.listKey = '';
          arcFeedback(vr ? vr.msg : 'Archive unavailable.', !!(vr && vr.ok));
          syncArchive(S.snap);
          break;
        }
        case 'btn-arc-preview-draft':
          S.arc.inspectKind = null; S.arc.inspectId = null; S.arc.previewKey = ''; S.arc.listKey = '';
          syncArchive(S.snap);
          break;
        case 'btn-arc-copy-record': {
          var preEl = $('lh-atproto-preview'), jsonTxt = preEl ? preEl.textContent : '';
          if (jsonTxt && root.navigator && root.navigator.clipboard) {
            root.navigator.clipboard.writeText(jsonTxt).then(
              function () { arcFeedback('Record JSON copied.', true); },
              function () { arcFeedback('Copy blocked; select the inspector box.', false); }
            );
          } else arcFeedback('Select the JSON box to copy manually.', !!jsonTxt);
          break;
        }
        case 'btn-arc-import': {
          var tx = $('txt-arc-import'), ir = call('importArchive', tx ? tx.value : '');
          if (ir && ir.ok) { S.arc.listKey = ''; S.arc.previewKey = ''; syncArchive(S.snap); }
          arcFeedback(ir ? ir.msg : 'Import failed.', !!(ir && ir.ok));
          break;
        }
        case 'btn-arc-export': {
          var bundle = call('exportArchive');
          if (!bundle) { arcFeedback('Nothing to export.', false); break; }
          var bundleStr = typeof bundle === 'string' ? bundle : JSON.stringify(bundle, null, 2);
          try {
            var blob = new Blob([bundleStr], { type: 'application/json' });
            var href = URL.createObjectURL(blob), a = el('a');
            a.href = href; a.download = 'lighthugger-archive-' + new Date().toISOString().slice(0, 10) + '.json';
            doc.body.appendChild(a); a.click(); doc.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(href); }, 1000);
            arcFeedback('Exported archive JSON bundle.', true);
          } catch (err) { arcFeedback('Download blocked; use "show bundle".', false); }
          break;
        }
        case 'btn-arc-export-text': {
          var b2 = call('exportArchive'), tx2 = $('txt-arc-import');
          if (b2 && tx2) {
            tx2.value = typeof b2 === 'string' ? b2 : JSON.stringify(b2, null, 2);
            arcFeedback('Archive bundle placed in transfer box.', true);
          }
          else arcFeedback('Archive export unavailable.', false);
          break;
        }
        case 'btn-atp-refresh':
          S.arc.atpNote = 'Status refreshed.';
          refreshAtpStatus();
          break;
        case 'btn-atp-disconnect':
          if (root.LighthuggerATProto && root.LighthuggerATProto.disconnectSession) {
            var dr = root.LighthuggerATProto.disconnectSession();
            S.arc.atpLink = '';
            refreshAtpStatus(dr && dr.msg ? dr.msg : 'Disconnected.');
            arcFeedback('Disconnected from ATProto PDS.', true);
          }
          break;
        case 'btn-atp-stage': {
          var stRes = null;
          if (S.arc.inspectKind && S.arc.inspectId) {
            stRes = call('stageArchiveForSync', S.arc.inspectKind, S.arc.inspectId);
          } else {
            var sv = call('saveShipToArchive', (S.snap.shipName || 'Custom Lighthugger'), 'Staged for ATProto sync');
            if (sv && sv.ok && sv.id) {
              S.arc.inspectKind = 'vessel'; S.arc.inspectId = sv.id;
              stRes = call('stageArchiveForSync', 'vessel', sv.id);
            } else stRes = sv;
          }
          S.arc.listKey = ''; S.arc.previewKey = '';
          refreshAtpStatus(stRes && stRes.msg);
          arcFeedback(stRes ? stRes.msg : 'Staging failed.', !!(stRes && stRes.ok));
          syncArchive(S.snap);
          break;
        }
        case 'btn-atp-resolve': {
          var ap = root.LighthuggerATProto, hIn = $('inp-atp-handle'), pIn = $('inp-atp-pds');
          if (!ap || S.arc.atpBusy) break;
          S.arc.atpBusy = true; refreshAtpStatus('Resolving handle...');
          ap.resolveHandle(hIn ? hIn.value : '', pIn ? pIn.value : '').then(function (rr) {
            S.arc.atpBusy = false;
            if (rr.ok && pIn && rr.pdsUrl) pIn.value = rr.pdsUrl;
            refreshAtpStatus(rr.ok ? 'Resolved ' + rr.did + ' -> ' + rr.pdsUrl : (rr.error + (rr.hint ? ' (' + rr.hint + ')' : '')));
            arcFeedback(rr.ok ? 'Resolved ' + rr.did : rr.error, !!rr.ok);
          });
          break;
        }
        case 'btn-atp-oauth': {
          var ap2 = root.LighthuggerATProto, hIn2 = $('inp-atp-handle');
          if (!ap2 || S.arc.atpBusy) break;
          var envNow = ap2.getEnvironmentStatus ? ap2.getEnvironmentStatus() : {};
          S.arc.atpBusy = true; refreshAtpStatus('Preparing PKCE OAuth request...');
          ap2.prepareOAuthAuthorizeUrl({ handle: hIn2 ? hIn2.value.trim() : '' }).then(function (or) {
            S.arc.atpBusy = false;
            if (or.ok && or.url) {
              S.arc.atpLink = or.url;
              var warn = envNow.canRunOAuthRedirect
                ? 'OAuth authorize URL ready below.'
                : 'OAuth URL generated, but top-level OAuth redirect is blocked in local/Canvas sandbox; open in hosted top-level context or use App Password.';
              refreshAtpStatus(warn);
              arcFeedback('OAuth URL prepared.', true);
            } else {
              refreshAtpStatus(or.error || 'OAuth prepare failed.');
              arcFeedback(or.error || 'OAuth prepare failed.', false);
            }
          });
          break;
        }
        case 'btn-atp-connect': {
          var ap3 = root.LighthuggerATProto, h3 = $('inp-atp-handle'), p3 = $('inp-atp-pds'), s3 = $('inp-atp-secret');
          if (!ap3 || S.arc.atpBusy) break;
          S.arc.atpBusy = true; refreshAtpStatus('Connecting to PDS...');
          ap3.connectWithSession({
            handle: h3 ? h3.value : '',
            pdsUrl: p3 && p3.value.trim() ? p3.value.trim() : undefined,
            appPasswordOrJwt: s3 ? s3.value : ''
          }).then(function (cr) {
            S.arc.atpBusy = false;
            if (cr.ok && s3) s3.value = '';
            refreshAtpStatus(cr.ok ? cr.msg : (cr.error + (cr.hint ? ' (' + cr.hint + ')' : '')));
            arcFeedback(cr.ok ? cr.msg : cr.error, !!cr.ok);
          });
          break;
        }
        case 'btn-atp-sync': {
          var ap4 = root.LighthuggerATProto;
          if (!ap4 || S.arc.atpBusy) break;
          var outbox = ap4.listOutbox ? ap4.listOutbox() : [];
          if (!outbox.length) { arcFeedback('Outbox is empty. Stage a record first.', false); break; }
          var sess = ap4.getSession ? ap4.getSession() : null;
          if (!sess || !sess.accessJwt) {
            var m = 'Not connected to a PDS session; JSON transfer works offline, or connect with an App Password / JWT.';
            refreshAtpStatus(m); arcFeedback(m, false); break;
          }
          S.arc.atpBusy = true; refreshAtpStatus('Syncing ' + outbox.length + ' queued record(s)...');
          Promise.all(outbox.map(function (it) {
            if (!it.record) return Promise.resolve({ ok: false, error: 'Missing local record ' + it.id });
            return ap4.pushRecordToPds({ record: it.record, rkey: it.id, archiveId: it.id, archiveKind: it.kind });
          })).then(function (results) {
            S.arc.atpBusy = false;
            var okN = results.filter(function (x) { return x && x.ok; }).length;
            var err = results.find(function (x) { return x && !x.ok; });
            call('refreshArchive'); S.arc.listKey = '';
            var msg = okN + '/' + results.length + ' pushed' + (err ? '; error: ' + err.error : '.');
            refreshAtpStatus(msg);
            arcFeedback(msg, okN > 0 && !err);
            syncArchive(S.snap);
          });
          break;
        }
        case 'btn-atp-pull': {
          var ap5 = root.LighthuggerATProto, h5 = $('inp-atp-handle'), p5 = $('inp-atp-pds');
          if (!ap5 || S.arc.atpBusy) break;
          var sess5 = ap5.getSession ? ap5.getSession() : null;
          var repoDid = (sess5 && sess5.did) || (h5 && h5.value.trim().indexOf('did:') === 0 ? h5.value.trim() : '');
          if (!repoDid) {
            arcFeedback('Connect with PDS or enter a did:plc:/did:web: to pull records.', false);
            break;
          }
          var col = S.atab === 'missions' ? ap5.MISSION_LEXICON_ID : ap5.VESSEL_LEXICON_ID;
          S.arc.atpBusy = true; refreshAtpStatus('Pulling ' + col + '...');
          ap5.pullRecordsFromPds({ repoDid: repoDid, pdsUrl: p5 && p5.value.trim() ? p5.value.trim() : undefined, collection: col }).then(function (pr) {
            S.arc.atpBusy = false;
            if (!pr.ok) {
              refreshAtpStatus(pr.error || 'Pull failed.');
              arcFeedback(pr.error || 'Pull failed.', false);
              return;
            }
            var impN = 0;
            (pr.records || []).forEach(function (rec) {
              var val = rec && rec.value ? rec.value : rec;
              var res = call('importArchive', JSON.stringify(val));
              if (res && res.ok) impN++;
            });
            S.arc.listKey = '';
            var msg = 'Fetched ' + (pr.records ? pr.records.length : 0) + ' record(s); merged ' + impN + '.';
            refreshAtpStatus(msg);
            arcFeedback(msg, true);
            syncArchive(S.snap);
          });
          break;
        }
        case 'sw-ir': call('toggleIrSight'); break;
        case 'sw-autosolve': call('toggleAutoSolve'); break;
        case 'btn-sample-doppler': call('sampleDoppler'); break;
        case 'btn-snap-star': call('snapNearestTarget'); break;
        case 'btn-sx-plot': call('setDestFromSextant'); break;
        case 'btn-match-vel': call('matchVelocity'); break;
        case 'btn-comms-plot': {
          var h = S.snap.sextant && S.snap.sextant.hail;
          if (h && h.rumorDestId) { pickStar(h.rumorDestId); showScreen('starmap'); }
          break;
        }
        case 'btn-close-toast': setHidden($('lh-epoch-toast'), true); break;
        case 'btn-settings-open': setSettingsOpen(!S.settingsOpen); break;
        case 'btn-settings-close':
        case 'btn-set-close': setSettingsOpen(false); break;
        case 'btn-set-menu': setSettingsOpen(false); showScreen('menu'); break;
        case 'btn-menu-tutorial':
        case 'btn-manual-tutorial':
          setTutorialOpen(true, 0);
          break;
        case 'btn-set-tut-auto':
          S.tutorialShowOnLaunch = !S.tutorialShowOnLaunch;
          saveTutorialPrefs();
          syncTutorialControls();
          break;
        case 'btn-set-tut-open':
          setSettingsOpen(false);
          setTutorialOpen(true, 0);
          break;
        case 'btn-tut-close':
        case 'btn-tut-skip':
          setTutorialOpen(false);
          break;
        case 'btn-tut-prev':
          if (S.tutorialStep > 0) { S.tutorialStep--; renderTutorialStep(); }
          break;
        case 'btn-tut-next':
          if (S.tutorialStep < TUTORIAL_STEPS.length - 1) { S.tutorialStep++; renderTutorialStep(); }
          else { setTutorialOpen(false); }
          break;
        case 'btn-set-autoorbit': {
          var gCur = (S.snap && S.snap.graphics) || call('getGraphics') || { autoOrbit: true };
          var gUpd = call('setGraphics', { autoOrbit: !gCur.autoOrbit });
          syncSettings(Object.assign({}, S.snap, { graphics: gUpd || gCur }));
          break;
        }
        case 'btn-set-vectors':
          call('toggleVectors');
          syncSettings(Object.assign({}, S.snap, { showOrbitsInHelm: !(S.snap && S.snap.showOrbitsInHelm), vectors: !(S.snap && S.snap.vectors) }));
          break;
        case 'btn-audio-toggle':
          setAudioPopOpen(!S.audioPopOpen);
          call('playUiSound', 'tab');
          break;
        case 'btn-pop-audio-close':
          setAudioPopOpen(false);
          break;
        case 'btn-photo-mode':
          setPhotoMode(!S.photoMode);
          break;
        case 'btn-photo-exit':
          setPhotoMode(false);
          break;
        case 'btn-pop-audio-mute':
        case 'btn-set-audio-mute': {
          var aNext = call('toggleAudioMute');
          if (S.snap && aNext) S.snap.audio = aNext;
          syncAudioUi(Object.assign({}, S.snap, { audio: aNext }));
          call('playUiSound', 'toggle');
          break;
        }
        case 'btn-pop-audio-reverb':
        case 'btn-set-audio-reverb': {
          var aCur = call('getAudioConfig') || (S.snap && S.snap.audio) || { reverb: true };
          var aRev = call('setAudioConfig', { reverb: !aCur.reverb });
          if (S.snap && aRev) S.snap.audio = aRev;
          syncAudioUi(Object.assign({}, S.snap, { audio: aRev }));
          call('playUiSound', 'toggle');
          break;
        }
      }
    });
    doc.addEventListener('input', function (e) {
      var t = e.target;
      if (!t || !t.closest || !t.closest('#main')) return;
      if (t.closest('#lh-menu-right')) call('pauseMenuOrbit', 6);
      var audioMap = {
        'rng-audio-master': 'master', 'rng-audio-music': 'music', 'rng-audio-drive': 'drive',
        'rng-audio-amb': 'ambience', 'rng-audio-ui': 'ui',
        'rng-pop-master': 'master', 'rng-pop-music': 'music', 'rng-pop-drive': 'drive',
        'rng-pop-amb': 'ambience', 'rng-pop-ui': 'ui'
      };
      var audioKey = audioMap[t.id];
      if (audioKey) {
        var pctVal = clamp(Math.round(num(t.value, 78)), 0, 100);
        var patch = {};
        patch[audioKey] = pctVal / 100;
        var updatedAudio = call('setAudioConfig', patch);
        if (S.snap && updatedAudio) S.snap.audio = updatedAudio;
        syncAudioUi(Object.assign({}, S.snap, { audio: updatedAudio }));
        var nowSl = performance.now();
        if (nowSl - S.lastUiSliderAt > 150) {
          S.lastUiSliderAt = nowSl;
          call('playUiSound', 'click');
        }
        return;
      }
      if (t.dataset.gdial) {
        var k = t.dataset.gdial, vStr = t.value + '%';
        setText($('dd-val-' + k), vStr);
        setText($('cz-val-' + k), vStr);
        qa('[data-gdial="' + k + '"]').forEach(function (other) { if (other !== t) other.value = t.value; });
        scheduleGenomeParam(k, num(t.value, 50) / 100);
        return;
      }
      var row = t.closest('.lh-trim-row');
      if (row) {
        var td3 = S.trimStep <= 0.001 ? 3 : 2;
        setText(row.querySelector('output'), num(t.value, 0).toFixed(td3));
        if (!trimBurn(row.dataset.axis, num(t.value, 0), false)) call('nudgeNodeDv', row.dataset.axis, num(t.value, 0), true);
        S.orbitView.dirty = true;
        return;
      }
      if (t.id === 'rng-burn-delay') {
        if (S.o3 && S.o3.setBurnDelay && S.selBurn >= 0) {
          var delay = num(t.value, 0);
          S.o3.setBurnDelay(S.selBurn, delay);
          setText($('val-burn-delay'), fmtDur(delay));
        }
        return;
      }
      if (t.id === 'rng-max-hop') {
        call('setMaxHopLy', num(t.value, 15));
        setText($('val-max-hop'), t.value + ' LY');
        S.star.dirty = true;
        return;
      }
      if (t.id === 'rng-accel') { S.accelG = num(t.value, 1); planChanged(); return; }
      if (t.id === 'rng-betacap') { S.betaCap = num(t.value, 1); planChanged(); return; }
      if (t.id === 'inp-star-search') { S.star.filter = t.value || ''; S.star.dirty = true; renderSysList(); return; }
      if (t.id === 'inp-arc-filter') { S.arc.filter = t.value || ''; S.arc.listKey = ''; syncArchive(S.snap); return; }
    });
    doc.addEventListener('change', function (e) {
      var t = e.target;
      if (!t) return;
      if (t.closest && t.closest('#lh-menu-right')) call('pauseMenuOrbit', 6);
      if (t.id === 'chk-autowarp') { call('setAutoWarp', !!t.checked); return; }
      if (t.id === 'chk-tut-launch') { S.tutorialShowOnLaunch = !!t.checked; saveTutorialPrefs(); syncTutorialControls(); return; }
      if (t.dataset && t.dataset.gdial) { flushGenome(); return; }
      if (t.id === 'file-arc-import' && t.files && t.files[0]) {
        var f = t.files[0], reader = new root.FileReader();
        reader.onload = function () {
          var txt = String(reader.result || ''), box = $('txt-arc-import');
          if (box) box.value = txt;
          var r = call('importArchive', txt);
          if (r && r.ok) { S.arc.listKey = ''; S.arc.previewKey = ''; syncArchive(S.snap); }
          arcFeedback(r ? r.msg : 'File import failed.', !!(r && r.ok));
        };
        reader.readAsText(f);
        t.value = '';
      }
    });

    bindThrottle();
    bindWarpVernier();
    bindPuck();
    bindScope();
    function bindRollBtn(id, dir) {
      var b = $(id);
      if (!b) return;
      function on(e) {
        b.classList.add('is-active');
        rollSet('cap', dir);
        if (e && e.pointerId != null) try { b.setPointerCapture(e.pointerId); } catch (err) {}
        if (e && e.preventDefault) e.preventDefault();
      }
      function off() {
        if (!b.classList.contains('is-active')) return;
        b.classList.remove('is-active');
        rollSet('cap', 0);
      }
      b.addEventListener('pointerdown', on);
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('lostpointercapture', off);
      b.addEventListener('keydown', function (e) { if (e.key === ' ' || e.key === 'Enter') on(e); });
      b.addEventListener('keyup', off);
      b.addEventListener('blur', off);
    }
    bindRollBtn('btn-roll-left', -1);
    bindRollBtn('btn-roll-right', 1);
    bindRollRing();

    var oc = $('lh-orbit-canvas');
    var O3 = root.LighthuggerOrbit3D;
    if (oc && O3 && typeof O3.create === 'function') {
      try { S.o3 = O3.create(oc, o3Callbacks()); }
      catch (err) { S.o3 = null; if (root.console) root.console.warn('[LighthuggerScreens] 3D chronoscope unavailable', err); }
    }
    if (oc && !S.o3) {
      function hitOrbitBody(x, y) {
        var V = S.orbitView, best = null, bd = 24;
        (V.hits || []).forEach(function (hh) {
          var d = Math.hypot(hh.x - x, hh.y - y);
          if (d < bd) { bd = d; best = hh; }
        });
        return best;
      }
      bindPanZoom(oc, function (dx, dy) {
        var V = S.orbitView, sc = V.scale || 1;
        V.panX -= dx / sc; V.panY += dy / sc; V.dirty = true;
      }, function (k, cx, cy) {
        var V = S.orbitView, r = oc.getBoundingClientRect(), sc = V.scale || 1;
        var wx = V.panX + (cx - r.left - r.width / 2) / sc, wy = V.panY - (cy - r.top - r.height / 2) / sc;
        V.zoom = clamp(V.zoom * k, 0.05, 5e5);
        var sc2 = sc * k;
        V.panX = wx - (cx - r.left - r.width / 2) / sc2; V.panY = wy + (cy - r.top - r.height / 2) / sc2;
        V.dirty = true;
      }, function (e) {
        var V = S.orbitView, r = oc.getBoundingClientRect();
        var x = e.clientX - r.left, y = e.clientY - r.top;
        var hit = hitOrbitBody(x, y);
        var host = $('lh-target-list');
        if (hit) {
          if (V.soi !== (S.snap.orbit && S.snap.orbit.focusSoi)) call('setFocusSoi', V.soi);
          S.selTarget = hit.id; S.cache.tgtAt = 0; V.dirty = true;
          if (host) host.__key = '';
          call('selectTargetOrbit', hit.id);
          setOrbitHint('PLOTTED ' + hit.label + MID + 'TAP FLIP-BURN OR EXEC & WATCH');
          return;
        }
        var sc = V.scale || 1;
        var wx = V.panX + (x - (V.w || r.width) / 2) / sc;
        var wy = V.panY - (y - (V.h || r.height) / 2) / sc;
        var rKm = Math.hypot(wx, wy);
        if (rKm > (V.bodyRadiusKm || 1) * 1.04) {
          if (V.soi !== (S.snap.orbit && S.snap.orbit.focusSoi)) call('setFocusSoi', V.soi);
          S.selTarget = 'custom'; S.cache.tgtAt = 0; V.dirty = true;
          if (host) host.__key = '';
          call('selectCustomOrbit', rKm);
          setOrbitHint('CUSTOM ORBIT ALT ' + fmtKm(rKm - (V.bodyRadiusKm || 0)) + MID + 'EXEC & WATCH TO MATCH');
        }
      });
      oc.addEventListener('pointermove', function (e) {
        var V = S.orbitView, r = oc.getBoundingClientRect();
        var x = e.clientX - r.left, y = e.clientY - r.top;
        V.hover = { x: x, y: y };
        var hit = hitOrbitBody(x, y);
        oc.style.cursor = hit ? 'pointer' : 'crosshair';
        V.dirty = true;
      });
      oc.addEventListener('pointerleave', function () {
        S.orbitView.hover = null;
        oc.style.cursor = 'crosshair';
        S.orbitView.dirty = true;
      });
      oc.addEventListener('dblclick', function (e) {
        var r = oc.getBoundingClientRect();
        var hit = hitOrbitBody(e.clientX - r.left, e.clientY - r.top);
        if (hit && hit.kind === 'planet' && Number.isInteger(hit.planetIdx)) {
          S.orbitSoi = 'planet';
          S.orbitView.zoom = 1; S.orbitView.panX = S.orbitView.panY = 0; S.orbitView.dirty = true;
          S.cache.tgtAt = 0;
          call('setFocusSoi', 'planet', hit.planetIdx);
          return;
        }
        S.orbitView.zoom = 1; S.orbitView.panX = S.orbitView.panY = 0; S.orbitView.dirty = true;
      });
    }
    var skymap = $('lh-skymap-svg');
    if (skymap) {
      skymap.addEventListener('click', function (e) {
        var r = skymap.getBoundingClientRect();
        if (!(r.width > 0 && r.height > 0)) return;
        var sx = (e.clientX - r.left) / r.width * 236, sy = (e.clientY - r.top) / r.height * 112;
        var dBow = Math.hypot(sx - 60, sy - 56), dStern = Math.hypot(sx - 176, sy - 56);
        var stern = dStern < dBow, cx = stern ? 176 : 60, cy = 56, rad = 48;
        var dx = sx - cx, dy = sy - cy, dist = Math.min(rad, Math.hypot(dx, dy));
        var theta = stern ? (180 - (dist / rad) * 90) : ((dist / rad) * 90);
        var phi = (Math.atan2((stern ? -dx : dx), -dy) * 180 / Math.PI + 360) % 360;
        call('aimSextantAt', theta, phi);
      });
    }
    var sc = $('lh-starmap-canvas');
    if (sc) {
      bindPanZoom(sc, function (dx, dy, e) {
        var St = S.star;
        if (e && e.shiftKey) St.tilt = clamp(St.tilt + dy * 0.007, -Math.PI / 2, Math.PI / 2);
        else { St.yaw -= dx * 0.007; St.tilt = clamp(St.tilt + dy * 0.0055, -Math.PI / 2, Math.PI / 2); }
        St.dirty = true;
        setPressed($('btn-star-flat'), Math.abs(St.tilt) > 1.5);
        drawStarmap(S.snap, true);
      }, function (k) {
        var St = S.star;
        if (St.scale === 'milkyway') {
          St.mwZoom = clamp((St.mwZoom || 1) * k, 0.55, 8);
          if (St.mwZoom > 6.5 && k > 1) {
            St.scale = 'linear'; St.zoom = 0.55;
            qa('[data-starscale]').forEach(function (b) { setPressed(b, b.dataset.starscale === St.scale); });
          }
          St.dirty = true;
          drawStarmap(S.snap, true);
          return;
        }
        St.zoom = clamp(St.zoom * k, 0.22, 40);
        if (St.zoom < 0.28 && k < 1) {
          St.scale = 'milkyway'; St.mwZoom = 1.6;
          qa('[data-starscale]').forEach(function (b) { setPressed(b, b.dataset.starscale === St.scale); });
        }
        St.dirty = true;
        drawStarmap(S.snap, true);
      }, function (e) {
        var r = sc.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, best = null, bd = 22;
        S.star.hits.forEach(function (hh) { var d = Math.hypot(hh.x - x, hh.y - y); if (d < bd) { bd = d; best = hh.id; } });
        if (best) pickStar(best);
      });
    }
    var hdr = doc.querySelector('.header-bar');
    function measure() {
      var sb = $('lh-screenbar');
      if (sb) {
        var sbW = Math.round(sb.getBoundingClientRect().width);
        if (sbW > 120) doc.documentElement.style.setProperty('--lh-sb-w', sbW + 'px');
      }
      if (!hdr || (root.getComputedStyle && root.getComputedStyle(hdr).display === 'none')) {
        doc.documentElement.style.setProperty('--lh-hdr-h', '0px');
      } else {
        var b = hdr.getBoundingClientRect().bottom;
        if (b >= 0 && b < 140) doc.documentElement.style.setProperty('--lh-hdr-h', Math.round(b) + 'px');
      }
      S.orbitView.dirty = true; S.star.dirty = true;
    }
    root.addEventListener('resize', measure);
    measure();
    setTimeout(measure, 600);
  }
  var planTimer = 0;
  function planChanged() {
    S.star.dirty = true;
    S.cache.planKey = '';
    syncStarPanel(S.snap);
    clearTimeout(planTimer);
    planTimer = setTimeout(function () {
      call('plotStarCourse', { accelG: S.accelG, betaCap: S.betaCap < 0.999 ? S.betaCap : null, destId: S.star.sel });
    }, 180);
  }
  function switchTab(attr, panelAttr, val) {
    if (attr === 'dtab') S.dtab = val;
    else if (attr === 'cztab') S.cztab = val;
    else if (attr === 'atab') S.atab = val;
    else S.mtab = val;
    qa('[data-' + attr + ']').forEach(function (b) { b.setAttribute('aria-selected', b.dataset[attr] === val ? 'true' : 'false'); });
    qa('[data-' + panelAttr + ']').forEach(function (p) { setHidden(p, p.dataset[panelAttr] !== val); });
  }

  // ---------------------------------------------------------------- API
  function init(actions) {
    A = actions && typeof actions === 'object' ? actions : {};
    if (!S.inited) {
      S.inited = true;
      loadTutorialPrefs();
      bindDom();
      setPhotoMode(false);
      setAudioPopOpen(false);
      syncTutorialControls();
      buildCustomizer();
      buildDrydock();
      var main = $('main');
      var start = (main && main.dataset.screen) || 'menu';
      S.screen = null;
      showScreen(start, true);
      setKgOpen(root.innerWidth > 680);
      renderSysList();
      if (S.tutorialShowOnLaunch && !(root.location && /notutorial=1/.test(root.location.search || ''))) {
        setTutorialOpen(true, 0);
      }
      root.requestAnimationFrame(idleLoop);
    }
    return api;
  }
  function idleLoop() {
    // Keeps overlay canvases alive if the app is not ticking sync() (e.g. paused or failed).
    if (performance.now() - S.lastSyncAt > 400) {
      if (S.screen === 'orbits') drawOrbits(S.snap, false);
      if (S.screen === 'starmap') { if (performance.now() - (S.cache.idlePanelAt || 0) > 300) { S.cache.idlePanelAt = performance.now(); syncStarPanel(S.snap); } drawStarmap(S.snap, false); }
    }
    root.requestAnimationFrame(idleLoop);
  }
  function syncNoticePlacement() {
    var sb = $('lh-screenbar');
    if (sb) {
      var sbW = Math.round(sb.getBoundingClientRect().width);
      if (sbW > 120) {
        var sbStr = sbW + 'px';
        if (doc.documentElement.style.getPropertyValue('--lh-sb-w') !== sbStr) {
          doc.documentElement.style.setProperty('--lh-sb-w', sbStr);
        }
      }
    }
    var stack = $('lh-notice-stack'), main = $('main');
    if (!stack || !main) return;
    if (S.screen === 'helm') {
      if (stack.style.getPropertyValue('--lh-notice-top')) stack.style.removeProperty('--lh-notice-top');
      return;
    }
    var topBanner = S.screen === 'sextant' ? $('lh-sx-banner')
      : S.screen === 'orbits' ? doc.querySelector('#lh-screen-orbits .kg-chrono-top')
      : S.screen === 'drydock' ? doc.querySelector('#lh-screen-drydock .lh-drawer-cams')
      : null;
    if (topBanner && !topBanner.hidden) {
      var mr = main.getBoundingClientRect(), br = topBanner.getBoundingClientRect();
      if (br.height > 0 && mr.height > 0) {
        var nextTop = Math.ceil(br.bottom - mr.top + 8) + 'px';
        if (stack.style.getPropertyValue('--lh-notice-top') !== nextTop) {
          stack.style.setProperty('--lh-notice-top', nextTop);
        }
        return;
      }
    }
    if (stack.style.getPropertyValue('--lh-notice-top')) stack.style.removeProperty('--lh-notice-top');
  }

  function syncWreckOverlay(s) {
    var box = $('lh-wreck-overlay');
    if (!box) return;
    var lost = Boolean(s && s.destroyed && S.screen === 'helm');
    setHidden(box, !lost);
    if (!lost) return;
    setText($('lh-wreck-reason'), s.destroyedReason || 'Catastrophic impact or hull breach.');
    var sysName = upper(s.systemName || 'SOL');
    var ep = 'EPOCH ' + num(s.epochYear, 2370).toFixed(2);
    var kills = num(s.combat && s.combat.kills, 0);
    setText($('lh-wreck-meta'), sysName + MID + ep + (kills > 0 ? (MID + 'KILLS ' + kills) : ''));
  }

  function sync(snap) {
    if (!S.inited) init(A);
    var s = snap && typeof snap === 'object' ? snap : {};
    S.snap = s;
    syncWreckOverlay(s);
    var abortBtn = $('btn-abort-transit');
    setText(abortBtn, s.reversibleDrive === false ? 'ABORT / FLIP & BRAKE' : 'ABORT / REV BRAKE');
    setDisabled(abortBtn, !(inTransit(s) || (s.multiHop && s.multiHop.active)));
    S.lastSyncAt = performance.now();
    if (s.started != null && s.started) S.started = true;
    if (s.screen && s.screen !== S.lastSnapScreen) {
      S.lastSnapScreen = s.screen;
      if (s.screen !== S.screen) showScreen(s.screen, true);
    }
    if (s.toast && s.toast.seq != null && s.toast.seq !== S.toastSeq) { S.toastSeq = s.toast.seq; showToast(s.toast); }
    syncNoticePlacement();
    syncDeepSpace(s);
    switch (S.screen) {
      case 'helm':
        syncTelemetry(s); syncHelmStrip(s); syncWarning(s); syncHarvestBar(s); syncWpnPod(s); syncKg(s); syncRelControls(s); syncLabels(s); drawFlightHud(s);
        break;
      case 'menu': syncMenu(s); break;
      case 'orbits':
        if (!s.inDeepSpace) { syncOrbit3D(s, false); syncOrbitPanel(s); S.orbitView.dirty = true; drawOrbits(s, false); }
        break;
      case 'starmap': syncStarPanel(s); S.star.dirty = S.star.dirty || inTransit(s); drawStarmap(s, false); break;
      case 'drydock': syncDrydock(s); break;
      case 'sextant': syncSextant(s); syncWpnPod(s); syncKg(s); syncLabels(s); break;
      case 'archive': syncArchive(s); break;
    }
    if (S.settingsOpen) syncSettings(s);
    else if (S.audioPopOpen) syncAudioUi(s);
    else {
      var audBtn = $('btn-audio-toggle');
      if (audBtn && s.audio) {
        var wantMuted = s.audio.enabled === false ? '1' : '0';
        if (audBtn.getAttribute('data-muted') !== wantMuted) syncAudioUi(s);
      }
    }
  }

  var api = {
    init: init,
    sync: sync,
    getScreen: function () { return S.screen; },
    setScreen: function (name) { showScreen(name, true); },
    isScopeVisible: isScopeVisible,
    isKgOpen: function () { return S.kgOpen; },
    setPhotoMode: setPhotoMode,
    isPhotoMode: function () { return S.photoMode; },
    setAudioPopOpen: setAudioPopOpen,
    getDeckClearPx: function () { var el = $('lh-bottom'); return S.screen === 'helm' && el ? Math.round(el.getBoundingClientRect().height) : 0; },
    setLoaded: function () { var el = $('lh-boot-loader'); if (el) el.classList.add('is-loaded'); },
    setKgOpen: setKgOpen,
    toast: showToast,
    flash: flash,
    getSelectedTargetId: function () { return S.selTarget; },
    getSelectedStarId: function () { return S.star.sel; },
    getPlanSettings: function () { return { accelG: S.accelG, betaCap: S.betaCap < 0.999 ? S.betaCap : null }; },
    setTutorialOpen: setTutorialOpen,
    getTutorialState: function () { return { open: S.tutorialOpen, step: S.tutorialStep, total: TUTORIAL_STEPS.length, showOnLaunch: S.tutorialShowOnLaunch }; },
    getStarmapView: function () { return { yaw: S.star.yaw, tilt: S.star.tilt, zoom: S.star.zoom, mwZoom: S.star.mwZoom, scale: S.star.scale }; }
  };
  root.LighthuggerScreens = api;
  root.setTimeout(function () { api.setLoaded(); }, 12000);

  // Standalone fallback: if the app never calls init, keep navigation working.
  function autoInit() { if (!S.inited) init({}); }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', function () { setTimeout(autoInit, 0); });
  else setTimeout(autoInit, 0);
})(typeof window !== 'undefined' ? window : this);
