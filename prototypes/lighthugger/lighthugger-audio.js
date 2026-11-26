/** Live Web Audio API engine for Lighthugger using offline-processed NASA PD stems.
 * Loads manifest.json + stems/*, maps telemetry snapshots to continuous loop gains/filters/pitch,
 * convolves space/ship layers through ir-hull.wav, and triggers event SFX cleanly.
 * Safe in headless Node/DOM environments and suspended-autoplay browsers.
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LighthuggerAudio = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  var STORAGE_KEY = 'lh_audio_v1';
  var DEFAULT_CONFIG = {
    enabled: true,
    master: 0.78,
    music: 0.68,
    drive: 0.78,
    ambience: 0.32,
    ui: 0.85,
    reverb: true
  };

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function num(v, d) {
    var n = Number(v);
    return Number.isFinite(n) ? n : d;
  }

  function normalizeConfig(patch, prev) {
    var base = prev && typeof prev === 'object' ? prev : DEFAULT_CONFIG;
    var p = patch && typeof patch === 'object' ? patch : {};
    return {
      enabled: p.enabled != null ? Boolean(p.enabled) : (base.enabled != null ? Boolean(base.enabled) : DEFAULT_CONFIG.enabled),
      master: clamp(num(p.master != null ? p.master : base.master, DEFAULT_CONFIG.master), 0, 1),
      music: clamp(num(p.music != null ? p.music : base.music, DEFAULT_CONFIG.music), 0, 1),
      drive: clamp(num(p.drive != null ? p.drive : base.drive, DEFAULT_CONFIG.drive), 0, 1),
      ambience: clamp(num(p.ambience != null ? p.ambience : base.ambience, DEFAULT_CONFIG.ambience), 0, 1),
      ui: clamp(num(p.ui != null ? p.ui : base.ui, DEFAULT_CONFIG.ui), 0, 1),
      reverb: p.reverb != null ? Boolean(p.reverb) : (base.reverb != null ? Boolean(base.reverb) : DEFAULT_CONFIG.reverb)
    };
  }

  function loadStoredConfig() {
    var cfg = normalizeConfig(null, DEFAULT_CONFIG);
    try {
      var ls = root && root.localStorage;
      if (ls) {
        var raw = ls.getItem(STORAGE_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          // Migrate Round 13 stored configs without overwriting deliberate custom slider choices
          if (parsed && typeof parsed === 'object' && parsed.music == null) {
            if (parsed.ambience === 0.72) parsed.ambience = DEFAULT_CONFIG.ambience;
            if (parsed.ui === 0.75) parsed.ui = DEFAULT_CONFIG.ui;
            if (parsed.master === 0.75) parsed.master = DEFAULT_CONFIG.master;
            parsed.music = DEFAULT_CONFIG.music;
          }
          cfg = normalizeConfig(parsed, DEFAULT_CONFIG);
        }
      }
    } catch (e) { /* Storage unavailable */ }
    return cfg;
  }

  function saveStoredConfig(cfg) {
    try {
      var ls = root && root.localStorage;
      if (ls) ls.setItem(STORAGE_KEY, JSON.stringify(cfg));
    } catch (e) { /* Storage unavailable */ }
  }

  function computeMixTargets(snap, config) {
    var s = snap && typeof snap === 'object' ? snap : {};
    var cfg = normalizeConfig(config, DEFAULT_CONFIG);
    var screen = String(s.screen || s.view || 'helm');
    var docked = Boolean(s.docked);
    var mode = String(s.mode || (docked ? 'docked' : 'orbit'));
    var inDeepSpace = Boolean(s.inDeepSpace);
    var inIstl = mode === 'interstellar' || inDeepSpace;

    var masterGain = cfg.enabled ? cfg.master : 0;
    var reverbWet = cfg.reverb ? 0.36 : 0;
    var screenScale = screen === 'menu' ? 0.60 : (screen === 'manual' || screen === 'archive') ? 0.72 : 1.0;

    var rawThrust = s.thrustG != null ? s.thrustG : s.thrustCmdG;
    var thrustMag = Math.min(4.5, Math.abs(num(rawThrust, 0)));
    var burnDuck = 1 - 0.18 * clamp(thrustMag / 3.0, 0, 1);

    var combat = s.combat && typeof s.combat === 'object' ? s.combat : {};
    var alertS = num(combat.alertS, 0);
    var hostileCount = num(combat.hostileCount, 0);
    var wpnArmed = Boolean(s.hud && s.hud.weapons);
    var destroyed = Boolean(s.destroyed);
    var combatMix = destroyed ? 0 : (hostileCount > 0 || alertS > 0.5 ? 1.0 : (wpnArmed ? 0.28 : 0));
    var musicCalmScale = destroyed ? 0.20 : (1 - 0.85 * combatMix);

    var musicOrbitalGain = (!inIstl ? 0.44 : 0) * musicCalmScale * screenScale * burnDuck * cfg.music;
    var musicIstlGain = (inIstl ? 0.46 : 0) * musicCalmScale * screenScale * burnDuck * cfg.music;
    var musicCombatGain = (combatMix * 0.48) * screenScale * burnDuck * cfg.music;

    var cabinBase = docked ? 0.28 : (screen === 'drydock' ? 0.24 : (screen === 'menu' ? 0.18 : 0.11));
    var cabinGain = cabinBase * screenScale * cfg.drive;
    var planetGain = (!inIstl ? 0.34 : 0) * screenScale * cfg.ambience;
    var istlGain = (inIstl ? 0.36 : 0) * screenScale * cfg.ambience;

    var beta = clamp(num(s.beta, 0), 0, 0.999999);
    var gamma = Math.max(1, num(s.gamma, 1));
    var rel = clamp((beta - 0.015) / 0.975, 0, 1);
    var logG = clamp(Math.log1p(Math.max(0, gamma - 1)) / 3.2, 0, 1);
    var sheathGain = (beta > 0.015 ? clamp(0.05 + 0.38 * rel + 0.16 * logG, 0, 0.56) : 0) * screenScale * cfg.ambience;
    var sheathRate = 0.85 + 0.55 * rel + 0.25 * logG;
    var sheathCutoff = 900 + 5800 * rel + 1800 * logG;

    var coreHeatRaw = s.thermal && s.thermal.coreHeat != null ? s.thermal.coreHeat : s.coreHeat;
    var heat = clamp(num(coreHeatRaw, 0), 0, 1);
    var driveGain = (docked || destroyed || thrustMag < 0.005
      ? 0
      : clamp(0.20 * Math.sqrt(thrustMag) + 0.26 * Math.min(thrustMag, 2.5) / 2.5, 0, 0.76)) * screenScale * cfg.drive;
    var driveRate = clamp(
      0.72 + 0.34 * Math.min(thrustMag, 3.0) / 3.0 + 0.16 * heat + (s.deckGSign === -1 ? -0.08 : 0),
      0.55,
      1.6
    );
    var driveCutoff = 260 + 1800 * Math.min(thrustMag, 2.5) / 2.5 + 1400 * heat;

    var rt = Array.isArray(s.rcsTorque) ? s.rcsTorque : [0, 0, 0];
    var rcsMag = Math.hypot(num(rt[0], 0), num(rt[1], 0), num(rt[2], 0));
    var rcsGain = (docked || destroyed || rcsMag < 0.02 ? 0 : clamp(rcsMag * 0.42, 0, 0.44)) * screenScale * cfg.drive;
    var rcsRate = 0.96 + 0.14 * Math.min(rcsMag, 1.3);
    var rcsCutoff = 2400 + 2200 * Math.min(rcsMag, 1.2);

    var harvestActive = Boolean((s.iceHarvest && s.iceHarvest.active) || (s.multiHop && s.multiHop.harvesting));
    var harvestGain = (harvestActive && !destroyed ? 0.34 : 0) * screenScale * cfg.drive;

    return {
      masterGain: masterGain,
      reverbWet: reverbWet,
      screenScale: screenScale,
      musicOrbitalGain: musicOrbitalGain,
      musicIstlGain: musicIstlGain,
      musicCombatGain: musicCombatGain,
      cabinGain: cabinGain,
      planetGain: planetGain,
      istlGain: istlGain,
      sheathGain: sheathGain,
      sheathRate: sheathRate,
      sheathCutoff: sheathCutoff,
      driveGain: driveGain,
      driveRate: driveRate,
      driveCutoff: driveCutoff,
      rcsGain: rcsGain,
      rcsRate: rcsRate,
      rcsCutoff: rcsCutoff,
      harvestGain: harvestGain,
      uiGain: cfg.ui
    };
  }

  function create(opts) {
    var options = opts && typeof opts === 'object' ? opts : {};
    var baseUrl = String(options.baseUrl || 'prototypes/lighthugger/audio/');
    if (baseUrl.slice(-1) !== '/') baseUrl += '/';

    var config = loadStoredConfig();
    var AudioCtx = root && (root.AudioContext || root.webkitAudioContext);
    var fetchFn = root && typeof root.fetch === 'function' ? root.fetch.bind(root) : null;
    var supported = Boolean(AudioCtx && fetchFn && root && root.document);

    var ctx = null;
    var masterGain = null;
    var compressor = null;
    var dryGain = null;
    var wetGain = null;
    var convolver = null;
    var sfxBus = null;
    var uiBus = null;

    var buffers = {};
    var loopNodes = {};
    var activeVoices = 0;
    var manifestLoaded = false;
    var convolverReady = false;
    var stemsTotal = 0;
    var stemsLoaded = 0;
    var stemsFailed = 0;
    var preloadPromise = null;
    var gestureBound = false;
    var lastTargets = computeMixTargets({}, config);
    var lastEvent = null;

    var hasBaseline = false;
    var prev = {
      weaponSeq: 0,
      enemyWeaponSeq: 0,
      pdcSeq: 0,
      explosionSeq: 0,
      playerHitSeq: 0,
      destroyed: false,
      docked: null,
      impactAt: null,
      ringAt: null,
      hailKey: '',
      toastSeq: 0,
      burnFiring: false,
      caution: false,
      lastCautionMs: 0,
      hazard: false,
      lastAlarmMs: 0
    };

    function nowMs() {
      return root && root.performance && typeof root.performance.now === 'function'
        ? root.performance.now()
        : Date.now();
    }

    function setParam(param, value, tau) {
      if (!param || !ctx || !Number.isFinite(value)) return;
      var t = ctx.currentTime;
      try {
        param.setTargetAtTime(value, t, tau || 0.14);
      } catch (e) {
        param.value = value;
      }
    }

    function ensureGraph() {
      if (!supported || ctx) return Boolean(ctx);
      try {
        ctx = new AudioCtx();
        masterGain = ctx.createGain();
        masterGain.gain.value = config.enabled ? config.master : 0;

        compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -14;
        compressor.knee.value = 18;
        compressor.ratio.value = 3.5;
        compressor.attack.value = 0.008;
        compressor.release.value = 0.18;

        dryGain = ctx.createGain();
        dryGain.gain.value = 1.0;

        convolver = ctx.createConvolver();
        convolver.normalize = false;
        wetGain = ctx.createGain();
        wetGain.gain.value = config.reverb ? 0.34 : 0;

        sfxBus = ctx.createGain();
        sfxBus.gain.value = 1.0;
        var sfxVerbSend = ctx.createGain();
        sfxVerbSend.gain.value = 0.24;
        sfxBus.connect(dryGain);
        sfxBus.connect(sfxVerbSend);
        sfxVerbSend.connect(convolver);

        uiBus = ctx.createGain();
        uiBus.gain.value = config.ui;
        uiBus.connect(dryGain);

        dryGain.connect(masterGain);
        convolver.connect(wetGain);
        wetGain.connect(masterGain);
        masterGain.connect(compressor);
        compressor.connect(ctx.destination);
      } catch (e) {
        supported = false;
        ctx = null;
        return false;
      }
      return true;
    }

    function startLoopStem(entry, buf) {
      if (!ctx || !buf || loopNodes[entry.id]) return;
      try {
        var src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        var dur = buf.duration || entry.durationSec || 0;
        if (dur > 0.4 && Number.isFinite(entry.loopStart) && Number.isFinite(entry.loopEnd)) {
          var ls = clamp(entry.loopStart, 0, Math.max(0, dur - 0.1));
          var le = clamp(entry.loopEnd, ls + 0.05, dur);
          src.loopStart = ls;
          src.loopEnd = le;
        }

        var filter = null;
        if (entry.id === 'stem-drive' || entry.id === 'bed-sheath') {
          filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = entry.id === 'stem-drive' ? 600 : 2200;
          filter.Q.value = entry.id === 'stem-drive' ? 0.85 : 0.7;
        } else if (entry.id === 'stem-rcs') {
          filter = ctx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.value = 3200;
          filter.Q.value = 0.65;
        }

        var gain = ctx.createGain();
        gain.gain.value = 0;

        if (filter) {
          src.connect(filter);
          filter.connect(gain);
        } else {
          src.connect(gain);
        }
        gain.connect(dryGain);

        if (entry.kind !== 'music' && entry.id !== 'bed-cabin') {
          var revSend = ctx.createGain();
          revSend.gain.value = entry.id === 'bed-planetary' || entry.id === 'bed-interstellar' ? 0.20 : 0.14;
          gain.connect(revSend);
          revSend.connect(convolver);
        }

        src.start(0);
        loopNodes[entry.id] = { src: src, gain: gain, filter: filter, kind: entry.kind };
      } catch (e) { /* Ignore start failure cleanly */ }
    }

    function onUserGesture() {
      if (!ctx) return;
      if (ctx.state === 'running') {
        unbindGestures();
        return;
      }
      unlock();
    }

    function bindGestures() {
      if (gestureBound || !root || !root.addEventListener) return;
      gestureBound = true;
      root.addEventListener('pointerdown', onUserGesture, { capture: true, passive: true });
      root.addEventListener('keydown', onUserGesture, { capture: true, passive: true });
      root.addEventListener('click', onUserGesture, { capture: true, passive: true });
    }

    function unbindGestures() {
      if (!gestureBound || !root || !root.removeEventListener) return;
      gestureBound = false;
      root.removeEventListener('pointerdown', onUserGesture, { capture: true });
      root.removeEventListener('keydown', onUserGesture, { capture: true });
      root.removeEventListener('click', onUserGesture, { capture: true });
    }

    function unlock() {
      if (!ensureGraph()) return Promise.resolve(false);
      if (ctx.state === 'running') {
        unbindGestures();
        return Promise.resolve(true);
      }
      try {
        var p = ctx.resume();
        if (p && typeof p.then === 'function') {
          return p.then(function () {
            if (ctx && ctx.state === 'running') unbindGestures();
            return Boolean(ctx && ctx.state === 'running');
          }, function () {
            return false;
          });
        }
      } catch (e) {
        return Promise.resolve(false);
      }
      return Promise.resolve(ctx.state === 'running');
    }

    function decodeArrayBuffer(arrBuf) {
      return new Promise(function (resolve, reject) {
        try {
          var p = ctx.decodeAudioData(arrBuf, resolve, reject);
          if (p && typeof p.then === 'function') p.then(resolve, reject);
        } catch (e) {
          reject(e);
        }
      });
    }

    function preload() {
      if (!supported) return Promise.resolve(false);
      if (preloadPromise) return preloadPromise;
      if (!ensureGraph()) return Promise.resolve(false);
      bindGestures();

      preloadPromise = fetchFn(baseUrl + 'manifest.json', { cache: 'default' })
        .then(function (resp) {
          if (!resp || !resp.ok) throw new Error('Manifest HTTP ' + (resp ? resp.status : 'error'));
          return resp.json();
        })
        .then(function (manifest) {
          var stems = manifest && Array.isArray(manifest.stems) ? manifest.stems : [];
          manifestLoaded = true;
          stemsTotal = stems.length;
          return Promise.all(stems.map(function (entry) {
            return fetchFn(baseUrl + entry.file, { cache: 'default' })
              .then(function (r) {
                if (!r || !r.ok) throw new Error('Stem HTTP ' + (r ? r.status : 'error'));
                return r.arrayBuffer();
              })
              .then(decodeArrayBuffer)
              .then(function (buf) {
                buffers[entry.id] = buf;
                stemsLoaded++;
                if (entry.kind === 'ir') {
                  if (convolver && !convolver.buffer) convolver.buffer = buf;
                  convolverReady = true;
                } else if (entry.kind === 'loop' || entry.kind === 'music') {
                  startLoopStem(entry, buf);
                }
              })
              .catch(function () {
                stemsFailed++;
              });
          }));
        })
        .then(function () {
          applyMixParams(lastTargets);
          return stemsFailed === 0 && stemsLoaded > 0;
        })
        .catch(function () {
          return false;
        });

      return preloadPromise;
    }

    function applyMixParams(targets) {
      if (!ctx) return;
      setParam(masterGain.gain, targets.masterGain, 0.08);
      setParam(wetGain.gain, targets.reverbWet, 0.14);
      setParam(uiBus.gain, targets.uiGain, 0.08);

      var map = [
        ['music-orbital', targets.musicOrbitalGain, null, null, 0.65],
        ['music-interstellar', targets.musicIstlGain, null, null, 0.65],
        ['music-combat', targets.musicCombatGain, null, null, 0.55],
        ['bed-cabin', targets.cabinGain, null, null, 0.16],
        ['bed-planetary', targets.planetGain, null, null, 0.16],
        ['bed-interstellar', targets.istlGain, null, null, 0.16],
        ['bed-sheath', targets.sheathGain, targets.sheathRate, targets.sheathCutoff, 0.16],
        ['stem-drive', targets.driveGain, targets.driveRate, targets.driveCutoff, 0.16],
        ['stem-rcs', targets.rcsGain, targets.rcsRate, targets.rcsCutoff, 0.045],
        ['stem-harvest', targets.harvestGain, null, null, 0.16]
      ];
      for (var i = 0; i < map.length; i++) {
        var row = map[i];
        var node = loopNodes[row[0]];
        if (!node) continue;
        setParam(node.gain.gain, row[1], row[4]);
        if (row[2] != null) setParam(node.src.playbackRate, row[2], 0.18);
        if (row[3] != null && node.filter) setParam(node.filter.frequency, row[3], 0.16);
      }
    }

    function triggerBuffer(stemId, gainVal, rate, bus, verbSend) {
      lastEvent = { id: stemId, gain: gainVal, rate: rate, at: nowMs() };
      if (!ctx || ctx.state !== 'running' || !config.enabled) return false;
      var buf = buffers[stemId];
      if (!buf) return false;
      try {
        var src = ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = clamp(num(rate, 1), 0.5, 2.0);
        var g = ctx.createGain();
        g.gain.value = clamp(num(gainVal, 0.7), 0, 1.5);
        src.connect(g);
        g.connect(bus || sfxBus);
        var extraSend = null;
        if (verbSend > 0 && convolver) {
          extraSend = ctx.createGain();
          extraSend.gain.value = verbSend;
          g.connect(extraSend);
          extraSend.connect(convolver);
        }
        activeVoices++;
        src.onended = function () {
          activeVoices = Math.max(0, activeVoices - 1);
          try { src.disconnect(); g.disconnect(); if (extraSend) extraSend.disconnect(); } catch (e) {}
        };
        src.start();
        return true;
      } catch (e) {
        return false;
      }
    }

    function update(snap, dt) {
      var s = snap && typeof snap === 'object' ? snap : {};
      var targets = computeMixTargets(s, config);
      lastTargets = targets;
      applyMixParams(targets);

      var wSeq = s.weaponEvent && s.weaponEvent.seq != null ? Number(s.weaponEvent.seq) : 0;
      var combatObj = s.combat && typeof s.combat === 'object' ? s.combat : {};
      var ewEv = combatObj.enemyWeaponEvent || null;
      var ewSeq = ewEv && ewEv.seq != null ? Number(ewEv.seq) : 0;
      var pdcEv = combatObj.pdcEvent || null;
      var pdcSeq = pdcEv && pdcEv.seq != null ? Number(pdcEv.seq) : 0;
      var exEv = combatObj.explosionEvent || null;
      var exSeq = exEv && exEv.seq != null ? Number(exEv.seq) : 0;
      var hitSeq = combatObj.playerHitSeq != null ? Number(combatObj.playerHitSeq) : 0;
      var destroyed = Boolean(s.destroyed);
      var damageState = String(s.damageState || 'nominal');

      var docked = Boolean(s.docked);
      var impAt = s.lastImpact && s.lastImpact.at != null ? Number(s.lastImpact.at) : null;
      var ringAt = s.lastRingCrossing && s.lastRingCrossing.at != null ? Number(s.lastRingCrossing.at) : null;
      var hailObj = s.sextant && s.sextant.hail;
      var hailKey = hailObj ? String(hailObj.contactId || hailObj.id || hailObj.name || '1') : '';
      var tSeq = s.toast && s.toast.seq != null ? Number(s.toast.seq) : 0;
      var burnFiring = Boolean(s.burn && s.burn.firing);
      var warnObj = s.warning && typeof s.warning === 'object' ? s.warning : null;
      var warnLevel = warnObj && warnObj.level ? String(warnObj.level) : '';
      var warnSrc = warnObj && warnObj.source ? String(warnObj.source) : '';
      var thermalState = s.thermal && s.thermal.state ? s.thermal.state : s.thermalState;
      var spinG = num(s.spinG, 0);
      var hazard = Boolean(
        !destroyed && (
          damageState === 'critical' ||
          thermalState === 'critical' ||
          warnLevel === 'critical' ||
          warnSrc === 'atmo' ||
          s.emergencyBraking ||
          spinG >= 2.2
        )
      );
      var caution = Boolean(
        !destroyed && !hazard && (
          damageState === 'damaged' ||
          thermalState === 'hot' || thermalState === 'warm' ||
          warnLevel === 'warn' || warnLevel === 'caution' ||
          spinG >= 1.45
        )
      );

      if (!hasBaseline) {
        hasBaseline = true;
        prev.weaponSeq = wSeq;
        prev.enemyWeaponSeq = ewSeq;
        prev.pdcSeq = pdcSeq;
        prev.explosionSeq = exSeq;
        prev.playerHitSeq = hitSeq;
        prev.destroyed = destroyed;
        prev.docked = docked;
        prev.impactAt = impAt;
        prev.ringAt = ringAt;
        prev.hailKey = hailKey;
        prev.toastSeq = tSeq;
        prev.burnFiring = burnFiring;
        prev.caution = caution;
        prev.hazard = hazard;
        return targets;
      }

      if (wSeq > 0 && wSeq !== prev.weaponSeq) {
        prev.weaponSeq = wSeq;
        var ev = s.weaponEvent || {};
        if (ev.kind === 'missile') {
          playUi('missile');
        } else if (ev.mode === 'relativistic') {
          var gBoost = Math.max(1, num(ev.gammaBoost || s.gamma, 1));
          triggerBuffer('sfx-wpn-relativistic', 0.85, clamp(0.92 + Math.log1p(gBoost) * 0.08, 0.9, 1.35), sfxBus, 0);
        } else {
          triggerBuffer('sfx-wpn-newtonian', 0.80, 0.96 + (wSeq % 3) * 0.04, sfxBus, 0);
        }
      }

      if (ewSeq > 0 && ewSeq !== prev.enemyWeaponSeq) {
        prev.enemyWeaponSeq = ewSeq;
        triggerBuffer(ewEv && ewEv.rel ? 'sfx-wpn-relativistic' : 'sfx-wpn-newtonian', 0.52, 0.78 + (ewSeq % 2) * 0.05, sfxBus, 0.06);
      }

      if (pdcSeq > 0 && pdcSeq !== prev.pdcSeq) {
        prev.pdcSeq = pdcSeq;
        playUi('pdc');
      }

      if (exSeq > 0 && exSeq !== prev.explosionSeq) {
        prev.explosionSeq = exSeq;
        var isPl = Boolean(exEv && exEv.isPlayer);
        triggerBuffer('sfx-explosion', isPl ? 0.98 : 0.88, isPl ? 0.88 : 1.04, sfxBus, 0.20);
      }

      if (hitSeq > 0 && hitSeq !== prev.playerHitSeq) {
        prev.playerHitSeq = hitSeq;
        triggerBuffer('sfx-impact', 0.92, 0.92 + (hitSeq % 3) * 0.06, sfxBus, 0.08);
      }
      prev.destroyed = destroyed;

      if (prev.docked !== null && docked !== prev.docked) {
        prev.docked = docked;
        triggerBuffer('sfx-dock-clunk', 0.78, docked ? 0.92 : 1.08, sfxBus, 0);
      }

      if (impAt != null && impAt !== prev.impactAt) {
        prev.impactAt = impAt;
        triggerBuffer('sfx-impact', 0.85, 0.82, sfxBus, 0);
      }

      if (ringAt != null && ringAt !== prev.ringAt) {
        prev.ringAt = ringAt;
        var pit = clamp(num(s.lastRingCrossing && s.lastRingCrossing.pitting, 0), 0, 1);
        triggerBuffer('sfx-impact', 0.42 + 0.34 * pit, 1.28, sfxBus, 0);
      }

      if (hailKey && hailKey !== prev.hailKey) {
        prev.hailKey = hailKey;
        triggerBuffer('sfx-quindar-in', 0.65, 1.0, sfxBus, 0.08);
      } else if (!hailKey) {
        prev.hailKey = '';
      }

      if (tSeq > 0 && tSeq !== prev.toastSeq) {
        prev.toastSeq = tSeq;
        triggerBuffer('sfx-quindar-out', 0.60, 1.0, sfxBus, 0.08);
      }

      if (!prev.burnFiring && burnFiring) {
        triggerBuffer('sfx-ui-toggle', 0.78, 0.90, sfxBus, 0);
      }
      prev.burnFiring = burnFiring;

      var now = nowMs();
      if (hazard && (!prev.hazard || now - prev.lastAlarmMs > 4200)) {
        prev.lastAlarmMs = now;
        triggerBuffer('sfx-alarm', 0.85, 1.0, sfxBus, 0.14);
      } else if (caution && (!prev.caution || now - prev.lastCautionMs > 6000)) {
        prev.lastCautionMs = now;
        triggerBuffer('sfx-warn-caution', 0.82, 1.0, sfxBus, 0.12);
      }
      prev.caution = caution;
      prev.hazard = hazard;

      return targets;
    }

    function playSynthCue(kind) {
      if (!ctx || ctx.state !== 'running' || !config.enabled) return false;
      try {
        var t0 = ctx.currentTime;
        var osc = ctx.createOscillator();
        var g = ctx.createGain();
        if (kind === 'missile') {
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(190, t0);
          osc.frequency.exponentialRampToValueAtTime(52, t0 + 0.34);
          g.gain.setValueAtTime(0.001, t0);
          g.gain.linearRampToValueAtTime(0.20, t0 + 0.03);
          g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.36);
          osc.connect(g); g.connect(sfxBus);
          osc.start(t0); osc.stop(t0 + 0.37);
          lastEvent = { id: 'synth-missile', gain: 0.20, rate: 1, at: nowMs() };
          return true;
        }
        if (kind === 'pdc') {
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(1650, t0);
          osc.frequency.exponentialRampToValueAtTime(380, t0 + 0.11);
          g.gain.setValueAtTime(0.001, t0);
          g.gain.linearRampToValueAtTime(0.16, t0 + 0.008);
          g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
          osc.connect(g); g.connect(sfxBus);
          osc.start(t0); osc.stop(t0 + 0.13);
          lastEvent = { id: 'synth-pdc', gain: 0.16, rate: 1, at: nowMs() };
          return true;
        }
      } catch (e) {}
      return false;
    }

    function playUi(kind) {
      var k = String(kind || 'click');
      if (k === 'missile' || k === 'pdc') return playSynthCue(k);
      if (k === 'toggle') return triggerBuffer('sfx-ui-toggle', 0.85, 1.0, uiBus, 0.04);
      if (k === 'tab') return triggerBuffer('sfx-ui-tab', 0.82, 1.0, uiBus, 0.08);
      if (k === 'confirm') return triggerBuffer('sfx-ui-confirm', 0.88, 1.0, uiBus, 0.10);
      if (k === 'deny') return triggerBuffer('sfx-ui-deny', 0.90, 1.0, uiBus, 0.06);
      if (k === 'caution') return triggerBuffer('sfx-warn-caution', 0.92, 1.0, uiBus, 0.12);
      if (k === 'alarm') return triggerBuffer('sfx-alarm', 0.96, 1.0, uiBus, 0.14);
      if (k === 'quindarIn') return triggerBuffer('sfx-quindar-in', 0.72, 1.0, uiBus, 0.14);
      if (k === 'quindarOut') return triggerBuffer('sfx-quindar-out', 0.68, 1.0, uiBus, 0.14);
      if (k === 'sample') return triggerBuffer('sfx-quindar-in', 0.70, 1.18, uiBus, 0.12);
      return triggerBuffer('sfx-ui-click', 0.78, 1.0, uiBus, 0);
    }

    function getConfig() {
      return normalizeConfig(config, DEFAULT_CONFIG);
    }

    function setConfig(patch) {
      config = normalizeConfig(patch, config);
      saveStoredConfig(config);
      lastTargets = computeMixTargets(lastTargetsSnap(), config);
      applyMixParams(lastTargets);
      return getConfig();
    }

    var cachedSnap = {};
    function lastTargetsSnap() { return cachedSnap; }
    var origUpdate = update;
    function wrappedUpdate(snap, dt) {
      cachedSnap = snap && typeof snap === 'object' ? snap : {};
      return origUpdate(cachedSnap, dt);
    }

    function toggleMute() {
      return setConfig({ enabled: !config.enabled });
    }

    function computeActiveLayers() {
      if (!config.enabled || config.master <= 0.005) return [];
      var layers = [];
      if (lastTargets.musicOrbitalGain > 0.01) layers.push('music-orbital');
      if (lastTargets.musicIstlGain > 0.01) layers.push('music-interstellar');
      if (lastTargets.musicCombatGain > 0.01) layers.push('music-combat');
      if (lastTargets.cabinGain > 0.01) layers.push('bed-cabin');
      if (lastTargets.planetGain > 0.01) layers.push('bed-planetary');
      if (lastTargets.istlGain > 0.01) layers.push('bed-interstellar');
      if (lastTargets.sheathGain > 0.01) layers.push('bed-sheath');
      if (lastTargets.driveGain > 0.01) layers.push('stem-drive');
      if (lastTargets.rcsGain > 0.01) layers.push('stem-rcs');
      if (lastTargets.harvestGain > 0.01) layers.push('stem-harvest');
      return layers;
    }

    function getDiagnostics() {
      return {
        supported: supported,
        manifestLoaded: manifestLoaded,
        state: ctx ? ctx.state : 'unavailable',
        unlocked: Boolean(ctx && ctx.state === 'running'),
        muted: !config.enabled,
        convolverReady: convolverReady,
        stemsLoaded: stemsLoaded,
        stemsTotal: stemsTotal,
        stemsFailed: stemsFailed,
        activeVoices: activeVoices,
        activeLayers: computeActiveLayers(),
        busLevels: {
          master: lastTargets.masterGain,
          music: Math.max(lastTargets.musicOrbitalGain, lastTargets.musicIstlGain, lastTargets.musicCombatGain || 0),
          musicCombat: lastTargets.musicCombatGain || 0,
          reverbWet: lastTargets.reverbWet,
          cabin: lastTargets.cabinGain,
          planet: lastTargets.planetGain,
          interstellar: lastTargets.istlGain,
          sheath: lastTargets.sheathGain,
          drive: lastTargets.driveGain,
          rcs: lastTargets.rcsGain,
          harvest: lastTargets.harvestGain,
          ui: lastTargets.uiGain
        },
        targets: Object.assign({}, lastTargets),
        lastEvent: lastEvent ? Object.assign({}, lastEvent) : null
      };
    }

    return {
      preload: preload,
      unlock: unlock,
      update: wrappedUpdate,
      playUi: playUi,
      getConfig: getConfig,
      setConfig: setConfig,
      toggleMute: toggleMute,
      getDiagnostics: getDiagnostics
    };
  }

  return {
    DEFAULT_CONFIG: Object.assign({}, DEFAULT_CONFIG),
    normalizeConfig: normalizeConfig,
    computeMixTargets: computeMixTargets,
    create: create
  };
});
