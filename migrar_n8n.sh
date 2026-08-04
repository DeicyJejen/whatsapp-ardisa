#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  MIGRACIÓN DE n8n A UNA MÁQUINA NUEVA  ·  Grupo Ardisa
#  Levanta la instancia nueva AL LADO de la vieja (azul/verde). La vieja no se
#  toca hasta el paso `cambio`, y hasta ese momento se puede abandonar todo sin
#  consecuencias.
#
#  USO — se ejecuta por pasos, en el orden que dice cada mensaje:
#     EN LA MÁQUINA VIEJA:    sudo ./migrar_n8n.sh revisar
#                             sudo ./migrar_n8n.sh respaldar
#     EN LA MÁQUINA NUEVA:    sudo ./migrar_n8n.sh restaurar <paquete.tar.gz>
#                             sudo ./migrar_n8n.sh verificar
#     CUANDO TODO ESTÉ BIEN:  sudo ./migrar_n8n.sh cambio          (en la NUEVA)
#     SI ALGO SALE MAL:       sudo ./migrar_n8n.sh volver-atras    (en la VIEJA)
#
#  Ningún paso borra nada de la máquina vieja. `cambio` solo DESACTIVA workflows.
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

VERSION_NUEVA="${VERSION_NUEVA:-2.32.7}"   # exportá otra si querés fijar una distinta
DIR_N8N="${DIR_N8N:-/opt/n8n}"
DIR_TRABAJO="${DIR_TRABAJO:-/root/migracion-n8n}"
BD_BOT="bot_ardisa"
WF_BOT="botArdisaFase1x"

# ── presentación ──────────────────────────────────────────────────────────────
if [ -t 1 ]; then V=$'\e[32m'; R=$'\e[31m'; A=$'\e[33m'; N=$'\e[0m'; B=$'\e[1m'
else V=""; R=""; A=""; N=""; B=""; fi
ok()    { echo "  ${V}✔${N} $*"; }
mal()   { echo "  ${R}✘${N} $*"; }
avisa() { echo "  ${A}!${N} $*"; }
paso()  { echo; echo "${B}── $* ──${N}"; }
muere() { echo; echo "${R}${B}ABORTADO:${N} $*"; echo; exit 1; }

confirmar() {   # confirmar "pregunta"  -> exige escribir SI en mayúsculas
  echo; echo "${A}${B}$1${N}"
  read -r -p "  Escribí SI (mayúsculas) para continuar: " resp
  [ "$resp" = "SI" ] || muere "cancelado por el operador"
}

hace_falta() { command -v "$1" >/dev/null 2>&1 || muere "falta el comando '$1'. Instalalo y volvé a intentar."; }

compose() {   # funciona con 'docker compose' y con 'docker-compose'
  if docker compose version >/dev/null 2>&1; then (cd "$DIR_N8N" && docker compose "$@")
  else (cd "$DIR_N8N" && docker-compose "$@"); fi
}

# lee un dato de la base de n8n sin depender del contenedor
consulta_sqlite() { sqlite3 "$1" "$2" 2>/dev/null || echo "?"; }

# ═══════════════════════════════════════════════════════════════════════════════
#  PASO 0 — REVISAR (en la máquina VIEJA). No cambia nada.
# ═══════════════════════════════════════════════════════════════════════════════
cmd_revisar() {
  echo "${B}REVISIÓN DE LA MÁQUINA ACTUAL${N}  ($(hostname))"
  hace_falta docker; hace_falta sqlite3; hace_falta tar

  paso "1. El contenedor de n8n"
  docker inspect n8n >/dev/null 2>&1 || muere "no existe un contenedor llamado 'n8n' en esta máquina"
  local img estado
  img=$(docker inspect -f '{{.Config.Image}}' n8n)
  estado=$(docker inspect -f '{{.State.Status}}' n8n)
  ok "imagen actual : $img"
  ok "estado        : $estado"
  echo "     versión a instalar en la nueva: ${B}$VERSION_NUEVA${N}"

  paso "2. Qué hay que llevarse"
  local tmp; tmp=$(mktemp -d); trap 'rm -rf "$tmp"' RETURN
  docker cp n8n:/home/node/.n8n/database.sqlite "$tmp/db.sqlite" >/dev/null 2>&1 \
    || muere "no pude leer la base de n8n del contenedor"
  local wf act cred eje
  wf=$(consulta_sqlite  "$tmp/db.sqlite" "SELECT COUNT(*) FROM workflow_entity;")
  act=$(consulta_sqlite "$tmp/db.sqlite" "SELECT COUNT(*) FROM workflow_entity WHERE active=1;")
  cred=$(consulta_sqlite "$tmp/db.sqlite" "SELECT COUNT(*) FROM credentials_entity;")
  eje=$(consulta_sqlite "$tmp/db.sqlite" "SELECT COUNT(*) FROM execution_entity;")
  ok "workflows      : $wf   (activos: $act)"
  ok "credenciales   : $cred"
  ok "ejecuciones    : $eje   ${A}(historial: NO se migra, se deja atrás)${N}"
  ok "tamaño base    : $(du -h "$tmp/db.sqlite" | cut -f1)"

  paso "3. La clave de cifrado (SIN ESTO LAS CREDENCIALES SE PIERDEN)"
  if docker exec n8n test -f /home/node/.n8n/config 2>/dev/null; then
    ok "encontrada en /home/node/.n8n/config — viaja dentro del respaldo"
  else
    mal "NO la encontré en /home/node/.n8n/config"
    avisa "buscala como N8N_ENCRYPTION_KEY en $DIR_N8N/.env — si no está en ninguno de los"
    avisa "dos sitios, PARÁ: sin ella no se recuperan los tokens de WhatsApp, SAP ni Anthropic."
  fi

  paso "4. Dependencias con ESTA máquina (lo que se rompe al mover)"
  local locales
  locales=$(consulta_sqlite "$tmp/db.sqlite" \
    "SELECT COUNT(*) FROM workflow_entity WHERE nodes LIKE '%host.docker.internal%' OR nodes LIKE '%127.0.0.1%' OR nodes LIKE '%localhost%';")
  if [ "$locales" != "0" ] && [ "$locales" != "?" ]; then
    mal "$locales workflows llaman a servicios de esta máquina:"
    sqlite3 "$tmp/db.sqlite" "SELECT nodes FROM workflow_entity;" 2>/dev/null \
      | grep -o "host\.docker\.internal:[0-9]*\|127\.0\.0\.1:[0-9]*\|localhost:[0-9]*" \
      | sort | uniq -c | sort -rn | head -8 | sed 's/^/       /'
    echo
    avisa "DECISIÓN NECESARIA ANTES DE SEGUIR:"
    avisa "  A) mover también ese/esos servicios a la máquina nueva  (recomendado), o"
    avisa "  B) dejarlos aquí, abrir el puerto entre las dos máquinas y cambiar la"
    avisa "     dirección en los workflows que la usan."
  else
    ok "ningún workflow depende de servicios locales"
  fi

  paso "5. Servicios que también viven en esta máquina"
  for s in hana-api nginx mariadb mysql; do
    if systemctl is-active --quiet "$s" 2>/dev/null; then ok "$s (activo)"; fi
  done
  if mysql -e "SELECT 1" >/dev/null 2>&1; then
    local mb; mb=$(mysql -N -e "SELECT ROUND(SUM(data_length+index_length)/1024/1024,1) FROM information_schema.tables WHERE table_schema='$BD_BOT';" 2>/dev/null || echo "?")
    ok "base '$BD_BOT': ${mb} MB — se migra en el respaldo"
  fi
  # OJO: bajo sudo, 'crontab -l' lee el cron de ROOT. Las tareas del bot viven en
  # el cron del usuario 'ubuntu'. Hay que mirar los dos o se pierden en la mudanza.
  local u ncron
  for u in root ubuntu; do
    ncron=$(crontab -u "$u" -l 2>/dev/null | grep -Ecv '^[[:space:]]*(#|$)' || true)
    [ -n "$ncron" ] && [ "$ncron" != "0" ] && ok "cron de '$u': $ncron tareas — hay que recrearlas en la nueva"
  done

  paso "6. Disco"
  df -h / | tail -1 | awk '{print "  espacio: usado "$3" de "$2" ("$5"), libre "$4}'

  echo; echo "${B}Revisión terminada. Si el punto 4 marcó dependencias, resolvelas ANTES de respaldar.${N}"
  echo "Siguiente paso:  ${B}sudo $0 respaldar${N}"; echo
}

# ═══════════════════════════════════════════════════════════════════════════════
#  PASO 1 — RESPALDAR (en la máquina VIEJA). Solo lee; no modifica nada.
# ═══════════════════════════════════════════════════════════════════════════════
cmd_respaldar() {
  echo "${B}RESPALDO DE LA MÁQUINA ACTUAL${N}"
  hace_falta docker; hace_falta sqlite3; hace_falta tar
  docker inspect n8n >/dev/null 2>&1 || muere "no existe el contenedor 'n8n'"

  local sello base
  sello=$(date +%Y%m%d-%H%M)
  base="$DIR_TRABAJO/paquete-$sello"
  mkdir -p "$base"

  paso "1. Base de n8n (copia consistente, sin parar el servicio)"
  # .backup de sqlite hace una copia coherente aunque n8n esté escribiendo.
  docker exec n8n sh -c 'sqlite3 /home/node/.n8n/database.sqlite ".backup /tmp/n8n-backup.sqlite"' 2>/dev/null \
    || docker cp n8n:/home/node/.n8n/database.sqlite "$base/database.sqlite" >/dev/null
  if docker exec n8n test -f /tmp/n8n-backup.sqlite 2>/dev/null; then
    docker cp n8n:/tmp/n8n-backup.sqlite "$base/database.sqlite" >/dev/null
    docker exec n8n rm -f /tmp/n8n-backup.sqlite 2>/dev/null || true
  fi
  [ -s "$base/database.sqlite" ] || muere "la copia de la base salió vacía"
  ok "copiada ($(du -h "$base/database.sqlite" | cut -f1))"

  paso "2. Carpeta de configuración (incluye la CLAVE DE CIFRADO)"
  docker cp n8n:/home/node/.n8n "$base/n8n-data" >/dev/null 2>&1 || muere "no pude copiar /home/node/.n8n"
  rm -f "$base/n8n-data/database.sqlite"          # ya va aparte, y así no se duplica el peso
  if [ -f "$base/n8n-data/config" ]; then ok "clave de cifrado incluida"
  else avisa "no apareció el archivo 'config'. Revisá N8N_ENCRYPTION_KEY en $DIR_N8N/.env"; fi
  [ -f "$DIR_N8N/.env" ] && { cp "$DIR_N8N/.env" "$base/env-original"; ok "variables (.env) incluidas"; }
  [ -f "$DIR_N8N/docker-compose.yml" ] && cp "$DIR_N8N/docker-compose.yml" "$base/docker-compose-original.yml"

  paso "3. Adelgazar la copia: el historial de ejecuciones NO se migra"
  local antes despues
  antes=$(consulta_sqlite "$base/database.sqlite" "SELECT COUNT(*) FROM execution_entity;")
  sqlite3 "$base/database.sqlite" \
    "DELETE FROM execution_data; DELETE FROM execution_metadata; DELETE FROM execution_annotations;
     DELETE FROM execution_entity; VACUUM;" 2>/dev/null || \
  sqlite3 "$base/database.sqlite" "DELETE FROM execution_data; DELETE FROM execution_entity; VACUUM;" 2>/dev/null || true
  despues=$(du -h "$base/database.sqlite" | cut -f1)
  ok "$antes ejecuciones descartadas de la COPIA (la original sigue intacta) -> $despues"
  avisa "el historial se queda en la máquina vieja; los workflows y credenciales van completos"

  paso "4. Workflows en JSON (red de seguridad para leerlos a ojo)"
  mkdir -p "$base/workflows-json"
  sqlite3 "$base/database.sqlite" "SELECT id FROM workflow_entity;" 2>/dev/null | while read -r wid; do
    [ -n "$wid" ] && sqlite3 "$base/database.sqlite" \
      "SELECT json_object('id',id,'name',name,'active',active,'nodes',json(nodes),'connections',json(connections));" \
      2>/dev/null >/dev/null || true
  done
  docker exec n8n n8n export:workflow --all --output=/tmp/wf.json >/dev/null 2>&1 \
    && docker cp n8n:/tmp/wf.json "$base/workflows-json/todos.json" >/dev/null 2>&1 \
    && ok "exportados a workflows-json/todos.json" \
    || avisa "no se pudo exportar a JSON (no es grave: la base ya los lleva)"

  paso "5. Base del bot (MariaDB) y archivos del proyecto"
  if mysql -e "SELECT 1" >/dev/null 2>&1; then
    mysqldump --single-transaction --routines --triggers "$BD_BOT" 2>/dev/null | gzip > "$base/$BD_BOT.sql.gz"
    ok "$BD_BOT volcada ($(du -h "$base/$BD_BOT.sql.gz" | cut -f1))"
  else
    avisa "no pude conectar a MySQL/MariaDB — volcá '$BD_BOT' a mano si aplica"
  fi
  for u in root ubuntu; do
    crontab -u "$u" -l > "$base/crontab-$u.txt" 2>/dev/null \
      && [ -s "$base/crontab-$u.txt" ] && ok "cron de '$u' guardado (crontab-$u.txt)"
  done
  [ -d /etc/nginx ] && tar czf "$base/nginx.tar.gz" -C /etc nginx 2>/dev/null && ok "configuración de nginx guardada"

  paso "6. Empaquetar"
  local paquete="$DIR_TRABAJO/n8n-migracion-$sello.tar.gz"
  tar czf "$paquete" -C "$DIR_TRABAJO" "paquete-$sello"
  sha256sum "$paquete" | awk '{print $1}' > "$paquete.sha256"
  rm -rf "$base"
  chmod 600 "$paquete" "$paquete.sha256"
  ok "paquete: $paquete  ($(du -h "$paquete" | cut -f1))"
  ok "huella : $(cat "$paquete.sha256")"

  echo
  echo "${A}${B}OJO: este archivo contiene las credenciales cifradas Y la clave que las abre.${N}"
  echo "${A}Pasalo por un canal interno (scp entre las dos máquinas), NUNCA por correo ni WhatsApp.${N}"
  echo
  echo "  scp $paquete usuario@MAQUINA-NUEVA:/root/"
  echo
  echo "Siguiente paso, ${B}en la máquina NUEVA${N}:  sudo $0 restaurar /root/$(basename "$paquete")"
  echo
}

# ═══════════════════════════════════════════════════════════════════════════════
#  PASO 2 — RESTAURAR (en la máquina NUEVA)
# ═══════════════════════════════════════════════════════════════════════════════
cmd_restaurar() {
  local paquete="${1:-}"
  [ -n "$paquete" ] || muere "falta el paquete. Uso: $0 restaurar /root/n8n-migracion-XXXX.tar.gz"
  [ -f "$paquete" ] || muere "no encuentro $paquete"
  echo "${B}RESTAURACIÓN EN LA MÁQUINA NUEVA${N}  ($(hostname))"
  hace_falta docker; hace_falta tar; hace_falta sqlite3

  if docker inspect n8n >/dev/null 2>&1; then
    avisa "ya existe un contenedor 'n8n' en esta máquina."
    confirmar "Se va a DETENER y REEMPLAZAR el n8n de ESTA máquina. ¿Es la máquina NUEVA?"
  fi

  paso "1. Comprobar la huella del paquete"
  if [ -f "$paquete.sha256" ]; then
    local esperada real
    esperada=$(cat "$paquete.sha256"); real=$(sha256sum "$paquete" | awk '{print $1}')
    [ "$esperada" = "$real" ] || muere "la huella NO coincide: el archivo llegó dañado. Copialo de nuevo."
    ok "huella correcta"
  else
    avisa "no vino el .sha256 — sigo, pero no puedo garantizar que llegó entero"
  fi

  paso "2. Desempaquetar"
  local tmp; tmp=$(mktemp -d)
  tar xzf "$paquete" -C "$tmp"
  local base; base=$(find "$tmp" -maxdepth 1 -type d -name 'paquete-*' | head -1)
  [ -n "$base" ] || muere "el paquete no tiene la forma esperada"
  ok "contenido: $(ls "$base" | tr '\n' ' ')"

  paso "3. Preparar $DIR_N8N"
  mkdir -p "$DIR_N8N/data"
  if [ -n "$(ls -A "$DIR_N8N/data" 2>/dev/null)" ]; then
    confirmar "$DIR_N8N/data NO está vacío. Su contenido se va a reemplazar."
    mv "$DIR_N8N/data" "$DIR_N8N/data.anterior-$(date +%s)"
    mkdir -p "$DIR_N8N/data"
  fi
  cp -a "$base/n8n-data/." "$DIR_N8N/data/"
  cp -a "$base/database.sqlite" "$DIR_N8N/data/database.sqlite"
  chown -R 1000:1000 "$DIR_N8N/data"
  ok "datos y clave de cifrado en su sitio"
  [ -f "$base/env-original" ] && { cp "$base/env-original" "$DIR_N8N/.env"; chmod 600 "$DIR_N8N/.env"; ok "variables (.env) restauradas"; }

  paso "4. Escribir el docker-compose con la versión nueva"
  # Diferencia importante con la máquina vieja: el puerto se ata a 127.0.0.1.
  # Así n8n NO queda expuesto aunque el firewall de la nube esté mal puesto; se
  # entra por nginx, que es quien exige HTTPS y limita por IP de oficina.
  cat > "$DIR_N8N/docker-compose.yml" <<COMPOSE
services:
  n8n:
    image: docker.n8n.io/n8nio/n8n:$VERSION_NUEVA
    container_name: n8n
    restart: unless-stopped
    extra_hosts:
      - host.docker.internal:host-gateway
    ports:
      - "127.0.0.1:5678:5678"   # SOLO local; nginx publica hacia afuera
    env_file:
      - .env
    volumes:
      - ./data:/home/node/.n8n
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:5678/healthz >/dev/null 2>&1 || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
COMPOSE
  ok "compose escrito con la imagen $VERSION_NUEVA y el puerto atado a 127.0.0.1"

  paso "5. Restaurar la base del bot (MariaDB)"
  if [ -f "$base/$BD_BOT.sql.gz" ]; then
    if mysql -e "SELECT 1" >/dev/null 2>&1; then
      mysql -e "CREATE DATABASE IF NOT EXISTS $BD_BOT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
      gunzip -c "$base/$BD_BOT.sql.gz" | mysql "$BD_BOT"
      ok "'$BD_BOT' restaurada: $(mysql -N -e "SELECT COUNT(*) FROM $BD_BOT.leads;" 2>/dev/null || echo '?') leads"
      avisa "falta crear el usuario de la aplicación y sus permisos (ver el documento, paso 5)"
    else
      avisa "no hay MySQL/MariaDB en esta máquina todavía — instalalo y restaurá $base/$BD_BOT.sql.gz"
    fi
  fi

  paso "6. Levantar n8n"
  compose pull
  compose up -d
  echo -n "  esperando a que responda"
  local i=0
  until curl -sf -m 3 http://127.0.0.1:5678/healthz >/dev/null 2>&1; do
    i=$((i+1)); [ $i -gt 60 ] && { echo; muere "no respondió en 2 minutos. Mirá: docker logs n8n"; }
    echo -n "."; sleep 2
  done
  echo; ok "n8n responde"

  cp -a "$base"/crontab-*.txt "$DIR_TRABAJO/" 2>/dev/null || true
  rm -rf "$tmp"
  echo
  echo "Siguiente paso:  ${B}sudo $0 verificar${N}"
  echo
}

# ═══════════════════════════════════════════════════════════════════════════════
#  PASO 3 — VERIFICAR (en la máquina NUEVA, antes de mover el tráfico)
# ═══════════════════════════════════════════════════════════════════════════════
cmd_verificar() {
  echo "${B}VERIFICACIÓN DE LA MÁQUINA NUEVA${N}  ($(hostname))"
  local fallos=0

  paso "1. n8n arriba y en la versión correcta"
  local ver
  ver=$(docker inspect -f '{{.Config.Image}}' n8n 2>/dev/null | sed 's/.*://')
  if [ "$ver" = "$VERSION_NUEVA" ]; then ok "versión $ver"; else mal "versión $ver (se esperaba $VERSION_NUEVA)"; fallos=$((fallos+1)); fi
  if curl -sf -m 5 http://127.0.0.1:5678/healthz >/dev/null 2>&1; then ok "responde en 127.0.0.1:5678"
  else mal "no responde"; fallos=$((fallos+1)); fi

  paso "2. El puerto NO debe estar abierto al mundo"
  if docker port n8n 2>/dev/null | grep -q "0.0.0.0"; then
    mal "el 5678 está publicado en TODAS las interfaces — corregí el compose a 127.0.0.1:5678:5678"
    fallos=$((fallos+1))
  else ok "el 5678 solo escucha en local (se entra por nginx)"; fi

  paso "3. Llegaron todos los workflows y credenciales"
  local tmp; tmp=$(mktemp -d); trap 'rm -rf "$tmp"' RETURN
  docker cp n8n:/home/node/.n8n/database.sqlite "$tmp/db.sqlite" >/dev/null 2>&1 || { mal "no pude leer la base"; fallos=$((fallos+1)); }
  if [ -f "$tmp/db.sqlite" ]; then
    echo "     workflows    : $(consulta_sqlite "$tmp/db.sqlite" 'SELECT COUNT(*) FROM workflow_entity;')"
    echo "     activos      : $(consulta_sqlite "$tmp/db.sqlite" 'SELECT COUNT(*) FROM workflow_entity WHERE active=1;')"
    echo "     credenciales : $(consulta_sqlite "$tmp/db.sqlite" 'SELECT COUNT(*) FROM credentials_entity;')"
    avisa "compará estos tres números con los que dio 'revisar' en la máquina vieja"
    local sd
    sd=$(consulta_sqlite "$tmp/db.sqlite" "SELECT LENGTH(staticData) FROM workflow_entity WHERE id='$WF_BOT';")
    if [ "$sd" != "?" ] && [ -n "$sd" ] && [ "$sd" != "0" ]; then
      ok "el estado vivo del bot viajó ($sd bytes: sesiones, candados, rotación)"
    else
      avisa "el bot llegó SIN estado vivo -> el día del cambio los clientes en conversación arrancan de cero"
    fi
  fi

  paso "4. Las credenciales se pueden DESCIFRAR (la prueba de fuego)"
  avisa "esto no se puede comprobar solo: abrí el editor, entrá a una credencial"
  avisa "y confirmá que el valor se ve. Si sale vacía o da error, falta la clave de cifrado."

  paso "5. Los servicios de los que dependen los workflows"
  if curl -sf -m 5 http://127.0.0.1:8001/docs >/dev/null 2>&1; then
    ok "hana-api responde en el 8001 de ESTA máquina"
  else
    mal "hana-api NO responde en el 8001 de esta máquina"
    avisa "los workflows que llaman a host.docker.internal:8001 van a fallar."
    avisa "O se instala aquí, o se apunta a la IP de la máquina vieja y se abre ese puerto."
    fallos=$((fallos+1))
  fi

  paso "6. Base del bot"
  if mysql -N -e "SELECT COUNT(*) FROM $BD_BOT.leads;" >/dev/null 2>&1; then
    ok "$BD_BOT accesible ($(mysql -N -e "SELECT COUNT(*) FROM $BD_BOT.leads;") leads)"
  else mal "no puedo leer $BD_BOT"; fallos=$((fallos+1)); fi

  paso "7. Tareas programadas"
  if crontab -l 2>/dev/null | grep -q "vigilante\|backup_diario\|reporte_"; then ok "cron recreado"
  elif crontab -u ubuntu -l 2>/dev/null | grep -q "vigilante\|backup_diario\|reporte_"; then ok "cron de 'ubuntu' recreado"
  else avisa "falta recrear el cron (los archivos están en $DIR_TRABAJO/crontab-*.txt)"; fi

  echo
  if [ "$fallos" -eq 0 ]; then
    echo "${V}${B}Verificación sin fallos.${N} Revisá igual los puntos marcados con ! antes del cambio."
    echo "Siguiente paso (fuera de horario):  ${B}sudo $0 cambio${N}"
  else
    echo "${R}${B}$fallos problema(s).${N} NO hagas el cambio hasta resolverlos. La vieja sigue trabajando."
  fi
  echo
}

# ═══════════════════════════════════════════════════════════════════════════════
#  PASO 4 — CAMBIO (mover el tráfico). FUERA DE HORARIO.
# ═══════════════════════════════════════════════════════════════════════════════
cmd_cambio() {
  echo "${B}CAMBIO DE TRÁFICO A LA MÁQUINA NUEVA${N}"
  echo
  echo "  Antes de seguir, confirmá que:"
  echo "   1. 'verificar' terminó sin fallos"
  echo "   2. es FUERA DE HORARIO y no hay conversaciones abiertas"
  echo "   3. en la máquina VIEJA los workflows ya quedaron DESACTIVADOS"
  echo "      (si no, los dos n8n van a atender y se duplican los leads)"
  confirmar "¿Los tres puntos están confirmados?"

  paso "1. Activar los workflows aquí"
  echo "  Entrá al editor de ESTA máquina y activá los workflows que estaban activos."
  echo "  Si preferís por API:"
  echo "     curl -X POST -H \"X-N8N-API-KEY: <clave>\" http://127.0.0.1:5678/api/v1/workflows/<id>/activate"
  read -r -p "  Enter cuando estén activados... "

  paso "2. Mover el nombre de dominio"
  echo "  El webhook de Meta apunta a ${B}bot.ardisa.com/webhook/bot-wsp-ardisa-f1${N}."
  echo "  Cambiá el DNS de bot.ardisa.com (y n8n.ardisa.com) a la IP de esta máquina,"
  echo "  o movés la configuración de nginx. Recordá emitir los certificados aquí:"
  echo "     certbot --nginx -d bot.ardisa.com -d n8n.ardisa.com"
  read -r -p "  Enter cuando el DNS o nginx estén apuntando aquí... "

  paso "3. Probar de punta a punta"
  local url="https://bot.ardisa.com/webhook/bot-wsp-ardisa-f1"
  local codigo; codigo=$(curl -s -o /dev/null -m 10 -w '%{http_code}' -X POST -H 'Content-Type: application/json' --data '{"entry":[]}' "$url" || echo "000")
  if [ "$codigo" = "200" ]; then ok "el webhook responde 200"
  else mal "el webhook devolvió $codigo — revisá nginx, el certificado y el DNS"; fi
  echo
  echo "  ${B}Ahora la prueba de verdad:${N} mandale un WhatsApp al bot desde un celular"
  echo "  y comprobá que contesta y que el lead aparece en la base."
  echo
  echo "  ${A}Dejá la máquina vieja encendida y sin tocar durante una semana.${N}"
  echo "  Es la vuelta atrás. Apagala recién cuando estés tranquilo."
  echo
}

# ═══════════════════════════════════════════════════════════════════════════════
#  VOLVER ATRÁS (en la máquina VIEJA)
# ═══════════════════════════════════════════════════════════════════════════════
cmd_volver_atras() {
  echo "${B}VOLVER A LA MÁQUINA VIEJA${N}"
  echo
  echo "  Nada de lo anterior borró esta máquina. Para volver:"
  echo "   1. En la máquina NUEVA: desactivá los workflows (o pará el contenedor):"
  echo "        cd $DIR_N8N && docker compose stop"
  echo "   2. Devolvé el DNS de bot.ardisa.com y n8n.ardisa.com a la IP de ESTA máquina"
  echo "   3. Reactivá aquí los workflows que hayas desactivado"
  echo "   4. Comprobá:"
  echo "        curl -X POST -H 'Content-Type: application/json' --data '{\"entry\":[]}' \\"
  echo "             https://bot.ardisa.com/webhook/bot-wsp-ardisa-f1"
  echo
  confirmar "¿Querés que revise el estado de ESTA máquina ahora?"
  paso "Estado actual"
  docker inspect n8n >/dev/null 2>&1 && ok "contenedor: $(docker inspect -f '{{.State.Status}}' n8n)" || mal "no hay contenedor n8n"
  curl -sf -m 5 http://127.0.0.1:5678/healthz >/dev/null 2>&1 && ok "n8n responde" || mal "n8n no responde"
  echo
}

# ═══════════════════════════════════════════════════════════════════════════════
case "${1:-}" in
  revisar)      cmd_revisar ;;
  respaldar)    mkdir -p "$DIR_TRABAJO"; chmod 700 "$DIR_TRABAJO"; cmd_respaldar ;;
  restaurar)    mkdir -p "$DIR_TRABAJO"; chmod 700 "$DIR_TRABAJO"; cmd_restaurar "${2:-}" ;;
  verificar)    cmd_verificar ;;
  cambio)       cmd_cambio ;;
  volver-atras) cmd_volver_atras ;;
  *)
    cat <<AYUDA
${B}Migración de n8n a una máquina nueva — Grupo Ardisa${N}

  ${B}En la máquina VIEJA${N}
    sudo $0 revisar                  Qué hay y qué se rompe al mover. No cambia nada.
    sudo $0 respaldar                Arma el paquete para llevarse. Solo lee.

  ${B}En la máquina NUEVA${N}
    sudo $0 restaurar <paquete>      Restaura y levanta n8n $VERSION_NUEVA
    sudo $0 verificar                Comprueba que quedó bien ANTES de mover tráfico

  ${B}Cuando todo esté verde (fuera de horario)${N}
    sudo $0 cambio                   Guía el cambio de tráfico

  ${B}Si algo sale mal${N}
    sudo $0 volver-atras             Cómo volver a la vieja (que sigue intacta)

  Versión a instalar: ${B}$VERSION_NUEVA${N}   (cambiala con: VERSION_NUEVA=x.y.z sudo -E $0 ...)

  Leé primero: docs/MIGRACION-N8N.md
AYUDA
    ;;
esac
