#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Chequeo de leads DUPLICADOS (red de seguridad tras el blindaje anti-duplicado, 2026-07-21, pedido Deicy).
# Si un mismo número tiene 2+ leads REALES creados con <=40 min de diferencia -> avisa por correo.
# 2026-07-22: MARCA DE AGUA en vez de ventana fija de 2h — antes, un duplicado creado entre las 18:00 y las 06:00
# (o el domingo) nunca se alertaba porque en la corrida siguiente ya estaba fuera de la ventana. Ahora cada corrida
# revisa desde la corrida anterior (con 40 min de solape para pares que crucen el borde): la de las 8am cubre la
# noche y la del lunes cubre el domingo, sin cambiar el cron (0 8-18 * * 1-6).
# También se detectan CADENAS (3+ leads encadenados <=40 min entre vecinos aunque el total pase de 40).
# Anti-spam: no re-alerta un conjunto de ids ya avisado (reportes/dup_alerted.txt).
import subprocess, ssl, smtplib, os, datetime
from email.message import EmailMessage

BASE = "/home/ubuntu/whatsapp-ardisa"
ALERTED = BASE + "/reportes/dup_alerted.txt"
STATE = BASE + "/reportes/dup_lastrun.txt"
SMTP_HOST="smtp.office365.com"; SMTP_PORT=587; SMTP_USER="noreply@ardisa.com"
SMTP_PASS=open("/home/ubuntu/.config/ardisa/smtp_pass").read().strip()
DEST=["deicy.jejen@ardisa.com","ernesto.rondano@ardisa.com"]

def q(sql):
    out = subprocess.check_output(
        ["sudo","-n","mysql","--default-character-set=utf8mb4","bot_ardisa","-N","-B","-e",sql],
        text=True)
    return [l.split("\t") for l in out.splitlines() if l.strip()]

def marca_agua():
    """Timestamp de la última corrida (default: hace 2h; tope: hace 7 días si estuvo mucho sin correr)."""
    now = datetime.datetime.now()
    last = now - datetime.timedelta(hours=2)
    try:
        t = datetime.datetime.strptime(open(STATE).read().strip(), "%Y-%m-%d %H:%M:%S")
        if t < last:
            last = t
    except Exception:
        pass
    piso = now - datetime.timedelta(days=7)
    return max(last, piso), now

last, now = marca_agua()
desde = (last - datetime.timedelta(minutes=40)).strftime("%Y-%m-%d %H:%M:%S")

leads = q("SELECT id, telefono, COALESCE(nombre,''), creado_en FROM leads "
          "WHERE modo_prueba=0 AND creado_en >= '%s' ORDER BY telefono, creado_en, id" % desde)

# Agrupar por teléfono y armar CLÚSTERES: leads consecutivos con <=40 min entre vecinos.
grupos = []
por_tel = {}
for lid, tel, nom, cre in leads:
    por_tel.setdefault(tel, []).append((lid, nom, datetime.datetime.strptime(cre, "%Y-%m-%d %H:%M:%S")))
for tel, items in por_tel.items():
    cluster = [items[0]]
    for it in items[1:]:
        if (it[2] - cluster[-1][2]) <= datetime.timedelta(minutes=40):
            cluster.append(it)
        else:
            if len(cluster) > 1: grupos.append((tel, cluster))
            cluster = [it]
    if len(cluster) > 1: grupos.append((tel, cluster))

def fin_ok(msg):
    with open(STATE, "w") as f:
        f.write(now.strftime("%Y-%m-%d %H:%M:%S"))
    print(msg); raise SystemExit(0)

if not grupos:
    fin_ok("OK: sin duplicados recientes (desde %s)" % desde)

# anti-spam: no re-alertar el mismo conjunto de ids NI un subconjunto de uno ya avisado
# (un clúster '5,6,7' ya alertado se ve como '6,7' cuando su lead más viejo sale de la ventana deslizante)
seen_sets = []
if os.path.exists(ALERTED):
    seen_sets = [set(l.split(",")) for l in open(ALERTED).read().split() if l]
nuevos = [(tel, cl) for tel, cl in grupos
          if not any(set(x[0] for x in cl) <= s for s in seen_sets)]
if not nuevos:
    fin_ok("Duplicados presentes pero ya avisados (%d)" % len(grupos))

lines=[]
for tel, cl in nuevos:
    ids = ",".join(x[0] for x in cl)
    nom = next((x[1] for x in cl if x[1]), tel)
    lines.append("• %s (%s) — %d leads [ids %s], %s a %s" % (
        nom, tel, len(cl), ids,
        cl[0][2].strftime("%Y-%m-%d %H:%M"), cl[-1][2].strftime("%Y-%m-%d %H:%M")))
body=("Se detectaron leads DUPLICADOS en el bot (mismo cliente, leads muy seguidos):\n\n"
      + "\n".join(lines)
      + "\n\nDeja solo 1 lead por cliente (borra el/los duplicados) para que el reporte quede correcto.\n\nEste chequeo es automatico.")
msg=EmailMessage()
msg["From"]="Grupo Ardisa (Bot WhatsApp) <%s>"%SMTP_USER
msg["To"]=", ".join(DEST)
msg["Subject"]="Alerta: leads duplicados detectados - Bot WhatsApp"
msg.set_content(body)
s=smtplib.SMTP(SMTP_HOST,SMTP_PORT,timeout=30); s.ehlo()
s.starttls(context=ssl.create_default_context()); s.ehlo(); s.login(SMTP_USER,SMTP_PASS)
s.send_message(msg); s.quit()

with open(ALERTED,"a") as f:
    for tel, cl in nuevos: f.write(",".join(x[0] for x in cl)+"\n")
fin_ok("ALERTA enviada: %d duplicado(s) nuevo(s)" % len(nuevos))
