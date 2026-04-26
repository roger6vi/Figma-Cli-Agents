#!/usr/bin/env bash
set -euo pipefail

usage() {
	cat <<'HELP'
Usage: ./scripts/release.sh [options] <current|patch|minor|major>

Options:
  --yes, -y       Skip confirmation prompts
  --dry-run       Validate prerequisites and tests without committing/tagging
  --help, -h      Show this help

Environment:
  RELEASE_NOTES_FILE   Required path to release notes markdown
  GH_REPO              Optional GitHub repo override, e.g. roger6vi/Figma-Cli-Agents
  TARGET_BRANCH        Branch to push release commit to (default: main)
HELP
}

AUTO_YES=false
DRY_RUN=false
INCREMENT=""

for arg in "$@"; do
	case "$arg" in
		--yes|-y) AUTO_YES=true ;;
		--dry-run) DRY_RUN=true ;;
		--help|-h) usage; exit 0 ;;
		current|patch|minor|major)
			if [[ -n "$INCREMENT" ]]; then
				echo "Error: only one increment accepted" >&2
				exit 1
			fi
			INCREMENT="$arg"
			;;
		*)
			echo "Error: unknown argument '$arg'" >&2
			exit 1
			;;
	esac
done

if [[ -z "$INCREMENT" ]]; then
	echo "Error: missing increment (current, patch, minor, major)" >&2
	exit 1
fi

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

RELEASE_NOTES_FILE="${RELEASE_NOTES_FILE:-}"
TARGET_BRANCH="${TARGET_BRANCH:-main}"
GH_REPO="${GH_REPO:-}"

require_cmd() {
	command -v "$1" >/dev/null 2>&1 || { echo "Error: missing command '$1'" >&2; exit 1; }
}

confirm_or_skip() {
	local message="$1"
	if [[ "$AUTO_YES" == true ]]; then
		echo "(--yes) $message"
		return 0
	fi
	read -rp "$message (y/N): " CONFIRM
	[[ "$CONFIRM" == "y" || "$CONFIRM" == "Y" ]]
}

validate_signing() {
	local format key
	format="$(git config --get gpg.format || true)"
	[[ "$format" == "ssh" ]] || { echo "Error: gpg.format must be ssh" >&2; exit 1; }
	key="$(git config --get user.signingkey || true)"
	[[ -n "$key" ]] || { echo "Error: user.signingkey is not configured" >&2; exit 1; }
	if [[ "$key" == /* && ! -f "$key" ]]; then
		echo "Error: signing key '$key' not found" >&2
		exit 1
	fi
}

read_version() {
	node -p "require('./package.json').version"
}

bump_version() {
	local current="$1"
	local increment="$2"
	local major minor patch
	IFS='.' read -r major minor patch <<< "$current"
	case "$increment" in
		current) echo "$current" ;;
		patch) echo "${major}.${minor}.$((patch + 1))" ;;
		minor) echo "${major}.$((minor + 1)).0" ;;
		major) echo "$((major + 1)).0.0" ;;
	esac
}

update_changelog() {
	local notes_file="$1"
	[[ -f CHANGELOG.md ]] || printf '# Changelog\n\n' > CHANGELOG.md
	local tmp
	tmp="$(mktemp)"
	awk -v notes="$notes_file" '
		BEGIN { inserted = 0; while ((getline line < notes) > 0) notes_block = notes_block line "\n"; close(notes) }
		/^## \[/ && inserted == 0 { printf "%s\n", notes_block; inserted = 1 }
		{ print }
		END { if (inserted == 0) printf "\n%s\n", notes_block }
	' CHANGELOG.md > "$tmp"
	mv "$tmp" CHANGELOG.md
}

CURRENT_VERSION="$(read_version)"
NEW_VERSION="$(bump_version "$CURRENT_VERSION" "$INCREMENT")"
TAG="v${NEW_VERSION}"

echo "Release: current=v${CURRENT_VERSION} new=${TAG} target=${TARGET_BRANCH}"

require_cmd git
require_cmd gh
require_cmd npm
require_cmd node
gh auth status >/dev/null 2>&1 || { echo "Error: gh is not authenticated" >&2; exit 1; }
validate_signing

[[ -n "$RELEASE_NOTES_FILE" ]] || { echo "Error: RELEASE_NOTES_FILE is required" >&2; exit 1; }
[[ -f "$RELEASE_NOTES_FILE" ]] || { echo "Error: RELEASE_NOTES_FILE not found: $RELEASE_NOTES_FILE" >&2; exit 1; }

if [[ -n "$(git status --porcelain=v1)" ]]; then
	echo "Error: working tree dirty. Commit changes before release." >&2
	git status --short >&2
	exit 1
fi

git fetch --tags origin >/dev/null 2>&1 || true
if git rev-parse "$TAG" >/dev/null 2>&1; then
	echo "Error: tag $TAG already exists locally" >&2
	exit 1
fi
if git ls-remote --tags origin "refs/tags/$TAG" 2>/dev/null | grep -q "$TAG"; then
	echo "Error: tag $TAG already exists on origin" >&2
	exit 1
fi

echo "Running tests..."
npm test

if [[ "$DRY_RUN" == true ]]; then
	echo "Dry run OK for $TAG"
	exit 0
fi

confirm_or_skip "Create release $TAG and push HEAD:${TARGET_BRANCH}?" || { echo "Cancelled."; exit 0; }

if [[ "$INCREMENT" != "current" ]]; then
	npm version "$NEW_VERSION" --no-git-tag-version
fi

TMP_NOTES="$(mktemp)"
if grep -q '^## \[' "$RELEASE_NOTES_FILE"; then
	cp "$RELEASE_NOTES_FILE" "$TMP_NOTES"
else
	{
		printf '## [%s] — %s\n\n' "$TAG" "$(date +%F)"
		cat "$RELEASE_NOTES_FILE"
	} > "$TMP_NOTES"
fi
printf '\n' >> "$TMP_NOTES"

update_changelog "$TMP_NOTES"

git add package.json package-lock.json CHANGELOG.md scripts/release.sh
if [[ -z "$(git diff --cached --name-only)" ]]; then
	echo "Error: nothing staged for release commit" >&2
	rm -f "$TMP_NOTES"
	exit 1
fi

git commit -S -m "release: $TAG"
git tag -s "$TAG" -m "$TAG"
git push origin "HEAD:${TARGET_BRANCH}"
git push origin "$TAG"

if [[ -n "$GH_REPO" ]]; then
	gh release create "$TAG" --repo "$GH_REPO" --notes-file "$TMP_NOTES" --title "$TAG" --latest
else
	gh release create "$TAG" --notes-file "$TMP_NOTES" --title "$TAG" --latest
fi

rm -f "$TMP_NOTES"
echo "Release $TAG published."
