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
    """Decide la severidad de una alerta de 'cliente perdido'. Devuelve (severidad, nota, silencio).

    severidad 1 = correo urgente + 🔴 en WhatsApp (cliente colombiano varado a mitad del flujo);
    severidad 2 = solo panel + 🟡 en WhatsApp (el bot ya lo despachó a propósito).
    silencio True = queda registrada en la tabla `alertas` (auditoría/panel) pero NO se envía al
    WhatsApp de Deicy — pedido del 14-ago: el spam extranjero ya corregido no debe volver a sonar.

    - Si TODO el recorrido son etapas de "atendido sin lead", el bot no lo perdió: lo atendió y decidió
      no crear lead (proveedores, reclamos, empleo...). Eso no es una emergencia.
    - Si el número no es colombiano (57...), es casi siempre proveedor/spam internacional (+91 India,
      +86 China, +63 Filipinas): Ardisa vende en Colombia → se registra en silencio.
    La alerta nunca desaparece del registro (el punto ciego del vigilante ya nos costó un cliente,
    caso 573124639292): siempre queda en la tabla con el texto completo para poderla juzgar.
    """
    etapas = set(e for e in str(recorrido or "").split(">") if e)
    # 14-ago: un usuario con "username" de WhatsApp llega como BSUID ("CO.1352..."): CO = Colombia,
    # es un cliente colombiano con el número oculto, NO un extranjero.
    _wa = str(wa_id or "")
    extranjero = not (_wa.startswith("57") or _wa.startswith("CO."))
    if etapas and etapas <= ETAPAS_SIN_LEAD:
        return 2, (" — OJO: el bot SÍ lo atendió (%s) y a propósito no crea lead; revisar solo si en "
                   "realidad era un cliente" % "/".join(sorted(etapas))), extranjero
    if extranjero:
        return 2, (" — número internacional (+%s...): casi siempre proveedor/spam, no un cliente de "
                   "Colombia" % str(wa_id)[:2]), True
    return 1, "", False


def etapa_cola(horas_espera, horas_para_poda):
    """Decide en qué ETAPA está una cola de adjuntos atascada. Devuelve (etiqueta, severidad).

    Pedido de Deicy (14-ago): una cola que no cambia no se re-avisa cada día. La etiqueta entra en la
    clave de la alerta (UNIQUE en la BD), así que cada cola atascada avisa MÁXIMO 3 veces, y solo
    cuando algo cambia de verdad:
      'nueva'  (sev 2) -> apareció (lleva más de 6 h esperando)
      'grave'  (sev 1) -> cumplió un día entero sin destrabarse
      'final'  (sev 1) -> a la poda de 7 días le queda menos de un día: última llamada antes del descarte
    Si llega OTRO adjunto a la misma cola, el conteo cambia la clave y vuelve a avisar (eso SÍ es nuevo).
    """
    if horas_para_poda <= 24:
        return "final", 1
    if horas_espera >= 24:
        return "grave", 1
    return "nueva", 2
