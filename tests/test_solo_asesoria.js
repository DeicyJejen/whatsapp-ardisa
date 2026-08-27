// "Solo escribio asesoria" — caso real lead #352 (21-ago, senalado por Deicy).
// La clienta entro por el anuncio con el texto prellenado "Hola! Estoy buscando asesoria", eligio Ardisa,
// no alcanzo a dar el nombre y se fue. A los 30 min el rescate la entrego a Natalia con ESE texto como
// solicitud, sin ciudad y sin nombre: "lo envio al asesor y ni siquiera supo de donde es".
// Dos mitades: (1) el ULTIMO mensaje antes de cerrar le pide lo que falta; (2) si aun asi no contesta, el
// lead sale igual —no se pierde— pero la tarjeta dice exactamente que tiene que preguntarle el asesor.
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

const WA = '573142055780';
// La IA ve la marca pero NO ve producto: "asesoria" no es un producto (por eso _GEN_IA lo descarta).
const IA_VAGA = { en_alcance:true, marca:'Ardisa', grupo_pista:'ACABADOS', productos:[],
                  confianza:'media', es_reclamo:false, es_info:false };
const nuevoSD = (ses) => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                            segPend:{}, pendCierre:{}, rescate:{}, ses: ses ? { [WA]: ses } : {} });
const msg = (texto, ia) => ({ wa_id:WA, profileName:'27', texto, mtype:'', media_id:'',
                              opcion_id:'', opcion_txt:'', es_media:false, ia: ia===undefined ? IA_VAGA : ia });

// La sesion tal como quedo en el caso real: eligio la linea, el bot le pidio el nombre, ahi se fue.
// Sin nombre (el de perfil era "27", que no es un nombre valido) y sin ciudad.
function sesionDelCaso(extra) {
  return Object.assign({ paso:'nombre', t:Date.now(), consent:true, marca:'Ardisa',
                         nombre:'', ciudad:'', detalle:'Hola! Estoy buscando asesoría' }, extra||{});
}

let ok = 0, total = 0;
const chequear = (n, cond, detalle) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (detalle||''))); };

// ── 1. El recordatorio PIDE la informacion que falta, no un "¿continuamos?" ────────
{
  const sd = nuevoSD(sesionDelCaso());
  cerebro({ datos: msg('...'), sd, pend:{} });                       // arma el paquete de rescate
  chequear('(previo) el paquete de rescate se armo', !!(sd.rescate[WA] && sd.rescate[WA].lead));
  chequear('El paquete sabe QUE le falta', !!(sd.rescate[WA] && sd.rescate[WA].falta && sd.rescate[WA].falta.prod),
           JSON.stringify(sd.rescate[WA] && sd.rescate[WA].falta));
  sd.ses[WA].t = Date.now() - 15*60*1000;                            // 15 min callado -> toca recordatorio
  const out = cron(sd, Date.now());
  const rec = out.map(o=>o.json).find(o => o.chat && o.chat.etapa === 'recordatorio');
  const cuerpo = rec ? rec.msg.text.body : '';
  chequear('Sale el recordatorio', !!rec, JSON.stringify(out).slice(0,200));
  chequear('Le pregunta QUE PRODUCTO necesita', /qué producto necesitas/i.test(cuerpo), cuerpo);
  chequear('Le pregunta EN QUE CIUDAD esta', /en qué ciudad estás/i.test(cuerpo), cuerpo);
  chequear('Le pregunta el NOMBRE', /nombre y apellido/i.test(cuerpo), cuerpo);
  chequear('Ya no es el "¿continuamos?" mudo', !/¿Continuamos con tu solicitud\?/.test(cuerpo), cuerpo);
}

// ── 2. Si aun asi no contesta: el lead SALE (no se pierde) pero diciendo que falta ──
{
  const sd = nuevoSD(sesionDelCaso());
  cerebro({ datos: msg('...'), sd, pend:{} });
  sd.ses[WA].recordado = Date.now() - 40*60*1000;
  sd.ses[WA].t         = Date.now() - 60*60*1000;
  // 2026-08-27: este cliente tampoco dijo su ciudad, así que ahora el cron le hace una última pregunta
  // (solo la ciudad) antes de entregar el lead. Si sigue callado 20 minutos, sale igual — que es lo que
  // esta prueba defiende. Se simula ese silencio corriendo el cron otra vez con la pregunta ya vencida.
  const outPreg = cron(sd, Date.now());
  chequear('Antes de entregarlo, se le pregunta la ciudad UNA vez',
           /ciudad_ultima/.test(JSON.stringify(outPreg)) && !!sd.ses[WA].ciudadUlt,
           JSON.stringify(outPreg).slice(0,200));
  sd.ses[WA].ciudadUlt = Date.now() - 21*60*1000;                    // 21 min callado tras la pregunta
  const out = cron(sd, Date.now());
  chequear('El lead NO se pierde: se entrega igual', /cierre_rescate/.test(JSON.stringify(out)) && !!sd.pendCierre[WA],
           JSON.stringify(out).slice(0,200));
  const lead = sd.pendCierre[WA].lead || {};
  const tarjeta = JSON.stringify(sd.pendCierre[WA].aviso || {});
  chequear('La TARJETA del asesor dice que confirme el producto', /Por confirmar al contactar/.test(tarjeta) && /qué producto/.test(tarjeta),
           tarjeta.slice(0,400));
  chequear('La tarjeta dice que confirme la ciudad', /en qué ciudad/.test(tarjeta), tarjeta.slice(0,400));
  chequear('El lead de la BD tambien lo lleva', /Por confirmar al contactar/.test(lead.detalle||''), lead.detalle||'(vacio)');
  chequear('La solicitud original NO se borra', /asesor[ií]a/i.test(lead.detalle||''), lead.detalle||'(vacio)');
  chequear('La nota NO culpa al bot', !/(bot|no lo registr|no reconoc|fall|error)/i.test(lead.detalle||''), lead.detalle||'');
  chequear('Sigue teniendo asesor asignado', !!lead.asesor, JSON.stringify(lead));
}

// ── 3. Un lead COMPLETO no lleva la nota (no se le mete ruido al asesor) ───────────
{
  const IA_OK = { en_alcance:true, marca:'Ardisa', grupo_pista:'ACABADOS', productos:['cemento gris'],
                  confianza:'alta', es_reclamo:false, es_info:false };
  const sd = nuevoSD(sesionDelCaso({ nombre:'Sol Marín', ciudad:'Bucaramanga', ciudadId:'BUC',
                                     detalle:'Necesito 20 bultos de cemento gris' }));
  cerebro({ datos: msg('...', IA_OK), sd, pend:{} });
  sd.ses[WA].recordado = Date.now() - 40*60*1000;
  sd.ses[WA].t         = Date.now() - 60*60*1000;
  cron(sd, Date.now());
  const lead = (sd.pendCierre[WA] && sd.pendCierre[WA].lead) || {};
  chequear('Lead completo: SIN nota de "por confirmar"', !/Por confirmar/.test(lead.detalle||''), lead.detalle||'(vacio)');
}

// ══ "COMUNICAME CON UN ASESOR" NO DICE QUÉ NECESITA (25-ago-2026, lead #378) ═══════════════════
// El Club del Comercio de Bucaramanga respondió eso a "¿qué necesitas?" y el lead salió a Miguel Ángel con
// ESE texto como detalle: el asesor empieza de cero y el cliente repite todo. Pedir un asesor es legítimo y
// no se le niega —el mensaje se lo confirma—, pero primero se le pregunta UNA vez qué producto necesita.
{
  const pedir = (texto) => {
    // el caso real: ya dio nombre, ciudad y perfil, y está en el paso donde se le pide el producto
    const sd = nuevoSD(sesionDelCaso({ paso:'detalle', nombre:'Club Del Comercio', ciudad:'Bucaramanga',
                                       ciudadId:'BUC', ocupacion:'🛠️ Ferretero', grupo:'ACABADOS',
                                       interes:'Acabados', detalle:'' }));
    const r = cerebro({ datos: msg(texto, null), sd, pend:{} });
    return { hayLead: !!(sd.pendCierre[WA] || (r.lead && r.lead.nombre)),
             pregunta: /qu[eé] producto/i.test(JSON.stringify(r.wpp_body || '')) };
  };
  for (const t of ['Comunicame con un asesor', 'Necesito un asesor',
                   'Quiero hablar con alguien', 'que me llamen por favor']) {
    const x = pedir(t);
    chequear('"' + t + '" -> se le pregunta el producto, no se cierra a medias',
             !x.hayLead && x.pregunta, 'lead=' + x.hayLead + ' pregunta=' + x.pregunta);
  }
  // Y con producto en el mismo mensaje NO se le interroga: se cierra como siempre.
  const conProd = pedir('Comunicame con un asesor para cotizar cemento gris');
  chequear('Si además dice el producto, se cierra normal (no se le pregunta de más)',
           conProd.hayLead, 'lead=' + conProd.hayLead);
  // Y al cliente MOLESTO no se le interroga: se le pasa el asesor de una (caso Edilberto, 19-ago).
  const bravo = pedir('Usted es una puta máquina. Necesito una persona.');
  chequear('Al cliente molesto se le pasa el asesor de una, sin preguntarle nada',
           bravo.hayLead && !bravo.pregunta, 'lead=' + bravo.hayLead + ' pregunta=' + bravo.pregunta);
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
