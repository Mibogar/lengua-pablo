(() => {
  // -------------------------
  // Utils
  // -------------------------
  const $ = (sel) => document.querySelector(sel);

  function norm(s) {
    return (s ?? "")
      .toString()
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function escapeHtml(s) {
    return (s ?? "")
      .toString()
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function showFeedback(kind, msg) {
    // kind: "ok" | "bad" | "info"
    const fb = $("#feedback");
    if (!fb) return;
    fb.style.display = "block";
    fb.className = `feedback ${kind}`;
    fb.textContent = msg;
  }

  function hideFeedback() {
    const fb = $("#feedback");
    if (!fb) return;
    fb.style.display = "none";
  }

  // -------------------------
  // Data loading
  // -------------------------
  async function loadJson(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`${path} (${res.status})`);
    return await res.json();
  }

  const DATA = {
    conjugaciones: [],
    bv: [],
    recursos: [],
  };

  // -------------------------
  // App state
  // -------------------------
  const state = {
    screen: "home", // home | conj_rec | conj_prod | bv | recursos
    scoreOk: 0,
    scoreTotal: 0,

    // Conjugaciones
    conjItem: null,

    // Producir selections
    prod: {
      modo: null,   // Indicativo/Subjuntivo/Imperativo
      grupo: null,  // Presente/Pretérito/Futuro/Condicional
      exacto: null, // depende del grupo
    },

    // BV
    bvItem: null,

    // Recursos
    recItem: null,
  };

  function setScreen(s) {
    state.screen = s;
    hideFeedback();
    render();
  }

  function resetScore() {
    state.scoreOk = 0;
    state.scoreTotal = 0;
    renderFooter();
  }

  // -------------------------
  // Footer (links)
  // -------------------------
  function renderFooter() {
    const scoreEl = $("#score");
    if (scoreEl) scoreEl.textContent = `Aciertos: ${state.scoreOk} / ${state.scoreTotal}`;

    const btnInicio = $("#btnInicio");
    const btnReset = $("#btnReset");
    btnInicio && (btnInicio.onclick = () => setScreen("home"));
    btnReset && (btnReset.onclick = () => resetScore());
  }

  // -------------------------
  // Classification mapping (Producir)
  // -------------------------
  function expectedFromItem(item) {
    // Esperamos item.modo y item.tiempo (como en tu JSON)
    const modoRaw = norm(item?.modo ?? "");
    const tiempoRaw = norm(item?.tiempo ?? "");

    // 1) Modo
    let expModo = "Indicativo";
    if (modoRaw.includes("subj")) expModo = "Subjuntivo";
    else if (modoRaw.includes("imper")) expModo = "Imperativo";

    // 2) Grupo y 3) Exacto
    // Paso 2 SIEMPRE: Presente / Pretérito / Futuro / Condicional
    // Paso 3 depende del 2 según tu regla.
    let expGrupo = "Presente";
    let expExacto = "Presente";

    const isCond = tiempoRaw.includes("condicional");
    const isFut = tiempoRaw.includes("futuro");
    const isPres = tiempoRaw.includes("presente");

    // Ojo: "pretérito perfecto simple/compuesto", imperfecto, pluscuamperfecto, anterior, etc.
    const isPret =
      tiempoRaw.includes("preterito") ||
      tiempoRaw.includes("imperfecto") ||
      tiempoRaw.includes("pluscuamperfecto") ||
      tiempoRaw.includes("anterior") ||
      (tiempoRaw.includes("perfecto") && !isPres);

    if (isCond) {
      expGrupo = "Condicional";
      expExacto = tiempoRaw.includes("compuesto") ? "Condicional compuesto" : "Condicional simple";
    } else if (isFut) {
      expGrupo = "Futuro";
      expExacto = tiempoRaw.includes("compuesto") ? "Futuro compuesto" : "Futuro simple";
    } else if (isPret) {
      expGrupo = "Pretérito";

      if (tiempoRaw.includes("imperfecto")) expExacto = "Imperfecto";
      else if (tiempoRaw.includes("pluscuamperfecto")) expExacto = "Pluscuamperfecto";
      else if (tiempoRaw.includes("anterior")) expExacto = "Anterior";
      else if (tiempoRaw.includes("perfecto compuesto")) expExacto = "Perfecto compuesto";
      else if (tiempoRaw.includes("perfecto simple")) expExacto = "Perfecto simple";
      else if (tiempoRaw.includes("perfecto") && tiempoRaw.includes("compuesto")) expExacto = "Perfecto compuesto";
      else if (tiempoRaw.includes("perfecto") && tiempoRaw.includes("simple")) expExacto = "Perfecto simple";
      else if (tiempoRaw.includes("perfecto")) expExacto = "Perfecto simple";
      else expExacto = "Perfecto simple";
    } else if (isPres) {
      expGrupo = "Presente";
      expExacto = "Presente";
    } else {
      expGrupo = "Presente";
      expExacto = "Presente";
    }

    return { expModo, expGrupo, expExacto };
  }

  function exactOptionsForGroup(grupo) {
    if (!grupo) return [];
    if (grupo === "Presente") return ["Presente"];
    if (grupo === "Pretérito") {
      return ["Perfecto simple", "Perfecto compuesto", "Imperfecto", "Pluscuamperfecto", "Anterior"];
    }
    if (grupo === "Futuro") return ["Futuro simple", "Futuro compuesto"];
    if (grupo === "Condicional") return ["Condicional simple", "Condicional compuesto"];
    return [];
  }

  // -------------------------
  // New items
  // -------------------------
  function newConjItem() {
    if (!DATA.conjugaciones.length) return null;
    return pick(DATA.conjugaciones);
  }

  function newBvItem() {
    if (!DATA.bv.length) return null;
    return pick(DATA.bv);
  }

  function newRecItem() {
    if (!DATA.recursos.length) return null;
    return pick(DATA.recursos);
  }

  // -------------------------
  // UI helpers for buttons
  // -------------------------
  function buttonGroup(values, selectedValue, onSelect) {
    return `
      <div class="row">
        ${values
          .map((v) => {
            const isOn = v === selectedValue;
            return `<button type="button" class="small ${isOn ? "primary" : ""}" data-pick="${escapeHtml(v)}">${escapeHtml(v)}</button>`;
          })
          .join("")}
      </div>
    `;
  }

  function wireButtonGroup(rootEl, onSelect) {
    rootEl.querySelectorAll("button[data-pick]").forEach((b) => {
      b.addEventListener("click", () => onSelect(b.getAttribute("data-pick")));
    });
  }

  // -------------------------
  // Render
  // -------------------------
  function render() {
    const main = $("main");
    if (!main) return;

    const header = `
      <div class="header">
        <h1>Lengua</h1>
        <button type="button" class="small" id="btnListo">Listo</button>
      </div>
    `;

    let body = "";

    if (state.screen === "home") {
      body = `
        <div class="card">
          <h2>Elige qué estudiar</h2>
          <div class="row">
            <button type="button" class="primary" id="goConj">Conjugaciones verbales</button>
            <button type="button" id="goBV">Ortografía: b / v</button>
            <button type="button" id="goRec">Recursos literarios</button>
          </div>
        </div>
      `;
    }

    if (state.screen === "conj_rec") {
      if (!state.conjItem) state.conjItem = newConjItem();

      const frase = state.conjItem?.frase ?? "(sin frase)";
      body = `
        <div class="card">
          <div class="row">
            <button type="button" class="small ${state.screen === "conj_rec" ? "primary" : ""}" id="tabRec">Reconocer</button>
            <button type="button" class="small ${state.screen === "conj_prod" ? "primary" : ""}" id="tabProd">Producir</button>
          </div>

          <h2>Conjugaciones</h2>
          <div style="font-size:18px;font-weight:700;margin:10px 0;">${escapeHtml(frase)}</div>

          <div class="row">
            <input id="recInput" placeholder="Escribe el verbo (o grupo verbal)..." />
            <button type="button" class="primary" id="recCheck">Comprobar</button>
          </div>

          <div class="row" style="margin-top:10px;">
            <button type="button" id="recNext">Siguiente</button>
          </div>

          <div class="muted" style="margin-top:10px;">Escribe el verbo tal como aparece en la frase.</div>
        </div>
      `;
    }

    if (state.screen === "conj_prod") {
      if (!state.conjItem) state.conjItem = newConjItem();

      // En Producir, la FORMA a clasificar debe ser la "solucion"
      const forma = (state.conjItem?.solucion ?? "").toString().trim();
      const formaShown = forma ? forma : "(sin forma en el JSON)";

      const modos = ["Indicativo", "Subjuntivo", "Imperativo"];
      const grupos = ["Presente", "Pretérito", "Futuro", "Condicional"];

      // Paso 3 depende del 2
      const exactos = exactOptionsForGroup(state.prod.grupo);
      // Si elige Presente, exacto se fija a Presente
      if (state.prod.grupo === "Presente") state.prod.exacto = "Presente";
      // Si cambia grupo y el exacto no cuadra, lo vaciamos
      if (state.prod.grupo && state.prod.exacto && !exactos.includes(state.prod.exacto)) {
        state.prod.exacto = null;
        if (state.prod.grupo === "Presente") state.prod.exacto = "Presente";
      }

      body = `
        <div class="card">
          <div class="row">
            <button type="button" class="small ${state.screen === "conj_rec" ? "primary" : ""}" id="tabRec">Reconocer</button>
            <button type="button" class="small ${state.screen === "conj_prod" ? "primary" : ""}" id="tabProd">Producir</button>
          </div>

          <h2>Conjugaciones</h2>
          <div style="font-size:18px;font-weight:800;margin:10px 0;">
            Forma: <span>${escapeHtml(formaShown)}</span>
          </div>

          <div class="muted">Clasifica esta forma en 3 pasos.</div>

          <div style="margin-top:14px;">
            <div class="label">1) Modo</div>
            <div id="grpModo">
              ${buttonGroup(modos, state.prod.modo, () => {})}
            </div>
          </div>

          <div style="margin-top:14px;">
            <div class="label">2) Tiempo</div>
            <div id="grpGrupo">
              ${buttonGroup(grupos, state.prod.grupo, () => {})}
            </div>
          </div>

          <div style="margin-top:14px;">
            <div class="label">3) Tipo exacto</div>
            ${
              !state.prod.grupo
                ? `<div class="muted">Elige antes el paso 2.</div>`
                : state.prod.grupo === "Presente"
                ? `<div class="muted">En Presente lo dejamos como “Presente”.</div>`
                : ""
            }
            <div id="grpExacto">
              ${state.prod.grupo ? buttonGroup(exactos, state.prod.exacto, () => {}) : ""}
            </div>
          </div>

          <div class="row" style="margin-top:14px;">
            <button type="button" class="primary" id="prodCheck">Comprobar</button>
            <button type="button" id="prodNext">Siguiente</button>
          </div>
        </div>
      `;
    }

    if (state.screen === "bv") {
      if (!state.bvItem) state.bvItem = newBvItem();
      const word = state.bvItem?.palabra ?? state.bvItem?.prompt ?? "(sin palabra)";
      body = `
        <div class="card">
          <h2>Uso de b / v</h2>
          <div style="font-size:18px;font-weight:700;margin:10px 0;">Completa la palabra:</div>
          <div style="font-size:22px;font-weight:800;margin:10px 0;">${escapeHtml(word)}</div>
          <div class="row">
            <button type="button" class="primary" id="bvB">b</button>
            <button type="button" class="primary" id="bvV">v</button>
            <button type="button" id="bvNext">Siguiente</button>
          </div>
        </div>
      `;
    }

    if (state.screen === "recursos") {
      if (!state.recItem) state.recItem = newRecItem();
      const title = state.recItem?.titulo ?? "Recursos literarios";
      body = `
        <div class="card">
          <h2>${escapeHtml(title)}</h2>
          <div class="muted">Aquí puedes seguir usando tu lógica actual (si ya te iba bien).</div>
          <div class="row" style="margin-top:10px;">
            <button type="button" id="recNext">Siguiente</button>
          </div>
        </div>
      `;
    }

    main.innerHTML = header + body;
    wire();
    renderFooter();
  }

  // -------------------------
  // Wire events per screen
  // -------------------------
  function wire() {
    $("#btnListo") && ($("#btnListo").onclick = () => setScreen("home"));

    // Home
    $("#goConj") && ($("#goConj").onclick = () => {
      state.conjItem = newConjItem();
      state.prod = { modo: null, grupo: null, exacto: null };
      setScreen("conj_rec");
    });
    $("#goBV") && ($("#goBV").onclick = () => {
      state.bvItem = newBvItem();
      setScreen("bv");
    });
    $("#goRec") && ($("#goRec").onclick = () => {
      state.recItem = newRecItem();
      setScreen("recursos");
    });

    // Tabs Conjugaciones
    $("#tabRec") && ($("#tabRec").onclick = () => setScreen("conj_rec"));
    $("#tabProd") && ($("#tabProd").onclick = () => {
      // reinicio selección al entrar
      state.prod = { modo: null, grupo: null, exacto: null };
      setScreen("conj_prod");
    });

    // Reconocer
    if (state.screen === "conj_rec") {
      const input = $("#recInput");
      $("#recCheck") && ($("#recCheck").onclick = () => {
        if (!state.conjItem) return;

        const correct = (state.conjItem.solucion ?? "").toString().trim();
        const user = (input?.value ?? "").toString().trim();

        const ok = norm(user) === norm(correct);
        state.scoreTotal += 1;
        if (ok) state.scoreOk += 1;

        showFeedback(ok ? "ok" : "bad", ok ? "¡Correcto!" : `No. La respuesta era: "${correct}"`);
        renderFooter();
      });

      $("#recNext") && ($("#recNext").onclick = () => {
        state.conjItem = newConjItem();
        if (input) input.value = "";
        hideFeedback();
        render();
      });
    }

    // Producir
    if (state.screen === "conj_prod") {
      const grpModoWrap = $("#grpModo");
      const grpGrupoWrap = $("#grpGrupo");
      const grpExactoWrap = $("#grpExacto");

      grpModoWrap && wireButtonGroup(grpModoWrap, (v) => {
        state.prod.modo = v;
        render();
      });

      grpGrupoWrap && wireButtonGroup(grpGrupoWrap, (v) => {
        state.prod.grupo = v;
        // al cambiar grupo, limpiamos exacto (salvo Presente)
        state.prod.exacto = (v === "Presente") ? "Presente" : null;
        render();
      });

      grpExactoWrap && wireButtonGroup(grpExactoWrap, (v) => {
        state.prod.exacto = v;
        render();
      });

      $("#prodCheck") && ($("#prodCheck").onclick = () => {
        if (!state.conjItem) return;

        if (!state.prod.modo || !state.prod.grupo) {
          showFeedback("bad", "Te falta elegir el paso 1 (Modo) y el paso 2 (Tiempo).");
          return;
        }
        if (state.prod.grupo !== "Presente" && !state.prod.exacto) {
          showFeedback("bad", "Te falta elegir el paso 3 (Tipo exacto).");
          return;
        }

        const { expModo, expGrupo, expExacto } = expectedFromItem(state.conjItem);
        const selModo = state.prod.modo;
        const selGrupo = state.prod.grupo;
        const selExacto = (selGrupo === "Presente") ? "Presente" : state.prod.exacto;

        const ok =
          norm(selModo) === norm(expModo) &&
          norm(selGrupo) === norm(expGrupo) &&
          norm(selExacto) === norm(expExacto);

        state.scoreTotal += 1;
        if (ok) state.scoreOk += 1;

        showFeedback(ok ? "ok" : "bad", ok ? "¡Correcto!" : `No. Era: ${expModo} / ${expGrupo} / ${expExacto}`);
        renderFooter();
      });

      $("#prodNext") && ($("#prodNext").onclick = () => {
        state.conjItem = newConjItem();
        state.prod = { modo: null, grupo: null, exacto: null };
        hideFeedback();
        render();
      });
    }

    // BV
    if (state.screen === "bv") {
      $("#bvB") && ($("#bvB").onclick = () => checkBV("b"));
      $("#bvV") && ($("#bvV").onclick = () => checkBV("v"));
      $("#bvNext") && ($("#bvNext").onclick = () => {
        state.bvItem = newBvItem();
        hideFeedback();
        render();
      });
    }

    // Recursos (placeholder)
    if (state.screen === "recursos") {
      $("#recNext") && ($("#recNext").onclick = () => {
        state.recItem = newRecItem();
        hideFeedback();
        render();
      });
    }
  }

  function wireButtonGroup(rootEl, onSelect) {
    rootEl.querySelectorAll("button[data-pick]").forEach((b) => {
      b.addEventListener("click", () => onSelect(b.getAttribute("data-pick")));
    });
  }

  function checkBV(letter) {
    const it = state.bvItem;
    if (!it) return;
    const correct = (it.respuesta ?? it.solucion ?? "").toString().trim();
    const ok = norm(letter) === norm(correct);

    state.scoreTotal += 1;
    if (ok) state.scoreOk += 1;

    showFeedback(ok ? "ok" : "bad", ok ? "¡Correcto!" : `No. Era: ${correct}`);
    renderFooter();
  }

  // -------------------------
  // Boot
  // -------------------------
  async function boot() {
    try {
      // Cargamos lo que exista. Si alguno falla, avisamos pero seguimos.
      try {
        const c = await loadJson("./data/conjugaciones.json");
        DATA.conjugaciones = Array.isArray(c) ? c : [];
      } catch (e) {
        console.warn(e);
        showFeedback("info", "Aviso: no se pudo cargar data/conjugaciones.json");
      }

      try {
        const b = await loadJson("./data/bv.json");
        DATA.bv = Array.isArray(b) ? b : [];
      } catch (e) {
        console.warn(e);
        // no molesto si ya te funciona b/v por otro lado
      }

      try {
        const r = await loadJson("./data/recursos.json");
        DATA.recursos = Array.isArray(r) ? r : [];
      } catch (e) {
        console.warn(e);
      }

      // Primera pantalla
      render();
    } catch (e) {
      console.error(e);
      showFeedback("bad", `Error: ${e.message}`);
      render();
    }
  }

  // Start
  boot();
})();
/* =========================================================
   PATCH BV + RECURSOS (pegar al final de app.js)
   - Arregla: BV mostrando palabra completa
   - Restaura: Recursos literarios (teoría + práctica)
   - No toca Conjugaciones
========================================================= */

(function () {
  // Helpers seguros (por si no existen en tu app.js actual)
  const $ = (s) => document.querySelector(s);
  const strip = (s) =>
    String(s ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  function safeShowFeedback(msg, kind = "ok") {
    // Si ya tienes showFeedback(), úsala; si no, intenta pintar en #feedback
    if (typeof window.showFeedback === "function") {
      window.showFeedback(msg, kind);
      return;
    }
    const el = $("#feedback");
    if (!el) return;
    el.style.display = "block";
    el.textContent = msg;
    el.className = "feedback " + (kind === "error" ? "bad" : "ok");
  }

  function cloneToRemoveListeners(el) {
    if (!el) return null;
    const c = el.cloneNode(true);
    el.replaceWith(c);
    return c;
  }

  // =========================================================
  // 1) BV (b / v)
  // JSON esperado (flexible):
  // - Puede ser array de strings ("tubo") o array de objetos.
  // - Si es objeto, admite: { palabra, pos, correcta, incorrecta }
  //   pos: índice donde va b/v (si no, se busca la primera b/v)
  // =========================================================
  const BV = {
    data: [],
    idx: 0,
    current: null, // {word, pos, correctChar, masked}
  };

  function bvPickCurrent() {
    if (!BV.data.length) return null;

    const raw = BV.data[BV.idx % BV.data.length];
    BV.idx = (BV.idx + 1) % BV.data.length;

    let word = "";
    let pos = -1;

    if (typeof raw === "string") {
      word = raw.trim();
    } else {
      word = String(raw.palabra ?? raw.word ?? raw.text ?? "").trim();
      if (Number.isInteger(raw.pos)) pos = raw.pos;
    }

    if (!word) return null;

    // Decide posición (si no viene)
    if (pos < 0) {
      const pB = word.toLowerCase().indexOf("b");
      const pV = word.toLowerCase().indexOf("v");
      if (pB === -1 && pV === -1) pos = -1;
      else if (pB === -1) pos = pV;
      else if (pV === -1) pos = pB;
      else pos = Math.min(pB, pV);
    }

    if (pos < 0) {
      // No hay b/v, lo dejamos como palabra normal pero avisamos
      return {
        word,
        pos: -1,
        correctChar: "",
        masked: word,
      };
    }

    const correctChar = word[pos].toLowerCase();
    const masked =
      word.slice(0, pos) + "_" + word.slice(pos + 1);

    return { word, pos, correctChar, masked };
  }

  function bvRender() {
    const wordEl = $("#bvWord");
    const revealEl = $("#bvReveal");

    if (!wordEl) return;

    if (!BV.current) {
      wordEl.textContent = "(no hay palabras en bv.json)";
      if (revealEl) revealEl.textContent = "";
      return;
    }

    // Mostrar con hueco (NUNCA la resuelta)
    wordEl.textContent = BV.current.pos >= 0 ? BV.current.masked : BV.current.word;

    // Oculta “reveal” por defecto (si existe)
    if (revealEl) revealEl.textContent = "";
  }

  function bvCheck(choiceChar) {
    if (!BV.current) return;

    if (BV.current.pos < 0 || !BV.current.correctChar) {
      safeShowFeedback("Esta palabra no tiene b/v para practicar.", "error");
      return;
    }

    const ok = choiceChar === BV.current.correctChar;

    if (ok) {
      safeShowFeedback("¡Correcto!", "ok");
      // Pintar ya la palabra completa
      const wordEl = $("#bvWord");
      if (wordEl) wordEl.textContent = BV.current.word;
    } else {
      safeShowFeedback(`No. Era "${BV.current.correctChar}".`, "error");
      const revealEl = $("#bvReveal");
      if (revealEl) revealEl.textContent = `Solución: ${BV.current.word}`;
    }
  }

  async function bvLoad() {
    // Usa PATHS.bv si existe; si no, usa ruta estándar
    const path =
      (window.PATHS && window.PATHS.bv) || "data/bv.json";

    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error("No se pudo cargar " + path);
    const json = await res.json();
    BV.data = Array.isArray(json) ? json : (json.items || json.data || []);
  }

  async function initBV_PATCH() {
    const view = $("#bv");
    if (!view) return; // si no existe la vista, no hacemos nada

    // Resetea listeners “antiguos”
    const btnB = cloneToRemoveListeners($("#bvB"));
    const btnV = cloneToRemoveListeners($("#bvV"));
    const btnNext = cloneToRemoveListeners($("#bvNext"));

    try {
      if (!BV.data.length) await bvLoad();
    } catch (e) {
      console.error(e);
      safeShowFeedback("Error cargando bv.json", "error");
      const wordEl = $("#bvWord");
      if (wordEl) wordEl.textContent = "(error cargando bv.json)";
      return;
    }

    BV.current = bvPickCurrent();
    bvRender();

    if (btnB) btnB.addEventListener("click", () => bvCheck("b"));
    if (btnV) btnV.addEventListener("click", () => bvCheck("v"));
    if (btnNext)
      btnNext.addEventListener("click", () => {
        BV.current = bvPickCurrent();
        bvRender();
      });
  }

  // =========================================================
  // 2) RECURSOS LITERARIOS
  // JSON esperado (flexible):
  // array de objetos con:
  // { recurso, definicion, ejemplo, opciones? }
  // opciones puede ser array de nombres de recursos (para test)
  // =========================================================
  const REC = {
    data: [],
    idx: 0,
    mode: "practice", // "theory" | "practice"
    current: null,
  };

  function recPick() {
    if (!REC.data.length) return null;
    const item = REC.data[REC.idx % REC.data.length];
    REC.idx = (REC.idx + 1) % REC.data.length;
    return item;
  }

  function recAllNames() {
    const names = REC.data
      .map((x) => (x && (x.recurso || x.name)) ? String(x.recurso || x.name) : "")
      .filter(Boolean);
    return Array.from(new Set(names));
  }

  function recRender() {
    const promptEl = $("#recPrompt");
    const buttonsEl = $("#recButtons");
    const nextEl = $("#recNext");
    const theoryBtn = $("#recTheory");
    const practiceBtn = $("#recPractice");

    if (!promptEl || !buttonsEl) return;

    // Estado visual botones modo
    if (theoryBtn) theoryBtn.classList.toggle("active", REC.mode === "theory");
    if (practiceBtn) practiceBtn.classList.toggle("active", REC.mode === "practice");

    if (!REC.current) {
      promptEl.textContent = "(no hay recursos en recursos.json)";
      buttonsEl.innerHTML = "";
      return;
    }

    const recurso = String(REC.current.recurso || REC.current.name || "").trim();
    const definicion = String(REC.current.definicion || REC.current.def || "").trim();
    const ejemplo = String(REC.current.ejemplo || REC.current.example || "").trim();

    if (REC.mode === "theory") {
      promptEl.innerHTML = `
        <div style="margin-bottom:10px;"><strong>${recurso}</strong></div>
        <div style="margin-bottom:10px;">${definicion || ""}</div>
        <div style="opacity:.9;"><em>${ejemplo || ""}</em></div>
      `;
      buttonsEl.innerHTML = "";
      if (nextEl) nextEl.textContent = "Siguiente";
      return;
    }

    // PRACTICE
    promptEl.innerHTML = `
      <div style="margin-bottom:10px;"><strong>¿Qué recurso literario es?</strong></div>
      <div style="opacity:.95;"><em>${ejemplo || "(sin ejemplo)"}</em></div>
    `;

    // Opciones
    let options = REC.current.opciones;
    if (!Array.isArray(options) || options.length < 2) {
      // construir opciones automáticas
      const pool = recAllNames().filter((n) => n !== recurso);
      // coge 3 al azar + la correcta
      const picked = [];
      while (pool.length && picked.length < 3) {
        const i = Math.floor(Math.random() * pool.length);
        picked.push(pool.splice(i, 1)[0]);
      }
      options = [recurso, ...picked].filter(Boolean);
    }

    // barajar
    options = options.slice().sort(() => Math.random() - 0.5);

    buttonsEl.innerHTML = "";
    options.forEach((opt) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn";
      b.textContent = opt;
      b.addEventListener("click", () => {
        const ok = strip(opt) === strip(recurso);
        if (ok) safeShowFeedback("¡Correcto!", "ok");
        else safeShowFeedback(`No. Era: ${recurso}`, "error");
      });
      buttonsEl.appendChild(b);
    });

    if (nextEl) nextEl.textContent = "Siguiente";
  }

  async function recLoad() {
    const path =
      (window.PATHS && window.PATHS.recursos) || "data/recursos.json";

    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error("No se pudo cargar " + path);
    const json = await res.json();
    REC.data = Array.isArray(json) ? json : (json.items || json.data || []);
  }

  async function initREC_PATCH() {
    const view = $("#recursos");
    if (!view) return;

    // Resetea listeners
    const theoryBtn = cloneToRemoveListeners($("#recTheory"));
    const practiceBtn = cloneToRemoveListeners($("#recPractice"));
    const nextBtn = cloneToRemoveListeners($("#recNext"));

    try {
      if (!REC.data.length) await recLoad();
    } catch (e) {
      console.error(e);
      safeShowFeedback("Error cargando recursos.json", "error");
      const promptEl = $("#recPrompt");
      if (promptEl) promptEl.textContent = "(error cargando recursos.json)";
      return;
    }

    REC.current = recPick();
    REC.mode = "practice";
    recRender();

    if (theoryBtn)
      theoryBtn.addEventListener("click", () => {
        REC.mode = "theory";
        recRender();
      });

    if (practiceBtn)
      practiceBtn.addEventListener("click", () => {
        REC.mode = "practice";
        recRender();
      });

    if (nextBtn)
      nextBtn.addEventListener("click", () => {
        REC.current = recPick();
        recRender();
      });
  }

  // Arranque: cuando cargue la página, inicializa BV y Recursos (sin tocar conjugaciones)
  window.addEventListener("DOMContentLoaded", () => {
    initBV_PATCH();
    initREC_PATCH();
  });
})();
