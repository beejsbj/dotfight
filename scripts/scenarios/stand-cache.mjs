// A later harmless shot on a real seeded last-stand page must preserve the
// existing survivors' ray canvases, both while ink runs and after it lands.
import assert from 'node:assert/strict';
import { idle } from '../lib/phone.mjs';
export default async function(T) {
 const {page}=T;
 const fixture=await page.evaluate(()=>{
  const p=window.pft;p.slow=false;p.boilOn=false;p.LIFE.bubbles=false;
  for(let turns=20;turns<=27;turns++){
   const r=p.fileWar(11,turns),s=p.unfile(r);
   if(s.phase==='play'&&s.stand.some(n=>n>0)&&!s.chain){r.mode={kind:'pnp'};p.resumeRecord(r);return {turn:turns,stand:s.stand};}
  }
  throw new Error('no eligible seeded last-stand fixture');
 });
 await idle(T,120000);
 const running=await page.evaluate(()=>{
  const p=window.pft;p.hand(true);p.renderNow();
  window.oldRays=new Map([...p.standRays].map(([id,l])=>[id,{canvas:l.c,key:l.key}]));
  const s=p.s,x=s.soldiers.find(x=>x.alive&&x.owner===s.current);
  p.act({t:'flick',soldier:x.id,kind:'snipe',angle:0,length:1,bend:0,wob:0});p.renderNow();
  return {res:!!p.res,stood:p.res?.o.stood,count:p.standRays.size,old:window.oldRays.size,
   retained:[...p.standRays].every(([id,l])=>window.oldRays.get(id)?.canvas===l.c&&window.oldRays.get(id)?.key===l.key)};
 });
 assert.ok(running.old>0);assert.equal(running.res,true);assert.deepEqual(running.stood,[]);
 assert.equal(running.count,running.old);assert.equal(running.retained,true);
 await page.evaluate(()=>{const p=window.pft;p.hand(false);p.speed=4;});await idle(T,120000);
 const after=await page.evaluate(()=>{const p=window.pft;p.renderNow();return {count:p.standRays.size,retained:[...window.oldRays].every(([id,old])=>p.standRays.get(id)?.c===old.canvas&&p.standRays.get(id)?.key===old.key)};});
 assert.equal(after.count,running.old);assert.equal(after.retained,true);
 console.log('established last-stand rays retained through later shot',JSON.stringify({fixture,running,after}));
}
