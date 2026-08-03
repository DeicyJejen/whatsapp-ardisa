#!/bin/bash
# Corre todas las pruebas del Cerebro. Uso: bash tests/correr.sh
# Genera cerebro.js desde build_f1.py (fuente unica de verdad) y ejecuta cada test_*.js.
set -e
cd "$(dirname "$0")/.."
VERIFY_TOKEN=ardisa2026 python3 -c "import build_f1; open('tests/cerebro.js','w').write(build_f1.CODE_CEREBRO)" >/dev/null
fallo=0
for t in tests/test_*.js; do
  echo "=== $t ==="
  node "$t" || fallo=1
done
rm -f tests/cerebro.js
[ $fallo -eq 0 ] && echo "TODAS LAS PRUEBAS PASAN" || echo "HAY PRUEBAS FALLANDO"
exit $fallo
