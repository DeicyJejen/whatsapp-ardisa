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

// Arnés: $('Nodo') resuelve fixtures; $input entrega los items de entrada.
// 2026-08-18: los nodos "Armar consulta" ya usan `await` (n8n envuelve el código del Code node en una
// función ASYNC, y ahí sí se puede). `new Function` no admite await de primer nivel, así que el arnés
// construye una AsyncFunction — si no, el nodo real compilaría y la prueba no.
// El tercer argumento simula `this.helpers` de n8n (el puente para consultar el MCP desde el nodo).
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
function correrCode(code, entrada, nodos, helpers) {
  const $ = (n) => {
    const v = nodos[n];
    const arr = Array.isArray(v) ? v : [v];
    return { first: () => ({ json: arr[0] }), all: () => arr.map(j => ({ json: j })), item: { json: arr[0] } };
  };
  const $input = { first: () => ({ json: entrada[0] }), all: () => entrada.map(j => ({ json: j })) };
  return new AsyncFunction('$', '$input', code).call({ helpers: helpers || null }, $, $input);
}

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det || ''))); };

(async () => {

const COT_REQ = { model: 'claude-sonnet-5', max_tokens: 700, system: 'REGLAS...',
  tools: [{ name: 'buscar_producto', input_schema: {} }],
  messages: [{ role: 'user', content: 'quiero cotizar cemento' }] };

// ══ 1. Repartir: el modelo TERMINÓ (texto) -> pasa derecho (Entregar recibe la respuesta tal cual) ══
{
  const resp = { content: [{ type: 'text', text: 'Manejamos cemento...' }], stop_reason: 'end_turn' };
  const out = await correrCode(REPARTIR, [resp], { 'Cerebro conversacional': { cot_req: COT_REQ } });
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
  const out = await correrCode(REPARTIR, [resp], { 'Cerebro conversacional': { cot_req: COT_REQ } });
  chequear('2 tool_use -> 2 items con nombre y argumentos',
           out.length === 2 && out[0].json.tuse.name === 'buscar_producto' && out[1].json.tuse.input.ciudad === 'Bucaramanga',
           JSON.stringify(out).slice(0, 150));
  chequear('la historia viaja: pregunta del cliente + turno assistant con los tool_use',
           out[0].json.historia.length === 2 && out[0].json.historia[1].role === 'assistant',
           JSON.stringify(out[0].json.historia).slice(0, 120));
}

// ══ 3. Repartir: error del API -> pasa derecho (Entregar lo trata como fallo -> asesor) ══
{
  const out = await correrCode(REPARTIR, [{ error: { message: 'overloaded' } }], { 'Cerebro conversacional': { cot_req: COT_REQ } });
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
  const out = await correrCode(ARMAR, entrada, {
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
  const out = await correrCode(ARMAR_FINAL, entrada, {
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
  const medio = await correrCode(ARMAR, entrada, {
    'Repartir herramientas R1': tuses, 'Cerebro conversacional': { cot_req: COT_REQ } });
  chequear('las vueltas intermedias NO prohíben herramientas',
           !medio[0].json.cot_req.tool_choice, JSON.stringify(medio[0].json.cot_req.tool_choice));
}

// ══ 6. Cerrar R4: red de seguridad (ya no debería saltar, pero si salta, el cliente no se pierde) ══
{
  const conTool = { content: [{ type: 'tool_use', id: 't', name: 'buscar_producto', input: {} }] };
  const out = await correrCode(CERRAR, [conTool], {});
  chequear('si aun así pidiera herramientas -> type error (mensaje neutro + asesor)',
           out[0].json.type === 'error', JSON.stringify(out).slice(0, 100));
  const final = { content: [{ type: 'text', text: 'Respuesta final' }], stop_reason: 'end_turn' };
  const out2 = await correrCode(CERRAR, [final], {});
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
  const out = await correrCode(ARMAR, [json(disponibilidad)], {
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
  const out2 = await correrCode(ARMAR, [json(soloAverias)], {
    'Repartir herramientas R1': tuses, 'Cerebro conversacional': { cot_req: COT_REQ } });
  const d2 = JSON.parse(out2[0].json.cot_req.messages.slice(-1)[0].content[0].content[0].text);
  chequear('Si lo único que hay son averías -> no hay disponibilidad',
           d2.hay_disponibilidad === false && d2.puntos_de_venta.length === 0, JSON.stringify(d2));
  // 2026-08-20 (demo de Deicy: pidió 20 varillas, la ciudad tenía 11 y el bot puso "✅ Con
  // disponibilidad"): sin ningún número el modelo NO PUEDE comparar contra la cantidad pedida y promete
  // lo que no hay. Cambio de contrato: viaja SOLO el agregado vendible de la ciudad (disponible_total,
  // sin averías) — el detalle por almacén (on_hand, warehouse) sigue sin salir, y al CLIENTE se le
  // sigue hablando sin cifras (regla 5a del prompt: "tu asesor te confirma la entrega completa").
  chequear('El detalle por almacén NO viaja, pero el total vendible SÍ (para comparar con lo pedido)',
           !/on_hand|warehouse/.test(txt) && d.disponible_total === 28, txt.slice(0, 200));
  chequear('Solo averías -> total vendible 0', d2.disponible_total === 0, JSON.stringify(d2));
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
  const pasar = async (o) => (await correrCode(ARMAR, [json(o)], {
    'Repartir herramientas R1': tuses, 'Cerebro conversacional': { cot_req: COT_REQ }
  }))[0].json.cot_req.messages.slice(-1)[0].content[0].content[0].text;
  const tMalo = await pasar(malo), tBueno = await pasar(bueno);
  chequear('Un precio absurdo NO llega al modelo (no puede decir "$4,77 la caja")',
           !/4\.77|4,77/.test(tMalo) && /asesor le confirma el valor/.test(tMalo), tMalo.slice(0, 200));
  chequear('El producto sigue existiendo: se responde disponibilidad, no se borra',
           /10030624/.test(tMalo) && /PORCELANATO/.test(tMalo), tMalo.slice(0, 120));
  chequear('Un precio normal pasa intacto (esto no censura precios de verdad)',
           /36858\.89/.test(tBueno) && !/no es confiable/.test(tBueno), tBueno.slice(0, 160));
}


// ══ 9. "¿Y EN QUÉ PUNTO SÍ LO TIENEN?" (2026-08-18) ══════════════════════════════════════════════
// Deicy, sobre la cotización del triplex fenólico: "acá debe decirle en cuál punto tiene, porque es una
// SOLA empresa". La regla estaba escrita, pero el modelo nunca llegó a usarla: en esa conversación gastó
// R1 y R2 buscando y en R3 —su último turno con herramientas— preguntó disponibilidad y precio. Se entera
// de que no hay justo cuando ya no puede consultar nada. Así que la consulta la hace n8n: si un artículo
// sale sin inventario en la ciudad del cliente, aquí se preguntan las demás y el hallazgo viaja PEGADO a
// ese resultado, listo para usarse aunque sea la última vuelta.
{
  const sse = (o) => ({ data: 'event: message\ndata: ' + JSON.stringify(o) + '\n' });
  const disp = (ciudad, hay) => ({ item_code: '10017102', item_name: 'TRIPLEX FENOLICO CMPC 9MM',
    ciudad_consultada: ciudad, ciudad_oficial: ciudad, unidad: 'Lámina', total_almacenes: 3,
    almacenes: hay ? [{ warehouse:'1', nombre_almacen:'CEDI ' + ciudad, punto_venta:'CEDI ' + ciudad,
                        tipo_almacen:'PRINCIPAL', on_hand:40, disponible:40 }]
                   : [{ warehouse:'1', nombre_almacen:'CEDI ' + ciudad, punto_venta:'CEDI ' + ciudad,
                        tipo_almacen:'PRINCIPAL', on_hand:0, disponible:0 }] });
  const CON_STOCK = ['Bogotá', 'Cali'];
  const llamadas = [];
  // `this.helpers.httpRequest` de mentira: initialize devuelve la sesión, y cada consulta responde según
  // la ciudad. Así se prueba la lógica sin tocar SAP.
  const helpers = { httpRequest: async (o) => {
    const body = typeof o.body === 'string' ? JSON.parse(o.body) : o.body;
    if (body.method === 'initialize') return { headers: { 'mcp-session-id': 'sid-123' }, body: {} };
    const ciu = body.params.arguments.ciudad;
    llamadas.push(ciu);
    return 'event: message\ndata: ' + JSON.stringify(
      { result: { content: [{ type: 'text', text: JSON.stringify(disp(ciu, CON_STOCK.indexOf(ciu) >= 0)) }] } }) + '\n';
  } };
  const tuses = [{ tuse: { id: 'tu_1', name: 'disponibilidad_ciudad', input: {} }, historia: [] }];
  const entrada = [sse({ result: { content: [{ type: 'text', text: JSON.stringify(disp('Bucaramanga', false)) }] } })];
  const nodos = { 'Repartir herramientas R1': tuses, 'Cerebro conversacional': { cot_req: COT_REQ },
                  'Unir pendiente': { cfg_mcp_url: 'https://mcp.ardisa.com/mcp', cfg_mcp_token: 'tok' } };
  const out = await correrCode(ARMAR, entrada, nodos, helpers);
  const d = JSON.parse(out[0].json.cot_req.messages.slice(-1)[0].content[0].content[0].text);
  chequear('Sin stock en su ciudad -> n8n pregunta por TODAS las demás, sin gastarle un turno al modelo',
           llamadas.length === 10 && llamadas.indexOf('Bucaramanga') < 0, JSON.stringify(llamadas));
  chequear('El resultado llega con las ciudades donde SÍ lo tenemos',
           Array.isArray(d.otras_ciudades) && d.otras_ciudades.length === 2 &&
           d.otras_ciudades.map(x => x.ciudad).join(',') === 'Bogotá,Cali', JSON.stringify(d.otras_ciudades));
  chequear('Y con el PUNTO de venta, que es lo que preguntó Deicy',
           /CEDI Bogotá/.test(JSON.stringify(d.otras_ciudades)), JSON.stringify(d.otras_ciudades));

  // Si no hay en ninguna parte, el campo llega VACÍO — que es distinto de "no se miró".
  const CERO = [];
  const helpers2 = { httpRequest: async (o) => {
    const body = typeof o.body === 'string' ? JSON.parse(o.body) : o.body;
    if (body.method === 'initialize') return { headers: { 'mcp-session-id': 's' }, body: {} };
    return 'event: message\ndata: ' + JSON.stringify({ result: { content: [{ type: 'text',
      text: JSON.stringify(disp(body.params.arguments.ciudad, false)) }] } }) + '\n';
  } };
  const out2 = await correrCode(ARMAR, entrada, nodos, helpers2);
  const d2 = JSON.parse(out2[0].json.cot_req.messages.slice(-1)[0].content[0].content[0].text);
  chequear('Si no hay en ninguna ciudad, el campo llega vacío (no ausente)',
           Array.isArray(d2.otras_ciudades) && d2.otras_ciudades.length === 0 && CERO.length === 0,
           JSON.stringify(d2));

  // Con stock en su propia ciudad NO se molesta a SAP: son 10 consultas que nadie necesita.
  const llamadas3 = [];
  const helpers3 = { httpRequest: async (o) => { llamadas3.push(1);
    return { headers: {}, body: {} }; } };
  const conStock = [sse({ result: { content: [{ type: 'text', text: JSON.stringify(disp('Bucaramanga', true)) }] } })];
  await correrCode(ARMAR, conStock, nodos, helpers3);
  chequear('Con inventario en su ciudad no se consulta nada más', llamadas3.length === 0, String(llamadas3.length));

  // Si el MCP se cae en mitad de la consulta, la cotización sigue: nunca peor que antes.
  const helpers4 = { httpRequest: async () => { throw new Error('ECONNREFUSED'); } };
  const out4 = await correrCode(ARMAR, entrada, nodos, helpers4);
  const d4 = JSON.parse(out4[0].json.cot_req.messages.slice(-1)[0].content[0].content[0].text);
  chequear('Si el MCP falla, el resultado original sigue llegando (sin otras_ciudades)',
           d4.item_code === '10017102' && d4.hay_disponibilidad === false && !d4.otras_ciudades,
           JSON.stringify(d4).slice(0, 160));
}

// ══ 10. BUSCAR CON LO QUE HAY EN SAP, NO CON LO QUE DIJO EL CLIENTE (2026-08-18) ══════════════════
// El buscador compara contra el NOMBRE del artículo: "pintura drywall" devuelve CERO (el nuestro se llama
// "vinilo drywall") y el cliente se va creyendo que no la manejamos. Ahora, ante un cero, n8n reintenta
// solo: parte la frase y prueba palabra por palabra, de la más específica a la más general.
{
  const sse = (o) => ({ data: 'event: message\ndata: ' + JSON.stringify(o) + '\n' });
  const CATALOGO = {                       // lo que el SAP de mentira sabe responder
    drywall: { total: 2, truncated: false, matches: [
      { item_code: '10025609', item_name: 'NOVAFLEX VINILO DRYWALL CIELOS 1G', unidad: 'Und' },
      { item_code: '10025610', item_name: 'NOVAFLEX VINILO DRYWALL CIELOS 5G', unidad: 'Und' }] },
    // "pintura" a secas arrastra media ferretería; "drywall" apunta a lo que el cliente quiere.
    pintura: { total: 25, truncated: true, matches: [
      { item_code: '10024839', item_name: 'ADAPTADOR 4 NAVES PINTURA BLANCA', unidad: 'Und' }] },
  };
  const buscadas = [];
  const helpers = { httpRequest: async (o) => {
    const body = typeof o.body === 'string' ? JSON.parse(o.body) : o.body;
    if (body.method === 'initialize') return { headers: { 'mcp-session-id': 's' }, body: {} };
    const q = body.params.arguments.q;
    buscadas.push(q);
    const r = CATALOGO[q] || { query: q, total: 0, truncated: false, matches: [] };
    return 'event: message\ndata: ' + JSON.stringify(
      { result: { content: [{ type: 'text', text: JSON.stringify(r) }] } }) + '\n';
  } };
  const nodos = { 'Repartir herramientas R1': [{ tuse: { id: 't1', name: 'buscar_producto',
                    input: { q: 'pintura para drywall', limit: 25 } }, historia: [] }],
                  'Cerebro conversacional': { cot_req: COT_REQ },
                  'Unir pendiente': { cfg_mcp_url: 'https://mcp.ardisa.com/mcp', cfg_mcp_token: 'tok' } };
  const cero = [sse({ result: { content: [{ type: 'text',
    text: JSON.stringify({ query: 'pintura para drywall', total: 0, truncated: false, matches: [] }) }] } })];
  const out = await correrCode(ARMAR, cero, nodos, helpers);
  const d = JSON.parse(out[0].json.cot_req.messages.slice(-1)[0].content[0].content[0].text);
  chequear('Una búsqueda en cero se reintenta sola con el vocabulario del catálogo',
           d.total === 2 && d.busqueda_usada === 'drywall', JSON.stringify(d).slice(0, 180));
  chequear('Gana la palabra específica sobre la genérica, y el relleno ni se busca',
           buscadas.indexOf('drywall') >= 0 && buscadas.indexOf('para') < 0, JSON.stringify(buscadas));
  chequear('Y le dice al modelo que NO responda "no lo manejamos"',
           /NO le digas al cliente que no lo manejamos/.test(d.nota || ''), String(d.nota).slice(0, 120));

  // Una búsqueda CON resultados no se toca: reintentar ahí solo traería ruido.
  const buscadas2 = [];
  const helpers2 = { httpRequest: async () => { buscadas2.push(1); return { headers: {}, body: {} }; } };
  const conResultados = [sse({ result: { content: [{ type: 'text',
    text: JSON.stringify(CATALOGO.drywall) }] } })];
  await correrCode(ARMAR, conResultados, nodos, helpers2);
  chequear('Si la búsqueda encontró algo, no se reintenta nada', buscadas2.length === 0, String(buscadas2.length));

  // Una sola palabra Y sin más texto del cliente de dónde sacar candidatas: no hay nada que probar en SAP.
  // (La tienda en línea sí se consulta — es otro buscador, no un recorte del mismo.)
  const sap3 = [];
  const helpers3 = { httpRequest: async (o) => {
    if (String(o.url).indexOf('graphql') >= 0) return { data: { products: { items: [] } } };
    sap3.push(1); return { headers: {}, body: {} };
  } };
  const nodos3 = Object.assign({}, nodos, {
    'Repartir herramientas R1': [{ tuse: { id: 't1', name: 'buscar_producto', input: { q: 'tornillo' } }, historia: [] }],
    'Cerebro conversacional': { cot_req: Object.assign({}, COT_REQ, { messages: [{ role:'user', content:'tornillo' }] }),
                                ses_out: JSON.stringify({ marca:'Ardisa' }) } });
  const cero3 = [sse({ result: { content: [{ type: 'text',
    text: JSON.stringify({ query: 'tornillo', total: 0, truncated: false, matches: [] }) }] } })];
  await correrCode(ARMAR, cero3, nodos3, helpers3);
  chequear('Con una sola palabra no hay nada que recortar: no se reintenta en SAP', sap3.length === 0, String(sap3.length));
}

// ══ 11. LA TIENDA EN LÍNEA COMO SEGUNDO BUSCADOR (2026-08-18) ═══════════════════════════════════
// El buscador de SAP compara contra el nombre del artículo; el de la tienda (OpenSearch de Magento)
// entiende el idioma del cliente. "pintura drywall" da CERO en SAP y encuentra la referencia correcta en
// la web — y el SKU es el mismo, así que sirve de traductor. De la web se toma el CÓDIGO, nunca el precio.
{
  const sse = (o) => ({ data: 'event: message\ndata: ' + JSON.stringify(o) + '\n' });
  const pedidos = [];
  const helpers = { httpRequest: async (o) => {
    if (String(o.url).indexOf('graphql') >= 0) {
      pedidos.push(o.body.query);
      if (/search:"[^"]*drywall/i.test(o.body.query)) return { data: { products: { total_count: 315, items: [
        { sku: '10007436', name: 'Pintura Para Drywall Pintuco Blanco', url_key: 'pintura-drywall-pintuco' } ] } } };
      return { data: { products: { items: [] } } };
    }
    // el MCP: aquí solo se usa para el reintento por palabras, que también vuelve vacío
    return 'event: message\ndata: ' + JSON.stringify({ result: { content: [{ type: 'text',
      text: JSON.stringify({ total: 0, matches: [] }) }] } }) + '\n';
  } };
  const nodos = { 'Repartir herramientas R1': [{ tuse: { id: 't1', name: 'buscar_producto',
                    input: { q: 'pintura para drywall' } }, historia: [] }],
                  'Cerebro conversacional': { cot_req: COT_REQ, ses_out: JSON.stringify({ marca: 'Ardisa' }) },
                  'Unir pendiente': { cfg_mcp_url: 'https://mcp.ardisa.com/mcp', cfg_mcp_token: 'tok' } };
  const cero = [sse({ result: { content: [{ type: 'text',
    text: JSON.stringify({ query: 'pintura para drywall', total: 0, matches: [] }) }] } })];
  const out = await correrCode(ARMAR, cero, nodos, helpers);
  const d = JSON.parse(out[0].json.cot_req.messages.slice(-1)[0].content[0].content[0].text);
  chequear('Si SAP no encuentra nada, se busca en la tienda de la marca del cliente',
           Array.isArray(d.catalogo_tienda) && d.catalogo_tienda[0].item_code === '10007436',
           JSON.stringify(d).slice(0, 200));
  chequear('Y se le dice al modelo que consulte precio y disponibilidad con ese código, no con la web',
           /NO uses los precios de esta lista/.test(d.nota || ''), String(d.nota).slice(0, 140));
  chequear('Se consulta la tienda de ARDISA (la marca que eligió el cliente)',
           pedidos.length > 0, String(pedidos.length));

  // El cliente de Carpincentro va a la tienda de Carpincentro.
  const urls = [];
  const helpers2 = { httpRequest: async (o) => { urls.push(o.url);
    return String(o.url).indexOf('graphql') >= 0 ? { data: { products: { items: [] } } }
      : 'event: message\ndata: ' + JSON.stringify({ result: { content: [{ type: 'text',
          text: JSON.stringify({ total: 0, matches: [] }) }] } }) + '\n'; } };
  const nodosC = Object.assign({}, nodos, { 'Cerebro conversacional': { cot_req: COT_REQ,
    ses_out: JSON.stringify({ marca: 'Carpincentro' }) } });
  await correrCode(ARMAR, cero, nodosC, helpers2);
  chequear('Un cliente de Carpincentro consulta la tienda de Carpincentro',
           urls.some(u => /carpincentro\.com\/graphql/.test(u)) && !urls.some(u => /ardisa\.com\/graphql/.test(u)),
           JSON.stringify(urls));
}

// ══ 12. EL ENLACE SOLO SI EL PRECIO COINCIDE ════════════════════════════════════════════════════
// La pintura Pintuco figura en la web a $226.243 y en SAP a $323.205. Mandar ese link sería enseñarle al
// cliente un precio distinto del que le acabamos de dar: peor que no mandar nada.
{
  const sse = (o) => ({ data: 'event: message\ndata: ' + JSON.stringify(o) + '\n' });
  const precio = (v) => ({ item_code: '10024109', item_name: 'CEMENTO GRIS ALION BULTO X 25kg',
                           precio_con_iva: v, unidad_venta: { unidad: 'Und' } });
  const web = (v) => ({ httpRequest: async (o) => {
    if (String(o.url).indexOf('graphql') >= 0) return { data: { products: { items: [
      { sku: '10024109', url_key: 'cemento-gris-alion-bulto-x-25kg',
        price_range: { minimum_price: { final_price: { value: v } } } } ] } } };
    return { headers: {}, body: {} };
  } });
  const nodos = { 'Repartir herramientas R1': [{ tuse: { id: 't1', name: 'precio_articulo', input: {} }, historia: [] }],
                  'Cerebro conversacional': { cot_req: COT_REQ, ses_out: JSON.stringify({ marca: 'Ardisa' }) },
                  'Unir pendiente': { cfg_mcp_url: 'https://mcp.ardisa.com/mcp', cfg_mcp_token: 'tok' } };
  const pasa = async (vSap, vWeb) => {
    const e = [sse({ result: { content: [{ type: 'text', text: JSON.stringify(precio(vSap)) }] } })];
    const o = await correrCode(ARMAR, e, nodos, web(vWeb));
    return JSON.parse(o[0].json.cot_req.messages.slice(-1)[0].content[0].content[0].text);
  };
  const igual = await pasa(20999.93, 20999.93);
  const distinto = await pasa(323205.65, 226243.95);
  chequear('Precio igual en la web -> se manda el enlace del producto',
           /ardisa\.com\/cemento-gris-alion-bulto-x-25kg\.html/.test(igual.url_tienda || ''), String(igual.url_tienda));
  chequear('Precio distinto -> NO se manda enlace (el cliente vería otro número)',
           !distinto.url_tienda, String(distinto.url_tienda));
  chequear('Y el precio que viaja al modelo sigue siendo el de SAP, nunca el de la web',
           igual.precio_con_iva === 20999.93 && distinto.precio_con_iva === 323205.65,
           igual.precio_con_iva + ' / ' + distinto.precio_con_iva);
}

// ══ 13. "TAMBOR DE ACRONAL NOVAFLEX" (2026-08-18) ═══════════════════════════════════════════════
// El modelo buscó SOLO "acronal" —una palabra, nada que recortar— le dio 0 y se rindió explicándole al
// cliente que Acronal es una resina de BASF. En el mismo mensaje estaba "novaflex", que devuelve 25
// productos nuestros. Cuando la búsqueda fallida es corta, se miran también las otras palabras de lo que
// escribió el cliente: la gente mezcla marca, presentación y producto en la misma frase.
{
  const sse = (o) => ({ data: 'event: message\ndata: ' + JSON.stringify(o) + '\n' });
  const buscadas = [];
  const helpers = { httpRequest: async (o) => {
    if (String(o.url).indexOf('graphql') >= 0) return { data: { products: { items: [] } } };
    const body = typeof o.body === 'string' ? JSON.parse(o.body) : o.body;
    if (body.method === 'initialize') return { headers: { 'mcp-session-id': 's' }, body: {} };
    const q = body.params.arguments.q;
    buscadas.push(q);
    const r = (q === 'novaflex')
      ? { query:q, total: 25, truncated: true, matches: [
          { item_code:'10026433', item_name:'CANASTILLA NOVAFLEX PARA RECINA ACRILICA', unidad:'Und' }] }
      : { query:q, total: 0, truncated: false, matches: [] };
    return 'event: message\ndata: ' + JSON.stringify(
      { result: { content: [{ type: 'text', text: JSON.stringify(r) }] } }) + '\n';
  } };
  const REQ = Object.assign({}, COT_REQ, { messages: [{ role:'user', content:'Tambor de acronal novaflex' }] });
  const nodos = { 'Repartir herramientas R1': [{ tuse: { id:'t1', name:'buscar_producto',
                    input: { q:'acronal', limit:25 } }, historia: [] }],
                  'Cerebro conversacional': { cot_req: REQ, ses_out: JSON.stringify({ marca:'Ardisa' }) },
                  'Unir pendiente': { cfg_mcp_url:'https://mcp.ardisa.com/mcp', cfg_mcp_token:'tok' } };
  const cero = [sse({ result: { content: [{ type:'text',
    text: JSON.stringify({ query:'acronal', total:0, truncated:false, matches:[] }) }] } })];
  const out = await correrCode(ARMAR, cero, nodos, helpers);
  const d = JSON.parse(out[0].json.cot_req.messages.slice(-1)[0].content[0].content[0].text);
  chequear('Con "acronal" en cero, se prueban las otras palabras que escribió el cliente',
           buscadas.indexOf('novaflex') >= 0, JSON.stringify(buscadas));
  chequear('Y le llegan los 25 productos que sí tenemos, no un "no lo manejamos"',
           d.total === 25 && d.busqueda_usada === 'novaflex', JSON.stringify(d).slice(0, 170));
  chequear('"tambor" no se busca: es una presentación, no un producto',
           buscadas.indexOf('tambor') < 0, JSON.stringify(buscadas));
}

// ══ LAS MEDIDAS SON PARTE DEL NOMBRE (2026-08-20, el MDF 2.7mm de Deicy) ═════════════════════════
// "Lámina MDF de 2.7 mm de 2.44 x 1.83 m": el limpiador botaba los números y buscaba "mdf" a secas ->
// 25 "FONDO..." y el verdadero "MDF 183X244X2.5 CRUDO" (130 láminas en Barranquilla) quedaba fuera del
// tope. El bot dijo "no lo manejamos" con inventario en la mano. Las medidas en metros se traducen a los
// centímetros del catálogo (2.44->244, 1.83->183) y se prueban pegadas a la palabra del producto.
{
  const sse = (o) => ({ data: 'event: message\ndata: ' + JSON.stringify(o) + '\n' });
  const buscadas = [];
  const helpers = { httpRequest: async (o) => {
    if (String(o.url).indexOf('graphql') >= 0) return { data: { products: { items: [] } } };
    const body = typeof o.body === 'string' ? JSON.parse(o.body) : o.body;
    if (body.method === 'initialize') return { headers: { 'mcp-session-id': 's' }, body: {} };
    const q = body.params.arguments.q;
    buscadas.push(q);
    const r = (q === 'mdf 183')
      ? { query:q, total: 3, truncated: false, matches: [
          { item_code:'10012541', item_name:'MDF 183X244X2.5 CRUDO A', unidad:'Lámina' },
          { item_code:'10019449', item_name:'MDF 183X244X2.5 CRUDO C', unidad:'Lámina' },
          { item_code:'10033475', item_name:'MDF 183X244X2.5 CRUDO DX', unidad:'Lámina' }] }
      : (q === 'mdf')
      ? { query:q, total: 40, truncated: true, matches: [
          { item_code:'10010398', item_name:'FONDO PINTUFONDO MDF BLANCO 185X244X3', unidad:'Lámina' }] }
      : { query:q, total: 0, truncated: false, matches: [] };
    return 'event: message\ndata: ' + JSON.stringify(
      { result: { content: [{ type: 'text', text: JSON.stringify(r) }] } }) + '\n';
  } };
  const REQ = Object.assign({}, COT_REQ, { messages: [{ role:'user', content:'necesito cotizar Lamina MDF de 2.7 mm de 2.44 x 1.83 m' }] });
  const nodos = { 'Repartir herramientas R1': [{ tuse: { id:'t1', name:'buscar_producto',
                    input: { q:'lamina mdf 2.7', limit:25 } }, historia: [] }],
                  'Cerebro conversacional': { cot_req: REQ, ses_out: JSON.stringify({ marca:'Carpincentro' }) },
                  'Unir pendiente': { cfg_mcp_url:'https://mcp.ardisa.com/mcp', cfg_mcp_token:'tok' } };
  const cero = [sse({ result: { content: [{ type:'text',
    text: JSON.stringify({ query:'lamina mdf 2.7', total:0, truncated:false, matches:[] }) }] } })];
  const out = await correrCode(ARMAR, cero, nodos, helpers);
  const d = JSON.parse(out[0].json.cot_req.messages.slice(-1)[0].content[0].content[0].text);
  chequear('Se intenta la palabra + la medida en centímetros ("mdf 183")',
           buscadas.indexOf('mdf 183') >= 0, JSON.stringify(buscadas));
  chequear('Y gana el MDF CRUDO exacto, no los 40 FONDO genéricos',
           d.busqueda_usada === 'mdf 183' && d.total === 3 && /CRUDO/.test(JSON.stringify(d.matches)),
           JSON.stringify(d).slice(0, 200));
}

// ══ EL PROMPT LE ORDENA COMPARAR (2026-08-20, las 20 varillas) ═══════════════════════════════════
// El dato solo sirve si la instrucción existe: si alguien borra la regla 5a del prompt, el modelo
// vuelve a poner "✅ Con disponibilidad" con 11 unidades para un pedido de 20.
{
  const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');
  chequear('La regla 5a existe: comparar disponible_total con la cantidad pedida',
           /5a\).*disponible_total/.test(CEREBRO) && /entrega completa/.test(CEREBRO),
           'no se halló la regla 5a con disponible_total en el prompt del Cerebro');
}

console.log(ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);

})();
