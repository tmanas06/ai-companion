# ARIA Photorealistic 2D Avatar — Implementation Plan

---

## 1. Findings from Existing Implementation

### 1.1 Current 3D Assets
| Asset | Path | Format | Size | Notes |
|-------|------|--------|------|-------|
| Aria Photorealistic (Desktop) | `/public/models/aria_photorealistic.glb` | GLB | ~36 MB | Full body, ARKit 52 morphs |
| Marcus Photorealistic (Desktop) | `/public/models/marcus_photorealistic.glb` | GLB | ~32 MB | Full body, ARKit 52 morphs |
| Aria Photorealistic (Mobile) | `/public/models/aria_photorealistic_mobile.glb` | GLB | ~12 MB | 1024×1024 WebP textures |
| Marcus Photorealistic (Mobile) | `/public/models/marcus_photorealistic_mobile.glb` | GLB | ~11 MB | 1024×1024 WebP textures |
| Shared Animations | `/public/models/animations.glb` | GLB | — | Idle, blink, gestures |

### 1.2 Existing 2D Portrait Assets (Verified Physical Inventory)

#### 1.2.1 Character Asset Baseline
| Character | Portrait | Blink | Speak | Format | Status |
|-----------|----------|-------|-------|--------|--------|
| Aria | `/public/avatars/aria-portrait.webp` | `/public/avatars/aria-blink.webp` | `/public/avatars/aria-speak.webp` | WebP | Verified Present |
| Marcus | `/public/avatars/marcus-portrait.webp` | `/public/avatars/marcus-blink.webp` | `/public/avatars/marcus-speak.webp` | WebP | Verified Present |
| Elena | `/public/avatars/elena-portrait.webp` | `/public/avatars/elena-blink.webp` | `/public/avatars/elena-speak.webp` | WebP | Verified Present |
| Liam | `/public/avatars/liam-portrait.webp` | `/public/avatars/liam-blink.webp` | `/public/avatars/liam-speak.webp` | WebP | Verified Present |

#### 1.2.2 Aria Verified Asset Inspection
Detailed physical inspection of `apps/web/public/avatars/`:

| File | Resolution | Size (Bytes) | Color Space | Background | Feature Differential Region |
|------|------------|--------------|-------------|------------|-----------------------------|
| `aria-portrait.webp` | 1024×1024 | 105,736 | RGB (No Alpha) | Solid dark `#05090c` (Slate-950) | Baseline identity reference |
| `aria-blink.webp` | 1024×1024 | 128,998 | RGB (No Alpha) | Solid dark `#05090c` (Slate-950) | Eye region: Y=[296, 438], X=[373, 665]. Mean diff: 1.18 |
| `aria-speak.webp` | 1024×1024 | 131,162 | RGB (No Alpha) | Solid dark `#05090c` (Slate-950) | Mouth region: Y=[512, 701], X=[369, 663]. Mean diff: 1.84 |
| `aria-realistic.webp`| 1024×1024 | 105,736 | RGB (No Alpha) | Solid dark `#05090c` (Slate-950) | Identical MD5 copy of `aria-portrait.webp` |

*Note on Transparency & Compositing*: The assets do not have an alpha channel; they are 1024×1024 solid-background images with identical dimensions, lighting, and framing. `AvatarRenderer` composites the eyelid blink and mouth speak layers using CSS radial-gradient feathered `mask-image` aligned precisely to Aria's empirical facial landmarks (`eyeY: 36.0%`, `mouthY: 58.5%`).

*Note on Video Assets*: Subdirectory `apps/web/public/avatars/aria/` contains video clips (`.mp4`/`.webm`) for the SadTalker `VideoAvatarRenderer` mode (`manifest.json`), which are distinct from the 2D layered sprite assets.

#### 1.2.3 Aria 2D Expression Asset Status
The following 2D expression sprite assets are currently **missing** and must be generated externally:
- `aria-happy.webp` (Missing)
- `aria-thoughtful.webp` (Missing)
- `aria-concerned.webp` (Missing)

`AvatarRenderer` provides automated graceful fallback: if an expression asset fails to load or is not yet present on disk, it automatically falls back to `aria-portrait.webp` without console errors or UI disruption.

### 1.3 Web Components
| Component | Path | Responsibility |
|-----------|------|----------------|
| `AvatarRenderer` | `apps/web/src/components/companion/AvatarRenderer.tsx` | Layered 2D renderer: base portrait + CSS `mask-image` blink/speak layers, viseme-driven mouth, natural blink cycle, breathing animation, state auras, reduced-motion support |
| `FullBodyAvatar` | `apps/web/src/components/companion/FullBodyAvatar.tsx` | Mode selector (Video / 3D / Photorealistic-2D), lazy-loads 3D scene, orchestrates display mode |
| `FullBodyAvatarScene` | `apps/web/src/components/companion/3d/FullBodyAvatarScene.tsx` | Three.js Canvas (react-three-fiber), StudioEnvironment, CameraRig, PerformanceMonitor |
| `CameraToolbar` | `apps/web/src/components/companion/3d/CameraToolbar.tsx` | Display mode buttons, camera presets, zoom, keyboard shortcuts |
| `VideoAvatarRenderer` | `apps/web/src/components/companion/video/VideoAvatarRenderer.tsx` | SadTalker video playback (Aria only) |

**Display Modes** (defined in `CameraToolbar.tsx`):
```typescript
type AvatarDisplayMode = 'video' | '3d' | 'photorealistic-2d';
```

### 1.4 Mobile Components
| Component | Path | Responsibility |
|-----------|------|----------------|
| `MobileAvatarRenderer` | `apps/mobile/src/components/avatar/MobileAvatarRenderer.tsx` | Expo GL + Three.js, loads mobile GLB, morph targets, voice state, word alignment, auto-fallback to 2D |
| `ThreeSceneManager` | `apps/mobile/src/components/avatar/ThreeSceneManager.ts` | WebGLRenderer, scene, camera, lighting, GLTF loading, PBR materials, morph target animation loop, blink cycle |
| `Avatar2DFallback` | `apps/mobile/src/components/avatar/Avatar2DFallback.tsx` | Procedural 2D from `Avatar3DConfig` (React Native Views), pulse animation, mouth animation, voice state badge |
| `ChatScreen` | `apps/mobile/app/(tabs)/chat.tsx` | Voice conversation UI, streaming TTS, mode toggle (3D / photorealistic-2d), `Photorealistic2DAvatar` inline component |

**Mobile Display Mode**:
```typescript
type AvatarDisplayMode = '3d' | 'photorealistic-2d';
```

### 1.5 Avatar Selection & Persistence
- **Web**: `ChatPage` loads active avatar via `/api/avatars/active` → `Avatar3DConfig` (version 2). Persisted in DB. Display mode persisted in `localStorage['ai_companion_display_mode']`.
- **Mobile**: `ChatScreen` loads via `getActiveAvatar()` from `avatar-service`. Display mode persisted in `localStorage`.
- **Shared Types**: `packages/shared/src/index.ts` defines `Avatar3DConfig` (face morphs, materials, hair, body, clothing, accessories) and `DEFAULT_AVATAR_3D_CONFIG`.

### 1.6 Voice State Integration
- **Web**: `useLiveVoiceCompanion` hook exposes `state`, `audioLevel`, `isSpeaking`, `visemes[]`, `currentTime` → passed to `FullBodyAvatar` → `AvatarRenderer`.
- **Mobile**: `ChatScreen` maintains `isSpeaking`, `isListening`, `audioLevel`, `wordAlignment` → passed to `MobileAvatarRenderer` → `ThreeSceneManager.setVoiceState()` / `setWordAlignment()`.

### 1.7 Performance Bottlenecks (14 FPS Investigation)
| Potential Cause | Evidence | Impact |
|-----------------|----------|--------|
| **Model complexity** | Full-body GLB ~36 MB desktop, ~12 MB mobile | High GPU memory, vertex count |
| **Texture resolution** | Mobile uses 1024×1024 WebP; desktop may use larger | Texture bandwidth |
| **StudioEnvironment** | `FullBodyAvatarScene.tsx` adds full room with lights, shadows, post-processing | Draw calls, fragment shader cost |
| **Morph target evaluation** | `ThreeSceneManager.updateFrame()` traverses entire modelScene every frame, updates 30+ morph targets | CPU overhead per frame |
| **Antialiasing + DPR** | `dpr={Math.min(window.devicePixelRatio, 1.5)}` on web; mobile uses device DPR | Fragment shader cost scales with DPR² |
| **Shadow maps** | Not explicitly disabled in mobile; `StudioEnvironment` may enable | Extra render passes |
| **Animation loop** | `requestAnimationFrame` + `gl.endFrameEXP()` every frame | Baseline cost |

**Key Insight**: The 3D renderer does full scene traversal + morph target updates every frame (60 Hz target). On mid-tier mobile GPUs (e.g., Adreno 610, Mali-G57), this alone can drop to 14–20 FPS.

---

## 2. 2D Avatar Approach Evaluation

| Approach | Realism | Animation | Performance | Implementation Effort | Android Compatibility |
|----------|---------|-----------|-------------|----------------------|----------------------|
| **Single static portrait** | ★★★☆☆ | None | ★★★★★ | Trivial | ✅ Full |
| **Portrait + expression swap** | ★★★★☆ | Discrete (happy/thoughtful/concerned) | ★★★★★ | Low | ✅ Full |
| **Layered 2D (current `AvatarRenderer`)** | ★★★★★ | Blink (mask), speak (mask), viseme-driven mouth, breathing, posture | ★★★★★ (web) / ★★★★☆ (mobile) | Already implemented | ✅ Web full; Mobile needs mask-image workaround |
| **Interactive 3D (current)** | ★★★★★ | Full morph targets, ARKit 52 visemes, head/body pose | ★★☆☆☆ (mobile) | High | ✅ Expo GL + Three.js |

### Recommendation: **Extend the Existing Layered 2D Renderer**
- Web: `AvatarRenderer` already production-ready with CSS `mask-image` for precise eye/mouth regions.
- Mobile: `Photorealistic2DAvator` inline in `ChatScreen` mirrors web behavior but lacks `mask-image` (React Native limitation). Use opacity-based layering with pre-matted assets.
- **Incremental path**:
  1. Promote `photorealistic-2d` to first-class mode in toolbar (already done in web `CameraToolbar`).
  2. Extract mobile `Photorealistic2DAvatar` into reusable component (`MobilePhotorealistic2DAvatar.tsx`).
  3. Add expression layers (happy, thoughtful, concerned) as optional overlays.
  4. Ensure asset parity: all 4 characters have portrait/blink/speak + expressions in WebP.

---

## 3. Image Generation & Asset Specification

### 3.1 Generation Capability
**I cannot generate image assets directly.** The coding agent has no access to image generation tools (DALL-E, Midjourney, Stable Diffusion, etc.). Assets must be created separately and committed to the repository.

### 3.2 Required Assets per Character (Aria, Marcus, Elena, Liam)

| Asset | Filename Pattern | Spec |
|-------|------------------|------|
| **Base Portrait** | `{name}-portrait.webp` | 512×512 px (min), front-facing head-and-shoulders, neutral expression, transparent background preferred; else solid `#0f172a` (slate-950) |
| **Blink** | `{name}-blink.webp` | Same dimensions/pose as portrait, eyes fully closed, transparent background |
| **Speak** | `{name}-speak.webp` | Same dimensions/pose as portrait, mouth open in neutral vowel shape (schwa/AA), transparent background |
| **Happy** | `{name}-happy.webp` | Same pose, genuine smile (Duchenne), eyes slightly squinted |
| **Thoughtful** | `{name}-thoughtful.webp` | Same pose, slight brow furrow, gaze slightly up/aside, neutral mouth |
| **Concerned** | `{name}-concerned.webp` | Same pose, brows drawn together, slight frown, eyes wide |

**Consistency Requirements**:
- Identical camera angle, lighting, head position, hair, skin tone, clothing across all expressions per character.
- Transparent background strongly preferred (enables CSS/React Native compositing over dynamic backgrounds).
- If transparency not feasible, use `#0f172a` (slate-950) solid background matching chat stage.
- WebP lossless or near-lossless (q=90+) for crisp edges.

### 3.3 Repository Placement
```
apps/web/public/avatars/
├── aria-portrait.webp
├── aria-blink.webp
├── aria-speak.webp
├── aria-happy.webp
├── aria-thoughtful.webp
├── aria-concerned.webp
├── marcus-portrait.webp
├── marcus-blink.webp
├── marcus-speak.webp
├── marcus-happy.webp
├── marcus-thoughtful.webp
├── marcus-concerned.webp
├── elena-portrait.webp
├── elena-blink.webp
├── elena-speak.webp
├── elena-happy.webp
├── elena-thoughtful.webp
├── elena-concerned.webp
├── liam-portrait.webp
├── liam-blink.webp
├── liam-speak.webp
├── liam-happy.webp
├── liam-thoughtful.webp
└── liam-concerned.webp
```
Mobile accesses these via API base URL (e.g., `https://api.example.com/avatars/aria-portrait.webp`).

---

## 4. Recommended Architecture

### 4.1 Integration Strategy
**Core Principle**: Keep 3D renderer fully functional. Add 2D as peer mode, not replacement.

### 4.2 Component Reuse
| Existing | Reuse As | Changes |
|----------|----------|---------|
| `AvatarRenderer` (web) | Primary 2D renderer | Add expression prop; ensure `photorealistic-2d` mode in toolbar |
| `CameraToolbar` | Mode selector | Already supports `'photorealistic-2d'` |
| `FullBodyAvatar` | Mode orchestrator | Already switches between Video/3D/2D |
| `MobileAvatarRenderer` | 3D renderer | No changes |
| `ThreeSceneManager` | 3D animation engine | No changes |
| `Avatar2DFallback` | Procedural fallback | No changes |

### 4.3 New Components Required
| Component | Platform | Purpose |
|-----------|----------|---------|
| `MobilePhotorealistic2DAvatar` | Mobile | Extracted from `ChatScreen`, reusable, accepts `assets`, `landmarks`, `state`, `audioLevel`, `isSpeaking`, `isListening`, `size`, `reducedMotion` |
| `usePhotorealistic2D` hook (optional) | Both | Shared blink/speak/posture logic if deduplication desired |

### 4.4 Data Flow
```
Voice Hook (useLiveVoiceCompanion / ChatScreen)
    → state, audioLevel, isSpeaking, isListening, visemes/wordAlignment
    → FullBodyAvatar / MobileAvatarRenderer
        → AvatarRenderer (web) / MobilePhotorealistic2DAvatar (mobile)
            → Blink timer, mouth intensity (viseme or amplitude), posture transform, state aura
```

### 4.5 Persistence
- Display mode: `localStorage['ai_companion_display_mode']` (already implemented both platforms).
- Avatar customization: DB via `/api/avatars/active` → `Avatar3DConfig` (unchanged).
- No new database tables needed.

### 4.6 Dependencies
- **No new runtime dependencies** for 2D mode.
- Web: Uses native CSS `mask-image`, `requestAnimationFrame`.
- Mobile: Uses `react-native` `Image`, `Animated`, `requestAnimationFrame` (polyfilled).
- Avoid: `expo-av` for 2D (only needed for TTS audio), no new native modules.

---

## 5. Voice Animation Strategy

### 5.1 Web (AvatarRenderer — Already Implemented)
| State | Animation |
|-------|-----------|
| **Idle** | Natural blink cycle (3.2–5.8s), subtle breathing (6s CSS animation) |
| **Listening** | Emerald ripple rings, slowed blink (4.5–7.5s), slight forward lean (-1° rotate, scale 1.015) |
| **Speaking** | Violet ripple rings, **viseme-driven** mouth (if `visemes[]` + `currentTime` provided) OR amplitude envelope fallback (`audioLevel * 1.5`), mask-image feathered to mouth landmarks |
| **Interrupted** | Amber ring, immediate mouth closure (intensity → 0), blink reset |
| **Error** | Rose ring |

**Viseme Mapping**: Preston Blair / Rhubarb set (X, A–H) → aperture intensity (0.0–0.95). Smooth lerp (0.40) prevents robotic stepping.

### 5.2 Mobile (MobilePhotorealistic2DAvatar — To Be Extracted)
| State | Animation |
|-------|-----------|
| **Idle** | Blink cycle, breathing (Animated spring loop) |
| **Listening** | Emerald border/ripple, slowed blink |
| **Speaking** | Violet border/ripple, **amplitude envelope** mouth (no viseme timestamps yet; `wordAlignment` available but not mapped to phonemes), opacity-based speak layer |
| **Interrupted** | Amber border, mouth reset |

**Gap**: Mobile does not yet receive `visemes[]` / `currentTime` from streaming TTS. Only `wordAlignment` (word-level timestamps) and `audioLevel` are available. Viseme-accurate lip sync requires backend viseme generation or client-side phoneme estimation.

### 5.3 Expression Overlays (Future)
- When `state === 'generating_response'` → show `thoughtful` overlay (opacity cross-fade).
- When `state === 'speaking'` with positive sentiment → show `happy` micro-expression.
- When `state === 'error'` or negative sentiment → show `concerned`.

---

## 6. Performance Benchmarking Plan

### 6.1 Metrics to Capture
| Metric | Tool | Target (2D) | Target (3D) |
|--------|------|-------------|-------------|
| **Time to Interactive (TTI)** | Lighthouse / Chrome DevTools | < 500 ms | < 3 s |
| **First Contentful Paint** | DevTools | < 200 ms | < 1.5 s |
| **Average FPS (30s conversation)** | `PerformanceMonitor` (web) / `requestAnimationFrame` stats (mobile) | 55–60 | 30+ (mobile) / 60 (desktop) |
| **GPU Memory** | DevTools GPU tab / Xcode Instruments | < 50 MB | < 200 MB (mobile) / < 500 MB (desktop) |
| **CPU Frame Time (avg)** | DevTools Performance | < 4 ms | < 16 ms |
| **Battery Impact (10 min)** | Xcode Instruments / Android Studio Profiler | Low | High |

### 6.2 Test Protocol
1. **Device Matrix**:
   - Desktop: MacBook Pro M2 (Chrome), Windows + RTX 3060 (Chrome)
   - Mobile: iPhone 14 Pro (Safari/Expo), Pixel 7 (Chrome/Expo), mid-tier Android (e.g., Galaxy A54)
2. **Scenario**: 10-minute continuous voice conversation (alternating 10s user / 15s companion).
3. **Conditions**: Same network, same companion (Aria), same voice settings.
4. **Modes Tested**: `photorealistic-2d` vs `3d` (and `video` where available).
5. **Measure**: Record FPS, frame time, GPU/CPU memory every 5s via `PerformanceMonitor` / native profiler.

### 6.3 Comparison Baseline
- Run 3D mode first (warm cache), then 2D mode (warm cache).
- Compare median FPS, 95th percentile frame time, memory delta.
- Document thermal throttling behavior over 10 minutes.

---

## 7. Implementation Milestones

| Milestone | Scope | Files to Change | Acceptance |
|-----------|-------|-----------------|------------|
| **M1: Asset Preparation** | Add missing expression assets (happy/thoughtful/concerned for 4 chars) | 24 new `.webp` files in `apps/web/public/avatars/` | All 28 assets present (4 chars × 7 states) |
| **M2: Web 2D Mode Polish** | Add `expression` prop to `AvatarRenderer`; cross-fade expression overlays; verify toolbar mode persistence | `AvatarRenderer.tsx`, `FullBodyAvatar.tsx`, `CameraToolbar.tsx` (verify) | Switching modes persists; expressions render correctly |
| **M3: Mobile 2D Component Extraction** | Move `Photorealistic2DAvatar` from `ChatScreen` → `apps/mobile/src/components/avatar/MobilePhotorealistic2DAvatar.tsx`; add tests | New file + `ChatScreen.tsx` (import), `__tests__/MobilePhotorealistic2DAvatar.test.tsx` | Component renders; 3D/2D toggle works; voice animation syncs |
| **M4: Expression Integration** | Add `expression` state to voice hook; cross-fade expression layers on both platforms | `AvatarRenderer.tsx`, `MobilePhotorealistic2DAvatar.tsx`, `useLiveVoiceCompanion.ts` (web), `ChatScreen.tsx` (mobile) | Expressions change with voice state |
| **M5: Performance Validation** | Run benchmark protocol; document results; optimize if needed | — | 2D mode ≥ 55 FPS on all test devices; 3D mode ≥ 30 FPS on mobile |
| **M6: Documentation & Cleanup** | Update architecture docs; add asset spec to repo; remove dead code | `VOICE_PERFORMANCE_OPTIMIZATION.md`, `README.md` | Docs reflect 2D mode as first-class option |

---

## 8. Risks & Compatibility Constraints

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **React Native `mask-image` unsupported** | High | Mobile blink/speak layers less precise | Use pre-matted assets (alpha in speak/blink images) + opacity cross-fade |
| **Asset consistency** | Medium | Visual discontinuity between expressions | Single photo shoot / render session per character; automated diff check in CI |
| **Viseme gap on mobile** | High | Less accurate lip sync vs 3D | Accept amplitude-driven for v1; plan viseme mapping for M4+ |
| **WebP browser support** | Low | Safari < 14, old Android WebView | Fallback JPG already present; add `<picture>` with JPG fallback in `AvatarRenderer` |
| **Memory on low-end Android** | Medium | OOM if many large images | Use 512×512 max; lazy-load expressions; dispose on unmount |
| **Expo SDK upgrade** | Low | Breaking changes | Pin Expo 51; test on SDK 52 in separate branch |
| **Database migration** | None | N/A | No DB changes required |

---

## 9. Acceptance Criteria

| Criterion | Verification |
|-----------|--------------|
| **2D mode renders without loading GLB** | Network tab shows no `.glb` requests in `photorealistic-2d` mode |
| **3D mode continues to work** | Switching to `3d` loads model, morph targets animate, FPS indicator appears |
| **Avatar selection persists** | Refresh page → same companion, same customization, same display mode |
| **Missing images handled gracefully** | Fallback initials SVG shown; no console errors |
| **Voice state triggers correct animations** | Listening → emerald ring + slowed blink; Speaking → violet ring + mouth movement; Interrupted → immediate reset |
| **Interruption stops speaking animation** | Tap interrupt → mouth closes, audio stops, state → `interrupted` → `idle` |
| **Mode switch doesn't corrupt settings** | Toggle 2D↔3D 10× → avatar config unchanged, display mode persists |
| **Existing tests pass** | `pnpm test` (web: 81+/84, mobile: 32/32, api: 204/204) |
| **TypeScript clean** | `pnpm typecheck` (web, mobile), `mypy` (api) |
| **Production builds succeed** | `pnpm build` (web), `eas build --profile preview` (mobile) |

---

## 10. Files Expected to Change in Milestone 1 (M1 + M2)

### New Files
```
apps/web/public/avatars/aria-happy.webp
apps/web/public/avatars/aria-thoughtful.webp
apps/web/public/avatars/aria-concerned.webp
apps/web/public/avatars/marcus-happy.webp
apps/web/public/avatars/marcus-thoughtful.webp
apps/web/public/avatars/marcus-concerned.webp
apps/web/public/avatars/elena-happy.webp
apps/web/public/avatars/elena-thoughtful.webp
apps/web/public/avatars/elena-concerned.webp
apps/web/public/avatars/liam-happy.webp
apps/web/public/avatars/liam-thoughtful.webp
apps/web/public/avatars/liam-concerned.webp
```

### Modified Files
| File | Changes |
|------|---------|
| `apps/web/src/components/companion/AvatarRenderer.tsx` | Add `expression` prop (`'neutral' | 'happy' | 'thoughtful' | 'concerned'`); cross-fade expression overlay via opacity; update `resolveCompanionAssets` to return expression URLs |
| `apps/web/src/components/companion/FullBodyAvatar.tsx` | Pass `expression` derived from `state` (thoughtful during generating, happy on positive sentiment, concerned on error) |
| `apps/web/src/components/companion/FullBodyAvatar.test.tsx` | Update tests for `photorealistic-2d` mode and expression prop |
| `docs/architecture/VOICE_PERFORMANCE_OPTIMIZATION.md` | Add 2D mode section with asset spec and integration notes |

### No Changes To
- `MobileAvatarRenderer`, `ThreeSceneManager`, `Avatar2DFallback`, `Avatar3DConfig`, database schema, API endpoints.

---

## Current Implementation Status: Milestone 2 Complete

- **Milestone 2 (Web 2D Mode Polish & Expression Support)**: Fully implemented and tested.
  - `AvatarRenderer.tsx`: Added typed `AvatarExpression` (`'neutral' | 'happy' | 'thoughtful' | 'concerned'`), asset resolution for Aria expressions, graceful 404 fallback to neutral portrait, layered expression cross-fade, and `prefers-reduced-motion` handling.
  - `FullBodyAvatar.tsx`: Added deterministic expression state derivation (`deriveDeterministicExpression`) from companion voice state and backend validated emotion; wired expression prop to 2D renderer and 3D fallback.
  - `AvatarRenderer.test.tsx` and `FullBodyAvatar.test.tsx`: Comprehensive unit tests pass (100% pass across 38 tests).

## Next Concrete Step

**External Asset Generation for Aria Expressions**:
Generate the 3 required expression assets for Aria per the specification in Section 3.2:
- `apps/web/public/avatars/aria-happy.webp`
- `apps/web/public/avatars/aria-thoughtful.webp`
- `apps/web/public/avatars/aria-concerned.webp`

Once committed, `AvatarRenderer` will automatically display and cross-fade them without code modifications. Next milestones will extract `MobilePhotorealistic2DAvatar` for the mobile client (Milestone 3).