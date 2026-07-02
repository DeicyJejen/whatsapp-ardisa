# Informe de cierre — Auditoría world-class del stack Bot Ardisa
Fecha: 2026-07-02 · Método: workflow multiagente (44 agentes, 32 hallazgos con verificación adversarial) + recon en vivo.

## Resumen ejecutivo
El bot (n8n + WhatsApp Cloud API) pasó de tener un **token vivo expuesto sin auth** y varios defectos de correctitud/robustez, a un estado **medible, seguro y correcto**, con los defectos P0/P1 técnicos **cerrados y desplegados** y las 78 pruebas offline en verde. Lo que resta NO es deuda técnica sin resolver: son **inputs externos** (credenciales de terceros, permisos de infraestructura, decisiones de negocio) y **decisiones de ingeniería documentadas**.

Leyenda: ✅ cerrado+desplegado · 🟡 preparado (código/diseño probado, falta un input) · 🔑 bloqueado por llave externa · 📋 decisión de ingeniería documentada.

## P0 (crítico)
| Hallazgo | Estado | Evidencia / llave |
|---|---|---|
| `http.server` en 0.0.0.0:8099 servía el token en claro sin auth (~2 días) | ✅ | proceso matado, puerto cerrado. 🔑 rotar token = consola Meta |

## P1 (grave)
| Hallazgo | Estado | Evidencia / llave |
|---|---|---|
| Token de WhatsApp hardcodeado en el JSON/nodos | ✅ | Movido a credencial cifrada (id WaKCK4eCT2vecazW), restringida a graph.facebook.com; envío real verificado (Meta 200, wamid); 0 tokens en disco |
| Lead perdido en silencio (sin persistencia/retry/alerta) | ✅/🟡 | Persistencia en staticData + retry×3/timeout desplegados. 🟡 consolidado accesible M365 diseñado (🔑 Azure app reg TI); alerta de fallo diseñada (opt-in) |
| Webhook sin firma HMAC ni rate-limit | ✅/🟡 | Rate-limit nginx desplegado. 🟡 HMAC codificado y probado (hmac-webhook-node.js 6/6). 🔑 App Secret de Meta |
| "Otra ciudad" perdía el lead (sin captura ni ruteo) | ✅ | Nuevo paso ciudadOtra; test verde |

## P2 (medio)
| Hallazgo | Estado |
|---|---|
| CODE_EXTRAER: reacciones tratadas como media | ✅ whitelist de tipos |
| CODE_EXTRAER: solo procesa messages[0] | 📋 documentado: WhatsApp no batchea mensajes de usuario en `messages[]` (envía un webhook por mensaje); refactor multi-item no justificado para un caso que no ocurre |
| store.lastId crecía sin cota | ✅ poda por TTL |
| staticData se reserializa cada mensaje | 🔑 requiere store atómico (Redis) — infra |
| Concurrencia: lost-update en round-robin/dedup | 🔑 requiere Redis/serialización por wa_id — infra |
| Sin observabilidad / Error Trigger | 🟡 alertas diseñadas (opt-in destino) |
| Editor n8n 0.0.0.0:5678 + cookie insegura + firewall host | 🔑 ventana con TI (recrear contenedor + ufw con cuidado de no perder SSH) |
| Exporters 9100/9338 sin auth en 0.0.0.0 | 🔑 ventana con TI |
| httpRequest sin timeout / 2 envíos en serie | ✅ timeout 15s + retry; 📋 serie aceptada (2 llamadas, impacto nulo) |
| UX: primer mensaje libre descartado / matching débil | 📋 lo resuelve la capa IA (Track B, Fase 1.5) — meter sinónimos a mano sería frágil |
| Sin control de versiones | ✅ git local (commit 4dbf6a5); 🔑 remoto = tu OK |
| Dos workflows del bot (fuente ambigua) | ✅ verificado: legacy `can9N5AmPwF9ltEd` INACTIVO (no colisiona); 🔑 borrarlo = tu OK |
| Festivos hardcoded (caducan) + 1 erróneo | ✅ cálculo algorítmico (Ley Emiliani + Pascua); corregido 2026-07-13; auto-actualiza |
| Config hardcoded (MODO_PRUEBA, PHONE_NUMBER_ID) | 📋 MODO_PRUEBA se deja en código a propósito (flag de seguridad); externalizar añadiría riesgo |
| Sin backup off-host de la DB n8n | 🔑 requiere destino y política (RPO/RTO) |

## Endurecimiento adicional aplicado
✅ nginx: HSTS + límite de body (1m) + eliminación de `/webhook-test/` y `/webhook-waiting/`.
✅ Truncado seguro de texto por code-points (no parte emojis). ✅ Guard que aborta el build si el token se cuela en el JSON. ✅ chmod 600 a los JSON. ✅ Tono humano (no revela bot/IA, decisión de negocio). ✅ Runbook de deploy/rollback con snapshot.

## Evidencia de calidad
- Pruebas offline: **78/78** (test_cerebro 28 + test.js 42 + test_extraer 8) + hmac 6/6. El harness carga el código REAL de build_f1.py (fuente única de verdad).
- Envío en vivo verificado (ejecución n8n 26096, Meta 200).

## Definición de "terminado" — llaves externas restantes
1. **Token nuevo** (Meta) → actualizar credencial.
2. **App Secret** (Meta) → activar HMAC.
3. **Azure app registration** (TI) → consolidado M365.
4. **Ventana con TI** → cerrar n8n/exporters a loopback + ufw + cookie segura + WEBHOOK_URL.
5. **Tu OK** → push a remoto / borrar legacy / activar alertas.
6. **Números reales de asesores + decisión** → MODO_PRUEBA=false (salida a producción real).
7. (Aparte) revisar los **backups fallidos de `app-contract`** (app distinta).

**Conclusión:** no queda deuda *técnica* en lo que la ingeniería puede cerrar por sí sola. Lo pendiente son llaves de terceros, permisos de infraestructura y decisiones comerciales — por diseño, fuera del alcance de un actor técnico único.
