// TODO SE CONSULTA A LA PÁGINA (2026-08-25, decisión de Deicy: "ya no vamos a consultar del MCP").
//
// Por qué se cambió: en dos semanas, consultar SAP por el MCP costó un token que vence cada hora y hay
// que re-autorizar a mano, sesiones que se estorbaban entre ellas (152 consultas perdidas en UNA
// conversación), esperas de 30 s, y referencias del maestro de artículos que ya no se venden ofrecidas
// como si se tuvieran (Cemex y Oriente, con 0 bultos, medido el 25-ago).
// La página no pide credencial, responde en 0,2 s, publica SOLO lo que se vende y su precio es el mismo
// que el cliente verá al abrir el enlace. El puente sigue siendo el SKU = item_code de SAP.
//
// Lo que la página NO sabe es la existencia por bodega. Esta prueba fija que eso se DIGA (el asesor lo
// confirma) y que nunca se afirme ni se niegue stock — que es lo que le costaría un cliente a Deicy.
const fs = require('fs');
const RUTA = __dirname + '/n_sap_r2.js';
if (!fs.existsSync(RUTA)) { console.log('  FALLA | no se extrajo el nodo SAP consulta R2'); process.exit(1); }
const SAP = fs.readFileSync(RUTA, 'utf8');

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det || ''))); };

// Magento de mentira. `pedidas` guarda las URL consultadas para poder afirmar que NADIE llamó al MCP.
function tienda(items) {
  const pedidas = [];
  return {
    pedidas,
    http: async (o) => {
      pedidas.push(String(o.url || ''));
      // El endpoint propio de la tienda: el MISMO que usa la web para pintar "Agotado" en cada ficha.
      // Comprobado el 25-ago: ALION 2133/in_stock · CEMEX 0/no_source (el "solo tengo alion" de Deicy).
      if (String(o.url || '').indexOf('batchstockinfo') >= 0) {
        const skus = decodeURIComponent(String(o.url).split('skus=')[1] || '').split(',');
        const items = {};
        skus.forEach(sk => { items[sk] = STOCK[sk] || { sku:sk, stock:0, status:'no_source' }; });
        return { city_id: 905, items };
      }
      if (String(o.url || '').indexOf('/graphql') < 0) throw new Error('no debería salir de la tienda');
      const q = JSON.stringify(o.body || {});
      // ⚠️ al serializar el cuerpo, las comillas de la consulta quedan ESCAPADAS (\"10031840\"), así que
      // buscar '"sku"' no encuentra nada. Se busca el código pelado.
      const sel = q.indexOf('search:') >= 0
        ? items
        : items.filter(i => q.indexOf(i.sku) >= 0);
      return { data: { products: { total_count: sel.length, items: sel } } };
    }
  };
}
// Lo que responde el endpoint de existencias de la tienda, con los valores reales medidos el 25-ago.
const STOCK = {
  '10021733': { sku:'10021733', stock:2133, status:'in_stock',  available:true },
  '10031840': { sku:'10031840', stock:0,    status:'in_stock',  available:true },   // sobre pedido: SÍ se vende
  '10014960': { sku:'10014960', stock:0,    status:'no_source', available:false },  // Cemex: no se tiene
};
const ITEMS = [
  { sku:'10021733', name:'Cemento Gris Alion Bulto X 50Kg', url_key:'cemento-gris-alion-50kg',
    price_range:{ minimum_price:{ final_price:{ value: 34999.99 } } },
    custom_attributesV2:{ items:[ { code:'color', selected_options:[{ label:'Gris' }] },
                                  { code:'espesor_calibre', selected_options:[{ label:'50 Kg' }] } ] } },
  { sku:'10031840', name:'Melaminico Supercor Pb RH Perla Tex Soft 183X244X15', url_key:'melaminico-perla',
    price_range:{ minimum_price:{ final_price:{ value: 227341.59 } } }, custom_attributesV2:{ items:[] } },
];

function correr(tuses, srv, marca, fuente) {
  const $ = (n) => ({
    first: () => ({ json:
      n === 'Unir pendiente' ? { cfg_fuente:(fuente||'tienda'), cfg_mcp_url:'https://mcp.ardisa.com/mcp', cfg_mcp_token:'tok' } :
      n === 'Cerebro conversacional' ? { ses_out: JSON.stringify({ marca: marca || 'Carpincentro' }) } :
      { headers:{} } }),
    all: () => tuses.map(t => ({ json: { tuse: t } })) });
  const $input = { first: () => ({ json: { headers:{} } }) };
  const fn = new Function('$', '$input', 'return (async function(){ ' + SAP + ' }).call(this);');
  return fn.call({ helpers:{ httpRequest: srv.http } }, $, $input);
}

(async () => {
  // ── 1. Buscar producto: sale de la tienda, con precio Y enlace en cada uno ──
  {
    const srv = tienda(ITEMS);
    const r = await correr([{ name:'buscar_producto', input:{ q:'cemento gris' } }], srv);
    const d = JSON.parse(r[0].json.data);
    chequear('La búsqueda se resuelve contra la TIENDA, no contra el MCP',
             srv.pedidas.length > 0 && srv.pedidas.every(u => /carpincentro\.com\//.test(u)) &&
             srv.pedidas.some(u => /\/graphql/.test(u)), JSON.stringify(srv.pedidas));
    // 2026-08-26: exigía `length === 2`, pero la consulta es "cemento gris" y el fixture trae un
    // cemento y un MELAMÍNICO. Con el filtro de relevancia el melamínico se bota — y eso es el
    // acierto. Lo que aquí importa es que el cemento llegue con su SKU.
    chequear('Cada resultado trae item_code (= el SKU, que es el de SAP)',
             d.matches.length >= 1 && d.matches[0].item_code === '10021733', JSON.stringify(d).slice(0, 160));
    chequear('…su precio con IVA',
             d.matches[0].precio_con_iva === 34999.99, JSON.stringify(d.matches[0]).slice(0, 140));
    chequear('…y su ENLACE, que es lo que faltaba todo el día',
             /carpincentro\.com\/cemento-gris-alion-50kg\.html$/.test(d.matches[0].url_tienda || ''),
             d.matches[0].url_tienda);
    chequear('Los atributos llegan en PALABRAS, no como identificadores de Magento',
             (d.matches[0].atributos_publicados || {}).color === 'Gris' &&
             (d.matches[0].atributos_publicados || {}).espesor === '50 Kg',
             JSON.stringify(d.matches[0].atributos_publicados));
    chequear('Y se le dice al modelo que TODO lo de esta lista se vende (nada de referencias muertas)',
             /publicados y se venden/.test(d.nota || ''), String(d.nota).slice(0, 120));
  }
  // ── 2. La marca del cliente decide de qué web sale el enlace ──
  {
    const srv = tienda(ITEMS);
    const r = await correr([{ name:'buscar_producto', input:{ q:'cemento' } }], srv, 'Ardisa');
    const d = JSON.parse(r[0].json.data);
    chequear('Un cliente de Ardisa recibe enlaces de ardisa.com (no del otro dominio: da 404)',
             /^https:\/\/www\.ardisa\.com\//.test(d.matches[0].url_tienda || ''), d.matches[0].url_tienda);
  }
  // ── 3. Precio por código ──
  {
    const srv = tienda(ITEMS);
    const r = await correr([{ name:'precio_articulo', input:{ item_code:'10031840' } }], srv);
    const d = JSON.parse(r[0].json.data);
    chequear('El precio por código sale de la tienda, con su enlace',
             d.precio_con_iva === 227341.59 && /melaminico-perla\.html$/.test(d.url_tienda || ''),
             JSON.stringify(d).slice(0, 160));
    chequear('Y se dice que es el precio PUBLICADO (el mismo que verá al abrir el enlace)',
             /publicado en nuestra tienda/i.test(d.nota_precio || ''), String(d.nota_precio).slice(0, 100));
    // 25-ago, caso Griflex: el bot tenía el enlace y respondió "no pudimos confirmar el precio y la
    // disponibilidad". Cada dato que llega en una consulta aparte es un dato que se puede quedar atrás:
    // ahora precio, enlace Y existencia viajan juntos en la misma respuesta.
    chequear('La consulta de un producto trae precio Y existencia en la MISMA respuesta',
             d.se_vende === true && /con disponibilidad/.test(d.disponibilidad || ''),
             JSON.stringify(d).slice(0, 200));
  }
  // ── 4. Un código que no está publicado no se calla: se manda a buscar por nombre ──
  {
    const srv = tienda(ITEMS);
    const r = await correr([{ name:'precio_articulo', input:{ item_code:'99999999' } }], srv);
    const d = JSON.parse(r[0].json.data);
    chequear('Un código sin ficha NO se responde con un error críptico',
             d.total === 0 && /Busca por NOMBRE/.test(d.nota || ''), JSON.stringify(d).slice(0, 160));
  }
  // ── 5. LA EXISTENCIA TAMBIÉN SALE DE LA PÁGINA (25-ago: "allá está sincronizado con SAP") ──
  // La tienda tiene endpoint propio (/inventorybycity/product/batchstockinfo). NO es el inventario de
  // Magento —ese trae relleno: 1.039.339 bultos de cemento— sino el que la web mantiene con SAP.
  {
    const srv = tienda(ITEMS);
    const r = await correr([{ name:'disponibilidad_ciudad', input:{ item_code:'10021733', ciudad:'Bucaramanga' } }], srv);
    const d = JSON.parse(r[0].json.data);
    chequear('La existencia se pregunta al endpoint propio de la tienda',
             srv.pedidas.some(u => /batchstockinfo/.test(u)), JSON.stringify(srv.pedidas));
    chequear('Y trae el dato REAL (2.133 de Alion, no el millón de relleno de Magento)',
             d.hay_disponibilidad === true && d.disponible_total === 2133, JSON.stringify(d).slice(0, 180));
    chequear('Al cliente se le habla sin cifras de inventario',
             /SIN cifras de inventario/.test(d.nota || ''), String(d.nota).slice(0, 120));
  }
  // El que NO se tiene: se dice que no, pero NUNCA "no lo manejamos" (regla de Deicy).
  {
    const srv = tienda(ITEMS);
    const r = await correr([{ name:'disponibilidad_ciudad', input:{ item_code:'10014960' } }], srv);
    const d = JSON.parse(r[0].json.data);
    chequear('Una referencia sin existencias se marca como tal (el caso Cemex)',
             d.hay_disponibilidad === false && /SIN existencias/.test(d.estado || ''), JSON.stringify(d).slice(0, 160));
    chequear('…y se manda a ofrecer alternativas, nunca a decir "no lo manejamos"',
             /Nunca le digas que "no lo manejamos"/.test(d.nota || ''), String(d.nota).slice(0, 140));
  }
  // `stock:0` con `status:'in_stock'` es el producto SOBRE PEDIDO: sí se vende. No se puede leer con stock>0.
  {
    const srv = tienda(ITEMS);
    const r = await correr([{ name:'disponibilidad_ciudad', input:{ item_code:'10031840' } }], srv);
    const d = JSON.parse(r[0].json.data);
    chequear('stock 0 + in_stock = se trae sobre pedido, NO agotado',
             d.hay_disponibilidad === true, JSON.stringify(d).slice(0, 160));
  }
  // Si el endpoint no contesta, NO se inventa un agotado (perder una venta por callarse es peor).
  {
    const medio = { pedidas:[], http: async (o) => {
      if (String(o.url || '').indexOf('batchstockinfo') >= 0) throw new Error('timeout');
      return { data:{ products:{ total_count:0, items:[] } } };
    } };
    const r = await correr([{ name:'disponibilidad_ciudad', input:{ item_code:'10021733' } }], medio);
    const d = JSON.parse(r[0].json.data);
    chequear('Sin dato de existencias NO se inventa un agotado',
             d.sin_dato === true && /NO afirmes ni niegues/.test(d.nota || ''), JSON.stringify(d).slice(0, 160));
  }
  // ── 5b. Y en la BÚSQUEDA, lo que no se tiene ni aparece (el caso "solo tengo alion") ──
  {
    const srv = tienda([
      { sku:'10021733', name:'Cemento Gris Alion Bulto X 50Kg', url_key:'cemento-alion',
        price_range:{ minimum_price:{ final_price:{ value:34999.99 } } }, custom_attributesV2:{ items:[] } },
      { sku:'10014960', name:'Cemento Gris Cemex Bulto X 42.5Kg', url_key:'cemento-cemex',
        price_range:{ minimum_price:{ final_price:{ value:26000 } } }, custom_attributesV2:{ items:[] } },
    ]);
    const r = await correr([{ name:'buscar_producto', input:{ q:'cemento gris' } }], srv);
    const d = JSON.parse(r[0].json.data);
    const nombres = d.matches.map(m => m.item_name).join(' | ');
    chequear('La búsqueda ya no ofrece marcas que no se tienen (Cemex fuera)',
             !/cemex/i.test(nombres) && /alion/i.test(nombres), nombres);
    chequear('Se le avisa al modelo que se quitaron, para que no las nombre',
             d.referencias_sin_existencias === 1 && /NO las menciones/.test(d.nota_stock || ''),
             String(d.nota_stock || ''));
    chequear('Y la existencia viaja pegada a cada producto',
             d.matches[0].se_vende === true && d.matches[0].disponible_total === 2133,
             JSON.stringify(d.matches[0]).slice(0, 160));
    chequear('La existencia de TODA la lista se pide en UNA sola llamada',
             srv.pedidas.filter(u => /batchstockinfo/.test(u)).length === 1, JSON.stringify(srv.pedidas));
  }
  // ── 6. Una herramienta que la página no puede responder (cartera, pedidos) ──
  {
    const srv = tienda(ITEMS);
    const r = await correr([{ name:'cartera_cliente', input:{ nit:'900123' } }], srv);
    const d = JSON.parse(r[0].json.data);
    chequear('Lo que la página no sabe se responde sin exponer nada interno',
             d.no_disponible === true && !/error|falla|sistema|MCP|SAP/i.test(d.nota || ''),
             String(d.nota).slice(0, 140));
  }
  // ── 7. Varias consultas a la vez: sin sesiones, sin turnos, sin estorbarse ──
  {
    const srv = tienda(ITEMS);
    const r = await correr([
      { name:'buscar_producto', input:{ q:'cemento' } },
      { name:'precio_articulo', input:{ item_code:'10021733' } },
      { name:'precio_articulo', input:{ item_code:'10031840' } },
    ], srv);
    chequear('Las 3 consultas paralelas responden (el problema de las sesiones ya no existe aquí)',
             r.length === 3 && r.every(x => !/^ERROR/.test(String(x.json.data))),
             JSON.stringify(r.map(x => String(x.json.data).slice(0, 30))));
  }
  // ── 8. Si la tienda se cae, no se miente: el modelo ya sabe manejar el ERROR ──
  {
    const caida = { pedidas:[], http: async () => { throw new Error('ECONNREFUSED'); } };
    const r = await correr([{ name:'buscar_producto', input:{ q:'cemento' } }], caida);
    chequear('Si la tienda no responde, se devuelve ERROR (no una lista vacía que parezca "no tenemos")',
             /^ERROR/.test(String(r[0].json.data)), String(r[0].json.data).slice(0, 80));
  }

  // ── 9. EL HÍBRIDO: fuente_datos='tienda+sap' ───────────────────────────────
  // Medido el 25-ago: la tienda declara stock INFINITO (1.039.339 bultos de cemento; 99.999.999,9999 en
  // un melamínico) para que nada salga agotado en la web, y `is_in_stock` es true para TODO. El
  // inventario de verdad solo lo tiene SAP (Alion 2.388 · Cemex 0 ese mismo día). Por eso el híbrido:
  // producto, precio, atributos y enlace de la página; la EXISTENCIA, y solo ella, de SAP.
  {
    const llamadas = [];
    const mixto = { pedidas:[], http: async (o) => {
      llamadas.push(String(o.url || ''));
      const body = typeof o.body === 'string' ? JSON.parse(o.body) : (o.body || {});
      if (String(o.url || '').indexOf('/graphql') >= 0) {
        const q = JSON.stringify(body);
        const sel = q.indexOf('search:') >= 0 ? ITEMS : ITEMS.filter(i => q.indexOf(i.sku) >= 0);
        return { data:{ products:{ total_count: sel.length, items: sel } } };
      }
      if (body.method === 'initialize') return { headers:{ 'mcp-session-id':'ses-1' }, body:{} };
      return 'event: message\ndata: ' + JSON.stringify({ result:{ content:[{ type:'text',
        text: JSON.stringify({ item_code:'10021733', item_name:'CEMENTO GRIS ALION BULTO X 50kg',
          almacenes:[{ punto_venta:'CEDI', tipo_almacen:'VENTA', disponible: 2388 }] }) }] } }) + '\n';
    } };
    const r = await correr([
      { name:'buscar_producto', input:{ q:'cemento' } },
      { name:'disponibilidad_ciudad', input:{ item_code:'10021733', ciudad:'Bucaramanga' } },
    ], mixto, 'Ardisa', 'tienda+sap');
    const busq = JSON.parse(r[0].json.data);
    chequear('Híbrido · el PRODUCTO sigue saliendo de la página (con su enlace)',
             /ardisa\.com\/cemento-gris-alion-50kg\.html$/.test(busq.matches[0].url_tienda || ''),
             busq.matches[0].url_tienda);
    chequear('Híbrido · la EXISTENCIA sí se le pregunta a SAP (2.388, no el millón de la web)',
             /2388/.test(String(r[1].json.data)), String(r[1].json.data).slice(0, 160));
    chequear('Híbrido · y no se le pregunta a SAP nada que la página ya sepa',
             llamadas.filter(u => /graphql/.test(u)).length === 1 &&
             llamadas.filter(u => /mcp/.test(u)).length === 2,   // initialize + la consulta de existencia
             JSON.stringify(llamadas));
  }
  // Y en modo 'tienda' a secas, la existencia NO se le pregunta a SAP ni por equivocación.
  {
    const espia = { pedidas:[], http: async (o) => {
      const u = String(o.url || '');
      espia.pedidas.push(u);
      if (!/ardisa\.com\//.test(u)) throw new Error('SE ESCAPÓ FUERA DE LA TIENDA: ' + u);
      if (/batchstockinfo/.test(u)) return { city_id:905, items:{} };
      return { data:{ products:{ total_count:0, items:[] } } };
    } };
    const r = await correr([{ name:'disponibilidad_ciudad', input:{ item_code:'X' } }], espia, 'Ardisa', 'tienda');
    chequear('En modo tienda a secas, NADA sale hacia el MCP (ni la existencia)',
             espia.pedidas.length > 0 && espia.pedidas.every(u => !/mcp/.test(u)), JSON.stringify(espia.pedidas));
  }

  // ── 10. LA EXISTENCIA, POR LA CIUDAD DEL CLIENTE (2026-08-25, pregunta de Deicy) ───────────────
  // "si pregunta en Bogotá qué le respondería, o sea, porque toca por los centros de costos y acá hay
  // muchos". La existencia es POR CENTRO DE COSTO: en el panel de Magento el producto 10012043 muestra
  // CC-1145: 3 · CC-1445: 0 · Default Source: 48 · Salable: 51, y el endpoint en sesión de Bucaramanga
  // devuelve 3 — el CC-1145, no la suma. Faltaba pedir LA PLAZA DEL CLIENTE. Medido con sesión limpia:
  // BUCARAMANGA(905) Koral 3 / cemento 2073 · BOGOTÁ(1095) 0 y 0 · CALI(1061) 0 y 0.
  function tiendaCiudad(porCiudad) {
    const pasos = [];
    let ciudadSesion = 'BUCARAMANGA';
    return { pasos, http: async (o) => {
      const u = String(o.url || '');
      pasos.push(u);
      if (/customer\/account\/login/.test(u)) return { headers:{ 'set-cookie':['PHPSESSID=abc123; path=/'] } };
      if (/savelocation/.test(u)) {
        const m = String(o.body || '').match(/data\[city\]=([^&]*)/);
        ciudadSesion = decodeURIComponent(m ? m[1] : '');
        return '{"changed":true}';
      }
      if (/batchstockinfo/.test(u)) {
        const skus = decodeURIComponent(u.split('skus=')[1] || '').split(',');
        const items = {};
        skus.forEach(sk => { const n = (porCiudad[ciudadSesion] || {})[sk];
          items[sk] = { sku:sk, stock:(n||0), status:(n ? 'in_stock' : 'no_source') }; });
        return { city_id: ciudadSesion === 'BOGOTÁ' ? 1095 : 905, items };
      }
      return { data:{ products:{ total_count:0, items:[] } } };
    } };
  }
  const POR_CIUDAD = { BUCARAMANGA:{ '10012043':3 }, 'BOGOTÁ':{ '10012043':0 } };
  {
    const srv = tiendaCiudad(POR_CIUDAD);
    const r = await correr([{ name:'disponibilidad_ciudad', input:{ item_code:'10012043' } }], srv, 'Ardisa');
    const d = JSON.parse(r[0].json.data);
    chequear('Cliente de Bucaramanga: NO se pierde tiempo cambiando de plaza (es la del sitio)',
             !srv.pasos.some(u => /savelocation/.test(u)) && d.disponible_total === 3,
             JSON.stringify(srv.pasos.map(u => u.split('/').slice(3).join('/').slice(0, 30))));
  }
  {
    // El mismo producto, cliente de Bogotá: la sesión se fija ANTES de preguntar la existencia.
    const srv = tiendaCiudad(POR_CIUDAD);
    const $b = (n) => ({
      first: () => ({ json:
        n === 'Unir pendiente' ? { cfg_fuente:'tienda' } :
        n === 'Cerebro conversacional' ? { ses_out: JSON.stringify({ marca:'Ardisa', ciudad:'Bogotá' }) } :
        { headers:{} } }),
      all: () => [{ json:{ tuse:{ name:'disponibilidad_ciudad', input:{ item_code:'10012043' } } } }] });
    const fn = new Function('$', '$input', 'return (async function(){ ' + SAP + ' }).call(this);');
    const r = await fn.call({ helpers:{ httpRequest: srv.http } }, $b, { first: () => ({ json:{ headers:{} } }) });
    const d = JSON.parse(r[0].json.data);
    chequear('Cliente de Bogotá: la sesión de la web se fija en SU ciudad antes de preguntar',
             srv.pasos.some(u => /savelocation/.test(u)), JSON.stringify(srv.pasos.map(u => u.split('/').slice(3).join('/').slice(0, 26))));
    // ⚠️ Esta aserción decía `hay_disponibilidad === false` — o sea, "en Bogotá no hay". Se cambió el
    // mismo día, al medir que a esas plazas no se les asignaron fuentes en Magento: allí un 0 no
    // significa "agotado", significa "sin dato". Declarar agotado lo que no se sabe cuesta la venta.
    chequear('…y como esa plaza no tiene inventario asignado, NO se declara agotado: lo confirma el asesor',
             d.sin_dato === true && !d.disponible_total, JSON.stringify(d).slice(0, 160));
    chequear('El orden importa: primero la sesión, después el stock',
             srv.pasos.findIndex(u => /savelocation/.test(u)) < srv.pasos.findIndex(u => /batchstockinfo/.test(u)),
             JSON.stringify(srv.pasos.map(u => u.split('/').slice(3).join('/').slice(0, 26))));
  }
  {
    // Una ciudad que la tienda no maneja (Floridablanca): no se inventa una plaza, se consulta la de casa.
    const srv = tiendaCiudad(POR_CIUDAD);
    const $f = (n) => ({
      first: () => ({ json:
        n === 'Unir pendiente' ? { cfg_fuente:'tienda' } :
        n === 'Cerebro conversacional' ? { ses_out: JSON.stringify({ marca:'Ardisa', ciudad:'Floridablanca' }) } :
        { headers:{} } }),
      all: () => [{ json:{ tuse:{ name:'disponibilidad_ciudad', input:{ item_code:'10012043' } } } }] });
    const fn = new Function('$', '$input', 'return (async function(){ ' + SAP + ' }).call(this);');
    await fn.call({ helpers:{ httpRequest: srv.http } }, $f, { first: () => ({ json:{ headers:{} } }) });
    chequear('Una ciudad sin plaza en la tienda no rompe nada (consulta la de por defecto)',
             !srv.pasos.some(u => /savelocation/.test(u)) && srv.pasos.some(u => /batchstockinfo/.test(u)),
             JSON.stringify(srv.pasos.map(u => u.split('/').slice(3).join('/').slice(0, 26))));
  }

  // ── 11. UNA PLAZA SIN INVENTARIO ASIGNADO NO ES "AGOTADO" (2026-08-25) ─────────────────────────
  // Medido: el catálogo de la web es, en la práctica, el de BUCARAMANGA. Con la sesión puesta en otra
  // ciudad, "cemento" pasa de 108 resultados a 12 y "grifería lavamanos" de 145 a CERO — a esas plazas
  // no se les asignaron fuentes de inventario en Magento. Sin este guardarraíl, a un cliente de Bogotá
  // el bot le diría que TODO está agotado: falso, y le cuesta la venta a Ardisa.
  const $bog = (tuse) => (n) => ({
    first: () => ({ json:
      n === 'Unir pendiente' ? { cfg_fuente:'tienda' } :
      n === 'Cerebro conversacional' ? { ses_out: JSON.stringify({ marca:'Ardisa', ciudad:'Bogotá' }) } :
      { headers:{} } }),
    all: () => [{ json:{ tuse } }] });
  const correrBog = (tuse, srv) => new Function('$', '$input',
      'return (async function(){ ' + SAP + ' }).call(this);')
    .call({ helpers:{ httpRequest: srv.http } }, $bog(tuse), { first: () => ({ json:{ headers:{} } }) });
  // Servidor: en Bogotá TODO responde no_source (que es lo que pasa hoy de verdad).
  const bogota = () => ({ pasos:[], http: async function (o) {
    const u = String(o.url || ''); this.pasos = this.pasos || [];
    if (/customer\/account\/login/.test(u)) return { headers:{ 'set-cookie':['PHPSESSID=zzz; path=/'] } };
    if (/savelocation/.test(u)) return '{"changed":true}';
    if (/batchstockinfo/.test(u)) {
      const skus = decodeURIComponent(u.split('skus=')[1] || '').split(',');
      const items = {}; skus.forEach(sk => { items[sk] = { sku:sk, stock:0, status:'no_source' }; });
      return { city_id:1095, items };
    }
    const q = JSON.stringify(o.body || {});
    const sel = /search:/.test(q) ? ITEMS : ITEMS.filter(i => q.indexOf(i.sku) >= 0);
    return { data:{ products:{ total_count: sel.length, items: sel } } };
  } });
  {
    const r = await correrBog({ name:'buscar_producto', input:{ q:'cemento' } }, bogota());
    const d = JSON.parse(r[0].json.data);
    // 2026-08-26: antes se exigía `=== ITEMS.length`. Con el filtro de relevancia esa medida quedó
    // MAL: el fixture trae un cemento y un melamínico, y la consulta es "cemento" — botar el
    // melamínico es el acierto, no el fallo. Lo que esta prueba defiende es que la guarda de
    // `no_source` no DEJE LA LISTA EN CERO; eso es lo que se mide ahora.
    chequear('Bogotá · la lista NO se vacía aunque todo venga en no_source',
             d.matches.length > 0 && d.matches.some(m => /Cemento/i.test(m.item_name)),
             JSON.stringify(d).slice(0, 140));
    chequear('Bogotá · NO se etiqueta nada como agotado (el dato no es de fiar en esa plaza)',
             d.matches.every(m => m.se_vende === undefined && m.disponibilidad === undefined),
             JSON.stringify(d.matches[0]).slice(0, 160));
    chequear('Bogotá · se le dice al modelo que el asesor confirma la disponibilidad',
             /NO afirmes ni niegues disponibilidad/.test(d.nota_stock || ''), String(d.nota_stock).slice(0, 120));
    chequear('Bogotá · pero el PRECIO y el ENLACE sí se dan igual',
             d.matches[0].precio_con_iva > 0 && /\.html$/.test(d.matches[0].url_tienda || ''),
             JSON.stringify(d.matches[0]).slice(0, 160));
  }
  {
    const r = await correrBog({ name:'disponibilidad_ciudad', input:{ item_code:'10014960' } }, bogota());
    const d = JSON.parse(r[0].json.data);
    chequear('Bogotá · un producto suelto tampoco se declara agotado',
             d.sin_dato === true && /asesor se la confirma/.test(d.nota || ''), JSON.stringify(d).slice(0, 160));
  }
  {
    // Y en Bucaramanga (la plaza con datos) el "no hay" SÍ se cree: el caso Cemex no se puede perder.
    const srv = tienda(ITEMS);
    const r = await correr([{ name:'disponibilidad_ciudad', input:{ item_code:'10014960' } }], srv, 'Ardisa');
    const d = JSON.parse(r[0].json.data);
    chequear('Bucaramanga · el "no hay" SÍ se cree (no se pierde el caso Cemex)',
             d.hay_disponibilidad === false, JSON.stringify(d).slice(0, 140));
  }

  console.log('\n' + ok + '/' + total + ' pruebas pasan');
  process.exit(ok === total ? 0 : 1);
})();

// ══ EL BUSCADOR DE LA TIENDA ENGANCHA CUALQUIER COSA CON DOS PALABRAS (26-ago-2026) ═══════════
// Medido contra la tienda real: "llanta de carro" -> 2.066 resultados, el primero Sika Transparente;
// "disco corte" -> 17 de grifería. El modelo presenta lo que le den, así que el freno va en el código.
// Se compara por la RAÍZ DE 5 LETRAS para que "capuchino" (cliente) case con "Capuccino" (catálogo).
(function relevancia(){
  const STOP=['de','del','la','el','los','las','para','con','por','en','un','una','y','o','que','mas','tipo','color'];
  const SIN={TUBER:'TUBO', CANER:'TUBO', LAMIN:'LAMIN', TEJAS:'TEJA', DISCO:'DISCO'};
  const sinT=(t)=>String(t||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().trim();
  function relevantes(q, lista){
    const t=sinT(q).split(/[^A-Z0-9]+/).filter(w=>w.length>=4 && STOP.indexOf(w.toLowerCase())<0);
    if(!t.length) return lista;
    const r=t.map(w=>{ const x=w.slice(0,5); return SIN[x]||x; });
    return lista.filter(m=>r.some(x=>sinT(m.item_name||'').indexOf(x)>=0));
  }
  const P=(n)=>({item_name:n});
  const casos=[
    ['llanta de carro', ['Sika Transparente 5 De 16 Kg','Sika Transparente 5 De 3 Kg'], 0, 'la basura se bota'],
    ['disco corte',     ['Griferia Stretto Lavamanos Sencillo Cruz'],                    0, 'grifería no es un disco'],
    ['revestimiento',   ['Perfil Esquinero Grande','Pegacor Ceramico Blanco 25 Kg'],     0, 'perfiles no son revestimiento'],
    ['rh capuchino',    ['Melaminico Supercor Pb RH Capuccino Tex Madera 183X244X15'],   1, 'capuchino ≈ Capuccino (la raíz)'],
    ['teja zinc',       ['Teja Zinc Acesco 0.8X3.66 (3X12) Cal.33'],                     1, 'el acierto obvio no se pierde'],
    ['cemento gris',    ['Cemento Gris Alion Bulto X 50Kg'],                             1, 'idem'],
    ['tuberia pvc',     ['Tubo Presion De 3/4 pulgadas RDE 11 6m'],                      1, 'tubería → tubo (sinónimo)'],
    ['rh',              ['Cualquier Cosa Sin Relacion'],                                 1, 'solo palabras cortas: no se juzga'],
  ];
  casos.forEach(function(c){
    const r=relevantes(c[0], c[1].map(P));
    const ok=(r.length>0)===(c[2]>0);
    console.log('  '+(ok?'✅':'❌')+' "'+c[0]+'" -> quedan '+r.length+'  ('+c[3]+')');
    if(!ok) fallos++;
  });
})();
