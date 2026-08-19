// PRUEBA: el aviso de datos sale UNA VEZ AL DÍA — también al cliente que vuelve — y queda en el monitor.
//
// Pedido de Deicy (2026-08-19): "no le está saliendo el mensaje de habeas data (…) cuando el cliente vuelve
// otro día hay que darle todas las opciones (…) pero en el monitor tampoco está quedando".
// Dos reglas distintas que antes se confundían:
//   · la AUTORIZACIÓN no caduca (10-ago): al que ya autorizó NUNCA se le vuelve a pedir con botones;
//   · el AVISO sí se le vuelve a MOSTRAR cada día que escribe — es la conducta inequívoca del Decreto 1377.
// Y si en su mensaje ya dice qué necesita, se le sigue ahorrando el menú de Ardisa/Carpincentro.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{ type:'tool_use', input: datos.ia }] } : {}) :
      (pend || {}) }) });
  return new Function('$', '$getWorkflowStaticData', '$env', CEREBRO)($, () => sd, new Proxy({}, { get: () => '' }))[0].json;
}
const WA = '573009998877';
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, muro:{}, ses:{},
                      info:{}, cliMsgs:{}, prov:{}, esCli:{}, avisoDatos:{} });
const ev = (o) => Object.assign({ wa_id:WA, profileName:'Cliente', texto:'', mtype:'', media_id:'',
                                  opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);
// el aviso implícito vive en la BD (config.consent_implicito): aquí se enciende como en producción
const IMPL = (o) => Object.assign({ cfg_consent_impl:'si' }, o);
const IA_MELAMINA = { en_alcance:true, marca:'Carpincentro', grupo_pista:'', productos:['melamina rh'],
                      confianza:'alta', es_info:false, es_reclamo:false };
const pre  = (r) => (r.wpp_pre && r.wpp_pre.text && r.wpp_pre.text.body) || '';
const body = (r) => (r.wpp_body && (r.wpp_body.text ? r.wpp_body.text.body
                    : (r.wpp_body.interactive && r.wpp_body.interactive.body && r.wpp_body.interactive.body.text))) || '';
const menuMarca = (r) => /🟢 \*?ARDISA/i.test(body(r)) && /🟡 \*?CARPINCENTRO/i.test(body(r));

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det || ''))); };

// ══ 1. CLIENTE QUE VUELVE OTRO DÍA (ya autorizó antes; hoy todavía no vio el aviso) ══
{
  const sd = base();
  const r = correr({ datos: ev({ texto:'Buenos días' }), sd, pend: IMPL({ cons_si:1, cons_hoy:0 }) });
  chequear('Le vuelve a salir el aviso de datos', /tratamiento de tus datos personales/i.test(pre(r)), pre(r).slice(0,90));
  chequear('Con la política', /politica-de-datos|política/i.test(pre(r)), pre(r).slice(-80));
  chequear('NO se le vuelve a pedir la autorización con botones', r.etapa !== 'consent', 'etapa=' + r.etapa);
  chequear('Y sí le da todas las opciones (menú de líneas)', menuMarca(r), body(r).slice(0,90));
  chequear('El saludo no sale dos veces', !/^¡Buen|^¡Hola/.test(body(r)), body(r).slice(0,60));
  chequear('Queda la evidencia del día', !!r.consent_log && r.consent_log.decision === 'SI'
           && r.consent_log.canal === 'wa-implicito', JSON.stringify(r.consent_log));
  chequear('Y EN EL MONITOR queda el aviso + el mensaje',
           /tratamiento de tus datos/i.test((r.chat || {}).salida || ''), ((r.chat||{}).salida||'').slice(0,80));
}

// ══ 2. EL MISMO DÍA, MÁS TARDE: el aviso no se repite ═══════════════════════════
{
  const sd = base();
  const r = correr({ datos: ev({ texto:'Buenos días' }), sd, pend: IMPL({ cons_si:1, cons_hoy:1 }) });
  chequear('Si HOY ya lo vio, no se repite', !r.wpp_pre, pre(r).slice(0,60));
  chequear('Y no se registra otra vez el consentimiento', !r.consent_log, JSON.stringify(r.consent_log));
}

// ══ 3. VUELVE Y YA DICE QUÉ NECESITA: aviso sí, menú de marcas no ══════════════
{
  const sd = base();
  const r = correr({ datos: ev({ texto:'necesito melamina rh', ia:IA_MELAMINA }), sd, pend: IMPL({ cons_si:1, cons_hoy:0 }) });
  chequear('Sale el aviso', /tratamiento de tus datos personales/i.test(pre(r)), pre(r).slice(0,70));
  chequear('Pero NO le pregunta Ardisa o Carpincentro (la IA ya sabe la línea)', !menuMarca(r), body(r).slice(0,90));
  chequear('Y en el monitor queda el aviso', /tratamiento de tus datos/i.test((r.chat || {}).salida || ''),
           ((r.chat||{}).salida||'').slice(0,80));
}

// ══ 4. QUIEN REVOCÓ NO RECIBE NADA COMO SI HUBIERA AUTORIZADO ══════════════════
{
  const sd = base();
  const r = correr({ datos: ev({ texto:'no autorizo' }), sd, pend: IMPL({ cons_si:0, cons_hoy:0 }) });
  chequear('La negativa expresa se respeta', r.etapa === 'noconsent' && r.consent_log && r.consent_log.decision === 'NO',
           'etapa=' + r.etapa + ' ' + JSON.stringify(r.consent_log));
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
