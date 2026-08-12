// PRUEBA: el cliente que completa el flujo y da un producto que el bot NO reconoce, NO se pierde
// (caso Daniela Morales / "Tapa luz", 12-ago). La IA marcó "tapaluz" (accesorio eléctrico de mostrador)
// fuera de alcance y el bot la interrogó y la perdió — tras completar TODO el flujo de Carpincentro.
// Regla de Deicy "nada se pierde": una vez completado el flujo, lo que escriba en el paso final SE ENRUTA
// (el asesor sabe qué es); solo la BASURA de verdad (asdf, prueba, un saludo) se rechaza.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, muro:{}, ses:{},
                      info:{}, cliMsgs:{}, prov:{}, esCli:{}, lastId:{}, lastOpc:{}, aiRate:{}, mediaNudge:{}, reclamo:{} });
const S = (x) => JSON.stringify(x || '');

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det || ''))); };

// Corre el flujo Carpincentro completo y devuelve el resultado del último mensaje (el producto en 'detalle').
function flujoCarp(WA, productoTxt, ia) {
  const sd = base();
  const run = (datos, pend) => {
    const $ = (n) => ({ first: () => ({ json:
        n === 'Extraer datos'   ? datos :
        n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{ type:'tool_use', input: datos.ia }] } : {}) :
        (pend || {}) }) });
    return new Function('$','$getWorkflowStaticData','$env', CEREBRO)($, () => sd, new Proxy({},{get:()=>''}))[0].json;
  };
  const ev = (o) => Object.assign({ wa_id:WA, profileName:'Cliente', texto:'', mtype:'', media_id:'', opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);
  run(ev({ texto:'Hola! Estoy buscando asesoría' }), { cons_si:0 });
  run(ev({ texto:'Sí, autorizo', opcion_id:'CONSENT_SI' }), { cons_si:1 });
  run(ev({ texto:'🟡 Carpincentro', opcion_id:'MAR_CARP' }), { cons_si:1 });
  run(ev({ texto:'Daniela Morales' }), { cons_si:1 });
  run(ev({ texto:'Bogotá' }), { cons_si:1 });
  run(ev({ texto:'PT_0', opcion_id:'PT_0' }), { cons_si:1 });
  run(ev({ texto:'🪑 Negocio mobiliario', opcion_id:'OCA_NEG' }), { cons_si:1 });
  const r = run(ev({ texto:productoTxt, ia }), { cons_si:1 });
  return { r, sd };
}
const FUERA = { en_alcance:false, confianza:'media', productos:[], acuse:'' };   // la IA NO reconoce el producto

// ══ 1. "Tapa luz" (IA lo ve fuera de alcance) -> se enruta a Karime, no se pierde ══
{
  const { r } = flujoCarp('573177662936', 'Tapa luz', FUERA);
  chequear('"Tapa luz" cierra el lead (no interroga ni pierde)', r.etapa === 'cierre' && !!r.lead, 'etapa=' + r.etapa);
  chequear('Y le llega a Karime (Carpincentro) con el producto',
           (r.lead||{}).asesor === 'Karime Vannesa' && /tapa luz/i.test((r.lead||{}).detalle||''),
           S((r.lead||{}).asesor) + ' / ' + S((r.lead||{}).detalle).slice(0,40));
}

// ══ 2. Otros productos que el bot no tiene en su lista tampoco se pierden ══════
for (const p of ['geotextil nt 40', 'bisagra cangreja', 'angeo para ventana', 'tapa de registro 20x20']) {
  const { r } = flujoCarp('5731000000' + (p.length % 10), p, FUERA);
  chequear('"' + p + '" -> se enruta (no se pierde)', r.etapa === 'cierre' && !!r.lead, 'etapa=' + r.etapa);
}

// ══ 3. La BASURA de verdad SIGUE sin crear lead (no ensuciamos el reporte) ═════
for (const g of ['asdf', 'prueba', 'jajaja', 'hola', 'zzz', 'qwerty']) {
  const { r } = flujoCarp('5732000000' + (g.length % 10), g, { en_alcance:false, confianza:'baja', productos:[] });
  chequear('Basura "' + g + '" NO crea lead', !r.lead, 'etapa=' + r.etapa + ' lead=' + S((r.lead||{}).detalle));
}

// ══ 3b. "no sé" es un cliente que necesita ayuda -> se enruta (no es basura) ══
{
  const { r } = flujoCarp('573177000009', 'no sé', { en_alcance:false, confianza:'baja', productos:[] });
  chequear('"no sé" (cliente que necesita ayuda) se enruta, no se pierde', r.etapa === 'cierre' && !!r.lead, 'etapa=' + r.etapa);
}

// ══ 4. Un producto que la IA SÍ reconoce sigue cerrando igual (sin regresión) ══
{
  const { r } = flujoCarp('573177000001', 'melamina blanca 15mm',
    { en_alcance:true, confianza:'alta', productos:['melamina blanca'], grupo_pista:'CARPINCENTRO', acuse:'' });
  chequear('Producto reconocido por la IA cierra normal', r.etapa === 'cierre' && !!r.lead, 'etapa=' + r.etapa);
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
