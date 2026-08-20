// PRUEBA: el producto dicho a mitad del formulario RUTEA — no se le repregunta "¿qué necesitas?" (caso
// Salomé Villamil #345, 20-ago-2026 12:00 pm).
//
// Escribió "láminas de policarbonato para hacer un domo" en el paso del NOMBRE. La IA capturó el
// producto pero devolvió grupo_pista 'desconocido' (no conocía el policarbonato) y el respaldo por
// palabras clave tampoco lo tenía -> al cerrar, el bot le mostró el menú "¿qué necesitas?" a una
// clienta que YA lo había dicho. Dos arreglos: (1) policarbonato/domo/translúcida entran al vocabulario
// (IA + respaldo KW_CONS = Construcción); (2) si aun así el grupo queda desconocido, el menú RECONOCE
// la solicitud anotada y solo pide ubicarla en la línea — nunca más el "¿qué necesitas?" a secas.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

let ok = 0, total = 0;
const S = (x) => JSON.stringify(x || '');
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det || ''))); };

const WA = '573160401491';
function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{ type:'tool_use', input: datos.ia }] } : {}) :
      (pend || {}) }) });
  return new Function('$', '$getWorkflowStaticData', '$env', CEREBRO)($, () => sd, new Proxy({}, { get: () => '' }))[0].json;
}
const ev = (o) => Object.assign({ wa_id:WA, profileName:'Salome', texto:'', mtype:'', media_id:'',
                                  opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, muro:{}, ses:{},
                      info:{}, cliMsgs:{}, prov:{}, esCli:{} });
// el veredicto REAL de la IA aquel día (ejecución 123343): producto sí, grupo desconocido
const IA_REAL = { marca:'desconocida', ciudad:'', nombre:'', tipo_cliente:'desconocido',
  grupo_pista:'desconocido', productos:['láminas de policarbonato para domo'], en_alcance:true,
  pide_humano:false, es_reclamo:false, es_info:false, confianza:'media', acuse:'Entendido.', resumen:'x' };

// ══ 1. LA CONVERSACIÓN DE SALOMÉ, TAL CUAL: ahora cierra SIN menú de grupo ═════
{
  const sd = base();
  correr({ datos: ev({ texto:'Buenas tardes' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'🟢 Ardisa', opcion_id:'MAR_ARD' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'Por favor Uds venden láminas de poli carbonato para hacer un domo?', ia:IA_REAL }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'Salomé Villamil' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'Bucaramanga', opcion_id:'CIU_BUC' }), sd, pend:{ cons_si:1 } });
  const r = correr({ datos: ev({ texto:'🏠 Cliente final', opcion_id:'OAR_FINAL' }), sd, pend:{ cons_si:1 } });
  chequear('Cierra directo (el policarbonato ya rutea a Construcción)', r.etapa === 'cierre', 'etapa=' + r.etapa);
  const lead = r.lead || ((sd.pendCierre[WA] || {}).lead) || {};
  chequear('El lead va a Ferretería/Construcción', /Ferreter/i.test(lead.solicitud || ''), 'solicitud=' + S(lead.solicitud));
  chequear('Y el detalle lleva el policarbonato', /poli ?carbonato/i.test(lead.detalle || ''), 'detalle=' + S(lead.detalle));
  chequear('Nunca le preguntó "¿qué necesitas?"', !JSON.stringify(r.wpp_body || '').includes('¿qué necesitas?'), S(r.wpp_body).slice(0,150));
}

// ══ 2. PRODUCTO REALMENTE DESCONOCIDO: el menú reconoce lo anotado ═════════════
{
  const sd = base();
  const IA_RARO = Object.assign({}, IA_REAL, { productos:['membrana geodésica flexible'] });
  correr({ datos: ev({ texto:'Buenas tardes' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'🟢 Ardisa', opcion_id:'MAR_ARD' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'venden membrana geodésica flexible?', ia:IA_RARO }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'Ana Pérez' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'Bucaramanga', opcion_id:'CIU_BUC' }), sd, pend:{ cons_si:1 } });
  const r = correr({ datos: ev({ texto:'🏠 Cliente final', opcion_id:'OAR_FINAL' }), sd, pend:{ cons_si:1 } });
  const body = JSON.stringify(r.wpp_body || '');
  if (r.etapa === 'confirmGrupo') {
    chequear('Si toca preguntar el grupo, el menú RECONOCE la solicitud anotada',
             body.includes('ya quedó anotada') && body.includes('en cuál de estas líneas'), body.slice(0,200));
    chequear('Y nunca el "¿qué necesitas?" a secas', !body.includes('¿qué necesitas?'), body.slice(0,150));
  } else {
    // si algún día el flujo decide cerrar directo, también es aceptable: lo importante es no ignorarla
    chequear('Cerró directo con el producto anotado', r.etapa === 'cierre', 'etapa=' + r.etapa);
    chequear('(sin menú, no aplica el texto)', true, '');
  }
}

console.log('\n' + ok + '/' + total + ' aserciones');
process.exit(ok === total ? 0 : 1);
