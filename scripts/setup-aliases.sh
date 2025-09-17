#!/bin/bash

# Setup aliases for Goose development
echo "Setting up Goose development aliases..."

# Add to your shell profile (bash/zsh)
if [[ "$SHELL" == *"zsh"* ]]; then
    SHELL_RC="$HOME/.zshrc"
elif [[ "$SHELL" == *"bash"* ]]; then
    SHELL_RC="$HOME/.bashrc"
else
    SHELL_RC="$HOME/.profile"
fi

# Create aliases
cat >> "$SHELL_RC" << 'EOF'

# Goose development aliases
alias goose-cleanup="just cleanup"
alias goose-test-server="just test-server"
alias goose-build="cargo build --release"
alias goose-kill="pkill -f goosed; pkill -f goose"

EOF

echo "✅ Aliases added to $SHELL_RC"
echo "Run 'source $SHELL_RC' or restart your shell to use:"
echo "  - goose-cleanup: Clean up leftover processes"
echo "  - goose-test-server: Start test server with cleanup"
echo "  - goose-build: Build release version"
echo "  - goose-kill: Force kill all Goose processes"
