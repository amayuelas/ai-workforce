/* AI Workforce Tracker — data loading, signed metrics, charts. No build step, no external deps. */
(function () {
  "use strict";

  var INK = "#1b1917", MUTED = "#8a8478", LINE = "#e6e1d5";
  var RED = "#b23a2e", GREEN = "#1e7a40", VIOLET = "#6d4fc2";
  var PALETTE = ["#2456a6", "#b23a2e", "#1e7a40", "#9a6a00", "#6d4fc2", "#0e7c86", "#c2498a", "#5b7a2e", "#8a5a2b", "#4a6fa5", "#a33b3b", "#3d8b6d", "#7a6fc2", "#666055"];
  var LAYOFF_COLOR = RED, HIRING_COLOR = GREEN, AI_COLOR = VIOLET;

  var _cache = {};
  function loadJSON(path) {
    if (_cache[path]) return _cache[path];
    _cache[path] = fetch(path, { cache: "force-cache" }).then(function (r) {
      if (!r.ok) throw new Error("Failed to load " + path + " (" + r.status + ")");
      return r.json();
    });
    return _cache[path];
  }

  function fmt(n) {
    if (n === null || n === undefined) return "—";
    return Number(n).toLocaleString("en-US");
  }

  /* Signed value: layoffs negative, hirings positive. */
  function signed(ev) {
    if (!ev.size) return 0;
    return ev.type === "layoff" ? -ev.size : ev.size;
  }

  function fmtSigned(n) {
    if (n === null || n === undefined) return "—";
    return (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n));
  }

  function companyName(companies, id) {
    var c = companies.find(function (x) { return x.id === id; });
    return c ? c.name : id;
  }

  function companyTicker(companies, id) {
    var c = companies.find(function (x) { return x.id === id; });
    return c && c.ticker ? c.ticker : "";
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function sourceLinks(ev) {
    return '<ul class="src-list">' + ev.sources.map(function (s) {
      return '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.title) + "</a></li>";
    }).join("") + "</ul>";
  }

  function badges(ev) {
    var out = [];
    out.push(ev.type === "layoff"
      ? '<span class="badge red">layoff ' + fmtSigned(signed(ev)) + "</span>"
      : '<span class="badge green">hiring ' + fmtSigned(signed(ev)) + "</span>");
    if (ev.ai_related) out.push('<span class="badge ai">AI</span>');
    if (ev.size_is_estimate) out.push('<span class="badge est">est.</span>');
    out.push('<span class="badge conf-' + (ev.confidence || "medium") + '" title="source confidence">' + (ev.confidence || "medium") + " conf.</span>");
    return out.join(" ");
  }

  /* ---------- SVG helpers ---------- */
  var NS = "http://www.w3.org/2000/svg";
  function svgEl(tag, attrs) {
    var el = document.createElementNS(NS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }
  function txt(svg, x, y, s, attrs) {
    var t = svgEl("text", Object.assign({ x: x, y: y, fill: MUTED, "font-size": 11 }, attrs || {}));
    t.textContent = s;
    svg.appendChild(t);
    return t;
  }

  /* Shared HTML tooltip for SVG hover (native <title> is unreliable on SVG in some browsers). */
  function bindTooltip(container) {
    var tip = document.createElement("div");
    tip.className = "svg-tip"; tip.setAttribute("class", "svg-tip");
    tip.style.display = "none";
    container.style.position = "relative";
    container.appendChild(tip);
    container.addEventListener("mousemove", function (ev) {
      var el = ev.target && ev.target.getAttribute ? ev.target : null;
      var d = el && el.getAttribute("data-tip");
      if (d) {
        tip.textContent = d;
        tip.style.display = "block";
        var r = container.getBoundingClientRect();
        tip.style.left = Math.min(ev.clientX - r.left + 12, r.width - 220) + "px";
        tip.style.top = (ev.clientY - r.top + 14) + "px";
      } else {
        tip.style.display = "none";
      }
    });
    container.addEventListener("mouseleave", function () { tip.style.display = "none"; });
  }

  /* Diverging bar chart: negative (layoffs) down in red, positive (hirings) up in green. */
  function signedBarChart(container, rows, opts) {
    opts = opts || {};
    rows = (rows || []).filter(function (r) { return r && isFinite(r.value); });
    var W = container.clientWidth || 900, H = opts.height || 300;
    var many = rows.length > 7;
    var padL = 70, padR = 70, padT = 20, padB = many ? 52 : 34;
    var maxAbs = 1;
    rows.forEach(function (r) { maxAbs = Math.max(maxAbs, Math.abs(r.value)); });
    if (!rows.length) { container.innerHTML = '<p class="muted small">No data.</p>'; return; }
    var zeroY = padT + (H - padT - padB) / 2;
    var scale = (H - padT - padB) / 2 / maxAbs;
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, class: "chart", role: "img" });
    [1, -1].forEach(function (side) {
      for (var g = 1; g <= 4; g++) {
        var v = maxAbs * g / 4;
        var y = zeroY - side * v * scale;
        svg.appendChild(svgEl("line", { x1: padL, y1: y, x2: W - padR, y2: y, stroke: LINE, "stroke-width": 1 }));
        txt(svg, padL - 8, y + 4, fmt(Math.round(v)), { "text-anchor": "end" });
        txt(svg, W - padR + 8, y + 4, fmt(Math.round(v)), { "text-anchor": "start" });
      }
    });
    svg.appendChild(svgEl("line", { x1: padL, y1: zeroY, x2: W - padR, y2: zeroY, stroke: INK, "stroke-width": 1.4 }));
    var bw = (W - padL - padR) / rows.length;
    rows.forEach(function (r, i) {
      var x = padL + i * bw + bw * 0.18, w = bw * 0.64;
      var h = Math.abs(r.value) * scale;
      var y = r.value >= 0 ? zeroY - h : zeroY;
      var bar = svgEl("rect", {
        x: x, y: y, width: w, height: Math.max(h, 1.5),
        fill: r.color || (r.value >= 0 ? HIRING_COLOR : LAYOFF_COLOR), rx: 2
      });
      bar.setAttribute("data-tip", (r.label ? r.label + " · " : "") + fmtSigned(r.value) + (r.label2 ? " · " + r.label2 : ""));
      svg.appendChild(bar);
      var col = r.color || (r.value >= 0 ? HIRING_COLOR : LAYOFF_COLOR);
      if (h > 26) {
        txt(svg, x + w / 2, r.value >= 0 ? y + h - 8 : y + 16, fmtSigned(r.value), {
          "text-anchor": "middle", fill: "#fbfaf6", "font-weight": 700, "font-size": 10.5
        });
      } else {
        txt(svg, x + w / 2, r.value >= 0 ? y - 6 : y + h + 13, fmtSigned(r.value), {
          "text-anchor": "middle", fill: col, "font-weight": 700, "font-size": 11
        });
      }
      var lx = x + w / 2;
      if (many) {
        var row = i % 2;
        txt(svg, lx, H - padB + 14 + row * 13, r.label, { "text-anchor": "middle", "font-size": 9.5, fill: row ? MUTED : INK });
      } else {
        txt(svg, lx, H - padB + 18, r.label, { "text-anchor": "middle", "font-size": 11 });
        if (r.label2) txt(svg, lx, H - padB + 30, r.label2, { "text-anchor": "middle", "font-size": 9.5 });
      }
    });
    container.innerHTML = "";
    container.appendChild(svg);
    bindTooltip(container);
  }

  /* Horizontal stacked bars per year: layoffs (red, left of zero) vs hirings (green, right of zero). */
  function netFlowChart(container, events, opts) {
    opts = opts || {};
    var byQ = {};
    events.forEach(function (e) {
      if (!e.size) return;
      var y = e.date.slice(0, 4), m = parseInt(e.date.slice(5, 7), 10);
      var q = y + "-Q" + Math.ceil(m / 3);
      byQ[q] = byQ[q] || { lay: 0, hir: 0 };
      if (e.type === "layoff") byQ[q].lay += e.size; else byQ[q].hir += e.size;
    });
    var keys = Object.keys(byQ).sort();
    var W = container.clientWidth || 900, rowH = opts.rowH || 34, padL = 90, padR = 90, padT = 8;
    var H = padT + keys.length * rowH + 26;
    var maxAbs = 1;
    keys.forEach(function (q) { maxAbs = Math.max(maxAbs, Math.max(byQ[q].lay, byQ[q].hir)); });
    var midX = padL + (W - padL - padR) / 2;
    var scale = (W - padL - padR) / 2 / maxAbs;
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, class: "chart", style: "height:" + H + "px", role: "img" });
    svg.appendChild(svgEl("line", { x1: midX, y1: padT - 4, x2: midX, y2: H - 22, stroke: INK, "stroke-width": 1.2 }));
    txt(svg, midX - 10, padT + 2, "layoffs", { "text-anchor": "end", fill: LAYOFF_COLOR, "font-weight": 700, "font-size": 11 });
    txt(svg, midX + 10, padT + 2, "hirings", { "text-anchor": "start", fill: HIRING_COLOR, "font-weight": 700, "font-size": 11 });
    keys.forEach(function (q, i) {
      var y = padT + i * rowH + rowH / 2;
      var lw = byQ[q].lay * scale, hw = byQ[q].hir * scale;
      if (lw > 0) { var rl = svgEl("rect", { x: midX - lw, y: y - 9, width: lw, height: 18, fill: LAYOFF_COLOR, rx: 2 }); rl.setAttribute("data-tip", q + " · layoffs −" + fmt(byQ[q].lay)); svg.appendChild(rl); }
      if (hw > 0) { var rh = svgEl("rect", { x: midX, y: y - 9, width: hw, height: 18, fill: HIRING_COLOR, rx: 2 }); rh.setAttribute("data-tip", q + " · hirings +" + fmt(byQ[q].hir)); svg.appendChild(rh); }
      if (lw > 0) txt(svg, midX - lw - 6, y + 4, "−" + fmt(byQ[q].lay), { "text-anchor": "end", fill: LAYOFF_COLOR, "font-size": 10.5, "font-weight": 600 });
      if (hw > 0) txt(svg, midX + hw + 6, y + 4, "+" + fmt(byQ[q].hir), { "text-anchor": "start", fill: HIRING_COLOR, "font-size": 10.5, "font-weight": 600 });
      txt(svg, padL - 10, y + 4, q, { "text-anchor": "end", fill: INK, "font-weight": 600, "font-size": 11 });
    });
    container.innerHTML = "";
    container.appendChild(svg);
    bindTooltip(container);
  }

  /* Per-company evolution timeline, leaderboard-style rows with a mini signed step chart. */
  function companyEvolution(container, companies, events, headcount) {
    var byCo = {};
    events.forEach(function (e) {
      if (!e.size) return;
      byCo[e.company] = byCo[e.company] || [];
      byCo[e.company].push(e);
    });
    var latest = {};
    headcount.forEach(function (s) {
      if (!latest[s.company] || s.as_of > latest[s.company].as_of) latest[s.company] = s;
    });
    var ids = Object.keys(byCo).sort(function (a, b) {
      var na = byCo[a].reduce(function (x, e) { return x + signed(e); }, 0);
      var nb = byCo[b].reduce(function (x, e) { return x + signed(e); }, 0);
      return na - nb;
    });
    var W = Math.max(container.clientWidth - 340, 300), H = 44, pad = 6;
    var html = '<div class="evo"><div class="head"><span>Company</span><span>workforce events since 2022 (bars: − layoffs / + hirings, quarterly)</span><span class="net">net</span></div>';
    ids.forEach(function (id) {
      var evs = byCo[id].slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
      var byQ = {};
      evs.forEach(function (e) {
        var m = parseInt(e.date.slice(5, 7), 10);
        var q = e.date.slice(0, 4) + "-Q" + Math.ceil(m / 3);
        byQ[q] = (byQ[q] || 0) + signed(e);
      });
      var keys = Object.keys(byQ).sort();
      var maxAbs = Math.max.apply(null, keys.map(function (q) { return Math.abs(byQ[q]); }).concat([1]));
      var cw = (W - pad * 2) / keys.length;
      var midY = H / 2;
      var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "none" });
      svg.appendChild(svgEl("line", { x1: 0, y1: midY, x2: W, y2: midY, stroke: LINE, "stroke-width": 1 }));
      keys.forEach(function (q, i) {
        var v = byQ[q];
        var h = Math.abs(v) / maxAbs * (H / 2 - 4);
        var x = pad + i * cw + cw * 0.15, w = cw * 0.7;
        var y = v >= 0 ? midY - h : midY;
        svg.appendChild(svgEl("rect", { x: x, y: y, width: w, height: Math.max(h, 1.5), fill: v >= 0 ? HIRING_COLOR : LAYOFF_COLOR, rx: 1 }));
        var dot = svgEl("circle", { cx: x + w / 2, cy: v >= 0 ? y : y + h, r: 1.6, fill: v >= 0 ? HIRING_COLOR : LAYOFF_COLOR });
        svg.appendChild(dot);
      });
      var net = evs.reduce(function (x, e) { return x + signed(e); }, 0);
      var hc = latest[id];
      html += '<div class="row"><span class="co">' + esc(companyName(companies, id)) +
        (companyTicker(companies, id) ? '<span class="tick">' + esc(companyTicker(companies, id)) + "</span>" : "") + "</span>" +
        "<span>" + svg.outerHTML + "</span>" +
        '<span class="net ' + (net < 0 ? "neg" : net > 0 ? "pos" : "") + '">' + fmtSigned(net) +
        (hc ? ' <span class="muted" style="font-size:0.72rem">' + fmt(hc.employees) + " emp.</span>" : "") + "</span></div>";
    });
    html += "</div>";
    container.innerHTML = html;
  }

  /* Multi-series line chart, Artificial-Analysis-style: x = date, y = value, square markers, top-right legend. */
  function lineChart(container, series, opts) {
    opts = opts || {};
    series = (series || []).filter(function (s) { return s.points && s.points.length; });
    var W = container.clientWidth || 900, H = opts.height || 380;
    var padL = 64, padR = 16, padT = 14, padB = 34;
    var allPts = [];
    series.forEach(function (s) { s.points.forEach(function (p) { allPts.push(p); }); });
    if (!allPts.length) { container.textContent = "No data"; return; }
    var t0 = Math.min.apply(null, allPts.map(function (p) { return +new Date(p[0]); }));
    var t1 = Math.max.apply(null, allPts.map(function (p) { return +new Date(p[0]); }));
    var v0 = opts.yMin !== undefined ? opts.yMin : 0;
    var v1 = opts.yMax !== undefined ? opts.yMax : Math.max.apply(null, allPts.map(function (p) { return p[1]; })) * 1.05;
    if (opts.zeroLine) {
      var m = Math.max(Math.abs(v0), Math.abs(v1));
      v0 = -m * 1.05; v1 = m * 1.05;
    }
    function X(d) { return padL + (W - padL - padR) * ((+new Date(d)) - t0) / (t1 - t0 || 1); }
    function Y(v) { return padT + (H - padT - padB) * (1 - (v - v0) / (v1 - v0 || 1)); }
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, class: "chart tall", role: "img", style: "height:" + H + "px" });
    if (opts.zeroLine && v0 < 0 && v1 > 0) {
      svg.appendChild(svgEl("line", { x1: padL, y1: Y(0), x2: W - padR, y2: Y(0), stroke: INK, "stroke-width": 1.3 }));
    }
    for (var g = 0; g <= 4; g++) {
      var gv = v0 + (v1 - v0) * g / 4, gy = Y(gv);
      svg.appendChild(svgEl("line", { x1: padL, y1: gy, x2: W - padR + 130, y2: gy, stroke: LINE }));
      txt(svg, padL - 8, gy + 4, opts.yFmt ? opts.yFmt(gv) : fmt(Math.round(gv)), { "text-anchor": "end" });
    }
    var years = {};
    allPts.forEach(function (p) { years[p[0].slice(0, 4)] = true; });
    var ykeys = Object.keys(years).sort();
    var step = ykeys.length > 8 ? 2 : 1;
    ykeys.forEach(function (y, i) {
      if (i % step !== 0 && i !== ykeys.length - 1) return;
      var x = X(y + "-07-01");
      svg.appendChild(svgEl("line", { x1: x, y1: padT, x2: x, y2: H - padB, stroke: LINE, "stroke-dasharray": "2 3" }));
      txt(svg, x, H - padB + 15, y, { "text-anchor": "middle", "font-size": 10.5 });
    });
    txt(svg, (padL + W - padR) / 2, H - 6, opts.xLabel || "Date", { "text-anchor": "middle", "font-size": 11, fill: MUTED });
    series.forEach(function (s, i) {
      var color = s.color || PALETTE[i % PALETTE.length];
      var pts = s.points.slice().sort(function (a, b) { return a[0].localeCompare(b[0]); });
      var d = pts.map(function (p, j) { return (j ? "L" : "M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1); }).join(" ");
      svg.appendChild(svgEl("path", { d: d, fill: "none", stroke: color, "stroke-width": 1.8, "stroke-dasharray": s.dashed ? "5 3" : "none" }));
      pts.forEach(function (p) {
        var m = svgEl("rect", { x: X(p[0]) - 2.6, y: Y(p[1]) - 2.6, width: 5.2, height: 5.2, fill: color });
        m.setAttribute("data-tip", s.label + " · " + p[0] + " · " + (opts.yFmt ? opts.yFmt(p[1]) : fmt(Math.round(p[1]))));
        svg.appendChild(m);
      });
    });
    container.innerHTML = "";
    container.appendChild(svg);
    var leg = document.createElement("div");
    leg.className = "chart-legend";
    series.forEach(function (s, i) {
      var color = s.color || PALETTE[i % PALETTE.length];
      var item = document.createElement("span");
      item.className = "lg-item";
      item.innerHTML = '<i style="background:' + color + (s.dashed ? ";height:0;border-top:2px dashed " + color : "") + '"></i>' + esc(s.label);
      leg.appendChild(item);
    });
    container.appendChild(leg);
    bindTooltip(container);
  }

  /* Simple vertical bars (all-positive) for rankings like headcount / top layoffs. */
  function barChart(container, rows, opts) {
    opts = opts || {};
    var W = container.clientWidth || 900, H = opts.height || 300;
    var padL = 70, padR = 20, padT = 22, padB = rows.length > 7 ? 66 : 52;
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([1]));
    var bw = (W - padL - padR) / rows.length;
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, class: "chart", role: "img" });
    for (var g = 0; g <= 4; g++) {
      var y = padT + (H - padT - padB) * (1 - g / 4);
      svg.appendChild(svgEl("line", { x1: padL, y1: y, x2: W - padR, y2: y, stroke: LINE }));
      txt(svg, padL - 8, y + 4, fmt(Math.round(max * g / 4)), { "text-anchor": "end" });
    }
    if (!rows.length) { container.innerHTML = '<p class="muted small">No data.</p>'; return; }
    rows.forEach(function (r, i) {
      var h = (H - padT - padB) * (r.value / max);
      var x = padL + i * bw + bw * 0.14, w = bw * 0.72, y = H - padB - h;
      var b2 = svgEl("rect", { x: x, y: y, width: w, height: Math.max(h, 1.5), fill: r.color || PALETTE[i % PALETTE.length], rx: 2 });
      b2.setAttribute("data-tip", (r.label || "") + " · " + fmt(r.value) + (r.label2 ? " · " + r.label2 : ""));
      svg.appendChild(b2);
      if (h > 24) {
        txt(svg, x + w / 2, y + h - 7, fmt(r.value), { "text-anchor": "middle", fill: "#fbfaf6", "font-weight": 700, "font-size": 10.5 });
      } else {
        txt(svg, x + w / 2, y - 6, fmt(r.value), { "text-anchor": "middle", fill: INK, "font-weight": 700, "font-size": 11 });
      }
      if (rows.length > 7) {
        txt(svg, x + w / 2, H - padB + 14 + (i % 2) * 13, r.label, { "text-anchor": "middle", "font-size": 9.5, fill: (i % 2) ? MUTED : INK });
      } else {
        txt(svg, x + w / 2, H - padB + 17, r.label, { "text-anchor": "middle", "font-size": 10.5 });
        if (r.label2) txt(svg, x + w / 2, H - padB + 31, r.label2, { "text-anchor": "middle", "font-size": 9.5 });
      }
    });
    container.innerHTML = "";
    container.appendChild(svg);
    bindTooltip(container);
  }

  /* Event scatter timeline: x = date, y = company row, marker size ~ |signed size|. */
  function eventScatter(container, companies, events, type) {
    var evs = (events || []).filter(function (e) { return !type || e.type === type; });
    if (!evs.length) { container.innerHTML = '<p class="muted small">No events.</p>'; return; }
    function colorOf(e) { return e.type === "layoff" ? LAYOFF_COLOR : HIRING_COLOR; }
    var ids = [];
    evs.forEach(function (e) { if (ids.indexOf(e.company) === -1) ids.push(e.company); });
    var latest = {};
    var byCo = {};
    evs.forEach(function (e) {
      byCo[e.company] = byCo[e.company] || [];
      byCo[e.company].push(e);
    });
    var W = container.clientWidth || 900, rowH = 26, padL = 150, padR = 20, padT = 10, padB = 34;
    var H = padT + ids.length * rowH + padB;
    var t0 = Math.min.apply(null, evs.map(function (e) { return +new Date(e.date); })) - 86400000 * 60;
    var t1 = Math.max.apply(null, evs.map(function (e) { return +new Date(e.date); })) + 86400000 * 90;
    function X(d) { return padL + (W - padL - padR) * ((+new Date(d)) - t0) / (t1 - t0); }
    var maxSize = Math.max.apply(null, evs.map(function (e) { return e.size || 1; }));
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, class: "chart", style: "height:" + H + "px", role: "img" });
    var years = {};
    evs.forEach(function (e) { years[e.date.slice(0, 4)] = true; });
    Object.keys(years).sort().forEach(function (y) {
      var x = X(y + "-01-15");
      svg.appendChild(svgEl("line", { x1: x, y1: padT - 4, x2: x, y2: H - padB, stroke: LINE, "stroke-dasharray": "2 3" }));
      txt(svg, x, H - padB + 16, y, { "text-anchor": "middle", "font-size": 10.5 });
    });
    ids.forEach(function (id, i) {
      var y = padT + i * rowH + rowH / 2;
      txt(svg, padL - 10, y + 4, companyName(companies, id), { "text-anchor": "end", fill: INK, "font-weight": 600, "font-size": 11 });
      svg.appendChild(svgEl("line", { x1: padL, y1: y, x2: W - padR, y2: y, stroke: LINE, "stroke-width": 0.5 }));
      byCo[id].forEach(function (e) {
        var r = e.size ? 3 + 10 * Math.sqrt(e.size / maxSize) : 3;
        var c = svgEl("circle", {
          cx: X(e.date), cy: y, r: r,
          fill: colorOf(e),
          "fill-opacity": 0.75, stroke: colorOf(e)
        });
        c.setAttribute("class", "bubble");
        c.setAttribute("data-tip", e.date + " · " + companyName(companies, id) + " · " + fmtSigned(signed(e)) + (e.size ? "" : " (not quantified)") + (e.ai_related ? " · AI" : "") + " · " + (e.confidence || "") + " conf.");
        svg.appendChild(c);
      });
    });
    container.innerHTML = "";
    container.appendChild(svg);
    bindTooltip(container);
  }

  /* YoY % change series per company. */
  function yoySeries(companies, headcount) {
    var byCo = {};
    headcount.forEach(function (s) { (byCo[s.company] = byCo[s.company] || []).push(s); });
    return companies.map(function (c) {
      var pts = (byCo[c.id] || []).slice().sort(function (a, b) { return a.as_of.localeCompare(b.as_of); });
      var out = [];
      for (var i = 1; i < pts.length; i++) {
        var dt = (+new Date(pts[i].as_of) - +new Date(pts[i - 1].as_of)) / (365.25 * 86400000);
        if (dt < 0.5) continue;
        out.push([pts[i].as_of, (pts[i].employees / pts[i - 1].employees - 1) * 100]);
      }
      return { label: companyName(companies, c.id) + (c.ticker ? " " + c.ticker : ""), points: out, color: null };
    }).filter(function (s) { return s.points.length >= 1; });
  }

  /* Indexed headcount (first point = 100): comparable across companies of different sizes. */
  function indexedSeries(companies, headcount) {
    var byCo = {};
    headcount.forEach(function (s) { (byCo[s.company] = byCo[s.company] || []).push(s); });
    return companies.map(function (c) {
      var pts = (byCo[c.id] || []).slice().sort(function (a, b) { return a.as_of.localeCompare(b.as_of); });
      if (pts.length < 2) return null; /* single-snapshot labs can't be indexed */
      var base = pts[0].employees;
      return {
        label: companyName(companies, c.id) + (c.ticker ? " " + c.ticker : ""),
        points: pts.map(function (p) { return [p.as_of, p.employees / base * 100]; }),
        dashed: pts.some(function (p) { return p.is_estimate; })
      };
    }).filter(Boolean);
  }

  /* Implied gross hiring per company = YoY net headcount change + announced layoffs in the window.
     Uses filings (net) + announced events to estimate actual hiring — fixes the announced-hiring gap. */
  function impliedHiring(companies, headcount, events) {
    var byCo = {};
    headcount.forEach(function (s) { (byCo[s.company] = byCo[s.company] || []).push(s); });
    var rows = [];
    companies.forEach(function (c) {
      var pts = (byCo[c.id] || []).slice().sort(function (a, b) { return a.as_of.localeCompare(b.as_of); });
      if (pts.length < 2) return;
      var last = pts[pts.length - 1], prev = pts[pts.length - 2];
      var dtYears = (+new Date(last.as_of) - +new Date(prev.as_of)) / (365.25 * 86400000);
      if (dtYears < 0.5) return;
      var y0 = prev.as_of.slice(0, 4), y1 = last.as_of.slice(0, 4);
      var layoffs = events.filter(function (e) {
        return e.type === "layoff" && e.size && e.company === c.id &&
          e.date.slice(0, 4) >= y0 && e.date.slice(0, 4) <= y1;
      }).reduce(function (a, e) { return a + e.size; }, 0);
      var net = last.employees - prev.employees;
      rows.push({
        company: c.id,
        label: companyName(companies, c.id) + (c.ticker ? " " + c.ticker : ""),
        announcedLayoffs: layoffs,
        impliedGrossHiring: net + layoffs,
        netChange: net,
        period: y0 + "→" + y1
      });
    });
    return rows.sort(function (a, b) { return b.impliedGrossHiring - a.impliedGrossHiring; });
  }

  /* Latest fiscal-year net headcount change per company, derived from the headcount series (signed). */
  function netHeadcountChange(companies, headcount) {
    var byCo = {};
    headcount.forEach(function (s) {
      (byCo[s.company] = byCo[s.company] || []).push(s);
    });
    var rows = [];
    companies.forEach(function (c) {
      var pts = (byCo[c.id] || []).slice().sort(function (a, b) { return a.as_of.localeCompare(b.as_of); });
      if (pts.length < 2) return;
      var last = pts[pts.length - 1], prev = pts[pts.length - 2];
      var dt = (+new Date(last.as_of) - +new Date(prev.as_of)) / (365.25 * 86400000);
      if (dt < 0.5) return;
      rows.push({
        company: c.id, label: companyName(companies, c.id) + (c.ticker ? " " + c.ticker : ""),
        value: last.employees - prev.employees, as_of: last.as_of, est: last.is_estimate
      });
    });
    return rows.sort(function (a, b) { return a.value - b.value; });
  }

  /* ---------- tables ---------- */
  function eventsTable(tbody, companies, events, type) {
    var rows = events.filter(function (e) { return !type || e.type === type; })
      .sort(function (a, b) { return b.date.localeCompare(a.date); });
    tbody.innerHTML = rows.map(function (e) {
      return "<tr>" +
        "<td class='num'>" + esc(e.date) + "</td>" +
        "<td><strong>" + esc(companyName(companies, e.company)) + "</strong></td>" +
        "<td>" + badges(e) + "</td>" +
        '<td class="num ' + (signed(e) < 0 ? "neg" : signed(e) > 0 ? "pos" : "") + '">' +
          (e.size ? fmtSigned(signed(e)) : "—") +
          (e.percent_of_workforce ? ' <span class="muted">' + e.percent_of_workforce + "%</span>" : "") + "</td>" +
        "<td class='small'>" + esc(e.scope) + "<br><span class='muted'>" + esc(e.reason) + "</span></td>" +
        "<td>" + sourceLinks(e) + "</td>" +
        "</tr>";
    }).join("");
    return rows;
  }

  function companiesTable(tbody, companies, headcount) {
    var latest = {};
    headcount.forEach(function (s) {
      if (!latest[s.company] || s.as_of > latest[s.company].as_of) latest[s.company] = s;
    });
    tbody.innerHTML = companies.map(function (c) {
      var hc = latest[c.id];
      return "<tr>" +
        "<td><strong>" + esc(c.name) + "</strong>" + (c.ticker ? ' <span class="muted small mono">' + esc(c.ticker) + "</span>" : "") + "</td>" +
        "<td><span class='badge'>" + esc(c.type) + "</span></td>" +
        "<td class='small'>" + esc(c.segment) + "</td>" +
        '<td class="num">' + (hc ? fmt(hc.employees) + (hc.is_estimate ? ' <span class="badge est">est.</span>' : "") + ' <span class="muted small">' + esc(hc.as_of) + "</span>" : "—") + "</td>" +
        "<td class='small muted'>" + esc(c.selection_reason) + "</td>" +
        "</tr>";
    }).join("");
  }

  /* ---------- chrome ---------- */
  function header(active) {
    var pages = [["index.html", "WorkforceBench"], ["layoffs.html", "LayoffsBench"], ["hirings.html", "HiringsBench"]];
    var nav = pages.map(function (p) {
      return '<a href="' + p[0] + '"' + (p[1] === active ? ' class="active"' : "") + ">" + p[1] + "</a>";
    }).join("");
    return '<header class="site"><div class="bar"><a class="brand" href="index.html">AI Workforce Tracker<small>Layoffs &amp; hirings · tech &amp; AI labs</small></a><nav>' + nav + "</nav></div></header>";
  }

  function footer(updated) {
    return '<footer class="site">' +
      "Data last updated " + esc(updated) + ". Every event links to its sources in " +
      '<a href="https://github.com/amayuelas/ai-workforce/tree/main/data">data/</a>. ' +
      "Layoffs are counted negative, hirings positive; announced figures, not realized separations. " +
      'Methodology &amp; confidence tiers: <a href="https://github.com/amayuelas/ai-workforce/blob/main/docs/METHODOLOGY.md">docs/METHODOLOGY.md</a>.</footer>';
  }

  function loadAll() {
    return Promise.all([
      loadJSON("data/companies.json"),
      loadJSON("data/events.json"),
      loadJSON("data/headcount.json")
    ]).then(function (r) { return { companies: r[0].companies, events: r[1].events, headcount: r[2].snapshots, updated: r[1].updated }; });
  }

  window.AIW = {
    loadAll: loadAll, header: header, footer: footer,
    fmt: fmt, fmtSigned: fmtSigned, signed: signed, esc: esc,
    companyName: companyName, companyTicker: companyTicker,
    signedBarChart: signedBarChart, netFlowChart: netFlowChart, companyEvolution: companyEvolution,
    barChart: barChart, lineChart: lineChart, eventScatter: eventScatter, netHeadcountChange: netHeadcountChange,
    yoySeries: yoySeries, indexedSeries: indexedSeries, impliedHiring: impliedHiring,
    eventsTable: eventsTable, companiesTable: companiesTable,
    badges: badges, sourceLinks: sourceLinks,
    PALETTE: PALETTE, LAYOFF_COLOR: LAYOFF_COLOR, HIRING_COLOR: HIRING_COLOR, AI_COLOR: AI_COLOR
  };
})();
