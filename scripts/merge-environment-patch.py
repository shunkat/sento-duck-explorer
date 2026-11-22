"""Merge a Blender-authored architecture patch without rewriting unrelated GLB data.

Only named replacement nodes and explicitly parented additions may change.
Existing materials, images, NPCs and all existing binary bytes are preserved.
The patch uses existing materials by name; it cannot replace their appearance.
"""
import argparse
import copy
import hashlib
import json
import struct
from pathlib import Path


def read_glb(path):
    raw = Path(path).read_bytes()
    magic, version, size = struct.unpack_from('<III', raw)
    if magic != 0x46546C67 or version != 2 or size != len(raw):
        raise ValueError('Expected a complete glTF 2.0 GLB')
    chunks = {}
    offset = 12
    while offset < len(raw):
        length, kind = struct.unpack_from('<II', raw, offset)
        chunks[kind] = raw[offset + 8:offset + 8 + length]
        offset += length + 8
    document = json.loads(chunks[0x4E4F534A])
    binary = chunks.get(0x004E4942, b'')
    if len(document.get('buffers', [])) != 1 or document['buffers'][0].get('uri'):
        raise ValueError('Only one embedded buffer is supported')
    return document, binary[:document['buffers'][0]['byteLength']]


def write_glb(path, document, binary):
    document['buffers'] = [{'byteLength': len(binary)}]
    encoded = json.dumps(document, separators=(',', ':'), ensure_ascii=False).encode()
    encoded += b' ' * (-len(encoded) % 4)
    binary += b'\0' * (-len(binary) % 4)
    total = 12 + 8 + len(encoded) + 8 + len(binary)
    Path(path).write_bytes(struct.pack('<III', 0x46546C67, 2, total)
                           + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
                           + struct.pack('<II', len(binary), 0x004E4942) + binary)


def unique_nodes(document):
    result = {}
    for i, node in enumerate(document.get('nodes', [])):
        name = node.get('name')
        if name:
            if name in result:
                raise ValueError('Duplicate named node: ' + name)
            result[name] = i
    return result


def node_fingerprint(document, binary, name):
    """Offsets may change in another branch; actual geometry/material must not."""
    node = document['nodes'][unique_nodes(document)[name]]
    data = {k: v for k, v in node.items() if k not in ('mesh', 'extras')}
    if node.get('children'):
        raise ValueError('Replacement targets must be leaf meshes: ' + name)
    mesh = copy.deepcopy(document['meshes'][node['mesh']])
    for primitive in mesh['primitives']:
        accessors = list(primitive['attributes'].items())
        if 'indices' in primitive:
            accessors.append(('indices', primitive['indices']))
        digest_data = {}
        for key, index in accessors:
            accessor = copy.deepcopy(document['accessors'][index])
            view = document['bufferViews'][accessor.pop('bufferView')]
            start = view.get('byteOffset', 0)
            blob = binary[start:start + view['byteLength']]
            digest_data[key] = {'accessor': accessor,
                                'stride': view.get('byteStride'),
                                'data_sha256': hashlib.sha256(blob).hexdigest()}
        primitive.pop('indices', None)
        primitive['attributes'] = digest_data
        if 'material' in primitive:
            primitive['material'] = document['materials'][primitive['material']].get('name')
    data['mesh'] = mesh
    return hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()


def merge(base_path, patch_path, contract_path, output_path):
    base, original_binary = read_glb(base_path)
    patch, patch_binary = read_glb(patch_path)
    contract = json.loads(Path(contract_path).read_text())
    names = unique_nodes(base)
    patch_names = unique_nodes(patch)
    replacements = contract['replacements']
    additions = contract['additions']
    if patch.get('skins') or patch.get('animations'):
        raise ValueError('Architecture patch cannot include skins or animation')
    for name, expected in replacements.items():
        if node_fingerprint(base, original_binary, name) != expected:
            raise ValueError('Replacement target changed since patch preparation: ' + name)
    for name, parent in additions.items():
        if name in names or parent not in names:
            raise ValueError('Addition name exists or parent is missing: ' + name)

    used_nodes = set()
    def visit(index):
        if index in used_nodes:
            return
        used_nodes.add(index)
        for child in patch['nodes'][index].get('children', []):
            visit(child)
    for name in [*replacements, *additions]:
        visit(patch_names[name])

    result = copy.deepcopy(base)
    binary = bytearray(original_binary)
    material_names = {m.get('name'): i for i, m in enumerate(base.get('materials', []))}
    views, accessors, meshes = {}, {}, {}

    def map_view(index):
        if index not in views:
            source = patch['bufferViews'][index]
            if source.get('buffer', 0) != 0 or source.get('extensions'):
                raise ValueError('Unsupported patch buffer view')
            binary.extend(b'\0' * (-len(binary) % 4))
            start = source.get('byteOffset', 0)
            view = copy.deepcopy(source)
            view['buffer'] = 0
            view['byteOffset'] = len(binary)
            binary.extend(patch_binary[start:start + source['byteLength']])
            views[index] = len(result.setdefault('bufferViews', []))
            result['bufferViews'].append(view)
        return views[index]

    def map_accessor(index):
        if index not in accessors:
            accessor = copy.deepcopy(patch['accessors'][index])
            if 'sparse' in accessor or 'bufferView' not in accessor:
                raise ValueError('Unsupported patch accessor')
            accessor['bufferView'] = map_view(accessor['bufferView'])
            accessors[index] = len(result.setdefault('accessors', []))
            result['accessors'].append(accessor)
        return accessors[index]

    def map_mesh(index):
        if index not in meshes:
            mesh = copy.deepcopy(patch['meshes'][index])
            for primitive in mesh['primitives']:
                if primitive.get('targets') or primitive.get('extensions'):
                    raise ValueError('Unsupported patch mesh extensions/targets')
                primitive['attributes'] = {k: map_accessor(v) for k, v in primitive['attributes'].items()}
                if 'indices' in primitive:
                    primitive['indices'] = map_accessor(primitive['indices'])
                if 'material' in primitive:
                    name = patch['materials'][primitive['material']].get('name')
                    if name not in material_names:
                        raise ValueError('Patch material is not in the source environment: ' + str(name))
                    primitive['material'] = material_names[name]
            meshes[index] = len(result.setdefault('meshes', []))
            result['meshes'].append(mesh)
        return meshes[index]

    mapping = {patch_names[name]: names[name] for name in replacements}
    for index in sorted(used_nodes):
        if index not in mapping:
            mapping[index] = len(result['nodes'])
            result['nodes'].append({})
    for index in sorted(used_nodes):
        node = copy.deepcopy(patch['nodes'][index])
        if 'skin' in node or node.get('extensions'):
            raise ValueError('Unsupported patch node')
        if 'mesh' in node:
            node['mesh'] = map_mesh(node['mesh'])
        if 'children' in node:
            node['children'] = [mapping[c] for c in node['children']]
        result['nodes'][mapping[index]] = node
    for name, parent in additions.items():
        result['nodes'][names[parent]].setdefault('children', []).append(mapping[patch_names[name]])

    root = result['nodes'][names['sento_environment']]
    root.setdefault('extras', {})['base_layout_sha256'] = root['extras']['layout_sha256']
    root['extras']['layout_sha256'] = contract['layout_sha256']
    root.setdefault('extras', {})['growth_layout_sha256'] = contract['layout_sha256']
    root['extras']['growth_patch_method'] = 'Local Blender architecture patch; existing unrelated GLB bytes preserved'
    changed_indices = {names[n] for n in replacements} | {names[p] for p in additions.values()} | {names['sento_environment']}
    assert all(node == result['nodes'][i] for i, node in enumerate(base['nodes']) if i not in changed_indices)
    assert result.get('images') == base.get('images')
    assert result.get('textures') == base.get('textures')
    assert result.get('materials') == base.get('materials')
    assert bytes(binary[:len(original_binary)]) == original_binary
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    write_glb(output, result, bytes(binary))
    # Confirm the serialized result, including original bytes and named contracts.
    reread, rebinary = read_glb(output)
    assert rebinary[:len(original_binary)] == original_binary
    unique_nodes(reread)
    return {'base_sha256': hashlib.sha256(Path(base_path).read_bytes()).hexdigest(),
            'output_sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
            'output_bytes': output.stat().st_size,
            'preserved_source_binary_bytes': len(original_binary),
            'replaced_nodes': list(replacements), 'added_nodes': additions,
            'materials_images_textures_unchanged': True}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', required=True)
    parser.add_argument('--patch', required=True)
    parser.add_argument('--contract', required=True)
    parser.add_argument('--output', required=True)
    options = parser.parse_args()
    print(json.dumps(merge(options.base, options.patch, options.contract, options.output), indent=2))
