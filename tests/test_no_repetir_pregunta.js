// El bot NO le puede repetir al cliente una pregunta que ya contesto (caso real 3-ago 15:12, visto por Deicy).
// La sesion se quedo en 'consent' aunque la BD ya tenia la autorizacion; el cliente toco "Ardisa" y el bot
// le volvio a mostrar el MISMO menu de marca en vez de atender su boton.
const fs = require('fs');
const CEREBRO = fs.readFileSync(__dirname + '/cerebro.js', 'utf8');

function correr({ datos, sd, pend }) {
  const $ = (n) => ({ first: () => ({ json:
      n === 'Extraer datos'   ? datos :
      n === '🤖 IA Anthropic' ? (datos.ia ? { content:[{type:'tool_use', input: datos.ia}] } : {}) :
      (pend || {}) }) });
  return new Function('$','$getWorkflowStaticData','$env', CEREBRO)($, () => sd, new Proxy({},{get:()=>''}))[0].json;
}
const WA = '573001234567';
// Sesion atrasada: sigue en 'consent' (una carrera se comio el avance) pero la BD SI tiene la autorizacion.
const sdAtrasado = () => ({ rot:{}, consent:{}, leads:[], done:{}, sent:{}, lastKey:{}, fwd:{}, medias:{},
                            segPend:{}, pendCierre:{}, rescate:{}, ses:{ [WA]:{ paso:'consent', t:Date.now() } } });
const boton = (id, title) => ({ wa_id:WA, profileName:'Clienta', texto:'', mtype:'', media_id:'',
                                opcion_id:id, opcion_txt:title, es_media:false, ia:null });
const texto = (t, ia) => ({ wa_id:WA, profileName:'Clienta', texto:t, mtype:'', media_id:'',
                            opcion_id:'', opcion_txt:'', es_media:false, ia:ia||null });
const foto = () => ({ wa_id:WA, profileName:'Clienta', texto:'', mtype:'image', media_id:'MID1',
                      opcion_id:'', opcion_txt:'', es_media:true,
                      ia:{ en_alcance:true, marca:'Ardisa', grupo_pista:'ACABADOS', productos:['grifería'],
                           confianza:'alta', es_reclamo:false, es_info:false } });

let ok = 0, total = 0;
const chequear = (n, cond, det) => { total++; if (cond) ok++;
  console.log((cond ? '  OK  ' : '  FALLA') + ' | ' + n + (cond ? '' : '\n         ' + (det||''))); };

// 1. EL CASO DE DEICY: toca "Ardisa" con la sesion atrasada -> debe AVANZAR, no repetir el menu.
{
  const sd = sdAtrasado();
  const r = correr({ datos: boton('MAR_ARD','🟢 Ardisa'), sd, pend:{ cons_si:1 } });
  const cuerpo = JSON.stringify(r.wpp_body||'');
  chequear('Toca "Ardisa" -> avanza (NO repite el menú de marca)',
           r.etapa !== 'marca' && !(/🟢 \*?Ardisa/.test(cuerpo) && /🟡 \*?Carpincentro/.test(cuerpo)), 'etapa=' + r.etapa + ' ' + cuerpo.slice(0,160));
  chequear('Le pregunta el nombre, que es lo que sigue', /nombre/i.test(cuerpo), cuerpo.slice(0,160));
  chequear('La línea queda guardada como Ardisa', sd.ses[WA] && sd.ses[WA].marca === 'Ardisa', JSON.stringify(sd.ses[WA]));
}
// 2. Lo mismo con Carpincentro.
{
  const sd = sdAtrasado();
  const r = correr({ datos: boton('MAR_CARP','🟡 Carpincentro'), sd, pend:{ cons_si:1 } });
  chequear('Toca "Carpincentro" -> avanza', r.etapa !== 'marca' && sd.ses[WA].marca === 'Carpincentro',
           'etapa=' + r.etapa + ' marca=' + (sd.ses[WA]||{}).marca);
}
// 3. Manda una FOTO con la sesion atrasada -> no se le pierde ni se le repite el permiso.
{
  const sd = sdAtrasado();
  const r = correr({ datos: foto(), sd, pend:{ cons_si:1 } });
  const cuerpo = JSON.stringify(r.wpp_body||'');
  chequear('Manda foto -> no le vuelve a pedir la autorización', !/autorizaci[oó]n para el tratamiento/i.test(cuerpo),
           cuerpo.slice(0,160));
  chequear('La foto NO se pierde', !!(sd.ses[WA] && (sd.ses[WA].mediaId || sd.ses[WA].pendMediaId)) || /adjunt|foto|imagen/i.test(cuerpo),
           JSON.stringify(sd.ses[WA]));
}
// 4. Si NO ha autorizado, el muro SIGUE (no se cuela nadie por este arreglo).
{
  const sd = sdAtrasado();
  const r = correr({ datos: boton('MAR_ARD','🟢 Ardisa'), sd, pend:{ cons_si:0 } });
  chequear('Sin autorización el muro SIGUE', r.etapa === 'consent', 'etapa=' + r.etapa);
}
// 5. Texto suelto con sesion atrasada: pasa al menu de marca (no repite el permiso).
{
  const sd = sdAtrasado();
  const r = correr({ datos: texto('buenas'), sd, pend:{ cons_si:1 } });
  chequear('Texto suelto -> no repite el permiso',
           !/autorizaci[oó]n para el tratamiento/i.test(JSON.stringify(r.wpp_body||'')), 'etapa=' + r.etapa);
}

console.log('\n' + ok + '/' + total + ' pruebas pasan');
process.exit(ok === total ? 0 : 1);
