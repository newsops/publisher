# Security policy

Do not open a public issue for a suspected vulnerability or include credentials,
tokens, database URLs, private media URLs, or personal data in an issue, pull
request, or commit.

Report a vulnerability through GitHub's private security-advisory flow for this
repository: <https://github.com/newsops/publisher/security/advisories/new>.
Include a minimal reproduction, affected version or commit, impact, and safe
contact details. The maintainers will acknowledge the report and coordinate a
fix privately before disclosure.

The static public site intentionally has no runtime credentials or database
connection. Administrator and comment-service credentials belong exclusively in
the selected deployment provider's secret store.
