"""Source-fitted, proportion-preserving basin experiment. Run from repository root.

Writes v02 working/inspection files and a private candidate only. The original
Meshy download, v01, references and public model are never written by this script.
"""
import bpy
import bmesh
import hashlib
import json
import math
import statistics
import struct
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path.cwd()
ASSET = ROOT / 'assets/wash_basin'
BLEND = ASSET / 'blend'
QUALITY = ASSET / 'quality/v02'
RAW = ASSET / 'gen/wash_basin__meshy6lite_raw_v01.glb'
CANDIDATE = ROOT / '.local/quality-v02/candidates/wash_basin.glb'
DIAMETER = .20
PROFILE_POINTS = 32
LOW_SECTORS = 64
LOW_PROFILE_POINTS = 24
MASTER_SECTORS = 48
BASE_COLOR = (1.0, .68, .003, 1.0)


def activate(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.hide_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def extent(obj):
    coordinates = [obj.matrix_world @ v.co for v in obj.data.vertices]
    return (Vector([min(p[i] for p in coordinates) for i in range(3)]),
            Vector([max(p[i] for p in coordinates) for i in range(3)]))


def uniform_diameter_and_bottom(obj):
    activate(obj)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    lo, hi = extent(obj)
    center = Vector(((lo.x+hi.x)/2, (lo.y+hi.y)/2, lo.z))
    scale = DIAMETER / max(hi.x-lo.x, hi.y-lo.y)
    for vertex in obj.data.vertices:
        vertex.co = (obj.matrix_world @ vertex.co - center) * scale
    obj.location = (0, 0, 0)
    obj.rotation_euler = (0, 0, 0)
    obj.scale = (1, 1, 1)
    obj.data.update()
    return scale


def measure(obj):
    obj.data.calc_loop_triangles()
    lo, hi = extent(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    facts = {
        'vertices': len(obj.data.vertices), 'triangles': len(obj.data.loop_triangles),
        'nonmanifold_edges': sum(not e.is_manifold for e in bm.edges),
        'volume_m3': bm.calc_volume(signed=False),
        'finite': all(math.isfinite(c) for v in obj.data.vertices for c in v.co),
        'gltf_bounds_min': [lo.x, lo.z, -hi.y],
        'gltf_bounds_max': [hi.x, hi.z, -lo.y],
        'dimensions_m': [hi.x-lo.x, hi.z-lo.z, hi.y-lo.y],
    }
    bm.free()
    hit, point, normal, index = obj.ray_cast(Vector((0, 0, .3)), Vector((0, 0, -1)))
    facts['center_interior_floor_height_m'] = point.z if hit else None
    facts['cavity_depth_m'] = hi.z-point.z if hit else None
    # A ray from beneath distinguishes solid floor from an opening through it.
    hit_under, point_under, _, _ = obj.ray_cast(Vector((0, 0, -.1)), Vector((0, 0, 1)))
    facts['center_underside_height_m'] = point_under.z if hit_under else None
    facts['center_floor_thickness_m'] = point.z-point_under.z if hit and hit_under else None
    return facts


def radial_profiles(obj, profile_points=PROFILE_POINTS, smooth_radius=4, planarize=True):
    paths = []
    for index in range(12):
        angle = index*math.pi/12
        radial = Vector((math.cos(angle), math.sin(angle), 0))
        normal = Vector((-math.sin(angle), math.cos(angle), 0))
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        cut = bmesh.ops.bisect_plane(bm, geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
            dist=1e-7, plane_co=(0, 0, 0), plane_no=normal,
            clear_inner=False, clear_outer=False)
        links = {}
        for edge in cut['geom_cut']:
            if not isinstance(edge, bmesh.types.BMEdge):
                continue
            a, b = [Vector((v.co.dot(radial), v.co.z)) for v in edge.verts]
            if max(a.x, b.x) < 0:
                continue
            if a.x < 0:
                a = a.lerp(b, -a.x/(b.x-a.x))
            if b.x < 0:
                b = b.lerp(a, -b.x/(a.x-b.x))
            ka = (round(a.x, 7), round(a.y, 7))
            kb = (round(b.x, 7), round(b.y, 7))
            if ka == kb:
                continue
            links.setdefault(ka, set()).add(kb)
            links.setdefault(kb, set()).add(ka)
        ends = [p for p, neighbours in links.items() if len(neighbours) == 1]
        if len(ends) != 2:
            raise RuntimeError(f'Expected two centerline cut endpoints, got {len(ends)}')
        current = min(ends, key=lambda p: p[1])
        path = [Vector(current)]
        previous = None
        while True:
            candidates = links[current]-({previous} if previous is not None else set())
            if not candidates:
                break
            if len(candidates) != 1:
                raise RuntimeError('Ambiguous generated contour')
            following = next(iter(candidates))
            path.append(Vector(following))
            previous, current = current, following
            if len(path) > len(links)+1:
                raise RuntimeError('Generated contour did not terminate')
        bm.free()
        distances = [0.0]
        for a, b in zip(path, path[1:]):
            distances.append(distances[-1]+(b-a).length)
        samples = []
        segment = 0
        for i in range(1001):
            distance = distances[-1]*i/1000
            while segment < len(path)-2 and distances[segment+1] < distance:
                segment += 1
            t = (distance-distances[segment])/(distances[segment+1]-distances[segment])
            samples.append(path[segment].lerp(path[segment+1], t))
        paths.append(samples)
    averaged = [sum((p[i] for p in paths), Vector((0, 0)))/len(paths) for i in range(1001)]
    smoothed = [sum(averaged[max(0, i-smooth_radius):min(len(averaged), i+smooth_radius+1)], Vector((0, 0))) /
        len(averaged[max(0, i-smooth_radius):min(len(averaged), i+smooth_radius+1)]) for i in range(len(averaged))]
    # The manufactured floor is planar. Blend into the measured wall, rather
    # than flattening every point below one abrupt radius threshold.
    top_index = max(range(len(smoothed)), key=lambda i: smoothed[i].y)
    floor = smoothed[-1].y
    bottom = smoothed[0].y
    if planarize:
        for index, p in enumerate(smoothed):
            t = max(0, min(1, (p.x-.055)/.010))
            t = t*t*(3-2*t)
            target = bottom if index < top_index else floor
            p.y = target*(1-t)+p.y*t
    smoothed[0].x = 0
    smoothed[-1].x = 0
    selected = [0, len(smoothed)-1]
    while len(selected) < profile_points:
        worst = (-1, None)
        for left, right in zip(selected, selected[1:]):
            start, end = smoothed[left], smoothed[right]
            segment = end-start
            for i in range(left+1, right):
                t = max(0, min(1, (smoothed[i]-start).dot(segment)/segment.length_squared))
                error = (smoothed[i]-(start+segment*t)).length_squared
                if error > worst[0]:
                    worst = (error, i)
        selected.append(worst[1])
        selected.sort()
    chosen = [smoothed[i].copy() for i in selected]
    return chosen, {
        'radial_cuts': 12, 'equal_arc_samples_per_cut': 1001,
        'profile_control_points': len(chosen),
        'profile_rings': len(chosen)-2,
        'smoothing_sample_radius': smooth_radius, 'floor_planarized': planarize,
        'uniform_source_profile_m': [[p.x, p.y] for p in averaged],
        'control_profile_m': [[p.x, p.y] for p in chosen],
        'adjustments': ['12 measured radial contours averaged to suppress angular dents',
            f'{2*smooth_radius+1}-sample contour smoothing',
            'floor planarized below 55 mm radius with 10 mm smooth transition' if planarize else 'existing floor shape retained',
            'no independent XYZ target fit; raw height/diameter ratio retained approximately'],
    }


def make_surface(name, profile, sectors, material, collection):
    vertices = [(0, 0, profile[0].y)]
    for radius, z in profile[1:-1]:
        vertices.extend((radius*math.cos(i*2*math.pi/sectors),
            radius*math.sin(i*2*math.pi/sectors), z) for i in range(sectors))
    end = len(vertices)
    vertices.append((0, 0, profile[-1].y))
    rings = len(profile)-2
    faces = []
    for i in range(sectors):
        j = (i+1) % sectors
        faces.append((0, 1+j, 1+i))
        for ring in range(rings-1):
            a = 1+ring*sectors
            b = a+sectors
            faces.append((a+i, a+j, b+j, b+i))
        a = 1+(rings-1)*sectors
        faces.append((a+i, a+j, end))
    mesh = bpy.data.meshes.new(name+' source-fit control mesh')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.materials.append(material)
    return obj


def add_subdivision(obj, levels):
    modifier = obj.modifiers.new('Measured profile curvature refinement', 'SUBSURF')
    modifier.subdivision_type = 'CATMULL_CLARK'
    modifier.levels = levels
    modifier.render_levels = levels
    return modifier


def evaluated_copy(obj, name):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = bpy.data.meshes.new_from_object(evaluated)
    result = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(result)
    return result


def hide(obj):
    obj.hide_render = True
    obj.hide_set(True)


def setup_render():
    # Deliberately unchanged from v01: geometry improvements must survive the
    # same lighting, view transform, lens, pixel count and material context.
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 768
    scene.render.resolution_y = 768
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'AgX'
    world = bpy.data.worlds.new('Basin inspection world')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.16, .19, .22, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = .55
    scene.world = world
    for pos, energy, size in [((.35,-.6,.8),28,.55),((-.5,-.15,.3),15,.45),((.1,.6,.5),22,.5)]:
        bpy.ops.object.light_add(type='AREA', location=pos)
        lamp = bpy.context.object
        lamp.data.energy = energy
        lamp.data.size = size
        lamp.rotation_euler = (Vector((0,0,.07))-lamp.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = .255
    scene.camera = camera
    return scene, camera


def render(scene, camera, name, direction):
    target = Vector((0, 0, .07))
    camera.location = target+Vector(direction).normalized()*.8
    camera.rotation_euler = (target-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath = str(QUALITY/(name+'.png'))
    bpy.ops.render.render(write_still=True)
    strip_png_metadata(Path(scene.render.filepath))


def strip_png_metadata(path):
    """Remove non-pixel PNG metadata; retain image/color chunks byte-for-byte."""
    data = path.read_bytes()
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('Not a PNG')
    output = bytearray(data[:8])
    offset = 8
    while offset < len(data):
        length = struct.unpack('>I', data[offset:offset+4])[0]
        kind = data[offset+4:offset+8]
        chunk = data[offset:offset+length+12]
        if kind not in (b'tEXt', b'zTXt', b'iTXt', b'eXIf'):
            output.extend(chunk)
        offset += length+12
    path.write_bytes(output)


def canonicalize_export_base_color(path):
    """Retain GLB geometry bytes while writing the evaluated linear RGB choice."""
    data = path.read_bytes()
    length, kind = struct.unpack_from('<II', data, 12)
    assert kind == 0x4E4F534A
    document = json.loads(data[20:20+length])
    document['materials'][0]['pbrMetallicRoughness']['baseColorFactor'] = list(BASE_COLOR)
    payload = json.dumps(document, separators=(',', ':')).encode()
    payload += b' '*((-len(payload)) % 4)
    binary_chunks = data[20+length:]
    output = struct.pack('<III', 0x46546C67, 2, 12+8+len(payload)+len(binary_chunks))
    output += struct.pack('<II', len(payload), 0x4E4F534A)+payload+binary_chunks
    path.write_bytes(output)


def main():
    QUALITY.mkdir(parents=True, exist_ok=True)
    BLEND.mkdir(parents=True, exist_ok=True)
    CANDIDATE.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(RAW))
    source = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
    source.name = 'SOURCE_original_Meshy_geometry'
    original = measure(source)
    preserved = bpy.data.collections.new('01 SOURCE - original geometry and original transform')
    bpy.context.scene.collection.children.link(preserved)
    for collection in list(source.users_collection):
        collection.objects.unlink(source)
    preserved.objects.link(source)
    source['source_file'] = RAW.name
    source['source_sha256'] = hashlib.sha256(RAW.read_bytes()).hexdigest()
    source['provenance'] = 'Original imported geometry and transform; not normalized, not smoothed'
    hide(source)
    working = source.copy()
    working.data = source.data.copy()
    working.hide_render = False
    bpy.context.scene.collection.objects.link(working)
    scale = uniform_diameter_and_bottom(working)
    raw_uniform = measure(working)
    working.name = 'MEASURED_raw_uniform_200mm_diameter'
    # Measure the source shape before any cleanup. A restrained surface smooth
    # helps contour extraction without repeating the prior 30-pass smoothing.
    working_raw = working.copy()
    working_raw.data = working.data.copy()
    preserved.objects.link(working_raw)
    working_raw.name = 'SOURCE_uniform_scale_only'
    hide(working_raw)
    activate(working)
    smooth = working.modifiers.new('Fine noise only - eight restrained passes', 'SMOOTH')
    smooth.factor = .35
    smooth.iterations = 8
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    profile, section_details = radial_profiles(working)
    bpy.data.objects.remove(working, do_unlink=True)
    editable = bpy.data.collections.new('02 MASTER - editable source-fitted surface and profile')
    bpy.context.scene.collection.children.link(editable)
    material = bpy.data.materials.new('warm_yellow_satin_plastic_v02')
    material.use_nodes = True
    bsdf = material.node_tree.nodes['Principled BSDF']
    # Linear RGB, with restrained green and very low blue to retain the warm
    # saturated yellow seen in the reference under unchanged AgX lighting.
    bsdf.inputs['Base Color'].default_value = BASE_COLOR
    bsdf.inputs['Roughness'].default_value = .34
    bsdf.inputs['Metallic'].default_value = 0
    master = make_surface('MASTER_source_fitted_basin', profile, MASTER_SECTORS, material, editable)
    add_subdivision(master, 2)
    master['provenance'] = '12 actual Meshy radial sections; not a generic bowl primitive'
    master['control_profile_json'] = json.dumps([[p.x, p.y] for p in profile])
    master['editing'] = 'Edit source-fitted control loops; keep the open mouth and solid bottom'
    # Preserve an explicit editable 2D cross-section alongside the surface.
    curve = bpy.data.curves.new('Measured editable radial profile', 'CURVE')
    curve.dimensions = '3D'
    spline = curve.splines.new('POLY')
    spline.points.add(len(profile)-1)
    for point, (radius, z) in zip(spline.points, profile):
        point.co = (radius, 0, z, 1)
    curve_object = bpy.data.objects.new('PROFILE_measured_radius_height', curve)
    editable.objects.link(curve_object)
    hide(curve_object)
    master_evaluated = evaluated_copy(master, 'MASTER_evaluated_inspection')
    uniform_diameter_and_bottom(master_evaluated)
    master_facts = measure(master_evaluated)
    # Allocate low mesh loops to the already-smoothed master curvature. This
    # removes redundant side-wall/floor rings without simplifying the master.
    low_profile, low_section_details = radial_profiles(master_evaluated,
        profile_points=LOW_PROFILE_POINTS, smooth_radius=0, planarize=False)
    low_control = make_surface('LOW_adaptive_master_profile', low_profile, LOW_SECTORS, material, editable)
    body = evaluated_copy(low_control, 'wash_basin')
    final_uniform_correction = uniform_diameter_and_bottom(body)
    activate(body)
    transfer = body.modifiers.new('Smooth normals from clean high-resolution master', 'DATA_TRANSFER')
    transfer.object = master_evaluated
    transfer.use_loop_data = True
    transfer.data_types_loops = {'CUSTOM_NORMAL'}
    transfer.loop_mapping = 'POLYINTERP_NEAREST'
    bpy.ops.object.modifier_apply(modifier=transfer.name)
    master_bm = bmesh.new()
    master_bm.from_mesh(master_evaluated.data)
    master_bvh = BVHTree.FromBMesh(master_bm)
    master_bm.free()
    master_distances = sorted(master_bvh.find_nearest(v.co)[3] for v in body.data.vertices)
    master_comparison = {'low_vertex_to_master_surface_max_m': max(master_distances),
        'low_vertex_to_master_surface_median_m': statistics.median(master_distances),
        'low_vertex_to_master_surface_p95_m': master_distances[int(len(master_distances)*.95)],
        'method': 'One-sided vertex nearest-surface samples; not a full Hausdorff or pixel error'}
    low_bm = bmesh.new()
    low_bm.from_mesh(body.data)
    low_bvh = BVHTree.FromBMesh(low_bm)
    low_bm.free()
    reverse_distances = sorted(low_bvh.find_nearest(v.co)[3] for v in master_evaluated.data.vertices)
    master_comparison.update({'master_vertex_to_low_surface_max_m': max(reverse_distances),
        'master_vertex_to_low_surface_median_m': statistics.median(reverse_distances),
        'master_vertex_to_low_surface_p95_m': reverse_distances[int(len(reverse_distances)*.95)],
        'method': 'Bidirectional vertex nearest-surface samples; not a continuous Hausdorff or pixel error'})
    # Source-distance is a provenance/fidelity diagnostic, never a substitute
    # for reference-image comparison. Both comparisons use uniform-only source.
    bm = bmesh.new()
    bm.from_mesh(working_raw.data)
    bvh = BVHTree.FromBMesh(bm)
    bm.free()
    distances = sorted(bvh.find_nearest(v.co)[3] for v in body.data.vertices)
    shape_comparison = {'target_to_uniform_raw_max_m': max(distances),
        'target_to_uniform_raw_median_m': statistics.median(distances),
        'target_to_uniform_raw_p95_m': distances[int(len(distances)*.95)]}
    for obj in [master, low_control, master_evaluated]:
        hide(obj)
    body['asset_license'] = 'CC-BY-4.0'
    body['attribution'] = 'Meshy 6 Lite; modified in Blender for Sento Duck Explorer'
    body['modifications'] = ('Uniform-only raw scaling; actual radial-section retopology; circular symmetry; '
        'smooth planar floor transition; editable subdivided master plus adaptive-profile low; '
        'normals transferred from clean master; yellow satin material')
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.render.filepath = '//'
    for screen in bpy.data.screens:
        for area in screen.areas:
            for space in area.spaces:
                if space.type == 'FILE_BROWSER' and space.params:
                    space.params.directory = b'/'*1023
                    space.params.directory = b'//'
    activate(body)
    blend_path = BLEND/'wash_basin__v02.blend'
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path), compress=False)
    bpy.ops.export_scene.gltf(filepath=str(CANDIDATE), export_format='GLB', use_selection=True,
        export_yup=True, export_extras=True, export_cameras=False, export_lights=False,
        export_copyright='Meshy 6 Lite output, CC BY 4.0; Blender modifications by Sento Duck Explorer contributors')
    canonicalize_export_base_color(CANDIDATE)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(CANDIDATE))
    result = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
    final_facts = measure(result)
    facts = {'raw_original': original, 'raw_uniform_200mm_diameter': raw_uniform,
        'raw_uniform_scale': scale, 'subdivision_uniform_scale': final_uniform_correction,
        'reimported_candidate': final_facts, 'master_evaluated': master_facts,
        'retopology': section_details, 'source_shape_comparison': shape_comparison,
        'low_profile': low_section_details,
        'low_to_master_comparison': master_comparison,
        'normal_method': 'Nearest-polygon-interpolated custom normals transferred from clean evaluated master',
        'low_sectors': LOW_SECTORS, 'low_subdivision_level': 0,
        'master_sectors_before_subdivision': MASTER_SECTORS, 'master_subdivision_level': 2,
        'shape_decision': 'Raw diameter-normalized height is about 90 mm; preserve this natural source proportion. Not a measured real-world dimension.',
        'material_count': len(result.data.materials), 'texture_count': 0,
        'base_color_linear_rgb': list(BASE_COLOR[:3]), 'roughness': .34,
        'render_conditions': 'Unchanged from v01: AgX, Cycles 24 samples, three area lights, 768 square, orthographic .255 m, focus z .07 m',
        'candidate_bytes': CANDIDATE.stat().st_size,
        'candidate_sha256': hashlib.sha256(CANDIDATE.read_bytes()).hexdigest(),
        'blend_bytes': blend_path.stat().st_size,
        'blend_sha256': hashlib.sha256(blend_path.read_bytes()).hexdigest(),
        'raw_bytes': RAW.stat().st_size,
        'raw_sha256': hashlib.sha256(RAW.read_bytes()).hexdigest(),
        'blender_version': bpy.app.version_string,
        'not_verified': ['whole-game rendering', 'performance on reference device', 'user visual acceptance']}
    (QUALITY/'measurements.json').write_text(json.dumps(facts, indent=2)+'\n')
    assert final_facts['nonmanifold_edges'] == 0
    assert final_facts['finite'] and final_facts['center_floor_thickness_m'] > .001
    assert final_facts['cavity_depth_m'] > .05
    assert .085 < final_facts['dimensions_m'][1] < .10
    assert final_facts['triangles'] <= 3000
    scene, camera = setup_render()
    for name, direction in [('threequarter', (1,-1.5,1.2)), ('front', (0,-1,.15)),
            ('interior', (.2,-.3,1.7)), ('underside', (1,-1,-1))]:
        render(scene, camera, name, direction)
    result.hide_render = True
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(RAW))
    raw_display = next(o for o in set(bpy.context.scene.objects)-before if o.type == 'MESH')
    uniform_diameter_and_bottom(raw_display)
    raw_display.data.materials.clear()
    raw_display.data.materials.append(result.data.materials[0])
    for polygon in raw_display.data.polygons:
        polygon.use_smooth = True
    render(scene, camera, 'raw_uniform_same_material', (1,-1.5,1.2))
    raw_display.hide_render = True
    with bpy.data.libraries.load(str(blend_path), link=False) as (data_from, data_to):
        data_to.objects = ['MASTER_evaluated_inspection']
    master_display = data_to.objects[0]
    bpy.context.scene.collection.objects.link(master_display)
    master_display.hide_render = False
    master_display.hide_set(False)
    render(scene, camera, 'master_threequarter', (1,-1.5,1.2))
    # Include retained iterations and colour studies in metadata hygiene.
    for png in QUALITY.rglob('*.png'):
        strip_png_metadata(png)
    assert hashlib.sha256(RAW.read_bytes()).hexdigest() == facts['raw_sha256']
    print('BASIN_V02_MEASUREMENTS '+json.dumps({k:v for k,v in facts.items() if k not in ['retopology', 'low_profile']}))


if __name__ == '__main__':
    main()
