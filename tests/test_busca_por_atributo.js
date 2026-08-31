// El caso REAL de Deicy, 27-ago 3:58 p.m.: "Necesito 14 láminas de fibrocemento de 12mm".
// Le llegó esto:
//   "No encontramos fibrocemento exactamente en 12 mm, pero manejamos la lámina Eterboard Cedar
//    en 10 mm… No pudimos confirmar en este momento su precio ni su disponibilidad"
// Dos fallas, y las dos comprobadas contra la tienda:
//   (1) de fibrocemento en lámina SÍ hay (4, 6, 8, 10, 17 y 20 mm), pero la *Lamina Eterboard* no
//       lleva la palabra "fibrocemento" en el nombre — la lleva en su atributo `material`. El filtro
//       de relevancia (26-ago) solo miraba el NOMBRE y las tiraba, dejando pasar las TEJAS.
//   (2) el precio ($173.709) y la existencia (20) SÍ llegaron: la ejecución 142494 los tiene. Llegaron
//       por la consulta INDIVIDUAL (precio_articulo), y `store.cotDatos` solo guardaba lo que devolvía
//       `buscar_producto` — así que el verificador del código estaba ciego y no pudo reparar la frase.
const fs = require('fs');
// El buscador de la tienda vive DENTRO de los nodos de consulta (R1/R2/R3), no en uno propio.
const TIENDA = fs.existsSync(__dirname + '/n_sap_r2.js') ? fs.readFileSync(__dirname + '/n_sap_r2.js', 'utf8') : null;

let fallos = 0;
const ok = (cond, nombre, extra) => {
  console.log('  ' + (cond ? '✅' : '❌') + ' ' + nombre + (cond || !extra ? '' : '\n      ' + extra));
  if (!cond) fallos++;
};
if (!TIENDA) { console.log('  ✅ (n_sap_r2.js no disponible en este arnés)'); process.exit(0); }

// ── El filtro de relevancia, tal cual vive en el nodo ────────────────────────────────────────
// Se extrae del código real: si alguien lo cambia, esta prueba se entera.
// Se recorta contando llaves, no con una expresión regular: una regex "hasta el primer }" corta la
// función por la mitad en cuanto el cuerpo tiene un bloque propio, y la prueba se cae por su culpa.
function extraer(src, firma) {
  const ini = src.indexOf(firma);
  if (ini < 0) return null;
  let i = src.indexOf('{', ini), prof = 0;
  for (let k = i; k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}' && --prof === 0) return src.slice(ini, k + 1);
  }
  return null;
}
const m = extraer(TIENDA, 'function _relevantes');
ok(!!m, 'se encuentra la función _relevantes en el nodo de la tienda');
const AUX = TIENDA.match(/const _STOP_T\s*=[^;]+;/)[0] + '\n'
          + TIENDA.match(/const _SINON_T\s*=[^;]+;/)[0] + '\n'
          + extraer(TIENDA, 'function _sinTildes') + '\n';
const relevantes = new Function(AUX + m + '\n return _relevantes;')();

// Lo que la tienda devuelve de verdad para "fibrocemento" (verificado contra ardisa.com el 27-ago)
const LISTA = [
  { item_name:'Teja Fibrocemento Eternit  P7 1.22 Mts', atributos_publicados:{ marca:'Eternit', material:'Teja Fiblocemento' } },
  { item_name:'Lamina Eterboard 2.44X1.22X10Mm',        atributos_publicados:{ marca:'Eternit', material:'Lamina de fibrocemento' } },
  { item_name:'Lamina Eterboard 2.44 X 1.22 X 17 Mm',   atributos_publicados:{ marca:'Eternit', material:'Lamina de fibrocemento' } },
  { item_name:'Eterb. Cedar 10Mm Cr 1220 X2440',        atributos_publicados:{ marca:'Eternit', material:'Lamina de fibrocemento' } },
  { item_name:'Sika Transparente 5 De 16 Kg',           atributos_publicados:{ marca:'Sika', material:'Sellante' } },
  { item_name:'Griferia Lavamanos Monocontrol',         atributos_publicados:{ marca:'Grival', material:'Metal' } },
];
const nombres = (l) => l.map(x => x.item_name);

// ── 1) la lámina sobrevive gracias a su atributo ─────────────────────────────────────────────
let r = relevantes('fibrocemento', LISTA);
ok(nombres(r).some(n => /Lamina Eterboard 2.44X1.22X10Mm/.test(n)),
   '(1) "fibrocemento" ya NO tira la Lamina Eterboard (su material lo dice)', JSON.stringify(nombres(r)));
ok(nombres(r).some(n => /Teja Fibrocemento/.test(n)), '(1) …y la teja sigue saliendo (se llama así)');

// ── 2) sin reabrir la fuga que tapó el filtro: nada de ofrecer cualquier cosa ─────────────────
ok(!nombres(r).some(n => /Sika|Griferia/.test(n)),
   '(2) el Sika y la grifería siguen FUERA (la fuga de ayer sigue tapada)', JSON.stringify(nombres(r)));
r = relevantes('llanta de carro', LISTA);
ok(r.length === 0, '(2) "llanta de carro" no engancha nada de esta lista', JSON.stringify(nombres(r)));
r = relevantes('disco corte', LISTA);
ok(!nombres(r).some(n => /Griferia/.test(n)), '(2) "disco corte" no devuelve grifería');

// ── 2b) "media lámina" busca LÁMINAS, no la grifería "Media" (Deicy, 27-ago) ─────────────────
// La tienda devuelve de verdad "Griferia Media Para Lavamanos Barcelona" cuando se busca "media lamina":
// el calificativo engancha por su cuenta. Un adjetivo describe CÓMO es la cosa, nunca QUÉ es.
const CON_MEDIA = LISTA.concat([
  { item_name:'Griferia Media Para Lavamanos Barcelona Mateblack', atributos_publicados:{ marca:'Grival', material:'Metal' } },
  { item_name:'Media Cana Pvc Blanca 3 Mts',                       atributos_publicados:{ marca:'Pavco',  material:'PVC' } },
]);
r = relevantes('media lamina', CON_MEDIA);
ok(!nombres(r).some(n => /Griferia Media/.test(n)),
   '(2b) "media lámina" ya NO devuelve la grifería "Media"', JSON.stringify(nombres(r)));
ok(nombres(r).some(n => /Lamina Eterboard/.test(n)), '(2b) …y sí devuelve las láminas', JSON.stringify(nombres(r)));
r = relevantes('media cana pvc', CON_MEDIA);
ok(nombres(r).some(n => /Media Cana/.test(n)),
   '(2b) pero "media caña" sigue saliendo: caña SÍ es el producto', JSON.stringify(nombres(r)));

// ── 2c) lo que casa MÁS palabras va primero (la lista viaja entera al modelo) ─────────────────
r = relevantes('lamina fibrocemento', LISTA);
ok(/Lamina Eterboard/.test(r[0].item_name),
   '(2c) "lámina fibrocemento" pone la LÁMINA primero, no la teja', JSON.stringify(nombres(r)));

// ── 2d) el vocabulario del cliente no es el del catálogo (medido contra la tienda) ───────────
// "tapacanto" devuelve 289 fichas en ardisa.com y TODAS se llaman "Canto PVC"/"Canto ABS": el
// buscador difuso sí las encuentra, quien las tiraba era este filtro. Igual con "baldosa" (son las
// cerámicas de piso) y "thinner" (el catálogo lo escribe "Thiner", con una sola N).
const CATALOGO = [
  { item_name:'Canto PVC Rehau Riviera 19x1.5mm',            atributos_publicados:{ mgs_brand:'Rehau' } },
  { item_name:'Ceramica Para Piso Brillante Hara 60X60',     atributos_publicados:{ material:'Ceramica' } },
  { item_name:'Thiner Galon',                                atributos_publicados:{ mgs_brand:'Pintuco' } },
  { item_name:'Sanitario Montecarlo Alongado Negro Mate',    atributos_publicados:{ marca:'Corona' } },
  { item_name:'MDF Duratex 183X244X15',                      atributos_publicados:{ espesor:'15 mm' } },
  { item_name:'Perfil Manija Toledo Spar 18Mm/15Mm',         atributos_publicados:{ mgs_brand:'Spar' } },
];
const casos = [
  ['tapacanto',          /Canto PVC/,        'tapacanto → Canto PVC'],
  ['baldosa para piso',  /Ceramica Para/,    'baldosa → Cerámica para piso'],
  ['thinner',            /Thiner/,           'thinner → "Thiner" (el catálogo lo escribe con una N)'],
  ['sanitario elongado', /Alongado/,         'elongado → Alongado'],
];
casos.forEach(function (c) {
  const res = relevantes(c[0], CATALOGO);
  ok(nombres(res).some(n => c[1].test(n)), '(2d) ' + c[2], JSON.stringify(nombres(res)));
});

// ── 2e) las siglas del oficio tienen 3 letras y no pueden quedar fuera ────────────────────────
// Antes: con menos de 4 letras el filtro se quedaba SIN raíces y devolvía la lista ENTERA sin
// filtrar — en una consulta de siglas el filtro no existía. Y con "mdf 15mm" se quedaba solo con
// 15MM, dejando pasar un perfil de manija y tirando todos los MDF.
r = relevantes('mdf', CATALOGO);
ok(nombres(r).some(n => /MDF Duratex/.test(n)), '(2e) "mdf" encuentra los MDF', JSON.stringify(nombres(r)));
ok(!nombres(r).some(n => /Thiner|Sanitario/.test(n)),
   '(2e) …y sí FILTRA (antes pasaba la lista entera sin mirar)', JSON.stringify(nombres(r)));
r = relevantes('mdf 15mm', CATALOGO);
ok(nombres(r).some(n => /MDF Duratex/.test(n)),
   '(2e) "mdf 15mm" no pierde el MDF por culpa de la medida', JSON.stringify(nombres(r)));
// la sigla exige la palabra COMPLETA: un prefijo de 3 letras engancharía media tienda
r = relevantes('pis', [{ item_name:'Pistola Para Silicona', atributos_publicados:{} },
                       { item_name:'Piso Exterior Selci 60X60', atributos_publicados:{} }]);
ok(r.length === 0, '(2e) una sigla no casa por prefijo: "pis" no devuelve Pistola ni Piso',
   JSON.stringify(nombres(r)));

// ── 3) el buscador pide 20 y NO recorta a 10 ─────────────────────────────────────────────────
ok(/pageSize:20/.test(TIENDA), '(3) la búsqueda pide 20 resultados, no 10',
   (TIENDA.match(/pageSize:\d+/g) || []).join(' '));
ok(!/_relevantes\(_q, _its\)\.slice\(0,\s*10\)/.test(TIENDA),
   '(3) …y lo filtrado NO se vuelve a cortar a 10 (las láminas salen del puesto 11)');

// ── 4) el precio de la consulta individual queda guardado para que el código pueda verificar ──
ok(/precio_articulo[\s\S]{0,4000}cotDatos/.test(TIENDA),
   '(4) precio_articulo/disponibilidad también alimentan store.cotDatos');
ok(/pre:Number\(_o\.precio_con_iva\)\|\|Number\(_prev\.pre\)\|\|0/.test(TIENDA),
   '(4) …y se FUNDE con lo anterior: la 2ª llamada no borra el precio que trajo la 1ª');

// ── 5) CERO resultados nunca es "no lo manejamos" (regla para salir en vivo) ──────────────────
// La tienda publica ~3.400 productos de un catálogo mucho mayor: medido hoy, "disco" y "pulidora"
// devuelven CERO en la web, y esta semana un cliente pidió justo un disco. Decirle que no manejamos
// discos es falso y obliga al asesor a desdecirnos delante de él.
// Se miran solo las CADENAS que viajan al modelo, con los comentarios fuera. Si no, la prueba se
// detecta a sí misma: el comentario que explica el arreglo cita el texto viejo entre comillas, así que
// buscarlo en el archivo entero encuentra la explicación y grita que el error sigue ahí. Es el mismo
// pecado de la alerta que se auto-alertaba (caso 5 del cuaderno) y volvió a aparecer aquí.
// Y además se unen las cadenas partidas: en el nodo el mensaje se escribe en varios trozos
//     …esto es lo ÚNICO que puedes decir: que no lo tenemos '
//   + 'PUBLICADO EN LA TIENDA EN LÍNEA…
// así que buscar la frase entera en el archivo no la encuentra aunque el modelo sí la reciba entera.
// Se borra la costura ('+') para leer el texto como lo va a leer el modelo, no como está escrito.
const SIN_COMENT = TIENDA.replace(/^[ \t]*\/\/.*$/gm, '').replace(/'\s*\+\s*'/g, '');
const txtCero = extraer(SIN_COMENT, 'if(!_its.length)') || '';
ok(!!txtCero, '(5) se encuentra el bloque de cero resultados');
ok(/no lo tenemos PUBLICADO/i.test(txtCero),
   '(5) el bot solo puede decir que no está PUBLICADO', txtCero.slice(0, 220));
ok(/PROHIBIDO[\s\S]{0,200}no lo manejamos/.test(txtCero),
   '(5) …y tiene prohibido decir "no lo manejamos"', txtCero.slice(0, 320));
ok(!/dile con naturalidad que esa referencia no la manejamos/.test(SIN_COMENT),
   '(5) la instrucción vieja ya no viaja al modelo');

if (fallos) { console.log('test_busca_por_atributo: ' + fallos + ' FALLAS'); process.exit(1); }
console.log('test_busca_por_atributo: TODAS PASAN');
