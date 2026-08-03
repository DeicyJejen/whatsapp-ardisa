// Prueba dirigida: la CARRERA del consentimiento (caso Rusbel, 30-jul, 120 bultos de cemento).
// Reproduce el escenario exacto: el cliente autoriza, y 5 segundos después escribe su pedido.
// La 2a ejecucion arranca con staticData VIEJO (la carrera se lo comio) -> antes le re-pedia la autorizacion.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, staticData, pend }) {
    const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content: [{ type: 'tool_use', input: datos.ia }] } : {}) :
      (pend || {}) }) });
  const $getWorkflowStaticData = () => staticData;
  const $env = new Proxy({}, { get: () => '' });
  const fn = new Function('$', '$getWorkflowStaticData', '$env', CEREBRO);
  return fn($, $getWorkflowStaticData, $env)[0].json;
}

const WA = '573108549035';                      // Rusbel
const base = {
  wa_id: WA, profileName: 'Rusbel.', texto: 'Tienes. 120 bultos. De. Cemento',
  mtype: '', media_id: '', btn_id: '', btn_title: '', es_media: false,
  ia: { en_alcance: true, marca: 'Ardisa', grupo_pista: 'CONSTRUCCION',
        productos: ['cemento'], confianza: 'alta', es_reclamo: false, es_info: false }
};
// staticData tal como quedo tras la CARRERA: la sesion sigue en 'consent' y store.consent esta VACIO.
const staticPisado = () => ({ rot: {}, consent: {}, leads: [], done: {}, ses: { [WA]: { paso: 'consent', t: Date.now() } } });

const casos = [
  // Espera 'nombre', no 'marca': desde el fix del 3-ago-b la sesion se corrige ANTES de repartir, y como la IA
  // ya sabe que "120 bultos de cemento" es Ardisa, el bot se salta el menu de marca y le pide el nombre.
  // Lo que NUNCA puede salir es 'consent' (volverle a pedir la autorizacion que acaba de dar).
  { n: '1. Carrera: autorizo hace 5s (la BD lo sabe, la memoria NO)', pend: { cons_si: 1 }, espera: 'nombre' },
  { n: '2. Carrera + memoria intacta (cinturon y tirantes)',          pend: { cons_si: 1 }, mem: true, espera: 'nombre' },
  { n: '3. NO autorizo nunca -> el muro DEBE seguir apareciendo',     pend: { cons_si: 0 }, espera: 'consent' },
  { n: '4. La BD se cayo (sin dato) -> no se regala consentimiento',  pend: {},             espera: 'consent' },
  { n: '5. La BD devolvio error -> tampoco se regala',                pend: { error: 'ECONNREFUSED' }, espera: 'consent' },
];

let ok = 0;
for (const c of casos) {
  const sd = staticPisado();
  if (c.mem) sd.consent[WA] = Date.now();
  let r, etapa;
  try { r = correr({ datos: base, staticData: sd, pend: c.pend }); etapa = r.etapa; }
  catch (e) { etapa = 'EXCEPCION: ' + e.message; }
  const pasa = etapa === c.espera;
  if (pasa) ok++;
  console.log((pasa ? '  OK  ' : '  FALLA') + ' | ' + c.n);
  console.log('         esperado=' + c.espera + '  obtenido=' + etapa);
}
console.log('\n' + ok + '/' + casos.length + ' pruebas pasan');
process.exit(ok === casos.length ? 0 : 1);
