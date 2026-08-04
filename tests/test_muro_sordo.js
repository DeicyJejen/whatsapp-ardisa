// Prueba: el MURO DEL CONSENTIMIENTO ya no deja sordo al bot (caso MaicolD, 2-ago).
// Antes: estando en 'consent', ni un reclamo ni una consulta administrativa se reconocían.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

// El Cerebro NO lee la IA de los datos: la lee del nodo '🤖 IA Anthropic' con la forma de Anthropic
// (content -> bloque type:'tool_use' -> input). El arnes debe imitar ESA forma o la IA llega como null.
function correr({ datos, staticData, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content: [{ type: 'tool_use', input: datos.ia }] } : {}) :
      (pend || {}) }) });
  const fn = new Function('$', '$getWorkflowStaticData', '$env', CEREBRO);
  return fn($, () => staticData, new Proxy({}, { get: () => '' }))[0].json;
}
const WA = '573124078070';
const enMuro = () => ({ rot:{}, consent:{}, leads:[], done:{}, ses:{ [WA]:{ paso:'consent', t:Date.now() } } });
const msg = (texto, ia) => ({ wa_id:WA, profileName:'MaicolD', texto, mtype:'', media_id:'',
                              btn_id:'', btn_title:'', es_media:false, ia });

const IA_EMPLEO  = { en_alcance:false, es_info:true,  es_reclamo:false, marca:'', grupo_pista:'', productos:[], confianza:'alta' };
const IA_QUEJA   = { en_alcance:false, es_info:false, es_reclamo:true,  marca:'', grupo_pista:'', productos:[], confianza:'alta' };
const IA_COMPRA  = { en_alcance:true,  es_info:false, es_reclamo:false, marca:'Ardisa', grupo_pista:'CONSTRUCCION', productos:['cemento'], confianza:'alta' };
const SIN_IA     = null;

// CAMBIO 2026-08-04 (decision Deicy: "el que busca trabajo, dile que esto es canal comercial y pasale el
// correo de ayuda"). Los casos 1, 2 y 6 esperaban la conducta VIEJA:
//   - 1 y 2 caian en 'info' (mensaje generico de Servicio al Cliente). Ahora tienen su propia etapa 'empleo'
//     con un texto hecho para un aspirante: no le hablamos de "cotizaciones" ni de "facturacion".
//   - 6 esperaba que SIN IA el muro siguiera, porque KW_INFO era ancha y se equivocaba. KW_EMPLEO es estrecha
//     a proposito (ver build_f1.py) y se probo contra 8 frases de clientes reales sin un solo falso positivo,
//     asi que ya NO necesita que la IA la respalde: si Anthropic se cae, el aspirante igual sale bien atendido.
// La expectativa vieja quedo obsoleta por decision de producto, no porque el codigo empeorara.
const casos = [
  { n:'1. EMPLEO en el muro -> respuesta propia de empleo',        d:msg('Me llamo Maicol y quisiera trabajar con ustedes', IA_EMPLEO), espera:'empleo' },
  { n:'2. HOJA DE VIDA en el muro -> respuesta propia de empleo',  d:msg('Para enviar una hoja de vida, donde se puede', IA_EMPLEO),   espera:'empleo' },
  { n:'3. QUEJA en el muro -> Servicio al Cliente',                d:msg('No me han contactado, llevo 3 dias esperando', IA_QUEJA),    espera:'reclamo' },
  { n:'4. CLIENTE REAL en el muro -> el muro SIGUE (no se cuela)', d:msg('Tienen cemento gris de 50 kilos?', IA_COMPRA),               espera:'consent' },
  { n:'5. Saludo suelto en el muro -> el muro SIGUE',              d:msg('Buenas tardes', SIN_IA),                                     espera:'consent' },
  { n:'6. SIN IA + hoja de vida -> igual lo atiende (regex estrecha)', d:msg('quiero dejar mi hoja de vida', SIN_IA),                  espera:'empleo' },
  { n:'7. SIN IA + "trabajo de carpinteria" -> es CLIENTE, muro',  d:msg('Necesito un trabajo de carpinteria', SIN_IA),                espera:'consent' },
];

let ok = 0;
for (const c of casos) {
  let etapa;
  try { etapa = correr({ datos:c.d, staticData:enMuro(), pend:{} }).etapa; }
  catch (e) { etapa = 'EXCEPCION: ' + e.message; }
  const pasa = etapa === c.espera; if (pasa) ok++;
  console.log((pasa ? '  OK  ' : '  FALLA') + ' | ' + c.n + '\n         esperado=' + c.espera + '  obtenido=' + etapa);
}
console.log('\n' + ok + '/' + casos.length + ' pruebas pasan');
process.exit(ok === casos.length ? 0 : 1);
