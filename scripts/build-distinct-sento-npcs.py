"""Build independent Quaternius CC0 sento adults. Private candidates, never public/.

Blender --background --python-exit-code 1 --python scripts/build-distinct-sento-npcs.py
-- --draft builds only the reception trial. No father mesh is read by this script.
"""
import bpy, bmesh, hashlib, json, math, struct, sys
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion
import numpy as np

ROOT = Path.cwd()
OUT = ROOT / 'assets/sento_visitors'
PRIVATE = ROOT / '.local/distinct-sento-npcs'
CAND = PRIVATE / 'models'
SOURCE = ROOT / 'assets/public_sources/quaternius_universal_base'
STANDARD = SOURCE / 'standard'
BODY = 'Base Characters/Godot - UE/Superhero_Male_FullBody.gltf'
HAIRS = 'Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)'
for p in [OUT/'quality', OUT/'blend', PRIVATE, CAND]: p.mkdir(parents=True, exist_ok=True)
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()

def active(o):
    bpy.ops.object.select_all(action='DESELECT'); o.hide_set(False)
    o.select_set(True); bpy.context.view_layer.objects.active = o

def tri(o):
    o.data.calc_loop_triangles(); return len(o.data.loop_triangles)

def bounds(o):
    ps = [o.matrix_world @ v.co for v in o.data.vertices]
    return [min(v[i] for v in ps) for i in range(3)], [max(v[i] for v in ps) for i in range(3)]

def geometry(o):
    return {'vertices':len(o.data.vertices), 'faces':len(o.data.polygons),
      'positions':hashlib.sha256(np.array([v.co[:] for v in o.data.vertices],dtype='<f4').tobytes()).hexdigest(),
      'indices':hashlib.sha256(np.array([i for p in o.data.polygons for i in p.vertices],dtype='<u4').tobytes()).hexdigest()}

def clip_triangle_box(points, lo, hi):
    poly=list(points)
    for axis in range(3):
        for bound,sign in [(lo[axis],1),(hi[axis],-1)]:
            if not poly:return []
            output=[]
            for a,b in zip(poly,poly[1:]+poly[:1]):
                da=(a[axis]-bound)*sign;db=(b[axis]-bound)*sign
                if da>=0:output.append(a)
                if (da>=0)!=(db>=0):output.append(a+(b-a)*(da/(da-db)))
            poly=output
    return poly

def import_source(relative):
    p = STANDARD / relative; j=json.loads(p.read_text())
    for x in j.get('images', []):
        x['uri']=str(p.parent / x['uri'].replace('_png.png','.png'))
    for x in j.get('buffers', []): x['uri']=str(p.parent / x['uri'])
    dest=PRIVATE/(p.stem+'-import.gltf'); dest.write_text(json.dumps(j))
    before=set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=str(dest))
    items=sorted(set(bpy.data.objects)-before,key=lambda o:o.name)
    for o in list(items):
        if o.type=='MESH' and o.name.startswith('Icosphere'):
            bpy.data.objects.remove(o,do_unlink=True);items.remove(o)
    return items

def flat(name,color):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*color,1)
    n.inputs['Roughness'].default_value=.78
    return m

def world_rotation(b, axis, angle):
    q=b.bone.matrix_local.to_quaternion()
    b.rotation_mode='QUATERNION'
    b.rotation_quaternion=q.conjugated() @ Quaternion(Vector(axis),math.radians(angle)) @ q

def apply_mod(o,m): active(o);bpy.ops.object.modifier_apply(modifier=m.name)

def collapse(o,target,face=True):
    count=tri(o)
    if count <= target:return
    active(o)
    bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);bm.to_mesh(o.data);bm.free()
    m=o.modifiers.new('Topology reduction, protected head','DECIMATE');m.ratio=target/tri(o);m.use_collapse_triangulate=True
    if face:
        g=o.vertex_groups.new(name='Reduction allowance')
        lo,hi=bounds(o);h=hi[2]-lo[2]
        for v in o.data.vertices:
            w=.05 if v.co.z>hi[2]-.37 else .75
            if hi[2]-.29<v.co.z<hi[2]-.12 and v.co.y<-.06:w=.008
            if v.co.z<.025:w=.05
            if any(('hand_' in o.vertex_groups[x.group].name or any(f in o.vertex_groups[x.group].name for f in ['index_','middle_','pinky_','ring_','thumb_'])) and x.weight>.1 for x in v.groups):w=.015
            g.add([v.index],w,'REPLACE')
        m.vertex_group=g.name;m.vertex_group_factor=.45
    apply_mod(o,m)

def normals(o, master):
    for p in o.data.polygons:p.use_smooth=True
    m=o.modifiers.new('Detailed source normals','DATA_TRANSFER');m.object=master;m.use_loop_data=True
    m.data_types_loops={'CUSTOM_NORMAL'};m.loop_mapping='POLYINTERP_NEAREST';apply_mod(o,m)

def strip_png(p):
    b=p.read_bytes();out=b[:8];at=8
    while at<len(b):
        n=struct.unpack_from('>I',b,at)[0];tag=b[at+4:at+8]
        if tag not in (b'tEXt',b'iTXt',b'zTXt',b'eXIf'):out+=b[at:at+n+12]
        at+=n+12
    p.write_bytes(out)

def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()

def render(o, name, direction=(0,-1,.03), face=False, extra=()):
    s=bpy.context.scene
    for x in s.objects:x.hide_render=x not in [o,*extra]
    lo,hi=bounds(o);h=hi[2]-lo[2]
    center_y=(lo[1]+hi[1])/2
    center=Vector((0,center_y,hi[2]-.19)) if face else Vector((0,center_y,h/2))
    bpy.ops.object.camera_add();cam=bpy.context.object;cam.hide_render=False;cam.data.type='ORTHO'
    cam.data.ortho_scale=.52 if face else h*1.16
    cam.location=center+Vector(direction).normalized()*4;aim(cam,center);s.camera=cam
    for xyz,power,size in [((3,-4,5),450,4),((-3,-1,3),200,3),((1,3,4),250,3)]:
        bpy.ops.object.light_add(type='AREA',location=xyz);l=bpy.context.object;l.hide_render=False
        l.data.energy=power;l.data.shape='DISK';l.data.size=size;aim(l,center)
    s.world.color=(.25,.25,.25);s.render.engine='CYCLES';s.cycles.samples=24;s.cycles.use_denoising=True
    s.cycles.diffuse_bounces=0;s.cycles.glossy_bounces=0
    s.render.resolution_x=s.render.resolution_y=640;s.render.resolution_percentage=100
    s.view_settings.view_transform='AgX';s.render.image_settings.file_format='PNG'
    s.render.filepath=str(OUT/'quality'/name);bpy.ops.render.render(write_still=True);strip_png(Path(s.render.filepath))
    for x in list(s.objects):
        if x.type in ('LIGHT','CAMERA'):bpy.data.objects.remove(x,do_unlink=True)

def bake_atlas(o, role):
    """Compact deterministic color atlas; original eye image gets 256px square.

    Uniform fabric boundaries use continuous height UVs, avoiding stair-stepped
    smart-project islands. Shared flat-color swatches are intentional; face/eye
    detail never overlaps clothing islands.
    """
    active(o);old=o.data.uv_layers.active
    original_uv=[tuple(l.uv) for l in old.data]
    eye_image=next(n.image for m in o.data.materials if 'MI_Eyes' in m.name for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image and 'Brown' in n.image.name)
    eye_copy=eye_image.copy();eye_copy.scale(240,240)
    eye_pixels=np.array(eye_copy.pixels[:],dtype=np.float32).reshape((240,240,4))
    def srgb(c):return [12.92*x if x<=.0031308 else 1.055*x**(1/2.4)-.055 for x in c]
    skin=(.56,.34,.205) if role=='npc_seated' else (.64,.42,.27)
    hair=(.035,.028,.024) if role=='npc_staff' else ((.32,.34,.33) if role=='npc_bath_standing' else (.10,.075,.055))
    pixels=np.ones((512,512,4),dtype=np.float32);pixels[:,:,:3]=srgb(skin)
    pixels[256:,:,:3]=srgb(hair)
    if role=='npc_staff':
        for y in range(256):
            z=((y+.5)/512-.02)/.46*1.6
            c=skin if z>=1.26 else ((.035,.09,.16) if z>=.76 else ((.045,.065,.085) if z>=.075 else (.024,.027,.03)))
            pixels[y,:,:3]=srgb(c)
            if z<.80:pixels[y,128:256,:3]=srgb(skin)
    pixels[264:504,264:504]=eye_pixels
    while o.data.uv_layers:o.data.uv_layers.remove(o.data.uv_layers[0])
    atlas=o.data.uv_layers.new(name='AtlasUV');atlas.active_render=True
    for p in o.data.polygons:
        mat=o.data.materials[p.material_index];eye='MI_Eyes' in mat.name
        body=('warm_matte_skin' in mat.name or 'Continuous uniform mask' in mat.name)
        for idx in p.loop_indices:
            v=o.data.vertices[o.data.loops[idx].vertex_index]
            if eye:atlas.data[idx].uv=((264+240*original_uv[idx][0])/512,(264+240*original_uv[idx][1])/512)
            elif body:
                is_hand=any(any(t in o.vertex_groups[g.group].name for t in ['hand_','index_','middle_','pinky_','ring_','thumb_']) and g.weight>.02 for g in v.groups)
                x=.375 if is_hand else .125
                atlas.data[idx].uv=(x,.02+max(0,min(1,v.co.z/1.6))*.46)
            else:atlas.data[idx].uv=(.125,.75)
    im=bpy.data.images.new(role+'_basecolor',width=512,height=512,alpha=False)
    im.pixels.foreach_set(pixels.ravel());im.update();im.pack();im.filepath='//'+im.name+'.png'
    material=flat(role+'_single_atlas',(.5,.5,.5));nt=material.node_tree;n=nt.nodes.new('ShaderNodeTexImage');n.image=im
    nt.links.new(n.outputs['Color'],nt.nodes.get('Principled BSDF').inputs['Base Color'])
    o.data.materials.clear();o.data.materials.append(material)
    for p in o.data.polygons:p.material_index=0
    for attr in list(o.data.color_attributes):o.data.color_attributes.remove(attr)
    bpy.data.images.remove(eye_copy)

def build(role):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.world=bpy.data.worlds.new('Neutral inspection world')
    # Preserve the exact imported source objects in the editable project.
    raw=import_source(BODY)
    hair_names=['Hair_Buzzed'] if role=='npc_staff' else ['Hair_SimpleParted']
    if role=='npc_seated':hair_names=['Hair_Buzzed','Hair_Beard']
    for hair in hair_names:raw+=import_source(f'{HAIRS}/{hair}.gltf')
    originals={}
    for i,o in enumerate(raw):
        o.name='SOURCE_UNMODIFIED_'+str(i)+'_'+o.name
        if o.type=='MESH':originals[o.name]=geometry(o)
    # Every original imported object is duplicated, including its skin rig.
    copies={}
    for o in raw:
        n=o.copy();n.data=o.data.copy() if o.data else None;bpy.context.scene.collection.objects.link(n);copies[o]=n
    for o,n in copies.items():
        if o.parent in copies:n.parent=copies[o.parent]
        for m in n.modifiers:
            if m.type=='ARMATURE' and m.object in copies:m.object=copies[m.object]
    work=list(copies.values());meshes=[o for o in work if o.type=='MESH']
    skin=flat(role+'_warm_matte_skin',(.56,.34,.205) if role=='npc_seated' else (.64,.42,.27))
    hair=flat(role+'_hair',(.035,.028,.024) if role=='npc_staff' else ((.32,.34,.33) if role=='npc_bath_standing' else (.10,.075,.055)))
    navy=flat('Reception navy uniform',(.035,.09,.16));pants=flat('Reception trousers',(.045,.065,.085));shoes=flat('Reception shoes',(.024,.027,.03));trim=flat('Reception collar piping',(.20,.37,.43))
    for o in meshes:
        if 'SuperHero' in o.name:
            bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);bm.to_mesh(o.data);bm.free()
            for v in o.data.vertices:
                p=v.co
                if abs(p.x)>.70:
                    wrist=Vector((math.copysign(.706,p.x),.0654,1.4555));d=p-wrist;p.x=wrist.x+d.x*.70;p.y=wrist.y+d.y*1.35;p.z=wrist.z+d.z*1.25
                if p.z>1.63 and p.y<-.035:
                    w=math.exp(-((abs(p.x)-.035)/.028)**2-((p.z-1.698)/.04)**2)
                    p.z=1.698+(p.z-1.698)*(1+.55*w)
            o.data.materials.clear()
            for mat in [skin,navy,pants,shoes,trim]:o.data.materials.append(mat)
            for p in o.data.polygons:
                c=sum((o.data.vertices[i].co for i in p.vertices),Vector())/len(p.vertices)
                # Imported source coordinates are already Z up.
                p.material_index=0
                if role=='npc_staff':
                    if .90<c.z<1.51 and abs(c.x)<.70:p.material_index=1
                    elif .10<c.z<=.90:p.material_index=2
                    elif c.z<=.10:p.material_index=3
                    if 1.48<c.z<1.515 and abs(c.x)<.15:p.material_index=4
            g=o.vertex_groups.new(name='Soften superhero torso')
            for v in o.data.vertices:
                if .92<v.co.z<1.47 and abs(v.co.x)<.29:
                    g.add([v.index],.72,'REPLACE')
            m=o.modifiers.new('Relax muscle relief','SMOOTH');m.factor=.75;m.iterations=14;m.vertex_group=g.name;apply_mod(o,m)
        elif 'Eyes' not in o.name:
            for v in o.data.vertices:
                if 'Eyebrows' in o.name:v.co.z=1.714+(v.co.z-1.714)*.55+.008
                else:
                    center=Vector((0,.015,1.70));v.co=center+(v.co-center)*1.035
            o.data.materials.clear();o.data.materials.append(hair)
        else:
            for v in o.data.vertices:v.co.z=1.698+(v.co.z-1.698)*1.45
            for mat in o.data.materials:
                mat=mat.copy();o.data.materials[0]=mat
                n=mat.node_tree.nodes.get('Principled BSDF')
                for link in list(n.inputs['Normal'].links):mat.node_tree.links.remove(link)
    for arm in [o for o in work if o.type=='ARMATURE']:
        for side,sign in [('l',1),('r',-1)]:
            if 'upperarm_'+side in arm.pose.bones:
                world_rotation(arm.pose.bones['upperarm_'+side],(0,1,0),sign*81)
        if role=='npc_seated':
            for side in ['l','r']:
                if 'thigh_'+side in arm.pose.bones:
                    world_rotation(arm.pose.bones['thigh_'+side],(1,0,0),-89)
                    world_rotation(arm.pose.bones['calf_'+side],(1,0,0),89)
    bpy.context.view_layer.update()
    if role=='npc_seated':
        for arm in [x for x in work if x.type=='ARMATURE']:
            for side,sign in [('l',1),('r',-1)]:
                for bone,desired in [('upperarm_'+side,(sign*.12,-.30,-.95)),('lowerarm_'+side,(sign*.02,-.94,-.34))]:
                    if bone not in arm.pose.bones:continue
                    b=arm.pose.bones[bone];head=b.head.copy();rest=b.bone.matrix_local.to_3x3();rot=(rest@Vector((0,1,0))).rotation_difference(Vector(desired).normalized()).to_matrix()
                    b.matrix=Matrix.Translation(head)@(rot@rest).to_4x4();bpy.context.view_layer.update()
    for o in meshes:
        for m in list(o.modifiers):
            if m.type=='ARMATURE':apply_mod(o,m)
        matrix=o.matrix_world.copy();o.parent=None;o.matrix_world=Matrix.Identity(4);o.data.transform(matrix)
        if role=='npc_seated' and 'SuperHero' in o.name:
            g=o.vertex_groups.new(name='Relax posed shoulder fold')
            for v in o.data.vertices:
                p=v.co;d=min((p-Vector((x,.035,1.40))).length for x in [-.20,.20]);w=max(0,1-d/.19)
                if w:g.add([v.index],w,'REPLACE')
            m=o.modifiers.new('Unfold seated shoulders','SMOOTH');m.factor=.75;m.iterations=12;m.vertex_group=g.name;apply_mod(o,m)
        for v in o.data.vertices:
            p=v.co
            # An adult, toy-world proportion: wider cheeks and readable head,
            # narrower shoulders; inherited face/ear topology stays intact.
            if p.z>1.54:
                k=min(1,max(0,(p.z-1.54)/.055));center=Vector((0,.0174,1.57))
                d=p-center;p.x=center.x+d.x*(1+.52*k);p.y=center.y+d.y*(1+.43*k);p.z=center.z+d.z*(1+.40*k)
            else:
                p.x*=.87
                if role=='npc_seated' and .87<p.z<1.31:
                    t=math.sin((p.z-.87)/(.44)*math.pi);p.x*=1+.13*t;p.y-=.028*t
        o.data.update()
    # Compact root layout is fitted uniformly; no whole-character axis squashing.
    points=[v.co for o in meshes for v in o.data.vertices]
    lo=Vector([min(p[i] for p in points) for i in range(3)]);hi=Vector([max(p[i] for p in points) for i in range(3)])
    factor=1.6/(hi.z-lo.z) if role!='npc_seated' else .825
    center=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
    for o in meshes:
        for v in o.data.vertices:v.co=(v.co-center)*factor
    for o in raw:o.hide_render=True;o.hide_set(True)
    for o in work:
        if o.type!='MESH':bpy.data.objects.remove(o,do_unlink=True)
    # Individual public-source parts keep eyes and hair from disappearing during
    # body reduction. Body reduction has additional face/foot protection.
    reductions=[]
    for o in meshes:
        high=o.copy();high.data=o.data.copy();bpy.context.scene.collection.objects.link(high);high.name='DETAIL_'+o.name;high.hide_render=True;high.hide_set(True)
        if 'SuperHero' in o.name:budget=1380 if role!='npc_seated' else 1480
        elif 'Eyebrows' in o.name:budget=24
        elif 'Eyes' in o.name:budget=96
        elif 'Beard' in o.name:budget=100
        else:budget=96
        collapse(o,budget,'SuperHero' in o.name);normals(o,high)
        if 'Hair_' in o.name and 'Beard' not in o.name:
            for v in o.data.vertices:v.co+=v.normal*.004
        reductions.append((o.name,tri(o)))
        if 'SuperHero' in o.name and role=='npc_staff':
            # The atlas function authors the continuous fabric bands from height UVs.
            m=flat('Continuous uniform mask',(.64,.42,.27))
            o.data.materials.clear();o.data.materials.append(m)
            for poly in o.data.polygons:poly.material_index=0
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:o.hide_set(False);o.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();o=bpy.context.object;o.name=role;o.data.name=role+'_mesh'
    lo,hi=bounds(o);scale=1.6/(hi[2]-lo[2]) if role!='npc_seated' else 1
    for v in o.data.vertices:v.co=(v.co-Vector(((lo[0]+hi[0])/2,(lo[1]+hi[1])/2,lo[2])))*scale
    if role=='npc_seated':
        from mathutils.bvhtree import BVHTree
        bv=BVHTree.FromPolygons([v.co for v in o.data.vertices],[list(p.vertices) for p in o.data.polygons])
        contact=[]
        for x in [-.10,-.07,.07,.10]:
            for y in [.08,.12,.16,.20]:
                p,n,i,d=bv.ray_cast(Vector((x,y,.05)),Vector((0,0,1)),.6)
                if p:contact.append(p.z)
        assert contact
        raise_seat=.45-min(contact)
        for v in o.data.vertices:v.co.z+=raise_seat*min(1,max(0,v.co.z/.34))
        o['seat_fit_vertical_leg_extension_m']=raise_seat
        # Existing bench placement frame: its front edge is +1/3m local Z.
        # Shift the seated actor forward inside this fixed frame, not the slot.
        for v in o.data.vertices:v.co.y-=.32
        o['placement_frame_offset_gltf']=[0,0,.32]
        o['origin_contract']='Existing bench placement frame; floor Y=0; slot TRS unchanged'
        # Sampled rays and vertices can miss a sloping triangle crossing the
        # board front edge. Clip complete faces against its actual thickness,
        # then lift the selected face vertices (including exterior endpoints).
        o.data.calc_loop_triangles();offending=set();penetrating_faces=0
        for t in o.data.loop_triangles:
            points=[o.data.vertices[i].co.copy() for i in t.vertices]
            if clip_triangle_box(points,(-.4,-1/3,.34/.9+1e-5),(.4,1/3,.45-1e-5)):
                penetrating_faces+=1;offending.update(i for i in t.vertices if o.data.vertices[i].co.z<.45002)
        lifts=[.45002-o.data.vertices[i].co.z for i in offending]
        for i in offending:o.data.vertices[i].co.z=.45002
        o['seat_surface_triangle_clip_repair']={'faces_before':penetrating_faces,'vertices_lifted':len(offending),'maximum_lift_m':max(lifts,default=0),'support_y_m':.45002}
        o.data.update();o.data.calc_loop_triangles()
        assert not any(clip_triangle_box([o.data.vertices[i].co.copy() for i in t.vertices],(-.4,-1/3,.34/.9+1e-5),(.4,1/3,.45-1e-5)) for t in o.data.loop_triangles)
    bake_atlas(o,role)
    for g in list(o.vertex_groups):o.vertex_groups.remove(g)
    o['source_author']='Quaternius';o['source_pack']='Universal Base Characters - Free Standard';o['source_license']='CC0-1.0';o['license']='MIT (project modifications); CC0-1.0 source'
    o['source_url']='https://quaternius.com/packs/universalbasecharacters'
    o['source_file']='Superhero_Male_FullBody.gltf'
    if role=='npc_seated':o['seat_anchor_gltf']=[0,.45,.14]
    o['modifications']='Independent mature sento adult; relaxed shoulders and muscles, enlarged head, source hairstyle, static pose, featureless toy surface, protected reduction and single color atlas'
    active(o);path=CAND/(role+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False)
    import runpy
    runpy.run_path(str(ROOT/'scripts/sanitize-glb-png.py'))['sanitize'](path)
    # Pack and scrub all imported source images as well as the runtime atlas.
    for im in bpy.data.images:
        if im.type=='IMAGE' and im.size[0]:
            if not im.packed_file:im.pack()
            for packed in im.packed_files:packed.filepath='//'+'x'*1000;packed.filepath='//'+im.name+'.png'
            im.filepath='//'+'x'*1000;im.filepath='//'+im.name+'.png'
    bpy.context.preferences.filepaths.save_version=0
    for screen in bpy.data.screens:
        for area in screen.areas:
            for space in area.spaces:
                if space.type=='FILE_BROWSER' and space.params:
                    space.params.directory=b'/'*1023;space.params.directory=b'//'
    bpy.context.scene.render.filepath='//'
    blend=OUT/'blend'/(role+'__v01.blend');bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=False)
    for x in bpy.context.scene.objects:x.hide_render=True
    before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path));actual=next(x for x in set(bpy.data.objects)-before if x.type=='MESH')
    for view,d,face in [('front',(0,-1,.03),False),('threequarter',(1,-1.7,.3),False),('side',(1,-.02,.03),False),('back',(0,1,.03),False),('face',(0,-1,0),True),('face_threequarter',(.6,-1,0),True)]:
        render(actual,role+'_'+view+'.png',d,face)
    result={'source_geometry_preserved':originals,'parts_after_reduction':reductions,'triangles':tri(actual),'bounds_blender_zup_m':bounds(actual),'sha256':sha(path),'bytes':path.stat().st_size,'blend_sha256':sha(blend)}
    (OUT/'quality'/(role+'-measurements.json')).write_text(json.dumps(result,indent=2)+'\n')
    print('DISTINCT_NPC',role,json.dumps(result),flush=True)

def png_chunks(data):
    assert data[:8]==b'\x89PNG\r\n\x1a\n';at=8;tags=[]
    while at<len(data):
        size=struct.unpack_from('>I',data,at)[0];tags.append(data[at+4:at+8].decode());at+=size+12
    assert at==len(data);return tags

def audit():
    """Reopen editable projects and inspect exact exported, sanitized GLBs."""
    from mathutils.bvhtree import BVHTree
    markers=[b'/'+x+b'/' for x in [b'Users',b'private',b'home']]+[b'.codex/',b'@gmail.com']
    source_records=json.loads((SOURCE/'source.json').read_text())['selected_files']
    assert all(sha(SOURCE/r['file'])==r['sha256'] for r in source_records)
    result={'date':'2026-11-21','blender':bpy.app.version_string,'models':{},'scope':'Exact near GLBs, original source bytes, reopened editable projects and offline renders. No full playthrough or production publication.'}
    checks={'source_files_unchanged':True,'source_file_count':len(source_records),'reopened_projects':{},'runtime_png_metadata':{},'render_png_metadata':{}}
    for role in ['npc_staff','npc_bath_standing','npc_seated']:
        info=json.loads((OUT/'quality'/(role+'-measurements.json')).read_text())
        path=CAND/(role+'.glb');blend=OUT/'blend'/(role+'__v01.blend')
        assert sha(path)==info['sha256'] and sha(blend)==info['blend_sha256']
        bpy.ops.wm.open_mainfile(filepath=str(blend))
        for name,expected in info['source_geometry_preserved'].items():
            assert geometry(bpy.data.objects[name])==expected,(role,name)
        packed=[{'name':im.name,'packed':bool(im.packed_file),'relative_path':not im.filepath or im.filepath.startswith('//'),'pixels_available':len(im.pixels)>0} for im in bpy.data.images if im.type=='IMAGE' and im.size[0]]
        assert all(x['packed'] and x['relative_path'] and x['pixels_available'] for x in packed)
        b=blend.read_bytes();assert b[:7]==b'BLENDER'
        assert not any(m in b for m in markers)
        checks['reopened_projects'][role]={'blend_sha256':sha(blend),'uncompressed_file_scanned':True,'private_marker_matches':0,'preserved_source_geometry_matches_import_snapshot':True,'packed_images':packed,
          'upstream_roughness_png_exif':'Original source retained: resolution tags only, independently recorded in public_sources/quality/quaternius-source-metadata.json.'}
        raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+n]);bin_data=raw[28+n:]
        assert not any(m in raw for m in markers)
        assert len(j['meshes'])==len(j['materials'])==len(j['textures'])==len(j['images'])==1
        assert len(j['meshes'][0]['primitives'])==1 and not j.get('skins') and not j.get('animations')
        p=j['meshes'][0]['primitives'][0];assert set(p['attributes'])=={'POSITION','NORMAL','TEXCOORD_0'}
        assert all(not any(key in node for key in ['matrix','translation','rotation','scale']) for node in j['nodes'])
        position=j['accessors'][p['attributes']['POSITION']];index=j['accessors'][p['indices']]
        uv=j['accessors'][p['attributes']['TEXCOORD_0']]
        for key in ['POSITION','NORMAL','TEXCOORD_0']:
            accessor=j['accessors'][p['attributes'][key]];view=j['bufferViews'][accessor['bufferView']]
            off=view.get('byteOffset',0)+accessor.get('byteOffset',0);count=accessor['count']*(2 if key=='TEXCOORD_0' else 3)
            assert accessor['componentType']==5126
            assert all(math.isfinite(x) for x in struct.unpack_from('<'+'f'*count,bin_data,off))
        image=j['images'][0];view=j['bufferViews'][image['bufferView']];off=view.get('byteOffset',0)
        png=bin_data[off:off+view['byteLength']];tags=png_chunks(png)
        assert not {'tEXt','zTXt','iTXt','eXIf'}.intersection(tags)
        w,h=struct.unpack_from('>II',png,16);assert w==h==512
        checks['runtime_png_metadata'][role]={'text_exif_chunks':0,'private_marker_matches':0,'embedded_png_sha256':hashlib.sha256(png).hexdigest()}
        bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.scene.world=bpy.data.worlds.new('Neutral inspection world')
        bpy.ops.import_scene.gltf(filepath=str(path));o=next(x for x in bpy.data.objects if x.type=='MESH')
        assert tri(o)==index['count']//3==info['triangles']
        bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
        topology={'nonmanifold_edges_after_position_weld':sum(not e.is_manifold for e in bm.edges),'degenerate_faces':sum(f.calc_area()<1e-12 for f in bm.faces)};bm.free()
        assert topology['degenerate_faces']==0
        model={'sha256':sha(path),'bytes':path.stat().st_size,'triangles':tri(o),'vertices':position['count'],'materials':1,'textures':1,'texture_px':[w,h],
          'bounds_gltf_m':{'min':position['min'],'max':position['max']},'dimensions_gltf_m':[position['max'][i]-position['min'][i] for i in range(3)],
          'identity_transforms':True,'static':True,'attributes':list(p['attributes']),'finite_geometry':True,'topology':topology,
          'source_author':'Quaternius','source_license':'CC0-1.0','license':'MIT (project modifications); CC0-1.0 source',
          'editable_project':str(blend.relative_to(ROOT)),'blend_sha256':sha(blend),'quality_render_files':[]}
        for view_name in ['front','threequarter','side','back','face','face_threequarter']:
            png_path=OUT/'quality'/f'{role}_{view_name}.png';tags=png_chunks(png_path.read_bytes())
            assert not {'tEXt','zTXt','iTXt','eXIf'}.intersection(tags)
            checks['render_png_metadata'][png_path.name]={'text_exif_chunks':0,'sha256':sha(png_path)};model['quality_render_files'].append(png_path.name)
        if role=='npc_seated':
            bv=BVHTree.FromPolygons([v.co for v in o.data.vertices],[list(p.vertices) for p in o.data.polygons])
            rays=[]
            for x in [-.10,-.07,.07,.10]:
                for y in [-.24,-.20,-.16,-.12]:
                    hit,normal,face,distance=bv.ray_cast(Vector((x,y,.05)),Vector((0,0,1)),.6)
                    assert hit is not None
                    rays.append({'gltf_xz_m':[x,-y],'support_y_m':hit.z})
            minimum=min(r['support_y_m'] for r in rays);assert minimum>=.45-1e-6
            # The curved support can contact between sampled rays; verify the
            # actual support vertices and complete triangles below as well.
            assert abs(position['min'][1])<1e-6
            model['seat_contact']={'anchor_gltf_m':[0,.45,.14],'placement_frame_offset_gltf_m':[0,0,.32],'origin_contract':'Existing bench placement frame; floor Y=0; slot TRS unchanged','lowest_ray_support_y_m':minimum,'contact_rays':rays,'feet_y_m':position['min'][1],
              'scaled_scene_seat_y_m':.405,'scene_scale':.9,'scene_yaw_degrees':90}
            plate_vertices=[v.co for v in o.data.vertices if abs(v.co.x)<=.31 and -1/3<=v.co.y<=1/3 and .20<v.co.z<.60]
            low=min(v.z for v in plate_vertices);penetrating=sum(v.z<.445 for v in plate_vertices)
            assert abs(low-.45)<3e-5
            model['seat_contact']['actual_support_vertex_y_m']=low
            model['seat_contact']['support_plate_vertex_audit']={'scope':'Vertices inside the QA plate footprint and the seat-height band; this is separate from the sixteen sampled rays. Not a full triangle/bench collision proof.','plate_footprint_blender_xy_m':[[-.31,-1/3],[.31,1/3]],'vertical_inspection_band_m':[.20,.60],'examined_export_vertices':len(plate_vertices),'vertices_more_than_5mm_below_top':penetrating,'lowest_vertex_y_gltf_m':low,'maximum_local_overlap_m':max(0,.45-low),'maximum_overlap_at_world_scale_m':max(0,.45-low)*.9,'acceptance':'Final placed-scene visual review; do not interpret the ray minimum as zero penetration everywhere.'}
            # Actual bench top/bottom: .405/.340m world divided by the .9 slot
            # scale. Cross sections below the seat contact isolate the lower
            # legs; their rear surface must clear the full +1/3m front edge.
            sections=[];o.data.calc_loop_triangles()
            for height_y in [.34/.9,.40,.42,.43,.435]:
                crossings=[]
                for t in o.data.loop_triangles:
                    points=[o.data.vertices[i].co for i in t.vertices]
                    for a,b in zip(points,points[1:]+points[:1]):
                        if (a.z-height_y)*(b.z-height_y)<0:
                            p=a+(b-a)*((height_y-a.z)/(b.z-a.z));crossings.append(-p.y)
                assert crossings
                rear=min(crossings);clearance=rear-1/3
                assert clearance>.015,'Lower leg still intersects the actual bench front edge'
                sections.append({'height_y_gltf_m':height_y,'lower_leg_rear_z_gltf_m':rear,'front_edge_clearance_m':clearance})
            model['seat_contact']['actual_bench_front_edge']={'edge_z_local_m':1/3,'slab_bottom_y_local_m':.34/.9,'slab_top_y_local_m':.45,'lower_leg_cross_sections':sections,'minimum_clearance_m':min(x['front_edge_clearance_m'] for x in sections),'scope':'Cross sections of the exact near GLB at the actual seat-board thickness; full placed-world triangle and visual checks are separate.'}
            clipped_faces=sum(bool(clip_triangle_box([o.data.vertices[i].co.copy() for i in t.vertices],(-.4,-1/3,.34/.9+1e-5),(.4,1/3,.45-1e-5))) for t in o.data.loop_triangles)
            assert clipped_faces==0
            model['seat_contact']['full_triangle_board_interior_audit']={'penetrating_triangles':clipped_faces,'board_box_blender_zup_m':[[-.4,-1/3,.34/.9+1e-5],[.4,1/3,.45-1e-5]],'scope':'Six-plane clipping of every reimported near triangle against the continuous conservative board interior; actual three-board world validation remains separate.'}
            bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,(.45+.34/.9)/2));bench=bpy.context.object;bench.name='QA actual bench depth support';bench.scale=(.62,2/3,.45-.34/.9);bench.data.materials.append(flat('Neutral bench',(.19,.22,.24)))
            render(o,role+'_seat-contact.png',(1,-1.5,.18),extra=[bench])
            model['quality_render_files'].append(role+'_seat-contact.png')
            checks['render_png_metadata'][role+'_seat-contact.png']={'text_exif_chunks':0,'sha256':sha(OUT/'quality'/(role+'_seat-contact.png'))}
        result['models'][role]=model
    # Fresh imports give an independent comparison for all saved source shapes.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    originals=import_source(BODY)
    for hair in ['Hair_Buzzed','Hair_SimpleParted','Hair_Beard']:originals+=import_source(f'{HAIRS}/{hair}.gltf')
    fresh=[geometry(o) for o in originals if o.type=='MESH']
    for role in result['models']:
        snapshot=json.loads((OUT/'quality'/(role+'-measurements.json')).read_text())['source_geometry_preserved']
        assert all(expected in fresh for expected in snapshot.values())
    checks['fresh_import_matches_preserved_geometry']=True
    (OUT/'quality'/'measurements.json').write_text(json.dumps(result,indent=2)+'\n')
    (OUT/'quality'/'audit.json').write_text(json.dumps(checks,indent=2)+'\n')
    print('DISTINCT_AUDIT_OK',json.dumps({k:v['triangles'] for k,v in result['models'].items()}),flush=True)

def comparison():
    """Offline visual comparison only: father bytes are never modified or reused."""
    father=ROOT/'public/models/adult.glb';before_sha=sha(father)
    bpy.ops.wm.read_factory_settings(use_empty=True);s=bpy.context.scene;s.world=bpy.data.worlds.new('Comparison world');s.world.color=(.25,.25,.25)
    labels=[('Father',father,-1.5),('Reception',CAND/'npc_staff.glb',-.5),('Older visitor',CAND/'npc_bath_standing.glb',.5),('Seated visitor',CAND/'npc_seated.glb',1.5)]
    sources={}
    for label,path,x in labels:
        before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path));items=set(bpy.data.objects)-before
        for o in items:
            if o.name.startswith('Icosphere') or o.name.startswith('outfit_clothed'):o.hide_render=True
        roots=[o for o in items if o.parent is None]
        for o in roots:o.location.x+=x
        sources[label]={'file':path.name,'sha256':sha(path)}
        bpy.ops.object.text_add(location=(x,-.03,-.10),rotation=(math.pi/2,0,0));t=bpy.context.object;t.data.body=label;t.data.align_x='CENTER';t.data.size=.075;t.data.extrude=0
        t.data.materials.append(flat('Label ivory',(.7,.73,.75)))
    bpy.ops.object.camera_add(location=(3,-10,3.2));cam=bpy.context.object;target=Vector((0,0,.77));cam.location=target+Vector((.10,-1,.12)).normalized()*9;aim(cam,target)
    cam.data.type='ORTHO';cam.data.ortho_scale=4.4;s.camera=cam
    for pos,power,size in [((3,-6,8),1000,7),((-4,-3,4),650,6),((0,5,7),900,6)]:
        bpy.ops.object.light_add(type='AREA',location=pos);l=bpy.context.object;l.data.energy=power;l.data.size=size;aim(l,target)
    s.render.engine='CYCLES';s.cycles.samples=32;s.cycles.use_denoising=True;s.cycles.diffuse_bounces=0;s.cycles.glossy_bounces=0
    s.render.resolution_x=1600;s.render.resolution_y=840;s.render.resolution_percentage=100;s.view_settings.view_transform='AgX';s.render.image_settings.file_format='PNG'
    s.render.filepath=str(OUT/'quality'/'father-and-distinct-visitors.png');bpy.ops.render.render(write_still=True);strip_png(Path(s.render.filepath))
    assert sha(father)==before_sha
    (OUT/'quality'/'comparison.json').write_text(json.dumps({'scope':'Same camera, meter scale and lighting. Father read only for comparison; no father geometry enters visitor assets.','sources':sources,'image_sha256':sha(Path(s.render.filepath))},indent=2)+'\n')

if __name__=='__main__':
    for record in json.loads((SOURCE/'source.json').read_text())['selected_files']:
        assert sha(SOURCE/record['file'])==record['sha256']
    if '--audit' in sys.argv:
        audit();sys.exit(0)
    if '--comparison' in sys.argv:
        comparison();sys.exit(0)
    roles=['npc_staff','npc_bath_standing','npc_seated']
    if '--draft' in sys.argv:roles=['npc_staff']
    if '--role' in sys.argv:roles=[sys.argv[sys.argv.index('--role')+1]]
    for role in roles:build(role)
