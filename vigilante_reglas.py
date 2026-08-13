#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# REGLAS PURAS DEL VIGILANTE — separadas de vigilante.py para poderlas PROBAR.
# vigilante.py no se puede importar en una prueba (al cargarlo consulta la BD, lee el sqlite de n8n y
# hasta manda correos). Una función "pura" (entra texto, sale decisión, sin tocar nada) sí se puede
# importar y probar mil veces sin miedo. Por eso vive aquí.
#
# Nace del caso "Laconic ceramic" (13-ago-2026): una fábrica de cerámica de la INDIA (+91) mandó su spam
# de ventas ("stock premium a 3,80 $"), el bot la atendió correctamente como proveedor... y el vigilante
# igual gritó "cliente perdido" con correo urgente. En 10 días, 5 de 15 alertas de cliente_perdido eran
# este mismo spam extranjero. Un vigilante que grita por spam enseña a ignorar el correo — y el día que
# haya un cliente perdido DE VERDAD, nadie lo va a mirar.

# Etapas donde el bot YA atendió a la persona y A PROPÓSITO no crea lead:
#   proveedor -> "este canal es la línea comercial de clientes"   info/reclamo -> Servicio al Cliente
#   empleo -> ayuda@ardisa.com   horario -> le respondió el horario   compras -> le preguntó a qué área va
ETAPAS_SIN_LEAD = {"proveedor", "info", "reclamo", "empleo", "horario", "compras"}


def clasifica_perdido(wa_id, recorrido):
    """Decide la severidad de una alerta de 'cliente perdido'. Devuelve (severidad, nota).

    severidad 1 = correo urgente + 🔴 en WhatsApp (cliente colombiano varado a mitad del flujo);
    severidad 2 = solo panel + 🟡 en WhatsApp (el bot ya lo despachó a propósito, o es spam extranjero).

    - Si TODO el recorrido son etapas de "atendido sin lead", el bot no lo perdió: lo atendió y decidió
      no crear lead (proveedores, reclamos, empleo...). Eso no es una emergencia.
    - Si el número no es colombiano (57...), es casi siempre proveedor/spam internacional (+91 India,
      +86 China, +63 Filipinas): Ardisa vende en Colombia.
    En ambos casos la alerta NO desaparece (el punto ciego del vigilante ya nos costó un cliente, caso
    573124639292): baja al panel con el texto completo para que una persona la pueda juzgar.
    """
    etapas = set(e for e in str(recorrido or "").split(">") if e)
    if etapas and etapas <= ETAPAS_SIN_LEAD:
        return 2, (" — OJO: el bot SÍ lo atendió (%s) y a propósito no crea lead; revisar solo si en "
                   "realidad era un cliente" % "/".join(sorted(etapas)))
    if not str(wa_id or "").startswith("57"):
        return 2, (" — número internacional (+%s...): casi siempre proveedor/spam, no un cliente de "
                   "Colombia" % str(wa_id)[:2])
    return 1, ""
