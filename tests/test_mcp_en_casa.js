// PRUEBA: "MCP EN CASA" (13-ago-2026, decisión de Deicy por auditoría interna).
//
// El token del MCP JAMÁS viaja a Anthropic: el modelo DECLARA qué herramienta quiere (tool_use) y n8n
// la ejecuta contra mcp.ardisa.com. Esta prueba fija los 3 nodos del loop:
//   Repartir herramientas R1  -> ¿terminó o pidió herramientas? (un item por llamada)
//   Armar consulta R2         -> junta los resultados SSE de SAP y arma la siguiente vuelta
//   Armar consulta R4         -> la ÚLTIMA vuelta: prohíbe herramientas para que SIEMPRE haya respuesta
//   Cerrar cotización R4      -> red de seguridad del final
const fs = require('fs');
const leer = (f) => fs.existsSync(__dirname + '/' + f) ? fs.readFileSync(__dirname + '/' + f, 'utf8') : null;
const REPARTIR    = leer('n_repartir1.js');
const ARMAR       = leer('n_armar_r2.js');
const ARMAR_FINAL = leer('n_armar_r4.js');
const CERRAR      = leer('n_cerrar_r3.js');
// 2026-08-15: antes esto imprimía "OK" y salía con éxito cuando faltaba un nodo — o sea que una prueba
// que no probaba NADA se veía igual que una que pasó. Faltar un nodo es un FALLO.
if (!REPARTIR || !ARMAR || !ARMAR_FINAL || !CERRAR) {
  console.log('  FALLA | faltan nodos del arnés MCP (¿se renombró alguno en build_f1.py?)');
  process.exit(1);
}

// Arnés: $('Nodo') resuelve fixtures; $input entrega los items de entrada
function correrCode(code, entrada, nodos) {
  const $ = (n) => {
    const v = nodos[n];
    const arr = Array.isArray(v) ? v : [v];
    return { first: () => ({ json: arr[0] }), all: () => arr.map(j => ({ json: j })), item: { json: arr[0] } };
  };
  const $input = { first: () => ({ json: entrada[0] }), all: () => entrada.map(j => ({ json: j })) };
  return new Function('$', '$input', code)($, $input);
}

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det || ''))); };

const COT_REQ = { model: 'claude-sonnet-5', max_tokens: 700, system: 'REGLAS...',
  tools: [{ name: 'buscar_producto', input_schema: {} }],
  messages: [{ role: 'user', content: 'quiero cotizar cemento' }] };

// ══ 1. Repartir: el modelo TERMINÓ (texto) -> pasa derecho (Entregar recibe la respuesta tal cual) ══
{
  const resp = { content: [{ type: 'text', text: 'Manejamos cemento...' }], stop_reason: 'end_turn' };
  const out = correrCode(REPARTIR, [resp], { 'Cerebro conversacional': { cot_req: COT_REQ } });
  chequear('modelo terminó -> 1 item con la respuesta tal cual (sin tuse)',
           out.length === 1 && !out[0].json.tuse && out[0].json.stop_reason === 'end_turn', JSON.stringify(out).slice(0, 120));
}

// ══ 2. Repartir: el modelo PIDIÓ 2 herramientas -> 2 items con tuse + la historia completa ══
{
  const resp = { content: [
    { type: 'text', text: 'Voy a consultar...' },
    { type: 'tool_use', id: 'tu_1', name: 'buscar_producto', input: { q: 'cemento' } },
    { type: 'tool_use', id: 'tu_2', name: 'disponibilidad_ciudad', input: { item_code: '10025215', ciudad: 'Bucaramanga' } },
  ], stop_reason: 'tool_use' };
  const out = correrCode(REPARTIR, [resp], { 'Cerebro conversacional': { cot_req: COT_REQ } });
  chequear('2 tool_use -> 2 items con nombre y argumentos',
           out.length === 2 && out[0].json.tuse.name === 'buscar_producto' && out[1].json.tuse.input.ciudad === 'Bucaramanga',
           JSON.stringify(out).slice(0, 150));
  chequear('la historia viaja: pregunta del cliente + turno assistant con los tool_use',
           out[0].json.historia.length === 2 && out[0].json.historia[1].role === 'assistant',
           JSON.stringify(out[0].json.historia).slice(0, 120));
}

// ══ 3. Repartir: error del API -> pasa derecho (Entregar lo trata como fallo -> asesor) ══
{
  const out = correrCode(REPARTIR, [{ error: { message: 'overloaded' } }], { 'Cerebro conversacional': { cot_req: COT_REQ } });
  chequear('error del API pasa derecho al fallo', out.length === 1 && !!out[0].json.error, JSON.stringify(out).slice(0, 100));
}

// ══ 4. Armar R2: junta los resultados SSE de SAP con su tool_use_id y arma la siguiente vuelta ══
{
  const tuses = [
    { tuse: { id: 'tu_1', name: 'buscar_producto', input: {} }, historia: [{ role: 'user', content: 'x' }, { role: 'assistant', content: [] }] },
    { tuse: { id: 'tu_2', name: 'disponibilidad_ciudad', input: {} }, historia: [] },
  ];
  const sse = (obj) => ({ data: 'event: message\ndata: ' + JSON.stringify(obj) + '\n' });
  const entrada = [
    sse({ result: { content: [{ type: 'text', text: 'RESULTADO_BUSQUEDA' }] } }),
    sse({ error: { message: 'No hay precio definido para el artículo' } }),
  ];
  const out = correrCode(ARMAR, entrada, {
    'Repartir herramientas R1': tuses, 'Cerebro conversacional': { cot_req: COT_REQ } });
  const req2 = out[0].json.cot_req;
  const ultimo = req2.messages[req2.messages.length - 1];
  chequear('la siguiente vuelta conserva system/tools/model',
           req2.system === COT_REQ.system && req2.tools.length === 1 && req2.model === COT_REQ.model,
           JSON.stringify(Object.keys(req2)));
  chequear('el último turno es user con los 2 tool_result emparejados por id',
           ultimo.role === 'user' && ultimo.content.length === 2 &&
           ultimo.content[0].tool_use_id === 'tu_1' && ultimo.content[1].tool_use_id === 'tu_2',
           JSON.stringify(ultimo).slice(0, 150));
  chequear('el resultado bueno lleva su texto y el fallido dice ERROR (sin inventar)',
           JSON.stringify(ultimo.content[0]).includes('RESULTADO_BUSQUEDA') &&
           JSON.stringify(ultimo.content[1]).includes('ERROR de la herramienta'),
           JSON.stringify(ultimo.content).slice(0, 200));
}

// ══ 5. Armar R4 — LA ÚLTIMA VUELTA (2026-08-15, caso Deicy 15-ago 12:06) ══════════════════════════
// El modelo había buscado la varilla, había elegido la referencia correcta y estaba pidiendo precio y
// disponibilidad justo cuando se le acabaron las vueltas: el cliente acabó donde el asesor teniéndolo
// TODO. Ahora la última vuelta va con tool_choice:'none' -> no puede pedir herramientas, tiene que
// responder. Lo que NO se puede hacer es quitar `tools`: la API las exige mientras la conversación traiga
// bloques tool_use/tool_result (responde 400). Por eso se PROHÍBEN, no se borran.
{
  const tuses = [{ tuse: { id: 'tu_9', name: 'precio_articulo', input: {} }, historia: [{ role: 'user', content: 'x' }] }];
  const sse = (o) => ({ data: 'event: message\ndata: ' + JSON.stringify(o) + '\n' });
  const entrada = [sse({ result: { content: [{ type: 'text', text: 'PRECIO_12345' }] } })];
  const out = correrCode(ARMAR_FINAL, entrada, {
    'Repartir herramientas R3': tuses, 'Armar consulta R3': { cot_req: COT_REQ } });
  const req = out[0].json.cot_req;
  const ultimo = req.messages[req.messages.length - 1];
  chequear('la última vuelta PROHÍBE herramientas (tool_choice none)',
           req.tool_choice && req.tool_choice.type === 'none', JSON.stringify(req.tool_choice));
  chequear('pero las tools SIGUEN declaradas (quitarlas da 400 en la API)',
           Array.isArray(req.tools) && req.tools.length === 1, JSON.stringify(req.tools).slice(0, 80));
  chequear('el resultado de SAP llega igual + la orden de responder ya',
           JSON.stringify(ultimo.content).includes('PRECIO_12345') &&
           ultimo.content[ultimo.content.length - 1].type === 'text' &&
           /Responde AHORA/.test(ultimo.content[ultimo.content.length - 1].text),
           JSON.stringify(ultimo.content).slice(0, 200));
  // Las vueltas intermedias NO deben llevar tool_choice: ahí el modelo sí puede consultar.
  const medio = correrCode(ARMAR, entrada, {
    'Repartir herramientas R1': tuses, 'Cerebro conversacional': { cot_req: COT_REQ } });
  chequear('las vueltas intermedias NO prohíben herramientas',
           !medio[0].json.cot_req.tool_choice, JSON.stringify(medio[0].json.cot_req.tool_choice));
}

// ══ 6. Cerrar R4: red de seguridad (ya no debería saltar, pero si salta, el cliente no se pierde) ══
{
  const conTool = { content: [{ type: 'tool_use', id: 't', name: 'buscar_producto', input: {} }] };
  const out = correrCode(CERRAR, [conTool], {});
  chequear('si aun así pidiera herramientas -> type error (mensaje neutro + asesor)',
           out[0].json.type === 'error', JSON.stringify(out).slice(0, 100));
  const final = { content: [{ type: 'text', text: 'Respuesta final' }], stop_reason: 'end_turn' };
  const out2 = correrCode(CERRAR, [final], {});
  chequear('vuelta final con texto -> pasa derecho', out2[0].json.stop_reason === 'end_turn', JSON.stringify(out2).slice(0, 100));
}

// ══ 7. LO QUE SE LE MANDA AL MODELO (2026-08-18) ═════════════════════════════════════════════════
// El MCP devuelve la disponibilidad de una ciudad ALMACÉN POR ALMACÉN: los 40 depósitos de Bucaramanga
// con centro de costos, averías y outlets — unos 6.000 caracteres POR PRODUCTO. Con 7 productos eso no
// solo era lento: el recorte de 4.000 partía el JSON por la mitad y el modelo recibía basura. Y para
// poder mirar las OTRAS ciudades (pedido de Deicy) habría que multiplicar eso por 10. Se resume en casa.
{
  const sse = (o) => ({ data: 'event: message\ndata: ' + JSON.stringify(o) + '\n' });
  const json = (o) => sse({ result: { content: [{ type: 'text', text: JSON.stringify(o) }] } });
  const alm = (w, punto, tipo, disp) => ({ warehouse: w, nombre_almacen: tipo + ' · ' + punto,
                                           punto_venta: punto, tipo_almacen: tipo, on_hand: disp, disponible: disp });
  const disponibilidad = {
    item_code: '10011257', item_name: 'GEOTEXTIL NT 1600', ciudad_consultada: 'Bmga', ciudad_oficial: 'Bucaramanga',
    unidad: 'm2', total_almacenes: 4, on_hand_total: 30, disponible_total: 30,
    almacenes: [ alm('114501', 'CEDI BUCARAMANGA', 'PRINCIPAL', 25),
                 alm('117101', 'ARDISA CENTRO CONSTRUCCION', 'PRINCIPAL', 0),
                 alm('110103', 'CARPINCENTRO 61 BMGA', 'AVERIAS', 5),
                 alm('118208', 'DRYCENTER 61 BMGA', 'OUTLET', 3) ] };
  const tuses = [{ tuse: { id: 'tu_1', name: 'disponibilidad_ciudad', input: {} }, historia: [] }];
  const out = correrCode(ARMAR, [json(disponibilidad)], {
    'Repartir herramientas R1': tuses, 'Cerebro conversacional': { cot_req: COT_REQ } });
  const txt = out[0].json.cot_req.messages.slice(-1)[0].content[0].content[0].text;
  let d = {}; try { d = JSON.parse(txt); } catch (e) {}
  chequear('La disponibilidad llega RESUMIDA, no con los 40 almacenes',
           txt.length < 400 && !/warehouse|centro_costos/.test(txt), txt.slice(0, 200));
  chequear('Conserva lo que el bot necesita: producto, ciudad, unidad y si hay',
           d.item_code === '10011257' && d.ciudad === 'Bucaramanga' && d.unidad === 'm2' &&
           d.hay_disponibilidad === true, txt.slice(0, 200));
  chequear('Nombra los puntos con inventario y descarta las AVERÍAS (eso no se vende)',
           Array.isArray(d.puntos_de_venta) && d.puntos_de_venta.indexOf('CEDI BUCARAMANGA') >= 0 &&
           d.puntos_de_venta.indexOf('DRYCENTER 61 BMGA') >= 0 &&
           d.puntos_de_venta.indexOf('CARPINCENTRO 61 BMGA') < 0, JSON.stringify(d.puntos_de_venta));
  // Sin inventario vendible = "no hay", aunque el total de la ciudad no sea cero (esas son las averías).
  const soloAverias = Object.assign({}, disponibilidad,
    { almacenes: [alm('110103', 'CARPINCENTRO 61 BMGA', 'AVERIAS', 5)] });
  const out2 = correrCode(ARMAR, [json(soloAverias)], {
    'Repartir herramientas R1': tuses, 'Cerebro conversacional': { cot_req: COT_REQ } });
  const d2 = JSON.parse(out2[0].json.cot_req.messages.slice(-1)[0].content[0].content[0].text);
  chequear('Si lo único que hay son averías -> no hay disponibilidad',
           d2.hay_disponibilidad === false && d2.puntos_de_venta.length === 0, JSON.stringify(d2));
  // Del inventario NO viajan cantidades exactas: la regla dice "hay o no hay", y así ni por accidente.
  chequear('No viajan cantidades exactas de inventario a un tercero',
           !/on_hand|disponible_total|"25"|:25/.test(txt), txt.slice(0, 200));
}

// ══ 8. PRECIO CON DATO MALO EN SAP ═══════════════════════════════════════════════════════════════
// El porcelanato 10030624 tiene $4,77 la caja de 1.44 m2 en la lista de Bucaramanga; el de al lado, mismo
// formato, vale $36.858. No es una ganga, es un error de captura — y decírselo al cliente sale más caro
// que no darle precio. El número no llega al modelo, y en su lugar va la orden de remitirlo al asesor.
{
  const sse = (o) => ({ data: 'event: message\ndata: ' + JSON.stringify(o) + '\n' });
  const json = (o) => sse({ result: { content: [{ type: 'text', text: JSON.stringify(o) }] } });
  const tuses = [{ tuse: { id: 'tu_1', name: 'precio_articulo', input: {} }, historia: [] }];
  const malo = { item_code: '10030624', item_name: '60X120 PORCELANATO MATE CEMENTO BIANCO',
                 precio_sin_iva: 4.01, iva_pct: 19, precio_con_iva: 4.77,
                 unidad_venta: { unidad: 'Caja', contenido: 1.44, descripcion: 'Caja de 1.44 m2' } };
  const bueno = Object.assign({}, malo, { item_code: '10028663', precio_sin_iva: 30973.86, precio_con_iva: 36858.89 });
  const pasar = (o) => correrCode(ARMAR, [json(o)], {
    'Repartir herramientas R1': tuses, 'Cerebro conversacional': { cot_req: COT_REQ }
  })[0].json.cot_req.messages.slice(-1)[0].content[0].content[0].text;
  const tMalo = pasar(malo), tBueno = pasar(bueno);
  chequear('Un precio absurdo NO llega al modelo (no puede decir "$4,77 la caja")',
           !/4\.77|4,77/.test(tMalo) && /asesor le confirma el valor/.test(tMalo), tMalo.slice(0, 200));
  chequear('El producto sigue existiendo: se responde disponibilidad, no se borra',
           /10030624/.test(tMalo) && /PORCELANATO/.test(tMalo), tMalo.slice(0, 120));
  chequear('Un precio normal pasa intacto (esto no censura precios de verdad)',
           /36858\.89/.test(tBueno) && !/no es confiable/.test(tBueno), tBueno.slice(0, 160));
}

console.log(ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
