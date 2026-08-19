// PRUEBA: al cliente no se le pregunta DOS VECES lo mismo (caso Leidy López #323, 19-ago).
//
// Ella tocó "🛋️ Proyecto a tu medida" en el paso del perfil, escribió "Mueble de entretenimiento" y el bot
// le preguntó otra vez: "¿Construcción, Acabados o Proyecto a tu medida?" — con la opción que acababa de
// elegir. Tocó Proyecto a tu medida por segunda vez… y el lead terminó en Acabados, no con Alexander.
// Dos reglas: si el cliente YA eligió el grupo no se le vuelve a preguntar, y esa elección explícita manda
// cuando lo que describe es un mueble a medida (que es lo que promete la opción: cocinas, closets, muebles).
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{ type:'tool_use', input: datos.ia }] } : {}) :
      (pend || {}) }) });
  return new Function('$', '$getWorkflowStaticData', '$env', CEREBRO)($, () => sd, new Proxy({}, { get: () => '' }))[0].json;
}
const WA = '573006997710';
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, muro:{}, ses:{},
                      info:{}, cliMsgs:{}, prov:{}, esCli:{}, win:{}, mediaPend:{} });
const ev = (o) => Object.assign({ wa_id:WA, profileName:'Leidy', texto:'', mtype:'', media_id:'',
                                  opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);
const S = (x) => JSON.stringify(x || '');
const P = { cons_si:1 };
// La IA no logra clasificar "mueble de entretenimiento" en Construcción/Acabados (es justo el caso real)
// Lo que respondió la IA de verdad ese día (ejecución 119558): Carpincentro, confianza media.
const IA_MUEBLE = { en_alcance:true, marca:'Carpincentro', grupo_pista:'', productos:['mueble de entretenimiento'],
                    confianza:'media', es_info:false, es_reclamo:false };
const body = (r) => (r.wpp_body && (r.wpp_body.text ? r.wpp_body.text.body
                    : (r.wpp_body.interactive && r.wpp_body.interactive.body && r.wpp_body.interactive.body.text))) || '';
const menuGrupo = (r) => /Construcci[oó]n/i.test(body(r)) && /Acabados/i.test(body(r));

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det || ''))); };

// ══ EL RECORRIDO EXACTO DE LEIDY ══════════════════════════════════════════════
{
  const sd = base();
  correr({ datos: ev({ texto:'Hola! Estoy buscando asesoría' }), sd, pend:P });
  correr({ datos: ev({ texto:'Sí, autorizo', opcion_id:'CONSENT_SI' }), sd, pend:P });
  correr({ datos: ev({ texto:'🟢 Ardisa', opcion_id:'MAR_ARD' }), sd, pend:P });
  correr({ datos: ev({ texto:'Leidy Lopez' }), sd, pend:P });
  correr({ datos: ev({ texto:'Otra ciudad', opcion_id:'CIU_OTRA' }), sd, pend:P });
  correr({ datos: ev({ texto:'Barranquilla Atlantico' }), sd, pend:P });
  const r1 = correr({ datos: ev({ texto:'🛋️ Proyecto a tu medida', opcion_id:'OAR_MOBIL' }), sd, pend:P });
  chequear('Tras elegir "Proyecto a tu medida" le piden el detalle', /qué necesitas|qué producto/i.test(body(r1)),
           body(r1).slice(0,90));
  const r2 = correr({ datos: ev({ texto:'Mueble de entretenimiento', ia:IA_MUEBLE }), sd, pend:P });
  chequear('NO le vuelven a preguntar Construcción/Acabados/Proyecto', !menuGrupo(r2), body(r2).slice(0,120));
  chequear('El lead se cierra de una', /registrada/i.test(body(r2)) || r2.pend_cierre === true,
           'etapa=' + r2.etapa + ' ' + body(r2).slice(0,80));
  const lead = sd.leads.filter(l => l.wa === WA).slice(-1)[0];
  // 19-ago, decisión de Deicy con el caso en la mano: un mueble hecho A LA MEDIDA (entretenimiento, TV,
  // closet, cocina, baño) es de ALEXANDER — Proyectos de Ardisa. A Carpincentro le toca el MATERIAL:
  // tableros, melamina, herrajes, madera para el carpintero. La IA decía Carpincentro y aquí NO manda.
  chequear('Y va a Proyectos: Alexander, no Acabados ni Carpincentro',
           !!lead && /Alexander/i.test(lead.asesor || ''),
           'asesor=' + S(lead && lead.asesor) + ' marca=' + S(lead && lead.marca));
}

// ══ NEGATIVO: sin elección explícita, el mostrador NO se va a proyectos ═══════
// (regla de Deicy: Alexander no atiende construcción ni acabados)
{
  const sd = base();
  const IA_CEM = { en_alcance:true, marca:'Ardisa', grupo_pista:'CONSTRUCCION', productos:['cemento'],
                   confianza:'alta', es_info:false, es_reclamo:false };
  correr({ datos: ev({ texto:'Hola' }), sd, pend:P });
  correr({ datos: ev({ texto:'Sí, autorizo', opcion_id:'CONSENT_SI' }), sd, pend:P });
  correr({ datos: ev({ texto:'🟢 Ardisa', opcion_id:'MAR_ARD' }), sd, pend:P });
  correr({ datos: ev({ texto:'Juan Ruiz' }), sd, pend:P });
  correr({ datos: ev({ texto:'Bucaramanga' }), sd, pend:P });
  correr({ datos: ev({ texto:'🛋️ Proyecto a tu medida', opcion_id:'OAR_MOBIL' }), sd, pend:P });
  correr({ datos: ev({ texto:'necesito 50 bultos de cemento', ia:IA_CEM }), sd, pend:P });
  const lead = sd.leads.filter(l => l.wa === WA).slice(-1)[0];
  chequear('Quien pide cemento NO cae en proyectos aunque toque ese botón',
           !!lead && !/Alexander/i.test(lead.asesor || ''), 'asesor=' + S(lead && lead.asesor));
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
