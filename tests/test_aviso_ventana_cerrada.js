// AVISOS AL ASESOR CON LA VENTANA DE 24 h CERRADA (26-ago-2026, pregunta de Deicy sobre Karime).
// El panel decía "Karime · 19 enviados · 19 entregados · 0 leídos · 3 fuera de ventana 24h" y ella
// preguntó: "¿cómo así? para eso tenemos una plantilla, que así tenga la sesión cerrada se reactiva".
// Y era cierto: el aviso del LEAD ya elegía plantilla, pero la ADICIÓN del cliente y el RECORDATORIO
// de "el cliente insiste" salían como texto libre. Meta los rechaza con "Re-engagement message" y el
// asesor no se entera — justo los dos avisos que existen porque alguien está esperando.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

let fallos = 0;
const ok = (c, n, extra) => { console.log('  ' + (c ? '✅' : '❌') + ' ' + n + (c || !extra ? '' : '\n      ' + extra)); if (!c) fallos++; };

const CLI = '573001119977';          // el cliente
const ASE = '573174293535';          // el asesor (ventana abierta o cerrada según la prueba)

function correr({ texto, ventanaAbierta, ses }) {
  const sd = { rot:{}, consent:{ [CLI]: Date.now() }, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{},
               medias:{}, segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, info:{},
               reclamo:{}, muro:{}, ses:{ [CLI]: ses },
               // `store.win[num]` = cuándo escribió esa persona por última vez. <23 h = ventana abierta.
               win: ventanaAbierta ? { [ASE]: Date.now() } : { [ASE]: Date.now() - 30*3600*1000 } };
  const datos = { wa_id:CLI, profileName:'Cliente', texto, mtype:'', media_id:'', btn_id:'',
                  btn_title:'', es_media:false, ia:null };
  const $ = (n) => ({ first: () => ({ json: n === 'Extraer datos' ? datos
      : n === '🤖 IA Anthropic' ? {} : { cons_si:1, pend_id:0 } }) });
  return new Function('$','$getWorkflowStaticData','$env', CEREBRO)($, () => sd, new Proxy({}, { get: () => '' }))[0].json;
}
const cerrado = (r) => {
  const b = r.aviso_body;
  return b && b.type === 'template' && b.template && b.template.name === 'aviso_lead_btn';
};
const libre = (r) => !!(r.aviso_body && r.aviso_body.type === 'text');

// sesión de un cliente que YA tiene lead con ese asesor y vuelve a escribir
const sesCerrada = () => ({ paso:'cerrado', t:Date.now(), consent:true, nombre:'Pedro Pérez',
  ciudad:'Bucaramanga', ciudadId:'BUCARAMANGA', marca:'Ardisa', ocupacion:'🏠 Cliente final',
  detalle:'5 puertas de 2,10 x 0.80', destino:ASE, asesorNom:'Karime Vannesa', addN:1 });

// ── 1) LA ADICIÓN ────────────────────────────────────────────────────────────────────────────
let r = correr({ texto:'también necesito 3 bisagras', ventanaAbierta:false, ses:sesCerrada() });
// PRIMERO se exige que el aviso EXISTA. Sin esta línea, "no sale como texto libre" pasaba en verde
// cuando no salía NADA — una prueba que aprueba el silencio no prueba nada (pasó de verdad hoy).
ok(!!r.aviso_body, '(0) el aviso al asesor EXISTE (si no, lo de abajo pasaría en falso)', 'etapa=' + r.etapa);
ok(cerrado(r), '(1) con la ventana CERRADA la adición sale como PLANTILLA aprobada',
   JSON.stringify(r.aviso_body || {}).slice(0, 170));

r = correr({ texto:'también necesito 3 bisagras', ventanaAbierta:true, ses:sesCerrada() });
ok(libre(r), '(1) con la ventana ABIERTA sigue saliendo como texto (gratis)',
   JSON.stringify(r.aviso_body || {}).slice(0, 120));

// ── 2) LOS PARÁMETROS DE LA PLANTILLA NO PUEDEN LLEVAR SALTOS DE LÍNEA ───────────────────────
// Meta RECHAZA un parámetro con \n o \t. Si se cuela uno, la plantilla —que es justo el camino
// para la ventana cerrada— falla igual que el texto libre y no habríamos arreglado nada.
r = correr({ texto:'también necesito 3 bisagras', ventanaAbierta:false, ses:sesCerrada() });
if (r.aviso_body && r.aviso_body.type === 'template') {
  const params = (r.aviso_body.template.components[0].parameters || []).map(p => p.text);
  ok(params.every(t => !/[\r\n\t]/.test(String(t))), '(2) ningún parámetro trae saltos de línea', JSON.stringify(params));
  ok(params.every(t => String(t).length <= 700), '(2) ninguno pasa de 700 caracteres');
  ok(params.length === 6, '(2) van los 6 parámetros que espera la plantilla', 'son ' + params.length);
}

if (fallos) { console.log('test_aviso_ventana_cerrada: ' + fallos + ' FALLAS'); process.exit(1); }
console.log('test_aviso_ventana_cerrada: TODAS PASAN');
