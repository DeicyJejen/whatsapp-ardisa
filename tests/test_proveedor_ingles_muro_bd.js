// PRUEBA: los dos huecos confirmados por la auditoría del 12-ago.
//
// (1) PROVEEDOR EN INGLÉS (caso real 8615755982800, 12-ago 00:25): "We are glad to introduce our newly
//     launched 9mm rigid core SPC hybrid flooring..." — todas las redes del filtro eran de vocabulario
//     ESPAÑOL; la IA lo marcó es_info:true, _pareceCliente se encendió, y la FOTO que mandó 8s después
//     (la visión de la IA ve "pisos SPC" = en alcance, claro) recibió el muro de autorización de datos.
//
// (2) MURO DOBLE (6 clientes desde el 4-ago, p.ej. Paola 11-ago 10:52:08/10:52:12): el freno de 45s en
//     store.muro era INALCANZABLE — si la 1ª ejecución guardó store.muro también guardó la sesión y el 2º
//     mensaje ni pasa por la rama de sesión nueva; si se solapan, no ve nada. Ahora PEND.muro_45s (tabla
//     mensajes, la BD manda) le dice al 2º mensaje que el muro ya salió.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  // OJO: los nodos se llaman así de verdad ('Extraer datos' y '🤖 IA Anthropic', con forma Anthropic).
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{ type:'tool_use', input: datos.ia }] } : {}) :
      (pend || {}) }) });
  return new Function('$', '$getWorkflowStaticData', '$env', CEREBRO)($, () => sd, new Proxy({}, { get: () => '' }))[0].json;
}

const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, muro:{}, ses:{},
                      info:{}, cliMsgs:{}, prov:{}, esCli:{} });
const ev = (wa, o) => Object.assign({ wa_id:wa, profileName:'', texto:'', mtype:'', media_id:'',
                                      opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);
const S = (x) => JSON.stringify(x || '');

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det || ''))); };

// ══ 1. El pitch REAL en inglés cae al carril de proveedores ═══════════════════
const PITCH = 'Hope you’re doing well! We are glad to introduce our newly launched 9mm rigid core SPC hybrid flooring with 20mil wear layer, best price and good quality for your market.';
{
  const sd = base();
  // La IA lo ve como es_info (así salió en la ejecución real 100165)
  const r = correr({ datos: ev('8615755982800', { texto: PITCH, ia:{ en_alcance:false, es_info:true, confianza:'media', productos:[], acuse:'' } }), sd, pend:{ cons_si:0 } });
  chequear('El pitch en inglés recibe el mensaje de PROVEEDOR (no muro, no flujo)',
           r.etapa === 'proveedor' && /solo atendemos a nuestros clientes/i.test(S(r.wpp_body)),
           'etapa=' + r.etapa + ' ' + S(r.wpp_body).slice(0, 140));
  chequear('Y NO queda marcado como cliente', !sd.esCli['8615755982800'], S(sd.esCli));

  // ── 2. La FOTO del catálogo 8s después NO recibe el muro (la visión la ve "en alcance") ──
  const r2 = correr({ datos: ev('8615755982800', { es_media:true, mtype:'image', media_id:'MEDIA1',
    ia:{ en_alcance:true, confianza:'alta', productos:['piso spc'], grupo_pista:'ACABADOS', acuse:'' } }), sd, pend:{ cons_si:0 } });
  chequear('La foto del proveedor marcado NO recibe el muro de autorización',
           !/autorizaci[oó]n|politica-de-datos/i.test(S(r2.wpp_body)),
           'etapa=' + r2.etapa + ' ' + S(r2.wpp_body).slice(0, 140));
  chequear('Ni arranca el flujo de clientes', ['proveedor','proveedor_silencio'].indexOf(r2.etapa) >= 0, 'etapa=' + r2.etapa);
}

// ══ 3. El CLIENTE que escribe en inglés NO cae al carril de proveedores ═══════
{
  const sd = base();
  const r = correr({ datos: ev('14155552671', { texto: 'Hello! Do you sell MDF boards? I need a quote for 20 units for a project in Bucaramanga' } ), sd, pend:{ cons_si:0 } });
  chequear('El cliente en inglés ("do you sell...?") NO es tratado como proveedor',
           r.etapa !== 'proveedor' && r.etapa !== 'proveedor_silencio', 'etapa=' + r.etapa);
}

// ══ 4. La clienta de la ficha técnica (Yolanda, es_info legítimo) sigue a salvo ═
{
  const sd = base();
  const r = correr({ datos: ev('639199574917', { texto: 'Buenos días. Tengo una Esquina Mágica Spar instalada en mi cocina. Podrían enviarme la ficha técnica del producto?',
    ia:{ en_alcance:false, es_info:true, confianza:'alta', productos:[], acuse:'' } }), sd, pend:{ cons_si:0 } });
  chequear('La clienta que pide ficha técnica NO recibe el mensaje de proveedor',
           r.etapa !== 'proveedor' && r.etapa !== 'proveedor_silencio', 'etapa=' + r.etapa);
}

// ══ 5. MURO DOBLE: la BD le avisa al 2º mensaje que el muro ya salió ═══════════
{
  const sd = base();   // sesión NUEVA y staticData VACÍO: exactamente el caso de la carrera
  const r = correr({ datos: ev('573001112233', { texto: 'Hola! Estoy buscando asesoría' }), sd, pend:{ cons_si:0, muro_45s:1 } });
  chequear('Con muro en la BD hace <45s: empujón suave, NO el muro completo',
           !/politica-de-datos-personales/.test(S(r.wpp_body)) && /S[ií], autorizo/.test(S(r.wpp_body)),
           S(r.wpp_body).slice(0, 180));
}
{
  const sd = base();
  const r = correr({ datos: ev('573001112233', { texto: 'Hola! Estoy buscando asesoría' }), sd, pend:{ cons_si:0, muro_45s:0 } });
  chequear('Sin muro previo: el muro completo sale normal (primera vez)',
           /politica-de-datos-personales/.test(S(r.wpp_body)), S(r.wpp_body).slice(0, 160));
}
{
  // La FOTO a sesión nueva con muro ya enviado tampoco lo repite (rama del muro de foto)
  const sd = base();
  const r = correr({ datos: ev('573001112233', { es_media:true, mtype:'image', media_id:'M2',
    ia:{ en_alcance:true, confianza:'alta', productos:['ceramica'], grupo_pista:'ACABADOS', acuse:'' } }), sd, pend:{ cons_si:0, muro_45s:1 } });
  chequear('La foto con muro reciente en BD recibe acuse suave, no el muro otra vez',
           !/politica-de-datos-personales/.test(S(r.wpp_body)), S(r.wpp_body).slice(0, 160));
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
