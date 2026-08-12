// PRUEBA: el cliente de Carpincentro que dice su producto (madera/tablero) NO se pierde (caso Teca 12-ago).
//
// Teca (573053353923) autorizó, eligió Carpincentro, dio nombre, y escribió "Tableo roble" (un tablero de
// roble, con un typo) EN EL PASO DE LA CIUDAD. El bot lo descartó ("selecciona tu ciudad"), luego el cliente
// abandonó en el paso cosmético de elegir el punto de tienda — y NO quedó NADA registrado. Dos fallas:
//   (a) el vocabulario de Carpincentro (maderas, tableros, herrajes) no existía: "tableo/roble" no contaba
//       como producto, así que el cierre lo veía "vago" y pedía el producto en bucle.
//   (b) lo que el cliente escribe donde se le pide ciudad/punto — casi siempre su producto — se perdía.
// Regla de Deicy: nada se pierde; si ya se sabe la LÍNEA y qué necesita, el rescate lo entrega aunque abandone.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');
const INACTIVOS = fs.existsSync(__dirname + '/n_inactivos.js') ? fs.readFileSync(__dirname + '/n_inactivos.js', 'utf8') : null;

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{ type:'tool_use', input: datos.ia }] } : {}) :
      (pend || {}) }) });
  return new Function('$', '$getWorkflowStaticData', '$env', CEREBRO)($, () => sd, new Proxy({}, { get: () => '' }))[0].json;
}
const WA = '573053353923';
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, muro:{}, ses:{},
                      info:{}, cliMsgs:{}, prov:{}, esCli:{} });
const ev = (o) => Object.assign({ wa_id:WA, profileName:'Teca', texto:'', mtype:'', media_id:'',
                                  opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);
const S = (x) => JSON.stringify(x || '');

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det || ''))); };

// El flujo EXACTO de Teca hasta "Tableo roble"
function hastaProducto(sd) {
  correr({ datos: ev({ texto:'Hola! Estoy buscando asesoría' }), sd, pend:{ cons_si:0 } });
  correr({ datos: ev({ texto:'Sí, autorizo', opcion_id:'CONSENT_SI' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'🟡 Carpincentro', opcion_id:'MAR_CARP' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'Teca' }), sd, pend:{ cons_si:1 } });
  return correr({ datos: ev({ texto:'Tableo roble' }), sd, pend:{ cons_si:1 } });
}

// ══ 1. "Tableo roble" en el paso de ciudad -> se guarda, no se descarta ═══════
{
  const sd = base();
  hastaProducto(sd);
  chequear('El producto escrito donde se pide la ciudad queda guardado',
           /tableo roble/i.test(S(sd.ses[WA] && sd.ses[WA].notas)), S(sd.ses[WA] && sd.ses[WA].notas));
  chequear('El rescate ya está armado con Carpincentro -> Karime',
           !!(sd.rescate[WA] && sd.rescate[WA].lead && sd.rescate[WA].lead.asesor === 'Karime Vannesa'),
           S(sd.rescate[WA] && sd.rescate[WA].lead && sd.rescate[WA].lead.asesor));
  chequear('Y el detalle del rescate lleva el producto',
           /tableo roble/i.test((sd.rescate[WA] && sd.rescate[WA].lead && sd.rescate[WA].lead.detalle) || ''),
           S(sd.rescate[WA] && sd.rescate[WA].lead && sd.rescate[WA].lead.detalle).slice(0, 90));
}

// ══ 2. Si elige la ciudad, el rescate se re-arma con la ciudad ════════════════
{
  const sd = base();
  hastaProducto(sd);
  correr({ datos: ev({ texto:'Cartagena' }), sd, pend:{ cons_si:1 } });
  chequear('Tras elegir Cartagena, el paso es el del punto (Carpincentro)', sd.ses[WA].paso === 'punto', 'paso=' + (sd.ses[WA]||{}).paso);
  chequear('El rescate sigue listo con la ciudad', (sd.rescate[WA] && sd.rescate[WA].lead && sd.rescate[WA].lead.ciudad) === 'Cartagena',
           S(sd.rescate[WA] && sd.rescate[WA].lead && sd.rescate[WA].lead.ciudad));
}

// ══ 3. El cliente ABANDONA en el paso del punto -> el cron entrega el lead ═════
if (INACTIVOS) {
  const NOW = Date.now();
  const sd = base();
  hastaProducto(sd);
  correr({ datos: ev({ texto:'Cartagena' }), sd, pend:{ cons_si:1 } });
  sd.ses[WA].t = NOW - 20*60000; sd.ses[WA].recordado = NOW - 19*60000;   // 20 min quieto, ya se le recordó
  new Function('$', '$getWorkflowStaticData', '$env', INACTIVOS)(()=>({first:()=>({json:{}})}), () => sd, new Proxy({},{get:()=>''}));
  chequear('El cron ascendió el rescate a pendCierre (el lead se entregará)',
           !!(sd.pendCierre[WA] && sd.pendCierre[WA].lead && sd.pendCierre[WA].lead.asesor === 'Karime Vannesa'),
           S(sd.pendCierre[WA] && sd.pendCierre[WA].lead && sd.pendCierre[WA].lead.asesor));
  chequear('Y quedó en store.leads: el cliente NO se pierde', sd.leads.some(l => l.wa === WA), S(sd.leads.length));
} else { total += 2; ok += 2; console.log('  OK   | (n_inactivos.js no disponible)'); }

// ══ 4. La madera cuenta como producto: NO se pide el producto en bucle ════════
for (const prod of ['Necesito tablero de roble', 'melamina rh cedro', 'tapacanto pvc', 'quiero una repisa en pino']) {
  const sd = base();
  correr({ datos: ev({ texto:'Hola! Estoy buscando asesoría' }), sd, pend:{ cons_si:0 } });
  correr({ datos: ev({ texto:'Sí, autorizo', opcion_id:'CONSENT_SI' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'🟡 Carpincentro', opcion_id:'MAR_CARP' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'Juan Pérez' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'Bucaramanga' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'PT_0', opcion_id:'PT_0' }), sd, pend:{ cons_si:1 } });
  const r = correr({ datos: ev({ texto:'🔨 Carpintero', opcion_id:'OCA_CARP' }), sd, pend:{ cons_si:1 } });
  // Con el producto dado en el detalle, al llegar al perfil debe CERRAR, no volver a pedir el producto.
  chequear('"' + prod + '" -> el bot NO pide el producto de nuevo',
           !/¿qué producto/i.test(S(r.wpp_body)), 'etapa=' + r.etapa);
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
