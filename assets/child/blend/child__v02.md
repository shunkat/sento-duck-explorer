# Child v02 refinement

This is a free Blender 5.2.4 source-derived refinement of the preserved Meshy 6 Lite output. The original reference, raw GLB and v01 Blend are unchanged. The saved scene contains `SOURCE_RAW_UNMODIFIED`, separate detailed clothed/bath masters, and the two runtime outfits. No primitive replacement character, new generation, rig or animation is claimed. Derived geometry and textures remain CC BY 4.0.

## Reproduction and corrections

Run `Blender --background --python scripts/refine-human-models.py -- child` from the repository. It writes the private candidate and these review files; it does not publish to `public/models`.

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
| outfit_bath | 5600 | 3046 | 1.199996 | 0.453683 | 3.302 |
| outfit_clothed | 5600 | 2977 | 1.199996 | 0.462424 | 3.298 |

The regional count uses polygon center Z > 0.72h for consistent reduction diagnostics; it is not an anatomical segmentation. Exact bounds, bottom-center correction and Blender-space socket coordinates are in `../quality/existing-review/measurements.json` (glTF maps Blender XYZ to XZ-Y). All four runtime variants across child/adult fit the existing 11,400 visible-triangle total when one outfit is selected per character. The inspection weld has zero non-manifold edges; stored UV splits remain intact.

## Provenance and checksums

- Raw GLB SHA-256: `f45aa64598d36bce85e3556859200d7a2fd74ed3ec9cbfa933a54c8b0ed499cb`
- Reference PNG SHA-256: `339c6ac4e5ccb220ca36a5e5595ba450d9634a9c64a55244b4341d5060a92b99`
- Runtime GLB SHA-256 after PNG metadata cleanup: `e69c7427abf6104526ac34072c57d8775adb27da4435ab53dd0a5c5ed29ef141` (724184 bytes)
- Saved v02 Blend SHA-256: `3e84c6c847403bf2c6b93ee5262f37262cceeba4a15d655680e30118dd9f1bbc`

The actual Blend was reopened, all generated textures were confirmed packed, the actual GLB was reimported, and its two embedded PNGs were confirmed 1024×1024. Structured preview PNG metadata and a private uncompressed Blend copy were audited for common private-path, email and credential patterns: PASS. This is heuristic hygiene, not an exhaustive confidentiality guarantee. See `../quality/existing-review/metadata-audit.json`.

Remaining limits: this remains a reduced static toy model derived from one generated view; some hair-lock facets, subtle garment folds and small bake softness remain at close inspection. The free source's hand/foot anatomy is stylized. The shared fixed-camera comparison and independent visual review determine acceptance; this note does not self-approve promotion or gameplay.

## Final independent-review correction

Independent review found a skin-colored central fringe panel: source X≈−0.04 m ended at Z≈0.986 m while the earlier color mask was near Z≈1.02 m. The mask was aligned to the actual fringe; face overlays are now limited to skin. Side/back hair boundaries were also aligned. The side/back lower hair cut remains simplified.

The final texture-only revision preserves both named meshes’ POSITION, NORMAL, TEXCOORD_0 and index accessors byte-for-byte from `93d549ec7a63156f39b665944925964a2c96664adcc0652a65d93992a60c86e4`. See `../quality/existing-review/texture-only-proof.json`.

Final PNG hygiene: embedded EXIF chunks were removed after export without changing any retained PNG chunk (including IHDR/IDAT), geometry buffer view, material or transform. The fixed inspection images were rendered from `31d2ea528cd03e9314e184a75ee1e2c85956254a8f82290eaa09687fd539d172`; the final runtime hash above differs only by this metadata cleanup. The exact proof is [recorded here](../../quality/existing-models/embedded-png-sanitization.json).
