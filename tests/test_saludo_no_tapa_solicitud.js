// Caso real Claudia Ardila (573175122973), lead #218 del 04/08 11:38.
//   11:36:33  "Buen día"
//   11:36:49  "Tiene lámina duratex yutex y graffo de 18 mm?"
//   -> la IA (ejecucion n8n 81164) respondio: marca=Carpincentro, confianza=alta,
//      productos=['lámina duratex 18mm','lámina yutex 18mm','lámina graffo 18mm']
//   -> y el lead salio como ARDISA — ACABADOS, a una asesora que no maneja tableros.
//
// La IA NO se equivoco. La regla de saludos no reconocia "buen día", asi que el saludo ocupo
// st.pendTexto (la ranura de la solicitud) y el `!st.pendTexto` descartaba el mensaje siguiente
// junto con el veredicto de la IA. 49 de 162 leads (30%) llegaron asi.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{type:'tool_use', input: datos.ia}] } : {}) :
      (pend || {}) }) });
  return new Function('$','$getWorkflowStaticData','$env', CEREBRO)($, () => sd, new Proxy({},{get:()=>''}))[0].json;
}
const WA = '573175122973';
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, muro:{}, ses:{} });
const ev = (o) => Object.assign({ wa_id:WA, profileName:'Claudia Ardila', texto:'', mtype:'', media_id:'',
                                  opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);
const SI = ev({ opcion_id:'CONSENT_SI', opcion_txt:'✅ Sí, autorizo' });

// Lo que devolvio la IA de verdad, copiado de la ejecucion 81164
const IA_TABLEROS = { en_alcance:true, marca:'Carpincentro', grupo_pista:'desconocido',
  productos:['lámina duratex 18mm','lámina yutex 18mm','lámina graffo 18mm'],
  confianza:'alta', es_info:false, es_reclamo:false };
const IA_VAGA = { en_alcance:true, marca:'', grupo_pista:'', productos:[], confianza:'baja',
  es_info:false, es_reclamo:false };
const IA_CEMENTO = { en_alcance:true, marca:'Ardisa', grupo_pista:'CONSTRUCCION', productos:['cemento gris'],
  confianza:'alta', es_info:false, es_reclamo:false };

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det||''))); };

// ══ EL CASO DE CLAUDIA, TAL CUAL PASO ═══════════════════════════════════════════
{
  const sd = base();
  correr({ datos: ev({ texto:'Buen día' }), sd, pend:{ cons_si:0 } });
  chequear('"Buen día" NO ocupa la ranura de la solicitud', !(sd.ses[WA]||{}).pendTexto,
           'pendTexto=' + JSON.stringify((sd.ses[WA]||{}).pendTexto));

  correr({ datos: ev({ texto:'Tiene lámina duratex yutex y graffo de 18 mm?', ia:IA_TABLEROS }), sd, pend:{ cons_si:0 } });
  const s1 = sd.ses[WA] || {};
  chequear('La solicitud SÍ se guarda', /duratex/i.test(s1.pendTexto||''), 'pendTexto=' + s1.pendTexto);
  chequear('Y el veredicto de la IA también', (s1.pendIA||{}).marca === 'Carpincentro',
           'pendIA=' + JSON.stringify(s1.pendIA));

  const r = correr({ datos: SI, sd, pend:{ cons_si:0 } });
  const s2 = sd.ses[WA] || {};
  chequear('Al autorizar, la marca la pone la IA: Carpincentro', s2.marca === 'Carpincentro', 'marca=' + s2.marca);
  chequear('Y NO le pregunta la marca (ya se sabe)', r.etapa !== 'marca',
           'etapa=' + r.etapa + ' ' + JSON.stringify(r.wpp_body||'').slice(0,110));
}

// ══ Los saludos que el bot no reconocía ═════════════════════════════════════════
for (const saludo of ['Buen día','Buenos días','Buenas tardes','Buenas noches','Hola buenas tardes',
                      'Cordial saludo','Feliz día','hola','buenas']) {
  const sd = base();
  correr({ datos: ev({ texto:saludo }), sd, pend:{ cons_si:0 } });
  chequear('Saludo: "' + saludo + '"', !(sd.ses[WA]||{}).pendTexto,
           'se guardó como solicitud: ' + JSON.stringify((sd.ses[WA]||{}).pendTexto));
}

// ══ NEGATIVOS: un saludo CON pedido NO es un saludo ═════════════════════════════
for (const frase of ['Buenas, necesito cemento','Buen día, tienen cerámica?','Hola quiero cotizar']) {
  const sd = base();
  correr({ datos: ev({ texto:frase, ia:IA_CEMENTO }), sd, pend:{ cons_si:0 } });
  chequear('Sí es solicitud: "' + frase + '"', !!(sd.ses[WA]||{}).pendTexto,
           'se perdió el pedido');
}

// ══ El veredicto se MEJORA, no se pisa a lo bruto ═══════════════════════════════
{
  const sd = base();
  correr({ datos: ev({ texto:'Necesito una cotización', ia:IA_VAGA }), sd, pend:{ cons_si:0 } });
  correr({ datos: ev({ texto:'lámina duratex de 18mm', ia:IA_TABLEROS }), sd, pend:{ cons_si:0 } });
  const s = sd.ses[WA] || {};
  chequear('Un mensaje posterior CON producto mejora el veredicto vago',
           (s.pendIA||{}).marca === 'Carpincentro', 'pendIA=' + JSON.stringify(s.pendIA));
  chequear('Y los dos textos le llegan al asesor',
           /cotizaci/i.test(s.pendTexto||'') && /duratex/i.test(s.pendTexto||''), 'pendTexto=' + s.pendTexto);
}
{
  const sd = base();
  correr({ datos: ev({ texto:'20 bultos de cemento gris', ia:IA_CEMENTO }), sd, pend:{ cons_si:0 } });
  correr({ datos: ev({ texto:'es para una obra', ia:IA_VAGA }), sd, pend:{ cons_si:0 } });
  chequear('Un mensaje vago posterior NO borra el veredicto bueno',
           ((sd.ses[WA]||{}).pendIA||{}).marca === 'Ardisa', 'pendIA=' + JSON.stringify((sd.ses[WA]||{}).pendIA));
}
{
  const sd = base();
  const largo = 'necesito ' + 'x'.repeat(290);
  correr({ datos: ev({ texto:largo, ia:IA_CEMENTO }), sd, pend:{ cons_si:0 } });
  correr({ datos: ev({ texto:'y también arena', ia:IA_CEMENTO }), sd, pend:{ cons_si:0 } });
  chequear('El texto acumulado no se desborda (tope 300)',
           ((sd.ses[WA]||{}).pendTexto||'').length <= 300, 'largo=' + ((sd.ses[WA]||{}).pendTexto||'').length);
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
