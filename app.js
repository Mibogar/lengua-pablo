/* Lengua — Pablo (GitHub Pages)
   app.js completo

   - Vistas: Home / Conjugaciones / b-v / Recursos
   - Conjugaciones: Reconocer + Producir
     * Producir = clasificar "Forma: <solucion>" en 3 pasos (dependiente)
*/

(() => {
  // ---------------------------
  // Helpers DOM
  // ---------------------------
  const $ = (sel) => document.querySelector(sel);
  const byId = (id) => document.getElementById(id);

  function setHidden(el, hidden) {
    if (!el) return;
    el.classList.toggle("hidden", !!hidden);
  }

  function setText(el, txt) {
    if (!el) return;
    el.textContent = txt ?? "";
  }

  function normalize(s) {
    return (s ?? "")
      .toString()
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""); // quita tildes
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // Marcar botones tipo "chip" como seleccionados usando la clase "primary"
  function markSelected(container, selectedValue) {
    if (!container) return;
    const buttons = [...container.querySelectorAll("button[data-value]")];
    buttons.forEach((b) => {
      const isOn = b.getAttribute("data-value") === selectedValue;
      b.classList.toggle("primary", isOn);
      b.setAttribute("aria-pressed", isOn ? "true" : "false");
    });
  }

  function buildButtonRow(container, values, onClick) {
    if (!container) return;
    container.innerHTML = "";
    values.forEach((val) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "small"; // estilo compacto
      b.textContent = val;
      b.setAttribute("data-value", val);
      b.addEventListener("click", () => onClick(val));
      container.appendChild(b);
    });
  }

  // ---------------------------
  // Navegación por vistas
  // ---------------------------
  const views = {
    home: byId("viewHome"),
    conj: byId("viewConjugaciones"),
    bv: byId("viewBV"),
    rec: byId("viewRecursos"),
  };

  function showView(name) {
    Object.entries(views).forEach(([k, el]) => setHidden(el, k !== name));
  }

  // Botones de Home (si existen)
  const btnGoConj = byId("btnGoConj");
  const btnGoBV = byId("btnGoBV");
  const btnGoRec = byId("btnGoRec");

  btnGoConj?.addEventListener("click", () => showView("conj"));
  btnGoBV?.addEventListener("click", () => showView("bv"));
  btnGoRec?.addEventListener("click", () => showView("rec"));

  // Footer links
  byId("btnInicio")?.addEventListener("click", () => showView("home"));

  // ---------------------------
  // Carga de datos
  // ---------------------------
  const DATA = {
    conjugaciones: [],
    bv: [],
    recursos: [],
  };

  async function loadJson(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`No se pudo cargar ${path} (${res.status})`);
    return await res.json();
  }

  async function boot() {
    try {
      // Rutas esperadas (GitHub Pages)
      const [conj, bv, rec] = await Promise.all([
        loadJson("./data/conjugaciones.json"),
        loadJson("./data/bv.json"),
        loadJson("./data/recursos.json"),
      ]);

      DATA.conjugaciones = Array.isArray(conj) ? conj : [];
      DATA.bv = Array.isArray(bv) ? bv : [];
      DATA.recursos = Array.isArray(rec) ? rec : [];

      initConjugaciones();
      initBV();
      initRecursos();
    } catch (e) {
      console.error(e);
      // si tienes un contenedor global de feedback, lo usamos
      const fb = byId("feedback");
      if (fb) {
        fb.style.display = "block";
        fb.textContent = `Error cargando datos: ${e.message}`;
      } else {
        alert(`Error cargando datos: ${e.message}`);
      }
    }
  }

  // ---------------------------
  // Conjugaciones (Reconocer + Producir)
  // ---------------------------
  function initConjugaciones() {
    // Elementos del HTML (según el index que veníamos usando)
    const conjTitle = byId("conjTitle");
    const conjSentence = byId("conjSentence");
    const conjInput = byId("conjInput");
    const conjCheck = byId("conjCheck");
    const conjNext = byId("conjNext");
    const conjHint = byId("conjHint");

    // Contenedor "producir"
    // Si tu index ya tiene estos IDs, perfecto. Si no, los creamos dentro de viewConjugaciones.
    let prodBox = byId("conjProduceBox");
    const conjView = views.conj;

    // Tabs Reconocer / Producir (si no existen, los creamos)
    let tabsRow = byId("conjTabsRow");
    let btnReconocer = byId("btnConjReconocer");
    let btnProducir = byId("btnConjProducir");

    if (conjView && !tabsRow) {
      tabsRow = document.createElement("div");
      tabsRow.id = "conjTabsRow";
      tabsRow.className = "row";
      tabsRow.style.marginBottom = "10px";

      btnReconocer = document.createElement("button");
      btnReconocer.id = "btnConjReconocer";
      btnReconocer.type = "button";
      btnReconocer.className = "small primary";
      btnReconocer.textContent = "Reconocer";

      btnProducir = document.createElement("button");
      btnProducir.id = "btnConjProducir";
      btnProducir.type = "button";
      btnProducir.className = "small";
      btnProducir.textContent = "Producir";

      tabsRow.appendChild(btnReconocer);
      tabsRow.appendChild(btnProducir);

      // insertar arriba del bloque de conjugaciones
      const firstCard = conjView.querySelector(".card") || conjView;
      firstCard.insertBefore(tabsRow, firstCard.firstChild);
    }

    // Si no existe caja producir, la montamos al final de la card
    if (conjView && !prodBox) {
      prodBox = document.createElement("div");
      prodBox.id = "conjProduceBox";
      prodBox.className = "card";
      prodBox.style.marginTop = "12px";
      conjView.appendChild(prodBox);
    }

    // Estado
    let mode = "reconocer"; // "reconocer" | "producir"
    let current = null;

    // Estado producir
    let selModo = null;      // Indicativo/Subjuntivo/Imperativo
    let selGrupo = null;     // Presente/Pretérito/Futuro/Condicional
    let selExacto = null;    // depende del grupo

    // UI producir (se renderiza siempre desde estado)
    function renderProduceUI() {
      if (!prodBox) return;

      // Si estamos en reconocer, ocultamos
      setHidden(prodBox, mode !== "producir");
      if (mode !== "producir") return;

      const form = (current?.solucion ?? current?.forma ?? "").toString().trim();
      const shown = form || "(sin forma en el JSON)";

      prodBox.innerHTML = `
        <div class="row space">
          <div>
            <h2 style="margin:0 0 6px 0;">Conjugaciones</h2>
            <div class="muted">Clasifica esta forma en 3 pasos.</div>
          </div>
        </div>

        <div class="hr"></div>

        <div style="font-size:18px;font-weight:800;margin-bottom:10px;">
          Forma: <span id="prodForma">${escapeHtml(shown)}</span>
        </div>

        <div class="label">1) Modo</div>
        <div class="row" id="prodRowModo"></div>

        <div class="label">2) Tiempo (grupo)</div>
        <div class="row" id="prodRowGrupo"></div>

        <div class="label">3) Tipo exacto</div>
        <div class="muted" id="prodExactHint" style="margin-bottom:8px;"></div>
        <div class="row" id="prodRowExacto"></div>

        <div class="row" style="margin-top:12px;">
          <button id="prodComprobar" class="primary" type="button">Comprobar</button>
          <button id="prodSiguiente" type="button">Siguiente</button>
        </div>
      `;

      // Construir filas de botones
      const rowModo = byId("prodRowModo");
      const rowGrupo = byId("prodRowGrupo");
      const rowExacto = byId("prodRowExacto");
      const hint = byId("prodExactHint");

      const modos = ["Indicativo", "Subjuntivo", "Imperativo"];
      buildButtonRow(rowModo, modos, (v) => {
        selModo = v;
        markSelected(rowModo, v);
      });

      const grupos = ["Presente", "Pretérito", "Futuro", "Condicional"];
      buildButtonRow(rowGrupo, grupos, (v) => {
        selGrupo = v;
        // al cambiar grupo, reiniciamos exacto
        selExacto = null;
        markSelected(rowGrupo, v);
        renderExactOptions(rowExacto, hint);
      });

      // marcar selecciones actuales si hay
      if (selModo) markSelected(rowModo, selModo);
      if (selGrupo) markSelected(rowGrupo, selGrupo);

      // Pintar exacto dependiente
      renderExactOptions(rowExacto, hint);

      // Botones
      byId("prodComprobar")?.addEventListener("click", () => checkProduce());
      byId("prodSiguiente")?.addEventListener("click", () => nextProduce());
    }

    function renderExactOptions(rowExacto, hintEl) {
      if (!rowExacto || !hintEl) return;

      // Sin elegir grupo aún
      if (!selGrupo) {
        setText(hintEl, "Elige antes el paso 2.");
        rowExacto.innerHTML = "";
        return;
      }

      // Presente: sin paso 3 real (lo fijamos a Presente)
      if (selGrupo === "Presente") {
        setText(hintEl, "En Presente no hay subdivisión aquí.");
        rowExacto.innerHTML = "";
        selExacto = "Presente";
        // lo mostramos como pill para que quede claro
        const pill = document.createElement("div");
        pill.className = "pill";
        pill.textContent = "Presente";
        rowExacto.appendChild(pill);
        return;
      }

      let opts = [];
      if (selGrupo === "Pretérito") {
        opts = [
          "Imperfecto",
          "Perfecto simple",
          "Perfecto compuesto",
          "Pluscuamperfecto",
          "Anterior",
        ];
      } else if (selGrupo === "Futuro") {
        opts = ["Futuro simple", "Futuro compuesto"];
      } else if (selGrupo === "Condicional") {
        opts = ["Condicional simple", "Condicional compuesto"];
      }

      setText(hintEl, "");
      buildButtonRow(rowExacto, opts, (v) => {
        selExacto = v;
        markSelected(rowExacto, v);
      });

      if (selExacto) markSelected(rowExacto, selExacto);
    }

    // Reconocer UI visible / oculto
    function setReconocerVisible(on) {
      // Reutilizamos elementos existentes (input, frase, etc.)
      // Si algún ID no existe, simplemente no rompemos.
      if (conjTitle) setText(conjTitle, on ? "Conjugaciones" : "Conjugaciones");
      setHidden(conjSentence?.closest(".card") || null, false); // no tocamos card

      // Mostramos/ocultamos partes concretas
      setHidden(conjSentence, !on);
      setHidden(conjInput?.parentElement || conjInput, !on);
      setHidden(conjCheck, !on);
      setHidden(conjNext, !on);
      setHidden(conjHint, !on);
    }

    // Elegir un item aleatorio
    function newItem() {
      if (!DATA.conjugaciones.length) return null;
      return pickRandom(DATA.conjugaciones);
    }

    // ---------- Reconocer ----------
    function startReconocer() {
      mode = "reconocer";
      btnReconocer?.classList.add("primary");
      btnProducir?.classList.remove("primary");
      setReconocerVisible(true);
      setHidden(prodBox, true);

      current = newItem();
      setText(conjSentence, current?.frase ?? "");
      if (conjInput) conjInput.value = "";
    }

    function checkReconocer() {
      if (!current) return;
      const correct = (current.solucion ?? "").toString().trim();
      const user = (conjInput?.value ?? "").toString().trim();

      // comparación sin distinguir mayúsculas/acentos
      const ok = normalize(user) === normalize(correct);

      const fb = byId("feedback");
      if (fb) {
        fb.style.display = "block";
        fb.className = "feedback " + (ok ? "ok" : "bad");
        fb.textContent = ok ? "¡Correcto!" : `No. La respuesta era: "${correct}"`;
      }

      // marcador (si existe)
      const score = byId("score");
      if (score) score.textContent = ok ? "Aciertos: 1 / 1" : "Aciertos: 0 / 1";
    }

    function nextReconocer() {
      current = newItem();
      setText(conjSentence, current?.frase ?? "");
      if (conjInput) conjInput.value = "";
      const fb = byId("feedback");
      if (fb) fb.style.display = "none";
    }

    conjCheck?.addEventListener("click", checkReconocer);
    conjNext?.addEventListener("click", nextReconocer);

    // ---------- Producir ----------
    function startProducir() {
      mode = "producir";
      btnProducir?.classList.add("primary");
      btnReconocer?.classList.remove("primary");
      setReconocerVisible(false);

      current = newItem();
      selModo = null;
      selGrupo = null;
      selExacto = null;

      renderProduceUI();
      const fb = byId("feedback");
      if (fb) fb.style.display = "none";
    }

    // A partir del "tiempo" del JSON, deducimos grupo + exacto esperado
    function expectedFromItem(item) {
      const modo = (item?.modo ?? "").toString().trim();
      const tiempo = (item?.tiempo ?? "").toString().trim();
      const t = normalize(tiempo);

      // 1) Modo esperado
      let expModo = "Indicativo";
      if (normalize(modo).includes("subj")) expModo = "Subjuntivo";
      else if (normalize(modo).includes("imper")) expModo = "Imperativo";
      else expModo = "Indicativo";

      // 2) Grupo + 3) Exacto
      let expGrupo = "Presente";
      let expExacto = "Presente";

      const isCond = t.includes("condicional");
      const isFut = t.includes("futuro");
      const isPres = t.includes("presente");
      const isPret =
        t.includes("preterito") ||
        t.includes("imperfecto") ||
        t.includes("pluscuamperfecto") ||
        t.includes("anterior") ||
        (t.includes("perfecto") && !isPres);

      if (isCond) {
        expGrupo = "Condicional";
        expExacto = t.includes("compuesto") ? "Condicional compuesto" : "Condicional simple";
      } else if (isFut) {
        expGrupo = "Futuro";
        expExacto = t.includes("compuesto") ? "Futuro compuesto" : "Futuro simple";
      } else if (isPret) {
        expGrupo = "Pretérito";

        // Mapping a los nombres que quieres en el paso 3
        if (t.includes("imperfecto")) expExacto = "Imperfecto";
        else if (t.includes("pluscuamperfecto")) expExacto = "Pluscuamperfecto";
        else if (t.includes("anterior")) expExacto = "Anterior";
        else if (t.includes("perfecto compuesto")) expExacto = "Perfecto compuesto";
        else if (t.includes("perfecto simple")) expExacto = "Perfecto simple";
        else if (t.includes("perfecto") && t.includes("compuesto")) expExacto = "Perfecto compuesto";
        else if (t.includes("perfecto") && t.includes("simple")) expExacto = "Perfecto simple";
        else if (t.includes("perfecto")) {
          // por defecto: si pone "pretérito perfecto" lo tratamos como simple (muchos materiales lo llaman así)
          expExacto = "Perfecto simple";
        } else {
          // fallback
          expExacto = "Perfecto simple";
        }
      } else if (isPres) {
        expGrupo = "Presente";
        expExacto = "Presente";
      } else {
        // fallback conservador
        expGrupo = "Presente";
        expExacto = "Presente";
      }

      return { expModo, expGrupo, expExacto };
    }

    function checkProduce() {
      if (!current) return;

      const { expModo, expGrupo, expExacto } = expectedFromItem(current);

      // validaciones mínimas
      if (!selModo || !selGrupo) {
        showProduceFeedback(false, "Te falta elegir el modo (1) y el tiempo (2).");
        return;
      }
      // Presente fija exacto a Presente
      if (selGrupo === "Presente") selExacto = "Presente";

      if (!selExacto) {
        showProduceFeedback(false, "Te falta elegir el tipo exacto (3).");
        return;
      }

      const ok =
        normalize(selModo) === normalize(expModo) &&
        normalize(selGrupo) === normalize(expGrupo) &&
        normalize(selExacto) === normalize(expExacto);

      if (ok) {
        showProduceFeedback(true, "¡Correcto!");
      } else {
        showProduceFeedback(
          false,
          `No. Era: ${expModo} / ${expGrupo} / ${expExacto}`
        );
      }
    }

    function showProduceFeedback(ok, msg) {
      const fb = byId("feedback");
      if (!fb) {
        alert(msg);
        return;
      }
      fb.style.display = "block";
      fb.className = "feedback " + (ok ? "ok" : "bad");
      fb.textContent = msg;
    }

    function nextProduce() {
      current = newItem();
      selModo = null;
      selGrupo = null;
      selExacto = null;
      renderProduceUI();
      const fb = byId("feedback");
      if (fb) fb.style.display = "none";
    }

    // Tabs
    btnReconocer?.addEventListener("click", startReconocer);
    btnProducir?.addEventListener("click", startProducir);

    // Arranque por defecto
    startReconocer();
  }

  // ---------------------------
  // b/v (si ya te funcionaba, lo dejamos simple)
  // ---------------------------
  function initBV() {
    const wordEl = byId("bvWord");
    const btnB = byId("bvB");
    const btnV = byId("bvV");
    const next = byId("bvNext");

    if (!wordEl || !btnB || !btnV || !next) return;

    let items = DATA.bv.length ? shuffle(DATA.bv) : [];
    let idx = 0;

    function render() {
      const it = items[idx];
      setText(wordEl, it?.palabra ?? it?.prompt ?? "");
    }

    function check(letter) {
      const it = items[idx];
      const ok = normalize(it?.respuesta ?? it?.solucion ?? "") === normalize(letter);
      const fb = byId("feedback");
      if (fb) {
        fb.style.display = "block";
        fb.className = "feedback " + (ok ? "ok" : "bad");
        fb.textContent = ok ? "¡Correcto!" : `No. Era: ${it?.respuesta ?? it?.solucion ?? ""}`;
      }
    }

    btnB.addEventListener("click", () => check("b"));
    btnV.addEventListener("click", () => check("v"));
    next.addEventListener("click", () => {
      idx = (idx + 1) % items.length;
      const fb = byId("feedback");
      if (fb) fb.style.display = "none";
      render();
    });

    render();
  }

  // ---------------------------
  // Recursos literarios (si ya te funcionaba, lo dejamos simple)
  // ---------------------------
  function initRecursos() {
    // Si tu recursos.html usa otros IDs, aquí no rompemos nada.
    // Lo importante es no interferir.
  }

  // ---------------------------
  // util: escapar HTML en innerHTML
  // ---------------------------
  function escapeHtml(str) {
    return (str ?? "")
      .toString()
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ---------------------------
  // GO!
  // ---------------------------
  showView("home");
  boot();
})();
