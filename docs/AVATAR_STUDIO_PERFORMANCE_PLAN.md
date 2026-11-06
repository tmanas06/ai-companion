# Aria Avatar Studio: Mobile Performance & Optimization Plan

**Project**: Aria Voice-First AI Companion — Avatar Studio  
**Target Hardware**: Mid-Range to High-End Android Devices (e.g., Snapdragon 680 / 720G / Dimensity 700+, 4–6GB RAM)  
**Target Platform**: Android APK (Google Play Store) & Progressive Web App (PWA)  
**Date**: October 2026  
**Document Version**: 1.0.0  

---

## 1. Executive Summary & Hardware Context

Mobile devices operate under strict physical constraints: **limited GPU fill rate**, **thermal throttling**, **battery consumption**, and **strict OS-enforced RAM limits**. While modern desktop GPUs can easily render 150,000 polygons with 4K PBR textures at 120 FPS, an ordinary Android device running that same workload will rapidly drop frames, overheat, and encounter an Android OS Out-Of-Memory (OOM) kill.

The desktop `aria_photorealistic.glb` asset currently in the repository measures **31 MB** with over **85,000 triangles** and uncompressed 4K textures. If deployed directly to mid-range mobile devices, it causes:
* **~8–15 second initial download and parse times** over cellular data.
* **Over 220 MB of uncompressed GPU VRAM allocation**, risking WebGL context termination on devices with 3–4GB RAM.
* **Significant battery drain and thermal throttling** within 3 to 5 minutes of continuous voice conversation.

This document establishes the hardware budgets, asset compression pipelines, rendering optimizations, and dynamic Level-of-Detail (LOD) strategies required to achieve a smooth, consistent **30–60 FPS** across ordinary Android phones without compromising visual appeal.

---

## 2. Hardware Budget & Device Tier Matrix

We define three device tiers based on standard hardware profiles in the Android ecosystem:

```
+---------------------------------------------------------------------------------------------------+
|                                   ANDROID DEVICE PERFORMANCE TIERS                                |
+------------------+------------------------------+--------------------+---------------+------------+
| Tier             | Representative Hardware      | RAM Budget         | Poly Budget   | Target FPS |
+------------------+------------------------------+--------------------+---------------+------------+
| Tier 1: Low-End  | Snapdragon 680 / Helio G85   | 3 GB – 4 GB        | 10k–14k tris  | 30 FPS     |
| Tier 2: Mid-Range| Snapdragon 720G / Dimensity  | 4 GB – 6 GB        | 18k–24k tris  | 30–60 FPS  |
| Tier 3: Flagship | Snapdragon 8 Gen 2 / 8 Gen 3 | 8 GB – 12 GB+      | 35k–45k tris  | 60 FPS     |
+------------------+------------------------------+--------------------+---------------+------------+
```

### Detailed Metric Thresholds

| Metric | Desktop Baseline (Current) | Tier 1 (Low-End Mobile) | Tier 2 (Mid-Range Target) | Tier 3 (Flagship Mobile) |
| :--- | :--- | :--- | :--- | :--- |
| **Model Download Size** | 31.0 MB | **$\le 3.5$ MB** | **$\le 5.5$ MB** | **$\le 8.0$ MB** |
| **Triangle Count** | 85,000+ tris | **$\le 12,000$ tris** | **$\le 22,000$ tris** | **$\le 40,000$ tris** |
| **Draw Calls (Full Avatar)** | 14–22 calls | **$\le 2$ calls** | **$\le 3$ calls** | **$\le 4$ calls** |
| **Peak VRAM Consumption** | ~220 MB | **$\le 35$ MB** | **$\le 55$ MB** | **$\le 95$ MB** |
| **Texture Atlas Resolution**| Uncompressed 4096px | $1024 \times 1024$ KTX2 | $1024 \times 1024$ KTX2 | $2048 \times 2048$ KTX2 |
| **Active FPS (Speaking/UI)**| 60–144 FPS | 30 FPS stable | 45–60 FPS | 60 FPS stable |
| **Idle FPS (Listening/Wait)**| 60 FPS | **15–20 FPS** | **20–24 FPS** | **30 FPS** |
| **Initial Load & Parse Time**| 1.8 s (Local SSD) | $\le 2.0$ s (Fast 4G) | $\le 1.2$ s (4G/WiFi) | $\le 0.6$ s (WiFi) |
| **Garment Swap Latency** | ~250 ms | $\le 100$ ms | $\le 60$ ms | $\le 30$ ms |

---

## 3. 3D Asset Compression & Geometry Pipeline

To reduce the 31 MB base model down to the mid-range target of **$\le 5.5$ MB** without losing expressive morph targets, we implement a 4-stage optimization pipeline:

```
[ High-Res Blender Base (.blend) ]
              |
              v (Decimation & Retopology)
[ Low-Poly Mobile Mesh: 20k Tris ]
              |
              v (Morph Target Pruning: 102 -> 64 Crucial Targets)
[ Essential Target Mesh (ARKit 52 + Visemes + Shape Morphs) ]
              |
              v (Draco Geometry Compression / glTF-Transform)
[ Quantized Vertex Attributes: 14-bit Position, 10-bit Normals ]
              |
              v (Texture Atlasing & KTX2 / Basis Universal Encoding)
[ Production Mobile GLB: 4.8 MB ]
```

### 3.1 Draco & glTF Mesh Quantization
Using `@gltf-transform/cli` or Blender's glTF exporter:
1. **Attribute Quantization**:
   * Vertex Positions: Quantized to 14 bits (preserves sub-millimeter facial precision while cutting position array size by 50%).
   * Normals: Quantized to 10 bits.
   * UV Coordinates: Quantized to 12 bits.
   * Morph Target Deltas: Quantized to 12 bits with sparse storage (only vertices that actually move are stored in delta buffers).
2. **Morph Target Pruning**:
   * The desktop model contains 102 morph targets. Several are redundant (e.g., overlapping CMU phoneme targets that duplicate Oculus visemes).
   * For mobile, we prune down to **64 essential morph targets**:
     * 52 Apple ARKit blendshapes (powers expressions, blinking, and speech).
     * 12 essential parametric shape morphs (jaw width, chin length, cheek height, eye slant, nose length/width, lip fullness).
   * Result: Reduces morph target buffer memory from **18.4 MB down to 4.2 MB**.

---

## 4. Texture Atlasing & GPU Compression (KTX2 / Basis Universal)

Uncompressed PNG/JPEG textures in glTF files must be fully unpacked into raw uncompressed RGBA bitmaps in GPU VRAM (a $2048 \times 2048$ 32-bit texture consumes $2048 \times 2048 \times 4 \text{ bytes} = \mathbf{16.7\text{ MB}}$ of VRAM).

### The Solution: KTX2 with Basis Universal Compression
1. **Hardware-Native Decoding**: KTX2 files remain compressed inside GPU VRAM, transcoded on the fly into the phone's native hardware format:
   * **ASTC** (Adaptive Scalable Texture Compression) on modern Android GPUs (Adreno / Mali).
   * **ETC2** on older Android chipsets.
2. **VRAM Footprint Reduction**:
   * An ASTC 6×6 block compressed $1024 \times 1024$ texture consumes only **2.8 MB of VRAM** (an 83% reduction compared to raw RGBA).
3. **Single Packed PBR Texture Atlas**:
   * **Base Color**: RGB channels = Diffuse color; A channel = Ambient Occlusion.
   * **Normal Map**: RGB channels = Tangent-space normal vector.
   * **ORM Map**: R = Occlusion; G = Roughness; B = Metalness.
   * By packing the base body, head, and eyes into a single atlas, the entire humanoid character can be rendered in **1 single draw call**.

---

## 5. Mobile Runtime & Rendering Pipeline

### 5.1 Architecture: React Native (`expo-gl` + `@react-three/fiber`)

In `apps/mobile`, the 3D Avatar Studio viewport is powered by `@react-three/fiber` running on top of `expo-gl`.

```typescript
// Optimized Mobile Canvas Configuration
<Canvas
  gl={{
    powerPreference: 'high-performance',
    antialias: isFlagshipDevice, // Disable MSAA on low/mid tier to save fillrate
    precision: 'mediump',        // Medium precision shaders on mobile
    depth: true,
    stencil: false,              // Disable stencil buffer to save VRAM
    preserveDrawingBuffer: false,
  }}
  dpr={[1, isFlagshipDevice ? 2 : 1.5]} // Clamp pixel ratio to 1.5x on mid-range
  frameloop="demand"             // Render on demand when idle
>
  <FullBodyAvatarModel ... />
</Canvas>
```

### 5.2 Responsive Facial Slider Updates (Zero Geometry Reallocation)
When a user moves a slider in the Avatar Studio (e.g., adjusting Jaw Width or Lip Thickness):
* **Anti-Pattern**: Recreating the mesh geometry or re-uploading vertex buffers (causes 50–150ms frame freezes).
* **Optimized Pattern**: Sliders directly update uniform array references in `mesh.morphTargetInfluences[index]` inside Three.js's existing memory buffer. This operation takes **$< 0.2\text{ ms}$** and runs at a rock-solid 60 FPS without triggering garbage collection.

### 5.3 Instant Wardrobe Swapping ($\le 60\text{ ms}$)
When swapping clothing:
1. Pre-fetch and cache the top 3 popular outfits into an in-memory `LRUCache`.
2. When the user selects a new outfit, detach the existing garment `SkinnedMesh` from the skeleton.
3. Call `.geometry.dispose()` and `.material.dispose()` on detached nodes immediately to prevent VRAM spikes.
4. Attach the new garment mesh, binding its skeleton bones to the existing avatar armature.

---

## 6. Battery & Thermal Management: Dynamic Adaptive Framerate

Continuous 60 FPS rendering can drain an Android phone's battery by up to 20% in 30 minutes and trigger severe CPU/GPU thermal downclocking.

Aria solves this with a **State-Aware Dynamic Framerate Controller**:

```
+-----------------------------------------------------------------------+
|                 STATE-AWARE FRAMERATE SCHEDULER                       |
+------------------------+-------------+--------------------------------+
| Companion State        | Target FPS  | Rationale                      |
+------------------------+-------------+--------------------------------+
| Active Customization   | 60 FPS      | Fluid UI feedback on sliders   |
| Speaking (TTS Active)  | 45–60 FPS   | Smooth viseme lip-sync         |
| Listening / User Input | 20–24 FPS   | Preserve battery while waiting |
| Idle Wait (No Speech)  | 15 FPS      | Gentle breathing & blinking    |
| App in Background      | 0 FPS (OFF) | WebGL context paused           |
+------------------------+-------------+--------------------------------+
```

### Thermal Throttling Failsafe:
If the renderer detects frame drops below 22 FPS for more than 3 consecutive seconds:
1. Automatically lower the canvas Device Pixel Ratio (DPR) from 1.5× to 1.0×.
2. Disable expensive post-processing effects (bloom, vignette).
3. Reduce shadow map resolution or fallback to directional light without dynamic shadows.

---

## 7. WebGL Context Loss Handling & Crash Recovery

On Android, when another app enters the foreground or when the OS experiences memory pressure, the Android system may kill the WebGL rendering context.

### Recovery Implementation:
In `FullBodyAvatarModel.tsx` / `apps/mobile`:
```typescript
useEffect(() => {
  const canvas = gl.domElement;
  
  const handleContextLost = (event: Event) => {
    event.preventDefault(); // Prevents default browser crash
    console.warn('[AvatarStudio] WebGL Context Lost! Pausing render loop.');
    setIsRenderingPaused(true);
  };

  const handleContextRestored = () => {
    console.info('[AvatarStudio] WebGL Context Restored! Rebuilding 3D assets.');
    reloadAvatarScene();
    setIsRenderingPaused(false);
  };

  canvas.addEventListener('webglcontextlost', handleContextLost, false);
  canvas.addEventListener('webglcontextrestored', handleContextRestored, false);

  return () => {
    canvas.removeEventListener('webglcontextlost', handleContextLost);
    canvas.removeEventListener('webglcontextrestored', handleContextRestored);
  };
}, [gl]);
```

---

## 8. Summary of Performance Targets & Verification Criteria

| Performance Goal | Verification Test | Target Acceptance Criteria |
| :--- | :--- | :--- |
| **Model Load Time** | Cold launch on 4G LTE simulation (Fast 3G/4G) | $\le 2.0$ seconds to interactive 3D render |
| **Animation Smoothness**| Continuous 60s speech turn with viseme tracking | 0 dropped frames; $\ge 45$ FPS on mid-range Android |
| **Slider Responsiveness**| Rapidly dragging facial sliders back and forth | 60 FPS update rate; zero visual stutter or hitching |
| **Memory Ceiling** | 10 minutes of active customization (swapping 10 outfits) | Total VRAM growth $\le 10$ MB (verifying clean disposal) |
| **Battery Draw** | 15-minute voice session on mid-range phone | Battery consumption $< 4\%$ total battery charge |

By adhering to this plan, the Aria Avatar Studio will deliver a **smooth, responsive, and commercially competitive 3D experience** across ordinary Android mobile devices.
