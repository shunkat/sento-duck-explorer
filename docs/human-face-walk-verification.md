# Human face and walking correction

Work starts from the published `3f57ed22cbc7ccca7198592d722ba3510d33e9ba`
environment release. The user's requested scope is the Adult's blurred face
and moving arms and legs while the human characters walk. Codex owns this
asset and view-layer correction; the existing Kiro gameplay remains the base.
The approved free workflow and main/Pages publication path continue to apply.

## Face diagnosis

The v02 Adult source moves its body/head depth by 0.10 m. The face-color
coordinates account for that offset, but the face UV selection uses the
unadjusted position threshold. In the clothed outfit, 76 of 126 inspected eye-region triangles fall outside
the dedicated face patch; in the bath outfit, 77 of 135 do so. Those triangles
instead use small body-atlas islands. This loses
facial resolution and introduces discontinuities at the eyes and eyebrows.

The correction puts the front facial surface into one coherent patch,
rebakes both outfits, and preserves the original geometry, 5,800 triangles per
outfit, 1024-square images, source provenance and attachments. Increasing
texture dimensions alone would leave the allocation error in place.

## Motion and acceptance scope

Both human outfits use the same named skeleton. Movement comes from
actual position differences rather than pressed keys, so a character blocked
by a wall does not walk in place. The right hand keeps its support pose when holding
objects or Duck; outfit changes and movement keep the towel attached.

Required checks for this change are actual exported mesh deformation, face
closeups, both clothing variants, free walking, stopping, held towels/items,
Duck carrying, reset/teleport behavior and the existing scene budget. Browser
diagnostics inject these local states using the real GameScene and renderer.
They are not normal-input route completion or the full playthrough that the
user has deferred. Exact final revisions, results and publication evidence
are recorded below once verified.


## Fixed implementation and evidence

| Runtime model | SHA-256 | Bytes | Triangles per visible outfit |
| --- | --- | ---: | ---: |
| Child v03 | `32e09215c68721545ff240b57927d53f29e01b896c865b04e2529d6d3034ca88` | 906,716 | 5,600 |
| Adult v03 | `0ec65252a0554fcefcf36b55d3871788367440e215d40fb8040fbbf691bcb867` | 960,660 | 5,800 |

The original v02 GLBs are archived alongside their original Blend files.
[Face production evidence](../assets/adult/blend/adult__face_uv_v03.md) records
complete eye-region coverage, zero sampled UV overlap and identical geometry,
topology, custom normals and reference-position hashes. An initial projected
face patch was rejected for folded-ear overlaps; the accepted angle-based
unwrap and corrected ear mask remove those artifacts. Child's two embedded
PNG byte sequences are identical to v02. All 130 completed ledger hashes match.

[The rig record](../assets/human_walk/README.md) retains editable sources,
13 shared bone names, normalized four-influence weights and reimported-GLB
measurements. Both outfits retain their geometry counts, two total materials
and two embedded 1024-square images. Palm-to-hand-socket distances stay around
3.3 mm (Child) and 8.0 mm (Adult). Representative Blender poses were inspected;
those are separate from the final runtime gait, whose arm equations include
speed and blend weight. No new purchased asset, service or third-party clip
was introduced. Model derivatives remain CC BY 4.0; motion code is MIT.

Validation on the final local source/assets:

- **291 tests / 28 files passed**. The eight actual-rig cases run both human
  GLBs at 2.5 and 4.5 m/s through full cycles, checking real skinned vertices,
  support-foot height, head-relative face stability, both outfits and live
  GameScene towel/label/carry/coin placement. Movement/stop/block/teleport and
  high-frame-rate sampling have separate gait tests.
- Pages-base production build passed. The existing bundle-size warning remains.
  The pass-aware scene-budget checks remain within 60,000 triangles; the
  registered 18-model payload is 9,150,580 bytes, below 12 MB.
- Independent code/acceptance review found **zero required findings**. It
  reviewed the runtime, tests and Blender producer scripts and reused the
  author checks rather than repeating the suite.
- The release owner inspected the actual public GLBs in GameScene on Chrome
  at 1280 × 720/DPR 1. Adult's face is clear under the actual game lighting.
  Human walk phases, opposing arms/legs, knee bends, both outfits, 2.5/4.5 m/s,
  held towels, both carriers and settling back to rest were observed. Limb
  inspection used a private flat staging floor outside the level to avoid
  buildings concealing feet; that floor is not in the runtime build. No
  warning/error logs were captured. These are injected local diagnostics,
  not an input-driven route test or a new performance benchmark.

Normal-input play remains deferred. Authored drying, pickup and carry-transition
clips remain open; this change supplies distance-driven skeletal walking,
rest blending and held-arm constraints, not that entire motion set.

## Publication hygiene

The staged source/index scan passed with 2,312 inspected files and zero
findings. The local distribution scan passed with 47 inspected files and zero
findings; every model/license file and shared notice matches the source bytes.
The source scanner is heuristic and excludes binary payload inspection. The
separate Blender/GLB/PNG audits are recorded with the face and rig sources.
All 73 changed files are under 50 MB each. No outgoing history or new live
artifact is claimed, because this batch is still local.

## Integration status

The user requested waiting if this change overlaps another ongoing task.
The separate growth-system revision changes character and item/view behavior,
so this verified batch is retained on `fix/human-face-walk` until that work is
complete. Main and the deployed environment release remain unchanged. Before
integration, compare its final view contracts with this branch, resolve the
combined diff and rerun affected checks; do not claim this branch's checks
cover a later growth-system merge. No new deployment is claimed here.
