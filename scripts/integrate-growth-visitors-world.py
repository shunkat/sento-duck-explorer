#!/usr/bin/env python3
"""Compose growth_v02 architecture with the independent-visitor v04 world.

Both parents are immutable versioned inputs. The existing geometry-only growth
patch keeps the entire v04 binary prefix, images and materials. This producer
also compares every active architecture leaf to the growth parent, except the
intentionally corrected Fuji UVs, and every visitor leaf to v04. Outputs stay
private until review; no canonical model, document or manifest is activated.
"""
import argparse
import copy
import importlib.util
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(file))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


MERGE = load('growth_merge', 'merge-environment-patch.py')
MEASURE = load('actual_world', 'measure-replaced-world.py')
PATCH = MEASURE.PATCH
ASSETS = Path('assets/sento_environment')
V04 = ASSETS/'blend/sento_environment__v04.glb'
GROWTH = ASSETS/'blend/sento_environment__growth_v02.glb'
GEOMETRY = ASSETS/'patch/growth_v02/growth_environment_patch.glb'
CONTRACT = ASSETS/'patch/growth_v02/patch-contract.json'
REFERENCE = ASSETS/'quality/growth_v02/measurements.json'
V04_RECORD = ASSETS/'quality/v04/measurements.json'
EXPECTED = {
    V04: 'afbea3f724255c1016b4968aac2fdacafa787c402315488c2d839c91ea31b54b',
    GROWTH: '3c37930e66a6d27f2a32cc174b64cb54b6a713bfafd6322ef4959cbb7ec6eb00',
    GEOMETRY: '326389cdbd2623ae1d632590148a7903c3df9d9b011ac189dc48f108393b7b83',
    CONTRACT: 'a3400c8977eb46b71df0af40659d8b21a111e2aace38afd04f1b7a504b0d6775',
}
DYNAMIC = ('sauna_door', 'growth_kids_gate', 'growth_front_exit')


def named_hierarchy(doc):
    return {n['name']: {k: ([doc['nodes'][i]['name'] for i in value] if k == 'children' else value)
                        for k, value in n.items() if k not in ('mesh', 'extras')}
            for n in doc['nodes']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--layout', type=Path, default=ASSETS/'patch/growth_v02/layout.json')
    parser.add_argument('--output-dir', type=Path, default=Path('.local/integrated-world'))
    args = parser.parse_args()
    PATCH.require(args.output_dir.resolve().is_relative_to((Path.cwd()/'.local').resolve()), 'Output must remain private')
    for file, digest in EXPECTED.items():
        PATCH.require(PATCH.sha(file.read_bytes()) == digest, 'Versioned input changed: '+str(file))
    layout = json.loads(args.layout.read_text()); contract = json.loads(CONTRACT.read_text())
    PATCH.require(layout['layout_sha256'] == contract['layout_sha256'], 'Latest layout and patch differ')
    for file, digest in layout['source_files'].items():
        PATCH.require(PATCH.sha(Path(file).read_bytes()) == digest, 'Authoritative layout source changed: '+file)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    world = args.output_dir/'sento_environment.glb'
    merge = MERGE.merge(V04, GEOMETRY, CONTRACT, world)
    v04, original_binary = MERGE.read_glb(V04)
    growth, growth_binary = MERGE.read_glb(GROWTH)
    combined, binary = MERGE.read_glb(world)
    names = MERGE.unique_nodes(combined)
    PATCH.require(named_hierarchy(combined) == named_hierarchy(growth), 'Combined hierarchy/transforms differ from the growth world')
    npc_indices = set()
    for i, node in enumerate(v04['nodes']):
        if node.get('name', '').startswith('npc_slot_'):
            npc_indices |= PATCH.descendants(v04, i)
    npc_names = {v04['nodes'][i]['name'] for i in npc_indices}
    expected_leaves, growth_leaves, visitor_leaves = [], [], []
    for node in combined['nodes']:
        if 'mesh' not in node:
            continue
        name = node['name']; expected_leaves.append(name)
        parent, parent_binary = (v04, original_binary) if name in npc_names or name == 'environment_upper__fuji_mural' else (growth, growth_binary)
        fingerprint = MERGE.node_fingerprint(combined, binary, name)
        PATCH.require(fingerprint == MERGE.node_fingerprint(parent, parent_binary, name), 'Parent geometry changed: '+name)
        (visitor_leaves if name in npc_names else growth_leaves).append({'name': name, 'fingerprint': fingerprint,
                    'source': 'v04' if parent is v04 else 'growth_v02'})
    for i in npc_indices:
        PATCH.require(v04['nodes'][i] == combined['nodes'][names[v04['nodes'][i]['name']]], 'Visitor hierarchy or provenance changed')
    architecture_materials = set()
    for node in combined['nodes']:
        if 'mesh' in node and node['name'] not in npc_names:
            architecture_materials.update(p['material'] for p in combined['meshes'][node['mesh']]['primitives'])
    appearance_proofs = []
    growth_glb, combined_glb = PATCH.Glb(GROWTH), PATCH.Glb(world)
    for index in sorted(architecture_materials):
        PATCH.require(combined['materials'][index] == growth['materials'][index], 'Growth architecture material changed')
        images = []
        for texture_index in PATCH.texture_indices(combined['materials'][index]):
            texture = combined['textures'][texture_index]
            PATCH.require(texture == growth['textures'][texture_index], 'Growth architecture texture changed')
            if 'sampler' in texture:
                PATCH.require(combined['samplers'][texture['sampler']] == growth['samplers'][texture['sampler']], 'Growth architecture sampler changed')
            image_index = texture['source']
            actual_image, expected_image = copy.deepcopy(combined['images'][image_index]), copy.deepcopy(growth['images'][image_index])
            actual_view, expected_view = actual_image.pop('bufferView'), expected_image.pop('bufferView')
            actual_bytes, expected_bytes = combined_glb.view_bytes(actual_view), growth_glb.view_bytes(expected_view)
            PATCH.require(actual_image == expected_image and actual_bytes == expected_bytes, 'Growth architecture image changed')
            images.append({'image_index': image_index, 'sha256': PATCH.sha(actual_bytes)})
        appearance_proofs.append({'material_index': index, 'name': combined['materials'][index]['name'],
                                  'descriptor_sha256': PATCH.json_sha(combined['materials'][index]), 'images': images})
    PATCH.require(combined['materials'] == v04['materials'] and combined['textures'] == v04['textures'] and combined['images'] == v04['images'],
                  'Visitor/world appearance descriptors changed')
    PATCH.require(binary[:len(original_binary)] == original_binary, 'Original visitor/world binary prefix changed')
    proof = {**merge, 'growth_parent_sha256': EXPECTED[GROWTH], 'geometry_patch_sha256': EXPECTED[GEOMETRY],
             'contract_sha256': EXPECTED[CONTRACT], 'current_layout_sha256': layout['layout_sha256'],
             'current_source_files_match': layout['source_files'], 'active_hierarchy_and_transforms_match_growth_parent': True,
             'all_v04_npc_nodes_and_provenance_unchanged': True, 'all_v04_materials_images_textures_unchanged': True,
             'growth_architecture_material_texture_image_proofs': appearance_proofs,
             'architecture_leaf_proofs': growth_leaves, 'visitor_leaf_proofs': visitor_leaves,
             'fuji_source': 'v04 preserves its corrected inward UVs and original image; growth architecture never replaces this node',
             'active_mesh_count': len(expected_leaves), 'node_count': len(combined['nodes']),
             'stored_mesh_count': len(combined['meshes']),
             'stored_mesh_note': 'Eight old replaced mesh descriptors/payloads remain unreferenced; active scene measurements do not count them.',
             'scope': 'Both parent contributions compared from actual accessor payloads; no gameplay verification'}
    measured = MEASURE.measure(world, REFERENCE, args.layout, expected_openings=19, excluded_roots=DYNAMIC)
    PATCH.require(measured['architecture_triangles'] == 9907 and measured['npc_triangles'] == 12157, 'Unexpected combined geometry budget')
    PATCH.require(measured['raw_degenerate_triangles'] == 0 and measured['all_clearances_open'] and measured['all_seating_boards_clear'],
                  'Combined raw geometry/opening/seat check failed')
    reference = json.loads(REFERENCE.read_text()); original_record = json.loads(V04_RECORD.read_text())
    coverage = copy.deepcopy(reference['coverage'])
    for key, value in original_record['coverage'].items():
        if key.startswith('npcs_') or (key.startswith('fixtures_') and 'npc' in str(value)):
            coverage[key] = value
    # Existing coverage identifiers remain tied to the growth parent; only the
    # actual slot model/source metadata comes from the newly measured nodes.
    measured.update(coverage=coverage, source_placement_count=reference['source_placement_count'],
                    vertices=sum(combined['accessors'][p['attributes']['POSITION']]['count']
                                 for node in combined['nodes'] if 'mesh' in node
                                 for p in combined['meshes'][node['mesh']]['primitives']),
                    public_geometry_uses=reference['public_geometry_uses'],
                    base_layout_sha256=original_record['layout_sha256'], base_export_sha256=EXPECTED[V04],
                    growth_parent_sha256=EXPECTED[GROWTH],
                    growth_node_bounds_gltf_m=reference['growth_node_bounds_gltf_m'],
                    growth_bounds_scope='Copied from the growth parent only after exact named hierarchy/TRS and architecture payload equivalence passed.',
                    npc_source_record='assets/sento_visitors/quality/measurements.json',
                    preservation_record='assets/sento_environment/quality/v05/parent-preservation.json',
                    scope='Actual combined GLB geometry. All 19 opening interiors exclude the three moving door subtrees; five seat-board interiors tested. Gameplay and game lighting separate.')
    metadata = PATCH.metadata_audit(PATCH.Glb(world))
    for file, digest in EXPECTED.items():
        PATCH.require(PATCH.sha(file.read_bytes()) == digest, 'A source changed during integration')
    for file, data in [('parent-preservation.json', proof), ('measurements.json', measured), ('metadata-audit.json', metadata)]:
        (args.output_dir/file).write_text(json.dumps(data, indent=2)+'\n')
    print(json.dumps({k: measured[k] for k in ('export_sha256', 'export_bytes', 'architecture_triangles', 'npc_triangles', 'export_triangles',
                    'mesh_count', 'raw_degenerate_triangles', 'all_clearances_open', 'all_seating_boards_clear')}))


if __name__ == '__main__':
    main()
