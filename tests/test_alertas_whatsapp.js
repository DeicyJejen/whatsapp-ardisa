const fs=require('fs');
const ARMAR=fs.readFileSync(__dirname+'/n_armar.js','utf8'), CONF=fs.readFileSync(__dirname+'/n_confirmar.js','utf8');
function run(code,input,otros){ const $=(n)=>({first:()=>({json:(otros&&otros[n])||{}})});
  const $input={first:()=>({json:input})}; return new Function('$','$input',code)($,$input); }
const casos=[
 ['Hay 2 alertas -> arma mensaje', ARMAR, {max_id:5,n:2,det:'1|Cliente X perdido~~2|Asesor Y sin reportar'}, null, r=>r.length===1 && /\*ALERTAS DEL BOT\* \(2\)/.test(r[0].json.msg.text.body) && /🔴/.test(r[0].json.msg.text.body) && r[0].json.msg.to==='573205662947'],
 ['Sin alertas -> NO manda nada',   ARMAR, {max_id:null,n:0,det:null}, null, r=>r.length===0],
 ['BD con error -> NO manda nada',  ARMAR, {error:'ECONNREFUSED'},     null, r=>r.length===0],
 ['BD vacia -> NO manda nada',      ARMAR, {},                          null, r=>r.length===0],
 ['Meta confirmo -> marca avisadas',CONF,  {messages:[{id:'wamid.X'}]}, {'Armar aviso a Deicy':{max_id:5}}, r=>r.length===1 && r[0].json.max_id===5],
 ['Meta rechazo -> NO marca (reintenta)',CONF,{error:{message:'ventana cerrada'}}, {'Armar aviso a Deicy':{max_id:5}}, r=>r.length===0],
];
let ok=0;
for(const [n,code,inp,otros,check] of casos){
  let r,pasa; try{ r=run(code,inp,otros); pasa=check(r); }catch(e){ r='EXCEPCION '+e.message; pasa=false; }
  if(pasa) ok++; console.log((pasa?'  OK  ':'  FALLA')+' | '+n);
}
console.log('\n'+ok+'/'+casos.length+' pruebas pasan'); process.exit(ok===casos.length?0:1);
