"""Refine the actual Meshy stool, retaining its raw mesh and provenance.

Run from the repository root with Blender --background --python
scripts/finish-bath-stool.py -- inspect (or finish).
"""
import bpy
import bmesh
import math
import json
import sys
import hashlib
from pathlib import Path
from mathutils import Vector

ROOT = Path.cwd()
ASSET = ROOT / 'assets/bath_stool'
OUT = ASSET / 'blend'
MODE = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'inspect'
TRIANGLE_TARGET = 3000


def activate(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def bounds(obj):
    pts = [obj.matrix_world @ v.co for v in obj.data.vertices]
    return [min(p[i] for p in pts) for i in range(3)], [max(p[i] for p in pts) for i in range(3)]


def component_count(bm, height=None):
    remaining = {v for v in bm.verts if height is None or v.co.z < height}
    count = 0
    while remaining:
        count += 1
        queue = [remaining.pop()]
        while queue:
            v = queue.pop()
            for e in v.link_edges:
                other = e.other_vert(v)
                if other in remaining:
                    remaining.remove(other)
                    queue.append(other)
    return count


def normalize(obj):
    activate(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    lo, hi = bounds(obj)
    for v in obj.data.vertices:
        for i, dim in enumerate((.36, .36, .30)):
            v.co[i] = (v.co[i] - lo[i]) / (hi[i] - lo[i]) * dim - (dim / 2 if i < 2 else 0)
    obj.data.update()


def material():
    mat = bpy.data.materials.new('Warm ivory satin plastic')
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (.79, .69, .52, 1)
    shader.inputs['Roughness'].default_value = .37
    return mat


def setup_render():
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 768
    scene.render.resolution_y = 768
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'AgX'
    world = bpy.data.worlds.new('Neutral studio')
    world.use_nodes = True
    world.node_tree.nodes.get('Background').inputs['Color'].default_value = (.18, .21, .24, 1)
    world.node_tree.nodes.get('Background').inputs['Strength'].default_value = .55
    scene.world = world
    for pos, energy, size in [((.6,-.8,.9),40,.75),((-.6,-.2,.5),22,.7),((0,.7,.6),35,.6),((0,-.5,-.5),10,.6)]:
        bpy.ops.object.light_add(type='AREA', location=pos)
        light = bpy.context.object
        light.data.energy = energy
        light.data.size = size
        light.rotation_euler = (Vector((0,0,.15)) - light.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.data.type = 'ORTHO'
    scene.camera = camera
    return camera


def render_set(prefix):
    camera = setup_render()
    target = Vector((0,0,.15))
    for name, direction, scale in [
        ('front',(0,-1,.08),.47),
        ('left',(-1,-1,.7),.54),
        ('right',(1,-1,.7),.54),
        ('back',(0,1,.15),.47),
        ('top',(.15,-.3,1),.47),
        ('underside',(.6,-1,-.8),.53),
    ]:
        camera.location = target + Vector(direction).normalized() * 1.5
        camera.rotation_euler = (target-camera.location).to_track_quat('-Z','Y').to_euler()
        camera.data.ortho_scale = scale
        bpy.context.scene.render.filepath = str(OUT / f'bath_stool__{prefix}_{name}_v01.png')
        bpy.ops.render.render(write_still=True)


def finish(obj):
    # Work on actual generated topology. A source quadrant is mirrored to correct
    # small leg/seat asymmetries; no replacement stool primitives are constructed.
    activate(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for normal in (Vector((1,0,0)), Vector((0,1,0))):
        bmesh.ops.bisect_plane(bm, geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
            dist=0.000001, plane_co=(0,0,0), plane_no=normal,
            clear_inner=True, clear_outer=False)
    bm.to_mesh(obj.data)
    bm.free()
    mirror = obj.modifiers.new('Restore four symmetric source-derived quarters', 'MIRROR')
    mirror.use_axis = (True, True, False)
    mirror.use_clip = True
    mirror.merge_threshold = .00002
    bpy.ops.object.modifier_apply(modifier=mirror.name)
    smooth = obj.modifiers.new('Relax generated surface ripples', 'SMOOTH')
    smooth.factor = .75
    smooth.iterations = 40
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    # Compress only the upper 6 mm into a smooth horizontal seat. This removes
    # the spurious raised concentric rings while retaining the source drain hole.
    for v in obj.data.vertices:
        if v.co.z > .289:
            t = min(1, (v.co.z-.289)/.006)
            v.co.z = .289 + .003*(2*t-t*t)
        if v.co.z < .003:
            v.co.z = 0
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
    bmesh.ops.dissolve_degenerate(bm, edges=list(bm.edges), dist=.000001)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    bm.free()
    # Retopologize the corrected source surface to remove collapsed ring strips
    # and mirror-seam slivers without closing the real drain opening.
    obj.data.remesh_voxel_size = .0012
    bpy.ops.object.voxel_remesh()
    smooth = obj.modifiers.new('Relax remeshed source surface', 'SMOOTH')
    smooth.factor = .6
    smooth.iterations = 12
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    feet = obj.vertex_groups.new(name='Foot-tip source refinement')
    for v in obj.data.vertices:
        weight = max(0, min(1, (.065-v.co.z)/.035))
        if weight:
            feet.add([v.index], weight, 'REPLACE')
    smooth = obj.modifiers.new('Soften generated foot-tip lips', 'SMOOTH')
    smooth.vertex_group = feet.name
    smooth.factor = .75
    smooth.iterations = 50
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    obj.data.calc_loop_triangles()
    high = obj.copy()
    high.data = obj.data.copy()
    high.name = 'bath_stool_adjusted_before_reduction'
    bpy.context.collection.objects.link(high)
    high.hide_render = True
    high.hide_set(True)
    activate(obj)
    decimate = obj.modifiers.new('Reduce adjusted generated surface', 'DECIMATE')
    decimate.ratio = TRIANGLE_TARGET/len(obj.data.loop_triangles)
    decimate.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    normalize(obj)
    obj.name = 'bath_stool'
    for uv in list(obj.data.uv_layers):
        obj.data.uv_layers.remove(uv)
    for attr in list(obj.data.color_attributes):
        obj.data.color_attributes.remove(attr)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj['source_file'] = 'assets/bath_stool/gen/bath_stool__meshy6lite_raw_v01.glb'
    obj['asset_license'] = 'CC-BY-4.0'
    obj['attribution'] = 'Meshy 6 Lite; Blender modifications by Sento Duck Explorer'
    obj['modifications'] = 'Source quadrant mirrored; surface smoothing; surplus seat rings flattened; foot contact leveled; voxel retopology; decimation; metric axis normalization'
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1
    scene.render.filepath = '//'
    for screen in bpy.data.screens:
        for area in screen.areas:
            for space in area.spaces:
                if space.type == 'FILE_BROWSER' and space.params is not None:
                    space.params.directory = b'/' * 1023
                    space.params.directory = b'//'
    activate(obj)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'bath_stool__v01.blend'), compress=True)
    export = ROOT / 'public/models/bath_stool.glb'
    bpy.ops.export_scene.gltf(filepath=str(export), export_format='GLB', use_selection=True,
        export_yup=True, export_extras=True,
        export_copyright='Meshy 6 Lite output, CC BY 4.0; Blender modifications by Sento Duck Explorer contributors')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(export))
    obj = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
    obj.data.calc_loop_triangles()
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    lo, hi = bounds(obj)
    hole_hit = obj.ray_cast(Vector((0,0,.4)), Vector((0,0,-1)))[0]
    contact_heights = []
    for sx, sy in ((-1,-1),(-1,1),(1,-1),(1,1)):
        contact_heights.append(min(v.co.z for v in obj.data.vertices if v.co.x*sx>0 and v.co.y*sy>0))
    stats = {
        'revision':'v01',
        'blender_version':bpy.app.version_string,
        'source_triangles':87590,
        'source_sha256':hashlib.sha256((ASSET/'gen/bath_stool__meshy6lite_raw_v01.glb').read_bytes()).hexdigest(),
        'blend_sha256':hashlib.sha256((OUT/'bath_stool__v01.blend').read_bytes()).hexdigest(),
        'triangles':len(obj.data.loop_triangles),
        'vertices':len(obj.data.vertices),
        'dimensions_gltf_m':[hi[0]-lo[0],hi[2]-lo[2],hi[1]-lo[1]],
        'bounds_blender_zup_m':[lo,hi],
        'bounds_gltf_yup_m':[[lo[0],lo[2],-hi[1]],[hi[0],hi[2],-lo[1]]],
        'material_count':len(obj.data.materials),
        'texture_count':0,
        'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),
        'degenerate_faces':sum(f.calc_area() < 1e-12 for f in bm.faces),
        'connected_components':component_count(bm),
        'separate_legs_below_14cm':component_count(bm,.14),
        'foot_contact_heights_m':contact_heights,
        'signed_volume_m3':bm.calc_volume(signed=True),
        'finite_vertices':all(math.isfinite(c) for v in obj.data.vertices for c in v.co),
        'center_drain_clear':not hole_hit,
        'glb_bytes':export.stat().st_size,
        'sha256':hashlib.sha256(export.read_bytes()).hexdigest(),
    }
    bm.free()
    (OUT/'bath_stool__measurements_v01.json').write_text(json.dumps(stats,indent=2)+'\n')
    print('FINAL_MEASUREMENTS',json.dumps(stats))
    render_set('final')


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ASSET/'gen/bath_stool__meshy6lite_raw_v01.glb'))
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
assert len(meshes) == 1
body = meshes[0]
if MODE == 'finish':
    original = body.copy()
    original.data = body.data.copy()
    original.name = 'SOURCE_RAW_UNMODIFIED'
    bpy.context.collection.objects.link(original)
    original.hide_render = True
    original.hide_set(True)
body.name = 'bath_stool_source_normalized'
normalize(body)
body.data.materials.clear()
body.data.materials.append(material())
for p in body.data.polygons:
    p.use_smooth = True
body.data.calc_loop_triangles()
bm=bmesh.new(); bm.from_mesh(body.data)
print('SOURCE_MEASUREMENTS', json.dumps({'vertices':len(body.data.vertices), 'triangles':len(body.data.loop_triangles), 'bounds_blender':bounds(body), 'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges)}))
bm.free()
if MODE == 'inspect':
    render_set('raw')
elif MODE == 'measure':
    for y in (0, .04, .08, .12, .15):
        row=[]
        for x in (0, .02, .04, .06, .08, .10, .12, .14, .16):
            hit, point, normal, index = body.ray_cast(Vector((x,y,.4)), Vector((0,0,-1)))
            row.append([x,round(point.z,5) if hit else None,round(normal.z,3) if hit else None])
        print('HEIGHT_ROW',y,row)
elif MODE == 'finish':
    finish(body)
else:
    raise ValueError('Unknown mode')
