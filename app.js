/* ==========================================================
   SISTEMA SUIZO — estado y lógica
   Estructura de datos (guardada en localStorage bajo "swissState"):
   {
     name, totalRounds, tiebreak,
     players: [{id, name, rating, score, byes, hadBye}],
     rounds: [
       { pairings: [{p1, p2, result}], bye: playerId|null }
     ]
   }
   result de un pairing: null (pendiente) | "p1" | "p2" | "draw"
   Puntuación (estilo Pokémon TCG/VGC): victoria = 3, empate = 1, derrota = 0.
   Bye = victoria automática (+3).
   ========================================================== */

const STORAGE_KEY = "swissState";

let state = loadState() || {
  name: "",
  totalRounds: 5,
  players: [],
  rounds: []
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error("No se pudo leer el estado guardado:", e);
    return null;
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("No se pudo guardar el estado:", e);
  }
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

/* ---------- NAVEGACIÓN DE PESTAÑAS ---------- */

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("tab-" + tab.dataset.tab).classList.add("active");
    if (tab.dataset.tab === "standings") renderStandings();
  });
});

/* ---------- CONFIGURACIÓN ---------- */

document.getElementById("saveSetupBtn").addEventListener("click", () => {
  const name = document.getElementById("tName").value.trim();
  const rounds = parseInt(document.getElementById("tRounds").value, 10);

  if (!name) { alert("Ponle un nombre al torneo."); return; }
  if (!rounds || rounds < 1) { alert("El número de rondas debe ser al menos 1."); return; }

  state.name = name;
  state.totalRounds = rounds;
  saveState();
  renderAll();
});

/* ---------- JUGADORES ---------- */

document.getElementById("playerForm").addEventListener("submit", e => {
  e.preventDefault();
  const nameInput = document.getElementById("pName");
  const ratingInput = document.getElementById("pRating");

  if (state.rounds.length > 0) {
    alert("Ya inició la ronda 1. Añadir jugadores a mitad de torneo puede romper los emparejamientos.");
  }

  const player = {
    id: uid(),
    name: nameInput.value.trim(),
    rating: ratingInput.value ? parseInt(ratingInput.value, 10) : 0,
    score: 0,
    byes: 0,
    hadBye: false
  };
  state.players.push(player);
  saveState();
  nameInput.value = "";
  ratingInput.value = "";
  nameInput.focus();
  renderPlayers();
});

function removePlayer(id) {
  if (state.rounds.length > 0) {
    alert("No se puede quitar un jugador una vez iniciado el torneo. Reinicia si necesitas corregir la lista.");
    return;
  }
  state.players = state.players.filter(p => p.id !== id);
  saveState();
  renderPlayers();
}

function renderPlayers() {
  const body = document.getElementById("playersBody");
  body.innerHTML = "";
  state.players.forEach((p, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${escapeHtml(p.name)}</td>
      <td>${p.rating || "—"}</td>
      <td>${p.score}</td>
      <td>${p.byes}</td>
      <td><button class="btn-small" onclick="removePlayer('${p.id}')">Quitar</button></td>
    `;
    body.appendChild(tr);
  });
  document.getElementById("playersEmpty").style.display = state.players.length ? "none" : "block";
  document.getElementById("countPlayers").textContent = state.players.length;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ---------- EMPAREJAMIENTO SUIZO ---------- */

function hasPlayed(p1id, p2id) {
  return state.rounds.some(r =>
    r.pairings.some(pr =>
      (pr.p1 === p1id && pr.p2 === p2id) || (pr.p1 === p2id && pr.p2 === p1id)
    )
  );
}

function generateNextRound() {
  if (state.players.length < 2) {
    alert("Necesitas al menos 2 jugadores.");
    return;
  }
  if (state.rounds.length >= state.totalRounds) {
    alert("Ya se jugaron todas las rondas configuradas.");
    return;
  }

  // Orden: puntaje desc, luego rating desc (ronda 1: solo rating/orden de entrada)
  let pool = [...state.players].sort((a, b) => (b.score - a.score) || (b.rating - a.rating));

  let byePlayer = null;
  if (pool.length % 2 !== 0) {
    // El jugador de menor puntaje que no haya tenido bye recibe el bye.
    for (let i = pool.length - 1; i >= 0; i--) {
      if (!pool[i].hadBye) { byePlayer = pool.splice(i, 1)[0]; break; }
    }
    if (!byePlayer) byePlayer = pool.pop(); // fallback: todos tuvieron bye ya
  }

  const pairings = [];
  const unpaired = [...pool];

  while (unpaired.length > 0) {
    const p1 = unpaired.shift();
    let idx = unpaired.findIndex(p2 => !hasPlayed(p1.id, p2.id));
    if (idx === -1) idx = 0; // no queda nadie nuevo: se permite repetir rival
    const p2 = unpaired.splice(idx, 1)[0];
    pairings.push({ p1: p1.id, p2: p2.id, result: null });
  }

  if (byePlayer) {
    byePlayer.hadBye = true;
    byePlayer.byes += 1;
    byePlayer.score += 3; // el bye cuenta como victoria
  }

  state.rounds.push({ pairings, bye: byePlayer ? byePlayer.id : null });
  saveState();
  renderRounds();
  renderPlayers();
}

function playerById(id) {
  return state.players.find(p => p.id === id);
}

function setResult(roundIdx, pairIdx, result) {
  const round = state.rounds[roundIdx];
  const pairing = round.pairings[pairIdx];
  const p1 = playerById(pairing.p1);
  const p2 = playerById(pairing.p2);

  // revertir puntaje anterior si ya había resultado
  if (pairing.result === "p1") p1.score -= 3;
  if (pairing.result === "p2") p2.score -= 3;
  if (pairing.result === "draw") { p1.score -= 1; p2.score -= 1; }

  pairing.result = result;

  if (result === "p1") p1.score += 3;
  if (result === "p2") p2.score += 3;
  if (result === "draw") { p1.score += 1; p2.score += 1; }

  saveState();
  renderRounds();
  renderPlayers();
}

function renderRounds() {
  const container = document.getElementById("roundsContainer");
  container.innerHTML = "";

  state.rounds.forEach((round, rIdx) => {
    const block = document.createElement("div");
    block.className = "round-block";

    let html = `<div class="round-header">Ronda ${rIdx + 1}</div>`;

    round.pairings.forEach((pr, pIdx) => {
      const p1 = playerById(pr.p1);
      const p2 = playerById(pr.p2);
      html += `
        <div class="match-row">
          <div class="match-player">
            <span>${escapeHtml(p1.name)}</span>
            <span>${p1.rating || ""}</span>
          </div>
          <div class="match-controls">
            <button class="result-btn ${pr.result === "p1" ? "selected" : ""}" onclick="setResult(${rIdx},${pIdx},'p1')">3–0</button>
            <button class="result-btn ${pr.result === "draw" ? "selected" : ""}" onclick="setResult(${rIdx},${pIdx},'draw')">1–1</button>
            <button class="result-btn ${pr.result === "p2" ? "selected" : ""}" onclick="setResult(${rIdx},${pIdx},'p2')">0–3</button>
          </div>
          <div class="match-player right">
            <span>${escapeHtml(p2.name)}</span>
            <span>${p2.rating || ""}</span>
          </div>
        </div>
      `;
    });

    if (round.bye) {
      html += `<div class="bye-row">Bye: ${escapeHtml(playerById(round.bye).name)} (+3 puntos)</div>`;
    }

    block.innerHTML = html;
    container.appendChild(block);
  });

  const currentRound = state.rounds.length;
  document.getElementById("roundStatus").textContent = `Ronda ${currentRound} de ${state.totalRounds}`;

  const genBtn = document.getElementById("genRoundBtn");
  if (currentRound >= state.totalRounds) {
    genBtn.textContent = "Torneo completo";
    genBtn.disabled = true;
  } else {
    genBtn.textContent = `Generar ronda ${currentRound + 1}`;
    genBtn.disabled = false;
  }
}

document.getElementById("genRoundBtn").addEventListener("click", generateNextRound);

/* ---------- CLASIFICACIÓN ---------- */

// Récord Victorias-Derrotas-Empates de un jugador (el bye cuenta como victoria).
function record(playerId) {
  let w = 0, l = 0, t = 0;
  state.rounds.forEach(round => {
    if (round.bye === playerId) { w++; return; }
    round.pairings.forEach(pr => {
      if (pr.p1 !== playerId && pr.p2 !== playerId) return;
      if (pr.result === null) return; // resultado aún no cargado
      if (pr.result === "draw") { t++; return; }
      const isP1 = pr.p1 === playerId;
      const won = (pr.result === "p1" && isP1) || (pr.result === "p2" && !isP1);
      if (won) w++; else l++;
    });
  });
  return { w, l, t };
}

function opponentsOf(playerId) {
  const opps = [];
  state.rounds.forEach(round => {
    round.pairings.forEach(pr => {
      if (pr.p1 === playerId) opps.push(pr.p2);
      if (pr.p2 === playerId) opps.push(pr.p1);
    });
  });
  return opps;
}

// % de victorias de un jugador (puntos / puntos posibles), con piso del 25%.
// Las rondas de bye no cuentan como partida jugada para este cálculo.
function winPercent(playerId) {
  const player = playerById(playerId);
  let played = 0;
  state.rounds.forEach(round => {
    if (round.bye === playerId) return;
    const inRound = round.pairings.some(pr => pr.p1 === playerId || pr.p2 === playerId);
    if (inRound) played++;
  });
  if (played === 0) return 0.25;
  const pct = player.score / (played * 3);
  return Math.max(pct, 0.25);
}

// OWP: promedio del win% (con piso) de todos los rivales enfrentados.
function owp(playerId) {
  const opps = opponentsOf(playerId);
  if (opps.length === 0) return 0;
  const sum = opps.reduce((acc, id) => acc + winPercent(id), 0);
  return sum / opps.length;
}

// OOWP: promedio del OWP de los rivales (rivales de tus rivales, un nivel más).
function oowp(playerId) {
  const opps = opponentsOf(playerId);
  if (opps.length === 0) return 0;
  const sum = opps.reduce((acc, id) => acc + owp(id), 0);
  return sum / opps.length;
}

function fmtPct(v) {
  return (v * 100).toFixed(1) + "%";
}

function renderStandings() {
  const body = document.getElementById("standingsBody");
  body.innerHTML = "";

  const ranked = [...state.players]
    .map(p => ({
      ...p,
      rec: record(p.id),
      op: owp(p.id),
      oop: oowp(p.id)
    }))
    .sort((a, b) => (b.score - a.score) || (b.op - a.op) || (b.oop - a.oop) || (b.rating - a.rating));

  ranked.forEach((p, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td style="font-family: var(--sans)">${escapeHtml(p.name)}</td>
      <td>${p.score}</td>
      <td>${p.rec.w}-${p.rec.l}-${p.rec.t}</td>
      <td>${fmtPct(p.op)}</td>
      <td>${fmtPct(p.oop)}</td>
      <td>${p.rating || "—"}</td>
    `;
    body.appendChild(tr);
  });
}

/* ---------- REINICIO ---------- */

document.getElementById("resetBtn").addEventListener("click", () => {
  if (!confirm("Esto borrará jugadores, rondas y resultados. ¿Continuar?")) return;
  state = { name: "", totalRounds: 5, players: [], rounds: [] };
  saveState();
  renderAll();
});

/* ---------- RENDER GENERAL ---------- */

function renderAll() {
  document.getElementById("tName").value = state.name;
  document.getElementById("tRounds").value = state.totalRounds;
  document.getElementById("tournamentNameTag").textContent = state.name || "Sin torneo activo";
  renderPlayers();
  renderRounds();
  renderStandings();
}

renderAll();