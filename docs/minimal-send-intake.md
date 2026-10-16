# Confirmed sends with incomplete facts

A confirmed send is not a confirmed sale. Store unknown `confirmed_revenue_usd`
and unknown `email.sent_at` explicitly as `null`. Confirmation observation times
belong in `sent_evidence`; never substitute them for the message's sent time.
Message bodies are not required. The authenticated UI labels unknown sent time
and leaves the revenue total unknown if any case has unknown revenue.

## Bounded production procedure

1. Sign in through the dashboard. Read a fresh server registry and every registered
   case. Reconcile recipients and business identities against the confirmed sends.
   Do not reuse an existing ID for a different business. Unresolved identity matches
   stop preparation; new cases receive unused stable IDs only after reconciliation.
2. Preserve all existing canonical source fields. Finalize the minimal send facts
   and their case IDs in private `roy-baty-ai/roy-lab`, using an actual commit
   containing those facts. Record the exact `business/outbound.json` key per case.
   Pending records with null case IDs are source evidence, not import manifests.
3. Build a finalized Roy intake (at most ten cases), with exact source commit,
   content hashes and expected revisions. New cases require expectedRevision=0,
   sourceVersion=1; existing cases use the freshly observed revision and
   source.version+1. Keep original evidence, restrictions and internal notes.
4. Through the existing authorized Firebase management session, inspect the
   deployed Rules on project `roy-dashboard-20261008`, database `(default)`.
   Compare the live Rules against the reviewed baseline before applying
   `firebase/firestore-finalized.rules`. Do not overwrite unrelated live changes.
   This changes nullable fact validation and source-only timestamp enrichment;
   it does not add users, providers, IAM roles, or collection access.
5. After reconciliation and Rules verification, use that same existing management
   session to update only `privateRoy/real/control/state`: `mode="active"` and
   `allowSourceIngest=true`. Preserve other fields. This enables existing owner
   manual edits and finalized source ingestion for the real namespace. The browser
   deliberately has no permission to modify this control document.
6. Use the authenticated dashboard's finalized-source import to check and save the
   manifest. Save verifies source hashes, receipt, registry, case and history.
   An interrupted multi-case intake can leave some cases completed; retry the same
   manifest after reading its status. Matching source hashes/versions are idempotent.
7. Independently confirm registry count and unique IDs, all added records and source
   versions, unchanged prior records, history, and the other open dashboard's view.
   If all ten are new and the current registry still has nine, expect 19 unique
   cases. Do not assume these counts until the fresh preflight establishes them.

## Later Roy updates

A Git commit alone does not write to Firestore. Finalize a new intake from that
commit and current DB revisions, then submit it through the authenticated import.
The existing local result-feed option can consume approved finalized intake files
while the signed-in browser and selected file remain available. It is not an
unattended server worker and does not collect Gmail automatically.

Firestore subscriptions refresh connected dashboards after a committed update;
no page reload is needed. If a sent time was explicitly null, a later finalized
source intake may fill it once, preserving other email fields, send proof and
original history. Minute precision requires an explicit timezone and
`sent_at_precision="minute"`; do not invent seconds. The client validates Gregorian
calendar dates; Rules bound the enrichment to ISO-shaped strings and unchanged
email fields. A previously known sent time cannot be replaced by this path.
Manual editorial changes cannot fill or rewrite sent times or confirmed revenue.

If management login is unavailable, leave production Rules and controls unchanged.
Do not extract credentials, create service accounts or activate the optional writer
proposal to bypass this requirement.
