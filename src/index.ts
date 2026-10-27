#!/usr/bin/env node
// anahita-mcp: Anahita's docs and API reference for AI agents, over the Model
// Context Protocol, on standard input and output. An MCP client starts it;
// see README.md. With --http it answers over HTTP at /mcp instead, for a
// copy others reach without installing anything.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { listen } from './http.js';
import { createServer, VERSION } from './server.js';

if (process.argv.includes('--version')) {
  console.log(VERSION);
  process.exit(0);
}

if (process.argv.includes('--http')) {
  listen();
} else {
  await createServer().connect(new StdioServerTransport());
}
