const REFRESH_MS = 2 * 60 * 1000;
const SEASON_BAR_FLOOR = 4000;
const SEASON_BAR_STEP = 1000;

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
  nextLabelLove: document.getElementById("next-label-love"),
  nextLabelCaleb: document.getElementById("next-label-caleb"),
  nextProjLove: document.getElementById("next-proj-love"),
  nextProjCaleb: document.getElementById("next-proj-caleb"),
  oppLogoLove: document.getElementById("opp-logo-love"),
  oppLogoCaleb: document.getElementById("opp-logo-caleb"),
  vbarAxis: document.getElementById("vbar-axis"),
  oddsLove: document.getElementById("odds-love"),
  oddsCaleb: document.getElementById("odds-caleb"),
  oddsPctLove: document.getElementById("odds-pct-love"),
  oddsPctCaleb: document.getElementById("odds-pct-caleb"),
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

function seasonBarMax(a, b) {
  let scaleMax = SEASON_BAR_FLOOR;
  while (Math.max(a, b) > scaleMax) scaleMax += SEASON_BAR_STEP;
  return scaleMax;
}

function renderAxis(scaleMax) {
  const steps = scaleMax / SEASON_BAR_STEP;
  const labels = [];
  for (let i = steps; i >= 1; i--) labels.push(`${i}k`);
  labels.push("0");
  els.vbarAxis.innerHTML = labels.map((l) => `<span>${l}</span>`).join("");
}

function renderNextGame(labelEl, projEl, logoEl, nextGame, projectedYards) {
  if (!nextGame) {
    labelEl.textContent = "No upcoming game";
    projEl.textContent = "—";
    logoEl.hidden = true;
    return;
  }
  const vs = nextGame.home ? "vs" : "@";
  labelEl.textContent = `Next: ${vs} ${nextGame.opponent} (Wk ${nextGame.week})`;
  projEl.textContent = projectedYards != null ? fmt(Math.round(projectedYards)) : "—";

  logoEl.hidden = false;
  logoEl.alt = `${nextGame.opponent} logo`;
  logoEl.onerror = () => { logoEl.hidden = true; };
  logoEl.src = `https://a.espncdn.com/i/teamlogos/nfl/500/${nextGame.opponent.toLowerCase()}.png`;
}

function render(data) {
  const love = data.players.love;
  const caleb = data.players.caleb;

  animateCount(els.yardsLove, love.seasonYards);
  animateCount(els.yardsCaleb, caleb.seasonYards);

  els.metaLove.textContent = `${gameWord(love.gamesPlayed)} · ${love.avg.toFixed(1)} yd/gm`;
  els.metaCaleb.textContent = `${gameWord(caleb.gamesPlayed)} · ${caleb.avg.toFixed(1)} yd/gm`;

  const scaleMax = seasonBarMax(love.seasonYards, caleb.seasonYards);
  renderAxis(scaleMax);
  els.barLove.style.height = `${(love.seasonYards / scaleMax) * 100}%`;
  els.barCaleb.style.height = `${(caleb.seasonYards / scaleMax) * 100}%`;
  els.barValueLove.textContent = fmt(love.seasonYards);
  els.barValueCaleb.textContent = fmt(caleb.seasonYards);

  if (love.winProbability != null) {
    const lovePct = Math.round(love.winProbability * 100);
    const calebPct = 100 - lovePct;
    els.oddsLove.style.width = `${lovePct}%`;
    els.oddsCaleb.style.width = `${calebPct}%`;
    els.oddsPctLove.textContent = `${lovePct}%`;
    els.oddsPctCaleb.textContent = `${calebPct}%`;

    const loveLeads = lovePct >= calebPct;
    els.oddsLove.classList.toggle("leading", loveLeads);
    els.oddsLove.classList.toggle("trailing", !loveLeads);
    els.oddsCaleb.classList.toggle("leading", !loveLeads);
    els.oddsCaleb.classList.toggle("trailing", loveLeads);
  }

  renderNextGame(els.nextLabelLove, els.nextProjLove, els.oppLogoLove, love.nextGame, love.projectedYards);
  renderNextGame(els.nextLabelCaleb, els.nextProjCaleb, els.oppLogoCaleb, caleb.nextGame, caleb.projectedYards);

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
