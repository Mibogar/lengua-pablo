/* Lengua — Pablo (app.js)
   - Navegación por vistas con .view / .view.active
   - 3 módulos: conjugaciones, b/v, recursos
*/

const PATHS = {
  conjugaciones: "data/conjugaciones.json",
  bv: "data/bv.json",
  recursos: "data/recursos.json",
};

// Helpers DOM
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function showFeedback(msg, kind = "ok") {
  const el = $("#feedback");
  if (!el) return;
  el.classList.remove("hidden");
  el.classList.toggle("ok", kind === "ok");
  el.classList.toggle("bad", kind === "bad");
  el.textContent = msg;
  clearTimeout(showFeedback._t);
  showFeedback._t = setTimeout(() => el.classList.add("hidden"), 1800);
}

// Normalización (sin tildes, sin mayúsculas, espacios colapsados)
function stripDiacritics(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
function norm(s) {
  return stripDiacritics(s).trim().replace(/\s+/g, " ").toLowerCase();
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function loadJSON(path) {
  // Cache-bust suave para GitHub Pages
  const url = `${path}?v=${Date.now()}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`No se pudo cargar ${path} (${r.status})`);
  return r.json();
}

/* ----------------- Navegación ----------------- */
function setView(id) {
  $$(".view").forEach(v => v.classList.remove("active"));
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
}

function bindNav() {
  $("#homeConj")?.addEventListener("click", () => { setView("conjugaciones"); conj.ensureLoaded().then(() => conj.next()); });
  $("#homeBV")?.addEventListener("click", () => { setView("bv"); bv.ensureLoaded().then(() => bv.next()); });
  $("#homeRec")?.addEventListener("click", () => { setView("recursos"); rec.ensureLoaded().then(() => rec.next()); });

  $("#btn-home")?.addEventListener("click", () => setView("home"));
  $("#btn-ready")?.addEventListener("click", () => setView("home"));

  $("#btn-reset")?.addEventListener("click", () => {
    appScore.reset();
    showFeedback("Marcador reiniciado", "ok");
    conj.reset();
    bv.reset();
    rec.reset();
    appScore.render();
  });
}

const appScore = {
  ok: 0,
  total: 0,
  add(isOk) {
    this.total += 1;
    if (isOk) this.ok += 1;
    this.render();
  },
  reset() { this.ok = 0; this.total = 0; this.render(); },
  render() {
    const el = $("#score");
    if (el) el.textContent = `Aciertos: ${this.ok} / ${this.total}`;
  }
};

/* ----------------- Conjugaciones ----------------- */
/* Formato tolerante:
   - Reconocer: esperamos items con { sentence, answer } o { frase, respuesta } etc.
   - Producir: items con { forma, modo, grupo, tipo } o variantes.
*/
const conj = {
  data: null,
  mode: "reconocer", // reconocer | producir
  current: null,

  scoreOk: 0,
  scoreTot: 0,

  async ensureLoaded() {
    if (this.data) return;
    const raw = await loadJSON(PATHS.conjugaciones);

    // Acepta array o {items:[...]}
    const items = Array.isArray(raw) ? raw : (raw.items || raw.data || []);
    this.data = items;

    // UI bindings (una vez)
    this.bindUI();
  },

  bindUI() {
    $("#conjModeRecon")?.addEventListener("click", () => this.setMode("reconocer"));
    $("#conjModeProd")?.addEventListener("click", () => this.setMode("producir"));

    $("#conjCheck")?.addEventListener("click", () => this.checkRecon());
    $("#conjInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.checkRecon();
    });
    $("#conjNext")?.addEventListener("click", () => this.next());

    $("#prodCheck")?.addEventListener("click", () => this.checkProd());
    $("#prodNext")?.addEventListener("click", () => this.next());
  },

  reset() {
    this.scoreOk = 0;
    this.scoreTot = 0;
    $("#conjScore") && ($("#conjScore").textContent = "");
    $("#prodScore") && ($("#prodScore").textContent = "");
  },

  setMode(m) {
    this.mode = m;
    const reconUI = $("#conjReconUI");
    const prodUI = $("#conjProdUI");
    if (m === "reconocer") {
      reconUI?.classList.remove("hidden");
      prodUI?.classList.add("hidden");
      showFeedback("Modo: Reconocer", "ok");
    } else {
      reconUI?.classList.add("hidden");
      prodUI?.classList.remove("hidden");
      showFeedback("Modo: Producir", "ok");
    }
    this.next();
  },

  getField(obj, ...keys) {
    for (const k of keys) {
      const v = obj?.[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
    return "";
  },

  next() {
    if (!this.data || this.data.length === 0) {
      $("#conjSentence").textContent = "No hay datos de conjugaciones.";
      return;
    }

    this.current = pickRandom(this.data);

    if (this.mode === "reconocer") {
      const sentence = this.getField(this.current, "sentence", "frase", "texto", "oracion");
      $("#conjSentence").textContent = sentence || "(sin frase en el JSON)";

      $("#conjInput").value = "";
      $("#conjHint").textContent = "";
      $("#conjScore").textContent = `Aciertos: ${this.scoreOk} / ${this.scoreTot}`;
      return;
    }

    // PRODUCIR (clasificar forma)
    const forma = this.getField(this.current, "forma", "form", "conjugacion", "respuesta", "answer");
    $("#prodForm").textContent = forma ? forma : "(sin forma en el JSON)";
    $("#conjSentence").textContent = ""; // en producir no mostramos frase

    // Opciones fijas
    this.prodSel = { modo: null, grupo: null, tipo: null };

    renderChips("#prodStep1", ["Indicativo", "Subjuntivo", "Imperativo"], (v) => {
      this.prodSel.modo = v;
      markSelected("#prodStep1", v);
    });

    renderChips("#prodStep2", ["Presente", "Pretérito", "Futuro", "Condicional"], (v) => {
      this.prodSel.grupo = v;
      markSelected("#prodStep2", v);
      this.renderStep3(v);
    });

    // Step3 empieza vacío hasta elegir step2
    $("#prodStep3").innerHTML = `<span class="muted">Elige antes el paso 2.</span>`;
    $("#prodScore").textContent = `Aciertos: ${this.scoreOk} / ${this.scoreTot}`;
  },

  renderStep3(grupo) {
    const wrap = $("#prodStep3");
    if (!wrap) return;

    let opts = [];
    if (grupo === "Presente") {
      // como tú pediste: o no hay step3 o se queda “Presente simple”
      opts = ["Presente simple"];
    } else if (grupo === "Pretérito") {
      opts = [
        "Pretérito imperfecto",
        "Pretérito perfecto simple",
        "Pretérito perfecto compuesto",
        "Pretérito pluscuamperfecto",
        "Pretérito anterior",
      ];
    } else if (grupo === "Futuro") {
      opts = ["Futuro simple", "Futuro compuesto"];
    } else if (grupo === "Condicional") {
      opts = ["Condicional simple", "Condicional compuesto"];
    }

    this.prodSel.tipo = null;
    renderChips("#prodStep3", opts, (v) => {
      this.prodSel.tipo = v;
      markSelected("#prodStep3", v);
    });
  },

  checkRecon() {
    const expected = this.getField(this.current, "answer", "respuesta", "verbo", "solucion");
    const user = $("#conjInput").value;

    const ok = norm(user) === norm(expected);

    this.scoreTot += 1;
    if (ok) this.scoreOk += 1;

    appScore.add(ok);
    $("#conjHint").textContent = ok ? "✅ ¡Correcto!" : `❌ No. La respuesta era: "${expected}"`;
    $("#conjScore").textContent = `Aciertos: ${this.scoreOk} / ${this.scoreTot}`;
  },

  checkProd() {
    // En esta versión, el “check” de producir valida SOLO que haya elegido los 3 pasos
    // (porque no sabemos tu esquema exacto del JSON para comparar modo/grupo/tipo).
    // Cuando me pegues 2-3 entradas reales de conjugaciones.json lo conectamos a datos.
    const { modo, grupo, tipo } = this.prodSel || {};
    const ok = Boolean(modo && grupo && (grupo === "Presente" ? true : tipo));

    this.scoreTot += 1;
    if (ok) this.scoreOk += 1;
    appScore.add(ok);

    $("#prodScore").textContent = `Aciertos: ${this.scoreOk} / ${this.scoreTot}`;
    showFeedback(ok ? "¡Clasificación guardada!" : "Faltan pasos por elegir", ok ? "ok" : "bad");
  }
};

/* ----------------- b/v ----------------- */
/* Formatos aceptados en bv.json:
   - "vi_ir" (string con hueco)
   - { pattern:"vi_ir", answer:"v" }
   - { word:"vivir", missing:"v", index:0 } -> crea patrón con "_"
   - { word:"vivir", answer:"v" } -> intenta inferir primer b/v
*/
const bv = {
  data: null,
  current: null,
  scoreOk: 0,
  scoreTot: 0,

  async ensureLoaded() {
    if (this.data) return;
    const raw = await loadJSON(PATHS.bv);
    const items = Array.isArray(raw) ? raw : (raw.items || raw.data || []);
    this.data = items;
    this.bindUI();
  },

  bindUI() {
    $("#bvB")?.addEventListener("click", () => this.answer("b"));
    $("#bvV")?.addEventListener("click", () => this.answer("v"));
    $("#bvNext")?.addEventListener("click", () => this.next());
  },

  reset() {
    this.scoreOk = 0;
    this.scoreTot = 0;
    $("#bvScore") && ($("#bvScore").textContent = "");
  },

  toBVItem(x) {
    // string pattern
    if (typeof x === "string") {
      return { pattern: x, answer: x.includes("_") ? null : null };
    }

    const pattern = x.pattern || x.patron || x.text || x.display || "";
    const word = x.word || x.palabra || "";
    let ans = (x.answer || x.respuesta || x.correct || x.letra || "").toLowerCase();

    // Si ya trae pattern con hueco
    if (pattern && pattern.includes("_")) {
      // intenta obtener answer si viene
      return { pattern, answer: ans || null, word: word || null };
    }

    // Si trae word + missing/index
    if (word) {
      const idx = Number.isInteger(x.index) ? x.index : Number.isInteger(x.pos) ? x.pos : null;
      const missing = (x.missing || x.letra || "").toLowerCase();

      if (idx !== null && missing) {
        const patt = word.slice(0, idx) + "_" + word.slice(idx + 1);
        return { pattern: patt, answer: missing, word };
      }

      // Si trae word + answer (sin index): inferir primera b/v del word
      if (ans && (ans === "b" || ans === "v")) {
        const i = word.toLowerCase().indexOf(ans);
        if (i >= 0) {
          const patt = word.slice(0, i) + "_" + word.slice(i + 1);
          return { pattern: patt, answer: ans, word };
        }
      }

      // último recurso: si tiene b o v, hueco en la primera aparición
      const wl = word.toLowerCase();
      const iB = wl.indexOf("b");
      const iV = wl.indexOf("v");
      const i = (iB >= 0 && iV >= 0) ? Math.min(iB, iV) : Math.max(iB, iV);
      if (i >= 0) {
        const correct = wl[i];
        const patt = word.slice(0, i) + "_" + word.slice(i + 1);
        return { pattern: patt, answer: correct, word };
      }

      return { pattern: word, answer: null, word };
    }

    return { pattern: "(sin palabra en el JSON)", answer: null, word: null };
  },

  next() {
    if (!this.data || this.data.length === 0) {
      $("#bvWord").textContent = "No hay datos de b/v.";
      return;
    }
    this.current = this.toBVItem(pickRandom(this.data));
    $("#bvWord").textContent = this.current.pattern || "(sin patrón)";
    $("#bvScore").textContent = `Aciertos: ${this.scoreOk} / ${this.scoreTot}`;
  },

  answer(letter) {
    if (!this.current) return;

    // Si no tenemos answer, no podemos corregir -> solo avanza
    const exp = this.current.answer;
    const ok = exp ? (letter === exp) : true;

    this.scoreTot += 1;
    if (ok) this.scoreOk += 1;

    appScore.add(ok);
    showFeedback(ok ? "¡Correcto!" : `No. Era "${exp}"`, ok ? "ok" : "bad");

    $("#bvScore").textContent = `Aciertos: ${this.scoreOk} / ${this.scoreTot}`;
  }
};

/* ----------------- Recursos literarios ----------------- */
/* Formatos aceptados:
   - { prompt, options:[...], answer:"Metáfora" }
   - { pregunta, opciones:[...], correcta:"..." }
*/
const rec = {
  data: null,
  current: null,
  scoreOk: 0,
  scoreTot: 0,

  async ensureLoaded() {
    if (this.data) return;
    const raw = await loadJSON(PATHS.recursos);
    const items = Array.isArray(raw) ? raw : (raw.items || raw.data || []);
    this.data = items;
    this.bindUI();
  },

  bindUI() {
    $("#recNext")?.addEventListener("click", () => this.next());
  },

  reset() {
    this.scoreOk = 0;
    this.scoreTot = 0;
    $("#recScore") && ($("#recScore").textContent = "");
  },

  getField(obj, ...keys) {
    for (const k of keys) {
      const v = obj?.[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
    return "";
  },

  next() {
    if (!this.data || this.data.length === 0) {
      $("#recPrompt").textContent = "No hay datos de recursos literarios.";
      $("#recButtons").innerHTML = "";
      return;
    }

    this.current = pickRandom(this.data);

    const prompt = this.getField(this.current, "prompt", "pregunta", "texto", "enunciado");
    const options = this.current.options || this.current.opciones || this.current.choices || [];
    const answer = this.getField(this.current, "answer", "correcta", "solucion", "respuesta");

    $("#recPrompt").textContent = prompt || "(sin pregunta en el JSON)";

    const wrap = $("#recButtons");
    wrap.innerHTML = "";

    (Array.isArray(options) ? options : []).forEach(opt => {
      const b = document.createElement("button");
      b.className = "chip";
      b.textContent = opt;
      b.addEventListener("click", () => {
        const ok = norm(opt) === norm(answer);

        this.scoreTot += 1;
        if (ok) this.scoreOk += 1;
        appScore.add(ok);

        showFeedback(ok ? "¡Correcto!" : `No. Era: "${answer}"`, ok ? "ok" : "bad");
        $("#recScore").textContent = `Aciertos: ${this.scoreOk} / ${this.scoreTot}`;
      });
      wrap.appendChild(b);
    });

    $("#recScore").textContent = `Aciertos: ${this.scoreOk} / ${this.scoreTot}`;
  }
};

/* UI helpers for “chips” seleccionables */
function renderChips(containerSel, values, onPick) {
  const wrap = $(containerSel);
  if (!wrap) return;
  wrap.innerHTML = "";
  values.forEach(v => {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = v;
    b.addEventListener("click", () => onPick(v));
    wrap.appendChild(b);
  });
}

function markSelected(containerSel, value) {
  const wrap = $(containerSel);
  if (!wrap) return;
  Array.from(wrap.querySelectorAll("button")).forEach(btn => {
    btn.classList.toggle("primary", btn.textContent === value);
  });
}

/* Boot */
window.addEventListener("DOMContentLoaded", () => {
  bindNav();
  appScore.render();
  setView("home");
});
