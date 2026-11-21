"""Refine existing source-derived Duck/hat; export review candidates, never public files.

Blender --background --python scripts/refine-duck-hat.py -- --asset duck|hat|all
Keeps the received Meshy meshes and older revisions unchanged. New editable
masters, reimported views and measurements document each local correction.
"""
import argparse, hashlib, json, math, struct, sys, subprocess
from pathlib import Path
import bpy, bmesh, numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

P=argparse.ArgumentParser();P.add_argument('--asset',choices=['duck','hat','all','verify','sanitize'],default='all')
P.add_argument('--felt',action='store_true',help='Bake subtle source-profile felt normal to a 512px image')
args=P.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
R=Path.cwd();CAND=R/'.local/existing-model-quality/candidates';CAND.mkdir(parents=True,exist_ok=True)

def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def active(o):
 bpy.ops.object.select_all(action='DESELECT');o.hide_set(False);o.select_set(True);bpy.context.view_layer.objects.active=o

def hidden(o):o.hide_render=True;o.hide_set(True)
def clear_scene():bpy.ops.wm.read_factory_settings(use_empty=True)
def imp(path):
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path));return [o for o in bpy.data.objects if o not in before]
def bounds(o):
 p=[o.matrix_world @ v.co for v in o.data.vertices];return Vector([min(v[i] for v in p) for i in range(3)]),Vector([max(v[i] for v in p) for i in range(3)])
def smoothstep(a,b,t):
 t=max(0,min(1,(t-a)/(b-a)));return t*t*(3-2*t)
def strip_png(p):
 data=p.read_bytes();out=bytearray(data[:8]);i=8
 while i<len(data):
  n=struct.unpack_from('>I',data,i)[0];end=i+n+12
  if data[i+4:i+8] not in (b'tEXt',b'zTXt',b'iTXt',b'eXIf'):out+=data[i:end]
  i=end
 p.write_bytes(out)
def rgbmat(name,color,rough):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;return m

def meshfacts(o):
 o.data.calc_loop_triangles();lo,hi=bounds(o);bm=bmesh.new();bm.from_mesh(o.data)
 d={'triangles':len(o.data.loop_triangles),'vertices':len(o.data.vertices),'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),'bounds_blender_zup_m':[list(lo),list(hi)],'dimensions_gltf_m':[hi.x-lo.x,hi.z-lo.z,hi.y-lo.y],'finite_vertices':all(math.isfinite(x) for v in o.data.vertices for x in v.co)};bm.free();return d

def transfer_normals(low,high):
 active(low)
 for p in low.data.polygons:p.use_smooth=True
 m=low.modifiers.new('Normals from clean detailed master','DATA_TRANSFER');m.object=high;m.use_loop_data=True;m.data_types_loops={'CUSTOM_NORMAL'};m.loop_mapping='POLYINTERP_NEAREST';bpy.ops.object.modifier_apply(modifier=m.name)

def reduce(high,target):
 low=high.copy();low.data=high.data.copy();bpy.context.collection.objects.link(low);low.name='runtime';active(low)
 low.data.calc_loop_triangles();mod=low.modifiers.new('Runtime allocation after local surface repair','DECIMATE');mod.ratio=target/len(low.data.loop_triangles);mod.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=mod.name)
 transfer_normals(low,high);return low

def clean_image_paths(path):
 for im in bpy.data.images:
  if not im.packed_file:continue
  rel=bpy.path.relpath(im.filepath,start=str(path.parent)) if im.filepath and Path(im.filepath).is_absolute() else im.filepath
  im.filepath='//'+'x'*1000;im.filepath=rel
  for packed in im.packed_files:
   packed.filepath='//'+'x'*1000;packed.filepath=rel

def save_scene(path,source,high,objects):
 hidden(source);hidden(high)
 for o in objects:o.hide_render=False;o.hide_set(False)
 bpy.context.scene.render.filepath='//'
 for s in bpy.data.screens:
  for a in s.areas:
   for sp in a.spaces:
    if sp.type=='FILE_BROWSER' and sp.params is not None:sp.params.directory=b'/'*1023;sp.params.directory=b'//'
 clean_image_paths(path)
 bpy.ops.wm.save_as_mainfile(filepath=str(path),compress=True)

def export(path,objects):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.hide_set(False);o.select_set(True)
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_copyright='Meshy 6 Lite output, CC BY 4.0; Blender modifications by Sento Duck Explorer')

def render_views(id,path,out,revision):
 clear_scene();objs=imp(path);meshes=[o for o in objs if o.type=='MESH'];sc=bpy.context.scene
 sc.render.engine='CYCLES';sc.cycles.samples=24;sc.cycles.use_denoising=True;sc.render.resolution_x=sc.render.resolution_y=640;sc.render.resolution_percentage=100;sc.render.image_settings.file_format='PNG';sc.view_settings.view_transform='AgX'
 w=bpy.data.worlds.new('Fixed neutral world');w.use_nodes=True;w.node_tree.nodes['Background'].inputs[0].default_value=(.095,.095,.095,1);w.node_tree.nodes['Background'].inputs[1].default_value=.45;sc.world=w
 target=Vector((0,-.01,.16) if id=='duck' else (0,0,.075));span=.32 if id=='duck' else .2
 for pos,power,size in [((1.8,-2.6,3),300,2.1),((-2.5,-1,1.6),110,2.2),((.5,2.2,2.4),220,1.5)]:
  bpy.ops.object.light_add(type='AREA',location=target+Vector(pos)*span);l=bpy.context.object;l.data.energy=power*span*span;l.data.size=size*span;l.rotation_euler=(target-l.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=span*1.4;sc.camera=cam
 for view,d in [('front',(0,-1,.12)),('threequarter',(.7,-1,.3)),('side',(1,0,.12)),('back',(0,1,.2)),('underside',(.4,-1,-.65))]:
  cam.location=target+Vector(d).normalized()*2;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();sc.render.filepath=str(out/f'{view}.png');bpy.ops.render.render(write_still=True);strip_png(Path(sc.render.filepath))
 if id=='duck':
  target=Vector((0,-.055,.236));cam.data.ortho_scale=.17;cam.location=target+Vector((.2,-1,.1))*2;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();sc.render.filepath=str(out/'face.png');bpy.ops.render.render(write_still=True);strip_png(Path(sc.render.filepath))
 return meshes

def duck():
 id='duck';out=R/'assets/duck/quality/existing-review';out.mkdir(parents=True,exist_ok=True);clear_scene()
 old=imp(R/'assets/duck/blend/duck__v01.glb');old_bounds=[list(v) for v in bounds(max((o for o in old if o.type=='MESH'),key=lambda o:len(o.data.vertices)))];sockets={o.name:o.matrix_world.copy() for o in old if o.name.startswith('socket_')};clear_scene()
 rawpath=R/'assets/duck/gen/duck__meshy6lite_raw_v01.glb';raw=next(o for o in imp(rawpath) if o.type=='MESH');raw.name='SOURCE_RAW_UNMODIFIED';raw['source_file']='assets/duck/gen/duck__meshy6lite_raw_v01.glb';raw['source_sha256']=sha(rawpath)
 high=raw.copy();high.data=raw.data.copy();bpy.context.collection.objects.link(high);high.name='MASTER_SOURCE_DERIVED';hidden(raw);active(high);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
 lo,hi=bounds(high);origin=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z));scale=.3/(hi.z-lo.z)
 for v in high.data.vertices:v.co=(v.co-origin)*scale
 original=np.array([v.co[:] for v in high.data.vertices]);sel=original[(original[:,2]>.185)&(original[:,1]>-.10)&(original[:,1]<.025)];x,y,z=sel.T;A=np.column_stack([x*x,y*y,z*z,y,z]);q=np.linalg.lstsq(A,np.ones(len(sel)),rcond=None)[0];center=np.array([0,-q[3]/(2*q[1]),-q[4]/(2*q[2])]);rhs=1+q[1]*center[1]**2+q[2]*center[2]**2;radii=np.sqrt(rhs/q[:3])
 assert np.isfinite(radii).all() and (radii>.05).all() and (radii<.09).all()
 beakweights=[]
 for v in high.data.vertices:
  p=np.array(v.co[:]);x,y,z=p;term=1-(x/radii[0])**2-((z-center[2])/radii[2])**2;front=center[1]-radii[1]*math.sqrt(max(term,0));excess=front-y;zmax=.242-.032*(abs(x)/.05)**1.2
  beak=smoothstep(.0015,.004,excess)*(1-smoothstep(zmax-.001,zmax+.001,z))*smoothstep(.193,.197,z) if abs(x)<.055 and y<-.105 else 0
  beakweights.append(beak)
  geometry_beak=smoothstep(-.111,-.120,y)*smoothstep(.190,.200,z)*(1-smoothstep(.237,.241,z)) if abs(x)<.055 else 0
  w=smoothstep(.165,.191,z)*(1-smoothstep(.018,.035,y))*(1-geometry_beak)
  if w>0:
   direction=p-center;length=np.linalg.norm(direction/radii)
   if length>0:projected=center+direction/length;v.co=Vector(p*(1-w)+projected*w)
 high.data.update()
 # Clean only the retained beak's tiny reconstruction ripples, not the body.
 vg=high.vertex_groups.new(name='Local beak fairing')
 for i,w in enumerate(beakweights):
  if w:vg.add([i],w,'REPLACE')
 active(high);smooth=high.modifiers.new('Local beak surface fairing','SMOOTH');smooth.vertex_group=vg.name;smooth.factor=.35;smooth.iterations=4;bpy.ops.object.modifier_apply(modifier=smooth.name)
 # Remove received reconstruction ribs only from the central chest/belly.
 chest=high.vertex_groups.new(name='Torso reconstruction artifact fairing with protected feathers')
 for v in high.data.vertices:
  x,y,z=v.co;wing=smoothstep(.048,.060,abs(x))*smoothstep(.065,.085,z)*(1-smoothstep(.151,.179,z))*(1-smoothstep(.090,.125,y));tail=smoothstep(.055,.095,y)*smoothstep(.11,.145,z)*(1-smoothstep(.018,.035,abs(x)));w=smoothstep(.042,.062,z)*(1-smoothstep(.161,.181,z))*(1-wing)*(1-tail)
  if w:chest.add([v.index],w,'REPLACE')
 active(high);fair=high.modifiers.new('Localized chest belly and tailroot fairing','SMOOTH');fair.vertex_group=chest.name;fair.factor=.65;fair.iterations=360;bpy.ops.object.modifier_apply(modifier=fair.name)
 for p in high.data.polygons:p.use_smooth=True
 high.data.normals_split_custom_set([(0,0,0)]*len(high.data.loops))
 colors=high.data.color_attributes.new(name='Source-painted clean palette',type='FLOAT_COLOR',domain='POINT')
 yellow=np.array([1,.55,.004]);orange=np.array([1,.205,.008])
 for v in high.data.vertices:
  x,y,z=v.co;term=1-(x/radii[0])**2-((z-center[2])/radii[2])**2;front=center[1]-radii[1]*math.sqrt(max(term,0));excess=front-y;zmax=.242-.032*(abs(x)/.05)**1.2
  w=smoothstep(.0005,.0018,excess)*(1-smoothstep(zmax-.001,zmax+.001,z))*smoothstep(.192,.197,z) if abs(x)<.055 and y<-.105 else 0
  foot=1-smoothstep(.031,.035,v.co.z);t=max(w,foot);color=yellow*(1-t)+orange*t;colors.data[v.index].color=(*color,1)
 bake_mat=bpy.data.materials.new('Master emission palette');bake_mat.use_nodes=True;n=bake_mat.node_tree.nodes;n.clear();attr=n.new('ShaderNodeVertexColor');attr.layer_name=colors.name;em=n.new('ShaderNodeEmission');outnode=n.new('ShaderNodeOutputMaterial');bake_mat.node_tree.links.new(attr.outputs['Color'],em.inputs['Color']);bake_mat.node_tree.links.new(em.outputs[0],outnode.inputs['Surface']);high.data.materials.clear();high.data.materials.append(bake_mat)
 low=reduce(high,6400)
 low.name='duck_body'
 for v in low.data.vertices:
  if v.co.z<0:v.co.z=0
 active(low)
 for a in list(low.data.color_attributes):low.data.color_attributes.remove(a)
 for uv in list(low.data.uv_layers):low.data.uv_layers.remove(uv)
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.012);bpy.ops.object.mode_set(mode='OBJECT')
 img=bpy.data.images.new('Duck v03 clean body palette',width=1024,height=1024,alpha=False);img.colorspace_settings.name='sRGB'
 bodymat=rgbmat('Duck warm yellow and orange body',(1,.55,.004),.5);node=bodymat.node_tree.nodes.new('ShaderNodeTexImage');node.image=img;bodymat.node_tree.nodes.active=node;bodymat.node_tree.links.new(node.outputs['Color'],bodymat.node_tree.nodes['Principled BSDF'].inputs['Base Color']);low.data.materials.clear();low.data.materials.append(bodymat)
 active(low);high.hide_set(False);high.select_set(True);bpy.context.view_layer.objects.active=low;sc=bpy.context.scene;sc.render.engine='CYCLES';sc.cycles.samples=1;sc.render.bake.use_selected_to_active=True;sc.render.bake.cage_extrusion=.004;sc.render.bake.max_ray_distance=.01;sc.render.bake.margin=16;bpy.ops.object.bake(type='EMIT');img.filepath_raw=str(out/'body_basecolor.png');img.file_format='PNG';img.save();strip_png(out/'body_basecolor.png');img.pack();hidden(high)
 # Retain the fitted master with its display material as well as baked low.
 high.data.materials.clear();display=rgbmat('Master body palette',(1,.55,.004),.5);vc=display.node_tree.nodes.new('ShaderNodeVertexColor');vc.layer_name=colors.name;display.node_tree.links.new(vc.outputs['Color'],display.node_tree.nodes['Principled BSDF'].inputs['Base Color']);high.data.materials.append(display)
 eyemat=rgbmat('Dark brown glossy eyes',(.032,.014,.006),.16);eyes=[];eye_measures=[]
 high.data.update();bpy.context.view_layer.update();tree=BVHTree.FromObject(high,bpy.context.evaluated_depsgraph_get())
 for side in (-1,1):
  x=side*.041;z=.238;p,n,_,_=tree.ray_cast(Vector((x,-.25,z)),Vector((0,1,0)),.3);assert p is not None
  outward=Vector((side*.38,-.924986,0)).normalized();tangent=Vector((-outward.y,outward.x,0));c=p-outward*.0011;basis=Matrix((tangent,-outward,Vector((0,0,1)))).transposed()
  bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=8,radius=1);eye=bpy.context.object
  for v in eye.data.vertices:v.co=c+basis@Vector((v.co.x*.0100,v.co.z*.0038,v.co.y*.014))
  eye.data.materials.append(eyemat)
  for poly in eye.data.polygons:poly.use_smooth=True
  eyes.append(eye);eye_measures.append({'side':side,'center_blender_m':list(c),'radii_m':[.010,.0038,.014]})
 active(eyes[0]);eyes[1].select_set(True);bpy.ops.object.join();eye=eyes[0];eye.name='duck_eyes'
 root=bpy.data.objects.new('duck',None);bpy.context.collection.objects.link(root);low.parent=root;eye.parent=root;exports=[root,low,eye]
 for name,mat in sockets.items():o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.matrix_world=mat;o.parent=root;exports.append(o)
 low['source_file']='assets/duck/gen/duck__meshy6lite_raw_v01.glb';low['modifications']='Source-derived geometry; measured symmetric head quadric; local beak and masked torso artifact fairing; uniform runtime reduction; source-painted UV bake; matched glossy eye inserts';low['asset_license']='CC-BY-4.0'
 facts={'source_sha256':sha(rawpath),'revision':'v03','head_fit_center_blender_m':center.tolist(),'head_fit_radii_m':radii.tolist(),'head_fit_source_samples':len(sel),'head_fit_limitation':'Measured quadric regularizes source head; not an exact reference-image reconstruction','eye_regions':eye_measures,'runtime_body_before_export':meshfacts(low),'runtime_eyes_before_export':meshfacts(eye),'source_scale':scale,'source_mapping':{'raw_bounds_blender_m':[list(lo),list(hi)],'original_runtime_bounds_blender_m':old_bounds,'method':'Uniform source height normalization to 0.300m and original bottom-center convention; corrected bounds measured separately; exact socket matrices retained.'}}
 blend=R/'assets/duck/blend/duck__v03.blend';save_scene(blend,raw,high,exports);path=CAND/'duck.glb';export(path,exports);facts.update(glb_sha256=sha(path),glb_bytes=path.stat().st_size,blend_sha256=sha(blend));meshes=render_views('duck',path,out,'v03');facts['reimported_meshes']={o.name:meshfacts(o) for o in meshes};facts['triangles']=sum(meshfacts(o)['triangles'] for o in meshes);facts['material_count']=2;facts['texture_count']=1;(out/'measurements.json').write_text(json.dumps(facts,indent=2)+'\n');print('DUCK_DONE',json.dumps({k:facts[k] for k in ('triangles','glb_sha256','glb_bytes')}),flush=True)

def source_profile_retopology(high, material):
 # Cross sections are ray measured from the received Meshy mesh. Retopology
 # regularizes radial noise, retaining its bell proportions and hollow wall.
 high.data.update();bpy.context.view_layer.update();tree=BVHTree.FromObject(high,bpy.context.evaluated_depsgraph_get())
 def radius(z,inside=False):
  radii=[]
  for k in range(64):
   d=Vector((math.cos(2*math.pi*k/64),math.sin(2*math.pi*k/64),0))
   start=Vector((0,0,z)) if inside else Vector((0,0,z))+d*.2
   hit,_,_,_=tree.ray_cast(start,d if inside else -d,.3)
   if hit is not None:radii.append(math.hypot(hit.x,hit.y))
  assert len(radii)>24,(z,inside,len(radii))
  return float(np.median(radii))
 oz=[.1245,.122,.116,.112,.108,.102,.096,.080,.060,.040,.023,.012,.006]
 iz=[.006,.020,.042,.065,.085,.101,.111]
 outer=[(radius(z),z) for z in oz];inner=[(radius(z,True),z) for z in iz]
 profile=[(0,.1265)]+outer+[(.0845,0)]+inner+[(0,.1158)]
 # Uniform rings make circumference resolution explicit instead of allowing
 # automated collapse to erase the loop or create long crown triangles.
 def lathe(name,n):
  verts=[];rings=[];faces=[]
  for r,z in profile:
   if r==0:rings.append([len(verts)]);verts.append((0,0,z))
   else:
    rings.append(list(range(len(verts),len(verts)+n)))
    verts.extend([(r*math.cos(2*math.pi*k/n),r*math.sin(2*math.pi*k/n),z) for k in range(n)])
  for a,b in zip(rings,rings[1:]):
   for k in range(n):
    j=(k+1)%n
    if len(a)==1:faces.append((a[0],b[k],b[j]))
    elif len(b)==1:faces.append((a[k],b[0],a[j]))
    else:faces.append((a[k],b[k],b[j],a[j]))
  me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);return o
 body=lathe('hat_source_profile',40)
 # Fit the original loop silhouette and tilt, then retopologize that loop.
 # Width/depth come from source samples; the old irregular outer contour is
 # explicitly regularized rather than increasing triangle count unchanged.
 pts=np.array([v.co[:] for v in high.data.vertices]);upper=pts[pts[:,2]>.130]
 sample=[]
 for z in np.linspace(.130,.161,24):
  q=upper[np.abs(upper[:,2]-z)<.0008]
  if len(q)>5:sample.append((np.quantile(np.abs(q[:,0]),.97),z))
 a=np.array(sample);fit=np.linalg.lstsq(np.column_stack([a[:,0]**2,a[:,1]**2,a[:,1]]),np.ones(len(a)),rcond=None)[0];zc=-fit[2]/(2*fit[1]);rhs=1+fit[1]*zc*zc;rx=math.sqrt(rhs/fit[0]);rz=math.sqrt(rhs/fit[1]);slope,intercept=np.linalg.lstsq(np.column_stack([upper[:,2],np.ones(len(upper))]),upper[:,1],rcond=None)[0]
 radial=.0040;depth=float(np.quantile(np.abs(upper[:,1]-(slope*upper[:,2]+intercept)),.95));rx-=radial;rz-=radial
 assert .008<rx<.02 and .01<rz<.03 and .003<depth<.012
 verts=[];faces=[];N=32;M=6
 for i in range(N):
  t=2*math.pi*i/N;x=rx*math.cos(t);z=zc+rz*math.sin(t);y=slope*z+intercept
  nr=Vector((math.cos(t)/rx,0,math.sin(t)/rz)).normalized()
  for j in range(M):
   q=2*math.pi*j/M;p=Vector((x,y,z))+nr*(radial*math.cos(q))+Vector((0,depth*math.sin(q),0));verts.append(tuple(p))
 for i in range(N):
  for j in range(M):faces.append((i*M+j,((i+1)%N)*M+j,((i+1)%N)*M+(j+1)%M,i*M+(j+1)%M))
 me=bpy.data.meshes.new('Source fitted loop');me.from_pydata(verts,[],faces);me.update();loop=bpy.data.objects.new('Source fitted loop',me);bpy.context.collection.objects.link(loop)
 active(body);loop.select_set(True);bpy.ops.object.join()
 bm=bmesh.new();bm.from_mesh(body.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(body.data);bm.free()
 for p in body.data.polygons:p.use_smooth=True
 body.data.materials.append(material)
 return body,{'outer_profile_radius_height_m':outer,'inner_profile_radius_height_m':inner,'profile_segments':40,'loop_segments':N,'loop_cross_segments':M,'loop_source_fit':{'center_z_m':zc,'centerline_radii_xz_m':[rx,rz],'radial_halfwidth_m':radial,'depth_halfwidth_m':depth,'tilt_y_slope':slope,'tilt_y_intercept':intercept},'regularization':'Radially averaged source profile; least-squares ellipse for source loop. Intended soft felt symmetry; no unrelated primitive.'}

def hat():
 id='hat_sauna_duck';out=R/f'assets/{id}/quality/existing-review';out.mkdir(parents=True,exist_ok=True);clear_scene();rawpath=R/f'assets/{id}/gen/{id}__meshy6lite_raw_v01.glb';raw=next(o for o in imp(rawpath) if o.type=='MESH');raw.name='SOURCE_RAW_UNMODIFIED';raw['source_file']=f'assets/{id}/gen/{id}__meshy6lite_raw_v01.glb';raw['source_sha256']=sha(rawpath)
 high=raw.copy();high.data=raw.data.copy();bpy.context.collection.objects.link(high);high.name='MASTER_SOURCE_DERIVED';hidden(raw);active(high);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);lo,hi=bounds(high);scale=.18/max(hi.x-lo.x,hi.y-lo.y);c=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
 for v in high.data.vertices:v.co=(v.co-c)*scale
 for p in high.data.polygons:p.use_smooth=True
 high.data.normals_split_custom_set([(0,0,0)]*len(high.data.loops))
 mat=rgbmat('Pale aqua matte felt',(.24,.59,.62),.88);high.data.materials.clear();high.data.materials.append(mat)
 low,retopo=source_profile_retopology(high,mat);low.name='hat_sauna_duck';low['source_file']=f'assets/{id}/gen/{id}__meshy6lite_raw_v01.glb';low['asset_license']='CC-BY-4.0';low['modifications']='Measured source bell inner and outer radial profiles; fitted source loop; hollow source-derived retopology; pale aqua matte felt'
 if args.felt:
  active(low)
  bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT')
  nodes=mat.node_tree.nodes;links=mat.node_tree.links;bsdf=nodes.get('Principled BSDF');noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=1200;noise.inputs['Detail'].default_value=2;texcoord=nodes.new('ShaderNodeTexCoord');links.new(texcoord.outputs['Object'],noise.inputs['Vector']);bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.55;bump.inputs['Distance'].default_value=.0002;links.new(noise.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],bsdf.inputs['Normal'])
  img=bpy.data.images.new('Hat fine felt normal',width=512,height=512,alpha=False);img.colorspace_settings.name='Non-Color';tex=nodes.new('ShaderNodeTexImage');tex.image=img;nodes.active=tex;sc=bpy.context.scene;sc.render.engine='CYCLES';sc.cycles.samples=1;sc.render.bake.use_selected_to_active=False;sc.render.bake.margin=12;bpy.ops.object.bake(type='NORMAL');img.filepath_raw=str(out/'felt_normal.png');img.file_format='PNG';img.save();strip_png(out/'felt_normal.png');img.pack();nodes.remove(bump);nodes.remove(noise);nodes.remove(texcoord);normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.8;links.new(tex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])
 edit=low.copy();edit.data=low.data.copy();bpy.context.collection.objects.link(edit);edit.name='MASTER_EDITABLE_RETOPO';sub=edit.modifiers.new('Editable detail subdivision','SUBSURF');sub.levels=2;sub.render_levels=2;hidden(edit)
 facts={'revision':'v02','source_sha256':sha(rawpath),'source_uniform_scale':scale,'master':meshfacts(high),'runtime_before_export':meshfacts(low),'source_retopology':retopo};blend=R/f'assets/{id}/blend/{id}__v02.blend';save_scene(blend,raw,high,[low]);path=CAND/f'{id}.glb';export(path,[low]);facts.update(glb_sha256=sha(path),glb_bytes=path.stat().st_size,blend_sha256=sha(blend));meshes=render_views(id,path,out,'v02');facts['reimported_meshes']={o.name:meshfacts(o) for o in meshes};facts['triangles']=sum(meshfacts(o)['triangles'] for o in meshes);facts['material_count']=1;facts['texture_count']=1 if args.felt else 0;(out/'measurements.json').write_text(json.dumps(facts,indent=2)+'\n');print('HAT_DONE',json.dumps({k:facts[k] for k in ('triangles','glb_sha256','glb_bytes')}),flush=True)

def combined_audit():
 audit={'assets':{},'render_scope':'Candidate GLBs reimported; exact unchanged duck socket matrices; authored hat scale 1'}
 for id,rev in [('duck','v03'),('hat_sauna_duck','v02')]:
  blend=R/f'assets/{id}/blend/{id}__{rev}.blend';bpy.ops.wm.open_mainfile(filepath=str(blend));src=bpy.data.objects['SOURCE_RAW_UNMODIFIED'];original=next(o for o in imp(R/f'assets/{id}/gen/{id}__meshy6lite_raw_v01.glb') if o.type=='MESH')
  same=(len(src.data.vertices)==len(original.data.vertices) and len(src.data.polygons)==len(original.data.polygons) and all((a.co-b.co).length==0 for a,b in zip(src.data.vertices,original.data.vertices)) and all(tuple(a.vertices)==tuple(b.vertices) for a,b in zip(src.data.polygons,original.data.polygons)))
  images=[{'name':im.name,'packed':bool(im.packed_file),'relative_path':not im.filepath or im.filepath.startswith('//')} for im in bpy.data.images if im.source=='FILE']
  assert same and all(x['packed'] and x['relative_path'] for x in images)
  clear_scene();objects=imp(CAND/f'{id}.glb');manifold={}
  for o in objects:
   if o.type!='MESH':continue
   bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7);manifold[o.name]={'nonmanifold_edges_after_uv_seam_weld':sum(not e.is_manifold for e in bm.edges),'degenerate_faces':sum(f.calc_area()<1e-14 for f in bm.faces)};bm.free()
  assert all(x['nonmanifold_edges_after_uv_seam_weld']==0 and x['degenerate_faces']==0 for x in manifold.values())
  audit['assets'][id]={'source_geometry_unchanged':same,'packed_images':images,'reimported_geometry':manifold,'glb_sha256':sha(CAND/f'{id}.glb'),'blend_sha256':sha(blend)}
 clear_scene();duckobjs=imp(CAND/'duck.glb');sockets={o.name:o.matrix_world.copy() for o in duckobjs if o.name.startswith('socket_')};old=imp(R/'assets/duck/blend/duck__v01.glb');oldsocket={o.name.split('.')[0]:o.matrix_world.copy() for o in old if o.name.startswith('socket_')}
 assert all(max(abs(sockets[k][i][j]-oldsocket[k][i][j]) for i in range(4) for j in range(4))<1e-7 for k in sockets)
 for o in old:bpy.data.objects.remove(o,do_unlink=True)
 hats=imp(CAND/'hat_sauna_duck.glb')
 for o in hats:
  if o.parent is None:o.matrix_world=sockets['socket_hat']@o.matrix_world
 bpy.context.view_layer.update();meshes=[o for o in duckobjs+hats if o.type=='MESH'];hatmesh=next(o for o in hats if o.type=='MESH');lo,hi=bounds(hatmesh)
 audit['attachment']={'socket_hat_blender_m':list(sockets['socket_hat'].translation),'socket_label_blender_m':list(sockets['socket_label'].translation),'sockets_unchanged':True,'hat_top_world_m':hi.z,'label_anchor_clearance_m':sockets['socket_label'].translation.z-hi.z,'authored_scale':1,'label_bottom_anchor_code':'src/view/labels.ts: LABEL_CENTER_Y.character=0','label_bottom_clearance_m':sockets['socket_label'].translation.z-hi.z,'hat_bounds_world_blender_m':[list(lo),list(hi)]}
 # Center-ray hits crown well above the brim; this rejects a capped underside.
 dg=bpy.context.evaluated_depsgraph_get();tree=BVHTree.FromObject(hatmesh,dg);hit,_,_,_=tree.ray_cast(Vector((0,0,-.01)),Vector((0,0,1)),.3);audit['attachment']['open_underside_first_center_ray_hit_local_z_m']=hit.z if hit is not None else None;assert hit is not None and hit.z>.07
 sc=bpy.context.scene;sc.render.engine='CYCLES';sc.cycles.samples=24;sc.cycles.use_denoising=True;sc.render.resolution_x=sc.render.resolution_y=720;sc.render.resolution_percentage=100;sc.render.image_settings.file_format='PNG';sc.view_settings.view_transform='AgX';target=Vector((0,-.01,.22));span=.45
 w=bpy.data.worlds.new('Neutral combined');w.use_nodes=True;w.node_tree.nodes['Background'].inputs[0].default_value=(.095,.095,.095,1);w.node_tree.nodes['Background'].inputs[1].default_value=.45;sc.world=w
 for pos,power,size in [((1.8,-2.6,3),300,2.1),((-2.5,-1,1.6),110,2.2),((.5,2.2,2.4),220,1.5)]:
  bpy.ops.object.light_add(type='AREA',location=target+Vector(pos)*span);l=bpy.context.object;l.data.energy=power*span*span;l.data.size=size*span;l.rotation_euler=(target-l.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=.54;sc.camera=cam
 out=R/'assets/hat_sauna_duck/quality/existing-review'
 for name,d in [('front',(0,-1,.15)),('threequarter',(.7,-1,.3)),('side',(1,0,.10))]:
  cam.location=target+Vector(d).normalized()*2;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();sc.render.filepath=str(out/f'combined_{name}.png');bpy.ops.render.render(write_still=True);strip_png(Path(sc.render.filepath))
 for id,rev in [('duck','v03'),('hat_sauna_duck','v02')]:
  quality=R/f'assets/{id}/quality/existing-review';pngs=list(quality.rglob('*.png'));bad=[]
  for png in pngs:
   data=png.read_bytes();i=8
   while i<len(data):
    n=struct.unpack_from('>I',data,i)[0]
    if data[i+4:i+8] in (b'tEXt',b'zTXt',b'iTXt',b'eXIf'):bad.append(str(png.relative_to(R)))
    i+=n+12
  rawblend=subprocess.run(['zstd','-d','--stdout',str(R/f'assets/{id}/blend/{id}__{rev}.blend')],check=True,capture_output=True).stdout
  root_markers=[b'/' + name + b'/' for name in [b'Users',b'private',b'home']]
  pathleaks=sum(rawblend.count(marker) for marker in root_markers+[b'.codex/',b'@gmail.com'])
  data=(CAND/f'{id}.glb').read_bytes();n=struct.unpack_from('<I',data,12)[0];j=json.loads(data[20:20+n]);embedded=all('uri' not in x for x in j.get('images',[]))
  audit['assets'][id]['metadata']={'png_files_checked':len(pngs),'png_text_exif_chunks_found':len(bad),'private_path_markers_in_decompressed_blend':pathleaks,'all_glb_images_embedded':embedded}
  assert not bad and pathleaks==0 and embedded
 for id in ['duck','hat_sauna_duck']:(R/f'assets/{id}/quality/existing-review/audit.json').write_text(json.dumps(audit,indent=2)+'\n')
 print('COMBINED_AUDIT_DONE',json.dumps(audit['attachment']),flush=True)

if args.asset in ('duck','all'):duck()
if args.asset in ('hat','all'):hat()

if args.asset in ('all','verify'):combined_audit()

if args.asset=='sanitize':
 for id,rev in [('duck','v03'),('hat_sauna_duck','v02')]:
  path=R/f'assets/{id}/blend/{id}__{rev}.blend';bpy.ops.wm.open_mainfile(filepath=str(path));clean_image_paths(path);bpy.ops.wm.save_as_mainfile(filepath=str(path),compress=True);p=R/f'assets/{id}/quality/existing-review/measurements.json';facts=json.loads(p.read_text());facts['blend_sha256']=sha(path);p.write_text(json.dumps(facts,indent=2)+'\n')
