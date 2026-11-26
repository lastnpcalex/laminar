/* Dead Reckoning: special-relativity formulas (units of c unless noted).
 * Pure functions, no DOM. Loaded as a classic script (sets DR.physics)
 * or with require() in Node tests. */
(function (root, factory) {
  var DR = root.DR || (root.DR = {});
  var api = factory();
  DR.physics = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var C = 299792458;                 // m/s, exact (SI)
  var MUON_TAU = 2.1969811e-6;       // s, PDG
  var MUON_CTAU = C * MUON_TAU;      // m

  function checkSpeed(b, name) {
    if (typeof b !== "number" || !isFinite(b) || !(Math.abs(b) < 1)) {
      throw new RangeError((name || "speed") + " must be a number with |v| < c");
    }
  }

  function rapidity(b) { checkSpeed(b); return Math.atanh(b); }
  function speedFromRapidity(eta) { return Math.tanh(eta); }

  // gamma = 1/sqrt(1-b^2), written to avoid forming 1-b^2 directly.
  function gamma(b) { checkSpeed(b); return 1 / Math.sqrt((1 - b) * (1 + b)); }
  function betaGamma(b) { return b * gamma(b); }
  // gamma - 1 without cancellation at small speeds: 2 sinh^2(eta/2).
  function gammaMinusOne(b) { var s = Math.sinh(rapidity(b) / 2); return 2 * s * s; }
  function betaFromBetaGamma(x) { return x / Math.sqrt(1 + x * x); }

  // Velocity of an object moving at u in frame S', where S' moves at v relative to S.
  function addVelocities(u, v) { checkSpeed(u, "u"); checkSpeed(v, "v"); return (u + v) / (1 + u * v); }
  // Velocity of u as measured in a frame moving at w (all relative to the same frame).
  function relativeVelocity(u, w) { checkSpeed(u, "u"); checkSpeed(w, "w"); return (u - w) / (1 - u * w); }
  // Launch speed (ship frame) that gives speed w in the rest frame when the ship moves at b.
  function launchVelocity(w, b) { return relativeVelocity(w, b); }

  // Wavelength factor lambda_obs / lambda_emit for an observer moving at b through the
  // rest frame of the source. theta is the angle from the observer's velocity to the
  // direction toward the source.
  function dopplerFromObservedAngle(b, cosObs) { return gamma(b) * (1 - b * cosObs); }
  function dopplerFromRestAngle(b, cosRest) { return 1 / (gamma(b) * (1 + b * cosRest)); }
  function dopplerBow(b) { checkSpeed(b); return Math.sqrt((1 - b) / (1 + b)); }
  function dopplerStern(b) { checkSpeed(b); return Math.sqrt((1 + b) / (1 - b)); }
  function betaFromSternBowRatio(r) {
    if (!(r > 0)) throw new RangeError("ratio must be positive");
    return (r - 1) / (r + 1);
  }

  // Aberration: direction toward a source, rest frame -> observer frame and back.
  function aberrate(b, cosRest) { checkSpeed(b); return (cosRest + b) / (1 + b * cosRest); }
  function deaberrate(b, cosObs) { checkSpeed(b); return (cosObs - b) / (1 - b * cosObs); }

  // Fraction of stars seen within angle angleDeg of the direction of travel (side = +1)
  // or of the direction behind the ship (side = -1). Stars are spread evenly in
  // cos(angle) in the rest frame, so the observed fraction follows from aberration.
  function fractionWithin(b, angleDeg, side) {
    var c = side * Math.cos(angleDeg * Math.PI / 180);
    var k = deaberrate(b, c);
    return side > 0 ? (1 - k) / 2 : (1 + k) / 2;
  }

  // Frequency factor (observed / emitted) for a star at rest-frame cosine cosRest, seen by a
  // ship at b. Above 1 means bluer and brighter; below 1 means redder and dimmer.
  function frequencyFactor(b, cosRest) { return gamma(b) * (1 + b * cosRest); }

  // Fraction of particles at rest in the rest frame that survive a path of proper
  // length L (ship frame) while moving at b relative to the ship.
  function survival(L, b, ctau) {
    return Math.exp(-L / (Math.abs(betaGamma(b)) * (ctau || MUON_CTAU)));
  }

  function properTime(dt, b) { return dt / gamma(b); }

  return {
    C: C, MUON_TAU: MUON_TAU, MUON_CTAU: MUON_CTAU,
    rapidity: rapidity, speedFromRapidity: speedFromRapidity,
    gamma: gamma, betaGamma: betaGamma, gammaMinusOne: gammaMinusOne,
    betaFromBetaGamma: betaFromBetaGamma,
    addVelocities: addVelocities, relativeVelocity: relativeVelocity,
    launchVelocity: launchVelocity,
    dopplerFromObservedAngle: dopplerFromObservedAngle,
    dopplerFromRestAngle: dopplerFromRestAngle,
    dopplerBow: dopplerBow, dopplerStern: dopplerStern,
    betaFromSternBowRatio: betaFromSternBowRatio,
    aberrate: aberrate, deaberrate: deaberrate,
    fractionWithin: fractionWithin, frequencyFactor: frequencyFactor,
    survival: survival, properTime: properTime
  };
});
