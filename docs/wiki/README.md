# Mappers Protocol Documentation (`docs/wiki/`)

This directory is the **tracked, version-controlled source of truth** for the Mappers Protocol wiki. The content is derived from and kept aligned with the repository's [`README.md`](../../README.md) and [`mappers_whitepaper.md`](../../mappers_whitepaper.md).

Keeping the wiki here (instead of relying solely on the GitHub Wiki UI) means the documentation is reviewed via pull requests, versioned alongside the code, and never silently drifts from the protocol it describes.

## Pages

| File | Purpose |
|---|---|
| [`Home.md`](Home.md) | Overview — what Mappers is and the problems it solves |
| [`Architecture.md`](Architecture.md) | The three protocol layers, PDA design, state machine, security model |
| [`Getting-Started.md`](Getting-Started.md) | Prerequisites, tests, oracle setup, API reference |
| [`Glossary.md`](Glossary.md) | Definitions of every term, account, role, state, and error code |
| `_Sidebar.md` | Navigation sidebar (rendered by the GitHub Wiki) |
| `_Footer.md` | Footer (rendered by the GitHub Wiki) |

## Wiki-Exportable Structure

The filenames in this directory follow GitHub Wiki conventions (`Home.md` is the wiki landing page; `_Sidebar.md` / `_Footer.md` are special wiki files; page names use hyphens). This makes the directory directly pushable to the project's separate wiki repository.

To publish these pages to the GitHub Wiki (the wiki must be initialized once via the repo's **Wiki** tab):

```bash
# From the repository root
git clone https://github.com/mrphatom/mappers_contract.wiki.git
cp docs/wiki/*.md mappers_contract.wiki/
cd mappers_contract.wiki
git add .
git commit -m "Sync wiki from docs/wiki/"
git push
```

> Within the GitHub Wiki, page links resolve by page name (e.g. `[Architecture](Architecture)`); the `.md` links used in these files also resolve correctly both in the normal repository file browser and in the wiki. Update the pages here in `docs/wiki/` first, then re-run the sync above so the wiki stays the downstream copy.
