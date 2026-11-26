/* Dead Reckoning: the numbers behind the explore pictures. Plain functions built on
 * physics.js and hydrogen.js, tested in Node. The pictures themselves are drawn by
 * explore3d.js with gl3d.js. */
(function (root, factory) {
  var DR = root.DR || (root.DR = {});
  var api = factory(DR.physics || require("./physics.js"), DR.hydrogen || require("./hydrogen.js"));
  DR.explore = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (P, H) {
  "use strict";

  var CHANNEL_M = 1200;
  var COUNTERS_M = [0, 250, 500, 750, 1000];

  // Seen from the station, a moving clock runs slow and a moving ruler is short, both by 1/gamma.
  function clockRate(beta) { return 1 / P.gamma(beta); }
  function lengthRatio(beta) { return 1 / P.gamma(beta); }

  // Observed wavelength (nm) of a line of rest wavelength restNm, seen from straight
  // ahead (dir = 1) or straight behind (dir = -1).
  function observedNm(restNm, beta, dir) {
    return restNm * (dir > 0 ? P.dopplerBow(beta) : P.dopplerStern(beta));
  }

  // Average distance (m) a muon travels in the ship's frame before it decays.
  function decayLengthM(beta) { return P.betaGamma(beta) * P.MUON_CTAU; }

  // Fraction of muons still alive after xM metres.
  function surviveFraction(xM, beta) { return Math.exp(-xM / decayLengthM(beta)); }

  // Decay distance (m) for a random number u in (0, 1].
  function decayDistanceM(beta, u) { return -decayLengthM(beta) * Math.log(u); }

  // For each counter position, how many of the muons (given by their decay distances) reach it.
  function countPassed(decayDistances, counters) {
    return counters.map(function (x) {
      var n = 0;
      for (var i = 0; i < decayDistances.length; i++) if (decayDistances[i] >= x) n++;
      return n;
    });
  }

  // Relativistic speed of a pod moving at u relative to a ship moving at beta.
  function combinedSpeed(beta, u) { return P.addVelocities(beta, u); }
  // What adding the two speeds the simple way gives (it can pass c).
  function simpleSum(beta, u) { return beta + u; }

  // Observed wavelength of every hydrogen line, seen ahead and behind.
  function spectrumRows(beta) {
    return H.LINES.map(function (L) {
      return { id: L.id, restNm: L.nm, ahead: observedNm(L.nm, beta, 1), behind: observedNm(L.nm, beta, -1) };
    });
  }

  return {
    CHANNEL_M: CHANNEL_M, COUNTERS_M: COUNTERS_M,
    clockRate: clockRate, lengthRatio: lengthRatio, observedNm: observedNm,
    decayLengthM: decayLengthM, surviveFraction: surviveFraction, decayDistanceM: decayDistanceM,
    countPassed: countPassed, combinedSpeed: combinedSpeed, simpleSum: simpleSum,
    spectrumRows: spectrumRows
  };
});
