/* Dead Reckoning: page wiring. Panel controls and the terminal both send text
 * commands to the lab; this file renders the results and the explanations. */
(function () {
  "use strict";
  var DR = window.DR, Lab = DR.lab.Lab, H = DR.hydrogen, P = DR.physics, plots = DR.plots, T = DR.text;
  var $ = function (id) { return document.getElementById(id); };
  var STORE = "dr1:";
  var PM = "±", MINUS = "−", DEG = "°", TAU = "τ", MU = "µ", DASH = "—";
  // Signed value with four decimals. Values too small to show read as zero, never as minus zero.
  function signedText(v) { return Math.abs(v) < 0.00005 ? "0.0000" : (v > 0 ? "+" : MINUS) + Math.abs(v).toFixed(4); }
  var lab = null, history = [], histPos = 0;
  var view;
  try { view = new DR.View($("view-canvas"), $("view-overlay"), $("view-summary")); }
  catch (e) {
    $("view-summary").textContent = "The sky view could not start on this computer. All instruments still work.";
    view = { setBeta: function () {}, setMode: function () {}, setEnabled: function () {} };
  }

  // ---------- storage (never fatal) ----------
  function load(key) { try { return JSON.parse(localStorage.getItem(STORE + key)); } catch (e) { return null; } }
  function save(key, val) { try { localStorage.setItem(STORE + key, JSON.stringify(val)); } catch (e) { /* storage blocked */ } }
  function drop(key) { try { localStorage.removeItem(STORE + key); } catch (e) { /* ignore */ } }

  // ---------- settings ----------
  var form = $("settings");
  function applySettings() {
    var s = {
      layout: form.layout.value, theme: form.theme.value, size: form.size.value,
      view3d: form.view3d.checked, crt: form.crt.checked
    };
    document.documentElement.setAttribute("data-theme", s.theme);
    document.documentElement.setAttribute("data-size", s.size);
    var c = $("console");
    c.className = "console layout-" + s.layout + (s.view3d ? "" : " no-view");
    document.body.classList.toggle("crt", s.crt);
    view.setEnabled(s.view3d);
    save("settings-2", s);
  }
  // Settings have their own key, so a new default is never overridden by an old saved choice.
  (function restoreSettings() {
    var s = load("settings-2");
    if (s) {
      ["layout", "theme", "size"].forEach(function (k) {
        var r = form.querySelector('input[name="' + k + '"][value="' + s[k] + '"]'); if (r) r.checked = true;
      });
      form.view3d.checked = s.view3d === true; form.crt.checked = !!s.crt;
    }
    applySettings();
  })();
  form.addEventListener("change", applySettings);

  // ---------- terminal output ----------
  var logEl = $("term-log");
  function print(command, lines, failed) {
    if (command) { var c = document.createElement("p"); c.className = "cmd"; c.textContent = command; logEl.appendChild(c); }
    var pre = document.createElement("pre");
    pre.textContent = lines.join("\n");
    if (failed) pre.className = "fail";
    logEl.appendChild(pre);
    while (logEl.childNodes.length > 600) logEl.removeChild(logEl.firstChild);
    logEl.scrollTop = logEl.scrollHeight;
  }
  var announceEl = $("announce");
  function announce(text) {
    announceEl.textContent = "";
    setTimeout(function () { announceEl.textContent = text; }, 50);
  }

  function download(name, text) {
    var blob = new Blob([text], { type: "text/csv" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  // ---------- commands ----------
  function run(text) {
    text = String(text).trim();
    if (!text) return;
    var word = text.split(/\s+/)[0].toLowerCase();
    if (word === "clear") { logEl.textContent = ""; return; }
    if (word === "load") { startLab(text.split(/\s+/)[1] || "", true); return; }
    if (!lab) {
      var info = T.command(text);   // about, explain and glossary work before a mission starts
      if (info) { print(text, info.lines, !info.ok); return; }
      if (word === "help") {
        print(text, ["Before you start, enter your team code in the panel, or type load <code>.", "Type about to read what this lab is, or glossary for terms."]);
        return;
      }
      print(text, ["No mission loaded. Enter your team code in the panel, or type load <code>."], true);
      announce("No mission loaded. Enter your team code first.");
      return;
    }
    if (word === "reset") {
      if (text.toLowerCase() !== "reset confirm") {
        print(text, ["This erases all data for team " + lab.code + " on this computer. Export first if you need it.", "Type reset confirm to erase."]);
        return;
      }
      drop("log:" + lab.code);
      var code = lab.code; lab = null;
      startLab(code, false);
      print(null, ["All data for team " + code + " erased on this computer."]);
      return;
    }
    var res = lab.exec(text);
    print(text, res.lines, !res.ok);
    var more = res.lines.length - 1;
    announce(res.lines[0] + (more > 0 ? " (" + more + " more line" + (more > 1 ? "s" : "") + " in the terminal)" : ""));
    if (res.download) download(res.download.name, res.download.text);
    if (res.station) showStation(res.station);
    if (res.flash) flashCounters();
    if (res.mutates) save("log:" + lab.code, lab.log);
    render();
  }

  $("term-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var input = $("term-input"), text = input.value;
    if (text.trim()) { history.push(text); histPos = history.length; }
    input.value = "";
    run(text);
  });
  $("term-input").addEventListener("keydown", function (e) {
    if (e.key === "ArrowUp" && histPos > 0) { histPos--; this.value = history[histPos]; e.preventDefault(); }
    else if (e.key === "ArrowDown") {
      if (histPos < history.length - 1) { histPos++; this.value = history[histPos]; } else { histPos = history.length; this.value = ""; }
      e.preventDefault();
    }
  });

  // Panel buttons: data-cmd="count {ct-time}" fills {id} from that control's value.
  function fillTemplate(t) {
    return t.replace(/\{([\w-]+)\}/g, function (_, id) {
      var el = $(id);
      if (el) return el.value;
      var r = document.querySelector('input[name="' + id + '"]:checked');
      return r ? r.value : "";
    });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-cmd]");
    if (b) { run(fillTemplate(b.getAttribute("data-cmd"))); return; }
    var s = e.target.closest("[data-station]");
    if (s) run("station " + s.getAttribute("data-station"));
  });

  $("launch-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var v = $("launch-speed").value.trim();
    run("launch " + (v || "?"));
  });

  // ---------- start / resume ----------
  function startLab(codeText, fromTerminal) {
    var err = $("code-error");
    try {
      var dec = DR.rng.decodeCode(codeText);
      var saved = load("log:" + dec.code) || [];
      lab = Lab.replay(dec.code, saved);
      save("last", dec.code);
      err.textContent = "";
      $("start").hidden = true;
      $("station-area").hidden = false;
      $("team-display").hidden = false;
      $("team-code").textContent = lab.code;
      view.setBeta(lab.hidden.beta);
      buildStatic();
      showStation(lab.station);
      render();
      var msg = "Mission loaded for team " + lab.code + "." + (saved.length ? " Restored " + saved.length + " earlier actions from this computer." : "") +
        " Start at Station 1. Type help for commands.";
      print(fromTerminal ? "load " + codeText : null, [msg]);
      announce(msg);
      if (!fromTerminal) $("h-muon").focus();
    } catch (e) {
      if (fromTerminal) { print("load " + codeText, [e.message], true); announce(e.message); }
      else { err.textContent = e.message; $("code-input").focus(); }
    }
  }

  $("start-form").addEventListener("submit", function (e) { e.preventDefault(); startLab($("code-input").value, false); });
  $("practice-code").addEventListener("click", function () { $("code-input").value = DR.rng.randomCode(); $("code-input").focus(); });
  (function offerResume() {
    var last = load("last");
    if (!last) return;
    var n = (load("log:" + last) || []).length;
    $("resume-btn").textContent = "Resume team " + last + " (" + n + " saved actions)";
    $("resume").hidden = false;
    $("resume-btn").addEventListener("click", function () { startLab(last, false); });
  })();

  ["h-muon", "h-spectro", "h-dock"].forEach(function (id) { $(id).tabIndex = -1; });

  function showStation(name) {
    ["muon", "spectro", "dock"].forEach(function (s) {
      $("st-" + s).hidden = s !== name;
      var b = document.querySelector('[data-station="' + s + '"]');
      if (s === name) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
    });
  }

  // ---------- explanations (wording lives in text.js) ----------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function listOf(tag, items) {
    var l = el(tag);
    items.forEach(function (t) { l.appendChild(el("li", null, t)); });
    return l;
  }
  function details(title, open) {
    var d = el("details", "explain");
    if (open) d.open = true;
    d.appendChild(el("summary", null, title));
    return d;
  }
  function fillStation(slot, key) {
    var s = T.stations[key], d = details("About this station", true);
    d.appendChild(el("p", "question", s.question));
    d.appendChild(el("p", "label", "Physics")); d.appendChild(listOf("ul", s.physics));
    d.appendChild(el("p", "label", "Steps")); d.appendChild(listOf("ol", s.steps));
    d.appendChild(el("p", "done", "Done when: " + s.done));
    slot.appendChild(d);
  }
  function fillText() {
    T.intro.paragraphs.forEach(function (t) { $("intro-top").appendChild(el("p", null, t)); });
    var sim = details("About the simulation", false);
    sim.appendChild(listOf("ul", T.intro.simulated));
    $("intro-more").appendChild(sim);
    document.querySelectorAll("[data-explain]").forEach(function (slot) { fillStation(slot, slot.getAttribute("data-explain")); });
    document.querySelectorAll("[data-caption]").forEach(function (node) {
      node.textContent = T.figures[node.getAttribute("data-caption")].body.join(" ");
    });
    var g = $("glossary");
    T.glossary.forEach(function (x) { g.appendChild(el("dt", null, x.term)); g.appendChild(el("dd", null, x.def)); });
  }

  // ---------- static parts ----------
  var staticBuilt = false;
  function buildStatic() {
    if (staticBuilt) return;
    staticBuilt = true;
    plots.table($("line-list"), {
      caption: "Hydrogen lines (rest, vacuum)", columns: ["line", "series", "transition", "wavelength (nm)"],
      rows: H.LINES.map(function (L) { return [L.id, L.series, "n = " + L.upper + " to " + L.lower, L.nm.toFixed(2)]; })
    });
    var sel = $("star-select");
    Lab.CFG.stars.forEach(function (s) {
      var o = document.createElement("option");
      o.value = s.id;
      o.textContent = s.id + " (" + s.deg.toFixed(1) + DEG + " from the direction of travel, " + (s.deg < 90 ? "near the bow" : "near the stern") + ")";
      sel.appendChild(o);
    });
    drawChannel();
  }

  function drawChannel(hit) {
    var svg = $("channel-diagram"), el = plots.el;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    el("rect", { x: 20, y: 25, width: 470, height: 40, rx: 8, "class": "hull" }, svg);
    el("polygon", { points: "490,15 630,45 490,75", "class": "hull" }, svg);
    el("text", { x: 545, y: 66 }, svg, "ice prow");
    el("line", { x1: 40, x2: 600, y1: 45, y2: 45, "class": "channel" }, svg);
    Lab.CFG.counters.forEach(function (x, k) {
      var px = 460 - k * 100;
      el("circle", { cx: px, cy: 45, r: 9, "class": "counter" + (hit ? " hit" : "") }, svg);
      el("text", { x: px, y: 18, "text-anchor": "middle" }, svg, "C" + (k + 1));
      el("text", { x: px, y: 84, "text-anchor": "middle" }, svg, x + " m");
    });
    el("text", { x: 630, y: 102, "text-anchor": "end" }, svg, "muons enter at the bow and travel aft");
  }

  function flashCounters() {
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    drawChannel(true);
    setTimeout(function () { drawChannel(false); }, 350);   // a single flash, never repeating
  }

  // ---------- render ----------
  function setLamp(id, state, text) { var l = $(id); l.setAttribute("data-state", state); l.textContent = text; }

  function render() {
    if (!lab) return;
    var focusId = document.activeElement && document.activeElement.id;
    var st = lab.status();

    // Station 1
    var lf = lab.lifetime.fit;
    setLamp("lamp-lifetime", st.lifetimeOk ? "on" : (lf ? "bad" : "off"), st.lifetimeOk ? "done" : (lf ? "not consistent" : "not done"));
    $("lt-readout").textContent = lab.lifetime.decays
      ? lab.lifetime.decays + " decays recorded in " + lab.lifetime.seconds + " s." +
        (lf ? "\nFit: " + TAU + " = " + lf.tau.toFixed(3) + " " + PM + " " + lf.tauErr.toFixed(3) + " " + MU + "s" : "")
      : "";
    var pts = [];
    lab.lifetime.hist.forEach(function (n, k) { if (n > 0) pts.push({ x: (k + 0.5) * Lab.CFG.histBinUs, y: Math.log(n), err: 1 / Math.sqrt(n) }); });
    plots.scatter($("lt-plot"), { points: pts, fit: lf, xLabel: "decay time (" + MU + "s)", yLabel: "ln(decays)",
      xRange: [0, Lab.CFG.histBins * Lab.CFG.histBinUs], empty: "Record decays to see the histogram" });
    plots.table($("lt-table"), lab.table("lifetime"));

    var er = lab.efficiencyRatio();
    setLamp("lamp-colocate", st.colocateOk ? "on" : "off", st.colocateOk ? "done" : "not done");
    $("co-readout").textContent = er ? "N1 = " + lab.colocate.n1 + ", N2 = " + lab.colocate.n2 + " (" + lab.colocate.seconds + " s)\nN2/N1 = " +
      er.ratio.toFixed(4) + " " + PM + " " + er.err.toFixed(4) : "";

    setLamp("lamp-channel", st.muonUnlocked ? "on" : "off", st.muonUnlocked ? "unlocked" : "locked");
    var cf = lab.counts.fit;
    $("ct-readout").textContent = (lab.counts.seconds ? "Totals over " + lab.counts.seconds + " s: " + lab.counts.n.join(", ") : "") +
      (cf ? "\nslope = " + (cf.slope * 1000).toFixed(4) + " " + PM + " " + (cf.slopeErr * 1000).toFixed(4) + " per km;  decay length = " +
        cf.decayLength.toFixed(0) + " " + PM + " " + cf.decayLengthErr.toFixed(0) + " m" : "");
    var cpts = [];
    if (lab.counts.seconds && er) {
      lab.counts.n.forEach(function (N, k) {
        if (N > 0) cpts.push({ x: Lab.CFG.counters[k], y: Math.log(N / (k === 0 ? 1 : er.ratio)), err: 1 / Math.sqrt(N) });
      });
    }
    plots.scatter($("ct-plot"), { points: cpts, fit: cf, xLabel: "counter position (m)", yLabel: "ln(N / efficiency)",
      xRange: [0, 1000], empty: st.muonUnlocked ? "Count muons to see the data" : "Locked until both calibrations are done" });
    plots.table($("ct-table"), lab.counts.seconds ? lab.table("counts") : null);

    // Station 2
    plots.spectrum($("lamp-plot"), { flux: lab.lamp && lab.lamp.flux, peaks: lab.lamp && lab.lamp.peaks, empty: "Record the lamp spectrum" });
    renderAssignments();
    var cal = lab.calibration;
    setLamp("lamp-cal", st.calibrated ? "on" : (cal ? "bad" : "off"), st.calibrated ? "passed" : (cal ? "not passed" : "not done"));
    $("cal-readout").textContent = cal ? (cal.order === 2 ? "Quadratic" : "Linear") + " fit, " + cal.points.length + " lines: rms residual " +
      cal.rmsPx.toFixed(2) + " px" + (cal.ok ? " " + DASH + " passed." : " " + DASH + " not passed (see terminal for the reason).") : "";
    plots.table($("cal-table"), cal ? lab.table("calibration") : null);
    setLamp("lamp-point", st.calibrated ? "on" : "off", st.calibrated ? "ready" : "locked");
    var sid = lab.current && lab.current !== "lamp" ? lab.current : Object.keys(lab.spectra).pop();
    var sp = sid && lab.spectra[sid];
    $("star-readout").textContent = sp ? "Showing star " + sid + ": " + sp.peaks.length + " absorption lines found." : "";
    plots.spectrum($("star-plot"), { flux: sp && sp.flux, peaks: sp && sp.peaks,
      empty: st.calibrated ? "Choose a target and record its spectrum" : "Locked until the calibration passes" });
    plots.table($("star-table"), sp ? lab.table(sid) : null);

    // Station 3
    var h = lab.hidden;
    $("dock-beacon").textContent = "Platform velocity (local rest frame): " + (h.w >= 0 ? "+" : MINUS) + Math.abs(h.w).toFixed(4) +
      "c   (+ = same direction as the ship)\nThrusters absorb mismatches up to " + h.tolSpeed.toFixed(3) + "c (measured by the platform).\nPods left: " + st.launchesLeft;
    setLamp("lamp-dock", st.docked ? "on" : (st.launchesLeft ? "off" : "bad"), st.docked ? "docked" : (st.launchesLeft ? "ready" : "no pods left"));
    var last = lab.launches[lab.launches.length - 1];
    $("dock-readout").textContent = last ? (last.docked ? "Last launch DOCKED" : "Last launch FAILED") + ": mismatch " +
      signedText(last.mismatch) + "c" : "";
    plots.table($("dock-table"), lab.launches.length ? lab.table("launches") : null);
    drawGauge(last, h.tolSpeed);

    if (focusId && document.activeElement !== $(focusId) && $(focusId)) $(focusId).focus();
  }

  function renderAssignments() {
    var box = $("lamp-assign");
    if (!lab.lamp) { box.textContent = ""; return; }
    var t = { caption: "Lamp peaks: choose the hydrogen line for each peak you can identify", columns: ["peak", "pixel", "line"],
              rows: lab.lamp.peaks.map(function (pk, k) { return ["#" + (k + 1), pk.pixel.toFixed(2) + " " + PM + " " + pk.err.toFixed(2), k]; }) };
    plots.table(box, t, { cell: function (ri, ci) {
      if (ci !== 2) return null;
      var sel = document.createElement("select");
      sel.id = "assign-" + ri;
      sel.setAttribute("aria-label", "Line for peak " + (ri + 1));
      var none = document.createElement("option"); none.value = ""; none.textContent = DASH + " not assigned"; sel.appendChild(none);
      H.LINES.forEach(function (L) {
        var o = document.createElement("option"); o.value = L.id; o.textContent = L.id + " (" + L.nm.toFixed(2) + " nm)"; sel.appendChild(o);
      });
      sel.value = lab.assign[ri] || "";
      sel.addEventListener("change", function () {
        run(sel.value ? "assign " + (ri + 1) + " " + sel.value : "unassign " + (ri + 1));
      });
      return sel;
    } });
  }

  // Docking gauge: the pod's speed relative to the platform, against the thruster band.
  function drawGauge(last, tol) {
    var svg = $("dock-gauge"), el = plots.el;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var S = 0.25, x0 = 40, x1 = 600;
    var X = function (v) { return x0 + (Math.max(-S, Math.min(S, v)) + S) / (2 * S) * (x1 - x0); };
    var signed = function (v) { return signedText(v) + "c"; };
    el("rect", { x: X(-tol), y: 52, width: X(tol) - X(-tol), height: 32, "class": "band" }, svg);
    el("text", { x: X(0), y: 114, "text-anchor": "middle", "class": "band-label" }, svg, "docking band " + PM + tol.toFixed(3) + "c");
    el("line", { x1: x0, x2: x1, y1: 68, y2: 68, "class": "axis" }, svg);
    [-0.2, -0.1, 0, 0.1, 0.2].forEach(function (v) {
      el("line", { x1: X(v), x2: X(v), y1: 61, y2: 75, "class": "axis" }, svg);
      el("text", { x: X(v), y: 92, "text-anchor": "middle" }, svg, (v > 0 ? "+" : v < 0 ? MINUS : "") + Math.abs(v).toFixed(1));
    });
    el("text", { x: x0, y: 114 }, svg, "slower than platform");
    el("text", { x: x1, y: 114, "text-anchor": "end" }, svg, "faster than platform");
    if (!last) {
      el("text", { x: 320, y: 20, "text-anchor": "middle" }, svg, "No launch yet. The marker appears after your first launch.");
      svg.setAttribute("aria-label", "Docking gauge. No launch yet.");
      return;
    }
    var m = last.mismatch, x = X(m), off = Math.abs(m) > S;
    el("line", { x1: x, x2: x, y1: 36, y2: 72, "class": "marker " + (last.docked ? "ok" : "bad") }, svg);
    var anchor = x > 480 ? "end" : x < 160 ? "start" : "middle";
    var lx = anchor === "end" ? x - 6 : anchor === "start" ? x + 6 : x;
    el("text", { x: lx, y: 30, "text-anchor": anchor, "class": last.docked ? "ok" : "bad" }, svg,
      (last.docked ? "docked " : "missed by ") + signed(m) + (off ? " (off scale)" : ""));
    svg.setAttribute("aria-label", "Docking gauge. Last launch " + (last.docked ? "docked" : "missed") + " with a mismatch of " + signed(m) + ".");
  }

  $("view-mode").addEventListener("change", function () { view.setMode(this.value); });
  fillText();
  print(null, ["DEAD RECKONING navigation recovery console.",
    "Enter your team code in the panel (or type load <code>), then type help.",
    "Type about to read what this lab is, or explain <topic> for any station or figure."]);
})();
