// Informe multi-agente 05/08: compuertas que APAGABAN la IA justo en los mensajes más valiosos.
//  1. El tope de 600 caracteres descartaba las LISTAS DE MATERIALES pegadas — los leads más ricos.
//     Ahora: hasta 2500 se clasifica (el texto que viaja a la API se recorta a 1200).
//  2. La condición u5 saltaba la IA si el texto traía "asesor": "me pasan un asesor que me cotice
//     porcelanato para 80 m2" ruteaba SIN veredicto y 'frescasa' cerró como Acabados siendo Construcción.
//     u5 se eliminó del nodo ¿Usar IA?: el escape a humano se maneja igual, pero CON la lectura de la IA.
const fs = require('fs');
const PREPARA = fs.readFileSync(__dirname + '/n_prepara.js', 'utf8');

function correr(texto, sd) {
  const datos = { wa_id:'573001112233', msg_id:'wamid.TEST'+Math.floor(texto.length), texto };
  const $ = (n) => ({ first: () => ({ json: datos }) });
  const $input = { first: () => ({ json: datos }) };
  return new Function('$','$getWorkflowStaticData','$input', PREPARA)($, () => sd, $input)[0].json;
}
const base = () => ({ aiRate:{}, aiSpend:{day:'',n:0}, lastId:{}, cliMsgs:{}, ses:{} });

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det||''))); };

// ══ 1. La lista de materiales larga SÍ se clasifica ════════════════════════════
{
  const lista = Array.from({length:28},(_,i)=>(i+1)+' unidades de producto de obra número '+(i+1)).join('\n'); // ~900 chars
  const r = correr(lista, base());
  chequear('Lista de ' + lista.length + ' chars SÍ va a la IA (antes se descartaba en 600)',
           r.gastar_ia === true, 'gastar=' + r.gastar_ia + ' motivo=' + r.motivo);
  const enviado = r.ia_body && r.ia_body.messages[0].content;
  chequear('Y el texto viaja completo dentro del recorte', /producto de obra número 28/.test(enviado||''),
           String(enviado).slice(-80));
}
{
  const gigante = 'x'.repeat(1800);
  const r = correr(gigante, base());
  chequear('1800 chars se clasifica con recorte a 1200', r.gastar_ia === true &&
           r.ia_body.messages[0].content.length < 1400, 'len=' + (r.ia_body&&r.ia_body.messages[0].content.length));
}
{
  const abuso = 'x'.repeat(3000);
  const r = correr(abuso, base());
  chequear('3000 chars (abuso) sigue sin gastar', r.gastar_ia === false && r.motivo === 'texto',
           'gastar=' + r.gastar_ia + ' motivo=' + r.motivo);
}

// ══ 2. u5 eliminada: "asesor" en el texto ya NO apaga la IA ════════════════════
{
  const w = JSON.parse(fs.readFileSync(__dirname + '/../workflow-bot-f1.json', 'utf8'));
  const nodo = w.nodes.find(n => n.name === '¿Usar IA?');
  const conds = JSON.stringify(nodo.parameters.conditions);
  chequear('El nodo ¿Usar IA? ya no mira pide_humano_kw', !/pide_humano_kw/.test(conds), conds.slice(0,200));
  chequear('(las demás compuertas siguen: saludo, botón, retry)', /es_saludo/.test(conds) && /opcion_id/.test(conds));
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
