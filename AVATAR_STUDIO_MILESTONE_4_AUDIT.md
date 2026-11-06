# ARIA AVATAR STUDIO — MILESTONE 4 AUDIT
**Document Version:** 1.0.0  
**Date:** October 23, 2026  
**Target Package:** `@ai-companion/mobile` (`apps/mobile`)  
**Host Environment:** Linux (Ubuntu kernel 7.0.0), Node.js v24.16.0, pnpm v9

---

## 1. Existing Mobile Architecture

The mobile application is a monorepo workspace package (`@ai-companion/mobile`) managed with `pnpm` and `turbo`:

- **Framework:** Expo SDK 51 (`~51.0.0`, resolved to `51.0.39`).
- **Core Runtime:** React Native `0.74.5`, React `18.2.0`, JavaScript engine: Hermes.
- **Navigation:** `expo-router` `~3.5.0` with file-based routing in `apps/mobile/app`:
  - `app/_layout.tsx`: Root Stack navigator loading custom fonts (`Inter`, `JetBrainsMono`) via `expo-font` and wrapping in `SafeAreaProvider`.
  - `app/(tabs)/_layout.tsx`: Bottom Tab Navigator with 4 tabs:
    - `index.tsx`: Home overview screen.
    - `chat.tsx`: Text and voice chat companion placeholder.
    - `companion.tsx`: Companion customization placeholder.
    - `settings.tsx`: User profile and settings placeholder.
- **Styling:** `nativewind` `^4.0.0` with `tailwindcss` `^3.4.0` and `app/global.css`.
- **Animation:** `react-native-reanimated` `~3.16.0` (configured in `babel.config.js`).
- **Shared Contracts:** Consumes `@ai-companion/shared` directly via pnpm workspace link.

---

## 2. Current Avatar-Related Components in Mobile

An audit of `apps/mobile` confirms:
1. `apps/mobile/app/(tabs)/companion.tsx` currently displays static placeholder text: *"Customize your AI companion coming soon..."*.
2. `apps/mobile/app/(tabs)/index.tsx` contains static marketing copy referencing: *"Customizable Avatar: Create a unique 2D layered avatar that represents your companion"*.
3. No 3D model loaders, WebGL canvases, morph target controllers, or material tinting components currently exist in `apps/mobile`.
4. Milestone 4 will establish the mobile avatar presentation layer and studio customizer.

---

## 3. Voice Pipeline Integration Points

The backend FastAPI application provides a production voice orchestration API at `/api/v1/voice`:
- `POST /api/v1/voice/turn`: Processes user audio input, executes speech-to-text with faster-whisper, retrieves contextual memories via pgvector RAG, invokes LLM inference, and synthesizes speech audio with viseme cue timestamps.
- `POST /api/v1/voice/greeting`: Generates the companion's initial greeting audio and viseme cues.
- `POST /api/v1/voice/synthesize`: Generates standalone neural TTS audio (Edge TTS JennyNeural/GuyNeural).
- `POST /api/v1/voice/transcribe`: Standalone whisper transcription endpoint.

The mobile voice integration must:
1. Track companion voice states: `idle`, `listening`, `processing_speech`, `speaking`, `interrupted`, and `error`.
2. Connect real-time viseme cues or simulated audio aperture to the avatar's jaw and mouth shape keys.
3. Decouple speech playback from 3D rendering so that rendering failures never crash or interrupt audio conversations.

---

## 4. Authentication and API Flow

The mobile app must communicate directly with the FastAPI backend (`http://localhost:8000` or Android emulator loopback `http://10.0.2.2:8000`):
- `POST /api/v1/auth/login`: Issues RS256 JWT access and refresh tokens.
- `GET /api/v1/avatars/active`: Returns the authenticated user's active version 2 `Avatar3DConfig`.
- `POST /api/v1/avatars`: Creates a new active avatar.
- `PATCH /api/v1/avatars/{id}`: Modifies an existing avatar configuration.

### Security Requirements for Mobile:
1. Access and refresh tokens must be persisted securely (e.g. via `expo-secure-store` or secure key storage).
2. All requests to `/api/v1/avatars/*` must include `Authorization: Bearer <access_token>`.
3. Account logout must clear stored tokens and active avatar state, preventing state leakage across user switches.

---

## 5. Expo and React Native Compatibility Constraints

| Library / Tool | Current Mobile Version | Compatibility Analysis |
| :--- | :--- | :--- |
| **Expo SDK** | `~51.0.0` (51.0.39) | Baseline. Must use modules compiled for SDK 51. |
| **React** | `18.2.0` | Incompatible with React 19 packages. Libraries requiring React 19 cannot be installed. |
| **React Native** | `0.74.5` | Standard New Architecture / Bridgeless compatible. |
| **Expo GL** | `~14.0.2` (SDK 51) | Required for WebGL surface on iOS and Android. |
| **Three.js** | `0.164.1` (workspace) | Compatible with `expo-gl@14.0.2`. |
| **@react-three/fiber** | `^8.18.0` (R3F v8) | R3F v8 supports React 18 and React Native. (R3F v9 requires React 19 and is rejected). |
| **Metro Asset Resolver** | `^0.80.0` | Metro requires `.glb` and `.gltf` asset extensions to be declared in `assetExts`. |

---

## 6. Candidate Rendering Architectures Evaluated

### Option A: Pure Three.js + `expo-gl` (`GLView`)
- **Mechanism:** Direct instantiation of Three.js `WebGLRenderer`, `PerspectiveCamera`, and `Scene` using a WebGL context created by `<GLView onContextCreate={...}>`.
- **Strengths:** 
  - Direct, fine-grained control over GPU resource disposal (`geometry.dispose()`, `texture.dispose()`, `gl.endFrameEXP()`).
  - Completely avoids React reconciler overhead for 60 FPS animation loops.
  - Predictable Hermes memory footprint without R3F synthetic event listeners.
- **Weaknesses:** Requires manual animation frame loop management (`requestAnimationFrame`).

### Option B: `@react-three/fiber/native` + `expo-gl`
- **Mechanism:** Declarative JSX scene rendering inside `<Canvas>` from `@react-three/fiber/native`.
- **Strengths:** Matches the web component structure closely (`AvatarStudioModel.tsx`).
- **Weaknesses:** Strict peer dependency constraints with React 18 / Expo 51; potential React reconciler overhead on low-end Android CPUs.

### Option C: `react-native-webview` Offline HTML/WebGL Bridge
- **Mechanism:** Renders the existing web Three.js canvas inside an isolated offline WebView using local asset bundles and postMessage bridge.
- **Strengths:** 100% visual parity with web; zero GL context crashes on fragmented Android GPU chipsets.
- **Weaknesses:** Slightly higher cold-start time and postMessage bridge overhead for high-frequency visemes.

### **Selected Architectural Approach:**
A clean, modular **Pure Three.js + `expo-gl`** renderer architecture (Option A) combined with a component boundary (`MobileAvatarRenderer.tsx`) that can fallback to 2D landmark rendering (`Avatar2DView`) if WebGL is unsupported or encounters an unrecoverable GPU context loss. This ensures maximum stability, minimal overhead, and exact compatibility with Expo SDK 51.

---

## 7. Required Dependencies

To implement Milestone 4 safely without breaking existing Expo 51 compatibility:

1. `expo-gl` (`~14.0.2`): Hardware WebGL context provider.
2. `three` (`0.164.1`): Core 3D engine matching `@ai-companion/web`.
3. `expo-asset` (`~10.0.6`): Asset resolution for bundled `.glb` models.
4. `expo-file-system` (`~17.0.1`): Local filesystem caching for downloaded avatars.
5. `expo-secure-store` (`~13.0.2`): Secure credential and token storage on Android Keystore.
6. `@react-native-community/slider` (`4.5.2`): Native slider controls for studio customizer.

---

## 8. Known Licensing and Asset Limitations

1. **MakeHuman / CC Base Meshes (`aria_photorealistic.glb`, `marcus_photorealistic.glb`)**:
   - Released under Creative Commons Attribution (CC-BY 4.0 / MakeHuman Community).
   - Commercial distribution is permitted provided attribution is included in the application's About/Licenses screen.
2. **Mixamo Skeletal Animations (`animations.glb`)**:
   - Mixamo standard terms permit redistribution of embedded animations within interactive software applications, but prohibit selling or redistributing the raw animation files as standalone 3D assets.
3. **SadTalker Checkpoints**:
   - Must remain strictly excluded from the mobile production binary per non-negotiable project constraints.
4. **Asset Optimization Requirement**:
   - The uncompressed 31MB and 35MB GLB files must be optimized before production release via Draco/Meshopt geometry compression and texture downsampling to respect Google Play Store download thresholds.

---

## 9. Conclusion & Phase 1 Sign-Off

The audit is complete. The mobile application is clean and ready for Milestone 4 implementation. We now proceed to Phase 2 (dependency installation and compatible renderer verification).
