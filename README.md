# simple-notify-mcp

[![npm version](https://img.shields.io/npm/v/simple-notify-mcp)](https://www.npmjs.com/package/simple-notify-mcp)
[![npm downloads](https://img.shields.io/npm/dm/simple-notify-mcp)](https://www.npmjs.com/package/simple-notify-mcp)

Model Context Protocol (MCP) server for Codex and Claude Code with text-to-speech (TTS) and Telegram notifications.

## Tools

- `simple_notify_status`: always available; returns capabilities, missing config, and setup-web availability/running state.
- `simple_notify_setup_web_start`: available when `--enable-setup-web` is set; starts the local setup web UI on demand and returns the current tokenized URL.
- `simple_notify_setup_web_stop`: available when `--enable-setup-web` is set; stops the local setup web UI when no longer needed.
- `tts_say`: text-only input; async by default, uses configured provider (`openai`, `fal-minimax`, `fal-elevenlabs`) with macOS `say` fallback.
- `telegram_notify`: available when Telegram bot token + chat id are configured; supports `parse_mode` (`plain`, `markdown`, `html`) and returns `hasUnreadIncoming` from a non-advancing unread peek.
- `telegram_send_photo`: available when Telegram bot token + chat id are configured; sends local image files (`jpg`, `jpeg`, `png`, `webp`, `gif`, `bmp`) with optional caption and `parse_mode`.
- `telegram_read_incoming`: available when Telegram bot token + chat id are configured; reads incoming updates for configured chat.
- `telegram_read_media`: available when Telegram bot token + chat id are configured; reads image updates and can return MCP image content blocks.

Telegram formatting quick examples:
- `telegram_notify({ "text": "**Build done**. [Diff](https://example.com)", "parse_mode": "markdown" })`
- `telegram_send_photo({ "filePath": "/tmp/plan.png", "caption": "<b>Plan snapshot</b>", "parse_mode": "html" })`
- Markdown mode supports a safe subset: `**bold**`, `*italic*`, `_italic_`, `~~strike~~`, `` `code` ``, `[text](https://url)`, and `#` headings.
- HTML mode is validated and allows only Telegram-safe tags; links must be `https://` or `http://`.
- If Markdown entity parsing fails on Telegram side, the server retries once with plain text for reliability.
- Telegram limits are enforced before send (message: 4096 chars, caption: 1024 chars).

## Install (npx)

### 1) Recommended: agent-managed setup web

Use this if you want easy reconfiguration anytime without keeping an HTTP port open all the time.

```bash
codex mcp remove simple-notify
codex mcp add simple-notify -- \
  npx -y simple-notify-mcp@latest \
  --enable-setup-web
```

Ask your agent (Codex / Claude Code / another agent) to run `simple_notify_status`, call `simple_notify_setup_web_start` if needed, and then send you `setupWeb.url`.

### 2) Minimal runtime: no setup web

Use this if config is already done and you do not want the setup server running.

```bash
codex mcp remove simple-notify
codex mcp add simple-notify -- npx -y simple-notify-mcp@latest
```

If you need to change provider/keys later, switch back to mode 1.

Optional: pass API keys via env when adding:

```bash
codex mcp add simple-notify -- \
  --env OPENAI_API_KEY="$OPENAI_API_KEY" \
  --env FAL_KEY="$FAL_KEY" \
  -- npx -y simple-notify-mcp@latest \
  --enable-setup-web \
  --setup-port 21420
```

Optional legacy behavior:
- add `--setup-web-autostart` if you explicitly want the setup web server to bind during MCP startup

## Install (Claude Code)

### 1) Recommended: agent-managed setup web

Use this if you want easy reconfiguration anytime without keeping an HTTP port open all the time.

```bash
claude mcp remove simple-notify
claude mcp add --transport stdio simple-notify -- \
  npx -y simple-notify-mcp@latest \
  --enable-setup-web
```

Ask Claude Code to run `simple_notify_status`, call `simple_notify_setup_web_start` if needed, and then share `setupWeb.url`.

### 2) Minimal runtime: no setup web

Use this if config is already done and you do not want the setup server running.

```bash
claude mcp remove simple-notify
claude mcp add --transport stdio simple-notify -- npx -y simple-notify-mcp@latest
```

If you need to change provider/keys later, switch back to mode 1.

Optional: pass API keys via env when adding:

```bash
claude mcp add --transport stdio \
  --env OPENAI_API_KEY="$OPENAI_API_KEY" \
  --env FAL_KEY="$FAL_KEY" \
  simple-notify -- \
  npx -y simple-notify-mcp@latest \
  --enable-setup-web
```

Optional legacy behavior:
- add `--setup-web-autostart` if you explicitly want the setup web server to bind during MCP startup

## How To Use

Think of `simple-notify-mcp` as your "agent communication layer":
- voice message when work is done (`tts_say`)
- Telegram ping when work is done or while work is in progress (`telegram_notify`)
- optional Telegram inbox reads (`telegram_read_incoming`, `telegram_read_media`)

### Typical flow

1) Start with setup web enabled (recommended mode above). This exposes setup-web start/stop tools, but does not open a local port yet.

2) Ask your agent for setup link:
- "Run `simple_notify_status`. If setup web is not running, call `simple_notify_setup_web_start` and send me `setupWeb.url`."

3) Open the link, set keys/provider/chat id, then click Save.
   In some clients, you may need to restart the agent process after adding keys so all tools become available.

4) When you are done configuring, ask your agent to call `simple_notify_setup_web_stop`.

5) After that, ask your agent to always:
- speak on completion
- send Telegram on completion
- send Telegram updates during long tasks

### What to ask your agent (examples)

- Setup:
  - "Please configure simple-notify and give me the setup link."
- Completion behavior:
  - "When you finish a task, call TTS and Telegram notify."
- Long task behavior:
  - "If task is long, notify me on progress milestones and before escalation requests."
- Read incoming Telegram:
  - "If notify result says unread incoming, read it and continue."

### TTS/Notification style tips (easy and practical)

You can tune:
- language (EN/RU/etc)
- tone (calm/energetic/formal/casual)
- emotion (neutral/cheerful/serious)
- slang level
- pacing

Examples:
- EN calm:
  - `Task complete. Build passed. I left a short summary.`
- EN upbeat:
  - `Done. All checks are green.`
- RU neutral:
  - `Готово. Проверки прошли успешно.`
- RU casual:
  - `Запилил фичу, всё пашет, тесты зеленые.`


## Copy-Paste For AGENTS.md / CLAUDE.md

The easiest way to tune agent behavior is to add explicit tool-usage instructions to your agent config.
You can copy-paste this block and adjust it as needed:

```txt
If user uses simple-notify-mcp:

1) Setup flow
- Call simple_notify_status.
- If setupWeb.enabled=true and setupWeb.running=false, call simple_notify_setup_web_start.
- If setupWeb.running=true, return setupWeb.url to user.
- When setup is finished or user asks to close it, call simple_notify_setup_web_stop.
- If setup web is disabled, tell user to run MCP with --enable-setup-web.

2) Completion flow
- On task completion, call tts_say with a short completion message.
- Then call telegram_notify with a short completion summary.
- If telegram_notify returns hasUnreadIncoming=true, optionally call telegram_read_incoming.

3) Long-task flow
- For long tasks, send milestone progress via telegram_notify.
- Send a notify before asking user for escalation/approval.
- Keep updates useful (no spam).

4) Safety
- Never include secrets/tokens in TTS or Telegram messages.
```

## Configuration Schema

Config file path (default):
- `$XDG_CONFIG_HOME/simple-notify-mcp/config.json`
- or `~/.config/simple-notify-mcp/config.json`

Env key precedence:
- `OPENAI_API_KEY` overrides `keys.openai.apiKey`
- `FAL_KEY` / `FAL_API_KEY` override `keys.fal.apiKey`

```json
{
  "tts": {
    "provider": "openai",
    "params": {
      "openai": {
        "model": "gpt-4o-mini-tts",
        "voice": "alloy",
        "speed": 1,
        "responseFormat": "mp3",
        "instructions": "Speak calmly and clearly."
      },
      "falMinimax": {
        "voiceId": "Wise_Woman",
        "speed": 1,
        "vol": 1,
        "pitch": 0,
        "emotion": "neutral",
        "englishNormalization": false,
        "languageBoost": "auto",
        "outputFormat": "url",
        "audioFormat": "mp3",
        "audioSampleRate": 32000,
        "audioChannel": 1,
        "audioBitrate": 128000,
        "normalizationEnabled": true,
        "normalizationTargetLoudness": -18,
        "normalizationTargetRange": 8,
        "normalizationTargetPeak": -0.5,
        "voiceModifyPitch": 0,
        "voiceModifyIntensity": 0,
        "voiceModifyTimbre": 0,
        "pronunciationToneList": [
          "燕少飞/(yan4)(shao3)(fei1)"
        ]
      },
      "falElevenlabs": {
        "voice": "Rachel",
        "stability": 0.5,
        "similarityBoost": 0.75,
        "style": 0,
        "speed": 1,
        "timestamps": false,
        "languageCode": "en",
        "applyTextNormalization": "auto"
      }
    }
  },
  "telegram": {
    "chatId": "123456789"
  },
  "keys": {
    "openai": {
      "apiKey": "sk-..."
    },
    "fal": {
      "apiKey": "fal_..."
    },
    "telegram": {
      "botToken": "123:ABC"
    }
  },
  "misc": {
    "ttsAsyncByDefault": true
  }
}
```

MiniMax voices available in setup UI:
- `Wise_Woman`, `Friendly_Person`, `Inspirational_girl`, `Deep_Voice_Man`, `Calm_Woman`, `Casual_Guy`, `Lively_Girl`, `Patient_Man`, `Young_Knight`, `Determined_Man`, `Lovely_Girl`, `Decent_Boy`, `Imposing_Manner`, `Elegant_Man`, `Abbess`, `Sweet_Girl_2`, `Exuberant_Girl`

## Setup Web UI Flags (disabled by default)

Flags:
- `--enable-setup-web` (default off)
- `--setup-web-autostart` (default off; optional legacy eager-start behavior)
- `--setup-host` (default `127.0.0.1`; non-loopback values are clamped to `127.0.0.1`)
- `--setup-port` (default `21420`)
- `--setup-token` (optional; if omitted, generated per run)

Behavior:
- `--enable-setup-web` exposes the on-demand setup-web tools but does not bind a port by itself
- `simple_notify_setup_web_start` starts the local setup server only when the agent needs it
- `simple_notify_setup_web_stop` closes the local setup server when you are done
- `--setup-web-autostart` restores eager startup if you explicitly want the previous behavior
- local bind only
- if `--setup-port` is occupied, server uses the next free local port
- setup URL includes the current run token query parameter
- if `--setup-token` is omitted, each fresh start generates a new token
- use `simple_notify_status` to discover whether setup web is running, plus `setupWeb.url` and `missingConfig`

## Tool Contracts

### simple_notify_status
Input:
```json
{}
```

### simple_notify_setup_web_start
Input:
```json
{}
```
Output notes:
- starts setup web only when `--enable-setup-web` is set
- returns current setup-web state, including `setupWeb.url`
- if already running, returns the existing URL without rebinding

### simple_notify_setup_web_stop
Input:
```json
{}
```
Output notes:
- safe to call repeatedly
- returns `wasRunning=false` when setup web was already stopped

### tts_say
Input:
```json
{ "text": "Job done" }
```
Output notes:
- default mode is async (`misc.ttsAsyncByDefault=true`), so tool returns immediately after queuing speech
- set `misc.ttsAsyncByDefault=false` in setup web Misc tab for blocking/sync behavior

### telegram_notify
Input:
```json
{ "text": "Job done" }
```
Output notes:
- returns `{ "accepted": true }` by default
- adds `hasUnreadIncoming: true` only when unread messages are detected
- performs a non-advancing unread peek (`limit=6`) before returning

### telegram_read_incoming
Input:
```json
{
  "limit": 20,
  "timeoutSeconds": 0,
  "advanceCursor": true
}
```
Output notes:
- reads updates filtered to configured `telegram.chatId`
- tracks cursor in memory for the current server run
- set `advanceCursor=false` to peek without moving cursor

### telegram_read_media
Input:
```json
{
  "limit": 20,
  "timeoutSeconds": 0,
  "advanceCursor": true,
  "includeData": true,
  "maxImages": 1,
  "maxBytesPerImage": 8000000
}
```
Output notes:
- only image media is returned (text-only updates are ignored)
- when `includeData=true`, tool can return MCP `image` content blocks (base64 + mime type)
- large files are skipped based on `maxBytesPerImage`
- media cursor is tracked in memory for current server run

## Self-test

```bash
npm run self-test -- --text "Task complete. Build passed and your results are ready."
```

Disable one side:

```bash
npm run self-test -- --no-tts
npm run self-test -- --no-telegram
```

## Notes

- `tts_say` is text-only; provider/model/voice/etc are server config.
- `tts_say` runs async by default; switch in setup web `Misc` tab if you need sync mode.
- OpenAI and FAL network errors fall back to macOS `say` when available.
- OpenAI `responseFormat=pcm` is not directly playable by this local player path.
- Runtime config is reloaded from disk before tool calls, so manual config edits are picked up without restarting the MCP process.
