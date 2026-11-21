"""Build four final small props; Blender --background --python this_file.

Coin and key derive from the retained Quaternius CC0 OBJ sources. Soap and
folded towel are project-authored. Outputs are candidates, never public promotion.
"""
import bpy
import bmesh
import hashlib
import json
import math
import struct
import subprocess
from collections import defaultdict
from pathlib import Path
from mathutils import Vector

ROOT = Path.cwd()
ASSET = ROOT/'assets/sento_small_items'
CAND = ROOT/'.local/environment-refresh/items'
QUALITY = ASSET/'quality'
BLENDS = ASSET/'blend'
for p in (CAND, QUALITY, BLENDS):
    p.mkdir(parents=True, exist_ok=True)
TARGETS = {'soap': (.30, .18, .08), 'towel': (.26, .18, .04),
           'coin_500': (.20, .20, .03), 'sauna_key': (.18, .08, .04)}
SOURCE_SHA = {'Coin': '4947422a5be8d460fa5cf21e3a7428d08c20db51edd8d5440f5591edd9d0d89a',
              'Key1': '829a354bf303c6033e6a836a12aef7df4ec1cebdf91e6a3ddd3d25c56935defb'}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def active(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.hide_set(False)
    obj.hide_render = False
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def material(name, color, roughness, metallic=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    mat.diffuse_color = (*color, 1)
    return mat


def mesh(name, verts, faces, materials, indices=None, smooth=True):
    data = bpy.data.meshes.new(name+' editable surface')
    data.from_pydata(verts, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    for mat in materials:
        data.materials.append(mat)
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    for p in data.polygons:
        p.use_smooth = smooth
        if indices:
            p.material_index = indices[p.index]
    return obj


def obj_geometry(path):
    verts, faces = [], []
    for line in path.read_text().splitlines():
        cells = line.split()
        if cells and cells[0] == 'v':
            verts.append(tuple(float(s) for s in cells[1:4]))
        elif cells and cells[0] == 'f':
            faces.append(tuple(int(s.split('/')[0])-1 for s in cells[1:]))
    return verts, faces


def geometry_digest(obj):
    data = [list(v.co) for v in obj.data.vertices], [list(p.vertices) for p in obj.data.polygons]
    return hashlib.sha256(json.dumps(data, separators=(',', ':')).encode()).hexdigest()


def source(name):
    path = ASSET/'source'/f'{name}.obj'
    assert sha(path) == SOURCE_SHA[name], 'The retained external source must remain unchanged'
    verts, faces = obj_geometry(path)
    raw = mesh('SOURCE_UNMODIFIED_'+name, verts, faces, [], smooth=False)
    assert [tuple(v.co) for v in raw.data.vertices] == [tuple(Vector(p)) for p in verts]
    assert [tuple(p.vertices) for p in raw.data.polygons] == faces
    raw['source'] = 'Quaternius Ultimate RPG Pack, CC0 1.0'
    raw['source_file_sha256'] = sha(path)
    return raw, verts, faces


def bbox(obj):
    pts = [obj.matrix_world @ v.co for v in obj.data.vertices]
    return Vector([min(v[i] for v in pts) for i in range(3)]), Vector([max(v[i] for v in pts) for i in range(3)])


def fit(obj, dims):
    lo, hi = bbox(obj)
    for v in obj.data.vertices:
        for i in range(3):
            v.co[i] = (v.co[i]-lo[i])/(hi[i]-lo[i])*dims[i]
        v.co.x -= dims[0]/2
        v.co.y -= dims[1]/2
    obj.data.update()


def soap():
    ivory = material('Warm cream soap', (.89, .84, .69), .56)
    # Six authored shoulder sections give a broad, gently curved bar, rather
    # than the old unrounded box. Top and bottom remain stable contact faces.
    profile = [(.78, 0), (.94, .008), (1, .027), (1, .049), (.94, .071), (.78, .08)]
    # Four circular corners plus four true straight sides. Uniform angular
    # sampling of a superellipse made the bar corners visibly uneven.
    contour = []
    radius = .042
    for cx, cy, start in [(.15-radius,.09-radius,0),(-.15+radius,.09-radius,90),
                          (-.15+radius,-.09+radius,180),(.15-radius,-.09+radius,270)]:
        for step in range(5):
            a = math.radians(start+step*22.5)
            contour.append((cx+radius*math.cos(a), cy+radius*math.sin(a)))
    count = len(contour)
    verts = []
    for size, z in profile:
        for x, y in contour:
            verts.append((x*size, y*size, z))
    faces = [tuple(reversed(range(count)))]
    for j in range(len(profile)-1):
        for i in range(count):
            k = (i+1)%count
            faces.append((j*count+i, j*count+k, (j+1)*count+k, (j+1)*count+i))
    faces.append(tuple((len(profile)-1)*count+i for i in range(count)))
    obj = mesh('soap', verts, faces, [ivory])
    return obj, {'source': 'Project-authored six-section rounded bar', 'profile': profile}, []


def towel():
    cloth = material('Unbleached cotton', (.86, .84, .76), .96)
    hem = material('Cotton woven hem', (.65, .64, .57), 1)
    xs, ys = [-1, -.92, -.56, 0, .56, .92, 1], [-1, -.88, 0, .88, 1]
    nx, ny = len(xs), len(ys)
    def xy(x, y):
        m = max(abs(x), abs(y))
        d = (abs(x)**7+abs(y)**7)**(1/7)
        r = m/d if d else 1
        return x*r*.13, y*r*.09
    grid = [(x, y) for y in ys for x in xs]
    boundary = [i for i in range(nx)] + [j*nx+nx-1 for j in range(1, ny)] + \
               [(ny-1)*nx+i for i in range(nx-2, -1, -1)] + [j*nx for j in range(ny-2, 0, -1)]
    verts = []
    # Bottom cap and top cap use actual grids. The sparse interior support
    # produces a slight soft fold instead of a perfectly flat plastic slab.
    for top in (False, True):
        for x, y in grid:
            u, v = xy(x, y)
            z = .038 + .002*(1-x*x)*(1-y*y) + .0005*math.sin(math.pi*x)*(1-y*y) if top else 0
            verts.append((u*(.96 if top else .94), v*(.96 if top else .94), z))
    faces, mi = [], []
    for top in (False, True):
        off = nx*ny if top else 0
        for j in range(ny-1):
            for i in range(nx-1):
                q = (off+j*nx+i, off+j*nx+i+1, off+(j+1)*nx+i+1, off+(j+1)*nx+i)
                faces.append(q if top else tuple(reversed(q)))
                mi.append(1 if i in (0, nx-2) else 0)
    rings = [[i for i in boundary]]
    for scale, z in [(.99, .006), (.955, .018), (.965, .021), (1, .031)]:
        row = []
        for i in boundary:
            x, y = grid[i]
            # The closed fold at the back stays round; the three free edges
            # show the narrow fold seam between the two cotton layers.
            s = scale + ((.99-scale)*max(0, y)**6 if z in (.018, .021) else 0)
            u, v = xy(x, y)
            row.append(len(verts))
            verts.append((u*s, v*s, z+.00035*math.sin(math.pi*x)*max(0, -y)))
        rings.append(row)
    rings.append([nx*ny+i for i in boundary])
    n = len(boundary)
    for a, b in zip(rings, rings[1:]):
        for j in range(n):
            k = (j+1)%n
            faces.append((a[j], a[k], b[k], b[j]))
            mi.append(1 if abs(grid[boundary[j]][0]) == abs(grid[boundary[k]][0]) == 1 else 0)
    obj = mesh('towel', verts, faces, [cloth, hem], mi)
    return obj, {'source': 'Project-authored folded cotton shell with continuous back fold and three visible seam edges',
                 'grid': [nx, ny], 'perimeter_sections': len(rings), 'hem': 'two end bands, separate rough matte material'}, []


def coin():
    raw, verts, faces = source('Coin')
    groups = defaultdict(list)
    for x, y, z in verts:
        groups[round(z, 6)].append(math.hypot(x, y))
    # Keep the downloaded object's ten measured radial sections. Increase
    # angular density from twenty to twenty-eight and restrain the original
    # deep platformer-style recess to a shallow machined coin face.
    samples = [(sum(rs)/len(rs), z) for z, rs in groups.items()]
    inner = min(samples, key=lambda p: p[0])[0]
    maximum = max(p[0] for p in samples)
    lower = sorted([p for p in samples if p[1] < 0])
    upper = sorted([p for p in samples if p[1] > 0], reverse=True)
    ordered = lower+upper
    zmin = min(abs(p[1]) for p in ordered)
    zmax = max(abs(p[1]) for p in ordered)
    profile = [(.082+(r-inner)/(maximum-inner)*.018,
                .015+math.copysign(.014+.001*(abs(z)-zmin)/(zmax-zmin), z)) for r, z in ordered]
    count = 28
    out = [(r*math.cos(i*math.tau/count), r*math.sin(i*math.tau/count), z) for r, z in profile for i in range(count)]
    polygons = [tuple(reversed(range(count)))]; indices = [1]
    for j in range(len(profile)-1):
        for i in range(count):
            k = (i+1)%count
            polygons.append((j*count+i, j*count+k, (j+1)*count+k, (j+1)*count+i))
            indices.append(0)
    polygons.append(tuple((len(profile)-1)*count+i for i in range(count))); indices.append(1)
    # Two small, closed relief leaves plus a stem give the pickup a currency
    # face without recreating legal-tender lettering or a real emblem.
    cap_faces = [0, len(polygons)-1]
    for contour in [[(-.002,-.005),(-.009,.024),(-.028,.036),(-.047,.033),(-.039,.015),(-.021,.002)],
                    [(.002,.007),(.021,.012),(.041,.029),(.044,.046),(.022,.041),(.007,.026)]]:
        start = len(out)
        for z in (.0287,.0296):
            for x,y in contour:
                out.append((x,y,z))
        polygons.append(tuple(start+i for i in reversed(range(6)))); indices.append(0)
        polygons.append(tuple(start+6+i for i in range(6))); indices.append(0)
        for i in range(6):
            j=(i+1)%6; polygons.append((start+i,start+j,start+6+j,start+6+i)); indices.append(0)
    start=len(out)
    # The stem top sits below the leaf tops, avoiding coincident relief planes.
    out.extend((x,y,z) for z in (.0287,.02935) for x,y in [(-.0025,-.034),(.0025,-.034),(.0025,.028),(-.0025,.028)])
    polygons.extend([(start+3,start+2,start+1,start),(start+4,start+5,start+6,start+7),
                     (start,start+1,start+5,start+4),(start+1,start+2,start+6,start+5),
                     (start+2,start+3,start+7,start+6),(start+3,start,start+4,start+7)])
    indices.extend([0]*6)
    rim = material('Warm nickel coin rim', (.48, .48, .41), .34, .85)
    inset = material('Pale brass coin face', (.60, .48, .23), .4, .78)
    obj = mesh('coin_500', out, polygons, [rim, inset], indices)
    # Flat inset faces have flat normals; the rolled rim keeps radial smoothing.
    for i,p in enumerate(obj.data.polygons):
        if i in cap_faces or i > cap_faces[-1]: p.use_smooth = False
    return obj, {'source': 'Quaternius Coin.obj, CC0 1.0', 'source_sha256': sha(ASSET/'source/Coin.obj'),
                 'actual_source_profile': ordered, 'retained_profile_sections': len(profile), 'sectors': count,
                 'changes': '28-sector resampling, restrained 1 mm raised rim and 18 mm annulus, generic closed leaf relief, metric dimensions and two satin metal materials'}, [raw]


def key():
    raw, verts, faces = source('Key1')
    brass = material('Brushed sauna-key brass', (.52, .36, .12), .42, .78)
    obj = mesh('sauna_key', [(z, x, y) for x, y, z in verts], faces, [brass])
    fit(obj, TARGETS['sauna_key'])
    # The source has several separate closed parts. Correct each part's
    # outward orientation before the Boolean; consistency alone is insufficient.
    bm = bmesh.new(); bm.from_mesh(obj.data); bm.normal_update()
    remaining=set(bm.faces)
    fixed_components=0
    while remaining:
        seen={remaining.pop()}; queue=list(seen)
        while queue:
            for e in queue.pop().edges:
                for f in e.link_faces:
                    if f in remaining: remaining.remove(f); seen.add(f); queue.append(f)
        volume=sum(f.calc_center_median().dot(f.normal)*f.calc_area()/3 for f in seen)
        if volume < 0:
            bmesh.ops.reverse_faces(bm, faces=list(seen)); fixed_components+=1
    bm.to_mesh(obj.data); bm.free()
    # Isolate the bit before Boolean evaluation: the author's ring, shaft and
    # bit are closed overlapping assemblies. Evaluating their overlap as one
    # solid produces the wrong complement at the notch in Blender's exact solver.
    adjacency = {v.index: set() for v in obj.data.vertices}
    for e in obj.data.edges:
        a,b=e.vertices; adjacency[a].add(b); adjacency[b].add(a)
    remaining=set(adjacency); parts=[]
    while remaining:
        seen={remaining.pop()}; queue=list(seen)
        while queue:
            for i in adjacency[queue.pop()]:
                if i in remaining: remaining.remove(i); seen.add(i); queue.append(i)
        parts.append(seen)
    bit_ids = next(s for s in parts if min(obj.data.vertices[i].co.x for i in s) > .02
                   and max(obj.data.vertices[i].co.y for i in s) > .03)
    bit_order=sorted(bit_ids); remap={v:i for i,v in enumerate(bit_order)}
    bit=mesh('Isolated source key bit', [tuple(obj.data.vertices[i].co) for i in bit_order],
             [tuple(remap[i] for i in p.vertices) for p in obj.data.polygons if p.vertices[0] in bit_ids], [brass])
    bm=bmesh.new(); bm.from_mesh(obj.data); bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in bit_ids], context='VERTS')
    bm.to_mesh(obj.data); bm.free()
    # The downloaded simple key has a wide solid bit. Cut a real open notch
    # to distinguish its two teeth; this is not a colored line or decal.
    bpy.ops.mesh.primitive_cube_add(size=1, location=(.059, .039, .02))
    cutter = bpy.context.object
    cutter.name = 'Temporary two-tooth notch cutter'
    cutter.dimensions = (.007, .054, .08)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    active(bit)
    mod = bit.modifiers.new('Two separate sauna-key teeth', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'; mod.solver = 'EXACT'; mod.object = cutter
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter, do_unlink=True)
    active(obj); bit.select_set(True); bpy.ops.object.join()
    bm = bmesh.new(); bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-7)
    bm.to_mesh(obj.data); bm.free()
    # A restrained chamfer on the actual source bow makes the brass edge catch
    # light without replacing the deliberately octagonal key-head silhouette.
    bm = bmesh.new(); bm.from_mesh(obj.data)
    layer = bm.edges.layers.float.new('bevel_weight_edge')
    for e in bm.edges:
        e[layer] = 1 if all(v.co.x < -.035 for v in e.verts) and e.is_manifold and e.calc_face_angle() > .5 else 0
    bm.to_mesh(obj.data); bm.free()
    active(obj)
    mod = obj.modifiers.new('Fine machined bow chamfer', 'BEVEL')
    mod.width = .00085; mod.segments = 1; mod.limit_method = 'WEIGHT'
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for p in obj.data.polygons: p.use_smooth = True
    obj.data.set_sharp_from_angle(angle=.7)
    mod = obj.modifiers.new('Weighted brass surface normals', 'WEIGHTED_NORMAL')
    mod.keep_sharp = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj, {'source': 'Quaternius Key1.obj, CC0 1.0', 'source_sha256': sha(ASSET/'source/Key1.obj'),
                 'outward_components_corrected': fixed_components,
                 'changes': 'Axes and authored dimensions fitted; outward component orientation; real two-tooth notch; 0.85 mm bow chamfer; weighted normals; satin brass'}, [raw]


def strip_png(path):
    data = Path(path).read_bytes(); out = bytearray(data[:8]); offset = 8
    while offset < len(data):
        size = struct.unpack_from('>I', data, offset)[0]; end = offset+size+12
        if data[offset+4:offset+8] not in (b'tEXt', b'zTXt', b'iTXt', b'eXIf'):
            out += data[offset:end]
        offset = end
    Path(path).write_bytes(out)


def inspect(obj, name):
    obj.data.calc_loop_triangles()
    lo, hi = bbox(obj)
    bm = bmesh.new(); bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-7)
    remaining = set(bm.verts); components = []
    while remaining:
        seen = {remaining.pop()}; queue = list(seen)
        while queue:
            for e in queue.pop().link_edges:
                for v in e.verts:
                    if v in remaining: remaining.remove(v); seen.add(v); queue.append(v)
        components.append(len(seen))
    facts = {'triangles': len(obj.data.loop_triangles), 'vertices': len(obj.data.vertices),
             'dimensions_gltf_m': [hi.x-lo.x, hi.z-lo.z, hi.y-lo.y],
             'bounds_gltf_m': [[lo.x, lo.z, -hi.y], [hi.x, hi.z, -lo.y]],
             'nonmanifold_edges_after_seam_weld': sum(not e.is_manifold for e in bm.edges),
             'degenerate_faces': sum(f.calc_area()<1e-14 for f in bm.faces),
             'connected_components': components,
             'finite': all(math.isfinite(c) for v in obj.data.vertices for c in v.co)}
    bm.free()
    assert facts['finite'] and facts['nonmanifold_edges_after_seam_weld'] == facts['degenerate_faces'] == 0, (name, facts)
    assert max(abs((hi-lo)[i]-TARGETS[name][i]) for i in range(3)) < 1e-6
    assert abs(lo.z)<1e-6 and abs(lo.x+hi.x)<1e-6 and abs(lo.y+hi.y)<1e-6
    if name == 'sauna_key':
        facts['bow_hole_clear'] = not obj.ray_cast(Vector((-.064, -.0004, .10)), Vector((0,0,-1)))[0]
        facts['two_tooth_notch_clear'] = not obj.ray_cast(Vector((.059, .03, .10)), Vector((0,0,-1)))[0]
        assert facts['bow_hole_clear'] and facts['two_tooth_notch_clear'], facts
    return facts


def render(obj, name):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'; scene.cycles.samples = 32; scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100; scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'AgX'
    world = bpy.data.worlds.new('Neutral soft item inspection'); world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (.14,.17,.18,1)
    world.node_tree.nodes['Background'].inputs[1].default_value = .65; scene.world = world
    span = max(TARGETS[name]); target = Vector((0,0,TARGETS[name][2]/2))
    for pos, power, size in [((1,-1.5,2),350,1.6),((-1.5,-.3,1),100,1.5),((0,2,2),200,1.2)]:
        bpy.ops.object.light_add(type='AREA', location=target+Vector(pos)*span)
        light = bpy.context.object; light.data.energy = power*span*span; light.data.size = size*span
        light.rotation_euler = (target-light.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add(); cam = bpy.context.object; cam.data.type = 'ORTHO'; cam.data.ortho_scale = span*1.5; scene.camera = cam
    path = QUALITY/name; path.mkdir(parents=True, exist_ok=True)
    for view, direction in [('threequarter',(1,-1.5,1.1)),('top',(0,0,1)),('side',(1,-1.8,.25)),('underside',(.5,-1,-1))]:
        cam.location = target+Vector(direction).normalized()*2
        cam.rotation_euler = (target-cam.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath = str(path/f'{view}.png'); bpy.ops.render.render(write_still=True); strip_png(scene.render.filepath)


def attachment_size(obj):
    """Dimensional proxies only; these are not exported or used in the game."""
    obj.hide_render=True
    scene=bpy.context.scene
    neutral=material('Inspection-only attachment proxy', (.19,.24,.25), .9)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=1, location=(-.20,0,.16))
    head=bpy.context.object; head.name='Inspection head-size proxy'
    head.scale=(.085,.082,.10); head.data.materials.append(neutral)
    for p in head.data.polygons:p.use_smooth=True
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=10, radius=.025, location=(.20,0,.265))
    hand=bpy.context.object; hand.name='Inspection hand-contact proxy'; hand.data.materials.append(neutral)
    for p in hand.data.polygons:p.use_smooth=True
    copies=[]
    for pos,angle in [((-.20,0,.28),0),((.20,0,.15),math.pi/2)]:
        wrapper=bpy.data.objects.new('Centered attachment inspection',None); scene.collection.objects.link(wrapper)
        copy=obj.copy();copy.data=obj.data;scene.collection.objects.link(copy);copy.parent=wrapper
        copy.hide_render=False;copy.location.z=-.02
        wrapper.location=pos;wrapper.rotation_euler.x=angle;copies.append(copy)
    bpy.context.view_layer.update()
    head_gap=bbox(copies[0])[0].z-bbox(head)[1].z
    hand_gap=bbox(hand)[0].z-bbox(copies[1])[1].z
    assert abs(head_gap)<1e-6 and abs(hand_gap)<1e-6
    for o in list(bpy.data.objects):
        if o.type=='LIGHT':bpy.data.objects.remove(o,do_unlink=True)
    target=Vector((0,0,.17));span=.7
    for pos,power,size in [((1,-1.5,2),350,1.6),((-1.5,-.3,1),100,1.5),((0,2,2),200,1.2)]:
        bpy.ops.object.light_add(type='AREA',location=target+Vector(pos)*span)
        light=bpy.context.object;light.data.energy=power*span*span;light.data.size=size*span
        light.rotation_euler=(target-light.location).to_track_quat('-Z','Y').to_euler()
    cam=scene.camera;cam.location=target+Vector((.3,-1.5,.85))*2
    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=.75
    scene.render.resolution_x=768;scene.render.resolution_y=512
    scene.render.filepath=str(QUALITY/'towel'/'attachment-size.png')
    bpy.ops.render.render(write_still=True);strip_png(scene.render.filepath)
    return {'scope':'Dimensional head/hand proxies, not game rig or gameplay verification',
            'head_towel_bottom_gap_m':head_gap,'held_towel_top_gap_m':hand_gap,
            'centering_translation_m':-.02,'held_rotation_x_radians':math.pi/2}


report = {'revision': 'v01', 'date': '2026-11-21', 'scope': 'Source preparation, actual GLB reimport, local topology and fixed-light render inspection; no game/GPU/normal-input play.', 'items': {}}
for name, maker in [('soap', soap), ('towel', towel), ('coin_500', coin), ('sauna_key', key)]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    obj, provenance, originals = maker()
    raw_digests = {o.name: geometry_digest(o) for o in originals}
    fit(obj, TARGETS[name])
    obj['asset_id'] = name
    obj['source_description'] = provenance['source']
    obj['origin'] = 'Bottom center; glTF meters, +Y up'
    obj['rights'] = 'Quaternius source CC0 1.0; project-authored work and modifications MIT' if originals else 'Project-authored work, MIT'
    active(obj)
    target = CAND/f'{name}.glb'
    bpy.ops.export_scene.gltf(filepath=str(target), export_format='GLB', use_selection=True,
        export_yup=True, export_extras=True, export_cameras=False, export_lights=False,
        export_copyright=obj['rights'])
    for o in bpy.data.objects:
        if o is not obj: o.hide_set(True); o.hide_render = True
    for screen in bpy.data.screens:
        for area in screen.areas:
            for space in area.spaces:
                if space.type == 'FILE_BROWSER' and space.params:
                    space.params.directory = b'/'*1023; space.params.directory = b'//'
    bpy.context.scene.render.filepath = '//'; bpy.context.preferences.filepaths.save_version = 0
    blend = BLENDS/f'{name}__v01.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend), compress=True)
    bpy.ops.wm.open_mainfile(filepath=str(blend))
    assert all(geometry_digest(bpy.data.objects[n]) == d for n,d in raw_digests.items())
    raw = subprocess.run(['zstd','-d','--stdout',str(blend)], check=True, capture_output=True).stdout
    markers = [b'/'+s+b'/' for s in (b'Users', b'home', b'private')] + [b'.codex'+b'/', b'@'+b'gmail.com']
    assert not any(m in raw for m in markers), name
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(target))
    objs = [o for o in bpy.data.objects if o.type == 'MESH']; assert len(objs) == 1
    obj = objs[0]
    facts = inspect(obj, name)
    data = target.read_bytes(); n = struct.unpack_from('<I', data, 12)[0]; doc = json.loads(data[20:20+n])
    assert not doc.get('images') and not doc.get('textures') and not doc.get('cameras')
    assert all('uri' not in b for b in doc['buffers']) and 1 <= len(doc.get('materials',[])) <= 2
    facts.update(materials=len(doc['materials']), textures=0, metadata_private_markers=0,
                 retained_original_geometry_digests=raw_digests)
    render(obj, name)
    if name == 'towel': facts['attachment_size'] = attachment_size(obj)
    report['items'][name] = {'file': target.name, 'bytes': target.stat().st_size, 'sha256': sha(target),
                             'blend': str(blend.relative_to(ROOT)), 'blend_sha256': sha(blend),
                             'provenance': provenance, 'reimport': facts}
report['visible_triangle_total_two_towels'] = sum(v['reimport']['triangles']*(2 if k=='towel' else 1) for k,v in report['items'].items())
(QUALITY/'measurements.json').write_text(json.dumps(report, indent=2)+'\n')
print('SMALL_ITEMS_DONE', json.dumps(report), flush=True)
