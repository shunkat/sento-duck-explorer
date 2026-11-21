"""Author the LEVEL-aligned sento world; export/reimport for measured art QA.

Blender --background --python scripts/build-sento-environment.py
No gameplay, canonical character, or public registry files are changed.
"""
import bpy, bmesh, hashlib, json, math, random, runpy, sys
from pathlib import Path
from mathutils import Vector, Matrix
import numpy as np

ROOT = Path.cwd()
OUT = ROOT / 'assets/sento_environment'
BLEND = OUT / 'blend'
QA = OUT / 'quality'
CAND = ROOT / '.local/environment-refresh/world'
for path in (BLEND, QA, CAND, BLEND / 'textures'):
    path.mkdir(parents=True, exist_ok=True)
LAYOUT = json.loads((ROOT / '.local/environment-refresh/layout.json').read_text())
SANITIZE = runpy.run_path(str(ROOT / 'scripts/sanitize-glb-png.py'))['sanitize']
SHA = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
for path,digest in LAYOUT['source_files'].items():
    assert SHA(ROOT/path)==digest, 'Stale layout export: '+path
canonical_before={name:SHA(ROOT/'public/models'/(name+'.glb')) for name in
    ('duck','hat_sauna_duck','child','adult','bath_stool','wash_basin')}
RNG = random.Random(19)
bpy.ops.wm.read_factory_settings(use_empty=True)

def xyz(x, y, z):
    """Game +Y-up/+Z-map-down to Blender +Z-up/-Y-map-down."""
    return Vector((x, -z, y))

def activate(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.hide_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

root = bpy.data.objects.new('sento_environment', None)
bpy.context.collection.objects.link(root)
root['layout_sha256'] = LAYOUT['layout_sha256']
root['asset_id'] = 'sento_environment'
root['production_method'] = 'Direct Blender environment; explicit public geometry sources in quality/measurements.json; source-derived NPCs'
GROUPS = {}
for name in ('environment_static', 'environment_upper', 'environment_ceiling', 'sauna_door'):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.parent = root
    GROUPS[name] = obj
STATIC, UPPER, CEILING, DOOR = GROUPS.values()
MATS = {}
coverage = {}
public_uses = []
npc_slots = []
placement = None

def srgb(c):
    return c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4

def rgb(h):
    return tuple(srgb(((h >> s) & 255) / 255) for s in (16, 8, 0))

def material(name, color, rough=.7, metal=0, pattern=None, density=1):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*rgb(color), 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    mat['uv_density'] = density
    if pattern:
        n = 512
        yy, xx = np.mgrid[:n, :n]
        base = np.array([((color >> s) & 255) / 255 for s in (16, 8, 0)])
        pixels = np.tile(base, (n, n, 1))
        if pattern in ('tile', 'floor'):
            tile = n // 4
            edge = np.minimum.reduce([xx % tile, yy % tile, tile - 1 - xx % tile, tile - 1 - yy % tile])
            grout = np.clip((edge - 1) / 3, 0, 1)
            pixels *= .97 + .035 * np.sin((xx // tile) * 11 + (yy // tile) * 17)[..., None]
            if pattern == 'floor':
                accent = ((xx // tile) * 3 + (yy // tile) * 5) % 7 == 0
                pixels[accent] = np.array([.49, .65, .63])
            pixels = pixels * grout[..., None] + np.array([.68, .69, .64]) * (1 - grout[..., None])
        elif pattern == 'wood':
            grain = .025 * np.sin(xx * .30 + 1.9 * np.sin(yy * .015)) + .012 * np.sin(xx * .94 + yy * .028)
            pixels += grain[..., None]
            seam = xx % 128 < 2
            pixels[seam] *= .74
        elif pattern == 'stone':
            variation = .024 * np.sin(xx * .13 + np.sin(yy * .07)) + .015 * np.sin(xx * .63 + yy * .43)
            pixels += variation[..., None]
        rgba = np.ones((n, n, 4), dtype=np.float32)
        encoded = np.clip(pixels, 0, 1)
        rgba[..., :3] = np.where(encoded <= .04045, encoded / 12.92, ((encoded + .055) / 1.055) ** 2.4)
        image = bpy.data.images.new(name + '_basecolor', n, n, alpha=False)
        image.pixels.foreach_set(rgba.ravel())
        image.filepath_raw = str(BLEND / 'textures' / (name + '.png'))
        image.file_format = 'PNG'
        image.save()
        image.pack()
        tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = image
        mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    MATS[name] = mat
    return mat

material('warm_plaster', 0xeadfca)
material('ceramic_cream', 0xe5e0cb, .43, pattern='tile', density=1)
material('ceramic_teal', 0x729f9e, .40, pattern='tile', density=1)
material('bath_floor', 0xe5ddc7, .62, pattern='floor', density=.5)
material('cedar', 0xb88758, .67, density=1/1.89)
material('dark_cedar', 0x72513a, .7)
material('navy_cloth', 0x3e5269, .92)
material('rose_cloth', 0xb77475, .92)
material('brushed_metal', 0x9caeaa, .32, .65)
material('mirror_glass', 0xa8c2c5, .22, .75)
material('garden_stone', 0x93988a, .91)
material('sage_foliage', 0x687f54, .88)
material('straw', 0xcabb8a, .96, pattern='wood', density=5)

# Actual CC0 1K PBR source, not a procedural stand-in described as public art.
wood = MATS['cedar']; nodes=wood.node_tree.nodes; links=wood.node_tree.links
bsdf=nodes.get('Principled BSDF')
for role,suffix in [('diff','diff'),('normal','nor_gl'),('rough','rough')]:
    path=ROOT/'assets/public_sources/polyhaven/hinoki_planks'/f'hinoki_planks_{suffix}_1k.jpg'
    im=bpy.data.images.load(str(path));im.pack()
    if role!='diff':im.colorspace_settings.name='Non-Color'
    tex=nodes.new('ShaderNodeTexImage');tex.image=im
    if role=='normal':
        normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.45
        links.new(tex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])
    else:links.new(tex.outputs['Color'],bsdf.inputs['Base Color' if role=='diff' else 'Roughness'])
    public_uses.append({'kind':'texture','source_file':str(path.relative_to(ROOT)),'sha256':SHA(path),'material':'cedar','license':'CC0-1.0'})

def record(obj):
    if placement:
        coverage.setdefault(placement, {'status': 'authored', 'objects_before_batching': []})['objects_before_batching'].append(obj.name)
        obj['placement_id'] = placement
    return obj

def own(obj, group, mat=None):
    obj.parent = group
    if mat:
        obj.data.materials.clear()
        obj.data.materials.append(MATS[mat] if isinstance(mat, str) else mat)
    return record(obj)

def uv_project(obj):
    uv = obj.data.uv_layers.active or obj.data.uv_layers.new(name='UVMap')
    density = obj.data.materials[0].get('uv_density', 1) if obj.data.materials else 1
    for p in obj.data.polygons:
        axis = max(range(3), key=lambda i: abs(p.normal[i]))
        axes = ((1, 2), (0, 2), (0, 1))[axis]
        for li in p.loop_indices:
            v = obj.matrix_world @ obj.data.vertices[obj.data.loops[li].vertex_index].co
            uv.data[li].uv = (v[axes[0]] * density, v[axes[1]] * density)

def cube(name, box, bottom, height, mat, group=STATIC, bevel=0):
    x0, z0, x1, z1 = box
    if min(x1-x0, z1-z0, height) < .00001:
        return None
    bpy.ops.mesh.primitive_cube_add(size=1, location=xyz((x0+x1)/2, bottom+height/2, (z0+z1)/2))
    o = bpy.context.object
    o.name = name
    o.dimensions = (x1-x0, z1-z0, height)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    own(o, group, mat)
    if bevel:
        m = o.modifiers.new('Soft crafted edges', 'BEVEL')
        m.width = min(bevel, min(o.dimensions) * .24)
        m.segments = 1
        bpy.ops.object.modifier_apply(modifier=m.name)
        for p in o.data.polygons:
            p.use_smooth = True
        m = o.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
        m.keep_sharp = True
        bpy.ops.object.modifier_apply(modifier=m.name)
    if name.startswith('wall_') and name.endswith(('_upper','_cap','_skirting')):
        # These downward faces are entirely covered by the lower wall, upper
        # wall, or floor. Their external silhouettes and cutaway tops remain.
        bm=bmesh.new();bm.from_mesh(o.data)
        bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.normal.z < -.99],context='FACES_ONLY')
        bm.to_mesh(o.data);bm.free()
    uv_project(o)
    return o

def box_tuple(b):
    return b['minX'], b['minZ'], b['maxX'], b['maxZ']

def center(b):
    a = box_tuple(b) if isinstance(b, dict) else b
    return (a[0]+a[2])/2, (a[1]+a[3])/2

def split_cube(name, box, bottom, height, mat, bevel=0):
    top = bottom + height
    if bottom < 1:
        cube(name+'_lower', box, bottom, min(top, 1)-bottom, mat, STATIC, bevel)
    if top > 1:
        cube(name+'_upper', box, max(bottom, 1), top-max(bottom, 1), mat, UPPER, bevel)

def front_panel(name,box,bottom,height,mat,face_x=False):
    """A recessed door/mirror face; its unseen thickness is the existing carcass."""
    x0,z0,x1,z1=box
    for suffix,a,c,group in [('lower',bottom,min(bottom+height,1),STATIC),('upper',max(bottom,1),bottom+height,UPPER)]:
        if c<=a:continue
        points=[(x1,a,z1),(x1,a,z0),(x1,c,z0),(x1,c,z1)] if face_x else [(x0,a,z1),(x1,a,z1),(x1,c,z1),(x0,c,z1)]
        mesh=bpy.data.meshes.new(name+'_'+suffix);mesh.from_pydata([xyz(*p) for p in points],[],[(0,1,2,3)]);mesh.update()
        o=bpy.data.objects.new(name+'_'+suffix,mesh);bpy.context.collection.objects.link(o);own(o,group,mat);uv_project(o)

def rod(name, a, b, radius, mat, group=STATIC, sides=8):
    a, b = xyz(*a), xyz(*b)
    bpy.ops.mesh.primitive_cylinder_add(vertices=sides, radius=radius, depth=(b-a).length, location=(a+b)/2)
    o = bpy.context.object
    o.name = name
    o.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    own(o, group, mat)
    for p in o.data.polygons:
        p.use_smooth = len(p.vertices) == 4
    uv_project(o)
    return o

def frame(name, box, bottom, height, mat='cedar', group=STATIC, thick=.035):
    x0,z0,x1,z1=box
    if x1-x0 >= z1-z0:
        cube(name+'_left',(x0,z0,x0+thick,z1),bottom,height,mat,group,.01)
        cube(name+'_right',(x1-thick,z0,x1,z1),bottom,height,mat,group,.01)
        cube(name+'_top',(x0,z0,x1,z1),bottom+height-thick,thick,mat,group,.01)
        cube(name+'_bottom',(x0,z0,x1,z1),bottom,thick,mat,group,.01)
    else:
        cube(name+'_left',(x0,z0,x1,z0+thick),bottom,height,mat,group,.01)
        cube(name+'_right',(x0,z1-thick,x1,z1),bottom,height,mat,group,.01)
        cube(name+'_top',(x0,z0,x1,z1),bottom+height-thick,thick,mat,group,.01)
        cube(name+'_bottom',(x0,z0,x1,z1),bottom,thick,mat,group,.01)

def subtract(rect, cut):
    x0,z0,x1,z1=rect; a,b,c,d=cut
    a=max(a,x0); b=max(b,z0); c=min(c,x1); d=min(d,z1)
    if a>=c or b>=d:return [rect]
    return [r for r in [(x0,z0,x1,b),(x0,d,x1,z1),(x0,b,a,d),(c,b,x1,d)] if r[2]-r[0]>.0001 and r[3]-r[1]>.0001]

def ring(name, box, inner, bottom, height, mat, bevel=.014):
    """Four closed pieces leave a real open interior, not a solid bathtub box."""
    for i,rect in enumerate(subtract(box,inner)):
        cube(name+f'_{i}',rect,bottom,height,mat,STATIC,bevel)

# Floors: surface at Y=0, with recessed bath/channel beds instead of overlapping
# solid floor through the water. Excluded overlays remain the runtime's concern.
for i,z in enumerate(LAYOUT['zones']):
    placement=f'zones_{i:02d}'
    key=z['id']; box=box_tuple(z['box'])
    if key in ('splash','pond_goal'):
        coverage[placement]={'status':'independent_runtime_overlay'}
        continue
    if key in ('bathwater','narrow_hole','pond'):
        cube(key+'_recessed_bed',box,-.29,.06,'ceramic_teal' if key!='pond' else 'garden_stone')
        continue
    mat='bath_floor' if key=='bath' else 'cedar' if key in ('changing','reception','common','sauna_entry','sauna_crowd') else 'garden_stone'
    pieces=[box]
    if key=='bath':
        for water in LAYOUT['duckWater']:
            pieces=[piece for r in pieces for piece in subtract(r,box_tuple(water))]
    for j,p in enumerate(pieces):
        cube(key+f'_floor_{j}',p,-.10,.10,mat)

# Two honest cutaway levels; no runtime flattening of architectural parts.
for i,b in enumerate(LAYOUT['structural_walls']):
    placement=f'structural_walls_{i:02d}'
    x0,z0,x1,z1=box_tuple(b)
    sections=[(x0,z0,x1,z1)]
    if x0<12<x1:sections=[(x0,z0,12,z1),(12,z0,x1,z1)]
    for j,rect in enumerate(sections):
        x,z=center(rect)
        sauna=12<x<19 and -.2<z<4.2
        wet=z>=-.1 and x<=12.1
        low=.075 if not wet and not sauna else 0
        cube(f'wall_{i}_{j}_lower',rect,low,1-low,'cedar' if sauna else 'ceramic_teal' if wet else 'warm_plaster')
        cube(f'wall_{i}_{j}_upper',rect,1,1.54,'cedar' if sauna else 'ceramic_cream' if wet else 'warm_plaster',UPPER)
        cube(f'wall_{i}_{j}_cap',rect,2.54,.06,'dark_cedar',UPPER)
        if not wet and not sauna:
            cube(f'wall_{i}_{j}_skirting',rect,0,.075,'dark_cedar')

# Framing sits above or inside the wall solids: never narrow a gameplay opening.
placement='additional_door_frames'
for i,d in enumerate(LAYOUT['doors']):
    b=box_tuple(d['box'])
    if d['id']=='open_air_pond_entrance':continue
    cube('door_header_'+str(i),b,2.25,.35,'cedar',UPPER)

SOURCE_CACHE={}
def public_piece(pack,model,name,b,bottom,height,mat,yaw=0,extend_long_axis=False):
    source=ROOT/'assets/public_sources'/pack/'models'/(model+'.glb')
    key=str(source)
    if key not in SOURCE_CACHE:
        before=set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(source))
        imported=set(bpy.data.objects)-before
        meshes=[o for o in imported if o.type=='MESH']
        bpy.context.view_layer.update()
        for o in meshes:
            o.data=o.data.copy();matrix=o.matrix_world.copy();o.parent=None
            for v in o.data.vertices:v.co=matrix @ v.co
            o.matrix_world=Matrix.Identity(4)
        bpy.ops.object.select_all(action='DESELECT')
        for o in meshes:o.select_set(True)
        bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join()
        template=bpy.context.object;mesh=template.data.copy()
        SOURCE_CACHE[key]=mesh
        for o in list(imported):
            if o.name in bpy.data.objects:bpy.data.objects.remove(o,do_unlink=True)
    mesh=SOURCE_CACHE[key].copy()
    rotation=Matrix.Rotation(math.radians(yaw),4,'Z')
    points=[rotation @ v.co for v in mesh.vertices]
    weathered=model in ('rock_smallH','rock_smallI')
    if weathered:
        # Modest local weathering of actual source topology breaks the regular
        # ring heights; no global axis stretch or replacement primitive is used.
        lo0=Vector(tuple(min(v[i] for v in points) for i in range(3)))
        hi0=Vector(tuple(max(v[i] for v in points) for i in range(3)));s=hi0-lo0
        phase=int(hashlib.sha256(name.encode()).hexdigest()[:4],16)/65535*math.tau
        for p in points:
            t=(p.z-lo0.z)/s.z
            p.x+=s.x*.045*math.sin(t*3.4+phase)
            p.y+=s.y*.035*math.cos(t*2.7+phase)
            p.z+=s.z*.05*math.sin(p.x/s.x*3+p.y/s.y*2+phase)*t
    lo=Vector(tuple(min(v[i] for v in points) for i in range(3)))
    hi=Vector(tuple(max(v[i] for v in points) for i in range(3)))
    size=hi-lo;x0,z0,x1,z1=b
    longaxis=0 if x1-x0>=z1-z0 else 1
    limits=[(x1-x0)/size.x,(z1-z0)/size.y,height/size.z]
    scale=min(v for i,v in enumerate(limits) if not (extend_long_axis and i==longaxis))
    extra=max(0,((x1-x0) if longaxis==0 else (z1-z0))-size[longaxis]*scale) if extend_long_axis else 0
    midpoint=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
    offset=xyz((x0+x1)/2,bottom,(z0+z1)/2)
    for v,p in zip(mesh.vertices,points):
        p=(p-midpoint)*scale
        if extra:
            # Extend seat/back crossbars by moving the two end assemblies apart;
            # leg thickness and all cross-section dimensions stay unchanged.
            p[longaxis]+=math.copysign(extra/2,p[longaxis]) if abs(p[longaxis])>.02 else 0
        v.co=p+offset
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);own(obj,STATIC,mat);uv_project(obj)
    if weathered:
        # The low-poly GLB duplicates vertices at hard-normal seams. Weld equal
        # positions before smoothing, otherwise a smooth flag keeps flat facets.
        bm=bmesh.new();bm.from_mesh(mesh)
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
        bm.to_mesh(mesh);bm.free()
        mesh.normals_split_custom_set([(0,0,0)]*len(mesh.loops))
        for p in mesh.polygons:p.use_smooth=True
    public_uses.append({'kind':'geometry','source_file':str(source.relative_to(ROOT)),'sha256':SHA(source),
        'placement_id':placement,'object_before_batching':name,'material':mat,'uniform_scale':scale,'yaw_degrees':yaw,
        'modifications':'Recentered original imported mesh, uniform scale, yaw, material replacement; zero-area source faces removed'+('; separated end assemblies to extend bench rails without thickening legs' if extra else '')+('; local vertex weathering and smooth normals on original source topology' if weathered else ''),
        'long_axis_extension_m':extra,'license':'CC0-1.0'})
    return obj

def bench(name, b, height=.45, public=True):
    x0,z0,x1,z1=b; longx=(x1-x0)>=(z1-z0)
    if public:
        public_piece('kenney_furniture','bench',name,b,0,height,'cedar',yaw=0 if longx else 90,extend_long_axis=True)
        return
    # Three substantial slats and four tapered-looking inset supports.
    if longx:
        for k in range(3):
            a=z0+(z1-z0)*k/3+.008
            cube(name+f'_seat{k}',(x0,a,x1,z0+(z1-z0)*(k+1)/3-.008),height-.065,.065,'cedar')
    else:
        for k in range(3):
            a=x0+(x1-x0)*k/3+.008
            cube(name+f'_seat{k}',(a,z0,x0+(x1-x0)*(k+1)/3-.008,z1),height-.065,.065,'cedar')
    for x in (x0+.07,x1-.13):
        for z in (z0+.055,z1-.115):
            cube(name+'_leg',(x,z,x+.06,z+.06),0,height-.065,'dark_cedar')

def cabinet(name,b,height,shoe=False):
    x0,z0,x1,z1=b; face_x=(z1-z0)>(x1-x0)
    carcass=(x0,z0,x1-.035,z1) if face_x else (x0,z0,x1,z1-.035)
    split_cube(name+'_carcass',carcass,0,height,'cedar' if shoe else 'warm_plaster',.012)
    width=(z1-z0) if face_x else (x1-x0)
    count=max(1,round(width/(.42 if shoe else .50))); rows=3 if shoe else 2
    for row in range(rows):
        for col in range(count):
            a=(z0 if face_x else x0)+width*col/count+.012
            c=(z0 if face_x else x0)+width*(col+1)/count-.012
            bottom=row*height/rows+.016; h=height/rows-.032
            panel=(x1-.028,a,x1,c) if face_x else (a,z1-.028,c,z1)
            front_panel(name+f'_door{row}_{col}',panel,bottom,h,'ceramic_cream' if not shoe else 'cedar',face_x)
            cx,cz=center(panel); y=bottom+h*.5
            if face_x:
                cube(name+'_pull',(x1-.003,cz-.025,x1+.012,cz+.025),y-.008,.016,'brushed_metal',STATIC if y<1 else UPPER)
            else:
                cube(name+'_pull',(cx-.025,z1-.003,cx+.025,z1+.012),y-.008,.016,'brushed_metal',STATIC if y<1 else UPPER)

def hollow_tub(name,b,height,mat='ceramic_teal'):
    x0,z0,x1,z1=b; inset=.12
    inner=(x0+inset,z0+inset,x1-inset,z1-inset)
    ring(name+'_wall',b,inner,0,height-.045,mat,0)
    ring(name+'_rolled_rim',b,inner,height-.045,.045,'ceramic_cream',.018)
    cube(name+'_inside_floor',inner,.05,.045,mat)

def fence(name,b,height):
    x0,z0,x1,z1=b; longx=x1-x0>=z1-z0
    width=(x1-x0) if longx else z1-z0
    middle=(x0,z0+.06,x1,z1-.06) if longx else (x0+.06,z0,x1-.06,z1)
    split_cube(name+'_hinoki_panel',middle,0,height,'cedar')
    n=max(2,math.ceil(width/1.4))
    for i in range(n+1):
        a=min(max(.03,i*width/n),width-.03)
        p=(x0+a-.03,z0,x0+a+.03,z1) if longx else (x0,z0+a-.03,x1,z0+a+.03)
        split_cube(name+f'_post{i}',p,0,height,'cedar')
    for y in (.18,.86,height-.10):
        rails=(x0,z0+.005,x1,z1-.005) if longx else (x0+.005,z0,x1-.005,z1)
        cube(name+'_rail',rails,y,.055,'dark_cedar',STATIC if y<1 else UPPER)

NPC_MATERIALS={}
def import_npc(asset,name,b,scale=1,yaw=0):
    before=set(bpy.data.objects)
    source=ROOT/'public/models'/f'{asset}.glb'
    bpy.ops.import_scene.gltf(filepath=str(source))
    imported=set(bpy.data.objects)-before
    bpy.context.view_layer.update()
    x,z=center(b)
    key='staff' if asset=='npc_staff' else name.rsplit('_',1)[1].lstrip('0') or '0'
    wrapper=bpy.data.objects.new('npc_slot_'+key,None);bpy.context.collection.objects.link(wrapper);wrapper.parent=STATIC
    wrapper.location=xyz(x,0,z);wrapper.rotation_euler.z=math.radians(yaw);wrapper.scale=(scale,)*3
    wrapper['npc_role']=asset;wrapper['source_glb']='public/models/'+asset+'.glb';wrapper['source_sha256']=SHA(source)
    high=bpy.data.objects.new('npc_high_'+key,None);bpy.context.collection.objects.link(high);high.parent=wrapper
    for obj in imported:
        if obj.parent not in imported:obj.parent=high
        if obj.type=='MESH':
            if asset not in NPC_MATERIALS:NPC_MATERIALS[asset]=list(obj.data.materials)
            else:
                obj.data.materials.clear()
                for mat in NPC_MATERIALS[asset]:obj.data.materials.append(mat)
            record(obj)
    npc_slots.append({'slot':'npc_slot_'+key,'near':'npc_high_'+key,'model_kind':asset,'position_gltf_m':[x,0,z],
        'yaw_degrees':yaw,'uniform_scale':scale,'source_sha256':SHA(source),'placement_id':placement})
    return wrapper

for i,f in enumerate(LAYOUT['fixtures']):
    placement=f'fixtures_{i:02d}'
    k=f['kind'];b=box_tuple(f['box']);h=f['height'];x0,z0,x1,z1=b;x,z=center(b);name=f'{k}_{i}'
    if k=='stool':
        coverage[placement]={'status':'independent_existing_bath_stool'};continue
    if k=='staff':import_npc('npc_staff','npc_reception',b)
    elif k in ('shoeLocker','locker'):cabinet(name,b,h,k=='shoeLocker')
    elif k=='bench':bench(name,b,h)
    elif k=='desk':
        cube(name+'_body',(x0+.015,z0+.015,x1-.015,z1-.015),0,h-.06,'cedar')
        cube(name+'_counter',b,h-.06,.06,'dark_cedar',STATIC,.025)
        if x1-x0>1:
            cube(name+'_inlay',(x0+.08,z1-.02,x1-.08,z1-.009),.18,.50,'cedar')
    elif k=='step':cube(name,b,0,h,'garden_stone',STATIC,.025)
    elif k=='screen':
        split_cube(name+'_panel',(x0+.025,z0,x1-.025,z1),0,h,'straw')
        for zz in (z0,z1-.06):split_cube(name+'_post',(x0,zz,x1,zz+.06),0,h,'cedar',.01)
        for y in (.08,.98,2.12):cube(name+'_crossbar',b,y,.06,'cedar',STATIC if y<1 else UPPER)
    elif k in ('basin','plunge','outdoorBath'):hollow_tub(name,b,h,'garden_stone' if k=='outdoorBath' else 'ceramic_teal')
    elif k=='holeSide':cube(name,b,0,h,'ceramic_teal',STATIC,.016)
    elif k=='heater':
        cube(name+'_body',(x0+.09,z0+.09,x1-.09,z1-.09),0,h-.12,'dark_cedar',STATIC,.03)
        # Rounded stone load and open guard rails distinguish the stove.
        for a in range(3):
            for c in range(2):
                bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.15,location=xyz(x0+.24+a*.30,h-.09,z0+.24+c*.30))
                o=bpy.context.object;o.name=name+'_heater_stone';o.scale=(1,.85,.65);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);own(o,STATIC,'garden_stone');uv_project(o)
        for yy in (.24,.75):cube(name+'_guard',b,yy,.045,'cedar')
    elif k=='shelf':
        for y in (.12,h-.055):cube(name+'_shelf',(x0,z0+.061,x1,z1-.061),y,.055,'cedar',STATIC,.012)
        for zz in (z0,z1-.06):cube(name+'_upright',(x0,zz,x1,zz+.06),0,h,'dark_cedar')
    elif k=='fence':fence(name,b,h)
    elif k=='hedge':
        # A regularly clipped narrow hedge fits this 20 cm barrier; broad public
        # bushes would need a distorted 5:1 stretch to occupy the same footprint.
        cube(name+'_clipped_body',b,0,h,'sage_foliage',STATIC,.04)
    elif k=='shrub':
        rod(name+'_stem',(x,0,z),(x,.22,z),.035,'dark_cedar')
        public_piece('kenney_nature','plant_bushDetailed',name+'_foliage',b,.20,h-.20,'sage_foliage')
    elif k=='rock':
        n=math.ceil((z1-z0)/1.0)
        for j in range(n):
            zz=z0+(j+.5)*(z1-z0)/n
            depth=(z1-z0)/n
            bb=(x0,zz-depth/2,x1,zz+depth/2)
            public_piece('kenney_nature','rock_smallI' if j%3==1 else 'rock_smallH',
                name+f'_boulder{j}',bb,-.025,h+.025,'garden_stone',yaw=[12,91,173,262,36][j%5])
    elif k=='pondEdge':
        cube(name+'_bank',b,0,h-.06,'garden_stone')
        cube(name+'_cap',b,h-.06,.06,'garden_stone',STATIC,.025)
    else:raise ValueError(k)

for i,d in enumerate(LAYOUT['decor']):
    placement=f'decor_{i:02d}'
    k=d['kind'];b=box_tuple(d['box']);y=d['y0'];h=d['height'];x0,z0,x1,z1=b;x,z=center(b);name=f'{k}_{i}'
    if k=='bucket':coverage[placement]={'status':'independent_existing_wash_basin'};continue
    if k in ('norenMen','norenWomen','curtain'):
        longx=x1-x0>=z1-z0; span=x1-x0 if longx else z1-z0
        for panel in range(3):
            a=span*panel/3+.009;c=span*(panel+1)/3-.009
            bb=(x0+a,z0,x0+c,z1) if longx else (x0,z0+a,x1,z0+c)
            cube(name+'_fabric'+str(panel),bb,y,h-(.025 if panel==1 else 0),'rose_cloth' if k=='norenWomen' else 'navy_cloth',UPPER)
        rod(name+'_rail',(x0,y+h+.02,z0),(x1,y+h+.02,z1),.025,'cedar',UPPER)
    elif k=='mirror':
        front_panel(name+'_glass',(x0,z0,x1,z1-.006),y,h,'mirror_glass')
        # Split every frame component at the overview plane as well.
        t=.025
        for a,p in enumerate([(x0,z0,x0+t,z1),(x1-t,z0,x1,z1)]):split_cube(name+f'_frame{a}',p,y,h,'cedar')
        split_cube(name+'_bottom',(x0+t,z0,x1-t,z1),y,t,'cedar')
        split_cube(name+'_top',(x0+t,z0,x1-t,z1),y+h-t,t,'cedar')
    elif k=='mat':cube(name,b,y,h,'straw',STATIC,.003)
    elif k=='shower':
        # Remain inside the original small head footprint; no hose into aisles.
        rod(name+'_stem',(x,y,z),(x,y+h-.08,z),.018,'brushed_metal',UPPER,6)
        rod(name+'_neck',(x,y+h-.08,z),(x+.018,y+h-.04,z),.021,'brushed_metal',UPPER,6)
        rod(name+'_head',(x+.018,y+h-.06,z),(x+.018,y+h-.03,z),.065,'brushed_metal',UPPER,8)
    elif k=='tap':
        rod(name+'_base',(x,y,z0+.02),(x,y+h,z0+.02),.018,'brushed_metal')
        rod(name+'_spout',(x,y+h-.014,z0+.02),(x,y+h-.014,z1-.01),.018,'brushed_metal')
        rod(name+'_lever',(x-.035,y+h,z0+.02),(x+.035,y+h,z0+.02),.01,'brushed_metal',STATIC,6)
    elif k=='shelf':cube(name,b,y,h,'ceramic_teal',STATIC,.008)
    elif k=='border':
        # Recessed pool/trough edging: top stays below the existing shallow
        # water overlay. These visual rims do not invent a raised collider.
        inner=(4.6,5.4,10.6,8.8) if x1-x0>5 else (x0+.12,z0+.12,x1-.12,z1-.12)
        ring(name+'_rim',b,inner,-.08,.09,'ceramic_cream',0)
        ring(name+'_recess',inner,(inner[0]+.04,inner[1]+.04,inner[2]-.04,inner[3]-.04),-.25,.25,'ceramic_teal',0)
    elif k=='deck':cube(name,b,y,h,'cedar',STATIC,.01)
    elif k=='stone':cube(name,b,y,h,'garden_stone')
    else:raise ValueError(k)

# Seats remain in original blocked bands. A complete adult silhouette remains in
# overview, and each source NPC has its own node for a subsequent LOD allocation.
for i,b in enumerate(LAYOUT['npcs']):
    placement=f'npcs_{i:02d}'
    box=box_tuple(b)
    if box[3]-box[1]<.6:
        import_npc('npc_bath_standing',f'npc_crowd_{i:02d}',box)
    else:
        bench(f'crowd_bench_{i}',box,.405,public=False)
        import_npc('npc_seated',f'npc_crowd_{i:02d}',box,.9,90)

placement='additional_ceilings'
for z in LAYOUT['zones']:
    if z['id'] in ('reception','common','exterior','changing','bath','sauna_entry','sauna_crowd'):
        cube(z['id']+'_ceiling',box_tuple(z['box']),2.7,.05,'warm_plaster',CEILING)
placement='additional_narrow_hole_lid_lintel'
h=box_tuple(LAYOUT['narrowHole']['box'])
cube('narrow_hole_lid',(h[0]-.2,h[1]-.2,h[2],h[3]+.2),.55,.05,'ceramic_cream',CEILING)
cube('narrow_hole_lintel',(h[2]-.1,h[1],h[2]+.1,h[3]),.55,2.05,'ceramic_cream',CEILING)

placement='additional_sauna_door'
db=box_tuple(LAYOUT['saunaDoorBlocker']);x0,z0,x1,z1=db
cube('sauna_door_panel',db,0,2.2,'cedar',DOOR,.016)
cube('sauna_door_window',(x0-.002,z0+.22,x0+.014,z1-.22),1.18,.56,'mirror_glass',DOOR,.012)
rod('sauna_door_handle',(x0-.025,.94,z0+.18),(x0-.025,1.18,z0+.18),.025,'dark_cedar',DOOR)

placement='additional_fuji_mural'
mural=material('fuji_mural',0xffffff,.75)
image=bpy.data.images.load(str(ROOT/'assets/sento_mural/ref/sento_mural__v01.png'));image.pack()
tex=mural.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image
mural.node_tree.links.new(tex.outputs['Color'],mural.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
panel=cube('fuji_mural_panel',(5.275,8.882,9.925,8.891),1.02,1.55,mural,UPPER)
for p in panel.data.polygons:
    for li in p.loop_indices:
        v=panel.matrix_world @ panel.data.vertices[panel.data.loops[li].vertex_index].co
        panel.data.uv_layers.active.data[li].uv=((v.x-5.275)/4.65,(v.z-1.02)/1.55)

# Public-source placement is added here by the same build once assets arrive.

def triangles(objects):
    count=0
    for o in objects:
        if o.type=='MESH':o.data.calc_loop_triangles();count+=len(o.data.loop_triangles)
    return count

def group_of(o):
    p=o
    while p and p not in GROUPS.values():p=p.parent
    return p

def meshes_in(o):
    return [x for x in o.children_recursive if x.type=='MESH']

def is_npc(obj):
    while obj:
        if obj.get('npc_role'):return True
        obj=obj.parent
    return False
architecture=[o for o in bpy.data.objects if o.type=='MESH' and not is_npc(o)]
npc_meshes=[o for o in bpy.data.objects if o.type=='MESH' and is_npc(o)]
for o in architecture:
    bm=bmesh.new();bm.from_mesh(o.data)
    tiny=[f for f in bm.faces if f.calc_area()<1e-14]
    if tiny:bmesh.ops.delete(bm,geom=tiny,context='FACES_ONLY')
    bm.to_mesh(o.data);bm.free()
prebatch={'architecture_triangles':triangles(architecture),'npc_triangles':triangles(npc_meshes)}
by_placement={}
for o in architecture:
    key=o.get('placement_id','other')
    by_placement[key]=by_placement.get(key,0)+triangles([o])
prebatch['triangles_by_placement']=by_placement
assert prebatch['architecture_triangles']<=8000,prebatch
expected_placements={f'{kind}_{i:02d}' for kind in ('structural_walls','fixtures','decor','npcs','zones') for i in range(len(LAYOUT[kind]))}
assert expected_placements <= coverage.keys(), expected_placements-coverage.keys()
assert all(v.get('objects_before_batching') for v in coverage.values() if v['status']=='authored')
print('ENV_PREBATCH',json.dumps(prebatch),flush=True)

# Keep provenance/placement coverage before merging. Shared material batches per
# visibility group keep export draw calls low without mixing cutaway ownership.
group_batches={g:{} for g in GROUPS.values()}
for obj in architecture:
    group_batches[group_of(obj)].setdefault(obj.data.materials[0].name,[]).append(obj)
for group,batch in group_batches.items():
    for key,objects in batch.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        bpy.ops.object.join()
        obj=bpy.context.object;obj.name=group.name+'__'+key
        matrix=obj.matrix_world.copy()
        for v in obj.data.vertices:v.co=matrix @ v.co
        obj.matrix_world=Matrix.Identity(4);obj.parent=group

bpy.data.orphans_purge(do_recursive=True)
for image in bpy.data.images:
    if image.packed_file:
        relative='//textures/'+image.name+'.png'
        image.filepath='//'+'x'*1000;image.filepath=relative
        for packed in image.packed_files:
            packed.filepath='//'+'x'*1000;packed.filepath=relative
for screen in bpy.data.screens:
    for area in screen.areas:
        for space in area.spaces:
            if space.type=='FILE_BROWSER' and space.params:
                space.params.directory=b'/'*1023;space.params.directory=b'//'
bpy.context.preferences.filepaths.save_version=0
bpy.context.scene.render.filepath='//'
blend_path=BLEND/'sento_environment__v01.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path),compress=True)
path=CAND/'sento_environment.glb'
bpy.ops.object.select_all(action='DESELECT')
for o in [root]+list(root.children_recursive):o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_copyright='Sento Duck Explorer; public source licenses and source-derived NPC attribution in asset records')
SANITIZE(path)

# The exported/reimported world is measured and rendered, rather than a prettier
# scene assembled from high-resolution masters.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(path))
meshes=[o for o in bpy.data.objects if o.type=='MESH']
points=np.array([o.matrix_world @ v.co for o in meshes for v in o.data.vertices])
assert np.isfinite(points).all()
degenerate=0
for o in meshes:
    bm=bmesh.new();bm.from_mesh(o.data)
    degenerate+=sum(f.calc_area()<1e-14 for f in bm.faces);bm.free()
assert not degenerate

# Geometric clearance of the exact authored triangles, not merely source boxes.
# Clip each candidate triangle against the interior of an AABB. Boundary contact
# is allowed, but visible architecture/NPCs must not intrude into the passages.
def clipped_triangle(points,lo,hi):
    poly=points
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

triangle_cache=[]
for o in meshes:
    p=o;door=False
    while p:
        if p.name=='sauna_door':door=True
        p=p.parent
    if door:continue
    o.data.calc_loop_triangles()
    for t in o.data.loop_triangles:
        v=[o.matrix_world @ o.data.vertices[i].co for i in t.vertices]
        points_gltf=[Vector((p.x,p.z,-p.y)) for p in v]
        triangle_cache.append((points_gltf,np.min(points_gltf,axis=0),np.max(points_gltf,axis=0)))
clearances=[]
checks=[('narrow_hole',LAYOUT['narrowHole']['box'],.05,.45)]
checks += [(f'crowd_gap_{i}',g['box'],.05,1.75) for i,g in enumerate(LAYOUT['crowdGaps'])]
checks += [(d['id'],d['box'],.05,1.4) for d in LAYOUT['doors']]
for name,b,low,high in checks:
    lo=np.array([b['minX']+1e-5,low,b['minZ']+1e-5]);hi=np.array([b['maxX']-1e-5,high,b['maxZ']-1e-5])
    overlaps=0
    for tri,a,c in triangle_cache:
        if (c<lo).any() or (a>hi).any():continue
        if clipped_triangle(tri,lo,hi):overlaps+=1
    clearances.append({'id':name,'bounds_gltf_m':[lo.tolist(),hi.tolist()],'intersecting_triangles':overlaps})
assert all(c['intersecting_triangles']==0 for c in clearances),clearances
for s in npc_slots:
    obj=bpy.data.objects[s['slot']]
    pts=np.array([o.matrix_world @ v.co for o in obj.children_recursive if o.type=='MESH' for v in o.data.vertices])
    s['bounds_gltf_m']=[[float(pts[:,0].min()),float(pts[:,2].min()),float(-pts[:,1].max())],
                          [float(pts[:,0].max()),float(pts[:,2].max()),float(-pts[:,1].min())]]
report={'layout_sha256':LAYOUT['layout_sha256'],'export_sha256':SHA(path),'export_bytes':path.stat().st_size,'blend_sha256':SHA(blend_path),
        **prebatch,'export_triangles':triangles(meshes),'mesh_count':len(meshes),
        'materials':sorted({m.name for o in meshes for m in o.data.materials}),
        'bounds_gltf_m':[[float(points[:,0].min()),float(points[:,2].min()),float(-points[:,1].max())],[float(points[:,0].max()),float(points[:,2].max()),float(-points[:,1].min())]],
        'finite_vertices':True,'degenerate_faces':degenerate,'coverage':coverage,'public_geometry_uses':public_uses,'npc_slots':npc_slots,
        'source_placement_count':len(expected_placements),'clearances':clearances,
        'scope':'Authored candidate; exported/reimported Blender renders, not in-game or normal-input verification'}
assert all(SHA(ROOT/'public/models'/(name+'.glb'))==digest for name,digest in canonical_before.items())
report['unchanged_canonical_models']=canonical_before
(QA/'measurements.json').write_text(json.dumps(report,indent=2)+'\n')

scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.cycles.diffuse_bounces=1;scene.cycles.glossy_bounces=1
scene.render.resolution_x=1440;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
scene.world=bpy.data.worlds.new('Pale blue inspection world');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(*rgb(0xcddde2),1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7
for pos,power,size in [((8,15,0),4500,18),((26,12,5),2500,16),((5,6,-5),1200,10)]:
    bpy.ops.object.light_add(type='AREA',location=xyz(*pos));l=bpy.context.object;l.data.energy=power;l.data.shape='DISK';l.data.size=size
    l.rotation_euler=(xyz(pos[0],0,pos[2])-l.location).to_track_quat('-Z','Y').to_euler()
for z in LAYOUT['zones']:
    if z['id'] in ('reception','common','exterior','changing','bath','sauna_entry','sauna_crowd'):
        b=z['box'];x,zz=center(b);w=b['maxX']-b['minX'];d=b['maxZ']-b['minZ']
        bpy.ops.object.light_add(type='AREA',location=xyz(x,2.52,zz));l=bpy.context.object
        l.name='QA_ONLY_indoor_fill';l.data.energy=w*d*10;l.data.shape='DISK';l.data.size=min(w,d)*.65
bpy.ops.object.light_add(type='SUN',location=(0,0,12));sun=bpy.context.object;sun.rotation_euler=(.4,-.3,-.5);sun.data.energy=1.1;sun.data.angle=.12
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam

def show_group(name,show):
    o=bpy.data.objects.get(name)
    if o:
        for c in o.children_recursive:
            if c.type=='MESH':c.hide_render=not show

# Water is a clearly marked render-only stand-in for the existing runtime water.
preview=bpy.data.materials.new('QA_ONLY_water_not_exported');preview.diffuse_color=(*rgb(0x557f93),1);preview.use_nodes=True
preview.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*rgb(0x557f93),1)
preview.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.3
def preview_water(b,y):
    x0,z0,x1,z1=box_tuple(b) if isinstance(b,dict) else b
    bpy.ops.mesh.primitive_plane_add(size=1,location=xyz((x0+x1)/2,y,(z0+z1)/2));o=bpy.context.object
    o.name='QA_ONLY_water';o.scale=(x1-x0,z1-z0,1);o.data.materials.append(preview)
for z in LAYOUT['zones']:
    if z['id'] in ('bathwater','pond'):preview_water(z['box'],.025)
for b in LAYOUT['duckWater']:preview_water(b,.026)
for f in LAYOUT['fixtures']:
    if f['kind'] in ('basin','plunge','outdoorBath'):
        x0,z0,x1,z1=box_tuple(f['box']);preview_water((x0+.12,z0+.12,x1-.12,z1-.12),f['height']-.025)

def preview_prop(asset,box,bottom,height):
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/models'/(asset+'.glb')))
    imported=set(bpy.data.objects)-before
    meshes=[o for o in imported if o.type=='MESH']
    bpy.context.view_layer.update()
    points=[o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
    lo=Vector(tuple(min(v[i] for v in points) for i in range(3)));hi=Vector(tuple(max(v[i] for v in points) for i in range(3)))
    x0,z0,x1,z1=box;size=hi-lo;scale=min((x1-x0)/size.x,(z1-z0)/size.y,height/size.z)
    offset=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
    target=xyz((x0+x1)/2,bottom,(z0+z1)/2)
    for o in meshes:
        matrix=o.matrix_world.copy();o.data=o.data.copy()
        for v in o.data.vertices:v.co=(matrix @ v.co-offset)*scale+target
        o.parent=None;o.matrix_world=Matrix.Identity(4);o.name='QA_ONLY_'+asset
    for o in imported:
        if o.type!='MESH':bpy.data.objects.remove(o,do_unlink=True)
for f in LAYOUT['fixtures']:
    if f['kind']=='stool':preview_prop('bath_stool',box_tuple(f['box']),0,f['height'])
for d in LAYOUT['decor']:
    if d['kind']=='bucket':preview_prop('wash_basin',box_tuple(d['box']),d['y0'],d['height'])

shots=[('overview',(26,29,32),(15,0,2),True,44),
       ('bath_low',(10.8,1.45,2.0),(6.3,1.2,8.7),False,None),
       ('reception_low',(6.5,1.55,-5.5),(5.7,1.1,-8.6),False,None),
       ('sauna_low',(12.6,1.5,1.7),(17.8,1.1,2.0),False,None),
       ('garden_low',(19,1.4,7),(15.8,.6,10.5),False,None),
       ('pond_low',(22,1.1,8),(30,.5,8),False,None),
       ('washing_low',(7.4,.7,2.4),(6.8,.75,.1),False,None)]
if '--no-render' in sys.argv:shots=[]
for name,eye,target,overview,ortho in shots:
    show_group('environment_upper',not overview);show_group('environment_ceiling',not overview)
    cam.location=xyz(*eye);cam.rotation_euler=(xyz(*target)-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.type='ORTHO' if ortho else 'PERSP';cam.data.lens=25
    if ortho:cam.data.ortho_scale=ortho
    scene.render.filepath=str(QA/(name+'.png'));bpy.ops.render.render(write_still=True)
print('ENV_DONE',json.dumps({k:v for k,v in report.items() if k not in ('coverage','materials')}),flush=True)
