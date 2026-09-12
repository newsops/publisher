# Security boundary

- Never commit `.env` files, private keys, access tokens, or database credentials.
- Protect `admin.publisher.com` with authentication, MFA-capable identity, rate limiting, and a separate deployment policy.
- Sanitize rich text at the admin write boundary and validate again during the public build.
- Do not expose admin APIs, storage credentials, or draft content from the static public origin.
