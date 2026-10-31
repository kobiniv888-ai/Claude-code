/**
 * tsx runs the seed and scripts/demo-remove.ts as CommonJS (package.json has no "type": "module"),
 * but a few dependencies only export an ES module under the "import" condition (@hebcal/core,
 * used by @/lib/settings). Node 22.12+ can require() ES modules once they resolve, so this hook
 * adds the "import" condition when those packages are required. Import it before anything else.
 */
import nodeModule from "node:module";

const ESM_ONLY_PACKAGES = new Set(["@hebcal/core"]);

type ResolveContext = { conditions?: readonly string[] } & Record<string, unknown>;
type ResolveHook = (
  specifier: string,
  context: ResolveContext,
  nextResolve: (specifier: string, context?: ResolveContext) => unknown,
) => unknown;
type RegisterHooks = (hooks: { resolve: ResolveHook }) => unknown;

const registerHooks = (nodeModule as unknown as { registerHooks?: RegisterHooks }).registerHooks;

if (registerHooks) {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (!ESM_ONLY_PACKAGES.has(specifier)) return nextResolve(specifier, context);
      const conditions = [...(context.conditions ?? []), "import"];
      return nextResolve(specifier, { ...context, conditions });
    },
  });
}
