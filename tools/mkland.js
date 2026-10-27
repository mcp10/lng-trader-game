// Build a compact SVG path of the world's land in the chart's equirectangular frame (lon -180..180 → 0..1000, lat 70..-50 → 0..333)
const topo=require('world-atlas/land-50m.json');
const tc=require('topojson-client');
const land=tc.feature(topo,topo.objects.land);
const W=1000,H=333;
const proj=([lon,lat])=>[(lon+180)/360*W,(70-lat)/120*H];
function dp(pts,tol){ // Douglas-Peucker on projected points
  if(pts.length<3)return pts;
  const [ax,ay]=pts[0],[bx,by]=pts[pts.length-1];let maxd=0,idx=0;
  const dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy)||1e-9;
  for(let i=1;i<pts.length-1;i++){const [px,py]=pts[i];const d=Math.abs(dy*px-dx*py+bx*ay-by*ax)/len;if(d>maxd){maxd=d;idx=i;}}
  if(maxd>tol){const l=dp(pts.slice(0,idx+1),tol),r=dp(pts.slice(idx),tol);return l.slice(0,-1).concat(r);}
  return [pts[0],pts[pts.length-1]];
}
const TOL=0.7;
let d='',rings=0,pts=0;
const geoms=land.type==='FeatureCollection'?land.features.map(f=>f.geometry):[land.geometry];const polys=[];for(const g of geoms){if(g.type==='MultiPolygon')polys.push(...g.coordinates);else polys.push(g.coordinates);}
for(const poly of polys){
  for(const ring of poly){
    // skip rings entirely below the frame (Antarctica) or tiny
    const maxLat=Math.max(...ring.map(p=>p[1]));if(maxLat<-50)continue;
    let p=ring.map(proj);{const [x0,y0]=p[0];let far=1,fd=0;for(let i=1;i<p.length;i++){const dd=Math.hypot(p[i][0]-x0,p[i][1]-y0);if(dd>fd){fd=dd;far=i;}}const a=dp(p.slice(0,far+1),TOL),b=dp(p.slice(far),TOL);p=a.slice(0,-1).concat(b);}
    if(p.length<4)continue;
    const area=Math.abs(p.reduce((s,q,i)=>{const n=p[(i+1)%p.length];return s+q[0]*n[1]-n[0]*q[1];},0))/2;
    if(area<1.2)continue;
    d+='M'+p.map((q,i)=>(i?'L':'')+q[0].toFixed(1)+' '+q[1].toFixed(1)).join('')+'Z';
    rings++;pts+=p.length;
  }
}
require('fs').writeFileSync('land.js',"const LAND_PATH='"+d+"';\n");
console.log('rings',rings,'points',pts,'bytes',d.length);
