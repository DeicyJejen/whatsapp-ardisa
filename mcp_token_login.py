#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# LOGIN INICIAL DEL TOKEN MCP (Fase 2 · cotización SAP) — se corre UNA vez (o cuando el refresh muera).
#
# El servidor MCP (mcp.ardisa.com) usa OAuth con login del Microsoft 365 de Ardisa: una persona con
# cuenta @ardisa.com autoriza UNA vez en el navegador, y de ahí en adelante mcp_token_refresh.py
# (cron cada 10 min) mantiene el token vivo solo. Recomendado: entrar con una cuenta INSTITUCIONAL
# (p.ej. noreply@ardisa.com) para que el acceso no dependa de la clave de una persona.
#
# Uso:
#   python3 mcp_token_login.py
#   1) abre en tu navegador el link que imprime
#   2) toca "Allow Access" e inicia sesión con tu cuenta @ardisa.com
#   3) el navegador terminará en una página que NO abre (http://127.0.0.1:8977/cb?...): es normal —
#      copia la URL COMPLETA de la barra de direcciones y pégala aquí
import json, os, time, re, hashlib, base64, secrets, urllib.request, urllib.parse

BASE = "https://mcp.ardisa.com"
REDIR = "http://127.0.0.1:8977/cb"
CLIENT_F = os.path.expanduser("~/.config/ardisa/mcp_oauth_client.json")
TOKENS_F = os.path.expanduser("~/.config/ardisa/mcp_oauth_tokens.json")


def _post(url, params):
    data = urllib.parse.urlencode(params).encode()
    r = urllib.request.urlopen(urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/x-www-form-urlencoded"}), timeout=20)
    return json.loads(r.read())


os.makedirs(os.path.dirname(CLIENT_F), exist_ok=True)
if os.path.exists(CLIENT_F):
    cli = json.load(open(CLIENT_F))
else:
    # registro dinámico (RFC 7591): el servidor emite client_id/secret para este bot
    req = urllib.request.Request(BASE + "/register", data=json.dumps({
        "redirect_uris": [REDIR], "client_name": "Bot WhatsApp Ardisa (Fase 2 cotizacion)",
        "grant_types": ["authorization_code", "refresh_token"], "response_types": ["code"],
        "token_endpoint_auth_method": "client_secret_post", "scope": "read"}).encode(),
        headers={"Content-Type": "application/json"})
    cli = json.loads(urllib.request.urlopen(req, timeout=20).read())
    print("cliente OAuth registrado:", cli.get("client_id"))

verifier = base64.urlsafe_b64encode(secrets.token_bytes(48)).rstrip(b"=").decode()
challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
cli["verifier"] = verifier
json.dump(cli, open(CLIENT_F, "w")); os.chmod(CLIENT_F, 0o600)

url = BASE + "/authorize?" + urllib.parse.urlencode({
    "response_type": "code", "client_id": cli["client_id"], "redirect_uri": REDIR,
    "scope": "read", "state": "ard" + secrets.token_hex(4),
    "code_challenge": challenge, "code_challenge_method": "S256"})
print("\n1) Abre este link en tu navegador, toca *Allow Access* e inicia sesión con tu cuenta @ardisa.com:\n")
print(url)
print("\n2) Al final el navegador intentará abrir http://127.0.0.1:8977/cb?... y dirá que no puede: es")
print("   NORMAL. Copia la URL completa de la barra de direcciones y pégala aquí.\n")
final = input("Pega la URL final: ").strip()
code = urllib.parse.parse_qs(urllib.parse.urlparse(final).query).get("code", [""])[0]
if not code:
    raise SystemExit("Esa URL no trae ?code=... — repite el proceso (el código vence en pocos minutos).")

tokens = _post(BASE + "/token", {
    "grant_type": "authorization_code", "code": code, "redirect_uri": REDIR,
    "client_id": cli["client_id"], "client_secret": cli["client_secret"], "code_verifier": verifier})
tokens["obtenido_en"] = time.time()
json.dump(tokens, open(TOKENS_F, "w")); os.chmod(TOKENS_F, 0o600)

# a la BD de una (el bot lo lee de ahí en cada mensaje)
import subprocess
tk = tokens["access_token"].replace("\\", "\\\\").replace("'", "''")
subprocess.run(["sudo", "-n", "mysql", "bot_ardisa", "-e",
                "UPDATE config SET valor='%s' WHERE clave='mcp_sap_token'" % tk], check=True)
print("\n✅ Token obtenido (vale %ss), guardado en %s y en la BD. El cron lo mantiene vivo solo."
      % (tokens.get("expires_in"), TOKENS_F))
