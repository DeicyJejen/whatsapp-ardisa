// PRUEBA: el "Cerramos esta conversación" sale UNA sola vez, aunque una carrera pise la memoria.
//
// Caso real (Maryluz 573167404278, 20-ago-2026): recibió el cierre por inactividad TRES veces (9:36,
// 9:41 y 9:43). Una ejecución larga (cotización de 4½ min) cargó el staticData al arrancar y lo guardó
// VIEJO al terminar: borró el `st.dormido` que el cron había marcado y la clienta "resucitó" — el cron
// la volvió a cerrar. La memoria puede perder; la tabla `mensajes` no: el cron ahora recibe de la BD
// quiénes ya recibieron cierre (3h) o recordatorio (1h) y no repite.
const fs = require('fs');
const INACTIVOS = fs.readFileSync(__dirname + '/n_inactivos.js', 'utf8');

let ok = 0, total = 0;
const S = (x) => JSON.stringify(x || '');
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det || ''))); };

const WA = '573167404278';
const base = () => ({ ses:{}, done:{}, win:{}, mediaPend:{}, mediaNudge:{}, segPend:{}, segRemDay:{},
                      pendCierre:{}, holdAviso:[], leads:[], rescate:{}, migSeg2407b:1 });
const correr = (sd, cfg) => new Function('$', '$getWorkflowStaticData', '$env', INACTIVOS)(
  () => ({ first: () => ({ json: cfg || {} }) }), () => sd, new Proxy({}, { get: () => '' }));

// ══ 1. La memoria dice "abierta" pero la BD dice "ya la cerré" -> NO se repite el mensaje ══
{
  const NOW = Date.now();
  const sd = base();
  // sesión resucitada por la carrera: sin dormido, recordada hace 40 min (lista para cierre)
  sd.ses[WA] = { paso:'nombre', t: NOW - 45*60000, recordado: NOW - 40*60000 };
  const out = correr(sd, { cerrados_3h: '573000000001,' + WA }) || [];
  const cierres = out.filter(x => x && x.json && x.json.chat && x.json.chat.etapa === 'cierre_inactividad');
  chequear('NO se emite otro "Cerramos esta conversación"', cierres.length === 0, S(cierres));
  chequear('La sesión queda dormida en silencio (como la dejó el primer cierre)',
           !!sd.ses[WA].dormido, S(sd.ses[WA]));
}

// ══ 2. La BD dice "ya le recordé hace <1h" -> no llega otro recordatorio ══
{
  const NOW = Date.now();
  const sd = base();
  sd.ses[WA] = { paso:'nombre', t: NOW - 35*60000 };   // inactiva: tocaría recordatorio
  const out = correr(sd, { recordados_1h: WA }) || [];
  const recs = out.filter(x => x && x.json && x.json.chat && x.json.chat.etapa === 'recordatorio');
  chequear('NO se repite el recordatorio', recs.length === 0, S(recs));
  chequear('Pero queda marcada como recordada (el cierre normal seguirá su curso)',
           !!sd.ses[WA].recordado, S(sd.ses[WA]));
}

// ══ 3. Cliente NUEVO (no está en las listas de la BD) -> el flujo normal no cambia ══
{
  const NOW = Date.now();
  const sd = base();
  sd.ses[WA] = { paso:'nombre', t: NOW - 35*60000 };
  const out = correr(sd, { cerrados_3h: '573000000001', recordados_1h: '573000000002' }) || [];
  const recs = out.filter(x => x && x.json && x.json.chat && x.json.chat.etapa === 'recordatorio');
  chequear('Al que NO ha recibido nada sí le llega su recordatorio normal', recs.length === 1, S(out.map(x=>x&&x.json&&x.json.chat&&x.json.chat.etapa)));
}

console.log('\n' + ok + '/' + total + ' aserciones');
process.exit(ok === total ? 0 : 1);
