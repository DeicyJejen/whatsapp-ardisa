// CLIENTE DEL SELLADOR SIKA (18-ago-2026) — Deicy: "ya con eso debió saber qué línea es, ¿por qué le
// sigue preguntando?".
//
//  4:02 pm  "Buenas tardes, necesito sellador Sika Polymarflex, precio galón y precio balde 12 kg"
//           -> 📝 Anotamos… + MENÚ DE MARCAS (¿Ardisa o Carpincentro?)
//  4:08 pm  "si lo tienen y el precio ???"
//           -> "Claro, buscas el sellador Sika Polymarflex…" y recién ahí siguió
//
// En ese PRIMER mensaje la IA ya había respondido marca=Ardisa, grupo=ACABADOS y los dos productos
// (verificado en la ejecución 117610). La regla de no re-preguntar la línea cuando la IA ya la sabe
// existía desde el 4-ago, pero solo en la rama del cliente que YA había autorizado; la del primer
// contacto nació con el muro delante y nunca la tuvo. Con el aviso implícito el primer mensaje ya trae
// veredicto: hay que usarlo.
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
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, prov:{}, esCli:{}, muro:{}, ses:{}, info:{}, cliMsgs:{} });
const ON = { cfg_consent_impl:'si' };
const msg = (t, ia) => ({ wa_id:'573176564621', profileName:'Cliente', texto:t, mtype:'', media_id:'',
                          opcion_id:'', opcion_txt:'', es_media:false, ia:ia||null });
const cuerpo = (r) => { try { return r.wpp_body.text ? r.wpp_body.text.body : r.wpp_body.interactive.body.text; }
                        catch(e) { return ''; } };
// el veredicto REAL que devolvió la IA en la ejecución 117610
const IA_SIKA = { marca:'Ardisa', ciudad:'', nombre:'', tipo_cliente:'desconocido', grupo_pista:'ACABADOS',
  productos:['sellador Sika Polymarflex galón','sellador Sika Polymarflex balde 12 kg'],
  en_alcance:true, pide_humano:false, es_reclamo:false, es_info:false, confianza:'alta',
  acuse:'Claro, buscas el sellador Sika Polymarflex en galón y balde de 12 kg.' };

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det||''))); };

// ══ 1. El caso tal cual: primer mensaje, con producto y línea claros ══
{
  const TXT = 'Buenas tardes , necesito , sellador, sika Polmarflex , precio galon y precio balde 12 kg';
  const r = correr({ datos: msg(TXT, IA_SIKA), sd: base(), pend: ON });
  chequear('NO le pregunta si es Ardisa o Carpincentro (la IA ya lo dijo)',
           !/CARPINCENTRO/.test(cuerpo(r)) && !/¿Cuál eliges/.test(cuerpo(r)), cuerpo(r).slice(0,160));
  chequear('Le pregunta lo que de verdad falta (su nombre)',
           /nombre/i.test(cuerpo(r)), cuerpo(r).slice(0,160));
  chequear('Y le acusa recibo de lo que pidió, con sus palabras',
           /sellador|Polymarflex|Polmarflex/i.test(cuerpo(r)), cuerpo(r).slice(0,200));
  chequear('El aviso de datos sigue saliendo en su mensaje aparte',
           r.hay_pre === true && /Ley 1581/.test(JSON.stringify(r.wpp_pre||'')), JSON.stringify(r.wpp_pre||'').slice(0,120));
  chequear('Y queda la evidencia del consentimiento implícito',
           !!r.consent_log && r.consent_log.canal === 'wa-implicito', JSON.stringify(r.consent_log));
}

// ══ 2. Si la IA NO entiende qué necesita, el menú de marcas sigue ahí (es el último recurso) ══
{
  const r = correr({ datos: msg('Buenas tardes, necesito ayuda', null), sd: base(), pend: ON });
  chequear('Sin veredicto de la IA -> sigue saliendo el menú de marcas',
           /CARPINCENTRO/.test(cuerpo(r)) && r.etapa === 'marca', 'etapa=' + r.etapa + ' ' + cuerpo(r).slice(0,120));
}
{
  const IA_VAGA = { marca:'', ciudad:'', nombre:'', tipo_cliente:'desconocido', grupo_pista:'',
                    productos:[], en_alcance:false, pide_humano:false, es_reclamo:false, es_info:false,
                    confianza:'baja', acuse:'' };
  const r = correr({ datos: msg('Buenas, una pregunta', IA_VAGA), sd: base(), pend: ON });
  chequear('IA que no ve producto -> también el menú (no se inventa una línea)',
           /CARPINCENTRO/.test(cuerpo(r)), cuerpo(r).slice(0,120));
}

// ══ 3. La foto sigue por su camino (ahí la lectura de la imagen manda, no este atajo) ══
{
  const r = correr({ datos: Object.assign(msg('', IA_SIKA), { es_media:true, mtype:'image', media_id:'99' }),
                     sd: base(), pend: ON });
  chequear('Con foto no cambia el flujo de siempre', r.etapa === 'marca', 'etapa=' + r.etapa);
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
