/* =========================================================
   Lengua — Pablo (GitHub Pages, vanilla JS)
   - Conjugaciones: Reconocer / Producir
   - b/v
   - Recursos literarios

   Mejoras:
   - Botón seleccionado visible (chip.selected + aria-pressed)
   - Paso 2: Futuro y Condicional se dividen en simple/compuesto
   - Paso 3 depende del Paso 2 y muestra solo lo relevante
   ========================================================= */

(() => {
  "use strict";

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);

  function norm(s) {
    return String(s ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function eqLoose(a, b) {
    return norm(a) === norm(b);
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function choiceButton(label, key, value, selected) {
    const cls = selected ? "chip selected" : "chip";
    const pressed = selected ? "true" : "false";
    return `<button type="button" class="${cls}" aria-pressed="${pressed}" data-action="pick" data-key="${key}" data-value="${value}">${label}</button>`;
  }

  // ---------- Data loading ----------
  const Data = {
    conjugaciones: null,
    bv: null,
    recursos: null
  };

  async function fetchJSON(path) {
    const r = await fetch(path, { cache: "no-store" });
    if (!r.ok) throw new Error(`No se pudo cargar ${path} (${r.status})`);
    return await r.json();
  }

  async function loadAll() {
    const [c, b, r] = await Promise.all([
      fetchJSON("./data/conjugaciones.json"),
      fetchJSON("./data/bv.json"),
      fetchJSON("./data/recursos.json")
    ]);
    Data.conjugaciones = Array.isArray(c) ? c : (c?.items ?? []);
    Data.bv = Array.isArray(b) ? b : (b?.items ?? []);
    Data.recursos = Array.isArray(r) ? r : (r?.items ?? []);
  }

  // ---------- App state ----------
  const State = {
    view: "home",
    // Conjugaciones
    conjMode: "reconocer", // reconocer | producir
    conjIdx: 0,
    conjUserVerb: "",
    // Producir (clasificar)
    prodPick: {
      modo: null,   // Indicativo/Subjuntivo/Imperativo
      grupo: null,  // Presente / Pretérito / Futuro simple / Futuro compuesto / Condicional simple / Condicional compuesto
      exacto: null  // depende de grupo
    },
    // b/v
    bvIdx: 0,
    // recursos
    recMode: "teoria",
    recIdx: 0
  };

  // ---------- DOM ----------
  const header = $(".header");
  const main = $("main");
  const feedback = $("#feedback");

  function setFeedback(kind, msg) {
    if (!feedback) return;
    feedback.style.display = msg ? "flex" : "none";
    feedback.classList.remove("ok", "bad");
    if (kind === "ok") feedback.classList.add("ok");
    if (kind === "bad") feedback.classList.add("bad");
    feedback.textContent = msg || "";
  }

  // ---------- Conjugaciones: mapping (3 pasos) ----------
  // Paso 2 con FUTURO y CONDICIONAL divididos
  const STEP2_OPTIONS = [
    "Presente",
    "Pretérito",
    "Futuro simple",
    "Futuro compuesto",
    "Condicional simple",
    "Condicional compuesto"
  ];

  function exactOptionsForGrupo(grupo, modo) {
    // Imperativo: lo simplificamos para Pablo
    if (modo === "Imperativo") return ["Imperativo"];

    switch (grupo) {
      case "Presente":
        return ["Presente"];
      case "Pretérito":
        return ["Imperfecto", "Perfecto simple", "Perfecto compuesto", "Pluscuamperfecto"];
      case "Futuro simple":
        return ["Futuro simple"];
      case "Futuro compuesto":
        return ["Futuro compuesto"];
      case "Condicional simple":
        return ["Condicional simple"];
      case "Condicional compuesto":
        return ["Condicional compuesto"];
      default:
        return [];
    }
  }

  function normalizeModo(raw) {
    const x = norm(raw);
    if (x.includes("subj")) return "Subjuntivo";
    if (x.includes("imperat")) return "Imperativo";
    return "Indicativo";
  }

  // Mapea un "tiempo" del JSON a:
  // - grupo (paso 2)
  // - exacto (paso 3)
  function normalizeExacto(raw) {
    const x = norm(raw);
    if (!x) return null;

    if (x.includes("imperat")) return "Imperativo";

    if (x.includes("plusc")) return "Pluscuamperfecto";
    if (x.includes("imperf")) return "Imperfecto";

    // Futuro / Futuro perfecto
    if (x.includes("futuro perfecto") || x.includes("futuro compuesto")) return "Futuro compuesto";
    if (x === "futuro" || x.includes("futuro simple")) return "Futuro simple";

    // Condicional / Condicional perfecto
    if (x.includes("condicional perfecto") || x.includes("condicional compuesto")) return "Condicional compuesto";
    if (x.includes("condicional")) return "Condicional simple";

    // Pretéritos
    if (x.includes("perfecto simple") || x.includes("indefinido")) return "Perfecto simple";
    if (x.includes("perfecto compuesto")) return "Perfecto compuesto";

    if (x.includes("presente")) return "Presente";
    return null;
  }

  function normalizeGrupoFromExacto(exacto) {
    if (!exacto) return null;
    if (exacto === "Presente") return "Presente";
    if (["Imperfecto", "Perfecto simple", "Perfecto compuesto", "Pluscuamperfecto"].includes(exacto)) return "Pretérito";
    if (exacto === "Futuro simple") return "Futuro simple";
    if (exacto === "Futuro compuesto") return "Futuro compuesto";
    if (exacto === "Condicional simple") return "Condicional simple";
    if (exacto === "Condicional compuesto") return "Condicional compuesto";
    if (exacto === "Imperativo") return "Presente"; // lo tratamos así en paso 2
    return null;
  }

  function getFormaFromRow(row) {
    const candidates = [
      row.forma,
      row.formaConjugada,
      row.forma_verbal,
      row.verbo_forma,
      row.formaVerbal,
      row.respuesta,
      row.verbForm
    ];
    const found = candidates.find(v => String(v ?? "").trim() !== "");
    return found ? String(found).trim() : "";
  }

  function getVerbAnswerFromRow(row) {
    const candidates = [row.verbo, row.respuesta, row.verb, row.answer];
    const found = candidates.find(v => String(v ?? "").trim() !== "");
    return found ? String(found).trim() : "";
  }

  function getSentenceFromRow(row) {
    const candidates = [row.frase, row.oracion, row.sentence, row.texto];
    const found = candidates.find(v => String(v ?? "").trim() !== "");
    return found ? String(found).trim() : "";
  }

  function expected3StepsFromRow(row) {
    const modo = normalizeModo(row.modo || row.Modo || row.mood);
    const exacto = normalizeExacto(row.tiempo || row.Tiempo || row.exacto || row.tipo_exacto || row.tense);
    let grupo = row.grupo || row.grupo2 || row.tiempo2 || row.grupoTiempo || row.time_group;

    // Si viene grupo explícito, normalizamos a nuestras etiquetas
    if (grupo) {
      const g = norm(grupo);
      if (g.includes("condicional") && (g.includes("comp") || g.includes("perfect"))) grupo = "Condicional compuesto";
      else if (g.includes("condicional")) grupo = "Condicional simple";
      else if (g.includes("futuro") && (g.includes("comp") || g.includes("perfect"))) grupo = "Futuro compuesto";
      else if (g.includes("futuro")) grupo = "Futuro simple";
      else if (g.includes("pret") || g.includes("pasad")) grupo = "Pretérito";
      else if (g.includes("pres")) grupo = "Presente";
      else grupo = null;
    } else {
      grupo = normalizeGrupoFromExacto(exacto);
    }

    // Imperativo: forzamos estructura simple
    if (modo === "Imperativo") {
      return { modo, grupo: "Presente", exacto: "Imperativo" };
    }

    return { modo, grupo, exacto };
  }

  // ---------- Render ----------
  function render() {
    setFeedback(null, "");
    if (!main) return;

    if (State.view === "home") return renderHome();
    if (State.view === "conj") return renderConj();
    if (State.view === "bv") return renderBV();
    if (State.view === "rec") return renderRecursos();
  }

  function renderHome() {
    main.innerHTML = `
      <section class="card">
        <h2>¿Qué vamos a estudiar?</h2>
        <div class="choiceGrid">
          <button class="btn" data-action="nav" data-to="conj">Conjugaciones verbales</button>
          <button class="btn" data-action="nav" data-to="bv">Uso de b / v</button>
          <button class="btn" data-action="nav" data-to="rec">Recursos literarios</button>
        </div>
        <div class="hint">Tip: no distingue mayúsculas ni tildes.</div>
      </section>
    `;
  }

  function renderConj() {
    const list = Data.conjugaciones || [];
    if (!list.length) {
      main.innerHTML = `<section class="card"><h2>Conjugaciones</h2><p>No hay datos cargados.</p></section>`;
      return;
    }

    const row = list[State.conjIdx % list.length];

    const modeTabs = `
      <div class="choices" style="margin-bottom:10px">
        <button class="${State.conjMode === "reconocer" ? "chip selected" : "chip"}" aria-pressed="${State.conjMode === "reconocer"}" data-action="setConjMode" data-mode="reconocer">Reconocer</button>
        <button class="${State.conjMode === "producir" ? "chip selected" : "chip"}" aria-pressed="${State.conjMode === "producir"}" data-action="setConjMode" data-mode="producir">Producir</button>
      </div>
    `;

    if (State.conjMode === "reconocer") {
      const sentence = getSentenceFromRow(row);
      main.innerHTML = `
        <section class="card">
          <h2>Conjugaciones</h2>
          ${modeTabs}
          <div class="sentence">${escapeHtml(sentence || "(sin frase en el JSON)")}</div>

          <div class="question">
            <input id="verbInput" type="text" placeholder="Escribe el verbo (o grupo verbal) tal como aparece" value="${escapeHtml(State.conjUserVerb)}" />
            <button class="btn" data-action="checkVerb">Comprobar</button>
          </div>

          <div class="footerNote">Escribe el verbo tal como aparece en la frase.</div>

          <div style="margin-top:12px">
            <button class="link" data-action="nextConj">Siguiente</button>
          </div>
        </section>
      `;
      return;
    }

    // PRODUCIR
    const forma = getFormaFromRow(row) || "(sin forma en el JSON)";
    const expected = expected3StepsFromRow(row);

    const pickedModo = State.prodPick.modo;
    const pickedGrupo = State.prodPick.grupo;
    const pickedExact = State.prodPick.exacto;

    // Step 1: modo
    const modoOptions = ["Indicativo", "Subjuntivo", "Imperativo"];
    const modoBtns = modoOptions
      .map(m => choiceButton(m, "modo", m, pickedModo === m))
      .join("");

    // Step 2: grupo
    const step2Btns = STEP2_OPTIONS.map(g => {
      const disabled = (pickedModo === "Imperativo" && g !== "Presente");
      const cls = (pickedGrupo === g ? "chip selected" : "chip") + (disabled ? " disabled" : "");
      const pressed = pickedGrupo === g ? "true" : "false";
      return `<button type="button" class="${cls}" aria-pressed="${pressed}" data-action="pick" data-key="grupo" data-value="${g}" ${disabled ? "disabled" : ""}>${g}</button>`;
    }).join("");

    // Step 3: exacto (depende de grupo)
    let exactBtns = "";
    let exactHint = "";
    if (!pickedGrupo) {
      exactHint = `<div class="hint">Elige antes el paso 2.</div>`;
    } else {
      const opts = exactOptionsForGrupo(pickedGrupo, pickedModo || expected.modo);
      exactBtns = opts.map(e => choiceButton(e, "exacto", e, pickedExact === e)).join("");
    }

    main.innerHTML = `
      <section class="card">
        <h2>Conjugaciones</h2>
        ${modeTabs}

        <div class="sentence"><b>Forma:</b> ${escapeHtml(forma)}</div>
        <div class="footerNote">Clasifica esta forma en 3 pasos.</div>

        <div class="question">
          <div style="margin-top:8px"><b>1) Modo</b></div>
          <div class="choices">${modoBtns}</div>

          <div style="margin-top:12px"><b>2) Tiempo (grupo)</b></div>
          <div class="choices">${step2Btns}</div>

          <div style="margin-top:12px"><b>3) Tipo exacto</b></div>
          ${exactHint}
          <div class="choices">${exactBtns}</div>

          <div style="margin-top:14px; display:flex; gap:10px; flex-wrap:wrap;">
            <button class="btn" data-action="checkProducir">Comprobar</button>
            <button class="link" data-action="nextProducir">Siguiente</button>
          </div>
        </div>
      </section>
    `;
  }

  function renderBV() {
    const list = Data.bv || [];
    if (!list.length) {
      main.innerHTML = `<section class="card"><h2>Uso de b / v</h2><p>No hay datos cargados.</p></section>`;
      return;
    }

    const row = list[State.bvIdx % list.length];
    const palabra = row.palabra || row.word || row.texto || "";
    main.innerHTML = `
      <section class="card">
        <h2>Uso de b / v</h2>
        <div class="sentence"><b>Completa la palabra:</b> ${escapeHtml(palabra)}</div>

        <div class="choices" style="margin-top:10px">
          <button class="chip" data-action="bvPick" data-letter="b">b</button>
          <button class="chip" data-action="bvPick" data-letter="v">v</button>
          <button class="link" data-action="bvNext">Siguiente</button>
        </div>
      </section>
    `;
  }

  function renderRecursos() {
    const list = Data.recursos || [];
    if (!list.length) {
      main.innerHTML = `<section class="card"><h2>Recursos literarios</h2><p>No hay datos cargados.</p></section>`;
      return;
    }

    const row = list[State.recIdx % list.length];
    const tipo = row.tipo || row.recurso || row.kind || "";
    const def = row.definicion || row.def || "";
    const ejemplo = row.ejemplo || row.texto || row.example || "";

    const modeTabs = `
      <div class="choices" style="margin-bottom:10px">
        <button class="${State.recMode === "teoria" ? "chip selected" : "chip"}" aria-pressed="${State.recMode === "teoria"}" data-action="setRecMode" data-mode="teoria">Teoría</button>
        <button class="${State.recMode === "practica" ? "chip selected" : "chip"}" aria-pressed="${State.recMode === "practica"}" data-action="setRecMode" data-mode="practica">Práctica</button>
      </div>
    `;

    const prompt =
      State.recMode === "teoria"
        ? `<div class="sentence">${escapeHtml(def || "(sin definición)")}</div><div class="footerNote">¿Qué recurso es?</div>`
        : `<div class="sentence">${escapeHtml(ejemplo || "(sin ejemplo)")}</div><div class="footerNote">¿Qué recurso es?</div>`;

    const options = ["Metáfora", "Símil", "Personificación", "Hipérbole"];
    const optBtns = options
      .map(o => `<button class="chip" data-action="recPick" data-value="${o}">${o}</button>`)
      .join("");

    main.innerHTML = `
      <section class="card">
        <h2>Recursos literarios</h2>
        ${modeTabs}
        ${prompt}
        <div class="choices" style="margin-top:10px">${optBtns}</div>
        <div style="margin-top:12px">
          <button class="link" data-action="recNext">Siguiente</button>
        </div>
      </section>
    `;
  }

  // ---------- Actions (event delegation) ----------
  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === "nav") {
      State.view = btn.dataset.to;
      setFeedback(null, "");
      render();
      return;
    }

    if (action === "setConjMode") {
      State.conjMode = btn.dataset.mode;
      setFeedback(null, "");
      if (State.conjMode === "producir") {
        State.prodPick = { modo: null, grupo: null, exacto: null };
      }
      render();
      return;
    }

    if (action === "pick") {
      if (State.conjMode !== "producir") return;

      const key = btn.dataset.key;
      const value = btn.dataset.value;

      if (key === "modo") {
        State.prodPick.modo = value;
        State.prodPick.grupo = null;
        State.prodPick.exacto = null;

        if (value === "Imperativo") {
          State.prodPick.grupo = "Presente";
          State.prodPick.exacto = null;
        }
      }

      if (key === "grupo") {
        State.prodPick.grupo = value;
        State.prodPick.exacto = null;
      }

      if (key === "exacto") {
        State.prodPick.exacto = value;
      }

      setFeedback(null, "");
      render();
      return;
    }

    if (action === "checkVerb") {
      const list = Data.conjugaciones || [];
      const row = list[State.conjIdx % list.length];

      const input = $("#verbInput");
      const user = (input?.value ?? "").trim();
      State.conjUserVerb = user;

      const expected = getVerbAnswerFromRow(row);

      if (!user) return setFeedback("bad", "Escribe algo primero.");

      if (eqLoose(user, expected)) setFeedback("ok", "¡Correcto!");
      else setFeedback("bad", `No. La respuesta era: "${expected}"`);
      return;
    }

    if (action === "nextConj") {
      State.conjIdx = (State.conjIdx + 1) % (Data.conjugaciones?.length || 1);
      State.conjUserVerb = "";
      setFeedback(null, "");
      render();
      return;
    }

    if (action === "checkProducir") {
      const list = Data.conjugaciones || [];
      const row = list[State.conjIdx % list.length];
      const expected = expected3StepsFromRow(row);
      const pick = State.prodPick;

      if (!pick.modo) return setFeedback("bad", "Elige el paso 1 (Modo).");
      if (!pick.grupo) return setFeedback("bad", "Elige el paso 2.");
      if (!pick.exacto) return setFeedback("bad", "Elige el paso 3.");

      const ok1 = pick.modo === expected.modo;
      const ok2 = pick.grupo === expected.grupo;
      const ok3 = pick.exacto === expected.exacto;

      if (ok1 && ok2 && ok3) setFeedback("ok", "¡Correcto!");
      else setFeedback("bad", `No. Era: ${expected.modo} / ${expected.grupo ?? "?"} / ${expected.exacto ?? "?"}`);
      return;
    }

    if (action === "nextProducir") {
      State.conjIdx = (State.conjIdx + 1) % (Data.conjugaciones?.length || 1);
      State.prodPick = { modo: null, grupo: null, exacto: null };
      setFeedback(null, "");
      render();
      return;
    }

    // b/v
    if (action === "bvPick") {
      const list = Data.bv || [];
      const row = list[State.bvIdx % list.length];

      const expected = row.correcta || row.correct || row.letra || "";
      const picked = btn.dataset.letter;

      if (eqLoose(picked, expected)) setFeedback("ok", "¡Correcto!");
      else setFeedback("bad", `No. Era: "${expected}"`);
      return;
    }
    if (action === "bvNext") {
      State.bvIdx = (State.bvIdx + 1) % (Data.bv?.length || 1);
      setFeedback(null, "");
      render();
      return;
    }

    // recursos
    if (action === "setRecMode") {
      State.recMode = btn.dataset.mode;
      setFeedback(null, "");
      render();
      return;
    }
    if (action === "recPick") {
      const list = Data.recursos || [];
      const row = list[State.recIdx % list.length];

      const expected = row.tipo || row.recurso || row.kind || "";
      const picked = btn.dataset.value;

      if (eqLoose(picked, expected)) setFeedback("ok", "¡Correcto!");
      else setFeedback("bad", `No. Era: "${expected}"`);
      return;
    }
    if (action === "recNext") {
      State.recIdx = (State.recIdx + 1) % (Data.recursos?.length || 1);
      setFeedback(null, "");
      render();
      return;
    }
  });

  document.addEventListener("input", (ev) => {
    const t = ev.target;
    if (t && t.id === "verbInput") State.conjUserVerb = t.value;
  });

  // ---------- Init ----------
  async function init() {
    try {
      await loadAll();
    } catch (e) {
      console.error(e);
      setFeedback("bad", String(e.message || e));
    }

    if (header) {
      header.innerHTML = `
        <div class="brand">
          <h1>Lengua</h1>
          <div class="subtitle">Elige qué estudiar</div>
        </div>
        <button class="link" data-action="nav" data-to="home">Inicio</button>
      `;
    }

    render();
  }

  window.addEventListener("DOMContentLoaded", init);
})();
