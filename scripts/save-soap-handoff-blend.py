"""Retain an editable reimport of the exact supplied soap, without re-exporting it.

Run from the repository root:
  blender --background --python-exit-code 1 --python scripts/save-soap-handoff-blend.py

This recovers editable mesh/material data from the GLB, not the absent original
authoring file, modifier history or construction script. The supplied GLB stays
the runtime authority. Existing editable outputs are never overwritten.
"""
import argparse
from array import array
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys

import bpy

SOURCE = Path("public/models/soap.glb")
EXPECTED = "8875676814433e81ddb46cda32be494a5cc047aa6462064fdefe33ec3e763c45"
OUTPUT = Path("assets/sento_small_items/blend/soap__v02_reimport.blend")
REPORT = Path("assets/sento_small_items/quality/soap-v02/editable-source-audit.json")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def digest_numbers(code, values):
    return sha(array(code, values).tobytes())


def facts():
    objects = list(bpy.context.scene.objects)
    assert len(objects) == 1 and objects[0].type == "MESH"
    obj = objects[0]
    mesh = obj.data
    mesh.calc_loop_triangles()
    assert not obj.modifiers and not obj.animation_data
    assert not bpy.data.cameras and not bpy.data.lights and not bpy.data.images
    positions = [obj.matrix_world @ vertex.co for vertex in mesh.vertices]
    assert all(math.isfinite(value) for point in positions for value in point)
    # Blender imports Y-up glTF as Z-up. Report bounds back in the GLB frame.
    gltf_positions = [(point.x, point.z, -point.y) for point in positions]
    minimum = [min(point[axis] for point in gltf_positions) for axis in range(3)]
    maximum = [max(point[axis] for point in gltf_positions) for axis in range(3)]
    dimensions = [high - low for low, high in zip(minimum, maximum)]
    assert all(abs(actual - expected) < 1e-6 for actual, expected in zip(dimensions, (0.30, 0.08, 0.18)))
    assert abs(minimum[1]) < 1e-6
    assert all(abs(minimum[axis] + maximum[axis]) < 1e-6 for axis in (0, 2))
    assert len(mesh.loop_triangles) == 284
    degenerate = sum(triangle.area <= 1e-14 for triangle in mesh.loop_triangles)
    assert degenerate == 0
    material_facts = []
    for material in mesh.materials:
        assert material.use_nodes and material.node_tree
        shader = next(node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
        assert not any(node.type == "TEX_IMAGE" for node in material.node_tree.nodes)
        material_facts.append({
            "name": material.name,
            "base_color": list(shader.inputs["Base Color"].default_value),
            "metallic": shader.inputs["Metallic"].default_value,
            "roughness": shader.inputs["Roughness"].default_value,
            "use_backface_culling": material.use_backface_culling,
        })
    assert len(material_facts) == 2
    normals = [value for normal in mesh.corner_normals for value in normal.vector]
    assert all(math.isfinite(value) for value in normals)
    return {
        "object_name": obj.name,
        "mesh_name": mesh.name,
        "matrix_world": [value for row in obj.matrix_world for value in row],
        "vertices": len(mesh.vertices),
        "polygons": len(mesh.polygons),
        "triangles": len(mesh.loop_triangles),
        "degenerate_triangles": degenerate,
        "bounds_gltf_m": {"min": minimum, "max": maximum},
        "dimensions_gltf_m": dimensions,
        "local_positions_sha256": digest_numbers("f", (v for p in mesh.vertices for v in p.co)),
        "polygon_vertices_sha256": digest_numbers("I", (v for p in mesh.polygons for v in p.vertices)),
        "polygon_sizes_sha256": digest_numbers("I", (len(p.vertices) for p in mesh.polygons)),
        "material_indices_sha256": digest_numbers("I", (p.material_index for p in mesh.polygons)),
        "corner_normals_sha256": digest_numbers("f", normals),
        "materials": material_facts,
        "images": 0,
        "cameras": 0,
        "lights": 0,
    }


def audit_binary(path):
    raw = path.read_bytes()
    if raw.startswith(b"BLENDER"):
        decoded = raw
    else:
        zstd = shutil.which("zstd")
        assert zstd, "zstd is required for the compressed Blender metadata audit"
        decoded = subprocess.run([zstd, "-d", "-q", "-c", str(path)], check=True, capture_output=True).stdout
    assert decoded.startswith(b"BLENDER")
    patterns = {
        "personal_absolute_paths": rb"/(?:Users|home|private)/[^\x00\r\n]+",
        "private_operator_paths": rb"(?:\.local|\.codex|\.private)/[^\x00\r\n]+",
        "file_uris": rb"file://[^\x00\r\n]+",
        "email_addresses": rb"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}",
    }
    counts = {name: len(re.findall(pattern, decoded)) for name, pattern in patterns.items()}
    assert not any(counts.values()), "Editable metadata contains a private marker (values redacted)"
    return {"decompressed_bytes": len(decoded), "redacted_match_counts": counts,
            "scope": "Heuristic private-path/email scan plus explicit scene/resource inspection; not a universal metadata guarantee"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--report", type=Path, default=REPORT)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    for path in (args.output, args.report):
        assert not path.is_absolute() and ".." not in path.parts, "Use repository-relative output paths"
        assert not path.exists(), "Existing output is preserved; select a new path"
    assert args.output.suffix == ".blend" and args.report.suffix == ".json"
    assert len({SOURCE.resolve(), args.output.resolve(), args.report.resolve()}) == 3
    original = SOURCE.read_bytes()
    assert sha(original) == EXPECTED, "Import only the reviewed supplied soap GLB"
    length = struct.unpack_from("<I", original, 12)[0]
    gltf = json.loads(original[20:20 + length])
    assert len(gltf["nodes"]) == 1 and gltf["nodes"][0] == {"mesh": 0, "name": "soap"}
    assert not gltf.get("images") and not gltf.get("textures")
    assert not gltf.get("cameras") and not gltf.get("animations") and not gltf.get("skins")
    assert all("uri" not in buffer for buffer in gltf["buffers"])
    predecessors = [Path("assets/sento_small_items/blend") / name
                    for name in ("soap__v01.blend", "soap__v01.glb")]
    predecessor_hashes = {path.as_posix(): sha(path.read_bytes()) for path in predecessors}

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE.resolve()))
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0
    reference = bpy.data.texts.new("SOURCE_REFERENCES.txt")
    reference.write(
        "Soap v02 - editable GLB reimport\n\n"
        "Imported from public/models/soap.glb, SHA256 " + EXPECTED + "\n"
        "Reimport procedure: scripts/save-soap-handoff-blend.py\n"
        "The supplied runtime GLB is retained unchanged and is the export authority.\n"
        "This file contains editable imported mesh/material data only.\n"
        "Original v02 authoring Blend, construction script and modifier history were not supplied.\n"
        "No original authoring history or byte-identical GLB re-export is claimed.\n"
        "The archived v01 source is historical, not the construction source of v02.\n"
        "Project-held geometry and material rights retain the repository MIT license.\n"
    )
    for screen in bpy.data.screens:
        for area in screen.areas:
            for space in area.spaces:
                if space.type == "FILE_BROWSER" and space.params:
                    space.params.directory = b"/" * 1023
                    space.params.directory = b"//"
    bpy.context.scene.render.filepath = "//"
    bpy.context.preferences.filepaths.save_version = 0
    before = facts()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output.resolve()), compress=True)
    bpy.ops.wm.open_mainfile(filepath=str(args.output.resolve()))
    after = facts()
    assert before == after, "Saved/reopened geometry, topology, normals, materials or bounds changed"
    assert SOURCE.read_bytes() == original, "Runtime GLB changed"
    assert all(sha(Path(path).read_bytes()) == digest for path, digest in predecessor_hashes.items())
    report = {
        "date": "2026-11-23",
        "blender_version": bpy.app.version_string,
        "source_glb": SOURCE.as_posix(),
        "source_glb_sha256": EXPECTED,
        "editable_reimport": args.output.as_posix(),
        "blend_sha256": sha(args.output.read_bytes()),
        "blend_bytes": args.output.stat().st_size,
        "reopened_geometry_topology_normals_materials_bounds_identical": True,
        "source_glb_unchanged": True,
        "previous_sources_unchanged": predecessor_hashes,
        "original_authoring_source_recovered": False,
        "byte_identical_glb_reexport_claimed": False,
        "facts": after,
        "binary_metadata_audit": audit_binary(args.output),
        "scope": "Editable GLB reimport and offline save/reopen audit only; no runtime asset re-export, GPU, game or normal-input verification",
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print("SOAP_EDITABLE_SAVED", json.dumps({"sha256": report["blend_sha256"],
          "bytes": report["blend_bytes"], "triangles": after["triangles"], "save_reopen_verified": True}))


if __name__ == "__main__":
    main()
