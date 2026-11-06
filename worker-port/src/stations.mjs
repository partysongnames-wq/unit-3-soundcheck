// Server-authoritative reusable station challenge generators and public serializers.
export const STATION_MS=22000;
export const STATIONS={
 math:{id:'math',label:'Maths Sprint',icon:'➗',x:24.5,y:4.5},
 flag:{id:'flag',label:'World Flags',icon:'🚩',x:33.5,y:20.5},
 checkpoint:{id:'checkpoint',label:'Checkpoint CCTV',icon:'🛵',x:16.5,y:21.5}
};
const FLAGS={easy:[['th','Thailand'],['us','United States'],['gb','United Kingdom'],['jp','Japan'],['cn','China'],['kr','South Korea'],['fr','France'],['de','Germany'],['it','Italy'],['au','Australia'],['ca','Canada'],['br','Brazil']],medium:[['id','Indonesia'],['my','Malaysia'],['sg','Singapore'],['vn','Vietnam'],['ph','Philippines'],['kh','Cambodia'],['la','Laos'],['mm','Myanmar'],['bn','Brunei'],['tl','Timor-Leste'],['nz','New Zealand'],['in','India']],hard:[['bt','Bhutan'],['np','Nepal'],['kz','Kazakhstan'],['kg','Kyrgyzstan'],['mn','Mongolia'],['lk','Sri Lanka'],['za','South Africa'],['ar','Argentina'],['cl','Chile'],['ke','Kenya'],['jm','Jamaica'],['is','Iceland']]};
export const FLAG_LEVELS={easy:1,medium:2,hard:3};
export const MATH_FAMILIES=['ratio','percent','powers','linear','pythagoras','measurement','mean','probability'];
function hash(s){let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
export function rngFor(seed){let a=hash(seed);return()=>{a=(a+0x6d2b79f5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296}}
const ri=(r,a,b)=>a+Math.floor(r()*(b-a+1)); const pick=(r,a)=>a[ri(r,0,a.length-1)];
function shuffle(r,a){a=a.slice();for(let i=a.length-1;i;i--){const j=ri(r,0,i);[a[i],a[j]]=[a[j],a[i]]}return a}
function choices(r,answer,wrong){const a=String(answer),u=[a,...wrong.map(String)].filter((x,i,z)=>x&&z.indexOf(x)===i);let n=1;while(u.length<4){const m=a.match(/-?\d+(?:\.\d+)?/),v=m?a.replace(m[0],String(Number(m[0])+n)):a+' '+n;n++;if(!u.includes(v))u.push(v)}const options=shuffle(r,u.slice(0,4));return{options,answer:options.indexOf(a)}}
function mathOne(r,f){
 if(f==='ratio'){const unit=ri(r,2,12),known=ri(r,2,5),ask=known+ri(r,1,4),a=unit*ask;return{prompt:known+' notebooks cost ฿'+unit*known+'. Cost of '+ask+'?',...choices(r,'฿'+a,['฿'+unit*(ask-1),'฿'+unit*(ask+1),'฿'+(a+known)])}}
 if(f==='percent'){const pct=pick(r,[10,20,25,50]),price=pick(r,[80,100,120,160,200,240,300]),discount=r()<.5,a=discount?price-price*pct/100:price*pct/100;return{prompt:discount?'฿'+price+' with '+pct+'% off. New price?':pct+'% of ฿'+price+' = ?',...choices(r,'฿'+a,['฿'+(price-a),'฿'+(a+10),'฿'+price])}}
 if(f==='powers'){if(r()<.5){const b=ri(r,2,5),e=ri(r,2,3),a=b**e;return{prompt:b+'^'+e+' = ?',...choices(r,a,[b*e,a+b,a-b])}}const a=ri(r,4,15);return{prompt:'√'+a*a+' = ?',...choices(r,a,[a-1,a+1,a*2])}}
 if(f==='linear'){const a=ri(r,2,9),x=ri(r,2,15),b=ri(r,1,15),c=a*x+b;return{prompt:a+'x + '+b+' = '+c+'. Find x.',...choices(r,x,[x-1,x+1,Math.floor(c/a)])}}
 if(f==='pythagoras'){const t=pick(r,[[3,4,5],[5,12,13],[6,8,10],[8,15,17],[7,24,25]]);return{prompt:'Right triangle legs: '+t[0]+' and '+t[1]+'. Hypotenuse?',...choices(r,t[2],[t[0]+t[1],t[2]-1,t[2]+1])}}
 if(f==='measurement'){const l=ri(r,4,14),w=ri(r,3,10),a=l*w;return{prompt:'Rectangle: '+l+' cm × '+w+' cm. Area?',...choices(r,a+' cm²',[(a+l)+' cm²',(2*(l+w))+' cm²',(a-w)+' cm²'])}}
 if(f==='mean'){const a=ri(r,6,20),p=ri(r,1,4),q=ri(r,1,4),v=shuffle(r,[a-p,a+p,a-q,a+q]);return{prompt:'Mean of '+v.join(', ')+'?',...choices(r,a,[a-2,a-1,a+1])}}
 const total=ri(r,5,12),good=ri(r,1,total-1),a=good+'/'+total;return{prompt:'A bag has '+good+' blue and '+(total-good)+' red counters. P(blue)?',...choices(r,a,[(good+1)+'/'+total,Math.max(1,good-1)+'/'+total,(total-good)+'/'+total])};
}
export function generateMath(seed){const r=rngFor(seed),families=shuffle(r,MATH_FAMILIES).slice(0,3);return families.map((family,i)=>({id:i,family,...mathOne(r,family)}))}
export function generateFlags(seed,level){if(!FLAG_LEVELS[level])throw Error('bad level');const r=rngFor(seed+'|'+level),pool=FLAGS[level].map(([id,name])=>({id,name}));return shuffle(r,pool).slice(0,3).map((flag,i)=>{const opts=shuffle(r,[flag,...shuffle(r,pool.filter(x=>x.id!==flag.id)).slice(0,3)]);return{id:i,flagId:flag.id,asset:'/flags/'+flag.id+'.svg',options:opts.map(x=>x.name),answer:opts.findIndex(x=>x.id===flag.id)}})}
const COLORS=['red','blue','green','yellow','purple','orange'],FOODS=['noodles','rice','pizza','fruit','drinks','sandwiches'],MODES=['scooter','bicycle','on foot'],SHIRTS=['red','blue','green','yellow','purple','white'];
const TEMPLATES=[['easy','helmet','Choose the rider with a {helmet} helmet.'],['easy','food','Find the person carrying {food}.'],['easy','mode','Choose the person arriving by {mode}.'],['medium','helmet,bagCount','Choose the rider with a {helmet} helmet and {bagCount} food bags.'],['medium','shirt,food','Find the person in a {shirt} shirt carrying {food}.'],['hard','food,!shirt,code','Find the visitor carrying {food}, not wearing a {shirt} shirt, with pickup code {code}.'],['hard','helmet,!glasses,code','Choose the rider with a {helmet} helmet, no glasses, and pickup code {code}.']];
function person(r){return{helmet:pick(r,COLORS),shirt:pick(r,SHIRTS),glasses:r()<.42,bagCount:ri(r,1,3),food:pick(r,FOODS),mode:pick(r,MODES),code:ri(r,10,99)}}
function diff(r,k,v){const m={helmet:COLORS,shirt:SHIRTS,food:FOODS,mode:MODES,bagCount:[1,2,3],glasses:[true,false],code:Array.from({length:90},(_,i)=>i+10)};return pick(r,m[k].filter(x=>x!==v))}
function match(p,c){return c.every(x=>(x.op==='eq')===(p[x.key]===x.value))}
export function makeCheckpointCase(seed,level){const r=rngFor(seed),tpl=pick(r,TEMPLATES.filter(x=>x[0]===level)),target=person(r);if(tpl[1].includes('!glasses'))target.glasses=false;const cs=tpl[1].split(',').map(raw=>{const neg=raw[0]==='!',key=neg?raw.slice(1):raw;return{key,op:neg?'neq':'eq',value:neg?(key==='glasses'?true:diff(r,key,target[key])):target[key]}});const people=[target];for(let i=0;i<3;i++){const p=person(r),c=cs[i%cs.length];p[c.key]=c.op==='eq'?diff(r,c.key,c.value):c.value;if(match(p,cs))p[cs[0].key]=cs[0].op==='eq'?diff(r,cs[0].key,cs[0].value):cs[0].value;people.push(p)}const candidates=shuffle(r,people),answer=candidates.indexOf(target),vals={...target};for(const c of cs)if(c.op==='neq')vals[c.key]=c.value;const words={1:'one',2:'two',3:'three'};return{clue:tpl[2].replace(/\{(\w+)\}/g,(_,k)=>k==='bagCount'?words[vals[k]]:String(vals[k])),constraints:cs,candidates,answer,level}}
export function generateCheckpoint(seed){return ['easy','medium','hard'].map((level,i)=>({id:i,...makeCheckpointCase(seed+':'+i,level)}))}
export function generateStation(kind,seed,level){if(kind==='math')return generateMath(seed);if(kind==='flag')return generateFlags(seed,level);if(kind==='checkpoint')return generateCheckpoint(seed);throw Error('bad station')}
export function publicItem(kind,item){if(kind==='math')return{id:item.id,family:item.family,prompt:item.prompt,options:item.options};if(kind==='flag')return{id:item.id,flagId:item.flagId,asset:item.asset,options:item.options};return{id:item.id,level:item.level,clue:item.clue,candidates:item.candidates}}
export function rewardFor(kind,correct,level){if(correct<2)return 0;if(kind==='flag')return FLAG_LEVELS[level]||0;return correct}
export function validateGenerated(kind,item){return Number.isInteger(item.answer)&&item.answer>=0&&item.answer<4&&(kind==='checkpoint'?item.candidates.length===4:new Set(item.options).size===4)}
