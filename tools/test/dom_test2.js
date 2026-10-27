const {JSDOM}=require('jsdom');const fs=require('fs');
const html=fs.readFileSync(process.argv[2],'utf8');
const doc=/^\s*<!doctype/i.test(html)?html:'<!doctype html><html><head><meta charset="utf-8"></head><body>'+html+'</body></html>';
const dom=new JSDOM(doc,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.org/'});
const w=dom.window,d=w.document;w.scrollTo=()=>{};
const errs=[];w.addEventListener('error',e=>errs.push(e.message));
const click=sel=>{const el=typeof sel==='string'?d.querySelector(sel):sel;if(!el)throw new Error('no element '+sel);el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));};
const txt=sel=>{const el=d.querySelector(sel);return el?el.textContent.trim():'(none)';};
click('[data-act="begin"]');
console.log('week',txt('#t-week'),'contracts cards',d.querySelectorAll('#contracts .contract').length,'hedges empty',!!d.querySelector('#hedges .empty'),'hub liq flags',d.querySelectorAll('#hubs .flag').length);
// sign US tolling
click('[data-act="signModal"][data-arg*="USTOLL"]');console.log('sign modal',txt('#sheetTitle'));click('[data-act="signConfirm"]');console.log('signed:',d.querySelector('#contracts .contract .ob').textContent.trim().slice(0,40));
// buy from offer book with fleet vessel
click('[data-act="buyModal"]');const offers=d.querySelectorAll('[data-act="buyPick"]');console.log('offers',offers.length);
let picked=null;for(const o of offers){if(o.textContent.includes('Sabine')){picked=o;break;}}if(!picked)picked=offers[0];click(picked);
const fleetCard=d.querySelector('[data-act="buyVessel"][data-arg*="fleet"]');console.log('fleet card disabled?',fleetCard&&fleetCard.disabled,'text',fleetCard&&fleetCard.querySelector('.m').textContent);
click(fleetCard&&!fleetCard.disabled?fleetCard:d.querySelector('[data-act="buyVessel"][data-arg*="XDF"]'));
click(d.querySelector('[data-act="buyDest"]'));console.log('econ rows',d.querySelectorAll('.econ .k').length,'cash line',[...d.querySelectorAll('.econ .k')].pop().textContent);
click('[data-act="buyConfirm"]');console.log('closed',d.getElementById('modal').hidden,'cargo rows',d.querySelectorAll('#cargoes tbody tr').length,'status',txt('#cargoes .status'),'err',d.querySelector('#sheetFoot .err')&&txt('#sheetFoot .err'));
// forward sale with window
click('[data-act="fwdModal"]');console.log('window chips',d.querySelectorAll('[data-act="fwdWeek"]').length,'first',txt('[data-act="fwdWeek"]'));click('[data-act="fwdConfirm"]');console.log('commits rows',d.querySelectorAll('#commits tbody tr').length,'window col',d.querySelector('#commits tbody tr td:nth-child(5)')&&txt('#commits tbody tr td:nth-child(5)'));
// settlement modal
click('[data-act="cSettleModal"]');console.log('settle cards',d.querySelectorAll('[data-act="settlePick"]').length);const waitCard=d.querySelector('[data-act="settlePick"][data-arg*="wait"]');if(waitCard&&!waitCard.disabled){click(waitCard);console.log('after wait pick: btn',txt('[data-act="cSettleModal"]'));}else{click('[data-act="closeModal"]');}
// hedge
click('[data-act="hedgeModal"]');console.log('hedge months',d.querySelectorAll('[data-act="hedgeMonth"]').length);click('[data-act="hedgeHub"][data-arg*="JKM"]');click(d.querySelectorAll('[data-act="hedgeMonth"]')[2]);click('[data-act="hedgeConfirm"]');console.log('hedge rows',d.querySelectorAll('#hedges tbody tr').length,'meta',txt('#hedge-meta'));
// cancel lifting modal (cancel)
click('[data-act="cCancelModal"]');console.log('cancel modal',txt('#sheetTitle'));click('[data-act="closeModal"]');
// run weeks, check term laycan appears and lift it
for(let i=0;i<4;i++)click('[data-act="next"]');
console.log('week',txt('#t-week'),'term offers lift buttons',d.querySelectorAll('[data-act="buyModalOffer"]').length,'cargo status',[...d.querySelectorAll('#cargoes .status')].map(x=>x.textContent).join(','),'log',txt('#log li'));
const lift=d.querySelector('[data-act="buyModalOffer"]');if(lift){click(lift);console.log('buy modal preselected',!!d.querySelector('[data-act="buyPick"].sel'));click(d.querySelector('[data-act="buyVessel"][data-arg*="XDF"]'));click(d.querySelector('[data-act="buyDest"]'));click('[data-act="buyConfirm"]');console.log('term cargo rows',d.querySelectorAll('#cargoes tbody tr').length,'err',d.querySelector('#sheetFoot .err')&&txt('#sheetFoot .err'));if(!d.getElementById('modal').hidden)click('[data-act="closeModal"]');}
// close hedge
const hc=d.querySelector('[data-act="hCloseModal"]');if(hc){click(hc);click('[data-act="hCloseConfirm"]');console.log('hedge closed; done rows',d.querySelectorAll('#done tbody tr').length);}
// guide
click('[data-act="guide"]');console.log('guide h3',d.querySelectorAll('.guide h3').length);click('[data-act="closeModal"]');
// run to end
let guard=0;while(d.getElementById('end').hidden&&guard++<120)click('[data-act="next"]');
console.log('end',!d.getElementById('end').hidden,txt('#end-net'),txt('#end-stars'),'grid cells',d.querySelectorAll('#end-grid > div').length);
// save/resume migrate
click('[data-act="viewFloor"]');click('[data-act="homeModal"]');click('[data-act="saveExit"]');click('[data-act="resume"]');console.log('resumed end visible',!d.getElementById('end').hidden);
console.log('errors:',errs);
