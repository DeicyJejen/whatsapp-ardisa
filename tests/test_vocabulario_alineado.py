#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# EL VOCABULARIO DEL VIGILANTE NO PUEDE QUEDARSE ATRÁS DEL DEL BOT (2026-08-26).
# Corre sola:  python3 tests/test_vocabulario_alineado.py   (también la corre tests/correr.sh)
#
# El caso: el 26-ago el panel gritó DOS alertas amarillas contra leads perfectos —"Manejan disco
# para Rh" (#396) y "Zinc acesco" (#397)—. El bot los había entendido bien; el que no conocía esas
# palabras era el vigilante. Medido ese día: de las 121 palabras de producto del bot, al vigilante
# le faltaban 37.
#
# Lo grave no es el hueco: es que llevaba semanas un comentario en vigilante_reglas.py diciendo
# "⚠️ Si se agrega vocabulario allá, agregarlo aquí" — y no sirvió. UN RECORDATORIO NO ES UN CONTROL.
# Esta prueba sí lo es: extrae el vocabulario del bot de build_f1.py y falla si el vigilante no lo
# reconoce. A partir de hoy, separarse rompe la suite en vez de gritarle a un cliente bien atendido.
import sys, os, re, io
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from vigilante_reglas import _PROD

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def concreta(trozo):
    """Vuelve PALABRA un trozo de regex del bot: 'ba[nñ]o' -> 'baño', 'cer[aá]mic' -> 'cerámic'.
    Se queda con la ÚLTIMA opción del corchete (la acentuada), que es como la escribe la gente."""
    return re.sub(r'\[([^\]]+)\]', lambda m: m.group(1)[-1], trozo).replace('\\', '')


def vocabulario_del_bot():
    """Saca las palabras de producto de las listas KW_* de build_f1.py (KW_CONS, KW_ACAB, ...)."""
    s = io.open(os.path.join(RAIZ, 'build_f1.py'), encoding='utf-8').read()
    palabras = set()
    for m in re.finditer(r'const (KW_[A-Z_]+)\s*=\s*/\\b\(([^)]{40,})\)', s):
        for w in m.group(2).split('|'):
            w = w.strip()
            if not w or re.search(r'[(){}*+?^$]', w):
                continue                      # trozos de regex complicados: no son una palabra
            p = concreta(w)
            if re.fullmatch(r"[a-záéíóúñü\-]{4,}", p, re.I):
                palabras.add(p)
    return palabras


voc = vocabulario_del_bot()
if len(voc) < 60:
    print("❌ solo se extrajeron %d palabras del bot: cambió el formato de las KW_* y esta prueba"
          " se quedó ciega (arreglar el extractor, NO bajar el número)" % len(voc))
    sys.exit(1)

faltan = sorted(p for p in voc if not re.search(_PROD, p, re.I))

print("  vocabulario de producto del bot: %d palabras" % len(voc))
if faltan:
    print("  ❌ el vigilante NO reconoce %d de ellas — cada una es una falsa alarma en potencia:" % len(faltan))
    for i in range(0, len(faltan), 6):
        print("     " + "  ".join("%-15s" % x for x in faltan[i:i+6]))
    print("  Arreglo: agregarlas a _PROD en vigilante_reglas.py")
    sys.exit(1)

print("  ✅ el vigilante reconoce las %d: las dos listas están alineadas" % len(voc))

# Y los dos casos que originaron la prueba, fijados por su nombre
from vigilante_reglas import lead_sin_solicitud
fallos = 0
for detalle, esperado, por in [
    ("Hola buenas tardes  ·  Manejan disco para Rh  ·  San Pablo. BOLIVAR", False, "lead #396"),
    ("Zinc acesco",        False, "lead #397"),
    ("disco para pulidora", False, "abrasivos"),
    ("Hola buenas tardes",  True,  "solo un saludo: SÍ debe alertar"),
    ("Medellín",            True,  "una ciudad no es una solicitud"),
]:
    r = lead_sin_solicitud(detalle)
    ok = (r == esperado)
    print("  %s %-52s (%s)" % ("✅" if ok else "❌", '"%s"' % detalle[:50], por))
    if not ok:
        fallos += 1

if fallos:
    print("test_vocabulario_alineado: %d FALLAS" % fallos)
    sys.exit(1)
print("test_vocabulario_alineado: TODAS PASAN")
