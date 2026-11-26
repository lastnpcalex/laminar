/* Dead Reckoning: small SVG plots and data tables (no dependencies). */
(function (root) {
  "use strict";
  var DR = root.DR || (root.DR = {});
  var NS = "http://www.w3.org/2000/svg";
  var W = 640, Hh = 220, M = { l: 58, r: 14, t: 12, b: 38 };

  function el(name, attrs, parent, text) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  function reset(svg) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute("viewBox", "0 0 " + W + " " + Hh);
  }

  function niceTicks(lo, hi, n) {
    var span = hi - lo || 1, step = Math.pow(10, Math.floor(Math.log10(span / n)));
    var err = span / n / step;
    if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
    var ticks = [];
    for (var v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) ticks.push(+v.toFixed(10));
    return ticks;
  }

  function frame(svg, xr, yr, xLabel, yLabel) {
    var sx = function (x) { return M.l + (x - xr[0]) / (xr[1] - xr[0]) * (W - M.l - M.r); };
    var sy = function (y) { return Hh - M.b - (y - yr[0]) / (yr[1] - yr[0]) * (Hh - M.t - M.b); };
    niceTicks(xr[0], xr[1], 6).forEach(function (t) {
      el("line", { x1: sx(t), x2: sx(t), y1: M.t, y2: Hh - M.b, "class": "gridline" }, svg);
      el("text", { x: sx(t), y: Hh - M.b + 14, "text-anchor": "middle" }, svg, String(t));
    });
    niceTicks(yr[0], yr[1], 4).forEach(function (t) {
      el("line", { x1: M.l, x2: W - M.r, y1: sy(t), y2: sy(t), "class": "gridline" }, svg);
      el("text", { x: M.l - 6, y: sy(t) + 4, "text-anchor": "end" }, svg, String(t));
    });
    el("line", { x1: M.l, x2: W - M.r, y1: Hh - M.b, y2: Hh - M.b, "class": "axis" }, svg);
    el("line", { x1: M.l, x2: M.l, y1: M.t, y2: Hh - M.b, "class": "axis" }, svg);
    el("text", { x: (M.l + W - M.r) / 2, y: Hh - 6, "text-anchor": "middle" }, svg, xLabel);
    el("text", { x: 12, y: (M.t + Hh - M.b) / 2, "text-anchor": "middle",
                 transform: "rotate(-90 12 " + (M.t + Hh - M.b) / 2 + ")" }, svg, yLabel);
    return { sx: sx, sy: sy };
  }

  function empty(svg, msg) {
    reset(svg);
    el("text", { x: W / 2, y: Hh / 2, "text-anchor": "middle", "class": "empty" }, svg, msg);
  }

  // points: [{x, y, err}], fit: {slope, intercept} or null
  function scatter(svg, opts) {
    var pts = opts.points || [];
    if (!pts.length) { empty(svg, opts.empty || "No data yet"); return; }
    reset(svg);
    var xs = pts.map(function (p) { return p.x; });
    var ys = [];
    pts.forEach(function (p) { ys.push(p.y - (p.err || 0), p.y + (p.err || 0)); });
    var xr = opts.xRange || [Math.min.apply(null, xs), Math.max.apply(null, xs)];
    var ylo = Math.min.apply(null, ys), yhi = Math.max.apply(null, ys), pad = (yhi - ylo) * 0.12 || 0.5;
    var f = frame(svg, xr, [ylo - pad, yhi + pad], opts.xLabel, opts.yLabel);
    if (opts.fit) {
      el("line", { x1: f.sx(xr[0]), y1: f.sy(opts.fit.intercept + opts.fit.slope * xr[0]),
                   x2: f.sx(xr[1]), y2: f.sy(opts.fit.intercept + opts.fit.slope * xr[1]), "class": "fit" }, svg);
    }
    pts.forEach(function (p) {
      if (p.err) el("line", { x1: f.sx(p.x), x2: f.sx(p.x), y1: f.sy(p.y - p.err), y2: f.sy(p.y + p.err), "class": "axis" }, svg);
      el("circle", { cx: f.sx(p.x), cy: f.sy(p.y), r: 3.5, "class": "pt" }, svg);
    });
  }

  // flux: array indexed by pixel; peaks: [{pixel}] (numbered from 1)
  function spectrum(svg, opts) {
    var flux = opts.flux;
    if (!flux) { empty(svg, opts.empty || "No spectrum yet"); return; }
    reset(svg);
    var lo = Infinity, hi = -Infinity;
    flux.forEach(function (v) { if (v < lo) lo = v; if (v > hi) hi = v; });
    var pad = (hi - lo) * 0.08;
    var f = frame(svg, [0, flux.length - 1], [Math.min(0, lo - pad), hi + pad * 3], "pixel", "intensity");
    // Draw min and max per screen column so narrow lines are never lost.
    var cols = W - M.l - M.r, per = flux.length / cols, d = "";
    for (var c = 0; c < cols; c++) {
      var a = Math.floor(c * per), b = Math.max(a + 1, Math.floor((c + 1) * per)), mn = Infinity, mx = -Infinity;
      for (var i = a; i < b && i < flux.length; i++) { if (flux[i] < mn) mn = flux[i]; if (flux[i] > mx) mx = flux[i]; }
      d += (c ? "L" : "M") + (M.l + c).toFixed(1) + " " + f.sy(mn).toFixed(1) + "L" + (M.l + c).toFixed(1) + " " + f.sy(mx).toFixed(1);
    }
    el("path", { d: d, "class": "trace" }, svg);
    (opts.peaks || []).forEach(function (p, k) {
      var x = f.sx(p.pixel), top = M.t + 2 + (k % 3) * 11;
      el("line", { x1: x, x2: x, y1: top + 3, y2: top + 12, "class": "mark" }, svg);
      el("text", { x: x, y: top + 1, "text-anchor": "middle", "class": "mark-label" }, svg, String(k + 1));
    });
  }

  // Build an accessible <table> from {caption, columns, rows}.
  function table(container, t, opts) {
    container.textContent = "";
    if (!t || !t.rows.length) return null;
    var wrap = document.createElement("div");
    wrap.className = "table-wrap";
    var tb = document.createElement("table");
    var cap = document.createElement("caption"); cap.textContent = t.caption; tb.appendChild(cap);
    var thead = document.createElement("thead"), tr = document.createElement("tr");
    t.columns.forEach(function (c) { var th = document.createElement("th"); th.scope = "col"; th.textContent = c; tr.appendChild(th); });
    thead.appendChild(tr); tb.appendChild(thead);
    var tbody = document.createElement("tbody");
    t.rows.forEach(function (r, ri) {
      var row = document.createElement("tr");
      r.forEach(function (v, ci) {
        var cell = document.createElement(ci === 0 ? "th" : "td");
        if (ci === 0) cell.scope = "row";
        if (opts && opts.cell) { var custom = opts.cell(ri, ci, v); if (custom) { cell.appendChild(custom); row.appendChild(cell); return; } }
        cell.textContent = v;
        row.appendChild(cell);
      });
      tbody.appendChild(row);
    });
    tb.appendChild(tbody); wrap.appendChild(tb); container.appendChild(wrap);
    return tb;
  }

  DR.plots = { scatter: scatter, spectrum: spectrum, table: table, empty: empty, el: el };
})(typeof globalThis !== "undefined" ? globalThis : this);
