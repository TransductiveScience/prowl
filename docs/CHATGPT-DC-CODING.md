# Prowl + ChatGPT + DC-i9ES coding workflow

Status: experimental host implementation. Source and local protocol tests are not ChatGPT plugin acceptance.

## Division of responsibilities

- **ChatGPT** interprets requirements, selects code targets and orchestrates calls.
- **Prowl** indexes the open project, searches symbols, estimates impact, records observed changes and highlights affected graph nodes.
- **DC-i9ES** reads, edits, executes commands and verifies files on i9ES. Another host's Desktop Commander is a distinct execution target.
- Prowl intentionally does **not** invent or replay a file edit. A record is evidence supplied after the host tool has returned a successful readback.

## Execution sequence

1. Call `prowl_status`: note `projectName`, `projectPath`, and `pathScope`. The path is on the machine **running Prowl**. Verify the DC host and translate/mount paths explicitly if different.
2. Call `prowl_search`, `prowl_explore` or `prowl_impact` to identify exact symbols, callers and potential regressions.
3. Use the appropriate DC-i9ES `read_file` and `edit_block` / `write_file` tools; read back changed contents. Never infer success from an invocation alone.
4. Use DC-i9ES `start_process` to run relevant tests/builds. Capture exit code, log path, hashes or other concrete receipts. Re-read relevant files or Git diff.
5. Call `prowl_record_change` for each meaningful verified phase. Supply stable `eventId`, affected repository-relative `files`, `phase`, `description`, and observed `exitCode` or `receipt`. Reuse **exactly the same payload** when retrying an uncertain recording.
6. Call `prowl_change_history` or `prowl_coding_review`, inspect the highlighted nodes and run `prowl_impact` on changed paths after Prowl's filesystem watcher has indexed them.
7. Report changed files, tests, impact and any unresolved uncertainties. Do not equate a successful build with a live ChatGPT UI.

For investigations that exceed the transport timeout: `prowl_start_investigation` returns a durable ID. Poll `prowl_job_status`; use `prowl_job_cancel` to request cancellation. A cancellation request does not forcibly stop renderer computation, and that distinction is reflected in job state.

## Local transport

With Electron Prowl running, the MCP server reads `~/.prowl/mcp-port` and `~/.prowl/mcp-auth`. The internal Electron endpoint remains loopback only.

Run `node dist/mcp-server.js` for stdio clients, or set `PROWL_REMOTE_TOKEN` (random secret of 24+ characters) and optional `PROWL_MCP_PORT`, then use `node dist/mcp-server.js --http`. The HTTP endpoint is `/mcp`, bound to loopback. Access from ChatGPT requires authenticated HTTPS ingress on a user-controlled host (proposed `prowl.torsionfield.de`), and explicit client registration. Static development bearer tokens are **not** a substitute for per-user OAuth on a shared production deployment.

MCP 2026-07-28 clients use `server/discover` and per-request `_meta`; legacy clients use `initialize`. Both were tested locally against this build. `ui://prowl/coding-review.html` exposes a headless-equivalent change-history panel via MCP Apps.

## Verification and limits

- Test server wire: `PROWL_MCP_TEST_TOKEN=... PROWL_MCP_URL=... node scripts/mcp-smoke.mjs`.
- Test receipt durability/concurrency: `node scripts/ledger-smoke.mjs`.
- Type-check Node: `npx tsc --noEmit -p tsconfig.node.json`.
- Build Electron and MCP assets: `npm run build`.
- The remote HTTPS endpoint, OAuth flow, ChatGPT client UI, and hosted change-event callbacks remain **unverified** unless accompanied by live acceptance receipts.
- The graph is updated by Prowl's existing folder watcher; event recording only highlights existing indexed nodes. A file outside the loaded project cannot be assumed visible.
