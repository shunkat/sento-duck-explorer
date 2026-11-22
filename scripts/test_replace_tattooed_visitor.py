"""Focused variant composition regressions; synthetic test textures, no renders."""
import copy
import importlib.util
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest
import zlib

sys.dont_write_bytecode = True
SPEC = importlib.util.spec_from_file_location('tattoo_patch', Path(__file__).with_name('replace-tattooed-visitor.py'))
TATTOO = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(TATTOO)
PATCH = TATTOO.PATCH
ROOT = Path(__file__).resolve().parents[1]


def fixture_png():
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind+data))
    scanlines = (b'\0' + b'\x55\x66\x77' * 1024) * 1024
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 1024, 1024, 8, 2, 0, 0, 0)) +
            chunk(b'IDAT', zlib.compress(scanlines)) + chunk(b'IEND', b''))


class TattooedVisitorReplacementTests(unittest.TestCase):
    def setUp(self):
        (ROOT/'.local').mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix='tattoo-patch-test-', dir=ROOT/'.local')
        self.base = Path(self.temp.name); self.models = self.base/'models'; self.models.mkdir()
        self.output = self.base/'world.glb'; self.report = self.base/'audit.json'
        self.world = ROOT/TATTOO.DEFAULT_WORLD
        for suffix in TATTOO.SOURCE_SHA256:
            source = PATCH.Glb(ROOT/'public/models'/('npc_bath_standing'+suffix+'.glb'))
            doc = copy.deepcopy(source.doc)
            payloads = [source.view_bytes(i) for i in range(len(doc['bufferViews']))]
            part = doc['meshes'][0]['primitives'][0]
            # Duplicate one indexed corner solely to give it a separate UV.
            # The triangle count, oriented positions and normals stay identical.
            index_accessor = part['indices']; indices = source.accessor_rows(index_accessor)
            original_vertex = indices[0][0]
            count = doc['accessors'][part['attributes']['POSITION']]['count']
            for name, index in part['attributes'].items():
                rows = source.accessor_rows(index); extra = rows[original_vertex]
                if name == 'TEXCOORD_0':
                    extra = (.23, .37)
                a = doc['accessors'][index]; width = PATCH.WIDTH[a['type']]
                payloads[a['bufferView']] = b''.join(struct.pack('<'+'f'*width, *row) for row in [*rows, extra])
                a['count'] += 1
            indices[0] = (count,)
            a = doc['accessors'][index_accessor]; code = PATCH.COMPONENT[a['componentType']][0]
            payloads[a['bufferView']] = b''.join(struct.pack('<'+code, *row) for row in indices)
            payloads[doc['images'][0]['bufferView']] = fixture_png()
            doc['materials'][0]['name'] = 'tattoo_test_atlas'
            for node in doc['nodes']:
                node.setdefault('extras', {})['npc_role'] = TATTOO.ROLE
            (self.models/(TATTOO.ROLE+suffix+'.glb')).write_bytes(PATCH.encode_glb(doc, payloads))

    def tearDown(self):
        self.temp.cleanup()

    def run_patch(self):
        return TATTOO.replace(self.world, self.models, self.output, self.report, ROOT/'public/models')

    def rewrite_near(self, change):
        path = self.models/(TATTOO.ROLE+'.glb'); source = PATCH.Glb(path)
        doc = copy.deepcopy(source.doc); payloads = [bytearray(source.view_bytes(i)) for i in range(len(doc['bufferViews']))]
        change(doc, payloads); path.write_bytes(PATCH.encode_glb(doc, payloads))

    def test_seam_split_and_1024_atlas_preserve_all_other_world_payloads(self):
        before = self.world.read_bytes(); report = self.run_patch()
        self.assertEqual(self.world.read_bytes(), before)
        self.assertEqual(report['world_triangles'], 20153)
        self.assertEqual(report['candidates']['near']['vertices'], 848)
        self.assertEqual(report['candidates']['_lod_far']['vertices'], 348)
        self.assertEqual(report['candidates']['near']['atlas_pixels'], [1024, 1024])
        self.assertEqual(report['selected_nodes'], [24, 25, 26, 27])
        original, actual = PATCH.Glb(self.world), PATCH.Glb(self.output)
        self.assertEqual(len(actual.doc['materials']), 17); self.assertEqual(len(actual.doc['images']), 11)
        for index in range(len(original.doc['bufferViews'])):
            if index not in report['replaced_buffer_views']:
                self.assertEqual(original.view_bytes(index), actual.view_bytes(index))
        for i, node in enumerate(original.doc['nodes']):
            if i not in report['selected_nodes']:
                self.assertEqual(node, actual.doc['nodes'][i])
        # Includes the corrected Fuji UV payload and all six other visitors.
        self.assertEqual(len(report['unchanged_buffer_views']), 119)
        self.assertEqual(actual.doc['nodes'][27]['extras']['npc_role'], TATTOO.ROLE)
        near = PATCH.Glb(self.models/(TATTOO.ROLE+'.glb'))
        with self.assertRaisesRegex(ValueError, '512 px'):
            PATCH.candidate_facts(near, 'historical_role', 1600)

    def test_rejects_changed_body_or_normals(self):
        for semantic in ('POSITION', 'NORMAL'):
            with self.subTest(semantic=semantic):
                path = self.models/(TATTOO.ROLE+'.glb'); before = path.read_bytes()
                def change(doc, payloads):
                    a = doc['accessors'][doc['meshes'][0]['primitives'][0]['attributes'][semantic]]
                    old = struct.unpack_from('<f', payloads[a['bufferView']], 0)[0]
                    struct.pack_into('<f', payloads[a['bufferView']], 0, old+.01)
                self.rewrite_near(change)
                with self.assertRaisesRegex(ValueError, 'position/normal triangle soup'):
                    self.run_patch()
                self.assertFalse(self.output.exists()); path.write_bytes(before)

    def test_rejects_corrected_or_other_world_input(self):
        self.run_patch()
        with self.assertRaisesRegex(ValueError, 'Fuji-corrected v03'):
            TATTOO.replace(self.output, self.models, self.base/'again.glb', self.base/'again.json', ROOT/'public/models')

    def test_rejects_private_metadata_before_writing(self):
        self.rewrite_near(lambda doc, payloads: doc['nodes'][0]['extras'].update(source_file='.local/private/source.glb'))
        with self.assertRaisesRegex(ValueError, 'private/local path'):
            self.run_patch()
        self.assertFalse(self.output.exists())


if __name__ == '__main__':
    unittest.main()
