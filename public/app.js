const REFRESH_MS = 2 * 60 * 1000;

const els = {
  leadLine: document.getElementById("lead-line"),
  yardsLove: document.getElementById("yards-love"),
  yardsCaleb: document.getElementById("yards-caleb"),
  metaLove: document.getElementById("meta-love"),
  metaCaleb: document.getElementById("meta-caleb"),
  crownLove: document.getElementById("crown-love"),
  crownCaleb: document.getElementById("crown-caleb"),
  barLove: document.getElementById("bar-love"),
  barCaleb: document.getElementById("bar-caleb"),
  barValueLove: document.getElementById("bar-value-love"),
  barValueCaleb: document.getElementById("bar-value-caleb"),
  barProjLove: document.getElementById("bar-proj-love"),
  barProjCaleb: document.getElementById("bar-proj-caleb"),
  barProjValueLove: document.getElementById("bar-proj-value-love"),
  barProjValueCaleb: document.getElementById("bar-proj-value-caleb"),
  nextLabelLove: document.getElementById("next-label-love"),
  nextLabelCaleb: document.getElementById("next-label-caleb"),
  nextProjLove: document.getElementById("next-proj-love"),
  nextProjCaleb: document.getElementById("next-proj-caleb"),
  updated: document.getElementById("updated"),
  error: document.getElementById("error"),
  refreshBtn: document.getElementById("refresh-btn"),
};

function fmt(n) {
  return new Intl.NumberFormat("en-US").format(n);
}

function animateCount(el, target) {
  const start = 0;
  const duration = 800;
  const startTime = performance.now();
  function tick(now) {
    const p = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(Math.round(start + (target - start) * eased));
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function gameWord(n) {
  return `${n} game${n === 1 ? "" : "s"} played`;
}

function renderNextGame(labelEl, projEl, nextGame, projectedYards) {
  if (!nextGame) {
    labelEl.textContent = "No upcoming game";
    projEl.textContent = "—";
    return;
  }
  const vs = nextGame.home ? "vs" : "@";
  labelEl.textContent = `Next: ${vs} ${nextGame.opponent} (Wk ${nextGame.week})`;
  projEl.textContent = projectedYards != null ? fmt(Math.round(projectedYards)) : "—";
}

function render(data) {
  const love = data.players.love;
  const caleb = data.players.caleb;

  animateCount(els.yardsLove, love.seasonYards);
  animateCount(els.yardsCaleb, caleb.seasonYards);

  els.metaLove.textContent = `${gameWord(love.gamesPlayed)} · ${love.avg.toFixed(1)} yd/gm`;
  els.metaCaleb.textContent = `${gameWord(caleb.gamesPlayed)} · ${caleb.avg.toFixed(1)} yd/gm`;

  const max = Math.max(love.seasonYards, caleb.seasonYards, 1);
  els.barLove.style.width = `${(love.seasonYards / max) * 100}%`;
  els.barCaleb.style.width = `${(caleb.seasonYards / max) * 100}%`;
  els.barValueLove.textContent = fmt(love.seasonYards);
  els.barValueCaleb.textContent = fmt(caleb.seasonYards);

  renderNextGame(els.nextLabelLove, els.nextProjLove, love.nextGame, love.projectedYards);
  renderNextGame(els.nextLabelCaleb, els.nextProjCaleb, caleb.nextGame, caleb.projectedYards);

  const projMax = Math.max(love.projectedYards ?? 0, caleb.projectedYards ?? 0, 1);
  els.barProjLove.style.width = `${((love.projectedYards ?? 0) / projMax) * 100}%`;
  els.barProjCaleb.style.width = `${((caleb.projectedYards ?? 0) / projMax) * 100}%`;
  els.barProjValueLove.textContent = love.projectedYards != null ? fmt(love.projectedYards) : "—";
  els.barProjValueCaleb.textContent = caleb.projectedYards != null ? fmt(caleb.projectedYards) : "—";

  const diff = Math.abs(love.seasonYards - caleb.seasonYards);
  els.crownLove.hidden = true;
  els.crownCaleb.hidden = true;

  if (diff === 0) {
    els.leadLine.textContent = "Dead even. Nobody wins the bet yet.";
  } else if (love.seasonYards > caleb.seasonYards) {
    els.leadLine.textContent = `Love leads by ${fmt(diff)} yards`;
    els.crownLove.hidden = false;
  } else {
    els.leadLine.textContent = `Williams leads by ${fmt(diff)} yards`;
    els.crownCaleb.hidden = false;
  }

  const updatedDate = new Date(data.updatedAt);
  els.updated.textContent = `Last updated: ${updatedDate.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;

  els.error.hidden = true;
}

async function load() {
  els.refreshBtn.disabled = true;
  try {
    const res = await fetch("/api/stats", { cache: "no-store" });
    if (!res.ok) throw new Error(`API returned ${res.status}`);
    const data = await res.json();
    render(data);
  } catch (err) {
    els.error.hidden = false;
    els.error.textContent = `Couldn't load stats (${err.message}). Showing last known values.`;
  } finally {
    els.refreshBtn.disabled = false;
  }
}

els.refreshBtn.addEventListener("click", load);
load();
setInterval(load, REFRESH_MS);
