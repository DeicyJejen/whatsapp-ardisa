# Los 91 nodos del bot WhatsApp Ardisa — uno a uno

> **Cómo se construye (léelo primero):** los nodos NO se editan a mano en n8n. La fuente única de verdad
> es **`build_f1.py`**: un script Python que genera el workflow completo (`workflow-bot-f1.json`) y hace
> `node --check` de cada nodo de código (una llave de más tumbó el bot en vivo el 15-jul — nunca más).
> Desplegar es `bash desplegar.sh`: build → suite de pruebas → ventana tranquila → snapshot de reversa →
> deploy por API → verificación automática (lo vivo == el build). Un webhook = UN workflow (id `botArdisaFase1x`).

## Circuito A — Verificación de Meta (nodos 1–4)

Cuando registras el webhook en Meta, ellos mandan un "challenge" para comprobar que el servidor es tuyo.

| # | Nodo | Qué hace |
|---|------|----------|
| 1 | `Verificación (GET)` | Webhook que recibe el reto de verificación de Meta (solo GET). |
| 2 | `¿Token válido?` | Compara el `verify_token` que manda Meta con el nuestro. |
| 3 | `Responder challenge` | Si coincide, devuelve el número-reto → Meta marca el webhook como verificado. |
| 4 | `Responder 403` | Si no coincide, rechaza (alguien ajeno intentó registrar nuestro webhook). |

## Circuito B — Entrada de mensajes (nodos 5–13)

Cada mensaje de WhatsApp entra por aquí. Seguridad primero, contexto después.

| # | Nodo | Qué hace |
|---|------|----------|
| 5 | `Mensajes (POST)` | El webhook real: Meta manda aquí cada mensaje/botón/imagen/estado. |
| 6 | `Verificar firma` | Calcula la firma HMAC-SHA256 del cuerpo con el App Secret: prueba matemática de que el mensaje viene de Meta y no de un impostor. |
| 7 | `¿Firma válida?` | Deja pasar solo lo firmado. |
| 8 | `Descartado (firma inválida)` | Basurero de lo no firmado. |
| 9 | `Extraer datos` | Del JSON enorme de Meta saca lo útil: teléfono, nombre de perfil, texto, botón tocado, tipo/id de adjunto. **14-ago:** si el cliente oculta su número (usernames de WhatsApp 2026), Meta ya no manda teléfono sino un código BSUID (`CO.1352...`) — el extractor lo usa como identidad y el bot le responde por el campo `recipient`; a estos clientes se les pregunta un número de contacto antes de cerrar. |
| 10 | `¿Es mensaje?` | Meta también manda "entregado/leído" — eso no se procesa. |
| 11 | `Fin (no es mensaje)` | Basurero de esos estados. |
| 12 | `Buscar pendiente (MySQL)` | UNA consulta que trae TODO el contexto desde la BD: ¿tiene lead sin reportar? (regla de oro: mismo asesor), ¿autorizó datos hoy?, sesión guardada, muro reciente, chat híbrido, y la config de Fase 2 (usar_cotiza, alcance, URL y token del MCP, tool de precio). La BD manda; staticData es solo caché. |
| 13 | `Unir pendiente` | Une esa respuesta con los datos del mensaje (el nodo MySQL reemplaza el item; aquí se re-arma). Si la BD falla, el bot sigue sin contexto en vez de caerse. |

## Circuito C — Capa de IA (nodos 14–22)

La IA ENTIENDE, el código DECIDE. Con kill-switch para volver a menús puros en segundos.

| # | Nodo | Qué hace |
|---|------|----------|
| 14 | `¿Usar IA?` | Kill-switch `USAR_IA`: apagado = el bot funciona solo con menús (reversa instantánea si la IA falla). |
| 15 | `Preparar IA` | Arma la consulta a Claude: prompt endurecido contra inyecciones + esquema fijo de respuesta (marca, productos, ciudad, en_alcance, es_reclamo, es_info…). |
| 16 | `¿Gastar IA?` | Filtro de costo: no llama a la IA por un "hola", un botón o un duplicado (dedup + rate-limit ANTES de gastar). |
| 17 | `🤖 IA Anthropic` | La llamada a Claude (texto): entiende la solicitud libre del cliente. Credencial cifrada. |
| 18 | `¿Es imagen?` | Si el cliente mandó foto, entra la rama de visión. |
| 19 | `Obtener URL imagen (Meta)` | Con el media id pide a Meta la URL temporal del archivo (expira ~5 min). |
| 20 | `Descargar imagen (Meta)` | Baja la imagen con el mismo token. |
| 21 | `Preparar IA Visión` | Arma la consulta de VISIÓN: Claude "ve" la foto y devuelve producto/marca/texto visible con el mismo esquema. |
| 22 | `¿Analizar imagen?` | Gate de la visión (interruptor USAR_VISION + condiciones). |

## Circuito D — El Cerebro (nodos 23–25)

| # | Nodo | Qué hace |
|---|------|----------|
| 23 | `Cerebro conversacional` | EL nodo: ~2.400 líneas donde vive toda la lógica. Consentimiento (Ley 1581), marca, nombre, ciudad, perfil, ruteo por producto (la IA manda, keywords de respaldo), rotación justa de asesores, candados anti-duplicado, reclamos→Servicio al Cliente, empleo→ayuda@, proveedores, rescate del que abandona, panel de Deicy ("informe"/"demo"), y el gate de la Fase 2 (`intentaCotizar()`). Decide QUÉ responder y a QUIÉN avisar; los nodos siguientes solo ejecutan. |
| 24 | `¿Hay sesión?` | ¿El Cerebro dejó sesión para guardar? |
| 25 | `Guardar sesión (MySQL)` | Persiste la sesión del cliente en la BD (cura de la carrera del staticData: dos mensajes seguidos ya no se pisan). Marcadores `$1,$2` — nunca `?` (falla en silencio). |

## Circuito E — Fase 2 · Cotización SAP **"MCP EN CASA"** (14 nodos)

> ⚠️ Actualizado 14-ago-2026. La primera versión usaba el conector MCP de Anthropic (el loop corría
> en SUS servidores y había que mandarles el token de SAP). Por requisito de auditoría se cambió a
> **"el token no sale de casa"**: la IA solo DECLARA qué herramienta necesita y **n8n la ejecuta**
> contra mcp.ardisa.com con el token leído de la BD. Como n8n no hace ciclos, el loop se desenrolla
> en una **cadena lineal de 3 vueltas** (R1 → R2 → R3). La numeración exacta de cada nodo vive en el
> **Anexo Técnico** (se regenera del workflow y nunca se desactualiza).

| Nodo | Qué hace |
|------|----------|
| `¿Cotizar?` | ¿El Cerebro armó una cotización? (`hay_cot`: números demo, o todos si `cotiza_alcance='todos'`). |
| `💰 IA Cotización (SAP)` | 1ª llamada a api.anthropic.com declarando la lista blanca de 3 herramientas (buscar_producto, disponibilidad_ciudad, precio_articulo — cartera/ventas NO existen para él). **Sin token de SAP en el cuerpo** (fijado con prueba). |
| `Repartir herramientas R1` | ¿El modelo terminó (texto) o pidió herramientas (`tool_use`)? Un item por llamada pedida, con la historia completa. |
| `¿Fin R1?` | Terminó → Entregar. Pidió herramientas → a ejecutarlas. |
| `SAP sesión R1` | `initialize` contra mcp.ardisa.com (el servidor EXIGE sesión; el `mcp-session-id` llega en un header). ⚠️ Aquí vivía el bug de las llaves `}}` que cortaba la expresión. |
| `SAP consulta R1` | `tools/call` con la herramienta y argumentos que pidió el modelo (token desde la BD, rotación en caliente). Si son varios productos, las llamadas van EN PARALELO. |
| `Armar consulta R2` | Parsea la respuesta SSE (`data: {...}`), empareja cada resultado con su `tool_use_id` y arma la siguiente llamada al modelo. |
| `💰 IA R2` / `Repartir R2` / `¿Fin R2?` / `SAP sesión R2` / `SAP consulta R2` / `Armar consulta R3` / `💰 IA R3` | La 2ª vuelta, idéntica (típico: disponibilidad + precio en paralelo de lo hallado en R1). |
| `Cerrar cotización R3` | Tope de vueltas: si a la 3ª el modelo SIGUE pidiendo herramientas → `type:'error'` y el cliente pasa al asesor. |
| `Entregar cotización` | Guardrails duros: sin texto, con error o con el token `[ASESOR]` → *"Tu solicitud quedó registrada ✅ y será atendida por [la asesora asignada]"* (nunca se expone el problema interno). Guarda el turno en la sesión y el chat completo en el panel. |
| `Responder cotización (Meta)` | Envía la respuesta al cliente por WhatsApp. |

## Circuito F — Respuesta y entrega inmediata (nodos 30–50)

| # | Nodo | Qué hace |
|---|------|----------|
| 30 | `¿Responder al cliente?` | ¿Hay mensaje para el cliente? (los debounce responden después, no aquí). |
| 31 | `Sin respuesta (dup/vacío)` | Basurero de duplicados/vacíos. |
| 32 | `Enviar al cliente (Meta)` | Manda la respuesta del Cerebro al cliente (reintenta 3 veces si Meta falla). |
| 33 | `¿Hay aviso al asesor?` | ¿El Cerebro generó tarjeta para un asesor? |
| 34 | `Avisar al asesor (Meta)` | Envía la tarjeta del lead (texto si su ventana 24h está abierta; plantilla pagada si está cerrada). |
| 35 | `Guardar lead (MySQL)` | INSERT del lead con **candado anti-duplicado a nivel BD**: si ya existe un lead de ese teléfono en 45 min, NO inserta otro (la última línea de defensa contra las carreras). |
| 36 | `Sumar detalle (MySQL)` | Si el candado bloqueó el INSERT, el texto nuevo se SUMA al lead existente (nada se pierde). |
| 37 | `¿Hay lead?` | Bifurca: con lead → cadena de guardado; sin lead → solo aviso. |
| 38 | `¿Lead ya existía?` | ¿El INSERT fue bloqueado por el candado? |
| 39 | `Buscar lead original (MySQL)` | Busca a qué asesor le tocó el lead original. |
| 40 | `¿Asesor del lead original?` | ¿Se encontró? |
| 41 | `Aviso omitido (duplicado)` | Si era duplicado exacto, no se molesta al asesor dos veces. |
| 42 | `Avisar adición (Meta)` | Nota de ADICIÓN al asesor original: "el cliente también escribió…". |
| 43 | `¿Hay aviso 1?` | Gate del aviso en esta cadena. |
| 44 | `¿Registrar chat?` | ¿Hay fila de conversación para guardar? |
| 45 | `Guardar chat (MySQL)` | Cada entrada/salida queda en la tabla `mensajes` (con media id en columna propia — a prueba de carreras). Es la caja negra que usamos en cada auditoría. |
| 46 | `¿Registrar consentimiento?` | ¿Hubo decisión de habeas data? |
| 47 | `Guardar consentimiento (MySQL)` | Registro legal auditable (SÍ y NO, con fecha, política y msg id — Ley 1581/2012). |
| 48 | `¿Hay adjunto?` | ¿Hay fotos/archivos del cliente para reenviar? |
| 49 | `Separar adjuntos` | Convierte la lista de adjuntos en items individuales. |
| 50 | `Reenviar adjunto al asesor (Meta)` | Reenvía cada foto/documento REAL al asesor (si su ventana está cerrada → cola mediaPend). |

## Circuito G — Cierre con debounce (nodos 51–67)

El cliente escribe en ráfaga; el bot espera ~45 s y entrega UNA sola tarjeta con todo (caso J. Vargas).
El cron de inactivos dispara este circuito con `fin_cierre`.

| # | Nodo | Qué hace |
|---|------|----------|
| 51 | `¿Cierre listo?` | ¿Es un cierre que ya cumplió su espera? (viene del cron, no del cliente). |
| 52 | `Leer lead BD (MySQL)` | Relee el lead REAL desde la BD antes de finalizar (la BD manda al entregar — subconsultas escalares, siempre 1 fila). |
| 53 | `Finalizar cierre` | Compone la tarjeta final: todo lo que el cliente escribió + adjuntos releídos de la BD + asesor amarrado. |
| 54 | `¿Hay aviso 2?` | Gate del aviso de esta cadena diferida. |
| 55 | `Avisar al asesor 2 (Meta)` | Envía la tarjeta (misma lógica ventana/plantilla). |
| 56 | `¿Hay lead 2?` | Gate del lead diferido. |
| 57 | `Guardar lead 2 (MySQL)` | INSERT con el mismo candado anti-duplicado. |
| 58 | `Sumar detalle 2 (MySQL)` | Suma al existente si el candado bloqueó. |
| 59 | `¿Lead 2 ya existía?` | ¿Duplicado? |
| 60 | `Buscar asesor del lead (MySQL)` | Encuentra al asesor original del duplicado. |
| 61 | `Redirigir al asesor original` | Re-arma la nota de adición hacia ese asesor (regla de oro: cliente sin atender = mismo asesor). |
| 62 | `Reenviar al asesor original (Meta)` | La envía. |
| 63 | `¿Guardar seguimiento?` | ¿Se creó pendiente de reporte para el asesor? |
| 64 | `Guardar seguimiento (MySQL)` | Persiste el pendiente (Estado/Valor/Obs que llenará el asesor con botones). |
| 65 | `¿Hay adjunto 2?` | Adjuntos de la cadena diferida. |
| 66 | `Separar adjuntos 2` | Igual que el 49. |
| 67 | `Reenviar adjunto 2 (Meta)` | Igual que el 50. |

## Circuito H — Cron de inactivos (nodos 68–71)

Corre CADA MINUTO. Es el corazón que late aunque nadie escriba.

| # | Nodo | Qué hace |
|---|------|----------|
| 68 | `Cada 1 min (inactivos)` | El reloj. |
| 69 | `Revisar inactivos` | El segundo nodo grande: recordatorio a los 12 min ("¿sigues en línea?"), cierre a los ~30, RESCATE del que abandonó (el cron entrega el lead igual), disparo de cierres con debounce, poda de varados, colas `mediaPend` (adjuntos a ventana cerrada: los entrega cuando el asesor escribe, plantilla de destrabe 1/día si llevan >6h, y desde hoy lo que cumple 7 días se reenvía a tu línea de monitoreo en vez de borrarse), recordatorios de seguimiento a asesores (2/día hábil, agrupados, máx 5 días). |
| 70 | `Enviar recordatorio (Meta)` | Manda cada mensaje que el cron decidió. |
| 71 | `Guardar recordatorio (MySQL)` | Y lo deja registrado en `mensajes`. |

## Circuito I — Alertas a tu WhatsApp (nodos 72–77)

Independiente del bot: si el bot se cae, este circuito sigue avisándote.

| # | Nodo | Qué hace |
|---|------|----------|
| 72 | `Cada 10 min (alertas)` | El reloj de las alertas. |
| 73 | `Leer alertas nuevas (MySQL)` | Lee la tabla `alertas` (la llena `vigilante.py` cada hora con lo que detecta solo). |
| 74 | `Armar aviso a Deicy` | Compone el mensaje 🔴/🟡 para tu 320 566 2947. |
| 75 | `Avisar a Deicy (Meta)` | Lo envía. |
| 76 | `¿Llegó el aviso?` | Solo marca como avisada si Meta CONFIRMÓ la entrega (si tu ventana está cerrada, reintenta en 10 min — ninguna alerta se pierde). |
| 77 | `Marcar avisadas (MySQL)` | `avisado_wa=1` para no repetirte alertas. |

## La `Nota`

La nota amarilla de documentación dentro del editor de n8n (no ejecuta nada).

---

## Lo que vive FUERA de n8n (el mismo proyecto)

- **`vigilante.py`** (cron cada hora): detecta errores del bot solo → tabla `alertas` → circuito I.
- **`mcp_token_refresh.py`** (cron cada 10 min): renueva el token OAuth del MCP y lo deja en `config.mcp_sap_token`.
- **`mcp_token_login.py`**: el login inicial del MCP (una persona @ardisa.com autoriza una vez).
- **`monitor.py` / panel web**: salud y leads en vivo. **`check_duplicados.py`**, **backup diario 2:30am**, **reporte semanal lunes 7am**.
- **La BD `bot_ardisa`** (MariaDB): leads, mensajes, consentimientos, sesiones, alertas, config, humano.
