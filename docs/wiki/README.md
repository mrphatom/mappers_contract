# Mappers Protocol Documentation (`docs/wiki/`)

This directory is the **tracked, version-controlled source of truth** for the Mappers Protocol wiki. The pages are reviewed with repository changes and synchronized to the GitHub Wiki by `.github/workflows/wiki-sync.yml` after changes land on `main`.

## Pages

| File                                           | Purpose                                                                       |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| [`Home.md`](Home.md)                           | Protocol overview, current component status, and roadmap                      |
| [`Architecture.md`](Architecture.md)           | System design, PDA architecture, state machine, and security model            |
| [`Getting-Started.md`](Getting-Started.md)     | Prerequisites, workspace setup, services, and validation commands             |
| [`SDK-Reference.md`](SDK-Reference.md)         | SDK classes, types, PDA helpers, and usage examples                           |
| [`API-Reference.md`](API-Reference.md)         | REST endpoints and request/response conventions                               |
| [`Dashboard.md`](Dashboard.md)                 | Frontend features and development guidance                                    |
| [`Development-Guide.md`](Development-Guide.md) | Workspace workflow, code generation, database, Anchor, and Oracle development |
| [`Release-Notes.md`](Release-Notes.md)         | Release history and v0.1.0 baseline                                           |
| [`Glossary.md`](Glossary.md)                   | Protocol terms, accounts, roles, states, and error codes                      |
| [`_Sidebar.md`](_Sidebar.md)                   | GitHub Wiki navigation                                                        |
| [`_Footer.md`](_Footer.md)                     | GitHub Wiki footer                                                            |

## Publishing to GitHub Wiki

The filenames follow GitHub Wiki conventions: `Home.md` is the landing page, `_Sidebar.md` and `_Footer.md` are special files, and page names use hyphens. The sync workflow copies only the contents of `docs/wiki/` into the repository wiki, so unrelated repository documentation is not published as wiki pages.

The workflow requires the repository Wiki to have been initialized once from GitHub’s **Wiki** tab. For a manual recovery or first-time setup:

```bash
git clone https://github.com/mrphatom/mappers_contract.wiki.git
cp docs/wiki/*.md mappers_contract.wiki/
cd mappers_contract.wiki
git add .
git commit -m "Sync wiki from docs/wiki/"
git push
```

Update pages in `docs/wiki/` first. The GitHub Wiki is a downstream publication of those tracked files.
