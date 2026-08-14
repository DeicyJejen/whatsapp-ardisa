// PRUEBA: el ALCANCE de la cotización SAP se controla desde la BD (config.cotiza_alcance, 13-ago-2026).
//
// 'demo'  (o vacío) -> SOLO los números de CLIENTES_PRUEBA cotizan; el cliente real cierra al asesor como siempre.
// 'todos'           -> EN VIVO: el cliente real también entra a cotización.
// usar_cotiza='no'  -> interruptor MAESTRO: apaga todo aunque el alcance diga 'todos'.
// Salir en vivo (o retroceder) es un UPDATE de config — sin deploy. Esta prueba fija ese contrato.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{type:'tool_use', input: datos.ia}] } : {}) :
      (pend || {}) }) });
  return new Function('$','$getWorkflowStaticData','$env', CEREBRO)($, () => sd, new Proxy({},{get:()=>''}))[0].json;
}

const DEMO = '573205662947';      // Deicy (CLIENTES_PRUEBA)
const REAL = '573001112233';      // un cliente cualquiera
const CFG_BASE = { cons_si:1, pend_id:0, cfg_cotiza:'si', cfg_mcp_url:'https://mcp.ardisa.com/mcp', cfg_mcp_token:'tok-bot-123' };

const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, muro:{}, ses:{},
                      info:{}, cliMsgs:{}, demoAdmin:{ [DEMO]: Date.now() } });
const sesion = () => ({ paso:'detalle', t:Date.now(), consent:true, nombre:'Cliente Prueba',
  ciudad:'Bucaramanga', ciudadId:'BUCARAMANGA', marca:'Ardisa', grupo:'ACABADOS', interes:'Acabados',
  ocupacion:'🏠 Cliente final' });
const ev = (wa) => ({ wa_id:wa, profileName:'Prueba', texto:'Tienen cemento gris? necesito para una placa',
                      mtype:'', media_id:'', opcion_id:'', opcion_txt:'', es_media:false,
                      ia:{ en_alcance:true, marca:'Ardisa', productos:['cemento gris'], confianza:'alta' } });

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det||''))); };

// ══ 1. alcance vacío/demo: el cliente REAL cierra al asesor (no ve la Fase 2) ══
for (const alc of ['', 'demo']) {
  const sd = base(); sd.ses[REAL] = sesion();
  const r = correr({ datos: ev(REAL), sd, pend: Object.assign({}, CFG_BASE, { cfg_cotiza_alcance: alc }) });
  chequear("alcance '"+(alc||'(vacío)')+"': el cliente real va al asesor (cierre, sin cotizar)",
           !r.hay_cot && r.etapa === 'cierre', 'etapa='+r.etapa+' hay_cot='+r.hay_cot);
}

// ══ 2. alcance 'todos': el cliente REAL entra a cotización (EN VIVO) ══
{
  const sd = base(); sd.ses[REAL] = sesion();
  const r = correr({ datos: ev(REAL), sd, pend: Object.assign({}, CFG_BASE, { cfg_cotiza_alcance: 'todos' }) });
  chequear("alcance 'todos': el cliente real entra a cotización", r.hay_cot === true && r.etapa === 'cotizacion',
           'etapa='+r.etapa+' hay_cot='+r.hay_cot);
  chequear('y el rescate queda armado (si abandona, el asesor recibe el lead igual)',
           !!(sd.rescate[REAL] && sd.rescate[REAL].lead), JSON.stringify(sd.rescate[REAL]||'').slice(0,80));
}

// ══ 3. el número demo cotiza aunque el alcance sea 'demo' (las demos de Deicy no dependen del alcance) ══
{
  const sd = base(); sd.ses[DEMO] = sesion();
  const r = correr({ datos: ev(DEMO), sd, pend: Object.assign({}, CFG_BASE, { cfg_cotiza_alcance: 'demo' }) });
  chequear('demo con alcance demo: sigue cotizando', r.hay_cot === true, 'etapa='+r.etapa);
}

// ══ 4. usar_cotiza='no' MANDA: apaga todo aunque el alcance diga 'todos' ══
{
  const sd = base(); sd.ses[REAL] = sesion();
  const r = correr({ datos: ev(REAL), sd, pend: Object.assign({}, CFG_BASE, { cfg_cotiza: 'no', cfg_cotiza_alcance: 'todos' }) });
  chequear("usar_cotiza='no' apaga la Fase 2 aunque el alcance sea 'todos'",
           !r.hay_cot && r.etapa === 'cierre', 'etapa='+r.etapa+' hay_cot='+r.hay_cot);
}

// ══ 5. sin URL del MCP no se cotiza (COTIZA_ON exige URL) ══
{
  const sd = base(); sd.ses[REAL] = sesion();
  const r = correr({ datos: ev(REAL), sd, pend: Object.assign({}, CFG_BASE, { cfg_mcp_url: '', cfg_cotiza_alcance: 'todos' }) });
  chequear('sin URL del MCP el cliente real cierra al asesor (nunca cotiza a ciegas)',
           !r.hay_cot && r.etapa === 'cierre', 'etapa='+r.etapa);
}

// ══ 6. CASO DEICY (13-ago, lead #280): producto en el PRIMER mensaje -> igual cotiza ══
// Su demo real: "quiero cotizar 10 bultos de cemento" de entrada -> nombre -> ciudad -> perfil -> y el bot
// cerró directo al asesor SIN cotizar, porque el gate solo miraba el paso "¿qué necesitas?". Ahora los
// cierres felices del formulario pasan por intentaCotizar() y la cotización dispara igual.
{
  const sd = base(); sd.ses = {}; sd.demoAdmin = { [DEMO]: Date.now() };
  const IA = { en_alcance:true, marca:'Ardisa', productos:['cemento'], confianza:'alta',
               resumen:'cotización de cemento', acuse:'¡Con gusto te ayudamos con el cemento!' };
  const paso = (o, conIA) => correr({ datos: Object.assign({ wa_id:DEMO, profileName:'Deicy', texto:'', mtype:'',
    media_id:'', opcion_id:'', opcion_txt:'', es_media:false, ia:(conIA?IA:null) }, o), sd, pend:CFG_BASE });
  paso({ texto:'quiero cotizar 10 bultos de cemento' }, true);   // producto de ENTRADA
  paso({ texto:'deicy jejen' });                                  // nombre
  paso({ texto:'Bucaramanga', opcion_id:'BUCARAMANGA' });         // ciudad
  const r = paso({ texto:'🏠 Cliente final', opcion_id:'OAR_FINAL' });   // perfil -> aquí cerraba directo
  chequear('CASO DEICY: con el producto de entrada, el perfil dispara la cotización (no cierra directo)',
           r.hay_cot === true && r.etapa === 'cotizacion', 'etapa='+r.etapa+' hay_cot='+r.hay_cot);
  chequear('y sale el acuse inmediato ("consultando disponibilidad y precios") mientras SAP responde',
           /consultando .*disponibilidad y precios/i.test(JSON.stringify(r.wpp_body||'')), JSON.stringify(r.wpp_body||'').slice(0,100));
  chequear('y la consulta lleva lo que el cliente pidió', JSON.stringify((r.cot_req||{}).messages||[]).includes('cemento'),
           JSON.stringify((r.cot_req||{}).messages||[]).slice(0,120));
  chequear('sin lead todavía (el lead sale al final de la cotización, como está diseñado)',
           !r.lead && (sd.leads||[]).length === 0, 'leads='+(sd.leads||[]).length);
}

// ══ 6b. CASO OSCAR (14-ago): "hola necesito asesoria" NO es un producto -> NO se promete
// "¡ya te confirmo disponibilidad!" con las manos vacías; el flujo normal pregunta el producto ══
{
  const sd = base(); sd.ses = {}; sd.demoAdmin = { [DEMO]: Date.now() };
  const paso = (o, ia) => correr({ datos: Object.assign({ wa_id:DEMO, profileName:'Oscar', texto:'', mtype:'',
    media_id:'', opcion_id:'', opcion_txt:'', es_media:false, ia:(ia||null) }, o), sd, pend:CFG_BASE });
  paso({ texto:'hola necesito asesoria' }, { en_alcance:true, marca:'Ardisa', productos:[], confianza:'baja',
                                             resumen:'pide asesoría', acuse:'¡Con gusto!' });
  paso({ texto:'oscar jimenez' });
  paso({ texto:'Bucaramanga', opcion_id:'BUCARAMANGA' });
  const r = paso({ texto:'🏠 Cliente final', opcion_id:'OAR_FINAL' });
  chequear('CASO OSCAR: sin producto concreto NO cotiza (nada de "dame unos segunditos" en falso)',
           !r.hay_cot, 'etapa='+r.etapa+' hay_cot='+r.hay_cot);
  chequear('y en su lugar el bot PREGUNTA el producto (solicitud vaga)',
           /qu[eé] producto/i.test(JSON.stringify(r.wpp_body||'')), JSON.stringify(r.wpp_body||'').slice(0,120));
}

// ══ 7. El que PIDE HUMANO no recibe cotización de bot (cierra al asesor como siempre) ══
{
  const sd = base(); sd.ses[DEMO] = Object.assign(sesion(), { escape:true, pidioHumano:true });
  const r = correr({ datos: ev(DEMO), sd, pend:CFG_BASE });
  chequear('pidió humano: NO cotiza (cierra al asesor)', !r.hay_cot, 'etapa='+r.etapa+' hay_cot='+r.hay_cot);
}

console.log(ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
