const PATHS = {
  conjugaciones: "data/conjugaciones.json",
  bv: "data/bv.json",
  recursos: "data/recursos.json",
};

const VERSION = (window.APP_VERSION || "dev");

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

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
async function loadJson(path) {
  const url = `${path}?v=${encodeURIComponent(VERSION)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo cargar ${url} (${res.status})`);
  return res.json();
}

function show(el, on) {
  if (!el) return;
  el.classList.toggle("hidden", !on);
}

function setFeedback(el, msg, ok) {
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
  el.classList.toggle("ok", !!ok);
  el.classList.toggle("bad", !ok);
}

function clearFeedback(el) {
  if (!el) return;
  el.classList.add("hidden");
  el.textContent = "";
  el.classList.remove("ok", "bad");
}

function setSelected(groupEl, value) {
  if (!groupEl) return;
  groupEl.querySelectorAll("button").forEach((b) => {
    b.classList.toggle("selected", b.dataset.value === value);
  });
}

function buildChoiceButtons(container, values, onPick) {
  container.innerHTML = "";
  values.forEach((v) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.textContent = v;
    btn.dataset.value = v;
    btn.addEventListener("click", () => onPick(v));
    container.appendChild(btn);
  });
}

/* ---------------- Views ---------------- */
const views = {
  home: $("#viewHome"),
  conj: $("#viewConj"),
  bv: $("#viewBV"),
  rec: $("#viewRec"),
};

function go(viewName) {
  Object.entries(views).forEach(([k, el]) => {
    el.classList.toggle("active", k === viewName);
  });
}

/* ---------------- Global Score ---------------- */
const score = {
  totalOk: 0,
  totalAll: 0,

  conjOk: 0, conjAll: 0,
  bvOk: 0, bvAll: 0,
  recOk: 0, recAll: 0,
};

function renderScores() {
  $("#globalScore").textContent = `Aciertos: ${score.totalOk} / ${score.totalAll}`;
  $("#conjScore").textContent = `Aciertos: ${score.conjOk} / ${score.conjAll}`;
  $("#bvScore").textContent = `Aciertos: ${score.bvOk} / ${score.bvAll}`;
  $("#recScore").textContent = `Aciertos: ${score.recOk} / ${score.recAll}`;
}

/* ---------------- HOME wiring ---------------- */
$("#homeConj").addEventListener("click", () => { go("conj"); conjStart(); });
$("#homeBV").addEventListener("click", () => { go("bv"); bvStart(); });
$("#homeRec").addEventListener("click", () => { go("rec"); recStart(); });

$("#btnHome").addEventListener("click", () => go("home"));
$("#btnListo").addEventListener("click", () => go("home"));

$("#btnReset").addEventListener("click", () => {
  score.totalOk = score.totalAll = 0;
  score.conjOk = score.conjAll = 0;
  score.bvOk = score.bvAll = 0;
  score.recOk = score.recAll = 0;
  renderScores();
});

/* ---------------- CONJUGACIONES ---------------- */
let conjData = null;

let conjMode = "recon"; // recon | prod
let conjCurrentRecon = null;

let prodCurrent = null;
let prodSel = { modo:"", grupo:"", tipo:"", persona:"", numero:"" };

const conjReconBox = $("#conjReconBox");
const conjProdBox = $("#conjProdBox");

function conjSetMode(mode) {
  conjMode = mode;
  show(conjReconBox, mode === "recon");
  show(conjProdBox, mode === "prod");

  $("#conjTabRecon").classList.toggle("selected", mode === "recon");
  $("#conjTabProd").classList.toggle("selected", mode === "prod");

  if (mode === "recon") conjNextRecon();
  else prodNext();
}

$("#conjTabRecon").addEventListener("click", () => conjSetMode("recon"));
$("#conjTabProd").addEventListener("click", () => conjSetMode("prod"));

async function conjStart() {
  try {
    if (!conjData) conjData = await loadJson(PATHS.conjugaciones);
  } catch (e) {
    alert(`Error cargando conjugaciones.json: ${e.message}`);
    return;
  }
  conjSetMode(conjMode);
  renderScores();
}

function conjPickReconItem() {
  // Acepta que el JSON sea un array o {items:[...]}
  const arr = Array.isArray(conjData) ? conjData : (conjData.items || conjData.reconocer || []);
  return pickRandom(arr);
}

function conjNextRecon() {
  clearFeedback($("#conjFeedback"));
  const item = conjPickReconItem();
  conjCurrentRecon = item;

  const sentence = getField(item, "frase", "sentence", "texto");
  $("#conjSentence").textContent = sentence || "(frase no encontrada en el JSON)";

  $("#conjInput").value = "";
  $("#conjInput").focus();
}

$("#conjNext").addEventListener("click", conjNextRecon);

$("#conjCheck").addEventListener("click", () => {
  const expected = getField(conjCurrentRecon, "solucion", "answer", "verbo", "forma");
  const user = $("#conjInput").value;

  const ok = normalizeAnswer(user) === normalizeAnswer(expected);

  score.totalAll++; score.conjAll++;
  if (ok) { score.totalOk++; score.conjOk++; }

  setFeedback(
    $("#conjFeedback"),
    ok ? "¡Correcto!" : `No. La respuesta era: "${expected}"`,
    ok
  );

  renderScores();
});

/* ----- Producir / clasificar ----- */

function conjPickProdItem() {
  // Reutiliza el mismo JSON: si no hay sección específica, elige elementos que tengan "forma"
  const arr = Array.isArray(conjData) ? conjData : (conjData.producir || conjData.items || []);
  // Filtra candidatos con forma (o solucion/answer)
  const candidates = arr.filter(x => getField(x, "forma", "solucion", "answer"));
  return candidates.length ? pickRandom(candidates) : pickRandom(arr);
}

function prodBuildTipoOptions(grupo) {
  // Grupo en el paso 2: Presente / Pretérito / Futuro / Condicional
  if (grupo === "Presente") return ["Presente"];
  if (grupo === "Futuro") return ["Futuro simple", "Futuro compuesto"];
  if (grupo === "Condicional") return ["Condicional simple", "Condicional compuesto"];
  if (grupo === "Pretérito") {
    return [
      "Imperfecto",
      "Perfecto simple",
      "Perfecto compuesto",
      "Pluscuamperfecto",
      "Pretérito anterior",
    ];
  }
  return [];
}

function prodResetSelections() {
  prodSel = { modo:"", grupo:"", tipo:"", persona:"", numero:"" };
  ["#prodModo","#prodGrupo","#prodTipo","#prodPersona","#prodNumero"].forEach(sel => {
    const el = $(sel);
    if (el) el.querySelectorAll("button").forEach(b => b.classList.remove("selected"));
  });
}

function prodRenderChoices() {
  // 1) Modo
  buildChoiceButtons($("#prodModo"), ["Indicativo","Subjuntivo","Imperativo"], (v) => {
    prodSel.modo = v;
    setSelected($("#prodModo"), v);
  });

  // 2) Grupo
  buildChoiceButtons($("#prodGrupo"), ["Presente","Pretérito","Futuro","Condicional"], (v) => {
    prodSel.grupo = v;
    setSelected($("#prodGrupo"), v);

    // Al cambiar grupo, rehacer Tipo (3)
    prodSel.tipo = "";
    const tipos = prodBuildTipoOptions(v);
    buildChoiceButtons($("#prodTipo"), tipos, (t) => {
      prodSel.tipo = t;
      setSelected($("#prodTipo"), t);
    });
  });

  // 3) Tipo empieza vacío hasta elegir grupo
  $("#prodTipo").innerHTML = `<span class="muted">Elige antes el paso 2.</span>`;

  // Persona / número
  buildChoiceButtons($("#prodPersona"), ["1ª","2ª","3ª"], (v) => {
    prodSel.persona = v;
    setSelected($("#prodPersona"), v);
  });
  buildChoiceButtons($("#prodNumero"), ["Singular","Plural"], (v) => {
    prodSel.numero = v;
    setSelected($("#prodNumero"), v);
  });
}

function prodNext() {
  clearFeedback($("#prodFeedback"));
  prodResetSelections();
  prodRenderChoices();

  prodCurrent = conjPickProdItem();

  // “forma” es lo que se muestra para clasificar
  const forma = getField(prodCurrent, "forma", "solucion", "answer");
  $("#prodForma").textContent = forma || "(sin forma en el JSON)";
}

$("#prodNext").addEventListener("click", prodNext);

function normalizeLabel(s) {
  return String(s || "").trim();
}

$("#prodCheck").addEventListener("click", () => {
  // Esperados desde JSON (si existen). Si no existen, no podemos corregir: avisamos.
  const exp = {
    modo: normalizeLabel(getField(prodCurrent, "modo")),
    grupo: normalizeLabel(getField(prodCurrent, "grupo", "tiempo", "grupoTiempo")),
    tipo: normalizeLabel(getField(prodCurrent, "tipo", "subtipo")),
    persona: normalizeLabel(getField(prodCurrent, "persona")),
    numero: normalizeLabel(getField(prodCurrent, "numero")),
  };

  // Si el JSON no tiene metadatos, no hay forma fiable de corregir
  const hasMeta = Object.values(exp).some(v => v);
  if (!hasMeta) {
    setFeedback(
      $("#prodFeedback"),
      "Este ítem no tiene modo/tiempo/persona/número en el JSON, así que no se puede corregir. (Añade esos campos en conjugaciones.json).",
      false
    );
    return;
  }

  // Reglas del paso 3: si grupo es Presente, tipo debe ser Presente (o vacío)
  let ok =
    (!exp.modo || prodSel.modo === exp.modo) &&
    (!exp.grupo || prodSel.grupo === exp.grupo) &&
    (!exp.tipo || prodSel.tipo === exp.tipo) &&
    (!exp.persona || prodSel.persona === exp.persona) &&
    (!exp.numero || prodSel.numero === exp.numero);

  score.totalAll++; score.conjAll++;
  if (ok) { score.totalOk++; score.conjOk++; }

  setFeedback(
    $("#prodFeedback"),
    ok ? "¡Correcto!" : `No. Esperado: ${JSON.stringify(exp)}`,
    ok
  );
  renderScores();
});

/* ---------------- BV ---------------- */
let bvData = null;
let bvCurrent = null;

async function bvStart() {
  try {
    if (!bvData) bvData = await loadJson(PATHS.bv);
  } catch (e) {
    alert(`Error cargando bv.json: ${e.message}`);
    return;
  }
  bvNext();
  renderScores();
}

function bvMaskFromItem(item) {
  // Soporta varias formas:
  // 1) {masked:"b_scar", pick:"b", correct:"buscar"}
  // 2) {word:"buscar", missing:"b"} -> "_uscar"
  // 3) {texto:"b_scar", correcta:"buscar"} etc.
  const masked = getField(item, "masked", "texto", "mask");
  const correct = getField(item, "correct", "correcta", "word", "palabra");
  const missing = getField(item, "pick", "missing", "letra");

  if (masked) {
    return {
      masked,
      pick: missing || (masked.includes("_") ? null : null),
      correct: correct || "",
    };
  }

  if (correct && missing) {
    const m = correct.replace(new RegExp(missing, "i"), "_");
    return { masked: m, pick: missing.toLowerCase(), correct };
  }

  // fallback: si solo hay word, no se puede
  return { masked: correct || "(sin datos)", pick: "", correct: correct || "" };
}

function bvNext() {
  clearFeedback($("#bvFeedback"));
  const arr = Array.isArray(bvData) ? bvData : (bvData.items || []);
  bvCurrent = pickRandom(arr);

  const info = bvMaskFromItem(bvCurrent);
  $("#bvWord").textContent = info.masked;
}

$("#bvNext").addEventListener("click", bvNext);

function bvAnswer(letter) {
  const info = bvMaskFromItem(bvCurrent);
  const expectedLetter = (info.pick || "").toLowerCase();

  // Si no hay expectedLetter, intentamos deducirlo comparando masked->correct
  let exp = expectedLetter;
  if (!exp && info.masked.includes("_") && info.correct) {
    // buscamos la letra que llena el hueco
    const i = info.masked.indexOf("_");
    exp = info.correct[i]?.toLowerCase() || "";
  }

  const ok = letter.toLowerCase() === exp;

  score.totalAll++; score.bvAll++;
  if (ok) { score.totalOk++; score.bvOk++; }

  setFeedback(
    $("#bvFeedback"),
    ok ? "¡Correcto!" : `No. Era "${exp}".`,
    ok
  );
  renderScores();
}

$("#bvB").addEventListener("click", () => bvAnswer("b"));
$("#bvV").addEventListener("click", () => bvAnswer("v"));

/* ---------------- RECURSOS ---------------- */
let recData = null;
let recCurrent = null;

async function recStart() {
  try {
    if (!recData) recData = await loadJson(PATHS.recursos);
  } catch (e) {
    alert(`Error cargando recursos.json: ${e.message}`);
    return;
  }
  recNext();
  renderScores();
}

function recNext() {
  clearFeedback($("#recFeedback"));

  const arr = Array.isArray(recData) ? recData : (recData.items || recData.recursos || []);
  recCurrent = pickRandom(arr);

  const text = getField(recCurrent, "texto", "frase", "sentence");
  $("#recText").textContent = text || "(texto no encontrado en el JSON)";

  const options =
    recCurrent.opciones ||
    recCurrent.options ||
    recCurrent.choices ||
    [];

  const correct = getField(recCurrent, "correcta", "correct", "answer");

  const box = $("#recButtons");
  box.innerHTML = "";

  if (!options.length) {
    box.innerHTML = `<span class="muted">No hay opciones en recursos.json (campo "opciones").</span>`;
    return;
  }

  options.forEach((opt) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = opt;
    b.addEventListener("click", () => {
      const ok = normalizeAnswer(opt) === normalizeAnswer(correct);

      score.totalAll++; score.recAll++;
      if (ok) { score.totalOk++; score.recOk++; }

      setFeedback(
        $("#recFeedback"),
        ok ? "¡Correcto!" : `No. Era "${correct}".`,
        ok
      );

      renderScores();
    });
    box.appendChild(b);
  });
}

$("#recNext").addEventListener("click", recNext);

/* ---------------- Boot ---------------- */
go("home");
renderScores();
