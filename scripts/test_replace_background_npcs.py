"""Focused asset-patcher regression checks; no browser or gameplay is involved.

Run: python3 -m unittest discover -s scripts -p 'test_replace_background_npcs.py'
"""
import copy
import importlib.util
import json
from pathlib import Path
import shutil
import struct
import sys
sys.dont_write_bytecode = True
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('npc_patch', Path(__file__).with_name('replace-background-npcs.py'))
PATCH = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PATCH)
MEASURE_SPEC = importlib.util.spec_from_file_location('world_measure', Path(__file__).with_name('measure-replaced-world.py'))
MEASURE = importlib.util.module_from_spec(MEASURE_SPEC); MEASURE_SPEC.loader.exec_module(MEASURE)
ROOT = Path(__file__).resolve().parents[1]


class BackgroundNpcReplacementTests(unittest.TestCase):
    def setUp(self):
        (ROOT / '.local').mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix='npc-patch-test-', dir=ROOT / '.local')
        self.base = Path(self.temp.name)
        self.models = self.base / 'models'; self.models.mkdir()
        for role in PATCH.NEAR_LIMITS:
            for suffix in ('', '_lod_far'):
                name = role + suffix + '.glb'
                shutil.copyfile(ROOT / 'public/models' / name, self.models / name)
        # This suite exercises the historical three-role replacement producer.
        # Later appearance variants use their own producer and preservation tests.
        self.world = ROOT / 'assets/sento_environment/blend/sento_environment__v03.glb'
        self.output = self.base / 'world.glb'; self.report = self.base / 'audit.json'

    def tearDown(self):
        self.temp.cleanup()

    def rewrite(self, name, change):
        path = self.models / (name + '.glb')
        glb = PATCH.Glb(path)
        doc = copy.deepcopy(glb.doc)
        payloads = [bytearray(glb.view_bytes(i)) for i in range(len(doc['bufferViews']))]
        change(doc, payloads)
        path.write_bytes(PATCH.encode_glb(doc, payloads))

    @staticmethod
    def scale_positions(doc, payloads, scale):
        index = doc['meshes'][0]['primitives'][0]['attributes']['POSITION']
        accessor = doc['accessors'][index]
        view_index = accessor['bufferView']; view = doc['bufferViews'][view_index]
        for i in range(accessor['count']):
            offset = accessor.get('byteOffset', 0) + i * view.get('byteStride', 12)
            xyz = struct.unpack_from('<3f', payloads[view_index], offset)
            struct.pack_into('<3f', payloads[view_index], offset, *(v * scale[j] for j, v in enumerate(xyz)))
        for key in ('min', 'max'):
            if key in accessor:
                accessor[key] = [v * scale[i] for i, v in enumerate(accessor[key])]

    def run_patch(self):
        return PATCH.replace(self.world, self.models, self.output, self.report, allow_legacy_fixture=True)

    def test_geometry_changes_only_inside_npc_slots_and_inputs_survive(self):
        # A real geometry change makes this stronger than merely repacking the world.
        self.rewrite('npc_staff', lambda d, p: self.scale_positions(d, p, (.98, 1, 1)))
        before = {p: PATCH.sha(p.read_bytes()) for p in [self.world, *self.models.glob('*.glb')]}
        result = self.run_patch()
        audit = json.loads(self.report.read_text())
        self.assertEqual(result['slots_preserved'], 7)
        self.assertEqual(len(audit['preservation']['architecture_mesh_descriptors_identical']), 26)
        self.assertEqual(len(audit['preservation']['architecture_materials']), 14)
        self.assertEqual(len(audit['preservation']['architecture_images']), 8)
        self.assertGreater(audit['old_unreferenced_payload_bytes_removed'], 0)
        self.assertLessEqual(result['bytes'], 7_000_000)
        source, actual = PATCH.Glb(self.models / 'npc_staff.glb'), PATCH.Glb(self.output)
        source_pos = source.doc['meshes'][0]['primitives'][0]['attributes']['POSITION']
        mesh = audit['npc_slots']['staff']['mesh']
        actual_pos = actual.doc['meshes'][mesh]['primitives'][0]['attributes']['POSITION']
        self.assertEqual(source.accessor_rows(source_pos), actual.accessor_rows(actual_pos))
        self.assertEqual(before, {p: PATCH.sha(p.read_bytes()) for p in before})

    def test_rejects_far_bounds_mismatch_without_writing_output(self):
        self.rewrite('npc_staff_lod_far', lambda d, p: self.scale_positions(d, p, (1.5, 1, 1)))
        with self.assertRaisesRegex(ValueError, 'near/far bounds'):
            self.run_patch()
        self.assertFalse(self.output.exists())

    def test_rejects_unapplied_mesh_transform(self):
        def change(doc, payloads):
            next(n for n in doc['nodes'] if 'mesh' in n)['translation'] = [0, .2, 0]
        self.rewrite('npc_staff', change)
        with self.assertRaisesRegex(ValueError, 'apply mesh/ancestor transforms'):
            self.run_patch()
        self.assertFalse(self.output.exists())

    def test_rejects_private_path_metadata(self):
        def change(doc, payloads):
            doc['nodes'][0].setdefault('extras', {})['source_file'] = '.local/private/source.glb'
        self.rewrite('npc_staff', change)
        with self.assertRaisesRegex(ValueError, 'private/local path'):
            self.run_patch()
        self.assertFalse(self.output.exists())

    def test_rejects_father_provenance_in_production_mode(self):
        def change(doc, payloads):
            doc['nodes'][0].setdefault('extras', {})['parent_asset'] = 'adult'
        self.rewrite('npc_staff', change)
        with self.assertRaisesRegex(ValueError, 'playable father'):
            PATCH.replace(self.world, self.models, self.output, self.report)
        self.assertFalse(self.output.exists())

    def test_clearance_check_detects_npc_inside_existing_passage(self):
        glb = PATCH.Glb(self.world); doc = copy.deepcopy(glb.doc)
        next(n for n in doc['nodes'] if n.get('name') == 'npc_slot_staff')['translation'] = [-1.5, 0, 8.5]
        self.output.write_bytes(PATCH.encode_glb(doc, [glb.view_bytes(i) for i in range(len(doc['bufferViews']))]))
        measured = MEASURE.measure(self.output, ROOT / 'assets/sento_environment/quality/v03/measurements.json')
        self.assertFalse(measured['all_clearances_open'])
        narrow = next(c for c in measured['clearances'] if c['id'] == 'narrow_hole')
        self.assertGreater(narrow['intersecting_triangles'], 0)
        self.assertIn('npc_staff_body', narrow['intersecting_mesh_names'])

    def test_triangle_bounds_overlap_does_not_fake_an_intersection(self):
        self.assertFalse(MEASURE.clipped_triangle([(0, 3, .5), (3, 0, .5), (3, 3, .5)], [0, 0, 0], [1, 1, 1]))
        self.assertTrue(MEASURE.clipped_triangle([(-1, .5, .5), (2, .5, .5), (.5, 2, .5)], [0, 0, 0], [1, 1, 1]))

    def test_seat_board_detects_a_thin_thigh_intrusion_between_sample_points(self):
        # A seat-anchor ray can miss the middle of this sloping thigh triangle.
        triangle = [(.035, .4526, .2047), (.109, .4391, .3455), (.127, .4529, .3372)]
        lo, hi = [-.4, .377788, -.32444], [.4, .449988, .32444]
        self.assertTrue(MEASURE.clipped_triangle(triangle, lo, hi))
        corrected = [(x, max(y, .45002), z) for x, y, z in triangle]
        self.assertFalse(MEASURE.clipped_triangle(corrected, lo, hi))

    def test_cannot_overwrite_input_world(self):
        before = PATCH.sha(self.world.read_bytes())
        with self.assertRaisesRegex(ValueError, 'overwrite an input'):
            PATCH.replace(self.world, self.models, self.world, self.report, allow_legacy_fixture=True)
        self.assertEqual(before, PATCH.sha(self.world.read_bytes()))


if __name__ == '__main__':
    unittest.main()
