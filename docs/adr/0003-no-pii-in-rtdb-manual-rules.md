# No PII in Firebase RTDB; security rules published by hand

A player's email is **never** written to the Realtime Database — only a display
name. Identity lives in Firebase Auth; the RTDB stores `claimedByUid` + a name.
This is a privacy invariant, not a preference: don't add email (or other PII) to
any RTDB node.

`database.rules.json` is the source of truth for access rules, but it is
**published manually** via the Firebase console — editing the file does not take
effect until someone publishes it. A rule change that isn't published will look
broken in the app with no error in the diff.
