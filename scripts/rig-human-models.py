"""Add a shared, source-space weighted walking rig without remeshing humans.

Blender --background --python-exit-code 1 --python scripts/rig-human-models.py --
    --only child [--adult-source path/to/repaired.blend] [--render]

The generated candidates stay private until visual/runtime review promotes them.
Editable sources and the reimported GLB measurements are retained separately.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import runpy
import struct
import sys

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

ROOT = Path.cwd()
OUT = ROOT / '.local/human-face-walk/rig'
SOURCE = ROOT / 'assets/human_walk/blend'
QUALITY = ROOT / 'assets/human_walk/quality'
REF = runpy.run_path(str(ROOT / 'scripts/refine-human-models.py'))
SANITIZE = runpy.run_path(str(ROOT / 'scripts/sanitize-glb-png.py'))['sanitize']


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def smooth(a, b, x):
    t = max(0., min(1., (x-a)/(b-a)))
    return t*t*(3-2*t)


def source_arm(id, sign, socket, correction):
    """Use the exact source pose joints, rather than guessing near bent palms."""
    h = REF['CFG'][id]['h']
    z = .71 if id == 'child' else 1.20
    x = .130 if id == 'child' else .170
    original = bpy.data.objects['SOURCE_RAW_UNMODIFIED']
    arr = np.array([original.matrix_world @ v.co for v in original.data.vertices])
    lo, hi = arr.min(0), arr.max(0)
    arr = (arr - np.array([(lo[0]+hi[0])/2, (lo[1]+hi[1])/2, lo[2]]))*h/(hi[2]-lo[2])
    s = np.array([sign*x, -.012, z])
    e = np.array([sign*(.225 if id == 'child' else .300), -.025, .52 if id == 'child' else .99])
    hand = arr[(arr[:, 0]*sign > .23*h) & (arr[:, 2] < .48*h)].mean(0)
    s2 = s.copy(); s2[0] *= 1.56 if id == 'child' else 1.68
    s2[2] -= .030 if id == 'child' else .045
    s2[1] += .10 if id == 'adult' else 0
    end = np.array(socket) if sign < 0 else np.array([abs(socket[0]), socket[1], socket[2]]) if id == 'child' else np.array([.32, -.065, .65])
    l1, l2 = np.linalg.norm(e-s), np.linalg.norm(hand-e)
    delta = end-s2; distance = np.linalg.norm(delta); axis = delta/distance
    stretch = max(1., distance/(.999*(l1+l2))); l1 *= stretch; l2 *= stretch
    along = (l1*l1-l2*l2+distance*distance)/(2*distance)
    rise = math.sqrt(max(0., l1*l1-along*along))
    perp = e-s; perp -= axis*np.dot(perp, axis); perp /= np.linalg.norm(perp)
    if id == 'adult' and sign < 0:
        down = np.array([0., 0., -1.]); down -= axis*np.dot(down, axis); down /= np.linalg.norm(down)
        perp = perp*.25+down*.75; perp /= np.linalg.norm(perp)
    elbow = s2+axis*along+perp*rise
    return dict(s=Vector(s), e=Vector(e), h=Vector(hand),
                shoulder=Vector(s2)-correction, elbow=Vector(elbow)-correction,
                hand=Vector(end)-correction)


def make_rig(id, root, meshes):
    h = REF['CFG'][id]['h']
    correction = Vector(root['bottom_center_correction'])
    socket = bpy.data.objects['socket_hand_r']
    arms = {side: source_arm(id, sign, socket.location, correction)
            for side, sign in [('r', -1), ('l', 1)]}
    body_y = (.10 if id == 'adult' else 0)-correction.y
    pelvis_z = .42 if id == 'child' else .765
    shoulder_z = .68 if id == 'child' else 1.155
    head_z = .78 if id == 'child' else 1.30
    hips = Vector((0, body_y, pelvis_z))
    spine = Vector((0, body_y, shoulder_z))
    data = bpy.data.armatures.new('human_walk_shared')
    rig = bpy.data.objects.new('human_walk_rig', data)
    bpy.context.collection.objects.link(rig); rig.parent = root
    bpy.ops.object.select_all(action='DESELECT'); rig.select_set(True)
    bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='EDIT')
    def bone(name, start, end, parent=None):
        b = data.edit_bones.new(name); b.head = start; b.tail = end
        if parent: b.parent = data.edit_bones[parent]
        return b
    bone('hips', hips, hips+Vector((0, 0, .10*h)))
    bone('spine', hips, spine, 'hips')
    bone('head', (0, body_y, head_z), (0, body_y, h-.025), 'spine')
    for side, sign in [('r', -1), ('l', 1)]:
        arm = arms[side]
        bone('upper_arm_'+side, arm['shoulder'], arm['elbow'], 'spine')
        bone('forearm_'+side, arm['elbow'], arm['hand'], 'upper_arm_'+side)
        hip = Vector((sign*(.105 if id == 'child' else .145), body_y, pelvis_z))
        knee = Vector((sign*(.115 if id == 'child' else .155), body_y-.008, .235 if id == 'child' else .43))
        ankle = Vector((sign*(.120 if id == 'child' else .17), body_y, .050 if id == 'child' else .065))
        toe = ankle+Vector((0, -.095 if id == 'child' else -.13, -.015))
        bone('thigh_'+side, hip, knee, 'hips')
        bone('shin_'+side, knee, ankle, 'thigh_'+side)
        bone('foot_'+side, ankle, toe, 'shin_'+side)
    bpy.ops.object.mode_set(mode='OBJECT')
    rig['rig_version'] = 1
    rig['motion_axes'] = 'glTF root +X: thigh positive back, shin positive flexion, forearm negative flexion'
    rig['weight_method'] = 'Preserved reference_position anatomical masks; source-pose arm joints; normalized four influences maximum'
    facts = {}
    for mesh in meshes:
        mesh.hide_set(False); mesh.hide_render = False
        for group in list(mesh.vertex_groups): mesh.vertex_groups.remove(group)
        groups = {b.name: mesh.vertex_groups.new(name=b.name) for b in data.bones}
        refs = mesh.data.attributes['reference_position'].data
        counts = {name: 0 for name in groups}; maximum = 0; deviation = 0.
        for vertex, ref in zip(mesh.data.vertices, refs):
            p = ref.vector; x, y, z = p; weights = {}
            # The source arms are separated from the torso and thighs. These
            # original coordinates remain reliable after the right elbow bends.
            arm_total = 0.
            for side, sign in [('r', -1), ('l', 1)]:
                a = arms[side]; sz = a['s'].z; sx = abs(a['s'].x)
                inner = sx-.035*h+.45*max(0, sz-z)
                membership = smooth(inner, inner+.025*h, x*sign)*(1-smooth(sz+.005*h, sz+.07*h, z))*smooth(.22*h, .32*h, z)
                along = (p-a['e']).dot((a['h']-a['s']).normalized())
                elbow = smooth(-.045*h, .045*h, along)
                weights['upper_arm_'+side] = membership*(1-elbow)
                weights['forearm_'+side] = membership*elbow
                arm_total += membership
            remaining = 1-min(1., arm_total)
            neck = .745 if id == 'child' else 1.28
            head = smooth(neck-.025, neck+.035, z)
            weights['head'] = remaining*head
            remaining *= 1-head
            # Blend the pelvis into each thigh only below the hip crease. The
            # short center strip stays on the pelvis to keep the crotch joined.
            hip_low = .355 if id == 'child' else .665
            hip_high = .445 if id == 'child' else .80
            leg = (1-smooth(hip_low, hip_high, z))
            center = smooth(.018*h, .05*h, abs(x))
            leg *= 1-smooth(hip_low-.055*h, hip_high-.04*h, z)*(1-center)
            side = 'r' if x < 0 else 'l'
            knee_z = .235 if id == 'child' else .43
            ankle_z = .05 if id == 'child' else .065
            shin = 1-smooth(knee_z-.035*h, knee_z+.035*h, z)
            foot = 1-smooth(ankle_z, ankle_z+.035*h, z)
            weights['thigh_'+side] = remaining*leg*(1-shin)
            weights['shin_'+side] = remaining*leg*shin*(1-foot)
            weights['foot_'+side] = remaining*leg*shin*foot
            trunk = remaining*(1-leg)
            upper = smooth(pelvis_z, pelvis_z+.12*h, z)
            weights['hips'] = trunk*(1-upper); weights['spine'] = trunk*upper
            # Limit to four influences and normalize for glTF / GPU skinning.
            selected = sorted(((k, v) for k, v in weights.items() if v > 1e-6), key=lambda p: -p[1])[:4]
            total = sum(v for _, v in selected)
            assert total > .01, (id, vertex.index)
            maximum = max(maximum, len(selected)); deviation = max(deviation, abs(total-1))
            for name, value in selected:
                groups[name].add([vertex.index], value/total, 'REPLACE'); counts[name] += 1
        mod = mesh.modifiers.new('Shared human walking skin', 'ARMATURE'); mod.object = rig
        mod.use_deform_preserve_volume = False  # Match glTF linear-blend skinning.
        mesh.data.calc_loop_triangles()
        facts[mesh.name] = dict(vertices=len(mesh.data.vertices), triangles=len(mesh.data.loop_triangles),
                               max_influences=maximum, pre_normalization_max_loss=deviation,
                               influenced_vertices=counts)
    # Bone-parent the real socket with an exact rest matrix. Carry and label stay
    # rooted, so locomotion never changes their established gameplay positions.
    bpy.context.view_layer.update(); before = socket.matrix_world.copy()
    socket.parent = rig; socket.parent_type = 'BONE'; socket.parent_bone = 'forearm_r'
    bpy.context.view_layer.update(); socket.matrix_world = before
    bpy.context.view_layer.update()
    assert (socket.matrix_world.translation-before.translation).length < 1e-6
    return rig, facts


def pose(rig, phase):
    root = rig.parent
    root.location.z = 0
    for b in rig.pose.bones: b.matrix_basis.identity()
    bpy.context.view_layer.update()
    foot_rest = {side:(rig.matrix_world @ rig.pose.bones['foot_'+side].head).z for side in ('r','l')}
    # Model-space X rotation is transformed through the REST parent frame.
    for side, sign in [('r', 1), ('l', -1)]:
        swing = math.sin(phase)*sign
        thigh = -.36*swing
        shin = .58*max(0., -swing)**2
        angles = {'thigh_'+side: thigh, 'shin_'+side: shin,
                  'foot_'+side: -thigh-shin, 'upper_arm_'+side: .25*swing,
                  'forearm_'+side: -.12*max(0., swing)}
        for name, angle in angles.items():
            p = rig.pose.bones[name]
            axis = p.bone.matrix_local.to_quaternion().inverted() @ Vector((1, 0, 0))
            p.rotation_mode = 'QUATERNION'; p.rotation_quaternion = Quaternion(axis, angle)
    bpy.context.view_layer.update()
    rises = [(rig.matrix_world @ rig.pose.bones['foot_'+side].head).z-foot_rest[side] for side in ('r','l')]
    root.location.z = -min(rises)
    bpy.context.view_layer.update()


def inspect(id, path, render):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
    # Blender's glTF importer creates an Icosphere bone-display helper. It is
    # not in the GLB and is excluded from asset measurements and renders.
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.name.startswith('outfit_')]
    report = dict(id=id, glb_sha256=sha(path), bytes=path.stat().st_size,
                  bone_count=len(rig.data.bones), bones=list(rig.data.bones.keys()), outfits={})
    for mesh in meshes:
        mesh.data.calc_loop_triangles()
        report['outfits'][mesh.name] = dict(triangles=len(mesh.data.loop_triangles), vertices=len(mesh.data.vertices))
    report['rest_sockets_blender_xyz'] = {o.name:list(o.matrix_world.translation) for o in bpy.context.scene.objects if o.name.startswith('socket_')}
    phases = [0., math.pi/2, math.pi, math.pi*1.5]
    snapshots = []
    for phase in phases:
        pose(rig, phase)
        evaluated = bpy.context.evaluated_depsgraph_get()
        sample = dict(phase=phase, hand=list(bpy.data.objects['socket_hand_r'].matrix_world.translation),
                      root_vertical_offset=rig.parent.location.z,
                      foot_ankles_blender_xyz={s:list(rig.matrix_world @ rig.pose.bones['foot_'+s].head) for s in ('r','l')}, outfits={})
        for mesh in meshes:
            obj = mesh.evaluated_get(evaluated)
            coords = np.array([obj.matrix_world @ v.co for v in obj.data.vertices])
            assert np.isfinite(coords).all()
            hand_distance=float(np.linalg.norm(coords-np.array(sample['hand']),axis=1).min())
            assert hand_distance < .04, (id,mesh.name,'socket outside palm',hand_distance)
            sample['outfits'][mesh.name] = dict(bounds_blender_xyz=[coords.min(0).tolist(), coords.max(0).tolist()],
                                               hand_nearest_vertex_distance=hand_distance)
        snapshots.append(sample)
    report['posed_frames'] = snapshots
    report['hand_stride_distance'] = (Vector(snapshots[1]['hand'])-Vector(snapshots[3]['hand'])).length
    assert report['bone_count'] == 13 and report['hand_stride_distance'] > .05
    if id == 'adult': assert abs(report['rest_sockets_blender_xyz']['socket_carry'][2]-.9) < 1e-6
    (QUALITY/f'{id}-rig-measurements.json').write_text(json.dumps(report, indent=2)+'\n')
    if render:
        scene = bpy.context.scene; h = REF['CFG'][id]['h']
        scene.render.engine = 'CYCLES'; scene.cycles.samples = 24; scene.cycles.use_denoising = True
        scene.render.resolution_x = scene.render.resolution_y = 640
        scene.render.resolution_percentage = 100; scene.view_settings.view_transform = 'AgX'
        scene.world = bpy.data.worlds.new('Neutral quality review'); scene.world.use_nodes = True
        scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.11, .11, .11, 1)
        scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .6
        for pos, power, size in [((1.7,-2.6,3),350,2.4),((-2,-1.4,1.3),150,2.5),((.5,2,2.3),200,1.8)]:
            bpy.ops.object.light_add(type='AREA', location=Vector(pos)*h); light=bpy.context.object
            light.data.energy=power*h*h; light.data.size=size*h
            light.rotation_euler=(Vector((0,0,h*.5))-light.location).to_track_quat('-Z','Y').to_euler()
        bpy.ops.object.camera_add(); cam=bpy.context.object; cam.data.type='ORTHO'; scene.camera=cam; cam.data.ortho_scale=h*1.15
        for outfit in ('clothed','bath'):
            for mesh in meshes: mesh.hide_render=mesh.name!='outfit_'+outfit
            for label, phase in [('rest',0),('right_forward',math.pi/2),('left_forward',math.pi*1.5)]:
                pose(rig,phase)
                for name,direction in [('front',(0,-1,.03)),('threequarter',(.75,-1,.15)),('side',(1,-.05,.05))]:
                    if label=='rest' and name!='front': continue
                    target=Vector((0,0,h*.50));cam.location=target+Vector(direction).normalized()*h*4
                    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
                    scene.render.filepath=str(QUALITY/f'{id}-{outfit}-{label}-{name}.png')
                    bpy.ops.render.render(write_still=True);REF['strip_png'](Path(scene.render.filepath))
    return report


def audit(id, blend, path):
    """Inspect reopened editable binary, not just its compressed byte stream."""
    bpy.ops.wm.open_mainfile(filepath=str(blend))
    assert all(i.packed_file for i in bpy.data.images if i.type == 'IMAGE')
    private = OUT/f'{id}-uncompressed-audit.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(private),compress=False,copy=True)
    patterns = {'private_home_path':rb'/(?:Users|home)/[^/\x00\s]+/',
                'email_like':rb'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}',
                'token_prefix':rb'(?:github_pat_|ghp_|sk-proj-)[A-Za-z0-9_-]{10,}'}
    findings = {}
    for label, data in [('reopened_blend',private.read_bytes()),('candidate_glb',path.read_bytes())]:
        findings[label] = [name for name,pattern in patterns.items() if re.search(pattern,data)]
    private.unlink()
    raw=path.read_bytes();count=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+count])
    assert len(g['meshes']) == 2 and len(g['skins']) == 1 and len(g['skins'][0]['joints']) == 13
    assert len(g['materials']) == 2 and len(g['images']) == 2
    images=[]
    for entry in g['images']:
        view=g['bufferViews'][entry['bufferView']];start=28+count+view.get('byteOffset',0)
        blob=raw[start:start+view['byteLength']];size=list(struct.unpack_from('>II',blob,16))
        assert size == [1024,1024]
        offset=8;chunks=[]
        while offset<len(blob):
            length=struct.unpack_from('>I',blob,offset)[0];chunks.append(blob[offset+4:offset+8].decode());offset+=length+12
        assert not {'eXIf','tEXt','zTXt','iTXt'}.intersection(chunks)
        images.append({'size':size,'chunks':chunks})
    assert not any(findings.values()), findings
    result={'result':'PASS','scope':'Heuristic private paths, emails, token prefixes, embedded PNG ancillary metadata; not exhaustive',
            'artifacts':findings,'glb_meshes':len(g['meshes']),'skin_joints':len(g['skins'][0]['joints']),
            'images':images,'blend_sha256':sha(blend),'glb_sha256':sha(path)}
    (QUALITY/f'{id}-metadata-audit.json').write_text(json.dumps(result,indent=2)+'\n')


def main():
    args = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    parser=argparse.ArgumentParser();parser.add_argument('--only',choices=['child','adult'])
    parser.add_argument('--adult-source',type=Path,default=ROOT/'assets/adult/blend/adult__face_uv_v03.blend')
    parser.add_argument('--render',action='store_true')
    opt=parser.parse_args(args)
    for p in (OUT,SOURCE,QUALITY): p.mkdir(parents=True,exist_ok=True)
    for id in ([opt.only] if opt.only else ['child','adult']):
        source=opt.adult_source.resolve() if id=='adult' else ROOT/f'assets/{id}/blend/{id}__v02.blend'
        source_hash=sha(source)
        bpy.ops.wm.open_mainfile(filepath=str(source))
        root=bpy.data.objects[id];meshes=[bpy.data.objects['outfit_'+x] for x in ('clothed','bath')]
        rig,weights=make_rig(id,root,meshes)
        root['rig_source']=f'assets/human_walk/blend/{id}__walk_v03.blend'
        root['modifications']=root.get('modifications','')+'; 13-bone shared humanoid rig with source-space normalized weights and hand socket tracking'
        # Remove any transient absolute image paths before preserving the file.
        for image in bpy.data.images:
            if image.packed_file: image.filepath='//'+image.name+'.png'
        for screen in bpy.data.screens:
            for area in screen.areas:
                if area.type=='FILE_BROWSER':
                    try: area.spaces.active.params.directory=b'/'*1023;area.spaces.active.params.directory=b'//'
                    except Exception: pass
        bpy.context.scene.world=None;bpy.context.scene.render.filepath='//'
        bpy.context.preferences.filepaths.save_version=0
        blend=SOURCE/f'{id}__walk_v03.blend'
        bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=True)
        bpy.ops.object.select_all(action='DESELECT')
        for o in [root,*root.children_recursive]: o.hide_set(False);o.hide_render=False;o.select_set(True)
        path=OUT/f'{id}.glb'
        bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_extras=True,
            export_apply=False,export_materials='EXPORT',export_yup=True,export_cameras=False,export_lights=False,
            export_animations=False,export_skins=True,export_all_influences=False,
            export_copyright='Meshy 6 Lite output, CC BY 4.0; Blender modifications by Sento Duck Explorer')
        clean=SANITIZE(path)
        report=inspect(id,path,opt.render)
        report.update(source_file=str(source.relative_to(ROOT)),source_sha256=source_hash,
                      blend_file=str(blend.relative_to(ROOT)),blend_sha256=sha(blend),weights=weights,sanitization=clean)
        (QUALITY/f'{id}-rig-measurements.json').write_text(json.dumps(report,indent=2)+'\n')
        audit(id,blend,path)
        print(json.dumps({'id':id,'bytes':report['bytes'],'sha256':report['glb_sha256'],'bones':report['bone_count']}))


if __name__=='__main__': main()
