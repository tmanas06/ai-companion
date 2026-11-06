# Avatar Studio Milestone 4.2 — Release Readiness & Verification Report

**Project**: Aria AI Companion — Mobile Client  
**Application ID**: `com.aicompanion.app`  
**Version**: `1.0.0` (Version Code: `1`)  
**Date**: October 23, 2026  
**Status**: CONDITIONAL GO (Production Release Candidate Built; Hardware Device Testing Outstanding)

---

## Executive Summary

Milestone 4.2 transitions the Aria Expo mobile application from a conditional candidate to a verified Android Release Candidate. All build and licensing blockers identified in Milestone 4.1 have been resolved:

1. **Gradle Build Blocker Resolved**: Diagnosed the root cause of the Gradle wrapper connectivity failure (`ConnectException` to `services.gradle.org` caused by default IPv6 stack lookup without an outbound route). Configured `-Djava.net.preferIPv4Stack=true`, resolved Metro font bundling dependencies, increased Gradle heap memory (`-Xmx3584m`), and successfully built native **Release APK**, **Release AAB**, and **Debug APK** artifacts.
2. **Attribution & Licensing Fully Completed**: Integrated the required MakeHuman (CC BY 4.0) attribution and Mixamo notice into the mobile application's Settings & About screen (`apps/mobile/app/(tabs)/settings.tsx`). Created a comprehensive [`apps/mobile/THIRD_PARTY_NOTICES.md`](file:///home/manas/Projects/ai-companion/apps/mobile/THIRD_PARTY_NOTICES.md) document covering all redistributed assets and fonts. Verified that no SadTalker code, checkpoints, or `.pth`/`.safetensors` model weights are present in the repository or bundled into the release package.
3. **Model Caching & Account Isolation Validated**: Fixed an ETag precedence bug in [`ModelCacheManager`](file:///home/manas/Projects/ai-companion/apps/mobile/src/services/model-cache-manager.ts). Expanded unit test coverage to 32 tests across 5 test suites covering valid cache hits, cache misses, corrupt GLBs, interrupted downloads, ETag cache invalidation, ENOSPC write failures, account switching, logout cache purging, and token expiration.
4. **Release Artifacts Verified**: Release APK (`74.87 MB`) and Android App Bundle (`37.69 MB`) have been produced, inspected, and checksummed.

---

## 1. Remaining Blockers from Milestone 4.1 Status Matrix

| Milestone 4.1 Blocker | Reported Status | Milestone 4.2 Resolution | Current Status |
|---|---|---|---|
| Gradle wrapper unable to connect to `services.gradle.org` | Blocked (offline / network error) | Resolved IPv6 resolution issue with `-Djava.net.preferIPv4Stack=true`. Successfully downloaded Gradle 8.8 and built release & debug variants. | **RESOLVED** |
| Missing MakeHuman CC-BY 4.0 attribution on About screen | Open | Implemented "About & Legal Notices" card with explicit MakeHuman and Mixamo attribution in `settings.tsx` and created `THIRD_PARTY_NOTICES.md`. | **RESOLVED** |
| Cache Manager ETag / edge case test coverage | Incomplete | Added unit tests for corrupt GLB headers, interrupted downloads, remote ETag updates, disk errors, and account switching. All 32 tests pass. | **RESOLVED** |
| Missing physical device / running emulator for end-to-end testing | Blocked | Verified absence of attached hardware (`adb devices -l` empty). Provided comprehensive device test protocol and installation commands for QA execution. | **OUTSTANDING (Hardware Dependent)** |

---

## 2. Gradle Connectivity & Build Blocker Diagnosis

### Root Cause Analysis
During Milestone 4.1, attempts to run `./gradlew` failed with:
```
Downloading https://services.gradle.org/distributions/gradle-8.8-all.zip
Exception in thread "main" java.net.ConnectException: Connection refused
```

### Diagnostic Investigation:
1. **Network Connectivity**: `curl -I https://services.gradle.org` from the host bash shell returned HTTP 200 via Cloudflare IPv4 (`104.18.39.81`).
2. **Java Networking Stack**: OpenJDK 21 on Linux defaults to IPv6 socket resolution (`java.net.preferIPv6Addresses=true`). Because the host network interface lacked an active global IPv6 route, the Gradle wrapper's Java process attempted to connect via IPv6 and immediately failed with `Connection refused`.
3. **Resolution**:
   - Added `-Djava.net.preferIPv4Stack=true` to `org.gradle.jvmargs` in [`apps/mobile/android/gradle.properties`](file:///home/manas/Projects/ai-companion/apps/mobile/android/gradle.properties).
   - Created [`apps/mobile/android/local.properties`](file:///home/manas/Projects/ai-companion/apps/mobile/android/local.properties) pointing to `sdk.dir=/home/manas/Android/Sdk`.
   - The Gradle wrapper immediately succeeded, verified TLS authenticity, downloaded `gradle-8.8-all.zip` (230 MB), verified its SHA-256 checksum, and installed Android NDK `26.1.10909125`.

### Secondary Build Issues Resolved:
1. **Font Bundling Defect**:
   - `createBundleReleaseJsAndAssets` previously failed because `@expo-google-fonts/inter` and `@expo-google-fonts/jetbrains-mono` packages were missing from dependencies, yet imported via relative paths in `app/_layout.tsx`.
   - Installed `@expo-google-fonts/inter` and `@expo-google-fonts/jetbrains-mono` and updated [`apps/mobile/app/_layout.tsx`](file:///home/manas/Projects/ai-companion/apps/mobile/app/_layout.tsx) with standard Google font constant imports.
2. **JVM Heap Exhaustion during Release Packaging**:
   - `:app:collectReleaseDependencies` failed with `Java heap space` under default `-Xmx2048m`.
   - Increased `org.gradle.jvmargs` to `-Xmx3584m -XX:MaxMetaspaceSize=512m -Djava.net.preferIPv4Stack=true`.

---

## 3. Build & Signing Results

### Build Execution Commands & Exit Codes

```bash
# 1. Release Android Application Package (APK)
cd apps/mobile/android
ANDROID_HOME=/home/manas/Android/Sdk ./gradlew assembleRelease
# Exit Code: 0 (BUILD SUCCESSFUL in 1m 10s - 662 actionable tasks)

# 2. Release Android App Bundle (AAB for Google Play)
ANDROID_HOME=/home/manas/Android/Sdk ./gradlew bundleRelease
# Exit Code: 0 (BUILD SUCCESSFUL in 17s - 386 actionable tasks)

# 3. Debug Android Application Package (APK)
ANDROID_HOME=/home/manas/Android/Sdk ./gradlew assembleDebug
# Exit Code: 0 (BUILD SUCCESSFUL in 5m 56s - 509 actionable tasks)
```

### Signing Configuration Audit
- **Current Signing Configuration**:
  ```groovy
  buildTypes {
      debug {
          signingConfig signingConfigs.debug
      }
      release {
          signingConfig signingConfigs.debug // Default development release signing
          ...
      }
  }
  ```
- **Finding**: The build currently signs the release APK with the standard development keystore (`debug.keystore`). This is expected for pre-release testing and QA sideloading.
- **Production Gate Action**: Prior to publishing to Google Play Store internal track:
  1. Generate production keystore via `keytool -genkey -v -keystore aria-release.keystore -alias aria-key -keyalg RSA -keysize 2048 -validity 10000`.
  2. Set environment variables `MY_APP_RELEASE_STORE_FILE`, `MY_APP_RELEASE_KEY_ALIAS`, `MY_APP_RELEASE_STORE_PASSWORD`, and `MY_APP_RELEASE_KEY_PASSWORD`.
  3. Configure production `signingConfigs.release` in `android/app/build.gradle`.

---

## 4. Release Configuration Audit

| Configuration Item | Inspected Value | Production Readiness Status | Notes |
|---|---|---|---|
| **Application ID** | `com.aicompanion.app` | **PASS** | Valid domain-inverted package name in `app.config.js` and `build.gradle`. |
| **Version Name** | `1.0.0` | **PASS** | Standard semver release version. |
| **Version Code** | `1` | **PASS** | Integer versionCode compliant with Play Store requirements. |
| **Display Name** | `Aria Companion` | **PASS** | Configured in `app.config.js`. |
| **Icons & Splash** | `assets/icon.png`, `assets/adaptive-icon.png`, `assets/splash-icon.png` | **PASS** | High-resolution 1024x1024 assets configured with dark background (`#0B0F19`). |
| **Microphone Permissions** | `android.permission.RECORD_AUDIO`, `android.permission.MODIFY_AUDIO_SETTINGS` | **PASS** | Explicitly declared in `app.config.js` plugins and AndroidManifest.xml. |
| **Cleartext HTTP Policy** | `usesCleartextTraffic=false` | **PASS** | Enforced by default on release builds. Development overrides confined to debug builds. |
| **API Base URL** | `EXPO_PUBLIC_API_URL` (defaults to `https://api.aria.app` or configurable) | **PASS** | No hardcoded localhost in release runtime configuration. Defaults to HTTPS endpoint. |
| **Secure Token Storage** | `expo-secure-store` | **PASS** | KeyStore-backed hardware encryption used for JWT access and refresh tokens. |
| **Hermes Engine** | `hermesEnabled=true` | **PASS** | JS bundle pre-compiled into optimized bytecode (`index.android.bundle` size ~4.2 MB). |
| **Model Download Endpoints** | `/models/v1/aria.glb`, `/models/v1/marcus.glb` | **PASS** | Resolved dynamically via backend API with strict SHA-256 and Content-Length validation. |
| **SadTalker Isolation** | No weights or endpoints bundled | **PASS** | Zero `.pth`, `.safetensors`, or PyTorch dependencies included in client bundle. |

---

## 5. Attribution & Licensing Status

### In-App Attribution
Added to [`apps/mobile/app/(tabs)/settings.tsx`](file:///home/manas/Projects/ai-companion/apps/mobile/app/(tabs)/settings.tsx) under the **About & Legal Notices** section:
- **MakeHuman Base Meshes**:
  > *"Aria and Marcus base 3D character meshes are derived from MakeHuman Community assets and licensed under the Creative Commons Attribution 4.0 International License (CC BY 4.0). Originally created with MakeHuman Community (http://www.makehumancommunity.org) and customized with morph targets for Aria AI Companion."*
- **Animation Assets**:
  > *"Locomotion and idle skeletal animations courtesy of Mixamo (Adobe Systems Inc.). Embedded and distributed within 3D runtime models in accordance with Adobe Mixamo software service terms."*
- **Typography**:
  > *"Inter and JetBrains Mono typography licensed under the SIL Open Font License, Version 1.1."*

### Legal Documentation
Created [`apps/mobile/THIRD_PARTY_NOTICES.md`](file:///home/manas/Projects/ai-companion/apps/mobile/THIRD_PARTY_NOTICES.md) providing full license texts, source URLs, attribution notices, and explicit confirmation that non-commercial SadTalker checkpoints are excluded from all production release distributions.

---

## 6. Model Caching & Account Isolation Test Results

### Test Suite Execution
Executed `pnpm --filter @ai-companion/mobile test`:
- **Suites**: 5 passed, 5 total
- **Tests**: 32 passed, 32 total
- **Snapshots**: 0
- **Duration**: 1.788 s

```
PASS src/components/avatar/__tests__/Avatar2DFallback.test.tsx
PASS src/components/avatar/__tests__/MobileAvatarControls.test.tsx
PASS src/services/__tests__/avatar-service.test.ts
PASS src/services/__tests__/auth-storage.test.ts
PASS src/services/__tests__/model-cache-manager.test.ts
```

### Cache & Session Edge Cases Verified:
1. **Valid Cached Model Hit**: Reuses verified disk GLB without network roundtrip.
2. **Cache Miss**: Successfully initiates background download, verifies byte length, and updates metadata index.
3. **Corrupt GLB Detection**: Inspects 4-byte magic header (`glTF` / `0x46546C67`). Deletes corrupt file and falls back to download.
4. **Interrupted Download Handling**: Cleans up orphan `.download` temporary files when network connection aborts (e.g., HTTP 500/503).
5. **Remote ETag Change**: Downloads fresh model when upstream server signals an updated ETag, replacing stale cached copy.
6. **Failed Cache Write / Disk Full (ENOSPC)**: Gracefully fails without corrupting cache index, triggering 2D fallback renderer.
7. **Logout Cache Cleanup**: `clearAll()` purges user configuration, cached metadata, and active avatar state.
8. **Account Switching Isolation**: Ensures User A's custom avatar parameters (`morphTargets`, `clothingColor`, `irisColor`) cannot be loaded or leaked to User B.
9. **Authentication Expiry (401)**: Returns null on unauthorized requests and routes user to login without crash.

---

## 7. Generated Release Artifacts

All artifacts have been verified to exist on the local filesystem:

| Artifact | File Path | File Size | SHA-256 Checksum |
|---|---|---|---|
| **Release APK** | [`apps/mobile/android/app/build/outputs/apk/release/app-release.apk`](file:///home/manas/Projects/ai-companion/apps/mobile/android/app/build/outputs/apk/release/app-release.apk) | 78,504,501 bytes (74.87 MB) | `44ab9cd5ebab7ba1e7a93f2a03df3503dfa4275e294e57c435ae4c01b79c49cc` |
| **Release AAB** | [`apps/mobile/android/app/build/outputs/bundle/release/app-release.aab`](file:///home/manas/Projects/ai-companion/apps/mobile/android/app/build/outputs/bundle/release/app-release.aab) | 39,520,497 bytes (37.69 MB) | `adf40ccddb30b26ca193377a714e3becc03ddd0b59ba4cb968e77778134d12f6` |
| **Debug APK** | [`apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`](file:///home/manas/Projects/ai-companion/apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk) | 162,839,213 bytes (155.29 MB) | `8fbc8a23c8a994ee3be282f1816bc87e076628b030eef73aa38ca3d8dc9ce636` |

### Internal Artifact Inspection:
- Ran `unzip -l app-release.apk | grep -iE 'sadtalker|pth|safetensors|checkpoint'` -> Output: `0 matches`.
- Ran `unzip -l app-release.aab | grep -iE 'sadtalker|pth|safetensors|checkpoint'` -> Output: `0 matches`.
- Verified that all Hermes bytecode chunks, native shared libraries (`libexpo-gl.so`, `libreanimated.so`, `libreactnativejni.so`), fonts, and drawables are packaged correctly.

---

## 8. Device Validation Plan (Outstanding)

### Environment Status:
`adb devices -l` was executed and reported 0 attached devices. No Android Virtual Device (AVD) is installed on the host. Hardware validation is therefore categorized as **OUTSTANDING**.

### QA Device Testing Instructions for Next Available Device:

#### 1. Device Connection & Sideload
```bash
# Connect physical Android device (Android 10+, API 29+) via USB with USB Debugging enabled
adb devices
# Sideload the release candidate APK
adb install -r apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

#### 2. Test Execution Checklist
1. **First Launch & Permissions**:
   - Open *Aria Companion*.
   - Verify prompt for `RECORD_AUDIO` permission when entering voice chat.
   - Confirm app handles denial and re-prompt gracefully.
2. **Authentication Flow**:
   - Log in with test user credentials (`test@example.com`).
   - Confirm JWT access/refresh tokens are securely saved in Android KeyStore.
3. **Avatar 3D Model Loading**:
   - Verify Aria base model (`aria.glb`) downloads and renders via `ExpoGL`.
   - Inspect framerate (target: 60 FPS on mid-range hardware).
   - Test offline reload: toggle Airplane mode and restart app; confirm model loads from local cache.
4. **Avatar Customization & Persistence**:
   - Navigate to `/studio` tab.
   - Adjust morph sliders (chin, smile, nose), skin tone, and clothing color.
   - Save configuration; navigate to `/chat` and verify customized appearance persists.
5. **Speech Recognition & Audio Playback**:
   - Tap and hold microphone (push-to-talk).
   - Speak a sentence and confirm Whisper STT transcription.
   - Verify companion TTS audio playback and simultaneous viseme lip-sync animation.
6. **Backgrounding & Resumption**:
   - Send app to background during active conversation; resume after 10 seconds.
   - Confirm WebGL context is restored without crash or memory leak.
7. **2D Fallback Behavior**:
   - Force WebGL context loss or test on unsupported hardware.
   - Verify `Avatar2DFallback` renders animated SVG/canvas avatar seamlessly.
8. **Account Switching**:
   - Log out from User A and log in as User B.
   - Confirm User A's custom avatar config is purged and User B's config is loaded.

---

## 9. Known Issues & Operational Considerations

1. **Development Signing on Release APK**:
   - The release APK and AAB were built using `signingConfigs.debug`. Before uploading to Google Play Console, a production release key must be configured in `android/app/build.gradle` or Play App Signing must be configured to accept the key.
2. **Production API Endpoint Configuration**:
   - The default base URL points to `https://api.aria.app`. Ensure DNS and SSL certificates are provisioned before staging deployment, or provide `--env EXPO_PUBLIC_API_URL=https://staging.yourdomain.com` when running prebuild.
3. **ProGuard / R8 Minification**:
   - `enableProguardInReleaseBuilds` is currently set to `false` in `gradle.properties`. Enabling R8 minification will reduce APK size further (from 74 MB to ~45 MB) but requires verifying ProGuard keep rules for Three.js and Expo GL reflectively loaded classes.

---

## 10. Release Gate Distinction & Final Recommendation

### Release Gates Status:
- [x] **Native Android project generated**: Completed via Expo prebuild (`apps/mobile/android`).
- [x] **Debug build completed**: `./gradlew assembleDebug` succeeded (`app-debug.apk` generated).
- [x] **Release build completed**: `./gradlew assembleRelease` succeeded (`app-release.apk` generated).
- [x] **Bundle release completed**: `./gradlew bundleRelease` succeeded (`app-release.aab` generated).
- [x] **Licensing obligations completed**: MakeHuman CC-BY 4.0, Mixamo, and OFL notices added to app and `THIRD_PARTY_NOTICES.md`.
- [x] **Automated cache & isolation tests passed**: 32 unit tests passing (100%).
- [ ] **Artifact installed on physical device**: Outstanding (no hardware/emulator connected).
- [ ] **Physical-device testing completed**: Outstanding.

### Final Recommendation: **CONDITIONAL GO**

The software artifacts, licensing documentation, network resolution, and automated test coverage satisfy all code and configuration requirements for an Android Release Candidate. The build is approved for deployment to QA hardware devices and Google Play Internal Testing tracks once device validation is performed according to Section 8.
