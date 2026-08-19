// PRUEBA: el cliente que YA cerró y vuelve el MISMO día no llena el formulario otra vez.
//
// Deicy, 19-ago (caso Paoal): cerró a las 10:22 con Karime y a las 10:42 escribió "¿tienen la lámina Velvet
// Touch Camel de Rehau?". El bot lo tomó como consulta NUEVA —bastaban 5 minutos desde el cierre— y le volvió
// a preguntar el perfil y la ciudad, cuando ya tenía asesora hacía veinte minutos.
// El corte correcto no son 5 minutos: es el DÍA. Mismo día -> se suma a su solicitud y se le avisa a SU
// asesora. Otro día -> entra como cliente nuevo (regla del 12-ago, que no cambia).
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{ type:'tool_use', input: datos.ia }] } : {}) :
      (pend || {}) }) });
  return new Function('$', '$getWorkflowStaticData', '$env', CEREBRO)($, () => sd, new Proxy({}, { get: () => '' }))[0].json;
}
const WA = '573134977669';
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, muro:{}, ses:{},
                      info:{}, cliMsgs:{}, prov:{}, esCli:{}, win:{}, mediaPend:{} });
const ev = (o) => Object.assign({ wa_id:WA, profileName:'Paola', texto:'', mtype:'', media_id:'',
                                  opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);
const P = { cons_si:1 };
const IA_REHAU = { en_alcance:true, marca:'Carpincentro', grupo_pista:'', productos:['lámina Rehau Velvet Touch'],
                   confianza:'alta', es_info:false, es_reclamo:false };
const body = (r) => (r.wpp_body && (r.wpp_body.text ? r.wpp_body.text.body
                    : (r.wpp_body.interactive && r.wpp_body.interactive.body && r.wpp_body.interactive.body.text))) || '';
const S = (x) => JSON.stringify(x || '');
const preguntaFormulario = (r) => /cómo te identificas|cuál es tu \*?nombre|en qué \*?ciudad|Elegir opción/i.test(body(r));

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det || ''))); };

// Deja el lead cerrado con Karime (Carpincentro, Bucaramanga)
function cerrar(sd) {
  correr({ datos: ev({ texto:'Hola' }), sd, pend:P });
  correr({ datos: ev({ texto:'Sí, autorizo', opcion_id:'CONSENT_SI' }), sd, pend:P });
  correr({ datos: ev({ texto:'🟡 Carpincentro', opcion_id:'MAR_CARP' }), sd, pend:P });
  correr({ datos: ev({ texto:'Paola Ruiz' }), sd, pend:P });
  correr({ datos: ev({ texto:'Bucaramanga' }), sd, pend:P });
  correr({ datos: ev({ texto:'PT_0', opcion_id:'PT_0' }), sd, pend:P });
  correr({ datos: ev({ texto:'🪑 Industrial del mueble', opcion_id:'OCA_IND' }), sd, pend:P });
  correr({ datos: ev({ texto:'lamina de rehau' }), sd, pend:P });
  sd.pendCierre = {};                 // el finalizador ya entregó la tarjeta
}

// ══ 1. MISMO DÍA, 20 minutos después: se suma, no se reinicia ═════════════════
{
  const sd = base();
  cerrar(sd);
  sd.ses[WA].closedAt = Date.now() - 20*60000;   // cerró hace 20 min (como Paoal)
  sd.ses[WA].t = Date.now() - 20*60000;
  const r = correr({ datos: ev({ texto:'Quiero conocer si tienen la lamina velvet toch camel de Rehau', ia:IA_REHAU }), sd, pend:P });
  chequear('NO le vuelve a preguntar el formulario', !preguntaFormulario(r), body(r).slice(0,120));
  chequear('Le confirma que ya se lo pasamos a su asesora',
           /ya se lo pasamos|en gestión|priorizada/i.test(body(r)), body(r).slice(0,120));
  chequear('Y a la asesora le llega lo que agregó',
           /velvet|rehau/i.test(S(r.aviso_body)), S(r.aviso_body).slice(0,160));
  chequear('No se crea un lead duplicado', sd.leads.filter(l => l.wa === WA).length === 1,
           'leads=' + sd.leads.filter(l => l.wa === WA).length);
}

// ══ 2. OTRO DÍA: el cliente entra como nuevo — eso lo fija tests/test_otro_dia_entra_nuevo.js,
//    que reconstruye la sesión como lo hace el bot de verdad (desde la BD, no a mano). ══

// ══ 3. Un "gracias" sigue siendo cortesía, no reinicia nada ═══════════════════
{
  const sd = base();
  cerrar(sd);
  sd.ses[WA].closedAt = Date.now() - 20*60000;
  const r = correr({ datos: ev({ texto:'gracias' }), sd, pend:P });
  chequear('"gracias" no reinicia el flujo', !preguntaFormulario(r) && r.etapa === 'cortesia',
           'etapa=' + r.etapa + ' ' + body(r).slice(0,80));
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
