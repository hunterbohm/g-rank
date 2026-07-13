import { expect, test } from "bun:test";
import { findMentions, hydrateEpisode, rankEpisodes, secondsToClock } from "../src/grank.js";

test("finds timestamped GStack mentions", () => {
  const transcript = `0:01 normal intro\n1:26:56 this? Gstack. This is the GStack philosophy\n1:28:21 takes for GStack to first come up`;
  const mentions = findMentions(transcript);
  expect(mentions).toHaveLength(2);
  expect(mentions[0].time).toBe("1:26:56");
});

test("scores earlier and denser episodes higher", () => {
  const early = hydrateEpisode({ title: "early", durationSeconds: 3600, transcript: "0:10 GStack\n0:20 GStack" });
  const late = hydrateEpisode({ title: "late", durationSeconds: 3600, transcript: "59:00 GStack" });
  expect(early.gRankScore).toBeGreaterThan(late.gRankScore);
  expect(rankEpisodes([late, early])[0].title).toBe("early");
});

test("formats clocks", () => {
  expect(secondsToClock(5216)).toBe("1:26:56");
});
