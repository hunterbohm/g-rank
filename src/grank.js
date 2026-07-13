export const GSTACK_PATTERN = /\b(?:g[\s-]*stack|gstack)\b/gi;

export function secondsToClock(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "—";
  const total = Math.floor(totalSeconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

export function clockToSeconds(clock) {
  if (!clock || typeof clock !== "string") return 0;
  const parts = clock.trim().split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

export function parseTimestampedTranscript(input) {
  const rows = [];
  for (const line of String(input || "").split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+:\d{2}(?::\d{2})?)\s+(.+?)\s*$/);
    if (!match) continue;
    rows.push({ time: match[1], timeSeconds: clockToSeconds(match[1]), text: match[2] });
  }
  return rows;
}

export function findMentions(input, pattern = GSTACK_PATTERN) {
  const rows = Array.isArray(input) ? input : parseTimestampedTranscript(input);
  const mentions = [];
  for (const row of rows) {
    pattern.lastIndex = 0;
    if (pattern.test(row.text)) mentions.push(row);
  }
  return mentions;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function scoreEpisode({ durationSeconds = 0, mentions = [] }) {
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

  // The formula is intentionally editorial, not pretending to be science:
  // earliest mention matters most, repetition matters next, and shame rewards
  // either instant brainrot or a late-episode collapse into repeated GStack.
  const early = Math.round(1000 * (1 - firstPercent));
  const volume = Math.round(1000 * clamp(Math.log1p(densityPerHour) / Math.log(18), 0, 1));
  const shame = Math.round(1000 * clamp((aftershock / 14) * 0.7 + (count >= 10 ? 0.3 : count / 10 * 0.3), 0, 1));
  const total = Math.round(early * 0.5 + volume * 0.3 + shame * 0.2);

  return { total, early, volume, shame, aftershock: Math.round(aftershock * 10) / 10, firstPercent: Math.round(firstPercent * 1000) / 10 };
}

export function gradeEpisode(score) {
  const total = typeof score === "number" ? score : score?.total || 0;
  if (total >= 850) return "S";
  if (total >= 700) return "A";
  if (total >= 520) return "B";
  if (total >= 320) return "C";
  if (total > 0) return "D";
  return "Ø";
}

export function hydrateEpisode(raw) {
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
    densityPerHour: raw.densityPerHour ?? Math.round((mentions.length / Math.max(1 / 60, durationSeconds / 3600)) * 10) / 10,
    aftershock: raw.aftershock ?? score.aftershock,
    scoreBreakdown: raw.scoreBreakdown ?? { early: score.early, volume: score.volume, shame: score.shame },
    gRankScore: score.total,
    grade: gradeEpisode(score),
  };
}

export function rankEpisodes(episodes) {
  return episodes.map(hydrateEpisode).sort((a, b) => b.gRankScore - a.gRankScore);
}
