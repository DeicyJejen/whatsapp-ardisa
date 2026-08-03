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

const casos = [
  { n:'1. EMPLEO en el muro -> canal de Servicio al Cliente',      d:msg('Me llamo Maicol y quisiera trabajar con ustedes', IA_EMPLEO), espera:'info' },
  { n:'2. HOJA DE VIDA en el muro -> Servicio al Cliente',         d:msg('Para enviar una hoja de vida, donde se puede', IA_EMPLEO),   espera:'info' },
  { n:'3. QUEJA en el muro -> Servicio al Cliente',                d:msg('No me han contactado, llevo 3 dias esperando', IA_QUEJA),    espera:'reclamo' },
  { n:'4. CLIENTE REAL en el muro -> el muro SIGUE (no se cuela)', d:msg('Tienen cemento gris de 50 kilos?', IA_COMPRA),               espera:'consent' },
  { n:'5. Saludo suelto en el muro -> el muro SIGUE',              d:msg('Buenas tardes', SIN_IA),                                     espera:'consent' },
  { n:'6. SIN IA + palabras de empleo -> el muro SIGUE (prudente)',d:msg('quiero dejar mi hoja de vida', SIN_IA),                      espera:'consent' },
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
