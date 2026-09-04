# Orchestrator — Obsidian/Geode Plugin

Coordinate documents and Claude agents through a voice-first interface. Orchestrator preserves the Voice conversation and document workflow while adding typed delegation through Claude Threads.

## Features

- **Live voice conversation** with your current document as context
- **Wake word detection** — say "hey obsidian" to connect hands-free, no button press needed. Runs a local ONNX model entirely on-device; no audio leaves your machine.
- **Voice enrollment** — record 5 samples to calibrate the wake word to your voice and microphone (Settings → Voice → Wake Word → Calibrate)
- **Silence auto-disconnect** — automatically disconnects after configurable silence (default 15s); wake word re-arms instantly so you can reconnect hands-free
- **Document tools** the AI can use mid-conversation:
  - Read the current document
  - Append timestamped notes
  - Insert text at cursor
  - Replace document content
  - Search your vault by keyword
  - Open any note in a new tab
  - List outgoing links
- **Claude Threads API v1 integration** — create, inspect, message, wait for, and open threads through Claude Threads' published API; discover and dispatch to Portfolio/Project orchestrators; receive semantic completion notifications
- **Rich sidebar transcript** — see what was said, what tools ran, and what files were touched
- **Hotkey support** — bind a key to toggle the voice connection without touching the panel
- **Context banner** — always shows which file and how many chars the AI has as context

## Requirements

- An [OpenAI API key](https://platform.openai.com/api-keys) with Realtime API access
- Obsidian 1.11.4 or later (desktop only)
- Claude Threads with public API v1 enabled for agent execution (document-only voice remains available when Threads is absent)

## Installation

This repository is currently local-only and has no release remote. Build it with `npm run build`, then install the generated `dist/main.js`, `dist/manifest.json`, `dist/styles.css`, and wake-word assets in an `obsidian-orchestrator` plugin directory. Orchestrator's plugin, view, and command IDs are distinct from legacy Voice, so both can be installed without registration collisions.

Do not operate both voice controllers at once. If legacy `obsidian-voice` is loaded, Orchestrator pauses manual and wake-word microphone startup and shows a notice. Disable Voice and reload Orchestrator to resume its voice controls.

## Setup

1. Open Settings → Orchestrator
2. Click **Set API Key** and paste your OpenAI API key
3. Choose a voice (Marin is the default)
4. Optionally add extra system prompt instructions
5. Click the mic icon in the ribbon (or use your hotkey) to open the Orchestrator voice panel
6. Open a note, then click **Connect**

### Enabling wake word (optional)

1. In Settings → Orchestrator → **Wake Word**, toggle on **Enable wake word**
2. Click **Calibrate** and say "hey obsidian" 5 times when prompted — this tunes detection to your voice and microphone
3. Open the Orchestrator voice panel — it now listens passively and connects automatically when it hears "hey obsidian"

Without calibration the default threshold (0.75) works for many users; calibration gives better accuracy in noisy environments or if you're getting false triggers.

## Usage

**Manual:** Click the mic icon in the ribbon (or use your hotkey) to open the Orchestrator voice panel, then click **Connect**.

**Hands-free:** With wake word enabled, just say "hey obsidian" — the plugin connects and plays a short chime. After 15 seconds of silence (configurable) it disconnects automatically; say "hey obsidian" again to reconnect.

Once connected, just speak. The AI has your document in context and can answer questions or edit it on request. Tool actions appear as pills in the transcript so you can follow along.

The status bar shows real-time session activity:

| Status | Meaning |
|---|---|
| **Listening…** | Wake word detector is active, waiting for "hey obsidian" |
| **You're speaking…** | Server VAD has detected your voice |
| **AI responding…** | AI is generating and playing audio |
| **Silence — 12s** | No activity; countdown to auto-disconnect |
| **Connected** | Connected but idle (no VAD activity) |

To assign a hotkey: Settings → Hotkeys → search "Toggle Orchestrator voice connection".

## Migration from Voice 0.4.3

On its first load, when Orchestrator has no settings of its own, it best-effort imports the legacy Voice settings file. Voice choice, context files, prompts, auto-apply, wake-word configuration and enrollment, silence/grace timers, and debug preference are preserved. The shared `openai-api-key` SecretStorage entry is reused; a legacy plaintext key is moved there and never retained in Orchestrator's data. Existing Orchestrator settings always win, and missing or malformed legacy data is ignored safely.

Compatibility changes in 0.1.0: `ct_close_thread` is intentionally excluded because it is destructive, and `ct_get_active_thread` is removed because the current visible Threads view is not part of public API v1. Use explicit thread IDs from `ct_list_threads`. If Claude Threads unloads or reloads during a voice session, subscriptions detach and tool calls return clean unavailable/stale-generation errors. A new voice session picks up the replacement API generation and schemas.

## Settings reference

| Setting | Default | Description |
|---|---|---|
| Voice | Marin | AI voice used for responses |
| Extra system prompt | — | Additional instructions appended to the base prompt |
| Enable wake word | Off | Listen for "hey obsidian" to auto-connect |
| Detection threshold | 0.75 | Confidence required to trigger (0–1). Lower = more sensitive. Calibrate sets this automatically. |
| Silence timeout | 15s | Seconds of silence before auto-disconnect (0 = disabled) |
| Debug logging | Off | Log wake word scores and session events to DevTools (Cmd+Option+I) |

## Model

Uses `gpt-realtime-2` via the OpenAI Realtime API (WebRTC).

## Debugging

`debug-realtime.mjs` is a Node.js probe script that connects directly to the OpenAI Realtime API via WebSocket and logs every event with timestamps, delta timings between events, and a session summary. Useful for understanding API event sequencing and timing without needing a full Obsidian reload cycle.

```bash
# Run from the repo root (reads OPENAI_API_KEY from env or .env file)
OPENAI_API_KEY=sk-... node debug-realtime.mjs
OPENAI_API_KEY=sk-... node debug-realtime.mjs "What is 2 + 2?"
```

Requires `ws` (already listed as a devDependency — run `npm install` first).

## Development

Run `npx tsc --noEmit`, `npm test`, and `npm run build` from the repository root. The build script resolves entry points and output relative to the current working directory. This local repository has no configured remote; publishing and deployment are intentionally out of scope for the initial migration.
