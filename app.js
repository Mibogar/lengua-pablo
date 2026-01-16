// Lengua — Pablo (front-end only)

// --- Utilities ---
function $(sel){ return document.querySelector(sel); }
function $all(sel){ return Array.from(document.querySelectorAll(sel)); }

function normalizeAnswer(s){
  // Case-insensitive + trim + collapse spaces + remove accents
  if (s == null) return '';
  return s
    .toString()
    .trim()
    .replace(/\s+/g,' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu,'');
}

function choice(arr){
  return arr[Math.floor(Math.random()*arr.length)];
}

function setView(id){
  $all('.view').forEach(v=>v.classList.remove('active'));
  $(id).classList.add('active');
}

function flash(msg, ok){
  const el = $('#feedback');
  el.textContent = msg;
  el.className = ok ? 'feedback ok' : 'feedback bad';
  el.style.display = 'block';
}

function clearFeedback(){
  const el = $('#feedback');
  el.textContent = '';
  el.className = 'feedback';
  el.style.display = 'none';
}

// --- Data loading ---
let DATA = {
  conjugaciones: [],
  bv: [],
  recursos: []
};

async function loadData(){
  const [c,b,r] = await Promise.all([
    fetch('data/conjugaciones.json').then(x=>x.json()),
    fetch('data/bv.json').then(x=>x.json()),
    fetch('data/recursos.json').then(x=>x.json())
  ]);
  DATA.conjugaciones = c;
  DATA.bv = b;
  DATA.recursos = r;
}

// --- App state ---
let state = {
  mode: null,
  conj: {
    item: null,
    stage: 'verb', // 'verb' | 'classify'
    classificationsAnswered: {},
    score: 0,
    total: 0,
  },
  bv: {
    item: null,
    score: 0,
    total: 0,
  },
  recursos: {
    submode: 'teoria', // teoria|practica
    item: null,
    score: 0,
    total: 0
  }
};

// --- Navigation ---
function goHome(){
  state.mode = null;
  setView('#home');
  $('#modeTitle').textContent = '';
  clearFeedback();
}

function setHeader(title){
  $('#modeTitle').textContent = title;
}

function renderAppReady(){
  // Start at home
  setView('#home');
  setHeader('');
  clearFeedback();
}

// --- Conjugaciones ---
const CONJ_FIELDS = [
  { key: 'Persona', label: 'Persona', options: ['primera','segunda','tercera'] },
  { key: 'Número', label: 'Número', options: ['singular','plural'] },
  { key: 'Tiempo', label: 'Tiempo', options: [] },
  { key: 'Modo', label: 'Modo', options: ['indicativo','subjuntivo','imperativo'] },
  { key: 'Conjugación', label: 'Conjugación', options: ['-ar','-er','-ir'] },
  { key: 'Aspecto', label: 'Aspecto', options: ['simple','compuesto'] },
  { key: 'Voz', label: 'Voz', options: ['activa','pasiva'] },
  { key: 'Regular/Irregular', label: 'Regular/irregular', options: ['regular','irregular'] }
];

function uniqueTimes(){
  const s = new Set(DATA.conjugaciones.map(x=>String(x.Tiempo||'').toLowerCase()).filter(Boolean));
  return Array.from(s).sort((a,b)=>a.localeCompare(b,'es'));
}

function startConjugaciones(){
  state.mode = 'conj';
  setHeader('Conjugaciones verbales');
  setView('#conjugaciones');
  $('#conjInput').value = '';
  $('#conjInput').focus();
  $('#conjClassify').innerHTML = '';
  $('#conjClassify').style.display = 'none';
  $('#conjVerbArea').style.display = 'block';
  clearFeedback();

  // Ensure Tiempo options are filled dynamically
  const tiempos = uniqueTimes();
  const tiempoField = CONJ_FIELDS.find(f=>f.key==='Tiempo');
  tiempoField.options = tiempos.length ? tiempos : ['presente'];

  nextConjItem();
}

function nextConjItem(){
  state.conj.item = choice(DATA.conjugaciones);
  state.conj.stage = 'verb';
  state.conj.classificationsAnswered = {};
  $('#conjSentence').textContent = state.conj.item.Frase || '';
  $('#conjHint').textContent = 'Escribe el verbo tal como aparece en la frase.';
  $('#conjInput').value = '';
  $('#conjInput').focus();
  $('#conjClassify').innerHTML = '';
  $('#conjClassify').style.display = 'none';
  $('#conjVerbArea').style.display = 'block';
  clearFeedback();
}

function checkConjVerb(){
  const item = state.conj.item;
  const user = normalizeAnswer($('#conjInput').value);
  const correctRaw = item.Forma_verbal || '';
  const correct = normalizeAnswer(correctRaw);

  state.conj.total += 1;

  if (!user){
    flash('Escribe algo antes de comprobar.', false);
    return;
  }

  if (user === correct){
    state.conj.score += 1;
    flash('¡Correcto! Ahora clasifícalo con los botones.', true);
    showConjClassify();
  } else {
    flash(`No. La forma correcta era: “${correctRaw}”.`, false);
  }

  updateScore();
}

function showConjClassify(){
  const item = state.conj.item;
  state.conj.stage = 'classify';
  $('#conjVerbArea').style.display = 'none';
  const wrap = $('#conjClassify');
  wrap.innerHTML = '';
  wrap.style.display = 'block';

  for (const field of CONJ_FIELDS){
    const section = document.createElement('div');
    section.className = 'question';

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = field.label;

    const group = document.createElement('div');
    group.className = 'choices';

    const correctValue = String(item[field.key] || '').toLowerCase();

    field.options.forEach(opt=>{
      const b = document.createElement('button');
      b.className = 'chip';
      b.type = 'button';
      b.textContent = opt;
      b.addEventListener('click', ()=>{
        // only first attempt counts
        if (state.conj.classificationsAnswered[field.key]) return;
        state.conj.classificationsAnswered[field.key] = true;

        const picked = String(opt).toLowerCase();
        const ok = picked === correctValue;
        b.classList.add(ok ? 'ok' : 'bad');

        // lock all buttons in this group
        group.querySelectorAll('button').forEach(x=>x.disabled = true);

        if (!ok){
          // highlight the correct one
          group.querySelectorAll('button').forEach(x=>{
            if (String(x.textContent).toLowerCase() === correctValue){
              x.classList.add('ok');
            }
          });
        }
      });
      group.appendChild(b);
    });

    section.appendChild(label);
    section.appendChild(group);
    wrap.appendChild(section);
  }
}

// --- b/v ---
function startBV(){
  state.mode = 'bv';
  setHeader('Ortografía: b / v');
  setView('#bv');
  clearFeedback();
  nextBVItem();
}

function nextBVItem(){
  state.bv.item = choice(DATA.bv);
  $('#bvWord').textContent = state.bv.item.Con_hueco;
  $('#bvReveal').textContent = '';
  $('#bvButtons').querySelectorAll('button').forEach(b=>b.disabled=false);
}

function answerBV(letter){
  const item = state.bv.item;
  state.bv.total += 1;
  const ok = letter === item.Letra;
  if (ok){ state.bv.score += 1; flash('¡Bien!', true); }
  else { flash('No. Revisa la palabra.', false); }
  $('#bvReveal').textContent = `Correcta: ${item.Palabra_correcta}`;
  $('#bvButtons').querySelectorAll('button').forEach(b=>b.disabled=true);
  updateScore();
}

// --- Recursos ---
const RESOURCE_TYPES = ['metáfora','símil','personificación','hipérbole'];

function startRecursos(){
  state.mode = 'recursos';
  setHeader('Recursos literarios');
  setView('#recursos');
  clearFeedback();
  state.recursos.submode = 'teoria';
  $('#recMode').textContent = 'Teoría';
  nextRecursoItem();
}

function setRecSubmode(m){
  state.recursos.submode = m;
  $('#recMode').textContent = (m === 'teoria') ? 'Teoría' : 'Práctica';
  nextRecursoItem();
}

function nextRecursoItem(){
  clearFeedback();
  const m = state.recursos.submode;
  const pool = DATA.recursos.filter(x=>String(x.Modo||'').toLowerCase() === (m==='teoria'?'teoría':'práctica'));
  state.recursos.item = choice(pool);
  $('#recPrompt').textContent = state.recursos.item.Enunciado;
  $('#recButtons').querySelectorAll('button').forEach(b=>b.disabled=false);
}

function answerRecurso(tipo){
  const item = state.recursos.item;
  state.recursos.total += 1;
  const ok = normalizeAnswer(tipo) === normalizeAnswer(item.Respuesta);
  if (ok){ state.recursos.score += 1; flash('¡Correcto!', true); }
  else { flash(`No. Era: ${item.Respuesta}.`, false); }
  $('#recButtons').querySelectorAll('button').forEach(b=>b.disabled=true);
  updateScore();
}

// --- Scoreboard ---
// --- Persistence (local) ---
const LS_KEY = 'lengua_pablo_score_v1';

function saveScore(){
  try{
    localStorage.setItem(LS_KEY, JSON.stringify({
      conj:{score: state.conj.score, total: state.conj.total},
      bv:{score: state.bv.score, total: state.bv.total},
      recursos:{score: state.recursos.score, total: state.recursos.total}
    }));
  }catch(e){ /* ignore */ }
}

function loadScore(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return;
    const s = JSON.parse(raw);
    if(s?.conj){ state.conj.score = s.conj.score||0; state.conj.total = s.conj.total||0; }
    if(s?.bv){ state.bv.score = s.bv.score||0; state.bv.total = s.bv.total||0; }
    if(s?.recursos){ state.recursos.score = s.recursos.score||0; state.recursos.total = s.recursos.total||0; }
  }catch(e){ /* ignore */ }
}

function updateScore(){
  const total = state.conj.total + state.bv.total + state.recursos.total;
  const score = state.conj.score + state.bv.score + state.recursos.score;
  $('#score').textContent = `Aciertos: ${score} / ${total}`;
  saveScore();
}


function resetScore(){
  state.conj.score=0; state.conj.total=0;
  state.bv.score=0; state.bv.total=0;
  state.recursos.score=0; state.recursos.total=0;
  saveScore();
  updateScore();
  flash('Marcador reiniciado.', true);
}

// --- Init ---
async function init(){
  renderAppReady();

  // wire buttons
  $('#homeConj').addEventListener('click', startConjugaciones);
  $('#homeBV').addEventListener('click', startBV);
  $('#homeRec').addEventListener('click', startRecursos);
  $all('[data-home]').forEach(b=>b.addEventListener('click', goHome));

  $('#btn-home').addEventListener('click', goHome);
  $('#btn-reset').addEventListener('click', resetScore);

  $('#conjCheck').addEventListener('click', checkConjVerb);
  $('#conjNext').addEventListener('click', nextConjItem);
  $('#conjInput').addEventListener('keydown', (e)=>{
    if (e.key === 'Enter') checkConjVerb();
  });

  $('#bvB').addEventListener('click', ()=>answerBV('b'));
  $('#bvV').addEventListener('click', ()=>answerBV('v'));
  $('#bvNext').addEventListener('click', nextBVItem);

  $('#recTheory').addEventListener('click', ()=>setRecSubmode('teoria'));
  $('#recPractice').addEventListener('click', ()=>setRecSubmode('practica'));
  $all('[data-recurso]').forEach(b=>{
    b.addEventListener('click', ()=>answerRecurso(b.getAttribute('data-recurso')));
  });
  $('#recNext').addEventListener('click', nextRecursoItem);

  // load data
  await loadData();
  loadScore();
  updateScore();

  // register SW
  if ('serviceWorker' in navigator){
    try{
      await navigator.serviceWorker.register('sw.js');
    }catch(e){
      // ignore
    }
  }
}

init();
