'use strict';
/* ============================================================
   LNG Trader Sim: model (no DOM access)
   ============================================================ */
const WEEKS=104, START_CASH=250e6, START_MS=Date.UTC(2026,9,5), DAY=86400000;
const PORT_LOAD_FEE=0.25e6, PORT_DISC_FEE=0.35e6, SPOT_POS_FEE=0.40e6, BALLAST_BONUS_DAYS=5;
function spotBonusDays(laden){return Math.max(BALLAST_BONUS_DAYS,Math.round(0.6*laden));}
const TOLL={Panama:0.55e6,Suez:0.70e6,Cape:0,Direct:0};
const LEVELS=[{slots:2,at:0},{slots:3,at:5e6},{slots:4,at:15e6},{slots:5,at:40e6},{slots:6,at:80e6}];
const STARS=[[400e6,4],[200e6,3],[0,2]];
const FLOAT_FUEL=0.35, BALLAST_FUEL=0.85, FIX_DISC=0.10, FWD_DISC=0.15, SOW_FEE=0.015;
const CREDIT_BREACH=0.12, DEFAULT_PEN=0.03, COLLATERAL=0.10, EARLY_TERM=0.25, COVER_SPREAD=0.08;
const SLIP_BASE={TTF:0.04,JKM:0.07,HH:0.025,BRENT:0.3}, PHYS_SPREAD=0.05, HEDGE_IM=0.10, HEDGE_MAX_K=26, CANCEL_SPOT=0.02, WINDOW_WEEKS=2;
const CONTRACTS={
 USTOLL:{id:'USTOLL',name:'US Gulf tolling slot',side:'buy',src:'USGC',every:4,lead:3,priceLabel:'115% Henry Hub + tolling fee, FOB Sabine Pass',cancelLabel:'the fixed fees (liquefaction plus capacity premium)',desc:'Lift or cancel each slot; cancelling costs only the fixed fees (liquefaction + premium, about $5 to $6).',long:'One lifting slot every four weeks at Sabine Pass: 115% of Henry Hub for the feedgas plus fixed fees struck at signing, a liquefaction fee and a capacity premium for the secondary slot. Lift it, or cancel it and pay only the fixed fees: the feedgas is yours only if you load.'},
 QATSPA:{id:'QATSPA',name:'Qatar oil-linked SPA',side:'buy',src:'QAT',every:6,lead:4,priceLabel:'Brent slope + $0.40 + premium, FOB Ras Laffan',cancelLabel:'half the cargo value (take-or-pay)',desc:'Take-or-pay: an unlifted cargo costs half its value.',long:'One cargo every six weeks from Ras Laffan at an oil-linked price: a Brent slope and constant in the range of long-term SPAs, plus a fixed premium for a mid-term deal struck when spot is above oil parity. All three are fixed at signing. Take-or-pay: a cargo you do not lift costs half its value.'},
 JKTERM:{id:'JKTERM',name:'Japan term DES sale',side:'sell',dest:'JKTC',every:6,lead:5,priceLabel:'12.8% Brent + $0.50, DES Sodegaura',cancelLabel:'',desc:'Oil-linked sale into a two-week window; a missed window is a default.',long:'One cargo every six weeks into Sodegaura in a two-week window at an oil-linked price fixed when the window is published. The buyer pays that price whatever JKM does; a missed window is a default.'},
};
function contractTermsNow(id){
  // terms are struck at signing so the contract is roughly fair against that day's market; its value comes from what happens afterwards
  if(id==='USTOLL'){const fee=clamp(2.25+0.15*(atlanticMarker('USGC')-(1.15*spot('HH')+2.25)),2.0,3.5);const prem=Math.max(0,0.75*(M.fob.USGC-(1.15*spot('HH')+fee)));return{fee,prem};}
  if(id==='QATSPA'){const nb=markerNetback('QAT');const slope=clamp((0.98*nb-0.40)/spot('BRENT')*0.9,0.105,0.125);const prem=Math.max(0,0.75*(M.fob.QAT-(slope*spot('BRENT')+0.40)));return{slope,prem};}
  const p=0.5*(desFwd('JKTC',6)+desFwd('JKTC',12));return{slope:clamp((p-0.50)/spot('BRENT')-0.005,0.11,0.135)};
}
function contractTerms(id){const c=S.contracts&&S.contracts[id];const t=(c&&c.terms)||(id==='USTOLL'?{fee:2.55,prem:0}:id==='QATSPA'?{slope:0.12,prem:0}:{slope:0.128});if((id==='USTOLL'||id==='QATSPA')&&t.prem==null)t.prem=0;return t;}
function contractPrice(id){const t=contractTerms(id);return id==='USTOLL'?1.15*spot('HH')+t.fee+t.prem:id==='QATSPA'?t.slope*spot('BRENT')+0.40+t.prem:t.slope*spot('BRENT')+0.50;}
function contractCancelFee(id,vol,price){const t=contractTerms(id);return id==='USTOLL'?(t.fee+t.prem)*vol*1e6:id==='QATSPA'?0.5*price*vol*1e6:0;}
function contractLiftings(id){const def=CONTRACTS[id];const first=S.w+def.lead+1;return first>=WEEKS?0:Math.floor((WEEKS-1-first)/def.every)+1;}
function contractPremium(id,t){
  // secondary-market capacity premium: most of the arb visible today is paid for up front, the player keeps the optionality and the risk
  return 0;
}
function contractFair(id){if(id==='USTOLL'){const t=contractTerms(id);const nb=atlanticMarker('USGC');return{px:1.15*spot('HH')+t.fee,netback:nb,marker:M.fob.USGC};}return null;}
function contractLabel(id,t){t=t||(S.contracts&&S.contracts[id]&&S.contracts[id].terms)||contractTermsNow(id);return id==='USTOLL'?'115% Henry Hub + $'+t.fee.toFixed(2)+' liquefaction'+((t.prem||0)>0.005?' + $'+t.prem.toFixed(2)+' capacity premium':'')+', FOB Sabine Pass':id==='QATSPA'?(t.slope*100).toFixed(1)+'% Brent + $0.40'+((t.prem||0)>0.005?' + $'+t.prem.toFixed(2)+' premium':'')+', FOB Ras Laffan':(t.slope*100).toFixed(1)+'% Brent + $0.50, DES Sodegaura';}
const TYPE_FACTOR={STEAM:0.5,TFDE:0.78,XDF:1};
const FOB_CAPTURE={USGC:0.88,QAT:0.95}, FOB_DISC={AUS:0.10,NIG:0.20};
const STORY_WEEKS=[6,24,46,68,88];
const NEWS_KEEP_WEEKS=5;

let S=null, M=null;

function clamp(x,a,b){return Math.max(a,Math.min(b,x));}
function RNG(seed){this.a=seed>>>0;}
RNG.prototype.next=function(){let t=this.a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
RNG.prototype.norm=function(){let u=0,v=0;while(u===0)u=this.next();while(v===0)v=this.next();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);};
RNG.prototype.pick=function(arr){return arr[Math.floor(this.next()*arr.length)];};
RNG.prototype.weighted=function(arr,wf){const tot=arr.reduce((s,x)=>s+wf(x),0);let r=this.next()*tot;for(const x of arr){r-=wf(x);if(r<=0)return x;}return arr[arr.length-1];};
function rng(){return S.rng;}

/* ---------- geography ---------- */
const REGIONS={
 USGC:{name:'US Gulf Coast',port:'Sabine Pass',lat:29.7,lon:-93.9,load:true,basin:'ATL'},
 NIG:{name:'Nigeria',port:'Bonny Island',lat:4.4,lon:7.2,load:true,basin:'ATL'},
 QAT:{name:'Qatar',port:'Ras Laffan',lat:25.9,lon:51.5,load:true,basin:'PAC'},
 AUS:{name:'Australia',port:'Gladstone',lat:-23.8,lon:151.3,load:true,basin:'PAC'},
 NWE:{name:'NW Europe',port:'Rotterdam Gate',lat:51.9,lon:4.1,hub:'TTF',basis:-0.35,group:'EUR'},
 MED:{name:'Med & Turkey',port:'Marmara Ereğlisi',lat:40.9,lon:27.3,hub:'TTF',basis:0.25,group:'EUR'},
 JKTC:{name:'Japan & Korea',port:'Sodegaura',lat:35.4,lon:139.9,hub:'JKM',basis:0,group:'ASIA'},
 CHN:{name:'China',port:'Dapeng',lat:22.6,lon:114.5,hub:'JKM',basis:-0.45,group:'ASIA'},
 IND:{name:'India',port:'Dahej',lat:21.7,lon:72.6,hub:'JKM',basis:-1.1,group:'IND'},
};
const LOADS=['USGC','NIG','QAT','AUS'], DESTS=['NWE','MED','JKTC','CHN','IND'];
const ALL_REGIONS=[...LOADS,...DESTS];
const WP={FLA:[24.5,-80.5],MIDATL:[40,-45],BISCAY:[46,-9],GIB:[36,-5.8],ITALY:[37.5,16],AEGEAN:[37,25],DARD:[40.2,26.3],
 SUEZ:[30.5,32.3],RED:[20,38.5],BAB:[12.6,43.4],ARAB:[12,60],HORM:[26.4,56.6],CEYL:[5.5,80.5],MAL:[1.5,103.5],LUZON:[20,121],TAIW:[25,122],
 CAPE:[-35.5,19],SATL:[0,-28],WAFR:[5,-8],SWAFR:[-18,9],CANARY:[28,-16],SIND:[-30,70],JAVA:[-8,112],TORRES:[-10.5,143],
 PANA:[9.1,-79.7],PANB:[7.5,-80.5],NPAC1:[30,-135],NPAC2:[42,-170],NPAC3:[40,165],EPAC:[-5,-120],SPAC:[-20,170],CORAL:[-15,155],PNG:[-2,150],PHIL:[15,128]};
const R=(via,days,wp)=>({via,days,wp});
const ROUTES={
 'USGC-NWE':[R('Direct',12,['FLA','MIDATL','BISCAY'])],
 'USGC-MED':[R('Direct',16,['FLA','GIB','ITALY','AEGEAN','DARD'])],
 'USGC-JKTC':[R('Panama',24,['FLA','PANA','PANB','NPAC1','NPAC2','NPAC3']),R('Cape',44,['FLA','SATL','CAPE','SIND','CEYL','MAL','LUZON','TAIW']),R('Suez',36,['FLA','GIB','SUEZ','RED','BAB','ARAB','CEYL','MAL','LUZON','TAIW'])],
 'USGC-CHN':[R('Panama',26,['FLA','PANA','PANB','NPAC1','NPAC2','NPAC3','TAIW']),R('Cape',42,['FLA','SATL','CAPE','SIND','CEYL','MAL']),R('Suez',35,['FLA','GIB','SUEZ','RED','BAB','ARAB','CEYL','MAL'])],
 'USGC-IND':[R('Suez',29,['FLA','GIB','SUEZ','RED','BAB','ARAB']),R('Cape',33,['FLA','SATL','CAPE','SIND'])],
 'USGC-QAT':[R('Suez',27,['FLA','GIB','SUEZ','RED','BAB','ARAB','HORM']),R('Cape',32,['FLA','SATL','CAPE','SIND','ARAB','HORM'])],
 'USGC-AUS':[R('Panama',32,['FLA','PANA','PANB','EPAC','SPAC']),R('Cape',40,['FLA','SATL','CAPE','SIND','JAVA','TORRES'])],
 'USGC-NIG':[R('Direct',16,['FLA','SATL','WAFR'])],
 'NIG-NWE':[R('Direct',11,['WAFR','CANARY','BISCAY'])],
 'NIG-MED':[R('Direct',8,['WAFR','CANARY','GIB','ITALY','AEGEAN','DARD'])],
 'NIG-JKTC':[R('Cape',33,['SWAFR','CAPE','SIND','CEYL','MAL','LUZON','TAIW']),R('Suez',31,['WAFR','CANARY','GIB','SUEZ','RED','BAB','ARAB','CEYL','MAL','LUZON','TAIW'])],
 'NIG-CHN':[R('Cape',31,['SWAFR','CAPE','SIND','CEYL','MAL']),R('Suez',30,['WAFR','CANARY','GIB','SUEZ','RED','BAB','ARAB','CEYL','MAL'])],
 'NIG-IND':[R('Cape',19,['SWAFR','CAPE','SIND']),R('Suez',21,['WAFR','CANARY','GIB','SUEZ','RED','BAB','ARAB'])],
 'NIG-QAT':[R('Cape',19,['SWAFR','CAPE','SIND','ARAB','HORM']),R('Suez',15,['WAFR','CANARY','GIB','SUEZ','RED','BAB','ARAB','HORM'])],
 'NIG-AUS':[R('Cape',25,['SWAFR','CAPE','SIND','JAVA','TORRES'])],
 'QAT-NWE':[R('Suez',17,['HORM','ARAB','BAB','RED','SUEZ','GIB','BISCAY']),R('Cape',31,['HORM','ARAB','SIND','CAPE','SWAFR','WAFR','CANARY','BISCAY'])],
 'QAT-MED':[R('Suez',11,['HORM','ARAB','BAB','RED','SUEZ','AEGEAN','DARD']),R('Cape',32,['HORM','ARAB','SIND','CAPE','SWAFR','WAFR','CANARY','GIB','ITALY','AEGEAN','DARD'])],
 'QAT-JKTC':[R('Direct',16,['HORM','ARAB','CEYL','MAL','LUZON','TAIW'])],
 'QAT-CHN':[R('Direct',14,['HORM','ARAB','CEYL','MAL'])],
 'QAT-IND':[R('Direct',4,['HORM'])],
 'QAT-AUS':[R('Direct',17,['HORM','ARAB','CEYL','JAVA','TORRES'])],
 'AUS-NWE':[R('Suez',32,['TORRES','JAVA','CEYL','ARAB','BAB','RED','SUEZ','GIB','BISCAY']),R('Cape',35,['TORRES','JAVA','SIND','CAPE','SWAFR','WAFR','CANARY','BISCAY'])],
 'AUS-MED':[R('Suez',27,['TORRES','JAVA','CEYL','ARAB','BAB','RED','SUEZ','AEGEAN','DARD']),R('Cape',36,['TORRES','JAVA','SIND','CAPE','SWAFR','WAFR','CANARY','GIB','ITALY','AEGEAN','DARD'])],
 'AUS-JKTC':[R('Direct',9,['CORAL','PNG','PHIL'])],
 'AUS-CHN':[R('Direct',8,['CORAL','PNG','LUZON'])],
 'AUS-IND':[R('Direct',12,['TORRES','JAVA','CEYL'])],
 'NWE-MED':[R('Direct',7,['BISCAY','GIB','ITALY','AEGEAN','DARD'])],
 'NWE-JKTC':[R('Suez',32,['BISCAY','GIB','SUEZ','RED','BAB','ARAB','CEYL','MAL','LUZON','TAIW']),R('Cape',42,['BISCAY','CANARY','WAFR','SWAFR','CAPE','SIND','CEYL','MAL','LUZON','TAIW'])],
 'NWE-CHN':[R('Suez',31,['BISCAY','GIB','SUEZ','RED','BAB','ARAB','CEYL','MAL']),R('Cape',41,['BISCAY','CANARY','WAFR','SWAFR','CAPE','SIND','CEYL','MAL'])],
 'NWE-IND':[R('Suez',19,['BISCAY','GIB','SUEZ','RED','BAB','ARAB']),R('Cape',29,['BISCAY','CANARY','WAFR','SWAFR','CAPE','SIND'])],
 'MED-JKTC':[R('Suez',27,['DARD','AEGEAN','SUEZ','RED','BAB','ARAB','CEYL','MAL','LUZON','TAIW']),R('Cape',40,['DARD','AEGEAN','ITALY','GIB','CANARY','WAFR','SWAFR','CAPE','SIND','CEYL','MAL','LUZON','TAIW'])],
 'MED-CHN':[R('Suez',26,['DARD','AEGEAN','SUEZ','RED','BAB','ARAB','CEYL','MAL']),R('Cape',39,['DARD','AEGEAN','ITALY','GIB','CANARY','WAFR','SWAFR','CAPE','SIND','CEYL','MAL'])],
 'MED-IND':[R('Suez',14,['DARD','AEGEAN','SUEZ','RED','BAB','ARAB']),R('Cape',28,['DARD','AEGEAN','ITALY','GIB','CANARY','WAFR','SWAFR','CAPE','SIND'])],
 'JKTC-CHN':[R('Direct',3,['TAIW'])],
 'JKTC-IND':[R('Direct',13,['TAIW','LUZON','MAL','CEYL'])],
 'CHN-IND':[R('Direct',11,['MAL','CEYL'])],
};
function routeOptions(a,b){
  if(a===b)return[{via:'Direct',days:0,wp:[]}];
  const k=a+'-'+b; if(ROUTES[k])return ROUTES[k];
  const r=ROUTES[b+'-'+a]; return r.map(o=>({via:o.via,days:o.days,wp:[...o.wp].reverse()}));
}
function routeBlocked(via){return via!=='Direct'&&via!=='Cape'&&M.block[via]>0;}
function effDays(opt,vt){const d=M.delay[opt.via]?M.delay[opt.via].days:0;return Math.max(1,Math.round(opt.days*vt.speed+d));}
function bestRoute(a,b,vt,rate){
  let best=null;
  for(const o of routeOptions(a,b)){
    if(routeBlocked(o.via))continue;
    const d=effDays(o,vt); const cost=d*(rate+vt.heel*10)+TOLL[o.via];
    if(!best||cost<best.cost)best={opt:o,days:d,cost};
  }
  return best;
}
function shareFactor(d1,d2){const g1=REGIONS[d1].group,g2=REGIONS[d2].group;if(g1===g2)return 0.85;if((g1==='ASIA'&&g2==='IND')||(g1==='IND'&&g2==='ASIA'))return 0.6;return 0.35;}

/* ---------- fleet ---------- */
const VTYPES={
 STEAM:{key:'STEAM',name:'Steam turbine',cap:145,tbtu:3.05,bor:0.22,borIdle:0.15,heel:5500,speed:1.06},
 TFDE:{key:'TFDE',name:'TFDE',cap:160,tbtu:3.40,bor:0.15,borIdle:0.10,heel:4800,speed:1.0},
 XDF:{key:'XDF',name:'2-stroke XDF',cap:174,tbtu:3.70,bor:0.12,borIdle:0.07,heel:4000,speed:0.97},
};
const VESSEL_NAMES=['Meridian Frost','Polar Cadence','Argent Voyager','Northern Lumen','Cryo Aldebaran','Icebound Atlas','Silver Marlin','Celestial Tide','Frost Haven','Borealis Cove','Hyperion Reach','Lantern Strait','Aurora Pelagic','Cobalt Halo','Vesper Meridian','Glacier Sound','Tempest Ledger','Ember Pavane','Sable Horizon','Quiet Latitude'];
const HUBS={TTF:{name:'TTF',venue:'ICE Endex · Netherlands'},JKM:{name:'JKM',venue:'Platts · Japan & Korea'},HH:{name:'Henry Hub',venue:'NYMEX · Louisiana'},BRENT:{name:'Brent',venue:'ICE · $/bbl'}};

/* ---------- calendar & seasonality ---------- */
function dateOf(w){return new Date(START_MS+(w-1)*7*DAY);}
function doy(d){return (d.getTime()-Date.UTC(d.getUTCFullYear(),0,1))/DAY;}
function season(w){const t=doy(dateOf(w))/365.25*2*Math.PI;return Math.cos(t-0.25);}
function base(h,w){const s=season(w);return{TTF:10.3+1.9*s,JKM:11.4+2.3*s,HH:3.6+0.5*s,BRENT:68}[h];}
function storageNorm(w){const t=doy(dateOf(w))/365.25*2*Math.PI;return 66-26*Math.sin(t-0.6);}
function charterBase(w,jkmTtf){return 70000+35000*season(w)+30000*clamp((jkmTtf-0.9)/1.5,-0.5,1.5);}
function dateLabel(w){const d=dateOf(w);const m=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()];return String(d.getUTCDate()).padStart(2,'0')+' '+m+' '+d.getUTCFullYear();}
function monthOf(w){const d=dateOf(w);return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()];}
function isWinter(w){return season(w)>0.3;}
function isSummer(w){return season(w)<-0.3;}

/* ---------- market ---------- */
function newMarket(r){
  const M={dev:{TTF:0,JKM:0,HH:0,BRENT:0},regime:{GAS:1,HH:1,BRENT:1},bias:{TTF:0.15,JKM:0.1,HH:0},price:{},prev:{},
   hist:{TTF:[],JKM:[],HH:[],BRENT:[],CH:[]},chDev:0,charter:0,chPrev:0,storage:88,shocks:[],chShocks:[],
   block:{Panama:0,Suez:0},delay:{Panama:{days:0,weeks:0},Suez:{days:0,weeks:0}},outage:{USGC:0,NIG:0,QAT:0,AUS:0},
   congest:{NWE:0,MED:0,JKTC:0,CHN:0,IND:0},basisAdj:{NWE:[0,0],MED:[0,0],JKTC:[0,0],CHN:[0,0],IND:[0,0]},
   demandOff:{IND:0},spotTight:{ATL:0,PAC:0},fobNoise:{USGC:0,NIG:0,QAT:0,AUS:0},fob:{},fobPrev:{},structure:'FLAT',weather:0,liq:{TTF:1,JKM:1,HH:1}};
  for(const h in M.dev)M.dev[h]=r.norm()*0.04;
  M.chDev=r.norm()*0.08;
  return M;
}
function regimeOf(h){return(h==='TTF'||h==='JKM')?M.regime.GAS:M.regime[h];}
function spot(h){return M.price[h];}
function fwdWeekly(h,k){k=Math.max(0,k);const b=base(h,S.w+k)*regimeOf(h);const d=M.dev[h]*Math.pow(0.9,k);const bias=(M.bias[h]||0)*Math.min(k,26)/26;return Math.max(0.5,b*Math.exp(d)+bias);}
const MONTH_OF_WEEK=[],MONTH_WEEKS={};
for(let w=0;w<WEEKS+8;w++){const d=dateOf(w);const key=d.getUTCFullYear()*12+d.getUTCMonth();MONTH_OF_WEEK[w]=key;if(!MONTH_WEEKS[key])MONTH_WEEKS[key]=[w,w];else MONTH_WEEKS[key][1]=w;}
function monthKeyOf(w){return MONTH_OF_WEEK[Math.max(0,Math.min(WEEKS+7,w))];}
function monthRange(key){const r=MONTH_WEEKS[key];return r?[Math.max(1,r[0]),Math.min(WEEKS-1,r[1])]:[S.w,S.w];}
function monthLabelKey(key){const m=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][key%12];return m+' '+String(Math.floor(key/12)).slice(2);}
function fwd(h,k){
  // the market quotes monthly contracts: one price for every week of a calendar month (the balance of the current month for its remaining weeks)
  if(k<=0)return M.price[h];
  const W=S.w+k;const key=monthKeyOf(W);const [ms,me]=monthRange(key);const from=Math.max(S.w+1,ms),to=Math.max(from,me);
  if(!M.fcache||M.fcache.w!==S.w)M.fcache={w:S.w};
  const ck=h+':'+key;if(M.fcache[ck]!=null)return M.fcache[ck];
  let sum=0,n=0;for(let w=from;w<=to;w++){sum+=fwdWeekly(h,w-S.w);n++;}
  const v=n?sum/n:fwdWeekly(h,k);M.fcache[ck]=v;return v;
}
function rangeMark(h,ws,we){
  // mark of a contract covering weeks ws..we: weeks already past at their spot, the rest at the balance-of-month price
  let sum=0,n=0;
  for(let w=ws;w<=we;w++){if(w<=S.w){const p=M.spotLog&&M.spotLog[h]&&M.spotLog[h][w];if(p!=null){sum+=p;n++;}}else{sum+=fwd(h,w-S.w);n++;}}
  return n?sum/n:M.price[h];
}
function rangeSettle(h,ws,we){let sum=0,n=0;for(let w=ws;w<=we;w++){const p=M.spotLog&&M.spotLog[h]&&M.spotLog[h][w];if(p!=null){sum+=p;n++;}}return n?sum/n:M.price[h];}
function monthMark(h,key){const [ms,me]=monthRange(key);return rangeMark(h,ms,me);}
function monthSettle(h,key){const [ms,me]=monthRange(key);return rangeSettle(h,ms,me);}
function hedgeMark(x){return rangeMark(x.hub,x.wStart,x.wEnd);}
function des(dest){return desFwd(dest,0);}
function desFwd(dest,k){
  const Rg=REGIONS[dest];let p=fwd(Rg.hub,k)+Rg.basis;
  const ba=M.basisAdj[dest];if(ba&&ba[1]>k)p+=ba[0];
  if(M.congest[dest]>k)p-=0.6;
  if(M.demandOff[dest]>k)p-=2.5;
  return p;
}
function typeRate(t){return M.charter*TYPE_FACTOR[t];}
function spotRate(t,basin){let r=typeRate(t);if(basin&&M.spotTight[basin]>0)r*=1.5;return r;}
function tcRate(t,weeks){
  // term curve: blends spot with a long-run level, then a duration discount so longer commitments are always cheaper per day
  const f=TYPE_FACTOR[t],sp=M.charter,base=75000;
  const r26=(0.72*sp+0.28*base)*f;
  const r52=Math.min(r26,(0.55*sp+0.45*base)*f)*0.94;
  const r78=Math.min(r52*0.94,(0.45*sp+0.55*base)*f*0.88);
  return weeks>=78?r78:weeks>=52?r52:r26;
}
function curveMonths(maxK){
  maxK=maxK||HEDGE_MAX_K;const out=[];const key0=monthKeyOf(S.w);let key=key0;
  while(true){const [ms,me]=monthRange(key);const wStart=Math.max(S.w+1,ms),wEnd=me;if(wStart>=WEEKS||wStart-S.w>maxK)break;if(wEnd>=wStart){const m={key,label:monthLabelKey(key),wStart,wEnd,bom:key===key0,ks:[],price:{}};for(let w=wStart;w<=wEnd;w++)m.ks.push(w-S.w);for(const h of ['TTF','JKM','HH'])m.price[h]=fwd(h,wStart-S.w);m.mid=m.ks[0];out.push(m);}key++;if(!MONTH_WEEKS[key])break;}
  return out;
}
function structureOf(){const r=fwd('TTF',13)/spot('TTF');return r>1.03?'CONTANGO':r<0.97?'BACKWARDATION':'FLAT';}
function hubPriceAt(region){const Rg=REGIONS[region];if(!Rg)return spot('TTF');if(Rg.hub)return spot(Rg.hub);return Rg.basin==='PAC'?spot('JKM'):spot('TTF');}
function heelDay(vt,region){return vt.heel*hubPriceAt(region||'USGC');}
function fuelDay(vt){return 0;}

function computePrices(){
  M.fcache=null;
  for(const h of ['TTF','JKM','HH','BRENT'])M.price[h]=Math.max(h==='BRENT'?25:0.6,base(h,S.w)*regimeOf(h)*Math.exp(M.dev[h]));
  M.charter=Math.max(18000,charterBase(S.w,M.price.JKM-M.price.TTF)*Math.exp(M.chDev));
  M.structure=structureOf();
}
function netbackTo(src,d){
  const vt=VTYPES.XDF,rate=spotRate('XDF',REGIONS[src].basin);
  if(M.demandOff[d]>0)return null;
  const br=bestRoute(src,d,vt,rate);if(!br)return null;
  const e=routeEcon(br.days,br.opt.via,vt,rate,spotBonusDays(br.days),SPOT_POS_FEE,0,src);
  return desFwd(d,Math.ceil(br.days/7))*(1-vt.bor/100*br.days)-e.total/(vt.tbtu*1e6);
}
function bestNetback(src,dests){let best=null;for(const d of dests){const nb=netbackTo(src,d);if(nb!=null&&(best==null||nb>best))best=nb;}return best;}
function markerNetback(src){return bestNetback(src,DESTS);}
const EU_DESTS=['NWE','MED'],ASIA_DESTS=['JKTC','CHN','IND'];
function basinNetbacks(src){
  // Atlantic supply prices off its marginal buyer, Europe; the East-West spread beyond freight stays mostly with whoever has the ship
  const eu=bestNetback(src,EU_DESTS),asia=bestNetback(src,ASIA_DESTS);
  return{eu:eu==null?asia:eu,asia:asia==null?eu:asia};
}
function atlanticMarker(src){const nb=basinNetbacks(src);return nb.eu+0.2*Math.max(0,nb.asia-nb.eu);}
function computeFOB(){
  M.fobPrev={...M.fob};
  const HH=spot('HH'),BR=spot('BRENT');
  const usCost=1.15*HH+2.55, usFloor=1.15*HH+0.3;
  const nbUS=atlanticMarker('USGC');
  M.fob.USGC=Math.max(usFloor,usCost+FOB_CAPTURE.USGC*(nbUS-usCost))+M.fobNoise.USGC;
  const qOil=0.12*BR+0.4, nbQ=bestNetback('QAT',ASIA_DESTS.concat(EU_DESTS));
  M.fob.QAT=Math.max(qOil,qOil+FOB_CAPTURE.QAT*(nbQ-qOil))+M.fobNoise.QAT;
  M.fob.AUS=bestNetback('AUS',ASIA_DESTS)-FOB_DISC.AUS+M.fobNoise.AUS;
  M.fob.NIG=atlanticMarker('NIG')-FOB_DISC.NIG+M.fobNoise.NIG;
  for(const s of LOADS)M.fob[s]=Math.max(1.5,M.fob[s]);
}
function recordHist(){
  if(!M.spotLog)M.spotLog={TTF:{},JKM:{},HH:{}};for(const h of ['TTF','JKM','HH'])M.spotLog[h][S.w]=+M.price[h].toFixed(4);
  for(const h of ['TTF','JKM','HH','BRENT']){M.hist[h].push(+M.price[h].toFixed(3));if(M.hist[h].length>60)M.hist[h].shift();}
  M.hist.CH.push(Math.round(M.charter));if(M.hist.CH.length>60)M.hist.CH.shift();
}
function routeEcon(days,via,vt,rate,bonusDays,posFee,ballastDays,fromRegion){
  const hire=rate*(days+ballastDays+bonusDays)+posFee;
  const fuel=ballastDays?heelDay(vt,fromRegion)*ballastDays:0;
  const toll=TOLL[via]||0;
  const fees=PORT_LOAD_FEE+PORT_DISC_FEE;
  return{days,hire,fuel,toll,fees,total:hire+fuel+toll+fees};
}

function stepMarket(){
  const r=rng();
  // counters
  for(const k in M.block)if(M.block[k]>0)M.block[k]--;
  for(const k in M.delay)if(M.delay[k].weeks>0){M.delay[k].weeks--;if(M.delay[k].weeks===0)M.delay[k].days=0;}
  for(const k in M.outage)if(M.outage[k]>0)M.outage[k]--;
  for(const k in M.congest)if(M.congest[k]>0)M.congest[k]--;
  for(const k in M.basisAdj)if(M.basisAdj[k][1]>0){M.basisAdj[k][1]--;if(M.basisAdj[k][1]===0)M.basisAdj[k][0]=0;}
  for(const k in M.demandOff)if(M.demandOff[k]>0)M.demandOff[k]--;
  for(const k in M.spotTight)if(M.spotTight[k]>0)M.spotTight[k]--;
  // events due this week
  for(const n of S.news){if(n.impactWeek===S.w&&!n.applied){applyImpact(n.impact,n.fx,1);n.applied=true;}}
  // shocks
  M.prev={...M.price};M.chPrev=M.charter;
  for(const sh of M.shocks){if(sh.left>0){M.dev[sh.hub]+=sh.per/Math.max(0.5,M.price[sh.hub]);sh.left--;}}
  M.shocks=M.shocks.filter(s=>s.left>0);
  for(const sh of M.chShocks){if(sh.left>0){M.chDev+=sh.per/Math.max(20000,M.charter);sh.left--;}}
  M.chShocks=M.chShocks.filter(s=>s.left>0);
  // regimes and curve bias
  M.regime.GAS=clamp(M.regime.GAS*Math.exp(r.norm()*0.012-0.02*Math.log(M.regime.GAS)),0.6,1.8);
  M.regime.HH=clamp(M.regime.HH*Math.exp(r.norm()*0.014-0.02*Math.log(M.regime.HH)),0.6,1.9);
  M.regime.BRENT=clamp(M.regime.BRENT*Math.exp(r.norm()*0.012-0.02*Math.log(M.regime.BRENT)),0.6,1.6);
  for(const h of ['TTF','JKM','HH'])M.bias[h]=clamp(M.bias[h]*0.92+r.norm()*0.09,-1.4,1.4);
  // correlated innovations
  const z1=r.norm(),z2=r.norm(),z3=r.norm(),z4=r.norm();
  const zT=z1,zJ=0.7*z1+0.714*z2,zH=0.2*z1+0.98*z3,zB=0.3*z1+0.954*z4;
  const gap=M.dev.TTF-M.dev.JKM;
  M.dev.TTF=M.dev.TTF*0.88+0.055*zT-0.10*gap;
  M.dev.JKM=M.dev.JKM*0.88+0.05*zJ+0.10*gap;
  M.dev.HH=M.dev.HH*0.90+0.065*zH;
  M.dev.BRENT=M.dev.BRENT*0.95+0.035*zB;
  // storage: cold weather and low prices draw it down, high prices pull cargoes in
  M.weather=M.weather*0.6+r.norm()*0.8;
  const inj=storageNorm(S.w)-storageNorm(S.w-1);
  M.storage=clamp(M.storage+inj+M.weather*0.6+3.0*M.dev.TTF,12,100);
  M.dev.TTF+=-0.0025*(M.storage-storageNorm(S.w));
  M.dev.TTF=clamp(M.dev.TTF,-0.7,0.9);M.dev.JKM=clamp(M.dev.JKM,-0.7,0.9);M.dev.HH=clamp(M.dev.HH,-0.8,1.1);M.dev.BRENT=clamp(M.dev.BRENT,-0.5,0.6);
  computePrices();
  // charter
  M.chDev=clamp(M.chDev*0.85+r.norm()*0.09,-0.9,1.3);
  computePrices();
  for(const s of LOADS)M.fobNoise[s]=M.fobNoise[s]*0.6+r.norm()*0.13;
  computeFOB();
  if(!M.liq)M.liq={TTF:1,JKM:1,HH:1};
  for(const h of ['TTF','JKM','HH']){const ret=Math.abs(Math.log(M.price[h]/Math.max(0.1,M.prev[h]||M.price[h])));M.liq[h]=clamp(0.8*M.liq[h]+0.2*(1/(1+9*ret))+r.norm()*0.04,0.35,1.25);}
  recordHist();
}
function slippage(hub,k,vol){const liq=(M.liq&&M.liq[hub])||1;return (SLIP_BASE[hub]||0.05)*(1+Math.max(0,k)/10)*Math.sqrt(Math.max(0.5,vol||3.7)/3.7)/liq;}
function liqLabel(hub){const l=(M.liq&&M.liq[hub])||1;return l>=0.9?'liquid':l>=0.65?'normal':'thin';}
function physSpread(dest,k,vol){return slippage(REGIONS[dest].hub,k,vol)+PHYS_SPREAD;}
function applyImpact(impact,fx,mult){
  if(impact){for(const h in impact){const [tot,wk]=impact[h];if(h==='charter')M.chShocks.push({per:tot*mult/wk,left:wk});else M.shocks.push({hub:h,per:tot*mult/wk,left:wk});}}
  if(fx)for(const f of fx){
    if(f.block)M.block[f.block.route]=Math.max(M.block[f.block.route],f.block.weeks);
    if(f.delay)M.delay[f.delay.route]={days:f.delay.days,weeks:f.delay.weeks};
    if(f.outage)M.outage[f.outage.src]=Math.max(M.outage[f.outage.src],f.outage.weeks);
    if(f.congest)M.congest[f.congest.dest]=Math.max(M.congest[f.congest.dest],f.congest.weeks);
    if(f.basis)M.basisAdj[f.basis.dest]=[f.basis.delta,f.basis.weeks];
    if(f.demandOff)M.demandOff[f.demandOff.dest]=Math.max(M.demandOff[f.demandOff.dest],f.demandOff.weeks);
    if(f.spotTight)M.spotTight[f.spotTight.basin]=Math.max(M.spotTight[f.spotTight.basin],f.spotTight.weeks);
    if(typeof f.storage==='number')M.storage=clamp(M.storage+f.storage,12,100);
  }
}

/* ---------- news library ---------- */
const EVENTS=[
 {id:'coldAsia',title:'Cold snap forecast for Northeast Asia',body:'Models show a 10-day Siberian outbreak over Korea and Japan from next week. Utilities are already chasing prompt cargoes.',season:'winter',w:3,impact:{JKM:[2.2,3],TTF:[0.6,3],charter:[12000,3]},tags:['JKM ▲','charter ▲']},
 {id:'coldEurope',title:'Arctic blast heading for NW Europe',body:'A blocking high sets up an easterly flow; heating demand expected 25% above normal for two weeks. Storage withdrawals will accelerate.',season:'winter',w:3,impact:{TTF:[2.0,3],JKM:[0.5,3]},fx:[{storage:-4}],tags:['TTF ▲','storage ▼']},
 {id:'mild',title:'Forecasters cut heating demand outlook: mild winter',body:'Seasonal models now show temperatures 2°C above normal through February. Buyers are deferring tenders.',season:'winter',w:2.5,impact:{TTF:[-1.4,4],JKM:[-1.0,4]},tags:['TTF ▼','JKM ▼']},
 {id:'freeport',title:'Freeport LNG trips offline after compressor fire',body:'All three trains are down. The operator gives no restart date. Roughly 2 Bcf/d of feedgas backs up into the US market.',w:2,impact:{HH:[-0.35,4],TTF:[0.9,3],JKM:[0.5,3]},fx:[{outage:{src:'USGC',weeks:3}}],tags:['HH ▼','TTF ▲','Sabine Pass: no spot cargoes']},
 {id:'norway',title:'Unplanned outage at Nyhamna gas plant',body:'Gassco reports a compressor failure cutting Norwegian exports by 40 mcm/d for at least a fortnight.',w:2.5,impact:{TTF:[1.1,2]},tags:['TTF ▲']},
 {id:'qatarTrip',title:'Ras Laffan train trips, force majeure on three cargoes',body:'QatarEnergy notifies buyers of a mechanical trip. Spot availability from Ras Laffan is suspended for two weeks.',w:2,impact:{JKM:[1.3,2],TTF:[0.5,2]},fx:[{outage:{src:'QAT',weeks:2}}],tags:['JKM ▲','Ras Laffan: no spot cargoes']},
 {id:'panamaDrought',title:'Panama Canal Authority cuts daily transits on low Gatún levels',body:'LNG carriers face a queue of 8 to 10 days; slot auctions are back. Expect longer US Gulf to Asia voyages.',w:2,impact:{charter:[18000,4]},fx:[{delay:{route:'Panama',days:9,weeks:8}}],tags:['Panama +9 d','charter ▲']},
 {id:'redSea',title:'Security incident in Bab el-Mandeb, carriers pause Suez routing',body:'Two tankers were targeted overnight. Owners are instructing LNG carriers to route via the Cape of Good Hope until further notice.',w:1.8,impact:{charter:[35000,4],TTF:[0.5,2],JKM:[0.3,2]},fx:[{block:{route:'Suez',weeks:8}}],tags:['Suez closed','charter ▲']},
 {id:'hurricane',title:'Hurricane forms in the Gulf of Mexico, Sabine Pass channel to close',body:'The pilots association suspends movements for the storm window. Loadings at Sabine Pass slip by two weeks.',season:'summer',w:3,impact:{HH:[-0.25,2],TTF:[0.6,2]},fx:[{outage:{src:'USGC',weeks:2}}],tags:['Sabine Pass closed','TTF ▲']},
 {id:'nuke',title:'Japan regulator clears two reactors for restart',body:'Kansai Electric expects both units at full output within six weeks, trimming LNG burn by about 0.8 mt a year.',w:2,impact:{JKM:[-0.9,5]},tags:['JKM ▼']},
 {id:'china',title:'Beijing stimulus lifts industrial gas burn outlook',body:'Provincial buyers return to the spot market after months of absence. Analysts raise Chinese import forecasts by 4 mt.',w:2.5,impact:{JKM:[1.0,5]},fx:[{basis:{dest:'CHN',delta:0.45,weeks:6}}],tags:['JKM ▲','China DES ▲']},
 {id:'indiaOff',title:'Indian buyers step back from spot above $12',body:'GAIL and Petronet cancel tenders, citing unworkable netbacks for power. Spot demand at Dahej dries up.',cond:()=>spot('JKM')>11,w:2.5,fx:[{demandOff:{dest:'IND',weeks:6}}],tags:['India DES ▼ 2.50']},
 {id:'storageFull',title:'EU storage hits 95% ahead of schedule, terminals turn away cargoes',body:'Send-out slots at Gate and Zeebrugge are fully booked. Spot DES bids in NW Europe collapse as ships wait offshore.',season:'summer',w:2.5,impact:{TTF:[-1.6,4]},fx:[{congest:{dest:'NWE',weeks:4}},{storage:3}],tags:['TTF ▼','Rotterdam congested']},
 {id:'heat',title:'Heatwave across southern Europe lifts power burn',body:'Hydro output in Italy and Spain is down a third; gas-fired plants run flat out. Mediterranean DES premiums widen.',season:'summer',w:3,impact:{TTF:[0.7,3]},fx:[{basis:{dest:'MED',delta:0.5,weeks:4}}],tags:['TTF ▲','Med DES ▲']},
 {id:'ausStrike',title:'Unions call strike at Australian export plants',body:'Workers at two Queensland projects vote for rolling stoppages. Spot cargoes from Gladstone are withdrawn pending talks.',w:2,impact:{JKM:[1.1,3]},fx:[{outage:{src:'AUS',weeks:3}}],tags:['JKM ▲','Gladstone: no spot cargoes']},
 {id:'newbuilds',title:'Wave of newbuild deliveries hits the charter market',body:'Eleven 174k carriers deliver from Korean yards this quarter with no term employment. Owners chase spot business.',w:2,impact:{charter:[-22000,6]},tags:['charter ▼']},
 {id:'typhoon',title:'Typhoon shuts Tokyo Bay terminals',body:'Sodegaura and Futtsu suspend berthing for a week; ships queue outside the bay.',season:'summer',w:2,fx:[{congest:{dest:'JKTC',weeks:2}}],tags:['Sodegaura congested']},
 {id:'egypt',title:'Egypt tenders for 12 spot cargoes as domestic output slips',body:'EGAS turns net importer for the summer. Mediterranean DES bids firm up against TTF.',w:2.5,impact:{TTF:[0.4,3]},fx:[{basis:{dest:'MED',delta:0.6,weeks:6}}],tags:['Med DES ▲']},
 {id:'newTrain',title:'Plaquemines Phase 2 begins commissioning cargoes',body:'A second wave of US Gulf supply arrives earlier than expected. Atlantic basin lengthens into the shoulder season.',w:2,impact:{TTF:[-0.6,6],HH:[0.15,4],charter:[8000,4]},tags:['TTF ▼','HH ▲']},
 {id:'hhCold',title:'Polar vortex drives Henry Hub to multi-year highs',body:'Freeze-offs in the Permian and Appalachia cut US production by 8 Bcf/d. Feedgas costs for Gulf exporters jump.',season:'winter',w:2.5,impact:{HH:[1.1,3]},tags:['HH ▲','US FOB ▲']},
 {id:'spotTight',title:'Atlantic spot tonnage dries up, few prompt vessels open',body:'Brokers count only three open 174k ships in the Atlantic for the next month. Prompt fixtures command a steep premium.',w:2,impact:{charter:[25000,3]},fx:[{spotTight:{basin:'ATL',weeks:3}}],tags:['Atlantic spot +50%']},
 {id:'pacTight',title:'Pacific tonnage squeezed by Qatar term liftings',body:'A cluster of term liftings absorbs open tonnage east of Suez. Prompt Pacific fixtures price at a premium.',w:1.8,impact:{charter:[18000,3]},fx:[{spotTight:{basin:'PAC',weeks:3}}],tags:['Pacific spot +50%']},
 {id:'russia',title:'Rumours of further cuts to remaining Russian pipeline flows',body:'Traders cite reduced nominations via TurkStream. European buyers hedge the downside with prompt LNG.',w:2,impact:{TTF:[0.8,3]},tags:['TTF ▲']},
 {id:'recession',title:'Weak PMIs across Europe and Asia dent gas demand outlook',body:'Industrial activity contracts for a third month. Analysts trim demand forecasts and crude falls in sympathy.',w:2,impact:{TTF:[-0.9,5],JKM:[-0.9,5],BRENT:[-5,4]},tags:['TTF ▼','JKM ▼','Brent ▼']},
 {id:'opec',title:'OPEC+ surprises with deeper output cut',body:'A 1 mb/d extension lifts crude. Oil-indexed LNG supply from Qatar reprices higher against the hubs.',w:2,impact:{BRENT:[7,3]},tags:['Brent ▲','Qatar FOB ▲']},
 {id:'arbWide',title:'East-West spread at a seasonal high as Asian tenders stack up',body:'Korean and Taiwanese buyers issue overlapping tenders. The JKM premium over TTF widens beyond the US Gulf freight differential.',w:2,impact:{JKM:[1.4,3],charter:[15000,3]},tags:['JKM ▲','charter ▲']},
 {id:'warmAsia',title:'Warm winter outlook cuts Northeast Asian nominations',body:'Korean and Japanese utilities trim December nominations after forecasters push the cold risk into February.',season:'winter',w:3,impact:{JKM:[-1.6,3],TTF:[-0.4,3]},tags:['JKM ▼']},
 {id:'norwayBack',title:'Norwegian fields return early from maintenance',body:'Gassco brings Troll and Kollsnes back a week ahead of plan, adding 60 mcm/d to the continent.',w:2.5,impact:{TTF:[-0.8,2]},tags:['TTF ▼']},
 {id:'qatarSpot',title:'QatarEnergy offers a dozen unsold cargoes into the spot market',body:'Term buyers exercised downward flexibility. The surplus hits both basins over the coming month.',w:2.5,impact:{JKM:[-1.0,3],TTF:[-0.5,3]},tags:['JKM ▼','TTF ▼']},
 {id:'japanResale',title:'Japanese utilities resell term cargoes as nuclear output rises',body:'JERA and Tohoku offer reloads and diversions. Prompt Pacific supply lengthens.',w:2,impact:{JKM:[-0.8,3]},tags:['JKM ▼']},
 {id:'chinaWeak',title:'Chinese buyers cancel tenders as domestic coal undercuts gas',body:'Second-tier importers step back. Analysts cut the Chinese import forecast and the China DES discount widens.',w:2.5,impact:{JKM:[-0.9,4]},fx:[{basis:{dest:'CHN',delta:-0.4,weeks:5}}],tags:['JKM ▼','China DES ▼']},
 {id:'freeportBack',title:'Freeport LNG returns to full output ahead of schedule',body:'All three trains are back. Feedgas demand lifts Henry Hub while Atlantic supply lengthens.',w:2,impact:{TTF:[-0.7,3],HH:[0.2,2]},tags:['TTF ▼','HH ▲']},
 {id:'euSurplus',title:'European storage comfortably above norm, spot demand thin',body:'Terminals report empty send-out slots. European buyers decline prompt offers and bids slip.',w:2.5,impact:{TTF:[-1.0,3]},fx:[{storage:2}],tags:['TTF ▼']},
 {id:'panamaLifted',title:'Panama Canal restores full daily transits',body:'Rains refill Gatún Lake. The Authority lifts the LNG transit cap and the queue clears within days.',w:2,impact:{charter:[-12000,3]},fx:[{delay:{route:'Panama',days:0,weeks:0}}],tags:['Panama normal','charter ▼']},
 {id:'warmEurope',title:'Mild spell across Europe flattens heating demand',body:'Temperatures run 4°C above normal for ten days. Withdrawals slow and the prompt softens.',season:'winter',w:2.5,impact:{TTF:[-1.2,2]},fx:[{storage:2}],tags:['TTF ▼']},
];
const STORIES=[
 {id:'redsea',title:'Red Sea transit security',stages:[
   'Carriers report drone activity near Bab el-Mandeb; insurers are reviewing war-risk premiums.',
   'Two LNG carriers divert via the Cape; owners await a decision on naval escorts.',
   'Escort coalition talks stall and war-risk premiums double overnight.',
   'Decision week: carriers and insurers settle their Red Sea routing policy.'],
  outcomes:{A:{label:'Transit continues under escort',p:0.45,impact:{charter:[8000,2]},fx:[{delay:{route:'Suez',days:3,weeks:8}}],tone:0},
            B:{label:'Suez effectively closed to LNG',p:0.33,impact:{TTF:[0.9,3],JKM:[0.5,3],charter:[40000,4]},fx:[{block:{route:'Suez',weeks:10}}],tone:1},
            C:{label:'Tensions ease, premiums fall',p:0.22,impact:{charter:[-10000,3]},fx:[],tone:-1}}},
 {id:'panama',title:'Panama Canal water levels',stages:[
   'Gatún Lake sits 1.5 m below its seasonal norm after a dry wet season.',
   'The Canal Authority warns that draft and transit restrictions may return next month.',
   'Final week: the Authority publishes its transit plan for the coming quarter.'],
  outcomes:{A:{label:'Restrictions avoided, rains return',p:0.40,impact:{charter:[-6000,3]},fx:[],tone:-1},
            B:{label:'Daily transits cut, slot auctions return',p:0.40,impact:{charter:[20000,4]},fx:[{delay:{route:'Panama',days:10,weeks:10}}],tone:1},
            C:{label:'LNG transits suspended',p:0.20,impact:{charter:[32000,4],JKM:[0.6,3]},fx:[{block:{route:'Panama',weeks:8}}],tone:1}}},
 {id:'eustorage',title:'EU storage regulation review',stages:[
   'The Commission opens a review of the 90% November filling target.',
   'Member states split: Germany pushes for flexibility, the Baltics want the target raised.',
   'Energy ministers meet to vote on the revised regulation.'],
  outcomes:{A:{label:'Target kept at 90%',p:0.45,impact:{},fx:[],tone:0},
            B:{label:'Target raised to 95%, earlier deadline',p:0.30,impact:{TTF:[1.3,4]},fx:[],tone:1},
            C:{label:'Target relaxed to 80% with flexibility',p:0.25,impact:{TTF:[-0.9,4]},fx:[],tone:-1}}},
 {id:'qatar',title:'North Field East start-up',stages:[
   'QatarEnergy reports first trains of the 32 mt expansion in commissioning.',
   'Contractors flag delays on two trains; the company insists the schedule holds.',
   'Markets await the first commissioning cargo nomination.',
   'Start-up week: QatarEnergy confirms the ramp-up plan.'],
  outcomes:{A:{label:'On schedule, commissioning cargoes flow',p:0.50,impact:{JKM:[-0.8,8],TTF:[-0.4,8],charter:[-8000,4]},fx:[],tone:-1},
            B:{label:'Six-month delay',p:0.35,impact:{JKM:[0.5,4]},fx:[],tone:1},
            C:{label:'Accelerated: extra spot cargoes offered',p:0.15,impact:{JKM:[-1.2,6],TTF:[-0.6,6]},fx:[],tone:-1}}},
 {id:'freeport',title:'Freeport restart timeline',stages:[
   'Freeport LNG files a restart plan with regulators after the summer outage.',
   'Inspectors request additional testing on Train 2; the operator cuts its restart guidance.',
   'Regulator decision week on Freeport\'s return to service.'],
  outcomes:{A:{label:'Early restart approved',p:0.45,impact:{TTF:[-0.5,3],HH:[0.2,3]},fx:[],tone:-1},
            B:{label:'Partial restart, one train',p:0.30,impact:{TTF:[0.2,2]},fx:[],tone:0},
            C:{label:'Restart pushed back two months',p:0.25,impact:{TTF:[0.9,3],JKM:[0.4,3]},fx:[{outage:{src:'USGC',weeks:3}}],tone:1}}},
];

function eventWeight(e){
  if(e.cond&&!e.cond())return 0;
  if(S.recentEvents.includes(e.id))return 0;
  let w=e.w;
  if(e.season==='winter')w*=isWinter(S.w)?1.6:(isSummer(S.w)?0.15:0.6);
  if(e.season==='summer')w*=isSummer(S.w)?1.6:(isWinter(S.w)?0.15:0.6);
  return w;
}
function spawnNews(force){
  const r=rng();
  if(!force&&r.next()>0.62)return null;
  const pool=EVENTS.filter(e=>eventWeight(e)>0);if(!pool.length)return null;
  const e=r.weighted(pool,eventWeight);
  S.recentEvents.push(e.id);if(S.recentEvents.length>12)S.recentEvents.shift();
  const n={id:S.ids.n++,eid:e.id,week:S.w,impactWeek:S.w+1,title:e.title,body:e.body,impact:e.impact||null,fx:e.fx||null,tags:e.tags||[],read:false,applied:false,kind:'event'};
  S.news.unshift(n);if(S.news.length>40)S.news.pop();
  return n;
}
function stepStory(){
  const r=rng();const st=S.story;
  if(st){
    st.stage++;
    const o=st.odds;for(const k in o)o[k]=Math.max(0.03,o[k]+r.norm()*0.08);const tot=Object.values(o).reduce((a,b)=>a+b,0);for(const k in o)o[k]/=tot;
    const def=STORIES.find(x=>x.id===st.id);
    if(st.stage>=def.stages.length){
      const key=r.weighted(Object.keys(o),k=>o[k]);const out=def.outcomes[key];
      let mult=1;const str=M.structure;
      if((out.tone>0&&str==='BACKWARDATION')||(out.tone<0&&str==='CONTANGO'))mult=1.3;else if(out.tone!==0&&str!=='FLAT')mult=0.85;
      applyImpact(out.impact,out.fx,mult);
      const tags=[];for(const h in (out.impact||{})){const t=out.impact[h][0];tags.push((h==='charter'?'charter':h)+(t>0?' ▲':' ▼'));}
      S.news.unshift({id:S.ids.n++,week:S.w,impactWeek:S.w,title:def.title+': '+out.label,body:'The story resolves. '+(mult>1?'With the curve in '+str.toLowerCase()+', the move is amplified.':mult<1?'The curve structure cushions the move.':'Prices adjust immediately.'),impact:null,fx:null,tags,read:false,applied:true,kind:'story'});
      if(S.news.length>40)S.news.pop();
      S.storyLog.push({id:st.id,outcome:out.label,week:S.w});
      S.story=null;
    }else{
      S.news.unshift({id:S.ids.n++,week:S.w,impactWeek:null,title:def.title+' ('+(st.stage+1)+'/'+def.stages.length+')',body:def.stages[st.stage],impact:null,fx:null,tags:['developing'],read:false,applied:true,kind:'story'});
      if(S.news.length>40)S.news.pop();
    }
  }else if(STORY_WEEKS.includes(S.w)){
    const pool=STORIES.filter(x=>!S.storiesUsed.includes(x.id));if(!pool.length)return;
    const def=r.pick(pool);S.storiesUsed.push(def.id);
    const odds={};for(const k in def.outcomes)odds[k]=def.outcomes[k].p;
    S.story={id:def.id,stage:0,odds,startWeek:S.w};
    S.news.unshift({id:S.ids.n++,week:S.w,impactWeek:null,title:def.title+' (1/'+def.stages.length+')',body:def.stages[0],impact:null,fx:null,tags:['developing'],read:false,applied:true,kind:'story'});
    if(S.news.length>40)S.news.pop();
  }
}

/* ---------- game state ---------- */
function initContracts(){const o={};for(const id in CONTRACTS)o[id]={signed:null,next:null};return o;}
function newGame(company,seed){
  const r=new RNG(seed||((Date.now()^0x5bd1e995)>>>0));
  S={company,w:1,cash:START_CASH,realised:0,gross:0,overhead:0,reletIncome:0,hireTotal:0,hireOverhead:0,hedgePnl:0,level:1,vessels:[],cargoes:[],commits:[],offers:[],hedges:[],contracts:initContracts(),news:[],log:[],story:null,storiesUsed:[],storyLog:[],recentEvents:[],
     rng:r,ids:{v:1,c:1,k:1,n:1,o:1,h:1},stats:{delivered:0,fulfilled:0,defaults:0,breaches:0,bestTrade:0,bought:0,termDays:0,ladenDays:0,relets:0,fleetPeak:1,hedges:0,marginCalls:0,cancelled:0,termLifts:0},over:false,levelFlash:null,usedNames:[]};
  S.market=newMarket(r);M=S.market;
  computePrices();computeFOB();recordHist();M.prev={...M.price};M.chPrev=M.charter;
  const v=addVessel('TFDE','term',Math.round(tcRate('TFDE',52)*0.96),'USGC',S.w+52);
  log('fleet','Starter term charter: '+v.name+' (TFDE, 160k m³) delivered at Sabine Pass at $'+Math.round(v.hire/1000)+'k/d for 52 weeks.');
  spawnOffers();spawnNews(true);
  return S;
}
function reviveRng(){if(S&&S.rng&&!(S.rng instanceof RNG)){const a=S.rng.a;S.rng=new RNG(a);}}
function migrateState(){
  if(!S)return;M=S.market;
  S.offers=S.offers||[];S.hedges=S.hedges||[];S.contracts=S.contracts||initContracts();for(const id in CONTRACTS)if(!S.contracts[id])S.contracts[id]={signed:null,next:null};
  S.ids.o=S.ids.o||1;S.ids.h=S.ids.h||1;S.hedgePnl=S.hedgePnl||0;S.premiums=S.premiums||0;S.hireTotal=S.hireTotal||0;S.hireOverhead=S.hireOverhead||0;
  for(const k of ['hedges','marginCalls','cancelled','termLifts'])if(S.stats[k]==null)S.stats[k]=0;
  if(!M.spotLog)M.spotLog={TTF:{},JKM:{},HH:{}};M.fcache=null;
  for(const h of S.hedges){if(h.mkey==null){h.mkey=monthKeyOf(h.week);const [a,b]=monthRange(h.mkey);h.wStart=a;h.wEnd=b;h.label=monthLabelKey(h.mkey);}}
  if(!M.liq)M.liq={TTF:1,JKM:1,HH:1};
  for(const k of S.commits){if(k.wEnd==null){k.wEnd=k.week;k.wStart=k.week-(WINDOW_WEEKS-1);}k.kind=k.kind||'spot';if(k.assigned===undefined)k.assigned=null;}
  for(const c of S.cargoes)if(c.waitFor){const k=commitById(c.waitFor);if(k&&k.status==='open'&&!k.assigned)k.assigned=c.id;}
  for(const c of S.cargoes){if(c.loadWeek==null)c.loadWeek=c.loaded||c.bought;if(c.fobPaid==null)c.fobPaid=true;c.term=!!c.term;}
  if(!S.over&&!S.offers.some(o=>o.kind==='spot'&&o.openedW===S.w))spawnOffers();
}
function log(kind,text){S.log.unshift({w:S.w,kind,text});if(S.log.length>80)S.log.pop();}
function vesselById(id){return S.vessels.find(v=>v.id===id);}
function cargoById(id){return S.cargoes.find(c=>c.id===id);}
function commitById(id){return S.commits.find(k=>k.id===id);}
function offerById(id){return S.offers.find(o=>o.id===id);}
function hedgeById(id){return S.hedges.find(h=>h.id===id);}
function slots(){return LEVELS[S.level-1].slots;}
function activeCargoes(){return S.cargoes.filter(c=>c.phase!=='done'&&c.phase!=='cancelled'&&!c.sold);}
function openCommits(){return S.commits.filter(k=>k.status==='open');}
function openHedges(){return S.hedges.filter(h=>h.status==='open');}
function positions(){return activeCargoes().filter(c=>!c.term).length;}
function hedgeVolOpen(){return openHedges().reduce((s,h)=>s+Math.abs(h.vol),0);}
function hedgeCap(){return slots()*7.4;}
function hedgeMtm(h){return(hedgeMark(h)-h.price)*h.vol*1e6;}
function hedgeMargin(){let im=0,varm=0;for(const h of openHedges()){im+=HEDGE_IM*Math.abs(h.price*h.vol*1e6);varm+=hedgeMtm(h);}return{im,variation:Math.max(0,-varm),total:im+Math.max(0,-varm)};}
function commitCollateral(){return openCommits().reduce((s,k)=>s+(isSourced(k)?0:COLLATERAL*k.price*k.vol*1e6),0);}
function collateral(){return commitCollateral()+hedgeMargin().total;}
function availableCash(){return S.cash-collateral();}
function fleetCap(){return LEVELS[S.level-1].slots+1;}
function termFleet(){return S.vessels.filter(v=>v.charter==='term');}
function nextName(){const pool=VESSEL_NAMES.filter(n=>!S.usedNames.includes(n));const n=pool.length?rng().pick(pool):'Carrier '+S.ids.v;S.usedNames.push(n);return n;}
function addVessel(type,charter,hire,region,termEnds){
  const v={id:S.ids.v++,name:nextName(),type,charter,hire,termEnds:termEnds||null,region,status:'idle',cargoId:null,daysLeft:0,target:null,tvia:null,reletEnds:null,reletRate:0,signed:S.w};
  S.vessels.push(v);S.stats.fleetPeak=Math.max(S.stats.fleetPeak,S.vessels.length);return v;
}

/* ---------- offer book (laycans and tenders) ---------- */
function spawnOffers(){
  const r=rng();
  for(const src of LOADS){
    if(M.outage[src]>0)continue;
    const n=r.next()<(src==='USGC'?0.45:0.3)?2:1;
    for(let i=0;i<n;i++){
      const lead=src==='USGC'?1+Math.floor(r.next()*3):2+Math.floor(r.next()*4);
      const slope=0.5*((fwd('TTF',lead)-spot('TTF'))+(fwd('JKM',lead)-spot('JKM')));
      const price=Math.max(1.5,M.fob[src]+0.8*slope+r.norm()*0.12+(lead<=1?-0.08:0));
      S.offers.push({id:S.ids.o++,src,loadWeek:S.w+lead,price,kind:'spot',openedW:S.w,taken:false});
    }
  }
}
function liveOffers(){return S.offers.filter(o=>!o.taken&&(o.kind==='term'||o.openedW===S.w)&&o.loadWeek>=S.w);}
function signContract(id){
  const def=CONTRACTS[id];if(!def)return'Unknown contract.';const c=S.contracts[id];if(c.signed)return'Already signed.';if(S.over)return'The simulation has ended.';
  if(S.w>WEEKS-def.every-def.lead)return'Too late in the game for this contract.';
  const terms=contractTermsNow(id);const prem=contractPremium(id,terms);
  if(availableCash()<prem)return'Not enough free cash for the capacity premium ($'+(prem/1e6).toFixed(1)+'M).';
  c.terms=terms;c.signed=S.w;c.next=S.w+def.lead+1;c.premium=prem;
  if(prem){S.cash-=prem;S.premiums=(S.premiums||0)+prem;}
  log('sys','Signed '+def.name+': '+contractLabel(id)+', one cargo every '+def.every+' weeks from W'+c.next+(prem?', capacity premium $'+(prem/1e6).toFixed(1)+'M paid.':'.'));return null;
}
function stepContracts(){
  for(const id in CONTRACTS){
    const def=CONTRACTS[id],c=S.contracts[id];if(!c||!c.signed)continue;
    while(c.next&&c.next-def.lead<=S.w&&c.next<WEEKS){
      const price=contractPrice(id);
      if(def.side==='buy'){
        S.offers.push({id:S.ids.o++,src:def.src,loadWeek:c.next,price,kind:'term',contractId:id,openedW:S.w,taken:false});
        log('sys',def.name+': laycan W'+c.next+' published at $'+price.toFixed(2)+'. Lift it or cancel it before the laycan.');
      }else{
        const k={id:S.ids.k++,dest:def.dest,price,vol:3.70,week:c.next,wStart:c.next-(WINDOW_WEEKS-1),wEnd:c.next,status:'open',opened:S.w,kind:'term',contractId:id};
        S.commits.push(k);log('sys',def.name+': delivery window W'+k.wStart+' to W'+k.wEnd+' at $'+price.toFixed(2)+' (commitment #'+k.id+').');
      }
      c.next+=def.every;
    }
  }
  // term laycans that were neither lifted nor cancelled
  for(const o of [...S.offers]){
    if(o.kind==='term'&&!o.taken&&o.loadWeek<S.w){
      const fee=contractCancelFee(o.contractId,3.70,o.price);
      S.cash-=fee;S.realised-=fee;S.gross-=fee;S.stats.cancelled++;o.taken=true;
      log('risk',CONTRACTS[o.contractId].name+': laycan W'+o.loadWeek+' passed without a lifting. '+(fee?'You pay $'+(fee/1e6).toFixed(1)+'M.':''));
    }
  }
  S.offers=S.offers.filter(o=>!o.taken);
}
function cancelTermOffer(oid){
  const o=offerById(oid);if(!o||o.kind!=='term'||o.taken)return'That laycan is not open.';
  const fee=contractCancelFee(o.contractId,3.70,o.price);
  S.cash-=fee;S.realised-=fee;S.gross-=fee;S.stats.cancelled++;o.taken=true;S.offers=S.offers.filter(x=>!x.taken);
  log('risk','Cancelled '+CONTRACTS[o.contractId].name+' laycan W'+o.loadWeek+(fee?': fee $'+(fee/1e6).toFixed(1)+'M':'')+'.');return null;
}
function spotCancelFee(c){const dmg=Math.max(0,M.fob[c.src]-c.fob);return(dmg+CANCEL_SPOT*c.fob)*c.vol*1e6;}
function cancelLifting(cid){
  const c=cargoById(cid);if(!c||c.sold)return'Cargo no longer yours.';
  if(c.phase!=='waiting'&&c.phase!=='ballast')return'Only an unloaded cargo can be cancelled.';
  const v=vesselById(c.vesselId);
  const fee=c.term?contractCancelFee(c.contractId,c.vol,c.fob):spotCancelFee(c);
  const loss=c.costSoFar+fee;S.cash-=fee;S.realised-=loss;S.gross-=loss;S.stats.cancelled++;releaseAssignment(c);
  c.phase='cancelled';c.result=-loss;c.doneWeek=S.w;
  if(v){v.cargoId=null;if(v.charter==='spot'){S.vessels=S.vessels.filter(x=>x.id!==v.id);}else if(v.status==='waiting'){v.status='idle';}}
  log('risk','Cancelled lifting of cargo #'+c.id+' at '+REGIONS[c.src].port+(fee?': fee $'+(fee/1e6).toFixed(1)+'M':'')+', positioning costs of $'+(c.costSoFar/1e6).toFixed(1)+'M written off.');return null;
}

/* ---------- valuation ---------- */
function isSourced(k){if(!k.assigned)return false;const c=cargoById(k.assigned);return !!(c&&c.phase!=='done'&&c.phase!=='cancelled'&&!c.sold&&c.waitFor===k.id);}
function releaseAssignment(c){if(!c)return;for(const k of S.commits)if(k.assigned===c.id)k.assigned=null;c.waitFor=null;}
function assignCargo(c,k){releaseAssignment(c);if(!k)return;if(k.assigned&&k.assigned!==c.id){const o=cargoById(k.assigned);if(o&&o.waitFor===k.id)o.waitFor=null;}k.assigned=c.id;c.waitFor=k.id;c.spotOnly=false;}
function matchCommit(dest,arrivalWeek,used){
  const list=openCommits().filter(k=>k.dest===dest&&k.wStart<=arrivalWeek&&arrivalWeek<=k.wEnd&&!isSourced(k)&&!(used&&used.has(k.id))).sort((a,b)=>a.wEnd-b.wEnd);
  return list[0]||null;
}
function cargoExpected(c,used){
  const v=vesselById(c.vesselId);const vt=VTYPES[v.type];
  const laden=(c.phase==='ballast'||c.phase==='waiting')?c.ladenDays:v.daysLeft;
  let pre=0,preHire=0,preFuel=0;
  if(c.phase==='waiting'){const wd=Math.max(0,(c.loadWeek-S.w)*7);pre=wd;preHire=v.charter==='term'?v.hire*wd:0;}
  else if(c.phase==='ballast'){const wd=Math.max(0,(c.loadWeek-S.w)*7-v.daysLeft);pre=v.daysLeft+wd;preHire=v.hire*(v.daysLeft+(v.charter==='term'?wd:0));preFuel=heelDay(vt,v.from||c.src)*v.daysLeft;}
  let daysLeft=pre+laden;let etaK=Math.max(0,Math.ceil(daysLeft/7));
  const volStart=(c.phase==='ballast'||c.phase==='waiting')?c.vol:c.volNow;
  let delivered=volStart*(1-vt.bor/100*laden);
  let price,how,commit=null,holdWeeks=0;
  if(c.fixed){price=c.fixed.price;how='fixed';}
  else{
    if(c.waitFor){const k=commitById(c.waitFor);if(k&&k.status==='open'&&S.w+etaK<=k.wEnd){commit=k;holdWeeks=Math.max(0,k.wStart-(S.w+etaK));}}
    if(!commit&&!c.spotOnly)commit=matchCommit(c.dest,S.w+etaK,used);
    if(commit){price=commit.price;how='commit';if(used)used.add(commit.id);}else{price=desFwd(c.dest,etaK);how='fwd';}
  }
  if(holdWeeks){delivered*=(1-vt.borIdle/100*7*holdWeeks);etaK+=holdWeeks;daysLeft+=holdWeeks*7;}
  let remaining=preHire+preFuel+v.hire*laden+PORT_DISC_FEE;
  if(c.phase==='ballast'||c.phase==='waiting')remaining+=(c.fobPaid?0:c.fob*c.vol*1e6)+PORT_LOAD_FEE+(TOLL[c.via]||0);
  if(c.phase==='float')remaining=v.hire*laden+PORT_DISC_FEE;
  if(holdWeeks)remaining+=holdWeeks*v.hire*7;
  const rev=price*delivered*1e6,cost=c.costSoFar+remaining;
  return{price,how,commit,holdWeeks,delivered,etaK,eta:S.w+etaK,rev,cost,mtm:rev-cost,landed:cost/(delivered*1e6),daysLeft,laden};
}
function commitMtm(k){return(k.price-desFwd(k.dest,Math.max(0,k.wEnd-S.w)))*k.vol*1e6;}
function unrealised(){
  const used=new Set();let u=0;
  for(const c of activeCargoes())u+=cargoExpected(c,used).mtm;
  for(const k of openCommits())u+=commitMtm(k);
  for(const h of openHedges())u+=hedgeMtm(h);
  return u;
}
function netPnl(){return S.realised+unrealised()-S.overhead+S.reletIncome-(S.premiums||0);}
function starsFor(net){for(const [th,st] of STARS)if(net>=th)return st;return 1;}
function cargoHedge(c,e0){
  // how much of this cargo's price risk is covered: a sale locks it; otherwise paper shorts on the destination hub for the arrival month, shared pro rata with other unsold cargoes landing in that hub and month
  const e=e0||cargoExpected(c,null);
  if(e.how==='fixed'||e.how==='commit')return{state:'locked',cover:1,text:e.how==='fixed'?'price locked (sold W'+c.fixed.week+')':'price locked by DES sale #'+e.commit.id,hub:REGIONS[c.dest].hub,mkey:monthKeyOf(e.eta),e};
  const hub=REGIONS[c.dest].hub,mkey=monthKeyOf(e.eta);
  let phys=0;for(const o of activeCargoes()){const eo=o.id===c.id?e:cargoExpected(o,null);if(eo.how==='fixed'||eo.how==='commit')continue;if(REGIONS[o.dest].hub===hub&&monthKeyOf(eo.eta)===mkey)phys+=eo.delivered;}
  let paper=0;for(const h of openHedges())if(h.hub===hub&&h.mkey===mkey)paper+=h.vol;
  const short=Math.max(0,-paper);const cover=phys>0?short/phys:0;
  const label=monthLabelKey(mkey);
  const state=cover<=0.05?'open':cover<0.9?'partial':cover<=1.15?'hedged':'over';
  const text=state==='open'?'unhedged: '+e.delivered.toFixed(2)+' TBtu long '+HUBS[hub].name+' '+label:state==='partial'?Math.round(cover*100)+'% hedged by '+HUBS[hub].name+' '+label+' paper ('+short.toFixed(2)+' of '+phys.toFixed(2)+' TBtu in that month)':state==='hedged'?'hedged by '+HUBS[hub].name+' '+label+' paper ('+short.toFixed(2)+' TBtu short vs '+phys.toFixed(2)+' long)':'over-hedged: '+short.toFixed(2)+' TBtu short vs '+phys.toFixed(2)+' TBtu long in '+HUBS[hub].name+' '+label;
  return{state,cover,text,hub,mkey,phys,short,e,label};
}
function exposure(){
  const ex={TTF:0,JKM:0};
  for(const c of activeCargoes()){if(c.fixed)continue;const e=cargoExpected(c,null);if(e.how==='commit')continue;ex[REGIONS[c.dest].hub]+=e.delivered;}
  for(const k of openCommits()){const m=activeCargoes().some(c=>!c.fixed&&cargoExpected(c,null).commit&&cargoExpected(c,null).commit.id===k.id);if(!m)ex[REGIONS[k.dest].hub]-=k.vol;}
  const hedged={TTF:0,JKM:0,HH:0};for(const h of openHedges())hedged[h.hub]+=h.vol;
  return{physical:ex,hedged,net:{TTF:ex.TTF+hedged.TTF,JKM:ex.JKM+hedged.JKM,HH:hedged.HH}};
}

/* ---------- voyage planning ---------- */
function planVoyage(src,dest,via,vtKey,charterKind,rate,fromRegion,offer){
  const vt=VTYPES[vtKey];
  const loadWeek=offer?offer.loadWeek:S.w;const leadDays=Math.max(0,(loadWeek-S.w)*7);
  let ballast=0,bvia='Direct',btoll=0;
  if(fromRegion&&fromRegion!==src){const br=bestRoute(fromRegion,src,vt,rate);if(!br)return null;ballast=br.days;bvia=br.opt.via;btoll=0.6*(TOLL[bvia]||0);}
  const spotK=charterKind==='spot';
  const arrivalWeek=S.w+Math.ceil(ballast/7);
  if(!spotK&&arrivalWeek>loadWeek)return null;
  const wait=spotK?0:Math.max(0,leadDays-ballast);
  const opt=routeOptions(src,dest).find(o=>o.via===via);if(!opt||routeBlocked(via))return null;
  const laden=effDays(opt,vt);
  const bonus=spotK?spotBonusDays(laden):0;
  const hire=rate*(ballast+wait+laden+bonus);
  const fuel=ballast?heelDay(vt,fromRegion)*ballast:0;
  const toll=(TOLL[via]||0)+btoll;
  const fees=PORT_LOAD_FEE+PORT_DISC_FEE+(spotK?SPOT_POS_FEE:0);
  const vol=vt.tbtu,lost=vol*vt.bor/100*laden,delivered=vol-lost;
  const startWeek=Math.max(loadWeek,arrivalWeek);
  const etaK=(startWeek-S.w)+Math.ceil(laden/7);
  const fob=offer?offer.price:M.fob[src];
  const commit=matchCommit(dest,S.w+etaK,null);
  const price=commit?commit.price:desFwd(dest,etaK);
  const rev=price*delivered*1e6;
  const cargoCost=fob*vol*1e6;
  const cost=cargoCost+hire+fuel+toll+fees;
  const upfront=(ballast?btoll:0)+(spotK?SPOT_POS_FEE+rate*bonus:0);
  const atLoading=cargoCost+PORT_LOAD_FEE+(TOLL[via]||0);
  return{src,dest,via,vt,charterKind,rate,fromRegion,offer,loadWeek,ballast,bvia,btoll,wait,laden,bonus,hire,fuel,toll,fees,vol,lost,delivered,etaK,eta:S.w+etaK,fob,price,commit,rev,cargoCost,cost,margin:rev-cost,perMMBtu:(rev-cost)/(delivered*1e6),landed:cost/(delivered*1e6),upfront,atLoading,freightPer:(hire+fuel+toll+fees)/(delivered*1e6)};
}
function destOptions(src,vtKey,charterKind,rate,fromRegion,offer){
  const out=[];
  for(const d of DESTS){
    const opts=[];
    for(const o of routeOptions(src,d)){if(routeBlocked(o.via))continue;const p=planVoyage(src,d,o.via,vtKey,charterKind,rate,fromRegion,offer);if(p)opts.push(p);}
    opts.sort((a,b)=>b.margin-a.margin);
    if(opts.length)out.push({dest:d,best:opts[0],opts});
  }
  out.sort((a,b)=>b.best.margin-a.best.margin);
  return out;
}

/* ---------- actions ---------- */
function canBuy(term){if(S.over)return'The simulation has ended.';if(!term&&positions()>=slots())return'No free cargo position on the desk ('+positions()+'/'+slots()+'). Deliver or sell something first.';return null;}
function buyCargo(plan,vesselChoice){
  const offer=plan.offer?offerById(plan.offer.id):null;
  if(!offer||offer.taken)return'That offer is no longer open.';
  if(offer.loadWeek<S.w)return'The laycan has passed.';
  const term=offer.kind==='term';
  const err=canBuy(term);if(err)return err;
  if(availableCash()<plan.upfront+plan.cargoCost)return'Not enough free cash: this lifting needs $'+(plan.upfront/1e6).toFixed(1)+'M now and $'+(plan.cargoCost/1e6).toFixed(1)+'M at loading ($'+(availableCash()/1e6).toFixed(1)+'M free after collateral).';
  let v;
  if(vesselChoice.kind==='spot'){v=addVessel(vesselChoice.type,'spot',plan.rate,plan.src,null);}
  else{v=vesselById(vesselChoice.id);if(!v||v.status!=='idle')return'That vessel is not available.';if(S.w+Math.ceil(plan.ballast/7)>offer.loadWeek)return v.name+' cannot reach '+REGIONS[plan.src].port+' by the W'+offer.loadWeek+' laycan.';}
  const c={id:S.ids.c++,src:plan.src,dest:plan.dest,via:plan.via,vol:plan.vol,volNow:plan.vol,fob:plan.fob,vesselId:v.id,phase:'waiting',ladenDays:plan.laden,loadWeek:offer.loadWeek,costSoFar:0,cost:{},fixed:null,sold:false,bought:S.w,eta:plan.eta,floatWeeks:0,tollPaid:false,fobPaid:false,term,contractId:offer.contractId||null,offerId:offer.id};
  const pay=(amt,kind)=>{c.costSoFar+=amt;c.cost[kind]=(c.cost[kind]||0)+amt;S.cash-=amt;};
  if(vesselChoice.kind==='spot'){pay(SPOT_POS_FEE,'fees');pay(plan.rate*plan.bonus,'hire');S.hireTotal=(S.hireTotal||0)+plan.rate*plan.bonus;}
  S.cargoes.push(c);v.cargoId=c.id;S.stats.bought++;if(term)S.stats.termLifts++;offer.taken=true;S.offers=S.offers.filter(o=>!o.taken);
  const lbl=(term?'Term lifting':'Bought FOB')+' '+REGIONS[plan.src].port+' at $'+plan.fob.toFixed(2)+' for laycan W'+offer.loadWeek;
  if(plan.ballast>0){v.status='ballast';v.from=v.region;v.target=plan.src;v.tvia=plan.bvia;v.daysLeft=plan.ballast;v.totalDays=plan.ballast;v.region=null;if(plan.btoll)pay(plan.btoll,'toll');
    log('buy',lbl+': '+v.name+' ballasting '+plan.ballast+' d from '+REGIONS[plan.fromRegion].port+', then '+REGIONS[plan.dest].name+' via '+plan.via+'. ETA W'+plan.eta+'.');
  }else if(offer.loadWeek<=S.w){loadCargo(v,c);
    log('buy',lbl+', loaded on '+v.name+(vesselChoice.kind==='spot'?' (spot at $'+Math.round(plan.rate/1000)+'k/d)':'')+' bound for '+REGIONS[plan.dest].name+' via '+plan.via+'. ETA W'+plan.eta+'.');
  }else{v.status='waiting';v.region=plan.src;
    log('buy',lbl+': '+v.name+(vesselChoice.kind==='spot'?' delivers at the laycan (spot at $'+Math.round(plan.rate/1000)+'k/d)':' waits at '+REGIONS[plan.src].port)+', then '+REGIONS[plan.dest].name+' via '+plan.via+'. ETA W'+plan.eta+'.');
  }
  return null;
}
function loadCargo(v,c){
  c.phase='laden';v.status='laden';v.daysLeft=c.ladenDays;v.region=null;v.target=null;
  const pay=(amt,kind)=>{c.costSoFar+=amt;c.cost[kind]=(c.cost[kind]||0)+amt;S.cash-=amt;};
  if(!c.fobPaid){pay(c.fob*c.vol*1e6,'fob');c.fobPaid=true;}
  pay(PORT_LOAD_FEE,'fees');const t=TOLL[c.via]||0;if(t){pay(t,'toll');c.tollVia=c.via;}c.tollPaid=true;c.loaded=S.w;
}
function charterVessel(type,weeks,region){
  if(S.over)return'The simulation has ended.';
  if(termFleet().length>=fleetCap())return'Your desk can run at most '+fleetCap()+' term vessels at this level.';
  const hire=Math.round(tcRate(type,weeks));
  const v=addVessel(type,'term',hire,region,S.w+weeks);
  log('fleet','Term charter: '+v.name+' ('+VTYPES[type].name+', '+VTYPES[type].cap+'k m³) at $'+Math.round(hire/1000)+'k/d for '+weeks+' weeks, delivered at '+REGIONS[region].port+'.');
  return null;
}
function repositionVessel(vid,region){
  const v=vesselById(vid);if(!v||v.status!=='idle')return'Vessel is not idle.';
  const vt=VTYPES[v.type];const br=bestRoute(v.region,region,vt,v.hire);if(!br)return'No open route.';
  v.status='ballast';v.from=v.region;v.target=region;v.tvia=br.opt.via;v.daysLeft=br.days;v.totalDays=br.days;const t=0.6*(TOLL[br.opt.via]||0);if(t){S.cash-=t;S.overhead+=t;}
  log('fleet',v.name+' ballasting '+br.days+' d from '+REGIONS[v.region].port+' to '+REGIONS[region].port+' via '+br.opt.via+'.');v.region=null;return null;
}
function reletVessel(vid,weeks){
  const v=vesselById(vid);if(!v||v.status!=='idle'||v.charter!=='term')return'Only idle term vessels can be relet.';
  const rate=Math.round(spotRate(v.type,REGIONS[v.region].basin)*0.95);
  v.status='relet';v.reletEnds=S.w+weeks;v.reletRate=rate;S.stats.relets++;
  log('fleet','Relet '+v.name+' for '+weeks+' weeks at $'+Math.round(rate/1000)+'k/d against hire of $'+Math.round(v.hire/1000)+'k/d.');return null;
}
function earlyTerminate(vid){
  const v=vesselById(vid);if(!v||v.status!=='idle'||v.charter!=='term')return'Only idle term vessels can be redelivered.';
  const remW=Math.max(0,v.termEnds-S.w);const pen=EARLY_TERM*v.hire*7*remW;
  S.cash-=pen;S.overhead+=pen;S.hireTotal=(S.hireTotal||0)+pen;S.hireOverhead=(S.hireOverhead||0)+pen;S.vessels=S.vessels.filter(x=>x.id!==vid);
  log('fleet','Redelivered '+v.name+' early, paying $'+(pen/1e6).toFixed(1)+'M of the remaining hire.');return null;
}
function routePath(from,to,via){const opts=routeOptions(from,to);const o=opts.find(x=>x.via===via)||opts[0];return{opt:o,keys:[from,...o.wp,to],pts:[[REGIONS[from].lat,REGIONS[from].lon],...o.wp.map(k=>WP[k]),[REGIONS[to].lat,REGIONS[to].lon]]};}
function cumLen(pts){let prev=null;const P=[];for(const [lat,lon] of pts){let L=lon;if(prev!==null){while(L-prev>180)L-=360;while(prev-L>180)L+=360;}P.push([(L+180)/360*1000,(70-lat)/120*333]);prev=L;}const cum=[0];for(let i=1;i<P.length;i++)cum.push(cum[i-1]+Math.hypot(P[i][0]-P[i-1][0],P[i][1]-P[i-1][1]));return cum;}
function shipPosition(c){
  const v=vesselById(c.vesselId);const r1=routePath(c.src,c.dest,c.via);
  let prev=null;const U=[];for(const [lat,lon] of r1.pts){let L=lon;if(prev!==null){while(L-prev>180)L-=360;while(prev-L>180)L+=360;}U.push([lat,L]);prev=L;}
  const cum=cumLen(r1.pts);const f=clamp((c.ladenDays-v.daysLeft)/Math.max(1,c.ladenDays),0,1);const target=f*cum[cum.length-1];
  let i=1;while(i<cum.length-1&&cum[i]<target)i++;const t=(target-cum[i-1])/((cum[i]-cum[i-1])||1);
  let lat=U[i-1][0]+(U[i][0]-U[i-1][0])*t,lon=U[i-1][1]+(U[i][1]-U[i-1][1])*t;while(lon>180)lon-=360;while(lon<-180)lon+=360;return[lat,lon];
}
function seaRegion(lat,lon){if(lat>=30&&lat<=46&&lon>=-6&&lon<=36)return'MED';if(lon>100||lon<-80)return'PAC';if(lon>=32&&lat<30)return'IND';return'ATL';}
function directDays(lat1,lon1,lat2,lon2,vt){const r=Math.PI/180;const dLat=(lat2-lat1)*r,dLon=(lon2-lon1)*r;const a=Math.sin(dLat/2)**2+Math.cos(lat1*r)*Math.cos(lat2*r)*Math.sin(dLon/2)**2;const nm=2*3440*Math.asin(Math.sqrt(a));return nm/(19*24)*vt.speed*1.3;}
function divertQuote(c,dest,via){
  // how long from the ship's present position to the new destination: cut across while still on the shared leg, turn back to the fork if past it, or finish the current leg and sail on; whichever is shortest
  const v=vesselById(c.vesselId);const vt=VTYPES[v.type];
  const r2=routePath(c.src,dest,via);if(!r2.opt||routeBlocked(via))return null;
  const d2=effDays(r2.opt,vt);
  const unloaded=c.phase==='ballast'||c.phase==='waiting';
  let rem=d2,mode='fresh',viaUsed=via,tollDue=0;
  if(!unloaded){
    const r1=routePath(c.src,c.dest,c.via);const d1=c.ladenDays;const e=Math.max(0,d1-v.daysLeft);
    let k=1;while(k<r1.keys.length-1&&k<r2.keys.length-1&&r1.keys[k]===r2.keys[k])k++;const last=k-1;
    const c1=cumLen(r1.pts),c2=cumLen(r2.pts);
    const div1=d1*(c1[last]/c1[c1.length-1]),div2=d2*(c2[last]/c2[c2.length-1]);
    let cut,cutMode;
    if(e<=div1+0.01){cut=d2-e*(div1>0?div2/div1:1);cutMode='cut';}else{cut=(e-div1)+(d2-div2);cutMode='back';}
    const br=bestRoute(c.dest,dest,vt,v.hire);const onward=br?v.daysLeft+br.days+1:Infinity;
    let direct=Infinity;
    const [plat,plon]=shipPosition(c);const Rg=REGIONS[dest];const sr=seaRegion(plat,plon),dr=seaRegion(Rg.lat,Rg.lon);
    const open=sr===dr||(sr==='IND'&&dr==='PAC')||(sr==='PAC'&&dr==='IND')||(sr==='ATL'&&dr==='MED')||(sr==='MED'&&dr==='ATL');
    if(open&&(via==='Direct'||via==='Cape'||!(dr==='MED'&&sr==='ATL')))direct=directDays(plat,plon,Rg.lat,Rg.lon,vt)+1;
    const best=Math.min(cut,onward,direct);
    if(best===direct){rem=direct;mode='direct';viaUsed='Direct';}
    else if(best===onward){rem=onward;mode='onward';viaUsed=br.opt.via;}
    else{rem=cut;mode=cutMode;}
    rem=Math.max(2,Math.round(rem));
    const canal=viaUsed==='Panama'||viaUsed==='Suez';
    if(canal&&c.tollVia!==viaUsed)tollDue=TOLL[viaUsed];
  }else{tollDue=0;}
  const pre=unloaded?Math.max(v.daysLeft,(c.loadWeek-S.w)*7):0;
  const etaK=Math.ceil((pre+rem)/7);
  const volStart=unloaded?c.vol:c.volNow;const delivered=volStart*(1-vt.bor/100*rem);
  const km=matchCommit(dest,S.w+etaK,null);const price=km?km.price:desFwd(dest,etaK);
  const preFuel=c.phase==='ballast'?heelDay(vt,v.from||c.src)*v.daysLeft:0;
  let remaining=v.hire*(pre+rem)+preFuel+PORT_DISC_FEE+tollDue;
  if(unloaded)remaining+=(c.fobPaid?0:c.fob*c.vol*1e6)+PORT_LOAD_FEE+(TOLL[via]||0);
  const rev=price*delivered*1e6;const mtm=rev-(c.costSoFar+remaining);
  return{dest,via,viaUsed,rem,mode,d2,pre,etaK,eta:S.w+etaK,delivered,commit:km,price,tollDue,remaining,rev,mtm,hire:v.hire*(pre+rem),fuel:preFuel};
}
function divertCargo(cid,dest,via){
  const c=cargoById(cid);const v=vesselById(c.vesselId);
  if(c.fixed)return'This cargo is sold forward and must deliver to '+REGIONS[c.dest].name+'.';
  if(c.sold||c.phase==='done'||c.phase==='cancelled')return'Cargo no longer yours.';
  if(dest===c.dest&&via===c.via)return'Already routed that way.';
  const q=divertQuote(c,dest,via);if(!q)return'Route not open.';
  if(c.waitFor){const k=commitById(c.waitFor);if(!k||k.dest!==dest)releaseAssignment(c);}
  if(c.phase==='ballast'||c.phase==='waiting'){c.dest=dest;c.via=via;c.ladenDays=q.d2;c.eta=q.eta;log('buy','Redirected cargo #'+c.id+' to '+REGIONS[dest].name+' via '+via+' before loading.');return null;}
  const oldDest=c.dest;const elapsed=Math.max(0,c.ladenDays-v.daysLeft);
  c.dest=dest;c.via=q.viaUsed;c.ladenDays=elapsed+q.rem;v.daysLeft=q.rem;c.eta=q.eta;
  if(c.phase==='float'){c.phase='laden';v.status='laden';delete c.holdUntil;}
  if(q.tollDue){c.costSoFar+=q.tollDue;c.cost.toll=(c.cost.toll||0)+q.tollDue;S.cash-=q.tollDue;c.tollVia=q.viaUsed;}
  const how=q.mode==='cut'?'cutting across':q.mode==='back'?'turning back to the fork and':q.mode==='direct'?'steaming straight there,':'completing the leg off '+REGIONS[oldDest].port+' then';
  log('buy','Diverted cargo #'+c.id+' on '+v.name+' from '+REGIONS[oldDest].name+' to '+REGIONS[dest].name+' ('+how+' sailing '+q.rem+' d via '+q.viaUsed+'). New ETA W'+c.eta+'.');return null;
}
function fixPrice(cid){return sellCargoDES(cid);}
function sellCargoDES(cid){
  const c=cargoById(cid);if(!c||c.sold||c.phase==='done'||c.phase==='cancelled')return'Cargo no longer yours.';
  if(c.fixed)return'Already sold.';if(c.waitFor){const k=commitById(c.waitFor);if(k&&k.status==='open')return'Already sold against DES sale #'+k.id+'.';}
  const e=cargoExpected(c,null);const k=e.etaK;const eta=S.w+k;if(eta>=WEEKS)return'Arrival is past the end of the simulation.';
  const price=desFwd(c.dest,k)-physSpread(c.dest,k,e.delivered);
  const kk={id:S.ids.k++,dest:c.dest,price,vol:+e.delivered.toFixed(2),week:Math.min(WEEKS-1,eta+1),wStart:Math.max(S.w+1,eta-1),wEnd:Math.min(WEEKS-1,eta+1),status:'open',opened:S.w,kind:'spot',assigned:c.id};
  S.commits.push(kk);assignCargo(c,kk);
  log('sell','Sold cargo #'+c.id+' DES '+REGIONS[c.dest].name+' at $'+price.toFixed(2)+' for the W'+kk.wStart+' to W'+kk.wEnd+' window (DES sale #'+kk.id+').');return null;
}
function setSettlement(cid,mode,commitId){
  const c=cargoById(cid);if(!c||c.sold||c.phase==='done'||c.phase==='cancelled')return'Cargo no longer yours.';if(c.fixed)return'This cargo is already fixed forward.';
  if(mode==='spot'){releaseAssignment(c);c.spotOnly=true;log('risk','Cargo #'+c.id+' will settle on the spot market at arrival; open DES sales are left for other cargoes.');return null;}
  if(mode==='wait'){const k=commitById(commitId);if(!k||k.status!=='open'||k.dest!==c.dest)return'That DES sale is not open at this port.';const e=cargoExpected(c,null);if(S.w+e.etaK-(e.holdWeeks||0)>k.wEnd)return'The cargo cannot reach the window.';assignCargo(c,k);log('risk','Cargo #'+c.id+' assigned to DES sale #'+k.id+' (window W'+k.wStart+' to W'+k.wEnd+'), waiting off '+REGIONS[c.dest].port+' if it arrives early.');return null;}
  releaseAssignment(c);c.spotOnly=false;log('risk','Cargo #'+c.id+' will settle against any unsourced DES sale at '+REGIONS[c.dest].name+' whose window it arrives in, otherwise spot.');return null;
}
function sellOnWater(cid){
  const c=cargoById(cid);if(c.sold||c.phase==='done'||c.phase==='cancelled')return'Cargo no longer yours.';if(c.phase==='ballast'||c.phase==='waiting')return'Nothing loaded yet.';
  const e=cargoExpected(c,null);const fee=SOW_FEE*e.rev;const proceeds=e.rev-(e.cost-c.costSoFar)-fee;
  S.cash+=proceeds;const pnl=proceeds-c.costSoFar;S.realised+=pnl;S.gross+=pnl;c.sold=true;c.result=pnl;c.soldWeek=S.w;
  if(e.how==='commit'&&e.commit){const k=e.commit;k.status='fulfilled';k.fulfilledBy=c.id;k.closed=S.w;S.stats.fulfilled++;k.assigned=null;}c.waitFor=null;
  const sv=vesselById(c.vesselId);if(c.phase==='float'){c.phase='laden';sv.status='laden';delete c.holdUntil;}
  S.stats.bestTrade=Math.max(S.stats.bestTrade,pnl);
  log('sell','Sold cargo #'+c.id+' on the water for $'+(proceeds/1e6).toFixed(1)+'M ('+(pnl>=0?'+':'-')+'$'+Math.abs(pnl/1e6).toFixed(1)+'M realised). '+vesselById(c.vesselId).name+' completes the delivery for the buyer.');return null;
}
function sellForward(dest,week,vol){
  if(S.over)return'The simulation has ended.';
  const k=week-S.w;const price=desFwd(dest,k)-physSpread(dest,k,vol);
  const notional=price*vol*1e6;
  if(availableCash()<COLLATERAL*notional)return'Not enough free cash for collateral ($'+(COLLATERAL*notional/1e6).toFixed(1)+'M).';
  const c={id:S.ids.k++,dest,price,vol,week,wStart:week-(WINDOW_WEEKS-1),wEnd:week,status:'open',opened:S.w,kind:'spot'};
  S.commits.push(c);log('sell','Sold DES '+REGIONS[dest].name+' forward: '+vol.toFixed(2)+' TBtu at $'+price.toFixed(2)+', delivery window W'+c.wStart+' to W'+c.wEnd+'.');return null;
}
function coverCommit(kid){
  const k=commitById(kid);if(!k||k.status!=='open')return'Not open.';
  if(k.kind==='term')return'Term windows cannot be bought back; deliver a cargo or take the default.';
  const mtm=commitMtm(k)-physSpread(k.dest,Math.max(0,k.wEnd-S.w),k.vol)*k.vol*1e6;
  S.cash+=mtm;S.realised+=mtm;S.gross+=mtm;k.status='covered';k.result=mtm;k.closed=S.w;
  if(k.assigned){const c=cargoById(k.assigned);if(c&&c.waitFor===k.id)c.waitFor=null;k.assigned=null;}
  log('sell','Bought back DES '+REGIONS[k.dest].name+' commitment #'+k.id+' ('+(mtm>=0?'+':'-')+'$'+Math.abs(mtm/1e6).toFixed(1)+'M).');return null;
}

/* ---------- paper hedges ---------- */
function openHedge(hub,mkey,vol,side){
  if(S.over)return'The simulation has ended.';
  const m=curveMonths(HEDGE_MAX_K).find(x=>x.key===mkey);if(!m)return'Pick a contract month within the next six months.';
  if(!(vol>0))return'Volume must be positive.';
  if(hedgeVolOpen()+vol>hedgeCap()+1e-9)return'Paper limit is '+hedgeCap().toFixed(1)+' TBtu open at this desk level ('+hedgeVolOpen().toFixed(1)+' used).';
  const k=m.wStart-S.w;const slip=slippage(hub,k,vol);const price=fwd(hub,k)+(side==='buy'?slip:-slip);
  const im=HEDGE_IM*price*vol*1e6;
  if(availableCash()<im)return'Not enough free cash for initial margin ($'+(im/1e6).toFixed(1)+'M).';
  const h={id:S.ids.h++,hub,mkey,label:m.label,wStart:m.wStart,wEnd:m.wEnd,week:m.wEnd,vol:side==='buy'?vol:-vol,price,opened:S.w,status:'open'};
  S.hedges.push(h);S.stats.hedges++;
  log('risk',(side==='buy'?'Bought ':'Sold ')+vol.toFixed(2)+' TBtu '+HUBS[hub].name+' '+m.label+' at $'+price.toFixed(2)+' (paper, settles on the W'+m.wStart+'–'+m.wEnd+' average).');return null;
}
function closeHedge(id){
  const h=hedgeById(id);if(!h||h.status!=='open')return'Not open.';
  const k=Math.max(0,h.wStart-S.w);const slip=slippage(h.hub,k,Math.abs(h.vol));
  const exit=hedgeMark(h)+(h.vol>0?-slip:slip);const pnl=(exit-h.price)*h.vol*1e6;
  S.cash+=pnl;S.realised+=pnl;S.gross+=pnl;S.hedgePnl+=pnl;h.status='closed';h.result=pnl;h.closed=S.w;h.exit=exit;
  log('risk','Closed '+HUBS[h.hub].name+' '+h.label+' paper position at $'+exit.toFixed(2)+' ('+(pnl>=0?'+':'-')+'$'+Math.abs(pnl/1e6).toFixed(1)+'M).');return null;
}
function stepHedges(){
  for(const h of openHedges()){
    if(S.w>=h.wEnd){const px=rangeSettle(h.hub,h.wStart,h.wEnd);const pnl=(px-h.price)*h.vol*1e6;S.cash+=pnl;S.realised+=pnl;S.gross+=pnl;S.hedgePnl+=pnl;h.status='expired';h.result=pnl;h.closed=S.w;h.exit=px;
      log('risk',HUBS[h.hub].name+' '+h.label+' paper position settled at the month average of $'+px.toFixed(2)+' ('+(pnl>=0?'+':'-')+'$'+Math.abs(pnl/1e6).toFixed(1)+'M).');}
  }
  let guard=0;
  while(availableCash()<0&&openHedges().length&&guard++<20){
    const worst=openHedges().sort((a,b)=>hedgeMtm(a)-hedgeMtm(b))[0];
    S.stats.marginCalls++;log('risk','Margin call: free cash is negative, '+HUBS[worst.hub].name+' '+worst.label+' closed by the clearing house.');closeHedge(worst.id);
  }
}

/* ---------- weekly processing ---------- */
function progressVessel(v){
  const vt=VTYPES[v.type];let c=v.cargoId?cargoById(v.cargoId):null;
  const charge=(amt,kind)=>{if(c&&c.sold)return;const toCargo=c&&!c.sold&&c.phase!=='done'&&c.phase!=='cancelled';if(toCargo){c.costSoFar+=amt;c.cost[kind]=(c.cost[kind]||0)+amt;}else{S.overhead+=amt;}if(kind==='hire'){S.hireTotal=(S.hireTotal||0)+amt;if(!toCargo)S.hireOverhead=(S.hireOverhead||0)+amt;}S.cash-=amt;};
  if(v.charter==='term')S.stats.termDays+=7;
  if(v.status==='relet'){S.cash-=v.hire*7;S.overhead+=v.hire*7;S.hireTotal=(S.hireTotal||0)+v.hire*7;S.hireOverhead=(S.hireOverhead||0)+v.hire*7;S.cash+=v.reletRate*7;S.reletIncome+=v.reletRate*7;if(S.w>=v.reletEnds){v.status='idle';v.reletEnds=null;log('fleet',v.name+' redelivered from relet at '+REGIONS[v.region].port+'.');}return;}
  if(v.status==='idle'){if(v.charter==='term')charge(v.hire*7,'hire');return;}
  if(v.status==='waiting'){
    if(c&&S.w>=c.loadWeek){loadCargo(v,c);log('sys',v.name+' loaded cargo #'+c.id+' at '+REGIONS[c.src].port+' in the W'+c.loadWeek+' laycan.');return;}
    if(!c){v.status='idle';return;}
    if(v.charter==='term')charge(v.hire*7,'hire');return;
  }
  let days=7;
  if(v.status==='float'){
    if(c&&c.holdUntil&&S.w>=c.holdUntil){delete c.holdUntil;v.status='laden';c.phase='laden';v.daysLeft=0;}
    else{charge(v.hire*7,'hire');if(!c.sold)c.volNow-=c.volNow*vt.borIdle/100*7;c.floatWeeks++;S.stats.ladenDays+=7;return;}
  }
  if(v.status==='ballast'){
    const d=Math.min(7,v.daysLeft);charge(v.hire*d,'hire');charge(heelDay(vt,v.from||v.target)*d,'fuel');v.daysLeft-=d;days-=d;
    if(v.daysLeft<=0){v.region=v.target;v.target=null;
      if(c){
        if(S.w<c.loadWeek){v.status='waiting';c.phase='waiting';if(v.charter==='term'&&days>0)charge(v.hire*days,'hire');log('sys',v.name+' arrived at '+REGIONS[c.src].port+' and waits for the W'+c.loadWeek+' laycan.');return;}
        loadCargo(v,c);log('sys',v.name+' loaded cargo #'+c.id+' at '+REGIONS[c.src].port+'.');
      }
      else{v.status='idle';if(v.charter==='term'&&days>0)charge(v.hire*days,'hire');log('sys',v.name+' arrived in ballast at '+REGIONS[v.region].port+'.');return;}
    }else return;
  }
  if(v.status==='laden'){
    const d=Math.min(days,v.daysLeft);charge(v.hire*d,'hire');if(!c.sold)c.volNow-=c.volNow*vt.bor/100*d;v.daysLeft-=d;days-=d;S.stats.ladenDays+=d;
    if(v.daysLeft<=0){
      const held=arriveOrHold(v,c);if(held)return;
      v.cargoId=null;c=null;
      if(v.charter==='term'){v.status='idle';if(days>0)charge(v.hire*days,'hire');}
      else{S.vessels=S.vessels.filter(x=>x.id!==v.id);}
    }
  }
}
function arriveOrHold(v,c){
  if(!c.sold&&!c.fixed&&c.waitFor){
    const k=commitById(c.waitFor);
    if(k&&k.status==='open'&&S.w<k.wStart){v.status='float';c.phase='float';c.holdUntil=k.wStart;v.daysLeft=0;v.region=null;
      log('sys',v.name+' arrived off '+REGIONS[c.dest].port+' with cargo #'+c.id+' and holds for the W'+k.wStart+' to W'+k.wEnd+' window of commitment #'+k.id+'.');return true;}
  }
  discharge(v,c);return false;
}
function discharge(v,c){
  const dest=c.dest;v.region=dest;
  if(c.sold){c.phase='done';c.doneWeek=S.w;log('sys',v.name+' discharged the sold cargo #'+c.id+' at '+REGIONS[dest].port+'.');return;}
  const delivered=c.volNow;let price,how;
  if(c.fixed){price=c.fixed.price;how='fixed';}
  else{
    let k=null;
    if(c.waitFor){const kk=commitById(c.waitFor);if(kk&&kk.status==='open'&&kk.wStart<=S.w&&S.w<=kk.wEnd)k=kk;}
    if(!k&&!c.spotOnly)k=matchCommit(dest,S.w,null);
    if(k){price=k.price;how=(k.kind==='term'?'term ':'')+'DES sale #'+k.id;k.status='fulfilled';k.fulfilledBy=c.id;k.closed=S.w;k.assigned=null;S.stats.fulfilled++;}else{price=des(dest);how='spot DES';}
  }
  c.costSoFar+=PORT_DISC_FEE;c.cost.fees=(c.cost.fees||0)+PORT_DISC_FEE;S.cash-=PORT_DISC_FEE;
  const rev=price*delivered*1e6;S.cash+=rev;const pnl=rev-c.costSoFar;
  S.realised+=pnl;S.gross+=pnl;S.stats.delivered++;S.stats.bestTrade=Math.max(S.stats.bestTrade,pnl);
  c.phase='done';c.doneWeek=S.w;c.result=pnl;c.revenue=rev;c.deliveredVol=delivered;c.priceHow=how;c.pricePaid=price;
  log('sell',v.name+' delivered cargo #'+c.id+' at '+REGIONS[dest].port+': '+delivered.toFixed(2)+' TBtu at $'+price.toFixed(2)+' ('+how+'), '+(pnl>=0?'+':'-')+'$'+Math.abs(pnl/1e6).toFixed(1)+'M.');
}
function repairVessel(v){
  const c=v.cargoId?cargoById(v.cargoId):null;
  if(!isFinite(v.daysLeft)||v.daysLeft<0)v.daysLeft=(v.status==='laden'||v.status==='ballast')?1:0;
  if((v.status==='laden'||v.status==='float'||v.status==='waiting')&&(!c||c.phase==='done'||c.phase==='cancelled')){v.status='idle';v.cargoId=null;if(!v.region)v.region=c?c.dest:'USGC';log('sys',v.name+' was left without a live cargo and has been released as idle at '+REGIONS[v.region].port+'.');return;}
  if(v.status==='ballast'&&!v.target){v.status='idle';if(!v.region)v.region=v.from||'USGC';log('sys',v.name+' had no ballast destination and has been released as idle at '+REGIONS[v.region].port+'.');return;}
  if(v.status==='idle'&&!v.region)v.region='USGC';
  if(v.status==='relet'&&(!v.reletEnds||!isFinite(v.reletEnds))){v.status='idle';}
  if(c&&c.sold&&c.phase==='float'){c.phase='laden';v.status='laden';delete c.holdUntil;log('sys',v.name+' resumes passage with sold cargo #'+c.id+' for its buyer.');}
  if(c&&c.phase==='float'&&v.status!=='float')v.status='float';
  if(c&&c.phase==='laden'&&v.status==='float')c.phase='float';
}
function stepFleet(){
  for(const v of [...S.vessels]){repairVessel(v);progressVessel(v);}
  for(const v of [...S.vessels]){
    if(v.charter==='term'&&v.status==='idle'&&S.w>=v.termEnds){S.vessels=S.vessels.filter(x=>x.id!==v.id);log('fleet','Term ended: '+v.name+' redelivered to owners at '+REGIONS[v.region].port+'.');}
  }
}
function stepCommits(){
  for(const k of openCommits()){
    if(S.w>k.wEnd){
      const cost=Math.max(0,des(k.dest)-k.price)*k.vol*1e6+DEFAULT_PEN*k.price*k.vol*1e6;
      S.cash-=cost;S.realised-=cost;S.gross-=cost;k.status='defaulted';k.result=-cost;k.closed=S.w;S.stats.defaults++;
      for(const c of activeCargoes())if(c.waitFor===k.id)c.waitFor=null;k.assigned=null;
      log('risk','Default on DES '+REGIONS[k.dest].name+' commitment #'+k.id+': no cargo delivered in the W'+k.wStart+' to W'+k.wEnd+' window. Buyer covered in the market; you pay $'+(cost/1e6).toFixed(1)+'M.');
      continue;
    }
    if(k.kind==='term'||isSourced(k))continue;
    const mtm=commitMtm(k);const notional=k.price*k.vol*1e6;
    if(mtm<-CREDIT_BREACH*notional){
      S.cash+=mtm;S.realised+=mtm;S.gross+=mtm;k.status='breached';k.result=mtm;k.closed=S.w;S.stats.breaches++;
      for(const c of activeCargoes())if(c.waitFor===k.id)c.waitFor=null;
      log('risk','Credit line breached on commitment #'+k.id+' ('+REGIONS[k.dest].name+'): closed out at a loss of $'+Math.abs(mtm/1e6).toFixed(1)+'M.');
    }
  }
}
function checkLevel(){
  let lvl=1;for(let i=0;i<LEVELS.length;i++)if(S.gross>=LEVELS[i].at)lvl=i+1;
  if(lvl>S.level){S.level=lvl;S.levelFlash=lvl;log('sys','Desk expanded to level '+lvl+': '+slots()+' simultaneous positions.');}
}
function nextWeek(){
  if(S.over)return;
  S.levelFlash=null;S.w++;
  stepMarket();stepStory();stepContracts();stepFleet();stepCommits();stepHedges();
  S.offers=S.offers.filter(o=>!o.taken&&(o.kind==='term'||o.openedW===S.w));
  spawnOffers();spawnNews(false);checkLevel();
  S.news=S.news.filter(n=>S.w-n.week<=NEWS_KEEP_WEEKS);
  if(S.w>=WEEKS)S.over=true;
}
function finalSummary(){
  const net=netPnl();
  const util=S.stats.termDays?S.stats.ladenDays/S.stats.termDays:0;
  return{net,stars:starsFor(net),realised:S.realised,unrealised:unrealised(),overhead:S.overhead,reletIncome:S.reletIncome,hireTotal:S.hireTotal||0,hireOverhead:S.hireOverhead||0,hedgePnl:S.hedgePnl||0,premiums:S.premiums||0,util,weeks:S.w,...S.stats};
}

/* ---------- analyst ---------- */
function analystReport(){
  const rows=[];
  for(const src of LOADS){
    const basin=REGIONS[src].basin;const rate=spotRate('XDF',basin);
    for(const d of DESTS){
      let best=null;
      for(const o of routeOptions(src,d)){if(routeBlocked(o.via))continue;const p=planVoyage(src,d,o.via,'XDF','spot',rate,null,null);if(p&&(!best||p.margin>best.margin))best=p;}
      if(best)rows.push({src,dest:d,plan:best,open:M.outage[src]===0&&M.demandOff[d]===0});
    }
  }
  rows.sort((a,b)=>b.plan.margin-a.plan.margin);
  const pending=S.news.filter(n=>n.kind==='event'&&n.impactWeek===S.w+1&&!n.applied);
  const calls=[];
  const top=rows.filter(r=>r.open)[0];
  if(top)calls.push('Best marker netback this week: '+REGIONS[top.src].port+' to '+REGIONS[top.dest].name+' via '+top.plan.via+', about '+(top.plan.perMMBtu>=0?'+':'-')+'$'+Math.abs(top.plan.perMMBtu).toFixed(2)+'/MMBtu on a spot XDF loading now. Check the offer book: each tender carries its own laycan and price.');
  const offers=liveOffers();const cheapest=offers.filter(o=>o.kind==='spot').sort((a,b)=>(a.price-M.fob[a.src])-(b.price-M.fob[b.src]))[0];
  if(cheapest)calls.push('Offer book: '+offers.length+' cargoes open this week. The cheapest against its marker is '+REGIONS[cheapest.src].port+' for the W'+cheapest.loadWeek+' laycan at $'+cheapest.price.toFixed(2)+' ('+((cheapest.price-M.fob[cheapest.src])>=0?'+':'')+(cheapest.price-M.fob[cheapest.src]).toFixed(2)+' to the marker).');
  if(pending.length){
    for(const n of pending){
      const dirs=[];if(n.impact){for(const h in n.impact){const t=n.impact[h][0];dirs.push((h==='charter'?'freight':h)+(t>0?' up':' down'));}}
      calls.push('Next week: '+n.title.toLowerCase()+'. Expect '+(dirs.length?dirs.join(', '):'logistics effects')+'. FOB markers have not repriced yet; cargoes already afloat toward the affected hub carry the move.');
    }
  }else calls.push('No scheduled catalysts for next week. Quiet tape: the curve and freight decide.');
  const s=M.structure;const carry=desFwd('NWE',4)-des('NWE');
  const floatCost=(typeRate('XDF')*7)/(3.6e6)+des('NWE')*VTYPES.XDF.borIdle/100*7;
  if(s==='CONTANGO')calls.push('TTF curve in contango: a month of carry is worth about $'+carry.toFixed(2)+'/MMBtu against roughly $'+(floatCost*4).toFixed(2)+' to float an XDF cargo for four weeks. '+(carry>floatCost*4?'Floating storage pays.':'Floating does not cover its cost yet.'));
  else if(s==='BACKWARDATION')calls.push('TTF curve in backwardation: deliver promptly, do not hold cargoes on the water, and look at selling DES forward or paper into the backwardation.');
  else calls.push('TTF curve is flat: no carry trade on offer, so freight and destination choice are the edge.');
  const ex=exposure();
  const fmtEx=(v)=>(v>=0?'+':'−')+Math.abs(v).toFixed(1);
  calls.push('Book exposure after paper: TTF-linked '+fmtEx(ex.net.TTF)+' TBtu, JKM-linked '+fmtEx(ex.net.JKM)+' TBtu'+(ex.net.HH?', Henry Hub '+fmtEx(ex.net.HH)+' TBtu':'')+'. '+(Math.abs(ex.net.TTF)+Math.abs(ex.net.JKM)>5?'That is a sizeable open position; a paper hedge at the arrival week locks the price without locking the destination.':'Exposure is modest.')+' Bid-offer is '+liqLabel('TTF')+' on TTF and '+liqLabel('JKM')+' on JKM.');
  const spread=spot('JKM')-spot('TTF');
  const usEu=rows.find(r=>r.src==='USGC'&&r.dest==='NWE'),usAs=rows.find(r=>r.src==='USGC'&&r.dest==='JKTC');
  if(usEu&&usAs){const diff=usAs.plan.freightPer-usEu.plan.freightPer;calls.push('East-West: JKM minus TTF is $'+spread.toFixed(2)+' against a US Gulf freight differential of $'+diff.toFixed(2)+'/MMBtu to Asia ('+usAs.plan.via+'). '+(spread>diff+0.3?'Asia pays for the long haul.':spread<diff-0.3?'Europe is the better home for Atlantic cargoes.':'Both basins are close to parity.'));}
  const sp=M.charter;calls.push('Spot 174k XDF at $'+Math.round(sp/1000)+'k/d, 1-year TC at $'+Math.round(tcRate('XDF',52)/1000)+'k/d. '+(sp>tcRate('XDF',52)*1.35?'Term tonnage is cheap relative to spot: relet idle ships or charter term.':sp<tcRate('XDF',52)*0.8?'Spot is cheaper than term: fix spot and keep the term fleet small.':'Spot and term are close.'));
  const termOffers=S.offers.filter(o=>o.kind==='term'&&!o.taken);const termWins=openCommits().filter(k=>k.kind==='term');
  if(termOffers.length||termWins.length)calls.push('Term obligations: '+(termOffers.length?termOffers.map(o=>REGIONS[o.src].port+' laycan W'+o.loadWeek).join(', '):'no open laycans')+'; '+(termWins.length?termWins.map(k=>REGIONS[k.dest].port+' window W'+k.wStart+' to W'+k.wEnd).join(', '):'no open windows')+'.');
  if(M.block.Suez>0)calls.push('Suez is closed for '+M.block.Suez+' more weeks: Atlantic to Asia goes round the Cape.');
  if(M.block.Panama>0)calls.push('Panama is closed for '+M.block.Panama+' more weeks.');
  if(M.delay.Panama.weeks>0)calls.push('Panama queue adds '+M.delay.Panama.days+' days for '+M.delay.Panama.weeks+' more weeks.');
  return{rows,calls,pending};
}
