// Caso REAL EN VIVO: 11-ago 10:52, cliente 573103052333.
//   Bot:     "👤 ¡Perfecto! Para empezar, ¿cuál es tu nombre y apellido?"
//   Cliente: "Mucho gusto mi nombre es Paola Infante de la empresa Aqstica"
//   Bot:     "👤 Para asignarte el asesor correcto, ¿nos confirmas tu nombre y apellido?"   ← otra vez
// Tuvo que repetirlo 3 minutos despues. Asi se pierden clientes.
//
// Dos fallas: "mucho gusto" no estaba entre las cortesias (y el patron esta anclado con ^, asi que no se
// quitaba NADA), y nadie recortaba la COLA ("de la empresa Aqstica"). Con la frase entera, 58 caracteres,
// el validador la rechazaba por larga.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{type:'tool_use', input: datos.ia}] } : {}) :
      (pend || {}) }) });
  return new Function('$','$getWorkflowStaticData','$env', CEREBRO)($, () => sd, new Proxy({},{get:()=>''}))[0].json;
}
const WA = '573103052333';
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, ses:{}, cliMsgs:{}, win:{} });
const ev = (o) => Object.assign({ wa_id:WA, profileName:'', texto:'', mtype:'', media_id:'',
                                  opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);
// Deja la sesion pidiendo el NOMBRE, como estaba Paola.
const pidiendoNombre = (sd) => { sd.ses[WA] = { paso:'nombre', t:Date.now(), consent:true, marca:'Ardisa' }; return sd; };

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det||''))); };

// ══ El mensaje exacto de Paola ═════════════════════════════════════════════════
{
  const sd = pidiendoNombre(base());
  const r = correr({ datos: ev({ texto:'Mucho gusto mi nombre es Paola Infante de la empresa Aqstica' }), sd, pend:{} });
  const st = sd.ses[WA] || {};
  chequear('NO le vuelve a preguntar el nombre', r.etapa !== 'nombre',
           'etapa=' + r.etapa + ' ' + JSON.stringify(r.wpp_body||'').slice(0,110));
  chequear('Lo guarda como "Paola Infante"', st.nombre === 'Paola Infante', 'nombre=' + JSON.stringify(st.nombre));
  chequear('Y avanza a la ciudad', st.paso === 'ciudad', 'paso=' + st.paso);
}

// ══ Todas las formas en que la gente se presenta de verdad ═════════════════════
const CASOS = [
  ['Mucho gusto mi nombre es Paola Infante de la empresa Aqstica', 'Paola Infante'],
  ['Buenos días, habla Paola Infante',                             'Paola Infante'],
  ['mi nombre es juan carlos gómez',                               'Juan Carlos Gómez'],
  ['Me llamo Sandra Calderón, de la constructora Riar',            'Sandra Calderón'],
  ['Soy Óscar Alarcón',                                            'Óscar Alarcón'],
  ['Hola, Alfonso Crismatt',                                       'Alfonso Crismatt'],
  ['Paola Infante - compras',                                      'Paola Infante'],
  ['Yaneth Becerra, Aqstica',                                      'Yaneth Becerra'],
  ['Mi nombre es Paola Infante y necesito cotizar 20 láminas',     'Paola Infante'],
  ['Deivy Tirado',                                                 'Deivy Tirado'],
  ['Juan de la Cruz',                                              'Juan De La Cruz'],   // apellido con "de": NO se recorta
];
for (const [entrada, esperado] of CASOS) {
  const sd = pidiendoNombre(base());
  const r = correr({ datos: ev({ texto: entrada }), sd, pend:{} });
  const st = sd.ses[WA] || {};
  chequear('"' + entrada.slice(0,46) + '" → ' + esperado,
           st.nombre === esperado && r.etapa !== 'nombre',
           'quedó=' + JSON.stringify(st.nombre) + ' etapa=' + r.etapa);
}

// ══ Textos REALES que el bot rebotó (44 rebotes a 28 clientes desde el 15-jul) ═
// Estos 6 eran nombres de verdad y ahora se entienden. El resto de los 44 son productos, ciudades y
// solicitudes: esos SIGUEN preguntando, que es lo correcto (ver la lista de abajo).
const REBOTES_REALES = [
  ['Yuly Quiñones necesito una cocina empotrable',        'Yuly Quiñones'],
  ['Yaneth Becerra. Quiero geotextil',                    'Yaneth Becerra'],
  ['Le escribe Zandra Correa profesional de la Contraloría', 'Zandra Correa'],
  ['Luis Carrasquilla quisiera validar un material en rh','Luis Carrasquilla'],
  ['Diana María López Martínez CC. 29676424',             'Diana María López Martínez'],
];
for (const [entrada, esperado] of REBOTES_REALES) {
  const sd = pidiendoNombre(base());
  const r = correr({ datos: ev({ texto: entrada }), sd, pend:{} });
  chequear('REAL: "' + entrada.slice(0,42) + '" → ' + esperado,
           (sd.ses[WA]||{}).nombre === esperado && r.etapa !== 'nombre',
           'quedó=' + JSON.stringify((sd.ses[WA]||{}).nombre) + ' etapa=' + r.etapa);
}

// ══ Guardas: lo que NO se puede romper ═════════════════════════════════════════
// Aceptar basura como nombre es PEOR que volver a preguntar: le deja al asesor un cliente llamado
// "Cototizar Bultos". Todos estos salieron de los rebotes reales y deben seguir preguntando.
const NO_SON_NOMBRE = [
  'necesito cototizar 100 bultos de cemnto',
  'Manejas de este tipo de yeso',
  'Caucho para doblar  tubos eléctricos de ½',
  'Aun no se bien, me podrías asesorar económico',
  'queiro comrpar estas compras ero no me esta dejando',
  'Buenas tardes, manejan tapacanto ámbar de 70 cm de ancho',
  'Calle 29 # 13-65 barrio Girardot',
  'Q sedes hay en el centro?',
  'Melamina rh de color beige o tonos similares',
  'Buen día',
  'necesito cotizar 20 láminas de MDF',      // una solicitud
  'Bucaramanga',                             // una ciudad
  '🟢 Ardisa',                                // una etiqueta del menú
  'Otra ciudad',
  '3105551234',                              // un teléfono
  'prueba',
];
for (const entrada of NO_SON_NOMBRE) {
  const sd = pidiendoNombre(base());
  const r = correr({ datos: ev({ texto: entrada }), sd, pend:{} });
  const st = sd.ses[WA] || {};
  chequear('GUARDA: "' + entrada.slice(0,30) + '" NO se acepta como nombre',
           !st.nombre && r.etapa === 'nombre', 'quedó=' + JSON.stringify(st.nombre) + ' etapa=' + r.etapa);
}
{
  // Lo que pidió DE MÁS mientras se presentaba tampoco se pierde (arreglo del mismo día).
  const sd = pidiendoNombre(base());
  correr({ datos: ev({ texto:'Mi nombre es Paola Infante y necesito cotizar 20 láminas de MDF' }), sd, pend:{} });
  chequear('La solicitud que metió en la presentación queda guardada',
           /mdf/i.test(JSON.stringify(sd.ses[WA]||{})), JSON.stringify(sd.ses[WA]||{}).slice(0,220));
}

console.log('\n' + ok + '/' + total + ' aserciones OK');
process.exit(ok === total ? 0 : 1);
