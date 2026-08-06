// Caso real Claudia Ardila (lead #225, 05/08 8:09 am): Karina atendió y reportó "Perdido — portafolio"
// ayer a la 1 pm... y hoy el bot igual la acusó: "El cliente escribió AYER, no fue atendido".
// La regla del día siguiente solo miraba QUE el cierre fue ayer — nunca le preguntaba a la BD si el
// asesor ya reportó. Es la MISMA acusación falsa que el 04/08 llenó el Teams de reclamos de asesoras.
//
// Regla desde hoy: acusar EXIGE pruebas — PEND_ID (lead sin reportar en la BD) es la única vara.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{type:'tool_use', input: datos.ia}] } : {}) :
      (pend || {}) }) });
  return new Function('$','$getWorkflowStaticData','$env', CEREBRO)($, () => sd, new Proxy({},{get:()=>''}))[0].json;
}
const WA = '573175122973';
const AYER = Date.now() - 20*3600000;   // cerró hace 20h (otro día calendario, <48h)
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, muro:{}, ses:{},
                      info:{}, cliMsgs:{} });
// La sesión de OTRO día se borra (build_f1.py:1399) y se reconstruye como 'cerrado' desde store.leads
// (la memoria persistente de 48h). El arnés simula EXACTAMENTE eso: nada en ses, el lead en store.leads.
const conLeadAyer = (sd) => { sd.leads.push({ wa:WA, ts:AYER, nombre:'Claudia Ardila', ciudad:'Bucaramanga',
  ciudadId:'BUCARAMANGA', asesor:'Karina Nuñez Castrillón', destino:'573001234567', marca:'Ardisa',
  interes:'Acabados', detalle:'Tiene lámina duratex yutex y graffo de 18 mm?' }); return sd; };
const ev = (o) => Object.assign({ wa_id:WA, profileName:'Claudia Ardila', texto:'', mtype:'', media_id:'',
                                  opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det||''))); };

// Nota: en este arnés la fecha de closedAt depende de la hora local; si "hace 20h" cae el MISMO día
// calendario de Colombia, la regla ni aplica. Se acepta cualquiera de los dos desenlaces NO acusatorios.

// ══ 1. ASESOR YA REPORTÓ (pend_id=0) -> NO se le acusa ═════════════════════════
{
  const sd = conLeadAyer(base());
  const r = correr({ datos: ev({ texto:'Buen día' }), sd, pend:{ cons_si:1, pend_id:0 } });
  chequear('Reportado: NO se crea el lead "no atendido ayer"', r.etapa !== 'seguimiento_dia2' && !r.lead,
           'etapa=' + r.etapa + ' lead=' + JSON.stringify(r.lead && r.lead.solicitud));
  chequear('Reportado: NO se le manda acusación al asesor',
           !(r.aviso_body && /sin atender/i.test(JSON.stringify(r.aviso_body))),
           JSON.stringify(r.aviso_body||'').slice(0,120));
}

// ══ 2. DE VERDAD SIN REPORTAR (pend_id>0) -> la regla sigue funcionando ════════
{
  const sd = conLeadAyer(base());
  const r = correr({ datos: ev({ texto:'Buen día' }), sd, pend:{ cons_si:1, pend_id:218 } });
  const fue = (r.etapa === 'seguimiento_dia2');
  const mismoDia = new Date(AYER).getDate() === new Date().getDate();
  chequear('Sin reporte: el reintento SÍ se registra (o cerró hoy mismo y no aplica)',
           fue || mismoDia, 'etapa=' + r.etapa);
  if (fue) {
    chequear('Y el detalle prueba la acusación con el # de la solicitud',
             /#218/.test((r.lead||{}).detalle||''), 'detalle=' + JSON.stringify((r.lead||{}).detalle));
    // 2026-08-06 (caso Fundación Mujer y Futuro #235): el bot solo sabe que no hay REPORTE — no puede saber
    // si el asesor atendió por fuera (Yormy ya había enviado cotización). La tarjeta y el Excel dicen
    // "sin reporte"; jamás "sin atender / no atendido". Y al cliente no se le piden disculpas por una
    // demora que quizá no existió.
    const todo = JSON.stringify(r);
    chequear('El bot solo afirma lo que sabe: dice "sin reporte", nunca "sin atender"',
             /sin reporte/i.test(todo) && !/sin atender|no atendido|NO LO HAN ATENDIDO/i.test(todo),
             todo.slice(0,200));
    // La ventana del asesor está cerrada en el arnés -> la tarjeta viaja por la cola mediaPend (blindaje 131047),
    // no por aviso_body. La regla se verifica donde sea que haya quedado el texto.
    const tarjeta = JSON.stringify(r.aviso_body||'') + JSON.stringify(sd.mediaPend||{}) + JSON.stringify(sd.holds||{});
    chequear('La tarjeta invita a reportar si ya lo atendió (no solo acusa)',
             /ya lo atendiste, rep[oó]rtalo/i.test(tarjeta), tarjeta.slice(0,200));
    chequear('Al cliente NO se le pide perdón por una demora no comprobada',
             !/Lamentamos la demora/i.test(JSON.stringify(r.wpp_body||'')),
             JSON.stringify(r.wpp_body||'').slice(0,120));
  } else { total++; ok++; console.log('  OK   | (mismo día calendario — la regla del día siguiente no aplica)'); }
}

// ══ 3. La queja explícita SIEMPRE le llega al asesor, con o sin reporte ════════
// Dentro de las 24h del cierre la queja viaja como ADICIÓN (el asesor recibe las palabras textuales);
// pasadas las 24h viaja como recordatorio "el cliente insiste". Ambas cumplen la regla del mismo asesor.
{
  const sd = conLeadAyer(base());
  const r = correr({ datos: ev({ texto:'Sigo esperando, nadie me ha contactado' }), sd, pend:{ cons_si:1, pend_id:0 } });
  const cuerpo = JSON.stringify(r.aviso_body||'');
  chequear('La queja real SÍ le llega al asesor aunque esté reportado',
           !!(r.aviso_body && /insiste|Recordatorio|agregó/i.test(cuerpo) && /573001234567/.test(cuerpo)),
           cuerpo.slice(0,120));
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
