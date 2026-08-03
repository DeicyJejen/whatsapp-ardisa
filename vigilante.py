#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# VIGILANTE DEL BOT (2026-08-03, pedido Deicy: "esos errores son los que necesito saber").
#
# POR QUÉ EXISTE: hasta hoy los errores se descubrían leyendo conversaciones a mano, días después.
# Así se perdieron 13 clientes en 5 días y nadie se enteró. Este script busca los MISMOS patrones
# automáticamente cada hora y deja constancia en la tabla `alertas`.
#
# DISEÑO (a propósito):
#   - El trabajo PESADO corre aquí, en un cron, NO en el camino del cliente. La consulta que el bot
#     hace en cada mensaje debe seguir siendo instantánea.
#   - La tabla `alertas` tiene UNIQUE(tipo, clave) y se inserta con INSERT IGNORE: repetir la corrida
#     NO duplica alertas. Eso se llama IDEMPOTENCIA y es lo que permite correr esto cada hora sin miedo.
#   - Solo se avisa por correo lo NUEVO y GRAVE (severidad 1). Un vigilante que grita por todo se ignora.
#
# Uso:  python3 vigilante.py            -> detecta, guarda y avisa por correo si hay algo nuevo grave
#       python3 vigilante.py --seco     -> solo muestra en pantalla, no guarda ni envía
import subprocess, os, sys, ssl, smtplib, datetime, base64, json
from email.message import EmailMessage

BASE      = "/home/ubuntu/whatsapp-ardisa"
KEY_N8N   = "/home/ubuntu/.config/ardisa/n8n_api_key"
SMTP_HOST, SMTP_PORT = "smtp.office365.com", 587
SMTP_USER = "noreply@ardisa.com"
SMTP_PASS = open("/home/ubuntu/.config/ardisa/smtp_pass").read().strip()
DEST      = ["deicy.jejen@ardisa.com", "ernesto.rondano@ardisa.com"]
SECO      = "--seco" in sys.argv
AHORA     = datetime.datetime.now()

def q(sql):
    out = subprocess.check_output(
        ["sudo","-n","mysql","--default-character-set=utf8mb4","bot_ardisa","-N","-B","-e",sql],
        text=True, errors="replace")
    return [l.split("\t") for l in out.splitlines() if l.strip()]

def esc(s):
    return str(s).replace("\\","\\\\").replace("'","''").replace("\n"," ")[:400]

hallazgos = []   # (tipo, severidad, clave, detalle)
def anota(tipo, sev, clave, detalle):
    hallazgos.append((tipo, sev, str(clave)[:120], detalle))

# ── Excluir a quien NO es cliente: asesores, la línea de monitoreo y los números de prueba ──
NO_CLIENTE = ("AND m.wa_id <> '573205662947' AND m.wa_id NOT LIKE '5799999%' "
              "AND m.wa_id COLLATE utf8mb4_unicode_ci NOT IN (SELECT DISTINCT asesor_tel COLLATE utf8mb4_unicode_ci FROM leads WHERE asesor_tel IS NOT NULL AND asesor_tel<>'') "
              "AND m.etapa NOT LIKE 'seg\\_%' AND m.etapa NOT LIKE 'admin\\_%' "
              "AND m.etapa NOT IN ('asesor_activo','noop','proveedor')")

# ═══ 1. CARRERA DEL CONSENTIMIENTO ═══════════════════════════════════════════
# El cliente autoriza y segundos después el bot se lo vuelve a pedir (staticData pisado por
# ejecuciones en paralelo). Arreglado el 3-ago leyendo la BD; esto vigila que no vuelva.
for tel, nom, cuando, seg in q("""
    SELECT c.telefono, COALESCE(c.nombre,''), DATE_FORMAT(c.creado_en,'%d/%m %H:%i:%s'),
           TIMESTAMPDIFF(SECOND, c.creado_en, MIN(m.creado_en))
    FROM consentimientos c
    JOIN mensajes m ON m.wa_id COLLATE utf8mb4_unicode_ci = c.telefono COLLATE utf8mb4_unicode_ci
    WHERE c.decision='SI' AND m.etapa='consent' AND m.creado_en > c.creado_en
      AND c.creado_en >= NOW() - INTERVAL 3 DAY
    GROUP BY c.telefono, c.nombre, c.creado_en
    HAVING TIMESTAMPDIFF(SECOND, c.creado_en, MIN(m.creado_en)) <= 90"""):
    anota("carrera_consent", 1, tel+"|"+cuando,
          "%s (%s) autorizó el %s y el bot se lo volvió a pedir %ss después" % (nom or tel, tel, cuando, seg))

# ═══ 2. CLIENTE PERDIDO ══════════════════════════════════════════════════════
# Escribió 2+ mensajes propios, la conversación se cerró por inactividad y NUNCA quedó registrado.
for wa, nom, n, ini, ult in q("""
    SELECT m.wa_id, COALESCE(MAX(m.nombre),''), SUM(m.entrada<>'(inactividad)'),
           DATE_FORMAT(MIN(m.creado_en),'%d/%m %H:%i'),
           GROUP_CONCAT(DISTINCT LEFT(m.etapa,18) ORDER BY m.creado_en SEPARATOR '>')
    FROM mensajes m
    WHERE m.creado_en >= NOW() - INTERVAL 2 DAY """ + NO_CLIENTE + """
      AND NOT EXISTS (SELECT 1 FROM leads l
                      WHERE l.telefono COLLATE utf8mb4_unicode_ci = m.wa_id COLLATE utf8mb4_unicode_ci)
    GROUP BY m.wa_id
    HAVING SUM(m.etapa='cierre_inactividad')>0 AND SUM(m.entrada<>'(inactividad)')>=2"""):
    anota("cliente_perdido", 1, wa+"|"+ini,
          "%s (%s) escribió %s veces desde el %s y NO quedó registrado — recorrido: %s" % (nom or wa, wa, n, ini, ult))

# ═══ 3. PIDIÓ EMPLEO ═════════════════════════════════════════════════════════
# No es cliente ni proveedor: el bot le insiste con el permiso de datos y el menú de marcas.
for wa, nom, txt_, cuando in q("""
    SELECT m.wa_id, COALESCE(MAX(m.nombre),''),
           LEFT(MAX(m.entrada),80), DATE_FORMAT(MIN(m.creado_en),'%d/%m %H:%i')
    FROM mensajes m
    WHERE m.creado_en >= NOW() - INTERVAL 2 DAY """ + NO_CLIENTE + """
      AND (m.entrada LIKE '%hoja de vida%' OR m.entrada LIKE '%quiero trabajar%'
        OR m.entrada LIKE '%trabajar con ustedes%' OR m.entrada LIKE '%trabajar para ustedes%'
        OR m.entrada LIKE '%vacante%' OR m.entrada LIKE '%buscando empleo%')
    GROUP BY m.wa_id"""):
    anota("pide_empleo", 2, wa+"|"+cuando,
          "%s (%s) escribió buscando trabajo el %s: \"%s\"" % (nom or wa, wa, cuando, txt_))

# ═══ 4. TAREAS AUTOMÁTICAS QUE FALLARON ══════════════════════════════════════
# Un cron que se cae en silencio es peor que uno que no existe: se cree que está funcionando.
for log in ("cron_reporte.log", "cron_seguimiento.log", "cron_duplicados.log", "cron_backup.log", "cron_vigilante.log"):
    ruta = BASE + "/reportes/" + log
    if not os.path.exists(ruta): continue
    if (AHORA - datetime.datetime.fromtimestamp(os.path.getmtime(ruta))).days > 2: continue
    txt_ = open(ruta, errors="replace").read()[-4000:]
    if "Traceback" in txt_ or "Error" in txt_:
        ultima = [l for l in txt_.splitlines() if l.strip()][-1][:200]
        anota("cron_fallido", 1, log + "|" + AHORA.strftime("%Y-%m-%d"),
              "La tarea automática %s registró un error. Última línea: %s" % (log, ultima))

# ═══ 5. TOKEN DE DESPLIEGUE POR VENCER ═══════════════════════════════════════
# El 30-jul venció sin que nadie se enterara: 4 días sin poder desplegar arreglos.
try:
    p = open(KEY_N8N).read().strip().split(".")[1]
    exp = json.loads(base64.urlsafe_b64decode(p + "=" * (-len(p) % 4))).get("exp")
    if exp:
        dias = (datetime.datetime.fromtimestamp(exp) - AHORA).days
        if dias < 10:
            anota("token_n8n", 1, "exp" + str(exp),
                  "El token de despliegue de n8n vence en %d día(s) (%s). Generar uno nuevo en Settings > n8n API."
                  % (dias, datetime.datetime.fromtimestamp(exp).strftime("%d/%m/%Y")))
except Exception as e:
    anota("token_n8n", 2, "ilegible|" + AHORA.strftime("%Y-%m-%d"), "No se pudo leer el token de n8n: %s" % e)

# ═══ 6. LEADS MUY VIEJOS SIN REPORTAR ════════════════════════════════════════
for asesor, n, viejo in q("""
    SELECT asesor, COUNT(*), DATE_FORMAT(MIN(creado_en),'%d/%m')
    FROM leads WHERE modo_prueba=0 AND (estado IS NULL OR estado='')
      AND creado_en < NOW() - INTERVAL 10 DAY
    GROUP BY asesor HAVING COUNT(*) >= 5"""):
    anota("sin_reportar", 2, asesor + "|" + AHORA.strftime("%Y-%W"),
          "%s tiene %s leads sin reportar de más de 10 días (el más viejo del %s)" % (asesor, n, viejo))

# ── Guardar (idempotente) y avisar solo lo NUEVO y GRAVE ─────────────────────
if SECO:
    for t, sev, c, det in hallazgos: print("[%s] sev%d  %s" % (t, sev, det))
    print("\n%d hallazgo(s) — modo seco, no se guardó nada" % len(hallazgos))
    raise SystemExit(0)

nuevos = []
for t, sev, c, det in hallazgos:
    antes = q("SELECT COUNT(*) FROM alertas WHERE tipo='%s' AND clave='%s'" % (esc(t), esc(c)))
    if antes and antes[0][0] != "0":
        continue                                  # ya estaba: no se re-avisa (anti-spam)
    q("INSERT IGNORE INTO alertas (creado_en,tipo,severidad,clave,detalle) "
      "VALUES (NOW(),'%s',%d,'%s','%s')" % (esc(t), sev, esc(c), esc(det)))
    nuevos.append((t, sev, det))

graves = [x for x in nuevos if x[1] == 1]
print("%s | hallazgos: %d | nuevos: %d | graves nuevos: %d"
      % (AHORA.strftime("%Y-%m-%d %H:%M"), len(hallazgos), len(nuevos), len(graves)))

if graves:
    cuerpo = ("El vigilante del bot detectó situaciones que requieren atención:\n\n"
              + "\n".join("• " + d for _, _, d in graves)
              + "\n\nQuedaron registradas en la tabla `alertas` y aparecen en el panel de WhatsApp "
                "(escribe 'informe' al bot).\n\nEste chequeo es automático y corre cada hora.")
    msg = EmailMessage()
    msg["From"] = "Grupo Ardisa (Vigilante del Bot) <%s>" % SMTP_USER
    msg["To"] = ", ".join(DEST)
    msg["Subject"] = "Alerta del bot WhatsApp — %d situacion(es) nueva(s)" % len(graves)
    msg.set_content(cuerpo)
    s = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=60); s.ehlo()
    s.starttls(context=ssl.create_default_context()); s.ehlo(); s.login(SMTP_USER, SMTP_PASS)
    s.send_message(msg); s.quit()
    print("Correo de alerta enviado a: %s" % ", ".join(DEST))
