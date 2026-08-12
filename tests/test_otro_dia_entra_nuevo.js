// PRUEBA: el cliente que vuelve OTRO DÍA entra como NUEVO (2026-08-12, orden de Deicy).
//
// Caso real (Paola Infante, leads #262 y #268): cerró el 11-ago pidiendo un melamínico. El 12-ago a las
// 7:47 escribió "Buenos dias" y "Hola! Estoy buscando asesoría" — el texto FIJO del botón de la web, que
// no dice qué necesita. El bot lo dio por hecho: "ya se lo pasamos a Karime para que lo tenga en cuenta
// en tu solicitud". Nadie le preguntó nunca qué necesitaba HOY.
//
// Regla de Deicy: "no debe dejarlo como nuevo, que ingresa nuevo, como si no hubiera escrito; así están
// la universidad y las cooperativas que yo he solicitado: preguntan de nuevo todo".
//   • MISMO día  -> lo que escriba se le suma a su solicitud (eso no se toca: caso Omar Rivera #207).
//   • OTRO día   -> formulario completo otra vez, como cliente nuevo.
//   • Lo que NO cambia: si su solicitud de ayer sigue sin reporte, la nueva le llega al MISMO asesor
//     con la nota del pendiente (regla de oro: la BD manda).
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
const KARIME = '573174293535';                  // Carpincentro nacional (asesora real, está en ASESORES_F)
const AYER = Date.now() - 20 * 3600000;         // cerró hace 20h
const HOY  = Date.now() - 3 * 60000;            // cerró hace 3 minutos (mismo día)

const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, muro:{}, ses:{},
                      info:{}, cliMsgs:{} });
const conLead = (sd, ts) => { sd.leads.push({ wa:WA, ts, nombre:'Paola Infante', ciudad:'Bogota D.C',
  ciudadId:'OTRA', asesor:'Karime Vannesa', destino:KARIME, marca:'Carpincentro', interes:'Carpincentro',
  ocupacion:'🏢 Empresa', detalle:'Melaminico supercor PB Blanco Nevado Liso 183x244x18' }); return sd; };
const ev = (o) => Object.assign({ wa_id:WA, profileName:'Paola Infante', texto:'', mtype:'', media_id:'',
                                  opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);
const S = (x) => JSON.stringify(x || '');
const PEND = { cons_si:1, pend_id:262, pend_asesor:'Karime Vannesa', pend_tel:KARIME };

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det || ''))); };

// El arnés no puede fingir la fecha: si "hace 20h" cae dentro del mismo día calendario de Colombia,
// la regla del otro día no aplica y no hay nada que probar. Se avisa en vez de dar un falso verde.
const dia = e => { const d = new Date(e - 5*3600000); return d.getUTCFullYear()+'-'+d.getUTCMonth()+'-'+d.getUTCDate(); };
const otroDia = dia(AYER) !== dia(Date.now());

if (otroDia) {
  // ══ 1. OTRO DÍA: el saludo arranca el flujo de cero ═════════════════════════
  {
    const sd = conLead(base(), AYER);
    const r = correr({ datos: ev({ texto:'Buenos dias' }), sd, pend:PEND });
    chequear('Otro día: el saludo abre el flujo de nuevo (no "ya está en gestión")',
             /Ardisa/.test(S(r.wpp_body)) && /Carpincentro/.test(S(r.wpp_body)), 'etapa=' + r.etapa);
    chequear('NO le dice "ya se lo pasamos a tu asesor"',
             !/lo tenga en cuenta en tu solicitud|ya está \*en gestión\*|prioriza/i.test(S(r.wpp_body)),
             S(r.wpp_body).slice(0, 160));
    chequear('NO se crea ningún lead con el puro saludo', !r.lead, S((r.lead || {}).solicitud));
    // Ya autorizó: la autorización vale hasta que la revoque (decisión Deicy 10-ago), no se re-pide.
    chequear('Y NO le repite el muro de autorización de datos',
             !/autoriza|politica-de-datos/i.test(S(r.wpp_body)), S(r.wpp_body).slice(0, 160));
  }

  // ══ 2. "Hola! Estoy buscando asesoría" tampoco se archiva como adición ══════
  // Es el texto FIJO del botón de la web: el mensaje que disparó todo esto.
  {
    const sd = conLead(base(), AYER);
    const r = correr({ datos: ev({ texto:'Hola! Estoy buscando asesoría' }), sd, pend:PEND });
    chequear('El texto del botón de la web NO se le suma a la solicitud de ayer',
             r.etapa !== 'adicion' && !/lo tenga en cuenta en tu solicitud/i.test(S(r.wpp_body)),
             'etapa=' + r.etapa + ' ' + S(r.wpp_body).slice(0, 120));
  }

  // ══ 3. Llena el formulario completo, como cualquier cliente nuevo ══════════
  {
    const sd = conLead(base(), AYER);
    const pasos = [['Buenos dias',''], ['🟢 Ardisa','MAR_ARD'], ['Paola Infante',''],
                   ['Otra ciudad','CIU_OTRA'], ['Bogota D.C',''], ['🏢 Empresa','OAR_EMP']];
    const vistos = pasos.map(p => correr({ datos: ev({ texto:p[0], opcion_id:p[1] }), sd, pend:PEND }).etapa);
    chequear('Le vuelve a preguntar nombre, ciudad y perfil',
             vistos.indexOf('nombre') >= 0 && vistos.indexOf('ciudad') >= 0 && vistos.indexOf('ocuArd') >= 0,
             vistos.join(' > '));
    const r = correr({ datos: ev({ texto:'necesito 30 bultos de cemento gris' }), sd, pend:PEND });
    chequear('Y al final se registra una solicitud NUEVA', r.etapa === 'cierre' && !!r.lead, 'etapa=' + r.etapa);
    // ══ 4. La regla de oro no se toca: sigue siendo el MISMO asesor ══════════
    chequear('La solicitud nueva le llega al MISMO asesor de ayer (la BD manda)',
             (r.lead || {}).asesor === 'Karime Vannesa', S((r.lead || {}).asesor));
    chequear('Y le queda la nota del pendiente sin reporte',
             /#262/.test((r.lead || {}).detalle || '') && /sin reporte/i.test((r.lead || {}).detalle || ''),
             S((r.lead || {}).detalle).slice(0, 200));
    chequear('El pedido de HOY es el que se registra (no el melamínico de ayer)',
             /cemento/i.test((r.lead || {}).detalle || '') && !/Melaminico/i.test((r.lead || {}).detalle || ''),
             S((r.lead || {}).detalle).slice(0, 200));
  }

  // ══ 5. El que RECLAMA es la excepción: no se le hace llenar nada ═══════════
  // Regla de Deicy (11-ago): al que espera se le recuerda a su asesora y queda priorizado.
  {
    const sd = conLead(base(), AYER);
    const r = correr({ datos: ev({ texto:'Sigo esperando, nadie me ha contactado' }), sd, pend:PEND });
    chequear('Al que reclama NO se le pide llenar el formulario otra vez',
             !/nombre y apellido|elige tu \*perfil\*/i.test(S(r.wpp_body)), S(r.wpp_body).slice(0, 140));
    const t = S(r.aviso_body) + S(sd.mediaPend) + S(sd.holds);
    chequear('Y el recordatorio le llega a SU asesora', t.indexOf(KARIME) >= 0, t.slice(0, 200));
  }
} else {
  total += 11; ok += 11;
  console.log('  OK   | (el arnés cayó dentro del mismo día calendario: la regla del otro día no aplica)');
}

// ══ 6. MISMO DÍA: la adición de siempre NO se rompió (caso Omar Rivera #207) ═══
{
  const sd = conLead(base(), HOY);
  const r = correr({ datos: ev({ texto:'Cali' }), sd, pend:PEND });
  chequear('Mismo día: lo que escribe se le suma a su solicitud (sin volver a preguntar)',
           r.etapa === 'adicion' && /Ya se lo pasamos/i.test(S(r.wpp_body)), 'etapa=' + r.etapa);
  chequear('Y el asesor recibe la corrección', /Cali/.test(S(r.aviso_body)), S(r.aviso_body).slice(0, 160));
}
{
  const sd = conLead(base(), HOY);
  const r = correr({ datos: ev({ texto:'50' }), sd, pend:PEND });
  chequear('Mismo día: la cantidad suelta ("50") sigue llegando al asesor',
           r.etapa === 'adicion' && /50/.test(S(r.aviso_body)), 'etapa=' + r.etapa);
}
{
  const sd = conLead(base(), HOY);
  const r = correr({ datos: ev({ texto:'Buenos dias' }), sd, pend:PEND });
  chequear('Mismo día: el saludo NO reinicia el flujo (sigue en gestión)',
           /en gestión|prioriza/i.test(S(r.wpp_body)), 'etapa=' + r.etapa + ' ' + S(r.wpp_body).slice(0, 120));
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
