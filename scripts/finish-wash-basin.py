"""Refine the actual Meshy basin; run with Blender from the repository root.

Preserves the downloaded source and a hidden source object in the editable scene.
Exports only the adjusted mesh and renders the GLB after importing it again.
"""
import bpy
import bmesh
import hashlib
import json
import math
import statistics
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path.cwd()
ASSET = ROOT / 'assets/wash_basin'
BLEND = ASSET / 'blend'
BLEND.mkdir(parents=True, exist_ok=True)
RAW = ASSET / 'gen/wash_basin__meshy6lite_raw_v01.glb'
FINAL = ROOT / 'public/models/wash_basin.glb'
TARGET = Vector((.20, .18, .14))  # Blender XYZ; glTF XYZ = .20, .14, .18


def activate(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def extent(obj):
    coords = [obj.matrix_world @ v.co for v in obj.data.vertices]
    lo = Vector([min(p[i] for p in coords) for i in range(3)])
    hi = Vector([max(p[i] for p in coords) for i in range(3)])
    return lo, hi


def normalize(obj):
    activate(obj)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    lo, hi = extent(obj)
    center = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    for v in obj.data.vertices:
        p = obj.matrix_world @ v.co - center
        v.co = Vector([p[i] * TARGET[i] / (hi[i] - lo[i]) for i in range(3)])
    obj.location = (0, 0, 0)
    obj.rotation_euler = (0, 0, 0)
    obj.scale = (1, 1, 1)
    obj.data.update()


def measure(obj):
    obj.data.calc_loop_triangles()
    lo, hi = extent(obj)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    facts = {
        'vertices': len(obj.data.vertices),
        'triangles': len(obj.data.loop_triangles),
        'nonmanifold_edges': sum(not e.is_manifold for e in bm.edges),
        'volume_m3': bm.calc_volume(signed=False),
        'finite': all(math.isfinite(c) for v in obj.data.vertices for c in v.co),
        'gltf_bounds_min': [lo.x, lo.z, -hi.y],
        'gltf_bounds_max': [hi.x, hi.z, -lo.y],
        'dimensions_m': [hi.x-lo.x, hi.z-lo.z, hi.y-lo.y],
    }
    bm.free()
    hit, point, normal, idx = obj.ray_cast(Vector((0, 0, .3)), Vector((0, 0, -1)))
    facts['center_interior_floor_height_m'] = point.z if hit else None
    facts['cavity_depth_m'] = hi.z - point.z if hit else None
    return facts


def retopologize_sections(obj):
    """Average real radial cut contours, then fit an evenly spaced ring mesh.

    The cross-section is measured from the generated mesh, not an authored
    cylinder or bowl primitive. Averaging removes inconsistent angular dents.
    """
    paths = []
    for index in range(12):
        angle = index * math.pi / 12
        radial = Vector((math.cos(angle), math.sin(angle), 0))
        normal = Vector((-math.sin(angle), math.cos(angle), 0))
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        # Correct the runtime oval footprint to a circle before averaging.
        for v in bm.verts:
            v.co.y /= .9
        cut = bmesh.ops.bisect_plane(bm, geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
            dist=1e-7, plane_co=(0,0,0), plane_no=normal,
            clear_inner=False, clear_outer=False)
        links = {}
        def key(p):
            return (round(p.x, 7), round(p.y, 7))
        for edge in cut['geom_cut']:
            if not isinstance(edge, bmesh.types.BMEdge):
                continue
            a, b = [Vector((v.co.dot(radial),v.co.z)) for v in edge.verts]
            if max(a.x,b.x)<0:
                continue
            if a.x<0:
                a = a.lerp(b,-a.x/(b.x-a.x))
            if b.x<0:
                b = b.lerp(a,-b.x/(a.x-b.x))
            ka,kb=key(a),key(b)
            if ka==kb:
                continue
            links.setdefault(ka,set()).add(kb)
            links.setdefault(kb,set()).add(ka)
        ends=[p for p,neighbors in links.items() if len(neighbors)==1]
        if len(ends)!=2:
            raise RuntimeError(f'Expected two centerline cut endpoints, got {len(ends)}')
        current=min(ends,key=lambda p:p[1])
        path=[Vector(current)]
        previous=None
        while True:
            candidates=links[current]-({previous} if previous is not None else set())
            if not candidates:
                break
            if len(candidates)!=1:
                raise RuntimeError('Ambiguous generated contour')
            following=next(iter(candidates))
            path.append(Vector(following))
            previous,current=current,following
            if len(path)>len(links)+1:
                raise RuntimeError('Generated contour did not terminate')
        bm.free()
        # Resample equal arc positions before averaging each independent cut.
        distances=[0.0]
        for a,b in zip(path,path[1:]): distances.append(distances[-1]+(b-a).length)
        samples=[]
        segment=0
        for i in range(1001):
            distance=distances[-1]*i/1000
            while segment<len(path)-2 and distances[segment+1]<distance: segment+=1
            t=(distance-distances[segment])/(distances[segment+1]-distances[segment])
            samples.append(path[segment].lerp(path[segment+1],t))
        paths.append(samples)
    profile=[sum((p[i] for p in paths),Vector((0,0)))/len(paths) for i in range(1001)]
    # Suppress tiny numerical steps while preserving the measured rolled rim.
    profile=[sum(profile[max(0,i-4):min(len(profile),i+5)],Vector((0,0)))/len(profile[max(0,i-4):min(len(profile),i+5)]) for i in range(len(profile))]
    floor_top=profile[-1].y
    bottom=profile[0].y
    top_index=max(range(len(profile)),key=lambda i:profile[i].y)
    for i,p in enumerate(profile):
        if p.x<.065:
            p.y=bottom if i<top_index else floor_top
    profile[0].x=0
    profile[-1].x=0
    # Adaptive polyline simplification prioritizes the actual curvature.
    selected=[0,len(profile)-1]
    while len(selected)<22:
        worst=(-1,None)
        for left,right in zip(selected,selected[1:]):
            start,end=profile[left],profile[right]
            segment=end-start
            for i in range(left+1,right):
                t=max(0,min(1,(profile[i]-start).dot(segment)/segment.length_squared))
                error=(profile[i]-(start+segment*t)).length_squared
                if error>worst[0]:worst=(error,i)
        selected.append(worst[1])
        selected.sort()
    chosen=[profile[i] for i in selected]
    rings=chosen[1:-1]
    vertices=[(0,0,chosen[0].y)]
    for radius,z in rings:
        vertices.extend((radius*math.cos(i*2*math.pi/48),radius*math.sin(i*2*math.pi/48)*.9,z) for i in range(48))
    inner_center=len(vertices)
    vertices.append((0,0,chosen[-1].y))
    faces=[]
    for i in range(48):
        j=(i+1)%48
        faces.append((0,1+j,1+i))
        for ring in range(len(rings)-1):
            a=1+ring*48
            b=a+48
            faces.append((a+i,a+j,b+j,b+i))
        a=1+(len(rings)-1)*48
        faces.append((a+i,a+j,inner_center))
    mesh=bpy.data.meshes.new('Generated basin radial-section retopology')
    mesh.from_pydata(vertices,[],faces)
    mesh.update()
    obj.data=mesh
    return {'radial_cuts':12,'circumference_segments':48,'profile_rings':20,
        'measured_profile_m':[[p.x,p.y] for p in chosen]}


def setup_render():
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 768
    scene.render.resolution_y = 768
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'AgX'
    world = bpy.data.worlds.new('Basin inspection world')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.16, .19, .22, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = .55
    scene.world = world
    for pos, energy, size in [((.35,-.6,.8),28,.55),((-.5,-.15,.3),15,.45),((.1,.6,.5),22,.5)]:
        bpy.ops.object.light_add(type='AREA', location=pos)
        lamp = bpy.context.object
        lamp.data.energy = energy
        lamp.data.size = size
        lamp.rotation_euler = (Vector((0,0,.07))-lamp.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = .255
    scene.camera = camera
    return scene, camera


def render(scene, camera, name, direction, focus=(0,0,.07), scale=.255):
    target = Vector(focus)
    camera.location = target + Vector(direction).normalized() * .8
    camera.rotation_euler = (target-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.ortho_scale = scale
    scene.render.filepath = str(BLEND / (name+'.png'))
    bpy.ops.render.render(write_still=True)


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(RAW))
body = next(obj for obj in bpy.context.scene.objects if obj.type == 'MESH')
body.name = 'wash_basin'
normalize(body)
raw_measured = measure(body)
source = body.copy()
source.data = body.data.copy()
source.name = 'SOURCE_Meshy_basin_normalized'
source_collection = bpy.data.collections.new('Source - preserved normalized Meshy mesh')
bpy.context.scene.collection.children.link(source_collection)
source_collection.objects.link(source)
source.hide_set(True)
source.hide_render = True
source['provenance'] = 'Unmodified geometry normalized to the runtime envelope; exact original remains in gen/'
source['source_sha256'] = hashlib.sha256(RAW.read_bytes()).hexdigest()

activate(body)
smooth = body.modifiers.new('Remove fine generation surface noise', 'SMOOTH')
smooth.factor = .45
smooth.iterations = 30
bpy.ops.object.modifier_apply(modifier=smooth.name)
section_details = retopologize_sections(body)
normalize(body)
for uv in list(body.data.uv_layers):
    body.data.uv_layers.remove(uv)
for attr in list(body.data.color_attributes):
    body.data.color_attributes.remove(attr)
for poly in body.data.polygons:
    poly.use_smooth = True
material = bpy.data.materials.new('warm_yellow_satin_plastic')
material.use_nodes = True
principled = material.node_tree.nodes['Principled BSDF']
principled.inputs['Base Color'].default_value = (1.0, .64, .055, 1)
principled.inputs['Roughness'].default_value = .34
principled.inputs['Metallic'].default_value = 0
body.data.materials.clear()
body.data.materials.append(material)
body['asset_license'] = 'CC-BY-4.0'
body['attribution'] = 'Meshy 6 Lite; modified in Blender for Sento Duck Explorer'
body['modifications'] = 'Retopology fitted to 12 actual generated radial cut contours; averaged cross-section removes angular dents; 48 sectors preserve the rolled rim, walls and hollow base; metric envelope and yellow satin plastic'
bm = bmesh.new()
bm.from_mesh(source.data)
source_bvh = BVHTree.FromBMesh(bm)
bm.free()
distances = sorted(source_bvh.find_nearest(v.co)[3] for v in body.data.vertices)
shape_comparison = {'target_to_raw_surface_distance_max_m':max(distances),
    'target_to_raw_surface_distance_median_m':statistics.median(distances),
    'target_to_raw_surface_distance_p95_m':distances[int(len(distances)*.95)]}
bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene.render.filepath = '//'
for screen in bpy.data.screens:
    for area in screen.areas:
        for space in area.spaces:
            if space.type == 'FILE_BROWSER' and space.params:
                space.params.directory = b'/' * 1023
                space.params.directory = b'//'
activate(body)
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND/'wash_basin__v01.blend'), compress=False)
bpy.ops.export_scene.gltf(filepath=str(FINAL), export_format='GLB', use_selection=True,
    export_yup=True, export_extras=True, export_cameras=False, export_lights=False,
    export_copyright='Meshy 6 Lite output, CC BY 4.0; Blender modifications by Sento Duck Explorer contributors')

# Verification and previews use the exported asset, not the unsaved working mesh.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(FINAL))
result = next(obj for obj in bpy.context.scene.objects if obj.type=='MESH')
facts = {'raw_normalized':raw_measured, 'reimported_final':measure(result),
    'retopology':section_details, 'source_shape_comparison':shape_comparison,
    'material_count':len(result.data.materials), 'texture_count':0,
    'final_bytes':FINAL.stat().st_size, 'final_sha256':hashlib.sha256(FINAL.read_bytes()).hexdigest(),
    'blend_bytes':(BLEND/'wash_basin__v01.blend').stat().st_size,
    'blend_sha256':hashlib.sha256((BLEND/'wash_basin__v01.blend').read_bytes()).hexdigest(),
    'raw_bytes':RAW.stat().st_size, 'raw_sha256':hashlib.sha256(RAW.read_bytes()).hexdigest(),
    'blender_version':bpy.app.version_string}
(BLEND/'wash_basin__measurements_v01.json').write_text(json.dumps(facts,indent=2)+'\n')
scene, camera = setup_render()
render(scene,camera,'wash_basin__threequarter_v01',(1,-1.5,1.2))
render(scene,camera,'wash_basin__front_v01',(0,-1,.15))
render(scene,camera,'wash_basin__interior_v01',(.2,-.3,1.7))
render(scene,camera,'wash_basin__underside_v01',(1,-1,-1))
# Same camera/material for a geometry comparison; the downloaded file is intact.
result.hide_render = True
before=set(bpy.context.scene.objects)
bpy.ops.import_scene.gltf(filepath=str(RAW))
raw_display=next(o for o in set(bpy.context.scene.objects)-before if o.type=='MESH')
normalize(raw_display)
raw_display.data.materials.clear()
raw_display.data.materials.append(result.data.materials[0])
for polygon in raw_display.data.polygons: polygon.use_smooth=True
render(scene,camera,'wash_basin__source_comparison_v01',(1,-1.5,1.2))
print('BASIN_MEASUREMENTS '+json.dumps(facts))
