const RAPIDAPI_HOST = "tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com";

const PLAYERS = {
  love: { id: "4036378", name: "Jordan Love", team: "Green Bay Packers", teamAbv: "GB" },
  caleb: { id: "4431611", name: "Caleb Williams", team: "Chicago Bears", teamAbv: "CHI" },
};

// Prior belief about a starting QB's game-to-game passing yard spread, used to
// steady the win-probability estimate before enough of this season's games
// exist to trust a sample standard deviation on their own.
const PRIOR_STDEV = 70;
const PRIOR_VARIANCE = PRIOR_STDEV * PRIOR_STDEV;
const PRIOR_WEIGHT = 3;

function currentSeason() {
  const now = new Date();
  // Jan/Feb still belong to the season that kicked off the previous September.
  return now.getUTCMonth() <= 1 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
}

async function tank01(path, apiKey) {
  const res = await fetch(`https://${RAPIDAPI_HOST}${path}`, {
    headers: {
      "x-rapidapi-host": RAPIDAPI_HOST,
      "x-rapidapi-key": apiKey,
    },
  });
  if (!res.ok) {
    throw new Error(`Tank01 API returned ${res.status} for ${path}`);
  }
  return res.json();
}

async function fetchPlayerInfo(id, apiKey) {
  const data = await tank01(`/getNFLPlayerInfo?playerID=${id}&getStats=true`, apiKey);
  const stats = data?.body?.stats;
  const passYds = Number(stats?.Passing?.passYds ?? 0);
  const gamesPlayed = Number(stats?.gamesPlayed ?? 0);

  return {
    seasonYards: passYds,
    gamesPlayed,
    avg: gamesPlayed > 0 ? passYds / gamesPlayed : 0,
    lastGamePlayed: data?.body?.lastGamePlayed ?? null,
  };
}

async function fetchSchedule(teamAbv, season, apiKey) {
  const data = await tank01(`/getNFLTeamSchedule?teamAbv=${teamAbv}&season=${season}`, apiKey);
  const body = data?.body;
  return Array.isArray(body) ? body : body?.schedule ?? [];
}

async function fetchGameLog(playerId, season, apiKey) {
  const data = await tank01(`/getNFLGamesForPlayer?playerID=${playerId}&season=${season}`, apiKey);
  return data?.body ?? {};
}

async function fetchProjections(playerId, apiKey) {
  const data = await tank01(`/getNFLProjections?playerID=${playerId}`, apiKey);
  return data?.body?.projections ?? [];
}

function weekNumber(gameWeek) {
  const match = /(\d+)/.exec(gameWeek || "");
  return match ? Number(match[1]) : null;
}

function remainingRegularSeasonGames(schedule, lastGamePlayed) {
  const regularSeason = schedule.filter((g) => g.seasonType === "Regular Season");
  const lastDate = lastGamePlayed ? lastGamePlayed.slice(0, 8) : "00000000";
  return regularSeason.filter((g) => g.gameDate > lastDate);
}

function describeNextGame(game, teamAbv) {
  if (!game) return null;
  const isHome = game.home === teamAbv;
  return {
    week: weekNumber(game.gameWeek),
    opponent: isHome ? game.away : game.home,
    home: isHome,
  };
}

function projectedYardsForWeek(projections, week) {
  if (week == null) return null;
  const entry = projections.find((p) => p.week === `Week_${week}`);
  const yards = Number(entry?.Passing?.passYds);
  return Number.isFinite(yards) ? yards : null;
}

function regularSeasonPassYards(gameLog, regularSeasonGameIds) {
  const yards = [];
  for (const [gameId, game] of Object.entries(gameLog)) {
    if (regularSeasonGameIds.has(gameId) && game?.Passing?.passYds != null) {
      const y = Number(game.Passing.passYds);
      if (Number.isFinite(y)) yards.push(y);
    }
  }
  return yards;
}

// Shrinks the observed sample variance toward a league-average prior so a
// couple of wild/tame early-season games don't produce an overconfident estimate.
function effectiveVariance(yardsArr) {
  const n = yardsArr.length;
  if (n < 2) return PRIOR_VARIANCE;
  const mean = yardsArr.reduce((a, b) => a + b, 0) / n;
  const sampleVar = yardsArr.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
  return (PRIOR_WEIGHT * PRIOR_VARIANCE + n * sampleVar) / (PRIOR_WEIGHT + n);
}

function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

function normalCDF(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

async function fetchPlayer(player, season, apiKey) {
  const [info, schedule] = await Promise.all([
    fetchPlayerInfo(player.id, apiKey),
    fetchSchedule(player.teamAbv, season, apiKey),
  ]);

  const regularSeasonGames = schedule.filter((g) => g.seasonType === "Regular Season");
  const regularSeasonGameIds = new Set(regularSeasonGames.map((g) => g.gameID));
  const remaining = remainingRegularSeasonGames(schedule, info.lastGamePlayed);
  const nextGame = describeNextGame(remaining[0], player.teamAbv);

  const [gameLog, projections] = await Promise.all([
    fetchGameLog(player.id, season, apiKey),
    fetchProjections(player.id, apiKey),
  ]);

  const playedYards = regularSeasonPassYards(gameLog, regularSeasonGameIds);
  const varPerGame = effectiveVariance(playedYards);

  const projectedNextGameYards = projectedYardsForWeek(projections, nextGame?.week);
  const projectedRestOfSeasonYards = remaining.reduce(
    (sum, g) => sum + (projectedYardsForWeek(projections, weekNumber(g.gameWeek)) ?? 0),
    0
  );

  return {
    name: player.name,
    team: player.team,
    seasonYards: info.seasonYards,
    gamesPlayed: info.gamesPlayed,
    avg: info.avg,
    nextGame,
    projectedYards: projectedNextGameYards,
    _projectedFinalYards: info.seasonYards + projectedRestOfSeasonYards,
    _remainingGames: remaining.length,
    _varPerGame: varPerGame,
  };
}

function attachWinProbability(love, caleb) {
  const loveRemainingVar = love._remainingGames * love._varPerGame;
  const calebRemainingVar = caleb._remainingGames * caleb._varPerGame;
  const combinedStdev = Math.sqrt(loveRemainingVar + calebRemainingVar);
  const diff = love._projectedFinalYards - caleb._projectedFinalYards;

  let loveWinProbability;
  if (combinedStdev === 0) {
    loveWinProbability = diff > 0 ? 1 : diff < 0 ? 0 : 0.5;
  } else {
    loveWinProbability = normalCDF(diff / combinedStdev);
  }

  love.winProbability = loveWinProbability;
  caleb.winProbability = 1 - loveWinProbability;

  delete love._projectedFinalYards;
  delete love._remainingGames;
  delete love._varPerGame;
  delete caleb._projectedFinalYards;
  delete caleb._remainingGames;
  delete caleb._varPerGame;
}

module.exports = async function handler(req, res) {
  const apiKey = process.env.RAPIDAPI_KEY;

  if (!apiKey) {
    res.status(500).json({ error: "RAPIDAPI_KEY is not configured" });
    return;
  }

  const season = currentSeason();

  try {
    const [love, caleb] = await Promise.all([
      fetchPlayer(PLAYERS.love, season, apiKey),
      fetchPlayer(PLAYERS.caleb, season, apiKey),
    ]);

    attachWinProbability(love, caleb);

    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1800");
    res.status(200).json({
      updatedAt: new Date().toISOString(),
      players: { love, caleb },
    });
  } catch (err) {
    res.status(502).json({ error: "Failed to fetch live stats", detail: err.message });
  }
};
