# ARIA Photorealistic 3D Rendering Upgrade — Implementation Plan

---

## Phase 1 — Inspection Findings

### 1.1 Model Structure (`aria_photorealistic.glb` — 32 MB)

| Metric | Value |
|--------|-------|
| **Meshes** | 8 (1 main skinned mesh "base" + 7 accessories) |
| **Render Vertices** | 142,416 |
| **Unique Vertices** | 27,653 |
| **Materials** | 8 (Human.body, female_elegantsuit01, eyebrow001, eyelashes01, low-poly, ponytail01, shoes01, teeth_base) |
| **Embedded Animations** | 5 (Idle, Laughing, Talking_0, Talking_1, Talking_2) |

### 1.2 Texture Inventory

| Texture | Resolution | Format | Usage |
|---------|------------|--------|-------|
| `young_lightskinned_female_diffuse4` | 2048×2048 | PNG | Skin baseColor |
| `aria_skin_normal` | 2048×2048 | PNG | Skin normal |
| `aria_skin_roughness` | 2048×2048 | PNG | Skin metallicRoughness |
| `female_elegantsuit01_diffuse` | 2048×2048 | PNG | Suit baseColor |
| `female_elegantsuit01_normal` | 2048×2048 | PNG | Suit normal |
| `ponytail01_diffuse` | 2048×2048 | PNG | Hair baseColor |
| `brown_eye` | 1024×1024 | PNG | Eye baseColor |
| `shoes01_diffuse` / `shoes01_normal` | 1024×1024 | PNG | Shoes |
| `teeth` | 2048×2048 | PNG | Teeth baseColor |
| `eyebrow001` / `eyelashes01` | 512×512 | PNG | Brow/lash (MASK) |

**GPU Memory Estimate**: ~150 MB+ for full texture set (2048² textures dominate)

### 1.3 Morph Targets (from code inspection)

The model exposes **52+ ARKit-compatible morph targets** + **14 viseme targets**:

| Category | Targets |
|----------|---------|
| **Jaw/Chin** | `jawForward`, `$md-$ca-$fe-$yn` (chin length) |
| **Cheeks** | `cheekSquintLeft`, `cheekSquintRight`, `cheekPuff` |
| **Eyes** | `eyeWideLeft`, `eyeWideRight`, `eyeBlinkLeft`, `eyeBlinkRight` |
| **Nose** | `noseSneerLeft`, `noseSneerRight` |
| **Mouth** | `mouthRollUpper`, `mouthRollLower`, `mouthStretchLeft`, `mouthStretchRight`, `mouthSmileLeft`, `mouthSmileRight`, `mouthOpen`, `jawOpen` |
| **Visemes** | `viseme_aa`, `viseme_E`, `viseme_I`, `viseme_O`, `viseme_U`, `viseme_CH`, `viseme_DD`, `viseme_FF`, `viseme_kk`, `viseme_nn`, `viseme_PP`, `viseme_RR`, `viseme_S`, `viseme_sil` |

### 1.4 Animations

| Source | Animations |
|--------|------------|
| **Model GLB** | Idle, Laughing, Talking_0, Talking_1, Talking_2 |
| **animations.glb** | Angry, Crying, Idle, Laughing, Rumba, Talking_0/1/2, Terrified (9 clips, Draco-compressed) |

### 1.5 Current Renderer Configuration

| Setting | Value |
|---------|-------|
| **Renderer** | React Three Fiber (Three.js r164) |
| **Tone Mapping** | `ACESFilmicToneMapping`, exposure 1.02 |
| **DPR** | `Math.min(devicePixelRatio, 1.5)` |
| **Antialias** | Enabled |
| **Color Space** | Linear output (implicit) |
| **Shadows** | PCF, 2048² key light, ContactShadows |
| **Environment** | StudioEnvironment: 4 directional lights + hemisphere + point light + cyclorama mesh |

### 1.6 Mobile Renderer (`aria_photorealistic_mobile.glb` — 12 MB)

- Same mesh hierarchy, **1024×1024 textures** (vs 2048² desktop)
- Expo GL + Three.js, similar morph/animation system
- No StudioEnvironment (simplified lighting)

### 1.7 Visual Limitations (Root Cause Analysis)

| Limitation | Root Cause |
|------------|------------|
| **Waxy/plastic skin** | `MeshStandardMaterial` only; no subsurface scattering, clearcoat/shear too subtle |
| **Flat eye appearance** | Single `MeshStandardMaterial` per eye; no corneal refraction, iris depth, sclera wetness |
| **Harsh shadows** | Single 2048² directional key light; no area lights, no IBL fill |
| **No environment reflections** | StudioEnvironment uses mesh-based cyclorama, no HDRI/IBL |
| **Hair lacks realism** | Alpha-tested cards, single roughness value, no anisotropic specular |
| **Teeth lack translucency** | Opaque material, no enamel/dentin layering |
| **Clothing flat** | Single roughness (0.85), no fabric micro-detail |

---

## Phase 2 — Baseline Capture Protocol

### 2.1 Required Views (Identical Conditions)

| View | Camera | Lighting | Animation |
|------|--------|----------|-----------|
| **Portrait** | Face preset (0.65 dist) | StudioEnvironment | Idle + natural blink |
| **Three-Quarter** | Upper preset (1.25 dist) | StudioEnvironment | Idle + natural blink |
| **Full Body** | Full preset (2.30 dist) | StudioEnvironment | Idle + natural blink |

### 2.2 Measurements to Capture

| Metric | Tool |
|--------|------|
| Average FPS (30s) | `PerformanceMonitor` |
| Frame time (min/median/95th pct) | Chrome DevTools Performance |
| Load time (model + textures) | Network tab |
| GPU memory | Chrome DevTools GPU / `performance.memory` |
| Visual artifacts | Screenshots at 1920×1080 |

---

## Phase 3 — Selectable Experimental Renderer Architecture

### 3.1 Integration Strategy

```
FullBodyAvatar (mode selector)
├── mode: 'baseline' | 'enhanced'
├── FullBodyAvatarScene (unchanged baseline)
└── EnhancedAvatarScene (new experimental)
    ├── EnhancedStudioEnvironment (IBL + area lights)
    ├── EnhancedAvatarModel (PhysicalMaterial + SSS approximation)
    ├── EnhancedEyeModel (cornea + iris + sclera separation)
    └── PostProcessing (optional, per-effect)
```

**Key Principle**: Zero duplication of animation/morph/voice logic. Only rendering pipeline differs.

### 3.2 Files to Create/Modify

| File | Purpose |
|------|---------|
| `apps/web/src/components/companion/3d/EnhancedAvatarScene.tsx` | New experimental scene |
| `apps/web/src/components/companion/3d/EnhancedAvatarModel.tsx` | Material + mesh enhancements |
| `apps/web/src/components/companion/3d/EnhancedStudioEnvironment.tsx` | IBL + area lights |
| `apps/web/src/components/companion/3d/EnhancedEyeModel.tsx` | Multi-layer eye |
| `apps/web/src/components/companion/FullBodyAvatar.tsx` | Add `renderMode` prop, route to enhanced scene |
| `apps/web/src/app/(app)/chat/page.tsx` | Add mode toggle to UI |

---

## Phase 3 — Implementation Steps

### 3A. Skin — Physical Material + SSS Approximation

**Approach**: `MeshPhysicalMaterial` with `sheen` (already used) + **separable SSS approximation** via screen-space or pre-baked thickness map.

```typescript
// Enhanced skin material
const skinMaterial = new THREE.MeshPhysicalMaterial({
  color: skinTone,
  roughness: 0.52,
  metalness: 0.0,
  normalMap: skinNormalTexture,
  normalScale: new THREE.Vector2(0.22, 0.22),
  roughnessMap: skinRoughnessTexture,
  // SSS approximation
  transmission: 0.15,           // Subsurface "glow"
  thickness: 0.4,               // Simulated skin thickness
  attenuationDistance: 0.8,     // Scatter falloff
  attenuationColor: new THREE.Color('#ffdbc8'), // Warm subsurface tint
  // Sheen for micro-fiber fuzz
  sheen: 0.35,
  sheenRoughness: 0.5,
  sheenColor: new THREE.Color('#ffdfd3'),
  // Clearcoat for oily T-zone
  clearcoat: 0.08,
  clearcoatRoughness: 0.3,
});
```

**Fallback if transmission unsupported**: Pre-bake thickness map into `thicknessTexture` and use custom shader chunk injection.

### 3B. Eyes — Multi-Layer Eye Model

**Required Geometry** (must exist in GLB):
- `low-poly` mesh (currently used for eyes) → split into **cornea**, **iris**, **sclera** via material slots or separate primitives.

**Materials**:

| Layer | Material | Key Properties |
|-------|----------|----------------|
| **Cornea** | `MeshPhysicalMaterial` | `transmission: 1.0`, `thickness: 0.01`, `ior: 1.376`, `roughness: 0.0`, `clearcoat: 1.0` |
| **Iris** | `MeshStandardMaterial` | `color: eyeColor`, `roughness: 0.08`, `normalMap: irisNormal` (parallax), `depthWrite: true` |
| **Sclera** | `MeshPhysicalMaterial` | `color: 0xf5f0e8`, `roughness: 0.35`, `sheen: 0.2`, `transmission: 0.05`, `thickness: 0.02` |

**Pupil Dilation**: Uniform `pupilSize` (0.0–1.0) driven by `audioLevel` + lighting.

### 3C. Lighting & Environment — IBL + Area Lights

**Environment Map**: Load `studio_hdri.hdr` (to be added) via `RGBELoader` → `PMREMGenerator`.

```typescript
// IBL Setup
const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();
const envMap = pmremGenerator.fromEquirectangular(hdrTexture).texture;
scene.environment = envMap;
scene.background = envMap; // or keep cyclorama color

// Area Lights (replace directional key/fill)
<RectAreaLight
  position={[2, 3.5, 2]}
  color="#fffaf0"
  intensity={8}
  width={1.8}
  height={2.4}
  lookAt={[0, 1.6, 0]}
/>
<RectAreaLight
  position={[-2.5, 2.5, 1.5]}
  color="#e2e8f0"
  intensity={4}
  width={2.2}
  height={3}
/>
<RimLight /> // Existing directional rim
```

**Shadows**: Key area light casts shadow (2048² PCF). Fill/rim no shadows.

### 3D. Hair & Clothing — Material Refinements Only

| Asset | Change |
|-------|--------|
| **Hair** | `roughness: 0.45`, `metalness: 0.02`, `clearcoat: 0.15`, `anisotropy: 0.3` (if tangent available), `sheen: 0.4` |
| **Suit** | `roughness: 0.82`, add `normalMap` (already present), `sheen: 0.15` for fabric fuzz |
| **Shoes** | `roughness: 0.55`, `metalness: 0.05` (leather) |
| **Teeth** | `MeshPhysicalMaterial`, `transmission: 0.3`, `thickness: 0.5`, `attenuationColor: 0xffeedd` |

### 3E. Post-Processing (Opt-In, Measured)

| Effect | Justification | Cost |
|--------|---------------|------|
| **TAA** | Temporal stability | ~2ms |
| **Subtle Bloom** | Corneal highlights | ~1ms |
| **Color Grading LUT** | Cinematic tone | ~0.5ms |
| **NO DoF / ChromAb / Film Grain** | Distracts in conversation | — |

**Implementation**: `EffectComposer` in `EnhancedAvatarScene`, toggleable via `reducedMotion` + quality setting.

---

## Phase 4 — Animation & Voice Preservation

**No changes to**:
- `calculateActiveViseme`, `mapVoiceStateToAnimation`
- Blink cycle, breathing spine, talking variants
- Voice state machine (`idle` → `listening` → `speaking` → `interrupted`)
- `reducedMotion` handling
- Cleanup on unmount/mode switch

**Optimization**: Cache `SkinnedMesh` references + morph target indices on mount (avoid per-frame `traverse`).

---

## Phase 5 — Performance Targets & Adaptive Quality

| Tier | DPR | Shadows | IBL | Post-FX | Target |
|------|-----|---------|-----|---------|--------|
| **Desktop High** | 1.5 | 2048² PCF | Full HDRI | TAA + Bloom | 60 FPS |
| **Desktop Low** | 1.0 | 1024² PCF | HDRI | None | 60 FPS |
| **Mobile** | 1.0 | ContactShadows only | None | None | 30 FPS |

**Detection**: `navigator.deviceMemory`, `navigator.hardwareConcurrency`, `renderer.info`.

---

## Phase 6 — Milestones

| Milestone | Scope | Files | Acceptance |
|-----------|-------|-------|------------|
| **M1: Baseline Capture** | Screenshots + metrics for 3 views (baseline) | — | Documented |
| **M2: Enhanced Scene Scaffold** | `EnhancedAvatarScene` + mode switch in `FullBodyAvatar` | 4 new files + 2 modified | Toggle works, baseline intact |
| **M3: Physical Materials** | Skin (PhysicalMaterial + SSS), Eyes (3-layer), Teeth | `EnhancedAvatarModel`, `EnhancedEyeModel` | Visual diff visible |
| **M4: IBL Lighting** | HDRI env map, RectAreaLights, remove directional key/fill | `EnhancedStudioEnvironment` | Soft shadows, eye catchlights |
| **M5: Hair/Cloth Refinements** | Anisotropy, sheen, fabric fuzz | `EnhancedAvatarModel` | Subtle improvement |
| **M6: Post-FX (Opt-In)** | TAA + Bloom behind quality flag | `EnhancedAvatarScene` | Measured < 2ms |
| **M7: Adaptive Quality** | Device tier detection, mobile fallback | `EnhancedAvatarScene` | 30 FPS mobile |
| **M8: Validation** | Before/after screenshots, metrics, test suite | — | All criteria met |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Transmission/SSS not supported on mobile WebGL2** | High | Enhanced mode broken on mobile | Detect `renderer.capabilities`; disable SSS on mobile |
| **HDRI load time > 3s** | Medium | Slow startup | Lazy-load; show baseline until ready |
| **RectAreaLight shadows expensive** | High | FPS drop | Limit to 1 shadow-casting area light |
| **Eye geometry not separable** | Medium | Can't do 3-layer eye | Fallback: enhanced single-material eye |
| **Texture memory > 256 MB** | Medium | OOM on low-end | Auto-downgrade to 1024² textures |
| **Breaking baseline renderer** | Low | Regression | Separate component tree; integration tests |

---

## Acceptance Criteria (Milestone Complete When)

- [ ] Baseline renderer unchanged, selectable alongside enhanced
- [ ] Enhanced mode renders same model, same animations, same voice sync
- [ ] 3 baseline views captured; 3 enhanced views captured (identical conditions)
- [ ] FPS/frame-time measured on desktop + mobile (documented)
- [ ] Visual improvements identified: skin, eyes, lighting, hair/cloth
- [ ] Remaining defects explicitly listed
- [ ] All tests pass: `pnpm test`, `pnpm typecheck`, `pnpm build`
- [ ] No new console errors/warnings

---

## Next Concrete Step

**Create `EnhancedAvatarScene.tsx` scaffold** with mode routing in `FullBodyAvatar.tsx`, then implement `EnhancedAvatarModel` with `MeshPhysicalMaterial` skin + SSS approximation. Measure baseline vs enhanced on desktop Chrome before proceeding to eyes/lighting.

---

*Generated: 2026-10-25*