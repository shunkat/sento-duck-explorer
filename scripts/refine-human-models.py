"""Refine the actual generated human meshes; retain source, pose, and outfit contracts.
Run with Blender --background --python scripts/refine-human-models.py -- [child|adult].
This writes candidates only, never public models or shared production records.
"""
import bpy, bmesh, math, json, hashlib, struct, sys, re, runpy
from pathlib import Path
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
SANITIZE_GLB=runpy.run_path(str(Path(__file__).resolve().with_name('sanitize-glb-png.py')))['sanitize']
R=Path.cwd();BASE=R/'.local/existing-model-quality';BASE.mkdir(parents=True,exist_ok=True)
CFG={
 'child':dict(h=1.2,tris=5600,eye=(.060,.959,.014,.023),mouth=(.866,.034,.012,.0025),brow=(.060,.996,.023,.007),hair_front=[(-.18,.889),(-.145,.965),(-.11,1.018),(-.07,1.033),(-.055,1.014),(-.045,.979),(-.030,.985),(-.015,.993),(0,1.006),(.03,1.008),(.065,1.023),(.105,1.037),(.145,.972),(.18,.895)],hair_back=.855,shirt_bottom=.468,collar=.780,sleeve=.631,shirt=(.82,.085,.07),shorts=(.025,.043,.105)),
 'adult':dict(h=1.7,tris=5800,eye=(.057,1.493,.014,.022),mouth=(1.391,.035,.011,.0028),brow=(.057,1.540,.025,.007),hair_front=[(-.18,1.407),(-.146,1.486),(-.115,1.551),(-.08,1.575),(-.04,1.579),(0,1.551),(.035,1.578),(.075,1.597),(.115,1.565),(.146,1.492),(.18,1.411)],hair_back=1.408,shirt_bottom=.790,collar=1.287,sleeve=1.058,shirt=(.035,.34,.31),shorts=(.055,.071,.078)),
}

def activate(o):
 bpy.ops.object.select_all(action='DESELECT');o.hide_set(False);o.hide_render=False;o.select_set(True);bpy.context.view_layer.objects.active=o

def mesh_bounds(o):
 a=np.array([o.matrix_world @ v.co for v in o.data.vertices]);return a.min(0).tolist(),a.max(0).tolist()

def smoothstep(a,b,x):
 t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)

def strip_png(p):
 b=p.read_bytes();o=bytearray(b[:8]);i=8
 while i<len(b):
  n=struct.unpack_from('>I',b,i)[0]
  if b[i+4:i+8] not in (b'tEXt',b'zTXt',b'iTXt',b'eXIf'):o+=b[i:i+n+12]
  i+=n+12
 p.write_bytes(o)

class Field:
 def __init__(self,tree,value):self.t=tree;self.v=value
 def calc(self,op,other=None):
  n=self.t.nodes.new('ShaderNodeMath');n.operation=op
  for i,v in enumerate([self,other] if other is not None else [self]):
   if isinstance(v,Field):self.t.links.new(v.v,n.inputs[i])
   else:n.inputs[i].default_value=v
  return Field(self.t,n.outputs[0])
 def __add__(self,b):return self.calc('ADD',b)
 def __radd__(self,b):return self+b
 def __sub__(self,b):return self.calc('SUBTRACT',b)
 def __mul__(self,b):return self.calc('MULTIPLY',b)
 def __truediv__(self,b):return self.calc('DIVIDE',b)
 def square(self):return self*self
 def abs(self):return self.calc('ABSOLUTE')
 def min(self,b):return self.calc('MINIMUM',b)
 def max(self,b):return self.calc('MAXIMUM',b)
 def lt(self,b):return self.calc('LESS_THAN',b)
 def gt(self,b):return self.calc('GREATER_THAN',b)
 def smooth(self,lo,hi):
  n=self.t.nodes.new('ShaderNodeMapRange');n.interpolation_type='SMOOTHSTEP';n.clamp=True;n.inputs['From Min'].default_value=lo;n.inputs['From Max'].default_value=hi
  self.t.links.new(self.v,n.inputs['Value']);return Field(self.t,n.outputs[0])

def color_material(id,outfit):
 c=CFG[id];h=c['h'];m=bpy.data.materials.new(f'{id}_{outfit}_continuous_color_master');m.use_nodes=True;t=m.node_tree;t.nodes.clear()
 attr=t.nodes.new('ShaderNodeAttribute');attr.attribute_name='reference_position';sep=t.nodes.new('ShaderNodeSeparateXYZ');t.links.new(attr.outputs['Vector'],sep.inputs[0]);x,y,z=[Field(t,s) for s in sep.outputs]
 out=t.nodes.new('ShaderNodeOutputMaterial');em=t.nodes.new('ShaderNodeEmission');t.links.new(em.outputs[0],out.inputs['Surface'])
 rgb=t.nodes.new('ShaderNodeRGB');rgb.outputs[0].default_value=(.91,.48,.245,1);current=rgb.outputs[0]
 def paint(mask,color):
  nonlocal current
  n=t.nodes.new('ShaderNodeMixRGB');n.blend_type='MIX';t.links.new(mask.v,n.inputs[0]);t.links.new(current,n.inputs[1]);n.inputs[2].default_value=(*color,1);current=n.outputs[0]
 ax=x.abs()
 if outfit=='clothed':
  # Clean boundaries are evaluated per texel on the posed source, not per vertex.
  collar_curve=c['collar']+(ax/.085).square().min(1)*.018
  sleeve_line=c['sleeve']+(ax-(.19 if id=='child' else .27))*.45
  tshirt=z.gt(c['shirt_bottom'])*z.lt(collar_curve)*((ax.lt(.115*h))+(z.gt(sleeve_line))).min(1)
  paint(tshirt,c['shirt'])
  cuff_line=.252 if id=='child' else .449+ax*.10
  shorts=z.lt(c['shirt_bottom']+.001)*z.gt(cuff_line)*ax.lt(.143*h)
  paint(shorts,c['shorts'])
 # Front hairline follows the measured generated fringe; side/back are distinct.
 ramp=t.nodes.new('ShaderNodeValToRGB');ramp.color_ramp.interpolation='B_SPLINE';pts=c['hair_front'];xmin,xmax=pts[0][0],pts[-1][0]
 ramp.color_ramp.elements.remove(ramp.color_ramp.elements[1])
 for i,(xx,zz) in enumerate(pts):
  e=ramp.color_ramp.elements[0] if i==0 else ramp.color_ramp.elements.new((xx-xmin)/(xmax-xmin));e.position=(xx-xmin)/(xmax-xmin);e.color=(zz/h,zz/h,zz/h,1)
 t.links.new(((x-xmin)/(xmax-xmin)).v,ramp.inputs[0]);hairline=Field(t,ramp.outputs['Color'])*h
 front=y.smooth(-.045*h,-.025*h)*-1+1
 hair=(z-hairline).smooth(-.001,.001)*front+(z-c['hair_back']).smooth(-.001,.001)*(front*-1+1)
 ecx,ecz,erx,erz=(.175,.899,.034,.043) if id=='child' else (.168,1.434,.034,.052)
 ear=((ax-ecx)/erx).square()+((z-ecz)/erz).square()
 ear_mask=(ear.smooth(.92,1.05)*-1+1)*y.lt(.0)
 hair_paint=hair.min(1)*(ear_mask*-1+1)
 paint(hair_paint,(.095,.039,.020))
 if id=='child':front=front*(hair_paint*-1+1)
 # Smooth closed eye ovals, highlights, eyebrows and smile on the source face.
 ex,ez,ew,eh=c['eye']
 for sign in (-1,1):
  ellipse=((x-sign*ex)/ew).square()+((z-ez)/eh).square()
  eye=(ellipse.smooth(.89,1.03)*-1+1)*front
  paint(eye,(.022,.010,.006))
  dot=((x-(sign*ex-.0035))/(ew*.30)).square()+((z-(ez+eh*.42))/(eh*.22)).square()
  paint((dot.smooth(.8,1.15)*-1+1)*eye,(1.0,.97,.9))
  bx,bz,bw,bend=c['brow'];u=(x-sign*bx)/bw
  brow_z=(u.square()*-bend)+bz
  brow=((z-brow_z).abs().smooth(.0012,.0024)*-1+1)*u.abs().lt(1)*front
  paint(brow,(.065,.024,.012))
 mz,mw,bend,thick=c['mouth'];u=x/mw;smile_z=u.square()*bend+mz
 smile=((z-smile_z).abs().smooth(thick*.75,thick*1.35)*-1+1)*u.abs().lt(1)*front
 paint(smile,(.12,.034,.015))
 t.links.new(current,em.inputs['Color']);return m

def pose_source(o,id,sockets):
 c=CFG[id];h=c['h'];rest=np.array([v.co[:] for v in o.data.vertices]);arr=rest.copy()
 shoulder_z=.71 if id=='child' else 1.20;shoulder_x=.130 if id=='child' else .170
 widen=1.56 if id=='child' else 1.68
 torso=np.exp(-((rest[:,2]-shoulder_z)/(.13*h))**4)*(1-smoothstep(c['collar']-.04,c['collar']+.025,rest[:,2]))
 arr[:,0]*=1+(widen-1)*torso
 body_depth_offset=.10 if id=='adult' else 0
 arr[:,1]+=body_depth_offset
 drop=.030 if id=='child' else .045
 arr[:,2]-=drop*torso*smoothstep(shoulder_x*.5,shoulder_x*1.1,np.abs(rest[:,0]))
 # Two-bone source-space deformation preserves arm and hand volume. The
 # elbow is solved from the original segment lengths and the existing socket.
 for sign in (-1,1):
  S=np.array([sign*shoulder_x,-.012,shoulder_z])
  E=np.array([sign*(.225 if id=='child' else .300),-.025,.52 if id=='child' else .99])
  handpts=rest[(rest[:,0]*sign>.23*h)&(rest[:,2]<.48*h)];H=handpts.mean(0)
  S2=S.copy();S2[0]*=widen;S2[2]-=drop;S2[1]+=body_depth_offset
  if sign<0:T=np.array(sockets['socket_hand_r'])
  elif id=='child':T=np.array([abs(sockets['socket_hand_r'][0]),sockets['socket_hand_r'][1],sockets['socket_hand_r'][2]])
  else:T=np.array([.32,-.065,.65])
  l1=np.linalg.norm(E-S);l2=np.linalg.norm(H-E);D=T-S2;d=np.linalg.norm(D);axis=D/d;stretch=max(1,d/(.999*(l1+l2)));l1*=stretch;l2*=stretch
  along=(l1*l1-l2*l2+d*d)/(2*d);rise=math.sqrt(max(0,l1*l1-along*along))
  outward=E-S;perp=outward-axis*np.dot(outward,axis)
  if np.linalg.norm(perp)<1e-7:perp=np.array([sign,0,0])-axis*axis[0]*sign
  perp/=np.linalg.norm(perp)
  if id=='adult' and sign<0:
   down=np.array([0.,0.,-1.]);down-=axis*np.dot(down,axis);down/=np.linalg.norm(down)
   perp=perp*.25+down*.75;perp/=np.linalg.norm(perp)
  E2=S2+axis*along+perp*rise
  def rotated(points,origin,to,oldvec,newvec):
   q=Vector(oldvec).rotation_difference(Vector(newvec));mat=np.array(q.to_matrix());return ((points-origin) @ mat.T)*(np.linalg.norm(newvec)/np.linalg.norm(oldvec))+to
  upper=rotated(rest,S,S2,E-S,E2-S2);lower=rotated(rest,E,E2,H-E,T-E2)
  along_arm=np.sum((rest-E)*(H-S),axis=1)/np.linalg.norm(H-S)
  elbow=smoothstep(-.045*h,.045*h,along_arm)
  arm=upper*(1-elbow[:,None])+lower*elbow[:,None]
  inner=shoulder_x-.035*h+.45*np.maximum(0,shoulder_z-rest[:,2])
  membership=smoothstep(inner,inner+.025*h,rest[:,0]*sign)*(1-smoothstep(shoulder_z+.005*h,shoulder_z+.07*h,rest[:,2]))*smoothstep(.22*h,.32*h,rest[:,2])
  arr=arr*(1-membership[:,None])+arm*membership[:,None]
 head=smoothstep(.70 if id=='child' else .76,.78 if id=='child' else .82,rest[:,2]/h);arr[:,0]*=1+head*(.04 if id=='child' else .10)
 for v,p in zip(o.data.vertices,arr):v.co=p
 o.data.update();return rest

def normalize_raw(o,h):
 activate(o);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);lo,hi=mesh_bounds(o);lo=Vector(lo);hi=Vector(hi);scale=h/(hi.z-lo.z);center=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
 for v in o.data.vertices:v.co=(v.co-center)*scale
 o.data.update()

def make_low(high,id,outfit,target):
 low=high.copy();low.data=high.data.copy();bpy.context.collection.objects.link(low);low.name='outfit_'+outfit;activate(low)
 vg=low.vertex_groups.new(name='Important facial and hand contours')
 h=CFG[id]['h']
 for v in low.data.vertices:
  z=v.co.z/h;w=.38 if z>.72 else (.48 if abs(v.co.x)>.17*h and .24<z<.58 else .62)
  p=low.data.attributes['reference_position'].data[v.index].vector
  ear=abs(p.x)>(.145 if id=='child' else .14) and (abs(p.z-(.905 if id=='child' else 1.44))<(.065 if id=='child' else .08))
  nose=(p.x/.026)**2+((p.z-(.908 if id=='child' else 1.436))/.022)**2<1 and p.y<-.07*h
  hem=abs(p.z-CFG[id]['shirt_bottom'])<.012 or abs(p.z-(.264 if id=='child' else .495))<.012
  if ear or nose:w=.15
  if p.z>h*.965:w=.0 if id=='child' else .1
  if p.z<h*.12:w=.2
  if hem and abs(p.x)<.16*h:w=.25
  vg.add([v.index],w,'REPLACE')
 dec=low.modifiers.new('Weighted source reduction','DECIMATE');dec.ratio=(target+6)/len(low.data.polygons);dec.vertex_group=vg.name;dec.vertex_group_factor=.015;bpy.ops.object.modifier_apply(modifier=dec.name)
 # Refit the source coordinates on the high surface after collapse. The
 # reducer interpolates point attributes independently of its new positions;
 # retaining those values makes a horizontal garment boundary visibly ripple.
 high.data.calc_loop_triangles();ht=[tuple(t.vertices) for t in high.data.loop_triangles]
 bvh=BVHTree.FromPolygons([v.co for v in high.data.vertices],ht,all_triangles=True)
 hp=high.data.attributes['reference_position'].data
 for v,a in zip(low.data.vertices,low.data.attributes['reference_position'].data):
  loc,normal,index,distance=bvh.find_nearest(v.co)
  if index is not None:
   tri=ht[index];a.vector=barycentric_transform(loc,*[high.data.vertices[i].co for i in tri],*[hp[i].vector for i in tri])
 # Face UV coordinates must describe the final face, not interpolation of
 # a decimated point attribute, which can kink a painted eyebrow.
 for v,a in zip(low.data.vertices,low.data.attributes['reference_position'].data):
  if v.co.z>h*(.70 if id=='child' else .78):a.vector=(v.co.x/(1.04 if id=='child' else 1.10),v.co.y-(.10 if id=='adult' else 0),v.co.z)
 low.data.calc_loop_triangles()
 if len(low.data.loop_triangles)>target:
  dec=low.modifiers.new('Final budget trim','DECIMATE');dec.ratio=target/len(low.data.loop_triangles);bpy.ops.object.modifier_apply(modifier=dec.name)
 for p in low.data.polygons:p.use_smooth=True
 norm=low.modifiers.new('Normals from detailed generated surface','DATA_TRANSFER');norm.object=high;norm.use_loop_data=True;norm.data_types_loops={'CUSTOM_NORMAL'};norm.loop_mapping='POLYINTERP_NEAREST';bpy.ops.object.modifier_apply(modifier=norm.name)
 # Separate projection area for the face preserves eye/eyebrow curve resolution.
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=math.radians(70),island_margin=.025);bpy.ops.object.mode_set(mode='OBJECT')
 uv=low.data.uv_layers.active.data
 for p in low.data.polygons:
  ps=[low.data.vertices[low.data.loops[k].vertex_index].co for k in p.loop_indices]
  head=all(q.z>h*.69 and q.y<-.015*h for q in ps)
  for k in p.loop_indices:
   if head:
    v=low.data.attributes['reference_position'].data[low.data.loops[k].vertex_index].vector
    # Each character's authored head patch fills the top-left atlas region.
    uv[k].uv=(.025+(.5*(v.x/(h*.20)+1))*.53,.43+((v.z/h-.66)/.35)*.54)
   else:uv[k].uv=(.59+uv[k].uv.x*.385,.025+uv[k].uv.y*.95)
 return low

def bake(low,id,outfit):
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16
 image=bpy.data.images.new(f'{id}_{outfit}_basecolor_v02',width=4096,height=4096,alpha=False);image.colorspace_settings.name='sRGB';image.generated_color=(.91,.48,.245,1)
 mat=low.data.materials[0];node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;mat.node_tree.nodes.active=node;activate(low)
 scene.render.bake.margin=48;scene.render.bake.use_clear=False;scene.render.bake.use_selected_to_active=False;bpy.ops.object.bake(type='EMIT');image.scale(1024,1024);image.pack()
 final=bpy.data.materials.new(f'{id}_{outfit}_satin_toy');final.use_nodes=True;t=final.node_tree;bsdf=t.nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=.53;tex=t.nodes.new('ShaderNodeTexImage');tex.image=image;t.links.new(tex.outputs['Color'],bsdf.inputs['Base Color']);low.data.materials.clear();low.data.materials.append(final)
 return image

def render_checks(id,root,quality):
 scene=bpy.context.scene;h=CFG[id]['h'];scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.resolution_x=scene.render.resolution_y=640;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX';scene.view_settings.exposure=0
 scene.world=bpy.data.worlds.new('Inspection neutral');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.11,.11,.11,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.6
 for pos,power,size in [((1.7,-2.6,3),350,2.4),((-2,-1.4,1.3),150,2.5),((.5,2,2.3),200,1.8)]:
  bpy.ops.object.light_add(type='AREA',location=Vector(pos)*h);o=bpy.context.object;o.data.energy=power*h*h;o.data.size=size*h;o.rotation_euler=(Vector((0,0,h*.5))-o.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';scene.camera=cam
 for outfit in ('clothed','bath'):
  for o in scene.objects:
   if o.type=='MESH':o.hide_render=not o.name.startswith('outfit_'+outfit)
  for name,direction,focus,span in [('front',(0,-1,.05),h*.50,h*1.13),('threequarter',(.42,-1,.2),h*.50,h*1.13),('face',(0,-1,0),h*(.82 if id=='child' else .875),h*.42),('side',(1,-.1,.05),h*.50,h*1.13)]:
   target=Vector((0,0,focus));cam.location=target+Vector(direction).normalized()*h*4;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=span;scene.render.filepath=str(quality/f'{outfit}_{name}.png');bpy.ops.render.render(write_still=True);strip_png(Path(scene.render.filepath))

def audit_and_notes(id,blend,path,quality,facts):
 # Reopen the actual saved scene, then inspect a private uncompressed copy.
 bpy.ops.wm.open_mainfile(filepath=str(blend))
 assert all(im.packed_file for im in bpy.data.images if im.type=='IMAGE')
 private=BASE/'human-inspect'/f'{id}-audit.blend';private.parent.mkdir(parents=True,exist_ok=True)
 bpy.ops.wm.save_as_mainfile(filepath=str(private),compress=False,copy=True)
 patterns={'private_home_path':rb'/(?:Users|home)/[^/\x00\s]+/',
           'email_like':rb'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}',
           'token_prefix':rb'(?:github_pat_|ghp_|sk-proj-)[A-Za-z0-9_-]{10,}'}
 audit={'scope':'Heuristic private home paths, email-like text, common token prefixes; not exhaustive','artifacts':[],'pngs':[]}
 for label,data in [('reopened_uncompressed_blend',private.read_bytes()),('candidate_glb',path.read_bytes())]:
  findings=[label for label,pattern in patterns.items() if re.search(pattern,data)]
  audit['artifacts'].append({'artifact':label,'finding_categories':findings});assert not findings,(id,label,findings)
 private.unlink()
 b=path.read_bytes();n=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+n]);binary=28+n
 audit['glb_materials']=len(g['materials']);audit['glb_images']=len(g['images']);audit['embedded_png_sizes']=[];audit['embedded_png_chunk_types']=[]
 for im in g['images']:
  assert 'uri' not in im and im['mimeType']=='image/png';bv=g['bufferViews'][im['bufferView']];data=b[binary+bv.get('byteOffset',0):binary+bv.get('byteOffset',0)+bv['byteLength']]
  size=list(struct.unpack_from('>II',data,16));audit['embedded_png_sizes'].append(size);assert size==[1024,1024]
  offset=8;chunks=[]
  while offset<len(data):
   length=struct.unpack_from('>I',data,offset)[0];chunks.append(data[offset+4:offset+8].decode());offset+=length+12
  assert offset==len(data) and not {'eXIf','tEXt','zTXt','iTXt'}.intersection(chunks),(id,'embedded PNG metadata')
  audit['embedded_png_chunk_types'].append(chunks)
 assert audit['glb_materials']==2 and audit['glb_images']==2
 for png in sorted(quality.glob('*.png')):
  strip_png(png);data=png.read_bytes();i=8;chunks=[];metadata=b''
  while i<len(data):
   count=struct.unpack_from('>I',data,i)[0];kind=data[i+4:i+8];chunks.append(kind.decode());
   if kind!=b'IDAT':metadata+=data[i+8:i+8+count]
   i+=count+12
  findings=[label for label,pattern in patterns.items() if re.search(pattern,metadata)]
  assert not findings;(audit['pngs']).append({'file':png.name,'chunks':chunks,'finding_categories':findings})
 audit['result']='PASS';(quality/'metadata-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
 rows=[]
 for outfit,v in facts['meshes'].items():
  lo,hi=v['bounds_blender_xyz'];dims=[hi[i]-lo[i] for i in range(3)]
  rows.append(f"| {outfit} | {v['triangles']} | {v['head_triangles']} | {dims[2]:.6f} | {v['shoulder_width']:.6f} | {v['hand_nearest_vertex_distance']*1000:.3f} |")
 raw=R/f'assets/{id}/gen/{id}__meshy6lite_raw_v01.glb';ref=R/f'assets/{id}/ref/{id}__ref_threequarter_v01.png'
 note=f"""# {id.title()} v02 candidate refinement

This is a free Blender 5.2.4 source-derived refinement of the preserved Meshy 6 Lite output. The original reference, raw GLB and v01 Blend are unchanged. The saved scene contains `SOURCE_RAW_UNMODIFIED`, separate detailed clothed/bath masters, and the two runtime outfits. No primitive replacement character, new generation, rig or animation is claimed. Derived geometry and textures remain CC BY 4.0.

## Reproduction and corrections

Run `Blender --background --python scripts/refine-human-models.py -- {id}` from the repository. It writes the private candidate and these review files; it does not publish to `public/models`.

- A source-space two-segment arm deformation preserves hand volume and solves the existing hand socket. Shoulder widening has smooth vertical falloff, a rounded shoulder drop, and an explicit neck/head exclusion. The adult body depth offset keeps its static raised hand and the existing carry socket clear of the torso.
- The source nose, cheeks, jaw, ears and hair locks are retained. Only the shallow generated eye, brow and smile relief is relaxed locally, then clean oval eyes, highlights and curved brows/smile are evaluated continuously on the face. This corrects malformed painted eyes without replacing the head.
- Detailed-source positions are reprojected after collapse before color baking. Sleeve planes, collar, shirt hem and shorts hem use source-space masks. Ear-front exclusion cleans the hair/skin boundary. The face has a dedicated UV area. A 4096 emission bake is reduced to the required embedded 1024 texture per outfit, giving small UV islands adequate bake coverage.
- Face, ear, nose, hair-tip, garment-hem and foot regions receive explicit collapse weights; final custom normals are transferred from the detailed surface. The two runtime variants retain one material and one texture each.
- Bath uses only local sleeve, waist and knee garment-seam relaxation. It is an opaque, abstract toy surface, with no anatomical additions or body towel. Both outfits use the same source face and facial color field; their separately reduced topology is not claimed to be vertex-identical.
- The final combined horizontal bounds are centered at the bottom. The old gameplay sockets stay at their original transforms, with proximity to the actual exported hand measured below.

## Rejected iterations and the quality mechanism

The first weighted collapse used high values on important regions and left only **350 triangles above child Z=0.72h** at 5600 total. That candidate was rejected visually: cheeks, ears and hair became large planar triangles. Inverting that strong preference retained 2980 head-region triangles but caused garment ripples. The final factor is 0.015, with local contour weights and measured regional counts. High weights preferentially collapse edges in Blender's Collapse operation; see the [official Decimate Geometry documentation](https://docs.blender.org/manual/en/5.0/modeling/meshes/editing/mesh/cleanup.html). Whole-body smoothing and subdivision-only inflation were not accepted fixes.

Pose experiments that affected outer thighs or the lower head were rejected and replaced with arm-interior bounds plus explicit head exclusion. The final low mesh is reimported from the actual GLB for front, three-quarter, side and face renders in both outfits. The 5600/5800 runtime limits are not relaxed to hide geometry loss. No gameplay or frame-rate claim follows from these asset renders.

## Actual export measurements

| Outfit | Triangles | Triangles above 0.72h | Height m | Shoulder width m | Nearest hand vertex mm |
| --- | ---: | ---: | ---: | ---: | ---: |
{chr(10).join(rows)}

The regional count uses polygon center Z > 0.72h for consistent reduction diagnostics; it is not an anatomical segmentation. Exact bounds, bottom-center correction and Blender-space socket coordinates are in `../quality/existing-review/measurements.json` (glTF maps Blender XYZ to XZ-Y). All four runtime variants across child/adult fit the existing 11,400 visible-triangle total when one outfit is selected per character. The inspection weld has zero non-manifold edges; stored UV splits remain intact.

## Provenance and checksums

- Raw GLB SHA-256: `{hashlib.sha256(raw.read_bytes()).hexdigest()}`
- Reference PNG SHA-256: `{hashlib.sha256(ref.read_bytes()).hexdigest()}`
- Candidate GLB SHA-256: `{facts['sha256']}` ({facts['bytes']} bytes)
- Saved v02 Blend SHA-256: `{facts['blend_sha256']}`

The actual Blend was reopened, all generated textures were confirmed packed, the actual GLB was reimported, and its two embedded PNGs were confirmed 1024×1024. Structured preview PNG metadata and a private uncompressed Blend copy were audited for common private-path, email and credential patterns: PASS. This is heuristic hygiene, not an exhaustive confidentiality guarantee. See `../quality/existing-review/metadata-audit.json`.

Remaining limits: this remains a reduced static toy model derived from one generated view; some hair-lock facets, subtle garment folds and small bake softness remain at close inspection. The free source's hand/foot anatomy is stylized. The shared fixed-camera comparison and independent visual review determine acceptance; this note does not self-approve promotion or gameplay.
"""
 proof_path=quality/'texture-only-proof.json'
 if proof_path.exists() and json.loads(proof_path.read_text()).get('final_sha256')==facts['sha256']:
  proof=json.loads(proof_path.read_text())
  correction=('Independent review found a skin-colored central fringe panel: source X≈−0.04 m ended at Z≈0.986 m while the earlier color mask was near Z≈1.02 m. The mask was aligned to the actual fringe; face overlays are now limited to skin. Side/back hair boundaries were also aligned. The side/back lower hair cut remains simplified.' if id=='child' else 'Independent review found a skin-colored ring on the shorts hem. Original-source BVH profiles measured the actual cuff termination at Z≈0.458–0.466 m across X=0.06–0.16 m, below the earlier Z=0.480 m color cutoff. The final mask follows Z≈0.449+0.10|X| m, keeping the rounded cuff dark gray without a broad paint extension onto the leg.')
  note+='\n## Final independent-review correction\n\n'+correction+'\n\nThe final texture-only revision preserves both named meshes’ POSITION, NORMAL, TEXCOORD_0 and index accessors byte-for-byte from `'+proof['prior_sha256']+'`. See `../quality/existing-review/texture-only-proof.json`.\n'
 (blend.parent/f'{id}__v02.md').write_text(note)

def run(id):
 c=CFG[id];h=c['h'];asset=R/'assets'/id;quality=asset/'quality/existing-review';quality.mkdir(parents=True,exist_ok=True);out=BASE/'candidates';out.mkdir(parents=True,exist_ok=True)
 bpy.ops.wm.open_mainfile(filepath=str(asset/f'blend/{id}__v01.blend'))
 sockets={o.name:list(o.location) for o in bpy.data.objects if o.name.startswith('socket_')}
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(asset/f'gen/{id}__meshy6lite_raw_v01.glb'));raw=next(o for o in bpy.context.scene.objects if o.type=='MESH');raw.name='SOURCE_RAW_UNMODIFIED';raw['source_file']=f'assets/{id}/gen/{id}__meshy6lite_raw_v01.glb';raw['source_sha256']=hashlib.sha256((asset/f'gen/{id}__meshy6lite_raw_v01.glb').read_bytes()).hexdigest();raw.hide_set(True);raw.hide_render=True
 master=raw.copy();master.data=raw.data.copy();bpy.context.collection.objects.link(master);master.name='MASTER_clothed_source_pose';master.hide_set(False);master.hide_render=False;normalize_raw(master,h)
 attr=master.data.attributes.new('reference_position','FLOAT_VECTOR','POINT')
 for v,a in zip(master.data.vertices,attr.data):a.vector=v.co
 pose_source(master,id,sockets)
 # Remove only the generated raised facial paint relief; preserve the source
 # nose, ears, cheeks, jaw and all hair locks. The expression is painted cleanly.
 activate(master);vg=master.vertex_groups.new(name='Local generated facial relief cleanup')
 ex,ez,ew,eh=c['eye'];mz,mw,bend,thick=c['mouth']
 for v,a in zip(master.data.vertices,master.data.attributes['reference_position'].data):
  p=a.vector;x,y,z=p
  eye=((abs(x)-ex)/(.032 if id=='child' else .035))**2+((z-(ez+.008))/(.057 if id=='child' else .064))**2
  mouth=(x/(mw*1.5))**2+((z-(mz+.006))/.024)**2
  w=max(1-smoothstep(.35,1.3,eye),1-smoothstep(.35,1.3,mouth)) if y<-.08*h else 0
  vg.add([v.index],float(w),'REPLACE')
 sm=master.modifiers.new('Clean only eye brow and smile relief','SMOOTH');sm.factor=.6;sm.iterations=65;sm.vertex_group=vg.name;bpy.ops.object.modifier_apply(modifier=sm.name)
 for f in master.data.polygons:f.use_smooth=True
 root=bpy.data.objects.new(id,None);bpy.context.collection.objects.link(root);root['asset_id']=id;root['license']='CC-BY-4.0';root['source']=f'assets/{id}/gen/{id}__meshy6lite_raw_v01.glb';root['modifications']='Source-derived smooth pose cage, local proportional correction, continuous clothing and facial color fields, weighted reduction, detailed-source normal transfer, high-area face UV bake';root['default_outfit']='clothed'
 low_objects=[]
 for outfit in ('clothed','bath'):
  high=master if outfit=='clothed' else master.copy()
  if outfit=='bath':
   high.data=master.data.copy();bpy.context.collection.objects.link(high);high.name='MASTER_bath_featureless_toy';activate(high);vg=high.vertex_groups.new(name='Garment seam relaxation')
   for v in high.data.vertices:
    p=high.data.attributes['reference_position'].data[v.index].vector;x,y,z=p
    hem=c['shirt_bottom'];cuff=.264 if id=='child' else .495
    waist=math.exp(-((z-hem)/(.035*h))**2)*(1-smoothstep(.11*h,.16*h,abs(x)))
    knee=math.exp(-((z-cuff)/(.045*h))**2)*(1-smoothstep(.12*h,.16*h,abs(x)))
    sleeve=math.exp(-((z-c['sleeve'])/(.038*h))**2)*smoothstep(.10*h,.15*h,abs(x))
    w=float(max(waist,knee,sleeve));vg.add([v.index],w,'REPLACE')
   sm=high.modifiers.new('Remove garment ridges on abstract bath toy','SMOOTH');sm.factor=.55;sm.iterations=150;sm.vertex_group=vg.name;bpy.ops.object.modifier_apply(modifier=sm.name)
  high.data.materials.clear();high.data.materials.append(color_material(id,outfit));low=make_low(high,id,outfit,c['tris']);low.parent=root;low['outfit']=outfit;low['license']='CC-BY-4.0';image=bake(low,id,outfit);low_objects.append(low);high.hide_set(True);high.hide_render=True
 # Center the final runtime bounds without moving the existing gameplay sockets.
 # The socket remains within the actual palm (measured again after export).
 coords=np.concatenate([np.array([v.co[:] for v in o.data.vertices]) for o in low_objects]);lo=coords.min(0);hi=coords.max(0);origin_offset=np.array([(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,lo[2]])
 for o in [*low_objects,*[x for x in bpy.context.scene.objects if x.name.startswith('MASTER_')]]:
  for v in o.data.vertices:v.co-=Vector(origin_offset)
 root['bottom_center_correction']=origin_offset.tolist()
 for name,pos in sockets.items():o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=pos;o.parent=root
 for o in low_objects:o.hide_render=o.name=='outfit_bath';o.hide_set(o.name=='outfit_bath')
 for screen in bpy.data.screens:
  for area in screen.areas:
   if area.type=='FILE_BROWSER':
    try:area.spaces.active.params.directory=b'/'*1023;area.spaces.active.params.directory=b'//'
    except:pass
 bpy.context.scene.world=None;bpy.context.scene.render.filepath='//'
 blend=asset/f'blend/{id}__v02.blend';bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=True)
 bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
 for o in root.children:o.hide_set(False);o.hide_render=False;o.select_set(True)
 path=out/f'{id}.glb';bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_extras=True,export_apply=False,export_materials='EXPORT',export_yup=True,export_cameras=False,export_lights=False,export_copyright='Meshy 6 Lite output, CC BY 4.0; Blender modifications by Sento Duck Explorer')
 sanitization=SANITIZE_GLB(path);(quality/'embedded-png-sanitization.json').write_text(json.dumps(sanitization,indent=2)+'\n')
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(path));rr=next(o for o in bpy.context.scene.objects if o.name==id);facts={'id':id,'bottom_center_correction':origin_offset.tolist(),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size,'blend_sha256':hashlib.sha256(blend.read_bytes()).hexdigest(),'meshes':{},'sockets':{o.name:list(o.location) for o in rr.children if o.type=='EMPTY'}}
 for o in rr.children:
  if o.type!='MESH':continue
  o.data.calc_loop_triangles();lo,hi=mesh_bounds(o);bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
  points=[o.matrix_world @ v.co for v in o.data.vertices];band=(.64,.80) if id=='child' else (1.15,1.25);xs=[p.x for p in points if band[0]<=p.z<=band[1]];hand=bpy.data.objects['socket_hand_r'].matrix_world.translation
  facts['meshes'][o.name]={'shoulder_band_z':band,'shoulder_width':max(xs)-min(xs),'hand_nearest_vertex_distance':min((p-hand).length for p in points),'vertices':len(o.data.vertices),'triangles':len(o.data.loop_triangles),'head_triangles':sum(p.center.z>h*.72 for p in o.data.polygons),'bounds_blender_xyz':[lo,hi],'nonmanifold_after_uv_weld':sum(not e.is_manifold for e in bm.edges)};bm.free()
 for name,v in facts['meshes'].items():
  minimum,maximum=(.44,.56) if id=='child' else (.64,.80)
  lo,hi=v['bounds_blender_xyz']
  assert v['triangles']==c['tris'] and v['nonmanifold_after_uv_weld']==0,(id,name,'topology')
  assert minimum<=v['shoulder_width']<=maximum,(id,name,'shoulders')
  assert abs((hi[2]-lo[2])-h)<.01 and v['hand_nearest_vertex_distance']<.04,(id,name,'height or hand socket')
  assert v['head_triangles']>=(2000 if id=='child' else 1800),(id,name,'face allocation')
  assert all(math.isfinite(x) for p in (lo,hi) for x in p)
 (quality/'measurements.json').write_text(json.dumps(facts,indent=2)+'\n');render_checks(id,rr,quality)
 audit_and_notes(id,blend,path,quality,facts)
 print(json.dumps(facts))

if __name__=='__main__':
 args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
 for id in args or ['child','adult']:run(id)
