# Continuous private results — review candidate

This branch resumes the existing per-case writer. It is **not a production
completion claim**. No credentials, Firebase Rules, admin allowlist, published
configuration, deployment, or public business data are changed.

## Supported flow

1. The existing Roy worker produces a verified result in a local private folder,
   outside every Git checkout. Actual case IDs must come from the authenticated
   registry; do not guess IDs, create dummy business cases, or publish payloads.
2. For editorial progress/next action, write this JSON (synthetic example only):

```json
{"schemaVersion":1,"eventId":"synthetic-unique-event","caseId":"roy-web-0001","progress":"Synthetic completed check","nextAction":"Synthetic next action","completedAt":null,"receivedAt":"2026-10-15T00:00:00Z","evidence":["Synthetic result receipt"]}
```

`completedAt: null` means the actual check time is unknown; receipt time must not
replace it. Each event ID identifies immutable bytes. Only actual observed times
are supplied. This path cannot mark mail sent, grant sales GO, set revenue, or
change source evidence. Historical duplicate lookup is bounded to 100 revisions;
older redelivery stops for reconciliation rather than overwriting newer work.

3. Queue the file, using paths outside a repository:

```sh
node scripts/publish-result-feed.mjs /private/path/result.json /private/path/feed.json work-result real
```

For candidate creation, verified sends or replies, use `intake` instead of
`work-result`, with the existing finalized manifest from `firebase/intake.mjs`.
It requires the actual source commit, source path/key, next source version,
current expected DB revision, payload hash, finalization receipt and manifest
hash. A reply can update `payload.sales` with stage/evidence/checked_at; existing
sent email/proof/offer and dated evidence remain immutable. Do not infer a send
from a draft or a reply from lack of observations. The producer does no sending.

4. In the dashboard, log in with the existing allowlisted Google account. Once
   server records and active write control are confirmed, select **結果ファイルを
   選んで同期** and the private `feed.json`. The browser reads it approximately
   every five seconds, validates the complete file before writing, then uses the
   existing SDK transactions and independent server/history readback. Other open
   authenticated dashboards receive onSnapshot updates without reloading.

The file handle/auth remain in memory. Closing the tab ends synchronization;
background tabs can be throttled. An offline browser event immediately clears
private views and stops the feed. Online recovery rechecks the existing identity
and server authorization without reloading; restarting the writer requires
reselecting the feed. This is a session-bound bridge, not an
unattended service. A persistent agent writer remains blocked until the parent
selects an already-authorized runtime connection. No service-account key,
refresh token, new login grant, local endpoint or credential export is needed by
this implementation.

The feed is bounded to 100 items / 1 MB. The producer serializes concurrent writes
with an exclusive `.lock`, writes 0600 temporary files, then atomically renames.
A queued response is **not DB verification**. Rotate/archive a full feed only
after the dashboard reports all items verified. After a crash, inspect a leftover
lock and reconcile before removing it. Errors stop the consumer, are sanitized,
and explicitly allow for partial saves. Fix the cause and reselect the same file;
verified repeats are idempotent. No automatic retry of ambiguous failures occurs.

## Verification and remaining gates

- Node tests cover ordered/duplicate/conflicting results, transaction retry,
  missing times, stale data, authorization loss, sanitization, file validation,
  private path/symlink refusal and bounded storage.
- `tests/continuous-browser.cjs` uses actual Firebase SDK + local Firestore Rules,
  synthetic auth/data and two Chrome pages. Its test-only SDK shim, localhost CSP
  allowance and file picker stub never enter production assets. Test with a
  local emulator on `127.0.0.1:8085`, Playwright Core and Chrome; it refuses a
  production Firebase project.
- No live authenticated session is available through this worker's tools.
  Production control/registry, actual case mapping and deployed Rules must be
  read in the existing approved session before live verification.
- The original sales schema remains bounded to 50 cases. Proposed private business
  summaries and unattended worker implementation are documented in
  [unattended-results.md](unattended-results.md). They require separately reviewed
  Rules/IAM/workflow activation; production configuration remains unchanged.
