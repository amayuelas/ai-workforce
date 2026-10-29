/* AI Workforce Tracker — data loading, signed metrics, charts. No build step, no external deps. */
(function () {
  "use strict";

  var INK = "#1b1917", MUTED = "#6b6558", LINE = "#e6e1d5", GRAY = "#a39b8a";
  var RED = "#b23a2e", GREEN = "#1e7a40", VIOLET = "#6d4fc2";
  var LAYOFF_COLOR = RED, HIRING_COLOR = GREEN, AI_COLOR = VIOLET;
  /* Categorical identity colors, one fixed hue per public company (validated for CVD separation;
     yellow/aqua/magenta are low-contrast, so line charts always carry direct labels + a legend). */
  var COMPANY_COLORS = {
    alphabet: "#2a78d6", amazon: "#eb6834", apple: "#52514e", meta: "#1baf7a", microsoft: "#eda100",
    nvidia: "#008300", oracle: "#e34948", tesla: "#e87ba4", intel: "#6250d6"
  };
  var LAB_COLOR = INK;
  var YEAR_MS = 365.25 * 86400000;

  var _cache = {};
  function loadJSON(path) {
    if (_cache[path]) return _cache[path];
    _cache[path] = fetch(path, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("Failed to load " + path + " (" + r.status + ")");
      return r.json();
    });
    return _cache[path];
  }

  function fmt(n) {
    if (n === null || n === undefined) return "—";
    return Number(n).toLocaleString("en-US");
  }
  function fmtCompact(n) {
    var a = Math.abs(n);
    if (a >= 1e6) return (n / 1e6).toFixed(a % 1e6 ? 1 : 0) + "M";
    if (a >= 1e3) return (n / 1e3).toFixed(a % 1e3 ? 1 : 0) + "k";
    return String(Math.round(n));
  }

  /* Events logged for context but never summed: existing staff moved between teams, and group
     estimates overlapping per-company events. Mirrors NOT_COUNTED_KINDS in scripts/validate_data.py. */
  var NOT_COUNTED = { internal_redeployment: true, multi_company: true };
  function isCounted(ev) { return !NOT_COUNTED[ev.kind]; }
  /* Roles an event contributes to totals. Buyout offers count accepted departures (size), never the eligible pool. */
  function counted(ev) { return isCounted(ev) ? (ev.size || 0) : 0; }

  /* Signed value: layoffs negative, hirings positive. */
  function signed(ev) {
    var n = counted(ev);
    return ev.type === "layoff" ? -n : n;
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

  function companyColor(id) { return COMPANY_COLORS[id] || LAB_COLOR; }

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

  var KIND_LABEL = {
    buyout_offer: "buyout offer",
    internal_redeployment: "redeployment · not counted",
    multi_company: "multi-lab · not counted"
  };

  function badges(ev) {
    var out = [];
    out.push(ev.type === "layoff"
      ? '<span class="badge red">layoff</span>'
      : '<span class="badge green">hiring</span>');
    if (ev.kind) out.push('<span class="badge kind">' + KIND_LABEL[ev.kind] + "</span>");
    if (ev.ai_related) out.push('<span class="badge ai">AI</span>');
    if (ev.size_is_estimate && ev.size) out.push('<span class="badge est">est.</span>');
    out.push('<span class="badge conf-' + (ev.confidence || "medium") + '" title="source confidence">' + (ev.confidence || "medium") + " conf.</span>");
    return out.join(" ");
  }

  /* ---------- scales ---------- */
  function niceStep(range, n) {
    var raw = range / (n || 4), mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  }
  function niceTicks(lo, hi, n) {
    var step = niceStep((hi - lo) || 1, n), out = [];
    var start = Math.floor(lo / step + 1e-9) * step, end = Math.ceil(hi / step - 1e-9) * step;
    for (var v = start; v <= end + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
    return out;
  }
  /* 1-2-5 ticks for a log axis, restricted to [lo, hi] (raw values). */
  function logTicks(lo, hi) {
    var out = [];
    for (var e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
      [1, 2, 5].forEach(function (m) {
        var v = m * Math.pow(10, e);
        if (v >= lo / 1.0001 && v <= hi * 1.0001) out.push(v);
      });
    }
    return out;
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

  /* Shared HTML tooltip for SVG hover (native <title> is unreliable on SVG in some browsers).
     Bound once per container; re-renders just re-attach the same tip element. */
  function bindTooltip(container) {
    if (container._tip) { container.appendChild(container._tip); return; }
    var tip = document.createElement("div");
    tip.className = "svg-tip";
    tip.style.display = "none";
    container.style.position = "relative";
    container.appendChild(tip);
    container._tip = tip;
    container.addEventListener("mousemove", function (ev) {
      var el = ev.target && ev.target.getAttribute ? ev.target : null;
      var d = el && el.getAttribute("data-tip");
      if (d) {
        tip.textContent = d;
        tip.style.display = "block";
        var r = container.getBoundingClientRect();
        tip.style.left = Math.max(0, Math.min(ev.clientX - r.left + 12, r.width - 250)) + "px";
        tip.style.top = (ev.clientY - r.top + 14) + "px";
      } else {
        tip.style.display = "none";
      }
    });
    container.addEventListener("mouseleave", function () { tip.style.display = "none"; });
  }

  /* Diverging bar chart: negative (layoffs) down, positive (hirings) up.
     Rows sharing a `group` key are drawn side by side under one label. */
  function signedBarChart(container, rows, opts) {
    opts = opts || {};
    rows = (rows || []).filter(function (r) { return r && isFinite(r.value); });
    if (!rows.length) { container.innerHTML = '<p class="muted small">No data.</p>'; return; }
    var groups = [], byGroup = {};
    rows.forEach(function (r, i) {
      var g = r.group !== undefined ? r.group : "_" + i;
      if (!byGroup[g]) { byGroup[g] = []; groups.push(g); }
      byGroup[g].push(r);
    });
    var W = container.clientWidth || 900, H = opts.height || 300;
    var narrow = W < 600;
    var padL = narrow ? 44 : 64, padR = narrow ? 8 : 20, padT = 20;
    var bw = (W - padL - padR) / groups.length;
    var longest = Math.max.apply(null, groups.map(function (g) { return String(byGroup[g][0].groupLabel || byGroup[g][0].label || "").length; }));
    var many = longest * 6.4 > bw - 6; /* stagger labels onto two rows only when they would collide */
    var padB = many ? 52 : 38;
    /* each side gets only the room its own data needs (one-sided data uses the full height) */
    var maxPos = 0, maxNeg = 0;
    rows.forEach(function (r) { maxPos = Math.max(maxPos, r.value); maxNeg = Math.max(maxNeg, -r.value); });
    var step = niceStep(Math.max(maxPos + maxNeg, 1), 6);
    var lo = -Math.ceil(maxNeg / step - 1e-9) * step, hi = Math.ceil(maxPos / step - 1e-9) * step;
    if (hi === lo) hi = step;
    var plotH = H - padT - padB;
    function Y(v) { return padT + plotH * (hi - v) / (hi - lo); }
    var zeroY = Y(0);
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, class: "chart", role: "img", style: "height:" + H + "px" });
    if (opts.ariaLabel) svg.setAttribute("aria-label", opts.ariaLabel);
    for (var v = lo; v <= hi + step / 2; v = Math.round((v + step) * 1e6) / 1e6) {
      var y = Y(v);
      svg.appendChild(svgEl("line", { x1: padL, y1: y, x2: W - padR, y2: y, stroke: LINE, "stroke-width": 1 }));
      txt(svg, padL - 8, y + 4, (v > 0 ? "+" : v < 0 ? "−" : "") + fmtCompact(Math.abs(v)), { "text-anchor": "end", "font-size": 10.5 });
    }
    svg.appendChild(svgEl("line", { x1: padL, y1: zeroY, x2: W - padR, y2: zeroY, stroke: INK, "stroke-width": 1.4 }));
    groups.forEach(function (g, gi) {
      var members = byGroup[g];
      var inner = bw * (members.length > 1 ? 0.8 : 0.64);
      var w = inner / members.length - (members.length > 1 ? 2 : 0);
      members.forEach(function (r, k) {
        var x = padL + gi * bw + (bw - inner) / 2 + k * (w + (members.length > 1 ? 2 : 0));
        var h = Math.abs(r.value) / (hi - lo) * plotH;
        var y = r.value >= 0 ? zeroY - h : zeroY;
        var col = r.color || (r.value >= 0 ? HIRING_COLOR : LAYOFF_COLOR);
        var bar = svgEl("rect", { x: x, y: y, width: Math.max(w, 1), height: Math.max(h, 1.5), fill: col, rx: 2 });
        bar.setAttribute("data-tip", r.tip || ((r.label ? r.label + " · " : "") + fmtSigned(r.value) + (r.label2 ? " · " + r.label2 : "")));
        svg.appendChild(bar);
        var label = r.valueLabel !== undefined ? r.valueLabel : r.value ? fmtSigned(r.value) : "";
        var fits = h > 24 && w > label.length * 6.2;
        if (fits) {
          txt(svg, x + w / 2, r.value >= 0 ? y + 15 : y + h - 7, label, {
            "text-anchor": "middle", fill: "#fbfaf6", "font-weight": 700, "font-size": 10.5
          });
        } else if (w > label.length * 5.2 || members.length === 1) {
          var ly = r.value >= 0 ? y - 5 : y + h + 13;
          txt(svg, x + w / 2, ly, label, { "text-anchor": "middle", fill: INK, "font-weight": 700, "font-size": 10.5 });
        }
      });
      var head = members[0], lx = padL + gi * bw + bw / 2;
      var glabel = head.groupLabel || head.label;
      if (many) {
        var row = gi % 2;
        txt(svg, lx, H - padB + 16 + row * 14, glabel, { "text-anchor": "middle", "font-size": 10, fill: INK });
      } else {
        txt(svg, lx, H - padB + 18, glabel, { "text-anchor": "middle", "font-size": 11, fill: INK });
        if (head.label2) txt(svg, lx, H - padB + 31, head.label2, { "text-anchor": "middle", "font-size": 9.5 });
      }
    });
    container.innerHTML = "";
    container.appendChild(svg);
    bindTooltip(container);
  }

  function quarterOf(date) {
    return date.slice(0, 4) + "-Q" + Math.ceil(parseInt(date.slice(5, 7), 10) / 3);
  }
  /* Every quarter from the first to the last key, so empty quarters stay visible on the time axis. */
  function quarterRange(keys) {
    if (!keys.length) return [];
    keys = keys.slice().sort();
    var y = +keys[0].slice(0, 4), q = +keys[0].slice(6), out = [];
    var last = keys[keys.length - 1];
    while (true) {
      var k = y + "-Q" + q;
      out.push(k);
      if (k >= last) break;
      if (++q > 4) { q = 1; y++; }
    }
    return out;
  }

  /* Horizontal diverging bars per quarter: layoffs (left of zero) vs hirings (right of zero). */
  function netFlowChart(container, events, opts) {
    opts = opts || {};
    var byQ = {};
    events.forEach(function (e) {
      var n = counted(e);
      if (!n) return;
      var q = quarterOf(e.date);
      byQ[q] = byQ[q] || { lay: 0, hir: 0 };
      if (e.type === "layoff") byQ[q].lay += n; else byQ[q].hir += n;
    });
    var keys = quarterRange(Object.keys(byQ));
    var W = container.clientWidth || 900, rowH = opts.rowH || 30, padL = 70, padR = 20, padT = 22;
    var H = padT + keys.length * rowH + 8;
    var maxAbs = 1;
    keys.forEach(function (q) { if (byQ[q]) maxAbs = Math.max(maxAbs, byQ[q].lay, byQ[q].hir); });
    /* layoffs dwarf announced hiring; give each side room proportional to its own maximum */
    var maxLay = 1, maxHir = 1;
    keys.forEach(function (q) { if (byQ[q]) { maxLay = Math.max(maxLay, byQ[q].lay); maxHir = Math.max(maxHir, byQ[q].hir); } });
    var plotW = W - padL - padR;
    var scale = plotW / (maxLay + maxHir) * 0.86;
    var midX = padL + maxLay * scale + plotW * 0.07;
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, class: "chart", style: "height:" + H + "px", role: "img" });
    svg.appendChild(svgEl("line", { x1: midX, y1: padT - 6, x2: midX, y2: H - 4, stroke: INK, "stroke-width": 1.2 }));
    txt(svg, midX - 8, padT - 8, "← layoffs", { "text-anchor": "end", fill: INK, "font-weight": 700, "font-size": 11 });
    txt(svg, midX + 8, padT - 8, "hirings →", { "text-anchor": "start", fill: INK, "font-weight": 700, "font-size": 11 });
    keys.forEach(function (q, i) {
      var y = padT + i * rowH + rowH / 2;
      var d = byQ[q] || { lay: 0, hir: 0 };
      if (q.slice(5) === "Q1") svg.appendChild(svgEl("line", { x1: padL - 60, y1: y - rowH / 2, x2: W - padR, y2: y - rowH / 2, stroke: LINE }));
      txt(svg, padL - 10, y + 4, q, { "text-anchor": "end", fill: d.lay || d.hir ? INK : GRAY, "font-weight": 600, "font-size": 10.5 });
      var lw = d.lay * scale, hw = d.hir * scale;
      if (lw > 0) {
        var rl = svgEl("rect", { x: midX - lw, y: y - 8, width: lw, height: 16, fill: LAYOFF_COLOR, rx: 2 });
        rl.setAttribute("data-tip", q + " · layoffs −" + fmt(d.lay));
        svg.appendChild(rl);
        if (lw > 52) txt(svg, midX - lw + 5, y + 4, "−" + fmt(d.lay), { fill: "#fbfaf6", "font-size": 10, "font-weight": 700 });
        else txt(svg, midX - lw - 5, y + 4, "−" + fmt(d.lay), { "text-anchor": "end", fill: INK, "font-size": 10, "font-weight": 600 });
      }
      if (hw > 0) {
        var rh = svgEl("rect", { x: midX, y: y - 8, width: hw, height: 16, fill: HIRING_COLOR, rx: 2 });
        rh.setAttribute("data-tip", q + " · hirings +" + fmt(d.hir));
        svg.appendChild(rh);
        if (hw > 52) txt(svg, midX + hw - 5, y + 4, "+" + fmt(d.hir), { "text-anchor": "end", fill: "#fbfaf6", "font-size": 10, "font-weight": 700 });
        else txt(svg, midX + hw + 5, y + 4, "+" + fmt(d.hir), { "text-anchor": "start", fill: INK, "font-size": 10, "font-weight": 600 });
      }
    });
    container.innerHTML = "";
    container.appendChild(svg);
    bindTooltip(container);
  }

  /* Multi-series line chart: x = date, y = value. Direct end labels in a right gutter (leader lines),
     legend below, hover/click a series (line, label or legend) to emphasise it.
     opts: height, log (y on log10 scale, values raw), yTicks, yFmt, zeroLine, refLine, xLabel, yLabel. */
  function lineChart(container, series, opts) {
    opts = opts || {};
    series = (series || []).filter(function (s) { return s.points && s.points.length; });
    var W = container.clientWidth || 900, H = opts.height || 380;
    var narrow = W < 640;
    var padL = narrow ? 44 : 56, padR = narrow ? 10 : 150, padT = 12, padB = 36;
    var allPts = [];
    series.forEach(function (s) { s.points.forEach(function (p) { allPts.push(p); }); });
    if (!allPts.length) { container.textContent = "No data"; return; }
    var ts = allPts.map(function (p) { return +new Date(p[0]); });
    var y0 = new Date(Math.min.apply(null, ts)).getUTCFullYear();
    var t0 = Date.UTC(y0, 0, 1), t1 = Math.max.apply(null, ts) + 30 * 86400000;
    var f = opts.log ? function (v) { return Math.log10(v); } : function (v) { return v; };
    var vals = allPts.map(function (p) { return p[1]; });
    var vmin = Math.min.apply(null, vals), vmax = Math.max.apply(null, vals);
    var ticks = opts.yTicks;
    if (!ticks) {
      if (opts.log) ticks = logTicks(vmin, vmax);
      else if (opts.zeroLine) ticks = niceTicks(Math.min(0, vmin), Math.max(0, vmax), 6);
      else ticks = niceTicks(Math.min(0, vmin), vmax, 5);
    }
    var v0 = f(Math.min(ticks[0], vmin)), v1 = f(Math.max(ticks[ticks.length - 1], vmax));
    if (opts.log) { var padLog = (v1 - v0) * 0.04; v0 -= padLog; v1 += padLog; }
    function X(d) { return padL + (W - padL - padR) * ((+new Date(d)) - t0) / (t1 - t0); }
    function Y(v) { return padT + (H - padT - padB) * (1 - (f(v) - v0) / (v1 - v0 || 1)); }
    var yFmt = opts.yFmt || function (v) { return fmt(Math.round(v)); };
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, class: "chart", role: "img", style: "height:" + H + "px" });
    if (opts.ariaLabel) svg.setAttribute("aria-label", opts.ariaLabel);
    ticks.forEach(function (tv) {
      var gy = Y(tv);
      if (gy < padT - 1 || gy > H - padB + 1) return;
      svg.appendChild(svgEl("line", { x1: padL, y1: gy, x2: W - padR, y2: gy, stroke: LINE }));
      txt(svg, padL - 7, gy + 4, yFmt(tv), { "text-anchor": "end", "font-size": 10.5 });
    });
    if (opts.zeroLine) svg.appendChild(svgEl("line", { x1: padL, y1: Y(0), x2: W - padR, y2: Y(0), stroke: INK, "stroke-width": 1.3 }));
    if (opts.refLine !== undefined) svg.appendChild(svgEl("line", { x1: padL, y1: Y(opts.refLine), x2: W - padR, y2: Y(opts.refLine), stroke: INK, "stroke-width": 1, "stroke-dasharray": "4 3" }));
    var yEnd = new Date(t1).getUTCFullYear();
    for (var yr = y0; yr <= yEnd; yr++) {
      var x = X(yr + "-01-01");
      svg.appendChild(svgEl("line", { x1: x, y1: padT, x2: x, y2: H - padB, stroke: LINE, "stroke-dasharray": "2 3" }));
      if (!narrow || yr % 2 === 0) txt(svg, x, H - padB + 15, String(yr), { "text-anchor": "middle", "font-size": 10.5 });
    }
    txt(svg, (padL + W - padR) / 2, H - 5, opts.xLabel || "Date", { "text-anchor": "middle", "font-size": 11, fill: MUTED });
    if (opts.yLabel) txt(svg, padL - 4, padT - 2, opts.yLabel, { "text-anchor": "start", "font-size": 10, fill: MUTED });

    var groups = [];
    series.forEach(function (s, i) {
      var color = s.color || INK;
      var g = svgEl("g", { "data-s": i, class: "series" });
      var pts = s.points.slice().sort(function (a, b) { return a[0].localeCompare(b[0]); });
      var d = pts.map(function (p, j) { return (j ? "L" : "M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1); }).join(" ");
      if (pts.length > 1) {
        g.appendChild(svgEl("path", { d: d, fill: "none", stroke: color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-dasharray": s.dashed ? "5 3" : "none" }));
        g.appendChild(svgEl("path", { d: d, fill: "none", stroke: "transparent", "stroke-width": 10, "data-s": i }));
      }
      pts.forEach(function (p) {
        var mk = s.dashed || pts.length === 1
          ? svgEl("circle", { cx: X(p[0]), cy: Y(p[1]), r: 4.2, fill: "#fbfaf6", stroke: color, "stroke-width": 2, "data-s": i })
          : svgEl("rect", { x: X(p[0]) - 3, y: Y(p[1]) - 3, width: 6, height: 6, fill: color, "data-s": i });
        mk.setAttribute("data-tip", s.label + " · " + p[0] + " · " + yFmt(p[1]) + (p[2] ? " · " + p[2] : ""));
        g.appendChild(mk);
      });
      svg.appendChild(g);
      var last = pts[pts.length - 1];
      groups.push({ i: i, g: g, label: s.endLabel || s.label, color: color, x: X(last[0]), y: Y(last[1]), ly: Y(last[1]) });
    });
    /* direct end labels: stack in the right gutter, nudged apart so none overlap */
    if (!narrow) {
      var gap = 12.5, top = padT + 4, bottom = H - padB;
      var lab = groups.slice().sort(function (a, b) { return a.ly - b.ly; });
      lab.forEach(function (l, k) { if (k && l.ly < lab[k - 1].ly + gap) l.ly = lab[k - 1].ly + gap; });
      var overflow = lab.length ? lab[lab.length - 1].ly - bottom : 0;
      if (overflow > 0) lab.forEach(function (l) { l.ly -= overflow; });
      lab.forEach(function (l, k) { if (k && l.ly < lab[k - 1].ly + gap) l.ly = lab[k - 1].ly + gap; if (l.ly < top) l.ly = top; });
      var lx = W - padR + 14;
      lab.forEach(function (l) {
        l.g.appendChild(svgEl("path", { d: "M" + (l.x + 5) + " " + l.y + " L" + (lx - 4) + " " + l.ly, stroke: l.color, "stroke-width": 0.8, fill: "none", opacity: 0.6 }));
        var t = txt(l.g, lx, l.ly + 3.5, l.label, { fill: INK, "font-size": 10.5, "font-weight": 600, "data-s": l.i });
        t.style.cursor = "pointer";
      });
    }
    container.innerHTML = "";
    container.appendChild(svg);
    var leg = document.createElement("div");
    leg.className = "chart-legend";
    series.forEach(function (s, i) {
      var color = s.color || INK;
      var item = document.createElement("button");
      item.type = "button";
      item.className = "lg-item";
      item.setAttribute("data-s", i);
      item.innerHTML = '<i style="background:' + color + (s.dashed ? ";height:0;border-top:2px dashed " + color : "") + '"></i>' + esc(s.label);
      leg.appendChild(item);
    });
    container.appendChild(leg);

    /* emphasis: hover previews, click pins (click again or elsewhere to clear) */
    var pinned = null;
    function focus(idx) {
      groups.forEach(function (gr) {
        gr.g.style.opacity = idx === null || String(gr.i) === String(idx) ? 1 : 0.12;
        if (String(gr.i) === String(idx)) svg.appendChild(gr.g);
      });
      Array.prototype.forEach.call(leg.children, function (b) {
        b.classList.toggle("dim", idx !== null && b.getAttribute("data-s") !== String(idx));
      });
    }
    function sIdx(ev) {
      var el = ev.target;
      while (el && el !== container) {
        if (el.getAttribute && el.getAttribute("data-s") !== null) return el.getAttribute("data-s");
        el = el.parentNode;
      }
      return null;
    }
    container.onmouseover = function (ev) { var k = sIdx(ev); focus(k !== null ? k : pinned); };
    container.onmouseleave = function () { focus(pinned); };
    container.onclick = function (ev) { var k = sIdx(ev); pinned = k === pinned ? null : k; focus(pinned); };
    bindTooltip(container);
  }

  /* Event scatter timeline: x = date, y = company row, area ~ roles.
     Hollow dashed = buyout offer (sized by eligible pool) or a not-counted event; violet ring = AI-attributed layoff. */
  function eventScatter(container, companies, events, type) {
    var evs = (events || []).filter(function (e) { return !type || e.type === type; });
    if (!evs.length) { container.innerHTML = '<p class="muted small">No events.</p>'; return; }
    function colorOf(e) { return e.type === "layoff" ? LAYOFF_COLOR : HIRING_COLOR; }
    function mag(e) { return e.kind === "buyout_offer" ? (e.eligible || 0) : (e.size || 0); }
    var ids = [];
    companies.forEach(function (c) { if (evs.some(function (e) { return e.company === c.id; })) ids.push(c.id); });
    var byCo = {};
    evs.forEach(function (e) { (byCo[e.company] = byCo[e.company] || []).push(e); });
    var W = container.clientWidth || 900, narrow = W < 600;
    var rowH = 28, padL = narrow ? 92 : 140, padR = 24, padT = 14, padB = 30;
    var H = padT + ids.length * rowH + padB;
    var minY = new Date(Math.min.apply(null, evs.map(function (e) { return +new Date(e.date); }))).getUTCFullYear();
    var t0 = Date.UTC(minY, 0, 1);
    var t1 = Math.max.apply(null, evs.map(function (e) { return +new Date(e.date); })) + 86400000 * 75;
    function X(d) { return padL + (W - padL - padR) * ((+new Date(d)) - t0) / (t1 - t0); }
    var maxSize = Math.max.apply(null, evs.map(mag).concat([1]));
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, class: "chart", style: "height:" + H + "px", role: "img" });
    for (var y = minY; y <= new Date(t1).getUTCFullYear(); y++) {
      var x = X(y + "-01-01");
      svg.appendChild(svgEl("line", { x1: x, y1: padT - 6, x2: x, y2: H - padB, stroke: LINE, "stroke-dasharray": "2 3" }));
      if (x < W - padR - 24) txt(svg, x + 4, H - padB + 15, String(y), { "text-anchor": "start", "font-size": 10.5 });
    }
    ids.forEach(function (id, i) {
      var yy = padT + i * rowH + rowH / 2;
      txt(svg, padL - 10, yy + 4, companyName(companies, id), { "text-anchor": "end", fill: INK, "font-weight": 600, "font-size": narrow ? 10 : 11 });
      svg.appendChild(svgEl("line", { x1: padL, y1: yy, x2: W - padR, y2: yy, stroke: LINE, "stroke-width": 0.5 }));
      byCo[id].slice().sort(function (a, b) { return mag(b) - mag(a); }).forEach(function (e) {
        var hollow = e.kind === "buyout_offer" || !isCounted(e);
        var r = mag(e) ? 3.5 + 11 * Math.sqrt(mag(e) / maxSize) : 3.5;
        var c = svgEl("circle", {
          cx: X(e.date), cy: yy, r: r,
          fill: hollow ? "none" : colorOf(e), "fill-opacity": 0.7,
          stroke: e.ai_related && e.type === "layoff" ? AI_COLOR : colorOf(e),
          "stroke-width": e.ai_related && e.type === "layoff" ? 2 : 1.4,
          "stroke-dasharray": hollow ? "3 2" : "none",
          "pointer-events": "all"
        });
        c.setAttribute("class", "bubble");
        var what = e.kind === "buyout_offer"
          ? "buyout offer to " + fmt(e.eligible) + (e.size ? " · ~" + fmt(e.size) + " accepted (counted)" : " · acceptances not yet known")
          : (e.size ? fmtSigned(e.type === "layoff" ? -e.size : e.size) : "not quantified") + (isCounted(e) ? "" : " · not counted (" + KIND_LABEL[e.kind] + ")");
        c.setAttribute("data-tip", e.date + " · " + companyName(companies, id) + " · " + what + (e.ai_related ? " · AI" : "") + " · " + (e.confidence || "") + " conf.");
        svg.appendChild(c);
      });
    });
    container.innerHTML = "";
    container.appendChild(svg);
    bindTooltip(container);
  }

  /* ---------- headcount metrics ---------- */
  function byCompanySorted(headcount) {
    var byCo = {};
    headcount.forEach(function (s) { (byCo[s.company] = byCo[s.company] || []).push(s); });
    Object.keys(byCo).forEach(function (k) { byCo[k].sort(function (a, b) { return a.as_of.localeCompare(b.as_of); }); });
    return byCo;
  }
  function yearsBetween(a, b) { return (+new Date(b.as_of) - +new Date(a.as_of)) / YEAR_MS; }
  /* Index of the snapshot ~1 year before pts[i] (fiscal years run 52/53 weeks), or -1. */
  function yearAgo(pts, i) {
    for (var j = i - 1; j >= 0; j--) {
      var dt = yearsBetween(pts[j], pts[i]);
      if (dt > 1.1) break;
      if (dt >= 0.9) return j;
    }
    return -1;
  }
  /* Latest pair of snapshots one fiscal year apart (skips trailing quarterly points with no year-ago match). */
  function latestAnnualPair(pts) {
    for (var i = pts.length - 1; i > 0; i--) {
      var j = yearAgo(pts, i);
      if (j >= 0) return [pts[j], pts[i]];
    }
    return null;
  }
  function seriesLabel(companies, c) { return companyName(companies, c.id) + (c.ticker ? " " + c.ticker : ""); }
  function shortLabel(c) { return c.ticker || c.name; }

  /* YoY % change per company, each point vs the snapshot one year earlier. */
  function yoySeries(companies, headcount) {
    var byCo = byCompanySorted(headcount);
    return companies.map(function (c) {
      var pts = byCo[c.id] || [], out = [];
      for (var i = 1; i < pts.length; i++) {
        var j = yearAgo(pts, i);
        if (j >= 0) out.push([pts[i].as_of, (pts[i].employees / pts[j].employees - 1) * 100, fmt(pts[j].employees) + " → " + fmt(pts[i].employees)]);
      }
      return { id: c.id, label: seriesLabel(companies, c), endLabel: shortLabel(c), points: out, color: companyColor(c.id) };
    }).filter(function (s) { return s.points.length >= 2; });
  }

  /* Indexed headcount (first reported point = 100): comparable across companies of different sizes. */
  function indexedSeries(companies, headcount) {
    var byCo = byCompanySorted(headcount);
    return companies.map(function (c) {
      var pts = byCo[c.id] || [];
      if (pts.length < 2) return null; /* single-snapshot labs can't be indexed */
      var base = pts[0].employees;
      return {
        id: c.id, label: seriesLabel(companies, c), endLabel: shortLabel(c), color: companyColor(c.id),
        points: pts.map(function (p) { return [p.as_of, p.employees / base * 100, fmt(p.employees) + " employees"]; }),
        dashed: pts.some(function (p) { return p.is_estimate; })
      };
    }).filter(Boolean);
  }

  /* Absolute headcount per company (labs included as single dated estimates). */
  function levelSeries(companies, headcount) {
    var byCo = byCompanySorted(headcount);
    return companies.map(function (c) {
      var pts = byCo[c.id] || [];
      return {
        id: c.id, label: seriesLabel(companies, c), endLabel: shortLabel(c), color: companyColor(c.id),
        dashed: pts.some(function (p) { return p.is_estimate; }),
        points: pts.map(function (p) { return [p.as_of, p.employees, p.is_estimate ? "estimate" : ""]; })
      };
    }).filter(function (s) { return s.points.length; });
  }

  /* Implied gross hiring per company over its latest fiscal year = net headcount change + layoffs counted in
     that same window (prev.as_of, last.as_of]. A negative result means the headcount fell by more than the
     announced layoffs explain (attrition or unannounced cuts). */
  function impliedHiring(companies, headcount, events) {
    var byCo = byCompanySorted(headcount);
    var rows = [];
    companies.forEach(function (c) {
      var pair = latestAnnualPair(byCo[c.id] || []);
      if (!pair) return;
      var prev = pair[0], last = pair[1];
      var inWindow = events.filter(function (e) {
        return e.type === "layoff" && e.company === c.id && counted(e) && e.date > prev.as_of && e.date <= last.as_of;
      });
      var layoffs = inWindow.reduce(function (a, e) { return a + counted(e); }, 0);
      var net = last.employees - prev.employees;
      rows.push({
        company: c.id,
        label: seriesLabel(companies, c), short: shortLabel(c),
        announcedLayoffs: layoffs,
        impliedGrossHiring: net + layoffs,
        netChange: net,
        from: prev.as_of, to: last.as_of,
        period: "FY" + last.as_of.slice(0, 4) + " (" + prev.as_of + " → " + last.as_of + ")"
      });
    });
    return rows.sort(function (a, b) { return b.impliedGrossHiring - a.impliedGrossHiring; });
  }

  /* Latest fiscal-year net headcount change per company, derived from the headcount series (signed). */
  function netHeadcountChange(companies, headcount) {
    var byCo = byCompanySorted(headcount);
    var rows = [];
    companies.forEach(function (c) {
      var pair = latestAnnualPair(byCo[c.id] || []);
      if (!pair) return;
      var prev = pair[0], last = pair[1];
      var value = last.employees - prev.employees;
      rows.push({
        company: c.id, label: seriesLabel(companies, c), short: shortLabel(c),
        value: value, pct: value / prev.employees * 100, from: prev.as_of, as_of: last.as_of,
        prevEmployees: prev.employees, employees: last.employees, est: last.is_estimate
      });
    });
    return rows.sort(function (a, b) { return a.value - b.value; });
  }

  /* Bar rows for a net-change chart (shared by all three benches). */
  function netChangeRows(nhc) {
    return nhc.map(function (r) {
      return {
        label: r.short, label2: "FY" + r.as_of.slice(0, 4), value: r.value,
        tip: r.label + " · " + fmtSigned(r.value) + " (" + (r.pct > 0 ? "+" : "") + r.pct.toFixed(1) + "%) · " +
          fmt(r.prevEmployees) + " (" + r.from + ") → " + fmt(r.employees) + " (" + r.as_of + ")"
      };
    });
  }

  /* ---------- tables ---------- */
  function sizeCell(e) {
    if (e.kind === "buyout_offer") {
      return (e.size ? '<span class="neg">' + fmtSigned(-e.size) + "</span> " : "") +
        '<span class="muted">' + (e.size ? "of " : "offered to ") + fmt(e.eligible) + "</span>";
    }
    if (!e.size) return "—";
    var v = e.type === "layoff" ? -e.size : e.size;
    if (!isCounted(e)) return '<span class="muted" title="shown for context, not counted in totals">' + fmtSigned(v) + "</span>";
    return '<span class="' + (v < 0 ? "neg" : "pos") + '">' + fmtSigned(v) + "</span>" +
      (e.percent_of_workforce ? ' <span class="muted">' + e.percent_of_workforce + "%</span>" : "");
  }

  function eventsTable(tbody, companies, events, type) {
    var rows = events.filter(function (e) { return !type || e.type === type; })
      .sort(function (a, b) { return b.date.localeCompare(a.date); });
    tbody.innerHTML = rows.length ? rows.map(function (e) {
      return "<tr>" +
        "<td class='num'>" + esc(e.date) + (e.announced && e.announced !== e.date ? '<br><span class="muted small" title="announcement date">ann. ' + esc(e.announced) + "</span>" : "") + "</td>" +
        "<td><strong>" + esc(companyName(companies, e.company)) + "</strong></td>" +
        "<td>" + badges(e) + "</td>" +
        '<td class="num">' + sizeCell(e) + "</td>" +
        "<td class='small'>" + esc(e.scope) + "<br><span class='muted'>" + esc(e.reason) + "</span></td>" +
        "<td>" + sourceLinks(e) + "</td>" +
        "</tr>";
    }).join("") : '<tr><td colspan="6" class="muted small">No events match these filters.</td></tr>';
    return rows;
  }

  function latestSnapshots(headcount) {
    var latest = {};
    headcount.forEach(function (s) {
      if (!latest[s.company] || s.as_of > latest[s.company].as_of) latest[s.company] = s;
    });
    return latest;
  }

  function companiesTable(tbody, companies, headcount) {
    var latest = latestSnapshots(headcount);
    tbody.innerHTML = companies.map(function (c) {
      var hc = latest[c.id];
      return "<tr>" +
        "<td><strong>" + esc(c.name) + "</strong>" + (c.ticker ? ' <span class="muted small mono">' + esc(c.ticker) + "</span>" : "") + "</td>" +
        "<td><span class='badge'>" + esc(c.type) + "</span></td>" +
        "<td class='small'>" + esc(c.segment) + "</td>" +
        '<td class="num">' + (hc ? fmt(hc.employees) + (hc.is_estimate ? ' <span class="badge est">est.</span>' : "") + '<br><span class="muted small">' + esc(hc.as_of) + "</span>" : "—") + "</td>" +
        "<td class='small muted'>" + esc(c.selection_reason) + "</td>" +
        "</tr>";
    }).join("");
  }

  /* Coverage table: our counted layoff totals vs external trackers, per company. */
  function coverageTable(tbody, companies, events, coverage) {
    var sums = {};
    events.forEach(function (e) {
      if (e.type === "layoff" && counted(e)) sums[e.company] = (sums[e.company] || 0) + counted(e);
    });
    tbody.innerHTML = coverage.map(function (r) {
      var name = r.company === "industry" ? "All 14 tracked companies" : companyName(companies, r.company);
      var ours = r.company === "industry" ? Object.keys(sums).reduce(function (a, k) { return a + sums[k]; }, 0) : (sums[r.company] || 0);
      return "<tr><td><strong>" + esc(name) + "</strong></td>" +
        '<td class="num">−' + fmt(ours) + "</td>" +
        "<td class='small'>" + esc(r.external) + "</td>" +
        '<td><a href="' + esc(r.external_url) + '" target="_blank" rel="noopener noreferrer">source</a></td>' +
        "<td class='small muted'>" + esc(r.note) + "</td></tr>";
    }).join("");
  }

  function statline(el, items) {
    el.innerHTML = items.map(function (k) {
      return '<div class="stat"><div class="v ' + k.cls + '">' + k.value + '</div><div class="l">' + k.label + '</div><div class="h">' + k.hint + "</div></div>";
    }).join("");
  }

  /* ---------- chrome ---------- */
  function header(active) {
    var pages = [["index.html", "WorkforceBench"], ["layoffs.html", "LayoffsBench"], ["hirings.html", "HiringsBench"], ["methodology.html", "Methodology"]];
    var nav = pages.map(function (p) {
      return '<a href="' + p[0] + '"' + (p[1] === active ? ' class="active" aria-current="page"' : "") + ">" + p[1] + "</a>";
    }).join("");
    return '<header class="site"><div class="bar"><a class="brand" href="index.html">AI Workforce Tracker<small>Layoffs &amp; hirings · tech &amp; AI labs</small></a><nav>' + nav + "</nav></div></header>";
  }

  function footer(updated) {
    return '<footer class="site">' +
      "<span>Data last updated " + esc(updated) + ". Every event links to its sources in " +
      '<a href="https://github.com/amayuelas/ai-workforce/tree/main/data">data/</a>. ' +
      "Layoffs are counted negative, hirings positive; announced figures, not realized separations.</span>" +
      '<span><a href="methodology.html">Methodology &amp; coverage</a> · <a href="https://github.com/amayuelas/ai-workforce">GitHub</a> · CC BY 4.0</span></footer>';
  }

  function loadAll() {
    return Promise.all([
      loadJSON("data/companies.json"),
      loadJSON("data/events.json"),
      loadJSON("data/headcount.json"),
      loadJSON("data/coverage.json")
    ]).then(function (r) {
      return { companies: r[0].companies, events: r[1].events, headcount: r[2].snapshots, coverage: r[3].rows, updated: r[1].updated };
    }).catch(function (err) {
      var main = document.querySelector("main");
      if (main) main.insertAdjacentHTML("afterbegin", '<p class="load-error">Could not load the data files (' + esc(err.message) +
        "). If you opened this file directly, serve the folder instead: <code>python3 -m http.server</code>.</p>");
      throw err;
    });
  }

  /* Redraw charts on resize (they are measured in px at render time). */
  function onResize(fn) {
    var w = window.innerWidth, t;
    window.addEventListener("resize", function () {
      clearTimeout(t);
      t = setTimeout(function () { if (window.innerWidth !== w) { w = window.innerWidth; fn(); } }, 150);
    });
  }

  window.AIW = {
    loadAll: loadAll, header: header, footer: footer, statline: statline, onResize: onResize,
    fmt: fmt, fmtCompact: fmtCompact, fmtSigned: fmtSigned, signed: signed, counted: counted, isCounted: isCounted, esc: esc,
    companyName: companyName, companyTicker: companyTicker, companyColor: companyColor, quarterOf: quarterOf, quarterRange: quarterRange,
    signedBarChart: signedBarChart, netFlowChart: netFlowChart,
    lineChart: lineChart, eventScatter: eventScatter, netHeadcountChange: netHeadcountChange, netChangeRows: netChangeRows,
    yoySeries: yoySeries, indexedSeries: indexedSeries, levelSeries: levelSeries, impliedHiring: impliedHiring,
    latestSnapshots: latestSnapshots,
    eventsTable: eventsTable, companiesTable: companiesTable, coverageTable: coverageTable,
    badges: badges, sourceLinks: sourceLinks,
    LAYOFF_COLOR: LAYOFF_COLOR, HIRING_COLOR: HIRING_COLOR, AI_COLOR: AI_COLOR, GRAY: GRAY
  };
})();
