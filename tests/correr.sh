#!/bin/bash
# Corre todas las pruebas del Cerebro. Uso: bash tests/correr.sh
# Genera cerebro.js desde build_f1.py (fuente unica de verdad) y ejecuta cada test_*.js.
set -e
cd "$(dirname "$0")/.."
VERIFY_TOKEN=ardisa2026 python3 -c "import build_f1; open('tests/cerebro.js','w').write(build_f1.CODE_CEREBRO); open('tests/n_inactivos.js','w').write(build_f1.CODE_INACTIVOS)" >/dev/null
# extrae el codigo de los nodos sueltos que tambien se prueban
python3 -c "
import json
w=json.load(open('workflow-bot-f1.json'))
m={'Armar aviso a Deicy':'tests/n_armar.js','\u00bfLleg\u00f3 el aviso?':'tests/n_confirmar.js','Preparar IA':'tests/n_prepara.js','Finalizar cierre':'tests/n_finalizar.js','Redirigir al asesor original':'tests/n_redirigir.js','Entregar cotizaci\u00f3n':'tests/n_entregar.js','Repartir herramientas R1':'tests/n_repartir1.js','Armar consulta R2':'tests/n_armar_r2.js','Armar consulta R4':'tests/n_armar_r4.js','Cerrar cotizaci\u00f3n R4':'tests/n_cerrar_r3.js','Buscar en tienda (web)':'tests/n_tienda.js'}
hay={n['name'] for n in w['nodes']}
# 2026-08-15: si un nodo se RENOMBRA, el extractor dejaba de escribir su archivo y la prueba seguia leyendo
# el .js VIEJO que habia quedado suelto -> pasaba en verde probando codigo que ya no existe. Paso de verdad
# al renombrar 'Cerrar cotizacion R3' -> 'R4'. Ahora falta un nodo = el arnes se cae aqui, no en silencio.
falta=[k for k in m if k not in hay]
if falta: raise SystemExit('ABORT: el workflow ya no tiene estos nodos que las pruebas necesitan: %s' % falta)
for n in w['nodes']:
    if n['name'] in m: open(m[n['name']],'w').write(n['parameters']['jsCode'])
"
fallo=0
for t in tests/test_*.js; do
  echo "=== $t ==="
  node "$t" || fallo=1
done
# pruebas en Python (reglas puras del vigilante, etc.)
for t in tests/test_*.py; do
  [ -e "$t" ] || continue
  echo "=== $t ==="
  python3 "$t" || fallo=1
done
rm -f tests/cerebro.js tests/n_inactivos.js tests/n_armar.js tests/n_confirmar.js tests/n_prepara.js tests/n_finalizar.js tests/n_redirigir.js tests/n_entregar.js
# estos tres se quedaban en el disco entre corridas: justo lo que permitio probar codigo viejo (ver arriba)
rm -f tests/n_repartir1.js tests/n_armar_r2.js tests/n_armar_r4.js tests/n_cerrar_r3.js tests/n_tienda.js
[ $fallo -eq 0 ] && echo "TODAS LAS PRUEBAS PASAN" || echo "HAY PRUEBAS FALLANDO"
exit $fallo
