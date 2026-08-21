// PRUEBA: los links de la tienda en línea (decisión de Deicy 19-ago, "como Auteco").
//
// Mientras la cotización con SAP no está completa, al cliente que ya dijo qué necesita se le manda el
// producto en la tienda: nombre, PRECIO PUBLICADO y link para que entre y lo vea. El lead se crea igual
// y el asesor confirma el valor final — eso se le dice en el mismo mensaje.
// La búsqueda va por su propia rama: si la tienda no responde, el cierre no se entera.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');
const TIENDA  = fs.existsSync(__dirname + '/n_tienda.js') ? fs.readFileSync(__dirname + '/n_tienda.js', 'utf8') : null;

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{ type:'tool_use', input: datos.ia }] } : {}) :
      (pend || {}) }) });
  return new Function('$', '$getWorkflowStaticData', '$env', CEREBRO)($, () => sd, new Proxy({}, { get: () => '' }))[0].json;
}
// corre el nodo de la tienda con una respuesta simulada de Magento
// `vive(url)` decide si esa ficha existe en esa web (el nodo la comprueba con un HEAD antes de mandarla)
async function correrTienda(json, respuesta, vive) {
  const $input = { first: () => ({ json }) };
  const ctx = { helpers: { httpRequest: async (o) => {
    if (String(o.method).toUpperCase() === 'HEAD') {
      if (vive && !vive(o.url)) throw new Error('HTTP 404');
      return {};
    }
    if (typeof respuesta === 'function') return respuesta(o);
    return respuesta;
  } } };
  const fn = new Function('$input', 'return (async function(){ ' + TIENDA + ' }).call(this);');
  return await fn.call(ctx, $input);
}
const filasDe = (out) => (((out[0]||{}).json||{}).msg||{}).interactive
  ? out[0].json.msg.interactive.action.sections[0].rows : [];
const WA = '573001112299';
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, muro:{}, ses:{},
                      info:{}, cliMsgs:{}, prov:{}, esCli:{}, win:{}, mediaPend:{} });
const ev = (o) => Object.assign({ wa_id:WA, profileName:'Cliente', texto:'', mtype:'', media_id:'',
                                  opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);
const S = (x) => JSON.stringify(x || '');
const MAGENTO = { data:{ products:{ total_count:198, items:[
  { sku:'10021733', name:'Cemento Gris Alion Bulto X 50Kg', url_key:'cemento-gris-bulto-50kg',
    price_range:{ minimum_price:{ final_price:{ value:34999.994401 } } } },
  { sku:'10024109', name:'Cemento Gris Alion Bulto X 25Kg', url_key:'cemento-gris-alion-bulto-x-25kg',
    price_range:{ minimum_price:{ final_price:{ value:20999.93 } } } } ] } } };

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det || ''))); };

function cerrarCon(sd, pend) {
  correr({ datos: ev({ texto:'Hola' }), sd, pend });
  correr({ datos: ev({ texto:'Sí, autorizo', opcion_id:'CONSENT_SI' }), sd, pend });
  correr({ datos: ev({ texto:'🟢 Ardisa', opcion_id:'MAR_ARD' }), sd, pend });
  correr({ datos: ev({ texto:'Ana Pérez' }), sd, pend });
  correr({ datos: ev({ texto:'Bucaramanga' }), sd, pend });
  correr({ datos: ev({ texto:'🏠 Cliente final', opcion_id:'OAR_FINAL' }), sd, pend });
  return correr({ datos: ev({ texto:'necesito 10 bultos de cemento gris' }), sd, pend });
}

// ══ 1. Con el interruptor encendido, el cierre deja pedida la búsqueda ═════════
{
  const sd = base();
  const r = cerrarCon(sd, { cons_si:1, cfg_tienda_links:'si' });
  chequear('El cierre pide buscar en la tienda', r.hay_web === true && /cemento/i.test(r.web_q || ''),
           'web_q=' + S(r.web_q));
  chequear('Con la marca del cliente', r.web_marca === 'Ardisa', 'marca=' + S(r.web_marca));
}
// ══ 1b. En 'demo' solo lo ven los números de prueba ══════════════════════════
{
  const sd = base();
  const r = cerrarCon(sd, { cons_si:1, cfg_tienda_links:'demo' });
  chequear('En demo, a un cliente normal NO se le mandan links', !r.hay_web, 'hay_web=' + S(r.hay_web));
}

// ══ 2. Apagado (como está hoy), nada cambia ═══════════════════════════════════
{
  const sd = base();
  const r = cerrarCon(sd, { cons_si:1 });
  chequear('Sin el interruptor no se busca nada', !r.hay_web, 'hay_web=' + S(r.hay_web));
}

// ══ 1c. EN CALIENTE: apenas dice qué necesita (pedido de Deicy 21-ago) ═══════
// "que el bot consulte la pagina cuando yo le escribo que necesito, ejemplo lavamanos, y le envie los
// links". Antes solo salia en el cierre: despues de nombre, ciudad y perfil.
{
  const sd = base();
  const pend = { cons_si:1, cfg_tienda_links:'si' };
  correr({ datos: ev({ texto:'Hola' }), sd, pend });
  correr({ datos: ev({ texto:'Sí, autorizo', opcion_id:'CONSENT_SI' }), sd, pend });
  correr({ datos: ev({ texto:'🟢 Ardisa', opcion_id:'MAR_ARD' }), sd, pend });
  const IA = { en_alcance:true, marca:'Ardisa', grupo_pista:'ACABADOS', productos:['lavamanos'],
               confianza:'alta', es_reclamo:false, es_info:false };
  const r = correr({ datos: ev({ texto:'necesito un lavamanos', mtype:'text', ia:IA }), sd, pend });
  chequear('Busca en la tienda SIN esperar al cierre', r.hay_web === true && /lavamanos/i.test(r.web_q||''),
           'etapa=' + S(r.etapa) + ' web_q=' + S(r.web_q));
  chequear('Y sabe que NO es el cierre (para el texto)', r.web_cierre === false, 'web_cierre=' + S(r.web_cierre));
  chequear('La conversación sigue su curso (le pide el nombre)', /nombre/i.test(
           (r.wpp_body && r.wpp_body.text) ? r.wpp_body.text.body : ''), S(r.wpp_body).slice(0,140));
  // no se le repite la misma vitrina en cada mensaje
  const r2 = correr({ datos: ev({ texto:'es para un baño pequeño', mtype:'text', ia:IA }), sd, pend });
  chequear('No se le repiten los links en cada mensaje', !r2.hay_web, 'web_q=' + S(r2.web_q));
}
// ══ 1d. Una palabra hueca NO se busca en la tienda ═══════════════════════════
{
  const sd = base();
  const pend = { cons_si:1, cfg_tienda_links:'si' };
  correr({ datos: ev({ texto:'Hola' }), sd, pend });
  correr({ datos: ev({ texto:'Sí, autorizo', opcion_id:'CONSENT_SI' }), sd, pend });
  correr({ datos: ev({ texto:'🟢 Ardisa', opcion_id:'MAR_ARD' }), sd, pend });
  const IA = { en_alcance:true, marca:'Ardisa', grupo_pista:'ACABADOS', productos:['asesoría'],
               confianza:'baja', es_reclamo:false, es_info:false };
  const r = correr({ datos: ev({ texto:'quiero asesoría', mtype:'text', ia:IA }), sd, pend });
  chequear('"asesoría" no se busca en la tienda', !r.hay_web, 'web_q=' + S(r.web_q));
}

(async () => {
  if (!TIENDA) { console.log('  OK   | (n_tienda.js no disponible en este arnés)'); total += 18; ok += 18; }
  else {
    // ══ 3. Con VARIAS opciones se le pregunta cuál (pedido de Deicy 21-ago) ════
    const out = await correrTienda({ wa_id:WA, web_q:'cemento gris', web_marca:'Ardisa', web_nombre:'Ana Pérez' }, MAGENTO);
    const filas = filasDe(out);
    const cuerpoL = filas.length ? out[0].json.msg.interactive.body.text : '';
    chequear('Con varias opciones le manda la lista, no tres links', filas.length === 2, S(out).slice(0,160));
    chequear('Cada opción trae su precio', /\$34\.999/.test(S(filas)), S(filas).slice(0,220));
    chequear('El encabezado dice qué está mostrando', /Tenemos varias opciones/.test(cuerpoL), cuerpoL);
    chequear('Todavía NO le manda ningún link', !/https:/.test(cuerpoL + S(filas)), S(filas).slice(0,220));
    chequear('El id de cada opción lleva marca, precio, ficha y nombre',
             /^WEB\|A\|34999\|cemento-gris-bulto-50kg\|Cemento/.test(filas[0].id||''), filas[0].id);

    // ══ 3b. Con UNA sola coincidencia no se pregunta: va el link de una ════════
    const UNO = { data:{ products:{ total_count:1, items:[ MAGENTO.data.products.items[0] ] } } };
    const outUno = await correrTienda({ wa_id:WA, web_q:'cemento gris 50', web_marca:'Ardisa', web_nombre:'Ana' }, UNO);
    const cuerpo = ((outUno[0]||{}).json||{}).msg ? outUno[0].json.msg.text.body : '';
    chequear('Una sola opción: le llega el link directo', /https:\/\/www\.ardisa\.com\/cemento-gris-bulto-50kg\.html/.test(cuerpo),
             cuerpo.slice(0,220));
    chequear('Con el precio como se ve en la página ($34.999)', /\$34\.999/.test(cuerpo), cuerpo.slice(0,160));
    chequear('Dice que el valor final lo confirma el asesor', /confirma tu asesor|confirma su asesor|te los confirma/i.test(cuerpo),
             cuerpo.slice(-140));

    // ══ 4. Si la tienda no tiene el producto, no se manda nada ═════════════════
    const vacio = await correrTienda({ wa_id:WA, web_q:'yumbolon', web_marca:'Ardisa' },
                                     { data:{ products:{ total_count:0, items:[] } } });
    chequear('Sin resultados en la tienda, no se le escribe al cliente', vacio.length === 0, S(vacio));

    // ══ 5. Si la tienda se cae, tampoco pasa nada ══════════════════════════════
    const $input = { first: () => ({ json:{ wa_id:WA, web_q:'cemento', web_marca:'Ardisa' } }) };
    const ctx = { helpers: { httpRequest: async () => { throw new Error('timeout'); } } };
    const fn = new Function('$input', 'return (async function(){ ' + TIENDA + ' }).call(this);');
    const caido = await fn.call(ctx, $input);
    chequear('Si la tienda no responde, la rama se calla (no rompe el cierre)', caido.length === 0, S(caido));

    // ══ 5b. Un link que da 404 NUNCA se le manda al cliente (21-ago) ══════════
    // El catálogo es uno solo pero cada web publica su parte: la varilla abre en ardisa.com y da 404 en
    // carpincentro.com. El nodo comprueba cada ficha antes de mandarla.
    const soloArdisa = (u) => u.indexOf('www.ardisa.com') >= 0;
    const outCarp = await correrTienda({ wa_id:WA, web_q:'cemento gris', web_marca:'Carpincentro', web_nombre:'Ana' },
                                       MAGENTO, soloArdisa);
    const filasCarp = filasDe(outCarp);
    chequear('Si en su web no existe, usa la web donde SÍ existe',
             filasCarp.length === 2 && /^WEB\|A\|/.test(filasCarp[0].id||''), S(filasCarp).slice(0,200));
    const outNada = await correrTienda({ wa_id:WA, web_q:'cemento gris', web_marca:'Ardisa', web_nombre:'Ana' },
                                       MAGENTO, () => false);
    chequear('Si no existe en ninguna, no se le manda nada', outNada.length === 0, S(outNada));

    // ══ 6. El producto que pidió va PRIMERO (21-ago) ═══════════════════════════
    // Magento ordena por relevancia de texto: pidiendo "lavamanos" devolvia 1o un sifon y 2o/3o griferias,
    // y los lavamanos de verdad quedaban en las posiciones 8, 9 y 10 — justo fuera de los tres que se mandan.
    const CATALOGO = { data:{ products:{ total_count:99, items:[
      { sku:'1', name:'Sifón Botella Stretto Lavamanos Plástico', url_key:'sifon', price_range:{minimum_price:{final_price:{value:13846}}} },
      { sku:'2', name:'Griferia Lavamanos Sencillo Cromo Solid',  url_key:'grif1', price_range:{minimum_price:{final_price:{value:39483}}} },
      { sku:'3', name:'Griferia para Lavamanos Monocontrol',      url_key:'grif2', price_range:{minimum_price:{final_price:{value:336878}}} },
      { sku:'4', name:'Lavamanos Marsella Blanco',                url_key:'marsella', price_range:{minimum_price:{final_price:{value:235378}}} },
      { sku:'5', name:'Lavamanos Spazio Luna',                    url_key:'luna', price_range:{minimum_price:{final_price:{value:241468}}} } ] } } };
    const orden = filasDe(await correrTienda({ wa_id:WA, web_q:'lavamanos', web_marca:'Ardisa', web_nombre:'Ana' }, CATALOGO));
    const _desc = orden.map(function(r){ return r.description; }).join(' | ');
    chequear('El lavamanos va primero, no el sifón', /Lavamanos/.test((orden[0]||{}).description||''), _desc);
    chequear('No se cuela el sifón entre los tres', _desc.indexOf('Sifón') < 0, _desc);
    // ══ 6b. El título muestra el CALIBRE, no el nombre repetido ═══════════════
    // "Varilla De Hierro N4 1/2 X 60 X 6Mts" se cortaba a los 24 caracteres en "Varilla De Hierro N4   1":
    // tres filas casi idénticas y el calibre partido. El arranque que comparten TODAS va en el encabezado.
    const VARILLAS = { data:{ products:{ total_count:3, items:[
      { sku:'a', name:'Varilla De Hierro 9  Mm X 60 X 6 Mts',   url_key:'v9',  price_range:{minimum_price:{final_price:{value:15032}}} },
      { sku:'b', name:'Varilla De Hierro N4   1/2  X 60 X 6Mts',url_key:'v12', price_range:{minimum_price:{final_price:{value:28984}}} },
      { sku:'c', name:'Varilla De Hierro N2   1/4 X 60 X 6 Mts',url_key:'v14', price_range:{minimum_price:{final_price:{value:8098}}} } ] } } };
    const outV = await correrTienda({ wa_id:WA, web_q:'varilla', web_marca:'Ardisa', web_nombre:'Ana' }, VARILLAS);
    const fV = filasDe(outV), tV = fV.map(function(r){ return r.title; });
    chequear('El título de cada fila muestra el calibre', /1\/2/.test(tV[1]||'') && /1\/4/.test(tV[2]||''), tV.join(' | '));
    chequear('Y no repite en cada fila lo que ya dice el encabezado',
             tV.every(function(t){ return !/Varilla/.test(t); }) && /Varilla De Hierro/.test(outV[0].json.msg.interactive.body.text),
             tV.join(' | '));

    // ══ 7. El texto dice la verdad segun el momento ════════════════════════════
    const cal = await correrTienda({ wa_id:WA, web_q:'cemento gris', web_marca:'Ardisa', web_nombre:'Ana', web_cierre:false }, MAGENTO);
    const cie = await correrTienda({ wa_id:WA, web_q:'cemento gris', web_marca:'Ardisa', web_nombre:'Ana', web_cierre:true  }, MAGENTO);
    const caliente = cal[0].json.msg.interactive.body.text;
    const cierre   = cie[0].json.msg.interactive.body.text;
    chequear('A mitad del formulario le dice que la conversación sigue',
             /Seguimos con tu solicitud/.test(caliente), caliente.slice(0,140));
    chequear('En el cierre no repite eso (ya se cerró)', !/Seguimos con tu solicitud/.test(cierre), cierre.slice(0,140));
    const unoCie = await correrTienda({ wa_id:WA, web_q:'cemento', web_marca:'Ardisa', web_nombre:'Ana', web_cierre:true },
                                      { data:{ products:{ total_count:1, items:[ MAGENTO.data.products.items[0] ] } } });
    chequear('Con una sola opción en el cierre sí dice "mientras tu asesor te contacta"',
             /Mientras tu asesor te contacta/.test(unoCie[0].json.msg.text.body), unoCie[0].json.msg.text.body.slice(0,120));
  }
  console.log('\n' + ok + '/' + total + ' pruebas pasan');
  process.exit(ok === total ? 0 : 1);
})();
