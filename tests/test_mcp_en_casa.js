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

// ══ 4b. RECORTAR CON CRITERIO (2026-08-25, 2ª prueba de melaminas de Deicy) ══════════════════════
// "melaminico" devolvió 25 productos de SAP. El resultado se cortaba a 4.000 caracteres A LO BRUTO y la
// lista de fichas de la tienda —que va al FINAL del JSON— quedó partida en seco:
//        ...{"item_code":"10031840","i
// Los enlaces desaparecieron (lo único que el cliente estaba esperando) y al modelo le llegó un JSON roto.
// Ahora se quitan PRODUCTOS ENTEROS hasta que quepa, y las fichas de la tienda sobreviven siempre.
{
  const gordo = { query:'melaminico', total:25, truncated:true,
    matches: Array.from({length:25}, (_,i) => ({ item_code:'100'+(10000+i), unidad:'Lámina', grupo:217,
      item_name:'MELAMINICO MADECOR PB RH COLOR NUMERO '+i+' PORO 153X244X15 1C RELLENO DE TEXTO' })),
    catalogo_tienda: [
      { item_code:'10031840', item_name:'Melaminico Supercor Pb RH Perla Tex Soft 183X244X15',
        url_tienda:'https://www.carpincentro.com/10031840.html' },
      { item_code:'10010332', item_name:'Melaminico Vesto Mdp RH Blanco 215X244X15',
        url_tienda:'https://www.carpincentro.com/10010332.html' } ] };
  const tuses = [{ tuse:{ id:'tu_1', name:'buscar_producto', input:{ q:'melaminico' } },
                   historia:[{ role:'user', content:'melaminico' }, { role:'assistant', content:[] }] }];
  const sse = (o) => ({ data: 'event: message\ndata: ' + JSON.stringify(o) + '\n' });
  const out = await correrCode(ARMAR, [sse({ result:{ content:[{ type:'text', text: JSON.stringify(gordo) }] } })],
    { 'Repartir herramientas R1': tuses, 'Cerebro conversacional': { cot_req: COT_REQ } });
  const req2 = out[0].json.cot_req;
  const texto = req2.messages[req2.messages.length - 1].content[0].content[0].text;
  chequear('El resultado recortado sigue siendo JSON VÁLIDO (antes llegaba partido a la mitad)',
           (() => { try { JSON.parse(texto); return true; } catch(e){ return false; } })(),
           texto.slice(-120));
  chequear('Los ENLACES de la tienda sobreviven al recorte',
           /10031840\.html/.test(texto) && /10010332\.html/.test(texto), texto.slice(-200));
  chequear('Se quitan productos enteros de la lista de SAP, no letras',
           (() => { try { const o=JSON.parse(texto); return o.matches.length < 25 && o.matches.length >= 1
                          && o.matches.every(m => m.item_code && m.item_name); } catch(e){ return false; } })(),
           texto.slice(0, 160));
  chequear('Y se le AVISA al modelo cuántos quedaron fuera (para que vuelva a buscar mejor)',
           (() => { try { return /De 25 resultados/.test(JSON.parse(texto).recorte||''); } catch(e){ return false; } })(),
           texto.slice(0, 200));
  chequear('Nunca se pasa del cupo de 4.000 caracteres', [...texto].length <= 4000, 'largo=' + [...texto].length);
}
// Un resultado que YA cabe no se toca (no se le inventa un aviso de recorte).
{
  const chico = { query:'cemento', total:1, matches:[{ item_code:'10025215', item_name:'CEMENTO GRIS' }] };
  const tuses = [{ tuse:{ id:'tu_1', name:'buscar_producto', input:{} }, historia:[{ role:'user', content:'x' }] }];
  const sse = (o) => ({ data: 'event: message\ndata: ' + JSON.stringify(o) + '\n' });
  const out = await correrCode(ARMAR, [sse({ result:{ content:[{ type:'text', text: JSON.stringify(chico) }] } })],
    { 'Repartir herramientas R1': tuses, 'Cerebro conversacional': { cot_req: COT_REQ } });
  const req2 = out[0].json.cot_req;
  const texto = req2.messages[req2.messages.length - 1].content[0].content[0].text;
  chequear('Lo que cabe pasa intacto y sin aviso de recorte',
           /10025215/.test(texto) && !/recorte/.test(texto), texto.slice(0, 140));
}

// ══ 4c. NO SE OFRECE LO QUE NO SE TIENE (2026-08-25, "solo tengo alion") ═════════════════════════
// Deicy pidió cemento y el bot le ofreció "Cemex, Alion y Oriente". No se las inventó: las tres están en
// SAP como códigos válidos. Pero medido contra el servidor ese mismo día: ALION 2.388 bultos, CEMEX 0.
// Son referencias del maestro de artículos que hoy no se venden. La búsqueda devuelve el CATÁLOGO; lo que
// el cliente puede comprar es catálogo ∩ inventario. Decide el CÓDIGO (salen de la lista), no el prompt.
{
  const dispo = { '10021733': 2388, '10014960': 0, '10011990': 0 };   // Alion / Cemex 42.5 / Cemex 50
  const helpersS = { httpRequest: async (o) => {
    const body = typeof o.body === 'string' ? JSON.parse(o.body) : (o.body || {});
    if (String(o.url || '').indexOf('graphql') >= 0) return { data:{ products:{ items:[] } } };
    if (body.method === 'initialize') return { headers:{ 'mcp-session-id':'ses-x' }, body:{} };
    if (body.params && body.params.name === 'disponibilidad_ciudad') {
      const ic = body.params.arguments.item_code;
      return 'event: message\ndata: ' + JSON.stringify({ result:{ content:[{ type:'text',
        text: JSON.stringify({ item_code:ic, almacenes:[
          { punto_venta:'CEDI', tipo_almacen:'VENTA', disponible: dispo[ic] },
          { punto_venta:'AVERIAS', tipo_almacen:'AVERIA', disponible: 99 }] }) }] } }) + '\n';
    }
    return 'event: message\ndata: ' + JSON.stringify({ result:{ content:[{ type:'text',
      text: JSON.stringify({ query:'x', total:0, matches:[] }) }] } }) + '\n';
  } };
  const nodosS = { 'Repartir herramientas R1': [{ tuse:{ id:'t1', name:'buscar_producto', input:{ q:'cemento gris' } },
                     historia:[] }],
                   'Cerebro conversacional': { cot_req: COT_REQ,
                     ses_out: JSON.stringify({ marca:'Ardisa', ciudad:'Bucaramanga' }) },
                   'Unir pendiente': { cfg_mcp_url:'https://mcp.ardisa.com/mcp', cfg_mcp_token:'tok', cfg_fuente:'mcp' } };
  const sseS = (o) => ({ data: 'event: message\ndata: ' + JSON.stringify(o) + '\n' });
  const busq = [sseS({ result:{ content:[{ type:'text', text: JSON.stringify({ query:'cemento gris', total:3,
    matches:[ { item_code:'10021733', item_name:'CEMENTO GRIS ALION BULTO X 50kg', precio_con_iva:27500 },
              { item_code:'10014960', item_name:'CEMENTO GRIS CEMEX BULTO X 42.5kg', precio_con_iva:26000 },
              { item_code:'10011990', item_name:'CEMENTO GRIS CEMEX BULTO X 50kg', precio_con_iva:27000 } ] }) }] } })];
  const oS = await correrCode(ARMAR, busq, nodosS, helpersS);
  const rS = JSON.parse(oS[0].json.cot_req.messages.slice(-1)[0].content[0].content[0].text);
  const marcas = (rS.matches || []).map(m => m.item_name).join(' | ');
  chequear('Las referencias SIN existencias salen de la lista (Cemex fuera)',
           !/CEMEX/i.test(marcas), marcas);
  chequear('Y la que sí se tiene se queda (Alion dentro)', /ALION/i.test(marcas), marcas);
  chequear('Se le avisa al modelo que se quitaron, para que no las nombre de memoria',
           /Se quitaron 2 referencias/.test(String(rS.nota_stock || '')), String(rS.nota_stock || ''));
  chequear('La existencia viaja como dato (y la AVERÍA no se cuenta como vendible)',
           Number((rS.matches[0] || {}).disponible_total) === 2388,
           JSON.stringify(rS.matches[0] || {}).slice(0, 140));
}
// GUARDARRAÍL: si NINGUNO tiene existencias, la lista NO se vacía — el cliente merece saber que se maneja
// y que su asesor confirma, no un "no lo tenemos" falso.
{
  const helpersV = { httpRequest: async (o) => {
    const body = typeof o.body === 'string' ? JSON.parse(o.body) : (o.body || {});
    if (String(o.url || '').indexOf('graphql') >= 0) return { data:{ products:{ items:[] } } };
    if (body.method === 'initialize') return { headers:{ 'mcp-session-id':'ses-y' }, body:{} };
    if (body.params && body.params.name === 'disponibilidad_ciudad')
      return 'event: message\ndata: ' + JSON.stringify({ result:{ content:[{ type:'text',
        text: JSON.stringify({ almacenes:[{ punto_venta:'CEDI', tipo_almacen:'VENTA', disponible:0 }] }) }] } }) + '\n';
    return 'event: message\ndata: ' + JSON.stringify({ result:{ content:[{ type:'text',
      text: JSON.stringify({ query:'x', total:0, matches:[] }) }] } }) + '\n';
  } };
  const nodosV = { 'Repartir herramientas R1': [{ tuse:{ id:'t1', name:'buscar_producto', input:{} }, historia:[] }],
                   'Cerebro conversacional': { cot_req: COT_REQ, ses_out: JSON.stringify({ marca:'Ardisa', ciudad:'Bucaramanga' }) },
                   'Unir pendiente': { cfg_mcp_url:'https://mcp.ardisa.com/mcp', cfg_mcp_token:'tok', cfg_fuente:'mcp' } };
  const sseV = (o) => ({ data: 'event: message\ndata: ' + JSON.stringify(o) + '\n' });
  const oV = await correrCode(ARMAR, [sseV({ result:{ content:[{ type:'text', text: JSON.stringify({ query:'x', total:2,
    matches:[{ item_code:'A1', item_name:'PRODUCTO A' }, { item_code:'A2', item_name:'PRODUCTO B' }] }) }] } })],
    nodosV, helpersV);
  const rV = JSON.parse(oV[0].json.cot_req.messages.slice(-1)[0].content[0].content[0].text);
  chequear('Si NINGUNO tiene existencias, la lista se conserva entera',
           (rV.matches || []).length === 2 && !rV.nota_stock, JSON.stringify(rV).slice(0, 160));
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
                  'Unir pendiente': { cfg_mcp_url: 'https://mcp.ardisa.com/mcp', cfg_mcp_token: 'tok', cfg_fuente: 'mcp' } };
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
  // 2026-08-25: se cuenta SOLO lo que va a SAP. La consulta a la TIENDA (ficha y enlace del producto) es
  // otro sistema y sí debe ocurrir — desde hoy también cuando no tenemos precio.
  const llamadas3 = [], tienda3 = [];
  const helpers3 = { httpRequest: async (o) => {
    const u = String(o.url || '');
    if (u.indexOf('graphql') >= 0 || u.indexOf('/rest/') >= 0) { tienda3.push(1); return { data: { products: { items: [] } } }; }
    llamadas3.push(1); return { headers: {}, body: {} }; } };
  const conStock = [sse({ result: { content: [{ type: 'text', text: JSON.stringify(disp('Bucaramanga', true)) }] } })];
  await correrCode(ARMAR, conStock, nodos, helpers3);
  chequear('Con inventario en su ciudad no se le consulta nada más a SAP', llamadas3.length === 0, String(llamadas3.length));

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
                  'Unir pendiente': { cfg_mcp_url: 'https://mcp.ardisa.com/mcp', cfg_mcp_token: 'tok', cfg_fuente: 'mcp' } };
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

  // === EL CORRECTOR DE ORTOGRAFÍA (2026-08-24, "sanitario Elongado" de Deicy) ===
  // El catálogo dice ALONGADO. El reintento interno "acertaba" tirando la palabra mal escrita (se quedaba
  // con "sanitario": 25 genéricos) y con eso se saltaba el buscador de la tienda, que es el único que
  // corrige. Ahora se consultan LAS DOS y el modelo recibe también los nombres bien escritos con su
  // item_code. Y si la tienda falla, el reintento NO se puede perder (Promise.all falla en bloque).
  {
    const CAT2 = { sanitario: { total: 25, truncated: true, matches: [
                     { item_code: '10009999', item_name: 'SANITARIO GENERICO', unidad: 'Und' }] } };
    const tienda = (o) => String(o.url || '').indexOf('/graphql') >= 0;
    const mkHelpers = (tiendaResponde) => ({ httpRequest: async (o) => {
      if (tienda(o)) {
        if (!tiendaResponde) throw new Error('tienda caída');
        return { data: { products: { items: [
          { sku: '10034102', name: 'Sanitario Montecarlo Alongado Single Blanco',
            url_key: 'sanitario-montecarlo-alongado-single-blanco' }] } } };
      }
      const body = typeof o.body === 'string' ? JSON.parse(o.body) : o.body;
      if (body.method === 'initialize') return { headers: { 'mcp-session-id': 's' }, body: {} };
      const q = body.params.arguments.q;
      return 'event: message\ndata: ' + JSON.stringify({ result: { content: [{ type: 'text',
        text: JSON.stringify(CAT2[q] || { query: q, total: 0, truncated: false, matches: [] }) }] } }) + '\n';
    } });
    const nodos2 = { 'Repartir herramientas R1': [{ tuse: { id: 't1', name: 'buscar_producto',
                       input: { q: 'sanitario elongado', limit: 25 } }, historia: [] }],
                     'Cerebro conversacional': { cot_req: COT_REQ },
                     'Unir pendiente': { cfg_mcp_url: 'https://mcp.ardisa.com/mcp', cfg_mcp_token: 'tok', cfg_fuente: 'mcp' } };
    const cero2 = [sse({ result: { content: [{ type: 'text', text: JSON.stringify(
      { query: 'sanitario elongado', total: 0, truncated: false, matches: [] }) }] } })];

    const o1 = await correrCode(ARMAR, cero2, nodos2, mkHelpers(true));
    const r1 = JSON.parse(o1[0].json.cot_req.messages.slice(-1)[0].content[0].content[0].text);
    chequear('Lo mal escrito se corrige: llega el nombre del catálogo con su item_code',
             !!(r1.catalogo_tienda || []).length &&
             /Alongado/.test(r1.catalogo_tienda[0].item_name) &&
             r1.catalogo_tienda[0].item_code === '10034102', JSON.stringify(r1).slice(0, 200));
    chequear('Y el reintento interno NO se pierde por consultar la tienda',
             r1.total === 25, JSON.stringify(r1).slice(0, 120));

    const o2 = await correrCode(ARMAR, cero2, nodos2, mkHelpers(false));
    const r2 = JSON.parse(o2[0].json.cot_req.messages.slice(-1)[0].content[0].content[0].text);
    chequear('Si la TIENDA se cae, el resultado del reintento igual llega (no falla en bloque)',
             r2.total === 25, JSON.stringify(r2).slice(0, 120));
  }

  // Una búsqueda CON resultados no se toca: reintentar ahí solo traería ruido.
  // 2026-08-24: se cuenta SOLO lo que va a SAP. Desde hoy la tienda opina siempre (decisión de Deicy,
  // caso Eterboard), y esa llamada es a otro buscador — lo que esta prueba fija es que a SAP no se le
  // vuelve a preguntar cuando ya respondió con resultados.
  const buscadas2 = [], tienda2 = [];
  const helpers2 = { httpRequest: async (o) => {
    if (String(o.url || '').indexOf('graphql') >= 0) { tienda2.push(1); return { data: { products: { items: [] } } }; }
    buscadas2.push(1); return { headers: {}, body: {} }; } };
  const conResultados = [sse({ result: { content: [{ type: 'text',
    text: JSON.stringify(CATALOGO.drywall) }] } })];
  await correrCode(ARMAR, conResultados, nodos, helpers2);
  chequear('Si la búsqueda encontró algo, no se le vuelve a preguntar a SAP', buscadas2.length === 0, String(buscadas2.length));
  chequear('Pero la tienda SÍ opina aunque SAP haya encontrado (caso Eterboard)', tienda2.length >= 1, String(tienda2.length));

  // === SI SAP NO CONTESTA, CONTESTA LA PÁGINA (2026-08-24, caso Eterboard) ===
  // A las 15:38 "eterboard" y "fibrocemento" murieron con "la herramienta no respondió". Al modelo solo le
  // llegó "drywall", y con eso le dijo a la clienta que NO manejábamos Eterboard (hay 16 fichas publicadas)
  // y le ofreció MDP. Una consulta que falla NO es un "no lo manejamos".
  {
    const helpersE = { httpRequest: async (o) => {
      if (String(o.url || '').indexOf('graphql') >= 0) {
        return { data: { products: { items: [
          { sku: '10012852', name: 'Lamina Eterboard  122X244X 4Mm', url_key: 'lamina-eterboard-122x244x4mm' }] } } };
      }
      return { headers: { 'mcp-session-id': 's' }, body: {} };
    } };
    const nodosE = { 'Repartir herramientas R1': [{ tuse: { id: 't1', name: 'buscar_producto',
                       input: { q: 'eterboard', limit: 25 } }, historia: [] }],
                     'Cerebro conversacional': { cot_req: COT_REQ },
                     'Unir pendiente': { cfg_mcp_url: 'https://mcp.ardisa.com/mcp', cfg_mcp_token: 'tok', cfg_fuente: 'mcp' } };
    const muerta = [{ data: 'ERROR: la herramienta no respondió' }];
    const oE = await correrCode(ARMAR, muerta, nodosE, helpersE);
    const rE = JSON.parse(oE[0].json.cot_req.messages.slice(-1)[0].content[0].content[0].text);
    chequear('Búsqueda muerta -> la página la rescata con item_code válido',
             !!(rE.catalogo_tienda || []).length && rE.catalogo_tienda[0].item_code === '10012852',
             JSON.stringify(rE).slice(0, 180));
    chequear('Y se le prohíbe al modelo decir "no lo manejamos" u ofrecer otro producto',
             /PROHIBIDO decirle al cliente que no manejamos/.test(rE.nota || '') &&
             /PROHIBIDO ofrecerle un producto distinto/.test(rE.nota || ''), String(rE.nota).slice(0, 140));
  }

  // === LOS PRECIOS LOS TRAE n8n, SIN GASTAR VUELTAS DEL MODELO (2026-08-24) ===
  // Deicy: "este es para que dé precios, no para que le diga que un asesor se los da". Con el MCP lento el
  // modelo se quedaba sin vueltas antes de preguntar el precio y respondía "un asesor te confirma" con el
  // dato disponible en SAP (caso MDF Duratex: $116.966 existía). Ahora n8n pide el precio de los primeros
  // resultados de cada búsqueda y se los entrega ya resueltos.
  {
    const helpersP = { httpRequest: async (o) => {
      const body = typeof o.body === 'string' ? JSON.parse(o.body) : (o.body || {});
      if (String(o.url || '').indexOf('/rest/') >= 0) return { sku: 'x', status: 1, visibility: 4,
                                                                extension_attributes: { website_ids: [1, 2] } };
      if (String(o.url || '').indexOf('graphql') >= 0) {
        // la ficha del producto que se está consultando (el sku va dentro de la consulta)
        // 25-ago: la consulta ahora pide TODAS las fichas de una (`sku:{in:[...]}`), así que el
        // simulador tiene que devolver TODAS las que aparezcan, no solo la primera. Antes devolvía una
        // y la prueba se volvía mentirosa: pasaba con la mitad del trabajo hecho.
        const q = JSON.stringify(body || {});
        const ms = q.match(/1000852[45]/g) || [];
        const vistos = [];
        ms.forEach(function (k) { if (vistos.indexOf(k) < 0) vistos.push(k); });
        return { data: { products: { items: vistos.map(function (k) {
                 return { sku: k, url_key: 'mdf-duratex-' + k,
                          price_range: { minimum_price: { final_price: { value: 116966 } } } }; }) } } };
      }
      if (body.method === 'initialize') return { headers: { 'mcp-session-id': 'sesion-1' }, body: {} };
      if (body.params && body.params.name === 'precio_articulo') {
        const ic = body.params.arguments.item_code;
        return 'event: message\ndata: ' + JSON.stringify({ result: { content: [{ type: 'text',
          text: JSON.stringify({ item_code: ic, precio_con_iva: 116966,
                                 unidad_venta: { descripcion: 'Lámina' } }) }] } }) + '\n';
      }
      return 'event: message\ndata: ' + JSON.stringify({ result: { content: [{ type: 'text',
        text: JSON.stringify({ query: 'x', total: 0, matches: [] }) }] } }) + '\n';
    } };
    const nodosP = { 'Repartir herramientas R1': [{ tuse: { id: 't1', name: 'buscar_producto',
                       input: { q: 'mdf duratex', limit: 25 } }, historia: [] }],
                     'Cerebro conversacional': { cot_req: COT_REQ,
                       ses_out: JSON.stringify({ marca: 'Carpincentro', ciudad: 'Bucaramanga' }) },
                     'Unir pendiente': { cfg_mcp_url: 'https://mcp.ardisa.com/mcp', cfg_mcp_token: 'tok', cfg_fuente: 'mcp' } };
    const busqueda = [sse({ result: { content: [{ type: 'text', text: JSON.stringify(
      { query: 'mdf duratex', total: 2, truncated: false, matches: [
        { item_code: '10008524', item_name: 'MDF DURATEX LIGHT 183X244X09', unidad: 'Lámina' },
        { item_code: '10008525', item_name: 'MDF DURATEX LIGHT 183X244X12', unidad: 'Lámina' }] }) }] } })];
    const oP = await correrCode(ARMAR, busqueda, nodosP, helpersP);
    const rP = JSON.parse(oP[0].json.cot_req.messages.slice(-1)[0].content[0].content[0].text);
    const conPrecio = (rP.matches || []).filter(m => Number(m.precio_con_iva) > 0);
    chequear('n8n le entrega al modelo los precios ya resueltos (no gasta vueltas en pedirlos)',
             conPrecio.length === 2, JSON.stringify(rP).slice(0, 220));
    const conLink = (rP.matches || []).filter(m => String(m.url_tienda || '').indexOf('.html') > 0);
    chequear('Cada producto de la lista lleva TAMBIÉN su enlace (prueba de los 5 vinilos, 25-ago)',
             conLink.length === 2, JSON.stringify((rP.matches || []).map(m => m.url_tienda)));
    chequear('Y viene con su unidad de venta, que es como se cotiza',
             conPrecio.length > 0 && /Lámina/.test(String(conPrecio[0].unidad_venta || '')),
             JSON.stringify(conPrecio[0] || {}).slice(0, 120));
  }

  // === LOS ATRIBUTOS DEL PRODUCTO VIAJAN AL MODELO (2026-08-25) ===
  // Magento guarda color/espesor/medida como IDENTIFICADORES ("color":"6912"); pedidos con
  // custom_attributesV2 + selected_options llegan en palabras (Blanco, 15, 2.15x2.44). Con eso el bot deja
  // de deducir la medida leyendo el NOMBRE — que fue justo el error del 24-ago, cuando tituló un renglón
  // "215x244x18" con el precio de otra referencia.
  {
    const helpersAt = { httpRequest: async (o) => {
      const u = String(o.url || '');
      if (u.indexOf('/rest/') >= 0) return { sku: '10010332', status: 1, visibility: 4,
                                             extension_attributes: { website_ids: [1, 2] } };
      if (u.indexOf('graphql') >= 0) return { data: { products: { items: [{
        sku: '10010332', url_key: 'melaminico-vesto-rh-blanco-215x244x15',
        price_range: { minimum_price: { final_price: { value: 203468 } } },
        custom_attributesV2: { items: [
          { code: 'color',           selected_options: [{ label: 'Blanco' }] },
          { code: 'espesor_calibre', selected_options: [{ label: '15' }] },
          { code: 'tamano',          selected_options: [{ label: '2.15x2.44' }] },
          { code: 'textura',         selected_options: [{ label: 'Tex lisa' }] },
          { code: 'options_container', selected_options: [{ label: 'container2' }] }] } }] } } };
      return { headers: { 'mcp-session-id': 's' }, body: {} };
    } };
    const nodosAt = { 'Repartir herramientas R1': [{ tuse: { id: 't1', name: 'precio_articulo',
                        input: { item_code: '10010332' } }, historia: [] }],
                      'Cerebro conversacional': { cot_req: COT_REQ },
                      'Unir pendiente': { cfg_mcp_url: 'https://mcp.ardisa.com/mcp', cfg_mcp_token: 'tok',
                                          cfg_mag_token: 'magtok' } };
    const entradaAt = [sse({ result: { content: [{ type: 'text', text: JSON.stringify(
      { item_code: '10010332', item_name: 'MELAMINICO VESTO MDP RH BLANCO 215X244X15',
        precio_con_iva: 203468, matches: [] }) }] } })];
    const oAt = await correrCode(ARMAR, entradaAt, nodosAt, helpersAt);
    const rAt = JSON.parse(oAt[0].json.cot_req.messages.slice(-1)[0].content[0].content[0].text);
    const at = rAt.atributos_publicados || {};
    chequear('Los atributos llegan al modelo EN PALABRAS, no como identificadores',
             at.color === 'Blanco' && at.espesor === '15' && at.medida === '2.15x2.44',
             JSON.stringify(at));
    chequear('Y se descarta la basura interna de Magento (options_container)',
             !('options_container' in at) && !!at.textura, JSON.stringify(at));
  }

  // === EL LINK VA SIEMPRE, CON PRECIO O SIN PRECIO (2026-08-25, decisión de Deicy) ===
  // El candado del 1% dejaba al cliente sin enlace 4 de cada 5 veces (5 de 24 productos coincidían), y el
  // objetivo de conectar el bot con la tienda es que el cliente ENTRE a ver el producto. Lo que lo protege
  // es la coletilla que el bot ya pone en todo precio: "precio de referencia — un asesor te lo confirma".
  // Lo que NO se aflojó: producto deshabilitado no se enlaza, y el enlace se arma donde la ficha SÍ abre.
  {
    const mkP = (precioWeb) => ({ httpRequest: async (o) => {
      const u = String(o.url || '');
      if (u.indexOf('/rest/') >= 0) return { sku: '10008524', status: 1, visibility: 4,
                                             extension_attributes: { website_ids: [1, 2] } };
      if (u.indexOf('graphql') >= 0) return { data: { products: { items: [
        { sku: '10008524', url_key: 'mdf-duratex-light-183x244x09',
          price_range: { minimum_price: { final_price: { value: precioWeb } } } }] } } };
      return { headers: { 'mcp-session-id': 's' }, body: {} };
    } });
    const nodosSP = { 'Repartir herramientas R1': [{ tuse: { id: 't1', name: 'precio_articulo',
                        input: { item_code: '10008524' } }, historia: [] }],
                      'Cerebro conversacional': { cot_req: COT_REQ },
                      'Unir pendiente': { cfg_mcp_url: 'https://mcp.ardisa.com/mcp', cfg_mcp_token: 'tok',
                                          cfg_mag_token: 'magtok' } };
    // (a) SAP no dio precio -> el link sale aunque la web tenga su propio valor
    const sinPrecio = [sse({ result: { content: [{ type: 'text', text: JSON.stringify(
      { item_code: '10008524', item_name: 'MDF DURATEX LIGHT 183X244X09', matches: [] }) }] } })];
    const a1 = await correrCode(ARMAR, sinPrecio, nodosSP, mkP(110812));
    const r1 = JSON.parse(a1[0].json.cot_req.messages.slice(-1)[0].content[0].content[0].text);
    chequear('Sin precio de SAP, el link SÍ sale (no hay cifra que contradecir)',
             /mdf-duratex-light/.test(String(r1.url_tienda || '')), 'url=' + r1.url_tienda);

    // (b) CON precio y 5,3% de diferencia -> sigue sin salir (el candado no se aflojó)
    const conPrecio = [sse({ result: { content: [{ type: 'text', text: JSON.stringify(
      { item_code: '10008524', item_name: 'MDF DURATEX LIGHT 183X244X09',
        precio_con_iva: 116966, matches: [] }) }] } })];
    const a2 = await correrCode(ARMAR, conPrecio, nodosSP, mkP(110812));
    const r2 = JSON.parse(a2[0].json.cot_req.messages.slice(-1)[0].content[0].content[0].text);
    chequear('Con precio que NO coincide, el link TAMBIÉN sale (decisión 25-ago: el link va siempre)',
             /mdf-duratex-light/.test(String(r2.url_tienda || '')), 'url=' + r2.url_tienda);

    // (c) CON precio que coincide -> sale, como siempre
    const a3 = await correrCode(ARMAR, conPrecio, nodosSP, mkP(116900));
    const r3 = JSON.parse(a3[0].json.cot_req.messages.slice(-1)[0].content[0].content[0].text);
    chequear('Con precio que coincide, el link sale igual que antes',
             /mdf-duratex-light/.test(String(r3.url_tienda || '')), 'url=' + r3.url_tienda);
  }

  // === SI EL PRODUCTO NO TIENE FICHA, SE LE MUESTRAN LOS PARECIDOS (2026-08-24, Deicy) ===
  // El Melamínico Vesto RH Roble Americano cotizado NO está publicado (comprobado por código en las dos
  // tiendas) y la clienta se quedó sin nada que abrir. La tienda sí publica el mismo Vesto RH en Blanco.
  // OJO: buscar por el nombre a lo bruto trae CANTOS DE PVC (comparten "roble"); por eso se exige el
  // sustantivo principal MÁS otra palabra en común. Sin ese filtro le ofreceríamos un canto a quien pidió
  // una lámina.
  {
    const helpersS = { httpRequest: async (o) => {
      if (String(o.url || '').indexOf('graphql') >= 0) {
        const q = JSON.stringify((typeof o.body === 'string' ? JSON.parse(o.body) : o.body) || {});
        if (q.indexOf('filter') >= 0) return { data: { products: { items: [] } } };   // sin ficha propia
        return { data: { products: { items: [
          { sku: '10010332', name: 'Melaminico Vesto Mdp RH Blanco 215X244X15', url_key: 'vesto-rh-blanco-215x244x15' },
          { sku: '10027863', name: 'Melaminico Ecofort Loto Mdp RH Tex Liso 183X244X15', url_key: 'ecofort-loto' },
          { sku: '10032638', name: 'Canto Pvc Rehau Soder(Roble Provenzal)22X1.5Mm', url_key: 'canto-roble-provenzal' }] } } };
      }
      return { headers: { 'mcp-session-id': 's' }, body: {} };
    } };
    const nodosS = { 'Repartir herramientas R1': [{ tuse: { id: 't1', name: 'precio_articulo',
                       input: { item_code: '10010338' } }, historia: [] }],
                     'Cerebro conversacional': { cot_req: COT_REQ },
                     'Unir pendiente': { cfg_mcp_url: 'https://mcp.ardisa.com/mcp', cfg_mcp_token: 'tok', cfg_fuente: 'mcp' } };
    const conPrecio = [sse({ result: { content: [{ type: 'text', text: JSON.stringify(
      { item_code: '10010338', item_name: 'MELAMINICO VESTO MDP RH ROBLE AMERICANO 215X244X18',
        precio_con_iva: 353906, matches: [] }) }] } })];
    const oS = await correrCode(ARMAR, conPrecio, nodosS, helpersS);
    const rS = JSON.parse(oS[0].json.cot_req.messages.slice(-1)[0].content[0].content[0].text);
    const sim = rS.similares_tienda || [];
    chequear('Sin ficha propia -> se le ofrecen los parecidos que SÍ están publicados',
             sim.length >= 1 && sim[0].item_code === '10010332', JSON.stringify(rS).slice(0, 220));
    chequear('Y el filtro deja fuera lo que solo comparte una palabra suelta (el canto de PVC)',
             !sim.some(x => /Canto/i.test(x.item_name)) && !sim.some(x => /Ecofort/i.test(x.item_name)),
             JSON.stringify(sim).slice(0, 200));
  // === EL LINK VA AL DOMINIO DONDE SÍ ABRE (2026-08-24, REST de Magento) ===
  // La varilla abre en ardisa.com y da 404 en carpincentro.com. Antes el link se armaba siempre con la web
  // de la marca del cliente; ahora el REST dice a qué website pertenece la ficha (1=Ardisa, 2=Carpincentro)
  // y se arma donde abre. Y si el producto está DESHABILITADO, no se manda link aunque tenga ficha.
  {
    const mk = (restBody) => ({ httpRequest: async (o) => {
      const u = String(o.url || '');
      if (u.indexOf('/rest/') >= 0) { if (!restBody) throw new Error('rest caído'); return restBody; }
      if (u.indexOf('graphql') >= 0) return { data: { products: { items: [
        { sku: '10025238', url_key: 'bisagra-spar-semiparche',
          price_range: { minimum_price: { final_price: { value: 1606 } } } }] } } };
      return { headers: { 'mcp-session-id': 's' }, body: {} };
    } });
    const nodosL = { 'Repartir herramientas R1': [{ tuse: { id: 't1', name: 'precio_articulo',
                       input: { item_code: '10025238' } }, historia: [] }],
                     'Cerebro conversacional': { cot_req: COT_REQ },
                     'Unir pendiente': { cfg_mcp_url: 'https://mcp.ardisa.com/mcp', cfg_mcp_token: 'tok',
                                         cfg_mag_token: 'magtok' } };
    const entradaL = [sse({ result: { content: [{ type: 'text', text: JSON.stringify(
      { item_code: '10025238', item_name: 'BISAGRA TORINO SEMIPARCHE', precio_con_iva: 1606, matches: [] }) }] } })];

    // (a) la ficha vive SOLO en Carpincentro (website 2) y el cliente venía por Ardisa
    const a = await correrCode(ARMAR, entradaL, nodosL,
      mk({ sku: '10025238', status: 1, visibility: 4, extension_attributes: { website_ids: [2] } }));
    const ra = JSON.parse(a[0].json.cot_req.messages.slice(-1)[0].content[0].content[0].text);
    chequear('El link se arma en la tienda donde SÍ abre (no en la de la marca del cliente)',
             /carpincentro\.com/.test(String(ra.url_tienda || '')), 'url=' + ra.url_tienda);

    // (b) producto DESHABILITADO: tiene ficha, pero no se le manda al cliente
    const b = await correrCode(ARMAR, entradaL, nodosL,
      mk({ sku: '10025238', status: 2, visibility: 4, extension_attributes: { website_ids: [1, 2] } }));
    const rb = JSON.parse(b[0].json.cot_req.messages.slice(-1)[0].content[0].content[0].text);
    chequear('Producto deshabilitado -> NO se manda link', !rb.url_tienda, 'url=' + rb.url_tienda);

    // (c) si el REST se cae, se conserva el comportamiento de siempre (link con la web de la marca)
    const c = await correrCode(ARMAR, entradaL, nodosL, mk(null));
    const rc = JSON.parse(c[0].json.cot_req.messages.slice(-1)[0].content[0].content[0].text);
    chequear('Si el REST falla, el link sigue saliendo como antes (no se pierde nada)',
             /ardisa\.com/.test(String(rc.url_tienda || '')), 'url=' + rc.url_tienda);
  }

    chequear('No se les inventa precio: se ofrecen para verlos, el precio se consulta aparte',
             /NO les inventes precio/.test(rS.nota_similares || ''), String(rS.nota_similares).slice(0, 120));
  }

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
                  'Unir pendiente': { cfg_mcp_url: 'https://mcp.ardisa.com/mcp', cfg_mcp_token: 'tok', cfg_fuente: 'mcp' } };
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

// ══ 12. EL ENLACE VA SIEMPRE, Y EL PRECIO SIGUE SIENDO EL DE SAP ═══════════════════════════════
// La pintura Pintuco figura en la web a $226.243 y en SAP a $323.205. Del 21 al 25 de agosto ese enlace
// se callaba para que el cliente no viera otro número; pero el candado lo dejaba SIN enlace 4 de cada 5
// veces y el objetivo de conectar la tienda es que ENTRE a ver el producto (decisión de Deicy, 25-ago:
// "con o sin precio debe darle el link"). Lo que no cambia —y esta prueba lo fija— es que el PRECIO que
// se le dice al cliente sale de SAP, nunca de la web, siempre como "precio de referencia".
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
                  'Unir pendiente': { cfg_mcp_url: 'https://mcp.ardisa.com/mcp', cfg_mcp_token: 'tok', cfg_fuente: 'mcp' } };
  const pasa = async (vSap, vWeb) => {
    const e = [sse({ result: { content: [{ type: 'text', text: JSON.stringify(precio(vSap)) }] } })];
    const o = await correrCode(ARMAR, e, nodos, web(vWeb));
    return JSON.parse(o[0].json.cot_req.messages.slice(-1)[0].content[0].content[0].text);
  };
  const igual = await pasa(20999.93, 20999.93);
  const distinto = await pasa(323205.65, 226243.95);
  chequear('Precio igual en la web -> se manda el enlace del producto',
           /ardisa\.com\/cemento-gris-alion-bulto-x-25kg\.html/.test(igual.url_tienda || ''), String(igual.url_tienda));
  chequear('Precio distinto -> el enlace TAMBIÉN se manda (el precio lo confirma el asesor)',
           /ardisa\.com\/cemento-gris-alion-bulto-x-25kg\.html/.test(distinto.url_tienda || ''), String(distinto.url_tienda));
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
                  'Unir pendiente': { cfg_mcp_url:'https://mcp.ardisa.com/mcp', cfg_mcp_token:'tok', cfg_fuente:'mcp' } };
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
    // El nombre real trae ESPACIOS MÚLTIPLES ("MDF    183X244X2.7"): por eso "mdf 183" (un espacio) no
    // lo ve y solo la medida pegada "183X244X2.7" lo encuentra — como en el catálogo vivo (SKU 10023222).
    const r = (q === '183X244X2.7')
      ? { query:q, total: 1, truncated: false, matches: [
          { item_code:'10023222', item_name:'MDF    183X244X2.7 CRUDO  T', unidad:'Lámina' }] }
      : (q === 'mdf 183')
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
                  'Unir pendiente': { cfg_mcp_url:'https://mcp.ardisa.com/mcp', cfg_mcp_token:'tok', cfg_fuente:'mcp' } };
  const cero = [sse({ result: { content: [{ type:'text',
    text: JSON.stringify({ query:'lamina mdf 2.7', total:0, truncated:false, matches:[] }) }] } })];
  const out = await correrCode(ARMAR, cero, nodos, helpers);
  const d = JSON.parse(out[0].json.cot_req.messages.slice(-1)[0].content[0].content[0].text);
  chequear('Se intenta la MEDIDA PEGADA ("183X244X2.7") y la palabra + medida ("mdf 183")',
           buscadas.indexOf('183X244X2.7') >= 0 && buscadas.indexOf('mdf 183') >= 0, JSON.stringify(buscadas));
  // === EL ESPESOR DE UNA LÁMINA SE BUSCA CON EL FORMATO DEL CATÁLOGO (2026-08-25) ===
  // "lámina de mdf de 5mm": el cliente da el ESPESOR, el catálogo la nombra "MDF  183X244X5.5" (con dos
  // espacios). Ni "lamina mdf" ni "mdf 5" la encuentran, y el bot respondió que no había teniéndola. Ahora,
  // si el texto habla de lámina/tablero, se prueba el formato pegado del catálogo — comprobado contra SAP:
  // "183X244X5" devuelve 25 y el primero es el MDF de 5.5 (la comparación es por prefijo).
  {
    const pedidas2 = [];
    const helpersL = { httpRequest: async (o) => {
      const body = typeof o.body === 'string' ? JSON.parse(o.body) : o.body;
      if (String(o.url || '').indexOf('graphql') >= 0) return { data: { products: { items: [] } } };
      if (body.method === 'initialize') return { headers: { 'mcp-session-id': 's' }, body: {} };
      const q = body.params.arguments.q;
      pedidas2.push(q);
      const r = (q === '183X244X5')
        ? { query:q, total:2, truncated:false, matches:[{ item_code:'10023300', item_name:'MDF  183X244X5.5   A', unidad:'Lámina' }] }
        : { query:q, total:0, truncated:false, matches:[] };
      return 'event: message\ndata: ' + JSON.stringify({ result:{ content:[{ type:'text', text: JSON.stringify(r) }] } }) + '\n';
    } };
    const REQ3 = Object.assign({}, COT_REQ, { messages:[{ role:'user', content:'necesito una lamina de mdf de 5mm' }] });
    const nodos3 = { 'Repartir herramientas R1': [{ tuse:{ id:'t1', name:'buscar_producto',
                       input:{ q:'lamina mdf 5mm', limit:25 } }, historia:[] }],
                     'Cerebro conversacional': { cot_req: REQ3, ses_out: JSON.stringify({ marca:'Carpincentro' }) },
                     'Unir pendiente': { cfg_mcp_url:'https://mcp.ardisa.com/mcp', cfg_mcp_token:'tok', cfg_fuente:'mcp' } };
    const cero3 = [sse({ result:{ content:[{ type:'text',
      text: JSON.stringify({ query:'lamina mdf 5mm', total:0, truncated:false, matches:[] }) }] } })];
    const o3 = await correrCode(ARMAR, cero3, nodos3, helpersL);
    const r3 = JSON.parse(o3[0].json.cot_req.messages.slice(-1)[0].content[0].content[0].text);
    chequear('Con el espesor se prueba el formato del catálogo ("183X244X5")',
             pedidas2.indexOf('183X244X5') >= 0, JSON.stringify(pedidas2));
    chequear('Y así encuentra el MDF de 5.5 que antes decía que no existía',
             /183X244X5\.5/.test(JSON.stringify(r3.matches || [])), JSON.stringify(r3).slice(0, 180));
  }

  // === LA PAREJA DE PALABRAS Y EL ORDEN DE PRIORIDAD (2026-08-25) ===
  // El buscador de SAP compara la frase LITERAL: "varilla roscada de 1/2 y de 5/8" da 0, pero
  // "varilla roscada" encuentra VARILLA ROSCADA DE 1/2. Con palabras sueltas no alcanza (cada una devuelve
  // 25 truncados). Y el desempate viejo —"gana la que menos resultados devuelva"— premiaba al adjetivo raro:
  // en 40 frases reales ganaron `similar`, `completa`, `hidraulica`, y el bot ofreció un CODO HD a quien
  // pidió un brazo de bisagra. Orden nuevo: medida > palabra de producto > resto.
  {
    const pedidas = [];
    const helpersP2 = { httpRequest: async (o) => {
      const body = typeof o.body === 'string' ? JSON.parse(o.body) : o.body;
      if (body.method === 'initialize') return { headers: { 'mcp-session-id': 's' }, body: {} };
      const q = body.params.arguments.q;
      pedidas.push(q);
      const r = (q === 'varilla roscada')
        ? { query:q, total:11, truncated:false, matches:[{ item_code:'10001111', item_name:'VARILLA ROSCADA DE 1/2', unidad:'Und' }] }
        : (q === 'similar' )
        ? { query:q, total:1, truncated:false, matches:[{ item_code:'10009999', item_name:'GUARDAESCOBA MDF INTENSSA', unidad:'Und' }] }
        : (q === 'varilla' || q === 'roscada')
        ? { query:q, total:25, truncated:true, matches:[{ item_code:'10008888', item_name:'COJINETE (VARILLA CUADRADA)', unidad:'Und' }] }
        : { query:q, total:0, truncated:false, matches:[] };
      return 'event: message\ndata: ' + JSON.stringify({ result:{ content:[{ type:'text', text: JSON.stringify(r) }] } }) + '\n';
    } };
    const REQ2 = Object.assign({}, COT_REQ, { messages:[{ role:'user', content:'varilla roscada de 1/2 y de 5/8 similar' }] });
    const nodos2 = { 'Repartir herramientas R1': [{ tuse:{ id:'t1', name:'buscar_producto',
                       input:{ q:'varilla roscada de 1/2 y de 5/8', limit:25 } }, historia:[] }],
                     'Cerebro conversacional': { cot_req: REQ2, ses_out: JSON.stringify({ marca:'Ardisa' }) },
                     'Unir pendiente': { cfg_mcp_url:'https://mcp.ardisa.com/mcp', cfg_mcp_token:'tok', cfg_fuente:'mcp' } };
    const cero2 = [sse({ result:{ content:[{ type:'text',
      text: JSON.stringify({ query:'varilla roscada de 1/2 y de 5/8', total:0, truncated:false, matches:[] }) }] } })];
    const o2 = await correrCode(ARMAR, cero2, nodos2, helpersP2);
    const d2 = JSON.parse(o2[0].json.cot_req.messages.slice(-1)[0].content[0].content[0].text);
    chequear('Se prueba la PAREJA de palabras seguidas ("varilla roscada")',
             pedidas.indexOf('varilla roscada') >= 0, JSON.stringify(pedidas));
    chequear('Y gana la pareja, no el adjetivo raro que devolvía 1 resultado',
             /VARILLA ROSCADA DE 1\/2/.test(JSON.stringify(d2.matches || [])),
             JSON.stringify(d2).slice(0, 200));
  }

  chequear('Y gana el MDF CRUDO T exacto de 2.7 (espacios múltiples y todo)',
           d.busqueda_usada === '183X244X2.7' && d.total === 1 && /10023222/.test(JSON.stringify(d.matches)),
           JSON.stringify(d).slice(0, 200));

  // 2ª ronda del mismo caso (la prueba de las 9:56): el modelo buscó "MDF" a secas -> 25 FONDOs
  // TRUNCADOS y se aceptaban tal cual (el reintento solo corría con CERO resultados). Si la lista viene
  // recortada y el cliente dio medidas, se AFINA con ellas.
  const buscadas2 = []; buscadas.length = 0;
  const helpers2 = Object.assign({}, helpers);
  const trunc = [sse({ result: { content: [{ type:'text',
    text: JSON.stringify({ query:'MDF', total:40, truncated:true, matches:[
      { item_code:'10010398', item_name:'FONDO PINTUFONDO MDF BLANCO 185X244X3', unidad:'Lámina' }] }) }] } })];
  const nodos2 = { 'Repartir herramientas R1': [{ tuse: { id:'t1', name:'buscar_producto',
                    input: { q:'MDF', limit:25 } }, historia: [] }],
                  'Cerebro conversacional': { cot_req: REQ, ses_out: JSON.stringify({ marca:'Carpincentro' }) },
                  'Unir pendiente': { cfg_mcp_url:'https://mcp.ardisa.com/mcp', cfg_mcp_token:'tok', cfg_fuente:'mcp' } };
  const out2 = await correrCode(ARMAR, trunc, nodos2, helpers2);
  const d2 = JSON.parse(out2[0].json.cot_req.messages.slice(-1)[0].content[0].content[0].text);
  chequear('Búsqueda TRUNCADA + cliente con medidas -> se afina y llega al CRUDO T',
           d2.busqueda_usada === '183X244X2.7' && d2.total === 1 && /RECORTADA|afinó/.test(d2.nota||''),
           JSON.stringify(d2).slice(0, 220));

  // 3ª ronda (caso "MELAMINICO UNICOR MDF BLANCO NEVADO LISO 183X244X15", 20-ago 12:03): el nombre del
  // catálogo trae espacios DOBLES y la frase literal del cliente da 0; el espesor ENTERO (15) se botaba
  // por no tener decimales y el reintento buscó "183X244" -> 25 aglomerados equivocados. El patrón
  // completo AxBxC del cliente ahora se busca TAL CUAL y encuentra el UNICOR exacto.
  const buscadas3 = []; buscadas.length = 0;
  const helpers3 = { httpRequest: async (o) => {
    if (String(o.url).indexOf('graphql') >= 0) return { data: { products: { items: [] } } };
    const body = typeof o.body === 'string' ? JSON.parse(o.body) : o.body;
    if (body.method === 'initialize') return { headers: { 'mcp-session-id': 's' }, body: {} };
    const q = body.params.arguments.q; buscadas3.push(q);
    const r = (q === '183X244X15')
      ? { query:q, total: 2, truncated: false, matches: [
          { item_code:'10013902', item_name:'MELAMINICO  UNICOR  MDF RH BLANCO NEVADO LISO 183X244X15  1C/ SIN BACKER', unidad:'Lámina' },
          { item_code:'10030748', item_name:'MELAMINICO  UNICOR  MDF  WENGUE TEX MADERA  183X244X15  1C CON BACKER', unidad:'Lámina' }] }
      : (q === '183X244')
      ? { query:q, total: 25, truncated: true, matches: [
          { item_code:'10016111', item_name:'AGLOMERADO ARAUCO MDP 183X244X15', unidad:'Lámina' }] }
      : { query:q, total: 0, truncated: false, matches: [] };
    return 'event: message\ndata: ' + JSON.stringify(
      { result: { content: [{ type: 'text', text: JSON.stringify(r) }] } }) + '\n';
  } };
  const REQ3 = Object.assign({}, COT_REQ, { messages: [{ role:'user',
    content:'hola quiero saber si venden (MELAMÍNICO UNICOR MDF BLANCO NEVADO LISO 183X244X15) y precio' }] });
  const nodos3b = { 'Repartir herramientas R1': [{ tuse: { id:'t1', name:'buscar_producto',
                    input: { q:'MELAMINICO UNICOR MDF BLANCO NEVADO LISO 183X244X15', limit:25 } }, historia: [] }],
                  'Cerebro conversacional': { cot_req: REQ3, ses_out: JSON.stringify({ marca:'Carpincentro' }) },
                  'Unir pendiente': { cfg_mcp_url:'https://mcp.ardisa.com/mcp', cfg_mcp_token:'tok', cfg_fuente:'mcp' } };
  const cero3b = [sse({ result: { content: [{ type:'text',
    text: JSON.stringify({ query:'MELAMINICO UNICOR MDF BLANCO NEVADO LISO 183X244X15', total:0, truncated:false, matches:[] }) }] } })];
  const out3 = await correrCode(ARMAR, cero3b, nodos3b, helpers3);
  const d3 = JSON.parse(out3[0].json.cot_req.messages.slice(-1)[0].content[0].content[0].text);
  chequear('El patrón AxBxC completo se busca tal cual ("183X244X15")',
           buscadas3.indexOf('183X244X15') >= 0, JSON.stringify(buscadas3));
  chequear('Y gana el UNICOR exacto, no los 25 aglomerados del par a secas',
           d3.busqueda_usada === '183X244X15' && /UNICOR/.test(JSON.stringify(d3.matches)),
           JSON.stringify(d3).slice(0, 220));
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
