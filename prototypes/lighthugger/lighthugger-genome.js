/**
 * LighthuggerGenome v3 - Procedural Lighthugger genome with authentic Long Patience
 * sculpted chassis & cryo-ice, Zando hull/aft variants, surface greebling,
 * architectural shuttle ports, LH3/LH2/LH1 share-code codec, and fleet vault.
 */
(function (root) {
  'use strict';

  var STORAGE_KEY = 'lighthugger.fleet.v3';
  var LEGACY_KEYS = ['lighthugger.fleet.v2', 'lighthugger.fleet.v1'];
  var FORMAT = 'lighthugger-vessel';

  var HULL_SHAPES = [
    'long-patience',
    'ogive-spindle',
    'needle-spire',
    'faceted-lance',
    'bulbous-ram'
  ];

  var HULL_LABELS = {
    'long-patience': 'LONG PATIENCE ICE',
    'ogive-spindle': 'OGIVE SPINDLE',
    'needle-spire': 'MONUMENTAL SPIRE',
    'faceted-lance': 'FACETED LANCE',
    'bulbous-ram': 'SEARS-HAACK RAM'
  };

  var AFT_SHAPES = [
    'long-patience-aft',
    'gothic-bastion',
    'sleek-ogive',
    'twin-boom'
  ];

  var AFT_LABELS = {
    'long-patience-aft': 'LONG PATIENCE CHASSIS',
    'gothic-bastion': 'GOTHIC BUTTRESS SPIRE',
    'sleek-ogive': 'SLEEK OGIVE',
    'twin-boom': 'TWIN-BOOM STERN'
  };

  var POD_STYLES = [
    'conjoiner-spike',
    'canted-bell',
    'annular-shroud'
  ];

  var POD_LABELS = {
    'conjoiner-spike': 'CONJOINER SPIKE',
    'canted-bell': 'CANTED THRUSTER',
    'annular-shroud': 'ANNULAR SHROUD'
  };

  var ARCHS = ['twin-h', 'twin-v', 'tri', 'quad', 'hex'];

  var ARCH_LABELS = {
    'twin-h': '2\u00d7 LATERAL FLANK',
    'twin-v': '2\u00d7 DORSAL/VENTRAL',
    'tri': '3\u00d7 TRINE ARRAY',
    'quad': '4\u00d7 CRUCIFORM',
    'hex': '6\u00d7 HEX ANNULAR'
  };

  var ICE_SYMMETRIES = ['fore', 'bi-cone', 'twin-ram'];

  var ICE_SYMMETRY_LABELS = {
    'fore': 'BOW ICE \u00b7 REVERSIBLE',
    'bi-cone': 'BI-CONE \u00b7 FLIP & BURN',
    'twin-ram': 'BI-LANCE \u00b7 FLIP & BURN'
  };

  var PORT_PLACEMENTS = ['aft-hull', 'waist', 'through-ice', 'all-zones'];

  var PORT_PLACEMENT_LABELS = {
    'aft-hull': 'AFT HULL',
    'waist': 'WAIST CITADEL',
    'through-ice': 'THROUGH ICE CONES',
    'all-zones': 'WAIST + ICE CONES'
  };

  var DIAL_KEYS = [
    'needleLen',
    'aftLen',
    'girth',
    'hullCurve',
    'flatten',
    'greebles',
    'surfaceTex',
    'cityLights',
    'iceCoverage',
    'iceThick',
    'skirtJagged',
    'borderAsym',
    'crags',
    'iceTint',
    'nacelleSize',
    'styleGnostic',
    'styleGothic',
    'styleSleek',
    'styleGiger',
    'styleCoade',
    'styleDune',
    'styleCathedral'
  ];

  // Seven blendable 0..1 surface/hull aesthetic styles. Fixed order: it is the LH3 codec order
  // (payload indices 26..32) and the deterministic style-kit application order in the builder.
  var STYLE_KEYS = ['styleGnostic', 'styleGothic', 'styleSleek', 'styleGiger', 'styleCoade', 'styleDune', 'styleCathedral'];

  var STYLE_LABELS = {
    styleGnostic: 'MELDING PLAGUE',
    styleGothic: 'SAGRADA BASILICA',
    styleSleek: 'SLEEK NIGHTHAWK',
    styleGiger: 'GIGER BIOMECH',
    styleCoade: 'COADE FROST',
    styleDune: 'DUNE BRUTALIST',
    styleCathedral: 'GOTHIC CATHEDRAL'
  };

  var STYLE_DESCRIPTIONS = {
    styleGnostic: 'Melding Plague / Nostalgia for Infinity Nanotech Mutation',
    styleGothic: 'Basilica de la Sagrada Familia / Parabolic Spire Crown',
    styleSleek: 'Sleek Futurism / Nighthawk B-2 Stealth',
    styleGiger: 'H.R. Giger Biomech / Black Xenomorph',
    styleCoade: 'Children of a Dead Earth / CoaDE',
    styleDune: 'Dune Brutalist / Carved Sandstone Isolines',
    styleCathedral: 'Dark Concrete Gothic Cathedral / Axial Spires, Gables & Flying Buttresses'
  };

  // Genome key -> window.LighthuggerStyleKits id
  var STYLE_KIT_IDS = {
    styleGnostic: 'gnostic',
    styleGothic: 'gothic',
    styleSleek: 'sleek',
    styleGiger: 'giger',
    styleCoade: 'coade',
    styleDune: 'dune',
    styleCathedral: 'cathedral'
  };

  var WEAPON_KEYS = ['wpnRail', 'wpnFel', 'wpnLance', 'wpnMissile', 'wpnPdc'];

  var WEAPON_SPECS = {
    wpnRail: {
      key: 'wpnRail', short: 'COIL', label: 'COILGUN BATTERIES',
      min: 0, max: 6, def: 4, powerMW: 25, heatMW: 30, mode: 'newtonian',
      desc: 'Curved-orbit hypervelocity kinetic railguns'
    },
    wpnFel: {
      key: 'wpnFel', short: 'UV FEL', label: 'UV FEL LASERS',
      min: 0, max: 4, def: 2, powerMW: 75, heatMW: 90, mode: 'newtonian',
      desc: 'Light-speed precision UV beam domes'
    },
    wpnLance: {
      key: 'wpnLance', short: 'LANCE', label: 'GAMMA LANCE / RKV',
      min: 0, max: 4, def: 2, powerMW: 140, heatMW: 110, mode: 'relativistic',
      desc: 'Relativistic spinal gamma lance & RKV darts'
    },
    wpnMissile: {
      key: 'wpnMissile', short: 'MSL', label: 'ORBITAL AI MISSILES',
      min: 0, max: 4, def: 2, powerMW: 20, heatMW: 15, mode: 'both',
      desc: 'Cold-launch VLS tubes with ProNav guidance AI'
    },
    wpnPdc: {
      key: 'wpnPdc', short: 'PDC', label: 'POINT-DEFENSE PDC',
      min: 0, max: 4, def: 2, powerMW: 22, heatMW: 25, mode: 'defense',
      desc: 'Auto-intercept close-in defense laser turrets'
    }
  };

  var WEAPON_PRESETS = [
    { id: 'stock', label: 'STOCK SUITE', P: { wpnRail: 4, wpnFel: 2, wpnLance: 2, wpnMissile: 2, wpnPdc: 2 } },
    { id: 'missile', label: 'MISSILE BOAT', P: { wpnRail: 2, wpnFel: 1, wpnLance: 1, wpnMissile: 4, wpnPdc: 2 } },
    { id: 'lancer', label: 'REL LANCER', P: { wpnRail: 2, wpnFel: 3, wpnLance: 3, wpnMissile: 1, wpnPdc: 1 } },
    { id: 'escort', label: 'AEGIS PDC', P: { wpnRail: 4, wpnFel: 2, wpnLance: 1, wpnMissile: 2, wpnPdc: 4 } }
  ];

  function clampWpnCount(key, v) {
    var sp = WEAPON_SPECS[key];
    if (!sp) return 0;
    var n = Math.round(Number(v));
    if (!Number.isFinite(n)) return sp.def;
    return Math.min(sp.max, Math.max(sp.min, n));
  }

  function mulberry32(seed) {
    var a = seed | 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp01(v, fallback) {
    var n = Number(v);
    if (!Number.isFinite(n)) return fallback === undefined ? 0.5 : fallback;
    return Math.min(1, Math.max(0, n));
  }

  function clampSeed(s) {
    var n = Math.floor(Number(s));
    if (!Number.isFinite(n)) return 6202;
    var m = ((n % 2147483647) + 2147483647) % 2147483647;
    return m || 6202;
  }

  var PRESETS = [
    {
      id: 'long-patience',
      name: 'Long Patience',
      seed: 6202,
      P: {
        hullShape: 'long-patience',
        aftShape: 'long-patience-aft',
        podStyle: 'conjoiner-spike',
        arch: 'twin-h',
        needleLen: 0.58,
        aftLen: 0.56,
        girth: 0.50,
        hullCurve: 0.45,
        flatten: 0.22,
        greebles: 0.80,
        surfaceTex: 0.00,
        cityLights: 0.74,
        iceCoverage: 1.00,
        iceThick: 0.36,
        skirtJagged: 0.44,
        borderAsym: 0.00,
        crags: 0.54,
        iceTint: 0.00,
        nacelleSize: 0.52,
        shuttlePorts: 4,
        fins: 0,
        habRing: false,
        iceSymmetry: 'fore',
        portPlacement: 'aft-hull'
      }
    },
    {
      id: 'zodiacal-ogive',
      name: 'Zodiacal Light',
      seed: 31415,
      P: {
        hullShape: 'ogive-spindle',
        aftShape: 'sleek-ogive',
        podStyle: 'canted-bell',
        arch: 'twin-h',
        needleLen: 0.68,
        aftLen: 0.52,
        girth: 0.52,
        hullCurve: 0.72,
        flatten: 0.14,
        greebles: 0.48,
        surfaceTex: 0.72,
        cityLights: 0.92,
        iceCoverage: 0.78,
        iceThick: 0.22,
        skirtJagged: 0.42,
        borderAsym: 0.54,
        crags: 0.36,
        iceTint: 0.86,
        nacelleSize: 0.56,
        shuttlePorts: 2,
        fins: 2,
        habRing: false,
        iceSymmetry: 'fore',
        portPlacement: 'waist'
      }
    },
    {
      id: 'nostalgia-spire',
      name: 'Nostalgia for Infinity',
      seed: 90817,
      P: {
        hullShape: 'needle-spire',
        aftShape: 'gothic-bastion',
        podStyle: 'conjoiner-spike',
        arch: 'twin-h',
        needleLen: 0.80,
        aftLen: 0.64,
        girth: 0.52,
        hullCurve: 0.38,
        flatten: 0.14,
        greebles: 0.88,
        surfaceTex: 0.86,
        cityLights: 0.84,
        iceCoverage: 0.92,
        iceThick: 0.24,
        skirtJagged: 0.72,
        borderAsym: 0.66,
        crags: 0.48,
        iceTint: 0.06,
        nacelleSize: 0.54,
        shuttlePorts: 6,
        fins: 0,
        habRing: false,
        iceSymmetry: 'fore',
        portPlacement: 'aft-hull',
        styleGnostic: 0.45
      }
    },
    {
      id: 'splintered-pilgrim',
      name: 'Splintered Pilgrim',
      seed: 19408,
      P: {
        hullShape: 'ogive-spindle',
        aftShape: 'gothic-bastion',
        podStyle: 'conjoiner-spike',
        arch: 'twin-v',
        needleLen: 0.74,
        aftLen: 0.48,
        girth: 0.44,
        hullCurve: 0.48,
        flatten: 0.30,
        greebles: 0.66,
        surfaceTex: 0.88,
        cityLights: 0.64,
        iceCoverage: 0.84,
        iceThick: 0.48,
        skirtJagged: 0.78,
        borderAsym: 0.78,
        crags: 0.84,
        iceTint: 0.12,
        nacelleSize: 0.48,
        shuttlePorts: 4,
        fins: 2,
        habRing: true,
        iceSymmetry: 'bi-cone',
        portPlacement: 'through-ice'
      }
    },
    {
      id: 'cruciform-spear',
      name: 'Cruciform Spear',
      seed: 88311,
      P: {
        hullShape: 'faceted-lance',
        aftShape: 'twin-boom',
        podStyle: 'canted-bell',
        arch: 'quad',
        needleLen: 0.70,
        aftLen: 0.60,
        girth: 0.44,
        hullCurve: 0.52,
        flatten: 0.38,
        greebles: 0.72,
        surfaceTex: 0.78,
        cityLights: 0.70,
        iceCoverage: 0.72,
        iceThick: 0.22,
        skirtJagged: 0.40,
        borderAsym: 0.44,
        crags: 0.34,
        iceTint: 0.35,
        nacelleSize: 0.58,
        shuttlePorts: 4,
        fins: 4,
        habRing: false,
        iceSymmetry: 'fore',
        portPlacement: 'waist'
      }
    },
    {
      id: 'cocytus-heavy',
      name: 'Cocytus Ark',
      seed: 44719,
      P: {
        hullShape: 'bulbous-ram',
        aftShape: 'long-patience-aft',
        podStyle: 'annular-shroud',
        arch: 'hex',
        needleLen: 0.50,
        aftLen: 0.72,
        girth: 0.76,
        hullCurve: 0.76,
        flatten: 0.10,
        greebles: 0.94,
        surfaceTex: 0.92,
        cityLights: 0.86,
        iceCoverage: 0.88,
        iceThick: 0.38,
        skirtJagged: 0.54,
        borderAsym: 0.64,
        crags: 0.56,
        iceTint: 0.18,
        nacelleSize: 0.64,
        shuttlePorts: 6,
        fins: 4,
        habRing: true,
        iceSymmetry: 'twin-ram',
        portPlacement: 'all-zones'
      }
    },
    {
      id: 'conjoiner-dart',
      name: 'Conjoiner Dart',
      seed: 52713,
      P: {
        hullShape: 'ogive-spindle',
        aftShape: 'sleek-ogive',
        podStyle: 'conjoiner-spike',
        arch: 'tri',
        needleLen: 0.74,
        aftLen: 0.46,
        girth: 0.40,
        hullCurve: 0.66,
        flatten: 0.18,
        greebles: 0.42,
        surfaceTex: 0.48,
        cityLights: 0.62,
        iceCoverage: 0.64,
        iceThick: 0.20,
        skirtJagged: 0.30,
        borderAsym: 0.40,
        crags: 0.26,
        iceTint: 0.22,
        nacelleSize: 0.62,
        shuttlePorts: 2,
        fins: 2,
        habRing: false,
        iceSymmetry: 'fore',
        portPlacement: 'waist',
        styleSleek: 0.35
      }
    },
    // -- Style showcase archetypes (one hero surface style each) --
    {
      id: 'gnostic-plague',
      name: 'MELDING PLAGUE',
      seed: 66613,
      P: {
        hullShape: 'ogive-spindle',
        aftShape: 'gothic-bastion',
        podStyle: 'conjoiner-spike',
        arch: 'twin-h',
        needleLen: 0.66,
        aftLen: 0.58,
        girth: 0.56,
        hullCurve: 0.58,
        flatten: 0.16,
        greebles: 0.70,
        surfaceTex: 0.82,
        cityLights: 0.66,
        iceCoverage: 0.70,
        iceThick: 0.30,
        skirtJagged: 0.74,
        borderAsym: 0.72,
        crags: 0.66,
        iceTint: 0.30,
        nacelleSize: 0.54,
        shuttlePorts: 4,
        fins: 0,
        habRing: false,
        iceSymmetry: 'fore',
        portPlacement: 'aft-hull',
        styleGnostic: 1.0
      }
    },
    {
      id: 'cathedral-basilica',
      name: 'BASILICA CAELUM',
      seed: 13771,
      P: {
        hullShape: 'needle-spire',
        aftShape: 'gothic-bastion',
        podStyle: 'conjoiner-spike',
        arch: 'twin-v',
        needleLen: 0.78,
        aftLen: 0.66,
        girth: 0.54,
        hullCurve: 0.36,
        flatten: 0.08,
        greebles: 0.86,
        surfaceTex: 0.64,
        cityLights: 0.94,
        iceCoverage: 0.90,
        iceThick: 0.22,
        skirtJagged: 0.32,
        borderAsym: 0.14,
        crags: 0.32,
        iceTint: 0.08,
        nacelleSize: 0.56,
        shuttlePorts: 4,
        fins: 0,
        habRing: false,
        iceSymmetry: 'fore',
        portPlacement: 'waist',
        styleGothic: 1.0
      }
    },
    {
      id: 'nighthawk-diamond',
      name: 'HOPELESS DIAMOND',
      seed: 11717,
      P: {
        hullShape: 'faceted-lance',
        aftShape: 'sleek-ogive',
        podStyle: 'annular-shroud',
        arch: 'twin-h',
        needleLen: 0.62,
        aftLen: 0.50,
        girth: 0.48,
        hullCurve: 0.60,
        flatten: 0.52,
        greebles: 0.24,
        surfaceTex: 0.20,
        cityLights: 0.24,
        iceCoverage: 0.42,
        iceThick: 0.14,
        skirtJagged: 0.12,
        borderAsym: 0.18,
        crags: 0.10,
        iceTint: 0.72,
        nacelleSize: 0.46,
        shuttlePorts: 2,
        fins: 2,
        habRing: false,
        iceSymmetry: 'fore',
        portPlacement: 'waist',
        styleSleek: 1.0
      }
    },
    {
      id: 'giger-xenomorph',
      name: 'NOX CHITIN',
      seed: 42666,
      P: {
        hullShape: 'ogive-spindle',
        aftShape: 'twin-boom',
        podStyle: 'conjoiner-spike',
        arch: 'twin-v',
        needleLen: 0.72,
        aftLen: 0.62,
        girth: 0.50,
        hullCurve: 0.70,
        flatten: 0.26,
        greebles: 0.58,
        surfaceTex: 0.64,
        cityLights: 0.40,
        iceCoverage: 0.66,
        iceThick: 0.26,
        skirtJagged: 0.58,
        borderAsym: 0.62,
        crags: 0.44,
        iceTint: 0.85,
        nacelleSize: 0.56,
        shuttlePorts: 2,
        fins: 0,
        habRing: false,
        iceSymmetry: 'fore',
        portPlacement: 'aft-hull',
        styleGiger: 1.0
      }
    },
    {
      id: 'coade-savages',
      name: 'FROST // SAVAGES',
      seed: 20480,
      P: {
        hullShape: 'faceted-lance',
        aftShape: 'twin-boom',
        podStyle: 'canted-bell',
        arch: 'quad',
        needleLen: 0.56,
        aftLen: 0.64,
        girth: 0.58,
        hullCurve: 0.40,
        flatten: 0.20,
        greebles: 0.90,
        surfaceTex: 0.36,
        cityLights: 0.50,
        iceCoverage: 0.18,
        iceThick: 0.15,
        skirtJagged: 0.30,
        borderAsym: 0.24,
        crags: 0.20,
        iceTint: 0.20,
        nacelleSize: 0.60,
        shuttlePorts: 4,
        fins: 4,
        habRing: false,
        iceSymmetry: 'fore',
        portPlacement: 'aft-hull',
        styleCoade: 1.0
      }
    },
    {
      id: 'dune-monolith',
      name: 'SIETCH MONOLITH',
      seed: 74190,
      P: {
        hullShape: 'ogive-spindle',
        aftShape: 'sleek-ogive',
        podStyle: 'conjoiner-spike',
        arch: 'twin-v',
        needleLen: 0.72,
        aftLen: 0.62,
        girth: 0.56,
        hullCurve: 0.50,
        flatten: 0.08,
        greebles: 0.78,
        surfaceTex: 0.52,
        cityLights: 0.58,
        iceCoverage: 0.94,
        iceThick: 0.24,
        skirtJagged: 0.22,
        borderAsym: 0.14,
        crags: 0.34,
        iceTint: 0.08,
        nacelleSize: 0.60,
        shuttlePorts: 4,
        fins: 0,
        habRing: false,
        iceSymmetry: 'fore',
        portPlacement: 'waist',
        styleDune: 1.0
      }
    },
    {
      id: 'cathedral-gothic',
      name: 'VESPER CATHEDRAL',
      seed: 14829,
      P: {
        hullShape: 'needle-spire',
        aftShape: 'gothic-bastion',
        podStyle: 'conjoiner-spike',
        arch: 'twin-v',
        needleLen: 0.76,
        aftLen: 0.72,
        girth: 0.56,
        hullCurve: 0.40,
        flatten: 0.08,
        greebles: 0.84,
        surfaceTex: 0.60,
        cityLights: 0.86,
        iceCoverage: 0.92,
        iceThick: 0.24,
        skirtJagged: 0.28,
        borderAsym: 0.12,
        crags: 0.30,
        iceTint: 0.12,
        nacelleSize: 0.56,
        shuttlePorts: 4,
        fins: 0,
        habRing: false,
        iceSymmetry: 'fore',
        portPlacement: 'waist',
        styleCathedral: 1.0
      }
    }
  ];

  var PRESET_ALIASES = { 'coade-savage': 'coade-savages' };

  function findPreset(id) {
    var key = PRESET_ALIASES[id] || id;
    for (var i = 0; i < PRESETS.length; i++) {
      if (PRESETS[i].id === key) return PRESETS[i];
    }
    return null;
  }

  function normalize(raw) {
    if (!raw || typeof raw !== 'object') raw = PRESETS[0];
    var seed = clampSeed(raw.seed);
    var P0 = raw.P && typeof raw.P === 'object' ? raw.P : {};
    var def = PRESETS[0].P;

    var hullShape = HULL_SHAPES.indexOf(P0.hullShape) >= 0 ? P0.hullShape : def.hullShape;
    var aftShape = (P0.aftShape === 'gothic-spire' || P0.aftShape === 'cathedral-bell') ? 'gothic-bastion'
      : (AFT_SHAPES.indexOf(P0.aftShape) >= 0 ? P0.aftShape : def.aftShape);
    var podStyle = POD_STYLES.indexOf(P0.podStyle) >= 0 ? P0.podStyle : def.podStyle;
    var arch = ARCHS.indexOf(P0.arch) >= 0 ? P0.arch : def.arch;
    var finsNum = Number(P0.fins);
    var fins = (finsNum === 2 || finsNum === 4) ? finsNum : 0;
    var portsNum = Number(P0.shuttlePorts);
    var shuttlePorts = (portsNum === 0 || portsNum === 2 || portsNum === 4 || portsNum === 6)
      ? portsNum : def.shuttlePorts;
    var iceSymmetry = ICE_SYMMETRIES.indexOf(P0.iceSymmetry) >= 0 ? P0.iceSymmetry : def.iceSymmetry;
    var portPlacement = PORT_PLACEMENTS.indexOf(P0.portPlacement) >= 0 ? P0.portPlacement : def.portPlacement;

    var greebleVal = P0.greebles != null ? P0.greebles : (P0.aftBristles != null ? P0.aftBristles : def.greebles);

    return {
      format: FORMAT,
      v: 3,
      name: String(raw.name || 'Long Patience').trim().slice(0, 44) || 'Long Patience',
      seed: seed,
      P: {
        hullShape: hullShape,
        aftShape: aftShape,
        podStyle: podStyle,
        arch: arch,
        needleLen: clamp01(P0.needleLen, def.needleLen),
        aftLen: clamp01(P0.aftLen, def.aftLen),
        girth: clamp01(P0.girth, def.girth),
        hullCurve: clamp01(P0.hullCurve, def.hullCurve),
        flatten: clamp01(P0.flatten, def.flatten),
        greebles: clamp01(greebleVal, def.greebles),
        surfaceTex: clamp01(P0.surfaceTex, hullShape !== 'long-patience' ? 0.74 : def.surfaceTex),
        cityLights: clamp01(P0.cityLights, def.cityLights),
        iceCoverage: clamp01(P0.iceCoverage, def.iceCoverage),
        iceThick: clamp01(P0.iceThick, def.iceThick),
        skirtJagged: clamp01(P0.skirtJagged, def.skirtJagged),
        borderAsym: clamp01(P0.borderAsym, hullShape !== 'long-patience' ? 0.56 : def.borderAsym),
        crags: clamp01(P0.crags, def.crags),
        iceTint: clamp01(P0.iceTint, def.iceTint),
        nacelleSize: clamp01(P0.nacelleSize, def.nacelleSize),
        shuttlePorts: shuttlePorts,
        fins: fins,
        habRing: !!P0.habRing,
        iceSymmetry: iceSymmetry,
        portPlacement: portPlacement,
        styleGnostic: clamp01(P0.styleGnostic, 0),
        styleGothic: clamp01(P0.styleGothic, 0),
        styleSleek: clamp01(P0.styleSleek, 0),
        styleGiger: clamp01(P0.styleGiger, 0),
        styleCoade: clamp01(P0.styleCoade, 0),
        styleDune: clamp01(P0.styleDune, 0),
        styleCathedral: clamp01(P0.styleCathedral, 0),
        wpnRail: clampWpnCount('wpnRail', P0.wpnRail),
        wpnFel: clampWpnCount('wpnFel', P0.wpnFel),
        wpnLance: clampWpnCount('wpnLance', P0.wpnLance),
        wpnMissile: clampWpnCount('wpnMissile', P0.wpnMissile),
        wpnPdc: clampWpnCount('wpnPdc', P0.wpnPdc)
      }
    };
  }

  // Raw 0..1 style weights plus normalized shares (shares sum to 1 when any style is active).
  function styleWeights(genome) {
    var P = (genome && genome.P && genome.format === FORMAT) ? genome.P : normalize(genome).P;
    var out = { weights: {}, shares: {}, total: 0, dominantKey: null, dominantWeight: 0 };
    for (var i = 0; i < STYLE_KEYS.length; i++) {
      var k = STYLE_KEYS[i];
      var w = clamp01(P[k], 0);
      if (w <= 0.02) w = 0;
      out.weights[STYLE_KIT_IDS[k]] = w;
      out.total += w;
      if (w > out.dominantWeight) {
        out.dominantWeight = w;
        out.dominantKey = k;
      }
    }
    for (var j = 0; j < STYLE_KEYS.length; j++) {
      var id = STYLE_KIT_IDS[STYLE_KEYS[j]];
      out.shares[id] = out.total > 0 ? out.weights[id] / out.total : 0;
    }
    return out;
  }

  var SHIP_ADJECTIVES = [
    'Long', 'Silent', 'Pale', 'Zodiacal', 'Violet', 'Deep', 'Ashen', 'Glass',
    'Bitter', 'Oblique', 'Nocturnal', 'Gilded', 'Slender', 'Crystalline', 'Hyperbolic', 'Vesper'
  ];
  var SHIP_NOUNS = [
    'Patience', 'Meridian', 'Vigil', 'Covenant', 'Parallax', 'Cocytus', 'Ephemeris',
    'Solstice', 'Perihelion', 'Pilgrim', 'Infinity', 'Reliquary', 'Cathedral', 'Aphelion', 'Canticle', 'Spire'
  ];

  function randomGenome(seedOverride) {
    var seed = clampSeed(seedOverride != null ? seedOverride : Math.floor(Math.random() * 900000) + 1000);
    var r = mulberry32(seed);
    var adj = SHIP_ADJECTIVES[Math.floor(r() * SHIP_ADJECTIVES.length)].trim();
    var noun = SHIP_NOUNS[Math.floor(r() * SHIP_NOUNS.length)].trim();
    var finsPick = [0, 0, 2, 2, 4][Math.floor(r() * 5)];
    var portsPick = [2, 4, 4, 6][Math.floor(r() * 4)];
    var symPick = ['fore', 'bi-cone', 'twin-ram'][Math.floor(r() * 3)];
    var zonePick = symPick === 'fore'
      ? ['aft-hull', 'waist', 'through-ice'][Math.floor(r() * 3)]
      : ['waist', 'through-ice', 'all-zones'][Math.floor(r() * 3)];
    // Existing dial draws stay first so pre-style seeds (NPC corridor traffic) keep their silhouettes.
    var Pr = {
      hullShape: HULL_SHAPES[Math.floor(r() * HULL_SHAPES.length)],
      aftShape: AFT_SHAPES[Math.floor(r() * AFT_SHAPES.length)],
      podStyle: POD_STYLES[Math.floor(r() * POD_STYLES.length)],
      arch: ARCHS[Math.floor(r() * ARCHS.length)],
      needleLen: 0.34 + r() * 0.60,
      aftLen: 0.34 + r() * 0.58,
      girth: 0.32 + r() * 0.52,
      hullCurve: 0.22 + r() * 0.68,
      flatten: r() * 0.45,
      greebles: 0.35 + r() * 0.62,
      surfaceTex: 0.35 + r() * 0.65,
      cityLights: 0.40 + r() * 0.56,
      iceCoverage: 0.36 + r() * 0.64,
      iceThick: 0.22 + r() * 0.50,
      skirtJagged: 0.15 + r() * 0.72,
      borderAsym: 0.12 + r() * 0.80,
      crags: 0.16 + r() * 0.72,
      iceTint: r() * 0.88,
      nacelleSize: 0.38 + r() * 0.46,
      shuttlePorts: portsPick,
      fins: finsPick,
      habRing: r() > 0.66,
      iceSymmetry: symPick,
      portPlacement: zonePick
    };
    // Weighted style mix: ~30% stock, ~40% one hero style, ~22% a two-style blend, ~8% a rich mix.
    // Weights are rounded to whole percent so share codes round-trip exactly.
    var styleMode = r();
    function pct(v) { return Math.round(clamp01(v, 0) * 100) / 100; }
    if (styleMode < 0.30) {
      // clean stock Conjoiner hull
    } else if (styleMode < 0.70) {
      var hero = STYLE_KEYS[Math.floor(r() * STYLE_KEYS.length)];
      Pr[hero] = r() < 0.45 ? 1.0 : pct(0.62 + r() * 0.38);
    } else if (styleMode < 0.92) {
      var ia = Math.floor(r() * STYLE_KEYS.length);
      var ib = (ia + 1 + Math.floor(r() * (STYLE_KEYS.length - 1))) % STYLE_KEYS.length;
      Pr[STYLE_KEYS[ia]] = pct(0.55 + r() * 0.40);
      Pr[STYLE_KEYS[ib]] = pct(0.20 + r() * 0.30);
    } else {
      for (var si = 0; si < STYLE_KEYS.length; si++) {
        if (r() < 0.55) Pr[STYLE_KEYS[si]] = pct(0.15 + r() * 0.55);
      }
    }
    return normalize({ name: adj + ' ' + noun, seed: seed, P: Pr });
  }

  function toBase64Url(str) {
    var b64 = (typeof btoa === 'function')
      ? btoa(unescape(encodeURIComponent(str)))
      : Buffer.from(str, 'utf8').toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64Url(s) {
    var b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    return (typeof atob === 'function')
      ? decodeURIComponent(escape(atob(b64)))
      : Buffer.from(b64, 'base64').toString('utf8');
  }

  function encodeShareCode(genome) {
    var g = normalize(genome), P = g.P;
    var payload = [
      g.seed,
      HULL_SHAPES.indexOf(P.hullShape),
      AFT_SHAPES.indexOf(P.aftShape),
      POD_STYLES.indexOf(P.podStyle),
      ARCHS.indexOf(P.arch),
      Math.round(P.needleLen * 100),
      Math.round(P.aftLen * 100),
      Math.round(P.girth * 100),
      Math.round(P.hullCurve * 100),
      Math.round(P.flatten * 100),
      Math.round(P.greebles * 100),
      Math.round(P.cityLights * 100),
      Math.round(P.iceCoverage * 100),
      Math.round(P.iceThick * 100),
      Math.round(P.skirtJagged * 100),
      Math.round(P.crags * 100),
      Math.round(P.iceTint * 100),
      Math.round(P.nacelleSize * 100),
      P.shuttlePorts,
      P.fins,
      P.habRing ? 1 : 0,
      g.name,
      Math.round(P.surfaceTex * 100),
      Math.round(P.borderAsym * 100),
      Math.max(0, ICE_SYMMETRIES.indexOf(P.iceSymmetry)),
      Math.max(0, PORT_PLACEMENTS.indexOf(P.portPlacement))
    ];
    // Indices 26..32: surface styles in STYLE_KEYS order
    for (var si = 0; si < STYLE_KEYS.length; si++) {
      payload.push(Math.round(P[STYLE_KEYS[si]] * 100));
    }
    // Indices 33..37: weapon mounts in WEAPON_KEYS order
    for (var wi = 0; wi < WEAPON_KEYS.length; wi++) {
      payload.push(clampWpnCount(WEAPON_KEYS[wi], P[WEAPON_KEYS[wi]]));
    }
    return 'LH3-' + toBase64Url(JSON.stringify(payload));
  }

  function decodeShareCode(code) {
    var clean = String(code || '').trim();
    if (clean.indexOf('LH3-') === 0) {
      var a3 = JSON.parse(fromBase64Url(clean.slice(4)));
      if (!Array.isArray(a3) || a3.length < 21) throw new Error('Malformed LH3 payload');
      // Older 26-item LH3 codes carry no styles; they decode as stock (0).
      var styleOf = function (i) {
        return a3.length > 26 && a3[26 + i] != null ? Number(a3[26 + i]) / 100 : 0;
      };
      var wpnOf = function (i, key) {
        return a3.length > 33 + i && a3[33 + i] != null ? clampWpnCount(key, a3[33 + i]) : WEAPON_SPECS[key].def;
      };
      return normalize({
        seed: a3[0],
        name: a3[21] || 'Imported Lighthugger',
        P: {
          styleGnostic: styleOf(0),
          styleGothic: styleOf(1),
          styleSleek: styleOf(2),
          styleGiger: styleOf(3),
          styleCoade: styleOf(4),
          styleDune: styleOf(5),
          styleCathedral: styleOf(6),
          wpnRail: wpnOf(0, 'wpnRail'),
          wpnFel: wpnOf(1, 'wpnFel'),
          wpnLance: wpnOf(2, 'wpnLance'),
          wpnMissile: wpnOf(3, 'wpnMissile'),
          wpnPdc: wpnOf(4, 'wpnPdc'),
          hullShape: HULL_SHAPES[a3[1]] || 'long-patience',
          aftShape: AFT_SHAPES[a3[2]] || 'long-patience-aft',
          podStyle: POD_STYLES[a3[3]] || 'conjoiner-spike',
          arch: ARCHS[a3[4]] || 'twin-h',
          needleLen: a3[5] / 100,
          aftLen: a3[6] / 100,
          girth: a3[7] / 100,
          hullCurve: a3[8] / 100,
          flatten: a3[9] / 100,
          greebles: a3[10] / 100,
          cityLights: a3[11] / 100,
          iceCoverage: a3[12] / 100,
          iceThick: a3[13] / 100,
          skirtJagged: a3[14] / 100,
          crags: a3[15] / 100,
          iceTint: a3[16] / 100,
          nacelleSize: a3[17] / 100,
          shuttlePorts: a3[18],
          fins: a3[19],
          habRing: !!a3[20],
          surfaceTex: a3.length > 22 ? a3[22] / 100 : undefined,
          borderAsym: a3.length > 23 ? a3[23] / 100 : undefined,
          iceSymmetry: a3.length > 24 ? (ICE_SYMMETRIES[a3[24]] || 'fore') : 'fore',
          portPlacement: a3.length > 25 ? (PORT_PLACEMENTS[a3[25]] || 'aft-hull') : 'aft-hull'
        }
      });
    }
    if (clean.indexOf('LH2-') === 0) {
      var a2 = JSON.parse(fromBase64Url(clean.slice(4)));
      if (!Array.isArray(a2) || a2.length < 20) throw new Error('Malformed LH2 payload');
      var flags = Number(a2[19]) | 0;
      return normalize({
        seed: a2[0],
        name: a2[20] || 'Imported Lighthugger',
        P: {
          hullShape: HULL_SHAPES[a2[1]] || 'long-patience',
          aftShape: ['gothic-bastion', 'sleek-ogive', 'long-patience-aft', 'cathedral-bell', 'twin-boom'][a2[2]] || 'long-patience-aft',
          podStyle: POD_STYLES[a2[3]] || 'conjoiner-spike',
          arch: ['twin-v', 'twin-h', 'tri', 'quad', 'hex'][a2[4]] || 'twin-h',
          needleLen: a2[5] / 100,
          aftLen: a2[6] / 100,
          girth: a2[7] / 100,
          hullCurve: a2[8] / 100,
          flatten: a2[9] / 100,
          greebles: a2[10] / 100,
          cityLights: a2[11] / 100,
          iceCoverage: a2[12] / 100,
          iceThick: a2[13] / 100,
          skirtJagged: a2[14] / 100,
          crags: a2[15] / 100,
          iceTint: a2[16] / 100,
          nacelleSize: a2[17] / 100,
          fins: a2[18],
          habRing: !!(flags & 1),
          shuttlePorts: (flags & 2) ? 4 : 2
        }
      });
    }
    if (clean.indexOf('LH1-') === 0) {
      var b = JSON.parse(fromBase64Url(clean.slice(4)));
      if (!Array.isArray(b) || b.length < 12) throw new Error('Malformed LH1 payload');
      var legacyArchs = ['twin-v', 'twin-h', 'quad', 'hex'];
      return normalize({
        seed: b[0],
        name: b[12] || 'Imported Hull',
        P: {
          arch: legacyArchs[b[1]] || 'twin-h',
          needleLen: b[2] / 100,
          aftLen: b[3] / 100,
          girth: b[4] / 100,
          flatten: b[5] / 100,
          crags: b[6] / 100,
          iceThick: b[8] / 100,
          nacelleSize: b[9] / 100,
          fins: b[10],
          habRing: !!b[11]
        }
      });
    }
    throw new Error('Share code must start with LH3-, LH2-, or LH1-');
  }

  function computeSpecs(genome) {
    var g = normalize(genome), P = g.P;
    var needleM = Math.round(1950 + P.needleLen * 1900);
    var aftM = Math.round(1050 + P.aftLen * 2150);
    if (P.iceSymmetry === 'twin-ram') aftM = Math.max(aftM, Math.round(needleM * 0.94));
    var totalM = needleM + aftM;
    var beamM = Math.round(240 + P.girth * 380);
    var iceThickM = P.iceCoverage > 0.02 ? (12 + P.iceThick * 70) : 0;
    var symMul = P.iceSymmetry === 'twin-ram' ? 1.95 : P.iceSymmetry === 'bi-cone' ? 1.62 : 1.0;
    var iceMt = P.iceCoverage > 0.02 ? Math.max(0.4, (needleM / 1000) * (beamM / 1000) * (iceThickM / 1000) * P.iceCoverage * 1150 * symMul) : 0;
    var podCount = P.arch === 'hex' ? 6 : P.arch === 'quad' ? 4 : P.arch === 'tri' ? 3 : 2;
    var sw = styleWeights(g);
    return {
      styleWeights: sw.weights,
      styleLabel: sw.dominantKey ? STYLE_LABELS[sw.dominantKey] : 'STOCK CONJOINER',
      needleM: needleM,
      aftM: aftM,
      totalM: totalM,
      beamM: beamM,
      iceMt: iceMt,
      icePct: Math.round(P.iceCoverage * 100),
      podCount: podCount,
      shuttlePorts: P.shuttlePorts,
      hullLabel: HULL_LABELS[P.hullShape] || P.hullShape,
      aftLabel: AFT_LABELS[P.aftShape] || P.aftShape,
      podLabel: POD_LABELS[P.podStyle] || P.podStyle,
      archLabel: ARCH_LABELS[P.arch] || P.arch,
      iceSymLabel: ICE_SYMMETRY_LABELS[P.iceSymmetry] || P.iceSymmetry,
      portZoneLabel: PORT_PLACEMENT_LABELS[P.portPlacement] || P.portPlacement,
      reversibleDrive: P.iceSymmetry === 'fore',
      driveModeLabel: P.iceSymmetry === 'fore' ? 'REVERSIBLE (G-FLIP)' : 'FLIP & BURN (BI-CONE)'
    };
  }

  function computeRefitCost(baseGenome, nextGenome) {
    var a = normalize(baseGenome).P;
    var b = normalize(nextGenome).P;
    var cost = 0;
    if (a.hullShape !== b.hullShape) cost += 90;
    if (a.aftShape !== b.aftShape) cost += 70;
    if (a.podStyle !== b.podStyle) cost += 45;
    if (a.arch !== b.arch) cost += 45;
    if (a.iceSymmetry !== b.iceSymmetry) cost += 65;
    if (a.portPlacement !== b.portPlacement) cost += 35;
    if (a.shuttlePorts !== b.shuttlePorts) cost += 30;
    if (a.fins !== b.fins) cost += 25;
    if (!!a.habRing !== !!b.habRing) cost += 45;

    var hullDials = ['needleLen', 'aftLen', 'girth', 'hullCurve', 'flatten', 'greebles', 'cityLights', 'nacelleSize'];
    var hullDelta = 0;
    for (var i = 0; i < hullDials.length; i++) {
      hullDelta += Math.abs(a[hullDials[i]] - b[hullDials[i]]);
    }
    if (hullDelta > 0.015) cost += Math.min(60, 20 + Math.round(hullDelta * 22));

    var iceDials = ['iceCoverage', 'iceThick', 'skirtJagged', 'borderAsym', 'surfaceTex', 'crags', 'iceTint'];
    var iceDelta = 0;
    for (var j = 0; j < iceDials.length; j++) {
      iceDelta += Math.abs(a[iceDials[j]] - b[iceDials[j]]);
    }
    if (iceDelta > 0.015) cost += Math.min(50, 15 + Math.round(iceDelta * 18));

    var styleDelta = 0;
    for (var k = 0; k < STYLE_KEYS.length; k++) {
      styleDelta += Math.abs(a[STYLE_KEYS[k]] - b[STYLE_KEYS[k]]);
    }
    if (styleDelta > 0.015) cost += Math.min(60, 18 + Math.round(styleDelta * 24));

    var wpnDelta = 0;
    for (var wi = 0; wi < WEAPON_KEYS.length; wi++) {
      var wk = WEAPON_KEYS[wi];
      wpnDelta += Math.abs(clampWpnCount(wk, a[wk]) - clampWpnCount(wk, b[wk]));
    }
    if (wpnDelta > 0) cost += wpnDelta * 15;

    return Math.min(240, cost);
  }

  function computeWeaponBudget(genome, rocketSpecs) {
    var g = normalize(genome), P = g.P;
    var s = computeSpecs(g);
    var podMul = ({ 'conjoiner-spike': 1.0, 'annular-shroud': 0.92, 'canted-bell': 1.08 })[P.podStyle] || 1.0;
    var coreRatingGW = rocketSpecs && Number.isFinite(rocketSpecs.coreRatingGW)
      ? rocketSpecs.coreRatingGW
      : (s.podCount * (240 + 360 * P.nacelleSize) * podMul);
    var radBaseMW = 520 + 160 * P.fins + (P.habRing ? 140 : 0) + 220 * P.girth +
      1250 * P.styleCoade + 120 * P.styleGothic + 110 * P.styleCathedral + 90 * P.styleDune;
    var radiatorMW = rocketSpecs && Number.isFinite(rocketSpecs.radiatorMW)
      ? rocketSpecs.radiatorMW
      : (radBaseMW * (1 - 0.34 * P.styleSleek) * (1 - 0.08 * P.styleGiger));

    var powerBudgetMW = Math.round(coreRatingGW * 1.35 + P.girth * 180);
    var heatBudgetMW = Math.round(radiatorMW * 1.25);

    var counts = {
      rail: clampWpnCount('wpnRail', P.wpnRail),
      fel: clampWpnCount('wpnFel', P.wpnFel),
      lance: clampWpnCount('wpnLance', P.wpnLance),
      missile: clampWpnCount('wpnMissile', P.wpnMissile),
      pdc: clampWpnCount('wpnPdc', P.wpnPdc)
    };
    var powerUsedMW = 0, heatUsedMW = 0, totalMounts = 0;
    var breakdown = {};
    for (var i = 0; i < WEAPON_KEYS.length; i++) {
      var k = WEAPON_KEYS[i], sp = WEAPON_SPECS[k];
      var c = clampWpnCount(k, P[k]);
      var pW = c * sp.powerMW, hW = c * sp.heatMW;
      powerUsedMW += pW;
      heatUsedMW += hW;
      totalMounts += c;
      breakdown[k] = { count: c, powerMW: pW, heatMW: hW };
    }
    var powerFrac = powerBudgetMW > 0 ? powerUsedMW / powerBudgetMW : 99;
    var heatFrac = heatBudgetMW > 0 ? heatUsedMW / heatBudgetMW : 99;
    var overPower = powerUsedMW > powerBudgetMW;
    var overHeat = heatUsedMW > heatBudgetMW;
    return {
      counts: counts,
      breakdown: breakdown,
      totalMounts: totalMounts,
      powerUsedMW: powerUsedMW,
      powerBudgetMW: powerBudgetMW,
      powerMarginMW: powerBudgetMW - powerUsedMW,
      powerFrac: powerFrac,
      heatUsedMW: heatUsedMW,
      heatBudgetMW: heatBudgetMW,
      heatMarginMW: heatBudgetMW - heatUsedMW,
      heatFrac: heatFrac,
      overPower: overPower,
      overHeat: overHeat,
      withinBudget: !overPower && !overHeat
    };
  }

  function loadFleet() {
    if (typeof localStorage === 'undefined') return PRESETS.map(normalize);
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        for (var i = 0; i < LEGACY_KEYS.length; i++) {
          raw = localStorage.getItem(LEGACY_KEYS[i]);
          if (raw) break;
        }
      }
      if (!raw) return PRESETS.map(normalize);
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || !parsed.length) return PRESETS.map(normalize);
      // Ensure Long Patience v3 preset defaults lead if migrating an unedited v1/v2 list
      return parsed.map(normalize);
    } catch (e) {
      return PRESETS.map(normalize);
    }
  }

  function saveFleet(list) {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list.map(normalize)));
    } catch (e) {}
  }

  var api = {
    HULL_SHAPES: HULL_SHAPES,
    HULL_LABELS: HULL_LABELS,
    AFT_SHAPES: AFT_SHAPES,
    AFT_LABELS: AFT_LABELS,
    POD_STYLES: POD_STYLES,
    POD_LABELS: POD_LABELS,
    ARCHS: ARCHS,
    ARCH_LABELS: ARCH_LABELS,
    ICE_SYMMETRIES: ICE_SYMMETRIES,
    ICE_SYMMETRY_LABELS: ICE_SYMMETRY_LABELS,
    PORT_PLACEMENTS: PORT_PLACEMENTS,
    PORT_PLACEMENT_LABELS: PORT_PLACEMENT_LABELS,
    DIAL_KEYS: DIAL_KEYS,
    STYLE_KEYS: STYLE_KEYS,
    STYLE_LABELS: STYLE_LABELS,
    STYLE_DESCRIPTIONS: STYLE_DESCRIPTIONS,
    STYLE_KIT_IDS: STYLE_KIT_IDS,
    WEAPON_KEYS: WEAPON_KEYS,
    WEAPON_SPECS: WEAPON_SPECS,
    WEAPON_PRESETS: WEAPON_PRESETS,
    computeWeaponBudget: computeWeaponBudget,
    PRESETS: PRESETS,
    findPreset: findPreset,
    styleWeights: styleWeights,
    mulberry32: mulberry32,
    normalize: normalize,
    randomGenome: randomGenome,
    encodeShareCode: encodeShareCode,
    decodeShareCode: decodeShareCode,
    computeSpecs: computeSpecs,
    computeRocketSpecs: computeRocketSpecs,
    computeRefitCost: computeRefitCost,
    loadFleet: loadFleet,
    saveFleet: saveFleet
  };

  // Conjoiner drives are reactionless quantum-vacuum taps: no propellant tank, no delta-v budget.
  // The real limits are core waste heat (radiators) and the cryo-ice ISM shield.
  function computeRocketSpecs(genome) {
    var P = normalize(genome).P, s = computeSpecs(genome);
    var reversibleDrive = P.iceSymmetry === 'fore';
    var hullMt = 2 + P.girth * 1.8 + P.needleLen + P.aftLen * 0.7 + P.fins * 0.06;
    var dryMassMt = hullMt + s.iceMt;
    var baseVe = ({ 'conjoiner-spike': 0.86, 'annular-shroud': 0.78,
      'canted-bell': 0.72 })[P.podStyle] || 0.80;
    var exhaustVelC = Math.min(0.94, baseVe + (reversibleDrive ? 0 : 0.03));
    var maxAccelG = Math.min(2.8, 1.4 + s.podCount * 0.14 + P.nacelleSize * 0.28 +
      (P.podStyle === 'canted-bell' ? 0.28 : 0) + (reversibleDrive ? 0 : 0.10));
    var podMul = ({ 'conjoiner-spike': 1.0, 'annular-shroud': 0.92, 'canted-bell': 1.08 })[P.podStyle] || 1.0;
    var coreRatingGW = s.podCount * (240 + 360 * P.nacelleSize) * podMul;
    // Radiator capacity: hull skin + fins + hab ring; CoaDE radiator wings add a lot, buried
    // stealth exhausts (sleek) trap heat, wet biomech chitin (giger) radiates a little worse.
    var radBaseMW = 520 + 160 * P.fins + (P.habRing ? 140 : 0) + 220 * P.girth +
      1250 * P.styleCoade + 120 * P.styleGothic + 110 * P.styleCathedral + 90 * P.styleDune;
    var radiatorMW = radBaseMW * (1 - 0.34 * P.styleSleek) * (1 - 0.08 * P.styleGiger);
    var coreWasteMW = 360 + s.podCount * 95 + 220 * P.nacelleSize;
    var thermalHeadroom = Math.min(2.0, Math.max(0.25, radiatorMW / coreWasteMW));
    // Steady-state accel where waste heat matches radiator rejection ((a/1.5)^1.6 = headroom).
    var sustainedAccelG = Math.min(maxAccelG, 1.5 * Math.pow(thermalHeadroom, 1 / 1.6));
    var iceShieldRating = P.iceCoverage * (0.35 + 0.65 * P.iceThick);
    var coolingK = 0.94 + 0.06 * Math.min(1, thermalHeadroom);
    var maxSafeBetaPct = Math.min(99.9, 100 * (0.35 + 0.64 * Math.sqrt(iceShieldRating)) * coolingK);
    var weapons = computeWeaponBudget(genome, { coreRatingGW: coreRatingGW, radiatorMW: radiatorMW });
    return {
      totalM: s.totalM,
      hullMt: hullMt,
      iceMt: s.iceMt,
      dryMassMt: dryMassMt,
      totalMassMt: dryMassMt,
      propellantMt: 0,
      reactionless: true,
      reversibleDrive: reversibleDrive,
      driveModeLabel: reversibleDrive ? 'REVERSIBLE (G-FLIP)' : 'FLIP & BURN (BI-CONE)',
      fuelLimited: false,
      maxDeltaEta: Infinity,
      deltaVCapacityLabel: 'UNLIMITED (VACUUM TAP)',
      exhaustVelC: exhaustVelC,
      maxAccelG: maxAccelG,
      sustainedAccelG: sustainedAccelG,
      coreRatingGW: coreRatingGW,
      radiatorMW: radiatorMW,
      coreWasteMW: coreWasteMW,
      thermalHeadroom: thermalHeadroom,
      maxSafeBetaPct: maxSafeBetaPct,
      iceShieldRating: iceShieldRating,
      weapons: weapons
    };
  }

  root.LighthuggerGenome = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
