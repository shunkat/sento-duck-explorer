"""Derive far NPCs only from the independent public-source near candidates.

Blender --background --python-exit-code 1 --python scripts/build-distinct-npc-lods.py -- [--only npc_staff]

Near candidates remain unchanged. Six-hundred-triangle far GLBs stay private;
editable source/derived pairs and two-angle comparison renders are recorded in
assets/sento_visitors/lod. No playable father/child/duck model is read.
"""
import argparse
from array import array
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import struct
import sys
sys.dont_write_bytecode = True

import bpy
import bmesh
from mathutils import Matrix, Vector

ROOT = Path.cwd()
MODELS = ROOT / '.local/distinct-sento-npcs/models'
OUT = ROOT / 'assets/sento_visitors/lod'


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    result = importlib.util.module_from_spec(spec); spec.loader.exec_module(result); return result


PATCH = module('npc_patch', 'replace-background-npcs.py')
BLEND_QA = module('world_blend_qa', 'save-replaced-world-blend.py')
RENDER_QA = module('world_render_qa', 'render-replaced-world.py')
MEASURE = module('world_measure_qa', 'measure-replaced-world.py')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def active(obj):
    bpy.ops.object.select_all(action='DESELECT'); obj.hide_set(False); obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def flatten(obj):
    matrix = obj.matrix_world.copy(); obj.parent = None; obj.matrix_world = Matrix.Identity(4)
    obj.data.transform(matrix); obj.data.update()


def bounds(obj):
    points = [obj.matrix_world @ v.co for v in obj.data.vertices]
    return [min(p[i] for p in points) for i in range(3)], [max(p[i] for p in points) for i in range(3)]


def geometry_facts(obj):
    obj.data.calc_loop_triangles(); positions = array('f', (n for v in obj.data.vertices for n in v.co))
    return {'vertices': len(obj.data.vertices), 'triangles': len(obj.data.loop_triangles),
            'local_positions_sha256': hashlib.sha256(positions.tobytes()).hexdigest(),
            'bounds_blender_z_up': bounds(obj)}


def pack_and_scrub():
    for image in bpy.data.images:
        if image.type != 'IMAGE' or not image.size[0]:
            continue
        if not image.packed_file:
            image.pack()
        relative = '//textures/' + image.name.replace('/', '_').replace('\\', '_') + '.png'
        image.filepath = '//'+'x'*1000; image.filepath = relative
        for packed in image.packed_files:
            packed.filepath = '//'+'x'*1000; packed.filepath = relative
    for screen in bpy.data.screens:
        for area in screen.areas:
            for space in area.spaces:
                if space.type == 'FILE_BROWSER' and space.params:
                    space.params.directory = b'/'*1023; space.params.directory = b'//'
    bpy.context.scene.render.filepath = '//'
    bpy.context.preferences.filepaths.save_version = 0


def import_mesh(path, name):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(path.resolve()))
    imported = set(bpy.context.scene.objects)-before
    meshes = [obj for obj in imported if obj.type == 'MESH']
    assert len(meshes) == 1
    obj = meshes[0]; flatten(obj); obj.name = name
    for other in imported:
        if other != obj:
            bpy.data.objects.remove(other, do_unlink=True)
    return obj


def render_comparison(source, low, role, target):
    scene = bpy.context.scene; scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24; scene.cycles.use_denoising = True
    scene.cycles.diffuse_bounces = 1; scene.cycles.glossy_bounces = 1
    scene.render.resolution_x = 1440; scene.render.resolution_y = 1080; scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'; scene.view_settings.view_transform = 'AgX'
    scene.world = bpy.data.worlds.new('Neutral LOD inspection'); scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.72, .78, .84, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .6
    created = []
    for loc, energy, size in [((3,-4,5), 450, 4), ((-3,-2,3), 240, 3), ((0,3,4), 300, 3)]:
        bpy.ops.object.light_add(type='AREA', location=loc); light = bpy.context.object
        light.data.energy = energy; light.data.shape = 'DISK'; light.data.size = size
        RENDER_QA.aim(light, Vector((0, 0, .8))); created.append(light)
    bpy.ops.object.camera_add(location=(0, -4.3, 1.25)); camera = bpy.context.object; created.append(camera)
    camera.data.type = 'ORTHO'; camera.data.ortho_scale = 2.6
    RENDER_QA.aim(camera, Vector((0, 0, .78))); scene.camera = camera
    for x, label in [(-.62, 'NEAR'), (.62, 'FAR')]:
        bpy.ops.object.text_add(location=(x, -.15, -.18), rotation=(math.pi/2, 0, 0))
        text = bpy.context.object; text.data.body = label; text.data.align_x = 'CENTER'; text.data.size = .105; created.append(text)
    source.hide_set(False); source.hide_render = False; low.hide_set(False); low.hide_render = False
    source.rotation_mode = 'XYZ'; low.rotation_mode = 'XYZ'
    source.location.x = -.62; low.location.x = .62
    paths = []
    for label, angle in [('front', 0), ('threequarter', 40)]:
        source.rotation_euler.z = math.radians(angle); low.rotation_euler.z = math.radians(angle)
        bpy.context.view_layer.update()
        path = target / f'{role}_near_far_{label}.png'; scene.render.filepath = str(path.resolve())
        bpy.ops.render.render(write_still=True); RENDER_QA.strip_png_metadata(path); paths.append(path)
    # Actual switch-distance view: the game uses a 55-degree vertical FOV.
    # Each model's bounds center is approximately 6.1 m from the same camera;
    # no crop/upscale is applied to this 1280 x 720 comparison.
    source.rotation_euler.z = 0; low.rotation_euler.z = 0
    bpy.context.view_layer.update()
    center_height = sum(bounds(source)[i][2] for i in (0, 1))*.5
    center_depth = sum(bounds(source)[i][1] for i in (0, 1))*.5
    camera.data.type = 'PERSP'; camera.data.sensor_fit = 'VERTICAL'; camera.data.sensor_height = 32
    camera.data.lens = 32/(2*math.tan(math.radians(55)/2))
    camera.location = (0, center_depth-math.sqrt(6.1**2-.62**2), center_height)
    RENDER_QA.aim(camera, Vector((0, center_depth, center_height)))
    scene.render.resolution_x = 1280; scene.render.resolution_y = 720
    path = target / f'{role}_near_far_game_distance.png'; scene.render.filepath = str(path.resolve())
    bpy.ops.render.render(write_still=True); RENDER_QA.strip_png_metadata(path); paths.append(path)
    source.matrix_world = Matrix.Identity(4); low.matrix_world = Matrix.Identity(4)
    bpy.context.view_layer.update()
    for obj in created:
        bpy.data.objects.remove(obj, do_unlink=True)
    scene.camera = None
    return [{'file': p.relative_to(ROOT).as_posix(), 'sha256': sha(p)} for p in paths]


def produce(role, render=True):
    source_path = MODELS / f'{role}.glb'; output = MODELS / f'{role}_lod_far.glb'
    source_digest = sha(source_path); near_glb = PATCH.Glb(source_path)
    near_facts = PATCH.candidate_facts(near_glb, role, PATCH.NEAR_LIMITS[role])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    source = import_mesh(source_path, 'SOURCE_INDEPENDENT_NEAR')
    low = source.copy(); low.data = source.data.copy(); low.name = role+'_lod_far'; bpy.context.collection.objects.link(low)
    active(low)
    # glTF splits UV/normal seams. Weld co-located vertices while preserving loop
    # UVs before collapse. No remeshing, texture painting or face reconstruction.
    bm = bmesh.new(); bm.from_mesh(low.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-7); bm.to_mesh(low.data); bm.free(); low.data.update()
    lo, hi = bounds(low); height = hi[2]-lo[2]
    low.data.calc_loop_triangles(); original_triangles = len(low.data.loop_triangles)
    # Independent eye/eyebrow islands are not disposable surface detail.
    # Weight zero prevents their edges from entering Blender's collapse heap.
    # Preserve the adjacent front eye sockets too, so the simplified head cannot
    # cover the intact eyeballs. The body and rear head absorb most reduction.
    adjacency = [set() for _ in low.data.vertices]
    for edge in low.data.edges:
        a, b = edge.vertices; adjacency[a].add(b); adjacency[b].add(a)
    components = []; pending_vertices = set(range(len(low.data.vertices)))
    while pending_vertices:
        todo = [next(iter(pending_vertices))]; component = set()
        while todo:
            index = todo.pop()
            if index not in pending_vertices:
                continue
            pending_vertices.remove(index); component.add(index); todo.extend(adjacency[index])
        components.append(component)
    body_component = max(components, key=len)
    facial_components = []
    for component in components:
        if component is body_component:
            continue
        points = [low.data.vertices[i].co for i in component]
        span_x = max(p.x for p in points)-min(p.x for p in points)
        span_z = max(p.z for p in points)-min(p.z for p in points)
        if span_x < .12 and span_z < .09:
            facial_components.append(component)
    assert len(facial_components) >= 4, 'Expected two eye and two brow source islands'
    protected = set().union(*facial_components)
    eye_points = [low.data.vertices[i].co for i in protected]
    eye_min = [min(p[a] for p in eye_points) for a in range(3)]
    eye_max = [max(p[a] for p in eye_points) for a in range(3)]
    if role == 'npc_seated':
        for component in components:
            if component is body_component or component in facial_components:
                continue
            points = [low.data.vertices[i].co for i in component]
            if min(p.z for p in points) > .7*height and max(p.z for p in points) < .9*height:
                protected.update(component)  # Keep the distinctive beard continuous.
    edge_counts = {}
    for polygon in low.data.polygons:
        for edge in polygon.edge_keys:
            edge = tuple(sorted(edge)); edge_counts[edge] = edge_counts.get(edge, 0)+1
    hair_boundary = set()
    for component in components:
        if component is body_component:
            continue
        points = [low.data.vertices[i].co for i in component]
        if max(p.z for p in points) < hi[2]-.01:
            continue
        boundary = {v for edge, count in edge_counts.items() if count == 1 and all(i in component for i in edge) for v in edge}
        hair_boundary.update(boundary)
        for index in boundary:
            hair_boundary.update(adjacency[index])
    protected.update(hair_boundary)
    group = low.vertex_groups.new(name='Protected facial islands sockets and hairline')
    for vertex in low.data.vertices:
        t = (vertex.co.z-lo[2])/height
        eye_socket = (eye_min[0]-.012 < vertex.co.x < eye_max[0]+.012 and
                      eye_min[2]-.012 < vertex.co.z < eye_max[2]+.012 and
                      eye_min[1]-.025 < vertex.co.y < eye_max[1]+.025)
        nose_mouth = (abs(vertex.co.x) < .07 and
                      eye_min[2]-.10 < vertex.co.z < eye_min[2]-.015 and
                      vertex.co.y < eye_min[1]+.012)
        seat_contact = role == 'npc_seated' and .365 < vertex.co.z < .475 and -vertex.co.y < .37
        if vertex.index in protected or eye_socket or nose_mouth or seat_contact:
            weight = 0.0
        else:
            weight = .015 if t > .76 else .85
            if t < .025 or (abs(vertex.co.x) > .42*(hi[0]-lo[0]) and t > .34):
                weight = min(weight, .25)
        group.add([vertex.index], weight, 'REPLACE')
    if original_triangles > 594:
        modifier = low.modifiers.new('Independent source far reduction', 'DECIMATE')
        modifier.ratio = 594/original_triangles; modifier.vertex_group = group.name
        modifier.vertex_group_factor = 1.0; modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    low_bounds = bounds(low)
    # Exact floor contact is required by the runtime source contract. Preserve
    # the source envelope if collapse loses a silhouette extremum by >4 cm.
    floor_shift = low_bounds[0][2]-lo[2]
    for vertex in low.data.vertices:
        vertex.co.z -= floor_shift
    low_bounds = bounds(low)
    adjusted = False
    if max(math.dist(low_bounds[i], [lo, hi][i]) for i in (0, 1)) > .035:
        for vertex in low.data.vertices:
            for axis in range(3):
                span = low_bounds[1][axis]-low_bounds[0][axis]
                assert span > 0
                vertex.co[axis] = lo[axis]+(vertex.co[axis]-low_bounds[0][axis])*(hi[axis]-lo[axis])/span
        adjusted = True
    low.data.update()
    seat_lift_vertices = set()
    if role == 'npc_seated':
        # Keep simplified butt/thigh surfaces outside the unchanged wooden seat.
        # This envelope is conservative across all five placement bands.
        for _ in range(3):
            low.data.calc_loop_triangles(); touched = set()
            for triangle in low.data.loop_triangles:
                points = [(low.data.vertices[i].co.x, low.data.vertices[i].co.z, -low.data.vertices[i].co.y)
                          for i in triangle.vertices]
                if MEASURE.clipped_triangle(points, [-.4, .377788, -.32444], [.4, .449988, .32444]):
                    touched.update(i for i in triangle.vertices if low.data.vertices[i].co.z < .45002)
            if not touched:
                break
            for index in touched:
                vertex = low.data.vertices[index]
                assert vertex.co.z > .30, 'LOD contact repair would move a foot or lower shin'
                vertex.co.z = .45002
            seat_lift_vertices.update(touched); low.data.update()
    active(low)
    transfer = low.modifiers.new('Near surface normal continuity', 'DATA_TRANSFER')
    transfer.object = source; transfer.use_loop_data = True; transfer.data_types_loops = {'CUSTOM_NORMAL'}
    transfer.loop_mapping = 'POLYINTERP_NEAREST'
    bpy.ops.object.modifier_apply(modifier=transfer.name)
    if role == 'npc_seated':
        # The simplified pelvis spans concave near surfaces. Transferring those
        # underside normals across a new broad triangle creates a false dark
        # patch. Keep the protected head normals; derive body normals from its
        # actual far geometry instead.
        low.data.update(); low.data.calc_loop_triangles()
        corner_normals = [normal.vector.copy() for normal in low.data.corner_normals]
        sums = [Vector((0, 0, 0)) for _ in low.data.vertices]
        face_normals = {}
        for triangle in low.data.loop_triangles:
            a, b, c = [low.data.vertices[i].co for i in triangle.vertices]
            cross = (b-a).cross(c-a)
            for index in triangle.vertices:
                sums[index] += cross
            face_normals[triangle.polygon_index] = cross.normalized()
        combined = list(corner_normals)
        for polygon in low.data.polygons:
            face_normal = face_normals[polygon.index]
            for loop_index in polygon.loop_indices:
                index = low.data.loops[loop_index].vertex_index
                if low.data.vertices[index].co.z > height*.76:
                    continue
                normal = sums[index].normalized()
                # Split sharp concave thigh/hip folds. An upward top face must
                # not inherit underside normals through a shared vertex.
                combined[loop_index] = face_normal if normal.dot(face_normal) < .5 else normal
        low.data.normals_split_custom_set(combined)
    root_extras = near_glb.doc['nodes'][near_facts['root_node']].get('extras', {})
    for key, value in root_extras.items():
        low[key] = value
    low['asset_id'] = role+'_lod_far'; low['derived_from_model'] = f'public/models/{role}.glb'
    low['derived_from_sha256'] = source_digest; low['lod_target_triangles'] = 600
    low['modifications_lod'] = 'Source topology collapse with protected face/contact regions and near-surface normals; original atlas unchanged'
    pack_and_scrub(); active(low)
    bpy.ops.export_scene.gltf(filepath=str(output.resolve()), export_format='GLB', use_selection=True,
                              export_yup=True, export_extras=True, export_cameras=False, export_lights=False)
    # Preserve the exact sanitized source PNG bytes if Blender re-encodes it.
    actual = PATCH.Glb(output); near_image = near_glb.view_bytes(near_glb.doc['images'][0]['bufferView'])
    image_view = actual.doc['images'][0]['bufferView']
    payloads = [actual.view_bytes(i) for i in range(len(actual.doc['bufferViews']))]
    payloads[image_view] = near_image; output.write_bytes(PATCH.encode_glb(actual.doc, payloads))
    actual = PATCH.Glb(output); far_facts = PATCH.candidate_facts(actual, role+'_lod_far', 600)
    primitive = actual.doc['meshes'][0]['primitives'][0]
    positions = actual.accessor_rows(primitive['attributes']['POSITION'])
    indices = [row[0] for row in actual.accessor_rows(primitive['indices'])]
    degenerate = sum(MEASURE.triangle_area([positions[j] for j in indices[i:i+3]]) < 1e-14
                     for i in range(0, len(indices), 3))
    assert not degenerate, 'Far NPC has degenerate triangles'
    seat_intrusions = None
    if role == 'npc_seated':
        seat_intrusions = sum(bool(MEASURE.clipped_triangle([positions[j] for j in indices[i:i+3]],
                              [-.4, .377788, -.32444], [.4, .449988, .32444]))
                              for i in range(0, len(indices), 3))
        assert seat_intrusions == 0, 'Far seated NPC intersects the seat-board envelope'
    deltas = [math.dist(near_facts['bounds'][i], far_facts['bounds'][i]) for i in (0, 1)]
    assert max(deltas) <= .04, 'LOD bounds contract failed'
    assert actual.view_bytes(actual.doc['images'][0]['bufferView']) == near_image
    # Inspect the emitted GLBs, rather than the modifier preview.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    source = import_mesh(source_path, 'SOURCE_INDEPENDENT_NEAR')
    low = import_mesh(output, role+'_lod_far')
    quality = OUT / 'quality'; blend_dir = OUT / 'blend'
    quality.mkdir(parents=True, exist_ok=True); blend_dir.mkdir(parents=True, exist_ok=True)
    images = render_comparison(source, low, role, quality) if render else []
    source.hide_set(True); source.hide_render = True
    pack_and_scrub()
    before_geometry = {obj.name: geometry_facts(obj) for obj in (source, low)}
    before_images = BLEND_QA.image_facts()
    blend = blend_dir / f'{role}__lod_far_v01.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend.resolve()), compress=True)
    bpy.ops.wm.open_mainfile(filepath=str(blend.resolve()))
    after_geometry = {name: geometry_facts(bpy.data.objects[name]) for name in before_geometry}
    assert before_geometry == after_geometry
    assert before_images == BLEND_QA.image_facts()
    binary_metadata = BLEND_QA.binary_metadata_audit(blend)
    assert sha(source_path) == source_digest, 'Near input changed during LOD derivation'
    report = {'role': role, 'source_model': f'public/models/{role}.glb', 'source_sha256': source_digest,
              'export_model': f'public/models/{role}_lod_far.glb', 'export_sha256': sha(output),
              'near': near_facts, 'far': far_facts, 'lod_min_max_distances_m': deltas,
              'floor_contact_adjustment_m': floor_shift, 'source_envelope_fit_applied': adjusted,
              'face_protection': 'Eye and brow connected components plus adjacent sockets, nose and mouth vertices excluded from collapse',
              'protected_facial_island_vertices': len(protected), 'protected_hairline_vertices': len(hair_boundary),
              'game_distance_comparison': {'vertical_fov_degrees': 55, 'viewport': [1280, 720], 'distance_m': 6.1},
              'raw_degenerate_triangles': degenerate, 'seat_board_envelope_intersections': seat_intrusions,
              'seat_contact_lifted_vertices': len(seat_lift_vertices),
              'normal_method': 'Near-surface head normals; independent cross-product area-weighted body normals, split at sharp folds' if role == 'npc_seated' else 'Near-surface transferred normals',
              'source_atlas_bytes_identical': True, 'source_atlas_sha256': hashlib.sha256(near_image).hexdigest(),
              'blend_source': blend.relative_to(ROOT).as_posix(), 'blend_sha256': sha(blend),
              'reopened_geometry_images_identical': True, 'binary_metadata_audit': binary_metadata,
              'comparisons': images, 'source_unchanged': True,
              'scope': 'Static far LOD from independent near source; no playable family model referenced; visual acceptance is recorded separately.'}
    (quality / f'{role}_lod_measurements.json').write_text(json.dumps(report, indent=2)+'\n')
    print('INDEPENDENT_NPC_LOD', json.dumps({'role': role, 'sha256': sha(output), 'triangles': far_facts['triangles'],
                                          'bounds_deltas_m': deltas, 'atlas_bytes_identical': True}), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only', choices=list(PATCH.NEAR_LIMITS))
    parser.add_argument('--no-render', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    for role in ([args.only] if args.only else PATCH.NEAR_LIMITS):
        produce(role, not args.no_render)


if __name__ == '__main__':
    main()
