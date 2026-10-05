import { expect, it } from "vitest";
import { exposures } from "./bot";
import { act, newGame, roadBetween } from "./game";
import { dist } from "./geom";
import { LONG, RULES } from "./rules";

it("prices the same enemy-turn road stops that the reducer exposes", () => {
  for (const road of [100, 400, 700]) for (const n of [1, 2, 3]) {
    const s = newGame({ name: "custom", bases: 2, soldiers: 12 }, 42, undefined, LONG);
    for (const [x,y] of [[200,1500],[200,200],[900,1100],[900,400]]) act(s,{t:"base",x,y,shape:"camp"});
    act(s,{t:"ready"}); act(s,{t:"ready"});
    const target = s.bases[2], dx = 200 + 2*RULES.baseRadius + 12 + road - target.x, dy = 1500-target.y;
    target.x += dx; target.y += dy;
    for (const m of s.soldiers.filter(x => x.home === 2)) { m.x += dx; m.y += dy; }
    act(s,{t:"send",from:0,to:2,n});
    act(s,{t:"stop"});
    const convoy = s.convoys[0], stops:number[] = [];
    for (let k=0; convoy.state === "road" && k<20; k++) {
      if (s.current !== convoy.owner) stops.push(convoy.at!);
      act(s,{t:"stop"});
    }
    expect(convoy.state).toBe("arrived");
    const [a,b] = roadBetween(s.bases[0],s.bases[2]);
    expect(exposures(dist(a,b),LONG.long!.sendPace,n)).toEqual(stops);
  }
});
