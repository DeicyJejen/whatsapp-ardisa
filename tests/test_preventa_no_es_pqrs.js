// Los dos mensajes REALES de un cliente real, 26-ago (número cambiado por uno de prueba):
//
//  09:09  "tiene envios a bogota??"  -> la IA lo marcó es_info=true y el bot lo despachó a Servicio al
//         Cliente (WhatsApp 3176643045 + ayuda@ardisa.com). Nadie le contestó; a los 12 min le llegó el
//         recordatorio de inactividad. Preguntar si le llega a su ciudad es PREVENTA, no un trámite.
//  09:24  "Estoy interesado en una basurera q ustedes man4jan" -> recibió el menú de marcas a secas.
//         Deicy: "no logro saber qué fue lo que preguntó". El pedido SÍ se guardaba, pero no se veía.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, staticData, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content: [{ type: 'tool_use', input: datos.ia }] } : {}) :
      (pend || {}) }) });
  return new Function('$', '$getWorkflowStaticData', '$env', CEREBRO)($, () => staticData, new Proxy({}, { get: () => '' }))[0].json;
}
let fallos = 0;
const ok = (c, n, extra) => { console.log('  ' + (c ? '✅' : '❌') + ' ' + n + (c || !extra ? '' : '\n      ' + extra)); if (!c) fallos++; };

const WA = '573001119988';
const base = () => ({ rot:{}, consent:{ [WA]: Date.now() }, leads:[], done:{}, sent:{},
  lastKey:{}, fwd:{}, medias:{}, segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, info:{},
  reclamo:{}, muro:{}, ses:{ [WA]:{ paso:'marca', t:Date.now(), consent:true } } });
const msg = (texto, ia) => ({ wa_id:WA, profileName:'Sergio', texto, mtype:'', media_id:'',
                              btn_id:'', btn_title:'', es_media:false, ia });
// el veredicto EXACTO que dio la IA en la ejecución 139046
const IA_INFO   = { en_alcance:false, es_info:true, es_reclamo:false, marca:'', grupo_pista:'', productos:[], confianza:'alta', acuse:'' };
const IA_COMPRA = { en_alcance:true, es_info:false, es_reclamo:false, marca:'Carpincentro', grupo_pista:'', productos:['basurera'], confianza:'alta', acuse:'' };
const cuerpo = (r) => JSON.stringify((r.wpp_body && r.wpp_body.text) || (r.wpp_body && r.wpp_body.interactive) || r.wpp_body || {});

// ── 1) el caso que se perdió: envíos a Bogotá ──────────────────────────────────────────────
let sd = base();
let r = correr({ datos: msg('tiene envios a bogota??', IA_INFO), staticData: sd, pend: {} });
ok(r.etapa !== 'info', '(1) "¿tiene envíos a Bogotá?" YA NO cae en Servicio al Cliente', 'etapa=' + r.etapa);
ok(!/3176643045|ayuda@ardisa\.com/.test(cuerpo(r)), '(1) no le dan el WhatsApp de PQRS', cuerpo(r).slice(0, 160));
ok(!!r.wpp_body, '(1) y SÍ le responden algo (antes salía mudo por la rama de debounce)');

// más formas de preguntar lo mismo — el arreglo es del MECANISMO, no del caso
[['¿hacen domicilios?', 'domicilio'], ['me llega a Cúcuta?', 'llega a'], ['dónde quedan ustedes?', 'sede/punto'],
 ['a qué hora abren?', 'horario'], ['aceptan tarjeta de crédito?', 'forma de pago']].forEach(function (par) {
  const rr = correr({ datos: msg(par[0], IA_INFO), staticData: base(), pend: {} });
  ok(rr.etapa !== 'info', '(1) "' + par[0] + '" tampoco (' + par[1] + ')', 'etapa=' + rr.etapa);
});

// ── 2) lo que SÍ es un trámite sigue yendo a Servicio al Cliente ───────────────────────────
[['necesito validar una referencia comercial', 'referencia comercial'],
 ['¿ustedes son autorretenedores?', 'tributario'],
 ['con quién hablo del área de cartera?', 'cartera']].forEach(function (par) {
  const rr = correr({ datos: msg(par[0], IA_INFO), staticData: base(), pend: {} });
  ok(rr.etapa === 'info', '(2) "' + par[0] + '" SÍ es info (' + par[1] + ')', 'etapa=' + rr.etapa);
});

// ── 3) el menú ya no es sordo ──────────────────────────────────────────────────────────────
sd = base(); sd.ses[WA] = { paso:'marca', t:Date.now(), consent:true };
r = correr({ datos: msg('Estoy interesado en una basurera q ustedes man4jan', IA_COMPRA), staticData: sd, pend: {} });
const c = cuerpo(r);
ok(/Anotamos/.test(c) || /basurera/i.test(c), '(3) el bot le repite lo que pidió', c.slice(0, 200));

// ── 4) un saludo pelado NO se repite ("Anotamos: buenos días" se ve ridículo) ──────────────
sd = base(); sd.ses[WA] = { paso:'marca', t:Date.now(), consent:true };
r = correr({ datos: msg('buenos dias', null), staticData: sd, pend: {} });
ok(!/Anotamos/.test(cuerpo(r)), '(4) un saludo pelado no se repite', cuerpo(r).slice(0, 160));

// ── 5) NO se le vuelve a preguntar la ciudad que ya dijo ───────────────────────────────────
// La IA sacó ciudad='Bogotá' de "tiene envios a bogota??" (ejecución 139046 real) y el bot igual se la
// volvía a preguntar. Deicy: "cansa tanta repetidera de preguntas cuando ya dio la información".
const IA_ENVIO = { en_alcance:true, es_info:false, es_reclamo:false, marca:'desconocida', ciudad:'Bogotá',
                   grupo_pista:'', productos:[], confianza:'baja', acuse:'' };
sd = base();
r = correr({ datos: msg('tiene envios a bogota??', IA_ENVIO), staticData: sd, pend: {} });
const st5 = JSON.parse(r.ses_out || '{}');
const c5 = cuerpo(r);
ok(st5.ciudadId === 'BOGOTA', '(5) la ciudad que dijo queda GUARDADA', 'ciudadId=' + st5.ciudadId);
ok(!/en qué \*?ciudad\*? te encuentras/i.test(c5), '(5) y NO se la vuelve a preguntar', c5.slice(0, 200));
ok(/Bogot/.test(c5), '(5) se le acusa recibo de su ciudad', c5.slice(0, 220));
ok(/Con gusto te resolvemos eso/.test(c5), '(5) y de su pregunta, en vez de saltar al formulario');
ok(!/despachamos|enviamos a todo|cobertura nacional|llega en \d/i.test(c5),
   '(5) sin PROMETER cobertura ni tiempos (no se sabe ni la marca todavía)');

// ── 6) una ciudad que no existe en la marca elegida no se hereda ───────────────────────────
// Ardisa solo atiende Bucaramanga y Floridablanca: un 'BOGOTA' heredado mandaría el lead a una
// ciudad donde Ardisa no tiene asesor.
sd = base();
sd.ses[WA] = { paso:'nombre', t:Date.now(), consent:true, marca:'Ardisa', ciudad:'Bogotá', ciudadId:'BOGOTA' };
r = correr({ datos: msg('Juan Perez', null), staticData: sd, pend: {} });
const st6 = JSON.parse(r.ses_out || '{}');
ok(st6.ciudadId !== 'BOGOTA', '(6) Ardisa + Bogotá: la ciudad se olvida y se vuelve a preguntar',
   'ciudadId=' + st6.ciudadId);

// Carpincentro SÍ tiene Bogotá: ahí se respeta
sd = base();
sd.ses[WA] = { paso:'nombre', t:Date.now(), consent:true, marca:'Carpincentro', ciudad:'Bogotá', ciudadId:'BOGOTA' };
r = correr({ datos: msg('Juan Perez', null), staticData: sd, pend: {} });
ok(JSON.parse(r.ses_out || '{}').ciudadId === 'BOGOTA', '(6) Carpincentro + Bogotá: se respeta');

if (fallos) { console.log('test_preventa_no_es_pqrs: ' + fallos + ' FALLAS'); process.exit(1); }
console.log('test_preventa_no_es_pqrs: TODAS PASAN');
