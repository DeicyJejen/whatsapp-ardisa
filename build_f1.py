#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Bot WhatsApp Ardisa - FASE 1: conversacional moderno, casi todo con opciones -> resumen al asesor.
import json, sys, os

PHONE_NUMBER_ID = "1192861723914326"
PATH = "bot-wsp-ardisa-f1"
VERIFY_TOKEN = "ardisa2026"
_tokfile = "/tmp/claude-1000/-home-ubuntu-whatsapp-ardisa/56c9d386-67e9-4199-8fa6-390fc8280a84/scratchpad/wpp_token.txt"
TOKEN = "PEGAR_TOKEN_AQUI"
if os.path.exists(_tokfile):
    TOKEN = open(_tokfile).read().strip()
elif len(sys.argv) > 1:
    TOKEN = sys.argv[1]

# Credencial cifrada de n8n (Header Auth) que inyecta "Authorization: Bearer <token>" SOLO hacia graph.facebook.com.
# El token YA NO se escribe en el workflow JSON; vive cifrado en n8n. Rotar = actualizar el VALOR de esta credencial en n8n.
WPP_CRED_ID = "WaKCK4eCT2vecazW"
WPP_CRED_NAME = "WhatsApp Ardisa Token"

CODE_EXTRAER = r"""
const root = $input.first().json;
const body = root.body || root;
const value = body?.entry?.[0]?.changes?.[0]?.value;
const msg = value?.messages?.[0];
if (!msg) { return [{ json: { es_mensaje: false } }]; }
const wa_id = msg.from;
const msg_id = msg.id || '';
const mtype = msg.type || '';
const profileName = value?.contacts?.[0]?.profile?.name || '';
// Solo estos tipos son adjuntos válidos (un lead); reacciones/system/unsupported/order/etc. se ignoran.
const MEDIA = ['image','audio','video','document','sticker','location','contacts'];
if (mtype !== 'text' && mtype !== 'interactive' && !MEDIA.includes(mtype)) { return [{ json: { es_mensaje: false } }]; }
let texto = '', opcion_id = '';
if (mtype === 'text') { texto = msg.text?.body || ''; }
else if (mtype === 'interactive') {
  if (msg.interactive?.type === 'button_reply') { opcion_id = msg.interactive.button_reply.id || ''; texto = msg.interactive.button_reply.title || ''; }
  else if (msg.interactive?.type === 'list_reply') { opcion_id = msg.interactive.list_reply.id || ''; texto = msg.interactive.list_reply.title || ''; }
}
const es_media = MEDIA.includes(mtype);   // imagen, audio, video, documento, sticker, ubicación, contacto
return [{ json: { es_mensaje: true, wa_id, msg_id, mtype, es_media, texto, opcion_id, profileName } }];
"""

CODE_CEREBRO = r"""
// Cerebro conversacional MODERNO. Marca -> nombre -> ciudad -> (Ardisa: producto | Carpincentro: ocupación) -> solicitud -> detalle -> RESUMEN al asesor con ROTACIÓN justa.
// Fixes: (1) MEDIA = lead válido (foto/audio se aceptan), (2) ESCAPE a humano en cualquier paso, (4) TONO "asistente virtual" + SLA honesto.
const store = $getWorkflowStaticData('global');
if (!store.ses) store.ses = {};
if (!store.rot) store.rot = {};   // contadores de rotación (round-robin) por grupo/ciudad
if (!store.lastId) store.lastId = {};   // último id de mensaje por cliente (anti-duplicado)
const S = store.ses;
const d = $input.first().json;
const wa = d.wa_id;
const id = d.opcion_id || '';
const texto = (d.texto || '').trim();
const msg_id = d.msg_id || '';
const es_media = !!d.es_media;
const NOW = Date.now();
const TTL = 6*3600*1000;           // 6h: sesión vieja se reinicia sola
// Limpia sesiones viejas (evita crecer sin límite)
for (const k in S) { if (S[k] && S[k].t && (NOW - S[k].t) > TTL) delete S[k]; }
for (const k in store.lastId) { if (store.lastId[k] && (NOW - store.lastId[k].t) > TTL) delete store.lastId[k]; }   // poda el anti-duplicado (antes crecía sin límite)
// Anti-duplicado: Meta reintenta el webhook con el mismo id -> lo ignoramos
if (wa && msg_id && store.lastId[wa] && store.lastId[wa].id === msg_id) { return [{json:{etapa:'dup',wa_id:wa,wpp_body:null,aviso_body:null,hay_aviso:false}}]; }
if (wa && msg_id) store.lastId[wa] = {id:msg_id, t:NOW};
const MODO_PRUEBA = true;          // true: TODO el aviso llega al número de prueba (Deicy)
const PRUEBA_NUM = '573197889423'; // número de PRUEBA del asesor (Deicy)

// === CARPINCENTRO: se enruta por CIUDAD, rota entre las tiendas de esa ciudad ===
const DIR_CARP = {
  BUCARAMANGA:[{tienda:'Calle 61',asesor:'Cesar Diaz',num:'573182702474'},{tienda:'Caldas',asesor:'Tania Velasquez',num:'573124802034'},{tienda:'Calle 24',asesor:'Luis Javier Parra',num:'573142958071'},{tienda:'Piedecuesta',asesor:'Fidoly García',num:'573156111723'}],
  BOGOTA:[{tienda:'Patio Bonito',asesor:'Luis Alejandro Silva',num:'573173641419'},{tienda:'Restrepo',asesor:'Carlos Montoya',num:'573165296620'},{tienda:'Boyacá Real',asesor:'Daniel Bernal',num:'573203516792'},{tienda:'Toberín',asesor:'Johanna Rengifo',num:'573164376045'}],
  BARRANQUILLA:[{tienda:'Calle 30',asesor:'Jaime Rubio',num:'573162463321'},{tienda:'San Roque',asesor:'Maira Gutierrez',num:'573160249406'}],
  CARTAGENA:[{tienda:'Prado',asesor:'Rosa Montes',num:'573157104269'},{tienda:'Olaya',asesor:'Lauren Sanchez',num:'573186212856'}],
  BOYACA:[{tienda:'Tunja',asesor:'Edwin Velasquez',num:'573157521744'},{tienda:'Duitama',asesor:'Geraldine Sisa',num:'573154810637'},{tienda:'Sogamoso',asesor:'Nidia Quiroz',num:'573154318152'}],
  PEREIRA:[{tienda:'Pereira',asesor:'Monica Yepes',num:'573002188187'}],
  CALI:[{tienda:'Cali',asesor:'William Sánchez',num:'573183484540'}],
  IBAGUE:[{tienda:'Ibagué',asesor:'Jonathan Ortiz',num:'573203523500'}],
};

// === ARDISA: se enruta por CIUDAD + GRUPO (Acabados/Construcción), rota dentro del grupo ===
// Acabados: electrodomésticos, griferías, cerámicas, porcelanatos, lavamanos, sanitarios, muebles/combos de baño, duchas, pintura, Sika.
// Construcción: cemento, arena, ladrillo, Sika, pinturas, lavaderos, hierro, varilla, tejas, tubería PVC, aluminio, Drywall, eterboard y accesorios.
// HOY solo BUCARAMANGA (números PENDIENTES). Otras ciudades: Deicy pasará asesores + números → mientras tanto sale "asesor pendiente".
const ARD = {
  BUCARAMANGA:{
    ACABADOS:[{asesor:'Natalia Amaris Martínez',num:''},{asesor:'Pedro Jonathan López',num:''},{asesor:'Karina Nuñez',num:''}],
    CONSTRUCCION:[{asesor:'Miguel Ángel Barajas',num:''},{asesor:'Jhon Jairo Vargas Herreño',num:''},{asesor:'Yurmy Maiz Garza',num:''}],
  },
};

const txt = (to,b)=>({messaging_product:'whatsapp',to,type:'text',text:{body:b}});
const lista=(to,cuerpo,btn,titulo,opts)=>({messaging_product:'whatsapp',to,type:'interactive',interactive:{type:'list',body:{text:cuerpo.slice(0,1024)},action:{button:btn.slice(0,20),sections:[{title:titulo.slice(0,24),rows:opts.map(o=>{const r={id:o[0],title:o[1].slice(0,24)}; if(o[2])r.description=o[2].slice(0,72); return r;})}]}}});
const boton=(to,cuerpo,opts)=>({messaging_product:'whatsapp',to,type:'interactive',interactive:{type:'button',body:{text:cuerpo.slice(0,1024)},action:{buttons:opts.map(o=>({type:'reply',reply:{id:o[0],title:o[1].slice(0,20)}}))}}});
function elige(opts){
  if(id){const o=opts.find(x=>x[0]===id);if(o)return o;}   // tocó una opción (id exacto)
  if(texto){const t=texto.toLowerCase();const o=opts.find(x=>{const l=x[1].toLowerCase().replace(/[^a-záéíóúñ0-9 \/]/g,'').trim();const k=l.split(' /')[0].split(' (')[0].trim();return t===l||t===k||(k.length>2&&t.includes(k));});if(o)return o;}
  return null;
}
// round-robin: devuelve el siguiente de la lista y avanza el contador persistente
function rota(key,arr){ const c=store.rot[key]||0; store.rot[key]=c+1; return arr[c%arr.length]; }
// tipos de adjunto (media) traducidos a español
const MTYPE_ES = {image:'una imagen',audio:'una nota de voz',video:'un video',document:'un documento',sticker:'una imagen (sticker)',location:'una ubicación',contacts:'un contacto'};

const now=new Date(); const colH=(now.getUTCHours()+19)%24;
let saludo='Buenas noches', emoji='🌙';
if(colH>=5&&colH<12){saludo='Buenos días';emoji='☀️';}
else if(colH>=12&&colH<18){saludo='Buenas tardes';emoji='👋';}

// === HORARIO LABORAL + FESTIVOS (hora Colombia UTC-5) ===
const col=new Date(now.getTime()-5*3600*1000); const dow=col.getUTCDay(); const hm=col.getUTCHours()*60+col.getUTCMinutes(); // dow:0=Dom..6=Sáb
const f2 = n => String(n).padStart(2,'0');
const ymd = d2 => d2.getUTCFullYear()+'-'+f2(d2.getUTCMonth()+1)+'-'+f2(d2.getUTCDate());
// Festivos de Colombia CALCULADOS por año (fijos + Ley Emiliani trasladables + basados en Pascua) -> se auto-actualizan, sin mantenimiento anual.
function festivosCol(y){
  const S=new Set(); const D=(mo,da)=>new Date(Date.UTC(y,mo-1,da));
  const lun=dt=>{ const dw=dt.getUTCDay(); return new Date(dt.getTime()+((8-dw)%7)*86400000); };   // traslada al lunes siguiente (Emiliani)
  [[1,1],[5,1],[7,20],[8,7],[12,8],[12,25]].forEach(a=>S.add(ymd(D(a[0],a[1]))));                    // fijos
  [[1,6],[3,19],[6,29],[8,15],[10,12],[11,1],[11,11]].forEach(a=>S.add(ymd(lun(D(a[0],a[1])))));     // trasladables al lunes
  const a=y%19,b=Math.floor(y/100),c=y%100,dd=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-dd-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,mm=Math.floor((a+11*h+22*l)/451),mes=Math.floor((h+l-7*mm+114)/31),dia=((h+l-7*mm+114)%31)+1; // Domingo de Pascua (Butcher/Meeus)
  const P=new Date(Date.UTC(y,mes-1,dia)); const rel=n=>new Date(P.getTime()+n*86400000);
  [-3,-2,43,64,71].forEach(n=>S.add(ymd(rel(n))));   // Jueves/Viernes Santo, Ascensión, Corpus Christi, Sagrado Corazón
  return S;
}
const FESTIVOS = festivosCol(col.getUTCFullYear());
const esFestivo = FESTIVOS.has(ymd(col));
function proximoHabil(){ // próximo día que NO sea domingo ni festivo (sábado sí es hábil)
  for(let i=1;i<=12;i++){ const dd=new Date(col.getTime()+i*86400000); if(dd.getUTCDay()!==0 && !FESTIVOS.has(ymd(dd))) return {i,dw:dd.getUTCDay()}; }
  return {i:1,dw:1};
}
function horarioMarca(marca){
  if(esFestivo) return {ap:null,ci:null,abierto:false}; // festivo = cerrado
  let ap=null,ci=null; // apertura/cierre en minutos; null = cerrado ese día
  if(marca==='Carpincentro'){ if(dow>=1&&dow<=5){ap=480;ci=1020;} else if(dow===6){ap=480;ci=720;} }
  else { if(dow>=1&&dow<=5){ap=450;ci=1020;} else if(dow===6){ap=480;ci=1020;} }
  return {ap,ci,abierto:(ap!==null&&hm>=ap&&hm<ci)};
}
function avisoHorario(marca){
  const H=horarioMarca(marca); if(H.abierto) return null;
  const horario = (marca==='Carpincentro')
    ? '🕐 *Atendemos:*\nLun–Vie: 8:00 a.m. – 5:00 p.m.\nSáb: 8:00 a.m. – 12:00 m.'
    : '🕐 *Atendemos:*\nLun–Vie: 7:30 a.m. – 5:00 p.m.\nSáb: 8:00 a.m. – 5:00 p.m.';
  let cuando;
  if(!esFestivo && H.ap!==null && hm<H.ap){ cuando='hoy a primera hora'; }
  else { const P=proximoHabil(); cuando=(P.dw===1?'el lunes':(P.i===1?'mañana':'el próximo día hábil'))+' a primera hora'; }
  let cab;
  if(esFestivo) cab='¡Feliz día festivo! 🇨🇴';
  else if(dow===0) cab='¡Feliz domingo! 😊';
  else if(dow===6) cab='¡Feliz fin de semana! ☀️';
  else if(H.ap!==null && hm<H.ap) cab='¡Buen día! ☀️';
  else cab='¡Buenas noches! 🌙';
  const texto2 = cab+' Gracias por escribirnos. 🙌\n\nEn este momento estamos fuera de horario, pero *'+cuando+'* te atendemos con mucho gusto.\n\n'+horario;
  return {texto:texto2,cuando};
}

// === CIERRE reutilizable: enruta con ROTACIÓN y arma la tarjeta al asesor (una sola fuente de verdad) ===
function cerrarLead(st,opts){
  opts=opts||{};
  const mediaNota=opts.mediaNota||'';
  const humanoNota = st.pidioHumano ? '\n🙋 *El cliente pidió hablar con un asesor*' : '';
  if(!st.nombre) st.nombre = d.profileName || 'Cliente';
  let asesor;
  if (st.marca==='Carpincentro'){
    const tiendas = DIR_CARP[st.ciudadId] || [];
    if (tiendas.length){ const t=rota('CARP_'+st.ciudadId,tiendas); asesor={nombre:t.asesor,num:t.num,tienda:'Carpincentro '+t.tienda}; }
    else asesor={nombre:'Equipo Carpincentro',num:'',tienda:'Carpincentro (sin tienda en '+(st.ciudad||'—')+')'};
  } else { // Ardisa: enruta por CIUDAD + grupo, rota dentro del grupo
    const ciu = ARD[st.ciudadId];
    const grupo = st.grupo || 'ACABADOS';
    const interes = st.interes || (grupo==='CONSTRUCCION'?'Construcción':'Acabados');
    const arr = ciu ? (ciu[grupo] || ciu.ACABADOS) : null;
    if (arr && arr.length){ const a=rota('ARD_'+st.ciudadId+'_'+grupo,arr); asesor={nombre:a.asesor,num:a.num,tienda:'Ardisa '+interes+' — '+(st.ciudad||'—')}; }
    else asesor={nombre:'Asesor Ardisa '+interes,num:'',tienda:'Ardisa '+interes+' — '+(st.ciudad||'—')+' (asesor pendiente)'};
    st.interes=interes;
  }
  const numDisp = asesor.num ? ('+'+asesor.num) : '(número pendiente)';
  const destino = MODO_PRUEBA ? PRUEBA_NUM : (asesor.num || PRUEBA_NUM);
  const notaPrueba = MODO_PRUEBA ? ('\n\n🧪 _MODO PRUEBA: este aviso llegó a tu número. En producción iría a '+asesor.nombre+' '+numDisp+'._') : '';
  const lineaClasif = (st.marca==='Ardisa') ? ('🧑‍💼 *Se dedica a:* '+(st.ocupacion||'—')+'\n🛒 *Interés:* '+st.interes) : ('🧑‍💼 *Se dedica a:* '+(st.ocupacion||'—'));
  const notaHorario = st.fuera ? ('\n⏰ *Fuera de horario* — responder '+(st.cuando||'a primera hora')) : '';
  const cierreCliente = st.fuera
    ? ('¡Listo, '+st.nombre+'! ✅ Registré tu solicitud para *'+st.marca+'* en *'+(st.ciudad||'tu ciudad')+'*.\nEstamos fuera de horario, pero un asesor te contactará *'+(st.cuando||'a primera hora')+'* dentro del horario de atención.\n\n¿Hay algo más en lo que te ayude mientras tanto? 😊')
    : ('¡Listo, '+st.nombre+'! ✅ Tus datos ya están con el equipo de *'+st.marca+'* en *'+(st.ciudad||'tu ciudad')+'*.\nUn asesor te contactará *hoy dentro del horario de atención*.\n\n¿Hay algo más en lo que te ayude mientras tanto? 😊');
  const wpp = txt(wa, cierreCliente);
  const aviso = txt(destino,
    '🔔 *NUEVO CLIENTE — Bot WhatsApp*\n\n'+
    '👤 *Nombre:* '+st.nombre+'\n'+
    '📍 *Ciudad:* '+(st.ciudad||'—')+'\n'+
    '🏷️ *Marca:* '+st.marca+'\n'+
    lineaClasif+'\n'+
    '🏬 *Asignado a:* '+asesor.tienda+'\n'+
    '🙋 *Asesor:* '+asesor.nombre+' '+numDisp+'\n'+
    '💬 *Solicitud:* '+(st.tiposol||'Hablar con un asesor')+'\n'+
    '📝 *Detalle:* '+st.detalle+notaHorario+mediaNota+humanoNota+'\n'+
    '📱 *Cliente:* +'+wa+'\n'+
    '💬 *Chatéale ya:* https://wa.me/'+wa+notaPrueba+'\n\n'+
    '👉 Toca el enlace para escribirle directo. 🙌');
  // Persistencia del lead (RED DE SEGURIDAD anti-pérdida): aunque falle el envío a Meta, el lead queda guardado y recuperable en el staticData de n8n. (Se reemplaza por M365 cuando esté el acceso.)
  if(!store.leads) store.leads=[];
  store.leads.push({ts:NOW, wa, nombre:st.nombre, ciudad:(st.ciudad||''), ciudadId:(st.ciudadId||''), marca:st.marca, ocupacion:(st.ocupacion||''), interes:(st.interes||''), tiposol:(st.tiposol||''), detalle:st.detalle, asesor:asesor.nombre, tienda:asesor.tienda, destino:destino, fuera:!!st.fuera});
  if(store.leads.length>2000) store.leads.splice(0, store.leads.length-2000);   // cota
  delete S[wa];
  return {wpp_body:wpp, aviso_body:aviso};
}

const MARCA=[['MAR_ARD','🔵 Ardisa'],['MAR_CARP','🟠 Carpincentro']];
const CIU=[['BUCARAMANGA','Bucaramanga','Santander'],['BOGOTA','Bogotá','Cundinamarca'],['BARRANQUILLA','Barranquilla','Atlántico'],['CARTAGENA','Cartagena','Bolívar'],['BOYACA','Boyacá','Tunja, Duitama, Sogamoso'],['PEREIRA','Pereira','Risaralda'],['CALI','Cali','Valle del Cauca'],['IBAGUE','Ibagué','Tolima'],['OTRA','Otra ciudad','Escríbenos tu ciudad por chat']];
// Ardisa: ocupación (como el formulario) -> define el GRUPO de asesores
const OAR=[['OAR_HOGAR','🏠 Ama de casa','Proyecto para mi hogar'],['OAR_ARQ','📐 Arquitecto','Ingeniero o diseñador'],['OAR_MAESTRO','👷 Maestro de obra','Contratista o pintor'],['OAR_FERRE','🛠️ Ferretero','Punto de venta'],['OAR_EMP','🏢 Empresa','Constructora o empresa']];
const OAR_GRUPO={OAR_HOGAR:'ACABADOS',OAR_ARQ:'ACABADOS',OAR_MAESTRO:'CONSTRUCCION',OAR_FERRE:'CONSTRUCCION',OAR_EMP:'CONSTRUCCION'};
const OCA=[['OCA_CARP','🔨 Carpintero','Fabricante de muebles'],['OCA_DIST','🗄️ Distribuidor','Melaminas o herrajes'],['OCA_CONS','📐 Constructor','Arquitecto o diseñador'],['OCA_HOGAR','🏠 Mi hogar','Proyecto para mi casa']];
const SOL=[['SOL_COT','Cotización'],['SOL_PREG','Pregunta / Info']];   // línea comercial: solo cotización e información

const low=texto.toLowerCase();
const reinicia=['hola','buenas','buenos dias','buenos días','buenas tardes','buenas noches','menu','menú','inicio','reiniciar','empezar','start'].some(w=>low===w);

let st=S[wa]; let wpp_body=null,aviso_body=null,etapa='';
if(st && st.t && (NOW-st.t)>TTL){ st=null; delete S[wa]; }   // sesión expirada -> reinicia
try {
// === Fix 2: ESCAPE A HUMANO (en cualquier paso). Palabra suelta asesor/humano/persona/agente o "0". ===
const pideHumano = !id && !es_media && !reinicia && (low==='0' || /(^|[^a-záéíóúñ])(asesor|asesora|humano|persona|agente)([^a-záéíóúñ]|$)/.test(low));
if(pideHumano){
  if(!st){ st=S[wa]={paso:'marca'}; }
  st.escape=true; st.pidioHumano=true;
  // preserva el mensaje original si trae contenido (no solo la palabra gatillo)
  if(texto && !st.detalle && !/^(asesor|asesora|humano|persona|agente|0)\s*$/i.test(low)){ st.detalle=[...texto].slice(0,300).join(''); }
  if(!st.marca){ st.paso='marca'; etapa='marca';
    wpp_body=boton(wa,'¡Claro! Te comunico con un asesor. 🙌 Solo dime, ¿es para *Ardisa* o *Carpincentro*?',MARCA);
  } else if(!st.ciudadId){ st.paso='ciudad'; etapa='ciudad';
    wpp_body=lista(wa,'¡Claro! Te comunico con un asesor. 🙌 ¿En qué *ciudad* estás? 📍','Ver ciudades','Ciudades',CIU);
  } else {
    if(!st.detalle) st.detalle='(el cliente pidió hablar con un asesor)';
    const R=cerrarLead(st,{}); wpp_body=R.wpp_body; aviso_body=R.aviso_body; etapa='cierre';
  }
} else if(!st||reinicia){
  S[wa]={paso:'marca'}; etapa='marca';
  wpp_body=boton(wa,'¡'+saludo+'! '+emoji+' Te damos la bienvenida a *Grupo Ardisa* 🏗️🪵\n\nCon gusto te ayudamos a encontrar tu asesor ideal. Cuéntanos: *¿qué estás buscando?* 👇\n\n🔵 *Ardisa* — acabados y construcción\n🟠 *Carpincentro* — maderas, melaminas y cocinas\n\n_Si prefieres, escribe ASESOR y te comunicamos enseguida._',MARCA);
} else if(st.paso==='marca'){
  const m=elige(MARCA);
  if(!m){ wpp_body=boton(wa,'Elige una opción para empezar 👇',MARCA); }
  else { st.marca=(m[0]==='MAR_CARP')?'Carpincentro':'Ardisa';
    if(st.escape){
      if(!st.ciudadId){ st.paso='ciudad'; etapa='ciudad'; wpp_body=lista(wa,'Perfecto. ¿En qué *ciudad* estás? 📍','Ver ciudades','Ciudades',CIU); }
      else { if(!st.detalle) st.detalle='(el cliente pidió hablar con un asesor)'; const R=cerrarLead(st,{}); wpp_body=R.wpp_body; aviso_body=R.aviso_body; etapa='cierre'; }
    } else {
      st.paso='nombre'; etapa='nombre';
      const av=avisoHorario(st.marca);
      if(av){ st.fuera=true; st.cuando=av.cuando;
        wpp_body=txt(wa, av.texto+'\n\nDéjanos tus datos y te respondemos '+av.cuando+'. 💬\nPara empezar, ¿cuál es tu *nombre y apellido*? 😊'); }
      else { st.fuera=false;
        wpp_body=txt(wa,'¡Perfecto! 🙌 Para empezar, ¿cuál es tu *nombre y apellido*? 😊'); }
    }
  }
} else if(st.paso==='nombre'){
  // Fix 1 (parte nombre): si llega media, usa el nombre de perfil de WhatsApp en vez de descartar
  if(es_media){ if(d.profileName){ st.nombre=[...d.profileName].slice(0,50).join(''); st.paso='ciudad'; etapa='ciudad'; wpp_body=lista(wa,'¡Un gusto, '+st.nombre+'! 🙌\n¿En qué *ciudad* te encuentras? 📍','Ver ciudades','Ciudades',CIU); } else { etapa='nombre'; wpp_body=txt(wa,'Por favor escríbenos tu *nombre y apellido* en texto 🙂'); } }
  else if(!texto){ etapa='nombre'; wpp_body=txt(wa,'Por favor escríbenos tu *nombre y apellido* en texto 🙂'); }
  else { st.nombre=[...texto].slice(0,50).join(''); st.paso='ciudad'; etapa='ciudad';
  wpp_body=lista(wa,'¡Un gusto, '+st.nombre+'! 🙌\n¿En qué *ciudad* te encuentras? 📍','Ver ciudades','Ciudades',CIU); }
} else if(st.paso==='ciudad'){
  const c=elige(CIU);
  if(!c){ wpp_body=lista(wa,'Por favor elige tu *ciudad* en la lista 👇','Ver ciudades','Ciudades',CIU); }
  else if(c[0]==='OTRA'){ st.ciudadId='OTRA'; st.paso='ciudadOtra'; etapa='ciudadOtra';
    wpp_body=txt(wa,'¡Con gusto! 📍 ¿En qué *ciudad* te encuentras? Escríbela por aquí (ciudad y departamento).'); }
  else { st.ciudad=c[1]; st.ciudadId=c[0];
    if(st.escape){ if(!st.detalle) st.detalle='(el cliente pidió hablar con un asesor)'; const R=cerrarLead(st,{}); wpp_body=R.wpp_body; aviso_body=R.aviso_body; etapa='cierre'; }
    else if(st.marca==='Ardisa'){ st.paso='ocuArd'; etapa='ocuArd';
      wpp_body=lista(wa,'¿A qué te *dedicas*? 🧑‍💼\n_Así te asignamos el asesor ideal._','Elegir opción','Tipo de cliente',OAR); }
    else { st.paso='ocupacion'; etapa='ocupacion';
      wpp_body=lista(wa,'¿A qué te *dedicas*? 🪵\n_Así te asignamos el asesor ideal._','Elegir opción','Tipo de cliente',OCA); } }
} else if(st.paso==='ciudadOtra'){   // capturó "Otra ciudad" -> pedimos la ciudad real por texto (ciudadId sigue 'OTRA' -> sin asesor asignado, pero guardamos la ciudad para el humano)
  if(es_media||!texto){ etapa='ciudadOtra'; wpp_body=txt(wa,'Escríbenos tu *ciudad* en texto, por favor 🙂'); }
  else { st.ciudad=[...texto].slice(0,40).join('');
    if(st.escape){ if(!st.detalle) st.detalle='(el cliente pidió hablar con un asesor)'; const R=cerrarLead(st,{}); wpp_body=R.wpp_body; aviso_body=R.aviso_body; etapa='cierre'; }
    else if(st.marca==='Ardisa'){ st.paso='ocuArd'; etapa='ocuArd';
      wpp_body=lista(wa,'¿A qué te *dedicas*? 🧑‍💼\n_Así te asignamos el asesor ideal._','Elegir opción','Tipo de cliente',OAR); }
    else { st.paso='ocupacion'; etapa='ocupacion';
      wpp_body=lista(wa,'¿A qué te *dedicas*? 🪵\n_Así te asignamos el asesor ideal._','Elegir opción','Tipo de cliente',OCA); } }
} else if(st.paso==='ocuArd'){   // solo Ardisa: la ocupación define el grupo (Acabados/Construcción)
  const o=elige(OAR);
  if(!o){ wpp_body=lista(wa,'Elige una opción de la lista 👇','Elegir opción','Tipo de cliente',OAR); }
  else { st.ocupacion=o[1]; st.grupo=OAR_GRUPO[o[0]]||'ACABADOS'; st.interes=(st.grupo==='CONSTRUCCION')?'Construcción':'Acabados';
    st.paso='tiposol'; etapa='tiposol';
    wpp_body=boton(wa,'¿En qué podemos *ayudarte* hoy? 💬\n\n💰 *Cotización*\nℹ️ *Pregunta / Información*',SOL); }
} else if(st.paso==='ocupacion'){   // solo Carpincentro
  const o=elige(OCA);
  if(!o){ wpp_body=lista(wa,'Elige una opción de la lista 👇','Elegir opción','Tipo de cliente',OCA); }
  else { st.ocupacion=o[1]; st.paso='tiposol'; etapa='tiposol';
    wpp_body=boton(wa,'¿En qué podemos *ayudarte* hoy? 💬\n\n💰 *Cotización*\nℹ️ *Pregunta / Información*',SOL); }
} else if(st.paso==='tiposol'){
  const s=elige(SOL);
  if(!s){ wpp_body=boton(wa,'Elige una opción 👇',SOL); }
  else { st.tiposol=s[1]; st.paso='detalle'; etapa='detalle';
    const msgDet = (s[0]==='SOL_PREG')
      ? '¡Perfecto! ✍️ Escríbenos tu *pregunta* o qué información necesitas.\n_(ej: ¿Tienen porcelanato antideslizante para exteriores?)_'
      : '¡Perfecto! ✍️ Cuéntanos *qué quieres cotizar* (producto, cantidad, medidas). Si no sabes el nombre, ¡mándanos una *foto*! 📷';
    wpp_body=txt(wa,msgDet); }
} else if(st.paso==='detalle'){
  // Fix 1: aceptar media (foto/audio) como lead válido en vez de descartarla
  if(!es_media && !texto){ etapa='detalle'; wpp_body=txt(wa,'¿Nos lo cuentas en *texto* o nos envías una *foto* del producto/color? Así tu asesor lo recibe claro 🙌'); }
  else {
    let mediaNota='';
    if(es_media){ const nm=MTYPE_ES[d.mtype]||'un archivo'; st.detalle='(el cliente envió '+nm+')'; mediaNota='\n📷 *El cliente adjuntó '+nm+'* — ábrela en el chat: https://wa.me/'+wa; }
    else { st.detalle=[...texto].slice(0,300).join(''); }
    const R=cerrarLead(st,{mediaNota}); wpp_body=R.wpp_body; aviso_body=R.aviso_body; etapa='cierre';
  }
} else { delete S[wa]; wpp_body=txt(wa,'Escribe *Hola* para empezar 🙂'); }
} catch(e){
  wpp_body=txt(wa,'Ups, tuvimos un inconveniente 😅. Escribe *Hola* para empezar de nuevo.');
  aviso_body=null; etapa='error'; try{ delete S[wa]; }catch(_){}
}
if(S[wa]) S[wa].t=NOW;   // marca actividad (para el TTL)
return [{json:{etapa,wa_id:wa,wpp_body,aviso_body,hay_aviso:!!aviso_body}}];
"""

def node(name, ntype, tv, params, x, y, extra=None):
    n = {"parameters": params, "name": name, "type": ntype, "typeVersion": tv, "position": [x, y]}
    if extra: n.update(extra)
    return n

def http_send(body_expr):
    # Auth por CREDENCIAL CIFRADA (httpHeaderAuth): el token NO viaja en el JSON.
    return {"method":"POST","url":"=https://graph.facebook.com/v21.0/%s/messages" % PHONE_NUMBER_ID,
        "authentication":"predefinedCredentialType","nodeCredentialType":"httpHeaderAuth",
        "sendHeaders":True,"headerParameters":{"parameters":[
            {"name":"Content-Type","value":"application/json"}]},
        "sendBody":True,"specifyBody":"json","jsonBody":"={{ JSON.stringify(%s) }}" % body_expr,"options":{"timeout":15000}}

nodes = []
nodes.append(node("Verificación (GET)", "n8n-nodes-base.webhook", 2,
    {"httpMethod":"GET","path":PATH,"responseMode":"responseNode","options":{}}, 200, 80, {"webhookId":"f1-verif-ardisa"}))
nodes.append(node("¿Token válido?", "n8n-nodes-base.if", 2,
    {"conditions":{"options":{"caseSensitive":True,"typeValidation":"loose"},"combinator":"and",
     "conditions":[{"id":"c1","leftValue":"={{ $json.query['hub.verify_token'] }}","rightValue":VERIFY_TOKEN,
                    "operator":{"type":"string","operation":"equals"}}]},"options":{}}, 420, 80))
nodes.append(node("Responder challenge", "n8n-nodes-base.respondToWebhook", 1.1,
    {"respondWith":"text","responseBody":"={{ $('Verificación (GET)').item.json.query['hub.challenge'] }}","options":{}}, 660, 40))
nodes.append(node("Responder 403", "n8n-nodes-base.respondToWebhook", 1.1,
    {"respondWith":"text","responseBody":"Token inválido","options":{"responseCode":403}}, 660, 160))
nodes.append(node("Mensajes (POST)", "n8n-nodes-base.webhook", 2,
    {"httpMethod":"POST","path":PATH,"responseMode":"onReceived","responseData":"OK","options":{}}, 200, 360, {"webhookId":"f1-msg-ardisa"}))
nodes.append(node("Extraer datos", "n8n-nodes-base.code", 2, {"jsCode":CODE_EXTRAER}, 420, 360))
nodes.append(node("¿Es mensaje?", "n8n-nodes-base.if", 2,
    {"conditions":{"options":{"caseSensitive":True,"typeValidation":"loose"},"combinator":"and",
     "conditions":[{"id":"m1","leftValue":"={{ $json.es_mensaje }}","rightValue":True,
                    "operator":{"type":"boolean","operation":"true","singleValue":True}}]},"options":{}}, 640, 360))
nodes.append(node("Fin (no es mensaje)", "n8n-nodes-base.noOp", 1, {}, 860, 480))
nodes.append(node("Cerebro conversacional", "n8n-nodes-base.code", 2, {"jsCode":CODE_CEREBRO}, 860, 320))
nodes.append(node("¿Responder al cliente?", "n8n-nodes-base.if", 2,
    {"conditions":{"options":{"caseSensitive":True,"typeValidation":"loose"},"combinator":"and",
     "conditions":[{"id":"r1","leftValue":"={{ $json.wpp_body ? true : false }}","rightValue":True,
                    "operator":{"type":"boolean","operation":"true","singleValue":True}}]},"options":{}}, 1080, 320))
nodes.append(node("Sin respuesta (dup/vacío)", "n8n-nodes-base.noOp", 1, {}, 1320, 480))
nodes.append(node("Enviar al cliente (Meta)", "n8n-nodes-base.httpRequest", 4.2, http_send("$('Cerebro conversacional').item.json.wpp_body"), 1320, 300, {"onError":"continueRegularOutput","retryOnFail":True,"maxTries":3,"waitBetweenTries":1500,"credentials":{"httpHeaderAuth":{"id":WPP_CRED_ID,"name":WPP_CRED_NAME}}}))
nodes.append(node("¿Hay aviso al asesor?", "n8n-nodes-base.if", 2,
    {"conditions":{"options":{"caseSensitive":True,"typeValidation":"loose"},"combinator":"and",
     "conditions":[{"id":"a1","leftValue":"={{ $('Cerebro conversacional').item.json.hay_aviso }}","rightValue":True,
                    "operator":{"type":"boolean","operation":"true","singleValue":True}}]},"options":{}}, 1540, 320))
nodes.append(node("Avisar al asesor (Meta)", "n8n-nodes-base.httpRequest", 4.2, http_send("$('Cerebro conversacional').item.json.aviso_body"), 1760, 280, {"onError":"continueRegularOutput","retryOnFail":True,"maxTries":3,"waitBetweenTries":1500,"credentials":{"httpHeaderAuth":{"id":WPP_CRED_ID,"name":WPP_CRED_NAME}}}))
nodes.append(node("Nota", "n8n-nodes-base.stickyNote", 1,
    {"content":"### Bot WhatsApp Ardisa — FASE 1 (conversacional moderno)\nSaluda por hora → MARCA (Ardisa/Carpincentro) → nombre → ciudad →\n· Ardisa: producto (Acabados/Construcción) → rota entre 3 asesores del grupo\n· Carpincentro: ocupación → rota entre las tiendas de la ciudad\n→ solicitud → detalle → RESUMEN al asesor (rotación justa). Acepta texto y foto. Escape a humano (ASESOR). $0.","height":170,"width":560}, 760, 20))

connections = {
 "Verificación (GET)": {"main":[[{"node":"¿Token válido?","type":"main","index":0}]]},
 "¿Token válido?": {"main":[[{"node":"Responder challenge","type":"main","index":0}],[{"node":"Responder 403","type":"main","index":0}]]},
 "Mensajes (POST)": {"main":[[{"node":"Extraer datos","type":"main","index":0}]]},
 "Extraer datos": {"main":[[{"node":"¿Es mensaje?","type":"main","index":0}]]},
 "¿Es mensaje?": {"main":[[{"node":"Cerebro conversacional","type":"main","index":0}],[{"node":"Fin (no es mensaje)","type":"main","index":0}]]},
 "Cerebro conversacional": {"main":[[{"node":"¿Responder al cliente?","type":"main","index":0}]]},
 "¿Responder al cliente?": {"main":[[{"node":"Enviar al cliente (Meta)","type":"main","index":0}],[{"node":"Sin respuesta (dup/vacío)","type":"main","index":0}]]},
 "Enviar al cliente (Meta)": {"main":[[{"node":"¿Hay aviso al asesor?","type":"main","index":0}]]},
 "¿Hay aviso al asesor?": {"main":[[{"node":"Avisar al asesor (Meta)","type":"main","index":0}],[]]},
}

wf = {"id":"botArdisaFase1x","name":"Bot WhatsApp Ardisa - FASE 1 (Menús)",
 "nodes":nodes,"connections":connections,"active":False,"settings":{"executionOrder":"v1"}}
_serialized = json.dumps(wf, ensure_ascii=False, indent=2)
# Guard: el token NUNCA debe quedar embebido en el JSON (debe ir por credencial cifrada).
if "Bearer EAA" in _serialized or ("Bearer %s" % TOKEN) in _serialized:
    sys.exit("ABORT: el token quedó embebido en el JSON — debe ir por credencial cifrada, no en claro.")
_out = "/home/ubuntu/whatsapp-ardisa/workflow-bot-f1.json"
open(_out,"w").write(_serialized)
os.chmod(_out, 0o600)   # defensa en profundidad
print("OK nodos:", len(nodes), "| auth: credencial cifrada (sin token en el JSON) | chmod 600")
