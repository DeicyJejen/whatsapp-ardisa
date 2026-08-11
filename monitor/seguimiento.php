<?php
// Seguimiento de leads — Bot WhatsApp Grupo Ardisa (solo lectura, VPN-only)
$dbpass = @trim(@file_get_contents('/etc/monitor-ardisa.pass'));
$c = @new mysqli('127.0.0.1', 'monitor_ro', $dbpass, 'bot_ardisa');
if ($c->connect_errno) { http_response_code(500); die('Sin conexión a la base de datos.'); }
$c->set_charset('utf8mb4');
function h($s){ return htmlspecialchars($s ?? '', ENT_QUOTES, 'UTF-8'); }

// ===== Generador de .xlsx REAL con estilo (sin librerías, usa ZipArchive) =====
function xcol($n){ $s=''; while($n>0){ $m=($n-1)%26; $s=chr(65+$m).$s; $n=intdiv($n-1,26);} return $s; }
function xesc($s){ return htmlspecialchars((string)($s ?? ''), ENT_QUOTES|ENT_XML1, 'UTF-8'); }
function estado_sty($e){ $l=mb_strtolower((string)$e);
  if($l===''||$l==='pendiente') return 9;
  if(strpos($l,'ganado')!==false) return 6;
  if(strpos($l,'perdido')!==false) return 7;
  if(strpos($l,'cotización')!==false||strpos($l,'gestión')!==false) return 8;
  return 10; }
// Quita emojis/pictogramas para el Excel (en Excel de escritorio salen en blanco y negro o como cuadros)
function sin_emoji($v){ return is_string($v) ? trim(preg_replace('/[\x{1F000}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}\x{2190}-\x{21FF}\x{FE0F}\x{200D}\x{20E3}\x{2139}]/u',' ',$v)) : $v; }
function xlsx_send($fname,$title,$sub,$headers,$rows,$estadoIdx,$widths){
  foreach($rows as $ri=>$row){ foreach($row as $ci=>$v){ $rows[$ri][$ci]=is_string($v)?preg_replace('/ {2,}/',' ',sin_emoji($v)):$v; } }
  $NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  $styles='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
   .'<styleSheet xmlns="'.$NS.'"><fonts count="5">'
   .'<font><sz val="11"/><name val="Calibri"/></font>'
   .'<font><b/><sz val="15"/><color rgb="FF1E2A4A"/><name val="Calibri"/></font>'
   .'<font><sz val="10"/><color rgb="FF5A6472"/><name val="Calibri"/></font>'
   .'<font><b/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>'
   .'<font><b/><name val="Calibri"/></font></fonts>'
   .'<fills count="8"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
   .'<fill><patternFill patternType="solid"><fgColor rgb="FF1E2A4A"/></patternFill></fill>'
   .'<fill><patternFill patternType="solid"><fgColor rgb="FFF4F6F8"/></patternFill></fill>'
   .'<fill><patternFill patternType="solid"><fgColor rgb="FFD8F3DF"/></patternFill></fill>'
   .'<fill><patternFill patternType="solid"><fgColor rgb="FFFBE0DE"/></patternFill></fill>'
   .'<fill><patternFill patternType="solid"><fgColor rgb="FFFCEFD2"/></patternFill></fill>'
   .'<fill><patternFill patternType="solid"><fgColor rgb="FFFDE7CC"/></patternFill></fill></fills>'
   .'<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
   .'<border><left style="thin"><color rgb="FFD9DEE4"/></left><right style="thin"><color rgb="FFD9DEE4"/></right><top style="thin"><color rgb="FFD9DEE4"/></top><bottom style="thin"><color rgb="FFD9DEE4"/></bottom><diagonal/></border></borders>'
   .'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
   .'<cellXfs count="11">'
   .'<xf xfId="0" fontId="0" fillId="0" borderId="0"/>'                                     /*0*/
   .'<xf xfId="0" fontId="1" fillId="0" borderId="0" applyFont="1"/>'                       /*1 title*/
   .'<xf xfId="0" fontId="2" fillId="0" borderId="0" applyFont="1"/>'                       /*2 sub*/
   .'<xf xfId="0" fontId="3" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' /*3 header*/
   .'<xf xfId="0" fontId="0" fillId="0" borderId="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' /*4 normal*/
   .'<xf xfId="0" fontId="0" fillId="3" borderId="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' /*5 stripe*/
   .'<xf xfId="0" fontId="4" fillId="4" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' /*6 green*/
   .'<xf xfId="0" fontId="4" fillId="5" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' /*7 red*/
   .'<xf xfId="0" fontId="4" fillId="6" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' /*8 amber*/
   .'<xf xfId="0" fontId="4" fillId="7" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' /*9 orange*/
   .'<xf xfId="0" fontId="0" fillId="3" borderId="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' /*10 gray=stripe*/
   .'</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  $cols='<cols>'; foreach($widths as $i=>$w){ $cc=$i+1; $cols.='<col min="'.$cc.'" max="'.$cc.'" width="'.$w.'" customWidth="1"/>'; } $cols.='</cols>';
  $sd='<sheetData>';
  $sd.='<row r="1"><c r="A1" s="1" t="inlineStr"><is><t>'.xesc($title).'</t></is></c></row>';
  $sd.='<row r="2"><c r="A2" s="2" t="inlineStr"><is><t>'.xesc($sub).'</t></is></c></row>';
  $sd.='<row r="4" ht="30" customHeight="1">'; foreach($headers as $i=>$hh){ $sd.='<c r="'.xcol($i+1).'4" s="3" t="inlineStr"><is><t>'.xesc($hh).'</t></is></c>'; } $sd.='</row>';
  $rn=5;
  foreach($rows as $ri=>$row){ $stripe=($ri%2==1); $sd.='<row r="'.$rn.'">';
    foreach($row as $ci=>$v){ $s = ($ci==$estadoIdx) ? estado_sty($v) : ($stripe?5:4);
      $sd.='<c r="'.xcol($ci+1).$rn.'" s="'.$s.'" t="inlineStr"><is><t>'.xesc($v).'</t></is></c>'; }
    $sd.='</row>'; $rn++; }
  $sd.='</sheetData>';
  $sheet='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="'.$NS.'">'
   .'<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
   .$cols.$sd.'</worksheet>';
  $ct='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
   .'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
   .'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
   .'<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
   .'<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
  $rels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
   .'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  $wb='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="'.$NS.'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
   .'<sheets><sheet name="Seguimiento" sheetId="1" r:id="rId1"/></sheets></workbook>';
  $wbrels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
   .'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
   .'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
  $tmp=tempnam(sys_get_temp_dir(),'xlsx'); $z=new ZipArchive(); $z->open($tmp,ZipArchive::OVERWRITE);
  $z->addFromString('[Content_Types].xml',$ct); $z->addFromString('_rels/.rels',$rels);
  $z->addFromString('xl/workbook.xml',$wb); $z->addFromString('xl/_rels/workbook.xml.rels',$wbrels);
  $z->addFromString('xl/styles.xml',$styles); $z->addFromString('xl/worksheets/sheet1.xml',$sheet); $z->close();
  header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  header('Content-Disposition: attachment; filename="'.$fname.'"');
  header('Content-Length: '.filesize($tmp)); readfile($tmp); @unlink($tmp); exit;
}

$per = isset($_GET['p']) ? $_GET['p'] : 'hoy';
if(!in_array($per,['hoy','ayer','semana','mes','todos'],true)) $per='hoy';
// === POR QUÉ FECHA SE FILTRA (2026-08-11, lo pidió Deicy: "no han reportado nada y en el chat sí reportaron") ===
// La tabla siempre filtró por `creado_en`: CUÁNDO ENTRÓ la solicitud. Pero al preguntar "¿qué reportaron
// ayer?" se estaba leyendo otra cosa — los asesores reportan hoy solicitudes que entraron hace días, y esos
// reportes no salían por ningún lado. Ahora se elige la fecha: entrada (como siempre) o REPORTE.
$fk = isset($_GET['f']) ? $_GET['f'] : 'entrada';
if(!in_array($fk,['entrada','reporte'],true)) $fk='entrada';
$FCOL = $fk==='reporte' ? 'reportado_en' : 'creado_en';
$W = [
  'hoy'=>"DATE($FCOL)=CURDATE()", 'ayer'=>"DATE($FCOL)=(CURDATE() - INTERVAL 1 DAY)",
  'semana'=>"$FCOL >= (CURDATE() - INTERVAL 7 DAY)", 'mes'=>"$FCOL >= (CURDATE() - INTERVAL 30 DAY)",
  'todos'=>($fk==='reporte' ? "reportado_en IS NOT NULL" : "1=1"),
][$per];
if($fk==='reporte') $W = "(".$W.") AND reportado_en IS NOT NULL";
$asf = isset($_GET['a']) ? trim($_GET['a']) : '';
// Filtro por MARCA (Deicy 2026-07-21): '' = todas, 'Ardisa' (CyR) o 'Carpincentro'. Lista blanca -> seguro para inyectar en el SQL.
$mf = isset($_GET['m']) ? trim($_GET['m']) : '';
if(!in_array($mf,['','Ardisa','Carpincentro'],true)) $mf='';
$MW = $mf!=='' ? (" AND marca='".$mf."' ") : "";
$test = isset($_GET['test']);                                    // 🧪 incluir leads de PRUEBA/demo
$mp = $test ? " " : " AND COALESCE(modo_prueba,0)=0 ";

if (isset($_GET['export'])) {
  $sql="SELECT creado_en,nombre,telefono,ciudad,marca,solicitud,tipo_cliente,detalle,asesor,obs_asesor,valor_venta,estado,estado_motivo
        FROM leads WHERE $W $mp $MW ".($asf!==''?" AND asesor=? ":"")." ORDER BY creado_en ASC";
  $st=$c->prepare($sql); if($asf!==''){ $st->bind_param('s',$asf);} $st->execute(); $r=$st->get_result();
  $MES=['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  $headers=['#','Llamada/Wapp','Mes','Fecha','Ciudad','Nombre cliente','Celular','Clasificación 01','Tipo Cliente','Solicitud del cliente','Canal','Asesor','Observación Equipo comercial','Valor Venta Efectiva','Estado'];
  $widths=[4,11,9,11,14,20,13,18,16,40,13,22,36,13,30];
  $data=[]; $i=0; $tg=0; $vv=0.0;
  while($x=$r->fetch_assoc()){ $i++; $t=strtotime($x['creado_en']);
    $est=($x['estado']!==null && $x['estado']!=='')?$x['estado']:'Pendiente';
    if(stripos($est,'ganado')!==false){ $tg++; $vv+=(float)$x['valor_venta']; }
    $val=($x['valor_venta']!==null && $x['valor_venta']!=='')?('$'.number_format((float)$x['valor_venta'],0,',','.')):'';
    $data[]=[ $i,'WhatsApp',$MES[(int)date('n',$t)],date('d/m/Y',$t),$x['ciudad'],$x['nombre'],'+'.$x['telefono'],
      $x['solicitud'],$x['tipo_cliente'],$x['detalle'],$x['marca'],$x['asesor'],trim((($x['estado_motivo']??'')!==''?('Motivo: '.$x['estado_motivo'].' · '):'').(string)$x['obs_asesor'],' · '),$val,$est ]; }
  $lbl=['hoy'=>'Hoy','ayer'=>'Ayer','semana'=>'Últimos 7 días','mes'=>'Últimos 30 días','todos'=>'Histórico'][$per];
  // Se dice por QUÉ fecha está filtrado: un Excel que no lo aclara se lee como si fuera lo otro.
  $sub=$lbl.' (por fecha de '.($fk==='reporte'?'REPORTE del asesor':'entrada de la solicitud').')'
      .'  ·  '.count($data).' solicitudes  ·  '.$tg.' ganadas  ·  Valor ganado: $'.number_format($vv,0,',','.');
  xlsx_send('Seguimiento_'.$per.'_'.date('Ymd').'.xlsx','Grupo Ardisa · Seguimiento de solicitudes (WhatsApp)',$sub,$headers,$data,14,$widths);
}

// === TOTALES EN SQL, NO SOBRE LA PÁGINA (2026-08-11) ===
// Antes se contaba recorriendo $rows. Con paginación eso haría que los indicadores de arriba cambiaran al
// pasar de página — mentirían. Los totales se calculan sobre TODO el período filtrado, en la base.
$aggsql="SELECT COUNT(*) tot,
   SUM(CASE WHEN estado IS NOT NULL AND estado<>'' THEN 1 ELSE 0 END) rep,
   SUM(CASE WHEN LOWER(estado) LIKE '%ganado%' THEN 1 ELSE 0 END) gan,
   SUM(CASE WHEN LOWER(estado) LIKE '%ganado%' THEN COALESCE(valor_venta,0) ELSE 0 END) val,
   SUM(CASE WHEN LOWER(estado) LIKE '%perdido%' THEN 1 ELSE 0 END) perd,
   SUM(CASE WHEN LOWER(estado) LIKE '%cotizaci%' OR LOWER(estado) LIKE '%gesti%' THEN 1 ELSE 0 END) cot
   FROM leads WHERE $W $mp $MW ".($asf!==''?" AND asesor=? ":"");
$sa=$c->prepare($aggsql); if($asf!==''){ $sa->bind_param('s',$asf);} $sa->execute(); $ag=$sa->get_result()->fetch_assoc();
$tot=(int)$ag['tot']; $rep=(int)$ag['rep']; $gan=(int)$ag['gan']; $val=(float)$ag['val'];
$perd=(int)$ag['perd']; $cot=(int)$ag['cot']; $pend=$tot-$rep;

// === PAGINACIÓN (2026-08-11, la pidió Deicy) ===
// La tabla traía hasta 500 filas de un golpe y las pintaba todas: en "Histórico" eso es una página
// interminable y, peor, silenciosamente RECORTADA en 500 — parecía completa sin serlo.
$PP = 50;
$pg  = isset($_GET['pg']) ? max(1,(int)$_GET['pg']) : 1;
$paginas = max(1, (int)ceil($tot / $PP));
if($pg > $paginas) $pg = $paginas;
$off = ($pg-1) * $PP;

$sql="SELECT id,creado_en,nombre,telefono,ciudad,marca,solicitud,tipo_cliente,detalle,asesor,estado,estado_motivo,valor_venta,obs_asesor,reportado_en,COALESCE(modo_prueba,0) mp
      FROM leads WHERE $W $mp $MW ".($asf!==''?" AND asesor=? ":"")." ORDER BY $FCOL DESC, id DESC LIMIT $PP OFFSET $off";
$st=$c->prepare($sql); if($asf!==''){ $st->bind_param('s',$asf);} $st->execute(); $res=$st->get_result();
$rows=[]; while($x=$res->fetch_assoc()) $rows[]=$x;
// Roster COMPLETO de asesores (todos, aunque no tengan leads en el período) + los que aparezcan en la BD.
// Asesores ACTIVOS (Deicy 2026-07-21): solo los que tienen leads en el período/marca filtrados, con su conteo.
$ases=[];
$ra=$c->query("SELECT asesor, COUNT(*) n FROM leads WHERE $W $mp $MW AND asesor IS NOT NULL AND asesor<>'' GROUP BY asesor ORDER BY n DESC, asesor");
if($ra){ while($z=$ra->fetch_assoc()){ $ases[$z['asesor']]=(int)$z['n']; } }
// 2026-07-24 (pedido Deicy): el filtro muestra SIEMPRE a TODOS los asesores (histórico completo),
// con (0) si no tienen leads en el período filtrado — antes "hoy" solo listaba a los del día.
$rt=$c->query("SELECT DISTINCT asesor FROM leads WHERE asesor IS NOT NULL AND asesor<>''");
if($rt){ while($z=$rt->fetch_assoc()){ if(!isset($ases[$z['asesor']])) $ases[$z['asesor']]=0; } }
if($asf!=='' && !isset($ases[$asf])) $ases[$asf]=0;   // el seleccionado siempre visible aunque quede en 0

function badge($e){
  if($e===null||$e===''){ return '<span class="bg pend">⏳ Pendiente</span>'; }
  $l=mb_strtolower($e);
  $cls = strpos($l,'ganado')!==false?'ok':(strpos($l,'perdido')!==false?'no':((strpos($l,'cotización')!==false||strpos($l,'gestión')!==false)?'wait':'gray'));
  return '<span class="bg '.$cls.'">'.h($e).'</span>';
}
function money($v){ if($v===null||$v==='') return ''; return '$'.number_format((float)$v,0,',','.'); }
function pct($n,$t){ return $t>0?round($n*100/$t):0; }
$qbase='p='.$per.($mf!==''?('&m='.urlencode($mf)):'').($asf!==''?('&a='.urlencode($asf)):'').($test?'&test=1':'');
// Constructor de enlaces (2026-08-11): conserva TODOS los filtros vigentes y cambia solo lo que se le pase.
// Antes cada enlace se armaba a mano; al agregar un filtro nuevo había que acordarse de sumarlo en cada uno,
// y el que se olvidara se perdía al navegar. Un solo sitio donde armarlos = un solo sitio donde equivocarse.
function lnk($ov=[]){
  global $per,$mf,$asf,$test,$fk;
  $qs = array_merge(['p'=>$per,'m'=>$mf,'a'=>$asf,'f'=>$fk,'test'=>($test?'1':'')], $ov);
  $out=[];
  foreach($qs as $k=>$v){ if($v!=='' && $v!==null) $out[] = $k.'='.urlencode($v); }
  return '?'.implode('&',$out);
}
?><!doctype html>
<html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Seguimiento · Grupo Ardisa</title>
<style>
  :root{--navy:#182850;--navy2:#22376b;--teal:#009888;--teal-d:#037c70;--mint:#58C0B0;
        --paper:#F4F7F9;--panel:#fff;--line:#E6ECEF;--ink:#17222B;--soft:#6A7A85;
        --ok:#1B9E4B;--okbg:#E4F6EA;--no:#D64545;--nobg:#FBE7E5;--wait:#B7791F;--waitbg:#FBF0D6;--pend:#C4700A;--pendbg:#FCEBD6;--gray:#5B6B75;--graybg:#EAEEF0}
  *{box-sizing:border-box}
  body{margin:0;font-family:"Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif;color:var(--ink);background:var(--paper);-webkit-font-smoothing:antialiased}
  .top{background:linear-gradient(120deg,var(--navy) 0%,var(--navy2) 60%,var(--teal-d) 140%);color:#fff;padding:18px 20px 20px}
  .top .in{max-width:1280px;margin:0 auto;display:flex;align-items:center;gap:14px;flex-wrap:wrap}
  .logo{width:42px;height:42px;border-radius:11px;background:rgba(255,255,255,.14);display:flex;align-items:center;justify-content:center;font-size:1.3rem;border:1px solid rgba(255,255,255,.18)}
  .top h1{margin:0;font-size:1.18rem;font-weight:800;letter-spacing:-.01em}
  .top .sub{font-size:.78rem;color:#C7D6E4}
  .top .acts{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap}
  .btn{text-decoration:none;padding:8px 15px;border-radius:9px;font-weight:700;font-size:.82rem;display:inline-flex;align-items:center;gap:6px}
  .btn.exp{background:#1F9D57;color:#fff;box-shadow:0 2px 8px rgba(31,157,87,.35)}
  .btn.mon{background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.22)}
  .wrap{max-width:1280px;margin:0 auto;padding:16px 16px 48px}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:14px}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px 16px;box-shadow:0 1px 3px rgba(24,40,80,.05);position:relative;overflow:hidden}
  .card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--teal)}
  .card.g::before{background:var(--ok)}.card.p::before{background:var(--pend)}.card.v::before{background:var(--navy)}.card.r::before{background:var(--mint)}
  .card .k{font-size:.72rem;color:var(--soft);text-transform:uppercase;letter-spacing:.05em;font-weight:700}
  .card .v{font-size:1.7rem;font-weight:800;margin-top:3px;line-height:1}
  .card .x{font-size:.72rem;color:var(--soft);margin-top:3px}
  .card.g .v{color:var(--ok)}.card.p .v{color:var(--pend)}.card.v .v{color:var(--navy)}
  .barbox{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin-bottom:14px}
  .barbox .t{font-size:.74rem;color:var(--soft);text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-bottom:9px}
  .bar{display:flex;height:16px;border-radius:8px;overflow:hidden;background:var(--graybg)}
  .bar i{display:block;height:100%}
  .bar .s-ok{background:var(--ok)}.bar .s-no{background:var(--no)}.bar .s-wait{background:var(--wait)}.bar .s-pend{background:var(--pend)}
  .leg{display:flex;gap:16px;flex-wrap:wrap;margin-top:9px;font-size:.76rem;color:var(--soft)}
  .leg b{color:var(--ink)} .dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;vertical-align:middle}
  .filters{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
  .tabs{display:flex;gap:6px;flex-wrap:wrap}
  .tab{text-decoration:none;color:var(--teal-d);background:#fff;border:1px solid var(--line);padding:7px 14px;border-radius:22px;font-size:.82rem;font-weight:700}
  .tab.on{background:var(--navy);color:#fff;border-color:var(--navy)}
  select{padding:8px 12px;border-radius:10px;border:1px solid var(--line);font-size:.82rem;background:#fff;color:var(--ink);font-weight:600}
  .tblbox{overflow-x:auto;background:var(--panel);border:1px solid var(--line);border-radius:14px;box-shadow:0 1px 3px rgba(24,40,80,.05)}
  /* Paginación (2026-08-11) — mismo lenguaje visual de las pestañas: píldoras, no botones de otro planeta. */
  .pager{display:flex;flex-wrap:wrap;align-items:center;gap:10px;justify-content:space-between;margin:12px 2px 4px}
  .pginfo{font-size:.82rem;color:var(--soft)} .pginfo b{color:var(--ink)}
  .pgbtns{display:flex;flex-wrap:wrap;gap:6px}
  .pgb{text-decoration:none;color:var(--teal-d);background:#fff;border:1px solid var(--line);
       padding:6px 12px;border-radius:22px;font-size:.8rem;font-weight:700;min-width:16px;text-align:center}
  .pgb:hover{border-color:var(--mint)}
  .pgb.on{background:var(--navy);color:#fff;border-color:var(--navy)}
  .pgb.off{color:#B6C2CB;pointer-events:none;background:#FAFCFD}
  table{border-collapse:collapse;width:100%;font-size:.84rem;min-width:1020px}
  th,td{padding:11px 13px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}
  thead th{background:var(--navy);color:#EAF0F7;font-size:.7rem;text-transform:uppercase;letter-spacing:.04em;font-weight:700;position:sticky;top:0;white-space:nowrap}
  tbody tr:nth-child(even) td{background:#FAFCFD}
  tbody tr:hover td{background:#F0F8F6}
  .cli{font-weight:700}.sub2{color:var(--soft);font-size:.77rem}
  .pill{display:inline-block;padding:2px 8px;border-radius:20px;font-size:.71rem;font-weight:700;background:#EAF1F0;color:var(--teal-d)}
  .pill.carp{background:#F3ECFB;color:#6B3FA0}
  .bg{display:inline-block;padding:4px 10px;border-radius:20px;font-size:.72rem;font-weight:700;white-space:nowrap}
  .bg.ok{background:var(--okbg);color:var(--ok)}.bg.no{background:var(--nobg);color:var(--no)}
  .bg.wait{background:var(--waitbg);color:var(--wait)}.bg.gray{background:var(--graybg);color:var(--gray)}.bg.pend{background:var(--pendbg);color:var(--pend)}
  .det{max-width:260px;color:var(--soft);font-size:.8rem}
  .val{font-weight:800;color:var(--ok);white-space:nowrap}
  .empty{padding:50px;text-align:center;color:var(--soft)}
  @media(max-width:640px){ .top h1{font-size:1rem} .card .v{font-size:1.4rem} }
</style></head><body>
<div class="top"><div class="in">
  <div class="logo">📊</div>
  <div>
    <h1>Seguimiento de solicitudes</h1>
    <div class="sub">Grupo Ardisa · lo reportan los asesores por WhatsApp</div>
  </div>
  <div class="acts">
    <a class="btn mon" href="index.php">💬 Chats</a>
    <a class="btn mon" href="<?php echo lnk(['test'=>$test?'':'1']); ?>"><?php echo $test?'👁️ Solo reales':'🧪 Ver pruebas'; ?></a>
    <a class="btn exp" href="<?php echo lnk(['export'=>'1']); ?>">⬇️ Exportar Excel</a>
  </div>
</div></div>
<div class="wrap">
  <div class="cards">
    <div class="card"><div class="k">Solicitudes</div><div class="v"><?php echo $tot; ?></div><div class="x"><?php echo ['hoy'=>'hoy','ayer'=>'ayer','semana'=>'últimos 7 días','mes'=>'últimos 30 días','todos'=>'histórico'][$per]; ?></div></div>
    <div class="card r"><div class="k">Reportadas</div><div class="v"><?php echo $rep; ?></div><div class="x"><?php echo pct($rep,$tot); ?>% del total</div></div>
    <div class="card p"><div class="k">Pendientes</div><div class="v"><?php echo $pend; ?></div><div class="x">por reportar</div></div>
    <div class="card g"><div class="k">Ganadas</div><div class="v"><?php echo $gan; ?></div><div class="x"><?php echo pct($gan,$tot); ?>% conversión</div></div>
    <div class="card v"><div class="k">Valor ganado</div><div class="v"><?php echo money($val)?:'$0'; ?></div><div class="x">ventas efectivas</div></div>
  </div>
  <?php if($tot>0): ?>
  <div class="barbox">
    <div class="t">Distribución por estado</div>
    <div class="bar">
      <i class="s-ok" style="width:<?php echo pct($gan,$tot); ?>%"></i>
      <i class="s-wait" style="width:<?php echo pct($cot,$tot); ?>%"></i>
      <i class="s-no" style="width:<?php echo pct($perd,$tot); ?>%"></i>
      <i class="s-pend" style="width:<?php echo pct($pend,$tot); ?>%"></i>
    </div>
    <div class="leg">
      <span><span class="dot" style="background:var(--ok)"></span>Ganadas <b><?php echo $gan; ?></b></span>
      <span><span class="dot" style="background:var(--wait)"></span>En gestión/Cotización <b><?php echo $cot; ?></b></span>
      <span><span class="dot" style="background:var(--no)"></span>Perdidas <b><?php echo $perd; ?></b></span>
      <span><span class="dot" style="background:var(--pend)"></span>Pendientes <b><?php echo $pend; ?></b></span>
    </div>
  </div>
  <?php endif; ?>
  <div class="filters">
    <div class="tabs">
      <?php foreach(['hoy'=>'Hoy','ayer'=>'Ayer','semana'=>'7 días','mes'=>'30 días','todos'=>'Histórico'] as $k=>$lbl): ?>
        <a class="tab <?php echo $per===$k?'on':''; ?>" href="<?php echo lnk(['p'=>$k]); ?>"><?php echo $lbl; ?></a>
      <?php endforeach; ?>
    </div>
    <div class="tabs">
      <?php foreach(['' => 'Ambas marcas','Ardisa'=>'🟢 CyR (Ardisa)','Carpincentro'=>'🟡 Carpincentro'] as $k=>$lbl): ?>
        <a class="tab <?php echo $mf===$k?'on':''; ?>" href="<?php echo lnk(['m'=>$k]); ?>"><?php echo $lbl; ?></a>
      <?php endforeach; ?>
    </div>
    <div class="tabs">
      <?php foreach(['entrada'=>'📥 Fecha de entrada','reporte'=>'📤 Fecha de reporte'] as $k=>$lbl): ?>
        <a class="tab <?php echo $fk===$k?'on':''; ?>" href="<?php echo lnk(['f'=>$k]); ?>"><?php echo $lbl; ?></a>
      <?php endforeach; ?>
    </div>
    <form method="get" style="display:inline;margin-left:auto">
      <input type="hidden" name="p" value="<?php echo h($per); ?>">
      <input type="hidden" name="f" value="<?php echo h($fk); ?>">
      <?php if($mf!==''): ?><input type="hidden" name="m" value="<?php echo h($mf); ?>"><?php endif; ?>
      <?php if($test): ?><input type="hidden" name="test" value="1"><?php endif; ?>
      <select name="a" onchange="this.form.submit()">
        <option value="">Todos los asesores</option>
        <?php foreach($ases as $a=>$n): ?><option value="<?php echo h($a); ?>" <?php echo $asf===$a?'selected':''; ?>><?php echo h($a); ?> (<?php echo $n; ?>)</option><?php endforeach; ?>
      </select>
    </form>
  </div>
  <div class="tblbox">
    <table>
      <thead><tr>
        <th>Fecha</th><th>Cliente</th><th>Canal</th><th>Clasificación</th><th>Tipo</th>
        <th>Solicitud del cliente</th><th>Asesor</th><th>Estado</th><th>Valor</th><th>Observación</th>
      </tr></thead>
      <tbody>
      <?php if(!$rows): ?><tr><td colspan="10" class="empty">No hay solicitudes en este período.</td></tr><?php endif; ?>
      <?php foreach($rows as $x): $carp=(mb_stripos((string)$x['marca'],'carp')!==false); ?>
        <tr>
          <td style="white-space:nowrap"><?php echo date('d/m',strtotime($x['creado_en'])); ?><br><span class="sub2"><?php echo date('g:i a',strtotime($x['creado_en'])); ?></span></td>
          <td><div class="cli"><?php echo h($x['nombre']?:'—'); ?></div><div class="sub2"><?php echo h($x['ciudad']?:''); ?> · +<?php echo h($x['telefono']); ?></div></td>
          <td><span class="pill <?php echo $carp?'carp':''; ?>"><?php echo h($x['marca']?:'—'); ?></span><?php if(!empty($x['mp'])): ?> <span class="pill" style="background:#FCEBD6;color:#B15C00">🧪</span><?php endif; ?></td>
          <td><?php echo h($x['solicitud']?:'—'); ?></td>
          <td><?php echo h($x['tipo_cliente']?:'—'); ?></td>
          <td class="det"><?php echo h((string)$x['detalle']); ?></td>
          <td><?php echo h($x['asesor']?:'—'); ?></td>
          <td><?php echo badge($x['estado']); ?>
            <?php if(!empty($x['reportado_en'])): ?><div class="sub2">reportado <?php echo date('d/m g:i a',strtotime($x['reportado_en'])); ?></div><?php endif; ?></td>
          <td class="val"><?php echo money($x['valor_venta']); ?></td>
          <td class="det"><?php $obsm=trim((($x['estado_motivo']??'')!==''?('Motivo: '.$x['estado_motivo'].' · '):'').(string)$x['obs_asesor'],' · '); echo h($obsm); ?></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
  <?php if($tot > 0): ?>
  <div class="pager">
    <span class="pginfo">
      <?php $desde = $off+1; $hasta = min($off+$PP, $tot); ?>
      Mostrando <b><?php echo $desde; ?>–<?php echo $hasta; ?></b> de <b><?php echo $tot; ?></b>
      <?php echo $tot===1?'solicitud':'solicitudes'; ?>
      <?php if($paginas>1): ?> · página <b><?php echo $pg; ?></b> de <b><?php echo $paginas; ?></b><?php endif; ?>
    </span>
    <?php if($paginas > 1): ?>
    <span class="pgbtns">
      <a class="pgb <?php echo $pg<=1?'off':''; ?>" href="<?php echo $pg<=1?'#':lnk(['pg'=>1]); ?>">« Primera</a>
      <a class="pgb <?php echo $pg<=1?'off':''; ?>" href="<?php echo $pg<=1?'#':lnk(['pg'=>$pg-1]); ?>">‹ Anterior</a>
      <?php
        // Ventana de páginas alrededor de la actual (no se pintan 40 numeritos si el histórico es largo).
        $ini = max(1, $pg-2); $fin = min($paginas, $ini+4); $ini = max(1, $fin-4);
        for($i=$ini; $i<=$fin; $i++): ?>
        <a class="pgb <?php echo $i===$pg?'on':''; ?>" href="<?php echo lnk(['pg'=>$i]); ?>"><?php echo $i; ?></a>
      <?php endfor; ?>
      <a class="pgb <?php echo $pg>=$paginas?'off':''; ?>" href="<?php echo $pg>=$paginas?'#':lnk(['pg'=>$pg+1]); ?>">Siguiente ›</a>
      <a class="pgb <?php echo $pg>=$paginas?'off':''; ?>" href="<?php echo $pg>=$paginas?'#':lnk(['pg'=>$paginas]); ?>">Última »</a>
    </span>
    <?php endif; ?>
  </div>
  <?php endif; ?>
</div>
</body></html>
