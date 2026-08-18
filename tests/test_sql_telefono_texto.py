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
# puede quedar sin CAST(... AS CHAR). Es estática a propósito — el arnés de JS no ejecuta SQL, y este
# fallo vive justo ahí, en el SQL.
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
    for m in re.finditer(r'(?:telefono|wa_id)\s*=\s*CAST\(\$\d+ AS CHAR\)', sql):
        protegidas.append((nodo['name'], m.group(0)))

chequear('Ninguna consulta compara telefono/wa_id contra un parámetro sin CAST',
         not crudas, '; '.join('%s: %s' % c for c in crudas[:6]))
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
             'telefono=CAST($13 AS CHAR)' in q,
             q[q.find('NOT EXISTS'):q.find('NOT EXISTS') + 140])

print('\n%d/%d pruebas pasan' % (ok, total))
sys.exit(0 if ok == total else 1)
