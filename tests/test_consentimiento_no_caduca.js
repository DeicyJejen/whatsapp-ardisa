// Decisión de Deicy (10/08, tras comparar con el bot de UNIMINUTO): la autorización de datos NO se pide
// cada día. La Ley 1581 no la vence a las 24 horas — vale hasta que el titular la revoque o hasta que
// cambie la política. Pedirla a diario era fricción pura: 36 personas habían autorizado dos o más veces,
// una de ellas OCHO. Se conserva el BOTÓN (consentimiento expreso y registrado = la prueba fuerte);
// lo que se quita es la caducidad diaria.
//
// El "consentimiento versionado" vive en la consulta SQL (última decisión bajo la política vigente) y se
// verificó a mano contra los 308 registros reales. Aquí se prueba la mitad que le toca al Cerebro: que
// respete lo que la BD le diga, venga de hoy o de hace un mes, y que la revocación pese más.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{type:'tool_use', input: datos.ia}] } : {}) :
      (pend || {}) }) });
  return new Function('$','$getWorkflowStaticData','$env', CEREBRO)($, () => sd, new Proxy({},{get:()=>''}))[0].json;
}
const WA = '573125270897';
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, muro:{}, ses:{},
                      info:{}, cliMsgs:{} });
const ev = (o) => Object.assign({ wa_id:WA, profileName:'Sergio Aceros', texto:'', mtype:'', media_id:'',
                                  opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);
const muro = (r) => /autorizaci[oó]n para el tratamiento/i.test(JSON.stringify(r.wpp_body||''));

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det||''))); };

// ══ 1. Autorizó ANTES (otro día): la BD dice sí -> NO se le vuelve a pedir ═════
{
  const sd = base();   // staticData limpio: no hay caché de "autorizó hoy"
  const r = correr({ datos: ev({ texto:'Buenos días, necesito 20 bultos de cemento' }), sd,
                     pend:{ cons_si:1, pend_id:0 } });
  chequear('Cliente que ya autorizó (aunque fuera hace un mes) NO ve el muro otra vez',
           !muro(r), 'etapa=' + r.etapa + ' body=' + JSON.stringify(r.wpp_body||'').slice(0,110));
  chequear('Y su solicitud avanza en vez de perderse en el muro',
           r.etapa !== 'consent', 'etapa=' + r.etapa);
}

// ══ 2. Nunca autorizó: el muro sigue firme (el botón NO se elimina) ════════════
{
  const sd = base();
  const r = correr({ datos: ev({ texto:'Buenos días, necesito 20 bultos de cemento' }), sd,
                     pend:{ cons_si:0, pend_id:0 } });
  chequear('Cliente nuevo SÍ ve el muro (seguimos con consentimiento expreso)',
           muro(r), 'etapa=' + r.etapa + ' body=' + JSON.stringify(r.wpp_body||'').slice(0,110));
  chequear('Y el muro trae los dos botones y el enlace a la política',
           /Sí, autorizo/.test(JSON.stringify(r.wpp_body||'')) &&
           /No autorizo/.test(JSON.stringify(r.wpp_body||'')) &&
           /politica-de-datos-personales/.test(JSON.stringify(r.wpp_body||'')),
           JSON.stringify(r.wpp_body||'').slice(0,160));
}

// ══ 3. REVOCÓ (su última decisión fue NO): vuelve a pedirse, el NO manda ═══════
// La consulta SQL devuelve 0 cuando la última fila de ese teléfono dice 'NO' — probado contra el caso
// real de Laura González (61424959008). Para el Cerebro, ese 0 es indistinguible de "nunca autorizó".
{
  const sd = base();
  const r = correr({ datos: ev({ texto:'Hola, quiero cotizar' }), sd, pend:{ cons_si:0, pend_id:0 } });
  chequear('Quien revocó vuelve a ver el muro (un SÍ viejo no revive)', muro(r), 'etapa=' + r.etapa);
}

// ══ 4. El caché de staticData ya no decide solo: la BD manda ══════════════════
{
  const sd = base();
  sd.consent[WA] = Date.now() - 5*24*3600000;   // "autorizó" hace 5 días según el caché
  const r = correr({ datos: ev({ texto:'Necesito cerámica' }), sd, pend:{ cons_si:1, pend_id:0 } });
  chequear('Con la BD en sí, no importa qué tan viejo esté el caché', !muro(r), 'etapa=' + r.etapa);
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
