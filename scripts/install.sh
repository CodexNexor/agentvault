#!/usr/bin/env bash
# AgentVault one-line install (Linux x86_64)
# curl -fsSL https://raw.githubusercontent.com/CodexNexor/agentvault/main/scripts/install.sh | bash
set -euo pipefail

REPO="${AGENTVAULT_REPO:-CodexNexor/agentvault}"
VERSION="${AGENTVAULT_VERSION:-latest}"
INSTALL_DIR="${AGENTVAULT_INSTALL_DIR:-$HOME/.local/share/AgentVault}"
BIN_DIR="${AGENTVAULT_BIN_DIR:-$HOME/.local/bin}"
DESKTOP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"

echo "→ AgentVault installer"
echo "  repo: $REPO"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing dependency: $1"
    exit 1
  }
}

need_cmd curl
need_cmd tar

ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64) ARCH_TAG="amd64" ;;
  aarch64|arm64) ARCH_TAG="arm64" ;;
  *)
    echo "Unsupported arch: $ARCH"
    exit 1
    ;;
esac

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
if [ "$OS" != "linux" ]; then
  echo "This installer is for Linux. For Windows/macOS see the GitHub releases page."
  exit 1
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

if [ "$VERSION" = "latest" ]; then
  API="https://api.github.com/repos/${REPO}/releases/latest"
  ASSET_URL=$(curl -fsSL "$API" | grep -oE "https://[^\"]+AgentVault[^\"]+${ARCH_TAG}[^\"]*\\.tar\\.gz" | head -1 || true)
  if [ -z "$ASSET_URL" ]; then
    ASSET_URL=$(curl -fsSL "$API" | grep -oE "https://[^\"]+linux-unpacked[^\"]*\\.tar\\.gz" | head -1 || true)
  fi
  if [ -z "$ASSET_URL" ]; then
    # Fallback: .deb
    DEB_URL=$(curl -fsSL "$API" | grep -oE "https://[^\"]+agentvault[^\"]*${ARCH_TAG}[^\"]*\\.deb" | head -1 || true)
    if [ -n "$DEB_URL" ]; then
      echo "→ Downloading .deb"
      curl -fL "$DEB_URL" -o "$TMP/agentvault.deb"
      if command -v sudo >/dev/null 2>&1; then
        sudo dpkg -i "$TMP/agentvault.deb" || sudo apt-get install -f -y
      else
        echo "Downloaded $TMP/agentvault.deb — install with: sudo dpkg -i agentvault.deb"
      fi
      echo "✓ AgentVault installed via deb"
      exit 0
    fi
    echo "No release asset found. Building from source is required, or publish a release."
    echo "See: https://github.com/${REPO}/releases"
    exit 1
  fi
else
  ASSET_URL="https://github.com/${REPO}/releases/download/${VERSION}/AgentVault-linux-${ARCH_TAG}.tar.gz"
fi

echo "→ Downloading $ASSET_URL"
curl -fL "$ASSET_URL" -o "$TMP/agentvault.tar.gz"
mkdir -p "$INSTALL_DIR"
tar -xzf "$TMP/agentvault.tar.gz" -C "$TMP"
# Find binary
BIN=""
if [ -x "$TMP/agentvault" ]; then BIN="$TMP/agentvault"
elif [ -x "$TMP/linux-unpacked/agentvault" ]; then
  rsync -a "$TMP/linux-unpacked/" "$INSTALL_DIR/"
  BIN="$INSTALL_DIR/agentvault"
else
  # unpack may already be flat
  SRC_DIR=$(find "$TMP" -maxdepth 2 -type f -name agentvault -executable | head -1)
  if [ -n "$SRC_DIR" ]; then
    rsync -a "$(dirname "$SRC_DIR")/" "$INSTALL_DIR/"
    BIN="$INSTALL_DIR/agentvault"
  fi
fi

if [ -z "$BIN" ] && [ -x "$INSTALL_DIR/agentvault" ]; then
  BIN="$INSTALL_DIR/agentvault"
fi

if [ ! -x "$INSTALL_DIR/agentvault" ] && [ -n "$BIN" ] && [ "$BIN" != "$INSTALL_DIR/agentvault" ]; then
  rsync -a "$(dirname "$BIN")/" "$INSTALL_DIR/"
fi

chmod +x "$INSTALL_DIR/agentvault" 2>/dev/null || true
mkdir -p "$BIN_DIR"
ln -sfn "$INSTALL_DIR/agentvault" "$BIN_DIR/agentvault"

mkdir -p "$DESKTOP_DIR"
cat > "$DESKTOP_DIR/agentvault.desktop" << EOF
[Desktop Entry]
Name=AgentVault
Comment=Never lose your AI coding history again
Exec=$INSTALL_DIR/agentvault %U
Path=$INSTALL_DIR
Icon=agentvault
Terminal=false
Type=Application
Categories=Development;Utility;
StartupWMClass=AgentVault
EOF
chmod +x "$DESKTOP_DIR/agentvault.desktop"
update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true

echo ""
echo "✓ AgentVault installed"
echo "  Binary: $INSTALL_DIR/agentvault"
echo "  Command: agentvault   (ensure $BIN_DIR is on PATH)"
echo ""
echo "Run:  agentvault"
echo "Or:   $INSTALL_DIR/agentvault"
