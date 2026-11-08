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

## Recommended branch protection (requires owner approval)

The initial audit on 2026-11-06 found no repository rulesets and no protection on
`main`. No settings were changed. `develop` was created from verified `origin/main`
commit `1a8e770cb0ad2216bf9cb293d54f6bfdc2015bce`.

For **both** `main` and `develop`, require PRs, resolved review conversations and
successful `API checks`, `Web checks` and `Container integration` checks; prevent
force pushes and branch deletion. Require branches to be up to date before
merging. Restrict direct pushes to `main` where supported. Do not require linear
history if using the release/hotfix merge-commit strategy above.

Activate required checks only after these exact job names have appeared in
successful GitHub runs. Do not require the skipped manual publishing job.
For a solo maintainer, require PRs with zero mandatory approvals (authors cannot
approve their own PRs); use one approval when another reviewer is available.
Settings changes need separate approval; unavailable plan/permission features
must be reported, not bypassed.

See [CI](ci.md) for local commands, failure diagnosis and Railway compatibility.
