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

console.log(ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
