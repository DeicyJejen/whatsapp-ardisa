// PRUEBA: los dos chats que estallaron el 19-ago por la tarde (casos Edilberto #335 y "Mdf Rh" #334).
//
// EDILBERTO: escribió "Acapulco, Girón" donde había menú de ciudades -> el bot le repitió el menú, tocó
// "Otra ciudad" y tuvo que escribir LO MISMO otra vez -> explotó ("Usted es una puta máquina. Necesito
// una persona") y esa frase viajó al asesor como su solicitud, junto con "Ardisa · Otra ciudad".
// MDF: escribió "MDF RH crudo 18 mm tienen?" donde se le pedía el nombre -> quedó registrado como
// "Mdf Rh"; su nombre real ("Jhon Pardo") llegó un paso después y se descartó.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{ type:'tool_use', input: datos.ia }] } : {}) :
      (pend || {}) }) });
  return new Function('$', '$getWorkflowStaticData', '$env', CEREBRO)($, () => sd, new Proxy({}, { get: () => '' }))[0].json;
}
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, muro:{}, ses:{},
                      info:{}, cliMsgs:{}, prov:{}, esCli:{}, win:{}, mediaPend:{} });
const S = (x) => JSON.stringify(x || '');
const body = (r) => (r.wpp_body && (r.wpp_body.text ? r.wpp_body.text.body
                    : (r.wpp_body.interactive && r.wpp_body.interactive.body && r.wpp_body.interactive.body.text))) || '';
let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det || ''))); };

// ══ CASO EDILBERTO ═════════════════════════════════════════════════════════════
{
  const WA = '573183863422';
  const ev = (o) => Object.assign({ wa_id:WA, profileName:'Edilberto', texto:'', mtype:'', media_id:'',
                                    opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);
  const sd = base();
  correr({ datos: ev({ texto:'Hola' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'Ardisa' }), sd, pend:{ cons_si:1 } });   // escribió la marca a mano
  correr({ datos: ev({ texto:'Edilberto Prieto' }), sd, pend:{ cons_si:1 } });
  const r = correr({ datos: ev({ texto:'Acapulco, Girón' }), sd, pend:{ cons_si:1 } });
  chequear('"Acapulco, Girón" se acepta como ciudad (Girón es conocida): NO se repite el menú',
           !/selecciona tu \*?ciudad/i.test(body(r)), body(r).slice(0,90));
  chequear('La ciudad queda guardada', /acapulco|gir[oó]n/i.test((sd.ses[WA]||{}).ciudad || ''),
           'ciudad=' + S((sd.ses[WA]||{}).ciudad));
  // se enoja y pide una persona
  const r2 = correr({ datos: ev({ texto:'Usted es una puta máquina. Necesito una persona.' }), sd, pend:{ cons_si:1 } });
  const lead = sd.leads.filter(l => l.wa === WA).slice(-1)[0];
  chequear('Pedir una persona cierra y le asigna asesor', !!lead, 'etapa=' + r2.etapa);
  chequear('Y la grosería NO viaja al asesor como su solicitud',
           !!lead && !/puta|m[aá]quina/i.test(lead.detalle || ''), 'detalle=' + S(lead && lead.detalle));
  chequear('Ni las etiquetas del menú ("Ardisa", "Otra ciudad")',
           !!lead && !/^ardisa|otra ciudad/i.test(lead.detalle || ''), 'detalle=' + S(lead && lead.detalle));
}

// ══ CASO MDF / JHON PARDO ══════════════════════════════════════════════════════
{
  const WA = '50766147119';
  const ev = (o) => Object.assign({ wa_id:WA, profileName:'', texto:'', mtype:'', media_id:'',
                                    opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);
  const sd = base();
  correr({ datos: ev({ texto:'Hola! Estoy buscando asesoría' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'🟡 Carpincentro', opcion_id:'MAR_CARP' }), sd, pend:{ cons_si:1 } });
  const r1 = correr({ datos: ev({ texto:'MDF RH crudo 18 mm tienen?' }), sd, pend:{ cons_si:1 } });
  chequear('"MDF RH crudo 18 mm" NO se acepta como nombre', !/mdf/i.test((sd.ses[WA]||{}).nombre || ''),
           'nombre=' + S((sd.ses[WA]||{}).nombre));
  correr({ datos: ev({ texto:'Jhon Pardo' }), sd, pend:{ cons_si:1 } });
  chequear('Su nombre real, aunque llegue después, queda', /jhon pardo/i.test((sd.ses[WA]||{}).nombre || ''),
           'nombre=' + S((sd.ses[WA]||{}).nombre));
  correr({ datos: ev({ texto:'Bogotá' }), sd, pend:{ cons_si:1 } });
  correr({ datos: ev({ texto:'PT_2', opcion_id:'PT_2' }), sd, pend:{ cons_si:1 } });
  const r2 = correr({ datos: ev({ texto:'🪑 Industrial del mueble', opcion_id:'OCA_IND' }), sd, pend:{ cons_si:1 } });
  const lead = sd.leads.filter(l => l.wa === WA).slice(-1)[0];
  chequear('El lead cierra con su nombre y su producto',
           !!lead && /jhon pardo/i.test(lead.nombre || '') && /mdf rh/i.test(lead.detalle || ''),
           'nombre=' + S(lead && lead.nombre) + ' detalle=' + S(lead && lead.detalle).slice(0,80));
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
