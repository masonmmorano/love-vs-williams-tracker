# Love vs Williams — The Bet

A tiny fan tracker for a friend-group bet: Jordan Love (Packers) vs Caleb
Williams (Bears) regular-season passing yards, head to head.

- `public/` — static frontend (plain HTML/CSS/JS, no build step)
- `api/stats.js` — Vercel serverless function that fetches live stats
  server-side (keeps the API key secret) and returns season totals for both
  players

## How live updates work

The page calls `/api/stats` on load and every 2 minutes while it's open. That
function fetches fresh data from the Tank01 NFL API and responds with
`Cache-Control: s-maxage=600`, so Vercel's edge caches it for ~10 minutes
regardless of how many people are viewing — plenty fresh for "check after
each team's game" without burning API quota.

## Setup

1. Get a free API key: sign up at [RapidAPI](https://rapidapi.com/) and
   subscribe to the free **Basic** plan of
   [Tank01 NFL](https://rapidapi.com/tank01/api/tank01-nfl-live-in-game-real-time-statistics-nfl).
2. Deploy to Vercel:
   - Push this repo to GitHub (already done if you're reading this from the repo).
   - In Vercel, "Add New Project" → import this GitHub repo.
   - Add an environment variable `RAPIDAPI_KEY` with your key (Project
     Settings → Environment Variables). Never commit the real key — only
     `.env.example` is tracked.
   - Deploy. No build command needed.
3. Open the deployed URL and share it with the group.

## Local development

No dependencies to install. To test the API route locally you need the
[Vercel CLI](https://vercel.com/docs/cli) (`npm i -g vercel`, then `vercel dev`)
with `RAPIDAPI_KEY` set in a local `.env` file.
