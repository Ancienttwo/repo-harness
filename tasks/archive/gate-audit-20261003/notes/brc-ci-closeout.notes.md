# BRC CI closeout

Main cfb26baa allows editing an approved plan with open execution tasks. CI run 34197408929 retained eight stale CLI golden expectations. This correction updates only edit readiness projections; stop/ship rules and production code remain unchanged.

> **Substantive Change SHA256**: `sha256:d63d6de85efc88ae659e60a076c6fd433e305911dc2659b7e8ae4166a4656f7e`

Validation: the original CI demonstrates the mismatch; focused CLI golden and projection tests pass 29/29. SQL order, architecture sync, strict workflow, state inspection, and adoption dry-run pass. Task sync is rerun with this binding. No model calls.

PR-wide binding including the accepted audit repairs and golden correction:

> **Substantive Change SHA256**: `sha256:fd9b83e9598930a6de2e75afeed064151d1179e75969c1902e10204a150f36eb`
