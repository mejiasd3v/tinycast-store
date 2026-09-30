import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

/**
 * tinycast.store is a static site on Cloudflare Workers Static Assets. There is no backend:
 * the build fetches the extension index from GitHub and bakes it into `registry.json`.
 * A scheduled workflow redeploys to keep that index fresh (see .github/workflows/deploy.yml).
 */
export default Alchemy.Stack(
  "TinycastStore",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;

    const site = yield* Cloudflare.Website.StaticSite("Web", {
      // Builds the index, packages the Store extension zip, then the site.
      command: "pnpm build",
      outdir: "apps/web/dist",
      // The build reads live GitHub data, so an unchanged source tree still needs a rebuild.
      memo: false,
      // Only production takes the real domain. It must already be a zone in this Cloudflare account.
      domain: stage === "prod" ? "tinycast.store" : undefined,
      dev: { command: "pnpm dev" },
    });

    return { url: site.url };
  }),
);
