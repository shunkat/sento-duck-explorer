#!/usr/bin/env python3
"""Replace only npc_slot_2 in the archived Fuji-corrected v03 world.

Run from the repository root. The new role may use a 1024px atlas and 0.5 MB
per model; the historical three-role producer keeps its 512px/0.25 MB limits.
UV seam splits are allowed only when every oriented triangle's positions and
normals remain exactly equivalent to the independent standing visitor source.
All output stays private; this script does not activate models or deploy.
"""
import argparse
import copy
from collections import Counter
import importlib.util
import json
import math
from pathlib import Path
import struct
import sys

sys.dont_write_bytecode = True
SPEC = importlib.util.spec_from_file_location('npc_patch', Path(__file__).with_name('replace-background-npcs.py'))
PATCH = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(PATCH)
require, sha = PATCH.require, PATCH.sha
ROLE = 'npc_bath_tattooed'
WORLD_SHA256 = '6ac2a9e99b4d068118ad30ddd01c9feda9ec273ade594aa157a39010d21b4c98'
SOURCE_SHA256 = {
    '': '0446e67bb93dbb2e0307b77732a490f96d654477d6dbf2bbae39fb753dc162cb',
    '_lod_far': 'd2bc8e2d2920d9d068ddd95772e9d516ff56bda17c87ab8004913b484dbd4bbe',
}
DEFAULT_WORLD = Path('assets/sento_environment/blend/sento_environment__v03.glb')
DEFAULT_MODELS = Path('.local/tattooed-visitor')


def primitive(glb):
    require(len(glb.doc.get('meshes', [])) == 1, 'Variant must have one mesh')
    primitives = glb.doc['meshes'][0]['primitives']
    require(len(primitives) == 1 and primitives[0].get('mode', 4) == 4, 'Variant must have one triangle primitive')
    return primitives[0]


def triangle_facts(glb, part):
    attributes = part['attributes']
    require(set(attributes) == {'POSITION', 'NORMAL', 'TEXCOORD_0'}, 'Unexpected vertex attributes')
    positions, normals, uvs = [glb.accessor_rows(attributes[key]) for key in ('POSITION', 'NORMAL', 'TEXCOORD_0')]
    require(len(positions) == len(normals) == len(uvs) and positions, 'Vertex attribute counts differ')
    for key, width in [('POSITION', 3), ('NORMAL', 3), ('TEXCOORD_0', 2)]:
        a = glb.doc['accessors'][attributes[key]]
        require(a['componentType'] == 5126 and a['type'] == f'VEC{width}' and not a.get('normalized'),
                'Expected ordinary float32 position, normal and UV attributes')
    require(all(math.isfinite(v) for rows in (positions, normals, uvs) for row in rows for v in row),
            'Nonfinite vertex attribute')
    index_accessor = glb.doc['accessors'][part['indices']]
    require(index_accessor['type'] == 'SCALAR' and index_accessor['componentType'] in (5121, 5123, 5125),
            'Expected unsigned triangle indices')
    indices = [row[0] for row in glb.accessor_rows(part['indices'])]
    require(len(indices) % 3 == 0 and all(0 <= i < len(positions) for i in indices), 'Invalid triangle indices')
    # Keep winding, but permit triangle ordering, cyclic corner ordering and UV
    # seam splits. Packed float32 normals are part of every corner's identity.
    corners = [struct.pack('<6f', *p, *n) for p, n in zip(positions, normals)]
    triangles = []
    for start in range(0, len(indices), 3):
        a, b, c = [corners[i] for i in indices[start:start+3]]
        triangles.append(min(a+b+c, b+c+a, c+a+b))
    ordered = sorted(triangles)
    return {'triangles': len(indices)//3, 'vertices': len(positions),
            'bounds': [[min(p[i] for p in positions) for i in range(3)],
                       [max(p[i] for p in positions) for i in range(3)]],
            'oriented_position_normal_soup_sha256': sha(b''.join(ordered)),
            'soup': Counter(triangles)}


def candidate_facts(candidate, source, role, expected_triangles):
    d = candidate.doc; PATCH.metadata_audit(candidate)
    require(len(candidate.raw) <= 500000, 'Tattoo variant exceeds 0.5 MB')
    require(len(d.get('materials', [])) == len(d.get('textures', [])) == len(d.get('images', [])) == 1,
            'Variant must use one material, texture and image')
    require(not d.get('cameras') and not d.get('extensions', {}).get('KHR_lights_punctual'), 'Unexpected cameras/lights')
    part = primitive(candidate); PATCH.primitive_accessors(part)
    require(part.get('material') == 0, 'Variant must use its sole material')
    nodes = [(i, n) for i, n in enumerate(d['nodes']) if 'mesh' in n]
    require(len(nodes) == 1 and nodes[0][1]['mesh'] == 0, 'Variant must contain one static mesh instance')
    parents = {c: i for i, n in enumerate(d['nodes']) for c in n.get('children', [])}
    mesh_node = root = nodes[0][0]; visited = set()
    while True:
        require(root not in visited, 'Node cycle'); visited.add(root)
        require(PATCH.is_identity(d['nodes'][root]), 'Apply variant mesh/ancestor transforms')
        if root not in parents:
            break
        root = parents[root]
    require(root in d['scenes'][d.get('scene', 0)]['nodes'], 'Variant outside its active scene')
    extras = d['nodes'][root].get('extras', {})
    require(extras.get('source_author') == 'Quaternius', 'Keep independent geometry provenance')
    require(extras.get('npc_role') in (ROLE, role), 'Variant must identify its tattooed visitor role')
    encoded = json.dumps(d, separators=(',', ':'))
    require('"parent_asset":"adult"' not in encoded and 'assets/adult/' not in encoded, 'Playable father provenance is forbidden')
    material = d['materials'][0]
    require(material.get('alphaMode', 'OPAQUE') == 'OPAQUE', 'Variant must remain opaque')
    require(PATCH.texture_indices(material) == {0}, 'Variant must use one base atlas')
    require(d['textures'][0].get('source') == 0 and d['images'][0].get('mimeType') == 'image/png', 'Expected an embedded PNG atlas')
    atlas = candidate.view_bytes(d['images'][0]['bufferView'])
    require(atlas.startswith(b'\x89PNG\r\n\x1a\n'), 'Invalid PNG')
    width, height = struct.unpack_from('>II', atlas, 16)
    require(0 < min(width, height) <= max(width, height) <= 1024, 'Tattoo atlas exceeds 1024px')
    actual, original = triangle_facts(candidate, part), triangle_facts(source, primitive(source))
    require(actual['triangles'] == expected_triangles and actual['soup'] == original['soup'],
            'Variant changed the standing source oriented position/normal triangle soup')
    require(actual['bounds'] == original['bounds'], 'Variant changed standing source bounds')
    actual.pop('soup')
    return {**actual, 'sha256': sha(candidate.raw), 'bytes': len(candidate.raw),
            'source_sha256': sha(source.raw), 'atlas_pixels': [width, height],
            'atlas_sha256': sha(atlas), 'mesh_node': mesh_node, 'root_node': root,
            'source_geometry_and_normals_identical': True, 'uv_seam_vertex_splits_allowed': True}


def packed_accessor(glb, index):
    a = glb.doc['accessors'][index]
    require('sparse' not in a and not a.get('extensions'), 'Sparse/extended accessors are unsupported')
    code, _ = PATCH.COMPONENT[a['componentType']]
    width = PATCH.WIDTH[a['type']]
    return b''.join(struct.pack('<'+code*width, *row) for row in glb.accessor_rows(index))


def replace(world_path, models_dir, output, report_path, source_dir=Path('public/models')):
    paths = [world_path] + [models_dir / (ROLE+suffix+'.glb') for suffix in SOURCE_SHA256] + [
        source_dir / ('npc_bath_standing'+suffix+'.glb') for suffix in SOURCE_SHA256]
    private = (Path.cwd()/'.local').resolve()
    for dest in (output, report_path):
        require(dest.resolve().is_relative_to(private), 'Output must remain under the repository .local directory')
        require(dest.resolve() not in {p.resolve() for p in paths}, 'Cannot overwrite an input')
    require(output.resolve() != report_path.resolve(), 'Output and report must differ')
    hashes = {p: sha(p.read_bytes()) for p in paths}
    require(hashes[world_path] == WORLD_SHA256, 'Expected the archived Fuji-corrected v03 world')
    candidates, facts = {}, {}
    for suffix, expected_hash in SOURCE_SHA256.items():
        source = PATCH.Glb(source_dir / ('npc_bath_standing'+suffix+'.glb'))
        require(sha(source.raw) == expected_hash, 'Independent standing source changed')
        candidate = PATCH.Glb(models_dir / (ROLE+suffix+'.glb'))
        facts[suffix or 'near'] = candidate_facts(candidate, source, ROLE+suffix, 594 if suffix else 1594)
        candidates[suffix] = candidate
    deltas = [math.dist(facts['near']['bounds'][edge], facts['_lod_far']['bounds'][edge]) for edge in (0, 1)]
    require(max(deltas) <= .04, 'Near/far bounds mismatch')
    require(facts['near']['atlas_sha256'] == facts['_lod_far']['atlas_sha256'], 'Near/far must use the same tattoo atlas')
    original = PATCH.Glb(world_path); d = copy.deepcopy(original.doc)
    payloads = [original.view_bytes(i) for i in range(len(d['bufferViews']))]
    slots = [(i, n) for i, n in enumerate(d['nodes']) if n.get('name') == 'npc_slot_2']
    require(len(slots) == 1, 'Expected exactly one standing slot2')
    slot, slot_node = slots[0]
    require(slot_node.get('extras', {}).get('npc_role') == 'npc_bath_standing', 'Slot2 is not the original standing visitor')
    high = [i for i in slot_node.get('children', []) if d['nodes'][i].get('name') == 'npc_high_2']
    require(len(high) == 1, 'Missing direct npc_high_2')
    selected_nodes = PATCH.descendants(d, slot)
    mesh_nodes = [i for i in selected_nodes if 'mesh' in d['nodes'][i]]
    require(len(mesh_nodes) == 1, 'Expected one mesh in slot2')
    mesh = d['nodes'][mesh_nodes[0]]['mesh']; old_parts = d['meshes'][mesh]['primitives']
    require(len(old_parts) == 1, 'Expected one slot2 primitive')
    old = old_parts[0]; target_accessors = PATCH.primitive_accessors(old)
    preserved_meshes = set(range(len(d['meshes']))) - {mesh}
    preserved_accessors = set().union(*(PATCH.primitive_accessors(p) for m in preserved_meshes for p in d['meshes'][m]['primitives']))
    require(not target_accessors & preserved_accessors, 'Slot2 shares accessor data')
    material_index = old['material']; preserved_materials = set(range(len(d['materials']))) - {material_index}
    require(all(p['material'] != material_index for m in preserved_meshes for p in d['meshes'][m]['primitives']), 'Slot2 shares its material')
    old_textures = PATCH.texture_indices(d['materials'][material_index])
    require(len(old_textures) == 1, 'Expected one slot2 atlas')
    texture_index = old_textures.pop(); image_index = d['textures'][texture_index]['source']
    require(all(texture_index not in PATCH.texture_indices(d['materials'][i]) for i in preserved_materials), 'Slot2 shares its texture')
    require(all(i == texture_index or tex.get('source') != image_index for i, tex in enumerate(d['textures'])), 'Slot2 shares its image')
    replaced_views = {d['accessors'][i]['bufferView'] for i in target_accessors} | {d['images'][image_index]['bufferView']}
    require(len(replaced_views) == 5, 'Expected separate position, normal, UV, index and image views')
    require(all(a['bufferView'] not in replaced_views for i, a in enumerate(d['accessors']) if i not in target_accessors), 'Slot2 shares a buffer view')
    require(all(im['bufferView'] not in replaced_views for i, im in enumerate(d['images']) if i != image_index), 'Slot2 shares an image buffer view')
    near = candidates['']; source = near.doc; new = copy.deepcopy(primitive(near))
    amap = {new['attributes'][key]: old['attributes'][key] for key in old['attributes']}
    amap[new['indices']] = old['indices']
    for source_index, target in amap.items():
        view_index = d['accessors'][target]['bufferView']
        data = packed_accessor(near, source_index)
        accessor = copy.deepcopy(source['accessors'][source_index]); accessor.pop('byteOffset', None)
        accessor['bufferView'] = view_index; d['accessors'][target] = accessor
        d['bufferViews'][view_index].pop('byteStride', None)
        payloads[view_index] = data
    new['attributes'] = {key: amap[value] for key, value in new['attributes'].items()}
    new['indices'] = amap[new['indices']]; new['material'] = material_index
    d['meshes'][mesh]['primitives'] = [new]
    if 'extras' in d['meshes'][mesh]:
        d['meshes'][mesh]['extras'] = copy.deepcopy(source['meshes'][0].get('extras', {}))
    material = copy.deepcopy(source['materials'][0]); PATCH.remap_texture_infos(material, 0, texture_index)
    d['materials'][material_index] = material
    texture = copy.deepcopy(source['textures'][0]); texture['source'] = image_index
    if 'sampler' in texture:
        sampler = source['samplers'][texture['sampler']]
        require(sampler in d.get('samplers', []), 'Use an existing world sampler to preserve other metadata')
        texture['sampler'] = d['samplers'].index(sampler)
    d['textures'][texture_index] = texture
    image_view = d['images'][image_index]['bufferView']
    image = copy.deepcopy(source['images'][0]); image['bufferView'] = image_view
    d['images'][image_index] = image; payloads[image_view] = near.view_bytes(source['images'][0]['bufferView'])
    provenance = copy.deepcopy(source['nodes'][facts['near']['root_node']].get('extras', {}))
    provenance.update({'npc_role': ROLE, 'source_glb': f'public/models/{ROLE}.glb', 'source_sha256': facts['near']['sha256']})
    for index in selected_nodes:
        node = d['nodes'][index]
        if 'extras' in node or index == slot or 'mesh' in node:
            placement_id = node.get('extras', {}).get('placement_id')
            node['extras'] = copy.deepcopy(provenance)
            if placement_id is not None:
                node['extras']['placement_id'] = placement_id
    require(set(source.get('extensionsUsed', [])) <= set(d.get('extensionsUsed', [])), 'Variant needs an unapproved world extension')
    result = PATCH.encode_glb(d, payloads); require(len(result) <= 7000000, 'World exceeds 7 MB')
    patched = PATCH.Glb(output, raw=result)
    world_root = next(i for i, n in enumerate(d['nodes']) if n.get('name') == 'sento_environment')
    proof = PATCH.preservation_proof(original, patched, selected_nodes, {mesh}, preserved_accessors,
                                    preserved_materials, {image_index}, world_root)
    require(original.doc['nodes'][world_root] == patched.doc['nodes'][world_root], 'World root metadata changed')
    for collection in ('nodes', 'meshes', 'accessors', 'bufferViews', 'materials', 'textures', 'images', 'samplers'):
        require(len(original.doc[collection]) == len(patched.doc[collection]), f'{collection} count changed')
    unchanged_views = []
    for i in range(len(payloads)):
        if i in replaced_views:
            continue
        require(original.view_bytes(i) == patched.view_bytes(i), 'A non-slot2 buffer payload changed')
        unchanged_views.append({'buffer_view': i, 'sha256': sha(original.view_bytes(i)), 'bytes': len(original.view_bytes(i))})
    old_geometry = triangle_facts(original, old); new_geometry = triangle_facts(patched, patched.doc['meshes'][mesh]['primitives'][0])
    require(old_geometry['soup'] == new_geometry['soup'] and old_geometry['bounds'] == new_geometry['bounds'], 'Placed slot2 geometry changed')
    require(new_geometry['soup'] == triangle_facts(near, primitive(near))['soup'], 'Embedded geometry differs from new source')
    actual_uv = patched.accessor_rows(new['attributes']['TEXCOORD_0'])
    require(actual_uv == near.accessor_rows(primitive(near)['attributes']['TEXCOORD_0']), 'Embedded UVs differ from source')
    triangles = sum(patched.doc['accessors'][p['indices']]['count']//3 for m in patched.doc['meshes'] for p in m['primitives'])
    require(triangles == 20153, 'World triangle count changed')
    report = {'source_world_sha256': sha(original.raw), 'output_world_sha256': sha(result), 'output_bytes': len(result),
              'world_triangles': triangles, 'slot': 'npc_slot_2', 'slot_node': slot, 'selected_nodes': sorted(selected_nodes),
              'selected_mesh': mesh, 'replaced_buffer_views': sorted(replaced_views), 'unchanged_buffer_views': unchanged_views,
              'source_shape_and_normals_unchanged': True, 'all_seven_slot_transforms_unchanged': True,
              'nonselected_npcs_and_architecture': proof, 'world_root_metadata_unchanged': True,
              'candidates': facts, 'lod_min_max_distances_m': deltas, 'metadata_audit': PATCH.metadata_audit(patched),
              'all_input_files_unchanged': True, 'scope': 'Private candidate; only slot2 appearance/provenance changed; no runtime or public activation'}
    require(all(sha(path.read_bytes()) == value for path, value in hashes.items()), 'An input changed during generation')
    output.parent.mkdir(parents=True, exist_ok=True); report_path.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(result); report_path.write_text(json.dumps(report, indent=2) + '\n')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--world', type=Path, default=DEFAULT_WORLD)
    parser.add_argument('--models-dir', type=Path, default=DEFAULT_MODELS)
    parser.add_argument('--output', type=Path, default=DEFAULT_MODELS/'world/sento_environment.glb')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    report = replace(args.world, args.models_dir, args.output, args.report or args.output.with_suffix('.audit.json'))
    print(json.dumps({k: report[k] for k in ('output_world_sha256', 'output_bytes', 'world_triangles', 'slot')}))


if __name__ == '__main__':
    main()
