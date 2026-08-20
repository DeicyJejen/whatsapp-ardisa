#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# REFRESCADOR DEL TOKEN MCP (Fase 2 · cotización SAP) — corre por cron cada 10 minutos.
#
# POR QUÉ EXISTE: el servidor MCP (mcp.ardisa.com) autentica con OAuth delegado en el Microsoft 365 de
# Ardisa ("MultiAuth"). El access_token CADUCA; si nadie lo renueva, la cotización empieza a fallar en
# silencio (el cliente cae al asesor y nadie nota — lección del token de n8n que venció el 30-jul y del
# nodo de sesiones que murió callado 4 días). Este script renueva el token ANTES de que venza usando el
# refresh_token y deja el vigente en la BD (`config.mcp_sap_token`), que el bot lee EN CADA mensaje:
# la rotación es en caliente, sin desplegar ni reiniciar nada.
#
# Si el refresh_token muere (revocado, contraseña cambiada, política M365): este script imprime ERROR
# (el vigilante lee este log cada hora y alerta) y hay que repetir el login UNA vez:
#     python3 mcp_token_login.py
#
# Uso:  python3 mcp_token_refresh.py           -> renueva si hace falta y sincroniza la BD
#       python3 mcp_token_refresh.py --forzar  -> renueva ya, sin mirar cuánto le queda
import json, os, sys, time, subprocess, urllib.request, urllib.parse, urllib.error, datetime

CLIENT_F = os.path.expanduser("~/.config/ardisa/mcp_oauth_client.json")
TOKENS_F = os.path.expanduser("~/.config/ardisa/mcp_oauth_tokens.json")
TOKEN_URL = "https://mcp.ardisa.com/token"
AHORA = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")


def bd(sql):
    return subprocess.check_output(["sudo", "-n", "mysql", "bot_ardisa", "-N", "-B", "-e", sql],
                                   text=True).strip()


def guardar_bd(token):
    # el token es opaco (JWT/hex) pero igual se escapa; ver n8n-mysql-marcadores: aquí es el CLI, ' basta
    bd("UPDATE config SET valor='%s' WHERE clave='mcp_sap_token'" % token.replace("\\", "\\\\").replace("'", "''"))


if not os.path.exists(CLIENT_F) or not os.path.exists(TOKENS_F):
    print("%s | sin tokens aún (login inicial pendiente: python3 mcp_token_login.py) — nada que hacer" % AHORA)
    raise SystemExit(0)

cli = json.load(open(CLIENT_F))
tok = json.load(open(TOKENS_F))
ttl = int(tok.get("expires_in") or 3600)
obtenido = float(tok.get("obtenido_en") or 0)          # lo escribe este script / el login
restante = (obtenido + ttl) - time.time() if obtenido else -1
FORZAR = "--forzar" in sys.argv

# 2026-08-20 (caso real, 10:30): el MCP se REINICIÓ y borró sus clientes OAuth — el token local decía
# "quedan 49min" pero el servidor lo rechazaba con 401, y este script siguió diciendo "vigente" media
# hora mientras todas las cotizaciones caían al asesor. El reloj local NO basta: se le pregunta AL
# SERVIDOR. Si él dice 401, se renueva de una; si la renovación también falla (invalid_client = clientes
# borrados), la línea ERROR de abajo la ve el vigilante en su ronda horaria y alerta a Deicy.
def servidor_acepta(token):
    try:
        req = urllib.request.Request("https://mcp.ardisa.com/mcp",
            data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize",
                "params": {"protocolVersion": "2025-03-26", "capabilities": {},
                           "clientInfo": {"name": "refrescador", "version": "1"}}}).encode(),
            headers={"Content-Type": "application/json",
                     "Accept": "application/json, text/event-stream",
                     "Authorization": "Bearer " + token})
        urllib.request.urlopen(req, timeout=8).read(200)
        return True
    except urllib.error.HTTPError as e:
        return e.code != 401          # solo el 401 delata token muerto; un 500 no es culpa del token
    except Exception:
        return True                   # red caída ≠ token malo: no renovar a ciegas


# Renovar cuando quede menos del 35% de la vida o menos de 15 min (lo que sea mayor). Si no sabemos
# cuándo se obtuvo (archivo viejo), se renueva de una: renovar de más es gratis, quedarse corto no.
umbral = max(15 * 60, ttl * 0.35)
if not FORZAR and restante > umbral:
    if not servidor_acepta(tok.get("access_token", "")):
        print("%s | ⚠️ el SERVIDOR rechaza el token (401) aunque localmente quedaban %dmin — ¿reinicio del "
              "MCP? renovando ya" % (AHORA, restante / 60))
    else:
        # aun así, sincroniza la BD por si alguien la vació a mano (el bot lee la BD, no el archivo)
        if bd("SELECT valor FROM config WHERE clave='mcp_sap_token'") != tok.get("access_token", ""):
            guardar_bd(tok.get("access_token", ""))
            print("%s | BD desincronizada -> re-escrita (token vigente, quedan %dmin)" % (AHORA, restante / 60))
        else:
            print("%s | token vigente (quedan %dmin) — sin cambios" % (AHORA, restante / 60))
        raise SystemExit(0)

data = urllib.parse.urlencode({
    "grant_type": "refresh_token", "refresh_token": tok.get("refresh_token", ""),
    "client_id": cli["client_id"], "client_secret": cli["client_secret"]}).encode()
try:
    r = urllib.request.urlopen(urllib.request.Request(
        TOKEN_URL, data=data, headers={"Content-Type": "application/x-www-form-urlencoded"}), timeout=20)
    nuevo = json.loads(r.read())
except urllib.error.HTTPError as e:
    print("%s | ERROR al renovar el token MCP (HTTP %s): %s — si es invalid_grant, repetir el login: "
          "python3 mcp_token_login.py" % (AHORA, e.code, e.read(300).decode("utf-8", "replace")))
    raise SystemExit(1)
except Exception as e:
    print("%s | ERROR al renovar el token MCP: %s" % (AHORA, e))
    raise SystemExit(1)

if not nuevo.get("access_token"):
    print("%s | ERROR: la respuesta del /token no trae access_token: %s" % (AHORA, str(nuevo)[:200]))
    raise SystemExit(1)

# el servidor puede ROTAR el refresh_token: si manda uno nuevo se usa ese; si no, se conserva el actual
if not nuevo.get("refresh_token"):
    nuevo["refresh_token"] = tok.get("refresh_token", "")
nuevo["obtenido_en"] = time.time()
json.dump(nuevo, open(TOKENS_F, "w"))
os.chmod(TOKENS_F, 0o600)
guardar_bd(nuevo["access_token"])
print("%s | token MCP renovado (vale %ss) y guardado en la BD" % (AHORA, nuevo.get("expires_in")))
