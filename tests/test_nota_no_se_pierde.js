// Caso REAL: Alfonso Crismatt (lead #261, 10-ago). Escribio "Melamina rh de color beige o tonos similares"
// JUSTO cuando el bot le estaba pidiendo el nombre. A Karime le llego como solicitud:
//     "Carpi centro Barranquilla?"
// ...la pregunta suelta que el habia hecho ANTES de autorizar. La melamina no aparecio por ningun lado.
//
// El bot tenia DOS memorias para esto y se anulaban entre si:
//   · cliMsgs (todo lo que escribe el cliente) EXCLUDE a proposito los pasos 'nombre'/'ciudad', para que el
//     nombre no termine listado como solicitud.
//   · st.notas existe justo para rescatar lo que si era producto en esos pasos.
// Pero al armar el detalle, cliMsgs le GANABA a st.detalle -> la nota se descartaba entera.
// De 157 leads desde el 23-jul, solo 2 traian nota.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{type:'tool_use', input: datos.ia}] } : {}) :
      (pend || {}) }) });
  return new Function('$','$getWorkflowStaticData','$env', CEREBRO)($, () => sd, new Proxy({},{get:()=>''}))[0].json;
}
const WA = '573234358740';
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, ses:{}, cliMsgs:{}, win:{} });
const ev = (o) => Object.assign({ wa_id:WA, profileName:'Alfonso Crismatt', texto:'', mtype:'', media_id:'',
                                  opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);
const IA_PROD = { en_alcance:true, es_reclamo:false, es_info:false, pide_humano:false, confianza:'alta',
                  productos:['melamina RH beige'], grupo_pista:'', marca:'Carpincentro' };

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det||''))); };

// Devuelve el lead que se guardaria en la BD (venga directo o por el cierre diferido).
const leadDe = (r, sd) => r.lead || (sd.pendCierre[WA] && sd.pendCierre[WA].lead) || null;

// ══ La conversacion de Alfonso, en su orden real ═══════════════════════════════
{
  const sd = base();
  correr({ datos: ev({ texto:'Hola! Estoy buscando asesoría' }), sd, pend:{} });
  correr({ datos: ev({ texto:'Carpi centro Barranquilla?' }), sd, pend:{} });
  correr({ datos: ev({ opcion_id:'CONSENT_SI', opcion_txt:'✅ Sí, autorizo' }), sd, pend:{} });
  correr({ datos: ev({ opcion_id:'MAR_CARP', opcion_txt:'🟡 Carpincentro' }), sd, pend:{} });
  // El bot le esta pidiendo el NOMBRE y el escribe el producto:
  const st0 = sd.ses[WA] || {};
  chequear('El bot le está pidiendo el nombre en este punto', st0.paso === 'nombre', 'paso=' + st0.paso);
  correr({ datos: ev({ texto:'Melamina rh de color beige o tonos similares', ia:IA_PROD }), sd, pend:{} });
  chequear('El producto queda guardado como nota (no se descarta)',
           /melamina/i.test(JSON.stringify(sd.ses[WA]||{})), JSON.stringify(sd.ses[WA]||{}).slice(0,200));
  correr({ datos: ev({ texto:'Alfonso crismatt' }), sd, pend:{} });
  correr({ datos: ev({ opcion_id:'BARRANQUILLA', opcion_txt:'Barranquilla' }), sd, pend:{} });
  correr({ datos: ev({ opcion_id:'PT_0', opcion_txt:'San Roque' }), sd, pend:{} });
  const r = correr({ datos: ev({ opcion_id:'OCA_FINAL', opcion_txt:'🏠 Cliente final' }), sd, pend:{} });

  const lead = leadDe(r, sd);
  chequear('Se creó el lead', !!lead, 'etapa=' + r.etapa);
  chequear('La SOLICITUD que ve la asesora incluye la melamina',
           !!lead && /melamina/i.test(String(lead.detalle)),
           'detalle=' + (lead ? String(lead.detalle).slice(0,200) : '(sin lead)'));
  chequear('Y no se repite dos veces',
           !lead || (String(lead.detalle).toLowerCase().match(/melamina/g)||[]).length === 1,
           'detalle=' + (lead ? String(lead.detalle).slice(0,200) : ''));
  chequear('El nombre del cliente NO se cuela como solicitud',
           !!lead && !/alfonso crismatt/i.test(String(lead.detalle)),
           'detalle=' + (lead ? String(lead.detalle).slice(0,200) : ''));
  const av = JSON.stringify(r.aviso_body || (sd.pendCierre[WA] && sd.pendCierre[WA].aviso) || '');
  chequear('La tarjeta que se le manda a la asesora también la trae', /melamina/i.test(av), av.slice(0,220));
}

// ══ Guardas ════════════════════════════════════════════════════════════════════
{
  // Sin nota extra, el detalle sigue siendo lo que el cliente escribio (no se inventa nada ni se duplica).
  const sd = base();
  correr({ datos: ev({ texto:'Buenas' }), sd, pend:{} });
  correr({ datos: ev({ texto:'Necesito 20 láminas de MDF de 15mm', ia:IA_PROD }), sd, pend:{} });
  correr({ datos: ev({ opcion_id:'CONSENT_SI', opcion_txt:'✅ Sí, autorizo' }), sd, pend:{} });
  correr({ datos: ev({ opcion_id:'MAR_CARP', opcion_txt:'🟡 Carpincentro' }), sd, pend:{} });
  correr({ datos: ev({ texto:'Pedro Pérez' }), sd, pend:{} });
  correr({ datos: ev({ opcion_id:'BARRANQUILLA', opcion_txt:'Barranquilla' }), sd, pend:{} });
  correr({ datos: ev({ opcion_id:'PT_0', opcion_txt:'San Roque' }), sd, pend:{} });
  const r = correr({ datos: ev({ opcion_id:'OCA_FINAL', opcion_txt:'🏠 Cliente final' }), sd, pend:{} });
  const lead = leadDe(r, sd);
  chequear('GUARDA: el caso normal no cambia', !!lead && /mdf/i.test(String(lead.detalle)),
           'detalle=' + (lead ? String(lead.detalle).slice(0,160) : '(sin lead)'));
  chequear('GUARDA: y no repite el producto',
           !lead || (String(lead.detalle).toLowerCase().match(/mdf/g)||[]).length === 1,
           'detalle=' + (lead ? String(lead.detalle).slice(0,160) : ''));
}

console.log('\n' + ok + '/' + total + ' aserciones OK');
process.exit(ok === total ? 0 : 1);
