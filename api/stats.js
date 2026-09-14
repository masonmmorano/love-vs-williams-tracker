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

function findNextGame(schedule, lastGamePlayed, teamAbv) {
  const regularSeason = schedule.filter((g) => g.seasonType === "Regular Season");
  const lastDate = lastGamePlayed ? lastGamePlayed.slice(0, 8) : "00000000";
  const next = regularSeason.find((g) => g.gameDate > lastDate);
  if (!next) return null;

  const weekMatch = /(\d+)/.exec(next.gameWeek || "");
  const isHome = next.home === teamAbv;

  return {
    week: weekMatch ? Number(weekMatch[1]) : null,
    opponent: isHome ? next.away : next.home,
    home: isHome,
  };
}

async function fetchProjectedYards(playerId, week, apiKey) {
  if (week == null) return null;
  const data = await tank01(`/getNFLProjections?playerID=${playerId}`, apiKey);
  const projections = data?.body?.projections ?? [];
  const entry = projections.find((p) => p.week === `Week_${week}`);
  const yards = Number(entry?.Passing?.passYds);
  return Number.isFinite(yards) ? yards : null;
}

async function fetchPlayer(player, season, apiKey) {
  const [info, schedule] = await Promise.all([
    fetchPlayerInfo(player.id, apiKey),
    fetchSchedule(player.teamAbv, season, apiKey),
  ]);

  const nextGame = findNextGame(schedule, info.lastGamePlayed, player.teamAbv);
  const projectedYards = nextGame ? await fetchProjectedYards(player.id, nextGame.week, apiKey) : null;

  return {
    name: player.name,
    team: player.team,
    seasonYards: info.seasonYards,
    gamesPlayed: info.gamesPlayed,
    avg: info.avg,
    nextGame,
    projectedYards,
  };
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

    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1800");
    res.status(200).json({
      updatedAt: new Date().toISOString(),
      players: { love, caleb },
    });
  } catch (err) {
    res.status(502).json({ error: "Failed to fetch live stats", detail: err.message });
  }
};
