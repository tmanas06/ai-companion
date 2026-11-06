# THIRD-PARTY SOFTWARE NOTICES AND ASSET LICENSES

This document details the open-source software, fonts, 3D character assets, and animations included in or bundled with the **Aria AI Companion** mobile application (`@ai-companion/mobile`).

---

## 1. 3D Character Meshes (MakeHuman Community)

- **Assets:** `aria_photorealistic_mobile.glb`, `marcus_photorealistic_mobile.glb`
- **Origin:** MakeHuman Community assets, retopologized and optimized for mobile real-time WebGL rendering.
- **License:** Creative Commons Attribution 4.0 International (CC-BY 4.0)
- **Attribution Statement:**
  > "Base 3D human character meshes derived from MakeHuman Community assets licensed under CC-BY 4.0. Copyright (c) MakeHuman Community."
- **License URL:** https://creativecommons.org/licenses/by/4.0/
- **Commercial Redistribution Terms:**
  You are free to share and adapt the material for any purpose, including commercially, under the condition that appropriate credit is given, a link to the license is provided, and changes made are indicated.

---

## 2. Skeletal & Procedural Animations (Mixamo / Adobe)

- **Asset:** `animations.glb`
- **Origin:** Mixamo (Adobe Systems, Inc.)
- **License Terms:** Mixamo End User License / Adobe General Terms of Use
- **Redistribution Terms:**
  Permitted for inclusion and commercial redistribution as embedded runtime assets within compiled interactive software applications and games. Standalone resale, distribution, or extraction of raw animation files (`.anim`, `.fbx`, `.bvh`) is strictly prohibited.

---

## 3. Typography & Fonts

### Inter
- **Copyright:** (c) 2016-2024 The Inter Project Authors (Rasmus Andersson)
- **License:** SIL Open Font License, Version 1.1 (OFL-1.1)
- **Terms:** Permitted to use, study, copy, merge, embed, modify, redistribute, and sell modified and unmodified copies of the Font Software, subject to the condition that the font names are not used as trademarks for derivatives.

### JetBrains Mono
- **Copyright:** (c) 2020 JetBrains s.r.o.
- **License:** SIL Open Font License, Version 1.1 (OFL-1.1)

---

## 4. Open Source Software Dependencies

### Three.js
- **Copyright:** (c) 2010-2024 Three.js Authors (Ricardo Cabello / mrdoob)
- **License:** MIT License

### React Native
- **Copyright:** (c) Meta Platforms, Inc. and affiliates.
- **License:** MIT License

### Expo SDK & Expo Modules
- **Copyright:** (c) 2015-present 650 Industries, Inc. (Expo)
- **License:** MIT License

### React & React DOM
- **Copyright:** (c) Meta Platforms, Inc. and affiliates.
- **License:** MIT License

### NativeWind & Tailwind CSS
- **Copyright:** (c) Mark Lawlor / Tailwind Labs, Inc.
- **License:** MIT License

---

## 5. Non-Commercial Model Isolation Confirmation

Notice regarding research neural talking-head checkpoints:
- **SadTalker System & Pretrained Checkpoints:**
  The SadTalker codebase and its non-commercial model weights (`sadtalker_checkpoints/`, `.pth`, `.safetensors` under the S-Lab Non-Commercial License) are strictly **excluded** from the mobile application distribution.
- **Mobile Facial Animation Pipeline:**
  The mobile application animates facial speech and emotions using hardware-accelerated 3D morph targets (blendshapes) driven by real-time audio volume levels and procedural sine-wave springs on the client GPU, completely avoiding non-commercial deep-learning checkpoints in production binaries.
