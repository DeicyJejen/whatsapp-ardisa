// El caso REAL de Deicy, 27-ago 8:47 a.m. Escribió:
//     "*Codo Sanitario 90 Cxc 6Pulg. Ref 2901224* cotizame 10"
// y le llegó esto:
//     "Ref 2901224*, pero sí tenemos la ficha publicada:
//      💲 $91.828,18 (precio de referencia con IVA)
//      🔗 Verlo en línea: …
//      Un asesor te confirma el valor para las 10 unidades y la disponibilidad en Bucaramanga. …"
//
// Tres fallas en un solo mensaje, y las tres con el dato en la mano (la página devolvió
// precio_con_iva 91828.18 y disponibilidad "con disponibilidad"):
//   1) el mensaje EMPIEZA a media palabra — el borrado de la muletilla cortó en el punto de
//      "6Pulg.", una abreviatura dentro del *nombre en negrita*, no un fin de frase;
//   2) no cotiza: el cliente pidió 10 y nadie multiplicó;
//   3) "un asesor te confirma el valor… y la disponibilidad" — la versión educada de esconder
//      el dato, teniéndolo delante.
const fs = require('fs');
const ENTREGAR = fs.readFileSync(__dirname + '/n_entregar.js', 'utf8');

let fallos = 0;
const ok = (cond, nombre, extra) => {
  console.log('  ' + (cond ? '✅' : '❌') + ' ' + nombre + (cond || !extra ? '' : '\n      ' + extra));
  if (!cond) fallos++;
};

const WA = '573205662947';
const U = 'https://www.ardisa.com/codo-sanitario-90-cxc-6pulg-ref-2901224.html';

function entregar(sd, texto) {
  const $ = () => ({ first: () => ({ json: { wa_id: WA } }) });
  const $input = { first: () => ({ json: { content: [{ type: 'text', text: texto }] } }) };
  return new Function('$', '$input', '$getWorkflowStaticData', ENTREGAR)($, $input, () => sd)[0].json;
}
// `ses` lleva la conversación de cotización: de ahí sale la CANTIDAD que dijo el cliente.
const datos = (ultimoDelCliente) => ({
  ses: { [WA]: { paso:'cotizacion', ciudad:'Bucaramanga', nombre:'Deicy',
                 cotHist: [{ role:'user', content: (ultimoDelCliente || '') }] } },
  cotDatos: { [WA]: { '10011634': { nom:'Codo Sanitario 90 Cxc 6Pulg. Ref 2901224',
                                    pre: 91828.18, url: U, disp:'con disponibilidad', t: Date.now() } } } });

// ── 1) el texto REAL que escribió el modelo, tal cual ────────────────────────────────────────
const REAL = 'No pudimos confirmar en este momento el precio ni la disponibilidad del '
  + '*Codo Sanitario 90 Cxc 6Pulg. Ref 2901224*, pero sí tenemos la ficha publicada:\n\n'
  + '🔗 Verlo en línea: ' + U + '\n\n'
  + 'Un asesor te confirma el valor para las 10 unidades y la disponibilidad en Bucaramanga. '
  + '¿Quieres que te contactemos para dejarte el pedido listo?';

let sd = datos('*Codo Sanitario 90 Cxc 6Pulg. Ref 2901224* cotizame 10');
let b = entregar(sd, REAL).wpp_body.text.body;
console.log('\n--- lo que le llegaría al cliente ---\n' + b + '\n---\n');

ok(!/^Ref 2901224/.test(b.trim()), '(1) el mensaje NO empieza a media palabra', b.slice(0, 90));
ok(!/^[a-z,]/.test(b.trim()), '(1) …ni arranca en minúscula o en coma', b.slice(0, 90));
ok((b.match(/\*/g) || []).length % 2 === 0, '(1) no quedó una *negrita* partida por la mitad');
ok(!/no pudimos confirmar/i.test(b), '(1) la muletilla falsa se borra ENTERA', b.slice(0, 140));

ok(b.includes('$91.828,18'), '(2) el precio unitario está');
ok(/🧮\s*10 unidades: \$918\.281,80 en total/.test(b), '(2) COTIZA las 10: 10 × $91.828,18 = $918.281,80',
   b.split('\n').filter(l => /🧮|💲/.test(l)).join(' | '));
ok(b.indexOf('🧮') > b.indexOf('💲') && b.indexOf('🧮') < b.indexOf('🔗'),
   '(2) el total va entre el precio unitario y el enlace');

ok(!/asesor te confirma el valor/i.test(b), '(3) se borra el "un asesor te confirma el valor…"', b.slice(-190));
ok(/\*Codo Sanitario 90 Cxc 6Pulg\. Ref 2901224\*/.test(b),
   '(3) el nombre del producto se repone (se lo había llevado la muletilla)', b.split('\n')[0]);
ok(b.indexOf('Codo Sanitario') < b.indexOf('💲'), '(3) …y encabeza el bloque, encima del precio');
ok(/\?\s*$/.test(b.trim()), '(3) y el mensaje sigue cerrando con una pregunta', b.slice(-120));
ok(/disponib/i.test(b), '(3) la disponibilidad sí se dice', b.slice(-190));

// ── 2) sin cantidad no se inventa un total ───────────────────────────────────────────────────
sd = datos('*Codo Sanitario 90 Cxc 6Pulg. Ref 2901224* me lo consigues?');
b = entregar(sd, REAL).wpp_body.text.body;
ok(!/🧮/.test(b), '(4) si el cliente NO dijo cantidad, no aparece ningún total', b.slice(0, 160));
ok(b.includes('$91.828,18'), '(4) …pero el precio unitario sigue saliendo');

// ── 3) el número de una referencia NO es una cantidad ────────────────────────────────────────
sd = datos('necesito la referencia 2901224 por favor');
b = entregar(sd, REAL).wpp_body.text.body;
ok(!/🧮/.test(b), '(5) "referencia 2901224" no se lee como 2.901.224 unidades', b.slice(0, 160));

// ── 4) la cantidad también se entiende con la unidad ("20 bultos") ───────────────────────────
sd = datos('me cotizas 20 bultos');
b = entregar(sd, REAL).wpp_body.text.body;
ok(/🧮\s*20 unidades: \$1\.836\.563,60 en total/.test(b), '(6) "20 bultos" también se cotiza',
   b.split('\n').filter(l => /🧮/.test(l)).join(' | '));

// ── 5) el asesor legítimo NO se borra: cuando habla de la ENTREGA, no del precio ─────────────
sd = datos('cotizame 10');
b = entregar(sd, 'Tenemos el codo. 💲 $91.828,18 (precio de referencia con IVA)\n🔗 Verlo en línea: ' + U
  + '\n\n✅ Con disponibilidad. Para esa cantidad un asesor te confirma la entrega completa. ¿Seguimos?')
  .wpp_body.text.body;
ok(/asesor te confirma la entrega/i.test(b), '(7) "un asesor te confirma la ENTREGA" se respeta', b.slice(-170));

// ── 6) si de verdad falta el precio, no se borra nada y no se inventa un total ───────────────
sd = { ses: { [WA]: { cotHist: [{ role:'user', content:'cotizame 10' }] } },
       cotDatos: { [WA]: { '10011634': { nom:'Codo Sanitario', pre: 0, url: U, disp:'con disponibilidad', t: Date.now() } } } };
b = entregar(sd, REAL).wpp_body.text.body;
ok(/no pudimos confirmar/i.test(b), '(8) sin precio real, la muletilla es CIERTA y se respeta', b.slice(0, 130));
ok(!/🧮/.test(b), '(8) …y no se inventa un total de nada');

if (fallos) { console.log('test_cotiza_la_cantidad: ' + fallos + ' FALLAS'); process.exit(1); }
console.log('test_cotiza_la_cantidad: TODAS PASAN');
