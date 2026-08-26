// UNA SESIÓN POR CONSULTA (2026-08-25) — la prueba que faltaba del nodo "SAP consulta".
//
// Caso real de Deicy, 2:24 pm: preguntó por melaminas y el bot le respondió CUATRO productos con
// "No pudimos validar el precio ni la disponibilidad" y sin un solo enlace. En la ejecución 136877
// aparecen 152 veces "ERROR: la herramienta no respondió" — y el mismo servidor, consultado a mano,
// contestaba en 1,1 s.
//
// La causa: el servidor MCP atiende UNA consulta a la vez POR SESIÓN. El nodo lanzaba las 4-6 consultas
// en paralelo (para no pagar la suma de las esperas) pero TODAS sobre la misma sesión: la primera pasaba
// y las demás quedaban encoladas hasta morir en el tope. Medido contra el servidor real:
//     una sesión compartida -> 1 respuesta, 3 colgadas, 30 s
//     una sesión cada una   -> las 4 con precio, 1,45 s
//
// Esta prueba levanta un servidor de mentira que SE COMPORTA COMO EL DE VERDAD (bloquea la sesión
// ocupada). Si alguien vuelve a compartir la sesión, aquí se cae, no en el WhatsApp de un cliente.
//
// 2026-08-25 (tarde): desde que `config.fuente_datos='tienda'` los datos salen de la página y este camino
// quedó de RESPALDO — por eso la configuración de abajo dice `cfg_fuente:'mcp'` a propósito. Se sigue
// probando: el día que haya que volver a SAP (un UPDATE en la BD, sin desplegar), tiene que funcionar.
const fs = require('fs');
const RUTA = __dirname + '/n_sap_r2.js';
if (!fs.existsSync(RUTA)) { console.log('  FALLA | no se extrajo el nodo SAP consulta R2'); process.exit(1); }
const SAP = fs.readFileSync(RUTA, 'utf8');

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det || ''))); };

// Servidor MCP de mentira: una consulta a la vez por sesión; la segunda NUNCA contesta (como el real).
function servidor() {
  const ocupada = {};                 // sesiones que ya tienen una consulta encima
  let nSesiones = 0, colgadas = 0;
  return {
    stats: () => ({ nSesiones, colgadas }),
    http: async (o) => {
      const cuerpo = typeof o.body === 'string' ? JSON.parse(o.body) : (o.body || {});
      if (cuerpo.method === 'initialize') {
        nSesiones++;
        return { headers: { 'mcp-session-id': 'ses-' + nSesiones } };
      }
      const sid = (o.headers || {})['mcp-session-id'] || '';
      if (ocupada[sid]) { colgadas++; return new Promise(() => {}); }   // se queda colgada para siempre
      ocupada[sid] = true;
      await new Promise(r => setTimeout(r, 20));                        // la consulta "tarda"
      ocupada[sid] = false;
      return 'event: message\ndata: ' + JSON.stringify({ jsonrpc:'2.0', id:2, result:{ content:[
        { type:'text', text: JSON.stringify({ item_code: cuerpo.params.arguments.item_code, precio_con_iva: 433031.63 }) }]}}) + '\n\n';
    }
  };
}

function correrSap(tuses, srv) {
  const $ = (n) => ({
    first: () => ({ json: n === 'Unir pendiente'
      ? { cfg_mcp_url:'https://mcp.test/mcp', cfg_mcp_token:'tok', cfg_fuente:'mcp' }
      : { headers:{ 'mcp-session-id':'ses-vieja' } } }),
    all: () => tuses.map(t => ({ json: { tuse: t } })) });
  const $input = { first: () => ({ json: { headers:{ 'mcp-session-id':'ses-vieja' } } }) };
  const ctx = { helpers: { httpRequest: srv.http } };
  const fn = new Function('$', '$input', 'return (async function(){ ' + SAP + ' }).call(this);');
  return fn.call(ctx, $, $input);
}

(async () => {
  // ── El caso de Deicy: 4 precios a la vez ──────────────────────────────────
  {
    const srv = servidor();
    const tuses = ['10031840','10030111','10030105','10010332'].map(c =>
      ({ name:'precio_articulo', input:{ item_code:c, ciudad:'BUCARAMANGA' } }));
    const r = await correrSap(tuses, srv);
    const conPrecio = r.filter(x => /433031\.63/.test(String(x.json.data))).length;
    chequear('Las 4 consultas paralelas traen precio (antes: 1 de 4)',
             conPrecio === 4, conPrecio + ' de 4 · ' + JSON.stringify(r.map(x=>String(x.json.data).slice(0,40))));
    chequear('Ninguna se queda esperando detrás de otra',
             srv.stats().colgadas === 0, 'colgadas=' + srv.stats().colgadas);
    chequear('Se abre una sesión NUEVA por cada consulta extra (la que venía se reaprovecha)',
             srv.stats().nSesiones === 3, 'sesiones nuevas=' + srv.stats().nSesiones);
  }
  // ── Una sola consulta no debe abrir sesión de más ─────────────────────────
  {
    const srv = servidor();
    const r = await correrSap([{ name:'precio_articulo', input:{ item_code:'10031840' } }], srv);
    chequear('Con una sola consulta se usa la sesión ya abierta (0 sesiones nuevas)',
             srv.stats().nSesiones === 0 && /433031\.63/.test(String(r[0].json.data)),
             'sesiones=' + srv.stats().nSesiones);
  }
  // ── La deduplicación de siempre sigue viva ────────────────────────────────
  {
    const srv = servidor();
    const t = { name:'precio_articulo', input:{ item_code:'10031840' } };
    const r = await correrSap([t, t, t], srv);
    chequear('La misma consulta repetida se pide UNA vez y se responde 3 veces',
             r.length === 3 && srv.stats().nSesiones === 0 && r.every(x => /433031\.63/.test(String(x.json.data))),
             'items=' + r.length + ' sesiones=' + srv.stats().nSesiones);
  }

  console.log('\n' + ok + '/' + total + ' pruebas pasan');
  process.exit(ok === total ? 0 : 1);
})();
