/* Audit: does selling the destination-hub month contract against a cargo reduce the P&L variance of (cargo + paper)?
   Runs the same seed twice (unhedged, hedged) across many seeds; also checks a few invariants. */
function run(seed,hedged){
  newGame('A',seed);
  // buy the first USGC offer with the fleet vessel to NWE (TTF) if possible, otherwise spot
  const o=liveOffers().find(x=>x.src==='USGC')||liveOffers()[0];
  const v=S.vessels[0];let opts=destOptions(o.src,v.type,'term',v.hire,v.region,o);let pick=opts.find(x=>x.dest==='NWE');let choice={kind:'fleet',id:v.id};
  if(!pick){const rate=spotRate('XDF',REGIONS[o.src].basin);opts=destOptions(o.src,'XDF','spot',rate,null,o);pick=opts.find(x=>x.dest==='NWE');choice={kind:'spot',type:'XDF'};}
  const e=buyCargo(pick.best,choice);if(e)throw new Error(e);
  const c=S.cargoes[0];const hg=cargoHedge(c);
  let h=null;
  if(hedged){const err=openHedge(hg.hub,hg.mkey,3.40,'sell');if(err)throw new Error(err);h=S.hedges[0];}
  const cash0=S.cash+0;const net0=netPnl();
  let guard=0;while(c.phase!=='done'&&guard++<30)nextWeek();
  if(h){while(h.status==='open'&&guard++<40)nextWeek();}
  // realised: cargo result + hedge result; ignore fleet overhead noise by taking cargo.result and h.result directly
  return{cargo:c.result/1e6,paper:h?h.result/1e6:0,eta:c.doneWeek,label:hg.label,pricedAt:c.pricePaid,avg:h?h.exit:null,hedgeW:h?[h.wStart,h.wEnd]:null};
}
const seeds=[];for(let i=1;i<=200;i++)seeds.push(1000+i*37);
let U=[],H=[],rows=[];
for(const s of seeds){const a=run(s,false),b=run(s,true);U.push(a.cargo);H.push(b.cargo+b.paper);rows.push({s,un:a.cargo,cargo:b.cargo,paper:b.paper,tot:b.cargo+b.paper,eta:b.eta,win:b.hedgeW,m:b.label});}
const sd=a=>{const m=a.reduce((x,y)=>x+y,0)/a.length;return Math.sqrt(a.reduce((x,y)=>x+(y-m)*(y-m),0)/a.length);};
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
console.log('unhedged: mean',mean(U).toFixed(2),'sd',sd(U).toFixed(2),'| hedged: mean',mean(H).toFixed(2),'sd',sd(H).toFixed(2),'| paper mean',mean(rows.map(r=>r.paper)).toFixed(2),'| corr(cargo,paper)',(()=>{const a=rows.map(r=>r.cargo),b=rows.map(r=>r.paper);const ma=mean(a),mb=mean(b);let c=0;for(let i=0;i<a.length;i++)c+=(a[i]-ma)*(b[i]-mb);return (c/a.length/(sd(a)*sd(b))).toFixed(2);})());

// invariants
newGame('B',77);const m=curveMonths()[0];console.log('bal month',m.label,'W'+m.wStart+'-'+m.wEnd,'price',m.price.TTF.toFixed(3),'fwd check',fwd('TTF',m.wStart-S.w).toFixed(3));
openHedge('TTF',m.key,1,'buy');const hh=S.hedges[0];console.log('hedge wStart',hh.wStart,'wEnd',hh.wEnd,'mark at open',hedgeMark(hh).toFixed(3),'(should equal price before slip)',hh.price.toFixed(3));
nextWeek();console.log('w',S.w,'mark',hedgeMark(hh).toFixed(3),'spotlog weeks',Object.keys(M.spotLog.TTF).join(','));
