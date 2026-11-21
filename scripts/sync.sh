#!/usr/bin/env bash
# Ship the current claude/ or codex/ branch to GitLab production or development.
#
#   ./scripts/sync.sh                    # merge into main, tag, and mirror main to GitHub
#   ./scripts/sync.sh --dev              # merge into dev without creating a tag
#   ./scripts/sync.sh --dev --dry-run    # show the development sync only
#   ./scripts/sync.sh --dry-run          # show the production release only
#
# Development happens on GitHub, on a branch named `claude/…` or `codex/…`. The deploy
# pipeline lives on GitLab and fires on tags. This is the one command that
# joins the two: it brings GitLab's `main` up to date, merges the branch into
# it, tags that merge with the next release number, and pushes — which is what
# starts the production deploy. With --dev it performs the same guarded merge
# into GitLab's dev branch, but creates no tag.
#
# A production release ends by mirroring that same main back to GitHub, and
# that step exists for a reader rather than for a deploy. GitLab is where this
# platform is released from, so GitLab's main is the truth — but a coding
# assistant working on this repository, or on one of the several apps that
# depend on it, only ever sees `origin`. Without the mirror, GitHub's main
# stops at whatever was released last time somebody remembered to push it, and
# every assistant that branches from main starts from a platform that no longer
# exists. With it, `origin/main` is always the last thing that actually
# deployed.
#
# It touches a shared remote and creates a tag that names a release, so it
# refuses to guess. Every check below fails with the command that fixes it
# rather than picking a resolution on your behalf.
#
# Byte-identical copies live in the sibling repositories — allblobs releases
# the site, large-platform releases the models it talks to, card-reader-api
# releases the service that reads the cards, and all three ship the same way.
# Keep them in step; `diff` between the copies is the check.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}" || exit 1

DRY_RUN="no"
DEPLOY_TARGET="production"
usage() {
  echo "usage: $0 [--dev] [--dry-run]" >&2
}
while [ "$#" -gt 0 ]; do
  case "$1" in
    --dev) DEPLOY_TARGET="development" ;;
    --dry-run) DRY_RUN="yes" ;;
    -h|--help) usage; exit 0 ;;
    *) usage; exit 2 ;;
  esac
  shift
done

say()  { printf '\n\033[1m==\033[0m %s\n' "$1"; }
info() { printf '   %s\n' "$1"; }
die()  { printf '\n\033[1;31merror:\033[0m %s\n' "$1" >&2; exit 1; }

# In dry-run, print the command instead of running it. Read-only git commands
# are called directly throughout; commands that change something go
# through here, so a dry run cannot have a side effect by omission.
run() {
  if [ "${DRY_RUN}" = "yes" ]; then
    printf '   \033[2mwould run:\033[0m %s\n' "$*"
  else
    info "$*"
    "$@"
  fi
}

# --------------------------------------------------------------------------
# 0. a clean tree
# --------------------------------------------------------------------------
# Checked first because everything after it is a checkout or a merge, and both
# fail halfway through on a dirty tree — leaving you on a different branch than
# you started on, wondering what happened.
if [ -n "$(git status --porcelain)" ]; then
  git status --short
  die "the working tree has uncommitted changes. Commit or stash them first."
fi

# --------------------------------------------------------------------------
# 1. origin must be GitHub, and the GitLab remote must be GitLab
# --------------------------------------------------------------------------

# Host out of any of the three URL spellings git accepts:
#   https://gitlab.com/me/x.git      git@gitlab.com:me/x.git
#   ssh://git@gitlab.com:22/me/x.git
url_host() {
  printf '%s' "$1" | sed -E 's#^[a-zA-Z][a-zA-Z0-9+.-]*://##; s#^[^/@]*@##; s#[:/].*$##'
}

# The *configured* URL, not `git remote get-url`. They differ whenever a
# url.<base>.insteadOf rule is in play — get-url returns the rewritten
# transport URL, which for an ssh-rewrite or a local mirror is not the thing
# anybody thinks of as "the GitHub remote". This is also what the error
# messages below tell you to fix, so the check and the remedy agree.
remote_url() {
  git config --get "remote.$1.url"
}

# A scp-style URL is not something a browser can open, so the pipeline hint at
# the end turns it back into https.
web_url() {
  printf '%s' "$1" \
    | sed -E 's#^[a-zA-Z][a-zA-Z0-9+.-]*://##; s#^[^/@]*@##; s#^([^:/]+):#\1/#; s#\.git$##' \
    | sed -E 's#^#https://#'
}

if [ -z "$(remote_url origin || true)" ]; then
  die "no 'origin' remote. Expected origin to be the GitHub repository."
fi

ORIGIN_URL="$(remote_url origin)"
ORIGIN_HOST="$(url_host "${ORIGIN_URL}")"
case "${ORIGIN_HOST}" in
  *github*) ;;
  *) die "origin is '${ORIGIN_URL}' (host '${ORIGIN_HOST}'), which is not a GitHub repository.
       This script expects origin to be GitHub and a second remote to be GitLab.
       Fix with: git remote set-url origin git@github.com:<owner>/<repo>.git" ;;
esac

# GITLAB_REMOTE names the remote explicitly. That escape hatch exists because
# plenty of self-hosted GitLab lives at git.example.com, where no amount of
# looking at the hostname will tell you what is behind it. Naming it is a
# deliberate act; guessing wrong would push a release to the wrong server.
if [ -n "${GITLAB_REMOTE:-}" ]; then
  if [ -z "$(remote_url "${GITLAB_REMOTE}" || true)" ]; then
    die "GITLAB_REMOTE is set to '${GITLAB_REMOTE}', but no such remote exists.
       Remotes here: $(git remote | tr '\n' ' ')"
  fi
  GITLAB_URL="$(remote_url "${GITLAB_REMOTE}")"
  GITLAB_HOST="$(url_host "${GITLAB_URL}")"
  # Still refuse the one mistake that matters: pointing both at GitHub.
  if [ "${GITLAB_HOST}" = "${ORIGIN_HOST}" ]; then
    die "GITLAB_REMOTE '${GITLAB_REMOTE}' is on the same host as origin (${ORIGIN_HOST}).
       That is GitHub, not GitLab — nothing would deploy."
  fi
else
  GITLAB_REMOTE=""
  for remote in $(git remote); do
    host="$(url_host "$(remote_url "${remote}")")"
    case "${host}" in
      *gitlab*)
        if [ -n "${GITLAB_REMOTE}" ]; then
          die "more than one remote looks like GitLab ('${GITLAB_REMOTE}' and '${remote}').
       Choose one: GITLAB_REMOTE=${remote} $0"
        fi
        GITLAB_REMOTE="${remote}"
        ;;
    esac
  done
  if [ -z "${GITLAB_REMOTE}" ]; then
    die "no remote points at a GitLab host. Remotes here: $(git remote | tr '\n' ' ')
       Add one:  git remote add gitlab git@gitlab.com:<group>/<project>.git
       Or, for self-hosted GitLab on a host that is not named 'gitlab',
       name it explicitly:  GITLAB_REMOTE=<name> $0"
  fi
  GITLAB_URL="$(remote_url "${GITLAB_REMOTE}")"
  GITLAB_HOST="$(url_host "${GITLAB_URL}")"
fi

say "remotes"
info "github: origin           -> ${ORIGIN_URL}"
info "gitlab: ${GITLAB_REMOTE}  -> ${GITLAB_URL}"

# --------------------------------------------------------------------------
# 2. the branch we are shipping
# --------------------------------------------------------------------------
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
case "${BRANCH}" in
  claude/*|codex/*) ;;
  HEAD) die "HEAD is detached. Check out the claude/… or codex/… branch you want to ship." ;;
  *) die "current branch is '${BRANCH}', which does not start with 'claude/' or 'codex/'.
       This script ships a claude/ or codex/ branch to GitLab; run it from that branch." ;;
esac
say "shipping branch"
info "${BRANCH}"

# --------------------------------------------------------------------------
# 3. bring the branch up to date from GitHub
# --------------------------------------------------------------------------
say "pulling ${BRANCH} from origin"
if git rev-parse --verify --quiet "refs/remotes/origin/${BRANCH}" >/dev/null; then
  # --ff-only, not a plain pull: if the branch has diverged from GitHub, the
  # right answer is for you to look at it, not for a release script to invent a
  # merge commit and ship it.
  run git pull --ff-only origin "${BRANCH}" \
    || die "'${BRANCH}' has diverged from origin/${BRANCH}.
       Reconcile it yourself (git rebase origin/${BRANCH}), then re-run."
else
  info "origin has no ${BRANCH} yet — shipping the local branch as it stands"
fi

# Commits that exist only here would land on GitLab and never reach GitHub, so
# the two would disagree about what the release contains. Worth a warning, not
# a refusal: it is a legitimate thing to do deliberately.
if git rev-parse --verify --quiet "refs/remotes/origin/${BRANCH}" >/dev/null; then
  AHEAD="$(git rev-list --count "origin/${BRANCH}..${BRANCH}")"
  if [ "${AHEAD}" != "0" ]; then
    info "WARNING: ${AHEAD} commit(s) on ${BRANCH} are not pushed to GitHub yet."
  fi
fi

BRANCH_HEAD="$(git rev-parse --short HEAD)"

if [ "${DEPLOY_TARGET}" = "development" ]; then
  # Development follows the same merge discipline as a release, so GitLab's
  # dev-only commits are retained and a non-fast-forward push is never hidden
  # behind --force. The only deliberate differences are the target branch and
  # the absence of a release tag.
  say "fetching dev from ${GITLAB_REMOTE}"
  # Asked before fetching, because a bare `git fetch <remote> dev` against a
  # remote without that branch exits 128 with `couldn't find remote ref dev` —
  # and under `set -e` that ends the script right there, so the message below,
  # which is the one worth reading, was never reached. Found by running --dev
  # in allblobs, which has no dev deployment at all and is therefore the
  # repository where this is the *normal* outcome rather than an edge case.
  #
  # ls-remote rather than swallowing the fetch's stderr: this distinguishes
  # "there is no such branch" from "the remote is unreachable", and only the
  # first one gets a friendly answer. A genuine network failure still comes
  # out of the fetch below, loud and unhandled, which is correct.
  git ls-remote --exit-code --heads "${GITLAB_REMOTE}" dev >/dev/null 2>&1 \
    || die "${GITLAB_REMOTE} has no 'dev' branch. Create it before deploying development.
       If this repository has no development deployment, you want a release instead:
         $0"
  git fetch "${GITLAB_REMOTE}" dev
  git rev-parse --verify --quiet "refs/remotes/${GITLAB_REMOTE}/dev" >/dev/null \
    || die "${GITLAB_REMOTE} has no 'dev' branch. Create it before deploying development."

  if [ "$(git rev-list --count "${GITLAB_REMOTE}/dev..${BRANCH}")" = "0" ]; then
    die "'${BRANCH}' has nothing that dev does not already have. Nothing to deploy."
  fi

  say "checking out dev"
  if git rev-parse --verify --quiet refs/heads/dev >/dev/null; then
    run git checkout dev
    run git pull --ff-only "${GITLAB_REMOTE}" dev \
      || die "local 'dev' cannot fast-forward to ${GITLAB_REMOTE}/dev — they have diverged.
       Inspect both branches and reconcile local dev before re-running."
  else
    info "no local 'dev' — creating it from ${GITLAB_REMOTE}/dev"
    run git checkout -b dev "${GITLAB_REMOTE}/dev"
  fi

  say "merging ${BRANCH} (${BRANCH_HEAD}) into dev"
  run git merge --no-ff "${BRANCH}" -m "Deploy development: merge ${BRANCH}" \
    || die "the development merge hit conflicts. Resolve them, then finish by hand:
         git add -A && git commit
         git push ${GITLAB_REMOTE} dev
       Or back out entirely:  git merge --abort"

  say "pushing dev to ${GITLAB_REMOTE}"
  run git push "${GITLAB_REMOTE}" dev

  say "back to ${BRANCH}"
  run git checkout "${BRANCH}"

  if [ "${DRY_RUN}" = "yes" ]; then
    printf '\n\033[1mdry run:\033[0m nothing was changed. %s would deploy to %s dev without a tag.\n' \
      "${BRANCH}" "${GITLAB_REMOTE}"
    exit 0
  fi

  printf '\n\033[1;32msynced.\033[0m %s -> %s dev (no tag)\n' "${BRANCH}" "${GITLAB_REMOTE}"
  # No job is named here, deliberately. This file is one script shared by
  # several repositories and not all of them deploy from dev — allblobs has a
  # single deploy-production and no overlays at all — so naming
  # `deploy-development` would be a lie wherever it does not exist. The `dev`
  # fetch above already refuses early where there is no dev branch, which is
  # the guard that matters.
  info "Pushed dev. Whatever this repository deploys from it is at:"
  info "  $(web_url "${GITLAB_URL}")/-/pipelines"
  info "You are back on ${BRANCH}."
  exit 0
fi

# --------------------------------------------------------------------------
# 4. main, from GitLab
# --------------------------------------------------------------------------
say "fetching main and tags from ${GITLAB_REMOTE}"
# Not routed through run(): the fetch happens even on a dry run. It only moves
# remote-tracking refs, so it cannot touch your work — and without it a dry run
# would work out the next release number from stale tags and confidently tell
# you the wrong one, which is the single thing a dry run exists to get right.
#
# --force is there for the tags. GitLab is the authority for release tags — the
# pipeline fires on them, and the next number below is derived from them — so a
# local tag that disagrees with GitLab's is stale by definition, normally left
# behind when the history it pointed into was rewritten. Without --force one
# such tag breaks this script twice over. `git fetch --tags` exits 1 on the
# first one it meets ("would clobber existing tag"), and under `set -e` that
# ends the release here without printing a reason; surviving that would only
# trade the abort for a wrong release number, because `git describe` below
# reads local tags and would still be reading the stale one. A tag that exists
# only here has nothing on GitLab to disagree with and is left alone; one that
# is actually rewritten is reported by git as `t [tag update]`.
git fetch --tags --force "${GITLAB_REMOTE}" main

git rev-parse --verify --quiet "refs/remotes/${GITLAB_REMOTE}/main" >/dev/null \
  || die "${GITLAB_REMOTE} has no 'main' branch. Push one before releasing from it."

# Whether the mirror at the end will be able to fast-forward, asked now rather
# than after the release has already gone out. Read-only, so it runs on a dry
# run too — which is the point: a dry run should tell you about this before you
# do the real thing, not after.
#
# The test is on GitLab's main rather than on the merge that does not exist
# yet. If GitLab's main already contains everything on GitHub's, the merge
# commit built on top of it does too, so the push fast-forwards. If it does
# not, GitHub has commits GitLab never saw — somebody pushed to GitHub's main
# directly — and no ordering of this script fixes that.
git fetch --quiet origin main 2>/dev/null || true
MIRROR_WILL_FAST_FORWARD="yes"
if git rev-parse --verify --quiet refs/remotes/origin/main >/dev/null; then
  if ! git merge-base --is-ancestor origin/main "${GITLAB_REMOTE}/main"; then
    MIRROR_WILL_FAST_FORWARD="no"
    info "WARNING: origin/main has $(git rev-list --count "${GITLAB_REMOTE}/main..origin/main") commit(s)"
    info "         that ${GITLAB_REMOTE}/main does not. The mirror at the end will be refused."
    info "         Look at them first:  git log ${GITLAB_REMOTE}/main..origin/main"
  fi
else
  info "origin has no main yet — the mirror at the end will create it"
fi

say "checking out main"
if git rev-parse --verify --quiet refs/heads/main >/dev/null; then
  run git checkout main
  # A local `main` in this repo may well be tracking GitHub's main, which is a
  # different history from the one the pipeline deploys. --ff-only turns that
  # into a stop rather than a silent merge of two unrelated mains.
  run git pull --ff-only "${GITLAB_REMOTE}" main \
    || die "local 'main' cannot fast-forward to ${GITLAB_REMOTE}/main — they have diverged.
       If local main is disposable:  git checkout main && git reset --hard ${GITLAB_REMOTE}/main
       Then re-run. (Check what you would lose first: git log ${GITLAB_REMOTE}/main..main)"
else
  info "no local 'main' — creating it from ${GITLAB_REMOTE}/main"
  run git checkout -b main "${GITLAB_REMOTE}/main"
fi

# --------------------------------------------------------------------------
# 5. the next release tag
# --------------------------------------------------------------------------
say "working out the next release tag"

# RELEASE_TAG names the tag outright. The escape hatch matters because the
# arithmetic below can reach a number that is already taken and have no way
# forward — two tags on one commit, for instance, where `git describe` keeps
# answering with the older of them however often you fetch. Rather than leave
# you stuck, name the tag:  RELEASE_TAG=release-12 ./scripts/sync.sh
if [ -n "${RELEASE_TAG:-}" ]; then
  NEW_TAG="${RELEASE_TAG}"
  LAST_TAG="(overridden)"
  # Only for the "tags with this prefix" hint below, which must still work when
  # nothing was parsed.
  TAG_PREFIX="${NEW_TAG%-*}"
  info "RELEASE_TAG is set; using ${NEW_TAG} without incrementing anything"
else
  # --abbrev=0 is load bearing. Plain `git describe` on a commit that is not
  # itself tagged returns `release-7-3-gabc1234` — and the rule below, "the
  # digits after the last dash", would then read `gabc1234`, find no number,
  # and either fail or silently produce a nonsense tag. --abbrev=0 returns the
  # bare name of the closest tag, which is the thing being incremented.
  #
  # Described against the remote-tracking ref rather than HEAD. After the pull
  # above these are the same commit, but on a dry run the checkout was skipped —
  # and a number worked out from whatever branch you happened to be standing on
  # is not the number that would ship.
  LAST_TAG="$(git describe --tags --abbrev=0 "${GITLAB_REMOTE}/main" 2>/dev/null || true)"
  if [ -z "${LAST_TAG}" ]; then
    die "no tags are reachable from ${GITLAB_REMOTE}/main, so there is no release number to increment.
         Create the first one and push it, then re-run:
           git tag -a release-0 -m 'first release' && git push ${GITLAB_REMOTE} release-0"
  fi

  # Everything up to the last dash is the prefix; everything after it must be
  # the number.
  case "${LAST_TAG}" in
    *-*) ;;
    *) die "the latest tag is '${LAST_TAG}', which has no '-'.
         This script increments the digits after the last dash, e.g. release-7 -> release-8." ;;
  esac
  TAG_PREFIX="${LAST_TAG%-*}"
  TAG_NUMBER="${LAST_TAG##*-}"

  case "${TAG_NUMBER}" in
    ''|*[!0-9]*) die "the latest tag is '${LAST_TAG}', and '${TAG_NUMBER}' after the last '-' is not a number.
         Expected something like release-7, v2-14, deploy-003." ;;
  esac

  # 10# forces base ten. Without it, bash reads a zero-padded 08 or 09 as octal
  # and dies with "value too great for base" — on exactly two of every ten
  # releases, which is a wonderful bug to meet on a Friday.
  NEXT_NUMBER="$((10#${TAG_NUMBER} + 1))"
  # Keep the zero padding if the old tag had it, so tags keep sorting the way
  # they look: release-009 -> release-010, not release-10.
  if [ "${#TAG_NUMBER}" -gt 1 ] && [ "${TAG_NUMBER#0}" != "${TAG_NUMBER}" ]; then
    NEW_TAG="$(printf '%s-%0*d' "${TAG_PREFIX}" "${#TAG_NUMBER}" "${NEXT_NUMBER}")"
  else
    NEW_TAG="${TAG_PREFIX}-${NEXT_NUMBER}"
  fi

  info "latest: ${LAST_TAG}"
  info "next:   ${NEW_TAG}"
fi

# describe finds the closest tag *reachable from HEAD*. A tag created on a
# branch that never merged is invisible to it, so the number it suggests can
# already be taken. Better to stop here than at the push, after the merge has
# been made and tagged.
taken=""
if git rev-parse --verify --quiet "refs/tags/${NEW_TAG}" >/dev/null; then
  taken="locally"
elif git ls-remote --tags --exit-code "${GITLAB_REMOTE}" "refs/tags/${NEW_TAG}" >/dev/null 2>&1; then
  taken="on ${GITLAB_REMOTE}"
fi
if [ -n "${taken}" ]; then
  # Deliberately not "fetch and retry". When two tags sit on the same commit,
  # `git describe` keeps naming the older one no matter how often you fetch,
  # and the arithmetic lands on the same taken number forever. Show what
  # exists and let the release be named.
  die "tag '${NEW_TAG}' already exists ${taken}, so it cannot be created here.
       Tags with this prefix:
$(git tag -l "${TAG_PREFIX}-*" | sort -V | tail -5 | sed 's/^/         /')
       Name the release yourself and re-run:
         RELEASE_TAG=<tag> $0"
fi

# --------------------------------------------------------------------------
# 6. merge, tag, push
# --------------------------------------------------------------------------
say "merging ${BRANCH} (${BRANCH_HEAD}) into main"
if [ "$(git rev-list --count "${GITLAB_REMOTE}/main..${BRANCH}")" = "0" ]; then
  die "'${BRANCH}' has nothing that main does not already have. Nothing to release."
fi

# --no-ff so the release is always its own merge commit. On a fast-forward the
# tag would land on the last commit of the branch instead, which still deploys
# but makes "what shipped in release-8" a question about topology rather than
# something you can read off one commit.
run git merge --no-ff "${BRANCH}" -m "Release ${NEW_TAG}: merge ${BRANCH}" \
  || die "the merge hit conflicts. Resolve them, then finish by hand:
         git add -A && git commit
         git tag -a ${NEW_TAG} -m 'Release ${NEW_TAG}'
         git push ${GITLAB_REMOTE} main && git push ${GITLAB_REMOTE} ${NEW_TAG}
       Or back out entirely:  git merge --abort"

say "tagging the merge commit"
run git tag -a "${NEW_TAG}" -m "Release ${NEW_TAG}: ${BRANCH} (${BRANCH_HEAD})"

# Branch first, then tag. Both pushes create a pipeline; this order means the
# deploy pipeline — the one the tag triggers — is created last, against a main
# that already contains the commit it is deploying.
say "pushing to ${GITLAB_REMOTE}"
run git push "${GITLAB_REMOTE}" main
run git push "${GITLAB_REMOTE}" "${NEW_TAG}"

# --------------------------------------------------------------------------
# 7. mirror main back to GitHub
# --------------------------------------------------------------------------
# Local main is the commit just pushed to GitLab, so this pushes exactly what
# was released and nothing else.
#
# A plain push, never --force and never --force-with-lease. A force here would
# discard whatever is on GitHub's main, and GitHub's main is the branch every
# coding assistant on this repository and on the apps around it starts from —
# so the one case where forcing feels tempting, "the histories disagree", is
# precisely the case where somebody has to look at them. The step before the
# merge already warned that this was coming.
#
# The tag is deliberately not mirrored. Tags are what the GitLab pipeline fires
# on; on GitHub they would be decoration, and pushing them would make the two
# remotes' tag namespaces something else to keep in step.
say "mirroring main to origin (GitHub)"
if [ "${MIRROR_WILL_FAST_FORWARD}" = "no" ]; then
  # Not a die: the release itself succeeded and is deploying. Saying "error"
  # here would read as though it had not.
  info "SKIPPED: origin/main and ${GITLAB_REMOTE}/main have diverged."
  info "Reconcile them by hand, then:  git push origin main"
elif ! run git push origin main; then
  die "the release shipped and is deploying, but mirroring main to GitHub failed.
       GitLab has ${NEW_TAG}; GitHub's main is behind until this is done:
         git push origin main
       Assistants branching from origin/main will be working from an older
       platform until then."
fi

# Back to where you started. Releasing is not a reason to change branch, and
# being left on main is how the next commit lands somewhere nobody meant.
#
# ${BRANCH}, not a hardcoded name: this is whichever claude/ or codex/ branch was checked
# out when the script began, so it is right whatever you are working on.
#
# Only reached on the happy path — a merge conflict exits above with the tree
# mid-merge, which is exactly where you need to be to resolve it.
say "back to ${BRANCH}"
run git checkout "${BRANCH}"

# --------------------------------------------------------------------------
# done
# --------------------------------------------------------------------------
if [ "${DRY_RUN}" = "yes" ]; then
  printf '\n\033[1mdry run:\033[0m nothing was changed. %s would ship as %s.\n' "${BRANCH}" "${NEW_TAG}"
  if [ "${MIRROR_WILL_FAST_FORWARD}" = "yes" ]; then
    info "and ${GITLAB_REMOTE}/main would then be mirrored to origin/main."
  else
    info "the mirror to origin/main would be skipped — see the warning above."
  fi
  exit 0
fi

printf '\n\033[1;32msynced.\033[0m %s -> %s main, tagged %s\n' "${BRANCH}" "${GITLAB_REMOTE}" "${NEW_TAG}"
if [ "${MIRROR_WILL_FAST_FORWARD}" = "yes" ]; then
  info "origin/main now matches ${GITLAB_REMOTE}/main, so anything branching from"
  info "main starts from what is deployed."
else
  info "origin/main was NOT updated — see the note above."
fi
info "The tag push starts deploy-production. Watch it at:"
info "  $(web_url "${GITLAB_URL}")/-/pipelines"
info "You are back on ${BRANCH}."

# Non-zero when the mirror did not happen, and only then. The release itself
# succeeded either way — which is why the skip above is not a `die`, and why
# this comes after the summary and after the checkout back. But the mirror is
# part of what this script does now, so a run that silently reports success
# while origin/main is stale is the failure this whole step exists to prevent.
[ "${MIRROR_WILL_FAST_FORWARD}" = "yes" ]
