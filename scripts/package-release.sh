#!/usr/bin/env bash
# Build Linux deb + tar.gz (+ optional Windows if wine available)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "→ Building AgentVault"
npm run build

echo "→ Packaging Linux"
npx electron-builder --linux deb tar.gz AppImage --x64

# Portable tar of linux-unpacked for curl installer
if [ -d release/linux-unpacked ]; then
  echo "→ Creating AgentVault-linux-amd64.tar.gz"
  tar -C release/linux-unpacked -czf release/AgentVault-linux-amd64.tar.gz .
fi

if command -v wine >/dev/null 2>&1 || [ "${FORCE_WIN:-}" = "1" ]; then
  echo "→ Packaging Windows"
  npx electron-builder --win nsis portable --x64 || echo "Windows build skipped/failed"
else
  echo "→ Skipping Windows binary (install wine or build on Windows / GitHub Actions)"
fi

echo "→ Artifacts in release/"
ls -lh release/*.{deb,AppImage,tar.gz,exe} 2>/dev/null || ls -lh release/ | head -30
