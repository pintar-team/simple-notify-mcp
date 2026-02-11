# simple-notify-mcp

KISS MCP server for spoken and Telegram notifications.

## Tools

- `simple_notify_status`: always available; returns capabilities, missing config, and setup-web state.
- `tts_say`: text-only input; async by default, uses configured provider (`openai`, `fal-minimax`, `fal-elevenlabs`) with macOS `say` fallback.
- `telegram_notify`: available when Telegram bot token + chat id are configured.

## Quickstart (npx, recommended)

Do these steps in this exact order.

1. Add with setup web enabled:

```bash
codex mcp add simple-notify -- \
  npx -y simple-notify-mcp@latest \
  --enable-setup-web \
  --setup-port 21420
```

2. Ask your agent (Codex / Claude Code / another agent) to run `simple_notify_status` and send you `setupWeb.url`, or call `simple_notify_status` yourself and copy the link.
3. Save your settings (provider + keys) in the web panel.
4. Re-add in normal mode (without setup web):

```bash
codex mcp remove simple-notify
codex mcp add simple-notify -- npx -y simple-notify-mcp@latest
```

5. Verify by calling:
- `simple_notify_status`
- `tts_say` with `{ "text": "test" }`

If you want env keys from the start:

```bash
codex mcp add simple-notify -- \
  --env OPENAI_API_KEY="$OPENAI_API_KEY" \
  --env FAL_KEY="$FAL_KEY" \
  -- npx -y simple-notify-mcp@latest \
  --enable-setup-web \
  --setup-port 21420
```

## Quickstart (local repo)

From `tools/simple-notify-mcp`:

1. Add with setup web:

```bash
codex mcp add simple-notify -- \
  node ./build/index.js \
  --enable-setup-web \
  --setup-port 21420
```

2. Ask your agent (Codex / Claude Code / another agent) to run `simple_notify_status` and send you `setupWeb.url`, or call `simple_notify_status` yourself and copy the link.
3. Re-add without setup web:

```bash
codex mcp remove simple-notify
codex mcp add simple-notify -- node ./build/index.js
```

## Common Mistake

If `simple_notify_status` shows:
- `setupWeb.enabled: false`
- `setupWeb.url: null`

then you added server without `--enable-setup-web`.

Fix:

```bash
codex mcp remove simple-notify
codex mcp add simple-notify -- \
  npx -y simple-notify-mcp@latest \
  --enable-setup-web \
  --setup-port 21420
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
        "englishNormalization": false,
        "languageBoost": "auto",
        "outputFormat": "url"
      },
      "falElevenlabs": {
        "voice": "Rachel",
        "stability": 0.5,
        "similarityBoost": 0.75,
        "style": 0,
        "speed": 1,
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

## Setup Web UI Flags (disabled by default)

Flags:
- `--enable-setup-web` (default off)
- `--setup-host` (default `127.0.0.1`; non-loopback values are clamped to `127.0.0.1`)
- `--setup-port` (default `21420`)
- `--setup-token` (optional; if omitted, generated per run)

Behavior:
- setup web starts only when enabled and config is incomplete
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

## Self-test

```bash
npm run self-test -- --text "simple-notify-mcp self-test"
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
