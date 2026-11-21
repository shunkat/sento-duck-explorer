"""Make a footless v04 from the actual, preserved v03 Blender source.

Blender --background --python scripts/make-rubber-duck.py
Writes a review candidate only. Existing v03 evidence and public files stay intact.
"""
import hashlib, json, math, struct, subprocess
from pathlib import Path
import bpy, bmesh, numpy as np
from mathutils import Vector

ROOT = Path.cwd()
OUT = ROOT / 'assets/duck/quality/v04'
CAND = ROOT / '.local/rubber-duck-v04'
BLEND = ROOT / 'assets/duck/blend/duck__v04.blend'
SOURCE = ROOT / 'assets/duck/blend/duck__v03.blend'
CUT = .077
BAND_TOP = .130
YELLOW = (1.0, .55, .004, 1.0)
OUT.mkdir(parents=True, exist_ok=True)
CAND.mkdir(parents=True, exist_ok=True)

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def active(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.hide_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

def strip_png(path):
    data = Path(path).read_bytes(); result = bytearray(data[:8]); i = 8
    while i < len(data):
        n = struct.unpack_from('>I', data, i)[0]; end = i + n + 12
        if data[i+4:i+8] not in (b'tEXt', b'zTXt', b'iTXt', b'eXIf'):
            result += data[i:end]
        i = end
    Path(path).write_bytes(result)

def geometry_digest(obj):
    coords = np.array([v.co[:] for v in obj.data.vertices], dtype='<f4')
    faces = np.array([v for p in obj.data.polygons for v in p.vertices], dtype='<u4')
    return {'vertices_sha256': hashlib.sha256(coords.tobytes()).hexdigest(),
            'face_indices_sha256': hashlib.sha256(faces.tobytes()).hexdigest(),
            'vertices': len(coords), 'polygons': len(obj.data.polygons)}

def corners(mesh, min_z=BAND_TOP+1e-7):
    uv = mesh.uv_layers.active
    result = {}
    for p in mesh.polygons:
        if min(mesh.vertices[i].co.z for i in p.vertices) < min_z:
            continue
        key = tuple(sorted(tuple(mesh.vertices[i].co) for i in p.vertices))
        result[key] = {tuple(mesh.vertices[mesh.loops[i].vertex_index].co):
                      (tuple(uv.data[i].uv) if uv else None, tuple(mesh.corner_normals[i].vector))
                      for i in p.loop_indices}
    return result

def cap_lower(obj, detailed=False, constant_uv=None):
    mesh = obj.data
    preserved = corners(mesh) if not detailed else None
    bm = bmesh.new(); bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    nlayer = bm.loops.layers.float_vector.new('retained_corner_normal')
    for face, poly in zip(bm.faces, mesh.polygons):
        assert [l.vert.index for l in face.loops] == list(poly.vertices)
        for loop, index in zip(face.loops, poly.loop_indices):
            loop[nlayer] = mesh.corner_normals[index].vector
    initial_triangles = sum(len(f.verts)-2 for f in bm.faces)
    bmesh.ops.bisect_plane(bm, geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
                          dist=1e-8, plane_co=(0,0,CUT), plane_no=(0,0,1), clear_inner=True)
    boundary = [e for e in bm.edges if e.is_boundary]
    assert boundary and all(abs(v.co.z-CUT)<1e-6 for e in boundary for v in e.verts)
    adjacency = {}
    for e in boundary:
        a,b=e.verts; adjacency.setdefault(a,[]).append(b); adjacency.setdefault(b,[]).append(a)
    assert all(len(x)==2 for x in adjacency.values())
    first = min(adjacency, key=lambda v: (v.co.x, v.co.y)); ring=[first]; previous=None; current=first
    while True:
        following=next(v for v in adjacency[current] if v is not previous)
        if following is first: break
        ring.append(following); previous,current=current,following
    assert len(ring)==len(adjacency), 'Cut must be one body contour, not two leg contours'
    area=sum(a.co.x*b.co.y-b.co.x*a.co.y for a,b in zip(ring,ring[1:]+ring[:1]))
    if area<0: ring.reverse()
    source_points=[v.co.copy() for v in ring]
    center=Vector(((min(v.x for v in source_points)+max(v.x for v in source_points))/2,
                   (min(v.y for v in source_points)+max(v.y for v in source_points))/2,0))
    a=(max(v.x for v in source_points)-min(v.x for v in source_points))/2
    b=(max(v.y for v in source_points)-min(v.y for v in source_points))/2
    source_radii=(a,b)
    ellipse=[]
    for v in source_points:
        theta=math.atan2((v.y-center.y)/b,(v.x-center.x)/a)
        ellipse.append(Vector((a*math.cos(theta),b*math.sin(theta),0)))
    # Fair only the lower belly into a broad rubber-toy form. This avoids
    # carrying the old narrow leg-root contours or their downward normals
    # into a separate-looking pedestal. The upper body is left exact.
    target_a,target_b=.087,.112
    max_displacement=0;band_vertices=0
    for vert in bm.verts:
        if vert.co.z >= BAND_TOP: continue
        t=max(0,min(1,(vert.co.z-CUT)/(BAND_TOP-CUT)))
        weight=1-t*t*(3-2*t)
        theta=math.atan2((vert.co.y-center.y)/b,(vert.co.x-center.x)/a)
        target=Vector((center.x+target_a*math.cos(theta),center.y+target_b*math.sin(theta),vert.co.z))
        delta=(target-vert.co)*weight
        max_displacement=max(max_displacement,delta.length);band_vertices+=1
        vert.co+=delta
        fair_normal=Vector((math.cos(theta)/target_a,math.sin(theta)/target_b,0)).normalized()
        for loop in vert.link_loops:loop[nlayer]=(loop[nlayer]*(1-weight)+fair_normal*weight).normalized()
    source_points=[v.co.copy() for v in ring]
    a,b=target_a,target_b
    ellipse=[Vector((v.x-center.x,v.y-center.y,0)) for v in source_points]
    seam_normals={v: sum((l[nlayer] for l in v.link_loops),Vector()).normalized() for v in ring}
    uv=bm.loops.layers.uv.active
    angles=[math.atan2(v.y/b,v.x/a) for v in ellipse]
    def point(u,i):
        # One rounded lower belly, horizontally tangent to its small flat
        # contact patch and smoothly tangent to the locally faired body band.
        v=1-u
        p0=ellipse[i]*.55+center
        p1=ellipse[i]*.95+center
        p3=source_points[i]
        p2=ellipse[i]+center+Vector((0,0,.045))
        return p0*v**3+p1*(3*v*v*u)+p2*(3*v*u*u)+p3*u**3
    segments=12 if detailed else 6
    rows=[]; normals={}
    for j in range(segments):
        u=j/segments; row=[]
        for i in range(len(ring)):
            p=point(u,i); vert=bm.verts.new(p); row.append(vert)
            if j==0: n=Vector((0,0,-1))
            else:
                theta=angles[i]
                around=Vector((-a*math.sin(theta),b*math.cos(theta),0))
                along=point(min(1,u+1e-4),i)-point(max(0,u-1e-4),i)
                n=around.cross(along).normalized()
                t=max(0,min(1,(u-.65)/.35));w=t*t*(3-2*t)
                n=(n*(1-w)+seam_normals[ring[i]]*w).normalized()
            normals[vert]=n
        rows.append(row)
    rows.append(ring); normals.update(seam_normals)
    new_faces=[]
    for bottom,top in zip(rows,rows[1:]):
        for i in range(len(ring)):
            k=(i+1)%len(ring)
            new_faces.append(bm.faces.new((bottom[i],bottom[k],top[k],top[i])))
    bottom_center=bm.verts.new((0,0,0)); normals[bottom_center]=Vector((0,0,-1))
    for i in range(len(ring)):
        new_faces.append(bm.faces.new((bottom_center,rows[0][(i+1)%len(ring)],rows[0][i])))
    for face in new_faces:
        face.smooth=True
        for loop in face.loops:
            loop[nlayer]=normals[loop.vert]
            if uv and constant_uv is not None: loop[uv].uv=constant_uv
    bm.normal_update()
    # Triangulate only added faces; original upper-body faces/UVs stay identical.
    bmesh.ops.triangulate(bm,faces=new_faces,quad_method='BEAUTY',ngon_method='BEAUTY')
    assert sum(not e.is_manifold for e in bm.edges)==0
    bm.to_mesh(mesh); bm.free(); mesh.update()
    attr=mesh.attributes['retained_corner_normal']
    retained=[tuple(x.vector) for x in attr.data]
    mesh.normals_split_custom_set(retained)
    mesh.attributes.remove(attr)
    for p in mesh.polygons:p.use_smooth=True
    if detailed:
        for col in mesh.color_attributes:
            if col.domain=='POINT':
                for v in mesh.vertices:
                    if v.co.z<CUT-1e-6: col.data[v.index].color=YELLOW
    mesh.calc_loop_triangles()
    proof={'cut_height_m':CUT,'seam_vertices':len(ring),'cap_rings':segments,
           'lower_belly_fairing_top_m':BAND_TOP,'faired_band_vertices':band_vertices,
           'max_fairing_vertex_displacement_m':max_displacement,
           'source_seam_center_xy_m':list(center)[:2],'source_seam_radii_xy_m':list(source_radii),
           'faired_target_radii_xy_m':[target_a,target_b],
           'original_triangles':initial_triangles,'triangles':len(mesh.loop_triangles)}
    if preserved is not None:
        after=corners(mesh)
        assert set(preserved)==set(after), 'Upper triangles changed'
        uv_error=normal_error=head_normal_error=0
        for f, old in preserved.items():
            for co,(old_uv,old_n) in old.items():
                new_uv,new_n=after[f][co]
                uv_error=max(uv_error,max(abs(x-y) for x,y in zip(old_uv,new_uv)))
                error=max(abs(x-y) for x,y in zip(old_n,new_n))
                normal_error=max(normal_error,error)
                if co[2]>.165: head_normal_error=max(head_normal_error,error)
        assert uv_error<1e-7 and normal_error<1e-3,(uv_error,normal_error)
        proof.update(preserved_upper_triangles=len(preserved),preserved_surface_min_z_m=BAND_TOP,upper_positions_exact=True,
                     max_upper_uv_error=uv_error,max_upper_corner_normal_error=normal_error,
                     max_head_corner_normal_error=head_normal_error,normal_reencoding_tolerance=0.001)
    return proof

def bounds(obj):
    xyz=np.array([obj.matrix_world @ v.co for v in obj.data.vertices])
    return xyz.min(0),xyz.max(0)

def topology(obj):
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7)
    result={'welded_vertices':len(bm.verts),'nonmanifold_edges_after_uv_weld':sum(not e.is_manifold for e in bm.edges),
            'degenerate_faces':sum(f.calc_area()<1e-14 for f in bm.faces)}
    bm.free();obj.data.calc_loop_triangles();lo,hi=bounds(obj)
    result.update(triangles=len(obj.data.loop_triangles),dimensions_gltf_m=[float(hi[0]-lo[0]),float(hi[2]-lo[2]),float(hi[1]-lo[1])],
                  bounds_blender_zup_m=[lo.tolist(),hi.tolist()])
    assert result['nonmanifold_edges_after_uv_weld']==0 and result['degenerate_faces']==0
    return result

bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
body=bpy.data.objects['duck_body'];master=bpy.data.objects['MASTER_SOURCE_DERIVED'];raw=bpy.data.objects['SOURCE_RAW_UNMODIFIED']
eye=bpy.data.objects['duck_eyes'];root=bpy.data.objects['duck']
sockets={o.name: [list(row) for row in o.matrix_world] for o in bpy.data.objects if o.name.startswith('socket_')}
raw_before=geometry_digest(raw);eyes_before=geometry_digest(eye)
image=next(n.image for n in body.data.materials[0].node_tree.nodes if n.type=='TEX_IMAGE')
pixels=np.array(image.pixels[:],dtype=np.float32).reshape(image.size[1],image.size[0],4)
# Find an existing broad yellow area; the v03 texture remains untouched.
choices=[]
for y in range(32,image.size[1]-32,16):
    for x in range(32,image.size[0]-32,16):
        patch=pixels[y-16:y+17,x-16:x+17,:3]
        c=patch.mean((0,1))
        if c[0]>.95 and .65<c[1]<.85 and c[2]<.18:
            choices.append((float(patch.std((0,1)).max()),x,y,c.tolist()))
assert choices
_,px,py,color=min(choices)
constant_uv=((px+.5)/image.size[0],(py+.5)/image.size[1])
proof=cap_lower(body,constant_uv=constant_uv);master_proof=cap_lower(master,detailed=True)
master.name='MASTER_SOURCE_DERIVED_V04'
body['modifications']='Footless rubber duck: v03 body above 130mm and its UVs/normals retained; local lower belly fairing between 77 and 130mm; both legs/feet removed; rounded closed lower body and flat contact base. Eyes and socket matrices unchanged.'
body['source_previous_blend']='assets/duck/blend/duck__v03.blend'
assert geometry_digest(raw)==raw_before and geometry_digest(eye)==eyes_before
assert sockets=={o.name:[list(row) for row in o.matrix_world] for o in bpy.data.objects if o.name.startswith('socket_')}
body.data.calc_loop_triangles();eye.data.calc_loop_triangles()
assert len(body.data.loop_triangles)+len(eye.data.loop_triangles)<=7296
for o in [raw,master]:o.hide_render=True;o.hide_set(True)
for im in bpy.data.images:
    if im.packed_file:
        old=im.filepath
        if old and Path(old).is_absolute():old=bpy.path.relpath(old,start=str(BLEND.parent))
        im.filepath='//'+'x'*1000;im.filepath=old
        for packed in im.packed_files:packed.filepath='//'+'x'*1000;packed.filepath=old
for screen in bpy.data.screens:
    for area in screen.areas:
        for space in area.spaces:
            if space.type=='FILE_BROWSER' and space.params:
                space.params.directory=b'/'*1023;space.params.directory=b'//'
bpy.context.scene.render.filepath='//'
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND),compress=True)
bpy.ops.object.select_all(action='DESELECT')
for o in [root,body,eye]+[bpy.data.objects[n] for n in sockets]:o.hide_set(False);o.select_set(True)
GLB=CAND/'duck.glb'
bpy.ops.export_scene.gltf(filepath=str(GLB),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_copyright='Meshy 6 Lite output, CC BY 4.0; Blender modifications by Sento Duck Explorer')
subprocess.run(['python3','scripts/sanitize-glb-png.py',str(GLB)],check=True)
report={'revision':'v04','method':'Local source-derived leg removal and rounded lower-body closure; upper v03 runtime surface retained',
        'previous_blend_sha256':sha(SOURCE),'source_sha256':sha(ROOT/'assets/duck/gen/duck__meshy6lite_raw_v01.glb'),
        'body_edit':proof,'detailed_master_edit':master_proof,'eyes_geometry_unchanged':True,'sockets_unchanged':True,
        'raw_geometry':raw_before,'source_geometry_unchanged':True,'sockets_blender_matrices':sockets,
        'unchanged_texture_pixel_sha256':hashlib.sha256(pixels.tobytes()).hexdigest(),
        'cap_uv_in_existing_yellow_patch':list(constant_uv),'cap_patch_rgb':color,
        'glb_sha256':sha(GLB),'glb_bytes':GLB.stat().st_size,'blend_sha256':sha(BLEND)}
# Fresh import is the geometry/rendering authority.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(GLB))
meshes=[o for o in bpy.data.objects if o.type=='MESH']
report['reimported_meshes']={o.name:topology(o) for o in meshes}
report['triangles']=sum(v['triangles'] for v in report['reimported_meshes'].values())
report['material_count']=len({m for o in meshes for m in o.data.materials})
report['texture_count']=len([im for im in bpy.data.images if im.type=='IMAGE'])
assert report['triangles']<=7296
sc=bpy.context.scene;sc.render.engine='CYCLES';sc.cycles.samples=24;sc.cycles.use_denoising=True
sc.render.resolution_x=sc.render.resolution_y=640;sc.render.resolution_percentage=100;sc.render.image_settings.file_format='PNG';sc.view_settings.view_transform='AgX'
w=bpy.data.worlds.new('Fixed neutral world');w.use_nodes=True;w.node_tree.nodes['Background'].inputs[0].default_value=(.095,.095,.095,1);w.node_tree.nodes['Background'].inputs[1].default_value=.45;sc.world=w
target=Vector((0,-.01,.16));span=.32
for pos,power,size in [((1.8,-2.6,3),300,2.1),((-2.5,-1,1.6),110,2.2),((.5,2.2,2.4),220,1.5)]:
    bpy.ops.object.light_add(type='AREA',location=target+Vector(pos)*span);l=bpy.context.object;l.data.energy=power*span*span;l.data.size=size*span;l.rotation_euler=(target-l.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=span*1.4;sc.camera=cam
for view,d in [('front',(0,-1,.12)),('threequarter',(.7,-1,.3)),('side',(1,0,.12)),('back',(0,1,.2)),('underside',(.4,-1,-.65))]:
    cam.location=target+Vector(d).normalized()*2;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();sc.render.filepath=str(OUT/f'{view}.png');bpy.ops.render.render(write_still=True);strip_png(sc.render.filepath)
# Geometry/no-texture underside reveals the closure independently of color.
for obj in meshes:
    for mat in obj.data.materials:
        bsdf=mat.node_tree.nodes.get('Principled BSDF')
        for link in list(bsdf.inputs['Base Color'].links):mat.node_tree.links.remove(link)
        bsdf.inputs['Base Color'].default_value=(.5,.5,.5,1)
sc.render.filepath=str(OUT/'underside_clay.png');bpy.ops.render.render(write_still=True);strip_png(sc.render.filepath)
cam.location=target+Vector((1,0,.12)).normalized()*2;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
sc.render.filepath=str(OUT/'side_clay.png');bpy.ops.render.render(write_still=True);strip_png(sc.render.filepath)
(OUT/'measurements.json').write_text(json.dumps(report,indent=2)+'\n')
print('V04_DONE',json.dumps({k:report[k] for k in ['triangles','glb_sha256','glb_bytes','blend_sha256']}),flush=True)
