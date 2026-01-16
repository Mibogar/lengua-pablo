/* ==============================
   Lengua — Pablo (app.js)
   Compatible con el index.html actual
   - Vistas: #home, #conjugaciones, #bv, #recursos
   - Botones: #homeConj, #homeBV, #homeRec
   - Footer: #btn-home, #btn-reset, #score
   - Conjugaciones: #conjSentence, #conjInput, #conjCheck, #conjNext, #conjHint, #conjClassify
   - BV: #bvWord, #bvReveal, #bvB, #bvV, #bvNext
   - Recursos: #recMode, #recTheory, #recPractice, #recPrompt, #recButtons, #recNext
================================ */

const PATHS = {
  conjugaciones: "data/conjugaciones.json",
  bv: "data/bv.json",
  recursos: "data/recursos.json",
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

/* ---------- Normalización (no distingue mayúsculas ni tildes) ---------- */
function stripDiacritics(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
function normalizeAnswer(s) {
  return stripDiacritics(s).trim().replace(/\s+/g, " ").toLowerCase();
}
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function getField(obj, ...keys) {
  for (const k of keys) {
    if (obj && obj[k] != null && String(obj[k]).trim() !== "") return obj[k];
  }
  return "";
}

/* ---------- Feedback UI ---------- */
function showFeedback(msg, kind = "ok") {
  const el = $("#feedback");
  if (!el) return;
  el.style.display = "block";
  el.className = `feedback ${kind}`;
  el.textContent = msg;
}
function hideFeedback() {
  const el = $("#feedback");
  if (!el) return;
  el.style.display = "none";
  el.textContent = "";
  el.className = "feedback";
}
function setModeTitle(txt) {
  const el = $("#modeTitle");
  if (el) el.textContent = txt ? ` ${txt}` : "";
}
function setPill(txt) {
  const el = $("#pill-status");
  if (el) el.textContent = txt || "Listo";
}

/* ---------- Navegación por vistas ---------- */
function setView(id) {
  hideFeedback();
  $$(".view").forEach((v) => v.classList.remove("active"));
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
}

/* ---------- Marcador ---------- */
const score = { correct: 0, total: 0 };
function updateScore() {
  const el = $("#score");
  if (el) el.textContent = `Aciertos: ${score.correct} / ${score.total}`;
}
function resetScore() {
  score.correct = 0;
  score.total = 0;
  updateScore();
  showFeedback("Marcador reiniciado.", "ok");
}

/* ---------- Carga de datos ---------- */
let DATA = { conjugaciones: [], bv: [], recursos: [] };

async function loadJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo cargar ${url} (${res.status})`);
  return res.json();
}

async function loadAllData() {
  try {
    setPill("Cargando…");
    const [c, b, r] = await Promise.all([
      loadJson(PATHS.conjugaciones),
      loadJson(PATHS.bv),
      loadJson(PATHS.recursos),
    ]);

    DATA.conjugaciones = Array.isArray(c) ? c : (c.items || []);
    DATA.bv = Array.isArray(b) ? b : (b.items || []);
    DATA.recursos = Array.isArray(r) ? r : (r.items || []);

    setPill("Listo");

    if (!DATA.conjugaciones.length) console.warn("conjugaciones.json vacío");
    if (!DATA.bv.length) console.warn("bv.json vacío");
    if (!DATA.recursos.length) console.warn("recursos.json vacío");
  } catch (e) {
    console.error(e);
    setPill("Error");
    showFeedback(
      "Error cargando datos. Revisa que existan data/conjugaciones.json, data/bv.json y data/recursos.json.",
      "bad"
    );
  }
}

/* ======================
   CONJUGACIONES
   ====================== */
let conjCurrent = null;

function getConjSentence(item) {
  return String(getField(item, "frase", "sentence", "texto") || "").trim();
}

/* Clave: solución del verbo/grupo verbal */
function getConjSolution(item) {
  // Lo intentamos en orden “más probable”
  const raw = getField(
    item,
    "solucion",
    "Solucion",
    "verbo",
    "Verbo",
    "forma",
    "Forma",
    "respuesta",
    "Respuesta",
    "form"
  );
  return String(raw || "").trim();
}

function pickConjWithSolution(maxTries = 30) {
  if (!DATA.conjugaciones.length) return null;

  for (let i = 0; i < maxTries; i++) {
    const cand = pickRandom(DATA.conjugaciones);
    const sent = getConjSentence(cand);
    const sol = getConjSolution(cand);
    if (sent && sol) return cand;
  }

  // Si después de varios intentos no encontramos, devolvemos cualquiera (pero avisaremos)
  return pickRandom(DATA.conjugaciones);
}

function renderConj() {
  setModeTitle("Conjugaciones verbales");
  if (!DATA.conjugaciones.length) {
    showFeedback("No hay datos de conjugaciones cargados.", "bad");
    return;
  }

  conjCurrent = pickConjWithSolution();
  const sentence = getConjSentence(conjCurrent);
  const solution = getConjSolution(conjCurrent);

  $("#conjSentence").textContent = sentence || "(Sin frase en el JSON)";
  $("#conjInput").value = "";
  $("#conjHint").textContent = "Escribe el verbo (o grupo verbal) tal como aparece en la frase.";

  // Ocultar/limpiar la zona de clasificación (para el siguiente paso del proyecto)
  const classify = $("#conjClassify");
  if (classify) {
    classify.style.display = "none";
    classify.innerHTML = "";
  }

  // Si no hay solución, avisamos (sin penalizar) y sugerimos pasar a otra
  if (!solution) {
    showFeedback(
      "⚠️ Esta frase no tiene solución guardada en los datos. Pulsa “Siguiente”.",
      "bad"
    );
  }
}

function checkConjVerb() {
  if (!conjCurrent) return;

  const typed = normalizeAnswer($("#conjInput").value);
  const solutionRaw = getConjSolution(conjCurrent);
  const solution = normalizeAnswer(solutionRaw);

  // Si no hay solución, no evaluamos (evita el bug del "")
  if (!solution) {
    showFeedback(
      "⚠️ Esta frase no tiene solución en los datos (no se puede corregir). Pulsa “Siguiente”.",
      "bad"
    );
    return;
  }

  score.total += 1;

  if (typed === solution) {
    score.correct += 1;
    updateScore();
    showFeedback("✅ ¡Correcto!", "ok");
  } else {
    updateScore();
    showFeedback(`❌ No. La respuesta era: "${solutionRaw}"`, "bad");
  }
}

/* ======================
   B / V
   ====================== */
let bvCurrent = null;

function renderBV() {
  setModeTitle("Ortografía: b / v");
  if (!DATA.bv.length) {
    showFeedback("No hay datos b/v cargados.", "bad");
    return;
  }

  bvCurrent = pickRandom(DATA.bv);

  const hueco =
    getField(bvCurrent, "Con_hueco", "con_hueco", "hueco", "blank") || "";
  const palabra =
    getField(bvCurrent, "Palabra_correcta", "palabra_correcta", "palabra", "correcta") ||
    "";
  const letra = getField(bvCurrent, "Letra", "letra", "answer") || "";

  bvCurrent.__hueco = hueco;
  bvCurrent.__palabra = palabra;
  bvCurrent.__letra = normalizeAnswer(letra);

  $("#bvWord").textContent = hueco || "(Sin palabra en el JSON)";
  $("#bvReveal").textContent = "";
}

function answerBV(letter) {
  if (!bvCurrent) return;

  score.total += 1;

  const ok = normalizeAnswer(letter) === bvCurrent.__letra;
  if (ok) score.correct += 1;
  updateScore();

  if (ok) showFeedback("✅ ¡Correcto!", "ok");
  else showFeedback(`❌ No. Era "${bvCurrent.__palabra}"`, "bad");

  $("#bvReveal").textContent = `Solución: ${bvCurrent.__palabra}`;
}

/* ======================
   RECURSOS LITERARIOS
   ====================== */
let recMode = "teoría";
let recCurrent = null;

function setRecMode(mode) {
  recMode = mode;
  const el = $("#recMode");
  if (el) el.textContent = mode === "teoría" ? "Teoría" : "Práctica";
  renderRec();
}

function renderRec() {
  setModeTitle("Recursos literarios");
  if (!DATA.recursos.length) {
    showFeedback("No hay datos de recursos literarios cargados.", "bad");
    return;
  }

  const filtered = DATA.recursos.filter((x) => {
    const m = normalizeAnswer(getField(x, "Modo", "modo", "mode"));
    return m === normalizeAnswer(recMode);
  });

  recCurrent = pickRandom(filtered.length ? filtered : DATA.recursos);

  const prompt = String(getField(recCurrent, "Enunciado", "enunciado", "texto", "prompt") || "");
  const answer = String(getField(recCurrent, "Respuesta", "respuesta", "tipo", "Tipo") || "");

  recCurrent.__answerRaw = answer;
  recCurrent.__answer = normalizeAnswer(answer);

  $("#recPrompt").textContent = prompt || "(Sin enunciado en el JSON)";
}

function answerRec(chosen) {
  if (!recCurrent) return;

  score.total += 1;

  const ok = normalizeAnswer(chosen) === recCurrent.__answer;
  if (ok) score.correct += 1;
  updateScore();

  if (ok) showFeedback("✅ ¡Correcto!", "ok");
  else showFeedback(`❌ No. Era: "${recCurrent.__answerRaw}"`, "bad");
}

/* ======================
   WIRING / INIT
   ====================== */
function wireUI() {
  // Home buttons
  $("#homeConj").addEventListener("click", () => {
    setView("conjugaciones");
    renderConj();
  });
  $("#homeBV").addEventListener("click", () => {
    setView("bv");
    renderBV();
  });
  $("#homeRec").addEventListener("click", () => {
    setView("recursos");
    setRecMode("teoría");
  });

  // Footer
  $("#btn-home").addEventListener("click", () => setView("home"));
  $("#btn-reset").addEventListener("click", () => resetScore());

  // Conjugaciones
  $("#conjCheck").addEventListener("click", checkConjVerb);
  $("#conjNext").addEventListener("click", renderConj);
  $("#conjInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") checkConjVerb();
  });

  // BV
  $("#bvB").addEventListener("click", () => answerBV("b"));
  $("#bvV").addEventListener("click", () => answerBV("v"));
  $("#bvNext").addEventListener("click", renderBV);

  // Recursos
  $("#recTheory").addEventListener("click", () => setRecMode("teoría"));
  $("#recPractice").addEventListener("click", () => setRecMode("práctica"));
  $("#recNext").addEventListener("click", renderRec);

  // Botones de respuesta (delegación)
  $("#recButtons").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-recurso]");
    if (!btn) return;
    answerRec(btn.dataset.recurso);
  });

  updateScore();
}

window.addEventListener("DOMContentLoaded", async () => {
  wireUI();
  await loadAllData();

  setView("home");
  setModeTitle("");
  setPill("Listo");

  // Registrar SW si existe (no es imprescindible para que funcione)
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
});

