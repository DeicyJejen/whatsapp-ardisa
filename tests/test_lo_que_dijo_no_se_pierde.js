// PRUEBA: lo que el cliente dice FUERA DE TURNO no se pierde, y el nombre que llega tarde manda.
//
// Dos casos reales del 18-ago:
//  · Nelson (#313): escribió "varilla roscada de 1/2 y de 5/8" justo cuando se le pedía el NOMBRE. Ese
//    paso estaba excluido del log de la conversación (para que el nombre no saliera como solicitud), así
//    que a Natalia le llegó "Hola buenas tardes · tienen disponible" — sin la varilla. Reportó "Perdido".
//  · José Silva (#316): contestó al nombre aclarando su producto ("es aellador para concreto"); el bot no
//    lo aceptó como nombre —bien— pero cuando él escribió "jose silva" ya se le pedía la ciudad y se
//    descartó: el lead salió a nombre de "Es Aellador Para Concreto".
// Regla nueva: se guarda TODO y se limpia al cerrar, cuando ya sabemos cuál era el nombre y la ciudad.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{ type:'tool_use', input: datos.ia }] } : {}) :
      (pend || {}) }) });
  return new Function('$', '$getWorkflowStaticData', '$env', CEREBRO)($, () => sd, new Proxy({}, { get: () => '' }))[0].json;
}
const WA = '573156273850';
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, muro:{}, ses:{},
                      info:{}, cliMsgs:{}, prov:{}, esCli:{} });
const ev = (o) => Object.assign({ wa_id:WA, profileName:'Cliente', texto:'', mtype:'', media_id:'',
                                  opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);
const S = (x) => JSON.stringify(x || '');
const ses = (sd) => sd.ses[WA] || {};

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det || ''))); };

// ══ 1. CASO NELSON: el producto dicho en el paso del NOMBRE llega al asesor ═════
{
  const sd = base();
  correr({ datos: ev({ texto:'Hola buenas tardes' }), sd, pend:{ cons_si:0 } });
  correr({ datos: ev({ texto:'Sí, autorizo', opcion_id:'CONSENT_SI' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'🟢 Ardisa', opcion_id:'MAR_ARD' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'varilla roscada de 1/2 y de 5/8' }), sd, pend:{ cons_si:1 } });   // ← en el paso 'nombre'
  correr({ datos: ev({ texto:'Nelson Ortiz' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'Bucaramanga' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'🏠 Cliente final', opcion_id:'OAR_FINAL' }), sd, pend:{ cons_si:1 } });
  const r = correr({ datos: ev({ texto:'tienen disponible' }), sd, pend:{ cons_si:1 } });
  const lead = sd.leads.filter(l => l.wa === WA).slice(-1)[0];
  chequear('El lead se cierra', !!lead, S(r.wpp_body).slice(0,120));
  chequear('La VARILLA llega al asesor (se dijo en el paso del nombre)',
           !!lead && /varilla roscada/i.test(lead.detalle), 'detalle=' + S(lead && lead.detalle));
  chequear('Y el NOMBRE no se cuela como si fuera la solicitud',
           !!lead && !/nelson ortiz/i.test(lead.detalle), 'detalle=' + S(lead && lead.detalle));
  chequear('La CIUDAD tampoco', !!lead && !/bucaramanga/i.test(lead.detalle), 'detalle=' + S(lead && lead.detalle));
}

// ══ 2. CASO JOSÉ SILVA: el nombre que llega tarde corrige al malo ══════════════
{
  const sd = base();
  correr({ datos: ev({ texto:'Bunas tardes, necesito sellador sika polmarflex, precio galon' }), sd, pend:{ cons_si:0 } });
  correr({ datos: ev({ texto:'Sí, autorizo', opcion_id:'CONSENT_SI' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'🟢 Ardisa', opcion_id:'MAR_ARD' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'es aellador para concreto' }), sd, pend:{ cons_si:1 } });   // no es un nombre
  chequear('"es aellador para concreto" NO queda como nombre',
           !/aellador/i.test(ses(sd).nombre || ''), 'nombre=' + S(ses(sd).nombre));
  correr({ datos: ev({ texto:'jose silva' }), sd, pend:{ cons_si:1 } });                  // su nombre, ya en otro paso
  chequear('Cuando escribe "jose silva" (aunque se le pida otra cosa), ese es su nombre',
           /jose silva/i.test(ses(sd).nombre || ''), 'nombre=' + S(ses(sd).nombre));
}

// ══ 3. NEGATIVO: un nombre bueno NO lo pisa cualquier cosa que escriba después ══
{
  const sd = base();
  correr({ datos: ev({ texto:'Necesito cemento gris' }), sd, pend:{ cons_si:0 } });
  correr({ datos: ev({ texto:'Sí, autorizo', opcion_id:'CONSENT_SI' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'🟢 Ardisa', opcion_id:'MAR_ARD' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'Pedro Gómez' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'gracias Karina' }), sd, pend:{ cons_si:1 } });   // en el paso de la ciudad
  chequear('El nombre bueno se queda', /pedro g/i.test(ses(sd).nombre || ''), 'nombre=' + S(ses(sd).nombre));
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
