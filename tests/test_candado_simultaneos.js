// CANDADO POR CLIENTE (2026-08-18, pedido de Deicy tras el análisis de 8 días).
//
// Meta manda un webhook POR MENSAJE y n8n los corre en paralelo. Cuando alguien escribe dos veces seguidas
// —28 de 64 personas lo hicieron esta semana— las dos ejecuciones leen el MISMO pasado: cada una responde
// por su lado y la segunda pisa la sesión de la primera. Pasó con Claudia Parra (#224, el aviso salió con
// "tiner" a secas) y con Ilba, que recibió tres veces el mismo "ya se lo pasamos".
//
// El árbitro NO puede ser staticData —es justo lo que llega tarde—, así que es la BD: una tabla `bloqueos`
// con el teléfono como clave primaria. Gana el primero que inserte; los demás leen `lock_dueno` y ven que
// no es suyo. El nodo 'Tomar candado (MySQL)' hace el INSERT; aquí solo se lee el resultado.
//
// Dos cosas que el candado NO puede hacer: perder lo que el cliente escribió (se guarda igual) ni callar
// un botón (ahí está contestando la pregunta en curso).
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
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, prov:{}, esCli:{}, muro:{}, ses:{},
                      info:{}, cliMsgs:{} });
const sesion = () => ({ paso:'detalle', t:Date.now(), consent:true, nombre:'Claudia Parra', ciudad:'Bucaramanga',
  ciudadId:'BUCARAMANGA', marca:'Ardisa', grupo:'ACABADOS', interes:'Acabados', ocupacion:'🏠 Cliente final' });
const ev = (o) => Object.assign({ wa_id:WA, profileName:'Claudia', texto:'', mtype:'', media_id:'',
                                  msg_id:'wamid.MIO', opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);
// PEND simula lo que devuelve la consulta: de quién es el candado en este instante
const CFG = (dueno) => ({ cons_si:1, pend_id:0, lock_dueno:dueno });

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det||''))); };

// ══ 1. El mensaje que GANA el candado trabaja como siempre ══
{
  const sd = base(); sd.ses[WA] = sesion();
  const r = correr({ datos: ev({ texto:'necesito 2 galones de tiner', msg_id:'wamid.MIO' }), sd, pend: CFG('wamid.MIO') });
  chequear('El dueño del candado responde normal', r.etapa !== 'carrera_acumula' && !!r.wpp_body, 'etapa=' + r.etapa);
}

// ══ 2. El que llega 200 ms después NO contesta — pero su texto queda ══
{
  const sd = base(); sd.ses[WA] = sesion();
  const r = correr({ datos: ev({ texto:'y también 3 brochas', msg_id:'wamid.SEGUNDO' }), sd, pend: CFG('wamid.PRIMERO') });
  chequear('El segundo mensaje simultáneo NO responde (no contradice al primero)',
           r.etapa === 'carrera_acumula' && !r.wpp_body, 'etapa=' + r.etapa + ' body=' + JSON.stringify(r.wpp_body));
  chequear('Pero lo que escribió SÍ queda guardado para el asesor',
           /3 brochas/.test(JSON.stringify(sd.ses[WA]||{})) || /3 brochas/.test(JSON.stringify(sd.cliMsgs||{})),
           JSON.stringify(sd.cliMsgs||{}).slice(0,160));
  chequear('Y queda registrado en el chat, para poder auditarlo después',
           !!r.chat && r.chat.etapa === 'carrera_acumula' && /3 brochas/.test(r.chat.entrada), JSON.stringify(r.chat).slice(0,180));
  chequear('No crea lead ni avisa a nadie por duplicado',
           !r.lead && !r.hay_aviso && !r.pend_cierre, JSON.stringify({lead:!!r.lead, aviso:r.hay_aviso}));
}

// ══ 3. Un BOTÓN siempre se procesa: ahí está contestando la pregunta en curso ══
{
  const sd = base(); sd.ses[WA] = Object.assign(sesion(), { paso:'ciudad' });
  const r = correr({ datos: ev({ opcion_id:'BUCARAMANGA', opcion_txt:'Bucaramanga', texto:'Bucaramanga',
                                 msg_id:'wamid.SEGUNDO' }), sd, pend: CFG('wamid.PRIMERO') });
  chequear('Con el candado ajeno, un botón IGUAL avanza el formulario',
           r.etapa !== 'carrera_acumula', 'etapa=' + r.etapa);
}

// ══ 4. Una foto también se procesa (su camino ya tiene su propio freno de 25 s) ══
{
  const sd = base(); sd.ses[WA] = sesion();
  const r = correr({ datos: ev({ es_media:true, mtype:'image', media_id:'777', msg_id:'wamid.SEGUNDO' }),
                     sd, pend: CFG('wamid.PRIMERO') });
  chequear('Una foto no se calla por el candado', r.etapa !== 'carrera_acumula', 'etapa=' + r.etapa);
}

// ══ 5. Sin candado en la BD (tabla caída, o primer mensaje) todo sigue como antes ══
{
  const sd = base(); sd.ses[WA] = sesion();
  const r = correr({ datos: ev({ texto:'necesito tiner', msg_id:'wamid.MIO' }), sd, pend: { cons_si:1, pend_id:0 } });
  chequear('Si la BD no devuelve candado, el bot responde igual (no se bloquea solo)',
           r.etapa !== 'carrera_acumula' && !!r.wpp_body, 'etapa=' + r.etapa);
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
