# Stool v02 arch-correction evidence

These are diagnostic asset iterations, not gameplay validation.

- `arch-before/`: the preserved 4,662-triangle fixed candidate before local arch correction, its detailed mesh, Blend, previews, measurements and SHA-256 inventory.
- `arch-before-diagnosis/`: the former runtime mesh versus its detailed mesh under identical clay/reflection lighting. The shoulder crease occurs in both, identifying a shape/correspondence problem before reduction.
- `arch-comparison/`: a rejected correction extending the new wall fit down the whole leg. The arch improved, but the feet became angular. Its comparison JSON identifies the exact rejected GLB hash.
- `arch-comparison-local/`: old fixed candidate versus the selected local correction. The correction is restricted to the side-arch shoulders and blends back into the existing feet. Compare beauty, clay and reflection views at side and three-quarter angles.
- `archfix/`: the selected isolated correction's GLB comparison surface, reimported previews, measurements and metadata audit. Its runtime SHA-256 is `1df13475185623882db1d63d99cc52f9ebff03cc40d62fb5136672a4f7515e55`.

The selected bytes were promoted to the normal v02 candidate/Blend/quality paths. `scripts/refine-bath-stool-v02.py` defaults to the local correction. The former arch method requires an explicit `--legacy-arch` argument and writes separate legacy paths.
