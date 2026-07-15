<p align="center">
  <img src="build/icon.png" width="96" height="96" alt="AgentVault" />
</p>

<h1 align="center">AgentVault</h1>

<p align="center">
  <strong>Never lose your AI coding history again.</strong><br/>
  Encrypted backup &amp; restore for <em>Codex · Claude Code · OpenCode · Aider · Continue · Gemini CLI</em>
</p>

<p align="center">
  <a href="https://github.com/CodexNexor/agentvault/releases"><img src="https://img.shields.io/github/v/release/CodexNexor/agentvault?style=flat-square" alt="release" /></a>
  <a href="https://github.com/CodexNexor/agentvault/actions"><img src="https://img.shields.io/github/actions/workflow/status/CodexNexor/agentvault/release.yml?style=flat-square" alt="build" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-white?style=flat-square" alt="license" /></a>
  <img src="https://img.shields.io/badge/platform-Linux%20%7C%20Windows%20%7C%20macOS-black?style=flat-square" alt="platform" />
</p>

<p align="center">
  <a href="#install"><b>Install</b></a> ·
  <a href="#features"><b>Features</b></a> ·
  <a href="#after-pc-reset"><b>After PC reset</b></a> ·
  <a href="#supported-agents"><b>Agents</b></a>
</p>

---

## Why AgentVault?

You live in AI coding agents. Your best work is in **chats**, not just git.

Switch laptops or reinstall the OS and those histories vanish.

**AgentVault** backs up:

- ✅ Full project source (encrypted `.avault`)
- ✅ Conversation history for every linked agent
- ✅ Settings / configs where supported
- ✅ One-click restore + path repair across machines

Built for developers who use **local-first AI agents**.

---

## Install

### Linux (one command)

```bash
curl -fsSL https://raw.githubusercontent.com/CodexNexor/agentvault/main/scripts/install.sh | bash
```

Then:

```bash
agentvault
```

### Debian / Ubuntu (.deb)

```bash
# Download latest .deb from Releases, then:
sudo dpkg -i agentvault_*_amd64.deb
# or
sudo apt install ./agentvault_*_amd64.deb
```

### Windows

1. Download **AgentVault-Setup-*.exe** from [Releases](https://github.com/CodexNexor/agentvault/releases)
2. Run the installer (one-click NSIS)
3. Launch **AgentVault** from the Start menu

### macOS

Download the `.dmg` from [Releases](https://github.com/CodexNexor/agentvault/releases) (Apple Silicon / Intel when published).

### From source

```bash
git clone https://github.com/CodexNexor/agentvault.git
cd agentvault
npm install
npm run dev          # development
npm run package:linux   # produce .deb / AppImage / tar.gz
```

---

## Features

| Feature | Description |
|--------|-------------|
| **Complete Backup** | Project files + all linked IDE histories → encrypted → optional Drive |
| **Cloud Projects** | List Drive backups → one click download, decrypt, unzip, restore |
| **Multi-IDE** | Same project on Codex + Claude? Pick tools per backup |
| **Path repair** | Restores chats on a new machine path |
| **BYO Google OAuth** | Paste your Desktop Client ID + secret (no shared 100-user limit) |
| **AES-256-GCM** | Encrypt locally before upload |
| **`.avault` format** | Encrypted ZIP of workspace + agent data |

---

## After PC reset

1. Install Codex / Claude / your agents  
2. Install AgentVault  
3. **Settings** → paste Google Desktop OAuth Client ID + secret → **Connect**  
4. **Cloud Projects** → **Restore all**  
5. Project files land in `~/Downloads/AgentVault-Restores/<name>` (or choose a folder)  
6. IDE histories restore into `~/.codex`, `~/.claude`, etc. automatically  

---

## Supported agents

- OpenAI **Codex CLI**  
- **Claude Code**  
- **OpenCode**  
- **Aider**  
- **Continue**  
- **Gemini CLI**  

Plugin architecture: add more via `AgentProvider`.

---

## Security

- Encryption **before** cloud upload  
- Optional master password + recovery key  
- Your Google OAuth secrets stay on **your** machine when using BYO mode  
- Prefer scope `drive.file` (only app-created files)

---

## Dev

```bash
npm run dev              # Electron + Vite
npm run package:linux    # deb + tar.gz + AppImage
npm run package:win      # Windows (on Windows or CI)
```

---

## Star this repo if AI coding backups matter to you

PRs welcome. Built for the local-agent era.

**License:** MIT
