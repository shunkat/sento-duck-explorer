#!/usr/bin/env python3
"""Fix only the bath-facing Fuji mural U coordinates in an audited world GLB.

The input hash is deliberately pinned: passing the corrected output back as an
input fails instead of reversing the correction. Repeating with the original
input produces the same candidate. Neither the public model nor its source is
overwritten. The default input is the archived v02 GLB. Run from the repository
root; outputs remain in .local/fuji-mural.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import sys

sys.dont_write_bytecode = True
SPEC = importlib.util.spec_from_file_location('npc_patch', Path(__file__).with_name('replace-background-npcs.py'))
PATCH = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(PATCH)
EXPECTED_INPUT_SHA256 = '39cfd9954b2de71807ecf3e860063f0569a9bd2611f322b361c10232f963950e'
EXPECTED_IMAGE_SHA256 = 'c4eee5741685275bd4790320011c3c0cd81e8aeb694ff0657b9de58947b5c90a'
NODE_NAME = 'environment_upper__fuji_mural'
DEFAULT_INPUT = Path('assets/sento_environment/blend/sento_environment__v02.glb')


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def fix(raw):
    require(sha(raw) == EXPECTED_INPUT_SHA256,
            'Input is not the audited uncorrected world; corrected or changed inputs must not be flipped again')
    glb = PATCH.Glb('sento_environment.glb', raw=raw); doc = glb.doc
    matches = [(i, n) for i, n in enumerate(doc['nodes']) if n.get('name') == NODE_NAME]
    require(len(matches) == 1, 'Expected one Fuji mural mesh node')
    node_index, node = matches[0]
    parents = {child: i for i, n in enumerate(doc['nodes']) for child in n.get('children', [])}
    path, index = [], node_index
    while True:
        ancestor = doc['nodes'][index]
        require(PATCH.is_identity(ancestor), 'Mural world orientation must equal its mesh orientation')
        path.insert(0, ancestor.get('name', ''))
        if index not in parents:
            break
        index = parents[index]
    require(path == ['sento_environment', 'environment_upper', NODE_NAME], 'Mural must retain its upper-wall ownership')
    primitives = doc['meshes'][node['mesh']]['primitives']
    require(len(primitives) == 1, 'Expected one mural primitive')
    primitive = primitives[0]
    require(primitive.get('mode', 4) == 4, 'Mural must use triangles')
    material = doc['materials'][primitive['material']]
    require(material.get('name') == 'fuji_mural', 'Unexpected mural material')
    texture = doc['textures'][material['pbrMetallicRoughness']['baseColorTexture']['index']]
    image = doc['images'][texture['source']]
    require(sha(glb.view_bytes(image['bufferView'])) == EXPECTED_IMAGE_SHA256, 'Original mural art changed')
    attributes = primitive['attributes']
    positions, normals, uvs = [glb.accessor_rows(attributes[key]) for key in ('POSITION', 'NORMAL', 'TEXCOORD_0')]
    require(len(positions) == len(normals) == len(uvs) == 24, 'Expected the original six-face mural box')
    inward = [i for i, normal in enumerate(normals) if normal == (0.0, 0.0, -1.0)]
    require(len(inward) == 4, 'Expected four vertices facing into the bath (-Z)')
    indices = [row[0] for row in glb.accessor_rows(primitive['indices'])]
    faces = [indices[i:i+3] for i in range(0, len(indices), 3)]
    inward_faces = [face for face in faces if set(face).intersection(inward)]
    require(len(inward_faces) == 2 and all(set(face).issubset(inward) for face in inward_faces),
            'Inward vertices must belong only to the two inward-facing triangles')
    x0, x1 = min(p[0] for p in positions), max(p[0] for p in positions)
    y0, y1 = min(p[1] for p in positions), max(p[1] for p in positions)
    z0 = min(p[2] for p in positions)
    for i in inward:
        x, y, z = positions[i]; u, v = uvs[i]
        require(z == z0 and abs(u - (x-x0)/(x1-x0)) < 1e-6,
                'Expected the original inward-face horizontal UV orientation')
        # glTF texture V=0 is the top of the image; preserve it exactly.
        require(abs(v - (1-(y-y0)/(y1-y0))) < 1e-6, 'Mural is not vertically upright')
    uv_index = attributes['TEXCOORD_0']; accessor = doc['accessors'][uv_index]
    require(accessor['componentType'] == 5126 and accessor['type'] == 'VEC2' and 'sparse' not in accessor,
            'Expected ordinary float32 UVs')
    view_index = accessor['bufferView']; view = doc['bufferViews'][view_index]
    require(not accessor.get('normalized'), 'Normalized UVs are unsupported')
    stride = view.get('byteStride', 8)
    json_length = struct.unpack_from('<I', raw, 12)[0]
    binary_offset = 20 + json_length + 8
    offset = binary_offset + view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    output = bytearray(raw); edits = []
    for i in inward:
        at = offset + i * stride
        struct.pack_into('<f', output, at, 1 - uvs[i][0])
        edits.append({'vertex': i, 'position': positions[i], 'normal': normals[i],
                      'before_uv': uvs[i], 'after_uv': struct.unpack_from('<ff', output, at),
                      'file_byte_offset': at, 'edited_float_bytes': 4})
    result = bytes(output); candidate = PATCH.Glb('sento_environment.glb', raw=result)
    allowed = {at for edit in edits for at in range(edit['file_byte_offset'], edit['file_byte_offset']+4)}
    changed = [i for i, (old, new) in enumerate(zip(raw, result)) if old != new]
    require(changed and set(changed).issubset(allowed), 'Unexpected bytes changed outside the four U coordinates')
    require(raw[:binary_offset] == result[:binary_offset] and len(raw) == len(result), 'GLB header or JSON changed')
    unchanged_views = []
    for i in range(len(doc['bufferViews'])):
        if i == view_index:
            continue
        old = glb.view_bytes(i); new = candidate.view_bytes(i)
        require(old == new, 'A non-UV payload changed')
        unchanged_views.append({'buffer_view': i, 'bytes': len(old), 'sha256': sha(old)})
    after_uvs = candidate.accessor_rows(uv_index)
    for i, (before, after) in enumerate(zip(uvs, after_uvs)):
        require(before[1] == after[1] and (i in inward or before == after), 'Other face UVs or vertical UVs changed')
    masked_before, masked_after = bytearray(raw), bytearray(result)
    for i in allowed:
        masked_before[i] = masked_after[i] = 0
    require(masked_before == masked_after, 'Unmodified payload proof failed')
    report = {'input_sha256': sha(raw), 'output_sha256': sha(result), 'bytes': len(result),
              'operation': 'U = 1 - U on the inward (-Z) face only; V unchanged',
              'node_path': path, 'uv_accessor': uv_index, 'uv_buffer_view': view_index,
              'affected_vertices': edits, 'affected_triangles': inward_faces,
              'changed_byte_count': len(changed), 'changed_byte_offsets': changed,
              'unchanged_header_and_json': True, 'unchanged_node_mesh_material_accessor_descriptors': True,
              'unchanged_other_bytes_sha256': sha(masked_before), 'masked_u_float_byte_count': len(allowed),
              'unchanged_other_buffer_views': unchanged_views,
              'original_mural_png_sha256': EXPECTED_IMAGE_SHA256, 'original_art_bytes_unchanged': True,
              'other_face_uvs_and_all_v_unchanged': True, 'environment_upper_ownership_unchanged': True,
              'scope': 'Private candidate only; no geometry, hierarchy, image, material, or runtime changes'}
    return result, report


def private_path(path):
    require(path.resolve().is_relative_to((Path.cwd()/'.local/fuji-mural').resolve()),
            'Outputs must remain inside .local/fuji-mural')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=DEFAULT_INPUT)
    parser.add_argument('--output', type=Path, default=Path('.local/fuji-mural/sento_environment.glb'))
    parser.add_argument('--report', type=Path, default=Path('.local/fuji-mural/sento_environment.audit.json'))
    args = parser.parse_args()
    private_path(args.output); private_path(args.report)
    require(args.input.resolve() not in {args.output.resolve(), args.report.resolve()}, 'Input must not be overwritten')
    require(args.output.resolve() != args.report.resolve(), 'Model and report paths must differ')
    raw = args.input.read_bytes(); result, report = fix(raw)
    if args.output.exists():
        require(args.output.read_bytes() == result, 'Refusing to overwrite a different candidate')
    args.output.parent.mkdir(parents=True, exist_ok=True); args.report.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(result)
    require(args.input.read_bytes() == raw, 'Input changed during the operation')
    args.report.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({key: report[key] for key in ('input_sha256', 'output_sha256', 'changed_byte_count')}))


if __name__ == '__main__':
    main()
