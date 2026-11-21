"""Localized eye correction on the original Meshy-derived Duck.
Run from the repository root with Blender --background --python scripts/finish-duck-eyes.py.
Keeps the reference/raw mesh/v01 blend intact; exports a review candidate to .local.
"""
import bpy, math, json
from pathlib import Path
from mathutils import Vector, Matrix

root = Path.cwd()
preview = root / '.local/duck-eyes'
preview.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(root / 'assets/duck/blend/duck__v01.blend'))
body = bpy.data.objects['duck_body']
old_coords = [v.co.copy() for v in body.data.vertices]
colors = body.data.color_attributes['duck_colors']
yellow = (1.0, 0.624, 0.027, 1.0)
for c in colors.data:
    if sum(c.color[:3]) < .3:
        c.color = yellow
# Smooth only the old raised/creased eye patches, with a soft spatial boundary.
group = body.vertex_groups.new(name='Eye surface refinement')
for v in body.data.vertices:
    x,y,z = v.co
    r2 = ((abs(x)-.0405)/.022)**2 + ((z-.232)/.027)**2
    if y < -.08 and z > .208 and r2 < 1:
        weight = (1-r2)**2
        group.add([v.index], weight, 'REPLACE')
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
bpy.context.view_layer.objects.active = body
modifier = body.modifiers.new('Smooth original eye creases', 'SMOOTH')
modifier.vertex_group = group.name
modifier.factor = .75
modifier.iterations = 14
bpy.ops.object.modifier_apply(modifier=modifier.name)
body.data.update()
bpy.context.view_layer.update()
material = body.data.materials[0]
eyes = []
measurements = []
for side, name in [(-1,'eye_left'),(1,'eye_right')]:
    hit, location, normal, index = body.ray_cast(Vector((side*.0405,-.22,.232)), Vector((0,1,0)))
    if not hit:
        raise RuntimeError('Eye support ray missed the source head')
    # Matching dimensions/height and mirrored orientation; fit each to its source surface.
    outward = Vector((side*.34,-.9404254,0)).normalized()
    tangent = Vector((-outward.y,outward.x,0))
    center = location - outward*.0012
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=1)
    eye = bpy.context.object
    eye.name = name
    basis = Matrix((tangent, -outward, Vector((0,0,1)))).transposed()
    for v in eye.data.vertices:
        p = Vector((v.co.x*.0095, v.co.y*.0042, v.co.z*.013))
        v.co = center + basis @ p
    eye.data.materials.append(material)
    attr = eye.data.color_attributes.new(name='duck_colors', type='BYTE_COLOR', domain='CORNER')
    for color in attr.data:
        color.color = (.007,.009,.012,1)
    for polygon in eye.data.polygons:
        polygon.use_smooth = True
    measurements.append({'name':name,'center_blender':list(center),'surface_blender':list(location),'radius_m':[.0095,.0042,.013]})
    eyes.append(eye)
# One material/mesh preserves the prior one-draw-call contract.
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
for eye in eyes: eye.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
# Sphere UV seams are unnecessary for vertex-color-only exports.
for uv in list(body.data.uv_layers): body.data.uv_layers.remove(uv)
for polygon in body.data.polygons: polygon.use_smooth = True
body.data.calc_loop_triangles()
body['modifications'] = 'Original Meshy-derived body retained; local eye-surface smoothing; old irregular eye colors removed; two matched smooth ellipsoid eye inserts; sockets and extents unchanged'
body['asset_license'] = 'CC-BY-4.0'
body['attribution'] = 'Meshy 6 Lite; modified in Blender for Sento Duck Explorer'
scene = bpy.context.scene
scene['revision'] = 'Duck eye refinement v02'
scene.render.filepath = '//'
for screen in bpy.data.screens:
    for area in screen.areas:
        for space in area.spaces:
            if space.type == 'FILE_BROWSER' and space.params is not None:
                space.params.directory = b'/' * 1023
                space.params.directory = b'//'
bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets/duck/blend/duck__v02.blend'), compress=False)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(preview/'duck-candidate.glb'), export_format='GLB', use_selection=True,
    export_yup=True, export_extras=True, export_copyright='Meshy 6 Lite output, CC BY 4.0; Blender modifications by Sento Duck Explorer contributors')
# Render only after reimporting the exported candidate.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(preview/'duck-candidate.glb'))
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.resolution_x = 768
scene.render.resolution_y = 768
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False
world = bpy.data.worlds.new('Preview world')
world.use_nodes = True
world.node_tree.nodes.get('Background').inputs['Color'].default_value = (.15,.18,.21,1)
world.node_tree.nodes.get('Background').inputs['Strength'].default_value = .6
scene.world = world
for pos, energy, size in [((.7,-1,1.3),55,1),((-.8,-.4,.6),30,1),((0,1,1),45,1)]:
    bpy.ops.object.light_add(type='AREA',location=pos)
    light = bpy.context.object
    light.data.energy = energy
    light.data.size = size
    light.rotation_euler = (Vector((0,0,.17))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add()
camera = bpy.context.object
camera.data.type = 'ORTHO'
scene.camera = camera

def render(name, direction, focus=(0,-.02,.16), scale=.38):
    target = Vector(focus)
    camera.location = target+Vector(direction).normalized()*1.5
    camera.rotation_euler = (target-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.ortho_scale = scale
    scene.render.filepath = str(preview/(name+'.png'))
    bpy.ops.render.render(write_still=True)

render('front',(0,-1,.12))
render('left',(-1,-1,.25))
render('right',(1,-1,.25))
render('eyes',(0,-1,.05),(0,-.07,.232),.15)
objects_before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=str(root/'public/models/hat_sauna_duck.glb'))
hat_objects = set(bpy.data.objects)-objects_before
socket = bpy.data.objects['socket_hat']
for o in hat_objects:
    if o.parent not in hat_objects: o.matrix_world = socket.matrix_world @ o.matrix_world
render('hat',(1,-2,.25),focus=(0,-.02,.19),scale=.49)
duck_mesh = bpy.data.objects['duck_body']
duck_mesh.data.calc_loop_triangles()
measured={'eye_inserts':measurements,'triangles':len(duck_mesh.data.loop_triangles),'old_body_triangles':5800,'added_eye_triangles':len(duck_mesh.data.loop_triangles)-5800,'texture_count':0,'material_count':len(duck_mesh.data.materials)}
(preview/'adjustment.json').write_text(json.dumps(measured,indent=2)+'\n')
