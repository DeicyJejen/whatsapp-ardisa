// Caso REAL del 11-ago 03:28am — proveedor de China, wa_id 8613586300781 (ejecuciones n8n 97852/97861/97872).
//
//  03:28  "Boss"                                             -> OK: mensaje de proveedor
//  03:30  "...datos de contacto de su departamento de        -> la IA respondio es_info=true (su prompt mete
//          compras? Soy un proveedor de China."                 COMPRAS/PROVEEDURIA dentro de es_info) y el
//                                                               filtro lo tomo como SEÑAL DE CLIENTE:
//                                                               le entrego el WhatsApp y el correo de Servicio
//                                                               al Cliente, y marco store.esCli por 48 HORAS.
//  03:35  "Muchas gracias"                                   -> con el filtro ya desarmado, entro al flujo
//                                                               normal: fuera de horario + MURO DE AUTORIZACION
//                                                               DE DATOS + recordatorio + cierre.
//
// Regla de Deicy: a un proveedor no se le pide autorizacion de datos NI se le brindan contactos internos.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{type:'tool_use', input: datos.ia}] } : {}) :
      (pend || {}) }) });
  return new Function('$','$getWorkflowStaticData','$env', CEREBRO)($, () => sd, new Proxy({},{get:()=>''}))[0].json;
}
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, ses:{} });
const msg = (wa, t, ia) => ({ wa_id:wa, profileName:'Boss', texto:t, mtype:'', media_id:'',
                              opcion_id:'', opcion_txt:'', es_media:false, ia:ia||null });
const cuerpo = (r) => JSON.stringify(r.wpp_body || '');

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det||''))); };

const CHINA = '8613586300781';

// ══ La conversacion completa, en el mismo orden en que ocurrio ══════════════════
{
  const sd = base();

  const r1 = correr({ datos: msg(CHINA, 'Boss'), sd, pend:{} });
  chequear('1) Primer mensaje -> mensaje de proveedor', r1.etapa === 'proveedor' && /solo atendemos a nuestros clientes/i.test(cuerpo(r1)),
           'etapa=' + r1.etapa + ' ' + cuerpo(r1).slice(0,120));

  // El mensaje que rompia todo: la IA lo marca es_info=true (compras/proveeduria).
  const IA_INFO = { en_alcance:false, es_reclamo:false, es_info:true, pide_humano:true, confianza:'alta', productos:[] };
  const r2 = correr({ datos: msg(CHINA, '¿Podría facilitarme, por favor, los datos de contacto de su departamento de compras? Soy un proveedor de China.', IA_INFO), sd, pend:{} });
  chequear('2) NO le entrega contactos internos (ayuda@ardisa / 3176643045)',
           !/ayuda@ardisa|3176643045/i.test(cuerpo(r2)) && r2.etapa !== 'info',
           'etapa=' + r2.etapa + ' ' + cuerpo(r2).slice(0,160));
  chequear('2) Sigue tratado como proveedor (no como cliente)', /^proveedor/.test(r2.etapa), 'etapa=' + r2.etapa);
  chequear('2) No queda marcado como cliente por 48h', !(sd.esCli && sd.esCli[CHINA]),
           'esCli=' + JSON.stringify(sd.esCli || {}));

  // En la vida real pasaron 5 MINUTOS entre un mensaje y otro. Hay que envejecer el staticData o el debounce
  // de 45s del cierre pendiente se traga el mensaje y la prueba pasa sin probar nada.
  const CINCO_MIN = 5*60*1000;
  for (const bolsa of [sd.prov, sd.esCli, sd.info, sd.compras]) {
    if (bolsa) for (const k in bolsa) bolsa[k] -= CINCO_MIN;
  }
  if (sd.pendCierre && sd.pendCierre[CHINA]) sd.pendCierre[CHINA].t -= CINCO_MIN;
  if (sd.ses && sd.ses[CHINA] && sd.ses[CHINA].t) sd.ses[CHINA].t -= CINCO_MIN;

  // La despedida neutra que lo colaba al flujo de clientes.
  const IA_NADA ={ en_alcance:false, es_reclamo:false, es_info:false, pide_humano:false, confianza:'alta', productos:[] };
  const r3 = correr({ datos: msg(CHINA, 'Muchas gracias', IA_NADA), sd, pend:{} });
  chequear('3) "Muchas gracias" NO dispara el muro de autorizacion de datos',
           !/autoriz|pol[ií]tica|datos personales/i.test(cuerpo(r3)) && r3.etapa !== 'consent',
           'etapa=' + r3.etapa + ' ' + cuerpo(r3).slice(0,160));
  chequear('3) Tampoco le abre sesion (no habra recordatorio ni cierre)', !(sd.ses && sd.ses[CHINA]),
           'ses=' + JSON.stringify((sd.ses && sd.ses[CHINA]) || null));
  chequear('3) No se crea lead ni aviso a un asesor', !r3.lead && !r3.aviso_body, 'lead=' + JSON.stringify(r3.lead));
}

// ══ Guardas: lo que NO se puede romper ══════════════════════════════════════════
{
  // Yolanda Quintero +63 (10-ago): CLIENTA que ya compro y pide la ficha tecnica de su Esquina Magica.
  // La IA la marca es_info=true y su texto no trae "cotizar" ni "precio" ni "producto": si es_info se
  // descuenta ENTERO, esta clienta recibe "solo atendemos a nuestros clientes". No puede pasar.
  const sd = base();
  const IA_INFO = { en_alcance:false, es_reclamo:false, es_info:true, pide_humano:false, confianza:'alta', productos:[] };
  const r = correr({ datos: msg('639199574917', 'Buenos días. Mi nombre es Yolanda Quintero. tengo una Esquina Mágica Spar para instalar en mi cocina. Podrían enviarme la ficha técnica (incluyendo capacidad de carga) y el manual de instalación? Gracias.', IA_INFO), sd, pend:{} });
  chequear('GUARDA: la clienta extranjera que pide una ficha tecnica NO es proveedor',
           !/^proveedor/.test(r.etapa) && !/solo atendemos a nuestros clientes/i.test(cuerpo(r)), 'etapa=' + r.etapa);
}
{
  // Laura Gonzalez +61 (fix 29-jul): cliente REAL con numero extranjero -> se atiende.
  const sd = base();
  const IA_CLI = { en_alcance:true, es_reclamo:false, es_info:false, pide_humano:false, confianza:'alta', productos:['lavadero en pasta'] };
  const r = correr({ datos: msg('61412345678', 'Venden lavaderos en pasta', IA_CLI), sd, pend:{} });
  chequear('GUARDA: cliente extranjero real sigue siendo atendido', !/^proveedor/.test(r.etapa), 'etapa=' + r.etapa);
}
{
  // Omar Rivera (regla Deicy 3-ago): numero colombiano que habla de compras -> se le PREGUNTA a que area va.
  const sd = base();
  const IA_INFO = { en_alcance:false, es_reclamo:false, es_info:true, pide_humano:false, confianza:'alta', productos:[] };
  const r = correr({ datos: msg('573001112233', 'Si es para hablar con los de compras', IA_INFO), sd, pend:{} });
  chequear('GUARDA: "hablar con los de compras" pregunta primero, no entrega contactos',
           r.etapa === 'compras' && !/ayuda@ardisa/i.test(cuerpo(r)), 'etapa=' + r.etapa + ' ' + cuerpo(r).slice(0,140));
}
{
  // Info administrativa de verdad (certificados, cartera): sigue yendo a Servicio al Cliente.
  const sd = base();
  const IA_INFO = { en_alcance:false, es_reclamo:false, es_info:true, pide_humano:false, confianza:'alta', productos:[] };
  const r = correr({ datos: msg('573004445566', 'Necesito un certificado de cámara de comercio de ustedes', IA_INFO), sd, pend:{} });
  chequear('GUARDA: la info administrativa real sigue yendo a Servicio al Cliente', r.etapa === 'info', 'etapa=' + r.etapa);
}
{
  // CURA DEL RESIDUO: los dos numeros chinos que el bug ya dejo marcados como "cliente" por 48h en el
  // staticData en vivo (8613586300781 y 8613088880936). Si vuelven a escribir hoy no pueden colarse.
  const sd = base();
  sd.esCli = { [CHINA]: Date.now() - 60*60*1000 };          // marca falsa puesta por el bug, hace 1 hora
  sd.prov  = { [CHINA]: Date.now() - 30*60*60*1000 };       // pero YA le habiamos dicho que es la linea de clientes
  const r = correr({ datos: msg(CHINA, 'Buenos días'), sd, pend:{} });
  chequear('CURA: la marca vieja de "cliente" no revive al proveedor', /^proveedor/.test(r.etapa) &&
           !/autoriz|datos personales/i.test(cuerpo(r)), 'etapa=' + r.etapa + ' ' + cuerpo(r).slice(0,120));
  chequear('CURA: y la marca falsa queda borrada', !sd.esCli[CHINA], 'esCli=' + JSON.stringify(sd.esCli));
}
{
  // ...pero un cliente de verdad con esa misma marca sigue entrando (no se puede curar de mas).
  const sd = base();
  sd.esCli = { [CHINA]: Date.now() - 60*60*1000 };
  sd.prov  = { [CHINA]: Date.now() - 30*60*60*1000 };
  const IA_CLI = { en_alcance:true, es_reclamo:false, es_info:false, pide_humano:false, confianza:'alta', productos:['cemento'] };
  const r = correr({ datos: msg(CHINA, 'Necesito cotizar 100 bultos de cemento', IA_CLI), sd, pend:{} });
  chequear('CURA: si despues pide una cotizacion real, se le atiende', !/^proveedor/.test(r.etapa), 'etapa=' + r.etapa);
}
{
  // El proveedor que se autoidentifica, aunque el numero sea colombiano.
  const sd = base();
  const r = correr({ datos: msg('573007778899', 'Buen día, soy un proveedor de herrajes y quiero ofrecerles el portafolio'), sd, pend:{} });
  chequear('GUARDA: "soy un proveedor" -> mensaje de proveedor', r.etapa === 'proveedor', 'etapa=' + r.etapa);
}

console.log('\n' + ok + '/' + total + ' aserciones OK');
process.exit(ok === total ? 0 : 1);
