// REGISTRO DE ENTREGAS (25-ago-2026) — y la primera prueba del nodo "Extraer datos".
//
// Decisión de Deicy: "lo que a nosotros nos importa es que le llegue". Pero hasta hoy, de una tarjeta
// enviada a un asesor solo podíamos decir "Meta la aceptó", que NO es lo mismo que "le llegó al teléfono".
// WhatsApp avisa cada entrega/lectura/rebote con `statuses` en vez de `messages`; esos avisos entraban al
// webhook y se botaban (8 por hora, sin uso). Ahora se reconocen y se guardan en la tabla `entregas`.
//
// Esta prueba fija las dos mitades del borde de entrada:
//   1) un aviso de estado se reconoce y trae sus campos (id, destinatario, estado, hora, motivo del rebote);
//   2) un mensaje de cliente sigue entrando como siempre, y lo que no es ni lo uno ni lo otro se descarta.
// El nodo "Extraer datos" no tenía NINGUNA prueba: todas las demás fabrican su entrada a mano y por eso un
// cambio ahí (el BSUID, el botón de plantilla, el tipo de mensaje) podía romper el bot con la suite en verde.
const fs = require('fs'), path = require('path');
const RAIZ = path.join(__dirname, '..');

const src = fs.readFileSync(path.join(RAIZ, 'build_f1.py'), 'utf8');
const ini = src.indexOf('CODE_EXTRAER = r"""');
if (ini < 0) { console.log('  FALLA | no se encontró CODE_EXTRAER en build_f1.py'); process.exit(1); }
const desde = ini + 'CODE_EXTRAER = r"""'.length;
const CODE = src.slice(desde, src.indexOf('"""', desde)).replace('__USAR_IA__', 'true');

const extraer = (payload) => {
  const $input = { first: () => ({ json: payload }) };
  return new Function('$input', '$env', CODE)($input, new Proxy({}, { get: () => '' }))[0].json;
};
const valor = (v) => ({ body: { entry: [{ changes: [{ value: v }] }] } });

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det || ''))); };

// ── 1. Los avisos de entrega de Meta ────────────────────────────────────────
{
  const r = extraer(valor({ messaging_product: 'whatsapp', statuses: [
    { id: 'wamid.BBB', status: 'delivered', timestamp: '1787670000', recipient_id: '573174293535' }] }));
  chequear('Un aviso de ENTREGA se reconoce (no se bota como antes)',
           r.es_estado === true && r.es_mensaje === false, JSON.stringify(r));
  chequear('Y trae el mensaje, el destinatario y el estado',
           r.est_msg_id === 'wamid.BBB' && r.est_wa_id === '573174293535' && r.est_estado === 'delivered',
           JSON.stringify(r));
  chequear('La hora de Meta (segundos) se convierte a fecha para MySQL',
           /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(r.est_ts)), 'ts=' + r.est_ts);
}
{
  const r = extraer(valor({ statuses: [
    { id: 'wamid.CCC', status: 'read', timestamp: '1787670060', recipient_id: '573174293535' }] }));
  chequear('El aviso de LEÍDO también', r.es_estado === true && r.est_estado === 'read', JSON.stringify(r));
}
// El rebote es el que más importa: hoy NADIE se entera cuando una tarjeta no llega.
{
  const r = extraer(valor({ statuses: [
    { id: 'wamid.DDD', status: 'failed', timestamp: '1787670120', recipient_id: '573999999999',
      errors: [{ code: 131026, title: 'Message undeliverable' }] }] }));
  chequear('Un REBOTE se reconoce y conserva el motivo',
           r.es_estado === true && r.est_estado === 'failed' && /undeliverable/i.test(r.est_motivo || ''),
           JSON.stringify(r));
}

// ── 2. Lo de siempre no se puede romper ─────────────────────────────────────
{
  const r = extraer(valor({ contacts: [{ profile: { name: 'Ana' }, wa_id: '573001112233' }],
    messages: [{ from: '573001112233', id: 'wamid.AAA', type: 'text', text: { body: 'cemento gris' } }] }));
  chequear('Un mensaje de cliente sigue entrando igual',
           r.es_mensaje === true && r.texto === 'cemento gris' && !r.es_estado, JSON.stringify(r).slice(0, 140));
}
// BSUID: cliente con el número oculto (caso Oscar, 14-ago). Meta no manda msg.from.
{
  const r = extraer(valor({ contacts: [{ profile: { name: 'Oscar' }, user_id: 'CO.1352055013679988' }],
    messages: [{ from_user_id: 'CO.1352055013679988', id: 'wamid.FFF', type: 'text', text: { body: 'melamina' } }] }));
  chequear('El cliente con número OCULTO sigue entrando (BSUID)',
           r.es_mensaje === true && r.wa_id === 'CO.1352055013679988', JSON.stringify(r).slice(0, 140));
}
// El botón de una PLANTILLA: es la puerta del reporte del asesor. Si se rompe, nadie puede reportar.
{
  const r = extraer(valor({ contacts: [{ profile: { name: 'Karime' }, wa_id: '573174293535' }],
    messages: [{ from: '573174293535', id: 'wamid.GGG', type: 'button',
                 button: { payload: 'SEG:abc123', text: 'Reportar resultado' } }] }));
  chequear('El botón de plantilla del asesor sigue llegando con su payload',
           r.es_mensaje === true && /SEG:abc123/.test(r.opcion_id || r.texto || ''), JSON.stringify(r).slice(0, 160));
}
// Y lo que no es ni mensaje ni estado se descarta, como siempre.
{
  const r = extraer(valor({ messages: [{ from: '573001112233', id: 'wamid.EEE', type: 'reaction' }] }));
  chequear('Una reacción se sigue descartando', r.es_mensaje === false && !r.es_estado, JSON.stringify(r));
  const v = extraer({ body: { entry: [{ changes: [{ value: {} }] }] } });
  chequear('Un webhook vacío no rompe nada', v.es_mensaje === false && !v.es_estado, JSON.stringify(v));
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
