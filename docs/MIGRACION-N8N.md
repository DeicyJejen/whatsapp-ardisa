# Migración de n8n a una máquina nueva

**Para:** quien vaya a ejecutar la migración
**Objetivo:** levantar n8n **2.32.7** en una máquina nueva, con los 47 workflows y las 6 credenciales, y mover el tráfico cuando esté probado
**Motivo:** la instancia actual corre **2.22.4**, con 30 avisos de seguridad publicados que le aplican (17 de severidad alta). Actualizar en caliente sobre 46 workflows productivos es un riesgo que no hace falta correr.

> **La máquina vieja no se toca hasta el último paso.** Todo lo anterior es copiar y probar. Si algo no cuadra, se abandona la nueva y no pasó nada.

---

## 0. Lo que hay que decidir ANTES de crear la máquina

### ⚠️ Los 46 workflows dependen de un servicio de la máquina actual

```
workflows con referencias locales:  46 de 47
todos apuntan a:                    host.docker.internal:8001
qué es el 8001:                     hana-api.service — "HANA Query API for n8n"
                                    /opt/hana-api · uvicorn · FastAPI
```

Todos los workflows corporativos consultan SAP a través de esa API. **Si n8n se muda solo, los 46 dejan de ver SAP el día del cambio.**

| Opción | Qué implica |
|---|---|
| **A. Mover también `hana-api`** *(recomendada)* | La máquina nueva queda autocontenida y la vieja se puede apagar de verdad. Hay que confirmar que la nueva alcanza el HANA de SAP (reglas de red hacia el servidor SAP). |
| **B. Dejar `hana-api` en la vieja** | Menos trabajo, pero hay que abrir el 8001 entre las dos máquinas **y cambiar `host.docker.internal:8001` por la IP nueva en los 46 workflows**. Y la vieja ya no se puede apagar. |

**Esta decisión cambia cómo se arma la máquina. Tomala primero.**

### Qué hay que instalar en la máquina nueva

| Componente | Para qué |
|---|---|
| Docker + Docker Compose | n8n |
| MariaDB / MySQL | base `bot_ardisa` (leads, mensajes, consentimientos, alertas) |
| nginx + certbot | publicar `bot.ardisa.com` y `n8n.ardisa.com` con HTTPS |
| Python 3 + `sqlite3` | los scripts del bot (vigilante, respaldos, reportes) |
| `hana-api` | **solo si se eligió la opción A** |

Tamaño: la actual usa 35 GB de 48 GB, y **3 GB son historial de ejecuciones que no se migra**. Con 30 GB de disco sobra.

---

## 1. Inventario de lo que se mueve

| Qué | Dónde está | Tamaño | Nota |
|---|---|---|---|
| Base de n8n | volumen `/opt/n8n/data` | 3,1 GB | **el historial no se migra** → queda en unos MB |
| **Clave de cifrado** | `/home/node/.n8n/config` (dentro del volumen) | — | 🔴 **sin esto las 6 credenciales son irrecuperables** |
| Variables | `/opt/n8n/.env` | — | contiene `META_APP_SECRET` y demás |
| Base del bot | MariaDB `bot_ardisa` | 2,2 MB | 6 tablas |
| Scripts del bot | `/home/ubuntu/whatsapp-ardisa` | — | está en git |
| Tareas programadas | cron de **root** (1) y de **ubuntu** (4) | — | ⚠️ son dos crontabs distintos |
| nginx | `/etc/nginx` | — | incluye `conf.d/n8n-admin.conf` |

### Las 6 credenciales (por si hay que rehacerlas)

```
SMTP account                          smtp
HANA API Token                        httpHeaderAuth
WhatsApp Ardisa Token                 httpHeaderAuth
WhatsApp Token Somos Ardisa (nuevo)   httpHeaderAuth
MySQL Leads Ardisa                    mySql
Anthropic API Key (Fase 2)            httpHeaderAuth
```

---

## 2. Las tres cosas que se olvidan siempre

### 🔴 1. La clave de cifrado

Está en `/home/node/.n8n/config`, **dentro del volumen `data`**. El script la lleva porque copia la carpeta entera.

**Si en cambio exportás los workflows a JSON y los importás en la nueva, las 6 credenciales quedan ilegibles.** Recuperarlas es pedir de nuevo el token de WhatsApp a Meta, el de SAP, el de Anthropic y la contraseña SMTP. Evitable: copiá la carpeta.

### 🟠 2. El estado vivo del bot

Las conversaciones abiertas, los candados anti-duplicado y el turno de rotación de asesores viven **dentro de la base de n8n**, en el campo `staticData` del workflow `botArdisaFase1x` (~120 KB).

Si la máquina nueva arranca con ese campo vacío, el día del cambio **los clientes que estén conversando arrancan de cero y algunos leads se duplican**.

👉 Por eso el cambio se hace **fuera de horario, sin conversaciones abiertas**. El paso `verificar` comprueba que ese estado viajó.

### 🟠 3. Los dos n8n no pueden atender a la vez

Si la vieja sigue con los workflows activos cuando la nueva empieza a recibir, **los dos procesan y se duplican los leads y los avisos a los asesores**.

👉 En el paso `cambio`: primero **desactivar en la vieja**, después activar en la nueva.

---

## 3. Un cambio que conviene aprovechar

El compose actual publica el puerto en todas las interfaces:

```yaml
ports:
  - "5678:5678"            # ← queda expuesto si el firewall de la nube falla
```

En la máquina nueva va atado a local (**el script ya lo escribe así**):

```yaml
ports:
  - "127.0.0.1:5678:5678"  # ← solo local; nginx es la única puerta
```

Con eso n8n deja de depender de que el Security Group esté bien puesto. Se entra por `https://n8n.ardisa.com`, que exige HTTPS y filtra por la IP de la oficina.

---

## 4. El procedimiento

El script `migrar_n8n.sh` (en la raíz del repositorio) guía cada paso y verifica. **Ningún paso borra nada de la máquina vieja.**

```bash
# ── EN LA MÁQUINA VIEJA ──────────────────────────────────────────
sudo ./migrar_n8n.sh revisar          # qué hay y qué se rompe. No cambia nada.
sudo ./migrar_n8n.sh respaldar        # arma el paquete. Solo lee.

# pasar el paquete por la red interna (NUNCA por correo ni WhatsApp:
# lleva las credenciales cifradas Y la clave que las abre)
scp /root/migracion-n8n/n8n-migracion-*.tar.gz* usuario@MAQUINA-NUEVA:/root/

# ── EN LA MÁQUINA NUEVA ──────────────────────────────────────────
sudo ./migrar_n8n.sh restaurar /root/n8n-migracion-XXXX.tar.gz
sudo ./migrar_n8n.sh verificar        # NO seguir hasta que salga sin fallos

# ── CUANDO TODO ESTÉ VERDE, FUERA DE HORARIO ─────────────────────
sudo ./migrar_n8n.sh cambio

# ── SI ALGO SALE MAL ─────────────────────────────────────────────
sudo ./migrar_n8n.sh volver-atras
```

Para instalar otra versión: `VERSION_NUEVA=2.33.0 sudo -E ./migrar_n8n.sh restaurar ...`

### Qué hace cada paso

| Paso | Dónde | Qué hace | ¿Modifica algo? |
|---|---|---|---|
| `revisar` | vieja | Cuenta workflows, credenciales y ejecuciones. Comprueba la clave de cifrado. **Detecta las dependencias con la máquina actual.** | No |
| `respaldar` | vieja | Copia consistente de la base (sin parar n8n), la carpeta de config con la clave, el `.env`, los workflows en JSON, el volcado de `bot_ardisa`, los dos crontabs y nginx. Descarta el historial **de la copia**. Empaqueta y firma con SHA-256. | No |
| `restaurar` | nueva | Verifica la firma, restaura el volumen, escribe el compose con la versión nueva y el puerto en local, restaura `bot_ardisa`, levanta n8n y espera a que responda. | Sí, en la **nueva** |
| `verificar` | nueva | Versión, salud, puerto no expuesto, cuentas de workflows/credenciales, **que el estado vivo del bot viajó**, que `hana-api` responde, que `bot_ardisa` se lee, que el cron está. | No |
| `cambio` | nueva | Guía la activación, el cambio de DNS/nginx y la prueba de punta a punta. | Sí |
| `volver-atras` | vieja | Cómo revertir. | No |

---

## 5. Lo que el script NO hace (a mano)

1. **Instalar la base del sistema** en la máquina nueva (Docker, MariaDB, nginx, Python).
2. **Crear el usuario de MySQL del bot** y sus permisos. En la actual:
   ```sql
   CREATE USER 'n8nbot'@'172.%' IDENTIFIED BY '<contraseña>';
   GRANT SELECT, INSERT ON bot_ardisa.* TO 'n8nbot'@'172.%';
   GRANT UPDATE ON bot_ardisa.leads TO 'n8nbot'@'172.%';
   GRANT UPDATE ON bot_ardisa.alertas TO 'n8nbot'@'172.%';
   ```
   > 📌 Aprovechá para **no** dar `UPDATE` sobre todo el esquema: la tabla `consentimientos` es el registro legal de Habeas Data y no debería poder modificarse (hallazgo SEC-07 de la auditoría).

   Y la regla de firewall para que el contenedor llegue a la base:
   ```bash
   ufw allow from 172.16.0.0/12 to any port 3306
   ```
   > ⚠️ Si falta, el bot entra en bucle: ya pasó una vez.

3. **Recrear los dos crontabs** (`crontab-root.txt` y `crontab-ubuntu.txt` vienen en el paquete):
   ```bash
   crontab -u ubuntu /root/migracion-n8n/crontab-ubuntu.txt
   crontab -u root  /root/migracion-n8n/crontab-root.txt
   ```
4. **nginx y certificados**:
   ```bash
   certbot --nginx -d bot.ardisa.com -d n8n.ardisa.com
   ```
   La config viene en `nginx.tar.gz`. Mantené el `allow 181.204.220.34; deny all;` de `conf.d/n8n-admin.conf`.
5. **Clonar el repositorio del bot**: `git clone` en `/home/ubuntu/whatsapp-ardisa`, más el directorio de secretos `~/.config/ardisa/` (modo `700`, archivos `600`).
6. **Actualizar la URL del webhook en Meta** si cambia el dominio. Si `bot.ardisa.com` solo cambia de IP, **no hay que tocar nada en Meta**.

---

## 6. Comprobación final (cuando ya recibe tráfico)

- [ ] Los 46 workflows aparecen **activos** en el editor
- [ ] Se abre una credencial y **el valor se ve** (prueba de que la clave de cifrado viajó)
- [ ] `https://bot.ardisa.com/webhook/bot-wsp-ardisa-f1` responde **200** a un POST
- [ ] **Un WhatsApp real al bot** desde un celular: contesta, y el lead aparece en `bot_ardisa.leads`
- [ ] Un mensaje con **firma inválida** se descarta:
      ```bash
      curl -X POST -H 'X-Hub-Signature-256: sha256=0000' \
           -H 'Content-Type: application/json' --data '{"entry":[{"changes":[]}]}' \
           https://bot.ardisa.com/webhook/bot-wsp-ardisa-f1
      ```
      Devuelve 200 (Meta lo exige), pero en n8n la ejecución debe terminar en **«Descartado (firma inválida)»** y no debe entrar nada a `mensajes`.
- [ ] Un workflow que use SAP devuelve datos (comprueba `hana-api`)
- [ ] `docker port n8n` **no** muestra `0.0.0.0`
- [ ] Al día siguiente: llegó el correo del vigilante y corrió el respaldo de las 2:30

---

## 7. Después del cambio

**Dejá la máquina vieja encendida y sin tocar durante una semana.** Es la vuelta atrás. Apagala recién cuando pase un lunes completo (día del reporte semanal) sin incidencias.

Cuando se apague, revisá que no quede nada apuntando a su IP: la pauta de Meta, el DNS y cualquier integración de otra área.

---

## Contacto

Dudas sobre el bot de WhatsApp: **Deicy Jején** — `deicy.jejen@ardisa.com`

El código del bot vive en `/home/ubuntu/whatsapp-ardisa` (git). La fuente única de verdad es `build_f1.py`: **el JSON del workflow se genera desde ahí**, no se edita a mano.
