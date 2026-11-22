"""Focused byte-preservation and wrong-input regressions for the mural patch."""
import importlib.util
from pathlib import Path
import struct
import sys
import unittest

sys.dont_write_bytecode = True
SPEC = importlib.util.spec_from_file_location('mural_fix', Path(__file__).with_name('fix-fuji-mural-uv.py'))
FIX = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(FIX)


class FujiMuralFixTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = FIX.DEFAULT_INPUT.read_bytes()
        cls.result, cls.report = FIX.fix(cls.raw)

    def test_only_four_inward_u_values_change(self):
        report = self.report
        self.assertEqual([e['vertex'] for e in report['affected_vertices']], [6, 9, 18, 21])
        allowed = set()
        for edit in report['affected_vertices']:
            at = edit['file_byte_offset']; allowed.update(range(at, at+4))
            self.assertEqual(self.result[at:at+4], struct.pack('<f', 1-edit['before_uv'][0]))
            self.assertEqual(self.raw[at+4:at+8], self.result[at+4:at+8])
        self.assertEqual(len(self.raw), len(self.result))
        self.assertTrue(all(a == b or i in allowed for i, (a, b) in enumerate(zip(self.raw, self.result))))
        # Expected descriptor and art hashes are independently pinned by fix().
        self.assertTrue(report['unchanged_header_and_json'])
        self.assertTrue(report['original_art_bytes_unchanged'])

    def test_repeating_original_is_deterministic_but_corrected_input_is_rejected(self):
        self.assertEqual(FIX.fix(self.raw)[0], self.result)
        with self.assertRaisesRegex(ValueError, 'must not be flipped again'):
            FIX.fix(self.result)

    def test_changed_source_is_rejected(self):
        changed = bytearray(self.raw); changed[-1] ^= 1
        with self.assertRaisesRegex(ValueError, 'not the audited uncorrected world'):
            FIX.fix(bytes(changed))


if __name__ == '__main__':
    unittest.main()
