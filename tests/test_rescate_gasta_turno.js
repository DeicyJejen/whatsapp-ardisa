// El RESCATE tiene que GASTAR el turno de rotacion (24-ago, senalado por Deicy: "Natalia tiene mas
// solicitudes asignadas"). Medido en la BD: Acabados iba 45 a 36 y los 6 rescates de esa linea cayeron
// TODOS en Natalia. La causa: el paquete del rescate se arma en un simulacro que despues le da REVERSA al
// contador, asi que el asesor quedaba elegido pero su turno seguia sin gastar -> cuando el cron entregaba
// el lead, ese mismo asesor seguia siendo "el siguiente" y se llevaba tambien el proximo cliente en vivo.
// Dos leads por un turno, semana tras semana.
const fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..');
const CEREBRO = fs.readFileSync(path.join(__dirname, 'cerebro.js'), 'utf8');
const W = JSON.parse(fs.readFileSync(path.join(RAIZ, 'workflow-bot-f1.json'), 'utf8'));
const CRON = W.nodes.find(n => n.name === 'Revisar inactivos').parameters.jsCode;
const KEY = 'ARD_BUCARAMANGA_ACABADOS';

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

const IA = { en_alcance:true, marca:'Ardisa', grupo_pista:'ACABADOS',
             productos:['griferia'], confianza:'alta', es_reclamo:false, es_info:false };
const nuevoSD = (wa, ses, rot) => ({ rot: rot || {}, rotDeuda:{}, consent:{}, leads:[], done:{}, sent:{},
  lastKey:{}, fwd:{}, medias:{}, segPend:{}, pendCierre:{}, rescate:{}, ses: { [wa]: ses } });
const sesion = () => ({ paso:'nombre', t:Date.now(), consent:true, marca:'Ardisa', grupo:'ACABADOS',
                        nombre:'', ciudad:'Bucaramanga', detalle:'griferia para bano' });
const msg = (wa) => ({ wa_id:wa, profileName:'27', texto:'...', mtype:'', media_id:'',
                       opcion_id:'', opcion_txt:'', es_media:false, ia: IA });

// Arma el paquete de rescate y lo hace ENTREGAR por el cron (el cliente se fue callado).
function rescatar(wa, sd) {
  cerebro({ datos: msg(wa), sd, pend:{} });                  // el Cerebro deja listo el paquete
  sd.ses[wa].t = Date.now() - 40*60*1000;                    // 40 min callado -> recordatorio
  cron(sd, Date.now());
  if (sd.ses[wa]) sd.ses[wa].recordado = Date.now() - 40*60*1000;   // y otros 40 sin contestar -> se entrega
  cron(sd, Date.now());
  return (sd.done[wa] && sd.done[wa].asesorNom) || '';
}

let ok = 0, total = 0;
const chequear = (n, cond, detalle) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (detalle||''))); };

// ── 1. El paquete guarda QUE turno gasto ──────────────────────────────────────────
{
  const WA = '573000000001';
  const sd = nuevoSD(WA, sesion());
  cerebro({ datos: msg(WA), sd, pend:{} });
  const r = sd.rescate[WA];
  chequear('(previo) el paquete de rescate se armo', !!(r && r.lead), JSON.stringify(r||{}).slice(0,160));
  chequear('El paquete anota la llave y el indice del turno',
           !!(r && r.rot && r.rot.key === KEY && r.rot.idx === 0 && r.rot.num),
           JSON.stringify(r && r.rot));
  chequear('La REVERSA dejo el contador intacto (el simulacro no gasta)', (sd.rot[KEY]||0) === 0,
           'rot=' + JSON.stringify(sd.rot));
}

// ── 2. Al ENTREGARSE el rescate, el turno se cobra ────────────────────────────────
{
  const WA = '573000000002';
  const sd = nuevoSD(WA, sesion());
  const ase = rescatar(WA, sd);
  chequear('El rescate se entrego', !!ase, JSON.stringify(sd.done));
  chequear('El contador AVANZO al entregar el lead', (sd.rot[KEY]||0) === 1,
           'rot=' + JSON.stringify(sd.rot) + ' asesor=' + ase);
}

// ── 3. El siguiente cliente NO cae en el mismo asesor (el bug de Natalia) ─────────
{
  const WA1 = '573000000003', WA2 = '573000000004';
  const sd = nuevoSD(WA1, sesion());
  const ase1 = rescatar(WA1, sd);
  sd.ses[WA2] = sesion();
  cerebro({ datos: msg(WA2), sd, pend:{} });                 // segundo cliente, mismo grupo
  const ase2 = (sd.rescate[WA2] && sd.rescate[WA2].lead && sd.rescate[WA2].lead.asesor) || '';
  chequear('Dos clientes seguidos = DOS asesores distintos', !!ase1 && !!ase2 && ase1 !== ase2,
           '1=' + ase1 + '  2=' + ase2 + '  rot=' + JSON.stringify(sd.rot));
}

// ── 4. Si entre medias paso otro cliente, se cobra como DEUDA (no se pisa el turno) ─
{
  const WA = '573000000005';
  const sd = nuevoSD(WA, sesion());
  cerebro({ datos: msg(WA), sd, pend:{} });
  const num = sd.rescate[WA].rot.num;
  sd.rot[KEY] = 7;                                           // el contador ya se movio (otros cierres en vivo)
  sd.ses[WA].t = Date.now() - 40*60*1000; cron(sd, Date.now());
  if (sd.ses[WA]) sd.ses[WA].recordado = Date.now() - 40*60*1000;
  cron(sd, Date.now());
  chequear('No se pisa el contador de los demas', (sd.rot[KEY]||0) === 7, 'rot=' + JSON.stringify(sd.rot));
  chequear('Se le anota la deuda al asesor rescatado', (sd.rotDeuda[num]||0) === 1,
           'deuda=' + JSON.stringify(sd.rotDeuda) + ' num=' + num);
}

console.log('\n' + ok + '/' + total + ' aserciones OK');
process.exit(ok === total ? 0 : 1);
