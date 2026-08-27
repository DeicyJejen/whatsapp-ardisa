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

if (fallos) { console.log('test_busca_por_atributo: ' + fallos + ' FALLAS'); process.exit(1); }
console.log('test_busca_por_atributo: TODAS PASAN');
