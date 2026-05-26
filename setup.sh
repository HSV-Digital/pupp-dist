#!/bin/bash
set -euo pipefail

echo ""
echo "Checking prerequisites..."

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install Node.js 20 or later."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. Install Docker Desktop or a compatible Docker engine."
  exit 1
fi

echo "Prerequisites met"
echo ""

npm install --ignore-scripts
npm run setup
