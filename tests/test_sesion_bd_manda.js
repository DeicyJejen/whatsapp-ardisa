// Caso Sonia Duran (lead #234, 06/08 8:35 am): "preguntó dos veces lo mismo, está fallando".
// La ejecución LENTA de otro cliente (IA, 7.4s) leyó el staticData viejo y al guardar PISÓ el avance de
// Sonia: ella ya iba en 'ciudad' y la carrera la devolvió a 'nombre' -> el bot le repitió nombre y ciudad.
//
// Cura: la tabla `sesiones` (una fila POR CLIENTE) viaja en la consulta PEND como ses_bd. El Cerebro
// compara t: si la BD trae una sesión MÁS NUEVA que la del caché pisado, manda la BD. Doctrina de siempre.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{type:'tool_use', input: datos.ia}] } : {}) :
      (pend || {}) }) });
  return new Function('$','$getWorkflowStaticData','$env', CEREBRO)($, () => sd, new Proxy({},{get:()=>''}))[0].json;
}
const WA = '573105569664';
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, muro:{}, ses:{},
                      info:{}, cliMsgs:{} });
const ev = (o) => Object.assign({ wa_id:WA, profileName:'Sonia Duran', texto:'', mtype:'', media_id:'',
                                  opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det||''))); };

const NOW = Date.now();

// ══ 1. LA CARRERA DE SONIA: staticData pisado (viejo, en 'nombre') + BD al día (en 'ciudad') ══
{
  const sd = base();
  // el blob compartido quedó VIEJO: la carrera borró el avance (así lo dejó la ejecución lenta)
  sd.ses[WA] = { paso:'nombre', t: NOW-60000, consent:true, marca:'Ardisa' };
  // la BD tiene la fila propia de Sonia, MÁS NUEVA: nombre aceptado, esperando ciudad
  const sesBD = JSON.stringify({ paso:'ciudad', t: NOW-9000, consent:true, marca:'Ardisa', nombre:'Sonia Duran' });
  const r = correr({ datos: ev({ texto:'Bucaramanga' }), sd, pend:{ cons_si:1, pend_id:0, ses_bd:sesBD } });
  chequear('Con la BD al día, "Bucaramanga" AVANZA (no vuelve a preguntar el nombre)',
           r.etapa === 'ocuArd', 'etapa=' + r.etapa + ' body=' + JSON.stringify(r.wpp_body||'').slice(0,100));
  chequear('Y el nombre aceptado sobrevive a la carrera',
           /Sonia/.test(JSON.stringify(sd.ses[WA]||{})), JSON.stringify(sd.ses[WA]||{}).slice(0,120));
}

// ══ 2. AL REVÉS: el staticData va ADELANTE de la BD -> gana el staticData (t más nuevo) ══
{
  const sd = base();
  sd.ses[WA] = { paso:'ciudad', t: NOW-2000, consent:true, marca:'Ardisa', nombre:'Sonia Duran' };
  const sesBD = JSON.stringify({ paso:'nombre', t: NOW-60000, consent:true, marca:'Ardisa' });
  const r = correr({ datos: ev({ texto:'Bucaramanga' }), sd, pend:{ cons_si:1, pend_id:0, ses_bd:sesBD } });
  chequear('Si el caché va adelante, la BD vieja NO lo devuelve',
           r.etapa === 'ocuArd', 'etapa=' + r.etapa);
}

// ══ 3. Sin fila en la BD (cliente nuevo): todo funciona como siempre ══
{
  const sd = base();
  sd.ses[WA] = { paso:'ciudad', t: NOW-2000, consent:true, marca:'Ardisa', nombre:'Sonia Duran' };
  const r = correr({ datos: ev({ texto:'Bucaramanga' }), sd, pend:{ cons_si:1, pend_id:0, ses_bd:'' } });
  chequear('Sin ses_bd el flujo es el de siempre', r.etapa === 'ocuArd', 'etapa=' + r.etapa);
}

// ══ 4. ses_bd corrupto no tumba el bot ══
{
  const sd = base();
  sd.ses[WA] = { paso:'ciudad', t: NOW-2000, consent:true, marca:'Ardisa', nombre:'Sonia Duran' };
  const r = correr({ datos: ev({ texto:'Bucaramanga' }), sd, pend:{ cons_si:1, pend_id:0, ses_bd:'{basura' } });
  chequear('JSON roto en la BD -> se ignora y el flujo sigue', r.etapa === 'ocuArd', 'etapa=' + r.etapa);
}

// ══ 5. La sesión viaja de vuelta para persistirse (ses_tel + ses_out) ══
{
  const sd = base();
  sd.ses[WA] = { paso:'ciudad', t: NOW-2000, consent:true, marca:'Ardisa', nombre:'Sonia Duran' };
  const r = correr({ datos: ev({ texto:'Bucaramanga' }), sd, pend:{ cons_si:1, pend_id:0 } });
  chequear('El Cerebro devuelve ses_tel y ses_out para el nodo que escribe en la BD',
           r.ses_tel === WA && typeof r.ses_out === 'string' && /ocuArd/.test(r.ses_out),
           'ses_tel=' + r.ses_tel + ' ses_out=' + String(r.ses_out).slice(0,100));
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
