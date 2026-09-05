# Notice

The gallery's own code and text are MIT (see LICENSE). The database schemas it fetches at build
time belong to their projects and stay under their own licences. Nothing third-party is stored in
this repository; each schema is downloaded from the project's repository at the commit below and
the generated documentation reproduces its table and column names.

| Product | Upstream | Pinned at | Licence |
|---|---|---|---|
| Temporal | https://github.com/temporalio/temporal | v1.31.2 (19a77430) | MIT |
| Miniflux | https://github.com/miniflux/v2 | 2.3.3 (c4d54f87) | Apache-2.0 |
| Listmonk | https://github.com/knadh/listmonk | v6.2.0 (ef0a7587) | AGPL-3.0 |
| Matrix Synapse | https://github.com/element-hq/synapse | v1.160.0 (92fb8a06) | AGPL-3.0 |
| Sourcegraph | https://github.com/sourcegraph/sourcegraph-public-snapshot | c864f15a | Apache-2.0 (migrations directory) |
| Cal.com | https://github.com/calcom/cal.com | v6.2.0 (1c193cca) | AGPL-3.0 |
| GitLab CE | https://github.com/gitlabhq/gitlabhq | v19.3.1 (66850831) | MIT |

The reviewer that produced the documentation is
https://github.com/greenstevester/archlens-postgres (MIT), at the tag named in
`products.json`.
