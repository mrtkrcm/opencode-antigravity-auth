# CAW Stabilized Releases

This file tracks CAW-specific stabilized releases based on upstream versions.

## v1.2.6-caw.1 (2024-12-28)

**Base Version**: v1.2.6 (NoeFabris/opencode-antigravity-auth)  
**Status**: Stable, Production-Ready

### Cherry-Picked Improvements from v1.2.7-beta.1

#### Critical Fixes

1. **Claude Tool Hardening** (14f9067)
   - ✅ Tool pairing defense - prevents orphaned `tool_use` blocks
   - ✅ Context error recovery - detects `prompt_too_long` and `tool_pairing` errors
   - ✅ Session recovery improvements - handles missing `messageID` in error events
   - ✅ Cache key optimization - strips tier suffix (`-high`, `-low`, `-medium`)
   - ✅ Tool schema improvements - reduces token usage with `_placeholder` boolean
   - ✅ Parameter signature injection - configurable via `claude_tool_hardening`
   - ✅ Comprehensive test coverage - 149 new recovery tests, 192 request helper tests

2. **WebFetch Format Validation** (c9c2745)
   - ✅ Fixes format parameter validation issues with Claude models
   - ✅ Prevents validation errors in WebFetch tool calls

3. **Logger and Schema Processing** (a9bf3c2)
   - ✅ Improved logger function for better debugging
   - ✅ Enhanced JSON schema processing

### Excluded from Beta (Breaking Changes)

- ❌ **Quota Routing** (7c43511) - Model naming changes (`antigravity-` prefix)
- ❌ **Gemini Flash Consolidation** (16f4bb0) - Merges low/medium/high variants
- ❌ **Schema Restructuring** (16f4bb0) - Flattens nested signature_cache

### Why This Fork?

CAW maintains this stabilized fork to:
- ✅ Get critical bug fixes immediately
- ✅ Avoid breaking changes until stable release
- ✅ Maintain backward compatibility with existing configs
- ✅ Ensure production stability

### Upgrade from v1.2.6

No configuration changes required! This is a drop-in replacement:

```bash
cd plugins/opencode-antigravity-auth
git fetch origin
git checkout v1.2.6-caw.1
npm install
npm run build
```

### Testing

All tests passing:
- ✅ 202 tests passed (7 test files)
- ✅ Build successful
- ✅ No regressions from v1.2.6

### Upstream Tracking

- **Upstream**: NoeFabris/opencode-antigravity-auth
- **Base**: v1.2.6 (stable)
- **Beta commits**: 14f9067, c9c2745, a9bf3c2
- **Next**: Will evaluate v1.2.7 stable when released

### Known Issues

None specific to this release. See upstream for general issues:
- Issue #39: Gemini-3 schema errors (assigned to v1.2.7 milestone)

### Migration to v1.2.7 (Future)

When upstream v1.2.7 stable is released, we will:
1. Review final changes
2. Test migration path
3. Decide: merge or continue fork
4. Provide migration guide if needed

---

## Version History

| Version | Date | Base | Status | Notes |
|---------|------|------|--------|-------|
| v1.2.6-caw.1 | 2024-12-28 | v1.2.6 | ✅ Stable | Initial stabilized release |

---

## Contributing

Found a bug? Have a suggestion?

1. Check if it's already fixed in upstream beta
2. Open an issue in CAW repo
3. We'll evaluate for inclusion in next CAW release

Want to contribute back to upstream?
- Submit PRs to NoeFabris/opencode-antigravity-auth
- We'll sync improvements in next release
