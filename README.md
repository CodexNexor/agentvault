<!--
  AgentVault — SEO: AI coding agent backup, Codex CLI backup, Claude Code backup,
  OpenCode history restore, developer tools, Google Drive backup, PC reset restore
-->
<p align="center">
  <img src="build/icon.png" width="96" height="96" alt="AgentVault — AI coding agent backup and restore" />
</p>

<h1 align="center">AgentVault</h1>

<p align="center">
  <strong>Never lose your AI coding history again.</strong><br/>
  Backup &amp; restore full projects + chat history for<br/>
  <em>Codex CLI · Claude Code · OpenCode · Aider · Continue · Gemini CLI</em>
</p>

<p align="center">
  <a href="https://github.com/CodexNexor/agentvault/releases/latest"><img src="https://img.shields.io/github/v/release/CodexNexor/agentvault?style=for-the-badge&label=latest" alt="Latest release" /></a>
  <a href="https://github.com/CodexNexor/agentvault/releases"><img src="https://img.shields.io/github/downloads/CodexNexor/agentvault/total?style=for-the-badge" alt="Downloads" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-white?style=for-the-badge" alt="MIT license" /></a>
  <img src="https://img.shields.io/badge/Linux-deb%20%7C%20AppImage-black?style=for-the-badge" alt="Linux" />
  <img src="https://img.shields.io/badge/Windows-portable-black?style=for-the-badge" alt="Windows" />
</p>

<p align="center">
  <a href="#install-linux-one-line">Install</a> ·
  <a href="#features">Features</a> ·
  <a href="#after-pc-reset--new-laptop">After PC reset</a> ·
  <a href="#supported-ai-coding-agents">Agents</a> ·
  <a href="https://github.com/CodexNexor/agentvault/releases">Releases</a>
</p>

---

## Why AgentVault?

You live in **AI coding agents**. Your best work is in **chats**, not only git.

Reinstall Linux, switch laptops, or wipe a drive — and those histories disappear.

**AgentVault** is a desktop app that:

| | |
|--|--|
| ✅ | Backs up **full project source** |
| ✅ | Backs up **conversation history** for every linked agent |
| ✅ | Uploads **plain ZIP** archives to **your Google Drive** |
| ✅ | **One-click restore** after a full PC reset — no vault password |
| ✅ | Auto **path repair** for Codex / Claude / etc. on the new machine |

**Keywords:** AI coding agent backup · Codex CLI backup · Claude Code restore · OpenCode history · developer tools · Google Drive project backup

---

## Install (Linux one-line)

```bash
curl -fsSL https://raw.githubusercontent.com/CodexNexor/agentvault/main/scripts/install.sh | bash
```

Then:

```bash
agentvault
```

The installer downloads the **latest public release** (`.deb` when possible, else tarball).

### Debian / Ubuntu (.deb only)

```bash
curl -fL -o /tmp/agentvault.deb \
  https://github.com/CodexNexor/agentvault/releases/latest/download/agentvault_1.0.3_amd64.deb
sudo dpkg -i /tmp/agentvault.deb
agentvault
```

> Tip: `releases/latest/download/…` always follows the newest release tag.

### Windows

Download **AgentVault-Portable-*.exe** from [Releases](https://github.com/CodexNexor/agentvault/releases) and run it.

### macOS

`.dmg` when published on [Releases](https://github.com/CodexNexor/agentvault/releases).

### From source

```bash
git clone https://github.com/CodexNexor/agentvault.git
cd agentvault
npm install
npm run dev
npm run package:linux   # .deb / AppImage / tar.gz
```

---

## Features

| Feature | Description |
|--------|-------------|
| **Complete Backup** | Project files + all linked IDE histories → plain `.avault` ZIP → Google Drive |
| **Cloud Projects** | Fast Drive scan → one-click download, unzip, restore |
| **Multi-IDE** | Same repo used with Codex + Claude? Include both in one backup |
| **Path repair** | Chats work after path changes on a new PC |
| **BYO Google OAuth** | Your Desktop Client ID + secret — no shared 100-user cap |
| **No encryption keys** | Personal tool mode: plain ZIP, restore after wipe without passwords |
| **Fast Drive scan** | Parallel metadata fetch + short cache (v1.0.3+) |

---

## After PC reset / new laptop

1. Install your agents (Codex, Claude Code, …)  
2. Install AgentVault (`curl … | bash`)  
3. **Settings** → Google Desktop OAuth Client ID + secret → **Connect**  
4. **Cloud Projects** → **Restore all**  
5. Code → `~/Downloads/AgentVault-Restores/<project>`  
6. Histories → `~/.codex`, `~/.claude`, … automatically  

No vault password. Connect Drive → restore.

---

## Supported AI coding agents

- OpenAI **Codex CLI**
- **Claude Code**
- **OpenCode**
- **Aider**
- **Continue**
- **Gemini CLI**

Plugin architecture: implement `AgentProvider` to add more.

---

## Google Drive layout

```
AgentVault/
  Backups/<ProjectName>/*.avault   # plain ZIP per project
  Metadata/<backupId>.json         # catalog for scan / restore
```

---

## Privacy

- Archives live on **your** Google Drive only  
- OAuth secrets stay on **your** PC (BYO Desktop app)  
- Prefer scope `drive.file` (app-created files)  
- Personal desktop tool — not a multi-tenant SaaS

---

## Dev

```bash
npm run dev              # Electron + Vite
npm run package:linux    # deb + tar.gz + AppImage
npm run package:win      # Windows portable / NSIS
```

**Latest release:** [v1.0.3](https://github.com/CodexNexor/agentvault/releases/tag/v1.0.3)

---

## Links

- ⭐ [Star on GitHub](https://github.com/CodexNexor/agentvault)
- 📦 [All downloads](https://github.com/CodexNexor/agentvault/releases)
- 🐛 [Issues](https://github.com/CodexNexor/agentvault/issues)
- 📜 License: **MIT**

---

<p align="center">
  Built for the local-agent era · Codex · Claude Code · OpenCode · Aider
</p>
