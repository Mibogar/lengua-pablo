/* =========================
   Lengua – Pablo
   app.js limpio y funcional
   ========================= */

const views = ["home", "conjugaciones", "bv", "recursos"];

function showView(id) {
  views.forEach(v => {
    document.getElementById(v).classList.remove("active");
  });
  document.getElementById(id).classList.add("active");
}

/* ---------- Navegación ---------- */
document.getElementById("homeConj").onclick = () => {
  showView("conjugaciones");
  loadConjugacion();
};
document.getElementById("homeBV").onclick = () => {
  showView("bv");
  loadBV();
};
document.getElementById("homeRec").onclick = () => {
  showView("recursos");
  loadRecurso();
};
document.getElementById("btn-home").onclick = () => showView("home");

/* ---------- CONJUGACIONES ---------- */
let conjugaciones = [];
let conjActual = null;

async function loadConjugacionesData() {
  const res = await fetch("data/conjugaciones.json");
  conjugaciones = await res.json();
}

function loadConjugacion() {
  if (!conjugaciones.length) return;
  conjActual = conjugaciones[Math.floor(Math.random() * conjugaciones.length)];
  document.getElementById("conjSentence").textContent = conjActual.frase;
  document.getElementById("conjInput").value = "";
}

document.getElementById("conjCheck").onclick = () => {
  const user = document.getElementById("conjInput").value.trim().toLowerCase();
  const correcto = conjActual.verbo.toLowerCase();
  alert(user === correcto ? "✅ Correcto" : `❌ Era: ${conjActual.verbo}`);
};

document.getElementById("conjNext").onclick = loadConjugacion;

/* ---------- B / V ---------- */
let bvData = [];
let bvActual = null;

async function loadBVData() {
  const res = await fetch("data/bv.json");
  bvData = await res.json();
}

function loadBV() {
  if (!bvData.length) return;
  bvActual = bvData[Math.floor(Math.random() * bvData.length)];
  document.getElementById("bvWord").textContent = bvActual.palabra.replace("_", "_");
}

document.getElementById("bvB").onclick = () => checkBV("b");
document.getElementById("bvV").onclick = () => checkBV("v");
document.getElementById("bvNext").onclick = loadBV;

function checkBV(letra) {
  alert(letra === bvActual.correcta ? "✅ Correcto" : `❌ Era: ${bvActual.correcta}`);
}

/* ---------- RECURSOS ---------- */
let recursos = [];
let recursoActual = null;

async function loadRecursosData() {
  const res = await fetch("data/recursos.json");
  recursos = await res.json();
}

function loadRecurso() {
  if (!recursos.length) return;
  recursoActual = recursos[Math.floor(Math.random() * recursos.length)];
  document.getElementById("recPrompt").textContent = recursoActual.texto;
}

document.querySelectorAll("#recButtons button").forEach(btn => {
  btn.onclick = () => {
    const elegido = btn.dataset.recurso;
    alert(elegido === recursoActual.tipo ? "✅ Correcto" : `❌ Era: ${recursoActual.tipo}`);
  };
});

document.getElementById("recNext").onclick = loadRecurso;

/* ---------- INIT ---------- */
async function init() {
  await loadConjugacionesData();
  await loadBVData();
  await loadRecursosData();
}

init();
