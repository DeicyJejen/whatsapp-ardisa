// PRUEBA: la foto del cliente llega al asesor aunque su ventana de 24 h esté cerrada.
//
// Decisión de Deicy (2026-08-19). Meta deja mandar PLANTILLAS a cualquier hora, pero NO reenviar el archivo
// del cliente como mensaje libre: eso exige que el asesor haya escrito en las últimas 24 h. Karime llevaba
// 8 días sin escribirle al bot: sus clientes le llegaban con el pedido (plantilla, sí entra) y SIN la foto
// (a la cola, 115 horas esperando). Una plantilla con ENCABEZADO DE IMAGEN sí la lleva.
// El nombre de la plantilla vive en `config.tpl_foto`: vacío = todo sigue como antes (cola).
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{ type:'tool_use', input: datos.ia }] } : {}) :
      (pend || {}) }) });
  return new Function('$', '$getWorkflowStaticData', '$env', CEREBRO)($, () => sd, new Proxy({}, { get: () => '' }))[0].json;
}
const WA = '573007776655';
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, muro:{}, ses:{},
                      info:{}, cliMsgs:{}, prov:{}, esCli:{}, mediaPend:{}, win:{}, cfg:{} });
const ev = (o) => Object.assign({ wa_id:WA, profileName:'Cliente', texto:'', mtype:'', media_id:'',
                                  opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);
const S = (x) => JSON.stringify(x || '');
const CON_TPL = (o) => Object.assign({ cons_si:1, cfg_tpl_foto:'foto_cliente' }, o);
const SIN_TPL = (o) => Object.assign({ cons_si:1 }, o);

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det || ''))); };

// Deja al cliente CERRADO con asesor asignado (Ardisa/Bucaramanga) y devuelve el store
function hastaCerrar(sd, pend) {
  correr({ datos: ev({ texto:'necesito cemento gris' }), sd, pend });
  correr({ datos: ev({ texto:'Sí, autorizo', opcion_id:'CONSENT_SI' }), sd, pend });
  correr({ datos: ev({ texto:'🟢 Ardisa', opcion_id:'MAR_ARD' }), sd, pend });
  correr({ datos: ev({ texto:'Pedro Gómez' }), sd, pend });
  correr({ datos: ev({ texto:'Bucaramanga' }), sd, pend });
  correr({ datos: ev({ texto:'🏠 Cliente final', opcion_id:'OAR_FINAL' }), sd, pend });
  correr({ datos: ev({ texto:'20 bultos para una placa' }), sd, pend });
  // el nodo "Finalizar cierre" ya entregó la tarjeta (en el bot es otro nodo, aquí se simula):
  // así la foto que llega después entra por la rama de ADICIÓN, que es la que decide cómo mandarla.
  sd.pendCierre = {};
  sd.done[WA] = { t: Date.now() - 10*60000 };
}
const FOTO = ev({ es_media:true, mtype:'image', media_id:'MID-123' });

// ══ 1. SIN plantilla configurada: se comporta como hasta hoy (a la cola) ═══════
{
  const sd = base();
  hastaCerrar(sd, SIN_TPL({}));
  const r = correr({ datos: FOTO, sd, pend: SIN_TPL({}) });
  const enCola = Object.keys(sd.mediaPend).length > 0;
  chequear('Sin plantilla, la foto se encola (comportamiento de siempre)', enCola, S(Object.keys(sd.mediaPend)));
  chequear('Y no se manda nada suelto', !r.aviso_medias, S(r.aviso_medias).slice(0,120));
}

// ══ 2. CON plantilla: la foto sale aunque la ventana esté cerrada ═════════════
{
  const sd = base();
  hastaCerrar(sd, CON_TPL({}));
  const r = correr({ datos: FOTO, sd, pend: CON_TPL({}) });
  const m = (r.aviso_medias || [])[0];
  chequear('Sale un mensaje al asesor', !!m, S(r.aviso_medias).slice(0,120));
  chequear('Y es la PLANTILLA aprobada', !!m && m.type === 'template' && m.template.name === 'foto_cliente',
           S(m).slice(0,140));
  chequear('Con la foto del cliente en el encabezado',
           !!m && m.template.components[0].type === 'header'
              && m.template.components[0].parameters[0].image.id === 'MID-123', S(m).slice(0,200));
  chequear('Y el nombre del cliente en el cuerpo',
           !!m && /Pedro/.test(S(m.template.components[1])), S(m && m.template.components[1]));
  chequear('Ya NO queda esperando en la cola', Object.keys(sd.mediaPend).length === 0, S(sd.mediaPend));
}

// ══ 3. Con la ventana ABIERTA se manda la foto normal (más barato que plantilla) ══
{
  const sd = base();
  hastaCerrar(sd, CON_TPL({}));
  const dest = (sd.ses[WA] || {}).destino;
  sd.win[dest] = Date.now();          // el asesor escribió hace un momento
  const r = correr({ datos: FOTO, sd, pend: CON_TPL({}) });
  const m = (r.aviso_medias || [])[0];
  chequear('Con ventana abierta va la imagen directa, no la plantilla',
           !!m && m.type === 'image' && m.image.id === 'MID-123', S(m).slice(0,140));
}

// ══ 4. El nombre de la plantilla se guarda para el cron de la cola ════════════
{
  const sd = base();
  correr({ datos: ev({ texto:'hola' }), sd, pend: CON_TPL({}) });
  chequear('El cron puede leer el nombre de la plantilla', (sd.cfg || {}).tplFoto === 'foto_cliente', S(sd.cfg));
}

// ══ 5. UNA SOLA VEZ: la misma foto no sale dos veces (Deicy, 19-ago) ══════════
{
  const sd = base();
  hastaCerrar(sd, CON_TPL({}));
  const r1 = correr({ datos: FOTO, sd, pend: CON_TPL({}) });
  chequear('(la primera vez sí sale)', !!(r1.aviso_medias || [])[0], S(r1.aviso_medias).slice(0,80));
  // el cliente reenvía EL MISMO archivo (o Meta repite el webhook)
  const r2 = correr({ datos: FOTO, sd, pend: CON_TPL({}) });
  chequear('La misma foto NO se le manda de nuevo al asesor', !(r2.aviso_medias || [])[0],
           S(r2.aviso_medias).slice(0,120));
  chequear('Y tampoco queda esperando en la cola', Object.keys(sd.mediaPend).length === 0, S(sd.mediaPend));
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
