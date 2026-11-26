{
// ============ configuración y utilidades ============
const CFG=Object.assign({appName:'FinGlory',backend:'firebase',firebase:{},supabaseUrl:'',supabaseAnonKey:''},window.APP_CONFIG||{});
let fdb=null,fauth=null;
const clean=o=>JSON.parse(JSON.stringify(o));
const userDocs=()=>fdb.collection('fg_users').doc(user.uid).collection('docs');
const GASTOS=['Comida','Transporte y gasolina','Casa y servicios','Celular e internet','Familia','Diezmo y ofrendas','Universidad','Salud','Seguros','Ropa y cuidado personal','Salidas y entretenimiento','Suscripciones','Deudas y préstamos','Comisiones bancarias','Otros'];
const INGRESOS=['Salario','Trabajo extra','Liquidación','Otros ingresos'];
const ESENCIALES=new Set(['Deudas y préstamos','Casa y servicios','Celular e internet','Familia','Diezmo y ofrendas','Universidad','Salud','Seguros','Transporte y gasolina']);
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
const EMPTY=()=>({tx:[],goal:[],fixed:[],wish:[],debt:[],budgets:{},split:null,analysis:null,rules:null,settings:null});
let S=EMPTY();
let mode=null,sb=null,user=null,type='gasto',editing=false,last=null,toastT=null,pending=null,splitDraft=null,imports=null,lastIncome=0,openCat=null;
let month=today().slice(0,7);
let period='mes';try{const p=localStorage.getItem('fg.period');if(['mes','q1','q2'].includes(p))period=p}catch(e){}
const PNAME={mes:'este mes',q1:'la 1ª quincena',q2:'la 2ª quincena'};

// ============ almacenamiento: Supabase o este dispositivo ============
const LKEY='misfinanzas.demo.v1';
const setStatus=t=>{const e=$('acstatus');if(e)e.textContent=t};
function fromDocs(list){
  const s=EMPTY();
  for(const d of list){if(!d||typeof d!=='object')continue;
    if(['tx','goal','fixed','wish','debt'].includes(d.kind))s[d.kind].push(d);
    else if(d.kind==='budgets')s.budgets=Object.assign({},d.map||{});
    else if(['split','analysis','rules','settings'].includes(d.kind))s[d.kind]=d;}
  return s;
}
function allDocs(){const out=[...S.tx,...S.goal,...S.fixed,...S.wish,...S.debt,{kind:'budgets',id:'budgets',map:S.budgets}];for(const k of['split','analysis','rules','settings'])if(S[k])out.push(Object.assign({},S[k],{kind:k,id:k}));return out}
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
const dayIn=d=>period==='mes'||(period==='q1'?d<=15:d>=16);
const ofPeriod=()=>ofMonth(month).filter(t=>dayIn(Number(String(t.date).slice(8,10))));
const pScale=()=>period==='mes'?1:.5;
function totalsP(){let inc=0,out=0,sav=0;const by={};
  for(const t of ofPeriod()){const a=Number(t.amount)||0;if(t.type==='ingreso')inc+=a;else if(t.type==='ahorro')sav+=a;else{out+=a;by[t.cat]=(by[t.cat]||0)+a}}
  return{inc,out,sav,by,avail:inc-out-sav}}
function totals(ym){
  let inc=0,out=0,sav=0;const by={};
  for(const t of ofMonth(ym)){const a=Number(t.amount)||0;
    if(t.type==='ingreso')inc+=a;else if(t.type==='ahorro')sav+=a;else{out+=a;by[t.cat]=(by[t.cat]||0)+a}}
  return{inc,out,sav,by,avail:inc-out-sav};
}
const goalSaved=g=>sumAmt(S.tx.filter(t=>t.type==='ahorro'&&t.goal===g.id));
const fxId=(f,ym)=>'fx-'+f.id+'-'+ym;
const fixedPending=ym=>S.fixed.filter(f=>!S.tx.some(t=>t.id===fxId(f,ym)));
const fType=f=>f.type==='ingreso'?'ingreso':'gasto';
// ---- descuentos de ley en Panamá (asalariados): CSS 9.75%, Seguro Educativo 1.25%, ISR progresivo anual
const PAY={css:.0975,se:.0125};
const isrAnnual=a=>a<=11000?0:a<=50000?(a-11000)*.15:5850+(a-50000)*.25;
const r2=x=>Math.round(x*100)/100;
function payroll(bruto,pago){const k=pago==='q'?2:1;return{bruto:r2(bruto),css:r2(bruto*PAY.css),se:r2(bruto*PAY.se),isr:r2(isrAnnual(bruto*k*13)/13/k),otros:0,pago}}
const brkTotal=b=>(b.css||0)+(b.se||0)+(b.isr||0);
const workKind=()=>{const s=S.settings||{};return s.work!==undefined?s.work:(s.payroll?'planilla':'')};
const payOn=()=>workKind()==='planilla';
const isServ=sal=>(sal&&sal.kind||workKind())==='servicios';
// ---- Préstamos y deudas: el saldo = monto inicial − capital pagado (pagos a mano + descuentos de planilla)
const dK=d=>d.freq==='q'?24:12;
function debtPaid(id,exceptTx){let p=0;
  for(const t of S.tx){if(t.id===exceptTx)continue;
    if(t.debt===id)p+=(Number(t.amount)||0)-(Number(t.interest)||0);
    if(t.breakdown&&Array.isArray(t.breakdown.directos))for(const x of t.breakdown.directos)if(x.debt===id)p+=(Number(x.amount)||0)-(Number(x.interest)||0)}
  return p}
const debtSaldo=(d,exceptTx)=>Math.max(0,r2((Number(d.total)||0)-debtPaid(d.id,exceptTx)));
const debtInt=(d,saldo)=>d.rate>0?r2(saldo*d.rate/100/dK(d)):0;
function debtLeft(d){const B=debtSaldo(d),P=Number(d.cuota)||0;if(!B)return{n:0};if(!(P>0))return null;
  const r=(Number(d.rate)||0)/100/dK(d);let n;
  if(r>0){if(P<=B*r)return{never:true};n=Math.ceil(-Math.log(1-r*B/P)/Math.log(1+r))}else n=Math.ceil(B/P);
  const end=new Date();if(d.freq==='q')end.setDate(end.getDate()+Math.round(n*15.22));else end.setMonth(end.getMonth()+n);
  let cost=0;if(r>0){let b=B;for(let i=0;i<n&&b>0;i++){const it=b*r;cost+=it;b=b+it-P}}
  return{n,end:end.getFullYear()+'-'+pad(end.getMonth()+1)+'-'+pad(end.getDate()),cost:r2(cost)}}
const debtsActive=()=>S.debt.filter(d=>debtSaldo(d)>0);

// ---- Mi salario (perfil): bruto mensual, descuentos de ley y directos
const salSaved=()=>S.settings&&S.settings.salary&&Number(S.settings.salary.bruto)>0?S.settings.salary:null;
let salDraft=null;
function salCalc(sal){const b=Number(sal.bruto)||0;
  const law=isServ(sal)?{css:0,se:0,isr:0}:sal.manual&&sal.law?{css:Number(sal.law.css)||0,se:Number(sal.law.se)||0,isr:Number(sal.law.isr)||0}:{css:b*PAY.css,se:b*PAY.se,isr:isrAnnual(b*13)/13};
  const dir=(sal.directos||[]).map(d=>({name:String(d.name||'Descuento'),amount:Number(d.amount)||0}))
    .concat(S.debt.filter(d=>d.directo&&debtSaldo(d)>0).map(d=>({name:d.name,amount:(Number(d.cuota)||0)*(d.freq==='q'?2:1),debt:d.id}))),dirT=sumAmt(dir),lawT=law.css+law.se+law.isr;
  return{b,css:law.css,se:law.se,isr:law.isr,dir,dirT,law:lawT,net:b-lawT-dirT,k:sal.pago==='m'?1:2}}
function salPayments(ym){const sal=salSaved();if(!sal)return[];const c=salCalc(sal),last=new Date(Number(ym.slice(0,4)),Number(ym.slice(5)),0).getDate();
  const mk=(key,label,day)=>{const id='sal-'+ym+'-'+key,tx=salTx({id,label,date:ym+'-'+pad(Math.min(day,last)),c});return{key,label,day,id,tx,net:tx.amount,done:S.tx.some(t=>t.id===id)}};
  return c.k===2?[mk('q1','1ª quincena',15),mk('q2','2ª quincena',30)]:[mk('m','Salario del mes',30)]}
function salTx(p){const c=p.c,k=c.k,br={bruto:r2(c.b/k),css:r2(c.css/k),se:r2(c.se/k),isr:r2(c.isr/k),directos:c.dir.map(d=>{const a=r2(d.amount/k);if(!d.debt)return{name:d.name,amount:a};const db=S.debt.find(x=>x.id===d.debt);const sal=db?debtSaldo(db,p.id):0;return{name:d.name,amount:a,debt:d.debt,interest:db?Math.min(a,r2(sal*(db.rate||0)/100/(k===2?24:12))):0}}),pago:k===2?'q':'m'};
  br.otros=r2(sumAmt(br.directos));
  const amount=r2(c.net/k);br.isr=r2(br.bruto-br.css-br.se-br.otros-amount);if(br.isr<0)br.isr=0;
  return{kind:'tx',id:p.id,type:'ingreso',cat:'Salario',desc:(isServ(salSaved())?'Cobro':'Salario')+(k===2?' '+p.label:''),date:p.date,amount,breakdown:br}}
const fixedAmt=f=>{if(f.gross&&fType(f)==='ingreso'){const p=payroll(Number(f.amount)||0,f.pago||'q');return r2(p.bruto-brkTotal(p))}return Number(f.amount)||0};
const rhythm=()=>period==='mes'?'mes':'quincena';
const RLABEL=()=>rhythm()==='mes'?'al mes':'por quincena';
const nPer=n=>rhythm()==='mes'?(n===1?'mes':'meses'):(n===1?'quincena':'quincenas');
const UNITS={d:['día','días'],w:['semana','semanas'],m:['mes','meses']};
const unitSel=(attr,id,u)=>`<select ${attr}="${esc(id)}" aria-label="Unidad del plazo">${Object.entries(UNITS).map(([k,v])=>`<option value="${k}"${k===(u||'m')?' selected':''}>${v[1]}</option>`).join('')}</select>`;
function addPlazo(from,n,u){const d=new Date(from+'T12:00:00');
  if(u==='d')d.setDate(d.getDate()+n);else if(u==='w')d.setDate(d.getDate()+7*n);
  else{const day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+n);d.setDate(Math.min(day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()))}
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
const daysTo=s=>Math.round((new Date(s+'T12:00:00')-new Date(today()+'T12:00:00'))/864e5);
function dueOf(x){let v=x.deadline||x.due;
  if(!v&&x.kind==='wish'&&x.added&&x.wait){const d=new Date(x.added+x.wait*864e5);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
  if(!v)return null;
  if(/^\d{4}-\d{2}$/.test(v)){const[y,m]=v.split('-').map(Number);return v+'-'+pad(new Date(y,m,0).getDate())}
  return /^\d{4}-\d{2}-\d{2}$/.test(v)?v:null}
const fmtDate=s=>{const[y,m,d]=s.split('-').map(Number);return d+' de '+MESES[m-1]+' '+y};
function planFor(rest,due){if(!due)return null;const days=daysTo(due);if(days<0)return{late:true,rest,due};
  const n=Math.max(1,Math.ceil((days+1)/(rhythm()==='mes'?30.44:15.22)));return{rest,n,amt:rest/n,due,days}}
function goalPlan(g){
  const rest=Math.max(0,(Number(g.target)||0)-goalSaved(g));
  if(!rest)return{done:true};
  return planFor(rest,dueOf(g));
}
const wishSaved=w=>sumAmt(S.tx.filter(t=>t.type==='ahorro'&&t.wish===w.id));

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
const overCount=(cat,ym,dt)=>S.tx.filter(t=>t.over&&t.cat===cat&&String(t.date).slice(0,7)===ym&&(!dt||rhythm()==='mes'||qOf(t.date)===qOf(dt))).length;
function roomElsewhere(cat,ym,need){const T=totals(ym);let best=null;
  for(const c of GASTOS){if(c===cat||!S.budgets[c])continue;const room=S.budgets[c]-(T.by[c]||0);if(rhythm()!=='mes')continue;if(room>=need&&(!best||room>best.room))best={c,room}}return best}

// ============ pintar la app ============
function render(){
  $('mlabel').textContent=innerWidth<=420?cap(MESES[Number(month.slice(5))-1].slice(0,3))+' '+month.slice(0,4):cap(ymLabel(month));
  renderTop();renderList();renderSalary();renderDebts();renderFixed();renderSplit();renderGoals();renderWishes();renderAnts();renderTips();renderHist();renderAnalysis();renderAccount();renderVerse();renderQA();
}
function renderTop(){
  const T=totalsP(),sc=pScale();
  document.querySelector('#resumen .slab .k').textContent='Disponible en '+PNAME[period];
  $('avail').textContent=money(T.avail);$('tin').textContent=money(T.inc);$('tout').textContent=money(T.out);$('tsave').textContent=money(T.sav);
  const pend=fixedPending(month).filter(f=>dayIn(Number(f.day)||1));
  const sp=salPayments(month).filter(p=>!p.done&&dayIn(p.day)),spT=sumAmt(sp.map(p=>p.tx));
  const dp=debtsActive().filter(d=>!d.directo&&dayIn(Number(d.day)||1)&&!S.tx.some(t=>t.debt===d.id&&String(t.date).slice(0,7)===month&&dayIn(Number(String(t.date).slice(8)))));
  const dpT=dp.reduce((a,d)=>a+Math.min(Number(d.cuota)||0,debtSaldo(d)),0);
  const pg=sumAmt(pend.filter(f=>fType(f)==='gasto'))+dpT,pi=pend.filter(f=>fType(f)==='ingreso').reduce((a,f)=>a+fixedAmt(f),0)+spT;
  const dl=ofPeriod().filter(t=>t.breakdown).reduce((a,t)=>a+brkTotal(t.breakdown),0);
  $('free').textContent=(dl?`Descuentos de ley: ${money(dl)} · `:'')+(spT?`Salario por recibir: ${money(spT)} · `:'')+(dpT?`Cuotas de deudas por pagar: ${money(dpT)} · `:'')+((S.fixed.length||spT||dpT)?((pg||pi)?[(pg-dpT>0.004)?`Gastos fijos por pagar: ${money(pg-dpT)}`:'',(r2(pi-spT)>0)?`Ingresos fijos por recibir: ${money(pi-spT)}`:'',`Libre de verdad: ${money(T.avail-pg+pi)}`].filter(Boolean).join(' · '):'Todo lo fijo de este periodo ya está registrado.'):'Agrega tus gastos e ingresos fijos (en Plan) para ver cuánto te queda libre de verdad.');
  const cats=editing?GASTOS.slice():GASTOS.filter(c=>T.by[c]||S.budgets[c]);
  const bud=c=>(S.budgets[c]||0)*(editing?1:sc);
  const max=Math.max(1,...cats.map(c=>Math.max(T.by[c]||0,bud(c))));
  $('editb').textContent=editing?'Listo':'Editar presupuestos';
  $('catnote').textContent=editing?'Escribe cuánto quieres gastar AL MES en cada categoría. Deja vacío para no tener límite.':(period==='mes'?'':'Presupuesto de la quincena: la mitad del mensual. ')+'La raya gris marca el presupuesto. Amarillo: ya usaste el 80%. Rojo: te pasaste.';
  $('bars').innerHTML=cats.length?cats.sort((a,b)=>(T.by[b]||0)-(T.by[a]||0)).map(c=>{
    const s=T.by[c]||0,b=bud(c),over=b&&s>b,warn=b&&!over&&s>=b*.8;
    const val=editing?`<input data-b="${esc(c)}" inputmode="decimal" value="${S.budgets[c]||''}" placeholder="Sin límite" aria-label="Presupuesto mensual ${esc(c)}">`
      :`<span class="v"><b>${money(s)}</b>${b?` de ${money(b)}`:''}${over?` <span class="o">+${money(s-b)}</span>`:''}${warn?` <span class="w">${Math.round(s/b*100)}%</span>`:''}</span>`;
    return `<div class="row"><span class="n">${esc(c)}</span><div class="track"><div class="fill${over?' over':warn?' warn':''}" style="width:${Math.min(100,s/max*100)}%"></div>${b?`<div class="mark" style="left:calc(${b/max*100}% - 1px)"></div>`:''}</div>${val}</div>`;
  }).join(''):'<p class="empty">Todavía no hay gastos en '+PNAME[period]+'. Registra el primero o analiza tu estado de cuenta, y aquí verás en qué se va tu dinero.</p>';
  renderRemind();
}
function renderList(){
  const q=$('q').value.trim().toLowerCase(),fc=$('fc').value;
  const rows=ofPeriod().filter(t=>(!fc||t.cat===fc)&&(!q||String(t.desc||'').toLowerCase().includes(q)||String(t.cat).toLowerCase().includes(q)))
    .sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.id).localeCompare(String(a.id)));
  $('list').innerHTML=rows.length?`<table class="mlist"><thead><tr><th>Fecha</th><th>Descripción</th><th>Categoría</th><th class="m">Monto</th><th></th></tr></thead><tbody>${rows.map(t=>{
    const d=String(t.date).slice(8,10)+'/'+String(t.date).slice(5,7);
    return `<tr data-edit="${esc(t.id)}" tabindex="0"><td class="c-d">${esc(d)}</td><td class="c-t"><span class="t1">${esc(t.desc||'—')}</span><span class="t2">${esc(d)} · ${esc(t.cat)}${t.breakdown&&(t.breakdown.css||t.breakdown.se||t.breakdown.isr)?' · bruto '+money(t.breakdown.bruto):''}</span></td><td class="c-c">${esc(t.cat)}</td><td class="m${t.type==='ingreso'?' in':''}">${t.type==='ingreso'?'+':'-'}${money(t.amount)}</td><td class="c-x"><button class="x" data-del="${esc(t.id)}" aria-label="Eliminar ${esc(t.desc||'movimiento')}"><span class="lg">Eliminar</span><span class="sh" aria-hidden="true">✕</span></button></td></tr>`}).join('')}</tbody></table>`
    :`<p class="empty">${q||fc?'Nada coincide con la búsqueda.':'No hay movimientos en '+esc(period==='mes'?ymLabel(month):PNAME[period]+' de '+ymLabel(month))+'.'}</p>`;
}
function renderFixed(){
  if(!S.fixed.length){$('fixedlist').innerHTML='<p class="empty">Aún no tienes nada fijo. Ejemplos: tu quincena, alquiler, plan del celular, internet, universidad, suscripciones.</p>';return}
  const all=S.fixed.slice().sort((a,b)=>(a.day||0)-(b.day||0));
  const list=all.filter(f=>dayIn(Number(f.day)||1)),others=all.length-list.length;
  const pend=fixedPending(month).filter(f=>list.includes(f));
  if(!list.length){$('fixedlist').innerHTML=`<p class="empty">No tienes nada fijo en ${PNAME[period]}. ${others} ${others===1?'queda':'quedan'} en la otra quincena.</p>`;return}
  $('fixedlist').innerHTML=`<table class="mlist fx"><thead><tr><th>Día</th><th>Nombre</th><th>Categoría</th><th class="m">Monto</th><th>Estado</th><th></th></tr></thead><tbody>${list.map(f=>{
    const done=!pend.includes(f);
    const inc=fType(f)==='ingreso';
    const gr=inc&&f.gross;
    return `<tr><td class="c-d">${esc(f.day)}</td><td class="c-t"><span class="t1">${esc(f.name)}</span><span class="t2">Día ${esc(f.day)} · ${esc(f.cat)}${gr?' · bruto '+money(f.amount):''}</span></td><td class="c-c">${esc(f.cat)}</td><td class="m${inc?' in':''}">${inc?'+':''}${money(fixedAmt(f))}</td><td class="c-s">${done?`<span class="ok">${inc?'Recibido':'Registrado'}</span>`:`<button class="x pri" data-fx="${esc(f.id)}">${inc?'Registrar cobro':'Registrar pago'}</button>`}</td><td class="c-x"><button class="x" data-dfx="${esc(f.id)}" aria-label="Quitar ${esc(f.name)}"><span class="lg">Quitar</span><span class="sh" aria-hidden="true">✕</span></button></td></tr>`}).join('')}</tbody></table>
  <div class="line"><span class="sub" style="flex:1 1 200px">En ${PNAME[period]}: gastos fijos <b>${money(sumAmt(list.filter(f=>fType(f)==='gasto')))}</b>${list.some(f=>fType(f)==='ingreso')?` · ingresos fijos <b>${money(list.filter(f=>fType(f)==='ingreso').reduce((a,f)=>a+fixedAmt(f),0))}</b>`:''}${pend.length?` · pendientes: <b>${pend.length}</b>`:''}${others?` · ${others} más en la otra quincena`:''}</span>${pend.length>1?'<button id="fxall">Registrar todos los pendientes</button>':''}</div>`;
}
function renderSalary(){
  if(!salDraft)salDraft=JSON.parse(JSON.stringify(salSaved()||{bruto:'',pago:'q',manual:false,law:null,directos:[]}));
  if(!salDraft.kind)salDraft.kind=workKind()==='servicios'?'servicios':'planilla';
  const sv=salDraft.kind==='servicios';
  document.querySelectorAll('#swork button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.work===salDraft.kind));
  $('salintro').textContent=sv?'Para quienes cobran por servicios profesionales o trabajan por su cuenta: sin Seguro Social ni ISR descontados. Pon cuánto cobras al mes y, si quieres, lo que apartas (por ejemplo para tu declaración de renta). Registras cada cobro con un toque.':'Opcional, para asalariados en Panamá. Pon tu salario bruto y tus descuentos: los de ley (Seguro Social, Seguro Educativo e impuesto sobre la renta) y los directos (préstamos, cooperativa, pensión, etc.). Te muestro el neto y registras cada pago con un toque.';
  $('saltitle').textContent=sv?'Mis ingresos':'Mi salario';
  $('sbrutolbl').textContent=sv?'Ingreso mensual (lo que cobras)':'Salario bruto mensual';
  $('smanualrow').hidden=sv;$('sdirtitle').textContent=sv?'Apartados o descuentos fijos (opcional)':'Descuentos directos';
  $('sdirnote').textContent=sv?'Lo que separas de cada cobro: ahorro para impuestos, un préstamo, etc. Escribe el monto de todo el mes.':'Lo que tu empresa te descuenta directo de la planilla. Escribe el monto de todo el mes.';
  $('salsave').textContent=sv?'Guardar mi ingreso':'Guardar mi salario';
  if(document.activeElement!==$('sbruto'))$('sbruto').value=salDraft.bruto||'';
  $('spago').value=salDraft.pago==='m'?'m':'q';$('smanual').checked=!!salDraft.manual;
  $('sdirlist').innerHTML=(salDraft.directos||[]).length?salDraft.directos.map((d,i)=>`<div class="payrow"><span>${esc(d.name)}</span><b>${money(d.amount)}</b><button class="x" data-sddel="${i}" aria-label="Quitar ${esc(d.name)}">✕</button></div>`).join(''):'<p class="sub" style="margin:6px 0 0">No tienes descuentos directos.</p>';
  renderSalaryRes();
}
function renderSalaryRes(){
  const c=salCalc(salDraft),q=c.k===2;
  if(!(c.b>0)){$('sres').innerHTML='<h3 style="margin-top:0">Tu neto</h3><p class="sub">'+(isServ(salDraft)?'Escribe cuánto cobras al mes y aquí verás lo que te queda después de tus apartados.':'Escribe tu salario bruto mensual y aquí verás tus descuentos y lo que de verdad recibes.')+'</p>';return}
  const cell=(v,key)=>salDraft.manual&&key?`<input inputmode="decimal" data-slaw="${key}" value="${r2(v).toFixed(2)}" aria-label="${key==='css'?'Seguro Social':key==='se'?'Seguro Educativo':'Impuesto sobre la renta'} al mes">`:money(v);
  const row=(l,v,cls,key)=>`<tr class="${cls||''}"><td>${l}</td><td class="m">${cell(v,key)}</td>${q?`<td class="m">${money(v/2)}</td>`:''}</tr>`;
  let t=`<h3 style="margin-top:0">Tu neto</h3><table class="stab"><thead><tr><th></th><th>Al mes</th>${q?'<th>Por quincena</th>':''}</tr></thead><tbody>`
    +(isServ(salDraft)?row('Ingreso',c.b,'bold'):row('Salario bruto',c.b,'bold')+row('Seguro Social (9.75%)',c.css,'neg','css')+row('Seguro Educativo (1.25%)',c.se,'neg','se')+row('Impuesto sobre la renta'+(salDraft.manual?'':' (estimado)'),c.isr,'neg','isr'))
    +c.dir.map(d=>row(esc(d.name)+` <span class="sub" style="font-size:12px">(${d.debt?'deuda':isServ(salDraft)?'apartado':'directo'})</span>`,d.amount,'neg')).join('')
    +(isServ(salDraft)&&!c.dir.length?'':row(isServ(salDraft)?'Total apartados':'Total descuentos',c.law+c.dirT,'bold'))+row(isServ(salDraft)?'Te queda':'Neto que recibes',c.net,'sum')+'</tbody></table>';
  if(c.net<0)t+='<p class="err">Los descuentos son mayores que el salario. Revisa los montos.</p>';
  if(isServ(salDraft))t+='<p class="sub" style="font-size:13px">Sin descuentos de ley: como trabajas por servicios profesionales, tu ingreso se registra completo.</p>';
  else if(!salDraft.manual)t+='<p class="sub" style="font-size:13px">Impuesto estimado sobre 13 salarios al año (exento hasta $11,000; 15% hasta $50,000; 25% sobre el excedente). Si tu talonario dice otra cosa, marca "Ajustar a mano".</p>';
  const saved=salSaved(),dirty=JSON.stringify(saved||null)!==JSON.stringify(salDraft);
  if(saved){const ps=salPayments(month);
    t+=`<h3 style="margin-top:22px">Pagos de ${esc(ymLabel(month))}</h3>`+(dirty?'<p class="sub">Tienes cambios sin guardar: los pagos usan tu salario guardado.</p>':'')
      +ps.map(p=>`<div class="payrow"><span>${esc(p.label)} · día ${p.day}<br><b>${money(p.net)}</b> neto</span>${p.done?'<span class="ok" style="flex:0 0 auto">Registrado</span>':`<button class="pri" data-salreg="${p.key}">Registrar</button>`}</div>`).join('')
      +'<div class="acts"><button class="link" data-saldel="1">Quitar mi salario</button></div>'}
  $('sres').innerHTML=t;
}
function renderDebts(){
  const ds=S.debt.slice().sort((a,b)=>debtSaldo(b)-debtSaldo(a)),act=ds.filter(d=>debtSaldo(d)>0);
  const tot=sumAmt(act.map(d=>({amount:debtSaldo(d)}))),cm=act.reduce((a,d)=>a+(Number(d.cuota)||0)*(d.freq==='q'?2:1),0);
  $('debtsum').innerHTML=act.length?`<div class="debtsum"><div><div class="sub">Debes en total</div><div class="stat o">${money(tot)}</div></div><div><div class="sub">Pagas al mes en cuotas</div><div class="stat">${money(cm)}</div></div></div>`:'';
  $('debts').innerHTML=ds.length?ds.map(d=>{
    const sal=debtSaldo(d),paid=r2((Number(d.total)||0)-sal),pct=d.total>0?Math.min(100,paid/d.total*100):0,lf=debtLeft(d),it=debtInt(d,sal),due=d.freq==='q'?'por quincena':'al mes';
    const info=!sal?'<span class="ok">¡Pagada!</span>'
      :lf&&lf.never?'<span class="o">La cuota no alcanza ni para los intereses.</span> Revisa la tasa o sube la cuota.'
      :lf?`Te faltan unos <b>${lf.n} pagos</b>: terminas cerca del ${esc(fmtDate(lf.end))}${lf.cost>0?`. Pagarás ${money(lf.cost)} en intereses`:''}.`:'';
    return `<div class="card"><h3>${esc(d.name)}${d.directo?'<span class="badge">Descuento de planilla</span>':''}</h3>
    <div class="stat" style="margin-top:6px">${money(sal)}</div><div class="sub">de ${money(d.total)} · pagado ${money(paid)}</div>
    <div class="p debt"><i style="width:${pct}%"></i></div>
    <div class="plan">Cuota de <b>${money(d.cuota)}</b> ${due}, día ${esc(d.day||'—')}${d.rate>0?` · interés ${esc(d.rate)}% anual (unos ${money(it)} de esta cuota)`:''}.<br>${info}</div>
    ${sal?(d.directo?'<p class="sub" style="font-size:14px">Se descuenta de tu salario: el saldo baja cuando registras tu pago en Mi salario. Si haces un abono extra, regístralo aquí.</p>':''):''}
    ${sal?`<div class="ctrls"><input inputmode="decimal" data-dpamt="${esc(d.id)}" value="${d.directo?'':r2(Math.min(d.cuota,sal+it)).toFixed(2)}" placeholder="${d.directo?'Abono extra':'Monto'}" aria-label="Pago a ${esc(d.name)}"><button class="pri" data-dpay="${esc(d.id)}">${d.directo?'Registrar abono':'Registrar pago'}</button></div>`:''}
    <div class="ctrls"><span class="when">¿El saldo no coincide con tu estado de cuenta?</span><input inputmode="decimal" data-dfix="${esc(d.id)}" placeholder="Saldo real" aria-label="Saldo real de ${esc(d.name)}"><button data-dfixb="${esc(d.id)}">Corregir saldo</button><button data-ddel="${esc(d.id)}" aria-label="Eliminar ${esc(d.name)}">✕</button></div></div>`}).join('')
    :'<p class="empty">No tienes préstamos ni deudas anotadas. Si tienes alguno, agrégalo abajo para ver cómo baja el saldo.</p>';
}
function renderSplit(){
  if(!splitDraft)splitDraft=JSON.parse(JSON.stringify((S.split&&S.split.rules)||DEFAULT_SPLIT));
  const base=num($('samt').value),amt=base>0?base:0;
  const tot=splitDraft.reduce((s,r)=>s+(Number(r.pct)||0),0);
  $('splitrows').innerHTML=splitDraft.map((r,i)=>`<div class="split"><span>${esc(r.name)}</span><input class="pct" data-sp="${i}" inputmode="decimal" value="${esc(r.pct)}" aria-label="Porcentaje ${esc(r.name)}"><span class="m">${amt?money(amt*(Number(r.pct)||0)/100):'—'}</span><button class="x" data-sdel="${i}" aria-label="Quitar ${esc(r.name)}">✕</button></div>`).join('')
    +`<div class="split" style="border:0"><b>Total</b><b class="pct m ${Math.abs(tot-100)<.01?'ok':'o'}">${Math.round(tot*100)/100}%</b><span></span><span></span></div>`;
  $('sstatus').textContent=Math.abs(tot-100)<.01?'':'Los porcentajes suman '+(Math.round(tot*100)/100)+'%. Ajústalos para que sumen 100%.';
  const T=totalsP();
  $('snote').textContent=amt?(lastIncome===amt?'Este es tu último ingreso registrado.':''):(T.inc?`Escribe un monto, o usa tus ingresos de ${PNAME[period]}: ${money(T.inc)}.`:(rhythm()==='mes'?'Escribe el monto de tu salario del mes.':'Escribe el monto de tu quincena.'));
}
function renderGoals(){
  $('goals').innerHTML=S.goal.length?S.goal.slice().sort((a,b)=>String(a.id).localeCompare(String(b.id))).map(g=>{
    const saved=goalSaved(g),pct=g.target>0?Math.min(100,saved/g.target*100):0,pl=goalPlan(g),due=dueOf(g);
    const plan=pl&&pl.done?'<span class="ok">¡Meta cumplida!</span>'
      :!pl?'Ponle un plazo y te digo cuánto apartar '+RLABEL()+'.'
      :pl.late?`<span class="o">El plazo venció el ${esc(fmtDate(pl.due))}.</span> Te faltan ${money(pl.rest)}. Dale un plazo nuevo para recalcular.`
      :`Aparta <b>${money(pl.amt)}</b> ${RLABEL()} durante ${pl.n} ${nPer(pl.n)} para lograrla el ${esc(fmtDate(pl.due))}.`;
    return `<div class="card"><h3>${esc(g.name)}</h3>${g.why?`<p class="why">Para ${esc(String(g.why).replace(/^para\s+/i,''))}</p>`:''}
    <div class="sub" style="margin-top:6px">${money(saved)} de ${money(g.target)} · faltan ${money(Math.max(0,g.target-saved))}</div>
    <div class="p"><i style="width:${pct}%"></i></div>
    <div class="plan">${plan}</div>
    <div class="ctrls"><input inputmode="decimal" placeholder="Aporte" data-amt="${esc(g.id)}" aria-label="Aporte a ${esc(g.name)}"${pl&&pl.amt?` value="${pl.amt.toFixed(2)}"`:''}><button class="pri" data-ap="${esc(g.id)}">Aportar</button><button data-dg="${esc(g.id)}" aria-label="Eliminar meta">✕</button></div>
    <div class="ctrls"><span class="when">${due?'Fecha meta: '+esc(fmtDate(due))+'. ':''}${due?'Cambiar':'Poner'} plazo desde hoy:</span><input type="number" min="1" max="999" inputmode="numeric" placeholder="6" data-gpn="${esc(g.id)}" aria-label="Plazo para ${esc(g.name)}">${unitSel('data-gpu',g.id,'m')}<button data-gps="${esc(g.id)}">Guardar plazo</button></div></div>`}).join('')
    :'<p class="empty">Aún no tienes metas. Crea una abajo o toca una sugerencia.</p>';
  const have=new Set(S.goal.map(g=>g.name));
  $('presets').innerHTML=PRESETS.filter(p=>!have.has(p)).map(p=>`<button type="button" data-pre="${esc(p)}">+ ${esc(p)}</button>`).join('');
}
function renderWishes(){
  const gp=S.goal.map(x=>[x,goalPlan(x)]).find(([x,p])=>p&&p.amt);
  $('wishes').innerHTML=S.wish.length?S.wish.slice().sort((a,b)=>(a.added||0)-(b.added||0)).map(w=>{
    const saved=wishSaved(w),rest=Math.max(0,w.price-saved),due=dueOf(w),pl=planFor(rest,due),pct=Math.min(100,saved/(w.price||1)*100);
    const plan=!rest?'<b>Ya tienes todo apartado.</b> ¿Todavía lo quieres?'
      :!pl?'Ponle un plazo y te digo cuánto apartar '+RLABEL()+'.'
      :pl.late?`<b>Se cumplió el plazo</b> (${esc(fmtDate(pl.due))}). Te faltan ${money(rest)}. ¿Lo compras, le das más tiempo o lo dejas ir?`
      :`Aparta <b>${money(pl.amt)}</b> ${RLABEL()} para tenerlo el ${esc(fmtDate(pl.due))} (${pl.n} ${nPer(pl.n)}).`;
    const impact=gp?`Equivale a ${(w.price/gp[1].amt).toFixed(1)} ${rhythm()==='mes'?'meses':'quincenas'} de aportes a "${esc(gp[0].name)}".`:'';
    return `<div class="card"><h3>${esc(w.name)}</h3><div class="stat" style="margin-top:6px">${money(w.price)}</div>
    ${saved?`<div class="sub">Apartado: ${money(saved)} · faltan ${money(rest)}</div><div class="p"><i style="width:${pct}%"></i></div>`:''}
    <div class="plan">${plan}${impact?'<br>'+impact:''}</div>
    ${rest?`<div class="ctrls"><input inputmode="decimal" placeholder="Monto" data-wamt="${esc(w.id)}" aria-label="Apartar para ${esc(w.name)}"${pl&&pl.amt?` value="${pl.amt.toFixed(2)}"`:''}><button class="pri" data-wap="${esc(w.id)}">Apartar</button></div>`:''}
    <div class="ctrls"><span class="when">${due?'Plazo: '+esc(fmtDate(due))+'. ':''}${due?'Cambiar':'Poner'} plazo desde hoy:</span><input type="number" min="1" max="999" inputmode="numeric" placeholder="3" data-wpn="${esc(w.id)}" aria-label="Plazo para ${esc(w.name)}">${unitSel('data-wpu',w.id,'m')}<button data-wps="${esc(w.id)}">Guardar plazo</button></div>
    <div class="ctrls"><button class="pri" data-wbuy="${esc(w.id)}">Lo compré</button><button data-wno="${esc(w.id)}">Ya no lo quiero</button></div></div>`}).join('')
    :'<p class="empty">Nada en la lista. La próxima vez que te antoje algo caro, anótalo aquí con su plazo.</p>';
}
function renderAnts(){
  const small=ofPeriod().filter(t=>t.type==='gasto'&&(Number(t.amount)||0)<ANT&&!String(t.id).startsWith('fx-')&&t.cat!=='Suscripciones'&&t.cat!=='Comisiones bancarias');
  if(!small.length){$('ants').innerHTML='<p class="empty">No hay gastos pequeños registrados en '+PNAME[period]+'.</p>';return}
  const groups={};for(const t of small){const k=(String(t.desc||'').trim().toLowerCase()||t.cat);(groups[k]=groups[k]||{name:t.desc||t.cat,n:0,sum:0}).n++;groups[k].sum+=Number(t.amount)||0}
  const top=Object.values(groups).sort((a,b)=>b.sum-a.sum).slice(0,6);
  const tot=sumAmt(small),max=Math.max(...top.map(g=>g.sum));
  $('ants').innerHTML=`<div class="line" style="gap:24px 48px;margin:0 0 12px"><div><div class="sub">En ${PNAME[period]}</div><div class="stat">${money(tot)}</div><div class="sub">en ${small.length} gastos pequeños</div></div><div><div class="sub">En un año serían</div><div class="stat o">${money(tot*12/pScale())}</div></div></div>
  ${top.map(g=>`<div class="row"><span class="n">${esc(g.name)}</span><div class="track"><div class="fill warn" style="width:${g.sum/max*100}%"></div></div><span class="v"><b>${money(g.sum)}</b> · ${g.n} ${g.n===1?'vez':'veces'}</span></div>`).join('')}`;
}
// ---- motor de tips: analiza los movimientos del periodo (manuales e importados)
function txIn(ym,p){return ofMonth(ym).filter(t=>{const d=Number(String(t.date).slice(8,10));return p==='mes'||(p==='q1'?d<=15:d>=16)})}
function prevP(){if(period==='mes')return[ymAdd(month,-1),'mes'];if(period==='q2')return[month,'q1'];return[ymAdd(month,-1),'q2']}
const PREVNAME=()=>period==='mes'?'el mes pasado':'la quincena anterior';
function byCat(list){const o={};for(const t of list)if(t.type==='gasto')o[t.cat]=(o[t.cat]||0)+(Number(t.amount)||0);return o}
function periodProgress(){
  const ym=today().slice(0,7);if(ym!==month)return null;
  const d=Number(today().slice(8)),last=new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate();
  const[a,z]=period==='mes'?[1,last]:period==='q1'?[1,15]:[16,last];
  if(d<a||d>z)return null;return{elapsed:d-a+1,total:z-a+1}}
function renderTips(){
  const L=ofPeriod(),G=L.filter(t=>t.type==='gasto'),T=totalsP(),out=T.out,inc=T.inc,cards=[];
  const nImp=L.filter(t=>String(t.id).startsWith('imp-')).length,nMan=L.length-nImp;
  $('tipsum').textContent=L.length?`Analicé ${L.length} movimiento${L.length===1?'':'s'} de ${PNAME[period]}${period==='mes'?'':' de '+ymLabel(month)}: ${nMan} registrado${nMan===1?'':'s'} a mano y ${nImp} importado${nImp===1?'':'s'} del banco.`:'Salen de analizar tus movimientos del periodo, los que registras a mano y los que importas del banco.';
  if(!L.length){$('tiplist').innerHTML=`<div class="card"><h3>Todavía no hay nada que analizar</h3><p class="sub">Registra tus gastos e ingresos o importa tu estado de cuenta y aquí aparecerán tus tips.</p><div class="ctrls"><button class="pri" data-view-go="inicio">Registrar</button><button data-view-go="analizar">Analizar mi banco</button></div></div>`;return}
  const add=(k,w,t,big,d,tips)=>cards.push({k,w,t,big,d,tips});
  // 1) ingresos y balance
  if(!inc&&out>0)add('info',9,'No hay ingresos registrados en '+PNAME[period],'', 'Sin ingresos no puedo decirte si te alcanza. Tu disponible sale negativo aunque no lo esté.',['Agrega tu quincena o salario como ingreso fijo en Plan y regístralo con un toque.','Si tu salario cae en otra cuenta, importa también esa cuenta.']);
  if(inc>0){const left=inc-out-T.sav,rate=left/inc;
    if(left<0)add('warn',10,'Gastaste más de lo que entró',money(-left),`Entraron ${money(inc)} y salieron ${money(out+T.sav)} en ${PNAME[period]}.`,['Revisa abajo las categorías que más subieron y elige una para recortar.','Pausa las compras de la lista de deseos hasta equilibrar.']);
    else if(rate<.1)add('warn',7,`Te queda solo el ${Math.round(rate*100)}% de lo que entró`,money(left),'Lo recomendable es guardar al menos el 10% de cada ingreso.',['Aparta primero para tus metas apenas cobres, no al final.','Usa el reparto del salario en Plan para decidir antes de gastar.']);
    else if(rate>=.2)add('ok',4,`¡Vas bien! Te queda el ${Math.round(rate*100)}% de lo que entró`,money(left),'Es un buen momento para darle ese dinero a una meta antes de que se vaya en gastos.',['Aporta una parte a tu meta más importante desde Metas.','Si no tienes fondo de emergencia, empieza uno con esto.'])}
  // 2) proyección
  const pp=periodProgress();
  if(pp&&pp.elapsed>=3&&pp.elapsed<pp.total&&out>0){const proj=out/pp.elapsed*pp.total;
    if(inc>0&&proj>inc)add('warn',8.5,'A este ritmo gastarás más de lo que entra','~'+money(proj),`Llevas ${money(out)} en ${pp.elapsed} de ${pp.total} días. Entraron ${money(inc)}.`,[`Para no pasarte, gasta máximo ${money(Math.max(0,(inc-out)/(pp.total-pp.elapsed)))} por día lo que queda.`,'Deja para la próxima quincena lo que no sea urgente.'])}
  // 1b) descuentos de ley
  const brs=L.filter(t=>t.breakdown).map(t=>t.breakdown);
  if(brs.length){const sm=k=>brs.reduce((a,b)=>a+(b[k]||0),0),dl=sm('css')+sm('se')+sm('isr');
    add('info',3.2,'Descuentos de ley en '+PNAME[period],money(dl),`Salario bruto ${money(sm('bruto'))}: Seguro Social ${money(sm('css'))}, Seguro Educativo ${money(sm('se'))}, impuesto sobre la renta ${money(sm('isr'))}${sm('otros')?`, descuentos directos ${money(sm('otros'))}`:''}. Recibiste ${money(sm('bruto')-dl-sm('otros'))}.`,['Compara con tu talonario; si algo no coincide, toca el movimiento y corrígelo.','Arma tu presupuesto con el neto: es lo que de verdad llega a tu cuenta.'])}
  // 1c) deudas
  const act=debtsActive();
  if(act.length){const tot=act.reduce((a,d)=>a+debtSaldo(d),0),cm=act.reduce((a,d)=>a+(Number(d.cuota)||0)*(d.freq==='q'?2:1),0),incM=totals(month).inc;
    const hi=act.filter(d=>d.rate>0).sort((a,b)=>b.rate-a.rate)[0];
    const share=incM>0?cm/incM:0;
    add(share>.35?'warn':'info',share>.35?7:3.4,share>.35?`Tus cuotas son el ${Math.round(share*100)}% de lo que entra`:`Debes ${money(tot)} en ${act.length} ${act.length===1?'deuda':'deudas'}`,share>.35?money(cm)+' al mes':money(tot),
      share>.35?`Lo recomendable es que las deudas no pasen del 30–35% de tus ingresos. Hoy debes ${money(tot)} en total.`:`Pagas ${money(cm)} al mes en cuotas.`,
      [hi?`Si te sobra dinero, abónalo primero a "${hi.name}" (${hi.rate}% anual): es la que más intereses te cobra.`:'Si te sobra dinero, abona a la deuda más pequeña para cerrarla rápido y liberar esa cuota.','Evita sacar deudas nuevas hasta bajar las que tienes.'])}
  // 3) categoría que más pesa
  const cats=Object.entries(T.by).sort((a,b)=>b[1]-a[1]);
  if(cats.length&&out>=20){const[c,v]=cats[0],sh=v/out;if(sh>=.3&&c!=='Diezmo y ofrendas'&&c!=='Deudas y préstamos')add(ESENCIALES.has(c)?'info':'warn',5+sh*3,`${c} es el ${Math.round(sh*100)}% de tus gastos`,money(v),`Es tu categoría más grande en ${PNAME[period]}.`,tipsFor(c,2))}
  // 4) comparación con el periodo anterior
  const[pm,pq]=prevP(),prev=byCat(txIn(pm,pq)),hasPrev=Object.keys(prev).length>0;
  if(hasPrev){const diffs=GASTOS.map(c=>[c,(T.by[c]||0)-(prev[c]||0),prev[c]||0]).filter(([c,d,p])=>p>0||d>0);
    diffs.filter(([c,d,p])=>d>=Math.max(10,p*.25)&&c!=='Diezmo y ofrendas'&&c!=='Otros'&&c!=='Deudas y préstamos').sort((a,b)=>b[1]-a[1]).slice(0,2).forEach(([c,d,p])=>add('warn',6+d/50,`Gastaste más en ${c} que ${PREVNAME()}`,'+'+money(d),`${money(p)} antes, ${money(T.by[c]||0)} ahora.`,tipsFor(c,2)));
    const down=diffs.filter(([c,d,p])=>d<=-15).sort((a,b)=>a[1]-b[1])[0];
    if(down)add('ok',3.5,`Bajaste ${money(-down[1])} en ${down[0]}`,'',`Comparado con ${PREVNAME()}. ¡Sigue así!`,['Pasa lo que ahorraste ahí a una meta para que no se pierda en otro gasto.'])}
  // 5) presupuestos
  for(const c of GASTOS){const b=(S.budgets[c]||0)*pScale(),sp=T.by[c]||0;if(!b||sp<b*.8)continue;const n=overCount(c,month);
    add(sp>b?'warn':'info',sp>b?7.5:5,sp>b?`Te pasaste en ${c}`:`Ya usaste ${Math.round(sp/b*100)}% de ${c}`,sp>b?'+'+money(sp-b):money(b-sp)+' libres',`Presupuesto de ${PNAME[period]}: ${money(b)}.${n?` Insististe ${n} ${n===1?'vez':'veces'} aunque no daba.`:''}`,tipsFor(c,2))}
  // 6) lugares que repites
  const g={};for(const t of G){if(!t.desc||/^yappy a |^aporte|^apartado/i.test(t.desc)||String(t.id).startsWith('fx-')||ESENCIALES.has(t.cat))continue;const k=norm(t.desc);(g[k]=g[k]||{name:t.desc,cat:t.cat,n:0,sum:0}).n++;g[k].sum+=Number(t.amount)||0}
  Object.values(g).filter(x=>x.n>=2&&x.sum>=8).sort((a,b)=>b.sum-a.sum).slice(0,2).forEach(x=>add('info',4+x.sum/40,`${x.n} veces en ${x.name}`,money(x.sum),`Si fueras la mitad de veces, te quedarían ${money(x.sum/2)}.`,tipsFor(x.cat,2,x.name)));
  // 7) gastos pequeños
  const ants=G.filter(t=>(Number(t.amount)||0)<ANT&&!String(t.id).startsWith('fx-')&&t.cat!=='Comisiones bancarias'&&t.cat!=='Suscripciones');
  if(ants.length>=5)add('info',3+sumAmt(ants)/40,`${ants.length} gastos pequeños`,money(sumAmt(ants)),`Menos de $10 cada uno. Al año serían ${money(sumAmt(ants)*12/pScale())}.`,['Ponte un tope semanal para cafés, snacks y pasajes.','Antes de cada gasto pequeño pregúntate si lo habrías anotado en tu lista.']);
  // 8) fines de semana
  const var_=G.filter(t=>!String(t.id).startsWith('fx-')&&!ESENCIALES.has(t.cat)),vs=sumAmt(var_);
  const we=sumAmt(var_.filter(t=>{const d=new Date(t.date+'T12:00:00').getDay();return d===0||d===6}));
  if(vs>=40&&we/vs>=.45)add('info',4,`El ${Math.round(we/vs*100)}% de tus gastos variables es en fin de semana`,money(we),'Sábados y domingos es cuando más se va el dinero.',['Planea el fin de semana con un monto fijo antes del viernes.','Alterna salidas pagadas con planes gratis.']);
  // 9) sin categoría clara
  const otros=T.by['Otros']||0;
  if(out>=30&&otros/out>=.2)add('warn',5,`El ${Math.round(otros/out*100)}% está en "Otros"`,money(otros),'Si no sabes en qué fue, no lo puedes mejorar.',['Toca esos movimientos en Movimientos y cámbiales la categoría.','Escribe una nota en cada Yappy y paga menos en efectivo.']);
  // 10) suscripciones y comisiones
  const subs=G.filter(t=>t.cat==='Suscripciones');
  if(subs.length>=2||sumAmt(subs)>=15)add('info',3.5,'Revisa tus suscripciones',money(sumAmt(subs)),[...new Set(subs.map(t=>t.desc))].slice(0,4).join(', ')+'.',tipsFor('Suscripciones',2));
  const fees=G.filter(t=>t.cat==='Comisiones bancarias');
  if(fees.length)add('info',3,'Pagaste comisiones al banco',money(sumAmt(fees)),`${fees.length} cobro${fees.length===1?'':'s'} en ${PNAME[period]}.`,tipsFor('Comisiones bancarias',2));
  // 11) metas atrasadas
  for(const x of S.goal){const due=dueOf(x),start=x.created;if(!due||!start)continue;const tot=daysTo(due)+Math.round((new Date(today()+'T12:00:00')-new Date(start+'T12:00:00'))/864e5);if(tot<=0)continue;
    const el=tot-Math.max(0,daysTo(due)),exp=x.target*Math.min(1,el/tot),sv=goalSaved(x);
    if(el>=7&&sv<exp*.8){const pl=goalPlan(x);add('warn',6,`Vas atrasada en "${x.name}"`,money(exp-sv),`A esta fecha deberías llevar ${money(exp)} y llevas ${money(sv)}.`,[pl&&pl.amt?`Aparta ${money(pl.amt)} ${RLABEL()} para llegar a tiempo.`:'Dale un plazo nuevo a la meta para recalcular.','Pasa a esta meta lo que te sobre al final de la quincena.'])}}
  cards.sort((a,b)=>b.w-a.w);
  const K={warn:'Atención',ok:'Bien',info:'Idea'};
  $('tiplist').innerHTML=cards.length?cards.slice(0,9).map(c=>`<div class="card"><span class="chip ${c.k}">${K[c.k]}</span><h3>${esc(c.t)}</h3>${c.big?`<div class="tipnum">${esc(c.big)}</div>`:''}${c.d?`<p class="sub">${esc(c.d)}</p>`:''}${c.tips&&c.tips.length?`<div class="alt" style="background:var(--bg)"><b>Qué puedes hacer</b><ul>${c.tips.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></div>`:''}</div>`).join('')
    :`<div class="card"><span class="chip ok">Bien</span><h3>Todo en orden en ${PNAME[period]}</h3><p class="sub">No encontré nada fuera de lo normal en tus ${L.length} movimientos. Ponle presupuestos a tus categorías en Inicio para que pueda avisarte antes de que te pases.</p></div>`;
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
  $('work').value=workKind();$('worknote').textContent=WNOTE[workKind()]||'';$('verseon').checked=verseOn();syncX();syncBrk(false);
}

// ============ registrar con alerta de presupuesto ============
function fillCats(){$('cat').innerHTML=opts(type==='gasto'?GASTOS:INGRESOS);document.querySelectorAll('#f .seg button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.t===type));brkDirty={};$('brkpago').value=rhythm()==='mes'?'m':'q';syncBrk(true)}
let brkDirty={};
const brkVisible=()=>payOn()&&type==='ingreso'&&$('cat').value==='Salario';
const brkActive=()=>brkVisible()&&$('brkon').checked;
function syncBrk(recalc){
  $('brk').hidden=!brkVisible();const on=brkActive();$('brkbody').hidden=!on;$('amtlbl').textContent=on?'Salario bruto (antes de descuentos)':'Monto';
  if(!on)return;const b=num($('amt').value),bb=b>0?b:0;
  if(recalc){const p=payroll(bb,$('brkpago').value);for(const[k,id]of[['css','bcss'],['se','bse'],['isr','bisr']])if(!brkDirty[id])$(id).value=bb?p[k].toFixed(2):'';
    const sv=salSaved();if(sv&&!brkDirty.botr){const dt=salCalc(sv).dirT/($('brkpago').value==='q'?2:1);$('botr').value=dt?r2(dt).toFixed(2):''}}
  const net=bb-['bcss','bse','bisr','botr'].reduce((a,id)=>a+(num($(id).value)||0),0);
  $('bnet').textContent=money(net);$('bnet').style.color=net<0?'var(--red)':''}
$('amt').addEventListener('input',()=>syncBrk(true));
$('cat').addEventListener('change',()=>{brkDirty={};syncBrk(true)});
$('brkon').addEventListener('change',()=>syncBrk(true));
$('brkpago').addEventListener('change',()=>{brkDirty={};syncBrk(true)});
['bcss','bse','bisr','botr'].forEach(id=>$(id).addEventListener('input',()=>{brkDirty[id]=true;syncBrk(false)}));
$('fc').innerHTML='<option value="">Todas las categorías</option>'+opts([...GASTOS,...INGRESOS,'Ahorro y metas']);
$('xcat').innerHTML=opts(GASTOS);$('xcat').value='Casa y servicios';
$('xtype').addEventListener('change',()=>{const inc=$('xtype').value==='ingreso';$('xcat').innerHTML=opts(inc?INGRESOS:GASTOS);$('xcat').value=inc?'Salario':'Casa y servicios';$('xname').placeholder=inc?'Ej. Quincena':'Ej. Plan del celular';syncX()});
function syncX(){$('xgrossw').hidden=!(payOn()&&$('xtype').value==='ingreso'&&$('xcat').value==='Salario');$('xpago').value=rhythm()==='mes'?'m':'q'}
$('xcat').addEventListener('change',syncX);
const qOf=d=>Number(String(d).slice(8,10))<=15?'q1':'q2';
const spentIn=(cat,date)=>sumAmt(S.tx.filter(t=>t.type==='gasto'&&t.cat===cat&&String(t.date).slice(0,7)===String(date).slice(0,7)&&(rhythm()==='mes'||qOf(t.date)===qOf(date))));
function addGasto(tx,after){
  const b=tx.type==='gasto'?(S.budgets[tx.cat]||0)*(rhythm()==='mes'?1:.5):0;
  if(b){const sp=spentIn(tx.cat,tx.date);
    if(sp+tx.amount>b){openModal(tx,sp,b,after);return}
    commit(tx,after);
    if(sp+tx.amount>=b*.8)toast(`Ojo: ya usaste ${Math.round((sp+tx.amount)/b*100)}% de ${tx.cat}. Te quedan ${money(b-sp-tx.amount)}.`);
    return}
  commit(tx,after);
}
function commit(tx,after){upsert(tx);if(after)after()}
function openModal(tx,sp,b,after){
  pending={tx,after};
  $('mtitle').textContent=`Te pasas ${money(sp+tx.amount-b)} en ${tx.cat}`+(rhythm()==='mes'?'':' esta quincena');
  const pl=rhythm()==='mes'?'este mes':'esta quincena';
  $('mbody').textContent=sp>=b?`Ya gastaste ${money(sp)} de ${money(b)} ${pl} en esta categoría. Este gasto de ${money(tx.amount)} lo dejaría en ${money(sp+tx.amount)}.`:`Te quedan ${money(b-sp)} en esta categoría y este gasto es de ${money(tx.amount)}.`;
  const g=S.goal.find(x=>x.why)||S.goal[0];
  $('mgoal').textContent=g?`Recuerda tu meta "${g.name}"${g.why?': para '+String(g.why).replace(/^para\s+/i,''):''}.`:'';
  const ym=tx.date.slice(0,7),times=overCount(tx.cat,ym,tx.date),over=sp+tx.amount-b,room=roomElsewhere(tx.cat,ym,over);
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

document.querySelectorAll('#f .seg button').forEach(b=>b.addEventListener('click',()=>{type=b.dataset.t;fillCats()}));
$('f').addEventListener('submit',e=>{e.preventDefault();
  const a=num($('amt').value);if(!(a>0)){$('amt').focus();return}
  const date=$('date').value||today();
  const tx={kind:'tx',id:uid(),type,amount:a,cat:$('cat').value,desc:$('desc').value.trim().slice(0,120),date};
  if(type==='ingreso'&&brkActive()){const g=id=>Math.max(0,num($(id).value)||0);const br={bruto:a,css:g('bcss'),se:g('bse'),isr:g('bisr'),otros:g('botr'),pago:$('brkpago').value};
    const net=r2(a-br.css-br.se-br.isr-br.otros);if(!(net>0)){toast('Los descuentos no pueden ser mayores que el salario.');return}
    tx.amount=net;tx.breakdown=br;if(!tx.desc)tx.desc=br.pago==='q'?'Quincena':'Salario'}
  const reset=()=>{month=date.slice(0,7);$('amt').value='';$('desc').value='';$('botr').value='';brkDirty={};syncBrk(true);render();$('amt').focus()};
  if(type==='ingreso'){commit(tx,()=>{lastIncome=tx.amount;$('samt').value=tx.amount.toFixed(2);reset();toast('Ingreso guardado. En Plan → Reparto del salario ves cómo dividirlo.')});return}
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
  else if(t.id==='fxall'){const l=fixedPending(month).filter(f=>dayIn(Number(f.day)||1)).map(f=>fixedTx(f));for(const x of l)S.tx.push(x);render();putMany(l);toast('Gastos fijos registrados')}
  else if(d.sdel){splitDraft.splice(Number(d.sdel),1);renderSplit()}
  else if(d.wbuy){const w=S.wish.find(x=>x.id===d.wbuy);if(!w)return;
    const saved=S.tx.filter(t=>t.type==='ahorro'&&t.wish===w.id),rest=Math.max(0,w.price-sumAmt(saved));
    const finish=()=>{const conv=saved.map(t=>Object.assign({},t,{type:'gasto',cat:'Otros',desc:w.name+' (apartado)'}));for(const c of conv){const i=S.tx.findIndex(x=>x.id===c.id);if(i>=0)S.tx[i]=c}
      S.wish=S.wish.filter(x=>x.id!==w.id);render();putMany(conv);drop(w.id);toast('Registrado como gasto. Puedes cambiarle la categoría en Movimientos.')};
    if(rest>0)addGasto({kind:'tx',id:uid(),type:'gasto',amount:Math.round(rest*100)/100,cat:'Otros',desc:w.name,date:today()},finish);else finish()}
  else if(d.wno){const w=S.wish.find(x=>x.id===d.wno);if(!w)return;const sv=wishSaved(w);remove('wish',w.id);toast(sv?'Lo que apartaste ('+money(sv)+') sigue guardado como ahorro.':'¡Te ahorraste '+money(w.price)+'! Considera aportarlo a una meta.',true)}
  else if(d.wap){const w=S.wish.find(x=>x.id===d.wap);const inp=[...document.querySelectorAll('[data-wamt]')].find(x=>x.dataset.wamt===d.wap);const a=num(inp&&inp.value);
    if(!w||!(a>0)){inp&&inp.focus();return}
    upsert({kind:'tx',id:uid(),type:'ahorro',amount:a,cat:'Ahorro y metas',desc:'Apartado: '+w.name,wish:w.id,date:today().slice(0,7)===month?today():month+'-01'});toast('Apartaste '+money(a)+' para '+w.name)}
  else if(d.gps||d.wps){const id=d.gps||d.wps,isG=!!d.gps;const pick=a=>[...document.querySelectorAll(`[${a}]`)].find(x=>x.getAttribute(a)===id);
    const n=parseInt(pick(isG?'data-gpn':'data-wpn')?.value),u=pick(isG?'data-gpu':'data-wpu')?.value||'m';
    if(!(n>=1&&n<=999)){pick(isG?'data-gpn':'data-wpn')?.focus();toast('Escribe un número de 1 a 999.');return}
    const due=addPlazo(today(),n,u);
    if(isG){const g=S.goal.find(x=>x.id===id);if(g)upsert(Object.assign({},g,{deadline:due,plazo:{n,u},created:g.created||today()}))}
    else{const w=S.wish.find(x=>x.id===id);if(w){const nw=Object.assign({},w,{due,plazo:{n,u}});delete nw.wait;upsert(nw)}}
    toast('Nuevo plazo: '+fmtDate(due))}
  else if(d.qa!==undefined)answerQ(Number(d.qa),d.qc);
  else if(d.qre!==undefined){const q=imports&&imports.questions[Number(d.qre)];if(q){q.answer=null;renderAnalysis()}}
  else if(d.qmore!==undefined){imports.showAll=true;renderAnalysis()}
  else if(d.acat!==undefined){openCat=openCat===d.acat?null:d.acat;renderAnalysis()}
  else if(d.rdel!==undefined)forgetRule(d.rdel);
  else if(t.id==='applyb'){const pb=currentAnalysis()?.presupuesto||{};for(const c of GASTOS)if(Number(pb[c])>0)S.budgets[c]=Number(pb[c]);put({kind:'budgets',id:'budgets',map:S.budgets});render();toast('Presupuesto actualizado');show('inicio')}
  else if(t.id==='importb')doImport();
  else if(t.id==='discardb'){imports=null;openCat=null;render()}
});
const fixedTx=f=>{const day=Math.min(Number(f.day)||1,new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate());const br=f.gross&&fType(f)==='ingreso'?payroll(Number(f.amount)||0,f.pago||'q'):null;return{kind:'tx',id:fxId(f,month),type:fType(f),amount:fixedAmt(f),...(br?{breakdown:br}:{}),cat:f.cat,desc:f.name,fixed:f.id,date:month+'-'+pad(day)}};
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
$('gf').addEventListener('submit',e=>{e.preventDefault();const n=$('gname').value.trim().slice(0,60),a=num($('gtarget').value),p=parseInt($('gplazo').value),u=$('gunit').value;
  if(!n||!(a>0))return;const ok=p>=1&&p<=999;
  upsert({kind:'goal',id:uid(),name:n,target:a,deadline:ok?addPlazo(today(),p,u):'',plazo:ok?{n:p,u}:null,created:today(),why:$('gwhy').value.trim().slice(0,140)});['gname','gtarget','gplazo','gwhy'].forEach(i=>$(i).value='')});
$('xf').addEventListener('submit',e=>{e.preventDefault();const n=$('xname').value.trim().slice(0,60),a=num($('xamt').value);
  if(!n||!(a>0))return;const xg=!$('xgrossw').hidden&&$('xgross').checked;upsert({kind:'fixed',id:uid(),type:$('xtype').value==='ingreso'?'ingreso':'gasto',name:n,amount:a,cat:$('xcat').value,...(xg?{gross:true,pago:$('xpago').value}:{}),day:Math.max(1,Math.min(31,parseInt($('xday').value)||1))});$('xname').value='';$('xamt').value=''});
$('wf').addEventListener('submit',e=>{e.preventDefault();const n=$('wname').value.trim().slice(0,60),a=num($('wprice').value);
  if(!n||!(a>0))return;const p=parseInt($('wplazo').value),u=$('wunit').value,ok=p>=1&&p<=999;
  upsert({kind:'wish',id:uid(),name:n,price:a,added:Date.now(),due:ok?addPlazo(today(),p,u):'',plazo:ok?{n:p,u}:null});$('wname').value='';$('wprice').value=''});
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
  const txt=['Fecha,Tipo,Categoría,Descripción,Monto',...ofPeriod().sort((a,b)=>String(a.date).localeCompare(String(b.date))).map(t=>[t.date,t.type,t.cat,t.desc,t.amount].map(q).join(','))].join('\n');
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
function pick(f){chosen=f||null;$('fname').textContent=f?'Archivo: '+f.name:'Ningún archivo elegido'}
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
 [/prestamo|pago tarjeta|tarjeta de credito|pago tdc|financiera|cuota/i,'Deudas y préstamos'],
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
  renderAnalysis();scrollTo(0,0);
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
const WNOTE={planilla:'Al registrar tu salario verás el desglose de Seguro Social, Seguro Educativo e ISR.',servicios:'Tu ingreso se registra completo, sin descuentos de ley. Puedes anotar apartados propios en Mi salario.','':'No se mostrará ningún desglose de descuentos.'};
function setWork(w){const st=Object.assign({},S.settings||{},{work:w,payroll:w==='planilla'});const sal=salSaved();if(sal&&w)st.salary=Object.assign({},sal,{kind:w});if(salDraft&&w)salDraft.kind=w;setSingle('settings',st)}
$('work').addEventListener('change',()=>{const w=$('work').value;setWork(w);toast(w==='planilla'?'Listo: verás los descuentos de ley al registrar tu salario.':w==='servicios'?'Listo: tus ingresos se registran sin descuentos de ley.':'Desglose de descuentos desactivado.')});
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

// ============ accesos rápidos ============
function goRegister(t){
  if(view!=='inicio')show('inicio');
  if(type!==t){type=t;fillCats()}
  const f=$('f');const y=f.getBoundingClientRect().top+scrollY-(innerWidth<=980?70:120);
  try{scrollTo({top:Math.max(0,y),behavior:'smooth'})}catch(e){scrollTo(0,y)}
  f.classList.remove('flash');void f.offsetWidth;f.classList.add('flash');
  setTimeout(()=>{try{$('amt').focus({preventScroll:true})}catch(e){$('amt').focus()}},350);
}
document.querySelectorAll('[data-qa=gasto],[data-qa=ingreso]').forEach(b=>b.addEventListener('click',()=>goRegister(b.dataset.qa)));
function renderQA(){const s=salSaved();$('qasal').textContent=s?'Registrar mi pago':'Configura tu quincena'}

// ============ tutoriales ============
const TOURS={
 inicio:[
  {t:'¡Bienvenida a FinGlory!',d:'Te muestro en un minuto cómo usarla. Puedes omitir cuando quieras y volver a verlo desde Mi cuenta.'},
  {sel:'#qa',t:'Empieza aquí',d:'Toca “Anotar gasto” cada vez que pagues algo, aunque sea pequeño. “Anotar ingreso” para el dinero que recibes, y “Mi salario” para configurar tu quincena con sus descuentos.'},
  {sel:'#f',t:'Registra en segundos',d:'Escribe el monto, elige la categoría y toca Guardar. Si un gasto te saca del presupuesto, te aviso y te doy alternativas.'},
  {sel:'#resumen .slab',t:'Tu dinero de un vistazo',d:'“Disponible” es lo que te queda en el periodo. Abajo te digo cuánto te queda libre de verdad después de tus pagos fijos y deudas.'},
  {sel:'#pbar',t:'Mes o quincena',d:'Cambia entre el mes completo y cada quincena: todo se recalcula para ese periodo.'},
  {sel:'#resumen .cats',t:'¿En qué se fue el dinero?',d:'Una barra por categoría. Toca “Editar presupuestos” para ponerle un límite a cada una.'},
  {sel:'nav.tabs',t:'Las secciones',d:'Movimientos, Analizar (tu Excel del banco), Metas, Plan (salario, deudas y fijos) y Hábitos (tips). La primera vez que entres a cada una te explico cómo funciona.'},
  {sel:'.appbar .me',t:'Mi cuenta',d:'Tus ajustes, modo oscuro, el versículo, comentarios para mejorar la app y el botón para repetir estos tutoriales.'}],
 movimientos:[
  {sel:'#list',t:'Todo lo que registraste',d:'Aquí ves los movimientos del mes. Toca uno para editarlo, o la ✕ para borrarlo.'},
  {sel:'#movimientos .tools',t:'Busca y filtra',d:'Encuentra un gasto por su descripción o mira solo una categoría.'},
  {sel:'#mnav',t:'Cambia de mes',d:'Usa las flechas para ver meses anteriores.'}],
 analizar:[
  {sel:'#drop',t:'Sube tu estado de cuenta',d:'Descarga de tu banca en línea el Excel con fecha, descripción y monto, y súbelo aquí. El archivo se lee solo en tu dispositivo.'},
  {sel:'#ares',t:'Tu análisis',d:'Te muestro en qué se fue el dinero, te pregunto lo que no entiendo (y recuerdo tus respuestas) y te sugiero un presupuesto para el próximo mes.'}],
 metas:[
  {sel:'#gf',t:'Crea una meta con propósito',d:'Ponle nombre, cuánto necesitas, en cuánto tiempo (días, semanas o meses) y para qué. Te digo cuánto apartar por quincena o por mes.'},
  {sel:'#goals',t:'Aporta a tus metas',d:'Cada vez que apartes dinero, regístralo en la meta y verás tu avance.'},
  {sel:'#deseos .wrap',t:'Lista de deseos',d:'Antes de comprar algo por impulso, anótalo aquí con un plazo. Si al final lo compras, se registra como gasto.'}],
 plan:[
  {sel:'#salario .wrap',t:'Mi salario',d:'Elige si trabajas en planilla o por servicios profesionales. En planilla calculo Seguro Social, Seguro Educativo e ISR; por servicios no descuento nada de eso. Cuando cobres, toca Registrar y se anota como ingreso.'},
  {sel:'#deudas .wrap',t:'Préstamos y deudas',d:'Anota el total y la cuota. Cada pago baja el saldo y te digo cuándo terminas de pagar.'},
  {sel:'#fijos .wrap',t:'Gastos e ingresos fijos',d:'Alquiler, luz, celular… Se descuentan de lo que te queda libre y te recuerdo pagarlos.'},
  {sel:'#reparto .wrap',t:'Reparto del salario',d:'Decide qué porcentaje de cada pago va a gastos, ahorro, diezmo y más.'}],
 habitos:[
  {sel:'#tips .wrap',t:'Tips para ti',d:'Los genero analizando tus movimientos, los que anotas y los del Excel. Entre más registres, mejores serán.'},
  {sel:'#hormiga .wrap',t:'Gastos hormiga',d:'Gastos pequeños que se repiten y, sumados, pesan.'},
  {sel:'#historial .wrap',t:'Últimos 6 meses',d:'Compara cuánto entró y salió cada mes.'}],
 cuenta:[
  {sel:'#payrollrow',t:'¿Planilla o servicios profesionales?',d:'Elige cómo recibes tus ingresos. En planilla te muestro Seguro Social, Seguro Educativo e ISR; por servicios profesionales tu ingreso se registra completo, sin descuentos.'},
  {sel:'#fb',t:'Cuéntame qué mejorar',d:'Escríbeme lo que te gustó, lo que no entendiste o lo que le falta a la app.'}]
};
const toursDone=()=>{const s=new Set((S.settings&&S.settings.tours)||[]);try{(JSON.parse(localStorage.getItem('fg.tours')||'[]')).forEach(x=>s.add(x))}catch(e){}return s};
function markTours(list){const s=toursDone();list.forEach(x=>s.add(x));const arr=[...s];try{localStorage.setItem('fg.tours',JSON.stringify(arr))}catch(e){}
  if(mode&&JSON.stringify(((S.settings&&S.settings.tours)||[]).slice().sort())!==JSON.stringify(arr.slice().sort()))setSingle('settings',Object.assign({},S.settings||{},{tours:arr}))}
let tour=null;
function tourEnd(markAll){if(!tour)return;const v=tour.v;['tblock','thole','tpop'].forEach(id=>{const e=$(id);if(e)e.remove()});removeEventListener('resize',tourPlace);removeEventListener('keydown',tourKey,true);tour=null;markTours(markAll?['all',...Object.keys(TOURS)]:[v])}
function tourKey(e){if(e.key==='Escape'){e.preventDefault();tourEnd(false)}}
function visible(el){if(!el)return false;const r=el.getBoundingClientRect();return r.width>0&&r.height>0}
const tourDock=()=>innerWidth<600;
function tourPlace(){
  if(!tour)return;const st=tour.steps[tour.i],el=st.sel&&document.querySelector(st.sel),hole=$('thole'),pop=$('tpop');
  const pw=pop.offsetWidth,ph=pop.offsetHeight,vw=innerWidth,vh=innerHeight,m=12;
  if(!visible(el)){hole.className='tour-hole none';pop.style.left=Math.round((vw-pw)/2)+'px';pop.style.top=Math.round((vh-ph)/2)+'px';return}
  const r=el.getBoundingClientRect(),p=8;let top=Math.max(4,r.top-p),bot=Math.min(vh-4,r.bottom+p),y;
  if(tourDock()){
    const atTop=r.top+r.height/2>vh/2&&r.top>ph+2*m;
    y=atTop?m:vh-ph-m;
    if(atTop)top=Math.max(top,y+ph+m);else bot=Math.min(bot,y-m);
  }else if(r.height>vh*.6){y=vh-ph-24;var corner=true}
  else{y=bot+m;if(y+ph>vh-m){y=top-m-ph;if(y<m)y=Math.max(m,vh-ph-m)}}
  hole.className='tour-hole';Object.assign(hole.style,{left:Math.max(4,r.left-p)+'px',top:top+'px',width:Math.min(vw-8,r.width+2*p)+'px',height:Math.max(0,bot-top)+'px'});
  const x=tourDock()?Math.round((vw-pw)/2):typeof corner!=='undefined'&&corner?vw-pw-32:Math.min(Math.max(m,r.left+r.width/2-pw/2),vw-pw-m);
  pop.style.left=Math.round(x)+'px';pop.style.top=Math.round(y)+'px';
}
function tourScroll(el){
  const r=el.getBoundingClientRect(),vh=innerHeight,head=innerWidth<=980?72:130,ph=$('tpop').offsetHeight+24;
  const room=tourDock()?vh-head-ph:vh-head-ph-24;
  if(r.top>=head&&r.bottom<=head+room&&!tourDock())return;
  if(tourDock()&&r.top>=head&&r.bottom<=vh-ph)return;
  let y=r.top+scrollY-head;if(!tourDock()&&r.height<room)y-=Math.max(0,(room-r.height)/2);
  try{scrollTo({top:Math.max(0,y),behavior:'instant'})}catch(e){scrollTo(0,Math.max(0,y))}
}
function tourShow(){
  const st=tour.steps[tour.i],n=tour.steps.length,el=st.sel&&document.querySelector(st.sel);
  const pop=$('tpop');
  pop.innerHTML=`<p class="tstep">${n>1?`Paso ${tour.i+1} de ${n}`:'Tutorial'}</p><h3 id="ttitle"></h3><p id="tdesc"></p><div class="tacts"><button type="button" id="tskip">Omitir</button><span class="sp"></span>${tour.i>0?'<button type="button" id="tprev">Atrás</button>':''}<button type="button" class="pri" id="tnext">${tour.i<n-1?'Siguiente':'Entendido'}</button></div><button type="button" class="tnever" id="tnever">No mostrar más tutoriales</button>`;
  $('ttitle').textContent=st.t;$('tdesc').textContent=st.d;
  $('tskip').onclick=()=>tourEnd(false);$('tnever').onclick=()=>{tourEnd(true);toast('Listo. Puedes volver a verlos desde Mi cuenta.')};
  $('tnext').onclick=()=>{if(tour.i<n-1){tour.i++;tourShow()}else tourEnd(false)};
  if($('tprev'))$('tprev').onclick=()=>{tour.i--;tourShow()};
  if(visible(el))tourScroll(el);
  tourPlace();setTimeout(tourPlace,80);setTimeout(tourPlace,400);try{$('tnext').focus({preventScroll:true})}catch(e){}
}
function tourStart(v,force){
  if(tour||!mode||!TOURS[v])return;const done=toursDone();if(!force&&(done.has('all')||done.has(v)))return;
  if(document.querySelector('.modal.on'))return;
  const steps=TOURS[v].filter(s=>!s.sel||visible(document.querySelector(s.sel)));if(!steps.length)return;
  tour={v,steps,i:0};
  const b=document.createElement('div');b.className='tour-block';b.id='tblock';
  const h=document.createElement('div');h.className='tour-hole';h.id='thole';
  const p=document.createElement('div');p.className='tour-pop';p.id='tpop';p.setAttribute('role','dialog');p.setAttribute('aria-modal','true');p.setAttribute('aria-labelledby','ttitle');p.setAttribute('aria-describedby','tdesc');
  document.body.append(b,h,p);addEventListener('resize',tourPlace);addEventListener('keydown',tourKey,true);tourShow();
}
let tourT=null;
function tourMaybe(){clearTimeout(tourT);tourT=setTimeout(()=>tourStart(view),500)}
$('tourreset').addEventListener('click',()=>{try{localStorage.setItem('fg.tours','[]')}catch(e){}setSingle('settings',Object.assign({},S.settings||{},{tours:[]}));show('inicio');setTimeout(()=>tourStart('inicio',true),400)});

// ============ versículo al abrir ============
const VERSES=[
['Proverbios 3:9-10','Honra á Jehová de tu sustancia, Y de las primicias de todos tus frutos; Y serán llenas tus trojes con abundancia, y tus lagares rebosarán de mosto.'],
['Proverbios 21:5','Los pensamientos del solícito ciertamente van á abundancia; mas todo presuroso, indefectiblemente á pobreza.'],
['Proverbios 21:20','Tesoro codiciable y pingüe hay en la casa del sabio; mas el hombre insensato lo disipará.'],
['Proverbios 21:26','Hay quien todo el día codicia: mas el justo da, y no desperdicia.'],
['Proverbios 22:7','El rico se enseñoreará de los pobres; y el que toma prestado, siervo es del que empresta.'],
['Proverbios 22:1','De más estima es la buena fama que las muchas riquezas; y la buena gracia más que la plata y el oro.'],
['Proverbios 22:3','El avisado ve el mal, y escóndese: mas los simples pasan, y reciben el daño.'],
['Proverbios 13:11','Disminuiránse las riquezas de vanidad: empero multiplicará el que allega con su mano.'],
['Proverbios 6:6-8','Ve á la hormiga, oh perezoso, mira sus caminos, y sé sabio; la cual no teniendo capitán, ni gobernador, ni señor, prepara en el verano su comida y allega en el tiempo de la siega su mantenimiento.'],
['Proverbios 16:3','Encomienda á Jehová tus obras, y tus pensamientos serán afirmados.'],
['Proverbios 16:8','Mejor es lo poco con justicia, que la muchedumbre de frutos sin derecho.'],
['Eclesiastés 5:10','El que ama el dinero, no se hartará de dinero; y el que ama el mucho tener, no sacará fruto. También esto es vanidad.'],
['Eclesiastés 5:5','Mejor es que no prometas, que no que prometas y no pagues.'],
['Eclesiastés 5:12','Dulce es el sueño del trabajador, ora coma mucho ó poco; mas al rico no le deja dormir la hartura.'],
['Malaquías 3:10','Traed todos los diezmos al alfolí, y haya alimento en mi casa; y probadme ahora en esto, dice Jehová de los ejércitos, si no os abriré las ventanas de los cielos, y vaciaré sobre vosotros bendición hasta que sobreabunde.'],
['Mateo 6:21','Porque donde estuviere vuestro tesoro, allí estará vuestro corazón.'],
['Mateo 6:33','Mas buscad primeramente el reino de Dios y su justicia, y todas estas cosas os serán añadidas.'],
['Lucas 14:28','Porque ¿cuál de vosotros, queriendo edificar una torre, no cuenta primero sentado los gastos, si tiene lo que necesita para acabarla?'],
['Filipenses 4:11','No lo digo en razón de indigencia, pues he aprendido á contentarme con lo que tengo.'],
['Filipenses 4:19','Mi Dios, pues, suplirá todo lo que os falta conforme á sus riquezas en gloria en Cristo Jesús.'],
['Hebreos 13:5','Sean las costumbres vuestras sin avaricia; contentos de lo presente; porque él dijo: No te desampararé, ni te dejaré.']
];
const verseOn=()=>!(S.settings&&S.settings.verse===false);
const lsGet=k=>{try{return localStorage.getItem(k)}catch(e){return null}},lsSet=(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}};
function pickVerse(){const last=Number(lsGet('fg.verse.last'));let i;do{i=Math.floor(Math.random()*VERSES.length)}while(VERSES.length>1&&i===last);lsSet('fg.verse.last',String(i));return i}
let verseIdx=null;
function renderVerse(){
  const el=$('verse');
  if(!verseOn()||lsGet('fg.verse.hidden')===today()){el.hidden=true;return}
  if(verseIdx===null)verseIdx=pickVerse();
  const [ref,txt]=VERSES[verseIdx];$('vtext').textContent=txt;$('vref').textContent=ref;el.hidden=false;
}
$('vnext').addEventListener('click',()=>{verseIdx=pickVerse();renderVerse()});
$('vhide').addEventListener('click',()=>{lsSet('fg.verse.hidden',today());renderVerse();toast('Listo, mañana verás otro versículo.')});
$('verseon').addEventListener('change',()=>{const on=$('verseon').checked;if(on)lsSet('fg.verse.hidden','');setSingle('settings',Object.assign({},S.settings||{},{verse:on}));toast(on?'Verás un versículo cada vez que abras la app.':'Versículo desactivado.')});
async function startApp(m){
  mode=m;$('auth').hidden=true;$('app').hidden=false;
  if(m==='cloud'){setStatus('Cargando tus datos…');try{await loadCloud();setStatus('')}catch(e){setStatus('No se pudieron cargar tus datos. Revisa tu conexión y recarga.')}}
  else loadLocal();
  splitDraft=null;salDraft=null;verseIdx=null;$('date').value=today();fillCats();
  if(period!=='mes'&&month===today().slice(0,7))period=Number(today().slice(8))<=15?'q1':'q2';
  document.querySelectorAll('[data-per]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.per===period));
  render();show(location.hash.slice(1)||'inicio');
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

// ============ Mi salario: eventos ============
$('sbruto').addEventListener('input',()=>{const v=num($('sbruto').value);salDraft.bruto=v>0?v:'';if(salDraft.manual&&salDraft.law&&!salDraft._lawTouched){const b=v>0?v:0;salDraft.law={css:r2(b*PAY.css),se:r2(b*PAY.se),isr:r2(isrAnnual(b*13)/13)}}renderSalaryRes()});
$('spago').addEventListener('change',()=>{salDraft.pago=$('spago').value;renderSalaryRes()});
$('smanual').addEventListener('change',()=>{salDraft.manual=$('smanual').checked;if(salDraft.manual&&!salDraft.law){const b=Number(salDraft.bruto)||0;salDraft.law={css:r2(b*PAY.css),se:r2(b*PAY.se),isr:r2(isrAnnual(b*13)/13)}}renderSalaryRes()});
$('sres').addEventListener('change',e=>{const k=e.target.dataset&&e.target.dataset.slaw;if(!k)return;salDraft.law=Object.assign({},salDraft.law||{});salDraft.law[k]=Math.max(0,num(e.target.value)||0);salDraft._lawTouched=true;renderSalaryRes()});
$('sdadd').addEventListener('click',()=>{const n=$('sdname').value.trim().slice(0,40),a=num($('sdamt').value);
  if(!n){$('sdname').focus();return}if(!(a>0)){$('sdamt').focus();return}
  salDraft.directos=(salDraft.directos||[]).concat([{name:n,amount:a}]);$('sdname').value='';$('sdamt').value='';renderSalary()});
document.querySelectorAll('#swork button').forEach(b=>b.addEventListener('click',()=>{salDraft.kind=b.dataset.work;renderSalary()}));
$('salsave').addEventListener('click',()=>{const b=Number(salDraft.bruto)||0;if(!(b>0)){$('salstatus').textContent=isServ(salDraft)?'Escribe cuánto cobras al mes.':'Escribe tu salario bruto mensual.';$('sbruto').focus();return}
  if(salCalc(salDraft).net<0){$('salstatus').textContent='Los descuentos son mayores que el ingreso.';return}
  const clean=JSON.parse(JSON.stringify(salDraft));delete clean._lawTouched;salDraft=JSON.parse(JSON.stringify(clean));
  const sv=clean.kind==='servicios';setSingle('settings',Object.assign({},S.settings||{},{salary:clean,work:clean.kind,payroll:!sv}));$('salstatus').textContent='';toast(sv?'Ingreso guardado. Ya puedes registrar tus cobros.':'Salario guardado. Ya puedes registrar tus pagos.')});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.sddel!==undefined){salDraft.directos.splice(Number(b.dataset.sddel),1);renderSalary()}
  else if(b.dataset.salreg){const p=salPayments(month).find(x=>x.key===b.dataset.salreg);if(p&&!p.done){upsert(p.tx);lastIncome=p.tx.amount;$('samt').value=p.tx.amount.toFixed(2);toast('Registrado: '+money(p.tx.amount)+' neto. En Reparto ves cómo dividirlo.')}}
  else if(b.dataset.saldel){const st=Object.assign({},S.settings||{});delete st.salary;salDraft=null;setSingle('settings',st);toast('Quitaste tu salario. Los pagos ya registrados se quedan.')}});

// ============ deudas: eventos ============
$('df').addEventListener('submit',e=>{e.preventDefault();const n=$('dname').value.trim().slice(0,60),tot=num($('dtotal').value),c=num($('dcuota').value),rate=num($('drate').value);
  if(!n)return;if(!(tot>0)){$('dtotal').focus();return}if(!(c>0)){$('dcuota').focus();return}
  upsert({kind:'debt',id:uid(),name:n,total:tot,cuota:c,freq:$('dfreq').value==='q'?'q':'m',day:Math.max(1,Math.min(31,parseInt($('dday').value)||1)),rate:rate>0?rate:0,directo:$('ddirect').checked,created:today()});
  const dir=$('ddirect').checked;['dname','dtotal','dcuota','drate'].forEach(i=>$(i).value='');$('ddirect').checked=false;toast('Deuda agregada'+(dir?(salSaved()?'. Ya se suma a los descuentos de Mi salario.':'. Guarda tu salario en Mi salario para descontarla de tus pagos.'):''))});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const dd=b.dataset;
  if(dd.dpay){const d=S.debt.find(x=>x.id===dd.dpay);const inp=[...document.querySelectorAll('[data-dpamt]')].find(x=>x.dataset.dpamt===dd.dpay);const a=num(inp&&inp.value);
    if(!d||!(a>0)){inp&&inp.focus();return}
    const dt=today().slice(0,7)===month?today():month+'-'+pad(Math.min(d.day||1,28)),samePer=t=>String(t.date).slice(0,7)===dt.slice(0,7)&&(d.freq!=='q'||qOf(t.date)===qOf(dt));
    const already=S.tx.some(t=>samePer(t)&&(t.debt===d.id||(t.breakdown&&(t.breakdown.directos||[]).some(x=>x.debt===d.id))));
    const sal=debtSaldo(d),it=(d.directo||already)?0:Math.min(a,debtInt(d,sal));
    upsert({kind:'tx',id:uid(),type:'gasto',amount:a,cat:'Deudas y préstamos',desc:(d.directo||already?'Abono: ':'Pago: ')+d.name,debt:d.id,interest:it,date:dt});
    const ns=debtSaldo(d);toast(ns?`Pago registrado. Nuevo saldo: ${money(ns)}`:`¡Terminaste de pagar ${d.name}!`)}
  else if(dd.dfixb){const d=S.debt.find(x=>x.id===dd.dfixb);const inp=[...document.querySelectorAll('[data-dfix]')].find(x=>x.dataset.dfix===dd.dfixb);const v=num(inp&&inp.value);
    if(!d||!(v>=0)||inp.value.trim()===''){inp&&inp.focus();return}
    upsert(Object.assign({},d,{total:r2(v+debtPaid(d.id))}));toast('Saldo corregido a '+money(v))}
  else if(dd.ddel)remove('debt',dd.ddel,'Deuda eliminada. Sus pagos registrados se quedan en Movimientos.')});

// ============ editar movimiento ============
let editTx=null,eType='gasto';
function setEType(t){eType=t;document.querySelectorAll('[data-et]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.et===t));const cur=$('ecat').value;$('ecat').innerHTML=opts(t==='ingreso'?INGRESOS:GASTOS);if((t==='ingreso'?INGRESOS:GASTOS).includes(cur))$('ecat').value=cur}
function openEdit(id){const t=S.tx.find(x=>x.id===id);if(!t)return;editTx=t;
  const sav=t.type==='ahorro';$('etitle').textContent=sav?'Editar aporte a meta':'Editar movimiento';
  $('etype').hidden=sav;$('ecatw').hidden=sav;
  if(!sav){setEType(t.type==='ingreso'?'ingreso':'gasto');$('ecat').value=t.cat}
  $('eamt').value=Number(t.amount).toFixed(2);$('edesc').value=t.desc||'';$('edate').value=t.date;$('eerr').textContent='';
  $('emodal').classList.add('on');setTimeout(()=>$('eamt').focus(),30)}
const closeEdit=()=>{$('emodal').classList.remove('on');editTx=null};
document.querySelectorAll('[data-et]').forEach(b=>b.addEventListener('click',()=>setEType(b.dataset.et)));
$('ecancel').addEventListener('click',closeEdit);
$('emodal').addEventListener('click',e=>{if(e.target.id==='emodal')closeEdit()});
$('edel').addEventListener('click',()=>{const t=editTx;closeEdit();if(t)remove('tx',t.id,'Movimiento eliminado')});
$('ef').addEventListener('submit',e=>{e.preventDefault();if(!editTx)return;
  const a=num($('eamt').value),d=$('edate').value;
  if(!(a>0)){$('eerr').textContent='Escribe un monto mayor que cero.';return}
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d)){$('eerr').textContent='Elige una fecha.';return}
  const t=Object.assign({},editTx,{amount:a,desc:$('edesc').value.trim().slice(0,120),date:d});
  if(t.type!=='ahorro'){t.type=eType;t.cat=$('ecat').value}
  if(t.breakdown&&(t.amount!==editTx.amount||t.type!=='ingreso'))delete t.breakdown;
  delete t.over;closeEdit();upsert(t);toast('Cambios guardados')});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&editTx)closeEdit();
  if(e.key==='Enter'&&e.target.matches&&e.target.matches('tr[data-edit]'))openEdit(e.target.dataset.edit)});
$('list').addEventListener('click',e=>{if(e.target.closest('button'))return;const tr=e.target.closest('tr[data-edit]');if(tr)openEdit(tr.dataset.edit)});

// ============ quincena o mes ============
function setPeriod(p){period=p;try{localStorage.setItem('fg.period',p)}catch(e){}document.querySelectorAll('[data-per]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.per===p));render()}
document.querySelectorAll('[data-per]').forEach(b=>b.addEventListener('click',()=>setPeriod(b.dataset.per)));
document.querySelectorAll('[data-per]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.per===period));

// ============ modo oscuro ============
function setTheme(t){try{localStorage.setItem('fg.theme',t)}catch(e){}
  if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;else delete document.documentElement.dataset.theme;
  document.querySelectorAll('[data-theme-set]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.themeSet===t));
  const m=document.querySelector('meta[name=theme-color]');if(m)m.content=(t==='dark'||(t==='auto'&&window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches))?'#1d1530':'#3E2F59'}
document.querySelectorAll('[data-theme-set]').forEach(b=>b.addEventListener('click',()=>setTheme(b.dataset.themeSet)));
setTheme((()=>{try{return localStorage.getItem('fg.theme')||'auto'}catch(e){return'auto'}})());

// ============ recordatorio de fin de mes ============
function renderRemind(){
  const el=$('remind');if(!el)return;
  const now=new Date(),d=now.getDate(),last=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
  const target=d<=5?ymAdd(today().slice(0,7),-1):today().slice(0,7);
  let dismissed=false;try{dismissed=localStorage.getItem('fg.remind')===target}catch(e){}
  const done=S.tx.some(t=>String(t.id).startsWith('imp-')&&String(t.date).slice(0,7)===target);
  const show=(d>=last-2||d<=5)&&!dismissed&&!done&&mode;
  el.hidden=!show;if(!show)return;
  el.innerHTML=`<p>${d<=5?'Ya cerró '+esc(ymLabel(target))+'.':'Se acaba el mes.'} Sube tu estado de cuenta para ver en qué se fue el dinero y ajustar el próximo mes.</p><button data-view-go="analizar">Analizar ahora</button><button class="x" id="remindx" aria-label="Ocultar aviso">✕</button>`;
  el.dataset.target=target;
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-view-go]');if(b){show(b.dataset.viewGo)}
  if(e.target.closest('#remindx')){try{localStorage.setItem('fg.remind',$('remind').dataset.target)}catch(err){}$('remind').hidden=true}});
$('icsb').addEventListener('click',()=>{
  const n=new Date(),last=new Date(n.getFullYear(),n.getMonth()+1,0),ds=last.getFullYear()+pad(last.getMonth()+1)+pad(last.getDate());
  const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+/,'');
  const url=location.origin+location.pathname+'#analizar';
  const ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//FinGlory//ES','CALSCALE:GREGORIAN','BEGIN:VEVENT','UID:finglory-cierre-mes@'+location.hostname,'DTSTAMP:'+stamp,'DTSTART;VALUE=DATE:'+ds,'RRULE:FREQ=MONTHLY;BYMONTHDAY=-1','SUMMARY:FinGlory: sube tu estado de cuenta','DESCRIPTION:Descarga los movimientos del mes en tu banca en línea y analízalos en FinGlory: '+url,'URL:'+url,'BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:Sube tu estado de cuenta a FinGlory','TRIGGER:PT9H','END:VALARM','END:VEVENT','END:VCALENDAR'].join('\r\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([ics],{type:'text/calendar'}));a.download='recordatorio-finglory.ics';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);
  toast('Abre el archivo para agregarlo a tu calendario');
});

// ============ pantallas ============
const VIEWS=['inicio','movimientos','analizar','metas','plan','habitos','cuenta'];
const ALIAS={resumen:'inicio',banco:'analizar',fijos:'plan',reparto:'plan',deseos:'metas',hormiga:'habitos',tips:'habitos',historial:'habitos'};
const MONTHLY=new Set(['inicio','movimientos','plan','habitos']);
const PERIODIC=new Set(['inicio','movimientos','habitos','plan','metas']);
let view='inicio';
function show(v,keepScroll){
  v=ALIAS[v]||v;if(!VIEWS.includes(v))v='inicio';view=v;
  document.querySelectorAll('section[data-v]').forEach(s=>{s.hidden=s.dataset.v!==v});
  document.querySelectorAll('[data-view]').forEach(a=>{if(a.dataset.view===v)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
  $('mnav').style.visibility=MONTHLY.has(v)?'visible':'hidden';$('pbar').hidden=!PERIODIC.has(v);$('pnote').hidden=v!=='metas';
  if(location.hash!=='#'+v)try{history.replaceState(null,'','#'+v)}catch(e){}
  if(!keepScroll)scrollTo(0,0);
  if(tour&&tour.v!==v)tourEnd(false);
  if(mode)tourMaybe();
}
addEventListener('hashchange',()=>show(location.hash.slice(1)));
document.addEventListener('click',e=>{const a=e.target.closest('a[data-view]');if(!a||e.metaKey||e.ctrlKey)return;e.preventDefault();const v=a.dataset.view;if(v!==view){try{history.pushState(null,'','#'+v)}catch(err){}}show(v)});
addEventListener('resize',()=>{$('mlabel')&&($('mlabel').textContent=innerWidth<=420?cap(MESES[Number(month.slice(5))-1].slice(0,3))+' '+month.slice(0,4):cap(ymLabel(month)))});

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
