<p align="center">
  <img src="build/icon.png" width="96" height="96" alt="AgentVault" />
</p>

<h1 align="center">AgentVault</h1>

<p align="center">
  <strong>Never lose your AI coding history again.</strong><br/>
  Full project + IDE history backup &amp; restore for <em>Codex · Claude Code · OpenCode · Aider · Continue · Gemini CLI</em>
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

- ✅ Full project source (plain `.avault` ZIP)
- ✅ Conversation history for every linked agent
- ✅ Settings / configs where supported
- ✅ One-click restore + path repair across machines
- ✅ Works after full PC reset — **no vault password / encryption keys**

Built as a **personal local tool** for developers who use local-first AI agents.

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
# Latest release .deb:
curl -fL -o /tmp/agentvault.deb \
  https://github.com/CodexNexor/agentvault/releases/latest/download/agentvault_1.0.3_amd64.deb
sudo dpkg -i /tmp/agentvault.deb
```

Or download from [Releases](https://github.com/CodexNexor/agentvault/releases).

### Windows

1. Download **AgentVault-Portable-*.exe** (or Setup) from [Releases](https://github.com/CodexNexor/agentvault/releases)
2. Run and launch **AgentVault**

### macOS

Download the `.dmg` from [Releases](https://github.com/CodexNexor/agentvault/releases) when published.

### From source

```bash
git clone https://github.com/CodexNexor/agentvault.git
cd agentvault
npm install
npm run dev            # development
npm run package:linux  # produce .deb / AppImage / tar.gz
```

---

## Features

| Feature | Description |
|--------|-------------|
| **Complete Backup** | Project files + all linked IDE histories → plain ZIP → Google Drive |
| **Cloud Projects** | List Drive backups → one click download, unzip, restore |
| **Multi-IDE** | Same project on Codex + Claude? Pick tools per backup |
| **Path repair** | Restores chats on a new machine path |
| **BYO Google OAuth** | Paste your Desktop Client ID + secret (no shared 100-user limit) |
| **`.avault` format** | Plain ZIP of workspace + agent data (no encryption keys) |
| **Legacy cleanup** | Old AES-encrypted cloud backups are purged; only ZIP archives list |

---

## After PC reset

1. Install Codex / Claude / your agents  
2. Install AgentVault (`curl … \| bash` or `.deb`)  
3. **Settings** → paste Google Desktop OAuth Client ID + secret → **Connect**  
4. **Cloud Projects** → **Restore all**  
5. Project files land in `~/Downloads/AgentVault-Restores/<name>` (or choose a folder)  
6. IDE histories restore into `~/.codex`, `~/.claude`, etc. automatically  

No vault password. Connect Drive → restore.

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

## Privacy / Drive

- Backups are **your** plain ZIP archives on **your** Google Drive  
- OAuth Client ID/secret stay on **your** machine (BYO Desktop OAuth)  
- Prefer scope `drive.file` (only app-created files)  
- Personal tool — not a multi-tenant SaaS vault

---

## Dev

```bash
npm run dev              # Electron + Vite
npm run package:linux    # deb + tar.gz + AppImage
npm run package:win      # Windows (on Windows or CI)
```

Current release: **v1.0.3**

---

## Star this repo if AI coding backups matter to you

PRs welcome. Built for the local-agent era.

**License:** MIT
