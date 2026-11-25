{
// ============ configuración y utilidades ============
const CFG=Object.assign({appName:'FinGlory',backend:'firebase',firebase:{},supabaseUrl:'',supabaseAnonKey:''},window.APP_CONFIG||{});
let fdb=null,fauth=null;
const clean=o=>JSON.parse(JSON.stringify(o));
const userDocs=()=>fdb.collection('fg_users').doc(user.uid).collection('docs');
const GASTOS=['Comida','Transporte y gasolina','Casa y servicios','Celular e internet','Familia','Diezmo y ofrendas','Universidad','Salud','Seguros','Ropa y cuidado personal','Salidas y entretenimiento','Suscripciones','Comisiones bancarias','Otros'];
const INGRESOS=['Salario','Trabajo extra','Liquidación','Otros ingresos'];
const ESENCIALES=new Set(['Casa y servicios','Celular e internet','Familia','Diezmo y ofrendas','Universidad','Salud','Seguros','Transporte y gasolina']);
const PRESETS=['Fondo de emergencia','Auto','Celular nuevo','Computadora','Vacaciones'];
const DEFAULT_SPLIT=[{name:'Metas con propósito',pct:20},{name:'Gastos fijos',pct:50},{name:'Gastos del mes',pct:30}];
const ANT=10;
const MESES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>(n<0?'-':'')+'$'+Math.abs(Number(n)||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const num=v=>{const n=parseFloat(String(v??'').replace(/[^0-9.\-]/g,''));return isFinite(n)?Math.round(n*100)/100:NaN};
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const pad=n=>String(n).padStart(2,'0');
const today=()=>{const d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
const ymAdd=(ym,k)=>{const[y,m]=ym.split('-').map(Number);const d=new Date(y,m-1+k,1);return d.getFullYear()+'-'+pad(d.getMonth()+1)};
const ymDiff=(a,b)=>{const[y1,m1]=a.split('-').map(Number),[y2,m2]=b.split('-').map(Number);return(y2-y1)*12+(m2-m1)};
const ymLabel=ym=>{const[y,m]=ym.split('-').map(Number);return MESES[m-1]+' '+y};
const cap=s=>s.replace(/^./,c=>c.toUpperCase());
const titleCase=s=>String(s).toLowerCase().replace(/(^|[\s\/(])([a-záéíóúñ])/g,(m,a,b)=>a+b.toUpperCase());
const hash=s=>{let h=5381;for(const c of s)h=(h*33^c.charCodeAt(0))>>>0;return h.toString(36)};
const sumAmt=a=>a.reduce((s,t)=>s+(Number(t.amount)||0),0);
const norm=s=>String(s??'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
const opts=l=>l.map(c=>`<option>${esc(c)}</option>`).join('');
document.querySelectorAll('.appname').forEach(e=>e.textContent=CFG.appName);document.title=CFG.appName;
new MutationObserver(()=>{for(const c of document.querySelectorAll('.stack td:not([data-l])')){let i=0,p=c;while(p=p.previousElementSibling)i+=p.colSpan;c.dataset.l=c.closest('table').rows[0].cells[i]?.textContent||''}}).observe(document.body,{childList:true,subtree:true});

// ============ estado ============
const EMPTY=()=>({tx:[],goal:[],fixed:[],wish:[],budgets:{},split:null,analysis:null,rules:null,settings:null});
let S=EMPTY();
let mode=null,sb=null,user=null,type='gasto',editing=false,last=null,toastT=null,pending=null,splitDraft=null,imports=null,lastIncome=0,openCat=null;
let month=today().slice(0,7);

// ============ almacenamiento: Supabase o este dispositivo ============
const LKEY='misfinanzas.demo.v1';
const setStatus=t=>{const e=$('acstatus');if(e)e.textContent=t};
function fromDocs(list){
  const s=EMPTY();
  for(const d of list){if(!d||typeof d!=='object')continue;
    if(['tx','goal','fixed','wish'].includes(d.kind))s[d.kind].push(d);
    else if(d.kind==='budgets')s.budgets=Object.assign({},d.map||{});
    else if(['split','analysis','rules','settings'].includes(d.kind))s[d.kind]=d;}
  return s;
}
function allDocs(){const out=[...S.tx,...S.goal,...S.fixed,...S.wish,{kind:'budgets',id:'budgets',map:S.budgets}];for(const k of['split','analysis','rules','settings'])if(S[k])out.push(Object.assign({},S[k],{kind:k,id:k}));return out}
const saveLocal=()=>{try{localStorage.setItem(LKEY,JSON.stringify(allDocs()))}catch(e){}};
const loadLocal=()=>{try{const d=JSON.parse(localStorage.getItem(LKEY)||'[]');S=fromDocs(Array.isArray(d)?d:[])}catch(e){S=EMPTY()}};
async function loadCloud(){
  if(fdb){const snap=await userDocs().get();S=fromDocs(snap.docs.map(d=>d.data()));lastLoad=Date.now();return}
  const rows=[];
  for(let from=0;;from+=1000){const{data,error}=await sb.from('fg_docs').select('data').range(from,from+999);if(error)throw error;rows.push(...data.map(r=>r.data));if(data.length<1000)break}
  S=fromDocs(rows);lastLoad=Date.now();
}
let lastLoad=0;
const cloudErr=e=>toast(/quota|limit|resource-exhausted/i.test(String(e&&(e.code||e.message)))?'Se llenó el límite gratis de la base de datos por hoy.':'No se pudo guardar. Revisa tu conexión.');
async function put(doc){
  if(mode!=='cloud'){saveLocal();return}
  if(fdb){try{await userDocs().doc(doc.id).set(clean(doc))}catch(e){cloudErr(e)}return}
  const{error}=await sb.from('fg_docs').upsert({user_id:user.id,id:doc.id,kind:doc.kind,data:doc,updated_at:new Date().toISOString()},{onConflict:'user_id,id'});
  if(error)cloudErr(error);
}
async function putMany(docs){
  if(mode!=='cloud'){saveLocal();return true}
  for(let i=0;i<docs.length;i+=400){
    if(fdb){try{const b=fdb.batch();for(const d of docs.slice(i,i+400))b.set(userDocs().doc(d.id),clean(d));await b.commit()}catch(e){cloudErr(e);return false}continue}
    const{error}=await sb.from('fg_docs').upsert(docs.slice(i,i+400).map(d=>({user_id:user.id,id:d.id,kind:d.kind,data:d,updated_at:new Date().toISOString()})),{onConflict:'user_id,id'});
    if(error){cloudErr(error);return false}}
  return true;
}
async function drop(id){if(mode!=='cloud'){saveLocal();return}
  if(fdb){try{await userDocs().doc(id).delete()}catch(e){toast('No se pudo borrar.')}return}
  const{error}=await sb.from('fg_docs').delete().eq('id',id);if(error)toast('No se pudo borrar.')}
function upsert(doc,quiet){const arr=S[doc.kind];const i=arr.findIndex(x=>x.id===doc.id);i<0?arr.push(doc):arr[i]=doc;if(!quiet)render();return put(doc)}
function remove(kind,id,msg){const arr=S[kind];const i=arr.findIndex(x=>x.id===id);if(i<0)return;last=arr[i];arr.splice(i,1);render();drop(id);toast(msg||'Eliminado',true)}
function setSingle(kind,val){S[kind]=Object.assign({},val,{kind,id:kind});render();return put(S[kind])}
function toast(m,undo){$('tmsg').textContent=m;$('undo').hidden=!undo;$('toast').classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>$('toast').classList.remove('on'),6000)}

// ============ cálculos ============
const ofMonth=ym=>S.tx.filter(t=>String(t.date||'').slice(0,7)===ym);
function totals(ym){
  let inc=0,out=0,sav=0;const by={};
  for(const t of ofMonth(ym)){const a=Number(t.amount)||0;
    if(t.type==='ingreso')inc+=a;else if(t.type==='ahorro')sav+=a;else{out+=a;by[t.cat]=(by[t.cat]||0)+a}}
  return{inc,out,sav,by,avail:inc-out-sav};
}
const goalSaved=g=>sumAmt(S.tx.filter(t=>t.type==='ahorro'&&t.goal===g.id));
const fxId=(f,ym)=>'fx-'+f.id+'-'+ym;
const fixedPending=ym=>S.fixed.filter(f=>!S.tx.some(t=>t.id===fxId(f,ym)));
function goalPlan(g){
  const rest=Math.max(0,(Number(g.target)||0)-goalSaved(g));
  if(!rest)return{done:true};
  if(!g.deadline)return null;
  const n=ymDiff(today().slice(0,7),g.deadline)+1;
  if(n<1)return{late:true,rest};
  return{rest,months:n,perMonth:rest/n,perQ:rest/n/2};
}

// ============ tips y alternativas ============
const TIPS={
'Comida':['Lleva almuerzo de casa al menos 2 o 3 días de la semana.','Haz una lista antes del súper y no vayas con hambre.','Si comes fuera, elige el plato del día en vez de pedir a la carta.','Cocina doble el domingo y congela porciones para la semana.'],
'Transporte y gasolina':['Si puedes, combina metro y metrobús en vez de taxi en las rutas que repites.','Comparte el taxi o el carro con alguien que va para el mismo lado.','Agrupa tus diligencias en un solo viaje.','Recarga la tarjeta del metro una vez a la semana con un monto fijo.'],
'Salidas y entretenimiento':['Busca planes gratis: parques, la Cinta Costera, actividades de tu comunidad.','Ve al cine en días de promoción y come antes de entrar.','Pon un monto fijo para salidas cada quincena y paga solo con eso.','Invita a tus amigos a casa en vez de salir a comer.'],
'Ropa y cuidado personal':['Espera 7 días antes de comprar ropa: anótala en tu lista de deseos.','Revisa tu clóset antes de comprar: ¿ya tienes algo parecido?','Compra en temporada de rebajas lo que de verdad necesitas.'],
'Suscripciones':['Quédate con una plataforma a la vez y rota cada mes.','Revisa qué apps te cobran y cancela las que no usaste el mes pasado.','Comparte un plan familiar si la plataforma lo permite.'],
'Celular e internet':['Revisa si un plan más pequeño te alcanza: mira cuántos datos usas de verdad.','Usa wifi en casa y en el trabajo para gastar menos datos.'],
'Casa y servicios':['Desconecta lo que no usas y apaga el aire cuando sales.','Compara precios antes de comprar cosas de la casa; muchas pueden esperar.'],
'Salud':['Pregunta en la farmacia por la versión genérica del medicamento.','La salud no es donde recortar: mejor ajusta en otra categoría.'],
'Universidad':['Pregunta por libros usados o en PDF en la biblioteca.','Comparte copias y materiales con tus compañeros.'],
'Familia':['Acuerda con tu familia un monto fijo al mes; así ayudas sin desordenarte.','Ayudar está bien: ponlo en tu reparto del salario para que no te sorprenda.'],
'Diezmo y ofrendas':['Sepáralo apenas cobras, en tu reparto del salario, para que no compita con otros gastos.'],
'Seguros':['Revisa una vez al año si tu seguro sigue cubriendo lo que necesitas.'],
'Comisiones bancarias':['Usa los cajeros de tu propio banco para no pagar comisión.','Pregunta en tu banco si hay una cuenta sin cargo de manejo.'],
'Otros':['Ponle una nota a cada Yappy para saber después en qué fue.','Si no sabes en qué fue, es una señal: anota tus gastos el mismo día.']};
const KW=[[/caf|coffee|starbucks/i,['Prepara café en casa o llévalo en un termo.','Deja el café de la calle para 1 o 2 días a la semana, como un gusto.']],[/cine|cinepolis/i,['Ve en día de promoción y come antes de entrar.','Deja la dulcería: suele costar más que la entrada.']],[/pedidos|uber ?eats|delivery|appetito|glovo/i,['Recoge tú el pedido para ahorrarte el envío y la propina.','Ten una comida rápida congelada en casa para los días de antojo.']],[/uber|indriver|cabify|taxi/i,['Compara con metro o metrobús en las rutas que repites.','Comparte el viaje con alguien que va para tu lado.']],[/g2g|steam|playstation|xbox|nintendo/i,['Ponte un tope mensual para juegos y compras dentro de juegos.','Espera las ofertas de temporada antes de comprar.']]];
const tipsFor=(cat,n,desc)=>{const kw=desc&&KW.find(k=>k[0].test(desc));if(kw)return kw[1].slice(0,n);const l=(TIPS[cat]||TIPS['Otros']).slice();for(let i=l.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[l[i],l[j]]=[l[j],l[i]]}return l.slice(0,n)};
const overCount=(cat,ym)=>S.tx.filter(t=>t.over&&t.cat===cat&&String(t.date).slice(0,7)===ym).length;
function roomElsewhere(cat,ym,need){const T=totals(ym);let best=null;
  for(const c of GASTOS){if(c===cat||!S.budgets[c])continue;const room=S.budgets[c]-(T.by[c]||0);if(room>=need&&(!best||room>best.room))best={c,room}}return best}

// ============ pintar la app ============
function render(){
  $('mlabel').textContent=cap(ymLabel(month));
  renderTop();renderList();renderFixed();renderSplit();renderGoals();renderWishes();renderAnts();renderTips();renderHist();renderAnalysis();renderAccount();
}
function renderTop(){
  const T=totals(month);
  $('avail').textContent=money(T.avail);$('tin').textContent=money(T.inc);$('tout').textContent=money(T.out);$('tsave').textContent=money(T.sav);
  const pf=sumAmt(fixedPending(month));
  $('free').textContent=S.fixed.length?(pf?`Gastos fijos por pagar: ${money(pf)} · Libre de verdad: ${money(T.avail-pf)}`:'Todos los gastos fijos del mes están registrados.'):'Agrega tus gastos fijos para ver cuánto te queda libre de verdad.';
  const cats=editing?GASTOS.slice():GASTOS.filter(c=>T.by[c]||S.budgets[c]);
  const max=Math.max(1,...cats.map(c=>Math.max(T.by[c]||0,S.budgets[c]||0)));
  $('editb').textContent=editing?'Listo':'Editar presupuestos';
  $('catnote').textContent=editing?'Escribe cuánto quieres gastar al mes en cada categoría. Deja vacío para no tener límite.':'La raya gris marca el presupuesto. Amarillo: ya usaste el 80%. Rojo: te pasaste.';
  $('bars').innerHTML=cats.length?cats.sort((a,b)=>(T.by[b]||0)-(T.by[a]||0)).map(c=>{
    const s=T.by[c]||0,b=S.budgets[c]||0,over=b&&s>b,warn=b&&!over&&s>=b*.8;
    const val=editing?`<input data-b="${esc(c)}" inputmode="decimal" value="${b||''}" placeholder="Sin límite" aria-label="Presupuesto ${esc(c)}">`
      :`<span class="v"><b>${money(s)}</b>${b?` de ${money(b)}`:''}${over?` <span class="o">+${money(s-b)}</span>`:''}${warn?` <span class="w">${Math.round(s/b*100)}%</span>`:''}</span>`;
    return `<div class="row"><span class="n">${esc(c)}</span><div class="track"><div class="fill${over?' over':warn?' warn':''}" style="width:${Math.min(100,s/max*100)}%"></div>${b?`<div class="mark" style="left:calc(${b/max*100}% - 1px)"></div>`:''}</div>${val}</div>`;
  }).join(''):'<p class="empty">Todavía no hay gastos este mes. Registra el primero o analiza tu estado de cuenta, y aquí verás en qué se va tu dinero.</p>';
}
function renderList(){
  const q=$('q').value.trim().toLowerCase(),fc=$('fc').value;
  const rows=ofMonth(month).filter(t=>(!fc||t.cat===fc)&&(!q||String(t.desc||'').toLowerCase().includes(q)||String(t.cat).toLowerCase().includes(q)))
    .sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.id).localeCompare(String(a.id)));
  $('list').innerHTML=rows.length?`<table class="stack"><thead><tr><th>Fecha</th><th>Descripción</th><th>Categoría</th><th class="m">Monto</th><th></th></tr></thead><tbody>${rows.map(t=>{
    const d=String(t.date).slice(8,10)+'/'+String(t.date).slice(5,7);
    return `<tr><td>${esc(d)}</td><td>${esc(t.desc||'—')}</td><td>${esc(t.cat)}</td><td class="m${t.type==='ingreso'?' in':''}">${t.type==='ingreso'?'+':'-'}${money(t.amount)}</td><td><button class="x" data-del="${esc(t.id)}">Eliminar</button></td></tr>`}).join('')}</tbody></table>`
    :`<p class="empty">${q||fc?'Nada coincide con la búsqueda.':'No hay movimientos en '+esc(ymLabel(month))+'.'}</p>`;
}
function renderFixed(){
  if(!S.fixed.length){$('fixedlist').innerHTML='<p class="empty">Aún no tienes gastos fijos. Ejemplos: alquiler, plan del celular, internet, universidad, suscripciones.</p>';return}
  const list=S.fixed.slice().sort((a,b)=>(a.day||0)-(b.day||0));
  const pend=fixedPending(month);
  $('fixedlist').innerHTML=`<table class="stack"><thead><tr><th>Día</th><th>Gasto</th><th>Categoría</th><th class="m">Monto</th><th>Estado en ${esc(MESES[Number(month.slice(5))-1])}</th><th></th></tr></thead><tbody>${list.map(f=>{
    const done=!pend.includes(f);
    return `<tr><td>${esc(f.day)}</td><td>${esc(f.name)}</td><td>${esc(f.cat)}</td><td class="m">${money(f.amount)}</td><td>${done?'<span class="ok">Registrado</span>':`<button class="x pri" data-fx="${esc(f.id)}">Registrar pago</button>`}</td><td><button class="x" data-dfx="${esc(f.id)}">Quitar</button></td></tr>`}).join('')}</tbody></table>
  <div class="line"><span class="sub" style="flex:1 1 200px">Total fijo al mes: <b>${money(sumAmt(S.fixed))}</b>${pend.length?` · Pendiente: <b>${money(sumAmt(pend))}</b>`:''}</span>${pend.length>1?'<button id="fxall">Registrar todos los pendientes</button>':''}</div>`;
}
function renderSplit(){
  if(!splitDraft)splitDraft=JSON.parse(JSON.stringify((S.split&&S.split.rules)||DEFAULT_SPLIT));
  const base=num($('samt').value),amt=base>0?base:0;
  const tot=splitDraft.reduce((s,r)=>s+(Number(r.pct)||0),0);
  $('splitrows').innerHTML=splitDraft.map((r,i)=>`<div class="split"><span>${esc(r.name)}</span><input class="pct" data-sp="${i}" inputmode="decimal" value="${esc(r.pct)}" aria-label="Porcentaje ${esc(r.name)}"><span class="m">${amt?money(amt*(Number(r.pct)||0)/100):'—'}</span><button class="x" data-sdel="${i}" aria-label="Quitar ${esc(r.name)}">✕</button></div>`).join('')
    +`<div class="split" style="border:0"><b>Total</b><b class="pct m ${Math.abs(tot-100)<.01?'ok':'o'}">${Math.round(tot*100)/100}%</b><span></span><span></span></div>`;
  $('sstatus').textContent=Math.abs(tot-100)<.01?'':'Los porcentajes suman '+(Math.round(tot*100)/100)+'%. Ajústalos para que sumen 100%.';
  const T=totals(month);
  $('snote').textContent=amt?(lastIncome===amt?'Este es tu último ingreso registrado.':''):(T.inc?`Escribe un monto, o usa tus ingresos de ${ymLabel(month)}: ${money(T.inc)}.`:'Escribe el monto de tu salario o quincena.');
}
function renderGoals(){
  $('goals').innerHTML=S.goal.length?S.goal.slice().sort((a,b)=>String(a.id).localeCompare(String(b.id))).map(g=>{
    const saved=goalSaved(g),pct=g.target>0?Math.min(100,saved/g.target*100):0,pl=goalPlan(g);
    const plan=!pl?'Ponle fecha para saber cuánto apartar por quincena.'
      :pl.done?'<span class="ok">¡Meta cumplida!</span>'
      :pl.late?'<span class="o">La fecha ya pasó.</span> Elige una nueva para recalcular.'
      :`Aparta <b>${money(pl.perQ)}</b> por quincena (${money(pl.perMonth)} al mes) para lograrla en ${esc(ymLabel(g.deadline))}.`;
    return `<div class="card"><h3>${esc(g.name)}</h3>${g.why?`<p class="why">Para ${esc(String(g.why).replace(/^para\s+/i,''))}</p>`:''}
    <div class="sub" style="margin-top:6px">${money(saved)} de ${money(g.target)} · faltan ${money(Math.max(0,g.target-saved))}</div>
    <div class="p"><i style="width:${pct}%"></i></div>
    <div class="plan">${plan}</div>
    <div class="line"><label class="sub" style="margin:0;flex:1 1 100%;font-weight:600" for="gd-${esc(g.id)}">Fecha meta</label><input type="month" id="gd-${esc(g.id)}" data-gdate="${esc(g.id)}" value="${esc(g.deadline||'')}"></div>
    <div class="line"><input inputmode="decimal" placeholder="Aporte" data-amt="${esc(g.id)}" aria-label="Aporte a ${esc(g.name)}"${pl&&pl.perQ?` value="${pl.perQ.toFixed(2)}"`:''}><button class="pri" data-ap="${esc(g.id)}">Aportar</button><button data-dg="${esc(g.id)}" aria-label="Eliminar meta">✕</button></div></div>`}).join('')
    :'<p class="empty">Aún no tienes metas. Crea una abajo o toca una sugerencia.</p>';
  const have=new Set(S.goal.map(g=>g.name));
  $('presets').innerHTML=PRESETS.filter(p=>!have.has(p)).map(p=>`<button type="button" data-pre="${esc(p)}">+ ${esc(p)}</button>`).join('');
}
function renderWishes(){
  const now=Date.now(),T=totals(today().slice(0,7));
  const g=S.goal.find(x=>goalPlan(x)&&!goalPlan(x).done&&x.deadline)||S.goal[0];
  $('wishes').innerHTML=S.wish.length?S.wish.slice().sort((a,b)=>a.added-b.added).map(w=>{
    const left=Math.ceil((w.added+w.wait*864e5-now)/864e5),ready=left<=0;
    let impact='';
    if(g){const pl=goalPlan(g);impact=pl&&pl.perMonth?`Equivale a ${(w.price/pl.perMonth).toFixed(1)} meses de aportes a "${esc(g.name)}".`:`Con ese dinero avanzarías ${Math.round(w.price/(g.target||1)*100)}% en "${esc(g.name)}".`}
    else if(T.avail>0)impact=`Es el ${Math.round(w.price/T.avail*100)}% de tu disponible de este mes.`;
    return `<div class="card"><h3>${esc(w.name)}</h3><div class="stat" style="margin-top:6px">${money(w.price)}</div>
    <div class="plan">${ready?'<b>Ya pasó la espera.</b> ¿Todavía lo quieres?':`Espera <b>${left} día${left===1?'':'s'}</b> más antes de decidir.`}${impact?'<br>'+impact:''}</div>
    <div class="line"><button class="pri" data-wbuy="${esc(w.id)}"${ready?'':' disabled'}>Lo compré</button><button data-wno="${esc(w.id)}">Ya no lo quiero</button></div></div>`}).join('')
    :'<p class="empty">Nada en la lista. La próxima vez que te antoje algo caro, anótalo aquí primero.</p>';
}
function renderAnts(){
  const small=ofMonth(month).filter(t=>t.type==='gasto'&&(Number(t.amount)||0)<ANT&&!String(t.id).startsWith('fx-'));
  if(!small.length){$('ants').innerHTML='<p class="empty">No hay gastos pequeños registrados en este mes.</p>';return}
  const groups={};for(const t of small){const k=(String(t.desc||'').trim().toLowerCase()||t.cat);(groups[k]=groups[k]||{name:t.desc||t.cat,n:0,sum:0}).n++;groups[k].sum+=Number(t.amount)||0}
  const top=Object.values(groups).sort((a,b)=>b.sum-a.sum).slice(0,6);
  const tot=sumAmt(small),max=Math.max(...top.map(g=>g.sum));
  $('ants').innerHTML=`<div class="line" style="gap:24px 48px;margin:0 0 12px"><div><div class="sub">Este mes</div><div class="stat">${money(tot)}</div><div class="sub">en ${small.length} gastos pequeños</div></div><div><div class="sub">En un año serían</div><div class="stat o">${money(tot*12)}</div></div></div>
  ${top.map(g=>`<div class="row"><span class="n">${esc(g.name)}</span><div class="track"><div class="fill warn" style="width:${g.sum/max*100}%"></div></div><span class="v"><b>${money(g.sum)}</b> · ${g.n} ${g.n===1?'vez':'veces'}</span></div>`).join('')}`;
}
function renderTips(){
  const T=totals(month),txs=ofMonth(month).filter(t=>t.type==='gasto'),cards=[];
  for(const c of GASTOS){const b=S.budgets[c],sp=T.by[c]||0;if(!b||sp<b*.8)continue;const n=overCount(c,month);
    cards.push({w:sp/b+(n?1:0),t:sp>b?`Te pasaste ${money(sp-b)} en ${c}`:`Ya usaste ${Math.round(sp/b*100)}% de ${c}`,d:n?`Insististe ${n} ${n===1?'vez':'veces'} aunque el presupuesto no daba.`:'',tips:tipsFor(c,2)})}
  const g={};for(const t of txs){if(!t.desc||/^yappy a /i.test(t.desc))continue;const k=norm(t.desc);(g[k]=g[k]||{name:t.desc,cat:t.cat,n:0,sum:0}).n++;g[k].sum+=Number(t.amount)||0}
  Object.values(g).filter(x=>x.n>=3&&x.sum>=10&&!ESENCIALES.has(x.cat)).sort((a,b)=>b.sum-a.sum).slice(0,3).forEach(x=>cards.push({w:x.sum/50,t:`${x.n} veces en ${x.name}: ${money(x.sum)}`,d:`Si fueras la mitad de veces, te quedarían ${money(x.sum/2)} este mes.`,tips:tipsFor(x.cat,2,x.name)}));
  const ants=txs.filter(t=>(Number(t.amount)||0)<ANT&&!String(t.id).startsWith('fx-'));
  if(ants.length>=15)cards.push({w:sumAmt(ants)/60,t:`${ants.length} gastos pequeños: ${money(sumAmt(ants))}`,d:`Al año serían ${money(sumAmt(ants)*12)}.`,tips:['Ponte un tope semanal para gastos pequeños y llévalo en una sola cuenta.','Antes de cada gasto pequeño pregúntate: ¿lo habría anotado en mi lista?']});
  cards.sort((a,b)=>b.w-a.w);
  $('tiplist').innerHTML=cards.length?cards.slice(0,6).map(c=>`<div class="card"><h3>${esc(c.t)}</h3>${c.d?`<p class="sub">${esc(c.d)}</p>`:''}<div class="alt" style="background:var(--bg)"><b>Alternativas</b><ul>${c.tips.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></div></div>`).join('')
    :'<p class="empty">Cuando tengas gastos y presupuestos este mes, aquí te daré tips sobre dónde repites o te pasas.</p>';
}
function renderHist(){
  const ms=[...Array(6)].map((_,i)=>ymAdd(month,i-5));
  const rows=ms.map(m=>({m,...totals(m)}));
  const max=Math.max(1,...rows.map(r=>Math.max(r.inc,r.out)));
  $('hist').innerHTML=rows.map(r=>{const bal=r.inc-r.out;return `<div class="hrow"><b>${esc(cap(MESES[Number(r.m.slice(5))-1].slice(0,3)))}</b><div class="bars"><div style="width:${r.inc/max*100}%;background:var(--growbar)"></div><div style="width:${r.out/max*100}%;background:var(--bar)"></div></div><span class="nb">${r.inc||r.out?`<span class="${bal>=0?'ok':'o'}">${bal>=0?'+':''}${money(bal)}</span>`:'<span class="sub">sin datos</span>'}</span></div>`}).join('');
}
function renderAccount(){
  $('whoami').textContent=mode==='cloud'?`Entraste como ${user&&user.email||''}. Tus datos se guardan en tu cuenta y solo tú los ves.`:'Estás probando sin cuenta: los datos se guardan solo en este dispositivo. Crea una cuenta para no perderlos y usarlos en tu celular y computadora.';
  if(document.activeElement!==$('bankname'))$('bankname').value=(S.settings&&S.settings.bankName)||'';
  $('logout').textContent=mode==='cloud'?'Cerrar sesión':'Salir del modo prueba';
}

// ============ registrar con alerta de presupuesto ============
function fillCats(){$('cat').innerHTML=opts(type==='gasto'?GASTOS:INGRESOS);document.querySelectorAll('.seg button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.t===type))}
$('fc').innerHTML='<option value="">Todas las categorías</option>'+opts([...GASTOS,...INGRESOS,'Ahorro y metas']);
$('xcat').innerHTML=opts(GASTOS);$('xcat').value='Casa y servicios';
const spentIn=(cat,ym)=>sumAmt(S.tx.filter(t=>t.type==='gasto'&&t.cat===cat&&String(t.date).slice(0,7)===ym));
function addGasto(tx,after){
  const b=tx.type==='gasto'?S.budgets[tx.cat]||0:0;
  if(b){const sp=spentIn(tx.cat,tx.date.slice(0,7));
    if(sp+tx.amount>b){openModal(tx,sp,b,after);return}
    commit(tx,after);
    if(sp+tx.amount>=b*.8)toast(`Ojo: ya usaste ${Math.round((sp+tx.amount)/b*100)}% de ${tx.cat}. Te quedan ${money(b-sp-tx.amount)}.`);
    return}
  commit(tx,after);
}
function commit(tx,after){upsert(tx);if(after)after()}
function openModal(tx,sp,b,after){
  pending={tx,after};
  $('mtitle').textContent=`Te pasas ${money(sp+tx.amount-b)} en ${tx.cat}`;
  $('mbody').textContent=sp>=b?`Ya gastaste ${money(sp)} de ${money(b)} este mes en esta categoría. Este gasto de ${money(tx.amount)} lo dejaría en ${money(sp+tx.amount)}.`:`Te quedan ${money(b-sp)} en esta categoría y este gasto es de ${money(tx.amount)}.`;
  const g=S.goal.find(x=>x.why)||S.goal[0];
  $('mgoal').textContent=g?`Recuerda tu meta "${g.name}"${g.why?': para '+String(g.why).replace(/^para\s+/i,''):''}.`:'';
  const ym=tx.date.slice(0,7),times=overCount(tx.cat,ym),over=sp+tx.amount-b,room=roomElsewhere(tx.cat,ym,over);
  let h=`<div class="alt"><b>${times?`Es la ${times+1}ª vez este mes que te pasas en ${esc(tx.cat)}.`:'Antes de decidir, algunas alternativas:'}</b><ul>${tipsFor(tx.cat,times?3:2,tx.desc).map(t=>`<li>${esc(t)}</li>`).join('')}</ul></div>`;
  if(room)h+=`<div class="alt">En <b>${esc(room.c)}</b> te sobran ${money(room.room)}. Si de verdad lo necesitas, puedes mover ${money(over)} de ahí en vez de pasarte.<div class="acts" style="margin-top:8px"><button id="mmove">Mover ${money(over)} y guardar</button></div></div>`;
  $('mtips').innerHTML=h;pending.room=room;pending.over=over;
  $('modal').classList.add('on');$('mcancel').focus();
}
const closeModal=()=>{$('modal').classList.remove('on');pending=null};
$('mcancel').addEventListener('click',()=>{closeModal();toast('Bien. Ese dinero sigue disponible.')});
$('mok').addEventListener('click',()=>{const p=pending;closeModal();if(p){p.tx.over=true;commit(p.tx,p.after)}});
$('mtips').addEventListener('click',e=>{if(e.target.id!=='mmove'||!pending||!pending.room)return;const p=pending;closeModal();
  const mv=Math.round(p.over*100)/100;S.budgets[p.room.c]=Math.round((S.budgets[p.room.c]-mv)*100)/100;S.budgets[p.tx.cat]=Math.round(((S.budgets[p.tx.cat]||0)+mv)*100)/100;
  put({kind:'budgets',id:'budgets',map:S.budgets});commit(p.tx,p.after);toast(`Moví ${money(mv)} de ${p.room.c} a ${p.tx.cat}.`)});
$('modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&pending)closeModal()});

document.querySelectorAll('.seg button').forEach(b=>b.addEventListener('click',()=>{type=b.dataset.t;fillCats()}));
$('f').addEventListener('submit',e=>{e.preventDefault();
  const a=num($('amt').value);if(!(a>0)){$('amt').focus();return}
  const date=$('date').value||today();
  const tx={kind:'tx',id:uid(),type,amount:a,cat:$('cat').value,desc:$('desc').value.trim().slice(0,120),date};
  const reset=()=>{month=date.slice(0,7);$('amt').value='';$('desc').value='';render();$('amt').focus()};
  if(type==='ingreso'){commit(tx,()=>{lastIncome=a;$('samt').value=a.toFixed(2);reset();toast('Ingreso guardado. Mira en "Reparto del salario" cómo dividirlo.')});return}
  addGasto(tx,reset);
});

// ============ clicks generales ============
document.addEventListener('click',e=>{
  const t=e.target.closest('button');if(!t)return;const d=t.dataset;
  if(d.del)remove('tx',d.del,'Movimiento eliminado');
  else if(d.dg)remove('goal',d.dg,'Meta eliminada');
  else if(d.dfx)remove('fixed',d.dfx,'Gasto fijo quitado');
  else if(d.pre){$('gname').value=d.pre;$('gtarget').focus()}
  else if(d.ap){const g=S.goal.find(x=>x.id===d.ap);const inp=[...document.querySelectorAll('[data-amt]')].find(x=>x.dataset.amt===d.ap);const a=num(inp&&inp.value);
    if(!g||!(a>0)){inp&&inp.focus();return}
    upsert({kind:'tx',id:uid(),type:'ahorro',amount:a,cat:'Ahorro y metas',desc:'Aporte: '+g.name,goal:g.id,date:today().slice(0,7)===month?today():month+'-01'});toast('Aporte de '+money(a)+' guardado')}
  else if(d.fx){const f=S.fixed.find(x=>x.id===d.fx);if(f)registerFixed(f)}
  else if(t.id==='fxall'){const l=fixedPending(month).map(f=>fixedTx(f));for(const x of l)S.tx.push(x);render();putMany(l);toast('Gastos fijos registrados')}
  else if(d.sdel){splitDraft.splice(Number(d.sdel),1);renderSplit()}
  else if(d.wbuy){const w=S.wish.find(x=>x.id===d.wbuy);if(!w)return;
    addGasto({kind:'tx',id:uid(),type:'gasto',amount:w.price,cat:'Otros',desc:w.name,date:today()},()=>{S.wish=S.wish.filter(x=>x.id!==w.id);render();drop(w.id)})}
  else if(d.wno){const w=S.wish.find(x=>x.id===d.wno);if(!w)return;remove('wish',w.id);toast('¡Te ahorraste '+money(w.price)+'! Considera aportarlo a una meta.',true)}
  else if(d.qa!==undefined)answerQ(Number(d.qa),d.qc);
  else if(d.qre!==undefined){const q=imports&&imports.questions[Number(d.qre)];if(q){q.answer=null;renderAnalysis()}}
  else if(d.qmore!==undefined){imports.showAll=true;renderAnalysis()}
  else if(d.acat!==undefined){openCat=openCat===d.acat?null:d.acat;renderAnalysis()}
  else if(d.rdel!==undefined)forgetRule(d.rdel);
  else if(t.id==='applyb'){const pb=currentAnalysis()?.presupuesto||{};for(const c of GASTOS)if(Number(pb[c])>0)S.budgets[c]=Number(pb[c]);put({kind:'budgets',id:'budgets',map:S.budgets});render();toast('Presupuesto actualizado');$('resumen').scrollIntoView?.()}
  else if(t.id==='importb')doImport();
  else if(t.id==='discardb'){imports=null;openCat=null;render()}
});
const fixedTx=f=>{const day=Math.min(Number(f.day)||1,new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate());return{kind:'tx',id:fxId(f,month),type:'gasto',amount:f.amount,cat:f.cat,desc:f.name,fixed:f.id,date:month+'-'+pad(day)}};
function registerFixed(f){upsert(fixedTx(f))}
document.addEventListener('change',e=>{const el=e.target;if(!el.dataset)return;
  if(el.dataset.qs!==undefined&&el.value){answerQ(Number(el.dataset.qs),el.value);return}
  if(el.dataset.qm!==undefined){const q=imports&&imports.questions[Number(el.dataset.qm)];if(q)q.remember=el.checked;return}
  if(el.dataset.it!==undefined){const it=imports&&imports.all[Number(el.dataset.it)];if(it&&el.value){it.cat=el.value;it.manual=true;renderAnalysis()}return}
  if(el.dataset.gdate){const g=S.goal.find(x=>x.id===el.dataset.gdate);if(g)upsert(Object.assign({},g,{deadline:el.value||''}))}
});
$('prev').addEventListener('click',()=>{month=ymAdd(month,-1);render()});
$('next').addEventListener('click',()=>{month=ymAdd(month,1);render()});
$('q').addEventListener('input',renderList);$('fc').addEventListener('change',renderList);
$('editb').addEventListener('click',()=>{if(editing){document.querySelectorAll('[data-b]').forEach(i=>{const v=num(i.value);if(v>0)S.budgets[i.dataset.b]=v;else delete S.budgets[i.dataset.b]});editing=false;render();put({kind:'budgets',id:'budgets',map:S.budgets})}else{editing=true;renderTop()}});
$('gf').addEventListener('submit',e=>{e.preventDefault();const n=$('gname').value.trim().slice(0,60),a=num($('gtarget').value);
  if(!n||!(a>0))return;upsert({kind:'goal',id:uid(),name:n,target:a,deadline:$('gdate').value||'',why:$('gwhy').value.trim().slice(0,140)});['gname','gtarget','gdate','gwhy'].forEach(i=>$(i).value='')});
$('xf').addEventListener('submit',e=>{e.preventDefault();const n=$('xname').value.trim().slice(0,60),a=num($('xamt').value);
  if(!n||!(a>0))return;upsert({kind:'fixed',id:uid(),name:n,amount:a,cat:$('xcat').value,day:Math.max(1,Math.min(31,parseInt($('xday').value)||1))});$('xname').value='';$('xamt').value=''});
$('wf').addEventListener('submit',e=>{e.preventDefault();const n=$('wname').value.trim().slice(0,60),a=num($('wprice').value);
  if(!n||!(a>0))return;upsert({kind:'wish',id:uid(),name:n,price:a,wait:Number($('wwait').value)||7,added:Date.now()});$('wname').value='';$('wprice').value=''});
$('samt').addEventListener('input',renderSplit);
$('splitrows').addEventListener('input',e=>{const i=e.target.dataset.sp;if(i==null)return;splitDraft[Number(i)].pct=num(e.target.value)||0;
  const base=num($('samt').value)||0,tot=splitDraft.reduce((s,r)=>s+(Number(r.pct)||0),0);
  e.target.closest('.split').querySelector('.m').textContent=base?money(base*(splitDraft[Number(i)].pct)/100):'—';
  const tb=$('splitrows').lastElementChild.querySelector('.pct');tb.textContent=(Math.round(tot*100)/100)+'%';tb.className='pct m '+(Math.abs(tot-100)<.01?'ok':'o');
  $('sstatus').textContent=Math.abs(tot-100)<.01?'':'Los porcentajes suman '+(Math.round(tot*100)/100)+'%. Ajústalos para que sumen 100%.'});
$('sadd').addEventListener('click',()=>{const n=$('sname').value.trim().slice(0,40);if(!n){$('sname').focus();return}splitDraft.push({name:n,pct:0});$('sname').value='';renderSplit()});
$('ssave').addEventListener('click',()=>{setSingle('split',{rules:splitDraft.map(r=>({name:r.name,pct:Number(r.pct)||0}))});toast('Porcentajes guardados')});
$('undo').addEventListener('click',()=>{if(last){upsert(last);last=null}$('toast').classList.remove('on')});
$('csv').addEventListener('click',async()=>{
  const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const txt=['Fecha,Tipo,Categoría,Descripción,Monto',...ofMonth(month).sort((a,b)=>String(a.date).localeCompare(String(b.date))).map(t=>[t.date,t.type,t.cat,t.desc,t.amount].map(q).join(','))].join('\n');
  try{await navigator.clipboard.writeText(txt);toast('CSV copiado: pégalo en Excel o Sheets')}catch(err){toast('No se pudo copiar')}
});

// ============ leer el archivo del banco ============
const MABR={ene:1,feb:2,mar:3,abr:4,may:5,jun:6,jul:7,ago:8,sep:9,set:9,oct:10,nov:11,dic:12,jan:1,apr:4,aug:8,dec:12};
function toDate(v){
  if(v instanceof Date&&!isNaN(v))return v.getFullYear()+'-'+pad(v.getMonth()+1)+'-'+pad(v.getDate());
  if(typeof v==='number'&&v>20000&&v<80000){const d=new Date(Math.round((v-25569)*864e5));return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate())}
  const s=norm(v);let m;
  if(m=s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/))return m[1]+'-'+pad(m[2])+'-'+pad(m[3]);
  if(m=s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/)){const y=m[3].length===2?'20'+m[3]:m[3];return y+'-'+pad(m[2])+'-'+pad(m[1])}
  if(m=s.match(/^(\d{1,2})[-\/. ]([a-z]{3})[a-z]*\.?[-\/. ](\d{2,4})/)){const mo=MABR[m[2]];if(mo){const y=m[3].length===2?'20'+m[3]:m[3];return y+'-'+pad(mo)+'-'+pad(m[1])}}
  return null;
}
function toAmt(v){
  if(typeof v==='number')return v;
  let s=String(v??'').trim();if(!s)return NaN;
  const neg=/^\(.*\)$/.test(s)||/-\s*$/.test(s)||/^-|^\$\s*-/.test(s);
  s=s.replace(/[^0-9.,]/g,'');
  if(/,\d{2}$/.test(s)&&!/\.\d{2}$/.test(s))s=s.replace(/\./g,'').replace(',','.');else s=s.replace(/,/g,'');
  const n=parseFloat(s);return isFinite(n)?(neg?-n:n):NaN;
}
function parseCSV(t){
  const first=t.split(/\r?\n/).slice(0,30).join('\n');
  const del=[['\t',(first.match(/\t/g)||[]).length],[';',(first.match(/;/g)||[]).length],[',',(first.match(/,/g)||[]).length]].sort((a,b)=>b[1]-a[1])[0];
  if(!del[1])return[];
  const rows=[];let row=[],cell='',q=false;
  for(let i=0;i<t.length;i++){const c=t[i];
    if(q){if(c==='"'){if(t[i+1]==='"'){cell+='"';i++}else q=false}else cell+=c}
    else if(c==='"')q=true;else if(c===del[0]){row.push(cell);cell=''}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&t[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell=''}
    else cell+=c}
  row.push(cell);rows.push(row);return rows;
}
function rowsToMoves(rows){
  rows=rows.filter(r=>r&&r.some(c=>String(c??'').trim()!==''));
  const h=rows.findIndex(r=>{const n=r.map(norm);return n.some(x=>x.startsWith('fecha'))&&n.some(x=>x.startsWith('monto')||x.startsWith('importe')||x.startsWith('valor'))});
  let iF=0,iM=1,iA=2;
  if(h>=0){const n=rows[h].map(norm);iF=n.findIndex(x=>x.startsWith('fecha'));iA=n.findIndex(x=>x.startsWith('monto')||x.startsWith('importe')||x.startsWith('valor'));
    iM=n.findIndex(x=>x.startsWith('movimiento')||x.startsWith('descrip')||x.startsWith('concepto')||x.startsWith('detalle'));if(iM<0)iM=[0,1,2].find(i=>i!==iF&&i!==iA)}
  const out=[];
  for(const r of rows.slice(h+1)){const d=toDate(r[iF]),a=toAmt(r[iA]),m=String(r[iM]??'').trim();if(d&&isFinite(a)&&a!==0&&m)out.push({date:d,bank:m.replace(/\s+/g,' ').slice(0,160),raw:a})}
  return out;
}
async function fileMoves(f){
  const n=f.name.toLowerCase();
  if(/\.(xlsx|xls)$/.test(n)){if(!window.XLSX)throw new Error('xlsx');const wb=window.XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true});
    for(const s of wb.SheetNames){const mv=rowsToMoves(window.XLSX.utils.sheet_to_json(wb.Sheets[s],{header:1,raw:true,defval:''}));if(mv.length)return mv}return[]}
  return rowsToMoves(parseCSV(await f.text()));
}
let chosen=null;
function pick(f){chosen=f||null;$('fname').textContent=f?'Archivo: '+f.name:''}
$('file').addEventListener('change',e=>pick(e.target.files[0]));
const dz=$('drop');
dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('on')});
dz.addEventListener('dragleave',()=>dz.classList.remove('on'));
dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('on');pick(e.dataTransfer.files[0])});

// ============ motor de clasificación (sin IA) ============
const RULES_KW=[
 [/rocadevida|iglesia|diezmo|ofrenda|ministerio|parroquia/i,'Diezmo y ofrendas'],
 [/farmacia|arrocha|metro ?plus|xtra farma|clinica|hospital|laboratorio|optica|dental|medic/i,'Salud'],
 [/super ?99|super ?24|\bs24\b|\brey\b|machetazo|riba smith|xtra|el costo|supercarnes|super carnes|pricesmart|super xtra|el fuerte|novey|almacen|minisuper|mini super|fruteria|carniceria|panaderia|super kosher|super extra/i,'Comida'],
 [/mcdonald|kfc|burger|pio ?pio|domino|pizza|subway|popeyes|pedidos ?ya|appetito|uber ?eats|arepa|restaurante|fonda|cafe|coffee|starbucks|dunkin|krispy|soda|campeon|famirlanda|famguatemala|sofia3|bungla/i,'Comida'],
 [/terpel|delta|puma|texaco|shell|gasolin|\buno\b|metro ?y ?metrobus|metrobus|sonda|mpsa|uber(?! ?eats)|indriver|cabify|taxi|transporte|panapass|\bena\b|corredor/i,'Transporte y gasolina'],
 [/naturgy|ensa|idaan|cable ?onda|punto ?pago|edemet|elektra|alquiler|condominio|do it|lavanderia|ferreteria|cochez/i,'Casa y servicios'],
 [/\+movil|mas movil|tigo|digicel|claro|liberty|internet/i,'Celular e internet'],
 [/netflix|spotify|apple\.com|itunes|google|disney|hbo|\bmax\b|prime video|amazon prime|youtube|membresia|g2g|steam|playstation|xbox|nintendo|chatgpt|openai|crunchyroll|paramount/i,'Suscripciones'],
 [/assa|seguro(?! de fraude)|mapfre|\bsura\b|pan-american life|palic/i,'Seguros'],
 [/pregrado|matricula|universidad|\busma\b|\butp\b|\bup-|ulatina|udelas|colegiatura|libreria/i,'Universidad'],
 [/zara|h&m|conway|felix|stevens|fashion|shein|temu|bershka|adidas|nike|salon|barberia|\buñas\b|\bunas\b|\bspa\b/i,'Ropa y cuidado personal'],
 [/cinepolis|cine|teatro|\bbar\b|discoteca|concierto|ticket/i,'Salidas y entretenimiento']];
const FEE=/cargo|comision|itbms|seguro de fraude|impuesto|manejo de cuenta|cargo-atm/i;
const ATM=/^atm|cajero|retiro (en )?(atm|cajero)/i;
const P2P_OUT=/^yappy bg a \w+ a |^yappy bg a |^yappy a |transferencia a |^ach a |transf\.? a /i;
const P2P_IN=/^yappy bg de |^yappy de |transferencia de |^ach de |transf\.? de |deposito/i;
const SALARY=/planilla|salario|nomina|quincena|sueldo/i;
function merchantKey(d){let s=String(d).toUpperCase();
  s=s.replace(/-?\d{4}-\d{2}X{2}-X{4}-\d{4}/g,'').replace(/^PAGO YAPPY BG A /,'').replace(/^PAGO YAPPY /,'').replace(/\(.*$/,'').replace(/[^A-ZÁÉÍÓÚÑ0-9&.\/ ]/g,' ').replace(/\b\d+\b/g,'').replace(/\s+/g,' ').trim();
  return s.split(' ').slice(0,3).join(' ')}
function prettyMerchant(k){return titleCase(String(k).replace(/^WWW\./,'').replace(/\.(COM|NET|ORG)(\/\S*)?$/,'').replace(/\.COM\/BILL$/,''))}
function personName(d){const s=String(d).replace(P2P_OUT,'').replace(P2P_IN,'').replace(/ POR .*/i,'').trim();const w=s.split(/\s+/);return w.length>1?titleCase(w[0])+' '+w[w.length>2?w.length-2:1][0].toUpperCase()+'.':titleCase(s)}
function isOwn(d){const settings=S.settings||{};if(/entre cuentas/i.test(d))return true;
  const nm=norm(settings.bankName||'');return nm.length>5&&norm(d).includes(nm)&&/transf|ach|banca movil/i.test(d)}
const R0=()=>({groups:Object.assign({},S.rules&&S.rules.groups||{}),merchants:Object.assign({},S.rules&&S.rules.merchants||{})});
function classify(m){
  const d=m.bank,tp=m.raw<0?'gasto':'ingreso',amount=Math.abs(m.raw),R=R0();
  const base={date:m.date,bank:d,amount,type:tp};
  if(isOwn(d))return Object.assign(base,{own:true});
  const mk=merchantKey(d);
  if(R.merchants[mk]&&(tp==='gasto'?GASTOS:INGRESOS).includes(R.merchants[mk]))return Object.assign(base,{cat:R.merchants[mk],desc:prettyMerchant(mk),known:true,mkey:mk});
  if(tp==='gasto'){
    if(FEE.test(d))return Object.assign(base,{cat:'Comisiones bancarias',desc:titleCase(d).slice(0,60),known:true});
    if(ATM.test(d))return Object.assign(base,{cat:R.groups.atm||'Otros',desc:'Retiro de efectivo',group:'atm',known:!!R.groups.atm});
    if(P2P_OUT.test(d)&&!/^pago yappy/i.test(d)){
      if(/transporte|taxi/i.test(d))return Object.assign(base,{cat:'Transporte y gasolina',desc:'Yappy a '+personName(d),known:true});
      const g=amount<=3.5?'p2p_small':'p2p_big';const note=(d.match(/ POR (.*)$/i)||[])[1];
      return Object.assign(base,{cat:R.groups[g]||'Otros',desc:'Yappy a '+personName(d)+(note?' ('+note.trim()+')':''),group:g,known:!!R.groups[g]})}
    for(const[re,c]of RULES_KW)if(re.test(d))return Object.assign(base,{cat:c,desc:prettyMerchant(mk),known:true,mkey:mk});
    return Object.assign(base,{cat:'Otros',desc:prettyMerchant(mk),group:'m:'+mk,mkey:mk,known:false});
  }
  if(SALARY.test(d))return Object.assign(base,{cat:'Salario',desc:titleCase(d).slice(0,60),known:true});
  if(/reembolso|devolucion|reversion|temu|amazon/i.test(d))return Object.assign(base,{cat:'Otros ingresos',desc:prettyMerchant(mk)+' (reembolso)',known:true});
  if(P2P_IN.test(d))return Object.assign(base,{cat:R.groups.p2p_in||'Otros ingresos',desc:'Yappy de '+personName(d),group:'p2p_in',known:!!R.groups.p2p_in});
  return Object.assign(base,{cat:'Otros ingresos',desc:prettyMerchant(mk),group:'in:'+mk,mkey:mk,known:false});
}
const QDEF={
 atm:{label:'Retiros de efectivo',kind:'gasto',ask:(n,t)=>`Sacaste ${money(t)} del cajero en ${n} ${n===1?'retiro':'retiros'}. ¿En qué lo usaste más?`,op:['Comida','Transporte y gasolina','Salidas y entretenimiento','Otros']},
 p2p_small:{label:'Yappy de $3.50 o menos a personas',kind:'gasto',ask:(n,t)=>`Hiciste ${n} Yappy o transferencias pequeñas (hasta $3.50) a personas, por ${money(t)}. ¿Qué son la mayoría?`,op:['Transporte y gasolina','Comida','Otros']},
 p2p_big:{label:'Yappy de más de $3.50 a personas',kind:'gasto',ask:(n,t)=>`Hiciste ${n} Yappy o transferencias de más de $3.50 a personas, por ${money(t)}. ¿Qué son la mayoría?`,op:['Comida','Familia','Salidas y entretenimiento','Otros']},
 p2p_in:{label:'Yappy o transferencias que recibes',kind:'ingreso',ask:(n,t)=>`Te enviaron ${money(t)} en ${n} Yappy o transferencias. ¿Qué son la mayoría?`,op:['Otros ingresos','Trabajo extra','Salario']}};
function buildQuestions(all){
  const groups={};
  all.forEach((it,i)=>{if(it.known||!it.group)return;(groups[it.group]=groups[it.group]||[]).push(i)});
  const qs=Object.entries(groups).map(([g,idx])=>{
    const items=idx.map(i=>all[i]),tot=sumAmt(items),n=items.length;
    if(QDEF[g])return{group:g,label:QDEF[g].label,kind:QDEF[g].kind,pregunta:QDEF[g].ask(n,tot),opciones:QDEF[g].op,idx,total:tot,answer:null,remember:true};
    const name=prettyMerchant(g.slice(g.indexOf(':')+1)),inc=g.startsWith('in:');
    return{group:g,label:name,kind:inc?'ingreso':'gasto',pregunta:inc?`Recibiste ${money(tot)} de ${name}. ¿Qué es?`:`${n>1?n+' compras':'Una compra'} en ${name} por ${money(tot)}. ¿Qué es?`,opciones:inc?['Otros ingresos','Trabajo extra','Salario']:['Comida','Ropa y cuidado personal','Casa y servicios','Otros'],idx,total:tot,answer:null,remember:true};
  });
  return qs.sort((a,b)=>b.total-a.total);
}
function answerQ(qi,cat){const q=imports&&imports.questions[qi];if(!q)return;
  const list=q.kind==='ingreso'?INGRESOS:GASTOS;if(!list.includes(cat))return;
  q.answer=cat;for(const i of q.idx){const it=imports.all[i];if(!it.manual)it.cat=cat}
  if(q.remember){const R=R0();if(q.group.includes(':'))R.merchants[q.group.slice(q.group.indexOf(':')+1)]=cat;else R.groups[q.group]=cat;setSingle('rules',R)}
  else renderAnalysis();
  const left=imports.questions.filter(x=>!x.answer).length;$('astatus').textContent=left?`Gracias. Te quedan ${left} ${left===1?'pregunta':'preguntas'}.`:'¡Gracias! Ya puedes importar los movimientos.';
}
function forgetRule(key){const R=R0();if(key.startsWith('g:'))delete R.groups[key.slice(2)];else delete R.merchants[key.slice(2)];setSingle('rules',R);toast('Listo, lo olvidé')}

// ============ análisis (sin IA) ============
function analyze(all,own){
  const g=all.filter(t=>t.type==='gasto'),inc=all.filter(t=>t.type==='ingreso');
  const dates=all.map(t=>t.date).sort();const d0=dates[0],d1=dates[dates.length-1];
  const days=Math.max(1,(new Date(d1)-new Date(d0))/864e5+1),f=Math.max(1,days/30.4);
  const by={};for(const t of g)by[t.cat]=(by[t.cat]||0)+t.amount;
  const G=sumAmt(g),I=sumAmt(inc);
  const unclear=g.filter(t=>t.cat==='Otros'||(t.group&&!t.known&&!(imports&&imports.questions.find(q=>q.answer&&q.idx.includes(all.indexOf(t))))));
  const U=sumAmt(unclear);
  const fmtD=s=>Number(s.slice(8))+' '+MESES[Number(s.slice(5,7))-1].slice(0,3);
  const periodo=d0===d1?fmtD(d0)+' '+d0.slice(0,4):`Del ${fmtD(d0)} al ${fmtD(d1)} ${d1.slice(0,4)}`;
  const top=Object.entries(by).sort((a,b)=>b[1]-a[1]);
  const hall=[],sug=[];
  hall.push({titulo:'Lo que salió y entró',detalle:`Gastaste ${money(G)}${I?` y entraron ${money(I)}`:''}${own?`, sin contar ${own} transferencias entre tus propias cuentas`:''}.`});
  if(own>=5&&G>I*1.5)hall.push({titulo:'Esta cuenta vive de tus otras cuentas',detalle:'Casi todo lo que entra aquí son transferencias tuyas. Registra tu salario como ingreso en la app (o importa también tu cuenta principal) para que tu disponible sea real.'});
  if(G&&U/G>.2)hall.push({titulo:`${Math.round(U/G*100)}% sin categoría clara`,detalle:`${money(U)} se fueron en efectivo, Yappy a personas u otros gastos que no puedo identificar. Responde mis preguntas para afinarlo.`});
  if(top.length)hall.push({titulo:'Lo que más pesa',detalle:top.slice(0,3).map(([c,v])=>`${c} (${money(v)})`).join(', ')+'.'});
  const reps={};for(const t of g){if(!t.mkey)continue;(reps[t.mkey]=reps[t.mkey]||{name:t.desc,cat:t.cat,n:0,s:0}).n++;reps[t.mkey].s+=t.amount}
  const rep=Object.values(reps).filter(x=>x.n>=3&&!ESENCIALES.has(x.cat)&&x.cat!=='Suscripciones'&&x.cat!=='Comisiones bancarias').sort((a,b)=>b.s-a.s).slice(0,3);
  for(const x of rep){hall.push({titulo:`${x.n} veces en ${x.name}`,detalle:`${money(x.s)} en total.`});sug.push({titulo:`Menos visitas a ${x.name}`,detalle:tipsFor(x.cat,1,x.name)[0]+' Si vas la mitad de veces:',ahorro:x.s/2/f})}
  const subs=g.filter(t=>t.cat==='Suscripciones'),SS=sumAmt(subs);
  if(subs.length){const names=[...new Set(subs.map(t=>t.desc))].slice(0,5).join(', ');hall.push({titulo:'Suscripciones',detalle:`${money(SS)}: ${names}.`});sug.push({titulo:'Revisa tus suscripciones',detalle:'Cancela las que no usaste el mes pasado o rota una plataforma a la vez.',ahorro:SS*.4/f})}
  const fees=g.filter(t=>t.cat==='Comisiones bancarias'),FF=sumAmt(fees);
  if(FF>0){const atmFee=fees.filter(t=>/atm/i.test(t.bank)).length;hall.push({titulo:'Comisiones del banco',detalle:`${money(FF)}${atmFee?`, incluye ${atmFee} cobro${atmFee===1?'':'s'} por usar cajeros de otro banco`:''}.`});if(atmFee)sug.push({titulo:'Usa cajeros de tu banco',detalle:'Así no pagas comisión por retiro.',ahorro:sumAmt(fees.filter(t=>/atm/i.test(t.bank)))/f})}
  const atm=g.filter(t=>t.group==='atm'),AA=sumAmt(atm);
  if(AA>0)sug.push({titulo:'Menos efectivo, más registro',detalle:`Sacaste ${money(AA)} en efectivo. Ponte un tope mensual y paga lo demás con Yappy o tarjeta, así sabes en qué se fue.`,ahorro:0});
  const ants=g.filter(t=>t.amount<ANT&&t.cat!=='Comisiones bancarias');
  if(ants.length>=15){hall.push({titulo:`${ants.length} gastos pequeños`,detalle:`Menos de $10 cada uno, pero suman ${money(sumAmt(ants))}.`});sug.push({titulo:'Tope semanal para gastos pequeños',detalle:'Decide un monto por semana para cafés, snacks y pasajes, y no lo pases.',ahorro:sumAmt(ants)*.25/f})}
  if(all.some(t=>t.group&&t.group.startsWith('p2p')))sug.push({titulo:'Ponle nota a tus Yappy',detalle:'Escribe para qué es cada uno (pasaje, almuerzo, préstamo). El próximo mes sabrás exactamente en qué se fue.',ahorro:0});
  const pres={};for(const[c,v]of top){const m=v/f;pres[c]=Math.max(5,Math.ceil((ESENCIALES.has(c)?m:m*.85)/5)*5)}
  return{periodo,G,I,U,own,by,hallazgos:hall.slice(0,7),sugerencias:sug.slice(0,6).map(s=>Object.assign(s,{ahorro:Math.round((s.ahorro||0)*100)/100})),presupuesto:pres,meses:f};
}
function currentAnalysis(){return imports?analyze(imports.all,imports.own):S.analysis}
function renderAnalysis(){
  const el=$('ares'),A=currentAnalysis(),R=R0();
  const rules=[...Object.entries(R.groups).map(([k,c])=>['g:'+k,(QDEF[k]||{}).label||k,c]),...Object.entries(R.merchants).map(([k,c])=>['m:'+k,prettyMerchant(k),c])];
  if(!A&&!rules.length)return;
  let h='';
  if(imports&&imports.questions.length){
    const show=imports.showAll?imports.questions:imports.questions.slice(0,6);
    h+=`<h3 style="margin-top:0">Ayúdame a entender estos gastos</h3><p class="sub">No quise adivinar. Lo que me digas lo recuerdo para la próxima vez.</p>`+show.map((q,qi)=>{
      const items=q.idx.map(i=>imports.all[i]),ex=items.slice().sort((a,b)=>b.amount-a.amount);
      const list=q.kind==='ingreso'?INGRESOS:GASTOS;
      return `<div class="plan" style="margin-top:12px"><p style="margin:0 0 6px"><b>${esc(q.pregunta)}</b></p>
      ${q.answer?`<p style="margin:0"><span class="ok">Listo: ${esc(q.answer)}</span> <button class="link" data-qre="${qi}">Cambiar</button></p>`
      :`<div class="line" style="margin-top:4px">${q.opciones.map(c=>`<button data-qa="${qi}" data-qc="${esc(c)}">${esc(c)}</button>`).join('')}<select data-qs="${qi}" aria-label="Otra categoría"><option value="">Otra categoría…</option>${opts(list.filter(c=>!q.opciones.includes(c)))}</select></div>
      <label style="font-weight:500;display:flex;gap:8px;align-items:center;margin:8px 0 0"><input type="checkbox" data-qm="${qi}" ${q.remember?'checked':''} style="width:auto;min-height:0"> Recordar para la próxima (${esc(q.label)})</label>`}
      ${items.length>1?`<details style="margin-top:8px"><summary class="sub" style="cursor:pointer">Ver los ${items.length} movimientos y cambiar alguno</summary>${ex.map(it=>{const i=imports.all.indexOf(it);return `<div class="split" style="grid-template-columns:minmax(0,1fr) 6.5em minmax(0,11em)"><span>${esc(it.date.slice(8)+'/'+it.date.slice(5,7))} · ${esc(it.desc)}</span><span class="m">${money(it.amount)}</span><select data-it="${i}" aria-label="Categoría">${list.map(c=>`<option${c===it.cat?' selected':''}>${esc(c)}</option>`).join('')}</select></div>`}).join('')}</details>`:''}</div>`}).join('')
      +(imports.questions.length>6&&!imports.showAll?`<div class="acts"><button data-qmore="1">Ver ${imports.questions.length-6} preguntas más</button></div>`:'');
  }
  if(A){
    h+=`<h3${imports&&imports.questions.length?'':' style="margin-top:0"'}>${esc(A.periodo||'Tu estado de cuenta')}</h3>
    <div class="line" style="gap:12px 32px"><div><div class="sub">Gastaste</div><div class="stat">${money(A.G)}</div></div>${A.I?`<div><div class="sub">Entró</div><div class="stat">${money(A.I)}</div></div>`:''}${A.G?`<div><div class="sub">Sin categoría clara</div><div class="stat ${A.U/A.G>.2?'o':''}">${Math.round(A.U/A.G*100)}%</div></div>`:''}</div>`;
    const by=Object.entries(A.by||{}).sort((a,b)=>b[1]-a[1]),mx=by.length?by[0][1]:1;
    if(by.length)h+=`<div style="margin-top:12px">${by.map(([c,v])=>`<button class="row" data-acat="${esc(c)}" style="width:100%;border:0;background:${openCat===c?'var(--bg)':'none'};text-align:left;padding:7px 4px;border-radius:8px;min-height:0"><span class="n">${esc(c)}</span><div class="track"><div class="fill${c==='Otros'?' warn':''}" style="width:${v/mx*100}%"></div></div><span class="v"><b>${money(v)}</b></span></button>${openCat===c&&imports?imports.all.filter(t=>t.type==='gasto'&&t.cat===c).sort((a,b)=>b.amount-a.amount).slice(0,30).map(t=>`<div class="split" style="grid-template-columns:minmax(0,1fr) auto;font-size:14px"><span>${esc(t.date.slice(8)+'/'+t.date.slice(5,7))} · ${esc(t.desc)}</span><span class="m">${money(t.amount)}</span></div>`).join(''):''}`).join('')}<p class="sub" style="font-size:13px">${imports?'Toca una categoría para ver sus movimientos.':''}</p></div>`;
    if(A.hallazgos&&A.hallazgos.length)h+=`<h3>Lo que encontré</h3><ul>${A.hallazgos.map(x=>`<li><b>${esc(x.titulo)}.</b> ${esc(x.detalle)}</li>`).join('')}</ul>`;
    if(A.sugerencias&&A.sugerencias.length){const tot=A.sugerencias.reduce((s,x)=>s+(Number(x.ahorro)||0),0);
      h+=`<h3>Para el próximo mes</h3><ul>${A.sugerencias.map(x=>`<li><b>${esc(x.titulo)}.</b> ${esc(x.detalle)}${Number(x.ahorro)>0?` <span class="ok">Ahorro: ${money(x.ahorro)}/mes</span>`:''}</li>`).join('')}</ul>${tot>0?`<p>Si aplicas todo, podrías liberar cerca de <b>${money(tot)}</b> al mes.</p>`:''}`}
    const pb=A.presupuesto||{},keys=GASTOS.filter(c=>Number(pb[c])>0);
    if(keys.length)h+=`<h3>Presupuesto sugerido</h3><p class="sub">${A.meses>1.2?`Promedio por mes de ${A.meses.toFixed(1)} meses. `:''}Igual en lo esencial y 15% menos en lo demás.</p><table><tbody>${keys.map(c=>`<tr><td>${esc(c)}</td><td class="m">${money(pb[c])}</td><td class="m" style="font-weight:500;color:var(--soft)">${S.budgets[c]?'antes '+money(S.budgets[c]):'nuevo'}</td></tr>`).join('')}</tbody></table><div class="acts"><button class="pri" id="applyb">Usar este presupuesto</button></div>`;
  }
  if(imports){
    const pend=imports.questions.filter(q=>!q.answer).length;
    h+=`<h3>Movimientos encontrados</h3><p>${imports.fresh.length} movimiento${imports.fresh.length===1?'':'s'} nuevo${imports.fresh.length===1?'':'s'}${imports.dup?` (${imports.dup} ya estaban en la app y se omiten)`:''}.${imports.own?` No incluí ${imports.own} transferencias entre tus propias cuentas.`:''}${imports.learned?` Clasifiqué ${imports.learned} con lo que ya me habías enseñado.`:''}${pend?` Te faltan ${pend} pregunta${pend===1?'':'s'}; si importas ya, esos quedan como "Otros".`:''}</p>${imports.fresh.length?`<div class="acts"><button class="pri" id="importb">Importar a mis movimientos</button><button id="discardb">Descartar</button></div>`:'<div class="acts"><button id="discardb">Cerrar</button></div>'}`;
  }
  if(rules.length)h+=`<h3>Lo que me has enseñado</h3><p class="sub">Lo uso en cada análisis. Quita lo que ya no aplique.</p>${rules.map(([k,l,c])=>`<div class="split" style="grid-template-columns:minmax(0,1fr) auto"><span>${esc(l)} → <b>${esc(c)}</b></span><button class="x" data-rdel="${esc(k)}">Olvidar</button></div>`).join('')}`;
  el.innerHTML=h;
}
$('analyze').addEventListener('click',async()=>{
  const st=t=>{$('astatus').textContent=t};
  let moves=[];
  try{
    if(chosen){st('Leyendo '+chosen.name+'…');moves=await fileMoves(chosen)}
    const p=$('paste').value.trim();if(p)moves=moves.concat(rowsToMoves(parseCSV(p)));
  }catch(e){st('No pude leer el archivo. Descárgalo en Excel o CSV desde tu banca en línea, o pega la tabla.');return}
  if(!moves.length){st('No encontré las columnas fecha, descripción y monto. Revisa el archivo o pega la tabla de movimientos.');return}
  const cls=moves.map(classify),own=cls.filter(x=>x.own).length,all=cls.filter(x=>!x.own);
  if(!all.length){st('Solo encontré transferencias entre tus propias cuentas; no hay gastos que analizar.');return}
  const keyOf=t=>t.date+'|'+Number(t.amount).toFixed(2)+'|'+norm(t.bank||t.desc);
  const have=new Set(S.tx.map(keyOf)),seen=new Set();let dup=0;const fresh=[];
  for(const it of all){const k=keyOf(it);if(have.has(k)){dup++;continue}let kk=k,n=1;while(seen.has(kk))kk=k+'#'+(n++);seen.add(kk);it.id='imp-'+hash(kk);fresh.push(it)}
  const R=R0(),learned=all.filter(t=>t.known&&((t.group&&R.groups[t.group])||(t.mkey&&R.merchants[t.mkey]))).length;
  imports={all,fresh,dup,own,questions:buildQuestions(all),learned,showAll:false};openCat=null;
  const qn=imports.questions.length;
  st(qn?`Encontré ${all.length} movimientos. Tengo ${qn} ${qn===1?'pregunta':'preguntas'} para ti antes de importar.`:`Listo: ${all.length} movimientos analizados.`);
  renderAnalysis();$('banco').scrollIntoView?.();
});
async function doImport(){
  if(!imports||!imports.fresh.length)return;
  const A=analyze(imports.all,imports.own);
  const list=imports.fresh.map(it=>({kind:'tx',id:it.id,type:it.type,amount:it.amount,cat:it.cat,desc:it.desc,bank:it.bank,date:it.date}));
  imports=null;openCat=null;
  for(const t of list)if(!S.tx.some(x=>x.id===t.id))S.tx.push(t);
  S.analysis=Object.assign({kind:'analysis',id:'analysis',at:new Date().toISOString()},A);
  const ms=list.map(t=>t.date.slice(0,7)).sort();month=ms[ms.length-1]||month;render();
  toast('Importando '+list.length+' movimientos…');
  const ok=await putMany([...list,S.analysis]);
  if(ok)toast(list.length+' movimientos importados');
}

// ============ cuenta, respaldo y comentarios ============
$('savebank').addEventListener('click',()=>{setSingle('settings',Object.assign({},S.settings||{},{bankName:$('bankname').value.trim().slice(0,80)}));toast('Guardado')});
$('exportb').addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify({app:CFG.appName,version:1,exported:new Date().toISOString(),docs:allDocs()},null,1)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='respaldo-finglory-'+today()+'.json';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);
});
$('importfile').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;
  try{const j=JSON.parse(await f.text());const docs=(Array.isArray(j)?j:j.docs||[]).filter(d=>d&&typeof d==='object'&&d.kind&&d.id);
    if(!docs.length)throw 0;const cur=allDocs();const merged=fromDocs([...cur.filter(c=>!docs.some(d=>d.id===c.id)),...docs]);S=merged;render();
    const ok=await putMany(docs);if(ok)toast('Respaldo restaurado: '+docs.length+' registros')}
  catch(err){toast('Ese archivo no parece un respaldo de la app.')}
  e.target.value=''});
$('fb').addEventListener('submit',async e=>{e.preventDefault();const m=$('fbtext').value.trim();if(!m)return;
  if(mode!=='cloud'){$('fbstatus').textContent='Crea una cuenta para enviar comentarios.';return}
  $('fbstatus').textContent='Enviando…';
  let error=null;
  if(fdb){try{await fdb.collection('fg_feedback').add({uid:user.uid,email:user.email||'',message:m.slice(0,2000),page:location.hash||'',created_at:firebase.firestore.FieldValue.serverTimestamp()})}catch(e){error=e}}
  else({error}=await sb.from('fg_feedback').insert({user_id:user.id,email:user.email,message:m.slice(0,2000),page:location.hash||''}));
  $('fbstatus').textContent=error?'No se pudo enviar. Intenta de nuevo.':'¡Gracias! Lo recibimos.';if(!error)$('fbtext').value=''});
$('logout').addEventListener('click',async()=>{
  if(mode==='cloud'){if(fauth)await fauth.signOut();else if(sb)await sb.auth.signOut()}
  mode=null;S=EMPTY();imports=null;showAuth('login');
});

// ============ entrar / crear cuenta ============
let authMode='login';
function showAuth(m){authMode=m||'login';$('app').hidden=true;$('auth').hidden=false;
  const T={login:['Entrar','Entrar'],signup:['Crear cuenta','Crear cuenta'],reset:['Recuperar contraseña','Enviarme el enlace'],newpass:['Nueva contraseña','Guardar contraseña']}[authMode];
  $('authtitle').textContent=T[0];$('authgo').textContent=T[1];$('autherr').textContent='';
  $('pwwrap').hidden=authMode==='reset';$('aemail').hidden=authMode==='newpass';$('aemail').previousElementSibling.hidden=authMode==='newpass';$('aemail').required=authMode!=='newpass';
  $('apass').autocomplete=authMode==='login'?'current-password':'new-password';
  $('toSignup').textContent=authMode==='signup'?'Ya tengo cuenta':'Crear cuenta';$('toReset').hidden=authMode!=='login';
  $('demo').hidden=authMode==='newpass';
  if(!sb&&!fauth){$('autherr').textContent='La app aún no está conectada a su base de datos. Puedes probarla sin cuenta.'}
}
async function startApp(m){
  mode=m;$('auth').hidden=true;$('app').hidden=false;
  if(m==='cloud'){setStatus('Cargando tus datos…');try{await loadCloud();setStatus('')}catch(e){setStatus('No se pudieron cargar tus datos. Revisa tu conexión y recarga.')}}
  else loadLocal();
  splitDraft=null;$('date').value=today();fillCats();render();
}
$('toSignup').addEventListener('click',()=>showAuth(authMode==='signup'?'login':'signup'));
$('toReset').addEventListener('click',()=>showAuth('reset'));
$('demo').addEventListener('click',()=>startApp('local'));
const AUTH_ERR=m=>/invalid-credential|wrong-password|user-not-found|invalid login/i.test(m)?'Correo o contraseña incorrectos.':/not confirmed/i.test(m)?'Confirma tu correo primero: revisa tu bandeja de entrada.':/email-already-in-use|already registered|already been registered/i.test(m)?'Ese correo ya tiene cuenta. Entra o recupera tu contraseña.':/invalid-email/i.test(m)?'Ese correo no parece válido.':/weak-password|password/i.test(m)?'La contraseña debe tener al menos 8 caracteres.':/rate|too many|too-many/i.test(m)?'Demasiados intentos. Espera unos minutos.':'Algo falló. Intenta de nuevo.';
$('authf').addEventListener('submit',async e=>{e.preventDefault();
  if(!sb&&!fauth){$('autherr').textContent='La app aún no está conectada a su base de datos. Toca "Probar sin cuenta".';return}
  const email=$('aemail').value.trim(),password=$('apass').value,redirect=location.origin+location.pathname;
  $('autherr').textContent='';$('authgo').disabled=true;
  try{
    if(fauth){
      if(authMode==='login')await fauth.signInWithEmailAndPassword(email,password);
      else if(authMode==='signup'){if(password.length<8)throw{message:'password'};const c=await fauth.createUserWithEmailAndPassword(email,password);try{await c.user.sendEmailVerification()}catch(e){}}
      else if(authMode==='reset'){await fauth.sendPasswordResetEmail(email);$('autherr').textContent='Si ese correo tiene cuenta, te llegará un enlace para cambiar la contraseña. Revisa también el spam.'}
      return}
    if(authMode==='login'){const{error}=await sb.auth.signInWithPassword({email,password});if(error)throw error}
    else if(authMode==='signup'){if(password.length<8)throw{message:'password'};const{data,error}=await sb.auth.signUp({email,password,options:{emailRedirectTo:redirect}});if(error)throw error;
      if(!data.session){$('autherr').textContent='Te enviamos un correo para confirmar tu cuenta. Ábrelo y vuelve a entrar.';}}
    else if(authMode==='reset'){const{error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:redirect});if(error)throw error;$('autherr').textContent='Si ese correo tiene cuenta, te llegará un enlace para cambiar la contraseña.'}
    else if(authMode==='newpass'){if(password.length<8)throw{message:'password'};const{error}=await sb.auth.updateUser({password});if(error)throw error;toast('Contraseña actualizada');}
  }catch(err){$('autherr').textContent=AUTH_ERR(String(err&&(err.code||'')+' '+(err.message||'')))}
  finally{$('authgo').disabled=false}
});

// ============ inicio ============
fillCats();$('date').value=today();
const FB=CFG.firebase||{};
const fbReady=CFG.backend==='firebase'&&FB.apiKey&&!/TU-/.test(FB.apiKey)&&FB.projectId&&window.firebase;
const sbReady=CFG.backend==='supabase'&&CFG.supabaseUrl&&!/TU-PROYECTO/.test(CFG.supabaseUrl)&&CFG.supabaseAnonKey&&!/TU-ANON/.test(CFG.supabaseAnonKey)&&window.supabase;
if(fbReady){
  const app=firebase.apps.length?firebase.app():firebase.initializeApp(FB);
  fauth=app.auth();fdb=app.firestore();
  fauth.onAuthStateChanged(u=>{
    if(u){const fresh=!user||user.uid!==u.uid;user=u;if(fresh||mode!=='cloud')startApp('cloud')}
    else{user=null;if(mode!=='local')showAuth('login')}
  });
}else if(sbReady){
  sb=window.supabase.createClient(CFG.supabaseUrl,CFG.supabaseAnonKey);
  sb.auth.onAuthStateChange((ev,session)=>{
    if(ev==='PASSWORD_RECOVERY'){showAuth('newpass');return}
    if(session&&session.user){const fresh=!user||user.id!==session.user.id;user=session.user;if(fresh||mode!=='cloud')startApp('cloud')}
    else if(ev==='SIGNED_OUT'||ev==='INITIAL_SESSION'){user=null;if(mode!=='local')showAuth('login')}
  });
}else showAuth('login');
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&mode==='cloud'&&!editing&&!pending&&!imports&&Date.now()-lastLoad>5*60e3)loadCloud().then(render).catch(()=>{})});
}
