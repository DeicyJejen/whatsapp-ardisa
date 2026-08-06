// FASE 2 · PILOTO DE COTIZACIÓN SAP (2026-08-06, luz verde de Deicy: "completamente funcional, aún no en
// vivo, pero sí debo hacer pruebas"). El bot cotiza precio/disponibilidad vía MCP; el asesor entra cuando
// hay intención de COMPRA. Todo el anillo 1: SAP y Claude son de mentira — se prueba la LÓGICA.
//
// Seguridad probada aquí:
//   · SOLO números demo (CLIENTES_PRUEBA) entran — un cliente real NUNCA ve la Fase 2
//   · Lista blanca: default_config.enabled=false + solo herramientas de mostrador (cartera NO existe)
//   · Interruptor usar_cotiza en BD: apagado = flujo de siempre
//   · "El código decide": comprar/tope/fallo -> cerrarLead de siempre (mismo asesor, tarjeta, Excel)
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');
const ENTREGAR = fs.readFileSync(__dirname + '/n_entregar.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{type:'tool_use', input: datos.ia}] } : {}) :
      (pend || {}) }) });
  return new Function('$','$getWorkflowStaticData','$env', CEREBRO)($, () => sd, new Proxy({},{get:()=>''}))[0].json;
}
function entregar({ cerebroJson, sd, resp }) {
  const $ = (n) => ({ first: () => ({ json: cerebroJson }) });
  const $input = { first: () => ({ json: resp }) };
  return new Function('$','$input','$getWorkflowStaticData', ENTREGAR)($, $input, () => sd)[0].json;
}

const DEMO = '573205662947';      // Deicy en modo demo (CLIENTES_PRUEBA)
const REAL = '573001112233';      // un cliente cualquiera
const CFG  = { cons_si:1, pend_id:0, cfg_cotiza:'si', cfg_mcp_url:'https://sap.ardisa.com/mcp', cfg_mcp_token:'tok-bot-123' };

const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, muro:{}, ses:{},
                      info:{}, cliMsgs:{}, demoAdmin:{ [DEMO]: Date.now() } });
const sesion = (extra) => Object.assign({ paso:'detalle', t:Date.now(), consent:true, nombre:'Deicy Prueba',
  ciudad:'Bucaramanga', ciudadId:'BUCARAMANGA', marca:'Ardisa', grupo:'ACABADOS', interes:'Acabados',
  ocupacion:'🏠 Cliente final' }, extra||{});
const ev = (wa, o) => Object.assign({ wa_id:wa, profileName:'Prueba', texto:'', mtype:'', media_id:'',
                                      opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det||''))); };

// ══ 1. ENTRADA: demo + interruptor prendido -> cotiza (no cierra) ═══════════════
{
  const sd = base(); sd.ses[DEMO] = sesion();
  const r = correr({ datos: ev(DEMO,{ texto:'Cuánto vale la lámina duratex de 18mm?' }), sd, pend:CFG });
  chequear('Entra a cotización (hay_cot) en vez de cerrar', r.hay_cot===true && r.etapa==='cotizacion', 'etapa='+r.etapa);
  const req = r.cot_req||{};
  chequear('El body va contra el servidor MCP de la BD con el token del bot',
           req.mcp_servers && req.mcp_servers[0].url===CFG.cfg_mcp_url && req.mcp_servers[0].authorization_token===CFG.cfg_mcp_token,
           JSON.stringify(req.mcp_servers||[]).slice(0,150));
  const ts=(req.tools||[])[0]||{};
  chequear('CANDADO: default_config apagado — el bot no ve cartera/ventas',
           ts.default_config && ts.default_config.enabled===false, JSON.stringify(ts).slice(0,120));
  const nombres=(ts.configs||[]).map(c=>c.name).join(',');
  chequear('Solo herramientas de mostrador en la lista blanca',
           /buscar_producto/.test(nombres) && /disponibilidad_ciudad/.test(nombres) && !/cartera|ventas|compras|contabilidad|recaudos/.test(nombres),
           nombres);
  chequear('El sistema lleva la ciudad del cliente y los guardrails',
           /Bucaramanga/.test(req.system||'') && /\[ASESOR\]/.test(req.system||'') && /precio de referencia/.test(req.system||''),
           String(req.system||'').slice(0,120));
  chequear('La pregunta del cliente viaja en messages', JSON.stringify(req.messages||[]).includes('duratex'),
           JSON.stringify(req.messages||[]).slice(0,120));
  chequear('Y el rescate quedó armado (si abandona, el cron cierra)', !!sd.rescate[DEMO],
           JSON.stringify(Object.keys(sd.rescate||{})));
}

// ══ 2. SEGURIDAD: cliente REAL con todo prendido -> flujo de SIEMPRE ════════════
{
  const sd = base(); sd.ses[REAL] = sesion({nombre:'Carlos Real'});
  const r = correr({ datos: ev(REAL,{ texto:'Cuánto vale la lámina duratex de 18mm?' }), sd, pend:CFG });
  chequear('Un cliente real NUNCA entra a Fase 2 (cierra normal al asesor)',
           !r.hay_cot && r.etapa==='cierre' && !!(r.lead || sd.pendCierre[REAL]),
           'etapa='+r.etapa+' hay_cot='+r.hay_cot);
}

// ══ 3. INTERRUPTOR: usar_cotiza='no' -> ni la demo cotiza ══════════════════════
{
  const sd = base(); sd.ses[DEMO] = sesion();
  const r = correr({ datos: ev(DEMO,{ texto:'Cuánto vale la lámina duratex?' }), sd,
                     pend:Object.assign({},CFG,{cfg_cotiza:'no'}) });
  chequear('Con el interruptor en NO, la demo cierra normal', !r.hay_cot && r.etapa==='cierre', 'etapa='+r.etapa);
}
// Sin URL tampoco (config incompleta = apagado)
{
  const sd = base(); sd.ses[DEMO] = sesion();
  const r = correr({ datos: ev(DEMO,{ texto:'Cuánto vale la lámina?' }), sd,
                     pend:Object.assign({},CFG,{cfg_mcp_url:''}) });
  chequear('Sin URL del MCP en la BD, no hay cotización (cierra normal)', !r.hay_cot, 'etapa='+r.etapa);
}

// ══ 4. TURNO SIGUIENTE: otra pregunta -> otra consulta (historial crece) ════════
{
  const sd = base(); sd.ses[DEMO] = sesion({ paso:'cotizacion', cotN:1,
    cotHist:[{role:'user',content:'lámina duratex 18mm'},{role:'assistant',content:'La lámina cuesta $X...'}] });
  const r = correr({ datos: ev(DEMO,{ texto:'y en 15mm la tienen?' }), sd, pend:CFG });
  chequear('Pregunta de seguimiento -> nueva consulta con historial', r.hay_cot===true && (r.cot_req.messages||[]).length>=3,
           'msgs='+JSON.stringify((r.cot_req||{}).messages||[]).slice(0,150));
}

// ══ 5. COMPRA: "lo quiero" -> AQUÍ entra el humano (cierre de siempre) ══════════
{
  const sd = base(); sd.ses[DEMO] = sesion({ paso:'cotizacion', cotN:2,
    cotHist:[{role:'user',content:'lámina duratex 18mm'},{role:'assistant',content:'Precio de referencia $89.900...'}] });
  sd.cliMsgs[DEMO]=[{t:Date.now()-60000, m:'lámina duratex 18mm'}];   // en prod el acumulador trae todo el diálogo
  const r = correr({ datos: ev(DEMO,{ texto:'Listo, lo quiero. Cómo pago?' }), sd, pend:CFG });
  const lead = r.lead || (sd.pendCierre[DEMO]||{}).lead || {};
  chequear('Intención de compra -> cierre al asesor', r.etapa==='cierre' && !r.hay_cot, 'etapa='+r.etapa);
  chequear('La tarjeta lleva el diálogo cotizado + la confirmación de compra',
           /duratex/.test(lead.detalle||'') && /CONFIRM[OÓ]/i.test(lead.detalle||''),
           'detalle='+String(lead.detalle).slice(0,140));
}

// ══ 6. TOPE de vueltas: a la 4ª pregunta pasa al asesor (no marear al cliente) ══
{
  const sd = base(); sd.ses[DEMO] = sesion({ paso:'cotizacion', cotN:3, cotHist:[{role:'user',content:'cemento gris'}] });
  const r = correr({ datos: ev(DEMO,{ texto:'y el blanco? y el gris? y otro?' }), sd, pend:CFG });
  chequear('Al tope de vueltas cierra al asesor', r.etapa==='cierre' && !r.hay_cot, 'etapa='+r.etapa);
}

// ══ 7. FALLO PREVIO: el siguiente mensaje cierra al asesor ══════════════════════
{
  const sd = base(); sd.ses[DEMO] = sesion({ paso:'cotizacion', cotN:1, cotFallo:1, cotHist:[{role:'user',content:'laca catalizada'}] });
  const r = correr({ datos: ev(DEMO,{ texto:'bueno entonces?' }), sd, pend:CFG });
  chequear('Tras un fallo de SAP, el siguiente mensaje va al asesor', r.etapa==='cierre', 'etapa='+r.etapa);
}

// ══ 8. ENTREGAR: respuesta buena de Claude+SAP -> mensaje al cliente ════════════
{
  const sd = base(); sd.ses[DEMO] = { paso:'cotizacion', cotN:1, cotHist:[{role:'user',content:'lámina duratex'}] };
  const out = entregar({ cerebroJson:{wa_id:DEMO}, sd,
    resp:{ content:[{type:'mcp_tool_use',name:'buscar_producto'},{type:'mcp_tool_result'},
                    {type:'text',text:'¡Claro! La lámina Duratex 18mm tiene un precio de referencia de $89.900 — tu asesor te lo confirma. ¿Deseas que te ayude con el pedido?'}] } });
  chequear('La respuesta llega al cliente tal cual', /89\.900/.test(out.wpp_body.text.body), out.wpp_body.text.body.slice(0,100));
  chequear('El historial guarda la respuesta y la sesión viaja a la BD',
           /assistant/.test(out.ses_out) && out.ses_tel===DEMO, String(out.ses_out).slice(0,120));
}

// ══ 9. ENTREGAR: [ASESOR] o error -> fallback SIN exponer el problema ═══════════
{
  const sd = base(); sd.ses[DEMO] = { paso:'cotizacion', cotN:1 };
  const out = entregar({ cerebroJson:{wa_id:DEMO}, sd, resp:{ content:[{type:'text',text:'[ASESOR]'}] } });
  chequear('Token [ASESOR] -> mensaje neutro (nunca "error" ni "sistema")',
           /asesor/i.test(out.wpp_body.text.body) && !/error|sistema|falla|SAP/i.test(out.wpp_body.text.body),
           out.wpp_body.text.body.slice(0,120));
  chequear('Y queda marcado el fallo para cerrar en la próxima', /cotFallo/.test(out.ses_out), out.ses_out.slice(0,100));
}
{
  const sd = base(); sd.ses[DEMO] = { paso:'cotizacion', cotN:1 };
  const out = entregar({ cerebroJson:{wa_id:DEMO}, sd, resp:{ type:'error', error:{message:'overloaded'} } });
  chequear('Error del API -> mismo fallback neutro', /asesor/i.test(out.wpp_body.text.body), out.wpp_body.text.body.slice(0,100));
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
