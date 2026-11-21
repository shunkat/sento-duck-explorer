"""Source-sampled quad retopology of the real Meshy stool, with editable master.

Run from the repository root with Blender --background --python this_file.
No raw, v01, public model, manifest or ledger is modified.
"""
import bpy
import bmesh
import math
import json
import hashlib
import statistics
import struct
import re
import sys
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path.cwd()
ASSET = ROOT / 'assets/bath_stool'
OUT = ASSET / 'blend'
assert not ('--archfix' in sys.argv and '--legacy-arch' in sys.argv)
ARCHFIX = '--legacy-arch' not in sys.argv
VARIANT = 'legacy-arch' if not ARCHFIX else ('archfix' if '--archfix' in sys.argv else None)
QUALITY = ASSET / (f'quality/v02/iterations/{VARIANT}' if VARIANT else 'quality/v02')
EXPORT = ROOT / (f'.local/quality-v02/candidates/bath_stool_{VARIANT}.glb' if VARIANT else '.local/quality-v02/candidates/bath_stool.glb')
BLEND = OUT / (f'bath_stool__{VARIANT}_v02.blend' if VARIANT else 'bath_stool__v02.blend')
RAW = ASSET / 'gen/bath_stool__meshy6lite_raw_v01.glb'
QUALITY.mkdir(parents=True, exist_ok=True)
EXPORT.parent.mkdir(parents=True, exist_ok=True)


def activate(o):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o


def hide(o):
    o.hide_render = True
    o.hide_set(True)


def collection_for(o,name):
    c=bpy.data.collections.get(name)
    if c is None:
        c=bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
    for old in list(o.users_collection):old.objects.unlink(o)
    c.objects.link(o)


def bounds(o):
    pts = [o.matrix_world @ v.co for v in o.data.vertices]
    return [[min(p[i] for p in pts) for i in range(3)],
            [max(p[i] for p in pts) for i in range(3)]]


def normalize(o):
    activate(o)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    lo, hi = bounds(o)
    for v in o.data.vertices:
        v.co = [(v.co[i]-lo[i])/(hi[i]-lo[i])*d-(d/2 if i<2 else 0)
                for i,d in enumerate((.36,.36,.30))]
    o.data.update()


def material():
    m = bpy.data.materials.new('Ivory satin moulded plastic')
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (.80,.70,.54,1)
    p.inputs['Roughness'].default_value = .32
    return m


def smooth_series(a, repeats=1):
    for _ in range(repeats):
        a = [(a[max(0,i-1)]+6*a[i]+a[min(len(a)-1,i+1)])/8
             for i in range(len(a))]
    return a


def arch_blend(a,z):
    # Preserve feet and the already smooth front/back opening. Only the
    # side-arch shoulders need the corrected wall correspondence.
    height=max(0,min(1,(z-.12)/.06));height=height*height*(3-2*height)
    angle=max(0,min(1,(45-math.degrees(a))/20));angle=angle*angle*(3-2*angle)
    return height*angle


def components(bm, height=None):
    remaining = {v for v in bm.verts if height is None or v.co.z < height}
    count = 0
    while remaining:
        count += 1
        queue = [remaining.pop()]
        while queue:
            for e in queue.pop().link_edges:
                for v in e.verts:
                    if v in remaining:
                        remaining.remove(v)
                        queue.append(v)
    return count


def strip_png_metadata(path):
    data=path.read_bytes()
    assert data[:8]==b'\x89PNG\r\n\x1a\n'
    result=data[:8];offset=8;removed=[]
    while offset<len(data):
        size=struct.unpack('>I',data[offset:offset+4])[0]
        kind=data[offset+4:offset+8]
        end=offset+size+12
        if kind in (b'tEXt',b'zTXt',b'iTXt',b'eXIf'):
            removed.append(kind.decode())
        else:result+=data[offset:end]
        offset=end
    path.write_bytes(result)
    return removed


def audit_existing():
    stats=json.loads((QUALITY/'measurements.json').read_text())
    assert stats['sha256']==hashlib.sha256(EXPORT.read_bytes()).hexdigest()
    blend=BLEND
    bpy.ops.wm.open_mainfile(filepath=str(blend))
    stored=bpy.data.objects['SOURCE_RAW_UNMODIFIED']
    snapshot=([tuple(v.co) for v in stored.data.vertices],
              [tuple(p.vertices) for p in stored.data.polygons],
              [tuple(row) for row in stored.matrix_world])
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(RAW))
    fresh=next(o for o in bpy.data.objects if o not in before and o.type=='MESH')
    raw_preserved=snapshot==([tuple(v.co) for v in fresh.data.vertices],
              [tuple(p.vertices) for p in fresh.data.polygons],
              [tuple(row) for row in fresh.matrix_world])
    assert raw_preserved
    # Save an audit copy only, since the actual deliverable is Zstandard
    # compressed. The deliverable is never rewritten by this audit.
    bpy.ops.wm.open_mainfile(filepath=str(blend))
    temporary=QUALITY/'metadata-audit-uncompressed.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(temporary),compress=False,copy=True)
    patterns={'private_home_path':rb'/(?:Users|home)/[^/\x00\s]+/',
              'email':rb'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}',
              'common_token_prefix':rb'(?:github_pat_|ghp_|sk-proj-)[A-Za-z0-9_-]{10,}'}
    audit=[]
    for label,path in [('blend_decompressed',temporary),('candidate_glb',EXPORT),
                       ('comparison_high_glb',QUALITY/'comparison-high.glb')]:
        data=path.read_bytes()
        findings=[name for name,pattern in patterns.items() if re.search(pattern,data)]
        audit.append({'artifact':label,'finding_categories':findings})
        assert not findings,(label,findings)
    temporary.unlink()
    for backup in (BLEND.with_suffix('.blend1'),QUALITY/'metadata-audit-uncompressed.blend1'):
        if backup.exists():backup.unlink()
    pngs=[]
    for pattern in ('reimported-*.png','comparison-high-*.png'):
        for path in sorted(QUALITY.glob(pattern)):
            removed=strip_png_metadata(path)
            data=path.read_bytes();offset=8;metadata=b''
            while offset<len(data):
                size=struct.unpack('>I',data[offset:offset+4])[0]
                kind=data[offset+4:offset+8]
                if kind!=b'IDAT':metadata+=data[offset+8:offset+8+size]
                offset+=size+12
            # Compressed pixel bytes can accidentally match email regexes;
            # inspect structured metadata, not IDAT as if it were text.
            findings=[name for name,pattern in patterns.items() if re.search(pattern,metadata)]
            assert not findings,(path.name,findings)
            pngs.append({'file':path.name,'removed_metadata_chunks':removed,'finding_categories':findings,
                         'scan_scope':'PNG metadata chunks; compressed pixel IDAT is not interpreted as text'})
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(EXPORT))
    low=next(o for o in bpy.context.scene.objects if o.type=='MESH')
    low.data.calc_loop_triangles()
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(QUALITY/'comparison-high.glb'))
    high=next(o for o in bpy.data.objects if o not in before and o.type=='MESH')
    high.data.calc_loop_triangles()
    dg=bpy.context.evaluated_depsgraph_get()
    high_tree=BVHTree.FromObject(high,dg)
    low_tree=BVHTree.FromObject(low,dg)
    def samples(o):
        points=[v.co.copy() for v in o.data.vertices]
        points += [sum((o.data.vertices[i].co for i in t.vertices),Vector())/3 for t in o.data.loop_triangles]
        return points
    def distance_summary(points,tree):
        values=sorted(tree.find_nearest(p)[3] for p in points)
        return {'sample_count':len(values),'mean_m':statistics.mean(values),
                'p95_m':values[int((len(values)-1)*.95)],'max_m':values[-1]}
    deviation={'method':'Bidirectional vertices and triangle-centroid nearest-surface samples; not a continuous Hausdorff bound or reference-image fidelity score',
               'high_to_runtime':distance_summary(samples(high),low_tree),
               'runtime_to_high':distance_summary(samples(low),high_tree)}
    drain_rays=[]
    for x,y in [(-.025,0),(0,0),(.025,0),(0,-.008),(0,.008)]:
        drain_rays.append({'xy_m':[x,y], 'clear_down':not low.ray_cast(Vector((x,y,.4)),Vector((0,0,-1)))[0],
                           'clear_up':not low.ray_cast(Vector((x,y,-.1)),Vector((0,0,1)))[0]})
    assert all(r['clear_down'] and r['clear_up'] for r in drain_rays)
    stats.update({'blend_sha256':hashlib.sha256(blend.read_bytes()).hexdigest(),
        'raw_mesh_and_transform_preserved_exactly':raw_preserved,
        'reimport_has_custom_normals':bool(low.data.has_custom_normals),
        'drain_rays':drain_rays,'comparison_high_deviation':deviation,
        'candidate_trials':[
            {'triangles':19968,'decision':'rejected','reason':'Fixed polar columns undersampled steep arch flanks; visible pinching at foot and arch'},
            {'triangles':19968,'decision':'comparison only','reason':'Arc-length lower-outline columns improved shape, but too dense for repeated runtime use'},
            {'triangles':9728,'decision':'rejected','reason':'Reduced structured cage lost useful foot/arch curvature while remaining above scene budget'},
            {'triangles':4658,'decision':'rejected','reason':'Unprotected planar merging damaged feature contours and caused broad triangular seat shading'},
            {'triangles':4724,'decision':'rejected for scene budget','reason':'Feature-loop protection improved shape but total scene with the selected basin exceeded 60000 by 146 triangles'},
            {'triangles':4662,'decision':'rejected after fixed-lighting review','reason':'Side-arch shoulder crease remained in the detailed source-derived mesh'},
            {'triangles':4596,'decision':'rejected after independent visual review','reason':'Extending the arch wall fit down the whole leg changed the previously rounded feet'},
            {'triangles':stats['triangles'],'decision':'selected local finishing candidate; final game view pending','reason':'Local side-arch correction preserves the lower feet; feature loops retained and planar regions simplified within the shared scene budget'}]})
    if ARCHFIX:
        before=set(bpy.data.objects)
        baseline_path=ASSET/'quality/v02/iterations/arch-before/comparison-high.glb'
        bpy.ops.import_scene.gltf(filepath=str(baseline_path))
        baseline=next(o for o in bpy.data.objects if o not in before and o.type=='MESH')
        baseline_tree=BVHTree.FromObject(baseline,bpy.context.evaluated_depsgraph_get())
        stats['local_arch_correction']={
            'baseline_runtime_sha256':'0f9c82e8e49d9982cffaf2dda4e6b0eeec3cedb01c370016bd783d7b8fbfdb21',
            'diagnosis':'Side-arch shoulder crease also appears in the detailed source-derived mesh before simplification',
            'method':'Fit outer taper from raw sections at z=.245 and .270; use measured arch/foot wall thickness; blend only side-arch shoulder corrections over z=.12 to .18 and angles 25 to 45 degrees',
            'rejected_trial':'Extending the wall fit down all legs changed the feet; rejected after independent visual review',
            'detailed_feet_under_8cm_to_baseline':distance_summary([v.co.copy() for v in high.data.vertices if v.co.z<.08],baseline_tree),
            'detailed_lower_legs_under_12cm_to_baseline':distance_summary([v.co.copy() for v in high.data.vertices if v.co.z<.12],baseline_tree),
            'limitation':'Local corrections are reference-informed shape decisions, not recovered manufacturing geometry'}
    (QUALITY/'measurements.json').write_text(json.dumps(stats,indent=2)+'\n')
    (QUALITY/'metadata-audit.json').write_text(json.dumps({'result':'PASS','scope':'Private home paths, email-like strings and common token prefixes; heuristic, not exhaustive',
        'binary_artifacts':audit,'pngs':pngs,'raw_preserved_exactly':raw_preserved,
        'candidate_sha256':stats['sha256'],'blend_sha256':stats['blend_sha256']},indent=2)+'\n')
    print('V02_AUDIT',json.dumps({'sha256':stats['sha256'],'raw_preserved_exactly':raw_preserved,
        'reimport_has_custom_normals':stats['reimport_has_custom_normals'],'deviation':deviation,'metadata':'PASS'}),flush=True)


if '--audit' in sys.argv:
    audit_existing()
    raise SystemExit(0)


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(RAW))
raw = next(o for o in bpy.context.scene.objects if o.type=='MESH')
raw.name = 'SOURCE_RAW_UNMODIFIED'
raw['source_file'] = 'assets/bath_stool/gen/bath_stool__meshy6lite_raw_v01.glb'
raw['source_sha256'] = hashlib.sha256(RAW.read_bytes()).hexdigest()
collection_for(raw,'SOURCE • unmodified generated input')
source = raw.copy()
source.data = raw.data.copy()
bpy.context.collection.objects.link(source)
source.name = 'SOURCE_NORMALIZED_FOR_RADIAL_MEASUREMENTS'
hide(raw)
normalize(source)
tree = BVHTree.FromObject(source,bpy.context.evaluated_depsgraph_get())


def radial(a,z,outer):
    d = Vector((math.cos(a),math.sin(a),0))
    p,_,_,_ = tree.ray_cast(d*.40+Vector((0,0,z)) if outer else Vector((0,0,z)), -d if outer else d, .40)
    return math.hypot(p.x,p.y) if p else None


def symmetric_radius(a,z,outer):
    values = [radial(t,z,outer) for t in (a,-a,math.pi-a,math.pi+a)]
    values = [v for v in values if v is not None]
    return statistics.median(values) if values else None


def bottom(a):
    found=[]
    # The first radial intersection identifies the original lower outline.
    # A 0.5 mm scan is followed by bisection, independently in four quadrants.
    for t in (a,-a,math.pi-a,math.pi+a):
        for k in range(1,500):
            z=k*.0005
            if radial(t,z,True) is not None:
                low,high=z-.0005,z
                for _ in range(10):
                    mid=(low+high)/2
                    if radial(t,mid,True) is None: low=mid
                    else: high=mid
                found.append(high)
                break
    return statistics.median(found)


# Put control columns at equal arc-length intervals along the source lower
# outline, so nearly vertical arch flanks get enough samples. Uniform polar
# angles under-sample these regions and caused the rejected first trial's kinks.
dense_angles=[math.radians(i*.5) for i in range(181)]
dense_bottom=smooth_series([bottom(a) for a in dense_angles],5)
dense_radius=[]
for a,z in zip(dense_angles,dense_bottom):
    zs=bottom(a)+.009
    ro=symmetric_radius(a,zs,True)
    ri=symmetric_radius(a,zs,False)
    dense_radius.append((ro+ri)/2)
dense_radius=smooth_series(dense_radius,5)
dense_points=[Vector((r*math.cos(a),r*math.sin(a),z))
              for a,r,z in zip(dense_angles,dense_radius,dense_bottom)]
arc=[0]
for p,q in zip(dense_points,dense_points[1:]):arc.append(arc[-1]+(p-q).length)
ANGLES=[]
for k in range(25):
    target=arc[-1]*k/24
    i=next((i for i in range(1,len(arc)) if arc[i]>=target),len(arc)-1)
    t=(target-arc[i-1])/(arc[i]-arc[i-1])
    ANGLES.append(math.degrees(dense_angles[i-1]*(1-t)+dense_angles[i]*t))
ANGLES[0]=0;ANGLES[-1]=90
for deg in range(5,90,5):
    if dense_bottom[deg*2]<.012 and min(abs(deg-a) for a in ANGLES)>.8:
        ANGLES.append(float(deg))
ANGLES.sort()
angles=[math.radians(a) for a in ANGLES]
bottom_raw=[bottom(a) for a in angles]
bottom_profile=[]
for deg in ANGLES:
    index=min(179,int(deg*2));t=deg*2-index
    bottom_profile.append(dense_bottom[index]*(1-t)+dense_bottom[index+1]*t)
# Keep the source feet's flat contacts; remove only the small generated lips.
bottom_profile=[0 if z < .008 else z for z in bottom_profile]
hole_raw=[symmetric_radius(a,.275,False) for a in angles]
hole=smooth_series(hole_raw,2)
measurements=[]
profiles=[]
if ARCHFIX:
    wall_samples=[]
    for a,z in zip(angles,bottom_raw):
        outer=symmetric_radius(a,z+.009,True)
        inner=symmetric_radius(a,z+.009,False)
        if outer is not None and inner is not None:wall_samples.append((z,outer-inner))
    foot_thickness=statistics.median(w for z,w in wall_samples if z<.015)
    arch_thickness=statistics.median(w for z,w in wall_samples if z>.17)
for j,a in enumerate(angles):
    z0=bottom_profile[j]
    source_z0=bottom_raw[j]
    h=hole[j]
    raw_h=hole_raw[j]
    r29=symmetric_radius(a,.290,True)
    r27=symmetric_radius(a,.270,True)
    r245=symmetric_radius(a,.245,True)
    wall_slope=(r27-r245)/(.270-.245)
    # Source-derived radial side wall and arch. Do not wrap the smoothed top
    # back to the generated concentric ridges.
    side=[]
    for t in (.85,.55,.22):
        z=z0+.009+(.245-z0-.009)*t
        sample_z=source_z0+.009+(.245-source_z0-.009)*t
        r=symmetric_radius(a,sample_z,True)
        if r is None: r=r245
        if ARCHFIX:
            w=arch_blend(a,z)
            r=r*(1-w)+(r245+wall_slope*(z-.245))*w
        side.append((r,z))
    bz=z0+.009
    ro=symmetric_radius(a,source_z0+.009,True)
    ri=symmetric_radius(a,source_z0+.009,False)
    if ro is None or ri is None:
        bz=z0+.012
        ro=symmetric_radius(a,source_z0+.012,True)
        ri=symmetric_radius(a,source_z0+.012,False)
    if ro is None or ri is None: raise RuntimeError(('missing section',ANGLES[j],z0))
    if ri < .065: raise RuntimeError(('wrong underside component',ANGLES[j],z0,ri))
    if ARCHFIX:
        # Near a rounded arch edge, the first source radial hit is already
        # turning around the lip. Treating it as the main outer wall bends
        # the wall inward at the arch shoulders. Extend the stable source
        # wall section instead, then round it into the retained inner wall.
        fitted_ro=r245+wall_slope*(bz-.245)
        t=max(0,min(1,z0/.19));t=t*t*(3-2*t)
        fitted_ri=fitted_ro-(foot_thickness*(1-t)+arch_thickness*t)
        w=arch_blend(a,bz)
        ro=ro*(1-w)+fitted_ro*w
        ri=ri*(1-w)+fitted_ri*w
    ri235=symmetric_radius(a,.235,False)
    if ri235 is None or ri235<.065: ri235=ri
    inner=[]
    for t in (.22,.55,.85):
        z=z0+.009+(.235-z0-.009)*t
        sample_z=source_z0+.009+(.235-source_z0-.009)*t
        r=symmetric_radius(a,sample_z,False)
        if r is None or r < .065: r=ri
        if ARCHFIX:
            w=arch_blend(a,z)
            r=r*(1-w)+(fitted_ri+(ri235-fitted_ri)*t)*w
        inner.append((r,z))
    # The source drain is a useful through-slot; preserve its measured contour.
    # The top/underside support loops replace only the false raised seat rings.
    profile=[
        (h,.262), (h,.290), (h+.0018,.296), (h+.005,.299),
        (h+(r29-h)*.48,.299), (r29-.010,.299),
        (r29-.003,.296), (r29+.002,.288), (r27,.270), (r245,.245),
        *side,
        (ro,bz), (ro-(ro-ri)*.16,z0+.003),
        ((ro+ri)/2,z0), (ri+(ro-ri)*.16,z0+.003), (ri,bz),
        *inner,
        (ri235,.235), (ri235-.010,.250),
        (h+(ri235-h)*.52,.253), (h+.005,.253), (h+.0015,.256),
    ]
    profiles.append(profile)
    measurements.append({'angle_degrees':ANGLES[j],'source_min_height':bottom_raw[j],
        'regularized_min_height':z0,'source_hole_radius_at_z_275':raw_h,
        'regularized_hole_radius':h,'source_outer_radius_at_z_290':r29,
        'source_outer_radius_at_z_245':r245,'source_inner_radius_at_z_235':ri235})
    if ARCHFIX:
        measurements[-1]['outer_wall_taper_from_stable_source_sections']=wall_slope
        measurements[-1]['outer_arch_radius_corrected_from_wall_taper']=ro
        measurements[-1]['measured_foot_wall_thickness_m']=foot_thickness
        measurements[-1]['measured_arch_wall_thickness_m']=arch_thickness

# One restrained angular averaging pass removes generated sampling ripples;
# semantic profile rows keep seat edge, slot and arch support loops separate.
for p in range(len(profiles[0])):
    radii=smooth_series([row[p][0] for row in profiles],1)
    for j,r in enumerate(radii): profiles[j][p]=(r,profiles[j][p][1])

verts=[]
P=len(profiles[0])
for a,profile in zip(angles,profiles):
    for r,z in profile:
        verts.append((r*math.cos(a),r*math.sin(a),z))
faces=[]
for j in range(len(angles)-1):
    for p in range(P):
        q=(p+1)%P
        faces.append((j*P+p,j*P+q,(j+1)*P+q,(j+1)*P+p))
mesh=bpy.data.meshes.new('Source radial sections with feature support loops')
mesh.from_pydata(verts,[],faces)
mesh.update()
feature=mesh.attributes.new('quality_feature_loop','FLOAT','EDGE')
for e in mesh.edges:
    va,vb=e.vertices
    pa,pb=va%P,vb%P
    if pa==pb and (pa in (3,4,6,15) or (pa==14 and max(verts[va][2],verts[vb][2])<.025)):
        feature.data[e.index].value=1
master=bpy.data.objects.new('bath_stool_source_derived_quad_master',mesh)
bpy.context.collection.objects.link(master)
bm=bmesh.new();bm.from_mesh(mesh)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
bm.to_mesh(mesh);bm.free()
master.data.materials.append(material())
for p in mesh.polygons:p.use_smooth=True
mirror=master.modifiers.new('Symmetric measured source quadrants','MIRROR')
mirror.use_axis=(True,True,False)
mirror.use_clip=True
mirror.merge_threshold=.00001
sub=master.modifiers.new('Designed support loops preserve seat slot and arch','SUBSURF')
sub.subdivision_type='CATMULL_CLARK'
sub.levels=1
sub.render_levels=2
sub.quality=4
master['source_file']='assets/bath_stool/gen/bath_stool__meshy6lite_raw_v01.glb'
master['source_sha256']=hashlib.sha256(RAW.read_bytes()).hexdigest()
master['method']='Raw radial ray intersections at named heights; median across quadrants; source-derived quad retopology, local seat-ring correction, support loops, Mirror and Subdivision'
master['not_claimed']='Source distance does not prove reference fidelity. Invisible underside remains an approximation.'
hide(source)
collection_for(source,'SOURCE • measured normalized working copy')
collection_for(master,'MASTER • editable source-derived quad topology')

# First retain the detailed comparison surface. The experimental runtime cage drops
# redundant near-collinear rows and samples fewer arc-length columns, instead
# of collapsing arbitrary triangles or remeshing finished feature contours.
activate(master)
depsgraph=bpy.context.evaluated_depsgraph_get()
high_mesh=bpy.data.meshes.new_from_object(master.evaluated_get(depsgraph))
high=bpy.data.objects.new('bath_stool_comparison_high',high_mesh)
bpy.context.collection.objects.link(high)
normalize(high)
for v in high.data.vertices:
    if v.co.z<.0018:v.co.z=0
high.data.calc_loop_triangles()
HIGH_TRIANGLES=len(high.data.loop_triangles)
activate(high)
bpy.ops.export_scene.gltf(filepath=str(QUALITY/'comparison-high.glb'),export_format='GLB',use_selection=True,
    export_yup=True,export_extras=False,
    export_copyright='Meshy 6 Lite output, CC BY 4.0; Blender modifications by Sento Duck Explorer contributors')
hide(high)
collection_for(high,'MASTER • evaluated comparison surface')
columns=[round(i*(len(angles)-1)/16) for i in range(17)]
rows=[i for i in range(P) if i not in (4,9,10,12,18,20,23)]
lowverts=[verts[c*P+p] for c in columns for p in rows]
LP=len(rows)
lowfaces=[]
for j in range(len(columns)-1):
    for p in range(LP):
        q=(p+1)%LP
        lowfaces.append((j*LP+p,j*LP+q,(j+1)*LP+q,(j+1)*LP+p))
lowmesh=bpy.data.meshes.new('Runtime cage with redundant planar and straight rows removed')
lowmesh.from_pydata(lowverts,[],lowfaces);lowmesh.update()
low=bpy.data.objects.new('bath_stool_runtime_control_cage',lowmesh)
bpy.context.collection.objects.link(low)
low.data.materials.append(master.data.materials[0])
bm=bmesh.new();bm.from_mesh(lowmesh);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(lowmesh);bm.free()
for p in lowmesh.polygons:p.use_smooth=True
lm=low.modifiers.new('Symmetric measured source quadrants','MIRROR')
lm.use_axis=(True,True,False);lm.use_clip=True;lm.merge_threshold=.00001
ls=low.modifiers.new('Runtime supported subdivision','SUBSURF')
ls.levels=1;ls.render_levels=1;ls.quality=4
bpy.context.view_layer.update()
# The lower cage was useful as a density trial, but arc silhouettes benefit
# more from retaining the full measured columns. Dissolve only near-planar
# regions of the detailed evaluated mesh, and transfer its exact shading.
export_mesh=high.data.copy()
candidate=bpy.data.objects.new('bath_stool',export_mesh)
bpy.context.collection.objects.link(candidate)
hide(master)
hide(low)
collection_for(low,'RUNTIME • reduced structured control cage')
# Match the original runtime envelope and level the four true contact patches.
activate(candidate)
# Preserve named feature loops propagated through subdivision, rather than
# freezing whole dense surface patches. This protects both the negative-space
# silhouette and the top annulus against large non-planar triangulated faces.
feature=candidate.data.attributes.get('quality_feature_loop')
for edge in candidate.data.edges:
    if feature and feature.data[edge.index].value>.5:
        edge.use_edge_sharp=True
print('PROTECTED_EDGES',sum(e.use_edge_sharp for e in candidate.data.edges),flush=True)
planar=candidate.modifiers.new('Curvature limited planar region simplification','DECIMATE')
planar.decimate_type='DISSOLVE'
planar.use_dissolve_boundaries=False
planar.delimit={'NORMAL','SHARP'}
PLANAR_ANGLE=None
for angle in (6.5,6.6,6.7,6.8,6.9,7,7.1,7.2,7.3,7.5,8,8.5,9,9.5,10,11,12):
    planar.angle_limit=math.radians(angle)
    ev=candidate.evaluated_get(bpy.context.evaluated_depsgraph_get())
    trial=ev.to_mesh();trial.calc_loop_triangles()
    count=len(trial.loop_triangles);ev.to_mesh_clear()
    print('PROTECTED_PLANAR_TRIAL',angle,count,flush=True)
    if count<=4690:
        PLANAR_ANGLE=angle
        break
assert PLANAR_ANGLE is not None, 'Protected contours need a larger budget or different local retopology'
bpy.ops.object.modifier_apply(modifier=planar.name)
for e in candidate.data.edges:e.use_edge_sharp=False
tri=candidate.modifiers.new('Stable runtime triangulation','TRIANGULATE')
bpy.ops.object.modifier_apply(modifier=tri.name)
for p in candidate.data.polygons:p.use_smooth=True
normals=candidate.modifiers.new('Shading from the supported detailed surface','DATA_TRANSFER')
normals.object=high
normals.use_loop_data=True
normals.data_types_loops={'CUSTOM_NORMAL'}
normals.loop_mapping='POLYINTERP_NEAREST'
bpy.ops.object.modifier_apply(modifier=normals.name)
candidate['source_file']='assets/bath_stool/gen/bath_stool__meshy6lite_raw_v01.glb'
candidate['asset_license']='CC-BY-4.0'
candidate['attribution']='Meshy 6 Lite; Blender modifications by Sento Duck Explorer'
candidate['modifications']='Source-sampled quad retopology; mirrored measured sections; seat ridges removed; supported seat slot and arch contours; subdivision; level feet; curvature-limited planar dissolve; detail-master normal transfer; one plastic material'
activate(candidate)
bpy.ops.export_scene.gltf(filepath=str(EXPORT),export_format='GLB',use_selection=True,
    export_yup=True,export_extras=True,
    export_copyright='Meshy 6 Lite output, CC BY 4.0; Blender modifications by Sento Duck Explorer contributors')
bpy.context.scene.render.filepath='//'
bpy.context.scene.unit_settings.system='METRIC'
for c in bpy.data.collections:
    if c.name.startswith('SOURCE'):
        c.hide_render=True
        c.hide_viewport=True
for screen in bpy.data.screens:
    for area in screen.areas:
        for space in area.spaces:
            if space.type=='FILE_BROWSER' and space.params is not None:
                space.params.directory=b'/'*1023
                space.params.directory=b'//'
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND),compress=True)
(QUALITY/'source-sections.json').write_text(json.dumps({'source_sha256':hashlib.sha256(RAW.read_bytes()).hexdigest(),
    'method':'median radial intersections in four quadrants after metric normalization',
    'sections':measurements},indent=2)+'\n')

# The validation and renders use a fresh GLB import, not the editable source.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(EXPORT))
obj=next(o for o in bpy.context.scene.objects if o.type=='MESH')
obj.data.calc_loop_triangles()
bm=bmesh.new();bm.from_mesh(obj.data)
lo,hi=bounds(obj)
stats={'revision':'v02-archfix' if ARCHFIX else 'v02','blender_version':bpy.app.version_string,
       'source_sha256':hashlib.sha256(RAW.read_bytes()).hexdigest(),
       'comparison_high_sha256':hashlib.sha256((QUALITY/'comparison-high.glb').read_bytes()).hexdigest(),
       'comparison_high_triangles':HIGH_TRIANGLES,
       'planar_dissolve_max_angle_degrees':PLANAR_ANGLE,
       'sha256':hashlib.sha256(EXPORT.read_bytes()).hexdigest(),
       'triangles':len(obj.data.loop_triangles),'vertices':len(obj.data.vertices),
       'dimensions_gltf_m':[hi[0]-lo[0],hi[2]-lo[2],hi[1]-lo[1]],
       'bounds_blender_zup_m':[lo,hi],
       'nonmanifold_edges':sum(not e.is_manifold for e in bm.edges),
       'degenerate_faces':sum(f.calc_area()<1e-12 for f in bm.faces),
       'connected_components':components(bm),'separate_legs_below_14cm':components(bm,.14),
       'finite_vertices':all(math.isfinite(c) for v in obj.data.vertices for c in v.co),
       'center_drain_clear':not obj.ray_cast(Vector((0,0,.4)),Vector((0,0,-1)))[0],
       'signed_volume_m3':bm.calc_volume(signed=True),'glb_bytes':EXPORT.stat().st_size,
       'material_count':len(obj.data.materials),'texture_count':0,
       'foot_contact_heights_m':[min(v.co.z for v in obj.data.vertices if v.co.x*sx>0 and v.co.y*sy>0)
                                 for sx,sy in ((-1,-1),(-1,1),(1,-1),(1,1))]}
bm.free()
(QUALITY/'measurements.json').write_text(json.dumps(stats,indent=2)+'\n')
print('CANDIDATE_MEASUREMENTS',json.dumps(stats),flush=True)
assert stats['nonmanifold_edges']==0 and stats['degenerate_faces']==0
assert stats['finite_vertices'] and stats['center_drain_clear'] and stats['separate_legs_below_14cm']==4
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=32
scene.cycles.use_denoising=True
scene.render.resolution_x=768
scene.render.resolution_y=768
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.view_settings.view_transform='AgX'
world=bpy.data.worlds.new('Neutral studio')
world.use_nodes=True
world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.18,.21,.24,1)
world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.55
scene.world=world
for pos,energy,size in [((.6,-.8,.9),40,.75),((-.6,-.2,.5),22,.7),((0,.7,.6),35,.6),((0,-.5,-.5),10,.6)]:
    bpy.ops.object.light_add(type='AREA',location=pos)
    light=bpy.context.object;light.data.energy=energy;light.data.size=size
    light.rotation_euler=(Vector((0,0,.15))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add()
cam=bpy.context.object;cam.data.type='ORTHO';scene.camera=cam
target=Vector((0,0,.15))
for name,direction,scale in [('front',(0,-1,.08),.47),('left',(-1,-1,.7),.54),
        ('reference',(.28,-1,.58),.51),('top',(.15,-.3,1),.47),('underside',(.6,-1,-.8),.53)]:
    cam.location=target+Vector(direction).normalized()*1.5
    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.ortho_scale=scale
    scene.render.filepath=str(QUALITY/f'reimported-{name}.png')
    bpy.ops.render.render(write_still=True)
    strip_png_metadata(Path(scene.render.filepath))
hide(obj)
bpy.ops.import_scene.gltf(filepath=str(QUALITY/'comparison-high.glb'))
for name,direction,scale in [('front',(0,-1,.08),.47),('reference',(.28,-1,.58),.51),('underside',(.6,-1,-.8),.53)]:
    cam.location=target+Vector(direction).normalized()*1.5
    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.ortho_scale=scale
    scene.render.filepath=str(QUALITY/f'comparison-high-{name}.png')
    bpy.ops.render.render(write_still=True)
    strip_png_metadata(Path(scene.render.filepath))
print('V02_RENDER_COMPLETE',flush=True)
