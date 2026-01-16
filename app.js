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
