// Informe multi-agente 05/08: WhatsApp deja tocables TODOS los menús viejos del chat. Si el cliente
// re-tocaba uno estando en el paso 'detalle', la etiqueta llegaba como texto y CERRABA el lead con esa
// basura como solicitud — hasta "❌ No autorizo" (¡el cliente REVOCANDO!) creaba un lead y avisaba a la
// asesora. Un botón NUNCA es la descripción del pedido. (Mismo patrón ya arreglado en el paso del nombre.)
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{type:'tool_use', input: datos.ia}] } : {}) :
      (pend || {}) }) });
  return new Function('$','$getWorkflowStaticData','$env', CEREBRO)($, () => sd, new Proxy({},{get:()=>''}))[0].json;
}
const WA = '573001112233';
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, muro:{}, ses:{},
                      info:{}, cliMsgs:{} });
// El nodo "Extraer datos" real convierte el tap en texto = etiqueta del botón; el arnés hace lo mismo.
const tap = (id, etiqueta) => ({ wa_id:WA, profileName:'Pedro Perez', texto:etiqueta, mtype:'',
  media_id:'', opcion_id:id, opcion_txt:etiqueta, es_media:false, ia:null });
const enDetalle = (sd) => { sd.ses[WA] = { paso:'detalle', t:Date.now(), consent:true, nombre:'Pedro Perez',
  ciudad:'Bucaramanga', ciudadId:'BUCARAMANGA', marca:'Ardisa', grupo:'ACABADOS', interes:'Acabados',
  ocupacion:'🏠 Cliente final' }; return sd; };
const sinLead = (sd, r) => !(sd.pendCierre[WA] && sd.pendCierre[WA].lead) && !r.lead;

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det||''))); };

// ══ Botones viejos re-tocados: NINGUNO cierra el lead ══════════════════════════
for (const [id, et] of [['CONSENT_SI','✅ Sí, autorizo'], ['CONSENT_NO','❌ No autorizo'],
                        ['GRP_CONS','🧱 Construcción'], ['OAR_FINAL','🏠 Cliente final'],
                        ['BUCARAMANGA','Bucaramanga']]) {
  const sd = enDetalle(base());
  const r = correr({ datos: tap(id, et), sd, pend:{ cons_si:1 } });
  chequear('Re-tocar "' + et + '" NO cierra el lead', sinLead(sd, r) && r.etapa !== 'cierre',
           'etapa=' + r.etapa + ' lead=' + JSON.stringify((r.lead||{}).detalle ||
             (sd.pendCierre[WA] && sd.pendCierre[WA].lead && sd.pendCierre[WA].lead.detalle)));
}
{
  // Y en vez de cerrar, le vuelve a preguntar qué necesita
  const sd = enDetalle(base());
  const r = correr({ datos: tap('CONSENT_SI','✅ Sí, autorizo'), sd, pend:{ cons_si:1 } });
  chequear('Le vuelve a preguntar el producto', /qu[eé] producto/i.test(JSON.stringify(r.wpp_body||'')),
           JSON.stringify(r.wpp_body||'').slice(0,140));
}

// ══ NEGATIVOS: lo legítimo sigue funcionando igual ═════════════════════════════
{
  const sd = enDetalle(base());
  const r = correr({ datos: Object.assign(tap('',''), { texto:'10 bultos de cemento gris',
    ia:{ en_alcance:true, marca:'Ardisa', grupo_pista:'CONSTRUCCION', productos:['cemento gris'],
         confianza:'alta', es_info:false, es_reclamo:false } }), sd, pend:{ cons_si:1 } });
  chequear('El texto real SÍ cierra el lead', r.etapa === 'cierre', 'etapa=' + r.etapa);
}
{
  const sd = enDetalle(base());
  const r = correr({ datos: Object.assign(tap('',''), { es_media:true, mtype:'image', media_id:'MID9',
    ia:{ en_alcance:true, marca:'Ardisa', grupo_pista:'ACABADOS', productos:['cerámica'],
         confianza:'alta', es_info:false, es_reclamo:false } }), sd, pend:{ cons_si:1 } });
  chequear('La foto en el paso detalle sigue valiendo', r.etapa === 'cierre', 'etapa=' + r.etapa);
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
