#!/usr/bin/env python3
"""Replace only the seven embedded background NPCs in a candidate world GLB.

Run from the repository root with Python 3 (no Blender or third-party modules):
  python3 scripts/replace-background-npcs.py

Inputs: assets/sento_environment/blend/sento_environment__v01.glb and six independently authored NPC
GLBs in .local/distinct-sento-npcs/models. Output and its preservation audit stay
in .local/distinct-sento-npcs/world; this script never activates public assets.
The input world is the geometry authority. Architecture, placement, hierarchy,
and non-NPC materials are preserved; obsolete NPC binary payloads are removed.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import re
from pathlib import Path
import struct
import sys

ROLES = {"staff": "npc_staff", "0": "npc_seated", "1": "npc_seated",
         "2": "npc_bath_standing", "3": "npc_seated", "4": "npc_seated",
         "5": "npc_seated"}
NEAR_LIMITS = {"npc_staff": 1600, "npc_bath_standing": 1600, "npc_seated": 1800}
COMPONENT = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2),
             5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
WIDTH = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def json_sha(value):
    return sha(json.dumps(value, sort_keys=True, separators=(",", ":")).encode())


class Glb:
    def __init__(self, path, raw=None):
        self.path = Path(path)
        self.raw = self.path.read_bytes() if raw is None else raw
        require(len(self.raw) >= 28, f"Truncated GLB: {self.path.name}")
        magic, version, length = struct.unpack_from("<4sII", self.raw)
        require((magic, version, length) == (b"glTF", 2, len(self.raw)), "Invalid GLB header")
        size, kind = struct.unpack_from("<I4s", self.raw, 12)
        require(kind == b"JSON", "First GLB chunk must be JSON")
        self.doc = json.loads(self.raw[20:20 + size])
        at = 20 + size
        bin_size, kind = struct.unpack_from("<I4s", self.raw, at)
        require(kind == b"BIN\0" and at + 8 + bin_size == length, "Expected one embedded BIN chunk")
        self.binary = self.raw[at + 8:]
        require(len(self.doc.get("buffers", [])) == 1 and "uri" not in self.doc["buffers"][0],
                "Expected one embedded buffer")
        require(self.doc["buffers"][0]["byteLength"] <= len(self.binary), "Truncated BIN chunk")
        require(not any("uri" in im for im in self.doc.get("images", [])), "External images are forbidden")
        require(not self.doc.get("skins") and not self.doc.get("animations"), "NPCs/world must be static")
        require(not self.doc.get("extensionsRequired"), "Unsupported required glTF extensions")
        for view in self.doc.get("bufferViews", []):
            require(view.get("buffer", 0) == 0 and not view.get("extensions"), "Unsupported buffer view")
            start, length = view.get("byteOffset", 0), view["byteLength"]
            require(start >= 0 and length > 0 and start + length <= len(self.binary), "Invalid buffer view range")

    def view_bytes(self, index):
        view = self.doc["bufferViews"][index]
        start = view.get("byteOffset", 0)
        return self.binary[start:start + view["byteLength"]]

    def accessor_rows(self, index):
        a = self.doc["accessors"][index]
        require("bufferView" in a and "sparse" not in a, "Sparse or missing accessor data is unsupported")
        code, size = COMPONENT[a["componentType"]]
        width = WIDTH[a["type"]]
        view = self.doc["bufferViews"][a["bufferView"]]
        step = view.get("byteStride", width * size)
        offset = a.get("byteOffset", 0)
        data = self.view_bytes(a["bufferView"])
        require(a["count"] > 0 and offset + (a["count"] - 1) * step + width * size <= len(data),
                "Accessor exceeds its buffer view")
        return [struct.unpack_from("<" + code * width, data, offset + i * step) for i in range(a["count"])]

    def accessor_proof(self, index):
        a = copy.deepcopy(self.doc["accessors"][index])
        view_index = a.pop("bufferView")
        # The descriptor and exact payload are compared separately from relocated references.
        view = copy.deepcopy(self.doc["bufferViews"][view_index])
        view.pop("byteOffset", None)
        return {"accessor": a, "buffer_view": view, "payload_sha256": sha(self.view_bytes(view_index))}


def descendants(doc, index):
    result, pending = set(), [index]
    while pending:
        n = pending.pop()
        require(n not in result, "Repeated node/cycle in an NPC subtree")
        result.add(n)
        pending.extend(doc["nodes"][n].get("children", []))
    return result


def node_transform(node):
    return {key: copy.deepcopy(node[key]) for key in ("matrix", "translation", "rotation", "scale") if key in node}


def is_identity(node):
    expected = {"translation": [0, 0, 0], "rotation": [0, 0, 0, 1], "scale": [1, 1, 1],
                "matrix": [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]}
    return all(len(node[k]) == len(v) and all(abs(a-b) <= 1e-7 for a, b in zip(node[k], v))
               for k, v in expected.items() if k in node)


def primitive_accessors(primitive):
    require(not primitive.get("targets") and not primitive.get("extensions"), "Morph/compressed meshes are unsupported")
    return set(primitive["attributes"].values()) | ({primitive["indices"]} if "indices" in primitive else set())


def texture_indices(material):
    result = set()
    def walk(value, key=""):
        if isinstance(value, dict):
            if (key.endswith("Texture") or key == "texture") and "index" in value:
                result.add(value["index"])
            for k, v in value.items():
                walk(v, k)
        elif isinstance(value, list):
            for v in value:
                walk(v)
    walk(material)
    return result


def remap_texture_infos(material, old, new):
    def walk(value, key=""):
        if isinstance(value, dict):
            if (key.endswith("Texture") or key == "texture") and "index" in value:
                require(value["index"] == old, "Candidate uses multiple textures")
                value["index"] = new
            for k, v in value.items():
                walk(v, k)
        elif isinstance(value, list):
            for v in value:
                walk(v)
    walk(material)


def metadata_audit(glb):
    encoded = json.dumps(glb.doc, ensure_ascii=False)
    require(not re.search(r"/(?:Users|home)/[^/\s]+|file://|(?:\.local|\.private)/", encoded),
            "GLB metadata contains a private/local path")
    image_reports = []
    for image in glb.doc.get("images", []):
        if image.get("mimeType") != "image/png":
            continue
        raw = glb.view_bytes(image["bufferView"])
        require(raw[:8] == b"\x89PNG\r\n\x1a\n", "Invalid embedded PNG")
        at, kinds = 8, []
        while at < len(raw):
            require(at + 12 <= len(raw), "Truncated PNG chunk")
            size = struct.unpack_from(">I", raw, at)[0]
            kind = raw[at+4:at+8]
            require(at + size + 12 <= len(raw), "Truncated PNG chunk data")
            require(kind not in {b"tEXt", b"iTXt", b"zTXt", b"eXIf"}, "Embedded PNG has text/EXIF metadata")
            kinds.append(kind.decode("ascii"))
            at += size + 12
        require(at == len(raw) and kinds[-1] == "IEND", "Invalid PNG ending")
        image_reports.append({"name": image.get("name", ""), "text_exif_chunks": [], "chunks": kinds})
    return {"private_paths_in_json": False, "embedded_pngs": image_reports}


def candidate_facts(glb, name, limit, allow_legacy_fixture=False):
    d = glb.doc
    metadata_audit(glb)
    if not allow_legacy_fixture:
        encoded = json.dumps(d, separators=(",", ":"))
        require('"parent_asset":"adult"' not in encoded and "assets/adult/" not in encoded,
                "Candidate still cites the playable father as its source")
    require(len(d.get("meshes", [])) == len(d.get("materials", [])) == len(d.get("textures", [])) ==
            len(d.get("images", [])) == 1, f"{name}: expected one mesh, material, texture and image")
    require(not d.get("cameras") and not d.get("extensions", {}).get("KHR_lights_punctual"), "Candidate has cameras/lights")
    mesh_nodes = [i for i, n in enumerate(d["nodes"]) if "mesh" in n]
    require(len(mesh_nodes) == 1 and d["nodes"][mesh_nodes[0]]["mesh"] == 0, "Expected one static mesh instance")
    parents = {child: i for i, n in enumerate(d["nodes"]) for child in n.get("children", [])}
    n = mesh_nodes[0]
    while True:
        require(is_identity(d["nodes"][n]), f"{name}: apply mesh/ancestor transforms before export")
        if n not in parents:
            break
        n = parents[n]
    root = n
    require(root in d["scenes"][d.get("scene", 0)]["nodes"], "Candidate mesh is outside its active scene")
    primitives = d["meshes"][0]["primitives"]
    require(len(primitives) == 1, "Candidate must have one primitive")
    p = primitives[0]
    require(p.get("mode", 4) == 4 and "indices" in p, "Candidate must use indexed triangles")
    require(set(p["attributes"]) == {"POSITION", "NORMAL", "TEXCOORD_0"},
            "Candidate must have POSITION, NORMAL and TEXCOORD_0 only")
    require(p.get("material") == 0, "Candidate must use its sole material")
    primitive_accessors(p)
    require(d["accessors"][p["attributes"]["POSITION"]]["componentType"] == 5126, "Positions must be float32")
    positions = glb.accessor_rows(p["attributes"]["POSITION"])
    require(all(len(row) == 3 and all(math.isfinite(v) for v in row) for row in positions), "Invalid positions")
    for semantic in ("NORMAL", "TEXCOORD_0"):
        rows = glb.accessor_rows(p["attributes"][semantic])
        require(len(rows) == len(positions) and all(all(math.isfinite(v) for v in r) for r in rows), "Invalid vertex attribute")
    indices = [row[0] for row in glb.accessor_rows(p["indices"])]
    require(len(indices) % 3 == 0 and all(0 <= i < len(positions) for i in indices), "Invalid triangle indices")
    triangles = len(indices) // 3
    require(triangles <= limit, f"{name}: {triangles} triangles exceeds {limit}")
    lo = [min(v[i] for v in positions) for i in range(3)]
    hi = [max(v[i] for v in positions) for i in range(3)]
    require(all(hi[i] > lo[i] for i in range(3)), "Candidate has empty bounds")
    require(abs(lo[1]) <= .002, f"{name}: feet must rest on local Y=0")
    mat = d["materials"][0]
    require(mat.get("alphaMode", "OPAQUE") == "OPAQUE", "NPC material must be opaque")
    require(texture_indices(mat) == {0}, "Candidate must use one embedded atlas")
    img = d["images"][0]
    require(img.get("mimeType") == "image/png", "NPC atlas must be PNG")
    png = glb.view_bytes(img["bufferView"])
    require(png[:8] == b"\x89PNG\r\n\x1a\n", "Invalid PNG")
    width, height = struct.unpack_from(">II", png, 16)
    require(max(width, height) <= 512, "NPC atlas exceeds 512 px")
    require(len(glb.raw) <= 250000, f"{name}: exceeds 0.25 MB")
    return {"sha256": sha(glb.raw), "bytes": len(glb.raw), "triangles": triangles,
            "bounds": [lo, hi], "atlas_pixels": [width, height],
            "mesh_node": mesh_nodes[0], "root_node": root}


def encode_glb(doc, payloads):
    binary = bytearray()
    for i, data in enumerate(payloads):
        binary.extend(bytes((-len(binary)) % 4))
        doc["bufferViews"][i]["byteOffset"] = len(binary)
        doc["bufferViews"][i]["byteLength"] = len(data)
        binary.extend(data)
    doc["buffers"][0]["byteLength"] = len(binary)
    binary.extend(bytes((-len(binary)) % 4))
    encoded = json.dumps(doc, separators=(",", ":"), ensure_ascii=False).encode()
    encoded += b" " * ((-len(encoded)) % 4)
    return (struct.pack("<4sII", b"glTF", 2, 28 + len(encoded) + len(binary)) +
            struct.pack("<I4s", len(encoded), b"JSON") + encoded +
            struct.pack("<I4s", len(binary), b"BIN\0") + binary)


def replace(world_path, models_dir, output, report_path, allow_legacy_fixture=False):
    paths = [world_path] + [models_dir / f"{role}{suffix}.glb" for role in NEAR_LIMITS for suffix in ("", "_lod_far")]
    for dest in (output, report_path):
        require(dest.resolve() not in {p.resolve() for p in paths}, "Output cannot overwrite an input")
        require(".local" in dest.resolve().parts, "Candidate output must remain under a .local directory")
    original_hashes = {p: sha(p.read_bytes()) for p in paths}
    original = Glb(world_path)
    d = copy.deepcopy(original.doc)
    payloads = [original.view_bytes(i) for i in range(len(d["bufferViews"]))]
    slots, role_meshes, role_nodes, npc_nodes = {}, {r: set() for r in NEAR_LIMITS}, {r: set() for r in NEAR_LIMITS}, set()
    for suffix, role in ROLES.items():
        found = [i for i, n in enumerate(d["nodes"]) if n.get("name") == f"npc_slot_{suffix}"]
        require(len(found) == 1, f"Expected one npc_slot_{suffix}")
        slot = found[0]
        high = [i for i in d["nodes"][slot].get("children", []) if d["nodes"][i].get("name") == f"npc_high_{suffix}"]
        require(len(high) == 1, "Missing direct near NPC child")
        sub = descendants(d, high[0])
        mesh_nodes = [i for i in sub if "mesh" in d["nodes"][i]]
        require(len(mesh_nodes) == 1 and all(is_identity(d["nodes"][i]) for i in sub if "mesh" in d["nodes"][i] or "children" in d["nodes"][i]),
                "Expected an identity near hierarchy with one mesh")
        mesh = d["nodes"][mesh_nodes[0]]["mesh"]
        role_meshes[role].add(mesh)
        role_nodes[role].update(sub | {slot})
        npc_nodes.update(sub | {slot})
        slots[suffix] = {"role": role, "node": slot, "mesh": mesh,
                         "transform": node_transform(d["nodes"][slot])}
    npc_meshes = set().union(*role_meshes.values())
    require(len(npc_meshes) == 7, "Expected seven separate near NPC meshes")
    architecture_meshes = set(range(len(d["meshes"]))) - npc_meshes
    old_accessors, old_materials = {}, {}
    for role, meshes in role_meshes.items():
        primitives = [p for m in meshes for p in d["meshes"][m]["primitives"]]
        require(len(primitives) == len(meshes), "Expected one primitive per existing NPC mesh")
        old_accessors[role] = set().union(*(primitive_accessors(p) for p in primitives))
        materials = {p["material"] for p in primitives}
        require(len(materials) == 1, "Existing role must share one material")
        old_materials[role] = materials.pop()
    require(len(set(old_materials.values())) == 3, "NPC roles must own separate materials")
    architecture_accessors = set().union(*(primitive_accessors(p) for m in architecture_meshes for p in d["meshes"][m]["primitives"]))
    require(not architecture_accessors.intersection(set().union(*old_accessors.values())), "Architecture shares an NPC accessor")
    architecture_materials = set(range(len(d["materials"]))) - set(old_materials.values())
    require(not set(old_materials.values()).intersection({p["material"] for m in architecture_meshes for p in d["meshes"][m]["primitives"]}), "Architecture shares an NPC material")
    replaced_images, candidate_report = set(), {}
    for role, limit in NEAR_LIMITS.items():
        near, far = Glb(models_dir / f"{role}.glb"), Glb(models_dir / f"{role}_lod_far.glb")
        nf, ff = candidate_facts(near, role, limit, allow_legacy_fixture), candidate_facts(far, role + "_lod_far", 600, allow_legacy_fixture)
        deltas = [math.dist(nf["bounds"][edge], ff["bounds"][edge]) for edge in (0, 1)]
        require(max(deltas) <= .04, f"{role}: near/far bounds differ by more than 4 cm")
        candidate_report[role] = {"near": nf, "far": ff, "lod_min_max_distances_m": deltas}
        source = near.doc
        imported_views = {}
        def import_view(index):
            if index not in imported_views:
                imported_views[index] = len(d["bufferViews"])
                view = copy.deepcopy(source["bufferViews"][index]); view["buffer"] = 0
                d["bufferViews"].append(view); payloads.append(near.view_bytes(index))
            return imported_views[index]
        new_primitive = copy.deepcopy(source["meshes"][0]["primitives"][0])
        source_accessors = sorted(primitive_accessors(new_primitive))
        targets = sorted(old_accessors[role])
        require(len(source_accessors) <= len(targets), "Candidate needs more accessor slots than existing role")
        amap = dict(zip(source_accessors, targets))
        for source_index, target in amap.items():
            accessor = copy.deepcopy(source["accessors"][source_index])
            require("sparse" not in accessor, "Sparse candidate accessor is unsupported")
            accessor["bufferView"] = import_view(accessor["bufferView"])
            d["accessors"][target] = accessor
        # Keep architecture mesh accessor indices exactly stable. Unused NPC slots
        # become valid aliases of new data, so no old NPC payload remains referenced.
        alias = amap[new_primitive["attributes"]["POSITION"]]
        for target in targets[len(source_accessors):]:
            d["accessors"][target] = copy.deepcopy(d["accessors"][alias])
        new_primitive["attributes"] = {k: amap[v] for k, v in new_primitive["attributes"].items()}
        new_primitive["indices"] = amap[new_primitive["indices"]]
        material_index = old_materials[role]
        old_tex = texture_indices(d["materials"][material_index])
        require(len(old_tex) == 1, "Existing NPC role must own one texture")
        texture_index = old_tex.pop()
        require(not any(texture_index in texture_indices(d["materials"][i]) for i in architecture_materials), "NPC texture is shared with architecture")
        image_index = d["textures"][texture_index]["source"]
        require(image_index not in replaced_images, "NPC roles share an image")
        replaced_images.add(image_index)
        material = copy.deepcopy(source["materials"][0]); remap_texture_infos(material, 0, texture_index)
        d["materials"][material_index] = material
        texture = copy.deepcopy(source["textures"][0]); texture["source"] = image_index
        if "sampler" in texture:
            sampler = copy.deepcopy(source["samplers"][texture["sampler"]])
            d.setdefault("samplers", [])
            if sampler in d["samplers"]:
                texture["sampler"] = d["samplers"].index(sampler)
            else:
                texture["sampler"] = len(d["samplers"]); d["samplers"].append(sampler)
        d["textures"][texture_index] = texture
        image = copy.deepcopy(source["images"][0]); image["bufferView"] = import_view(image["bufferView"])
        d["images"][image_index] = image
        new_primitive["material"] = material_index
        for mesh in role_meshes[role]:
            d["meshes"][mesh]["primitives"] = [copy.deepcopy(new_primitive)]
            if "extras" in d["meshes"][mesh]:
                d["meshes"][mesh]["extras"] = copy.deepcopy(source["meshes"][0].get("extras", {}))
        provenance = copy.deepcopy(source["nodes"][nf["root_node"]].get("extras", {}))
        provenance.update({"npc_role": role, "source_glb": f"public/models/{role}.glb", "source_sha256": nf["sha256"]})
        for node in role_nodes[role]:
            n = d["nodes"][node]
            if n.get("name") == "seat_anchor":
                continue
            if "mesh" in n:
                placement_id = n.get("extras", {}).get("placement_id")
                n["extras"] = copy.deepcopy(source["nodes"][nf["mesh_node"]].get("extras", {}))
                n["extras"].update(provenance)
                if placement_id is not None:
                    n["extras"]["placement_id"] = placement_id
            elif "extras" in n or n.get("name", "").startswith("npc_slot_"):
                n["extras"] = copy.deepcopy(provenance)
        d["extensionsUsed"] = sorted(set(d.get("extensionsUsed", [])) | set(source.get("extensionsUsed", [])))
    world_roots = [i for i, node in enumerate(d["nodes"]) if node.get("name") == "sento_environment"]
    require(len(world_roots) == 1, "Expected one world root")
    world_root = world_roots[0]
    if not allow_legacy_fixture:
        d["nodes"][world_root].setdefault("extras", {})["production_method"] = (
            "Direct Blender environment; unchanged architecture; independently sourced public NPC geometry; "
            "see model provenance and asset records")
    # Remove stale NPC BIN payloads while preserving all architecture bytes.
    used_views = {a["bufferView"] for a in d["accessors"]} | {i["bufferView"] for i in d["images"]}
    view_map = {old: new for new, old in enumerate(sorted(used_views))}
    removed_views = sorted(set(range(len(payloads))) - used_views)
    removed_bytes = sum(len(payloads[i]) for i in removed_views)
    d["bufferViews"] = [d["bufferViews"][i] for i in sorted(used_views)]
    payloads = [payloads[i] for i in sorted(used_views)]
    for accessor in d["accessors"]:
        accessor["bufferView"] = view_map[accessor["bufferView"]]
    for image in d["images"]:
        image["bufferView"] = view_map[image["bufferView"]]
    result = encode_glb(d, payloads)
    require(len(result) <= 7_000_000, "Candidate world exceeds 7 MB")
    patched = Glb(output, result)
    proof = preservation_proof(original, patched, npc_nodes, npc_meshes, architecture_accessors, architecture_materials, replaced_images, world_root)
    metadata = metadata_audit(patched)
    for suffix, slot in slots.items():
        require(node_transform(patched.doc["nodes"][slot["node"]]) == slot["transform"], f"Changed slot transform: {suffix}")
        role = slot["role"]
        near = Glb(models_dir / f"{role}.glb")
        a = patched.doc["meshes"][slot["mesh"]]["primitives"][0]
        b = near.doc["meshes"][0]["primitives"][0]
        require(a["attributes"].keys() == b["attributes"].keys(), "Patched attributes differ")
        for semantic in a["attributes"]:
            require(patched.accessor_rows(a["attributes"][semantic]) == near.accessor_rows(b["attributes"][semantic]), "Patched NPC differs from source")
        require(patched.accessor_rows(a["indices"]) == near.accessor_rows(b["indices"]), "Patched NPC indices differ")
    triangles = sum(patched.doc["accessors"][p["indices"]]["count"] // 3 for m in patched.doc["meshes"] for p in m["primitives"])
    require(triangles <= 20200, "World exceeds 20,200 triangles")
    for path, before in original_hashes.items():
        require(sha(path.read_bytes()) == before, "An input changed during generation; discard candidate and retry")
    report = {"schema_version": 1, "source_world_sha256": sha(original.raw), "output_world_sha256": sha(result),
              "output_bytes": len(result), "world_triangles": triangles, "npc_slots": slots, "candidates": candidate_report,
              "legacy_roundtrip_fixture": allow_legacy_fixture, "metadata_audit": metadata,
              "preservation": proof, "old_unreferenced_buffer_views_removed": removed_views,
              "old_unreferenced_payload_bytes_removed": removed_bytes, "all_input_files_unchanged": True,
              "activation": "Candidate only; public assets and editable source files were not modified.",
              "not_verified_here": ["Rendered appearance", "Seated body contact with bench", "Triangle-level route clearances"]}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(result)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    return {"output": output.name, "sha256": sha(result), "bytes": len(result), "triangles": triangles,
            "architecture_preserved": True, "slots_preserved": len(slots), "report": report_path.name}


def preservation_proof(before, after, npc_nodes, npc_meshes, architecture_accessors, architecture_materials, npc_images, world_root):
    a, b = before.doc, after.doc
    require(len(a["nodes"]) == len(b["nodes"]), "Node count changed")
    non_npc_nodes = [i for i in range(len(a["nodes"])) if i not in npc_nodes]
    for i in range(len(a["nodes"])):
        require(node_transform(a["nodes"][i]) == node_transform(b["nodes"][i]), f"Node transform changed: {i}")
        for key in ("children", "name", "mesh"):
            require(a["nodes"][i].get(key) == b["nodes"][i].get(key), f"Node hierarchy/name/mesh changed: {i}")
    for i in non_npc_nodes:
        first, second = copy.deepcopy(a["nodes"][i]), copy.deepcopy(b["nodes"][i])
        if i == world_root:
            first.get("extras", {}).pop("production_method", None)
            second.get("extras", {}).pop("production_method", None)
        require(first == second, f"Non-NPC node changed: {i}")
    architecture_meshes = [i for i in range(len(a["meshes"])) if i not in npc_meshes]
    require(all(a["meshes"][i] == b["meshes"][i] for i in architecture_meshes), "Architecture mesh descriptor changed")
    accessors = []
    for i in sorted(architecture_accessors):
        first, second = before.accessor_proof(i), after.accessor_proof(i)
        require(first == second, f"Architecture accessor/payload changed: {i}")
        accessors.append({"index": i, "payload_sha256": first["payload_sha256"], "descriptor_sha256": json_sha(first)})
    materials = []
    for i in sorted(architecture_materials):
        require(a["materials"][i] == b["materials"][i], f"Architecture material changed: {i}")
        for tex in texture_indices(a["materials"][i]):
            require(a["textures"][tex] == b["textures"][tex], f"Architecture texture changed: {tex}")
            sampler = a["textures"][tex].get("sampler")
            if sampler is not None:
                require(a["samplers"][sampler] == b["samplers"][sampler], "Architecture sampler changed")
        materials.append({"index": i, "sha256": json_sha(a["materials"][i])})
    images = []
    for i in range(len(a["images"])):
        if i in npc_images:
            continue
        first, second = copy.deepcopy(a["images"][i]), copy.deepcopy(b["images"][i])
        av, bv = first.pop("bufferView"), second.pop("bufferView")
        require(first == second and before.view_bytes(av) == after.view_bytes(bv), f"Architecture image changed: {i}")
        images.append({"index": i, "name": first.get("name", ""), "payload_sha256": sha(before.view_bytes(av))})
    for key in ("scenes", "scene", "asset"):
        require(a.get(key) == b.get(key), f"World {key} changed")
    return {"all_node_transforms_identical": True, "all_node_hierarchies_names_mesh_indices_identical": True,
            "non_npc_nodes_identical_except_root_description": non_npc_nodes,
            "allowed_metadata_change": "sento_environment.extras.production_method only", "architecture_mesh_descriptors_identical": architecture_meshes,
            "architecture_accessors_and_payloads": accessors, "architecture_materials": materials,
            "architecture_images": images, "world_scene_and_asset_metadata_identical": True}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--world", type=Path, default=Path("assets/sento_environment/blend/sento_environment__v01.glb"))
    parser.add_argument("--models-dir", type=Path, default=Path(".local/distinct-sento-npcs/models"))
    parser.add_argument("--output", type=Path, default=Path(".local/distinct-sento-npcs/world/sento_environment.glb"))
    parser.add_argument("--report", type=Path)
    parser.add_argument("--allow-legacy-fixture", action="store_true", help="Round-trip QA only; permit old father-derived fixture models")
    args = parser.parse_args()
    try:
        result = replace(args.world, args.models_dir, args.output, args.report or args.output.with_suffix(".audit.json"), args.allow_legacy_fixture)
    except (ValueError, KeyError, IndexError, OSError, struct.error) as error:
        print(f"NPC replacement failed: {error}", file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
