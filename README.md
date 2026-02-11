# simple-notify-mcp

KISS MCP server for spoken and Telegram notifications.

## Tools

- `simple_notify_status`: always available; returns capabilities, missing config, and setup-web state.
- `tts_say`: text-only input; async by default, uses configured provider (`openai`, `fal-minimax`, `fal-elevenlabs`) with macOS `say` fallback.
- `telegram_notify`: available when Telegram bot token + chat id are configured.
- `telegram_read_incoming`: available when Telegram bot token + chat id are configured; reads incoming updates for configured chat.
- `telegram_read_media`: available when Telegram bot token + chat id are configured; reads image updates and can return MCP image content blocks.

## Install (npx)

### 1) Recommended: keep setup web always enabled

Use this if you want easy reconfiguration anytime.

```bash
codex mcp remove simple-notify
codex mcp add simple-notify -- \
  npx -y simple-notify-mcp@latest \
  --enable-setup-web
```

Ask your agent (Codex / Claude Code / another agent) to run `simple_notify_status` and send you `setupWeb.url`, then open that link.

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

## Install (Claude Code)

### 1) Recommended: keep setup web always enabled

Use this if you want easy reconfiguration anytime.

```bash
claude mcp remove simple-notify
claude mcp add --transport stdio simple-notify -- \
  npx -y simple-notify-mcp@latest \
  --enable-setup-web
```

Ask Claude Code to run `simple_notify_status` and share `setupWeb.url`, then open that link.

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
- `--setup-host` (default `127.0.0.1`; non-loopback values are clamped to `127.0.0.1`)
- `--setup-port` (default `21420`)
- `--setup-token` (optional; if omitted, generated per run)

Behavior:
- setup web starts whenever `--enable-setup-web` is set
- local bind only
- if `--setup-port` is occupied, server uses the next free local port
- setup URL includes the current run token query parameter
- use `simple_notify_status` to discover `setupWeb.url` and `missingConfig`

## Tool Contracts

### simple_notify_status
Input:
```json
{}
```

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
