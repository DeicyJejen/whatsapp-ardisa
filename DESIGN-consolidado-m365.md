# Diseño — Consolidado de leads en Microsoft 365 + Alertas de fallo

Estado: **listo para implementar**. Bloqueado solo por el *app registration* de Azure (TI). Hoy los leads YA se guardan como red de seguridad en `store.leads` (staticData n8n); esto los lleva a un Excel accesible con dueño.

## Arquitectura
`Cerebro (etapa=cierre)` → nodo "Guardar lead (Graph)" → **tabla de Excel en SharePoint/OneDrive**.
Si el guardado falla → queda en `store.leads` (ya implementado) + dispara alerta. Nunca se pierde.

## 1) Lo que TI debe crear en Azure (una vez)
1. **App registration** (Azure AD → App registrations → New): nombre `n8n-bot-ardisa`, single tenant.
2. **API permissions** → Microsoft Graph → **Application permissions** (flujo app-only, sin usuario):
   - `Files.ReadWrite.All` (si el archivo vive en OneDrive) **o** `Sites.ReadWrite.All` (si vive en SharePoint).
   - **Grant admin consent** (botón).
3. **Client secret** (Certificates & secrets → New client secret) → copiar el **Value**.
4. Anotar: **Tenant ID**, **Client ID**, **Client Secret**.
5. Crear el **libro Excel** en SharePoint/OneDrive con una **tabla** (Insertar → Tabla) llamada `Leads`, con encabezados (ver §4). Anotar la ruta o el `driveId` + `itemId` del archivo.

> Estos 3 secretos (Tenant/Client ID/Secret) me los pasas para meterlos como **credencial cifrada** en n8n (nunca en el código).

## 2) Credencial en n8n
Una credencial "Header Auth" NO sirve aquí (OAuth). Opciones:
- **Recomendado (app-only):** obtener token con *client credentials* y usar HTTP Request. Token endpoint:
  `POST https://login.microsoftonline.com/{TENANT}/oauth2/v2.0/token`
  body x-www-form-urlencoded: `client_id`, `client_secret`, `scope=https://graph.microsoft.com/.default`, `grant_type=client_credentials`.
  → guardar `client_id`/`client_secret`/`tenant` como credencial n8n; cachear el token (~60 min) en staticData.

## 3) Nodo de guardado (HTTP Request → Graph)
Append de una fila a la tabla `Leads`:
```
POST https://graph.microsoft.com/v1.0/drives/{driveId}/items/{itemId}/workbook/tables/Leads/rows
Authorization: Bearer {token_graph}
Content-Type: application/json
{ "values": [[ "<fecha ISO>","<wa>","<nombre>","<ciudad>","<marca>","<ocupacion>","<interes>","<solicitud>","<detalle>","<asesor>","<tienda>","<fuera_horario>" ]] }
```
- `retryOnFail:true`, `timeout:15000`.
- Rama de error → NoOp que deja el registro en `store.leads` (ya está) para reconciliar luego.

## 4) Columnas de la tabla `Leads`
`fecha` · `telefono` · `nombre` · `ciudad` · `marca` · `ocupacion` · `interes` · `solicitud` · `detalle` · `asesor` · `tienda` · `fuera_horario`
(mapea 1:1 con el objeto que ya arma el Cerebro / con cada item de `store.leads`.)

## 5) Backfill (una vez, al activar)
Empujar los leads ya acumulados en `store.leads` a la tabla, luego dejar el flujo en vivo.

## 6) Gobernanza (crítico para adopción — de la auditoría)
- **Dueño asignado** que revise la hoja a diario (si no, "nace muerta").
- **Ley 1581 (Habeas Data):** la hoja tiene PII → restringir acceso por permisos de SharePoint, definir retención y registrar la finalidad. Minimizar campos.
- KPIs (Looker/tablas dinámicas): leads/día, por ciudad/marca, % fuera de horario, carga por asesor (verifica el round-robin).

---

# Alertas de fallo (la otra mitad de "cero pérdida")
Workflow "Error - Bot Ardisa" con un nodo **Error Trigger** → HTTP Request (credencial WhatsApp ya verificada) que envía a Deicy:
`⚠️ El bot tuvo un fallo en {{workflow}} / {{node}}: {{error}}`
Luego: en el bot, `settings.errorWorkflow = <id>`. Solo dispara ante errores reales (raros). Da visibilidad inmediata a fallos que hoy son invisibles.
**Decisión tuya:** ¿quieres estas alertas a tu WhatsApp? Si sí, lo creo y lo cableo (5 min).
