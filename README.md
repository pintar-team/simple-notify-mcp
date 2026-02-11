# simple-notify-mcp

KISS MCP server that exposes two tools:
- `tts_say` (speaks text via OpenAI TTS with system fallback)
- `telegram_notify` (sends a Telegram message)

Tools are registered based on available capabilities:
- `tts_say`: OpenAI key or macOS system TTS
- `telegram_notify`: Telegram bot token + chat id

## Install (npx)

```bash
codex mcp add simple-notify -- npx -y simple-notify-mcp@latest
```

## Configuration

- Env (optional for TTS):
  - `OPENAI_API_KEY`

- Config file (optional):
  - `$XDG_CONFIG_HOME/simple-notify-mcp/config.json`
  - or `~/.config/simple-notify-mcp/config.json`
  - or override with `--config /path/to/config.json`

### Example config.json

```json
{
  "tts": {
    "model": "gpt-4o-mini-tts",
    "voice": "alloy",
    "speed": 1.0
  },
  "telegram": {
    "botToken": "123:ABC",
    "chatId": "123456789"
  }
}
```

## CLI overrides

```bash
npx -y simple-notify-mcp@latest \
  --model gpt-4o-mini-tts \
  --voice alloy \
  --speed 1.0 \
  --telegram-bot-token 123:ABC \
  --telegram-chat-id 123456789
```

## Tools

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

Disable one side if you only want to test the other:

```bash
npm run self-test -- --no-tts
npm run self-test -- --no-telegram
```

## Notes
- `tts_say` does not accept voice/model/format/speed in tool input. These are configured by server defaults/config file.
- If OpenAI TTS is unavailable, server falls back to macOS `say` when available.
- OpenAI playback uses macOS `afplay`.
- If a tool’s required config is missing, it is not registered.
