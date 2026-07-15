#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# AgentVault — one-line Linux install
#
#   curl -fsSL https://raw.githubusercontent.com/CodexNexor/agentvault/main/scripts/install.sh | bash
#
# ─────────────────────────────────────────────────────────────
set -euo pipefail

REPO="${AGENTVAULT_REPO:-CodexNexor/agentvault}"
VERSION="${AGENTVAULT_VERSION:-latest}"
INSTALL_DIR="${AGENTVAULT_INSTALL_DIR:-$HOME/.local/share/AgentVault}"
BIN_DIR="${AGENTVAULT_BIN_DIR:-$HOME/.local/bin}"
DESKTOP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICON_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/256x256/apps"

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║         AgentVault Installer         ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "✗ Missing: $1 — install it and retry"
    exit 1
  }
}

need_cmd curl
need_cmd tar

ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64) ARCH_TAG="amd64"; ARCH_ALT="x64" ;;
  aarch64|arm64) ARCH_TAG="arm64"; ARCH_ALT="arm64" ;;
  *)
    echo "✗ Unsupported architecture: $ARCH"
    exit 1
    ;;
esac

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
if [ "$OS" != "linux" ]; then
  echo "✗ This installer is for Linux."
  echo "  Windows/macOS: https://github.com/${REPO}/releases"
  exit 1
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

API="https://api.github.com/repos/${REPO}/releases/${VERSION}"
if [ "$VERSION" = "latest" ]; then
  API="https://api.github.com/repos/${REPO}/releases/latest"
fi

echo "→ Fetching release metadata…"
JSON=$(curl -fsSL "$API") || {
  echo "✗ Could not reach GitHub releases for ${REPO}"
  exit 1
}

TAG=$(echo "$JSON" | grep -oE '"tag_name"[[:space:]]*:[[:space:]]*"[^"]+"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
echo "→ Release: ${TAG:-unknown}"

# Prefer arch-specific .deb from this release
DEB_URL=$(echo "$JSON" | grep -oE "https://[^\"]+agentvault_[^\"]*_${ARCH_TAG}\\.deb" | head -1 || true)
if [ -z "$DEB_URL" ]; then
  DEB_URL=$(echo "$JSON" | grep -oE 'https://[^"]+\.deb' | head -1 || true)
fi
TAR_URL=$(echo "$JSON" | grep -oE "https://[^\"]+AgentVault-linux-${ARCH_TAG}[^\"]*\\.tar\\.gz" | head -1 || true)
if [ -z "$TAR_URL" ]; then
  TAR_URL=$(echo "$JSON" | grep -oE "https://[^\"]+linux[^\"]*${ARCH_ALT}[^\"]*\\.tar\\.gz" | head -1 || true)
fi
if [ -z "$TAR_URL" ]; then
  TAR_URL=$(echo "$JSON" | grep -oE 'https://[^"]+\.tar\.gz' | head -1 || true)
fi

install_desktop() {
  local exec_path="$1"
  local work_dir="$2"
  mkdir -p "$DESKTOP_DIR" "$ICON_DIR" "$BIN_DIR"

  # Icon from install dir if present
  if [ -f "$work_dir/resources/icon.png" ]; then
    cp -f "$work_dir/resources/icon.png" "$ICON_DIR/agentvault.png" 2>/dev/null || true
  elif [ -f "$work_dir/icon.png" ]; then
    cp -f "$work_dir/icon.png" "$ICON_DIR/agentvault.png" 2>/dev/null || true
  fi

  ln -sfn "$exec_path" "$BIN_DIR/agentvault"

  cat > "$DESKTOP_DIR/agentvault.desktop" << EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=AgentVault
GenericName=AI Coding Backup
Comment=Never lose your AI coding history again
Exec=env PATH=${BIN_DIR}:/usr/bin:/bin ${exec_path}
Path=${work_dir}
Icon=agentvault
Terminal=false
Categories=Development;Utility;
StartupNotify=true
StartupWMClass=agentvault
Keywords=backup;ai;codex;claude;restore;
EOF
  chmod +x "$DESKTOP_DIR/agentvault.desktop"
  update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
  gtk-update-icon-cache -f -t "${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor" 2>/dev/null || true
}

# ── Try .deb system install ─────────────────────────────────
if [ -n "$DEB_URL" ] && command -v dpkg >/dev/null 2>&1; then
  echo "→ Downloading .deb"
  curl -fL --progress-bar "$DEB_URL" -o "$TMP/agentvault.deb"
  if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
    echo "→ Installing .deb (sudo)"
    sudo dpkg -i "$TMP/agentvault.deb" || sudo apt-get install -f -y
  elif command -v sudo >/dev/null 2>&1; then
    echo "→ Installing .deb (may ask for password)"
    sudo dpkg -i "$TMP/agentvault.deb" || sudo apt-get install -f -y
  else
    echo "→ No sudo — using user install instead"
    DEB_URL=""
  fi
  if [ -n "$DEB_URL" ] && [ -x /opt/AgentVault/agentvault ]; then
    # Fix desktop entry for panel relaunch
    install_desktop /opt/AgentVault/agentvault /opt/AgentVault
    # System desktop may exist; user copy ensures PATH/cwd correct
    echo ""
    echo "✓ AgentVault installed (.deb)"
    echo "  Run:  agentvault"
    echo "  Or open AgentVault from your app menu"
    exit 0
  fi
fi

# ── User-local tarball install ──────────────────────────────
if [ -z "$TAR_URL" ]; then
  echo "✗ No downloadable release asset found."
  echo "  See https://github.com/${REPO}/releases"
  exit 1
fi

echo "→ Downloading tarball"
curl -fL --progress-bar "$TAR_URL" -o "$TMP/agentvault.tar.gz"
mkdir -p "$INSTALL_DIR"
tar -xzf "$TMP/agentvault.tar.gz" -C "$TMP/extract" 2>/dev/null || {
  mkdir -p "$TMP/extract"
  tar -xzf "$TMP/agentvault.tar.gz" -C "$TMP/extract"
}

# Locate binary
FOUND=$(find "$TMP/extract" -type f -name agentvault -perm -111 2>/dev/null | head -1)
if [ -z "$FOUND" ]; then
  FOUND=$(find "$TMP" -type f -name agentvault 2>/dev/null | head -1)
fi
if [ -z "$FOUND" ]; then
  echo "✗ agentvault binary not found in archive"
  exit 1
fi

SRC_DIR=$(dirname "$FOUND")
# Prefer rsync; fall back to cp
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "$SRC_DIR/" "$INSTALL_DIR/"
else
  rm -rf "$INSTALL_DIR"
  mkdir -p "$INSTALL_DIR"
  cp -a "$SRC_DIR/." "$INSTALL_DIR/"
fi
chmod +x "$INSTALL_DIR/agentvault"
# chrome-sandbox permissions if present
if [ -f "$INSTALL_DIR/chrome-sandbox" ]; then
  chmod 4755 "$INSTALL_DIR/chrome-sandbox" 2>/dev/null || true
fi

install_desktop "$INSTALL_DIR/agentvault" "$INSTALL_DIR"

# Ensure PATH note
if ! echo ":$PATH:" | grep -q ":$BIN_DIR:"; then
  echo ""
  echo "⚠ Add to PATH (bash):"
  echo "  echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.bashrc && source ~/.bashrc"
fi

echo ""
echo "✓ AgentVault installed"
echo "  App:     $INSTALL_DIR/agentvault"
echo "  Command: agentvault"
echo "  Menu:    AgentVault"
echo ""
echo "Start now:  agentvault &"
echo ""
