// Flowing the rules onto pages. The book is a tree: boxes (sections, lists) that
// may break across a page, and atoms (paragraphs, drawings, headings) that may
// not. Whatever doesn't fit carries on overleaf; a heading never sits alone at
// the foot of a page; something too big for any page is shrunk onto one.
//
// The flow asks a Sink whether things fit. In the browser the Sink lays real
// elements onto real pages and measures them; in tests it adds up heights.

export interface Atom<T> { kind: "atom"; ref: T; heading?: boolean }
export interface Box<T> { kind: "box"; ref: T; kids: Item<T>[] }
export type Item<T> = Atom<T> | Box<T>;

export interface Sink<T> {
  /** Put the whole item on this page if it fits; otherwise put nothing and say no. */
  fits(item: Item<T>): boolean;
  /** Begin a box here (or its continuation), for its children to go into. */
  open(box: Box<T>): void;
  close(): void;
  /** Put an item that fits on no page, shrunk to fit this empty one. */
  squeeze(item: Item<T>): void;
  /** Turn over: a fresh page, with every open box continued on it. */
  newPage(): void;
  /** Nothing placed on this page yet (continued boxes don't count). */
  empty(): boolean;
  mark(): unknown;
  rollback(mark: unknown): void;
}

export function paginate<T>(items: Item<T>[], sink: Sink<T>) {
  for (const it of items) place(it, sink);
}

function place<T>(it: Item<T>, sink: Sink<T>): void {
  if (sink.fits(it)) return;
  if (it.kind === "box" && it.kids.length) {
    // Break it here only if its start (a heading and what follows it) fits;
    // otherwise the whole box starts overleaf.
    if (!sink.empty() && !startFits(it, sink)) {
      sink.newPage();
      return place(it, sink);
    }
    sink.open(it);
    for (const k of it.kids) place(k, sink);
    sink.close();
    return;
  }
  if (sink.empty()) return sink.squeeze(it);
  sink.newPage();
  place(it, sink);
}

function startFits<T>(box: Box<T>, sink: Sink<T>): boolean {
  const m = sink.mark();
  const ok = start(box, sink);
  sink.rollback(m);
  return ok;
}

function start<T>(box: Box<T>, sink: Sink<T>): boolean {
  sink.open(box);
  const [a, b] = box.kids;
  if (a.kind === "box") return start(a, sink);
  if (!sink.fits(a)) return false;
  if (a.heading && b) return b.kind === "box" ? start(b, sink) : sink.fits(b);
  return true;
}

// --- a Sink that adds up heights, for tests and for thinking with ----------------

export interface Sized { id: string; h: number; pad?: number }

/** Pages as lists of what's on them: atoms by id, "id>" where a box opens and
 *  "id+>" where it continues, "id~" for an atom squeezed to fit. */
export class HeightSink implements Sink<Sized> {
  pages: string[][] = [[]];
  private y = 0;
  private count = 0;
  private stack: Box<Sized>[] = [];
  private started = new Set<string>();
  constructor(private height: number, private contPad = 0) {}

  private size(it: Item<Sized>): number {
    if (it.kind === "atom") return it.ref.h;
    return (this.started.has(it.ref.id) ? this.contPad : it.ref.pad ?? 0) + it.kids.reduce((s, k) => s + this.size(k), 0);
  }
  private list(it: Item<Sized>): string[] {
    if (it.kind === "atom") return [it.ref.id];
    return [`${it.ref.id}>`, ...it.kids.flatMap((k) => this.list(k))];
  }
  fits(it: Item<Sized>) {
    const h = this.size(it);
    if (this.y + h > this.height + 1e-9) return false;
    this.y += h;
    this.count++;
    this.pages[this.pages.length - 1].push(...this.list(it));
    return true;
  }
  open(box: Box<Sized>) {
    const again = this.started.has(box.ref.id);
    this.y += again ? this.contPad : box.ref.pad ?? 0;
    this.pages[this.pages.length - 1].push(`${box.ref.id}${again ? "+" : ""}>`);
    this.started.add(box.ref.id);
    this.stack.push(box);
  }
  close() { this.stack.pop(); }
  squeeze(it: Item<Sized>) {
    this.pages[this.pages.length - 1].push(`${it.ref.id}~`);
    this.y = this.height;
    this.count++;
  }
  newPage() {
    this.pages.push([]);
    this.y = 0;
    this.count = 0;
    for (const b of this.stack) { this.y += this.contPad; this.pages[this.pages.length - 1].push(`${b.ref.id}+>`); }
  }
  empty() { return this.count === 0; }
  mark() { return { pages: this.pages.map((p) => [...p]), y: this.y, count: this.count, stack: [...this.stack], started: new Set(this.started) }; }
  rollback(m: unknown) {
    const s = m as ReturnType<HeightSink["mark"]>;
    this.pages = s.pages; this.y = s.y; this.count = s.count; this.stack = s.stack; this.started = s.started;
  }
}
