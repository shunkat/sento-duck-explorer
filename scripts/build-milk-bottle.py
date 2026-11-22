"""Author, export, reimport and inspect the original growth milk bottle.

Run from the repository root with Blender --background --python this_file.
No downloaded geometry, textures, generated images or gameplay changes.
"""
import bpy
import bmesh
import hashlib
import json
import math
import struct
import subprocess
from pathlib import Path
from mathutils import Vector

ROOT = Path.cwd()
ASSET = ROOT / 'assets/milk_bottle'
QUALITY = ASSET / 'quality'
BLEND = ASSET / 'blend/milk_bottle__v01.blend'
GLB = ROOT / 'public/models/milk_bottle.glb'
for folder in (QUALITY, BLEND.parent, GLB.parent):
    folder.mkdir(parents=True, exist_ok=True)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def mat(name, roughness):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (1, 1, 1, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = 0
    bsdf.inputs['Alpha'].default_value = 1
    bsdf.inputs['Transmission Weight'].default_value = 0
    color = material.node_tree.nodes.new('ShaderNodeVertexColor')
    color.layer_name = 'Color'
    material.node_tree.links.new(color.outputs['Color'], bsdf.inputs['Base Color'])
    return material


def build():
    # The entire silhouette is one closed continuous lathed surface, including
    # the opaque milk/glass body, heel, shoulder, neck, lip and paper closure.
    # Blender +Z is up and -Y is front; export_yup converts this to glTF +Y/+Z.
    profile = [
        (.0300, .0000), (.0340, .0015), (.0355, .0050), (.0360, .0100),
        (.0360, .0250), (.0360, .1150), (.0350, .1300), (.0320, .1420),
        (.0270, .1520), (.0230, .1600), (.0210, .1670), (.0210, .1800),
        (.0240, .1830), (.0245, .1870), (.0245, .1900), (.0230, .1920),
        (.0260, .1930), (.0260, .1960), (.0250, .1990), (.0220, .2000),
        (.0080, .2000),
    ]
    n = 32
    verts = []
    for row, (radius, height) in enumerate(profile):
        for j in range(n):
            a = 2 * math.pi * j / n
            # Small paper pleats and a front thumb edge belong to the closure,
            # rather than a disconnected add-on or a metal screw-cap thread.
            pleat = .00035 * (-1 if j % 2 else 1) if row in (16, 17) else 0
            front_edge = .0014 * max(0, -math.sin(a))**12 if row in (17, 18, 19) else 0
            r = radius + pleat + front_edge
            verts.append((r * math.cos(a), r * math.sin(a), height))
    faces = [tuple(reversed(range(n)))]
    bands = [-1]
    for row in range(len(profile) - 1):
        for j in range(n):
            k = (j + 1) % n
            faces.append((row*n+j, row*n+k, (row+1)*n+k, (row+1)*n+j))
            bands.append(row)
    faces.append(tuple((len(profile)-1)*n+j for j in range(n)))
    bands.append(20)
    mesh = bpy.data.meshes.new('Milk bottle continuous editable surface')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new('milk_bottle', mesh)
    bpy.context.scene.collection.objects.link(obj)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat('Opaque milk with polished glass silhouette', .26))
    mesh.materials.append(mat('Matte paper closure and indigo printed band', .83))
    colors = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
    milk = (.87, .91, .87, 1)
    glass_edge = (.69, .80, .76, 1)
    blue = (.035, .17, .22, 1)
    cream = (.87, .84, .72, 1)
    for poly, row in zip(mesh.polygons, bands):
        paper = row >= 15
        poly.material_index = 1 if paper else 0
        # Flat lid and base; smoothly curved milk bottle profile.
        poly.use_smooth = row not in (-1, 18, 19, 20)
        color = cream if row >= 19 else blue if paper else glass_edge if row in (-1, 0, 12, 13, 14) else milk
        for index in poly.loop_indices:
            colors.data[index].color = color
    obj['asset_id'] = 'milk_bottle'
    obj['revision'] = 'v01'
    obj['method'] = 'Original authored lathed profile and paper cap in Blender; no external inputs'
    obj['rights'] = 'Project-authored geometry and materials, MIT'
    obj['axes'] = 'glTF meters; +Y up; +Z front (small paper thumb edge); bottom center origin'
    return obj, profile


def strip_png(path):
    data = Path(path).read_bytes()
    out = data[:8]
    pos = 8
    while pos < len(data):
        count = struct.unpack_from('>I', data, pos)[0]
        kind = data[pos+4:pos+8]
        if kind not in (b'tEXt', b'zTXt', b'iTXt', b'eXIf'):
            out += data[pos:pos+count+12]
        pos += count + 12
    Path(path).write_bytes(out)


def inspect(obj):
    obj.data.calc_loop_triangles()
    points = [obj.matrix_world @ v.co for v in obj.data.vertices]
    assert all(math.isfinite(x) for p in points for x in p)
    lo = [min(p[i] for p in points) for i in range(3)]
    hi = [max(p[i] for p in points) for i in range(3)]
    # Reimport converts glTF +Y back to Blender +Z. Report canonical glTF axes.
    gltf_lo = [lo[0], lo[2], -hi[1]]
    gltf_hi = [hi[0], hi[2], -lo[1]]
    dim = [gltf_hi[i]-gltf_lo[i] for i in range(3)]
    assert .06 <= dim[0] <= .08 and .18 <= dim[1] <= .22 and .06 <= dim[2] <= .08
    assert abs(gltf_lo[1]) < 1e-6
    assert abs(gltf_lo[0]+gltf_hi[0]) < 1e-6 and abs(gltf_lo[2]+gltf_hi[2]) < 1e-6
    assert obj.location.length < 1e-7
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-7)
    nonmanifold = sum(not e.is_manifold for e in bm.edges)
    degenerate = sum(f.calc_area() < 1e-12 for f in bm.faces)
    unseen = set(bm.verts)
    components = []
    while unseen:
        todo = [unseen.pop()]
        count = 0
        while todo:
            v = todo.pop()
            count += 1
            for edge in v.link_edges:
                other = edge.other_vert(v)
                if other in unseen:
                    unseen.remove(other)
                    todo.append(other)
        components.append(count)
    volume = bm.calc_volume(signed=True)
    bm.free()
    assert len(components) == 1 and nonmanifold == 0 and degenerate == 0 and volume > 0
    tris = len(obj.data.loop_triangles)
    assert tris <= 1500
    cap_points = [p for p in points if p.z > .195]
    assert -min(p.y for p in cap_points) > max(p.y for p in cap_points), 'Thumb edge must point glTF +Z'
    return {'bounds': {'min': gltf_lo, 'max': gltf_hi}, 'width': dim[0], 'height': dim[1],
            'depth': dim[2], 'max_width': max(dim[0], dim[2]), 'triangles': tris,
            'vertices': len(obj.data.vertices), 'welded_vertices': sum(components),
            'connected_components': len(components), 'nonmanifold_edges_after_seam_weld': nonmanifold,
            'degenerate_faces': degenerate, 'signed_volume_m3': volume,
            'finite_vertices': True, 'bottom_contact_y_m': gltf_lo[1],
            'origin_bottom_center': True, 'front_thumb_edge_gltf_positive_z': True}


def render():
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'AgX'
    world = bpy.data.worlds.new('Soft neutral inspection world')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (.12, .17, .18, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = .6
    scene.world = world
    target = Vector((0, 0, .10))
    for pos, power, size in [((.22,-.35,.40), 8, .25), ((-.30,-.05,.23), 3, .24), ((.10,.28,.35), 7, .18)]:
        bpy.ops.object.light_add(type='AREA', location=pos)
        light = bpy.context.object
        light.data.energy = power
        light.data.size = size
        light.rotation_euler = (target-light.location).to_track_quat('-Z','Y').to_euler()
    # Inspection floor only; never included in the exported GLB or saved source.
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0,0,-.00002))
    floor = bpy.context.object
    fm = bpy.data.materials.new('Inspection teal-gray floor')
    fm.use_nodes = True
    bs = fm.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (.055,.085,.09,1)
    bs.inputs['Roughness'].default_value = .8
    floor.data.materials.append(fm)
    bpy.ops.object.camera_add()
    cam = bpy.context.object
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = .265
    scene.camera = cam
    for name, direction in [('front',(0,-1,.08)), ('side',(1,0,.08)), ('threequarter',(.75,-1,.6)), ('cap',(.35,-1,1.8))]:
        cam.location = target + Vector(direction).normalized()*.7
        cam.rotation_euler = (target-cam.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath = str(QUALITY / f'{name}.png')
        bpy.ops.render.render(write_still=True)
        strip_png(scene.render.filepath)


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene.unit_settings.scale_length = 1
obj, profile = build()
bpy.ops.object.select_all(action='DESELECT')
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.export_scene.gltf(filepath=str(GLB), export_format='GLB', use_selection=True,
    export_yup=True, export_extras=True, export_cameras=False, export_lights=False,
    export_copyright='Copyright (c) 2026 shunkat. Project-authored work, MIT.')
for screen in bpy.data.screens:
    for area in screen.areas:
        for space in area.spaces:
            if space.type == 'FILE_BROWSER' and space.params:
                space.params.directory = b'/'*1023
                space.params.directory = b'//'
bpy.context.scene.render.filepath = '//'
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND), compress=True)
bpy.ops.wm.open_mainfile(filepath=str(BLEND))
assert 'milk_bottle' in bpy.data.objects
raw = subprocess.run(['zstd','-d','--stdout',str(BLEND)], check=True, capture_output=True).stdout
markers = [b'/'+s+b'/' for s in (b'Users', b'home', b'private')] + [b'.codex'+b'/', b'@'+b'gmail.com']
assert not any(m in raw for m in markers), 'Private metadata in saved Blend'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(GLB))
objects = [o for o in bpy.data.objects if o.type == 'MESH']
assert len(objects) == 1
facts = inspect(objects[0])
data = GLB.read_bytes()
size = struct.unpack_from('<I',data,12)[0]
doc = json.loads(data[20:20+size])
assert len(doc['materials']) == 2
assert not doc.get('images') and not doc.get('textures') and not doc.get('cameras')
assert all('uri' not in buffer for buffer in doc['buffers'])
assert all(m.get('alphaMode','OPAQUE') == 'OPAQUE' for m in doc['materials'])
facts.update(materials=len(doc['materials']), textures=0, texture_px=0,
             alpha_mode='OPAQUE', external_uris=0, private_metadata_markers=0,
             glb_bytes=len(data), glb_mb=len(data)/1e6, sha256=sha(GLB),
             measured_date='2026-11-22', tool='Blender 5.2.4 LTS actual exported GLB reimport')
render()
report = {'asset_id':'milk_bottle', 'revision':'v01', 'date':'2026-11-22',
          'scope':'Original asset build, GLB reimport/topology/dimension checks and offline render inspection; no gameplay verification',
          'glb':str(GLB.relative_to(ROOT)), 'blend':str(BLEND.relative_to(ROOT)),
          'blend_sha256':sha(BLEND), 'profile_radius_height_m':profile, 'measured':facts,
          'renders':{name:sha(QUALITY/f'{name}.png') for name in ('front','side','threequarter','cap')}}
(QUALITY / 'measurements.json').write_text(json.dumps(report, indent=2)+'\n')
print('MILK_BOTTLE_DONE', json.dumps(report), flush=True)
