# G-Rank

G-Rank is the joke made real: a tiny leaderboard that ranks podcast episodes by:

1. how long it takes for **GStack** to first come up, and
2. how often **GStack** comes up in the episode.

## Source receipt

Podcast: [Nerd Snipe — “Now Even Google's Buying GPUs From SpaceX?”](https://youtu.be/zsv_F_KeG6M)

Transcript hit:

> 1:28:14 — “I think we need to create a new site, the G rank, where we rank all of our podcast episodes by how long it takes for GStack to first come up and how often it comes up in the episode.”

Seed episode stats from the fetched transcript:

- Duration: `1:35:17`
- First GStack mention: `1:26:56`
- GStack mentions: `4`
- Grade: calculated in-app from speed + density

## Run

```bash
bun test
bun run build
bun run start
```

Then open `http://localhost:3000`.

## Notes

This is intentionally static and dumb in the good way. Paste timestamped transcripts into the form to score more episodes; the app does not need accounts, a database, or a tiny agent civilization.
