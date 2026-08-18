// CASO ILBA MATEUS (18-ago-2026) — la conversación que Deicy mandó completa.
//
//  1:03 pm  "Necesito círculos de madera para zapatero giratorio" -> "Tu solicitud quedó registrada"
//  1:08 pm  "A qué hora?"          -> ❌ "Recibido Ilba. Ya se lo pasamos a Karime…"
//  1:28 pm  "Mi? Si contestan hoy" -> ❌ la MISMA respuesta
//  1:29 pm  (reenvía nuestro mensaje, molesta) -> ❌ la MISMA respuesta, dos veces
//  1:29 pm  "Solo contestan eso"
//
// Preguntar CUÁNDO no es agregarle un detalle al pedido: es esperar. Y "dentro del horario de atención"
// no responde "¿a qué hora?" — el cliente ya sabe que hay un horario, lo que quiere es saber cuál.
// Tres arreglos: la pregunta de tiempo cae en el carril de quien espera, se le dice el horario de SU
// marca, y el mensaje que nos reenvía no se trata como información nueva.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{type:'tool_use', input: datos.ia}] } : {}) :
      (pend || {}) }) });
  return new Function('$','$getWorkflowStaticData','$env', CEREBRO)($, () => sd, new Proxy({},{get:()=>''}))[0].json;
}
const WA = '573125758845';
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, prov:{}, esCli:{}, muro:{}, ses:{}, info:{}, cliMsgs:{} });
// Ilba, ya cerrada, con Karime asignada (Carpincentro / Patio Bonito Bogotá)
const cerrada = (extra) => Object.assign({ paso:'cerrado', t:Date.now(), closedAt:Date.now()-5*60000, consent:true,
  nombre:'Ilba Mateus', ciudad:'Bogotá', marca:'Carpincentro', ocupacion:'🏠 Cliente final',
  detalle:'Necesito círculos de madera para zapatero giratorio', tiposol:'Cotización / Info',
  asesorNom:'Karime Vannesa', asesorF:1, destino:'573174293535' }, extra||{});
const ev = (t) => ({ wa_id:WA, profileName:'Ilba Mateus', texto:t, mtype:'', media_id:'',
                     opcion_id:'', opcion_txt:'', es_media:false, ia:null });
const CFG = { cons_si:1, pend_id:0 };
const cuerpo = (r) => { try { return r.wpp_body.text ? r.wpp_body.text.body : r.wpp_body.interactive.body.text; }
                        catch(e) { return ''; } };

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det||''))); };

// ══ 1. "A qué hora?" -> se le dice el horario, no "ya se lo pasamos" ══
{
  const sd = base(); sd.ses[WA] = cerrada();
  const r = correr({ datos: ev('A qué hora?'), sd, pend: CFG });
  chequear('"A qué hora?" NO se le suma a la solicitud como si fuera un detalle',
           r.etapa !== 'adicion' && !/Ya se lo pasamos/i.test(cuerpo(r)), 'etapa=' + r.etapa + ' ' + cuerpo(r).slice(0,110));
  chequear('Se le responde el HORARIO de Carpincentro, que es su marca',
           /8:00 a\.m\. – 5:00 p\.m\./.test(cuerpo(r)) && /12:00 m\./.test(cuerpo(r)), cuerpo(r).slice(0,220));
  chequear('Y se le dice que su solicitud está priorizada con su asesora',
           /priorizada/i.test(cuerpo(r)) && /Karime/.test(cuerpo(r)), cuerpo(r).slice(0,160));
  // Decisión de Deicy del 11-ago (caso Alfonso Crismatt): a quien esperó y lo dice SÍ se le cuenta que le
  // recordamos a su asesora — y es verdad, el recordatorio sale en el mismo mensaje. No se le promete hora.
  chequear('A la asesora le llega el recordatorio de que el cliente insiste',
           r.hay_aviso === true && /el cliente insiste/i.test(JSON.stringify(r.aviso_body||'')),
           JSON.stringify(r.aviso_body||'').slice(0,160));
  chequear('Y no se le promete una hora que no controlamos',
           !/en (\d+|una|media) (minuto|hora)/i.test(cuerpo(r)), cuerpo(r).slice(0,200));
}

// ══ 2. Un cliente de ARDISA recibe el horario de Ardisa (Lun–Sáb, sin la media jornada del sábado) ══
{
  const sd = base(); sd.ses[WA] = cerrada({ marca:'Ardisa', asesorNom:'María Delia Archila', ciudad:'Bucaramanga' });
  const r = correr({ datos: ev('¿cuándo me contactan?'), sd, pend: CFG });
  chequear('Ardisa: horario Lun–Sáb, sin el corte del sábado a mediodía',
           /Lun–Sáb/.test(cuerpo(r)) && !/12:00 m\./.test(cuerpo(r)), cuerpo(r).slice(0,200));
}

// ══ 3. El eco: la clienta reenvía NUESTRO propio mensaje ══
{
  const sd = base();
  const ultimo = 'Recibido Ilba. ✅ Ya se lo pasamos a *Karime Vannesa* para que lo tenga en cuenta en tu solicitud. 🤝';
  sd.ses[WA] = cerrada({ lastOut: ultimo });
  const r = correr({ datos: ev(ultimo), sd, pend: CFG });
  chequear('Nuestro propio mensaje reenviado NO se trata como un detalle nuevo',
           r.etapa !== 'adicion', 'etapa=' + r.etapa);
  chequear('Y NO se le reenvía a la asesora como si el cliente hubiera aportado algo',
           !/agregó/i.test(JSON.stringify(r.aviso_body||'')), JSON.stringify(r.aviso_body||'').slice(0,120));
  chequear('Se le responde algo distinto, no la misma frase otra vez',
           cuerpo(r) !== ultimo && !/Ya se lo pasamos/.test(cuerpo(r)), cuerpo(r).slice(0,140));
}

// ══ 4. Lo que SÍ es una adición sigue funcionando (no romper lo que ya servía) ══
{
  const sd = base(); sd.ses[WA] = cerrada();
  const r = correr({ datos: ev('los círculos los necesito de 30 cm de diámetro'), sd, pend: CFG });
  chequear('Un dato real del pedido sí se le suma y se le confirma',
           r.etapa === 'adicion' && /Ya se lo pasamos/i.test(cuerpo(r)), 'etapa=' + r.etapa + ' ' + cuerpo(r).slice(0,90));
  chequear('Y ese dato sí le llega a la asesora',
           /30 cm/.test(JSON.stringify(r.aviso_body||'')), JSON.stringify(r.aviso_body||'').slice(0,140));
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
