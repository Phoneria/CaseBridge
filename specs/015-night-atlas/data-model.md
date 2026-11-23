# Data model

## FeatureContract
FictionalCase: id, amount, parties, document timeline. Branch: id, condition, outcome, question, options, correct index, feedback, preparation task. Bureau: fictional lawyers and base assignments. State: language, document, branch, answer, bureau, lawyer, planned; every branch/bureau/lawyer change resets only dependent state. No persistent storage or API.
