"""Author a tattooed variant of the independent standing visitor, privately.

Blender --background --python-exit-code 1 --python scripts/build-tattooed-sento-visitor.py

The original GLBs and tattoo artwork are immutable inputs. Blender materials
compose an atlas with a native-resolution copy of the original 512px face/skin
atlas. New UV charts introduce seams only: every indexed POSITION/NORMAL sample
and every triangle remains exactly equal to the corresponding source GLB.
"""
import argparse
from array import array
import copy
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import struct
import sys
sys.dont_write_bytecode = True

import bpy
import numpy as np
from mathutils import Vector


ROOT = Path.cwd()
OUT = ROOT / '.local/tattooed-visitor'
ART = ROOT / 'assets/sento_visitors/tattoo/ref/koi_waves__v01.png'
ART_SHA = '03f724c67b56521a174d1f9966e8285b9b2bb1bae78c95911de955307be20528'
SOURCES = {
    'npc_bath_tattooed': ('npc_bath_standing', '0446e67bb93dbb2e0307b77732a490f96d654477d6dbf2bbae39fb753dc162cb', 1594),
    'npc_bath_tattooed_lod_far': ('npc_bath_standing_lod_far', 'd2bc8e2d2920d9d068ddd95772e9d516ff56bda17c87ab8004913b484dbd4bbe', 594),
}


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(file))
    result = importlib.util.module_from_spec(spec); spec.loader.exec_module(result); return result


GLB = module('npc_patch', 'replace-background-npcs.py')
QA = module('world_qa', 'save-replaced-world-blend.py')
RENDER = module('world_render', 'render-replaced-world.py')


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def linear(value):
    return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4


def math_node(nodes, links, operation, a, b=None):
    n = nodes.new('ShaderNodeMath'); n.operation = operation
    for i, value in enumerate([a] if b is None else [a, b]):
        if isinstance(value, (int, float)): n.inputs[i].default_value = value
        else: links.new(value, n.inputs[i])
    return n.outputs[0]


def compose_material(name, image, skin, chart):
    material = bpy.data.materials.new(name); material.use_nodes = True
    nodes = material.node_tree.nodes; links = material.node_tree.links; nodes.clear()
    uv = nodes.new('ShaderNodeTexCoord')
    split = nodes.new('ShaderNodeSeparateXYZ'); links.new(uv.outputs['UV'], split.inputs[0])
    u, v = split.outputs['X'], split.outputs['Y']
    mask = None
    if chart == 'original':
        vector = uv.outputs['UV']
    else:
        if chart == 'back':
            # Complete 3:4 art contained on the torso, clear of neck/arm seams.
            tu = math_node(nodes, links, 'DIVIDE', math_node(nodes, links, 'SUBTRACT', u, .218), .564)
            tv = math_node(nodes, links, 'DIVIDE', math_node(nodes, links, 'SUBTRACT', v, .124), .752)
        else:
            if chart == 'chest':
                # Peony and adjacent waves, placed on one upper chest/shoulder.
                tu = math_node(nodes, links, 'DIVIDE', math_node(nodes, links, 'SUBTRACT', u, .22596), .27885)
                tv = math_node(nodes, links, 'DIVIDE', math_node(nodes, links, 'SUBTRACT', v, .51923), .38462)
                crop = (.40, .13, .60, .44)
            else:
                # Wave/fin fragment wraps the outside upper arm, above the elbow.
                tu = math_node(nodes, links, 'DIVIDE', math_node(nodes, links, 'SUBTRACT', u, .12), .76)
                tv = math_node(nodes, links, 'DIVIDE', math_node(nodes, links, 'SUBTRACT', v, .38), .58)
                crop = (.0, .34, .37, .54)
            dx = math_node(nodes, links, 'DIVIDE', math_node(nodes, links, 'SUBTRACT', tu, .5), .5)
            dy = math_node(nodes, links, 'DIVIDE', math_node(nodes, links, 'SUBTRACT', tv, .5), .5)
            radius = math_node(nodes, links, 'ADD', math_node(nodes, links, 'MULTIPLY', dx, dx), math_node(nodes, links, 'MULTIPLY', dy, dy))
            edge = nodes.new('ShaderNodeMapRange'); edge.interpolation_type = 'SMOOTHERSTEP'; edge.clamp = True
            links.new(radius, edge.inputs['Value']); edge.inputs['From Min'].default_value = .72
            edge.inputs['From Max'].default_value = 1; edge.inputs['To Min'].default_value = 1; edge.inputs['To Max'].default_value = 0
            mask = edge.outputs[0]
            tu = math_node(nodes, links, 'ADD', math_node(nodes, links, 'MULTIPLY', tu, crop[2]), crop[0])
            tv = math_node(nodes, links, 'ADD', math_node(nodes, links, 'MULTIPLY', tv, crop[3]), crop[1])
        combine = nodes.new('ShaderNodeCombineXYZ'); links.new(tu, combine.inputs['X']); links.new(tv, combine.inputs['Y'])
        vector = combine.outputs[0]
    texture = nodes.new('ShaderNodeTexImage'); texture.image = image
    texture.interpolation = 'Closest' if chart == 'original' else 'Linear'; texture.extension = 'CLIP'
    links.new(vector, texture.inputs['Vector'])
    color = texture.outputs['Color']
    if chart != 'original':
        opacity = math_node(nodes, links, 'MULTIPLY', texture.outputs['Alpha'], .86)
        if mask is not None: opacity = math_node(nodes, links, 'MULTIPLY', opacity, mask)
        mix = nodes.new('ShaderNodeMixRGB'); mix.blend_type = 'MIX'; mix.inputs[1].default_value = (*skin, 1)
        links.new(opacity, mix.inputs[0]); links.new(color, mix.inputs[2]); color = mix.outputs[0]
    emission = nodes.new('ShaderNodeEmission'); links.new(color, emission.inputs['Color'])
    output = nodes.new('ShaderNodeOutputMaterial'); links.new(emission.outputs[0], output.inputs['Surface'])
    return material


def plane(name, x, y, material):
    mesh = bpy.data.meshes.new(name); mesh.from_pydata([(x, y, 0), (x+.5, y, 0), (x+.5, y+.5, 0), (x, y+.5, 0)], [], [(0, 1, 2, 3)])
    mesh.uv_layers.new(name='Source artwork projection')
    for loop, uv in zip(mesh.uv_layers.active.data, [(0,0), (1,0), (1,1), (0,1)]): loop.uv = uv
    obj = bpy.data.objects.new(name, mesh); bpy.context.collection.objects.link(obj); mesh.materials.append(material)
    return obj


def make_atlas(source):
    png = source.view_bytes(source.doc['images'][0]['bufferView'])
    source_atlas = OUT / 'source-atlas.png'; source_atlas.write_bytes(png)
    original = bpy.data.images.load(str(source_atlas)); original.name = 'Original independent visitor atlas'
    art = bpy.data.images.load(str(ART)); art.name = 'Original koi waves and peony artwork'
    assert list(art.size) == [1086, 1448] and art.channels == 4
    pixels = np.array(original.pixels[:], dtype=np.float32).reshape((512, 512, 4))
    skin = tuple(linear(float(c)) for c in pixels[64, 64, :3])
    tiles = [plane('ATLAS_original_native_512', 0, 0, compose_material('Original native pixel atlas', original, skin, 'original')),
             plane('ATLAS_back_koi', 0, .5, compose_material('Back koi projection', art, skin, 'back')),
             plane('ATLAS_chest_peony', .5, .5, compose_material('Upper chest peony projection', art, skin, 'chest')),
             plane('ATLAS_upper_arm_waves', .5, 0, compose_material('Outer upper arm waves projection', art, skin, 'arm'))]
    scene = bpy.context.scene; scene.render.engine = 'CYCLES'; scene.cycles.samples = 1; scene.cycles.use_denoising = False
    scene.cycles.diffuse_bounces = 0; scene.cycles.glossy_bounces = 0
    scene.render.resolution_x = scene.render.resolution_y = 1024; scene.render.resolution_percentage = 100
    scene.render.film_transparent = False; scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGB'
    scene.render.dither_intensity = 0; scene.render.image_settings.compression = 100
    scene.view_settings.view_transform = 'Standard'; scene.view_settings.look = 'None'; scene.view_settings.exposure = 0; scene.view_settings.gamma = 1
    scene.render.filter_size = .01
    bpy.ops.object.camera_add(location=(.5, .5, 1)); camera = bpy.context.object; camera.data.type = 'ORTHO'; camera.data.ortho_scale = 1
    camera.rotation_euler = (0, 0, 0); scene.camera = camera
    path = OUT / 'npc_bath_tattooed_atlas.png'; scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True); RENDER.strip_png_metadata(path)
    result = bpy.data.images.load(str(path)); result.name = 'Tattooed visitor shared 1024 atlas'
    result_pixels = np.array(result.pixels[:], dtype=np.float32).reshape((1024, 1024, 4))
    # Native 1:1 source pixels must survive the color-managed emission render.
    difference = np.abs(result_pixels[:512, :512] - pixels)
    assert difference.max() <= 1.01/255, 'Original face patch color or native resolution changed'
    eye_diff = difference[264:504, 264:504]
    for obj in tiles: obj.hide_render = True; obj.hide_set(True)
    bpy.data.objects.remove(camera, do_unlink=True); scene.camera = None
    return path, {'size': [1024,1024], 'source_native_512_max_channel_delta': float(difference.max()),
                  'eye_native_240_max_channel_delta': float(eye_diff.max()), 'original_eye_pixel_dimensions': [240,240],
                  'original_atlas_sha256': hashlib.sha256(png).hexdigest(), 'art_sha256': ART_SHA,
                  'layout_blender_uv': {'original': [0,0,.5,.5], 'back': [0,.5,.5,1], 'chest': [.5,.5,1,1], 'upper_arm': [.5,0,1,.5]}}


def chart_for_triangle(positions, normals, uvs):
    # Hair, eyebrows, eye and hand regions always retain their original pixels.
    if not all(abs(uv[0]-.125) < .001 and uv[1] > .50 for uv in uvs): return 'original'
    x, y, z = [sum(p[axis] for p in positions)/3 for axis in range(3)]
    if y < .74 or y > 1.42: return 'original'
    if x < -.148 and .89 < y < 1.35: return 'arm'
    if abs(x) > .148: return 'original'
    nz = sum(n[2] for n in normals)/3
    if z < -.006 and nz < -.32: return 'back'
    if z > .006 and nz > .15 and x < .025 and y > .94: return 'chest'
    return 'original'


def mapped_uv(chart, position, uv, arm_wrap=False):
    if chart == 'original': return (uv[0]*.5, .5+uv[1]*.5)
    x, y, z = position
    v = (y-.78)/.52
    # The left arm is cylindrical, with the seam facing the torso. A planar
    # depth projection would stretch horizontal stripes around its curved sides.
    u = (.26-x)/.52 if chart == 'back' else ((x+.26)/.52 if chart == 'chest' else .5+math.atan2(z-.005,-(x+.185))/(2*math.pi))
    if chart == 'arm' and arm_wrap and u < .5: u += 1
    u = max(.01, min(.99, u)); v = max(.01, min(.99, v))
    return ((.5 if chart in ('chest','arm') else 0)+u*.5,
            (.5 if chart == 'arm' else 0)+(1-v)*.5)


def create_variant(role, original, atlas_path):
    source = GLB.Glb(original); doc = copy.deepcopy(source.doc); primitive = doc['meshes'][0]['primitives'][0]
    attributes = primitive['attributes']
    positions, normals, uvs = [source.accessor_rows(attributes[k]) for k in ['POSITION','NORMAL','TEXCOORD_0']]
    source_indices = [row[0] for row in source.accessor_rows(primitive['indices'])]
    rows, indices, remap, chart_counts = [], [], {}, {}
    arm_seam_triangles = 0
    for at in range(0, len(source_indices), 3):
        tri = source_indices[at:at+3]
        chart = chart_for_triangle([positions[i] for i in tri], [normals[i] for i in tri], [uvs[i] for i in tri]); chart_counts[chart] = chart_counts.get(chart,0)+1
        arm_us = [.5+math.atan2(positions[i][2]-.005,-(positions[i][0]+.185))/(2*math.pi) for i in tri] if chart=='arm' else [0]
        arm_wrap = max(arm_us)-min(arm_us) > .5
        arm_seam_triangles += int(arm_wrap)
        for index in tri:
            key = (index,chart,arm_wrap)
            if key not in remap:
                remap[key] = len(rows); rows.append((positions[index],normals[index],mapped_uv(chart,positions[index],uvs[index],arm_wrap)))
            indices.append(remap[key])
    payloads = [source.view_bytes(i) for i in range(len(doc['bufferViews']))]
    for field, width, ordinal in [('POSITION',3,0),('NORMAL',3,1),('TEXCOORD_0',2,2)]:
        accessor = doc['accessors'][attributes[field]]; accessor['count'] = len(rows)
        payloads[accessor['bufferView']] = struct.pack('<'+'f'*(len(rows)*width), *(v for row in rows for v in row[ordinal]))
    ia = doc['accessors'][primitive['indices']]; assert ia['componentType'] == 5123 and len(rows)<65536
    payloads[ia['bufferView']] = struct.pack('<'+'H'*len(indices), *indices)
    payloads[doc['images'][0]['bufferView']] = atlas_path.read_bytes()
    doc['images'][0]['name'] = 'npc_bath_tattooed_atlas'; doc['materials'][0]['name'] = 'npc_bath_tattooed_single_atlas'
    node = doc['nodes'][0]; node['name'] = role; doc['meshes'][0]['name'] = role+'_mesh'
    node['extras'].update(asset_id=role, npc_role='npc_bath_tattooed', derived_from_model=original.relative_to(ROOT).as_posix(), derived_from_sha256=sha(original),
        tattoo_source='assets/sento_visitors/tattoo/ref/koi_waves__v01.png', tattoo_source_sha256=ART_SHA,
        modifications_tattoo='Original koi/waves back tattoo and asymmetric peony/upper-arm waves; atlas and UV chart edits only; source indexed positions/normals retained exactly')
    if role.endswith('_lod_far'):
        node['extras']['lod_variant_of'] = 'npc_bath_tattooed'
    output = OUT / (role+'.glb'); output.write_bytes(GLB.encode_glb(doc,payloads))
    result = GLB.Glb(output); result_primitive = result.doc['meshes'][0]['primitives'][0]
    result_indices = [row[0] for row in result.accessor_rows(result_primitive['indices'])]
    proofs = {}
    for name in ['POSITION','NORMAL']:
        before = source.accessor_rows(attributes[name]); after = result.accessor_rows(result_primitive['attributes'][name])
        old_soup = struct.pack('<'+'f'*(3*len(source_indices)), *(v for i in source_indices for v in before[i]))
        new_soup = struct.pack('<'+'f'*(3*len(result_indices)), *(v for i in result_indices for v in after[i]))
        assert old_soup == new_soup, 'Source indexed '+name+' changed'
        proofs[name] = hashlib.sha256(old_soup).hexdigest()
    assert len(indices)//3 == SOURCES[role][2]
    assert len(result.raw) <= 500000, 'Variant exceeds its proposed 0.5 MB limit'
    GLB.metadata_audit(result)
    return {'file': output.name, 'sha256': sha(output), 'bytes': output.stat().st_size,
            'triangles': len(indices)//3, 'vertices': len(rows), 'source_vertices':len(positions),
            'source_file': original.relative_to(ROOT).as_posix(), 'source_sha256':sha(original),
            'source_triangle_position_normal_sha256': proofs, 'source_triangle_position_normal_exact':True,
            'uv_chart_triangle_counts':chart_counts, 'bounds': [doc['accessors'][attributes['POSITION']]['min'],doc['accessors'][attributes['POSITION']]['max']],
            'inner_arm_seam_triangles_unwrapped_to_skin_gutter':arm_seam_triangles,
            'materials':1,'textures':1,'texture_px':1024,'atlas_sha256':sha(atlas_path)}


def import_one(path, name):
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=str(path))
    added = set(bpy.data.objects)-before; meshes=[o for o in added if o.type=='MESH']; assert len(meshes)==1
    obj=meshes[0]; obj.name=name
    for other in added:
        if other is not obj: bpy.data.objects.remove(other,do_unlink=True)
    return obj


def packed_source_and_audit(models):
    variants=[]
    for role,(old,_,_) in SOURCES.items():
        src=import_one(ROOT/'public/models'/f'{old}.glb','SOURCE_'+old);src.hide_set(True);src.hide_render=True
        variant=import_one(OUT/f'{role}.glb',role);variant.hide_set(role.endswith('_lod_far'));variant.hide_render=role.endswith('_lod_far');variants.append(variant)
    for image in list(bpy.data.images):
        if image.type in {'RENDER_RESULT','COMPOSITING'}:
            bpy.data.images.remove(image);continue
        if image.type!='IMAGE' or not image.size[0]: continue
        image.use_fake_user=True
        if not image.packed_file:image.pack()
        name='//textures/'+''.join(c if c.isalnum() or c in '._-' else '_' for c in image.name)+'.png'
        image.filepath='//'+'x'*1000;image.filepath=name
        for packed in image.packed_files:packed.filepath='//'+'x'*1000;packed.filepath=name
    for screen in bpy.data.screens:
        for area in screen.areas:
            for space in area.spaces:
                if space.type=='FILE_BROWSER' and space.params:space.params.directory=b'/'*1023;space.params.directory=b'//'
    bpy.context.scene.render.filepath='/'*1000;bpy.context.scene.render.filepath='//';bpy.context.preferences.filepaths.save_version=0
    text=bpy.data.texts.new('SOURCE_REFERENCES.txt');text.write('Tattooed sento visitor, v01\n\nOriginal source bodies: public/models/npc_bath_standing.glb and npc_bath_standing_lod_far.glb.\nQuaternius CC0 source; project shape/pose modifications MIT.\nTattoo artwork: assets/sento_visitors/tattoo/ref/koi_waves__v01.png\nOriginal text-only OpenAI generated artwork; project rights MIT to extent permitted by law.\nThe four hidden ATLAS_* planes retain editable tattoo placement materials.\nRuntime GLBs are produced by scripts/build-tattooed-sento-visitor.py, which preserves each indexed position and normal exactly.\n'+json.dumps({k:v['sha256'] for k,v in models.items()},indent=2)+'\n')
    def facts():
        result=QA.object_facts()
        for obj in bpy.data.objects:
            if obj.type=='MESH':result[obj.name]['uv_sha256']=hashlib.sha256(array('f',(v for layer in obj.data.uv_layers for datum in layer.data for v in datum.uv)).tobytes()).hexdigest()
        return result
    before=facts();images_before=QA.image_facts();path=OUT/'npc_bath_tattooed__v01.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(path),compress=True);bpy.ops.wm.open_mainfile(filepath=str(path))
    assert before==facts()
    images_after=QA.image_facts()
    (OUT/'editable-image-roundtrip.json').write_text(json.dumps({'before':images_before,'after':images_after},indent=2)+'\n')
    assert images_before==images_after
    return {'file':path.name,'sha256':sha(path),'objects_reopened_unchanged':True,'images_reopened_unchanged':True,
            'images':images_before,'object_facts':before,'metadata':QA.binary_metadata_audit(path)}


def render_views():
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
    scene.cycles.diffuse_bounces=1;scene.cycles.glossy_bounces=1
    scene.render.resolution_x=scene.render.resolution_y=800;scene.render.resolution_percentage=100
    scene.view_settings.view_transform='AgX';scene.view_settings.look='None';scene.render.filter_size=1.5
    scene.world=bpy.data.worlds.new('Neutral visitor inspection');scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.65,.72,.8,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
    for obj in scene.objects:obj.hide_render=True
    lights=[]
    for loc,energy,size in [((3,-4,5),450,4),((-3,-1,3),230,3),((1,3,4),350,3)]:
        bpy.ops.object.light_add(type='AREA',location=loc);obj=bpy.context.object;obj.data.energy=energy;obj.data.shape='DISK';obj.data.size=size;RENDER.aim(obj,Vector((0,0,.8)));lights.append(obj)
    bpy.ops.object.camera_add();camera=bpy.context.object;scene.camera=camera;camera.data.type='ORTHO'
    output=OUT/('renders-'+sha(OUT/'npc_bath_tattooed.glb')[:12]);output.mkdir(exist_ok=True);reports=[]
    views=[('front',(0,-1,.03),False),('threequarter',(1,-1,.05),False),('threequarter_left',(-1,-1,.05),False),('back',(0,1,.03),False),('face',(0,-1,.02),True)]
    for role in SOURCES:
        obj=bpy.data.objects[role];obj.hide_render=False
        for name,direction,face in views:
            if role.endswith('_lod_far') and face:continue
            center=Vector((0,0,1.41 if face else .8));camera.location=center+Vector(direction).normalized()*4
            RENDER.aim(camera,center);camera.data.ortho_scale=.52 if face else 1.86
            path=output/f'{role}_{name}.png';scene.render.filepath=str(path)
            bpy.ops.render.render(write_still=True);RENDER.strip_png_metadata(path)
            reports.append({'file':path.relative_to(OUT).as_posix(),'sha256':sha(path),'source_glb_sha256':sha(OUT/f'{role}.glb')})
        obj.hide_render=True
    reports.extend(render_distance(scene,camera,output))
    return reports


def render_distance(scene,camera,output):
    near=bpy.data.objects['npc_bath_tattooed'];far=bpy.data.objects['npc_bath_tattooed_lod_far']
    near.hide_render=False;far.hide_render=False;near.location.x=-.62;far.location.x=.62
    camera.data.type='PERSP';camera.data.sensor_fit='VERTICAL';camera.data.sensor_height=32
    camera.data.lens=32/(2*math.tan(math.radians(55)/2))
    scene.render.resolution_x=1280;scene.render.resolution_y=720
    center=Vector((0,0,.8));distance=math.sqrt(6.1**2-.62**2)
    labels=[]
    for x,caption in [(-.62,'NEAR'),(.62,'FAR')]:
        bpy.ops.object.text_add(location=(x,-.1,-.15),rotation=(math.pi/2,0,0))
        text=bpy.context.object;text.data.body=caption;text.data.align_x='CENTER';text.data.size=.10;labels.append(text)
    reports=[]
    for name,sign in [('front',-1),('back',1)]:
        camera.location=(0,sign*distance,.8);RENDER.aim(camera,center)
        if sign==1:
            for text in labels:text.rotation_euler=(math.pi/2,0,math.pi)
        path=output/f'near_far_{name}_6m.png';scene.render.filepath=str(path)
        bpy.ops.render.render(write_still=True);RENDER.strip_png_metadata(path)
        reports.append({'file':path.relative_to(OUT).as_posix(),'sha256':sha(path),'source_glb_sha256':{role:sha(OUT/f'{role}.glb') for role in SOURCES},
                        'camera_to_nominal_bounds_center_m':6.1,'vertical_fov_degrees':55,'resolution':[1280,720],
                        'scope':'Uncropped intended-distance comparison; existing far shape is not approved for close views'})
    near.location.x=far.location.x=0
    for text in labels:bpy.data.objects.remove(text,do_unlink=True)
    return reports


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--skip-renders',action='store_true')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    assert sha(ART)==ART_SHA
    for old,digest,_ in SOURCES.values():assert sha(ROOT/'public/models'/f'{old}.glb')==digest
    OUT.mkdir(parents=True,exist_ok=True)
    for name in ['npc_bath_tattooed.glb','npc_bath_tattooed_lod_far.glb','npc_bath_tattooed_atlas.png','npc_bath_tattooed__v01.blend','measurements.json']:
        path=OUT/name
        if path.exists():
            archived=OUT/'trials'/sha(path)/name;archived.parent.mkdir(parents=True,exist_ok=True)
            if not archived.exists():archived.write_bytes(path.read_bytes())
    bpy.ops.wm.read_factory_settings(use_empty=True)
    source=GLB.Glb(ROOT/'public/models/npc_bath_standing.glb')
    atlas,atlas_report=make_atlas(source)
    models={role:create_variant(role,ROOT/'public/models'/f'{old}.glb',atlas) for role,(old,_,_) in SOURCES.items()}
    editable=packed_source_and_audit(models)
    renders=[] if args.skip_renders else render_views()
    report={'models':models,'atlas':atlas_report,'editable':editable,'renders':renders,
            'scope':'Private authored candidates only; no public adoption, world placement, or gameplay verification'}
    (OUT/'measurements.json').write_text(json.dumps(report,indent=2)+'\n')
    for old,digest,_ in SOURCES.values():assert sha(ROOT/'public/models'/f'{old}.glb')==digest
    assert sha(ART)==ART_SHA
    print('TATTOO_VARIANTS',json.dumps(models))


if __name__=='__main__':main()
