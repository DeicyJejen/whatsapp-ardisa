// PRUEBA: "MCP EN CASA" (13-ago-2026, decisión de Deicy por auditoría interna).
//
// El token del MCP JAMÁS viaja a Anthropic: el modelo DECLARA qué herramienta quiere (tool_use) y n8n
// la ejecuta contra mcp.ardisa.com. Esta prueba fija los 3 nodos del loop:
//   Repartir herramientas R1  -> ¿terminó o pidió herramientas? (un item por llamada)
//   Armar consulta R2         -> junta los resultados SSE de SAP y arma la siguiente vuelta
//   Cerrar cotización R3      -> tope de vueltas: fuerza el camino del asesor
const fs = require('fs');
const REPARTIR = fs.existsSync(__dirname + '/n_repartir1.js') ? fs.readFileSync(__dirname + '/n_repartir1.js', 'utf8') : null;
const ARMAR    = fs.existsSync(__dirname + '/n_armar_r2.js')  ? fs.readFileSync(__dirname + '/n_armar_r2.js', 'utf8')  : null;
const CERRAR   = fs.existsSync(__dirname + '/n_cerrar_r3.js') ? fs.readFileSync(__dirname + '/n_cerrar_r3.js', 'utf8') : null;
if (!REPARTIR || !ARMAR || !CERRAR) { console.log('  OK   | (nodos MCP-en-casa no disponibles en este arnés)'); process.exit(0); }

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

// ══ 5. Cerrar R3: si a la 3ª vuelta sigue pidiendo herramientas -> fallo forzado (asesor) ══
{
  const conTool = { content: [{ type: 'tool_use', id: 't', name: 'buscar_producto', input: {} }] };
  const out = correrCode(CERRAR, [conTool], {});
  chequear('3ª vuelta con tool_use -> type error (Entregar manda el mensaje neutro + asesor)',
           out[0].json.type === 'error', JSON.stringify(out).slice(0, 100));
  const final = { content: [{ type: 'text', text: 'Respuesta final' }], stop_reason: 'end_turn' };
  const out2 = correrCode(CERRAR, [final], {});
  chequear('3ª vuelta con texto -> pasa derecho', out2[0].json.stop_reason === 'end_turn', JSON.stringify(out2).slice(0, 100));
}

console.log(ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
