#!/bin/bash
# CANDADO DE DESPLIEGUE del bot WhatsApp Ardisa (2026-08-12, auditoría de robustez).
# Codifica lo que se hacía a mano en CADA deploy: build -> pruebas -> snapshot -> deploy -> DIFF automático.
# Antes, la verificación post-deploy era 100% disciplina humana; ahora el script ABORTA si algo no cuadra.
#
# Uso:  bash desplegar.sh                 -> despliega si build+pruebas pasan y NO hay tráfico en curso
#       bash desplegar.sh --forzar        -> salta el chequeo de "ventana tranquila" (usar con cuidado)
set -euo pipefail
cd "$(dirname "$0")"

WF=botArdisaFase1x
API=http://127.0.0.1:5678/api/v1
SNAP="backups/deploy-$(date +%Y%m%d-%H%M%S).json"
FORZAR="${1:-}"

echo "== 1/6  Build (node --check de cada nodo) =="
VERIFY_TOKEN=ardisa2026 python3 build_f1.py

echo "== 2/6  Suite de pruebas =="
if ! bash tests/correr.sh > /tmp/deploy-tests.log 2>&1; then
  echo "❌ PRUEBAS EN ROJO — no se despliega. Últimas líneas:"; tail -15 /tmp/deploy-tests.log; exit 1
fi
echo "   $(grep -oE '[0-9]+/[0-9]+ pruebas pasan' /tmp/deploy-tests.log | tail -1 || echo 'ok') · $(grep -c 'TODAS LAS PRUEBAS PASAN' /tmp/deploy-tests.log)/1 suites OK"

# La API key (label 'claud') se lee de la BD de n8n EN SITIO (solo lectura, sin copiar la BD de 3GB).
KEY=$(sudo -n python3 -c "import sqlite3; c=sqlite3.connect('file:/opt/n8n/data/database.sqlite?immutable=1',uri=True); print([r[0] for r in c.execute(\"SELECT apiKey FROM user_api_keys WHERE label='claud'\")][0])")

echo "== 3/6  Ventana tranquila (no pisar una conversación en curso) =="
if [ "$FORZAR" != "--forzar" ]; then
  N=$(sudo -n mysql bot_ardisa -N -B -e "SELECT COUNT(*) FROM mensajes WHERE creado_en > NOW() - INTERVAL 6 MINUTE AND etapa NOT IN ('panel','humano_panel','media_nudge');")
  if [ "$N" != "0" ]; then
    echo "⏳ Hay actividad ($N mensajes en 6 min). Desplegar ahora borra la memoria reciente. Reintenta luego o usa --forzar."; exit 2
  fi
  echo "   0 mensajes en los últimos 6 min: seguro desplegar."
else
  echo "   (--forzar: se omite el chequeo)"
fi

echo "== 4/6  Snapshot para rollback -> $SNAP =="
curl -s -H "X-N8N-API-KEY: $KEY" "$API/workflows/$WF" -o "$SNAP"
python3 -c "import json;json.load(open('$SNAP'))" && echo "   snapshot OK"

echo "== 5/6  Deploy (PUT en caliente, sin desactivar) =="
# 2026-08-20 (mensaje de Deicy perdido a las 9:25:55, 25 s después de un deploy): el ciclo
# deactivate->PUT->activate dejaba el webhook MUERTO ~4 segundos y Meta no siempre reintenta lo que
# rebota ahí. n8n acepta actualizar un workflow ACTIVO (igual que cuando el editor guarda): el webhook
# no se cae nunca. Probado en un workflow desechable antes de cambiar esto. Si el PUT en caliente
# fallara, se cae al ciclo viejo como reversa (mejor 4 s de hueco que no desplegar).
python3 -c "import json;w=json.load(open('workflow-bot-f1.json'));json.dump({'name':w['name'],'nodes':w['nodes'],'connections':w['connections'],'settings':w.get('settings',{})},open('/tmp/deploy-put.json','w'),ensure_ascii=False)"
PUTC=$(curl -s -X PUT -H "X-N8N-API-KEY: $KEY" -H "Content-Type: application/json" --data-binary @/tmp/deploy-put.json "$API/workflows/$WF" -o /dev/null -w "%{http_code}")
echo "   put_en_caliente=$PUTC"
if [ "$PUTC" != "200" ]; then
  echo "   ⚠️ PUT en caliente falló -> reversa al ciclo deactivate->PUT->activate"
  curl -s -X POST -H "X-N8N-API-KEY: $KEY" "$API/workflows/$WF/deactivate" -o /dev/null -w "   deactivate=%{http_code}\n"
  curl -s -X PUT  -H "X-N8N-API-KEY: $KEY" -H "Content-Type: application/json" --data-binary @/tmp/deploy-put.json "$API/workflows/$WF" -o /dev/null -w "   put=%{http_code}\n"
  curl -s -X POST -H "X-N8N-API-KEY: $KEY" "$API/workflows/$WF/activate" -o /dev/null -w "   activate=%{http_code}\n"
fi
sleep 3

echo "== 6/6  Verificación automática (diff vivo vs build + webhook) =="
curl -s -H "X-N8N-API-KEY: $KEY" "$API/workflows/$WF" -o /tmp/deploy-live.json
DIF=$(python3 -c "
import json
lv={n['name']:json.dumps(n.get('parameters'),sort_keys=True,ensure_ascii=False) for n in json.load(open('/tmp/deploy-live.json'))['nodes']}
nv={n['name']:json.dumps(n.get('parameters'),sort_keys=True,ensure_ascii=False) for n in json.load(open('workflow-bot-f1.json'))['nodes']}
d=[k for k in nv if lv.get(k)!=nv[k]]
print(','.join(d) if d else 'OK')")
ACT=$(python3 -c "import json;print(json.load(open('/tmp/deploy-live.json'))['active'])")
WH=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{"entry":[]}' http://127.0.0.1:5678/webhook/bot-wsp-ardisa-f1)

if [ "$DIF" != "OK" ] || [ "$ACT" != "True" ] || [ "$WH" != "200" ]; then
  # Si el PUT en caliente dejó algo raro (webhook sin registrar), un ciclo de re-activación lo re-registra.
  echo "   ⚠️ Primera verificación falló (activo=$ACT webhook=$WH dif=[$DIF]) -> ciclo de re-activación"
  curl -s -X POST -H "X-N8N-API-KEY: $KEY" "$API/workflows/$WF/deactivate" -o /dev/null
  curl -s -X POST -H "X-N8N-API-KEY: $KEY" "$API/workflows/$WF/activate"   -o /dev/null
  sleep 3
  curl -s -H "X-N8N-API-KEY: $KEY" "$API/workflows/$WF" -o /tmp/deploy-live.json
  ACT=$(python3 -c "import json;print(json.load(open('/tmp/deploy-live.json'))['active'])")
  WH=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{"entry":[]}' http://127.0.0.1:5678/webhook/bot-wsp-ardisa-f1)
fi
if [ "$DIF" != "OK" ] || [ "$ACT" != "True" ] || [ "$WH" != "200" ]; then
  echo "❌ VERIFICACIÓN FALLÓ — activo=$ACT webhook=$WH nodos-distintos=[$DIF]"
  echo "   Rollback: curl -X PUT con $SNAP y activar. (ver docs/RUNBOOK.md)"
  exit 3
fi
echo "✅ DESPLEGADO Y VERIFICADO · activo=$ACT · webhook=$WH · lo vivo == build · rollback en $SNAP"
