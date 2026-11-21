"""Derive distance LODs from the fixed, source-derived washing-station v02.

Run from the repository root with Blender --background --python this_file.
Canonical v02 exports and Blender sources are read only. Four separate candidate
GLBs are written under .local/environment-refresh/lod; runtime promotion is separate.
"""
import bpy
import bmesh
import hashlib
import json
import math
import statistics
import struct
import subprocess
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path.cwd()
CAND = ROOT / '.local/environment-refresh/lod'
OUT = ROOT / 'assets/wash_station/quality/lod'
CAND.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
ASSETS = ('bath_stool', 'wash_basin')
EXPECTED = {'bath_stool': '1df13475185623882db1d63d99cc52f9ebff03cc40d62fb5136672a4f7515e55',
            'wash_basin': '29196b8bc4b62edec5f81a4831b183472f34f86cc2477ae1cd7653386be80111'}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def active(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.hide_set(False)
    obj.hide_render = False
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def geometry_digest(obj):
    payload = [list(v.co) for v in obj.data.vertices], [list(p.vertices) for p in obj.data.polygons], [list(r) for r in obj.matrix_world]
    return hashlib.sha256(json.dumps(payload, separators=(',', ':')).encode()).hexdigest()


def bounds(obj):
    points = [obj.matrix_world @ v.co for v in obj.data.vertices]
    return Vector([min(v[i] for v in points) for i in range(3)]), Vector([max(v[i] for v in points) for i in range(3)])


def transfer_normals(obj, source):
    active(obj)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    transfer = obj.modifiers.new('Normal continuity from exact v02 source', 'DATA_TRANSFER')
    transfer.object = source
    transfer.use_loop_data = True
    transfer.data_types_loops = {'CUSTOM_NORMAL'}
    transfer.loop_mapping = 'POLYINTERP_NEAREST'
    bpy.ops.object.modifier_apply(modifier=transfer.name)


def make_stool(source, name, target):
    obj = source.copy()
    obj.data = source.data.copy()
    obj.name = name
    bpy.context.scene.collection.objects.link(obj)
    active(obj)
    feature = source.data.attributes.get('quality_feature_loop')
    protected = set()
    for edge in source.data.edges:
        if feature and feature.data[edge.index].value > .5:
            protected.update(edge.vertices)
    group = obj.vertex_groups.new(name='Collapse planar surfaces before protected feature contours')
    # Fix the actual v02 drain bevel neighborhood, rather than allowing its
    # capsule contour to turn into a six-sided hole at the far target budget.
    fixed_slot = [v.co.copy() for v in source.data.vertices
                  if abs(v.co.x) < .05 and abs(v.co.y) < .022 and v.co.z > .28]
    assert len(fixed_slot) == 126
    for vertex in obj.data.vertices:
        # Blender's high collapse weights encourage reduction. Low weights
        # protect the original supported contours and the foot contact band.
        weight = .05 if vertex.index in protected or vertex.co.z < .009 else 1
        if abs(vertex.co.x) < .05 and abs(vertex.co.y) < .022 and vertex.co.z > .28:
            weight = 0
        group.add([vertex.index], weight, 'REPLACE')
    source.data.calc_loop_triangles()
    decimate = obj.modifiers.new('Feature-weighted distance simplification', 'DECIMATE')
    decimate.ratio = target / len(source.data.loop_triangles)
    decimate.vertex_group = group.name
    decimate.vertex_group_factor = .15
    decimate.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    # Collapse can place a few vertices just outside the original envelope.
    # Clamp those overshoots only, without stretching the whole object.
    lo, hi = bounds(source)
    clamped = 0
    max_clamp = 0
    for vertex in obj.data.vertices:
        old = vertex.co.copy()
        vertex.co = Vector([max(lo[i], min(hi[i], vertex.co[i])) for i in range(3)])
        delta = (vertex.co - old).length
        if delta > 1e-10:
            clamped += 1
            max_clamp = max(max_clamp, delta)
    obj.data.update()
    assert all(any((v.co-p).length < 1e-8 for v in obj.data.vertices) for p in fixed_slot)
    transfer_normals(obj, source)
    return obj, {'method': 'Feature-weighted collapse of actual v02; drain bevel vertices fixed exactly; supported contours and foot-contact band prioritized; original custom normals transferred',
                 'fixed_slot_vertices': len(fixed_slot), 'fixed_slot_vertices_exactly_preserved': True,
                 'protected_source_vertices': len(protected), 'collapse_group_factor': .15,
                 'envelope_overshoot_vertices_clamped': clamped, 'max_envelope_clamp_m': max_clamp}


def select_profile(profile, count):
    # Preserve the exact radial/height extrema and both center floor endpoints.
    selected = {0, len(profile)-1, max(range(len(profile)), key=lambda i: profile[i].x),
                max(range(len(profile)), key=lambda i: profile[i].y),
                min(range(len(profile)), key=lambda i: profile[i].y)}
    while len(selected) < count:
        ordered = sorted(selected)
        best = (-1, None)
        for a, b in zip(ordered, ordered[1:]):
            delta = profile[b] - profile[a]
            for i in range(a+1, b):
                t = max(0, min(1, (profile[i]-profile[a]).dot(delta) / max(delta.length_squared, 1e-20)))
                error = (profile[i] - (profile[a] + t*delta)).length_squared
                if error > best[0]:
                    best = (error, i)
        assert best[1] is not None
        selected.add(best[1])
    return sorted(selected)


def make_basin(source, name, sectors, profile_points):
    # v02's supported runtime topology is 22 radial rings x 64 sectors plus
    # two center vertices. Read its actual geometry, not a generic bowl recipe.
    mesh = source.data
    assert len(mesh.vertices) == 22*64+2
    profile = [Vector((0, mesh.vertices[0].co.z))]
    for row in range(22):
        point = mesh.vertices[1+row*64].co
        profile.append(Vector((math.hypot(point.x, point.y), point.z)))
    profile.append(Vector((0, mesh.vertices[-1].co.z)))
    selected = select_profile(profile, profile_points)
    reduced = [profile[i] for i in selected]
    verts = [(0, 0, reduced[0].y)]
    for radius, height in reduced[1:-1]:
        verts.extend((radius*math.cos(i*2*math.pi/sectors), radius*math.sin(i*2*math.pi/sectors), height) for i in range(sectors))
    end = len(verts)
    verts.append((0, 0, reduced[-1].y))
    rows = len(reduced)-2
    faces = []
    for i in range(sectors):
        j = (i+1) % sectors
        faces.append((0, 1+j, 1+i))
        for row in range(rows-1):
            a, b = 1+row*sectors, 1+(row+1)*sectors
            faces.append((a+i, a+j, b+j, b+i))
        a = 1+(rows-1)*sectors
        faces.append((a+i, a+j, end))
    data = bpy.data.meshes.new(name+' sampled v02 profile')
    data.from_pydata(verts, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    data.materials.append(source.data.materials[0])
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    transfer_normals(obj, source)
    return obj, {'method': 'Adaptive subset of the actual v02 radial profile with evenly spaced original angular samples; rim/height/radius extrema and both floor endpoints retained; v02 normals transferred',
                 'source_profile_points': len(profile), 'retained_profile_indices': selected,
                 'sectors': sectors, 'profile_points': profile_points,
                 'source_profile_m': [list(p) for p in profile]}


def read_glb(path):
    raw = Path(path).read_bytes()
    size, kind = struct.unpack_from('<II', raw, 12)
    assert kind == 0x4E4F534A
    return json.loads(raw[20:20+size]), raw[20+size:]


def retain_material_definition(path, canonical):
    doc, binary = read_glb(path)
    source, _ = read_glb(canonical)
    assert len(source['materials']) == len(doc['materials']) == 1
    assert not source.get('textures') and not doc.get('textures')
    doc['materials'] = source['materials']
    data = json.dumps(doc, separators=(',', ':')).encode()
    data += b' '*((-len(data)) % 4)
    header = struct.pack('<III', 0x46546C67, 2, 20+len(data)+len(binary))
    Path(path).write_bytes(header + struct.pack('<II', len(data), 0x4E4F534A) + data + binary)


def export(obj, path, canonical):
    active(obj)
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
        export_yup=True, export_extras=True, export_cameras=False, export_lights=False,
        export_copyright='Meshy 6 Lite source, CC BY 4.0; Blender LOD derivation by Sento Duck Explorer')
    retain_material_definition(path, canonical)


def component_count(bm, height=None):
    remaining = {v for v in bm.verts if height is None or v.co.z < height}
    parts = []
    while remaining:
        seen = {remaining.pop()}
        queue = list(seen)
        while queue:
            for edge in queue.pop().link_edges:
                for vertex in edge.verts:
                    if vertex in remaining:
                        remaining.remove(vertex)
                        seen.add(vertex)
                        queue.append(vertex)
        parts.append({'vertices': len(seen), 'min_height_m': min(v.co.z for v in seen)})
    return parts


def measure(obj, kind):
    obj.data.calc_loop_triangles()
    lo, hi = bounds(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-7)
    facts = {'triangles': len(obj.data.loop_triangles), 'vertices': len(obj.data.vertices),
             'dimensions_gltf_m': [hi.x-lo.x, hi.z-lo.z, hi.y-lo.y],
             'bounds_gltf_m': [[lo.x, lo.z, -hi.y], [hi.x, hi.z, -lo.y]],
             'nonmanifold_edges_after_export_seam_weld': sum(not e.is_manifold for e in bm.edges),
             'degenerate_faces': sum(face.calc_area() < 1e-14 for face in bm.faces),
             'connected_components': len(component_count(bm)), 'has_custom_normals': bool(obj.data.has_custom_normals),
             'finite': all(math.isfinite(c) for vertex in obj.data.vertices for c in vertex.co)}
    assert facts['nonmanifold_edges_after_export_seam_weld'] == facts['degenerate_faces'] == 0
    assert facts['finite'] and facts['connected_components'] == 1
    if kind == 'bath_stool':
        facts['legs_below_140mm'] = component_count(bm, .14)
        assert len(facts['legs_below_140mm']) == 4
        assert all(abs(p['min_height_m']) < 1e-6 for p in facts['legs_below_140mm'])
        rays=[]
        for x, y in [(-.025,0),(0,0),(.025,0),(0,-.008),(0,.008)]:
            rays.append({'xy_m': [x,y], 'clear_down': not obj.ray_cast(Vector((x,y,.4)), Vector((0,0,-1)))[0],
                         'clear_up': not obj.ray_cast(Vector((x,y,-.1)), Vector((0,0,1)))[0]})
        assert all(r['clear_down'] and r['clear_up'] for r in rays)
        facts['drain_rays'] = rays
    else:
        hit, top, _, _ = obj.ray_cast(Vector((0,0,.3)), Vector((0,0,-1)))
        hit_under, bottom, _, _ = obj.ray_cast(Vector((0,0,-.1)), Vector((0,0,1)))
        assert hit and hit_under and top.z > bottom.z
        facts.update(cavity_depth_m=hi.z-top.z, floor_thickness_m=top.z-bottom.z)
    bm.free()
    return facts


def samples(obj):
    obj.data.calc_loop_triangles()
    return [v.co.copy() for v in obj.data.vertices] + [sum((obj.data.vertices[i].co for i in t.vertices), Vector())/3 for t in obj.data.loop_triangles]


def distance(points, tree):
    values = sorted(tree.find_nearest(p)[3] for p in points)
    return {'samples': len(values), 'mean_m': statistics.mean(values), 'p95_m': values[int((len(values)-1)*.95)], 'max_m': values[-1]}


def strip_png(path):
    data = Path(path).read_bytes()
    out = bytearray(data[:8])
    offset = 8
    while offset < len(data):
        size = struct.unpack_from('>I', data, offset)[0]
        end = offset+size+12
        if data[offset+4:offset+8] not in (b'tEXt',b'zTXt',b'iTXt',b'eXIf'):
            out += data[offset:end]
        offset = end
    Path(path).write_bytes(out)


def render_set(obj, path, kind):
    for other in bpy.data.objects:
        if other.type == 'MESH':
            other.hide_render = other is not obj
    obj.hide_render = False
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'AgX'
    for other in list(bpy.data.objects):
        if other.type in ('CAMERA', 'LIGHT'):
            bpy.data.objects.remove(other, do_unlink=True)
    world = bpy.data.worlds.new('Fixed neutral LOD review')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (.12,.14,.16,1)
    world.node_tree.nodes['Background'].inputs[1].default_value = .55
    scene.world = world
    span = .36 if kind == 'bath_stool' else .20
    target = Vector((0,0,.15 if kind == 'bath_stool' else .045))
    for pos, power, size in [((1.5,-2.2,3),300,2),((-2,-1,1.2),100,2),((.5,2,2),220,1.5)]:
        bpy.ops.object.light_add(type='AREA', location=target+Vector(pos)*span)
        light = bpy.context.object
        light.data.energy = power*span*span
        light.data.size = size*span
        light.rotation_euler = (target-light.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = span*1.5
    scene.camera = camera
    for view, direction in [('threequarter',(1,-1.5,.85)), ('side',(1,0,.15)), ('top',(.1,-.2,1)), ('underside',(1,-1,-.7))]:
        camera.location = target+Vector(direction).normalized()*2
        camera.rotation_euler = (target-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath = str(path/(view+'.png'))
        bpy.ops.render.render(write_still=True)
        strip_png(scene.render.filepath)


report = {'revision': 'lod_v01', 'date': '2026-11-21', 'runtime_contract': 'Four independent GLBs; select exactly one LOD per slot. Existing canonical v02 is unchanged high detail. All levels use the same authored metric frame; size slots from high bounds only.',
          'distance_guidance_m': {'high_through': 1.6, 'medium_through': 4.5},
          'per_kind_limits': {'high': 2},
          'far_assignment_note': 'With all detail sources available, all remaining props through 4.5 m use medium without a quantity cap. Far is used only beyond 4.5 m or in overview. A pending medium source prefers high before far.',
          'runtime_policy_review': {'previous_medium_limit': 1, 'previous_far_minimum_m': 1.6,
              'decision': 'Independent asset QA rejected the medium quantity cap because far stool arches and the 16-sided basin rim were visibly angular nearby. The cap was removed; geometry files are unchanged.',
              'five_pair_conservative_triangles': 22340},
          'scope': 'Local source-derived geometry and material inspections; no game rendering, FPS benchmark or normal-input play.', 'assets': {}}
source_hashes = {}
for kind in ASSETS:
    canonical = ROOT/'public/models'/f'{kind}.glb'
    source_blend = ROOT/'assets'/kind/'blend'/f'{kind}__v02.blend'
    assert sha(canonical) == EXPECTED[kind]
    source_hashes[kind] = (sha(canonical), sha(source_blend))
    bpy.ops.wm.open_mainfile(filepath=str(source_blend))
    source = bpy.data.objects[kind]
    source_digest = geometry_digest(source)
    raw_name = 'SOURCE_RAW_UNMODIFIED' if kind == 'bath_stool' else 'SOURCE_original_Meshy_geometry'
    raw_digest = geometry_digest(bpy.data.objects[raw_name])
    source_bounds = bounds(source)
    rows = {}
    objects = []
    for level in ('medium', 'far'):
        name = f'{kind}_lod_{level}'
        if kind == 'bath_stool':
            obj, method = make_stool(source, name, 1600 if level == 'medium' else 1000)
        else:
            obj, method = make_basin(source, name, 32 if level == 'medium' else 16, 16 if level == 'medium' else 14)
        obj['parent_asset'] = kind
        obj['parent_final_sha256'] = EXPECTED[kind]
        obj['asset_license'] = 'CC BY 4.0; Meshy attribution required'
        obj['lod'] = level
        objects.append(obj)
        target = CAND/(name+'.glb')
        export(obj, target, canonical)
        rows[level] = {'method': method, 'candidate_file': name+'.glb', 'sha256': sha(target), 'bytes': target.stat().st_size}
    assert geometry_digest(source) == source_digest
    assert geometry_digest(bpy.data.objects[raw_name]) == raw_digest
    for obj in bpy.data.objects:
        obj.hide_render = obj not in objects
        obj.hide_set(obj not in objects)
    for screen in bpy.data.screens:
        for area in screen.areas:
            for space in area.spaces:
                if space.type == 'FILE_BROWSER' and space.params:
                    space.params.directory = b'/'*1023
                    space.params.directory = b'//'
    bpy.context.scene.render.filepath = '//'
    bpy.context.preferences.filepaths.save_version = 0
    blend = ROOT/'assets'/kind/'blend'/f'{kind}__lod_v01.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend), compress=True)
    # Reopen saved source rather than relying only on the pre-save objects.
    bpy.ops.wm.open_mainfile(filepath=str(blend))
    assert geometry_digest(bpy.data.objects[kind]) == source_digest
    assert geometry_digest(bpy.data.objects[raw_name]) == raw_digest
    decompressed = subprocess.run(['zstd','-d','--stdout',str(blend)], check=True, capture_output=True).stdout
    markers = [b'/'+name+b'/' for name in (b'Users',b'home',b'private')]
    markers += [b'.codex'+b'/', b'@'+b'gmail.com']
    assert not any(marker in decompressed for marker in markers)
    item = {'source_glb_sha256': EXPECTED[kind], 'source_blend_sha256': source_hashes[kind][1],
            'blend': str(blend.relative_to(ROOT)), 'blend_sha256': sha(blend), 'source_runtime_geometry_exactly_preserved': True,
            'inherited_raw_geometry_exactly_preserved': True, 'metadata_private_markers': 0, 'levels': rows}
    # Actual exported/reimported GLBs are the rendering and measurement authority.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(canonical))
    high = next(o for o in bpy.data.objects if o.type == 'MESH')
    source_facts = measure(high, kind)
    item['high'] = source_facts
    high_tree = BVHTree.FromObject(high, bpy.context.evaluated_depsgraph_get())
    path = OUT/kind/'high'
    path.mkdir(parents=True, exist_ok=True)
    render_set(high, path, kind)
    for level in ('medium', 'far'):
        target = CAND/f'{kind}_lod_{level}.glb'
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(target))
        low = next(o for o in bpy.data.objects if o not in before and o.type == 'MESH')
        facts = measure(low, kind)
        for a, b in zip(sum(facts['bounds_gltf_m'],[]), sum(source_facts['bounds_gltf_m'],[])):
            assert abs(a-b) < 1e-6, (kind, level, a, b)
        low_tree = BVHTree.FromObject(low, bpy.context.evaluated_depsgraph_get())
        facts['deviation_from_canonical'] = {'method': 'Bidirectional sampled vertices and triangle centroids; not a continuous Hausdorff bound.',
            'canonical_to_lod': distance(samples(high), low_tree), 'lod_to_canonical': distance(samples(low), high_tree)}
        doc, _ = read_glb(target)
        source_doc, _ = read_glb(canonical)
        assert doc['materials'] == source_doc['materials']
        assert not doc.get('images') and not doc.get('textures') and not doc.get('cameras')
        assert all('uri' not in b for b in doc.get('buffers',[]))
        facts.update(materials=1, textures=0, material_definition_identical_to_canonical=True, embedded_buffers=True)
        rows[level]['reimport'] = facts
        path = OUT/kind/level
        path.mkdir(parents=True, exist_ok=True)
        render_set(low, path, kind)
    report['assets'][kind] = item
    assert sha(canonical) == source_hashes[kind][0] and sha(source_blend) == source_hashes[kind][1]
(OUT/'measurements.json').write_text(json.dumps(report, indent=2)+'\n')
print('WASH_LODS_DONE', json.dumps({kind:{level: {'triangles':data['reimport']['triangles'], 'bytes':data['bytes'], 'sha256':data['sha256']} for level,data in item['levels'].items()} for kind,item in report['assets'].items()}), flush=True)
