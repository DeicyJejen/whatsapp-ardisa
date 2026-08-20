// PRUEBA: la ADICIÓN del cliente queda en la BD, no solo en un mensajito de WhatsApp (20-ago-2026).
//
// Caso real (cola de Karime): Juan Pablo #332 cerró con "melamina de 5mm y MDF Avellana" y minutos después
// agregó "el material es para elaborar 5 puertas de 2,10 x 0.80". Esa adición viajaba SOLO como texto de
// WhatsApp a la asesora — su ventana de 24h estaba cerrada, el texto se encoló, y como Karime no usa el
// canal, las medidas murieron en la cola (41 horas). La BD no tiene ventana: ahora la adición se suma
// también al DETALLE del lead y el Excel/panel siempre la muestran.
// Además: la limpieza de textos viejos en la cola era todo-o-nada ("TODOS >=24h") y un texto nuevo
// mantenía vivos a los viejos para siempre. Ahora es por ítem.
const fs = require('fs');
const CEREBRO   = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');
const FINALIZAR = fs.readFileSync(__dirname + '/n_finalizar.js', 'utf8');
const INACTIVOS = fs.readFileSync(__dirname + '/n_inactivos.js', 'utf8');

let ok = 0, total = 0;
const S = (x) => JSON.stringify(x || '');
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det || ''))); };

// ══ 1. CEREBRO: la adición tras cerrar sale con `sumar_add` (rumbo al UPDATE de la BD) ══
{
  const WA = '573170000001', KARIME = '573174293535';
  const correr = ({ datos, sd, pend }) => {
    const $ = (n) => ({ first: () => ({ json:
        n === 'Extraer datos'   ? datos :
        n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{ type:'tool_use', input: datos.ia }] } : {}) :
        (pend || {}) }) });
    return new Function('$', '$getWorkflowStaticData', '$env', CEREBRO)($, () => sd, new Proxy({}, { get: () => '' }))[0].json;
  };
  const ev = (o) => Object.assign({ wa_id:WA, profileName:'Cliente', texto:'', mtype:'', media_id:'',
                                    opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);
  const sd = { rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
               segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, muro:{}, ses:{},
               info:{}, cliMsgs:{}, prov:{}, esCli:{} };
  sd.ses[WA] = { paso:'cerrado', closedAt:Date.now()-40*60000, t:Date.now()-40*60000,
                 nombre:'Juan Pablo', marca:'Carpincentro', destino:KARIME, asesorNom:'Karime Vannesa', asesorF:true };
  const r = correr({ datos: ev({ texto:'el material es para elaborar 5 puertas de 2,10 x 0.80' }), sd, pend:{ cons_si:1, PEND_ID:332 } });
  chequear('La adición se reconoce (etapa adicion)', r.etapa === 'adicion', 'etapa=' + r.etapa);
  chequear('Y sale con sumar_add para el UPDATE del lead en la BD',
           /5 puertas de 2,10/.test(r.sumar_add || ''), 'sumar_add=' + S(r.sumar_add));

  const r2 = correr({ datos: ev({ texto:'gracias' }), sd, pend:{ cons_si:1, PEND_ID:332 } });
  chequear('Un "gracias" suelto NO ensucia el detalle del lead', !r2.sumar_add, 'sumar_add=' + S(r2.sumar_add));
}

// ══ 2. FINALIZADOR: el "también escribió" de la retención entra al detalle ANTES del INSERT ══
{
  const WA = '573170000002', NATALIA = '573107577394';
  const correr = (json, sd) => {
    const $ = (n) => ({ first: () => ({ json: json }) });
    return new Function('$json','$getWorkflowStaticData','$', FINALIZAR)(json, () => sd, $)[0].json;
  };
  const paquete = (extra) => Object.assign({ token:1785933555455, t:Date.now()-30000, destino:NATALIA,
    aviso:{ messaging_product:'whatsapp', to:NATALIA, type:'text', text:{ body:'🔔 Nuevo cliente\n📝 Solicitud: melamina 5mm' } },
    avisoTpl:null, avisoCopia:null, copiaTo:null, avisoExtra:'', segPrompt:null, medias:[],
    lead:{ telefono:WA, nombre:'Juan Pablo', detalle:'melamina 5mm', asesor:'Natalia',
           asesor_tel:NATALIA, modo_prueba:0 }, fuera:false, sendAfter:0, marca:'Carpincentro' }, extra||{});
  const sd = { pendCierre:{}, medias:{}, cliMsgs:{}, segPend:{}, win:{}, mediaPend:{}, holdAviso:[] };
  sd.pendCierre[WA] = paquete({ avisoExtra:'para elaborar 5 puertas de 2,10 x 0.80' });
  const r = correr({ wa_id:WA, pend_token:1785933555455, bd_id:0, bd_detalle:'', bd_asesor:'', bd_asesor_tel:'' }, sd);
  chequear('El lead que va a la BD lleva la adición en el detalle',
           /melamina 5mm/.test((r.lead||{}).detalle||'') && /5 puertas de 2,10/.test((r.lead||{}).detalle||''),
           'detalle=' + S((r.lead||{}).detalle));

  // fuera de horario: el lead retenido también va completo
  const sd2 = { pendCierre:{}, medias:{}, cliMsgs:{}, segPend:{}, win:{}, mediaPend:{}, holdAviso:[] };
  sd2.pendCierre[WA] = paquete({ avisoExtra:'con tapacanto blanco', fuera:true, sendAfter:Date.now()+3600000 });
  const r2 = correr({ wa_id:WA, pend_token:1785933555455, bd_id:0, bd_detalle:'', bd_asesor:'', bd_asesor_tel:'' }, sd2);
  chequear('Fuera de horario (hold) el lead también va completo',
           r2.fin === 'hold' && /tapacanto blanco/.test((r2.lead||{}).detalle||''),
           'fin=' + r2.fin + ' detalle=' + S((r2.lead||{}).detalle));
}

// ══ 3. CRON: los textos viejos de la cola se limpian POR ÍTEM (no todo-o-nada) ══
{
  const ASE = '573000000009';
  const sd = { ses:{}, done:{}, win:{}, mediaPend:{}, mediaNudge:{}, segPend:{}, segRemDay:{},
               pendCierre:{}, holdAviso:[], leads:[], rescate:{}, migSeg2407b:1 };
  const NOW = Date.now();
  const txt = (t, quien, cuerpo) => ({ m:{ messaging_product:'whatsapp', to:ASE, type:'text',
    text:{ body:'➕ *El cliente '+quien+' también escribió:* '+cuerpo } }, cliente:quien, t:t });
  // el caso Karime: textos de hace 41h y 30h + uno fresco de hace 2h — antes NINGUNO se limpiaba
  sd.mediaPend[ASE] = [ txt(NOW-41*3600000,'Laura','Hola'), txt(NOW-30*3600000,'Gennifer','DURATEX'),
                        txt(NOW-2*3600000,'Luis','Despiece') ];
  new Function('$', '$getWorkflowStaticData', '$env', INACTIVOS)(
    () => ({ first: () => ({ json: {} }) }), () => sd, new Proxy({}, { get: () => '' }));
  const q = sd.mediaPend[ASE] || [];
  chequear('Los textos que cumplieron 24h se limpian aunque haya uno fresco',
           q.length === 1 && q[0].cliente === 'Luis', S(q.map(x => x.cliente)));

  // un texto que acompaña a una FOTO pendiente NO se toca (la cola mixta espera junta)
  const sd2 = { ses:{}, done:{}, win:{}, mediaPend:{}, mediaNudge:{}, segPend:{}, segRemDay:{},
                pendCierre:{}, holdAviso:[], leads:[], rescate:{}, migSeg2407b:1 };
  sd2.mediaPend[ASE] = [ { m:{ messaging_product:'whatsapp', to:ASE, type:'image', image:{id:'9990001'} }, cliente:'Pedro', t:NOW-30*3600000 },
                         { m:{ messaging_product:'whatsapp', to:ASE, type:'text', text:{body:'nota de Pedro'} }, cliente:'Pedro', t:NOW-30*3600000 } ];
  new Function('$', '$getWorkflowStaticData', '$env', INACTIVOS)(
    () => ({ first: () => ({ json: {} }) }), () => sd2, new Proxy({}, { get: () => '' }));
  chequear('La cola mixta (foto + su nota) NO se limpia: espera junta',
           (sd2.mediaPend[ASE] || []).length === 2, S((sd2.mediaPend[ASE]||[]).map(x => x.m.type)));
}

// ══ 4. EL WORKFLOW tiene el nodo nuevo y el Cerebro lo alimenta ══
{
  const w = JSON.parse(fs.readFileSync(__dirname + '/../workflow-bot-f1.json', 'utf8'));
  const nombres = w.nodes.map(n => n.name);
  chequear('Existen "¿Sumar a la solicitud?" y "Sumar adición (MySQL)"',
           nombres.indexOf('¿Sumar a la solicitud?') >= 0 && nombres.indexOf('Sumar adición (MySQL)') >= 0, S(nombres.slice(-8)));
  const fanout = ((w.connections['Cerebro conversacional']||{}).main||[[]])[0].map(c => c.node);
  chequear('El Cerebro alimenta el IF de la adición', fanout.indexOf('¿Sumar a la solicitud?') >= 0, S(fanout));
  const nodo = w.nodes.filter(n => n.name === 'Sumar adición (MySQL)')[0] || { parameters:{} };
  const sql = String(nodo.parameters.query || '');
  chequear('El UPDATE compara el teléfono como TEXTO (regla BSUID) y no duplica (LOCATE)',
           /CONVERT\(\$2 USING utf8mb4\)/.test(sql) && /LOCATE\(/.test(sql), sql);
}

console.log('\n' + ok + '/' + total + ' aserciones');
process.exit(ok === total ? 0 : 1);
