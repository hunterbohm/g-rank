// src/grank.js
var GSTACK_PATTERN = /\b(?:g[\s-]*stack|gstack)\b/gi;
function secondsToClock(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0)
    return "—";
  const total = Math.floor(totalSeconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor(total % 3600 / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
function clockToSeconds(clock) {
  if (!clock || typeof clock !== "string")
    return 0;
  const parts = clock.trim().split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n)))
    return 0;
  if (parts.length === 2)
    return parts[0] * 60 + parts[1];
  if (parts.length === 3)
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}
function parseTimestampedTranscript(input) {
  const rows = [];
  for (const line of String(input || "").split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+:\d{2}(?::\d{2})?)\s+(.+?)\s*$/);
    if (!match)
      continue;
    rows.push({ time: match[1], timeSeconds: clockToSeconds(match[1]), text: match[2] });
  }
  return rows;
}
function findMentions(input, pattern = GSTACK_PATTERN) {
  const rows = Array.isArray(input) ? input : parseTimestampedTranscript(input);
  const mentions = [];
  for (const row of rows) {
    pattern.lastIndex = 0;
    if (pattern.test(row.text))
      mentions.push(row);
  }
  return mentions;
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function scoreEpisode({ durationSeconds = 0, mentions = [] }) {
  const count = mentions.length;
  if (!count) {
    return { total: 0, early: 0, volume: 0, shame: 0, aftershock: 0, firstPercent: null };
  }
  const duration = Math.max(1, durationSeconds);
  const first = mentions[0].timeSeconds ?? duration;
  const firstPercent = clamp(first / duration, 0, 1);
  const densityPerHour = count / Math.max(1 / 60, duration / 3600);
  const remainingHours = Math.max(1 / 60, (duration - first) / 3600);
  const aftershock = Math.max(0, count - 1) / remainingHours;
  const early = Math.round(1000 * (1 - firstPercent));
  const volume = Math.round(1000 * clamp(Math.log1p(densityPerHour) / Math.log(18), 0, 1));
  const shame = Math.round(1000 * clamp(aftershock / 14 * 0.7 + (count >= 10 ? 0.3 : count / 10 * 0.3), 0, 1));
  const total = Math.round(early * 0.5 + volume * 0.3 + shame * 0.2);
  return { total, early, volume, shame, aftershock: Math.round(aftershock * 10) / 10, firstPercent: Math.round(firstPercent * 1000) / 10 };
}
function gradeEpisode(score) {
  const total = typeof score === "number" ? score : score?.total || 0;
  if (total >= 850)
    return "S";
  if (total >= 700)
    return "A";
  if (total >= 520)
    return "B";
  if (total >= 320)
    return "C";
  if (total > 0)
    return "D";
  return "Ø";
}
function hydrateEpisode(raw) {
  const mentions = raw.mentions || findMentions(raw.transcript || "");
  const durationSeconds = raw.durationSeconds || Math.max(0, ...mentions.map((m) => m.timeSeconds));
  const score = scoreEpisode({ durationSeconds, mentions });
  return {
    ...raw,
    durationSeconds,
    duration: raw.duration || secondsToClock(durationSeconds),
    mentions,
    mentionCount: raw.mentionCount ?? mentions.length,
    firstMention: raw.firstMention ?? mentions[0] ?? null,
    firstMentionPercent: raw.firstMentionPercent ?? score.firstPercent,
    densityPerHour: raw.densityPerHour ?? Math.round(mentions.length / Math.max(1 / 60, durationSeconds / 3600) * 10) / 10,
    aftershock: raw.aftershock ?? score.aftershock,
    scoreBreakdown: raw.scoreBreakdown ?? { early: score.early, volume: score.volume, shame: score.shame },
    gRankScore: score.total,
    grade: gradeEpisode(score)
  };
}
function rankEpisodes(episodes) {
  return episodes.map(hydrateEpisode).sort((a, b) => b.gRankScore - a.gRankScore);
}

// src/app.js
var state = { episodes: [] };
var $ = (selector) => document.querySelector(selector);
var fmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
var score = (e, key) => e.scoreBreakdown?.[key] ?? 0;
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]);
}
function metricSummary(ranked) {
  const scanned = ranked.filter((e) => e.transcriptStatus === "ok" || e.transcriptStatus === "manual").length;
  const withMentions = ranked.filter((e) => e.mentionCount > 0).length;
  const totalMentions = ranked.reduce((sum, e) => sum + (e.mentionCount || 0), 0);
  const fastest = ranked.filter((e) => e.firstMention).sort((a, b) => a.firstMention.timeSeconds - b.firstMention.timeSeconds)[0];
  return { scanned, withMentions, totalMentions, villain: ranked[0], fastest };
}
function renderKpis(ranked) {
  const { scanned, withMentions, totalMentions, villain, fastest } = metricSummary(ranked);
  $("#kpis").innerHTML = [
    ["episodes scanned", scanned],
    ["episodes with hits", `${withMentions}/${scanned}`],
    ["GStack drops", totalMentions],
    ["fastest breach", fastest ? `${fastest.firstMention.time} · ${fastest.title}` : "—"],
    ["top offender", villain?.title || "—"]
  ].map(([label, value]) => `<div class="kpi"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
}
function renderLeaderboard(ranked) {
  $("#leaderboard").innerHTML = ranked.map((episode, index) => {
    const first = episode.firstMention?.time || "never";
    const firstMeta = episode.firstMention ? `<a class="clip" href="${episode.url}&t=${episode.firstMention.timeSeconds}s" target="_blank" rel="noreferrer">first ${first}</a>` : "first never";
    const pct = episode.firstMentionPercent == null ? "—" : `${episode.firstMentionPercent}% in`;
    const grade = episode.grade === "Ø" ? "—" : episode.grade;
    return `
      <article class="row ${episode.mentionCount ? "hot" : "clean"}">
        <div class="place">${String(index + 1).padStart(2, "0")}</div>
        <div class="grade grade-${episode.grade}">${grade}</div>
        <div class="episode">
          <a href="${episode.url}" target="_blank" rel="noreferrer">${escapeHtml(episode.title)}</a>
          <span class="meta"><em>${fmt.format(new Date(episode.published))}</em><em>${episode.duration || "—"}</em><em>${firstMeta}</em><em>${pct}</em></span>
          <div class="mini-bars" aria-label="score components">
            <i style="--w:${score(episode, "early") / 10}%" title="early ${score(episode, "early")}"></i>
            <i style="--w:${score(episode, "volume") / 10}%" title="volume ${score(episode, "volume")}"></i>
            <i style="--w:${score(episode, "shame") / 10}%" title="shame ${score(episode, "shame")}"></i>
          </div>
        </div>
        <div class="score">${Math.round(episode.gRankScore || 0).toLocaleString()}</div>
        <div class="count">${episode.mentionCount || 0}</div>
      </article>`;
  }).join("");
}
function renderCharts(ranked) {
  const infected = ranked.filter((e) => e.mentionCount > 0);
  renderScoreStack(ranked.slice(0, 8));
  renderComponentChart("#early-chart", infected.sort((a, b) => score(b, "early") - score(a, "early")), "early", "first mention speed");
  renderComponentChart("#volume-chart", infected.sort((a, b) => score(b, "volume") - score(a, "volume")), "volume", "mention density");
  renderComponentChart("#shame-chart", infected.sort((a, b) => score(b, "shame") - score(a, "shame")), "shame", "aftershock shame");
  renderScatter(infected);
  renderReleaseTimeline([...ranked].sort((a, b) => new Date(a.published) - new Date(b.published)));
}
function renderScoreStack(episodes) {
  $("#score-stack").innerHTML = episodes.map((e) => {
    const early = score(e, "early"), volume = score(e, "volume"), shame = score(e, "shame");
    return `<div class="stack-row">
      <div class="stack-title">${escapeHtml(e.title)}</div>
      <div class="stack-track">
        <b class="early" style="width:${early / 10}%"></b>
        <b class="volume" style="width:${volume / 10}%"></b>
        <b class="shame" style="width:${shame / 10}%"></b>
      </div>
      <div class="bar-value">${Math.round(e.gRankScore || 0)}</div>
    </div>`;
  }).join("");
}
function renderComponentChart(selector, episodes, key, label) {
  const max = Math.max(1, ...episodes.map((e) => score(e, key)));
  $(selector).innerHTML = episodes.map((e) => `<div class="bar-row">
    <div class="bar-title">${escapeHtml(e.title)}</div>
    <div class="bar-track"><div class="bar-fill ${key}" style="width:${score(e, key) / max * 100}%"></div></div>
    <div class="bar-value">${score(e, key)}</div>
  </div>`).join("") + `<p class="chart-note">${label}</p>`;
}
function scale(value, inMin, inMax, outMin, outMax) {
  if (inMax === inMin)
    return (outMin + outMax) / 2;
  return outMin + (value - inMin) / (inMax - inMin) * (outMax - outMin);
}
function renderScatter(points) {
  const w = 760, h = 320, pad = 42;
  const maxMentions = Math.max(1, ...points.map((e) => e.mentionCount));
  const circles = points.map((e) => {
    const x = scale(e.firstMentionPercent ?? 100, 0, 100, pad, w - pad);
    const y = scale(e.mentionCount, 0, maxMentions, h - pad, pad);
    const r = scale(e.mentionCount, 1, maxMentions, 7, 22);
    return `<g class="dot"><circle cx="${x}" cy="${y}" r="${r}"></circle><title>${escapeHtml(e.title)} — ${e.mentionCount} drops, first ${e.firstMention?.time}</title><text x="${x + r + 6}" y="${y + 4}">${escapeHtml(shortTitle(e.title))}</text></g>`;
  }).join("");
  $("#scatter").innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="First mention versus mention count chart">
    <line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" />
    <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${h - pad}" />
    <text class="axis" x="${w / 2}" y="${h - 8}">later first mention →</text>
    <text class="axis" x="10" y="25">more drops ↑</text>
    ${circles}
  </svg>`;
}
function renderReleaseTimeline(episodes) {
  const max = Math.max(1, ...episodes.map((e) => e.mentionCount || 0));
  $("#timeline").innerHTML = episodes.map((e) => `<div class="tick ${e.mentionCount ? "hit" : "zero"}" style="--h:${Math.max(4, (e.mentionCount || 0) / max * 100)}%"><span>${escapeHtml(e.title)} · ${e.mentionCount || 0} drops</span></div>`).join("");
}
function shortTitle(title) {
  return title.length > 26 ? `${title.slice(0, 24)}…` : title;
}
function renderReceipts(ranked) {
  const receipts = ranked.filter((e) => e.mentionCount > 0).flatMap((e) => e.mentions.slice(0, 6).map((m) => ({ ...m, episode: e }))).slice(0, 24);
  $("#receipts").innerHTML = receipts.map((m) => `<li><a href="${m.episode.url}&t=${m.timeSeconds}s" target="_blank" rel="noreferrer">${m.time}</a><b>${escapeHtml(m.episode.title)}</b><span>${escapeHtml(m.text)}</span></li>`).join("");
}
function renderAll() {
  const ranked = rankEpisodes(state.episodes);
  renderKpis(ranked);
  renderLeaderboard(ranked);
  renderCharts(ranked);
  renderReceipts(ranked);
}
async function loadSeedData() {
  const response = await fetch("./data/episodes.json", { cache: "no-store" });
  state.episodes = await response.json();
  renderAll();
}
function wireForm() {
  $("#score-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const transcript = $("#transcript").value;
    const mentions = findMentions(transcript);
    const rows = transcript.match(/^\s*(\d+:\d{2}(?::\d{2})?)/gm) || [];
    const lastClock = rows.at(-1)?.trim() || "0:00";
    const lastMention = mentions.at(-1);
    const durationSeconds = Math.max(lastMention?.timeSeconds || 0, clockToSecondsSafe(lastClock));
    const episode = hydrateEpisode({
      id: crypto.randomUUID(),
      title: $("#title").value || "Untitled episode",
      show: $("#show").value || "Manual import",
      url: $("#url").value || "#",
      published: new Date().toISOString(),
      durationSeconds,
      transcript,
      mentions,
      transcriptStatus: "manual"
    });
    state.episodes.push(episode);
    renderAll();
    $("#result").textContent = `${episode.grade}-rank · ${Math.round(episode.gRankScore)} points · first ${episode.firstMention?.time || "never"}`;
  });
}
function clockToSecondsSafe(clock) {
  const parts = String(clock).split(":").map(Number);
  if (parts.length === 2)
    return parts[0] * 60 + parts[1];
  if (parts.length === 3)
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}
loadSeedData();
wireForm();
