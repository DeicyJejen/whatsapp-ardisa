// PRUEBA: el adjunto que cumple 7 días en la cola de un asesor NO se borra en silencio — se re-dirige a la
// línea de monitoreo (Deicy) para reenvío a mano (caso Arq Omar González / cola de Karime, 13-ago-2026).
//
// Antes: la poda del cron (`< 7*24*3600000`) descartaba el ítem y nadie se enteraba. Si el asesor nunca
// abría su ventana de 24h (Karime: 1 interacción desde el 22-jul), el archivo del cliente moría.
// Ahora: al vencerse se encola para la línea de monitoreo con una nota que explica de quién es; si el
// destino ya ES la línea de monitoreo, ahí sí se descarta de verdad (sin bucles infinitos).
const fs = require('fs');
const INACTIVOS = fs.existsSync(__dirname + '/n_inactivos.js') ? fs.readFileSync(__dirname + '/n_inactivos.js', 'utf8') : null;

const MON = '573205662947';           // línea de monitoreo (Deicy)
const ASE = '573000000009';           // asesor ficticio de prueba
const DIA = 24 * 3600000;
const S = (x) => JSON.stringify(x || '');

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det || ''))); };

// staticData mínimo para que el cron corra sin efectos colaterales (migSeg2407b=1 salta la migración vieja)
const base = () => ({ ses:{}, done:{}, win:{}, mediaPend:{}, mediaNudge:{}, segPend:{}, segRemDay:{},
                      pendCierre:{}, holdAviso:[], leads:[], rescate:{}, migSeg2407b:1 });
const correr = (sd) => new Function('$', '$getWorkflowStaticData', '$env', INACTIVOS)(
  () => ({ first: () => ({ json: {} }) }), () => sd, new Proxy({}, { get: () => '' }));
const doc = (to, cliente, t) => ({ m: { messaging_product:'whatsapp', to: to, type:'document',
  document:{ id:'999000111' } }, cliente: cliente, t: t });

if (!INACTIVOS) { console.log('  OK   | (n_inactivos.js no disponible en este arnés)'); process.exit(0); }

// ══ 1. El adjunto vencido (8 días) se re-dirige al monitoreo; el fresco se queda esperando ══
{
  const NOW = Date.now();
  const sd = base();
  sd.mediaPend[ASE] = [doc(ASE, 'Cliente Viejo', NOW - 8*DIA), doc(ASE, 'Cliente Nuevo', NOW - 3600000)];
  correr(sd);
  chequear('La cola del asesor conserva SOLO el adjunto fresco',
           (sd.mediaPend[ASE] || []).length === 1 && sd.mediaPend[ASE][0].cliente === 'Cliente Nuevo',
           S(sd.mediaPend[ASE]));
  const cM = sd.mediaPend[MON] || [];
  chequear('El vencido quedó encolado para la línea de monitoreo (nota + archivo)',
           cM.length === 2 && cM[1].cliente === 'Cliente Viejo', S(cM.map(x => x.cliente)));
  chequear('La nota explica qué son y de quién', /rescatados/.test(S(cM[0] && cM[0].m)) && /Cliente Viejo/.test(S(cM[0] && cM[0].m)),
           S(cM[0] && cM[0].m).slice(0, 140));
  chequear('El archivo va re-dirigido al monitoreo con el reloj reiniciado',
           !!(cM[1] && cM[1].m && cM[1].m.to === MON && (NOW - cM[1].t) < 60000), S(cM[1] && cM[1].m && cM[1].m.to));
}

// ══ 2. Si el vencido ya está en la cola del monitoreo, se descarta de verdad (sin bucle) ══
{
  const NOW = Date.now();
  const sd = base();
  sd.mediaPend[MON] = [doc(MON, 'Cliente Perdido Hace Rato', NOW - 8*DIA)];
  correr(sd);
  chequear('En la cola del monitoreo la poda sí descarta (no se re-encola a sí misma)',
           !sd.mediaPend[MON], S(sd.mediaPend[MON]));
}

// ══ 3. Regresión: el drenaje normal sigue igual (ventana abierta -> se entrega y se limpia) ══
{
  const NOW = Date.now();
  const sd = base();
  sd.win[ASE] = NOW;                                     // el asesor acaba de escribir: ventana abierta
  sd.mediaPend[ASE] = [doc(ASE, 'Cliente Al Día', NOW - 3600000)];
  const out = correr(sd) || [];
  chequear('Con ventana abierta la cola se entrega (intro + adjunto) y se borra',
           !sd.mediaPend[ASE] && out.some(x => /Adjuntos del cliente/.test(S(x))) &&
           out.some(x => x.json && x.json.msg && x.json.msg.type === 'document'), S(out.length));
}

// ══ 4. Regresión: la plantilla de destrabe (media_nudge) sigue saliendo con cola >6h ══
{
  const NOW = Date.now();
  const sd = base();
  sd.mediaPend[ASE] = [doc(ASE, 'Cliente Esperando', NOW - 8*3600000)];   // 8 horas, ventana cerrada
  const out = correr(sd) || [];
  chequear('La plantilla de destrabe al asesor sigue saliendo (etapa media_nudge)',
           out.some(x => x.json && x.json.chat && x.json.chat.etapa === 'media_nudge'), S(out.length));
  chequear('Y la cola se conserva (no se pierde por avisar)',
           (sd.mediaPend[ASE] || []).length === 1, S(sd.mediaPend[ASE]));
}

// ══ ESCALADO A LAS 24 HORAS (2026-08-18) ═════════════════════════════════════════════════════════
// Esperar siete días a que un asesor abra su chat es demasiado: las fotos de María Tarazona llevaban 163
// horas en la cola de Karime. A las 24 h se manda una COPIA al monitoreo — copia, no traslado: si el
// asesor abre mañana, el archivo sigue en su cola y lo recibe igual.
{
  const NOW = Date.now();
  const sd = base();
  sd.mediaPend[ASE] = [doc(ASE, 'María Tarazona', NOW - 30*3600000), doc(ASE, 'Cliente de hoy', NOW - 3600000)];
  correr(sd);
  const cM = sd.mediaPend[MON] || [];
  chequear('A las 24h la foto atascada se COPIA al monitoreo (nota + archivo)',
           cM.length === 2 && cM[1].cliente === 'María Tarazona' && cM[1].m.to === MON,
           S(cM.map(x => x.cliente)));
  chequear('La nota dice de quién es, cuántas horas lleva y a qué asesor',
           /María Tarazona/.test(S(cM[0].m)) && /30 horas/.test(S(cM[0].m)) && new RegExp(ASE).test(S(cM[0].m)),
           S(cM[0] && cM[0].m).slice(0, 200));
  chequear('El adjunto SIGUE en la cola del asesor (si abre mañana, igual le llega)',
           (sd.mediaPend[ASE] || []).length === 2, S((sd.mediaPend[ASE]||[]).map(x => x.cliente)));
  chequear('Lo de hace una hora NO se escala (el asesor tiene su día hábil)',
           !cM.some(x => x.cliente === 'Cliente de hoy'), S(cM.map(x => x.cliente)));
  // Segunda corrida del cron: la marca `esc` evita repetir la copia cada dos minutos.
  const antes = (sd.mediaPend[MON] || []).length;
  correr(sd);
  chequear('La copia sale UNA sola vez, no en cada tick del cron',
           (sd.mediaPend[MON] || []).length === antes, antes + ' -> ' + (sd.mediaPend[MON]||[]).length);
}

// El que ya cumplió 7 días NO se copia además de rescatarse: llegaría dos veces el mismo archivo.
{
  const NOW = Date.now();
  const sd = base();
  sd.mediaPend[ASE] = [doc(ASE, 'Cliente Viejísimo', NOW - 9*DIA)];
  correr(sd);
  const cM = sd.mediaPend[MON] || [];
  chequear('Un adjunto de 9 días llega UNA vez (por el rescate), no dos',
           cM.filter(x => x.m && x.m.type === 'document').length === 1,
           S(cM.map(x => (x.m||{}).type)));
}

// ══ NADA LLEGA DOS VECES, Y CON UN SOLO ENCABEZADO (2026-08-18, pantallazo de Deicy) ══════════════
// Las dos fotos de María Tarazona le llegaron a las 11:44 por el escalado de 24h y OTRA VEZ a las 16:30
// por la poda de los 7 días. Y con dos encabezados seguidos: "te los reenvío ahora 👇" e inmediatamente
// "van a continuación 👇", sin nada en medio.
{
  const NOW = Date.now();
  const sd = base();
  const yaEscalado = doc(ASE, 'María Tarazona', NOW - 8*DIA); yaEscalado.esc = 1;
  sd.mediaPend[ASE] = [yaEscalado, doc(ASE, 'Nunca escalado', NOW - 8*DIA)];
  correr(sd);
  const cM = sd.mediaPend[MON] || [];
  const archivos = cM.filter(x => x.m && x.m.type === 'document');
  chequear('Lo que ya se escaló a las 24h NO se reenvía al podarse',
           archivos.length === 1 && archivos[0].cliente === 'Nunca escalado',
           JSON.stringify(cM.map(x => x.cliente + ':' + (x.m||{}).type)));
  chequear('Y la cola del asesor queda limpia igual (la poda sí lo descarta)',
           !(sd.mediaPend[ASE] || []).length, JSON.stringify(sd.mediaPend[ASE]));
}
{
  // Al entregarse una cola que YA trae su nota explicativa, no se le antepone el encabezado genérico.
  const NOW = Date.now();
  const sd = base(); sd.win[MON] = NOW;
  sd.mediaPend[MON] = [
    { m: { messaging_product:'whatsapp', to:MON, type:'text', text:{ body:'⚠️ *Adjuntos rescatados de la cola* (2)…' } }, cliente:'María Tarazona', t:NOW },
    doc(MON, 'María Tarazona', NOW), doc(MON, 'María Tarazona', NOW) ];
  const out = correr(sd);
  const textos = (out||[]).map(o => { try { return o.json.msg.text.body; } catch(e) { return ''; } }).filter(Boolean);
  chequear('Un solo encabezado: no se suma "te los reenvío ahora" encima de la nota',
           !textos.some(t => /te los reenv[íi]o ahora/.test(t)), JSON.stringify(textos).slice(0, 200));
  chequear('La nota propia sí sale, y los archivos detrás',
           textos.some(t => /rescatados de la cola/.test(t)) &&
           (out||[]).filter(o => { try { return o.json.msg.type === 'document'; } catch(e) { return false; } }).length === 2,
           JSON.stringify(textos).slice(0, 160));
}

console.log(ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
