/* =============================
   Lengua — Pablo (app.js)
   - Vistas: #home, #conjugaciones, #bv, #recursos  (clase .view / .active)
   - Botones home: #homeConj, #homeBV, #homeRec
   - Footer: #btn-home, #btn-reset, #score
   - Conjugaciones:
       #conjSentence, #conjInput, #conjCheck, #conjNext,
       #conjHint, #conjClassify
   - BV:
       #bvWord, #bvReveal, #bvB, #bvV, #bvNext
   - Recursos:
       #recMode, #recTheory, #recPractice, #recPrompt,
       #recButtons, #recNext
============================= */

const APP_VERSION = "2026-01-16-2248"; // cambia esto si quieres forzar recarga

const PATHS = {
  conjugaciones: `data/conjugaciones.json?v=${APP_VERSION}`,
  bv: `data/bv.json?v=${APP_VERSION}`,
  recursos: `data/recursos.json?v=${APP_VERSION}`,
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

/* ---------- Normalización (sin tildes / mayúsculas) ---------- */
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

/* ---------- Fetch robusto (evita caché) ---------- */
async function fetchJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} al cargar ${url}`);
  return await res.json();
}

/* ---------- Estado global ---------- */
const state = {
  view: "home",
  score: { ok: 0, total: 0 },

  data: {
    conj: [],
    bv: [],
    rec: [],
  },

  // Conjugaciones
  conj: {
    mode: "reconocer", // reconocer | producir
    current: null,
    phase: "answer", // answer | classify (según modo)
    classify: {
      modo: null, // Indicativo/Subjuntivo/Imperativo
      grupo: null, // Presente/Pretérito/Futuro/Condicional
      tipo: null, // depende del grupo
    },
  },

  // BV
  bv: {
    current: null,
    revealed: false,
  },

  // Recursos
  rec: {
    current: null,
  },
};

/* ---------- UI helpers ---------- */
function showFeedback(msg, kind = "ok") {
  const el = $("#feedback");
  if (!el) return;
  el.style.display = "block";
  el.classList.remove("ok", "bad");
  el.classList.add(kind === "ok" ? "ok" : "bad");
  el.textContent = msg;
}
function hideFeedback() {
  const el = $("#feedback");
  if (!el) return;
  el.style.display = "none";
  el.textContent = "";
}
function updateScore() {
  const el = $("#score");
  if (!el) return;
  el.textContent = `Aciertos: ${state.score.ok} / ${state.score.total}`;
}
function setView(viewId) {
  state.view = viewId;
  $$(".view").forEach((v) => v.classList.remove("active"));
  const target = $("#" + viewId);
  if (target) target.classList.add("active");
  hideFeedback();
}
function incTotal() {
  state.score.total += 1;
  updateScore();
}
function incOK() {
  state.score.ok += 1;
  updateScore();
}
function resetScore() {
  state.score.ok = 0;
  state.score.total = 0;
  updateScore();
}

/* ============================================================
   INIT
============================================================ */
async function init() {
  wireNav();

  try {
    const [conj, bv, rec] = await Promise.all([
      fetchJSON(PATHS.conjugaciones).catch(() => []),
      fetchJSON(PATHS.bv).catch(() => []),
      fetchJSON(PATHS.recursos).catch(() => []),
    ]);

    state.data.conj = Array.isArray(conj) ? conj : (conj.items ?? conj.data ?? []);
    state.data.bv = Array.isArray(bv) ? bv : (bv.items ?? bv.data ?? []);
    state.data.rec = Array.isArray(rec) ? rec : (rec.items ?? rec.data ?? []);

  } catch (e) {
    // si algo peta, no tumbamos toda la app
    console.warn(e);
  }

  updateScore();
  setView("home");
}

function wireNav() {
  // Home buttons
  $("#homeConj")?.addEventListener("click", () => {
    setView("conjugaciones");
    startConjugaciones();
  });
  $("#homeBV")?.addEventListener("click", () => {
    setView("bv");
    startBV();
  });
  $("#homeRec")?.addEventListener("click", () => {
    setView("recursos");
    startRecursos();
  });

  // Footer
  $("#btn-home")?.addEventListener("click", () => setView("home"));
  $("#btn-reset")?.addEventListener("click", () => {
    resetScore();
    hideFeedback();
  });
}

/* ============================================================
   CONJUGACIONES
   - Dos modos:
     1) Reconocer: frase -> extraer forma verbal (como ya tenías)
     2) Producir: sale una forma (del JSON) y Pablo la clasifica en 3 pasos
============================================================ */

function startConjugaciones() {
  // Por defecto dejamos el modo que ya tuvieses marcado en UI, si existe
  renderConjModeButtons();
  nextConjItem();
  renderConjugaciones();
}

function renderConjModeButtons() {
  const btnRec = $("#conjModeRec");
  const btnProd = $("#conjModeProd");

  // si no existen, no pasa nada (tu HTML puede no tenerlos)
  btnRec?.addEventListener("click", () => {
    state.conj.mode = "reconocer";
    state.conj.phase = "answer";
    hideFeedback();
    renderConjModeButtons();
    nextConjItem();
    renderConjugaciones();
  });
  btnProd?.addEventListener("click", () => {
    state.conj.mode = "producir";
    state.conj.phase = "classify";
    hideFeedback();
    renderConjModeButtons();
    nextConjItem();
    renderConjugaciones();
  });

  // estado visual (si tu CSS usa .selected)
  if (btnRec) btnRec.classList.toggle("selected", state.conj.mode === "reconocer");
  if (btnProd) btnProd.classList.toggle("selected", state.conj.mode === "producir");
}

function nextConjItem() {
  const arr = state.data.conj;
  if (!arr || arr.length === 0) {
    state.conj.current = null;
    return;
  }
  state.conj.current = pickRandom(arr);
  state.conj.classify = { modo: null, grupo: null, tipo: null };
  state.conj.phase = state.conj.mode === "reconocer" ? "answer" : "classify";
}

function renderConjugaciones() {
  const item = state.conj.current;

  const sentenceEl = $("#conjSentence");
  const inputEl = $("#conjInput");
  const checkBtn = $("#conjCheck");
  const nextBtn = $("#conjNext");
  const hintBtn = $("#conjHint");
  const classifyBox = $("#conjClassify");

  if (!item) {
    sentenceEl && (sentenceEl.textContent = "No hay datos en conjugaciones.json");
    classifyBox && (classifyBox.innerHTML = "");
    return;
  }

  // Reconocer: frase + input; Producir: mostrar forma y clasificar
  const sentence =
    getField(item, "frase", "sentence", "texto", "text") ||
    getField(item, "prompt", "enunciado") ||
    "";

  const expected =
    getField(item, "verbo", "respuesta", "answer", "target", "forma") || "";

  const form =
    getField(item, "forma", "form", "conjugacion", "conjugated") || expected;

  if (state.conj.mode === "reconocer") {
    // UI reconocer
    if (sentenceEl) sentenceEl.textContent = sentence || "(sin frase en el JSON)";
    if (inputEl) {
      inputEl.value = "";
      inputEl.style.display = "inline-block";
    }
    checkBtn && (checkBtn.style.display = "inline-block");
    hintBtn && (hintBtn.style.display = "inline-block");
    nextBtn && (nextBtn.style.display = "inline-block");
    if (classifyBox) classifyBox.style.display = "none";

    checkBtn?.onclick = () => {
      const user = normalizeAnswer(inputEl?.value || "");
      const ok = normalizeAnswer(user) === normalizeAnswer(expected);
      incTotal();
      if (ok) {
        incOK();
        showFeedback("¡Correcto!", "ok");
      } else {
        showFeedback(`No. La respuesta era: "${expected}"`, "bad");
      }
    };

    hintBtn?.onclick = () => {
      if (expected) showFeedback(`Pista: empieza por "${expected.slice(0, 2)}..."`, "ok");
    };

    nextBtn?.onclick = () => {
      hideFeedback();
      nextConjItem();
      renderConjugaciones();
    };

    return;
  }

  // Modo PRODUCIR (clasificación 3 pasos)
  if (sentenceEl) sentenceEl.textContent = `Forma: ${form || "(sin forma en el JSON)"}`;

  // ocultamos input de reconocer
  if (inputEl) inputEl.style.display = "none";
  checkBtn && (checkBtn.style.display = "none");
  hintBtn && (hintBtn.style.display = "none");

  if (classifyBox) {
    classifyBox.style.display = "block";
    classifyBox.innerHTML = buildConjClassifyUI();
    wireConjClassifyHandlers();
  }

  nextBtn?.onclick = () => {
    hideFeedback();
    nextConjItem();
    renderConjugaciones();
  };
}

function buildConjClassifyUI() {
  // Paso 2 SIEMPRE: Presente / Pretérito / Futuro / Condicional (como has pedido)
  // Paso 3 DEPENDE de Paso 2
  const modo = state.conj.classify.modo;
  const grupo = state.conj.classify.grupo;
  const tipo = state.conj.classify.tipo;

  const btn = (id, label, active) =>
    `<button type="button" class="pill ${active ? "selected" : ""}" data-pick="${id}">${label}</button>`;

  const modoRow = [
    btn("modo:Indicativo", "Indicativo", modo === "Indicativo"),
    btn("modo:Subjuntivo", "Subjuntivo", modo === "Subjuntivo"),
    btn("modo:Imperativo", "Imperativo", modo === "Imperativo"),
  ].join("");

  const grupoRow = [
    btn("grupo:Presente", "Presente", grupo === "Presente"),
    btn("grupo:Pretérito", "Pretérito", grupo === "Pretérito"),
    btn("grupo:Futuro", "Futuro", grupo === "Futuro"),
    btn("grupo:Condicional", "Condicional", grupo === "Condicional"),
  ].join("");

  let tipoRow = "";
  if (grupo === "Presente") {
    // como pediste: puede no haber 3) o quedarse “Presente simple”
    tipoRow = btn("tipo:Presente simple", "Presente simple", tipo === "Presente simple");
  } else if (grupo === "Pretérito") {
    tipoRow = [
      btn("tipo:Perfecto simple", "Perfecto simple", tipo === "Perfecto simple"),
      btn("tipo:Perfecto compuesto", "Perfecto compuesto", tipo === "Perfecto compuesto"),
      btn("tipo:Imperfecto", "Imperfecto", tipo === "Imperfecto"),
      btn("tipo:Pluscuamperfecto", "Pluscuamperfecto", tipo === "Pluscuamperfecto"),
      btn("tipo:Anterior", "Anterior", tipo === "Anterior"),
    ].join("");
  } else if (grupo === "Futuro") {
    tipoRow = [
      btn("tipo:Futuro simple", "Futuro simple", tipo === "Futuro simple"),
      btn("tipo:Futuro compuesto", "Futuro compuesto", tipo === "Futuro compuesto"),
    ].join("");
  } else if (grupo === "Condicional") {
    tipoRow = [
      btn("tipo:Condicional simple", "Condicional simple", tipo === "Condicional simple"),
      btn("tipo:Condicional compuesto", "Condicional compuesto", tipo === "Condicional compuesto"),
    ].join("");
  } else {
    tipoRow = `<div class="muted">Elige antes el paso 2.</div>`;
  }

  return `
    <div class="muted">Clasifica esta forma en 3 pasos.</div>

    <div class="step">
      <div class="stepTitle">1) Modo</div>
      <div class="pillRow">${modoRow}</div>
    </div>

    <div class="step">
      <div class="stepTitle">2) Tiempo (grupo)</div>
      <div class="pillRow">${grupoRow}</div>
    </div>

    <div class="step">
      <div class="stepTitle">3) Tipo exacto</div>
      <div class="pillRow">${tipoRow}</div>
    </div>

    <div class="row">
      <button type="button" class="btn" id="conjProdCheck">Comprobar</button>
    </div>
  `;
}

function wireConjClassifyHandlers() {
  const box = $("#conjClassify");
  if (!box) return;

  box.querySelectorAll("[data-pick]").forEach((b) => {
    b.addEventListener("click", () => {
      const [k, v] = b.dataset.pick.split(":");
      if (k === "modo") state.conj.classify.modo = v;
      if (k === "grupo") {
        state.conj.classify.grupo = v;
        state.conj.classify.tipo = null; // MUY IMPORTANTE: tipo depende del grupo
      }
      if (k === "tipo") state.conj.classify.tipo = v;

      // re-render para que se vea seleccionado y cambie el paso 3
      renderConjugaciones();
    });
  });

  box.querySelector("#conjProdCheck")?.addEventListener("click", () => {
    const item = state.conj.current;
    if (!item) return;

    // Intentamos leer del JSON la “verdad”.
    // Si no existe en tu JSON, no marcamos mal: avisamos.
    const truthModo = getField(item, "modo", "mode");
    const truthGrupo = getField(item, "grupo", "tiempoGrupo", "grupoTiempo");
    const truthTipo = getField(item, "tipo", "tiempo", "tenseExacto", "exact");

    if (!truthModo || !truthGrupo || !truthTipo) {
      showFeedback("No puedo corregir porque faltan campos (modo/grupo/tipo) en conjugaciones.json.", "bad");
      return;
    }

    const ok =
      normalizeAnswer(state.conj.classify.modo) === normalizeAnswer(truthModo) &&
      normalizeAnswer(state.conj.classify.grupo) === normalizeAnswer(truthGrupo) &&
      normalizeAnswer(state.conj.classify.tipo) === normalizeAnswer(truthTipo);

    incTotal();
    if (ok) {
      incOK();
      showFeedback("¡Correcto!", "ok");
    } else {
      showFeedback(
        `No. Era: ${truthModo} / ${truthGrupo} / ${truthTipo}`,
        "bad"
      );
    }
  });
}

/* ============================================================
   BV
   - Arregla el “sale resuelta”: SIEMPRE mostramos hueco.
   - Soporta varios formatos de JSON:
     A) { prompt:"bu_car", answer:"buscar", correct:"s" }
     B) { palabra:"buscar", correcta:"b", pos:0 }
     C) { word:"vivir", correct:"v" } (inferimos posición)
============================================================ */

function startBV() {
  nextBV();
  renderBV();
}

function nextBV() {
  const arr = state.data.bv;
  if (!arr || arr.length === 0) {
    state.bv.current = null;
    return;
  }
  state.bv.current = pickRandom(arr);
  state.bv.revealed = false;
}

function maskBVWord(word, correctLetter, pos) {
  const w = String(word || "");
  if (!w) return "";

  // si viene una “plantilla” con "_" o "?" ya está lista
  if (w.includes("_") || w.includes("?")) return w;

  const letter = String(correctLetter || "").toLowerCase();
  let idx = Number.isFinite(pos) ? pos : -1;

  if (idx < 0 && (letter === "b" || letter === "v")) {
    // buscamos primera ocurrencia de la letra correcta
    idx = w.toLowerCase().indexOf(letter);
  }
  if (idx < 0) {
    // si no se puede inferir, intentamos encontrar cualquier b/v y ocultarla
    const ib = w.toLowerCase().indexOf("b");
    const iv = w.toLowerCase().indexOf("v");
    idx = Math.min(...[ib, iv].filter((x) => x >= 0));
  }
  if (idx < 0) return w; // sin b/v, devolvemos tal cual

  return w.slice(0, idx) + "_" + w.slice(idx + 1);
}

function renderBV() {
  const item = state.bv.current;
  const wordEl = $("#bvWord");
  const revealEl = $("#bvReveal");
  const btnB = $("#bvB");
  const btnV = $("#bvV");
  const btnNext = $("#bvNext");

  if (!item) {
    wordEl && (wordEl.textContent = "No hay datos en bv.json");
    return;
  }

  const full =
    getField(item, "answer", "palabra", "word", "solucion", "correctWord") || "";

  const prompt =
    getField(item, "prompt", "hueco", "masked", "plantilla") || "";

  const correct =
    String(getField(item, "correct", "correcta", "letra", "letter") || "").toLowerCase();

  const posRaw = getField(item, "pos", "idx", "index");
  const pos = posRaw === "" ? NaN : Number(posRaw);

  const display = prompt || maskBVWord(full, correct, pos);

  if (wordEl) wordEl.textContent = display ? display : "(sin palabra en bv.json)";

  if (revealEl) revealEl.style.display = "none";

  btnB?.addEventListener("click", () => checkBV("b", full, correct));
  btnV?.addEventListener("click", () => checkBV("v", full, correct));
  btnNext?.addEventListener("click", () => {
    hideFeedback();
    nextBV();
    renderBV();
  });
}

function checkBV(pick, full, correct) {
  // si el JSON no trae “correct”, lo inferimos mirando si la palabra tiene b o v en el hueco (pero puede fallar)
  let truth = correct;
  if (truth !== "b" && truth !== "v") {
    // inferencia: si contiene b y no v, b; si contiene v y no b, v; si ambas, no se puede
    const wb = normalizeAnswer(full).includes("b");
    const wv = normalizeAnswer(full).includes("v");
    truth = wb && !wv ? "b" : wv && !wb ? "v" : "";
  }

  incTotal();
  if (!truth) {
    showFeedback("No puedo corregir porque bv.json no indica cuál es la letra correcta (b/v).", "bad");
    return;
  }

  if (pick === truth) {
    incOK();
    showFeedback("¡Correcto!", "ok");
  } else {
    showFeedback(`No. Era "${truth}".`, "bad");
  }
}

/* ============================================================
   RECURSOS LITERARIOS
   - Elimina el placeholder y muestra ejercicio real si hay datos
   - Soporta formatos:
     A) { texto, opciones:[...], correcta }
     B) { prompt, choices:[...], answer }
============================================================ */

function startRecursos() {
  nextRecurso();
  renderRecursos();
}

function nextRecurso() {
  const arr = state.data.rec;
  if (!arr || arr.length === 0) {
    state.rec.current = null;
    return;
  }
  state.rec.current = pickRandom(arr);
}

function renderRecursos() {
  const item = state.rec.current;
  const promptEl = $("#recPrompt");
  const buttonsEl = $("#recButtons");
  const nextBtn = $("#recNext");

  if (!promptEl || !buttonsEl) return;

  if (!item) {
    promptEl.textContent = "No hay datos en recursos.json";
    buttonsEl.innerHTML = "";
    nextBtn?.addEventListener("click", () => {});
    return;
  }

  const prompt = getField(item, "texto", "prompt", "frase", "text") || "(sin texto)";
  const options =
    getField(item, "opciones", "choices", "options") || [];

  const correct = getField(item, "correcta", "answer", "correct", "solution");

  promptEl.textContent = prompt;

  const opts = Array.isArray(options) ? options : [];
  if (opts.length === 0) {
    buttonsEl.innerHTML =
      `<div class="muted">recursos.json cargado, pero no trae "opciones/choices".</div>`;
  } else {
    buttonsEl.innerHTML = opts
      .map((o, i) => `<button type="button" class="pill" data-rec="${i}">${o}</button>`)
      .join("");
    buttonsEl.querySelectorAll("[data-rec]").forEach((b) => {
      b.addEventListener("click", () => {
        const i = Number(b.dataset.rec);
        const picked = opts[i];

        if (!correct) {
          showFeedback("No puedo corregir porque recursos.json no indica la respuesta correcta.", "bad");
          return;
        }

        incTotal();
        const ok = normalizeAnswer(picked) === normalizeAnswer(correct);
        if (ok) {
          incOK();
          showFeedback("¡Correcto!", "ok");
        } else {
          showFeedback(`No. Era: ${correct}`, "bad");
        }
      });
    });
  }

  nextBtn?.addEventListener("click", () => {
    hideFeedback();
    nextRecurso();
    renderRecursos();
  });
}

/* ============================================================
   Arranque
============================================================ */
init();
