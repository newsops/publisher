# Contributing

Use Node.js 22 and Corepack with pnpm 9. Before opening a pull request, run:

```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm harness:scan
```

Never commit a `.env` file, access token, database URL, private media URL,
production export, or provider deployment state such as `.vercel/`.

Contributions must contain only code and documentation the contributor is
authorized to publish. Editorial articles, imported feeds, images, logos, and
other media are not covered by the code license unless a file explicitly says
otherwise and includes its redistribution terms.
