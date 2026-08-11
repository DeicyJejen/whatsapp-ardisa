<?php
// media.php — Proxy con CACHÉ de adjuntos de WhatsApp (imágenes/audio/video/documentos) para el monitor.
// VPN-only (ufw). Descarga el medio de la Graph API con el token (server-side, nunca sale al navegador) y lo cachea en disco.
// Uso: media.php?id=<media_id>   (el id viene de la etiqueta ⟦m:id:tipo⟧ que el bot guarda en mensajes.entrada)

$id = isset($_GET['id']) ? $_GET['id'] : '';
if (!preg_match('/^[0-9]{8,32}$/', $id)) { http_response_code(400); die('id inválido'); }

$cacheDir = __DIR__ . '/cache';
// ¿ya está en caché? (se guarda como <id>.<bin> + <id>.mime)
$binF = "$cacheDir/$id.bin"; $mimeF = "$cacheDir/$id.mime";
if (is_file($binF) && is_file($mimeF)) {
  $mime = trim(file_get_contents($mimeF)) ?: 'application/octet-stream';
  header('Content-Type: ' . $mime);
  header('Cache-Control: private, max-age=86400');
  header('Content-Length: ' . filesize($binF));
  readfile($binF); exit;
}

$token = @trim(@file_get_contents('/etc/monitor-ardisa.wpp'));
if (!$token) { http_response_code(500); die('sin token'); }

function curlGet($url, $token, $binary = false) {
  // Sin php-curl en este server: usamos streams nativos (https + header Authorization)
  $ctx = stream_context_create(['http' => [
    'method' => 'GET',
    'header' => "Authorization: Bearer $token\r\nUser-Agent: monitor-ardisa/1.0\r\n",
    'timeout' => 25,
    'follow_location' => 1,
    'ignore_errors' => true,   // para leer el cuerpo aunque sea 4xx
  ]]);
  $out = @file_get_contents($url, false, $ctx);
  $code = 0;
  if (isset($http_response_header)) {
    foreach ($http_response_header as $h) {
      if (preg_match('#^HTTP/\S+\s+(\d{3})#', $h, $m)) $code = (int)$m[1];   // el último status (tras redirects)
    }
  }
  if ($out !== false && strlen($out) > 26214400) { $out = false; $code = 0; }   // tope 25 MB
  return [$code, $out];
}

// 1) pedir la URL temporal del medio
list($code, $meta) = curlGet("https://graph.facebook.com/v21.0/$id", $token);
$j = json_decode($meta, true);
if ($code !== 200 || empty($j['url'])) {
  // medio vencido (Meta los guarda ~30 días) o id inexistente -> imagen-placeholder SVG
  header('Content-Type: image/svg+xml'); http_response_code(200);
  echo '<svg xmlns="http://www.w3.org/2000/svg" width="260" height="140"><rect width="100%" height="100%" fill="#e8eceb" rx="10"/><text x="50%" y="45%" font-family="Segoe UI,sans-serif" font-size="30" text-anchor="middle">🖼️</text><text x="50%" y="72%" font-family="Segoe UI,sans-serif" font-size="12" fill="#667781" text-anchor="middle">Adjunto no disponible (venció en WhatsApp)</text></svg>';
  exit;
}
$mime = isset($j['mime_type']) ? $j['mime_type'] : 'application/octet-stream';

// 2) descargar el binario (la URL exige el mismo token)
list($code2, $bin) = curlGet($j['url'], $token, true);
if ($code2 !== 200 || $bin === false || $bin === '') { http_response_code(502); die('descarga falló'); }

// 3) cachear y servir
@file_put_contents($binF, $bin);
@file_put_contents($mimeF, $mime);
header('Content-Type: ' . $mime);
header('Cache-Control: private, max-age=86400');
header('Content-Length: ' . strlen($bin));
echo $bin;
