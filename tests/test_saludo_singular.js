// Caso real Fundación Mujer y Futuro (573105765181), lead #221 del 04/08 15:30 — DESPUES del arreglo
// de las 13:13, o sea un hueco que quedo abierto:
//   15:25:59  "Hola buena tarde"     <- 'tarde' en SINGULAR no estaba en la lista de saludos
//   15:26:05  ✅ Sí, autorizo         -> "Ya tenemos tu mensaje y lo sumamos a tu solicitud"
//   ...                               -> y por eso NUNCA le pregunto que necesitaba
//   15:30:55  cierre                  -> lead a Yormy con detalle = "Hola buena tarde"
// La asesora recibio un lead sin UNA SOLA PALABRA de que quiere el cliente.
//
// Leccion: al arreglar "buenos dias" mire el caso que tenia delante y no la lista completa.
// Este test recorre la MATRIZ de saludos (singular y plural) para que no vuelva a pasar.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{type:'tool_use', input: datos.ia}] } : {}) :
      (pend || {}) }) });
  return new Function('$','$getWorkflowStaticData','$env', CEREBRO)($, () => sd, new Proxy({},{get:()=>''}))[0].json;
}
const WA = '573105765181';
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, muro:{}, ses:{} });
const ev = (o) => Object.assign({ wa_id:WA, profileName:'Fundación Mujer y Futuro', texto:'', mtype:'',
                                  media_id:'', opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);
const cuerpo = (r) => JSON.stringify(r.wpp_body || '');

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det||''))); };

// ══ MATRIZ COMPLETA: ninguno puede ocupar la ranura de la solicitud ═════════════
const SALUDOS = ['hola','holi','holis','buenas','buenos','buen día','buen dia','buenos días',
  'buenas tardes','buena tarde','buenas noches','buena noche','hola buenas','hola buenas tardes',
  'hola buena tarde','hola buenos días','muy buenas tardes','cordial saludo','cordial saludos',
  'feliz día','feliz tarde','qué hubo','que hubo','buenas señor','buenas señora','hey','hi','hello'];
let fallos = [];
for (const s of SALUDOS) {
  const sd = base();
  correr({ datos: ev({ texto:s }), sd, pend:{ cons_si:0 } });
  if ((sd.ses[WA]||{}).pendTexto) fallos.push(s);
}
chequear('Los ' + SALUDOS.length + ' saludos (singular Y plural) NO tapan la solicitud',
         fallos.length === 0, 'se colaron: ' + JSON.stringify(fallos));

// ══ NEGATIVOS: un saludo CON pedido sigue siendo un pedido ══════════════════════
const PEDIDOS = ['buenas necesito cemento','buen día tienen cerámica','hola quiero cotizar',
                 'buenas tardes precio de la formica','buenas tardes necesito una cotización'];
let perdidos = [];
for (const s of PEDIDOS) {
  const sd = base();
  correr({ datos: ev({ texto:s }), sd, pend:{ cons_si:0 } });
  if (!(sd.ses[WA]||{}).pendTexto) perdidos.push(s);
}
chequear('Un saludo CON pedido sigue guardándose como pedido', perdidos.length === 0,
         'se perdieron: ' + JSON.stringify(perdidos));

// ══ EL CASO DE LA FUNDACIÓN, TAL CUAL PASÓ ═════════════════════════════════════
{
  const sd = base();
  correr({ datos: ev({ texto:'Hola buena tarde' }), sd, pend:{ cons_si:0 } });
  chequear('"Hola buena tarde" no se toma por solicitud', !(sd.ses[WA]||{}).pendTexto,
           'pendTexto=' + JSON.stringify((sd.ses[WA]||{}).pendTexto));

  const r = correr({ datos: ev({ opcion_id:'CONSENT_SI', opcion_txt:'✅ Sí, autorizo' }), sd, pend:{ cons_si:0 } });
  chequear('Y el bot NO le dice que ya tiene su mensaje',
           !/Ya tenemos tu mensaje/i.test(cuerpo(r)), cuerpo(r).slice(0,150));

  // Sigue el recorrido real: Ardisa -> nombre -> ciudad -> Ferretero -> Construcción
  correr({ datos: ev({ opcion_id:'MAR_ARD', opcion_txt:'🟢 Ardisa' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'Fundación Mujer y Futuro' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'Bucaramanga' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ opcion_id:'OAR_FERRE', opcion_txt:'🛠️ Ferretero' }), sd, pend:{ cons_si:1 } });
  const rf = correr({ datos: ev({ opcion_id:'GRP_CONS', opcion_txt:'🧱 Construcción' }), sd, pend:{ cons_si:1 } });

  const lead = (sd.pendCierre[WA] || {}).lead || rf.lead;
  chequear('NO se cierra el lead con el saludo como solicitud', !lead,
           'lead.detalle=' + JSON.stringify(lead && lead.detalle));
  chequear('Le pregunta QUÉ necesita antes de pasarlo',
           /qué (producto|necesitas)/i.test(cuerpo(rf)), 'etapa=' + rf.etapa + ' ' + cuerpo(rf).slice(0,160));
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
