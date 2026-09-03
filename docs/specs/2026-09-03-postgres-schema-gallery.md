# Spec: postgres-schema-gallery

Date: 2026-09-03
Status: decisions agreed in conversation with Steve (sibling repo, build-time fetch, live miniatures on the front page, an animated banner for the reviewer's README, seven products). Built directly from this spec on 2026-09-03; the first local build produced all seven cards and the banner. Two things learned while building are folded in below: release tags on GitHub can be annotated tag objects, so commits are resolved through the commits API rather than the ref, and Prisma's CamelCase table names need the prefix rule to split on the leading capitalised word.

## Goal

A public site where a developer sees the real PostgreSQL schemas behind well-known open-source products, each documented and reviewed by `db-architecture-review`, with a rotatable 3D explorer per product. The front page shows the schemas themselves: one live, slowly turning miniature per product, above the fold. The reviewer's own README carries an animated banner recorded from this site and links here.

## What the repository holds

Our code, our curation, and nothing third-party. Third-party schemas are fetched at build time from each project's repository at a pinned commit and never committed, so AGPL and GPL DDL never lands in an MIT repository and no generated megabytes pile up in history.

```
postgres-schema-gallery/
  README.md                       what this is, how to add a product, licence notes
  LICENSE                         MIT, for our code
  NOTICE.md                       one line per product: upstream, commit, licence
  products.json                   the manifest (below)
  products/<slug>/narratives.json our domains per product, where curated by hand
  build/
    fetch.ts                      fetch at pinned commits; derive SQL (concatenate, Go strings, Prisma)
    narratives.ts                 curated file, or domains generated from table-name prefixes
    review.ts                     run the reviewer as a library over each product
    site.ts                       write site/: per-product docs plus the front page
    banner.ts                     record the animated banner with Playwright and ffmpeg
    index.ts                      the pipeline: fetch → narratives → review → site → banner
  test/gallery.test.ts            node --test
  site/                           generated, gitignored, deployed to GitHub Pages
  .github/workflows/pages.yml     build and deploy on push to main and on demand
  docs/specs/                     this file
```

## The manifest

`products.json`:

```json
{
  "reviewer": { "repo": "greenstevester/db-architecture-reviewer", "tag": "v1.7.0" },
  "products": [
    {
      "slug": "temporal",
      "name": "Temporal",
      "homepage": "https://temporal.io",
      "repo": "temporalio/temporal",
      "commit": "19a774302c613da9adc4436ab14278ccdca8e0a5",
      "ref": "v1.31.2",
      "license": "MIT",
      "blurb": "Durable execution engine: workflow histories, task queues, namespaces, visibility.",
      "source": { "kind": "sql", "paths": ["schema/postgresql/v12/temporal/schema.sql", "schema/postgresql/v12/visibility/schema.sql"] },
      "domains": "curated"
    }
  ]
}
```

`source.kind` is one of:

- `sql`: the listed files, fetched raw at the commit and concatenated in order. Temporal, Listmonk, Matrix Synapse, Sourcegraph, GitLab.
- `go-raw-strings`: one Go file whose backtick strings hold the migrations. Every backtick string that starts with a SQL verb (`CREATE`, `ALTER`, `DROP`, `INSERT`, `UPDATE`, `DELETE`, `WITH`) is kept and terminated with a semicolon; the rest are Go, not SQL. Miniflux.
- `prisma`: one `schema.prisma`, turned into DDL with `prisma migrate diff --from-empty --to-schema-datamodel --script` at a pinned Prisma version, no database needed. Cal.com.

`domains` is `curated` when `products/<slug>/narratives.json` exists and is used as written, or `prefix` when the build generates one: tables are grouped by the leading token of their name (`ci_`, `merge_request_`, `vulnerability_`), tokens claiming a single table fall into a `misc` domain, and the front page labels the card "domains by table prefix" so nobody mistakes it for judgment. Every table is claimed either way, so the reviewer's `domain-coverage` gate passes and the explorer gets real islands rather than dependency depths.

## The seven products, as verified on 2026-09-03

| Product | Licence | Source | Pinned at | Tables | Foreign keys |
|---|---|---|---|---|---|
| Temporal | MIT | two `schema.sql` files | v1.31.2 | 38 | 0 (by design) |
| Miniflux | Apache-2.0 | `internal/database/migrations.go` | 2.3.3 | 17 | few |
| Listmonk | AGPL-3.0 | `schema.sql` | v6.2.0 | 16 | 19 |
| Matrix Synapse | AGPL-3.0 | `full_schemas/72` main and state, schema version 72 | v1.160.0 | 137 | 14 |
| Sourcegraph | Apache-2.0 (migrations dir) | `migrations/frontend/squashed.sql` | commit c864f15 of the public snapshot | 180 | 362 |
| Cal.com | AGPL-3.0 | `packages/prisma/schema.prisma` | v6.2.0 | 121 | 220 |
| GitLab CE | MIT | `db/structure.sql` from the `gitlabhq/gitlabhq` mirror | v19.3.1 | 1429 | 1861 |

GitLab is far past the explorer's 300-table comfort zone. It stays in as the stress test, labelled as such on its card, and its numbers are what will drive the arc-merging work the reviewer's spec deferred.

Temporal has no foreign keys at all (its tables key on shard and namespace by convention), and Synapse has almost none; both cards say so, because "no arcs" is a finding about the product, not a bug in the picture.

## The build

`node build/index.ts` (Node 24, no build step, TypeScript stripped at run time, like the reviewer):

1. **Fetch.** For each product, download the source files from `https://raw.githubusercontent.com/<repo>/<commit>/<path>` into `.cache/<slug>/`, skip when already present with the right commit, and derive `schema.sql` per `source.kind`. A fetch error fails the build with the product named.
2. **Reviewer.** `git clone --depth 1 --branch <tag>` of the reviewer into `.cache/reviewer/`, then `npm ci` in its skill folder. The build imports it as a library: `parseSchema`, `Reviewer`, `modelToJson`, `writeMarkdown`, `writeHtml`, `writeSchema3d`, `schema3dModel` from `scripts/db-review.ts`. Nothing is spawned; the model the front page needs comes from the same parse.
3. **Narratives.** Curated file or prefix-generated, written to `.cache/<slug>/narratives.json` so the outputs record what was used.
4. **Review.** Per product: parse, review, write `site/<slug>/` (the reviewer's usual files: `index.html`, `schema-3d.html`, `README.md`, `FINDINGS.md`, `schema.json`, `erd.svg`, `domains/`), and collect a card record: name, blurb, licence, upstream link to the commit, table, foreign-key and domain counts, finding counts, and a pruned model for the miniature (domains with key and colour, tables with name and domain, foreign keys with child and parent, hubs).
5. **Site.** `site/index.html`, self-contained like everything else: the reviewer's own Three.js bundle (via its exported `bundleThree()`) and layout module (`schema-3d-layout.js`, `export` stripped) inlined once, the card records as JSON, and the front-page app. `site/products.json` alongside for anyone who wants the numbers. `NOTICE.md` copied in as `site/NOTICE.md`.
6. **Banner.** With Playwright's Chromium (software WebGL) open `site/gitlab/schema-3d.html`, take 48 frames over four seconds of the idle rotation at 1200×500, and let ffmpeg turn them into `site/banner.gif` (palette-optimised) and `site/banner.webp`. Skipped with a message when Playwright or ffmpeg is missing locally; the workflow always has both.

`npm test` runs `test/gallery.test.ts`: the manifest validates (unique slugs, 40-character commits, known kinds, licence present); the Go-string extraction on a fixture keeps SQL and drops Go; prefix domains on a fixture claim every table and send singletons to `misc`; the site builder on a two-product fixture writes an `index.html` with two cards, no `src` or `href` to `http`, and a `products.json` whose numbers match. Fetching, Prisma and the banner are not unit-tested; the workflow is their test.

## The front page

Dark, one screen: a title, one sentence, and a grid of cards. Each card:

- A live miniature, 16:9, of that product's schema: islands on the reviewer's ring layout, slabs as one instanced mesh, arcs as one merged line geometry, no labels, a slow orbit. Cards render only while on screen (an `IntersectionObserver` pauses the rest), with one shared WebGL renderer drawing every visible card through scissor rectangles, so GitLab's 1,861 arcs and six other cards cost one context, not seven.
- Name, licence chip, blurb, a line naming the pinned ref with a link to the upstream commit, and the numbers: tables, foreign keys, domains (with "by table prefix" where generated), errors, warnings, notes.
- Two buttons: **Explore in 3D** → `<slug>/schema-3d.html`, **Docs & findings** → `<slug>/index.html`.
- GitLab's card carries the line "1,429 tables: the stress test".

Below the grid: how to add a product (a pull request touching `products.json` and, ideally, a `narratives.json`), the reviewer version, the build date, and the notice line about licences. Reduced motion stops the orbits. No WebGL shows the cards without miniatures and a sentence saying why.

## The reviewer's README

A separate, small pull request in `db-architecture-reviewer`: under the tagline, `[![Real schemas, rotatable](https://greenstevester.github.io/postgres-schema-gallery/banner.gif)](https://greenstevester.github.io/postgres-schema-gallery/)` with a one-line caption naming the products. The image is served from the gallery's Pages site, so the reviewer repo never carries the file and the banner refreshes whenever the gallery rebuilds.

## Deployment

`.github/workflows/pages.yml`: on push to `main` and `workflow_dispatch`. Steps: checkout, Node 24, `npm ci`, `npx playwright install --with-deps chromium`, `node build/index.ts`, upload `site/` as the Pages artifact, deploy. Pins are commits, so a rebuild without a manifest change produces the same site apart from the build date.

## Decisions taken

1. **Sibling repo, not this one.** The plugin install clones the marketplace repo; a gallery would bloat every install.
2. **Fetch at build time, commit nothing third-party.** Licence hygiene and repository weight.
3. **Live miniatures on the front page**, chosen over static thumbnails and a hover hybrid, with the shared-renderer and on-screen-only rules above so it stays light.
4. **Animated banner** for the reviewer's README, recorded by the gallery build, served from Pages.
5. **Reviewer used as a library, pinned by tag.** No npm publish; a clone at the tag is honest about exactly which reviewer produced the site.
6. **Prefix-generated domains are allowed and labelled.** Hand-curated narratives for Temporal, Miniflux and Listmonk in the first cut; the rest by prefix until someone curates them.
7. **GitLab stays in** as the labelled stress test.
8. **Version 0.1.0**, tag on first deploy.
