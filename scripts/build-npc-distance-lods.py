"""Preserve the accepted NPCs and derive far-only meshes from their real GLBs.

Blender --background --python scripts/build-npc-distance-lods.py
No canonical source is overwritten. Candidates are not automatically activated.
"""
import bpy, bmesh, hashlib, json, math, struct
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path.cwd()
OUT = ROOT / 'assets/sento_npcs/quality/distance-lod'
CAND = ROOT / '.local/environment-refresh/npc-lod'
OUT.mkdir(parents=True, exist_ok=True)
CAND.mkdir(parents=True, exist_ok=True)
EXPECTED = {
    'npc_staff': '3b953cbbad8fb11e1279e76f5067c82c477112cf54e2cbb502c8f92890a2e90d',
    'npc_bath_standing': '994ae0ce22b4e49528b7221929c5c82345c71340f84af10f4e4645c02f791614',
    'npc_seated': 'a92cee73882b54df44a08d12bef55f0c462853ecaf5643961a32d39a3d7506c9',
}
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()

def active(o):
    bpy.ops.object.select_all(action='DESELECT')
    o.hide_set(False); o.select_set(True); bpy.context.view_layer.objects.active = o

def bounds(o):
    ps = [o.matrix_world @ v.co for v in o.data.vertices]
    return [min(p[i] for p in ps) for i in range(3)], [max(p[i] for p in ps) for i in range(3)]

def facts(o):
    o.data.calc_loop_triangles()
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-6)
    result = {'triangles': len(o.data.loop_triangles), 'vertices': len(o.data.vertices),
              'bounds_blender_z_up': bounds(o),
              'nonmanifold_after_uv_weld': sum(not e.is_manifold for e in bm.edges),
              'degenerate_faces': sum(f.calc_area() < 1e-12 for f in bm.faces),
              'finite': all(math.isfinite(n) for v in o.data.vertices for n in v.co)}
    bm.free(); return result

def strip_png(p):
    b = p.read_bytes(); out = b[:8]; at = 8
    while at < len(b):
        size = struct.unpack_from('>I', b, at)[0]; tag = b[at+4:at+8]
        if tag not in (b'tEXt', b'iTXt', b'zTXt', b'eXIf'): out += b[at:at+size+12]
        at += size+12
    p.write_bytes(out)

def aim(o, point): o.rotation_euler = (Vector(point)-o.location).to_track_quat('-Z', 'Y').to_euler()

def render(o, name, side=False, distant=False):
    scene = bpy.context.scene
    for item in scene.objects: item.hide_render = item != o
    lo, hi = bounds(o); center = Vector((0, 0, (hi[2]+lo[2])/2))
    bpy.ops.object.camera_add(); cam = bpy.context.object; cam.hide_render = False
    cam.data.type = 'PERSP'; cam.data.lens = 35; cam.data.sensor_fit = 'VERTICAL'; cam.data.sensor_height = 36
    cam.data.angle = math.radians(55)
    direction = Vector((1, -.12, .08) if side else (1.05, -1.8, .35)).normalized()
    cam.location = center + direction * (6.2 if distant else 2.8); aim(cam, center); scene.camera = cam
    for xyz, power, size in [((3,-4,5),450,4),((-3,-1,3),200,3),((1,3,4),250,3)]:
        bpy.ops.object.light_add(type='AREA', location=xyz); light=bpy.context.object; light.data.energy=power;light.data.shape='DISK';light.data.size=size;aim(light,center)
    scene.world.color=(.25,.25,.25)
    scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True
    scene.cycles.diffuse_bounces=0;scene.cycles.glossy_bounces=0
    scene.render.resolution_x=720;scene.render.resolution_y=720;scene.render.resolution_percentage=100
    scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG'
    scene.render.filepath=str(OUT/name);bpy.ops.render.render(write_still=True);strip_png(OUT/name)
    for item in list(scene.objects):
        if item.type in ('LIGHT','CAMERA'): bpy.data.objects.remove(item,do_unlink=True)

report={'date':'2026-11-21','blender':bpy.app.version_string,'distance_rule':'Far only beyond 6m or Overview; near source retained exactly','models':{}}
for name, expected in EXPECTED.items():
    source_path=ROOT/f'public/models/{name}.glb';assert sha(source_path)==expected
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.world=bpy.data.worlds.new('Neutral inspection world')
    bpy.ops.import_scene.gltf(filepath=str(source_path))
    source=next(o for o in bpy.context.scene.objects if o.type=='MESH')
    matrix=source.matrix_world.copy();source.parent=None;source.matrix_world=Matrix.Identity(4);source.data.transform(matrix)
    source.name='SOURCE_'+name; source.data.calc_loop_triangles()
    original=facts(source)
    low=source.copy();low.data=source.data.copy();low.name=name+'_lod_far';bpy.context.scene.collection.objects.link(low)
    # glTF splits vertices along UV/normal seams. Weld positions while retaining
    # loop UVs before collapse so the far mesh remains a closed connected body.
    bm=bmesh.new();bm.from_mesh(low.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
    bm.to_mesh(low.data);bm.free();low.data.update()
    active(low)
    group=low.vertex_groups.new(name='Preserve facial silhouette and contact features')
    lo,hi=bounds(source);h=hi[2]-lo[2]
    for v in low.data.vertices:
        t=(v.co.z-lo[2])/h
        weight=.15 if t>.78 else .65
        if t<.025: weight=.10
        group.add([v.index],weight,'REPLACE')
    dec=low.modifiers.new('Far-only source reduction','DECIMATE');dec.ratio=600/len(source.data.loop_triangles)
    dec.vertex_group=group.name;dec.vertex_group_factor=.08;dec.use_collapse_triangulate=True
    bpy.ops.object.modifier_apply(modifier=dec.name)
    for v in low.data.vertices:
        v.co=Vector([max(lo[i],min(hi[i],v.co[i])) for i in range(3)])
    for p in low.data.polygons:p.use_smooth=True
    norm=low.modifiers.new('Source normal continuity','DATA_TRANSFER');norm.object=source;norm.use_loop_data=True;norm.data_types_loops={'CUSTOM_NORMAL'};norm.loop_mapping='POLYINTERP_NEAREST'
    bpy.ops.object.modifier_apply(modifier=norm.name)
    active(low);path=CAND/f'{name}_lod_far.glb'
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_cameras=False,export_lights=False)
    # Preserve actual source/derived objects and packed textures in an editable file.
    for image in bpy.data.images:
        if image.type=='IMAGE' and image.size[0]:
            if not image.packed_file:image.pack()
            image.filepath='//'+image.name+'.png'
    source.hide_render=True;source.hide_set(True)
    bpy.context.preferences.filepaths.save_version=0
    for screen in bpy.data.screens:
        for area in screen.areas:
            for space in area.spaces:
                if space.type=='FILE_BROWSER' and space.params:
                    space.params.directory=b'/'*1023
                    space.params.directory=b'//'
    bpy.context.scene.render.filepath='//'
    blend=ROOT/f'assets/sento_npcs/blend/{name}__lod_far_v01.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=True)
    # Inspect the exported data rather than the pre-export working mesh.
    for item in bpy.context.scene.objects:item.hide_render=True
    before=set(bpy.context.scene.objects);bpy.ops.import_scene.gltf(filepath=str(path))
    actual=next(o for o in set(bpy.context.scene.objects)-before if o.type=='MESH')
    measured=facts(actual)
    print('NPC_LOD_MEASURE',name,json.dumps(measured),flush=True)
    assert measured['finite'] and not measured['nonmanifold_after_uv_weld'] and not measured['degenerate_faces']
    for obj,label in [(source,'high'),(actual,'far')]:
        render(obj,f'{name}_{label}_threequarter.png')
        render(obj,f'{name}_{label}_side.png',side=True)
        render(obj,f'{name}_{label}_6m.png',distant=True)
    report['models'][name]={'source_file':source_path.relative_to(ROOT).as_posix(),'source_sha256':expected,'source':original,'blend_file':blend.relative_to(ROOT).as_posix(),'blend_sha256':sha(blend),'candidate_file':path.name,'sha256':sha(path),'bytes':path.stat().st_size,'measured':measured}
    assert sha(source_path)==expected
(OUT/'measurements.json').write_text(json.dumps(report,indent=2)+'\n')
print('NPC_LOD_COMPLETE',json.dumps({k:v['measured']['triangles'] for k,v in report['models'].items()}))
