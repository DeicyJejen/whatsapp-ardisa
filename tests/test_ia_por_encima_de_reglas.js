// Decision de Deicy 04/08: "dale mas permisos a la IA, las reglas que tiene la estan dejando sin trabajar".
//
// En UN SOLO DIA, cuatro veces una regex decidio antes que la IA y se equivoco:
//   "buenos dias" · "buena tarde" · "cordial saludo" · "holis"
// Perseguir variantes de saludo una por una no termina nunca. Ahora MANDA LA IA y la regex queda
// de respaldo para cuando Anthropic no responde.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{type:'tool_use', input: datos.ia}] } : {}) :
      (pend || {}) }) });
  return new Function('$','$getWorkflowStaticData','$env', CEREBRO)($, () => sd, new Proxy({},{get:()=>''}))[0].json;
}
const WA = '573001112233';
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, muro:{}, ses:{} });
const ev = (o) => Object.assign({ wa_id:WA, profileName:'Cliente', texto:'', mtype:'', media_id:'',
                                  opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);
const SI = ev({ opcion_id:'CONSENT_SI', opcion_txt:'✅ Sí, autorizo' });

const IA_PROD  = (marca, grupo, prods, conf) => ({ en_alcance:true, marca, grupo_pista:grupo||'',
  productos:prods, confianza:conf||'alta', es_info:false, es_reclamo:false });
const IA_NADA  = { en_alcance:false, marca:'', grupo_pista:'', productos:[], confianza:'baja',
  es_info:false, es_reclamo:false };

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det||''))); };

// ══ 1. La IA gana a la regex cuando identifica producto ════════════════════════
// Un saludo raro que la regex NO conoce, pero con un pedido dentro. Antes se perdia el pedido.
for (const frase of ['Holaaaa buenas tardecitas, necesito cemento gris',
                     'Qué más pues, tienen fórmica blanca?',
                     'Buenas mi don, precio del tablero de 18mm']) {
  const sd = base();
  correr({ datos: ev({ texto:frase, ia:IA_PROD('Ardisa','CONSTRUCCION',['cemento gris']) }), sd, pend:{ cons_si:0 } });
  chequear('La IA rescata el pedido: "' + frase.slice(0,38) + '"', !!(sd.ses[WA]||{}).pendTexto,
           'se perdió el pedido');
}

// ══ 2. Y la regex frena a una IA demasiado entusiasta ══════════════════════════
// Si la IA marca en_alcance pero NO identifico producto y el texto es un saludo puro,
// no convertimos el saludo en la solicitud del cliente (caso Fundacion Mujer y Futuro, lead #221).
for (const saludo of ['Hola buena tarde', 'buenas tardes', 'cordial saludo']) {
  const sd = base();
  correr({ datos: ev({ texto:saludo, ia:{ en_alcance:true, marca:'', grupo_pista:'', productos:[],
                                          confianza:'baja', es_info:false, es_reclamo:false } }),
           sd, pend:{ cons_si:0 } });
  chequear('Saludo puro sigue siendo saludo: "' + saludo + '"', !(sd.ses[WA]||{}).pendTexto,
           'pendTexto=' + JSON.stringify((sd.ses[WA]||{}).pendTexto));
}

// ══ 3. SIN IA (Anthropic caído) la regex sigue haciendo su trabajo ═════════════
{
  const sd = base();
  correr({ datos: ev({ texto:'buenas tardes' }), sd, pend:{ cons_si:0 } });
  chequear('Sin IA: el saludo no tapa la solicitud', !(sd.ses[WA]||{}).pendTexto,
           'pendTexto=' + JSON.stringify((sd.ses[WA]||{}).pendTexto));
}
{
  const sd = base();
  correr({ datos: ev({ texto:'buenas tardes, necesito cemento' }), sd, pend:{ cons_si:0 } });
  chequear('Sin IA: el pedido SÍ se guarda', !!(sd.ses[WA]||{}).pendTexto, 'se perdió');
}

// ══ 4. Dos varas: llenar un hueco es más fácil que contradecir al cliente ══════
function alCerrar(sesion, texto, ia) {
  const sd = base();
  sd.ses[WA] = Object.assign({ paso:'detalle', t:Date.now(), consent:true, nombre:'Ana Gómez',
                               ciudad:'Bucaramanga', ciudadId:'BUCARAMANGA', ocupacion:'🏠 Cliente final' }, sesion);
  const r = correr({ datos: ev({ texto, ia }), sd, pend:{ cons_si:1 } });
  return { lead: (sd.pendCierre[WA]||{}).lead || r.lead || {}, r, sd };
}
{
  // HUECO: el cliente nunca eligió grupo -> con confianza MEDIA basta
  const { lead } = alCerrar({ marca:'Ardisa' }, 'necesito 20 bultos de cemento gris',
                            IA_PROD('Ardisa','CONSTRUCCION',['cemento gris'],'media'));
  chequear('Confianza MEDIA llena el hueco que nadie eligió', /Miguel|Yormy/i.test(lead.asesor||''),
           'asesor=' + lead.asesor);
}
{
  // 2026-08-19 (Deicy, caso Leidy López #323 devuelto por el asesor): "llegó mal a Ardisa y era de
  // Carpincentro". Antes, con confianza MEDIA se respetaba el botón del cliente aunque el texto fuera
  // claramente de carpintería. La regla de Deicy es la contraria y es la de siempre: "así la persona
  // coloque Acabados, si la descripción dice productos de carpintería, debe recepcionarlo bien".
  // Ahora la media también corrige — y el vocabulario es el que puede frenarla (ver el caso de abajo).
  const { lead, sd } = alCerrar({ marca:'Ardisa', grupo:'ACABADOS', interes:'Acabados' },
                                'tablero de madera de 15mm', IA_PROD('Carpincentro','',['tablero 15mm'],'media'));
  chequear('Confianza MEDIA + vocabulario de carpintería -> se corrige a Carpincentro',
           (lead.marca || (sd.ses[WA]||{}).marca) === 'Carpincentro',
           'marca=' + (lead.marca || (sd.ses[WA]||{}).marca));
}
{
  // El freno: si la IA (media) dice Carpincentro pero el cliente pidió algo de Ardisa, manda el vocabulario.
  const { lead, sd } = alCerrar({ marca:'Ardisa', grupo:'CONSTRUCCION', interes:'Construcción' },
                                'necesito 20 bultos de cemento gris', IA_PROD('Carpincentro','',['cemento'],'media'));
  chequear('Pero con media NO se lleva a Carpincentro a quien pidió cemento',
           (lead.marca || (sd.ses[WA]||{}).marca) === 'Ardisa',
           'marca=' + (lead.marca || (sd.ses[WA]||{}).marca));
}
{
  // CONTRADECIR con confianza ALTA -> sí manda la IA (caso Claudia Ardila)
  const { lead } = alCerrar({ marca:'Ardisa', grupo:'ACABADOS', interes:'Acabados' },
                            'Tiene lámina duratex de 18 mm?', IA_PROD('Carpincentro','',['lámina duratex 18mm'],'alta'));
  chequear('Confianza ALTA sí corrige la elección del cliente', lead.marca === 'Carpincentro',
           'marca=' + lead.marca);
}
{
  // Sin producto identificado no se toca nada, diga lo que diga la IA
  const { lead, sd } = alCerrar({ marca:'Ardisa', grupo:'ACABADOS', interes:'Acabados' },
    'necesito algo para la casa', { en_alcance:true, marca:'Carpincentro', grupo_pista:'', productos:[],
                                    confianza:'alta', es_info:false, es_reclamo:false });
  chequear('Sin producto identificado no se cambia nada',
           (lead.marca || (sd.ses[WA]||{}).marca) === 'Ardisa',
           'marca=' + (lead.marca || (sd.ses[WA]||{}).marca));
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
