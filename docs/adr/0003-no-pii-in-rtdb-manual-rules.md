# No PII in Firebase RTDB; security rules deployed by CI

A player's email is **never** written to the Realtime Database — only a display
name. Identity lives in Firebase Auth; the RTDB stores `claimedByUid` + a name.
This is a privacy invariant, not a preference: don't add email (or other PII) to
any RTDB node.

`database.rules.json` is the source of truth for access rules. It is now
**deployed by CI** (`.github/workflows/deploy-rules.yml`) whenever it changes on
master, via a service account — so an edit takes effect on push, no console paste
needed. (Historically it was published by hand, which was the #1 silent-breakage
trap: a rule change that wasn't published looked broken in the app with no error
in the diff.) The workflow validates the JSON before deploying; if the
`FIREBASE_SERVICE_ACCOUNT` secret is missing the deploy fails loudly and nothing
else is affected.
