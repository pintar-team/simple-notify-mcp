import {
  FAL_ELEVEN_VOICES,
  FAL_ELEVEN_APPLY_TEXT_NORMALIZATION_OPTIONS,
  FAL_MINIMAX_AUDIO_BITRATES,
  FAL_MINIMAX_AUDIO_CHANNELS,
  FAL_MINIMAX_AUDIO_FORMATS,
  FAL_MINIMAX_EMOTIONS,
  FAL_MINIMAX_LANGUAGE_BOOST_OPTIONS,
  FAL_MINIMAX_SAMPLE_RATES,
  FAL_MINIMAX_VOICES,
  OPENAI_RESPONSE_FORMATS,
  OPENAI_TTS_MODELS,
  OPENAI_TTS_VOICES,
  getMissingConfigFields,
  type RuntimeConfig
} from "../runtime.js";
import { toneListToInput } from "./config-merge.js";
import { buildKeyStatusPayload } from "./status.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function boolChecked(value: boolean | undefined): string {
  return value ? " checked" : "";
}

function buildOptions(options: readonly string[], selected: string | undefined): string {
  return options.map(option => {
    const isSelected = option === selected ? " selected" : "";
    return `<option value="${escapeHtml(option)}"${isSelected}>${escapeHtml(option)}</option>`;
  }).join("");
}

function toScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

export function buildSetupPage(configPath: string, token: string, runtime: RuntimeConfig): string {
  const missing = getMissingConfigFields(runtime);
  const keyStatus = buildKeyStatusPayload(runtime);

  const provider = runtime.tts.provider;
  const openaiModel = runtime.tts.params.openai.model ?? OPENAI_TTS_MODELS[0];
  const openaiVoice = runtime.tts.params.openai.voice ?? OPENAI_TTS_VOICES[0];
  const openaiSpeed = String(runtime.tts.params.openai.speed ?? 1.0);
  const openaiResponseFormat = runtime.tts.params.openai.responseFormat ?? "mp3";
  const openaiInstructions = runtime.tts.params.openai.instructions ?? "";

  const falMinimaxVoiceId = runtime.tts.params.falMinimax.voiceId ?? "Wise_Woman";
  const falMinimaxSpeed = String(runtime.tts.params.falMinimax.speed ?? 1.0);
  const falMinimaxVol = String(runtime.tts.params.falMinimax.vol ?? 1.0);
  const falMinimaxPitch = String(runtime.tts.params.falMinimax.pitch ?? 0);
  const falMinimaxEmotion = runtime.tts.params.falMinimax.emotion ?? "";
  const falMinimaxLanguageBoost = runtime.tts.params.falMinimax.languageBoost ?? "auto";
  const falMinimaxOutputFormat = runtime.tts.params.falMinimax.outputFormat ?? "url";
  const falMinimaxAudioFormat = runtime.tts.params.falMinimax.audioFormat ?? "mp3";
  const falMinimaxAudioSampleRate = String(runtime.tts.params.falMinimax.audioSampleRate ?? 32000);
  const falMinimaxAudioChannel = String(runtime.tts.params.falMinimax.audioChannel ?? 1);
  const falMinimaxAudioBitrate = String(runtime.tts.params.falMinimax.audioBitrate ?? 128000);
  const falMinimaxNormalizationTargetLoudness = String(runtime.tts.params.falMinimax.normalizationTargetLoudness ?? -18);
  const falMinimaxNormalizationTargetRange = String(runtime.tts.params.falMinimax.normalizationTargetRange ?? 8);
  const falMinimaxNormalizationTargetPeak = String(runtime.tts.params.falMinimax.normalizationTargetPeak ?? -0.5);
  const falMinimaxVoiceModifyPitch = String(runtime.tts.params.falMinimax.voiceModifyPitch ?? 0);
  const falMinimaxVoiceModifyIntensity = String(runtime.tts.params.falMinimax.voiceModifyIntensity ?? 0);
  const falMinimaxVoiceModifyTimbre = String(runtime.tts.params.falMinimax.voiceModifyTimbre ?? 0);
  const falMinimaxPronunciationToneList = toneListToInput(runtime.tts.params.falMinimax.pronunciationToneList);

  const falElevenVoice = runtime.tts.params.falElevenlabs.voice ?? "Rachel";
  const falElevenStability = String(runtime.tts.params.falElevenlabs.stability ?? 0.5);
  const falElevenSimilarityBoost = String(runtime.tts.params.falElevenlabs.similarityBoost ?? 0.75);
  const falElevenStyle = String(runtime.tts.params.falElevenlabs.style ?? 0);
  const falElevenSpeed = String(runtime.tts.params.falElevenlabs.speed ?? 1);
  const falElevenLanguageCode = runtime.tts.params.falElevenlabs.languageCode ?? "";
  const falElevenApplyTextNormalization = runtime.tts.params.falElevenlabs.applyTextNormalization ?? "auto";

  const chatId = runtime.telegram.chatId ?? "";
  const testTextDefault = "Task complete. Build passed and your results are ready.";

  const openaiModelOptions = buildOptions(OPENAI_TTS_MODELS, openaiModel);
  const openaiVoiceOptions = buildOptions(OPENAI_TTS_VOICES, openaiVoice);
  const openaiFormatOptions = buildOptions(OPENAI_RESPONSE_FORMATS, openaiResponseFormat);
  const minimaxVoiceOptions = buildOptions(FAL_MINIMAX_VOICES, falMinimaxVoiceId);
  const minimaxEmotionOptions = buildOptions(["", ...FAL_MINIMAX_EMOTIONS], falMinimaxEmotion);
  const minimaxLanguageBoostOptions = buildOptions(FAL_MINIMAX_LANGUAGE_BOOST_OPTIONS, falMinimaxLanguageBoost);
  const minimaxOutputFormatOptions = buildOptions(["url", "hex"], falMinimaxOutputFormat);
  const minimaxAudioFormatOptions = buildOptions(FAL_MINIMAX_AUDIO_FORMATS, falMinimaxAudioFormat);
  const minimaxAudioSampleRateOptions = buildOptions(
    FAL_MINIMAX_SAMPLE_RATES.map(value => String(value)),
    falMinimaxAudioSampleRate
  );
  const minimaxAudioChannelOptions = buildOptions(
    FAL_MINIMAX_AUDIO_CHANNELS.map(value => String(value)),
    falMinimaxAudioChannel
  );
  const minimaxAudioBitrateOptions = buildOptions(
    FAL_MINIMAX_AUDIO_BITRATES.map(value => String(value)),
    falMinimaxAudioBitrate
  );
  const falElevenNormalizationOptions = buildOptions(
    FAL_ELEVEN_APPLY_TEXT_NORMALIZATION_OPTIONS,
    falElevenApplyTextNormalization
  );
  const falElevenVoiceOptions = buildOptions(FAL_ELEVEN_VOICES, falElevenVoice);

  const initialState = toScriptJson({
    missingConfig: missing,
    keyStatus
  });

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>simple-notify-mcp setup</title>
    <style>
      :root {
        --bg: #f5f7f8;
        --card: #ffffff;
        --ink: #111827;
        --muted: #64748b;
        --line: #d1d9df;
        --accent: #0f766e;
        --accent-ink: #ffffff;
        --ok: #14532d;
        --warn: #9a3412;
        --danger: #991b1b;
        --chip: #f1f5f9;
        --chip-ink: #0f172a;
      }
      * { box-sizing: border-box; }
      [hidden] { display: none !important; }
      html, body {
        margin: 0;
        padding: 0;
      }
      body {
        color: var(--ink);
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at 10% -10%, #d1fae5 0, transparent 34%),
          radial-gradient(circle at 100% 0%, #dbeafe 0, transparent 38%),
          var(--bg);
      }
      .wrap {
        width: min(1080px, calc(100% - 24px));
        margin: 20px auto 40px;
      }
      .hero {
        background: linear-gradient(135deg, #0f766e 0%, #065f46 100%);
        color: var(--accent-ink);
        border-radius: 16px;
        padding: 18px 20px;
        box-shadow: 0 18px 26px rgba(0, 0, 0, 0.08);
      }
      .hero h1 {
        margin: 0;
        font-size: 22px;
        font-weight: 700;
      }
      .hero p {
        margin: 8px 0 0;
        font-size: 15px;
        opacity: 0.92;
      }
      .card {
        margin-top: 14px;
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 14px;
      }
      .meta-row {
        display: grid;
        grid-template-columns: 1fr;
        gap: 10px;
      }
      .meta-item {
        font-size: 13px;
        color: var(--muted);
      }
      .meta-item code {
        font-size: 13px;
        padding: 2px 6px;
        border-radius: 6px;
        background: #f3f4f6;
        color: var(--ink);
      }
      .missing-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 8px;
      }
      .missing-chip {
        border: 1px solid #cbd5e1;
        background: var(--chip);
        color: var(--chip-ink);
        border-radius: 999px;
        padding: 6px 10px;
        font-size: 12px;
        cursor: pointer;
      }
      .missing-empty {
        color: var(--ok);
        font-size: 12px;
      }
      .steps {
        margin: 12px 0 0;
        padding: 0;
        list-style: none;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }
      .step {
        border: 1px solid #d7e2e8;
        border-radius: 12px;
        padding: 10px;
        display: grid;
        gap: 3px;
        background: #f8fafc;
      }
      .step .step-title {
        font-size: 13px;
        font-weight: 600;
      }
      .step .step-note {
        font-size: 12px;
        color: var(--muted);
      }
      .step.done {
        border-color: #86efac;
        background: #f0fdf4;
      }
      .step.active {
        border-color: #5eead4;
        background: #ecfeff;
      }
      #next-hint {
        margin: 8px 0 0;
        color: var(--muted);
        font-size: 13px;
      }
      .tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 14px;
      }
      .tab {
        border: 1px solid var(--line);
        background: #ffffff;
        color: var(--ink);
        border-radius: 999px;
        padding: 8px 14px;
        font-size: 14px;
        cursor: pointer;
      }
      .tab.active {
        background: var(--accent);
        border-color: var(--accent);
        color: var(--accent-ink);
      }
      .panel {
        display: none;
        margin-top: 12px;
      }
      .panel.active {
        display: block;
      }
      .grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 12px;
      }
      .grid.two {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .grid.three {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .section {
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 12px;
        background: #fafbfc;
      }
      .section h3 {
        margin: 0 0 8px;
        font-size: 15px;
      }
      .section p {
        margin: 0;
        color: var(--muted);
        font-size: 12px;
      }
      .stack {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .provider-card {
        display: none;
      }
      .provider-card.active {
        display: block;
      }
      label {
        display: grid;
        gap: 6px;
        color: var(--muted);
        font-size: 13px;
      }
      input, select, textarea {
        width: 100%;
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        padding: 10px 12px;
        background: #ffffff;
        color: var(--ink);
        font-size: 14px;
      }
      input:focus, select:focus, textarea:focus {
        outline: 2px solid #5eead4;
        outline-offset: 1px;
      }
      textarea {
        min-height: 78px;
        resize: vertical;
      }
      .hint {
        font-size: 12px;
        color: var(--muted);
        line-height: 1.2;
      }
      details.advanced {
        border: 1px dashed #cbd5e1;
        border-radius: 10px;
        padding: 8px 10px;
        background: #ffffff;
        margin-top: 10px;
      }
      details.advanced > summary {
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        color: #334155;
        margin: 0;
      }
      details.advanced[open] > summary {
        margin-bottom: 8px;
      }
      details.advanced .advanced-grid {
        display: grid;
        gap: 10px;
      }
      .field-no-hint {
        padding-bottom: 16px;
      }
      .test-section {
        margin-top: 12px;
      }
      .test-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 10px;
        align-items: end;
      }
      .test-buttons {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, max-content));
        gap: 8px;
      }
      .test-buttons .action-btn[hidden] {
        display: none;
      }
      .toggle {
        display: grid;
        grid-template-columns: 42px 1fr;
        gap: 10px;
        align-items: center;
      }
      .toggle input {
        position: absolute;
        opacity: 0;
        width: 1px;
        height: 1px;
      }
      .toggle-slider {
        width: 42px;
        height: 24px;
        border-radius: 999px;
        background: #cbd5e1;
        position: relative;
        transition: background 0.2s ease;
      }
      .toggle-slider::after {
        content: "";
        position: absolute;
        top: 2px;
        left: 2px;
        width: 20px;
        height: 20px;
        border-radius: 999px;
        background: #ffffff;
        transition: left 0.2s ease;
      }
      .toggle input:checked + .toggle-slider {
        background: #14b8a6;
      }
      .toggle input:checked + .toggle-slider::after {
        left: 20px;
      }
      .toggle-title {
        color: #334155;
        font-size: 13px;
        font-weight: 600;
      }
      .secret-row {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
      }
      .secret-toggle {
        border: 1px solid #cbd5e1;
        background: #ffffff;
        color: #334155;
        border-radius: 10px;
        padding: 0 10px;
        cursor: pointer;
      }
      .key-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .badge {
        border-radius: 999px;
        padding: 2px 8px;
        font-size: 11px;
        border: 1px solid #cbd5e1;
      }
      .badge.ok {
        color: #166534;
        border-color: #86efac;
        background: #f0fdf4;
      }
      .badge.bad {
        color: #991b1b;
        border-color: #fecaca;
        background: #fef2f2;
      }
      .clear-toggle {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: var(--muted);
        font-size: 12px;
      }
      .clear-toggle input {
        width: 14px;
        height: 14px;
        padding: 0;
      }
      .actions {
        margin-top: 14px;
        border-top: 1px solid #dbe3ea;
        background: #ffffff;
        padding-top: 12px;
      }
      .action-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .action-row .action-btn {
        flex: 0 0 auto;
      }
      .action-row #result {
        flex: 1;
        min-width: 0;
      }
      .action-btn {
        border: none;
        border-radius: 10px;
        padding: 10px 14px;
        font-size: 13px;
        cursor: pointer;
      }
      .action-btn.primary {
        background: var(--accent);
        color: #ffffff;
      }
      .action-btn.secondary {
        background: #0f172a;
        color: #ffffff;
      }
      .action-btn.ghost {
        background: #e2e8f0;
        color: #0f172a;
      }
      .action-btn:disabled {
        cursor: not-allowed;
        opacity: 0.7;
      }
      #result {
        margin-top: 0;
        min-height: 18px;
        font-size: 13px;
      }
      #result.ok { color: var(--ok); }
      #result.warn { color: var(--warn); }
      #result.err { color: var(--danger); }
      @media (max-width: 980px) {
        .grid.two, .grid.three {
          grid-template-columns: 1fr;
        }
        .steps {
          grid-template-columns: 1fr;
        }
      }
      @media (max-width: 760px) {
        .test-row {
          grid-template-columns: 1fr;
        }
        .test-buttons {
          grid-template-columns: 1fr;
        }
        .action-row {
          flex-direction: column;
          align-items: stretch;
        }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="hero">
        <h1>simple-notify-mcp control panel</h1>
        <p>Configure TTS provider settings, Telegram destination, and API keys for this local MCP server.</p>
      </div>

      <div class="card">
        <div class="meta-row">
          <div class="meta-item">Config path: <code>${escapeHtml(configPath)}</code></div>
          <div id="missing-meta" class="meta-item">
            Missing config:
            <div id="missing-list" class="missing-list"></div>
          </div>
          <ol class="steps">
            <li class="step" data-step="keys">
              <span class="step-title">1. Keys</span>
              <span class="step-note">Set provider + Telegram secrets</span>
            </li>
            <li class="step" data-step="telegram">
              <span class="step-title">2. Telegram</span>
              <span class="step-note">Set destination chat id</span>
            </li>
            <li class="step" data-step="tts">
              <span class="step-title">3. TTS</span>
              <span class="step-note">Pick provider and tune voice</span>
            </li>
          </ol>
          <div id="next-hint"></div>
        </div>

        <form id="setup-form">
          <div class="tabs">
            <button class="tab" type="button" data-tab="tts">TTS</button>
            <button class="tab" type="button" data-tab="telegram">Telegram</button>
            <button class="tab" type="button" data-tab="misc">Misc</button>
            <button class="tab" type="button" data-tab="keys">Keys</button>
          </div>

          <div class="panel" data-panel="tts">
            <div class="grid">
              <div class="section stack">
                <h3>Provider</h3>
                <p>Pick one provider. Basic settings stay visible; advanced settings are collapsed.</p>
                <label>
                  Provider
                  <select name="provider" id="provider">
                    <option value="openai" ${provider === "openai" ? "selected" : ""}>openai</option>
                    <option value="fal-minimax" ${provider === "fal-minimax" ? "selected" : ""}>fal-minimax</option>
                    <option value="fal-elevenlabs" ${provider === "fal-elevenlabs" ? "selected" : ""}>fal-elevenlabs</option>
                  </select>
                </label>
              </div>

              <div class="provider-card section stack" data-provider="openai">
                <h3>OpenAI params</h3>
                <div class="grid two">
                  <label>
                    Model
                    <select name="openaiModel">${openaiModelOptions}</select>
                  </label>
                  <label>
                    Voice
                    <select name="openaiVoice">${openaiVoiceOptions}</select>
                  </label>
                </div>
                <div class="grid two">
                  <label>
                    Speed (0.25 to 4.0)
                    <input name="openaiSpeed" value="${escapeHtml(openaiSpeed)}" type="number" min="0.25" max="4" step="0.05" inputmode="decimal" />
                  </label>
                  <label class="field-no-hint">
                    Response format
                    <select name="openaiResponseFormat">${openaiFormatOptions}</select>
                  </label>
                </div>
                <details class="advanced">
                  <summary>Advanced</summary>
                  <div class="advanced-grid">
                    <label>
                      Instructions (optional)
                      <textarea name="openaiInstructions" placeholder="Speak in a calm, concise style">${escapeHtml(openaiInstructions)}</textarea>
                    </label>
                  </div>
                </details>
              </div>

              <div class="provider-card section stack" data-provider="fal-minimax">
                <h3>FAL MiniMax Speech 2.8 Turbo params</h3>
                <div class="grid three">
                  <label>
                    Voice ID
                    <select name="falMinimaxVoiceId">${minimaxVoiceOptions}</select>
                  </label>
                  <label>
                    Emotion
                    <select name="falMinimaxEmotion">${minimaxEmotionOptions}</select>
                  </label>
                  <label>
                    Speed (0.5 to 2.0)
                    <input name="falMinimaxSpeed" value="${escapeHtml(falMinimaxSpeed)}" type="number" min="0.5" max="2" step="0.05" inputmode="decimal" />
                  </label>
                </div>
                <details class="advanced">
                  <summary>Advanced</summary>
                  <div class="advanced-grid">
                    <div class="grid two">
                      <label>
                        Volume
                        <input name="falMinimaxVol" value="${escapeHtml(falMinimaxVol)}" type="number" min="0.01" max="10" step="0.01" inputmode="decimal" />
                        <span class="hint">Range: 0.01 to 10</span>
                      </label>
                      <label>
                        Pitch
                        <input name="falMinimaxPitch" value="${escapeHtml(falMinimaxPitch)}" type="number" min="-12" max="12" step="1" inputmode="numeric" />
                        <span class="hint">Range: -12 to 12</span>
                      </label>
                    </div>
                    <div class="grid two">
                      <label>
                        Language boost
                        <select name="falMinimaxLanguageBoost">${minimaxLanguageBoostOptions}</select>
                      </label>
                      <label class="toggle">
                        <input name="falMinimaxEnglishNormalization" type="checkbox"${boolChecked(runtime.tts.params.falMinimax.englishNormalization ?? false)} />
                        <span class="toggle-slider" aria-hidden="true"></span>
                        <span class="toggle-title">English normalization</span>
                      </label>
                    </div>
                    <div class="grid three">
                      <label>
                        Output format
                        <select name="falMinimaxOutputFormat">${minimaxOutputFormatOptions}</select>
                      </label>
                      <label>
                        Audio format
                        <select name="falMinimaxAudioFormat">${minimaxAudioFormatOptions}</select>
                      </label>
                      <label>
                        Sample rate
                        <select name="falMinimaxAudioSampleRate">${minimaxAudioSampleRateOptions}</select>
                      </label>
                    </div>
                    <div class="grid three">
                      <label>
                        Channel
                        <select name="falMinimaxAudioChannel">${minimaxAudioChannelOptions}</select>
                      </label>
                      <label>
                        Bitrate
                        <select name="falMinimaxAudioBitrate">${minimaxAudioBitrateOptions}</select>
                      </label>
                      <label class="toggle">
                        <input name="falMinimaxNormalizationEnabled" type="checkbox"${boolChecked(runtime.tts.params.falMinimax.normalizationEnabled ?? true)} />
                        <span class="toggle-slider" aria-hidden="true"></span>
                        <span class="toggle-title">Normalization enabled</span>
                      </label>
                    </div>
                    <div class="grid three">
                      <label>
                        Target loudness
                        <input name="falMinimaxNormalizationTargetLoudness" value="${escapeHtml(falMinimaxNormalizationTargetLoudness)}" type="number" min="-70" max="-10" step="0.1" inputmode="decimal" />
                        <span class="hint">Range: -70 to -10</span>
                      </label>
                      <label>
                        Target range
                        <input name="falMinimaxNormalizationTargetRange" value="${escapeHtml(falMinimaxNormalizationTargetRange)}" type="number" min="0" max="20" step="0.1" inputmode="decimal" />
                        <span class="hint">Range: 0 to 20</span>
                      </label>
                      <label>
                        Target peak
                        <input name="falMinimaxNormalizationTargetPeak" value="${escapeHtml(falMinimaxNormalizationTargetPeak)}" type="number" min="-3" max="0" step="0.1" inputmode="decimal" />
                        <span class="hint">Range: -3 to 0</span>
                      </label>
                    </div>
                    <div class="grid three">
                      <label>
                        Voice modify pitch
                        <input name="falMinimaxVoiceModifyPitch" value="${escapeHtml(falMinimaxVoiceModifyPitch)}" type="number" min="-100" max="100" step="1" inputmode="numeric" />
                      </label>
                      <label>
                        Voice modify intensity
                        <input name="falMinimaxVoiceModifyIntensity" value="${escapeHtml(falMinimaxVoiceModifyIntensity)}" type="number" min="-100" max="100" step="1" inputmode="numeric" />
                      </label>
                      <label>
                        Voice modify timbre
                        <input name="falMinimaxVoiceModifyTimbre" value="${escapeHtml(falMinimaxVoiceModifyTimbre)}" type="number" min="-100" max="100" step="1" inputmode="numeric" />
                      </label>
                    </div>
                    <label>
                      Pronunciation tone list (comma or newline separated)
                      <textarea name="falMinimaxPronunciationToneList" placeholder="燕少飞/(yan4)(shao3)(fei1)">${escapeHtml(falMinimaxPronunciationToneList)}</textarea>
                    </label>
                  </div>
                </details>
              </div>

              <div class="provider-card section stack" data-provider="fal-elevenlabs">
                <h3>FAL ElevenLabs Eleven-v3 params</h3>
                <div class="grid two">
                  <label>
                    Voice
                    <select name="falElevenVoice">${falElevenVoiceOptions}</select>
                  </label>
                  <label>
                    Speed (0.7 to 1.2)
                    <input name="falElevenSpeed" value="${escapeHtml(falElevenSpeed)}" type="number" min="0.7" max="1.2" step="0.05" inputmode="decimal" />
                  </label>
                </div>
                <div class="grid two">
                  <label>
                    Language code (optional)
                    <input name="falElevenLanguageCode" value="${escapeHtml(falElevenLanguageCode)}" placeholder="en" />
                  </label>
                  <label>
                    Text normalization
                    <select name="falElevenApplyTextNormalization">${falElevenNormalizationOptions}</select>
                  </label>
                </div>
                <details class="advanced">
                  <summary>Advanced</summary>
                  <div class="advanced-grid">
                    <label class="toggle">
                      <input name="falElevenTimestamps" type="checkbox"${boolChecked(runtime.tts.params.falElevenlabs.timestamps ?? false)} />
                      <span class="toggle-slider" aria-hidden="true"></span>
                      <span class="toggle-title">Return timestamps</span>
                    </label>
                    <div class="grid three">
                      <label>
                        Stability
                        <input name="falElevenStability" value="${escapeHtml(falElevenStability)}" type="number" min="0" max="1" step="0.05" inputmode="decimal" />
                        <span class="hint">Range: 0 to 1</span>
                      </label>
                      <label>
                        Similarity boost
                        <input name="falElevenSimilarityBoost" value="${escapeHtml(falElevenSimilarityBoost)}" type="number" min="0" max="1" step="0.05" inputmode="decimal" />
                        <span class="hint">Range: 0 to 1</span>
                      </label>
                      <label>
                        Style
                        <input name="falElevenStyle" value="${escapeHtml(falElevenStyle)}" type="number" min="0" max="1" step="0.05" inputmode="decimal" />
                        <span class="hint">Range: 0 to 1</span>
                      </label>
                    </div>
                  </div>
                </details>
              </div>
            </div>
          </div>

          <div class="panel" data-panel="telegram">
            <div class="grid">
              <div class="section stack">
                <h3>Telegram destination</h3>
                <p>Use a numeric chat id or channel id where notifications should be sent.</p>
                <label>
                  Chat ID
                  <input name="telegramChatId" value="${escapeHtml(chatId)}" placeholder="123456789" />
                </label>
              </div>
            </div>
          </div>

          <div class="panel" data-panel="misc">
            <div class="grid">
              <div class="section stack">
                <h3>Runtime behavior</h3>
                <label class="toggle">
                  <input name="ttsAsyncByDefault" type="checkbox"${boolChecked(runtime.misc.ttsAsyncByDefault)} />
                  <span class="toggle-slider" aria-hidden="true"></span>
                  <span class="toggle-title"><code>tts_say</code> async by default</span>
                </label>
                <p>If enabled, <code>tts_say</code> returns immediately and generation runs in the background.</p>
              </div>
            </div>
          </div>

          <div class="panel" data-panel="keys">
            <div class="grid three">
              <div class="section stack">
                <div class="key-head">
                  <h3>OpenAI</h3>
                  <span class="badge ${escapeHtml(keyStatus.openai.className)}" data-key-badge="openai">${escapeHtml(keyStatus.openai.label)}</span>
                </div>
                <label>
                  API key
                  <div class="secret-row">
                    <input name="openaiApiKey" type="password" placeholder="sk-..." autocomplete="off" data-secret-input />
                    <button type="button" class="secret-toggle" data-secret-toggle>Show</button>
                  </div>
                </label>
                <label class="clear-toggle">
                  <input type="checkbox" name="clearOpenaiApiKey" data-clear-target="openaiApiKey" />
                  Clear stored key
                </label>
              </div>

              <div class="section stack">
                <div class="key-head">
                  <h3>FAL</h3>
                  <span class="badge ${escapeHtml(keyStatus.fal.className)}" data-key-badge="fal">${escapeHtml(keyStatus.fal.label)}</span>
                </div>
                <label>
                  API key
                  <div class="secret-row">
                    <input name="falApiKey" type="password" placeholder="fal_..." autocomplete="off" data-secret-input />
                    <button type="button" class="secret-toggle" data-secret-toggle>Show</button>
                  </div>
                </label>
                <label class="clear-toggle">
                  <input type="checkbox" name="clearFalApiKey" data-clear-target="falApiKey" />
                  Clear stored key
                </label>
              </div>

              <div class="section stack">
                <div class="key-head">
                  <h3>Telegram</h3>
                  <span class="badge ${escapeHtml(keyStatus.telegram.className)}" data-key-badge="telegram">${escapeHtml(keyStatus.telegram.label)}</span>
                </div>
                <label>
                  Bot token
                  <div class="secret-row">
                    <input name="telegramBotToken" type="password" placeholder="123:ABC" autocomplete="off" data-secret-input />
                    <button type="button" class="secret-toggle" data-secret-toggle>Show</button>
                  </div>
                </label>
                <label class="clear-toggle">
                  <input type="checkbox" name="clearTelegramBotToken" data-clear-target="telegramBotToken" />
                  Clear stored token
                </label>
              </div>
            </div>
          </div>

          <div class="test-section section stack" id="test-section">
            <h3>Tests</h3>
            <p>Use after saving config. Test actions save the form first, then run the selected test.</p>
            <div class="test-row">
              <label>
                Test message (optional)
                <input id="test-text" name="testText" value="${escapeHtml(testTextDefault)}" />
              </label>
              <div class="test-buttons">
                <button class="action-btn secondary" id="test-action-btn" type="submit" data-intent="save-test-tts">Save + Test TTS</button>
              </div>
            </div>
          </div>

          <div class="actions">
            <div class="action-row">
              <div id="result">Empty secret fields keep existing values unless "clear" is checked.</div>
              <button class="action-btn primary" type="submit" data-intent="save">Save</button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <script id="initial-state" type="application/json">${initialState}</script>
    <script>
      const SETUP_TOKEN = ${toScriptJson(token)};
      const TAB_ORDER = ["tts", "telegram", "misc", "keys"];
      const CHECKBOX_NAMES = [
        "falMinimaxEnglishNormalization",
        "falMinimaxNormalizationEnabled",
        "falElevenTimestamps",
        "ttsAsyncByDefault",
        "clearOpenaiApiKey",
        "clearFalApiKey",
        "clearTelegramBotToken"
      ];
      const MISSING_LABELS = {
        "keys.openai.apiKey": "OpenAI API key",
        "keys.fal.apiKey": "FAL API key",
        "keys.telegram.botToken": "Telegram bot token",
        "telegram.chatId": "Telegram chat id"
      };

      function missingFieldToTab(field) {
        if (field === "telegram.chatId") {
          return "telegram";
        }
        if (field.startsWith("keys.")) {
          return "keys";
        }
        return "tts";
      }

      function missingFieldToInputName(field) {
        if (field === "keys.openai.apiKey") return "openaiApiKey";
        if (field === "keys.fal.apiKey") return "falApiKey";
        if (field === "keys.telegram.botToken") return "telegramBotToken";
        if (field === "telegram.chatId") return "telegramChatId";
        return null;
      }

      function safeJsonParse(text, fallback) {
        try {
          return JSON.parse(text);
        } catch {
          return fallback;
        }
      }

      const form = document.getElementById("setup-form");
      const resultNode = document.getElementById("result");
      const missingListNode = document.getElementById("missing-list");
      const missingMetaNode = document.getElementById("missing-meta");
      const nextHintNode = document.getElementById("next-hint");
      const providerSelect = document.getElementById("provider");
      const tabs = Array.from(document.querySelectorAll(".tab"));
      const panels = Array.from(document.querySelectorAll(".panel"));
      const providerCards = Array.from(document.querySelectorAll(".provider-card"));
      const actionButtons = Array.from(document.querySelectorAll(".action-btn"));
      const initialStateNode = document.getElementById("initial-state");
      const testTextInput = document.getElementById("test-text");
      const testSection = document.getElementById("test-section");
      const testActionButton = document.getElementById("test-action-btn");

      const parsedState = safeJsonParse(initialStateNode ? initialStateNode.textContent || "{}" : "{}", {});
      let missingConfig = Array.isArray(parsedState.missingConfig) ? parsedState.missingConfig.slice() : [];
      let keyStatus = parsedState.keyStatus && typeof parsedState.keyStatus === "object"
        ? parsedState.keyStatus
        : { openai: { label: "Missing", className: "bad" }, fal: { label: "Missing", className: "bad" }, telegram: { label: "Missing", className: "bad" } };

      function setResult(text, level) {
        resultNode.textContent = text;
        resultNode.className = level || "";
      }

      function setBusy(busy) {
        for (const button of actionButtons) {
          button.disabled = busy;
        }
      }

      function setSubmitterSavingState(submitter, busy) {
        if (!submitter || submitter.tagName !== "BUTTON") {
          return;
        }
        if (busy) {
          submitter.setAttribute("data-original-label", submitter.textContent || "");
          submitter.textContent = "Saving...";
          return;
        }
        const original = submitter.getAttribute("data-original-label");
        if (original !== null) {
          submitter.textContent = original;
          submitter.removeAttribute("data-original-label");
        }
      }

      function updateKeyBadges() {
        for (const badge of document.querySelectorAll("[data-key-badge]")) {
          const key = badge.getAttribute("data-key-badge");
          const state = keyStatus[key];
          if (!state) {
            continue;
          }
          badge.textContent = state.label;
          badge.classList.remove("ok", "bad");
          badge.classList.add(state.className);
        }
      }

      function renderMissingChips() {
        missingListNode.innerHTML = "";
        if (!missingConfig.length) {
          if (missingMetaNode) {
            missingMetaNode.hidden = true;
          }
          return;
        }
        if (missingMetaNode) {
          missingMetaNode.hidden = false;
        }

        for (const field of missingConfig) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "missing-chip";
          button.textContent = MISSING_LABELS[field] || field;
          button.addEventListener("click", () => {
            const tab = missingFieldToTab(field);
            activateTab(tab, true);
            const inputName = missingFieldToInputName(field);
            if (!inputName) {
              return;
            }
            const input = form.querySelector('[name="' + inputName + '"]');
            if (input && typeof input.focus === "function") {
              input.focus();
              if (typeof input.scrollIntoView === "function") {
                input.scrollIntoView({ block: "center", behavior: "smooth" });
              }
            }
          });
          missingListNode.appendChild(button);
        }
      }

      function providerKeyReady(provider) {
        if (provider === "openai") {
          return keyStatus.openai && keyStatus.openai.className === "ok";
        }
        return keyStatus.fal && keyStatus.fal.className === "ok";
      }

      function updateSteps() {
        const provider = providerSelect.value;
        const keysDone = !missingConfig.some(item => item.startsWith("keys."));
        const telegramDone = !missingConfig.includes("telegram.chatId");
        const ttsDone = providerKeyReady(provider);

        const steps = {
          keys: { done: keysDone, active: !keysDone },
          telegram: { done: telegramDone, active: keysDone && !telegramDone },
          tts: { done: ttsDone, active: keysDone && telegramDone && !ttsDone }
        };

        for (const node of document.querySelectorAll(".step")) {
          const stepName = node.getAttribute("data-step");
          const state = steps[stepName];
          if (!state) {
            continue;
          }
          node.classList.toggle("done", state.done);
          node.classList.toggle("active", state.active);
        }

        if (!keysDone) {
          nextHintNode.textContent = "Next: open Keys tab and fill required provider + Telegram secrets.";
          return;
        }
        if (!telegramDone) {
          nextHintNode.textContent = "Next: open Telegram tab and set chat id.";
          return;
        }
        if (!ttsDone) {
          nextHintNode.textContent = "Next: current provider key is missing. Fill Keys tab before testing TTS.";
          return;
        }
        nextHintNode.textContent = "Config is ready. Save, then run Save + Test buttons.";
      }

      function activateTab(tabName, updateHash) {
        const target = TAB_ORDER.includes(tabName) ? tabName : "tts";
        for (const tab of tabs) {
          tab.classList.toggle("active", tab.getAttribute("data-tab") === target);
        }
        for (const panel of panels) {
          panel.classList.toggle("active", panel.getAttribute("data-panel") === target);
        }
        if (testSection) {
          const showTests = target === "tts" || target === "telegram";
          testSection.hidden = !showTests;
        }
        if (testActionButton) {
          if (target === "telegram") {
            testActionButton.textContent = "Save + Test Telegram";
            testActionButton.classList.remove("secondary");
            testActionButton.classList.add("ghost");
            testActionButton.setAttribute("data-intent", "save-test-telegram");
          } else {
            testActionButton.textContent = "Save + Test TTS";
            testActionButton.classList.remove("ghost");
            testActionButton.classList.add("secondary");
            testActionButton.setAttribute("data-intent", "save-test-tts");
          }
        }
        if (updateHash) {
          history.replaceState(null, "", "#" + target);
        }
      }

      function syncProviderCards() {
        const selected = providerSelect.value;
        for (const card of providerCards) {
          card.classList.toggle("active", card.getAttribute("data-provider") === selected);
        }
        updateSteps();
      }

      for (const tab of tabs) {
        tab.addEventListener("click", () => {
          activateTab(tab.getAttribute("data-tab") || "tts", true);
        });
      }

      providerSelect.addEventListener("change", syncProviderCards);

      for (const toggle of document.querySelectorAll("[data-secret-toggle]")) {
        toggle.addEventListener("click", () => {
          const row = toggle.closest(".secret-row");
          const input = row ? row.querySelector("[data-secret-input]") : null;
          if (!input) {
            return;
          }
          const nextType = input.type === "password" ? "text" : "password";
          input.type = nextType;
          toggle.textContent = nextType === "password" ? "Show" : "Hide";
        });
      }

      for (const clearToggle of document.querySelectorAll("[data-clear-target]")) {
        clearToggle.addEventListener("change", () => {
          const target = clearToggle.getAttribute("data-clear-target");
          const input = target ? form.querySelector('[name="' + target + '"]') : null;
          if (!input) {
            return;
          }
          if (clearToggle.checked) {
            input.value = "";
          }
          input.disabled = clearToggle.checked;
        });
      }

      // Enter key should not submit the whole form from text fields.
      form.addEventListener("keydown", event => {
        if (event.key !== "Enter") {
          return;
        }
        const target = event.target;
        if (!target || target.tagName === "TEXTAREA" || target.tagName === "BUTTON") {
          return;
        }
        event.preventDefault();
      });

      function formPayload(submitter) {
        const formData = new FormData(form);
        const payload = Object.fromEntries(formData.entries());
        for (const name of CHECKBOX_NAMES) {
          const input = form.querySelector('[name="' + name + '"]');
          if (input && input.type === "checkbox") {
            payload[name] = input.checked ? "true" : "false";
          }
        }
        const intent = submitter && submitter.getAttribute("data-intent") || "save";
        if (intent === "save-test-tts") {
          payload.runTests = "tts";
        } else if (intent === "save-test-telegram") {
          payload.runTests = "telegram";
        }
        payload.testText = testTextInput.value || "";
        return payload;
      }

      function firstTabFromMissing() {
        if (!missingConfig.length) {
          return "tts";
        }
        return missingFieldToTab(missingConfig[0]);
      }

      form.addEventListener("submit", async event => {
        event.preventDefault();
        const submitter = event.submitter || null;
        const payload = formPayload(submitter);
        setBusy(true);
        setSubmitterSavingState(submitter, true);

        try {
          const response = await fetch("/api/config", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Setup-Token": SETUP_TOKEN
            },
            body: JSON.stringify(payload)
          });
          const responseText = await response.text();
          const body = safeJsonParse(responseText, { ok: false, error: responseText });
          if (!response.ok || !body.ok) {
            throw new Error(body.error || "Save failed");
          }

          missingConfig = Array.isArray(body.missingConfig) ? body.missingConfig.slice() : [];
          if (body.keyStatus && typeof body.keyStatus === "object") {
            keyStatus = body.keyStatus;
          }
          renderMissingChips();
          updateKeyBadges();
          updateSteps();

          const tests = body.tests || {};
          const messages = ["Saved"];
          let level = "ok";
          if (tests.tts) {
            messages.push("TTS: " + tests.tts.message);
            if (!tests.tts.ok) {
              level = "warn";
            }
          }
          if (tests.telegram) {
            messages.push("Telegram: " + tests.telegram.message);
            if (!tests.telegram.ok) {
              level = "warn";
            }
          }
          setResult(messages.join(" | "), level);
        } catch (error) {
          const message = String(error);
          if (message.toLowerCase().includes("failed to fetch")) {
            setResult("Failed to reach setup server. It may have restarted; ask your agent for a fresh setupWeb.url.", "err");
          } else {
            setResult(message, "err");
          }
        } finally {
          setSubmitterSavingState(submitter, false);
          setBusy(false);
        }
      });

      renderMissingChips();
      updateKeyBadges();
      syncProviderCards();

      const hashTab = (window.location.hash || "").replace("#", "").toLowerCase();
      const initialTab = TAB_ORDER.includes(hashTab) ? hashTab : firstTabFromMissing();
      activateTab(initialTab, false);
    </script>
  </body>
</html>`;
}
