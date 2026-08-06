// Decisión de Deicy (06/08, tras los casos Kiara #230 y Fundación Mujer y Futuro #235): se eliminan las
// tarjetas de alarma (🚨 URGENTE / ⚠️ REINTENTO) — cada acusación falsa era un reclamo de asesores.
// "Mejor que llegue la solicitud como nueva, sin ese mensaje."
//
// Regla vigente: mismo asesor SIEMPRE (la regla de oro no cambia); TODO cliente que vuelve llega como
// solicitud NUEVA normal ("cliente que YA tienes") + nota neutral "también tiene pendiente la #X".
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{type:'tool_use', input: datos.ia}] } : {}) :
      (pend || {}) }) });
  return new Function('$','$getWorkflowStaticData','$env', CEREBRO)($, () => sd, new Proxy({},{get:()=>''}))[0].json;
}
const WA = '573158998056', NATALIA = '573107577394';
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, muro:{}, ses:{},
                      info:{}, cliMsgs:{}, win:{ [NATALIA]: Date.now() } });
const ev = (o) => Object.assign({ wa_id:WA, profileName:'Kiara', texto:'', mtype:'', media_id:'',
                                  opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);
const IA = (prods) => ({ en_alcance:true, marca:'Ardisa', grupo_pista:'ACABADOS', productos:prods,
                         confianza:'alta', es_info:false, es_reclamo:false });
const PEND = (det) => ({ cons_si:1, pend_id:169, pend_tel:NATALIA, pend_asesor:'Natalia Amaris Martínez',
                         pend_fecha:'29/07 a las 16:49', pend_det:det });
function cerrar(texto, ia, pend) {
  const sd = base();
  sd.ses[WA] = { paso:'detalle', t:Date.now(), consent:true, nombre:'Kiara Contreras',
                 ciudad:'Bucaramanga', ciudadId:'BUCARAMANGA', marca:'Ardisa', grupo:'ACABADOS',
                 interes:'Acabados', ocupacion:'🏠 Cliente final' };
  const r = correr({ datos: ev({ texto, ia }), sd, pend });
  const pk = sd.pendCierre[WA] || {};
  const aviso = pk.aviso ? JSON.stringify(pk.aviso) : JSON.stringify(r.aviso_body||'');
  return { lead: pk.lead || r.lead || {}, aviso, r };
}

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det||''))); };

// ══ A. OTRO producto: solicitud nueva + nota neutral, mismo asesor ═════════════
{
  const { lead, aviso } = cerrar('Si manejan esta pintura para piso de madera', IA(['laca para piso']),
                                 PEND('Hola, Buenas tardes · Si maneja está lámina'));
  chequear('NO lleva la marca ⚠️ REINTENTO', !/REINTENTO|SIN ATENDER/i.test((lead.solicitud||'')+(lead.detalle||'')),
           'solicitud=' + lead.solicitud + ' detalle=' + String(lead.detalle).slice(0,90));
  chequear('El Excel lleva la nota neutral del pendiente', /también tiene pendiente la solicitud #169/i.test(lead.detalle||''),
           'detalle=' + String(lead.detalle).slice(0,120));
  chequear('Va al MISMO asesor (la regla de oro no cambia)', /Natalia/i.test(lead.asesor||''), 'asesor=' + lead.asesor);
  chequear('La tarjeta dice "cliente que YA tienes", sin acusar', /YA tienes/.test(aviso) && !/URGENTE|AÚN NO LO HAN ATENDIDO/i.test(aviso),
           aviso.slice(0,180));
  chequear('Y recuerda el pendiente con el # (neutral)', /#169/.test(aviso), aviso.slice(0,180));
}

// ══ B. LO MISMO otra vez: también llega como solicitud nueva, sin alarmas ══════
{
  const { lead, aviso } = cerrar('Tiene lámina duratex de 18 mm?', IA(['lámina duratex 18mm']),
                                 PEND('Buen día · Tiene lámina duratex yutex y graffo de 18 mm?'));
  chequear('Insistir en lo mismo YA NO dispara alarma (decisión Deicy 06/08)',
           !/REINTENTO|URGENTE|SIN ATENDER|sin reporte de atención/i.test((lead.solicitud||'')+aviso.replace(/pendiente de reporte/g,'')),
           'solicitud=' + lead.solicitud + ' aviso=' + aviso.slice(0,120));
  chequear('La tarjeta dice "cliente que YA tienes" + nota neutral del #169', /YA tienes/.test(aviso) && /#169/.test(aviso), aviso.slice(0,180));
  chequear('Y el mismo asesor', /Natalia/i.test(lead.asesor||''), 'asesor=' + lead.asesor);
}

// ══ C. Sin pendiente: cliente nuevo normal, sin notas ══════════════════════════
{
  const { lead, aviso } = cerrar('Necesito cerámica 60x60', IA(['cerámica 60x60']),
                                 { cons_si:1, pend_id:0, pend_tel:'', pend_asesor:'', pend_det:'' });
  chequear('Cliente sin pendiente: tarjeta de cliente nuevo', /Nuevo cliente/.test(aviso) && !/#169|pendiente de reporte/.test(aviso),
           aviso.slice(0,140));
  chequear('Y el Excel sin notas de más', !/REINTENTO|pendiente/i.test((lead.solicitud||'')+(lead.detalle||'')),
           'detalle=' + String(lead.detalle).slice(0,90));
}

// ══ D. Pendiente sin detalle guardado: igual — solicitud nueva neutral ═════════
{
  const { lead, aviso } = cerrar('Si manejan esta pintura', IA(['pintura']), PEND(''));
  chequear('Con o sin detalle del pendiente, nada de alarmas', !/REINTENTO|URGENTE/i.test((lead.solicitud||'')+aviso),
           'solicitud=' + lead.solicitud);
  chequear('Pero la nota del pendiente #169 sí viaja', /#169/.test(aviso) && /Natalia/i.test(lead.asesor||''), aviso.slice(0,150));
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
