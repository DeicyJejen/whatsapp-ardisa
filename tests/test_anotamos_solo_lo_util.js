// PRUEBA: el "📝 Anotamos" solo repite lo que de verdad pidió el cliente (Deicy, 19-ago, caso David Ávila).
//
// Él escribió "Buen día, como vas?" y el bot le respondió "📝 Anotamos: *Buen día, como vas?*" — como si el
// saludo fuera su solicitud. El filtro de saludos solo reconocía el saludo pelado; en cuanto la persona añade
// la cortesía normal ("¿cómo vas?", "¿qué tal?", "¿todo bien?") dejaba de verse como saludo.
// Y al revés: cuando sí escribe su lista de obra (5 renglones), repetírsela cortada a la mitad se ve peor que
// confirmarle que quedó anotada.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{ type:'tool_use', input: datos.ia }] } : {}) :
      (pend || {}) }) });
  return new Function('$', '$getWorkflowStaticData', '$env', CEREBRO)($, () => sd, new Proxy({}, { get: () => '' }))[0].json;
}
const WA = 'CO.2314348472727294';
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, muro:{}, ses:{},
                      info:{}, cliMsgs:{}, prov:{}, esCli:{}, win:{}, mediaPend:{} });
const ev = (o) => Object.assign({ wa_id:WA, profileName:'David', texto:'', mtype:'', media_id:'',
                                  opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);
const IMPL = (o) => Object.assign({ cfg_consent_impl:'si' }, o);
const body = (r) => (r.wpp_body && (r.wpp_body.text ? r.wpp_body.text.body
                    : (r.wpp_body.interactive && r.wpp_body.interactive.body && r.wpp_body.interactive.body.text))) || '';

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det || ''))); };

// ══ 1. La cortesía NO se anota ═════════════════════════════════════════════════
for (const saludo of ['Buen día, como vas?', 'Hola, ¿cómo estás?', 'Buenas tardes, qué tal', 'todo bien?']) {
  const sd = base();
  const r = correr({ datos: ev({ texto: saludo }), sd, pend: IMPL({ cons_si:0 }) });
  chequear('"' + saludo + '" no se anota como solicitud', !/Anotamos/i.test(body(r)), body(r).slice(0,90));
}

// ══ 2. Lo que SÍ es solicitud se sigue anotando ═══════════════════════════════
{
  const sd = base();
  const r = correr({ datos: ev({ texto:'Buenas, necesito lámina de rehau' }), sd, pend: IMPL({ cons_si:0 }) });
  chequear('Un pedido corto sí se le confirma con sus palabras',
           /Anotamos: \*Buenas, necesito lámina de rehau\*/i.test(body(r)), body(r).slice(0,110));
}

// ══ 3. La lista larga se confirma, pero no se repite cortada ══════════════════
{
  const sd = base();
  const lista = '* 1 galón de pintucoat gris\n* 2 laminas galvanizadas 2*1 cal 30\n* 1 brocha 2"\n'
              + '* 1 rodillo epoxixco de 4"\n* 50 remaches pop con la broca, de los pequeños';
  const r = correr({ datos: ev({ texto: lista }), sd, pend: IMPL({ cons_si:0 }) });
  chequear('Se le confirma que quedó anotado', /Anotamos lo que necesitas/i.test(body(r)), body(r).slice(0,90));
  chequear('Y NO se le devuelve el pedido cortado a la mitad', !/pintucoat/i.test(body(r)), body(r).slice(0,120));
  chequear('Pero el texto completo sí queda para el asesor',
           /remaches pop/i.test(JSON.stringify(sd.ses[WA] || {})), JSON.stringify(sd.ses[WA] || {}).slice(0,140));
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
