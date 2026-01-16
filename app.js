/* Lengua — Pablo (GitHub Pages / PWA)
   Compatible con el index.html actual (ids: home, conjugaciones, bv, recursos...)
*/

const PATHS = {
  conjugaciones: "data/conjugaciones.json",
  bv: "data/bv.json",
  recursos: "data/recursos.json",
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function stripDiacritics(s) {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeAnswer(s) {
  return stripDiacritics(String(s ?? ""))
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

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

function setView(id) {
  hideFeedback();
  $$(".view").forEach((v) => v.classList.remove("active"));
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
}

const score = {
  correct: 0,
  total: 0,
};
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

/* ====== DATA ====== */
let DATA = {
  conjugaciones: [],
  bv: [],
  recursos: [],
};

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

    // Aceptamos tanto {items:[...]} como [...]
    DATA.conjugaciones = Array.isArray(c) ? c : (c.items || []);
    DATA.bv = Array.isArray(b) ? b : (b.items || []);
    DATA.recursos = Array.isArray(r) ? r : (r.items || []);

    if (!DATA.conjugaciones.length) console.warn("conjugaciones.json vacío");
    if (!DATA.bv.length) console.warn("bv.json vacío");
    if (!DATA.recursos.length) console.warn("recursos.json vacío");

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

/* ====== CONJUGACIONES ====== */
let conjCurrent = null;
let conjAnsweredCorrect = false;
let conjSelections = {}; // field -> chosen

const CONJ_OPTIONS = {
  persona: ["primera", "segunda", "tercera"],
  numero: ["singular", "plural"],
  modo: ["indicativo", "subjuntivo", "imperativo"],
  tiempo: [
    "presente",
    "pretérito imperfecto",
    "pretérito perfecto simple",
    "pretérito perfecto compuesto",
    "pluscuamperfecto",
    "futuro",
    "condicional",
    "presente de subjuntivo",
    "pretérito imperfecto de subjuntivo",
    "pretérito perfecto de subjuntivo",
    "pluscuamperfecto de subjuntivo",
    "imperativo",
  ],
  conjugacion: ["-ar", "-er", "-ir"],
  aspecto: ["simple", "compuesto"],
  voz: ["activa", "pasiva"],
  regularidad: ["regular", "irregular"],
};

function getField(obj, ...keys) {
  for (const k of keys) {
    if (obj && obj[k] != null && obj[k] !== "") return obj[k];
  }
  return "";
}

function renderConj() {
  setModeTitle("Conjugaciones verbales");
  setPill("Listo");

  if (!DATA.conjugaciones.length) {
    showFeedback("No hay datos de conjugaciones cargados.", "bad");
    return;
  }

  conjCurrent = pickRandom(DATA.conjugaciones);
  conjAnsweredCorrect = false;
  conjSelections = {};

  const sentence = getField(conjCurrent, "frase", "sentence", "texto");
  const verb = getField(conjCurrent, "forma", "verbo", "respuesta", "form");

  $("#conjSentence").textContent = sentence || "(Sin frase en el JSON)";
  $("#conjInput").value = "";
  $("#conjHint").textContent = "Escribe el verbo tal como aparece en la frase.";

  // Ocultar/limpiar clasificación
  const classify = $("#conjClassify");
  classify.style.display = "none";
  classify.innerHTML = "";

  // Guardamos el verbo correcto (para comparar)
  conjCurrent.__verbTarget = verb;
}

function checkConjVerb() {
  if (!conjCurrent) return;

  const typed = $("#conjInput").value;
  const target = conjCurrent.__verbTarget;

  // Normalizamos: no distingue mayúsculas y no penaliza tildes
  const ok = normalizeAnswer(typed) === normalizeAnswer(target);

  score.total += 1;
  if (ok) score.correct += 1;
  updateScore();

  if (!ok) {
    showFeedback(`❌ No. La respuesta era: "${target}"`, "bad");
    conjAnsweredCorrect = false;
    $("#conjHint").textContent = "Fíjate en la frase y copia el verbo exactamente.";
    return;
  }

  showFeedback("✅ ¡Correcto! Ahora clasifícalo con los botones.", "ok");
  conjAnsweredCorrect = true;
  $("#conjHint").textContent = "Ahora elige persona, número, tiempo, modo, etc.";

  renderConjClassify();
}

function renderConjClassify() {
  const wrap = $("#conjClassify");
  wrap.style.display = "block";
  wrap.innerHTML = "";

  const mapping = [
    ["persona", "Persona"],
    ["numero", "Número"],
    ["tiempo", "Tiempo"],
    ["modo", "Modo"],
    ["conjugacion", "Conjugación"],
    ["aspecto", "Aspecto"],
    ["voz", "Voz"],
    ["regularidad", "Regular/irregular"],
  ];

  // En el JSON puede venir como "pers", "num", etc.
  const correctByField = {
    persona: normalizeAnswer(getField(conjCurrent, "persona", "pers")),
    numero: normalizeAnswer(getField(conjCurrent, "numero", "num")),
    tiempo: normalizeAnswer(getField(conjCurrent, "tiempo")),
    modo: normalizeAnswer(getField(conjCurrent, "modo")),
    conjugacion: normalizeAnswer(getField(conjCurrent, "conjugacion", "conj")),
    aspecto: normalizeAnswer(getField(conjCurrent, "aspecto", "asp")),
    voz: normalizeAnswer(getField(conjCurrent, "voz")),
    regularidad: normalizeAnswer(getField(conjCurrent, "regularidad", "reg")),
  };

  mapping.forEach(([field, label]) => {
    const card = document.createElement("div");
    card.className = "question";

    const h = document.createElement("div");
    h.className = "sentence";
    h.style.fontSize = "14px";
    h.style.opacity = "0.9";
    h.textContent = label;
    card.appendChild(h);

    const row = document.createElement("div");
    row.className = "choices";

    // Opciones
    const opts = CONJ_OPTIONS[field] || [];
    opts.forEach((opt) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn chip";
      btn.textContent = opt;

      btn.addEventListener("click", () => {
        const chosen = normalizeAnswer(opt);
        conjSelections[field] = chosen;

        // Pintar estado
        const correct = correctByField[field];
        $$(".question").forEach(() => {}); // noop

        // Reset visual de botones de esta fila
        Array.from(row.querySelectorAll("button")).forEach((b) => {
          b.classList.remove("ok", "bad");
        });

        if (!correct) {
          // Si el JSON no trae este campo, no penalizamos (evitamos “falsos suspensos”)
          btn.classList.add("ok");
          showFeedback(`✅ Guardado: ${label}. (Sin clave en datos para corregir)`, "ok");
          return;
        }

        if (chosen === correct) {
          btn.classList.add("ok");
          showFeedback(`✅ ${label}: correcto.`, "ok");
        } else {
          btn.classList.add("bad");
          showFeedback(`❌ ${label}: no. Correcto: "${correct}".`, "bad");
        }
      });

      row.appendChild(btn);
    });

    card.appendChild(row);
    wrap.appendChild(card);
  });
}

/* ====== B/V ====== */
let bvCurrent = null;

function renderBV() {
  setModeTitle("Ortografía: b / v");
  setPill("Listo");

  if (!DATA.bv.length) {
    showFeedback("No hay datos b/v cargados.", "bad");
    return;
  }

  bvCurrent = pickRandom(DATA.bv);

  // Aceptamos distintos nombres de campo
  const hueco =
    getField(bvCurrent, "Con_hueco", "con_hueco", "hueco", "blank") ||
    "";
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

  if (ok) {
    showFeedback("✅ ¡Correcto!", "ok");
  } else {
    showFeedback(`❌ No. Era "${bvCurrent.__palabra}"`, "bad");
  }

  $("#bvReveal").textContent = `Solución: ${bvCurrent.__palabra}`;
}

/* ====== RECURSOS ====== */
let recMode = "teoría"; // "teoría" | "práctica"
let recCurrent = null;

function setRecMode(mode) {
  recMode = mode;
  $("#recMode").textContent = mode === "teoría" ? "Teoría" : "Práctica";
  renderRec();
}

function renderRec() {
  setModeTitle("Recursos literarios");
  setPill("Listo");

  if (!DATA.recursos.length) {
    showFeedback("No hay datos de recursos literarios cargados.", "bad");
    return;
  }

  const filtered = DATA.recursos.filter((x) => {
    const m = normalizeAnswer(getField(x, "Modo", "modo", "mode"));
    return m === normalizeAnswer(recMode);
  });

  recCurrent = pickRandom(filtered.length ? filtered : DATA.recursos);

  const prompt = getField(recCurrent, "Enunciado", "enunciado", "texto", "prompt") || "";
  const answer = getField(recCurrent, "Respuesta", "respuesta", "tipo", "Tipo") || "";

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
  else showFeedback(`❌ No. Era: "${recCurrent.__answer}"`, "bad");
}

/* ====== WIRING ====== */
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
  $("#conjNext").addEventListener("click", () => renderConj());
  $("#conjInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") checkConjVerb();
  });

  // BV
  $("#bvB").addEventListener("click", () => answerBV("b"));
  $("#bvV").addEventListener("click", () => answerBV("v"));
  $("#bvNext").addEventListener("click", () => renderBV());

  // Recursos
  $("#recTheory").addEventListener("click", () => setRecMode("teoría"));
  $("#recPractice").addEventListener("click", () => setRecMode("práctica"));
  $("#recNext").addEventListener("click", () => renderRec());

  // Botones de respuesta (delegación)
  $("#recButtons").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-recurso]");
    if (!btn) return;
    answerRec(btn.dataset.recurso);
  });

  updateScore();
}

/* ====== INIT ====== */
window.addEventListener("DOMContentLoaded", async () => {
  wireUI();
  await loadAllData();

  // Pantalla inicial
  setView("home");
  setModeTitle("");
  setPill("Listo");

  // Registrar SW (si existe)
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
});
