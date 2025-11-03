#!/bin/bash

# ClamAV Virus Definitions Initialization Script
# This script downloads and initializes virus definitions for ClamAV

CLAMAV_DIR="/home/runner/.clamav"

echo "Initializing ClamAV virus definitions..."

# Create directory if it doesn't exist
mkdir -p "$CLAMAV_DIR"

# Check if freshclam is available
if ! command -v freshclam &> /dev/null; then
    echo "Error: freshclam not found. Please install ClamAV."
    exit 1
fi

# Create freshclam configuration
cat > "$CLAMAV_DIR/freshclam.conf" <<EOF
DatabaseDirectory $CLAMAV_DIR
UpdateLogFile $CLAMAV_DIR/freshclam.log
LogVerbose yes
DatabaseMirror database.clamav.net
EOF

echo "Downloading virus definitions (this may take a few minutes)..."

# Download virus definitions
freshclam --config-file="$CLAMAV_DIR/freshclam.conf" --datadir="$CLAMAV_DIR"

if [ $? -eq 0 ]; then
    echo "✓ Virus definitions downloaded successfully"
    echo "Database location: $CLAMAV_DIR"
    ls -lh "$CLAMAV_DIR"/*.cvd 2>/dev/null || ls -lh "$CLAMAV_DIR"/*.cld 2>/dev/null
    exit 0
else
    echo "Error: Failed to download virus definitions"
    exit 1
fi
