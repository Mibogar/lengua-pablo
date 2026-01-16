/* ==============================
   Lengua — Pablo (app.js)
   - Vistas: #home, #conjugaciones, #bv, #recursos  (clase .view / .active)
   - Botones home: #homeConj, #homeBV, #homeRec
   - Footer: #btn-home, #btn-reset, #score
   - Conjugaciones:
        #conjSentence, #conjInput, #conjCheck, #conjNext, #conjHint, #conjClassify
   - BV:
        #bvWord, #bvReveal, #bvB, #bvV, #bvNext
   - Recursos:
        #recMode, #recTheory, #recPractice, #recPrompt, #recButtons, #recNext
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
let conjVerbOK = false;
let conjClass = null; // estado de clasificación

function getConjSentence(item) {
  return String(getField(item, "frase", "sentence", "texto") || "").trim();
}
function getConjSolution(item) {
  const raw = getField(
    item,
    "solucion",
    "Solucion",
    "verbo",
    "Verbo",
    "forma",
    "Forma",
    "respuesta",
    "Respuesta"
  );
  return String(raw || "").trim();
}

function pickConjWithSolution(maxTries = 50) {
  if (!DATA.conjugaciones.length) return null;

  for (let i = 0; i < maxTries; i++) {
    const cand = pickRandom(DATA.conjugaciones);
    const sent = getConjSentence(cand);
    const sol = getConjSolution(cand);
    if (sent && sol) return cand;
  }
  return pickRandom(DATA.conjugaciones);
}

/* --- Catálogos de opciones --- */
const CONJ_OPTIONS = {
  persona: ["primera", "segunda", "tercera"],
  numero: ["singular", "plural"],
  // Tiempos típicos (ajústalo si quieres: el JSON manda)
  tiempo: [
    "presente",
    "pretérito perfecto simple",
    "pretérito imperfecto",
    "pretérito perfecto compuesto",
    "pretérito pluscuamperfecto",
    "futuro simple",
    "futuro compuesto",
    "condicional simple",
    "condicional compuesto",
  ],
  modo: ["indicativo", "subjuntivo", "imperativo"],
  conjugacion: ["1ª", "2ª", "3ª"],
  aspecto: ["simple", "compuesto", "perifrástico"],
  voz: ["activa", "pasiva", "pasiva refleja"],
  regularidad: ["regular", "irregular"],
};

function normCellValue(v) {
  return normalizeAnswer(String(v || ""));
}

/* --- Render clasificación (después de acertar el verbo) --- */
function buildChoiceGroup(key, title, expectedRaw) {
  const expected = normCellValue(expectedRaw);

  // Si el valor del JSON no está en el catálogo, lo añadimos para que se pueda elegir
  let options = (CONJ_OPTIONS[key] || []).slice();
  const expectedPretty = String(expectedRaw || "").trim();
  const expectedNorm = normCellValue(expectedPretty);

  if (expectedPretty && !options.some((o) => normCellValue(o) === expectedNorm)) {
    options.unshift(expectedPretty); // lo ponemos primero
  }

  const wrap = document.createElement("div");
  wrap.className = "question";

  const h = document.createElement("div");
  h.style.display = "flex";
  h.style.justifyContent = "space-between";
  h.style.alignItems = "center";
  h.style.gap = "10px";

  const label = document.createElement("div");
  label.style.fontWeight = "700";
  label.textContent = title;

  const status = document.createElement("div");
  status.id = `st-${key}`;
  status.style.fontSize = "13px";
  status.style.opacity = "0.9";
  status.textContent = "⏳ pendiente";

  h.appendChild(label);
  h.appendChild(status);

  const choices = document.createElement("div");
  choices.className = "choices";

  options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.textContent = opt;
    btn.dataset.key = key;
    btn.dataset.value = opt;
    choices.appendChild(btn);
  });

  wrap.appendChild(h);
  wrap.appendChild(choices);

  return { wrap, expectedNorm: expected, expectedRaw: expectedPretty };
}

function startConjClassification() {
  const box = $("#conjClassify");
  if (!box) return;

  // Estado
  conjClass = {
    answered: {}, // key -> boolean correcto
    expected: {}, // key -> expectedNorm
    expectedRaw: {}, // key -> expectedRaw
  };

  // Campos desde JSON
  const expected = {
    persona: getField(conjCurrent, "persona", "Pers.", "pers"),
    numero: getField(conjCurrent, "numero", "Núm.", "num"),
    tiempo: getField(conjCurrent, "tiempo", "Tiempo"),
    modo: getField(conjCurrent, "modo", "Modo"),
    conjugacion: getField(conjCurrent, "conjugacion", "Conj.", "conj"),
    aspecto: getField(conjCurrent, "aspecto", "Asp.", "asp"),
    voz: getField(conjCurrent, "voz", "Voz"),
    regularidad: getField(conjCurrent, "regularidad", "Reg.", "reg"),
  };

  box.style.display = "block";
  box.innerHTML = "";

  const title = document.createElement("div");
  title.style.fontWeight = "800";
  title.style.marginTop = "14px";
  title.style.marginBottom = "8px";
  title.textContent = "Clasifica el verbo:";
  box.appendChild(title);

  const grid = document.createElement("div");
  grid.style.display = "grid";
  grid.style.gridTemplateColumns = "repeat(auto-fit, minmax(240px, 1fr))";
  grid.style.gap = "12px";

  const defs = [
    ["persona", "1) Persona", expected.persona],
    ["numero", "2) Número", expected.numero],
    ["tiempo", "3) Tiempo", expected.tiempo],
    ["modo", "4) Modo", expected.modo],
    ["conjugacion", "5) Conjugación", expected.conjugacion],
    ["aspecto", "6) Aspecto", expected.aspecto],
    ["voz", "7) Voz", expected.voz],
    ["regularidad", "8) Regular/Irregular", expected.regularidad],
  ];

  defs.forEach(([key, label, expRaw]) => {
    const g = buildChoiceGroup(key, label, expRaw);
    conjClass.expected[key] = g.expectedNorm;
    conjClass.expectedRaw[key] = g.expectedRaw;
    grid.appendChild(g.wrap);
  });

  box.appendChild(grid);

  const summary = document.createElement("div");
  summary.id = "conjSummary";
  summary.style.marginTop = "12px";
  summary.style.opacity = "0.9";
  summary.textContent = "Completa las 8 clasificaciones.";
  box.appendChild(summary);

  // Delegación clicks
  box.onclick = (e) => {
    const btn = e.target.closest("button.chip");
    if (!btn) return;

    const key = btn.dataset.key;
    const valueRaw = btn.dataset.value;
    const value = normCellValue(valueRaw);
    const expectedNorm = conjClass.expected[key];

    // desmarcar selección previa del grupo
    btn.parentElement.querySelectorAll("button.chip").forEach((b) => {
      b.style.outline = "none";
      b.style.opacity = "0.9";
    });

    // marcar seleccionado
    btn.style.outline = "2px solid rgba(91,140,255,.55)";
    btn.style.opacity = "1";

    const ok = value === expectedNorm;
    conjClass.answered[key] = ok;

    const st = document.getElementById(`st-${key}`);
    if (st) {
      st.textContent = ok ? "✅ correcto" : `❌ era: ${conjClass.expectedRaw[key] || "(vacío)"}`;
      st.style.color = ok ? "var(--good)" : "var(--bad)";
      st.style.fontWeight = "700";
    }

    updateConjSummary();
  };

  updateConjSummary();
}

function updateConjSummary() {
  const sum = $("#conjSummary");
  if (!sum || !conjClass) return;

  const keys = [
    "persona",
    "numero",
    "tiempo",
    "modo",
    "conjugacion",
    "aspecto",
    "voz",
    "regularidad",
  ];

  const answeredCount = keys.filter((k) => k in conjClass.answered).length;
  const correctCount = keys.filter((k) => conjClass.answered[k] === true).length;

  if (answeredCount < keys.length) {
    sum.textContent = `Progreso: ${answeredCount}/8 · Correctas: ${correctCount}`;
    return;
  }

  // completado
  sum.textContent = `✅ Clasificación completada. Correctas: ${correctCount}/8`;
  showFeedback(`✅ Clasificación completada: ${correctCount}/8`, "ok");
}

/* --- Render / Check conjugaciones --- */
function renderConj() {
  setModeTitle("Conjugaciones verbales");
  if (!DATA.conjugaciones.length) {
    showFeedback("No hay datos de conjugaciones cargados.", "bad");
    return;
  }

  conjCurrent = pickConjWithSolution();
  conjVerbOK = false;
  conjClass = null;

  const sentence = getConjSentence(conjCurrent);
  const solution = getConjSolution(conjCurrent);

  $("#conjSentence").textContent = sentence || "(Sin frase en el JSON)";
  $("#conjInput").value = "";
  $("#conjHint").textContent = "Escribe el verbo (o grupo verbal) tal como aparece en la frase.";

  const classify = $("#conjClassify");
  if (classify) {
    classify.style.display = "none";
    classify.innerHTML = "";
    classify.onclick = null;
  }

  if (!solution) {
    showFeedback("⚠️ Esta frase no tiene solución guardada. Pulsa “Siguiente”.", "bad");
  }
}

function checkConjVerb() {
  if (!conjCurrent) return;

  const typed = normalizeAnswer($("#conjInput").value);
  const solutionRaw = getConjSolution(conjCurrent);
  const solution = normalizeAnswer(solutionRaw);

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
    conjVerbOK = true;

    // Aquí empieza la “conjugación” (clasificación)
    startConjClassification();
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

  // Botones de respuesta recursos (delegación)
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

  // Registrar SW (no imprescindible para que funcione)
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
});
