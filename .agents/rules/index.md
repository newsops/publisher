# Rules Index

| Rule                 | File                      | Summary                                                               |
| -------------------- | ------------------------- | --------------------------------------------------------------------- |
| Spec workflow        | `spec-workflow.md`        | Spec before public behavior changes                                   |
| Static boundary      | `static-boundary.md`      | Public site has no runtime server dependency                          |
| Fail loud            | `fail-loud.md`            | Unknown or failed checks cannot be treated as success                 |
| Self verification    | `self-verify-first.md`    | Verify locally before requesting manual checks                        |
| Browser verification | `browser-verification.md` | UI changes require browser verification                               |
| Repository SSOT      | `repo-single-source.md`   | Decisions live in the repository                                      |
| Git branch           | `git-branch.md`           | Main is protected; use topic branches                                 |
| No worktree          | `no-worktree.md`          | Do not use Git worktrees                                              |
| Security             | `security.md`             | Secrets and admin boundaries are explicit                             |
| Delegated authority  | `authority-delegation.md` | Recommendation-led work auto-advances; irreversible actions reconfirm |

Read the narrowest applicable rule before acting.
