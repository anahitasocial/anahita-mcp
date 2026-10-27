#!/usr/bin/env node
// anahita-mcp: Anahita's docs and API reference for AI agents, over the Model
// Context Protocol, on standard input and output. An MCP client starts it;
// see README.md.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer, VERSION } from './server.js';

if (process.argv.includes('--version')) {
  console.log(VERSION);
  process.exit(0);
}

await createServer().connect(new StdioServerTransport());
