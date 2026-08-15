// Caso REAL del 14-ago — Emma Sierra, wa_id CO.1615986879863099 (clienta con el número OCULTO).
//
//  13/08 13:11  "Buen día. Costo de la malla geotextil"  -> el bot no le respondió (todavía no se
//                                                           soportaban los BSUID; se arregló ese día)
//  14/08 10:50  (rescate a mano)                         -> el saludo normal, pidiéndole producto y ciudad
//  14/08 14:17  (nota de voz)                            -> ❌ "por este medio solo atendemos a nuestros
//                                                           clientes": la trataron de PROVEEDORA.
//
// POR QUÉ: el filtro de proveedores decidía "extranjero" con `!wa.startsWith('57')`, y un cliente con
// número oculto llega como 'CO.1615986879863099'. Al no haber texto (una nota de voz no lo tiene) tampoco
// había señal de cliente, así que el filtro se disparaba. Le pasó a 3 de los 13 clientes con número oculto
// el primer día que se soportaron — dos se recuperaron (leads #293 y #298), Emma se perdió.
//
// El prefijo del BSUID ES el país, y así lo lee ya vigilante_reglas.py: 'CO.' = Colombia. Esta prueba fija
// las dos mitades: el colombiano oculto entra como CLIENTE, y el extranjero oculto sigue filtrado.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{type:'tool_use', input: datos.ia}] } : {}) :
      (pend || {}) }) });
  return new Function('$','$getWorkflowStaticData','$env', CEREBRO)($, () => sd, new Proxy({},{get:()=>''}))[0].json;
}
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, prov:{}, esCli:{}, ses:{} });
const msg = (wa, t, o) => Object.assign({ wa_id:wa, profileName:'Emma Sierra', texto:t, mtype:'', media_id:'',
                            opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o || {});
const cuerpo = (r) => JSON.stringify(r.wpp_body || '');
const ES_PROVEEDOR = (r) => r.etapa === 'proveedor' || r.etapa === 'proveedor_silencio'
                            || /solo atendemos a nuestros clientes/i.test(cuerpo(r));

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det||''))); };

const EMMA  = 'CO.1615986879863099';   // clienta colombiana con número oculto
const CHINA = 'CN.8613586300781';      // proveedor chino que TAMBIÉN oculta su número
const IN    = 'IN.9198765432100';      // el spam de "Laconic ceramic" (India), pero oculto

// ══ 1) El caso de Emma: nota de voz, sin una palabra escrita ═══════════════════
{
  const r = correr({ datos: msg(EMMA, '', { es_media:true, mtype:'audio', media_id:'777' }),
                     sd: base(), pend:{} });
  chequear('Nota de voz de una clienta con número oculto -> NO es proveedora',
           !ES_PROVEEDOR(r), 'etapa=' + r.etapa + ' ' + cuerpo(r).slice(0,140));
}

// ══ 2) Su primer mensaje real, el que nunca se contestó ════════════════════════
{
  const r = correr({ datos: msg(EMMA, 'Buen día. Costo de la malla geotextil'), sd: base(), pend:{} });
  chequear('"Costo de la malla geotextil" -> se atiende como clienta',
           !ES_PROVEEDOR(r), 'etapa=' + r.etapa + ' ' + cuerpo(r).slice(0,140));
}

// ══ 3) Un saludo pelado tampoco la echa (no hay señal de cliente NI de proveedor) ══
{
  const r = correr({ datos: msg(EMMA, 'Buenas tardes'), sd: base(), pend:{} });
  chequear('Un saludo a secas desde un número oculto colombiano -> tampoco la echa',
           !ES_PROVEEDOR(r), 'etapa=' + r.etapa + ' ' + cuerpo(r).slice(0,140));
}

// ══ 4) La otra mitad: ocultar el número NO desarma el filtro de proveedores ═════
{
  const r = correr({ datos: msg(CHINA, 'Hello, we are a leading manufacturer of SPC flooring'),
                     sd: base(), pend:{} });
  chequear('Proveedor chino con número oculto -> SIGUE filtrado',
           ES_PROVEEDOR(r), 'etapa=' + r.etapa + ' ' + cuerpo(r).slice(0,140));
}
{
  // Ocultar el número no puede CAMBIAR la clasificación: 'IN.9198...' tiene que caer igual que el
  // '9198...' de siempre. (Un saludo pelado salta el filtro para todo el mundo desde el 29-jul — es
  // una decisión aparte y anterior; aquí solo se fija que esconder el número no la altere.)
  const oculto = correr({ datos: msg(IN,    'Hi'), sd: base(), pend:{} });
  const visible= correr({ datos: msg('9198765432100', 'Hi'), sd: base(), pend:{} });
  chequear('Extranjero: ocultar el número no cambia cómo lo clasifica el bot',
           oculto.etapa === visible.etapa,
           'oculto=' + oculto.etapa + ' visible=' + visible.etapa);
}

// ══ 6) Los errores b/v no pueden costar una cotización (prueba de Deicy, 15-ago 13:46) ═══════════
// Escribió "quiero cotizar *barilla*" y el bot ni intentó cotizar: la lista de productos dice "varilla".
// La confusión b/v es EL error de escritura más común del español; se unifican las dos letras en el texto
// y en el patrón, así que no hay que listar variantes una por una.
{
  const CEREBRO_SRC = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');
  const m = CEREBRO_SRC.match(/const RE_PRODCONC = (\/.*?\/i);/);
  const RE = eval(m[1]);
  const _bv = s => String(s || '').toLowerCase().replace(/[bv]/g, 'v');
  const RE_BV = new RegExp(RE.source.replace(/[bv]/g, 'v'), 'i');
  const detecta = s => RE.test(String(s || '')) || RE_BV.test(_bv(s));
  const casos = [['quiero cotizar barilla', true], ['quiero cotizar varilla', true],
                 ['necesito valdosa para el baño', true], ['necesito baldosa', true],
                 ['vloque de arcilla', true], ['hola necesito asesoria', false],
                 ['buenos dias', false]];
  let bien = 0;
  for (const [t, esp] of casos) if (detecta(t) === esp) bien++;
  chequear('b/v: "barilla"≡"varilla" y "valdosa"≡"baldosa", sin confundir un saludo con un producto',
           bien === casos.length,
           casos.filter(([t, e]) => detecta(t) !== e).map(([t]) => t).join(' | '));
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
