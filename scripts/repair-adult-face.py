"""Repair Adult's face UV coverage without altering geometry or the source.

Run in Blender: --background --python-exit-code 1 --python scripts/repair-adult-face.py
The candidate remains private; promotion and rigging are separate stages.
"""
from pathlib import Path
import bpy, math, json, hashlib, runpy, re, sys
import numpy as np
from mathutils import Vector

ROOT = Path.cwd()
HELPERS = runpy.run_path(str(ROOT / 'scripts/refine-human-models.py'))
OUT = ROOT / '.local/human-face-walk/face'
QUALITY = ROOT / 'assets/adult/quality/face-uv-v03'
BLEND = ROOT / 'assets/adult/blend/adult__face_uv_v03.blend'
CANDIDATE = OUT / 'adult-face-v03.glb'
for directory in (OUT, QUALITY):
    directory.mkdir(parents=True, exist_ok=True)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def geometry_signature(obj):
    mesh = obj.data
    mesh.calc_loop_triangles()
    points = np.asarray([v.co[:] for v in mesh.vertices], dtype=np.float32)
    triangles = np.asarray([t.vertices[:] for t in mesh.loop_triangles], dtype=np.int32)
    reference = np.asarray([a.vector[:] for a in mesh.attributes['reference_position'].data], dtype=np.float32)
    normals = np.asarray([n.vector[:] for n in mesh.corner_normals], dtype=np.float32)
    return dict(vertices=len(points), triangles=len(triangles),
                position_sha256=hashlib.sha256(points.tobytes()).hexdigest(),
                topology_sha256=hashlib.sha256(triangles.tobytes()).hexdigest(),
                reference_position_sha256=hashlib.sha256(reference.tobytes()).hexdigest(),
                corner_normals_sha256=hashlib.sha256(normals.tobytes()).hexdigest())


def eye_faces(obj):
    reference = obj.data.attributes['reference_position'].data
    indices = []
    for poly in obj.data.polygons:
        center = sum((reference[i].vector for i in poly.vertices), Vector()) / len(poly.vertices)
        if abs(center.x) < .12 and 1.46 < center.z < 1.56 and center.y < -.065:
            indices.append(poly.index)
    return indices


def patch_count(obj, indices):
    uv = obj.data.uv_layers.active.data
    return sum(all(uv[i].uv.x < .59 for i in obj.data.polygons[index].loop_indices)
               for index in indices)


def repair_uv(obj):
    mesh = obj.data
    reference = mesh.attributes['reference_position'].data
    # Select in reference coordinates, before the Adult pose depth offset.
    # The connected front head hemisphere includes both complete eyes, brows,
    # smile, cheeks and hairline. Angle-based unfolding prevents the ears,
    # nose folds and overhanging hair from sharing projected UV coordinates.
    front_faces = set()
    for poly in mesh.polygons:
        points = [reference[index].vector for index in poly.vertices]
        if all(p.z > 1.26 and p.y < .025 for p in points):
            front_faces.add(poly.index)
    HELPERS['activate'](obj)
    bpy.context.tool_settings.mesh_select_mode = (False, False, True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(70), island_margin=.025)
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')
    for poly in mesh.polygons:
        poly.select = poly.index in front_faces
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.uv.unwrap(method='ANGLE_BASED', margin=.025)
    bpy.ops.object.mode_set(mode='OBJECT')
    uv = mesh.uv_layers.active.data
    front_values = np.asarray([uv[index].uv[:] for poly in mesh.polygons
                               if poly.index in front_faces for index in poly.loop_indices])
    minimum, maximum = front_values.min(0), front_values.max(0)
    for poly in mesh.polygons:
        for index in poly.loop_indices:
            point = np.asarray(uv[index].uv[:])
            if poly.index in front_faces:
                point = (point-minimum)/(maximum-minimum)
                uv[index].uv = (.025+point[0]*.53, .025+point[1]*.95)
            else:
                uv[index].uv = (.59+point[0]*.385, .025+point[1]*.95)
    return len(front_faces)


def face_color_material(outfit):
    material = HELPERS['color_material']('adult', outfit)
    tree = material.node_tree
    field = HELPERS['Field']
    attribute = tree.nodes.new('ShaderNodeAttribute')
    attribute.attribute_name = 'reference_position'
    separate = tree.nodes.new('ShaderNodeSeparateXYZ')
    tree.links.new(attribute.outputs['Vector'], separate.inputs[0])
    x, y, z = [field(tree, output) for output in separate.outputs]
    # The old narrow ear ellipse left large hair-colored wedges across the
    # actual ear attachment. A measured oval with a soft boundary follows the
    # complete front ear and blends into the retained hair behind it.
    ellipse = ((x.abs()-.168)/.060).square()+((z-1.405)/.092).square()
    ear = (ellipse.smooth(.80, 1.08)*-1+1) * (y.smooth(-.005, .025)*-1+1)
    emission = next(node for node in tree.nodes if node.type == 'EMISSION')
    previous = emission.inputs['Color'].links[0].from_socket
    mix = tree.nodes.new('ShaderNodeMixRGB')
    mix.blend_type = 'MIX'
    tree.links.new(ear.v, mix.inputs[0])
    tree.links.new(previous, mix.inputs[1])
    mix.inputs[2].default_value = (.91, .48, .245, 1)
    tree.links.new(mix.outputs[0], emission.inputs['Color'])
    return material


def render_checks():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(CANDIDATE))
    root = bpy.data.objects['adult']
    HELPERS['render_checks']('adult', root, QUALITY)
    scene = bpy.context.scene
    camera = scene.camera
    target = Vector((-.014, 0, 1.4875))
    camera.location = target + Vector((.42, -1, .06)).normalized() * 6.8
    camera.rotation_euler = (target-camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.ortho_scale = .66
    for outfit in ('clothed', 'bath'):
        for obj in scene.objects:
            if obj.type == 'MESH':
                obj.hide_render = obj.name != 'outfit_' + outfit
        scene.render.filepath = str(QUALITY / (outfit + '_face_threequarter.png'))
        bpy.ops.render.render(write_still=True)
        HELPERS['strip_png'](Path(scene.render.filepath))


def audit_uv_and_metadata():
    """Check the actual saved candidate; count overlaps at 1024 pixel centers."""
    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
    coverage_facts = {}
    for name in ('outfit_clothed', 'outfit_bath'):
        obj = bpy.data.objects[name]
        mesh = obj.data
        uv = mesh.uv_layers.active.data
        mesh.calc_loop_triangles()
        coverage = np.zeros((1024, 1024), dtype=np.int16)
        features = np.zeros_like(coverage, dtype=bool)
        eyes = np.zeros_like(features)
        for triangle in mesh.loop_triangles:
            points = np.asarray([uv[index].uv[:] for index in triangle.loops])*1024
            if points[:, 0].max() >= .59*1024:
                continue
            low = np.maximum(0, np.floor(points.min(0)).astype(int))
            high = np.minimum(1024, np.ceil(points.max(0)).astype(int))
            if np.any(low >= high):
                continue
            x, y = np.meshgrid(np.arange(low[0], high[0])+.5,
                               np.arange(low[1], high[1])+.5)
            a, b, c = points
            determinant = (b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
            if abs(determinant) < 1e-9:
                continue
            u = ((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/determinant
            v = ((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/determinant
            inside = (u>1e-7) & (v>1e-7) & (u+v<1-1e-7)
            region = np.s_[low[1]:high[1], low[0]:high[0]]
            coverage[region] += inside
            reference = mesh.attributes['reference_position'].data
            center = sum((reference[index].vector for index in triangle.vertices), Vector())/3
            if abs(center.x)<.13 and 1.35<center.z<1.555 and center.y<-.065:
                features[region] |= inside
            if ((abs(center.x)-.057)/.032)**2+((center.z-1.493)/.046)**2<1 and center.y<-.065:
                eyes[region] |= inside
        coverage_facts[name] = dict(
            face_patch_covered_texels=int((coverage>0).sum()),
            face_patch_overlapping_texels=int((coverage>1).sum()),
            facial_feature_region_texels=int(features.sum()),
            facial_features_overlapping_texels=int(((coverage>1) & features).sum()),
            eye_neighborhood_texels=int(eyes.sum()),
            eye_neighborhood_overlapping_texels=int(((coverage>1) & eyes).sum()))
        assert coverage_facts[name]['face_patch_overlapping_texels'] == 0
    packed = all(image.packed_file for image in bpy.data.images if image.type == 'IMAGE')
    assert packed
    private = OUT / 'adult-uncompressed-audit.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(private), compress=False, copy=True)
    patterns = {
        'private_home_path': rb'/(?:Users|home)/[^/\x00\s]+/',
        'email_like': rb'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}',
        'token_prefix': rb'(?:github_pat_|ghp_|sk-proj-)[A-Za-z0-9_-]{10,}',
    }
    findings = {}
    for label, path in [('uncompressed_blend', private), ('candidate_glb', CANDIDATE)]:
        findings[label] = [label for label, pattern in patterns.items() if re.search(pattern, path.read_bytes())]
        assert not findings[label], (label, findings[label])
    private.unlink()
    report = dict(result='PASS', candidate_sha256=digest(CANDIDATE), blend_sha256=digest(BLEND),
                  uv_1024_pixel_center_coverage=coverage_facts, packed_images=packed,
                  metadata_heuristic_findings=findings,
                  limits='UV overlap is sampled at 1024 pixel centers, excluding exact triangle edges. Metadata scan is heuristic, not exhaustive.')
    (QUALITY / 'uv-and-metadata-audit.json').write_text(json.dumps(report, indent=2)+'\n')
    return report


def main():
    source = ROOT / 'assets/adult/blend/adult__v02.blend'
    bpy.ops.wm.open_mainfile(filepath=str(source))
    root = bpy.data.objects['adult']
    facts = dict(source='assets/adult/blend/adult__v02.blend', source_sha256=digest(source),
                 cause='Face UV selection used posed world depth instead of source reference depth; the Adult +0.10 m pose offset split the face into small body islands.',
                 geometry_unchanged=True, meshes={})
    for outfit in ('clothed', 'bath'):
        obj = bpy.data.objects['outfit_' + outfit]
        before = geometry_signature(obj)
        eyes = eye_faces(obj)
        old_coverage = patch_count(obj, eyes)
        face_triangles = repair_uv(obj)
        new_coverage = patch_count(obj, eyes)
        assert new_coverage == len(eyes), (outfit, 'Incomplete face patch')
        obj.data.materials.clear()
        obj.data.materials.append(face_color_material(outfit))
        image = HELPERS['bake'](obj, 'adult', outfit)
        image.name = 'adult_' + outfit + '_basecolor_face_uv_v03'
        after = geometry_signature(obj)
        assert before == after, (outfit, 'Geometry or reference attributes changed')
        facts['meshes'][obj.name] = dict(**after, face_patch_triangles=face_triangles,
                                      eye_region_triangles=len(eyes), old_eye_patch_triangles=old_coverage,
                                      repaired_eye_patch_triangles=new_coverage,
                                      embedded_texture_size=list(image.size))
    root['face_uv_revision'] = 'v03: complete source-space front head selection, angle-based UV unfolding and supersampled 1024 bake'
    for obj in root.children:
        if obj.type == 'MESH':
            obj.hide_set(obj.name == 'outfit_bath')
            obj.hide_render = obj.name == 'outfit_bath'
    bpy.context.scene.render.filepath = '//'
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'FILE_BROWSER':
                try:
                    area.spaces.active.params.directory = b'/' * 1023
                    area.spaces.active.params.directory = b'//'
                except Exception:
                    pass
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND), compress=True)
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for obj in root.children:
        obj.hide_set(False)
        obj.hide_render = False
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(CANDIDATE), export_format='GLB', use_selection=True,
                              export_extras=True, export_apply=False, export_materials='EXPORT',
                              export_yup=True, export_cameras=False, export_lights=False,
                              export_copyright='Meshy 6 Lite output, CC BY 4.0; Blender modifications by Sento Duck Explorer')
    facts['png_sanitization'] = HELPERS['SANITIZE_GLB'](CANDIDATE)
    facts.update(candidate_sha256=digest(CANDIDATE), candidate_bytes=CANDIDATE.stat().st_size,
                 blend_sha256=digest(BLEND))
    (QUALITY / 'measurements.json').write_text(json.dumps(facts, indent=2)+'\n')
    audit_uv_and_metadata()
    render_checks()
    print(json.dumps(facts, indent=2))


if __name__ == '__main__':
    if '--audit-only' in sys.argv:
        print(json.dumps(audit_uv_and_metadata(), indent=2))
    else:
        main()
