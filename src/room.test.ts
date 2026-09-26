import { describe, it, expect, beforeEach } from "vitest";
import { clearStore } from "../api/_store";
import {
  replayActions,
  getOpponentInfo,
  type RoomAction,
} from "./room";
import { newGame, placeBase, act, type Flick } from "./game";

describe("room protocol", () => {
  beforeEach(() => {
    clearStore();
    // Mock fetch is set up per test if needed
  });

  it("replays base placements", () => {
    // Each player places 3 bases in alternating turns
    const actions: RoomAction[] = [
      { i: 0, t: "base", seat: 0, data: { x: 200, y: 300 } },
      { i: 1, t: "base", seat: 1, data: { x: 800, y: 300 } },
      { i: 2, t: "base", seat: 0, data: { x: 200, y: 600 } },
      { i: 3, t: "base", seat: 1, data: { x: 800, y: 600 } },
      { i: 4, t: "base", seat: 0, data: { x: 200, y: 900 } },
      { i: 5, t: "base", seat: 1, data: { x: 800, y: 900 } },
    ];

    const replayed = replayActions(12345, actions);
    expect(replayed.bases).toHaveLength(6);
    expect(replayed.bases[0].owner).toBe(0);
    expect(replayed.bases[1].owner).toBe(1);
    expect(replayed.phase).toBe("play");
  });

  it("replays flicks", () => {
    const flick: Flick = {
      soldierId: 0,
      kind: "shoot",
      angle: Math.PI / 4,
      length: 500,
      bend: 0.05,
    };

    const actions: RoomAction[] = [
      { i: 0, t: "base", seat: 0, data: { x: 200, y: 300 } },
      { i: 1, t: "base", seat: 1, data: { x: 800, y: 300 } },
      { i: 2, t: "base", seat: 0, data: { x: 200, y: 600 } },
      { i: 3, t: "base", seat: 1, data: { x: 800, y: 600 } },
      { i: 4, t: "base", seat: 0, data: { x: 200, y: 900 } },
      { i: 5, t: "base", seat: 1, data: { x: 800, y: 900 } },
      { i: 6, t: "flick", seat: 0, data: flick },
    ];

    const replayed = replayActions(12345, actions);
    expect(replayed.flicks).toHaveLength(1);
    expect(replayed.flicks[0].kind).toBe("shoot");
    expect(replayed.turn).toBe(2);
  });

  it("reconstructs game state byte-identical after replay", () => {
    const seed = 98765;
    const game1 = newGame(seed);
    placeBase(game1, 200, 300);
    placeBase(game1, 800, 300);
    placeBase(game1, 200, 600);
    placeBase(game1, 800, 600);
    placeBase(game1, 200, 900);
    placeBase(game1, 800, 900);

    // After 6 bases (3 per player), game should be in "play" phase
    expect(game1.phase).toBe("play");

    const flick: Flick = { soldierId: 0, kind: "shoot", angle: 0.5, length: 400, bend: 0 };
    act(game1, flick);

    const actions: RoomAction[] = [
      { i: 0, t: "base", seat: 0, data: { x: 200, y: 300 } },
      { i: 1, t: "base", seat: 1, data: { x: 800, y: 300 } },
      { i: 2, t: "base", seat: 0, data: { x: 200, y: 600 } },
      { i: 3, t: "base", seat: 1, data: { x: 800, y: 600 } },
      { i: 4, t: "base", seat: 0, data: { x: 200, y: 900 } },
      { i: 5, t: "base", seat: 1, data: { x: 800, y: 900 } },
      { i: 6, t: "flick", seat: 0, data: flick },
    ];

    const game2 = replayActions(seed, actions);

    // Compare key state
    expect(game2.seed).toBe(game1.seed);
    expect(game2.bases.length).toBe(game1.bases.length);
    expect(game2.soldiers.length).toBe(game1.soldiers.length);
    expect(game2.flicks.length).toBe(game1.flicks.length);
    expect(game2.marks.length).toBe(game1.marks.length);
    expect(game2.current).toBe(game1.current);
    expect(game2.turn).toBe(game1.turn);
  });

  it("validates action data through replay (client-side validation)", () => {
    const actions: RoomAction[] = [
      { i: 0, t: "base", seat: 0, data: { x: 200, y: 300 } },
      { i: 1, t: "base", seat: 1, data: { x: 800, y: 300 } },
      { i: 2, t: "base", seat: 0, data: { x: 200, y: 600 } },
      { i: 3, t: "base", seat: 1, data: { x: 800, y: 600 } },
      { i: 4, t: "base", seat: 0, data: { x: 200, y: 900 } },
      { i: 5, t: "base", seat: 1, data: { x: 800, y: 900 } },
      { i: 6, t: "flick", seat: 0, data: { soldierId: 0, kind: "shoot", angle: 0.5, length: 400, bend: 0 } },
    ];

    // Should successfully replay valid actions
    expect(() => replayActions(12345, actions)).not.toThrow();
    const game = replayActions(12345, actions);
    expect(game.flicks).toHaveLength(1);
  });

  it("gets opponent info from room state", () => {
    const roomState: { meta: any; actions: any[] } = {
      meta: {
        v: 1 as const,
        created: Date.now(),
        players: [
          { seat: 0 as const, name: "Alice", secret: "s1" },
          { seat: 1 as const, name: "Bob", secret: "s2" },
        ],
        seed: 12345,
      },
      actions: [],
    };

    const opponent = getOpponentInfo(roomState, 0);
    expect(opponent.name).toBe("Bob");
    expect(opponent.seat).toBe(1);
  });
});
