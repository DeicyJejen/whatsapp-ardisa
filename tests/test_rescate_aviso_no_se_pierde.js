// Caso Diana María López (lead #240, 06/08): pidió "120 varillas de media", el rescate la cerró a Miguel...
// y Miguel JAMÁS recibió la tarjeta. En la ruta diferida el candado choca con el PROPIO lead del cierre
// (el armado lo inserta como red de seguridad; el finalizador lo encuentra "ya existente") y el nodo
// "Redirigir al asesor original" trataba "mismo asesor" como tarjeta repetida -> return [] -> aviso perdido.
//
// Regla desde hoy: en la ruta diferida, mismo asesor => la tarjeta original sale COMPLETA (nunca ha salido).
// Asesor distinto => se redirige la info nueva al asesor original (comportamiento de siempre).
const fs = require('fs');
const CODIGO = fs.readFileSync(__dirname + '/n_redirigir.js', 'utf8');

const MIGUEL = '573182988592', YORMY = '573173636561', MONITOR = '573205662947';
const FZ = {   // lo que armó "Finalizar cierre" para el cierre de Diana
  lead: { nombre:'Diana María López Martínez', telefono:'573504607453', detalle:'120 varillas de media' },
  aviso_body: { messaging_product:'whatsapp', to:MIGUEL, type:'text',
                text:{ body:'🔔 *Nuevo cliente para atender*\n👤 Diana María López Martínez\n📝 120 varillas de media' } },
  aviso_medias: [ { messaging_product:'whatsapp', to:MONITOR, type:'text', text:{ body:'🔁 COPIA DE MONITOREO' } } ],
};

function correr(asesorBD) {
  const $ = (n) => ({ first: () => ({ json: FZ }) });
  const $input = { all: () => [{ json: { asesor_tel: asesorBD } }] };
  return new Function('$', '$input', CODIGO)($, $input);
}

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det||''))); };

// ══ 1. MISMO asesor (caso Diana): la tarjeta COMPLETA sale hacia Miguel ═══════
{
  const out = correr(MIGUEL);
  const tarjetas = out.filter(i => i.json.media && String(i.json.media.to) === MIGUEL);
  chequear('La tarjeta original SÍ sale hacia el mismo asesor (antes: return [])',
           tarjetas.length >= 1 && JSON.stringify(tarjetas[0]).includes('120 varillas'),
           JSON.stringify(out).slice(0, 200));
  chequear('Y la copia de monitoreo viaja con ella',
           out.some(i => i.json.media && String(i.json.media.to) === MONITOR),
           JSON.stringify(out).slice(0, 200));
}

// ══ 2. Asesor DISTINTO: se redirige la info nueva al asesor original (como siempre) ══
{
  const out = correr(YORMY);
  chequear('Con otro asesor en la BD, la info se redirige a ÉL',
           out.length >= 1 && String(out[0].json.media.to) === YORMY &&
           JSON.stringify(out[0]).includes('más información'),
           JSON.stringify(out).slice(0, 200));
  chequear('Y nada le llega al asesor equivocado',
           !out.some(i => String((i.json.media||{}).to) === MIGUEL),
           JSON.stringify(out).slice(0, 200));
}

// ══ 3. Sin asesor en la BD: no se envía nada (no hay a quién) ═════════════════
{
  const out = correr('');
  chequear('Sin asesor en la BD, el nodo no manda nada', Array.isArray(out) && out.length === 0,
           JSON.stringify(out));
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
