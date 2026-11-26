/** Flight controller. Physics owns units/integration; scene owns WebGL; screens owns DOM.
 * Local flight uses coordinate seconds and km. Cruise uses proper years and LY.
 * No visual scale, camera offset, or time warp is ever fed back into physics.
 */
(function (root) {
  'use strict';
  const O = root.LighthuggerOrbits, G = root.LighthuggerGenome;
  const Galaxy = root.LighthuggerGalaxy, UI = root.LighthuggerScreens;
  const YEAR = 31557600, PI = Math.PI;
  const HARVEST_MIN_SIM_S = 5400, HARVEST_FULL_SIM_S = 86400, HARVEST_TARGET_REAL_S = 11.0;
  const HARVEST_BETA = 0.02, EMERGENCY_BRAKE_G = 0.25;
  const DROPSHIP_SORTIE_S = 9.0, LIGHT_WEEK_LY = 7 / 365.25;
  const CAM_VIEW_PRESETS = {
    low: { yaw: PI, pitch: 0.10, zoom: 0.76 },
    high: { yaw: PI, pitch: 0.28, zoom: 1.05 },
    first: { yaw: PI, pitch: 0.0, zoom: 0.22 }
  };
  const SYSTEM_APPROACH_LY = 0.015, DEPARTURE_REAL_S = 4.2, CAPTURE_REAL_S = 3.4;
  const MAX_FLIGHT_ETA = 5.5; // ~0.999967c (gamma ~122.4).
  const TRANSIT_LABELS = {
    departure: 'DEPARTURE BURN', accelerate: 'ACCEL CRUISE',
    turnover: 'MIDPOINT TURNOVER', brake: 'DECEL BURN',
    approach: 'SYSTEM APPROACH', capture: 'ORBITAL CAPTURE'
  };
  const RCS_ACCEL = [1.05, 0.42, 0.42], RCS_DAMP = [1.25, 0.52, 0.52];
  const MAX_SPIN_G = 4.6, WARN_SPIN_G = 2.0, HIGH_SPIN_G = 3.8;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const add = (a, b) => a.map((x, i) => x + b[i]);
  const sub = (a, b) => a.map((x, i) => x - b[i]);
  const mul = (a, s) => a.map(x => x * s);
  const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  const len = a => Math.hypot(...a);
  const unit = a => len(a) > 1e-15 ? mul(a, 1 / len(a)) : [1, 0, 0];
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const $ = id => document.getElementById(id);
  if (!O || !G || !Galaxy || !UI) throw new Error('Lighthugger modules must load before app');
  let fleet = G.loadFleet(), sceneCtrl = null;
  const audioCtrl = root.LighthuggerAudio ? root.LighthuggerAudio.create({ baseUrl: 'prototypes/lighthugger/audio/' }) : null;
  if (audioCtrl) audioCtrl.preload();
  function loadGraphicsPrefs() {
    const def = { aa: 'msaa4', renderScale: 1, autoOrbit: true };
    try {
      const raw = root.localStorage && root.localStorage.getItem('lh_graphics_v1');
      if (!raw) return def;
      const p = JSON.parse(raw);
      return {
        aa: ['off', 'fxaa', 'msaa4', 'ssaa2'].includes(p?.aa) ? p.aa : def.aa,
        renderScale: clamp(Number(p?.renderScale) || 1, 0.5, 2.0),
        autoOrbit: p?.autoOrbit == null ? def.autoOrbit : !!p.autoOrbit
      };
    } catch (e) { return def; }
  }
  function saveGraphicsPrefs(g) {
    try { if (root.localStorage) root.localStorage.setItem('lh_graphics_v1', JSON.stringify(g)); } catch (e) {}
  }
  const initial = G.normalize(fleet[0] || G.PRESETS[0]);
  const initialPreset = G.PRESETS.find(p => JSON.stringify(G.normalize(p).P) === JSON.stringify(initial.P));
  let draftSpecs = G.computeRocketSpecs(initial), draftShareCode = G.encodeShareCode(initial);
  const S = {
    genome: initial, commissionedGenome: G.normalize(initial), presetId: initialPreset ? initialPreset.id : null,
    screen: 'menu', started: false, graphics: loadGraphicsPrefs(),
    currentSystemId: 'sol', dioramaSysId: 'sol', docked: true, mode: 'docked',
    simTimeS: 0, epochYear: 2370, shipTauYears: 0,
    posGal: [0, 0, 0], eta: 0, beta: 0, gamma: 1,
    headingGal: [1, 0, 0], velocityGal: null, basis: { f: [1, 0, 0], y: [0, 0, 1], z: [0, -1, 0] },
    angVel: [0, 0, 0], rcsTorque: [0, 0, 0], autoRcsTorque: [0, 0, 0], rcsDamping: false, spinG: 0, crewSpinKilled: false,
    thrustCmdG: 0, attitudeMode: 'PROGRADE', timeWarp: 1, autoWarp: true, autoClock: true, effectiveWarp: 1,
    relGov: true, emergencyBraking: false, cruiseAppliedG: 0,
    fineSteer: false, aberrationZoom: 1, hudRestFrame: true, vecProgradeLock: false,
    clockExplicit: false,
    fuelFrac: 1, reactionless: true, massMt: 0, iceIntegrity: 1, hideIce: false,
    coreHeat: 0, thermalLoad: 0, thermalState: 'nominal', thermalGovernor: false,
    ablation: { intensity: 0, iceLoss: 0, warningLevel: 'nominal' }, warning: null,
    courseDestId: null, mission: null, missionPlan: null, burn: null, selectedTargetId: null,
    selectedDestId: null, planAccelG: 1, brachAccelG: 1, maxHopLy: 15,
    multiHop: { active: false, route: null, legIdx: 0, phase: 'idle', harvesting: false, harvestTimerS: 0, harvestSite: null },
    iceHarvest: { active: false, kind: 'idle', depositId: '', siteName: '', siteKind: '', bodyName: '', distKm: 0, depositWorldR: null, outboundFrac: 0.25, returnStartFrac: 0.75, timerS: 0, remainingSimS: 0, durationS: 0, durationSimS: 0, elapsedSimS: 0, iceStart: 1, progress: 0, phase: 'idle' },
    iceHarvestTrafficS: 0,
    flip: false, flipVisualRad: 0, puckMode: 'steer', puck: [0, 0], mouseSteer: [0, 0], mouseSteerVisual: null,
    oscMode: 'spec', specWindow: [380, 760], hoverNm: null,
    scopeTheta: 0, scopeAz: 0, irSight: false, autoSolve: true, lockedTarget: null,
    credits: 250000, log: [], toast: null, drydockCam: 'orbit', vectors: false, vectorsUserHidden: false,
    hudFlight: false, hudRel: false, hudWeapons: false, camLock: false, camViewMode: 'low', camSnapActive: false, hideShip: false, hideShipPreFirst: false,
    rollInput: 0, steerVisRoll: 0, customOrbitKm: null,
    orbitFrame: 'planet', moonIdx: 0, maneuverChain: [], selectedBurnIdx: 0,
    lastImpact: null, lastRingCrossing: null,
    weaponLockOn: false, weaponTargetIdx: 0, weaponFireAt: 0, weaponEvent: null,
    hullIntegrity: 1, damageState: 'nominal', destroyed: false, destroyedReason: '',
    combatClockS: 0, combatAlertS: 0, kills: 0,
    playerHitSeq: 0, playerHitAt: 0, enemyWeaponEvent: null, pdcEvent: null, explosionEvent: null,
    discoveredSystems: [], visitedSystems: ['sol'],
    projectiles: [],
    node: { progradeKmS: 0, normalKmS: 0, radialKmS: 0 }
  };
  const orbit = {
    rKm: [1, 0, 0], vKmS: [0, 1, 0], focusSoi: 'planet', primary: 'planet',
    planetIdx: 0, moonIdx: 0, el: null, muKm3S2: 1, mu: 1, bodyRadiusKm: 1,
    bodyName: '', altKm: 0, peAltKm: 0, apAltKm: 0, vOrbKmS: 0, rHillKm: 0
  };
  const rocket = {};
  let contacts = [], toastSeq = 0, weaponSeq = 0, enemyWeaponSeq = 0, pdcSeq = 0, projSeq = 0, explosionSeq = 0, lagrangeRef = null, soiSkipPlanetIdx = -1;
  let lastMissileAt = 0;
  const combatBySys = {};
  let lastAtmoMsgMs = 0, lastRingMsgMs = 0, lastProxMsgMs = 0, corridorRecycleSeq = 0;
  let relHudRegime = false, lastObsSimTimeS = 0, autoCaptureTargetId = null, autoCapturePlottedAt = 0, replanningCapture = false;
  let autoRcsCmd = [0, 0, 0], inFrameLoop = false;
  const REL_HUD_ON_BETA = 0.05, REL_HUD_OFF_BETA = 0.015;
  function syncAutoRelHud(forceEnterRel) {
    const inActiveTransit = S.mode === 'interstellar' && (Boolean(S.mission) || S.multiHop.active);
    const wantOn = Boolean(forceEnterRel) || inActiveTransit || S.beta >= REL_HUD_ON_BETA;
    const wantOff = S.mode !== 'interstellar' ? S.beta < REL_HUD_OFF_BETA : (!inActiveTransit && !forceEnterRel && S.beta < REL_HUD_OFF_BETA);
    if (!relHudRegime && wantOn) {
      relHudRegime = true;
      S.hudRel = true;
      S.hudFlight = false;
    } else if (relHudRegime && wantOff) {
      relHudRegime = false;
      S.hudRel = false;
    }
  }
  const weaponMode = () => S.hudRel ? 'relativistic' : 'newtonian';
  const allSystems = () => Galaxy.ALL_SYSTEMS || Galaxy.SYSTEMS;
  const sys = () => allSystems().find(s => s.id === S.currentSystemId) || Galaxy.SYSTEMS[0];
  const system = id => (Galaxy.getSystem ? Galaxy.getSystem(id) : allSystems().find(s => s.id === id));
  const VOYAGE_KEY = 'lh.voyage.v1';
  const validVec = a => Array.isArray(a) && a.length===3 && a.every(Number.isFinite);
  // Voyage state is shared by the Continue slot and Archive mission snapshots.
  const validVoyage = v => !!(v && v.genome && system(v.currentSystemId) && validVec(v.posGal) &&
    ['epochYear','shipTauYears','iceIntegrity','credits'].every(k => Number.isFinite(v[k])));
  let savedVoyage = readVoyage(), lastSaveMs = 0;
  function readVoyage() {
    try {
      const v = JSON.parse(root.localStorage.getItem(VOYAGE_KEY));
      return validVoyage(v) ? v : null;
    } catch (e) { return null; }
  }
  function captureVoyage() {
    return {genome:G.normalize(S.commissionedGenome),currentSystemId:S.currentSystemId,
      systemName:sys().name,docked:S.docked,posGal:S.posGal.slice(),epochYear:S.epochYear,shipTauYears:S.shipTauYears,
      fuelFrac:1,iceIntegrity:S.iceIntegrity,hullIntegrity:S.hullIntegrity,coreHeat:S.coreHeat,credits:S.credits,simTimeS:S.simTimeS,
      destroyed:!!S.destroyed,destroyedReason:S.destroyedReason||'',kills:S.kills||0,
      mode:S.mode,eta:S.eta,beta:S.beta,gamma:S.gamma,headingGal:S.headingGal.slice(),
      velocityGal:S.velocityGal?.slice(),courseDestId:S.courseDestId,
      orbit:{rKm:orbit.rKm.slice(),vKmS:orbit.vKmS.slice(),focusSoi:orbit.focusSoi,primary:orbit.primary,planetIdx:orbit.planetIdx,moonIdx:orbit.moonIdx},
      discoveredSystems:Array.isArray(S.discoveredSystems)?S.discoveredSystems.slice():[],
      visitedSystems:Array.isArray(S.visitedSystems)?S.visitedSystems.slice():['sol'],
      savedAt:Date.now()};
  }
  function saveVoyage(force) {
    if (!S.started) return;
    const now = Date.now();
    if (!force && now - lastSaveMs < 3000) return;
    const v = captureVoyage();
    try { root.localStorage.setItem(VOYAGE_KEY,JSON.stringify(v)); savedVoyage=v; lastSaveMs=now; } catch (e) { /* Storage may be disabled. */ }
  }
  function continueSavedVoyage() { return restoreVoyage(readVoyage()); }
  function restoreVoyage(v, opts) {
    if (!validVoyage(v)) return false;
    clearMultiHop();
    opts = opts || {};
    S.genome=G.normalize(v.genome); S.commissionedGenome=G.normalize(v.genome);
    draftSpecs=G.computeRocketSpecs(S.genome); draftShareCode=G.encodeShareCode(S.genome);
    const matchedPreset=G.PRESETS.find(p=>JSON.stringify(G.normalize(p).P)===JSON.stringify(S.genome.P));
    S.presetId=matchedPreset?matchedPreset.id:null; updateRocket();
    S.simTimeS=Number.isFinite(v.simTimeS)?v.simTimeS:Math.max(0,(v.epochYear-2370)*YEAR);
    enterSystemOrbit(v.currentSystemId,v.docked);
    S.epochYear=v.epochYear; S.shipTauYears=v.shipTauYears; S.credits=v.credits;
    S.iceIntegrity=clamp(v.iceIntegrity,0,1);
    S.hullIntegrity=Number.isFinite(v.hullIntegrity)?clamp(v.hullIntegrity,0,1):1;
    S.destroyed=!!v.destroyed && S.hullIntegrity<=0;
    S.destroyedReason=S.destroyed?(v.destroyedReason||'Vessel destroyed'):'';
    S.damageState=computeDamageState(S.hullIntegrity);
    S.kills=Number.isFinite(v.kills)?v.kills:0;
    S.combatAlertS=0; S.enemyWeaponEvent=null; S.explosionEvent=null;
    S.coreHeat=Number.isFinite(v.coreHeat)?clamp(v.coreHeat,0,1):0; S.thermalLoad=0;
    S.thermalState=O.thermalStateOf(S.coreHeat); S.thermalGovernor=false;
    if (!v.docked && v.orbit && validVec(v.orbit.rKm) && validVec(v.orbit.vKmS)) {
      const savedSoi = v.orbit.primary || v.orbit.focusSoi;
      const savedP = sys().planets[v.orbit.planetIdx];
      const savedM = savedSoi === 'moon' ? savedP?.moons?.[v.orbit.moonIdx || 0] : null;
      if (savedP && (savedSoi === 'star' || savedSoi === 'planet' || (savedSoi === 'moon' && savedM))) {
        orbit.rKm = v.orbit.rKm.slice(); orbit.vKmS = v.orbit.vKmS.slice();
        orbit.focusSoi = orbit.primary = savedSoi;
        orbit.planetIdx = v.orbit.planetIdx;
        orbit.moonIdx = savedSoi === 'moon' ? (v.orbit.moonIdx || 0) : 0;
        refreshOrbit(); updateGalPosition();
        S.orbitFrame = orbit.primary;
        if (savedSoi === 'moon') S.moonIdx = orbit.moonIdx;
        S.eta=Math.atanh(clamp(len(starState().vKmS)/O.C_KMS,0,.999999999));
        S.beta=Math.tanh(S.eta); S.gamma=Math.cosh(S.eta);
      }
    }
    if (!v.docked && v.mode==='interstellar') {
      S.mode='interstellar'; S.posGal=v.posGal.slice();
      S.eta=Number.isFinite(v.eta)?v.eta:0; S.beta=Math.tanh(S.eta); S.gamma=Math.cosh(S.eta);
      syncAutoRelHud(true);
    }
    if(validVec(v.headingGal))basis(v.headingGal);
    if (S.mode === 'interstellar') S.velocityGal = validVec(v.velocityGal) ? unit(v.velocityGal) : S.headingGal;
    S.discoveredSystems = Array.isArray(v.discoveredSystems) ? Array.from(new Set(v.discoveredSystems)) : [];
    S.visitedSystems = Array.isArray(v.visitedSystems) ? Array.from(new Set(v.visitedSystems)) : ['sol'];
    updateFrontierDiscovery(true);
    S.courseDestId = system(v.courseDestId) && v.courseDestId !== S.currentSystemId ? v.courseDestId : null;
    S.selectedDestId = S.courseDestId;
    S.started=true; S.timeWarp=1; S.clockExplicit=false; S.autoClock=true; S.effectiveWarp=1; S.warning=null; S.orbitPlan=null; S.missionPlan=null;
    rebuildShip(); if (sceneCtrl) sceneCtrl.setIceIntegrity(S.iceIntegrity);
    if (!(S.courseDestId && lockStar(S.courseDestId))) lockStar('rigil') || lockStar('proxima');
    if (!opts.stayOnScreen) setScreen('helm');
    saveVoyage(true); return true;
  }
  function message(text, level) {
    S.log.push(text); if (S.log.length > 50) S.log.shift();
    if (UI.flash) UI.flash(text, level || 'nominal');
    saveVoyage(true);
  }
  function alignBasis(f, upHint) {
    const forward = unit(f);
    let up = upHint ? sub(upHint, mul(forward, dot(upHint, forward))) : [0, 0, 0];
    if (len(up) < 1e-8) {
      const ref = Math.abs(forward[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
      up = sub(ref, mul(forward, dot(ref, forward)));
    }
    const y = unit(up);
    S.basis = { f: forward, y, z: cross(forward, y) }; S.headingGal = forward;
  }
  function basis(f) {
    const forward = unit(f), prev = S.basis;
    const axis = cross(prev.f, forward), cosine = clamp(dot(prev.f, forward), -1, 1);
    // Rodrigues' shortest rotation transports the dorsal (+Y) axis with the nose.
    // At an exact reversal, preserve dorsal up so pitch/yaw stay level.
    const transported = cosine > -1 + 1e-10
      ? add(prev.y, add(cross(axis, prev.y), mul(cross(axis, cross(axis, prev.y)), 1 / (1 + cosine))))
      : prev.y;
    const y = unit(sub(transported, mul(forward, dot(transported, forward))));
    S.basis = { f: forward, y, z: cross(forward, y) }; S.headingGal = forward;
  }
  function rollBasis(dRad) {
    if (!Number.isFinite(dRad) || Math.abs(dRad) < 1e-9) return;
    const c = Math.cos(dRad), s = Math.sin(dRad);
    const y0 = S.basis.y, z0 = S.basis.z;
    const ny = unit(add(mul(y0, c), mul(z0, s)));
    S.basis = { f: S.basis.f, y: ny, z: cross(S.basis.f, ny) };
  }
  function resetRotation() {
    S.angVel = [0, 0, 0]; S.rcsTorque = [0, 0, 0]; S.autoRcsTorque = [0, 0, 0]; S.rcsDamping = false;
    autoRcsCmd = [0, 0, 0];
    S.spinG = 0; S.crewSpinKilled = false;
    S.steerVisRoll = 0; S.steerVisYaw = 0; S.steerVisPitch = 0;
    if (S.warning?.source === 'spin') S.warning = null;
  }
  function slewSextant(dPanRad, dTiltRad) {
    const th = clamp(S.scopeTheta, 0, 180) * PI / 180;
    const az = S.scopeAz * PI / 180;
    const ax = Math.cos(th), ay = Math.sin(th) * Math.cos(az), azv = Math.sin(th) * Math.sin(az);
    const el = clamp(Math.asin(clamp(ay, -1, 1)) + dTiltRad, -1.535, 1.535);
    const hdg = Math.atan2(azv, ax) + dPanRad;
    const ce = Math.cos(el);
    const nx = ce * Math.cos(hdg), ny = Math.sin(el), nz = ce * Math.sin(hdg);
    S.scopeTheta = Math.acos(clamp(nx, -1, 1)) * 180 / PI;
    S.scopeAz = (Math.atan2(nz, ny) * 180 / PI + 360) % 360;
  }
  function isReversible(genome) {
    return (((genome || S.commissionedGenome) && (genome || S.commissionedGenome).P && (genome || S.commissionedGenome).P.iceSymmetry) || 'fore') === 'fore';
  }
  function updateRocket() {
    // Conjoiner drives are reactionless: mass never changes in flight and there is no
    // delta-v budget. fuelFrac stays 1 for older UI readers.
    Object.assign(rocket, G.computeRocketSpecs(S.commissionedGenome));
    S.massMt = rocket.totalMassMt; S.fuelFrac = 1; S.reactionless = true;
    rocket.massMt = S.massMt; rocket.fuelFrac = 1; rocket.reactionless = true;
    // Single bow-ice hulls never flip 180 deg; they brake with forward reverse thrust.
    if (isReversible()) S.flip = false;
  }
  function computeDamageState(hull) {
    if (!(hull > 0)) return 'destroyed';
    if (hull <= 0.35) return 'critical';
    if (hull <= 0.70) return 'damaged';
    return 'nominal';
  }
  function damageThrustScale() {
    if (S.destroyed) return 0;
    return S.damageState === 'critical' ? 0.70 : 1.0;
  }
  function thermalHeadroom() {
    if (Number.isFinite(rocket.thermalHeadroom) && rocket.thermalHeadroom > 0) return rocket.thermalHeadroom;
    return rocket.radiatorMW > 0 && rocket.coreWasteMW > 0 ? clamp(rocket.radiatorMW / rocket.coreWasteMW, 0.25, 2) : 1;
  }
  const sustainableG = () => O.sustainableAccelG(thermalHeadroom(), rocket.maxAccelG);
  function rocketSpecs() {
    const {iceCoverage, iceThick} = S.commissionedGenome.P;
    return {...rocket, iceCoverage, iceThick};
  }
  // Thermal load evolves in real seconds, so time warp never cooks or freezes the core.
  // Manual torch at saturation is governed down to a sustainable thrust, never cut.
  function updateThermal(realDtS) {
    if (!(realDtS > 0)) return;
    if (S.destroyed) { S.coreHeat = 0; S.thermalLoad = 0; S.thermalState = 'nominal'; S.thermalGovernor = false; return; }
    const manual = !S.mission && !(S.burn && S.burn.active);
    const actualG = S.mode === 'interstellar' && manual ? S.cruiseAppliedG : S.thrustCmdG;
    const thermScale = S.damageState === 'critical' ? 0.70 : (S.damageState === 'damaged' ? 0.85 : 1.0);
    const r = O.stepCoreHeat(S.coreHeat, S.docked ? 0 : actualG, thermalHeadroom() * thermScale, realDtS);
    S.coreHeat = r.heat; S.thermalLoad = r.load; S.thermalState = r.state;
    const dmgCap = rocket.maxAccelG * damageThrustScale();
    if (manual && !S.docked && Math.abs(S.thrustCmdG) > dmgCap) S.thrustCmdG = Math.sign(S.thrustCmdG) * dmgCap;
    const thermalWarn = S.warning && S.warning.source === 'thermal', cap = Math.min(dmgCap, sustainableG() * 0.95);
    if (S.coreHeat >= 0.96 && !S.docked) {
      if (manual) S.thermalGovernor = true;
      if (!S.warning || thermalWarn) S.warning = manual ?
        {title:'THERMAL OVERLOAD',text:'Conjoiner core at '+Math.round(S.coreHeat*100)+'%. Torch governed to '+cap.toFixed(2)+' g until radiators recover.',level:'critical',source:'thermal'} :
        {title:'THERMAL OVERLOAD',text:'Core saturated. Automatic burn continues on radiator margin.',level:'elevated',source:'thermal'};
    }
    if (S.thermalGovernor) {
      if (!manual || S.docked || S.coreHeat < 0.8) {
        S.thermalGovernor = false;
        if (S.warning && S.warning.source === 'thermal') S.warning = null;
      } else if (!S.emergencyBraking && Math.abs(S.thrustCmdG) > cap) S.thrustCmdG = Math.sign(S.thrustCmdG) * cap;
    } else if (thermalWarn && S.coreHeat < 0.9) S.warning = null;
  }
  function ensureSystemGravity(s = sys()) {
    if (!s) return s;
    const starBody = { muKm3S2: s.muStarKm3S2 };
    for (const p of s.planets || []) {
      if (O.ensureBodyGravity) O.ensureBodyGravity(p, starBody, false);
      for (const m of p.moons || []) {
        if (O.ensureBodyGravity) O.ensureBodyGravity(m, p, true);
      }
    }
    return s;
  }
  function currentPrimaryRef() {
    if (orbit.focusSoi === 'star') return { kind: 'star' };
    if (orbit.focusSoi === 'moon') return { kind: 'moon', planetIdx: orbit.planetIdx, moonIdx: orbit.moonIdx };
    return { kind: 'planet', planetIdx: orbit.planetIdx };
  }
  function bodyRecord(ref) {
    if (!ref || ref.kind === 'star') {
      return { name: sys().name, radiusKm: sys().starRadiusKm, muKm3S2: sys().muStarKm3S2, kind: 'star', rHillKm: Infinity };
    }
    const p = sys().planets[ref.planetIdx ?? 0];
    if (!p) return null;
    if (ref.kind === 'moon') return p.moons?.[ref.moonIdx ?? 0] || null;
    return p;
  }
  function currentPrimaryBody() {
    return bodyRecord(currentPrimaryRef()) || sys().planets[0];
  }
  function currentPrimaryLabel() {
    return String(currentPrimaryBody()?.name || orbit.focusSoi || 'PRIMARY').toUpperCase();
  }
  function refreshOrbit() {
    ensureSystemGravity();
    if (orbit.focusSoi === 'moon' && !sys().planets[orbit.planetIdx]?.moons?.[orbit.moonIdx]) {
      orbit.focusSoi = 'planet';
      orbit.moonIdx = 0;
    }
    orbit.primary = orbit.focusSoi;
    const primary = currentPrimaryBody();
    orbit.muKm3S2 = orbit.mu = primary.muKm3S2;
    orbit.bodyRadiusKm = primary.radiusKm;
    orbit.bodyName = primary.name;
    orbit.rHillKm = Number.isFinite(primary.rHillKm) ? primary.rHillKm : 0;
    orbit.el = O.stateToElements(orbit.rKm, orbit.vKmS, orbit.muKm3S2);
    orbit.altKm = orbit.el.radiusKm - orbit.bodyRadiusKm;
    orbit.peAltKm = orbit.el.rp - orbit.bodyRadiusKm;
    orbit.apAltKm = orbit.el.isBound ? orbit.el.ra - orbit.bodyRadiusKm : Infinity;
    orbit.vOrbKmS = orbit.el.speedKmS;
  }
  const body = (kind, planetIdx = orbit.planetIdx, moonIdx = orbit.moonIdx, timeS = S.simTimeS) =>
    Galaxy.getBodyWorldState(sys(), { kind, planetIdx, moonIdx }, timeS);
  function starState(timeS = S.simTimeS) {
    if (orbit.focusSoi === 'star') return { rKm: orbit.rKm.slice(), vKmS: orbit.vKmS.slice() };
    const origin = Galaxy.getBodyWorldState(sys(), currentPrimaryRef(), timeS);
    return { rKm: add(origin.rKm, orbit.rKm), vKmS: add(origin.vKmS, orbit.vKmS) };
  }
  function switchPhysicsPrimary(ref, timeS = S.simTimeS) {
    if (!ref || !['star', 'planet', 'moon'].includes(ref.kind)) return false;
    ensureSystemGravity();
    if (ref.kind === 'planet' && !sys().planets[ref.planetIdx]) return false;
    if (ref.kind === 'moon' && !sys().planets[ref.planetIdx]?.moons?.[ref.moonIdx]) return false;
    const world = starState(timeS);
    const origin = ref.kind === 'star'
      ? { rKm: [0, 0, 0], vKmS: [0, 0, 0] }
      : Galaxy.getBodyWorldState(sys(), ref, timeS);
    orbit.rKm = sub(world.rKm, origin.rKm);
    orbit.vKmS = sub(world.vKmS, origin.vKmS);
    orbit.focusSoi = orbit.primary = ref.kind;
    if (ref.kind !== 'star') { orbit.planetIdx = ref.planetIdx; soiSkipPlanetIdx = -1; }
    orbit.moonIdx = ref.kind === 'moon' ? ref.moonIdx : 0;
    if (ref.kind === 'moon') S.moonIdx = ref.moonIdx;
    refreshOrbit();
    updateGalPosition();
    return true;
  }
  function updateGalPosition() { S.posGal = add(sys().xyz, mul(starState().rKm, 1 / O.LY_KM)); }
  function updateFrontierDiscovery(quiet = false) {
    if (!validVec(S.posGal)) return 0;
    const minSol = Galaxy.FRONTIER_REVEAL_SOL_LY ?? 40;
    const scanR = Galaxy.SENSOR_HORIZON_LY ?? 50;
    const solDist = len(S.posGal);
    const curSys = system(S.currentSystemId);
    if (solDist < minSol && !curSys?.procedural) return 0;
    const sectorCands = Galaxy.ensureSectorsNear ? Galaxy.ensureSectorsNear(S.posGal, scanR) : [];
    const candidates = (Galaxy.FRONTIER_SYSTEMS || []).concat(sectorCands);
    const known = new Set(Array.isArray(S.discoveredSystems) ? S.discoveredSystems : []);
    const added = [];
    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i];
      if (!cand || known.has(cand.id)) continue;
      if (len(sub(cand.xyz, S.posGal)) <= scanR) {
        known.add(cand.id);
        added.push(cand);
      }
    }
    if (added.length) {
      S.discoveredSystems = Array.from(known);
      if (!quiet) {
        message('50 LY SENSOR CONTACT: ' + added.length + ' UNIDENTIFIED SIGNAL' + (added.length > 1 ? 'S' : '') + ' DETECTED ON STARMAP.');
      }
    }
    return added.length;
  }
  // Nearest catalogued star to the ship; orbital navigation only exists within a light-week of one.
  function nearestStarInfo() {
    if (S.mode !== 'interstellar' || !validVec(S.posGal)) return { sys: sys(), distLy: 0 };
    const vis = Galaxy.getVisibleSystems ? Galaxy.getVisibleSystems(S.discoveredSystems, S.posGal) : allSystems();
    const list = vis.concat(Galaxy.ensureSectorsNear ? Galaxy.ensureSectorsNear(S.posGal, 50) : []);
    let best = null, bestD = Infinity;
    for (let i = 0; i < list.length; i++) {
      const cand = list[i], d = len(sub(cand.xyz, S.posGal));
      if (d < bestD) { bestD = d; best = cand; }
    }
    return { sys: best, distLy: best ? bestD : 0 };
  }
  function stationRelative() {
    if (S.mode === 'interstellar') {
      const refSys = system(S.dioramaSysId) || sys();
      const dLy = validVec(S.posGal) && refSys ? len(sub(S.posGal, refSys.xyz)) : NaN;
      return {
        distKm: Number.isFinite(dLy) ? dLy * O.LY_KM : NaN,
        relKmS: S.beta * O.C_KMS,
        inRange: false,
        cue: Number.isFinite(dLy) && dLy > 0.002 ? ('INTERSTELLAR \u00b7 ' + dLy.toFixed(2) + ' LY FROM ' + refSys.name.toUpperCase()) : 'DEEP TRANSIT'
      };
    }
    if (!sys().station) {
      return { distKm: Infinity, relKmS: 0, inRange: false, uninhabited: true, cue: 'UNINHABITED SYSTEM \u00b7 NO STATION' };
    }
    const station = body('station', sys().station.parentPlanetIdx);
    const ship = starState();
    const distKm = len(sub(station.rKm, ship.rKm)), relKmS = len(sub(station.vKmS, ship.vKmS));
    return { distKm, relKmS, inRange: distKm < 25 && relKmS < 0.03,
      cue: S.docked ? 'BERTHED' : undefined };
  }
  function parkingState(dest, timeS) {
    if (!dest.station) {
      return iceParkingState(dest, { ref: { kind: 'planet', planetIdx: 0 } }, timeS);
    }
    const planetIdx = dest.station.parentPlanetIdx;
    const planet = Galaxy.getBodyWorldState(dest, { kind: 'planet', planetIdx }, timeS);
    const station = Galaxy.getBodyWorldState(dest, { kind: 'station', planetIdx }, timeS);
    const stRelR = sub(station.rKm, planet.rKm);
    const stRelV = sub(station.vKmS, planet.vKmS);
    const proHat = unit(stRelV);
    const radHat = unit(stRelR);
    const nrmRaw = cross(radHat, proHat);
    const nrmHat = len(nrmRaw) > 1e-6 ? unit(nrmRaw) : [0, 0, 1];
    // Stand off astern-outboard-above (~21.4 km) so arrivals & departures never pass through the station ring or spindle.
    const rKm = add(stRelR, add(mul(proHat, -14), add(mul(radHat, 15), mul(nrmHat, 6))));
    const vKmS = stRelV.slice();
    return {
      rKm, vKmS, primary: 'planet', planetIdx, moonIdx: 0,
      worldR: add(planet.rKm, rKm), worldV: add(planet.vKmS, vKmS),
      stationWorldR: station.rKm.slice()
    };
  }
  function iceParkingState(dest, site, timeS) {
    if (site && site.deposit && Galaxy.getIceDepositWorldState) {
      const dep = site.deposit;
      const pRef = dep.parentRef || { kind: 'star' };
      const parentSt = Galaxy.getBodyWorldState(dest, pRef, timeS);
      const depW = Galaxy.getIceDepositWorldState(dest, dep, timeS);
      const relPos = sub(depW.rKm, parentSt.rKm);
      const relVel = sub(depW.vKmS, parentSt.vKmS);
      const outHat = unit(relPos);
      const velHat = unit(relVel);
      const nrmRaw = cross(outHat, velHat);
      const nrmHat = len(nrmRaw) > 1e-6 ? unit(nrmRaw) : [0, 0, 1];
      const standKm = 180;
      const parkPos = add(relPos, add(mul(outHat, standKm * 0.72), mul(nrmHat, standKm * 0.69)));
      return {
        rKm: parkPos, vKmS: relVel.slice(),
        primary: pRef.kind || 'star',
        planetIdx: Number.isInteger(pRef.planetIdx) ? pRef.planetIdx : 0,
        moonIdx: Number.isInteger(pRef.moonIdx) ? pRef.moonIdx : 0,
        worldR: add(parentSt.rKm, parkPos), worldV: add(parentSt.vKmS, relVel)
      };
    }
    const ref = site && site.ref;
    if (ref && ref.kind === 'moon') {
      const moonObj = dest.planets?.[ref.planetIdx]?.moons?.[ref.moonIdx];
      const moonW = Galaxy.getBodyWorldState(dest, ref, timeS);
      if (moonObj && moonW) {
        const outHat = unit(moonW.rKm);
        const velHat = unit(moonW.vKmS);
        const nrmRaw = cross(outHat, velHat);
        const nrmHat = len(nrmRaw) > 1e-6 ? unit(nrmRaw) : [0, 0, 1];
        const tanRaw = cross(nrmHat, outHat);
        const tanHat = len(tanRaw) > 1e-6 ? unit(tanRaw) : velHat;
        const safeR = Math.max((moonObj.radiusKm || 1500) * 2.8, (moonObj.radiusKm || 1500) + 1800);
        const rKm = add(mul(outHat, safeR * 0.94), mul(nrmHat, safeR * 0.34));
        const muMoon = moonObj.muKm3S2 || Math.max(100, (moonObj.radiusKm || 1500) * 5);
        const vCirc = Math.sqrt(muMoon / safeR);
        const vKmS = mul(tanHat, vCirc);
        return {
          rKm, vKmS, primary: 'moon', planetIdx: ref.planetIdx, moonIdx: ref.moonIdx,
          worldR: add(moonW.rKm, rKm), worldV: add(moonW.vKmS, vKmS)
        };
      }
    }
    if (ref && ref.kind === 'planet') {
      const pObj = dest.planets?.[ref.planetIdx];
      const pW = Galaxy.getBodyWorldState(dest, ref, timeS);
      if (pObj && pW) {
        const outHat = unit(pW.rKm);
        const velHat = unit(pW.vKmS);
        const nrmRaw = cross(outHat, velHat);
        const nrmHat = len(nrmRaw) > 1e-6 ? unit(nrmRaw) : [0, 0, 1];
        const tanRaw = cross(nrmHat, outHat);
        const tanHat = len(tanRaw) > 1e-6 ? unit(tanRaw) : velHat;
        const pR = pObj.radiusKm || 5000;
        const atmo = O.bodyAtmosphereAltKm(pObj, 'planet');
        const safeR = pObj.hasRings ? Math.max(pR * 3.15, pR + atmo + 2600)
          : Math.max(pR * 3.2, pR + atmo + 2400);
        const rKm = add(mul(outHat, safeR * 0.92), mul(nrmHat, safeR * 0.39));
        const muP = pObj.muKm3S2 || 5e5;
        const vCirc = Math.sqrt(muP / safeR);
        const vKmS = mul(tanHat, vCirc);
        return {
          rKm, vKmS, primary: 'planet', planetIdx: ref.planetIdx, moonIdx: 0,
          worldR: add(pW.rKm, rKm), worldV: add(pW.vKmS, vKmS)
        };
      }
    }
    const maxAU = Math.max(6, ...(dest.planets || []).map(p => p.orbitRadiusAU || 1));
    const rDist = maxAU * 1.42 * O.AU_KM;
    const u = 0.65;
    const rKm = [rDist * Math.cos(u), rDist * Math.sin(u), 0.14 * rDist];
    const muS = dest.muStarKm3S2 || 1.327e11;
    const vOrb = Math.sqrt(muS / Math.max(1e6, len(rKm)));
    const vKmS = [-Math.sin(u) * vOrb, Math.cos(u) * vOrb, 0];
    return { rKm, vKmS, primary: 'star', planetIdx: 0, moonIdx: 0, worldR: rKm.slice(), worldV: vKmS.slice() };
  }
  function collectSystemObstacles(targetSys, timeS, excludeStation) {
    const out = [];
    if (!targetSys) return out;
    const sR = Math.max(5e4, targetSys.starRadiusKm || 6.96e5);
    out.push({ kind: 'star', center: [0, 0, 0], hardR: sR * 1.35, clearR: sR * 2.4 });
    const pls = targetSys.planets || [];
    for (let pi = 0; pi < pls.length; pi++) {
      const p = pls[pi];
      const pW = Galaxy.getBodyWorldState(targetSys, { kind: 'planet', planetIdx: pi }, timeS);
      const pR = Math.max(400, p.radiusKm || 6000);
      const atmo = O.bodyAtmosphereAltKm(p, 'planet');
      const hardR = pR + atmo + 400;
      const clearR = (p.hasRings ? pR * 2.65 : pR * 1.55) + atmo + 900;
      out.push({ kind: 'planet', center: pW.rKm, hardR, clearR });
      const ms = p.moons || [];
      for (let mi = 0; mi < ms.length; mi++) {
        const mObj = ms[mi];
        const mW = Galaxy.getBodyWorldState(targetSys, { kind: 'moon', planetIdx: pi, moonIdx: mi }, timeS);
        const mR = Math.max(200, mObj.radiusKm || 1200);
        const mAtmo = O.bodyAtmosphereAltKm(mObj, 'moon');
        out.push({ kind: 'moon', center: mW.rKm, hardR: mR + mAtmo + 250, clearR: mR * 1.75 + mAtmo + 550 });
      }
    }
    if (!excludeStation && targetSys.station) {
      const stW = Galaxy.getBodyWorldState(targetSys, { kind: 'station', planetIdx: targetSys.station.parentPlanetIdx }, timeS);
      out.push({ kind: 'station', center: stW.rKm, hardR: 12, clearR: 12 });
    }
    return out;
  }
  function pushPointClearOfObstacles(pt, anchorPos, obstacles) {
    let out = pt.slice();
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < obstacles.length; i++) {
        const obs = obstacles[i];
        const anchorDist = anchorPos ? len(sub(anchorPos, obs.center)) : Infinity;
        const maxAllowedR = Number.isFinite(anchorDist) ? anchorDist : Infinity;
        const rawSafeR = Math.min(obs.clearR, Math.max(obs.hardR, Math.min(maxAllowedR, anchorDist * 0.88)));
        const safeR = Math.min(rawSafeR, maxAllowedR);
        const bufR = Math.min(safeR * 1.55, maxAllowedR);
        const rel = sub(out, obs.center);
        const d = len(rel);
        if (d < bufR && bufR > 1e-6) {
          const outDir = d > 1e-6 ? mul(rel, 1 / d) : (anchorPos ? unit(sub(anchorPos, obs.center)) : [0, 1, 0]);
          const uClear = clamp(d / bufR, 0, 1);
          const smoothClear = uClear * uClear * (3 - 2 * uClear);
          const targetD = Math.max(d, safeR + (bufR - safeR) * smoothClear);
          out = add(obs.center, mul(outDir, targetD));
        }
      }
    }
    return out;
  }
  function enterSystemOrbit(id, berthed, keepPosition) {
    const destSys = system(id) || Galaxy.SYSTEMS[0];
    const hasStation = !!destSys.station;
    const stPi = hasStation ? destSys.station.parentPlanetIdx : 0;
    const wantBerthed = !!berthed && hasStation;
    const sameBerth = S.docked && !wantBerthed && id === S.currentSystemId &&
      orbit.focusSoi === 'planet' && orbit.planetIdx === stPi;
    S.currentSystemId = destSys.id; S.dioramaSysId = destSys.id;
    ensureSystemGravity();
    if (!Array.isArray(S.discoveredSystems)) S.discoveredSystems = [];
    if (destSys.procedural && !S.discoveredSystems.includes(destSys.id)) S.discoveredSystems.push(destSys.id);
    if (!Array.isArray(S.visitedSystems)) S.visitedSystems = ['sol'];
    const newlySurveyed = destSys.procedural && !S.visitedSystems.includes(destSys.id);
    if (!S.visitedSystems.includes(destSys.id)) S.visitedSystems.push(destSys.id);
    S.projectiles = [];
    orbit.focusSoi = orbit.primary = 'planet'; orbit.planetIdx = stPi; orbit.moonIdx = 0;
    if (!sameBerth) {
      S.orbitFrame = 'planet'; S.moonIdx = 0;
      S.orbitPlan = null; S.selectedTargetId = null; S.customOrbitKm = null; lagrangeRef = null;
      S.lastImpact = null; S.lastRingCrossing = null;
      clearManeuverChain();
    }
    if (wantBerthed && !keepPosition) {
      S.hullIntegrity = 1; S.damageState = 'nominal'; S.destroyed = false; S.destroyedReason = '';
      S.combatAlertS = 0;
    }
    resetRotation();
    const planet = body('planet', stPi);
    if (hasStation) {
      const station = body('station', stPi);
      orbit.rKm = sub(station.rKm, planet.rKm); orbit.vKmS = sub(station.vKmS, planet.vKmS);
    } else {
      const pk = parkingState(destSys, S.simTimeS);
      orbit.rKm = pk.rKm.slice(); orbit.vKmS = pk.vKmS.slice();
    }
    if (keepPosition) {
      // Arrival guidance ends at this exact moving station/parking state; no spatial reset.
      const r = sub(mul(sub(S.posGal, sys().xyz), O.LY_KM), planet.rKm);
      if (len(sub(r, orbit.rKm)) < 25) orbit.rKm = r;
    }
    S.docked = wantBerthed; S.mode = wantBerthed ? 'docked' : 'orbit'; S.attitudeMode = 'PROGRADE';
    S.hudRel = false; S.hudFlight = false; relHudRegime = false; S.aberrationZoom = 1;
    S.thrustCmdG = 0; S.mission = null; S.burn = null; S.flip = false;
    S.velocityGal = null; S.emergencyBraking = false; S.cruiseAppliedG = 0; S.iceHarvestTrafficS = 0;
    clearIceHarvest();
    refreshOrbit(); alignBasis(orbit.vKmS, orbit.el.normalHat); updateGalPosition();
    S.eta = Math.atanh(clamp(len(starState().vKmS) / O.C_KMS, 0, 0.999999999)); S.beta = Math.tanh(S.eta); S.gamma = Math.cosh(S.eta);
    if (sceneCtrl) sceneCtrl.rebuildSystem(sys(), S.simTimeS, false);
    rebuildContacts();
    updateFrontierDiscovery(true);
    if (newlySurveyed) {
      const statusTxt = hasStation
        ? (destSys.faction + ' - ' + destSys.station.name.toUpperCase())
        : 'UNINHABITED - NO STATION';
      message('SYSTEM SURVEYED // ' + destSys.name.toUpperCase() + ' (' + statusTxt + ')');
    }
  }
  function undock(forceAstern = false) {
    if (S.destroyed) { message('Hull destroyed. Recommission at station.', 'critical'); return false; }
    if (!S.docked) return false;
    commitMenuDraft();
    enterSystemOrbit(S.currentSystemId, false); S.started=true; S.timeWarp = 1; setScreen('helm', true);
    rebuildShip();
    if (sceneCtrl) {
      sceneCtrl.resetCamera();
      const preset = CAM_VIEW_PRESETS[S.camViewMode] || CAM_VIEW_PRESETS.low;
      if (forceAstern || !S.camLock) {
        sceneCtrl.cam.orbitYaw = preset.yaw;
        sceneCtrl.cam.orbitPitch = preset.pitch;
        sceneCtrl.cam.orbitZoom = preset.zoom;
        sceneCtrl.cam.zoomTarget = null;
      }
    }
    S.camSnapActive = false;
    // Keep circular orbital velocity plus a gentle separation along -prograde/-normal/+radial
    // so the station stays clearly framed ahead-port in open sky (~3.4 km) in the forward chase view.
    const eU = orbit.el;
    orbit.rKm = add(orbit.rKm, add(mul(eU.progradeHat, -3.2), add(mul(eU.normalHat, -0.42), mul(eU.radialHat, 1.1))));
    orbit.vKmS = add(orbit.vKmS, add(mul(eU.radialHat, 0.0025), mul(eU.progradeHat, -0.0012)));
    refreshOrbit(); updateGalPosition();
    message('Undocked into station circular orbit.'); return true;
  }
  function launchAndUndock() {
    if (S.destroyed) { message('Hull destroyed. Recommission at station.', 'critical'); return false; }
    if (S.docked) return undock(true);
    commitMenuDraft();
    setScreen('helm', true);
    if (sceneCtrl) {
      sceneCtrl.resetCamera();
      const preset = CAM_VIEW_PRESETS[S.camViewMode] || CAM_VIEW_PRESETS.low;
      sceneCtrl.cam.orbitYaw = preset.yaw;
      sceneCtrl.cam.orbitPitch = preset.pitch;
      sceneCtrl.cam.orbitZoom = preset.zoom;
      sceneCtrl.cam.zoomTarget = null;
    }
    S.camSnapActive = false;
    return true;
  }
  function refuelAndReglaze(quiet) {
    if (!S.docked) { message('Dock at a station to re-glaze the ice and cool the core.', 'elevated'); return false; }
    updateRocket(); S.iceIntegrity = 1; S.hullIntegrity = 1; S.damageState = 'nominal'; S.destroyed = false; S.destroyedReason = '';
    S.coreHeat = 0; S.thermalLoad = 0; S.thermalState = 'nominal'; S.thermalGovernor = false; S.warning = null;
    S.ablation = { intensity: 0, iceLoss: 0, warningLevel: 'nominal' };
    if (sceneCtrl) sceneCtrl.setIceIntegrity(1);
    if (quiet !== true) message('Docked. Hull repaired, ice shield re-glazed and Conjoiner core cooled.');
    return true;
  }
  function dock() {
    if (!sys().station) { message('Uninhabited system -- no station berth. Harvest ice via DropShips.', 'elevated'); return false; }
    const stEnt = combatBySys[S.currentSystemId]?.['body:station'];
    if (stEnt?.destroyed || stEnt?.state === 'destroyed') { message('Station destroyed -- docking clamps gone.', 'critical'); return false; }
    if (stEnt?.hostile) { message('Station hostile -- docking denied.', 'critical'); return false; }
    if (!S.docked && !stationRelative().inRange) { message('Match station position and velocity before docking.', 'elevated'); return false; }
    clearMultiHop(); enterSystemOrbit(S.currentSystemId, true); S.timeWarp = 1; S.mouseSteer = [0, 0]; S.mouseSteerVisual = null; refuelAndReglaze(); return true;
  }
  function setFocusSoi(kind, planetIdx, moonIdx, keepBurn = false) {
    if (S.mode === 'interstellar') return;
    ensureSystemGravity();
    S.orbitFrame = ['star', 'moon', 'target', 'synodic'].includes(kind) ? kind : 'planet';
    if (Number.isInteger(moonIdx)) S.moonIdx = moonIdx;
    if (S.burn?.isBrachistochrone) return;
    const nextPlanet = Number.isInteger(planetIdx) && sys().planets[planetIdx] ? planetIdx : orbit.planetIdx;
    const nextMoon = Number.isInteger(moonIdx) ? moonIdx : (S.moonIdx || 0);
    // Switching camera view to a moon only changes physics primary when inside that moon's Hill sphere.
    if (S.orbitFrame === 'moon') {
      const m = sys().planets[nextPlanet]?.moons?.[nextMoon];
      if (m && m.rHillKm > 0) {
        const world = starState(), mSt = body('moon', nextPlanet, nextMoon);
        if (len(sub(world.rKm, mSt.rKm)) <= m.rHillKm * 1.05) {
          if (orbit.primary !== 'moon' || orbit.planetIdx !== nextPlanet || orbit.moonIdx !== nextMoon) {
            switchPhysicsPrimary({ kind: 'moon', planetIdx: nextPlanet, moonIdx: nextMoon });
            message('Gravity primary: ' + m.name.toUpperCase() + ' SOI.');
          }
        }
      }
      return;
    }
    // While physically bound inside a moon's Hill sphere, changing view frame never detaches moon gravity.
    if (orbit.primary === 'moon') {
      const curMoon = currentPrimaryBody();
      if (curMoon && curMoon.rHillKm > 0 && len(orbit.rKm) <= curMoon.rHillKm * 1.05) return;
    }
    const focus = S.orbitFrame === 'star' ? 'star' : 'planet';
    if (focus === orbit.focusSoi && nextPlanet === orbit.planetIdx) return;
    if (focus === 'star') {
      const worldNow = starState();
      soiSkipPlanetIdx = -1;
      for (let pi = 0; pi < sys().planets.length; pi++) {
        const p = sys().planets[pi];
        if (p.rHillKm > 0 && len(sub(worldNow.rKm, body('planet', pi).rKm)) < p.rHillKm * 1.05) {
          soiSkipPlanetIdx = pi;
          break;
        }
      }
    }
    switchPhysicsPrimary(focus === 'star' ? { kind: 'star' } : { kind: 'planet', planetIdx: nextPlanet });
    const preserve = keepBurn || (S.burn && S.burn.active) || S.maneuverChain.length > 0;
    if (!preserve && S.burn) { S.burn = null; S.thrustCmdG = 0; }
    if (!preserve) { S.selectedTargetId = null; S.customOrbitKm = null; S.orbitPlan = null; lagrangeRef = null; }
    if (preserve && S.selectedTargetId) {
      const stillValid = targets().find(t => t.id === S.selectedTargetId);
      if (stillValid) {
        S.orbitPlan = O.planHohmannTransfer(orbit.rKm, orbit.vKmS, orbit.muKm3S2,
          Object.assign({}, stillValid, { maxAccelKmS2: rocket.maxAccelG * O.G0_KMS2 }));
      }
    }
    message('Reference frame: ' + (focus === 'star' ? 'STAR' : sys().planets[nextPlanet].name.toUpperCase()) + ' SOI.');
  }
  function moonTargets() {
    const p = sys().planets[orbit.planetIdx], m = p?.moons?.[orbit.moonIdx];
    if (!m) return [];
    const r = orbit.el?.radiusKm || len(orbit.rKm);
    const lowR = O.safeOrbitRadiusKm(m.radiusKm, m.rHillKm, true, O.bodyAtmosphereAltKm(m, 'moon'));
    const polarR = Math.min(Math.max(lowR * 1.25, m.radiusKm * 1.8), m.rHillKm > 0 ? m.rHillKm * 0.55 : lowR * 2);
    const highR = Math.min(Math.max(lowR * 2.2, m.radiusKm * 4.0), m.rHillKm > 0 ? m.rHillKm * 0.72 : lowR * 4);
    const name = m.name.toUpperCase();
    const list = [
      { id: 'circularize', label: 'CIRCULARIZE', kind: 'circularize', radiusKm: r, rpKm: r, raKm: r, incRad: orbit.el?.iRad || 0, lanRad: orbit.el?.omegaAscRad || 0 },
      { id: 'low-orbit', label: 'LOW ' + name, kind: 'low-orbit', radiusKm: lowR, rpKm: lowR, raKm: lowR, incRad: 0, lanRad: 0 },
      { id: 'polar', label: 'POLAR ' + name, kind: 'plane-change', radiusKm: polarR, rpKm: polarR, raKm: polarR, incRad: PI / 2, lanRad: 0 },
      { id: 'high-orbit', label: 'HIGH ' + name, kind: 'high-orbit', radiusKm: highR, rpKm: highR, raKm: highR, incRad: 0, lanRad: 0 },
      { id: 'escape', label: 'ESCAPE TO ' + p.name.toUpperCase(), kind: 'escape', radiusKm: r, rpKm: r, raKm: r, incRad: 0, lanRad: 0 }
    ];
    return list;
  }
  function promotePrimaryForTarget(target) {
    const req = target?.primaryReq;
    if (!req) return false;
    if (req.kind === 'star' && orbit.primary !== 'star') {
      const departPi = orbit.planetIdx;
      if (switchPhysicsPrimary({ kind: 'star' })) {
        soiSkipPlanetIdx = departPi;
        S.orbitFrame = 'star';
        clearManeuverChain();
        S.orbitPlan = null;
        return true;
      }
    } else if (req.kind === 'planet' && (orbit.primary !== 'planet' || orbit.planetIdx !== req.planetIdx)) {
      if (switchPhysicsPrimary({ kind: 'planet', planetIdx: req.planetIdx })) {
        S.orbitFrame = 'planet';
        S.moonIdx = 0;
        clearManeuverChain();
        S.orbitPlan = null;
        return true;
      }
    }
    return false;
  }
  function makeCrossSoiBodyTarget(ref) {
    if (!ref || (ref.kind !== 'planet' && ref.kind !== 'moon')) return null;
    const b = bodyRecord(ref);
    if (!b) return null;
    const safeR = O.safeOrbitRadiusKm(b.radiusKm, b.rHillKm, ref.kind === 'moon', O.bodyAtmosphereAltKm(b, ref.kind));
    if (ref.kind === 'planet') {
      const samePlanet = orbit.primary === 'moon' && orbit.planetIdx === ref.planetIdx;
      const orbitR = samePlanet ? safeR : (b.orbitRadiusAU || 0) * O.AU_KM;
      return {
        id: b.id, label: b.name.toUpperCase(), kind: 'planet',
        radiusKm: orbitR, rpKm: orbitR, raKm: orbitR, incRad: b.incRad || 0, lanRad: b.lanRad || 0,
        focusRef: ref, safeCaptureRadiusKm: safeR, crossSoi: true,
        primaryReq: samePlanet ? { kind: 'planet', planetIdx: ref.planetIdx } : { kind: 'star' }
      };
    }
    const orbitR = b.orbitRadiusKm || (b.orbitRadiusAU || 0) * O.AU_KM;
    return {
      id: b.id, label: b.name.toUpperCase(), kind: 'moon',
      radiusKm: orbitR, rpKm: orbitR, raKm: orbitR, incRad: b.incRad || 0, lanRad: b.lanRad || 0,
      focusRef: ref, safeCaptureRadiusKm: safeR, crossSoi: true,
      primaryReq: orbit.planetIdx === ref.planetIdx ? { kind: 'planet', planetIdx: ref.planetIdx } : { kind: 'star' }
    };
  }
  const targets = () => {
    ensureSystemGravity();
    const list = orbit.primary === 'moon'
      ? moonTargets()
      : Galaxy.getSystemTargetOrbits(sys(), orbit.focusSoi === 'star' ? -1 : orbit.planetIdx,
          orbit.rKm, orbit.muKm3S2, S.simTimeS).map(item => {
          if (item.focusRef && (item.focusRef.kind === 'moon' || item.focusRef.kind === 'planet')) {
            const b = bodyRecord(item.focusRef);
            if (b) {
              return Object.assign({}, item, {
                safeCaptureRadiusKm: O.safeOrbitRadiusKm(b.radiusKm, b.rHillKm, item.focusRef.kind === 'moon', O.bodyAtmosphereAltKm(b, item.focusRef.kind))
              });
            }
          }
          return item;
        });
    if (orbit.primary === 'planet' || orbit.primary === 'moon') {
      const seen = new Set(list.map(item => item.id));
      const planets = sys().planets || [];
      if (orbit.primary === 'moon') {
        const host = makeCrossSoiBodyTarget({ kind: 'planet', planetIdx: orbit.planetIdx });
        if (host && !seen.has(host.id)) { list.push(host); seen.add(host.id); }
      }
      for (let pi = 0; pi < planets.length; pi++) {
        if (pi === orbit.planetIdx) continue;
        const sister = makeCrossSoiBodyTarget({ kind: 'planet', planetIdx: pi });
        if (sister && !seen.has(sister.id)) { list.push(sister); seen.add(sister.id); }
      }
    }
    const lagrange = getLagrangeTarget(lagrangeRef);
    if (lagrange) list.unshift(lagrange);
    if (Number.isFinite(S.customOrbitKm) && S.customOrbitKm > orbit.bodyRadiusKm * 1.04) {
      const alt = Math.max(0, S.customOrbitKm - orbit.bodyRadiusKm);
      const lbl = alt >= 0.05 * O.AU_KM ? (alt / O.AU_KM).toFixed(2) + ' AU' : alt >= 1e6 ? (alt / 1e6).toFixed(2) + ' Mkm' : Math.round(alt).toLocaleString('en-US') + ' km';
      list.unshift({
        id: 'custom', label: 'CUSTOM ORBIT (' + lbl + ')', kind: 'custom',
        radiusKm: S.customOrbitKm, rpKm: S.customOrbitKm, raKm: S.customOrbitKm, incRad: 0, lanRad: 0
      });
    }
    if (Galaxy.getSystemIceDeposits && Galaxy.getIceDepositWorldState) {
      const deps = Galaxy.getSystemIceDeposits(sys());
      const originSt = orbit.primary === 'star' ? { rKm: [0, 0, 0], vKmS: [0, 0, 0] }
        : Galaxy.getBodyWorldState(sys(), currentPrimaryRef(), S.simTimeS);
      for (const dep of deps) {
        const pRef = dep.parentRef || { kind: 'star' };
        const sameSoi = pRef.kind === orbit.primary &&
          (pRef.kind === 'star' || (pRef.planetIdx === orbit.planetIdx && (pRef.kind !== 'moon' || pRef.moonIdx === orbit.moonIdx)));
        const depW = Galaxy.getIceDepositWorldState(sys(), dep, S.simTimeS);
        if (sameSoi) {
          list.push({
            id: dep.id,
            label: 'ICE \u00b7 ' + dep.name.toUpperCase(),
            kind: 'ice-deposit',
            radiusKm: dep.orbitRadiusKm,
            rpKm: dep.orbitRadiusKm,
            raKm: dep.orbitRadiusKm,
            incRad: dep.incRad || 0,
            lanRad: 0,
            targetPosKm: sub(depW.rKm, originSt.rKm),
            targetVelKmS: sub(depW.vKmS, originSt.vKmS),
            focusRef: pRef,
            deposit: dep
          });
        } else {
          const fallbackRef = pRef.kind === 'star' ? { kind: 'star' } : { kind: pRef.kind, planetIdx: pRef.planetIdx, moonIdx: pRef.moonIdx || 0 };
          const crossBase = pRef.kind === 'star' ? { radiusKm: dep.orbitRadiusKm, incRad: dep.incRad || 0, crossSoi: true, primaryReq: { kind: 'star' } }
            : makeCrossSoiBodyTarget(fallbackRef);
          if (crossBase) {
            list.push({
              id: dep.id,
              label: 'ICE \u00b7 ' + dep.name.toUpperCase(),
              kind: 'ice-deposit',
              radiusKm: crossBase.radiusKm,
              rpKm: crossBase.radiusKm,
              raKm: crossBase.radiusKm,
              incRad: crossBase.incRad || 0,
              lanRad: 0,
              focusRef: pRef,
              deposit: dep,
              safeCaptureRadiusKm: crossBase.safeCaptureRadiusKm,
              crossSoi: crossBase.crossSoi,
              primaryReq: crossBase.primaryReq
            });
          }
        }
      }
    }
    return list;
  };
  let cachedTargetsKey = '', cachedTargetsAt = 0, cachedTargetsList = [];
  function computeTargetOrbitsForSnapshot() {
    if (S.mode === 'interstellar' && !S.multiHop.harvesting) return [];
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const key = [S.currentSystemId, orbit.primary, orbit.planetIdx, orbit.moonIdx,
      Number.isFinite(S.customOrbitKm) ? Math.round(S.customOrbitKm) : '',
      lagrangeRef ? lagrangeRef.id : '', Math.round((orbit.el?.radiusKm || 0) / 100)].join('|');
    if (cachedTargetsKey === key && now - cachedTargetsAt < 250 && cachedTargetsList.length) return cachedTargetsList;
    const accel = Math.max(0.05, sustainableG()) * O.G0_KMS2;
    const list = targets().map(tg => {
      const out = Object.assign({}, tg);
      try {
        let rRef = orbit.rKm, vRef = orbit.vKmS, muRef = orbit.muKm3S2;
        if (tg.crossSoi && tg.primaryReq) {
          if (tg.primaryReq.kind === 'star') {
            const st = starState();
            rRef = st.rKm; vRef = st.vKmS; muRef = sys().muStarKm3S2;
          } else if (tg.primaryReq.kind === 'planet') {
            const st = starState(), pSt = body('planet', tg.primaryReq.planetIdx);
            const pRec = sys().planets[tg.primaryReq.planetIdx];
            if (pRec && pSt) {
              rRef = sub(st.rKm, pSt.rKm); vRef = sub(st.vKmS, pSt.vKmS); muRef = pRec.muKm3S2;
            }
          }
        }
        const plan = O.planHohmannTransfer(rRef, vRef, muRef,
          Object.assign({}, tg, { maxAccelKmS2: accel }));
        out.dvKmS = plan.totalDvKmS;
        out.transferS = (plan.transferTimeS || 0) + (plan.waitTimeS || 0);
        out.burnS = out.dvKmS / accel;
        out.plan = plan;
      } catch (e) { out.plan = null; }
      return out;
    });
    cachedTargetsKey = key; cachedTargetsAt = now; cachedTargetsList = list;
    return list;
  }
  function getLagrangeTarget(ref, timeS = S.simTimeS) {
    if (!ref) return null;
    ensureSystemGravity();
    const p = sys().planets[ref.planetIdx];
    const moon = p.moons[ref.moonIdx];
    const primary = Galaxy.getBodyWorldState(sys(), {kind:ref.starPair ? 'star' : 'planet', planetIdx:ref.planetIdx}, timeS);
    const secondary = Galaxy.getBodyWorldState(sys(), {
      kind:ref.starPair ? 'planet' : 'moon', planetIdx:ref.planetIdx, moonIdx:ref.moonIdx
    }, timeS);
    const origin = Galaxy.getBodyWorldState(sys(), currentPrimaryRef(), timeS);
    const primaryMu = ref.starPair ? sys().muStarKm3S2 : p.muKm3S2;
    const secondaryMu = ref.starPair ? p.muKm3S2 : moon.muKm3S2;
    const relativeV = sub(secondary.vKmS, primary.vKmS);
    const point = O.computeLagrangePoints(sub(primary.rKm, origin.rKm), sub(secondary.rKm, origin.rKm),
      primaryMu, secondaryMu, relativeV).find(point => point.id === ref.id);
    if (!point) return null;
    const targetVelKmS = add(point.vKmS, sub(primary.vKmS, origin.vKmS));
    const radiusKm = len(point.rKm);
    const normal = cross(point.rKm, targetVelKmS), node = cross([0, 0, 1], normal);
    return { ...point, label: point.id + ' RENDEZVOUS', radiusKm, rpKm: radiusKm, raKm: radiusKm,
      incRad: Math.acos(clamp(unit(normal)[2], -1, 1)), lanRad: Math.atan2(node[1], node[0]),
      targetPosKm: point.rKm, targetVelKmS };
  }
  function plotLagrangeOrbit(lId) {
    if (S.mode === 'interstellar' || !/^L[1-5]$/.test(lId) || !O.computeLagrangePoints) return null;
    const frame = S.orbitFrame, p = sys().planets[orbit.planetIdx];
    const starPair = frame === 'star' || !p.moons[S.moonIdx];
    if (starPair && orbit.focusSoi !== 'star') {
      setFocusSoi('star');
      S.orbitFrame = frame;
    }
    lagrangeRef = {id:lId, planetIdx:orbit.planetIdx, moonIdx:S.moonIdx, starPair};
    return plotTargetOrbit(lId);
  }
  function selectCustomOrbit(radiusKm) {
    const r = Number(radiusKm);
    if (!Number.isFinite(r) || r <= orbit.bodyRadiusKm * 1.04) return null;
    S.customOrbitKm = r;
    return plotTargetOrbit('custom');
  }
  function resolveTargetById(id) {
    const list = targets();
    if (!id) return list.find(t => t.id === S.selectedTargetId) || null;
    const low = String(id).toLowerCase();
    const direct = list.find(t => t.id === id) ||
      list.find(t => String(t.label || '').toLowerCase() === low) ||
      list.find(t => t.focusRef && String(bodyRecord(t.focusRef)?.name || '').toLowerCase() === low);
    if (direct) return direct;
    const planets = sys().planets || [];
    for (let pi = 0; pi < planets.length; pi++) {
      const p = planets[pi];
      if (p.id === id || String(p.name || '').toLowerCase() === low) {
        return makeCrossSoiBodyTarget({ kind: 'planet', planetIdx: pi });
      }
      for (let mi = 0; mi < (p.moons || []).length; mi++) {
        const m = p.moons[mi];
        if (m.id === id || String(m.name || '').toLowerCase() === low) {
          return makeCrossSoiBodyTarget({ kind: 'moon', planetIdx: pi, moonIdx: mi });
        }
      }
    }
    return null;
  }
  function safeTargetOffsetState(ref, shipRefR, timeS, opts = {}) {
    ensureSystemGravity();
    const world = bodyRecord(ref);
    const origin = orbit.primary === 'star'
      ? { rKm: [0, 0, 0], vKmS: [0, 0, 0] }
      : Galaxy.getBodyWorldState(sys(), currentPrimaryRef(), timeS);
    const moving = Galaxy.getBodyWorldState(sys(), ref, timeS);
    const rKm = sub(moving.rKm, origin.rKm), vKmS = sub(moving.vKmS, origin.vKmS);
    if (!world || (ref.kind !== 'moon' && ref.kind !== 'planet')) return { rKm, vKmS, captureRadiusKm: 0 };
    const isMoon = ref.kind === 'moon';
    const radius = O.safeOrbitRadiusKm(world.radiusKm, world.rHillKm, isMoon, O.bodyAtmosphereAltKm(world, ref.kind));
    let radial = unit(sub(shipRefR, rKm));
    const normal = orbit.el?.normalHat || [0, 0, 1];
    const axis = Math.abs(dot(normal, radial)) < 0.99 ? normal :
      (Math.abs(radial[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0]);
    const ortho = unit(cross(axis, radial));
    const phaseShift = Number(opts.phaseShift) || 0;
    if (phaseShift) {
      radial = unit(add(mul(radial, Math.cos(phaseShift)), mul(ortho, Math.sin(phaseShift))));
    }
    let tangentSign = opts.tangentSign === -1 ? -1 : 1;
    let tangent = unit(cross(axis, radial));
    if (opts.alignIncoming && opts.tangentSign == null) {
      const incomingDir = unit(sub(rKm, shipRefR));
      if (dot(tangent, incomingDir) < 0) tangentSign = -1;
    }
    tangent = mul(tangent, tangentSign);
    return {
      rKm: add(rKm, mul(radial, radius)),
      vKmS: add(vKmS, mul(tangent, Math.sqrt(world.muKm3S2 / radius))),
      bodyCenterKm: rKm,
      bodyRadiusKm: world.radiusKm,
      captureRadiusKm: radius
    };
  }
  function plotTargetOrbit(id) {
    if (id && typeof id === 'object') id = id.targetId || id.id;
    if (S.mode === 'interstellar' && nearestStarInfo().distLy > LIGHT_WEEK_LY) return null;
    let resolved = resolveTargetById(id || S.selectedTargetId);
    if (!resolved) return null;
    const prevTargetId = S.selectedTargetId;
    if (resolved.crossSoi) {
      if (S.burn?.active) {
        message('Cancel active burn before switching SOI targets.', 'elevated');
        return null;
      }
      if (promotePrimaryForTarget(resolved)) {
        resolved = resolveTargetById(resolved.id) || resolved;
      }
    }
    S.selectedTargetId = resolved.id;
    if (!S.burn?.active && S.maneuverChain.length && S.maneuverChain[0]?.id === 'orbit-dep' && prevTargetId !== resolved.id) {
      clearManeuverChain();
    }
    const minSafeR = orbit.bodyRadiusKm + O.bodyAtmosphereAltKm(currentPrimaryBody(), orbit.primary) + 150;
    const safeTarget = resolved.kind !== 'escape' && Number.isFinite(resolved.radiusKm) && resolved.radiusKm < minSafeR
      ? Object.assign({}, resolved, { radiusKm: minSafeR, rpKm: minSafeR, raKm: Math.max(minSafeR, resolved.raKm || minSafeR) })
      : resolved;
    const plan = O.planHohmannTransfer(orbit.rKm, orbit.vKmS, orbit.muKm3S2,
      Object.assign({}, safeTarget, { maxAccelKmS2: rocket.maxAccelG * O.G0_KMS2 }));
    const surfaceIntercept = safeTarget.kind !== 'escape' && plan.predictedTransferEl &&
      plan.predictedTransferEl.rp <= orbit.bodyRadiusKm * 1.02;
    plan.surfaceIntercept = !!surfaceIntercept;
    if (safeTarget.focusRef && (safeTarget.focusRef.kind === 'moon' || safeTarget.focusRef.kind === 'planet')) {
      plan.targetRef = safeTarget.focusRef;
      plan.captureRadiusKm = safeTarget.safeCaptureRadiusKm || null;
    }
    S.orbitPlan = plan;
    S.vectorsUserHidden = false;
    return plan;
  }
  function toPnrNode(id, kind, label, dtS, rKm, vKmS, dvVecKmS, extra) {
    const el = O.stateToElements(rKm, vKmS, orbit.muKm3S2);
    const proHat = cross(el.normalHat, el.radialHat);
    return Object.assign({
      id, kind, label, dtS,
      dvP: dot(dvVecKmS, proHat),
      dvN: dot(dvVecKmS, el.normalHat),
      dvR: dot(dvVecKmS, el.radialHat)
    }, extra || {});
  }
  function circularizeOrbit(mode = 'now') {
    if (S.mode === 'interstellar') {
      return { valid: false, alreadyCircular: false, dvKmS: 0, primaryLabel: 'INTERSTELLAR', altitudeKm: NaN, mode };
    }
    const m = ['now', 'pe', 'ap'].includes(mode) ? mode : 'now';
    const primaryLabel = currentPrimaryLabel();
    const res = O.planCircularizationBurn(orbit.rKm, orbit.vKmS, orbit.muKm3S2, m);
    const altitudeKm = Math.max(0, (res.radiusKm || orbit.el.radiusKm) - orbit.bodyRadiusKm);
    if (!res.valid) {
      message('NO APOAPSIS ON ESCAPE TRAJECTORY AROUND ' + primaryLabel + '.', 'elevated');
      return { valid: false, alreadyCircular: false, dvKmS: 0, primaryLabel, altitudeKm, mode: m, reason: res.reason };
    }
    if (res.alreadyCircular) {
      clearManeuverChain();
      S.orbitPlan = null;
      message('ALREADY CIRCULAR AROUND ' + primaryLabel + ' (dv ' + res.dvKmS.toFixed(2) + ' km/s)');
      return { valid: true, alreadyCircular: true, dvKmS: res.dvKmS, primaryLabel, altitudeKm, mode: m, dtS: res.dtS };
    }
    const node = {
      id: 'circ-' + m,
      kind: 'circularize',
      label: 'CIRC ' + primaryLabel + (m !== 'now' ? ' @ ' + m.toUpperCase() : ''),
      dtS: res.dtS,
      dvP: res.dvP,
      dvN: res.dvN,
      dvR: res.dvR
    };
    S.orbitPlan = null;
    setManeuverChain([node], 0);
    message('CIRCULARIZE AROUND ' + primaryLabel + ' (dv ' + res.dvKmS.toFixed(2) + ' km/s)');
    return { valid: true, alreadyCircular: false, dvKmS: res.dvKmS, primaryLabel, altitudeKm, mode: m, dtS: res.dtS, burns: S.maneuverChain.slice() };
  }
  function plotOrbitCapture(targetId, opts = {}) {
    if (targetId && typeof targetId === 'object') { opts = targetId; targetId = opts.targetId || opts.id; }
    if (S.mode === 'interstellar') return { valid: false, reason: 'interstellar' };
    ensureSystemGravity();
    let target = resolveTargetById(targetId || S.selectedTargetId);
    if (!target) {
      const list = targets();
      target = list.find(t => t.kind === 'moon') || list.find(t => t.kind === 'planet') || list.find(t => t.kind === 'station') || list.find(t => t.id === 'low-orbit') || null;
    }
    if (!target) {
      message('No capture target selected.', 'elevated');
      return { valid: false, reason: 'no-target' };
    }
    if (target.crossSoi) {
      if (S.burn?.active) {
        message('Cancel active burn before plotting a cross-SOI capture.', 'elevated');
        return { valid: false, reason: 'burn-active' };
      }
      if (promotePrimaryForTarget(target)) {
        target = resolveTargetById(target.id) || target;
      }
    }
    S.selectedTargetId = target.id;
    S.vectorsUserHidden = false;
    const primaryLabel = currentPrimaryLabel();
    const ref = target.focusRef;
    if (target.kind === 'ice-deposit' && target.deposit) {
      const pRef = target.deposit.parentRef || { kind: 'star' };
      const sameIcePrimary = pRef.kind === orbit.primary &&
        (pRef.kind === 'star' || (pRef.planetIdx === orbit.planetIdx && (pRef.kind !== 'moon' || pRef.moonIdx === orbit.moonIdx)));
      if (sameIcePrimary) {
        const rTgt = Math.max(orbit.bodyRadiusKm * 1.08, target.deposit.orbitRadiusKm);
        const hoh = O.planHohmannTransfer(orbit.rKm, orbit.vKmS, orbit.muKm3S2, { radiusKm: rTgt });
        const inward = rTgt < len(orbit.rKm);
        const end = O.elementsToState({ ...hoh.predictedTransferEl, nuRad: inward ? 0 : PI }, orbit.muKm3S2);
        const vCirc = mul(unit(end.vKmS), Math.sqrt(orbit.muKm3S2 / rTgt));
        const burns = [
          toPnrNode('orbit-dep', 'orbit', 'ICE ' + target.deposit.name.toUpperCase() + ' DEP', 0, orbit.rKm, orbit.vKmS, hoh.dv1VecKmS),
          toPnrNode('orbit-cap', 'orbit', 'ICE ' + target.deposit.name.toUpperCase() + ' RNDZ', hoh.transferTimeS, end.rKm, end.vKmS, sub(vCirc, end.vKmS))
        ];
        S.orbitPlan = null;
        setManeuverChain(burns, burns.length - 1, true);
        autoCaptureTargetId = target.id;
        autoCapturePlottedAt = S.simTimeS;
        if (opts.execute) executeManeuverChain(burns);
        return { valid: true, targetId: target.id, targetLabel: target.label, primaryLabel,
          totalDvKmS: hoh.totalDvKmS, transferTimeS: hoh.transferTimeS, captureAltKm: Math.max(0, rTgt - orbit.bodyRadiusKm),
          burns: burns.slice(), alreadyInOrbit: false };
      }
    }
    if (ref && (ref.kind === 'moon' || ref.kind === 'planet')) {
      const destBody = bodyRecord(ref);
      const isMoon = ref.kind === 'moon';
      const safeR = O.safeOrbitRadiusKm(destBody.radiusKm, destBody.rHillKm, isMoon, O.bodyAtmosphereAltKm(destBody, ref.kind));
      const captureAltKm = Math.max(0, safeR - destBody.radiusKm);
      const samePrimary = orbit.primary === ref.kind && orbit.planetIdx === ref.planetIdx &&
        (!isMoon || orbit.moonIdx === ref.moonIdx);
      if (samePrimary) {
        if (Math.abs(len(orbit.rKm) - safeR) < 5 && orbit.el.e < 0.01) {
          const circ = circularizeOrbit('now');
          return Object.assign(circ, { targetId: target.id, targetLabel: target.label, captureAltKm, alreadyInOrbit: true });
        }
        const hoh = O.planHohmannTransfer(orbit.rKm, orbit.vKmS, orbit.muKm3S2, { radiusKm: safeR });
        const inward = safeR < len(orbit.rKm);
        const end = O.elementsToState({ ...hoh.predictedTransferEl, nuRad: inward ? 0 : PI }, orbit.muKm3S2);
        const vCirc = mul(unit(end.vKmS), Math.sqrt(orbit.muKm3S2 / safeR));
        const burns = [
          toPnrNode('orbit-dep', 'orbit', 'ORBIT ' + destBody.name.toUpperCase() + ' DEP', 0, orbit.rKm, orbit.vKmS, hoh.dv1VecKmS),
          toPnrNode('orbit-cap', 'orbit', 'ORBIT ' + destBody.name.toUpperCase() + ' CAP', hoh.transferTimeS, end.rKm, end.vKmS, sub(vCirc, end.vKmS))
        ];
        S.orbitPlan = null;
        setManeuverChain(burns, burns.length - 1, true);
        autoCaptureTargetId = target.id;
        autoCapturePlottedAt = S.simTimeS;
        if (opts.execute) executeManeuverChain(burns);
        return { valid: true, targetId: target.id, targetLabel: target.label, primaryLabel, totalDvKmS: hoh.totalDvKmS,
          transferTimeS: hoh.transferTimeS, captureAltKm, burns: burns.slice(), alreadyInOrbit: false };
      }
      const orbitR = destBody.orbitRadiusKm ?? (destBody.orbitRadiusAU || 0) * O.AU_KM;
      const scaleTime = PI * Math.sqrt(((len(orbit.rKm) + orbitR) / 2) ** 3 / orbit.muKm3S2);
      const factors = orbit.primary === 'star'
        ? [0.22, 0.34, 0.48, 0.65, 0.85, 1.0, 1.25, 1.6, 2.0, 2.5]
        : [0.55, 0.68, 0.82, 0.96, 1.12, 1.32, 1.56, 1.85, 2.2, 2.6];
      const inc = destBody.incRad || 0, side = [0, Math.cos(inc), Math.sin(inc)];
      const vCircDest = Math.sqrt(destBody.muKm3S2 / safeR);
      const primaryClearR = orbit.bodyRadiusKm + O.bodyAtmosphereAltKm(currentPrimaryBody(), orbit.primary) + 200;
      const destClearR = destBody.radiusKm + O.bodyAtmosphereAltKm(destBody, ref.kind) + 220;
      const departPlanetIdx = orbit.primary === 'star' && soiSkipPlanetIdx >= 0 && soiSkipPlanetIdx !== ref.planetIdx ? soiSkipPlanetIdx : -1;
      const departBody = departPlanetIdx >= 0 ? sys().planets[departPlanetIdx] : null;
      const departClearR = departBody ? departBody.radiusKm + O.bodyAtmosphereAltKm(departBody, 'planet') + 200 : 0;
      const segFracs = [];
      for (let k = 1; k <= 14; k++) segFracs.push((0.78 * k) / 14);
      for (let k = 1; k <= 12; k++) segFracs.push(0.78 + (0.22 * k) / 12);
      const siblingObstacles = [];
      if (orbit.primary === 'star') {
        const planets = sys().planets || [];
        for (let pi = 0; pi < planets.length; pi++) {
          if (ref.kind === 'planet' && ref.planetIdx === pi) continue;
          const pl = planets[pi];
          siblingObstacles.push({
            ref: { kind: 'planet', planetIdx: pi },
            clearR: pl.radiusKm + O.bodyAtmosphereAltKm(pl, 'planet') + 200
          });
        }
      } else if (orbit.primary === 'planet') {
        const pCur = sys().planets[orbit.planetIdx];
        const moons = (pCur && pCur.moons) || [];
        for (let mi = 0; mi < moons.length; mi++) {
          if (ref.kind === 'moon' && ref.planetIdx === orbit.planetIdx && ref.moonIdx === mi) continue;
          const mn = moons[mi];
          siblingObstacles.push({
            ref: { kind: 'moon', planetIdx: orbit.planetIdx, moonIdx: mi },
            clearR: mn.radiusKm + O.bodyAtmosphereAltKm(mn, 'moon') + 160
          });
        }
      }
      let best = null;
      const runCaptureSearch = planeTilt => {
        const sTilt = Math.sin(planeTilt), cTilt = Math.cos(planeTilt);
        const sideTilted = add(mul(side, cTilt), mul(unit(cross([1, 0, 0], side)), sTilt));
        for (const factor of factors) {
          const dt = scaleTime * factor, tArr = S.simTimeS + dt;
          const parentArr = orbit.primary === 'star' ? { rKm: [0, 0, 0], vKmS: [0, 0, 0] }
            : Galaxy.getBodyWorldState(sys(), currentPrimaryRef(), tArr);
          const destArr = Galaxy.getBodyWorldState(sys(), ref, tArr);
          const destRelR = sub(destArr.rKm, parentArr.rKm), destRelV = sub(destArr.vKmS, parentArr.vKmS);
          // Cache body positions at each time slice once per dt across all phase angles.
          const stepTimes = [S.simTimeS];
          const origCache = [orbit.primary === 'star' ? [0, 0, 0] : Galaxy.getBodyWorldState(sys(), currentPrimaryRef(), S.simTimeS).rKm];
          const destCache = [sub(Galaxy.getBodyWorldState(sys(), ref, S.simTimeS).rKm, origCache[0])];
          const sibCache = [siblingObstacles.map(o => sub(Galaxy.getBodyWorldState(sys(), o.ref, S.simTimeS).rKm, origCache[0]))];
          for (let si = 0; si < segFracs.length; si++) {
            const tSub = S.simTimeS + dt * segFracs[si];
            const oP = orbit.primary === 'star' ? [0, 0, 0] : Galaxy.getBodyWorldState(sys(), currentPrimaryRef(), tSub).rKm;
            stepTimes.push(tSub);
            origCache.push(oP);
            destCache.push(si === segFracs.length - 1 ? destRelR : sub(Galaxy.getBodyWorldState(sys(), ref, tSub).rKm, oP));
            sibCache.push(siblingObstacles.map(o => sub(Galaxy.getBodyWorldState(sys(), o.ref, tSub).rKm, oP)));
          }
          for (const phase of [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]) {
            const ang = 2 * PI * phase;
            const pHat = unit(add(mul([1, 0, 0], Math.cos(ang)), mul(sideTilted, Math.sin(ang))));
            const vBase = unit(add(mul([1, 0, 0], -Math.sin(ang)), mul(sideTilted, Math.cos(ang))));
            const rArr = add(destRelR, mul(pHat, safeR));
            const arc = O.transferVelocity(orbit.rKm, rArr, orbit.muKm3S2, dt);
            if (!arc) continue;
            const elArc = O.stateToElements(orbit.rKm, arc.departure, orbit.muKm3S2);
            if (elArc.rp < primaryClearR && elArc.timeToPeS < dt) continue;
            // Reject transfer arcs whose body-relative chord intersects primary, target, or any sibling planet/moon.
            const coastFn = O.keplerCoast(orbit.rKm, arc.departure, orbit.muKm3S2, elArc);
            let grazed = false;
            let prevP = orbit.rKm;
            for (let si = 0; si < segFracs.length; si++) {
              const frac = segFracs[si], tSub = dt * frac;
              const curP = frac >= 1 ? rArr : coastFn(tSub).rKm;
              if (O.segmentSphereHit(prevP, curP, [0, 0, 0], primaryClearR).hit ||
                  O.segmentSphereHit(sub(prevP, destCache[si]), sub(curP, destCache[si + 1]), [0, 0, 0], destClearR).hit) {
                grazed = true; break;
              }
              for (let bi = 0; bi < siblingObstacles.length; bi++) {
                if (O.segmentSphereHit(sub(prevP, sibCache[si][bi]), sub(curP, sibCache[si + 1][bi]), [0, 0, 0], siblingObstacles[bi].clearR).hit) {
                  grazed = true; break;
                }
              }
              if (grazed) break;
              prevP = curP;
            }
            if (grazed) continue;
            for (const sense of [1, -1]) {
              const vArr = add(destRelV, mul(vBase, sense * vCircDest));
              const dep = sub(arc.departure, orbit.vKmS), arr = sub(vArr, arc.arrival);
              const cost = len(dep) + len(arr);
              if (!best || cost < best.cost) best = { cost, dt, rArr, arc, dep, arr };
            }
          }
        }
      };
      for (const tilt of [0, 0.16, -0.16, 0.36, -0.36]) {
        runCaptureSearch(tilt);
        if (best) break;
      }
      if (!best) {
        message('No clear capture orbit found for ' + destBody.name.toUpperCase() + '.', 'elevated');
        return { valid: false, targetId: target.id, targetLabel: target.label, primaryLabel, reason: 'no-transfer' };
      }
      const shortName = destBody.name.toUpperCase().slice(0, 12);
      const meta = { targetRef: ref, captureRadiusKm: safeR };
      const burns = [
        toPnrNode('orbit-dep', 'orbit', 'ORBIT ' + shortName + ' DEP', 0, orbit.rKm, orbit.vKmS, best.dep, meta),
        toPnrNode('orbit-cap', 'orbit', 'ORBIT ' + shortName + ' CAP', best.dt, best.rArr, best.arc.arrival, best.arr, meta)
      ];
      S.orbitPlan = null;
      setManeuverChain(burns, burns.length - 1, true);
      autoCaptureTargetId = target.id;
      autoCapturePlottedAt = S.simTimeS;
      if (opts.execute) executeManeuverChain(burns);
      message('PLOTTED ORBIT ' + shortName + ' (alt ' + Math.round(captureAltKm) + ' km, dv ' + best.cost.toFixed(2) + ' km/s)');
      return { valid: true, targetId: target.id, targetLabel: target.label, primaryLabel,
        totalDvKmS: best.cost, transferTimeS: best.dt, captureAltKm, burns: burns.slice(), alreadyInOrbit: false };
    }
    if (target.kind === 'station' && target.focusRef) {
      const scaleTime = PI * Math.sqrt(((len(orbit.rKm) + target.radiusKm) / 2) ** 3 / orbit.muKm3S2);
      const stPrimaryClearR = orbit.bodyRadiusKm + O.bodyAtmosphereAltKm(currentPrimaryBody(), orbit.primary) + 180;
      const stMoons = orbit.primary === 'planet' ? ((sys().planets[orbit.planetIdx] && sys().planets[orbit.planetIdx].moons) || []) : [];
      const stHasClearArc = (startR, depV, endR, dt, elArc) => {
        if (elArc.rp < stPrimaryClearR && elArc.timeToPeS < dt) return false;
        const coastFn = O.keplerCoast(startR, depV, orbit.muKm3S2, elArc);
        let prevP = startR;
        const nSeg = 18;
        for (let si = 1; si <= nSeg; si++) {
          const frac = si / nSeg, tSub = dt * frac;
          const curP = frac >= 1 ? endR : coastFn(tSub).rKm;
          if (O.segmentSphereHit(prevP, curP, [0, 0, 0], stPrimaryClearR).hit) return false;
          if (stMoons.length) {
            const tPrev = S.simTimeS + dt * ((si - 1) / nSeg), tCur = S.simTimeS + tSub;
            const oPrev = Galaxy.getBodyWorldState(sys(), currentPrimaryRef(), tPrev).rKm;
            const oCur = Galaxy.getBodyWorldState(sys(), currentPrimaryRef(), tCur).rKm;
            for (let mi = 0; mi < stMoons.length; mi++) {
              const mn = stMoons[mi];
              const mClearR = mn.radiusKm + O.bodyAtmosphereAltKm(mn, 'moon') + 150;
              const m0 = sub(Galaxy.getBodyWorldState(sys(), { kind: 'moon', planetIdx: orbit.planetIdx, moonIdx: mi }, tPrev).rKm, oPrev);
              const m1 = sub(Galaxy.getBodyWorldState(sys(), { kind: 'moon', planetIdx: orbit.planetIdx, moonIdx: mi }, tCur).rKm, oCur);
              if (O.segmentSphereHit(sub(prevP, m0), sub(curP, m1), [0, 0, 0], mClearR).hit) return false;
            }
          }
          prevP = curP;
        }
        return true;
      };
      let best = null;
      for (const tilt of [0, 0.2, -0.2, 0.45, -0.45]) {
        for (const factor of [0.58, 0.72, 0.87, 1, 1.16, 1.36, 1.65, 2.0]) {
          const dt = scaleTime * factor, tArr = S.simTimeS + dt;
          const parentArr = orbit.primary === 'star' ? { rKm: [0, 0, 0], vKmS: [0, 0, 0] }
            : Galaxy.getBodyWorldState(sys(), currentPrimaryRef(), tArr);
          const stArr = Galaxy.getBodyWorldState(sys(), target.focusRef, tArr);
          const stRelR = sub(stArr.rKm, parentArr.rKm), stRelV = sub(stArr.vKmS, parentArr.vKmS);
          const nHat = unit(cross(stRelR, stRelV));
          // Park 2.0 km normal to station berth: inside 25 km dock corridor and clear of 0.45 km avoidance sphere.
          const rArr = tilt ? add(stRelR, mul(nHat, 2.0 + Math.sin(tilt) * Math.min(len(stRelR) * 0.12, 8000)))
            : add(stRelR, mul(nHat, 2.0));
          const arc = O.transferVelocity(orbit.rKm, rArr, orbit.muKm3S2, dt);
          if (!arc) continue;
          const elArc = O.stateToElements(orbit.rKm, arc.departure, orbit.muKm3S2);
          if (!stHasClearArc(orbit.rKm, arc.departure, rArr, dt, elArc)) continue;
          const dep = sub(arc.departure, orbit.vKmS), arr = sub(stRelV, arc.arrival);
          const cost = len(dep) + len(arr);
          if (!best || cost < best.cost) best = { cost, dt, rArr, arc, dep, arr };
        }
        if (best) break;
      }
      if (!best) return { valid: false, targetId: target.id, targetLabel: target.label, primaryLabel, reason: 'no-transfer' };
      const burns = [
        toPnrNode('orbit-dep', 'orbit', 'STATION DEP', 0, orbit.rKm, orbit.vKmS, best.dep),
        toPnrNode('orbit-cap', 'orbit', 'STATION MATCH', best.dt, best.rArr, best.arc.arrival, best.arr)
      ];
      S.orbitPlan = null;
      setManeuverChain(burns, burns.length - 1);
      if (opts.execute) executeManeuverChain(burns);
      return { valid: true, targetId: target.id, targetLabel: target.label, primaryLabel,
        totalDvKmS: best.cost, transferTimeS: best.dt, captureAltKm: Math.max(0, target.radiusKm - orbit.bodyRadiusKm),
        burns: burns.slice(), alreadyInOrbit: false };
    }
    if (target.kind === 'escape') {
      const esc = O.planEscapeManeuver(orbit.rKm, orbit.vKmS, orbit.muKm3S2);
      const burns = [toPnrNode('orbit-esc', 'orbit', 'ESCAPE ' + primaryLabel, 0, orbit.rKm, orbit.vKmS, esc.dvVecKmS)];
      S.orbitPlan = null;
      setManeuverChain(burns, 0);
      if (opts.execute) executeManeuverChain(burns);
      return { valid: true, targetId: target.id, targetLabel: target.label, primaryLabel,
        totalDvKmS: esc.dvKmS, transferTimeS: 0, captureAltKm: Infinity, burns: burns.slice(), alreadyInOrbit: false };
    }
    if (target.kind === 'circularize') return circularizeOrbit('now');
    const hoh = O.planHohmannTransfer(orbit.rKm, orbit.vKmS, orbit.muKm3S2, target);
    const rTgt = target.radiusKm || orbit.el.radiusKm;
    const burns = [];
    if (hoh.transferTimeS > 1e-3) {
      const inward = rTgt < len(orbit.rKm);
      const end = O.elementsToState({ ...hoh.predictedTransferEl, nuRad: inward ? 0 : PI }, orbit.muKm3S2);
      burns.push(toPnrNode('orbit-dep', 'orbit', target.label + ' DEP', hoh.waitTimeS || 0, orbit.rKm, orbit.vKmS, hoh.dv1VecKmS));
      burns.push(toPnrNode('orbit-cap', 'orbit', target.label + ' CAP', hoh.transferTimeS, end.rKm, end.vKmS, hoh.dv2VecKmS));
    } else {
      burns.push(toPnrNode('orbit-cap', 'orbit', target.label, hoh.waitTimeS || 0, orbit.rKm, orbit.vKmS, hoh.dv1VecKmS));
    }
    S.orbitPlan = null;
    setManeuverChain(burns, burns.length - 1);
    if (opts.execute) executeManeuverChain(burns);
    return { valid: true, targetId: target.id, targetLabel: target.label, primaryLabel,
      totalDvKmS: hoh.totalDvKmS, transferTimeS: hoh.transferTimeS, captureAltKm: Math.max(0, rTgt - orbit.bodyRadiusKm),
      burns: burns.slice(), alreadyInOrbit: false };
  }
  function fallbackBrachistochrone(r0, v0, r1, v1, mu, accelG) {
    const dr = sub(r1, r0), dv = sub(v1, v0), sumV = add(v0, v1);
    const limit = accelG * O.G0_KMS2;
    const legs = t => [1, -1].map(sign =>
      add(mul(dr, sign * 4 / (t * t)), mul(sub(dv, mul(sumV, 2 * sign)), 1 / t)));
    let lo = 0, hi = Math.max(1, 2 * Math.sqrt(len(dr) / limit));
    while (legs(hi).some(a => len(a) > limit)) hi *= 2;
    for (let i = 0; i < 45; i++) {
      const mid = (lo + hi) / 2;
      if (legs(mid).some(a => len(a) > limit)) lo = mid;
      else hi = mid;
    }
    const tofS = hi, tFlipS = hi / 2, [accelLegKmS2, decelLegKmS2] = legs(hi);
    const stateAt = t => {
      const first = t <= tFlipS, elapsed = first ? t : t - tofS;
      const a = first ? accelLegKmS2 : decelLegKmS2, v = first ? v0 : v1, r = first ? r0 : r1;
      return {rKm:add(r, mul(add(v, mul(a, elapsed / 2)), elapsed)), vKmS:add(v, mul(a, elapsed))};
    };
    const flip = stateAt(tFlipS);
    return {tofS, tFlipS, stateAt, accelLegKmS2, decelLegKmS2, flipPointKm:flip.rKm,
      points:Array.from({length:129}, (_, i) => stateAt(tofS * i / 128).rKm),
      peakSpeedKmS:Math.max(len(v0), len(flip.vKmS), len(v1))};
  }
  function brachTargetState(target, targetEl, elapsedS, approachOpts = {}) {
    const timeS = S.simTimeS + elapsedS, ref = target.focusRef;
    if (target.kind === 'ice-deposit' && target.deposit && Galaxy.getIceDepositWorldState) {
      const origin = orbit.primary === 'star' ? { rKm: [0, 0, 0], vKmS: [0, 0, 0] }
        : Galaxy.getBodyWorldState(sys(), currentPrimaryRef(), timeS);
      const depW = Galaxy.getIceDepositWorldState(sys(), target.deposit, timeS);
      const rKm = sub(depW.rKm, origin.rKm), vKmS = sub(depW.vKmS, origin.vKmS);
      const nHat = unit(cross(rKm, vKmS));
      return { rKm: add(rKm, mul(nHat, 45.0)), vKmS };
    }
    if (ref) {
      if (ref.kind === 'planet' || ref.kind === 'moon') {
        return safeTargetOffsetState(ref, orbit.rKm, timeS, approachOpts);
      }
      const origin = orbit.primary === 'star' ? { rKm: [0, 0, 0], vKmS: [0, 0, 0] }
        : Galaxy.getBodyWorldState(sys(), currentPrimaryRef(), timeS);
      const moving = Galaxy.getBodyWorldState(sys(), ref, timeS);
      const rKm = sub(moving.rKm, origin.rKm), vKmS = sub(moving.vKmS, origin.vKmS);
      if (ref.kind === 'station') {
        const nHat = unit(cross(rKm, vKmS));
        return { rKm: add(rKm, mul(nHat, 2.0)), vKmS };
      }
      return { rKm, vKmS };
    }
    if (target.kind === 'lagrange') {
      const point = getLagrangeTarget(lagrangeRef, timeS) || target;
      return {rKm:point.targetPosKm, vKmS:point.targetVelKmS};
    }
    const zero = O.elementsToState({...targetEl, nuRad:0}, orbit.muKm3S2);
    const quarter = O.elementsToState({...targetEl, nuRad:PI / 2}, orbit.muKm3S2);
    const nuRad = Math.atan2(dot(orbit.rKm, unit(quarter.rKm)), dot(orbit.rKm, unit(zero.rKm)));
    return O.elementsToState({...targetEl, nuRad}, orbit.muKm3S2);
  }
  function findBrachCollision(points, tofS, targetRef, stateAt) {
    const primaryR = orbit.bodyRadiusKm + O.bodyAtmosphereAltKm(currentPrimaryBody(), orbit.primary) + 180;
    const p = sys().planets[orbit.planetIdx];
    const checkMoons = orbit.primary === 'planet' && p ? p.moons || [] : [];
    const targetBody = targetRef && (targetRef.kind === 'moon' || targetRef.kind === 'planet') ? bodyRecord(targetRef) : null;
    const targetClearR = targetBody ? targetBody.radiusKm + O.bodyAtmosphereAltKm(targetBody, targetRef.kind) + 280 : 0;
    const nSeg = points.length - 1;
    const checkSeg = (p0, p1, t0, t1, frac) => {
      if (O.segmentSphereHit(p0, p1, [0, 0, 0], primaryR).hit) {
        return { name: currentPrimaryLabel(), frac, centerKm: [0, 0, 0], clearR: primaryR, shipKm: mul(add(p0, p1), 0.5) };
      }
      if (targetBody && targetRef) {
        const o0 = orbit.primary === 'star' ? [0, 0, 0] : Galaxy.getBodyWorldState(sys(), currentPrimaryRef(), t0).rKm;
        const o1 = orbit.primary === 'star' ? [0, 0, 0] : Galaxy.getBodyWorldState(sys(), currentPrimaryRef(), t1).rKm;
        const c0 = sub(Galaxy.getBodyWorldState(sys(), targetRef, t0).rKm, o0);
        const c1 = sub(Galaxy.getBodyWorldState(sys(), targetRef, t1).rKm, o1);
        if (O.segmentSphereHit(sub(p0, c0), sub(p1, c1), [0, 0, 0], targetClearR).hit) {
          return { name: targetBody.name.toUpperCase(), frac, centerKm: mul(add(c0, c1), 0.5), clearR: targetClearR, shipKm: mul(add(p0, p1), 0.5) };
        }
      }
      for (let mi = 0; mi < checkMoons.length; mi++) {
        if (targetRef?.kind === 'moon' && targetRef.planetIdx === orbit.planetIdx && targetRef.moonIdx === mi) continue;
        const m = checkMoons[mi];
        const mClearR = m.radiusKm + O.bodyAtmosphereAltKm(m, 'moon') + 150;
        const o0 = Galaxy.getBodyWorldState(sys(), currentPrimaryRef(), t0).rKm;
        const o1 = Galaxy.getBodyWorldState(sys(), currentPrimaryRef(), t1).rKm;
        const m0 = sub(Galaxy.getBodyWorldState(sys(), { kind: 'moon', planetIdx: orbit.planetIdx, moonIdx: mi }, t0).rKm, o0);
        const m1 = sub(Galaxy.getBodyWorldState(sys(), { kind: 'moon', planetIdx: orbit.planetIdx, moonIdx: mi }, t1).rKm, o1);
        if (O.segmentSphereHit(sub(p0, m0), sub(p1, m1), [0, 0, 0], mClearR).hit) {
          return { name: m.name.toUpperCase(), frac, centerKm: mul(add(m0, m1), 0.5), clearR: mClearR, shipKm: mul(add(p0, p1), 0.5) };
        }
      }
      if (orbit.primary === 'star') {
        const planets = sys().planets || [];
        for (let pi = 0; pi < planets.length; pi++) {
          if (targetRef?.kind === 'planet' && targetRef.planetIdx === pi) continue;
          const pl = planets[pi];
          const plClearR = pl.radiusKm + O.bodyAtmosphereAltKm(pl, 'planet') + 200;
          const p0B = Galaxy.getBodyWorldState(sys(), { kind: 'planet', planetIdx: pi }, t0).rKm;
          const p1B = Galaxy.getBodyWorldState(sys(), { kind: 'planet', planetIdx: pi }, t1).rKm;
          if (O.segmentSphereHit(sub(p0, p0B), sub(p1, p1B), [0, 0, 0], plClearR).hit) {
            return { name: pl.name.toUpperCase(), frac, centerKm: mul(add(p0B, p1B), 0.5), clearR: plClearR, shipKm: mul(add(p0, p1), 0.5) };
          }
        }
      }
      return null;
    };
    for (let i = 1; i < points.length; i++) {
      const hit = checkSeg(points[i - 1], points[i], S.simTimeS + tofS * ((i - 1) / nSeg), S.simTimeS + tofS * (i / nSeg), (i - 0.5) / nSeg);
      if (hit) return hit;
    }
    if (typeof stateAt === 'function' && tofS > 0) {
      const tailStart = tofS * 0.75;
      let prev = stateAt(tailStart).rKm;
      let tPrev = S.simTimeS + tailStart;
      for (let k = 1; k <= 48; k++) {
        const frac = 0.75 + 0.25 * (k / 48);
        const tRel = tofS * frac;
        const cur = stateAt(tRel).rKm;
        const tCur = S.simTimeS + tRel;
        const hit = checkSeg(prev, cur, tPrev, tCur, frac);
        if (hit) return hit;
        prev = cur; tPrev = tCur;
      }
    }
    return null;
  }
  function brachPathHasCollision(points, tofS, targetRef, stateAt) {
    const hit = findBrachCollision(points, tofS, targetRef, stateAt);
    return hit ? hit.name : null;
  }
  function plotBrachistochroneOrbit(id, accelG) {
    if (S.mode === 'interstellar' || S.burn?.isBrachistochrone) return null;
    let target = resolveTargetById(id || S.selectedTargetId);
    if (!target || target.kind === 'escape') return null;
    if (target.crossSoi) {
      if (S.burn?.active) {
        message('Cancel active burn before switching SOI targets.', 'elevated');
        return null;
      }
      if (promotePrimaryForTarget(target)) {
        target = resolveTargetById(target.id) || target;
      }
    }
    const g = clamp(Number(accelG) || S.brachAccelG, 0.25, Math.min(2, Math.max(0.25, sustainableG())));
    const mu = orbit.muKm3S2;
    const targetEl = O.planHohmannTransfer(orbit.rKm, orbit.vKmS, mu, target).targetEl;
    const solve = O.planBrachistochroneOrbit || fallbackBrachistochrone;
    const drift = target.targetVelKmS || [0, 0, 0];
    const hasBodyRef = target.focusRef && (target.focusRef.kind === 'moon' || target.focusRef.kind === 'planet');
    // Prefer tangential limb capture (+/-PI/2 aligned with incoming approach) before radial sub-body points.
    const approaches = hasBodyRef
      ? [
          { phaseShift: PI / 2, alignIncoming: true }, { phaseShift: -PI / 2, alignIncoming: true },
          { phaseShift: PI / 3, alignIncoming: true }, { phaseShift: -PI / 3, alignIncoming: true },
          { phaseShift: 2 * PI / 3, alignIncoming: true }, { phaseShift: -2 * PI / 3, alignIncoming: true },
          { phaseShift: PI / 2, tangentSign: 1 }, { phaseShift: -PI / 2, tangentSign: -1 },
          { phaseShift: PI / 6, alignIncoming: true }, { phaseShift: -PI / 6, alignIncoming: true },
          { phaseShift: 0, tangentSign: 1 }, { phaseShift: 0, tangentSign: -1 },
          { phaseShift: PI, tangentSign: 1 }, { phaseShift: PI, tangentSign: -1 }
        ]
      : [{ phaseShift: 0, tangentSign: 1 }];
    const solveStraight = (approachOpts, gUse) => {
      let etaS = 0, plan;
      for (let i = 0; i < 32; i++) {
        const goal = brachTargetState(target, targetEl, etaS, approachOpts);
        plan = solve(orbit.rKm, sub(orbit.vKmS, drift), sub(goal.rKm, mul(drift, etaS)), sub(goal.vKmS, drift), mu, gUse);
        if (Math.abs(etaS - plan.tofS) < Math.max(0.001, plan.tofS * 1e-6)) break;
        etaS += (plan.tofS - etaS) * 0.75;
      }
      const stateAt = t => {
        const at = plan.stateAt(t);
        return { rKm: add(at.rKm, mul(drift, t)), vKmS: add(at.vKmS, drift) };
      };
      const points = plan.points.map((r, i) => add(r, mul(drift, plan.tofS * i / (plan.points.length - 1))));
      return { etaS, plan, stateAt, points };
    };
    let chosen = null, blockedBest = null;
    for (const approachOpts of approaches) {
      const base = solveStraight(approachOpts, g);
      const hitInfo = findBrachCollision(base.points, base.plan.tofS, target.focusRef, base.stateAt);
      const hitBody = hitInfo ? hitInfo.name : null;
      const surfaceIntercept = !!hitBody;
      const flip = base.stateAt(base.plan.tFlipS);
      const peakSpeedKmS = Math.max(len(orbit.vKmS), len(flip.vKmS), len(base.stateAt(base.plan.tofS).vKmS));
      const totalDvKmS = (len(base.plan.accelLegKmS2) + len(base.plan.decelLegKmS2)) * base.plan.tFlipS;
      const candidate = {
        ...base.plan, id: target.id, label: target.label, targetEl, targetRef: target.focusRef,
        isBrachistochrone: true, stateAt: base.stateAt, points: base.points, brachPoints: base.points, flipPointKm: flip.rKm,
        accelG: g, peakSpeedKmS, peakBeta: peakSpeedKmS / O.C_KMS, totalDvKmS, transferTimeS: base.plan.tofS,
        valid: !surfaceIntercept && Math.abs(base.etaS - base.plan.tofS) < Math.max(0.05, base.plan.tofS * 1e-5),
        surfaceIntercept, hitBody
      };
      if (!chosen) chosen = candidate;
      if (!blockedBest && hitInfo) blockedBest = { approachOpts, hitInfo, candidate };
      if (candidate.valid) { chosen = candidate; break; }
    }
    // If straight brachistochrone chords collide with a body, construct a C2 obstacle-avoiding bow arc
    // with w(u)=64*u^3*(1-u)^3 so endpoints (r0,v0) and (r1,v1) match to zero perturbation.
    if (!chosen?.valid && blockedBest) {
      const { approachOpts } = blockedBest;
      const nrmFallback = unit(orbit.el?.normalHat || cross(orbit.rKm, orbit.vKmS) || [0, 0, 1]);
      outerBow:
      for (const gScale of [0.86, 0.7, 0.54]) {
        const curvedBase = solveStraight(approachOpts, Math.max(0.18, g * gScale));
        const curHit = findBrachCollision(curvedBase.points, curvedBase.plan.tofS, target.focusRef, curvedBase.stateAt);
        if (!curHit) {
          const flip0 = curvedBase.stateAt(curvedBase.plan.tFlipS);
          const peak0 = Math.max(len(orbit.vKmS), len(flip0.vKmS), len(curvedBase.stateAt(curvedBase.plan.tofS).vKmS));
          const dv0 = (len(curvedBase.plan.accelLegKmS2) + len(curvedBase.plan.decelLegKmS2)) * curvedBase.plan.tFlipS;
          chosen = {
            ...curvedBase.plan, id: target.id, label: target.label, targetEl, targetRef: target.focusRef,
            isBrachistochrone: true, stateAt: curvedBase.stateAt, points: curvedBase.points, brachPoints: curvedBase.points,
            flipPointKm: flip0.rKm, accelG: g, peakSpeedKmS: peak0, peakBeta: peak0 / O.C_KMS,
            totalDvKmS: dv0, transferTimeS: curvedBase.plan.tofS, valid: true, surfaceIntercept: false, hitBody: null
          };
          break outerBow;
        }
        const tof = curvedBase.plan.tofS, tFlip = curvedBase.plan.tFlipS;
        const pStart = curvedBase.points[0], pEnd = curvedBase.points[curvedBase.points.length - 1];
        const chordVec = sub(pEnd, pStart), chordHat = unit(chordVec);
        const awayRaw = sub(curHit.shipKm, curHit.centerKm);
        const awayOrth = sub(awayRaw, mul(chordHat, dot(awayRaw, chordHat)));
        const sideOrth = cross(nrmFallback, chordHat);
        const dirs = [
          len(awayOrth) > 1e-6 ? unit(awayOrth) : null,
          len(sideOrth) > 1e-6 ? unit(sideOrth) : null,
          len(sideOrth) > 1e-6 ? mul(unit(sideOrth), -1) : null,
          nrmFallback,
          mul(nrmFallback, -1)
        ].filter(Boolean);
        const uHit = clamp(curHit.frac, 0.12, 0.88);
        const wHit = Math.max(0.28, 64 * uHit * uHit * uHit * (1 - uHit) * (1 - uHit) * (1 - uHit));
        const baseAmpKm = Math.max(curHit.clearR * 0.65, curHit.clearR * 1.48 - len(awayOrth)) / wHit;
        for (const bowDir of dirs) {
          for (const ampMul of [1.0, 1.35, 1.85, 2.5]) {
            const ampKm = baseAmpKm * ampMul;
            const curvedStateAt = t => {
              const st = curvedBase.stateAt(t);
              const u = clamp(t / tof, 0, 1), mu1 = 1 - u;
              const w = 64 * u * u * u * mu1 * mu1 * mu1;
              const dw = 192 * u * u * mu1 * mu1 * (1 - 2 * u) / tof;
              return { rKm: add(st.rKm, mul(bowDir, ampKm * w)), vKmS: add(st.vKmS, mul(bowDir, ampKm * dw)) };
            };
            const curvedAccelAt = t => {
              const u = clamp(t / tof, 0, 1);
              const baseA = t <= tFlip ? curvedBase.plan.accelLegKmS2 : curvedBase.plan.decelLegKmS2;
              const d2w = 384 * u * (1 - u) * (1 - 5 * u + 5 * u * u) / (tof * tof);
              return add(baseA, mul(bowDir, ampKm * d2w));
            };
            const cPts = Array.from({ length: 129 }, (_, i) => curvedStateAt(tof * i / 128).rKm);
            if (findBrachCollision(cPts, tof, target.focusRef, curvedStateAt)) continue;
            let peakSpeed = len(orbit.vKmS), dvTotal = 0;
            const flipC = curvedStateAt(tFlip);
            for (let si = 0; si < 128; si++) {
              const tMid = tof * (si + 0.5) / 128;
              peakSpeed = Math.max(peakSpeed, len(curvedStateAt(tMid).vKmS));
              dvTotal += len(curvedAccelAt(tMid)) * (tof / 128);
            }
            chosen = {
              ...curvedBase.plan, id: target.id, label: target.label, targetEl, targetRef: target.focusRef,
              isBrachistochrone: true, stateAt: curvedStateAt, accelAt: curvedAccelAt,
              points: cPts, brachPoints: cPts, flipPointKm: flipC.rKm,
              accelG: g, peakSpeedKmS: peakSpeed, peakBeta: peakSpeed / O.C_KMS,
              totalDvKmS: dvTotal, transferTimeS: tof, valid: true, surfaceIntercept: false, hitBody: null
            };
            break outerBow;
          }
        }
      }
    }
    if (chosen && chosen.valid) clearManeuverChain();
    S.selectedTargetId = target.id; S.vectorsUserHidden = false;
    S.orbitPlan = chosen;
    return S.orbitPlan;
  }
  function setBrachAccelG(g) {
    S.brachAccelG = clamp(+g || 1.0, 0.25, 2.0);
    if (S.orbitPlan?.isBrachistochrone) plotBrachistochroneOrbit(S.orbitPlan.id);
    return S.brachAccelG;
  }
  function executeBrachistochroneOrbit() {
    if (S.docked) { message('Docking clamp engaged -- undock before executing flip-burn.', 'elevated'); return false; }
    if (S.mode !== 'orbit') { message('Flip-burn unavailable in interstellar transit.', 'elevated'); return false; }
    if (S.burn?.isBrachistochrone || !S.orbitPlan?.isBrachistochrone) {
      message('No flip-burn plan plotted. Select a target and click FLIP-BURN first.', 'elevated');
      return false;
    }
    const plan = plotBrachistochroneOrbit(S.orbitPlan.id, S.orbitPlan.accelG);
    if (!plan?.valid || !(plan.tofS > 0)) {
      message(plan?.surfaceIntercept ? 'Flip-burn path intersects ' + (plan.hitBody || 'a celestial body') + '. Choose ORBIT or a different approach.' :
        'Flip-burn could not solve the target intercept.', 'elevated');
      return false;
    }
    S.burn = {active:true, isBrachistochrone:true, plan, phase:'accel', label:plan.label,
      targetId:plan.id, elapsedS:0, etaS:plan.tofS, progress:0, remainingDvKmS:plan.totalDvKmS,
      realS:0, legRealS:clamp(4.6 + Math.log10(1 + plan.tofS / 1000) * 1.0, 4.6, 7.2)};
    S.thrustCmdG = 0; S.flip = false; S.effectiveWarp = 1; S.timeWarp = 1; S.clockExplicit = !S.autoWarp;
    return true;
  }
  function executeOrbitManeuver(opts) {
    opts = typeof opts === 'string' ? { targetId: opts } : opts || {};
    if (S.destroyed) { message('Hull destroyed. Recommission at station.', 'critical'); return false; }
    if (S.docked) { message('Docking clamp engaged -- undock before executing orbital burns.', 'elevated'); return false; }
    if (S.mode === 'interstellar') { message('Orbital maneuvers unavailable in interstellar transit.', 'elevated'); return false; }
    if (S.orbitPlan?.isBrachistochrone && (!opts.targetId || opts.targetId === S.orbitPlan.id)) {
      if (opts.autoWarp != null) S.autoWarp = !!opts.autoWarp;
      return executeBrachistochroneOrbit();
    }
    let plan = plotTargetOrbit(opts.targetId), target = targets().find(t => t.id === S.selectedTargetId);
    if (!target && Object.values(S.node).some(v=>Math.abs(v)>1e-9)) {
      const e=orbit.el, dv=add(mul(e.progradeHat,S.node.progradeKmS),add(mul(e.normalHat,S.node.normalKmS),mul(e.radialHat,S.node.radialKmS)));
      target={id:'manual-node',label:'MANUAL MANEUVER',kind:'node'};
      plan={waitTimeS:0,transferTimeS:0,totalDvKmS:len(dv),dv1VecKmS:dv,dv1KmS:len(dv),dv2VecKmS:[0,0,0],dv2KmS:0,burn1DurationS:0};
    }
    if (!plan || !target) { message('No valid target orbit plotted. Select a body or preset first.', 'elevated'); return false; }
    S.autoWarp = opts.autoWarp == null ? S.autoWarp : !!opts.autoWarp;
    S.vectorsUserHidden = false;
    if (opts.mode !== 'guided' && target.focusRef && (target.focusRef.kind === 'moon' || target.focusRef.kind === 'planet')) {
      const cap = plotOrbitCapture(target.id, { execute: true });
      if (cap && cap.valid) return true;
    }
    const guided = opts.mode === 'guided' || ['station', 'planet', 'moon', 'lagrange'].includes(target.kind) ||
      orbit.el.e > 0.01 || plan.burn1DurationS > plan.transferTimeS * 0.03;
    S.burn = { active: true, phase: guided ? 'guided' : 'wait', targetId: target.id,
      plan, remainingS: plan.waitTimeS, remainingDvKmS: plan.totalDvKmS,
      initialDvKmS: plan.totalDvKmS, progress: 0, label: target.label };
    S.thrustCmdG = 0; return true;
  }
  const burnMagnitude = burn => Math.hypot(burn.dvP, burn.dvN, burn.dvR);
  function setManeuverChain(burns, selIdx, preserveAutoCapture = false) {
    if (!Array.isArray(burns)) return false;
    if (!preserveAutoCapture) autoCaptureTargetId = null;
    const finite = value => Number.isFinite(value) ? value : 0;
    const chain = burns.filter(b => b && typeof b === 'object').map(b => ({
      ...b, dtS: Math.max(0, finite(b.dtS)), dvP: finite(b.dvP), dvN: finite(b.dvN), dvR: finite(b.dvR)
    }));
    S.maneuverChain = chain;
    if (chain.length) S.vectorsUserHidden = false;
    const selected = Number.isInteger(selIdx) ? selIdx : S.selectedBurnIdx;
    S.selectedBurnIdx = chain.length ? clamp(selected, -1, chain.length - 1) : 0;
    return true;
  }
  function clearManeuverChain() {
    autoCaptureTargetId = null;
    S.maneuverChain = []; S.selectedBurnIdx = 0;
  }
  function executeManeuverChain(burns = S.maneuverChain) {
    if (S.docked) { message('Docking clamp engaged -- undock before executing maneuver chain.', 'elevated'); return false; }
    if (S.mode === 'interstellar') { message('Maneuver chain unavailable in interstellar transit.', 'elevated'); return false; }
    let queueSrc = burns;
    const isAutoMatch = queueSrc === S.maneuverChain || (Array.isArray(queueSrc) && queueSrc.length === S.maneuverChain.length &&
      queueSrc[0]?.id === 'orbit-dep' && S.maneuverChain[0]?.id === 'orbit-dep');
    if (!replanningCapture && autoCaptureTargetId && isAutoMatch && S.simTimeS - autoCapturePlottedAt > 0.5) {
      replanningCapture = true;
      const fresh = plotOrbitCapture(autoCaptureTargetId, { execute: false });
      replanningCapture = false;
      if (fresh && fresh.valid && !fresh.alreadyInOrbit) queueSrc = S.maneuverChain;
    }
    if (!setManeuverChain(queueSrc, S.selectedBurnIdx, true) || !S.maneuverChain.length) {
      message('No maneuver nodes in chain. Plot an orbit or add a burn node first.', 'elevated');
      return false;
    }
    autoCaptureTargetId = null;
    const queue = S.maneuverChain.slice();
    const totalDvKmS = queue.reduce((total, burn) => total + burnMagnitude(burn), 0);
    S.vectorsUserHidden = false;
    S.burn = {active:true, phase:'chain', queue, framePrimary:orbit.primary, initialDvKmS:totalDvKmS, remainingDvKmS:totalDvKmS,
      progress:0, remainingS:queue[0].dtS, etaS:queue[0].dtS, label:queue[0].label || 'MANEUVER 1', nodeIdx:0};
    S.thrustCmdG = 0; S.flip = false;
    return true;
  }
  function nodeDvVec(node) {
    const e = orbit.el;
    const reference = Math.abs(e.radialHat[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
    const normal = e.h ? e.normalHat : unit(sub(reference, mul(e.radialHat, dot(reference, e.radialHat))));
    const prograde = cross(normal, e.radialHat);
    return add(mul(prograde, node.dvP), add(mul(normal, node.dvN), mul(e.radialHat, node.dvR)));
  }
  function completeChainNode(burn, node) {
    if (!burn.queue.length) {
      S.burn = null; S.thrustCmdG = 0; S.timeWarp = 1; S.effectiveWarp = 1; clearManeuverChain();
      const captured = checkSoiTransition(true, node.targetRef || null);
      if (captured && (orbit.primary === 'moon' || orbit.primary === 'planet')) {
        message('Maneuver chain complete. Captured in ' + orbit.bodyName.toUpperCase() + ' orbit (alt ' + Math.round(orbit.altKm) + ' km).');
      } else {
        message('Maneuver chain complete.');
      }
      return;
    }
    const next = burn.queue[0];
    burn.nodeIdx++;
    burn.label = next.label || 'MANEUVER ' + (burn.nodeIdx + 1);
    burn.remainingS = burn.etaS = next.dtS;
    burn.remainingDvKmS = Math.max(0, burn.remainingDvKmS - burnMagnitude(node));
    burn.progress = 1 - burn.remainingDvKmS / Math.max(1e-9, burn.initialDvKmS);
  }
  function startFiniteBurn(burn, dvVec, label, extra) {
    const dvMag = len(dvVec);
    if (!(dvMag > 1e-6)) return false;
    const burnG = clamp(Math.max(0.85, Math.min(1.45, sustainableG())), 0.5, 1.8);
    const realDurS = clamp(1.8 + Math.log10(1 + dvMag * 6) * 1.15, 2.0, 3.8);
    burn.firing = Object.assign({
      dvVec: dvVec.slice(), dvMag, burnG, realDurS, realElapsedS: 0, appliedFrac: 0,
      startRemDv: Number.isFinite(burn.remainingDvKmS) ? burn.remainingDvKmS : dvMag,
      label: label || burn.label || 'BURN'
    }, extra || {});
    return true;
  }
  function stepFiniteBurn(burn, realSeconds, onComplete) {
    const f = burn.firing;
    const dtR = Math.max(Number.isFinite(realSeconds) && realSeconds > 0 ? realSeconds : 0.016, 0.008);
    if (len(f.dvVec) > 1e-8) slew(f.dvVec, dtR * 3.8);
    S.flip = false;
    f.realElapsedS = Math.min(f.realDurS, f.realElapsedS + dtR);
    S.simTimeS += dtR; S.epochYear += dtR / YEAR; S.shipTauYears += dtR / YEAR;
    const nextFrac = smooth(f.realElapsedS / f.realDurS);
    const incFrac = Math.max(0, nextFrac - f.appliedFrac);
    if (incFrac > 0) {
      impulse(mul(f.dvVec, incFrac));
      f.appliedFrac = nextFrac;
      updateGalPosition();
      const wF = starState();
      S.eta = Math.atanh(clamp(len(wF.vKmS) / O.C_KMS, 0, 0.999999999)); S.beta = Math.tanh(S.eta); S.gamma = Math.cosh(S.eta);
    }
    const sinEnv = Math.sin(clamp(f.realElapsedS / f.realDurS, 0, 1) * PI);
    S.thrustCmdG = f.burnG * clamp(sinEnv * 1.45 + 0.35, 0.35, 1.25);
    S.effectiveWarp = 1;
    burn.remainingDvKmS = Math.max(0, f.startRemDv - f.dvMag * f.appliedFrac);
    burn.progress = clamp(1 - burn.remainingDvKmS / Math.max(1e-9, burn.initialDvKmS), 0, 1);
    if (f.realElapsedS >= f.realDurS - 1e-9) {
      if (f.appliedFrac < 1) { impulse(mul(f.dvVec, 1 - f.appliedFrac)); updateGalPosition(); }
      burn.firing = null;
      S.thrustCmdG = 0;
      onComplete(f);
    }
  }
  function advanceManeuverChain(burn) {
    const node = burn.queue.shift();
    impulse(nodeDvVec(node));
    completeChainNode(burn, node);
  }
  function impulse(dv) {
    // Reactionless: any finite impulse is available; delta-v is a planning number only.
    if (!validVec(dv)) return false;
    orbit.vKmS = add(orbit.vKmS, dv); refreshOrbit(); return true;
  }
  function orbitDirection() {
    const e = orbit.el;
    switch (S.attitudeMode) {
      case 'PROGRADE': return e.progradeHat;
      case 'RETROGRADE': return S.thrustCmdG < 0 ? e.progradeHat : mul(e.progradeHat, -1);
      case 'NORMAL': return e.normalHat;
      case 'ANTI-NORMAL': return mul(e.normalHat, -1);
      case 'COURSE': { const dest = system(S.courseDestId); return dest ? unit(sub(dest.xyz, S.posGal)) : S.headingGal; }
      default: return S.headingGal;
    }
  }
  function recordAutoRcs(yaw, pitch) {
    if (Math.abs(yaw) > Math.abs(autoRcsCmd[1])) autoRcsCmd[1] = clamp(yaw, -1, 1);
    if (Math.abs(pitch) > Math.abs(autoRcsCmd[2])) autoRcsCmd[2] = clamp(pitch, -1, 1);
    if (!inFrameLoop) S.autoRcsTorque = [0, autoRcsCmd[1], autoRcsCmd[2]];
  }
  function slew(target, dt) {
    const f = S.headingGal, dest = unit(target), cosine = clamp(dot(f, dest), -1, 1);
    const angle = Math.acos(cosine), turn = Math.min(angle, 1.4 * dt);
    const tangent = sub(dest, mul(f, cosine));
    const tDir = len(tangent) > 1e-8 ? unit(tangent) : S.basis.y;
    if (angle > 2e-4 && (turn > 1e-5 || dt <= 0)) {
      const ty = dot(tDir, S.basis.z), tp = dot(tDir, S.basis.y);
      const mag = clamp(angle / 0.14, 0.28, 1.0);
      recordAutoRcs(ty * mag, tp * mag);
    }
    if (turn >= angle) { basis(dest); return; }
    basis(add(mul(f, Math.cos(turn)), mul(tDir, Math.sin(turn))));
  }
  function collectCollisionBodies() {
    ensureSystemGravity();
    const s = sys(), list = [];
    list.push({ ref: { kind: 'star' }, body: { name: s.name, radiusKm: s.starRadiusKm, muKm3S2: s.muStarKm3S2, kind: 'star' } });
    for (let pi = 0; pi < s.planets.length; pi++) {
      const p = s.planets[pi];
      list.push({ ref: { kind: 'planet', planetIdx: pi }, body: p });
      if (pi === orbit.planetIdx || orbit.primary === 'star') {
        for (let mi = 0; mi < (p.moons || []).length; mi++) {
          list.push({ ref: { kind: 'moon', planetIdx: pi, moonIdx: mi }, body: p.moons[mi] });
        }
      }
    }
    return list;
  }
  function handleBodyImpact(hitBody, hitRef, hit, vShipStar, vBodyStar, impactTimeS) {
    ensureSystemGravity();
    const relV = sub(vShipStar, vBodyStar);
    const speedKmS = len(relV);
    const kind = (O.isGasGiant(hitBody, hitRef.kind) || hitRef.kind === 'star') ? 'crush' : 'impact';
    const bodyName = hitBody.name || hitRef.kind.toUpperCase();
    S.burn = null; S.orbitPlan = null; S.thrustCmdG = 0; S.flip = false;
    clearManeuverChain();
    S.timeWarp = 1; S.autoClock = true; S.clockExplicit = false; S.effectiveWarp = 1;
    const outHat = hit.hitPoint && len(hit.hitPoint) > 1e-6 ? unit(hit.hitPoint)
      : (len(orbit.rKm) > 1e-6 ? unit(orbit.rKm) : [1, 0, 0]);
    const vInKmS = Math.max(0, -dot(relV, outHat));
    const parkR = hitBody.radiusKm + Math.max(8, hitBody.radiusKm * 0.004);
    const fatal = kind === 'crush' || speedKmS >= 1.8 || vInKmS >= 0.9 || S.hullIntegrity <= 0.45;
    orbit.focusSoi = orbit.primary = hitRef.kind;
    if (hitRef.kind !== 'star') orbit.planetIdx = hitRef.planetIdx;
    orbit.moonIdx = hitRef.kind === 'moon' ? hitRef.moonIdx : 0;
    S.orbitFrame = hitRef.kind;
    if (hitRef.kind === 'moon') S.moonIdx = hitRef.moonIdx;
    orbit.rKm = mul(outHat, parkR);
    S.simTimeS = impactTimeS;
    if (fatal) {
      orbit.vKmS = [0, 0, 0];
      S.lastImpact = { bodyName, kind, fatal: true, speedKmS, altKm: parkR - hitBody.radiusKm, at: impactTimeS, bodyKind: hitRef.kind };
      refreshOrbit();
      orbit.altKm = parkR - hitBody.radiusKm;
      orbit.vOrbKmS = 0;
      updateGalPosition();
      const reason = kind === 'crush'
        ? (bodyName + ' atmospheric crush -- vessel lost')
        : ('Surface impact on ' + bodyName + ' at ' + speedKmS.toFixed(2) + ' km/s -- vessel destroyed');
      destroyPlayerShip(reason);
    } else {
      const vTan = sub(relV, mul(outHat, dot(relV, outHat)));
      orbit.vKmS = mul(vTan, 0.55);
      S.lastImpact = { bodyName, kind: 'scrape', fatal: false, speedKmS, altKm: parkR - hitBody.radiusKm, at: impactTimeS, bodyKind: hitRef.kind };
      refreshOrbit();
      alignBasis(len(orbit.vKmS) > 1e-6 ? orbit.vKmS : outHat, orbit.el.normalHat);
      updateGalPosition();
      applyPlayerDamage(0.45, 0.35, bodyName + ' surface scrape', true);
      const msg = 'SURFACE SCRAPE AT ' + bodyName.toUpperCase() + ' (' + speedKmS.toFixed(2) + ' km/s) -- SEVERE HULL DAMAGE';
      S.warning = { source: 'impact', title: 'SURFACE SCRAPE', text: msg, level: 'critical' };
      message(msg, 'critical');
    }
  }
  function evaluateSweptPhysics(rPrev, rNext, vPrev, vNext, tStart, tEnd) {
    const dtSub = Math.max(1e-6, tEnd - tStart);
    const primRef = currentPrimaryRef();
    const orig0 = primRef.kind === 'star' ? { rKm: [0, 0, 0], vKmS: [0, 0, 0] } : Galaxy.getBodyWorldState(sys(), primRef, tStart);
    const orig1 = primRef.kind === 'star' ? { rKm: [0, 0, 0], vKmS: [0, 0, 0] } : Galaxy.getBodyWorldState(sys(), primRef, tEnd);
    const p0Star = add(orig0.rKm, rPrev);
    let p1Star = add(orig1.rKm, rNext);
    let v1Star = add(orig1.vKmS, vNext);
    const candidates = collectCollisionBodies();
    let earliestImpact = null;
    let atmoHit = null;
    for (let i = 0; i < candidates.length; i++) {
      const { ref, body: b } = candidates[i];
      const b0 = ref.kind === 'star' ? { rKm: [0, 0, 0], vKmS: [0, 0, 0] } : Galaxy.getBodyWorldState(sys(), ref, tStart);
      const b1 = ref.kind === 'star' ? { rKm: [0, 0, 0], vKmS: [0, 0, 0] } : Galaxy.getBodyWorldState(sys(), ref, tEnd);
      const rel0 = sub(p0Star, b0.rKm), rel1 = sub(p1Star, b1.rKm);
      const hit = O.segmentSphereHit(rel0, rel1, [0, 0, 0], b.radiusKm);
      if (hit.hit) {
        if (!earliestImpact || hit.tHit < earliestImpact.hit.tHit) {
          earliestImpact = { ref, body: b, hit, b1Vel: b1.vKmS, tImpact: tStart + hit.tHit * dtSub };
        }
        continue;
      }
      const atmoAlt = O.bodyAtmosphereAltKm(b, ref.kind);
      if (atmoAlt > 0) {
        const aHit = O.segmentSphereHit(rel0, rel1, [0, 0, 0], b.radiusKm + atmoAlt);
        if (aHit.hit && (!atmoHit || aHit.minDist - b.radiusKm < atmoHit.altKm)) {
          atmoHit = { ref, body: b, atmoAlt, altKm: Math.max(0, aHit.minDist - b.radiusKm), b1Vel: b1.vKmS };
        }
      }
    }
    if (earliestImpact) {
      handleBodyImpact(earliestImpact.body, earliestImpact.ref, earliestImpact.hit, v1Star, earliestImpact.b1Vel, earliestImpact.tImpact);
      return { impact: true, modified: false };
    }
    let modified = false, curR = rNext.slice(), curV = vNext.slice();
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (atmoHit) {
      S.timeWarp = 1; S.effectiveWarp = 1;
      const hFrac = clamp(atmoHit.altKm / Math.max(1, atmoHit.atmoAlt), 0, 1);
      const rho = Math.exp(-4.2 * hFrac);
      const relV = sub(v1Star, atmoHit.b1Vel), vMag = len(relV);
      if (vMag > 1e-4) {
        const dragDv = Math.min(vMag * 0.45, clamp(0.004 * rho * vMag * vMag, 0, 0.25) * dtSub);
        const dvDrag = mul(unit(relV), -dragDv);
        curV = add(curV, dvDrag);
        v1Star = add(v1Star, dvDrag);
        modified = true;
      }
      const iceLoss = clamp(rho * vMag * 0.00035 * dtSub, 0, 0.04);
      S.iceIntegrity = clamp(S.iceIntegrity - iceLoss, 0.05, 1);
      const atmoTxt = 'Entering ' + atmoHit.body.name.toUpperCase() + ' atmosphere (alt ' + Math.round(atmoHit.altKm) + ' km, ' + vMag.toFixed(1) + ' km/s). Clock 1x -- pull up!';
      S.warning = { source: 'atmo', title: 'ATMOSPHERIC ENTRY', text: atmoTxt, level: 'critical' };
      if (nowMs - lastAtmoMsgMs > 4000) { lastAtmoMsgMs = nowMs; message('ATMOSPHERIC ENTRY: ' + atmoTxt, 'critical'); }
    } else if (S.warning?.source === 'atmo') {
      S.warning = null;
    }
    // Ring-plane crossing response (micro-particulate drag + minor ice pitting)
    const activePlanet = sys().planets[orbit.planetIdx];
    if (activePlanet && activePlanet.hasRings) {
      const pl0 = Galaxy.getBodyWorldState(sys(), { kind: 'planet', planetIdx: orbit.planetIdx }, tStart);
      const pl1 = Galaxy.getBodyWorldState(sys(), { kind: 'planet', planetIdx: orbit.planetIdx }, tEnd);
      const rHit = O.segmentRingPlaneHit(sub(p0Star, pl0.rKm), sub(p1Star, pl1.rKm),
        activePlanet.radiusKm * 1.26, activePlanet.radiusKm * 2.27);
      if (rHit.hit) {
        const relPV = sub(v1Star, pl1.vKmS), vCross = len(relPV);
        const dragFrac = clamp(0.0008 * vCross, 0.0001, 0.015);
        const dvRing = mul(relPV, -dragFrac);
        curV = add(curV, dvRing);
        v1Star = add(v1Star, dvRing);
        modified = true;
        const pitting = clamp(0.001 + vCross * 0.0006, 0.001, 0.02);
        S.iceIntegrity = Math.max(0.05, S.iceIntegrity - pitting);
        S.lastRingCrossing = { bodyName: activePlanet.name, radiusKm: rHit.radiusKm, speedKmS: vCross, pitting, at: tEnd };
        if (nowMs - lastRingMsgMs > 8000) {
          lastRingMsgMs = nowMs;
          message('RING PLANE CROSSING AT ' + activePlanet.name.toUpperCase() + ' (R ' + Math.round(rHit.radiusKm).toLocaleString('en-US') + ' km, ice -' + (pitting * 100).toFixed(2) + '%)', 'elevated');
        }
      }
    }
    // Station proximity avoidance for non-docking high-speed passes (< 0.45 km at > 0.05 km/s)
    if (!S.docked && S.mode === 'orbit' && sys().station) {
      const stPi = sys().station.parentPlanetIdx;
      const st0 = Galaxy.getBodyWorldState(sys(), { kind: 'station', planetIdx: stPi }, tStart);
      const st1 = Galaxy.getBodyWorldState(sys(), { kind: 'station', planetIdx: stPi }, tEnd);
      const prox = O.checkStationProximity(p1Star, v1Star, st1.rKm, st1.vKmS, {
        rShipPrev: p0Star, rStationPrev: st0.rKm, docked: S.docked
      });
      if (prox.triggered) {
        curR = sub(prox.rKm, orig1.rKm);
        curV = sub(prox.vKmS, orig1.vKmS);
        modified = true;
        const proxTxt = 'RCS stand-off engaged outside 0.55 km (' + Math.round(prox.minDistKm * 1000) + ' m pass at ' + prox.relSpeedKmS.toFixed(2) + ' km/s).';
        S.warning = { source: 'proximity', title: 'STATION PROXIMITY AVOIDANCE', text: proxTxt, level: 'elevated' };
        if (nowMs - lastProxMsgMs > 5000) { lastProxMsgMs = nowMs; message('STATION PROXIMITY AVOIDANCE: ' + proxTxt, 'elevated'); }
      } else if (S.warning?.source === 'proximity' && prox.minDistKm > 1.0) {
        S.warning = null;
      }
    }
    return { impact: false, modified, rKm: curR, vKmS: curV };
  }
  function checkSoiTransition(forceArrivalCapture = false, targetRef = null) {
    ensureSystemGravity();
    if (orbit.primary === 'moon') {
      const m = currentPrimaryBody();
      const p = sys().planets[orbit.planetIdx];
      if (m && m.rHillKm > 0 && len(orbit.rKm) > m.rHillKm * 1.05) {
        switchPhysicsPrimary({ kind: 'planet', planetIdx: orbit.planetIdx });
        if (S.orbitFrame === 'moon') S.orbitFrame = 'planet';
        message('Exited ' + m.name.toUpperCase() + ' SOI -> ' + p.name.toUpperCase() + ' gravity primary.');
        return true;
      }
      return false;
    }
    const burnPending = !forceArrivalCapture && Boolean(S.burn && S.burn.active);
    if (orbit.primary === 'planet') {
      const p = sys().planets[orbit.planetIdx];
      if (!burnPending && p && p.moons?.length) {
        const pSt = body('planet', orbit.planetIdx);
        for (let mi = 0; mi < p.moons.length; mi++) {
          const m = p.moons[mi];
          if (!(m.rHillKm > 0)) continue;
          const mSt = body('moon', orbit.planetIdx, mi);
          const relR = sub(orbit.rKm, sub(mSt.rKm, pSt.rKm));
          const relV = sub(orbit.vKmS, sub(mSt.vKmS, pSt.vKmS));
          const distKm = len(relR), relSpeed = len(relV);
          const vEscMoon = Math.sqrt(2 * m.muKm3S2 / Math.max(distKm, m.radiusKm));
          const targeted = !!(targetRef && targetRef.kind === 'moon' && targetRef.planetIdx === orbit.planetIdx && targetRef.moonIdx === mi);
          const enterLimit = m.rHillKm * (forceArrivalCapture || targeted ? 0.98 : 0.92);
          if (distKm < enterLimit && (forceArrivalCapture || targeted || relSpeed < 1.8 * vEscMoon)) {
            switchPhysicsPrimary({ kind: 'moon', planetIdx: orbit.planetIdx, moonIdx: mi });
            S.orbitFrame = 'moon'; S.moonIdx = mi;
            if (forceArrivalCapture || targeted) {
              const safeR = O.safeOrbitRadiusKm(m.radiusKm, m.rHillKm, true, O.bodyAtmosphereAltKm(m, 'moon'));
              if (len(orbit.rKm) < m.radiusKm + Math.max(350, 0.35 * m.radiusKm) * 0.85) {
                const radHat = len(orbit.rKm) > 1e-6 ? unit(orbit.rKm) : [1, 0, 0];
                const tanHat = unit(cross(orbit.el?.normalHat || [0, 0, 1], radHat));
                orbit.rKm = mul(radHat, safeR);
                orbit.vKmS = mul(tanHat, Math.sqrt(m.muKm3S2 / safeR));
                refreshOrbit(); updateGalPosition();
              }
            }
            if (!forceArrivalCapture) message('Entered ' + m.name.toUpperCase() + ' SOI (alt ' + Math.round(orbit.altKm) + ' km).');
            return true;
          }
        }
      }
      const soi = p.soiRadiusKm || p.orbitRadiusAU * O.AU_KM * Math.pow(p.muKm3S2 / sys().muStarKm3S2, 0.4);
      if ((orbit.el.radiusKm > soi && dot(orbit.rKm, orbit.vKmS) > 0) || (orbit.el.energy > 0 && orbit.el.speedKmS > 160)) {
        setFocusSoi('star', orbit.planetIdx, undefined, Boolean(S.burn || S.orbitPlan || S.maneuverChain.length));
        return true;
      }
      return false;
    }
    if (orbit.primary === 'star' && !burnPending) {
      const s = sys();
      if (burnPending) return false;
      for (let pi = 0; pi < s.planets.length; pi++) {
        const p = s.planets[pi];
        if (!(p.rHillKm > 0)) continue;
        const pSt = body('planet', pi);
        const relR = sub(orbit.rKm, pSt.rKm), relV = sub(orbit.vKmS, pSt.vKmS);
        const distKm = len(relR), relSpeed = len(relV);
        const vEscPlanet = Math.sqrt(2 * p.muKm3S2 / Math.max(distKm, p.radiusKm));
        const targeted = !!(targetRef && targetRef.kind === 'planet' && targetRef.planetIdx === pi);
        if (pi === soiSkipPlanetIdx) {
          if (distKm > p.rHillKm * 1.05) soiSkipPlanetIdx = -1;
          else if (!forceArrivalCapture && !targeted) continue;
        }
        if (distKm < p.rHillKm * (forceArrivalCapture || targeted ? 0.98 : 0.92) &&
            (forceArrivalCapture || ((targeted || relSpeed < 1.8 * vEscPlanet) &&
              !(S.burn?.phase === 'chain' && S.burn.queue?.[0]?.id === 'orbit-cap')))) {
          switchPhysicsPrimary({ kind: 'planet', planetIdx: pi });
          const safeR = O.safeOrbitRadiusKm(p.radiusKm, p.rHillKm, false, O.bodyAtmosphereAltKm(p, 'planet'));
          if ((forceArrivalCapture || targeted) && len(orbit.rKm) < safeR * 0.96) {
            const rHat = unit(orbit.rKm);
            orbit.rKm = mul(rHat, safeR);
            const tHat = unit(sub(orbit.vKmS, mul(rHat, dot(orbit.vKmS, rHat))));
            const tDir = len(tHat) > 1e-8 ? tHat : [0, 1, 0];
            orbit.vKmS = mul(tDir, Math.sqrt(p.muKm3S2 / safeR));
            refreshOrbit(); updateGalPosition();
          }
          S.orbitFrame = 'planet'; S.moonIdx = 0;
          if (!forceArrivalCapture) message('Entered ' + p.name.toUpperCase() + ' SOI.');
          return true;
        }
      }
    }
    return false;
  }
  function stepBrachistochrone(seconds, realSeconds, paced) {
    const b = S.burn, p = b.plan, from = b.elapsedS;
    const flipRealS = 1.25, flipEnd = b.legRealS + flipRealS;
    const flipTravelS = Math.min(flipRealS, p.tFlipS * 0.2);
    const legTime = (timeS, totalS) => {
      const fraction = clamp(timeS / b.legRealS, 0, 1);
      const ease = fraction**3 * (10 + fraction * (-15 + 6 * fraction));
      const base = Math.min(totalS, b.legRealS);
      return base * fraction + (totalS - base) * ease;
    };
    b.realS += realSeconds;
    if (paced) {
      if (b.realS < b.legRealS) {
        b.phase = 'accel';
        b.elapsedS = legTime(b.realS, p.tFlipS);
      } else if (b.realS < flipEnd) {
        b.phase = 'flip';
        b.elapsedS = p.tFlipS + flipTravelS * (b.realS - b.legRealS) / flipRealS;
      } else {
        b.phase = 'decel';
        b.elapsedS = p.tFlipS + flipTravelS + legTime(b.realS - flipEnd, p.tofS - p.tFlipS - flipTravelS);
      }
    } else {
      b.elapsedS = from + seconds;
      b.phase = b.elapsedS < p.tFlipS ? 'accel' : 'decel';
    }
    b.elapsedS = clamp(b.elapsedS, from, p.tofS);
    const elapsed = b.elapsedS - from, turning = b.phase === 'flip', braking = b.phase === 'decel';
    const flip = !isReversible() && (turning || braking);
    const thrust = typeof p.accelAt === 'function' ? p.accelAt(b.elapsedS)
      : (turning || braking ? p.decelLegKmS2 : p.accelLegKmS2);
    let heading = (turning || braking) ? mul(thrust, -1) : thrust;
    if (braking && p.tofS > 0 && b.elapsedS / p.tofS > 0.85 &&
        (p.targetRef?.kind === 'planet' || p.targetRef?.kind === 'moon')) {
      const originVel = orbit.primary === 'star'
        ? [0, 0, 0]
        : Galaxy.getBodyWorldState(sys(), currentPrimaryRef(), S.simTimeS + elapsed).vKmS;
      const bodyVel = Galaxy.getBodyWorldState(sys(), p.targetRef, S.simTimeS + elapsed).vKmS;
      const relV = sub(p.stateAt(b.elapsedS).vKmS, sub(bodyVel, originVel));
      if (len(relV) > 1e-6) {
        const blend = smooth((b.elapsedS / p.tofS - 0.85) / 0.15);
        const mixed = add(mul(unit(heading), 1 - blend), mul(unit(relV), blend));
        if (len(mixed) > 1e-6) heading = unit(mixed);
      }
    }
    if (len(heading) > 1e-10) slew(heading, realSeconds * 2);
    S.flip = flip;
    const envelope = turning ? 0 : paced ? smooth((braking ? b.realS - flipEnd : b.realS) / 0.3)
      * (braking ? smooth((flipEnd + b.legRealS - b.realS) / 0.45) : smooth((b.legRealS - b.realS) / 0.3)) : 1;
    S.thrustCmdG = (braking ? -1 : 1) * len(thrust) / O.G0_KMS2 * envelope;
    const simStart = S.simTimeS;
    const subN = Math.max(1, Math.min(64, Math.ceil(elapsed / 60)));
    let prevSt = { rKm: orbit.rKm.slice(), vKmS: orbit.vKmS.slice() };
    for (let si = 1; si <= subN; si++) {
      const f0 = (si - 1) / subN, f1 = si / subN;
      const curSt = p.stateAt(from + elapsed * f1);
      const sw = evaluateSweptPhysics(prevSt.rKm, curSt.rKm, prevSt.vKmS, curSt.vKmS,
        simStart + elapsed * f0, simStart + elapsed * f1);
      if (sw.impact) return;
      prevSt = curSt;
    }
    S.simTimeS += elapsed; S.epochYear += elapsed / YEAR; S.shipTauYears += elapsed / YEAR;
    Object.assign(orbit, prevSt);
    b.etaS = p.tofS - b.elapsedS; b.progress = b.elapsedS / p.tofS;
    b.remainingDvKmS = (Math.max(0, p.tFlipS - b.elapsedS) * len(p.accelLegKmS2)) +
      (p.tofS - Math.max(p.tFlipS, b.elapsedS)) * len(p.decelLegKmS2);
    if (paced) S.effectiveWarp = Math.max(1, elapsed / realSeconds);
    let capturedLabel = null;
    if (b.etaS <= 1e-8) {
      if (p.targetRef?.kind === 'planet' || p.targetRef?.kind === 'moon') {
        switchPhysicsPrimary(p.targetRef);
        S.orbitFrame = p.targetRef.kind;
        if (p.targetRef.kind === 'moon') S.moonIdx = p.targetRef.moonIdx;
        else S.moonIdx = 0;
        capturedLabel = orbit.bodyName.toUpperCase();
      }
      S.burn = null; S.orbitPlan = null; S.thrustCmdG = 0; S.flip = false;
      S.timeWarp = 1; S.effectiveWarp = 1; S.autoClock = true; S.clockExplicit = false;
    }
    refreshOrbit(); updateGalPosition();
    S.eta = Math.atanh(clamp(len(starState().vKmS) / O.C_KMS, 0, 0.999999999));
    S.beta = Math.tanh(S.eta); S.gamma = Math.cosh(S.eta);
    if (!S.burn) {
      message(capturedLabel
        ? 'Flip-burn complete. Captured in ' + capturedLabel + ' orbit (alt ' + Math.round(orbit.altKm) + ' km).'
        : 'Flip-burn complete. Target orbit matched.');
    }
  }
  function stepOrbitalState(seconds, realSeconds, liveVisual = false) {
    let left = seconds, iter = 0;
    if (S.burn?.firing && liveVisual) {
      stepFiniteBurn(S.burn, realSeconds, f => {
        if (f.kind === 'chain') {
          completeChainNode(S.burn, f.node);
        } else if (f.kind === 'wait') {
          S.burn.phase = 'coast';
          S.burn.remainingS = S.burn.plan.transferTimeS;
          S.burn.remainingDvKmS = S.burn.plan.dv2KmS;
        } else if (f.kind === 'coast') {
          S.burn = null; S.thrustCmdG = 0; S.timeWarp = 1; S.effectiveWarp = 1;
          checkSoiTransition(true, f.targetRef || null);
          message('Orbit insertion complete.');
        }
      });
      return;
    }
    if (S.burn?.firing && !liveVisual) {
      const f = S.burn.firing;
      if (f.appliedFrac < 1) { impulse(mul(f.dvVec, 1 - f.appliedFrac)); updateGalPosition(); }
      S.burn.firing = null; S.thrustCmdG = 0;
      if (f.kind === 'chain') completeChainNode(S.burn, f.node);
      else if (f.kind === 'wait') {
        S.burn.phase = 'coast';
        S.burn.remainingS = S.burn.plan.transferTimeS;
        S.burn.remainingDvKmS = S.burn.plan.dv2KmS;
      } else if (f.kind === 'coast') {
        S.burn = null; S.timeWarp = 1;
        checkSoiTransition(true, f.targetRef || null);
      }
    }
    const chainReady = () => S.burn?.phase === 'chain' && !S.burn.firing && S.burn.remainingS <= 1e-7;
    while ((left > 1e-8 || chainReady()) && iter++ < 600 && S.mode !== 'interstellar' && !S.docked) {
      const burn = S.burn;
      let accel = [0, 0, 0], dt = left;
      if (burn?.phase === 'chain') {
        if (chainReady()) {
          if (liveVisual && burn.queue[0]) {
            const dvV = nodeDvVec(burn.queue[0]);
            if (len(dvV) > 1e-6) {
              const nodePop = burn.queue.shift();
              startFiniteBurn(burn, dvV, nodePop.label, { kind: 'chain', node: nodePop });
              S.effectiveWarp = 1;
              stepFiniteBurn(burn, realSeconds, f => completeChainNode(burn, f.node));
              break;
            }
          }
          advanceManeuverChain(burn); continue;
        }
        const period = orbit.el.periodS;
        dt = Math.min(dt, burn.remainingS, Number.isFinite(period) ? period * 0.025 : 3600);
        if (burn.remainingS < 260 && burn.queue[0]) {
          const dv0 = nodeDvVec(burn.queue[0]);
          if (len(dv0) > 1e-8) slew(dv0, Math.max(realSeconds, 0.016) * 2.8);
        }
        // Exact Kepler coast preserves Chronoscope maneuver-chain accuracy to < 1 m while sweeping collisions.
        const coastFn = O.keplerCoast(orbit.rKm, orbit.vKmS, orbit.muKm3S2, orbit.el);
        const maxSub = Math.max(15, Math.min(240, Number.isFinite(period) ? period * 0.01 : 180));
        const subN = clamp(Math.ceil(dt / maxSub), 1, 64);
        const simT0 = S.simTimeS;
        let prevR = orbit.rKm.slice(), prevV = orbit.vKmS.slice();
        let impacted = false, advS = 0;
        for (let si = 1; si <= subN; si++) {
          const t0 = dt * ((si - 1) / subN), t1 = dt * (si / subN);
          const nextSt = coastFn(t1);
          const sw = evaluateSweptPhysics(prevR, nextSt.rKm, prevV, nextSt.vKmS, simT0 + t0, simT0 + t1);
          if (sw.impact) { impacted = true; break; }
          if (sw.modified) {
            prevR = sw.rKm; prevV = sw.vKmS; advS = t1; break;
          }
          prevR = nextSt.rKm; prevV = nextSt.vKmS; advS = t1;
        }
        if (impacted) break;
        orbit.rKm = prevR; orbit.vKmS = prevV;
        S.simTimeS += advS; S.epochYear += advS / YEAR; S.shipTauYears += advS / YEAR;
        left -= advS;
        burn.remainingS = Math.max(0, burn.remainingS - advS);
        burn.etaS = burn.remainingS;
        refreshOrbit();
        checkSoiTransition(false);
        updateGalPosition();
        const wChain = starState();
        S.eta = Math.atanh(clamp(len(wChain.vKmS) / O.C_KMS, 0, 0.999999999)); S.beta = Math.tanh(S.eta); S.gamma = Math.cosh(S.eta);
        continue;
      } else if (burn && burn.phase !== 'guided') {
        if (burn.remainingS <= 1e-7) {
          if (burn.phase === 'wait') {
            if (liveVisual && startFiniteBurn(burn, burn.plan.dv1VecKmS, burn.label + ' DEP', { kind: 'wait' })) {
              stepFiniteBurn(burn, realSeconds, () => {
                if (!S.burn) return;
                S.burn.phase = 'coast';
                S.burn.remainingS = S.burn.plan.transferTimeS;
                S.burn.remainingDvKmS = S.burn.plan.dv2KmS;
              });
              break;
            }
            if (!impulse(burn.plan.dv1VecKmS)) break;
            burn.phase = 'coast'; burn.remainingS = burn.plan.transferTimeS;
            burn.remainingDvKmS = burn.plan.dv2KmS; continue;
          }
          if (liveVisual && startFiniteBurn(burn, burn.plan.dv2VecKmS, burn.label + ' INSERT', { kind: 'coast', targetRef: burn.plan?.targetRef || null })) {
            stepFiniteBurn(burn, realSeconds, f => {
              S.burn = null; S.thrustCmdG = 0; S.timeWarp = 1; S.effectiveWarp = 1;
              checkSoiTransition(true, f.targetRef || null);
              message('Orbit insertion complete.');
            });
            break;
          }
          if (!impulse(burn.plan.dv2VecKmS)) break;
          S.burn = null; S.thrustCmdG = 0; S.timeWarp = 1;
          checkSoiTransition(true, burn.plan?.targetRef || null);
          message('Orbit insertion complete.'); continue;
        }
        const upcomingDv = burn.phase === 'wait' ? burn.plan?.dv1VecKmS : burn.plan?.dv2VecKmS;
        if (burn.remainingS < 240 && validVec(upcomingDv) && len(upcomingDv) > 1e-8) {
          slew(upcomingDv, Math.max(realSeconds, 0.016) * 2.8);
        }
        dt = Math.min(dt, burn.remainingS); burn.remainingS -= dt; burn.etaS = burn.remainingS;
      } else if (burn) {
        const target = targets().find(t => t.id === burn.targetId);
        if (!target) { S.burn = null; continue; }
        let guidedTarget = target;
        if (target.focusRef && (target.focusRef.kind === 'moon' || target.focusRef.kind === 'planet')) {
          const safeSt = safeTargetOffsetState(target.focusRef, orbit.rKm, S.simTimeS);
          const destB = bodyRecord(target.focusRef);
          const minBodyR = (safeSt.bodyRadiusKm || (destB && destB.radiusKm) || 1000) + O.bodyAtmosphereAltKm(destB, target.focusRef.kind) + 450;
          const relToBody = sub(orbit.rKm, safeSt.bodyCenterKm);
          let aimR = safeSt.rKm;
          if (len(relToBody) < minBodyR * 1.18) {
            aimR = add(safeSt.bodyCenterKm, mul(unit(relToBody), Math.max(safeSt.captureRadiusKm || minBodyR, minBodyR * 1.25)));
          }
          guidedTarget = Object.assign({}, target, {
            radiusKm: len(aimR), rpKm: len(aimR), raKm: len(aimR),
            targetPosKm: aimR, targetVelKmS: safeSt.vKmS
          });
        } else if (target.kind === 'station' && validVec(target.targetPosKm) && validVec(target.targetVelKmS)) {
          const nHat = unit(cross(target.targetPosKm, target.targetVelKmS));
          guidedTarget = Object.assign({}, target, { targetPosKm: add(target.targetPosKm, mul(nHat, 2.0)) });
        }
        // Deflect guided target around blocking primary/moons/planets along the direct chord so torch never plunges into a limb.
        if (validVec(guidedTarget.targetPosKm)) {
          const aimOrig = guidedTarget.targetPosKm;
          const origW = orbit.primary === 'star' ? { rKm: [0, 0, 0], vKmS: [0, 0, 0] }
            : Galaxy.getBodyWorldState(sys(), currentPrimaryRef(), S.simTimeS);
          const bodies = collectCollisionBodies();
          let nearestHit = null;
          for (let bi = 0; bi < bodies.length; bi++) {
            const { ref: bRef, body: bObj } = bodies[bi];
            const bW = bRef.kind === 'star' ? { rKm: [0, 0, 0], vKmS: [0, 0, 0] }
              : Galaxy.getBodyWorldState(sys(), bRef, S.simTimeS);
            const cRel = sub(bW.rKm, origW.rKm);
            const clearR = (bObj.radiusKm || 1000) + O.bodyAtmosphereAltKm(bObj, bRef.kind) + 320;
            const sameTgt = target.focusRef && bRef.kind === target.focusRef.kind &&
              (bRef.kind === 'star' || (bRef.planetIdx === target.focusRef.planetIdx && (bRef.kind !== 'moon' || bRef.moonIdx === target.focusRef.moonIdx)));
            if (sameTgt && len(sub(orbit.rKm, cRel)) <= clearR * 1.38) continue;
            const segHit = O.segmentSphereHit(orbit.rKm, aimOrig, cRel, clearR);
            if (segHit.hit && segHit.tHit > 0.02 && segHit.tHit < 0.98) {
              if (!nearestHit || segHit.tHit < nearestHit.tHit) {
                nearestHit = { tHit: segHit.tHit, cRel, clearR, muKm3S2: bObj.muKm3S2 || orbit.muKm3S2, bRelV: sub(bW.vKmS, origW.vKmS) };
              }
            }
          }
          if (nearestHit) {
            const cRel = nearestHit.cRel;
            const chordHat = unit(sub(aimOrig, orbit.rKm));
            const limbNrm = unit(orbit.el?.normalHat || cross(sub(orbit.rKm, cRel), orbit.vKmS) || [0, 0, 1]);
            const sideRaw = cross(limbNrm, chordHat);
            const sideHat = len(sideRaw) > 1e-6 ? unit(sideRaw) : unit(cross([0, 0, 1], chordHat));
            const shipToC = sub(orbit.rKm, cRel);
            const signV = Math.abs(dot(orbit.vKmS, sideHat)) > 0.2 ? Math.sign(dot(orbit.vKmS, sideHat))
              : (dot(shipToC, sideHat) >= 0 ? 1 : -1);
            const wpDist = nearestHit.clearR * 1.48;
            const wpR = add(cRel, mul(sideHat, signV * wpDist));
            const wpRadHat = unit(sub(wpR, cRel));
            const wpTan = unit(cross(limbNrm, wpRadHat));
            const wpSpeed = Math.max(len(orbit.vKmS), Math.sqrt(nearestHit.muKm3S2 / Math.max(10, wpDist)));
            guidedTarget = Object.assign({}, guidedTarget, {
              radiusKm: len(wpR), rpKm: len(wpR), raKm: len(wpR),
              targetPosKm: wpR, targetVelKmS: add(nearestHit.bRelV, mul(wpTan, wpSpeed))
            });
          }
        }
        const guidance = O.computeGuidedOrbitMatch(orbit.rKm, orbit.vKmS, orbit.muKm3S2, guidedTarget, rocket.maxAccelG * O.G0_KMS2);
        const bodyConverged = target.focusRef && (target.focusRef.kind === 'moon' || target.focusRef.kind === 'planet') &&
          guidance.errAltKm < 60 && guidance.errVelKmS < 0.08;
        if (guidance.converged || bodyConverged) {
          S.burn = null; S.thrustCmdG = 0; S.timeWarp = 1;
          if (target.focusRef && (target.focusRef.kind === 'planet' || target.focusRef.kind === 'moon')) {
            switchPhysicsPrimary(target.focusRef);
            S.orbitFrame = target.focusRef.kind;
            if (target.focusRef.kind === 'moon') S.moonIdx = target.focusRef.moonIdx;
            else S.moonIdx = 0;
            message('Target orbit matched. Captured in ' + orbit.bodyName.toUpperCase() + ' orbit (alt ' + Math.round(orbit.altKm) + ' km).');
          } else {
            message('Target orbit matched.');
          }
          continue;
        }
        accel = guidance.accelVecKmS2; burn.remainingDvKmS = guidance.dvEstKmS;
        const pSafeR = orbit.bodyRadiusKm + O.bodyAtmosphereAltKm(currentPrimaryBody(), orbit.primary) + 260;
        if (len(orbit.rKm) < pSafeR * 1.12 && dot(orbit.rKm, orbit.vKmS) < 0) {
          const rOut = unit(orbit.rKm);
          const inComp = dot(accel, rOut);
          if (inComp < 0) accel = add(sub(accel, mul(rOut, inComp)), mul(rOut, Math.min(rocket.maxAccelG * O.G0_KMS2, Math.abs(inComp) + 0.005)));
        }
        burn.progress = clamp(1 - guidance.dvEstKmS / Math.max(1e-9, burn.initialDvKmS), 0, 1);
        dt = Math.min(dt, 5, 0.01 * Math.sqrt(orbit.el.radiusKm**3 / orbit.muKm3S2));
        S.thrustCmdG = len(accel) / O.G0_KMS2;
        S.flip = false;
        if (len(accel) > 1e-12) {
          slew(accel, realSeconds * (dt / seconds));
          accel = mul(S.headingGal, Math.max(0, dot(accel, S.headingGal)));
        }
      } else {
        const periodEst = orbit.el && orbit.el.energy < 0 && Number.isFinite(orbit.el.periodS) ? orbit.el.periodS : 60000;
        if (!S.thrustCmdG && orbit.el && orbit.el.energy < 0 && left > periodEst * 2.5) left = periodEst * 2.5;
        const maxStep = S.thrustCmdG
          ? (orbit.focusSoi === 'star' ? Math.min(left, 36000) : orbit.focusSoi === 'moon' ? Math.min(left, 180) : Math.min(left, 1800))
          : Math.min(left, Math.max(30, Math.min(3600, periodEst * 0.025)));
        dt = Math.min(dt, maxStep);
        if (isReversible()) S.flip = false;
        else if (S.thrustCmdG !== 0) S.flip = S.thrustCmdG < 0;
        if (S.attitudeMode !== 'MANUAL') slew(orbitDirection(), realSeconds * (dt / seconds));
        const velocityLock = S.attitudeMode === 'PROGRADE' || S.attitudeMode === 'RETROGRADE';
        if (!(velocityLock && S.thrustCmdG < 0 && dot(S.headingGal, orbit.el.progradeHat) < 0))
          accel = mul(S.headingGal, S.thrustCmdG * O.G0_KMS2);
      }
      const simT0 = S.simTimeS;
      let impacted = false, modifiedSt = null;
      const next = O.stepOrbitalState(orbit.rKm, orbit.vKmS, accel, dt, orbit.muKm3S2, {
        maxSubstepS: orbit.primary === 'moon' ? 30 : 120,
        onSubstep(r0, r1, v0, v1, t0, t1) {
          const sw = evaluateSweptPhysics(r0, r1, v0, v1, simT0 + t0, simT0 + t1);
          if (sw.impact) { impacted = true; return false; }
          if (sw.modified) { modifiedSt = { rKm: sw.rKm, vKmS: sw.vKmS, elapsedS: t1 }; return false; }
          return true;
        }
      });
      if (impacted) break;
      const advDt = modifiedSt ? modifiedSt.elapsedS : dt;
      orbit.rKm = modifiedSt ? modifiedSt.rKm : next.rKm;
      orbit.vKmS = modifiedSt ? modifiedSt.vKmS : next.vKmS;
      S.simTimeS += advDt; S.epochYear += advDt / YEAR; S.shipTauYears += advDt / YEAR; left -= advDt;
      refreshOrbit();
      checkSoiTransition(false);
      updateGalPosition();
      const world = starState(), speed = len(world.vKmS);
      S.eta = Math.atanh(clamp(speed / O.C_KMS, 0, 0.999999999)); S.beta = Math.tanh(S.eta); S.gamma = Math.cosh(S.eta);
      const highWarp = S.timeWarp === 'interstellar' || S.timeWarp === 'hyper' || (Number.isFinite(S.timeWarp) && S.timeWarp >= 100000);
      const torchEscape = !S.burn && Math.abs(S.thrustCmdG) > 0.02 &&
        (highWarp || S.autoClock) && orbit.el.energy > 0 &&
        (orbit.el.speedKmS > 120 || (orbit.el.radiusKm > 0.25 * O.AU_KM && dot(orbit.rKm, orbit.vKmS) > 0));
      if (orbit.focusSoi === 'star' && (torchEscape || (orbit.el.radiusKm > outerRadius(sys()) && dot(orbit.rKm, orbit.vKmS) > 0))) {
        S.mode = 'interstellar'; S.burn = null; basis(world.vKmS);
        S.velocityGal = S.headingGal;
        syncAutoRelHud(S.beta >= REL_HUD_OFF_BETA || Math.abs(S.thrustCmdG) > 0.02);
        message('Escaped host star SOI. Free relativistic flight.');
      }
    }
    if (left>1e-8 && S.mode==='interstellar') stepCruise(left);
  }
  function outerRadius(s) { return Math.max(50, ...s.planets.map(p => p.orbitRadiusAU * 2)) * O.AU_KM; }
  function setCourseTo(id) {
    if (!system(id) || id === S.currentSystemId) return false;
    S.selectedDestId = id;
    if (!S.multiHop.active) { S.courseDestId = id; S.missionPlan = null; }
    return true;
  }
  let lastRoutePreviewKey, lastRoutePreview;
  function getMultiHopPreview(destId) {
    const id = destId || S.selectedDestId;
    const specs = rocketSpecs(), accelG = Math.max(1, S.planAccelG || 1);
    const vis = Galaxy.getVisibleSystems ? Galaxy.getVisibleSystems(S.discoveredSystems, S.posGal) : Galaxy.SYSTEMS;
    const key = [S.currentSystemId, id, S.maxHopLy, accelG, specs.iceCoverage, specs.iceThick, vis.length].join('|');
    if (key !== lastRoutePreviewKey) {
      lastRoutePreview = Galaxy.planMultiHopRoute(S.currentSystemId, id, {maxHopLy:S.maxHopLy, accelG, rocketSpecs:specs, systems:vis});
      lastRoutePreviewKey = key;
    }
    return lastRoutePreview;
  }
  function setMaxHopLy(ly) {
    if (Number.isFinite(+ly)) S.maxHopLy = clamp(+ly, 10, 20);
    return getMultiHopPreview();
  }
  function clearMultiHop(phase = 'idle') {
    Object.assign(S.multiHop, {active:false, phase, harvesting:false, harvestTimerS:0, harvestSite:null});
    if (phase === 'idle') Object.assign(S.multiHop, {route:null, legIdx:0});
  }
  function launchMultiHopRoute(destId, maxHopLy) {
    if (S.mission || S.multiHop.active) return false;
    if (maxHopLy != null) setMaxHopLy(maxHopLy);
    const route = getMultiHopPreview(destId);
    if (!route?.hops.length) return false;
    const first = route.hops[0];
    const isWaypoint = route.hops.length > 1;
    if (!engageInterstellar({ destId: first.toId, accelG: route.accelG, isWaypointLeg: isWaypoint, waypointIceSite: first.iceStop }, true)) return false;
    S.selectedDestId = route.toId;
    Object.assign(S.multiHop, { active: true, route, legIdx: 0, phase: 'transit', harvesting: false, harvestTimerS: 0, harvestSite: null });
    return true;
  }
  function computeHarvestTiming(iceStart, site, distKm) {
    const missing = clamp(1 - (Number.isFinite(iceStart) ? iceStart : S.iceIntegrity), 0.05, 1);
    const k = site && site.kind;
    const mulSite = k === 'ice-rings' ? 0.85 : (k === 'comet' || k === 'comet-belt') ? 1.25 : 1.0;
    const d = Math.max(0, Number(distKm) || 0);
    // Physical DropShip sortie kinematics (~1.5g thruster, 150 km/s cruise cap) + cryomining op
    const accelLeg = 2 * Math.sqrt(d / 0.0147);
    const legTimeS = d <= 1 ? 240 : (accelLeg <= 20400 ? accelLeg : (20400 + Math.max(0, d - 1.53e6) / 150));
    const mineSimS = clamp(Math.max(4200, missing * 48000) * mulSite, 4200, 64800);
    const totalSimS = Math.round(clamp(2 * legTimeS + mineSimS, HARVEST_MIN_SIM_S, 240 * 3600));
    const outboundFrac = clamp(legTimeS / Math.max(1, totalSimS), 0.14, 0.38);
    return { totalSimS, legTimeS, mineSimS, outboundFrac, returnStartFrac: 1 - outboundFrac };
  }
  function computeHarvestDurationSimS(iceStart, site, distKm) {
    return computeHarvestTiming(iceStart, site, distKm ?? site?.distKm).totalSimS;
  }
  function currentSystemShipStarKm(targetSys) {
    const s = targetSys || sys();
    if (!s) return [0, 0, 0];
    if (S.mode !== 'interstellar' && s.id === S.currentSystemId) return starState().rKm.slice();
    if (S.mission && S.mission.destId === s.id && S.mission.capturePark) return S.mission.capturePark.worldR.slice();
    return mul(sub(S.posGal, s.xyz), O.LY_KM);
  }
  function iceHarvestSite() {
    if (S.multiHop.harvestSite) return S.multiHop.harvestSite;
    const s = sys();
    if (S.mode !== 'interstellar') {
      ensureSystemGravity();
      if (Galaxy.findNearestIceDeposit) {
        const nearest = Galaxy.findNearestIceDeposit(s, starState().rKm, S.simTimeS);
        if (nearest && nearest.deposit) {
          const dep = nearest.deposit;
          return {
            depositId: dep.id,
            name: dep.name,
            kind: dep.kind,
            bodyName: dep.bodyName,
            ref: dep.parentRef,
            deposit: dep,
            distKm: nearest.distKm,
            worldR: nearest.worldR.slice(),
            harvestLabel: dep.harvestLabel
          };
        }
      }
      return Galaxy.findBestIceHarvestSite(s);
    }
    const nearby = system(S.dioramaSysId) || s;
    const nearbyLy = len(sub(nearby.xyz, S.posGal));
    if (nearbyLy < 0.08 && Galaxy.findNearestIceDeposit) {
      const shipKm = currentSystemShipStarKm(nearby);
      const nearest = Galaxy.findNearestIceDeposit(nearby, shipKm, S.simTimeS);
      if (nearest && nearest.deposit) {
        const dep = nearest.deposit;
        return {
          depositId: dep.id,
          name: dep.name,
          kind: dep.kind,
          bodyName: dep.bodyName,
          ref: dep.parentRef,
          deposit: dep,
          distKm: nearest.distKm,
          worldR: nearest.worldR.slice(),
          harvestLabel: dep.harvestLabel
        };
      }
      return Galaxy.findBestIceHarvestSite(nearby);
    }
    return {
      depositId: null, name: 'Deep Space Oort Comet', kind: 'comet-belt', bodyName: 'Deep Space Oort Comet',
      ref: null, deposit: null, distKm: 1.5e6, worldR: null, harvestLabel: 'Cometary H2O harvest via DropShips'
    };
  }
  function localIceAvailable() {
    if (S.beta >= HARVEST_BETA) return false;
    if (S.iceIntegrity <= 0.25) return true;
    if (S.mode !== 'interstellar') return true;
    return nearestStarInfo().distLy < 0.08;
  }
  function restoreHarvestedIce(heat) {
    S.iceIntegrity = 1; S.coreHeat = heat; S.thermalGovernor = false;
    S.thermalLoad = 0; S.thermalState = O.thermalStateOf(heat);
    S.ablation = {intensity:0, iceLoss:0, warningLevel:'nominal'};
    if (S.warning?.source === 'thermal') S.warning = null;
    if (sceneCtrl) sceneCtrl.setIceIntegrity(1);
  }
  function clearIceHarvest() {
    Object.assign(S.iceHarvest, {
      active: false, kind: 'idle', depositId: '', siteName: '', siteKind: '', bodyName: '',
      distKm: 0, depositWorldR: null, outboundFrac: 0.25, returnStartFrac: 0.75,
      timerS: 0, remainingSimS: 0, durationS: 0, durationSimS: 0, elapsedSimS: 0,
      iceStart: 1, progress: 0, phase: 'idle'
    });
  }
  function startIceHarvest(kind, siteOrName, durationSimOverride) {
    const siteObj = typeof siteOrName === 'object' && siteOrName ? siteOrName : iceHarvestSite();
    const siteName = typeof siteOrName === 'string' && siteOrName ? siteOrName : (siteObj?.name || 'Ice Deposit');
    const distKm = Number.isFinite(siteObj?.distKm) ? siteObj.distKm : 0;
    const timing = computeHarvestTiming(S.iceIntegrity, siteObj, distKm);
    const durSim = Math.max(HARVEST_MIN_SIM_S, Number(durationSimOverride) || timing.totalSimS);
    S.autoClock = true;
    S.clockExplicit = false;
    S.timeWarp = 'auto';
    S.effectiveWarp = clamp(durSim / HARVEST_TARGET_REAL_S, 60, 28000);
    S.iceHarvestTrafficS = DROPSHIP_SORTIE_S;
    Object.assign(S.iceHarvest, {
      active: true, kind: kind || 'manual',
      depositId: siteObj?.depositId || siteObj?.deposit?.id || '',
      siteName, siteKind: siteObj?.kind || 'icy-moon', bodyName: siteObj?.bodyName || siteName,
      distKm, depositWorldR: Array.isArray(siteObj?.worldR) ? siteObj.worldR.slice() : null,
      outboundFrac: timing.outboundFrac, returnStartFrac: timing.returnStartFrac,
      timerS: durSim, remainingSimS: durSim, durationS: durSim, durationSimS: durSim, elapsedSimS: 0,
      iceStart: S.iceIntegrity, progress: 0, phase: 'outbound'
    });
  }
  function stepManualHarvest(simSeconds) {
    const h = S.iceHarvest;
    if (!h.active || h.kind === 'waypoint') return;
    const advSim = Math.max(0, Number(simSeconds) || 0);
    const durSim = Math.max(60, h.durationSimS || h.durationS || HARVEST_MIN_SIM_S);
    h.elapsedSimS = Math.min(durSim, (h.elapsedSimS || 0) + advSim);
    h.remainingSimS = Math.max(0, durSim - h.elapsedSimS);
    h.timerS = h.remainingSimS;
    const frac = clamp(h.elapsedSimS / durSim, 0, 1);
    h.progress = frac;
    const outF = h.outboundFrac || 0.25, retF = h.returnStartFrac || 0.75;
    h.phase = frac < outF ? 'outbound' : frac < retF ? 'collecting' : 'returning';
    const startIce = Number.isFinite(h.iceStart) ? h.iceStart : S.iceIntegrity;
    if (frac >= retF) {
      const offloadFrac = smooth((frac - retF) / Math.max(0.05, 1 - retF));
      S.iceIntegrity = Math.max(S.iceIntegrity, startIce + (1 - startIce) * offloadFrac);
    }
    if (h.remainingSimS <= 0) {
      const siteName = h.siteName || iceHarvestSite().name;
      const wasArrival = h.kind === 'arrival';
      const label = iceHarvestSite().harvestLabel;
      restoreHarvestedIce(Math.min(S.coreHeat, 0.12));
      clearIceHarvest();
      S.iceHarvestTrafficS = 2.0;
      S.autoClock = true;
      S.clockExplicit = false;
      S.timeWarp = 1;
      S.effectiveWarp = 1;
      const text = 'DropShips harvested glacial/cometary ice at ' + siteName + ' -- Bow shield restored to 100%.';
      S.toast = { seq: ++toastSeq, title: 'DROPSHIP HARVEST COMPLETE', meta: label, body: text };
      message(text);
    }
  }
  function harvestIceWithDropships() {
    if (!(S.beta < HARVEST_BETA)) return false;
    if (S.iceHarvest.active) return true;
    const site = iceHarvestSite();
    if (!localIceAvailable()) {
      message('No icy body in local orbit -- fly to ' + site.name + ' (or an icy moon/ring/comet) to harvest ice.', 'elevated');
      return false;
    }
    startIceHarvest('manual', site);
    message('DropShips deployed to ' + site.name + ' -- collecting ice (AUTO warp engaged; set 1x for real-time ops).');
    return true;
  }
  const isIntermediateHop = () => S.multiHop.active && !!S.multiHop.route && S.multiHop.legIdx + 1 < S.multiHop.route.hops.length;
  // Intermediate waypoint: stops safely beside the system's visibly icy body, DropShips sortie,
  // nose slews toward the next star, then the next leg departs cleanly around obstacles.
  function beginWaypointHarvest(dest) {
    const hop = S.multiHop;
    S.currentSystemId = dest.id; S.dioramaSysId = dest.id;
    ensureSystemGravity();
    const stopSite = hop.route.hops[hop.legIdx].iceStop || Galaxy.findBestIceHarvestSite(dest);
    const park = S.mission?.capturePark || iceParkingState(dest, stopSite, S.simTimeS);
    orbit.focusSoi = orbit.primary = park.primary || 'planet';
    orbit.planetIdx = Number.isInteger(park.planetIdx) ? park.planetIdx : (dest.station ? dest.station.parentPlanetIdx : 0);
    orbit.moonIdx = Number.isInteger(park.moonIdx) ? park.moonIdx : 0;
    S.orbitFrame = orbit.focusSoi; S.moonIdx = orbit.moonIdx; lagrangeRef = null;
    clearManeuverChain(); resetRotation();
    orbit.rKm = park.rKm.slice(); orbit.vKmS = park.vKmS.slice();
    refreshOrbit();
    updateGalPosition();
    updateFrontierDiscovery(false);
    S.mission = null; S.thrustCmdG = 0; S.cruiseAppliedG = 0; S.flip = false; S.velocityGal = null;
    S.mode = 'interstellar'; syncAutoRelHud(true);
    const depKm = stopSite?.deposit && Galaxy.getIceDepositWorldState
      ? len(sub(Galaxy.getIceDepositWorldState(dest, stopSite.deposit, S.simTimeS).rKm, park.worldR)) : 220;
    const skipWait = S.clockExplicit && S.timeWarp !== 1;
    const timing = computeHarvestTiming(S.iceIntegrity, stopSite, depKm);
    const durSim = timing.totalSimS;
    if (!skipWait) {
      startIceHarvest('waypoint', {
        depositId: stopSite.depositId || stopSite.deposit?.id || '',
        name: dest.name + ' / ' + stopSite.name,
        kind: stopSite.kind,
        bodyName: stopSite.bodyName || stopSite.name,
        ref: stopSite.ref || null,
        deposit: stopSite.deposit || null,
        distKm: depKm,
        harvestLabel: stopSite.harvestLabel
      }, durSim);
    } else {
      S.iceHarvestTrafficS = DROPSHIP_SORTIE_S;
    }
    Object.assign(hop, {
      phase: 'harvesting', harvesting: true, harvestTimerS: durSim, harvestDurationSimS: durSim,
      skipWait, iceStart: S.iceIntegrity, harvestSite: Object.assign({}, stopSite, { distKm: depKm })
    });
    message('DropShips dispatched to ' + stopSite.name + ' -- mining glacial H2O (AUTO warp).');
    if (skipWait) finishHopHarvest();
  }
  function stepHopHarvest(seconds, realSeconds) {
    const hop = S.multiHop, next = hop.route.hops[hop.legIdx + 1], nextSys = system(next.toId);
    const advSim = Math.max(0, Number(seconds) || 0);
    S.simTimeS += advSim; S.epochYear += advSim / YEAR; S.shipTauYears += advSim / YEAR;
    const park = iceParkingState(sys(), hop.harvestSite, S.simTimeS);
    orbit.focusSoi = orbit.primary = park.primary || 'planet';
    orbit.planetIdx = Number.isInteger(park.planetIdx) ? park.planetIdx : (sys().station ? sys().station.parentPlanetIdx : 0);
    orbit.moonIdx = Number.isInteger(park.moonIdx) ? park.moonIdx : 0;
    orbit.rKm = park.rKm.slice(); orbit.vKmS = park.vKmS.slice();
    refreshOrbit();
    updateGalPosition();
    if (nextSys) slew(sub(nextSys.xyz, S.posGal), realSeconds * 1.6);
    const durSim = Math.max(60, hop.harvestDurationSimS || HARVEST_MIN_SIM_S);
    hop.harvestTimerS = Math.max(0, hop.harvestTimerS - advSim);
    const rawFrac = clamp(1 - hop.harvestTimerS / durSim, 0, 1);
    const outF = S.iceHarvest.outboundFrac || 0.25, retF = S.iceHarvest.returnStartFrac || 0.75;
    const frac = rawFrac >= retF ? smooth((rawFrac - retF) / Math.max(0.05, 1 - retF)) : 0;
    const iceStart = Number.isFinite(hop.iceStart) ? hop.iceStart : S.iceIntegrity;
    if (frac > 0) S.iceIntegrity = Math.max(S.iceIntegrity, iceStart + (1 - iceStart) * frac);
    if (S.iceHarvest.active && S.iceHarvest.kind === 'waypoint') {
      S.iceHarvest.elapsedSimS = durSim - hop.harvestTimerS;
      S.iceHarvest.remainingSimS = hop.harvestTimerS;
      S.iceHarvest.timerS = hop.harvestTimerS;
      S.iceHarvest.progress = rawFrac;
      S.iceHarvest.phase = rawFrac < outF ? 'outbound' : rawFrac < retF ? 'collecting' : 'returning';
    }
    if (hop.harvestTimerS <= 0 || hop.skipWait) finishHopHarvest();
  }
  function finishHopHarvest() {
    const hop = S.multiHop, nextIdx = hop.legIdx + 1, next = hop.route.hops[nextIdx];
    const siteName = hop.harvestSite ? hop.harvestSite.name : 'WAYPOINT';
    const moreHops = nextIdx + 1 < hop.route.hops.length;
    restoreHarvestedIce(0.08);
    clearIceHarvest();
    S.autoClock = true; S.clockExplicit = false;
    message('DROPSHIP ICE HARVEST COMPLETE AT ' + siteName +
      ' (ICE 100%) - LAUNCHING HOP ' + (nextIdx + 1) + '/' + hop.route.hops.length);
    if (!engageInterstellar({ destId: next.toId, accelG: hop.route.accelG, isWaypointLeg: moreHops, waypointIceSite: next.iceStop }, true)) {
      clearMultiHop('aborted'); message('Next hop could not be launched.', 'elevated'); return;
    }
    Object.assign(hop, { legIdx: nextIdx, phase: 'transit', harvesting: false, harvestTimerS: 0, harvestDurationSimS: 0, harvestSite: null, skipWait: false });
  }
  function abortMultiHopRoute() {
    if (!S.multiHop.active) return false;
    const inTransit = !!S.mission, wasHarvesting = S.multiHop.harvesting;
    clearMultiHop('aborted');
    clearIceHarvest();
    S.iceHarvestTrafficS = 0;
    // Aborting at a waypoint stop drops the ship into the local station orbit rather than stranding it at rest.
    if (wasHarvesting && !inTransit) { S.autoClock = true; enterSystemOrbit(S.currentSystemId, false, true); S.timeWarp = 1; }
    if (inTransit) emergencyBrakeToSafeBeta();
    message('Multi-hop route aborted.', 'elevated');
    return true;
  }
  function emergencyBrakeToSafeBeta() {
    if (S.docked || S.mode !== 'interstellar') return false;
    if (S.multiHop.active) clearMultiHop('aborted');
    S.mission = null;
    S.emergencyBraking = S.eta > 0;
    S.thrustCmdG = S.emergencyBraking ? -EMERGENCY_BRAKE_G : 0;
    S.timeWarp = S.emergencyBraking ? 'interstellar' : 1;
    S.clockExplicit = false; S.autoClock = true;
    message('Emergency braking at 0.25 g. DropShip harvesting available below 0.02c.', 'elevated');
    return true;
  }
  function setAberrationZoom(z) {
    if ([1, 5, 20].includes(+z)) S.aberrationZoom = +z;
    return S.aberrationZoom;
  }
  function plotStarCourse(opts) {
    opts = opts || {}; if (opts.destId && !opts.routeLeg) setCourseTo(opts.destId);
    const dest = system(opts.destId || S.courseDestId);
    if (!dest || dest.id === S.currentSystemId) return null;
    const g = clamp(Number(opts.accelG) || 1, opts.minAccelG || 0.05, rocket.maxAccelG);
    S.planAccelG = g;
    S.missionPlan = O.planRelativisticMission(len(sub(dest.xyz, S.posGal)), g, rocket, S.commissionedGenome,
      { maxBetaCap: Math.min(opts.betaCap || 0.999999, Math.tanh(MAX_FLIGHT_ETA)) });
    return S.missionPlan;
  }
  function solveMissionLeg(m) {
    const dest = system(m.destId), k = m.accelG * O.KAPPA_PER_G, startEta = S.eta;
    const origin = S.posGal.slice(), offset = m.travelledLy;
    let arrivalTime = m.arrivalTime, endpoint, endpointKm, distance, peakEta, coastYears, coordYears;
    for (let i = 0; i < 12; i++) {
      const park = m.isWaypointLeg ? iceParkingState(dest, m.waypointIceSite, arrivalTime) : parkingState(dest, arrivalTime);
      endpointKm = park.worldR;
      endpoint = add(dest.xyz, mul(endpointKm, 1 / O.LY_KM));
      distance = len(sub(endpoint, origin));
      peakEta = Math.max(startEta, Math.min(m.peakEtaCap, Math.acosh((k * distance + Math.cosh(startEta) + 1) / 2)));
      const burnDistance = (2 * Math.cosh(peakEta) - Math.cosh(startEta) - 1) / k;
      coastYears = Math.max(0, distance - burnDistance) / Math.sinh(peakEta);
      coordYears = (2 * Math.sinh(peakEta) - Math.sinh(startEta)) / k + coastYears * Math.cosh(peakEta);
      arrivalTime = S.simTimeS + coordYears * YEAR;
    }
    Object.assign(m, {endpoint, endpointKm, peakEta, arrivalTime,
      direction:unit(sub(endpoint, origin)), totalLy:offset + distance,
      brakeTauS:((peakEta - startEta) / k + coastYears) * YEAR, stopTauS:((2 * peakEta - startEta) / k + coastYears) * YEAR});
    S.velocityGal = m.direction;
  }
  function pacedSeconds(progress, duration, total, startWarp, endWarp) {
    const p = clamp(progress, 0, 1);
    const start = Math.min(startWarp * duration, 2 * total);
    const end = Math.min(endWarp * duration, 2 * total);
    return total * smooth(p) + p * (1 - p) * (start * (1 - p) - end * p);
  }
  function computeApproachShipRelStarKm(m, timeS) {
    if (!m) return null;
    if (m.capturePark) {
      return { posKm: m.capturePark.worldR.slice(), livePark: m.capturePark, headingDir: unit(m.capturePark.vKmS) };
    }
    const dest = system(m.destId);
    const livePark = m.isWaypointLeg ? iceParkingState(dest, m.waypointIceSite, timeS) : parkingState(dest, timeS);
    const remKm = Math.max(0, m.totalLy - m.travelledLy) * O.LY_KM;
    const outerStart = SYSTEM_APPROACH_LY * O.LY_KM, outerEnd = 0.006 * O.LY_KM;
    const wLive = 1 - smooth((remKm - outerEnd) / Math.max(1e3, outerStart - outerEnd));
    const targetKm = add(mul(m.endpointKm || livePark.worldR, 1 - wLive), mul(livePark.worldR, wLive));
    const parkRadius = Math.max(1200, len(livePark.rKm));
    const blendSpan = Math.max(1.4e6, 28 * parkRadius);
    const inBack = mul(unit(m.direction), -1);
    const radOut = unit(livePark.rKm);
    if (!validVec(m.avoidNormal)) {
      const c = cross(livePark.rKm, livePark.vKmS);
      m.avoidNormal = len(c) > 1e-6 ? unit(c) : [0, 0, 1];
    }
    let nearDir = unit(add(mul(inBack, 0.80), mul(radOut, 0.44)));
    if (dot(nearDir, inBack) < 0.45) {
      nearDir = unit(add(mul(inBack, 0.72), mul(radOut, 0.28)));
    }
    if (!m.isWaypointLeg && validVec(livePark.stationWorldR)) {
      const toStation = unit(sub(livePark.stationWorldR, livePark.worldR));
      if (dot(nearDir, toStation) > 0.30) {
        nearDir = unit(add(nearDir, mul(toStation, -dot(nearDir, toStation) - 0.55)));
      }
    }
    const obstacles = collectSystemObstacles(dest, timeS, false);
    const evalPos = rDist => {
      const uu = smooth(rDist / blendSpan);
      let dArc = add(mul(inBack, uu), mul(nearDir, 1 - uu));
      if (len(dArc) < 0.20) dArc = add(dArc, mul(m.avoidNormal, 0.65 * Math.sin(uu * PI)));
      dArc = unit(dArc);
      const raw = add(targetKm, mul(dArc, rDist));
      return pushPointClearOfObstacles(raw, targetKm, obstacles);
    };
    const posKm = evalPos(remKm);
    const eps = clamp(remKm * 0.025, 0.25, 4000);
    let headingDir;
    if (remKm > eps) {
      const ahead = evalPos(remKm - eps);
      headingDir = unit(sub(ahead, posKm));
      const wV = 1 - smooth(remKm / 32);
      if (wV > 0.001) headingDir = unit(add(mul(headingDir, 1 - wV), mul(unit(livePark.vKmS), wV)));
    } else {
      headingDir = unit(livePark.vKmS);
    }
    return { posKm, livePark, headingDir };
  }
  function computeDepartureShipRelStarKm(m, timeS) {
    if (!m) return null;
    const depSys = system(m.departureId);
    if (!depSys) return null;
    const depKm = Math.max(0, m.travelledLy) * O.LY_KM;
    const startKm = validVec(m.startRelStarKm) ? m.startRelStarKm : mul(sub(m.start, depSys.xyz), O.LY_KM);
    const dir = unit(m.direction);
    const geodesicKm = add(startKm, mul(dir, depKm));
    const clearKm = 3.2e6;
    if (depKm >= clearKm) return geodesicKm;
    const obstacles = collectSystemObstacles(depSys, timeS, false);
    const cleared = pushPointClearOfObstacles(geodesicKm, startKm, obstacles);
    const fadeOut = smooth(clamp((depKm - 0.55 * clearKm) / (0.45 * clearKm), 0, 1));
    return add(mul(cleared, 1 - fadeOut), mul(geodesicKm, fadeOut));
  }
  function makeTransitProfile(m) {
    const k = m.accelG * O.KAPPA_PER_G;
    const approachEta = Math.acosh(1 + k * SYSTEM_APPROACH_LY);
    const approachTau = Math.max(m.brakeTauS, m.stopTauS - approachEta / k * YEAR);
    const turnoverWidth = Math.min(m.brakeTauS * 0.28, (approachTau - m.brakeTauS) * 0.28, YEAR * 0.14);
    const accelerateEnd = Math.max(0, m.brakeTauS - turnoverWidth);
    const turnoverEnd = m.brakeTauS + turnoverWidth;
    const taperReal = 6.4, taperWarp = 1.4e4;
    const taperTau = Math.min((m.stopTauS - approachTau) / 3.2, taperReal * (taperWarp - 1) / Math.log(taperWarp));
    const mainReal = clamp(7.5 + Math.log2(Math.max(1, m.totalLy / 4)) * 3.8, 7.5, 22.0);
    const turnoverReal = 4.0, approachReal = 5.2;
    const turnoverWarp = Math.min((turnoverEnd - accelerateEnd) / turnoverReal, 2e6);
    const approachMeanWarp = (m.stopTauS - approachTau - taperTau) / approachReal;
    // With endpoint rates averaging to the segment's mean, warp descends linearly into the log taper.
    const approachEndWarp = Math.min(taperWarp, approachMeanWarp);
    const approachWarp = 2 * approachMeanWarp - approachEndWarp;
    return [
      {stage:'accelerate', real:mainReal, tau:accelerateEnd, startWarp:1e6, endWarp:turnoverWarp},
      {stage:'turnover', real:turnoverReal, tau:turnoverEnd, startWarp:turnoverWarp, endWarp:turnoverWarp},
      {stage:'brake', real:mainReal, tau:approachTau, startWarp:turnoverWarp, endWarp:approachWarp},
      {stage:'approach', real:approachReal, tau:m.stopTauS - taperTau, startWarp:approachWarp, endWarp:approachEndWarp},
      {stage:'approach', real:taperReal, tau:m.stopTauS, taperWarp}
    ];
  }
  function updateDistanceStage(m) {
    const fraction = clamp(m.travelledLy / m.totalLy, 0, 1);
    const remaining = m.totalLy - m.travelledLy;
    if (remaining < SYSTEM_APPROACH_LY) {
      m.stage = 'approach'; m.stageProgress = clamp(1 - remaining / SYSTEM_APPROACH_LY, 0, 1);
    } else if (fraction < SYSTEM_APPROACH_LY / m.totalLy) {
      m.stage = 'departure'; m.stageProgress = clamp(m.travelledLy / SYSTEM_APPROACH_LY, 0, 1);
    } else if (fraction < 0.46) {
      m.stage = 'accelerate'; m.stageProgress = fraction / 0.46;
    } else if (fraction <= 0.54) {
      m.stage = 'turnover'; m.stageProgress = (fraction - 0.46) / 0.08;
    } else {
      m.stage = 'brake'; m.stageProgress = (fraction - 0.54) / 0.46;
    }
  }
  function loadApproachSystem(m) {
    if (S.dioramaSysId === m.destId) return;
    S.dioramaSysId = m.destId;
    if (sceneCtrl) sceneCtrl.rebuildSystem(system(m.destId), S.simTimeS, 'approach');
  }
  function engageInterstellar(opts, hop = false) {
    if (S.destroyed) { message('Hull destroyed. Recommission at station.', 'critical'); return false; }
    opts = typeof opts === 'string' ? { destId: opts } : opts || {};
    const destId = opts.destId || S.selectedDestId || S.courseDestId;
    if (!system(destId) || destId === S.currentSystemId) return false;
    const plan = plotStarCourse(hop ? {...opts, destId, minAccelG:1, routeLeg:true} : {...opts, destId});
    if (!plan || !(plan.peakEta > 0)) return false;
    if (!hop) clearMultiHop(S.multiHop.active ? 'aborted' : 'idle');
    // Continuing a hop route from a waypoint keeps the camera, screen and DropShip sortie untouched.
    const continuing = hop && S.mode === 'interstellar', inRoute = hop && S.multiHop.active;
    S.courseDestId = destId; S.emergencyBraking = false;
    if (!inRoute) S.iceHarvestTrafficS = 0;
    // Preflight forecast remains visible even before the first simulation tick.
    const revMode = isReversible();
    S.warning = {title:'FLIGHT PLAN', text:(revMode ? 'Reversible-torch transit (bow ice fixed; deck g inverts on brake). ' : 'Bi-cone flip-and-burn (180 deg hull flip at turnover). ') +
      'Core peak ' + plan.thermalPeakPct.toFixed(0) + '%; shield forecast ' + (100 * plan.iceAblationEst).toFixed(1) + '% loss.',level:plan.warningLevel};
    if (S.docked && !continuing) undock();
    const depSys = sys();
    const startRelStarKm = depSys ? mul(sub(S.posGal, depSys.xyz), O.LY_KM) : [0, 0, 0];
    const dest = system(S.courseDestId);
    S.mission = {destId:dest.id, phase:'accelerate', stage:'departure', stageProgress:0,
      accelG:plan.accelG, peakEtaCap:plan.peakEta, arrivalTime:S.simTimeS + plan.coordYears * YEAR,
      start:S.posGal.slice(), startRelStarKm, travelledLy:0, departureId:S.currentSystemId, realS:0, profileTauS:0,
      isWaypointLeg:!!opts.isWaypointLeg, waypointIceSite:opts.waypointIceSite || null};
    solveMissionLeg(S.mission);
    S.mode = 'interstellar'; S.docked = false; S.burn = null; S.orbitPlan = null; syncAutoRelHud(true);
    // Start from actual orbital speed; never destroy the existing rapidity.
    S.thrustCmdG = 0; S.timeWarp = 'interstellar'; S.effectiveWarp = 1; S.clockExplicit = false; S.flip = false;
    if (!inRoute) setScreen('helm');
    message('Course engaged: ' + dest.name + (isReversible() ? '. Reversible-torch braking plotted.' : '. Bi-cone flip-and-burn plotted.')); return true;
  }
  function safeCruiseBeta() {
    const {iceCoverage, iceThick} = S.commissionedGenome.P;
    const safeBeta = rocket.safeBeta ?? O.safeBeta ?? (0.82 + 0.1 * iceCoverage * (0.35 + 0.65 * iceThick));
    return clamp(Number.isFinite(safeBeta) ? safeBeta : 0.9, 0.02, 0.92);
  }
  function transitSegmentSeconds(segment, progress, duration) {
    return segment.taperWarp
      ? duration * (1 - Math.pow(segment.taperWarp, -progress)) / (1 - 1 / segment.taperWarp)
      : pacedSeconds(progress, segment.real, duration, segment.startWarp, segment.endWarp);
  }
  function stepTransitFrame(realSeconds) {
    const m = S.mission;
    if (m.stage === 'capture') {
      stepCapture(m, realSeconds);
      return;
    }
    const paceMul = S.timeWarp === 'hyper' ? 2.4 : 1.0;
    const stepReal = realSeconds * paceMul;
    let desiredHead = m.direction;
    if (m.stage === 'approach') {
      const appInfo = computeApproachShipRelStarKm(m, S.simTimeS);
      if (appInfo && appInfo.headingDir) desiredHead = appInfo.headingDir;
    }
    slew(desiredHead, m.stage === 'approach' ? stepReal * 3.0 : stepReal);
    if (!m.profile) {
      const from = m.realS, to = Math.min(DEPARTURE_REAL_S, from + stepReal);
      const rate = Math.log(1e6) / DEPARTURE_REAL_S;
      const duration = (Math.exp(rate * to) - Math.exp(rate * from)) / rate;
      m.realS = to; m.stageProgress = to / DEPARTURE_REAL_S;
      stepCruise(duration, true, m.accelG * smooth((from + to) / (2 * DEPARTURE_REAL_S)));
      if (S.mission !== m) return;
      S.thrustCmdG = m.accelG * smooth(m.stageProgress);
      S.effectiveWarp = Math.exp(rate * to) * paceMul;
      if (to >= DEPARTURE_REAL_S) {
        solveMissionLeg(m);
        m.profile = makeTransitProfile(m);
        m.profileIndex = 0; m.profileRealS = 0;
      }
      return;
    }
    const segment = m.profile[m.profileIndex], before = m.profile[m.profileIndex - 1]?.tau || 0;
    const to = Math.min(segment.real, m.profileRealS + stepReal), p = to / segment.real;
    const elapsedReal = (to - m.profileRealS) / paceMul;
    const delta = Math.max(0, segment.tau - before);
    const elapsed = transitSegmentSeconds(segment, p, delta);
    const tauS = before + elapsed;
    const dt = Math.max(0, tauS - m.profileTauS);
    const isEnd = m.profileIndex === m.profile.length - 1 && p >= 1;
    m.profileRealS = to; m.profileTauS = tauS;
    m.stage = segment.stage;
    m.stageProgress = segment.stage === 'approach'
      ? (segment.taperWarp ? 0.5 + 0.5 * p : 0.5 * p) : p;
    if (elapsedReal > 1e-9) S.effectiveWarp = Math.max(1, dt / elapsedReal);
    stepCruise(dt + (isEnd ? 0.01 : 0), true);
    if (S.mission !== m || m.stage === 'capture') return;
    if (m.stage === 'turnover') {
      S.flip = !isReversible();
      S.thrustCmdG *= smooth(Math.abs(2 * p - 1));
    }
    if (segment.taperWarp) S.thrustCmdG *= 1 - smooth(p);
    if (to >= segment.real && !isEnd) { m.profileIndex++; m.profileRealS = 0; }
  }
  function seekTransitProfile(m) {
    if (!m.profile || m.stage === 'capture') return;
    const index = m.profile.findIndex(segment => segment.tau > m.profileTauS);
    if (index < 0) return;
    const segment = m.profile[index], before = m.profile[index - 1]?.tau || 0;
    const target = m.profileTauS - before, delta = segment.tau - before;
    let lo = 0, hi = 1;
    for (let i = 0; i < 28; i++) {
      const p = (lo + hi) / 2;
      const elapsed = transitSegmentSeconds(segment, p, delta);
      if (elapsed < target) lo = p;
      else hi = p;
    }
    m.profileIndex = index; m.profileRealS = segment.real * hi;
  }
  function stepCruise(seconds, choreographed = false, departureCommand) {
    let left = seconds / YEAR;
    // Split at acceleration cap, braking switch, and zero rapidity. Even large
    // deterministic test steps cannot leap over a flight phase.
    for (let count = 0; left > 1e-14 && count < 20000 && S.mode === 'interstellar'; count++) {
      const m = S.mission, k = (m ? m.accelG : Math.abs(S.thrustCmdG)) * O.KAPPA_PER_G;
      let command = S.thrustCmdG, dt = Math.min(left, 0.002);
      if (m) {
        if (m.stage === 'capture') { finishArrival(m); break; }
        const remaining = Math.max(0, m.totalLy - m.travelledLy);
        const stopDistance = (Math.cosh(S.eta) - 1) / k;
        if (m.phase !== 'brake' && remaining <= stopDistance + 1e-14) { m.phase = 'brake'; S.flip = !isReversible(); }
        if (m.phase === 'accelerate' && S.eta >= m.peakEta - 1e-12) m.phase = 'coast';
        if (m.phase === 'accelerate') {
          command = departureCommand ?? m.accelG;
          dt = Math.min(dt, Math.max(1e-14, (m.peakEta-S.eta)/k));
          // Solve exact distance-to-stop event under continued acceleration.
          const switchEta = Math.acosh(Math.max(1, (k*remaining + Math.cosh(S.eta) + 1)/2));
          if (switchEta > S.eta) dt = Math.min(dt, (switchEta - S.eta)/k);
        } else if (m.phase === 'coast') {
          command = 0;
          if (Math.sinh(S.eta) > 0) dt = Math.min(dt, Math.max(1e-14, (remaining-stopDistance)/Math.sinh(S.eta)));
        } else {
          command = -m.accelG; dt = Math.min(dt, S.eta / k);
          if (dt <= 1e-14) {
            const remKmLeft = Math.max(0, m.totalLy - m.travelledLy) * O.LY_KM;
            if (remKmLeft > 0.05 && remKmLeft < 2e7) {
              const stepCloseLy = Math.min(m.totalLy - m.travelledLy, Math.max(1.0, remKmLeft * 0.45) / O.LY_KM);
              m.travelledLy = Math.min(m.totalLy, m.travelledLy + stepCloseLy);
              loadApproachSystem(m);
              const appPos = computeApproachShipRelStarKm(m, S.simTimeS);
              const destSys = system(m.destId);
              S.posGal = add(destSys.xyz, mul(appPos.posKm, 1 / O.LY_KM));
              if (m.totalLy - m.travelledLy <= 0.05 / O.LY_KM) { beginCapture(m, choreographed); break; }
              if (choreographed) break;
              continue;
            }
            beginCapture(m, choreographed); break;
          }
        }
      } else {
        // Leave the throttle request intact while attenuating applied forward thrust.
        if (command > 0) {
          const safeBeta = safeCruiseBeta();
          const etaLimit = S.relGov ? Math.atanh(safeBeta) : MAX_FLIGHT_ETA;
          if (S.relGov) command *= smooth((safeBeta - S.beta) / 0.12);
          command = Math.min(command, Math.max(0, etaLimit - S.eta) / (dt * O.KAPPA_PER_G));
        }
        if (command < 0 && (S.emergencyBraking || S.iceIntegrity <= 0)) command = -Math.min(-command, EMERGENCY_BRAKE_G);
        // Enforce hull drive architecture: single bow-ice hulls never flip; bi-cone/twin-ram hulls flip 180 deg to brake.
        if (isReversible()) S.flip = false;
        else if (command !== 0) S.flip = command < 0;
      }
      if (dt <= 1e-14) break;
      const step = O.stepRelativisticRocket(S.eta, command, dt, true, { massMt: S.massMt });
      if (!Number.isFinite(step.eta) || !Number.isFinite(step.gamma) || !Number.isFinite(step.dDistLy)) break;
      S.eta = clamp(step.eta, 0, MAX_FLIGHT_ETA);
      S.beta = Math.tanh(S.eta);
      S.gamma = Math.cosh(S.eta);
      if (m) S.thrustCmdG = command;
      S.cruiseAppliedG = command;
      S.shipTauYears += step.dTauYears;
      S.epochYear += step.dCoordYears;
      S.simTimeS += step.dCoordYears * YEAR;
      left -= dt;
      if (!S.velocityGal) S.velocityGal = S.headingGal;
      if (!m && command > 0 && !S.vecProgradeLock) {
        const turnWeight = clamp(command * O.KAPPA_PER_G * dt / Math.max(1e-4, Math.sinh(S.eta)), 0, 0.5);
        S.velocityGal = unit(add(mul(S.velocityGal, 1 - turnWeight), mul(S.headingGal, turnWeight)));
      }
      const direction = m ? m.direction : S.velocityGal;
      if (m) {
        const remBefore = Math.max(0, m.totalLy - m.travelledLy);
        const stepDist = Math.min(step.dDistLy, remBefore);
        m.travelledLy = Math.min(m.totalLy, m.travelledLy + stepDist);
        const remaining = Math.max(0, m.totalLy - m.travelledLy);
        if (remaining <= SYSTEM_APPROACH_LY) {
          loadApproachSystem(m);
          const appPos = computeApproachShipRelStarKm(m, S.simTimeS);
          const destSys = system(m.destId);
          S.posGal = add(destSys.xyz, mul(appPos.posKm, 1 / O.LY_KM));
          if (remaining < 0.004) m.endpoint = add(destSys.xyz, mul(appPos.livePark.worldR, 1 / O.LY_KM));
        } else if (m.travelledLy <= SYSTEM_APPROACH_LY && S.dioramaSysId === m.departureId) {
          const depPosKm = computeDepartureShipRelStarKm(m, S.simTimeS);
          const depSys = system(m.departureId);
          if (depPosKm && depSys) S.posGal = add(depSys.xyz, mul(depPosKm, 1 / O.LY_KM));
          else {
            const nextPos = sub(m.endpoint, mul(direction, remaining));
            if (validVec(nextPos)) S.posGal = nextPos;
          }
        } else {
          const nextPos = sub(m.endpoint, mul(direction, remaining));
          if (validVec(nextPos)) S.posGal = nextPos;
        }
        if (!choreographed) updateDistanceStage(m);
      } else {
        const nextPos = add(S.posGal, mul(direction, step.dDistLy));
        if (validVec(nextPos)) S.posGal = nextPos;
        if (count % 32 === 0 && validVec(S.posGal)) {
          const list = allSystems();
          let bestSys = null, bestD = Infinity;
          for (let si = 0; si < list.length; si++) {
            const cand = list[si];
            const d = len(sub(cand.xyz, S.posGal));
            if (d < bestD) { bestD = d; bestSys = cand; }
          }
          if (bestSys && bestD < 0.08 && S.dioramaSysId !== bestSys.id) {
            S.dioramaSysId = bestSys.id;
            if (sceneCtrl) sceneCtrl.rebuildSystem(bestSys, S.simTimeS, true);
          }
        }
      }
      if (count % 16 === 0) updateFrontierDiscovery(false);
      const p = S.commissionedGenome.P;
      const hasAftIce = p.iceSymmetry === 'bi-cone' || p.iceSymmetry === 'twin-ram';
      const bowCos = dot(S.headingGal, direction);
      const shieldCos = S.flip && !hasAftIce ? 0 : bowCos;
      S.ablation = O.computeIsmAblation(S.beta,S.gamma,p.iceThick,p.iceCoverage,shieldCos,step.dTauYears);
      S.iceIntegrity = clamp(S.iceIntegrity - S.ablation.iceLoss, 0, 1);
      if (S.iceIntegrity < 0.15) S.ablation.warningLevel = 'critical';
      // Preflight notices clear once cruise starts; the thermal advisory owns itself.
      if (S.warning && S.warning.source !== 'thermal' && S.warning.source !== 'spin') S.warning = null;
      if (m && m.phase === 'brake') {
        const remKmEnd = Math.max(0, m.totalLy - m.travelledLy) * O.LY_KM;
        if (remKmEnd <= 0.005 || (step.stopped && (!choreographed || remKmEnd >= 2e7))) {
          beginCapture(m, choreographed); break;
        }
        if (step.stopped && choreographed) break;
      }
      if (!m && step.stopped) {
        S.flip = false; S.thrustCmdG = 0; S.cruiseAppliedG = 0; S.emergencyBraking = false;
        const near = nearestStarInfo();
        if (near.sys && near.distLy * O.LY_KM < outerRadius(near.sys) * 0.98 && near.distLy * O.LY_KM > near.sys.starRadiusKm * 1.1) {
          S.currentSystemId = S.dioramaSysId = near.sys.id;
          ensureSystemGravity();
          orbit.focusSoi = orbit.primary = 'star'; orbit.planetIdx = 0; orbit.moonIdx = 0;
          S.orbitFrame = 'star'; S.moonIdx = 0; lagrangeRef = null;
          orbit.rKm = mul(sub(S.posGal, near.sys.xyz), O.LY_KM);
          orbit.vKmS = [0, 0, 0];
          S.mode = 'orbit'; S.velocityGal = null;
          refreshOrbit(); syncAutoRelHud();
          message('Relative rest inside ' + near.sys.name.toUpperCase() + ' gravity well -- radial infall.');
          break;
        }
        if (!S.clockExplicit) S.timeWarp = 1;
        message('Relative rest achieved in deep space.');
        break;
      }
    }
    updateFrontierDiscovery(false);
  }
  function beginCapture(m, choreographed) {
    const dest = system(m.destId);
    const park = m.isWaypointLeg ? iceParkingState(dest, m.waypointIceSite, S.simTimeS) : parkingState(dest, S.simTimeS);
    m.endpoint = add(dest.xyz, mul(park.worldR, 1 / O.LY_KM));
    const remKmNow = Math.max(0, m.totalLy - m.travelledLy) * O.LY_KM;
    const errorKm = len(sub(S.posGal, m.endpoint)) * O.LY_KM;
    if (errorKm > 1000 && remKmNow > 1000) {
      // Never teleport an aborted or off-corridor vessel into a capture orbit.
      S.mission = null; S.thrustCmdG = 0; S.timeWarp = 1;
      if (S.multiHop.active) clearMultiHop('aborted');
      S.warning = {title:'CAPTURE MISSED',text:'Stopped outside insertion corridor. Plot a correction course.',level:'critical'}; return;
    }
    loadApproachSystem(m);
    m.stage = 'capture'; m.stageProgress = 0; m.capturePark = park;
    S.posGal = add(dest.xyz, mul(park.worldR, 1 / O.LY_KM));
    S.velocityGal = unit(park.worldV); S.thrustCmdG = 0; S.cruiseAppliedG = 0; S.flip = false;
    S.eta = Math.atanh(len(park.worldV) / O.C_KMS); S.beta = Math.tanh(S.eta); S.gamma = Math.cosh(S.eta);
    S.effectiveWarp = 1;
    if (!choreographed) finishArrival(m);
  }
  function stepCapture(m, realSeconds) {
    const dest = system(m.destId);
    S.simTimeS += realSeconds; S.epochYear += realSeconds / YEAR; S.shipTauYears += realSeconds / YEAR;
    const park = m.capturePark = m.isWaypointLeg ? iceParkingState(dest, m.waypointIceSite, S.simTimeS) : parkingState(dest, S.simTimeS);
    S.posGal = add(dest.xyz, mul(park.worldR, 1 / O.LY_KM));
    S.velocityGal = unit(park.worldV);
    S.eta = Math.atanh(len(park.worldV) / O.C_KMS); S.beta = Math.tanh(S.eta); S.gamma = Math.cosh(S.eta);
    slew(park.vKmS, realSeconds * 2);
    m.stageProgress = clamp(m.stageProgress + realSeconds / CAPTURE_REAL_S, 0, 1);
    if (m.stageProgress >= 1) finishArrival(m);
  }
  function finishArrival(m) {
    const dest = system(m.destId), park = m.capturePark;
    if (isIntermediateHop()) { beginWaypointHarvest(dest); return; }
    S.currentSystemId = dest.id; S.dioramaSysId = dest.id;
    ensureSystemGravity();
    if (!Array.isArray(S.discoveredSystems)) S.discoveredSystems = [];
    if (dest.procedural && !S.discoveredSystems.includes(dest.id)) S.discoveredSystems.push(dest.id);
    if (!Array.isArray(S.visitedSystems)) S.visitedSystems = ['sol'];
    const newlySurveyed = dest.procedural && !S.visitedSystems.includes(dest.id);
    if (!S.visitedSystems.includes(dest.id)) S.visitedSystems.push(dest.id);
    orbit.focusSoi = orbit.primary = 'planet'; orbit.planetIdx = dest.station ? dest.station.parentPlanetIdx : (park.planetIdx || 0); orbit.moonIdx = 0;
    S.orbitFrame = 'planet'; S.moonIdx = 0; lagrangeRef = null;
    clearManeuverChain(); resetRotation();
    orbit.rKm = park.rKm; orbit.vKmS = park.vKmS;
    S.mode = 'orbit'; S.mission = null; S.thrustCmdG = 0; S.flip = false; S.timeWarp = 1; S.effectiveWarp = 1; S.hudRel = false; S.hudFlight = false; relHudRegime = false;
    refreshOrbit(); rebuildContacts(); updateGalPosition(); updateFrontierDiscovery(false);
    S.velocityGal = null; S.cruiseAppliedG = 0;
    S.eta = Math.atanh(clamp(len(starState().vKmS) / O.C_KMS, 0, 0.999999999)); S.beta = Math.tanh(S.eta); S.gamma = Math.cosh(S.eta);
    const hop = S.multiHop;
    if (hop.active) {
      clearMultiHop('complete');
      message('MULTI-HOP ARRIVAL AT ' + dest.name + ' (' + hop.route.hops.length + ' HOPS COMPLETE).');
    }
    S.selectedTargetId = null;
    plotTargetOrbit(dest.station ? 'station' : 'low-orbit');
    if (newlySurveyed) {
      const statusTxt = dest.station
        ? (dest.faction + ' - ' + dest.station.name.toUpperCase())
        : 'UNINHABITED - NO STATION';
      message('SYSTEM SURVEYED // ' + dest.name.toUpperCase() + ' (' + statusTxt + ')');
    }
    if (S.iceIntegrity < 0.995) {
      const site = Galaxy.findNearestIceDeposit
        ? (() => {
            const nr = Galaxy.findNearestIceDeposit(dest, park.worldR, S.simTimeS);
            return nr && nr.deposit ? {
              depositId: nr.deposit.id, name: nr.deposit.name, kind: nr.deposit.kind,
              bodyName: nr.deposit.bodyName, ref: nr.deposit.parentRef, deposit: nr.deposit,
              distKm: nr.distKm, worldR: nr.worldR, harvestLabel: nr.deposit.harvestLabel
            } : null;
          })()
        : Galaxy.findBestIceHarvestSite(dest);
      startIceHarvest('arrival', {
        depositId: site ? (site.depositId || site.deposit?.id || '') : '',
        name: dest.name + ' / ' + (site ? site.name : 'Comet Field'),
        kind: site ? site.kind : 'comet-belt',
        bodyName: site ? site.bodyName : dest.name,
        ref: site ? site.ref : null,
        deposit: site ? site.deposit : null,
        distKm: site && Number.isFinite(site.distKm) ? site.distKm : 0,
        worldR: site ? site.worldR : null,
        harvestLabel: site ? site.harvestLabel : 'Glacial H2O harvest via DropShips'
      });
    }
    S.toast = {seq:++toastSeq,title:'ARRIVAL: '+dest.name,meta:'Epoch '+S.epochYear.toFixed(2),body:'Retro-braking complete. DropShips inspecting ice shield; station guidance ready.'};
    message('Arrived in '+dest.name+'; clock slowed to 1x.');
  }
  function step(seconds, realSeconds = seconds, paced = false, liveVisual = false) {
    if (!(seconds > 0) || !Number.isFinite(seconds)) return;
    if (S.destroyed) {
      S.thrustCmdG = 0; S.burn = null; S.mission = null; S.angVel = [0, 0, 0]; S.rcsTorque = [0, 0, 0];
      return;
    }
    if (!inFrameLoop) { autoRcsCmd = [0, 0, 0]; S.autoRcsTorque = [0, 0, 0]; }
    S.iceHarvestTrafficS = Math.max(0, S.iceHarvestTrafficS - realSeconds);
    if (S.multiHop.harvesting) {
      stepHopHarvest(seconds, realSeconds);
      if (sceneCtrl) sceneCtrl.setIceIntegrity(S.iceIntegrity);
      return;
    }
    if (S.iceHarvest.active && S.iceHarvest.kind !== 'waypoint') {
      stepManualHarvest(seconds);
    }
    if (S.docked && sys().station) {
      S.simTimeS += seconds; S.epochYear += seconds/YEAR; S.shipTauYears += seconds/YEAR;
      const origin = body(orbit.focusSoi), st = body('station', sys().station.parentPlanetIdx);
      orbit.rKm = sub(st.rKm,origin.rKm); orbit.vKmS = sub(st.vKmS,origin.vKmS); refreshOrbit(); updateGalPosition();
    } else if (S.docked) {
      S.docked = false; S.mode = 'orbit';
    } else if (S.mode === 'interstellar') {
      if (paced && S.mission) stepTransitFrame(realSeconds);
      else {
        const m = S.mission, startTau = S.shipTauYears;
        if (m) {
          if (!m.profile && m.stage !== 'capture') {
            solveMissionLeg(m); m.profile = makeTransitProfile(m);
          }
          if (m.stage !== 'capture') basis(m.direction);
        }
        stepCruise(seconds);
        if (m && S.mission === m) {
          m.profileTauS += (S.shipTauYears - startTau) * YEAR;
          seekTransitProfile(m);
        }
      }
    } else if (S.burn?.isBrachistochrone) stepBrachistochrone(seconds, realSeconds, paced);
    else stepOrbitalState(seconds, realSeconds, liveVisual);
    stepProjectiles(seconds);
    syncAutoRelHud();
    if (sceneCtrl) sceneCtrl.setIceIntegrity(S.iceIntegrity);
  }
  function setThrustG(g) {
    if (!Number.isFinite(+g)) return S.thrustCmdG;
    if (S.destroyed) { S.thrustCmdG = 0; message('Hull destroyed. Recommission at station.', 'critical'); return 0; }
    if (S.docked && +g) { message('Undock before igniting the torch.', 'elevated'); return 0; }
    const cap = Math.min(rocket.maxAccelG * damageThrustScale(), S.thermalGovernor ? sustainableG() * 0.95 : rocket.maxAccelG);
    const overriding = S.burn || S.mission;
    if (S.multiHop.active) clearMultiHop('aborted');
    S.emergencyBraking = false;
    if (S.warning?.source === 'impact') S.warning = null;
    S.burn = null; S.mission = null; S.thrustCmdG = clamp(+g, -cap, cap);
    if (S.thrustCmdG && !S.clockExplicit && S.timeWarp !== 'interstellar' && S.timeWarp !== 'hyper') S.autoClock = true;
    if (overriding) {
      message('Manual torch. Autopilot disengaged.', 'elevated');
    }
    // Single bow-ice hulls stay bow-forward and reverse thrust; dual-ice bi-cone/twin-ram hulls flip 180 deg to fire aft bells forward.
    if (isReversible()) S.flip = false;
    else if (S.thrustCmdG !== 0) S.flip = S.thrustCmdG < 0;
    return S.thrustCmdG;
  }
  // Screens that do not launch: leaving the menu for these keeps the startup draft uncommitted.
  const NON_FLIGHT_SCREENS = ['menu', 'drydock', 'archive', 'manual'];
  const isDesignScreen = name => name === 'menu' || name === 'drydock';
  const activeHullGenome = () => isDesignScreen(S.screen) ? S.genome : S.commissionedGenome;
  function commitMenuDraft() {
    if (JSON.stringify(S.genome) === JSON.stringify(S.commissionedGenome)) return true;
    // A fresh voyage commissions the startup customizer's hull for free; docked refits auto-commission if affordable.
    if (!S.started) { S.commissionedGenome = G.normalize(S.genome); updateRocket(); rebuildShip(); return true; }
    if (S.docked) {
      if (commissionDraft()) return true;
      message('Insufficient credits for refit; flying commissioned hull.', 'elevated');
      rebuildShip();
      return false;
    }
    message('Draft saved in Drydock. Dock at a station to commission refit.', 'elevated');
    rebuildShip();
    return false;
  }
  function setScreen(name, draftHandled = false) {
    const next = name === 'orbit' ? 'orbits' : name;
    const prev = S.screen;
    Object.keys(keys).forEach(k => delete keys[k]);
    S.mouseSteer = [0, 0]; S.mouseSteerVisual = null;
    if (!draftHandled && isDesignScreen(prev) && !NON_FLIGHT_SCREENS.includes(next)) commitMenuDraft();
    if (next === 'archive') refreshArchive();
    S.screen = next;
    if (isDesignScreen(prev) !== isDesignScreen(next)) rebuildShip();
    UI.setScreen(S.screen); return S.screen;
  }
  function makeCorridorContact(i, spawnFar = false) {
    const slot = i % 3;
    const seqOffset = spawnFar ? (++corridorRecycleSeq) * 41 : 0;
    const genome = G.randomGenome(1701 + slot + sys().T + seqOffset);
    const travelDir = unit([1, 0.2 + slot * 0.25, 0.1 - slot * 0.2]);
    const sideDir = unit([0.12 * (slot - 1), -0.35 + slot * 0.32, 0.88 - slot * 0.22]);
    const w = [0.62, 0.91, -0.21][slot];
    const velDir = mul(travelDir, w < 0 ? -1 : 1);
    const speed = Math.abs(w) * O.C_KMS;
    const initAlong = spawnFar
      ? (w < 0 ? 9.5e7 : -7.5e7)
      : (3.0e7 + slot * 2.2e7) * (w < 0 ? 1 : -0.75);
    const relKm = add(mul(travelDir, initAlong), mul(sideDir, 1.8e7 + slot * 1.1e7));
    const rangeKm = len(relKm);
    return {
      id: 'LH-' + (slot + 1), name: genome.name, kind: 'vessel', genome, T: 800 + slot * 240,
      w, relKm, velKmS: mul(velDir, speed),
      restVec: unit(relKm), obsVec: unit(relKm), obsVelDir: toShipDir(velDir),
      rangeKm, range3d: 320 + 520 * (1 - Math.exp(-rangeKm / 1.2e8)),
      rangeLabel: 'Corridor contact', D: 1, gRel: 1
    };
  }
  function rebuildContacts() {
    lastObsSimTimeS = S.simTimeS;
    contacts = [0, 1, 2].map(i => makeCorridorContact(i, false));
  }
  function updateObservations(realDt = 0) {
    const betaObs = clamp(Number(S.beta) || 0, 0, 0.99995);
    const gammaObs = Number.isFinite(S.gamma) && S.gamma >= 1 ? Math.min(S.gamma, 1e4) : 1 / Math.sqrt(1 - betaObs * betaObs);
    const velDirObs = S.mode === 'interstellar'
      ? unit(S.velocityGal || S.headingGal)
      : (len(starState().vKmS) > 1e-6 ? unit(starState().vKmS) : unit(S.headingGal));
    const betaObsVec = mul(velDirObs, betaObs);
    const dSim = Math.max(0, Math.min(3600, S.simTimeS - lastObsSimTimeS));
    lastObsSimTimeS = S.simTimeS;
    const dtMove = Number.isFinite(realDt) && realDt > 0 ? Math.min(realDt, 0.1) : 0;
    const dtPhys = (S.screen === 'sextant' || S.mode === 'interstellar')
      ? dtMove
      : Math.min(dSim > 0 ? dSim : dtMove, 10);
    contacts.forEach((c, idx) => {
      if (!validVec(c.relKm) || !validVec(c.velKmS)) Object.assign(c, makeCorridorContact(idx, false));
      if (dtPhys > 0) {
        c.relKm = add(c.relKm, mul(c.velKmS, dtPhys));
      }
      c.rangeKm = len(c.relKm);
      const isLocked = S.lockedTarget && S.lockedTarget.id === c.id;
      if (S.screen !== 'sextant' && !isLocked && c.rangeKm > 4.5e9 && dot(c.relKm, c.velKmS) > 0 && (!validVec(c.obsVec) || c.obsVec[0] < -0.2)) {
        Object.assign(c, makeCorridorContact(idx, true));
      }
      c.restVec = unit(c.relKm);
      const restDirShip = toShipDir(c.restVec);
      const relKin = O.computeRelativisticContact3D(betaObsVec, c.velKmS.map(v => v / O.C_KMS), c.restVec);
      c.obsVec = toShipDir(relKin.obsDirGal);
      c.obsVelDir = toShipDir(relKin.obsVelDirGal);
      c.obsRelVelDir = toShipDir(relKin.betaRelDirGal);
      c.obsRestShipDir = restDirShip;
      c.obsHullDir = toShipDir(unit(c.velKmS));
      c.range3d = 320 + 520 * (1 - Math.exp(-c.rangeKm / 1.2e8));
      c.beta = len(c.velKmS) / O.C_KMS;
      c.betaRel = relKin.betaRelMag;
      c.gRel = relKin.gammaRel;
      c.D = relKin.D;
      c.lambdaObs = 656.28 / c.D;
    });
    const lock = S.lockedTarget;
    if (lock && lock.kind === 'star') {
      const d = system(lock.sysId);
      if (!d && !lock.restDirGal) {
        // Procedural sky stars have no catalog position. Scene locks carry an
        // aberrated direction in the ship frame: invert it once, then retain
        // its inertial galactic bearing as the vessel turns or accelerates.
        const dir = lock.dir;
        const observed = unit(Array.isArray(dir) ? dir : dir ? [dir.x,dir.y,dir.z] : [1,0,0]);
        const denominator = Math.max(1e-15, 1-betaObs*observed[0]);
        const rest = [(observed[0]-betaObs)/denominator,
          observed[1]/(gammaObs*denominator), observed[2]/(gammaObs*denominator)];
        lock.restDirGal = unit(add(mul(S.basis.f,rest[0]),add(mul(S.basis.y,rest[1]),mul(S.basis.z,rest[2]))));
      }
      const n = d ? unit(sub(d.xyz,S.posGal)) : lock.restDirGal;
      lock.D = Math.max(1e-4,gammaObs*(1+betaObs*dot(n,S.velocityGal || S.headingGal)));
      lock.lambdaObs = 656.28/lock.D; lock.betaRel = -betaObs;
    }
    if(lock && !Number.isFinite(lock.lambdaObs)) {
      lock.D=lock.D||1;lock.lambdaObs=656.28/lock.D;lock.betaRel=lock.betaRel||0;
    }
  }
  function lockStar(id) {
    const target = system(id); if (!target) return false;
    S.lockedTarget = {id:target.id,sysId:target.id,name:target.name,kind:'star',T:target.T,D:1};
    updateObservations(); return true;
  }
  function hailContact(id) {
    const c = contacts.find(c => c.id === id); if (!c) return false;
    S.lockedTarget = c;
    const h = Galaxy.generateCaptainEncounter(c.name,'Ultronaut',S.currentSystemId,1701+contacts.indexOf(c));
    S.hail = {ship:c.name,carrier:h.carrier,captain:h.captain,quote:h.openingLine,rumor:h.rumorText,rumorDestId:h.rumorDestId};
    setScreen('sextant'); return true;
  }
  function onLabelAction(action) {
    if (action.startsWith('dest:')) { setCourseTo(action.slice(5)); lockStar(action.slice(5)); }
    else if (action.startsWith('contact:')) hailContact(action.slice(8));
    else if (action === 'target:star') setFocusSoi('star');
    else if (action === 'target:station') plotTargetOrbit('station');
    else if (action.startsWith('target:moon:')) {
      const moon = sys().planets[orbit.planetIdx].moons[+action.split(':')[2]]; if(moon) plotTargetOrbit(moon.id);
    } else if(action === 'target:planet') { setFocusSoi('planet'); plotTargetOrbit('low-orbit'); }
  }
  function rebuildShip() { if (sceneCtrl) sceneCtrl.rebuildPlayerShip(activeHullGenome(),S.hideIce); }
  function draft(genome) {
    S.genome = G.normalize(genome);
    const matchedPreset = G.PRESETS.find(p => JSON.stringify(G.normalize(p).P) === JSON.stringify(S.genome.P));
    S.presetId = matchedPreset ? matchedPreset.id : null;
    draftSpecs = G.computeRocketSpecs(S.genome);
    draftShareCode = G.encodeShareCode(S.genome);
    if (isDesignScreen(S.screen)) {
      rebuildShip();
      if (S.screen === 'menu' && sceneCtrl?.pauseMenuOrbit) sceneCtrl.pauseMenuOrbit(6);
    }
    return S.genome;
  }
  function refitCost() { return G.computeRefitCost(S.commissionedGenome,S.genome); }
  function commissionDraft() {
    const cost = refitCost();
    const budget = G.computeWeaponBudget ? G.computeWeaponBudget(S.genome) : { withinBudget: true };
    if (!S.docked || cost > S.credits || !budget.withinBudget) return false;
    S.credits -= cost; S.commissionedGenome = G.normalize(S.genome); updateRocket(); rebuildShip(); saveVoyage(true); return true;
  }
  // ---- Archive (vessel blueprints + voyage snapshots) via window.LighthuggerATProto.
  const AP = () => root.LighthuggerATProto || null;
  let archive = { available: false, rev: 0, vessels: [], missions: [] };
  function styleMix(genome) {
    const P = (genome && genome.P) || {};
    const pct = k => Math.round(100 * clamp(Number(P[k]) || 0, 0, 1));
    return { gnostic: pct('styleGnostic'), gothic: pct('styleGothic'), sleek: pct('styleSleek'), giger: pct('styleGiger'), coade: pct('styleCoade'), dune: pct('styleDune'), cathedral: pct('styleCathedral') };
  }
  function refreshArchive() {
    const ap = AP(); let vessels = [], missions = [];
    if (ap) {
      try { vessels = ap.listVessels() || []; } catch (e) { vessels = []; }
      try { missions = ap.listMissions() || []; } catch (e) { missions = []; }
    }
    // Lightweight summaries are cached here so UI.sync never parses storage per frame.
    archive = { available: !!ap, rev: archive.rev + 1,
      vessels: vessels.map(v => ({ id: v.id, name: v.name, notes: v.notes || '', tags: v.tags || [], origin: v.origin,
        shareCode: v.shareCode || '', createdAt: v.createdAt, updatedAt: v.updatedAt, sync: v.sync || null,
        styleMix: styleMix(v.genome), hullStyle: v.genome && v.genome.P ? v.genome.P.hullStyle : null })),
      missions: missions.map(m => { const st = m.state || {};
        return { id: m.id, name: m.name, notes: m.notes || '', createdAt: m.createdAt, updatedAt: m.updatedAt, sync: m.sync || null,
          currentSystemId: st.currentSystemId, systemName: st.systemName || (system(st.currentSystemId) || {}).name,
          epochYear: st.epochYear, shipTauYears: st.shipTauYears, docked: !!st.docked, mode: st.mode,
          iceIntegrity: st.iceIntegrity, coreHeat: st.coreHeat, vesselName: st.genome && st.genome.name,
          styleMix: styleMix(st.genome), restorable: validVoyage(st) }; }) };
    return archive;
  }
  function archiveResult(ok, msg, extra) {
    refreshArchive(); if (msg) message(msg, ok ? 'nominal' : 'elevated');
    return Object.assign({ ok: !!ok, msg: msg || '' }, extra || {});
  }
  const noArchive = () => ({ ok: false, msg: 'Archive module unavailable.' });
  function findArchived(kind, id) {
    const ap = AP(); if (!ap) return null;
    try { return (kind === 'mission' ? ap.listMissions() : ap.listVessels()).find(x => x.id === id) || null; } catch (e) { return null; }
  }
  function saveShipToArchive(name, notes, tags) {
    const ap = AP(); if (!ap) return noArchive();
    const genome = G.normalize(S.genome);
    if (name && String(name).trim()) genome.name = String(name).trim().slice(0, 64);
    const t = Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(',').map(x => x.trim()).filter(Boolean) : [];
    try {
      const entry = ap.saveVessel({ name: genome.name, genome, notes: notes || '', tags: t, origin: S.screen === 'menu' ? 'startup' : 'drydock' });
      return archiveResult(true, 'Blueprint archived: ' + entry.name + '.', { id: entry.id, entry });
    } catch (e) { return archiveResult(false, 'Archive save failed: ' + (e.message || e)); }
  }
  function loadArchiveVessel(id, commissionNow) {
    const v = findArchived('vessel', id); if (!v) return AP() ? archiveResult(false, 'Vessel not found.') : noArchive();
    let genome = v.genome;
    if (!genome && v.shareCode) { try { genome = G.decodeShareCode(v.shareCode); } catch (e) { genome = null; } }
    if (!genome) return archiveResult(false, 'Archived vessel has no readable genome.');
    draft(genome);
    if (!commissionNow) return archiveResult(true, v.name + ' loaded into draft.', { id, commissioned: false });
    if (!S.started && S.docked) { S.commissionedGenome = G.normalize(S.genome); updateRocket(); return archiveResult(true, v.name + ' commissioned.', { id, commissioned: true }); }
    const ok = commissionDraft();
    return archiveResult(true, ok ? v.name + ' commissioned.' : v.name + ' loaded into draft; dock with enough credits to commission.', { id, commissioned: ok });
  }
  function cloneArchiveVessel(id) {
    const ap = AP(); if (!ap) return noArchive();
    const c = ap.cloneVessel(id);
    return c ? archiveResult(true, 'Cloned: ' + c.name + '.', { id: c.id, entry: c }) : archiveResult(false, 'Vessel not found.');
  }
  function deleteArchiveVessel(id) {
    const ap = AP(); if (!ap) return noArchive();
    return ap.deleteVessel(id) ? archiveResult(true, 'Blueprint deleted.') : archiveResult(false, 'Vessel not found.');
  }
  function saveMissionSnapshot(name, notes) {
    const ap = AP(); if (!ap) return noArchive();
    const state = captureVoyage();
    const title = name && String(name).trim() ? String(name).trim().slice(0, 80) :
      state.genome.name + ' // ' + state.systemName + ' // EPOCH ' + state.epochYear.toFixed(2);
    state.title = title;
    try {
      const entry = ap.saveMission({ name: title, notes: notes || '', state });
      return archiveResult(true, 'Voyage snapshot saved: ' + title + '.', { id: entry.id, entry });
    } catch (e) { return archiveResult(false, 'Snapshot save failed: ' + (e.message || e)); }
  }
  function loadMissionSnapshot(id, opts) {
    const m = findArchived('mission', id); if (!m) return AP() ? archiveResult(false, 'Snapshot not found.') : noArchive();
    if (!restoreVoyage(m.state, typeof opts === 'object' && opts ? opts : {})) return archiveResult(false, 'Snapshot is incomplete and cannot be restored.');
    return archiveResult(true, 'Voyage restored: ' + m.name + '.', { id });
  }
  function deleteMissionSnapshot(id) {
    const ap = AP(); if (!ap) return noArchive();
    return ap.deleteMission(id) ? archiveResult(true, 'Snapshot deleted.') : archiveResult(false, 'Snapshot not found.');
  }
  function exportArchive() {
    const ap = AP(); if (!ap) return null;
    try { return ap.exportArchiveBundle(); } catch (e) { return null; }
  }
  function importArchive(text) {
    const ap = AP(), raw = String(text == null ? '' : text).trim();
    if (!raw) return { ok: false, msg: 'Nothing to import.' };
    if (!ap) return /^LH\d-/.test(raw) ? actions.importShareCode(raw) : noArchive();
    let r;
    try { r = ap.importArchiveBundle(raw, G) || {}; } catch (e) { r = { ok: false, msg: e.message || String(e) }; }
    return archiveResult(r.ok, r.msg || (r.ok ? 'Archive imported.' : 'Import failed.'),
      { importedVessels: r.importedVessels || 0, importedMissions: r.importedMissions || 0 });
  }
  function inspectArchiveRecord(kind, id) {
    const ap = AP(), item = findArchived(kind, id); if (!ap || !item) return null;
    try {
      const record = kind === 'mission' ? ap.buildMissionRecord(item, G) : ap.buildVesselRecord(item, G);
      const env = ap.getEnvironmentStatus ? ap.getEnvironmentStatus() : {};
      return ap.buildCreateRecordEnvelope({ repoDid: (env && env.did) || 'did:plc:unlinked', collection: record.$type, record, rkey: id });
    } catch (e) { return null; }
  }
  function stageArchiveForSync(kind, id) {
    const ap = AP(); if (!ap || !ap.stageForSync) return noArchive();
    try { const r = ap.stageForSync(kind, id); return archiveResult(!(r && r.ok === false), (r && r.msg) || 'Staged for PDS sync.'); }
    catch (e) { return archiveResult(false, 'Staging failed: ' + (e.message || e)); }
  }
  const actions = {
    setScreen, undock, launchAndUndock, dock, setThrustG, setFocusSoi, setCourseTo, engageInterstellar, continueSavedVoyage,
    setMaxHopLy, getMultiHopPreview, launchMultiHopRoute, abortMultiHopRoute, harvestIceWithDropships, emergencyBrakeToSafeBeta,
    toggleRelGovernor: () => (S.relGov = !S.relGov),
    toggleFineSteer: () => (S.fineSteer = !S.fineSteer),
    setAberrationZoom, cycleAberrationZoom: () => setAberrationZoom(S.aberrationZoom === 1 ? 5 : S.aberrationZoom === 5 ? 20 : 1),
    toggleHudRestFrame: () => (S.hudRestFrame = !S.hudRestFrame),
    selectTargetOrbit: plotTargetOrbit, plotTargetOrbit, plotOrbitCapture, circularizeOrbit, selectCustomOrbit, executeOrbitBurn: executeOrbitManeuver,
    plotBrachistochroneOrbit, setBrachAccelG, executeBrachistochroneOrbit,
    executeOrbitManeuver, cancelOrbitBurn: () => {S.burn=null;S.thrustCmdG=0;S.flip=false;S.timeWarp=1;},
    setManeuverChain, clearManeuverChain, executeManeuverChain, plotLagrangeOrbit,
    abortInterstellar: () => {
      if (S.multiHop.active) return abortMultiHopRoute();
      if (S.mode !== 'interstellar' && !S.mission) return;
      S.mission = null;
      if (S.eta > 0) {
        const rev = isReversible();
        setThrustG(-Math.min(1, sustainableG()));
        message(rev ? 'Emergency reverse torch engaged (bow shield held forward).' : 'Emergency flip-and-burn braking engaged.', 'elevated');
      } else {
        S.thrustCmdG = 0; S.flip = false;
        message('Interstellar transit aborted.');
      }
    },
    setTimeWarp: w => {
      if (S.docked && w !== 1 && w !== 'auto') { message('Undock to engage chrono time shifts.', 'elevated'); return; }
      S.autoClock = w === 'auto';
      S.timeWarp = (w === 'interstellar' || w === 'hyper') ? w : clamp(+w || 1, 1, YEAR * 2.5);
      S.clockExplicit = !S.autoClock;
      if (S.clockExplicit && Number.isFinite(S.timeWarp)) S.effectiveWarp = S.timeWarp;
    },
    setTimeWarpExact: w => {
      if (S.docked) { message('Undock to trim chrono rate.', 'elevated'); return S.timeWarp; }
      S.autoClock = false;
      S.clockExplicit = true;
      S.timeWarp = clamp(Number(w) || 1, 1, YEAR * 2.5);
      S.effectiveWarp = S.timeWarp;
      return S.timeWarp;
    },
    setAutoWarp: v => {S.autoWarp=!!v;S.autoClock=!!v;S.clockExplicit=!v;},
    setAttitudeMode: m => {S.attitudeMode=String(m).toUpperCase().replace('ANTINORMAL','ANTI-NORMAL');},
    toggleFlip: () => {
      if (isReversible()) {
        S.flip = false;
        if (S.docked) {
          message('Bow-ice vessel uses reverse thrust (-g), not 180 deg flip. Undock to engage.', 'elevated');
          return;
        }
        const nextG = S.thrustCmdG < -0.02 ? 0 : -Math.min(1, sustainableG());
        setThrustG(nextG);
        message(nextG < 0 ? 'Reversible braking (-g): forward nozzles active, bow ice held into ISM.' : 'Reverse braking cut.');
        return;
      }
      if (S.docked) {
        S.flip = false;
        message('Undock before engaging 180 deg flip-and-burn.', 'elevated');
        return;
      }
      if (S.flip && S.thrustCmdG < -0.02) {
        S.flip = false;
        setThrustG(0);
        message('Flip-and-burn cut. Hull realigning bow-forward.');
        return;
      }
      const brakeG = S.thrustCmdG > 0.02 ? -Math.abs(S.thrustCmdG) : -Math.min(1, sustainableG());
      setThrustG(brakeG);
      S.flip = true;
      message('Flip-and-burn (-g): hull flipping 180 deg, aft ice & main bells braking forward.');
    },
    stopAll: () => {
      if (S.multiHop.active) clearMultiHop('aborted');
      clearIceHarvest(); S.iceHarvestTrafficS = 0;
      S.emergencyBraking=false; S.cruiseAppliedG=0;
      if (S.warning?.source === 'impact' || S.warning?.source === 'atmo' || S.warning?.source === 'proximity') S.warning = null;
      S.thrustCmdG=0; S.flip=false; S.burn=null; S.mission=null; S.timeWarp=1; S.autoClock=false; S.effectiveWarp=1;
      S.clockExplicit=false;
      resetRotation();
      Object.keys(keys).forEach(k => delete keys[k]); S.puck = [0, 0]; S.rollInput = 0;
      message('All stop. Torch cold. Clock at 1x.');
    },
    selectStarDest: setCourseTo, plotStarCourse,
    loadScenario: id => {
      clearMultiHop();
      // Scenarios launched from the startup screen fly the customizer's hull.
      S.commissionedGenome=G.normalize(S.genome);updateRocket();rebuildShip();
      S.started=true;
      enterSystemOrbit(id==='sirius-binary'&&system('sirius')?'sirius':'sol',true);
      refuelAndReglaze(true);
      if(id==='sol-spindle'||id==='docked'||id==='dock')return;
      undock();
      if(id==='saturn-low') {
        Object.assign(orbit,O.elementsToState({a:sys().planets[orbit.planetIdx].radiusKm*1.24,e:0,iRad:0.14,nuRad:2.08},orbit.muKm3S2));
        refreshOrbit();updateGalPosition();alignBasis(orbit.vKmS, orbit.el.normalHat);
      }
      if(id==='alpha-run')engageInterstellar({destId:system('rigil')?'rigil':'proxima'});
    },
    resetVoyage: () => {
      clearMultiHop();
      Object.keys(combatBySys).forEach(k => delete combatBySys[k]);
      S.hullIntegrity = 1; S.damageState = 'nominal'; S.destroyed = false; S.destroyedReason = '';
      S.combatClockS = 0; S.combatAlertS = 0; S.kills = 0; S.playerHitSeq = 0; S.playerHitAt = 0;
      S.enemyWeaponEvent = null; S.explosionEvent = null; S.pdcEvent = null; S.projectiles = []; S.weaponLockOn = false; S.weaponTargetIdx = 0;
      S.discoveredSystems=[];S.visitedSystems=['sol'];S.started=true;S.vectors=false;S.vectorsUserHidden=false;S.simTimeS=0;S.shipTauYears=0;S.epochYear=2370;S.credits=250000;
      enterSystemOrbit('sol',true);refuelAndReglaze(true);saveVoyage(true);
    },
    setPuckInput: (x, y, on) => {
      S.puck = [x, y];
      if (S.screen === 'helm' && !S.docked && !S.camLock && S.puckMode === 'steer' && (on || Math.hypot(x, y) > 0.02)) {
        S.camSnapActive = true;
        if (sceneCtrl) {
          const preset = CAM_VIEW_PRESETS[S.camViewMode] || CAM_VIEW_PRESETS.low;
          sceneCtrl.cam.zoomTarget = preset.zoom;
        }
      }
    },
    setPuckMode: m => {
      if (m === 'steer' || m === 'cam' || m === 'vec') S.puckMode = m;
      if (S.puckMode === 'cam') { S.mouseSteer = [0, 0]; S.mouseSteerVisual = null; }
      return S.puckMode;
    },
    zoomBy: f => {
      if (!sceneCtrl) return;
      if (S.screen === 'sextant') {
        sceneCtrl.cam.sxZoom = clamp(sceneCtrl.cam.sxZoom * f, 0.004, 2.5);
        return;
      }
      if (sceneCtrl.commitMenuSway) sceneCtrl.commitMenuSway();
      const cam = sceneCtrl.cam;
      cam.zoomTarget = clamp((cam.zoomTarget || cam.orbitZoom)*f, .16, 4.5);
    },
    resetCamera: () => {
      if(!sceneCtrl) return;
      sceneCtrl.resetCamera();
      const preset = CAM_VIEW_PRESETS[S.camViewMode] || CAM_VIEW_PRESETS.low;
      if (S.screen === 'helm' && !S.docked) {
        sceneCtrl.cam.orbitYaw = preset.yaw;
        sceneCtrl.cam.orbitPitch = preset.pitch;
        sceneCtrl.cam.orbitZoom = preset.zoom;
        sceneCtrl.cam.zoomTarget = null;
      }
      S.camSnapActive = false;
    },
    toggleVectors: () => {
      S.vectors = !S.vectors;
      S.vectorsUserHidden = !S.vectors;
      message(S.vectors ? '3D orbital overlay ON (trajectories & burn nodes).' : '3D orbital overlay OFF.');
    },
    toggleHudFlight: () => {S.hudFlight=!S.hudFlight; if (S.hudFlight) S.hudRel=false;},
    toggleHudRel: () => {S.hudRel=!S.hudRel; if (S.hudRel) S.hudFlight=false;},
    toggleHudWeapons: () => {
      S.hudWeapons=!S.hudWeapons;
      if (S.hudWeapons) message('Tactical Weapons HUD active. Free-fire boresight [Space], [Tab] cycle/lock target.');
    },
    toggleCamLock: () => {
      S.camLock = !S.camLock;
      S.camSnapActive = false;
      message(S.camLock ? 'CAM LOCK ON: camera holds custom orbit angle even when steering.' : 'CAM LOCK OFF: mouse looks freely; touching Pilot Puck snaps camera back to ' + S.camViewMode.toUpperCase() + '.');
    },
    setCamViewMode: mode => {
      if (!CAM_VIEW_PRESETS[mode]) return S.camViewMode;
      const prev = S.camViewMode;
      if (prev === mode) {
        S.camSnapActive = true;
        if (sceneCtrl) sceneCtrl.cam.zoomTarget = CAM_VIEW_PRESETS[mode].zoom;
        return S.camViewMode;
      }
      if (prev !== 'first' && mode === 'first') {
        S.hideShipPreFirst = !!S.hideShip;
        S.hideShip = true;
      } else if (prev === 'first' && mode !== 'first') {
        S.hideShip = !!S.hideShipPreFirst;
      }
      S.camViewMode = mode;
      S.camSnapActive = true;
      const p = CAM_VIEW_PRESETS[mode];
      if (sceneCtrl) {
        sceneCtrl.cam.zoomTarget = p.zoom;
      }
      message(mode === 'first' ? 'Viewpoint: 1ST PERSON (hull hidden).' : mode === 'high' ? 'Viewpoint: 3RD PERSON HIGH.' : 'Viewpoint: 3RD PERSON LOW.');
      return S.camViewMode;
    },
    cycleCamViewMode: () => {
      const order = ['low', 'high', 'first'];
      const next = order[(order.indexOf(S.camViewMode) + 1) % order.length];
      return actions.setCamViewMode(next);
    },
    toggleHideShip: () => {
      S.hideShip=!S.hideShip;
      if (S.camViewMode === 'first') S.hideShipPreFirst = S.hideShip;
      message(S.hideShip ? 'Lighthugger hull hidden (cockpit glass view).' : 'Lighthugger hull visible.');
    },
    setRollInput: v => { S.rollInput = clamp(+v || 0, -1, 1); },
    toggleWeaponLock: () => {
      const list = buildWeaponTargets();
      if (S.weaponLockOn) {
        S.weaponLockOn = false;
        message('WPN LOCK CLEARED -- BORESIGHT FREE-FIRE');
        return null;
      }
      const alive = list.filter(t => !t.destroyed);
      if (!alive.length && !list.length) {
        message('NO TARGET IN ENVELOPE -- BORESIGHT FREE-FIRE', 'elevated');
        return null;
      }
      // Lock the non-destroyed target closest to the forward bow axis
      let bestIdx = 0, bestDot = -2;
      for (let i = 0; i < list.length; i++) {
        if (list[i].destroyed && alive.length) continue;
        const d = list[i].dir ? list[i].dir[0] : -1;
        if (d > bestDot) { bestDot = d; bestIdx = i; }
      }
      S.weaponTargetIdx = bestIdx;
      S.weaponLockOn = true;
      const t = list[bestIdx];
      message('WPN LOCK: ' + String(t.name || t.id).toUpperCase());
      return t;
    },
    clearWeaponTarget: () => {
      S.weaponLockOn = false;
      message('WPN LOCK CLEARED -- BORESIGHT FREE-FIRE');
      return null;
    },
    cycleWeaponTarget: () => {
      const list = buildWeaponTargets();
      if (!list.length) { S.weaponLockOn = false; return null; }
      const aliveIdx = [];
      for (let i = 0; i < list.length; i++) if (!list[i].destroyed) aliveIdx.push(i);
      if (!aliveIdx.length) { S.weaponLockOn = false; return null; }
      if (!S.weaponLockOn) {
        S.weaponLockOn = true;
        S.weaponTargetIdx = aliveIdx[0];
      } else {
        const nextIdx = aliveIdx.find(i => i > S.weaponTargetIdx);
        S.weaponTargetIdx = nextIdx != null ? nextIdx : aliveIdx[0];
      }
      const t = list[S.weaponTargetIdx];
      message('WPN LOCK: ' + String(t.name || t.id).toUpperCase());
      return t;
    },
    fireWeaponPulse: () => {
      if (S.destroyed) { message('Weapons offline -- hull destroyed.', 'critical'); return false; }
      if (S.docked) { message('Weapons safed while berthed at station.', 'elevated'); return false; }
      S.weaponFireAt = performance.now();
      const list = buildWeaponTargets();
      let tgt = S.weaponLockOn && list.length ? list[S.weaponTargetIdx % list.length] : null;
      if (tgt && tgt.destroyed) tgt = null;
      const mode = weaponMode(), relativistic = mode === 'relativistic';
      S.coreHeat = clamp(S.coreHeat + (relativistic ? 0.07 : 0.03), 0, 1);

      let hitTgt = null;
      if (tgt && tgt.destructible) {
        hitTgt = tgt;
      } else if (!S.weaponLockOn) {
        // Free-fire boresight: only score hit inside tight ~2.3 deg half-angle precision crosshair cone (dot > 0.9992) within 80 km
        let bestDot = 0.9992;
        for (let i = 0; i < list.length; i++) {
          const cand = list[i];
          if (!cand.destructible || cand.destroyed || !cand.dir) continue;
          if (cand.kind !== 'vessel' && !(cand.dKm <= 80)) continue;
          const dFwd = cand.dir[0];
          if (dFwd > bestDot) { bestDot = dFwd; hitTgt = cand; }
        }
      }

      const targetName = tgt ? String(tgt.name || tgt.id).toUpperCase() : 'BORESIGHT';
      const wBudget = G.computeWeaponBudget ? G.computeWeaponBudget(activeHullGenome(), rocket) : { counts: { rail: 4, fel: 2, lance: 2, missile: 2, pdc: 2 } };
      const wCounts = wBudget.counts || {};
      if ((wCounts.rail || 0) > 0 && O.stepOrbitalProjectile) {
        const aimShip = tgt?.dir ? unit(tgt.dir) : [1, 0, 0];
        const aimGal = shipDirToGal(aimShip);
        const muzKmS = relativistic ? 65 : 22;
        spawnOrbitalProjectile({
          kind: relativistic ? 'rkv' : 'rail',
          owner: 'player',
          dirGal: aimGal,
          speedKmS: muzKmS,
          hitRadiusKm: 6,
          targetId: tgt ? tgt.id : null,
          targetKey: tgt ? (tgt.key || tgt.id) : null,
          dmgHull: relativistic ? 95 : 55,
          dmgIce: 15,
          maxAgeS: 180
        });
      }
      const ev = {
        seq: ++weaponSeq,
        at: S.weaponFireAt,
        mode,
        kind: relativistic ? 'lance' : 'rail',
        weaponLabel: relativistic ? 'GAMMA LANCE + RKV' : 'COILGUN + UV FEL',
        targetDir: tgt?.dir ? tgt.dir.slice() : [1, 0, 0],
        targetName,
        locked: !!tgt,
        gammaBoost: S.gamma,
        hit: false,
        targetId: null,
        targetKey: null,
        damage: 0,
        targetKilled: false
      };

      const inRange = hitTgt && (hitTgt.kind === 'vessel' || !Number.isFinite(hitTgt.dKm) || hitTgt.dKm <= 25000);
      if (hitTgt && inRange) {
        const ent = ensureCombatEntity(hitTgt.id, hitTgt.key || hitTgt.id, hitTgt.name, hitTgt.kind);
        if (ent && ent.state !== 'destroyed') {
          const baseDmg = relativistic
            ? 175 * clamp(1 + Math.log1p(Math.max(0, S.gamma - 1)) * 0.55, 1, 2.8)
            : 115;
          let hullDmg = baseDmg;
          if (ent.shield > 0) {
            const absorbed = Math.min(ent.shield, baseDmg * 0.65);
            ent.shield = Math.max(0, ent.shield - absorbed);
            hullDmg = baseDmg - absorbed * 0.72;
          }
          ent.hull = Math.max(0, ent.hull - hullDmg);
          ent.lastHitAt = S.combatClockS;
          ent.state = computeDamageState(ent.hull / ent.maxHull);
          S.combatAlertS = Math.max(S.combatAlertS, 22);
          ev.hit = true;
          ev.targetId = ent.id;
          ev.targetKey = ent.key;
          ev.damage = Math.round(baseDmg);

          if (ent.hull <= 0) {
            ent.state = 'destroyed';
            ent.destroyed = true;
            ent.hostile = false;
            ent.destroyedAt = S.combatClockS;
            S.kills = (S.kills || 0) + 1;
            ev.targetKilled = true;
            recordExplosion(ent.id, ent.key, ent.name, ent.kind === 'station' ? 2.6 : 1.6, false);
            if (S.weaponTargetIdx >= 0 && list[S.weaponTargetIdx]?.id === ent.id) {
              S.weaponLockOn = false;
            }
            message('TARGET DESTROYED // ' + ent.name.toUpperCase() + ' VAPORIZED', 'nominal');
          } else {
            ent.hostile = true;
            ent.fireCooldownS = Math.min(ent.fireCooldownS, 0.85);
            provokeAllies(ent);
          }
        }
      }

      S.weaponEvent = ev;
      if (!ev.targetKilled) {
        const fireLog = relativistic ? 'GAMMA LANCE FIRED (gamma ' + S.gamma.toFixed(1) + 'x)' : 'COILGUN SALVO + UV FEL FIRED';
        const hitTxt = ev.hit ? (' [HIT -' + ev.damage + ']') : '';
        message(fireLog + ' -> ' + targetName + hitTxt);
      }
      return true;
    },
    launchMissileSalvo: () => {
      if (S.destroyed) { message('Missiles offline -- hull destroyed.', 'critical'); return false; }
      if (S.docked) { message('Missile bays safed while berthed at station.', 'elevated'); return false; }
      const budget = G.computeWeaponBudget ? G.computeWeaponBudget(activeHullGenome(), rocket) : { counts: { missile: 2 } };
      const tubeCount = Math.max(0, Math.round((budget.counts && budget.counts.missile) || 0));
      if (tubeCount <= 0) {
        message('No orbital missile pods mounted. Add pods in Weapons bay.', 'elevated');
        return false;
      }
      const list = buildWeaponTargets();
      let tgt = S.weaponLockOn && list.length ? list[S.weaponTargetIdx % list.length] : null;
      if (tgt && tgt.destroyed) tgt = null;
      if (!tgt) {
        tgt = list.find(t => t.destructible && !t.destroyed && (t.hostile || t.kind === 'vessel' || t.kind === 'npc' || t.key === 'npc' || t.key === 'npc2')) || list.find(t => t.destructible && !t.destroyed) || null;
      }
      const nowPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
      S.weaponFireAt = nowPerf;
      lastMissileAt = nowPerf;
      const salvo = Math.min(4, Math.max(1, tubeCount));
      const baseShipDir = tgt?.dir ? unit(tgt.dir) : [1, 0, 0];
      const baseGal = shipDirToGal(baseShipDir);
      const launchSpdKmS = S.mode === 'interstellar' ? 35 : 8.5;
      for (let i = 0; i < salvo; i++) {
        const spread = (i - (salvo - 1) * 0.5) * 0.08;
        const spreadDir = unit(add(mul(baseShipDir, 1), [0, spread, (i % 2 === 0 ? 1 : -1) * Math.abs(spread) * 0.5]));
        spawnOrbitalProjectile({
          kind: 'missile',
          owner: 'player',
          dirGal: shipDirToGal(spreadDir) || baseGal,
          speedKmS: launchSpdKmS,
          hitRadiusKm: 10,
          aMaxKmS2: 0.65,
          fuelS: 75,
          navGain: 4.4,
          targetId: tgt ? tgt.id : null,
          targetKey: tgt ? (tgt.key || tgt.id) : null,
          dmgHull: 120,
          dmgIce: 40,
          maxAgeS: 240
        });
      }
      S.coreHeat = clamp(S.coreHeat + 0.025 * salvo, 0, 1);
      const mode = weaponMode();
      S.weaponEvent = {
        seq: ++weaponSeq,
        at: nowPerf,
        kind: 'missile',
        mode,
        weaponLabel: 'AI ORBITAL MISSILE SALVO (' + salvo + ')',
        targetDir: baseShipDir.slice(),
        targetName: tgt ? String(tgt.name || tgt.id).toUpperCase() : 'BALLISTIC',
        locked: !!tgt,
        gammaBoost: S.gamma,
        hit: false,
        targetId: tgt ? tgt.id : null,
        targetKey: tgt ? (tgt.key || tgt.id) : null,
        damage: 0,
        targetKilled: false
      };
      message('LAUNCHED ' + salvo + ' AI ORBITAL MISSILE(S) -> ' + (tgt ? String(tgt.name || tgt.id).toUpperCase() : 'FREE TRAJECTORY'));
      return true;
    },
    setOscMode: m => {if(['spec','lamp','vec'].includes(m))S.oscMode=m;},
    zoomOsc: f => {const c=(S.specWindow[0]+S.specWindow[1])/2,w=clamp((S.specWindow[1]-S.specWindow[0])*f,4,2100);S.specWindow=[clamp(c-w/2,100,2200-w),clamp(c-w/2,100,2200-w)+w];},
    setHoverNm: x => {S.hoverNm=x;}, resetSpecWindow: () => {S.specWindow=[380,760];},
    toggleSextant: on => {if(on)S.screen='sextant';}, toggleIrSight: () => {S.irSight=!S.irSight;},
    toggleAutoSolve: () => {S.autoSolve=!S.autoSolve;},
    aimSextantAt: (thetaDeg, azDeg) => {
      S.scopeTheta = clamp(+thetaDeg || 0, 0, 180);
      S.scopeAz = ((+azDeg || 0) % 360 + 360) % 360;
    },
    snapNearestTarget: () => {
      if(sceneCtrl) {
        const theta=S.scopeTheta*PI/180,az=S.scopeAz*PI/180;
        const searchFov=Math.max(sceneCtrl.camera?sceneCtrl.camera.fov:24, 24);
        const lock=sceneCtrl.findSextantLock([Math.cos(theta),Math.sin(theta)*Math.cos(az),Math.sin(theta)*Math.sin(az)],searchFov,contacts,S.irSight);
        if(lock) {
          S.lockedTarget=lock.contact||lock;
          if(lock.sysId)lockStar(lock.sysId);
          if(Number.isFinite(lock.theta)&&Number.isFinite(lock.az)) {
            S.scopeTheta=clamp(lock.theta,0,180); S.scopeAz=((lock.az%360)+360)%360;
          } else if(lock.dir) {
            const d=Array.isArray(lock.dir)?lock.dir:[lock.dir.x,lock.dir.y,lock.dir.z];
            const u=unit(d);
            S.scopeTheta=Math.acos(clamp(u[0],-1,1))*180/PI;
            S.scopeAz=(Math.atan2(u[2],u[1])*180/PI+360)%360;
          }
          return lock;
        }
      }
      const fallbackId = S.courseDestId || Galaxy.SYSTEMS.find(s=>s.id!==S.currentSystemId).id;
      const ok = lockStar(fallbackId);
      const tgt = system(fallbackId);
      if (ok && tgt) {
        const n = unit(sub(tgt.xyz, S.posGal));
        const rx = dot(n, S.basis.f), ry = dot(n, S.basis.y), rz = dot(n, S.basis.z);
        const cosO = S.beta > 1e-5 ? clamp((rx + S.beta) / (1 + S.beta * rx), -1, 1) : clamp(rx, -1, 1);
        const sinR = Math.sqrt(Math.max(0, 1 - rx * rx)), sinO = Math.sqrt(Math.max(0, 1 - cosO * cosO));
        const k = sinR > 1e-6 ? sinO / sinR : 0;
        S.scopeTheta = Math.acos(cosO) * 180 / PI;
        S.scopeAz = (Math.atan2(rz * k, ry * k) * 180 / PI + 360) % 360;
      }
      return ok;
    },
    sampleDoppler: () => {updateObservations();if(S.lockedTarget)message('Doppler sample: '+S.lockedTarget.name+' H-alpha '+S.lockedTarget.lambdaObs.toFixed(2)+' nm.');},
    setDestFromSextant: () => {if(S.lockedTarget&&S.lockedTarget.sysId)setCourseTo(S.lockedTarget.sysId);},
    matchVelocity: () => {if(S.lockedTarget)setThrustG(S.lockedTarget.betaRel>0?1:-1);},
    hailContact, onLabelAction, refuelAndReglaze, commissionDraft,
    revertDraft: () => draft(S.commissionedGenome),
    setGenomeParam: (key,value) => {const next=G.normalize(S.genome);next.P[key]=value;draft(next);},
    setGenomeParams: params => {const next=G.normalize(S.genome);Object.assign(next.P,params||{});draft(next);},
    saveShipToArchive, loadArchiveVessel, cloneArchiveVessel, deleteArchiveVessel,
    saveMissionSnapshot, loadMissionSnapshot, deleteMissionSnapshot, exportArchive, importArchive,
    inspectArchiveRecord, stageArchiveForSync, refreshArchive, listArchive: () => archive,
    selectPreset: id => {const p=G.PRESETS.find(p=>p.id===id||p.presetId===id);if(p)draft(p);},
    randomizeShip: () => draft(G.randomGenome(Date.now()%9999999)),
    toggleCutawayIce: () => {S.hideIce=!S.hideIce;rebuildShip();},
    setDrydockCam: cam => {S.drydockCam=cam;if(sceneCtrl){sceneCtrl.resetCamera();if(cam==='bow')sceneCtrl.cam.orbitYaw=0;if(cam==='stern')sceneCtrl.cam.orbitYaw=PI;if(cam==='side')sceneCtrl.cam.orbitYaw=-PI*0.5;}},
    saveToVault: name => {const g=G.normalize(S.genome);g.name=name;fleet.push(g);G.saveFleet(fleet);},
    loadFromVault: i => {if(fleet[i])draft(fleet[i]);},
    deleteFromVault: i => {fleet.splice(+i,1);G.saveFleet(fleet);},
    exportShareCode: () => G.encodeShareCode(S.genome),
    importShareCode: code => {try {const g=G.decodeShareCode(code);if(!g)return {ok:false,msg:'Invalid share code.'};draft(g);return {ok:true,msg:'Hull loaded into draft.'};}catch(e){return {ok:false,msg:'Invalid share code.'};}},
    manualImpulseDv: (axis,dv) => {
      if(S.docked||S.mode==='interstellar')return false;
      const hat=axis==='normal'?orbit.el.normalHat:axis==='radial'?orbit.el.radialHat:orbit.el.progradeHat;
      return impulse(mul(hat,dv));
    },
    nudgeNodeDv: (axis,v,absolute) => {const k=axis+'KmS';S.node[k]=(absolute?0:S.node[k]||0)+v;},
    getGraphics: () => Object.assign({}, S.graphics),
    setGraphics: patch => {
      if (!patch || typeof patch !== 'object') return Object.assign({}, S.graphics);
      const next = Object.assign({}, S.graphics);
      if (['off', 'fxaa', 'msaa4', 'ssaa2'].includes(patch.aa)) next.aa = patch.aa;
      if (patch.renderScale != null) next.renderScale = clamp(Number(patch.renderScale) || 1, 0.5, 2.0);
      if (patch.autoOrbit != null) next.autoOrbit = !!patch.autoOrbit;
      S.graphics = next;
      saveGraphicsPrefs(next);
      if (sceneCtrl?.setGraphics) sceneCtrl.setGraphics(next);
      return Object.assign({}, S.graphics);
    },
    pauseMenuOrbit: sec => { if (sceneCtrl?.pauseMenuOrbit) sceneCtrl.pauseMenuOrbit(sec); },
    getAudioConfig: () => audioCtrl ? audioCtrl.getConfig() : { enabled: true, master: 0.78, music: 0.68, drive: 0.78, ambience: 0.32, ui: 0.85, reverb: true },
    setAudioConfig: patch => audioCtrl ? audioCtrl.setConfig(patch) : null,
    toggleAudioMute: () => audioCtrl ? audioCtrl.toggleMute() : null,
    playUiSound: kind => { if (audioCtrl) audioCtrl.playUi(kind); },
    getAudioDiagnostics: () => audioCtrl ? audioCtrl.getDiagnostics() : null,
    recommissionShip,
    stepCombat,
    getCombatState: () => combatSnapshot(),
    resizeScene: () => { if (sceneCtrl) { const cv = $('lh-scene'); if (cv) sceneCtrl.resize(cv.clientWidth, cv.clientHeight, 0); } },
    acceptCharter: id => {S.activeCharter=id;}
  };
  function sysCombatMap(sysId = S.currentSystemId) {
    const k = sysId || 'sol';
    if (!combatBySys[k]) combatBySys[k] = {};
    return combatBySys[k];
  }
  function entitySpecFor(id, rawKey, rawKind) {
    const k = rawKey || id.replace(/^body:/, '');
    if (k === 'station' || rawKind === 'station') {
      return { key: 'station', kind: 'station', maxHull: 600, maxShield: 200, weaponKind: 'station-pd', engageRangeKm: 14000, fireIntervalS: 2.3, dmgHull: 0.14, dmgIce: 0.16 };
    }
    if (k === 'npc' || k === 'npc2' || rawKind === 'npc' || rawKind === 'lighthugger') {
      const mH = k === 'npc2' ? 300 : 320;
      return { key: k, kind: 'lighthugger', maxHull: mH, maxShield: 160, weaponKind: 'npc-fel', engageRangeKm: 20000, fireIntervalS: 2.8, dmgHull: 0.16, dmgIce: 0.18 };
    }
    if (id.startsWith('contact:') || rawKind === 'vessel') {
      return { key: id.replace(/^contact:/, ''), kind: 'vessel', maxHull: 360, maxShield: 180, weaponKind: 'npc-lance', engageRangeKm: 1e12, fireIntervalS: 3.4, dmgHull: 0.22, dmgIce: 0.24 };
    }
    return null;
  }
  function ensureCombatEntity(id, rawKey, name, rawKind) {
    if (!id) return null;
    const spec = entitySpecFor(id, rawKey, rawKind);
    if (!spec) return null;
    const map = sysCombatMap();
    if (!map[id]) {
      map[id] = {
        id,
        key: spec.key,
        name: name || spec.key.toUpperCase(),
        kind: spec.kind,
        hull: spec.maxHull,
        maxHull: spec.maxHull,
        shield: spec.maxShield,
        maxShield: spec.maxShield,
        weaponKind: spec.weaponKind,
        engageRangeKm: spec.engageRangeKm,
        fireIntervalS: spec.fireIntervalS,
        dmgHull: spec.dmgHull,
        dmgIce: spec.dmgIce,
        state: 'nominal',
        destroyed: false,
        hostile: false,
        fireCooldownS: 1.1,
        lastHitAt: -999,
        destroyedAt: null
      };
    } else if (name && map[id].name !== name) {
      map[id].name = name;
    }
    return map[id];
  }
  function provokeAllies(ent) {
    const map = sysCombatMap();
    if (ent.key === 'station') {
      ['body:npc', 'body:npc2'].forEach(npcId => {
        const ally = map[npcId] || ensureCombatEntity(npcId, npcId.slice(5), npcId === 'body:npc' ? 'ESCORT LIGHTHUGGER' : 'ORBITAL LIGHTHUGGER', 'npc');
        if (ally && !ally.destroyed) {
          ally.hostile = true;
          ally.fireCooldownS = Math.min(ally.fireCooldownS, 1.4);
        }
      });
    } else if (ent.kind === 'lighthugger') {
      const stRel = stationRelative();
      if (stRel && stRel.distKm <= 6000) {
        const stEnt = map['body:station'] || ensureCombatEntity('body:station', 'station', sys().station?.name || 'STATION', 'station');
        if (stEnt && !stEnt.destroyed) {
          stEnt.hostile = true;
          stEnt.fireCooldownS = Math.min(stEnt.fireCooldownS, 1.6);
        }
      }
    }
  }
  function recordExplosion(targetId, targetKey, name, scale = 1.6, isPlayer = false) {
    S.explosionEvent = {
      seq: ++explosionSeq,
      at: S.combatClockS,
      perfAt: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      targetId,
      targetKey,
      name: name || 'TARGET',
      scale,
      isPlayer: !!isPlayer
    };
  }
  function destroyPlayerShip(reason) {
    S.hullIntegrity = 0;
    S.iceIntegrity = 0;
    S.damageState = 'destroyed';
    S.destroyed = true;
    S.destroyedReason = reason || 'Catastrophic hull failure';
    S.thrustCmdG = 0;
    S.burn = null;
    S.mission = null;
    S.multiHop.active = false;
    S.angVel = [0, 0, 0];
    S.rcsTorque = [0, 0, 0];
    S.autoRcsTorque = [0, 0, 0];
    S.rcsDamping = false;
    S.effectiveWarp = 1;
    S.timeWarp = 1;
    if (sceneCtrl) sceneCtrl.setIceIntegrity(0);
    recordExplosion('player', 'player', S.commissionedGenome?.name || 'LIGHTHUGGER', 2.2, true);
    S.warning = { source: 'destroyed', title: 'VESSEL LOST', text: S.destroyedReason, level: 'critical' };
    message('VESSEL LOST // ' + S.destroyedReason.toUpperCase(), 'critical');
  }
  function applyPlayerDamage(rawHullDmg, rawIceDmg, sourceName, bypassIce = false) {
    if (S.destroyed) return;
    const shieldUp = !bypassIce && S.iceIntegrity > 0.05;
    const hullDmg = shieldUp ? rawHullDmg * 0.45 : rawHullDmg;
    const iceDmg = rawIceDmg;
    const prevState = S.damageState;
    S.iceIntegrity = clamp(S.iceIntegrity - iceDmg, 0, 1);
    S.hullIntegrity = clamp(S.hullIntegrity - hullDmg, 0, 1);
    S.damageState = computeDamageState(S.hullIntegrity);
    S.playerHitSeq = (S.playerHitSeq || 0) + 1;
    S.playerHitAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    S.combatAlertS = Math.max(S.combatAlertS, 18);
    if (sceneCtrl) sceneCtrl.setIceIntegrity(S.iceIntegrity);
    if (S.hullIntegrity <= 0) {
      destroyPlayerShip('Destroyed by ' + (sourceName || 'hostile fire'));
      return;
    }
    if (S.damageState !== prevState) {
      if (S.damageState === 'critical') message('CRITICAL HULL DAMAGE (' + Math.round(S.hullIntegrity * 100) + '%) -- THRUST & RADIATORS DEGRADED', 'critical');
      else if (S.damageState === 'damaged') message('HULL DAMAGED (' + Math.round(S.hullIntegrity * 100) + '%) -- RADIATOR MARGIN REDUCED', 'elevated');
    }
  }
  function recommissionShip() {
    clearMultiHop();
    delete combatBySys[S.currentSystemId || 'sol'];
    S.hullIntegrity = 1;
    S.iceIntegrity = 1;
    S.damageState = 'nominal';
    S.destroyed = false;
    S.destroyedReason = '';
    S.coreHeat = 0;
    S.thermalLoad = 0;
    S.thermalState = 'nominal';
    S.thermalGovernor = false;
    S.combatAlertS = 0;
    S.warning = null;
    S.lastImpact = null;
    S.pdcEvent = null;
    S.projectiles = [];
    S.weaponLockOn = false;
    enterSystemOrbit(S.currentSystemId || 'sol', true);
    rebuildShip();
    if (sceneCtrl) sceneCtrl.setIceIntegrity(1);
    message(sys().station ? 'Vessel recommissioned at Cryo-Spindle. Hull & ice restored to 100%.' : 'Emergency repair drones restored hull & ice shields to 100%.', 'nominal');
    saveVoyage(true);
    return true;
  }
  function focusBodyRadiusKm() {
    if (S.mode === 'interstellar') return 1;
    if (orbit.focusSoi === 'star') return sys().starRadiusKm || 696340;
    const m = /^planet:(\d+)$/.exec(orbit.focusSoi || '');
    const pIdx = m ? +m[1] : orbit.planetIdx;
    const pl = sys().planets && sys().planets[pIdx];
    return (pl && pl.radiusKm) || 6371;
  }
  function shipDirToGal(dirShip) {
    const d = unit(dirShip || [1, 0, 0]);
    return unit(add(mul(S.basis.f, d[0]), add(mul(S.basis.y, d[1]), mul(S.basis.z, d[2]))));
  }
  function projectileOriginWorldKm() {
    if (S.mode === 'interstellar') return currentSystemShipStarKm(sys());
    return body(orbit.focusSoi).rKm;
  }
  function targetEphemerisFor(tgtId, fallbackKey) {
    if (!tgtId && !fallbackKey) return null;
    if (tgtId === 'player') {
      const pPos = S.mode === 'interstellar' ? [0, 0, 0] : orbit.rKm.slice();
      const pVel = S.mode === 'interstellar' ? [0, 0, 0] : orbit.vKmS.slice();
      return {
        id: 'player', key: 'player', name: S.genome.name, kind: 'player',
        rKm: pPos, vKmS: pVel, posKm: pPos, velKmS: pVel,
        hitRadiusKm: 4.5
      };
    }
    const list = buildWeaponTargets();
    const t = list.find(x => x.id === tgtId || (fallbackKey && x.key === fallbackKey));
    if (!t || t.destroyed) return null;
    if (S.mode !== 'interstellar') {
      const orig = body(orbit.focusSoi);
      if (t.key === 'station' && sys().station) {
        const st = body('station', sys().station.parentPlanetIdx);
        const sPos = sub(st.rKm, orig.rKm), sVel = sub(st.vKmS, orig.vKmS);
        return { id: t.id, key: t.key, name: t.name, kind: t.kind, rKm: sPos, vKmS: sVel, posKm: sPos, velKmS: sVel, hitRadiusKm: 12 };
      }
      if (t.kind === 'planet') {
        const pIdx = (sys().planets || []).findIndex(pl => pl.name === t.name);
        if (pIdx >= 0) {
          const plBody = body('planet:' + pIdx, pIdx);
          const pPos = sub(plBody.rKm, orig.rKm), pVel = sub(plBody.vKmS, orig.vKmS);
          return { id: t.id, key: t.key, name: t.name, kind: t.kind, rKm: pPos, vKmS: pVel, posKm: pPos, velKmS: pVel, hitRadiusKm: sys().planets[pIdx].radiusKm || 4000 };
        }
      }
      const dGal = shipDirToGal(t.dir || [1, 0, 0]);
      const dKm = clamp(Number.isFinite(t.dKm) ? t.dKm : 120, 12, 40000);
      const posKm = add(orbit.rKm, mul(dGal, dKm));
      const rMag = Math.max(100, len(posKm));
      const mu = orbit.muKm3S2 || 398600;
      const hVec = cross(orbit.rKm, orbit.vKmS);
      const hMag = len(hVec);
      const orbitN = hMag > 1e-6 ? unit(hVec) : [0, 0, 1];
      const tang = unit(cross(orbitN, posKm));
      const velKmS = mul(tang, Math.sqrt(mu / rMag));
      return { id: t.id, key: t.key, name: t.name, kind: t.kind, rKm: posKm, vKmS: velKmS, posKm, velKmS, hitRadiusKm: 10 };
    }
    const dGal = shipDirToGal(t.dir || [1, 0, 0]);
    const dKm = clamp(Number.isFinite(t.dKm) ? t.dKm : 450, 20, 85000);
    const iPos = mul(dGal, dKm), iVel = [0, 0, 0];
    return { id: t.id, key: t.key, name: t.name, kind: t.kind, rKm: iPos, vKmS: iVel, posKm: iPos, velKmS: iVel, hitRadiusKm: 16 };
  }
  function spawnOrbitalProjectile(opts) {
    if (!opts) return null;
    if (!Array.isArray(S.projectiles)) S.projectiles = [];
    const dir = unit(opts.dirGal || shipDirToGal([1, 0, 0]));
    const isInter = S.mode === 'interstellar';
    const shipPosNow = isInter ? [0, 0, 0] : orbit.rKm;
    const aheadOffset = opts.owner === 'enemy' ? [0, 0, 0] : mul(dir, 0.35);
    const r0 = opts.rKm ? opts.rKm.slice() : add(shipPosNow, aheadOffset);
    const vShip = isInter ? [0, 0, 0] : orbit.vKmS;
    const v0 = opts.vKmS ? opts.vKmS.slice() : add(vShip, mul(dir, Number(opts.speedKmS) || 18));
    const origW = projectileOriginWorldKm();
    const rel0 = sub(r0, shipPosNow);
    const p = {
      id: 'proj-' + (++projSeq),
      kind: opts.kind || 'rail',
      owner: opts.owner || 'player',
      ownerName: opts.ownerName || '',
      rKm: r0,
      vKmS: v0,
      trailKm: [r0.slice()],
      relRKm: rel0.slice(),
      relTrailKm: opts.owner === 'enemy' ? [rel0.slice(), add(rel0, mul(dir, 0.2))] : [mul(dir, 0.12), rel0.slice()],
      worldRKm: add(origW, r0),
      worldTrailKm: [add(origW, r0)],
      ageS: 0,
      maxAgeS: opts.maxAgeS || 180,
      hitRadiusKm: opts.hitRadiusKm || (opts.kind === 'missile' ? 10 : 5),
      targetId: opts.targetId || null,
      targetKey: opts.targetKey || null,
      dmgHull: opts.dmgHull || 85,
      dmgIce: opts.dmgIce || 25,
      aMaxKmS2: opts.kind === 'missile' ? (opts.aMaxKmS2 || 0.65) : 0,
      fuelS: opts.kind === 'missile' ? (opts.fuelS || 70) : 0,
      navGain: opts.kind === 'missile' ? (opts.navGain || 4.2) : 0,
      burning: opts.kind === 'missile',
      gravDeflectionKm: 0,
      exploded: false
    };
    S.projectiles.push(p);
    while (S.projectiles.length > 40) S.projectiles.shift();
    return p;
  }
  let pdcCooldownS = 0;
  function stepProjectiles(dtS) {
    if (!Array.isArray(S.projectiles) || !S.projectiles.length || !O.stepOrbitalProjectile) return;
    if (!(dtS > 0)) return;
    const isInter = S.mode === 'interstellar';
    const mu = isInter ? 0 : (orbit.muKm3S2 || 398600);
    const bodyR = focusBodyRadiusKm();
    const origW = projectileOriginWorldKm();
    const budget = G.computeWeaponBudget ? G.computeWeaponBudget(activeHullGenome(), rocket) : { counts: { pdc: 2 } };
    const pdcMounts = Math.max(0, Math.round((budget.counts && budget.counts.pdc) || 0));
    const pdcRangeKm = 45 + pdcMounts * 22;
    const pdcIntervalS = 1.35 / Math.max(1, pdcMounts);

    if (dtS > 90) {
      S.projectiles = [];
      return;
    }
    const nSteps = Math.min(12, Math.max(1, Math.ceil(dtS / 0.25)));
    const h = dtS / nSteps;
    const shipPos = isInter ? [0, 0, 0] : orbit.rKm;
    const tCache = Object.create(null);

    for (let s = 0; s < nSteps; s++) {
      pdcCooldownS = Math.max(0, pdcCooldownS - h);
      for (let i = 0; i < S.projectiles.length; i++) {
        const p = S.projectiles[i];
        if (!p || p.exploded) continue;
        let tState = null;
        if (p.owner === 'enemy') {
          tState = tCache.player || (tCache.player = targetEphemerisFor('player'));
        } else if (p.targetId || p.targetKey) {
          const cKey = (p.targetId || '') + '|' + (p.targetKey || '');
          tState = Object.prototype.hasOwnProperty.call(tCache, cKey) ? tCache[cKey] : (tCache[cKey] = targetEphemerisFor(p.targetId, p.targetKey));
        }
        if (tState && tState.hitRadiusKm) p.hitRadiusKm = Math.max(p.hitRadiusKm || 5, tState.hitRadiusKm);
        const res = O.stepOrbitalProjectile(p, h, mu, bodyR, tState);
        if (p.owner === 'enemy' && !p.exploded && pdcMounts > 0 && pdcCooldownS <= 0 && !S.docked && !S.destroyed) {
          const dShip = len(sub(p.rKm, shipPos));
          if (dShip <= pdcRangeKm && (p.kind === 'missile' || dShip <= pdcRangeKm * 0.55)) {
            p.exploded = true;
            pdcCooldownS = pdcIntervalS;
            const dWorld = add(origW, p.rKm);
            S.pdcEvent = {
              seq: ++pdcSeq,
              perfAt: typeof performance !== 'undefined' ? performance.now() : Date.now(),
              projId: p.id,
              interceptedKind: p.kind,
              distKm: dShip,
              hitWorldKm: dWorld,
              dirShip: toShipDir(sub(p.rKm, shipPos)) || [1, 0, 0]
            };
            continue;
          }
        }
        if (res.hit && tState) {
          p.exploded = true;
          if (p.owner === 'player') {
            const ent = ensureCombatEntity(tState.id, tState.key || tState.id, tState.name, tState.kind);
            if (ent && ent.state !== 'destroyed') {
              let hullDmg = p.dmgHull;
              if (ent.shield > 0) {
                const abs = Math.min(ent.shield, p.dmgHull * 0.5);
                ent.shield = Math.max(0, ent.shield - abs);
                hullDmg = p.dmgHull - abs * 0.65;
              }
              ent.hull = Math.max(0, ent.hull - hullDmg);
              ent.lastHitAt = S.combatClockS;
              ent.state = computeDamageState(ent.hull / ent.maxHull);
              S.combatAlertS = Math.max(S.combatAlertS, 22);
              if (ent.hull <= 0) {
                ent.state = 'destroyed';
                ent.destroyed = true;
                ent.hostile = false;
                ent.destroyedAt = S.combatClockS;
                S.kills = (S.kills || 0) + 1;
                recordExplosion(ent.id, ent.key, ent.name, ent.kind === 'station' ? 2.6 : 1.6, false);
                message(p.kind.toUpperCase() + ' IMPACT // ' + ent.name.toUpperCase() + ' VAPORIZED', 'nominal');
              } else {
                ent.hostile = true;
                ent.fireCooldownS = Math.min(ent.fireCooldownS, 0.85);
                provokeAllies(ent);
                message(p.kind.toUpperCase() + ' IMPACT -> ' + ent.name.toUpperCase() + ' (-' + Math.round(hullDmg) + ')');
              }
            }
          } else if (p.owner === 'enemy' && !S.destroyed) {
            applyPlayerDamage(p.dmgHull, p.dmgIce, p.ownerName || 'Hostile Ordnance', false);
          }
        } else if (res.bodyHit || p.ageS >= p.maxAgeS) {
          p.exploded = true;
        } else {
          const minInertialKm = Math.max(0.5, Math.min(20, len(p.vKmS) * 0.12));
          const lastIn = p.trailKm[p.trailKm.length - 1];
          if (!lastIn || len(sub(p.rKm, lastIn)) >= minInertialKm) {
            p.trailKm.push(p.rKm.slice());
            if (p.trailKm.length > 56) p.trailKm.shift();
          }
        }
      }
    }
    const alive = [];
    for (let i = 0; i < S.projectiles.length; i++) {
      const p = S.projectiles[i];
      if (!p || p.exploded) continue;
      if (!Array.isArray(p.relTrailKm)) p.relTrailKm = [];
      const curRel = sub(p.rKm, shipPos);
      p.relRKm = curRel;
      const lastRel = p.relTrailKm[p.relTrailKm.length - 1];
      if (!lastRel || len(sub(curRel, lastRel)) >= 0.35) {
        p.relTrailKm.push(curRel.slice());
        const maxRelPts = p.kind === 'missile' ? 44 : 14;
        while (p.relTrailKm.length > maxRelPts) p.relTrailKm.shift();
      }
      p.worldRKm = add(origW, p.rKm);
      p.worldTrailKm = p.trailKm.map(pt => add(origW, pt));
      alive.push(p);
    }
    S.projectiles = alive;
  }
  function targetDistanceKmFor(ent, hudTargets) {
    if (ent.kind === 'vessel') {
      const c = contacts.find(ct => ('contact:' + ct.id) === ent.id);
      return c ? c.rangeKm : Infinity;
    }
    const hb = hudTargets.find(b => b.id === ent.id);
    if (hb && Number.isFinite(hb.dKm)) return hb.dKm;
    if (ent.key === 'station') return stationRelative().distKm;
    if (ent.key === 'npc' || ent.key === 'npc2') return S.mode === 'interstellar' ? Infinity : 25;
    return Infinity;
  }
  function stepCombat(realDt = 0.016) {
    const dt = clamp(Number(realDt) || 0, 0, 2.0);
    if (!(dt > 0)) return;
    S.combatClockS += dt;
    S.combatAlertS = Math.max(0, S.combatAlertS - dt);
    if (S.destroyed || S.docked || (S.screen !== 'helm' && S.screen !== 'sextant')) return;
    const map = sysCombatMap();
    const hudTargets = sceneCtrl && sceneCtrl.getHudTargets ? sceneCtrl.getHudTargets() : [];
    let activeAttacker = null;
    for (const id of Object.keys(map)) {
      const ent = map[id];
      if (!ent || ent.destroyed || !ent.hostile) continue;
      if (S.mode === 'interstellar' && ent.kind !== 'vessel') continue;
      const dKm = targetDistanceKmFor(ent, hudTargets);
      if (!(dKm <= ent.engageRangeKm)) continue;
      if (!activeAttacker) activeAttacker = ent;
      ent.fireCooldownS -= dt;
      if (ent.fireCooldownS <= 0) {
        ent.fireCooldownS = ent.fireIntervalS * (0.85 + 0.30 * Math.random());
        const evading = len(S.angVel) > 0.18 || Math.abs(S.thrustCmdG) >= 1.6;
        const hit = !(evading && Math.random() < 0.25);
        S.combatAlertS = Math.max(S.combatAlertS, 18);
        S.enemyWeaponEvent = {
          seq: ++enemyWeaponSeq,
          at: S.combatClockS,
          perfAt: typeof performance !== 'undefined' ? performance.now() : Date.now(),
          attackerId: ent.id,
          attackerKey: ent.key,
          attackerName: ent.name,
          weaponKind: ent.weaponKind,
          hit,
          rel: ent.weaponKind === 'npc-lance'
        };
        const tE = targetEphemerisFor(ent.id, ent.key);
        if (tE && O.stepOrbitalProjectile) {
          const dirToPlayer = unit(sub(S.mode === 'interstellar' ? [0, 0, 0] : orbit.rKm, tE.posKm));
          spawnOrbitalProjectile({
            kind: ent.kind === 'station' ? 'missile' : 'rail',
            owner: 'enemy',
            ownerName: ent.name,
            rKm: tE.posKm,
            vKmS: add(tE.velKmS, mul(dirToPlayer, ent.kind === 'station' ? 12 : 24)),
            aMaxKmS2: 0.45,
            fuelS: 45,
            navGain: 3.4,
            targetId: 'player',
            dmgHull: 0.04,
            dmgIce: 0.05,
            maxAgeS: 45
          });
        }
        if (hit) applyPlayerDamage(ent.dmgHull, ent.dmgIce, ent.name, false);
        if (!S.destroyed) {
          S.warning = {
            source: 'combat',
            title: 'UNDER FIRE // ' + ent.name.toUpperCase(),
            text: 'Hostile ' + (ent.kind === 'station' ? 'point-defense grid' : 'Lighthugger') + ' engaging. Evade or return fire [Space].',
            level: S.hullIntegrity <= 0.35 ? 'critical' : 'elevated'
          };
        }
      }
    }
    if (!activeAttacker && S.warning?.source === 'combat') {
      S.warning = null;
    }
  }
  function combatSnapshot() {
    const map = sysCombatMap();
    const entities = {};
    let hostileCount = 0;
    for (const id of Object.keys(map)) {
      const e = map[id];
      if (!e) continue;
      if (e.hostile && !e.destroyed) hostileCount++;
      entities[id] = {
        id: e.id,
        key: e.key,
        name: e.name,
        kind: e.kind,
        hull: Math.round(e.hull),
        maxHull: e.maxHull,
        hullFrac: clamp(e.hull / Math.max(1, e.maxHull), 0, 1),
        shieldFrac: clamp(e.shield / Math.max(1, e.maxShield), 0, 1),
        state: e.state,
        hostile: !!e.hostile,
        destroyed: !!e.destroyed
      };
    }
    return {
      alertS: S.combatAlertS,
      hostileCount,
      kills: S.kills || 0,
      playerHitSeq: S.playerHitSeq || 0,
      playerHitAt: S.playerHitAt || 0,
      enemyWeaponEvent: S.enemyWeaponEvent,
      explosionEvent: S.explosionEvent,
      pdcEvent: S.pdcEvent,
      entities
    };
  }
  function toShipDir(vec) {
    if (!validVec(vec)) return null;
    const u = unit(vec);
    return [dot(u, S.basis.f), dot(u, S.basis.y), dot(u, S.basis.z)];
  }
  function hasActiveOrbitPlan() {
    return S.mode === 'orbit' && !S.docked && Boolean((S.burn && S.burn.active) || S.orbitPlan || S.maneuverChain.length > 0);
  }
  function buildWeaponTargets() {
    const out = [];
    const hudBodies = sceneCtrl && sceneCtrl.getHudTargets ? sceneCtrl.getHudTargets() : [];
    const isInterstellar = S.mode === 'interstellar';
    const enrichDestructible = (id, key, name, kind, item) => {
      const ent = ensureCombatEntity(id, key, name, kind);
      if (!ent) return Object.assign({ destructible: false, destroyed: false }, item);
      return Object.assign(item, {
        key: ent.key,
        destructible: true,
        hullFrac: clamp(ent.hull / Math.max(1, ent.maxHull), 0, 1),
        shieldFrac: clamp(ent.shield / Math.max(1, ent.maxShield), 0, 1),
        damageState: ent.state,
        hostile: !!ent.hostile,
        destroyed: !!ent.destroyed
      });
    };
    if (isInterstellar) {
      contacts.forEach(c => {
        if (!c || !validVec(c.obsVec)) return;
        const cid = 'contact:' + c.id;
        out.push(enrichDestructible(cid, c.id, c.name || c.id, 'vessel', {
          id: cid,
          name: c.name || c.id,
          kind: 'vessel',
          dir: unit(c.obsVec),
          dKm: (c.range3d || 450) * 180,
          relBeta: Number.isFinite(c.betaRel) ? c.betaRel : 0,
          D: Number.isFinite(c.D) ? c.D : 1
        }));
      });
    }
    // Prioritize tactical ships & stations before large planets when cycling or locking
    const bodyRank = { npc: 0, npc2: 1, station: 2, planet: 3, star: 4 };
    hudBodies.slice().sort((a, b) => (bodyRank[a.key] ?? 9) - (bodyRank[b.key] ?? 9)).forEach(b => {
      if (isInterstellar && b.key !== 'star') return;
      if (b.key === 'npc' || b.key === 'npc2' || b.key === 'station' || b.key === 'planet') {
        out.push(enrichDestructible(b.id, b.key, b.name, b.kind, {
          id: b.id,
          name: b.name,
          kind: b.kind,
          dir: b.dir,
          dKm: b.dKm,
          relBeta: S.beta,
          D: b.D || 1
        }));
      }
    });
    if (!sceneCtrl && !isInterstellar) {
      const stRel = stationRelative();
      const stObj = sys().station;
      if (stObj) {
        const stW = body('station', stObj.parentPlanetIdx);
        const stShip = starState();
        const stVec = toShipDir(sub(stW.rKm, stShip.rKm)) || [1, 0, 0];
        out.push(enrichDestructible('body:station', 'station', stObj.name || 'STATION', 'station', {
          id: 'body:station',
          name: stObj.name || 'STATION',
          kind: 'station',
          dir: stVec,
          dKm: stRel ? stRel.distKm : 10,
          relBeta: S.beta,
          D: 1
        }));
      }
    }
    if (!isInterstellar) {
      contacts.forEach(c => {
        if (!c || !validVec(c.obsVec)) return;
        const cid = 'contact:' + c.id;
        out.push(enrichDestructible(cid, c.id, c.name || c.id, 'vessel', {
          id: cid,
          name: c.name || c.id,
          kind: 'vessel',
          dir: unit(c.obsVec),
          dKm: (c.range3d || 450) * 800,
          relBeta: Number.isFinite(c.betaRel) ? c.betaRel : 0,
          D: Number.isFinite(c.D) ? c.D : 1
        }));
      });
    }
    return out;
  }
  const fallbackShipBounds = Object.freeze({ minX: -10, maxX: 10, minY: -2.6, maxY: 2.6, minZ: -2.6, maxZ: 2.6 });
  const shipBoundsCache = new WeakMap();
  function shipBoundsLocal(vessel) {
    const group = vessel?.group, T = root.THREE3 || root.THREE;
    if (!group || !T) return fallbackShipBounds;
    if (shipBoundsCache.has(vessel)) return shipBoundsCache.get(vessel);

    // Cache the built hull envelope in the same coordinates projectPoint expects.
    // The camera and animated exhaust should never change this envelope.
    group.updateMatrixWorld(true);
    const worldToLocal = group.matrixWorld.clone().invert();
    const meshToLocal = new T.Matrix4(), part = new T.Box3(), hull = new T.Box3();
    group.traverseVisible(mesh => {
      if (!mesh.isMesh || mesh.material?.blending === T.AdditiveBlending) return;
      const source = mesh.isInstancedMesh ? mesh : mesh.geometry;
      if (!source.boundingBox) source.computeBoundingBox();
      meshToLocal.multiplyMatrices(worldToLocal, mesh.matrixWorld);
      hull.union(part.copy(source.boundingBox).applyMatrix4(meshToLocal));
    });
    const bounds = hull.isEmpty() ? fallbackShipBounds : Object.freeze({
      minX: hull.min.x, maxX: hull.max.x,
      minY: hull.min.y, maxY: hull.max.y,
      minZ: hull.min.z, maxZ: hull.max.z
    });
    shipBoundsCache.set(vessel, bounds);
    return bounds;
  }

  function snapshot() {
    const burn = S.burn, targetPlan = S.orbitPlan;
    const mode = weaponMode(), v = sceneCtrl?.vessel;
    const focusRef = currentPrimaryRef();
    const orbits = { current: { el: orbit.el, muKm3S2: orbit.muKm3S2, focusRef } };
    let burnNode = null;
    if (S.mode === 'orbit' && !S.docked) {
      if (burn?.phase === 'chain' && burn.firing) {
        const f = burn.firing;
        burnNode = {
          rKm: orbit.rKm.slice(), focusRef, label: f.label || burn.label, dtS: 0,
          dvMagKmS: f.dvMag, dvVecKmS: f.dvVec.slice(),
          isFiring: true, burnProgress: smooth(f.realElapsedS / Math.max(1e-6, f.realDurS)),
          nextNodeRKm: null, nextNodeLabel: null
        };
        if (burn.queue?.length) {
          try {
            const prop = O.propagateManeuverChain(orbit.rKm, orbit.vKmS, orbit.muKm3S2, burn.queue);
            if (prop.segments.length > 0) {
              const xPts = prop.segments.reduce((acc, seg) => acc.concat(seg.points || []), []);
              if (xPts.length >= 2) orbits.transfer = { points: xPts, focusRef };
            }
            if (prop.nodes.length && validVec(prop.nodes[0].rKm)) {
              burnNode.nextNodeRKm = prop.nodes[0].rKm.slice();
              burnNode.nextNodeLabel = prop.nodes[0].label || null;
            }
          } catch (e) {}
        }
      } else if (burn?.phase === 'chain' && burn.queue?.length) {
        const effQueue = burn.queue.map((b, idx) => idx === 0 ? Object.assign({}, b, { dtS: Math.max(0, burn.remainingS) }) : b);
        try {
          const prop = O.propagateManeuverChain(orbit.rKm, orbit.vKmS, orbit.muKm3S2, effQueue);
          if (prop.segments.length > 1) {
            const xPts = prop.segments.slice(1).reduce((acc, seg) => acc.concat(seg.points || []), []);
            if (xPts.length >= 2) orbits.transfer = { points: xPts, focusRef };
          }
          if (prop.nodes.length && validVec(prop.nodes[0].rKm)) {
            const n0 = prop.nodes[0], n1 = prop.nodes[1];
            burnNode = {
              rKm: n0.rKm, focusRef, label: n0.label || burn.label, dtS: Math.max(0, burn.remainingS),
              dvMagKmS: n0.dvMagKmS, dvVecKmS: validVec(n0.dvVecKmS) ? n0.dvVecKmS : null,
              isFiring: false, burnProgress: 0,
              nextNodeRKm: n1 && validVec(n1.rKm) ? n1.rKm : null,
              nextNodeLabel: n1 ? n1.label : null
            };
          }
        } catch (e) {}
      } else if (S.maneuverChain.length > 0) {
        try {
          const prop = O.propagateManeuverChain(orbit.rKm, orbit.vKmS, orbit.muKm3S2, S.maneuverChain);
          if (prop.segments.length > 1) {
            const xPts = prop.segments.slice(1).reduce((acc, seg) => acc.concat(seg.points || []), []);
            if (xPts.length >= 2) orbits.transfer = { points: xPts, focusRef };
          }
          if (prop.nodes.length && validVec(prop.nodes[0].rKm)) {
            const n0 = prop.nodes[0], n1 = prop.nodes[1];
            burnNode = {
              rKm: n0.rKm, focusRef, label: n0.label || 'NODE 1', dtS: Math.max(0, S.maneuverChain[0].dtS || 0),
              dvMagKmS: n0.dvMagKmS, dvVecKmS: validVec(n0.dvVecKmS) ? n0.dvVecKmS : null,
              isFiring: false, burnProgress: 0,
              nextNodeRKm: n1 && validVec(n1.rKm) ? n1.rKm : null,
              nextNodeLabel: n1 ? n1.label : null
            };
          }
        } catch (e) {}
      }
      if (targetPlan) {
        if (targetPlan.isBrachistochrone) {
          const transfer = {isBrachistochrone:true, points:targetPlan.brachPoints,
            flipPointKm:targetPlan.flipPointKm, focusRef, ref:focusRef};
          orbits.transfer = transfer;
          orbits.brachistochrone = {...transfer, tofS:targetPlan.tofS, tFlipS:targetPlan.tFlipS,
            peakSpeedKmS:targetPlan.peakSpeedKmS, accelG:targetPlan.accelG,
            totalDvKmS:targetPlan.totalDvKmS, valid:targetPlan.valid};
          if (burn?.isBrachistochrone && validVec(targetPlan.flipPointKm)) {
            burnNode = {
              rKm: targetPlan.flipPointKm.slice(), focusRef,
              label: burn.phase === 'flip' ? 'TURNOVER FLIP' : burn.phase === 'decel' ? 'BRAKE LEG' : 'ACCEL LEG',
              dtS: Math.max(0, targetPlan.tFlipS - (burn.elapsedS || 0)),
              isFiring: burn.phase === 'accel' || burn.phase === 'decel',
              burnProgress: burn.progress || 0
            };
          }
        }
        if (!orbits.transfer && targetPlan.predictedTransferEl) {
          orbits.transfer = { el: targetPlan.predictedTransferEl, muKm3S2: orbit.muKm3S2, focusRef };
        }
        if (targetPlan.targetEl) {
          orbits.target = { el: targetPlan.targetEl, muKm3S2: orbit.muKm3S2, focusRef };
        }
        if (!burnNode && burn?.firing) {
          const f = burn.firing;
          burnNode = {
            rKm: orbit.rKm.slice(), focusRef, label: f.label || targetPlan.label, dtS: 0,
            dvMagKmS: f.dvMag, dvVecKmS: f.dvVec.slice(),
            isFiring: true, burnProgress: smooth(f.realElapsedS / Math.max(1e-6, f.realDurS))
          };
        } else if (!burnNode && orbit.el && Number.isFinite(targetPlan.dv1NodeNuRad)) {
          try {
            const nSt = O.elementsToState(Object.assign({}, orbit.el, { nuRad: targetPlan.dv1NodeNuRad }), orbit.muKm3S2);
            if (validVec(nSt.rKm)) {
              burnNode = {
                rKm: nSt.rKm, focusRef, label: targetPlan.label, dtS: Math.max(0, targetPlan.waitTimeS || 0),
                dvMagKmS: targetPlan.dv1KmS || 0,
                dvVecKmS: validVec(targetPlan.dv1VecKmS) ? targetPlan.dv1VecKmS : null,
                isFiring: false, burnProgress: 0
              };
            }
          } catch (e) {}
        }
      }
    }
    const viewGenome = activeHullGenome();
    const destObj = system(S.courseDestId);
    const destDistLy = destObj ? len(sub(destObj.xyz, S.posGal)) : null;
    const destRestDirShip = destObj ? toShipDir(sub(destObj.xyz, S.posGal)) : null;
    const progradeShip = S.mode === 'interstellar' ? toShipDir(S.velocityGal || S.headingGal) :
      orbit.el ? toShipDir(orbit.el.progradeHat) : [1,0,0];
    let destObsDirShip = destRestDirShip;
    if (destRestDirShip && S.beta > 1e-5) {
      const boost = S.mode === 'interstellar' ? progradeShip : [1, 0, 0];
      const cr = clamp(dot(destRestDirShip, boost), -1, 1);
      const co = clamp((cr + S.beta) / (1 + S.beta * cr), -1, 1);
      destObsDirShip = add(mul(boost, co), mul(sub(destRestDirShip, mul(boost, cr)), 1 / (S.gamma * (1 + S.beta * cr))));
    }
    const sustG = sustainableG();
    const kStop = Math.max(0.05, sustG) * O.KAPPA_PER_G;
    const stoppingDistLy = (S.gamma - 1) / kStop;
    const abSample = O.computeIsmAblation(S.beta, S.gamma, S.commissionedGenome.P.iceThick, S.commissionedGenome.P.iceCoverage, (S.flip && isReversible()) ? 0 : 1, 1.0);
    const iceEnduranceYr = abSample.iceLoss > 1e-6 ? S.iceIntegrity / abSample.iceLoss : Infinity;
    const elNow = orbit.el;
    const vCircKmS = elNow && elNow.radiusKm > 1 ? Math.sqrt(orbit.muKm3S2 / elNow.radiusKm) : NaN;
    const vEscKmS = Number.isFinite(vCircKmS) ? vCircKmS * Math.SQRT2 : NaN;
    const vRadKmS = elNow && validVec(orbit.vKmS) ? dot(orbit.vKmS, elNow.radialHat) : 0;
    const wpnList = buildWeaponTargets();
    const wpnTarget = S.weaponLockOn && wpnList.length ? wpnList[S.weaponTargetIdx % wpnList.length] : null;
    const near = nearestStarInfo();
    const deepSpace = S.mode === 'interstellar' && near.distLy > LIGHT_WEEK_LY;
    const hauling = S.multiHop.harvesting || S.iceHarvest.active || S.iceHarvestTrafficS > 0;
    const shuttleMode = hauling ? 'harvest' : (S.docked || S.screen === 'menu') ? 'station' : S.mode === 'interstellar' ? 'off' : 'recall';
    const planActive = hasActiveOrbitPlan();
    const showOrbitsInHelm = !deepSpace && Boolean(S.vectors);
    const mission = S.mission, transitStage = mission?.stage || null;
    const transitStageLabel = transitStage === 'turnover'
      ? TRANSIT_LABELS.turnover + (isReversible() ? ' // REV-TORCH' : ' // FLIP-BURN')
      : TRANSIT_LABELS[transitStage] || null;
    const shipRelStarKm = S.mode !== 'interstellar' || S.multiHop.harvesting ? starState().rKm :
      mission?.capturePark?.worldR || (mission && mission.destId === S.dioramaSysId && mission.totalLy - mission.travelledLy <= SYSTEM_APPROACH_LY
        ? (computeApproachShipRelStarKm(mission, S.simTimeS)?.posKm || null)
        : (mission && mission.departureId === S.dioramaSysId && mission.travelledLy <= SYSTEM_APPROACH_LY
          ? computeDepartureShipRelStarKm(mission, S.simTimeS) : null));
    const rcsTorque = [0, 1, 2].map(i => {
      const m = S.rcsTorque[i] || 0, a = S.autoRcsTorque[i] || 0;
      return Math.abs(a) > Math.abs(m) ? a : m;
    });
    const snap = Object.assign({},S,{
      rcsTorque,
      graphics: Object.assign({}, S.graphics),
      audio: audioCtrl ? audioCtrl.getConfig() : null,
      nearestStarName:near.sys ? near.sys.name : sys().name, nearestStarDistLy:near.distLy,
      inDeepSpace:deepSpace, orbitNavAvailable:!deepSpace, shuttleMode,
      systemId:S.currentSystemId,systemName:sys().name,shipName:viewGenome.name,
      discoveredSystems:(S.discoveredSystems||[]).slice(),
      visitedSystems:(S.visitedSystems||['sol']).slice(),
      frontierCount:(S.discoveredSystems||[]).length,
      frontierTotal:(Galaxy.FRONTIER_SYSTEMS||[]).length+(Galaxy.DYNAMIC_SYSTEMS?Galaxy.DYNAMIC_SYSTEMS.length:0),
      distFromSolLy:validVec(S.posGal)?len(S.posGal):0,
      milkyWay:Galaxy.getMilkyWayInfo?Galaxy.getMilkyWayInfo(S.posGal):null,
      observerVelKmS:S.mode==='interstellar'?mul(unit(S.velocityGal||S.headingGal),(S.beta||0)*O.C_KMS):starState().vKmS,
      allSystems:allSystems(),
      iceShield:S.iceIntegrity, canHarvestIce:localIceAvailable(), iceHarvestSite:iceHarvestSite(),
      iceHarvest:{...S.iceHarvest},
      iceDeposits: Galaxy.findNearestIceDeposit ? (Galaxy.findNearestIceDeposit(sys(), currentSystemShipStarKm(sys()), S.simTimeS)?.all || []).map(x => ({
        id: x.deposit.id, name: x.deposit.name, kind: x.deposit.kind, bodyName: x.deposit.bodyName,
        parentRef: x.deposit.parentRef, distKm: x.distKm, worldR: x.worldR.slice()
      })) : [],
      camViewMode: S.camViewMode,
      multiHop:{...S.multiHop}, multiHopPreview:getMultiHopPreview(),
      thrustG:S.mode === 'interstellar' && !S.mission ? S.cruiseAppliedG : S.thrustCmdG,
      autoClock:S.autoClock,timeWarp:S.timeWarp,effectiveWarp:S.effectiveWarp,
      savedVoyage:savedVoyage?{shipName:savedVoyage.genome.name,currentSystemId:savedVoyage.currentSystemId,
        systemName:system(savedVoyage.currentSystemId)?.name,docked:savedVoyage.docked,
        epochYear:savedVoyage.epochYear,shipTauYears:savedVoyage.shipTauYears,savedAt:savedVoyage.savedAt}:null,
      menuShowcase:S.screen==='menu',showOrbitsInHelm,hasActiveOrbitPlan:planActive,burnNode,deckClearPx:UI.getDeckClearPx?UI.getDeckClearPx():0,
      stationName:sys().station?sys().station.name:'UNINHABITED',uninhabited:!sys().station,tauYears:S.shipTauYears,orbit,rocketSpecs:G.computeRocketSpecs(viewGenome),
      weaponBudget:G.computeWeaponBudget?G.computeWeaponBudget(viewGenome,rocket):null,
      projectiles:(S.projectiles||[]).filter(p=>!p.exploded).map(p=>({id:p.id,kind:p.kind,owner:p.owner,rKm:p.rKm.slice(),trailKm:p.trailKm.map(pt=>pt.slice()),relRKm:(p.relRKm||[0,0,0]).slice(),relTrailKm:(p.relTrailKm||[]).map(pt=>pt.slice()),worldRKm:p.worldRKm.slice(),worldTrailKm:p.worldTrailKm.map(pt=>pt.slice()),vKmS:p.vKmS.slice(),burning:!!p.burning,ageS:p.ageS,targetId:p.targetId,gravDeflectionKm:p.gravDeflectionKm||0})),
      mouseSteerVisual:S.mouseSteerVisual,
      orbitPrimary:orbit.primary,orbitPrimaryLabel:currentPrimaryLabel(),orbitViewFrame:S.orbitFrame,
      lastImpact:S.lastImpact,lastRingCrossing:S.lastRingCrossing,
      hullIntegrity:S.hullIntegrity,damageState:S.damageState,destroyed:S.destroyed,destroyedReason:S.destroyedReason,
      combat:combatSnapshot(),
      targetOrbits:computeTargetOrbitsForSnapshot(),
      reversibleDrive:isReversible(viewGenome),
      hasAftIce:!isReversible(viewGenome),
      iceSymmetry:(viewGenome.P&&viewGenome.P.iceSymmetry)||'fore',
      missionPhase:S.mission?S.mission.phase:null,
      transitStage, transitStageLabel, transitStageProgress:mission?.stageProgress ?? null, shipRelStarKm,
      missionRemLy:S.mission?Math.max(0,S.mission.totalLy-S.mission.travelledLy):null,
      deckGSign:(isReversible()&&S.thrustCmdG<-0.02)?-1:1,
      attitude:S.attitudeMode.toLowerCase().replace('anti-normal','antinormal'),burn:burn||{active:false},
      dock:stationRelative(),destId:S.courseDestId,destName:destObj?.name,
      distToDestLy:destDistLy,
      weaponMode:mode, weaponLockOn:S.weaponLockOn,
      hud:{
        flight:S.hudFlight,
        rel:S.hudRel,
        weapons:S.hudWeapons,
        camLock:S.camLock,
        camViewMode:S.camViewMode,
        hideShip:S.hideShip,
        projectDir:sceneCtrl&&sceneCtrl.projectDir?sceneCtrl.projectDir:null,
        projectPoint:sceneCtrl?.projectPoint?.bind(sceneCtrl) || null,
        getStarVectorPairs:(W,H) => sceneCtrl?.getStarVectorPairs?.(W,H,snap) || [],
        shipBottomLocal:[((v?.bowX || 22) + (v?.sternX || -18)) * 0.5, -(Math.max(v?.rySeam || 3.5, 3.2) + 2.6), 0],
        shipBoundsLocal:shipBoundsLocal(v),
        bodies:sceneCtrl&&sceneCtrl.getHudTargets?sceneCtrl.getHudTargets():[],
        progradeShip,
        normalShip:elNow?toShipDir(elNow.normalHat):[0,1,0],
        radialShip:elNow?toShipDir(elNow.radialHat):[0,0,1],
        vCircKmS,vEscKmS,vRadKmS,
        stoppingDistLy,iceEnduranceYr,
        destObsDirShip,destRestDirShip,
        destDopplerD:destRestDirShip?Math.max(1e-4,S.gamma*(1+S.beta*(S.mode === 'interstellar' ? dot(destRestDirShip, progradeShip) : destRestDirShip[0]))):null,
        weaponLockOn:S.weaponLockOn,
        weaponTarget:wpnTarget,
        weaponMode:mode,
        weaponCount:wpnList.length,
        weaponFireAt:S.weaponFireAt,
        shuttlePorts:(viewGenome.P&&viewGenome.P.shuttlePorts)||2
      },
      starPlan:S.missionPlan,plan:S.missionPlan,orbits,node:S.node,
      thermal:{coreHeat:S.coreHeat,load:S.thermalLoad,state:S.thermalState,governor:S.thermalGovernor,
        headroom:thermalHeadroom(),sustainedAccelG:sustainableG(),radiatorMW:rocket.radiatorMW,coreRatingGW:rocket.coreRatingGW},
      archive,
      drydock:{dirty:JSON.stringify(S.genome)!==JSON.stringify(S.commissionedGenome),cost:refitCost(),berthOk:S.docked,cutaway:S.hideIce,cam:S.drydockCam,vault:fleet.map((g,id)=>({id,name:g.name}))},
      osc:{mode:S.oscMode,windowNm:S.specWindow,hoverNm:S.hoverNm},
      sextant:{theta:S.scopeTheta,phi:S.scopeAz,irSight:S.irSight,autoSolve:S.autoSolve,lock:S.lockedTarget,hail:S.hail,contacts,mag:sceneCtrl?1/sceneCtrl.cam.sxZoom:1,
        sky:(Galaxy.getVisibleSystems?Galaxy.getVisibleSystems(S.discoveredSystems,S.posGal):allSystems()).map(s=>{const n=unit(sub(s.xyz,S.posGal));const surveyed=!s.procedural||(S.visitedSystems&&S.visitedSystems.includes(s.id));const name=surveyed?s.name:('UNIDENTIFIED '+(s.signalId||String(s.id||'').toUpperCase()));return {id:s.id,name,surveyed,theta:Math.acos(clamp(dot(n,S.headingGal),-1,1))*180/PI,phi:Math.atan2(dot(n,S.basis.z),dot(n,S.basis.y))*180/PI};})},
      view:S.screen==='menu'?'menu':S.screen==='orbits'?'orbit':S.screen==='sextant'?'sextant':S.screen==='drydock'?'drydock':'helm',
      zoom:sceneCtrl?(S.screen==='sextant'?1/sceneCtrl.cam.sxZoom:sceneCtrl.defaults.zoom/sceneCtrl.cam.orbitZoom):1,
      contacts,cam:sceneCtrl?sceneCtrl.cam:undefined, scopeTheta:S.scopeTheta,scopeAz:S.scopeAz,
      reducedMotion:!!(root.matchMedia&&root.matchMedia('(prefers-reduced-motion: reduce)').matches)
    });
    // During cruise the scene draws the nearest endpoint system using the exact
    // galactic ship position; local orbit vectors and curves are stale and must not override it.
    if(S.mode==='interstellar') {snap.currentSystemId=S.dioramaSysId;snap.orbit=null;snap.orbits={};}
    return snap;
  }
  function drawScope() {
    const cv=$('kg-scope-canvas'); if(!cv || (UI.isScopeVisible&&!UI.isScopeVisible()))return;
    const ctx=cv.getContext('2d');if(!ctx)return;
    const w=cv.width,h=cv.height;
    ctx.fillStyle='#001407';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#12452a';ctx.lineWidth=1;
    for(let i=1;i<10;i++){ctx.beginPath();ctx.moveTo(i*w/10,0);ctx.lineTo(i*w/10,h);ctx.moveTo(0,i*h/10);ctx.lineTo(w,i*h/10);ctx.stroke();}
    ctx.save();ctx.shadowBlur=7;ctx.shadowColor='#69ff97';ctx.strokeStyle='#80ffa9';ctx.lineWidth=1.4;ctx.beginPath();
    const lock=S.lockedTarget, center=lock?.lambdaObs||656.28, temp=lock?.T||5800;
    for(let x=0;x<w;x++){
      const nm=S.specWindow[0]+x/w*(S.specWindow[1]-S.specWindow[0]);
      let y;
      if(S.oscMode==='vec')y=h/2+Math.sin(x/w*PI*4)*h*.33*Math.max(.05,S.beta);
      else if(S.oscMode==='lamp') {
        const emission=[[434.05,.45],[486.13,.65],[656.28,.95]].reduce((sum,line)=>sum+line[1]*Math.exp(-.5*((nm-line[0])/1.5)**2),.03);
        y=h*.9-h*.75*emission;
      }
      else {
        // Planck spectral continuum plus a resolved H-alpha line in observed nm.
        const planck=(n)=>1/(Math.pow(n/550,5)*Math.expm1(1.4387769e7/(n*temp)));
        const continuum=clamp(planck(nm)/Math.max(1e-20,planck(2.89777e6/temp)),0,1);
        const line=Math.exp(-.5*((nm-center)/Math.max(.4,(S.specWindow[1]-S.specWindow[0])/300))**2);
        y=h*.9-h*.66*continuum*(1-.7*line);
      }
      if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    ctx.stroke();ctx.restore();ctx.fillStyle='#90ffad';ctx.font='12px monospace';
    if(S.oscMode==='vec') {
      ctx.fillStyle='#001407';ctx.fillRect(1,21,w-2,h-44);ctx.strokeStyle='#80ffa9';
      contacts.forEach(c=>{
        const x=w/2+c.obsVec[1]*w*.4,y=h/2-c.obsVec[2]*h*.4;
        ctx.beginPath();ctx.moveTo(w/2,h/2);ctx.lineTo(x,y);ctx.stroke();ctx.fillStyle='#90ffad';ctx.fillText(c.id,x+3,y);
      });
    }
    ctx.fillText('KG-2100 / P1 / '+S.oscMode.toUpperCase(),10,18);
    ctx.fillText(S.specWindow.map(n=>n.toFixed(0)).join(' - ')+' nm',10,h-10);
    if(S.hoverNm!=null){const x=(S.hoverNm-S.specWindow[0])/(S.specWindow[1]-S.specWindow[0])*w;ctx.strokeStyle='#76ad87';ctx.beginPath();ctx.moveTo(x,20);ctx.lineTo(x,h-20);ctx.stroke();ctx.fillText(S.hoverNm.toFixed(1)+' nm',10,35);}
  }
  const keys = {};
  function typing(target) { return target&&(/INPUT|SELECT|TEXTAREA/.test(target.tagName)||target.isContentEditable); }
  document.addEventListener('keydown', e => {
    if(typing(e.target))return;
    const key=e.key.toLowerCase();keys[key]=true;
    if(key==='b'){actions.setAttitudeMode('retrograde');e.preventDefault();}
    if(S.screen==='sextant'){
      if(/^arrow/.test(key))e.preventDefault();
      if(!e.repeat){
        const fn={' ':actions.sampleDoppler,t:actions.snapNearestTarget,p:actions.setDestFromSextant,h:()=>hailContact(contacts[0].id)}[key];
        if(fn){fn();e.preventDefault();}
      }
    } else if(S.screen==='helm') {
      if(/^arrow/.test(key))e.preventDefault();
      if(!e.repeat) {
        if(key===' ' && S.hudWeapons){actions.fireWeaponPulse();e.preventDefault();}
        else if(key==='q' && S.hudWeapons){actions.launchMissileSalvo();e.preventDefault();}
        else if(key==='tab' && S.hudWeapons){actions.cycleWeaponTarget();e.preventDefault();}
      }
    }
  });
  document.addEventListener('keyup', e => {delete keys[e.key.toLowerCase()];});
  root.addEventListener('blur',()=>{Object.keys(keys).forEach(k=>delete keys[k]);S.puck=[0,0];S.rollInput=0;S.mouseSteer=[0,0];S.mouseSteerVisual=null;});
  let holdNotice = false, dockNotice = false;
  function spinLevers() {
    const halfLenM = Math.max(1500, (rocket.totalM || 3500) * 0.5);
    const rRollM = Math.max(180, (rocket.beamM || 420) * 0.5);
    return { halfLenM, rRollM };
  }
  function computeSpinG(angVel) {
    const { halfLenM, rRollM } = spinLevers();
    const [wx, wy, wz] = angVel;
    return (rRollM * wx * wx + halfLenM * (wy * wy + wz * wz)) / 9.80665;
  }
  function steerRcs(cmd, dt) {
    const invG = (1 / Math.max(1, S.gamma)) * (S.fineSteer ? 0.25 : 1);
    S.rcsDamping = false;
    S.angVel = S.angVel.map((omega, i) => {
      if (Math.abs(cmd[i]) > 0.02) {
        S.rcsTorque[i] = cmd[i];
        return omega + cmd[i] * RCS_ACCEL[i] * invG * dt;
      }
      S.rcsTorque[i] = 0;
      if (Math.abs(omega) <= 0.0015) return 0;
      const brake = -Math.sign(omega) * clamp(Math.abs(omega) / 0.08, 0.14, 1);
      const delta = brake * RCS_DAMP[i] * invG * dt;
      if (Math.abs(delta) >= Math.abs(omega)) return 0;
      S.rcsTorque[i] = brake;
      S.rcsDamping = true;
      return omega + delta;
    });
    // Hard-cap RCS angular velocity so centrifugal spin load is strictly < 5.0 g
    const gNow = computeSpinG(S.angVel);
    if (gNow > MAX_SPIN_G) {
      const k = Math.sqrt(MAX_SPIN_G / gNow);
      S.angVel = mul(S.angVel, k);
    }
    const [roll, yaw, pitch] = S.angVel;
    if (yaw || pitch) basis(add(S.headingGal, add(mul(S.basis.z, yaw * dt), mul(S.basis.y, pitch * dt))));
    if (roll) rollBasis(roll * dt);
  }
  function trimPrograde(dt) {
    const world = S.mode === 'interstellar' ? null : starState();
    const vHat = world ? unit(world.vKmS) : S.velocityGal || S.headingGal;
    const input = add(mul(S.basis.z, clamp(S.puck[0], -1, 1)), mul(S.basis.y, clamp(S.puck[1], -1, 1)));
    const lateral = sub(input, mul(vHat, dot(vHat, input)));
    const gain = (S.fineSteer ? 0.25 : 1) / Math.max(1, S.gamma);
    const trimmed = unit(add(vHat, mul(lateral, 0.2 * gain * dt)));
    if (world) {
      orbit.vKmS = add(orbit.vKmS, sub(mul(trimmed, len(world.vKmS)), world.vKmS));
      refreshOrbit();
    } else S.velocityGal = trimmed;
    const cone = 2 * PI / 180, alignment = dot(S.headingGal, trimmed);
    if (alignment < Math.cos(cone)) {
      const tangent = sub(S.headingGal, mul(trimmed, alignment));
      basis(len(tangent) > 1e-8 ? add(mul(trimmed, Math.cos(cone)), mul(unit(tangent), Math.sin(cone))) : trimmed);
    }
  }
  function updateSpinLoad() {
    S.spinG = Math.min(MAX_SPIN_G, computeSpinG(S.angVel));
    S.crewSpinKilled = false;
    if (S.spinG >= HIGH_SPIN_G) {
      S.warning = { source:'spin', title:'SPIN CAP (' + S.spinG.toFixed(1) + 'g)',
        text:'RCS governor capping centrifugal spin below 5.0 g. Ease rotation or press [0] ALL STOP.',
        level:'critical' };
    } else if (S.spinG > WARN_SPIN_G) {
      S.warning = { source:'spin', title:'SPIN WARN (' + S.spinG.toFixed(1) + 'g)',
        text:'Extremity centrifugal load above 2.0 g. Ease rotation.', level:'elevated' };
    } else if (S.warning?.source === 'spin') S.warning = null;
  }
  function steer(dt) {
    if (S.destroyed) { S.angVel = [0, 0, 0]; S.rcsTorque = [0, 0, 0]; S.rcsDamping = false; S.thrustCmdG = 0; return; }
    const throttle = Number(!!keys.w) - Number(!!keys.s);
    if (!S.docked && throttle) setThrustG(S.thrustCmdG + throttle * dt);
    const radius = Math.hypot(...S.puck);
    const gain = radius > .08 ? Math.pow(clamp((radius - .08) / .92, 0, 1), 1.8) / radius : 0;
    const arrOn = S.screen === 'sextant' || S.screen === 'helm';
    const arrX = arrOn ? Number(!!keys.arrowright) - Number(!!keys.arrowleft) : 0;
    const arrY = arrOn ? Number(!!keys.arrowup) - Number(!!keys.arrowdown) : 0;
    const mSteer = (S.screen === 'helm' && !S.docked && S.puckMode !== 'cam' && Array.isArray(S.mouseSteer)) ? S.mouseSteer : [0, 0];
    const yaw = clamp(Number(!!keys.d)-Number(!!keys.a)+arrX+S.puck[0]*gain+mSteer[0], -1, 1);
    const pitch = clamp(Number(!!keys.q && !S.hudWeapons)-Number(!!keys.e)+arrY+S.puck[1]*gain+mSteer[1], -1, 1);
    const rollKey = S.screen === 'helm' && !S.docked
      ? (Number(!!keys.c || !!keys['.'] || !!keys[']']) - Number(!!keys.z || !!keys[','] || !!keys['[']))
      : 0;
    const roll = clamp(rollKey + (S.rollInput || 0), -1, 1);
    const steerShip = S.screen !== 'sextant' && S.puckMode !== 'cam';
    const locked = !!(S.mission || S.burn);
    const manual = S.screen === 'helm' && steerShip;
    const bank = manual && !locked && !S.docked;
    S.vecProgradeLock = bank && S.puckMode === 'vec' && S.beta > 0.04 && S.puck.some(value => Math.abs(value) > 0.01);
    if (S.vecProgradeLock) { S.angVel[1] = 0; S.angVel[2] = 0; }
    const cmd = bank ? [roll, S.vecProgradeLock ? 0 : yaw, S.vecProgradeLock ? 0 : pitch] : [0, 0, 0];
    const active = S.vecProgradeLock || cmd.some(value => Math.abs(value) > 0.02);
    if (active && S.attitudeMode !== 'MANUAL') {
      message('Manual helm. Attitude lock released.');
      S.attitudeMode = 'MANUAL';
    }
    if (!locked && !S.docked && (bank || S.angVel.some(Boolean))) steerRcs(cmd, dt);
    else {
      S.angVel = [0, 0, 0]; S.rcsTorque = [0, 0, 0]; S.rcsDamping = false;
    }
    if (S.vecProgradeLock) trimPrograde(dt);
    updateSpinLoad();
    const blend = 1 - Math.exp(-dt * (active ? 8 : 5));
    const visNorm = [0.42, 0.16, 0.16];
    ['steerVisRoll', 'steerVisYaw', 'steerVisPitch'].forEach((key, i) => {
      const target = clamp(S.angVel[i] / visNorm[i], -1, 1) * 0.72 + cmd[i] * 0.35;
      S[key] = (S[key] || 0) + (target - (S[key] || 0)) * blend;
    });
    const input = !!(yaw || pitch || roll);
    const warnHold = manual && locked && input;
    const warnDock = manual && S.docked && input;
    if (warnHold && !holdNotice) message('Autopilot holds course. Cancel guidance to steer.', 'elevated');
    if (warnDock && !dockNotice) message('Berthed at station. Press UNDOCK to rotate & maneuver.', 'elevated');
    holdNotice = warnHold; dockNotice = warnDock;
    if (!input) return;
    if (S.screen === 'sextant') {
      const fovScale = sceneCtrl ? clamp(sceneCtrl.cam.sxZoom, 0.005, 2.5) : 1;
      slewSextant(yaw * dt * 0.65 * fovScale, pitch * dt * 0.65 * fovScale);
    } else if (S.puckMode === 'cam' && sceneCtrl) {
      sceneCtrl.cam.orbitYaw += yaw * dt * 1.4;
      sceneCtrl.cam.orbitPitch = clamp(sceneCtrl.cam.orbitPitch - pitch * dt * 1.4, -1.4, 1.4);
    }
  }
  function updateFighterCamLock(dt) {
    if (!sceneCtrl || S.screen !== 'helm' || S.docked || drag || S.puckMode === 'cam') return;
    if (!S.camSnapActive) return;
    const preset = CAM_VIEW_PRESETS[S.camViewMode] || CAM_VIEW_PRESETS.low;
    const goalY = preset.yaw, goalP = preset.pitch, goalZ = preset.zoom;
    const dY = Math.atan2(Math.sin(goalY - sceneCtrl.cam.orbitYaw), Math.cos(goalY - sceneCtrl.cam.orbitYaw));
    const dP = goalP - sceneCtrl.cam.orbitPitch;
    const follow = 1 - Math.exp(-dt * 8.5);
    sceneCtrl.cam.orbitYaw += dY * follow;
    sceneCtrl.cam.orbitPitch += dP * follow;
    sceneCtrl.cam.orbitZoom += (goalZ - sceneCtrl.cam.orbitZoom) * follow;
    if (Math.abs(dY) < 0.008 && Math.abs(dP) < 0.008 && Math.abs(goalZ - sceneCtrl.cam.orbitZoom) < 0.008) {
      sceneCtrl.cam.orbitYaw = goalY;
      sceneCtrl.cam.orbitPitch = goalP;
      sceneCtrl.cam.orbitZoom = goalZ;
      sceneCtrl.cam.zoomTarget = null;
      S.camSnapActive = false;
    }
  }
  function geometryStats() {
    const group=sceneCtrl?.vessel?.group;if(!group)return null;
    const radius=name=>{const a=group.getObjectByName(name)?.geometry?.attributes?.position?.array;let r=0;if(a)for(let i=0;i<a.length;i+=3)r=Math.max(r,Math.hypot(a[i+1],a[i+2]));return r;};
    const hg=activeHullGenome();
    return {hasLongPatienceIce:!!group.getObjectByName('02_Ice_Lance_Shell'),hasProcIce:!!group.getObjectByName('Procedural_Hull_Ice'),hasAftIce:!!group.getObjectByName('Aft_Ice_Shield'),
      portCountRendered:group.getObjectByName('Shuttle_Ports')?.children.length||0,iceSymmetry:hg.P.iceSymmetry,portPlacement:hg.P.portPlacement,
      maxCollarR:radius('Waist_City_Collar'),maxFwdR:radius('Forward_Hull'),maxProcIceR:radius('Procedural_Hull_Ice'),maxLongIceR:radius('02_Ice_Lance_Shell'),maxAftIceR:radius('Aft_Ice_Shield')};
  }
  Object.defineProperties(S,{orbit:{get:()=>orbit},rocket:{get:()=>rocket},shipBasis:{get:()=>S.basis},inOrbit:{get:()=>S.mode==='orbit'}});
  root.__LH_APP = Object.assign({},actions,{
    state:S,orbit,rocket,step,stepOrbitalState,enterSystemOrbit,plotTargetOrbit,plotOrbitCapture,circularizeOrbit,
    executeOrbitManeuver,checkSoiTransition,switchPhysicsPrimary,
    getSnapshot:snapshot,getShipGeometryStats:geometryStats,
    getSceneInfo:()=>sceneCtrl?.getSceneInfo()||null,
    getRelativitySnapshot:()=>sceneCtrl?.getRelativitySnapshot()||{beta:S.beta,gamma:S.gamma},
    getSnowBounds:()=>sceneCtrl?.getSnowBounds()||null,
    getFlowDiagnostics:()=>({beta:S.beta,docked:S.docked,inOrbit:S.mode==='orbit',posGal:S.posGal.slice(),sysPos:starState().rKm,
      sysSpeedKmS:len(starState().vKmS),dioramaSysId:S.dioramaSysId,approachPhase:S.mission?.stage||'none',iceIntegrity:S.iceIntegrity,massMt:S.massMt,
      coreHeat:S.coreHeat,thermalState:S.thermalState,reactionless:true,
      scene:sceneCtrl?.getSceneInfo()}),
    lockStarByIndex:i=>Galaxy.SYSTEMS[i]?lockStar(Galaxy.SYSTEMS[i].id):false,
    rebuildShip,draft,stepThermal:updateThermal,stepCombat,stepProjectiles,launchMissileSalvo:actions.launchMissileSalvo,recommissionShip,getCombatState:combatSnapshot,captureVoyage,restoreVoyage
  });
  updateRocket();enterSystemOrbit('sol',true);refreshArchive();
  lockStar('rigil') || lockStar('proxima');
  UI.init(actions);
  if(root.LighthuggerScene)sceneCtrl=root.LighthuggerScene.create($('lh-scene'),{genome:S.genome,sys:sys(),simTimeS:S.simTimeS,graphics:S.graphics});
  if(sceneCtrl?.setGraphics)sceneCtrl.setGraphics(S.graphics);
  if(!sceneCtrl)message('WebGL unavailable. Flight instruments remain active.','elevated');
  function resize(){if(sceneCtrl){const cv=$('lh-scene');sceneCtrl.resize(cv.clientWidth,cv.clientHeight,0);}}
  root.addEventListener('resize',resize);resize();
  root.addEventListener('pagehide',()=>saveVoyage(true));
  // Camera drag is independent of the puck and never changes a vessel trajectory.
  const canvas=$('lh-scene');
  let drag=null;
  const activePtrs=new Map();
  let pinchDist=0;
  function twoPtrDist(){const pts=[...activePtrs.values()];return pts.length>=2?Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y):0;}
  function isHelmPilotMouse(){return S.screen==='helm' && !S.docked && S.puckMode!=='cam';}
  if(canvas){
    canvas.addEventListener('contextmenu',e=>{e.preventDefault();});
    canvas.addEventListener('pointerdown',e=>{
      if(e.pointerType==='mouse' && e.button!==0 && e.button!==2)return;
      if(e.pointerType==='mouse')activePtrs.clear();
      if(sceneCtrl&&sceneCtrl.commitMenuSway)sceneCtrl.commitMenuSway();
      activePtrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(e.pointerType==='mouse'||activePtrs.size===1){
        const mode = (e.pointerType==='mouse' && e.button===2)
          ? 'orbit'
          : (e.pointerType==='mouse' && e.button===0 && isHelmPilotMouse())
            ? 'pilot'
            : (S.screen==='sextant' ? 'sextant' : 'orbit');
        drag={id:e.pointerId,mode,hadButtons:(e.buttons||0)>0,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,moved:0};
        pinchDist=0;
      } else if(activePtrs.size===2){
        drag=null;S.mouseSteer=[0,0];S.mouseSteerVisual=null;pinchDist=twoPtrDist();
      }
      try{canvas.setPointerCapture(e.pointerId);}catch(_){}
    });
    const endPtr=e=>{
      activePtrs.delete(e.pointerId);
      if(drag&&drag.id===e.pointerId){
        if(e.type==='pointerup' && drag.mode==='pilot' && drag.moved<=6 && S.hudWeapons && !S.destroyed && !S.docked){
          actions.fireWeaponPulse();
        }
        if(drag.mode==='pilot'){S.mouseSteer=[0,0];S.mouseSteerVisual=null;}
        drag=null;
      }
      if(activePtrs.size<2)pinchDist=0;
      if(activePtrs.size===1){
        const [id,pt]=[...activePtrs.entries()][0];
        drag={id,mode:S.screen==='sextant'?'sextant':'orbit',hadButtons:false,startX:pt.x,startY:pt.y,x:pt.x,y:pt.y,moved:10};
      }
    };
    canvas.addEventListener('pointermove',e=>{
      if(!activePtrs.has(e.pointerId)||!sceneCtrl)return;
      if(e.pointerType==='mouse' && drag && drag.hadButtons && e.buttons===0){endPtr(e);return;}
      activePtrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(activePtrs.size>=2){
        const nd=twoPtrDist();
        if(pinchDist>10&&nd>10)actions.zoomBy(clamp(pinchDist/nd,0.82,1.22));
        pinchDist=nd;
        return;
      }
      if(!drag||drag.id!==e.pointerId)return;
      const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
      drag.x=e.clientX;drag.y=e.clientY;
      drag.moved+=Math.hypot(dx,dy);
      if(drag.mode==='sextant'){
        const fs=clamp(sceneCtrl.cam.sxZoom,0.005,2.5);
        slewSextant(-dx*.0022*fs,dy*.0022*fs);
      } else if(drag.mode==='pilot'){
        if(drag.moved>6){
          S.mouseSteer=[clamp((e.clientX-drag.startX)/110,-1,1),clamp(-(e.clientY-drag.startY)/110,-1,1)];
          S.mouseSteerVisual={x0:drag.startX,y0:drag.startY,x:e.clientX,y:e.clientY};
        }
      } else {
        S.camSnapActive = false;
        sceneCtrl.cam.orbitYaw+=dx*.0055;sceneCtrl.cam.orbitPitch=clamp(sceneCtrl.cam.orbitPitch+dy*.0055,-1.4,1.4);
      }
    });
    canvas.addEventListener('pointerup',endPtr);
    canvas.addEventListener('pointercancel',endPtr);
    canvas.addEventListener('lostpointercapture',endPtr);
    root.addEventListener('blur',()=>{activePtrs.clear();drag=null;pinchDist=0;S.mouseSteer=[0,0];S.mouseSteerVisual=null;});
    canvas.addEventListener('wheel',e=>{
      const rawDy=e.deltaMode===1?e.deltaY*32:(e.deltaMode===2?e.deltaY*300:e.deltaY);
      const dy=clamp(rawDy,-180,180);
      if(Math.abs(dy)>0.01)actions.zoomBy(Math.exp(dy*0.00115));
      e.preventDefault();
    },{passive:false});
  }
  let last=0, loaded=false;
  function smooth(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
  function realtimeWarp() {
    if (S.docked || S.burn?.firing) return 1;
    if (S.multiHop.harvesting || S.iceHarvest.active) {
      if (S.autoClock) {
        const durSim = (S.multiHop.harvesting && S.multiHop.harvestDurationSimS) || S.iceHarvest.durationSimS || 28800;
        return clamp(durSim / HARVEST_TARGET_REAL_S, 60, 12000);
      }
      const manW = S.timeWarp === 'hyper' ? YEAR * 2.2 : S.timeWarp === 'interstellar' ? YEAR * 0.55 : (Number(S.timeWarp) || 1);
      return Math.max(1, manW);
    }
    let warp=S.timeWarp==='hyper'?YEAR*2.2:S.timeWarp==='interstellar'?YEAR*.55:S.timeWarp;
    if(S.mode==='interstellar') {
      if (!S.mission) {
        if (S.emergencyBraking) return YEAR * 0.55;
        // Bound proper-time advancement under both automatic and explicit fast warp.
        // Start slow near rest and ramp with beta so the pilot has time to react.
        const limit = YEAR * (0.025 + 0.20 * smooth(S.beta / 0.92));
        if (S.autoClock || S.timeWarp === 'interstellar' || S.timeWarp === 'hyper') {
          warp = limit * (S.timeWarp === 'hyper' ? 1.35 : 1);
        } else if (S.thrustCmdG) warp = Math.min(warp, limit);
      }
      return Math.max(1,warp);
    }
    if (S.destroyed) return 1;
    if (S.combatAlertS > 0 && Object.values(sysCombatMap()).some(e => e && e.hostile && !e.destroyed)) return 1;
    if (S.warning?.source === 'atmo') return 1;
    if(S.burn&&S.autoWarp&&!S.burn.isBrachistochrone) {
      const rem = S.burn.remainingS || 0;
      const maxChainWarp = orbit.primary === 'star' ? 2e7 : 3e5;
      const chainWarp = rem < 45
        ? clamp(Math.max(1, rem / 10), 1, 4.5)
        : rem < 300
          ? clamp(Math.max(2, rem / 8), 2, 55)
          : clamp(Math.max(400, rem / 9), 400, maxChainWarp);
      warp=Math.max(warp,S.burn.phase==='guided'?120:S.burn.phase==='chain'?chainWarp:800);
    }
    if(S.autoClock&&!S.burn&&S.mode!=='interstellar') {
      const thrustMag=Math.abs(S.thrustCmdG),dist=stationRelative().distKm;
      if(thrustMag>.02) {
        const near=smooth(dist/50);
        if(orbit.focusSoi==='moon') {
          const farM=smooth(Math.max(0,orbit.altKm)/Math.max(400,orbit.bodyRadiusKm*2));
          warp=(4+16*near+36*farM)*clamp(thrustMag,0.35,1.8);
        } else if(orbit.focusSoi==='planet') {
          const far=smooth((dist-50)/Math.max(500,orbit.bodyRadiusKm*4));
          warp=(4+18*near+95*far)*clamp(thrustMag,0.35,1.8);
        } else {
          warp=(200+6500*smooth(orbit.el.speedKmS/120))*clamp(thrustMag,0.35,1.8);
        }
      } else if(orbit.focusSoi==='moon') {
        warp=2+12*smooth(Math.max(0,orbit.altKm)/Math.max(400,orbit.bodyRadiusKm*2.5));
      } else if(dist>50) {
        warp=orbit.focusSoi==='planet'?(1+11*smooth((dist-50)/1400)):(15+85*smooth(orbit.el.radiusKm/(0.5*O.AU_KM)));
      }
      warp=Math.max(1,warp);
    }
    return Math.max(1,warp);
  }
  function frame(now){
    const dt=last?clamp((now-last)/1000,0,.1):0;last=now;
    inFrameLoop = true; autoRcsCmd = [0, 0, 0];
    steer(dt);updateFighterCamLock(dt);
    const paced = (S.mission && (S.mission.stage === 'capture' || S.timeWarp === 'interstellar' || S.timeWarp === 'hyper' || S.autoClock)) ||
      (S.burn?.isBrachistochrone && S.autoWarp && !S.clockExplicit);
    if (paced) step(dt, dt, true, true);
    else {
      const target = realtimeWarp(), previous = Math.max(1, S.effectiveWarp);
      const snapSlow = S.docked || Boolean(S.burn?.firing);
      S.effectiveWarp = snapSlow ? 1 : Math.exp(Math.log(previous) + Math.log(target / previous) * (1 - Math.exp(-dt*7)));
      step(dt*S.effectiveWarp, dt, false, true);
    }
    inFrameLoop = false;
    updateThermal(dt);updateObservations(dt);stepCombat(dt);
    const b = S.burn;
    const flipFraction = S.mission?.stage === 'turnover' ? S.mission.stageProgress :
      b?.isBrachistochrone && b.phase === 'flip' ? (b.realS - b.legRealS) / 1.25 : null;
    const desiredFlip = S.flip ? PI : 0;
    const prevFlipRad = S.flipVisualRad || 0;
    if (S.flip && flipFraction != null) S.flipVisualRad = PI * smooth(flipFraction);
    else S.flipVisualRad += (desiredFlip - S.flipVisualRad) * (1 - Math.exp(-dt * 6));
    const flipDeltaRad = S.flipVisualRad - prevFlipRad;
    if (dt > 1e-5 && Math.abs(flipDeltaRad) > 1e-4) {
      if (S.flip && flipFraction != null) {
        recordAutoRcs((flipFraction < 0.5 ? 1 : -1) * clamp(Math.abs(flipDeltaRad / dt) / 2.2, 0.55, 1), 0);
      } else {
        const rem = desiredFlip - prevFlipRad;
        const fSign = (Math.abs(rem) > 0.45 ? 1 : -1) * Math.sign(rem || flipDeltaRad);
        recordAutoRcs(fSign * clamp(Math.abs(flipDeltaRad / dt) / 2.0, 0.35, 1), 0);
      }
    }
    for (let i = 0; i < 3; i++) {
      const tgt = autoRcsCmd[i] || 0;
      const rate = Math.abs(tgt) > Math.abs(S.autoRcsTorque[i] || 0) ? 24 : 8;
      S.autoRcsTorque[i] = (S.autoRcsTorque[i] || 0) + (tgt - (S.autoRcsTorque[i] || 0)) * (dt > 0 ? 1 - Math.exp(-dt * rate) : 1);
      if (Math.abs(S.autoRcsTorque[i]) < 0.005 && tgt === 0) S.autoRcsTorque[i] = 0;
    }
    const snap=snapshot();
    if(audioCtrl)audioCtrl.update(snap,dt);
    if(sceneCtrl){sceneCtrl.update(dt*S.effectiveWarp,dt,snap);if(!loaded){loaded=true;if(UI.setLoaded)UI.setLoaded();}snap.labels=sceneCtrl.projectLabels();}
    else if(!loaded){loaded=true;if(UI.setLoaded)UI.setLoaded();}
    saveVoyage(false);
    UI.sync(snap);drawScope();root.requestAnimationFrame(frame);
  }
  root.requestAnimationFrame(frame);
})(window);
