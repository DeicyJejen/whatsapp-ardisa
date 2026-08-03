// RESCATE del cliente que ya dijo que necesita (decision Deicy 3-ago).
// Caso real: Oscar Tovar dio "cotizacion C-1-295 de una grasa para la enchapadora" y se fue en la 5a pregunta.
// Se prueban las DOS mitades: el Cerebro ARMA el paquete, y el cron lo ENTREGA en vez de despedirlo.
const fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..');
const CEREBRO = fs.readFileSync(path.join(__dirname, 'cerebro.js'), 'utf8');
const W = JSON.parse(fs.readFileSync(path.join(RAIZ, 'workflow-bot-f1.json'), 'utf8'));
const CRON = W.nodes.find(n => n.name === 'Revisar inactivos').parameters.jsCode;

function cerebro({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{type:'tool_use', input: datos.ia}] } : {}) :
      (pend || {}) }) });
  return new Function('$','$getWorkflowStaticData','$env', CEREBRO)($, () => sd, new Proxy({},{get:()=>''}))[0].json;
}
function cron(sd, ahora) {
  const real = Date.now; Date.now = () => ahora;
  try { return new Function('$getWorkflowStaticData','$env', CRON)(() => sd, new Proxy({},{get:()=>''})) || []; }
  finally { Date.now = real; }
}

const WA = '573115556587';                                  // Oscar Tovar
const LUNES_10AM = Date.parse('2026-08-03T15:00:00Z');      // 10:00 Colombia, dia habil, en horario
const IA_OK = { en_alcance:true, marca:'Ardisa', grupo_pista:'ACABADOS', productos:['grasa para enchapadora'],
                confianza:'alta', es_reclamo:false, es_info:false };

// Sesion a MEDIAS: ya eligio linea, dio nombre y ciudad y dijo que necesita. Le falta el perfil (ahi se fue).
function sesionAMedias(extra) {
  // Momento REAL en que se pierden: acaba de elegir la LINEA, el bot le pide el nombre y ahi se va.
  // Su solicitud ya la habia escrito antes (vive en pendTexto). Asi murieron YenyR, overmoaquera y JEFFRSON.
  // Su solicitud la escribio ANTES de autorizar -> vive en pendTexto, no en detalle. Por eso el bot le
  // seguia preguntando y por eso se perdio. La sesion debe estar FRESCA (Date.now()): con una hora vieja
  // el bot la descarta por caducidad y se prueba otra cosa.
  return Object.assign({ paso:'nombre', t:Date.now(), consent:true, marca:'Ardisa', nombre:'Óscar Tovar',
                         ciudad:'Bogotá', ciudadId:'OTRA',
                         detalle:'', pendTexto:'Tengo la cotización C-1-295 de una grasa para la enchapadora' }, extra||{});
}
const nuevoSD = (ses) => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                            segPend:{}, pendCierre:{}, rescate:{}, ses: ses ? { [WA]: ses } : {} });
const msg = (texto, ia) => ({ wa_id:WA, profileName:'Óscar Tovar', texto, mtype:'', media_id:'',
                              opcion_id:'', opcion_txt:'', es_media:false, ia: ia===undefined ? IA_OK : ia });

let ok = 0, total = 0;
const chequear = (n, cond, detalle) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (detalle||''))); };

// ── 1. El Cerebro ARMA el paquete sin crear el lead ni ensuciar la memoria ──────────
{
  const sd = nuevoSD(sesionAMedias());
  const antes = JSON.stringify({rot:sd.rot, done:sd.done, leads:sd.leads, pendCierre:sd.pendCierre, segPend:sd.segPend});
  const r = cerebro({ datos: msg('Óscar Tovar', null), sd, pend:{} });
  const resc = sd.rescate[WA];
  chequear('Arma el paquete de rescate', !!(resc && resc.lead), 'no se armó: ' + JSON.stringify(Object.keys(sd.rescate)));
  chequear('El paquete trae asesor de la LÍNEA correcta', !!(resc && resc.lead && resc.lead.asesor && resc.lead.marca === 'Ardisa'),
           resc ? JSON.stringify(resc.lead) : 'sin paquete');
  chequear('NO creó el lead todavía', !r.lead && !r.pend_cierre, 'lead=' + JSON.stringify(r.lead));
  const despues = JSON.stringify({rot:sd.rot, done:sd.done, leads:sd.leads, pendCierre:sd.pendCierre, segPend:sd.segPend});
  chequear('El simulacro NO dejó rastro en la memoria', antes === despues, 'antes=' + antes + '\n         despues=' + despues);
  chequear('La sesión del cliente sigue intacta', sd.ses[WA] && sd.ses[WA].paso !== 'cerrado', JSON.stringify(sd.ses[WA]));
}

// ── 2. Sin LÍNEA no se arma (condicion de Deicy: hay que saber a quien pasarlo) ─────
{
  const sd = nuevoSD(sesionAMedias({ marca:'' }));
  cerebro({ datos: msg('algo mas'), sd, pend:{} });
  chequear('SIN línea NO se arma rescate', !sd.rescate[WA], JSON.stringify(sd.rescate[WA]||{}));
}

// ── 3. Sin decir que necesita, tampoco ──────────────────────────────────────────────
{
  const sd = nuevoSD(sesionAMedias({ detalle:'', pendTexto:'', notas:'' }));
  cerebro({ datos: msg('Óscar Tovar', null), sd, pend:{} });
  chequear('SIN solicitud NO se arma rescate', !sd.rescate[WA], JSON.stringify(sd.rescate[WA]||{}));
}

// ── 4. El cron ENTREGA el lead en vez de despedirlo ────────────────────────────────
{
  const sd = nuevoSD(sesionAMedias());
  cerebro({ datos: msg('Óscar Tovar', null), sd, pend:{} });      // arma
  sd.ses[WA].recordado = Date.now() - 40*60*1000;                   // ya se le recordo hace rato
  sd.ses[WA].t         = Date.now() - 60*60*1000;
  const out = cron(sd, Date.now());
  const txt = JSON.stringify(out);
  chequear('El cron entrega el lead (no lo despide)', /cierre_rescate/.test(txt) && !/cierre_inactividad/.test(txt), txt.slice(0,300));
  chequear('Le dice al cliente quién lo va a contactar', /pasamos tu solicitud/.test(txt), txt.slice(0,300));
  chequear('Queda el cierre listo para entregar', !!(sd.pendCierre[WA] && sd.pendCierre[WA].lead), JSON.stringify(Object.keys(sd.pendCierre)));
  chequear('Queda registrado el lead y el candado', sd.leads.length === 1 && !!sd.done[WA], 'leads=' + sd.leads.length);
  chequear('Se pide seguimiento al asesor', !!Object.keys(sd.segPend).length, JSON.stringify(sd.segPend));
  chequear('El rescate se consume una sola vez', !sd.rescate[WA], JSON.stringify(sd.rescate[WA]||{}));
}

// ── 5. Si el cliente YA tiene lead reciente, NO se duplica ─────────────────────────
{
  const sd = nuevoSD(sesionAMedias());
  cerebro({ datos: msg('Óscar Tovar', null), sd, pend:{} });
  sd.done[WA] = { t: Date.now() - 60000, asesorNom:'Otro' };        // ya cerro hace 1 min
  sd.ses[WA].recordado = Date.now() - 40*60*1000;
  sd.ses[WA].t         = Date.now() - 60*60*1000;
  const out = cron(sd, Date.now());
  // Con lead reciente el cron ni siquiera le habla (regla previa: no molestar a quien ya fue atendido).
  chequear('Con lead reciente NO duplica ni molesta', sd.leads.length === 0 && !/cierre_/.test(JSON.stringify(out)),
           'leads=' + sd.leads.length + ' out=' + JSON.stringify(out).slice(0,200));
}

// ── 6. Si el cliente TERMINA normal, el rescate se descarta ────────────────────────
{
  const sd = nuevoSD(sesionAMedias());
  cerebro({ datos: msg('Óscar Tovar', null), sd, pend:{} });
  chequear('(previo) el rescate estaba armado', !!sd.rescate[WA]);
  sd.ses[WA].paso = 'cerrado'; sd.ses[WA].closedAt = Date.now();
  cerebro({ datos: msg('gracias', null), sd, pend:{} });
  chequear('Al cerrar normal se descarta el rescate', !sd.rescate[WA], JSON.stringify(sd.rescate[WA]||{}));
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
