/* bot on the offer book: each week buy the best-margin offer (fleet vessel if it can make the laycan, else spot XDF) while slots and cash allow */
function runSeed(seed,verbose,signAll){
  newGame('TestCo',seed);
  if(signAll){signContract('USTOLL');signContract('QATSPA');signContract('JKTERM');}
  let maxPos=0,buys=0;
  for(let w=1;w<WEEKS;w++){
    for(const h of ['TTF','JKM','HH','BRENT'])if(!isFinite(M.price[h]))throw new Error('NaN price '+h+' w'+w);
    if(!isFinite(M.charter))throw new Error('NaN charter');
    for(const s of LOADS)if(!isFinite(M.fob[s]))throw new Error('NaN fob '+s);
    if(!isFinite(S.cash))throw new Error('NaN cash w'+w);
    for(let tries=0;tries<3;tries++){
      let bestPlan=null,choice=null;
      for(const o of liveOffers()){
        if(canBuy(o.kind==='term'))continue;
        const idle=S.vessels.filter(v=>v.status==='idle'&&v.charter==='term');
        for(const v of idle){const opts=destOptions(o.src,v.type,'term',v.hire,v.region,o);if(opts.length&&(!bestPlan||opts[0].best.margin>bestPlan.margin)){bestPlan=opts[0].best;choice={kind:'fleet',id:v.id};}}
        const rate=spotRate('XDF',REGIONS[o.src].basin);const o2=destOptions(o.src,'XDF','spot',rate,null,o);
        if(o2.length&&(!bestPlan||o2[0].best.margin>bestPlan.margin)){bestPlan=o2[0].best;choice={kind:'spot',type:'XDF'};}
      }
      if(bestPlan&&(bestPlan.margin>0.5e6||bestPlan.offer.kind==='term')){const e=buyCargo(bestPlan,choice);if(e)break;buys++;}else break;
    }
    maxPos=Math.max(maxPos,positions());
    nextWeek();
  }
  const f=finalSummary();const done=S.cargoes.filter(c=>c.phase==='done'&&!c.sold);const avg=done.reduce((a,c)=>a+c.result,0)/Math.max(1,done.length);const wins=done.filter(c=>c.result>0).length;
  if(verbose)console.log(seed,'net',(f.net/1e6).toFixed(1),'realised',(f.realised/1e6).toFixed(1),'overhead',(f.overhead/1e6).toFixed(1),'stars',f.stars,'delivered',f.delivered,'cancelled',f.cancelled,'termLifts',f.termLifts,'defaults',f.defaults,'cash',(S.cash/1e6).toFixed(1),'level',S.level,'maxPos',maxPos,'avg/cargo',(avg/1e6).toFixed(2),'winrate',(wins/Math.max(1,done.length)).toFixed(2));
  return f;
}
console.log('--- no contracts');
let res=[];for(let s=1;s<=8;s++)res.push(runSeed(s*7919,true,false));
let nets=res.map(r=>r.net/1e6).sort((a,b)=>a-b);console.log('median net',nets[Math.floor(nets.length/2)].toFixed(1),'min',nets[0].toFixed(1),'max',nets[nets.length-1].toFixed(1));
console.log('--- all contracts signed');
res=[];for(let s=1;s<=8;s++)res.push(runSeed(s*7919+1,true,true));
nets=res.map(r=>r.net/1e6).sort((a,b)=>a-b);console.log('median net',nets[Math.floor(nets.length/2)].toFixed(1),'min',nets[0].toFixed(1),'max',nets[nets.length-1].toFixed(1));

/* ---- action tests ---- */
console.log('--- actions');
newGame('ActCo',42);const errs=[];const chk=(e,l)=>{if(e)errs.push(l+': '+e);};
console.log('offers w1',liveOffers().map(o=>o.src+'@W'+o.loadWeek+'/'+o.price.toFixed(2)).join(' '));
chk(signContract('USTOLL'),'sign');chk(signContract('JKTERM'),'sign2');
// forward sale with window
chk(sellForward('NWE',S.w+6,3.40),'sellForward');const k1=S.commits[0];console.log('commit window',k1.wStart,k1.wEnd,'price',k1.price.toFixed(2));
// buy an offer with the starter vessel
const v1=S.vessels[0];let o=liveOffers().find(x=>x.src==='USGC');let opts=destOptions('USGC',v1.type,'term',v1.hire,v1.region,o);
console.log('plan',opts[0].dest,'laycan',o.loadWeek,'wait',opts[0].best.wait,'eta',opts[0].best.eta,'upfront',(opts[0].best.upfront/1e6).toFixed(2),'atLoading',(opts[0].best.atLoading/1e6).toFixed(1));
const nweOpt=opts.find(x=>x.dest==='NWE');chk(buyCargo(nweOpt.best,{kind:'fleet',id:v1.id}),'buy');
const c1=S.cargoes[0];console.log('c1 phase',c1.phase,'v status',v1.status,'fobPaid',c1.fobPaid,'cash',(S.cash/1e6).toFixed(1));
const e1=cargoExpected(c1,null);console.log('exp how',e1.how,'eta',e1.eta,'mtm',(e1.mtm/1e6).toFixed(2),'commit',e1.commit&&e1.commit.id);
// settlement: wait for window
chk(setSettlement(c1.id,'wait',k1.id),'wait');console.log('waitFor',c1.waitFor,'exp',JSON.stringify({how:cargoExpected(c1,null).how,hold:cargoExpected(c1,null).holdWeeks,eta:cargoExpected(c1,null).eta}));
// hedge
chk(openHedge('TTF',curveMonths()[1].key,3.40,'sell'),'hedge');const h1=S.hedges[0];console.log('hedge',h1.hub,h1.week,h1.vol,h1.price.toFixed(2),'collateral',(collateral()/1e6).toFixed(2),'free',(availableCash()/1e6).toFixed(1));
console.log('exposure',JSON.stringify(exposure()));
let loadedW=null,heldW=null,dischW=null;
for(let i=0;i<10;i++){nextWeek();if(c1.phase==='laden'&&loadedW===null)loadedW=S.w;if(c1.phase==='float'&&heldW===null)heldW=S.w;if(c1.phase==='done'&&dischW===null)dischW=S.w;}
console.log('c1 loaded W',loadedW,'held W',heldW,'done W',dischW,'how',c1.priceHow,'result',(c1.result/1e6).toFixed(2),'commit',k1.status,'hedge',h1.status,h1.result&&(h1.result/1e6).toFixed(2));
// term offers published?
console.log('term offers',S.offers.filter(x=>x.kind==='term').map(x=>x.src+'@W'+x.loadWeek).join(' '),'term commits',S.commits.filter(x=>x.kind==='term').map(x=>'#'+x.id+' W'+x.wStart+'-'+x.wEnd).join(' '));
// cancel a term lifting and a spot lifting
const to=S.offers.find(x=>x.kind==='term');if(to){const rate=spotRate('XDF','ATL');const op=destOptions(to.src,'XDF','spot',rate,null,to);chk(buyCargo(op[0].best,{kind:'spot',type:'XDF'}),'term buy');const ct=S.cargoes[S.cargoes.length-1];console.log('term cargo',ct.term,ct.phase,'positions',positions());chk(cancelLifting(ct.id),'cancel term');console.log('cancelled',ct.phase,(ct.result/1e6).toFixed(2),'cancelled count',S.stats.cancelled);}
// paper close & margin call scenario
chk(openHedge('JKM',curveMonths()[2].key,7.4,'buy'),'hedge2');const h2=S.hedges[S.hedges.length-1];chk(closeHedge(h2.id),'close');console.log('h2',h2.status,(h2.result/1e6).toFixed(2));
chk(openHedge('JKM',curveMonths()[2].key,100,'buy')&&'ok','cap check expected error');
S.cash=2e6;chk(openHedge('TTF',curveMonths()[1].key,3.7,'buy'),'should fail IM');
// liquidity
console.log('liq',JSON.stringify(M.liq),'slip TTF 4w',slippage('TTF',4,3.7).toFixed(3),'JKM 20w',slippage('JKM',20,7.4).toFixed(3));
// save/load/migrate
const back=JSON.parse(JSON.stringify(S));S=back;M=S.market;reviveRng();migrateState();nextWeek();console.log('after reload w',S.w,'net',(netPnl()/1e6).toFixed(1));
// migrate an old-format save
const old={commits:[{id:1,dest:'NWE',price:10,vol:3.4,week:30,status:'open',opened:20}],cargoes:[],vessels:[],hedges:undefined,offers:undefined,stats:{},ids:{v:1,c:1,k:2,n:1},w:25,market:S.market,over:false,contracts:undefined,news:[],log:[],rng:{a:5}};
S=old;reviveRng();migrateState();console.log('migrated',S.commits[0].wStart,S.commits[0].wEnd,'offers',S.offers.length,'contracts',Object.keys(S.contracts).length);
console.log('errors:',errs.length?errs:'none');
