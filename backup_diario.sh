#!/bin/bash
# Respaldo diario del bot Ardisa (2026-07-22, hallazgo auditoría: no había NINGÚN backup automático).
# Guarda: (1) BD de leads completa (MySQL bot_ardisa: leads, mensajes, consentimientos),
#         (2) staticData del workflow (pendientes de reporte segPend, colas de adjuntos, ventanas 24h),
#         (3) el workflow desplegado (nodos) — para poder restaurar el bot completo.
# Rotación: 14 días. Cron: 2:30 AM diario (ver crontab de ubuntu).
set -e -o pipefail   # pipefail: si mysqldump/sqlite3 fallan, NO dejar un .gz vacío con exit 0
DIR=/home/ubuntu/whatsapp-ardisa/backups/auto
mkdir -p "$DIR"
F=$(date +%Y%m%d-%H%M)

# 1) BD de leads (MySQL, root por socket via sudo)
sudo -n mysqldump --single-transaction bot_ardisa | gzip > "$DIR/bot_ardisa-$F.sql.gz"

# 2) staticData + nodos del workflow del bot (sqlite de n8n, lectura con timeout por si está ocupada)
sudo -n sqlite3 -readonly /opt/n8n/data/database.sqlite \
  ".timeout 5000" \
  "SELECT staticData FROM workflow_entity WHERE id='botArdisaFase1x';" | gzip > "$DIR/staticData-$F.json.gz"
sudo -n sqlite3 -readonly /opt/n8n/data/database.sqlite \
  ".timeout 5000" \
  "SELECT nodes FROM workflow_entity WHERE id='botArdisaFase1x';" | gzip > "$DIR/workflow-nodes-$F.json.gz"

# 3) Validar que los 3 archivos de HOY existen y no están vacíos ANTES de rotar
#    (sin esto, un fallo silencioso + rotación de 14 días extinguiría los backups buenos)
for f in "$DIR/bot_ardisa-$F.sql.gz" "$DIR/staticData-$F.json.gz" "$DIR/workflow-nodes-$F.json.gz"; do
  if [ ! -s "$f" ] || [ "$(stat -c%s "$f")" -lt 500 ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') ERROR backup: $f vacío o sospechosamente pequeño — NO se rota" >&2
    exit 1
  fi
done

# 4) Rotación: conservar 14 días
find "$DIR" -name '*.gz' -mtime +14 -delete

echo "$(date '+%Y-%m-%d %H:%M:%S') OK backup: $(ls -lh "$DIR" | tail -n +2 | wc -l) archivos, $(du -sh "$DIR" | cut -f1)"
