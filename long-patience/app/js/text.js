/* Dead Reckoning: explanations for students. One source for the on-screen
 * text and for the terminal commands about, explain and glossary. Keep every
 * entry short: a station's notes should take under a minute to read. */
(function (root, factory) {
  var DR = root.DR || (root.DR = {});
  var api = factory();
  DR.text = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var intro = {
    title: "What this lab is",
    paragraphs: [
      "Your ship's navigation computer has failed, and nobody aboard knows the ship's speed. Measure it two independent ways, check that the results agree, then use the speed to dock a cargo pod.",
      "Speed is written as β, the ship's speed as a fraction of the speed of light, c. Your team's β is hidden and lies between 0.60 and 0.95."
    ],
    simulated: [
      "The software plays the ship's instruments and sky. It produces the readings those instruments would record, using special relativity, with random noise added.",
      "The stars are a made-up sky. The hydrogen lines and their wavelengths are real.",
      "Muons start at rest in the beacon's frame, nothing in the channel absorbs them, and the ship coasts at constant speed."
    ]
  };

  var stations = {
    muon: {
      title: "Station 1 · Muon channel",
      question: "Find β from how far muons travel before they decay.",
      physics: [
        "A muon at rest lives τ = 2.197 µs. Moving fast, it lives longer in the ship's frame, so its decay length is βγcτ, with γ = 1/√(1 − β²)."
      ],
      steps: [
        "Calibrate the timing: record stopped muons and fit the lifetime. Expect about 2.197 µs.",
        "Calibrate counter 2 against counter 1 with a co-located run.",
        "Count at all five counters, then fit ln(counts) against distance. The slope gives the decay length."
      ],
      done: "You have β from the decay length, with an uncertainty."
    },
    spectro: {
      title: "Station 2 · Spectrograph",
      question: "Find β from the same hydrogen line seen ahead of the ship and behind it.",
      physics: [
        "Light from ahead is shifted toward blue, and light from behind toward red. The ratio of the two wavelengths depends only on β."
      ],
      steps: [
        "Calibrate with the hydrogen lamp. Try a linear fit, then a quadratic one, and check the residuals.",
        "Record one B star (ahead) and one S star (behind).",
        "Compare the same lines in both spectra."
      ],
      done: "Several lines give the same β."
    },
    dock: {
      title: "Station 3 · Pod launch",
      question: "Launch a pod so that it matches the platform's speed.",
      physics: [
        "Speeds do not add the simple way. Use the relativistic rule for combining velocities from your notes."
      ],
      steps: [
        "Use your best β.",
        "Work out the launch speed that gives the platform's speed in the rest frame.",
        "Launch, then read the gauge."
      ],
      done: "The gauge shows DOCKED."
    }
  };

  var figures = {
    sky: {
      title: "The sky from the ship",
      body: [
        "The dashed ring is 45° from straight ahead. A moving ship sees far more stars inside it than a ship at rest."
      ]
    },
    lifetime: {
      title: "Stopped-muon decay times",
      body: [
        "A straight line on this log plot means steady decay. The lifetime follows from its slope; expect about 2.197 µs."
      ]
    },
    counts: {
      title: "Muons at each counter",
      body: [
        "Counts, corrected for counter efficiency. The slope of the line gives the decay length."
      ]
    },
    channel: {
      title: "The muon channel",
      body: [
        "Muons enter at the ice prow and travel aft past five counters, 250 m apart."
      ]
    },
    lamp: {
      title: "Hydrogen lamp spectrum",
      body: [
        "The horizontal axis is detector pixel, not wavelength. Match the numbered peaks to hydrogen lines."
      ]
    },
    star: {
      title: "Starlight spectrum",
      body: [
        "The horizontal axis is pixel number. Dark dips are hydrogen lines; wavelengths appear after calibration."
      ]
    },
    calibration: {
      title: "Calibration fit",
      body: [
        "Each residual is how far a line misses the fitted map, in pixels. Small residuals with no pattern mean a good fit."
      ]
    },
    gauge: {
      title: "Docking gauge",
      body: [
        "The pod docks if its marker falls inside the shaded band, which is the thruster limit."
      ]
    }
  };

  var glossary = [
    { term: "c", def: "The speed of light in vacuum, 299 792 458 m/s." },
    { term: "β (beta)", def: "An object's speed divided by c. Your ship's β is hidden and lies between 0.60 and 0.95." },
    { term: "γ (gamma)", def: "1 divided by the square root of (1 − β²). It measures time dilation: moving clocks run slow by a factor γ." },
    { term: "Rest frame", def: "The frame of the navigation beacon, which is at rest in the surrounding interstellar medium. The platform's speed is given in this frame." },
    { term: "Proper lifetime τ", def: "The average lifetime of a muon in its own rest frame: 2.197 µs." },
    { term: "Decay length", def: "The average distance a muon travels, in the frame where it is measured, before it decays." },
    { term: "Counter efficiency", def: "The fraction of muons reaching a counter that it records. Counter 1 is the reference." },
    { term: "Calibration", def: "Finding the mapping from raw readings (decay times, pixel numbers) to physical quantities, using known references." },
    { term: "Residual", def: "The difference between a measured value and the fitted value. A pattern in the residuals shows a poor fit." },
    { term: "ln (natural logarithm)", def: "On a plot of ln(counts) against distance, a straight line means exponential decay." },
    { term: "Aberration", def: "The apparent shift of stars toward the direction of motion. A moving observer sees more stars ahead of the ship than behind it." },
    { term: "Doppler shift", def: "A change in the wavelength of light caused by motion. Sources ahead of the ship are shifted toward blue; sources behind it, toward red." },
    { term: "Thruster limit", def: "The largest speed mismatch with the platform that a pod can absorb and still dock." }
  ];

  function bullets(items) { return items.map(function (t) { return "  - " + t; }); }
  function numbered(items) { return items.map(function (t, i) { return "  " + (i + 1) + ". " + t; }); }

  function topicNames() {
    return ["about"].concat(Object.keys(stations), Object.keys(figures), ["glossary"])
      .map(function (k) { return k.toLowerCase(); });
  }

  function aboutLines() {
    var order = ["muon", "spectro", "dock"];
    return [intro.title, ""].concat(intro.paragraphs, [
      "", "The three stations:"], order.map(function (k) { return "  - " + stations[k].title + ": " + stations[k].question; }), [
      "", "What the software simulates:"], bullets(intro.simulated), [
      "", "Type explain <topic> for a station or a figure (explain alone lists the topics), or glossary for terms."]);
  }

  function stationLines(s) {
    return [s.title, s.question, "", "Physics:"].concat(bullets(s.physics), [
      "", "Steps:"], numbered(s.steps), [
      "", "Done when: " + s.done]);
  }

  function figureLines(f) { return [f.title].concat(f.body); }

  function glossaryLines() { return glossary.map(function (g) { return g.term + ": " + g.def; }); }

  // Returns { ok, lines } for a topic. Topic names are case-insensitive.
  function explain(topic) {
    var t = String(topic || "").toLowerCase();
    if (!t) return { ok: true, lines: ["Topics: " + topicNames().join(", ") + "."] };
    if (t === "about") return { ok: true, lines: aboutLines() };
    if (t === "glossary") return { ok: true, lines: glossaryLines() };
    var key = Object.keys(stations).concat(Object.keys(figures)).filter(function (k) { return k.toLowerCase() === t; })[0];
    if (!key) return { ok: false, lines: ["No topic called '" + topic + "'. Topics: " + topicNames().join(", ") + "."] };
    return { ok: true, lines: stations[key] ? stationLines(stations[key]) : figureLines(figures[key]) };
  }

  // Commands that work with or without a mission loaded. Returns null for others.
  function command(text) {
    var tok = String(text || "").trim().split(/\s+/), cmd = (tok[0] || "").toLowerCase();
    if (cmd === "about") return { ok: true, lines: aboutLines() };
    if (cmd === "glossary") return { ok: true, lines: glossaryLines() };
    if (cmd === "explain") return explain(tok[1]);
    return null;
  }

  return {
    intro: intro, stations: stations, figures: figures, glossary: glossary,
    topicNames: topicNames, aboutLines: aboutLines, glossaryLines: glossaryLines,
    explain: explain, command: command
  };
});
