# Runbook — Bot WhatsApp Ardisa (Fase 1)

Fuente de verdad: **`build_f1.py`** (genera `workflow-bot-f1.json`). NO editar el JSON a mano.
Workflow n8n: `botArdisaFase1x` ("Bot WhatsApp Ardisa - FASE 1"). Webhook: `https://bot.ardisa.com/webhook/bot-wsp-ardisa-f1`.

## Build + pruebas (siempre antes de desplegar)
```bash
export SP=<scratchpad de la sesión actual>            # los scratchpads son POR SESIÓN y se borran; regenerar lo que falte
cd /home/ubuntu/whatsapp-ardisa
VERIFY_TOKEN=ardisa2026 python3 build_f1.py           # node --check de cada nodo; aborta si hay error; chmod 600 al JSON
python3 -c "import build_f1; open('$SP/cerebro.js','w').write(build_f1.CODE_CEREBRO)"
# Las suites viejas (test_cerebro/test/test_extraer, 76 pruebas) se perdieron con un scratchpad borrado.
# Escribir pruebas dirigidas al cambio (harness: stub de $('Extraer datos'), $getWorkflowStaticData, $env; ejemplo 2026-07-23 test_fix_milena.js).
```

## Deploy (con snapshot para rollback)
Se hace vía API pública de n8n. La API key (label "CLAUDE") se recupera de la BD:
`docker cp n8n:/home/node/.n8n/database.sqlite /tmp/x.sqlite && sqlite3 /tmp/x.sqlite "SELECT apiKey FROM user_api_keys WHERE label='CLAUDE'"` (borrar la copia: pesa ~600MB).
1. `GET /api/v1/workflows/botArdisaFase1x` → guardar en `$SP/rollback-botArdisaFase1x.json` (SNAPSHOT).
2. `POST .../deactivate` → `PUT .../botArdisaFase1x` (solo name/nodes/connections/settings) → `POST .../activate`.
3. Verificar `active:true` y `curl -X POST {entry:[]}` al webhook → 200.

## Rollback
`PUT` el contenido de `$SP/rollback-botArdisaFase1x.json` (campos name/nodes/connections/settings) y `activate`.

## Seguridad viva
- MODO_PRUEBA=true → todo aviso va a `573197889423` (Deicy). Nada llega a asesores reales hasta autorización.
- nginx: solo expone `/webhook/*` (rate-limit 10r/s, HSTS, body 1m). Editor n8n cerrado a internet vía SG (pendiente: atar a 127.0.0.1).
- Token de WhatsApp: en **credencial cifrada** de n8n ("WhatsApp Ardisa Token", id `WaKCK4eCT2vecazW`), restringida a `graph.facebook.com`. YA NO está en el JSON (verificado: Meta 200). **Rotar** = editar el VALOR de esa credencial en el editor n8n (VPN), o recrearla vía API y actualizar `WPP_CRED_ID` en build_f1.py.

## PENDIENTE (requiere a Deicy / TI)
1. **Rotar token** en Meta (estuvo expuesto ~2 días) → actualizar el VALOR de la credencial "WhatsApp Ardisa Token" en n8n (el token ya está fuera del JSON, cifrado).
2. **App Secret** de la app → validar firma HMAC-SHA256 del webhook.
3. **M365**: app registration en Azure (Graph `Files.ReadWrite`) para el consolidado de leads.
4. Ventana con TI: atar n8n/exporters a `127.0.0.1` en `/opt/n8n/docker-compose.yml` + `ufw` (reinicio ~30s).
5. Backups off-host de la DB de n8n + `N8N_ENCRYPTION_KEY`.
