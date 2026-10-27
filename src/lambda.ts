// The hosted copy on AWS Lambda, behind an API Gateway HTTP API (payload
// format 2.0):
// each invocation is turned into a web request for http.ts, and its answer
// back. Deployed with deploy/aws.yaml; see docs/hosting.md.
import { handler as web } from './http.js';
import { Store } from './store.js';

interface UrlEvent {
  rawPath: string;
  rawQueryString?: string;
  headers?: Record<string, string>;
  body?: string;
  isBase64Encoded?: boolean;
  requestContext: { http: { method: string }; domainName: string };
}

// Kept between invocations while the function is warm, and on disk in /tmp,
// the one folder Lambda lets a function write.
const handle = web(new Store({ folder: process.env.ANAHITA_MCP_CACHE || '/tmp/anahita-mcp' }));

export async function handler(event: UrlEvent) {
  const method = event.requestContext.http.method;
  const headers = event.headers || {};
  // The address people use (PUBLIC_ORIGIN), whatever answered for it.
  const origin = process.env.PUBLIC_ORIGIN || `https://${event.requestContext.domainName}`;
  const query = event.rawQueryString ? `?${event.rawQueryString}` : '';
  const body = event.body === undefined || method === 'GET' || method === 'HEAD' ? undefined : event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body;
  const answer = await handle(new Request(`${origin}${event.rawPath}${query}`, { method, headers, body }));
  return {
    statusCode: answer.status,
    headers: Object.fromEntries(answer.headers),
    body: await answer.text(),
  };
}
