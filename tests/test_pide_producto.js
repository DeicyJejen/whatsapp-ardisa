// Decision de Deicy 04/08: "cuando escriben asesoria deben preguntarle QUE asesoria".
//
// El boton de WhatsApp de ardisa.com manda SIEMPRE el mismo texto, sin importar la seccion:
//   https://api.whatsapp.com/send?phone=573167459958&text=Hola!%20Estoy%20buscando%20asesoria
// Son 51 clientes desde el 16-jul, el primer mensaje mas frecuente de todos. Como no dice QUE
// necesita, el bot terminaba preguntando "¿Ardisa o Carpincentro?" -nombres internos que un
// cliente final no conoce- y elegia a ciegas. Caso Claudia Ardila (lead #218).
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
const cuerpo = (r) => JSON.stringify(r.wpp_body || '');
const menuMarca = (r) => /Ardisa\*? o \*?Carpincentro|elige la línea que necesitas|Con cuál te ayudamos/i.test(cuerpo(r));

// Lo que devuelve la IA para "estoy buscando asesoria": es una compra, pero sin producto ni linea.
const IA_VAGA   = { en_alcance:true, marca:'', grupo_pista:'', productos:[], confianza:'baja',
                    es_info:false, es_reclamo:false };
const IA_CERAM  = { en_alcance:true, marca:'Ardisa', grupo_pista:'ACABADOS', productos:['cerámica 60x60'],
                    confianza:'alta', es_info:false, es_reclamo:false };
const IA_TABLERO= { en_alcance:true, marca:'Carpincentro', grupo_pista:'', productos:['tablero MDF 18mm'],
                    confianza:'alta', es_info:false, es_reclamo:false };

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det||''))); };

// ══ EL TEXTO DE LA WEB ══════════════════════════════════════════════════════════
{
  const sd = base();
  correr({ datos: ev({ texto:'Hola! Estoy buscando asesoría', ia:IA_VAGA }), sd, pend:{ cons_si:0 } });
  const r = correr({ datos: SI, sd, pend:{ cons_si:0 } });
  chequear('NO le pregunta "¿Ardisa o Carpincentro?"', !menuMarca(r), cuerpo(r).slice(0,150));
  chequear('Le pregunta QUÉ necesita', /qué necesitas/i.test(cuerpo(r)), cuerpo(r).slice(0,150));
  chequear('Y le da ejemplos concretos', /cemento|cerámica|tableros/i.test(cuerpo(r)), cuerpo(r).slice(0,180));

  // Responde con un producto -> el bot identifica y sigue, sin más preguntas
  const r2 = correr({ datos: ev({ texto:'cerámica de 60x60 para el piso', ia:IA_CERAM }), sd, pend:{ cons_si:0 } });
  chequear('Con la respuesta identifica la línea sola', (sd.ses[WA]||{}).marca === 'Ardisa',
           'marca=' + (sd.ses[WA]||{}).marca);
  chequear('Y no le vuelve a preguntar la línea', !menuMarca(r2), cuerpo(r2).slice(0,140));
}
{
  const sd = base();
  correr({ datos: ev({ texto:'Hola! Estoy buscando asesoría', ia:IA_VAGA }), sd, pend:{ cons_si:0 } });
  correr({ datos: SI, sd, pend:{ cons_si:0 } });
  const r = correr({ datos: ev({ texto:'tablero MDF de 18mm', ia:IA_TABLERO }), sd, pend:{ cons_si:0 } });
  chequear('Si responde tableros -> Carpincentro', (sd.ses[WA]||{}).marca === 'Carpincentro',
           'marca=' + (sd.ses[WA]||{}).marca);
}

// ══ ÚLTIMO RECURSO: si tampoco así se entiende, ahí sí el menú ══════════════════
{
  const sd = base();
  correr({ datos: ev({ texto:'Hola! Estoy buscando asesoría', ia:IA_VAGA }), sd, pend:{ cons_si:0 } });
  const r1 = correr({ datos: SI, sd, pend:{ cons_si:0 } });
  chequear('(primero pregunta qué necesita)', /qué necesitas/i.test(cuerpo(r1)), cuerpo(r1).slice(0,120));
  const r2 = correr({ datos: ev({ texto:'no sé, algo', ia:IA_VAGA }), sd, pend:{ cons_si:0 } });
  chequear('Si sigue sin entenderse, AHÍ SÍ muestra el menú de líneas', menuMarca(r2), cuerpo(r2).slice(0,150));
  chequear('Y no se queda preguntando lo mismo en bucle', (sd.ses[WA]||{}).pidioProd === 1,
           'pidioProd=' + (sd.ses[WA]||{}).pidioProd);
}

// ══ NEGATIVOS: quien SÍ dijo qué necesita no ve ninguna pregunta de más ═════════
{
  const sd = base();
  correr({ datos: ev({ texto:'Buenas, necesito cerámica de 60x60', ia:IA_CERAM }), sd, pend:{ cons_si:0 } });
  const r = correr({ datos: SI, sd, pend:{ cons_si:0 } });
  chequear('Quien ya dijo qué necesita NO recibe la pregunta',
           !/qué necesitas/i.test(cuerpo(r)) && !menuMarca(r), cuerpo(r).slice(0,140));
  chequear('Va directo a pedirle el nombre', /nombre/i.test(cuerpo(r)), cuerpo(r).slice(0,140));
}
{
  // Sin IA (si Anthropic se cae) el flujo de siempre no cambia: menú de marcas
  const sd = base();
  correr({ datos: ev({ texto:'Hola' }), sd, pend:{ cons_si:0 } });
  const r = correr({ datos: SI, sd, pend:{ cons_si:0 } });
  chequear('Un "hola" pelado sigue viendo el menú (no hay nada que interpretar)', menuMarca(r),
           cuerpo(r).slice(0,140));
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
