// Caso REAL: Alfonso Crismatt (573234358740, lead #261), 10-ago 16:12.
// Cerro su solicitud a las 15:28 (melamina RH beige, Carpincentro San Roque -> Karime Vannesa) y a las 16:12
// escribio: "Amigo la asesora nunca me escribio".
//
// Lo que hizo el bot: la IA lo marco es_reclamo=true, la rama de PQRS le gano a todas las demas y le respondio
// con el WhatsApp y el correo de Servicio al Cliente. A Karime NO le llego nada.
// Dos fallas encadenadas, ademas de la de arriba:
//   · "la ASESORA nunca me escribio" contiene "asesora" -> tambien caia en la rama de "quiero un asesor".
//   · la lista de frases de espera vivia DUPLICADA en dos sitios y a ninguno le cabia "nunca me escribio",
//     asi que aunque hubiera llegado a la rama correcta, el recordatorio a la asesora no salia.
//
// Regla de Deicy (11-ago): "ahi le toca responderle que ya le recuerda a la asesora para que se comunique
// y le de prioridad".
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{type:'tool_use', input: datos.ia}] } : {}) :
      (pend || {}) }) });
  return new Function('$','$getWorkflowStaticData','$env', CEREBRO)($, () => sd, new Proxy({},{get:()=>''}))[0].json;
}
const WA = '573234358740';
const ASE = '573174293535';                                   // Karime Vannesa
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, ses:{} });
// Sesion tal como quedo tras cerrar: solicitud entregada a Karime.
const cerrada = (sd) => { sd.ses[WA] = { paso:'cerrado', t:Date.now()-40*60*1000, closedAt:Date.now()-40*60*1000,
  nombre:'Alfonso Crismatt', ciudad:'Barranquilla', ciudadId:'BAQ', marca:'Carpincentro',
  asesorNom:'Karime Vannesa', asesorF:1, asesorNum:ASE, destino:ASE, detalle:'Melamina RH color beige' }; return sd; };
const msg = (t, ia) => ({ wa_id:WA, profileName:'Alfonso Crismatt', texto:t, mtype:'', media_id:'',
                          opcion_id:'', opcion_txt:'', es_media:false, ia:ia||null });
const cuerpo = (r) => JSON.stringify(r.wpp_body || '');
const aviso  = (r) => JSON.stringify(r.aviso_body || '');

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det||''))); };

const IA_RECLAMO = { en_alcance:false, es_reclamo:true, es_info:false, pide_humano:false, confianza:'alta', productos:[] };

// ══ El mensaje exacto que escribio ═════════════════════════════════════════════
{
  const sd = cerrada(base());
  const r = correr({ datos: msg('Amigo la asesora nunca me escribió', IA_RECLAMO), sd, pend:{} });
  chequear('NO lo manda a Servicio al Cliente (no es un PQRS)',
           !/ayuda@ardisa|3176643045|Servicio al Cliente/i.test(cuerpo(r)) && r.etapa !== 'reclamo',
           'etapa=' + r.etapa + ' ' + cuerpo(r).slice(0,140));
  chequear('Le responde que ya le recordaron a SU asesora',
           /recordamos/i.test(cuerpo(r)) && /Karime/.test(cuerpo(r)), cuerpo(r).slice(0,200));
  chequear('Y que queda priorizado', /prioriz/i.test(cuerpo(r)), cuerpo(r).slice(0,200));
  chequear('El recordatorio SALE de verdad hacia Karime (no es una promesa vacia)',
           !!r.aviso_body && aviso(r).includes(ASE) && /insiste|Recordatorio/i.test(aviso(r)),
           'aviso=' + aviso(r).slice(0,160));
  chequear('No le cuenta el problema interno ni lo hace repetir el flujo',
           !/disculpa|lo sentimos|error|falla/i.test(cuerpo(r)) && !/nombre y apellido|¿en qué \*ciudad\*/i.test(cuerpo(r)),
           cuerpo(r).slice(0,160));
  chequear('No lo trata como si pidiera un asesor nuevo', r.etapa !== 'marca' && r.etapa !== 'ciudad', 'etapa=' + r.etapa);
}

// ══ Otras formas de decir lo mismo ═════════════════════════════════════════════
for (const frase of ['nunca me contactaron', 'no me han llamado', 'sigo esperando la cotización',
                     'nadie me ha respondido', 'aún no me escriben']) {
  const sd = cerrada(base());
  const r = correr({ datos: msg(frase, IA_RECLAMO), sd, pend:{} });
  chequear('"' + frase + '" -> recordatorio a la asesora',
           !!r.aviso_body && /recordamos/i.test(cuerpo(r)), 'etapa=' + r.etapa + ' ' + cuerpo(r).slice(0,90));
}

// ══ Guardas: lo que NO se puede romper ═════════════════════════════════════════
{
  // Un PQRS de verdad (producto dañado) SIGUE yendo a Servicio al Cliente.
  const sd = cerrada(base());
  const r = correr({ datos: msg('El producto llegó dañado, quiero una devolución', IA_RECLAMO), sd, pend:{} });
  chequear('GUARDA: el reclamo real sigue yendo a Servicio al Cliente', r.etapa === 'reclamo', 'etapa=' + r.etapa);
}
{
  // Quien SI pide un asesor (sin haber esperado) sigue yendo por su rama.
  const sd = cerrada(base());
  const IA_NADA = { en_alcance:false, es_reclamo:false, es_info:false, pide_humano:true, confianza:'alta', productos:[] };
  const r = correr({ datos: msg('quiero hablar con un asesor', IA_NADA), sd, pend:{} });
  chequear('GUARDA: "quiero hablar con un asesor" no se confunde con esperar', !/recordamos/i.test(cuerpo(r)),
           'etapa=' + r.etapa + ' ' + cuerpo(r).slice(0,90));
}
{
  // A MITAD del flujo no se desvia: la queja no puede colarse como si fuera el nombre.
  const sd = base();
  sd.ses[WA] = { paso:'nombre', t:Date.now(), consent:true, marca:'Carpincentro' };
  const r = correr({ datos: msg('no me han llamado', IA_RECLAMO), sd, pend:{} });
  chequear('GUARDA: a mitad del flujo NO se toma la queja como el nombre',
           (sd.ses[WA]||{}).nombre !== 'no me han llamado', 'nombre=' + JSON.stringify((sd.ses[WA]||{}).nombre));
}
{
  // Sin asesor conocido, "no me han contestado" SI es un reclamo -> Servicio al Cliente.
  const sd = base();
  sd.ses[WA] = { paso:'cerrado', t:Date.now(), closedAt:Date.now()-60000, nombre:'Alfonso Crismatt' };
  const r = correr({ datos: msg('no me han contestado', IA_RECLAMO), sd, pend:{} });
  chequear('GUARDA: sin asesor conocido sigue siendo reclamo', r.etapa === 'reclamo', 'etapa=' + r.etapa);
}
{
  // Un "gracias" tras cerrar sigue siendo cortesia (no dispara recordatorios).
  const sd = cerrada(base());
  const IA_NADA = { en_alcance:false, es_reclamo:false, es_info:false, pide_humano:false, confianza:'alta', productos:[] };
  const r = correr({ datos: msg('Gracias', IA_NADA), sd, pend:{} });
  chequear('GUARDA: "Gracias" sigue siendo cortesia', r.etapa === 'cortesia' && !r.aviso_body, 'etapa=' + r.etapa);
}

console.log('\n' + ok + '/' + total + ' aserciones OK');
process.exit(ok === total ? 0 : 1);
