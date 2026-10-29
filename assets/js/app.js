/* AI Workforce Tracker — data loading, signed metrics, charts. No build step, no external deps. */
(function () {
  "use strict";

  var INK = "#1b1917", MUTED = "#8a8478", LINE = "#e6e1d5";
  var RED = "#b23a2e", GREEN = "#1e7a40", VIOLET = "#6d4fc2";
  var PALETTE = ["#2456a6", "#b23a2e", "#1e7a40", "#9a6a00", "#6d4fc2", "#0e7c86", "#c2498a", "#5b7a2e", "#8a5a2b", "#4a6fa5", "#a33b3b", "#3d8b6d", "#7a6fc2", "#666055"];
  var LAYOFF_COLOR = RED, HIRING_COLOR = GREEN, AI_COLOR = VIOLET;

  function loadJSON(path) {
    return fetch(path).then(function (r) {
      if (!r.ok) throw new Error("Failed to load " + path + " (" + r.status + ")");
      return r.json();
    });
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

  /* Diverging bar chart: negative (layoffs) left/down in red, positive (hirings) in green. */
  function signedBarChart(container, rows, opts) {
    opts = opts || {};
    var W = container.clientWidth || 900, H = opts.height || 300;
    var padL = 70, padR = 70, padT = 20, padB = 34;
    var maxAbs = 1;
    rows.forEach(function (r) { maxAbs = Math.max(maxAbs, Math.abs(r.value)); });
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
      svg.appendChild(svgEl("rect", {
        x: x, y: y, width: w, height: Math.max(h, 1.5),
        fill: r.value >= 0 ? HIRING_COLOR : LAYOFF_COLOR, rx: 2
      }));
      var v = txt(svg, x + w / 2, r.value >= 0 ? y - 6 : y + h + 13, fmtSigned(r.value), {
        "text-anchor": "middle", fill: r.value >= 0 ? HIRING_COLOR : LAYOFF_COLOR, "font-weight": 700, "font-size": 11.5
      });
      var l = txt(svg, x + w / 2, H - padB + 18, r.label, { "text-anchor": "middle", "font-size": 11 });
    });
    container.innerHTML = "";
    container.appendChild(svg);
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
      if (lw > 0) svg.appendChild(svgEl("rect", { x: midX - lw, y: y - 9, width: lw, height: 18, fill: LAYOFF_COLOR, rx: 2 }));
      if (hw > 0) svg.appendChild(svgEl("rect", { x: midX, y: y - 9, width: hw, height: 18, fill: HIRING_COLOR, rx: 2 }));
      if (lw > 0) txt(svg, midX - lw - 6, y + 4, "−" + fmt(byQ[q].lay), { "text-anchor": "end", fill: LAYOFF_COLOR, "font-size": 10.5, "font-weight": 600 });
      if (hw > 0) txt(svg, midX + hw + 6, y + 4, "+" + fmt(byQ[q].hir), { "text-anchor": "start", fill: HIRING_COLOR, "font-size": 10.5, "font-weight": 600 });
      txt(svg, padL - 10, y + 4, q, { "text-anchor": "end", fill: INK, "font-weight": 600, "font-size": 11 });
    });
    container.innerHTML = "";
    container.appendChild(svg);
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
    var W = container.clientWidth || 900, H = opts.height || 380;
    var padL = 64, padR = 150, padT = 14, padB = 40;
    var allPts = [];
    series.forEach(function (s) { s.points.forEach(function (p) { allPts.push(p); }); });
    if (!allPts.length) { container.textContent = "No data"; return; }
    var t0 = Math.min.apply(null, allPts.map(function (p) { return +new Date(p[0]); }));
    var t1 = Math.max.apply(null, allPts.map(function (p) { return +new Date(p[0]); }));
    var v0 = opts.yMin !== undefined ? opts.yMin : 0;
    var v1 = opts.yMax !== undefined ? opts.yMax : Math.max.apply(null, allPts.map(function (p) { return p[1]; })) * 1.05;
    function X(d) { return padL + (W - padL - padR) * ((+new Date(d)) - t0) / (t1 - t0 || 1); }
    function Y(v) { return padT + (H - padT - padB) * (1 - (v - v0) / (v1 - v0 || 1)); }
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, class: "chart tall", role: "img", style: "height:" + H + "px" });
    for (var g = 0; g <= 4; g++) {
      var gv = v0 + (v1 - v0) * g / 4, gy = Y(gv);
      svg.appendChild(svgEl("line", { x1: padL, y1: gy, x2: W - padR + 130, y2: gy, stroke: LINE }));
      txt(svg, padL - 8, gy + 4, opts.yFmt ? opts.yFmt(gv) : fmt(Math.round(gv)), { "text-anchor": "end" });
    }
    var years = {};
    allPts.forEach(function (p) { years[p[0].slice(0, 4)] = true; });
    Object.keys(years).sort().forEach(function (y) {
      var approx = y + "-07-01";
      var x = X(approx);
      svg.appendChild(svgEl("line", { x1: x, y1: padT, x2: x, y2: H - padB, stroke: LINE, "stroke-dasharray": "2 3" }));
      txt(svg, x, H - padB + 16, y, { "text-anchor": "middle", "font-size": 10.5 });
    });
    txt(svg, (padL + W - padR) / 2, H - 6, opts.xLabel || "Date", { "text-anchor": "middle", "font-size": 11, fill: MUTED });
    series.forEach(function (s, i) {
      var color = s.color || PALETTE[i % PALETTE.length];
      var pts = s.points.slice().sort(function (a, b) { return a[0].localeCompare(b[0]); });
      var d = pts.map(function (p, j) { return (j ? "L" : "M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1); }).join(" ");
      svg.appendChild(svgEl("path", { d: d, fill: "none", stroke: color, "stroke-width": 1.8, "stroke-dasharray": s.dashed ? "5 3" : "none" }));
      pts.forEach(function (p) {
        svg.appendChild(svgEl("rect", { x: X(p[0]) - 2.6, y: Y(p[1]) - 2.6, width: 5.2, height: 5.2, fill: color }));
      });
    });
    var lx = W - padR + 8, ly = padT + 6;
    series.forEach(function (s, i) {
      var color = s.color || PALETTE[i % PALETTE.length];
      svg.appendChild(svgEl("line", { x1: lx, y1: ly + i * 17, x2: lx + 16, y2: ly + i * 17, stroke: color, "stroke-width": 2, "stroke-dasharray": s.dashed ? "4 2" : "none" }));
      var t = txt(svg, lx + 22, ly + i * 17 + 4, s.label, { "font-size": 10.5, fill: INK });
    });
    container.innerHTML = "";
    container.appendChild(svg);
  }

  /* Simple vertical bars (all-positive) for rankings like headcount / top layoffs. */
  function barChart(container, rows, opts) {
    opts = opts || {};
    var W = container.clientWidth || 900, H = opts.height || 300;
    var padL = 70, padR = 20, padT = 22, padB = 52;
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([1]));
    var bw = (W - padL - padR) / rows.length;
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, class: "chart", role: "img" });
    for (var g = 0; g <= 4; g++) {
      var y = padT + (H - padT - padB) * (1 - g / 4);
      svg.appendChild(svgEl("line", { x1: padL, y1: y, x2: W - padR, y2: y, stroke: LINE }));
      txt(svg, padL - 8, y + 4, fmt(Math.round(max * g / 4)), { "text-anchor": "end" });
    }
    rows.forEach(function (r, i) {
      var h = (H - padT - padB) * (r.value / max);
      var x = padL + i * bw + bw * 0.14, w = bw * 0.72, y = H - padB - h;
      svg.appendChild(svgEl("rect", { x: x, y: y, width: w, height: Math.max(h, 1.5), fill: r.color || PALETTE[i % PALETTE.length], rx: 2 }));
      txt(svg, x + w / 2, y - 6, fmt(r.value), { "text-anchor": "middle", fill: INK, "font-weight": 700, "font-size": 11.5 });
      txt(svg, x + w / 2, H - padB + 17, r.label, { "text-anchor": "middle", "font-size": 10.5 });
      if (r.label2) txt(svg, x + w / 2, H - padB + 31, r.label2, { "text-anchor": "middle", "font-size": 9.5 });
    });
    container.innerHTML = "";
    container.appendChild(svg);
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
    return '<header class="site"><div class="bar"><span class="brand">AI Workforce Tracker</span><nav>' + nav + "</nav></div></header>";
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
    barChart: barChart, lineChart: lineChart, eventsTable: eventsTable, companiesTable: companiesTable,
    badges: badges, sourceLinks: sourceLinks,
    PALETTE: PALETTE, LAYOFF_COLOR: LAYOFF_COLOR, HIRING_COLOR: HIRING_COLOR, AI_COLOR: AI_COLOR
  };
})();
