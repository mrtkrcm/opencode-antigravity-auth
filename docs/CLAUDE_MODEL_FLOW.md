# Claude Model Flow: OpenCode → Plugin → Antigravity API

**Version:** 1.0  
**Last Updated:** December 2025  
**Branches:** `claude-improvements`, `improve-tools-call-sanitizer`

---

## Overview

This document explains how Claude models are handled through the Antigravity plugin, including the full request/response flow, recent improvements, and fixes.

### Why Special Handling?

Claude models via Antigravity require special handling because:

1. **Gemini-style format** - Antigravity uses `contents[]` with `parts[]`, not Anthropic's `messages[]`
2. **Thinking signatures** - Multi-turn conversations require signed thinking blocks
3. **Tool schema restrictions** - Claude rejects unsupported JSON Schema features (`const`, `$ref`, etc.)
4. **SDK injection** - OpenCode SDKs may inject fields (`cache_control`) that Claude rejects

---

## Full Request Flow

```
┌─────────────────────────────────────────────────────────────┐
│  OpenCode Request (OpenAI-style)                            │
│  POST to generativelanguage.googleapis.com/models/claude-*  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  plugin.ts (fetch interceptor)                              │
│  • Account selection & round-robin rotation                 │
│  • Token refresh if expired                                 │
│  • Rate limit handling (429 → switch account or wait)       │
│  • Endpoint fallback (daily → autopush → prod)              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  request.ts :: prepareAntigravityRequest()                  │
│  • Detect Claude model from URL                             │
│  • Set toolConfig.functionCallingConfig.mode = "VALIDATED"  │
│  • Configure thinkingConfig for *-thinking models           │
│  • Sanitize tool schemas (allowlist approach)               │
│  • Add placeholder property for empty tool schemas          │
│  • Filter unsigned thinking blocks from history             │
│  • Restore signatures from cache if available               │
│  • Assign tool call/response IDs (FIFO matching)            │
│  • Inject interleaved-thinking system hint                  │
│  • Add anthropic-beta: interleaved-thinking-2025-05-14      │
│  • Wrap in Antigravity format: {project, model, request}    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Antigravity API                                            │
│  POST https://cloudcode-pa.googleapis.com/v1internal:*      │
│  • Gemini-style request format                              │
│  • Returns SSE stream with candidates[] structure           │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  request.ts :: transformAntigravityResponse()               │
│  • Real-time SSE TransformStream (line-by-line)             │
│  • Cache thinking signatures for multi-turn reuse           │
│  • Transform thought parts → reasoning format               │
│  • Extract and forward usage metadata                       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  OpenCode Response (streamed incrementally)                 │
│  Thinking tokens visible as they arrive                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Improvements from `claude-improvements` Branch

| Feature | Description | Location |
|---------|-------------|----------|
| **Signature Caching** | Cache thinking signatures by text hash for multi-turn conversations. Prevents "invalid signature" errors. | `cache.ts` |
| **Real-time Streaming** | `TransformStream` processes SSE line-by-line for immediate token display | `request.ts:87-121` |
| **Interleaved Thinking** | Auto-enable `anthropic-beta: interleaved-thinking-2025-05-14` header | `request.ts:813-824` |
| **Validated Tool Calling** | Set `functionCallingConfig.mode = "VALIDATED"` for Claude models | `request.ts:314-325` |
| **System Hints** | Auto-inject thinking hint into system instruction for tool-using models | `request.ts:396-434` |
| **Output Token Safety** | Auto-set `maxOutputTokens = 64000` when thinking budget is enabled | `request.ts:358-377` |
| **Stable Session ID** | Use `PLUGIN_SESSION_ID` across all requests for consistent signature caching | `request.ts:28` |

---

## Fixes from `improve-tools-call-sanitizer` Branch

| Fix | Problem | Solution | Location |
|-----|---------|----------|----------|
| **Thinking Block Sanitization** | Claude API rejects `cache_control` and `providerOptions` inside thinking blocks | `sanitizeThinkingPart()` extracts only allowed fields (`type`, `thinking`, `signature`, `thought`, `text`, `thoughtSignature`) | `request-helpers.ts:179-215` |
| **Deep Cache Control Strip** | SDK may nest `cache_control` in wrapped objects | `stripCacheControlRecursively()` removes at any depth | `request-helpers.ts:162-173` |
| **Trailing Thinking Preservation** | Signed trailing thinking blocks were being incorrectly removed | `removeTrailingThinkingBlocks()` now checks `hasValidSignature()` before removal | `request-helpers.ts:125-131` |
| **Signature Validation** | Need to identify valid signatures | `hasValidSignature()` checks for string ≥50 chars | `request-helpers.ts:137-140` |
| **Schema Sanitization** | Claude rejects `const`, `$ref`, `$defs`, `default`, `examples` | Allowlist-based `sanitizeSchema()` keeps only basic features | `request.ts:468-523` |
| **Empty Schema Fix** | Claude VALIDATED mode fails on `{type: "object"}` with no properties | Add placeholder `reason` property with `required: ["reason"]` | `request.ts:529-539` |
| **Const → Enum Conversion** | `const` not supported | Convert `const: "value"` to `enum: ["value"]` | `request.ts:489-491` |

---

## Key Components Reference

### `src/plugin.ts`
Entry point. Intercepts `fetch()` for `generativelanguage.googleapis.com` requests. Manages account pool, token refresh, rate limits, and endpoint fallbacks.

### `src/plugin/request.ts`
- `prepareAntigravityRequest()` - Transforms OpenAI-style → Antigravity wrapped format
- `transformAntigravityResponse()` - Processes SSE stream, caches signatures, transforms thinking parts
- `createStreamingTransformer()` - Real-time line-by-line SSE processing

### `src/plugin/request-helpers.ts`
- `filterUnsignedThinkingBlocks()` - Filters/sanitizes thinking blocks in `contents[]`
- `filterMessagesThinkingBlocks()` - Same for Anthropic-style `messages[]`
- `sanitizeThinkingPart()` - Normalizes thinking block structure
- `hasValidSignature()` - Validates signature presence and length
- `transformThinkingParts()` - Converts thinking → reasoning format for OpenCode

### `src/plugin/cache.ts`
- `cacheSignature()` - Store signature by session ID + text hash
- `getCachedSignature()` - Retrieve cached signature for restoration
- TTL: 1 hour, max 100 entries per session

---

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| `invalid thinking signature` | Signature lost in multi-turn | Restart `opencode` to reset signature cache |
| `Unknown field: cache_control` | SDK injected unsupported field | Plugin auto-strips; update plugin if persists |
| `400 INVALID_ARGUMENT` on tools | Unsupported schema feature | Plugin auto-sanitizes; check `ANTIGRAVITY_API_SPEC.md` |
| `Empty args object` error | Tool has no parameters | Plugin adds placeholder `reason` property |
| Thinking not visible | Thinking budget exhausted or output limit too low | Plugin auto-configures; check model config |

---

## Changelog

### `improve-tools-call-sanitizer` Branch

| Commit | Description |
|--------|-------------|
| `ae86e3a` | Enhanced `removeTrailingThinkingBlocks` to preserve blocks with valid signatures |
| `08f9da9` | Added thinking block sanitization (`sanitizeThinkingPart`, `stripCacheControlRecursively`, `hasValidSignature`) |

### `claude-improvements` Branch

| Commit | Description |
|--------|-------------|
| `314ac9d` | Added thinking signature caching for multi-turn stability |
| `5a28b41` | Initial Claude improvements with streaming, interleaved thinking, validated tools |

---

## See Also

- [ANTIGRAVITY_API_SPEC.md](./ANTIGRAVITY_API_SPEC.md) - Full Antigravity API reference
- [README.md](../README.md) - Plugin setup and usage
