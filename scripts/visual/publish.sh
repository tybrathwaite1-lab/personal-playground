#!/usr/bin/env bash
# Publish a visual-check run to the `visual-results` branch:
#   visual-results/<branch-with-slashes-as-dashes>/{REPORT.md, report.json, <width>/*.jpg, states/*.jpg}
#
# The branch holds only the LATEST run per source branch, as a single parentless commit
# (force-pushed), so screenshots never accumulate in history. Folders for branches that
# no longer exist are pruned. Run history stays in the Actions logs and artifacts.
#
# Usage: scripts/visual/publish.sh <out-dir> <branch-name> <commit-sha>
set -euo pipefail
shopt -s nullglob

OUT="$(cd "$1" && pwd)"
FOLDER="$(echo "$2" | tr '/' '-')"
SHA="$3"
TARGET=visual-results

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

WORK="$(mktemp -d)"
if git fetch --quiet --depth=1 origin "$TARGET" 2>/dev/null; then
  git worktree add --quiet --detach "$WORK" FETCH_HEAD
else
  git worktree add --quiet --detach "$WORK" HEAD
  (cd "$WORK" && git rm -rq --ignore-unmatch . && rm -rf -- ./*)
fi

cd "$WORK"
rm -rf -- "$FOLDER"
mkdir -p "$FOLDER"
cp -R "$OUT/." "$FOLDER/"

# Prune folders whose source branch is gone (main always stays).
LIVE="$(git ls-remote --heads origin | awk '{print $2}' | sed 's#refs/heads/##' | tr '/' '-')"
for d in */; do
  d="${d%/}"
  if [ "$d" != "main" ] && ! grep -qxF "$d" <<<"$LIVE"; then rm -rf -- "$d"; fi
done

{
  echo "# Visual check results"
  echo
  echo "Latest screenshot and accessibility run for each branch, published by \`.github/workflows/visual.yml\`."
  echo "Synthetic fixtures and a frozen clock only; no personal data. This branch is rewritten on every run."
  echo
  echo "| Branch | Commit | Report |"
  echo "|---|---|---|"
  for d in */; do
    d="${d%/}"
    c="$(sed -n 's/.*"commit": *"\([0-9a-f]\{7\}\).*/\1/p' "$d/report.json" 2>/dev/null | head -1)"
    echo "| \`$d\` | \`${c:-?}\` | [REPORT.md]($d/REPORT.md) |"
  done
} > README.md

git add -A
TREE="$(git write-tree)"
COMMIT="$(git commit-tree "$TREE" -m "Visual results: $FOLDER @ ${SHA:0:7}")"
git push --quiet --force origin "$COMMIT:refs/heads/$TARGET"
echo "Published $FOLDER @ ${SHA:0:7} → $TARGET"
