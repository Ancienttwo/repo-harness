# BDD² Phase E3 Scoring Metrics

E3 reuses immutable E2 Agent outputs and replaces only the score authority.

Two distinct primary reviewers score each normalized outcome. Canonical equality means
byte-equality after recursively sorting object keys and preserving array order. A
disagreement requires exactly one fresh adjudicator score locked before reveal;
agreement forbids adjudication. Effective score is the adjudicator score on
disagreement and the identical primary score on agreement.

Proposal-only scores contain no tracked-artifact field. I3 artifact delta is derived
from runner-captured before/after filesystem inventories.

## S3 gate

Pass requires unsupported-expansion reduction at least 30%, paired wins greater than
losses, no increase in total required omissions, no task with a new omission in two or
more repetitions, no new P0/P1 omission, and authority success on at least 10/12 tasks.
Kill applies below 15% reduction, losses greater than wins, any stable omission, any
new P0/P1 omission, or authority success below 8/12. Otherwise Reshape.

## EB3/EI3 gate

Pass requires at least six closure wins, at most two losses, no new P0/P1 omission, no
increase in unsupported expansion, user concepts, or required omissions, complete
evidence compliance, and no closure of EI-H-05/EI-H-06. Kill applies for any new P0/P1
omission, more than four losses, failed evidence compliance, a closed non-closable
ImageGen task, or simultaneous increases in unsupported expansion and user concepts.
Otherwise Reshape.

Evidence compliance requires all provenance/question/privacy/synthetic fields for the
adapter, zero unsupported assertions, zero feature-need inference for Browser, and zero
user-validation claims for ImageGen. Explicit limitations never fail compliance.

## I3 gate

I3 runs only when S3=Pass and EB3=Pass or EI3=Pass. It contains exactly four fresh
fixture outputs. Passing I3 permits only a separate owner Phase P decision.
