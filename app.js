/* Lengua — Pablo (app.js)
   - Home: 3 módulos
   - Conjugaciones:
        * Modo 1: Reconocer (frase -> escribir verbo -> clasificar 8 rasgos)
        * Modo 2: Producir (verbo + persona/número + pista -> escribir forma -> clasificar 3 niveles)
   - b/v y Recursos literarios: siguen funcionando
*/

(() => {
  // -------------------------
  // Helpers
  // -------------------------
  const $ = (id) => document.getElementById(id);

  const norm = (s) => {
    if (s == null) return "";
    return String(s)
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""); // quita tildes
  };

  const showFeedback = (type, msg) => {
    const box = $("feedback");
    if (!box) return;
    box.style.display = "block";
    box.className = "feedback " + (type === "ok" ? "ok" : "bad");
    box.textContent = msg;
    clearTimeout(showFeedback._t);
    showFeedback._t = setTimeout(() => {
      box.style.display = "none";
    }, 2500);
  };

  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // -------------------------
  // State
  // -------------------------
  const state = {
    view: "home",

    scoreOk: 0,
    scoreTotal: 0,

    conj: {
      data: [],
      idx: 0,
      item: null,
      mode: "reconocer", // "reconocer" | "producir"

      // Reconocer:
      recogAnsweredVerb: false,

      // Clasificación (8) para reconocer:
      recogClassAnswers: {}, // { persona, numero, tiempo, modo, conjugacion, aspecto, voz, regularidad }

      // Producir:
      prodAnsweredForm: false,
      prodLevels: { l1: null, l2: null, l3: null }, // user
    },

    bv: { data: [], item: null },
    rec: { data: null, mode: "teoria", item: null },
  };

  // -------------------------
  // Data loading
  // -------------------------
  async function loadJSON(path) {
    // Cache-bust suave para evitar “enganche” si algo queda cacheado
    const url = `${path}?v=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`No se pudo cargar ${path}`);
    return await res.json();
  }

  async function initData() {
    // Conjugaciones
    state.conj.data = await loadJSON("./data/conjugaciones.json");

    // b/v
    state.bv.data = await loadJSON("./data/bv.json");

    // Recursos
    state.rec.data = await loadJSON("./data/recursos.json");
  }

  // -------------------------
  // Navigation / Views
  // -------------------------
  function setModeTitle(text) {
    const el = $("modeTitle");
    if (!el) return;
    el.textContent = text ? " " + text : "";
  }

  function showView(name) {
    state.view = name;
    const views = document.querySelectorAll(".view");
    views.forEach((v) => v.classList.remove("active"));
    const target = $(name);
    if (target) target.classList.add("active");

    if (name === "home") setModeTitle("");
    if (name === "conjugaciones") setModeTitle("Conjugaciones verbales");
    if (name === "bv") setModeTitle("Ortografía: b / v");
    if (name === "recursos") setModeTitle("Recursos literarios");
  }

  function updateScore() {
    const s = $("score");
    if (!s) return;
    s.textContent = `Aciertos: ${state.scoreOk} / ${state.scoreTotal}`;
  }

  function resetScore() {
    state.scoreOk = 0;
    state.scoreTotal = 0;
    updateScore();
    showFeedback("ok", "Marcador reiniciado.");
  }

  // -------------------------
  // Conjugaciones: UI helpers
  // -------------------------
  function ensureConjModeToggle() {
    // Inserta un mini selector “Reconocer / Producir” dentro de la tarjeta
    const card = $("conjugaciones")?.querySelector(".card");
    if (!card) return;

    if (card.querySelector("[data-conj-toggle='1']")) return;

    const bar = document.createElement("div");
    bar.dataset.conjToggle = "1";
    bar.style.display = "flex";
    bar.style.gap = "10px";
    bar.style.flexWrap = "wrap";
    bar.style.marginBottom = "10px";

    const b1 = document.createElement("button");
    b1.className = "chip";
    b1.textContent = "Reconocer";
    b1.id = "btnConjRec";

    const b2 = document.createElement("button");
    b2.className = "chip";
    b2.textContent = "Producir";
    b2.id = "btnConjProd";

    bar.appendChild(b1);
    bar.appendChild(b2);

    const h2 = card.querySelector("h2");
    h2.insertAdjacentElement("afterend", bar);

    const sync = () => {
      const rec = $("btnConjRec");
      const prod = $("btnConjProd");
      if (!rec || !prod) return;
      const isRec = state.conj.mode === "reconocer";
      rec.style.opacity = isRec ? "1" : "0.65";
      prod.style.opacity = isRec ? "0.65" : "1";
    };

    b1.addEventListener("click", () => {
      state.conj.mode = "reconocer";
      sync();
      nextConjItem(true);
    });

    b2.addEventListener("click", () => {
      state.conj.mode = "producir";
      sync();
      nextConjItem(true);
    });

    sync();
  }

  function renderConjClassify8(container, item) {
    // 8 bloques de clasificación para el modo “Reconocer”
    // Se corrige contra: persona, numero, tiempo, modo, conjugacion, aspecto, voz, regularidad

    container.innerHTML = "";

    const blocks = [
      { key: "persona", label: "1) Persona", options: ["Primera", "Segunda", "Tercera"], correct: item.persona },
      { key: "numero", label: "2) Número", options: ["Singular", "Plural"], correct: item.numero },
      {
        key: "tiempo",
        label: "3) Tiempo",
        options: [
          "Presente",
          "Pretérito imperfecto",
          "Pretérito perfecto simple",
          "Pretérito perfecto compuesto",
          "Pluscuamperfecto",
          "Futuro",
          "Futuro perfecto",
          "Condicional",
          "Condicional perfecto",
          "Imperativo",
        ],
        correct: item.tiempo,
      },
      { key: "modo", label: "4) Modo", options: ["Indicativo", "Subjuntivo", "Imperativo"], correct: item.modo },
      { key: "conjugacion", label: "5) Conjugación", options: ["Primera", "Segunda", "Tercera"], correct: item.conjugacion },
      { key: "aspecto", label: "6) Aspecto", options: ["Simple", "Compuesto"], correct: item.aspecto },
      { key: "voz", label: "7) Voz", options: ["Activa", "Pasiva"], correct: item.voz },
      { key: "regularidad", label: "8) Regularidad", options: ["Regular", "Irregular"], correct: item.regularidad },
    ];

    const title = document.createElement("div");
    title.className = "hint";
    title.textContent = "Ahora clasifica el verbo:";
    title.style.marginTop = "8px";
    container.appendChild(title);

    blocks.forEach((b) => {
      const wrap = document.createElement("div");
      wrap.className = "question";

      const t = document.createElement("div");
      t.className = "hint";
      t.style.margin = "10px 0 6px";
      t.textContent = b.label;
      wrap.appendChild(t);

      const row = document.createElement("div");
      row.className = "choices";

      b.options.forEach((opt) => {
        const btn = document.createElement("button");
        btn.className = "chip";
        btn.textContent = opt;

        btn.addEventListener("click", () => {
          // guardar selección
          state.conj.recogClassAnswers[b.key] = opt;

          const ok = norm(opt) === norm(b.correct);

          if (ok) {
            showFeedback("ok", "✅ Correcto");
          } else {
            showFeedback("bad", `❌ No. Era: ${b.correct || "(sin dato)"}`);
          }

          // marcar visual
          [...row.children].forEach((c) => (c.style.outline = "none"));
          btn.style.outline = ok ? "2px solid rgba(46,204,113,.55)" : "2px solid rgba(255,92,92,.55)";
        });

        row.appendChild(btn);
      });

      wrap.appendChild(row);
      container.appendChild(wrap);
    });
  }

  // -------------------------
  // Conjugaciones: mapping “al revés” (modo 2)
  // -------------------------
  function mapLevels(item) {
    // Nivel 1 (modo): Indicativo / Subjuntivo / Imperativo
    const l1 = (item.modo || "").trim() || "Indicativo";

    // Nivel 2 (bloque): Presente / Pretérito / Futuro / Condicional  (como tú quieres)
    const t = norm(item.tiempo);
    let l2 = "Pretérito"; // por defecto

    if (t.includes("presente")) l2 = "Presente";
    else if (t.includes("futuro")) l2 = "Futuro";
    else if (t.includes("condicional")) l2 = "Condicional";
    else l2 = "Pretérito";

    // Imperativo: forzamos Presente (y listo)
    if (norm(l1) === "imperativo") l2 = "Presente";

    // Nivel 3 (detalle): “Imperfecto / Perfecto simple / Perfecto compuesto / Pluscuamperfecto / ...”
    let l3 = (item.tiempo || "").trim();

    // Normalizamos a etiquetas “cortas” para el nivel 3
    // (sin impedir que el dato real sea el que valida)
    const nt = norm(item.tiempo);

    if (norm(l1) === "imperativo") {
      l3 = "Imperativo";
    } else if (nt.includes("pluscuamperfecto")) {
      l3 = "Pluscuamperfecto";
    } else if (nt.includes("imperfecto")) {
      l3 = "Imperfecto";
    } else if (nt.includes("perfecto") && nt.includes("compuesto")) {
      l3 = "Perfecto compuesto";
    } else if (nt.includes("perfecto") && nt.includes("simple")) {
      l3 = "Perfecto simple";
    } else if (nt.includes("futuro") && nt.includes("perfecto")) {
      l3 = "Futuro perfecto";
    } else if (nt.includes("condicional") && nt.includes("perfecto")) {
      l3 = "Condicional perfecto";
    } else if (nt.includes("condicional")) {
      l3 = "Condicional";
    } else if (nt.includes("futuro")) {
      l3 = "Futuro";
    } else if (nt.includes("presente")) {
      l3 = "Presente";
    }

    return { l1, l2, l3 };
  }

  function renderConjClassify3(container, expectedLevels) {
    container.innerHTML = "";

    const title = document.createElement("div");
    title.className = "hint";
    title.textContent = "Ahora clasifica la conjugación en 3 pasos:";
    title.style.marginTop = "8px";
    container.appendChild(title);

    // Paso 1
    const step1 = document.createElement("div");
    step1.className = "question";
    step1.innerHTML = `<div class="hint" style="margin:10px 0 6px;">1) Modo</div>`;
    const row1 = document.createElement("div");
    row1.className = "choices";

    ["Indicativo", "Subjuntivo", "Imperativo"].forEach((opt) => {
      const b = document.createElement("button");
      b.className = "chip";
      b.textContent = opt;
      b.addEventListener("click", () => {
        state.conj.prodLevels.l1 = opt;
        const ok = norm(opt) === norm(expectedLevels.l1);
        showFeedback(ok ? "ok" : "bad", ok ? "✅ Correcto" : `❌ No. Era: ${expectedLevels.l1}`);
        [...row1.children].forEach((c) => (c.style.outline = "none"));
        b.style.outline = ok ? "2px solid rgba(46,204,113,.55)" : "2px solid rgba(255,92,92,.55)";
        // si es imperativo, forzamos nivel2
        renderLevel2();
      });
      row1.appendChild(b);
    });
    step1.appendChild(row1);
    container.appendChild(step1);

    // Paso 2
    const step2 = document.createElement("div");
    step2.className = "question";
    step2.innerHTML = `<div class="hint" style="margin:10px 0 6px;">2) Presente / Pretérito / Futuro / Condicional</div>`;
    const row2 = document.createElement("div");
    row2.className = "choices";
    step2.appendChild(row2);
    container.appendChild(step2);

    // Paso 3
    const step3 = document.createElement("div");
    step3.className = "question";
    step3.innerHTML = `<div class="hint" style="margin:10px 0 6px;">3) Tipo exacto</div>`;
    const row3 = document.createElement("div");
    row3.className = "choices";
    step3.appendChild(row3);
    container.appendChild(step3);

    function renderLevel2() {
      row2.innerHTML = "";
      const isImper = norm(state.conj.prodLevels.l1 || "") === "imperativo";

      const opts = ["Presente", "Pretérito", "Futuro", "Condicional"].map((o) => ({
        label: o,
        disabled: isImper && o !== "Presente",
      }));

      opts.forEach(({ label, disabled }) => {
        const b = document.createElement("button");
        b.className = "chip";
        b.textContent = label;
        b.disabled = !!disabled;
        b.style.opacity = disabled ? "0.35" : "1";

        b.addEventListener("click", () => {
          state.conj.prodLevels.l2 = label;
          const ok = norm(label) === norm(expectedLevels.l2);
          showFeedback(ok ? "ok" : "bad", ok ? "✅ Correcto" : `❌ No. Era: ${expectedLevels.l2}`);
          [...row2.children].forEach((c) => (c.style.outline = "none"));
          b.style.outline = ok ? "2px solid rgba(46,204,113,.55)" : "2px solid rgba(255,92,92,.55)";
          renderLevel3();
        });

        row2.appendChild(b);
      });

      // Si imperativo: auto-set nivel2 a Presente para guiar
      if (isImper) {
        state.conj.prodLevels.l2 = "Presente";
        renderLevel3();
      }
    }

    function renderLevel3() {
      row3.innerHTML = "";

      const isImper = norm(expectedLevels.l1) === "imperativo";
      let options = [];

      if (isImper) {
        options = ["Imperativo"];
      } else if (norm(state.conj.prodLevels.l2 || expectedLevels.l2) === "presente") {
        options = ["Presente", "Perfecto compuesto"];
      } else if (norm(state.conj.prodLevels.l2) === "futuro") {
        options = ["Futuro", "Futuro perfecto"];
      } else if (norm(state.conj.prodLevels.l2) === "condicional") {
        options = ["Condicional", "Condicional perfecto"];
      } else {
        // Pretérito
        options = ["Imperfecto", "Perfecto simple", "Perfecto compuesto", "Pluscuamperfecto"];
      }

      options.forEach((opt) => {
        const b = document.createElement("button");
        b.className = "chip";
        b.textContent = opt;
        b.addEventListener("click", () => {
          state.conj.prodLevels.l3 = opt;

          const ok = norm(opt) === norm(expectedLevels.l3);
          showFeedback(ok ? "ok" : "bad", ok ? "✅ Correcto" : `❌ No. Era: ${expectedLevels.l3}`);
          [...row3.children].forEach((c) => (c.style.outline = "none"));
          b.style.outline = ok ? "2px solid rgba(46,204,113,.55)" : "2px solid rgba(255,92,92,.55)";
        });
        row3.appendChild(b);
      });
    }

    // Inicializa paso 2 y 3
    renderLevel2();
    renderLevel3();
  }

  // -------------------------
  // Conjugaciones: flow
  // -------------------------
  function nextConjItem(reset = false) {
    if (!state.conj.data.length) return;

    ensureConjModeToggle();

    // reset UI
    const sentence = $("conjSentence");
    const input = $("conjInput");
    const hint = $("conjHint");
    const classify = $("conjClassify");

    if (reset) {
      // Cuando cambias de modo, reiniciamos estado
      state.conj.recogAnsweredVerb = false;
      state.conj.prodAnsweredForm = false;
      state.conj.recogClassAnswers = {};
      state.conj.prodLevels = { l1: null, l2: null, l3: null };
    }

    classify.style.display = "none";
    classify.innerHTML = "";
    hint.textContent = "";

    input.value = "";
    input.focus();

    // item random
    state.conj.item = pickRandom(state.conj.data);

    const it = state.conj.item;

    if (state.conj.mode === "reconocer") {
      sentence.textContent = it.frase || "";
      hint.textContent = "Escribe el verbo (o grupo verbal) tal como aparece en la frase.";
    } else {
      // Producir (A): mostramos infinitivo + persona/número + “conjugación a clasificar luego”
      const pers = it.persona || "";
      const num = it.numero || "";
      const inf = it.infinitivo || "(verbo)";
      sentence.textContent = `Verbo: ${inf}. Persona: ${pers} / ${num}. Escribe la forma correcta.`;
      hint.textContent = "Después tendrás que clasificar la conjugación en 3 pasos.";
    }
  }

  function checkConj() {
    const it = state.conj.item;
    if (!it) return;

    const input = $("conjInput");
    const user = norm(input.value);

    if (!user) {
      showFeedback("bad", "Escribe una respuesta.");
      return;
    }

    if (state.conj.mode === "reconocer") {
      const expected = norm(it.solucion);

      // Aquí esperamos que el alumno copie el “verbo o grupo verbal”
      const ok = user === expected;

      state.scoreTotal += 1;
      if (ok) state.scoreOk += 1;
      updateScore();

      if (ok) {
        showFeedback("ok", "¡Correcto!");
        // mostrar clasificación 8 rasgos
        const classify = $("conjClassify");
        classify.style.display = "block";
        renderConjClassify8(classify, it);
      } else {
        showFeedback("bad", `No. La respuesta era: "${it.solucion}"`);
      }
    } else {
      // producir
      const expectedForm = norm(it.solucion);
      const ok = user === expectedForm;

      state.scoreTotal += 1;
      if (ok) state.scoreOk += 1;
      updateScore();

      if (ok) {
        showFeedback("ok", "¡Correcto!");
      } else {
        showFeedback("bad", `No. La respuesta era: "${it.solucion}"`);
      }

      // Siempre mostramos clasificación 3 niveles (aunque falle, para aprender)
      const classify = $("conjClassify");
      classify.style.display = "block";

      // Calcula niveles esperados según tu esquema
      const expectedLevels = mapLevels(it);
      renderConjClassify3(classify, expectedLevels);
    }
  }

  // -------------------------
  // b/v
  // -------------------------
  function nextBV() {
    if (!state.bv.data.length) return;
    state.bv.item = pickRandom(state.bv.data);

    const w = $("bvWord");
    const r = $("bvReveal");

    if (w) w.textContent = state.bv.item.palabra || "";
    if (r) r.textContent = "";
  }

  function answerBV(letter) {
    const it = state.bv.item;
    if (!it) return;

    const expected = norm(it.correcta).includes("b") ? "b" : "v"; // fallback
    // Mejor: si el JSON trae el campo "letra"
    const exp = it.letra ? norm(it.letra) : expected;

    state.scoreTotal += 1;
    const ok = norm(letter) === exp;
    if (ok) state.scoreOk += 1;
    updateScore();

    if (ok) showFeedback("ok", "¡Correcto!");
    else showFeedback("bad", `No. Era "${it.correcta}"`);

    const r = $("bvReveal");
    if (r) r.textContent = `Solución: ${it.correcta}`;
  }

  // -------------------------
  // Recursos literarios
  // -------------------------
  function setRecMode(mode) {
    state.rec.mode = mode; // "teoria" | "practica"
    const label = $("recMode");
    if (label) label.textContent = mode === "teoria" ? "Teoría" : "Práctica";
    nextRec();
  }

  function nextRec() {
    if (!state.rec.data) return;
    const mode = state.rec.mode;

    const arr = mode === "teoria" ? state.rec.data.teoria : state.rec.data.practica;
    if (!Array.isArray(arr) || !arr.length) return;

    state.rec.item = pickRandom(arr);

    const prompt = $("recPrompt");
    if (prompt) prompt.textContent = state.rec.item.texto || "";
  }

  function answerRec(recurso) {
    const it = state.rec.item;
    if (!it) return;

    state.scoreTotal += 1;
    const ok = norm(recurso) === norm(it.respuesta);
    if (ok) state.scoreOk += 1;
    updateScore();

    if (ok) showFeedback("ok", "¡Correcto!");
    else showFeedback("bad", `No. Era: ${it.respuesta}`);
  }

  // -------------------------
  // Wire events
  // -------------------------
  function bindEvents() {
    // Home buttons
    $("homeConj")?.addEventListener("click", () => {
      showView("conjugaciones");
      nextConjItem(true);
    });

    $("homeBV")?.addEventListener("click", () => {
      showView("bv");
      nextBV();
    });

    $("homeRec")?.addEventListener("click", () => {
      showView("recursos");
      nextRec();
    });

    // Footer
    $("btn-home")?.addEventListener("click", () => showView("home"));
    $("btn-reset")?.addEventListener("click", () => resetScore());

    // Conjugaciones
    $("conjCheck")?.addEventListener("click", () => checkConj());
    $("conjInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") checkConj();
    });
    $("conjNext")?.addEventListener("click", () => nextConjItem(true));

    // b/v
    $("bvB")?.addEventListener("click", () => answerBV("b"));
    $("bvV")?.addEventListener("click", () => answerBV("v"));
    $("bvNext")?.addEventListener("click", () => nextBV());

    // recursos
    $("recTheory")?.addEventListener("click", () => setRecMode("teoria"));
    $("recPractice")?.addEventListener("click", () => setRecMode("practica"));
    $("recNext")?.addEventListener("click", () => nextRec());

    $("recButtons")?.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-recurso]");
      if (!btn) return;
      answerRec(btn.getAttribute("data-recurso"));
    });
  }

  // -------------------------
  // Boot
  // -------------------------
  (async function boot() {
    try {
      bindEvents();
      updateScore();
      showView("home");
      await initData();

      // Deja preparado por si entran directos
      ensureConjModeToggle();
    } catch (err) {
      console.error(err);
      showFeedback("bad", "Error cargando datos. Revisa que existan los JSON en /data.");
    }
  })();
})();
