# simple-notify-mcp

KISS MCP server for spoken and Telegram notifications.

## Tools

- `simple_notify_status`: always available; returns capability/config/setup-web state.
- `tts_say`: available when OpenAI key or macOS system TTS is available.
- `telegram_notify`: available when Telegram bot token + chat id are configured.

## Install (npx)

Recommended first run (setup UI on):

```bash
codex mcp add simple-notify -- \
  npx -y simple-notify-mcp@latest \
  --enable-setup-web \
  --setup-port \
  21420
```

If you want env-based OpenAI key on first run:

```bash
codex mcp add simple-notify --env OPENAI_API_KEY="$OPENAI_API_KEY" -- \
  npx -y simple-notify-mcp@latest \
  --enable-setup-web \
  --setup-port \
  21420
```

After config is saved, switch to normal mode (setup UI off):

```bash
codex mcp remove simple-notify
codex mcp add simple-notify -- \
  npx -y simple-notify-mcp@latest
```

## Local add (from repo)

Recommended first run (setup UI on):

```bash
# from tools/simple-notify-mcp directory
codex mcp add simple-notify -- \
  node ./build/index.js \
  --enable-setup-web \
  --setup-port \
  21420
```

If you want env-based OpenAI key:

```bash
# from tools/simple-notify-mcp directory
codex mcp add simple-notify --env OPENAI_API_KEY="$OPENAI_API_KEY" -- \
  node ./build/index.js \
  --enable-setup-web \
  --setup-port \
  21420
```

After config is saved, switch to normal mode (setup UI off):

```bash
# from tools/simple-notify-mcp directory
codex mcp remove simple-notify
codex mcp add simple-notify -- \
  node ./build/index.js
```

First-run flow:
- call `simple_notify_status`
- open `setupWeb.url`
- save settings in the panel
- remove/re-add without `--enable-setup-web` for normal usage

## Configuration schema

Config file path (default):
- `$XDG_CONFIG_HOME/simple-notify-mcp/config.json`
- or `~/.config/simple-notify-mcp/config.json`

`OPENAI_API_KEY` env still works and takes precedence over `keys.openai.apiKey`.

```json
{
  "tts": {
    "provider": "openai",
    "params": {
      "model": "gpt-4o-mini-tts",
      "voice": "alloy",
      "speed": 1.0
    }
  },
  "telegram": {
    "chatId": "123456789"
  },
  "keys": {
    "openai": {
      "apiKey": "sk-..."
    },
    "telegram": {
      "botToken": "123:ABC"
    }
  }
}
```

## Setup web UI flags (disabled by default)

Flags:
- `--enable-setup-web` (default off)
- `--setup-host` (default `127.0.0.1`; non-loopback values are clamped to `127.0.0.1`)
- `--setup-port` (default `21420`)
- `--setup-token` (optional; if omitted, generated per run)

Behavior:
- setup web starts only if enabled and config is incomplete.
- binds locally only.
- if `--setup-port` is busy, server uses the next free local port.
- setup URL includes the current run token query param.
- check `simple_notify_status` to discover setup URL and missing fields.

## Tool contracts

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

### telegram_notify
Input:
```json
{ "text": "Job done" }
```

## Self-test

```bash
npm run self-test -- --text "simple-notify-mcp self-test"
```

Disable one side if needed:

```bash
npm run self-test -- --no-tts
npm run self-test -- --no-telegram
```

## Notes

- `tts_say` input is text-only; model/voice/speed are server config.
- OpenAI TTS failure falls back to macOS `say` when available.
- OpenAI playback uses macOS `afplay`.
