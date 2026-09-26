// The rulebook's one clock, so every animation (turning leaves, drawings
// drawing themselves) can be stepped frame by frame when it's being filmed.
export const clock = { now: () => performance.now() };
