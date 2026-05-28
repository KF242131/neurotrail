// Self-contained replay document builder.
//
// Plain ESM (no React, no bundler features) so the SAME source can be imported
// by the Vite app (src/lib/exportHtml.ts) and by the Node CLI
// (bin/neurotrail.mjs). It returns one standalone .html string that, when
// opened from disk with no server, animates the agent's run on a <canvas>,
// scrubs like a video player, and can record itself to .webm.
//
// Types live in replayDocument.d.ts.

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTokens(value) {
  if (value >= 1000000) return (value / 1000000).toFixed(1) + "M";
  if (value >= 1000) return (value / 1000).toFixed(1) + "k";
  return String(Math.round(value || 0));
}

function formatCost(value) {
  if (!value || value <= 0) return "$0";
  if (value < 0.01) return "<$0.01";
  if (value < 100) return "$" + value.toFixed(2);
  return "$" + Math.round(value);
}

function chip(label, value) {
  return (
    '<div class="nt-chip"><span class="nt-chip-v">' +
    escapeHtml(value) +
    '</span><span class="nt-chip-l">' +
    escapeHtml(label) +
    "</span></div>"
  );
}

function summaryChips(summary) {
  if (!summary) return "";
  const pct = Math.round((summary.wastePct || 0) * 100);
  return [
    chip("est. cost", formatCost(summary.estimatedCostUsd)),
    chip("tokens", formatTokens(summary.totalTokens || 0)),
    chip("steps", String(summary.steps || 0)),
    chip("files", String(summary.filesTouched || 0)),
    chip("wasted", pct + "%"),
  ].join("");
}

function handoffSection(handoff) {
  if (!handoff) return "";
  const dead =
    handoff.deadTrails && handoff.deadTrails.length
      ? '<div class="nt-h-sub">Dead trails</div><ul>' +
        handoff.deadTrails.map((d) => "<li>" + escapeHtml(d) + "</li>").join("") +
        "</ul>"
      : "";
  const files =
    handoff.filesTouched && handoff.filesTouched.length
      ? '<div class="nt-h-sub">Files touched</div><ul>' +
        handoff.filesTouched.map((f) => "<li>" + escapeHtml(f) + "</li>").join("") +
        "</ul>"
      : "";
  return (
    '<div class="nt-h-summary">' +
    escapeHtml(handoff.summary || "") +
    "</div>" +
    files +
    dead +
    '<div class="nt-h-sub">Next-agent prompt</div>' +
    "<pre>" +
    escapeHtml(handoff.promptForNextAgent || "") +
    "</pre>"
  );
}

function redactionNotice(payload) {
  if (!payload || !payload.redactionNotice) return "";
  return (
    '<div class="nt-redaction">' +
    escapeHtml(payload.redactionNotice) +
    "</div>"
  );
}

const PLAYER_RUNTIME = `
'use strict';
(function () {
  var el = document.getElementById('neurotrail-payload');
  if (!el) return;
  var data;
  try { data = JSON.parse(el.textContent || '{}'); } catch (e) { return; }

  var nodes = data.nodes || [];
  var edges = data.edges || [];
  var signals = (data.signals || []).slice().sort(function (a, b) { return a.time - b.time; });
  var duration = data.durationSec || (signals.length ? signals[signals.length - 1].time + 2.5 : 1);
  if (!(duration > 0)) duration = 1;

  var ACTIVE = 1.5, TRAIL = 7.5, TRAVEL = 0.55, TAU = 6.28318;
  var C = { bone:'#ECE6D7', warm:'#F4EFE4', evidence:'#8E9AA0', clay:'#B9786D', mist:'#8A867E', dim:'#625F58' };

  function actionColor(a) {
    if (a === 'read_file' || a === 'open_symbol') return C.evidence;
    if (a === 'search' || a === 'think') return C.mist;
    if (a === 'edit_file' || a === 'write_text') return C.warm;
    if (a === 'run_command' || a === 'observe_output') return C.bone;
    if (a === 'test_failed') return C.clay;
    if (a === 'test_passed') return C.bone;
    if (a === 'decision' || a === 'final_answer') return C.warm;
    return C.mist;
  }
  function hexA(hex, alpha) {
    var h = hex.replace('#', '');
    var r = parseInt(h.substring(0, 2), 16);
    var g = parseInt(h.substring(2, 4), 16);
    var b = parseInt(h.substring(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  var canvas = document.getElementById('nt-canvas');
  var ctx = canvas.getContext('2d');
  var nodeById = {};
  for (var i = 0; i < nodes.length; i++) nodeById[nodes[i].id] = nodes[i];

  var agentId = null;
  for (var j = 0; j < nodes.length; j++) { if (nodes[j].type === 'agent') { agentId = nodes[j].id; break; } }
  var prevTarget = null;
  for (var k = 0; k < signals.length; k++) {
    signals[k]._src = signals[k].source || agentId || prevTarget;
    prevTarget = signals[k].target;
  }

  var view = { scale: 1, ox: 0, oy: 0, w: 0, h: 0, dpr: 1 };
  function fit() {
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(1, Math.floor(rect.width * dpr));
    var hh = Math.max(1, Math.floor(rect.height * dpr));
    canvas.width = w; canvas.height = hh;
    view.dpr = dpr; view.w = rect.width; view.h = rect.height;
    var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (var i = 0; i < nodes.length; i++) {
      var p = nodes[i].position || { x: 0, y: 0 };
      if (p.x < minx) minx = p.x; if (p.y < miny) miny = p.y;
      if (p.x > maxx) maxx = p.x; if (p.y > maxy) maxy = p.y;
    }
    if (!isFinite(minx)) { minx = 0; miny = 0; maxx = 1; maxy = 1; }
    var pad = 76;
    var gw = Math.max(1, maxx - minx), gh = Math.max(1, maxy - miny);
    var s = Math.min((rect.width - pad * 2) / gw, (rect.height - pad * 2) / gh);
    if (!isFinite(s) || s <= 0) s = 1;
    s = Math.min(s, 1.7);
    view.scale = s;
    view.ox = (rect.width - gw * s) / 2 - minx * s;
    view.oy = (rect.height - gh * s) / 2 - miny * s;
  }
  function pos(id) {
    var n = nodeById[id];
    if (!n || !n.position) return null;
    return { x: n.position.x * view.scale + view.ox, y: n.position.y * view.scale + view.oy };
  }
  function line(a, b, alpha, width) {
    ctx.strokeStyle = alpha;
    ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }

  function render(t) {
    ctx.save();
    ctx.scale(view.dpr, view.dpr);
    ctx.clearRect(0, 0, view.w, view.h);

    for (var i = 0; i < edges.length; i++) {
      var a = pos(edges[i].source), b = pos(edges[i].target);
      if (!a || !b) continue;
      line(a, b, 'rgba(120,116,108,0.09)', 1);
    }

    var glow = {};
    for (var s = 0; s < signals.length; s++) {
      var sig = signals[s];
      if (sig.time > t + 0.0001) break;
      var age = t - sig.time;
      var src = pos(sig._src), tgt = pos(sig.target);
      var col = actionColor(sig.action);

      if (src && tgt && age <= TRAIL) {
        var ta = 1 - age / TRAIL;
        line(src, tgt, hexA(col, 0.05 + ta * 0.32), 0.8 + ta * 1.4);
      }
      var persistent = sig.action === 'edit_file' || sig.action === 'decision' ||
        sig.action === 'final_answer' || sig.action === 'test_failed' || sig.action === 'test_passed';
      var win = age <= ACTIVE ? (1 - age / ACTIVE) : (persistent ? 0.22 : 0);
      if (win > 0) {
        var inten = (0.5 + (sig.intensity || 0.6) * 0.5) * win;
        var prev = glow[sig.target];
        if (!prev || inten > prev.a) glow[sig.target] = { a: inten, color: col };
      }
      if (src && tgt && age <= ACTIVE) {
        var f = Math.min(1, age / TRAVEL);
        var px = src.x + (tgt.x - src.x) * f, py = src.y + (tgt.y - src.y) * f;
        var pa = 1 - age / ACTIVE;
        var pr = 7 + (sig.intensity || 0.6) * 6;
        var grd = ctx.createRadialGradient(px, py, 0, px, py, pr);
        grd.addColorStop(0, hexA(col, 0.55 * pa));
        grd.addColorStop(1, hexA(col, 0));
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill();
        ctx.fillStyle = hexA(col, 0.9 * pa);
        ctx.beginPath(); ctx.arc(px, py, 1.8, 0, TAU); ctx.fill();
      }
    }

    for (var n = 0; n < nodes.length; n++) {
      var node = nodes[n];
      var p = pos(node.id);
      if (!p) continue;
      var g = glow[node.id];
      var base = node.type === 'agent' ? C.bone : (node.type === 'decision' ? C.warm : C.dim);
      var r = node.type === 'agent' ? 5 : (node.type === 'directory' ? 3.1 : 2.5);
      if (g) {
        var hr = r + 6 + g.a * 17;
        var rg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, hr);
        rg.addColorStop(0, hexA(g.color, 0.3 * g.a));
        rg.addColorStop(1, hexA(g.color, 0));
        ctx.fillStyle = rg;
        ctx.beginPath(); ctx.arc(p.x, p.y, hr, 0, TAU); ctx.fill();
        ctx.fillStyle = hexA(g.color, 0.55 + 0.45 * g.a);
        ctx.beginPath(); ctx.arc(p.x, p.y, r + g.a * 1.7, 0, TAU); ctx.fill();
      } else {
        ctx.fillStyle = hexA(base, 0.48);
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }

  // ---- controls ----
  var playBtn = document.getElementById('nt-play');
  var track = document.getElementById('nt-track');
  var fill = document.getElementById('nt-fill');
  var thumb = document.getElementById('nt-thumb');
  var timeEl = document.getElementById('nt-time');
  var speedBtn = document.getElementById('nt-speed');
  var recBtn = document.getElementById('nt-rec');

  var t = 0, playing = true, speed = 1, last = null, raf = null;
  var speeds = [1, 2, 4, 0.5];

  function fmt(sec) {
    sec = Math.max(0, sec);
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' + s : s);
  }
  function updatePlay() { if (playBtn) playBtn.textContent = playing ? 'Pause' : 'Play'; }
  function updateScrub() {
    var p = Math.max(0, Math.min(1, t / duration));
    if (fill) fill.style.width = (p * 100) + '%';
    if (thumb) thumb.style.left = (p * 100) + '%';
    if (timeEl) timeEl.textContent = fmt(t) + ' / ' + fmt(duration);
  }

  function buildTicks() {
    if (!track) return;
    var holder = document.getElementById('nt-ticks');
    if (!holder) return;
    for (var i = 0; i < signals.length; i++) {
      var sp = document.createElement('span');
      sp.className = 'nt-tick';
      sp.style.left = Math.max(0, Math.min(100, (signals[i].time / duration) * 100)) + '%';
      sp.style.background = hexA(actionColor(signals[i].action), 0.5);
      holder.appendChild(sp);
    }
  }

  function frame(now) {
    if (last == null) last = now;
    var dt = (now - last) / 1000; last = now;
    if (playing) {
      t += dt * speed;
      if (t >= duration) { t = duration; playing = false; updatePlay(); if (recording) stopRec(); }
    }
    render(t);
    updateScrub();
    raf = requestAnimationFrame(frame);
  }

  if (playBtn) playBtn.addEventListener('click', function () {
    if (!playing && t >= duration) { t = 0; last = null; }
    playing = !playing; updatePlay();
  });
  if (speedBtn) speedBtn.addEventListener('click', function () {
    var idx = speeds.indexOf(speed);
    speed = speeds[(idx + 1) % speeds.length];
    speedBtn.textContent = speed + 'x';
  });
  function seekFromEvent(ev) {
    var rect = track.getBoundingClientRect();
    var x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left;
    t = Math.max(0, Math.min(1, x / rect.width)) * duration;
    last = null; render(t); updateScrub();
  }
  if (track) {
    var dragging = false;
    track.addEventListener('pointerdown', function (e) { dragging = true; playing = false; updatePlay(); seekFromEvent(e); });
    window.addEventListener('pointermove', function (e) { if (dragging) seekFromEvent(e); });
    window.addEventListener('pointerup', function () { dragging = false; });
  }

  // ---- recording ----
  var recorder = null, recording = false, chunks = [];
  function stopRec() {
    if (recorder && recording) { recording = false; recorder.stop(); if (recBtn) recBtn.textContent = 'Record'; }
  }
  if (recBtn) {
    var supported = typeof window.MediaRecorder !== 'undefined' && !!canvas.captureStream;
    if (!supported) { recBtn.style.display = 'none'; }
    recBtn.addEventListener('click', function () {
      if (recording) { stopRec(); return; }
      try {
        var stream = canvas.captureStream(30);
        recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        chunks = [];
        recorder.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        recorder.onstop = function () {
          var blob = new Blob(chunks, { type: 'video/webm' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url; a.download = 'neurotrail-replay.webm';
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        };
        recording = true; recorder.start();
        recBtn.textContent = 'Stop';
        t = 0; last = null; playing = true; updatePlay();
      } catch (err) { recording = false; }
    });
  }

  // ---- handoff drawer ----
  var hToggle = document.getElementById('nt-handoff-toggle');
  var hPanel = document.getElementById('nt-handoff');
  if (hToggle && hPanel) {
    hToggle.addEventListener('click', function () {
      hPanel.classList.toggle('open');
    });
  }

  function start() {
    fit(); buildTicks(); updatePlay(); updateScrub();
    raf = requestAnimationFrame(frame);
  }
  window.addEventListener('resize', function () { fit(); render(t); });
  if (document.readyState === 'complete' || document.readyState === 'interactive') start();
  else window.addEventListener('DOMContentLoaded', start);
})();
`;

/** Build a single self-contained, no-server replay HTML document. */
export function buildReplayHtml(payload) {
  const timestamp = payload.exportedAt || new Date().toISOString();
  const signals = payload.signals || [];
  const durationSec =
    payload.durationSec ||
    (signals.length ? signals[signals.length - 1].time + 2.5 : 1);
  const full = Object.assign({}, payload, { exportedAt: timestamp, durationSec });
  const json = JSON.stringify(full).replace(/</g, "\\u003c");
  const title = payload.title || "NeuroTrail replay";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} · NeuroTrail replay</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    html, body { margin: 0; height: 100%; }
    body {
      background: #070706; color: #ECE6D7; overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, system-ui, sans-serif;
    }
    #nt-canvas { position: fixed; inset: 0; width: 100vw; height: 100vh; display: block; }
    .nt-top {
      position: fixed; top: 0; left: 0; right: 0; padding: 20px 24px 40px;
      pointer-events: none;
      background: linear-gradient(180deg, rgba(7,7,6,0.72), rgba(7,7,6,0));
    }
    .nt-brand { font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase; color: #8A867E; }
    .nt-title { margin-top: 2px; font-size: 19px; letter-spacing: -0.01em; color: #F4EFE4; }
    .nt-chips { margin-top: 14px; display: flex; flex-wrap: wrap; gap: 22px; }
    .nt-chip { display: flex; flex-direction: column; }
    .nt-chip-v { font-size: 17px; font-variant-numeric: tabular-nums; color: #F4EFE4; font-family: "SF Mono", ui-monospace, Menlo, monospace; }
    .nt-chip-l { margin-top: 2px; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: #81786C; }
    .nt-bar {
      position: fixed; left: 0; right: 0; bottom: 0; padding: 18px 24px 22px;
      display: flex; align-items: center; gap: 16px;
      background: linear-gradient(0deg, rgba(7,7,6,0.82), rgba(7,7,6,0));
    }
    .nt-btn {
      appearance: none; background: rgba(236,230,215,0.06); border: 1px solid rgba(236,230,215,0.12);
      color: #ECE6D7; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase;
      padding: 7px 13px; border-radius: 999px; cursor: pointer; white-space: nowrap;
    }
    .nt-btn:hover { background: rgba(236,230,215,0.12); }
    #nt-track { position: relative; flex: 1; height: 22px; display: flex; align-items: center; cursor: pointer; }
    #nt-track::before { content: ""; position: absolute; left: 0; right: 0; height: 2px; background: rgba(236,230,215,0.12); border-radius: 2px; }
    #nt-fill { position: absolute; left: 0; height: 2px; width: 0; background: rgba(244,239,228,0.85); border-radius: 2px; }
    #nt-thumb { position: absolute; width: 9px; height: 9px; border-radius: 50%; background: #F4EFE4; transform: translateX(-50%); box-shadow: 0 0 8px rgba(244,239,228,0.6); }
    #nt-ticks { position: absolute; left: 0; right: 0; top: 4px; height: 14px; pointer-events: none; }
    .nt-tick { position: absolute; width: 1px; height: 6px; top: 0; transform: translateX(-50%); }
    #nt-time { font-size: 11px; color: #9B9284; font-variant-numeric: tabular-nums; font-family: "SF Mono", ui-monospace, Menlo, monospace; white-space: nowrap; }
    #nt-handoff {
      position: fixed; top: 0; right: 0; bottom: 0; width: min(440px, 86vw);
      padding: 28px 26px 90px; overflow-y: auto;
      background: rgba(10,10,9,0.94); border-left: 1px solid rgba(236,230,215,0.1);
      transform: translateX(100%); transition: transform 0.32s ease;
    }
    #nt-handoff.open { transform: translateX(0); }
    #nt-handoff h2 { font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #8A867E; margin: 0 0 10px; }
    .nt-h-summary { color: rgba(236,230,215,0.82); font-size: 13px; line-height: 1.55; }
    .nt-redaction { margin-top: 12px; color: rgba(236,230,215,0.46); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; }
    .nt-h-sub { margin-top: 20px; font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: #81786C; }
    #nt-handoff ul { margin: 8px 0 0; padding-left: 18px; }
    #nt-handoff li { color: rgba(236,230,215,0.74); font-size: 12.5px; line-height: 1.5; }
    #nt-handoff pre { white-space: pre-wrap; margin-top: 8px; font-size: 11.5px; line-height: 1.5; color: rgba(236,230,215,0.78); font-family: "SF Mono", ui-monospace, Menlo, monospace; border: 1px solid rgba(236,230,215,0.1); padding: 14px; border-radius: 8px; background: rgba(236,230,215,0.03); }
    .nt-foot { position: fixed; right: 24px; bottom: 70px; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: #524e47; pointer-events: none; }
  </style>
</head>
<body>
  <canvas id="nt-canvas"></canvas>

  <div class="nt-top">
    <div class="nt-brand">NeuroTrail replay</div>
    <div class="nt-title">${escapeHtml(title)}</div>
    <div class="nt-chips">${summaryChips(payload.summary)}</div>
  </div>

  <div class="nt-bar">
    <button id="nt-play" class="nt-btn" type="button">Pause</button>
    <button id="nt-speed" class="nt-btn" type="button">1x</button>
    <div id="nt-track"><div id="nt-ticks"></div><div id="nt-fill"></div><div id="nt-thumb"></div></div>
    <span id="nt-time">0:00 / 0:00</span>
    <button id="nt-rec" class="nt-btn" type="button">Record</button>
    <button id="nt-handoff-toggle" class="nt-btn" type="button">Handoff</button>
  </div>

  <aside id="nt-handoff">
    <h2>Next-agent handoff</h2>
    ${redactionNotice(payload)}
    ${handoffSection(payload.handoff)}
  </aside>

  <div class="nt-foot">neurotrail</div>

  <script id="neurotrail-payload" type="application/json">${json}</script>
  <script>${PLAYER_RUNTIME}</script>
</body>
</html>`;
}
