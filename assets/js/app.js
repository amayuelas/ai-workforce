/* AI Workforce Tracker — data loading, rendering, charts. No build step, no external deps. */
(function () {
  "use strict";

  var PALETTE = ["#58a6ff", "#f85149", "#3fb950", "#d29922", "#a371f7", "#39c5cf", "#ff7b72", "#79c0ff", "#ffa657", "#7ee787", "#e3b341", "#f778ba", "#8ddb8c", "#6e7681"];
  var LAYOFF_COLOR = "#f85149";
  var HIRING_COLOR = "#3fb950";
  var AI_COLOR = "#a371f7";

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

  function fmtSigned(n) {
    return (n >= 0 ? "+" : "") + fmt(n);
  }

  function companyName(companies, id) {
    var c = companies.find(function (x) { return x.id === id; });
    return c ? c.name : id;
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
      ? '<span class="badge red">layoff</span>'
      : '<span class="badge green">hiring</span>');
    if (ev.ai_related) out.push('<span class="badge ai">AI-related</span>');
    if (ev.size_is_estimate) out.push('<span class="badge est">est.</span>');
    return out.join(" ");
  }

  /* ---------- tiny SVG chart helpers ---------- */

  function svgEl(tag, attrs) {
    var el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  function barChart(container, rows, opts) {
    opts = opts || {};
    var W = container.clientWidth || 900;
    var H = opts.height || 320;
    var padL = 64, padR = 16, padT = 18, padB = 46;
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([1]));
    var bw = (W - padL - padR) / rows.length;
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, class: "chart", role: "img" });
    var grid = svgEl("g", {});
    for (var g = 0; g <= 4; g++) {
      var y = padT + (H - padT - padB) * (1 - g / 4);
      grid.appendChild(svgEl("line", { x1: padL, y1: y, x2: W - padR, y2: y, stroke: "#2d3542", "stroke-width": 1 }));
      var t = svgEl("text", { x: padL - 8, y: y + 4, "text-anchor": "end", fill: "#8b98a9", "font-size": 11 });
      t.textContent = fmt(Math.round(max * g / 4));
      grid.appendChild(t);
    }
    svg.appendChild(grid);
    rows.forEach(function (r, i) {
      var h = (H - padT - padB) * (r.value / max);
      var x = padL + i * bw + bw * 0.12;
      var w = bw * 0.76;
      var y = H - padB - h;
      svg.appendChild(svgEl("rect", { x: x, y: y, width: w, height: Math.max(h, 1), fill: r.color || PALETTE[i % PALETTE.length], rx: 3 }));
      var v = svgEl("text", { x: x + w / 2, y: y - 5, "text-anchor": "middle", fill: "#e6edf3", "font-size": 11, "font-weight": 600 });
      v.textContent = fmt(r.value);
      svg.appendChild(v);
      var l1 = svgEl("text", { x: x + w / 2, y: H - padB + 16, "text-anchor": "middle", fill: "#8b98a9", "font-size": 10.5 });
      l1.textContent = r.label;
      svg.appendChild(l1);
      if (r.label2) {
        var l2 = svgEl("text", { x: x + w / 2, y: H - padB + 30, "text-anchor": "middle", fill: "#8b98a9", "font-size": 10 });
        l2.textContent = r.label2;
        svg.appendChild(l2);
      }
    });
    container.innerHTML = "";
    container.appendChild(svg);
  }

  function stackedTimeline(container, events, opts) {
    opts = opts || {};
    var W = container.clientWidth || 900;
    var H = opts.height || 320;
    var padL = 64, padR = 16, padT = 18, padB = 30;
    var byYear = {};
    events.forEach(function (e) {
      if (!e.size) return;
      var y = e.date.slice(0, 4);
      byYear[y] = byYear[y] || { layoff: 0, hiring: 0 };
      byYear[y][e.type] += e.size;
    });
    var years = Object.keys(byYear).sort();
    var max = 1;
    years.forEach(function (y) {
      max = Math.max(max, byYear[y].layoff + byYear[y].hiring);
    });
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, class: "chart", role: "img" });
    for (var g = 0; g <= 4; g++) {
      var gy = padT + (H - padT - padB) * (1 - g / 4);
      svg.appendChild(svgEl("line", { x1: padL, y1: gy, x2: W - padR, y2: gy, stroke: "#2d3542" }));
      var gt = svgEl("text", { x: padL - 8, y: gy + 4, "text-anchor": "end", fill: "#8b98a9", "font-size": 11 });
      gt.textContent = fmt(Math.round(max * g / 4));
      svg.appendChild(gt);
    }
    var bw = (W - padL - padR) / years.length;
    years.forEach(function (y, i) {
      var x = padL + i * bw + bw * 0.15;
      var w = bw * 0.7;
      var total = byYear[y].layoff + byYear[y].hiring;
      var hTotal = (H - padT - padB) * (total / max);
      var hLay = (H - padT - padB) * (byYear[y].layoff / max);
      var yBase = H - padB;
      if (byYear[y].hiring > 0) {
        var hh = (H - padT - padB) * (byYear[y].hiring / max);
        svg.appendChild(svgEl("rect", { x: x, y: yBase - hTotal, width: w, height: hh, fill: HIRING_COLOR, rx: 2 }));
      }
      if (byYear[y].layoff > 0) {
        svg.appendChild(svgEl("rect", { x: x, y: yBase - hLay, width: w, height: hLay, fill: LAYOFF_COLOR, rx: 2 }));
      }
      var t = svgEl("text", { x: x + w / 2, y: yBase - hTotal - 5, "text-anchor": "middle", fill: "#e6edf3", "font-size": 11, "font-weight": 600 });
      t.textContent = fmt(total);
      svg.appendChild(t);
      var l = svgEl("text", { x: x + w / 2, y: yBase + 16, "text-anchor": "middle", fill: "#8b98a9", "font-size": 11 });
      l.textContent = y;
      svg.appendChild(l);
    });
    container.innerHTML = "";
    container.appendChild(svg);
  }

  function netChart(container, events) {
    var byYear = {};
    events.forEach(function (e) {
      if (!e.size) return;
      var y = e.date.slice(0, 4);
      byYear[y] = byYear[y] || 0;
      byYear[y] += e.type === "layoff" ? -e.size : e.size;
    });
    var years = Object.keys(byYear).sort();
    var rows = years.map(function (y) {
      return { label: y, value: byYear[y], color: byYear[y] < 0 ? LAYOFF_COLOR : HIRING_COLOR };
    });
    var maxAbs = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.value); }).concat([1]));
    barChart(container, rows.map(function (r) {
      return { label: r.label, value: Math.abs(r.value), color: r.color, raw: r.value };
    }), { height: 300 });
    var note = document.createElement("p");
    note.className = "muted small";
    note.textContent = "Bars show absolute net change per year; red = net layoffs, green = net hiring.";
    container.parentNode.appendChild(note);
  }

  /* ---------- table rendering ---------- */

  function eventsTable(tbody, companies, events, type) {
    var rows = events.filter(function (e) { return !type || e.type === type; })
      .sort(function (a, b) { return b.date.localeCompare(a.date); });
    tbody.innerHTML = rows.map(function (e) {
      return "<tr>" +
        "<td class='num'>" + esc(e.date) + "</td>" +
        "<td><strong>" + esc(companyName(companies, e.company)) + "</strong></td>" +
        "<td>" + badges(e) + "</td>" +
        "<td class='num'>" + (e.size ? fmt(e.size) : "—") + (e.percent_of_workforce ? " <span class='muted'>(" + e.percent_of_workforce + "%)</span>" : "") + "</td>" +
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
        "<td><strong>" + esc(c.name) + "</strong>" + (c.ticker ? " <span class='muted small'>" + esc(c.ticker) + "</span>" : "") + "</td>" +
        "<td><span class='badge'>" + esc(c.type) + "</span></td>" +
        "<td class='small'>" + esc(c.segment) + "</td>" +
        "<td class='num'>" + (hc ? fmt(hc.employees) + (hc.is_estimate ? " <span class='badge est'>est.</span>" : "") + " <span class='muted small'>as of " + esc(hc.as_of) + "</span>" : "—") + "</td>" +
        "<td class='small muted'>" + esc(c.selection_reason) + "</td>" +
        "</tr>";
    }).join("");
  }

  /* ---------- page wiring ---------- */

  function header(active) {
    var pages = [
      ["index.html", "Total"],
      ["layoffs.html", "LayoffsBench"],
      ["hirings.html", "HiringsBench"]
    ];
    var nav = pages.map(function (p) {
      return '<a href="' + p[0] + '"' + (p[1] === active ? ' class="active"' : "") + ">" + p[1] + "</a>";
    }).join("");
    return '<header class="site"><span class="brand">⚖️ AI Workforce Tracker</span><nav>' + nav + "</nav></header>";
  }

  function footer(updated) {
    return '<footer class="site">' +
      "Data last updated " + esc(updated) + ". All figures come from the sourced entries in " +
      '<a href="https://github.com/amayuelas/ai-workforce/tree/main/data">data/</a> — every event links to its sources. ' +
      'Announced layoff counts are announcement figures, not necessarily realized separations. ' +
      'See <a href="https://github.com/amayuelas/ai-workforce/blob/main/docs/METHODOLOGY.md">methodology</a>.</footer>';
  }

  function loadAll() {
    return Promise.all([
      loadJSON("data/companies.json"),
      loadJSON("data/events.json"),
      loadJSON("data/headcount.json")
    ]).then(function (r) { return { companies: r[0].companies, events: r[1].events, headcount: r[2].snapshots, updated: r[1].updated }; });
  }

  window.AIW = {
    loadAll: loadAll,
    header: header,
    footer: footer,
    fmt: fmt,
    fmtSigned: fmtSigned,
    esc: esc,
    companyName: companyName,
    barChart: barChart,
    stackedTimeline: stackedTimeline,
    netChart: netChart,
    eventsTable: eventsTable,
    companiesTable: companiesTable,
    badges: badges,
    sourceLinks: sourceLinks,
    PALETTE: PALETTE,
    LAYOFF_COLOR: LAYOFF_COLOR,
    HIRING_COLOR: HIRING_COLOR,
    AI_COLOR: AI_COLOR
  };
})();
