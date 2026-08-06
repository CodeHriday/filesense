#!/bin/bash
set -e

echo "Running post-merge setup..."

# Install Node.js dependencies (non-interactive)
npm install --no-audit --no-fund 2>&1 | tail -5

echo "Post-merge setup complete."
