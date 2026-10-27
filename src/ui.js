/* ============================================================
   LNG Trader Sim: interface
   ============================================================ */
const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fM=v=>(v<0?'−':'')+'$'+Math.abs(v/1e6).toFixed(1)+'M';
const fMs=v=>(v<0?'−':'+')+'$'+Math.abs(v/1e6).toFixed(1)+'M';
const fP=v=>'$'+v.toFixed(2);
const fPs=v=>(v<0?'−':'+')+'$'+Math.abs(v).toFixed(2);
const fK=v=>'$'+Math.round(v/1000)+'k';
const cls=v=>v>0.0001?'pos':v<-0.0001?'neg':'';
const KEY='lng-trader-sim-save-v1';
const UI={screen:'home',buy:null,fwd:null,ch:null,repos:null,relet:null,divert:null,modal:null};
const ANALYST={name:'Ingrid Halvorsen',role:'Fundamentals desk · reads the netbacks, not the tape'};

/* ---------- small widgets ---------- */
function spark(arr,w,h,color){
  w=w||92;h=h||28;if(!arr||arr.length<2)return'';
  const a=arr.slice(-20);const mn=Math.min(...a),mx=Math.max(...a);const rg=(mx-mn)||1;
  const pts=a.map((v,i)=>[(i/(a.length-1))*(w-4)+2,h-3-((v-mn)/rg)*(h-8)]);
  const d=pts.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ');
  const last=pts[pts.length-1];const up=a[a.length-1]>=a[0];const col=color||(up?'var(--good)':'var(--bad)');
  const area=d+' '+last[0].toFixed(1)+','+(h-1)+' 2,'+(h-1);
  return'<svg class="spark" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" aria-hidden="true"><polygon points="'+area+'" fill="'+col+'" opacity=".12"/><polyline points="'+d+'" fill="none" stroke="'+col+'" stroke-width="1.5" stroke-linejoin="round"/><circle cx="'+last[0].toFixed(1)+'" cy="'+last[1].toFixed(1)+'" r="2.2" fill="'+col+'"/></svg>';
}
function statusChip(v){
  const map={idle:'Idle',ballast:'Ballast',laden:'Laden',float:'Floating',relet:'Relet',waiting:'Waiting'};
  return'<span class="status '+v.status+'">'+map[v.status]+'</span>';
}
function toast(msg){const t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(UI.toastT);UI.toastT=setTimeout(()=>{t.hidden=true;},3200);}
function openModal(title,body,foot){$('#sheetTitle').textContent=title;$('#sheetBody').innerHTML=body;$('#sheetFoot').innerHTML=foot||'<button class="btn" data-act="closeModal">Close</button>';$('#modal').hidden=false;$('#modal').scrollTop=0;}
function closeModal(){$('#modal').hidden=true;UI.modal=null;}
function setErr(msg){const f=$('#sheetFoot');let e=f.querySelector('.err');if(!e){e=document.createElement('span');e.className='err';f.prepend(e);}e.textContent=msg;}
function save(){try{localStorage.setItem(KEY,JSON.stringify(S));return true;}catch(e){return false;}}
function loadSaved(){try{const j=localStorage.getItem(KEY);return j?JSON.parse(j):null;}catch(e){return null;}}
function clearSave(){try{localStorage.removeItem(KEY);}catch(e){}}
function showScreen(name){UI.screen=name;$('#home').hidden=name!=='home';$('#game').hidden=name!=='game';$('#end').hidden=name!=='end';}

/* ---------- top bar ---------- */
function renderTop(){
  const net=netPnl();
  $('#t-company').textContent=S.company;
  $('#t-week').textContent='W'+String(S.w).padStart(2,'0')+' / '+WEEKS;
  $('#t-date').textContent=dateLabel(S.w);
  $('#t-cash').textContent=fM(S.cash);
  const n=$('#t-net');n.textContent=fMs(net);n.className='v '+cls(net);
  $('#t-desk').textContent='L'+S.level+' · '+positions()+'/'+slots();
  const st=$('#t-struct');st.textContent=M.structure;st.className='struct '+M.structure;
  $('#t-charter').textContent=fK(M.charter);
  $('#nextBtn').disabled=S.over;
}

/* ---------- market board ---------- */
function renderMarket(){
  let h='';
  for(const k of ['TTF','JKM','HH','BRENT']){
    const p=M.price[k],pv=M.prev[k]||p,ch=p-pv,pct=pv?ch/pv*100:0;
    const lq=k==='BRENT'?'':'<span class="flag '+(liqLabel(k)==='thin'?'bad':liqLabel(k)==='liquid'?'good':'')+'" title="bid-offer for a cargo at W+4">'+liqLabel(k)+' · ±'+slippage(k,4,3.7).toFixed(2)+'</span>';
    h+='<div class="hub"><div><div class="n">'+HUBS[k].name+'</div><div class="venue">'+HUBS[k].venue+'</div>'+(lq?'<div style="margin-top:2px">'+lq+'</div>':'')+'</div><div><div class="p">'+p.toFixed(2)+'</div><span class="chg '+cls(ch)+'">'+(ch>=0?'+':'−')+Math.abs(ch).toFixed(2)+' · '+(pct>=0?'+':'−')+Math.abs(pct).toFixed(1)+'%</span></div>'+spark(M.hist[k])+'</div>';
  }
  $('#hubs').innerHTML=h;
  const hubs3=['TTF','JKM','HH'];const months=curveMonths(HEDGE_MAX_K);
  let c='<div class="curve wk"><span class="h" style="text-align:left">Contract</span>'+hubs3.map(k=>'<span class="h">'+HUBS[k].name+'</span>').join('');
  c+='<span class="r">Spot <span class="wn">W'+String(S.w).padStart(2,'0')+' · '+dateLabel(S.w).slice(0,6)+'</span></span>'+hubs3.map(h=>'<span class="v">'+M.price[h].toFixed(2)+'</span>').join('');
  for(const m of months){
    c+='<span class="r">'+(m.bom?'Bal '+m.label.slice(0,3):m.label)+' <span class="wn">W'+String(m.wStart).padStart(2,'0')+(m.wEnd>m.wStart?'–'+String(m.wEnd).padStart(2,'0'):'')+'</span></span>'+hubs3.map(h=>{const v=m.price[h],d=v-M.price[h];return'<span class="v '+cls(d)+'">'+v.toFixed(2)+'</span>';}).join('');
  }
  c+='</div>';
  $('#curves').innerHTML=c;$('#curve-meta').textContent='$/MMBtu · month contracts';
  const jt=M.price.JKM-M.price.TTF,th=M.price.TTF-M.price.HH;
  const pe=planVoyage('USGC','NWE','Direct','XDF','spot',spotRate('XDF','ATL'),null);
  const asiaOpts=destOptions('USGC','XDF','spot',spotRate('XDF','ATL'),null).find(o=>o.dest==='JKTC');
  const pa=asiaOpts?asiaOpts.best:null;
  let s='<div class="kv">';
  s+='<span class="k">JKM − TTF</span><span class="v '+cls(jt)+'">'+fPs(jt)+'</span>';
  s+='<span class="k">TTF − Henry Hub</span><span class="v">'+fPs(th)+'</span>';
  if(pe)s+='<span class="k">US Gulf arb to NW Europe <span class="dimmer">(spot XDF, landed vs fwd)</span></span><span class="v '+cls(pe.perMMBtu)+'">'+fPs(pe.perMMBtu)+'</span>';
  if(pa)s+='<span class="k">US Gulf arb to Japan <span class="dimmer">(via '+pa.via+')</span></span><span class="v '+cls(pa.perMMBtu)+'">'+fPs(pa.perMMBtu)+'</span>';
  s+='<span class="k">Qatar oil-link <span class="dimmer">(12% Brent + 0.40)</span></span><span class="v">'+fP(0.12*M.price.BRENT+0.4)+'</span>';
  s+='</div>';
  $('#spreads').innerHTML=s;
  let f='';
  for(const src of LOADS){
    const Rg=REGIONS[src];const p=M.fob[src],pv=M.fobPrev[src]||p,ch=p-pv;
    let flags='';if(M.outage[src]>0)flags+='<span class="flag bad">No spot cargoes · '+M.outage[src]+'w</span>';if(M.spotTight[Rg.basin]>0)flags+='<span class="flag">Spot tonnage tight</span>';
    f+='<div class="marker"><div><div class="n">'+Rg.port+flags+'</div><div class="s">'+Rg.name+' · FOB '+(src==='USGC'?'115% HH + tolling':src==='QAT'?'oil-link floor':'spot netback')+'</div></div><div><div class="p">'+p.toFixed(2)+'</div><div class="c '+cls(ch)+'">'+(ch>=0?'+':'−')+Math.abs(ch).toFixed(2)+'</div></div></div>';
  }
  $('#fob').innerHTML=f;
  let d='';
  for(const dest of DESTS){
    const Rg=REGIONS[dest];const p=des(dest);const pv=(M.prev[Rg.hub]||M.price[Rg.hub])+Rg.basis;const ch=p-pv;
    let flags='';if(M.congest[dest]>0)flags+='<span class="flag bad">Congested · '+M.congest[dest]+'w</span>';if(M.demandOff[dest]>0)flags+='<span class="flag bad">Demand off · '+M.demandOff[dest]+'w</span>';if(M.basisAdj[dest][1]>0)flags+='<span class="flag '+(M.basisAdj[dest][0]>0?'good':'bad')+'">Basis '+(M.basisAdj[dest][0]>0?'+':'')+M.basisAdj[dest][0].toFixed(2)+' · '+M.basisAdj[dest][1]+'w</span>';
    d+='<div class="marker"><div><div class="n">'+Rg.port+flags+'</div><div class="s">'+Rg.name+' · '+HUBS[Rg.hub].name+' '+(Rg.basis>=0?'+':'−')+Math.abs(Rg.basis).toFixed(2)+'</div></div><div><div class="p">'+p.toFixed(2)+'</div><div class="c '+cls(ch)+'">'+(ch>=0?'+':'−')+Math.abs(ch).toFixed(2)+'</div></div></div>';
  }
  $('#desm').innerHTML=d;
  const chg=M.charter-(M.chPrev||M.charter);
  let sh='<div class="hub"><div><div class="n">Spot 174k XDF</div><div class="venue">round-trip basis · $/day</div></div><div><div class="p">'+Math.round(M.charter/1000)+'k</div><span class="chg '+cls(chg)+'">'+(chg>=0?'+':'−')+Math.abs(Math.round(chg/1000))+'k</span></div>'+spark(M.hist.CH,80,28)+'</div>';
  sh+='<div class="kv" style="margin-top:6px"><span class="k">1-year TC, XDF</span><span class="v">'+fK(tcRate('XDF',52))+'/d</span><span class="k">Spot TFDE · Steam</span><span class="v">'+fK(typeRate('TFDE'))+' · '+fK(typeRate('STEAM'))+'</span>';
  const pan=M.block.Panama>0?'<span class="neg">Closed · '+M.block.Panama+'w</span>':M.delay.Panama.weeks>0?'<span class="amber">+'+M.delay.Panama.days+' d queue · '+M.delay.Panama.weeks+'w</span>':'<span class="pos">Open</span>';
  const sue=M.block.Suez>0?'<span class="neg">Closed · '+M.block.Suez+'w</span>':M.delay.Suez.weeks>0?'<span class="amber">+'+M.delay.Suez.days+' d · '+M.delay.Suez.weeks+'w</span>':'<span class="pos">Open</span>';
  sh+='<span class="k">Panama Canal</span><span class="v">'+pan+'</span><span class="k">Suez / Red Sea</span><span class="v">'+sue+'</span>';
  sh+='<span class="k">Atlantic · Pacific spot tonnage</span><span class="v">'+(M.spotTight.ATL>0?'<span class="amber">tight</span>':'normal')+' · '+(M.spotTight.PAC>0?'<span class="amber">tight</span>':'normal')+'</span></div>';
  const norm=storageNorm(S.w);
  sh+='<div style="margin-top:10px"><div class="kv"><span class="k">EU storage</span><span class="v">'+M.storage.toFixed(0)+'% <span class="dimmer">norm '+norm.toFixed(0)+'%</span></span></div><div class="bar"><i style="width:'+M.storage.toFixed(0)+'%"></i><b style="left:'+norm.toFixed(0)+'%"></b></div></div>';
  $('#shipping').innerHTML=sh;
}

/* ---------- chart ---------- */
const MAP_W=1000,MAP_H=333;
function proj(lat,lon){return[(lon+180)/360*MAP_W,(70-lat)/120*MAP_H];}
function unwrap(pts){const out=[];let prev=null;for(const [lat,lon] of pts){let L=lon;if(prev!==null){while(L-prev>180)L-=360;while(prev-L>180)L+=360;}out.push([lat,L]);prev=L;}return out;}
function routePts(from,to,via){const opts=routeOptions(from,to);const o=opts.find(x=>x.via===via)||opts[0];return unwrap([[REGIONS[from].lat,REGIONS[from].lon],...o.wp.map(k=>WP[k]),[REGIONS[to].lat,REGIONS[to].lon]]);}
function polyStr(pts,off){return pts.map(([lat,lon])=>proj(lat,lon+off).map(v=>v.toFixed(1)).join(',')).join(' ');}
function pointAt(pts,f){
  const P=pts.map(([lat,lon])=>proj(lat,lon));let total=0;const segs=[];
  for(let i=1;i<P.length;i++){const d=Math.hypot(P[i][0]-P[i-1][0],P[i][1]-P[i-1][1]);segs.push(d);total+=d;}
  let t=Math.max(0,Math.min(1,f))*total;
  for(let i=0;i<segs.length;i++){
    if(t<=segs[i]||i===segs.length-1){const r=segs[i]?t/segs[i]:0;const x=P[i][0]+(P[i+1][0]-P[i][0])*r,y=P[i][1]+(P[i+1][1]-P[i][1])*r;const ang=Math.atan2(P[i+1][1]-P[i][1],P[i+1][0]-P[i][0])*180/Math.PI;return{x:((x%MAP_W)+MAP_W)%MAP_W,y,ang};}
    t-=segs[i];
  }
  const l=P[P.length-1];return{x:l[0],y:l[1],ang:0};
}
function renderMap(){
  let g='<svg viewBox="0 0 '+MAP_W+' '+MAP_H+'" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Chart of load ports, discharge ports and active voyages">';
  g+='<rect x="0" y="0" width="'+MAP_W+'" height="'+MAP_H+'" fill="var(--sea)"/>';
  g+='<path d="'+LAND_PATH+'" fill="var(--land)" stroke="var(--coast)" stroke-width="0.5" stroke-linejoin="round"/>';
  for(let lon=-150;lon<=150;lon+=30){const [x]=proj(0,lon);g+='<line x1="'+x.toFixed(1)+'" y1="0" x2="'+x.toFixed(1)+'" y2="'+MAP_H+'" stroke="var(--grat)" stroke-width="0.6"/>';}
  for(let lat=50;lat>=-30;lat-=20){const [,y]=proj(lat,0);g+='<line x1="0" y1="'+y.toFixed(1)+'" x2="'+MAP_W+'" y2="'+y.toFixed(1)+'" stroke="var(--grat)" stroke-width="'+(lat===0?1.2:0.6)+'"'+(lat===0?'':' stroke-dasharray="2 4"')+'/>';
    g+='<text x="4" y="'+(y-3).toFixed(1)+'" font-family="var(--mono)" font-size="8" fill="var(--fg3)">'+(lat===0?'Equator':(lat>0?lat+'°N':(-lat)+'°S'))+'</text>';}
  const canals=[['Panama',9.1,-79.7,M.block.Panama>0?'var(--bad)':M.delay.Panama.weeks>0?'var(--amber)':'var(--fg3)'],['Suez',30.5,32.3,M.block.Suez>0?'var(--bad)':M.delay.Suez.weeks>0?'var(--amber)':'var(--fg3)'],['Cape',-35.5,19,'var(--fg3)'],['Malacca',1.5,103.5,'var(--fg3)']];
  for(const [n,lat,lon,col] of canals){const [x,y]=proj(lat,lon);g+='<g><rect x="'+(x-2.5).toFixed(1)+'" y="'+(y-2.5).toFixed(1)+'" width="5" height="5" transform="rotate(45 '+x.toFixed(1)+' '+y.toFixed(1)+')" fill="'+col+'"/><text x="'+(x+6).toFixed(1)+'" y="'+(y+3).toFixed(1)+'" font-family="var(--mono)" font-size="8" fill="'+col+'">'+n+'</text></g>';}
  // voyages
  for(const v of S.vessels){
    let pts=null,f=0,kind='';
    if(v.status==='ballast'&&v.from&&v.target){pts=routePts(v.from,v.target,v.tvia);f=1-v.daysLeft/(v.totalDays||v.daysLeft||1);kind='ballast';}
    else if((v.status==='laden'||v.status==='float')&&v.cargoId){const c=cargoById(v.cargoId);pts=routePts(c.src,c.dest,c.via);f=1-v.daysLeft/(c.ladenDays||1);kind=v.status;}
    if(!pts)continue;
    const col=kind==='ballast'?'var(--fg3)':kind==='float'?'var(--amber)':'var(--accent)';
    for(const off of [-360,0,360])g+='<polyline points="'+polyStr(pts,off)+'" fill="none" stroke="'+col+'" stroke-width="1.4" '+(kind==='ballast'?'stroke-dasharray="4 4"':'')+' opacity=".85"/>';
    const p=pointAt(pts,f);
    g+='<g transform="translate('+p.x.toFixed(1)+' '+p.y.toFixed(1)+')">'+(kind==='float'?'<circle r="9" fill="none" stroke="var(--amber)" stroke-width="1" opacity=".7"/>':'')+'<path d="M8,0 L-6,4.5 L-3,0 L-6,-4.5 Z" fill="'+col+'" transform="rotate('+p.ang.toFixed(1)+')"/>';
    g+='<text x="10" y="-6" font-family="var(--mono)" font-size="8.5" fill="var(--fg)">'+esc(v.name)+(v.cargoId?' · #'+v.cargoId:'')+'</text></g>';
  }
  for(const k of ALL_REGIONS){
    const Rg=REGIONS[k];const [x,y]=proj(Rg.lat,Rg.lon);const col=Rg.load?'var(--accent)':'var(--amber)';
    const idle=S.vessels.filter(v=>v.region===k&&(v.status==='idle'||v.status==='relet'||v.status==='waiting')).length;
    g+='<g><circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="4" fill="'+col+'"/>'+(idle?'<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="8" fill="none" stroke="'+col+'" stroke-width="1" opacity=".6"/>':'');
    const dx=(k==='NWE'||k==='MED'||k==='JKTC'||k==='CHN'||k==='QAT')?-6:7,anchor=(dx<0)?'end':'start';const dy=(k==='MED'||k==='CHN'||k==='IND')?12:-7;
    g+='<text x="'+(x+dx).toFixed(1)+'" y="'+(y+dy).toFixed(1)+'" text-anchor="'+anchor+'" font-family="var(--display)" font-size="10.5" font-weight="600" letter-spacing=".04em" fill="var(--fg)">'+esc(Rg.port.toUpperCase())+(idle?' ·'+idle:'')+'</text></g>';
  }
  g+='</svg>';
  $('#map').innerHTML=g;
  const sailing=S.vessels.filter(v=>v.status==='laden'||v.status==='float'||v.status==='ballast').length;
  $('#chart-meta').textContent=sailing+' at sea · '+S.vessels.length+' in fleet';
}

/* ---------- tables ---------- */
function renderCargoes(){
  const list=activeCargoes();const used=new Set();
  $('#cargo-meta').textContent=positions()+'/'+slots()+' cargo positions · '+list.filter(c=>c.term).length+' term';
  if(!list.length){$('#cargoes').innerHTML='<div class="empty">No cargoes on the books. Buy from the offer book, pick a ship and a destination.</div>';return;}
  let h='<table class="tbl"><thead><tr><th>#</th><th>Route</th><th>Vessel</th><th class="n">TBtu</th><th class="n">FOB</th><th class="n">Landed</th><th class="n">ETA</th><th class="n">Exp. DES</th><th class="n">MTM</th><th>Price risk</th><th></th></tr></thead><tbody>';
  for(const c of list){
    const v=vesselById(c.vesselId);const e=cargoExpected(c,used);const hg=cargoHedge(c,e);
    let leftover='';if(hg.state==='locked'){let paper=0;for(const x of openHedges())if(x.hub===hg.hub&&x.mkey===hg.mkey)paper+=x.vol;let phys=0;for(const o of list){const eo=o.id===c.id?e:cargoExpected(o,null);if(eo.how==='fixed'||eo.how==='commit')continue;if(REGIONS[o.dest].hub===hg.hub&&monthKeyOf(eo.eta)===hg.mkey)phys+=eo.delivered;}if(paper<-phys-0.05)leftover=' · '+(-paper-phys).toFixed(2)+' TBtu '+HUBS[hg.hub].name+' '+monthLabelKey(hg.mkey)+' paper now outright short';}
    const hgChip='<span class="status '+(hg.state==='locked'||hg.state==='hedged'?'term':hg.state==='open'?'float':hg.state==='over'?'float':'waiting')+'" title="'+esc(hg.text)+'">'+(hg.state==='locked'?'Locked':hg.state==='open'?'Unhedged':hg.state==='partial'?Math.round(hg.cover*100)+'% hedged':hg.state==='hedged'?'Hedged':'Over-hedged')+'</span><span class="sub">'+esc(hg.state==='locked'?hg.text.replace('price locked ','')+leftover:(hg.state==='open'?'long '+HUBS[hg.hub].name+' '+hg.label:HUBS[hg.hub].name+' '+hg.label+' · '+hg.short.toFixed(2)+' of '+hg.phys.toFixed(2)))+'</span>';
    const how=e.how==='fixed'?'<span class="sub">sold W'+c.fixed.week+'</span>':e.how==='commit'?'<span class="sub">'+(e.commit.kind==='term'?'term ':'')+'DES sale #'+e.commit.id+' W'+e.commit.wStart+'–'+e.commit.wEnd+(e.holdWeeks?' · wait '+e.holdWeeks+'w':'')+'</span>':'<span class="sub">curve W'+e.eta+(c.spotOnly?' · spot only':'')+'</span>';
    let st;
    if(c.phase==='waiting')st=statusChip(v)+' <span class="sub">at '+REGIONS[c.src].port+' for laycan W'+c.loadWeek+(v.charter==='spot'?' (delivers then)':'')+', then '+c.ladenDays+' d laden</span>';
    else if(c.phase==='ballast')st=statusChip(v)+' <span class="sub">ballast to '+REGIONS[c.src].port+', '+v.daysLeft+' d, laycan W'+c.loadWeek+', then '+c.ladenDays+' d laden</span>';
    else if(c.phase==='float')st=statusChip(v)+' <span class="sub">'+(c.holdUntil?'holding for window W'+c.holdUntil:'holding '+c.floatWeeks+'w, '+v.daysLeft+' d to go')+'</span>';
    else st=statusChip(v)+' <span class="sub">'+v.daysLeft+' d to go</span>';
    const acts=[];
    const openSale=c.waitFor&&commitById(c.waitFor)&&commitById(c.waitFor).status==='open';
    if(!c.fixed&&!openSale)acts.push(['cFixModal','Sell DES']);
    if(hg.state==='open'||hg.state==='partial')acts.push(['cHedgeModal','Hedge with paper']);
    if(!c.fixed)acts.push(['cSettleModal',c.spotOnly?'Settlement · spot only':c.waitFor?'Settlement · sale #'+c.waitFor:'Settlement']);
    if(!c.fixed)acts.push(['cDivertModal','Divert']);
    if(c.phase==='laden')acts.push(['cFloatModal','Float']);
    if(c.phase==='float')acts.push(['cFloatModal','Resume passage']);
    if(c.phase==='laden'||c.phase==='float')acts.push(['cSowModal','Sell afloat']);
    if(c.phase==='waiting'||c.phase==='ballast')acts.push(['cCancelModal','Cancel lifting','danger']);
    const menu='<div class="menu-wrap"><button class="btn btn-sm" data-act="menu" data-menu="c'+c.id+'">Actions ▾</button><div class="menu" id="menu-c'+c.id+'" hidden>'+acts.map(a=>'<button class="btn btn-sm'+(a[2]==='danger'?' btn-danger':'')+'" data-act="'+a[0]+'" data-arg=\'{"id":'+c.id+'}\'>'+a[1]+'</button>').join('')+'</div></div>';
    h+='<tr><td class="n">'+c.id+(c.term?'<span class="sub">term</span>':'')+'</td><td><span class="name">'+REGIONS[c.src].port+' → '+REGIONS[c.dest].name+'</span><span class="sub">via '+c.via+' · laycan W'+c.loadWeek+(c.fobPaid?'':' · FOB due at loading')+'</span></td><td><span class="name">'+esc(v.name)+'</span><span class="sub">'+st+'</span></td><td class="n">'+((c.phase==='ballast'||c.phase==='waiting')?c.vol:c.volNow).toFixed(2)+'</td><td class="n">'+c.fob.toFixed(2)+'</td><td class="n">'+e.landed.toFixed(2)+'</td><td class="n">W'+e.eta+'</td><td class="n">'+e.price.toFixed(2)+how+'</td><td class="n '+cls(e.mtm)+'">'+fMs(e.mtm)+'</td><td>'+hgChip+'</td><td>'+menu+'</td></tr>';
  }
  $('#cargoes').innerHTML=h+'</tbody></table>';
}
function renderCommits(){
  const list=openCommits();const unsourced=list.filter(k=>!isSourced(k));
  $('#commit-meta').textContent=list.length?unsourced.length+' unsourced · collateral '+fM(commitCollateral()):'none open';
  if(!list.length){$('#commits').innerHTML='<div class="empty">No DES sales. Sell a cargo you hold (Sell DES on its row) or sell forward into a delivery window and source the cargo later.</div>';return;}
  let h='<table class="tbl"><thead><tr><th>#</th><th>Deliver to</th><th>Sourcing</th><th class="n">Sold at</th><th class="n">TBtu</th><th class="n">Window</th><th class="n">Curve</th><th class="n">MTM</th><th class="n">Breach at</th><th></th></tr></thead><tbody>';
  for(const k of list){
    const m=commitMtm(k);const cur=desFwd(k.dest,Math.max(0,k.wEnd-S.w));const notional=k.price*k.vol*1e6;
    const srcd=isSourced(k);const match=srcd?cargoById(k.assigned):activeCargoes().find(c=>{if(c.fixed||c.spotOnly||c.waitFor)return false;const e=cargoExpected(c,null);return e.commit&&e.commit.id===k.id;});
    const srcTxt=srcd?'<span class="status term">Sourced</span> <span class="sub">cargo #'+k.assigned+'</span>':match?'<span class="status waiting">Auto</span> <span class="sub">cargo #'+match.id+' would deliver</span>':'<span class="status">Unsourced</span> <span class="sub">needs a cargo or a buy-back</span>';
    h+='<tr><td class="n">'+k.id+(k.kind==='term'?'<span class="sub">term</span>':'')+'</td><td><span class="name">'+REGIONS[k.dest].name+'</span><span class="sub">'+REGIONS[k.dest].port+'</span></td><td>'+srcTxt+'</td><td class="n">'+k.price.toFixed(2)+'</td><td class="n">'+k.vol.toFixed(2)+'</td><td class="n">W'+k.wStart+'–'+k.wEnd+'</td><td class="n">'+cur.toFixed(2)+'</td><td class="n '+cls(m)+'">'+fMs(m)+'</td><td class="n '+(srcd||k.kind==='term'?'dimmer':'neg')+'">'+(k.kind==='term'?'n/a':srcd?'covered':fM(-CREDIT_BREACH*notional))+'</td><td><div class="acts">'+(k.kind==='term'?'<span class="dimmer" style="font-size:11px">deliver or default</span>':'<button class="btn btn-sm" data-act="kCoverModal" data-arg=\'{"id":'+k.id+'}\'>Buy back</button>')+'</div></td></tr>';
  }
  $('#commits').innerHTML=h+'</tbody></table>';
}
function renderContracts(){
  const signed=Object.keys(CONTRACTS).filter(id=>S.contracts[id]&&S.contracts[id].signed);
  $('#contract-meta').textContent=signed.length+' signed · obligations outside the desk limit';
  let h='<div class="contracts">';
  for(const id in CONTRACTS){
    const def=CONTRACTS[id];const c=S.contracts[id]||{};
    h+='<div class="contract"><div class="t">'+def.name+' <span class="dimmer" style="font-family:var(--body);font-weight:400;font-size:12px">· every '+def.every+' w · ≈ '+(52/def.every*3.70/51.7).toFixed(1)+' mtpa</span></div><div class="terms">'+(c.signed?contractLabel(id):'today: '+contractLabel(id,contractTermsNow(id)))+'</div><p>'+def.desc+'</p>';
    if(!c.signed){h+='<div class="ob"><span class="dimmer">unsigned · first '+(def.side==='buy'?'laycan':'window')+' W'+(S.w+def.lead+1)+' if signed now, then every '+def.every+' w to W'+WEEKS+'</span><button class="btn btn-sm btn-primary" data-act="signModal" data-arg=\'{"id":"'+id+'"}\'>Sign</button></div>';}
    else{
      h+='<div class="ob"><span>Signed W'+c.signed+' · first '+(def.side==='buy'?'laycan':'window')+' W'+(c.signed+def.lead+1)+' · next W'+(c.next||'-')+' · every '+def.every+' w</span></div>';
      if(def.side==='buy'){for(const o of S.offers.filter(x=>x.kind==='term'&&x.contractId===id&&!x.taken)){h+='<div class="ob"><span>Laycan <b class="mono">W'+o.loadWeek+'</b> at <b class="mono">'+fP(o.price)+'</b>'+(o.loadWeek-S.w<=1?' <span class="flag bad">due</span>':'')+'</span><span style="display:flex;gap:4px"><button class="btn btn-sm btn-primary" data-act="buyModalOffer" data-arg=\'{"id":'+o.id+'}\'>Lift</button><button class="btn btn-sm btn-danger" data-act="cancelOfferModal" data-arg=\'{"id":'+o.id+'}\'>Cancel</button></span></div>';}}
      else{for(const k of openCommits().filter(x=>x.kind==='term'&&x.contractId===id)){const match=activeCargoes().find(cc=>{if(cc.fixed||cc.spotOnly)return false;const e=cargoExpected(cc,null);return e.commit&&e.commit.id===k.id;});h+='<div class="ob"><span>Window <b class="mono">W'+k.wStart+'–'+k.wEnd+'</b> at <b class="mono">'+fP(k.price)+'</b> · #'+k.id+'</span><span class="'+(match?'pos':'amber')+'">'+(match?'cargo #'+match.id:'unsourced')+'</span></div>';}}
    }
    h+='</div>';
  }
  $('#contracts').innerHTML=h+'</div>';
}
function renderHedges(){
  const list=openHedges();const hm=hedgeMargin();
  $('#hedge-meta').textContent=hedgeVolOpen().toFixed(1)+'/'+hedgeCap().toFixed(1)+' TBtu · margin '+fM(hm.total);
  if(!list.length){$('#hedges').innerHTML='<div class="empty">No paper. Buy or sell a TTF, JKM or Henry Hub month contract to hedge a cargo or take a view; margin is held from free cash.</div>';return;}
  let h='<table class="tbl"><thead><tr><th>#</th><th>Contract</th><th class="n">TBtu</th><th class="n">Price</th><th class="n">Mark</th><th class="n">MTM</th><th></th></tr></thead><tbody>';
  for(const x of list){const m=hedgeMtm(x);const cur=hedgeMark(x);const started=S.w>=x.wStart;
    h+='<tr><td class="n">'+x.id+'</td><td><span class="name">'+HUBS[x.hub].name+' '+x.label+'</span><span class="sub">'+(x.vol>0?'long':'short')+' · W'+x.wStart+'–'+x.wEnd+' · opened W'+x.opened+' · settles W'+x.wEnd+' on the month average'+(started?' ('+(S.w-x.wStart+1)+' of '+(x.wEnd-x.wStart+1)+' weeks fixed)':'')+'</span></td><td class="n">'+(x.vol>0?'+':'−')+Math.abs(x.vol).toFixed(2)+'</td><td class="n">'+x.price.toFixed(2)+'</td><td class="n">'+cur.toFixed(2)+'</td><td class="n '+cls(m)+'">'+fMs(m)+'</td><td><div class="acts"><button class="btn btn-sm" data-act="hCloseModal" data-arg=\'{"id":'+x.id+'}\'>Close</button></div></td></tr>';}
  $('#hedges').innerHTML=h+'</tbody></table>';
}
function renderFleet(){
  $('#fleet-meta').textContent=termFleet().length+'/'+fleetCap()+' term · '+S.vessels.filter(v=>v.charter==='spot').length+' spot';
  if(!S.vessels.length){$('#fleet').innerHTML='<div class="empty">No tonnage. Charter a term vessel or fix spot when you buy a cargo.</div>';return;}
  let h='<table class="tbl"><thead><tr><th>Vessel</th><th>Charter</th><th>Status</th><th class="n">Hire / week</th><th></th></tr></thead><tbody>';
  for(const v of S.vessels){
    const vt=VTYPES[v.type];
    const ch=v.charter==='term'?'<span class="name">Term</span><span class="sub">'+fK(v.hire)+'/d to W'+v.termEnds+(S.w>=v.termEnds?' · extended':'')+'</span>':'<span class="name">Spot</span><span class="sub">'+fK(v.hire)+'/d · redelivers on discharge</span>';
    let where='';
    if(v.status==='idle')where='at '+REGIONS[v.region].port+(v.charter==='term'?' · awaiting orders, hire running':'');
    else if(v.status==='relet')where='at '+REGIONS[v.region].port+' · sublet, back W'+v.reletEnds+' · earns '+fK(v.reletRate)+'/d';
    else if(v.status==='ballast')where='to '+REGIONS[v.target].port+' via '+v.tvia+' · '+v.daysLeft+' d to go';
    else if(v.status==='waiting'){const c=cargoById(v.cargoId);where=c?'at '+REGIONS[c.src].port+' for laycan W'+c.loadWeek+' (cargo #'+c.id+')'+(v.charter==='spot'?' · delivers then, no hire yet':' · hire running'):'';}
    else if(v.status==='float'){const c=cargoById(v.cargoId);where=c?'holding cargo #'+c.id+' off '+REGIONS[c.dest].port+' for '+c.floatWeeks+' w · not moving until released · '+v.daysLeft+' d to go after':'';}
    else{const c=cargoById(v.cargoId);where=c?'cargo #'+c.id+' to '+REGIONS[c.dest].port+' via '+c.via+' · '+v.daysLeft+' d to go':'';}
    const acts=[];
    if(v.status==='float'&&v.cargoId)acts.push('<button class="btn btn-sm btn-primary" data-act="cFloatModal" data-arg=\'{"id":'+v.cargoId+'}\'>Resume</button>');
    if(v.status==='idle'&&v.charter==='term'){acts.push('<div class="menu-wrap"><button class="btn btn-sm" data-act="menu" data-menu="v'+v.id+'">Actions ▾</button><div class="menu" id="menu-v'+v.id+'" hidden><button class="btn btn-sm" data-act="vReposModal" data-arg=\'{"id":'+v.id+'}\'>Reposition</button><button class="btn btn-sm" data-act="vReletModal" data-arg=\'{"id":'+v.id+'}\'>Relet</button><button class="btn btn-sm btn-danger" data-act="vTermModal" data-arg=\'{"id":'+v.id+'}\'>Redeliver early</button></div></div>');}
    h+='<tr><td><span class="name">'+esc(v.name)+'</span><span class="sub">'+vt.name+' · '+vt.cap+'k m³ · '+vt.tbtu.toFixed(2)+' TBtu · burns '+vt.bor.toFixed(2)+'%/d</span></td><td>'+ch+'</td><td>'+statusChip(v)+' <span class="sub">'+where+'</span></td><td class="n">'+fM(v.hire*7)+'</td><td><div class="acts">'+acts.join('')+'</div></td></tr>';
  }
  $('#fleet').innerHTML=h+'</tbody></table>';
}
function renderDone(){
  const items=[];
  for(const c of S.cargoes)if(c.sold||c.phase==='done')items.push({w:c.sold?c.soldWeek:c.doneWeek,id:'#'+c.id,what:REGIONS[c.src].port+' → '+REGIONS[c.dest].name,how:c.sold?'sold afloat':(c.priceHow||''),res:c.result});
  for(const k of S.commits)if(k.status!=='open')items.push({w:k.closed,id:'DES sale #'+k.id,what:REGIONS[k.dest].name+' at '+fP(k.price)+(k.fulfilledBy?' · cargo #'+k.fulfilledBy:''),how:k.status,res:k.result==null?0:k.result});
  for(const c of S.cargoes)if(c.phase==='cancelled')items.push({w:c.doneWeek,id:'#'+c.id,what:REGIONS[c.src].port+' laycan W'+c.loadWeek,how:'cancelled',res:c.result});
  for(const x of (S.hedges||[]))if(x.status!=='open')items.push({w:x.closed,id:'Paper #'+x.id,what:HUBS[x.hub].name+' '+(x.label||('W'+x.week))+' '+(x.vol>0?'long':'short')+' '+Math.abs(x.vol).toFixed(2)+' TBtu at '+fP(x.price),how:x.status+(x.exit?' at '+fP(x.exit):''),res:x.result||0});
  items.sort((a,b)=>b.w-a.w);
  $('#done-meta').textContent=items.length+' closed';
  if(!items.length){$('#done').innerHTML='<div class="empty">Nothing delivered yet.</div>';return;}
  let h='<table class="tbl"><thead><tr><th class="n">W</th><th>Position</th><th>Settled as</th><th class="n">Result</th></tr></thead><tbody>';
  for(const it of items.slice(0,10))h+='<tr><td class="n">'+it.w+'</td><td><span class="name">'+it.id+'</span><span class="sub">'+it.what+'</span></td><td>'+it.how+'</td><td class="n '+cls(it.res)+'">'+fMs(it.res)+'</td></tr>';
  $('#done').innerHTML=h+'</tbody></table>';
}

/* ---------- desk ---------- */
function renderNews(){
  const recent=S.news.filter(n=>S.w-n.week<=NEWS_KEEP_WEEKS);
  const unread=recent.filter(n=>!n.read).length;$('#news-meta').textContent=(unread?unread+' unread · ':'')+'last '+NEWS_KEEP_WEEKS+' weeks · events hit prices a week after they appear';
  if(!recent.length){$('#news').innerHTML='<div class="empty">Quiet tape: nothing in the last '+NEWS_KEEP_WEEKS+' weeks.</div>';return;}
  let h='';
  for(const n of recent){
    const when=n.kind==='story'?'':n.impactWeek>S.w?'hits W'+n.impactWeek:'in prices since W'+n.impactWeek;
    const tags=n.tags.map(t=>'<span class="chip '+(t.includes('▲')?'up':t.includes('▼')?'down':t==='developing'?'story':'')+'">'+esc(t)+'</span>').join('');
    h+='<div class="news-item'+(n.read?' read':'')+'" data-act="newsRead" data-arg=\'{"id":'+n.id+'}\' tabindex="0"><div class="dot"></div><div><h4>'+esc(n.title)+'</h4><p>'+esc(n.body)+'</p><div class="when"><span>W'+n.week+'</span>'+(when?'<span>· '+when+'</span>':'')+tags+'</div></div></div>';
  }
  $('#news').innerHTML=h;
}
function renderStory(){
  const p=$('#storyPanel');if(!S.story){p.hidden=true;return;}
  const def=STORIES.find(x=>x.id===S.story.id);p.hidden=false;
  $('#story-meta').textContent='week '+(S.story.stage+1)+' of '+def.stages.length;
  let h='<div style="font-family:var(--display);font-weight:700;font-size:16px">'+esc(def.title)+'</div><p style="margin:4px 0 0;font-size:13px;color:var(--fg2)">'+esc(def.stages[S.story.stage])+'</p><div class="odds">';
  for(const k in def.outcomes){const o=def.outcomes[k];const pc=Math.round(S.story.odds[k]*100);const col=o.tone>0?'var(--bad)':o.tone<0?'var(--good)':'var(--fg3)';h+='<div class="o"><div><div>'+esc(o.label)+'</div><div class="bar"><i style="width:'+pc+'%;background:'+col+'"></i></div></div><div class="pct">'+pc+'%</div></div>';}
  h+='</div><div class="dimmer" style="font-size:11px;margin-top:8px">Resolves on the final week. Bullish outcomes land harder in backwardation, bearish ones in contango.</div>';
  $('#story').innerHTML=h;
}
function renderAnalyst(){
  const rep=analystReport();
  let h='<div class="analyst"><div class="avatar">IH</div><div><div class="who">'+ANALYST.name+'</div><div class="role">'+ANALYST.role+'</div>'+rep.calls.map(c=>'<p>'+esc(c)+'</p>').join('')+'</div></div>';
  h+='<table class="nb"><thead><tr><th>Netbacks, spot XDF</th><th class="n">ETA</th><th class="n">Landed</th><th class="n">DES</th><th class="n">$/MMBtu</th></tr></thead><tbody>';
  for(const r of rep.rows.slice(0,6)){const p=r.plan;h+='<tr'+(r.open?'':' style="opacity:.45"')+'><td>'+REGIONS[r.src].port+' → '+REGIONS[r.dest].name+' <span class="dimmer">'+p.via+'</span></td><td class="n">W'+p.eta+'</td><td class="n">'+p.landed.toFixed(2)+'</td><td class="n">'+p.price.toFixed(2)+'</td><td class="n '+cls(p.perMMBtu)+'">'+fPs(p.perMMBtu)+'</td></tr>';}
  $('#analyst').innerHTML=h+'</tbody></table>';
}
function renderFin(){
  const u=unrealised(),net=netPnl();
  const hm=hedgeMargin();const hedgeU=openHedges().reduce((s,x)=>s+hedgeMtm(x),0);
  let h='<div class="fin"><span class="k">Cash</span><span class="v">'+fM(S.cash)+'</span><span class="k">Collateral held <span class="dimmer">(forward sales '+fM(commitCollateral())+' · paper margin '+fM(hm.im)+(hm.variation?' + variation '+fM(hm.variation):'')+')</span></span><span class="v">'+fM(collateral())+'</span><span class="k">Free cash</span><span class="v">'+fM(availableCash())+'</span><span class="k">Paper P&amp;L <span class="dimmer">(realised '+fMs(S.hedgePnl||0)+', open '+fMs(hedgeU)+')</span></span><span class="v '+cls((S.hedgePnl||0)+hedgeU)+'">'+fMs((S.hedgePnl||0)+hedgeU)+'</span><span class="k">Realised P&amp;L</span><span class="v '+cls(S.realised)+'">'+fMs(S.realised)+'</span><span class="k">Unrealised (marked to curve)</span><span class="v '+cls(u)+'">'+fMs(u)+'</span><span class="k">Fleet overhead (idle hire, positioning, penalties)</span><span class="v neg">'+fM(-S.overhead)+'</span><span class="k">Relet income</span><span class="v pos">'+fMs(S.reletIncome)+'</span><span class="k total">Net P&amp;L</span><span class="v total '+cls(net)+'">'+fMs(net)+'</span></div>';
  const ht=S.hireTotal||0,ho=S.hireOverhead||0;
  let hDone=0,hOpen=0;for(const c of S.cargoes){const x=c.cost&&c.cost.hire||0;if(c.sold||c.phase==='done')hDone+=x;else hOpen+=x;}
  h+='<div class="lbl" style="margin-top:12px">Charter hire paid to date · where it sits in Net P&amp;L</div><div class="kv" style="font-size:12px"><span class="k">Total hire, term and spot</span><span class="v">'+fM(ht)+'</span><span class="k">On delivered or sold cargoes <span class="dimmer">→ already inside Realised P&amp;L</span></span><span class="v">'+fM(hDone)+'</span><span class="k">On cargoes still afloat or positioning <span class="dimmer">→ inside Unrealised P&amp;L, with the rest of the voyage still to pay</span></span><span class="v">'+fM(hOpen)+'</span><span class="k">Idle, relet periods and early redelivery <span class="dimmer">→ the Fleet overhead line</span></span><span class="v">'+fM(ho)+'</span></div><div class="dimmer" style="font-size:11px;margin-top:6px">Net P&amp;L = Realised + Unrealised − Fleet overhead + Relet income, so each dollar of hire above is counted exactly once.</div>';
  h+='<div class="lbl" style="margin-top:12px">Desk level · gross realised '+fM(S.gross)+'</div><div class="levelbox">'+LEVELS.map((l,i)=>'<div class="'+(S.level>=i+1?'on':'')+'">L'+(i+1)+'<br>'+l.slots+' pos<br>'+(l.slots+1)+' term<br>'+(i?'$'+(l.at/1e6)+'M':'start')+'</div>').join('')+'</div><div class="dimmer" style="font-size:11px;margin-top:6px">Each level adds one position and one term-charter berth (term fleet cap = positions + 1). Spot fixtures are not capped.</div>';
  h+='<div class="kv" style="margin-top:10px;font-size:12px"><span class="k">Cargoes bought · delivered</span><span class="v">'+S.stats.bought+' · '+S.stats.delivered+'</span><span class="k">Forward sales met · defaulted · breached</span><span class="v">'+S.stats.fulfilled+' · '+S.stats.defaults+' · '+S.stats.breaches+'</span><span class="k">Best single trade</span><span class="v pos">'+fMs(S.stats.bestTrade)+'</span><span class="k">Term fleet laden days</span><span class="v">'+(S.stats.termDays?Math.round(100*S.stats.ladenDays/S.stats.termDays):0)+'%</span></div>';
  $('#fin').innerHTML=h;
}
function renderLog(){$('#log').innerHTML=S.log.slice(0,30).map(l=>'<li class="'+l.kind+'"><span class="w">W'+l.w+'</span><span>'+esc(l.text)+'</span></li>').join('');}
function renderAll(){if(!S)return;renderTop();renderMarket();renderMap();renderCargoes();renderCommits();renderContracts();renderHedges();renderFleet();renderDone();renderNews();renderStory();renderAnalyst();renderFin();renderLog();}

/* ---------- modals: buy ---------- */
function econRows(p){
  const rows=[];
  rows.push(['h','Cargo · '+(p.offer&&p.offer.kind==='term'?'term laycan':'tender')+' W'+p.loadWeek+(p.loadWeek>S.w?' (in '+(p.loadWeek-S.w)+' w)':' (loads now)')]);
  rows.push(['FOB '+REGIONS[p.src].port+' × '+p.vol.toFixed(2)+' TBtu, payable at loading',fP(p.fob)+'/MMBtu',fM(p.cargoCost)]);
  rows.push(['h','Freight · '+VTYPES[p.vt.key].name+(p.charterKind==='spot'?' spot':' term')+' at '+fK(p.rate)+'/d']);
  rows.push(['Hire · '+(p.ballast?p.ballast+' d ballast + ':'')+(p.wait?p.wait+' d waiting + ':'')+p.laden+' d laden'+(p.bonus?' + '+p.bonus+' d round-trip':''),'',fM(p.hire)]);
  if(p.fuel)rows.push(['Heel burn on the ballast leg · '+p.ballast+' d of LNG at the hub price','',fM(p.fuel)]);
  if(p.toll)rows.push(['Canal tolls · '+p.via+(p.bvia&&p.bvia!=='Direct'&&p.bvia!=='Cape'?' + ballast '+p.bvia:''),'',fM(p.toll)]);
  rows.push(['Port fees'+(p.charterKind==='spot'?' + positioning':''),'',fM(p.fees)]);
  rows.push(['Boil-off burned as fuel · '+p.vt.bor.toFixed(2)+'%/d × '+p.laden+' d',(p.lost).toFixed(3)+' TBtu','delivered '+p.delivered.toFixed(2)]);
  rows.push(['Freight per delivered MMBtu','',fP(p.freightPer)]);
  rows.push(['h','Delivery']);
  rows.push(['Landed cost',fP(p.landed)+'/MMBtu',fM(p.cost)]);
  rows.push([(p.commit?'DES sale #'+p.commit.id+' (window W'+p.commit.wStart+'–'+p.commit.wEnd+')':'Curve DES '+REGIONS[p.dest].name+' at W'+p.eta),fP(p.price)+'/MMBtu',fM(p.rev)]);
  rows.push(['tot','Expected margin',fPs(p.perMMBtu)+'/MMBtu',fMs(p.margin)]);
  rows.push(['Cash needed now · at loading W'+p.loadWeek,fM(p.upfront),fM(p.atLoading)]);
  return'<div class="econ">'+rows.map(r=>r[0]==='h'?'<span class="h">'+r[1]+'</span>':r[0]==='tot'?'<span class="k tot">'+r[1]+'</span><span class="v tot '+cls(p.margin)+'">'+r[2]+'</span><span class="v tot '+cls(p.margin)+'">'+r[3]+'</span>':'<span class="k">'+r[0]+'</span><span class="v">'+r[1]+'</span><span class="v">'+r[2]+'</span>').join('')+'</div>';
}
function buyModal(offerId){
  UI.buy={offer:offerId||null,vessel:null,dest:null,via:null};
  openModal('Buy FOB cargo','');UI.modal='buy';renderBuy();
  const o=offerId?offerById(offerId):null;const err=canBuy(o&&o.kind==='term');if(err)setErr(err);
}
function renderBuy(){
  const b=UI.buy;let h='';const offers=liveOffers();
  h+='<div class="step"><div class="lbl"><b>1</b>Offer book <span class="dimmer" style="letter-spacing:0;text-transform:none;font-family:var(--body);font-weight:400">· tenders close this week; term laycans stay open until the laycan</span></div>';
  if(!offers.length)h+='<div class="note">No cargoes on offer this week. New tenders are published every week; outages at a port suspend its offers.</div>';
  h+='<div class="cards">';
  for(const o of offers){const Rg=REGIONS[o.src];const d=o.price-M.fob[o.src];const sel=b.offer===o.id;
    h+='<button class="card'+(sel?' sel':'')+'" data-act="buyPick" data-arg=\'{"id":'+o.id+'}\'><span class="t">'+Rg.port+(o.kind==='term'?' <span class="flag good">term</span>':'')+'</span><span class="s">'+Rg.name+' · laycan W'+o.loadWeek+(o.loadWeek>S.w?' · in '+(o.loadWeek-S.w)+' w':' · now')+'</span><span class="p">'+fP(o.price)+'</span><span class="m">'+(d>=0?'+':'−')+'$'+Math.abs(d).toFixed(2)+' to marker</span></button>';}
  h+='</div></div>';
  const offer=b.offer?offerById(b.offer):null;
  if(offer){
    const src=offer.src;
    h+='<div class="step"><div class="lbl"><b>2</b>Vessel · must be at '+REGIONS[src].port+' by W'+offer.loadWeek+'</div><div class="cards">';
    const basin=REGIONS[src].basin;
    for(const v of S.vessels.filter(x=>x.status==='idle')){const vt=VTYPES[v.type];let pos='',off=false;
      if(v.region!==src){const br=bestRoute(v.region,src,vt,v.hire);if(br){const arr=S.w+Math.ceil(br.days/7);off=arr>offer.loadWeek;pos=off?'ballast '+br.days+' d: arrives W'+arr+', misses the laycan':'ballast '+br.days+' d from '+REGIONS[v.region].port+', arrives W'+arr+(arr<offer.loadWeek?', waits '+(offer.loadWeek-arr)+' w':'');}else{off=true;pos='no route';}}
      else pos=offer.loadWeek>S.w?'on the berth, waits '+(offer.loadWeek-S.w)+' w on hire':'on the berth at '+REGIONS[src].port;
      const sel=b.vessel&&b.vessel.kind==='fleet'&&b.vessel.id===v.id;
      h+='<button class="card'+(sel?' sel':'')+(off?' off':'')+'" data-act="buyVessel" data-arg=\'{"kind":"fleet","id":'+v.id+'}\''+(off?' disabled':'')+'><span class="t">'+esc(v.name)+'</span><span class="s">'+vt.name+' · '+vt.tbtu.toFixed(2)+' TBtu · term '+fK(v.hire)+'/d</span><span class="m">'+pos+'</span></button>';}
    for(const t of ['XDF','TFDE','STEAM']){const vt=VTYPES[t];const rate=spotRate(t,basin);const sel=b.vessel&&b.vessel.kind==='spot'&&b.vessel.type===t;
      h+='<button class="card'+(sel?' sel':'')+'" data-act="buyVessel" data-arg=\'{"kind":"spot","type":"'+t+'"}\'><span class="t">Spot '+vt.name+'</span><span class="s">'+vt.cap+'k m³ · '+vt.tbtu.toFixed(2)+' TBtu · burns '+vt.bor.toFixed(2)+'%/d</span><span class="m">'+fK(rate)+'/d'+(M.spotTight[basin]>0?' <span class="amber">tight +50%</span>':'')+' · delivered at the laycan</span></button>';}
    h+='</div></div>';
  }
  let plan=null;
  if(offer&&b.vessel){
    const src=offer.src;
    const vk=b.vessel.kind==='fleet'?vesselById(b.vessel.id).type:b.vessel.type;
    const ck=b.vessel.kind==='fleet'?'term':'spot';
    const rate=b.vessel.kind==='fleet'?vesselById(b.vessel.id).hire:spotRate(vk,REGIONS[src].basin);
    const from=b.vessel.kind==='fleet'?vesselById(b.vessel.id).region:null;
    const opts=destOptions(src,vk,ck,rate,from,offer);
    h+='<div class="step"><div class="lbl"><b>3</b>Destination and routing <span class="dimmer" style="letter-spacing:0;text-transform:none;font-family:var(--body);font-weight:400">· margin against the curve at arrival</span></div><div class="cards">';
    for(const o of opts){const p=o.best;const sel=b.dest===o.dest;const off=M.demandOff[o.dest]>0;
      h+='<button class="card'+(sel?' sel':'')+'" data-act="buyDest" data-arg=\'{"dest":"'+o.dest+'","via":"'+p.via+'"}\'><span class="t">'+REGIONS[o.dest].name+'</span><span class="s">'+REGIONS[o.dest].port+' · via '+p.via+' · W'+p.eta+(p.commit?' · meets #'+p.commit.id:'')+(off?' · <span class="amber">demand off</span>':'')+'</span><span class="p '+cls(p.margin)+'">'+fMs(p.margin)+'</span><span class="m">'+fPs(p.perMMBtu)+'/MMBtu · DES '+fP(p.price)+'</span></button>';}
    h+='</div>';
    if(b.dest){const o=opts.find(x=>x.dest===b.dest);if(o){h+='<div class="chips">'+o.opts.map(p=>'<button class="chip-btn'+(b.via===p.via?' sel':'')+'" data-act="buyVia" data-arg=\'{"via":"'+p.via+'"}\'>via '+p.via+' · '+p.laden+' d · '+fMs(p.margin)+'</button>').join('')+'</div>';plan=o.opts.find(p=>p.via===b.via)||o.best;}}
    h+='</div>';
  }
  if(plan){h+='<div class="step"><div class="lbl"><b>4</b>Economics</div>'+econRows(plan)+(plan.commit?'<div class="note">This cargo would deliver against DES sale #'+plan.commit.id+' at '+fP(plan.commit.price)+' if it arrives in the W'+plan.commit.wStart+' to W'+plan.commit.wEnd+' window.</div>':'')+(plan.charterKind==='spot'?'<div class="note">Spot fixture: the ship is delivered at the laycan, hire covers the laden passage plus a round-trip allowance, and she redelivers on discharge.</div>':plan.wait?'<div class="note">'+esc(vesselById(b.vessel.id).name)+' will sit on hire for '+plan.wait+' days waiting for the laycan; that hire is part of this cargo\'s cost.</div>':'')+'</div>';}
  UI.buyPlan=plan;
  $('#sheetBody').innerHTML=h;
  $('#sheetFoot').innerHTML='<span class="dim" style="margin-right:auto;font-size:12px;align-self:center">Free cash '+fM(availableCash())+' · positions '+positions()+'/'+slots()+'</span><button class="btn" data-act="closeModal">Cancel</button><button class="btn btn-primary" data-act="buyConfirm"'+(plan?'':' disabled')+'>Confirm lifting</button>';
}
/* ---------- modals: forward sale ---------- */
function fwdModal(){UI.fwd={dest:'NWE',week:S.w+6,vol:3.70};openModal('Sell DES forward','');UI.modal='fwd';renderFwd();if(S.over)setErr('The simulation has ended.');}
function renderFwd(){
  const f=UI.fwd;const k=f.week-S.w;const spread=physSpread(f.dest,k,f.vol);const price=desFwd(f.dest,k)-spread;const notional=price*f.vol*1e6;
  let h='<p class="dim" style="margin:0;font-size:13px;max-width:65ch">Sell a cargo you do not hold yet: commit to deliver at a discharge port inside a two-week window at today\'s curve less the bid-offer, then source it. Until a cargo is assigned (Settlement on a cargo row, or auto-matching on arrival) the sale is unsourced, carries collateral and can breach. To sell a cargo you already hold, use Sell DES on its row instead.</p>';
  h+='<div class="step"><div class="lbl">Deliver to</div><div class="chips">'+DESTS.map(d=>'<button class="chip-btn'+(f.dest===d?' sel':'')+'" data-act="fwdDest" data-arg=\'{"dest":"'+d+'"}\'>'+REGIONS[d].name+'</button>').join('')+'</div></div>';
  const weeks=[];for(let w=S.w+3;w<=Math.min(WEEKS-1,S.w+16);w++)weeks.push(w);
  h+='<div class="step"><div class="lbl">Delivery window</div><div class="chips">'+weeks.map(w=>'<button class="chip-btn'+(f.week===w?' sel':'')+'" data-act="fwdWeek" data-arg=\'{"week":'+w+'}\'>W'+(w-(WINDOW_WEEKS-1))+'–'+w+'</button>').join('')+'</div></div>';
  h+='<div class="step"><div class="lbl">Volume</div><div class="chips">'+[3.05,3.40,3.70].map(v=>'<button class="chip-btn'+(f.vol===v?' sel':'')+'" data-act="fwdVol" data-arg=\'{"vol":'+v+'}\'>'+v.toFixed(2)+' TBtu</button>').join('')+'</div></div>';
  h+='<div class="econ"><span class="k">Curve DES '+REGIONS[f.dest].name+' at W'+f.week+'</span><span class="v">'+fP(desFwd(f.dest,k))+'</span><span class="v"></span><span class="k">Bid-offer · '+liqLabel(REGIONS[f.dest].hub)+' '+HUBS[REGIONS[f.dest].hub].name+', '+k+' weeks out, '+f.vol.toFixed(2)+' TBtu</span><span class="v">'+fPs(-spread)+'</span><span class="v"></span><span class="k">Sale price</span><span class="v">'+fP(price)+'/MMBtu</span><span class="v">'+fM(notional)+'</span><span class="k">Collateral held ('+(COLLATERAL*100)+'%)</span><span class="v"></span><span class="v">'+fM(COLLATERAL*notional)+'</span><span class="k">Credit line breach at a mark-to-market loss of</span><span class="v"></span><span class="v neg">'+fM(-CREDIT_BREACH*notional)+'</span><span class="k">Default if no cargo delivered in W'+(f.week-(WINDOW_WEEKS-1))+'–'+f.week+'</span><span class="v"></span><span class="v neg">buyer\'s cover + '+(DEFAULT_PEN*100)+'%</span></div>';
  $('#sheetBody').innerHTML=h;
  $('#sheetFoot').innerHTML='<span class="dim" style="margin-right:auto;font-size:12px;align-self:center">Free cash '+fM(availableCash())+' · forward sales are limited by collateral, not by desk positions</span><button class="btn" data-act="closeModal">Cancel</button><button class="btn btn-primary" data-act="fwdConfirm">Sell forward</button>';
}
/* ---------- modals: charter ---------- */
function charterModal(){UI.ch={type:'XDF',weeks:52,region:'USGC'};openModal('Charter term vessel','');UI.modal='ch';renderCharter();}
function renderCharter(){
  const c=UI.ch;const rate=tcRate(c.type,c.weeks);
  let h='<p class="dim" style="margin:0;font-size:13px;max-width:65ch">Term hire is paid every day whether the ship is working or not. Term tonnage prices below spot when the spot market is firm, longer commitments cost less per day, and the ship must be positioned by you. Your desk can run '+fleetCap()+' term vessels at level '+S.level+'.</p>';
  h+='<div class="step"><div class="lbl">Type</div><div class="cards">'+['XDF','TFDE','STEAM'].map(t=>{const vt=VTYPES[t];return'<button class="card'+(c.type===t?' sel':'')+'" data-act="chType" data-arg=\'{"type":"'+t+'"}\'><span class="t">'+vt.name+'</span><span class="s">'+vt.cap+'k m³ · '+vt.tbtu.toFixed(2)+' TBtu · burns '+vt.bor.toFixed(2)+'%/d laden · heel '+vt.heel.toLocaleString()+' MMBtu/d in ballast</span><span class="p">'+fK(tcRate(t,c.weeks))+'/d</span></button>';}).join('')+'</div></div>';
  h+='<div class="step"><div class="lbl">Duration</div><div class="chips">'+[26,52,78].map(w=>'<button class="chip-btn'+(c.weeks===w?' sel':'')+'" data-act="chWeeks" data-arg=\'{"weeks":'+w+'}\'>'+w+' weeks · '+fK(tcRate(c.type,w))+'/d</button>').join('')+'</div></div>';
  h+='<div class="step"><div class="lbl">Delivery port</div><div class="chips">'+ALL_REGIONS.map(r=>'<button class="chip-btn'+(c.region===r?' sel':'')+'" data-act="chRegion" data-arg=\'{"region":"'+r+'"}\'>'+REGIONS[r].port+'</button>').join('')+'</div></div>';
  h+='<div class="econ"><span class="k">Hire</span><span class="v">'+fK(rate)+'/d</span><span class="v">'+fM(rate*7)+'/week</span><span class="k">Commitment over '+c.weeks+' weeks</span><span class="v"></span><span class="v">'+fM(rate*7*c.weeks)+'</span><span class="k">Spot today for comparison</span><span class="v">'+fK(typeRate(c.type))+'/d</span><span class="v"></span><span class="k">Early redelivery penalty</span><span class="v"></span><span class="v">'+(EARLY_TERM*100)+'% of remaining hire</span></div>';
  $('#sheetBody').innerHTML=h;
  $('#sheetFoot').innerHTML='<button class="btn" data-act="closeModal">Cancel</button><button class="btn btn-primary" data-act="chConfirm">Sign charter</button>';
}

/* ---------- modals: vessel ---------- */
function reposModal(id){UI.repos={id,region:null};openModal('Reposition vessel','');UI.modal='repos';renderRepos();}
function renderRepos(){
  const r=UI.repos;const v=vesselById(r.id);const vt=VTYPES[v.type];
  let h='<p class="dim" style="margin:0;font-size:13px">'+esc(v.name)+' is idle at '+REGIONS[v.region].port+'. Ballast her to a load port ahead of a lifting. Hire and fuel on the leg are fleet overhead.</p><div class="cards">';
  for(const k of ALL_REGIONS){if(k===v.region)continue;const br=bestRoute(v.region,k,vt,v.hire);if(!br)continue;const cost=br.days*(v.hire+heelDay(vt,v.region))+0.6*(TOLL[br.opt.via]||0);
    h+='<button class="card'+(r.region===k?' sel':'')+'" data-act="reposRegion" data-arg=\'{"region":"'+k+'"}\'><span class="t">'+REGIONS[k].port+'</span><span class="s">'+REGIONS[k].name+' · via '+br.opt.via+'</span><span class="m">'+br.days+' d · '+fM(cost)+'</span></button>';}
  $('#sheetBody').innerHTML=h+'</div>';
  $('#sheetFoot').innerHTML='<button class="btn" data-act="closeModal">Cancel</button><button class="btn btn-primary" data-act="reposConfirm"'+(r.region?'':' disabled')+'>Sail in ballast</button>';
}
function reletModal(id){UI.relet={id,weeks:8};openModal('Relet vessel','');UI.modal='relet';renderRelet();}
function renderRelet(){
  const r=UI.relet;const v=vesselById(r.id);const rate=Math.round(spotRate(v.type,REGIONS[v.region].basin)*0.95);const net=(rate-v.hire)*7;
  let h='<p class="dim" style="margin:0;font-size:13px">Sublet '+esc(v.name)+' to another charterer at 95% of today\'s spot rate. You keep paying your own hire and collect theirs. The ship is unavailable until redelivery at '+REGIONS[v.region].port+'.</p>';
  h+='<div class="chips">'+[4,8,13].map(w=>'<button class="chip-btn'+(r.weeks===w?' sel':'')+'" data-act="reletWeeks" data-arg=\'{"weeks":'+w+'}\'>'+w+' weeks</button>').join('')+'</div>';
  h+='<div class="econ"><span class="k">Relet rate</span><span class="v">'+fK(rate)+'/d</span><span class="v"></span><span class="k">Your hire</span><span class="v">'+fK(v.hire)+'/d</span><span class="v"></span><span class="k tot">Net per week · over '+r.weeks+' weeks</span><span class="v tot '+cls(net)+'">'+fMs(net)+'</span><span class="v tot '+cls(net)+'">'+fMs(net*r.weeks)+'</span></div>';
  $('#sheetBody').innerHTML=h;
  $('#sheetFoot').innerHTML='<button class="btn" data-act="closeModal">Cancel</button><button class="btn btn-primary" data-act="reletConfirm">Relet</button>';
}
function termModal(id){const v=vesselById(id);const remW=Math.max(0,v.termEnds-S.w);const pen=EARLY_TERM*v.hire*7*remW;
  openModal('Redeliver early','<p style="margin:0">Redeliver '+esc(v.name)+' to her owners now, '+remW+' weeks before the charter ends. The owners keep '+(EARLY_TERM*100)+'% of the remaining hire: <b class="mono">'+fM(pen)+'</b>.</p>','<button class="btn" data-act="closeModal">Keep her</button><button class="btn btn-danger" data-act="termConfirm" data-arg=\'{"id":'+id+'}\'>Redeliver and pay '+fM(pen)+'</button>');
}

/* ---------- modals: cargo ---------- */
/* shared cargo economics pieces */
function gridRows(rows){
  return'<div class="econ">'+rows.map(r=>{
    if(r[0]==='h')return'<span class="h">'+r[1]+'</span>';
    if(r[0]==='tot'){const c=r[4]||'';return'<span class="k tot">'+r[1]+'</span><span class="v tot '+c+'">'+(r[2]||'')+'</span><span class="v tot '+c+'">'+(r[3]||'')+'</span>';}
    const c=r[3]||'';return'<span class="k">'+r[0]+'</span><span class="v">'+(r[1]||'')+'</span><span class="v '+c+'">'+(r[2]||'')+'</span>';
  }).join('')+'</div>';
}
function paidRows(c,v){
  const paid=[['FOB '+REGIONS[c.src].port+' × '+c.vol.toFixed(2)+' TBtu',c.cost.fob||0],['Hire to date'+(v.charter==='spot'?' incl. round-trip allowance':''),c.cost.hire||0],['Fuel to date',c.cost.fuel||0],['Canal tolls',c.cost.toll||0],['Port and positioning fees',c.cost.fees||0]].filter(x=>x[1]>0);
  const rows=[['h','Already on your book']];for(const p of paid)rows.push([p[0],'',fM(-p[1])]);
  rows.push(['Total paid so far','',fM(-c.costSoFar)]);return rows;
}
function remainingDetail(c,holdWeeks){
  // same arithmetic as the model's cargoExpected, itemised
  const v=vesselById(c.vesselId);const vt=VTYPES[v.type];const unloaded=c.phase==='ballast'||c.phase==='waiting';
  const laden=unloaded?c.ladenDays:v.daysLeft;const rows=[['h','Still to spend before discharge']];let total=0;
  const add=(k,amt)=>{rows.push([k,'',fM(-amt)]);total+=amt;};
  if(c.phase==='waiting'){const wd=Math.max(0,(c.loadWeek-S.w)*7);if(wd&&v.charter==='term')add('Hire · '+wd+' d waiting for the W'+c.loadWeek+' laycan at '+fK(v.hire)+'/d',v.hire*wd);}
  else if(c.phase==='ballast'){const wd=Math.max(0,(c.loadWeek-S.w)*7-v.daysLeft);add('Hire · '+v.daysLeft+' d ballast'+(wd&&v.charter==='term'?' + '+wd+' d waiting':'')+' at '+fK(v.hire)+'/d',v.hire*(v.daysLeft+(v.charter==='term'?wd:0)));add('Heel burned in ballast · '+v.daysLeft+' d at the hub price',heelDay(vt,v.from||c.src)*v.daysLeft);}
  if(unloaded){if(!c.fobPaid)add('FOB '+REGIONS[c.src].port+' × '+c.vol.toFixed(2)+' TBtu at '+fP(c.fob)+', payable at loading',c.fob*c.vol*1e6);add('Loading fee',PORT_LOAD_FEE);if(TOLL[c.via])add('Canal toll · '+c.via,TOLL[c.via]);}
  add('Hire · '+laden+' d laden at '+fK(v.hire)+'/d (fuel is the boil-off)',v.hire*laden);
  if(holdWeeks)add('Holding off the port · '+holdWeeks+' w of hire',holdWeeks*v.hire*7);
  add('Discharge fee',PORT_DISC_FEE);
  return{rows,total,laden};
}
function remainingRows(v,ballast,laden,toll,loadFee){
  const vt=VTYPES[v.type];const hire=v.hire*(ballast+laden),fuel=ballast?heelDay(vt,v.from||v.region||'USGC')*ballast:0;
  const rows=[['h','Still to spend before discharge']];
  rows.push(['Hire · '+(ballast?ballast+' d ballast + ':'')+laden+' d laden at '+fK(v.hire)+'/d','',fM(-hire)]);
  if(fuel)rows.push(['Heel burned in ballast · '+ballast+' d','',fM(-fuel)]);
  if(loadFee)rows.push(['Loading fee','',fM(-PORT_LOAD_FEE)]);
  if(toll)rows.push(['Canal toll','',fM(-toll)]);
  rows.push(['Discharge fee','',fM(-PORT_DISC_FEE)]);
  const total=hire+fuel+(loadFee?PORT_LOAD_FEE:0)+toll+PORT_DISC_FEE;
  return{rows,total};
}
function divertModal(id){const c=cargoById(id);UI.divert={id,dest:null,via:null};openModal('Divert cargo #'+id,'');UI.modal='divert';renderDivert();}
function renderDivert(){
  const d=UI.divert;const c=cargoById(d.id);const v=vesselById(c.vesselId);const vt=VTYPES[v.type];const cur=cargoExpected(c,null);
  const unloaded=c.phase==='ballast'||c.phase==='waiting';
  let h='<p class="dim" style="margin:0;font-size:13px;max-width:70ch">'+esc(v.name)+' is '+(unloaded?'yet to load at '+REGIONS[c.src].port+' (laycan W'+c.loadWeek+')':'bound for '+REGIONS[c.dest].name+' via '+c.via+' with '+v.daysLeft+' d to go, '+Math.max(0,c.ladenDays-v.daysLeft)+' d sailed')+'. Current mark: <span class="mono '+cls(cur.mtm)+'">'+fMs(cur.mtm)+'</span> against '+(cur.how==='commit'?'DES sale #'+cur.commit.id:cur.how==='fixed'?'the sold price':'the curve at W'+cur.eta)+'. '+(unloaded?'Before loading a diversion simply changes the voyage.':'Days to go are measured from where the ship is now: she cuts across while still on a leg both routes share, turns back to the fork if she has passed it, or completes the current leg and sails on, whichever is shortest.')+'</p><div class="cards">';
  let picked=null;
  for(const dest of DESTS){if(dest===c.dest)continue;
    for(const o of routeOptions(c.src,dest)){if(routeBlocked(o.via))continue;
      const q=divertQuote(c,dest,o.via);if(!q)continue;const sel=d.dest===dest&&d.via===o.via;if(sel)picked=q;
      const how=q.mode==='cut'?'cuts across':q.mode==='back'?'turns back to the fork':q.mode==='onward'?'completes the leg, then '+q.viaUsed:q.mode==='direct'?'steams straight there':'';
      h+='<button class="card'+(sel?' sel':'')+'" data-act="divertPick" data-arg=\'{"dest":"'+dest+'","via":"'+o.via+'"}\'><span class="t">'+REGIONS[dest].name+'</span><span class="s">via '+o.via+' · '+q.rem+' d'+(unloaded?' laden':' to go')+' · W'+q.eta+(how?' · '+how:'')+(q.commit?' · meets #'+q.commit.id:'')+(M.demandOff[dest]>0?' · <span class="amber">demand off</span>':'')+'</span><span class="p '+cls(q.mtm)+'">'+fMs(q.mtm)+'</span><span class="m">DES '+fP(q.price)+' · '+fPs(q.mtm-cur.mtm)+' vs now'+(q.tollDue?' · toll '+fM(q.tollDue):'')+'</span></button>';
    }}
  h+='</div>';
  if(picked){
    const q=picked;const rows=[['h','New routing · '+REGIONS[c.src].port+' to '+REGIONS[q.dest].port+' via '+q.viaUsed]];
    if(unloaded)rows.push(['Laden passage after loading','',q.d2+' d']);
    else rows.push(['Days to go from the present position','',q.rem+' d ('+(q.mode==='cut'?'cutting across; the full route is '+q.d2+' d':q.mode==='back'?'turning back to the fork; the full route is '+q.d2+' d':q.mode==='direct'?'straight from the present position, with a routing allowance':'finishing the leg, then '+(q.rem-v.daysLeft)+' d onward')+')']);
    rows.push(['Arrival','','W'+q.eta]);
    rows.push(['h','Value on arrival']);
    rows.push(['Volume '+(unloaded?'to load '+c.vol.toFixed(2):'on board '+c.volNow.toFixed(3))+' TBtu, less '+q.rem+' d of boil-off at '+vt.bor.toFixed(2)+'%/d',q.delivered.toFixed(3)+' TBtu','']);
    rows.push([q.commit?'DES sale #'+q.commit.id+' price (window W'+q.commit.wStart+'–'+q.commit.wEnd+')':'Curve DES '+REGIONS[q.dest].name+' at W'+q.eta,fP(q.price)+'/MMBtu',fM(q.rev)]);
    rows.push(['h','Still to spend before discharge']);
    rows.push(['Hire · '+(q.pre?q.pre+' d before loading + ':'')+q.rem+' d at '+fK(v.hire)+'/d','',fM(-q.hire)]);
    if(q.fuel)rows.push(['Heel burned in ballast','',fM(-q.fuel)]);
    if(unloaded){if(!c.fobPaid)rows.push(['FOB at loading','',fM(-c.fob*c.vol*1e6)]);rows.push(['Loading fee','',fM(-PORT_LOAD_FEE)]);if(TOLL[q.via])rows.push(['Canal toll · '+q.via,'',fM(-TOLL[q.via])]);}
    else if(q.tollDue)rows.push(['Canal toll · '+q.viaUsed+' (not yet paid on this voyage)','',fM(-q.tollDue)]);
    rows.push(['Discharge fee','',fM(-PORT_DISC_FEE)]);
    rows.push(...paidRows(c,v));
    rows.push(['tot','Mark after diversion','',fMs(q.mtm),cls(q.mtm)]);
    rows.push(['Mark on the current routing ('+REGIONS[c.dest].name+', W'+cur.eta+')','',fMs(cur.mtm),cls(cur.mtm)]);
    rows.push(['tot','Change from diverting','',fMs(q.mtm-cur.mtm),cls(q.mtm-cur.mtm)]);
    h+=gridRows(rows);
    if(cur.how==='commit')h+='<div class="note">Diverting releases this cargo from DES sale #'+cur.commit.id+'; that sale stays open and will need another cargo or a buy-back.</div>';
  }
  $('#sheetBody').innerHTML=h;
  $('#sheetFoot').innerHTML='<button class="btn" data-act="closeModal">Cancel</button><button class="btn btn-primary" data-act="divertConfirm"'+(d.dest?'':' disabled')+'>Divert</button>';
}
function fixModal(id){
  const c=cargoById(id);const v=vesselById(c.vesselId);const vt=VTYPES[v.type];const e=cargoExpected(c,null);
  const eta=S.w+e.etaK;const curve=desFwd(c.dest,e.etaK);const spreadFix=physSpread(c.dest,e.etaK,e.delivered);const price=curve-spreadFix;const rev=price*e.delivered*1e6;
  const rr=remainingDetail(c,0);const laden=rr.laden;
  const pnl=rev-(c.costSoFar+rr.total);const wS=Math.max(S.w+1,eta-1),wE=Math.min(WEEKS-1,eta+1);
  let h='<p class="dim" style="margin:0;font-size:13px;max-width:65ch">Sell cargo #'+id+' to a buyer at '+REGIONS[c.dest].name+' for a W'+wS+' to W'+wE+' delivery window at today\'s curve less the bid-offer. This creates a DES sale already sourced by this cargo, so it needs no collateral and cannot breach; the price is locked and the cargo must arrive in the window (a diversion elsewhere releases the sale, which then needs another cargo or a buy-back).</p>';
  const rows=[['h','Value on arrival']];
  rows.push(['Volume '+(c.phase==='ballast'||c.phase==='waiting'?'to load '+c.vol.toFixed(2):'on board '+c.volNow.toFixed(3))+' TBtu, less '+laden+' d of boil-off at '+vt.bor.toFixed(2)+'%/d',e.delivered.toFixed(3)+' TBtu','']);
  rows.push(['Curve DES '+REGIONS[c.dest].name+' at W'+eta,fP(curve)+'/MMBtu','']);
  rows.push(['Bid-offer · '+liqLabel(REGIONS[c.dest].hub)+' '+HUBS[REGIONS[c.dest].hub].name+', '+e.etaK+' weeks out',fPs(-spreadFix)+'/MMBtu','']);
  rows.push(['Sale price × delivered volume',fP(price)+'/MMBtu',fM(rev)]);
  rows.push(...rr.rows);rows.push(...paidRows(c,v));
  rows.push(['tot','Locked-in result on delivery','',fMs(pnl),cls(pnl)]);
  rows.push(['Current mark if left open ('+(e.how==='commit'?'DES sale #'+e.commit.id:'curve')+')','',fMs(e.mtm),cls(e.mtm)]);
  rows.push(['tot','Cost of certainty','',fMs(pnl-e.mtm),cls(pnl-e.mtm)]);
  h+=gridRows(rows);
  if(e.how==='commit')h+='<div class="note">This cargo is currently expected to meet DES sale #'+e.commit.id+' at '+fP(e.commit.price)+' (unsourced, auto-matched). Selling it separately leaves that sale to another cargo. To source it with this cargo instead, use Settlement.</div>';
  openModal('Sell DES · cargo #'+id,h,'<button class="btn" data-act="closeModal">Cancel</button><button class="btn btn-primary" data-act="fixConfirm" data-arg=\'{"id":'+id+'}\'>Sell at '+fP(price)+'</button>');
}
function floatModal(id){
  const c=cargoById(id);const v=vesselById(c.vesselId);const vt=VTYPES[v.type];const e=cargoExpected(c,null);
  const hireW=v.hire*7,fuelW=0,boW=c.volNow*vt.borIdle/100*7,boValW=boW*1e6*des(c.dest);const weekly=hireW+boValW;
  const now=des(c.dest),f4=desFwd(c.dest,4),carry=f4-now,carryVal=carry*c.volNow*1e6;
  let h;
  if(c.phase==='laden'){
    h='<p class="dim" style="margin:0;font-size:13px;max-width:65ch">Hold '+esc(v.name)+' on the water instead of pressing on to '+REGIONS[c.dest].name+' ('+v.daysLeft+' d to go). Floating is a bet that the curve\'s carry outruns the cost of waiting.</p>';
    const rows=[['h','Cost of each week on the water']];
    rows.push(['Hire · 7 d at '+fK(v.hire)+'/d','',fM(-hireW)]);
    rows.push(['Natural boil-off at anchor · '+vt.borIdle.toFixed(2)+'%/d × 7 d on '+c.volNow.toFixed(3)+' TBtu',boW.toFixed(3)+' TBtu at '+fP(now),fM(-boValW)]);
    rows.push(['tot','Holding cost per week','',fM(-weekly),'neg']);
    rows.push(['h','What the curve pays for waiting']);
    rows.push(['DES '+REGIONS[c.dest].name+' now',fP(now)+'/MMBtu','']);
    rows.push(['DES '+REGIONS[c.dest].name+' four weeks out',fP(f4)+'/MMBtu','']);
    rows.push(['Carry over four weeks × '+c.volNow.toFixed(2)+' TBtu',fPs(carry)+'/MMBtu',fMs(carryVal),cls(carry)]);
    rows.push(['Holding cost over four weeks','',fM(-4*weekly)]);
    rows.push(['tot','Net from a four-week hold','',fMs(carryVal-4*weekly),cls(carryVal-4*weekly)]);
    rows.push(['Current mark if you deliver on schedule (W'+e.eta+')','',fMs(e.mtm),cls(e.mtm)]);
    h+=gridRows(rows);
    h+='<div class="note">'+(carryVal>4*weekly?'The contango covers the cost of floating this cargo for a month.':'The curve does not pay enough to float this cargo; it is cheaper to deliver.')+(c.fixed?' This cargo is already fixed at '+fP(c.fixed.price)+', so floating only adds cost.':'')+'</div>';
  }else{
    const rr=remainingDetail(c,0);
    h='<p class="dim" style="margin:0;font-size:13px;max-width:65ch">'+esc(v.name)+' has been holding cargo #'+id+' for '+c.floatWeeks+' week'+(c.floatWeeks===1?'':'s')+'. Resume passage to '+REGIONS[c.dest].name+'.</p>';
    const rows=[['h','On resuming']];
    rows.push(['Days to go','',v.daysLeft+' d · arrival W'+e.eta]);
    rows.push(['Volume on board after boil-off on the remaining leg',e.delivered.toFixed(3)+' TBtu','']);
    rows.push([e.how==='fixed'?'Sold price':e.how==='commit'?'DES sale #'+e.commit.id+' price':'Curve DES '+REGIONS[c.dest].name+' at W'+e.eta,fP(e.price)+'/MMBtu',fM(e.rev)]);
    rows.push(...rr.rows);rows.push(...paidRows(c,v));
    rows.push(['tot','Expected result on delivery','',fMs(e.mtm),cls(e.mtm)]);
    rows.push(['Cost of one more week on the water','',fM(-weekly)]);
    h+=gridRows(rows);
  }
  openModal((c.phase==='laden'?'Float':'Resume')+' · cargo #'+id,h,'<button class="btn" data-act="closeModal">Cancel</button><button class="btn btn-primary" data-act="floatConfirm" data-arg=\'{"id":'+id+'}\'>'+(c.phase==='laden'?'Hold on the water':'Resume passage')+'</button>');
}
function sowModal(id){
  const c=cargoById(id);const v=vesselById(c.vesselId);const vt=VTYPES[v.type];const e=cargoExpected(c,null);
  const hireRem=v.hire*e.daysLeft,fuelRem=0,remaining=e.cost-c.costSoFar;
  const fee=SOW_FEE*e.rev;const proceeds=e.rev-remaining-fee;const pnl=proceeds-c.costSoFar;
  const basis=e.how==='fixed'?'Sold DES price (W'+c.fixed.week+')':e.how==='commit'?'DES sale #'+e.commit.id+' price':'Curve DES '+REGIONS[c.dest].name+' at W'+e.eta;
  let h='<p class="dim" style="margin:0;font-size:13px;max-width:65ch">Sell the cargo to another trader where she floats. The buyer pays what the cargo is worth on arrival, less the freight still to be spent getting it there, less a fee. '+esc(v.name)+' completes the voyage for them'+(c.phase==='float'?' and gets under way again at once':'')+'; no further hire or fuel on this voyage is charged to you.'+(e.how==='commit'?' DES sale #'+e.commit.id+' goes with the cargo and is fulfilled by the buyer.':'')+'</p>';
  h+='<div class="econ"><span class="h">Value on arrival</span>';
  h+='<span class="k">Volume on board '+c.volNow.toFixed(3)+' TBtu, less '+e.daysLeft+' d of boil-off at '+vt.bor.toFixed(2)+'%/d</span><span class="v">'+e.delivered.toFixed(3)+' TBtu</span><span class="v"></span>';
  h+='<span class="k">'+basis+'</span><span class="v">'+fP(e.price)+'/MMBtu</span><span class="v">'+fM(e.rev)+'</span>';
  h+='<span class="h">Buyer takes over</span>';
  h+='<span class="k">Hire · '+e.daysLeft+' d at '+fK(v.hire)+'/d</span><span class="v"></span><span class="v">'+fM(-hireRem)+'</span>';
  h+='<span class="k">Discharge fee at '+REGIONS[c.dest].port+'</span><span class="v"></span><span class="v">'+fM(-PORT_DISC_FEE)+'</span>';
  h+='<span class="k">Sale fee · '+(SOW_FEE*100).toFixed(1)+'% of arrival value, the buyer\'s bid-offer on a cargo afloat</span><span class="v"></span><span class="v">'+fM(-fee)+'</span>';
  h+='<span class="k tot">Sale proceeds, paid to you now</span><span class="v tot"></span><span class="v tot">'+fM(proceeds)+'</span>';
  for(const r of paidRows(c,v))h+=r[0]==='h'?'<span class="h">'+r[1]+'</span>':'<span class="k">'+r[0]+'</span><span class="v"></span><span class="v">'+r[2]+'</span>';
  h+='<span class="k tot">Realised P&amp;L</span><span class="v tot '+cls(pnl)+'">proceeds less costs paid</span><span class="v tot '+cls(pnl)+'">'+fMs(pnl)+'</span>';
  h+='<span class="k">If you keep it: current mark against the same basis</span><span class="v"></span><span class="v '+cls(e.mtm)+'">'+fMs(e.mtm)+'</span></div>';
  h+='<div class="note">Selling afloat only differs from keeping the cargo by the '+(SOW_FEE*100).toFixed(1)+'% fee and by giving up any further move in the price before arrival.</div>';
  openModal('Sell cargo #'+id+' afloat',h,'<button class="btn" data-act="closeModal">Cancel</button><button class="btn btn-primary" data-act="sowConfirm" data-arg=\'{"id":'+id+'}\'>Sell for '+fM(proceeds)+'</button>');
}
function settleModal(id){
  const c=cargoById(id);const v=vesselById(c.vesselId);const vt=VTYPES[v.type];const e=cargoExpected(c,null);
  const arrival=S.w+e.etaK-(e.holdWeeks||0);const curve=desFwd(c.dest,arrival-S.w);
  const weekly=v.hire*7+c.volNow*vt.borIdle/100*7*1e6*curve;
  let h='<p class="dim" style="margin:0;font-size:13px;max-width:65ch">Choose how cargo #'+id+' settles. It arrives at '+REGIONS[c.dest].name+' around W'+arrival+'. A DES sale pays only inside its delivery window: assign the cargo to one and it settles at that price (holding off the port if it arrives early); leave it on auto and it takes any unsourced sale whose window it lands in; or keep it for the spot market.</p><div class="cards">';
  const mode=c.spotOnly?'spot':c.waitFor?'wait':'auto';
  h+='<button class="card'+(mode==='auto'?' sel':'')+'" data-act="settlePick" data-arg=\'{"id":'+id+',"mode":"auto"}\'><span class="t">Whichever window it lands in</span><span class="s">default: any unsourced DES sale at '+REGIONS[c.dest].name+' whose window covers W'+arrival+', otherwise spot</span><span class="p">'+fP(curve)+'</span><span class="m">curve at W'+arrival+'</span></button>';
  for(const k of openCommits().filter(x=>x.dest===c.dest)){
    const early=k.wStart-arrival,late=arrival>k.wEnd;
    const sel=mode==='wait'&&c.waitFor===k.id;const hold=Math.max(0,early);
    const vol=c.volNow*(1-vt.bor/100*7*hold);const rev=k.price*vol*1e6;const holdCost=hold*weekly;
    h+='<button class="card'+(sel?' sel':'')+(late?' off':'')+'" data-act="settlePick" data-arg=\'{"id":'+id+',"mode":"wait","commit":'+k.id+'}\''+(late?' disabled':'')+'><span class="t">'+(k.kind==='term'?'Term window':'DES sale')+' #'+k.id+(isSourced(k)&&k.assigned!==c.id?' <span class="flag">sourced by #'+k.assigned+'</span>':'')+'</span><span class="s">window W'+k.wStart+'–'+k.wEnd+' · '+(late?'too late, arrives W'+arrival:early>0?'arrives '+early+' w early, waits off the port':'arrives inside the window')+'</span><span class="p">'+fP(k.price)+'</span><span class="m">'+fM(rev)+(hold?' · holding '+hold+' w costs about '+fM(holdCost):'')+' · '+fPs(k.price-curve)+' vs curve</span></button>';
  }
  h+='<button class="card'+(mode==='spot'?' sel':'')+'" data-act="settlePick" data-arg=\'{"id":'+id+',"mode":"spot"}\'><span class="t">Spot market only</span><span class="s">curve DES at W'+arrival+', whatever it is on the day; DES sales are left for other cargoes</span><span class="p">'+fP(curve)+'</span><span class="m">'+fM(curve*c.volNow*1e6)+' at today\'s curve</span></button>';
  h+='</div>';
  openModal('Settlement · cargo #'+id,h,'<button class="btn" data-act="closeModal">Close</button>');
}
function cancelModal(id){
  const c=cargoById(id);const fee=c.term?contractCancelFee(c.contractId,c.vol,c.fob):spotCancelFee(c);const v=vesselById(c.vesselId);const dmg=Math.max(0,M.fob[c.src]-c.fob);
  openModal('Cancel lifting · cargo #'+id,'<p style="margin:0">Walk away from the W'+c.loadWeek+' laycan at '+REGIONS[c.src].port+'. '+(c.term?'Under the '+CONTRACTS[c.contractId].name+' you pay '+CONTRACTS[c.contractId].cancelLabel+': <b class="mono">'+fM(fee)+'</b>.':'You bought this cargo, so walking away means paying the seller\'s damages: the marker is now '+fP(M.fob[c.src])+' against your '+fP(c.fob)+', so '+(dmg>0?fPs(dmg)+'/MMBtu of market loss':'no market loss')+' plus a '+(CANCEL_SPOT*100)+'% default fee: <b class="mono">'+fM(fee)+'</b>.')+' Positioning costs already spent ('+fM(c.costSoFar)+') are written off'+(v&&v.charter==='spot'?' and the spot fixture lapses':v?' and '+esc(v.name)+' is released':'')+'.</p>','<button class="btn" data-act="closeModal">Keep the lifting</button><button class="btn btn-danger" data-act="cancelConfirm" data-arg=\'{"id":'+id+'}\'>Cancel and pay '+fM(fee+c.costSoFar)+'</button>');
}
function cancelOfferModal(id){
  const o=offerById(id);const def=CONTRACTS[o.contractId];const t=contractTerms(o.contractId);const vol=3.70;const fee=contractCancelFee(o.contractId,vol,o.price);
  const rows=[['h','What you pay if you cancel']];
  if(o.contractId==='USTOLL'){rows.push(['Liquefaction fee, fixed (what a real offtaker pays on a cancelled cargo)',fP(t.fee)+'/MMBtu',fM(t.fee*vol*1e6)]);if(t.prem>0.005)rows.push(['Capacity premium, fixed (the price of the secondary slot, owed lifted or not)',fP(t.prem)+'/MMBtu',fM(t.prem*vol*1e6)]);rows.push(['Feedgas 115% × Henry Hub',fP(1.15*spot('HH'))+'/MMBtu','not owed']);}
  else if(o.contractId==='QATSPA'){rows.push(['Take-or-pay · half the cargo at the contract price '+fP(o.price),'',fM(fee)]);}
  rows.push(['tot','Cancellation cost · '+vol.toFixed(2)+' TBtu','',fM(-fee),'neg']);
  // the alternative: lift it on a spot ship to the best destination
  let best=null;for(const d of DESTS){for(const r of routeOptions(o.src,d)){if(routeBlocked(r.via))continue;const p=planVoyage(o.src,d,r.via,'XDF','spot',spotRate('XDF',REGIONS[o.src].basin),null,o);if(p&&(!best||p.margin>best.margin))best=p;}}
  if(best){rows.push(['h','The alternative: lift it']);rows.push(['Contract price',fP(o.price)+'/MMBtu','vs marker '+fP(M.fob[o.src])]);rows.push(['Best spot XDF voyage · '+REGIONS[best.dest].name+' via '+best.via+', landing W'+best.eta,fPs(best.perMMBtu)+'/MMBtu',fMs(best.margin)]);rows.push(['tot','Lifting beats cancelling by','',fMs(best.margin+fee),cls(best.margin+fee)]);}
  const body='<p style="margin:0;max-width:65ch">Give up the '+def.name+' laycan at '+REGIONS[o.src].port+' (W'+o.loadWeek+', contract price '+fP(o.price)+'). Leaving it unlifted past the laycan costs the same, so cancel early only to free the decision.</p><div style="margin-top:12px">'+gridRows(rows)+'</div>'+(o.contractId==='USTOLL'?'<div class="note">In practice a US offtaker who cancels pays only the liquefaction fee (about '+fM(t.fee*vol*1e6)+' here). This slot was bought in the secondary market, so its capacity premium is owed whether you lift or not; that is the price of the discount to the marker you get on the cargoes you do lift.</div>':'');
  openModal('Cancel term laycan W'+o.loadWeek,body,'<button class="btn" data-act="closeModal">Keep it</button><button class="btn btn-danger" data-act="cancelOfferConfirm" data-arg=\'{"id":'+id+'}\'>Cancel'+(fee?' and pay '+fM(fee):'')+'</button>');
}
function signModal(id){
  const def=CONTRACTS[id];const t=contractTermsNow(id);const px=id==='USTOLL'?1.15*spot('HH')+t.fee+t.prem:id==='QATSPA'?t.slope*spot('BRENT')+0.40+t.prem:t.slope*spot('BRENT')+0.50;const nLift=contractLiftings(id);
  const marker=def.side==='buy'?M.fob[def.src]:desFwd('JKTC',6);const cmp=def.side==='buy'?REGIONS[def.src].port+' marker today':'DES Sodegaura six weeks out';
  const rows=[['h','Terms struck today · '+contractLabel(id,t)]];
  rows.push(['Price at today\'s hubs',fP(px),'']);
  rows.push([cmp,fP(marker),'']);
  if(id==='USTOLL'){rows.push(['Feedgas · 115% × Henry Hub '+fP(spot('HH')),fP(1.15*spot('HH')),'']);rows.push(['Liquefaction fee, fixed',fP(t.fee),'']);rows.push(['Capacity premium, fixed (75% of today\'s gap to the marker, the price of a secondary slot)',fP(t.prem),'']);}
  if(id==='QATSPA'){rows.push(['Oil link · '+(t.slope*100).toFixed(1)+'% × Brent '+fP(spot('BRENT'))+' + $0.40',fP(t.slope*spot('BRENT')+0.40),'']);rows.push(['Mid-term premium, fixed (75% of today\'s gap between oil parity and the marker)',fP(t.prem),'']);}
  if(id==='JKTERM'){rows.push(['Oil link · '+(t.slope*100).toFixed(1)+'% × Brent '+fP(spot('BRENT'))+' + $0.50',fP(px),'']);}
  const disc=def.side==='buy'?marker-px:px-marker;
  rows.push(['tot',def.side==='buy'?'Discount to the marker today':'Premium to the curve today',fPs(disc)+'/MMBtu','',cls(disc)]);
  rows.push(['h','Cadence and term']);
  rows.push(['One 3.70 TBtu cargo every '+def.every+' weeks, about '+(52/def.every).toFixed(0)+' a year','≈ '+(52/def.every*3.70/51.7).toFixed(2)+' mtpa','']);
  rows.push(['First '+(def.side==='buy'?'laycan':'window')+' if signed now','W'+(S.w+def.lead+1),'']);
  rows.push(['Runs to the end of the simulation','W'+WEEKS,'~'+nLift+' cargoes']);
  const body='<p style="margin:0;max-width:65ch">'+(def.long||def.desc)+'</p><div style="margin-top:12px">'+gridRows(rows)+'</div><div class="note">The terms do not move once signed. The contract earns when the market moves in your favour afterwards and costs when it does not; '+(def.side==='buy'?'cancelling a laycan costs '+def.cancelLabel+'.':'a missed window is a default at the buyer\'s cover plus 3%.')+'</div>';
  openModal('Sign · '+def.name,body,'<button class="btn" data-act="closeModal">Not now</button><button class="btn btn-primary" data-act="signConfirm" data-arg=\'{"id":"'+id+'"}\'>Sign</button>');
}
function coverModal(id){const k=commitById(id);const sp=physSpread(k.dest,Math.max(0,k.wEnd-S.w),k.vol);const mtm=commitMtm(k)-sp*k.vol*1e6;
  openModal('Buy back DES sale #'+id,'<p style="margin:0">Close the '+REGIONS[k.dest].name+' DES sale at today\'s curve plus a '+fP(sp)+' bid-offer ('+liqLabel(REGIONS[k.dest].hub)+' market). Result: <b class="mono '+cls(mtm)+'">'+fMs(mtm)+'</b>. Collateral of '+fM(COLLATERAL*k.price*k.vol*1e6)+' is released.</p>','<button class="btn" data-act="closeModal">Cancel</button><button class="btn btn-primary" data-act="coverConfirm" data-arg=\'{"id":'+id+'}\'>Buy back</button>');
}

function hedgeModal(preset){const ms=curveMonths(HEDGE_MAX_K);UI.hedge=Object.assign({hub:'TTF',side:'sell',mkey:(ms[1]||ms[0]).key,vol:3.70},preset||{});openModal('Paper hedge'+(preset&&preset.forCargo?' · cargo #'+preset.forCargo:''),'');UI.modal='hedge';renderHedge();}
function cargoHedgeModal(id){const c=cargoById(id);const hg=cargoHedge(c);const need=Math.max(0,hg.phys-hg.short);const clips=[0.5,1.0,1.85,3.05,3.40,3.70,5.55,7.40];const vol=clips.reduce((b,v)=>Math.abs(v-Math.min(need,hg.e.delivered))<Math.abs(b-Math.min(need,hg.e.delivered))?v:b,clips[0]);hedgeModal({hub:hg.hub,mkey:hg.mkey,side:'sell',vol,forCargo:id});}
function renderHedge(){
  const f=UI.hedge;const months=curveMonths(HEDGE_MAX_K);let m=months.find(x=>x.key===f.mkey);if(!m){m=months[0];f.mkey=m.key;}
  const k=m.wStart-S.w;const slip=slippage(f.hub,k,f.vol);const price=fwd(f.hub,k)+(f.side==='buy'?slip:-slip);const notional=price*f.vol*1e6;const ex=exposure();
  let h='<p class="dim" style="margin:0;font-size:13px;max-width:65ch">Buy or sell a month contract on a hub. It is marked each week (weeks already past at their spot, the rest at the balance-of-month price), settles in cash on the last week of the month at the average of that month\'s weekly spot, and can be closed early at the mark less the bid-offer. Initial margin of '+(HEDGE_IM*100)+'% is held from free cash plus any mark-to-market loss; if free cash turns negative the clearing house closes your worst position.</p>';
  if(f.forCargo){const cc=cargoById(f.forCargo);if(cc){const hg=cargoHedge(cc);h+='<div class="note">Cargo #'+cc.id+' lands at '+REGIONS[cc.dest].name+' around W'+hg.e.eta+' ('+HUBS[hg.hub].name+' '+hg.label+'), '+hg.e.delivered.toFixed(2)+' TBtu, currently '+esc(hg.text)+'. Selling that month on '+HUBS[hg.hub].name+' offsets its price risk; the '+(REGIONS[cc.dest].basis>=0?'+':'')+REGIONS[cc.dest].basis.toFixed(2)+' basis of '+REGIONS[cc.dest].port+' to the hub is fixed, and a cargo arriving a week either side of the month edge leaves a one-month mismatch.</div>';}}
  h+='<div class="note">Book exposure after paper: TTF-linked '+(ex.net.TTF>=0?'+':'−')+Math.abs(ex.net.TTF).toFixed(1)+' TBtu, JKM-linked '+(ex.net.JKM>=0?'+':'−')+Math.abs(ex.net.JKM).toFixed(1)+' TBtu. Selling the month a cargo arrives in locks its price without locking its destination.</div>';
  h+='<div class="step"><div class="lbl">Hub</div><div class="chips">'+['TTF','JKM','HH'].map(x=>'<button class="chip-btn'+(f.hub===x?' sel':'')+'" data-act="hedgeHub" data-arg=\'{"hub":"'+x+'"}\'>'+HUBS[x].name+' · '+liqLabel(x)+'</button>').join('')+'</div></div>';
  h+='<div class="step"><div class="lbl">Side</div><div class="chips"><button class="chip-btn'+(f.side==='sell'?' sel':'')+'" data-act="hedgeSide" data-arg=\'{"side":"sell"}\'>Sell (short, hedges a long cargo)</button><button class="chip-btn'+(f.side==='buy'?' sel':'')+'" data-act="hedgeSide" data-arg=\'{"side":"buy"}\'>Buy (long, hedges a DES sale)</button></div></div>';
  h+='<div class="step"><div class="lbl">Contract month · curve</div><div class="cards">'+months.map(x=>'<button class="card'+(f.mkey===x.key?' sel':'')+'" data-act="hedgeMonth" data-arg=\'{"mkey":'+x.key+'}\'><span class="t">'+(x.bom?'Bal '+x.label.slice(0,3):x.label)+'</span><span class="s">W'+x.wStart+'–'+x.wEnd+'</span><span class="p">'+x.price[f.hub].toFixed(2)+'</span></button>').join('')+'</div></div>';
  h+='<div class="step"><div class="lbl">Volume</div><div class="chips">'+[0.5,1.0,1.85,3.05,3.40,3.70,5.55,7.40].map(v=>'<button class="chip-btn'+(f.vol===v?' sel':'')+'" data-act="hedgeVol" data-arg=\'{"vol":'+v+'}\'>'+v.toFixed(2)+' TBtu</button>').join('')+'</div></div>';
  h+='<div class="econ"><span class="k">'+HUBS[f.hub].name+' '+m.label+' (W'+m.wStart+'–'+m.wEnd+')</span><span class="v">'+fP(fwd(f.hub,k))+'</span><span class="v"></span><span class="k">Bid-offer · '+liqLabel(f.hub)+' market, '+k+' weeks to the month, '+f.vol.toFixed(2)+' TBtu</span><span class="v">'+(f.side==='buy'?'+':'−')+fP(slip)+'</span><span class="v"></span><span class="k tot">'+(f.side==='buy'?'Buy':'Sell')+' '+f.vol.toFixed(2)+' TBtu at</span><span class="v tot">'+fP(price)+'/MMBtu</span><span class="v tot">'+fM(notional)+'</span><span class="k">Initial margin ('+(HEDGE_IM*100)+'%)</span><span class="v"></span><span class="v">'+fM(HEDGE_IM*notional)+'</span><span class="k">Paper limit at this desk level</span><span class="v"></span><span class="v">'+hedgeVolOpen().toFixed(1)+' of '+hedgeCap().toFixed(1)+' TBtu used</span></div>';
  $('#sheetBody').innerHTML=h;
  $('#sheetFoot').innerHTML='<span class="dim" style="margin-right:auto;font-size:12px;align-self:center">Free cash '+fM(availableCash())+'</span><button class="btn" data-act="closeModal">Cancel</button><button class="btn btn-primary" data-act="hedgeConfirm">'+(f.side==='buy'?'Buy':'Sell')+' paper</button>';
}
function hCloseModal(id){
  const x=hedgeById(id);const k=Math.max(0,x.wStart-S.w);const slip=slippage(x.hub,k,Math.abs(x.vol));const mark=hedgeMark(x);const exit=mark+(x.vol>0?-slip:slip);const pnl=(exit-x.price)*x.vol*1e6;
  openModal('Close paper #'+id,'<p style="margin:0">Close the '+HUBS[x.hub].name+' '+x.label+' '+(x.vol>0?'long':'short')+' of '+Math.abs(x.vol).toFixed(2)+' TBtu at the mark ('+fP(mark)+') less a '+fP(slip)+' bid-offer: exit <b class="mono">'+fP(exit)+'</b>, result <b class="mono '+cls(pnl)+'">'+fMs(pnl)+'</b>. Margin is released.</p>','<button class="btn" data-act="closeModal">Keep it</button><button class="btn btn-primary" data-act="hCloseConfirm" data-arg=\'{"id":'+id+'}\'>Close</button>');
}
/* ---------- modals: system ---------- */
function guideModal(){
  openModal('Guide','<div class="guide">'
  +'<h3>The week</h3><p>Each turn is one week. Prices move, ships advance seven days, hire is charged, cargoes that arrive are discharged and settled, then the news for next week lands. Events in the feed hit prices one week after they appear: that is your lead.</p>'
  +'<h3>Cargoes</h3><p>Each week the four load ports publish an offer book: one or two tenders per port, each with its own loading laycan (one to five weeks out) and price, open for that week only. Buying one commits you to lift in that laycan; the ship must be able to make it, a term ship waits on hire if early, and the FOB is paid at loading. Cancelling a lifting you have bought costs the seller\'s damages (any rise in the marker since you bought) plus a 2% fee, or the contract\'s own cancellation terms. Choose a ship and a destination with a routing. The economics table shows FOB, hire, fuel, tolls, port fees and boil-off, and compares the landed cost with the curve at your arrival week. Once afloat you can divert (costs part of the distance already sailed), fix the DES price forward (locks the destination), float the cargo (pays in contango) or sell it afloat.</p>'
  +'<h3>Fleet</h3><p>Term vessels cost hire every day and must be positioned: a ship idle in Japan needs a ballast leg before loading in Qatar. Spot vessels appear at the load port but are priced round-trip and leave on discharge. Spot rates spike in winter and on canal trouble; that is when a term ship or a relet earns its keep. Fuel is the boil-off: a laden ship burns 0.12%/d (XDF), 0.15% (TFDE) or 0.22% (steam) of its cargo and pays no separate fuel bill; in ballast she burns heel, about 4,000 to 5,500 MMBtu a day at the hub price, which is why repositioning is dear. XDF tonnage carries more and burns less; steam is cheap to hire and loses cargo.</p>'
  +'<h3>DES sales and windows</h3><p>A DES sale is one thing whether you sell a cargo you already hold (Sell DES on its row: the sale is sourced by that cargo, needs no collateral and locks its price) or sell forward into a two-week window and source it later (unsourced until a cargo is assigned or auto-matches). Selling forward:  Collateral of 10% is held, a mark-to-market loss of 12% breaches your credit line and closes the position, and a window with no cargo delivered costs the buyer\'s cover plus a 3% penalty. A cargo of yours arriving inside the window settles against it; one arriving early can be told to wait off the port (its Settlement button), one arriving late cannot meet it.</p>'+'<h3>Term contracts</h3><p>Three contracts can be signed, with terms struck against the market on the day you sign: a US Gulf tolling slot (115% Henry Hub plus a fixed fee, one laycan every four weeks, cancel for the fee), a Qatar oil-linked SPA (a Brent slope of 10.5% to 12.5% plus $0.40 plus a fixed mid-term premium when spot sits above oil parity, every six weeks, take-or-pay at half the cargo value) and a Japan term DES sale (Brent slope plus $0.50 into Sodegaura, every six weeks, two-week window). Term obligations sit outside the desk position limit. They earn when the market moves your way after signing and cost when it does not.</p>'+'<h3>Paper hedges and liquidity</h3><p>TTF, JKM and Henry Hub month contracts out to six months, one price per calendar month (the forward curve is monthly, as the hubs quote it), marked weekly and cash-settled on the last week of the month at the average of that month\'s weekly spot. Initial margin of 10% plus any loss is held from free cash; if free cash turns negative the clearing house closes your worst position. Each hub has a liquidity state that thins when the tape is volatile; the bid-offer on paper, forward sales, fixing and buy-backs widens with tenor, clip size and thin liquidity.</p>'
  +'<h3>Market</h3><ul><li><b>FOB markers</b> price off the netbacks: Sabine Pass and Bonny off the European netback (their marginal buyer) with only a fifth of any Asian excess, so the East-West spread beyond freight is there for a trader with a ship; Ras Laffan and Gladstone off the Asian netback, Ras Laffan with an oil-linked floor. Sabine Pass has a 115% Henry Hub plus tolling cost floor. They reprice with the hubs, so the edge is in the curve, the news lead, freight, routing and the East-West arb.</li><li><b>Contango</b>: forward above spot, carry pays, floating can work. <b>Backwardation</b>: forward below spot, deliver promptly and sell forward.</li><li><b>Developing stories</b> run three to four weeks with shifting odds; bullish outcomes land harder in backwardation, bearish ones in contango.</li><li><b>EU storage</b> below the norm firms TTF; above it softens.</li></ul>'
  +'<h3>Desk and stars</h3><p>Gross realised P&amp;L of $5M, $15M, $40M and $80M adds cargo positions to your desk (2, 3, 4, 5, 6); term liftings sit outside the limit, and DES forward sales and paper are limited by collateral and margin, not by desk positions. The term fleet you may hold grows with it, one more than your positions (3, 4, 5, 6, 7 ships); spot fixtures are not capped. After 104 weeks: ★★★★ above $400M net, ★★★ $200M to $400M, ★★ positive, ★ negative.</p>'
  +'</div>');
}
function homeModal(){openModal('Return to home','<p style="margin:0">Week '+S.w+' · net '+fMs(netPnl())+'. Save before leaving to resume later.</p>','<button class="btn" data-act="closeModal">Stay</button><button class="btn" data-act="exitNoSave">Exit without saving</button><button class="btn btn-primary" data-act="saveExit">Save and exit</button>');}
function retireModal(){openModal('Retire now','<p style="margin:0">Settle the book at today\'s marks after '+S.w+' of '+WEEKS+' weeks. Net P&amp;L <b class="mono '+cls(netPnl())+'">'+fMs(netPnl())+'</b>, '+starsFor(netPnl())+' star'+(starsFor(netPnl())>1?'s':'')+'.</p>','<button class="btn" data-act="closeModal">Keep trading</button><button class="btn btn-danger" data-act="retireConfirm">Retire now</button>');}
function showEnd(){
  const f=finalSummary();
  $('#end-title').textContent=(S.w>=WEEKS?'104-week final settlement':'Retired after week '+S.w)+' · '+S.company;
  const n=$('#end-net');n.textContent=fMs(f.net);n.className='big '+cls(f.net);
  $('#end-stars').textContent='★'.repeat(f.stars)+'☆'.repeat(4-f.stars);
  $('#end-grid').innerHTML=[['Realised',fMs(f.realised)],['Unrealised',fMs(f.unrealised)],['Fleet overhead',fM(-f.overhead)],['Charter hire paid',fM(f.hireTotal)],['Relet income',fMs(f.reletIncome)],['Cargoes delivered',f.delivered],['Forward sales met',f.fulfilled],['Defaults · breaches',f.defaults+' · '+f.breaches],['Best trade',fMs(f.bestTrade)],['Term fleet laden',Math.round(f.util*100)+'%'],['Paper P&L',fMs(f.hedgePnl)],['Paper trades · margin calls',f.hedges+' · '+f.marginCalls],['Term liftings · cancelled',f.termLifts+' · '+f.cancelled],['Desk level',S.level]].map(x=>'<div><div class="lbl">'+x[0]+'</div><div class="v">'+x[1]+'</div></div>').join('');
  const stories=S.storyLog.map(s=>STORIES.find(x=>x.id===s.id).title+': '+s.outcome).join('. ');
  $('#end-note').textContent=stories?'Stories that shaped the two years: '+stories+'.':'';
  showScreen('end');
}

/* ---------- actions ---------- */
const ACTIONS={
  begin(){const name=($('#company').value||'').trim()||'Trading House';newGame(name);clearSave();showScreen('game');renderAll();window.scrollTo(0,0);},
  resume(){const d=loadSaved();if(!d){toast('No saved game found');return;}S=d;M=S.market;reviveRng();migrateState();showScreen(S.over?'end':'game');if(S.over)showEnd();else renderAll();},
  next(){if(S.over)return;nextWeek();renderAll();save();window.scrollTo({top:0});if(S.levelFlash)toast('Desk expanded: level '+S.level+', '+slots()+' positions');if(S.over)showEnd();},
  save(){toast(save()?'Game saved':'Could not save in this browser');},
  guide(){guideModal();},
  homeModal(){homeModal();},
  retireModal(){retireModal();},
  retireConfirm(){closeModal();S.over=true;save();showEnd();},
  saveExit(){save();closeModal();showScreen('home');$('#resumeBtn').hidden=false;},
  exitNoSave(){closeModal();showScreen('home');$('#resumeBtn').hidden=!loadSaved();},
  again(){clearSave();showScreen('home');$('#resumeBtn').hidden=true;},
  viewFloor(){showScreen('game');renderAll();},
  closeModal(){closeModal();},
  newsRead(a){const n=S.news.find(x=>x.id===a.id);if(n){n.read=!n.read;renderNews();}},
  buyModal(){buyModal();},
  buyModalOffer(a){buyModal(a.id);},
  buyPick(a){UI.buy.offer=a.id;UI.buy.vessel=null;UI.buy.dest=null;UI.buy.via=null;renderBuy();},
  buyVessel(a){UI.buy.vessel=a;UI.buy.dest=null;UI.buy.via=null;renderBuy();},
  buyDest(a){UI.buy.dest=a.dest;UI.buy.via=a.via;renderBuy();},
  buyVia(a){UI.buy.via=a.via;renderBuy();},
  buyConfirm(){const p=UI.buyPlan;if(!p)return;const e=buyCargo(p,UI.buy.vessel);if(e){setErr(e);return;}closeModal();renderAll();save();toast('Cargo #'+(S.ids.c-1)+' bought');},
  fwdModal(){fwdModal();},
  fwdDest(a){UI.fwd.dest=a.dest;renderFwd();},
  fwdWeek(a){UI.fwd.week=a.week;renderFwd();},
  fwdVol(a){UI.fwd.vol=a.vol;renderFwd();},
  fwdConfirm(){const f=UI.fwd;const e=sellForward(f.dest,f.week,f.vol);if(e){setErr(e);return;}closeModal();renderAll();save();toast('Sold DES '+REGIONS[f.dest].name+' forward');},
  charterModal(){charterModal();},
  chType(a){UI.ch.type=a.type;renderCharter();},
  chWeeks(a){UI.ch.weeks=a.weeks;renderCharter();},
  chRegion(a){UI.ch.region=a.region;renderCharter();},
  chConfirm(){const c=UI.ch;const e=charterVessel(c.type,c.weeks,c.region);if(e){setErr(e);return;}closeModal();renderAll();save();toast('Charter signed');},
  vReposModal(a){reposModal(a.id);},
  reposRegion(a){UI.repos.region=a.region;renderRepos();},
  reposConfirm(){const e=repositionVessel(UI.repos.id,UI.repos.region);if(e){setErr(e);return;}closeModal();renderAll();save();},
  vReletModal(a){reletModal(a.id);},
  reletWeeks(a){UI.relet.weeks=a.weeks;renderRelet();},
  reletConfirm(){const e=reletVessel(UI.relet.id,UI.relet.weeks);if(e){setErr(e);return;}closeModal();renderAll();save();},
  vTermModal(a){termModal(a.id);},
  termConfirm(a){const e=earlyTerminate(a.id);if(e){setErr(e);return;}closeModal();renderAll();save();},
  cDivertModal(a){divertModal(a.id);},
  divertPick(a){UI.divert.dest=a.dest;UI.divert.via=a.via;renderDivert();},
  divertConfirm(){const d=UI.divert;const e=divertCargo(d.id,d.dest,d.via);if(e){setErr(e);return;}closeModal();renderAll();save();},
  cFixModal(a){fixModal(a.id);},
  fixConfirm(a){const e=sellCargoDES(a.id);if(e){setErr(e);return;}closeModal();renderAll();save();toast('Cargo #'+a.id+' sold DES');},
  cFloatModal(a){floatModal(a.id);},
  floatConfirm(a){const e=toggleFloat(a.id);if(e){setErr(e);return;}closeModal();renderAll();save();},
  cSowModal(a){sowModal(a.id);},
  sowConfirm(a){const e=sellOnWater(a.id);if(e){setErr(e);return;}closeModal();renderAll();save();},
  kCoverModal(a){coverModal(a.id);},
  cSettleModal(a){settleModal(a.id);},
  settlePick(a){const e=setSettlement(a.id,a.mode,a.commit);if(e){setErr(e);return;}closeModal();renderAll();save();toast('Cargo #'+a.id+(a.mode==='spot'?' settles spot':a.mode==='wait'?' waits for window #'+a.commit:' settles in whichever window it lands'));},
  cCancelModal(a){cancelModal(a.id);},
  cancelConfirm(a){const e=cancelLifting(a.id);if(e){setErr(e);return;}closeModal();renderAll();save();},
  cancelOfferModal(a){cancelOfferModal(a.id);},
  cancelOfferConfirm(a){const e=cancelTermOffer(a.id);if(e){setErr(e);return;}closeModal();renderAll();save();},
  signModal(a){signModal(a.id);},
  signConfirm(a){const e=signContract(a.id);if(e){setErr(e);return;}closeModal();renderAll();save();toast(CONTRACTS[a.id].name+' signed');},
  hedgeModal(){hedgeModal();},
  cHedgeModal(a){cargoHedgeModal(a.id);},
  hedgeHub(a){UI.hedge.hub=a.hub;renderHedge();},
  hedgeSide(a){UI.hedge.side=a.side;renderHedge();},
  hedgeMonth(a){UI.hedge.mkey=a.mkey;renderHedge();},
  hedgeVol(a){UI.hedge.vol=a.vol;renderHedge();},
  hedgeConfirm(){const f=UI.hedge;const e=openHedge(f.hub,f.mkey,f.vol,f.side);if(e){setErr(e);return;}closeModal();renderAll();save();toast('Paper '+(f.side==='buy'?'bought':'sold'));},
  hCloseModal(a){hCloseModal(a.id);},
  hCloseConfirm(a){const e=closeHedge(a.id);if(e){setErr(e);return;}closeModal();renderAll();save();},
  coverConfirm(a){const e=coverCommit(a.id);if(e){setErr(e);return;}closeModal();renderAll();save();},
};
function closeMenus(){document.querySelectorAll('.menu').forEach(m=>{m.hidden=true;});}
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-act]');
  if(!el||el.disabled){if(!e.target.closest('.menu'))closeMenus();return;}
  if(el.classList.contains('modal')){return;}
  const act=el.dataset.act;
  if(act==='menu'){const m=document.getElementById('menu-'+el.dataset.menu);const open=m&&!m.hidden;closeMenus();if(m&&!open){const r=el.getBoundingClientRect();m.hidden=false;m.style.top=(r.bottom+4)+'px';m.style.left=Math.max(8,Math.min(window.innerWidth-8-m.offsetWidth,r.right-m.offsetWidth))+'px';}return;}
  closeMenus();
  let arg=null;if(el.dataset.arg){try{arg=JSON.parse(el.dataset.arg);}catch(x){arg=null;}}
  if(ACTIONS[act])ACTIONS[act](arg,el);
});
window.addEventListener('scroll',closeMenus,{passive:true});window.addEventListener('resize',closeMenus);
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.closest&&e.target.closest('.news-item')){e.target.closest('.news-item').click();}if(e.key==='Escape'&&!$('#modal').hidden)closeModal();if(e.key==='Enter'&&e.target.id==='company')ACTIONS.begin();});
$('#modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal();});

/* ---------- boot ---------- */
function boot(data){
  if(data&&data.S){S=data.S;M=S.market;reviveRng();migrateState();if(S.over){showEnd();}else{showScreen('game');renderAll();}return;}
  $('#resumeBtn').hidden=!loadSaved();showScreen('home');
}
if(window.claude&&window.claude.hot&&window.claude.hot.snapshot){window.claude.hot.snapshot(()=>({S:S&&UI.screen!=='home'?JSON.parse(JSON.stringify(S)):null}));}
if(window.claude&&window.claude.hot&&window.claude.hot.ready)window.claude.hot.ready(boot);else boot((window.claude&&window.claude.hot&&window.claude.hot.data)||{});
