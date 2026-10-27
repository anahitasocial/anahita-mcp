# Hosting it

The server also answers over HTTP, MCP's Streamable HTTP at `/mcp`, so that
people can add it to their client by its address with nothing to install.
Anybody can host a copy: for their own docs site, or Anahita's.

Each request stands alone. There are no sessions, every answer is JSON, and
what was fetched from the site is shared between requests. Nothing about a
request is kept or logged: not the question, and not who asked.

| Path | Answers |
| --- | --- |
| `POST /mcp` | MCP |
| `GET /` | A line on what it is, and where to add it |
| Anything else | 404; `GET /mcp` is 405, as there is no stream to open |

A request body over 64 KB is refused (413).

## On any server

```sh
npx -y anahita-mcp --http
```

It listens on `127.0.0.1:8080`. Set `HOST` and `PORT` to change that, and
put it behind whatever gives your address HTTPS. `ANAHITA_SITE` and
`ANAHITA_MCP_CACHE` work as they do on a computer ([Settings](../README.md#settings)).

## On AWS

[`deploy/`](../deploy/) puts it on AWS Lambda, behind an API Gateway HTTP API
with its own address and certificate, all in one region. At a few thousand
questions a day it costs pennies a month: the HTTP API is $1 a million
requests, and the function stays inside Lambda's free tier.

| Part | What it is |
| --- | --- |
| `deploy/aws.yaml` | The certificate (ACM adds the record that proves the domain to the Route 53 zone itself), the function (Node.js 22, arm64, 512 MB), the HTTP API, and the address's A and AAAA records |
| `deploy/deploy.sh` | Tests and bundles the server (`npm run bundle`, one file made by esbuild), deploys the stack, then puts the code in the function |

```sh
AWS_PROFILE=<profile> REGION=<region> DOMAIN=mcp.example.org \
  HOSTED_ZONE_ID=<zone> deploy/deploy.sh
```

Every setting is named, and nothing falls back to a default profile. Run it
again to deploy a new version. `SITE` names another docs site (the default is
`https://www.anahita.io`), and `FUNCTION_NAME` another name for the function
and its stack (`anahita-mcp`).

- **What bounds the cost:** the API lets through ten requests a second
  (`RequestsPerSecond`) and the function runs at most two copies at once
  (`Concurrency`); beyond those, callers are refused with 429. An answer
  takes a few milliseconds once a copy is warm.
- **What is kept:** Lambda's own lines (when it ran, for how long), for one
  day. The API's access logs are off.
- **What it reads:** the two files on the site, fetched when a copy starts
  and again after an hour if they changed, kept in `/tmp`.

Anahita's own copy is in the AWS account that runs banu.io, in
ca-central-1 (Montreal), every part of it.
