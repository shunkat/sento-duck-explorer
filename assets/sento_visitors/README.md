# Independent sento visitors

These three background adults use the free **Quaternius Universal Base Characters — Standard** male body, eyes, eyebrows and hairstyles. They contain no geometry, UVs or textures from the playable father. Reception uses short dark hair and a navy uniform; the standing visitor has gray parted hair; the seated visitor has a beard, broader middle and hands resting over the knees. The existing seven placements share these three static roles.

The subsequent [tattooed visitor variant](tattoo/README.md) retains these original
models and adds an appearance for the existing standing slot. The original
three-role numbers and inspections below remain their historical records.

The comparison [father-and-distinct-visitors.png](quality/father-and-distinct-visitors.png) uses the actual father bath outfit only for a read-only render beside the three exported visitors, with the same camera, meter scale and lighting. [comparison.json](quality/comparison.json) records the input hashes. This image does not change the father model.

Comparison image: **CC BY 4.0 composite including the Meshy-derived father**; see [ATTRIBUTION.md](ATTRIBUTION.md) for credits, license links and the change notice. The NPC models themselves retain CC0 source / MIT project modifications.

## Source and rights

- Author and original pack: [Quaternius](https://quaternius.com/packs/universalbasecharacters).
- Original license: CC0 1.0. The project modifications are MIT, as identified separately in each GLB's `source_license` and `license` fields.
- The free Standard edition supplies the superhero male body and selected hair; this work does not claim or use the paid Regular/Teen source bodies.
- Unmodified selected source bytes and checksums are under [quaternius_universal_base](../public_sources/quaternius_universal_base/source.json). The original archive remains identified by SHA-256 in that record.
- Two upstream image URI aliases are resolved only in private import copies. The original glTF files are unchanged. No paid generation, subscription or character service was used.

## Production choices

The source body is welded at glTF vertex seams before any smoothing. This prevents separated UV islands from shrinking apart at the shoulders or waist. Shoulder and torso relief are relaxed, the head is moderately enlarged, the cheeks are widened, the eyelid opening is softened, and the eyebrows are flattened. Source hair is kept separate from the scalp during reduction. Hands are shortened and protected, and eyes, brows and hairstyles have explicit triangle allocations. The seated pose also receives local shoulder smoothing to remove the fold produced by the raised arms.

Source body color and muscle normal maps are not used on the runtime visitors. Bathing bodies are featureless toy surfaces. A deterministic 512-pixel atlas gives the original eye image a 240 × 240-pixel region, with separate flat color regions for skin and hair. The reception fabric uses continuous height UVs, so the neckline and cuffs do not inherit jagged polygon material boundaries. Intentionally shared flat-color UV regions are not facial texture overlaps. Each exported model has one mesh, one material and one embedded PNG, with only position, normal and one UV attribute.

The three editable projects in `blend/` retain the imported source objects as `SOURCE_UNMODIFIED_*`, detailed derived pieces as `DETAIL_*`, and the final runtime mesh. All textures are packed. The original imported geometry is checked after reopening each project and compared with a fresh import. The projects contain no father model.

## Fixed near exports

| Role | Triangles | GLB bytes | Width × height × depth, meters |
| --- | ---: | ---: | --- |
| Reception | 1,593 | 84,176 | 0.459 × 1.600 × 0.276 |
| Standing bath visitor | 1,594 | 83,996 | 0.451 × 1.600 × 0.271 |
| Seated bath visitor | 1,794 | 89,504 | 0.488 × 1.301 × 0.589 |

Exact hashes, bounds and vertex counts are in [measurements.json](quality/measurements.json). These numbers describe the near exports; the separate distance-LOD producer records the far meshes. Static geometry uses meters, +Y up, +Z forward, identity transforms and feet at Y = 0.

The seated model uses the existing bench placement frame, with its local geometry moved **+0.32 meters along glTF Z** and its support anchor at `(0, 0.45, 0.14)`. The origin is this existing placement frame, not a newly recentered foot-bounds origin. The world slot transforms remain unchanged. The lowest actual support vertex is at Y = 0.450019985 meters. Sixteen upward rays sample the curved rear thigh/seat area, with a lowest sampled height of 0.451304078 meters; contact occurs between those sample rays. The model preserves the existing 0.9 world scale and 90-degree yaw; the corresponding bench surface is 0.405 meters. The actual exported model and a neutral support plate are shown in [seat-contact.png](quality/npc_seated_seat-contact.png). This inspection-only plate uses the actual bench depth of 2/3 local meters and the actual board thickness (local Y 0.377778 to 0.45); it is not part of the candidate GLB or the world.

The earlier centered model put the lower legs inside the actual bench footprint. The placement-frame correction moves them beyond its conservative front edge at local Z = 1/3 meter. Five cross sections through the actual board-height band find a minimum rear-leg clearance of 47.77 mm. Full-world geometry and the actual placed-scene render remain the integration checks.

The sixteen sampled support rays do not prove zero overlap everywhere. A separate check across the actual inspection plate footprint found no exported vertices more than 5 mm below its top. The final local audit reports zero overlap for both the sampled vertices and complete triangles clipped against the conservative continuous board interior. Six underside vertices were raised by at most 10.92 mm to remove sloping thigh triangles that the earlier ray/vertex-only checks missed. The exact region and counts are recorded under `seat_contact.support_plate_vertex_audit` in the measurements. The actual three-board world geometry and all five placed visitors are checked separately during integration.

## Verification and limits

Each exact candidate GLB was reimported and rendered from front, three-quarter, side and back, plus front and three-quarter face views. The independent asset review found no required shape corrections in the fixed near versions. Low-polygon facets remain on the knees, fingers and hair; these are budgeted background adults, not hero close-up replacements. The combined mesh contains the source's intentionally open eye, eyebrow and hair surfaces, so the recorded nonmanifold edge count is not zero. Zero degenerate triangles and finite geometry were verified.

[audit.json](quality/audit.json) distinguishes the scopes of the checks: unchanged original source files; reopened source geometry and packed images; literal private-marker scanning of the uncompressed Blend files; and runtime PNG/text metadata. Runtime PNGs and inspection renders have no text or EXIF chunks. The unchanged upstream roughness PNG retains only its original EXIF resolution tags; the source metadata record describes that separately. This is a scoped audit, not an exhaustive confidentiality guarantee.

No normal-input playthrough, production publication or full-world placement approval is claimed here. World placement, passage clearance, distance LODs and integration are handled by the separate replacement workflow. Earlier rejected trials are kept privately and are not presented as final quality evidence.

## Rebuild

From the repository root, using Blender 5.2.4:

```sh
Blender --background --python-exit-code 1 --python scripts/build-distinct-sento-npcs.py
Blender --background --python-exit-code 1 --python scripts/build-distinct-sento-npcs.py -- --audit
Blender --background --python-exit-code 1 --python scripts/build-distinct-sento-npcs.py -- --comparison
```

`--role npc_seated` (or another role) rebuilds only that candidate. Candidate output goes to the private `.local/distinct-sento-npcs/models/` directory. The script does not replace `public/`, update the world, start a server or deploy. Fixed candidate hashes must be handed off before any rebuild during integration.
