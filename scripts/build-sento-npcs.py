"""Build source-derived NPCs. Add -- --compact for the two compact v02 models.

The default rebuilds the historical v01 set. Compact mode preserves seated v01
and only changes the reception/short-band candidates and their own evidence.
"""
import sys
if '--compact' in sys.argv:
    """Derive static sento NPCs from the actual Adult v02 source, without promotion.

    Blender --background --python scripts/build-sento-npcs.py
    Outputs editable source, candidate GLBs and reimported quality evidence.
    """
    import bpy, bmesh, hashlib, json, math, runpy, struct, subprocess
    from pathlib import Path
    import numpy as np
    from mathutils import Vector, Matrix
    from mathutils.bvhtree import BVHTree

    ROOT=Path.cwd(); OUT=ROOT/'assets/sento_npcs'; CAND=ROOT/'.local/environment-refresh/npc'
    OUT.mkdir(parents=True,exist_ok=True); CAND.mkdir(parents=True,exist_ok=True)
    (OUT/'blend').mkdir(exist_ok=True); (OUT/'quality').mkdir(exist_ok=True)
    H=runpy.run_path(str(ROOT/'scripts/refine-human-models.py'),run_name='npc_source_helpers')
    SOURCE=ROOT/'assets/adult/blend/adult__v02.blend'
    RAW=ROOT/'assets/adult/gen/adult__meshy6lite_raw_v01.glb'
    REF=ROOT/'assets/adult/ref/adult__ref_threequarter_v01.png'
    BLEND=OUT/'blend/sento_npcs__compact_v02.blend'
    SHA=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
    SM=H['smoothstep']; activate=H['activate']; strip_png=H['strip_png']
    OFFSET=np.array([.014078214764595032,.001163199543952942,-.00022710429038852453])

    def digest(o):
        return {'vertices':len(o.data.vertices),'faces':len(o.data.polygons),
          'positions':hashlib.sha256(np.array([v.co[:] for v in o.data.vertices],dtype='<f4').tobytes()).hexdigest(),
          'indices':hashlib.sha256(np.array([i for p in o.data.polygons for i in p.vertices],dtype='<u4').tobytes()).hexdigest()}

    def transform(points,origin,target,oldvec,newvec):
        rotation=np.array(Vector(oldvec).rotation_difference(Vector(newvec)).to_matrix())
        scale=np.linalg.norm(newvec)/np.linalg.norm(oldvec)
        return ((points-origin) @ rotation.T)*scale+target

    def arm_anchors(ref, sign):
        shoulder=np.array([sign*.17,-.012,1.20]); elbow=np.array([sign*.300,-.025,.99])
        hand=ref[(ref[:,0]*sign>.23*1.7)&(ref[:,2]<.48*1.7)].mean(0)
        shoulder2=shoulder.copy();shoulder2[0]*=1.68;shoulder2[2]-=.045;shoulder2[1]+=.10
        target=np.array([-.3077082633972168,-.2201717048883438,.8723217844963074]) if sign<0 else np.array([.32,-.065,.65])
        l1=np.linalg.norm(elbow-shoulder);l2=np.linalg.norm(hand-elbow)
        delta=target-shoulder2;distance=np.linalg.norm(delta);axis=delta/distance
        stretch=max(1,distance/(.999*(l1+l2)));l1*=stretch;l2*=stretch
        along=(l1*l1-l2*l2+distance*distance)/(2*distance);rise=math.sqrt(max(0,l1*l1-along*along))
        outward=elbow-shoulder;perp=outward-axis*np.dot(outward,axis);perp/=np.linalg.norm(perp)
        if sign<0:
          down=np.array([0.,0.,-1.]);down-=axis*np.dot(down,axis);down/=np.linalg.norm(down)
          perp=perp*.25+down*.75;perp/=np.linalg.norm(perp)
        elbow2=shoulder2+axis*along+perp*rise
        return shoulder,elbow,hand,shoulder2,elbow2,target


    QA=OUT/'quality/compact-v02';QA.mkdir(exist_ok=True)
    seat_fixed=SHA(CAND/'npc_seated.glb') if (CAND/'npc_seated.glb').exists() else None
    v01_blend_fixed=SHA(OUT/'blend/sento_npcs__v01.blend')
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    original_raw=bpy.data.objects['SOURCE_RAW_UNMODIFIED']; raw_digest=digest(original_raw)
    original_masters={n:digest(bpy.data.objects[n]) for n in ('MASTER_clothed_source_pose','MASTER_bath_featureless_toy')}
    # Pose classification and bone lengths are taken from the dense source, shared by LODs.
    source_ref=np.array([a.vector[:] for a in bpy.data.objects['MASTER_bath_featureless_toy'].data.attributes['reference_position'].data])
    anchors={sign:arm_anchors(source_ref,sign) for sign in (-1,1)}


    def compact_pose(obj):
        old=np.array([v.co[:] for v in obj.data.vertices]);ref=np.array([a.vector[:] for a in obj.data.attributes['reference_position'].data]);p=old.copy()
        # Relax the original exaggerated shoulder spread locally; head, lower torso,
        # hips, legs and feet retain their proportions. No global axis compression.
        shoulder=np.exp(-((old[:,2]-1.155)/.16)**4)*(1-SM(1.26,1.32,old[:,2]))*SM(.13,.28,np.abs(old[:,0]))
        p[:,0]-=np.sign(old[:,0])*.0406*shoulder
        p[:,2]-=.012*shoulder
        for sign in (-1,1):
          sr,er,hr,sh,e,hand=anchors[sign]
          sn=np.array([sign*.245,.088,1.143]);en=np.array([sign*.250,.075,.91]);hn=np.array([sign*.245,.055,.655])
          upper=transform(old,sh,sn,e-sh,en-sn);lower=transform(old,e,en,hand-e,hn-en)
          along=np.sum((ref-er)*(hr-sr),axis=1)/np.linalg.norm(hr-sr)
          elbow_weight=SM(-.045*1.7,.045*1.7,along)
          arm=upper*(1-elbow_weight[:,None])+lower*elbow_weight[:,None]
          inner=.17-.035*1.7+.45*np.maximum(0,1.20-ref[:,2])
          member=SM(inner,inner+.025*1.7,ref[:,0]*sign)*(1-SM(1.20+.005*1.7,1.20+.07*1.7,ref[:,2]))*SM(.22*1.7,.32*1.7,ref[:,2])
          p=p*(1-member[:,None])+arm*member[:,None]
        for vertex,point in zip(obj.data.vertices,p):vertex.co=point
        obj.data.update()

    results={}; runtime=[]; masters=[]
    for id,outfit,budget in [('npc_staff','clothed',1600),('npc_bath_standing','bath',1600)]:
        source=bpy.data.objects['MASTER_clothed_source_pose' if outfit=='clothed' else 'MASTER_bath_featureless_toy']
        high=source.copy();high.data=source.data.copy();bpy.context.collection.objects.link(high);high.name='DETAIL_'+id
        for vertex in high.data.vertices:vertex.co+=Vector(OFFSET)
        high.data.materials.clear();high.data.materials.append(H['color_material']('adult',outfit))
        # Reduce the already-corrected runtime surface while retaining its authored
        # face UV patch and original texture. A fresh coarse-face rebake produced
        # visible triangular color seams and was rejected.
        runtime_source=bpy.data.objects['outfit_'+outfit]
        low=runtime_source.copy();low.data=runtime_source.data.copy();bpy.context.collection.objects.link(low)
        for vertex in low.data.vertices:vertex.co+=Vector(OFFSET)
        activate(low)
        group=low.vertex_groups.new(name='NPC face-first allocation')
        for vertex in low.data.vertices:
          ref=low.data.attributes['reference_position'].data[vertex.index].vector
          weight=.035 if ref.z>1.30 else .68
          if ref.z>1.34 and ref.y<-.11:weight=0
          if .64<ref.z<.92:weight=.18
          if 1.08<ref.z<1.30 and abs(ref.x)>.14:weight=.035
          if .82<ref.z<1.08 and abs(ref.x)>.24:weight=.12
          if ref.z<.85 and abs(ref.x)>.34:weight=.08
          if ref.z<.10:weight=.40
          group.add([vertex.index],weight,'REPLACE')
        dec=low.modifiers.new('NPC source-derived LOD','DECIMATE');dec.ratio=(budget+4)/5800
        dec.vertex_group=group.name;dec.vertex_group_factor=.035;bpy.ops.object.modifier_apply(modifier=dec.name)
        low.data.calc_loop_triangles()
        if len(low.data.loop_triangles)>budget:
          dec=low.modifiers.new('NPC final budget trim','DECIMATE');dec.ratio=budget/len(low.data.loop_triangles);bpy.ops.object.modifier_apply(modifier=dec.name)
        # Collapse creates new points inside curved shoulders. Reproject those
        # points to the detailed inherited surface before applying the seat pose.
        surface=BVHTree.FromPolygons([v.co for v in high.data.vertices],[p.vertices[:] for p in high.data.polygons],all_triangles=True)
        for vertex in low.data.vertices:
          nearest=surface.find_nearest(vertex.co)[0]
          if nearest is not None:vertex.co=nearest
        low.data.update()
        material=low.data.materials[0].copy();low.data.materials.clear();low.data.materials.append(material)
        material.name=id+'_satin_toy';texture=next(n for n in material.node_tree.nodes if n.type=='TEX_IMAGE')
        image=texture.image.copy();image.name=id+'_basecolor_v02';image.scale(512,512);image.pack();texture.image=image
        low.name=id+'_body';low.data.name=id+'_mesh'
        compact_pose(high);compact_pose(low)
        # Correct origin once, using the real low mesh. No anisotropic box scaling.
        points=np.array([v.co[:] for v in low.data.vertices]);lo=points.min(0);hi=points.max(0)
        offset=Vector(((lo[0]+hi[0])/2,(lo[1]+hi[1])/2,lo[2]))
        for obj in (low,high):
          for vertex in obj.data.vertices:vertex.co-=offset
          obj.data.update()
        uniform_scale=1.6/(hi[2]-lo[2])
        for obj in (low,high):
          for vertex in obj.data.vertices:vertex.co*=uniform_scale
          obj.data.update()
        activate(low)
        # Transforming vertices invalidates the standing normals; transfer from the posed master.
        low.data.normals_split_custom_set([(0,0,0)]*len(low.data.loops))
        normal=low.modifiers.new('Posed source normals','DATA_TRANSFER');normal.object=high;normal.use_loop_data=True;normal.data_types_loops={'CUSTOM_NORMAL'};normal.loop_mapping='POLYINTERP_NEAREST';bpy.ops.object.modifier_apply(modifier=normal.name)
        root=bpy.data.objects.new(id,None);bpy.context.collection.objects.link(root)
        root['asset_id']=id;root['parent_asset']='adult';root['license']='CC-BY-4.0';root['source_file']='assets/adult/blend/adult__v02.blend'
        root['modifications']='Source-derived compact arms-down adult pose; protected face and hands; inherited texture'+('; seated leg and arm pose' if id=='npc_seated' else '')
        low.parent=root
        low['parent_asset']='adult';low['license']='CC-BY-4.0';low['role']=id
        high.hide_render=True;high.hide_set(True);runtime.append((id,root,low));masters.append(high)
        low.data.calc_loop_triangles()
        results[id]={'triangle_budget':budget,'triangles_before_export':len(low.data.loop_triangles),'texture_px':512,
          'uniform_scale_to_height':uniform_scale,'origin_offset_blender_xyz':list(offset),'parent_asset':'adult','head_triangles':sum(all(low.data.attributes['reference_position'].data[i].vector.z>1.25 for i in p.vertices) for p in low.data.polygons)}
        assert results[id]['triangles_before_export']<=budget
        assert results[id]['head_triangles']>=250,(id,'face reduction lost detail',results[id])

    assert digest(original_raw)==raw_digest
    assert all(digest(bpy.data.objects[n])==d for n,d in original_masters.items())
    for obj in bpy.data.objects:
        obj.hide_render=True;obj.hide_set(True)
    for _,root,low in runtime:
        root.hide_set(False);low.hide_set(False);low.hide_render=False
    for image in bpy.data.images:
        if image.packed_file:
          image.filepath='//'+'x'*1000;image.filepath='//'+image.name+'.png'
          for packed in image.packed_files:packed.filepath='//'+'x'*1000;packed.filepath='//'+image.name+'.png'
    for screen in bpy.data.screens:
        for area in screen.areas:
          for space in area.spaces:
            if space.type=='FILE_BROWSER' and space.params:
              space.params.directory=b'/'*1023;space.params.directory=b'//'
    bpy.context.scene.render.filepath='//';bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND),compress=True)
    for id,root,low in runtime:
        bpy.ops.object.select_all(action='DESELECT');root.hide_set(False);low.hide_set(False);root.select_set(True);low.select_set(True)
        for child in root.children:
          child.hide_set(False);child.select_set(True)
        path=CAND/(id+'.glb')
        bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_copyright='Meshy 6 Lite derived model, CC BY 4.0; Blender modifications by Sento Duck Explorer')
        H['SANITIZE_GLB'](path)
        results[id].update(sha256=SHA(path),bytes=path.stat().st_size)

    # Actual export/reimport is authoritative for quality images and measurements.
    for id in results:
        bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(CAND/(id+'.glb')))
        meshes=[o for o in bpy.data.objects if o.type=='MESH'];points=np.array([o.matrix_world @ v.co for o in meshes for v in o.data.vertices]);lo=points.min(0);hi=points.max(0)
        nonmanifold=degenerate=triangles=0
        for obj in meshes:
          bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7)
          nonmanifold+=sum(not e.is_manifold for e in bm.edges);degenerate+=sum(f.calc_area()<1e-14 for f in bm.faces);bm.free()
          obj.data.calc_loop_triangles();triangles+=len(obj.data.loop_triangles)
        assert np.isfinite(points).all() and nonmanifold==0 and degenerate==0
        results[id].update(triangles=triangles,dimensions_gltf_m=[float(hi[0]-lo[0]),float(hi[2]-lo[2]),float(hi[1]-lo[1])],
          bounds_blender_zup_m=[lo.tolist(),hi.tolist()],nonmanifold_after_uv_weld=nonmanifold,degenerate_faces=degenerate,finite_vertices=True,
          materials=len({m for o in meshes for m in o.data.materials}),textures=len([im for im in bpy.data.images if im.type=='IMAGE']))
        scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.diffuse_bounces=0;scene.cycles.glossy_bounces=0;scene.cycles.use_denoising=True
        scene.render.resolution_x=scene.render.resolution_y=640;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
        scene.world=bpy.data.worlds.new('Neutral inspection world');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.09,.09,.09,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.55
        height=float(hi[2]-lo[2]);target=Vector((0,0,height*.50))
        for position,power,size in [((1.7,-2.6,3),350,2.4),((-2,-1.4,1.3),150,2.5),((.5,2,2.3),200,1.8)]:
          bpy.ops.object.light_add(type='AREA',location=Vector(position)*height);light=bpy.context.object;light.data.energy=power*height*height;light.data.size=size*height;light.rotation_euler=(target-light.location).to_track_quat('-Z','Y').to_euler()
        bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=height*1.2;scene.camera=cam
        quality=QA/id;quality.mkdir(exist_ok=True)
        for name,direction in [('front',(0,-1,.06)),('threequarter',(.6,-1,.2)),('side',(1,0,.05)),('left',(-1,0,.05)),('back',(0,1,.08))]:
          cam.location=target+Vector(direction).normalized()*height*4;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(quality/(name+'.png'));bpy.ops.render.render(write_still=True);strip_png(Path(scene.render.filepath))
        # Dedicated face evidence prevents a small body image from masking lost facial detail.
        target=Vector((0,0,hi[2]-.21));cam.location=target+Vector((0,-1,0))*height*4;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=.52;scene.render.filepath=str(quality/'face.png');bpy.ops.render.render(write_still=True);strip_png(Path(scene.render.filepath))

    report={'parent_asset':'adult','source_blend':'assets/adult/blend/adult__v02.blend','source_blend_sha256':SHA(SOURCE),'reference_file':'assets/adult/ref/adult__ref_threequarter_v01.png','reference_sha256':SHA(REF),'raw_file':'assets/adult/gen/adult__meshy6lite_raw_v01.glb','raw_sha256':SHA(RAW),'raw_geometry_preserved':raw_digest,'original_masters_unchanged':original_masters,'blend_sha256':SHA(BLEND),'models':results,'scope':'Static source-derived NPCs; no skeleton, animation, gameplay or publication.'}
    (QA/'measurements.json').write_text(json.dumps(report,indent=2)+'\n')
    print('NPC_DONE',json.dumps(results),flush=True)


    if seat_fixed is not None:assert SHA(CAND/'npc_seated.glb')==seat_fixed=='a92cee73882b54df44a08d12bef55f0c462853ecaf5643961a32d39a3d7506c9'
    assert SHA(OUT/'blend/sento_npcs__v01.blend')==v01_blend_fixed=='f9a050d51e5fa90d9a2e7d93f8da48b6b885a6e60951cceec2028dae2b0db813'
    # Saved artifact audit: also executable independently after an existing build.
    import bpy, hashlib, json, struct, subprocess
    from pathlib import Path
    import numpy as np
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    ROOT=Path.cwd(); OUT=ROOT/'assets/sento_npcs'; CAND=ROOT/'.local/environment-refresh/npc'
    SHA=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
    report=json.loads((OUT/'quality/compact-v02/measurements.json').read_text())
    def geometry(o):
        return {'vertices':len(o.data.vertices),'faces':len(o.data.polygons),
          'positions':hashlib.sha256(np.array([v.co[:] for v in o.data.vertices],dtype='<f4').tobytes()).hexdigest(),
          'indices':hashlib.sha256(np.array([i for p in o.data.polygons for i in p.vertices],dtype='<u4').tobytes()).hexdigest()}
    def chunks(data):
        assert data[:8]==b'\x89PNG\r\n\x1a\n';offset=8;names=[]
        while offset<len(data):
          length=struct.unpack_from('>I',data,offset)[0];names.append(data[offset+4:offset+8].decode());offset+=12+length
        return names
    expected={'source_blend':'43418e26f3abe3951afa457d8c5daf5557fca6d9162815ab4cc150e211f9b78d','reference':'6ff06f0fde49a99e27edb785dd6318354954ee9567a299e0f29b4cb3ad19b1d0','raw':'2ceaee97c85f3e7e50c74b59c295f7b38a315678afc7961cefb3c2730da5d231'}
    for key,pathkey,hashkey in [('source_blend','source_blend','source_blend_sha256'),('reference','reference_file','reference_sha256'),('raw','raw_file','raw_sha256')]:
        assert SHA(ROOT/report[pathkey])==report[hashkey]==expected[key]
    blend=OUT/'blend/sento_npcs__compact_v02.blend';assert SHA(blend)==report['blend_sha256']
    bpy.ops.wm.open_mainfile(filepath=str(blend))
    assert geometry(bpy.data.objects['SOURCE_RAW_UNMODIFIED'])==report['raw_geometry_preserved']
    assert all(geometry(bpy.data.objects[n])==d for n,d in report['original_masters_unchanged'].items())
    packed=[{'name':im.name,'packed':bool(im.packed_file),'relative_path':not im.filepath or im.filepath.startswith('//'),'pixels_available':len(im.pixels)>0} for im in bpy.data.images if im.source in {'FILE','GENERATED'} and im.type=='IMAGE']
    assert all(im['packed'] and im['relative_path'] and im['pixels_available'] for im in packed)
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(ROOT/report['raw_file']))
    assert geometry(next(o for o in bpy.data.objects if o.type=='MESH'))==report['raw_geometry_preserved']
    rawblend=subprocess.run(['zstd','-d','--stdout',str(blend)],check=True,capture_output=True).stdout
    markers=[b'/'+name+b'/' for name in (b'Users',b'private',b'home')]+[b'.codex'+b'/',b'@'+b'gmail.com']
    private_count=sum(rawblend.count(marker) for marker in markers);assert private_count==0
    pngs={str(p.relative_to(OUT)):chunks(p.read_bytes()) for p in sorted((OUT/'quality/compact-v02').rglob('*.png'))}
    assert all(not set(v)&{'tEXt','zTXt','iTXt','eXIf'} for v in pngs.values())
    models={}
    for id,m in report['models'].items():
        path=CAND/(id+'.glb');assert SHA(path)==m['sha256'];data=path.read_bytes();length=struct.unpack_from('<I',data,12)[0];gltf=json.loads(data[20:20+length]);start=28+length
        assert all('uri' not in b for b in gltf.get('buffers',[]));assert all('uri' not in im for im in gltf.get('images',[]));assert not gltf.get('cameras');assert not gltf.get('extensions',{}).get('KHR_lights_punctual')
        image_chunks=[]
        for im in gltf.get('images',[]):
          view=gltf['bufferViews'][im['bufferView']];offset=start+view.get('byteOffset',0);c=chunks(data[offset:offset+view['byteLength']]);assert not set(c)&{'tEXt','zTXt','iTXt','eXIf'};image_chunks.append(c)
        models[id]={'sha256':SHA(path),'embedded_png_chunks':image_chunks,'embedded_buffers':True,'embedded_images':True,'no_cameras_or_lights':True,'root_node':id}
    audit={'blender':bpy.app.version_string,'blend_sha256':SHA(blend),'source_files_unchanged':True,'raw_geometry_matches_fresh_import':True,'original_master_geometry_preserved':True,'packed_images':packed,'metadata':{'private_markers_in_decompressed_blend':private_count,'inspection_png_count':len(pngs),'text_exif_chunks_found':0},'models':models,'scope':'Saved Blend and actual candidate GLBs only. No gameplay, publication or placed-scene footprint approval.'}
    (OUT/'quality/compact-v02/audit.json').write_text(json.dumps(audit,indent=2)+'\n')
    print('NPC_AUDIT_DONE',json.dumps(audit),flush=True)


    placement={'revision':'compact-v02','scope':'Model bounds preflight; independent quality acceptance and actual scene placement are separate.',
     'models':{id:{'sha256':m['sha256'],'height_m':m['dimensions_gltf_m'][1],'world_footprint_xz_m':[m['dimensions_gltf_m'][0],m['dimensions_gltf_m'][2]],'uniform_scene_scale':1,'root_min_y_m':m['bounds_blender_zup_m'][0][2],'required_footprint_xz_m':[.6,.45 if id=='npc_staff' else .4],'fits_required_footprint':m['dimensions_gltf_m'][0]<=.6 and m['dimensions_gltf_m'][2]<=(.45 if id=='npc_staff' else .4)} for id,m in report['models'].items()},
     'fixed_seated_sha256':'a92cee73882b54df44a08d12bef55f0c462853ecaf5643961a32d39a3d7506c9','collision_geometry_changed':False,'whole_model_nonuniform_scaling':False,
     'ground_contact_note':'Overall mesh minimum Y is zero. Independent inspection measured the other sole up to 0.172 mm (staff) / 1.631 mm (bath) above that plane; exact simultaneous contact of both soles is not claimed.'}
    (OUT/'quality/compact-v02/placement.json').write_text(json.dumps(placement,indent=2)+'\n')
    raise SystemExit(0)

"""Derive static sento NPCs from the actual Adult v02 source, without promotion.

Blender --background --python scripts/build-sento-npcs.py
Outputs editable source, candidate GLBs and reimported quality evidence.
"""
import bpy, bmesh, hashlib, json, math, runpy, struct, subprocess
from pathlib import Path
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT=Path.cwd(); OUT=ROOT/'assets/sento_npcs'; CAND=ROOT/'.local/environment-refresh/npc'
OUT.mkdir(parents=True,exist_ok=True); CAND.mkdir(parents=True,exist_ok=True)
(OUT/'blend').mkdir(exist_ok=True); (OUT/'quality').mkdir(exist_ok=True)
H=runpy.run_path(str(ROOT/'scripts/refine-human-models.py'),run_name='npc_source_helpers')
SOURCE=ROOT/'assets/adult/blend/adult__v02.blend'
RAW=ROOT/'assets/adult/gen/adult__meshy6lite_raw_v01.glb'
REF=ROOT/'assets/adult/ref/adult__ref_threequarter_v01.png'
BLEND=OUT/'blend/sento_npcs__v01.blend'
SHA=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
SM=H['smoothstep']; activate=H['activate']; strip_png=H['strip_png']
OFFSET=np.array([.014078214764595032,.001163199543952942,-.00022710429038852453])

def digest(o):
    return {'vertices':len(o.data.vertices),'faces':len(o.data.polygons),
      'positions':hashlib.sha256(np.array([v.co[:] for v in o.data.vertices],dtype='<f4').tobytes()).hexdigest(),
      'indices':hashlib.sha256(np.array([i for p in o.data.polygons for i in p.vertices],dtype='<u4').tobytes()).hexdigest()}

def transform(points,origin,target,oldvec,newvec):
    rotation=np.array(Vector(oldvec).rotation_difference(Vector(newvec)).to_matrix())
    scale=np.linalg.norm(newvec)/np.linalg.norm(oldvec)
    return ((points-origin) @ rotation.T)*scale+target

def arm_anchors(ref, sign):
    shoulder=np.array([sign*.17,-.012,1.20]); elbow=np.array([sign*.300,-.025,.99])
    hand=ref[(ref[:,0]*sign>.23*1.7)&(ref[:,2]<.48*1.7)].mean(0)
    shoulder2=shoulder.copy();shoulder2[0]*=1.68;shoulder2[2]-=.045;shoulder2[1]+=.10
    target=np.array([-.3077082633972168,-.2201717048883438,.8723217844963074]) if sign<0 else np.array([.32,-.065,.65])
    l1=np.linalg.norm(elbow-shoulder);l2=np.linalg.norm(hand-elbow)
    delta=target-shoulder2;distance=np.linalg.norm(delta);axis=delta/distance
    stretch=max(1,distance/(.999*(l1+l2)));l1*=stretch;l2*=stretch
    along=(l1*l1-l2*l2+distance*distance)/(2*distance);rise=math.sqrt(max(0,l1*l1-along*along))
    outward=elbow-shoulder;perp=outward-axis*np.dot(outward,axis);perp/=np.linalg.norm(perp)
    if sign<0:
      down=np.array([0.,0.,-1.]);down-=axis*np.dot(down,axis);down/=np.linalg.norm(down)
      perp=perp*.25+down*.75;perp/=np.linalg.norm(perp)
    elbow2=shoulder2+axis*along+perp*rise
    return shoulder,elbow,hand,shoulder2,elbow2,target

bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
original_raw=bpy.data.objects['SOURCE_RAW_UNMODIFIED']; raw_digest=digest(original_raw)
original_masters={n:digest(bpy.data.objects[n]) for n in ('MASTER_clothed_source_pose','MASTER_bath_featureless_toy')}
# Pose classification and bone lengths are taken from the dense source, shared by LODs.
source_ref=np.array([a.vector[:] for a in bpy.data.objects['MASTER_bath_featureless_toy'].data.attributes['reference_position'].data])
anchors={sign:arm_anchors(source_ref,sign) for sign in (-1,1)}


def seated_pose(obj):
    old=np.array([v.co[:] for v in obj.data.vertices]);ref=np.array([a.vector[:] for a in obj.data.attributes['reference_position'].data]);p=old.copy()
    hip=np.array([0.,.10,.80]);hip2=np.array([0.,.06,.51]);lean=np.array(Matrix.Rotation(math.radians(6),3,'X'))
    torso=((old-hip) @ lean.T)+hip2
    # Two continuous thigh/shin transforms; the original foot volume is retained.
    legs=old.copy()
    for sign in (-1,1):
      h=np.array([sign*.12,.10,.80]);k=np.array([sign*.145,.10,.44]);a=np.array([sign*.16,.06,.08])
      h2=np.array([sign*.13,.06,.51]);k2=np.array([sign*.15,-.32,.50]);a2=np.array([sign*.16,-.35,.08])
      upper=transform(old,h,h2,k-h,k2-h2);lower=transform(old,k,k2,a-k,a2-k2)
      weight=SM(.36,.52,old[:,2]);posed=upper*weight[:,None]+lower*(1-weight[:,None])
      mask=old[:,0]*sign>=0;legs[mask]=posed[mask]
    body_weight=SM(.73,.88,old[:,2]);p=legs*(1-body_weight[:,None])+torso*body_weight[:,None]
    # Pose arms from the retained source membership, excluding the head/legs.
    for sign in (-1,1):
      sr,er,hr,s,e,hand=anchors[sign]
      sn=lean @ (s-hip)+hip2
      en=np.array([sign*.305,-.075,.675]);hn=np.array([sign*.205,-.285,.60])
      upper=transform(old,s,sn,e-s,en-sn);lower=transform(old,e,en,hand-e,hn-en)
      along=np.sum((ref-er)*(hr-sr),axis=1)/np.linalg.norm(hr-sr)
      elbow_weight=SM(-.045*1.7,.045*1.7,along)
      arm=upper*(1-elbow_weight[:,None])+lower*elbow_weight[:,None]
      inner=.17-.035*1.7+.45*np.maximum(0,1.20-ref[:,2])
      member=SM(inner,inner+.025*1.7,ref[:,0]*sign)*(1-SM(1.20+.005*1.7,1.20+.07*1.7,ref[:,2]))*SM(.22*1.7,.32*1.7,ref[:,2])
      p=p*(1-member[:,None])+arm*member[:,None]
    for vertex,point in zip(obj.data.vertices,p):vertex.co=point
    obj.data.update()

results={}; runtime=[]; masters=[]
for id,outfit,budget in [('npc_staff','clothed',1200),('npc_seated','bath',1800),('npc_bath_standing','bath',1200)]:
    source=bpy.data.objects['MASTER_clothed_source_pose' if outfit=='clothed' else 'MASTER_bath_featureless_toy']
    high=source.copy();high.data=source.data.copy();bpy.context.collection.objects.link(high);high.name='DETAIL_'+id
    for vertex in high.data.vertices:vertex.co+=Vector(OFFSET)
    high.data.materials.clear();high.data.materials.append(H['color_material']('adult',outfit))
    # Reduce the already-corrected runtime surface while retaining its authored
    # face UV patch and original texture. A fresh coarse-face rebake produced
    # visible triangular color seams and was rejected.
    runtime_source=bpy.data.objects['outfit_'+outfit]
    low=runtime_source.copy();low.data=runtime_source.data.copy();bpy.context.collection.objects.link(low)
    for vertex in low.data.vertices:vertex.co+=Vector(OFFSET)
    activate(low)
    group=low.vertex_groups.new(name='NPC face-first allocation')
    for vertex in low.data.vertices:
      ref=low.data.attributes['reference_position'].data[vertex.index].vector
      weight=.035 if ref.z>1.30 else .68
      if ref.z>1.34 and ref.y<-.11:weight=0
      if .64<ref.z<.92:weight=.18
      if 1.08<ref.z<1.30 and abs(ref.x)>.14:weight=.035
      if .82<ref.z<1.08 and abs(ref.x)>.24:weight=.12
      if ref.z<.85 and abs(ref.x)>.34:weight=.08
      if ref.z<.10:weight=.40
      group.add([vertex.index],weight,'REPLACE')
    dec=low.modifiers.new('NPC source-derived LOD','DECIMATE');dec.ratio=(budget+4)/5800
    dec.vertex_group=group.name;dec.vertex_group_factor=.035;bpy.ops.object.modifier_apply(modifier=dec.name)
    low.data.calc_loop_triangles()
    if len(low.data.loop_triangles)>budget:
      dec=low.modifiers.new('NPC final budget trim','DECIMATE');dec.ratio=budget/len(low.data.loop_triangles);bpy.ops.object.modifier_apply(modifier=dec.name)
    # Collapse creates new points inside curved shoulders. Reproject those
    # points to the detailed inherited surface before applying the seat pose.
    surface=BVHTree.FromPolygons([v.co for v in high.data.vertices],[p.vertices[:] for p in high.data.polygons],all_triangles=True)
    for vertex in low.data.vertices:
      nearest=surface.find_nearest(vertex.co)[0]
      if nearest is not None:vertex.co=nearest
    low.data.update()
    material=low.data.materials[0].copy();low.data.materials.clear();low.data.materials.append(material)
    material.name=id+'_satin_toy';texture=next(n for n in material.node_tree.nodes if n.type=='TEX_IMAGE')
    image=texture.image.copy();image.name=id+'_basecolor_v01';image.scale(512,512);image.pack();texture.image=image
    low.name=id+'_body';low.data.name=id+'_mesh'
    if id=='npc_seated':
      seated_pose(high);seated_pose(low)
    # Correct origin once, using the real low mesh. No anisotropic box scaling.
    points=np.array([v.co[:] for v in low.data.vertices]);lo=points.min(0);hi=points.max(0)
    offset=Vector(((lo[0]+hi[0])/2,(lo[1]+hi[1])/2,lo[2]))
    for obj in (low,high):
      for vertex in obj.data.vertices:vertex.co-=offset
      obj.data.update()
    activate(low)
    # Transforming vertices invalidates the standing normals; transfer from the posed master.
    low.data.normals_split_custom_set([(0,0,0)]*len(low.data.loops))
    normal=low.modifiers.new('Posed source normals','DATA_TRANSFER');normal.object=high;normal.use_loop_data=True;normal.data_types_loops={'CUSTOM_NORMAL'};normal.loop_mapping='POLYINTERP_NEAREST';bpy.ops.object.modifier_apply(modifier=normal.name)
    root=bpy.data.objects.new(id,None);bpy.context.collection.objects.link(root)
    root['asset_id']=id;root['parent_asset']='adult';root['license']='CC-BY-4.0';root['source_file']='assets/adult/blend/adult__v02.blend'
    root['modifications']='Source-derived static NPC reduction with protected face and baked palette'+('; seated leg and arm pose' if id=='npc_seated' else '')
    low.parent=root
    if id=='npc_seated':
      seat=bpy.data.objects.new('seat_anchor',None);bpy.context.collection.objects.link(seat);seat.parent=root;seat.location=(0,.18,.45)
      seat['role']='seat surface center';seat['seat_height_m']=.45
    low['parent_asset']='adult';low['license']='CC-BY-4.0';low['role']=id
    high.hide_render=True;high.hide_set(True);runtime.append((id,root,low));masters.append(high)
    low.data.calc_loop_triangles()
    results[id]={'triangle_budget':budget,'triangles_before_export':len(low.data.loop_triangles),'texture_px':512,
      'origin_offset_blender_xyz':list(offset),'parent_asset':'adult','head_triangles':sum(all(low.data.attributes['reference_position'].data[i].vector.z>1.25 for i in p.vertices) for p in low.data.polygons)}
    assert results[id]['triangles_before_export']<=budget
    assert results[id]['head_triangles']>=250,(id,'face reduction lost detail',results[id])

assert digest(original_raw)==raw_digest
assert all(digest(bpy.data.objects[n])==d for n,d in original_masters.items())
for obj in bpy.data.objects:
    obj.hide_render=True;obj.hide_set(True)
for _,root,low in runtime:
    root.hide_set(False);low.hide_set(False);low.hide_render=False
for image in bpy.data.images:
    if image.packed_file:
      image.filepath='//'+'x'*1000;image.filepath='//'+image.name+'.png'
      for packed in image.packed_files:packed.filepath='//'+'x'*1000;packed.filepath='//'+image.name+'.png'
for screen in bpy.data.screens:
    for area in screen.areas:
      for space in area.spaces:
        if space.type=='FILE_BROWSER' and space.params:
          space.params.directory=b'/'*1023;space.params.directory=b'//'
bpy.context.scene.render.filepath='//';bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND),compress=True)
for id,root,low in runtime:
    bpy.ops.object.select_all(action='DESELECT');root.hide_set(False);low.hide_set(False);root.select_set(True);low.select_set(True)
    for child in root.children:
      child.hide_set(False);child.select_set(True)
    path=CAND/(id+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_copyright='Meshy 6 Lite derived model, CC BY 4.0; Blender modifications by Sento Duck Explorer')
    H['SANITIZE_GLB'](path)
    results[id].update(sha256=SHA(path),bytes=path.stat().st_size)

# Actual export/reimport is authoritative for quality images and measurements.
for id in results:
    bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(CAND/(id+'.glb')))
    meshes=[o for o in bpy.data.objects if o.type=='MESH'];points=np.array([o.matrix_world @ v.co for o in meshes for v in o.data.vertices]);lo=points.min(0);hi=points.max(0)
    nonmanifold=degenerate=triangles=0
    for obj in meshes:
      bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7)
      nonmanifold+=sum(not e.is_manifold for e in bm.edges);degenerate+=sum(f.calc_area()<1e-14 for f in bm.faces);bm.free()
      obj.data.calc_loop_triangles();triangles+=len(obj.data.loop_triangles)
    assert np.isfinite(points).all() and nonmanifold==0 and degenerate==0
    results[id].update(triangles=triangles,dimensions_gltf_m=[float(hi[0]-lo[0]),float(hi[2]-lo[2]),float(hi[1]-lo[1])],
      bounds_blender_zup_m=[lo.tolist(),hi.tolist()],nonmanifold_after_uv_weld=nonmanifold,degenerate_faces=degenerate,finite_vertices=True,
      materials=len({m for o in meshes for m in o.data.materials}),textures=len([im for im in bpy.data.images if im.type=='IMAGE']))
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
    scene.render.resolution_x=scene.render.resolution_y=640;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
    scene.world=bpy.data.worlds.new('Neutral inspection world');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.09,.09,.09,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.55
    height=float(hi[2]-lo[2]);target=Vector((0,0,height*.50))
    for position,power,size in [((1.7,-2.6,3),350,2.4),((-2,-1.4,1.3),150,2.5),((.5,2,2.3),200,1.8)]:
      bpy.ops.object.light_add(type='AREA',location=Vector(position)*height);light=bpy.context.object;light.data.energy=power*height*height;light.data.size=size*height;light.rotation_euler=(target-light.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=height*1.2;scene.camera=cam
    quality=OUT/'quality'/id;quality.mkdir(exist_ok=True)
    for name,direction in [('front',(0,-1,.06)),('threequarter',(.6,-1,.2)),('side',(1,0,.05)),('back',(0,1,.08))]:
      cam.location=target+Vector(direction).normalized()*height*4;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(quality/(name+'.png'));bpy.ops.render.render(write_still=True);strip_png(Path(scene.render.filepath))
    if id=='npc_seated':
      anchor=bpy.data.objects['seat_anchor'];assert abs(anchor.matrix_world.translation.z-.45)<1e-6
      results[id]['seat_anchor_gltf_m']=[float(anchor.location.x),float(anchor.location.z),float(-anchor.location.y)]
      bpy.ops.mesh.primitive_cube_add(size=1,location=(0,.18,.40));bench=bpy.context.object;bench.name='INSPECTION_ONLY_seat';bench.dimensions=(.64,.36,.10)
      material=bpy.data.materials.new('Inspection bench');material.diffuse_color=(.22,.13,.065,1);bench.data.materials.append(material)
      cam.location=target+Vector((1,-.7,.12)).normalized()*height*4;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(quality/'seat-contact.png');bpy.ops.render.render(write_still=True);strip_png(Path(scene.render.filepath));bpy.data.objects.remove(bench,do_unlink=True)
    # Dedicated face evidence prevents a small body image from masking lost facial detail.
    target=Vector((0,0,hi[2]-.21));cam.location=target+Vector((0,-1,0))*height*4;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=.52;scene.render.filepath=str(quality/'face.png');bpy.ops.render.render(write_still=True);strip_png(Path(scene.render.filepath))

report={'parent_asset':'adult','source_blend':'assets/adult/blend/adult__v02.blend','source_blend_sha256':SHA(SOURCE),'reference_file':'assets/adult/ref/adult__ref_threequarter_v01.png','reference_sha256':SHA(REF),'raw_file':'assets/adult/gen/adult__meshy6lite_raw_v01.glb','raw_sha256':SHA(RAW),'raw_geometry_preserved':raw_digest,'original_masters_unchanged':original_masters,'blend_sha256':SHA(BLEND),'models':results,'scope':'Static source-derived NPCs; no skeleton, animation, gameplay or publication.'}
(OUT/'quality/measurements.json').write_text(json.dumps(report,indent=2)+'\n')
print('NPC_DONE',json.dumps(results),flush=True)

# Fixed-material diagnostic separates pose shape from LOD silhouette loss.
import bpy, math
from pathlib import Path
from mathutils import Vector
import runpy
ROOT=Path.cwd();out=ROOT/'assets/sento_npcs/quality/master-comparison';out.mkdir(exist_ok=True)
H=runpy.run_path(str(ROOT/'scripts/refine-human-models.py'),run_name='npc_inspection')
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/sento_npcs/blend/sento_npcs__v01.blend'))
for o in bpy.data.objects:o.hide_set(True);o.hide_render=True
mat=bpy.data.materials.new('Neutral shape comparison');mat.use_nodes=True;mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.5,.5,.5,1);mat.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.65
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True;scene.render.resolution_x=scene.render.resolution_y=640;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
scene.world=bpy.data.worlds.new('Neutral world');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.3
center=Vector((0,0,.74))
for pos,power,size in [((2,-3,4),500,3),((-2,-2,2),180,3),((1,2,3),250,2)]:
 bpy.ops.object.light_add(type='AREA',location=pos);o=bpy.context.object;o.data.energy=power;o.data.size=size;o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=1.8;scene.camera=cam
for objname,label in [('DETAIL_npc_seated','high'),('npc_seated_body','low')]:
 o=bpy.data.objects[objname];o.hide_set(False);o.hide_render=False;o.data.materials.clear();o.data.materials.append(mat)
 for view,d in [('front',(0,-1,.05)),('threequarter',(.6,-1,.1))]:
  cam.location=center+Vector(d)*5;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(out/(label+'-'+view+'.png'));bpy.ops.render.render(write_still=True);H['strip_png'](Path(scene.render.filepath))
 o.hide_render=True;o.hide_set(True)

# Saved artifact audit: also executable independently after an existing build.
import bpy, hashlib, json, struct, subprocess
from pathlib import Path
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path.cwd(); OUT=ROOT/'assets/sento_npcs'; CAND=ROOT/'.local/environment-refresh/npc'
SHA=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
report=json.loads((OUT/'quality/measurements.json').read_text())
def geometry(o):
    return {'vertices':len(o.data.vertices),'faces':len(o.data.polygons),
      'positions':hashlib.sha256(np.array([v.co[:] for v in o.data.vertices],dtype='<f4').tobytes()).hexdigest(),
      'indices':hashlib.sha256(np.array([i for p in o.data.polygons for i in p.vertices],dtype='<u4').tobytes()).hexdigest()}
def chunks(data):
    assert data[:8]==b'\x89PNG\r\n\x1a\n';offset=8;names=[]
    while offset<len(data):
      length=struct.unpack_from('>I',data,offset)[0];names.append(data[offset+4:offset+8].decode());offset+=12+length
    return names
expected={'source_blend':'43418e26f3abe3951afa457d8c5daf5557fca6d9162815ab4cc150e211f9b78d','reference':'6ff06f0fde49a99e27edb785dd6318354954ee9567a299e0f29b4cb3ad19b1d0','raw':'2ceaee97c85f3e7e50c74b59c295f7b38a315678afc7961cefb3c2730da5d231'}
for key,pathkey,hashkey in [('source_blend','source_blend','source_blend_sha256'),('reference','reference_file','reference_sha256'),('raw','raw_file','raw_sha256')]:
    assert SHA(ROOT/report[pathkey])==report[hashkey]==expected[key]
blend=OUT/'blend/sento_npcs__v01.blend';assert SHA(blend)==report['blend_sha256']
bpy.ops.wm.open_mainfile(filepath=str(blend))
assert geometry(bpy.data.objects['SOURCE_RAW_UNMODIFIED'])==report['raw_geometry_preserved']
assert all(geometry(bpy.data.objects[n])==d for n,d in report['original_masters_unchanged'].items())
packed=[{'name':im.name,'packed':bool(im.packed_file),'relative_path':not im.filepath or im.filepath.startswith('//'),'pixels_available':len(im.pixels)>0} for im in bpy.data.images if im.source in {'FILE','GENERATED'} and im.type=='IMAGE']
assert all(im['packed'] and im['relative_path'] and im['pixels_available'] for im in packed)
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(ROOT/report['raw_file']))
assert geometry(next(o for o in bpy.data.objects if o.type=='MESH'))==report['raw_geometry_preserved']
rawblend=subprocess.run(['zstd','-d','--stdout',str(blend)],check=True,capture_output=True).stdout
markers=[b'/'+name+b'/' for name in (b'Users',b'private',b'home')]+[b'.codex'+b'/',b'@'+b'gmail.com']
private_count=sum(rawblend.count(marker) for marker in markers);assert private_count==0
pngs={str(p.relative_to(OUT)):chunks(p.read_bytes()) for p in sorted((OUT/'quality').rglob('*.png'))}
assert all(not set(v)&{'tEXt','zTXt','iTXt','eXIf'} for v in pngs.values())
models={}
for id,m in report['models'].items():
    path=CAND/(id+'.glb');assert SHA(path)==m['sha256'];data=path.read_bytes();length=struct.unpack_from('<I',data,12)[0];gltf=json.loads(data[20:20+length]);start=28+length
    assert all('uri' not in b for b in gltf.get('buffers',[]));assert all('uri' not in im for im in gltf.get('images',[]));assert not gltf.get('cameras');assert not gltf.get('extensions',{}).get('KHR_lights_punctual')
    image_chunks=[]
    for im in gltf.get('images',[]):
      view=gltf['bufferViews'][im['bufferView']];offset=start+view.get('byteOffset',0);c=chunks(data[offset:offset+view['byteLength']]);assert not set(c)&{'tEXt','zTXt','iTXt','eXIf'};image_chunks.append(c)
    models[id]={'sha256':SHA(path),'embedded_png_chunks':image_chunks,'embedded_buffers':True,'embedded_images':True,'no_cameras_or_lights':True,'root_node':id}
    if id=='npc_seated':
      bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(path));obj=next(o for o in bpy.data.objects if o.type=='MESH');tree=BVHTree.FromObject(obj,bpy.context.evaluated_depsgraph_get())
      contacts=[]
      for x in (-.15,0,.15):
        hit=tree.ray_cast(Vector((x,.15,.2)),Vector((0,0,1)),.5)[0]
        assert hit is not None;contacts.append({'x_m':x,'z_gltf_m':-.15,'surface_y_m':hit.z,'height_from_seat_m':hit.z-.45})
      models[id]['seat_underside_rays']=contacts
      models[id]['footprint_fit']={'standard_band_width_m':.6,'model_width_m':m['dimensions_gltf_m'][0],'short_band_depth_m':.4,'model_depth_m':m['dimensions_gltf_m'][2],'fits_short_band_at_unit_scale':False,'integration_status':'Placement/compact variant required; no anisotropic scaling or collision edit has been applied.'}
audit={'blender':bpy.app.version_string,'blend_sha256':SHA(blend),'source_files_unchanged':True,'raw_geometry_matches_fresh_import':True,'original_master_geometry_preserved':True,'packed_images':packed,'metadata':{'private_markers_in_decompressed_blend':private_count,'inspection_png_count':len(pngs),'text_exif_chunks_found':0},'models':models,'scope':'Saved Blend and actual candidate GLBs only. No gameplay, publication or placed-scene footprint approval.'}
(OUT/'quality/audit.json').write_text(json.dumps(audit,indent=2)+'\n')
print('NPC_AUDIT_DONE',json.dumps(audit),flush=True)

# Placement preflight is explicit about unresolved scenery integration.
seat=report['models']['npc_seated'];staff=report['models']['npc_staff'];standing=report['models']['npc_bath_standing']
seat_scale=.90;staff_scale=1.6/staff['dimensions_gltf_m'][1]
placement={'scope':'AABB preflight only; actual scene placement and material QA remain independent.',
 'npc_seated':{'sha256':seat['sha256'],'candidate_status':'independent quality review pending','uniform_scale':seat_scale,'yaw_degrees':90,'scaled_world_footprint_xz_m':[seat['dimensions_gltf_m'][2]*seat_scale,seat['dimensions_gltf_m'][0]*seat_scale],'feet_y_m':0,'bench_surface_y_m':.45*seat_scale,'normal_band_width_m':.6,'normal_band_lengths_m':[1.5,1.7,2.8,2.5,.7],'fits_normal_bands_centered':seat['dimensions_gltf_m'][2]*seat_scale<=.6 and seat['dimensions_gltf_m'][0]*seat_scale<=.7,'preserves_existing_gaps_when_centered':True,'short_band_fit':False},
 'npc_staff':{'sha256':staff['sha256'],'natural_placement_height_m':1.6,'uniform_scale_for_height':staff_scale,'scaled_footprint_xz_m':[staff['dimensions_gltf_m'][0]*staff_scale,staff['dimensions_gltf_m'][2]*staff_scale],'old_fixture_footprint_xz_m':[.6,.45],'fits_old_fixture_box':False,'status':'Counter clearance and visible arm overhang require scene review.'},
 'short_band':{'footprint_xz_m':[.6,.4],'candidate_sha256':standing['sha256'],'candidate_status':'unaccepted','reason':'Standing source pose exceeds footprint at natural Adult stature. Shrinking to Child-like height was rejected. A compact natural arms-down derivative remains required.','collider_changed':False,'nonuniform_scale_applied':False}}
(OUT/'quality/placement.json').write_text(json.dumps(placement,indent=2)+'\n')
