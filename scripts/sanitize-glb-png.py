"""Remove ancillary text/EXIF from embedded PNGs without changing image pixels.

All non-image buffer views and all retained PNG chunks remain byte-identical.
Image offsets stay unchanged: removed bytes become zero padding outside the
shortened image buffer view. No geometry, material or transform is modified.
"""
import argparse
import copy
import hashlib
import json
import struct
from pathlib import Path

REMOVED = {b'tEXt', b'zTXt', b'iTXt', b'eXIf'}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def clean_png(raw):
    assert raw[:8] == b'\x89PNG\r\n\x1a\n'
    cleaned = bytearray(raw[:8]); removed = []; i = 8
    while i < len(raw):
        n = struct.unpack_from('>I', raw, i)[0]
        kind = raw[i+4:i+8]
        chunk = raw[i:i+n+12]
        assert len(chunk) == n+12
        if kind in REMOVED:
            removed.append(kind.decode('ascii'))
        else:
            cleaned.extend(chunk)
        i += n+12
    assert i == len(raw)
    return bytes(cleaned), removed


def sanitize(path):
    path = Path(path)
    raw = path.read_bytes()
    assert raw[:4] == b'glTF' and struct.unpack_from('<I', raw, 4)[0] == 2
    n, kind = struct.unpack_from('<I4s', raw, 12)
    assert kind == b'JSON'
    gltf = json.loads(raw[20:20+n])
    original = copy.deepcopy(gltf)
    size, kind = struct.unpack_from('<I4s', raw, 20+n)
    assert kind == b'BIN\x00' and 28+n+size == len(raw)
    assert len(gltf['buffers']) == 1 and 'uri' not in gltf['buffers'][0]
    binary = bytearray(raw[28+n:])
    original_binary = bytes(binary)
    images = []
    for img in gltf.get('images', []):
        assert 'uri' not in img and img['mimeType'] == 'image/png'
        index = img['bufferView']; view = gltf['bufferViews'][index]
        offset, length = view.get('byteOffset', 0), view['byteLength']
        before = original_binary[offset:offset+length]
        after, removed = clean_png(before)
        if removed:
            binary[offset:offset+length] = after + bytes(length-len(after))
            view['byteLength'] = len(after)
        images.append({'name': img.get('name', ''), 'buffer_view': index,
                       'removed_chunk_types': removed, 'png_before_sha256': digest(before),
                       'png_after_sha256': digest(after), 'retained_chunks_sha256': digest(after),
                       'retained_chunks_identical': True})
    image_views = {item['buffer_view'] for item in images}
    for index, view in enumerate(original['bufferViews']):
        if index in image_views: continue
        start, length = view.get('byteOffset', 0), view['byteLength']
        assert binary[start:start+length] == original_binary[start:start+length]
    check = copy.deepcopy(gltf)
    for index in image_views: check['bufferViews'][index]['byteLength'] = original['bufferViews'][index]['byteLength']
    assert check == original
    if any(item['removed_chunk_types'] for item in images):
        encoded = json.dumps(gltf, separators=(',', ':'), ensure_ascii=False).encode()
        encoded += b' ' * ((-len(encoded)) % 4)
        output = struct.pack('<4sII', b'glTF', 2, 28+len(encoded)+len(binary))
        output += struct.pack('<I4s', len(encoded), b'JSON') + encoded
        output += struct.pack('<I4s', len(binary), b'BIN\x00') + binary
        path.write_bytes(output)
    else:
        output = raw
    return {'file': path.name, 'before_sha256': digest(raw), 'after_sha256': digest(output),
            'bytes': len(output), 'non_image_buffer_views_identical': True,
            'geometry_materials_transforms_unchanged': True, 'images': images,
            'scope': 'Ancillary metadata removal only. Every retained PNG chunk, including IHDR and IDAT, is byte-identical.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('files', nargs='+', type=Path)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    reports = [sanitize(path) for path in args.files]
    if args.report: args.report.write_text(json.dumps(reports, indent=2)+'\n')
    print(json.dumps(reports, indent=2))
