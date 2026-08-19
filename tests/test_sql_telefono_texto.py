# -*- coding: utf-8 -*-
# EL TELÉFONO SE COMPARA COMO TEXTO (2026-08-18, caso Ilba Mateus).
#
# Ilba recorrió todo el formulario, pidió "círculos de madera para zapatero giratorio" y el bot le
# respondió "Tu solicitud quedó registrada". NUNCA se guardó: el INSERT se abortó entero.
#
# POR QUÉ: n8n manda el teléfono como NÚMERO. Comparar una columna varchar contra un número obliga a
# MySQL a convertir la COLUMNA fila por fila. Desde el 14-ago hay clientes con el número oculto, cuyo
# "teléfono" es 'CO.4434044936837293': convertir eso suelta el warning 1292 y, bajo STRICT_TRANS_TABLES,
# dentro de un INSERT ese warning es un ERROR que mata la fila. Como el nodo tiene
# onError:continueRegularOutput, el flujo siguió y el cliente recibió la confirmación igual.
#
# El candado del INSERT solo mira 45 minutos hacia atrás, así que solo estallaba cuando un cliente con
# número oculto había entrado en esa ventana. Ese día: BSUID a las 12:23 -> Ilba perdida a las 13:03.
#
# Esta prueba mira el WORKFLOW GENERADO: ninguna comparación de teléfono o wa_id contra un parámetro
# puede quedar cruda. Es estática a propósito — el arnés de JS no ejecuta SQL, y el fallo vive justo ahí.
#
# ⚠️ SEGUNDA PARTE, aprendida a los golpes el mismo día: el primer intento usó CAST($n AS CHAR) y tumbó
# la consulta de "Buscar pendiente" con "Illegal mix of collations" — CAST hereda el charset de la
# CONEXIÓN, y las columnas no son todas iguales (leads y consentimientos son utf8mb4_unicode_ci;
# sesiones, humano y mensajes, utf8mb4_general_ci). Con esa consulta caída el bot perdió cons_si y los
# interruptores de config: durante veinte minutos volvió el muro de autorización que habíamos quitado.
# Por eso la forma correcta es CONVERT($n USING utf8mb4) COLLATE <la de la columna>, y por eso los SELECT
# se ejecutan contra la base de verdad antes de desplegar — un SQL que compila no es un SQL que corre.
import json, re, sys, os

RUTA = os.path.join(os.path.dirname(__file__), '..', 'workflow-bot-f1.json')
wf = json.load(open(RUTA, encoding='utf-8'))

ok = total = 0
def chequear(nombre, cond, detalle=''):
    global ok, total
    total += 1
    if cond: ok += 1
    print(('  OK   | ' if cond else '  FALLA | ') + nombre + ('' if cond else '\n         ' + detalle))

crudas, protegidas = [], []
for nodo in wf['nodes']:
    sql = json.dumps(nodo.get('parameters', {}), ensure_ascii=False)
    for m in re.finditer(r'(?:telefono|wa_id)\s*=\s*\$\d+', sql):
        crudas.append((nodo['name'], m.group(0)))
    for m in re.finditer(r'(?:telefono|wa_id)\s*=\s*CONVERT\(\$\d+ USING utf8mb4\) COLLATE utf8mb4_\w+', sql):
        protegidas.append((nodo['name'], m.group(0)))

chequear('Ninguna consulta compara telefono/wa_id contra un parámetro sin CAST',
         not crudas, '; '.join('%s: %s' % c for c in crudas[:6]))

# 2026-08-19: el SQL que se llevó a Ilba NO usaba un marcador — traía el número INTERPOLADO
# ("telefono=573125758845"). La prueba solo miraba los `$n`, así que ese SQL habría pasado en verde.
# Un teléfono contra un literal numérico es el mismo error, escrito de otra forma.
literales = []
for nodo in wf['nodes']:
    sql = json.dumps(nodo.get('parameters', {}), ensure_ascii=False)
    for m in re.finditer(r'(?:telefono|wa_id)\s*=\s*\d{3,}', sql):
        literales.append((nodo['name'], m.group(0)))
chequear('Ni contra un número escrito directo en el SQL',
         not literales, '; '.join('%s: %s' % c for c in literales[:6]))
chequear('Y sí hay comparaciones protegidas (la prueba no pasa por no encontrar nada)',
         len(protegidas) >= 10, 'protegidas=%d' % len(protegidas))

# El candado anti-duplicado del lead es el que se llevó a Ilba: se fija aparte.
candado = [n for n in wf['nodes']
           if 'INSERT INTO leads' in json.dumps(n.get('parameters', {}), ensure_ascii=False)]
chequear('Los nodos que insertan el lead existen (Guardar lead y Guardar lead 2)', len(candado) == 2,
         str([n['name'] for n in candado]))
for n in candado:
    q = json.dumps(n.get('parameters', {}), ensure_ascii=False)
    chequear('El candado de 45 min de "%s" compara como texto' % n['name'],
             'telefono=CONVERT($13 USING utf8mb4) COLLATE utf8mb4_unicode_ci' in q,
             q[q.find('NOT EXISTS'):q.find('NOT EXISTS') + 140])

print('\n%d/%d pruebas pasan' % (ok, total))
sys.exit(0 if ok == total else 1)
