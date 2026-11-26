/**
 * LighthuggerGalaxy - Real Milky Way 3D star catalog (in light-years),
 * exact relativistic constant-acceleration & flip-and-burn brachistochrone math,
 * custom GLSL multi-band Saturnian planetary rings with analytic planet shadow,
 * 3D orbital stations, NPC lighthuggers, and Galactic North freelancer charters.
 */
(function (root) {
  'use strict';

  var G = root.LighthuggerGenome;

  // 1 standard Earth gravity in relativistic units (ly / yr^2), where c = 1 ly / yr
  var KAPPA_PER_G = (9.80665 * 31557600) / 299792458; // ~1.0322755 yr^-1

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // 28 Real Milky Way Star Systems (heliocentric galactic coordinates [x, y, z] in light-years;
  // x/z = galactic plane, y = galactic north, harmonized with transit-map.js COORD3 + real catalog stars)
  var SYSTEMS = [
    {
      id: 'sol', name: 'Sol', real: 'Sol', cls: 'G2V', T: 5778, xyz: [0, 0, 0],
      faction: 'UPLB', station: { name: 'Titan Cryo-Spindle', type: 'spindle' },
      exoNote: 'G2V Yellow Dwarf \u00b7 Ringed Gas Giant Saturn & Icy Moons',
      binary: null,
      moons: [{ r: 2.2, dist: 56, angle: 0.9, y: 8, col: 0xe6d3b3 }, { r: 1.3, dist: 46, angle: 2.4, y: -5, col: 0xcbe9ff }],
      pose: { px: 70, py: -10, pz: -175, sx: -52, sy: 18, sz: -128 },
      planet: { name: 'Saturn', kind: 'saturnian', radius: 27, ringPalette: 'warm-cream', hasRings: true, ringStyle: 'saturn', tilt: [0.43, 0.18] },
      lore: 'Cradle system; Cassini-belt ice harvesters and outer Jovian drydocks.'
    },
    {
      id: 'proxima', name: 'Proxima', real: 'Proxima Centauri', cls: 'M5.5V', T: 3042, xyz: [2.93, 0.14, -3.06],
      faction: 'HOMEWORLDS', station: { name: 'Astraeus Flare-Shield', type: 'conjoiner-nest' },
      exoNote: 'M5.5V Flare Dwarf \u00b7 Tidally Locked Rocky Eyeball World (Proxima b)',
      binary: { name: 'Alpha Cen AB (distant)', cls: 'G2V+K1V', T: 5500, offset: [-74, 46, -240], scale: 0.48 },
      moons: [],
      pose: { px: 50, py: -6, pz: -162, sx: -48, sy: 24, sz: -120 },
      planet: { name: 'Proxima b', kind: 'eyeball-rock', radius: 21, ringPalette: 'rose-silicate', hasRings: false, ringStyle: 'none', tilt: [0.18, -0.10] },
      lore: 'Red-dwarf terminator settlements sheltered behind basalt flare-shields above a molten dayside.'
    },
    {
      id: 'rigil', name: 'Alpha Centauri', real: 'Rigil Kentaurus (Alpha Cen A/B)', cls: 'G2V', T: 5790, xyz: [3.03, -0.05, -3.15],
      faction: 'HOMEWORLDS', station: { name: 'Chiron Orbital Ring', type: 'torus' },
      exoNote: 'G2V + K1V Tight Binary \u00b7 Ringed Chiron Gas Giant',
      binary: { name: 'Alpha Cen B', cls: 'K1V', T: 5260, offset: [-46, 30, -220], scale: 0.85 },
      moons: [{ r: 1.9, dist: 52, angle: 1.4, y: 6, col: 0xd9c29e }],
      pose: { px: 64, py: -14, pz: -182, sx: -54, sy: 20, sz: -130 },
      planet: { name: 'Chiron Giant', kind: 'saturnian', radius: 26, giantPalette: 'cerulean-cloud', ringPalette: 'icy-cyan', hasRings: true, ringStyle: 'double-gap', tilt: [0.48, 0.12] },
      lore: 'Twin-sun metropolitan knot and oldest interstellar lighthugger anchorage.'
    },
    {
      id: 'barnard', name: "Barnard's Star", real: "Barnard's Star", cls: 'M4V', T: 3134, xyz: [-5.55, -1.30, 1.76],
      faction: 'HOMEWORLDS', station: { name: 'Barnard Cinder-Spindle', type: 'spindle' },
      exoNote: 'Old Halo M4V Dwarf \u00b7 Sub-Glacial Cryo Super-Earth',
      binary: null,
      moons: [{ r: 1.5, dist: 38, angle: -0.7, y: -7, col: 0x9fc8de }],
      pose: { px: 54, py: 4, pz: -172, sx: -58, sy: 22, sz: -124 },
      planet: { name: 'Barnard Cryo-b', kind: 'pelagic-ocean', radius: 21, ringPalette: 'icy-cyan', hasRings: false, ringStyle: 'none', tilt: [0.22, -0.14] },
      lore: 'High-proper-motion halo dwarf; quiet deep-storage vaults and sub-surface ice quarries.'
    },
    {
      id: 'wolf359', name: 'Wolf 359', real: 'Wolf 359 (CN Leonis)', cls: 'M6V', T: 2800, xyz: [-1.90, 7.15, -2.42],
      faction: 'CONJOINER', station: { name: 'Ember Conjoiner Nest', type: 'conjoiner-nest' },
      exoNote: 'Active M6V Flare Red Dwarf \u00b7 Rust-Banded Super-Jovian',
      binary: null,
      moons: [{ r: 2.0, dist: 48, angle: 0.6, y: 11, col: 0xd98a6c }],
      pose: { px: 60, py: -12, pz: -176, sx: -46, sy: 26, sz: -122 },
      planet: { name: 'CN Leonis Major', kind: 'rust-giant', radius: 24, giantPalette: 'dusty-terracotta', ringPalette: 'rose-silicate', hasRings: true, ringStyle: 'thin', tilt: [0.38, 0.29] },
      lore: 'Hollowed carbonaceous planetoid shipyard tended by Conjoiner drive-wrights.'
    },
    {
      id: 'lalande', name: 'Lalande 21185', real: 'Lalande 21185', cls: 'M2V', T: 3828, xyz: [-3.82, 7.28, 1.32],
      faction: 'ULTRONAUT', station: { name: 'Glacier Harvester-4', type: 'loom' },
      exoNote: 'M2V Red Dwarf \u00b7 Cold Pelagic Super-Earth & Cometary Shoal',
      binary: null,
      moons: [],
      pose: { px: 48, py: -8, pz: -168, sx: -55, sy: 18, sz: -126 },
      planet: { name: 'Lalande Oceanus', kind: 'pelagic-ocean', radius: 23, ringPalette: 'icy-cyan', hasRings: true, ringStyle: 'debris', tilt: [0.34, -0.12] },
      lore: 'Purest deuterium-poor cometary ice in the local 10-light-year bubble.'
    },
    {
      id: 'sirius', name: 'Sirius', real: 'Sirius A & B', cls: 'A1V', T: 9940, xyz: [-5.75, -1.35, -6.28],
      faction: 'ULTRONAUT', station: { name: 'Sirius Antimatter Loom', type: 'loom' },
      exoNote: 'A1V Blue-White Star + Sirius B White Dwarf \u00b7 Sapphire Plasma Torus',
      binary: { name: 'Sirius B (White Dwarf)', cls: 'DA2', T: 25000, offset: [-22, 34, -195], scale: 0.42 },
      moons: [],
      pose: { px: 62, py: -15, pz: -184, sx: -52, sy: 22, sz: -132 },
      planet: { name: 'Canis Plasma-Giant', kind: 'sapphire-disk', radius: 25, giantPalette: 'electric-indigo', ringPalette: 'violet-halo', hasRings: true, ringStyle: 'resonant-arcs', tilt: [0.36, 0.22] },
      lore: 'Blinding A-star and compact white-dwarf magnetic forge supplying confinement fuel.'
    },
    {
      id: 'epseri', name: 'Epsilon Eridani', real: 'Epsilon Eridani (Yellowstone)', cls: 'K2V', T: 5084, xyz: [-6.12, -8.35, -1.85],
      faction: 'DEMARCHIST', station: { name: 'Glitter Band Carousel-7', type: 'torus' },
      exoNote: 'Young K2V Star \u00b7 Dusty Kuiper Belt & Ringed Jovian AEgir',
      binary: null,
      moons: [{ r: 2.3, dist: 54, angle: 0.4, y: 10, col: 0xe6d9c2 }, { r: 1.6, dist: 64, angle: 2.1, y: -6, col: 0x9ec4a4 }],
      pose: { px: 68, py: -12, pz: -178, sx: -50, sy: 24, sz: -128 },
      planet: { name: '\u00c6gir Ringed Giant', kind: 'saturnian', radius: 29, giantPalette: 'rose-ivory', ringPalette: 'rose-silicate', hasRings: true, ringStyle: 'saturn', tilt: [0.40, 0.16] },
      lore: 'Ten thousand glittering orbital habitats circling above a ringed amber giant.'
    },
    {
      id: 'tartarus', name: 'Ross 128', real: 'Ross 128 (Tartarus)', cls: 'M4V', T: 3192, xyz: [6.82, 7.68, -3.94],
      faction: 'HOMEWORLDS', station: { name: 'Tartarus Deep-Vault', type: 'conjoiner-nest' },
      exoNote: 'Quiet M4V Star \u00b7 Temperate Terrestrial World (Ross 128 b)',
      binary: null,
      moons: [],
      pose: { px: 46, py: -4, pz: -158, sx: -48, sy: 16, sz: -122 },
      planet: { name: 'Tartarus Prime', kind: 'terrestrial-archipelago', radius: 20, ringPalette: 'warm-cream', hasRings: false, ringStyle: 'none', tilt: [0.24, -0.10] },
      lore: 'Calm red sun with ancient subterranean archives and slow-time monasteries.'
    },
    {
      id: 'cygni61', name: '61 Cygni', real: '61 Cygni A/B', cls: 'K5V', T: 4526, xyz: [5.92, -1.18, 9.75],
      faction: 'DEMARCHIST', station: { name: 'Sky-Edge Tether', type: 'spindle' },
      exoNote: 'K5V + K7V Wide Orange Binary \u00b7 Ringed Bessel Giant',
      binary: { name: '61 Cygni B', cls: 'K7V', T: 4040, offset: [-58, 36, -215], scale: 0.78 },
      moons: [{ r: 1.7, dist: 50, angle: -0.9, y: 9, col: 0xd8b288 }],
      pose: { px: 66, py: -14, pz: -180, sx: -52, sy: 22, sz: -130 },
      planet: { name: 'Bessel Giant', kind: 'saturnian', radius: 26, giantPalette: 'champagne-gold', ringPalette: 'amber-gold', hasRings: true, ringStyle: 'saturn', tilt: [0.39, 0.24] },
      lore: 'Wide K-orange binary on the Cygnus Spur; staging port for northern runs.'
    },
    {
      id: 'procyon', name: 'Procyon', real: 'Procyon A & B', cls: 'F5IV', T: 6530, xyz: [-8.14, 0.92, -8.06],
      faction: 'ULTRONAUT', station: { name: 'Procyon Free-Port', type: 'oneill' },
      exoNote: 'F5IV Subgiant + White Dwarf Procyon B \u00b7 Silicate Ring World',
      binary: { name: 'Procyon B (White Dwarf)', cls: 'DQZ', T: 7740, offset: [-26, 38, -200], scale: 0.40 },
      moons: [],
      pose: { px: 58, py: -10, pz: -174, sx: -56, sy: 18, sz: -124 },
      planet: { name: 'Antecanis', kind: 'ice-giant', radius: 27, giantPalette: 'glacial-indigo', ringPalette: 'obsidian-carbon', hasRings: true, ringStyle: 'thin', tilt: [0.42, -0.19] },
      lore: 'Neutral Ultronaut auction ring where century-old hulls trade star-charts.'
    },
    {
      id: 'tauceti', name: 'Tau Ceti', real: 'Tau Ceti (Tian Cang)', cls: 'G8V', T: 5344, xyz: [-3.36, -11.41, 0.47],
      faction: 'HOMEWORLDS', station: { name: 'Tian Cang Ring-Dock', type: 'torus' },
      exoNote: 'G8V Star \u00b7 4+ Exoplanet System & Massive Cometary Debris Belt',
      binary: null,
      moons: [{ r: 2.2, dist: 46, angle: 0.5, y: 7, col: 0x9ac4d6 }, { r: 2.8, dist: 72, angle: -0.7, y: -10, col: 0xc2aa88 }],
      pose: { px: 56, py: -12, pz: -176, sx: -50, sy: 22, sz: -128 },
      planet: { name: 'Tau Ceti e (Tian Cang)', kind: 'terrestrial-archipelago', radius: 22, ringPalette: 'warm-cream', hasRings: true, ringStyle: 'debris', tilt: [0.28, 0.14] },
      lore: 'Dense cometary debris disk; hull-ice sculptors prize its silicate-laced frost.'
    },
    {
      id: 'luyten', name: "Luyten's Star", real: "Luyten's Star (GJ 273)", cls: 'M3.5V', T: 3382, xyz: [-8.03, 7.71, -4.97],
      faction: 'UPLB', station: { name: 'Luyten Meridian', type: 'bishop' },
      exoNote: 'M3.5V Red Dwarf \u00b7 Super-Earth GJ 273b & Ice Giant c',
      binary: null,
      moons: [{ r: 1.8, dist: 44, angle: 1.1, y: 5, col: 0xc9b4f2 }],
      pose: { px: 52, py: -6, pz: -168, sx: -54, sy: 24, sz: -126 },
      planet: { name: 'GJ 273c', kind: 'ice-giant', radius: 23, giantPalette: 'midnight-slate', ringPalette: 'violet-halo', hasRings: false, ringStyle: 'none', tilt: [0.50, 0.10] },
      lore: 'Busy UPLB packet relay linking Sol toward the Gemini-Cancer sector.'
    },
    {
      id: 'lacaille', name: 'Lacaille 9352', real: 'Lacaille 9352', cls: 'M0.5V', T: 3688, xyz: [4.85, -9.42, -2.18],
      faction: 'ULTRONAUT', station: { name: 'High-Drift Cairn', type: 'loom' },
      exoNote: 'Bright M0.5V Dwarf \u00b7 Twin Rocky Super-Earths',
      binary: null,
      moons: [{ r: 2.0, dist: 42, angle: -0.6, y: 6, col: 0xc77d63 }],
      pose: { px: 50, py: -8, pz: -164, sx: -50, sy: 20, sz: -122 },
      planet: { name: 'Piscis Austrinus b', kind: 'eyeball-rock', radius: 21, ringPalette: 'rose-silicate', hasRings: false, ringStyle: 'none', tilt: [0.22, -0.18] },
      lore: 'Fourth-fastest proper-motion star; favored by hermit crews and deep-time observers.'
    },
    {
      id: 'wolf1061', name: 'Wolf 1061', real: 'Wolf 1061', cls: 'M3V', T: 3342, xyz: [-4.56, -0.48, -13.28],
      faction: 'UPLB', station: { name: 'Ophiuchus Spindle', type: 'spindle' },
      exoNote: 'M3V Dwarf \u00b7 Compact Three-World Habitable/Ice Chain',
      binary: null,
      moons: [{ r: 2.4, dist: 45, angle: 0.3, y: 8, col: 0x99d6e8 }, { r: 2.1, dist: 62, angle: -0.4, y: -5, col: 0xe29876 }],
      pose: { px: 48, py: -6, pz: -166, sx: -54, sy: 24, sz: -124 },
      planet: { name: 'Wolf 1061d', kind: 'pelagic-ocean', radius: 22, ringPalette: 'icy-cyan', hasRings: false, ringStyle: 'none', tilt: [0.28, 0.15] },
      lore: 'Compact three-planet chain suspended close above an amber-red photosphere.'
    },
    {
      id: 'gowjin', name: 'Gliese 876', real: 'Gliese 876 (Gowjin)', cls: 'M4V', T: 3129, xyz: [5.06, -11.40, -8.69],
      faction: 'UPLB', station: { name: 'Gowjin Shepherd Dock', type: 'bishop' },
      exoNote: 'M4V Red Dwarf \u00b7 Laplace-Resonant Ringed Jovian Twins',
      binary: null,
      moons: [{ r: 3.1, dist: 66, angle: 0.7, y: 12, col: 0xe6bf94 }],
      pose: { px: 68, py: -14, pz: -186, sx: -48, sy: 22, sz: -130 },
      planet: { name: 'Gowjin Resonant-b', kind: 'saturnian', radius: 29, giantPalette: 'jade-pearl', ringPalette: 'jade-frost', hasRings: true, ringStyle: 'resonant-arcs', tilt: [0.44, 0.14] },
      lore: 'Laplace-resonant super-Jovian twins with sweeping 200,000-km ring planes.'
    },
    {
      id: 'altair', name: 'Altair', real: 'Altair (Alpha Aquilae)', cls: 'A7V', T: 7550, xyz: [12.45, -2.65, 10.95],
      faction: 'DEMARCHIST', station: { name: 'Altair Equatorial Sling', type: 'loom' },
      exoNote: 'Rapid-Spinning Oblate A7V Star \u00b7 Sapphire Storm Giant',
      binary: null,
      moons: [{ r: 1.6, dist: 48, angle: 1.3, y: -8, col: 0x94d2ff }],
      pose: { px: 60, py: -12, pz: -176, sx: -56, sy: 20, sz: -126 },
      planet: { name: 'Aquila Oblate-1', kind: 'sapphire-disk', radius: 26, giantPalette: 'azure-rayleigh', ringPalette: 'obsidian-carbon', hasRings: true, ringStyle: 'thin', tilt: [0.33, -0.22] },
      lore: 'Rapidly spinning oblate white star; intense UV wind carves razor ice prows.'
    },
    {
      id: 'pavonis', name: 'Delta Pavonis', real: 'Delta Pavonis (Resurgam)', cls: 'G8IV', T: 5604, xyz: [14.80, -8.90, -10.12],
      faction: 'ULTRONAUT', station: { name: 'Hades Matrix Watch', type: 'conjoiner-nest' },
      exoNote: 'G8IV Subgiant \u00b7 Desert Ruin-World & Ringed Gargantua',
      binary: null,
      moons: [{ r: 2.5, dist: 56, angle: -0.5, y: 10, col: 0xc29e72 }],
      pose: { px: 66, py: -14, pz: -184, sx: -50, sy: 24, sz: -128 },
      planet: { name: 'Resurgam / Gargantua', kind: 'terrestrial-archipelago', radius: 24, ringPalette: 'amber-gold', hasRings: true, ringStyle: 'thin', tilt: [0.40, 0.16] },
      lore: 'Aging solar analog; archaeological expeditions sift silent Amarantin strata below.'
    },
    {
      id: 'acass', name: 'Eta Cassiopeiae', real: 'Achird (Eta Cas A/B)', cls: 'G0V', T: 5973, xyz: [-10.85, -1.92, 16.25],
      faction: 'ULTRONAUT', station: { name: 'Achird Guildhall', type: 'oneill' },
      exoNote: 'G0V + K7V Golden-Garnet Binary \u00b7 Outer Ringed Halo Giant',
      binary: { name: 'Achird B', cls: 'K7V', T: 4100, offset: [-52, 34, -220], scale: 0.72 },
      moons: [],
      pose: { px: 62, py: -12, pz: -178, sx: -54, sy: 18, sz: -126 },
      planet: { name: 'Cassiopeia Halo', kind: 'saturnian', radius: 27, giantPalette: 'violet-alkali', ringPalette: 'violet-halo', hasRings: true, ringStyle: 'gossamer-halo', tilt: [0.40, -0.15] },
      lore: 'Golden-and-garnet binary hosting the northern Ultronaut memory registry.'
    },
    {
      id: 'issetock', name: 'Gliese 581', real: 'Gliese 581 (Issetock)', cls: 'M3V', T: 3480, xyz: [-4.69, -17.16, 9.98],
      faction: 'UPLB', station: { name: 'Issetock Ice-Spire', type: 'spindle' },
      exoNote: 'M3V Red Dwarf \u00b7 Terminator Ice Super-Earth (Gliese 581c/g)',
      binary: null,
      moons: [{ r: 1.9, dist: 46, angle: 0.8, y: 7, col: 0xa496d8 }],
      pose: { px: 50, py: -8, pz: -166, sx: -48, sy: 22, sz: -124 },
      planet: { name: 'Issetock-e', kind: 'pelagic-ocean', radius: 22, ringPalette: 'violet-halo', hasRings: false, ringStyle: 'none', tilt: [0.30, 0.11] },
      lore: 'Remote high-latitude research spire monitoring deep interstellar dust.'
    },
    {
      id: 'vega', name: 'Vega', real: 'Vega (Alpha Lyrae)', cls: 'A0V', T: 9602, xyz: [4.63, 21.94, 11.15],
      faction: 'SWI', station: { name: 'Vega Sapphire Ring', type: 'torus' },
      exoNote: 'Pole-On A0V Blazing Star \u00b7 Vast Luminous Debris & Ice Planetesimal Torus',
      binary: null,
      moons: [{ r: 2.0, dist: 62, angle: -1.1, y: 6, col: 0xbfe8ff }],
      pose: { px: 58, py: -10, pz: -178, sx: -56, sy: 22, sz: -130 },
      planet: { name: 'Lyra Proto-Giant', kind: 'sapphire-disk', radius: 26, giantPalette: 'crimson-tholin', ringPalette: 'rose-silicate', hasRings: true, ringStyle: 'debris', tilt: [0.38, 0.17] },
      lore: 'Pole-on blue-white beacon ringed by a vast, luminous icy planetesimal disk.'
    },
    {
      id: 'fomalhaut', name: 'Fomalhaut', real: 'Fomalhaut (Alpha PsA)', cls: 'A3V', T: 8590, xyz: [6.95, -23.60, -4.45],
      faction: 'SWI', station: { name: 'Dagon Periastron', type: 'conjoiner-nest' },
      exoNote: 'Young A3V Star \u00b7 Sculpted 140-AU Crimson-Gold Dust Belt',
      binary: null,
      moons: [{ r: 2.3, dist: 60, angle: 0.4, y: -9, col: 0xf0cfa8 }],
      pose: { px: 60, py: -12, pz: -180, sx: -50, sy: 20, sz: -126 },
      planet: { name: 'Dagon Dust-Lord', kind: 'rust-giant', radius: 26, giantPalette: 'copper-obsidian', ringPalette: 'crimson-dust', hasRings: true, ringStyle: 'debris', tilt: [0.34, -0.21] },
      lore: 'Immense crimson-gold circumstellar dust belt around a young southern star.'
    },
    {
      id: 'pollux', name: 'Pollux', real: 'Pollux (Beta Geminorum)', cls: 'K0III', T: 4666, xyz: [-24.20, 13.80, -19.10],
      faction: 'DEMARCHIST', station: { name: 'Thestias Aerostat', type: 'loom' },
      exoNote: 'Swollen K0III Orange Giant \u00b7 Superheated Aerostat World Thestias',
      binary: null,
      moons: [],
      pose: { px: 64, py: -10, pz: -182, sx: -54, sy: 20, sz: -126 },
      planet: { name: 'Thestias', kind: 'aerostat-clouds', radius: 30, giantPalette: 'amber-silicate', ringPalette: 'amber-gold', hasRings: false, ringStyle: 'none', tilt: [0.36, 0.18] },
      lore: 'Swollen orange giant warming floating cloud-cities in Thestias upper stratosphere.'
    },
    {
      id: 'nursia', name: 'TRAPPIST-1', real: 'TRAPPIST-1 (Nursia)', cls: 'M8V', T: 2566, xyz: [-9.50, -39.55, -1.45],
      faction: 'UPLB', station: { name: 'Nursia-e Terminus', type: 'spindle' },
      exoNote: 'Ultra-Cool M8V Dwarf \u00b7 7 Tightly-Packed Resonant Terrestrial Worlds',
      binary: null,
      moons: [
        { r: 3.1, dist: 42, angle: 0.35, y: 4, col: 0xd67c5a },
        { r: 2.6, dist: 56, angle: -0.45, y: -3, col: 0x8db2d6 },
        { r: 2.2, dist: 72, angle: 0.95, y: 7, col: 0xc2d8eb }
      ],
      pose: { px: 46, py: -4, pz: -162, sx: -48, sy: 20, sz: -122 },
      planet: { name: 'Nursia Eyeball-e', kind: 'eyeball-rock', radius: 21, ringPalette: 'rose-silicate', hasRings: false, ringStyle: 'none', tilt: [0.16, 0.08] },
      lore: 'Ultra-cool crimson dwarf with seven resonant sister-worlds hanging huge like moons in each sky.'
    },
    {
      id: 'sipapu', name: 'HD 69830', real: 'HD 69830 (Sipapu)', cls: 'K0V', T: 5385, xyz: [-19.42, -14.37, -33.11],
      faction: 'SWI', station: { name: 'Sipapu Silicate Foundry', type: 'conjoiner-nest' },
      exoNote: 'K0V Star \u00b7 Triple-Neptune Chain & Olivine Asteroid Foundry',
      binary: null,
      moons: [{ r: 3.2, dist: 50, angle: 0.5, y: 6, col: 0x72b6df }, { r: 2.8, dist: 68, angle: -0.6, y: -5, col: 0x9cd2eb }],
      pose: { px: 54, py: -10, pz: -172, sx: -50, sy: 22, sz: -126 },
      planet: { name: 'Sipapu Neptune-III', kind: 'ice-giant', radius: 24, giantPalette: 'mint-cryo', ringPalette: 'jade-frost', hasRings: true, ringStyle: 'gossamer-halo', tilt: [0.40, -0.16] },
      lore: 'Three Neptunes shepherding a warm olivine dust belt twenty times denser than Sols.'
    },
    {
      id: 'gamov', name: '55 Cancri', real: 'Copernicus (55 Cancri / Gamov)', cls: 'G8V', T: 5196, xyz: [-22.48, 32.49, -10.95],
      faction: 'UPLB', station: { name: 'Copernicus Exchange', type: 'oneill' },
      exoNote: 'G8V Binary \u00b7 5-Planet Hub with Super-Earth Janssen & Giant Lipperhey',
      binary: { name: '55 Cancri B', cls: 'M4.5V', T: 3100, offset: [-60, 32, -230], scale: 0.52 },
      moons: [{ r: 2.1, dist: 54, angle: 0.9, y: -7, col: 0xffaa64 }],
      pose: { px: 66, py: -14, pz: -182, sx: -54, sy: 20, sz: -128 },
      planet: { name: 'Lipperhey', kind: 'saturnian', radius: 30, giantPalette: 'pearl-water', ringPalette: 'icy-cyan', hasRings: true, ringStyle: 'double-gap', tilt: [0.41, 0.18] },
      lore: 'Great northern trade nexus; five-planet system with diamond-mantle Janssen glowing inward.'
    },
    {
      id: 'bakunawa', name: 'LHS 1140', real: 'LHS 1140 (Bakunawa)', cls: 'M4.5V', T: 3216, xyz: [-33.11, -34.07, -11.11],
      faction: 'UPLB', station: { name: 'Bakunawa Abyssal', type: 'loom' },
      exoNote: 'M4.5V Red Dwarf \u00b7 Pelagic Eyeball/Ice Ocean World (LHS 1140b)',
      binary: null,
      moons: [],
      pose: { px: 50, py: -8, pz: -168, sx: -50, sy: 22, sz: -124 },
      planet: { name: 'Bakunawa Oceanus', kind: 'pelagic-ocean', radius: 24, ringPalette: 'violet-halo', hasRings: false, ringStyle: 'none', tilt: [0.29, -0.14] },
      lore: 'Pelagic super-Earth with an open sub-stellar ocean iris gazing out of global pack ice.'
    },
    {
      id: 'yake', name: 'Ya Ke', real: 'Nu2 Canis Majoris (Ya Ke)', cls: 'K1III', T: 4790, xyz: [-30.04, -11.55, -55.33],
      faction: 'ULTRONAUT', station: { name: 'Galactic North Cairn', type: 'conjoiner-nest' },
      exoNote: 'K1III Orange Subgiant \u00b7 Outer Frontier Beacon & Ringed Titan Hesperus',
      binary: null,
      moons: [{ r: 2.4, dist: 58, angle: -0.8, y: 12, col: 0xf2d4a6 }],
      pose: { px: 68, py: -14, pz: -188, sx: -54, sy: 24, sz: -130 },
      planet: { name: 'Hesperus Crown', kind: 'saturnian', radius: 31, giantPalette: 'emerald-methane', ringPalette: 'jade-frost', hasRings: true, ringStyle: 'resonant-arcs', tilt: [0.43, 0.15] },
      lore: 'Distant orange subgiant gateway; long-tau pilgrims leave time-capsules here.'
    }
  ];

  // Approximate primary masses/radii in solar units and scenario berth orbit in AU.
  // Fictional ports and companions retain their lore; phases are simulation epochs.
  var stellar = {
    sol:[1,1,9.57], proxima:[0.122,0.154,0.0486], rigil:[1.08,1.22,1.8],
    barnard:[0.162,0.187,0.4], wolf359:[0.09,0.144,0.8], lalande:[0.39,0.39,0.079],
    sirius:[2.06,1.71,1.5], epseri:[0.82,0.74,3.5], tartarus:[0.168,0.197,0.0496],
    cygni61:[0.70,0.665,2.2], procyon:[1.50,2.05,1.9], tauceti:[0.78,0.79,0.54],
    luyten:[0.29,0.293,0.0365], lacaille:[0.49,0.474,0.069], wolf1061:[0.294,0.308,0.47],
    gowjin:[0.33,0.37,0.208], altair:[1.79,1.8,2.2], pavonis:[0.99,1.22,1.4],
    acass:[0.97,1.04,3.1], issetock:[0.31,0.30,0.028], vega:[2.14,2.36,7.7],
    fomalhaut:[1.92,1.84,115], pollux:[1.9,8.8,1.64], nursia:[0.09,0.119,0.0293],
    sipapu:[0.86,0.90,0.63], gamov:[0.91,0.94,5.77], bakunawa:[0.18,0.216,0.095],
    yake:[1.5,2.4,2.6]
  };
  var AU = 149597870.7;
  // NASA Exoplanet Archive pscomppars: orbit AU, composite radius (Earth),
  // best mass (Earth). Composite rows include inferred radii and minimum masses.
  // https://exoplanetarchive.ipac.caltech.edu/TAP/
  var archiveBodies = {
    proxima:[['Proxima Cen b',.04848,1.02,1.055],['Proxima Cen d',.02881,.692,.26]],
    lalande:[['GJ 411 b',.07879,1.45,2.69],['HD 95735 c',2.94,3.76,13.6]],
    epseri:[['eps Eri b',3.53,13.8,317.828]], tartarus:[['Ross 128 b',.0496,1.11,1.4]],
    gowjin:[['GJ 876 b',.208317,13.3,723.224],['GJ 876 c',.12959,14,226.985],['GJ 876 d',.02080665,2.51,6.83]],
    nursia:[['TRAPPIST-1 e',.02925,.92,.692],['TRAPPIST-1 f',.03849,1.045,1.039],['TRAPPIST-1 g',.04683,1.129,1.321]],
    luyten:[['GJ 273 c',.036467,1.06,1.18],['GJ 273 b',.091101,1.51,2.89]],
    sipapu:[['HD 69830 d',.63,4.45,18.1],['HD 69830 c',.186,3.46,11.8],['HD 69830 b',.0785,3.17,10.2]],
    gamov:[['55 Cnc d',5.6,13,1232.493],['55 Cnc e',.01544,1.875,7.99],['55 Cnc f',.802,7.59,44.812]],
    wolf1061:[['Wolf 1061 d',.47,2.69,7.7],['Wolf 1061 c',.089,1.66,3.41]],
    bakunawa:[['LHS 1140 b',.0946,1.73,5.6],['LHS 1140 c',.027,1.272,1.91]],
    lacaille:[['GJ 887 b',.0683,1.8,3.9],['GJ 887 c',.121,2.43,6.5]],
    issetock:[['GJ 581 e',.02799,1.38,2.48],['GJ 581 c',.0718,2.50,6.81]]
  };
  function companion(name, orbitRadiusAU, radiusKm, muKm3S2, kind) {
    return { name:name, orbitRadiusAU:orbitRadiusAU, radiusKm:radiusKm, muKm3S2:muKm3S2,
      kind:kind || 'terrestrial-archipelago', radius:21, tilt:[0.24,0.04], hasRings:false,
      ringStyle:'none', ringPalette:'warm-cream', moons:[] };
  }
  function moon(name, orbitRadiusKm, radiusKm, muKm3S2, kind, lumpy) {
    return {name, orbitRadiusKm, radiusKm, muKm3S2, kind, lumpy: !!lumpy,
      incRad: 0.021, phaseRad: orbitRadiusKm % 6.28};
  }
  function populateSol(sys) {
    var worlds = [
      ['Mercury',.387,2439.7,22032,'cratered-rock'],
      ['Venus',.723,6051.8,324859,'hazy-venus'],
      ['Earth',1,6378,398600.44,'terrestrial-archipelago'],
      ['Mars',1.524,3396,42828.38,'arid-mars'],
      ['Ceres',2.767,473,62.6,'asteroid-dwarf'],
      ['Jupiter',5.203,71492,126686534,'rust-giant'],
      ['Uranus',19.19,25559,5793939,'ice-giant'],
      ['Neptune',30.07,24764,6835100,'ice-giant'],
      ['Pluto',39.48,1188.3,871,'hazy-planetoid'],
      ['1P/Halley',17.8,11,.000015,'comet']
    ];
    var p = sys.planets;
    worlds.forEach(row => p.push(companion(...row)));
    p[0].moons.push(moon('Rhea',527108,764,154,'icy'),moon('Iapetus',3560820,735,121,'icy'));
    p[3].moons.push(moon('Luna',384400,1737.4,4902.8,'cratered-rock'));
    p[4].moons.push(moon('Phobos',9376,11.1,.00071,'cratered-rock',true),moon('Deimos',23463,6.2,.000098,'cratered-rock',true));
    p[5].lumpy = true;
    p[6].moons.push(moon('Io',421700,1822,5959,'arid-mars'),moon('Europa',671100,1561,3203,'cryovolcanic'),
      moon('Ganymede',1070400,2634,9888,'icy'),moon('Callisto',1882700,2410,7179,'cratered-rock'));
    p[7].moons.push(moon('Titania',435910,789,228,'icy'),moon('Miranda',129390,236,4.4,'cratered-rock'));
    p[8].moons.push(moon('Triton',354759,1353,1428,'cryovolcanic'));
    p[9].moons.push(moon('Charon',19596,606,106,'icy'));
    [7,8].forEach(j => Object.assign(p[j],{hasRings:true,ringStyle:'thin',ringPalette:j===7?'icy-cyan':'violet-halo'}));
    p[10].isComet = p[10].lumpy = true;
  }
  function populateCompanions(sys) {
    var seed = Array.from(sys.id).reduce((h,c) => Math.imul(h,31)+c.charCodeAt(0)|0,sys.T);
    var rng = G.mulberry32(seed);
    var count = Math.min(7-sys.planets.length,3+Math.floor(rng()*3));
    var cool = sys.T < 4000, hot = sys.T > 6400 || /IV/.test(sys.cls);
    var hz = Math.max(.018, sys.starRadiusKm/695700 * Math.pow(sys.T/5778,2));
    for (var i=0; i<count; i++) {
      var outer = i===count-1;
      var kind = outer ? (hot && rng()<.45 ? 'brown-dwarf' : cool && rng()<.5 ? 'ice-giant' : 'comet')
        : i===0 ? (cool?'eyeball-rock':'arid-mars') : i===1 ? (cool?'pelagic-ocean':'terrestrial-archipelago')
        : (hot?'rust-giant':'ice-giant');
      var giant = /giant|brown/.test(kind), comet = kind==='comet';
      var r = comet ? 5+rng()*12 : giant ? (kind==='ice-giant'?26000:70000)*(.8+.35*rng()) : 4000+4000*rng();
      var au = hz*(i===0?.32:i===1?1:Math.pow(cool?2:3,i-1)*2)*(.96+.08*rng());
      while(sys.planets.some(w=>Math.abs(Math.log(w.orbitRadiusAU/au))<.14)) au*=1.2;
      var w = companion(sys.name+' '+['Ember','Tide','Veil','Reach','Drift'][i],au,r,
        kind==='brown-dwarf'?2.1e9:398600*Math.pow(r/6371,3)*(comet?.12:giant?.3:1),kind);
      w.isComet = w.lumpy = comet;
      if (giant) Object.assign(w,{hasRings:true,ringStyle:'thin',ringPalette:'icy-cyan'});
      if (!comet && i>0) {
        var km = r*(giant?.025:.12);
        w.moons.push(moon(w.name+' '+(giant?'Frost':'Satellite'),r*(6+rng()*7),km,398600*Math.pow(km/6371,3)*.45,
          giant?'cryovolcanic':cool?'hazy-planetoid':'cratered-rock'));
      }
      sys.planets.push(w);
    }
  }
  function initSystemBodies(sys, index, massSolar, radSolar, berthAU) {
    sys.distSol = Math.hypot(sys.xyz[0], sys.xyz[1], sys.xyz[2]);
    var p = sys.planet, sol = sys.id === 'sol';
    sys.starMassSolar = massSolar;
    sys.starRadiusKm = radSolar * 695700;
    sys.muStarKm3S2 = massSolar * 132712440018;
    var giant = /saturnian|giant|disk|clouds/.test(p.kind);
    var iceGiant = p.kind === 'ice-giant';
    Object.assign(p, {
      orbitRadiusAU: berthAU,
      radiusKm: sol ? 60268 : iceGiant ? 24622 : giant ? 58232 : 7020,
      muKm3S2: sol ? 37931207 : iceGiant ? 6835100 : giant ? 37931207 : 520000,
      moons: sys.moons || []
    });
    sys.moons = p.moons;
    sys.planets = [p];
    if (sol) {
      populateSol(sys);
    } else {
      (archiveBodies[sys.id] || []).forEach(function (entry, j) {
        var world = j ? companion(entry[0], entry[1], 0, 0, entry[2] > 3 ? 'ice-giant' : undefined) : p;
        Object.assign(world, {
          catalogName: entry[0], orbitRadiusAU: entry[1], radiusKm: 6371 * entry[2],
          muKm3S2: 398600.44 * entry[3], physicalModel: 'NASA Exoplanet Archive composite'
        });
        if (j) sys.planets.push(world);
      });
      populateCompanions(sys);
    }
    sys.planets.forEach(function (body, j) {
      body.id = sys.id + '-p' + j;
      body.incRad = sol ? [.0434, .122, .059, 0, .0323, .185, .0227, .0135, .0309, .299, 2.83][j] : 0.012 * (1 + j);
      body.phaseRad = (index * 0.91 + j * 2.31) % (Math.PI * 2);
      body.physicalModel = body.physicalModel || (sol ? 'rounded solar-system data' : 'scenario estimates');
      body.moons.forEach(function (m, k) {
        m.id = body.id + '-m' + k;
        if (m.radiusKm) return;
        Object.assign(m, {
          name: sol ? ['Titan', 'Enceladus'][k] : body.name + ' ' + (k + 1),
          orbitRadiusKm: sol ? [1221870, 237948][k] : body.radiusKm * (4.3 + 2.5 * k),
          radiusKm: sol ? [2574.7, 252.1][k] : body.radiusKm * (0.026 + 0.009 * k),
          muKm3S2: sol ? [8978.1, 7.21][k] : body.muKm3S2 * (0.000012 + 0.000009 * k),
          incRad: 0.008 * (1 + k), phaseRad: m.angle || 0
        });
      });
    });
    if (sys.station) {
      Object.assign(sys.station, {
        parentPlanetIdx: 0,
        orbitRadiusKm: p.radiusKm * (p.hasRings ? 3.6 : 1.45),
        incRad: 0.07,
        phaseRad: 1.4
      });
    }
    sys.iceDeposits = buildSystemIceDeposits(sys);
  }
  SYSTEMS.forEach(function (sys, index) {
    var row = stellar[sys.id];
    sys.procedural = false;
    initSystemBodies(sys, index, row[0], row[1], row[2]);
  });

  var FRONTIER_REVEAL_SOL_LY = 40;
  var FRONTIER_FOG_LY = 50;
  var FRONTIER_SCAN_RADIUS_LY = 28;
  var SENSOR_HORIZON_LY = 50;
  var SECTOR_CELL_LY = 50;
  var MILKY_WAY = {
    radiusLy: 52000,
    solRadiusLy: 26602,
    coreXyzSol: [-1500, -65, -26560],
    solXyzMw: [1500, 65, 26560],
    barHalfLenLy: 13500,
    barAngleRad: 0.49,
    arms: [
      { id: 'perseus', name: 'PERSEUS ARM', offsetRad: 0.35, color: '#8ad8ff' },
      { id: 'scutum', name: 'SCUTUM-CENTAURUS ARM', offsetRad: Math.PI * 0.5 + 0.35, color: '#9ee8ff' },
      { id: 'sagittarius', name: 'SAGITTARIUS-CARINA ARM', offsetRad: Math.PI + 0.35, color: '#ffc88a' },
      { id: 'norma', name: 'NORMA-OUTER ARM', offsetRad: Math.PI * 1.5 + 0.35, color: '#b4a8ff' }
    ]
  };
  var FRONTIER_NAMES = [
    'Kestrel Drift', 'Acheron Reach', 'Sable Meridian', 'Vespera Crown',
    'Tharsis Hollow', 'Ochre Spire', 'Nadir Chime', 'Halcyon Silt',
    'Brindle Cairn', 'Cinnabar Deep', 'Marrow Well', 'Lantern Verge',
    'Beryl Fold', 'Pyre Shoal', 'Kohl Rift', 'Pallid Fen',
    'Tallow Wake', 'Opal Basin', 'Cinder Arch', 'Ashen Pelagic',
    'Votive Shoal', 'Corvus Spur', 'Dusk Bastion', 'Orchid Anvil',
    'Barrow Gleam', 'Quarry Gate', 'Cobalt Fen', 'Saffron Drift',
    'Fallow Crown', 'Gossamer Wells', 'Rime Promontory', 'Trenchant Star',
    'Mirage Vault', 'Ambergris Reach', 'Cairn Ultima', 'Verge Anabasis'
  ];
  var FRONTIER_SPECTRALS = [
    { cls: 'M3V', T: 3420, mass: 0.34, rad: 0.36, berthAU: 0.14 },
    { cls: 'K2V', T: 4950, mass: 0.78, rad: 0.80, berthAU: 1.65 },
    { cls: 'G4V', T: 5580, mass: 0.94, rad: 0.96, berthAU: 2.35 },
    { cls: 'F6V', T: 6380, mass: 1.24, rad: 1.28, berthAU: 3.10 },
    { cls: 'K1III', T: 4620, mass: 1.55, rad: 3.10, berthAU: 4.80 },
    { cls: 'A4V', T: 8250, mass: 1.85, rad: 1.72, berthAU: 6.40 },
    { cls: 'M5V', T: 2980, mass: 0.16, rad: 0.19, berthAU: 0.055 }
  ];
  var FRONTIER_PLANETS = [
    { kind: 'saturnian', giantPalette: 'jade-pearl', ringPalette: 'jade-frost', hasRings: true, ringStyle: 'double-gap' },
    { kind: 'ice-giant', giantPalette: 'glacial-indigo', ringPalette: 'icy-cyan', hasRings: true, ringStyle: 'thin' },
    { kind: 'rust-giant', giantPalette: 'copper-obsidian', ringPalette: 'crimson-dust', hasRings: true, ringStyle: 'resonant-arcs' },
    { kind: 'pelagic-ocean', giantPalette: 'cerulean-cloud', ringPalette: 'icy-cyan', hasRings: false, ringStyle: 'none' },
    { kind: 'eyeball-rock', giantPalette: 'dusty-terracotta', ringPalette: 'rose-silicate', hasRings: false, ringStyle: 'none' },
    { kind: 'sapphire-disk', giantPalette: 'electric-indigo', ringPalette: 'violet-halo', hasRings: true, ringStyle: 'debris' },
    { kind: 'aerostat-clouds', giantPalette: 'amber-silicate', ringPalette: 'amber-gold', hasRings: true, ringStyle: 'gossamer-halo' },
    { kind: 'terrestrial-archipelago', giantPalette: 'rose-ivory', ringPalette: 'warm-cream', hasRings: false, ringStyle: 'none' }
  ];
  var FRONTIER_STATIONS = ['spindle', 'torus', 'oneill', 'bishop', 'loom', 'conjoiner-nest'];
  var FRONTIER_FACTIONS = ['UNCHARTED', 'ULTRONAUT', 'CONJOINER', 'SWI'];

  var FRONTIER_SYSTEMS = (function buildFrontierSystems() {
    var rng = G.mulberry32(42071);
    var out = [];
    var anchors = SYSTEMS.filter(function (s) { return s.distSol >= 24; });
    for (var i = 0; i < FRONTIER_NAMES.length; i++) {
      var xyz = null;
      for (var attempt = 0; attempt < 240; attempt++) {
        var cand;
        if (i < 14) {
          var anc = anchors[i % anchors.length];
          var dirOut = [anc.xyz[0] / anc.distSol, anc.xyz[1] / anc.distSol, anc.xyz[2] / anc.distSol];
          var jx = (rng() - 0.5) * 0.65, jy = (rng() - 0.5) * 0.45, jz = (rng() - 0.5) * 0.65;
          var ax = dirOut[0] + jx, ay = dirOut[1] + jy, az = dirOut[2] + jz;
          var al = Math.hypot(ax, ay, az) || 1;
          var rShell = 43.5 + (i / 14) * 20.5 + rng() * 5.0;
          cand = [Number((ax / al * rShell).toFixed(2)), Number((ay / al * rShell * 0.55).toFixed(2)), Number((az / al * rShell).toFixed(2))];
        } else {
          var theta = rng() * Math.PI * 2;
          var u = (rng() - 0.5) * 1.15;
          var cyl = Math.sqrt(Math.max(0.05, 1 - u * u));
          var minR = i < 25 ? 64 : 88;
          var maxR = i < 25 ? 92 : 122;
          var rad = minR + rng() * (maxR - minR);
          cand = [Number((rad * cyl * Math.cos(theta)).toFixed(2)), Number((rad * u * 0.65).toFixed(2)), Number((rad * cyl * Math.sin(theta)).toFixed(2))];
        }
        var dSol = Math.hypot(cand[0], cand[1], cand[2]);
        if (dSol <= FRONTIER_REVEAL_SOL_LY + 2.0) continue;
        var clear = true;
        for (var c0 = 0; c0 < SYSTEMS.length && clear; c0++) {
          if (distanceBetween(cand, SYSTEMS[c0].xyz) < 8.5) clear = false;
        }
        for (var c1 = 0; c1 < out.length && clear; c1++) {
          if (distanceBetween(cand, out[c1].xyz) < 8.5) clear = false;
        }
        if (clear) { xyz = cand; break; }
      }
      if (!xyz) xyz = [Number((52 + i * 2.1).toFixed(2)), Number((((i % 5) - 2) * 5.2).toFixed(2)), Number((((i % 7) - 3) * 7.4).toFixed(2))];
      var spec = FRONTIER_SPECTRALS[(i + Math.floor(rng() * 3)) % FRONTIER_SPECTRALS.length];
      var plSpec = FRONTIER_PLANETS[(i + Math.floor(rng() * 4)) % FRONTIER_PLANETS.length];
      var stType = FRONTIER_STATIONS[i % FRONTIER_STATIONS.length];
      var faction = FRONTIER_FACTIONS[i % FRONTIER_FACTIONS.length];
      var nm = FRONTIER_NAMES[i];
      var fSys = {
        id: 'frt-' + (i + 1),
        signalId: 'SIG-FRT-' + String(i + 1).padStart(2, '0'),
        name: nm,
        real: 'Gaia-FRT-' + (4100 + i * 37) + ' (' + nm + ')',
        cls: spec.cls,
        T: Math.round(spec.T * (0.94 + rng() * 0.12)),
        xyz: xyz,
        faction: faction,
        procedural: true,
        uninhabited: false,
        revealMinSolLy: FRONTIER_REVEAL_SOL_LY,
        station: { name: nm.split(' ')[0] + ' Survey Beacon', type: stType },
        exoNote: 'Frontier ' + spec.cls + ' System \u00b7 Uncharted Survey Sector ' + (i + 1),
        binary: i % 5 === 0 ? { name: nm + ' B', cls: 'M5V', T: 3050, offset: [-48, 32, -210], scale: 0.48 } : null,
        moons: i % 2 === 0 ? [{ r: 2.1, dist: 50, angle: 0.7, y: 7, col: 0xbfe2f5 }] : [],
        pose: { px: 62, py: -12, pz: -180, sx: -52, sy: 20, sz: -126 },
        planet: {
          name: nm + ' Prime',
          kind: plSpec.kind,
          radius: /giant|saturn|disk|clouds/.test(plSpec.kind) ? 26 : 21,
          giantPalette: plSpec.giantPalette,
          ringPalette: plSpec.ringPalette,
          hasRings: plSpec.hasRings,
          ringStyle: plSpec.ringStyle,
          tilt: [0.36, 0.14]
        },
        lore: 'Procedural deep-frontier beacon charted beyond 40 LY from Sol.'
      };
      initSystemBodies(fSys, SYSTEMS.length + i, spec.mass, spec.rad, spec.berthAU);
      out.push(fSys);
    }
    return out;
  })();

  var ALL_SYSTEMS = SYSTEMS.concat(FRONTIER_SYSTEMS);

  function hashCell3(cx, cy, cz) {
    var h = 2166136261;
    h = Math.imul(h ^ (cx | 0), 16777619) >>> 0;
    h = Math.imul(h ^ (cy | 0), 16777619) >>> 0;
    h = Math.imul(h ^ (cz | 0), 16777619) >>> 0;
    return h || 97531;
  }

  function getMilkyWayInfo(posGal) {
    var p = Array.isArray(posGal) && posGal.length === 3 ? posGal : [0, 0, 0];
    var px = Number(p[0]) || 0, py = Number(p[1]) || 0, pz = Number(p[2]) || 0;
    var solDistLy = Math.hypot(px, py, pz);
    var cSol = MILKY_WAY.coreXyzSol;
    var mwX = px - cSol[0], mwY = py - cSol[1], mwZ = pz - cSol[2];
    var galRadiusLy = Math.hypot(mwX, mwZ);
    var galCenterDistLy = Math.hypot(mwX, mwY, mwZ);
    var theta = Math.atan2(mwZ, mwX);
    var solR = Math.hypot(MILKY_WAY.solXyzMw[0], MILKY_WAY.solXyzMw[2]);
    var solTheta = Math.atan2(MILKY_WAY.solXyzMw[2], MILKY_WAY.solXyzMw[0]);

    var sectorLabel = 'ORION SPUR';
    var pitchK = 0.22;
    if (galRadiusLy < 10500) {
      sectorLabel = 'GALACTIC BULGE / BAR';
    } else if (galRadiusLy > MILKY_WAY.radiusLy) {
      sectorLabel = Math.abs(mwY) > 3500 ? 'GALACTIC HALO' : 'OUTER RIM';
    } else if (Math.abs(mwY) > 2200) {
      sectorLabel = 'THICK DISK HALO';
    } else {
      var dSolInMw = Math.hypot(mwX - MILKY_WAY.solXyzMw[0], mwZ - MILKY_WAY.solXyzMw[2]);
      if (dSolInMw < 2400) {
        sectorLabel = 'ORION SPUR';
      } else {
        var bestArm = MILKY_WAY.arms[0].name, bestD = 999;
        var lnR = Math.log(Math.max(4000, galRadiusLy) / solR);
        for (var ai = 0; ai < MILKY_WAY.arms.length; ai++) {
          var armAngle = solTheta + MILKY_WAY.arms[ai].offsetRad - 0.35 + lnR / pitchK;
          var diff = Math.abs(Math.atan2(Math.sin(theta - armAngle), Math.cos(theta - armAngle)));
          if (diff < bestD) { bestD = diff; bestArm = MILKY_WAY.arms[ai].name; }
        }
        sectorLabel = bestD < 0.42 ? bestArm : 'INTERARM VOID';
      }
    }
    var radialW = Math.exp(-galRadiusLy / 24000);
    var diskW = Math.exp(-Math.abs(mwY) / 1400);
    var starDensity = clamp(0.14 + 0.86 * radialW * diskW, 0.08, 1.0);
    return {
      solXyz: [px, py, pz],
      mwXyz: [mwX, mwY, mwZ],
      solDistLy: solDistLy,
      galRadiusLy: galRadiusLy,
      galCenterDistLy: galCenterDistLy,
      thetaRad: theta,
      heightAbovePlaneLy: mwY,
      sectorLabel: sectorLabel,
      starDensity: starDensity
    };
  }

  var COLONY_A = [
    'Vesper', 'Kestrel', 'Hyperion', 'Cinder', 'Boreal', 'Tharsis', 'Acheron', 'Sable',
    'Meridian', 'Lantern', 'Ochre', 'Halcyon', 'Nadir', 'Pelagic', 'Solstice', 'Tallow',
    'Cairn', 'Gossamer', 'Corvus', 'Amber', 'Rime', 'Orchid', 'Mirage', 'Zenith'
  ];
  var COLONY_B = [
    'Reach', 'Haven', 'Basin', 'Drift', 'Crown', 'Fold', 'Hollow', 'Spire',
    'Gate', 'Verge', 'Quarry', 'Wells', 'Arch', 'Fen', 'Shoal', 'Beacon',
    'Anchor', 'Forge', 'Redoubt', 'Transit', 'Cradle', 'Vault'
  ];

  function makeAstronomicalName(rng, idx) {
    var pick = idx % 5;
    if (pick === 0) {
      var idA = 1000000000 + Math.floor(rng() * 899999999);
      return 'Gaia DR3 ' + idA;
    }
    if (pick === 1) {
      return 'HIP ' + (12000 + Math.floor(rng() * 108000));
    }
    if (pick === 2) {
      return 'HD ' + (20000 + Math.floor(rng() * 240000));
    }
    if (pick === 3) {
      return 'TYC ' + (1000 + Math.floor(rng() * 8400)) + '-' + (100 + Math.floor(rng() * 2400)) + '-1';
    }
    var hh = String(Math.floor(rng() * 24)).padStart(2, '0');
    var mm = String(Math.floor(rng() * 60)).padStart(2, '0');
    var sn = rng() < 0.5 ? '+' : '-';
    var dd = String(Math.floor(rng() * 88)).padStart(2, '0');
    var dm = String(Math.floor(rng() * 60)).padStart(2, '0');
    return '2MASS J' + hh + mm + sn + dd + dm;
  }

  var SECTOR_CACHE = new Map();
  var DYNAMIC_SYSTEMS = new Map();

  function generateSectorCell(cx, cy, cz) {
    var cKey = cx + ',' + cy + ',' + cz;
    if (SECTOR_CACHE.has(cKey)) return SECTOR_CACHE.get(cKey);
    var seed = hashCell3(cx, cy, cz);
    var rng = G.mulberry32(seed);
    var cellCenter = [(cx + 0.5) * SECTOR_CELL_LY, (cy + 0.5) * SECTOR_CELL_LY, (cz + 0.5) * SECTOR_CELL_LY];
    var mw = getMilkyWayInfo(cellCenter);
    var nRaw = mw.galRadiusLy > 62000 || Math.abs(mw.heightAbovePlaneLy) > 9000 ? 1
      : (1 + Math.floor(rng() * 2 + mw.starDensity * 2.1));
    var count = clamp(nRaw, 1, 4);
    var list = [];
    for (var i = 0; i < count; i++) {
      var sx = Number(((cx + 0.12 + rng() * 0.76) * SECTOR_CELL_LY).toFixed(2));
      var sy = Number(((cy + 0.14 + rng() * 0.72) * SECTOR_CELL_LY * 0.65).toFixed(2));
      var sz = Number(((cz + 0.12 + rng() * 0.76) * SECTOR_CELL_LY).toFixed(2));
      var xyz = [sx, sy, sz];
      var dSol = Math.hypot(sx, sy, sz);
      if (dSol <= 50.5) continue;
      var clear = true;
      for (var s0 = 0; s0 < ALL_SYSTEMS.length && clear; s0++) {
        if (distanceBetween(xyz, ALL_SYSTEMS[s0].xyz) < 9.0) clear = false;
      }
      for (var s1 = 0; s1 < list.length && clear; s1++) {
        if (distanceBetween(xyz, list[s1].xyz) < 9.0) clear = false;
      }
      if (!clear) continue;

      var spec = FRONTIER_SPECTRALS[Math.floor(rng() * FRONTIER_SPECTRALS.length)];
      var plSpec = FRONTIER_PLANETS[Math.floor(rng() * FRONTIER_PLANETS.length)];
      var inhabited = rng() < 0.40;
      var sysId = 'sec_' + cx + '_' + cy + '_' + cz + '_' + i;
      var codeSig = 'SIG-' + Math.abs(cx * 73 ^ cy * 179 ^ cz * 283 ^ (i * 31)).toString(36).toUpperCase().slice(0, 5);
      var sysName, realName, stObj, faction, lore;
      if (inhabited) {
        var cA = COLONY_A[(Math.abs(cx * 17 + i * 5) + Math.floor(rng() * COLONY_A.length)) % COLONY_A.length];
        var cB = COLONY_B[(Math.abs(cz * 13 + cy * 7 + i * 3) + Math.floor(rng() * COLONY_B.length)) % COLONY_B.length];
        sysName = cA + ' ' + cB;
        realName = makeAstronomicalName(rng, i) + ' (' + sysName + ')';
        var stType = FRONTIER_STATIONS[(i + Math.abs(cx + cz)) % FRONTIER_STATIONS.length];
        faction = FRONTIER_FACTIONS[1 + (Math.abs(cx * 3 + cz + i) % (FRONTIER_FACTIONS.length - 1))];
        stObj = { name: cA + ' Relay Spindle', type: stType };
        lore = 'Human outpost in the ' + mw.sectorLabel + ' (' + Math.round(mw.galRadiusLy).toLocaleString('en-US') + ' LY from Sgr A*).';
      } else {
        sysName = makeAstronomicalName(rng, i);
        realName = sysName;
        faction = 'UNINHABITED';
        stObj = null;
        lore = 'Uninhabited star system in the ' + mw.sectorLabel + '; zero human beacons detected, glacial H2O reserves available.';
      }
      var sysObj = {
        id: sysId,
        signalId: codeSig,
        name: sysName,
        real: realName,
        cls: spec.cls,
        T: Math.round(spec.T * (0.92 + rng() * 0.16)),
        xyz: xyz,
        faction: faction,
        procedural: true,
        sector: true,
        uninhabited: !inhabited,
        station: stObj,
        exoNote: (inhabited ? 'Chartered Frontier Outpost' : 'Uninhabited Survey Target') + ' - ' + mw.sectorLabel,
        binary: rng() < 0.18 ? { name: sysName + ' B', cls: 'M5V', T: 3020, offset: [-46, 30, -205], scale: 0.45 } : null,
        moons: rng() < 0.65 ? [{ r: 2.0, dist: 50, angle: 0.6 + rng() * 2, y: 7, col: 0xbfe2f5 }] : [],
        pose: { px: 62, py: -12, pz: -180, sx: -52, sy: 20, sz: -126 },
        planet: {
          name: (inhabited ? sysName : (sysName.split(' ')[0] + ' b')) + (inhabited ? ' Prime' : ''),
          kind: plSpec.kind,
          radius: /giant|saturn|disk|clouds/.test(plSpec.kind) ? 26 : 21,
          giantPalette: plSpec.giantPalette,
          ringPalette: plSpec.ringPalette,
          hasRings: plSpec.hasRings,
          ringStyle: plSpec.ringStyle,
          tilt: [0.36, 0.14]
        },
        lore: lore
      };
      initSystemBodies(sysObj, Math.abs(seed % 1000) + 100 + i, spec.mass, spec.rad, spec.berthAU);
      DYNAMIC_SYSTEMS.set(sysId, sysObj);
      list.push(sysObj);
    }
    SECTOR_CACHE.set(cKey, list);
    return list;
  }

  function ensureSectorsNear(posGal, radiusLy) {
    var r = Number.isFinite(radiusLy) && radiusLy > 0 ? radiusLy : SENSOR_HORIZON_LY;
    var p = Array.isArray(posGal) && posGal.length === 3 ? posGal : [0, 0, 0];
    var minX = Math.floor((p[0] - r) / SECTOR_CELL_LY);
    var maxX = Math.floor((p[0] + r) / SECTOR_CELL_LY);
    var minY = Math.floor((p[1] - r) / SECTOR_CELL_LY);
    var maxY = Math.floor((p[1] + r) / SECTOR_CELL_LY);
    var minZ = Math.floor((p[2] - r) / SECTOR_CELL_LY);
    var maxZ = Math.floor((p[2] + r) / SECTOR_CELL_LY);
    var found = [];
    for (var cx = minX; cx <= maxX; cx++) {
      for (var cy = minY; cy <= maxY; cy++) {
        for (var cz = minZ; cz <= maxZ; cz++) {
          var cell = generateSectorCell(cx, cy, cz);
          for (var i = 0; i < cell.length; i++) {
            if (distanceBetween(p, cell[i].xyz) <= r) found.push(cell[i]);
          }
        }
      }
    }
    return found;
  }

  function getSystem(id) {
    if (!id) return SYSTEMS[0];
    for (var i = 0; i < ALL_SYSTEMS.length; i++) if (ALL_SYSTEMS[i].id === id) return ALL_SYSTEMS[i];
    if (DYNAMIC_SYSTEMS.has(id)) return DYNAMIC_SYSTEMS.get(id);
    var m = /^sec_(-?\d+)_(-?\d+)_(-?\d+)_\d+$/.exec(String(id));
    if (m) {
      generateSectorCell(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
      if (DYNAMIC_SYSTEMS.has(id)) return DYNAMIC_SYSTEMS.get(id);
    }
    return null;
  }

  function isSystemDiscovered(sys, discoveredIds, posGal) {
    if (!sys) return false;
    if (!sys.procedural) return true;
    if (Array.isArray(discoveredIds) && discoveredIds.indexOf(sys.id) >= 0) return true;
    if (Array.isArray(posGal) && posGal.length === 3) {
      var solDist = Math.hypot(posGal[0], posGal[1], posGal[2]);
      if (solDist >= FRONTIER_REVEAL_SOL_LY && distanceBetween(posGal, sys.xyz) <= SENSOR_HORIZON_LY) return true;
    }
    return false;
  }

  function getVisibleSystems(discoveredIds, posGal) {
    var out = [];
    var seen = new Set();
    var addSys = function (s) {
      if (!s || seen.has(s.id)) return;
      seen.add(s.id);
      out.push(s);
    };
    for (var i = 0; i < SYSTEMS.length; i++) addSys(SYSTEMS[i]);
    if (Array.isArray(discoveredIds)) {
      for (var d = 0; d < discoveredIds.length; d++) {
        var ds = getSystem(discoveredIds[d]);
        if (ds) addSys(ds);
      }
    }
    if (Array.isArray(posGal) && posGal.length === 3) {
      var solDist = Math.hypot(posGal[0], posGal[1], posGal[2]);
      if (solDist >= FRONTIER_REVEAL_SOL_LY) {
        for (var f = 0; f < FRONTIER_SYSTEMS.length; f++) {
          if (distanceBetween(posGal, FRONTIER_SYSTEMS[f].xyz) <= SENSOR_HORIZON_LY) addSys(FRONTIER_SYSTEMS[f]);
        }
        var nearSec = ensureSectorsNear(posGal, SENSOR_HORIZON_LY);
        for (var n = 0; n < nearSec.length; n++) addSys(nearSec[n]);
      }
    }
    return out;
  }

  function circularState(radius,mu,inc,phase,t) {
    var n = Math.sqrt(mu/radius)/radius, u = phase+n*t;
    var co=Math.cos(u), si=Math.sin(u), ci=Math.cos(inc), sn=Math.sin(inc);
    return {rKm:[radius*co,radius*si*ci,radius*si*sn],
      vKmS:[-radius*n*si,radius*n*co*ci,radius*n*co*sn]};
  }
  function getBodyWorldState(sys,ref,t) {
    ref = ref || {kind:'star'};
    if (typeof ref === 'string') ref = {kind:ref};
    var kind=ref.kind||ref.type, p=sys.planets[ref.planetIdx??ref.parentPlanetIdx??0];
    var state={rKm:[0,0,0],vKmS:[0,0,0]};
    if (kind!=='star' && p) {
      state=circularState(p.orbitRadiusAU*AU,sys.muStarKm3S2,p.incRad,p.phaseRad,t||0);
      var child=kind==='station'?sys.station:kind==='moon'?p.moons[ref.moonIdx||0]:null;
      if (child) {
        var local=circularState(child.orbitRadiusKm,p.muKm3S2,child.incRad,child.phaseRad,t||0);
        state.rKm=state.rKm.map((x,i)=>x+local.rKm[i]);
        state.vKmS=state.vKmS.map((x,i)=>x+local.vKmS[i]);
      }
    }
    state.posKm=state.rKm; state.velKmS=state.vKmS;
    return state;
  }
  function getSystemTargetOrbits(sys,parentPlanetIdx,rKm,mu,t) {
    var p=sys.planets[parentPlanetIdx], targets=[];
    function add(id,label,kind,R,inc,body,ref) {
      var target={id:id,label:label,kind:kind,radiusKm:R,rpKm:R,raKm:R,incRad:inc,lanRad:0};
      if (body) {
        var state=circularState(R,mu||(p?p.muKm3S2:sys.muStarKm3S2),inc,body.phaseRad,t||0);
        Object.assign(target,{targetPosKm:state.rKm,targetVelKmS:state.vKmS,focusRef:ref});
      }
      targets.push(target);
    }
    var radius=Array.isArray(rKm)?Math.hypot(...rKm):rKm;
    add('circularize','CIRCULARIZE','circularize',radius||(p?p.radiusKm*2:AU),undefined);
    if (p) {
      add('low-orbit','LOW PARKING','low-orbit',p.radiusKm*1.12,0);
      if (p.hasRings) add('ring-orbit','RING SKIM','ring-orbit',p.radiusKm*3.2,0);
      if (sys.station && parentPlanetIdx===sys.station.parentPlanetIdx) add('station','STATION RENDEZVOUS','station',sys.station.orbitRadiusKm,sys.station.incRad,sys.station,{kind:'station',planetIdx:parentPlanetIdx});
      add('polar','POLAR SURVEY','plane-change',p.radiusKm*1.6,Math.PI/2);
      add('high-orbit','HIGH ORBIT','high-orbit',p.radiusKm*5,0);
      p.moons.forEach((m,j)=>add(m.id,m.name.toUpperCase(),'moon',m.orbitRadiusKm,m.incRad,m,{kind:'moon',planetIdx:parentPlanetIdx,moonIdx:j}));
    } else sys.planets.forEach((b,j)=>add(b.id,b.name.toUpperCase(),'planet',b.orbitRadiusAU*AU,b.incRad,b,{kind:'planet',planetIdx:j}));
    add('escape','INTERSTELLAR ESCAPE','escape',radius,undefined);
    return targets;
  }

  function distanceBetween(aXyz, bXyz) {
    return Math.hypot(bXyz[0] - aXyz[0], bXyz[1] - aXyz[1], bXyz[2] - aXyz[2]);
  }

  function moonIceKindScore(moon, planet) {
    if (!moon) return 0;
    var text = [moon.name, moon.kind, moon.type, moon.material].join(' ');
    if (/\b(enceladus|europa)\b/i.test(text)) return 5;
    if (/\b(triton|miranda|ariel|umbriel)\b/i.test(text)) return 4;
    if (/\b(rhea|iapetus|tethys|dione|titan|ganymede|callisto)\b/i.test(text)) return 3;
    if (/\b(ice|icy|cryo|glaci|frost|ocean|water|snow)\b/i.test(text)) return 4;
    var col = Number(moon.col);
    if (Number.isFinite(col) && col > 0) {
      var r = (col >> 16) & 255, g = (col >> 8) & 255, b = col & 255;
      if (b >= r && b >= 190 && g >= 180) return 2;
    }
    if (planet && /ice-giant|pelagic-ocean/i.test(planet.kind || '')) return 2;
    return 0;
  }

  function isBodyIcy(planet, moon) {
    if (moon) return moonIceKindScore(moon, planet) > 0;
    if (!planet) return false;
    return !!(planet.isComet || planet.hasRings || /ice-giant|pelagic-ocean|cryo|glaci/i.test(planet.kind || ''));
  }

  function hashId(str) {
    var s = String(str || 'sol'), h = 2166136261;
    for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
    return h || 1337;
  }

  function buildSystemIceDeposits(sys) {
    if (!sys) return [];
    var rng = G.mulberry32(hashId(sys.id));
    var planets = Array.isArray(sys.planets) ? sys.planets : (sys.planet ? [sys.planet] : []);
    var out = [];
    for (var pi = 0; pi < planets.length; pi++) {
      var p = planets[pi];
      if (!p) continue;
      var pMoons = Array.isArray(p.moons) ? p.moons : [];
      var bestMoon = null, bestSc = 0;
      for (var mi = 0; mi < pMoons.length; mi++) {
        var m = pMoons[mi], sc = moonIceKindScore(m, p);
        if (sc <= 0) continue;
        // Include high-value icy moons plus best icy moon per planet.
        if (sc >= 3 || pi === 0) {
          var mR = m.radiusKm || 800;
          var mSuffix = /\b(enceladus|europa|triton)\b/i.test(m.name || '') ? ' Cryo-Plume'
            : /titan/i.test(m.name || '') ? ' Methane-Ice Shelf' : ' Glacial Vein';
          out.push({
            id: 'ice-' + (m.id || (p.id + '-m' + mi)),
            name: (m.name || (p.name + ' Moon ' + (mi + 1))) + mSuffix,
            kind: 'icy-moon',
            bodyName: m.name || p.name,
            parentRef: { kind: 'moon', planetIdx: pi, moonIdx: mi },
            orbitRadiusKm: Math.round(Math.max(mR * 1.95, mR + 650)),
            incRad: 0.04 + rng() * 0.14,
            phaseRad: rng() * Math.PI * 2,
            radiusKm: Number((4.5 + rng() * 5.5).toFixed(1)),
            priority: sc,
            harvestLabel: 'Glacial H2O harvest via DropShips'
          });
        } else if (sc > bestSc) {
          bestSc = sc;
          bestMoon = { moon: m, moonIdx: mi };
        }
      }
      if (bestMoon && !out.some(d => d.parentRef.kind === 'moon' && d.parentRef.planetIdx === pi)) {
        var bm = bestMoon.moon, bmR = bm.radiusKm || 800;
        out.push({
          id: 'ice-' + (bm.id || (p.id + '-m' + bestMoon.moonIdx)),
          name: (bm.name || (p.name + ' Icy Moon')) + ' Glacial Vein',
          kind: 'icy-moon',
          bodyName: bm.name || p.name,
          parentRef: { kind: 'moon', planetIdx: pi, moonIdx: bestMoon.moonIdx },
          orbitRadiusKm: Math.round(Math.max(bmR * 1.95, bmR + 650)),
          incRad: 0.05 + rng() * 0.12,
          phaseRad: rng() * Math.PI * 2,
          radiusKm: Number((4.0 + rng() * 5.0).toFixed(1)),
          priority: bestSc,
          harvestLabel: 'Glacial H2O harvest via DropShips'
        });
      }
      if (p.hasRings) {
        var rpR = p.radiusKm || 12000;
        out.push({
          id: 'ice-' + (p.id || ('p' + pi)) + '-ring',
          name: p.name + ' Ring Ice',
          kind: 'ice-rings',
          bodyName: p.name,
          parentRef: { kind: 'planet', planetIdx: pi },
          orbitRadiusKm: Math.round(rpR * 2.55),
          incRad: 0.015 + rng() * 0.03,
          phaseRad: rng() * Math.PI * 2,
          radiusKm: Number((8.0 + rng() * 6.0).toFixed(1)),
          priority: 4,
          harvestLabel: 'Ring-ice harvest via DropShips'
        });
      }
      if (p.isComet || /ice-giant|pelagic-ocean|cryo|glaci/i.test(p.kind || '')) {
        var wpR = p.radiusKm || 5000;
        out.push({
          id: 'ice-' + (p.id || ('p' + pi)),
          name: p.name + (p.isComet ? ' Nucleus' : ' Cryo Vein'),
          kind: p.isComet ? 'comet' : 'ice-world',
          bodyName: p.name,
          parentRef: { kind: 'planet', planetIdx: pi },
          orbitRadiusKm: Math.round(Math.max(wpR * 2.35, wpR + 1800)),
          incRad: 0.06 + rng() * 0.18,
          phaseRad: rng() * Math.PI * 2,
          radiusKm: Number((5.5 + rng() * 6.5).toFixed(1)),
          priority: p.isComet ? 5 : 3,
          harvestLabel: p.isComet ? 'Cometary H2O harvest via DropShips' : 'Cryo-volatile H2O harvest via DropShips'
        });
      }
    }
    var maxAU = Math.max(4, ...planets.map(function (pp) { return pp.orbitRadiusAU || 1; }));
    var cometCount = 0;
    while (out.length < 2 || cometCount < 1) {
      var auMul = 1.28 + cometCount * 0.26 + rng() * 0.14;
      var cName = cometCount === 0 ? (sys.name + ' Comet Alpha') : (sys.name + ' Oort Shard');
      out.push({
        id: 'ice-' + sys.id + '-comet-' + (cometCount + 1),
        name: cName,
        kind: 'comet-belt',
        bodyName: cName,
        parentRef: { kind: 'star' },
        orbitRadiusKm: Math.round(maxAU * auMul * AU),
        incRad: 0.08 + rng() * 0.32,
        phaseRad: rng() * Math.PI * 2,
        radiusKm: Number((7.0 + rng() * 8.5).toFixed(1)),
        priority: 1,
        harvestLabel: 'Cometary H2O harvest via DropShips'
      });
      cometCount++;
    }
    return out;
  }

  function getSystemIceDeposits(sys) {
    if (!sys) return [];
    if (!Array.isArray(sys.iceDeposits) || !sys.iceDeposits.length) {
      sys.iceDeposits = buildSystemIceDeposits(sys);
    }
    return sys.iceDeposits;
  }

  function getIceDepositWorldState(sys, dep, t) {
    if (!sys || !dep) return { rKm: [0, 0, 0], vKmS: [0, 0, 0], relRKm: [0, 0, 0], relVKmS: [0, 0, 0], parentKm: [0, 0, 0] };
    var pRef = dep.parentRef || { kind: 'star' };
    var parentState = getBodyWorldState(sys, pRef, t || 0);
    var mu = sys.muStarKm3S2 || 1.327e11;
    if (pRef.kind === 'planet') {
      var p = sys.planets && sys.planets[pRef.planetIdx];
      mu = (p && p.muKm3S2) || 5e5;
    } else if (pRef.kind === 'moon') {
      var pm = sys.planets && sys.planets[pRef.planetIdx];
      var m = pm && pm.moons && pm.moons[pRef.moonIdx];
      mu = (m && m.muKm3S2) || Math.max(100, ((m && m.radiusKm) || 1000) * 5);
    }
    var rel = circularState(dep.orbitRadiusKm, mu, dep.incRad || 0, dep.phaseRad || 0, t || 0);
    return {
      rKm: [parentState.rKm[0] + rel.rKm[0], parentState.rKm[1] + rel.rKm[1], parentState.rKm[2] + rel.rKm[2]],
      vKmS: [parentState.vKmS[0] + rel.vKmS[0], parentState.vKmS[1] + rel.vKmS[1], parentState.vKmS[2] + rel.vKmS[2]],
      relRKm: rel.rKm,
      relVKmS: rel.vKmS,
      parentKm: parentState.rKm
    };
  }

  function findNearestIceDeposit(sys, shipStarKm, t) {
    var list = getSystemIceDeposits(sys);
    if (!list.length) return null;
    var sx = (shipStarKm && shipStarKm[0]) || 0, sy = (shipStarKm && shipStarKm[1]) || 0, sz = (shipStarKm && shipStarKm[2]) || 0;
    var scored = list.map(function (dep) {
      var st = getIceDepositWorldState(sys, dep, t || 0);
      var distKm = Math.hypot(st.rKm[0] - sx, st.rKm[1] - sy, st.rKm[2] - sz);
      return { deposit: dep, distKm: distKm, worldR: st.rKm, worldV: st.vKmS, relRKm: st.relRKm, relVKmS: st.relVKmS };
    });
    scored.sort(function (a, b) { return a.distKm - b.distKm; });
    var best = scored[0];
    return {
      deposit: best.deposit,
      distKm: best.distKm,
      worldR: best.worldR,
      worldV: best.worldV,
      relRKm: best.relRKm,
      relVKmS: best.relVKmS,
      all: scored
    };
  }

  function findBestIceHarvestSite(sys) {
    if (!sys) return null;
    var list = getSystemIceDeposits(sys);
    if (list.length) {
      var rank = { 'icy-moon': 5, 'comet': 4, 'ice-rings': 3, 'ice-world': 2, 'comet-belt': 1 };
      var sorted = list.slice().sort(function (a, b) {
        return ((rank[b.kind] || 0) - (rank[a.kind] || 0)) || ((b.priority || 0) - (a.priority || 0));
      });
      var dep = sorted[0];
      return {
        depositId: dep.id,
        name: dep.name,
        kind: dep.kind,
        bodyName: dep.bodyName,
        ref: dep.parentRef,
        deposit: dep,
        harvestLabel: dep.harvestLabel,
        detail: dep.harvestLabel
      };
    }
    var name = sys.name + ' Oort Comet', detail = 'Cometary H2O harvest via DropShips';
    return { name: name, kind: 'comet-belt', bodyName: name, ref: null, harvestLabel: detail, detail: detail };
  }

  function planMultiHopRoute(fromId, toId, opts) {
    opts = opts || {};
    var maxHopLy = clamp(Number.isFinite(+opts.maxHopLy) ? +opts.maxHopLy : 15, 10, 20);
    var accelG = Math.max(1, Number.isFinite(+opts.accelG) ? +opts.accelG : 1);
    var pool = Array.isArray(opts.systems) && opts.systems.length ? opts.systems.slice()
      : (getSystem(fromId)?.procedural || getSystem(toId)?.procedural ? ALL_SYSTEMS.slice() : SYSTEMS.slice());
    var fromSys = getSystem(fromId), toSys = getSystem(toId);
    if (fromSys && !pool.includes(fromSys)) pool.push(fromSys);
    if (toSys && !pool.includes(toSys)) pool.push(toSys);
    if ((fromSys && fromSys.sector) || (toSys && toSys.sector)) {
      var midPos = fromSys && toSys
        ? [(fromSys.xyz[0] + toSys.xyz[0]) * 0.5, (fromSys.xyz[1] + toSys.xyz[1]) * 0.5, (fromSys.xyz[2] + toSys.xyz[2]) * 0.5]
        : (toSys || fromSys).xyz;
      ensureSectorsNear(midPos, 65).forEach(function (ss) { if (!pool.includes(ss)) pool.push(ss); });
      if (fromSys) ensureSectorsNear(fromSys.xyz, 50).forEach(function (ss) { if (!pool.includes(ss)) pool.push(ss); });
      if (toSys) ensureSectorsNear(toSys.xyz, 50).forEach(function (ss) { if (!pool.includes(ss)) pool.push(ss); });
    }
    var from = pool.findIndex(s => s.id === fromId), to = pool.findIndex(s => s.id === toId);
    if (from < 0 || to < 0) return null;
    var edges = pool.map(a => pool.map(b => distanceBetween(a.xyz, b.xyz)));

    // Use additive distance on the allowed graph. If disconnected, find the
    // smallest viable edge limit first, then minimize distance at that limit.
    function shortest(limit, bottleneck) {
      var costs = pool.map(() => Infinity), previous = pool.map(() => -1);
      var pending = new Set(pool.map((_, i) => i));
      costs[from] = 0;
      while (pending.size) {
        var u = -1;
        for (var i of pending) if (u < 0 || costs[i] < costs[u]) u = i;
        if (!Number.isFinite(costs[u]) || u === to) break;
        pending.delete(u);
        for (var v of pending) {
          var edge = edges[u][v];
          if (edge > limit) continue;
          var cost = bottleneck ? Math.max(costs[u], edge) : costs[u] + edge;
          if (cost < costs[v]) { costs[v] = cost; previous[v] = u; }
        }
      }
      return { cost: costs[to], previous: previous };
    }

    var path = shortest(maxHopLy, false), overLimit = !Number.isFinite(path.cost);
    if (overLimit) path = shortest(shortest(Infinity, true).cost, false);
    var indices = [];
    for (var idx = to; idx !== from; idx = path.previous[idx]) indices.push(idx);
    indices.push(from);
    indices.reverse();

    var specs = opts.rocketSpecs || {};
    var orbitMath = root.LighthuggerOrbits || (typeof module === 'object' && module.exports && require('./lighthugger-orbits.js'));
    var hops = indices.slice(1).map(function (v, legIdx) {
      var u = indices[legIdx], distLy = edges[u][v];
      var plan = planBrachistochrone(distLy, accelG);
      var ablation = orbitMath.computeIsmAblation(plan.betaPeak, plan.gammaPeak,
        specs.iceThick ?? 0.5, specs.iceCoverage ?? 1, 1, plan.tauYears * 0.38);
      return { fromId: pool[u].id, toId: pool[v].id, fromName: pool[u].name, toName: pool[v].name,
        distLy: distLy, accelG: accelG, peakBeta: plan.betaPeak, peakGamma: plan.gammaPeak,
        properYr: plan.tauYears, galYr: plan.coordYears, iceLossPct: clamp(ablation.iceLoss * 100, 0, 100),
        iceStop: findBestIceHarvestSite(pool[v]), overLimit: distLy > maxHopLy };
    });
    return { fromId: fromId, toId: toId, maxHopLy: maxHopLy, accelG: accelG, directLy: edges[from][to],
      hops: hops, overLimit: overLimit, needsMultiHop: hops.length > 1,
      totalDistLy: hops.reduce((sum, h) => sum + h.distLy, 0),
      totalProperYr: hops.reduce((sum, h) => sum + h.properYr, 0),
      totalGalYr: hops.reduce((sum, h) => sum + h.galYr, 0),
      maxLegLy: Math.max(0, ...hops.map(h => h.distLy)),
      maxPeakGamma: Math.max(1, ...hops.map(h => h.peakGamma)),
      maxIceLossPct: Math.max(0, ...hops.map(h => h.iceLossPct)),
      iceStops: hops.slice(0, -1).map(h => h.iceStop) };
  }

  // -- Exact Relativistic Constant-Acceleration & Brachistochrone Kinematics --
  function planBrachistochrone(distLy, accelG) {
    var D = Math.max(0, Number(distLy) || 0);
    var aG = Math.max(0.05, Number(accelG) || 1.0);
    var kappa = aG * KAPPA_PER_G;
    if (D < 1e-6) {
      return { distLy: 0, accelG: aG, gammaPeak: 1, betaPeak: 0, etaPeak: 0, tauYears: 0, coordYears: 0, flipDistLy: 0 };
    }
    var gammaPeak = 1 + 0.5 * kappa * D;
    var etaPeak = Math.acosh(gammaPeak);
    var betaPeak = Math.tanh(etaPeak);
    var tauYears = (2 / kappa) * etaPeak;
    var coordYears = (2 / kappa) * Math.sinh(etaPeak);
    return {
      distLy: D,
      accelG: aG,
      gammaPeak: gammaPeak,
      betaPeak: betaPeak,
      etaPeak: etaPeak,
      tauYears: tauYears,
      coordYears: coordYears,
      flipDistLy: 0.5 * D
    };
  }

  function stoppingDistanceLy(gammaVal, brakeG) {
    var g = Math.max(1, Number(gammaVal) || 1);
    var bG = Math.max(0.05, Number(brakeG) || 1.0);
    return (g - 1) / (bG * KAPPA_PER_G);
  }

  function stepConstantAccel(eta0, aEffG, dTauYears, stopAtZero) {
    var dt = Math.max(0, Number(dTauYears) || 0);
    if (dt === 0) {
      return {
        eta: eta0,
        beta: Math.tanh(eta0),
        gamma: Math.cosh(eta0),
        dTauYears: 0,
        dCoordYears: 0,
        dDistLy: 0,
        stopped: false
      };
    }
    if (Math.abs(aEffG) < 1e-6) {
      var b0 = Math.tanh(eta0);
      var g0 = Math.cosh(eta0);
      return {
        eta: eta0,
        beta: b0,
        gamma: g0,
        dTauYears: dt,
        dCoordYears: g0 * dt,
        dDistLy: Math.sinh(eta0) * dt,
        stopped: false
      };
    }

    var kappa = aEffG * KAPPA_PER_G;
    var eta1 = eta0 + kappa * dt;
    var stopped = false;

    // If braking to rest, clamp cleanly at eta = 0 without reversing backwards
    if (stopAtZero && eta1 <= 0 && kappa < 0) {
      var dtUsed = eta0 / Math.abs(kappa);
      eta1 = 0;
      stopped = true;
      var dCoordStop = (Math.sinh(eta0) - 0) / Math.abs(kappa);
      var dDistStop = (Math.cosh(eta0) - 1) / Math.abs(kappa);
      return {
        eta: 0,
        beta: 0,
        gamma: 1,
        dTauYears: dtUsed,
        dCoordYears: dCoordStop,
        dDistLy: dDistStop,
        stopped: true
      };
    }

    eta1 = clamp(eta1, 0, 5.8); // up to beta ~ 0.999982c (gamma ~ 165)
    var coastTime = Math.max(0, dt - (eta1 - eta0) / kappa);
    var dCoord = (Math.sinh(eta1) - Math.sinh(eta0)) / kappa + Math.cosh(eta1) * coastTime;
    var dDist = (Math.cosh(eta1) - Math.cosh(eta0)) / kappa + Math.sinh(eta1) * coastTime;

    return {
      eta: eta1,
      beta: Math.tanh(eta1),
      gamma: Math.cosh(eta1),
      dTauYears: dt,
      dCoordYears: Math.max(0, dCoord),
      dDistLy: Math.max(0, dDist),
      stopped: stopped
    };
  }

  // -- Low-Impact Galactic North Charters & Deep-Time Epoch Vignettes --
  var CHARTER_GOODS = [
    'Cryo-Seed Germplasm Vault',
    'Conjoiner Magnetic-Pinch Telemetry',
    'Demarchist Polling Ephemeris',
    'Xeno-Geological Core Archive',
    'Monastic Slow-Time Canticle',
    'Isotopic Fusion Catalyst Casks',
    'Ancestral Neural-Beta Snapshots',
    'Astrometric Pulsar Baseline Tape'
  ];

  var EPOCH_VIGNETTES = [
    'Local habitats have cycled through two architectural generations since your departure; your hull registry is greeted like a returning legend.',
    'Dialect drift on the approach channel requires a 0.4-second translation buffer, yet Ultronaut berth privileges remain honored.',
    'A quiet golden age has settled over the orbital ring; newly grown ice-tethers gleam along the terminator.',
    'Old factional banners in the dockyard have given way to cooperative Conjoiner-Ultronaut guilds.',
    'Astronomers on the spindle purchase your high-gamma interstellar dust spectra before your ice carapace even cools.',
    'Centuries of slow light from distant wars have washed past this system, leaving behind calm archive libraries and deep docks.'
  ];

  function generateChartersForSystem(originSys, epochYear) {
    var seed = Math.floor(epochYear * 13) + originSys.id.charCodeAt(0) * 97 + originSys.name.length * 31;
    var r = G.mulberry32(seed);
    var others = SYSTEMS
      .filter(function (s) { return s.id !== originSys.id; })
      .map(function (s) {
        return { sys: s, dist: distanceBetween(originSys.xyz, s.xyz) };
      })
      .sort(function (a, b) { return a.dist - b.dist; });

    var buckets = [
      others.slice(0, 7),
      others.slice(7, 17),
      others.slice(17)
    ];

    return buckets.map(function (pool, idx) {
      var pick = pool[Math.floor(r() * pool.length)] || others[idx];
      var cargo = CHARTER_GOODS[Math.floor(r() * CHARTER_GOODS.length)];
      var plan = planBrachistochrone(pick.dist, 1.0);
      var stipend = Math.round(180 + pick.dist * 28 + r() * 90);
      return {
        id: originSys.id + '-' + pick.sys.id + '-' + Math.floor(epochYear),
        fromId: originSys.id,
        toId: pick.sys.id,
        toName: pick.sys.name,
        distLy: pick.dist,
        cargo: cargo,
        stipend: stipend,
        estTauYr: plan.tauYears,
        estCoordYr: plan.coordYears
      };
    });
  }

  function pickEpochVignette(sys, elapsedCoordYr) {
    var base = sys.lore || 'Deep orbital beacons acknowledge your hull registry.';
    var exo = sys.exoNote ? (' [' + sys.exoNote + ']') : '';
    if (elapsedCoordYr < 0.5) {
      return base + exo;
    }
    var idx = Math.abs(Math.floor(elapsedCoordYr * 7 + sys.T + sys.id.charCodeAt(0) * 19)) % EPOCH_VIGNETTES.length;
    return base + ' ' + EPOCH_VIGNETTES[idx] + exo;
  }

  var CAPTAIN_ARCHETYPES = [
    {
      captain: 'Cantor Sevrin-9',
      guild: 'Conjoiner Drive-Choir',
      quips: [
        '"Hold steady at 0.01c, cousin. Our magnetic pinch is whispering to your keel."',
        '"Never fly bare metal past Vega. The debris belt remembers every lazy sculptor."'
      ],
      hintPool: ['wolf359', 'sirius', 'pavonis', 'yake']
    },
    {
      captain: 'Pilgrim-Master Hesper Vane',
      guild: 'Ultronaut Free-Caucus',
      quips: [
        '"Thawed six minutes ago after forty-two years under ice. Has anyone fixed Sol\'s dialect yet?"',
        '"I traded half a century for three tonnes of silicate dust at Tau Ceti. Fair swap."'
      ],
      hintPool: ['tauceti', 'vega', 'fomalhaut', 'nursia']
    },
    {
      captain: 'Reefer-Marshal Orlo Krane',
      guild: 'Galactic North Antiquities',
      quips: [
        '"Four hundred passengers upstairs dream in liquid nitrogen while I count hydrogen shift lines."',
        '"Saw a courier burning 4g past TRAPPIST-1 whose plume outshone the red dwarf itself."'
      ],
      hintPool: ['nursia', 'pollux', 'epseri', 'acass']
    },
    {
      captain: 'Tinkerer Marque-of-Glass',
      guild: 'Cocytus Scrimshaw Guild',
      quips: [
        '"Painted my prow with crimson obsidian ice so optical telescopes underestimate our tonnage."',
        '"Check your Doppler fix before smashing MATCH VEL \u2014 an old fix lies faster than light."'
      ],
      hintPool: ['sirius', 'procyon', 'gamov', 'bakunawa']
    },
    {
      captain: 'Sibyl Threnody-4',
      guild: 'Juggler-Bound Courier',
      quips: [
        '"Down in LHS 1140 the global sea opens an unblinking eye straight at the red sun."',
        '"Lighthugger plumes are lighthouses for the lonely; turn off your optical bias and look in IR."'
      ],
      hintPool: ['bakunawa', 'proxima', 'lacaille', 'sipapu']
    },
    {
      captain: 'Factor Borislav Porkov',
      guild: 'Porcine-Syndicate Salvage',
      quips: [
        '"Snout first into the interstellar medium, darling. Keeps the cometary hail off the cabin."',
        '"Nobody needs another ring around a tiny rock-ball; go see a proper orange subgiant!"'
      ],
      hintPool: ['pollux', 'yake', 'altair', 'cygni61']
    }
  ];

  function generateCaptainEncounter(shipName, roleLabel, originSysId, seed) {
    var r = G.mulberry32(clamp(seed || 1337, 1, 9999999));
    var arch = CAPTAIN_ARCHETYPES[Math.floor(r() * CAPTAIN_ARCHETYPES.length)];
    var destId = arch.hintPool[Math.floor(r() * arch.hintPool.length)];
    if (destId === originSysId) destId = arch.hintPool[(arch.hintPool.indexOf(destId) + 1) % arch.hintPool.length];
    var targetSys = SYSTEMS.filter(function (s) { return s.id === destId; })[0] || SYSTEMS[2];
    var freq = (412 + r() * 480).toFixed(1) + ' THz Tightbeam';
    var quip = arch.quips[Math.floor(r() * arch.quips.length)];
    return {
      shipName: shipName,
      captain: arch.captain,
      guild: arch.guild,
      role: roleLabel,
      carrier: freq,
      openingLine: quip,
      rumorDestId: targetSys.id,
      rumorDestName: targetSys.name,
      rumorText: arch.captain + ' passed recent transit ephemeris on ' + targetSys.name +
        ' (' + targetSys.cls + '): ' + (targetSys.exoNote || targetSys.lore) + '.'
    };
  }

  function starRgbFromTemp(T) {
    var temp = clamp(Number(T) || 5778, 2200, 26000);
    if (temp >= 9000) return [0.76, 0.87, 1.0];
    if (temp >= 6400) return [0.95, 0.96, 1.0];
    if (temp >= 5200) return [1.0, 0.94, 0.82];
    if (temp >= 4000) return [1.0, 0.77, 0.52];
    return [1.0, 0.52, 0.34];
  }

  function makeStarCoronaTex(T) {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var g = c.getContext('2d');
    var gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0.0, 'rgba(255,255,255,1.0)');
    gr.addColorStop(0.18, 'rgba(255,255,255,0.72)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.22)');
    gr.addColorStop(1.0, 'rgba(255,255,255,0.0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    var tx = new T.CanvasTexture(c);
    if (T.SRGBColorSpace) tx.colorSpace = T.SRGBColorSpace;
    return tx;
  }

  // -- Photoreal / Cinematic Saturnian Ring & Debris Disk Shader + Exoplanet Builder --
  var RING_PALETTES = {
    'warm-cream':   { c1: 0xf6e3c4, c2: 0xe2b494, c3: 0xc9967a, c4: 0x9db0c4 },
    'amber-gold':   { c1: 0xffebb8, c2: 0xe0a55a, c3: 0xb5723d, c4: 0x8d9eb5 },
    'icy-cyan':     { c1: 0xe8f9ff, c2: 0x9edbf5, c3: 0x5ca4d6, c4: 0xc4d8f2 },
    'rose-silicate':{ c1: 0xf5d6cc, c2: 0xd98679, c3: 0x9c4949, c4: 0xb8a5ba },
    'violet-halo':  { c1: 0xefe3ff, c2: 0xb996f5, c3: 0x7c5bc4, c4: 0x96d4e8 },
    'obsidian-carbon': { c1: 0x826b80, c2: 0x534357, c3: 0x332631, c4: 0x615a73 },
    'jade-frost':   { c1: 0xd0ffe0, c2: 0x75d9ad, c3: 0x2e8b79, c4: 0xa5decc },
    'crimson-dust': { c1: 0xffbfa3, c2: 0xdb654f, c3: 0x823043, c4: 0xb26a79 }
  };
  var RING_STYLES = { saturn: 0, thin: 1, debris: 2, 'double-gap': 3, 'resonant-arcs': 4, 'gossamer-halo': 5 };

  function makeRadialRingGeometry(T, rInner, rOuter, thetaSegs, phiSegs) {
    var segments = Math.max(3, Math.floor(thetaSegs || 180));
    var geo = new T.RingGeometry(rInner, rOuter, segments, phiSegs || 6);
    var pos = geo.attributes.position;
    var uv = geo.attributes.uv;
    var span = Math.max(1e-4, rOuter - rInner);
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), y = pos.getY(i);
      var r = Math.hypot(x, y);
      var u = clamp((r - rInner) / span, 0, 1);
      // RingGeometry duplicates each radial row's endpoints. Keep them at 0 and 1
      // so angular UVs interpolate within each wedge instead of across the disk.
      var v = (i % (segments + 1)) / segments;
      uv.setXY(i, u, v);
    }
    uv.needsUpdate = true;
    return geo;
  }

  // Shared procedural planetary ring optical-depth model (used by rings, planet cloud shadows & volumetric atmosphere)
  var RING_OPTICAL_GLSL = `
    const float RING_TAU = 6.28318530718;
    float ringHash1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
    float ringGaussian(float offset, float width) {
      float x = offset / width;
      return exp(-x * x);
    }
    float ringHarmonic(float turn, float count, float phase) {
      return cos(RING_TAU * fract(turn) * floor(count) + phase);
    }
    float ringTurn(vec2 xz) { return atan(xz.y, xz.x) / RING_TAU; }
    float ringOpticalDepth(float r, float turn, float style) {
      if (r <= 0.002 || r >= 0.998) return 0.0;
      if (style > 4.5) {
        float halo = 0.14 * ringGaussian(r - 0.49, 0.36) * smoothstep(0.01, 0.15, r)
                     * (1.0 - smoothstep(0.74, 1.0, r));
        return halo + 0.68 * ringGaussian(r - 0.12, 0.015);
      }
      if (style > 3.5) {
        float arcs = smoothstep(0.45, 0.97, ringHarmonic(turn, 3.0, 0.45)
                   + 0.30 * ringHarmonic(turn, 7.0, -1.4));
        float clumps = 0.62 + 0.38 * ringHarmonic(turn, 39.0, r * 13.0);
        float braid = 0.020 * ringHarmonic(turn, 11.0, 0.3);
        return 0.14 * ringGaussian(r - 0.32, 0.020)
          + (0.12 + 0.56 * arcs * clumps) * ringGaussian(r - 0.76 + braid, 0.026)
          + (0.06 + 0.26 * arcs) * ringGaussian(r - 0.81 - braid, 0.014);
      }
      if (style > 2.5) {
        float inner = smoothstep(0.08, 0.16, r) * (1.0 - smoothstep(0.35, 0.41, r));
        float outer = smoothstep(0.61, 0.68, r) * (1.0 - smoothstep(0.89, 0.96, r));
        float ripples = 0.70 + 0.16 * sin(r * 165.0) + 0.12 * sin(r * 390.0);
        return (inner * 0.86 + outer * 0.67) * ripples
          * (1.0 - 0.73 * ringGaussian(r - 0.79, 0.012));
      }
      if (style > 1.5) {
        float grains = ringHash1(floor(r * 140.0));
        float arcs = 0.64 + 0.20 * ringHarmonic(turn, 9.0, r * 8.0)
                          + 0.16 * ringHarmonic(turn, 33.0, -r * 19.0);
        float dust = 0.53 * ringGaussian(r - 0.43, 0.24) + 0.36 * ringGaussian(r - 0.79, 0.11);
        return dust * (0.34 + 0.66 * grains) * arcs;
      }
      if (style > 0.5) {
        float braid = 0.023 * ringHarmonic(turn, 12.0, 0.2);
        return 0.16 * ringGaussian(r - 0.23, 0.016)
          + 0.28 * ringGaussian(r - 0.57 + braid, 0.014)
          + 0.30 * ringGaussian(r - 0.61 - braid, 0.012)
          + 0.21 * ringGaussian(r - 0.88, 0.009);
      }
` +
    '  float w1 = 0.5 + 0.5 * sin(r * 46.0 + 0.4);' +
    '  float w2 = 0.5 + 0.5 * sin(r * 148.0 - 1.1);' +
    '  float w3 = 0.5 + 0.5 * sin(r * 410.0 + 2.3);' +
    '  float w4 = 0.5 + 0.5 * sin(r * 920.0);' +
    '  float micro = ringHash1(floor(r * 520.0));' +
    '  float ringlets = 0.36 * w1 + 0.28 * w2 + 0.20 * w3 + 0.10 * w4 + 0.06 * micro;' +
    '  float cRing = smoothstep(0.01, 0.06, r) * (1.0 - smoothstep(0.16, 0.20, r)) * 0.28;' +
    '  float bRing = smoothstep(0.18, 0.22, r) * (1.0 - smoothstep(0.54, 0.57, r)) * 0.96;' +
    '  float aRing = smoothstep(0.625, 0.65, r) * (1.0 - smoothstep(0.90, 0.93, r)) * 0.78;' +
    '  float fRing = ringGaussian(r - 0.968, 0.009) * 0.55;' +
    '  float density = (cRing + bRing + aRing) * (0.48 + 0.68 * ringlets) + fRing;' +
    '  float cassini = 1.0 - 0.90 * ringGaussian(r - 0.596, 0.025);' +
    '  float encke   = 1.0 - 0.92 * ringGaussian(r - 0.825, 0.007);' +
    '  float keeler  = 1.0 - 0.85 * ringGaussian(r - 0.902, 0.0035);' +
    '  float innerSub= 1.0 - 0.55 * ringGaussian(r - 0.345, 0.008);' +
    '  return clamp(density * cassini * encke * keeler * innerSub, 0.0, 0.94);' +
    '}';

  // Seamless 3D spherical noise, domain-warped fluid turbulence & crater field for procedural planet/moon shaders
  var PLANET_NOISE_GLSL =
    'float pHash3(vec3 p){' +
    '  p = fract(p * vec3(0.1031, 0.1030, 0.0973));' +
    '  p += dot(p, p.yxz + 33.33);' +
    '  return fract((p.x + p.y) * p.z);' +
    '}' +
    'float pNoise3(vec3 x){' +
    '  vec3 i = floor(x); vec3 f = fract(x);' +
    '  f = f * f * (3.0 - 2.0 * f);' +
    '  return mix(mix(mix(pHash3(i + vec3(0.0,0.0,0.0)), pHash3(i + vec3(1.0,0.0,0.0)), f.x),' +
    '                 mix(pHash3(i + vec3(0.0,1.0,0.0)), pHash3(i + vec3(1.0,1.0,0.0)), f.x), f.y),' +
    '             mix(mix(pHash3(i + vec3(0.0,0.0,1.0)), pHash3(i + vec3(1.0,0.0,1.0)), f.x),' +
    '                 mix(pHash3(i + vec3(0.0,1.0,1.0)), pHash3(i + vec3(1.0,1.0,1.0)), f.x), f.y), f.z);' +
    '}' +
    'float pFbm5(vec3 p){' +
    '  float v = 0.0; float a = 0.52;' +
    '  for (int i = 0; i < 5; i++) { v += a * pNoise3(p); p = p * 2.06 + vec3(1.7, 9.2, 4.3); a *= 0.5; }' +
    '  return v;' +
    '}' +
    'float pFbm3(vec3 p){' +
    '  float v = 0.0; float a = 0.55;' +
    '  for (int i = 0; i < 3; i++) { v += a * pNoise3(p); p = p * 2.11 + vec3(3.1, 5.7, 2.9); a *= 0.48; }' +
    '  return v;' +
    '}' +
    'float pRidge4(vec3 p){' +
    '  float v = 0.0; float a = 0.54;' +
    '  for (int i = 0; i < 4; i++) { float n = 1.0 - abs(pNoise3(p) * 2.0 - 1.0); v += a * n * n; p = p * 2.14 + vec3(2.4, 6.1, 1.9); a *= 0.5; }' +
    '  return v;' +
    '}' +
    'float pCraterCell(vec3 p, float scale){' +
    '  vec3 q = p * scale;' +
    '  vec3 i = floor(q); vec3 f = fract(q);' +
    '  float best = 4.0;' +
    '  for (int x = -1; x <= 1; x++) {' +
    '    for (int y = -1; y <= 1; y++) {' +
    '      for (int z = -1; z <= 1; z++) {' +
    '        vec3 o = vec3(float(x), float(y), float(z));' +
    '        vec3 h = vec3(pHash3(i + o), pHash3(i + o + 17.3), pHash3(i + o + 41.7));' +
    '        vec3 d = o + 0.18 + 0.64 * h - f;' +
    '        best = min(best, dot(d, d));' +
    '      }' +
    '    }' +
    '  }' +
    '  float r = sqrt(best);' +
    '  float bowl = smoothstep(0.46, 0.12, r) * -0.65;' +
    '  float rim = exp(-pow((r - 0.46) / 0.09, 2.0)) * 0.42;' +
    '  return bowl + rim;' +
    '}';

  // Both planet render paths use the same object-space clouds and screen-space relief.
  var GIANT_CLOUD_GLSL = `
    uniform vec3 uColDark, uColMid, uColBright, uColStorm, uThermalGlow;
    uniform vec4 uGiantParams;
    uniform float uMethaneCirrus;

    vec2 cloudRotate(vec2 p, float angle) {
      float c = cos(angle), s = sin(angle);
      return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    }

    float cloudFbm6(vec3 p, float footprint) {
      float value = 0.0, amplitude = 0.51;
      for (int i = 0; i < 6; i++) {
        float resolved = 1.0 - smoothstep(0.30, 0.82, footprint);
        value += amplitude * mix(0.5, pNoise3(p), resolved);
        p = p * 2.04 + vec3(1.7, 9.2, 4.3);
        footprint *= 2.04;
        amplitude *= 0.53;
      }
      return value * 0.945;
    }

    float cloudRing(float distance, float radius, float width) {
      float x = (distance - radius) / width;
      return exp(-x * x);
    }

    // Tangent-plane coordinates keep each vortex continuous across every meridian.
    void cloudOval(inout vec3 color, inout float height, vec3 sp, vec2 center,
                   vec2 size, vec3 eye, float strength, float twist, float noise) {
      vec3 east = vec3(-sin(center.x), 0.0, cos(center.x));
      vec3 radial = vec3(cos(center.x), 0.0, sin(center.x));
      vec3 normal = radial * cos(center.y) + vec3(0.0, sin(center.y), 0.0);
      float visible = smoothstep(0.35, 0.80, dot(sp, normal));
      vec2 p = vec2(dot(sp, east), dot(sp, cross(east, normal))) / size;
      float d = length(p);
      if (d > 1.55 || visible < 0.001) return;
      vec2 swirl = cloudRotate(p, twist * (1.3 - d) + noise * 0.30);
      vec2 direction = swirl / max(d, 0.10);
      float spiral = direction.x * (4.0 * direction.x * direction.x - 3.0);
      float r = d + spiral * 0.085 * smoothstep(0.1, 0.4, d);
      float mask = (1.0 - smoothstep(1.26, 1.53, d)) * strength * visible;
      float collar = cloudRing(r, 1.12, 0.14);
      float wall = 0.66 * cloudRing(r, 0.88, 0.10) + 0.39 * cloudRing(r, 0.57, 0.075);
      float core = 1.0 - smoothstep(0.79, 1.08, r);
      vec3 vortex = mix(color, eye * (0.84 + 0.25 * noise), core);
      vortex *= 1.0 - 0.45 * collar;
      vortex = mix(vortex, mix(eye, uColBright, 0.66), wall);
      color = mix(color, vortex, mask);
      height += mask * (wall * 0.17 - collar * 0.085 + core * 0.025);
    }

    vec3 giantClouds(vec3 sp, float lat, float footprint, out float height, out vec3 thermal) {
      float bands = uGiantParams.x, turb = uGiantParams.y, storm = uGiantParams.z;
      vec3 seed = vec3(uSeed, uSeed * 1.71, uSeed * 2.39);
      float jetPhase = lat * bands + 0.65 * sin(lat * 3.8 + uSeed);
      float velocity = sin(jetPhase);
      float shear = abs(cos(jetPhase));
      vec2 flowed = cloudRotate(sp.xz, uTime * 0.022 * velocity);
      vec3 flow = vec3(flowed.x, sp.y, flowed.y);
      vec3 eddyP = flow * vec3(7.0, 13.0, 7.0) + seed;
      vec3 warp = vec3(pNoise3(eddyP), pNoise3(eddyP + 13.1), pNoise3(eddyP - 7.3)) - 0.5;

      // Roll up shear boundaries around successive billow centers. The sign of
      // the velocity gradient reverses the roll between adjacent jet boundaries.
      float eddyPhase = dot(flow, vec3(21.0, 3.0, 15.0)) + warp.x * 3.2 - uTime * 0.09;
      float eddy = sin(eddyPhase);
      float billow = shear * shear * eddy;
      vec2 offset = vec2(eddy, velocity * 1.30);
      float eddyMask = smoothstep(0.18, 0.92, cos(eddyPhase)) * (1.0 - smoothstep(0.19, 1.0, dot(offset, offset)));
      vec2 roll = cloudRotate(offset, 3.5 * eddyMask * cos(jetPhase)) - offset;
      vec2 bent = cloudRotate(flowed, turb * (0.078 * billow + 0.14 * warp.z + 0.17 * roll.x));
      vec3 jet = vec3(bent.x, sp.y + turb * (0.031 * (billow + warp.y) + 0.048 * roll.y), bent.y);
      vec3 streakP = jet * vec3(5.2, 33.0, 5.2) + seed + 1.25 * warp * turb;
      float cloud = cloudFbm6(streakP, footprint * (14.0 + 13.0 * turb));
      float thread = pNoise3(jet * vec3(17.0, 113.0, 17.0) + seed * 1.3 + warp * 2.0);
      thread = mix(0.5, thread, 1.0 - smoothstep(0.25, 0.85, footprint * 85.0));

      // The sixth complex harmonic adds Saturn's polar hexagon without longitude cuts.
      float polar = smoothstep(1.06, 1.22, abs(lat)) * (1.0 - smoothstep(1.37, 1.52, abs(lat)));
      vec2 az = cloudRotate(sp.xz / max(length(sp.xz), 0.03), -uTime * 0.005);
      float cosTwo = az.x * az.x - az.y * az.y;
      float hex = 0.037 * uGiantParams.w * polar * cosTwo * (4.0 * cosTwo * cosTwo - 3.0);
      float phase = jetPhase + hex * bands + turb * (0.46 * billow + 1.8 * (cloud - 0.5));
      float belt = sin(phase) * 0.66 + 0.23 * cos(2.11 * phase + 0.7);
      belt += (0.11 + 0.24 * turb) * sin(5.7 * phase + thread * 1.8)
        * (1.0 - smoothstep(0.25, 0.85, footprint * bands * 4.0));
      float band = clamp(0.52 + belt * 0.56 + (cloud - 0.5) * 0.48 * turb, 0.0, 1.0);
      vec3 color = mix(mix(uColDark, uColMid, smoothstep(0.0, 0.56, band)),
                       uColBright, smoothstep(0.40, 1.0, band));
      color *= 0.88 + 0.22 * cloud + 0.075 * turb * (thread - 0.5);

      float filament = 1.0 - smoothstep(0.012, 0.080, abs(cloud - 0.51 + 0.06 * eddy));
      float festoons = filament * shear * smoothstep(0.40, 0.68, thread);
      color = mix(color, uColBright * 1.03, festoons * 0.42 * turb);
      float ice = smoothstep(0.49, 0.68, cloud) * smoothstep(0.45, 0.70, thread);
      color = mix(color, vec3(0.91, 0.97, 1.0), ice * uMethaneCirrus * 0.88);
      height = cloud * 0.58 + thread * 0.12 + festoons * 0.12 + band * 0.17 + ice * 0.05;

      float stormPhase = uSeed * 2.7 + uTime * 0.012;
      float stormLat = -0.37 + 0.13 * sin(uSeed * 3.1);
      cloudOval(color, height, sp, vec2(stormPhase, stormLat), vec2(0.26, 0.125) * max(storm, 0.3),
                uColStorm, smoothstep(0.30, 0.81, storm), 3.2, cloud);
      cloudOval(color, height, sp, vec2(stormPhase + 2.25, 0.40), vec2(0.126, 0.074),
                mix(uColBright, vec3(0.99, 0.98, 0.94), 0.40), smoothstep(0.51, 1.04, storm) * 0.91, -4.1, cloud);
      cloudOval(color, height, sp, vec2(stormPhase - 1.44, -0.57), vec2(0.086, 0.047),
                uColDark, smoothstep(0.69, 1.21, storm) * 0.82, 3.5, cloud);

      thermal = vec3(0.0);
      if (uThermalGlow.r > 0.0) {
        float windows = (1.0 - smoothstep(0.012, 0.062, abs(cloud - 0.49 + 0.024 * eddy)))
          * (1.0 - smoothstep(0.35, 0.69, thread)) * smoothstep(0.20, 0.67, shear);
        thermal = uThermalGlow * (0.019 + 0.30 * windows * windows);
      }
      return color * (0.93 + 0.07 * cos(lat));
    }

    vec3 cloudTopNormal(vec3 n, vec3 surface, float height, float footprint) {
      vec3 x = dFdx(surface), y = dFdy(surface);
      vec3 sx = cross(y, n), sy = cross(n, x);
      float det = dot(x, sx);
      vec3 grad = (dFdx(height) * sx + dFdy(height) * sy) * sign(det) / max(abs(det), 1e-9);
      float relief = 0.0031 * (1.0 - smoothstep(0.012, 0.055, footprint));
      return normalize(n - relief * grad / max(1.0, length(grad) * 0.030));
    }
`;

  function methaneCirrus(gp, kind) {
    if (gp.id === 'neptune-cobalt') return 1.0;
    if (gp.id === 'uranus-aqua') return 0.10;
    return /(?:ice|frost)-giant/.test(kind) || gp.id === 'emerald-methane' ? 0.42 : 0.0;
  }

  function giantCloudUniforms(T, gp, kind) {
    return {
      uColDark: { value: new T.Vector3(...gp.dark) },
      uColMid: { value: new T.Vector3(...gp.mid) },
      uColBright: { value: new T.Vector3(...gp.bright) },
      uColStorm: { value: new T.Vector3(...gp.storm) },
      uGiantParams: { value: new T.Vector4(gp.bands, gp.turb, gp.stormSize, gp.hex) },
      uThermalGlow: { value: new T.Vector3(...gp.thermalGlow) },
      uMethaneCirrus: { value: methaneCirrus(gp, kind) }
    };
  }

  function createSaturnianRingMaterial(T, paletteKey, planetRadius, ringStyle, betaRayleigh) {
    var pal = RING_PALETTES[paletteKey] || RING_PALETTES['warm-cream'];
    var styleCode = RING_STYLES[ringStyle] || 0;
    var bR = betaRayleigh || [0.42, 0.88, 1.85];
    return new T.ShaderMaterial({
      uniforms: {
        uCol1: { value: new T.Color(pal.c1) },
        uCol2: { value: new T.Color(pal.c2) },
        uCol3: { value: new T.Color(pal.c3) },
        uCol4: { value: new T.Color(pal.c4) },
        uLightDir: { value: new T.Vector3(0.65, 0.45, 0.60).normalize() },
        uPlanetCenter: { value: new T.Vector3(0, 0, 0) },
        uPlanetRadius: { value: planetRadius || 28.0 },
        uAtmoScale: { value: 0.14 },
        uBetaR: { value: new T.Vector3(bR[0], bR[1], bR[2]) },
        uDopplerTint: { value: new T.Vector3(1, 1, 1) },
        uDopplerGain: { value: 1.0 },
        uGammaX: { value: 1.0 },
        uStyle: { value: styleCode }
      },
      vertexShader:
        'varying vec2 vUv;' +
        'varying vec3 vWorldPos;' +
        'varying vec3 vViewPos;' +
        'void main(){' +
        '  vUv = uv;' +
        '  vec4 wp = modelMatrix * vec4(position, 1.0);' +
        '  vWorldPos = wp.xyz;' +
        '  vec4 mv = viewMatrix * wp;' +
        '  vViewPos = -mv.xyz;' +
        '  gl_Position = projectionMatrix * mv;' +
        '}',
      fragmentShader:
        'uniform vec3 uCol1; uniform vec3 uCol2; uniform vec3 uCol3; uniform vec3 uCol4;' +
        'uniform vec3 uLightDir; uniform vec3 uPlanetCenter; uniform float uPlanetRadius;' +
        'uniform float uAtmoScale; uniform vec3 uBetaR;' +
        'uniform vec3 uDopplerTint; uniform float uDopplerGain; uniform float uGammaX; uniform float uStyle;' +
        'varying vec2 vUv; varying vec3 vWorldPos; varying vec3 vViewPos;' +
        RING_OPTICAL_GLSL +
        'void main(){' +
        '  float r = vUv.x;' +
        '  if (r <= 0.002 || r >= 0.998) discard;' +
        '  float alpha = ringOpticalDepth(r, vUv.y, uStyle);' +
        '  vec3 col = uCol1;' +
        '  if (uStyle > 4.5) {' +
        '    col = mix(uCol4, uCol1, ringGaussian(r - 0.12, 0.04));' +
        '  } else if (uStyle > 3.5) {' +
        '    col = mix(uCol3, uCol1, smoothstep(0.04, 0.50, alpha));' +
        '  } else if (uStyle > 2.5) {' +
        '    col = mix(uCol1, uCol2, smoothstep(0.40, 0.65, r));' +
        '  } else if (uStyle > 1.5) {' +
        '    float n = 0.50 + 0.30 * ringHarmonic(vUv.y, 29.0, r * 150.0) + 0.20 * ringHarmonic(vUv.y, 83.0, r * 59.0);' +
        '    col = mix(uCol3, uCol1, 0.22 + 0.72 * n);' +
        '  } else if (uStyle > 0.5) {' +
        '    col = mix(uCol3, uCol2, smoothstep(0.08, 0.33, alpha));' +
        '  } else {' +
        '    float w1 = 0.5 + 0.5 * sin(r * 46.0 + 0.4);' +
        '    float w2 = 0.5 + 0.5 * sin(r * 148.0 - 1.1);' +
        '    float w3 = 0.5 + 0.5 * sin(r * 410.0 + 2.3);' +
        '    col = mix(uCol4, uCol1, smoothstep(0.14, 0.28, r));' +
        '    col = mix(col, uCol2, 0.55 * w1 + 0.25 * smoothstep(0.35, 0.55, r));' +
        '    col = mix(col, uCol3, 0.42 * (1.0 - w2) * smoothstep(0.58, 0.88, r));' +
        '    float spoke = 0.94 + 0.06 * ringHarmonic(vUv.y, 9.0, r * 24.0) * smoothstep(0.22, 0.52, r) * (1.0 - smoothstep(0.52, 0.64, r));' +
        '    col *= (0.84 + 0.30 * w3) * spoke;' +
        '  }' +
        '  if (alpha < 0.012) discard;' +
        '  vec3 rel = vWorldPos - uPlanetCenter;' +
        '  rel.x *= uGammaX;' +
        '  float along = dot(rel, uLightDir);' +
        '  vec3 perp = rel - along * uLightDir;' +
        '  float distAxis = length(perp);' +
        '  vec3 shadowCol = vec3(1.0);' +
        '  if (along < 0.0) {' +
        '    float coreR = uPlanetRadius;' +
        '    float limbH = (distAxis - coreR) / max(0.001, coreR * uAtmoScale);' +
        '    float coreMask = smoothstep(-0.04, 0.03, limbH);' +
        '    float limbTau = exp(-max(0.0, limbH) * 3.8) * 2.4 * smoothstep(1.25, 0.0, limbH);' +
        '    vec3 sunsetTrans = exp(-uBetaR * limbTau * 1.45);' +
        '    vec3 penumbra = mix(vec3(0.025, 0.028, 0.042), sunsetTrans, coreMask);' +
        '    shadowCol = mix(penumbra, vec3(1.0), smoothstep(0.55, 1.15, limbH));' +
        '  }' +
        '  vec3 V = normalize(vViewPos);' +
        '  float mu = dot(-V, uLightDir);' +
        '  float fwdMie = 0.52 * pow(max(1e-4, mu), 3.2);' +
        '  float oppSurge = 0.16 * pow(max(1e-4, -mu), 4.0);' +
        '  float scatter = 1.0 + fwdMie + oppSurge;' +
        '  vec3 rawCol = col * uDopplerTint * uDopplerGain * shadowCol * scatter;' +
        '  vec3 finalCol = rawCol / (vec3(1.0) + 0.24 * rawCol);' +
        '  gl_FragColor = vec4(finalCol, alpha);' +
        '}',
      transparent: true,
      side: T.DoubleSide,
      depthWrite: false
    });
  }

  function hashString(str, salt) {
    var s = String(str || '');
    var h = (Number(salt) || 137) | 0;
    for (var i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  function giantPalette(id, dark, mid, bright, storm, atmo, bands, turb, stormSize, hex, thermalGlow) {
    return { id, dark, mid, bright, storm, atmo, bands, turb, stormSize, hex, thermalGlow: thermalGlow || [0, 0, 0] };
  }

  var GIANT_ARCHETYPES = {
    saturn: giantPalette('saturn-gold', [0.38, 0.30, 0.24], [0.76, 0.64, 0.47], [0.96, 0.89, 0.74], [0.89, 0.68, 0.46], [0.44, 0.90, 1.88], 16, 0.72, 0.52, 1),
    jupiter: giantPalette('jupiter-banded', [0.29, 0.105, 0.058], [0.78, 0.49, 0.28], [1.00, 0.93, 0.79], [0.72, 0.19, 0.115], [0.64, 0.76, 1.42], 19, 1.38, 1.25, 0),
    uranus: giantPalette('uranus-aqua', [0.36, 0.66, 0.72], [0.49, 0.78, 0.83], [0.70, 0.91, 0.93], [0.58, 0.88, 0.94], [0.26, 0.98, 1.65], 6.5, 0.28, 0.18, 0),
    neptune: giantPalette('neptune-cobalt', [0.06, 0.17, 0.45], [0.16, 0.40, 0.82], [0.50, 0.77, 1.00], [0.04, 0.10, 0.32], [0.28, 0.74, 2.20], 11, 0.84, 0.96, 0)
  };

  // Artistic palettes inspired by the Sudarsky albedo classes (arXiv:astro-ph/9910504).
  var EXO_GIANT_PALETTES = [
    // I: Ammonia.
    giantPalette('champagne-gold', [0.55, 0.42, 0.23], [0.88, 0.74, 0.49], [1.00, 0.97, 0.79], [0.98, 0.82, 0.55], [0.58, 0.87, 1.47], 15, 0.54, 0.56, 0),
    giantPalette('dusty-terracotta', [0.33, 0.13, 0.10], [0.80, 0.39, 0.29], [0.98, 0.74, 0.58], [0.77, 0.22, 0.11], [0.98, 0.64, 0.76], 20, 1.21, 1.06, 0),
    giantPalette('rose-ivory', [0.61, 0.37, 0.43], [0.87, 0.65, 0.67], [1.00, 0.94, 0.90], [0.80, 0.43, 0.54], [0.79, 0.66, 1.24], 17, 0.73, 0.56, 0),
    // II: High-albedo water clouds.
    giantPalette('pearl-water', [0.49, 0.58, 0.70], [0.80, 0.87, 0.93], [1.00, 0.99, 0.97], [0.99, 1.00, 1.00], [0.39, 0.82, 1.42], 8, 1.16, 0.97, 0),
    giantPalette('cerulean-cloud', [0.15, 0.35, 0.60], [0.40, 0.68, 0.88], [0.87, 0.96, 1.00], [0.93, 0.99, 1.00], [0.32, 0.86, 2.08], 14.5, 1.12, 0.86, 0),
    // III: Haze and Rayleigh color references, including the blue of HD 189733b (arXiv:1307.3239).
    giantPalette('azure-rayleigh', [0.033, 0.11, 0.42], [0.055, 0.27, 0.76], [0.21, 0.56, 0.98], [0.038, 0.13, 0.46], [0.13, 0.63, 2.35], 8, 0.36, 0.34, 0),
    giantPalette('electric-indigo', [0.11, 0.069, 0.36], [0.31, 0.20, 0.77], [0.70, 0.62, 1.00], [0.58, 0.37, 0.99], [0.54, 0.42, 2.20], 12, 0.48, 0.49, 0),
    // IV: Dark alkali atmospheres.
    giantPalette('violet-alkali', [0.044, 0.021, 0.067], [0.22, 0.12, 0.28], [0.45, 0.29, 0.54], [0.49, 0.20, 0.34], [0.61, 0.46, 1.65], 11.5, 0.88, 0.90, 0, [0.95, 0.045, 0.12]),
    giantPalette('midnight-slate', [0.046, 0.065, 0.11], [0.16, 0.24, 0.33], [0.37, 0.49, 0.59], [0.14, 0.18, 0.25], [0.35, 0.63, 1.49], 8.5, 0.61, 0.67, 0, [0.44, 0.052, 0.092]),
    // V: Hot silicate and metal clouds.
    giantPalette('copper-obsidian', [0.19, 0.066, 0.051], [0.62, 0.29, 0.16], [0.95, 0.62, 0.42], [0.97, 0.42, 0.20], [0.91, 0.58, 0.48], 22, 1.42, 1.08, 0, [1.06, 0.24, 0.05]),
    giantPalette('amber-silicate', [0.38, 0.22, 0.039], [0.88, 0.57, 0.094], [1.00, 0.88, 0.38], [1.00, 0.50, 0.13], [1.02, 0.69, 0.36], 21, 1.32, 1.05, 0, [1.15, 0.39, 0.07]),
    // Ice, frost, and speculative photochemical hazes.
    giantPalette('emerald-methane', [0.034, 0.24, 0.28], [0.085, 0.63, 0.49], [0.57, 0.97, 0.79], [0.76, 1.00, 0.90], [0.22, 1.12, 1.45], 13, 1.22, 1.12, 0),
    giantPalette('mint-cryo', [0.29, 0.55, 0.53], [0.57, 0.82, 0.73], [0.82, 0.98, 0.91], [0.91, 1.00, 0.96], [0.25, 0.99, 1.34], 9, 0.47, 0.50, 0),
    giantPalette('crimson-tholin', [0.35, 0.088, 0.22], [0.76, 0.28, 0.46], [0.98, 0.68, 0.58], [0.96, 0.41, 0.63], [1.18, 0.54, 0.82], 12, 0.77, 1.04, 0),
    giantPalette('jade-pearl', [0.14, 0.31, 0.21], [0.53, 0.59, 0.27], [0.87, 0.80, 0.50], [0.77, 0.44, 0.24], [0.43, 0.94, 0.98], 15.5, 0.92, 0.72, 0),
    giantPalette('glacial-indigo', [0.06, 0.14, 0.34], [0.21, 0.46, 0.72], [0.68, 0.88, 0.98], [0.10, 0.22, 0.52], [0.28, 0.84, 2.12], 9.5, 0.62, 0.68, 0)
  ];
  var EXO_GIANT_BY_ID = new Map(EXO_GIANT_PALETTES.map(p => [p.id, p]));
  var SYSTEM_GIANT_BY_NAME = new Map(SYSTEMS.map(sys => [sys.planet.name.toLowerCase(), sys.planet.giantPalette]));
  var GIANT_POOLS = {
    'ice-giant': ['emerald-methane', 'cerulean-cloud', 'mint-cryo', 'glacial-indigo'],
    'frost-giant': ['emerald-methane', 'mint-cryo', 'glacial-indigo'],
    'sapphire-disk': ['cerulean-cloud', 'azure-rayleigh', 'electric-indigo', 'glacial-indigo'],
    'rust-giant': ['dusty-terracotta', 'crimson-tholin', 'amber-silicate', 'copper-obsidian'],
    'aerostat-clouds': ['amber-silicate', 'copper-obsidian', 'violet-alkali', 'midnight-slate']
  };

  function gasGiantPalette(pInfo, seedVal) {
    var nm = String((pInfo && pInfo.name) || '').toLowerCase();
    var kd = String((pInfo && pInfo.kind) || '').toLowerCase();
    if (nm === 'saturn') return GIANT_ARCHETYPES.saturn;
    if (nm === 'jupiter') return GIANT_ARCHETYPES.jupiter;
    if (nm === 'uranus') return GIANT_ARCHETYPES.uranus;
    if (nm === 'neptune') return GIANT_ARCHETYPES.neptune;
    var assigned = EXO_GIANT_BY_ID.get((pInfo && pInfo.giantPalette) || SYSTEM_GIANT_BY_NAME.get(nm));
    if (assigned) return assigned;
    var h = hashString(nm + '|' + kd, seedVal);
    var pool = Object.hasOwn(GIANT_POOLS, kd) && GIANT_POOLS[kd];
    var base = pool ? EXO_GIANT_BY_ID.get(pool[h % pool.length]) : EXO_GIANT_PALETTES[h % EXO_GIANT_PALETTES.length];
    var jit = ((h >>> 4) % 100) / 100;
    var jit2 = ((h >>> 11) % 100) / 100;
    function tweak(rgb, amt) {
      return [
        clamp(rgb[0] + (jit - 0.5) * amt, 0.04, 0.99),
        clamp(rgb[1] + (jit2 - 0.5) * amt, 0.04, 0.99),
        clamp(rgb[2] + (0.5 - jit) * amt, 0.04, 0.99)
      ];
    }
    return {
      id: base.id + '-' + (h % 97),
      dark: tweak(base.dark, 0.08),
      mid: tweak(base.mid, 0.12),
      bright: tweak(base.bright, 0.10),
      storm: tweak(base.storm, 0.14),
      atmo: base.atmo.slice(),
      bands: clamp(base.bands + (jit - 0.5) * 6.0, 6.0, 24.0),
      turb: clamp(base.turb + (jit2 - 0.5) * 0.45, 0.25, 1.55),
      stormSize: clamp(base.stormSize * (0.75 + 0.55 * jit), 0.15, 1.40),
      hex: (kd === 'saturnian' && (h % 3 === 0)) ? 1.0 : base.hex,
      thermalGlow: base.thermalGlow.slice()
    };
  }

  function planetAtmoProfile(pInfo, seedVal) {
    var k = pInfo.kind || 'saturnian';
    if (k === 'eyeball-rock') {
      return { ratio: 1.095, hr: 0.24, hm: 0.14, betaR: [1.35, 0.58, 0.36], betaM: 0.34, intensity: 1.25, spec: 0.08, magma: 1.0 };
    }
    if (k === 'pelagic-ocean' || k === 'terrestrial-archipelago') {
      return { ratio: 1.115, hr: 0.25, hm: 0.12, betaR: [0.36, 0.88, 2.05], betaM: 0.36, intensity: 1.52, spec: k === 'pelagic-ocean' ? 0.55 : 0.32, magma: 0.0 };
    }
    var gp = gasGiantPalette(pInfo, seedVal);
    if (k === 'aerostat-clouds' || k === 'rust-giant') {
      return { ratio: 1.135, hr: 0.28, hm: 0.16, betaR: gp.atmo, betaM: 0.42, intensity: 1.38, spec: 0.04, magma: 0.0, giantPal: gp };
    }
    if (k === 'ice-giant' || k === 'frost-giant' || k === 'sapphire-disk') {
      return { ratio: 1.140, hr: 0.28, hm: 0.15, betaR: gp.atmo, betaM: 0.34, intensity: 1.48, spec: 0.08, magma: 0.0, giantPal: gp };
    }
    return { ratio: 1.145, hr: 0.29, hm: 0.16, betaR: gp.atmo, betaM: 0.38, intensity: 1.58, spec: 0.04, magma: 0.0, giantPal: gp };
  }

  function bodyAtmoProfile(body, isMoon, seedVal) {
    if (!body) return null;
    var nm = String(body.name || '').toLowerCase();
    var kd = String(body.kind || '').toLowerCase();
    if (nm === 'titan' || kd === 'hazy-planetoid') {
      return { ratio: 1.135, hr: 0.32, hm: 0.19, betaR: [0.24, 0.72, 1.92], betaM: 0.36, mieTint: [1.00, 0.64, 0.24], intensity: 1.08 };
    }
    if (nm === 'pluto' || nm === 'triton') {
      return { ratio: 1.095, hr: 0.30, hm: 0.16, betaR: [0.32, 0.76, 1.82], betaM: 0.22, mieTint: [0.76, 0.90, 1.00], intensity: 0.95 };
    }
    if (nm === 'mars' || /arid-mars/.test(kd)) {
      if (isMoon) return null;
      return { ratio: 1.085, hr: 0.24, hm: 0.18, betaR: [1.18, 0.62, 0.42], betaM: 0.32, mieTint: [1.00, 0.58, 0.36], intensity: 0.88 };
    }
    if (nm === 'venus' || /venus/.test(kd)) {
      return { ratio: 1.130, hr: 0.30, hm: 0.24, betaR: [0.85, 0.80, 0.52], betaM: 0.58, mieTint: [1.00, 0.86, 0.54], intensity: 1.32 };
    }
    if (nm === 'earth' || /terrestrial|pelagic|ocean/.test(kd)) {
      return { ratio: 1.105, hr: 0.25, hm: 0.12, betaR: [0.36, 0.88, 2.05], betaM: 0.34, mieTint: [1.00, 0.95, 0.88], intensity: 1.48 };
    }
    if (/eyeball/.test(kd)) {
      return { ratio: 1.095, hr: 0.24, hm: 0.14, betaR: [1.35, 0.58, 0.36], betaM: 0.34, mieTint: [1.00, 0.68, 0.46], intensity: 1.22 };
    }
    if (/giant|saturnian|clouds|disk|brown-dwarf/.test(kd)) {
      return Object.assign({ mieTint: [1.00, 0.95, 0.88] }, planetAtmoProfile(body, seedVal));
    }
    return null;
  }

  function kindCodeForPlanet(kind) {
    if (kind === 'rust-giant') return 1.0;
    if (kind === 'ice-giant' || kind === 'frost-giant') return 2.0;
    if (kind === 'sapphire-disk') return 3.0;
    if (kind === 'aerostat-clouds') return 4.0;
    if (kind === 'pelagic-ocean') return 5.0;
    if (kind === 'terrestrial-archipelago') return 6.0;
    if (kind === 'eyeball-rock') return 7.0;
    return 0.0; // saturnian
  }

  function createPlanetSurfaceMaterial(T, R0, prof, hasRings, rIn, rOut, rStyle, pInfo, seedVal) {
    var styleCode = RING_STYLES[rStyle] || 0;
    var kind = (pInfo && pInfo.kind) || 'saturnian';
    var kCode = kindCodeForPlanet(kind);
    var pSeed = ((Number(seedVal) || 137) % 997) * 0.137;
    var gp = (prof && prof.giantPal) || gasGiantPalette(pInfo, seedVal);
    var mat = new T.ShaderMaterial({
      uniforms: {
        ...giantCloudUniforms(T, gp, kind),
        uTint: { value: new T.Color(1, 1, 1) },
        uLightLocal: { value: new T.Vector3(0.65, 0.45, 0.60).normalize() },
        uCamLocal: { value: new T.Vector3(0, 0, R0 * 5.0) },
        uPlanetR: { value: R0 },
        uHasRings: { value: hasRings ? 1.0 : 0.0 },
        uRingInner: { value: rIn || R0 * 1.32 },
        uRingOuter: { value: rOut || R0 * 3.12 },
        uRingStyle: { value: styleCode },
        uBetaR: { value: new T.Vector3(prof.betaR[0], prof.betaR[1], prof.betaR[2]) },
        uSpec: { value: prof.spec },
        uMagma: { value: prof.magma },
        uKindCode: { value: kCode },
        uSeed: { value: pSeed },
        uTime: { value: 0.0 },
        uSpinY: { value: 0.0 }
      },
      vertexShader:
        'varying vec3 vSphereDir;' +
        'varying vec3 vGroupPos;' +
        'varying vec3 vGroupNorm;' +
        'uniform float uSpinY;' +
        'void main(){' +
        '  vSphereDir = normalize(position);' +
        '  float cs = cos(uSpinY), sn = sin(uSpinY);' +
        '  vec3 gp = vec3(cs * position.x + sn * position.z, position.y, -sn * position.x + cs * position.z);' +
        '  vec3 gn = normalize(vec3(cs * normal.x + sn * normal.z, normal.y, -sn * normal.x + cs * normal.z));' +
        '  vGroupPos = gp;' +
        '  vGroupNorm = gn;' +
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);' +
        '}',
      fragmentShader:
        'uniform vec3 uTint; uniform vec3 uLightLocal; uniform vec3 uCamLocal;' +
        'uniform float uPlanetR; uniform float uHasRings; uniform float uRingInner; uniform float uRingOuter; uniform float uRingStyle;' +
        'uniform vec3 uBetaR; uniform float uSpec; uniform float uMagma; uniform float uKindCode; uniform float uSeed; uniform float uTime;' +
        'varying vec3 vSphereDir; varying vec3 vGroupPos; varying vec3 vGroupNorm;' +
        RING_OPTICAL_GLSL +
        PLANET_NOISE_GLSL +
        GIANT_CLOUD_GLSL +
        'void main(){' +
        '  vec3 sp = normalize(vSphereDir);' +
        '  vec3 N = normalize(vGroupNorm);' +
        '  vec3 L = normalize(uLightLocal);' +
        '  vec3 V = normalize(uCamLocal - vGroupPos);' +
        '  float lat = asin(clamp(sp.y, -1.0, 1.0));' +
        '  vec3 seedOff = vec3(uSeed, uSeed * 1.71, uSeed * 2.39);' +
        '  vec3 albedo;' +
        '  float specMask = uSpec;' +
        '  float cloudCover = 0.0;' +
        '  vec3 nightGlow = vec3(0.0);' +
        '  vec3 thermalGlow = vec3(0.0);' +
        '  bool isGiant = (uKindCode < 4.5);' +
        '  if (isGiant) {' +
        '    float footprint = max(length(dFdx(sp)), length(dFdy(sp)));' +
        '    float cloudHeight;' +
        '    albedo = giantClouds(sp, lat, footprint, cloudHeight, thermalGlow);' +
        '    N = cloudTopNormal(N, vGroupPos / uPlanetR, cloudHeight, footprint);' +
        '  } else if (uKindCode < 6.5) {' +
        '    bool isPelagic = (uKindCode < 5.5);' +
        '    vec3 tp = sp * 2.85 + seedOff;' +
        '    float cont = pFbm5(tp + 0.42 * pFbm3(tp * 2.1));' +
        '    float seaLvl = isPelagic ? 0.67 : 0.50;' +
        '    float landMask = smoothstep(seaLvl - 0.025, seaLvl + 0.035, cont);' +
        '    float coast = smoothstep(seaLvl - 0.09, seaLvl, cont) * (1.0 - landMask);' +
        '    float mtn = pRidge4(sp * 7.5 + seedOff) * landMask;' +
        '    float absLat = abs(lat) + (cont - 0.5) * 0.16;' +
        '    float iceCap = smoothstep(isPelagic ? 0.88 : 1.08, isPelagic ? 1.18 : 1.34, absLat);' +
        '    vec3 deepSea = isPelagic ? vec3(0.03, 0.11, 0.25) : vec3(0.04, 0.14, 0.30);' +
        '    vec3 shallowSea = vec3(0.10, 0.40, 0.56);' +
        '    vec3 seaCol = mix(deepSea, shallowSea, coast * 0.85 + 0.15 * pFbm3(sp * 9.0));' +
        '    float arid = smoothstep(0.42, 0.72, pFbm3(sp * 4.2 + 7.3)) * (1.0 - smoothstep(0.35, 0.85, abs(lat)));' +
        '    vec3 vegCol = mix(vec3(0.14, 0.34, 0.18), vec3(0.56, 0.46, 0.28), arid);' +
        '    vec3 rockCol = mix(vegCol, vec3(0.46, 0.43, 0.40), smoothstep(0.35, 0.72, mtn));' +
        '    rockCol = mix(rockCol, vec3(0.92, 0.95, 0.98), smoothstep(0.68, 0.88, mtn));' +
        '    vec3 surfCol = mix(seaCol, rockCol, landMask);' +
        '    surfCol = mix(surfCol, vec3(0.88, 0.94, 0.99), iceCap);' +
        '    vec2 cloudXZ = cloudRotate(sp.xz, -uTime * 0.022);' +
        '    vec3 cp = vec3(cloudXZ.x, sp.y * 1.6, cloudXZ.y) * 3.6 + seedOff * 1.7;' +
        '    float cWarp = pFbm3(cp * 1.6);' +
        '    float clouds = smoothstep(0.47, 0.76, pFbm3(cp * 2.2 + vec3(cWarp * 1.5, -cWarp, cWarp * 1.2)));' +
        '    cloudCover = clouds * 0.78;' +
        '    surfCol *= 1.0 - 0.32*smoothstep(0.50,0.68,pFbm3(cp*2.2+vec3(cWarp*1.5,-cWarp,cWarp*1.2)+L*0.12));' +
        '    albedo = mix(surfCol, vec3(0.94, 0.97, 1.00), cloudCover);' +
        '    specMask = uSpec * (1.0 - landMask) * (1.0 - iceCap) * (1.0 - cloudCover * 0.85);' +
        '    float eN = 0.015;' +
        '    float h0 = mtn * 0.6 + cont * 0.4;' +
        '    float hx = pRidge4((sp + vec3(eN, 0.0, 0.0)) * 7.5 + seedOff) * landMask;' +
        '    float hy = pRidge4((sp + vec3(0.0, eN, 0.0)) * 7.5 + seedOff) * landMask;' +
        '    N = normalize(N - vec3(hx - h0, hy - h0, 0.0) * 0.45 * (1.0 - cloudCover));' +
        '    if (!isPelagic) {' +
        '      float cityNoise = pFbm3(sp * 22.0 + seedOff);' +
        '      float cityMask = landMask * (1.0 - iceCap) * smoothstep(0.64, 0.78, cityNoise) * (1.0 - smoothstep(0.58, 0.82, mtn));' +
        '      nightGlow = vec3(1.0, 0.74, 0.36) * cityMask * (1.0 - cloudCover * 0.65) * 0.42;' +
        '    }' +
        '  } else {' +
        '    float subSun = dot(N, L);' +
        '    float cr = pCraterCell(sp + seedOff * 0.2, 5.5) + 0.5 * pCraterCell(sp - seedOff * 0.3, 12.0);' +
        '    float fiss = pRidge4(sp * 6.4 + seedOff + 0.35 * pFbm3(sp * 11.0));' +
        '    float dayHot = smoothstep(0.08, 0.82, subSun);' +
        '    float twilight = exp(-pow((subSun - 0.06) / 0.26, 2.0));' +
        '    vec3 nightIce = mix(vec3(0.10, 0.16, 0.28), vec3(0.48, 0.66, 0.82), clamp(0.5 + cr + 0.3 * pFbm3(sp * 8.0), 0.0, 1.0));' +
        '    vec3 termBand = mix(vec3(0.24, 0.36, 0.34), vec3(0.48, 0.56, 0.44), pFbm3(sp * 6.0 + seedOff));' +
        '    vec3 scorched = mix(vec3(0.11, 0.07, 0.07), vec3(0.36, 0.16, 0.11), clamp(0.5 + cr, 0.0, 1.0));' +
        '    albedo = mix(nightIce, scorched, smoothstep(-0.12, 0.35, subSun));' +
        '    albedo = mix(albedo, termBand, twilight * 0.65);' +
        '    float lavaCrack = smoothstep(0.66, 0.91, fiss) * dayHot;' +
        '    float caldera = smoothstep(0.62, 0.94, subSun) * smoothstep(0.58, 0.80, pFbm3(sp * 9.5 + uTime * 0.03));' +
        '    float lava = clamp(lavaCrack + caldera * 0.65, 0.0, 1.0) * uMagma;' +
        '    nightGlow = mix(vec3(0.95, 0.22, 0.04), vec3(1.0, 0.82, 0.34), lava * lava) * lava * 1.15;' +
        '    specMask = 0.22 * twilight;' +
        '  }' +
        '  float ndl = dot(N, L);' +
        '  float ndv = clamp(dot(N, V), 0.0, 1.0);' +
        '  float ringShadow = 1.0;' +
        '  if (uHasRings > 0.5 && abs(L.y) > 0.002 && ndl > -0.05) {' +
        '    float s = -vGroupPos.y / L.y;' +
        '    if (s > 0.0) {' +
        '      vec2 hitXZ = vGroupPos.xz + s * L.xz;' +
        '      float rHit = length(hitXZ);' +
        '      if (rHit > uRingInner && rHit < uRingOuter) {' +
        '        float uR = (rHit - uRingInner) / max(0.001, uRingOuter - uRingInner);' +
        '        float tau = ringOpticalDepth(uR, ringTurn(hitXZ), uRingStyle);' +
        '        ringShadow = 1.0 - tau * 0.90;' +
        '      }' +
        '    }' +
        '  }' +
        '  float sunPath = 1.0 / max(0.07, ndl + 0.15);' +
        '  vec3 sunTrans = exp(-uBetaR * clamp((sunPath - 1.0) * 0.14, 0.0, 2.2));' +
        '  float diff = smoothstep(-0.15, 0.08, ndl) * max(0.0, ndl * 0.93 + 0.07);' +
        '  if (isGiant) {' +
        '    float minn = pow(max(0.02, diff), 0.78) * pow(max(0.18, ndv), 0.24);' +
        '    diff = mix(diff, minn, 0.65)*pow(ndv,0.4);' +
        '  }' +
        '  vec3 lit = albedo * sunTrans * diff * ringShadow * 1.14;' +
        '  float ambDay = smoothstep(-0.24, 0.30, ndl);' +
        '  lit += albedo * vec3(0.032, 0.045, 0.072) * ambDay * (0.35 + 0.65 * ringShadow);' +
        '  if (specMask > 0.01 && ndl > 0.0) {' +
        '    vec3 H = normalize(L + V);' +
        '    float ndh = max(0.0, dot(N, H));' +
        '    float spTight = pow(ndh, 64.0) * 0.85 + pow(ndh, 16.0) * 0.25;' +
        '    lit += sunTrans * spTight * specMask * ringShadow;' +
        '  }' +
        '  float nightFade = (uMagma > 0.5) ? 1.0 : 1.0 - smoothstep(-0.20, 0.10, ndl);' +
        '  lit += nightGlow * nightFade;' +
        '  lit += thermalGlow * (1.0 - smoothstep(-0.68, 0.04, dot(normalize(vGroupNorm), L)));' +
        '  float viewAir = clamp((1.0 / max(0.18, ndv) - 1.0) * 0.12, 0.0, 1.35);' +
        '  vec3 viewTrans = exp(-uBetaR * viewAir * 0.50);' +
        '  vec3 limbHaze = normalize(uBetaR + vec3(0.08)) * pow(max(1e-4, 1.0 - ndv), 3.4) * max(0.0, ndl * 0.85 + 0.16) * ringShadow * 0.24;' +
        '  vec3 rawOut = (lit * viewTrans + limbHaze) * uTint;' +
        '  vec3 toned = rawOut / (vec3(1.0) + 0.28 * rawOut);' +
        '  gl_FragColor = vec4(toned, 1.0);' +
        '}',
      fog: false,
      extensions: { derivatives: true }
    });
    mat.color = mat.uniforms.uTint.value;
    return mat;
  }

  // True 3D Volumetric Rayleigh + Mie Atmospheric Raymarch Shader with Volumetric Ring Shadows
  function createVolumetricAtmoMaterial(T, R0, prof, hasRings, rIn, rOut, rStyle) {
    var RAtmo = R0 * prof.ratio;
    var styleCode = RING_STYLES[rStyle] || 0;
    var mieTint = (prof && prof.mieTint) || [1.0, 0.96, 0.90];
    return new T.ShaderMaterial({
      uniforms: {
        uCamLocal: { value: new T.Vector3(0, 0, R0 * 5.0) },
        uLightLocal: { value: new T.Vector3(0.65, 0.45, 0.60).normalize() },
        uLightDir: { value: new T.Vector3(0.65, 0.45, 0.60).normalize() },
        uPlanetR: { value: R0 },
        uAtmoR: { value: RAtmo },
        uScaleH: { value: new T.Vector2(prof.hr, prof.hm) },
        uBetaR: { value: new T.Vector3(prof.betaR[0], prof.betaR[1], prof.betaR[2]) },
        uBetaM: { value: prof.betaM },
        uMieTint: { value: new T.Vector3(mieTint[0], mieTint[1], mieTint[2]) },
        uIntensity: { value: prof.intensity },
        uHasRings: { value: hasRings ? 1.0 : 0.0 },
        uRingInner: { value: rIn || R0 * 1.32 },
        uRingOuter: { value: rOut || R0 * 3.12 },
        uRingStyle: { value: styleCode },
        uDopplerTint: { value: new T.Vector3(1, 1, 1) },
        uDopplerGain: { value: 1.0 }
      },
      vertexShader:
        'varying vec3 vLocalPos;' +
        'void main(){' +
        '  vLocalPos = position;' +
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);' +
        '}',
      fragmentShader:
        'uniform vec3 uCamLocal; uniform vec3 uLightLocal;' +
        'uniform float uPlanetR; uniform float uAtmoR; uniform vec2 uScaleH;' +
        'uniform vec3 uBetaR; uniform float uBetaM; uniform vec3 uMieTint; uniform float uIntensity;' +
        'uniform float uHasRings; uniform float uRingInner; uniform float uRingOuter; uniform float uRingStyle;' +
        'uniform vec3 uDopplerTint; uniform float uDopplerGain;' +
        'varying vec3 vLocalPos;' +
        RING_OPTICAL_GLSL +
        'vec2 raySphere(vec3 ro, vec3 rd, float r){' +
        '  float b = dot(ro, rd);' +
        '  float c = dot(ro, ro) - r * r;' +
        '  float h = b * b - c;' +
        '  if (h < 0.0) return vec2(1e6, -1e6);' +
        '  h = sqrt(h);' +
        '  return vec2(-b - h, -b + h);' +
        '}' +
        'void main(){' +
        '  vec3 ro = uCamLocal;' +
        '  vec3 rd = normalize(vLocalPos - ro);' +
        '  vec3 L = normalize(uLightLocal);' +
        '  vec2 hitA = raySphere(ro, rd, uAtmoR);' +
        '  if (hitA.y < 0.0) discard;' +
        '  float t0 = max(0.0, hitA.x);' +
        '  float t1 = hitA.y;' +
        '  vec2 hitP = raySphere(ro, rd, uPlanetR * 0.999);' +
        '  bool hitsCore = (hitP.x > 0.0 && hitP.x < t1);' +
        '  if (hitsCore) t1 = hitP.x;' +
        '  if (t1 <= t0 + 1e-4) discard;' +
        // Ring-plane view occlusion so foreground rings cleanly block behind-ring atmosphere
        '  float tRingView = -1.0; float ringViewPass = 1.0;' +
        '  if (uHasRings > 0.5 && abs(rd.y) > 0.002) {' +
        '    float tr = -ro.y / rd.y;' +
        '    if (tr > t0 && tr < t1) {' +
        '      vec2 vxz = ro.xz + tr * rd.xz;' +
        '      float vr = length(vxz);' +
        '      if (vr > uRingInner && vr < uRingOuter) {' +
        '        float uV = (vr - uRingInner) / max(0.001, uRingOuter - uRingInner);' +
        '        tRingView = tr;' +
        '        ringViewPass = 1.0 - ringOpticalDepth(uV, ringTurn(vxz), uRingStyle);' +
        '      }' +
        '    }' +
        '  }' +
        '  float atmoH = max(0.001, uAtmoR - uPlanetR);' +
        '  float stepLen = (t1 - t0) / 16.0;' +
        '  float dsNorm = stepLen / atmoH;' +
        '  vec3 sumR = vec3(0.0);' +
        '  vec3 sumM = vec3(0.0);' +
        '  float odViewR = 0.0;' +
        '  float odViewM = 0.0;' +
        '  for (int i = 0; i < 16; i++) {' +
        '    float t = t0 + (float(i) + 0.5) * stepLen;' +
        '    vec3 p = ro + rd * t;' +
        '    float h = max(0.0, (length(p) - uPlanetR) / atmoH);' +
        '    float rhoR = exp(-h / uScaleH.x);' +
        '    float rhoM = exp(-h / uScaleH.y);' +
        '    odViewR += rhoR * dsNorm;' +
        '    odViewM += rhoM * dsNorm;' +
        // Planet core shadow test along sun ray
        '    float along = dot(p, L);' +
        '    float planetLit = 1.0;' +
        '    if (along < 0.0) {' +
        '      float dAxis = length(p - along * L);' +
        '      planetLit = smoothstep(uPlanetR * 0.96, uPlanetR * 1.015, dAxis);' +
        '    }' +
        '    if (planetLit > 0.003) {' +
        // 4-step sun-ray atmospheric optical depth (produces crisp orange/red sunset terminator & chromatic shadow rims)
        '      vec2 hitSunA = raySphere(p, L, uAtmoR);' +
        '      float sunStep = max(0.0, hitSunA.y) / 4.0;' +
        '      float sunDsN = sunStep / atmoH;' +
        '      float odSunR = 0.0; float odSunM = 0.0;' +
        '      for (int j = 0; j < 4; j++) {' +
        '        vec3 ps = p + L * ((float(j) + 0.5) * sunStep);' +
        '        float hs = max(0.0, (length(ps) - uPlanetR) / atmoH);' +
        '        odSunR += exp(-hs / uScaleH.x) * sunDsN;' +
        '        odSunM += exp(-hs / uScaleH.y) * sunDsN;' +
        '      }' +
        // 3D Volumetric ring shadow sampled along sun ray from this exact 3D altitude
        '      float ringLit = 1.0;' +
        '      if (uHasRings > 0.5 && abs(L.y) > 0.002) {' +
        '        float sr = -p.y / L.y;' +
        '        if (sr > 0.0) {' +
        '          vec2 hxz = p.xz + sr * L.xz;' +
        '          float rH = length(hxz);' +
        '          if (rH > uRingInner && rH < uRingOuter) {' +
        '            float uH = (rH - uRingInner) / max(0.001, uRingOuter - uRingInner);' +
        '            ringLit = 1.0 - ringOpticalDepth(uH, ringTurn(hxz), uRingStyle) * 0.96;' +
        '          }' +
        '        }' +
        '      }' +
        '      vec3 tau = uBetaR * (odViewR + odSunR) * 0.85 + vec3(uBetaM * (odViewM + odSunM) * 0.92);' +
        '      vec3 atten = exp(-tau) * planetLit * ringLit;' +
        '      if (tRingView > 0.0 && t > tRingView) atten *= ringViewPass;' +
        '      sumR += atten * rhoR * dsNorm;' +
        '      sumM += atten * rhoM * dsNorm;' +
        '    }' +
        '  }' +
        '  float mu = dot(rd, L);' +
        '  float phaseR = 0.42 * (1.0 + mu * mu);' +
        '  float g = 0.76;' +
        '  float g2 = g * g;' +
        '  float phaseM = 0.24 * (1.0 - g2) / pow(max(0.06, 1.0 + g2 - 2.0 * g * mu), 1.5);' +
        '  vec3 scatter = (sumR * uBetaR * phaseR + sumM * uMieTint * uBetaM * phaseM) * uIntensity;' +
        '  scatter = 1.0 - exp(-scatter * 1.45);' +
        '  vec3 col = scatter * uDopplerTint * uDopplerGain;' +
        '  float a = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);' +
        '  if (a < 0.003) discard;' +
        '  gl_FragColor = vec4(col, a);' +
        '}',
      transparent: true,
      blending: T.AdditiveBlending,
      side: T.FrontSide,
      depthWrite: false,
      depthTest: true
    });
  }

  // Universal Procedural GLSL Shader for Secondary Planets (Earth, Mars, Jupiter, Exoplanets) & Moons (Titan, Enceladus, Luna)
  function emissionMaterial(T, fragment, deformation, side) {
    return new T.ShaderMaterial({
      uniforms: {uLightDir:{value:new T.Vector3(1,0,0)},uTime:{value:0}},
      transparent:true, side:side || T.DoubleSide, depthWrite:false, blending:T.AdditiveBlending,
      vertexShader: `uniform float uTime; varying vec2 vUv; varying vec3 n,v;
        void main(){ vUv=uv; vec3 p=position, lightingNormal=normal; ${deformation || ''}
          vec4 world=modelMatrix*vec4(p,1.);
          n=normalize(mat3(modelMatrix)*lightingNormal); v=cameraPosition-world.xyz;
          gl_Position=projectionMatrix*viewMatrix*world; }`,
      fragmentShader: `uniform vec3 uLightDir; uniform float uTime; varying vec2 vUv; varying vec3 n,v;
        void main(){ vec3 N=normalize(n),V=normalize(v),L=normalize(uLightDir); ${fragment} }`
    });
  }
  function createTerminatorAtmoMaterial(T, haze) {
    return emissionMaterial(T, `float mu=dot(N,L);
      float ndv=abs(dot(N,V));
      float rim=pow(max(0.,1.-ndv),2.8)*smoothstep(0.0,.28,ndv);
      float phase=pow(max(-dot(V,L),0.),3.2);
      vec3 rayCol=mix(vec3(.96,.36,.12),vec3(.24,.64,1.),smoothstep(-.08,.45,mu));
      vec3 hazeCol=mix(vec3(.88,.54,.22),vec3(.45,.76,.98),smoothstep(.15,.75,1.-ndv));
      gl_FragColor=${haze ? 'vec4(hazeCol,rim*(.12+.55*phase)*smoothstep(-.32,.20,mu))'
        : 'vec4(rayCol,rim*.65*smoothstep(-.26,.12,mu))'};`, '', T.BackSide);
  }
  function createAuroraRig(T) {
    // Whisper-subtle atmospheric polar auroral oval hugging the upper cloud deck (no protruding neon cylinders)
    var rig = new T.Group();
    var geo = new T.SphereGeometry(1.012, 48, 28);
    var mat = new T.ShaderMaterial({
      uniforms: { uLightDir: { value: new T.Vector3(1, 0, 0) }, uTime: { value: 0 } },
      transparent: true,
      side: T.FrontSide,
      depthWrite: false,
      blending: T.AdditiveBlending,
      vertexShader:
        'varying vec3 vSphere; varying vec3 vWorldN; varying vec3 vViewV;' +
        'void main(){' +
        '  vSphere = normalize(position);' +
        '  vec4 w = modelMatrix * vec4(position, 1.0);' +
        '  vWorldN = normalize(mat3(modelMatrix) * normal);' +
        '  vViewV = normalize(cameraPosition - w.xyz);' +
        '  gl_Position = projectionMatrix * viewMatrix * w;' +
        '}',
      fragmentShader:
        'uniform vec3 uLightDir; uniform float uTime;' +
        'varying vec3 vSphere; varying vec3 vWorldN; varying vec3 vViewV;' +
        PLANET_NOISE_GLSL +
        'void main(){' +
        '  vec3 sp = normalize(vSphere);' +
        '  float absY = abs(sp.y);' +
        '  if (absY < 0.86) discard;' +
        '  float lat = asin(clamp(absY, 0.0, 1.0));' +
        '  float lon = atan(sp.z, sp.x);' +
        '  float ovalWave = 0.032 * sin(lon * 2.0 + uTime * 0.14) + 0.018 * cos(lon * 3.0 - uTime * 0.10);' +
        '  float ringD = abs(lat - (1.29 + ovalWave));' +
        '  float oval = exp(-pow(ringD / 0.048, 2.0));' +
        '  float wisp = pFbm3(vec3(cos(lon) * 3.2, sp.y * 5.0, sin(lon) * 3.2) + vec3(uTime * 0.06, 0.0, -uTime * 0.05));' +
        '  float veil = smoothstep(0.32, 0.78, wisp) * oval;' +
        '  vec3 N = normalize(vWorldN); vec3 L = normalize(uLightDir); vec3 V = normalize(vViewV);' +
        '  float night = 1.0 - smoothstep(-0.22, 0.12, dot(N, L));' +
        '  float limb = smoothstep(0.05, 0.65, 1.0 - abs(dot(N, V)));' +
        '  float alpha = veil * night * (0.28 + 0.72 * limb) * 0.22;' +
        '  if (alpha < 0.004) discard;' +
        '  vec3 col = mix(vec3(0.16, 0.78, 0.88), vec3(0.46, 0.34, 0.92), clamp(ringD * 12.0, 0.0, 1.0));' +
        '  gl_FragColor = vec4(col, alpha);' +
        '}'
    });
    rig.add(new T.Mesh(geo, mat));
    return rig;
  }
  function createCometRig(T) {
    var rig=new T.Group();
    function tail(width,length,color) {
      var geo=new T.ConeGeometry(width,length,24,1,true);
      geo.translate(0,-length/2,0);
      var mat=emissionMaterial(T,`float streak=.65+.35*sin(vUv.x*94.+sin(vUv.y*18.-uTime*3.));
        gl_FragColor=vec4(${color},vUv.y*streak*pow(abs(dot(N,V)),2.)*.65);`);
      var mesh=new T.Mesh(geo,mat);
      rig.add(mesh);
      return mesh;
    }
    rig.userData.ion=tail(.75,15,'vec3(.11,.7,1.)');
    rig.userData.dust=tail(1.7,9,'vec3(1.,.78,.48)');
    var coma=new T.Mesh(new T.PlaneGeometry(5,5),emissionMaterial(T,`vec2 d=vUv*2.-1.;
      float r=dot(d,d); gl_FragColor=vec4(.52,.86,1.,.068*(1.-smoothstep(.45,1.,r))/(.06+r));`));
    rig.add(coma);
    rig.userData.coma=coma;
    return rig;
  }
  function makeBodyGeometry(T, body, moons) {
    if (!body.lumpy) return new T.SphereGeometry(1, (!moons || (body.radiusKm || 0) >= 1000) ? 64 : 32, (!moons || (body.radiusKm || 0) >= 1000) ? 48 : 24);
    var geo=new T.IcosahedronGeometry(1,3), pos=geo.attributes.position;
    for(var i=0;i<pos.count;i++){
      var x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
      var pits=Math.pow(Math.max(0,Math.cos(8*x+4*z)*Math.sin(9*y-5*x)),4);
      var r=1+.11*Math.sin(x*4+y)*Math.cos(z*3)-.13*pits;
      pos.setXYZ(i,x*r*1.16,y*r*.82,z*r);
    }
    geo.computeVertexNormals();
    return geo;
  }
  function classifyCelestialBody(opts) {
    var nm = String((opts && opts.name) || '').toLowerCase();
    var kd = String((opts && opts.kind) || '').toLowerCase();
    var isMoon = !!(opts && opts.isMoon);
    if (kd === 'brown-dwarf') return 7;
    if (kd === 'cryovolcanic' || nm === 'triton' || kd === 'icy') return 5;
    if (/cratered|asteroid|comet/.test(kd)) return 6;
    if (nm === 'titan' || /hazy/.test(kd)) return 4;
    if (kd === 'arid-mars') return 3;
    if (nm.indexOf('enceladus') >= 0 || nm.indexOf('europa') >= 0) return 5.0;
    if (nm.indexOf('luna') >= 0 || nm.indexOf('moon') >= 0 && isMoon) {
      var cHex = opts && typeof opts.col === 'number' ? opts.col : 0xc8d2e0;
      var bCh = cHex & 255, rCh = (cHex >> 16) & 255;
      if (nm.indexOf('luna') >= 0) return 6.0;
      if (bCh > rCh + 18) return 5.0;
      if (rCh > bCh + 36) return 4.0;
      return 6.0;
    }
    if (isMoon) {
      var colH = opts && typeof opts.col === 'number' ? opts.col : 0xc8d2e0;
      var rC = (colH >> 16) & 255, bC = colH & 255;
      if (bC > rC + 16) return 5.0;
      if (rC > bC + 38) return 4.0;
      return 6.0;
    }
    if (nm.indexOf('mars') >= 0) return 3.0;
    if (/(?:ice|frost)-giant|sapphire/.test(kd)) return 1.0;
    if (nm.indexOf('jupiter') >= 0 || /saturn|giant|clouds/.test(kd)) return 0.0;
    if (/eyeball|rock/.test(kd)) return 3.0;
    return 2.0; // Earth / temperate terrestrial / ocean super-Earth
  }

  function createCelestialBodyMaterial(T, opts) {
    opts = opts || {};
    var bType = opts.bodyType != null ? opts.bodyType : classifyCelestialBody(opts);
    var nmStr = String(opts.name || 'body');
    var hSeed = Number(opts.seed) || 0;
    if (!hSeed) {
      for (var si = 0; si < nmStr.length; si++) hSeed = (hSeed * 37 + nmStr.charCodeAt(si)) % 10007;
    }
    var seedF = (hSeed % 997) * 0.173 + 1.37;
    var baseC = new T.Color(opts.col != null ? opts.col : 0xffffff);
    var kind = opts.kind || (bType < 0.5 ? 'rust-giant' : 'ice-giant');
    var gp = gasGiantPalette({ name: nmStr, kind, giantPalette: opts.giantPalette }, hSeed);
    var mat = new T.ShaderMaterial({
      uniforms: {
        ...giantCloudUniforms(T, gp, kind),
        uBodyType: { value: bType },
        uSeed: { value: seedF },
        uBaseTint: { value: baseC },
        uColor: { value: new T.Color(1, 1, 1) },
        uLightDir: { value: new T.Vector3(0.65, 0.45, 0.60).normalize() },
        uTime: { value: 0.0 }
      },
      vertexShader:
        'varying vec3 vSphere;' +
        'varying vec3 vWorldN;' +
        'varying vec3 vViewV;' +
        'void main(){' +
        '  vSphere = normalize(position);' +
        '  vec4 wp = modelMatrix * vec4(position, 1.0);' +
        '  vWorldN = normalize(mat3(modelMatrix) * normal);' +
        '  vViewV = normalize(cameraPosition - wp.xyz);' +
        '  gl_Position = projectionMatrix * viewMatrix * wp;' +
        '}',
      fragmentShader:
        'uniform float uBodyType; uniform float uSeed; uniform vec3 uBaseTint; uniform vec3 uColor;' +
        'uniform vec3 uLightDir; uniform float uTime;' +
        'varying vec3 vSphere; varying vec3 vWorldN; varying vec3 vViewV;' +
        PLANET_NOISE_GLSL +
        GIANT_CLOUD_GLSL +
        'void main(){' +
        '  vec3 sp = normalize(vSphere);' +
        '  vec3 N = normalize(vWorldN);' +
        '  vec3 L = normalize(uLightDir);' +
        '  vec3 V = normalize(vViewV);' +
        '  float lat = asin(clamp(sp.y, -1.0, 1.0));' +
        '  vec3 sOff = vec3(uSeed, uSeed * 1.63, uSeed * 2.27);' +
        '  vec3 albedo = vec3(0.7);' +
        '  vec3 rimCol = vec3(0.35, 0.62, 1.0);' +
        '  float rimAmt = 0.22;' +
        '  float specAmt = 0.0;' +
        '  vec3 nightEm = vec3(0.0);' +
        '  vec3 thermalGlow = vec3(0.0);' +
        '  if (uBodyType < 1.5) {' +
        '    float footprint = max(length(dFdx(sp)), length(dFdy(sp)));' +
        '    float cloudHeight;' +
        '    albedo = giantClouds(sp, lat, footprint, cloudHeight, thermalGlow);' +
        '    N = cloudTopNormal(N, vWorldN, cloudHeight, footprint);' +
        '    rimCol = mix(uColMid, uColBright, 0.5);' +
        '    rimAmt = mix(0.22, 0.30, step(0.5, uBodyType));' +
        '  } else if (uBodyType < 2.5) {' +
        // 2: Temperate Terrestrial / Earth / Ocean Super-Earth
        '    float c = pFbm5(sp * 3.0 + sOff + 0.35 * pFbm3(sp * 6.0));' +
        '    float land = smoothstep(0.49, 0.54, c);' +
        '    float mtn = pRidge4(sp * 8.0 + sOff) * land;' +
        '    float cap = smoothstep(1.06, 1.32, abs(lat) + (c - 0.5) * 0.15);' +
        '    vec3 sea = mix(vec3(0.03, 0.13, 0.32), vec3(0.09, 0.38, 0.55), smoothstep(0.40, 0.50, c));' +
        '    vec3 grn = mix(vec3(0.14, 0.36, 0.17), vec3(0.58, 0.47, 0.28), smoothstep(0.42, 0.75, pFbm3(sp * 4.5 + 3.1)));' +
        '    grn = mix(grn, vec3(0.88, 0.92, 0.96), smoothstep(0.66, 0.88, mtn));' +
        '    albedo = mix(sea, grn, land);' +
        '    albedo = mix(albedo, vec3(0.92, 0.96, 1.0), cap);' +
        '    float cld = smoothstep(0.48, 0.76, pFbm3(sp * 3.6 + sOff * 1.9 + vec3(uTime * 0.02, 0.0, -uTime * 0.015)));' +
        '    float shadow = smoothstep(0.48,0.69,pFbm3(sp*3.6+sOff*1.9+vec3(uTime*0.02,0.0,-uTime*0.015)+L*0.10));' +
        '    albedo = mix(albedo * (1.0 - shadow * 0.34), vec3(0.95, 0.98, 1.0), cld * 0.78);' +
        '    specAmt = 0.52 * (1.0 - land) * (1.0 - cap) * (1.0 - cld * 0.85);' +
        '    float city = land * (1.0 - cap) * smoothstep(0.66, 0.80, pFbm3(sp * 20.0 + sOff)) * (1.0 - cld * 0.7);' +
        '    nightEm = vec3(1.0, 0.76, 0.38) * city * 0.38;' +
        '    rimCol = vec3(0.28, 0.64, 1.0); rimAmt = 0.32;' +
        '  } else if (uBodyType < 3.5) {' +
        // 3: Mars / Arid Canyon & Volcanic Rocky World
        '    float n = pFbm5(sp * 3.4 + sOff);' +
        '    float cr = pCraterCell(sp + sOff * 0.15, 5.2) + 0.45 * pCraterCell(sp * 1.3 - sOff * 0.2, 11.0);' +
        '    float rift = smoothstep(0.74, 0.92, pRidge4(sp * 4.2 + sOff));' +
        '    float cap = smoothstep(1.18, 1.38, abs(lat) + (n - 0.5) * 0.12);' +
        '    albedo = mix(vec3(0.42, 0.19, 0.11), vec3(0.82, 0.44, 0.24), clamp(n + cr * 0.35, 0.0, 1.0));' +
        '    albedo = mix(albedo, vec3(0.20, 0.11, 0.09), rift * 0.65);' +
        '    albedo = mix(albedo, vec3(0.93, 0.91, 0.89), cap);' +
        '    rimCol = vec3(0.92, 0.54, 0.34); rimAmt = 0.20;' +
        '  } else if (uBodyType < 4.5) {' +
        // 4: Titan / Photochemical Tholin Haze Moon with Detached Blue Stratospheric Halo
        '    float bandW = pFbm3(sp * 3.4 + sOff);' +
        '    float hz = 0.5 + 0.5 * sin(lat * 6.0 + 0.8 * bandW);' +
        '    float polarHood = smoothstep(0.95, 1.38, abs(lat) + (bandW - 0.5) * 0.18);' +
        '    float dune = smoothstep(0.42, 0.68, pFbm5(sp * 4.8 + sOff * 1.3));' +
        '    float mare = smoothstep(0.58, 0.72, pFbm3(sp * 2.8 + sOff)) * (1.0 - smoothstep(0.0, 0.55, 1.0 - abs(lat)));' +
        '    vec3 baseTholin = mix(vec3(0.58, 0.34, 0.13), vec3(0.88, 0.62, 0.28), hz * 0.65 + dune * 0.35);' +
        '    baseTholin = mix(baseTholin, vec3(0.46, 0.28, 0.12), polarHood * 0.45);' +
        '    albedo = mix(baseTholin, vec3(0.26, 0.18, 0.10), mare * 0.42);' +
        '    specAmt = 0.22 * mare;' +
        '    rimCol = vec3(0.34, 0.76, 1.00); rimAmt = 0.34;' +
        '  } else if (uBodyType < 5.5) {' +
        // 5: Enceladus / Europa Cryovolcanic Fractured Icy Moon
        '    float cr = pCraterCell(sp + sOff * 0.2, 6.5) * 0.45;' +
        '    float tiger = 1.0-smoothstep(0.0,0.035,abs(pFbm3(sp*7.0+sOff)-0.5));' +
        '    albedo = mix(vec3(0.76, 0.88, 0.96), vec3(0.96, 0.99, 1.0), clamp(0.6 + cr + 0.3 * pFbm3(sp * 7.0), 0.0, 1.0));' +
        '    albedo = mix(albedo, mix(vec3(0.49,0.19,0.11),vec3(0.22,0.64,0.88),cr+0.4), tiger * 0.78);' +
        '    albedo *= mix(vec3(1.0), uBaseTint, 0.25);' +
        '    specAmt = 0.24;' +
        '    nightEm = vec3(0.16, 0.68, 0.95) * tiger * 0.14;' +
        '    rimCol = vec3(0.62, 0.90, 1.0); rimAmt = 0.20;' +
        '  } else if (uBodyType > 6.5) {' +
        '    float density = clamp(0.5+0.5*sin(lat*13.0+6.0*pFbm3(sp*5.0+sOff+uTime*0.01)),0.0,1.0);' +
        '    albedo = mix(vec3(0.10,0.025,0.06),vec3(0.024,0.009,0.035),density);' +
        '    nightEm = pow(1.0-density,3.0)*vec3(1.1,0.025,0.27); rimCol=vec3(0.65,0.04,0.3);' +
        '  } else {' +
        // 6: Luna / Cratered Regolith Moon (dark basaltic maria + bright rayed highlands)
        '    float maria = smoothstep(0.46, 0.64, pFbm3(sp * 2.1 + sOff));' +
        '    float cr1 = pCraterCell(sp + sOff * 0.1, 4.8);' +
        '    float cr2 = pCraterCell(sp - sOff * 0.25, 11.5);' +
        '    float rays = smoothstep(0.22, 0.48, cr1) * (0.5 + 0.5 * sin(atan(sp.y, sp.x) * 18.0 + uSeed));' +
        '    vec3 highCol = vec3(0.70, 0.70, 0.69) * mix(vec3(1.0), uBaseTint, 0.45);' +
        '    vec3 mareCol = highCol * 0.46;' +
        '    albedo = mix(highCol, mareCol, maria);' +
        '    albedo *= clamp(0.92 + cr1 * 0.45 + cr2 * 0.28 + rays * 0.18, 0.38, 1.25);' +
        '    rimCol = highCol; rimAmt = 0.06;' +
        '  }' +
        '  float ndl = dot(N, L);' +
        '  float ndv = clamp(dot(N, V), 0.0, 1.0);' +
        '  float diff = smoothstep(-0.12, 0.08, ndl) * max(0.0, ndl * 0.94 + 0.06);' +
        '  if (uBodyType > 5.5) {' +
        // Dusty Oren-Nayar style lunar regolith flatness near full phase
        '    diff = max(ndl,0.0)/(max(ndl,0.0)+ndv+0.001);' +
        '  } else if (uBodyType < 1.5 || (uBodyType > 3.5 && uBodyType < 4.5)) {' +
        '    diff = mix(diff, pow(max(0.02, diff), 0.76) * pow(max(0.20, ndv), 0.22), 0.65);' +
        '  }' +
        '  vec3 lit = albedo * diff * 1.15 + albedo * vec3(0.028, 0.036, 0.054) * smoothstep(-0.25, 0.28, ndl);' +
        '  if (specAmt > 0.01 && ndl > 0.0) {' +
        '    vec3 H = normalize(L + V);' +
        '    lit += vec3(1.0, 0.96, 0.88) * pow(max(0.0, dot(N, H)), 48.0) * specAmt;' +
        '  }' +
        '  lit *= mix(1.0,pow(ndv,0.4),1.0-step(1.5,uBodyType));' +
        '  lit += nightEm * max(step(6.5,uBodyType),1.0-smoothstep(-0.18,0.08,ndl));' +
        '  lit += thermalGlow * (1.0 - smoothstep(-0.68, 0.04, dot(normalize(vWorldN), L)));' +
        '  vec3 rim = rimCol * pow(max(1e-4, 1.0 - ndv), 3.2) * max(step(6.5,uBodyType),max(0.0, ndl * 0.82 + 0.18)) * rimAmt;' +
        '  vec3 rawC = (lit + rim) * uColor * (uBodyType==6.0 ? step(0.00001,ndl) : 1.0);' +
        '  gl_FragColor = vec4(rawC / (vec3(1.0) + 0.25 * rawC), 1.0);' +
        '}',
      fog: false,
      extensions: { derivatives: true }
    });
    return mat;
  }

  function makePlanetTexture(T, sys) {
    var c = document.createElement('canvas');
    c.width = 1024;
    c.height = 512;
    var g = c.getContext('2d');
    var r = G.mulberry32(sys.T + sys.name.charCodeAt(0) * 137);
    var kind = sys.planet.kind;

    if (kind === 'eyeball-rock') {
      // Tidally locked rocky world: scorched crimson magma dayside, twilight emerald/slate ring, glacier nightside
      var bg = g.createLinearGradient(0, 0, 1024, 0);
      bg.addColorStop(0.0, '#10182e');
      bg.addColorStop(0.24, '#243a58');
      bg.addColorStop(0.38, '#546b5c');
      bg.addColorStop(0.50, '#d64e1f');
      bg.addColorStop(0.62, '#4a645a');
      bg.addColorStop(0.76, '#1e334d');
      bg.addColorStop(1.0, '#10182e');
      g.fillStyle = bg;
      g.fillRect(0, 0, 1024, 512);
      var sunHot = g.createRadialGradient(512, 256, 8, 512, 256, 210);
      sunHot.addColorStop(0.0, 'rgba(255, 224, 150, 0.95)');
      sunHot.addColorStop(0.35, 'rgba(255, 96, 36, 0.72)');
      sunHot.addColorStop(0.75, 'rgba(92, 28, 22, 0.32)');
      sunHot.addColorStop(1.0, 'rgba(0,0,0,0)');
      g.fillStyle = sunHot;
      g.fillRect(0, 0, 1024, 512);
      for (var cr = 0; cr < 70; cr++) {
        var cxP = r() * 1024, cyP = 32 + r() * 448;
        g.fillStyle = r() < 0.5 ? 'rgba(255, 190, 120, 0.14)' : 'rgba(200, 230, 255, 0.16)';
        g.beginPath(); g.arc(cxP, cyP, 4 + r() * 24, 0, Math.PI * 2); g.fill();
      }
    } else if (kind === 'pelagic-ocean') {
      // Global deep brine ocean with bright polar ice packs & swirling cyclone vortices
      var oGrad = g.createLinearGradient(0, 0, 0, 512);
      oGrad.addColorStop(0.0, '#dceef8');
      oGrad.addColorStop(0.18, '#6298ba');
      oGrad.addColorStop(0.50, '#0d2e56');
      oGrad.addColorStop(0.82, '#5a8eb2');
      oGrad.addColorStop(1.0, '#d8ebf6');
      g.fillStyle = oGrad;
      g.fillRect(0, 0, 1024, 512);
      for (var sw = 0; sw < 56; sw++) {
        g.strokeStyle = 'rgba(220, 244, 255, 0.26)';
        g.lineWidth = 2 + r() * 4;
        g.beginPath();
        g.arc(r() * 1024, 80 + r() * 352, 12 + r() * 32, r() * 2, r() * 2 + 2.8);
        g.stroke();
      }
    } else if (kind === 'terrestrial-archipelago') {
      // Oceans + ochre/emerald fractured continents + cloud streaks
      g.fillStyle = '#12385c';
      g.fillRect(0, 0, 1024, 512);
      for (var lm = 0; lm < 38; lm++) {
        g.fillStyle = r() < 0.55 ? 'rgba(136, 114, 78, 0.72)' : 'rgba(62, 118, 86, 0.65)';
        g.beginPath();
        g.ellipse(r() * 1024, 60 + r() * 392, 24 + r() * 88, 12 + r() * 42, r() * Math.PI, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = 'rgba(245, 250, 255, 0.35)';
      g.fillRect(0, 0, 1024, 34);
      g.fillRect(0, 478, 1024, 34);
      for (var cl = 0; cl < 42; cl++) {
        g.fillStyle = 'rgba(240, 248, 255, 0.26)';
        g.beginPath();
        g.ellipse(r() * 1024, 50 + r() * 412, 34 + r() * 96, 4 + r() * 10, (r() - 0.5) * 0.25, 0, Math.PI * 2);
        g.fill();
      }
    } else if (kind === 'aerostat-clouds') {
      // Pollux orange-giant illuminated super-heated amber & charcoal cloud decks
      for (var ya = 0; ya < 512; ya++) {
        var va = ya / 512;
        var wave = 0.5 + 0.5 * Math.sin(va * Math.PI * 19 + Math.cos(va * Math.PI * 6));
        g.fillStyle = 'rgb(' + Math.round(140 + 108 * wave) + ',' + Math.round(62 + 98 * wave) + ',' + Math.round(30 + 38 * wave) + ')';
        g.fillRect(0, ya, 1024, 1);
      }
      for (var ed = 0; ed < 36; ed++) {
        g.fillStyle = r() < 0.5 ? 'rgba(255, 224, 160, 0.24)' : 'rgba(42, 16, 12, 0.28)';
        g.beginPath();
        g.ellipse(r() * 1024, 48 + r() * 416, 28 + r() * 72, 6 + r() * 14, (r() - 0.5) * 0.2, 0, Math.PI * 2);
        g.fill();
      }
    } else {
      var gpTex = gasGiantPalette(sys.planet, sys.T + sys.name.charCodeAt(0) * 137);
      var to255 = function (rgb) { return [Math.round(rgb[0] * 255), Math.round(rgb[1] * 255), Math.round(rgb[2] * 255)]; };
      var pal = [to255(gpTex.dark), to255(gpTex.mid), to255(gpTex.bright), to255(gpTex.storm)];
      var bFreq = gpTex.bands;

      for (var y = 0; y < 512; y++) {
        var v = y / 512;
        var lat = (v - 0.5) * Math.PI;
        var polar = Math.pow(Math.cos(lat), 0.35);
        var b1 = 0.5 + 0.5 * Math.sin(v * Math.PI * bFreq + 0.8 * Math.sin(v * Math.PI * 4));
        var b2 = 0.5 + 0.5 * Math.cos(v * Math.PI * (bFreq * 2.1) - 1.4);
        var b3 = 0.5 + 0.5 * Math.sin(v * Math.PI * (bFreq * 4.4));
        var mix1 = clamp(0.55 * b1 + 0.30 * b2 + 0.15 * b3, 0, 1);

        var cA = mix1 < 0.5 ? pal[0] : pal[1];
        var cB = mix1 < 0.5 ? pal[1] : pal[2];
        var tLocal = mix1 < 0.5 ? mix1 * 2 : (mix1 - 0.5) * 2;
        var rr = Math.round(lerp(cA[0], cB[0], tLocal) * (0.45 + 0.55 * polar));
        var gg = Math.round(lerp(cA[1], cB[1], tLocal) * (0.45 + 0.55 * polar));
        var bb = Math.round(lerp(cA[2], cB[2], tLocal) * (0.45 + 0.55 * polar));
        g.fillStyle = 'rgb(' + rr + ',' + gg + ',' + bb + ')';
        g.fillRect(0, y, 1024, 1);
      }

      for (var s = 0; s < 48; s++) {
        var sx = r() * 1024;
        var sy = 64 + r() * 384;
        var rx = 16 + r() * 68;
        var ry = 4 + r() * 14;
        var cPick = pal[Math.floor(r() * pal.length)];
        g.fillStyle = 'rgba(' + cPick[0] + ',' + cPick[1] + ',' + cPick[2] + ',0.24)';
        g.beginPath();
        g.ellipse(sx, sy, rx, ry, (r() - 0.5) * 0.14, 0, Math.PI * 2);
        g.fill();
      }
    }

    var tx = new T.CanvasTexture(c);
    tx.wrapS = T.RepeatWrapping;
    if (T.SRGBColorSpace) tx.colorSpace = T.SRGBColorSpace;
    tx.anisotropy = 4;
    return tx;
  }

  function makeStationTextures(T, seed) {
    function makeTex(w, h, draw, srgb) {
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      draw(c.getContext('2d'), w, h);
      var tx = new T.CanvasTexture(c);
      tx.wrapS = tx.wrapT = T.RepeatWrapping;
      if (srgb && T.SRGBColorSpace) tx.colorSpace = T.SRGBColorSpace;
      tx.anisotropy = 4;
      return tx;
    }
    var r = G.mulberry32(seed || 5150);
    // Segmented architectural station hull cladding with recessed bays & sunlit ceramic panels
    var hull = makeTex(512, 256, function (g, w, h) {
      g.fillStyle = '#aeb8cc';
      g.fillRect(0, 0, w, h);
      for (var y = 0; y < h; y += 32) {
        for (var x = 0; x < w; x += 64) {
          var v = Math.round(146 + r() * 62);
          g.fillStyle = 'rgb(' + Math.round(v * 0.94) + ',' + Math.round(v * 0.98) + ',' + Math.min(255, Math.round(v * 1.07)) + ')';
          g.fillRect(x + 2, y + 2, 60, 28);
          g.strokeStyle = 'rgba(18, 22, 34, 0.85)';
          g.lineWidth = 2;
          g.strokeRect(x + 1, y + 1, 62, 30);
          g.strokeStyle = 'rgba(235, 244, 255, 0.35)';
          g.lineWidth = 1;
          g.strokeRect(x + 4, y + 4, 56, 24);
          if (r() < 0.35) {
            g.fillStyle = 'rgba(26, 30, 44, 0.78)';
            g.fillRect(x + 10, y + 9, 44, 12);
          }
        }
      }
    }, true);
    hull.repeat.set(3, 1);

    // Panoramic illuminated habitat window ribbon (warm white + cyan concourse bays)
    var win = makeTex(512, 128, function (g, w, h) {
      g.fillStyle = '#0c0f1b';
      g.fillRect(0, 0, w, h);
      for (var b = 0; b < 16; b++) {
        var bx = b * 32;
        g.fillStyle = '#1d2236';
        g.fillRect(bx + 2, 14, 28, h - 28);
        for (var row = 0; row < 3; row++) {
          var ry = 24 + row * 30;
          if (r() > 0.14) {
            g.fillStyle = r() < 0.65 ? '#ffe7b8' : r() < 0.88 ? '#d6f4ff' : '#6af2ff';
            g.fillRect(bx + 5, ry, 22, 16);
            g.fillStyle = 'rgba(20, 24, 38, 0.7)';
            g.fillRect(bx + 15, ry, 2, 16);
          }
        }
      }
    }, true);
    win.repeat.set(4, 1);

    // Gridded orange-crimson thermal radiator panels
    var rad = makeTex(256, 256, function (g, w, h) {
      var gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0.0, '#ff7838');
      gr.addColorStop(0.45, '#b82c1c');
      gr.addColorStop(1.0, '#3a0d12');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(20, 8, 12, 0.75)';
      g.lineWidth = 3;
      for (var gx = 16; gx < w; gx += 16) { g.beginPath(); g.moveTo(gx, 0); g.lineTo(gx, h); g.stroke(); }
      for (var gy = 24; gy < h; gy += 24) { g.beginPath(); g.moveTo(0, gy); g.lineTo(w, gy); g.stroke(); }
    }, true);

    return { hull: hull, win: win, rad: rad };
  }

  // 3D Procedural Megastructure Station Builder (6 distinct architectures:
  // 'spindle' Cryo-Spindle, 'torus' Stanford Torus, 'oneill' Twin O'Neill Cylinders,
  // 'bishop' Open-Sky Bishop Ring, 'loom' Antimatter Loom/Harvester, 'conjoiner-nest' Asteroid Shipyard)
  function buildStationMesh(T, stationInfo) {
    var grp = new T.Group();
    grp.name = stationInfo.name;
    var seed = 0;
    for (var ch = 0; ch < (stationInfo.name || '').length; ch++) seed = (seed * 31 + stationInfo.name.charCodeAt(ch)) | 0;
    var rng = G.mulberry32(seed || 1701);
    var texs = makeStationTextures(T, seed);

    var metal = new T.MeshStandardMaterial({ color: 0xc8d2e2, map: texs.hull, metalness: 0.72, roughness: 0.34 });
    var trim = new T.MeshStandardMaterial({ color: 0xdce4f2, metalness: 0.80, roughness: 0.26 });
    var dark = new T.MeshStandardMaterial({ color: 0x1b2030, metalness: 0.78, roughness: 0.42 });
    var winMat = new T.MeshStandardMaterial({
      color: 0x1d2336, emissive: new T.Color(stationInfo.type === 'conjoiner-nest' || stationInfo.type === 'loom' ? 0x62eeff : 0xffdf9e),
      emissiveMap: texs.win, emissiveIntensity: 1.25, metalness: 0.4, roughness: 0.25
    });
    var radMat = new T.MeshStandardMaterial({
      color: 0x8a241c, map: texs.rad, emissive: new T.Color(0xc83a1c), emissiveMap: texs.rad,
      emissiveIntensity: 0.72, roughness: 0.5, metalness: 0.3, side: T.DoubleSide
    });
    var cryoMat = new T.MeshStandardMaterial({ color: 0xbce6f7, metalness: 0.22, roughness: 0.28 });
    var glowCol = stationInfo.type === 'conjoiner-nest' ? 0x4cf2ff : stationInfo.type === 'loom' ? 0x9b72ff : 0xffd88a;
    var glow = new T.MeshBasicMaterial({ color: glowCol });
    var beacon = new T.MeshBasicMaterial({ color: 0x63ff8d });
    var mats = [metal, trim, dark, winMat, radMat, cryoMat, glow, beacon];
    var stType = stationInfo.type || 'spindle';

    function addBeaconRing(r, y, count) {
      var bGeo = new T.SphereGeometry(0.11, 8, 6);
      for (var i = 0; i < count; i++) {
        var a = (i / count) * Math.PI * 2;
        var m = new T.Mesh(bGeo, i % 2 === 0 ? beacon : glow);
        m.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
        grp.add(m);
      }
    }

    if (stType === 'torus') {
      // Monumental slender Stanford Torus / Orbital Ring with segmented bays, panoramic windows & central zero-g spire
      var R = 6.2;
      var nSeg = 28;
      for (var s = 0; s < nSeg; s++) {
        var a0 = (s / nSeg) * Math.PI * 2;
        var segLen = (2 * Math.PI * R / nSeg) * 0.94;
        var mod = new T.Group();
        mod.position.set(Math.cos(a0) * R, 0, Math.sin(a0) * R);
        mod.rotation.y = -a0;
        var body = new T.Mesh(new T.BoxGeometry(0.56, 0.44, segLen), s % 4 === 0 ? trim : metal);
        mod.add(body);
        // Panoramic interior + side observation window bands
        var wIn = new T.Mesh(new T.BoxGeometry(0.06, 0.20, segLen * 0.86), winMat);
        wIn.position.x = -0.27;
        mod.add(wIn);
        var wOut = new T.Mesh(new T.BoxGeometry(0.06, 0.16, segLen * 0.82), winMat);
        wOut.position.x = 0.27;
        mod.add(wOut);
        // Structural bulkhead collar flange between bays
        var flg = new T.Mesh(new T.BoxGeometry(0.66, 0.52, 0.11), dark);
        flg.position.z = segLen * 0.5;
        mod.add(flg);
        grp.add(mod);
      }
      // 6 slender tension-truss elevator spokes + counter-rotating docking spire
      for (var sp = 0; sp < 6; sp++) {
        var sa = (sp / 6) * Math.PI * 2;
        var spoke = new T.Mesh(new T.CylinderGeometry(0.065, 0.065, R * 1.94, 8), dark);
        spoke.rotation.z = Math.PI * 0.5;
        spoke.rotation.y = sa;
        if (sp < 3) grp.add(spoke);
      }
      var hub = new T.Mesh(new T.CylinderGeometry(0.72, 0.88, 2.2, 16), trim);
      grp.add(hub);
      var dockRing = new T.Mesh(new T.TorusGeometry(1.38, 0.11, 10, 32), metal);
      dockRing.rotation.x = Math.PI * 0.5;
      grp.add(dockRing);
      var spire = new T.Mesh(new T.CylinderGeometry(0.10, 0.28, 6.2, 12), dark);
      grp.add(spire);
      // Axial thermal radiator cross above/below hub
      for (var rv = 0; rv < 4; rv++) {
        var rPanel = new T.Mesh(new T.BoxGeometry(1.85, 0.04, 0.68), radMat);
        var ra = (rv / 4) * Math.PI * 2;
        rPanel.position.set(Math.cos(ra) * 1.35, rv < 2 ? 2.1 : -2.1, Math.sin(ra) * 1.35);
        rPanel.rotation.y = -ra;
        grp.add(rPanel);
      }
      addBeaconRing(R + 0.34, 0.26, 8);
    } else if (stType === 'oneill') {
      // Counter-Rotating Twin O'Neill Cylinders with longitudinal sky-strips, mirror petals & endcap truss bridge
      [-2.35, 2.35].forEach(function (zOff) {
        var cyl = new T.Mesh(new T.CylinderGeometry(1.35, 1.35, 9.6, 24), metal);
        cyl.rotation.z = Math.PI * 0.5;
        cyl.position.z = zOff;
        grp.add(cyl);
        // Endcap hemispherical domes
        [-4.8, 4.8].forEach(function (ex) {
          var cap = new T.Mesh(new T.SphereGeometry(1.34, 18, 12), trim);
          cap.scale.set(0.55, 1, 1);
          cap.position.set(ex, 0, zOff);
          grp.add(cap);
        });
        // 3 longitudinal illuminated window strips + structural ribs
        for (var ws = 0; ws < 3; ws++) {
          var wa = (ws / 3) * Math.PI * 2;
          var strip = new T.Mesh(new T.BoxGeometry(7.2, 0.10, 0.72), winMat);
          strip.position.set(0, Math.cos(wa) * 1.35, zOff + Math.sin(wa) * 1.35);
          strip.rotation.x = wa;
          grp.add(strip);
          // 45-degree deployed solar mirror petal hinged at sunlit endcap
          var mir = new T.Mesh(new T.BoxGeometry(3.4, 0.05, 0.86), trim);
          mir.position.set(-6.1, Math.cos(wa) * 2.15, zOff + Math.sin(wa) * 2.15);
          mir.rotation.x = wa;
          mir.rotation.z = -0.58;
          grp.add(mir);
        }
        [-3.2, 0, 3.2].forEach(function (rx) {
          var rib = new T.Mesh(new T.TorusGeometry(1.42, 0.08, 8, 28), dark);
          rib.rotation.y = Math.PI * 0.5;
          rib.position.set(rx, 0, zOff);
          grp.add(rib);
        });
      });
      var yoke = new T.Mesh(new T.BoxGeometry(0.65, 0.65, 6.4), dark);
      yoke.position.x = 5.55;
      grp.add(yoke);
      var dockCollar = new T.Mesh(new T.TorusGeometry(2.55, 0.16, 10, 36), trim);
      dockCollar.rotation.y = Math.PI * 0.5;
      dockCollar.position.x = 5.95;
      grp.add(dockCollar);
      [-1, 1].forEach(function (sy) {
        var rWing = new T.Mesh(new T.BoxGeometry(2.8, 1.4, 0.05), radMat);
        rWing.position.set(5.55, sy * 2.2, 0);
        grp.add(rWing);
      });
      var bTop = new T.Mesh(new T.SphereGeometry(0.18, 10, 8), beacon);
      bTop.position.set(6.5, 0, 0);
      grp.add(bTop);
    } else if (stType === 'bishop') {
      // Open-Sky Bishop Ring: wide centrifugal cylinder band with terraced interior city lights & suspended hub pylon
      var bR = 5.7, bH = 2.15;
      var outerBand = new T.Mesh(new T.CylinderGeometry(bR + 0.18, bR + 0.18, bH, 48, 1, true), metal);
      grp.add(outerBand);
      var innerBand = new T.Mesh(new T.CylinderGeometry(bR - 0.06, bR - 0.06, bH * 0.92, 48, 1, true), winMat);
      innerBand.material.side = T.DoubleSide;
      grp.add(innerBand);
      // High atmosphere-retaining rim walls top & bottom
      [-bH * 0.5, bH * 0.5].forEach(function (ry) {
        var rim = new T.Mesh(new T.TorusGeometry(bR - 0.18, 0.24, 10, 48), trim);
        rim.rotation.x = Math.PI * 0.5;
        rim.position.y = ry;
        grp.add(rim);
      });
      // Exterior structural buttress ribs + radiator fins
      for (var bi = 0; bi < 16; bi++) {
        var ba = (bi / 16) * Math.PI * 2;
        var butt = new T.Mesh(new T.BoxGeometry(0.32, bH * 1.08, 0.24), dark);
        butt.position.set(Math.cos(ba) * (bR + 0.24), 0, Math.sin(ba) * (bR + 0.24));
        butt.rotation.y = -ba;
        grp.add(butt);
        if (bi % 4 === 0) {
          var brFin = new T.Mesh(new T.BoxGeometry(1.45, 1.05, 0.05), radMat);
          brFin.position.set(Math.cos(ba) * (bR + 0.95), 0, Math.sin(ba) * (bR + 0.95));
          brFin.rotation.y = -ba;
          grp.add(brFin);
        }
      }
      // Central suspended docking pylon & tension cables
      var pylon = new T.Mesh(new T.CylinderGeometry(0.55, 0.35, 5.4, 12), trim);
      grp.add(pylon);
      for (var cb = 0; cb < 4; cb++) {
        var ca = (cb / 4) * Math.PI * 2;
        var stay = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, bR * 1.98, 6), dark);
        stay.rotation.z = Math.PI * 0.5;
        stay.rotation.y = ca;
        if (cb < 2) grp.add(stay);
      }
      addBeaconRing(bR + 0.32, bH * 0.56, 8);
    } else if (stType === 'loom') {
      // Industrial Antimatter Loom / Particle Forge & Harvester: octagonal magnetic containment torus + cryo silos
      var lR = 4.6;
      var plasmaRing = new T.Mesh(new T.TorusGeometry(lR, 0.22, 12, 48), glow);
      plasmaRing.rotation.x = Math.PI * 0.5;
      grp.add(plasmaRing);
      var track = new T.Mesh(new T.TorusGeometry(lR, 0.42, 8, 24), dark);
      track.rotation.x = Math.PI * 0.5;
      grp.add(track);
      for (var tc = 0; tc < 12; tc++) {
        var ta = (tc / 12) * Math.PI * 2;
        var coil = new T.Mesh(new T.TorusGeometry(0.76, 0.14, 8, 16), tc % 2 === 0 ? trim : metal);
        coil.position.set(Math.cos(ta) * lR, 0, Math.sin(ta) * lR);
        coil.rotation.y = -ta;
        grp.add(coil);
      }
      // Twin central injector/cryo towers + 4 spherical propellant/ice storage silos
      var core = new T.Mesh(new T.CylinderGeometry(0.78, 0.92, 9.6, 12), metal);
      grp.add(core);
      var coreWin = new T.Mesh(new T.CylinderGeometry(0.95, 0.95, 1.8, 12, 1, true), winMat);
      grp.add(coreWin);
      for (var sl = 0; sl < 4; sl++) {
        var sa2 = (sl / 4) * Math.PI * 2 + Math.PI * 0.25;
        var arm = new T.Mesh(new T.BoxGeometry(lR * 0.96, 0.26, 0.26), dark);
        arm.position.set(Math.cos(sa2) * lR * 0.48, 0, Math.sin(sa2) * lR * 0.48);
        arm.rotation.y = -sa2;
        grp.add(arm);
        var silo = new T.Mesh(new T.SphereGeometry(0.78, 14, 10), cryoMat);
        silo.position.set(Math.cos(sa2) * 2.15, sl % 2 === 0 ? 1.55 : -1.55, Math.sin(sa2) * 2.15);
        grp.add(silo);
        var lRad = new T.Mesh(new T.BoxGeometry(2.6, 1.55, 0.05), radMat);
        lRad.position.set(Math.cos(sa2) * 2.6, sl % 2 === 0 ? -3.1 : 3.1, Math.sin(sa2) * 2.6);
        lRad.rotation.y = -sa2;
        grp.add(lRad);
      }
      addBeaconRing(lR + 0.8, 0.35, 6);
    } else if (stType === 'conjoiner-nest') {
      // Sculpted hollowed asteroid shipyard with luminous recessed bay slits & twin canted gravitic truss halos
      var rockGeo = new T.IcosahedronGeometry(3.45, 2);
      var rPos = rockGeo.attributes.position;
      for (var vi = 0; vi < rPos.count; vi++) {
        var vx = rPos.getX(vi), vy = rPos.getY(vi), vz = rPos.getZ(vi);
        var n = 0.84 + 0.24 * Math.sin(vx * 1.4 + seed) * Math.cos(vy * 1.7) + 0.14 * Math.sin(vz * 2.3);
        rPos.setXYZ(vi, vx * 1.32 * n, vy * 0.94 * n, vz * 1.08 * n);
      }
      rockGeo.computeVertexNormals();
      var rockMat = new T.MeshStandardMaterial({ color: 0x262936, map: texs.hull, metalness: 0.45, roughness: 0.78 });
      mats.push(rockMat);
      grp.add(new T.Mesh(rockGeo, rockMat));

      var core = new T.Mesh(new T.IcosahedronGeometry(2.72, 1), glow);
      core.scale.set(1.26, 0.86, 1.02);
      grp.add(core);

      // Drydock canyon ribs & illuminated shipyard bay collars
      var halo1 = new T.Mesh(new T.TorusGeometry(5.6, 0.18, 10, 48), metal);
      halo1.rotation.x = 0.42;
      grp.add(halo1);
      var haloWin = new T.Mesh(new T.TorusGeometry(5.62, 0.08, 8, 48), winMat);
      haloWin.rotation.x = 0.42;
      grp.add(haloWin);
      var halo2 = new T.Mesh(new T.TorusGeometry(5.05, 0.11, 10, 48), glow);
      halo2.rotation.y = 0.72;
      halo2.rotation.x = -0.35;
      grp.add(halo2);
      for (var ns = 0; ns < 4; ns++) {
        var na = (ns / 4) * Math.PI * 2;
        var spireN = new T.Mesh(new T.CylinderGeometry(0.06, 0.22, 3.6, 8), trim);
        spireN.position.set(Math.cos(na) * 3.8, (ns % 2 ? 1.8 : -1.8), Math.sin(na) * 3.2);
        spireN.rotation.z = (ns % 2 ? -0.5 : 0.5);
        grp.add(spireN);
      }
      addBeaconRing(5.8, 0.15, 6);
    } else {
      // 'spindle': Monumental Cryo-Spindle / Tether Spire (coaxial paneled centrifuge wheels, cryo-dewar clusters & radiators)
      var spine = new T.Mesh(new T.CylinderGeometry(0.44, 0.52, 14.4, 16), dark);
      grp.add(spine);
      // 4 external longitudinal structural spine girder rails
      for (var gRail = 0; gRail < 4; gRail++) {
        var ga = (gRail / 4) * Math.PI * 2;
        var rail = new T.Mesh(new T.BoxGeometry(0.14, 13.6, 0.14), trim);
        rail.position.set(Math.cos(ga) * 0.62, 0, Math.sin(ga) * 0.62);
        grp.add(rail);
      }
      // 3 coaxial centrifuge habitat wheels with segmented paneling, panoramic window bands & radial spokes
      [-3.5, 0, 3.5].forEach(function (yOff, idx) {
        var rT = idx === 1 ? 4.35 : 2.85;
        var tube = idx === 1 ? 0.34 : 0.25;
        var ring = new T.Mesh(new T.TorusGeometry(rT, tube, 12, 44), metal);
        ring.rotation.x = Math.PI * 0.5;
        ring.position.y = yOff;
        grp.add(ring);
        var winBand = new T.Mesh(new T.CylinderGeometry(rT + tube * 0.92, rT + tube * 0.92, tube * 0.72, 44, 1, true), winMat);
        winBand.position.y = yOff;
        grp.add(winBand);
        // 4 elevator spokes linking wheel to central spine
        for (var ks = 0; ks < 2; ks++) {
          var spk = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, rT * 1.94, 8), dark);
          spk.rotation.z = Math.PI * 0.5;
          spk.rotation.y = ks * Math.PI * 0.5 + idx * 0.4;
          spk.position.y = yOff;
          grp.add(spk);
        }
      });
      // Cryo-ice spherical storage tank cluster around lower spine
      for (var ct = 0; ct < 6; ct++) {
        var ca2 = (ct / 6) * Math.PI * 2;
        var tank = new T.Mesh(new T.SphereGeometry(0.56, 12, 10), cryoMat);
        tank.position.set(Math.cos(ca2) * 1.25, -5.35, Math.sin(ca2) * 1.25);
        grp.add(tank);
      }
      // Upper perpendicular thermal radiator cross vanes
      for (var rv2 = 0; rv2 < 4; rv2++) {
        var ra2 = (rv2 / 4) * Math.PI * 2 + Math.PI * 0.25;
        var vane = new T.Mesh(new T.BoxGeometry(2.65, 1.35, 0.05), radMat);
        vane.position.set(Math.cos(ra2) * 1.95, 5.45, Math.sin(ra2) * 1.95);
        vane.rotation.y = -ra2;
        grp.add(vane);
      }
      var capTop = new T.Mesh(new T.SphereGeometry(0.42, 12, 12), beacon);
      capTop.position.y = 7.35;
      grp.add(capTop);
      var capBot = new T.Mesh(new T.CylinderGeometry(0.28, 0.72, 0.9, 12), trim);
      capBot.position.y = -7.35;
      grp.add(capBot);
      addBeaconRing(4.78, 0, 6);
    }

    var baseColors = mats.map(function (m) { return m.color ? m.color.clone() : new T.Color(1, 1, 1); });
    return {
      group: grp,
      type: stType,
      materials: mats,
      baseColors: baseColors,
      dispose: function () {
        var disposed = new Set();
        grp.traverse(function (o) {
          if (o.geometry && !disposed.has(o.geometry)) {
            disposed.add(o.geometry);
            o.geometry.dispose();
          }
        });
        mats.forEach(function (m) { m.dispose(); });
        texs.hull.dispose();
        texs.win.dispose();
        texs.rad.dispose();
      }
    };
  }

  function buildSystemDiorama(T, sharedShipAssets, Builder, sys) {
    var rootGrp = new T.Group();
    var pInfo = sys.planet;
    var R0 = (pInfo.radius || 28) * 1.18;
    var pose = sys.pose || { px: 64, py: -12, pz: -180, sx: -52, sy: 22, sz: -128 };
    var pOffX = pose.px - 60;
    var pOffY = pose.py;
    var pOffZ = pose.pz + 180;

    // 0. Real Central Host Star Sphere + Corona + Optional Binary Companion
    // Centered cleanly relative to planet origin (0,0,0) so ship can orbit & fly toward the host star
    var starGroup = new T.Group();
    var starCol = starRgbFromTemp(sys.T);
    var starRad = (sys.cls && sys.cls.indexOf('III') >= 0) ? 16.5 : (sys.T > 7000 ? 12.6 : sys.T < 3600 ? 10.4 : 9.4);
    var coronaTex = makeStarCoronaTex(T);
    var starCoreMat = new T.MeshBasicMaterial({
      color: new T.Color(starCol[0], starCol[1], starCol[2]),
      fog: false
    });
    var starMesh = new T.Mesh(new T.SphereGeometry(starRad, 32, 24), starCoreMat);
    var starPos = [
      (pose.px - 96) - pOffX,
      (pose.py + 56) - pOffY,
      (pose.pz - 115) - pOffZ
    ];
    starMesh.position.set(starPos[0], starPos[1], starPos[2]);
    starGroup.add(starMesh);

    var starHaloMat = new T.SpriteMaterial({
      map: coronaTex,
      color: new T.Color(starCol[0], starCol[1], starCol[2]),
      transparent: true,
      opacity: 0.94,
      blending: T.AdditiveBlending,
      depthWrite: false,
      fog: false
    });
    var starHalo = new T.Sprite(starHaloMat);
    starHalo.position.copy(starMesh.position);
    starHalo.scale.setScalar(starRad * 7.2);
    starGroup.add(starHalo);

    var extraMats = [starCoreMat, starHaloMat];
    var extraGeos = [starMesh.geometry];

    if (sys.binary) {
      var bCol = starRgbFromTemp(sys.binary.T);
      var bRad = 5.2 * (sys.binary.scale || 0.7);
      var bCoreMat = new T.MeshBasicMaterial({ color: new T.Color(bCol[0], bCol[1], bCol[2]), fog: false });
      var bGeo = new T.SphereGeometry(bRad, 24, 18);
      var bMesh = new T.Mesh(bGeo, bCoreMat);
      bMesh.position.set(
        starPos[0] + (sys.binary.offset ? sys.binary.offset[0] * 0.62 : -28),
        starPos[1] + (sys.binary.offset ? sys.binary.offset[1] * 0.42 : -12),
        starPos[2] - 18
      );
      starGroup.add(bMesh);
      var bHaloMat = new T.SpriteMaterial({
        map: coronaTex,
        color: new T.Color(bCol[0], bCol[1], bCol[2]),
        transparent: true,
        opacity: 0.86,
        blending: T.AdditiveBlending,
        depthWrite: false,
        fog: false
      });
      var bHalo = new T.Sprite(bHaloMat);
      bHalo.position.copy(bMesh.position);
      bHalo.scale.setScalar(bRad * 6.4);
      starGroup.add(bHalo);
      extraMats.push(bCoreMat, bHaloMat);
      extraGeos.push(bGeo);
    }
    rootGrp.add(starGroup);

    // 1. Exoplanet Centered at (0,0,0) + Volumetric Rayleigh/Mie Atmosphere + Rings/Debris Disk
    var planetTiltGroup = new T.Group();
    planetTiltGroup.position.set(0, 0, 0);
    var tilt = pInfo.tilt || [0.43, 0.18];
    planetTiltGroup.rotation.z = (tilt[0] - 0.5) * Math.PI * 1.15;
    planetTiltGroup.rotation.x = tilt[1] * 0.85;
    rootGrp.add(planetTiltGroup);

    var rStyle = pInfo.ringStyle || (pInfo.hasRings !== false ? 'saturn' : 'none');
    var hasRingDisk = pInfo.hasRings !== false && rStyle !== 'none';
    var ringInnerR = rStyle === 'debris' ? R0 * 1.48 : R0 * 1.32;
    var ringOuterR = R0 * (rStyle === 'debris' || rStyle === 'gossamer-halo' ? 3.65 : 3.12);
    var pSeedVal = sys.T + sys.name.charCodeAt(0) * 137;
    var prof = planetAtmoProfile(pInfo, pSeedVal);

    var pTex = makePlanetTexture(T, sys);
    var pMat = createPlanetSurfaceMaterial(T, R0, prof, hasRingDisk, ringInnerR, ringOuterR, rStyle, pInfo, pSeedVal);
    var planetMesh = new T.Mesh(new T.SphereGeometry(R0, 64, 48), pMat);
    planetTiltGroup.add(planetMesh);

    var atmoMat = createVolumetricAtmoMaterial(T, R0, prof, hasRingDisk, ringInnerR, ringOuterR, rStyle);
    var atmoMesh = new T.Mesh(new T.SphereGeometry(R0 * prof.ratio, 64, 48), atmoMat);
    atmoMesh.renderOrder = 2;
    planetTiltGroup.add(atmoMesh);

    var ringMesh = null;
    var ringMat = null;
    if (hasRingDisk) {
      var ringGeo = makeRadialRingGeometry(T, ringInnerR, ringOuterR, 200, 6);
      ringMat = createSaturnianRingMaterial(T, pInfo.ringPalette, R0, rStyle, prof.betaR);
      ringMesh = new T.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI * 0.5;
      ringMesh.renderOrder = 1;
      planetTiltGroup.add(ringMesh);
    }

    // 2. Companion Exoplanets / Moons Orbiting Planet Origin (0,0,0)
    var moonGroup = new T.Group();
    if (Array.isArray(sys.moons) && sys.moons.length) {
      sys.moons.forEach(function (mn, mIdx) {
        var mGeo = new T.SphereGeometry(mn.r || 2.0, 48, 32);
        var mMat = createCelestialBodyMaterial(T, {
          name: mn.name || (sys.name + '-moon-' + mIdx),
          isMoon: true,
          col: mn.col || 0xc8d2e0,
          seed: pSeedVal + (mIdx + 1) * 313
        });
        var mMesh = new T.Mesh(mGeo, mMat);
        var dM = Math.max(mn.dist || (R0 * 2.1), hasRingDisk ? ringOuterR + 12 : R0 * 2.0);
        var aM = mn.angle || 0.7;
        mMesh.position.set(
          -Math.cos(aM) * dM,
          mn.y || 0,
          Math.sin(aM) * dM
        );
        moonGroup.add(mMesh);
        extraGeos.push(mGeo);
        extraMats.push(mMat);
      });
    }
    rootGrp.add(moonGroup);

    // 3. Orbital Station in Ring-Clear Circular Orbit Around Planet (0,0,0) - only when inhabited
    var stationOrbitPivot = new T.Group();
    stationOrbitPivot.rotation.x = 0.14 * ((tilt[0] || 0.4) - 0.35);
    stationOrbitPivot.rotation.z = -0.18;
    rootGrp.add(stationOrbitPivot);

    var minStationR = hasRingDisk ? (ringOuterR + 18) : (R0 * 2.85 + 16);
    var sxRel = pose.sx - pOffX;
    var szRel = (pose.sz + 180) - pOffZ;
    var baseHorizR = Math.hypot(sxRel, szRel);
    var stationOrbitR = Math.max(minStationR, Math.min(138, baseHorizR * 1.18));
    var stAngle = Math.atan2(szRel, sxRel);

    var stationObj = null;
    if (sys.station) {
      stationObj = buildStationMesh(T, sys.station);
      stationObj.group.position.set(Math.cos(stAngle) * stationOrbitR, 0, Math.sin(stAngle) * stationOrbitR);
      stationObj.group.scale.setScalar(1.32);
      stationOrbitPivot.add(stationObj.group);

      // Subtle orbital track halo showing station's flight path around the world
      var orbitTrackGeo = new T.RingGeometry(stationOrbitR - 0.18, stationOrbitR + 0.18, 128);
      orbitTrackGeo.rotateX(Math.PI * 0.5);
      var orbitTrackMat = new T.MeshBasicMaterial({
        color: 0x7a68d8,
        transparent: true,
        opacity: 0.16,
        side: T.DoubleSide,
        depthWrite: false,
        fog: false
      });
      var orbitTrack = new T.Mesh(orbitTrackGeo, orbitTrackMat);
      stationOrbitPivot.add(orbitTrack);
      extraGeos.push(orbitTrackGeo);
      extraMats.push(orbitTrackMat);
    }

    // 4. Local Patrolling NPC Procedural Lighthugger in Orbit Around the Planet (inhabited only)
    var npcSeed = sys.T * 17 + sys.id.charCodeAt(0) * 313;
    var npcGenome = sys.station ? G.randomGenome(npcSeed) : null;
    var npcVessel = null;
    var npcOrbitPivot = new T.Group();
    npcOrbitPivot.rotation.x = stationOrbitPivot.rotation.x + 0.08;
    npcOrbitPivot.rotation.z = stationOrbitPivot.rotation.z + 0.12;
    rootGrp.add(npcOrbitPivot);
    if (sys.station && Builder && sharedShipAssets) {
      npcVessel = Builder.buildVessel(T, sharedShipAssets, npcGenome, { hideIce: false });
      var npcR = stationOrbitR + 18;
      var npcAng = stAngle + 0.24;
      npcVessel.group.scale.setScalar(0.30);
      npcVessel.group.position.set(Math.cos(npcAng) * npcR, 4.5, Math.sin(npcAng) * npcR);
      npcVessel.group.rotation.y = -npcAng - Math.PI * 0.5;
      npcVessel.setPlumeIntensity(0.24);
      npcOrbitPivot.add(npcVessel.group);
    }

    var starLightVec = new T.Vector3(starPos[0], starPos[1], starPos[2]).normalize();
    var initialBerthPos = [-22 - pOffX, 14 - pOffY, 180 - pOffZ];

    return {
      group: rootGrp,
      starGroup: starGroup,
      moonGroup: moonGroup,
      planetGroup: planetTiltGroup,
      atmoMesh: atmoMesh,
      planetRadiusKm: sys.planet.radiusKm,
      starRadiusKm: sys.starRadiusKm,
      stationOrbitPivot: stationOrbitPivot,
      stationOrbitR: stationOrbitR,
      npcOrbitPivot: npcOrbitPivot,
      orbitTrackMat: orbitTrackMat || null,
      planetRadius: R0,
      ringOuterR: hasRingDisk ? ringOuterR : R0,
      starRadius: starRad,
      starPos: new T.Vector3(starPos[0], starPos[1], starPos[2]),
      initialBerthPos: initialBerthPos,
      starLightDir: starLightVec,
      planetMesh: planetMesh,
      planetTex: pTex,
      planetMat: pMat,
      atmoMat: atmoMat,
      ringMesh: ringMesh,
      ringMat: ringMat,
      station: stationObj,
      npcVessel: npcVessel,
      npcGenome: npcGenome,
      dispose: function () {
        planetMesh.geometry.dispose();
        pMat.dispose();
        pTex.dispose();
        atmoMesh.geometry.dispose();
        atmoMat.dispose();
        coronaTex.dispose();
        extraGeos.forEach(function (gg) { gg.dispose(); });
        extraMats.forEach(function (mm) { mm.dispose(); });
        if (ringMesh) {
          ringMesh.geometry.dispose();
          ringMat.dispose();
        }
        if (stationObj) stationObj.dispose();
        if (npcVessel) npcVessel.dispose();
      }
    };
  }

  var api = {
    KAPPA_PER_G: KAPPA_PER_G,
    SYSTEMS: SYSTEMS,
    FRONTIER_SYSTEMS: FRONTIER_SYSTEMS,
    get DYNAMIC_SYSTEMS() { return Array.from(DYNAMIC_SYSTEMS.values()); },
    ALL_SYSTEMS: ALL_SYSTEMS,
    FRONTIER_REVEAL_SOL_LY: FRONTIER_REVEAL_SOL_LY,
    FRONTIER_FOG_LY: FRONTIER_FOG_LY,
    FRONTIER_SCAN_RADIUS_LY: FRONTIER_SCAN_RADIUS_LY,
    SENSOR_HORIZON_LY: SENSOR_HORIZON_LY,
    SECTOR_CELL_LY: SECTOR_CELL_LY,
    MILKY_WAY: MILKY_WAY,
    getMilkyWayInfo: getMilkyWayInfo,
    ensureSectorsNear: ensureSectorsNear,
    getSystem: getSystem,
    isSystemDiscovered: isSystemDiscovered,
    getVisibleSystems: getVisibleSystems,
    getBodyWorldState: getBodyWorldState,
    getSystemTargetOrbits: getSystemTargetOrbits,
    distanceBetween: distanceBetween,
    isBodyIcy: isBodyIcy,
    getSystemIceDeposits: getSystemIceDeposits,
    getIceDepositWorldState: getIceDepositWorldState,
    findNearestIceDeposit: findNearestIceDeposit,
    findBestIceHarvestSite: findBestIceHarvestSite,
    planMultiHopRoute: planMultiHopRoute,
    planBrachistochrone: planBrachistochrone,
    stoppingDistanceLy: stoppingDistanceLy,
    stepConstantAccel: stepConstantAccel,
    generateChartersForSystem: generateChartersForSystem,
    pickEpochVignette: pickEpochVignette,
    generateCaptainEncounter: generateCaptainEncounter,
    starRgbFromTemp: starRgbFromTemp,
    makeBodyGeometry, createTerminatorAtmoMaterial, createVolumetricAtmoMaterial, bodyAtmoProfile, createAuroraRig, createCometRig,
    makeRadialRingGeometry, createSaturnianRingMaterial, emissionMaterial,
    gasGiantPalette: gasGiantPalette,
    createCelestialBodyMaterial: createCelestialBodyMaterial,
    buildSystemDiorama: buildSystemDiorama
  };

  root.LighthuggerGalaxy = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
