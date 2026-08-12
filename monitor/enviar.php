<?php
// CHAT HÍBRIDO del monitor (2026-08-12, pedido Deicy tras ver el "chat híbrido" de Wizard Bot/Claro).
// Acciones del panel sobre una conversación (el panel ya está protegido por red: MikroTik/VPN):
//   enviar   -> manda el texto al cliente por el MISMO número del bot. NO toca el token: llama al
//               webhook local del workflow "Panel Ardisa - Enviar", que usa la credencial CIFRADA de n8n,
//               guarda el mensaje en `mensajes` (etapa 'panel') y marca la conversación como humana 30 min.
//   tomar    -> marca "atendida por humano" SIN enviar nada (el bot se calla desde ya).
//   devolver -> borra la marca: el bot vuelve a atender normal.
// Respuesta SIEMPRE JSON: {ok:true|false, err?:string}.
header('Content-Type: application/json; charset=utf-8');

function out($arr){ echo json_encode($arr, JSON_UNESCAPED_UNICODE); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(['ok'=>false, 'err'=>'Método no permitido']);

$acc = $_POST['acc'] ?? '';
$wa  = preg_replace('/[^0-9]/', '', $_POST['wa'] ?? '');
if ($wa === '' || strlen($wa) < 10 || strlen($wa) > 15) out(['ok'=>false, 'err'=>'Número inválido']);

$dbpass = @trim(@file_get_contents('/etc/monitor-ardisa.pass'));
$c = @new mysqli('127.0.0.1', 'monitor_ro', $dbpass, 'bot_ardisa');
if ($c->connect_errno) out(['ok'=>false, 'err'=>'Sin conexión a la base de datos']);
$c->set_charset('utf8mb4');

if ($acc === 'tomar') {
  $st = $c->prepare("INSERT INTO humano (telefono, hasta, quien) VALUES (?, NOW() + INTERVAL 30 MINUTE, 'panel')
                     ON DUPLICATE KEY UPDATE hasta = VALUES(hasta), quien = VALUES(quien)");
  $st->bind_param('s', $wa); $st->execute();
  out(['ok'=>true]);
}
if ($acc === 'devolver') {
  $st = $c->prepare("DELETE FROM humano WHERE telefono = ?");
  $st->bind_param('s', $wa); $st->execute();
  out(['ok'=>true]);
}
if ($acc === 'enviar') {
  $text = trim((string)($_POST['text'] ?? ''));
  if ($text === '') out(['ok'=>false, 'err'=>'Escribe el mensaje']);
  if (mb_strlen($text, 'UTF-8') > 3500) out(['ok'=>false, 'err'=>'Máximo 3500 caracteres']);

  // Ventana de 24h de WhatsApp: solo se puede escribir libre si el CLIENTE escribió hace <24h (regla de Meta).
  $st = $c->prepare("SELECT MAX(creado_en) FROM mensajes WHERE wa_id=? AND entrada<>'' AND entrada NOT LIKE '(%'");
  $st->bind_param('s', $wa); $st->execute(); $st->bind_result($ult); $st->fetch(); $st->close();
  if (!$ult || strtotime($ult) < time() - 24*3600) out(['ok'=>false, 'err'=>'Ventana de 24h cerrada: el cliente debe escribir primero (regla de WhatsApp)']);

  $secret = @trim(@file_get_contents('/etc/monitor-ardisa.secret'));
  if ($secret === '') out(['ok'=>false, 'err'=>'Falta el secreto del panel en el servidor']);

  $ch = curl_init('http://127.0.0.1:5678/webhook/panel-enviar-ardisa');
  curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_POSTFIELDS => json_encode(['secret'=>$secret, 'to'=>$wa, 'text'=>$text], JSON_UNESCAPED_UNICODE),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 20,
  ]);
  $res = curl_exec($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  $j = @json_decode((string)$res, true);
  if ($code === 200 && !empty($j['ok'])) out(['ok'=>true]);
  out(['ok'=>false, 'err'=>'No se pudo enviar (HTTP '.$code.'). Intenta de nuevo.']);
}
out(['ok'=>false, 'err'=>'Acción desconocida']);
