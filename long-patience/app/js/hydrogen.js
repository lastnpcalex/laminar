/* Dead Reckoning: hydrogen line list (vacuum wavelengths).
 * Computed from the Rydberg formula with the reduced-mass correction, using
 * CODATA 2018 constants. Fine structure (about 0.002% at H-alpha) is ignored;
 * this is far below the spectrograph's resolution. */
(function (root, factory) {
  var DR = root.DR || (root.DR = {});
  var api = factory();
  DR.hydrogen = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var R_INF = 10973731.568160;     // 1/m, CODATA 2018
  var ME_OVER_MP = 5.44617021487e-4; // CODATA 2018
  var R_H = R_INF / (1 + ME_OVER_MP);

  var SERIES = [
    { id: "Ly", name: "Lyman",   lower: 1, upper: [2, 3, 4, 5, 6], depth: 0.85 },
    { id: "H",  name: "Balmer",  lower: 2, upper: [3, 4, 5, 6, 7, 8], depth: 0.6 },
    { id: "Pa", name: "Paschen", lower: 3, upper: [4, 5, 6, 7, 8], depth: 0.45 },
    { id: "Br", name: "Brackett", lower: 4, upper: [5, 6, 7, 8, 9], depth: 0.35 },
    { id: "Pf", name: "Pfund",   lower: 5, upper: [6, 7, 8], depth: 0.3 }
  ];
  var GREEK = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"];

  function wavelengthNm(lower, upper) {
    return 1e9 / (R_H * (1 / (lower * lower) - 1 / (upper * upper)));
  }

  var LINES = [];
  SERIES.forEach(function (s) {
    s.upper.forEach(function (u, k) {
      LINES.push({
        id: s.id + "-" + GREEK[k],
        series: s.name,
        lower: s.lower, upper: u,
        nm: wavelengthNm(s.lower, u),
        depth: s.depth * Math.pow(0.72, k),   // weaker toward the series limit
        strength: Math.pow(0.6, k)            // lamp emission strength
      });
    });
  });

  function find(id) {
    var key = String(id).toLowerCase();
    for (var i = 0; i < LINES.length; i++) if (LINES[i].id.toLowerCase() === key) return LINES[i];
    return null;
  }

  return { R_H: R_H, LINES: LINES, SERIES: SERIES, wavelengthNm: wavelengthNm, find: find };
});
