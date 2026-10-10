# BDD coverage index

Generated from the feature files by `bdd-index-generate.mjs` — do not edit by hand.

| Feature | Scenario | Domain | Audience | Use case | Category | Quality | Severity | Status |
|---|---|---|---|---|---|---|---|---|
| payments/refund.feature | A double-submitted refund is only applied once | payments | customer | refund-double-submit | concurrency | reliability | critical | covered |
| payments/refund.feature | A guest cannot refund any order | payments | guest | refund-permission-denied | permission | security | critical | covered |
| payments/refund.feature | Admin refund surfaces a downstream payment failure | payments | admin | refund-failure | error | reliability | critical | covered |
| payments/refund.feature | Customer cannot refund an order past the refund window | payments | customer | refund-ineligible | negative | functional | high | covered |
| payments/refund.feature | Customer refunds an eligible order | payments | customer | refund-happy-path | happy | functional | high | covered |
