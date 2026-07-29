#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Monitor en vivo del bot de WhatsApp (pedido Deicy, 2026-07-29).

Uso:
    python3 monitor.py            # foto del momento
    python3 monitor.py --vivo     # se refresca solo cada 60s (Ctrl+C para salir)
    python3 monitor.py --dias 7   # cambia la ventana del reparto (default 7)

Responde de un vistazo:
  1. ¿El bot está VIVO? (workflow activo + ejecuciones + errores)
  2. ¿Qué llegó HOY y a quién?
  3. 🚨 ¿Le está llegando ferretería a Jhon Jairo? (la alarma que pidió María Lucía)
  4. ¿Está parejo el reparto entre asesores?
  5. ¿Hay duplicados?
  6. ¿Quién tiene leads sin reportar? (esto es lo que dispara los recordatorios diarios)
"""
import subprocess, sys, datetime, os, sqlite3, time

BASE = "/home/ubuntu/whatsapp-ardisa"
N8N_DB = "/opt/n8n/data/database.sqlite"
WF_ID = "botArdisaFase1x"

# El arreglo que sacó a Jhon Jairo de la rotación de Construcción (commit 4ce2e1f).
# Los leads de ferretería ANTERIORES a esta marca son historia, no fallas nuevas.
FIX_ALUMINIOS = "2026-07-29 16:20:00"
JHON = "Jhon Jairo Vargas Herreño"

# Producto que SÍ es de Jhon. Todo lo demás que le llegue es una fuga del ruteo.
ALUM_OK = "(detalle LIKE '%alumini%' OR solicitud LIKE '%alumini%')"
ALUM_FOIL = "(detalle LIKE '%manto%' OR detalle LIKE '%asfalt%' OR detalle LIKE '%impermeabiliz%' OR detalle LIKE '%foil%')"

C = {"r": "\033[91m", "g": "\033[92m", "y": "\033[93m", "b": "\033[94m",
     "d": "\033[2m", "n": "\033[0m", "B": "\033[1m"}
if not sys.stdout.isatty():
    C = {k: "" for k in C}


def q(sql):
    """Consulta a la BD de leads (MariaDB, vía sudo como los demás reportes)."""
    out = subprocess.check_output(
        ["sudo", "-n", "mysql", "--default-character-set=utf8mb4", "bot_ardisa", "-N", "-B", "-e", sql],
        text=True)
    return [l.split("\t") for l in out.splitlines() if l.strip()]


def qn8n(sql):
    """Consulta de SOLO LECTURA a la BD de n8n (no tocarla de otra forma: es corporativa)."""
    try:
        con = sqlite3.connect("file:%s?mode=ro" % N8N_DB, uri=True, timeout=10)
        rows = con.execute(sql).fetchall()
        con.close()
        return rows
    except Exception as e:
        return [("ERROR", str(e)[:60])]


def titulo(t):
    print("\n%s%s%s" % (C["B"], t, C["n"]))
    print(C["d"] + "─" * 66 + C["n"])


def salud():
    titulo("1. ¿EL BOT ESTÁ VIVO?")
    # OJO: los timestamps de la BD de n8n están en UTC; Colombia es UTC-5.
    act = qn8n("SELECT active FROM workflow_entity WHERE id='%s'" % WF_ID)
    activo = bool(act and act[0][0])
    print("   Workflow activo:      %s" % (
        C["g"] + "SÍ ✔" + C["n"] if activo else C["r"] + "NO ✘  ← EL BOT ESTÁ APAGADO" + C["n"]))

    ej = qn8n("SELECT status, COUNT(*) FROM execution_entity WHERE workflowId='%s' "
              "AND startedAt > datetime('now','-24 hours') GROUP BY status" % WF_ID)
    tot = sum(r[1] for r in ej if r[0] != "ERROR")
    mal = sum(r[1] for r in ej if r[0] in ("error", "crashed"))
    print("   Ejecuciones 24h:      %d" % tot)
    print("   Con error:            %s" % (
        C["g"] + "0 ✔" + C["n"] if mal == 0 else C["r"] + "%d ✘  ← revisar en n8n" % mal + C["n"]))

    ult = qn8n("SELECT MAX(startedAt) FROM execution_entity WHERE workflowId='%s'" % WF_ID)
    if ult and ult[0][0] and ult[0][0] != "ERROR":
        t = datetime.datetime.strptime(str(ult[0][0])[:19], "%Y-%m-%d %H:%M:%S")
        ahora_utc = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
        mins = (ahora_utc - t).total_seconds() / 60
        col = C["g"] if mins < 5 else (C["y"] if mins < 30 else C["r"])
        print("   Última señal:         %s%.0f min%s  %s" % (
            col, mins, C["n"], C["d"] + "(el cron late cada 1 min)" + C["n"]))


def hoy():
    titulo("2. LEADS DE HOY")
    # OJO: este SQL NO pasa por formateo de Python, así que el % de TIME_FORMAT va sencillo (no doble).
    r = q("SELECT id, TIME_FORMAT(creado_en,'%H:%i'), COALESCE(nombre,'—'), COALESCE(asesor,'(sin asesor)'), "
          "LEFT(COALESCE(detalle,''),38) FROM leads WHERE modo_prueba=0 AND DATE(creado_en)=CURDATE() ORDER BY id")
    if not r:
        print("   " + C["d"] + "Todavía no hay leads hoy." + C["n"])
        return
    for lid, hh, nom, ase, det in r:
        marca = C["y"] + "◆" + C["n"] if ase.startswith("Jhon") else " "
        print("  %s #%-4s %s  %-22s %-26s %s" % (marca, lid, hh, nom[:22], ase[:26],
                                                 C["d"] + det.replace("\\n", " ") + C["n"]))
    print("\n   Total hoy: %s%d%s" % (C["B"], len(r), C["n"]))


def alarma_jhon():
    titulo("3. 🚨 ¿LE ESTÁ LLEGANDO FERRETERÍA A JHON JAIRO?")
    print("   " + C["d"] + "Desde el arreglo del %s solo debe recibir ALUMINIO." % FIX_ALUMINIOS[:16] + C["n"])
    fuga = q("SELECT id, creado_en, COALESCE(nombre,'—'), LEFT(COALESCE(detalle,''),40) FROM leads "
             "WHERE modo_prueba=0 AND asesor='%s' AND creado_en > '%s' "
             "AND NOT %s ORDER BY id" % (JHON, FIX_ALUMINIOS, ALUM_OK))
    if not fuga:
        print("\n   %s✔ CERO fugas.%s Nada de ferretería le ha llegado desde el arreglo." % (C["g"], C["n"]))
    else:
        print("\n   %s✘ %d LEAD(S) SE FUGARON — el ruteo falló:%s" % (C["r"], len(fuga), C["n"]))
        for lid, cre, nom, det in fuga:
            print("     %s#%s  %s  %s — %s%s" % (C["r"], lid, cre[:16], nom, det, C["n"]))

    ok = q("SELECT id, creado_en, COALESCE(nombre,'—'), LEFT(COALESCE(detalle,''),40) FROM leads "
           "WHERE modo_prueba=0 AND asesor='%s' AND creado_en > '%s' AND %s ORDER BY id"
           % (JHON, FIX_ALUMINIOS, ALUM_OK))
    print("\n   Aluminios que SÍ le tocan (desde el arreglo): %s%d%s" % (C["B"], len(ok), C["n"]))
    for lid, cre, nom, det in ok:
        print("     #%s  %s  %s — %s" % (lid, cre[:16], nom, det))

    # El "aluminio" que NO es de Jhon: manto asfáltico, foil, cinta... esos van por ciudad.
    falso = q("SELECT id, creado_en, COALESCE(nombre,'—'), COALESCE(asesor,'—'), LEFT(COALESCE(detalle,''),36) "
              "FROM leads WHERE modo_prueba=0 AND creado_en > '%s' AND %s AND %s ORDER BY id"
              % (FIX_ALUMINIOS, ALUM_OK, ALUM_FOIL))
    if falso:
        print("\n   " + C["d"] + "Aluminio-foil (manto asfáltico, cinta…) — va por CIUDAD, no a Jhon:" + C["n"])
        for lid, cre, nom, ase, det in falso:
            print("     " + C["d"] + "#%s  %s → %s — %s" % (lid, nom, ase, det) + C["n"])


def reparto(dias):
    titulo("4. REPARTO ENTRE ASESORES (últimos %d días)" % dias)
    r = q("SELECT COALESCE(asesor,'(sin asesor)'), COUNT(*) FROM leads WHERE modo_prueba=0 "
          "AND creado_en >= CURDATE() - INTERVAL %d DAY GROUP BY 1 ORDER BY 2 DESC" % dias)
    if not r:
        print("   " + C["d"] + "Sin datos." + C["n"])
        return
    mx = max(int(n) for _, n in r)
    for ase, n in r:
        n = int(n)
        barra = "█" * max(1, round(n * 28 / mx))
        nota = ""
        if ase.startswith("Jhon"):
            nota = C["y"] + "  ← solo aluminios" + C["n"]
        elif ase.startswith("Karime"):
            nota = C["d"] + "  ← Carpincentro nacional" + C["n"]
        elif ase.startswith("Alexander"):
            nota = C["d"] + "  ← solo proyectos" + C["n"]
        print("   %-30s %3d  %s%s" % (ase[:30], n, barra, nota))


def duplicados():
    titulo("5. DUPLICADOS (mismo cliente, 2 leads en <45 min)")
    r = q("SELECT a.id, b.id, TIMESTAMPDIFF(MINUTE,a.creado_en,b.creado_en), COALESCE(b.nombre,b.telefono) "
          "FROM leads a JOIN leads b ON a.telefono=b.telefono AND b.id>a.id "
          "AND b.creado_en < a.creado_en + INTERVAL 45 MINUTE "
          "WHERE a.modo_prueba=0 AND b.modo_prueba=0 AND b.creado_en >= CURDATE() - INTERVAL 14 DAY ORDER BY a.id")
    if not r:
        print("   %s✔ Ninguno en 14 días.%s  %s" % (
            C["g"], C["n"], C["d"] + "(el candado de BD los bloquea y avisa al asesor)" + C["n"]))
    else:
        for a, b, m, nom in r:
            print("   %s✘ #%s y #%s — %s (%s min aparte)%s" % (C["r"], a, b, nom, m, C["n"]))


def sin_reportar():
    titulo("6. LEADS SIN REPORTAR  " + C["d"] + "(esto dispara los recordatorios diarios)" + C["n"])
    r = q("SELECT COALESCE(asesor,'—'), COUNT(*), MIN(DATE(creado_en)) FROM leads WHERE modo_prueba=0 "
          "AND (estado IS NULL OR estado='') AND creado_en >= CURDATE() - INTERVAL 30 DAY "
          "GROUP BY 1 ORDER BY 2 DESC")
    if not r:
        print("   %s✔ Todos reportaron.%s" % (C["g"], C["n"]))
        return
    for ase, n, desde in r:
        n = int(n)
        col = C["r"] if n >= 10 else (C["y"] if n >= 5 else "")
        print("   %-30s %s%3d pendiente(s)%s  %sel más viejo: %s%s"
              % (ase[:30], col, n, C["n"], C["d"], desde, C["n"]))
    print("\n   " + C["d"] + "Mientras un lead siga sin reportar, el bot le repite el nombre al asesor\n"
          "   cada día hábil. Por eso pueden VERSE nombres viejos de ferretería aunque\n"
          "   ya no le esté llegando nada nuevo." + C["n"])


def main():
    dias = 7
    if "--dias" in sys.argv:
        dias = int(sys.argv[sys.argv.index("--dias") + 1])
    vivo = "--vivo" in sys.argv
    while True:
        if vivo:
            os.system("clear")
        ahora = datetime.datetime.now().strftime("%A %d-%b-%Y %H:%M:%S")
        print("%s╔══ MONITOR BOT WHATSAPP — GRUPO ARDISA ══╗%s  %s" % (C["B"], C["n"], ahora))
        try:
            salud()
            hoy()
            alarma_jhon()
            reparto(dias)
            duplicados()
            sin_reportar()
        except subprocess.CalledProcessError as e:
            print("\n%sNo pude leer la BD de leads:%s %s" % (C["r"], C["n"], e))
        print()
        if not vivo:
            break
        print(C["d"] + "Refrescando en 60s… (Ctrl+C para salir)" + C["n"])
        try:
            time.sleep(60)
        except KeyboardInterrupt:
            print("\nListo. 👋")
            break


if __name__ == "__main__":
    main()
