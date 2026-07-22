# RUNBOOK — Cutover del 316 a Cloud API (Grupo Ardisa)

Línea real con clientes. Operación COORDINADA. No hacer los pasos disruptivos sin Deicy + celular del 316.

## Datos confirmados por API (2026-07-09)
- Portfolio: **Somos Ardisa** (`business_id=2082447968876425`)
- WABA: **Grupo Ardisa** `2012821269314141` — verificada ✅, aprobada ✅
- Número: **+57 316 7459958**, `PHONE_NUMBER_ID=1091546637378719`, hoy `DISCONNECTED` / `ON_PREMISE` (app verde)
- App: **Bot Grupo Ardisa** `2268429743970837` (modo "En desarrollo")
- System user: **bot-ardisa** — Acceso total a app + WABA; token en credencial n8n `WaSomosArd0001`
- Webhook: `https://bot.ardisa.com/webhook/bot-wsp-ardisa-f1`, verify token `ardisa2026`

## FASE 0 — Preparación (SIN celular, no disruptivo, hacer ya)
- [x] Suscribir la app a la WABA (`POST /2012821269314141/subscribed_apps`) → success ✅
- [ ] **Método de pago** (error 141006) — WhatsApp Manager → Configuración de la cuenta → Facturación y pagos → Agregar método de pago (tarjeta).
- [ ] **Zona horaria** (error 141007) — WhatsApp Manager → Configuración de la cuenta → fijar **(GMT-5) Bogotá**.
- [ ] **Webhook del app** — developers.facebook.com/apps/2268429743970837 → WhatsApp → Configuración → Webhook → Callback `https://bot.ardisa.com/webhook/bot-wsp-ardisa-f1`, Verify token `ardisa2026` → Verificar y guardar → suscribir campo **messages**.
- [ ] (Opcional) App a modo **Activo/Live**.
- [ ] Re-chequear salud: `health_status.can_send_message` debe pasar de BLOCKED → AVAILABLE.

## FASE 1 — Cutover disruptivo (CON celular del 316 + horario de baja actividad)
1. [ ] **Respaldar los chats** del 316 desde la app verde de WhatsApp Business (al registrar en Cloud API, deja de funcionar en el celular).
2. [ ] Definir un **PIN de 2 pasos** (6 dígitos) y anotarlo.
3. [ ] **Pedir código:** `POST /1091546637378719/request_code` (method=SMS o VOICE, language=es).
4. [ ] **Verificar código:** `POST /1091546637378719/verify_code` (code=XXXXXX).
5. [ ] **Registrar:** `POST /1091546637378719/register` (messaging_product=whatsapp, pin=PIN).
6. [ ] Confirmar `status=CONNECTED` y `can_send_message=AVAILABLE`.
7. [ ] En build_f1.py: `MODO_CONEXION="PRODUCCION"` + `MODO_PRUEBA=false` → rebuild + deploy.
8. [ ] **Prueba en vivo:** escribir al 316 desde otro celular → el bot responde → llega el lead al asesor + MySQL.
9. [ ] (Opcional) Desuscribir la app de prueba / dejar de usar el número de prueba.

## Rollback
- Si algo sale mal: `MODO_CONEXION="PRUEBA"` + deploy (vuelve al número de prueba). El 316 ya registrado en Cloud API NO vuelve solo a la app verde (habría que re-instalarlo allá).
