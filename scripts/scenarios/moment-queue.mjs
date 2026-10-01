// Two mandatory notes, with a camera move at the second activation; also
// check slow-device lunge embellishments through the real action flow.
import assert from 'node:assert/strict';
import { idle } from '../lib/phone.mjs';
export default async function(T) {
 const {page}=T;
 await page.evaluate(()=>{const p=window.pft;p.slow=false;p.boilOn=false;const r=p.fileWar(11,12);r.mode={kind:'pnp'};p.resumeRecord(r);});
 await idle(T,120000);
 await page.evaluate(()=>{const p=window.pft;p.hand(true);p.bubbles.reset();p.cam.snap();const id=p.s.soldiers.find(x=>x.alive&&x.owner===p.s.current).id;p.announce('more',id,'One more!',0);p.announce('stand',id,'LAST STAND!',0);p.step(1);});
 await page.waitForFunction(()=>window.pft.bubbles.cur?.kind==='more');
 await page.evaluate(()=>{const c=window.pft.cam;window.originalTick=c.tick;c.tgt.x+=80;c.tick=()=>true;});
 const step=async(ms)=>{const wall=await page.evaluate(ms=>{const p=window.pft;const wall=p.wall;p.step(ms);return wall;},ms);await page.waitForFunction(wall=>window.pft.wall>wall,wall,{timeout:20000});};
 for(let i=0;i<65;i++)await step(50);
 assert.notEqual(await page.evaluate(()=>window.pft.bubbles.cur?.kind),'stand','queued note must wait for its actual camera-settle window');
 for(let i=0;i<12;i++)await step(50);
 assert.notEqual(await page.evaluate(()=>window.pft.bubbles.cur?.kind),'stand','note must remain queued during the bounded settling wait');
 await page.evaluate(()=>{const c=window.pft.cam;c.tick=window.originalTick;c.snap();});
 await step(200);
 assert.equal(await page.evaluate(()=>window.pft.bubbles.cur?.kind),'stand','settled camera must activate the second note');
 console.log('queued mandatory note: waited through camera movement, activated after settlement');
 await page.evaluate(()=>{const p=window.pft;p.hand(false);p.slow=true;p.boilOn=undefined;p.bubbles.clear();});
 const before=await page.evaluate(()=>window.pft.stageStats.streak);
 await page.evaluate(()=>{const p=window.pft,s=p.s,x=s.soldiers.find(x=>x.alive&&x.owner===s.current);p.act({t:'flick',soldier:x.id,kind:'lunge',angle:0,length:180,bend:0,wob:0});});
 await idle(T,120000);
 const result=await page.evaluate(()=>({slow:window.pft.slow,boil:window.pft.boilOn,streak:window.pft.stageStats.streak}));
 assert.equal(result.slow,true);assert.equal(result.boil,false);assert.equal(result.streak,before,'slow lunge must not paint the optional smear');
 console.log('slow-device lunge',JSON.stringify(result));
}
