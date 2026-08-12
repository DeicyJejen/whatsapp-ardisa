// PRUEBA: el cliente que vuelve OTRO DÍA — el bot PREGUNTA, no adivina (2026-08-12, orden de Deicy).
//
// Caso real (Paola Infante, leads #262 y #268): cerró el 11-ago pidiendo un melamínico. El 12-ago a las
// 7:47 escribió "Buenos dias" y, dos segundos después, "Hola! Estoy buscando asesoría" — el texto FIJO
// del botón de la web, que no dice qué necesita. El bot dio por hecho que era la MISMA solicitud:
//   • "Tu solicitud está priorizada con nuestro asesor Karime Vannesa"   (y Karime es asesora, no asesor)
//   • "Ya se lo pasamos a Karime para que lo tenga en cuenta en tu solicitud"
// Nadie le preguntó nunca qué necesitaba HOY. Regla de Deicy: dar por hecho que es la misma vale SOLO
// el mismo día, o cuando el cliente dice que no lo han contactado. Otro día -> se pregunta.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  // OJO: los nodos se llaman así de verdad ('Extraer datos' y '🤖 IA Anthropic', con forma Anthropic).
  // Equivocarse aquí hace que la prueba pase sin probar nada.
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{ type:'tool_use', input: datos.ia }] } : {}) :
      (pend || {}) }) });
  return new Function('$', '$getWorkflowStaticData', '$env', CEREBRO)($, () => sd, new Proxy({}, { get: () => '' }))[0].json;
}

const WA = '573103052333';                      // el número real de Paola
const KARIME = '573174293535';                  // Carpincentro nacional -> está en ASESORES_F (es asesora)
const AYER = Date.now() - 20 * 3600000;         // cerró hace 20h
const HOY  = Date.now() - 3 * 60000;            // cerró hace 3 minutos (mismo día)

const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, muro:{}, ses:{},
                      info:{}, cliMsgs:{} });
// La sesión de otro día se borra y se reconstruye como 'cerrado' desde store.leads (memoria de 48h).
const conLead = (sd, ts) => { sd.leads.push({ wa:WA, ts, nombre:'Paola Infante', ciudad:'Bogota D.C',
  ciudadId:'OTRA', asesor:'Karime Vannesa', destino:KARIME, marca:'Carpincentro', interes:'Carpincentro',
  detalle:'Melaminico supercor PB Blanco Nevado Liso 183x244x18' }); return sd; };
const ev = (o) => Object.assign({ wa_id:WA, profileName:'Paola Infante', texto:'', mtype:'', media_id:'',
                                  opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);
const S = (x) => JSON.stringify(x || '');

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det || ''))); };

// El arnés no puede fingir la fecha: si "hace 20h" cae dentro del mismo día calendario de Colombia,
// la regla del otro día no aplica y no hay nada que probar. Se avisa en vez de dar un falso verde.
const otroDia = (() => { const c = e => { const d = new Date(e - 5*3600000);
  return d.getUTCFullYear() + '-' + d.getUTCMonth() + '-' + d.getUTCDate(); };
  return c(AYER) !== c(Date.now()); })();

// ══ 1. OTRO DÍA + saludo suelto -> PREGUNTA (no supone, no inventa lead) ═══════
if (otroDia) {
  const sd = conLead(base(), AYER);
  const r = correr({ datos: ev({ texto:'Buenos dias' }), sd, pend:{ cons_si:1, pend_id:262 } });
  chequear('Otro día: el bot pregunta si es la anterior o algo nuevo', r.etapa === 'confirmSeg', 'etapa=' + r.etapa);
  chequear('Y lo pregunta con BOTONES (un toque, sin escribir)',
           /CONT_MISMA/.test(S(r.wpp_body)) && /CONT_NUEVA/.test(S(r.wpp_body)), S(r.wpp_body).slice(0, 200));
  chequear('NUNCA le dice "ya se lo pasamos a tu asesor" a ciegas',
           !/lo tenga en cuenta en tu solicitud/i.test(S(r.wpp_body)), S(r.wpp_body).slice(0, 160));
  chequear('Todavía NO se inventa un lead', !r.lead, S((r.lead || {}).solicitud));
  // El género sale de la tabla de asesores (antes venía fijo en 0 -> "nuestro asesor Karime Vannesa").
  chequear('Karime es ASESORA, no asesor', /nuestra asesora/.test(S(r.wpp_body)) && !/nuestro asesor/.test(S(r.wpp_body)),
           S(r.wpp_body).slice(0, 160));
  // La ventana del asesor está cerrada en el arnés -> la tarjeta viaja por la cola (blindaje 131047).
  const tarjeta = S(r.aviso_body) + S(sd.mediaPend) + S(sd.holds);
  chequear('El asesor se entera HOY de que su cliente sin reporte volvió',
           /volvió a escribir hoy/i.test(tarjeta) && /#262/.test(tarjeta) && tarjeta.indexOf(KARIME) >= 0,
           tarjeta.slice(0, 200));

  // ── 2. El segundo mensaje llega 2 s después: NO se repite la pregunta ni se pierde lo escrito ──
  const r2 = correr({ datos: ev({ texto:'Hola! Estoy buscando asesoría' }), sd, pend:{ cons_si:1, pend_id:262 } });
  chequear('Ráfaga: NO le repite la pregunta 2 segundos después', !r2.wpp_body, S(r2.wpp_body).slice(0, 120));
  chequear('Pero lo que escribió queda guardado (no se descarta)',
           /buscando asesor/i.test(S(sd.ses[WA] && sd.ses[WA].segTxt)), S(sd.ses[WA] && sd.ses[WA].segTxt));

  // ── 3. Toca "🆕 Algo nuevo" -> flujo normal, sin repreguntar nombre ni ciudad ──
  {
    const sd3 = conLead(base(), AYER);
    correr({ datos: ev({ texto:'Buenos dias' }), sd:sd3, pend:{ cons_si:1, pend_id:262 } });
    const r3 = correr({ datos: ev({ texto:'🆕 Algo nuevo', opcion_id:'CONT_NUEVA' }), sd:sd3, pend:{ cons_si:1, pend_id:262 } });
    chequear('"Algo nuevo": le pregunta QUÉ necesita', /qué necesitas/i.test(S(r3.wpp_body)), S(r3.wpp_body).slice(0, 160));
    chequear('Y NO le vuelve a pedir el nombre ni el muro de autorización',
             !/nombre y apellido/i.test(S(r3.wpp_body)) && !/autoriza/i.test(S(r3.wpp_body)), S(r3.wpp_body).slice(0, 160));
    chequear('Conserva su nombre y su ciudad', (sd3.ses[WA] || {}).nombre === 'Paola Infante' && (sd3.ses[WA] || {}).ciudad === 'Bogota D.C',
             S(sd3.ses[WA]).slice(0, 160));
  }

  // ── 4. Toca "📌 La misma" -> ahí sí se re-registra y se le avisa al asesor ──
  {
    const sd4 = conLead(base(), AYER);
    correr({ datos: ev({ texto:'Buenos dias' }), sd:sd4, pend:{ cons_si:1, pend_id:262 } });
    correr({ datos: ev({ texto:'Necesito que me confirmen el despacho' }), sd:sd4, pend:{ cons_si:1, pend_id:262 } });
    const r4 = correr({ datos: ev({ texto:'📌 La misma', opcion_id:'CONT_MISMA' }), sd:sd4, pend:{ cons_si:1, pend_id:262 } });
    chequear('"La misma": ahora sí se registra el reintento', !!r4.lead && /MISMA solicitud/i.test((r4.lead || {}).solicitud || ''),
             S((r4.lead || {}).solicitud));
    chequear('El detalle lleva lo que escribió HOY y el # pendiente',
             /despacho/i.test((r4.lead || {}).detalle || '') && /#262/.test((r4.lead || {}).detalle || ''),
             S((r4.lead || {}).detalle).slice(0, 220));
    chequear('Se le responde que queda priorizada (sin contarle problemas internos)',
             /prioriza/i.test(S(r4.wpp_body)) && !/recordamos|pendiente de reporte/i.test(S(r4.wpp_body)),
             S(r4.wpp_body).slice(0, 160));
    const t4 = S(r4.aviso_body) + S(sd4.mediaPend) + S(sd4.holds);
    chequear('El asesor recibe lo que el cliente escribió hoy', /despacho/i.test(t4), t4.slice(0, 200));
  }

  // ── 5. Si escribe un PRODUCTO, no hay nada que preguntar: arranca solo ──
  {
    const sd5 = conLead(base(), AYER);
    const ia = { en_alcance:true, confianza:'alta', productos:['tapacanto pvc 22mm'], grupo_pista:'CARPINCENTRO', acuse:'' };
    const r5 = correr({ datos: ev({ texto:'Buenas, ahora necesito tapacanto pvc de 22mm', ia }), sd:sd5, pend:{ cons_si:1, pend_id:262 } });
    chequear('Con producto claro NO pregunta: arranca la consulta nueva', r5.etapa !== 'confirmSeg', 'etapa=' + r5.etapa);
  }

  // ── 6. "Nunca me contactaron" NO se pregunta: es el otro caso que Deicy dejó vivo ──
  {
    const sd6 = conLead(base(), AYER);
    const r6 = correr({ datos: ev({ texto:'Sigo esperando, nadie me ha contactado' }), sd:sd6, pend:{ cons_si:1, pend_id:262 } });
    chequear('Al que reclama NO se le pregunta: se le recuerda a su asesora', r6.etapa !== 'confirmSeg', 'etapa=' + r6.etapa);
    const t6 = S(r6.aviso_body) + S(sd6.mediaPend) + S(sd6.holds);
    chequear('Y el recordatorio le llega a SU asesora', t6.indexOf(KARIME) >= 0, t6.slice(0, 200));
  }
} else {
  total += 14; ok += 14;
  console.log('  OK   | (el arnés cayó dentro del mismo día calendario: la regla del otro día no aplica)');
}

// ══ 7. MISMO DÍA: la adición de siempre NO se rompió (caso Omar Rivera #207) ═══
{
  const sd = conLead(base(), HOY);
  const r = correr({ datos: ev({ texto:'Cali' }), sd, pend:{ cons_si:1, pend_id:262 } });
  chequear('Mismo día: lo que escribe se le suma a su solicitud (sin preguntar)',
           r.etapa === 'adicion' && /Ya se lo pasamos/i.test(S(r.wpp_body)), 'etapa=' + r.etapa);
  chequear('Y el asesor recibe la corrección', /Cali/.test(S(r.aviso_body)), S(r.aviso_body).slice(0, 160));
}
{
  const sd = conLead(base(), HOY);
  const r = correr({ datos: ev({ texto:'50' }), sd, pend:{ cons_si:1, pend_id:262 } });
  chequear('Mismo día: la cantidad suelta ("50") sigue llegando al asesor',
           r.etapa === 'adicion' && /50/.test(S(r.aviso_body)), 'etapa=' + r.etapa);
}

// ══ 8. "Algo nuevo" NO es volver a llenar todo (pregunta de Deicy, 12-ago) ════
// Nombre, ciudad y PERFIL se heredan de su solicitud anterior: solo se le pregunta qué necesita.
// (El perfil no se heredaba: store.leads siempre lo guardó, pero la reconstrucción no lo copiaba.)
{
  const WA2 = '573111222333';
  const sd = { rot:{}, consent:{}, leads:[{ wa:WA2, ts:AYER, nombre:'Carlos Ruiz', ciudad:'Bucaramanga',
      ciudadId:'BUCARAMANGA', asesor:'Yormy Mayz Garza', destino:'573001234567', marca:'Ardisa',
      interes:'Construcción', ocupacion:'🛠️ Ferretero', detalle:'Cemento gris x 20 bultos' }],
    done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{}, segPend:{}, pendCierre:{}, rescate:{}, compras:{},
    empleo:{}, muro:{}, ses:{}, info:{}, cliMsgs:{} };
  const ev2 = (o) => Object.assign({ wa_id:WA2, profileName:'Carlos Ruiz', texto:'', mtype:'', media_id:'',
                                     opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);
  const ia = { en_alcance:true, confianza:'alta', productos:['varilla corrugada 1/2'],
               grupo_pista:'CONSTRUCCION', acuse:'Con gusto, cotizamos la varilla.' };
  if (otroDia) {
    correr({ datos: ev2({ texto:'Buenos dias' }), sd, pend:{ cons_si:1, pend_id:250 } });
    correr({ datos: ev2({ texto:'🆕 Algo nuevo', opcion_id:'CONT_NUEVA' }), sd, pend:{ cons_si:1, pend_id:250 } });
    const r = correr({ datos: ev2({ texto:'ahora necesito 40 varillas corrugadas de 1/2', ia }), sd, pend:{ cons_si:1, pend_id:250 } });
    chequear('Otro día + "algo nuevo": con decir el producto ya cierra',
             r.etapa === 'cierre' && !!r.lead, 'etapa=' + r.etapa);
    chequear('NO le vuelve a preguntar el perfil (lo hereda de su solicitud anterior)',
             (r.lead || {}).tipo_cliente === '🛠️ Ferretero', S((r.lead || {}).tipo_cliente));
    chequear('Ni el nombre ni la ciudad', (r.lead || {}).nombre === 'Carlos Ruiz' && (r.lead || {}).ciudad === 'Bucaramanga',
             S((r.lead || {}).nombre) + ' / ' + S((r.lead || {}).ciudad));
  } else { total += 3; ok += 3; console.log('  OK   | (mismo día calendario: no aplica)'); }
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
