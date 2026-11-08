# Git workflow

## Branches and pull requests

`main` holds stable releases. `develop` integrates completed work. Keep the GitHub
default branch as `main`. Do not push application changes directly to either
long-lived branch.

| Branch | Create from | Merge by pull request into |
| --- | --- | --- |
| `feature/<short-description>` | `develop` | `develop` |
| `bugfix/<short-description>` | `develop` | `develop` |
| `release/<version>` | `develop` | `main`, then `develop` |
| `hotfix/<short-description>` | `main` | `main`, then `develop` |

Start a feature with a clean working tree:

```sh
git fetch origin
git switch develop
git pull --ff-only origin develop
git switch -c feature/my-change
# Implement and run the checks described in docs/ci.md.
git add <changed-files>
git commit -m "Describe the resulting behavior"
git push -u origin feature/my-change
```

Open a PR targeting `develop`. Describe the problem, resulting behavior, test
results and any deployment or migration requirements. Review the full diff and
wait for all checks. Squash merges are suitable for feature and bugfix PRs.
Delete the short-lived branch after merging.

## Releases

1. Create `release/1.0.0` from updated `develop`. Limit changes to release fixes,
   documentation and version preparation; merge unrelated features into `develop`.
2. Open a release PR into `main`. Require successful CI and release review.
   Merging into `main` currently can trigger Railway staging deployments: confirm
   deployment readiness before merging. The future production mapping is not active.
3. Use a merge commit for the release PR so branch ancestry is preserved.
4. Open a second PR from the release branch into `develop`, also using a merge
   commit, to preserve release fixes. Do not delete the release branch until both
   merges complete. Resolve conflicts on a temporary branch, never by rewriting
   either long-lived branch.
5. Tag the approved release commit on `main`, for example:

```sh
git fetch origin
git tag -a v1.0.0 <approved-main-commit> -m "Release 1.0.0"
git push origin v1.0.0
```

Use semantic versioning: patch for compatible fixes, minor for compatible
features and major for breaking changes. Tags identify releases; they do not
trigger deployment in the workflows provided here.

## Hotfixes

Create `hotfix/<description>` from updated `origin/main`. Make the smallest
necessary fix and run CI. Open PRs into `main` and `develop`; use merge commits
for both. If a release branch is open, also propagate the fix there through a PR.
Tag the next patch release on the approved `main` commit. Keep the hotfix branch
until all synchronization PRs are merged. Do not force-push or cherry-pick a
second independent history when a merge is appropriate.

## Active branch protection

Enabled with owner approval and verified on 2026-11-08 for **both `main` and
`develop`**:

- All changes require a pull request, including changes by administrators.
- Required GitHub Actions checks: `API checks`, `Web checks` and
  `Container integration`. Checks are tied to the GitHub Actions app.
- PR branches must be up to date with the target branch before merging.
- Review conversations must be resolved.
- Force pushes and branch deletion are blocked.
- Mandatory approving reviews: **zero**, allowing the solo maintainer to merge
  their own PR after CI passes. Stale approvals are dismissed when changes arrive;
  code-owner and last-push approval requirements are disabled.
- Linear history is not required, preserving release/hotfix merge commits.

The manual publishing job is intentionally not a required check. The three
required check names had successful hosted runs before protection was activated.
Any later protection changes need owner approval; do not bypass protections to
work around a failed or pending check.

If GitHub reports a branch is behind, update the PR branch through a merge and
wait for fresh CI. For a protected long-lived branch such as `develop`, bring
`main` back through a synchronization PR rather than pushing directly. Preserve
both histories and do not force-push. The branch protection requirement does not
change the Railway branch mapping.

See [CI](ci.md) for local commands, failure diagnosis and verified Railway settings.
