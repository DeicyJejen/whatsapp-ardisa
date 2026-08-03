// Dos casos reales del chat de Omar Rivera (Homega), lead #207 del 3-ago:
//  A) "Si es para hablar con los de compras" -> el bot lo registro como CLIENTE y se lo paso a una asesora
//     de VENTAS. Es alguien que quiere VENDERLE a Ardisa. Regla Deicy: hay que PREGUNTARLE MAS.
//  B) Cerro con ciudad "Bucaramanga" y 11 minutos despues escribio "Cali" -> el bot dijo "ya esta en gestion"
//     y esa ciudad NUNCA le llego a la asesora (la ventana de adicion era de 5 minutos).
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{type:'tool_use', input: datos.ia}] } : {}) :
      (pend || {}) }) });
  return new Function('$','$getWorkflowStaticData','$env', CEREBRO)($, () => sd, new Proxy({},{get:()=>''}))[0].json;
}
const WA = '573009998877';
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, ses:{} });
const txt = (t, ia) => ({ wa_id:WA, profileName:'Homega Colombia Sas', texto:t, mtype:'', media_id:'',
                          opcion_id:'', opcion_txt:'', es_media:false, ia:ia||null });

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det||''))); };

// ══ A) "hablar con los de compras" ══════════════════════════════════════════════
{
  const sd = base();
  const r1 = correr({ datos: txt('Si es para hablar con los de compras'), sd, pend:{} });
  const c1 = JSON.stringify(r1.wpp_body||'');
  chequear('Pregunta más en vez de registrarlo como cliente', r1.etapa === 'compras' && !r1.lead,
           'etapa=' + r1.etapa + ' ' + c1.slice(0,140));
  chequear('No lo manda a un asesor de ventas', !r1.aviso_body && !r1.lead, 'aviso=' + JSON.stringify(r1.aviso_body));
  chequear('Le ofrece las dos opciones (proveedor / compra hecha)',
           /proveedor/i.test(c1) && /(compra|pedido)/i.test(c1), c1.slice(0,200));

  // Responde que quiere ofrecer -> se le dice que este canal es solo para clientes
  const r2 = correr({ datos: txt('Quiero ofrecerles nuestros productos, somos fabricantes'), sd, pend:{} });
  chequear('Si es proveedor -> mensaje de proveedor', r2.etapa === 'proveedor' && !r2.lead, 'etapa=' + r2.etapa);
}
{
  const sd = base();
  correr({ datos: txt('Necesito el contacto de compras'), sd, pend:{} });
  const r2 = correr({ datos: txt('Es por una factura de un pedido que les hice'), sd, pend:{} });
  const c2 = JSON.stringify(r2.wpp_body||'');
  chequear('Si es una duda -> le da el contacto de Servicio al Cliente',
           r2.etapa === 'info' && /ayuda@ardisa\.com/.test(c2), 'etapa=' + r2.etapa + ' ' + c2.slice(0,140));
}
{
  const sd = base();
  const r = correr({ datos: txt('Buenas, necesito cotizar 20 bultos de cemento gris',
                                { en_alcance:true, marca:'Ardisa', grupo_pista:'CONSTRUCCION',
                                  productos:['cemento'], confianza:'alta', es_reclamo:false, es_info:false }), sd, pend:{} });
  chequear('Un CLIENTE de verdad no cae en la rama de compras', r.etapa !== 'compras' && r.etapa !== 'proveedor',
           'etapa=' + r.etapa);
}

// ══ B) Lo que escribe DESPUES de cerrar no se pierde ════════════════════════════
function sesionCerrada(haceMs) {
  const sd = base();
  sd.ses[WA] = { paso:'cerrado', t:Date.now()-haceMs, closedAt:Date.now()-haceMs, nombre:'Homega Colombia Sas',
                 ciudad:'Bucaramanga', marca:'Ardisa', asesorNom:'Natalia Amaris Martínez',
                 asesorNum:'573107577394', destino:'573107577394' };
  sd.wOpen = { '573107577394': Date.now() };
  // Como pasa de verdad: al cerrar un lead queda TAMBIEN el candado persistente store.done (sobrevive a
  // que la sesion en memoria caduque). Sin el, una sesion vieja se descarta y el cliente arranca de cero.
  sd.done[WA] = { t: Date.now()-haceMs, asesorNom:'Natalia Amaris Martínez', asesorNum:'573107577394',
                  destino:'573107577394', marca:'Ardisa', nombre:'Homega Colombia Sas', ciudad:'Bucaramanga' };
  return sd;
}
{
  const sd = sesionCerrada(11*60*1000);                       // 11 minutos, como paso de verdad
  const r = correr({ datos: txt('Cali'), sd, pend:{} });
  chequear('"Cali" a los 11 min SÍ le llega a la asesora', r.etapa === 'adicion' && !!r.aviso_body,
           'etapa=' + r.etapa + ' aviso=' + JSON.stringify(r.aviso_body||'').slice(0,120));
  chequear('El aviso a la asesora lleva el texto del cliente', /Cali/.test(JSON.stringify(r.aviso_body||'')),
           JSON.stringify(r.aviso_body||'').slice(0,150));
  chequear('Al cliente se le confirma que ya se lo pasaron',
           /(Recibido|ya se lo pasamos)/i.test(JSON.stringify(r.wpp_body||'')), JSON.stringify(r.wpp_body||'').slice(0,150));
}
{
  // La sesion y el candado store.done viven 3 HORAS (limite del blindaje anti-duplicado). Dentro de esa
  // ventana todo lo que escriba se le suma a su solicitud. Pasadas las 3h el cliente arranca de nuevo, y ahi
  // lo que evita el duplicado es el amarre por BD (vuelve al MISMO asesor).
  const sd = sesionCerrada(2*3600000);                        // 2 horas despues
  const r = correr({ datos: txt('Se me olvidó decirles que lo necesito para el jueves'), sd, pend:{} });
  chequear('A las 2 horas TAMBIÉN le llega', r.etapa === 'adicion' && !!r.aviso_body, 'etapa=' + r.etapa);
}
{
  const sd = sesionCerrada(2*3600000);
  const r = correr({ datos: txt('Muy buenas tardes'), sd, pend:{} });
  chequear('Un saludo suelto NO es adición (deja actuar la regla de "sin atender")',
           r.etapa !== 'adicion', 'etapa=' + r.etapa);
}
{
  const sd = sesionCerrada(30*60*1000);
  const r = correr({ datos: txt('Muchas gracias, muy amables'), sd, pend:{} });
  chequear('Un "gracias" sigue siendo cortesía, no adición', r.etapa === 'cortesia', 'etapa=' + r.etapa);
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
