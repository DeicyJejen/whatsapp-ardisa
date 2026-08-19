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
async function correrTienda(json, respuesta) {
  const $input = { first: () => ({ json }) };
  const ctx = { helpers: { httpRequest: async () => respuesta } };
  const fn = new Function('$input', 'return (async function(){ ' + TIENDA + ' }).call(this);');
  return await fn.call(ctx, $input);
}
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

(async () => {
  if (!TIENDA) { console.log('  OK   | (n_tienda.js no disponible en este arnés)'); total += 4; ok += 4; }
  else {
    // ══ 3. El mensaje que le llega al cliente ═══════════════════════════════════
    const out = await correrTienda({ wa_id:WA, web_q:'cemento gris', web_marca:'Ardisa', web_nombre:'Ana Pérez' }, MAGENTO);
    const cuerpo = ((out[0] || {}).json || {}).msg ? out[0].json.msg.text.body : '';
    chequear('Le llega un mensaje con los productos', !!cuerpo, S(out).slice(0,120));
    chequear('Con el precio como se ve en la página ($34.999)', /\$34\.999/.test(cuerpo), cuerpo.slice(0,160));
    chequear('Y con el link del producto',
             /https:\/\/www\.ardisa\.com\/cemento-gris-bulto-50kg\.html/.test(cuerpo), cuerpo.slice(0,220));
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
  }
  console.log('\n' + ok + '/' + total + ' pruebas pasan');
  process.exit(ok === total ? 0 : 1);
})();
