# Data Model: S02 Main kaynaklı değişmez yayın

## FeatureContract

Release.commit: 40 lowercase hex; Release.scope: app|marketing|all; Release.state: staged|verified (rollback is recorded separately as operation=rollback); file digests: SHA-256; release paths restricted to fixed inventory, never caller paths.
