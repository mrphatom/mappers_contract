# Mappers Protocol Documentation (`docs/wiki/`)

This directory is the **tracked, version-controlled source of truth** for the Mappers Protocol wiki. The content is kept aligned with the codebase, reviewed via pull requests, and versioned alongside the code.

## Pages

| File | Purpose |
|---|---|
| [`Home.md`](Home.md) | Overview — what Mappers is, why it exists, current state |
| [`Architecture.md`](Architecture.md) | System design — all five layers, PDA architecture, security model |
| [`Getting-Started.md`](Getting-Started.md) | Full setup guide — prerequisites, running every service |
| [`SDK-Reference.md`](SDK-Reference.md) | SDK documentation — MappersClient, OracleClient, types |
| [`API-Reference.md`](API-Reference.md) | REST API documentation — all endpoints, request/response shapes |
| [`Dashboard.md`](Dashboard.md) | Frontend guide — features, architecture, development tips |
| [`Development-Guide.md`](Development-Guide.md) | Contributing — workspace workflow, code generation, conventions |
| [`Glossary.md`](Glossary.md) | Definitions — every term, account, role, state, and error code |
| `_Sidebar.md` | Navigation sidebar (rendered by GitHub Wiki) |
| `_Footer.md` | Footer (rendered by GitHub Wiki) |

## Publishing to GitHub Wiki

The filenames follow GitHub Wiki conventions (`Home.md` is the landing page; `_Sidebar.md` / `_Footer.md` are special files; page names use hyphens). This makes the directory directly pushable to the project's wiki repository.

To publish (the wiki must be initialized once via the repo's **Wiki** tab):

```bash
git clone https://github.com/mrphatom/mappers_contract.wiki.git
cp docs/wiki/*.md mappers_contract.wiki/
cd mappers_contract.wiki
git add .
git commit -m "Sync wiki from docs/wiki/"
git push
```

Update pages here in `docs/wiki/` first, then re-run the sync so the wiki stays the downstream copy.
