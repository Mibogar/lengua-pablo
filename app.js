"use strict";

/* Anti-silencio: si algo revienta, lo verás en consola */
window.addEventListener("error", e => console.log("JS ERROR", e));
window.addEventListener("unhandledrejection", e => console.log("PROMISE ERROR", e));

document.addEventListener("DOMContentLoaded", init);

const state = {
  view: "home",
  score: { ok: 0, ko: 0 },

  bv: { items: [], i: 0, locked: false },
  rec: { items: [], i: 0, locked: false },
  conj: { items: [], iRec: 0, iProd: 0, lockedRec: false, lockedProd: false }
};

function $(sel){ return document.querySelector(sel); }
function $all(sel){ return Array.from(document.querySelectorAll(sel)); }

function init(){
  bindNav();
  bindScore();
  bindBV();
  bindRecursos();
  bindConjTabs();
  bindConjReconocer();
  bindConjProducir();

  loadAllData().then(() => {
    loadScore();
    renderScore();
    go("home");
  });
}

function bindNav(){
  $all("[data-go]").forEach(btn => {
    btn.addEventListener("click", () => go(btn.dataset.go));
  });
}

function go(viewId){
  state.view = viewId;
  $all(".view").forEach(v => v.classList.remove("active"));
  const el = document.getElementById(viewId);
  if(!el){
    console.log("Vista no encontrada:", viewId);
    return;
  }
  el.classList.add("active");

  // refrescos suaves por vista
  if(viewId === "bv") renderBV();
  if(viewId === "recursos") renderRec();
  if(viewId === "conj") {
    // por defecto, Reconocer
    setConjTab("reconocer");
    renderConjReconocer();
  }
}

/* ---------- SCORE ---------- */

function bindScore(){
  $("#resetScore").addEventListener("click", () => {
    state.score = { ok: 0, ko: 0 };
    saveScore();
    renderScore();
  });
}

function renderScore(){
  $("#scoreOk").textContent = String(state.score.ok);
  $("#scoreKo").textContent = String(state.score.ko);
}

function saveScore(){
  localStorage.setItem("lp_score", JSON.stringify(state.score));
}

function loadScore(){
  const raw = localStorage.getItem("lp_score");
  if(!raw) return;
  try{
    const s = JSON.parse(raw);
    if(typeof s?.ok === "number" && typeof s?.ko === "number"){
      state.score = s;
    }
  }catch(_){}
}

function scoreOk(msgEl){
  state.score.ok++;
  saveScore();
  renderScore();
  setFeedback(msgEl, "✅ ¡Bien!", true);
}

function scoreKo(msgEl, text){
  state.score.ko++;
  saveScore();
  renderScore();
  setFeedback(msgEl, `❌ ${text}`, false);
}

function setFeedback(el, text, ok){
  el.classList.remove("ok","ko");
  el.textContent = text || "";
  if(text) el.classList.add(ok ? "ok" : "ko");
}

/* ---------- DATA LOADING ---------- */

async function loadAllData(){
  const [bv, rec, conj] = await Promise.all([
    fetchJson("./data/bv.json"),
    fetchJson("./data/recursos.json"),
    fetchJson("./data/conjugaciones.json")
  ]);

  state.bv.items = Array.isArray(bv) ? bv : [];
  state.rec.items = Array.isArray(rec) ? rec : [];
  state.conj.items = Array.isArray(conj) ? conj : [];

  // defensivo: si está vacío, al menos no crashea
  if(state.bv.items.length === 0) console.log("bv.json vacío");
  if(state.rec.items.length === 0) console.log("recursos.json vacío");
  if(state.conj.items.length === 0) console.log("conjugaciones.json vacío");
}

async function fetchJson(path){
  const res = await fetch(path, { cache: "no-store" });
  if(!res.ok) throw new Error(`No puedo cargar ${path} (${res.status})`);
  return res.json();
}

/* ---------- BV ---------- */

function bindBV(){
  $("#btnB").addEventListener("click", () => answerBV("b"));
  $("#btnV").addEventListener("click", () => answerBV("v"));
  $("#bvNext").addEventListener("click", () => nextBV());
}

function currentBV(){
  if(state.bv.items.length === 0) return null;
  return state.bv.items[state.bv.i % state.bv.items.length];
}

function renderBV(){
  state.bv.locked = false;
  setFeedback($("#bvFeedback"), "", true);

  const item = currentBV();
  if(!item){
    $("#bvPrompt").textContent = "No hay datos en bv.json";
    return;
  }
  $("#bvPrompt").innerHTML = `Completa: <strong>${escapeHtml(item.pattern)}</strong>`;
}

function answerBV(letter){
  if(state.bv.locked) return;
  const item = currentBV();
  if(!item) return;

  state.bv.locked = true;
  if(letter === item.missing){
    scoreOk($("#bvFeedback"));
  }else{
    scoreKo($("#bvFeedback"), `Era “${item.missing}” (palabra: ${item.word})`);
  }
}

function nextBV(){
  state.bv.i++;
  renderBV();
}

/* ---------- RECURSOS ---------- */

function bindRecursos(){
  $("#recNext").addEventListener("click", () => nextRec());
}

function currentRec(){
  if(state.rec.items.length === 0) return null;
  return state.rec.items[state.rec.i % state.rec.items.length];
}

function renderRec(){
  state.rec.locked = false;
  setFeedback($("#recFeedback"), "", true);

  const item = currentRec();
  if(!item){
    $("#recText").textContent = "No hay datos en recursos.json";
    $("#recOptions").innerHTML = "";
    return;
  }

  $("#recText").textContent = item.text;
  const box = $("#recOptions");
  box.innerHTML = "";

  (item.options || []).forEach(opt => {
    const btn = document.createElement("button");
    btn.textContent = opt;
    btn.className = "choice";
    btn.addEventListener("click", () => answerRec(opt));
    box.appendChild(btn);
  });
}

function answerRec(opt){
  if(state.rec.locked) return;
  const item = currentRec();
  if(!item) return;

  state.rec.locked = true;
  if(opt === item.answer){
    scoreOk($("#recFeedback"));
  }else{
    scoreKo($("#recFeedback"), `Respuesta correcta: ${item.answer}`);
  }
}

function nextRec(){
  state.rec.i++;
  renderRec();
}

/* ---------- CONJ: Tabs ---------- */

function bindConjTabs(){
  $all(".tab").forEach(btn => {
    btn.addEventListener("click", () => setConjTab(btn.dataset.tab));
  });
}

function setConjTab(tab){
  $all(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  const rec = $("#conjReconocer");
  const prod = $("#conjProducir");
  const isRec = tab === "reconocer";
  rec.hidden = !isRec;
  prod.hidden = isRec;

  if(isRec) renderConjReconocer();
  else renderConjProducir();
}

/* ---------- CONJ: Util ---------- */

function currentConjForRec(){
  if(state.conj.items.length === 0) return null;
  return state.conj.items[state.conj.iRec % state.conj.items.length];
}
function currentConjForProd(){
  if(state.conj.items.length === 0) return null;
  return state.conj.items[state.conj.iProd % state.conj.items.length];
}

function norm(s){
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")   // quita tildes
    .replace(/\s+/g, " ");
}

function conjHelpText(item){
  if(!item) return "";
  return [
    `Forma: ${item.forma}`,
    `Verbo: ${item.verbo}`,
    `Pronombre: ${item.pronombre}`,
    `Modo: ${item.modo}`,
    `Grupo: ${item.grupo}`,
    `Tipo: ${item.tipo}`,
    `Persona/Número: ${item.persona} ${item.numero}`
  ].join("\n");
}

/* ---------- CONJ: Reconocer ---------- */

function bindConjReconocer(){
  $("#cjCheckRec").addEventListener("click", checkConjReconocer);
  $("#cjNextRec").addEventListener("click", () => { state.conj.iRec++; renderConjReconocer(); });

  $("#cjHelpRec").addEventListener("click", () => {
    const box = $("#cjHelpBoxRec");
    box.hidden = !box.hidden;
  });
}

function renderConjReconocer(){
  state.conj.lockedRec = false;
  setFeedback($("#cjFeedbackRec"), "", true);

  const item = currentConjForRec();
  if(!item){
    $("#cjForma").textContent = "—";
    $("#cjHelpBoxRec").hidden = true;
    $("#cjHelpBoxRec").textContent = "";
    return;
  }

  $("#cjForma").textContent = item.forma;

  // reset inputs
  $("#cjModo").value = "";
  $("#cjGrupo").value = "";
  $("#cjTipo").value = "";
  $("#cjPersona").value = "";
  $("#cjNumero").value = "";

  $("#cjHelpBoxRec").hidden = true;
  $("#cjHelpBoxRec").textContent = conjHelpText(item);
}

function checkConjReconocer(){
  if(state.conj.lockedRec) return;
  const item = currentConjForRec();
  if(!item) return;

  state.conj.lockedRec = true;

  const modo = $("#cjModo").value;
  const grupo = $("#cjGrupo").value;
  const tipo = $("#cjTipo").value;
  const persona = $("#cjPersona").value;
  const numero = $("#cjNumero").value;

  const ok =
    norm(modo) === norm(item.modo) &&
    norm(grupo) === norm(item.grupo) &&
    norm(tipo) === norm(item.tipo) &&
    norm(persona) === norm(item.persona) &&
    norm(numero) === norm(item.numero);

  if(ok){
    scoreOk($("#cjFeedbackRec"));
  }else{
    scoreKo($("#cjFeedbackRec"), `Correcto: ${item.modo} · ${item.grupo} · ${item.tipo} · ${item.persona} ${item.numero}`);
  }
}

/* ---------- CONJ: Producir ---------- */

function bindConjProducir(){
  $("#cjCheckProd").addEventListener("click", checkConjProducir);
  $("#cjNextProd").addEventListener("click", () => { state.conj.iProd++; renderConjProducir(); });

  $("#cjHelpProd").addEventListener("click", () => {
    const box = $("#cjHelpBoxProd");
    box.hidden = !box.hidden;
  });
}

function renderConjProducir(){
  state.conj.lockedProd = false;
  setFeedback($("#cjFeedbackProd"), "", true);

  const item = currentConjForProd();
  if(!item){
    $("#cjPromptProd").textContent = "No hay datos en conjugaciones.json";
    $("#cjHelpBoxProd").hidden = true;
    $("#cjHelpBoxProd").textContent = "";
    return;
  }

  const prompt = `${item.persona}ª persona ${item.numero.toLowerCase()} del ${item.tipo.toLowerCase()} de ${item.modo.toLowerCase()} de “${item.verbo}”`;
  $("#cjPromptProd").textContent = prompt;

  $("#cjAnswerProd").value = "";
  $("#cjHelpBoxProd").hidden = true;
  $("#cjHelpBoxProd").textContent = conjHelpText(item);
}

function checkConjProducir(){
  if(state.conj.lockedProd) return;
  const item = currentConjForProd();
  if(!item) return;

  state.conj.lockedProd = true;

  const ans = norm($("#cjAnswerProd").value);

  // Aceptamos dos formas:
  // 1) solo la forma ("cantaba")
  // 2) pronombre + forma ("el cantaba") sin tildes (por norm)
  const expected1 = norm(item.forma);
  const expected2 = norm(`${item.pronombre} ${item.forma}`);

  if(ans === expected1 || ans === expected2){
    scoreOk($("#cjFeedbackProd"));
  }else{
    scoreKo($("#cjFeedbackProd"), `Era: “${item.pronombre} ${item.forma}” (o solo “${item.forma}”)`);
  }
}

/* ---------- Helpers ---------- */

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
