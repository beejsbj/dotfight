// Dawood-bot on a Web Worker: a long-war move is a few hundred previews, a
// visible hitch on a phone if it runs on the page's own thread. The worker
// just answers `botask.ts`'s questions; `botclient.ts` asks them.

import { answer, type BotAsk } from "./botask";

const me = self as unknown as Worker;
me.onmessage = (e: MessageEvent<BotAsk>) => me.postMessage(answer(e.data));
