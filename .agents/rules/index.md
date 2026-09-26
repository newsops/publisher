# Rules Index

| Rule                 | File                      | Summary                                                                  |
| -------------------- | ------------------------- | ------------------------------------------------------------------------ |
| Spec workflow        | `spec-workflow.md`        | Spec before public behavior changes                                      |
| Static boundary      | `static-boundary.md`      | Public site has no runtime server dependency                             |
| Layer boundaries     | `layer-boundaries.md`     | Six layers, one import direction, three access surfaces, ratchet base    |
| Fail loud            | `fail-loud.md`            | Unknown or failed checks cannot be treated as success                    |
| Self verification    | `self-verify-first.md`    | Verify locally before requesting manual checks                           |
| Browser verification | `browser-verification.md` | UI changes require browser verification                                  |
| Repository SSOT      | `repo-single-source.md`   | Decisions live in the repository                                         |
| Git branch           | `git-branch.md`           | Main is protected; use topic branches                                    |
| No worktree          | `no-worktree.md`          | Do not use Git worktrees                                                 |
| Security             | `security.md`             | Secrets and admin boundaries are explicit                                |
| Delegated authority  | `authority-delegation.md` | Recommendation-led work auto-advances; irreversible actions reconfirm    |
| Repository scope     | `repository-scope.md`     | The repo is the program; operated sites and their deploys leave no trace |

Read the narrowest applicable rule before acting.
