# Repository scope: the program, never an operation

This repository is **Publisher, the program**. Every publication that anyone —
including the repository owner — runs with Publisher is an independent
creative work. Operated publications are not part of this repository and must
leave no trace in it, in its history going forward, or in its GitHub project.

## Never in tracked files, commits, pull requests, issues, or GitHub metadata

- The name, domain, site ID, author names or slugs, post IDs or slugs, category
  set, analytics IDs, or content of any operated publication.
- Hostnames of an operation's admin, comments, or API; hosting project names
  (Vercel, Cloudflare Pages, …), account, team, or zone IDs; bucket names;
  database hosts.
- Deployment, release, operation, job, or snapshot IDs from a real operation;
  screenshots or evidence logs taken from production.
- Local filesystem paths, OS user names, personal e-mail addresses, real
  names, or regions of the operator.

Use placeholders instead: `example.com`, `news.example.com`,
`admin.example.com`; site IDs `default`, `example`, `second-site`; names
"Example News" and "Second Example". Fixtures and tests use the same
placeholders.

## Deployments of an operation leave no GitHub record

- Do not connect an operated instance's hosting project to this repository's
  Git integration. No GitHub Deployments, Environments, deployment statuses,
  check runs, or pull-request comments may come from an operator's hosting.
- The program's CI (`.github/workflows/verify.yml`) builds and tests the
  program only. It never deploys an operated publication or its admin.
- Operators deploy from their own private checkout, fork, or CI with their own
  secrets.
- The repository homepage, description, topics, and release notes describe the
  program only.

## Operating a publication with an agent

- Production checks and their evidence (URLs visited, operation IDs,
  screenshots, command output) stay in the operator's private notes. A spec
  whose completion needed a production check records it generically, for
  example "verified on an operated instance; evidence kept privately by the
  operator".
- Program work is verified against the checked-in fixture, local mirrors, and
  placeholder identities.
- An agent that operates a publication and edits the program in the same
  session must not copy operational details into the repository.

## Checklists

### Setting up this repository (or a fork of it)

1. Commit with your GitHub noreply address, and turn on "Keep my email
   addresses private" and "Block command line pushes that expose my email" in
   the GitHub account's email settings:

   ```bash
   git config user.email "<id>+<login>@users.noreply.github.com"
   ```

2. Create the private denylist (terms on standard input, one per line, so they
   stay out of shell history) and store the same list as the
   `PUBLISHER_PRIVATE_DENYLIST_TEXT` Actions secret:

   ```bash
   corepack pnpm privacy:denylist add -
   gh secret set PUBLISHER_PRIVATE_DENYLIST_TEXT < ~/.config/publisher/private-denylist.txt
   ```

3. Leave the repository homepage empty or pointed at program documentation.
4. Do not install a hosting provider's GitHub App on the organisation, or
   restrict it so it cannot see this repository.
5. Protect the default branch and require the `repository` and
   `github-records` checks, so a push that skipped local hooks still cannot
   merge.

### Clearing a failing `github-records` check

The check reads live GitHub state, so it is cleared in the GitHub project, not
in a commit. Do the steps in this order — the last one only works after the
first.

1. **Stop the source first.** In the organisation's installed GitHub Apps,
   restrict the hosting provider's app so it cannot see this repository (or
   uninstall it); alternatively disconnect the Git integration in the
   provider's own dashboard. Skipping this makes every later step temporary,
   because the next push re-creates the records.
2. Clear the repository homepage, and rewrite a description or topics that name
   an operated publication.
3. Delete every GitHub Deployment
   (`gh api --method DELETE repos/<owner>/<name>/deployments/<id>`) and every
   Environment
   (`gh api --method DELETE repos/<owner>/<name>/environments/<name>`). Check
   an Environment for secrets, variables, protection rules, and workflow
   references before deleting it.
4. **A commit status cannot be deleted** — GitHub has no such endpoint, and a
   status must never be overwritten with a fabricated one. A commit that
   already carries a hosting status stays flagged forever, so the check clears
   only when a _new_ head commit lands after step 1. Land any ordinary commit;
   the next run reads that head instead.

Removing an organisation's app access needs an organisation owner. A token with
`repo` scope alone gets `403` from
`DELETE /user/installations/{installation_id}/repositories/{repository_id}`.

### Creating or renaming an operated publication

1. Add its name, domain, site ID, author slugs, and admin or comments hosts
   with `corepack pnpm privacy:denylist add -`, then refresh the Actions
   secret.
2. Deploy its admin and static releases from a private checkout or private CI
   with your own credentials — never through this repository's Git
   integration.

### Working as an agent

- Do not bypass hooks (`--no-verify`, `-c core.hooksPath=…`); the commit-msg
  and pre-push hooks are part of this rule.
- Write commit messages, pull-request titles and bodies, and spec evidence
  with placeholders only; describe a production check as "verified on an
  operated instance; evidence kept privately by the operator".
- Keep screenshots, mirrors, credentials, and command output from an operated
  instance in the session scratchpad or the operator's private notes, and
  delete credentials after use.
- Never print denylist terms; refer to them as "denylist terms".

### If something leaks

1. Stop pushing. Remove the text from the working tree and add the leaked
   terms to the denylist so the scan keeps blocking them.
2. Anything already pushed stays in history, forks, caches, and pull-request
   pages. Make the repository private at once, then either rewrite history or
   recreate the repository from a clean single commit.
3. Delete GitHub Deployments and Environments, disconnect the hosting
   integration, and clear the homepage field; `check-github-records.mjs`
   confirms the result.

## Enforcement

`scripts/harness/scan-repository-privacy.mjs` runs in `pnpm harness:scan` and
rejects tracked text that contains local home paths, personal mail addresses,
hosting default hostnames (`*.vercel.app`, `*.pages.dev`, `*.workers.dev`,
`*.netlify.app`), and every term in the operator's private denylist. The
denylist is a plain-text file outside the repository — the path in
`PUBLISHER_PRIVATE_DENYLIST`, or `~/.config/publisher/private-denylist.txt` by
default — one term per line; it is never committed. RULE-003 adds:

- **Commit messages and pull-request text.** `.husky/commit-msg` runs the scan
  with `--message-file`; `.husky/pre-push` scans the messages of the commits
  being pushed (`--commit-range`, or `--unpushed` for a new branch). In CI the
  `repository` job scans the pull-request title and body (`--text-env`) and
  the pull-request commit range.
- **The denylist in CI.** The optional `PUBLISHER_PRIVATE_DENYLIST_TEXT`
  Actions secret is written to a temporary file outside the checkout; without
  it CI runs the generic checks and says so.
- **GitHub records.** `scripts/harness/check-github-records.mjs` (the
  `github-records` job, on push, pull request, and daily) fails when the
  repository has any Deployment or Environment, when the checked commit has a
  hosting integration's commit status or check run, or when the homepage is a
  hosting default host or contains a denylist term.
- **Binary files.** Tracked raster images and PDFs are allowed only under
  `ALLOWED_BINARY_PATHS` in the scan (program assets and fixtures), so a
  production screenshot cannot be committed.
- **Denylist maintenance.** `corepack pnpm privacy:denylist add <term...>`
  appends terms to the private file (mode 600) without printing them; add a
  site's name, domain, site ID, author slugs, and admin host whenever you
  create or rename one, and update the Actions secret.
- **Spec evidence.** `backlog-writer`, `backlog-gate-guard`, and
  `spec-writing-standard` record production checks only as "verified on an
  operated instance; evidence kept privately by the operator"; the gate fails
  an Evidence entry that names an operated site's domain, host, deployment,
  operation, or release ID, or a production screenshot path.
