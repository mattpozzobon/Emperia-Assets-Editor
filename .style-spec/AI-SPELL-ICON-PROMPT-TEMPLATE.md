# Prompt universal — Emperia Spell Icon

Substituir somente os campos entre chaves.

```text
Use case: stylized-concept
Asset type: one production 32x32-style spell icon for Emperia.

Input images:
Image 1 is the strict class-base style anchor. Copy its softness, low contrast, background treatment, object scale, low detail density, restrained glow, and native-32x32 readability.
Image 2 is a palette swatch only. Use its colors, but do not copy any composition or rendering style from it.
Optional Images 3–5 are approved final 32x32 spells from the same class-base and reinforce the exact style target.

Primary request: create "{SKILL_NAME}" for the {CLASS_NAME} class.
Gameplay meaning: {ONE_SENTENCE_MECHANIC}.
Subject: show only {ONE_SIMPLE_MOTIF}. Use no more than one supporting {ARC_OR_IMPACT_OR_SUPPORT} and at most two tiny highlights.

Exact graphic style: classic small MMORPG raster icon painted directly for native 32x32. Soft compressed gradients, slightly blurry antialiased edges, muted values, moderate contrast, subtle grain, restrained localized glow, chunky simple silhouette, and extremely low internal detail. The large source must intentionally remain simple and soft. Do not add detail that would disappear at 32x32.

Composition: one centered symbol occupying 60–70% of the square, with dark padding equivalent to at least 3 final pixels on every side. Complete subject fully inside the canvas. Edge-to-edge opaque dark background.

Palette: use only the supplied class swatch. {PALETTE_NOTE}.

Hard invariants: final intent is opaque RGB PNG at exactly 32x32. No alpha or transparency. No border, frame, bevel, rounded card, UI chrome, text, letters, numbers, logo, or watermark.

Reject these styles: realistic object, detailed metal, material texture, 3D render, vector logo, glossy mobile-game art, card-game illustration, cinematic lighting, high contrast, excessive bloom, detailed character, full scene, modern blocky pixel art, large square pixels, or an image brighter, sharper, cleaner, or more detailed than the supplied 32x32 style anchor.
```

## Instrução de revisão

Usar após a primeira geração:

```text
The result does not yet match the supplied 32x32 anchor. Simplify rather than embellish. Remove material detail, realistic lighting, sharp edges, extra particles, and large bloom. Reduce the subject to one chunky emblem, lower the contrast and brightness, increase dark padding, and match the anchor's softness and visual density exactly. Preserve only the gameplay motif and supplied palette.
```
