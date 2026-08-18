// LA DEMO NO GASTA TURNO DE ROTACIÓN (2026-08-18, Deicy: "cuando son pruebas no debería enviar a ningún
// asesor, le está quitando la oportunidad de atender clientes reales y algunos quedan con menos").
//
// El aviso de una prueba nunca salía al asesor real —eso ya estaba bien—, pero el TURNO sí se consumía:
// cada demo corría el round-robin y el asesor al que le tocó perdía su cliente siguiente. Con varias
// pruebas al día el reparto se desbalancea solo, y nadie lo ve porque las demos no salen en los informes.
//
// Lo que NO se quita: en la demo se sigue mostrando a quién le habría tocado. Si no, la prueba dejaría de
// probar el ruteo, que es justo para lo que sirve.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{type:'tool_use', input: datos.ia}] } : {}) :
      (pend || {}) }) });
  return new Function('$','$getWorkflowStaticData','$env', CEREBRO)($, () => sd, new Proxy({},{get:()=>''}))[0].json;
}
const DEMO = '573205662947';      // número de pruebas de Deicy
const REAL = '573001112233';
// `demoAdmin` es lo que pone a Deicy en modo clienta (escribe "demo"); sin eso su número recibe el PANEL
// y la prueba pasaría en verde sin haber creado un solo lead.
const base = () => ({ rot:{}, rotDeuda:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, prov:{}, esCli:{}, muro:{}, ses:{}, info:{},
                      cliMsgs:{}, demoAdmin:{ '573205662947': Date.now() } });
const sesion = (nombre) => ({ paso:'detalle', t:Date.now(), consent:true, nombre:nombre, ciudad:'Bucaramanga',
  ciudadId:'BUCARAMANGA', marca:'Ardisa', grupo:'ACABADOS', interes:'Acabados', ocupacion:'🏠 Cliente final' });
const ev = (wa, t) => ({ wa_id:wa, profileName:'Prueba', texto:t, mtype:'', media_id:'',
                         opcion_id:'', opcion_txt:'', es_media:false, ia:null });
const CFG = { cons_si:1, pend_id:0 };
const KEY = 'ARD_BUCARAMANGA_ACABADOS';

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det||''))); };

// ══ 1. Cinco pruebas seguidas dejan el contador donde estaba ══
{
  const sd = base();
  for (let i = 0; i < 5; i++) {
    sd.ses[DEMO] = sesion('Deicy Prueba');
    correr({ datos: ev(DEMO, 'necesito cerámica para el baño ' + i), sd, pend: CFG });
    delete sd.done[DEMO]; delete sd.pendCierre[DEMO]; sd.leads = [];
  }
  chequear('Cinco demos seguidas NO mueven el turno de nadie',
           !sd.rot[KEY], 'contador=' + JSON.stringify(sd.rot));
}

// ══ 2. Pero la demo SÍ dice a quién le habría tocado (si no, no probaría el ruteo) ══
{
  const sd = base(); sd.ses[DEMO] = sesion('Deicy Prueba');
  const r = correr({ datos: ev(DEMO, 'necesito cerámica para el baño'), sd, pend: CFG });
  const lead = r.lead || (sd.pendCierre[DEMO] && sd.pendCierre[DEMO].lead) || {};
  chequear('La prueba igual muestra el asesor que habría atendido',
           !!lead.asesor && lead.asesor.length > 3, JSON.stringify(lead.asesor));
  chequear('Y queda marcada como prueba, no como cliente', lead.modo_prueba === 1, JSON.stringify(lead.modo_prueba));
}

// ══ 3. Un cliente REAL sí avanza el turno (no romper la rotación de verdad) ══
{
  const sd = base(); sd.ses[REAL] = sesion('Cliente Real');
  correr({ datos: ev(REAL, 'necesito cerámica para el baño'), sd, pend: CFG });
  chequear('Un cliente real sí gasta su turno', sd.rot[KEY] === 1, 'contador=' + JSON.stringify(sd.rot));
}

// ══ 4. Y el reparto no se desordena: tras las pruebas, los reales siguen la fila intacta ══
{
  const sd = base();
  const quien = (wa, nom) => {
    sd.ses[wa] = sesion(nom);
    const r = correr({ datos: ev(wa, 'necesito cerámica para el baño'), sd, pend: CFG });
    const lead = r.lead || (sd.pendCierre[wa] && sd.pendCierre[wa].lead) || {};
    delete sd.done[wa]; delete sd.pendCierre[wa]; sd.leads = [];
    return lead.asesor;
  };
  const real1 = quien('573001110001', 'Cliente Uno');
  quien(DEMO, 'Deicy Prueba'); quien(DEMO, 'Deicy Prueba');   // dos pruebas en medio
  const real2 = quien('573001110002', 'Cliente Dos');
  const sd2 = base();
  const otro = (wa, nom) => { sd2.ses[wa] = sesion(nom);
    const r = correr({ datos: ev(wa, 'necesito cerámica para el baño'), sd: sd2, pend: CFG });
    const lead = r.lead || (sd2.pendCierre[wa] && sd2.pendCierre[wa].lead) || {};
    delete sd2.done[wa]; delete sd2.pendCierre[wa]; sd2.leads = [];
    return lead.asesor; };
  const limpio1 = otro('573001110001', 'Cliente Uno');
  const limpio2 = otro('573001110002', 'Cliente Dos');
  chequear('Con pruebas en medio, los clientes reales reciben el MISMO reparto que sin ellas',
           real1 === limpio1 && real2 === limpio2,
           'con pruebas: ' + real1 + ' / ' + real2 + '   ·   sin pruebas: ' + limpio1 + ' / ' + limpio2);
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
