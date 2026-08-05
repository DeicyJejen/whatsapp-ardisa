#!/bin/bash
# Corre todas las pruebas del Cerebro. Uso: bash tests/correr.sh
# Genera cerebro.js desde build_f1.py (fuente unica de verdad) y ejecuta cada test_*.js.
set -e
cd "$(dirname "$0")/.."
VERIFY_TOKEN=ardisa2026 python3 -c "import build_f1; open('tests/cerebro.js','w').write(build_f1.CODE_CEREBRO)" >/dev/null
# extrae el codigo de los nodos sueltos que tambien se prueban
python3 -c "
import json
w=json.load(open('workflow-bot-f1.json'))
m={'Armar aviso a Deicy':'tests/n_armar.js','\u00bfLleg\u00f3 el aviso?':'tests/n_confirmar.js','Preparar IA':'tests/n_prepara.js','Finalizar cierre':'tests/n_finalizar.js'}
for n in w['nodes']:
    if n['name'] in m: open(m[n['name']],'w').write(n['parameters']['jsCode'])
"
fallo=0
for t in tests/test_*.js; do
  echo "=== $t ==="
  node "$t" || fallo=1
done
rm -f tests/cerebro.js tests/n_armar.js tests/n_confirmar.js tests/n_prepara.js tests/n_finalizar.js
[ $fallo -eq 0 ] && echo "TODAS LAS PRUEBAS PASAN" || echo "HAY PRUEBAS FALLANDO"
exit $fallo
