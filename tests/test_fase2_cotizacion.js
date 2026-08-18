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
  // El acuse sale AL INSTANTE mientras la consulta a SAP corre en paralelo (puede tardar 40 s). Es el
  // último mensaje que el cliente lee antes de ver precios, así que va en plural, sin diminutivos y sin
  // puntos suspensivos (pedido de Deicy, 18-ago: "esa respuesta hazla más profesional").
  const acuse = (r.wpp_body && r.wpp_body.text) ? r.wpp_body.text.body : '';
  chequear('El acuse de espera se lee profesional (sin "momentico" ni "...")',
           /disponibilidad y precios/.test(acuse) && !/momentico|momentito/.test(acuse) &&
           !/\.\.\./.test(acuse) && /confirmamos/.test(acuse), acuse.slice(0,160));
  const req = r.cot_req||{};
  // === MCP EN CASA (13-ago, decisión Deicy por auditoría): el token JAMÁS viaja a Anthropic ===
  chequear('SEGURIDAD: el token del MCP NO aparece en el body que va a Anthropic',
           !JSON.stringify(req).includes(CFG.cfg_mcp_token) && !req.mcp_servers,
           JSON.stringify(Object.keys(req)));
  chequear('Las herramientas se DECLARAN (tools con input_schema), sin conector remoto',
           Array.isArray(req.tools) && req.tools.every(t=>t.name && t.input_schema), JSON.stringify(req.tools||[]).slice(0,120));
  const nombres=(req.tools||[]).map(t=>t.name).join(',');
  chequear('Solo herramientas de mostrador en la lista blanca',
           /buscar_producto/.test(nombres) && /disponibilidad_ciudad/.test(nombres) && !/cartera|ventas|compras|contabilidad|recaudos/.test(nombres),
           nombres);
  // ARRANQUE SIN PRECIO (decisión Deicy 11-ago): el servidor MCP todavía no tiene tool de precio, asi que
  // `mcp_precio_tool` va vacio en la BD. El bot NO debe hablar de precios ni escalar por eso — resuelve
  // producto y disponibilidad, y remite el valor al asesor.
  chequear('El sistema lleva la ciudad del cliente y el guardrail de escalar',
           /Bucaramanga/.test(req.system||'') && /\[ASESOR\]/.test(req.system||''),
           String(req.system||'').slice(0,120));
  chequear('SIN tool de precio: no promete precios y no escala por no tenerlos',
           /NO tienes precios/.test(req.system||'') && !/precio de referencia/.test(req.system||'')
             && !/el precio no está disponible/.test(req.system||''),
           String(req.system||'').slice(0,240));
  chequear('SIN tool de precio: la lista blanca no la incluye',
           !/precio/.test(nombres), nombres);
  chequear('La pregunta del cliente viaja en messages', JSON.stringify(req.messages||[]).includes('duratex'),
           JSON.stringify(req.messages||[]).slice(0,120));
  chequear('Y el rescate quedó armado (si abandona, el cron cierra)', !!sd.rescate[DEMO],
           JSON.stringify(Object.keys(sd.rescate||{})));
}

// ══ 1b. EL DÍA QUE EXISTA LA TOOL DE PRECIO: se prende desde la BD, sin desplegar ═
// En `config.mcp_precio_tool` se guarda el NOMBRE EXACTO de la tool (no un si/no) — asi la lista blanca no
// puede quedar nombrando una tool que se llama distinto y que el bot ignoraria en silencio.
{
  const sd = base(); sd.ses[DEMO] = sesion();
  const CFG_P = Object.assign({}, CFG, { cfg_precio_tool:'consultar_precio' });
  const r = correr({ datos: ev(DEMO,{ texto:'Cuánto vale la lámina duratex de 18mm?' }), sd, pend:CFG_P });
  const req = r.cot_req||{};
  const nombres=(req.tools||[]).map(t=>t.name).join(',');
  chequear('CON tool de precio: entra a la lista blanca con SU nombre exacto',
           /(^|,)consultar_precio(,|$)/.test(nombres), nombres);
  chequear('CON tool de precio: vuelven las reglas de "precio de referencia"',
           /precio de referencia/.test(req.system||'') && !/NO tienes precios/.test(req.system||''),
           String(req.system||'').slice(0,200));
  chequear('CON tool de precio: sigue sin ver cartera/ventas',
           !/cartera|ventas|compras|contabilidad|recaudos/.test(nombres), nombres);
  // 2026-08-18, pedido de Deicy: "debe buscar por unidad, hacerle la cotización, y verificar si no hay
  // en esa ciudad decirle en qué ciudades está disponible".
  // (1d) El precio que devuelve SAP es el de UNA unidad de venta completa (la caja entera, no el m2), y
  // la escala por volumen SOLO se aplica si se manda la cantidad: sin ella el bot cotizaba el precio de 1
  // y el cliente que pedía 20 cajas se quedaba sin su total.
  const sys = String(req.system||'');
  chequear('Cotiza por la CANTIDAD que pidió el cliente (total, no precio de 1)',
           /COTIZA POR LA CANTIDAD QUE PIDIÓ/.test(sys) && /TOTAL/.test(sys) &&
           /REDONDEANDO HACIA ARRIBA/.test(sys), sys.slice(0,80));
  const fichaPrecio = (req.tools||[]).find(t=>t.name==='consultar_precio')||{};
  chequear('La ficha de la herramienta le exige mandar cantidad y ciudad',
           /cantidad` con lo que el cliente dijo/.test(fichaPrecio.description||'') &&
           /SIEMPRE la ciudad/.test(fichaPrecio.description||''), String(fichaPrecio.description||'').slice(0,120));
  // (5b) "No hay en tu ciudad" es donde se pierde el cliente. Tenemos punto de venta en 11 ciudades: antes
  // de decirle que no, hay que mirar las otras y decirle dónde SÍ.
  chequear('Si no hay en su ciudad, usa el dato de dónde SÍ (ya resuelto por n8n)',
           /SI NO HAY EN SU CIUDAD, DILE DÓNDE SÍ/.test(sys) && /otras_ciudades/.test(sys), sys.slice(0,80));
  // Lo que Deicy vio en el triplex: "tu asesor deberá confirmarte disponibilidad en otras plazas". Somos
  // UNA empresa con varios puntos; ese dato lo tiene el bot, no se le devuelve el trabajo al cliente.
  chequear('Tiene PROHIBIDO mandar al asesor a averiguar en qué otra plaza hay',
           /confirmará disponibilidad en otras plazas o /.test(sys), sys.slice(0,80));
  chequear('Pero NO promete traslados, fletes ni tiempos (eso lo confirma el asesor)',
           /PROHIBIDO prometer traslados, fletes, costos o tiempos/.test(sys), sys.slice(0,80));
  chequear('Dice en qué PUNTO lo tenemos, no solo si hay',
           /EN QUÉ PUNTO lo tenemos/.test(sys) && /puntos_de_venta/.test(sys), sys.slice(0,80));
  // Y nunca le cuenta al cliente el motivo interno de que falte un precio (regla de redacción de Deicy).
  chequear('Nunca dice "no está en nuestra lista de precios"',
           /nunca digas "no está en nuestra lista de precios"/.test(sys), sys.slice(0,80));
  // 18-ago, Deicy: "no tiene un asesor, diga UN asesor". Mientras cotiza, al cliente todavía no se le ha
  // asignado nadie —eso pasa al cerrar el lead—, así que "tu asesor" nombra a alguien que él no conoce.
  // (La única aparición permitida es en MAYÚSCULA dentro de la propia regla que lo prohíbe.)
  chequear('En cotización se dice "un asesor", nunca "tu asesor"',
           !/tu asesor/.test(sys) && /un asesor/.test(sys),
           (sys.match(/.{0,70}tu asesor.{0,70}/)||[''])[0]);
  // 18-ago, prueba de la varilla roscada: abrió con "Ya tengo toda la información consultada para
  // responder. Aquí va el detalle:". Un asesor no anuncia que fue a mirar el inventario; entrega.
  chequear('Tiene prohibido narrar su propio trabajo antes de responder',
           /Tampoco narres tu propio trabajo/.test(sys) && /ya tengo toda la información consultada/.test(sys),
           sys.slice(0,80));
  // 18-ago, pruebas de Deicy: el sanitario Laguna repetía "unidad" tres veces en cuatro renglones, la
  // disponibilidad decía "Bucaramanga (área metropolitana de Girón)" —geografía inventada— y con 25
  // productos Novaflex delante respondió "no logramos identificar un producto llamado Acronal Novaflex".
  chequear('La unidad de venta se dice UNA vez, no en cada renglón',
           /PROHIBIDO repetirla/.test(sys), sys.slice(0,80));
  chequear('El punto de venta se nombra tal cual, sin geografía inventada',
           /PROHIBIDO adornarlo con explicaciones geográficas/.test(sys), sys.slice(0,80));
  chequear('Con resultados en la mano, prohibido decir "no logramos identificar"',
           /SI UNA BÚSQUEDA TRAJO RESULTADOS, ESOS SON EL CATÁLOGO/.test(sys) &&
           /nombres comerciales, de marca o de presentación/.test(sys), sys.slice(0,80));
  const fichaDisp = (req.tools||[]).find(t=>t.name==='disponibilidad_ciudad')||{};
  chequear('La ficha de disponibilidad nombra las ciudades donde tenemos punto de venta',
           /Bucaramanga, Bogotá, Barranquilla/.test(fichaDisp.description||''),
           String(fichaDisp.description||'').slice(0,120));
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
