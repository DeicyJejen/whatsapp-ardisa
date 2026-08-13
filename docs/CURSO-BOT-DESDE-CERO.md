# Curso: construye el bot de WhatsApp Ardisa desde cero
### (los 78 nodos, su configuración real, y cómo hacerlos tú a mano)

> **Para Deicy.** Este documento tiene 4 partes: (1) el plano general, (2) las recetas de cada TIPO de
> nodo — los clics exactos para crearlos a mano, (3) los 78 nodos del bot con su configuración real
> extraída del workflow en vivo, y (4) el ciclo profesional: por qué en producción NO se hace a mano.
> Estúdialo por partes; cada circuito es una sesión de estudio.

---

# Parte 1 — El plano general

El bot es UN workflow de n8n (`botArdisaFase1x`) con 78 nodos organizados en circuitos independientes:

```
Meta (WhatsApp) ──► B. Entrada ──► C. IA ──► D. CEREBRO ──► F. Entrega inmediata
                                                │  │
                                                │  └──► E. Cotización SAP (MCP)
                                                ▼
                                     G. Cierre con debounce
      relojes:  H. Cron 1 min (inactivos/rescates/colas)   I. Cron 10 min (alertas a Deicy)
```

**Las 3 ideas que lo explican todo:**
1. **La IA entiende, el código decide.** Claude interpreta el texto/foto del cliente y devuelve datos
   estructurados; pero QUIÉN atiende, CUÁNDO se cierra y QUÉ se guarda lo decide el Cerebro (código).
2. **La BD manda.** El contexto vital (leads, consentimientos, sesiones, config) vive en MySQL; la
   memoria de n8n (staticData) es solo caché — dos mensajes simultáneos pueden pisarla.
3. **Nada se pierde.** Rescates, candados anti-duplicado, colas de adjuntos, reintentos: cada camino
   de fallo tiene una red debajo.

---

# Parte 2 — Las recetas: cómo crear cada TIPO de nodo a mano

En el editor de n8n (`https://n8n.ardisa.com`): botón **+** (o tecla `Tab`) → buscas el tipo → clic.
Para CONECTAR dos nodos: arrastra desde el circulito derecho de uno hasta el izquierdo del otro.
Para PROBAR: botón **"Execute step"** en el nodo, o **"Test workflow"** con datos de ejemplo.

### Receta: Webhook (así se hicieron los nodos 1 y 5)
1. Agregar nodo → busca "Webhook".
2. **HTTP Method:** GET (verificación) o POST (mensajes). **Path:** la ruta secreta (ej. `bot-wsp-ardisa-f1`).
3. **Respond:** "Using 'Respond to Webhook' node" cuando la respuesta la decide otro nodo (como el reto de Meta), o "Immediately" si no importa el cuerpo.
4. La URL final queda `https://<tu-dominio>/webhook/<path>` — esa es la que se registra en Meta.

### Receta: IF (los 20 nodos de decisión: 2,7,10,14,16,18,22,24,26,30,33,37,38,40,43,44,46,48,51,54,56,59,63,65)
1. Agregar nodo → "IF".
2. En **Conditions** eliges el tipo (Boolean/String/Number) y escribes la expresión en el lado izquierdo,
   por ejemplo: `{{ $json.hay_cot }}` — las llaves dobles significan "evalúa esto con los datos que llegan".
3. El nodo saca DOS ramas: **true** (arriba) y **false** (abajo). Conectas cada una a su camino.

### Receta: Code (los 13 nodos de JavaScript: 6,9,13,15,21,23,28,49,53,61,66,69,74,76)
1. Agregar nodo → "Code". **Language:** JavaScript.
2. Dentro escribes el código. Lo mínimo que hay que saber:
   - `$input.first().json` = los datos que le llegan del nodo anterior
   - `$('Nombre de otro nodo').first().json` = leer la salida de cualquier nodo anterior
   - `$getWorkflowStaticData('global')` = la memoria compartida del workflow (nuestro `store`)
   - `return [{json: {...}}]` = lo que le entrega al siguiente nodo
3. ⚠️ En ESTE proyecto los códigos no se escriben en el editor: viven en `build_f1.py` y se generan.
   (El día que edites uno a mano en n8n, el siguiente deploy lo pisa — por eso la fuente única.)

### Receta: MySQL (los 16 nodos de BD: 12,25,35,36,39,45,47,52,57,58,60,64,71,73,77)
1. Agregar nodo → "MySQL". **Credential:** la creas una vez (host 127.0.0.1, usuario `n8nbot`, la clave,
   BD `bot_ardisa`) y todos los nodos la reutilizan — la clave queda CIFRADA en n8n.
2. **Operation:** "Execute Query". Escribes el SQL con marcadores `$1, $2, $3…`
3. En **Options → Query Parameters** pasas los valores: `{{ [$json.campo1, $json.campo2] }}`
   ⚠️ Marcadores `$1`, NUNCA `?` — con `?` el driver manda la consulta cruda y falla EN SILENCIO.
4. **Settings** del nodo (pestaña ⚙): "On Error: Continue" + "Retry on Fail" — para que un tropiezo de
   BD no tumbe la conversación del cliente.

### Receta: HTTP Request (los 13 nodos que llaman APIs: 17,19,20,27,29,32,34,42,50,55,62,67,70,75)
1. Agregar nodo → "HTTP Request".
2. **Method:** POST (enviar mensajes) o GET (bajar imágenes). **URL:** el endpoint
   (Meta: `https://graph.facebook.com/v21.0/<phone_number_id>/messages`; Anthropic: `https://api.anthropic.com/v1/messages`).
3. **Authentication:** "Predefined Credential Type" → "Header Auth" → eliges la credencial (el token
   queda cifrado — JAMÁS se pega un token en el JSON del nodo).
4. **Body:** "Using JSON" → `{{ JSON.stringify($json.mensaje) }}` (el mensaje lo armó un nodo Code antes).
5. **Settings:** "Retry on Fail" (3 intentos) + "On Error: Continue" — si Meta parpadea, se reintenta.

### Receta: Schedule Trigger (los relojes: 68 y 72)
1. Agregar nodo → "Schedule Trigger". **Interval:** cada N minutos. Ese nodo ARRANCA el flujo solo.

### Receta: Respond to Webhook / No Operation / Sticky Note (3, 4, 8, 11, 31, 41, 78)
- **Respond to Webhook:** qué devolverle a quien llamó al webhook (el reto de Meta, o un 403).
- **No Operation:** un punto final limpio para las ramas que no hacen nada (facilita LEER el flujo).
- **Sticky Note:** un post-it de documentación en el lienzo.

---

# Parte 3 — Los 78 nodos con su configuración real

*(extraída del workflow EN VIVO el 13-ago-2026 — no de memoria)*

## Circuito A — Verificación de Meta (nodos 1–4)

*Meta manda un 'reto' al registrar el webhook; estos 4 nodos lo responden. Corre UNA vez en la vida (y cada vez que Meta re-verifica).*

### Nodo 1 — `Verificación (GET)`  *(Webhook, v2)*

- **Método/Ruta:** `GET` en `/webhook/bot-wsp-ardisa-f1` · Respuesta: `responseNode`
- **Conecta →** ¿Token válido?

### Nodo 2 — `¿Token válido?`  *(IF (decisión), v2)*

- **Condición:** `={{ $json.query['hub.verify_token'] }}` debe ser verdadero
- **Conecta:** SÍ → Responder challenge · NO → Responder 403

### Nodo 3 — `Responder challenge`  *(Respond to Webhook, v1.1)*

- **Responde con:** `text` ={{ $('Verificación (GET)').item.json.query['hub.challenge']

### Nodo 4 — `Responder 403`  *(Respond to Webhook, v1.1)*

- **Responde con:** `text` Token inválido

## Circuito B — Entrada de mensajes (nodos 5–13)

*Cada mensaje de WhatsApp entra por aquí: seguridad (firma), extracción, filtro, y el contexto completo desde la BD.*

### Nodo 5 — `Mensajes (POST)`  *(Webhook, v2)*

- **Método/Ruta:** `POST` en `/webhook/bot-wsp-ardisa-f1` · Respuesta: `onReceived`
- **Conecta →** Verificar firma

### Nodo 6 — `Verificar firma`  *(Code (JavaScript), v2)*

- **Código JavaScript:** 31 líneas (fuente: `build_f1.py`). Empieza: _Verifica la firma HMAC-SHA256 de Meta (header X-Hub-Signature-256) sobre el CUERPO CRUDO._
- **Conecta →** ¿Firma válida?

### Nodo 7 — `¿Firma válida?`  *(IF (decisión), v2)*

- **Condición:** `={{ $json.firma_pasa }}` debe ser verdadero
- **Conecta:** SÍ → Extraer datos · NO → Descartado (firma inválida)

### Nodo 8 — `Descartado (firma inválida)`  *(No Operation, v1)*

- Sin configuración: es un 'basurero' que termina la rama limpiamente.

### Nodo 9 — `Extraer datos`  *(Code (JavaScript), v2)*

- **Código JavaScript:** 42 líneas (fuente: `build_f1.py`). Empieza: _const root = $input.first().json;_
- **Conecta →** ¿Es mensaje?

### Nodo 10 — `¿Es mensaje?`  *(IF (decisión), v2)*

- **Condición:** `={{ $json.es_mensaje }}` debe ser verdadero
- **Conecta:** SÍ → Buscar pendiente (MySQL) · NO → Fin (no es mensaje)

### Nodo 11 — `Fin (no es mensaje)`  *(No Operation, v1)*

- Sin configuración: es un 'basurero' que termina la rama limpiamente.

### Nodo 12 — `Buscar pendiente (MySQL)`  *(MySQL, v2.5)*

- **SQL:** `SELECT (SELECT id FROM leads WHERE telefono=$1 AND modo_prueba=0 AND (estado IS NULL OR estado='') AND creado_…`
- **Parámetros ($1,$2…):** `={{ [$json.wa_id, $json.wa_id, $json.wa_id, $json.wa_id, $json.wa_id, $json.wa_id, $json.w…`
- **Reintentos:** 2 intentos, espera 1000ms
- **Si falla:** continúa sin tumbar el flujo (`onError: continue`)
- **Credencial:** MySQL Leads Ardisa
- **Conecta →** Unir pendiente

### Nodo 13 — `Unir pendiente`  *(Code (JavaScript), v2)*

- **Código JavaScript:** 28 líneas (fuente: `build_f1.py`). Empieza: _const d = $('Extraer datos').first().json;_
- **Conecta →** ¿Es imagen?

## Circuito C — Capa de IA (nodos 14–22)

*La IA ENTIENDE (texto y fotos), con kill-switch y filtro de costo. El código decide después.*

### Nodo 14 — `¿Usar IA?`  *(IF (decisión), v2)*

- **Condición:** `={{ $json.usar_ia_flag }}` debe ser verdadero
- **Condición:** `={{ $json.mtype }}` debe ser verdadero
- **Conecta:** SÍ → Preparar IA · NO → Cerebro conversacional

### Nodo 15 — `Preparar IA`  *(Code (JavaScript), v2)*

- **Código JavaScript:** 65 líneas (fuente: `build_f1.py`). Empieza: _Preparar IA: dedup + rate-limit + tope de gasto ANTES de gastar; arma el body para Anthropic._
- **Conecta →** ¿Gastar IA?

### Nodo 16 — `¿Gastar IA?`  *(IF (decisión), v2)*

- **Condición:** `={{ $json.gastar_ia }}` debe ser verdadero
- **Conecta:** SÍ → 🤖 IA Anthropic · NO → Cerebro conversacional

### Nodo 17 — `🤖 IA Anthropic`  *(HTTP Request, v4.2)*

- **HTTP:** POST `https://api.anthropic.com/v1/messages`
- **Auth:** credencial cifrada (`Anthropic API Key (Fase 2)`)
- **Timeout:** 12s
- **Reintentos:** 2 intentos, espera 1500ms
- **Si falla:** continúa sin tumbar el flujo (`onError: continue`)
- **Conecta →** Cerebro conversacional

### Nodo 18 — `¿Es imagen?`  *(IF (decisión), v2)*

- **Condición:** `={{ $json.usar_ia_flag }}` debe ser verdadero
- **Condición:** `={{ $json.mtype }}` debe ser verdadero
- **Conecta:** SÍ → Obtener URL imagen (Meta) · NO → ¿Usar IA?

### Nodo 19 — `Obtener URL imagen (Meta)`  *(HTTP Request, v4.2)*

- **HTTP:** GET `=https://graph.facebook.com/v21.0/{{ $('Extraer datos').item.json.media_id }}`
- **Auth:** credencial cifrada (`WhatsApp Token Somos Ardisa (nuevo)`)
- **Timeout:** 15s
- **Reintentos:** 2 intentos, espera 1200ms
- **Si falla:** continúa sin tumbar el flujo (`onError: continue`)
- **Conecta →** Descargar imagen (Meta)

### Nodo 20 — `Descargar imagen (Meta)`  *(HTTP Request, v4.2)*

- **HTTP:** GET `={{ $json.url }}`
- **Auth:** credencial cifrada (`WhatsApp Token Somos Ardisa (nuevo)`)
- **Timeout:** 15s
- **Reintentos:** 2 intentos, espera 1200ms
- **Si falla:** continúa sin tumbar el flujo (`onError: continue`)
- **Conecta →** Preparar IA Visión

### Nodo 21 — `Preparar IA Visión`  *(Code (JavaScript), v2)*

- **Código JavaScript:** 71 líneas (fuente: `build_f1.py`). Empieza: _const store = $getWorkflowStaticData('global');_
- **Conecta →** ¿Analizar imagen?

### Nodo 22 — `¿Analizar imagen?`  *(IF (decisión), v2)*

- **Condición:** `={{ $json.gastar_ia }}` debe ser verdadero
- **Conecta:** SÍ → 🤖 IA Anthropic · NO → Cerebro conversacional

## Circuito D — El Cerebro (nodos 23–25)

*Toda la lógica de negocio vive en el nodo 23. Los ~2.400 renglones no se editan en n8n: viven en `build_f1.py` (sección CODE_CEREBRO).*

### Nodo 23 — `Cerebro conversacional`  *(Code (JavaScript), v2)*

- **Código JavaScript:** 2425 líneas (fuente: `build_f1.py`). Empieza: _Cerebro conversacional MODERNO. Marca -> nombre -> ciudad -> (Ardisa: producto | Carpincentro: ocupa_
- **Conecta →** ¿Responder al cliente?, ¿Registrar chat?, ¿Registrar consentimiento?, ¿Guardar seguimiento?, ¿Hay sesión?, ¿Cotizar?

### Nodo 24 — `¿Hay sesión?`  *(IF (decisión), v2)*

- **Condición:** `={{ $json.ses_tel }}` debe ser verdadero
- **Conecta:** SÍ → Guardar sesión (MySQL)

### Nodo 25 — `Guardar sesión (MySQL)`  *(MySQL, v2.5)*

- **SQL:** `INSERT INTO sesiones (telefono, estado) VALUES ($1, $2) ON DUPLICATE KEY UPDATE estado=VALUES(estado)`
- **Parámetros ($1,$2…):** `={{ [$json.ses_tel, $json.ses_out||'null'] }}`
- **Reintentos:** 2 intentos, espera 1000ms
- **Si falla:** continúa sin tumbar el flujo (`onError: continue`)
- **Credencial:** MySQL Leads Ardisa

## Circuito E — Fase 2 · Cotización SAP (nodos 26–29)

*Una sola llamada HTTP a Anthropic; el loop con SAP corre en sus servidores, no en n8n.*

### Nodo 26 — `¿Cotizar?`  *(IF (decisión), v2)*

- **Condición:** `={{ $json.hay_cot }}` debe ser verdadero
- **Conecta:** SÍ → 💰 IA Cotización (SAP)

### Nodo 27 — `💰 IA Cotización (SAP)`  *(HTTP Request, v4.2)*

- **HTTP:** POST `https://api.anthropic.com/v1/messages`
- **Auth:** credencial cifrada (`Anthropic API Key (Fase 2)`)
- **Timeout:** 45s
- **Reintentos:** 2 intentos, espera 2000ms
- **Si falla:** continúa sin tumbar el flujo (`onError: continue`)
- **Conecta →** Entregar cotización

### Nodo 28 — `Entregar cotización`  *(Code (JavaScript), v2)*

- **Código JavaScript:** 30 líneas (fuente: `build_f1.py`). Empieza: _FASE 2: convierte la respuesta de Claude+SAP en el mensaje al cliente. El código decide; guardrails _
- **Conecta →** Responder cotización (Meta), ¿Hay sesión?, ¿Registrar chat?

### Nodo 29 — `Responder cotización (Meta)`  *(HTTP Request, v4.2)*

- **HTTP:** POST `=https://graph.facebook.com/v21.0/1221127187754818/messages`
- **Auth:** credencial cifrada (`WhatsApp Token Somos Ardisa (nuevo)`)
- **Timeout:** 15s
- **Reintentos:** 3 intentos, espera 1500ms
- **Si falla:** continúa sin tumbar el flujo (`onError: continue`)

## Circuito F — Respuesta y entrega inmediata (nodos 30–50)

*Responder al cliente, avisar al asesor, guardar lead (con candado anti-duplicado en la BD), chat, consentimiento y adjuntos.*

### Nodo 30 — `¿Responder al cliente?`  *(IF (decisión), v2)*

- **Condición:** `={{ $json.wpp_body ? true : false }}` debe ser verdadero
- **Conecta:** SÍ → Enviar al cliente (Meta) · NO → Sin respuesta (dup/vacío)

### Nodo 31 — `Sin respuesta (dup/vacío)`  *(No Operation, v1)*

- Sin configuración: es un 'basurero' que termina la rama limpiamente.

### Nodo 32 — `Enviar al cliente (Meta)`  *(HTTP Request, v4.2)*

- **HTTP:** POST `=https://graph.facebook.com/v21.0/1221127187754818/messages`
- **Auth:** credencial cifrada (`WhatsApp Token Somos Ardisa (nuevo)`)
- **Timeout:** 15s
- **Reintentos:** 3 intentos, espera 1500ms
- **Si falla:** continúa sin tumbar el flujo (`onError: continue`)
- **Conecta →** ¿Hay aviso al asesor?

### Nodo 33 — `¿Hay aviso al asesor?`  *(IF (decisión), v2)*

- **Condición:** `={{ $('Cerebro conversacional').first().json.hay_aviso || ($('Cerebro conversacional').first().json.lead ? true : false) }}` debe ser verdadero
- **Conecta:** SÍ → ¿Hay lead?

### Nodo 34 — `Avisar al asesor (Meta)`  *(HTTP Request, v4.2)*

- **HTTP:** POST `=https://graph.facebook.com/v21.0/1221127187754818/messages`
- **Auth:** credencial cifrada (`WhatsApp Token Somos Ardisa (nuevo)`)
- **Timeout:** 15s
- **Reintentos:** 3 intentos, espera 1500ms
- **Si falla:** continúa sin tumbar el flujo (`onError: continue`)
- **Conecta →** ¿Hay adjunto?

### Nodo 35 — `Guardar lead (MySQL)`  *(MySQL, v2.5)*

- **SQL:** `INSERT INTO leads (creado_en,telefono,nombre,marca,ciudad,tipo_cliente,solicitud,detalle,asesor,asesor_tel,fue…`
- **Parámetros ($1,$2…):** `={{ [$('Cerebro conversacional').first().json.lead.creado_en, $('Cerebro conversacional').…`
- **Reintentos:** 3 intentos, espera 2000ms
- **Si falla:** continúa sin tumbar el flujo (`onError: continue`)
- **Credencial:** MySQL Leads Ardisa
- **Conecta →** Sumar detalle (MySQL)

### Nodo 36 — `Sumar detalle (MySQL)`  *(MySQL, v2.5)*

- **SQL:** `UPDATE leads SET detalle = CONCAT(detalle, CHAR(10), '➕ ', $1) WHERE telefono=$2 AND modo_prueba=$3 AND creado…`
- **Parámetros ($1,$2…):** `={{ [$('Cerebro conversacional').first().json.lead.detalle, $('Cerebro conversacional').fi…`
- **Reintentos:** 2 intentos, espera 1500ms
- **Si falla:** continúa sin tumbar el flujo (`onError: continue`)
- **Credencial:** MySQL Leads Ardisa
- **Conecta →** Buscar lead original (MySQL)

### Nodo 37 — `¿Hay lead?`  *(IF (decisión), v2)*

- **Condición:** `={{ $('Cerebro conversacional').first().json.lead ? true : false }}` debe ser verdadero
- **Conecta:** SÍ → Guardar lead (MySQL) · NO → Avisar al asesor (Meta)

### Nodo 38 — `¿Lead ya existía?`  *(IF (decisión), v2)*

- **Condición:** `={{ $json.es_previo ? true : false }}` debe ser verdadero
- **Conecta:** SÍ → ¿Asesor del lead original? · NO → ¿Hay aviso 1?

### Nodo 39 — `Buscar lead original (MySQL)`  *(MySQL, v2.5)*

- **SQL:** `SELECT (SELECT id FROM leads WHERE telefono=$1 AND creado_en > NOW() - INTERVAL 45 MINUTE AND asesor_tel IS NO…`
- **Parámetros ($1,$2…):** `={{ [$('Cerebro conversacional').first().json.lead.telefono, $('Cerebro conversacional').f…`
- **Reintentos:** 2 intentos, espera 1500ms
- **Si falla:** continúa sin tumbar el flujo (`onError: continue`)
- **Credencial:** MySQL Leads Ardisa
- **Conecta →** ¿Lead ya existía?

### Nodo 40 — `¿Asesor del lead original?`  *(IF (decisión), v2)*

- **Condición:** `={{ $json.asesor_tel ? true : false }}` debe ser verdadero
- **Conecta:** SÍ → Avisar adición (Meta) · NO → Aviso omitido (duplicado)

### Nodo 41 — `Aviso omitido (duplicado)`  *(No Operation, v1)*

- Sin configuración: es un 'basurero' que termina la rama limpiamente.

### Nodo 42 — `Avisar adición (Meta)`  *(HTTP Request, v4.2)*

- **HTTP:** POST `=https://graph.facebook.com/v21.0/1221127187754818/messages`
- **Auth:** credencial cifrada (`WhatsApp Token Somos Ardisa (nuevo)`)
- **Timeout:** 15s
- **Reintentos:** 3 intentos, espera 1500ms
- **Si falla:** continúa sin tumbar el flujo (`onError: continue`)

### Nodo 43 — `¿Hay aviso 1?`  *(IF (decisión), v2)*

- **Condición:** `={{ $('Cerebro conversacional').first().json.hay_aviso }}` debe ser verdadero
- **Conecta:** SÍ → Avisar al asesor (Meta)

### Nodo 44 — `¿Registrar chat?`  *(IF (decisión), v2)*

- **Condición:** `={{ $json.chat ? true : false }}` debe ser verdadero
- **Conecta:** SÍ → Guardar chat (MySQL)

### Nodo 45 — `Guardar chat (MySQL)`  *(MySQL, v2.5)*

- **SQL:** `INSERT INTO mensajes (creado_en,wa_id,nombre,entrada,salida,etapa,media_id,media_tipo) VALUES ($1,$2,$3,$4,$5,…`
- **Parámetros ($1,$2…):** `={{ [$json.chat.creado_en, $json.chat.wa_id, $json.chat.nombre, $json.chat.entrada, $json.…`
- **Reintentos:** 2 intentos, espera 1500ms
- **Si falla:** continúa sin tumbar el flujo (`onError: continue`)
- **Credencial:** MySQL Leads Ardisa

### Nodo 46 — `¿Registrar consentimiento?`  *(IF (decisión), v2)*

- **Condición:** `={{ $('Cerebro conversacional').item.json.consent_log ? true : false }}` debe ser verdadero
- **Conecta:** SÍ → Guardar consentimiento (MySQL)

### Nodo 47 — `Guardar consentimiento (MySQL)`  *(MySQL, v2.5)*

- **SQL:** `INSERT INTO consentimientos (creado_en,telefono,nombre,decision,politica,canal,msg_id) VALUES ($1,$2,$3,$4,$5,…`
- **Parámetros ($1,$2…):** `={{ [$('Cerebro conversacional').item.json.consent_log.creado_en, $('Cerebro conversaciona…`
- **Reintentos:** 3 intentos, espera 2000ms
- **Si falla:** continúa sin tumbar el flujo (`onError: continue`)
- **Credencial:** MySQL Leads Ardisa

### Nodo 48 — `¿Hay adjunto?`  *(IF (decisión), v2)*

- **Condición:** `={{ $('Cerebro conversacional').item.json.hay_media }}` debe ser verdadero
- **Conecta:** SÍ → Separar adjuntos

### Nodo 49 — `Separar adjuntos`  *(Code (JavaScript), v2)*

- **Código JavaScript:** 1 líneas (fuente: `build_f1.py`). Empieza: _const ms = ($('Cerebro conversacional').first().json.aviso_medias)||[]; return ms.map(m=>({json:{med_
- **Conecta →** Reenviar adjunto al asesor (Meta)

### Nodo 50 — `Reenviar adjunto al asesor (Meta)`  *(HTTP Request, v4.2)*

- **HTTP:** POST `=https://graph.facebook.com/v21.0/1221127187754818/messages`
- **Auth:** credencial cifrada (`WhatsApp Token Somos Ardisa (nuevo)`)
- **Timeout:** 15s
- **Reintentos:** 3 intentos, espera 1500ms
- **Si falla:** continúa sin tumbar el flujo (`onError: continue`)

## Circuito G — Cierre con debounce (nodos 51–67)

*El cliente escribe en ráfaga → se espera ~45s → UNA tarjeta con todo, releyendo el lead desde la BD.*

### Nodo 51 — `¿Cierre listo?`  *(IF (decisión), v2)*

- **Condición:** `={{ $json.fin_cierre === true }}` debe ser verdadero
- **Conecta:** SÍ → Leer lead BD (MySQL) · NO → Enviar recordatorio (Meta), Guardar recordatorio (MySQL)

### Nodo 52 — `Leer lead BD (MySQL)`  *(MySQL, v2.5)*

- **SQL:** `SELECT $1 AS wa_id, $2 AS pend_token, (SELECT id FROM leads WHERE telefono=$3 AND modo_prueba=0 AND creado_en …`
- **Parámetros ($1,$2…):** `={{ [$json.wa_id, $json.pend_token, $json.wa_id, $json.wa_id, $json.wa_id, $json.wa_id] }}`
- **Reintentos:** 2 intentos, espera 1500ms
- **Si falla:** continúa sin tumbar el flujo (`onError: continue`)
- **Credencial:** MySQL Leads Ardisa
- **Conecta →** Finalizar cierre

### Nodo 53 — `Finalizar cierre`  *(Code (JavaScript), v2)*

- **Código JavaScript:** 98 líneas (fuente: `build_f1.py`). Empieza: _2026-07-24 (caso Sebastián #118): este nodo ya NO corre dentro de la ejecución del mensaje (el Wait _
- **Conecta →** ¿Hay lead 2?

### Nodo 54 — `¿Hay aviso 2?`  *(IF (decisión), v2)*

- **Condición:** `={{ $('Finalizar cierre').first().json.hay_aviso }}` debe ser verdadero
- **Conecta:** SÍ → Avisar al asesor 2 (Meta)

### Nodo 55 — `Avisar al asesor 2 (Meta)`  *(HTTP Request, v4.2)*

- **HTTP:** POST `=https://graph.facebook.com/v21.0/1221127187754818/messages`
- **Auth:** credencial cifrada (`WhatsApp Token Somos Ardisa (nuevo)`)
- **Timeout:** 15s
- **Reintentos:** 3 intentos, espera 1500ms
- **Si falla:** continúa sin tumbar el flujo (`onError: continue`)
- **Conecta →** ¿Hay adjunto 2?

### Nodo 56 — `¿Hay lead 2?`  *(IF (decisión), v2)*

- **Condición:** `={{ $('Finalizar cierre').first().json.hay_lead }}` debe ser verdadero
- **Conecta:** SÍ → Guardar lead 2 (MySQL) · NO → ¿Hay aviso 2?

### Nodo 57 — `Guardar lead 2 (MySQL)`  *(MySQL, v2.5)*

- **SQL:** `INSERT INTO leads (creado_en,telefono,nombre,marca,ciudad,tipo_cliente,solicitud,detalle,asesor,asesor_tel,fue…`
- **Parámetros ($1,$2…):** `={{ [$('Finalizar cierre').first().json.lead.creado_en, $('Finalizar cierre').first().json…`
- **Reintentos:** 3 intentos, espera 2000ms
- **Si falla:** continúa sin tumbar el flujo (`onError: continue`)
- **Credencial:** MySQL Leads Ardisa
- **Conecta →** Sumar detalle 2 (MySQL)

### Nodo 58 — `Sumar detalle 2 (MySQL)`  *(MySQL, v2.5)*

- **SQL:** `UPDATE leads SET detalle = CONCAT(detalle, CHAR(10), '➕ ', $1) WHERE telefono=$2 AND modo_prueba=$3 AND creado…`
- **Parámetros ($1,$2…):** `={{ [$('Finalizar cierre').first().json.lead.detalle, $('Finalizar cierre').first().json.l…`
- **Reintentos:** 2 intentos, espera 1500ms
- **Si falla:** continúa sin tumbar el flujo (`onError: continue`)
- **Credencial:** MySQL Leads Ardisa
- **Conecta →** Buscar asesor del lead (MySQL)

### Nodo 59 — `¿Lead 2 ya existía?`  *(IF (decisión), v2)*

- **Condición:** `={{ $json.es_previo ? true : false }}` debe ser verdadero
- **Conecta:** SÍ → Redirigir al asesor original · NO → ¿Hay aviso 2?

### Nodo 60 — `Buscar asesor del lead (MySQL)`  *(MySQL, v2.5)*

- **SQL:** `SELECT (SELECT id FROM leads WHERE telefono=$1 AND creado_en > NOW() - INTERVAL 45 MINUTE AND asesor_tel IS NO…`
- **Parámetros ($1,$2…):** `={{ [($('Finalizar cierre').first().json.lead||{}).telefono, ($('Finalizar cierre').first(…`
- **Reintentos:** 2 intentos, espera 1500ms
- **Si falla:** continúa sin tumbar el flujo (`onError: continue`)
- **Credencial:** MySQL Leads Ardisa
- **Conecta →** ¿Lead 2 ya existía?

### Nodo 61 — `Redirigir al asesor original`  *(Code (JavaScript), v2)*

- **Código JavaScript:** 29 líneas (fuente: `build_f1.py`). Empieza: _Duplicado bloqueado: rearma la info nueva (nota + fotos) para el asesor que YA tiene el lead._
- **Conecta →** Reenviar al asesor original (Meta)

### Nodo 62 — `Reenviar al asesor original (Meta)`  *(HTTP Request, v4.2)*

- **HTTP:** POST `=https://graph.facebook.com/v21.0/1221127187754818/messages`
- **Auth:** credencial cifrada (`WhatsApp Token Somos Ardisa (nuevo)`)
- **Timeout:** 15s
- **Reintentos:** 3 intentos, espera 1500ms
- **Si falla:** continúa sin tumbar el flujo (`onError: continue`)

### Nodo 63 — `¿Guardar seguimiento?`  *(IF (decisión), v2)*

- **Condición:** `={{ $('Cerebro conversacional').item.json.hay_seg }}` debe ser verdadero
- **Conecta:** SÍ → Guardar seguimiento (MySQL)

### Nodo 64 — `Guardar seguimiento (MySQL)`  *(MySQL, v2.5)*

- **SQL:** `UPDATE leads SET estado=$1, estado_motivo=$2, valor_venta=COALESCE($3, valor_venta), obs_asesor=TRIM(BOTH ' | …`
- **Parámetros ($1,$2…):** `={{ [$('Cerebro conversacional').item.json.seg_update.estado, $('Cerebro conversacional').…`
- **Reintentos:** 3 intentos, espera 2000ms
- **Si falla:** continúa sin tumbar el flujo (`onError: continue`)
- **Credencial:** MySQL Leads Ardisa

### Nodo 65 — `¿Hay adjunto 2?`  *(IF (decisión), v2)*

- **Condición:** `={{ $('Finalizar cierre').first().json.hay_media }}` debe ser verdadero
- **Conecta:** SÍ → Separar adjuntos 2

### Nodo 66 — `Separar adjuntos 2`  *(Code (JavaScript), v2)*

- **Código JavaScript:** 1 líneas (fuente: `build_f1.py`). Empieza: _const ms=($('Finalizar cierre').first().json.aviso_medias)||[]; return ms.map(m=>({json:{media:m}}))_
- **Conecta →** Reenviar adjunto 2 (Meta)

### Nodo 67 — `Reenviar adjunto 2 (Meta)`  *(HTTP Request, v4.2)*

- **HTTP:** POST `=https://graph.facebook.com/v21.0/1221127187754818/messages`
- **Auth:** credencial cifrada (`WhatsApp Token Somos Ardisa (nuevo)`)
- **Timeout:** 15s
- **Reintentos:** 3 intentos, espera 1500ms
- **Si falla:** continúa sin tumbar el flujo (`onError: continue`)

## Circuito H — Cron de inactivos (nodos 68–71)

*Cada minuto: recordatorios, cierres, rescates, colas de adjuntos, destrabes y seguimiento.*

### Nodo 68 — `Cada 1 min (inactivos)`  *(Schedule Trigger, v1.2)*

- **Cada:** 1 minutos
- **Conecta →** Revisar inactivos

### Nodo 69 — `Revisar inactivos`  *(Code (JavaScript), v2)*

- **Código JavaScript:** 337 líneas (fuente: `build_f1.py`). Empieza: _const store=$getWorkflowStaticData('global');_
- **Conecta →** ¿Cierre listo?

### Nodo 70 — `Enviar recordatorio (Meta)`  *(HTTP Request, v4.2)*

- **HTTP:** POST `=https://graph.facebook.com/v21.0/1221127187754818/messages`
- **Auth:** credencial cifrada (`WhatsApp Token Somos Ardisa (nuevo)`)
- **Timeout:** 15s
- **Reintentos:** 2 intentos, espera 1500ms
- **Si falla:** continúa sin tumbar el flujo (`onError: continue`)

### Nodo 71 — `Guardar recordatorio (MySQL)`  *(MySQL, v2.5)*

- **SQL:** `INSERT INTO mensajes (creado_en,wa_id,nombre,entrada,salida,etapa,media_id,media_tipo) VALUES ($1,$2,$3,$4,$5,…`
- **Parámetros ($1,$2…):** `={{ [$json.chat.creado_en, $json.chat.wa_id, $json.chat.nombre, $json.chat.entrada, $json.…`
- **Reintentos:** 2 intentos, espera 1500ms
- **Si falla:** continúa sin tumbar el flujo (`onError: continue`)
- **Credencial:** MySQL Leads Ardisa

## Circuito I — Alertas a Deicy (nodos 72–77)

*Independiente del bot: lee la tabla `alertas` cada 10 min y avisa al WhatsApp de monitoreo con confirmación de entrega.*

### Nodo 72 — `Cada 10 min (alertas)`  *(Schedule Trigger, v1.2)*

- **Cada:** 10 minutos
- **Conecta →** Leer alertas nuevas (MySQL)

### Nodo 73 — `Leer alertas nuevas (MySQL)`  *(MySQL, v2.5)*

- **SQL:** `SELECT MAX(z.id) AS max_id, COUNT(*) AS n, GROUP_CONCAT(CONCAT(z.severidad,'|',z.detalle) ORDER BY z.severidad…`
- **Reintentos:** 2 intentos, espera 1500ms
- **Si falla:** continúa sin tumbar el flujo (`onError: continue`)
- **Credencial:** MySQL Leads Ardisa
- **Conecta →** Armar aviso a Deicy

### Nodo 74 — `Armar aviso a Deicy`  *(Code (JavaScript), v2)*

- **Código JavaScript:** 17 líneas (fuente: `build_f1.py`). Empieza: _Si no hay alertas nuevas (o la BD falló), NO se devuelve nada -> los nodos de abajo ni corren. Silen_
- **Conecta →** Avisar a Deicy (Meta)

### Nodo 75 — `Avisar a Deicy (Meta)`  *(HTTP Request, v4.2)*

- **HTTP:** POST `=https://graph.facebook.com/v21.0/1221127187754818/messages`
- **Auth:** credencial cifrada (`WhatsApp Token Somos Ardisa (nuevo)`)
- **Timeout:** 15s
- **Reintentos:** 2 intentos, espera 2000ms
- **Si falla:** continúa sin tumbar el flujo (`onError: continue`)
- **Conecta →** ¿Llegó el aviso?

### Nodo 76 — `¿Llegó el aviso?`  *(Code (JavaScript), v2)*

- **Código JavaScript:** 9 líneas (fuente: `build_f1.py`). Empieza: _Solo se marcan como avisadas si Meta CONFIRMÓ el envío. Si su ventana de 24h está cerrada, Meta rech_
- **Conecta →** Marcar avisadas (MySQL)

### Nodo 77 — `Marcar avisadas (MySQL)`  *(MySQL, v2.5)*

- **SQL:** `UPDATE alertas SET avisado_wa=1 WHERE avisado_wa=0 AND id <= $1`
- **Parámetros ($1,$2…):** `={{ [$json.max_id] }}`
- **Reintentos:** 2 intentos, espera 1500ms
- **Si falla:** continúa sin tumbar el flujo (`onError: continue`)
- **Credencial:** MySQL Leads Ardisa

## Nodo suelto (78)

### Nodo 78 — `Nota`  *(Sticky Note, v1)*

- Nota de documentación en el lienzo (no ejecuta).

---

# Parte 4 — El ciclo profesional: por qué NO lo hacemos a mano

Ya viste que podrías crear los 78 nodos a clics. En producción NO se hace así, por tres razones que
aprendimos a golpes:

1. **Un error de dedo tumba el bot en vivo** (nos pasó el 15-jul: una llave `{` de más en un nodo Code).
   Por eso `build_f1.py` valida la sintaxis de CADA nodo (`node --check`) antes de generar nada.
2. **Sin historia no hay reversa.** Un clic en n8n no queda en ningún lado. Un cambio en `build_f1.py`
   queda en git: quién, cuándo, por qué (¡y cada arreglo tiene su prueba en `tests/`!).
3. **Lo vivo debe ser idéntico a lo probado.** `desplegar.sh` construye, corre las ~300 pruebas, espera
   una ventana sin clientes, respalda lo vivo, sube y VERIFICA que lo desplegado == lo probado.

**El ciclo completo que uso cada vez que me pides un cambio:**

```
1. Editar build_f1.py            ← el cambio (con su comentario del PORQUÉ)
2. VERIFY_TOKEN=... python3 build_f1.py     ← genera workflow-bot-f1.json y valida sintaxis
3. bash tests/correr.sh          ← ~300 pruebas (si UNA falla, no se sigue)
4. git commit                    ← queda en la historia con su porqué
5. bash desplegar.sh             ← candado completo + deploy + verificación automática
```

## Tu tarea práctica (Módulo del sílabo)

En TU n8n local (el de tu PC del curso), construye un mini-bot de 5 nodos SIN mirar el grande:

1. **Webhook** (POST, path `mi-bot`) → 2. **Code** (lee `$input.first().json.body.texto` y arma una
respuesta) → 3. **IF** (¿el texto contiene "hola"?) → 4a. **Set/Code** rama sí: "¡Hola! soy tu bot" →
4b. rama no: "no te entendí" → 5. **Respond to Webhook** (devuelve la respuesta).

Pruébalo con: `curl -X POST http://localhost:5678/webhook/mi-bot -H "Content-Type: application/json" -d '{"texto":"hola"}'`

Cuando lo tengas funcionando, me cuentas y lo revisamos juntos. Ese mini-bot de 5 nodos tiene la MISMA
anatomía que el grande de 78: entrada → entender → decidir → responder. El resto es crecer con redes
de seguridad.
