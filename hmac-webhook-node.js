// ============================================================================
// NODO n8n (Code) — Validación de firma del webhook de Meta (X-Hub-Signature-256)
// ----------------------------------------------------------------------------
// Va INMEDIATAMENTE después del nodo Webhook "Mensajes (POST)" y ANTES de "Extraer datos".
// Requisitos para activarlo en producción:
//   1) En el nodo Webhook "Mensajes (POST)": activar la opción **Raw Body** (para tener el cuerpo CRUDO;
//      Meta firma los bytes exactos — re-serializar el JSON rompería la firma).
//   2) Definir la variable de entorno **META_APP_SECRET** (App Secret de la app de Meta) en
//      /opt/n8n/docker-compose.yml (se hace en la misma ventana con TI del binding a loopback).
// Comportamiento: si META_APP_SECRET está vacío -> NO bloquea (rollout gradual: se activa al configurarlo).
//                 si está configurado -> rechaza (throw) cualquier request cuya firma no valide.
// ============================================================================
const crypto = require('crypto');

function verificarFirma(rawBody, sigHeader, appSecret) {
  if (!appSecret) return { ok: true, motivo: 'sin_secreto_configurado' }; // gradual: aún no activo
  if (!sigHeader) return { ok: false, motivo: 'falta_header' };
  const esperado = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(sigHeader), b = Buffer.from(esperado);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b); // comparación timing-safe (anti timing attack)
  return { ok, motivo: ok ? 'ok' : 'firma_no_coincide' };
}

// ---- Cuerpo del nodo n8n (descomentar al pegarlo en n8n) ----
// const item = $input.first().json;
// const appSecret = ($env && $env.META_APP_SECRET) || '';
// const rawBody = item.rawBody || JSON.stringify(item.body || {});
// const sig = (item.headers && item.headers['x-hub-signature-256']) || '';
// const r = verificarFirma(rawBody, sig, appSecret);
// if (!r.ok) { throw new Error('Webhook rechazado: ' + r.motivo); }
// return $input.all();

module.exports = { verificarFirma };

// ---- AUTO-PRUEBA offline (node hmac-webhook-node.js) ----
if (require.main === module) {
  let n = 0, ok = 0; const chk = (name, c) => { n++; if (c) { ok++; console.log('  ✅', name); } else console.log('  ❌', name); };
  const secret = 'app_secret_de_prueba';
  const body = '{"object":"whatsapp_business_account","entry":[{"id":"1"}]}';
  const firmaBuena = 'sha256=' + crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
  chk('firma correcta -> acepta', verificarFirma(body, firmaBuena, secret).ok === true);
  chk('firma alterada -> rechaza', verificarFirma(body, firmaBuena.slice(0, -2) + 'ff', secret).ok === false);
  chk('cuerpo alterado -> rechaza', verificarFirma(body + ' ', firmaBuena, secret).ok === false);
  chk('sin header -> rechaza', verificarFirma(body, '', secret).ok === false);
  chk('secreto equivocado -> rechaza', verificarFirma(body, firmaBuena, 'otro_secreto').ok === false);
  chk('sin secreto configurado -> pasa (rollout gradual)', verificarFirma(body, '', '').ok === true);
  console.log('\n== HMAC ' + ok + '/' + n + ' PASS ==');
  process.exit(ok === n ? 0 : 1);
}
