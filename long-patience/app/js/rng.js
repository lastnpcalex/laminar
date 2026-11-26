/* Dead Reckoning: deterministic random numbers and team codes.
 * Every random draw comes from (seed, stream, index), so a team code plus the
 * action log reproduces a team's data exactly. */
(function (root, factory) {
  var DR = root.DR || (root.DR = {});
  var api = factory();
  DR.rng = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var CODE_VERSION = 1;
  var ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32

  function fmix32(h) {
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16; return h >>> 0;
  }

  function hashString(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }

  function rotl(x, k) { return ((x << k) | (x >>> (32 - k))) >>> 0; }

  // xoshiro128** generator seeded from (seed, stream name, index).
  function makeRng(seed, stream, index) {
    var st = hashString(String(stream));
    var s = [0, 0, 0, 0];
    for (var i = 0; i < 4; i++) {
      s[i] = fmix32((seed >>> 0) ^ fmix32(st + Math.imul(i + 1, 0x9e3779b9)) ^
                    fmix32(((index | 0) + Math.imul(i + 7, 0x632be5ab)) >>> 0));
    }
    if ((s[0] | s[1] | s[2] | s[3]) === 0) s[0] = 1;

    function nextU32() {
      var result = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
      var t = (s[1] << 9) >>> 0;
      s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3];
      s[2] ^= t; s[3] = rotl(s[3], 11);
      for (var j = 0; j < 4; j++) s[j] >>>= 0;
      return result;
    }
    // Uniform on the open interval (0, 1), 53-bit resolution.
    function uniform() {
      var a = nextU32() >>> 5, b = nextU32() >>> 6;
      return (a * 67108864 + b + 0.5) / 9007199254740992;
    }
    function range(lo, hi) { return lo + (hi - lo) * uniform(); }
    var spare = null;
    function normal() {
      if (spare !== null) { var v = spare; spare = null; return v; }
      var u1 = uniform(), u2 = uniform();
      var r = Math.sqrt(-2 * Math.log(u1));
      spare = r * Math.sin(2 * Math.PI * u2);
      return r * Math.cos(2 * Math.PI * u2);
    }
    function exponential(mean) { return -mean * Math.log(uniform()); }
    // Poisson: exact (Knuth) for small means, normal approximation for mean >= 30.
    function poisson(mean) {
      if (!(mean >= 0)) throw new RangeError("Poisson mean must be >= 0");
      if (mean < 30) {
        var L = Math.exp(-mean), k = 0, p = 1;
        do { k++; p *= uniform(); } while (p > L);
        return k - 1;
      }
      return Math.max(0, Math.round(mean + Math.sqrt(mean) * normal()));
    }
    return { nextU32: nextU32, uniform: uniform, range: range, normal: normal,
             exponential: exponential, poisson: poisson };
  }

  function checksum(chars) {
    var sum = 0;
    for (var i = 0; i < chars.length; i++) sum += (i + 1) * ALPHABET.indexOf(chars[i]);
    return ALPHABET[sum % 32];
  }

  // Team code: 6 data characters (2-bit version + 28-bit seed) + 1 check character.
  function encodeCode(seed) {
    var v = (CODE_VERSION * 268435456 + ((seed >>> 0) % 268435456));
    var chars = "";
    for (var i = 0; i < 6; i++) { chars = ALPHABET[v % 32] + chars; v = Math.floor(v / 32); }
    chars += checksum(chars);
    return chars.slice(0, 3) + "-" + chars.slice(3);
  }

  function normalizeCode(text) {
    return String(text || "").toUpperCase().replace(/[\s-]/g, "")
      .replace(/O/g, "0").replace(/[IL]/g, "1").replace(/U/g, "V");
  }

  // Returns { seed, version, code } or throws with a readable message.
  function decodeCode(text) {
    var s = normalizeCode(text);
    if (s.length !== 7) throw new Error("A team code has 7 characters, like K7Q-4MX9.");
    for (var i = 0; i < 7; i++) {
      if (ALPHABET.indexOf(s[i]) < 0) throw new Error("The team code contains an unknown character: " + s[i]);
    }
    if (checksum(s.slice(0, 6)) !== s[6]) throw new Error("That team code has a typo (check character does not match).");
    var v = 0;
    for (var j = 0; j < 6; j++) v = v * 32 + ALPHABET.indexOf(s[j]);
    var version = Math.floor(v / 268435456), seed = v % 268435456;
    if (version !== CODE_VERSION) throw new Error("This team code is for lab version " + version + "; this is version " + CODE_VERSION + ".");
    return { seed: seed, version: version, code: s.slice(0, 3) + "-" + s.slice(3) };
  }

  function randomCode() {
    var seed;
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      seed = crypto.getRandomValues(new Uint32Array(1))[0] % 268435456;
    } else {
      seed = Math.floor(Math.random() * 268435456);
    }
    return encodeCode(seed);
  }

  return { makeRng: makeRng, encodeCode: encodeCode, decodeCode: decodeCode,
           randomCode: randomCode, CODE_VERSION: CODE_VERSION };
});
