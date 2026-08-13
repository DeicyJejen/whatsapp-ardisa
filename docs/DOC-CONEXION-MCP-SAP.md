# Documentación de tarea: Conexión del bot de WhatsApp al MCP de SAP Business One

**Proyecto:** Bot comercial WhatsApp — Grupo Ardisa / Carpincentro (Fase 2: cotización)
**Responsable:** Deicy Milena Jejen
**Fecha de implementación:** 13 de agosto de 2026
**Estado:** Implementado, probado end-to-end y desplegado a producción (piloto controlado)

---

## 1. Objetivo

Conectar el bot de WhatsApp con el inventario y los precios de SAP Business One en tiempo real,
para que el asistente pueda responder a los clientes qué productos se manejan, si hay disponibilidad
en su ciudad, en qué unidad se venden y su precio de referencia — **sin exponer credenciales a
terceros y sin acceso de escritura al ERP** (requisito de auditoría interna).

## 2. Componentes involucrados

| Componente | Rol |
|---|---|
| **Servidor MCP** (`https://mcp.ardisa.com/mcp`, sap-b1-mcp v3.4.2) | Expone SAP B1/HANA como catálogo de consultas de **solo lectura** (funciones SQL SECURITY DEFINER). Administrado por el equipo SAP/TI |
| **n8n** (workflow `botArdisaFase1x`, 91 nodos) | Orquesta el bot; **ejecuta directamente** las consultas al MCP |
| **Anthropic Claude** (API) | Modelo de IA que entiende al cliente y redacta; **no posee credenciales** |
| **MariaDB** (tabla `config`) | Guarda URL, token vigente e interruptores del piloto |
| **Microsoft 365 de Ardisa** | Proveedor de identidad del OAuth del servidor MCP |

## 3. Cómo se hizo la conexión (paso a paso)

### 3.1 Autenticación — OAuth 2.0 delegado en Microsoft 365

El servidor MCP exige OAuth (no acepta conexiones anónimas ni tokens estáticos):

1. **Registro dinámico de cliente** (RFC 7591): se registró la aplicación "Bot WhatsApp Ardisa"
   en `https://mcp.ardisa.com/register`, obteniendo `client_id` y `client_secret` propios del bot
   (almacenados en el servidor con permisos 600, fuera del repositorio).
2. **Autorización única con cuenta corporativa**: flujo *authorization code + PKCE (S256)*.
   El consentimiento delega el login en el **Microsoft 365 de Ardisa**: una persona con cuenta
   @ardisa.com autorizó una única vez.
3. **Canje del código por tokens**: se obtuvo el `access_token` (vigencia ≈ 67 minutos, alcance
   `read` — solo lectura) y el `refresh_token` (permite renovar sin repetir el login).
4. **Renovación automática**: el cron `mcp_token_refresh.py` corre **cada 10 minutos**; renueva el
   token antes de su vencimiento y deja el vigente en la base de datos (`config.mcp_sap_token`).
   El bot lo lee en cada mensaje → **rotación en caliente**, sin despliegues ni reinicios.
   Los fallos de renovación quedan en `reportes/cron_mcp_token.log`, vigilado cada hora.

### 3.2 Arquitectura de consumo — "el token no sale de casa"

Decisión de diseño (requisito de auditoría): **el modelo de IA no recibe credenciales.**

```
Cliente (WhatsApp) → n8n (Cerebro decide cotizar)
    → [1] Llamada a Anthropic: pregunta + DECLARACIÓN de herramientas (sin token)
    ← el modelo responde: "necesito llamar buscar_producto('cemento')"
    → [2] n8n ejecuta la consulta contra mcp.ardisa.com (token leído de la BD)
    → [3] n8n reenvía el RESULTADO a Anthropic
    ← el modelo redacta la respuesta final
    → [4] n8n la envía al cliente por WhatsApp
```

- Hasta **3 vueltas** de herramientas por consulta (búsqueda → disponibilidad + precio en paralelo →
  redacción); si se excede, el bot deriva al asesor humano.
- Protocolo: JSON-RPC del estándar MCP con sesión (`initialize` → `tools/call` con `mcp-session-id`).
- A Anthropic viajan únicamente la pregunta del cliente y los resultados de las consultas.

### 3.3 Lista blanca de herramientas

El servidor expone 20 consultas (incluida cartera, ventas, compras y contabilidad). El bot solo
declara — y por tanto solo puede usar — **las de mostrador**:

| Herramienta | Uso |
|---|---|
| `buscar_producto` | Identificar el artículo por descripción o código |
| `disponibilidad_ciudad` | Si hay o no hay inventario en la ciudad del cliente (sin cantidades exactas) |
| `precio_articulo` | Precio de venta con IVA calculado y unidad de venta (activada el 13-ago; cascada: precio especial del cliente → lista del cliente → lista general) |

Cartera, ventas, compras y contabilidad **no existen** para el bot.

### 3.4 Guardrails del modelo

Reglas estrictas en el prompt del sistema, verificadas con pruebas: prohibido inventar precios,
referencias o inventario; sin cantidades exactas de stock; todo precio se entrega como *"precio de
referencia — tu asesor te lo confirma"* con su unidad de venta; producto inexistente o falla técnica
→ derivación silenciosa al asesor (el cliente nunca ve el error interno); el texto del cliente se
trata como contenido, no como instrucciones (anti prompt-injection).

## 4. Seguridad (resumen para auditoría)

1. El **token nunca sale de la infraestructura propia** (BD local → n8n → mcp.ardisa.com).
2. Token de **solo lectura** (scope `read`), **vida corta** (~1 h) y **rotación automática**.
3. La IA **no posee credenciales**: declara la consulta; la plataforma la ejecuta.
4. **Lista blanca**: 3 herramientas de mostrador de 20 disponibles.
5. El servidor MCP es de **solo lectura** sobre SAP (SECURITY DEFINER, sin SQL libre).
6. Restricción **fijada con prueba automatizada**: un despliegue que incluya el token en el cuerpo
   hacia Anthropic es bloqueado por la suite (~320 aserciones) antes de llegar a producción.
7. Piloto controlado por interruptores en BD (`usar_cotiza`, `cotiza_alcance`): encendido, alcance
   y reversa sin despliegues.

## 5. Verificación realizada

- **Suite completa** de pruebas del proyecto en verde (incluye 9 pruebas del ciclo de herramientas
  y la aserción de seguridad del token).
- **Pruebas end-to-end contra el API y el SAP reales** (13-ago): identificación de producto, marcas,
  unidad de venta, precio con IVA ($ verificado contra lista de ventas), producto sin precio en
  lista (degrada a asesor), producto inexistente (deriva a asesor), resistencia a inyección de
  instrucciones, negativa a revelar cantidades exactas o sistemas internos.
- Despliegue con protocolo de candado: build validado → suite → ventana sin tráfico → snapshot de
  reversa → verificación automática post-deploy (lo desplegado == lo probado).

## 6. Pendientes (fuera del alcance de esta tarea)

| Pendiente | Responsable |
|---|---|
| Cargar precios de lista faltantes (ej. artículo 10025215 sin precio en lista 1) | Comercial |
| Persistir los registros de clientes OAuth entre reinicios del servidor MCP (hoy un reinicio obliga a re-autorizar) | Equipo SAP/TI |
| Salida de piloto a todos los clientes (`cotiza_alcance='todos'`) tras validación funcional | Deicy Jejen |
