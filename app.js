/* 
  Lengua — Pablo (GitHub Pages)
  App 100% estática (HTML+CSS+JS).

  Secciones:
  - Conjugaciones verbales
      * Reconocer: ver una frase y escribir el verbo (o grupo verbal) tal cual.
      * Producir: ver una forma (p.ej. "nos lavamos") y clasificarla en 3 pasos:
          1) Modo: Indicativo / Subjuntivo / Imperativo
          2) Bloque: Presente / Pretérito / Futuro / Condicional
          3) Tipo exacto (dependiente del bloque)
  - Ortografía b/v
  - Recursos literarios
*/

(() => {
  'use strict';

  // ---------------------------
  // Helpers
  // ---------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  function norm(s) {
    return String(s ?? '')
      .trim()
      .toLowerCase()
      .replaceAll('\u00A0', ' ');
  }

  function show(el) {
    if (!el) return;
    el.classList.remove('hidden');
    el.style.display = '';
  }

  function hide(el) {
    if (!el) return;
    el.classList.add('hidden');
    el.style.display = 'none';
  }

  function setModeTitle(text) {
    const t = $('#modeTitle');
    if (t) t.textContent = text ? ` ${text}` : '';
  }

  function setFeedback(type, html) {
    const box = $('#feedback');
    if (!box) return;
    box.classList.remove('ok', 'bad');
    if (!html) {
      hide(box);
      box.innerHTML = '';
      return;
    }
    box.classList.add(type === 'ok' ? 'ok' : 'bad');
    box.innerHTML = html;
    show(box);
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  async function loadJSON(path) {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(`No se pudo cargar ${path} (${res.status})`);
    return res.json();
  }

  // ---------------------------
  // Navegación por pantallas
  // ---------------------------
  const views = {
    home: $('#home'),
    conjugaciones: $('#conjugaciones'),
    bv: $('#bv'),
    recursos: $('#recursos'),
  };

  function showView(key) {
    for (const [k, el] of Object.entries(views)) {
      if (!el) continue;
      el.classList.toggle('active', k === key);
    }
  }

  // ---------------------------
  // Estado / marcador
  // ---------------------------
  const scoreState = {
    ok: 0,
    total: 0,
  };

  function updateScore() {
    const el = $('#score');
    if (el) el.textContent = `Aciertos: ${scoreState.ok} / ${Math.max(1, scoreState.total)}`;
  }

  function resetScore() {
    scoreState.ok = 0;
    scoreState.total = 0;
    updateScore();
    setFeedback(null, '');
  }

  // ---------------------------
  // Datos
  // ---------------------------
  const dataState = {
    conjugaciones: [],
    bv: [],
    recursos: null,
  };

  // ---------------------------
  // Mapeo de tiempos -> niveles (Producir)
  // ---------------------------
  const STEP2 = ['Presente', 'Pretérito', 'Futuro', 'Condicional'];

  const STEP3_BY_STEP2 = {
    Presente: ['Presente'],
    Pretérito: ['Imperfecto', 'Perfecto simple', 'Perfecto compuesto', 'Pluscuamperfecto'],
    Futuro: ['Futuro', 'Futuro perfecto'],
    Condicional: ['Condicional', 'Condicional perfecto'],
  };

  function parseStep2(tiempo, modo) {
    const t = String(tiempo ?? '').trim();
    if (modo === 'Imperativo') return null;
    if (!t) return null;
    if (/^presente/i.test(t)) return 'Presente';
    if (/^pretérito/i.test(t) || /imperfecto/i.test(t)) return 'Pretérito';
    if (/^futuro/i.test(t)) return 'Futuro';
    if (/^condicional/i.test(t)) return 'Condicional';
    return null;
  }

  function parseStep3(tiempo, modo) {
    if (modo === 'Imperativo') return 'Imperativo';
    const t = String(tiempo ?? '').trim().toLowerCase();

    if (t === 'presente') return 'Presente';
    if (t.includes('imperfecto')) return 'Imperfecto';
    if (t.includes('pluscuamperfecto')) return 'Pluscuamperfecto';
    if (t.includes('perfecto compuesto')) return 'Perfecto compuesto';
    if (t.includes('perfecto simple')) return 'Perfecto simple';
    if (t.includes('futuro perfecto')) return 'Futuro perfecto';
    if (t === 'futuro simple' || t === 'futuro') return 'Futuro';
    if (t.includes('condicional perfecto')) return 'Condicional perfecto';
    if (t === 'condicional simple' || t === 'condicional') return 'Condicional';

    // Si viene algo raro, intentamos heurística mínima
    if (t.startsWith('pretérito')) {
      if (t.includes('compuesto')) return 'Perfecto compuesto';
      if (t.includes('simple')) return 'Perfecto simple';
      if (t.includes('plus')) return 'Pluscuamperfecto';
      if (t.includes('imperfect')) return 'Imperfecto';
    }
    return null;
  }

  // ---------------------------
  // Render: HOME (botones principales)
  // ---------------------------
  function wireHomeButtons() {
    const btnConj = $('#goConjugaciones');
    const btnBV = $('#goBV');
    const btnRec = $('#goRecursos');

    if (btnConj) {
      btnConj.addEventListener('click', () => {
        resetScore();
        setModeTitle('Conjugaciones verbales');
        showView('conjugaciones');
        Conj.initIfNeeded();
        Conj.showTab('reconocer');
      });
    }
    if (btnBV) {
      btnBV.addEventListener('click', () => {
        resetScore();
        setModeTitle('Ortografía: b / v');
        showView('bv');
        BV.initIfNeeded();
        BV.next();
      });
    }
    if (btnRec) {
      btnRec.addEventListener('click', () => {
        resetScore();
        setModeTitle('Recursos literarios');
        showView('recursos');
        Recursos.initIfNeeded();
        Recursos.showMode('teoria');
      });
    }
  }

  function wireFooter() {
    const homeLink = $('#homeLink');
    const resetLink = $('#resetLink');

    if (homeLink) {
      homeLink.addEventListener('click', (e) => {
        e.preventDefault();
        setModeTitle('');
        setFeedback(null, '');
        showView('home');
      });
    }

    if (resetLink) {
      resetLink.addEventListener('click', (e) => {
        e.preventDefault();
        resetScore();
        Conj.reset();
        BV.reset();
        Recursos.reset();
      });
    }
  }

  // ---------------------------
  // Conjugaciones
  // ---------------------------
  const Conj = (() => {
    let inited = false;

    // estado común
    let tab = 'reconocer'; // reconocer | producir
    let idx = 0;

    // RECONOCER
    let current = null;

    // PRODUCIR
    let currentP = null;
    const sel = {
      step1: null, // Indicativo/Subjuntivo/Imperativo
      step2: null, // Presente/Pretérito/Futuro/Condicional
      step3: null, // depende
    };

    function initIfNeeded() {
      if (inited) return;
      inited = true;

      const root = views.conjugaciones;
      if (!root) return;

      // Renderizamos el interior para no depender de ids antiguos.
      root.innerHTML = `
        <div class="card">
          <div class="sectionTitle">Conjugaciones</div>

          <div class="choices" style="margin: 8px 0 14px;">
            <button class="chip" id="conjTabReconocer" type="button">Reconocer</button>
            <button class="chip" id="conjTabProducir" type="button">Producir</button>
          </div>

          <!-- RECONOCER -->
          <div id="conjViewReconocer">
            <div class="sentence" id="conjSentence">...</div>

            <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:10px;">
              <input id="conjAnswer" type="text" placeholder="Escribe el verbo (o grupo verbal)" autocomplete="off" />
              <button class="btn" id="conjCheck" type="button">Comprobar</button>
            </div>

            <div class="hint" style="margin-top:8px;">Escribe el verbo (o grupo verbal) tal como aparece en la frase.</div>

            <div style="margin-top:14px; display:flex; justify-content:flex-end;">
              <button class="btn" id="conjNext" type="button">Siguiente</button>
            </div>
          </div>

          <!-- PRODUCIR -->
          <div id="conjViewProducir" class="hidden">
            <div class="sentence" id="prodFormLine">Forma: ...</div>
            <div class="hint" style="margin-top:6px;">Clasifica esta forma en 3 pasos.</div>

            <div style="margin-top:10px;">
              <div class="question">1) Modo</div>
              <div class="choices" id="prodStep1"></div>

              <div class="question" style="margin-top:10px;">2) Presente / Pretérito / Futuro / Condicional</div>
              <div class="choices" id="prodStep2"></div>

              <div class="question" style="margin-top:10px;">3) Tipo exacto</div>
              <div class="choices" id="prodStep3"></div>
            </div>

            <div style="margin-top:14px; display:flex; gap:10px; justify-content:flex-start; flex-wrap:wrap;">
              <button class="btn" id="prodCheck" type="button">Comprobar</button>
              <button class="btn" id="prodNext" type="button">Siguiente</button>
            </div>
          </div>
        </div>
      `;

      // Tabs
      $('#conjTabReconocer')?.addEventListener('click', () => showTab('reconocer'));
      $('#conjTabProducir')?.addEventListener('click', () => showTab('producir'));

      // Reconocer handlers
      $('#conjCheck')?.addEventListener('click', onCheckReconocer);
      $('#conjNext')?.addEventListener('click', () => {
        setFeedback(null, '');
        nextReconocer();
      });
      $('#conjAnswer')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') onCheckReconocer();
      });

      // Producir handlers
      $('#prodCheck')?.addEventListener('click', onCheckProducir);
      $('#prodNext')?.addEventListener('click', () => {
        setFeedback(null, '');
        nextProducir();
      });

      // Render buttons step1/step2 (fijos)
      renderProdStep1();
      renderProdStep2();
      renderProdStep3(); // vacío inicial
    }

    function reset() {
      idx = 0;
      current = null;
      currentP = null;
      sel.step1 = sel.step2 = sel.step3 = null;
      setFeedback(null, '');

      if (inited) {
        $('#conjAnswer') && ($('#conjAnswer').value = '');
        $('#conjSentence') && ($('#conjSentence').textContent = '...');
        $('#prodFormLine') && ($('#prodFormLine').textContent = 'Forma: ...');
        renderProdStep1();
        renderProdStep2();
        renderProdStep3();
      }
    }

    function showTab(which) {
      tab = which;
      setFeedback(null, '');

      const vR = $('#conjViewReconocer');
      const vP = $('#conjViewProducir');

      if (which === 'reconocer') {
        show(vR);
        hide(vP);
        $('#conjTabReconocer')?.classList.add('active');
        $('#conjTabProducir')?.classList.remove('active');
        if (!current) nextReconocer(true);
      } else {
        hide(vR);
        show(vP);
        $('#conjTabProducir')?.classList.add('active');
        $('#conjTabReconocer')?.classList.remove('active');
        if (!currentP) nextProducir(true);
      }
    }

    function pickRandomConj() {
      const list = dataState.conjugaciones;
      if (!list?.length) return null;
      idx = (idx + 1) % list.length;
      // usamos mezcla estable si quieres más aleatorio:
      // return list[Math.floor(Math.random() * list.length)];
      return list[idx];
    }

    // --------------------
    // RECONOCER
    // --------------------
    function nextReconocer(initial = false) {
      if (!dataState.conjugaciones.length) return;
      current = pickRandomConj();
      const s = $('#conjSentence');
      const input = $('#conjAnswer');

      if (s) s.textContent = current.frase || '';
      if (input) input.value = '';
      if (!initial) {
        scoreState.total += 1;
        updateScore();
      }
    }

    function onCheckReconocer() {
      if (!current) return;
      const input = $('#conjAnswer');
      const ans = norm(input?.value || '');
      const sol = norm(current.solucion || '');

      // Permitimos mayúsculas/minúsculas, pero exigimos el texto del verbo tal cual (sin puntos/comas)
      const ok = ans && ans === sol;

      // Marcador: sumamos intento cuando se comprueba (si aún no se sumó por "next")
      if (scoreState.total === 0) {
        scoreState.total = 1;
      }

      if (ok) {
        scoreState.ok += 1;
        updateScore();
        setFeedback('ok', '✅ <b>¡Correcto!</b>');
      } else {
        setFeedback('bad', `❌ <b>No.</b> La respuesta era: <b>${escapeHTML(current.solucion || '')}</b>`);
      }
    }

    // --------------------
    // PRODUCIR (clasificación en 3 pasos)
    // --------------------
    function nextProducir(initial = false) {
      if (!dataState.conjugaciones.length) return;
      currentP = pickRandomConj();

      // limpiamos selección
      sel.step1 = null;
      sel.step2 = null;
      sel.step3 = null;

      // mostrar forma (solución)
      const line = $('#prodFormLine');
      if (line) line.textContent = `Forma: ${currentP.solucion || ''}`;

      renderProdStep1();
      renderProdStep2();
      renderProdStep3();

      if (!initial) {
        scoreState.total += 1;
        updateScore();
      }
    }

    function renderProdStep1() {
      const box = $('#prodStep1');
      if (!box) return;
      const opts = ['Indicativo', 'Subjuntivo', 'Imperativo'];

      box.innerHTML = opts
        .map((o) => chipHTML(o, sel.step1 === o, `data-step=\"1\" data-val=\"${o}\"`))
        .join('');

      // listeners
      $$('button[data-step=\"1\"]', box).forEach((b) => {
        b.addEventListener('click', () => {
          sel.step1 = b.getAttribute('data-val');
          // Si elige Imperativo, forzamos step2/step3 coherentes
          if (sel.step1 === 'Imperativo') {
            sel.step2 = null;
            sel.step3 = 'Imperativo';
          } else {
            sel.step3 = null; // recalcular según step2
          }
          renderProdStep1();
          renderProdStep2();
          renderProdStep3();
        });
      });
    }

    function renderProdStep2() {
      const box = $('#prodStep2');
      if (!box) return;

      // Si es imperativo, ocultamos paso 2 (no tiene sentido elegir Presente/Pretérito/etc)
      if (sel.step1 === 'Imperativo') {
        box.innerHTML = `<span class=\"hint\">(No aplica en imperativo)</span>`;
        return;
      }

      box.innerHTML = STEP2
        .map((o) => chipHTML(o, sel.step2 === o, `data-step=\"2\" data-val=\"${o}\"`))
        .join('');

      $$('button[data-step=\"2\"]', box).forEach((b) => {
        b.addEventListener('click', () => {
          sel.step2 = b.getAttribute('data-val');
          // al cambiar step2, reiniciamos step3 y lo re-renderizamos
          sel.step3 = null;
          renderProdStep2();
          renderProdStep3();
        });
      });
    }

    function renderProdStep3() {
      const box = $('#prodStep3');
      if (!box) return;

      // Si imperativo:
      if (sel.step1 === 'Imperativo') {
        const only = ['Imperativo'];
        box.innerHTML = only
          .map((o) => chipHTML(o, sel.step3 === o, `data-step=\"3\" data-val=\"${o}\"`))
          .join('');
        $$('button[data-step=\"3\"]', box).forEach((b) => {
          b.addEventListener('click', () => {
            sel.step3 = b.getAttribute('data-val');
            renderProdStep3();
          });
        });
        return;
      }

      // Dependencia: Step 3 depende de Step 2
      if (!sel.step2) {
        box.innerHTML = `<span class=\"hint\">Elige antes el paso 2.</span>`;
        return;
      }

      const opts = STEP3_BY_STEP2[sel.step2] || [];
      box.innerHTML = opts
        .map((o) => chipHTML(o, sel.step3 === o, `data-step=\"3\" data-val=\"${o}\"`))
        .join('');

      $$('button[data-step=\"3\"]', box).forEach((b) => {
        b.addEventListener('click', () => {
          sel.step3 = b.getAttribute('data-val');
          renderProdStep3();
        });
      });
    }

    function onCheckProducir() {
      if (!currentP) return;

      const correctStep1 = String(currentP.modo || '').trim() || null;
      const correctStep2 = parseStep2(currentP.tiempo, correctStep1);
      const correctStep3 = parseStep3(currentP.tiempo, correctStep1);

      // Validación mínima: que haya selección
      if (!sel.step1) {
        setFeedback('bad', '❌ Elige primero el <b>Modo</b> (paso 1).');
        return;
      }
      if (sel.step1 !== 'Imperativo' && !sel.step2) {
        setFeedback('bad', '❌ Elige el <b>paso 2</b> (Presente / Pretérito / Futuro / Condicional).');
        return;
      }
      if (!sel.step3) {
        setFeedback('bad', '❌ Elige el <b>paso 3</b> (tipo exacto).');
        return;
      }

      // Comparación
      const ok1 = sel.step1 === correctStep1;
      const ok2 = (sel.step1 === 'Imperativo') ? true : (sel.step2 === correctStep2);
      const ok3 = sel.step3 === correctStep3;

      const ok = ok1 && ok2 && ok3;

      if (ok) {
        scoreState.ok += 1;
        updateScore();
        setFeedback('ok', '✅ <b>¡Correcto!</b>');
      } else {
        // mensaje explicativo
        const parts = [];
        parts.push(`<b>Modo</b>: ${escapeHTML(correctStep1 || '—')}`);
        if (correctStep1 !== 'Imperativo') parts.push(`<b>Paso 2</b>: ${escapeHTML(correctStep2 || '—')}`);
        parts.push(`<b>Tipo</b>: ${escapeHTML(correctStep3 || '—')}`);
        setFeedback('bad', `❌ <b>No.</b> La clasificación correcta era: ${parts.join(' · ')}`);
      }
    }

    // Pequeño helper HTML para chips
    function chipHTML(label, active, attrs = '') {
      const cls = active ? 'chip active' : 'chip';
      return `<button type=\"button\" class=\"${cls}\" ${attrs}>${escapeHTML(label)}</button>`;
    }

    // export
    return {
      initIfNeeded,
      reset,
      showTab,
    };
  })();

  // ---------------------------
  // b / v
  // ---------------------------
  const BV = (() => {
    let inited = false;
    let idx = 0;
    let current = null;

    function initIfNeeded() {
      if (inited) return;
      inited = true;
      const root = views.bv;
      if (!root) return;

      root.innerHTML = `
        <div class="card">
          <div class="sectionTitle">Uso de b / v</div>
          <div class="sentence" style="margin-top:10px;">Completa la palabra:</div>
          <div class="word" id="bvWord">—</div>

          <div class="choices" style="margin-top:10px;">
            <button class="btn" id="bvB" type="button">b</button>
            <button class="btn" id="bvV" type="button">v</button>
            <button class="btn" id="bvNext" type="button">Siguiente</button>
          </div>
        </div>
      `;

      $('#bvB')?.addEventListener('click', () => answer('b'));
      $('#bvV')?.addEventListener('click', () => answer('v'));
      $('#bvNext')?.addEventListener('click', () => {
        setFeedback(null, '');
        next();
      });
    }

    function reset() {
      idx = 0;
      current = null;
      if (inited) $('#bvWord') && ($('#bvWord').textContent = '—');
    }

    function pick() {
      const list = dataState.bv;
      if (!list?.length) return null;
      idx = (idx + 1) % list.length;
      return list[idx];
    }

    function next() {
      if (!dataState.bv.length) return;
      current = pick();
      const el = $('#bvWord');
      if (el) el.textContent = current?.word ?? '—';
      scoreState.total += 1;
      updateScore();
    }

    function answer(letter) {
      if (!current) return;
      const ok = norm(letter) === norm(current?.correct || '');
      if (ok) {
        scoreState.ok += 1;
        updateScore();
        setFeedback('ok', '✅ <b>¡Correcto!</b>');
      } else {
        setFeedback('bad', `❌ <b>No.</b> Era: <b>${escapeHTML(current.correct || '')}</b>`);
      }
    }

    return { initIfNeeded, reset, next };
  })();

  // ---------------------------
  // Recursos literarios
  // ---------------------------
  const Recursos = (() => {
    let inited = false;

    let mode = 'teoria'; // teoria | practica
    let idxT = 0;
    let idxP = 0;
    let current = null;

    function initIfNeeded() {
      if (inited) return;
      inited = true;

      const root = views.recursos;
      if (!root) return;

      root.innerHTML = `
        <div class="card">
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <div class="sectionTitle" style="margin:0;">Recursos literarios</div>
            <span class="pill" id="recModePill">Teoría</span>
          </div>

          <div class="choices" style="margin-top:12px;">
            <button class="chip" id="recModeTeoria" type="button">Teoría</button>
            <button class="chip" id="recModePractica" type="button">Práctica</button>
          </div>

          <div class="sentence" id="recPrompt" style="margin-top:14px;">—</div>

          <div class="choices" id="recChoices" style="margin-top:12px;"></div>

          <div style="margin-top:14px; display:flex; justify-content:flex-end;">
            <button class="btn" id="recNext" type="button">Siguiente</button>
          </div>
        </div>
      `;

      $('#recModeTeoria')?.addEventListener('click', () => showMode('teoria'));
      $('#recModePractica')?.addEventListener('click', () => showMode('practica'));
      $('#recNext')?.addEventListener('click', () => {
        setFeedback(null, '');
        next();
      });

      renderChoiceButtons();
    }

    function reset() {
      mode = 'teoria';
      idxT = 0;
      idxP = 0;
      current = null;
      if (inited) {
        $('#recModePill') && ($('#recModePill').textContent = 'Teoría');
        $('#recPrompt') && ($('#recPrompt').textContent = '—');
      }
    }

    function showMode(m) {
      mode = m;
      setFeedback(null, '');
      $('#recModePill') && ($('#recModePill').textContent = m === 'teoria' ? 'Teoría' : 'Práctica');

      $('#recModeTeoria')?.classList.toggle('active', m === 'teoria');
      $('#recModePractica')?.classList.toggle('active', m === 'practica');

      next(true);
    }

    function renderChoiceButtons() {
      const box = $('#recChoices');
      if (!box) return;
      const opts = ['Metáfora', 'Símil', 'Personificación', 'Hipérbole'];
      box.innerHTML = opts
        .map((o) => `<button type="button" class="chip" data-rec="${o}">${escapeHTML(o)}</button>`)
        .join('');

      $$('button[data-rec]', box).forEach((b) => {
        b.addEventListener('click', () => {
          const val = b.getAttribute('data-rec');
          check(val);
        });
      });
    }

    function pickTeoria() {
      const defs = dataState.recursos?.teoria;
      if (!defs) return null;
      const keys = Object.keys(defs);
      if (!keys.length) return null;
      idxT = (idxT + 1) % keys.length;
      const k = keys[idxT];
      return { type: k, text: defs[k] };
    }

    function pickPractica() {
      const ex = dataState.recursos?.ejemplos;
      if (!ex?.length) return null;
      idxP = (idxP + 1) % ex.length;
      const item = ex[idxP];
      return { type: item.tipo, text: item.texto };
    }

    function next(initial = false) {
      if (!dataState.recursos) return;

      current = mode === 'teoria' ? pickTeoria() : pickPractica();
      if (!current) return;

      const prompt = $('#recPrompt');
      if (prompt) {
        prompt.textContent =
          mode === 'teoria'
            ? `Definición: ${current.text}`
            : `Ejemplo: ${current.text}`;
      }

      if (!initial) {
        scoreState.total += 1;
        updateScore();
      }
    }

    function check(answer) {
      if (!current) return;
      const ok = norm(answer) === norm(current.type);
      if (ok) {
        scoreState.ok += 1;
        updateScore();
        setFeedback('ok', '✅ <b>¡Correcto!</b>');
      } else {
        setFeedback('bad', `❌ <b>No.</b> Era: <b>${escapeHTML(current.type)}</b>`);
      }
    }

    return { initIfNeeded, reset, showMode, next };
  })();

  // ---------------------------
  // Escapar HTML básico (para feedback)
  // ---------------------------
  function escapeHTML(s) {
    return String(s ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  // ---------------------------
  // Arranque
  // ---------------------------
  async function boot() {
    try {
      // Cargamos JSON (mismos paths que tenías en sw.js)
      const [conj, bv, rec] = await Promise.all([
        loadJSON('./data/conjugaciones.json'),
        loadJSON('./data/bv.json'),
        loadJSON('./data/recursos.json'),
      ]);

      dataState.conjugaciones = Array.isArray(conj) ? conj : [];
      dataState.bv = Array.isArray(bv) ? bv : [];
      dataState.recursos = rec || null;

      // Wire UI
      wireHomeButtons();
      wireFooter();

      // Estado inicial
      showView('home');
      updateScore();
      setModeTitle('');

      // Inicializa módulos “lazy” cuando se entra, pero creamos estructuras si ya están
      // (no es obligatorio aquí)
    } catch (err) {
      console.error(err);
      setFeedback('bad', `❌ Error cargando datos: ${escapeHTML(err.message)}`);
      updateScore();
      showView('home');
    }
  }

  boot();
})();
