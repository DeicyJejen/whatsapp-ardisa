// PRUEBA: un lead NO se le entrega al asesor sin ciudad hasta hacerle al cliente una última pregunta.
//
// Caso real, 26-ago 5:12 p.m. Un cliente escribió "Buenas.", eligió 🟢 Ardisa, mandó UNA FOTO
// (un guardallaves, que el bot sí supo describir) y no volvió a hablar. A los 31 minutos el rescate
// entregó el lead #408 a una asesora de Bucaramanga — sin saber si el cliente era de Bucaramanga.
// En el último mes le pasó a 11 de 280 leads: todos se repartieron como si fueran de aquí.
//
// Decisión de Deicy (27-ago): antes de entregarlo se pregunta UNA vez más, y SOLO la ciudad, con
// botones; si a los 20 minutos sigue callado, el lead sale igual y marcado (el cliente no se pierde).
const fs = require('fs');
const INACTIVOS = fs.existsSync(__dirname + '/n_inactivos.js') ? fs.readFileSync(__dirname + '/n_inactivos.js', 'utf8') : null;

const WA = '573001119933';            // cliente de prueba
const MIN = 60000;
const S = (x) => JSON.stringify(x || '');

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det || ''))); };

const base = () => ({ ses:{}, done:{}, win:{}, mediaPend:{}, mediaNudge:{}, segPend:{}, segRemDay:{},
                      pendCierre:{}, holdAviso:[], leads:[], rescate:{}, rot:{}, migSeg2407b:1 });
const correr = (sd) => new Function('$', '$getWorkflowStaticData', '$env', INACTIVOS)(
  () => ({ first: () => ({ json: {} }) }), () => sd, new Proxy({}, { get: () => '' }));

// Un cliente parado en el paso 'ciudad', ya con recordatorio enviado y con paquete de rescate listo.
function listoParaCerrar(sd, extra) {
  const NOW = Date.now();
  sd.ses[WA] = Object.assign({ paso:'ciudad', t: NOW - 40*MIN, recordado: NOW - 25*MIN,
                               nombre:'Julián Ramírez', marca:'Ardisa', ciudad:'' }, extra || {});
  sd.rescate[WA] = { destino:'573000000009', rot:null,
    aviso:{ messaging_product:'whatsapp', to:'573000000009', type:'text', text:{ body:'tarjeta' } },
    lead:{ nombre:'Julián Ramírez', ciudad:'', marca:'Ardisa', asesor:'Natalia Amaris Martínez',
           detalle:'📎 Imagen: Guardallaves con clave y arco marca IFAM G2' } };
  return sd.ses[WA];
}
const salidas = (out) => (out || []).map(x => (x.json && x.json.chat && x.json.chat.etapa) || '').filter(Boolean);
const msgDe = (out, etapa) => ((out || []).find(x => x.json && x.json.chat && x.json.chat.etapa === etapa) || {}).json;

if (!INACTIVOS) { console.log('  OK   | (n_inactivos.js no disponible en este arnés)'); process.exit(0); }

// ══ 1. SIN ciudad: no se entrega, se pregunta ════════════════════════════════════════════════
{
  const sd = base(); listoParaCerrar(sd);
  const out = correr(sd);
  chequear('No se cierra: primero se pregunta la ciudad',
           salidas(out).indexOf('cierre_rescate') < 0, 'salidas: ' + S(salidas(out)));
  const m = msgDe(out, 'ciudad_ultima');
  chequear('Sale la última pregunta', !!m, 'salidas: ' + S(salidas(out)));
  const it = m && m.msg && m.msg.interactive;
  chequear('…con los 3 botones de ciudad de Ardisa',
           !!it && it.type === 'button' && it.action.buttons.length === 3
           && it.action.buttons.map(b => b.reply.id).join(',') === 'BUCARAMANGA,FLORIDABLANCA,OTRA',
           S(it && it.action));
  chequear('…y pregunta SOLO la ciudad (ni nombre ni producto)',
           /ciudad/i.test(it.body.text) && !/nombre|producto/i.test(it.body.text), S(it.body.text));
  chequear('El lead sigue esperando, no se guardó', (sd.leads || []).length === 0, S(sd.leads));
  chequear('Queda anotado que ya se preguntó', !!sd.ses[WA].ciudadUlt, S(sd.ses[WA].ciudadUlt));

  // vuelve a correr el cron enseguida: no se le pregunta dos veces ni se cierra todavía
  const out2 = correr(sd);
  chequear('No se le repite la pregunta en el siguiente tick',
           salidas(out2).indexOf('ciudad_ultima') < 0, 'salidas: ' + S(salidas(out2)));
  chequear('Y tampoco se cierra dentro de sus 20 minutos',
           salidas(out2).indexOf('cierre_rescate') < 0, 'salidas: ' + S(salidas(out2)));
}

// ══ 2. Pasados los 20 minutos sin respuesta: el lead SALE igual (no se pierde el cliente) ════
{
  const sd = base(); const st = listoParaCerrar(sd);
  st.ciudadUlt = Date.now() - 21*MIN;
  const out = correr(sd);
  chequear('A los 21 minutos el lead se entrega igual',
           salidas(out).indexOf('cierre_rescate') >= 0, 'salidas: ' + S(salidas(out)));
  chequear('…y queda guardado con la asesora asignada',
           (sd.leads || []).length === 1 && sd.leads[0].asesor === 'Natalia Amaris Martínez', S(sd.leads));
}

// ══ 3. Si YA tenía ciudad, nada cambia: se entrega de una ════════════════════════════════════
{
  const sd = base(); const st = listoParaCerrar(sd);
  st.ciudad = 'Bucaramanga'; sd.rescate[WA].lead.ciudad = 'Bucaramanga';
  const out = correr(sd);
  chequear('Con ciudad conocida se cierra sin preguntar nada',
           salidas(out).indexOf('cierre_rescate') >= 0 && salidas(out).indexOf('ciudad_ultima') < 0,
           'salidas: ' + S(salidas(out)));
}

// ══ 4. Carpincentro: se pregunta, pero en texto (sus 9 ciudades no caben en botones) ═════════
{
  const sd = base(); const st = listoParaCerrar(sd);
  st.marca = 'Carpincentro'; sd.rescate[WA].lead.marca = 'Carpincentro';
  const out = correr(sd);
  const m = msgDe(out, 'ciudad_ultima');
  chequear('A Carpincentro también se le pregunta la ciudad', !!m, 'salidas: ' + S(salidas(out)));
  chequear('…pero en texto plano, sin menú', !!m && m.msg.type === 'text' && /ciudad/i.test(m.msg.text.body),
           S(m && m.msg.type));
}

// ══ 5. Sin paquete de rescate no hay lead que completar: no se pregunta ══════════════════════
{
  const sd = base(); listoParaCerrar(sd);
  delete sd.rescate[WA];
  const out = correr(sd);
  chequear('Sin nada que entregar, no se le pregunta la ciudad por gusto',
           salidas(out).indexOf('ciudad_ultima') < 0, 'salidas: ' + S(salidas(out)));
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
