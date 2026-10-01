// Real seeded actions: established stand rays and earned notes follow the
// visible lunger; later victims retain rays until the crossing ink arrives.
import assert from 'node:assert/strict';
import {idle} from '../lib/phone.mjs';
export default async function(T){
 const {page}=T;
 const reset=async()=>{await page.evaluate(()=>{const p=window.pft;p.hand(false);p.speed=1;p.slow=false;p.boilOn=false;p.LIFE.bubbles=false;const r=p.fileWar(11,24);r.mode={kind:'pnp'};p.resumeRecord(r);});await idle(T,120000);await page.evaluate(()=>window.pft.hand(true));};
 const step=async ms=>{const wall=await page.evaluate(ms=>{const p=window.pft,w=p.wall;p.step(ms);return w;},ms);await page.waitForFunction(w=>window.pft.wall>w,wall,{timeout:120000});};
 if(process.env.STAND_CASE!=='victim'){
 await reset();
 const chosen=await page.evaluate(async()=>{const p=window.pft,g=await import('/src/game.ts');p.bubbles.reset();p.cam.snap();p.LIFE.bubbles=true;for(const x of p.s.soldiers.filter(x=>x.alive&&x.owner===p.s.current&&p.s.stand[x.owner]))for(let a=0;a<360;a+=30){const f={t:'flick',soldier:x.id,kind:'lunge',angle:a*Math.PI/180,length:80,bend:0,wob:0};const o=g.preview(p.s,f);if(!o.lost&&o.crashed===undefined&&Math.hypot(o.path.at(-1).x-x.x,o.path.at(-1).y-x.y)>40){p.announce('more',x.id,'One more!',0);return {f,from:{x:x.x,y:x.y},id:x.id,gates:{slow:p.slow,tooDear:p.boil.tooDear,screen:p.screen,settled:p.cam.settled}};}}throw Error('no safe last-stand lunge');});
 console.log('selected lunge fixture',JSON.stringify(chosen));
 for(let i=0;i<5;i++)await step(50);
 assert.equal(await page.evaluate(()=>{window.pft.LIFE.bubbles=false;return window.pft.bubbles.cur?.kind;}),'more');
 const begin=await page.evaluate(({f,id})=>{const p=window.pft;p.act(f);p.renderNow();const fr=p.frame(),ray=p.standRays.get(id);return {mover:fr.mover.at,bubble:fr.bubble.at,ray:{x:ray.ox+42,y:ray.oy+42},endpoint:p.s.soldiers[id]};},chosen);
 const close=(a,b)=>assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<.01,JSON.stringify({a,b}));
 close(begin.mover,chosen.from);close(begin.bubble,begin.mover);close(begin.ray,begin.mover);assert.ok(Math.hypot(begin.endpoint.x-begin.mover.x,begin.endpoint.y-begin.mover.y)>40);
 await step(100);
 const mid=await page.evaluate(id=>{const p=window.pft;p.renderNow();const fr=p.frame(),r=p.standRays.get(id);return {mover:fr.mover.at,bubble:fr.bubble.at,ray:{x:r.ox+42,y:r.oy+42}};},chosen.id);
 close(mid.bubble,mid.mover);close(mid.ray,mid.mover);console.log('last-stand ray and earned note follow ink head',JSON.stringify({begin,mid}));
 }
 await reset();
 // Spend the side's remaining actions before the opposing shot.
 for(let i=0;i<4&&await page.evaluate(()=>!!window.pft.s.stand[window.pft.s.current]);i++){
 await page.evaluate(()=>{const p=window.pft,x=p.s.soldiers.find(x=>x.alive&&x.owner===p.s.current);p.hand(false);p.speed=4;p.act({t:'flick',soldier:x.id,kind:'snipe',angle:0,length:1,bend:0,wob:0});});await idle(T,120000);
 }
 await page.evaluate(()=>{window.pft.speed=1;window.pft.hand(true);});
 const shot=await page.evaluate(async()=>{const p=window.pft,g=await import('/src/game.ts');for(const x of p.s.soldiers.filter(x=>x.alive&&x.owner===p.s.current))for(const y of p.s.soldiers.filter(x=>x.alive&&p.s.stand[x.owner]&&x.owner!==p.s.current)){const f={t:'flick',soldier:x.id,kind:'snipe',angle:Math.atan2(y.y-x.y,y.x-x.x),length:1800,bend:0,wob:0};const o=g.preview(p.s,f),id=o.killed.find(id=>p.standRays.has(id));if(id!==undefined){p.act(f);p.renderNow();return {id,dead:!p.s.soldiers[id].alive,ray:p.standRays.has(id),at:p.res.kills.find(k=>p.s.marks[k.i].x===p.s.soldiers[id].x&&p.s.marks[k.i].y===p.s.soldiers[id].y).at};}}throw Error('no seeded stand-victim snipe');});
 assert.equal(shot.dead,true);assert.equal(shot.ray,true);
 for(let i=0;i<100;i++){
  const state=await page.evaluate(id=>{const p=window.pft,k=p.res?.kills.find(k=>p.s.marks[k.i].x===p.s.soldiers[id].x&&p.s.marks[k.i].y===p.s.soldiers[id].y);return {ray:p.standRays.has(id),hit:!!k?.hit,cross:k?p.fx.p('m'+k.i,p.T):1};},shot.id);
  if(!state.ray){assert.equal(state.hit,true,'ray cannot disappear before ink arrives');assert.ok(state.cross>0,'ray must remain until cross actually begins');break;}
  if(!state.hit||state.cross===0)assert.equal(state.ray,true);
  await step(50);
 }
 assert.equal(await page.evaluate(id=>window.pft.standRays.has(id),shot.id),false);console.log('stand victim ray retained before crossing and removed on arrival',JSON.stringify(shot));
}
