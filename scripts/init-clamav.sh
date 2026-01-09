#!/bin/bash

# ClamAV Virus Definitions Initialization Script
# This script downloads and initializes virus definitions for ClamAV
# Updated to use Microsoft mirror for more reliable downloads

CLAMAV_DIR="/home/runner/.clamav"
MICROSOFT_MIRROR="https://packages.microsoft.com/clamav"

echo "Initializing ClamAV virus definitions..."

# Create directory if it doesn't exist
mkdir -p "$CLAMAV_DIR"

# Function to download with retry
download_with_retry() {
    local url="$1"
    local output="$2"
    local max_retries=3
    local retry=0
    
    while [ $retry -lt $max_retries ]; do
        echo "Downloading $(basename $output) (attempt $((retry + 1))/$max_retries)..."
        if curl -L -f -o "$output" --connect-timeout 30 --max-time 300 "$url" 2>/dev/null; then
            echo "Downloaded $(basename $output) successfully"
            return 0
        fi
        retry=$((retry + 1))
        sleep 2
    done
    
    echo "Failed to download $(basename $output) after $max_retries attempts"
    return 1
}

# Check if we need to download or update virus definitions
# Only download if files are missing or older than 7 days
need_update=false

for db_file in main.cvd daily.cvd bytecode.cvd; do
    if [ ! -f "$CLAMAV_DIR/$db_file" ]; then
        need_update=true
        echo "Missing: $db_file"
    elif [ $(find "$CLAMAV_DIR/$db_file" -mtime +7 2>/dev/null | wc -l) -gt 0 ]; then
        need_update=true
        echo "Outdated: $db_file (older than 7 days)"
    fi
done

if [ "$need_update" = false ]; then
    echo "Virus definitions are up to date"
    ls -lh "$CLAMAV_DIR"/*.cvd 2>/dev/null
    exit 0
fi

echo "Downloading virus definitions from Microsoft mirror..."
echo "This may take a few minutes..."

# Download each database file from Microsoft mirror
download_success=true

for db_file in main.cvd daily.cvd bytecode.cvd; do
    if ! download_with_retry "$MICROSOFT_MIRROR/$db_file" "$CLAMAV_DIR/$db_file"; then
        download_success=false
        # Try alternative: official ClamAV server as fallback
        echo "Trying official ClamAV server as fallback for $db_file..."
        if ! download_with_retry "http://database.clamav.net/$db_file" "$CLAMAV_DIR/$db_file"; then
            echo "ERROR: Could not download $db_file from any source"
        fi
    fi
done

# Verify at least the essential databases exist
if [ -f "$CLAMAV_DIR/main.cvd" ] && [ -f "$CLAMAV_DIR/daily.cvd" ]; then
    echo ""
    echo "Virus definitions downloaded successfully!"
    echo "Database location: $CLAMAV_DIR"
    ls -lh "$CLAMAV_DIR"/*.cvd 2>/dev/null
    
    # Test that clamscan can load the databases
    if command -v clamscan &> /dev/null; then
        echo ""
        echo "Verifying database integrity..."
        if clamscan --database="$CLAMAV_DIR" --version &>/dev/null; then
            echo "Database verification passed"
        else
            echo "Warning: Database verification failed, but files exist"
        fi
    fi
    
    exit 0
else
    echo ""
    echo "ERROR: Failed to download required virus definitions"
    echo "Virus scanning will be unavailable"
    exit 1
fi
