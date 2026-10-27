# Working on anahita-mcp

Anahita's MCP server: Anahita's docs and API reference for AI agents, run on
the computer of whoever uses it. TypeScript on the official MCP SDK. This
file is for anybody changing it, a person or an agent.

- Website: <https://www.anahita.io>
- Founder & Core Architect: Rastin Mehr
- Maintained and developed by rmd studio, <https://www.rmdstudio.com>

## Where to begin

| To learn | Read |
| --- | --- |
| What it does, how it is set up, and its files | [`README.md`](README.md) |
| Why it exists, and what it was chosen over | anahita-services' `docs/plans/done/docs-for-agents.md` |
| What it reads | anahita.io's `src/app/docs/index.json/route.js` and `src/lib/docs.js` (`getDocSections`), and anahita-services' `docs/api/` |

## Rules

1. **It only reads.** Every tool is read-only, and nothing reaches a
   database, a running site or anything that changes something.
2. **It sends nothing.** The only requests it makes are for the two files
   on the website it reads. No telemetry, no outside search, no embeddings
   service. Search stays in the program.
3. **One set of docs.** It serves the docs of anahita-services and
   anahita-web as the website has them; it holds none of its own. What an
   answer says wrong is fixed in those docs, not here.
4. **The index is the website's.** A change to the shape of
   `/docs/index.json` is made in anahita.io and here together, and
   `version` in it goes up when an old server could no longer read it.
5. The wording, the docs and the commit rules are anahita-web's (`AGENTS.md`
   there): "people", never "users"; "profile", not "account" or "actor"; a
   group has followers. A commit message is a short subject line, a blank
   line, then one line per change beginning `- added:`, `- changed:`,
   `- removed:`, `- fixed:` or `- note:`.
6. `npm test` passes before every commit. A new tool comes with a test, and
   with its row in the README's table.
