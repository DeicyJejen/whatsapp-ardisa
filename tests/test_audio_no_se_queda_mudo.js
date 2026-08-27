// PRUEBA: un AUDIO (o un documento) esperando a un asesor con la ventana de 24 h cerrada no puede quedarse
// mudo. Caso real del 27-ago-2026: una nota de voz de un cliente llevaba 20 horas en la cola de una asesora
// y el bot no había mandado ni una plantilla de destrabe desde el 19-ago.
//
// La causa: el 19-ago se encendió la plantilla con encabezado de IMAGEN (`config.tpl_foto`). Desde entonces
// TODA cola con la ventana cerrada entraba por esa rama y salía con un `continue` seco. La foto salía; lo
// que la plantilla no puede cargar —un audio, un PDF— se guardaba otra vez y NUNCA llegaba al bloque del
// empujón, que vive más abajo. Con la plantilla apagada el empujón sí salía: encenderla apagó el aviso.
//
// Regla que fija esta prueba: con la plantilla encendida, si en la cola queda algo que NO es foto y NO es
// texto, el asesor recibe el empujón igual. Los textos sueltos no lo disparan (se limpian solos a las 24 h).
const fs = require('fs');
const INACTIVOS = fs.existsSync(__dirname + '/n_inactivos.js') ? fs.readFileSync(__dirname + '/n_inactivos.js', 'utf8') : null;

const ASE = '573000000009';           // asesor ficticio (ventana cerrada: sd.win queda vacío)
const DIA = 24 * 3600000;
const S = (x) => JSON.stringify(x || '');

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det || ''))); };

const base = () => ({ ses:{}, done:{}, win:{}, mediaPend:{}, mediaNudge:{}, segPend:{}, segRemDay:{},
                      pendCierre:{}, holdAviso:[], leads:[], rescate:{}, migSeg2407b:1 });
// `store.cfg.tplFoto` es el respaldo que el Cerebro le deja al cron con el nombre de la plantilla aprobada
// (en el bot vivo lo lee además de la BD, vía $input, que este arnés no expone). Encenderlo aquí = plantilla ON.
const correr = (sd, tpl) => { sd.cfg = { tplFoto: (tpl || '') };
  return new Function('$', '$getWorkflowStaticData', '$env', INACTIVOS)(
    () => ({ first: () => ({ json: {} }) }), () => sd, new Proxy({}, { get: () => '' })); };

let _n = 0;
const item = (tipo, cliente, horas, extra) => { const id = '888000' + (++_n);
  const m = { messaging_product:'whatsapp', to: ASE, type: tipo };
  if (tipo === 'text') m.text = { body: extra || 'nota suelta' }; else m[tipo] = { id: id };
  return { m: m, cliente: cliente, t: Date.now() - horas * 3600000 }; };

const nudges = (out) => (out || []).filter(x => x && x.json && x.json.chat && x.json.chat.etapa === 'media_nudge');
const fotosTpl = (out) => (out || []).filter(x => x && x.json && x.json.msg && x.json.msg.type === 'template'
                                             && x.json.msg.template && x.json.msg.template.name === 'foto_cliente');

if (!INACTIVOS) { console.log('  OK   | (n_inactivos.js no disponible en este arnés)'); process.exit(0); }

// ══ 1. EL CASO REAL: foto + audio en la misma cola, plantilla encendida ═══════════════════
{
  const sd = base();
  sd.mediaPend[ASE] = [ item('image', 'Cliente Foto', 20), item('audio', 'Alejandro Q.', 20) ];
  const out = correr(sd, 'foto_cliente');
  chequear('La foto sale por plantilla (esto ya funcionaba)', fotosTpl(out).length === 1, S(fotosTpl(out).length));
  chequear('El AUDIO dispara el empujón al asesor', nudges(out).length === 1,
           'salidas: ' + S((out || []).map(x => x.json && x.json.chat && x.json.chat.etapa)));
  chequear('Y el audio SIGUE en la cola (no se pierde al empujar)',
           (sd.mediaPend[ASE] || []).length === 1 && sd.mediaPend[ASE][0].m.type === 'audio',
           S((sd.mediaPend[ASE] || []).map(x => x.m.type)));
  chequear('Queda anotado el empujón para no repetirlo en 24 h', !!sd.mediaNudge[ASE], S(sd.mediaNudge));
}

// ══ 2. Solo FOTOS: no se molesta al asesor, ya le salieron por plantilla ══════════════════
{
  const sd = base();
  sd.mediaPend[ASE] = [ item('image', 'Cliente Foto', 20), item('image', 'Otro Cliente', 30) ];
  const out = correr(sd, 'foto_cliente');
  chequear('Dos fotos salen por plantilla', fotosTpl(out).length === 2, S(fotosTpl(out).length));
  chequear('Sin empujón: no queda nada esperando', nudges(out).length === 0, S(nudges(out).length));
  chequear('La cola del asesor queda vacía', !sd.mediaPend[ASE], S(sd.mediaPend[ASE]));
}

// ══ 3. Solo TEXTOS: tampoco se molesta al asesor (se limpian solos a las 24 h) ════════════
{
  const sd = base();
  sd.mediaPend[ASE] = [ item('text', 'Jefer R.', 20, 'también escribió: ¿tienen en Bogotá?') ];
  const out = correr(sd, 'foto_cliente');
  chequear('Un texto suelto NO gasta una plantilla de destrabe', nudges(out).length === 0,
           'salidas: ' + S((out || []).map(x => x.json && x.json.chat && x.json.chat.etapa)));
  chequear('Pero el texto sigue guardado hasta que cumpla las 24 h',
           (sd.mediaPend[ASE] || []).length === 1, S(sd.mediaPend[ASE]));
}

// ══ 4. Documento solo, sin ninguna foto de por medio ═════════════════════════════════════
{
  const sd = base();
  sd.mediaPend[ASE] = [ item('document', 'Arq. Omar', 30) ];
  const out = correr(sd, 'foto_cliente');
  chequear('Un PDF esperando 30 h también dispara el empujón', nudges(out).length === 1,
           'salidas: ' + S((out || []).map(x => x.json && x.json.chat && x.json.chat.etapa)));
}

// ══ 5. El empujón no se repite antes de 24 h ═════════════════════════════════════════════
{
  const sd = base();
  sd.mediaPend[ASE] = [ item('audio', 'Alejandro Q.', 20) ];
  sd.mediaNudge[ASE] = Date.now() - 2*3600000;      // ya se le empujó hace 2 horas
  const out = correr(sd, 'foto_cliente');
  chequear('Con un empujón reciente no se manda otro', nudges(out).length === 0, S(nudges(out).length));
  sd.mediaNudge[ASE] = Date.now() - 2*DIA;          // el último fue hace 2 días
  const out2 = correr(sd, 'foto_cliente');
  chequear('Pasadas 24 h sí se vuelve a empujar', nudges(out2).length === 1, S(nudges(out2).length));
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
