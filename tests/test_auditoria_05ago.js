// Auditoría del 05/08 — cinco formas distintas de PERDER a un cliente, todas por el mismo patrón:
// una regex escrita de memoria decidiendo ANTES que la IA, o sin cubrir cómo escribe la gente de verdad.
//
//   1. El jefe de compras que quiere COMPRARNOS 500 bultos -> lo tratábamos de proveedor y lo echábamos.
//   2. "Gracias, ¿manejan tejas?" tras cerrar -> "fue un placer": el asesor nunca veía las tejas.
//   3. "bogota" sin tilde -> el menú se repetía para siempre ("bogotá" sí pasaba).
//   4. Escribe qué necesita y luego manda foto -> se borraba lo que había escrito.
//   5. Tras cerrar manda "50" (la cantidad) -> se descartaba en silencio.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{type:'tool_use', input: datos.ia}] } : {}) :
      (pend || {}) }) });
  return new Function('$','$getWorkflowStaticData','$env', CEREBRO)($, () => sd, new Proxy({},{get:()=>''}))[0].json;
}
const WA = '573001112233';
const base = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                      segPend:{}, pendCierre:{}, rescate:{}, compras:{}, empleo:{}, muro:{}, ses:{},
                      info:{}, cliMsgs:{} });
const ev = (o) => Object.assign({ wa_id:WA, profileName:'Cliente', texto:'', mtype:'', media_id:'',
                                  opcion_id:'', opcion_txt:'', es_media:false, ia:null }, o);
const IA = (prods, marca, grupo, conf) => ({ en_alcance:true, marca:marca||'Ardisa', grupo_pista:grupo||'',
  productos:prods, confianza:conf||'alta', es_info:false, es_reclamo:false });
const cerrada = () => ({ paso:'cerrado', t:Date.now()-10*60000, closedAt:Date.now()-10*60000, consent:true,
  nombre:'Carlos Pérez', ciudad:'Bucaramanga', ciudadId:'BUCARAMANGA', marca:'Ardisa',
  grupo:'CONSTRUCCION', asesorNom:'Yormy', destino:'573001234567' });

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det||''))); };

// ══ 1. EL COMPRADOR B2B NO ES UN PROVEEDOR ══════════════════════════════════════
{
  const sd = base();
  const r = correr({ datos: ev({ texto:'Buenas, le escribo del área de compras de la constructora Andina, necesito cotización de 500 bultos de cemento gris',
                                 ia:IA(['cemento gris'],'Ardisa','CONSTRUCCION') }), sd, pend:{ cons_si:1 } });
  chequear('Jefe de compras que NOS COMPRA sigue el flujo normal', r.etapa !== 'compras' && r.etapa !== 'proveedor',
           'etapa=' + r.etapa);
}
{
  // Aunque le hubiéramos preguntado, su respuesta lo destapa como cliente y NO recibe MSG_PROVEEDOR.
  const sd = base(); sd.compras[WA] = Date.now() - 60000;
  const r = correr({ datos: ev({ texto:'Somos una constructora y queremos comprarles cemento gris',
                                 ia:IA(['cemento gris'],'Ardisa','CONSTRUCCION') }), sd, pend:{ cons_si:1 } });
  chequear('"SOMOS ... y queremos COMPRARLES" no es proveedor', r.etapa !== 'proveedor', 'etapa=' + r.etapa);
}
{
  // NEGATIVO: el proveedor de verdad se sigue detectando igual que siempre.
  const sd = base();
  // (ojo: "para ofrecerles nuestros productos" cae ANTES en la rama de Servicio al Cliente — así era
  //  desde antes de este arreglo y también es un destino correcto para un proveedor)
  for (const frase of ['Quiero ser proveedor de ustedes', 'Deseo inscribirme como proveedor',
                       'Quiero hablar con compras', 'necesito el contacto de compras']) {
    const s2 = base();
    const r2 = correr({ datos: ev({ texto:frase }), sd:s2, pend:{ cons_si:1 } });
    chequear('El proveedor de verdad se sigue detectando: "' + frase.slice(0,32) + '"',
             r2.etapa === 'compras', 'etapa=' + r2.etapa);
  }
}
{
  const sd = base(); sd.compras[WA] = Date.now() - 60000;
  const r = correr({ datos: ev({ texto:'Somos fabricantes de herrajes y queremos presentarles nuestro portafolio' }),
                     sd, pend:{ cons_si:1 } });
  chequear('Y su respuesta lo manda a proveedor', r.etapa === 'proveedor', 'etapa=' + r.etapa);
}

// ══ 2. LA CORTESÍA NO SE TRAGA LA CONSULTA NUEVA ════════════════════════════════
for (const frase of ['Gracias, me confirmas si manejan tejas de zinc?',
                     'Gracias! ¿Y tendrán drywall?',
                     'Gracias, y hay cemento blanco?',
                     'Muy amable, me regala el precio de la teja']) {
  const sd = base(); sd.ses[WA] = cerrada();
  const r = correr({ datos: ev({ texto:frase, ia:IA(['teja de zinc'],'Ardisa','CONSTRUCCION') }), sd, pend:{ cons_si:1 } });
  chequear('No se despide: "' + frase.slice(0,36) + '"', r.etapa !== 'cortesia', 'etapa=' + r.etapa);
}
{
  // NEGATIVO: un "gracias" pelado SIGUE siendo una despedida (no le reiniciamos el flujo).
  for (const frase of ['Muchas gracias!', 'Listo, muy amable', 'Gracias, quedo atento']) {
    const sd = base(); sd.ses[WA] = cerrada();
    const r = correr({ datos: ev({ texto:frase }), sd, pend:{ cons_si:1 } });
    chequear('"' + frase + '" sigue siendo despedida', r.etapa === 'cortesia', 'etapa=' + r.etapa);
  }
}

// ══ 3. TILDES: el colombiano escribe sin ellas ══════════════════════════════════
for (const [con, sin, id] of [['bogotá','bogota','BOGOTA'], ['ibagué','ibague','IBAGUE']]) {
  const mk = (t) => { const sd = base();
    sd.ses[WA] = { paso:'ciudad', t:Date.now(), consent:true, nombre:'Ana Gómez', marca:'Carpincentro' };
    correr({ datos: ev({ texto:t }), sd, pend:{ cons_si:1 } }); return (sd.ses[WA]||{}).ciudadId; };
  chequear('"' + sin + '" (sin tilde) llega a la misma ciudad que "' + con + '"',
           mk(sin) === mk(con) && mk(sin) === id, 'sin=' + mk(sin) + ' con=' + mk(con));
}
{
  const mk = (t) => { const sd = base();
    sd.ses[WA] = { paso:'confirmGrupo', t:Date.now(), consent:true, nombre:'Ana Gómez', ciudad:'Bucaramanga',
                   ciudadId:'BUCARAMANGA', marca:'Ardisa', ocupacion:'🏠 Cliente final' };
    return correr({ datos: ev({ texto:t }), sd, pend:{ cons_si:1 } }).etapa; };
  chequear('"construccion" sin tilde también cierra', mk('construccion') === mk('construcción'),
           'sin=' + mk('construccion') + ' con=' + mk('construcción'));
}

// ══ 4. LA FOTO NO BORRA LO QUE EL CLIENTE ESCRIBIÓ ══════════════════════════════
{
  const NOTA = 'necesito una cotización para remodelar mi baño completo';
  const sd = base();
  sd.ses[WA] = { paso:'marca', t:Date.now(), consent:true, notas:NOTA };
  correr({ datos: ev({ es_media:true, mtype:'image', media_id:'MID1',
                       ia:IA(['sanitario','grifería'],'Ardisa','ACABADOS') }), sd, pend:{ cons_si:1 } });
  chequear('Manda foto y NO se pierden sus palabras', (sd.ses[WA]||{}).notas === NOTA,
           'notas=' + JSON.stringify((sd.ses[WA]||{}).notas));
}

// ══ 5. EL NÚMERO SUELTO TRAS CERRAR TAMBIÉN SE LE SUMA ══════════════════════════
for (const t of ['3105551234', '50', '120', '1.83 x 2.44']) {
  const sd = base(); sd.ses[WA] = cerrada();
  const r = correr({ datos: ev({ texto:t }), sd, pend:{ cons_si:1 } });
  chequear('"' + t + '" tras cerrar le llega al asesor', r.etapa === 'adicion' && !!r.aviso_body,
           'etapa=' + r.etapa + ' aviso=' + !!r.aviso_body);
}
{
  // NEGATIVO: un dígito suelto (toque de menú perdido) sigue sin molestar al asesor.
  const sd = base(); sd.ses[WA] = cerrada();
  const r = correr({ datos: ev({ texto:'1' }), sd, pend:{ cons_si:1 } });
  chequear('Un dígito suelto NO se le reenvía', r.etapa !== 'adicion', 'etapa=' + r.etapa);
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
