import { findMentions, hydrateEpisode, rankEpisodes } from "./grank.js";

const state = { episodes: [] };
const $ = (selector) => document.querySelector(selector);
const fmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
const score = (e, key) => e.scoreBreakdown?.[key] ?? 0;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
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
    ["top offender", villain?.title || "—"],
  ].map(([label, value]) => `<div class="kpi"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
}

function renderLeaderboard(ranked) {
  $("#leaderboard").innerHTML = ranked.map((episode, index) => {
    const first = episode.firstMention?.time || "never";
    const firstMeta = episode.firstMention
      ? `<a class="clip" href="${episode.url}&t=${episode.firstMention.timeSeconds}s" target="_blank" rel="noreferrer">first ${first}</a>`
      : "first never";
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
    <div class="bar-track"><div class="bar-fill ${key}" style="width:${(score(e, key) / max) * 100}%"></div></div>
    <div class="bar-value">${score(e, key)}</div>
  </div>`).join("") + `<p class="chart-note">${label}</p>`;
}

function scale(value, inMin, inMax, outMin, outMax) {
  if (inMax === inMin) return (outMin + outMax) / 2;
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
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
  $("#timeline").innerHTML = episodes.map((e) => `<div class="tick ${e.mentionCount ? "hit" : "zero"}" style="--h:${Math.max(4, ((e.mentionCount || 0) / max) * 100)}%"><span>${escapeHtml(e.title)} · ${e.mentionCount || 0} drops</span></div>`).join("");
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
      transcriptStatus: "manual",
    });
    state.episodes.push(episode);
    renderAll();
    $("#result").textContent = `${episode.grade}-rank · ${Math.round(episode.gRankScore)} points · first ${episode.firstMention?.time || "never"}`;
  });
}

function clockToSecondsSafe(clock) {
  const parts = String(clock).split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

loadSeedData();
wireForm();
