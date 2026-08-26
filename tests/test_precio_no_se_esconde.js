// El caso REAL de Deicy, 25-ago 17:33: "Venden cerámica para piso".
// La página le entregó al modelo 10 cerámicas CON precio y CON existencias, y el modelo le escribió a la
// clienta "No pudimos confirmarte el precio ni la disponibilidad", listando solo nombres y enlaces.
// La regla (3l) del prompt ya lo prohibía y estaba desplegada: una prohibición NO es un control.
// Desde el 26-ago el código compara la respuesta contra el dato guardado (store.cotDatos) y la repara.
//
// Lo que fija esta prueba:
//   1) el precio que el modelo se saltó se INSERTA en el renglón de ese producto;
//   2) la muletilla "no pudimos confirmar el precio" se BORRA cuando es demostrablemente falsa;
//   3) si de verdad falta el precio de algún producto nombrado, la muletilla se RESPETA (no mentir al revés);
//   4) el precio que el modelo SÍ escribió no se duplica;
//   5) lo que quedó dicho se guarda para la tarjeta del asesor (store.cotizado).
const fs = require('fs');
const ENTREGAR = fs.readFileSync(__dirname + '/n_entregar.js', 'utf8');

let fallos = 0;
const ok = (cond, nombre, extra) => {
  console.log('  ' + (cond ? '✅' : '❌') + ' ' + nombre + (cond || !extra ? '' : '\n      ' + extra));
  if (!cond) fallos++;
};

const WA = '573205662947';
const U1 = 'https://www.ardisa.com/piso-cer-mica-hara-beige-60x60-cm.html';
const U2 = 'https://www.ardisa.com/piso-mikonos-ard-gris-33-8x33-8cm-caja-1-60m2.html';

function entregar(sd, texto) {
  const $ = () => ({ first: () => ({ json: { wa_id: WA } }) });
  const $input = { first: () => ({ json: { content: [{ type: 'text', text: texto }] } }) };
  return new Function('$', '$input', '$getWorkflowStaticData', ENTREGAR)($, $input, () => sd)[0].json;
}
const datos = (extra) => ({
  ses: {}, cotDatos: { [WA]: Object.assign({
    '10018475': { nom: 'Ceramica Para Piso Brillante Hara 60X60 Beige', pre: 84041.99, url: U1, disp: 'con disponibilidad', t: Date.now() },
    '10000988': { nom: 'Ceramica Para Piso Semi Brillante Mikonos ARD', pre: 65609.59, url: U2, disp: 'con disponibilidad', t: Date.now() },
  }, extra || {}) } });

// ── 1 y 2) el caso real, tal cual lo escribió el modelo ──────────────────────────────────────
const REAL = '¡Claro que sí! Manejamos varias opciones de cerámica para piso. No pudimos confirmarte el '
  + 'precio ni la disponibilidad en este momento, pero un asesor te los confirma enseguida. Estas son las '
  + 'referencias que tenemos:\n\n*Ceramica Para Piso Brillante Hara 60X60 Beige (Cj 1.80 Mts)*\n'
  + '🔗 Verlo en línea: ' + U1 + '\n\n*Ceramica Para Piso Semi Brillante Mikonos ARD 33.8X33.8 Gris*\n'
  + '🔗 Verlo en línea: ' + U2 + '\n\n¿Nos cuentas cuántos m2 vas a cubrir?';
let sd = datos();
let r = entregar(sd, REAL);
let b = r.wpp_body.text.body;
ok(b.includes('$84.041'), '(1) el precio omitido del Hara se INSERTA', b.slice(0, 200));
ok(b.includes('$65.609'), '(1) el precio omitido del Mikonos se INSERTA');
ok(b.indexOf('💲 $84.041') < b.indexOf('🔗 Verlo en línea: ' + U1), '(1) el precio va ENCIMA de su enlace');
ok(!/no pudimos confirmar/i.test(b), '(2) la muletilla falsa se BORRA', b.slice(0, 200));
ok(b.includes('Manejamos varias opciones') && b.includes('¿Nos cuentas cuántos m2'),
   '(2) se borra SOLO esa frase: el resto del mensaje queda intacto');
ok((sd.cotizado[WA] || []).length === 2, '(5) los 2 productos quedan para la tarjeta del asesor');
ok(!sd.cotDatos[WA], '(5) el dato crudo se limpia tras usarse');

// ── 3) si de verdad falta un precio, la muletilla es cierta y se respeta ─────────────────────
sd = datos({ '10099999': { nom: 'Cerámica sin precio en lista', pre: 0, url: 'https://www.ardisa.com/sin-precio.html', disp: 'con disponibilidad', t: Date.now() } });
r = entregar(sd, REAL + '\n\n*Cerámica sin precio en lista*\n🔗 Verlo en línea: https://www.ardisa.com/sin-precio.html');
b = r.wpp_body.text.body;
ok(/no pudimos confirmar/i.test(b), '(3) con un producto SIN precio, la frase se RESPETA', b.slice(0, 160));
ok(b.includes('$84.041'), '(3) y aun así se pone el precio de los que SÍ lo traen');

// ── 4) el precio que el modelo ya escribió no se duplica ─────────────────────────────────────
sd = datos();
r = entregar(sd, 'Tenemos esta opción:\n\n*Hara 60X60 Beige*\n💲 $84.041,99 (precio de referencia con IVA)\n'
  + '🔗 Verlo en línea: ' + U1 + '\n\n¿Te sirve?');
b = r.wpp_body.text.body;
ok((b.match(/84\.04\d/g) || []).length === 1, '(4) no se duplica el precio que el modelo SÍ escribió', b);

// ── 5) sin datos guardados, el mensaje pasa tal cual (nunca romper lo que ya funciona) ───────
sd = { ses: {} };
r = entregar(sd, 'Un mensaje cualquiera sin productos.');
ok(r.wpp_body.text.body === 'Un mensaje cualquiera sin productos.', '(6) sin cotDatos el texto no se toca');

// ── 7) EL CASO DEL TORNILLO (26-ago 08:57, prueba en vivo de Deicy) ─────────────────────────
// El modelo metió el precio DENTRO de la muletilla: "...un asesor te confirma si el valor de $3.599
// corresponde a ese paquete". Borrar la frase al final se habría llevado el ÚNICO precio del mensaje.
// Además decía "en nuestro sistema", que es exponer el problema interno (regla de Deicy).
const UT = 'https://www.carpincentro.com/tornillo-6x1-drywall-paq-por-100-und.html';
const TORNILLO = '¡Sí, tenemos ese producto! El que manejamos es:\n\n*Tornillo 6X1 Drywall*\n'
  + 'Paquete por 100 unidades\nNo pudimos validar en este momento el precio exacto en nuestro sistema, '
  + 'así que un asesor te confirma si el valor de $3.599 corresponde a ese paquete de 100 unidades.\n'
  + '🔗 Verlo en línea: ' + UT + '\n\n¿Quieres que un asesor te ayude a concretar el pedido?';
sd = { ses: {}, cotDatos: { [WA]: { '10012345': {
  nom: 'Tornillo 6X1 Drywall Paq X 100 Und', pre: 3599, url: UT, disp: 'con disponibilidad', t: Date.now() } } } };
r = entregar(sd, TORNILLO);
b = r.wpp_body.text.body;
ok(!/no pudimos validar/i.test(b), '(7) se borra la muletilla del tornillo', b.slice(0, 200));
ok(!/nuestro sistema/i.test(b), '(7) y con ella se va el "en nuestro sistema" (problema interno)');
ok(b.includes('$3.599'), '(7) el precio NO se pierde al borrar la frase que lo contenía', b);
ok(b.indexOf('💲 $3.599') < b.indexOf('🔗 Verlo en línea: ' + UT), '(7) y queda en su renglón, encima del enlace');
ok((b.match(/3\.599/g) || []).length === 1, '(7) una sola vez');
ok(b.includes('Paquete por 100 unidades'), '(7) la respuesta a lo que PREGUNTÓ el cliente sigue ahí');

if (fallos) { console.log('test_precio_no_se_esconde: ' + fallos + ' FALLAS'); process.exit(1); }
console.log('test_precio_no_se_esconde: TODAS PASAN');
