<?php
// Monitor de conversaciones — Bot WhatsApp Grupo Ardisa (solo lectura, VPN-only)
// 2026-08-12 (auditoría de robustez): PHP corría en UTC y la BD guarda hora Colombia -> el contador
// "en curso" comparaba relojes distintos (5h) y siempre daba 0. La zona se fija una vez, para todo el panel.
date_default_timezone_set('America/Bogota');
// Defensa CSRF (auditoría): el panel está tras el firewall del MikroTik, pero eso NO frena a un navegador
// de la oficina engañado por otra web. Cualquier POST (ocultar/restaurar) debe venir del propio panel.
$_ORIG = $_SERVER['HTTP_ORIGIN'] ?? $_SERVER['HTTP_REFERER'] ?? '';
$_CSRF_OK = ($_SERVER['REQUEST_METHOD'] !== 'POST') || (strpos($_ORIG, $_SERVER['HTTP_HOST'] ?? 'x') !== false);
$dbpass = @trim(@file_get_contents('/etc/monitor-ardisa.pass'));
$c = @new mysqli('127.0.0.1', 'monitor_ro', $dbpass, 'bot_ardisa');
if ($c->connect_errno) { http_response_code(500); die('Sin conexión a la base de datos.'); }
$c->set_charset('utf8mb4');

// Ocultar/restaurar conversación (pedido Deicy 2026-07-24): como "eliminar chat" en WhatsApp pero SIN borrar nada —
// los mensajes y los reportes de los leads quedan intactos; el chat solo sale de la lista y se puede restaurar.
if ($_SERVER['REQUEST_METHOD']==='POST' && !$_CSRF_OK) { http_response_code(403); exit('Origen no permitido'); }
if ($_SERVER['REQUEST_METHOD']==='POST' && isset($_POST['acc'], $_POST['wa'])) {
  $w = preg_replace('/[^0-9A-Za-z.]/','',$_POST['wa']);
  if ($w!=='') {
    if ($_POST['acc']==='ocultar')  { $st=$c->prepare("INSERT IGNORE INTO chats_ocultos (wa_id) VALUES (?)"); $st->bind_param('s',$w); $st->execute(); }
    if ($_POST['acc']==='restaurar'){ $st=$c->prepare("DELETE FROM chats_ocultos WHERE wa_id=?"); $st->bind_param('s',$w); $st->execute(); }
  }
  $qs='d='.(isset($_GET['d'])?preg_replace('/[^a-z]/','',$_GET['d']):'hoy').'&v='.((isset($_GET['v'])&&$_GET['v']==='ase')?'ase':'cli');
  if ($_POST['acc']==='restaurar' && isset($_GET['oc'])) $qs.='&oc=1';
  header('Location: ?'.$qs); exit;
}

function h($s){ return htmlspecialchars($s ?? '', ENT_QUOTES, 'UTF-8'); }
// 14-ago: clientes con número OCULTO de WhatsApp (BSUID tipo CO.123...) — no es un teléfono, no se pinta con '+'
function telDisp($w){ return preg_match('/^[A-Z]{2}\./', $w ?? '') ? '🔒 número privado' : ('+'.$w); }
// Renderiza el formato de WhatsApp: *negrita*, _cursiva_, ~tachado~, ```mono```, enlaces y saltos de línea
function nl($s){
  $s = htmlspecialchars($s ?? '', ENT_QUOTES, 'UTF-8');
  $s = preg_replace('/```([^`]+)```/u', '<code>$1</code>', $s);
  $s = preg_replace('/\*([^*\n]+)\*/u', '<b>$1</b>', $s);
  $s = preg_replace('/(^|[\s(¡¿])_([^_\n]+)_/u', '$1<i>$2</i>', $s);
  $s = preg_replace('/~([^~\n]+)~/u', '<s>$1</s>', $s);
  $s = preg_replace('#(https?://[^\s<]+)#u', '<a href="$1" target="_blank" rel="noopener">$1</a>', $s);
  return nl2br($s);
}
// Adjuntos: separa las etiquetas ⟦m:id:tipo⟧ (que guarda el bot) del texto y las vuelve HTML (imagen/video/audio/documento via media.php)
function mediaHtml(&$txt){
  $html='';
  if(preg_match_all('/\x{27E6}m:([0-9]{8,32}):([a-z]*)\x{27E7}/u', $txt, $mm, PREG_SET_ORDER)){
    foreach($mm as $t){
      $u='media.php?id='.$t[1];
      switch($t[2]){
        case 'image': case 'sticker': $html.='<a href="'.$u.'" target="_blank"><img class="mimg" src="'.$u.'" loading="lazy" alt="imagen del cliente"></a>'; break;
        case 'video': $html.='<video class="mimg" src="'.$u.'" controls preload="metadata"></video>'; break;
        case 'audio': $html.='<audio src="'.$u.'" controls preload="none" style="max-width:230px"></audio>'; break;
        default: $html.='<a class="mdoc" href="'.$u.'" target="_blank">📄 Ver documento adjunto</a>';
      }
    }
    $txt=trim(preg_replace('/\x{27E6}m:[0-9]{8,32}:[a-z]*\x{27E7}/u','',$txt));
  }
  return $html;
}
function ini_($n){ $n=trim($n); if($n==='') return '👤'; $p=preg_split('/\s+/',$n); $a=mb_substr($p[0],0,1,'UTF-8'); $b=isset($p[1])?mb_substr($p[1],0,1,'UTF-8'):''; return mb_strtoupper($a.$b,'UTF-8'); }
// Color de avatar ESTABLE por número (estilo WhatsApp): mismo contacto = mismo color siempre.
// Paleta CURADA (2026-07-24, Deicy: los hsl al azar salían feos) — 8 tonos que combinan con el teal/navy del monitor.
function avc($wa){
  $PAL = ['#0E8F88','#2F9E77','#4E7AC7','#6F6BC0','#985CB0','#C0587E','#C77B4B','#5B9EA6'];
  return $PAL[ abs(crc32((string)$wa)) % count($PAL) ];
}
function hora($t){ return date('g:i a', strtotime($t)); }
function dia($t){ $d=date('Y-m-d',strtotime($t)); $hoy=date('Y-m-d'); if($d===$hoy) return 'Hoy'; if($d===date('Y-m-d',strtotime('-1 day'))) return 'Ayer'; return date('d/m/Y',strtotime($t)); }

$explicit = isset($_GET['wa']);
// 14-ago: los clientes con número oculto tienen id tipo "CO.1352..." — el filtro solo-dígitos les
// mutilaba el id (quedaba 1352... sin letras), la consulta no encontraba nada y el chat salía
// "Sin mensajes" con un teléfono falso en el encabezado (pantallazo Deicy 11:02)
$sel = $explicit ? preg_replace('/[^0-9A-Za-z.]/','',$_GET['wa']) : '';

// Filtro por día (por defecto HOY, para no mezclar ayer y hoy)
$dayf = isset($_GET['d']) ? $_GET['d'] : 'hoy';
if(!in_array($dayf,['hoy','ayer','todos'],true)) $dayf='hoy';
$fwhere = $dayf==='hoy'  ? "WHERE DATE(creado_en)=CURDATE()"
        : ($dayf==='ayer' ? "WHERE DATE(creado_en)=(CURDATE() - INTERVAL 1 DAY)" : "");

// Vista CLIENTES (default) vs ASESORES (reportes/recordatorios) — pedido Deicy 2026-07-22: que los chats donde los
// asesores reportan NO se mezclen con los de clientes. Los números de asesores se detectan solos: (a) asesor_tel de
// los leads, (b) números con etapas de asesor (asesor_activo / seg_* / media_diferida), (c) Deicy (monitoreo).
$vista = (isset($_GET['v']) && $_GET['v']==='ase') ? 'ase' : 'cli';
$ASE = ['573205662947' => 'Deicy (monitoreo)'];
if ($r = $c->query("SELECT DISTINCT asesor_tel, asesor FROM leads WHERE asesor_tel<>''")) {
  while ($a = $r->fetch_assoc()) { if (empty($ASE[$a['asesor_tel']])) $ASE[$a['asesor_tel']] = $a['asesor']; }
}
if ($r = $c->query("SELECT DISTINCT wa_id FROM mensajes WHERE etapa IN ('asesor_activo','media_diferida','rescate_varado') OR etapa LIKE 'seg\\_%'")) {
  while ($a = $r->fetch_assoc()) { if (!isset($ASE[$a['wa_id']])) $ASE[$a['wa_id']] = ''; }
}
$aseNums = array_filter(array_map(function($x){ return preg_replace('/[^0-9]/','',$x); }, array_keys($ASE)));
$aseIn = "'".implode("','", $aseNums)."'";
$vcond = "wa_id ".($vista==='ase' ? 'IN' : 'NOT IN')." ($aseIn)";
$fwhere = $fwhere==='' ? "WHERE $vcond" : "$fwhere AND $vcond";
$ocultos=[]; if($r=@$c->query("SELECT wa_id FROM chats_ocultos")){ while($x=$r->fetch_assoc()) $ocultos[$x['wa_id']]=1; }
// CHAT HÍBRIDO (2026-08-12): conversaciones que un humano está atendiendo desde el panel (el bot callado).
// DECISIÓN DEICY 12-ago: "por ahora no" — la función queda instalada pero APAGADA de la interfaz.
// Para prenderla el día que se decida: cambiar $HIBRIDO a true (todo lo demás ya está listo y probado).
$HIBRIDO = false;
$humanos=[]; if($r=@$c->query("SELECT telefono FROM humano WHERE hasta>NOW()")){ while($x=$r->fetch_assoc()) $humanos[$x['telefono']]=1; }
$verOc = isset($_GET['oc']) && $_GET['oc']==='1';
$qd = '&d='.$dayf.'&v='.$vista.($verOc?'&oc=1':'');

// lista de conversaciones (última actividad primero)
$convs = [];
$q = "SELECT wa_id, MAX(creado_en) ult, SUBSTRING_INDEX(GROUP_CONCAT(NULLIF(nombre,'') ORDER BY creado_en DESC SEPARATOR 0x1f),0x1f,1) nombre,
       SUBSTRING_INDEX(GROUP_CONCAT(COALESCE(NULLIF(entrada,''),salida) ORDER BY creado_en DESC SEPARATOR 0x1f),0x1f,1) ultmsg,
       COUNT(*) n
       FROM mensajes $fwhere GROUP BY wa_id ORDER BY ult DESC LIMIT 200";
if ($r = $c->query($q)) { while ($row = $r->fetch_assoc()) $convs[] = $row; }

$convs = array_values(array_filter($convs, function($cv) use($ocultos,$verOc){ $h=isset($ocultos[$cv['wa_id']]); return $verOc ? $h : !$h; }));

// en escritorio auto-seleccionamos la primera (para no ver el panel vacío)
if ($sel==='' && count($convs)) $sel = $convs[0]['wa_id'];

$msgs = []; $selNombre = '';
if ($sel !== '') {
  $st = $c->prepare("SELECT creado_en,nombre,entrada,salida,etapa FROM mensajes WHERE wa_id=? ORDER BY creado_en ASC, id ASC LIMIT 500");
  $st->bind_param('s', $sel); $st->execute(); $res = $st->get_result();
  while ($m = $res->fetch_assoc()) { $msgs[] = $m; if ($m['nombre']) $selNombre = $m['nombre']; }
}
$total = 0; $enCurso = 0;
foreach ($convs as $cv) { $total += (int)$cv['n']; if (strtotime($cv['ult']) >= time()-1800) $enCurso++; }
// ¿Puedo escribirle al chat abierto? Ventana de 24h de WhatsApp: el CLIENTE debe haber escrito hace <24h.
$selHumano = ($sel!=='' && isset($humanos[$sel]));
$ventanaOk = false;
if ($sel!=='' && $vista==='cli') {
  $st=$c->prepare("SELECT MAX(creado_en) FROM mensajes WHERE wa_id=? AND entrada<>'' AND entrada NOT LIKE '(%'");
  $st->bind_param('s',$sel); $st->execute(); $st->bind_result($uMsg); $st->fetch(); $st->close();
  $ventanaOk = $uMsg && strtotime($uMsg) >= time()-24*3600;
}
$refreshUrl = $explicit ? ('?wa='.h($sel).$qd) : ('?d='.$dayf.'&v='.$vista);
?><!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Monitor · Bot Grupo Ardisa</title>
<style>
  :root{--teal:#0E8F88;--teal-d:#0B6C68;--navy:#0E2A3B;--paper:#EAE6DF;--panel:#fff;--line:#E4E7E7;--ink:#111B21;--soft:#667781;--in:#fff;--out:#D6F5CC;--sel:#E7F3F1}
  *{box-sizing:border-box}
  html,body{height:100%}
  body{margin:0;font-family:"Segoe UI",system-ui,-apple-system,Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:var(--navy)}
  .app{display:flex;height:100vh;max-width:1200px;margin:0 auto;background:var(--panel);overflow:hidden}
  .side{width:340px;border-right:1px solid var(--line);display:flex;flex-direction:column;min-width:0}
  .side .hd{background:var(--teal);color:#fff;padding:13px 16px;font-weight:700;flex:0 0 auto}
  .side .hd small{display:block;font-weight:400;opacity:.9;font-size:.75rem;margin-top:2px}
  .list{overflow-y:auto;flex:1;-webkit-overflow-scrolling:touch}
  .conv{display:flex;gap:12px;padding:12px 14px;border-bottom:1px solid var(--line);text-decoration:none;color:inherit;align-items:center}
  .conv:active,.conv:hover{background:var(--sel)} .conv.on{background:var(--sel)}
  .av{width:46px;height:46px;border-radius:50%;background:var(--teal);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;flex:0 0 auto;font-size:.92rem}
  .cv-b{min-width:0;flex:1}
  .cv-n{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .cv-m{color:var(--soft);font-size:.84rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .cv-t{font-size:.7rem;color:var(--soft);flex:0 0 auto;align-self:flex-start}
  .chat{flex:1;display:flex;flex-direction:column;min-width:0;background:var(--paper);
    background-image:radial-gradient(rgba(14,42,59,.045) 1px,transparent 1px);background-size:22px 22px}
  .chat .hd{background:var(--teal-d);color:#fff;padding:11px 16px;display:flex;align-items:center;gap:12px;flex:0 0 auto}
  .chat .hd .av{background:rgba(255,255,255,.22)}
  .back{display:none;color:#fff;text-decoration:none;font-size:1.5rem;line-height:1;padding:2px 6px 2px 0;flex:0 0 auto}
  .msgs{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:18px 7% 26px;display:flex;flex-direction:column}
  .row{display:flex;margin:3px 0}
  .row.in{justify-content:flex-start}.row.out{justify-content:flex-end}
  .bub{max-width:80%;padding:7px 10px 5px;border-radius:9px;box-shadow:0 1px .5px rgba(0,0,0,.13);font-size:.93rem;line-height:1.4;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere}
  .in .bub{background:var(--in);border-top-left-radius:2px}
  .out .bub{background:var(--out);border-top-right-radius:2px}
  .bub .tm{display:block;text-align:right;font-size:.66rem;color:var(--soft);margin-top:2px}
  .who{font-size:.66rem;text-transform:uppercase;letter-spacing:.04em;color:var(--teal-d);margin-bottom:2px;font-weight:700}
  .mimg{max-width:230px;max-height:260px;border-radius:8px;display:block;margin:3px 0;cursor:zoom-in}
  .mdoc{display:inline-block;background:#F0F2F2;padding:8px 12px;border-radius:8px;text-decoration:none;color:var(--teal-d);font-weight:600;margin:3px 0}
  .daysep{text-align:center;margin:12px 0}
  .daysep span{background:#E1F2EF;color:var(--teal-d);font-size:.72rem;padding:4px 12px;border-radius:8px;font-weight:600;box-shadow:0 1px .5px rgba(0,0,0,.1)}
  .empty{margin:auto;color:var(--soft);text-align:center;padding:40px}
  /* chat híbrido */
  .out .bub.pan{background:#CDEBF7;border-top-right-radius:2px}
  .bub.pan .who{color:#0B5D74}
  .composer{flex:0 0 auto;display:flex;gap:8px;align-items:flex-end;padding:10px 12px;background:#F0F2F5;border-top:1px solid var(--line)}
  .composer textarea{flex:1;border:1px solid var(--line);border-radius:10px;padding:10px 13px;font:inherit;font-size:.93rem;resize:none;max-height:120px;outline:none;background:#fff}
  .composer textarea:focus{border-color:var(--teal)}
  .composer button{width:44px;height:42px;border:0;border-radius:50%;background:var(--teal);color:#fff;font-size:1.15rem;cursor:pointer;flex:0 0 auto}
  .composer button:disabled{opacity:.5;cursor:wait}
  .composer .cerrada{flex:1;color:var(--soft);font-size:.84rem;text-align:center;padding:6px}
  .tabs{display:flex;gap:6px;margin-top:9px}
  .tab{flex:1;text-align:center;text-decoration:none;color:#fff;background:rgba(255,255,255,.16);
    padding:5px 0;border-radius:7px;font-size:.78rem;font-weight:600}
  .tab.on{background:#fff;color:var(--teal-d)}
  /* móvil: una sola vista + botón volver */
  @media (max-width:760px){
    .app{max-width:100%}
    .side{width:100%}
    .back{display:block}
    body.chatview .side{display:none}
    body.listview .chat{display:none}
  }
</style>
</head><body class="<?php echo $explicit?'chatview':'listview'; ?>">
<div class="app">
  <div class="side">
    <div class="hd">💬 Conversaciones <small><?php echo count($convs); ?> chats · 🟢 <?php echo $enCurso; ?> en curso<?php if($HIBRIDO && count($humanos)): ?> · 👩‍💼 <?php echo count($humanos); ?> contigo<?php endif; ?> · <?php echo $total; ?> mensajes</small>
      <a href="seguimiento.php" style="display:block;margin-top:8px;text-align:center;background:#fff;color:var(--teal-d);text-decoration:none;padding:7px;border-radius:7px;font-weight:700;font-size:.82rem">📊 Ver seguimiento de solicitudes</a>
      <div class="tabs">
        <a class="tab <?php echo $vista==='cli'?'on':''; ?>" href="?d=<?php echo $dayf; ?>&v=cli">👥 Clientes</a>
        <a class="tab <?php echo $vista==='ase'?'on':''; ?>" href="?d=<?php echo $dayf; ?>&v=ase">🧑‍💼 Asesores</a>
      </div>
      <div class="tabs">
        <?php foreach(['hoy'=>'Hoy','ayer'=>'Ayer','todos'=>'Todos'] as $k=>$lbl): ?>
          <a class="tab <?php echo $dayf===$k?'on':''; ?>" href="?d=<?php echo $k; ?>&v=<?php echo $vista; ?><?php echo $verOc?'&oc=1':''; ?>"><?php echo $lbl; ?></a>
        <?php endforeach; ?>
      </div>
      <?php if($verOc): ?>
        <a class="tab on" style="display:block;margin-top:6px" href="?d=<?php echo $dayf; ?>&v=<?php echo $vista; ?>">← Volver a los chats</a>
      <?php elseif(count($ocultos)): ?>
        <a class="tab" style="display:block;margin-top:6px" href="?d=<?php echo $dayf; ?>&v=<?php echo $vista; ?>&oc=1">🗂️ Ver ocultos (<?php echo count($ocultos); ?>)</a>
      <?php endif; ?>
    </div>
    <div class="list">
      <?php if(!$convs): ?><div class="empty"><?php echo $vista==='ase' ? 'Aún no hay chats de asesores en este período.<br>Aquí aparecen sus reportes y recordatorios.' : 'Aún no hay conversaciones.<br>Escríbele al bot para verlas aquí.'; ?></div><?php endif; ?>
      <?php foreach($convs as $cv): $on = $cv['wa_id']===$sel;
        $nmL = (!empty($ASE[$cv['wa_id']])) ? $ASE[$cv['wa_id']] : ($cv['nombre'] ?: telDisp($cv['wa_id']));
        if($vista==='ase') $nmL = '🧑‍💼 '.$nmL;
        if(isset($humanos[$cv['wa_id']])) $nmL = '👩‍💼 '.$nmL; ?>
        <a class="conv <?php echo $on?'on':''; ?>" href="?wa=<?php echo h($cv['wa_id']); ?><?php echo $qd; ?>">
          <div class="av" style="background:<?php echo avc($cv['wa_id']); ?>"><?php echo h(ini_((!empty($ASE[$cv['wa_id']]) ? $ASE[$cv['wa_id']] : $cv['nombre']) ?: $cv['wa_id'])); ?></div>
          <div class="cv-b">
            <div class="cv-n"><?php echo h($nmL); ?></div>
            <div class="cv-m"><?php echo h(mb_substr(preg_replace('/\x{27E6}m:[^\x{27E7}]*\x{27E7}/u','📷',$cv['ultmsg'] ?? ''),0,44,'UTF-8')); ?></div>
          </div>
          <div class="cv-t"><?php echo h(dia($cv['ult'])); ?><br><?php echo hora($cv['ult']); ?></div>
        </a>
      <?php endforeach; ?>
    </div>
  </div>

  <div class="chat">
    <?php if($sel!==''): ?>
    <div class="hd">
      <?php $selShow = (!empty($ASE[$sel])) ? $ASE[$sel] : ($selNombre ?: telDisp($sel)); ?>
      <a class="back" href="?d=<?php echo $dayf; ?>&v=<?php echo $vista; ?>" title="Volver a los chats">←</a>
      <div class="av" style="background:<?php echo avc($sel); ?>"><?php echo h(ini_($selShow)); ?></div>
      <div><div style="font-weight:700"><?php echo isset($ASE[$sel])?'🧑‍💼 ':''; echo h($selShow); ?></div>
      <div style="font-size:.74rem;opacity:.85"><?php echo h(telDisp($sel)); ?><?php echo isset($ASE[$sel])?' · asesor':''; ?></div></div>
      <?php if($HIBRIDO && $vista==='cli' && !isset($ASE[$sel])): ?>
        <?php if($selHumano): ?>
          <span style="background:#FFD54F;color:#5b4300;border-radius:7px;padding:6px 10px;font-weight:700;font-size:.78rem;margin-left:auto">👩‍💼 Atendiéndola tú — bot en pausa</span>
          <button type="button" onclick="accion('devolver')" style="background:rgba(255,255,255,.18);color:#fff;border:0;border-radius:7px;padding:7px 11px;font-weight:600;cursor:pointer;font-size:.8rem">🤖 Devolver al bot</button>
        <?php else: ?>
          <button type="button" onclick="accion('tomar')" style="background:rgba(255,255,255,.18);color:#fff;border:0;border-radius:7px;padding:7px 11px;font-weight:600;cursor:pointer;font-size:.8rem;margin-left:auto">👩‍💼 Atender yo</button>
        <?php endif; ?>
      <?php endif; ?>
      <?php $selOculto = isset($ocultos[$sel]); ?>
      <form method="post" action="?wa=<?php echo h($sel); ?><?php echo $qd; ?>" style="<?php echo ($HIBRIDO && $vista==='cli' && !isset($ASE[$sel]))?'':'margin-left:auto'; ?>"
            onsubmit="return confirm('<?php echo $selOculto ? '¿Restaurar este chat a la lista?' : '¿Ocultar este chat de la lista? No se borra nada: los mensajes y reportes quedan guardados y puedes restaurarlo desde 🗂️ Ocultos.'; ?>');">
        <input type="hidden" name="wa" value="<?php echo h($sel); ?>">
        <input type="hidden" name="acc" value="<?php echo $selOculto?'restaurar':'ocultar'; ?>">
        <button type="submit" style="background:rgba(255,255,255,.18);color:#fff;border:0;border-radius:7px;padding:7px 11px;font-weight:600;cursor:pointer;font-size:.8rem"><?php echo $selOculto?'♻️ Restaurar':'🗑️ Ocultar'; ?></button>
      </form>
    </div>
    <div class="msgs">
      <?php $lastDay=''; foreach($msgs as $m):
        $d = dia($m['creado_en']); if($d!==$lastDay){ echo '<div class="daysep"><span>'.h($d).'</span></div>'; $lastDay=$d; }
        $entTxt=$m['entrada']; $mh=mediaHtml($entTxt);
        // Marcas internas del bot tipo "(seguimiento asesor)"/"(inactividad)" NO son mensajes de la persona: no
        // pintarlas como burbuja entrante (solo se muestra la salida del bot).
        $esSistema = ($mh==='') && preg_match('/^\(.+\)$/u', trim($entTxt));
        if(!$esSistema && (trim($entTxt)!=='' || $mh!=='')): ?>
          <div class="row in"><div class="bub"><?php echo $mh; if(trim($entTxt)!=='') echo nl($entTxt); ?><span class="tm"><?php echo hora($m['creado_en']); ?></span></div></div>
        <?php endif; if(trim($m['salida'])!==''): $esPanel = ($m['etapa']==='panel'); ?>
          <div class="row out"><div class="bub<?php echo $esPanel?' pan':''; ?>"><div class="who"><?php echo $esPanel?'👩‍💼 Ardisa (panel)':'🤖 Bot'; ?></div><?php echo nl($m['salida']); ?><span class="tm"><?php echo hora($m['creado_en']); ?></span></div></div>
        <?php endif; endforeach; ?>
      <?php if(!$msgs): ?><div class="empty">Sin mensajes.</div><?php endif; ?>
    </div>
    <?php if($HIBRIDO && $vista==='cli' && !isset($ASE[$sel])): ?>
    <div class="composer">
      <?php if($ventanaOk): ?>
        <textarea id="cmp" rows="1" maxlength="3500" placeholder="Escribe una respuesta al cliente… (Enter envía, Shift+Enter salto)"></textarea>
        <button id="cmpbtn" type="button" onclick="enviar()">➤</button>
      <?php else: ?>
        <div class="cerrada">🔒 Ventana de 24 h cerrada: WhatsApp solo permite responder si el cliente escribió hace menos de 24 horas.</div>
      <?php endif; ?>
    </div>
    <?php endif; ?>
    <?php else: ?>
      <div class="empty">Selecciona una conversación 👈</div>
    <?php endif; ?>
  </div>
</div>
<script>
  // baja el scroll al último mensaje al abrir
  var m=document.querySelector('.msgs'); if(m){ m.scrollTop=m.scrollHeight; }
  var WA = <?php echo json_encode($sel); ?>;
  var cmp = document.getElementById('cmp'), cmpbtn = document.getElementById('cmpbtn');
  function post(datos, cb){
    var fd = new FormData(); for (var k in datos) fd.append(k, datos[k]);
    fetch('enviar.php', {method:'POST', body:fd}).then(function(r){ return r.json(); })
      .then(cb).catch(function(){ cb({ok:false, err:'Sin conexión con el servidor'}); });
  }
  function accion(acc){
    if (acc==='devolver' && !confirm('¿Devolverle la conversación al bot?')) return;
    post({acc:acc, wa:WA}, function(j){ if(j.ok) location.reload(); else alert(j.err||'No se pudo'); });
  }
  function enviar(){
    if (!cmp || !cmp.value.trim()) return;
    cmpbtn.disabled = true;
    post({acc:'enviar', wa:WA, text:cmp.value.trim()}, function(j){
      cmpbtn.disabled = false;
      if (j.ok) { cmp.value=''; location.reload(); }
      else alert(j.err || 'No se pudo enviar');
    });
  }
  if (cmp) cmp.addEventListener('keydown', function(e){
    if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
  });
  // Recarga sola cada 15s… pero NUNCA mientras escribes (el meta-refresh viejo borraba el borrador).
  setInterval(function(){
    var escribiendo = cmp && (cmp.value.trim() !== '' || document.activeElement === cmp);
    if (!escribiendo) location.reload();
  }, 15000);
</script>
</body></html>
