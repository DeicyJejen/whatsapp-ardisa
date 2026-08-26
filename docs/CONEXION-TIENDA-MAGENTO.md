# Documentación de tarea: Conexión del bot de WhatsApp con la tienda en línea (Magento)

**Proyecto:** Bot comercial WhatsApp — Grupo Ardisa / Carpincentro
**Responsable:** Deicy Milena Jejen
**Fecha de implementación:** 24 de agosto de 2026
**Estado:** GraphQL implementado y desplegado en producción · REST autenticado conectado y probado, pendiente de cablear al bot

---

## 1. Objetivo

Que el cliente que escribe por WhatsApp pueda **entrar a ver el producto en la página**: que el bot
identifique lo que pide, le dé el precio real y le entregue el enlace a la ficha publicada. Y que,
cuando esa referencia no exista, le muestre las alternativas que sí están publicadas en lugar de
dejarlo sin nada.

## 2. Componentes involucrados

| Componente | Rol |
|---|---|
| **Magento** (ardisa.com / carpincentro.com) | Catálogo publicado: nombre, ficha, precio de venta al público, imágenes |
| **OpenSearch** (motor de búsqueda de Magento) | Búsqueda tolerante a errores de escritura y sinónimos |
| **SAP B1** vía servidor MCP | **Única fuente del precio** que se le cotiza al cliente |
| **n8n** (workflow `botArdisaFase1x`, 108 nodos) | Orquesta: consulta las dos fuentes, compara y arma la respuesta |
| **MariaDB** | Interruptores y credenciales de configuración |

**La pieza que hace posible todo:** el `sku` de Magento **es** el `ItemCode` de SAP. Ese código común
permite identificar el producto en la web y pedirle su precio real a SAP.

## 3. Arquitectura: dos puertas, dos funciones

Magento expone dos APIs distintas. **Se usan las dos**, cada una para lo que sabe hacer.

### 3.1 GraphQL público — *para entender al cliente* (implementado y en producción)

```
POST https://www.ardisa.com/graphql
{ products(search:"eterboard", pageSize:8) { total_count items { sku name url_key } } }
```

- Es la **misma API que usa la página web para mostrarse a sí misma**. No es raspado de HTML ni un
  atajo: es la puerta oficial del escaparate, y no requiere credenciales porque el catálogo ya es público.
- Pasa por **OpenSearch**, y de ahí viene su mayor valor: tolera errores y sinónimos. El cliente
  escribe *"sanitario elongado"* y encuentra *SANITARIO ALONGADO*; escribe *"tapacanto"* y encuentra
  *CANTO PVC*. La búsqueda interna de SAP es literal y en esos casos devuelve cero.
- Con GraphQL **se pide solo lo que se necesita** (4 campos en vez de la ficha completa). Por eso
  responde en ~0,2 segundos.
- El enlace no se guarda: **se construye** con `web + "/" + url_key + ".html"`. Así nunca queda viejo.

### 3.2 REST autenticado — *para saber la verdad del catálogo* (conectado el 24-ago)

```
GET https://www.ardisa.com/rest/V1/products/10021733
Authorization: Bearer <token>
```

Devuelve lo que GraphQL no puede responder:

| Campo | Para qué sirve |
|---|---|
| `status` | 1 habilitado / 2 deshabilitado |
| `visibility` | si es visible en catálogo y búsqueda |
| `website_ids` | **en cuál de las dos tiendas** está publicado |
| `media_gallery_entries` | las imágenes del producto |
| **404** | el producto **no existe** en el catálogo (≠ existe pero oculto) |

## 4. Cómo se hizo la conexión REST (paso a paso)

1. **Integración creada en el panel de Magento** (`Sistema → Extensiones → Integraciones`), nombre
   `bot-ardisa`.
2. **Permisos mínimos:** pestaña *API* → Acceso a recursos **Personalizado** → únicamente
   **Catálogo** (Inventario, Productos, Categorías). Sin Ventas, sin Clientes, sin Configuración y
   **sin "Subir imágenes"**: el bot solo lee, nunca escribe. Las fotos se pueden leer igual, porque
   vienen dentro de los datos del producto.
3. **Activación:** botón *Activar* → *Permitir*. Magento emite cuatro claves; la que usa el bot es el
   **Access Token**.
4. **Almacenamiento:** el token se guarda en `~/.config/ardisa/magento_token` con permisos `600`
   (solo lo lee el usuario del servidor), igual que la clave SMTP y la llave de la API de n8n.
   **Nunca se escribe en el código ni en el workflow.**
5. **Verificación:** consulta real a un producto conocido, comprobando `status`, `visibility`,
   `website_ids` e imágenes.

## 5. Los cuatro obstáculos y cómo se resolvieron

Los cuatro devolvían un error de autorización; **ninguno significaba lo mismo**. Se avanzó cambiando
una variable a la vez.

| # | Síntoma | Causa real | Solución |
|---|---|---|---|
| 1 | `403 · error code: 1010` | El **firewall del sitio** bloquea a clientes que no parecen navegador | Enviar la cabecera `User-Agent` en toda llamada (GraphQL y REST) |
| 2 | `401 Magento_Catalog::products` | La integración no tenía permiso sobre el catálogo | Marcar **Catálogo** en la pestaña API y **Guardar antes de reautorizar** |
| 3 | Seguía el `401` | Cambiar permisos no actualiza el token ya emitido | **Reautorizar** (emite claves nuevas y anula las viejas) + **limpiar caché** de Magento |
| 4 | Seguía el `401` idéntico | Magento 2.4.4+ trae en **No** la opción *"Allow OAuth Access Tokens to be used as standalone Bearer tokens"*: el token es válido pero la vía está cerrada | Activarla en `Tiendas → Configuración → Servicios → OAuth → Configuración del consumidor` |

**Lección aplicable a cualquier integración:** el mensaje de un error no siempre nombra su causa.
Tres pantallas distintas dijeron "no autorizado" por tres razones diferentes.

## 6. Seguridad

1. El token es de **solo lectura** y **solo sobre el catálogo**, que ya es información pública en la web.
2. Viaja **únicamente por HTTPS** y **solo desde este servidor**.
3. Se guarda **fuera del repositorio**, con permisos `600`, nunca en el código ni en el workflow.
4. Sobre el uso de token Bearer en lugar de OAuth 1.0a firmado: se documenta como **riesgo aceptado
   y acotado** por los tres puntos anteriores. Si Seguridad lo requiere, migrar a OAuth 1.0a firmado
   no obliga a rehacer la lógica del bot, solo la forma de autenticar.
5. Cualquier cambio de permisos obliga a reautorizar, lo que **anula automáticamente el token anterior**.

## 7. Reglas de negocio implementadas

1. **El precio SIEMPRE sale de SAP**, nunca de la web. La web se usa para identificar y para enlazar.
2. **El enlace solo se envía si el precio publicado coincide con el cotizado**, con tolerancia del 1%:
   `|precio_web − precio_sap| ÷ precio_sap ≤ 0,01`. Si no coincide, no se manda enlace — antes que el
   cliente abra la página y vea otro número.
3. **Si el producto no tiene ficha**, se le ofrecen los **parecidos publicados** con su enlace, filtrados
   para que compartan el sustantivo principal y otra palabra distintiva (así no se le ofrece un canto de
   PVC a quien pidió una lámina).
4. **Si la consulta a SAP falla**, responde el catálogo de la web: está prohibido decirle al cliente que
   no manejamos el producto o cambiárselo por otro.
5. **Nunca se mencionan** la página, los sistemas internos ni las fallas técnicas en los mensajes al cliente.

## 8. Verificación (reproducible)

Se dejó el script `tienda.sh` en la raíz del proyecto:

```bash
bash tienda.sh eterboard          # búsqueda por nombre  → 16 fichas publicadas
bash tienda.sh --sku 10021733     # por código           → ficha + precio 34.999,99
bash tienda.sh --sku 10010338     # por código           → "items": []  (sin ficha)
```

Resultados del 24-ago: 8 de 8 búsquedas devolvieron fichas con enlaces válidos (todos respondiendo
HTTP 200) y el buscador corrigió correctamente los términos mal escritos.

## 9. Hallazgos con datos

| Medición | Resultado |
|---|---|
| Productos en el catálogo web | **6.759** |
| De esos, habilitados | **3.379** (la mitad está deshabilitada) |
| Referencias probadas que **no existen** en la web | Melamínico Vesto RH Roble Americano 215X244X18 y SOFTWOOD, Aglomerado MDP 122X244X15 |
| Coincidencia de precios web vs SAP (muestra de 24 productos) | **5 de 24** dentro del 1% |

**Conclusión:** el mecanismo del enlace funciona y está verificado (cemento y Eterboard lo envían hoy).
Donde no aparece el enlace es porque **la referencia no está publicada** o porque **la web tiene un
precio distinto al de la lista de SAP**. Ambas cosas se corrigen en el catálogo, no en el bot.

## 10. Pendientes y responsables

| Pendiente | Responsable |
|---|---|
| Cablear el REST autenticado dentro del bot (confirmar ficha antes de enviar el enlace) | Desarrollo |
| Definir qué lista de precios publica la web y sincronizarla con SAP | Comercial |
| Publicar las referencias que se venden y no tienen ficha; revisar las 3.380 deshabilitadas | Tienda en línea / Mercadeo |
| Estabilidad del servidor de consultas a SAP (caídas y consultas de más de 27 s) | SAP / TI |
| Credencial de servicio para SAP que no dependa del inicio de sesión de una persona | SAP / TI |
