# Aria Avatar Studio: Phased Custom Implementation Plan

**Project**: Aria Voice-First AI Companion — Avatar Studio  
**Target Environments**: Google Play Store (Android Expo App) & Next.js 14 Web Application  
**Architectural Approach**: Approach C — Hybrid Parametric Base Mesh + Modular Armature Attachments  
**Date**: October 2026  
**Document Version**: 1.0.0  

---

## 1. Executive Implementation Strategy

The objective of this plan is to deliver a customizable, mobile-first 3D Avatar Studio for Aria that integrates with the existing voice conversation pipeline, maintains per-user isolation, complies with commercial licensing requirements, and performs smoothly on mid-range Android devices.

### Core Development Principles
1. **Zero Disruption to Existing Voice Systems**: The working STT, TTS, LLM memory, and video fallback systems in `apps/web` and `apps/api` must remain fully operational at every step.
2. **Prototype Before Replacement**: Build the Avatar Studio in an isolated development sandbox (`/studio` route in `apps/web`) to validate real-time morph deformation, asset swapping, and persistence before touching production companion routes.
3. **Strict License Compliance**: Only CC0 1.0 Universal base meshes and original or verified permissive assets will be used. SadTalker remains strictly isolated.
4. **Mobile First**: All 3D assets, UI controls, and shaders are engineered against the mid-range Android budget ($\le 5.5$ MB GLB, $\le 22$k triangles, 1–2 draw calls).

---

## 2. Milestone Roadmap

```
+---------------------------------------------------------------------------------------+
|                         AVATAR STUDIO IMPLEMENTATION ROADMAP                          |
+---------------------------------------------------------------------------------------+
|  Milestone 0: Research & License Audit                 [ COMPLETED ]                  |
|  Milestone 1: 3D Data Contracts & Backend API          [ Complexity: Low    | Week 1 ]|
|  Milestone 2: Minimal Isolated Web Studio Prototype    [ Complexity: Medium | Week 2 ]|
|  Milestone 3: Real-Time Lip-Sync & Behavior Binding    [ Complexity: Medium | Week 3 ]|
|  Milestone 4: Mobile Viewport & Native Touch Studio    [ Complexity: High   | Week 4 ]|
|  Milestone 5: Asset Optimization & Draco/KTX2 Pipeline [ Complexity: Medium | Week 5 ]|
|  Milestone 6: Validation, Tests & Play Store Ready     [ Complexity: Low    | Week 6 ]|
+---------------------------------------------------------------------------------------+
```

---

## 3. Detailed Milestone Breakdown

### Milestone 1: 3D Data Contracts & Backend Persistence
* **Objective**: Upgrade the avatar configuration schema from 2D layers to the versioned `Avatar3DConfig` v2 schema with backward compatibility, database migration, and strict user isolation.
* **Tasks**:
  1. Define `Avatar3DConfig`, `FaceMorphParameters`, `MaterialParameters`, `ModularAssetSelection`, and `BodyParameters` in `packages/shared/src/index.ts`.
  2. Create migration utility in `packages/shared` to automatically migrate legacy 2D avatar configs (`version: 1`) to `Avatar3DConfig` (`version: 2`).
  3. Create Pydantic v2 schemas in `apps/api/src/app/schemas/avatar.py` validating parameter bounds ($0.0 \le \text{morph} \le 1.0$; valid hex color strings).
  4. Update `apps/api/src/app/api/v1/endpoints/avatar.py` to support `Avatar3DConfig` payload validation, ensuring only the authenticated user can read or modify their companions (`where(Avatar.user_id == current_user.id)`).
  5. Add unit and integration tests in `apps/api/tests/test_avatar.py` verifying authorization barriers, schema validation, and config updates.
* **Acceptance Criteria**:
  * `pnpm --filter @ai-companion/shared build` succeeds with complete TypeScript type exports.
  * `pytest apps/api/tests/test_avatar.py` passes 100% with cross-user tampering protection verified.

---

### Milestone 2: Minimal Isolated Web Studio Prototype
* **Objective**: Create a dedicated, isolated Avatar Studio screen in `apps/web/src/app/studio/page.tsx` that allows interactive customization of a 3D companion using the CC0 base mesh.
* **Component Architecture**:
  ```
  apps/web/src/components/studio/
  ├── AvatarStudioContainer.tsx     # Main studio layout & state machine
  ├── AvatarStudioViewport.tsx      # R3F Canvas with 360 orbit & camera framing
  ├── AvatarParametricModel.tsx     # Three.js SkinnedMesh applying morphs in real-time
  ├── controls/
  │   ├── CategoryNavigation.tsx    # Tabs: Face, Hair, Body, Clothing, Behavior
  │   ├── FaceShapeControls.tsx     # Sliders: Jaw, Chin, Cheekbones, Nose, Mouth
  │   ├── ColorPalettePicker.tsx    # Presets & Hex picker for Skin, Eyes, Hair
  │   ├── HairAssetSelector.tsx     # 3 Swappable Hairstyles
  │   ├── WardrobeSelector.tsx      # 3 Swappable Outfits + Color Tints
  │   └── StudioActionToolbar.tsx   # Save, Cancel, Randomize, Undo, Redo
  └── hooks/
      └── useAvatarStudioState.ts   # Immutable state history for Undo/Redo
  ```
* **Prototype Specifications**:
  * **Base Model**: 1 legally verified CC0 humanoid mesh (`aria_photorealistic.glb` base topology).
  * **Facial Controls**:
    * Jaw Width, Chin Length, Cheekbone Height.
    * Eye Spacing, Eye Size, Iris Color tinting.
    * Nose Length, Nose Bridge Width.
    * Lip Fullness (Upper & Lower).
    * Skin Tone (PBR material tint with 6 skin tone presets + custom hex).
  * **Hair Assets**:
    1. `ponytail01` (Long tied)
    2. `short02` (Short parted)
    3. `bob01` (Medium shoulder-length)
    * Hair color tinting via PBR albedo uniform.
  * **Clothing Assets**:
    1. `female_elegantsuit01` (Formal suit)
    2. `casual_tshirt_jeans` (Casual)
    3. `smart_blazer` (Business casual)
  * **State Flow**:
    * Loads currently active companion config from `GET /api/v1/avatars/active`.
    * Allows user to tweak sliders with instant visual feedback.
    * Saves configuration to `PATCH /api/v1/avatars/{id}` upon clicking Save.
* **Acceptance Criteria**:
  * The studio renders in browser at 60 FPS without frame drops.
  * Every slider genuinely deforms the 3D geometry in real-time (no label-only mockups).
  * Saved configurations reload accurately after page refresh.

---

### Milestone 3: Real-Time Lip-Sync & Behavior Integration
* **Objective**: Connect the customized companion model to live audio playback, speech-driven lip synchronization, natural blinking, and emotion blending.
* **Tasks**:
  1. Refactor `FullBodyAvatarModel.tsx` to accept an `Avatar3DConfig` prop, dynamically applying the user's custom morphs, skin tone, hair model, and clothing alongside animation tracks.
  2. Bind the 15 Oculus visemes and 52 ARKit blendshapes additively so speech visemes modulate the mouth while the custom jaw/chin morph targets maintain the character's unique facial structure.
  3. Integrate the natural blinking Poisson generator (140ms jittered blinks) and subtle spine breathing motion (0.015 rad oscillation).
  4. Test live speech synthesis playback with EdgeTTS and offline Piper TTS, verifying immediate voice playback even if an individual morph target fails to load.
* **Acceptance Criteria**:
  * The customized character accurately speaks arbitrary AI-generated responses with synchronized mouth movements.
  * Interruption handling immediately halts audio and resets mouth morphs to neutral within 50ms.

---

### Milestone 4: Mobile Viewport & Native Touch Studio in Expo
* **Objective**: Port the 3D customization viewport to `apps/mobile` using `expo-gl` and `@react-three/fiber` with mobile-optimized touch controls.
* **Tasks**:
  1. Install mobile 3D dependencies in `apps/mobile/package.json`:
     * `expo-gl`, `three`, `@react-three/fiber`, `@react-three/drei`.
  2. Implement `apps/mobile/src/components/3d/MobileAvatarViewport.tsx` with pinch-to-zoom, one-finger orbit rotation, and double-tap focus.
  3. Build mobile-first touch UI using NativeWind and React Native Reanimated:
     * Collapsible bottom sheet for customization categories.
     * Horizontal thumbnail scrollbars for hairstyle and clothing selection.
     * Accessible touch targets ($\ge 44 \times 44\text{ pt}$) for all sliders and color swatches.
  4. Connect mobile state to backend API with offline caching via local SQLite / MMKV storage.
* **Acceptance Criteria**:
  * 3D companion renders natively inside the Android Expo app without requiring an external browser.
  * Memory consumption on Android remains $\le 85$ MB VRAM with no WebGL context crashes.

---

### Milestone 5: 3D Asset Optimization & Draco/KTX2 Pipeline
* **Objective**: Compress and package production 3D assets to meet the mid-range Android budget ($\le 5.5$ MB download size).
* **Tasks**:
  1. Retopologize the CC0 base human mesh down to $\le 20,000$ triangles using Blender's Decimate and Quad Remesher tools.
  2. Prune redundant morph targets, retaining the 64 essential targets (52 ARKit blendshapes + 12 core facial proportions).
  3. Apply Draco geometry quantization (14-bit position, 10-bit normal, 12-bit UVs).
  4. Convert all textures to KTX2 / Basis Universal with ASTC hardware decompression.
  5. Assemble modular clothing and hair assets with matching bone weight armatures.
* **Acceptance Criteria**:
  * Mobile GLB package is $\le 4.8$ MB (an 84% reduction from the 31 MB desktop model).
  * Initial loading and parse time on mobile 4G LTE is $\le 1.5$ seconds.

---

### Milestone 6: Testing, Quality Assurance & Play Store Readiness
* **Objective**: Comprehensive test execution and commercial release readiness verification.
* **Tasks**:
  1. Execute unit and integration tests across web, mobile, and API:
     * `pytest apps/api/tests/` (100% passing).
     * `pnpm --filter @ai-companion/web test` (100% passing).
     * `pnpm --filter @ai-companion/mobile test` (100% passing).
  2. Validate boundary conditions:
     * Maximum and minimum slider values (0.0 and 1.0) without vertex tearing.
     * Missing or invalid asset IDs fallback gracefully to default base mesh.
     * Rapid clothing swaps do not leak GPU memory.
  3. Verify Google Play Developer Program compliance:
     * Add Open Source Licenses screen in mobile settings.
     * Ensure zero copyrighted third-party branding or logos exist in presets.
* **Acceptance Criteria**:
  * All test suites pass.
  * Zero license compliance warnings.
  * Android release APK builds cleanly via EAS / Android Studio.

---

## 4. Exact File Modification & Creation Inventory

```
PACKAGE / APP         FILE PATH                                                        ACTION
---------------------------------------------------------------------------------------------
packages/shared       src/index.ts                                                     MODIFY (Add Avatar3DConfig, schemas)
apps/api              src/app/models/user.py                                           MODIFY (Update Avatar docstring & version)
apps/api              src/app/schemas/avatar.py                                        CREATE (Pydantic v2 3D config validator)
apps/api              src/app/api/v1/endpoints/avatar.py                               MODIFY (Handle 3D config persistence)
apps/api              tests/test_avatar.py                                             CREATE (User isolation & schema tests)
apps/web              src/app/studio/page.tsx                                          CREATE (Web Avatar Studio route)
apps/web              src/components/studio/AvatarStudioContainer.tsx                  CREATE (Studio layout & state machine)
apps/web              src/components/studio/AvatarStudioViewport.tsx                   CREATE (R3F 3D Orbit Viewport)
apps/web              src/components/studio/AvatarParametricModel.tsx                  CREATE (Morph target & material binder)
apps/web              src/components/studio/controls/FaceShapeControls.tsx             CREATE (Facial morph sliders)
apps/web              src/components/studio/controls/ColorPalettePicker.tsx            CREATE (Skin & Eye color palette)
apps/web              src/components/studio/controls/HairAssetSelector.tsx             CREATE (3 Hairstyle options)
apps/web              src/components/studio/controls/WardrobeSelector.tsx              CREATE (3 Clothing options)
apps/web              src/components/companion/3d/FullBodyAvatarModel.tsx              MODIFY (Support Avatar3DConfig prop)
apps/mobile           package.json                                                     MODIFY (Add expo-gl, three, @react-three/fiber)
apps/mobile           src/components/3d/MobileAvatarViewport.tsx                       CREATE (Expo-GL native 3D renderer)
apps/mobile           app/(tabs)/companion.tsx                                         MODIFY (Embed 3D companion viewport)
```

---

## 5. Risk Assessment & Mitigation Strategies

| Risk | Likelihood | Impact | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **Android WebGL Context Loss on Low-End Phones** | Medium | High | Implement automatic context restoration listeners in `MobileAvatarViewport.tsx`; fallback smoothly to high-fidelity 2.5D portrait if GPU fails 3 times. |
| **Texture Stretching on Extreme Body Morphs** | Low | Medium | Clamp morph target slider ranges to anatomically natural bounds (e.g., height 0.85× to 1.15×; jaw width $\pm 30\%$). |
| **Asset Download Latency on Mobile Cellular** | Medium | Medium | Bundle base character and initial 3 hairstyles/outfits directly into the APK; load additional wardrobe on demand with local filesystem caching. |
| **Copyleft License Contamination** | Low | Critical | Base mesh uses CC0 1.0 Universal. SadTalker remains strictly isolated. No GPL code incorporated into application packages. |

---

## 6. Definition of Done for Minimal Isolated Prototype

Before updating the production voice interface, the **Minimal Isolated Prototype** must satisfy:
1. **Base Model**: 1 legally verified CC0 base character (`aria_photorealistic.glb` topology).
2. **Morph Controls**: Real-time sliders for Jaw Width, Chin Length, Eye Size, and Lip Fullness.
3. **PBR Skin Tone**: Color palette selecting 6 realistic skin tones, modifying the 3D material dynamically.
4. **Hairstyles**: At least 3 selectable hairstyles with color customization.
5. **Clothing**: At least 3 selectable outfits with color customization.
6. **Backend Persistence**: Full Save and Load cycle through authenticated FastAPI `/api/v1/avatars` endpoints.
7. **Live Lip-Sync Preview**: Audio playback triggers synchronized mouth movement and natural blinking on the customized character.
8. **Performance**: $\ge 50$ FPS on modern browsers; zero memory leaks after 20 asset swaps.
