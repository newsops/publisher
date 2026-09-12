# Specs

Feature and platform specs live under `.agents/spec-docs/` so their lifecycle
can be checked by the harness. The folder reflects the current lifecycle state:

- [WEB-001 platform foundation](../.agents/spec-docs/active/WEB-001-static-public-site-and-admin.md) — active; local baseline is complete, but production is held for portable persistence and real deployment evidence.

Historical completion records and operational task logs are intentionally
excluded from this public repository. Runnable contracts and deployment guides
are the source of truth for a fresh installation.

For lifecycle and gate rules, read
[`backlog-pipeline`](../.agents/skills/backlog-pipeline/SKILL.md) and
[`spec-workflow.md`](../.agents/rules/spec-workflow.md).
