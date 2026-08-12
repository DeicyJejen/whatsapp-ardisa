// PRUEBA: la cortesía con TILDE o error de tecleo (2026-08-12, caso Alexis #269).
// "Grácias" (con tilde) no matcheaba "gracias": la despedida caía como ADICIÓN — el bot respondía
// "Recibido... ya se lo pasamos a Karime" y a la asesora le llegaba un aviso con la palabra "Grácias".
// El patrón reincidente de siempre (elige(): "bogota" vs "Bogotá"), ahora en la cortesía.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{ type:'tool_use', input: datos.ia }] } : {}) :
      (pend || {}) }) });
  return new Function('$', '$getWorkflowStaticData', '$env', CEREBRO)($, () => sd, new Proxy({}, { get: () => '' }))[0].json;
}
const WA = '573103492648';
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, muro:{}, ses:{},
                      info:{}, cliMsgs:{}, prov:{}, esCli:{} });
const cerrado = (sd) => { sd.ses[WA] = { paso:'cerrado', t:Date.now()-4*60000, closedAt:Date.now()-4*60000,
  nombre:'Alexis Pinzón', asesorNom:'Karime Vannesa', asesorF:1, destino:'573174293535', marca:'Carpincentro' }; return sd; };
const ev = (o) => Object.assign({ wa_id:WA, profileName:'Alexis Pinzón', texto:'', mtype:'', media_id:'',
                                  opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);
const S = (x) => JSON.stringify(x || '');

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det || ''))); };

// El caso literal de Alexis y las variantes reales de tecleo
for (const t of ['Grácias', 'gracias', 'Grasias', 'Muchas grácias', 'adiós', 'adios', 'chaó'.normalize('NFC')]) {
  const sd = cerrado(base());
  const r = correr({ datos: ev({ texto: t }), sd, pend:{ cons_si:1, pend_id:269 } });
  chequear('"' + t + '" recibe cortesía (¡Con gusto!) y NO "ya se lo pasamos"',
           r.etapa === 'cortesia' && /Con gusto/i.test(S(r.wpp_body)) && !r.aviso_body,
           'etapa=' + r.etapa + ' ' + S(r.wpp_body).slice(0, 100));
}
// Y la protección de siempre NO se rompe: "gracias" CON producto sigue llegando al asesor
{
  const sd = cerrado(base());
  const ia = { en_alcance:true, confianza:'alta', productos:['teja de zinc'], grupo_pista:'CONSTRUCCION', acuse:'' };
  const r = correr({ datos: ev({ texto:'Grácias ¿me confirmas si manejan tejas de zinc?', ia }), sd, pend:{ cons_si:1, pend_id:269 } });
  chequear('"Grácias ¿manejan tejas...?" NO es despedida (la IA ve producto)',
           r.etapa !== 'cortesia', 'etapa=' + r.etapa);
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
