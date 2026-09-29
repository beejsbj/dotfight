# Motion aiming: trying it on a phone

An experiment (BJS-459), off by default. Touch aiming works as before whatever you switch on. The sensors only shape a flick's angle, power and wobble; the flick is recorded like any other, so replays and room links never see a sensor.

## Getting it onto the phone

Browsers only give motion sensors to secure (https) pages. `npm run phone` serves plain http over Tailscale, so the sensors stay silent there and the settings won't offer the levels. Use one of these:

- the PR's Vercel preview (sign in to Vercel on the phone first), or
- `npm run phone`, then in Android Chrome open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, add `http://100.88.219.36:5173`, and relaunch Chrome.

Then open **settings** on the cover. The **aim with the phone** section appears once the phone has sent a reading. If your phone is set to reduce motion, it appears as a single "aim with the phone…" row: tap it to show the levels. iOS asks for permission when you switch the first level on.

Each level has its own **soft / normal / keen** sensitivity.

## The three levels

**Tilt to fine-tune.** Pull back as usual, then, keeping your thumb down, tip the phone's right edge down a little. The aim swings clockwise by a few degrees (about 5° for a 14° tilt at normal, capped at 7°), and the pen leans a little that way. Whatever angle you're holding the phone at when the pull starts counts as level.

**Steady hand.** Hold a hard pull for over half a second and the pen starts to wobble, as it always has. With this level on, the gyro sets how much: rest the phone on the table and the wobble drops to a quarter of today's, and a shaking hand gets up to 2.5 times as much.

**Pen falcon.** Tap a soldier (or tap him again once he's picked up). The phone is now the gun, and straight ahead is up the screen from wherever it's pointing.
1. Raise the phone and point it. Turning it left or right swings the aim, and twisting your wrist swings it a little too.
2. Hold still. A faint pencil ring sits out along the aim, and while you hold still it's pressed in. When it closes it gets cross hairs, and the phone ticks if haptics are on: you're armed.
3. Flick your wrist, or give the phone a shake. The shot goes where the ring was before the flick, and a harder flick means a longer shot.

To stop, lower the phone slowly (tip it down about 40° below where you held it up), or touch the screen. A touch that pulls back still aims by thumb.

## What to find out

- Does the nudge help, or does it get in the way? Is 5° the right amount? Try soft and keen.
- Steady hand: is the difference between resting your elbow and holding the phone loosely something you can feel? The tuning assumes an ordinary held phone shakes at about 6°/s. Nobody has measured that on a real phone.
- Pen falcon:
  - Does raising the phone ever fire by accident?
  - Does a natural flick fire? It needs a 220°/s snap at normal.
  - Does the shot go where the ring was?
  - Does lowering the phone end it when you mean it to, and only then?
  - Is it fun?
- Is anything janky while the phone is moving, such as the frame rate or the pen jittering?

Write down what felt good and what didn't on BJS-459. The tuning numbers live in `NUDGE`, `STEADY` and `GUN` in `src/motion.ts`.

The headless playtest (`node scripts/playtest.mjs motion-aiming <devurl> <out>`) drives all three levels through simulated sensor events. It proves the wiring, not the feel. Its clips are in `docs/shots/motion-aim/`.
