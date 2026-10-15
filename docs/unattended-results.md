# Review proposal: unattended results and business progress

Status: implementation/test candidate only. Nothing in this PR provisions IAM,
changes deployed Rules, enables a worker, or changes production configuration.
The browser file bridge is optional; it is not the unattended completion criterion.

## Data contract

`privateRoy/real/businesses/{web,youtube,note,assets,ventures,operations}` stores
one versioned result per business and immutable `history/{revision}` documents.
Input fields are schemaVersion:1, businessId, expectedRevision, sourceCommit
(40 hex), state (unknown/active/waiting/hold/blocked/complete), progress,
nextAction, observedAt, evidence and metrics. Each metric is `{value,observedAt,
evidence}`. Null value means unobserved, never zero; a measured zero requires
its own observation time and evidence. Fixed metric names/units: listing_urls
(URLs, not companies), reviewed_records (including holds), sent_messages,
reply_messages, scheduled_items, published_items and revenue_usd. Scheduled and
published are independent observations. Use null for publication not rechecked.
Business unknown requires null observation time and empty evidence. Source
observation time is separate from server updatedAt; refreshing sync does not
make an old observation fresh. New summaries require expectedRevision:0.

Producer submits a private JSON file:
`{"schemaVersion":1,"space":"real","items":[{"kind":"business","value":{...}}]}`.
Other supported kinds: existing finalized `intake` and editorial `work-result`.
At most 100 items / 1 MB and one item per business/case in a batch. Do not append
an entire historical log: supply the current batch, with idempotent retries.
Intakes preserve existing immutable send evidence; work results only change
next action, internal progress note and an explicitly observed check time.
The existing case limit is 50; a large URL pool belongs in a summary metric,
not thousands of invented case records. Partial saves remain possible; retry
same verified source after resolving the reported failure. Every business/case
save verifies server state/history before reporting success.

Parent input needed: current source commit and evidence locator, exact observed
UTC time (not a guessed midnight), metric scope (today/cumulative in evidence),
confirmed case ID mapping for sends/replies, next action and expected revision.
No actual customer data is included in this public PR. Put real batches only in
private roy-lab/private-results/current-batch.json. The producer must turn
verified work results into that file; this job does not discover mail or publish
YouTube/note content itself.

UI is opt-in through operationsVersion:1 after Rules activation. All six business
slots show missing observations explicitly. Two independent onSnapshot readers
receive writes without reload. Sync success/failure is separate from the source
observation; 90 minutes without sync is stale, observations older than 24 hours
are stale. Authentication/offline events clear private views. A worker failure
before it can authenticate cannot write a failure marker: the old sync becomes
stale and the private Actions run is the immediate diagnostic.

## Single owner decision: exact proposed authorization

Target project: roy-dashboard-20261008. Confirm actual project number before
using provider URLs (public messaging sender ID is 400313198383).
Target private repository: roy-baty-ai/roy-lab, numeric repository ID 1400072927,
owner ID 336551905. Only main and the exact workflow below are trusted.

1. Owner verifies current billing/API state and deployed Rules against the
   checked-in baseline. Enable IAM, IAM Service Account Credentials, Security
   Token Service and Resource Manager APIs if absent. Google WIF documentation
   lists billing enablement as a prerequisite. If billing is not already enabled,
   STOP and request a separate billing decision; do not link/upgrade billing.
2. Owner creates a dedicated service account
   roy-results-signer@roy-dashboard-20261008.iam.gserviceaccount.com, WIF pool
   roy-results, provider github with issuer https://token.actions.githubusercontent.com.
   Map google.subject=assertion.sub, attribute.repository_id=assertion.repository_id.
   Require this exact provider attribute condition:

   ```text
   assertion.repository_id == '1400072927' &&
   assertion.repository_owner_id == '336551905' &&
   assertion.ref == 'refs/heads/main' &&
   assertion.workflow_ref == 'roy-baty-ai/roy-lab/.github/workflows/roy-results-sync.yml@refs/heads/main' &&
   assertion.sub == 'repo:roy-baty-ai/roy-lab:environment:roy-results-sync'
   ```

   Grant roles/iam.workloadIdentityUser ONLY on this service account to
   principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/roy-results/attribute.repository_id/1400072927.
   Create custom role royFirebaseTokenSigner containing ONLY
   iam.serviceAccounts.signBlob; bind it to this service account on itself.
   No datastore, Editor, Owner or Firebase Admin role. No service-account key.
3. Review generated Rules (`node scripts/build-operations-rules.mjs /tmp/review.rules`)
   and deploy only after all candidate security tests pass and production Rules
   diff is reviewed. Existing Google owner remains the only human reader.
   Dedicated UID roy-results-writer-v1 requires custom provider, roy_writer:true,
   writer_scope:results-v1, auth_time under one hour and the server-managed
   control/automation.enabled:true switch. Source ingestion retains existing
   source permission gate; manual worker edits cannot grant READY. No client
   permission/control writes, deletions or legacy privatePipeline access.
   Owner initializes that switch through an already authorized admin operation.
4. Owner creates GitHub Environment roy-results-sync restricted to main, with no
   per-run approval if unattended operation is desired, and reviews main branch
   write protection. Set non-secret environment variables WIF_PROVIDER and
   DASHBOARD_CODE_SHA (reviewed full commit SHA). Install the reviewed template
   as roy-lab/.github/workflows/roy-results-sync.yml. Copy only the public `firebase`
   object from firebase/config.js into private-results/firebase-public-config.json
   (plain JSON, no wrapper; it contains no write credential). Merge/publish dashboard and
   set operationsVersion:1 only after the Rules and initial private input are ready.

WIF produces short-lived runner credentials. IAM signs a Firebase custom token;
the SDK exchanges it for a Firebase ID token governed by Firestore Rules. It does
not use OAuth/ADC directly against Firestore (which would bypass Rules via IAM).
Firebase creates the dedicated Auth UID on first sign-in; no owner Google login,
password, downloaded key or persisted refresh token is needed. SDK credentials
stay in process memory; the WIF external-account file lives only in the temporary
runner checkout and auth action cleanup removes it. Do not upload logs/artifacts
containing the input, claims or token. SignBlob can sign arbitrary custom-token
payloads: verify there are no other permissive authenticated-user Rules in the
project; owner impersonation with custom provider remains denied by our Rules.

## Cadence, costs and acceptance

Private input commits trigger a run; hourly fallback catches missed runs. GitHub
schedules may be delayed. Job has a five-minute timeout and serialized execution.
Changed records write current+history and existing intake certificate documents;
each job additionally updates one sync document. An idle hourly heartbeat is
24 sync writes/day, plus transaction reads; open tabs also consume reads.
Firestore standard free quota is 20,000 writes/50,000 reads per day and 1 GiB,
shared with current usage. Private GitHub Actions uses the account's included
minutes then applicable billing. Existing usage/plan/billing is unknown: no zero
cost guarantee or billing change is authorized. Owner should inspect available
quota and spending settings before activation; alerts are not a hard cap.

Acceptance still required in production: approve activation, submit one confirmed
private result, observe independent server/history readback and two authenticated
open views without reload; confirm unknown vs zero, stale/failure/offline and
unauthenticated denial. Local emulation is not production acceptance.

References: [WIF deployment pipelines](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines),
[Firebase custom tokens](https://firebase.google.com/docs/auth/admin/create-custom-tokens),
[Firestore REST authentication](https://firebase.google.com/docs/firestore/use-rest-api),
[Firebase pricing](https://firebase.google.com/pricing),
[GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

## Reproduced local checks (2026-10-15)

77 unit tests passed. The original finalized Rules suite passed 109/109, and
the generated candidate also passed the same 109/109. Dedicated writer tests
passed 10/10, including provider/UID/scope/expiry denial, permission/control
write denial, immutable history, READY promotion denial, and kill switch.
The Java emulator must run with -Duser.language=en -Duser.country=US: its
Japanese locale lacks an error-message resource bundle and otherwise reports
INTERNAL on malformed-data tests. Candidate create validation uses explicit
conditional stages to stay below the Rules expression limit on rejected batches.
Chrome integration used actual SDK/Rules with synthetic emulator identities:
sales revisions 2/3/4 plus two business revisions reached two existing pages;
1440/393px layouts, scheduled vs published, sync failure, pause, offline clear,
online restore and logout passed. Production and actual WIF token exchange have
not been exercised; owner activation and real input remain required.
