<img src="docs/images/anahita-logo.svg" alt="Anahita" width="33%">

# Anahita MCP

Anahita's docs and API reference for AI agents: an
[MCP](https://modelcontextprotocol.io) server that runs on your computer.

[Anahita](https://www.anahita.io) is open-source social software that an
organisation runs for its own community: people, groups, events, articles,
photos, videos and custom feeds, in a chronological feed with no tracking. It
speaks ActivityPub (the fediverse) and the AT Protocol (Bluesky).

Add this server to Claude, Cursor, VS Code or any other MCP client, and
your agent can answer from the docs as they are today, not from what it
remembers: how to set up a site, how federation works, which route follows
a profile and what it answers.

- **Runs on your computer.** Your client starts it, and there is no account
  to make. Or add the hosted copy at `https://mcp.anahita.io/mcp`, with
  nothing to install.
- **Reads, and only reads.** Six tools, none of which changes anything.
- **Sends nothing.** It fetches two files from www.anahita.io, keeps them
  on your computer, and searches them there. Your questions never leave
  your machine through it. The hosted copy keeps nothing of them either.
- **Works offline** with what it fetched last.

## Setting it up

### With nothing to install

Anahita runs a copy at `https://mcp.anahita.io/mcp` (MCP's Streamable
HTTP), in Montreal. It keeps no record of the questions or of who asked.

| Client | How |
| --- | --- |
| Claude Code | `claude mcp add --transport http anahita https://mcp.anahita.io/mcp` |
| Claude Desktop and claude.ai | Settings › Connectors › Add custom connector, with the address |
| Cursor | `"anahita": { "url": "https://mcp.anahita.io/mcp" }` under `mcpServers` in `~/.cursor/mcp.json` |
| VS Code | `"anahita": { "type": "http", "url": "https://mcp.anahita.io/mcp" }` under `servers` in `.vscode/mcp.json` |

### On your computer

You need [Node.js](https://nodejs.org) 20 or later. Your client runs the
server with `npx`, which fetches it from
[npm](https://www.npmjs.com/package/anahita-mcp) the first time.

#### Claude Code

```sh
claude mcp add anahita -- npx -y anahita-mcp
```

#### Claude Desktop

In Settings › Developer › Edit Config, add it to
`claude_desktop_config.json`, then restart Claude:

```json
{
  "mcpServers": {
    "anahita": {
      "command": "npx",
      "args": ["-y", "anahita-mcp"]
    }
  }
}
```

#### Cursor

In `~/.cursor/mcp.json`, or `.cursor/mcp.json` in a project:

```json
{
  "mcpServers": {
    "anahita": {
      "command": "npx",
      "args": ["-y", "anahita-mcp"]
    }
  }
}
```

#### VS Code

In `.vscode/mcp.json` in a project, or with **MCP: Add Server** from the
command palette:

```json
{
  "servers": {
    "anahita": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "anahita-mcp"]
    }
  }
}
```

#### Any other client

The server speaks MCP over standard input and output. The command is
`npx -y anahita-mcp`. To run what is on `main` before it is published,
`npx -y github:anahitasocial/anahita-mcp`.

Then ask your agent something like *"How does Anahita decide what an old
post is worth?"* or *"Which API route lets a person follow a group, and what
does it send back?"*

## The tools

| Tool | Answers |
| --- | --- |
| `search_docs(query, source?, limit?)` | The sections of the docs that match, best first, each with the page and section to read and a few lines of it |
| `list_docs(source?)` | Every page, in its groups, with its sections |
| `read_doc(page, section?)` | A page as Markdown, or one section with those under it |
| `list_endpoints(service?, query?)` | The API's services in their groups; one service's routes; or the routes that match some words |
| `read_endpoint(method, path)` | One route in full: who may call it, its parameters and body, and every answer. The path as the reference has it (`/actors/{alias}`) or as it is called (`/actors/ana`) |
| `read_shape(name)` | One shape the API takes or answers with, and its fields |

`source` is `services` for [Anahita Services](https://github.com/anahitasocial/anahita-services),
the Go services and their API, or `web` for
[Anahita Web](https://github.com/anahitasocial/anahita-web), the web app.
A page is named by both, `services/the-graph`; `services` alone is its
overview. Every answer gives the www.anahita.io address of what it read.

## What it reads

| File | What it holds |
| --- | --- |
| [`www.anahita.io/docs/index.json`](https://www.anahita.io/docs/index.json) | Every page of the docs, cut into sections, written when the website is built |
| [`www.anahita.io/api/anahita.json`](https://www.anahita.io/api/anahita.json) | The API reference, OpenAPI 3.1, made from the services' code |

The website writes them on every change to it and every night, from the
docs of both repositories as they are on `main`, so they are a day behind
at most. The server fetches them when a tool first needs them, and again an
hour later only if they have changed. The copies are kept in the cache folder of your
system: `~/Library/Caches/anahita-mcp` on macOS, `~/.cache/anahita-mcp` on
Linux, `%LOCALAPPDATA%\anahita-mcp\Cache` on Windows. Search is by words,
in the server, with no embeddings and no outside service.

### Settings

| Variable | What it changes | Default |
| --- | --- | --- |
| `ANAHITA_SITE` | The website the two files are read from: a local build of anahita.io, say | `https://www.anahita.io` |
| `ANAHITA_MCP_CACHE` | The folder the copies are kept in | your system's cache folder, as above |

## Hosting your own

`npx -y anahita-mcp --http` answers over HTTP at `/mcp` instead, for a copy
people add by its address with nothing to install. [Hosting it](docs/hosting.md)
says how, on any server or on AWS Lambda with `deploy/`.

## Working on it

Changing the code, as a person or with an agent: begin with
[AGENTS.md](AGENTS.md), the project's working rules.

```sh
npm install
npm test      # builds, then runs the tests in test/
npm run build # dist/
```

TypeScript, on the official
[MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).

| File | What it does |
| --- | --- |
| `src/index.ts` | Starts the server on standard input and output |
| `src/server.ts` | The six tools, and what the agent is told about them |
| `src/store.ts` | Fetches the two files and keeps them |
| `src/docs.ts` | The docs tools' answers |
| `src/api.ts` | The API tools' answers |
| `src/search.ts` | Search by words (BM25) |
| `src/http.ts` | The server over HTTP, for a hosted copy, and `--http` |
| `src/lambda.ts` | The hosted copy on AWS Lambda |
| `deploy/` | The AWS templates and the script that deploys them |

To try it against the docs as you write them, build
[anahita.io](https://github.com/anahitasocial/anahita.io) (`yarn build`),
serve its `out/` folder, and set `ANAHITA_SITE` to where it is served. The
tests use a few real pages and routes, in `test/fixtures/`.

## Licence

[MIT](LICENSE). Anahita Services is under the GNU AGPL-3.0 and Anahita Web
under MIT: see [Licensing](https://www.anahita.io/docs/services/licensing/).

Copyright © 2026 Rastin Mehr Design Studio Inc. (rmd studio). Anahita is a
registered trademark of Rastin Mehr Design Studio Inc. in Canada.

## Credits

Anahita is developed and maintained by [rmd studio](https://www.rmdstudio.com),
a software development company in Vancouver, Canada. Founder and core
architect: Rastin Mehr.
