/**
 * LighthuggerATProto - Archive Saver/Viewer Data Engine & ATProto Lexicon /
 * OAuth 2.0 PKCE+DPoP & PDS XRPC Synchronization Module.
 *
 * UMD module exporting window.LighthuggerATProto and module.exports.
 * Pure ASCII with LF line endings.
 */
(function (root) {
  'use strict';

  var VESSEL_LEXICON_ID = 'agency.lastnpcalex.lighthugger.vessel';
  var MISSION_LEXICON_ID = 'agency.lastnpcalex.lighthugger.mission';

  var VESSEL_LEXICON = {
    lexicon: 1,
    id: VESSEL_LEXICON_ID,
    defs: {
      main: {
        type: 'record',
        description: 'Persistent Lighthugger voidship blueprint and structural genome record.',
        key: 'tid',
        record: {
          type: 'object',
          required: ['name', 'shareCode', 'seed', 'createdAt'],
          properties: {
            name: { type: 'string', maxLength: 128 },
            shareCode: { type: 'string' },
            seed: { type: 'integer' },
            createdAt: { type: 'string', format: 'datetime' },
            hull: {
              type: 'object',
              properties: {
                shape: { type: 'string' },
                aft: { type: 'string' },
                pod: { type: 'string' },
                arch: { type: 'string' },
                totalM: { type: 'number' },
                beamM: { type: 'number' },
                iceMt: { type: 'number' },
                iceCoverage: { type: 'number' },
                iceThick: { type: 'number' },
                shuttlePorts: { type: 'integer' },
                fins: { type: 'integer' },
                habRing: { type: 'boolean' },
                iceSymmetry: { type: 'string' },
                portPlacement: { type: 'string' }
              }
            },
            styles: {
              type: 'object',
              description: 'Visual style breakdown percentages (0..100)',
              properties: {
                gnostic: { type: 'number' },
                gothic: { type: 'number' },
                sleek: { type: 'number' },
                giger: { type: 'number' },
                coade: { type: 'number' },
                dune: { type: 'number' },
                cathedral: { type: 'number' }
              }
            },
            conjoiner: {
              type: 'object',
              description: 'Lore-accurate Conjoiner quantum-vacuum reactionless drive telemetry',
              properties: {
                accelG: { type: 'number' },
                exhaustVelC: { type: 'number' },
                reactionless: { type: 'boolean' },
                coreRatingGW: { type: 'number' },
                radiatorMW: { type: 'number' }
              }
            },
            notes: { type: 'string', maxLength: 2000 },
            tags: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        }
      }
    }
  };

  var MISSION_LEXICON = {
    lexicon: 1,
    id: MISSION_LEXICON_ID,
    defs: {
      main: {
        type: 'record',
        description: 'Relativistic interstellar voyage mission snapshot and state chronicle.',
        key: 'tid',
        record: {
          type: 'object',
          required: ['title', 'systemId', 'systemName', 'epochYear', 'properTauYears', 'createdAt'],
          properties: {
            title: { type: 'string', maxLength: 128 },
            systemId: { type: 'string' },
            systemName: { type: 'string' },
            epochYear: { type: 'number' },
            properTauYears: { type: 'number' },
            beta: { type: 'number' },
            gamma: { type: 'number' },
            iceIntegrity: { type: 'number' },
            coreHeat: { type: 'number' },
            vesselShareCode: { type: 'string' },
            vesselName: { type: 'string' },
            snapshot: { type: 'object' },
            createdAt: { type: 'string', format: 'datetime' },
            notes: { type: 'string', maxLength: 2000 }
          }
        }
      }
    }
  };

  var LEXICONS = {};
  LEXICONS[VESSEL_LEXICON_ID] = VESSEL_LEXICON;
  LEXICONS[MISSION_LEXICON_ID] = MISSION_LEXICON;
  LEXICONS.vessel = VESSEL_LEXICON;
  LEXICONS.mission = MISSION_LEXICON;

  var VESSELS_STORAGE_KEY = 'lh.archive.vessels.v1';
  var MISSIONS_STORAGE_KEY = 'lh.archive.missions.v1';
  var ATPROTO_STORAGE_KEY = 'lh.archive.atproto.v1';
  var LEGACY_FLEET_KEY = 'lighthugger.fleet.v3';
  var LEGACY_KEYS = ['lighthugger.fleet.v2', 'lighthugger.fleet.v1'];

  var memoryStore = {};

  function storageGet(k) {
    try {
      if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.getItem === 'function') {
        var v = localStorage.getItem(k);
        if (v !== null) return v;
      }
    } catch (e) {}
    return Object.prototype.hasOwnProperty.call(memoryStore, k) ? memoryStore[k] : null;
  }

  function storageSet(k, v) {
    var str = String(v);
    try {
      if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.setItem === 'function') {
        localStorage.setItem(k, str);
      }
    } catch (e) {}
    memoryStore[k] = str;
  }

  function storageRemove(k) {
    try {
      if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.removeItem === 'function') {
        localStorage.removeItem(k);
      }
    } catch (e) {}
    delete memoryStore[k];
  }

  var S32_CHAR = '234567abcdefghijklmnopqrstuvwxyz';
  var lastTidTime = 0;
  var lastTidClockId = Math.floor(Math.random() * 1024);

  function generateTid() {
    var now = Date.now() * 1000;
    if (now <= lastTidTime) {
      now = lastTidTime + 1;
    }
    lastTidTime = now;
    var timePart = '';
    var t = now;
    for (var i = 0; i < 11; i++) {
      timePart = S32_CHAR.charAt(t % 32) + timePart;
      t = Math.floor(t / 32);
    }
    var c = lastTidClockId;
    var clockPart = S32_CHAR.charAt(Math.floor(c / 32) % 32) + S32_CHAR.charAt(c % 32);
    return timePart + clockPart;
  }

  function generateId(prefix) {
    return (prefix ? prefix + '_' : '') + generateTid();
  }

  function base64UrlEncode(input) {
    var binary = '';
    if (typeof input === 'string') {
      var bytes = new TextEncoder().encode(input);
      for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    } else if (input instanceof Uint8Array) {
      for (var j = 0; j < input.length; j++) binary += String.fromCharCode(input[j]);
    } else if (input instanceof ArrayBuffer) {
      var u8 = new Uint8Array(input);
      for (var k = 0; k < u8.length; k++) binary += String.fromCharCode(u8[k]);
    } else {
      binary = String(input || '');
    }
    var b64;
    if (typeof btoa === 'function') {
      b64 = btoa(binary);
    } else if (typeof Buffer !== 'undefined') {
      b64 = Buffer.from(binary, 'binary').toString('base64');
    } else {
      throw new Error('No base64 encoder available');
    }
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function base64UrlDecode(str) {
    var b64 = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var binary;
    if (typeof atob === 'function') {
      binary = atob(b64);
    } else if (typeof Buffer !== 'undefined') {
      binary = Buffer.from(b64, 'base64').toString('binary');
    } else {
      throw new Error('No base64 decoder available');
    }
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function getSubtleCrypto() {
    if (typeof crypto !== 'undefined' && crypto) {
      if (crypto.subtle) return crypto.subtle;
      if (crypto.webcrypto && crypto.webcrypto.subtle) return crypto.webcrypto.subtle;
    }
    if (typeof globalThis !== 'undefined' && globalThis.crypto) {
      if (globalThis.crypto.subtle) return globalThis.crypto.subtle;
      if (globalThis.crypto.webcrypto && globalThis.crypto.webcrypto.subtle) return globalThis.crypto.webcrypto.subtle;
    }
    return null;
  }

  function extractStyles(P) {
    P = P || {};
    return {
      gnostic: Math.round(Number(P.styleGnostic || 0) * 100),
      gothic: Math.round(Number(P.styleGothic || 0) * 100),
      sleek: Math.round(Number(P.styleSleek || 0) * 100),
      giger: Math.round(Number(P.styleGiger || 0) * 100),
      coade: Math.round(Number(P.styleCoade || 0) * 100),
      dune: Math.round(Number(P.styleDune || 0) * 100),
      cathedral: Math.round(Number(P.styleCathedral || 0) * 100)
    };
  }

  function extractConjoiner(specs, P) {
    specs = specs || {};
    P = P || {};
    return {
      accelG: Number((specs.maxAccelG != null ? specs.maxAccelG : 1.4).toFixed(2)),
      exhaustVelC: Number((specs.exhaustVelC != null ? specs.exhaustVelC : 0.86).toFixed(2)),
      reactionless: true,
      coreRatingGW: Number((specs.coreRatingGW != null ? specs.coreRatingGW : (120 + (P.nacelleSize || 0.5) * 80)).toFixed(1)),
      radiatorMW: Number((specs.radiatorMW != null ? specs.radiatorMW : (400 + (P.styleCoade || 0) * 350)).toFixed(1))
    };
  }

  function extractHull(specs, P) {
    specs = specs || {};
    P = P || {};
    return {
      shape: P.hullShape || 'long-patience',
      aft: P.aftShape || 'long-patience-aft',
      pod: P.podStyle || 'conjoiner-spike',
      arch: P.arch || 'twin-h',
      totalM: specs.totalM || 2400,
      beamM: specs.beamM || 430,
      iceMt: Number((specs.iceMt != null ? specs.iceMt : 1.2).toFixed(2)),
      iceCoverage: Number((P.iceCoverage != null ? P.iceCoverage : 1.0).toFixed(2)),
      iceThick: Number((P.iceThick != null ? P.iceThick : 0.36).toFixed(2)),
      shuttlePorts: P.shuttlePorts != null ? P.shuttlePorts : 4,
      fins: P.fins != null ? P.fins : 0,
      habRing: !!P.habRing,
      iceSymmetry: P.iceSymmetry || 'fore',
      portPlacement: P.portPlacement || 'aft-hull'
    };
  }

  function buildVesselRecord(entry, genomeModule) {
    var G = genomeModule || globalThis.LighthuggerGenome;
    var genome = null;
    var name = 'Unnamed Vessel';
    var notes = '';
    var tags = [];
    var createdAt = new Date().toISOString();
    var shareCode = '';

    if (typeof entry === 'string') {
      shareCode = entry.trim();
      if (G && typeof G.decodeShareCode === 'function') {
        try { genome = G.decodeShareCode(shareCode); } catch (e) {}
      }
    } else if (entry && typeof entry === 'object') {
      if (entry.genome) {
        genome = entry.genome;
        name = entry.name || (genome && genome.name) || name;
        notes = entry.notes || '';
        tags = Array.isArray(entry.tags) ? entry.tags.slice() : [];
        createdAt = entry.createdAt || createdAt;
        shareCode = entry.shareCode || '';
      } else if (entry.P && entry.seed != null) {
        genome = entry;
        name = entry.name || name;
      } else if (entry.name && entry.shareCode) {
        name = entry.name;
        shareCode = entry.shareCode;
        notes = entry.notes || '';
        tags = Array.isArray(entry.tags) ? entry.tags.slice() : [];
        createdAt = entry.createdAt || createdAt;
        if (G && typeof G.decodeShareCode === 'function') {
          try { genome = G.decodeShareCode(shareCode); } catch (e) {}
        }
      }
    }

    if (genome && G && typeof G.normalize === 'function') {
      genome = G.normalize(genome);
    }
    if (genome && !shareCode && G && typeof G.encodeShareCode === 'function') {
      try { shareCode = G.encodeShareCode(genome); } catch (e) {}
    }

    var P = (genome && genome.P) || {};
    var seed = genome ? (genome.seed || 6202) : 6202;
    if (genome && genome.name) name = genome.name;

    var specs = null;
    if (genome && G && typeof G.computeSpecs === 'function') {
      try { specs = G.computeSpecs(genome); } catch (e) {}
    }
    var rocketSpecs = null;
    if (genome && G && typeof G.computeRocketSpecs === 'function') {
      try { rocketSpecs = G.computeRocketSpecs(genome); } catch (e) {}
    }

    var record = {
      $type: VESSEL_LEXICON_ID,
      name: name,
      shareCode: shareCode || 'LH3-',
      seed: seed,
      createdAt: createdAt,
      hull: extractHull(specs, P),
      styles: extractStyles(P),
      conjoiner: extractConjoiner(rocketSpecs, P),
      notes: notes,
      tags: tags
    };

    return record;
  }

  function buildMissionRecord(snapshotEntry, genomeModule) {
    var G = genomeModule || globalThis.LighthuggerGenome;
    var snap = snapshotEntry || {};
    var state = snap.state || snap.snapshot || snap;
    var title = snap.title || snap.name || (state && state.title) || 'Voyage Snapshot';
    var systemId = snap.systemId || (state && (state.currentSystemId || state.systemId)) || 'sol';
    var systemName = snap.systemName || (state && (state.currentSystemName || state.systemName)) || 'Sol';
    var epochYear = Number(snap.epochYear != null ? snap.epochYear : (state && state.epochYear != null ? state.epochYear : 2600));
    var properTauYears = Number(snap.properTauYears != null ? snap.properTauYears : (state && (state.properTauYears != null ? state.properTauYears : (state.shipTauYears != null ? state.shipTauYears : 0))));
    var beta = Number(snap.beta != null ? snap.beta : (state && state.beta != null ? state.beta : 0));
    var gamma = Number(snap.gamma != null ? snap.gamma : (state && state.gamma != null ? state.gamma : 1));
    var iceIntegrity = Number(snap.iceIntegrity != null ? snap.iceIntegrity : (state && state.iceIntegrity != null ? state.iceIntegrity : 1));
    var coreHeat = Number(snap.coreHeat != null ? snap.coreHeat : (state && state.coreHeat != null ? state.coreHeat : 0));
    var notes = snap.notes || '';
    var createdAt = snap.createdAt || new Date().toISOString();

    var vesselShareCode = snap.vesselShareCode || '';
    var vesselName = snap.vesselName || '';

    if (!vesselShareCode && (snap.genome || (state && state.genome)) && G && typeof G.encodeShareCode === 'function') {
      try { vesselShareCode = G.encodeShareCode(snap.genome || state.genome); } catch (e) {}
    }
    if (!vesselName && (snap.genome || (state && state.genome))) {
      var gm = snap.genome || state.genome;
      vesselName = gm.name || 'Lighthugger';
    }

    return {
      $type: MISSION_LEXICON_ID,
      title: title,
      systemId: systemId,
      systemName: systemName,
      epochYear: epochYear,
      properTauYears: properTauYears,
      beta: beta,
      gamma: gamma,
      iceIntegrity: iceIntegrity,
      coreHeat: coreHeat,
      vesselShareCode: vesselShareCode,
      vesselName: vesselName,
      snapshot: state,
      createdAt: createdAt,
      notes: notes
    };
  }

  function validateVesselRecord(rec) {
    var errors = [];
    if (!rec || typeof rec !== 'object') {
      return { valid: false, errors: ['Record must be a non-null object'] };
    }
    if (rec.$type && rec.$type !== VESSEL_LEXICON_ID) {
      errors.push('Invalid $type: expected ' + VESSEL_LEXICON_ID);
    }
    if (!rec.name || typeof rec.name !== 'string' || rec.name.trim().length === 0) {
      errors.push('Missing or empty name');
    }
    if (!rec.shareCode || typeof rec.shareCode !== 'string' || !/^(LH3-|LH2-|LH1-)/.test(rec.shareCode)) {
      errors.push('Invalid shareCode: must start with LH3-, LH2-, or LH1-');
    }
    if (!Number.isFinite(Number(rec.seed))) {
      errors.push('Invalid seed: must be a finite number');
    }
    if (!rec.createdAt || typeof rec.createdAt !== 'string' || isNaN(Date.parse(rec.createdAt))) {
      errors.push('Invalid createdAt: must be an ISO datetime string');
    }
    return { valid: errors.length === 0, errors: errors };
  }

  function validateMissionRecord(rec) {
    var errors = [];
    if (!rec || typeof rec !== 'object') {
      return { valid: false, errors: ['Record must be a non-null object'] };
    }
    if (rec.$type && rec.$type !== MISSION_LEXICON_ID) {
      errors.push('Invalid $type: expected ' + MISSION_LEXICON_ID);
    }
    if (!rec.title || typeof rec.title !== 'string' || rec.title.trim().length === 0) {
      errors.push('Missing or empty title');
    }
    if (!rec.systemId || typeof rec.systemId !== 'string') {
      errors.push('Missing systemId');
    }
    if (!rec.systemName || typeof rec.systemName !== 'string') {
      errors.push('Missing systemName');
    }
    if (!Number.isFinite(Number(rec.epochYear))) {
      errors.push('Invalid epochYear');
    }
    if (!Number.isFinite(Number(rec.properTauYears))) {
      errors.push('Invalid properTauYears');
    }
    if (!rec.createdAt || typeof rec.createdAt !== 'string' || isNaN(Date.parse(rec.createdAt))) {
      errors.push('Invalid createdAt: must be an ISO datetime string');
    }
    return { valid: errors.length === 0, errors: errors };
  }

  function buildCreateRecordEnvelope(opts) {
    opts = opts || {};
    var record = opts.record || {};
    var collection = opts.collection || record.$type || VESSEL_LEXICON_ID;
    var rkey = opts.rkey || generateTid();
    var repoDid = opts.repoDid || 'did:plc:example';
    return {
      repo: repoDid,
      collection: collection,
      rkey: rkey,
      record: record
    };
  }

  function listVessels() {
    var raw = storageGet(VESSELS_STORAGE_KEY);
    if (!raw) {
      var legacyRaw = storageGet(LEGACY_FLEET_KEY);
      if (!legacyRaw) {
        for (var i = 0; i < LEGACY_KEYS.length; i++) {
          legacyRaw = storageGet(LEGACY_KEYS[i]);
          if (legacyRaw) break;
        }
      }
      if (legacyRaw) {
        try {
          var fleet = JSON.parse(legacyRaw);
          if (Array.isArray(fleet) && fleet.length > 0) {
            var G = globalThis.LighthuggerGenome;
            var migrated = fleet.map(function (item, idx) {
              var g = (G && typeof G.normalize === 'function') ? G.normalize(item) : item;
              var sc = (G && typeof G.encodeShareCode === 'function') ? G.encodeShareCode(g) : '';
              return {
                id: 'ves_' + (item.seed || (1000 + idx)) + '_' + generateTid(),
                name: (item && item.name) || ('Fleet Vessel ' + (idx + 1)),
                genome: g,
                shareCode: sc,
                notes: 'Migrated from Fleet Vault v3',
                tags: ['migrated', 'fleet-v3'],
                origin: 'migrated-fleet-v3',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                sync: { staged: false, syncedAt: null, uri: null, cid: null }
              };
            });
            storageSet(VESSELS_STORAGE_KEY, JSON.stringify(migrated));
            return migrated;
          }
        } catch (e) {}
      }
      return [];
    }
    try {
      var list = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function saveVessel(opts) {
    opts = opts || {};
    var vessels = listVessels();
    var G = globalThis.LighthuggerGenome;
    var genome = opts.genome || null;
    if (genome && G && typeof G.normalize === 'function') {
      genome = G.normalize(genome);
    }
    var shareCode = opts.shareCode || '';
    if (genome && !shareCode && G && typeof G.encodeShareCode === 'function') {
      try { shareCode = G.encodeShareCode(genome); } catch (e) {}
    }
    var name = opts.name || (genome && genome.name) || 'Unnamed Vessel';
    var id = opts.id || generateId('ves');

    var idx = vessels.findIndex(function (v) { return v.id === id; });
    var existing = idx >= 0 ? vessels[idx] : null;

    var entry = {
      id: id,
      name: name,
      genome: genome || (existing ? existing.genome : null),
      shareCode: shareCode || (existing ? existing.shareCode : ''),
      notes: opts.notes != null ? opts.notes : (existing ? existing.notes : ''),
      tags: Array.isArray(opts.tags) ? opts.tags.slice() : (existing ? existing.tags.slice() : []),
      origin: opts.origin || (existing ? existing.origin : 'local'),
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sync: existing ? existing.sync : { staged: false, syncedAt: null, uri: null, cid: null }
    };

    if (idx >= 0) {
      vessels[idx] = entry;
    } else {
      vessels.push(entry);
    }
    storageSet(VESSELS_STORAGE_KEY, JSON.stringify(vessels));
    return entry;
  }

  function cloneVessel(id) {
    var vessels = listVessels();
    var vessel = vessels.find(function (v) { return v.id === id; });
    if (!vessel) return null;
    var cloned = saveVessel({
      name: vessel.name + ' (Copy)',
      genome: vessel.genome,
      shareCode: vessel.shareCode,
      notes: vessel.notes,
      tags: (vessel.tags || []).slice(),
      origin: 'clone'
    });
    return cloned;
  }

  function deleteVessel(id) {
    var vessels = listVessels();
    var initialLen = vessels.length;
    var filtered = vessels.filter(function (v) { return v.id !== id; });
    if (filtered.length !== initialLen) {
      storageSet(VESSELS_STORAGE_KEY, JSON.stringify(filtered));
      clearOutboxItem(id);
      return true;
    }
    return false;
  }

  function listMissions() {
    var raw = storageGet(MISSIONS_STORAGE_KEY);
    if (!raw) return [];
    try {
      var list = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function saveMission(opts) {
    opts = opts || {};
    var missions = listMissions();
    var id = opts.id || generateId('mis');
    var idx = missions.findIndex(function (m) { return m.id === id; });
    var existing = idx >= 0 ? missions[idx] : null;

    var entry = {
      id: id,
      name: opts.name || (opts.state && opts.state.title) || 'Voyage Snapshot',
      state: opts.state || (existing ? existing.state : {}),
      notes: opts.notes != null ? opts.notes : (existing ? existing.notes : ''),
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sync: existing ? existing.sync : { staged: false, syncedAt: null, uri: null, cid: null }
    };

    if (idx >= 0) {
      missions[idx] = entry;
    } else {
      missions.push(entry);
    }
    storageSet(MISSIONS_STORAGE_KEY, JSON.stringify(missions));
    return entry;
  }

  function deleteMission(id) {
    var missions = listMissions();
    var initialLen = missions.length;
    var filtered = missions.filter(function (m) { return m.id !== id; });
    if (filtered.length !== initialLen) {
      storageSet(MISSIONS_STORAGE_KEY, JSON.stringify(filtered));
      clearOutboxItem(id);
      return true;
    }
    return false;
  }

  function exportArchiveBundle() {
    var bundle = {
      format: 'lighthugger-archive-v1',
      exportedAt: new Date().toISOString(),
      vessels: listVessels(),
      missions: listMissions(),
      lexicons: [VESSEL_LEXICON, MISSION_LEXICON]
    };
    return JSON.stringify(bundle, null, 2);
  }

  function importArchiveBundle(jsonTextOrObj, genomeModule) {
    var G = genomeModule || globalThis.LighthuggerGenome;
    var vCount = 0;
    var mCount = 0;

    try {
      if (typeof jsonTextOrObj === 'string') {
        var trimmed = jsonTextOrObj.trim();
        if (/^(LH3-|LH2-|LH1-)/.test(trimmed)) {
          if (!G || typeof G.decodeShareCode !== 'function') {
            return { ok: false, importedVessels: 0, importedMissions: 0, msg: 'Genome module required to decode share code' };
          }
          var decoded = G.decodeShareCode(trimmed);
          var entry = saveVessel({
            name: decoded.name || 'Imported Share Code',
            genome: decoded,
            shareCode: trimmed,
            origin: 'share-code'
          });
          return { ok: true, importedVessels: 1, importedMissions: 0, msg: 'Imported vessel ' + entry.name };
        }
        jsonTextOrObj = JSON.parse(trimmed);
      }

      if (!jsonTextOrObj || typeof jsonTextOrObj !== 'object') {
        return { ok: false, importedVessels: 0, importedMissions: 0, msg: 'Invalid JSON payload' };
      }

      if (jsonTextOrObj.$type === VESSEL_LEXICON_ID || (jsonTextOrObj.shareCode && jsonTextOrObj.hull)) {
        var gVessel = null;
        if (jsonTextOrObj.shareCode && G && typeof G.decodeShareCode === 'function') {
          try { gVessel = G.decodeShareCode(jsonTextOrObj.shareCode); } catch (e) {}
        }
        var sv = saveVessel({
          name: jsonTextOrObj.name || (gVessel && gVessel.name) || 'Imported ATProto Vessel',
          genome: gVessel,
          shareCode: jsonTextOrObj.shareCode,
          notes: jsonTextOrObj.notes || '',
          tags: jsonTextOrObj.tags || ['atproto'],
          origin: 'atproto-record'
        });
        return { ok: true, importedVessels: 1, importedMissions: 0, msg: 'Imported ATProto vessel ' + sv.name };
      }

      if (jsonTextOrObj.$type === MISSION_LEXICON_ID) {
        var sm = saveMission({
          name: jsonTextOrObj.title || 'Imported ATProto Mission',
          state: jsonTextOrObj.snapshot || {},
          notes: jsonTextOrObj.notes || ''
        });
        return { ok: true, importedVessels: 0, importedMissions: 1, msg: 'Imported ATProto mission ' + sm.name };
      }

      if (jsonTextOrObj.format === 'lighthugger-archive-v1' || Array.isArray(jsonTextOrObj.vessels) || Array.isArray(jsonTextOrObj.missions)) {
        var vList = Array.isArray(jsonTextOrObj.vessels) ? jsonTextOrObj.vessels : [];
        var mList = Array.isArray(jsonTextOrObj.missions) ? jsonTextOrObj.missions : [];
        var currentVessels = listVessels();
        var currentMissions = listMissions();

        for (var i = 0; i < vList.length; i++) {
          var item = vList[i];
          if (!item || !item.name) continue;
          var matchV = currentVessels.find(function (cv) {
            return cv.id === item.id || (item.shareCode && cv.shareCode === item.shareCode);
          });
          if (!matchV) {
            saveVessel({
              id: item.id || generateId('ves'),
              name: item.name,
              genome: item.genome,
              shareCode: item.shareCode,
              notes: item.notes,
              tags: item.tags,
              origin: item.origin || 'bundle-import'
            });
            vCount++;
          }
        }

        for (var j = 0; j < mList.length; j++) {
          var mItem = mList[j];
          if (!mItem) continue;
          var matchM = currentMissions.find(function (cm) { return cm.id === mItem.id; });
          if (!matchM) {
            saveMission({
              id: mItem.id || generateId('mis'),
              name: mItem.name || 'Imported Voyage',
              state: mItem.state || {},
              notes: mItem.notes || ''
            });
            mCount++;
          }
        }

        return {
          ok: true,
          importedVessels: vCount,
          importedMissions: mCount,
          msg: 'Merged ' + vCount + ' vessel(s) and ' + mCount + ' mission(s)'
        };
      }

      if (jsonTextOrObj.P && jsonTextOrObj.seed != null) {
        var singleVessel = saveVessel({
          name: jsonTextOrObj.name || 'Imported Genome',
          genome: jsonTextOrObj,
          origin: 'genome-json'
        });
        return { ok: true, importedVessels: 1, importedMissions: 0, msg: 'Imported vessel ' + singleVessel.name };
      }

      return { ok: false, importedVessels: 0, importedMissions: 0, msg: 'Unrecognized archive format' };
    } catch (err) {
      return { ok: false, importedVessels: 0, importedMissions: 0, msg: err.message || String(err) };
    }
  }

  function getOutboxRaw() {
    var raw = storageGet(ATPROTO_STORAGE_KEY);
    if (!raw) return [];
    try {
      var data = JSON.parse(raw);
      return Array.isArray(data.outbox) ? data.outbox : [];
    } catch (e) {
      return [];
    }
  }

  function setOutboxRaw(outbox) {
    var raw = storageGet(ATPROTO_STORAGE_KEY);
    var data = {};
    if (raw) {
      try { data = JSON.parse(raw); } catch (e) {}
    }
    data.outbox = outbox;
    storageSet(ATPROTO_STORAGE_KEY, JSON.stringify(data));
  }

  function listOutbox() {
    var outbox = getOutboxRaw();
    var vessels = listVessels();
    var missions = listMissions();
    var G = globalThis.LighthuggerGenome;
    return outbox.map(function (item) {
      var record = null;
      var envelope = null;
      if (item.kind === 'vessel') {
        var v = vessels.find(function (x) { return x.id === item.id; });
        if (v) {
          record = buildVesselRecord(v, G);
          envelope = buildCreateRecordEnvelope({ record: record });
        }
      } else if (item.kind === 'mission') {
        var m = missions.find(function (x) { return x.id === item.id; });
        if (m) {
          record = buildMissionRecord(m, G);
          envelope = buildCreateRecordEnvelope({ record: record });
        }
      }
      return {
        id: item.id,
        kind: item.kind,
        stagedAt: item.stagedAt,
        record: record,
        envelope: envelope
      };
    });
  }

  function stageForSync(kind, id) {
    if (kind !== 'vessel' && kind !== 'mission') {
      throw new Error('Sync kind must be "vessel" or "mission"');
    }
    var outbox = getOutboxRaw();
    var existingIdx = outbox.findIndex(function (item) { return item.id === id; });
    var item = {
      id: id,
      kind: kind,
      stagedAt: new Date().toISOString()
    };
    if (existingIdx >= 0) {
      outbox[existingIdx] = item;
    } else {
      outbox.push(item);
    }
    setOutboxRaw(outbox);
    updateItemSync(kind, id, { staged: true });
    return item;
  }

  function clearOutboxItem(id) {
    var outbox = getOutboxRaw();
    var initialLen = outbox.length;
    var filtered = outbox.filter(function (item) { return item.id !== id; });
    if (filtered.length !== initialLen) {
      setOutboxRaw(filtered);
      return true;
    }
    return false;
  }

  function updateItemSync(kind, id, syncPatch) {
    if (kind === 'vessel') {
      var vessels = listVessels();
      var idx = vessels.findIndex(function (v) { return v.id === id; });
      if (idx >= 0) {
        vessels[idx].sync = Object.assign({}, vessels[idx].sync || {}, syncPatch);
        storageSet(VESSELS_STORAGE_KEY, JSON.stringify(vessels));
      }
    } else if (kind === 'mission') {
      var missions = listMissions();
      var mIdx = missions.findIndex(function (m) { return m.id === id; });
      if (mIdx >= 0) {
        missions[mIdx].sync = Object.assign({}, missions[mIdx].sync || {}, syncPatch);
        storageSet(MISSIONS_STORAGE_KEY, JSON.stringify(missions));
      }
    }
  }

  var customClientMetadataUrl = null;
  function setClientMetadataUrl(url) {
    customClientMetadataUrl = url ? String(url) : null;
  }
  function getClientMetadataUrl() {
    return customClientMetadataUrl || 'https://lastnpcalex.agency/oauth/client-metadata.json';
  }

  function getSession() {
    var raw = storageGet(ATPROTO_STORAGE_KEY);
    if (!raw) return null;
    try {
      var data = JSON.parse(raw);
      return data.session || null;
    } catch (e) {
      return null;
    }
  }

  function saveSession(session) {
    var raw = storageGet(ATPROTO_STORAGE_KEY);
    var data = {};
    if (raw) {
      try { data = JSON.parse(raw); } catch (e) {}
    }
    data.session = session;
    storageSet(ATPROTO_STORAGE_KEY, JSON.stringify(data));
  }

  function disconnectSession() {
    var raw = storageGet(ATPROTO_STORAGE_KEY);
    var data = {};
    if (raw) {
      try { data = JSON.parse(raw); } catch (e) {}
    }
    delete data.session;
    storageSet(ATPROTO_STORAGE_KEY, JSON.stringify(data));
    return { ok: true, msg: 'Disconnected from ATProto PDS.' };
  }

  function getEnvironmentStatus() {
    var isBrowser = typeof window !== 'undefined';
    var loc = isBrowser && window.location ? window.location : null;
    var origin = loc ? loc.origin : '';
    var protocol = loc ? loc.protocol : '';
    var isIframe = isBrowser ? (window.self !== window.top) : false;
    var isSecure = isBrowser ? (typeof window.isSecureContext === 'boolean' ? window.isSecureContext : (protocol === 'https:')) : false;
    var hasCrypto = !!getSubtleCrypto();
    var onLine = (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') ? navigator.onLine : true;
    var metadataUrl = getClientMetadataUrl();

    var canRunOAuthRedirect = Boolean(isBrowser && !isIframe && protocol === 'https:' && hasCrypto && isSecure);
    var sandboxedCanvas = Boolean(isIframe || protocol === 'file:' || (origin && (origin.indexOf('localhost') >= 0 || origin.indexOf('127.0.0.1') >= 0)));

    var reason = '';
    if (!isBrowser) {
      reason = 'Running in Node.js headless environment; HTTP XRPC and WebCrypto active.';
    } else if (isIframe) {
      reason = 'Running inside iframe/Canvas sandbox; top-level OAuth redirect flow is restricted. Direct PDS App Password or XRPC token auth available.';
    } else if (protocol === 'file:' || (origin && (origin.indexOf('localhost') >= 0 || origin.indexOf('127.0.0.1') >= 0))) {
      reason = 'Running on local/file origin; public OAuth client metadata requires hosted HTTPS origin (lastnpcalex.agency). Direct PDS App Password available.';
    } else if (canRunOAuthRedirect) {
      reason = 'Ready for ATProto OAuth redirect flow and PDS XRPC synchronization.';
    } else {
      reason = 'Environment does not meet ATProto OAuth redirect requirements.';
    }

    var sess = getSession();

    return {
      canRunOAuthRedirect: canRunOAuthRedirect,
      sandboxedCanvas: sandboxedCanvas,
      reason: reason,
      handle: sess ? sess.handle : null,
      did: sess ? sess.did : null,
      pdsUrl: sess ? sess.pdsUrl : null,
      authMode: sess ? sess.authMode : null,
      origin: origin,
      protocol: protocol,
      isIframe: isIframe,
      isSecureContext: isSecure,
      hasCrypto: hasCrypto,
      onLine: onLine,
      clientMetadataUrl: metadataUrl
    };
  }

  async function generatePkcePair() {
    var subtle = getSubtleCrypto();
    if (!subtle) {
      throw new Error('WebCrypto SubtleCrypto is required for S256 PKCE generation');
    }
    var randomBytes = new Uint8Array(32);
    if (typeof crypto !== 'undefined' && crypto && crypto.getRandomValues) {
      crypto.getRandomValues(randomBytes);
    } else {
      var nodeCrypto = null;
      try { nodeCrypto = require('crypto'); } catch (e) {}
      if (nodeCrypto && nodeCrypto.randomFillSync) {
        nodeCrypto.randomFillSync(randomBytes);
      } else {
        for (var i = 0; i < 32; i++) randomBytes[i] = Math.floor(Math.random() * 256);
      }
    }
    var verifier = base64UrlEncode(randomBytes);
    var verifierBuffer = new TextEncoder().encode(verifier);
    var hashBuffer = await subtle.digest('SHA-256', verifierBuffer);
    var challenge = base64UrlEncode(hashBuffer);
    return {
      verifier: verifier,
      challenge: challenge,
      method: 'S256'
    };
  }

  async function generateDpopKeypair() {
    var subtle = getSubtleCrypto();
    if (!subtle) {
      throw new Error('WebCrypto SubtleCrypto is required for DPoP key generation');
    }
    var keypair = await subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
    var jwk = await subtle.exportKey('jwk', keypair.publicKey);
    var cleanJwk = {
      kty: 'EC',
      crv: 'P-256',
      x: jwk.x,
      y: jwk.y
    };
    var canonicalJwkJson = JSON.stringify({
      crv: 'P-256',
      kty: 'EC',
      x: jwk.x,
      y: jwk.y
    });
    var thumbprintBuffer = await subtle.digest('SHA-256', new TextEncoder().encode(canonicalJwkJson));
    var thumbprint = base64UrlEncode(thumbprintBuffer);
    return {
      keypair: keypair,
      publicKeyJwk: cleanJwk,
      thumbprint: thumbprint
    };
  }

  async function createDpopProof(opts) {
    opts = opts || {};
    var subtle = getSubtleCrypto();
    if (!subtle) {
      throw new Error('WebCrypto SubtleCrypto is required for DPoP proof generation');
    }
    var keypair = opts.keypair;
    var publicKeyJwk = opts.publicKeyJwk;
    if (!keypair || !keypair.privateKey) {
      var generated = await generateDpopKeypair();
      keypair = generated.keypair;
      publicKeyJwk = generated.publicKeyJwk;
    } else if (!publicKeyJwk) {
      var exported = await subtle.exportKey('jwk', keypair.publicKey);
      publicKeyJwk = { kty: 'EC', crv: 'P-256', x: exported.x, y: exported.y };
    }

    var header = {
      typ: 'dpop+jwt',
      alg: 'ES256',
      jwk: {
        kty: 'EC',
        crv: 'P-256',
        x: publicKeyJwk.x,
        y: publicKeyJwk.y
      }
    };

    var method = String(opts.method || 'GET').toUpperCase();
    var fullUrl = String(opts.url || '');
    var htu = fullUrl.split('?')[0].split('#')[0];

    var payload = {
      jti: generateId('jti'),
      htm: method,
      htu: htu,
      iat: Math.floor(Date.now() / 1000)
    };

    if (opts.nonce) {
      payload.nonce = String(opts.nonce);
    }

    if (opts.accessToken) {
      var athBuffer = await subtle.digest('SHA-256', new TextEncoder().encode(String(opts.accessToken)));
      payload.ath = base64UrlEncode(athBuffer);
    }

    var encodedHeader = base64UrlEncode(JSON.stringify(header));
    var encodedPayload = base64UrlEncode(JSON.stringify(payload));
    var signingInput = encodedHeader + '.' + encodedPayload;

    var sigBuffer = await subtle.sign(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      keypair.privateKey,
      new TextEncoder().encode(signingInput)
    );

    var encodedSig = base64UrlEncode(sigBuffer);
    return signingInput + '.' + encodedSig;
  }

  async function resolveHandle(handle, pdsHint) {
    try {
      if (!handle || typeof handle !== 'string') {
        return { ok: false, error: 'Handle or DID string is required', hint: 'Provide a valid handle (e.g. user.bsky.social) or DID.' };
      }
      var cleanHandle = handle.trim().replace(/^@/, '');
      if (cleanHandle.indexOf('did:') === 0) {
        var did = cleanHandle;
        var pdsUrl = pdsHint || null;
        if (did.indexOf('did:plc:') === 0) {
          try {
            var plcRes = await fetch('https://plc.directory/' + encodeURIComponent(did));
            if (plcRes.ok) {
              var plcData = await plcRes.json();
              if (Array.isArray(plcData.service)) {
                for (var i = 0; i < plcData.service.length; i++) {
                  if (plcData.service[i].id === '#atproto_pds' || plcData.service[i].type === 'AtprotoPersonalDataServer') {
                    pdsUrl = plcData.service[i].serviceEndpoint;
                    break;
                  }
                }
              }
            }
          } catch (e) {}
        } else if (did.indexOf('did:web:') === 0) {
          try {
            var host = did.slice(8).replace(/:/g, '/');
            var webRes = await fetch('https://' + host + '/.well-known/did.json');
            if (webRes.ok) {
              var webData = await webRes.json();
              if (Array.isArray(webData.service)) {
                for (var j = 0; j < webData.service.length; j++) {
                  if (webData.service[j].id === '#atproto_pds' || webData.service[j].type === 'AtprotoPersonalDataServer') {
                    pdsUrl = webData.service[j].serviceEndpoint;
                    break;
                  }
                }
              }
            }
          } catch (e) {}
        }
        return {
          ok: true,
          did: did,
          handle: did,
          pdsUrl: pdsUrl || pdsHint || 'https://bsky.social',
          msg: 'DID resolved'
        };
      }

      var resolveEndpoint = (pdsHint ? pdsHint.replace(/\/+$/, '') : 'https://bsky.social') +
        '/xrpc/com.atproto.identity.resolveHandle?handle=' + encodeURIComponent(cleanHandle);
      var res = await fetch(resolveEndpoint);
      if (!res.ok) {
        var errBody = '';
        try { errBody = await res.text(); } catch (e) {}
        return {
          ok: false,
          status: res.status,
          error: 'Handle resolution failed (' + res.status + '): ' + errBody,
          hint: 'Ensure handle is spelled correctly and network is reachable.'
        };
      }
      var data = await res.json();
      var resolvedDid = data.did;
      var resolvedPds = pdsHint || null;
      if (resolvedDid && resolvedDid.indexOf('did:plc:') === 0) {
        try {
          var plcRes2 = await fetch('https://plc.directory/' + encodeURIComponent(resolvedDid));
          if (plcRes2.ok) {
            var plcDoc = await plcRes2.json();
            if (Array.isArray(plcDoc.service)) {
              for (var k = 0; k < plcDoc.service.length; k++) {
                if (plcDoc.service[k].id === '#atproto_pds' || plcDoc.service[k].type === 'AtprotoPersonalDataServer') {
                  resolvedPds = plcDoc.service[k].serviceEndpoint;
                  break;
                }
              }
            }
          }
        } catch (e) {}
      }
      return {
        ok: true,
        did: resolvedDid,
        handle: cleanHandle,
        pdsUrl: resolvedPds || 'https://bsky.social',
        msg: 'Handle resolved to DID'
      };
    } catch (err) {
      return {
        ok: false,
        error: err.message || String(err),
        hint: 'Network connection failed or CORS blocked resolution.'
      };
    }
  }

  async function discoverAuthorizationServer(pdsUrl) {
    try {
      if (!pdsUrl) {
        return { ok: false, error: 'PDS URL is required', hint: 'Provide target PDS endpoint.' };
      }
      var base = pdsUrl.replace(/\/+$/, '');
      var prRes = await fetch(base + '/.well-known/oauth-protected-resource');
      if (!prRes.ok) {
        return {
          ok: false,
          status: prRes.status,
          error: 'Failed to fetch OAuth protected resource metadata (' + prRes.status + ')',
          hint: 'PDS might not advertise OAuth 2.0 metadata or CORS restricts access.'
        };
      }
      var prData = await prRes.json();
      var authServer = (Array.isArray(prData.authorization_servers) && prData.authorization_servers[0])
        ? prData.authorization_servers[0]
        : base;
      var asRes = await fetch(authServer.replace(/\/+$/, '') + '/.well-known/oauth-authorization-server');
      var asData = asRes.ok ? await asRes.json() : null;
      return {
        ok: true,
        protectedResource: prData,
        authServer: authServer,
        authServerMetadata: asData
      };
    } catch (err) {
      return {
        ok: false,
        error: err.message || String(err),
        hint: 'Network error while querying OAuth metadata.'
      };
    }
  }

  async function prepareOAuthAuthorizeUrl(opts) {
    opts = opts || {};
    try {
      var env = getEnvironmentStatus();
      var clientId = opts.clientId || env.clientMetadataUrl || 'https://lastnpcalex.agency/oauth/client-metadata.json';
      var redirectUri = opts.redirectUri || (typeof window !== 'undefined' && window.location ? window.location.href.split('#')[0] : 'https://lastnpcalex.agency/canvas/lighthugger.html');
      var scope = opts.scope || 'atproto transition:generic';
      var handle = opts.handle || '';

      var pkce = await generatePkcePair();
      var state = generateId('st');

      var oauthState = {
        state: state,
        verifier: pkce.verifier,
        challenge: pkce.challenge,
        clientId: clientId,
        redirectUri: redirectUri,
        scope: scope,
        handle: handle,
        createdAt: Date.now()
      };

      try {
        if (typeof sessionStorage !== 'undefined' && sessionStorage && typeof sessionStorage.setItem === 'function') {
          sessionStorage.setItem('lh.atproto.pkce.' + state, JSON.stringify(oauthState));
        } else {
          storageSet('lh.atproto.pkce.' + state, JSON.stringify(oauthState));
        }
      } catch (e) {
        storageSet('lh.atproto.pkce.' + state, JSON.stringify(oauthState));
      }

      var authEndpoint = 'https://bsky.social/oauth/authorize';
      if (handle) {
        var resolved = await resolveHandle(handle);
        if (resolved.ok && resolved.pdsUrl) {
          var disc = await discoverAuthorizationServer(resolved.pdsUrl);
          if (disc.ok && disc.authServerMetadata && disc.authServerMetadata.authorization_endpoint) {
            authEndpoint = disc.authServerMetadata.authorization_endpoint;
          }
        }
      }

      var params = [
        'client_id=' + encodeURIComponent(clientId),
        'redirect_uri=' + encodeURIComponent(redirectUri),
        'response_type=code',
        'scope=' + encodeURIComponent(scope),
        'code_challenge=' + encodeURIComponent(pkce.challenge),
        'code_challenge_method=S256',
        'state=' + encodeURIComponent(state)
      ];
      if (handle) {
        params.push('login_hint=' + encodeURIComponent(handle));
      }
      var authorizeUrl = authEndpoint + (authEndpoint.indexOf('?') >= 0 ? '&' : '?') + params.join('&');

      return {
        ok: true,
        url: authorizeUrl,
        state: state,
        codeChallenge: pkce.challenge,
        msg: 'OAuth 2.0 PKCE Authorize URL prepared. Navigate only in top-level browser context.'
      };
    } catch (err) {
      return {
        ok: false,
        error: err.message || String(err),
        hint: 'Failed to prepare OAuth authorize URL.'
      };
    }
  }

  async function connectWithSession(opts) {
    opts = opts || {};
    try {
      var pdsUrl = (opts.pdsUrl || 'https://bsky.social').replace(/\/+$/, '');
      var handle = String(opts.handle || '').trim().replace(/^@/, '');
      var passOrJwt = String(opts.appPasswordOrJwt || '').trim();

      if (!handle) {
        return { ok: false, error: 'Identifier (handle or DID) is required', hint: 'Enter your Bluesky / ATProto handle.' };
      }
      if (!passOrJwt) {
        return { ok: false, error: 'App Password or JWT token is required', hint: 'Generate an App Password in your ATProto account settings.' };
      }

      if (passOrJwt.indexOf('.') >= 0 && passOrJwt.split('.').length === 3) {
        var sessionData = {
          did: handle.indexOf('did:') === 0 ? handle : ('did:web:' + handle),
          handle: handle,
          accessJwt: passOrJwt,
          pdsUrl: pdsUrl,
          authMode: 'bearer-jwt',
          connectedAt: new Date().toISOString()
        };
        saveSession(sessionData);
        return {
          ok: true,
          session: sessionData,
          msg: 'Session configured with Bearer JWT.'
        };
      }

      var endpoint = pdsUrl + '/xrpc/com.atproto.server.createSession';
      var res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          identifier: handle,
          password: passOrJwt
        })
      });

      if (!res.ok) {
        var errBody = '';
        try { errBody = await res.text(); } catch (e) {}
        return {
          ok: false,
          status: res.status,
          error: 'Authentication failed (' + res.status + '): ' + errBody,
          hint: 'Verify handle, App Password, and PDS URL.'
        };
      }

      var data = await res.json();
      var session = {
        did: data.did,
        handle: data.handle,
        accessJwt: data.accessJwt,
        refreshJwt: data.refreshJwt,
        pdsUrl: pdsUrl,
        authMode: 'app-password',
        connectedAt: new Date().toISOString()
      };
      saveSession(session);
      return {
        ok: true,
        session: session,
        msg: 'Connected to ATProto PDS: @' + data.handle
      };
    } catch (err) {
      return {
        ok: false,
        error: err.message || String(err),
        hint: 'Network connection or CORS blocked request to ' + (opts.pdsUrl || 'PDS')
      };
    }
  }

  async function pushRecordToPds(opts) {
    opts = opts || {};
    try {
      var sess = opts.session || getSession();
      if (!sess || !sess.accessJwt || !sess.did) {
        return {
          ok: false,
          error: 'Not authenticated with a PDS',
          hint: 'Connect with an App Password or Bearer JWT first.'
        };
      }
      var pdsUrl = (opts.pdsUrl || sess.pdsUrl || 'https://bsky.social').replace(/\/+$/, '');
      var collection = opts.collection || (opts.record && opts.record.$type);
      if (!collection) {
        return { ok: false, error: 'Record collection ($type) is required', hint: 'Specify collection or include $type in record.' };
      }
      var rkey = opts.rkey || generateTid();
      var record = opts.record;
      if (!record || typeof record !== 'object') {
        return { ok: false, error: 'Record object is required', hint: 'Provide record to save.' };
      }

      var endpoint = pdsUrl + '/xrpc/com.atproto.repo.createRecord';
      var envelope = {
        repo: sess.did,
        collection: collection,
        rkey: rkey,
        record: record
      };

      var res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + sess.accessJwt
        },
        body: JSON.stringify(envelope)
      });

      if (!res.ok) {
        var errBody = '';
        try { errBody = await res.text(); } catch (e) {}
        return {
          ok: false,
          status: res.status,
          error: 'Failed to push record (' + res.status + '): ' + errBody,
          hint: 'Verify session validity, write permissions, and record schema.'
        };
      }

      var data = await res.json();
      if (opts.archiveId) {
        updateItemSync(opts.archiveKind || 'vessel', opts.archiveId, {
          staged: false,
          syncedAt: new Date().toISOString(),
          uri: data.uri,
          cid: data.cid
        });
        clearOutboxItem(opts.archiveId);
      }

      return {
        ok: true,
        uri: data.uri,
        cid: data.cid,
        rkey: rkey,
        msg: 'Record pushed successfully to PDS: ' + data.uri
      };
    } catch (err) {
      return {
        ok: false,
        error: err.message || String(err),
        hint: 'Network failure or CORS restriction while pushing to PDS.'
      };
    }
  }

  async function pullRecordsFromPds(opts) {
    opts = opts || {};
    try {
      var sess = getSession();
      var repoDid = opts.repoDid || (sess && sess.did);
      if (!repoDid) {
        return { ok: false, error: 'Repository DID is required', hint: 'Provide repoDid or connect to a PDS.' };
      }
      var pdsUrl = (opts.pdsUrl || (sess && sess.pdsUrl) || 'https://bsky.social').replace(/\/+$/, '');
      var collection = opts.collection || VESSEL_LEXICON_ID;
      var limit = opts.limit || 50;

      var url = pdsUrl + '/xrpc/com.atproto.repo.listRecords?repo=' + encodeURIComponent(repoDid) +
        '&collection=' + encodeURIComponent(collection) + '&limit=' + encodeURIComponent(limit);
      if (opts.cursor) {
        url += '&cursor=' + encodeURIComponent(opts.cursor);
      }

      var headers = {};
      if (sess && sess.accessJwt) {
        headers['Authorization'] = 'Bearer ' + sess.accessJwt;
      }

      var res = await fetch(url, { headers: headers });
      if (!res.ok) {
        var errBody = '';
        try { errBody = await res.text(); } catch (e) {}
        return {
          ok: false,
          status: res.status,
          error: 'Failed to list records (' + res.status + '): ' + errBody,
          hint: 'Verify repository DID and collection name.'
        };
      }

      var data = await res.json();
      return {
        ok: true,
        records: data.records || [],
        cursor: data.cursor || null,
        msg: 'Retrieved ' + (data.records ? data.records.length : 0) + ' records from PDS.'
      };
    } catch (err) {
      return {
        ok: false,
        error: err.message || String(err),
        hint: 'Network failure or CORS error pulling records.'
      };
    }
  }

  var api = {
    VESSEL_LEXICON_ID: VESSEL_LEXICON_ID,
    MISSION_LEXICON_ID: MISSION_LEXICON_ID,
    VESSEL_LEXICON: VESSEL_LEXICON,
    MISSION_LEXICON: MISSION_LEXICON,
    LEXICONS: LEXICONS,
    buildVesselRecord: buildVesselRecord,
    buildMissionRecord: buildMissionRecord,
    validateVesselRecord: validateVesselRecord,
    validateMissionRecord: validateMissionRecord,
    buildCreateRecordEnvelope: buildCreateRecordEnvelope,
    listVessels: listVessels,
    saveVessel: saveVessel,
    cloneVessel: cloneVessel,
    deleteVessel: deleteVessel,
    listMissions: listMissions,
    saveMission: saveMission,
    deleteMission: deleteMission,
    exportArchiveBundle: exportArchiveBundle,
    importArchiveBundle: importArchiveBundle,
    stageForSync: stageForSync,
    listOutbox: listOutbox,
    clearOutboxItem: clearOutboxItem,
    getEnvironmentStatus: getEnvironmentStatus,
    setClientMetadataUrl: setClientMetadataUrl,
    getClientMetadataUrl: getClientMetadataUrl,
    generatePkcePair: generatePkcePair,
    generateDpopKeypair: generateDpopKeypair,
    createDpopProof: createDpopProof,
    resolveHandle: resolveHandle,
    discoverAuthorizationServer: discoverAuthorizationServer,
    prepareOAuthAuthorizeUrl: prepareOAuthAuthorizeUrl,
    connectWithSession: connectWithSession,
    disconnectSession: disconnectSession,
    getSession: getSession,
    pushRecordToPds: pushRecordToPds,
    pullRecordsFromPds: pullRecordsFromPds,
    generateTid: generateTid,
    base64UrlEncode: base64UrlEncode,
    base64UrlDecode: base64UrlDecode
  };

  root.LighthuggerATProto = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
