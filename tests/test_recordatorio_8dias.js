// Prueba de la regla de Deicy (3-ago): al asesor se le recuerda un lead sin reportar SOLO 8 dias calendario.
// Pasados los 8 dias no vuelve a aparecer en el recordatorio NUNCA (el lead sigue en la BD y en el Excel).
// Se prueba el nodo del CRON ('Revisar inactivos'), no el Cerebro.
const fs = require('fs'), path = require('path');
const W = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'workflow-bot-f1.json'), 'utf8'));
const CRON = W.nodes.find(n => n.name === 'Revisar inactivos').parameters.jsCode;

const DIA = 86400000;
// Un lunes a las 10am de Colombia (dia habil, dentro de 8am-5pm) para que el cron SI mande recordatorios.
const LUNES_10AM = Date.parse('2026-08-03T15:00:00Z');   // 10:00 en Colombia (UTC-5)

function correrCron(staticData, ahora) {
  const real = Date.now; Date.now = () => ahora;
  try {
    const fn = new Function('$getWorkflowStaticData', '$env', CRON);
    return fn(() => staticData, new Proxy({}, { get: () => '' })) || [];
  } finally { Date.now = real; }
}

// staticData con UN lead pendiente de reportar, creado hace `dias` dias.
function conLead(dias, follow) {
  return { rot:{}, consent:{}, leads:[], done:{}, ses:{}, segRemDay:{}, wOpen:{},
           segPend: { 'TK1': { telefono:'573001112233', cliente:'Cliente Prueba', asesor:'Karime Vannesa',
                               asesor_num:'573182988592', t: LUNES_10AM - dias*DIA, follow: !!follow } } };
}
// ¿el cron produjo un recordatorio de seguimiento para ese asesor?
function huboRecordatorio(out) {
  return JSON.stringify(out).includes('573182988592') && JSON.stringify(out).includes('Cliente Prueba');
}

const casos = [
  { n:'Lead de hace 1 dia   -> SI se le recuerda',            dias:1,  espera:true  },
  { n:'Lead de hace 5 dias  -> SI se le recuerda',            dias:5,  espera:true  },
  { n:'Lead de hace 8 dias  -> SI (ultimo dia de la ventana)',dias:8,  espera:true  },
  { n:'Lead de hace 9 dias  -> NO, se acabo la insistencia',  dias:9,  espera:false },
  { n:'Lead de hace 18 dias -> NO (el caso de Karime/Jhon)',  dias:18, espera:false },
  { n:'"En seguimiento" de 12 dias -> SI (margen mayor)',     dias:12, follow:true, espera:true  },
  { n:'"En seguimiento" de 16 dias -> NO',                    dias:16, follow:true, espera:false },
];

let ok = 0;
for (const c of casos) {
  let hubo, err = '';
  try { hubo = huboRecordatorio(correrCron(conLead(c.dias, c.follow), LUNES_10AM)); }
  catch (e) { err = e.message; hubo = null; }
  const pasa = !err && hubo === c.espera;
  if (pasa) ok++;
  console.log((pasa ? '  OK  ' : '  FALLA') + ' | ' + c.n);
  if (!pasa) console.log('         ' + (err || ('esperado=' + c.espera + ' obtenido=' + hubo)));
}
console.log('\n' + ok + '/' + casos.length + ' pruebas pasan');
process.exit(ok === casos.length ? 0 : 1);
