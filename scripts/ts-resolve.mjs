// Lets plain `node` run the engine's TypeScript: Node strips the types
// itself; this only adds the ".ts" the source's bare imports leave off.
import { registerHooks } from "node:module";

registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx);
    } catch (e) {
      if ((spec.startsWith("./") || spec.startsWith("../")) && !/\.[cm]?[jt]s$/.test(spec)) return next(`${spec}.ts`, ctx);
      throw e;
    }
  },
});
