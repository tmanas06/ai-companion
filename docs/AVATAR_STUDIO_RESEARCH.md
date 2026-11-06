# Aria Avatar Studio: Comprehensive Research & Technical Feasibility Report

**Project**: Aria Voice-First AI Companion — Avatar Studio  
**Target Distribution**: Google Play Store (Commercial Mobile App) & Next.js Web Application  
**Target Device Tier**: Mid-range to High-end Android devices (Snapdragon 680 / 720G / Dimensity 700+, 4–6GB RAM)  
**Date**: October 2026  
**Document Version**: 1.0.0  

---

## Executive Summary

Aria is a voice-first AI companion application currently combining local/cloud LLMs (Ollama), real-time speech recognition (Faster-Whisper), streaming text-to-speech (EdgeTTS / offline neural TTS), and a dual-rendering companion interface:
1. A **video-based photorealistic companion** (`VideoAvatarRenderer.tsx`) for high-fidelity pre-rendered clips.
2. An interactive **3D humanoid companion** (`FullBodyAvatarModel.tsx`) built with React Three Fiber (`@react-three/fiber`) and Three.js (`three`), featuring 52 Apple ARKit blendshapes, 15 Oculus/CMU visemes, and skeletal gesture mixing.
3. An isolated **offline SadTalker neural video-generation pipeline** for generating portrait video responses.

The objective of **Aria Avatar Studio** is to design and build an original, customizable 3D avatar creator inspired by the intuitive flexibility of Snapchat's Bitmoji 3D avatar customization, modern 3D character creators, and realistic digital humans. Users will customize their companion's face (jaw, chin, cheekbones, eyes, nose, mouth, ears, skin details), hair, body, clothing, and behavioral animations.

This document presents the technical audit of the current codebase, a rigorous investigation of reference avatar creators, an evaluation of character technologies, and an architectural blueprint for delivering this experience across mobile (Android Expo/React Native) and web.

---

## Phase 1: Audit of the Existing Repository

### 1.1 Repository Architecture Overview

The repository is structured as a Turborepo monorepo:
* **`apps/web`**: Next.js 14 (App Router), React 18, React Three Fiber (`@react-three/fiber` v8.18), Drei (`@react-three/drei` v9.122), Three.js (`three` v0.174), Tailwind CSS.
* **`apps/mobile`**: Expo SDK 51, React Native 0.74.5, NativeWind (Tailwind CSS v3.4), React Native Reanimated v3.16, Expo Router v3.5. (Currently lacks a native 3D rendering pipeline).
* **`apps/api`**: FastAPI, SQLModel (SQLAlchemy 2.0 ORM), PostgreSQL (via AsyncPG / PGBouncer), Alembic migrations, PyTorch / SadTalker execution environment.
* **`packages/shared`**: TypeScript shared domain types, authentication contracts, avatar configuration interfaces, and chat streaming schemas.

```
                           +-------------------------------------+
                           |            USER INTERFACES          |
                           +------------------+------------------+
                                              |
                     +------------------------+------------------------+
                     |                                                 |
                     v                                                 v
           +--------------------+                            +--------------------+
           |     apps/web       |                            |    apps/mobile     |
           |  (Next.js 14 R3F)  |                            | (Expo 51 / RN 0.74)|
           +---------+----------+                            +---------+----------+
                     |                                                 |
                     |         +-----------------------------+         |
                     +-------->|       packages/shared       |<--------+
                               | (Avatar3DConfig, Contracts) |
                               +--------------+--------------+
                                              |
                                              v
                               +-----------------------------+
                               |          apps/api           |
                               |    (FastAPI + PostgreSQL)   |
                               +--------------+--------------+
                                              |
                     +------------------------+------------------------+
                     |                                                 |
                     v                                                 v
           +--------------------+                            +--------------------+
           |  Avatar Persistence|                            | Voice & Speech API |
           |  (/api/v1/avatars) |                            |  (STT, TTS, Viseme)|
           +--------------------+                            +--------------------+
```

---

### 1.2 Inspection of Existing Avatar Assets and 3D Models

An inspection of `apps/web/public/models/` reveals the existing 3D assets:

| File | Size | Mesh Topology & Provenance | Morph Target Capabilities |
| :--- | :--- | :--- | :--- |
| `aria_photorealistic.glb` | **31 MB** | MakeHuman / MPFB2 Community Topology (`base`, `teeth_base`, `eyebrow001`, `eyelashes01`, `ponytail01`, `female_elegantsuit01`, `shoes01`) | **102 morph targets**: 52 ARKit blendshapes (`eyeBlinkLeft`, `mouthSmileLeft`, `jawOpen`), 15 Oculus visemes (`viseme_aa`, `viseme_PP`, etc.), 22 CMU speech phonemes (`aa_02`, `p_b_m_21`), and MakeHuman macro demographic targets (`$md-$as-$fe-$yn`, `$md-$ca-$fe-$yn`, `$md-universal-$fe-$yn-$av$mu-$av$wg`). |
| `marcus_photorealistic.glb` | **35 MB** | MakeHuman / MPFB2 Male Topology (`base`, `teeth_base`, `eyebrow001`, `short02`, `male_casualsuit01`, `shoes01`) | Matching 102 morph targets identical to `aria_photorealistic.glb`. |
| `avatar.glb` | **3.9 MB** | Wolf3D / Ready Player Me Legacy Avatar (`Wolf3D_Head`, `Wolf3D_Teeth`, `Wolf3D_Hair`, `Wolf3D_Glasses`, `Wolf3D_Body`, `Wolf3D_Outfit_Top`, `Wolf3D_Outfit_Bottom`, `Wolf3D_Outfit_Footwear`) | **72 morph targets** on head and teeth: Oculus 15 visemes, basic ARKit blendshapes. |
| `animations.glb` | **8.0 MB** | Mixamo Armature Compatible Clips (`Idle`, `Talking_1`, `Talking_2`, `Laughing`, `Listening`) | Full skeletal animation tracks targeting standard humanoid bones (`Hips`, `Spine`, `Head`, `LeftArm`, `RightArm`, etc.). |

#### Key Technical Finding:
The existing `aria_photorealistic.glb` model **already contains the exact parametric morph targets needed for facial customization and lip-sync**:
1. Demographic & shape targets: Macro morphs adjusting ethnicity, youth, muscle, weight.
2. Speech phonemes & visemes: Full Oculus + CMU viseme set.
3. Apple ARKit 52 blendshapes: Complete expressive set for eyes, brows, cheeks, jaw, and lips.

However, at **31–35 MB per model**, these meshes are heavily unoptimized for mobile distribution. They contain uncompressed 4K textures, unquantized vertex attributes, and high polygon counts (~80,000 to 120,000 triangles). A mid-range Android phone downloading a 35MB GLB over mobile data will experience significant latency and potential WebGL context loss due to VRAM exhaustion.

---

### 1.3 Existing 3D Rendering & State Machine (`FullBodyAvatarModel.tsx`)

The existing 3D avatar implementation in `apps/web/src/components/companion/3d/FullBodyAvatarModel.tsx` provides high architectural maturity:
1. **Dynamic Animation Mixing**: Uses `THREE.AnimationMixer` with cross-fading (`fadeIn`/`fadeOut`) between states (`idle`, `listening`, `speaking`, `interrupted`).
2. **Exponential Viseme Smoothing**: Lerps viseme morph target intensities at 60 FPS (`currentVisemeIntensityRef.current += (naturalIntensity - currentVisemeIntensityRef.current) * 0.4`), clamping jaw opening to natural human limits (0.52 max) to prevent unnatural facial distortion.
3. **Organic Blinking Engine**: Employs an asynchronous Poisson-jittered blink timer (triggering every 3.5 to 6.2 seconds, holding for 140ms) smoothly driving `eyeBlinkLeft` and `eyeBlinkRight`.
4. **Emotional Modulation**: Blends `mouthSmileLeft` and `mouthSmileRight` based on voice state (`listening` = 0.28 warm smile; `speaking` = 0.12 subtle smile; `neutral` = 0.18).
5. **GPU Memory Lifecycle**: Thoroughly disposes geometries, textures, and materials upon unmount or model swapping, preventing WebGL memory leaks.

---

### 1.4 Live Voice Pipeline & Lip-Sync Hook (`useLiveVoiceCompanion.ts`)

The speech and audio pipeline functions as follows:
* **User Input**: Captured via browser Web Speech API or microphone audio stream sent to `/api/v1/voice/stt` (Faster-Whisper).
* **LLM Reasoning**: Streams assistant responses from FastAPI via `/api/v1/conversations/{id}/messages` backed by local Ollama.
* **Audio Synthesis**: Backend generates TTS audio (EdgeTTS / Piper TTS) streamed back via `/api/v1/voice/tts`.
* **Lip-Sync Alignment**: `calculateActiveViseme` parses time-indexed viseme cues (`VisemeCue[]`) aligned with the audio timestamp (`currentTime`). If timestamps are unavailable, an audio-level RMS fallback drives organic mouth aperture.
* **Interruption Handling**: Instant cancellation stops audio playback immediately, resets the animation mixer to `idle`, and decays mouth morphs to neutral within 2 frames.

---

### 1.5 Backend Persistence & User Isolation (`apps/api`)

* **Database Model (`apps/api/src/app/models/user.py:256`)**:
  ```python
  class Avatar(SQLModel, table=True):
      __tablename__ = "avatars"
      id: UUID = Field(default_factory=uuid4, primary_key=True)
      user_id: UUID = Field(foreign_key="users.id", index=True)
      name: str = Field(max_length=100)
      config_version: int = Field(default=1)
      config: dict = Field(default_factory=dict, sa_column=Column(sa.JSON, nullable=False))
      preview_url: Optional[str] = Field(default=None)
      is_active: bool = Field(default=True)
  ```
* **Endpoints (`apps/api/src/app/api/v1/endpoints/avatar.py`)**:
  * `POST /api/v1/avatars`: Create avatar configuration.
  * `GET /api/v1/avatars`: List avatars for current authenticated user.
  * `GET /api/v1/avatars/active`: Retrieve user's currently selected companion avatar.
  * `PATCH /api/v1/avatars/{id}`: Update configuration with strict per-user ownership verification (`where(Avatar.user_id == current_user.id)`).
* **Current Limitation**: The current `AvatarConfig` in `packages/shared/src/index.ts` is a 2D layer schema (`{ layers: AvatarLayer[] }`). It needs to be upgraded to a versioned 3D Avatar Configuration Schema (`Avatar3DConfig`) while maintaining backward compatibility.

---

### 1.6 SadTalker Integration Status

* **Implementation**: Located in `apps/api/src/app/services/sadtalker_service.py` and `apps/api/src/app/api/v1/endpoints/sadtalker.py`.
* **Execution Characteristics**: On CPU (default developer environment), generating a 5-second video response takes **665 seconds (~11 minutes)**, representing an execution ratio of ~133× real-time.
* **Licensing**: Pretrained checkpoints (`checkpoints/SadTalker_V0.0.2_256.safetensors`, `mapping_00109-model.pth.tar`) are released under **CC-BY-NC 4.0** (Non-Commercial).
* **Architecture Decision**: SadTalker is **strictly non-commercial** and far too slow for interactive mobile voice sessions. It must remain an isolated offline research experiment and must not be included in the production Avatar Studio or Play Store release.

---

### 1.7 Reusability Assessment Matrix

| Subsystem | Existing Component | Verdict | Action Required |
| :--- | :--- | :--- | :--- |
| **3D Render Loop** | `FullBodyAvatarModel.tsx` | **REUSE & EXTEND** | Retain animation mixer, viseme decay, and blinking loop; add parametric morph controls and modular mesh attachment hooks. |
| **Voice State Machine** | `useLiveVoiceCompanion.ts` | **REUSE** | Retain entire STT -> LLM -> TTS -> Audio -> Viseme pipeline intact. |
| **Audio Lip-Sync** | `animation-mappings.ts` | **REUSE** | Retain Oculus 15 viseme interpolation and ARKit blendshape mapping. |
| **Backend Storage** | `Avatar` & `AvatarAsset` tables | **REUSE & MIGRATE** | Keep tables and endpoints; update JSON schema from 2D layers to `Avatar3DConfig` v2. |
| **Desktop 3D Models** | `aria_photorealistic.glb` | **REPLACE FOR MOBILE** | Retain as desktop high-fidelity preset; produce optimized Mobile LOD asset ($\le 6$ MB, $\le 20$k polys, Draco/KTX2). |
| **Mobile App (Expo)** | `apps/mobile` | **EXTEND** | Add native 3D viewport (via `@react-three/fiber` + `expo-gl` or high-performance WebGL WebView). |
| **SadTalker** | `sadtalker_service.py` | **ISOLATE** | Keep off the production voice path; do not bundle into Play Store release. |

---

## Phase 2: Research Existing Avatar Creators

### Reference A: `kblood/CharacterCreator`
* **Repository Reference**: `https://github.com/kblood/CharacterCreator`
* **Status & Findings**:
  * The public URL `https://github.com/kblood/CharacterCreator` returns an HTTP 404. User `kblood` (Kasper Olesen) maintains emulators, MCP tools, and game mods; no public character creator repository is active under this exact slug.
  * In the open-source community, related 3D character creators using Three.js / React Three Fiber include `webaverse-studios/CharacterCreator`, `wass08/r3f-ultimate-character-configurator`, and `shrekshao/gltf-avatar-threejs`.
* **Technical Insights from Configurator Architectures**:
  * **Decoupled Skeleton vs. Geometry**: A master armature (Mixamo or Humanoid standard) is instantiated once. Hair, clothing, and accessories are parented to this armature as skinned meshes sharing bone weights.
  * **Morph Target Sliders**: Morph targets are bound directly to UI slider state (0.0 to 1.0) and applied to `mesh.morphTargetInfluences[dict[targetName]]`.
  * **Asset Swapping**: Garments and hairstyles are loaded as separate glTF child nodes. When a user selects a new shirt, the old shirt's `SkinnedMesh` is detached, disposed from GPU memory, and the new mesh is bound to the existing bone nodes.

---

### Reference B: `M3-org/CharacterStudio`
* **Repository Reference**: `https://github.com/M3-org/CharacterStudio` (Documentation: `https://m3-org.github.io/characterstudio-docs/`)
* **Architecture & Features**:
  * **WebGL / Three.js Platform**: Built specifically for creating, customizing, and exporting open-metaverse humanoid avatars in **glTF** and **VRM** formats.
  * **Modular Assembly Engine**: Assembles avatars by composing discrete parts: base body, head, hair styles, tops, bottoms, shoes, and accessories.
  * **Layer-Based Occlusion Face Culling**: When heavy clothing (e.g., jackets, trousers, boots) is equipped, the system dynamically culls or hides underlying body polygons to eliminate mesh clipping and reduce overdraw.
  * **Texture Atlasing & Draw Call Optimization**: Merges individual component textures into a single texture atlas, reducing multi-component avatar draw calls to **1–2 draw calls**.
  * **Export Pipeline**: Directly serializes the composed Three.js scene into standard `.glb` and `.vrm` files with embedded spring bones and blendshapes.
* **Licensing Evaluation**:
  * The **code** is licensed under **MIT** (Permissive, commercial-friendly).
  * However, default bundled 3D assets stem from Webaverse / Atlas Foundation and community contributors, where commercial redistribution terms are heterogeneous or ambiguous.
  * **Takeaway for Aria**: We can adopt `CharacterStudio`'s architectural pattern (modular armature binding + occlusion culling + texture tinting) using our own clean-room TypeScript code and verified CC0 base assets.

---

### Reference C: `talking-avatar.dev` & Free Talking Avatar SDK
* **Reference**: `https://talking-avatar.dev/free-talking-avatar`
* **Architecture & Features**:
  * **Free In-Browser SDK**: An open-source, MIT-licensed client-side JavaScript library that runs directly inside WebGL/Three.js applications without requiring backend GPU servers or cloud API keys.
  * **Lightweight Neural Lip-Sync Model**: Utilizes an ultra-compact (~1 MB) ONNX/WASM neural model that runs locally on the user's CPU/GPU to infer facial blendshapes directly from raw PCM audio streams in real-time (~10–25ms latency).
  * **Standard Blendshape Driving**: Drives standard Apple ARKit 52 blendshapes and Oculus 15 visemes, naturally modulating jaw opening, lip puckering, brow movement, and blink timing.
  * **Hosted Commercial Tier**: Offers a separate cloud-streamed photorealistic avatar API ($0.02/minute), which is unnecessary for Aria since Aria operates with on-device real-time rendering.
* **Compatibility with Aria**:
  * The client SDK is 100% compatible with Aria's existing Three.js scene. Because `aria_photorealistic.glb` already possesses the 52 ARKit blendshapes and 15 Oculus visemes, this client-driven lip-sync approach can either augment or serve as a drop-in replacement for server-generated viseme cues.

---

### Reference D: Additional Open-Source Human Avatar Systems

1. **MakeHuman / MPFB2 (MakeHuman Plugin for Blender 2)**:
   * **Base Mesh Topology**: The MakeHuman Community Base Mesh topology is dedicated to the public domain under **CC0 1.0 Universal** (unrestricted commercial use, modification, and redistribution).
   * **Morph Target System**: Provides over 1,100 parametric morph targets covering demographic traits (age, gender, ethnicity), facial details (nose bridge, tip, nostril flare, jaw width, chin cleft, lip fullness, eye slant), and body proportions (height, weight, torso length, hip width).
   * **Relevance**: Aria's existing `aria_photorealistic.glb` and `marcus_photorealistic.glb` are derived from this exact topology.

2. **VRoid / VRM Standard**:
   * **Format**: An open glTF extension (`.vrm`) standardizing humanoid humanoid bone hierarchies, first-person view cameras, spring bone physics (hair/cloth sway), and facial blendshapes.
   * **Pros**: Highly standardized, lightweight runtime libraries (`@pixiv/three-vrm`).
   * **Cons**: VRoid Studio's native default assets have anime-stylized aesthetics and restrictive commercial redistribution clauses on certain default clothing presets.

3. **TalkingHead.js (`met4citizen/TalkingHead`)**:
   * **Engine**: MIT-licensed Three.js class providing full-body lip-sync, dynamic eye movement, breathing, and gesture coordination from audio or text.
   * **Features**: Compatible with Ready Player Me and Mixamo humanoid rigs; includes built-in viseme smoothing and natural saccadic eye movement.

4. **Ready Player Me**:
   * **Verdict**: While developer-friendly, Ready Player Me's commercial Terms of Service require revenue-sharing or enterprise contracts above specific monthly active user (MAU) thresholds, and prohibits self-hosting or offline generation of their proprietary avatars. **Not suitable** for a self-contained, independent, commercial mobile companion.

---

## Phase 3: Character Technology Selection

We evaluated three architectural approaches for character generation:

```
+-----------------------------------------------------------------------------------+
|                        CHARACTER TECHNOLOGY TRADEOFF MATRIX                       |
+-----------------------------------------------------------------------------------+
| Approach               | Facial Depth | Wardrobe Flexibility | Mobile Performance |
+------------------------+--------------+----------------------+--------------------+
| A. Pure Parametric     | High (100+)  | Low (Cloth Stretches)| Excellent (1 Mesh) |
| B. Pure Modular        | Low (Fixed)  | High (Swappable)     | Moderate (Seams)   |
| C. Hybrid (RECOMMENDED)| High (Morphs)| High (Rigged Garment)| High (Culled Mesh) |
+-----------------------------------------------------------------------------------+
```

### Approach A: Pure Parametric 3D Human
* **Concept**: A single base humanoid mesh deformed entirely via morph targets and vertex shaders for both face and clothing.
* **Limitations**: Clothing cannot be swapped easily; clothing meshes distorted by extreme body morphs often produce texture stretching and unnatural geometric deformation.

### Approach B: Pure Modular 3D Character
* **Concept**: Pre-modeled heads, hair pieces, torsos, and legs snapped together at boundary seams (similar to Lego or early RPGs).
* **Limitations**: Produces visible neck and wrist seams when skin tones change; limits facial customization to selecting from a fixed catalog of pre-baked faces.

### Approach C: Hybrid Parametric and Modular Architecture (SELECTED)
* **Core Architecture**:
  1. **Parametric Base Head & Body**: A single continuous CC0 humanoid base mesh sharing a unified skeleton. Facial features (jaw, chin, eyes, nose, mouth, ears) and core body parameters (height, muscularity, weight) are controlled dynamically via **vertex morph targets**.
  2. **Parametric Materials**: Skin tone, roughness, eye iris color, and makeup are driven dynamically via **PBR material parameters and shader uniforms** on the base mesh.
  3. **Modular Accessories & Wardrobe**: Hair, facial hair, clothing (tops, bottoms, footwear, full outfits), and accessories (glasses, jewelry) are modeled as separate glTF assets that are bound to the shared skeleton armature.
  4. **Occlusion Culling**: When long pants or jackets are equipped, occluded vertices on the underlying torso/legs are masked out (either via alpha-mask texture or vertex hide groups) to eliminate clipping and optimize mobile vertex fill rate.

**Decision**: **Approach C (Hybrid Parametric and Modular)** is definitively selected. It directly matches the asset structure already present in the repository (`aria_photorealistic.glb` contains `base` + `teeth_base` + modular `female_elegantsuit01` + modular `ponytail01`).

---

## Phase 4: Avatar Studio Experience & Mobile UX Design

To provide an intuitive, Snapchat-level mobile customization experience on Android without desktop clutter, the Avatar Studio interface is structured into three coordinated viewports:

```
+-----------------------------------------------------------------------+
|  <- Back                  AVATAR STUDIO                     Save  [v] |
+-----------------------------------------------------------------------+
|                                                                       |
|                          3D INTERACTIVE VIEWPORT                      |
|                                                                       |
|                     [ 360 Orbit | Pinch Zoom | Pan ]                  |
|                                                                       |
|   Camera Presets:  [ (o) Face  |  ( ) Half-Body  |  ( ) Full-Body ]   |
|                                                                       |
+-----------------------------------------------------------------------+
|  CATEGORY TABS:                                                       |
|  [ Face ]    [ Hair ]    [ Body ]    [ Clothing ]    [ Accessories ]  |
+-----------------------------------------------------------------------+
|  SUB-CATEGORY SELECTOR:                                               |
|  ( Shape )  ( Skin )  ( Eyes )  ( Nose )  ( Mouth )  ( Jaw )  ( Ears )|
+-----------------------------------------------------------------------+
|  CUSTOMIZATION CONTROLS (BOTTOM SHEET):                               |
|                                                                       |
|  Skin Tone:                                                           |
|  [ #F5D0B5 ] [ #E8B590 ] [ #C68A5C ] [ #8D5524 ] [ #4A2C11 ] [ + ]    |
|                                                                       |
|  Jaw Width:        [-----------O-------] 0.62                         |
|  Chin Prominence:  [-------O-----------] 0.38                         |
|  Cheekbone Height: [-------------O-----] 0.74                         |
|                                                                       |
|  [ Randomize ]           [ Undo ]   [ Redo ]           [ Reset Cat ]  |
+-----------------------------------------------------------------------+
```

### 4.1 Customization Parameters Supported by the Hybrid Model

1. **Face**:
   * **Shape & Proportions**: Overall face width, roundness, ovality, cheekbone height and fullness.
   * **Jaw & Chin**: Jaw width, jaw angle, chin length, chin prominence, chin cleft.
   * **Eyes**: Eye size, eye slant (canthal tilt), eye spacing, iris color (HSV color wheel + realistic presets), eyebrow height and arch.
   * **Nose**: Nose length, nose bridge width, nose tip angle, nostril flare.
   * **Mouth**: Lip thickness, upper/lower lip fullness, mouth width, smile curvature.
   * **Skin**: Tone hex code (interpolating melanin and hemoglobin maps), skin roughness, freckle intensity, age detail.
2. **Hair**:
   * **Style**: Modular asset selection (`ponytail01`, `bob01`, `short02`, `wavy_long`, `buzz_cut`, `afro_fade`).
   * **Color**: Base color tint, root shade, highlight tint, specular sheen.
   * **Eyebrows & Eyelashes**: Shape variant, density, tint.
   * **Facial Hair**: Stubble, goatee, beard styles, mustache.
3. **Body**:
   * **Proportions**: Height (0.85× to 1.15× armature scale), muscle definition, weight/fullness, torso-to-leg ratio.
   * **Skin Consistency**: The base head and body share a single continuous UV map and material, guaranteeing 100% skin tone consistency with zero boundary seams.
4. **Clothing & Accessories**:
   * **Tops**: Casual t-shirt, button-up shirt, sweater, tailored blazer, hoodie.
   * **Bottoms**: Denim jeans, chinos, tailored trousers, pleated skirt, shorts.
   * **Footwear**: Sneakers, leather dress shoes, ankle boots.
   * **Accessories**: Eyeglasses, sunglasses, earrings, necklace, wristwatch.
   * **Outfit Presets**: Professional Suit, Casual Weekend, Athletic, Smart Casual.

---

## Phase 5: Character Configuration Data Model

To ensure network efficiency and instant character switching, the avatar state is stored as a lightweight **JSON configuration schema** (`~2–4 KB`) rather than serializing bulky 3D geometry files.

```typescript
/**
 * 3D Avatar Configuration Schema v2
 */
export interface Avatar3DConfig {
  version: 2;
  baseModelId: 'aria_female_v2' | 'marcus_male_v2' | 'human_universal_v2';
  
  // Parametric Facial Morph Target Influences (0.0 to 1.0)
  face: {
    jawWidth: number;
    jawAngle: number;
    chinLength: number;
    chinProminence: number;
    cheekboneHeight: number;
    cheekboneFullness: number;
    eyeSize: number;
    eyeSpacing: number;
    eyeSlant: number;
    noseLength: number;
    noseBridgeWidth: number;
    noseTipAngle: number;
    noseFlare: number;
    lipFullnessUpper: number;
    lipFullnessLower: number;
    mouthWidth: number;
    earSize: number;
    browArch: number;
    browThickness: number;
  };

  // Material & Pigment Parameters
  materials: {
    skinTone: string;         // Hex color, e.g. "#F2C5A0"
    skinRoughness: number;    // 0.2 to 0.9
    eyeColor: string;         // Hex color, e.g. "#2B5E3B"
    eyeRoughness: number;     // e.g. 0.08
    teethRoughness: number;   // e.g. 0.16
  };

  // Modular Rigged Attachments
  hair: {
    assetId: string;          // e.g. "ponytail01"
    color: string;            // Hex color, e.g. "#4A2E18"
    roughness: number;
  };
  
  facialHair?: {
    assetId: string;          // e.g. "stubble_short"
    color: string;
  };

  // Parametric Body Dimensions
  body: {
    height: number;           // 0.85 to 1.15
    muscle: number;           // 0.0 to 1.0
    weight: number;           // 0.0 to 1.0
  };

  // Modular Garments & Accessories
  clothing: {
    topAssetId?: string;      // e.g. "female_elegantsuit_top"
    topColor?: string;
    bottomAssetId?: string;   // e.g. "female_elegantsuit_pants"
    bottomColor?: string;
    shoesAssetId?: string;    // e.g. "shoes01"
    outfitPresetId?: string;  // e.g. "casual_chic"
  };

  accessories: Array<{
    assetId: string;          // e.g. "glasses_round_tortoise"
    slot: 'eyes' | 'ears' | 'neck' | 'wrist';
    color?: string;
  }>;

  // Animation & Personality Behavior
  behavior: {
    defaultPose: 'relaxed' | 'confident' | 'friendly';
    blinkFrequencyMultiplier: number; // default 1.0
    smileTendency: number;            // 0.0 to 1.0
  };
}
```

### 5.1 Storage & Synchronization Architecture
* **Database Row**: Stored in `avatars.config` as a PostgreSQL `JSONB` column.
* **Cache & Offline Sync**: On mobile, the active configuration is cached locally via MMKV / SQLite so the companion can be rendered instantly when offline.
* **Asset Loading Strategy**: Core base meshes and initial default assets (3 hairstyles, 3 outfits) are bundled directly into the application binary. Premium or seasonal outfits are loaded on demand via CDN and cached in local app storage.

---

## Phase 6: Real-Time Animation & Lip-Sync Pipeline

The real-time animation system must operate with zero perceptible latency during conversational audio turns.

```
       [ Live Audio / TTS Stream ]
                    |
                    v
    +-------------------------------+
    |   Viseme & Phoneme Extractor  |
    | (Timestamp / WebAudio / WASM) |
    +---------------+---------------+
                    |
                    | (Oculus 15 / ARKit 52 Targets)
                    v
    +-------------------------------+
    |    Smooth Lerp Controller     | <---+ [ Natural Blink Engine (Poisson) ]
    | (Attack: 0.45, Decay: 0.55)   | <---+ [ Emotion Smile Modulation ]
    +---------------+---------------+ <---+ [ Spine Breathing Sway (0.015 rad)]
                    |
                    v
    +-------------------------------+
    |   Mesh Morph Target Binding   |
    |  (SkinnedMesh.influences[])   |
    +---------------+---------------+
                    |
                    v
    +-------------------------------+
    |  WebGL / Three.js 60 FPS Draw |
    +-------------------------------+
```

### 6.1 Lip Synchronization Specifications
1. **Phoneme-to-Morph Mapping**:
   * Bilabials (`P`, `B`, `M`) $\rightarrow$ `viseme_PP` + `mouthClose` (1.0).
   * Labiodentals (`F`, `V`) $\rightarrow$ `viseme_FF` + `mouthRollLower` (0.6).
   * Dentals (`TH`, `DH`) $\rightarrow$ `viseme_TH` + `jawOpen` (0.2).
   * Open Vowels (`AA`, `AH`) $\rightarrow$ `viseme_aa` + `jawOpen` (0.45).
   * Rounded Vowels (`UW`, `OW`) $\rightarrow$ `viseme_O` + `mouthPucker` (0.7).
2. **Dynamic Clamping**:
   * Jaw aperture is strictly clamped to $\le 0.52$ maximum scale, preventing anatomical clipping through teeth and chin mesh.
3. **Decoupled Emotional Expressions**:
   * Facial emotions (e.g., `mouthSmileLeft`/`Right`, `browInnerUp`) are calculated additively on separate morph channels so speaking does not flatten smiles or distort eyebrows.
4. **Instant Interruption**:
   * When user speech is detected during a companion turn, the audio player cancels immediately, the mouth decays to 0 within 50ms, and the animation mixer transitions smoothly to `listening` (head tilted slightly, eyes attentive).

---

## Phase 7: Mobile Feasibility & Rendering Strategy for Android

### 7.1 Android Rendering Options Comparison

| Engine / Pipeline | Architecture | Pros | Cons | Verdict |
| :--- | :--- | :--- | :--- | :--- |
| **A. Expo-GL + Three.js (`@react-three/fiber`)** | Native OpenGL ES context wrapped in React Native | Shares 95% of Three.js code with web; identical morph target pipeline; no WebSheet bridge overhead. | Requires careful memory management with Expo GL textures. | **RECOMMENDED (Primary)** |
| **B. Google Filament (`react-native-filament`)** | Native C++ Android PBR renderer | Highest mobile PBR fidelity; physically based materials; low CPU draw overhead. | C++ build setup; does not easily share web Three.js codebase; custom morph target binding required. | **Alternative for Phase 2** |
| **C. Optimized WebGL WebView** | Embedded Android Chromium WebView | 100% web code reuse; isolated WebGL sandbox; simplest cross-platform maintenance. | Slight touch latency (~15ms); higher base memory footprint (~40MB for WebView process). | **Fallback for Low-End Devices** |

### 7.2 Android Hardware Budget & Optimization Targets
* **Target Triangle Count**: $\le 18,000 - 25,000$ triangles (compared to 120,000 on desktop).
* **Texture Atlasing**: Combined diffuse, normal, and roughness maps packed into a single $1024 \times 1024$ or $2048 \times 2048$ KTX2 / Basis Universal texture atlas.
* **Target Frame Rate**:
  * Active Studio Customization / Speaking: **60 FPS** (or 30 FPS power-save mode on battery saver).
  * Idle Listening: **20–30 FPS** with reduced canvas draw cycles to conserve battery.
* **Memory Budget**: Peak GPU VRAM footprint $\le 45 \text{ MB}$; overall application RAM footprint $\le 120 \text{ MB}$.

---

## Conclusion & Recommended Next Step

The technical audit demonstrates that **Aria already possesses the core morph targets, viseme calculation algorithms, and animation controllers** needed to build a state-of-the-art Avatar Studio. The primary challenges are:
1. **Asset Optimization**: Compressing the MakeHuman/MPFB2 32MB base meshes into a lightweight, mobile-optimized $\le 5$ MB LOD model.
2. **Schema & API Migration**: Upgrading the 2D layer schema to `Avatar3DConfig` v2 with strict user isolation.
3. **Mobile Viewport Deployment**: Bringing the Three.js viewport into the Expo React Native application via `expo-gl` or an optimized WebGL container.

See [AVATAR_STUDIO_LICENSE_AUDIT.md](file:///home/manas/Projects/ai-companion/docs/AVATAR_STUDIO_LICENSE_AUDIT.md) for commercial licensing verification, [AVATAR_STUDIO_PERFORMANCE_PLAN.md](file:///home/manas/Projects/ai-companion/docs/AVATAR_STUDIO_PERFORMANCE_PLAN.md) for mobile benchmarks, and [AVATAR_STUDIO_IMPLEMENTATION_PLAN.md](file:///home/manas/Projects/ai-companion/docs/AVATAR_STUDIO_IMPLEMENTATION_PLAN.md) for phased execution milestones.
