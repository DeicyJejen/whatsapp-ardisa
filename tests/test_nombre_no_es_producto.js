// CLIENTA DEL SELLADOR SIKA (18-ago-2026, 4:08 pm) — el paso del nombre tragaba cualquier cosa.
//
//   Bot:     👤 ¿Nos confirmas tu nombre y apellido?
//   Clienta: "es aellador para concreto"        <- estaba aclarando el PRODUCTO
//   Bot:     "Gracias, Es. 📍 ¿En qué ciudad te encuentras?"
//
// Quedó registrada como "Es Aellador Para Concreto" y se fue sin terminar. Su nombre estaba a la vista
// desde el primer mensaje: el perfil de WhatsApp decía Rebeca.
//
// Tres arreglos: el filtro de nombres mira el vocabulario del catálogo (solo desde tres palabras, para no
// rebotar a un Juan Pino o una Ana Madera), lo que escribió NO se pierde —se suma a su solicitud— y a la
// segunda insistencia se usa el nombre del perfil en vez de seguir preguntando.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{type:'tool_use', input: datos.ia}] } : {}) :
      (pend || {}) }) });
  return new Function('$','$getWorkflowStaticData','$env', CEREBRO)($, () => sd, new Proxy({},{get:()=>''}))[0].json;
}
const WA = '573176564621';
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, prov:{}, esCli:{}, muro:{}, ses:{}, info:{}, cliMsgs:{} });
const enNombre = (extra) => Object.assign({ paso:'nombre', t:Date.now(), consent:true, marca:'Ardisa',
  grupo:'ACABADOS', interes:'Acabados', detalle:'sellador sika polymarflex galón y balde 12 kg' }, extra||{});
const ev = (t, perfil) => ({ wa_id:WA, profileName:(perfil===undefined?'Rebeca Nw':perfil), texto:t, mtype:'',
                             media_id:'', opcion_id:'', opcion_txt:'', es_media:false, ia:null });
const CFG = { cons_si:1, pend_id:0 };
const cuerpo = (r) => { try { return r.wpp_body.text ? r.wpp_body.text.body : r.wpp_body.interactive.body.text; }
                        catch(e) { return ''; } };

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det||''))); };

// ══ 1. El caso exacto ══
{
  const sd = base(); sd.ses[WA] = enNombre();
  const r = correr({ datos: ev('es aellador para concreto'), sd, pend: CFG });
  chequear('"es aellador para concreto" NO se acepta como nombre',
           r.etapa === 'nombre' && !sd.ses[WA].nombre, 'etapa=' + r.etapa + ' nombre=' + sd.ses[WA].nombre);
  chequear('Y lo que dijo se le suma a la solicitud, no se descarta',
           /aellador para concreto/i.test(JSON.stringify(sd.ses[WA]||{})), JSON.stringify(sd.ses[WA]||{}).slice(0,220));
  chequear('Se le vuelve a pedir el nombre sin regañarlo',
           /nombre y apellido/i.test(cuerpo(r)), cuerpo(r).slice(0,120));
}

// ══ 2. A la segunda, se usa el nombre de su perfil de WhatsApp (lo teníamos desde el principio) ══
{
  const sd = base(); sd.ses[WA] = enNombre();
  correr({ datos: ev('es aellador para concreto'), sd, pend: CFG });
  const r2 = correr({ datos: ev('para pegar concreto en el piso'), sd, pend: CFG });
  chequear('Segundo intento fallido -> toma "Rebeca Nw" del perfil y AVANZA',
           sd.ses[WA].nombre === 'Rebeca Nw' && r2.etapa !== 'nombre',
           'nombre=' + sd.ses[WA].nombre + ' etapa=' + r2.etapa);
}
{
  // Sin perfil utilizable no se inventa nada: se sigue preguntando.
  const sd = base(); sd.ses[WA] = enNombre();
  correr({ datos: ev('es sellador para concreto', ''), sd, pend: CFG });
  const r2 = correr({ datos: ev('para el piso', ''), sd, pend: CFG });
  chequear('Sin nombre en el perfil, se sigue preguntando (no se inventa)',
           r2.etapa === 'nombre' && !sd.ses[WA].nombre, 'etapa=' + r2.etapa + ' nombre=' + sd.ses[WA].nombre);
}

// ══ 3. Los nombres de verdad siguen pasando — incluidos los que suenan a producto ══
{
  const casos = [['Rebeca Restrepo', true], ['Juan Pino', true], ['Ana Madera', true],
                 ['Deicy Jejen', true], ['María Delia Archila Lizarazo', true],
                 ['Mi nombre es Carlos Conde', true],
                 ['necesito cemento gris', false], ['es aellador para concreto', false],
                 ['quiero cotizar melamina', false]];
  let bien = 0, fallan = [];
  for (const [t, esperado] of casos) {
    const sd = base(); sd.ses[WA] = enNombre();
    correr({ datos: ev(t), sd, pend: CFG });
    const paso = !!sd.ses[WA].nombre;
    if (paso === esperado) bien++; else fallan.push(t + ' -> ' + (sd.ses[WA].nombre || 'rebotado'));
  }
  chequear('Nombres reales pasan (Juan Pino, Ana Madera) y las frases de producto no',
           bien === casos.length, fallan.join(' | '));
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
