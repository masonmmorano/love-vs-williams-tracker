const RAPIDAPI_HOST = "tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com";

const PLAYERS = {
  love: { id: "4036378", name: "Jordan Love", team: "Green Bay Packers", teamAbv: "GB" },
  caleb: { id: "4431611", name: "Caleb Williams", team: "Chicago Bears", teamAbv: "CHI" },
};

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

async function fetchPlayer(player, season, apiKey) {
  const [info, schedule] = await Promise.all([
    fetchPlayerInfo(player.id, apiKey),
    fetchSchedule(player.teamAbv, season, apiKey),
  ]);

  const remaining = remainingRegularSeasonGames(schedule, info.lastGamePlayed);
  const nextGame = describeNextGame(remaining[0], player.teamAbv);
  const projections = await fetchProjections(player.id, apiKey);

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
    projectedFinalYards: Math.round(info.seasonYards + projectedRestOfSeasonYards),
  };
}

// Full-season prediction: actual yards so far + Tank01's own projected yards
// for every remaining game. The odds are just each player's share of the
// combined projected total, so a one-game lead doesn't swing it wildly.
function attachWinShare(love, caleb) {
  const total = love.projectedFinalYards + caleb.projectedFinalYards;
  const loveShare = total > 0 ? love.projectedFinalYards / total : 0.5;
  love.winProbability = loveShare;
  caleb.winProbability = 1 - loveShare;
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

    attachWinShare(love, caleb);

    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1800");
    res.status(200).json({
      updatedAt: new Date().toISOString(),
      players: { love, caleb },
    });
  } catch (err) {
    res.status(502).json({ error: "Failed to fetch live stats", detail: err.message });
  }
};
