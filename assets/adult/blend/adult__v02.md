# Adult v02 refinement

This is a free Blender 5.2.4 source-derived refinement of the preserved Meshy 6 Lite output. The original reference, raw GLB and v01 Blend are unchanged. The saved scene contains `SOURCE_RAW_UNMODIFIED`, separate detailed clothed/bath masters, and the two runtime outfits. No primitive replacement character, new generation, rig or animation is claimed. Derived geometry and textures remain CC BY 4.0.

## Reproduction and corrections

Run `Blender --background --python scripts/refine-human-models.py -- adult` from the repository. It writes the private candidate and these review files; it does not publish to `public/models`.

- A source-space two-segment arm deformation preserves hand volume and solves the existing hand socket. Shoulder widening has smooth vertical falloff, a rounded shoulder drop, and an explicit neck/head exclusion. The adult body depth offset keeps its static raised hand and the existing carry socket clear of the torso.
- The source nose, cheeks, jaw, ears and hair locks are retained. Only the shallow generated eye, brow and smile relief is relaxed locally, then clean oval eyes, highlights and curved brows/smile are evaluated continuously on the face. This corrects malformed painted eyes without replacing the head.
- Detailed-source positions are reprojected after collapse before color baking. Sleeve planes, collar, shirt hem and shorts hem use source-space masks. Ear-front exclusion cleans the hair/skin boundary. The face has a dedicated UV area. A 4096 emission bake is reduced to the required embedded 1024 texture per outfit, giving small UV islands adequate bake coverage.
- Face, ear, nose, hair-tip, garment-hem and foot regions receive explicit collapse weights; final custom normals are transferred from the detailed surface. The two runtime variants retain one material and one texture each.
- Bath uses only local sleeve, waist and knee garment-seam relaxation. It is an opaque, abstract toy surface, with no anatomical additions or body towel. Both outfits use the same source face and facial color field; their separately reduced topology is not claimed to be vertex-identical.
- The final combined horizontal bounds are centered at the bottom. The old gameplay sockets stay at their original transforms, with proximity to the actual exported hand measured below.

## Rejected iterations and the quality mechanism

The first weighted collapse used high values on important regions and left only **350 triangles above child Z=0.72h** at 5600 total. That candidate was rejected visually: cheeks, ears and hair became large planar triangles. Inverting that strong preference retained 2980 head-region triangles but caused garment ripples. The final factor is 0.015, with local contour weights and measured regional counts. High weights preferentially collapse edges in Blender's Collapse operation; see the [official Decimate Geometry documentation](https://docs.blender.org/manual/en/5.0/modeling/meshes/editing/mesh/cleanup.html). Whole-body smoothing and subdivision-only inflation were not accepted fixes.

Pose experiments that affected outer thighs or the lower head were rejected and replaced with arm-interior bounds plus explicit head exclusion. The final low mesh is reimported from the actual GLB for front, three-quarter, side and face renders in both outfits. The 5600/5800 runtime limits are not relaxed to hide geometry loss. No gameplay or frame-rate claim follows from these asset renders.

## Actual export measurements

| Outfit | Triangles | Triangles above 0.72h | Height m | Shoulder width m | Nearest hand vertex mm |
| --- | ---: | ---: | ---: | ---: | ---: |
| outfit_bath | 5800 | 2299 | 1.700103 | 0.656563 | 8.025 |
| outfit_clothed | 5800 | 2218 | 1.700103 | 0.656090 | 8.025 |

The regional count uses polygon center Z > 0.72h for consistent reduction diagnostics; it is not an anatomical segmentation. Exact bounds, bottom-center correction and Blender-space socket coordinates are in `../quality/existing-review/measurements.json` (glTF maps Blender XYZ to XZ-Y). All four runtime variants across child/adult fit the existing 11,400 visible-triangle total when one outfit is selected per character. The inspection weld has zero non-manifold edges; stored UV splits remain intact.

## Provenance and checksums

- Raw GLB SHA-256: `2ceaee97c85f3e7e50c74b59c295f7b38a315678afc7961cefb3c2730da5d231`
- Reference PNG SHA-256: `6ff06f0fde49a99e27edb785dd6318354954ee9567a299e0f29b4cb3ad19b1d0`
- Runtime GLB SHA-256 after PNG metadata cleanup: `61ce44be0c7547ffc58ca3c3242ff86ed564246b6ca3515c73250e2117286fd2` (739012 bytes)
- Saved v02 Blend SHA-256: `43418e26f3abe3951afa457d8c5daf5557fca6d9162815ab4cc150e211f9b78d`

The actual Blend was reopened, all generated textures were confirmed packed, the actual GLB was reimported, and its two embedded PNGs were confirmed 1024×1024. Structured preview PNG metadata and a private uncompressed Blend copy were audited for common private-path, email and credential patterns: PASS. This is heuristic hygiene, not an exhaustive confidentiality guarantee. See `../quality/existing-review/metadata-audit.json`.

Remaining limits: this remains a reduced static toy model derived from one generated view; some hair-lock facets, subtle garment folds and small bake softness remain at close inspection. The free source's hand/foot anatomy is stylized. The shared fixed-camera comparison and independent visual review determine acceptance; this note does not self-approve promotion or gameplay.

## Final independent-review correction

Independent review found a skin-colored ring on the shorts hem. Original-source BVH profiles measured the actual cuff termination at Z≈0.458–0.466 m across X=0.06–0.16 m, below the earlier Z=0.480 m color cutoff. The final mask follows Z≈0.449+0.10|X| m, keeping the rounded cuff dark gray without a broad paint extension onto the leg.

The final texture-only revision preserves both named meshes’ POSITION, NORMAL, TEXCOORD_0 and index accessors byte-for-byte from `5d196bd94f32e5f1cfda7b73c34e273d06d02d251b1b9876271be29155e5ea62`. See `../quality/existing-review/texture-only-proof.json`.

Final PNG hygiene: embedded EXIF chunks were removed after export without changing any retained PNG chunk (including IHDR/IDAT), geometry buffer view, material or transform. The fixed inspection images were rendered from `ce320d1466191b1c95cf9ce36f2725740b73af02ca6ca2cc6ca59b0dd50c0f8f`; the final runtime hash above differs only by this metadata cleanup. The exact proof is [recorded here](../../quality/existing-models/embedded-png-sanitization.json).
