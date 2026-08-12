// PRUEBA: chat híbrido (2026-08-12, pedido Deicy tras ver el "chat híbrido" de Wizard Bot/Claro).
// Cuando un humano atiende desde el panel (tabla `humano` con hasta > NOW() -> PEND.humano_on=1),
// el Cerebro se CALLA: registra lo que llegue para el panel, congela recordatorios y no avisa a nadie.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');
const INACTIVOS = fs.existsSync(__dirname + '/n_inactivos.js') ? fs.readFileSync(__dirname + '/n_inactivos.js', 'utf8') : null;

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{ type:'tool_use', input: datos.ia }] } : {}) :
      (pend || {}) }) });
  return new Function('$', '$getWorkflowStaticData', '$env', CEREBRO)($, () => sd, new Proxy({}, { get: () => '' }))[0].json;
}
const WA = '573009998877';
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, muro:{}, ses:{},
                      info:{}, cliMsgs:{}, prov:{}, esCli:{} });
const ev = (o) => Object.assign({ wa_id:WA, profileName:'Cliente Prueba', texto:'', mtype:'', media_id:'',
                                  opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);
const S = (x) => JSON.stringify(x || '');

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det || ''))); };

// ══ 1. Humano atendiendo: el bot se calla pero ESCUCHA ═══════════════════════
{
  const sd = base();
  sd.ses[WA] = { paso:'cerrado', t:Date.now()-10*60000, closedAt:Date.now()-10*60000, nombre:'Cliente Prueba' };
  const r = correr({ datos: ev({ texto:'Sí, me interesa el combo que me ofreces' }), sd, pend:{ cons_si:1, humano_on:1 } });
  chequear('El bot NO contesta mientras el humano atiende', !r.wpp_body && !r.aviso_body, 'etapa=' + r.etapa + ' ' + S(r.wpp_body).slice(0,100));
  chequear('Pero el mensaje queda REGISTRADO para el panel',
           r.chat && r.chat.etapa === 'humano_panel' && /me interesa el combo/.test(r.chat.entrada), S(r.chat).slice(0,160));
  chequear('Y congela el recordatorio de inactividad (st.humano)', !!sd.ses[WA].humano, S(sd.ses[WA]).slice(0,120));
}
// ══ 2. La FOTO durante la atención humana también queda en el panel ═══════════
{
  const sd = base();
  sd.ses[WA] = { paso:'cerrado', t:Date.now()-10*60000, closedAt:Date.now()-10*60000, nombre:'Cliente Prueba' };
  const r = correr({ datos: ev({ es_media:true, mtype:'image', media_id:'888777' }), sd, pend:{ cons_si:1, humano_on:1 } });
  chequear('La foto se registra con su etiqueta de media (visible en el panel)',
           r.etapa === 'humano_panel' && /⟦m:888777:image⟧/.test((r.chat||{}).entrada||''), S(r.chat).slice(0,160));
  chequear('Y NO se reenvía a ningún asesor (el humano ya la está viendo)', !r.aviso_medias && !r.aviso_body, S(r.aviso_medias));
}
// ══ 3. Sin humano (humano_on=0): el flujo normal ni se entera ════════════════
{
  const sd = base();
  const r = correr({ datos: ev({ texto:'Hola' }), sd, pend:{ cons_si:0, humano_on:0 } });
  chequear('Sin marca de humano: el bot atiende normal (muro de bienvenida)',
           /autorizaci[oó]n|politica-de-datos/i.test(S(r.wpp_body)), 'etapa=' + r.etapa);
}
// ══ 4. La marca NO afecta a los ASESORES (su flujo de reportes sigue) ═════════
{
  const sd = base();
  const r = correr({ datos: ev({ wa_id:'573174293535', profileName:'Karime', texto:'hola' }), sd, pend:{ cons_si:1, humano_on:1 } });
  chequear('Un asesor con la marca puesta NO cae al silencio del panel', r.etapa !== 'humano_panel', 'etapa=' + r.etapa);
}
// ══ 5. El cron de inactividad respeta la atención humana ═════════════════════
if (INACTIVOS) {
  const NOW = Date.now();
  const sd = base();
  sd.ses[WA] = { paso:'detalle', t:NOW-14*60000, humano:NOW-5*60000, nombre:'Cliente Prueba' };   // 14 min quieto PERO humano hace 5
  const out = new Function('$', '$getWorkflowStaticData', '$env', INACTIVOS)(()=>({first:()=>({json:{}})}), () => sd, new Proxy({},{get:()=>''}));
  const mio = (out||[]).filter(x => x.json && x.json.msg && x.json.msg.to === WA);
  chequear('Inactividad 14 min + humano activo: NO se manda "¿Continuamos?"', mio.length === 0, S(mio).slice(0,160));
} else { total++; ok++; console.log('  OK   | (n_inactivos.js no disponible en este arnés)'); }

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
