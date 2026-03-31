#!/bin/bash

# Adds fig-start and figma-cli aliases to ~/.zshrc (or ~/.bashrc)

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FIG_START_ALIAS="alias fig-start='$REPO_DIR/bin/fig-start'"
FIGMA_CLI_ALIAS="alias figma-cli='$REPO_DIR/bin/figma-cli'"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

sed_in_place() {
    if sed --version >/dev/null 2>&1; then
        sed -i "$1" "$2"
    else
        sed -i '' "$1" "$2"
    fi
}

# Detect shell config file
if [ -n "$ZSH_VERSION" ] || [ "$SHELL" = "/bin/zsh" ]; then
    RC_FILE="$HOME/.zshrc"
else
    RC_FILE="$HOME/.bashrc"
fi

# Remove old aliases first so path changes are picked up cleanly
if grep -q "alias fig-start=" "$RC_FILE" 2>/dev/null; then
    sed_in_place "/alias fig-start=/d" "$RC_FILE"
fi

if grep -q "alias figma-cli=" "$RC_FILE" 2>/dev/null; then
    sed_in_place "/alias figma-cli=/d" "$RC_FILE"
fi

# Add aliases
echo "" >> "$RC_FILE"
echo "# Figma CLI" >> "$RC_FILE"
echo "$FIG_START_ALIAS" >> "$RC_FILE"
echo "$FIGMA_CLI_ALIAS" >> "$RC_FILE"

# Save repo path to config
mkdir -p "$HOME/.figma-cli"
python3 -c "
import json, os
path = os.path.expanduser('~/.figma-cli/config.json')
cfg = {}
if os.path.exists(path):
    with open(path) as f: cfg = json.load(f)
cfg['repoPath'] = '$REPO_DIR'
with open(path, 'w') as f: json.dump(cfg, f, indent=2)
"

echo ""
echo -e "  ${GREEN}Done!${NC} Added ${BOLD}fig-start${NC} and ${BOLD}figma-cli${NC} aliases to ${BOLD}$RC_FILE${NC}"
echo ""
echo -e "  Now run: ${BOLD}source $RC_FILE${NC}"
echo -e "  Then type: ${BOLD}fig-start${NC}"
echo ""
