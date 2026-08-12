#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Manual de usuario v2 del Bot WhatsApp Grupo Ardisa — versión PowerPoint (pedido Deicy 12-ago).
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR

NAVY  = RGBColor(0x0E, 0x2A, 0x3B)
TEAL  = RGBColor(0x0E, 0x8F, 0x88)
TEALD = RGBColor(0x0B, 0x6C, 0x68)
GREEN = RGBColor(0x0E, 0x8A, 0x4E)
PAPER = RGBColor(0xF6, 0xF8, 0xF4)
INK   = RGBColor(0x18, 0x24, 0x20)
SOFT  = RGBColor(0x54, 0x66, 0x5C)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
AMBER = RGBColor(0xF2, 0xC0, 0x5C)
LINE  = RGBColor(0xDE, 0xE6, 0xDE)

prs = Presentation()
prs.slide_width  = Inches(13.333)
prs.slide_height = Inches(7.5)
BLANK = prs.slide_layouts[6]
W, H = prs.slide_width, prs.slide_height

def fondo(s, color=PAPER):
    s.background.fill.solid()
    s.background.fill.fore_color.rgb = color

def caja(s, x, y, w, h, fill=None, line=None):
    from pptx.enum.shapes import MSO_SHAPE
    sh = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h)
    sh.adjustments[0] = 0.06
    if fill is None: sh.fill.background()
    else: sh.fill.solid(); sh.fill.fore_color.rgb = fill
    if line is None: sh.line.fill.background()
    else: sh.line.color.rgb = line; sh.line.width = Pt(1)
    sh.shadow.inherit = False
    return sh

def texto(s, x, y, w, h, runs, size=16, color=INK, bold=False, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, sp_after=6):
    tb = s.shapes.add_textbox(x, y, w, h); tf = tb.text_frame
    tf.word_wrap = True; tf.vertical_anchor = anchor
    items = runs if isinstance(runs, list) else [runs]
    for i, it in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align; p.space_after = Pt(sp_after)
        partes = it if isinstance(it, list) else [(it, {})]
        for txt, st in partes:
            r = p.add_run(); r.text = txt
            r.font.size = Pt(st.get('size', size)); r.font.bold = st.get('bold', bold)
            r.font.color.rgb = st.get('color', color); r.font.name = 'Segoe UI'
            if st.get('italic'): r.font.italic = True
    return tb

def cabecera(s, num, titulo, sub=None):
    fondo(s)
    barra = caja(s, 0, 0, W, Inches(1.06), fill=NAVY)
    texto(s, Inches(0.55), Inches(0.16), Inches(0.9), Inches(0.74),
          [[(num, {'size': 30, 'bold': True, 'color': AMBER})]], anchor=MSO_ANCHOR.MIDDLE)
    texto(s, Inches(1.35), Inches(0.16), Inches(11.4), Inches(0.74),
          [[(titulo, {'size': 26, 'bold': True, 'color': WHITE})] + ([("   ·  " + sub, {'size': 14, 'color': RGBColor(0xB8,0xD4,0xCF)})] if sub else [])],
          anchor=MSO_ANCHOR.MIDDLE)

def vinetas(s, x, y, w, h, items, size=15):
    tb = s.shapes.add_textbox(x, y, w, h); tf = tb.text_frame; tf.word_wrap = True
    for i, it in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(8)
        partes = it if isinstance(it, list) else [(it, {})]
        for txt, st in partes:
            r = p.add_run(); r.text = txt
            r.font.size = Pt(st.get('size', size)); r.font.bold = st.get('bold', False)
            r.font.color.rgb = st.get('color', INK); r.font.name = 'Segoe UI'
    return tb

def tabla(s, x, y, w, filas, anchos, alto_fila=0.42, size=12.5, header=True):
    rows, cols = len(filas), len(filas[0])
    gt = s.shapes.add_table(rows, cols, x, y, w, Inches(alto_fila * rows)).table
    for j, a in enumerate(anchos): gt.columns[j].width = Inches(a)
    for i, fila in enumerate(filas):
        for j, val in enumerate(fila):
            c = gt.cell(i, j); c.text = val
            c.margin_left = Inches(0.08); c.margin_right = Inches(0.08)
            c.margin_top = Inches(0.03); c.margin_bottom = Inches(0.03)
            c.vertical_anchor = MSO_ANCHOR.MIDDLE
            for p in c.text_frame.paragraphs:
                for r in p.runs:
                    r.font.size = Pt(size); r.font.name = 'Segoe UI'
                    if i == 0 and header:
                        r.font.bold = True; r.font.color.rgb = WHITE
                    else:
                        r.font.color.rgb = INK
            c.fill.solid()
            c.fill.fore_color.rgb = NAVY if (i == 0 and header) else (WHITE if i % 2 else RGBColor(0xEF,0xF4,0xEF))
    return gt

def nota(s, x, y, w, txt, emoji="⚠️"):
    cj = caja(s, x, y, w, Inches(0.86), fill=RGBColor(0xFF,0xF6,0xE5), line=RGBColor(0xE8,0xC7,0x7D))
    tf = cj.text_frame; tf.word_wrap = True; tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    tf.margin_left = Inches(0.18); tf.margin_right = Inches(0.15)
    p = tf.paragraphs[0]; r = p.add_run(); r.text = emoji + "  " + txt
    r.font.size = Pt(13); r.font.color.rgb = RGBColor(0x5B,0x43,0x00); r.font.name = 'Segoe UI'
    return cj

def pie(s, n):
    texto(s, Inches(0.55), Inches(7.08), Inches(12.2), Inches(0.34),
          [[("Manual de usuario v2 · Bot WhatsApp Grupo Ardisa · agosto 2026", {'size': 10, 'color': SOFT}),
            ("      %d" % n, {'size': 10, 'color': SOFT, 'bold': True})]])

# ── 1. PORTADA ────────────────────────────────────────────────────────────────
s = prs.slides.add_slide(BLANK); fondo(s, NAVY)
caja(s, Inches(0.55), Inches(3.28), Inches(2.2), Inches(0.08), fill=GREEN)
texto(s, Inches(0.55), Inches(1.10), Inches(12.2), Inches(0.5),
      [[("GRUPO ARDISA · LÍNEA COMERCIAL WHATSAPP 316", {'size': 15, 'bold': True, 'color': AMBER})]])
texto(s, Inches(0.55), Inches(1.62), Inches(12.2), Inches(1.5),
      [[("Manual de usuario del bot y su panel", {'size': 40, 'bold': True, 'color': WHITE})]])
texto(s, Inches(0.55), Inches(3.6), Inches(11.5), Inches(1.6),
      [[("Versión 2 — agosto de 2026. Cubre el bot con inteligencia artificial (Fase 1 + Fase 2), el panel de conversaciones con el chat híbrido, el seguimiento de solicitudes, las alertas del vigilante y qué hacer cuando algo falla.", {'size': 17, 'color': RGBColor(0xC9,0xDA,0xD5)})]])
texto(s, Inches(0.55), Inches(6.4), Inches(12, ), Inches(0.5),
      [[("Preparado para el equipo de coordinación · Reemplaza el manual de la Fase 1", {'size': 12, 'color': RGBColor(0x8F,0xA8,0xA2)})]])

# ── 2. CONTENIDO ──────────────────────────────────────────────────────────────
s = prs.slides.add_slide(BLANK); cabecera(s, "☰", "Contenido")
izq = ["1 · El sistema en un mapa", "2 · Panel de conversaciones", "3 · Chat híbrido: atender tú misma",
       "4 · Seguimiento de solicitudes", "5 · Tu panel por WhatsApp"]
der = ["6 · Cómo reportan los asesores", "7 · Alertas del vigilante", "8 · Correos automáticos",
       "9 · Fase 2: la IA y SAP", "10 · Si algo falla"]
vinetas(s, Inches(0.9), Inches(1.7), Inches(5.8), Inches(4.6), [[(t, {'size': 19, 'bold': True})] for t in izq])
vinetas(s, Inches(7.0), Inches(1.7), Inches(5.8), Inches(4.6), [[(t, {'size': 19, 'bold': True})] for t in der])
pie(s, 2)

# ── 3. MAPA ───────────────────────────────────────────────────────────────────
s = prs.slides.add_slide(BLANK); cabecera(s, "1", "El sistema en un mapa", "cinco piezas que trabajan juntas")
tabla(s, Inches(0.55), Inches(1.45), Inches(12.25), [
    ["Pieza", "Qué hace", "Dónde la ves"],
    ["El bot", "Atiende el 316 las 24 horas: autorización de datos, entiende el pedido con IA, rutea al asesor experto y registra todo.", "El cliente lo vive en WhatsApp"],
    ["Panel de conversaciones", "Ver cada chat como en WhatsApp y, desde ahora, responder tú misma (chat híbrido).", "n8n.ardisa.com/monitor/"],
    ["Seguimiento", "La tabla de solicitudes con estados, valores y filtros; exporta a Excel.", "…/monitor/seguimiento.php"],
    ["Vigilante", "Revisa el bot cada hora: clientes perdidos, crones caídos, colas atascadas.", "Correo a Deicy + panel de WhatsApp"],
    ["Reportes automáticos", "Excel semanal por marca a coordinación; chequeo de duplicados diario.", "Correo, lunes 7:00 a.m."],
], [2.3, 6.9, 3.05], alto_fila=0.72, size=13)
nota(s, Inches(0.55), Inches(6.1), Inches(12.25),
     "El panel solo abre desde la red de la oficina (MikroTik) o la VPN. Si no abre desde tu casa, esa es la razón — no es un daño.", "🔒")
pie(s, 3)

# ── 4. PANEL ──────────────────────────────────────────────────────────────────
s = prs.slides.add_slide(BLANK); cabecera(s, "2", "Panel de conversaciones", "n8n.ardisa.com/monitor/")
vinetas(s, Inches(0.75), Inches(1.5), Inches(11.9), Inches(4.4), [
    [("Pestañas Clientes / Asesores:  ", {'bold': True}), ("los chats donde los asesores reportan van aparte, para no mezclarlos con los de clientes.", {})],
    [("Hoy / Ayer / Todos:  ", {'bold': True}), ("filtro por día. El contador dice cuántos chats hay, cuántos están 🟢 en curso (últimos 30 min) y cuántos tienes 👩‍💼 contigo.", {})],
    [("🗑️ Ocultar:  ", {'bold': True}), ("saca un chat de la lista SIN borrar nada (proveedores, spam). Se restaura desde “🗂️ Ver ocultos”.", {})],
    [("Fotos, audios y documentos  ", {'bold': True}), ("del cliente se ven dentro del chat.", {})],
    [("Actualización automática:  ", {'bold': True}), ("la página se refresca sola cada 15 segundos — pero nunca mientras estés escribiendo una respuesta.", {})],
], size=16)
pie(s, 4)

# ── 5. CHAT HÍBRIDO qué es ────────────────────────────────────────────────────
s = prs.slides.add_slide(BLANK); cabecera(s, "3", "Chat híbrido: atender tú misma", "nuevo desde el 12 de agosto")
texto(s, Inches(0.75), Inches(1.4), Inches(11.9), Inches(0.9),
      [[("Puedes responderle a un cliente por el MISMO número del bot, sin salir del panel. Mientras tú atiendes, el bot se calla (no manda menús ni recordatorios) y todo queda grabado en el historial.", {'size': 16})]])
pasos = [
    ("1", "Abre el chat y toca “👩‍💼 Atender yo”", "O simplemente escribe en la caja y envía: tomar la conversación es automático al responder."),
    ("2", "Escribe en la caja de abajo", "Enter envía · Shift+Enter hace salto de línea. Tus mensajes salen con la burbuja azul “👩‍💼 Ardisa (panel)”."),
    ("3", "Al terminar: “🤖 Devolver al bot”", "Si se te olvida, el bot retoma solo a los 30 minutos de tu última respuesta."),
]
x = Inches(0.75)
for numero, tit, cuerpo in pasos:
    cj = caja(s, x, Inches(2.5), Inches(3.85), Inches(2.5), fill=WHITE, line=LINE)
    tf = cj.text_frame; tf.word_wrap = True
    tf.margin_left = Inches(0.2); tf.margin_right = Inches(0.18); tf.margin_top = Inches(0.16)
    p = tf.paragraphs[0]; r = p.add_run(); r.text = numero + "  ·  " + tit
    r.font.size = Pt(15); r.font.bold = True; r.font.color.rgb = TEALD; r.font.name = 'Segoe UI'
    p2 = tf.add_paragraph(); p2.space_before = Pt(8)
    r2 = p2.add_run(); r2.text = cuerpo
    r2.font.size = Pt(13); r2.font.color.rgb = INK; r2.font.name = 'Segoe UI'
    x += Inches(4.2)
nota(s, Inches(0.75), Inches(5.35), Inches(11.9),
     "Regla de WhatsApp (para todos, Claro incluido): solo se puede escribir libre si el cliente escribió hace menos de 24 horas. Si la ventana está cerrada, la caja te lo dice y no deja enviar.", "⏰")
nota(s, Inches(0.75), Inches(6.3), Inches(11.9),
     "Mientras un chat esté “contigo”, el bot NO le contesta a ese cliente. Si te llaman a una reunión, devuélveselo al bot — no lo dejes esperando.", "⚠️")
pie(s, 5)

# ── 6. SEGUIMIENTO ────────────────────────────────────────────────────────────
s = prs.slides.add_slide(BLANK); cabecera(s, "4", "Seguimiento de solicitudes", "…/monitor/seguimiento.php")
vinetas(s, Inches(0.75), Inches(1.45), Inches(11.9), Inches(4.3), [
    [("Períodos:  ", {'bold': True}), ("Hoy · Ayer · 7 días · 30 días · Histórico.   ", {}), ("Marcas:  ", {'bold': True}), ("Ambas / CyR (Ardisa) / Carpincentro.   ", {}), ("Asesor:  ", {'bold': True}), ("lista desplegable.", {})],
    [("📅 Fecha de entrada vs. fecha de reporte:  ", {'bold': True}), ("“entrada” = cuándo escribió el cliente; “reporte” = cuándo reportó el asesor. Para responder “¿qué reportaron ayer?”, usa REPORTE.", {})],
    [("Paginación:  ", {'bold': True}), ("50 filas por página; abajo dice “Mostrando X–Y de Z” con flechas ‹ › para pasar página.", {})],
    [("Exportar:  ", {'bold': True}), ("baja a Excel exactamente lo que el filtro esté mostrando.", {})],
    [("Estados:  ", {'bold': True}), ("🏆 Ganado · 📄 Cotización · 🔄 En gestión · Cerrado · Remitido · ❌ Perdido · ⏳ Pendiente (sin reporte del asesor).", {})],
], size=15.5)
pie(s, 6)

# ── 7. PANEL WHATSAPP ─────────────────────────────────────────────────────────
s = prs.slides.add_slide(BLANK); cabecera(s, "5", "Tu panel por WhatsApp", "el 573205662947 no es un cliente para el bot")
tabla(s, Inches(1.3), Inches(1.7), Inches(10.7), [
    ["Le escribes al bot", "Recibes"],
    ["informe", "El resumen del día: solicitudes, reparto por asesor, pendientes por reportar y alertas de los últimos 7 días."],
    ["demo", "Modo clienta: vives el flujo completo como un cliente real, sin tocar datos reales (para presentaciones)."],
    ["hola", "Vuelve al panel (sales del modo demo)."],
], [2.4, 8.3], alto_fila=0.85, size=14)
pie(s, 7)

# ── 8. ASESORES ───────────────────────────────────────────────────────────────
s = prs.slides.add_slide(BLANK); cabecera(s, "6", "Cómo reportan los asesores", "dos toques, cero Excel")
vinetas(s, Inches(0.75), Inches(1.45), Inches(11.9), Inches(2.6), [
    [("1 · La tarjeta.  ", {'bold': True}), ("Al asesor le llega el cliente completo: nombre, ciudad, perfil, pedido, fotos y el enlace directo al chat, con el botón “📊 Reportar resultado”.", {})],
    [("2 · El reporte.  ", {'bold': True}), ("Cuando atiende, toca el botón y elige: Ganado (con valor de venta), Cotización enviada, En gestión, Cerrado o Perdido.", {})],
    [("3 · El recordatorio.  ", {'bold': True}), ("Si no reporta, el bot le recuerda una vez al día hábil (agrupado, hasta 5 días). Los reportes llenan solos el seguimiento y el informe semanal.", {})],
], size=15.5)
nota(s, Inches(0.75), Inches(4.35), Inches(11.9),
     "LA REGLA DE ORO: un cliente con solicitud sin reportar que vuelve a escribir SIEMPRE regresa al mismo asesor — lo garantiza la base de datos, no la memoria del bot.", "📌")
nota(s, Inches(0.75), Inches(5.45), Inches(11.9),
     "Ventana de 24 h del asesor: para recibir tarjetas y fotos gratis, cada asesor debe escribirle al bot de vez en cuando. Si no lo hace, sus adjuntos se encolan y el vigilante te avisa (cola_adjuntos). Destrabe: que el asesor le mande cualquier mensaje al bot.", "📲")
pie(s, 8)

# ── 9. ALERTAS ────────────────────────────────────────────────────────────────
s = prs.slides.add_slide(BLANK); cabecera(s, "7", "Alertas del vigilante", "corre cada hora · graves por correo · todas en tu «informe»")
tabla(s, Inches(0.4), Inches(1.4), Inches(12.55), [
    ["Alerta", "Qué significa", "Qué haces tú"],
    ["cliente_perdido", "Alguien escribió con intención real y no quedó registrado.", "Ábrelo en el panel; si es venta, regístralo o pásaselo a un asesor."],
    ["carrera_consent", "El muro de autorización se repitió tras un “Sí, autorizo”. Severidad 3 = grave; severidad 2 = el freno funcionó y el cliente igual quedó registrado.", "Solo la severidad 3 exige revisar el chat."],
    ["reporte_perdido", "Un asesor recibió “¡Registrado!” pero su reporte no quedó en la base.", "Confírmalo en seguimiento y pide reenviar el reporte."],
    ["cola_adjuntos", "Fotos/audios llevan más de 6 h esperando a un asesor con la ventana cerrada.", "Que el asesor le escriba al bot: la cola sale sola en 2 min."],
    ["sin_reportar", "Un asesor acumula 5+ solicitudes sin reporte de más de 10 días.", "Conversación de gestión con ese asesor."],
    ["cron_caido / token_n8n / sesiones_inertes", "Una pieza técnica dejó de funcionar o está por vencer.", "Avisa a soporte técnico."],
], [2.35, 5.7, 4.5], alto_fila=0.78, size=12)
pie(s, 9)

# ── 10. CORREOS ───────────────────────────────────────────────────────────────
s = prs.slides.add_slide(BLANK); cabecera(s, "8", "Correos automáticos", "salen desde noreply@ardisa.com")
tabla(s, Inches(0.75), Inches(1.5), Inches(11.9), [
    ["Correo", "Cuándo", "A quién"],
    ["Reporte semanal Ardisa (Excel)", "Lunes 7:00 a.m.", "Nancy, Paola, María Camila (+ copia oculta a Deicy)"],
    ["Reporte semanal Carpincentro (Excel)", "Lunes 7:00 a.m.", "Paola, María Camila (+ copia oculta a Deicy)"],
    ["Alerta de leads duplicados", "Cuando aparecen", "Solo Deicy"],
    ["Alertas graves del vigilante", "Cuando aparecen", "Solo Deicy"],
], [4.6, 2.5, 4.8], alto_fila=0.6, size=13)
nota(s, Inches(0.75), Inches(5.0), Inches(11.9),
     "Si un lunes no llega el Excel: revisa spam primero; si no está, es alerta de cron_caido — avisa a soporte.", "📬")
pie(s, 10)

# ── 11. FASE 2 ────────────────────────────────────────────────────────────────
s = prs.slides.add_slide(BLANK); cabecera(s, "9", "Fase 2: la IA y SAP")
vinetas(s, Inches(0.75), Inches(1.5), Inches(11.9), Inches(4.2), [
    [("Ya en producción:  ", {'bold': True}), ("la IA entiende texto libre y fotos (identifica producto y línea) y solo pregunta lo que falta. Los filtros también son inteligentes: proveedores (español e inglés), reclamos → Servicio al Cliente, empleo → canal correcto.", {})],
    [("Cotización con SAP (piloto):  ", {'bold': True}), ("el bot podrá consultar inventario y disponibilidad directo en SAP. Arranca SIN precios (decisión del 11 de agosto) y solo para números de prueba, con el interruptor usar_cotiza — se prende sin tocar el bot.", {})],
    [("Falta solo una cosa:  ", {'bold': True}), ("el token de acceso del servidor SAP (lo entrega el equipo del MCP). Con eso se prende el piloto.", {})],
], size=15.5)
pie(s, 11)

# ── 12. SI ALGO FALLA ─────────────────────────────────────────────────────────
s = prs.slides.add_slide(BLANK); cabecera(s, "10", "Si algo falla", "primero lo simple; casi nunca es grave")
tabla(s, Inches(0.4), Inches(1.4), Inches(12.55), [
    ["Síntoma", "Primero revisa", "Si sigue"],
    ["El bot no responde a nadie", "¿El workflow está activo? n8n.ardisa.com → workflow del bot → interruptor “Active”.", "Avisa a soporte. Meta reintenta los mensajes: al volver, el bot los atiende."],
    ["El bot responde raro a UN cliente", "Ábrelo en el panel y toca “👩‍💼 Atender yo”: tú atiendes y el bot se calla.", "Reporta el caso con el pantallazo, como siempre."],
    ["El panel no abre", "¿Estás en la red de la oficina o la VPN?", "Soporte técnico."],
    ["Un asesor no recibe tarjetas", "Que el asesor le escriba cualquier cosa al bot (ventana de 24 h cerrada).", "Revisa la alerta cola_adjuntos."],
    ["No llegó el Excel del lunes", "Carpeta de spam.", "Alerta cron_caido + soporte."],
], [3.1, 5.0, 4.45], alto_fila=0.78, size=12.5)
nota(s, Inches(0.4), Inches(6.15), Inches(12.55),
     "Respaldo: todas las madrugadas (2:30 a.m.) se respalda la base completa y el bot; se guardan 14 días. Nada se pierde aunque el servidor falle.", "🛡️")
pie(s, 12)

# ── 13. CIERRE ────────────────────────────────────────────────────────────────
s = prs.slides.add_slide(BLANK); fondo(s, NAVY)
texto(s, Inches(0.55), Inches(2.6), Inches(12.2), Inches(1.2),
      [[("Un asesor que nunca duerme —", {'size': 34, 'bold': True, 'color': WHITE})],
       [("y un equipo que nunca pierde un cliente.", {'size': 34, 'bold': True, 'color': AMBER})]])
texto(s, Inches(0.55), Inches(4.6), Inches(12.2), Inches(0.9),
      [[("Manual de usuario v2 · Grupo Ardisa · agosto de 2026", {'size': 14, 'color': RGBColor(0xC9,0xDA,0xD5)})],
       [("El manual técnico (desarrolladores) es aparte: docs/RUNBOOK.md en el repositorio.", {'size': 12, 'color': RGBColor(0x8F,0xA8,0xA2)})]])

out = "/tmp/claude-1000/-home-ubuntu-whatsapp-ardisa/aa4cb282-80d9-4597-addc-8c8d448b7df8/scratchpad/Manual-Bot-WhatsApp-Ardisa-v2.pptx"
prs.save(out)
print("OK:", out)
