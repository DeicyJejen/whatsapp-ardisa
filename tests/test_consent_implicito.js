// AVISO IMPLÍCITO DE DATOS (2026-08-15, decisión de Deicy con el modelo de UNIMINUTO a la vista).
//
// EL DATO QUE LO MOTIVA (30 días medidos en la BD): 277 clientes llegaron al muro, 253 autorizaron y solo
// 222 acabaron siendo lead. 24 se caían EN el muro y 31 más se cansaban en el formulario de después.
// Con el aviso implícito el saludo informa y la conversación SIGUE en el mismo mensaje: un paso menos.
//
// Base legal: la Ley 1581 pide autorización previa, expresa e informada; el Decreto 1377 art. 7 admite
// "conductas inequívocas del titular". Por eso lo que NO puede faltar es la EVIDENCIA: política vigente,
// fecha y constancia de que se mostró el aviso. Eso es lo que fija esta prueba.
//
// Es un interruptor de BD (`config.consent_implicito`): apagado = el muro de siempre, sin desplegar nada.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{type:'tool_use', input: datos.ia}] } : {}) :
      (pend || {}) }) });
  return new Function('$','$getWorkflowStaticData','$env', CEREBRO)($, () => sd, new Proxy({},{get:()=>''}))[0].json;
}
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, prov:{}, esCli:{}, muro:{}, ses:{} });
const msg = (t, o) => Object.assign({ wa_id:'573001112233', profileName:'Ana', texto:t, mtype:'', media_id:'',
                       opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o || {});
const ON  = { cfg_consent_impl:'si' };
const OFF = {};
const cuerpo = (r) => JSON.stringify(r.wpp_body || '');

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det || ''))); };

// ══ 1. APAGADO: nada cambia, el muro sigue igual (poder volver atrás es parte del diseño) ══
{
  const r = correr({ datos: msg('Buenas, necesito cemento'), sd: base(), pend: OFF });
  chequear('Interruptor APAGADO -> sigue el muro de siempre',
           r.etapa === 'consent' && /CONSENT_SI/.test(cuerpo(r)), 'etapa=' + r.etapa);
  chequear('Apagado -> tampoco sale el mensaje aparte de política',
           !r.wpp_pre && !r.hay_pre, JSON.stringify(r.wpp_pre));
}

// ══ 2. ENCENDIDO: un paso menos — el aviso y la pregunta de marca van en el MISMO mensaje ══
{
  const r = correr({ datos: msg('Buenas, necesito cemento'), sd: base(), pend: ON });
  chequear('Encendido -> se salta el muro y pregunta la marca de una vez',
           r.etapa === 'marca', 'etapa=' + r.etapa);
  // El aviso va en MENSAJE APARTE (pedido Deicy 15-ago): se lee como comunicación formal y queda como un
  // mensaje propio en el chat, que es donde vive la evidencia.
  const pre = JSON.stringify(r.wpp_pre || '');
  chequear('La política va en su PROPIO mensaje (wpp_pre), no dentro del saludo',
           !!r.wpp_pre && r.hay_pre === true &&
           /Tratamiento de datos personales/i.test(pre) && /GRUPO ARDISA/.test(pre) &&
           /politica-de-datos-personales/.test(pre), pre.slice(0, 260));
  // Corrección de Deicy (15-ago): NADA de "responde NO AUTORIZO" — eso es el mismo peaje que quitamos,
  // solo que escrito. Pero la Ley 1581 art. 8 obliga a informar los derechos del titular, revocar incluido:
  // se enuncia el DERECHO y el canal, sin pedirle al cliente que haga nada.
  chequear('El aviso cita la norma y enuncia los derechos (informado, sin pedir nada)',
           /Ley 1581/.test(pre) && /Decreto 1377/.test(pre) &&
           /revocar/i.test(pre) && /ayuda@ardisa\.com/.test(pre), pre.slice(0, 400));
  chequear('NO le pide al cliente que escriba nada para negarse',
           !/NO AUTORIZO/.test(pre), pre.slice(0, 400));
  chequear('El mensaje comercial ya NO repite la política',
           !/politica-de-datos-personales/.test(cuerpo(r)), cuerpo(r).slice(0, 200));
  chequear('Ya no hay botones de autorizar/no autorizar',
           !/CONSENT_SI|CONSENT_NO/.test(cuerpo(r)), cuerpo(r).slice(0, 160));
  // Sin evidencia registrada, la "conducta inequívoca" del Decreto 1377 no se puede sostener.
  chequear('Queda la EVIDENCIA: política vigente + fecha + marcado como implícito',
           !!r.consent_log && r.consent_log.decision === 'SI' &&
           r.consent_log.canal === 'wa-implicito' &&
           /politica-de-datos-personales/.test(String(r.consent_log.politica)) &&
           !!r.consent_log.creado_en, JSON.stringify(r.consent_log));
}

// ══ 3. Lo que el cliente ya había escrito NO se pierde (caso Emma Sierra: "malla geotextil") ══
{
  const r = correr({ datos: msg('Buen día. Costo de la malla geotextil'), sd: base(), pend: ON });
  const st = (base(), null);
  chequear('Su solicitud queda guardada para el asesor, no se descarta por saludar',
           r.etapa === 'marca' && /geotextil/i.test(JSON.stringify(r.ses_out || '')),
           'ses_out=' + String(r.ses_out || '').slice(0, 200));
}

// ══ 4. La foto tampoco frena la conversación ══
{
  const r = correr({ datos: msg('', { es_media:true, mtype:'image', media_id:'555' }), sd: base(), pend: ON });
  chequear('Con foto -> acusa recibo, informa y sigue a la marca',
           r.etapa === 'marca' && /Recibimos tu/i.test(cuerpo(r)) &&
           !/CONSENT_SI/.test(cuerpo(r)), 'etapa=' + r.etapa + ' ' + cuerpo(r).slice(0, 260));
  chequear('Y también deja su evidencia', !!r.consent_log && r.consent_log.canal === 'wa-implicito',
           JSON.stringify(r.consent_log));
}

// ══ 5. REVOCAR sigue mandando: quien ya dijo NO no entra por la puerta de atrás ══
// El consentimiento versionado lee la ÚLTIMA decisión de ese teléfono; un 'NO' pesa más que cualquier 'SI'
// anterior. Por eso la modalidad va en `canal` y la decisión sigue siendo 'SI'/'NO': si se hubiera metido
// 'IMPLICITA' en `decision`, la revocación y el chequeo `cons_si` habrían dejado de funcionar.
{
  const r = correr({ datos: msg('no autorizo'), sd: base(), pend: ON });
  chequear('"no autorizo" se sigue respetando con el aviso implícito encendido',
           r.etapa === 'noconsent' || (r.consent_log && r.consent_log.decision === 'NO'),
           'etapa=' + r.etapa + ' ' + JSON.stringify(r.consent_log));
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
