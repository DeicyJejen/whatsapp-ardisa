// Prueba del CHAT DE DEICY (3205662947): responde por TEMA, y ya NO le llegan copias de leads.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, staticData, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{type:'tool_use', input: datos.ia}] } : {}) :
      (pend || {}) }) });
  const fn = new Function('$', '$getWorkflowStaticData', '$env', CEREBRO);
  return fn($, () => staticData, new Proxy({}, { get: () => '' }))[0].json;
}
const DEICY = '573205662947';
const sd = () => ({ rot:{}, consent:{}, leads:[], done:{}, ses:{} });
// alr_n = abiertas AHORA (de todas las semanas) · alr_viejas = cuántas de esas vienen de antes del lunes
// alr_sem / alr_ok = detectadas y resueltas ESTA semana (la cuenta que se renueva cada lunes).
const PEND = { alr_n:2, alr_viejas:1, alr_sem:3, alr_ok:5,
               alr_det:'1|Cliente X se perdio~~2|Asesor Y sin reportar',
               rep_hoy:4, rep_hoy_det:'Karime 2 · Yormy 2', rep_pend:11, rep_pend_det:'Karime 8 · Jhon 3' };
// Mismo panel pero SIN nada abierto: no queda ningún error sin resolver (2026-08-15).
const PEND_LIMPIO = Object.assign({}, PEND, { alr_n:0, alr_viejas:0, alr_det:'' });
const msg = (texto) => ({ wa_id:DEICY, profileName:'Deicy', texto, mtype:'', media_id:'',
                          btn_id:'', btn_title:'', es_media:false, ia:null });

const casos = [
  { n:'"informe" -> panel COMPLETO',            t:'informe',                 tiene:['PANEL DEL BOT','Leads de hoy','Sin reportar','Cola interna'] },
  // 2026-08-15: el panel cuenta lo que sigue ABIERTO, no todo lo que alguna vez se detectó. Deicy vio 36
  // "errores" y la mayoría ya estaban corregidos; si el panel no distingue, se aprende a ignorarlo.
  { n:'"y los errores?" -> solo lo SIN RESOLVER', t:'y los errores?',        tiene:['ERRORES SIN RESOLVER: 2','Cliente X se perdio'], noTiene:['Cola interna'] },
  { n:'"que problemas hay" -> solo errores',    t:'que problemas hay',       tiene:['ERRORES SIN RESOLVER'],  noTiene:['Cola interna'] },
  // La semana arranca el lunes (pedido Deicy 15-ago), como el reporte de leads: no es una ventana rodante.
  { n:'La semana se cuenta aparte y dice que se renueva', t:'y los errores?',
    tiene:['Semana en curso: 3 detectado(s) · 5 resuelto(s)','Se renueva el lunes'] },
  // Lo abierto NO se esconde al cambiar de semana: eso era el bug original. Se arrastra y se avisa.
  { n:'Lo que viene de semanas anteriores se dice, no se esconde', t:'y los errores?',
    tiene:['1 vienen de semanas anteriores'] },
  { n:'Todo resuelto -> el panel lo dice, no calla', t:'y los errores?',
    tiene:['Nada pendiente','Semana en curso'], noTiene:['SIN RESOLVER'], pend:PEND_LIMPIO },
  { n:'"cuantos leads hay hoy" -> solo leads',  t:'cuantos leads hay hoy',   tiene:['Leads de hoy: 4','Karime 2'], noTiene:['Cola interna'] },
  { n:'"quien no ha reportado" -> pendientes',  t:'quien no ha reportado',   tiene:['Sin reportar por los asesores: 11'], noTiene:['Cola interna'] },
  { n:'Pregunta rara -> panel completo',        t:'buenas que mas pues',     tiene:['PANEL DEL BOT','Cola interna'] },
  { n:'Siempre ofrece qué preguntar',           t:'informe',                 tiene:['Puedes preguntarme'] },
];

let ok = 0;
for (const c of casos) {
  let cuerpo = '', err = '';
  try { cuerpo = JSON.stringify(correr({ datos:msg(c.t), staticData:sd(), pend:(c.pend || PEND) })); }
  catch (e) { err = e.message; }
  const faltan  = (c.tiene   || []).filter(x => !cuerpo.includes(x));
  const sobran  = (c.noTiene || []).filter(x =>  cuerpo.includes(x));
  const pasa = !err && !faltan.length && !sobran.length;
  if (pasa) ok++;
  console.log((pasa ? '  OK  ' : '  FALLA') + ' | ' + c.n);
  if (!pasa) console.log('         ' + (err || ('falta: ' + faltan.join(', ') + ' | sobra: ' + sobran.join(', '))));
}

// La copia de monitoreo debe estar APAGADA (Deicy: "ya quitalo").
const copiaOff = /const COPIA_MONITOR = ''/.test(CEREBRO);
console.log((copiaOff ? '  OK  ' : '  FALLA') + ' | Copias de leads a Deicy APAGADAS');
if (copiaOff) ok++;

console.log('\n' + ok + '/' + (casos.length + 1) + ' pruebas pasan');
process.exit(ok === casos.length + 1 ? 0 : 1);
