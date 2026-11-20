# Adult clothed reference

`adult__ref_threequarter_v01.png` is an original reference for the adult character, generated on 2026-11-20 with OpenAI's built-in image-generation tool through Codex. The exact image model version was not exposed. It is a single full-body front three-quarter view with an alpha channel, intended for Image to 3D. It is not a 3D model, a completed costume variant, or an in-game billboard.

## Provisional design

The target game height is 1.7 m; this is a later 3D scale target, not a measurement encoded in the PNG. The rounded toy figure has short brown hair, simple dark oval eyes, bare feet, a plain teal T-shirt and charcoal knee-length shorts, empty hands and a neutral slightly open A-pose. Arms are separated from the torso so a hand socket can be added later. The final refinement reduced sleeve/shorts bulges and removed rolled hems and decoration. These visual and pose details are provisional implementation choices, not specific user-approved character designs.

Only the **clothed** reference image exists here. On 2026-11-20, the image was converted with Meshy 6 Lite and its generated geometry adjusted in Blender. The bathing 3D variant is a derivative of that same mesh: an opaque, simplified doll silhouette without sexual features. It is not a separate reference-image generation and does not depict swimwear or a towel to be immersed in a sento bath. The asset and integration status are recorded in [the asset README](../README.md) and `assets/ledger.csv`.

## Generation and rights

The first generation used an original project prompt. A second built-in image edit used only that newly generated image to simplify clothing and refine the cutout. No existing person, character, logo, facility, third-party image or artist style was supplied. The first-generation input's SHA-256 was `736b4888c72bd68774741265029c65ea80ca9136c9dc45ef260e55fabd5734e3`; the selected final PNG is copied byte-for-byte from the second tool output.

The project releases its rights to this reference under the repository's MIT license. [OpenAI's Terms of Use, Content](https://openai.com/policies/terms-of-use/) assign output rights to the user as between the parties and to the extent permitted by law. This does not guarantee uniqueness or copyright protection. Terms were checked on 2026-11-20. Later Image to 3D output must have its own service, license, source and modification record; the reference's MIT treatment does not override that service's output conditions.

OpenAI generation provenance in the PNG's `caBX` metadata is preserved. The original output remains unmodified. The image was uploaded for Image to 3D on 2026-11-20; generated and Blender-adjusted files are recorded separately in `assets/ledger.csv`. Their completion does not imply game integration.

## Inspection

- PNG RGBA, 8 bits per channel, 1024 × 1536, 1,395,532 bytes.
- SHA-256: `6ff06f0fde49a99e27edb785dd6318354954ee9567a299e0f29b4cb3ad19b1d0` (also in `SHA256SUMS`).
- Visual inspection: one fully clothed figure; complete head, both hands and both bare feet; no text, logo or added object.
- Alpha inspection: 1,088,241 pixels have alpha 0; sampled background and gaps are transparent. The generated subject is nearly opaque (alpha mostly 253–254), with antialiasing at the edge. Some previews show color in fully transparent pixels; the alpha channel is retained.
- Limited metadata scan: no private filesystem-path or secret-token pattern findings in metadata chunks. This is not a guarantee that an automated scan detects all sensitive information.
- Image to 3D and both Blender garment-state variants are exported; real gameplay and runtime outfit-switching checks remain separate integration work.

## Exact initial prompt

```text
Use case: stylized-concept.
Asset type: original single-character reference image for Image to 3D conversion, for the family-friendly game Sento Duck Explorer.
Primary request: One fully clothed human ADULT caregiver, a friendly rounded matte toy figure, shown alone in a neutral slightly open A-pose. This is the clothed costume reference, not a bathing scene.
Subject: clearly adult proportions appropriate to a character about 1.7 metres tall in the game, longer limbs and a smaller head-to-body ratio than a child, while retaining soft rounded toy shapes. Short dark-brown hair, simple dark oval eyes with a tiny white highlight and a small gentle smile. Simplify the face like a rounded yellow toy duck companion: no detailed skin texture, no realistic pores, no eyelashes or facial hair. Plain teal T-shirt and plain knee-length charcoal-grey shorts, bare feet, no accessories. Both arms slightly away from the torso, hands relaxed and empty with readable rounded fingers, legs and feet slightly separated. At least one hand must remain unobstructed so a carry socket can be added later in 3D.
Style/medium: polished original 3D toy character render, smooth softly rounded shapes, matte clay/plastic, simple large colour blocks, restrained seams, warm soft studio lighting.
Composition: single full body from crown to both toes, centred, front three-quarter view with the whole front and one side clearly visible; low perspective distortion; straight upright stance, complete silhouette with ample clear margin. No pedestal and no floor.
Background: genuinely transparent alpha. No opaque or checkerboard background.
Constraints: one human adult only; no duck or other figure; no scale chart or comparison; no text, logos, watermarks, existing IP or recognisable person. Non-explicit, fully covered torso and upper legs, no bathing or underwear. Keep arms separated from the body, both feet and hands visible; no props, no shoes, no dramatic pose.
```

## Exact refinement prompt

Input: the original first-generation adult image identified above. Tool option: `transparent_background=true`.

```text
Use case: precise-object-edit. This is a refinement of the provided original character reference for Image to 3D, not a new character design.
Keep exactly this single character, age/proportions, face, short brown hair, clothing colors, bare feet, frontal three-quarter angle and neutral slightly open A-pose. Keep both hands empty and separated from the torso, all toes and the complete head visible.
Change only these production details: (1) Remove ALL of the soft coloured halo, bloom, haze, vignette and background around the silhouette. The figure itself must be solid and fully opaque; all empty space around it, between arms and body and between legs must be truly transparent. Clean crisp cutout edge, with only a fine antialiasing edge. No floor, cast shadow, glow or backdrop. (2) Simplify the plain T-shirt and knee-length shorts into snug smooth toy forms, keeping modest normal fit, complete torso and upper-leg coverage. Reduce bulging sleeves and shorts hems. No rolled cuffs, no trim, no folds, no accessories or decoration. Preserve the existing T-shirt and knee-length shorts; do not remove any clothing or change into swimwear.
Retain softly rounded matte clay/plastic 3D toy style, simple oval dark eyes, friendly tiny smile. One character only; no text, logos or watermark.
```
