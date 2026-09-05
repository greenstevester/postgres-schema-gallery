<p align="center">
  <a href="https://greenstevester.github.io/postgres-schema-gallery/"><img src="https://greenstevester.github.io/postgres-schema-gallery/banner.gif" alt="Real PostgreSQL schemas turning in the 3D explorer: one island per domain, every foreign key an arc" width="800"></a>
</p>
<p align="center">
  <a href="https://greenstevester.github.io/postgres-schema-gallery/"><b>Open the gallery</b></a><br>
  <sub>Every schema as a live, slowly turning miniature. Click one for its full explorer and the reviewer's findings.</sub>
</p>

<table>
  <tr>
    <td align="center" width="25%">
      <a href="https://greenstevester.github.io/postgres-schema-gallery/temporal/schema-3d.html"><img src="https://greenstevester.github.io/postgres-schema-gallery/temporal/schema-map.svg" width="210" alt="Temporal schema map"></a><br>
      <a href="https://greenstevester.github.io/postgres-schema-gallery/temporal/schema-3d.html"><b>Temporal</b></a><br><sub>38 tables</sub>
    </td>
    <td align="center" width="25%">
      <a href="https://greenstevester.github.io/postgres-schema-gallery/miniflux/schema-3d.html"><img src="https://greenstevester.github.io/postgres-schema-gallery/miniflux/schema-map.svg" width="210" alt="Miniflux schema map"></a><br>
      <a href="https://greenstevester.github.io/postgres-schema-gallery/miniflux/schema-3d.html"><b>Miniflux</b></a><br><sub>16 tables</sub>
    </td>
    <td align="center" width="25%">
      <a href="https://greenstevester.github.io/postgres-schema-gallery/listmonk/schema-3d.html"><img src="https://greenstevester.github.io/postgres-schema-gallery/listmonk/schema-map.svg" width="210" alt="Listmonk schema map"></a><br>
      <a href="https://greenstevester.github.io/postgres-schema-gallery/listmonk/schema-3d.html"><b>Listmonk</b></a><br><sub>16 tables</sub>
    </td>
    <td align="center" width="25%">
      <a href="https://greenstevester.github.io/postgres-schema-gallery/synapse/schema-3d.html"><img src="https://greenstevester.github.io/postgres-schema-gallery/synapse/schema-map.svg" width="210" alt="Matrix Synapse schema map"></a><br>
      <a href="https://greenstevester.github.io/postgres-schema-gallery/synapse/schema-3d.html"><b>Matrix Synapse</b></a><br><sub>137 tables</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="25%">
      <a href="https://greenstevester.github.io/postgres-schema-gallery/sourcegraph/schema-3d.html"><img src="https://greenstevester.github.io/postgres-schema-gallery/sourcegraph/schema-map.svg" width="210" alt="Sourcegraph schema map"></a><br>
      <a href="https://greenstevester.github.io/postgres-schema-gallery/sourcegraph/schema-3d.html"><b>Sourcegraph</b></a><br><sub>180 tables</sub>
    </td>
    <td align="center" width="25%">
      <a href="https://greenstevester.github.io/postgres-schema-gallery/calcom/schema-3d.html"><img src="https://greenstevester.github.io/postgres-schema-gallery/calcom/schema-map.svg" width="210" alt="Cal.com schema map"></a><br>
      <a href="https://greenstevester.github.io/postgres-schema-gallery/calcom/schema-3d.html"><b>Cal.com</b></a><br><sub>121 tables</sub>
    </td>
    <td align="center" width="25%">
      <a href="https://greenstevester.github.io/postgres-schema-gallery/gitlab/schema-3d.html"><img src="https://greenstevester.github.io/postgres-schema-gallery/gitlab/schema-map.svg" width="210" alt="GitLab CE schema map"></a><br>
      <a href="https://greenstevester.github.io/postgres-schema-gallery/gitlab/schema-3d.html"><b>GitLab CE</b></a><br><sub>1,429 tables</sub>
    </td>
    <td align="center" width="25%"><sub>Each thumbnail is that product&#39;s schema map.<br>Click one to open its rotatable explorer.</sub></td>
  </tr>
</table>

# postgres-schema-gallery

The real PostgreSQL schemas behind well-known open-source products, documented and reviewed by
[ArchLens Postgres](https://github.com/greenstevester/archlens-postgres), each with a
rotatable 3D explorer.

**Repo:** https://github.com/greenstevester/postgres-schema-gallery

Seven products in the first cut: Temporal, Miniflux, Listmonk, Matrix Synapse, Sourcegraph,
Cal.com, and GitLab CE at 1,429 tables as the stress test. The front page shows every schema as
a live, slowly turning miniature; each card opens the full explorer and the docs with the
reviewer's findings.

## How it is built

Nothing third-party lives in this repository. `products.json` names each product's repository, a
pinned commit, the schema file, and its licence. On every push to `main` a workflow fetches those
files at those commits, derives plain SQL where needed (Go migration strings for Miniflux, a Prisma
schema for Cal.com), runs the reviewer as a library, writes one documentation folder per product,
records a three-second clip of each explorer turning plus the wide animated banner, renders the
front page, and deploys `site/` to GitHub Pages.

The front page draws its miniatures live with WebGL. A browser without WebGL gets each product's
recorded clip instead, with the flat schema map as its poster, plus a note saying where that
browser's WebGL switch is and that a private window (extensions off) is the quickest test.

Domains come from a hand-curated `products/<slug>/narratives.json` where one exists (Temporal,
Miniflux, Listmonk). Otherwise the build groups tables by name prefix and the card says
"domains by table prefix", so nobody mistakes it for judgment.

```bash
npm ci
npm test                          # manifest, extraction, prefix domains, front page
node build/index.ts               # full build into site/ (needs network; the banner needs ffmpeg and Playwright)
node build/index.ts --only temporal --no-banner
```

Node 24 or newer. The reviewer is cloned at the tag in `products.json` into `.cache/reviewer/`.

## Add a product

Open a pull request that adds an entry to `products.json`:

```json
{
  "slug": "example",
  "name": "Example",
  "homepage": "https://example.org",
  "repo": "owner/name",
  "commit": "<40-character sha>",
  "ref": "v1.2.3",
  "license": "MIT",
  "blurb": "One or two sentences on what the product is and anything notable about its schema.",
  "source": { "kind": "sql", "paths": ["db/schema.sql"] },
  "domains": "prefix"
}
```

`source.kind` is `sql` (files concatenated in order), `go-raw-strings` (one Go file whose
backtick strings hold the migrations), or `prisma` (one `schema.prisma`). If you can, add
`products/<slug>/narratives.json` with real domains and set `"domains": "curated"`; see the
Temporal one for the shape. PostgreSQL only.

## Licences

Gallery code and text: MIT. Each schema stays under its project's licence; `NOTICE.md` lists them.
