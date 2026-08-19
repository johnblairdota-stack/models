"""
Put the existing animation clips onto a new body that shares the rig.

  blender -b --factory-startup --python tools/merge_clips.py -- \
      --body public/models/anim/friendly_rigged.glb \
      --clips public/models/anim/player_norm30.glb \
      --out  public/models/anim/friendly_merged.glb

WHY THIS IS SAFE HERE, AND WHEN IT WOULD NOT BE
-----------------------------------------------
`mesh-avatar.js` loads ONE file for both the body and its clips, so a new body with only its own
one clip cannot drive the game. Meshy's biped auto-rig is standardised: `tools/_rig_compare.py`
reports the Friendly Robot and the Lumi Bot share all 24 bone names AND the same parent for every
one of them. That is what makes a straight action copy correct rather than a guess.

⚠️ THIS TOOL VERIFIES THAT ITSELF AND REFUSES OTHERWISE. Copying actions between skeletons that
merely have the same bone COUNT would produce a body that animates confidently and wrongly, which
is far worse than a hard failure.

CONTROLS THAT MUST FAIL
  --control-mismatch   renames one bone on the body before the check, so the rig guard fires
  --control-noclips    drops the source actions, so the "clips actually arrived" guard fires
"""

import bpy
import sys
import os
import argparse


def parse():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--body', required=True)
    p.add_argument('--clips', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--control-mismatch', action='store_true')
    p.add_argument('--control-noclips', action='store_true')
    return p.parse_args(argv)


def die(code, msg):
    print("\n!! FAIL: " + msg + "\n")
    sys.exit(code)


def armature_of(objs):
    a = [o for o in objs if o.type == 'ARMATURE']
    return a[0] if a else None


def main():
    a = parse()

    bpy.ops.wm.read_factory_settings(use_empty=True)

    # ---- 1. the body ------------------------------------------------------
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(a.body))
    body_objs = list(set(bpy.data.objects) - before)
    body_arm = armature_of(body_objs)
    if not body_arm:
        die(1, "no armature in " + a.body)
    body_bones = {b.name: (b.parent.name if b.parent else None) for b in body_arm.data.bones}
    body_actions = {act.name for act in bpy.data.actions}
    print("[1] body  %s: %d bones, %d own action(s)"
          % (os.path.basename(a.body), len(body_bones), len(body_actions)))

    if a.control_mismatch:
        # rename a real bone so the comparison below cannot pass
        victim = body_arm.data.bones[5].name
        print("[1] CONTROL --control-mismatch: renaming body bone %r" % victim)
        body_bones['__renamed__' + victim] = body_bones.pop(victim)

    # ---- 2. the clips -----------------------------------------------------
    before = set(bpy.data.objects)
    actions_before = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(a.clips))
    clip_objs = list(set(bpy.data.objects) - before)
    new_actions = [x for x in bpy.data.actions if x not in actions_before]
    clip_arm = armature_of(clip_objs)
    if not clip_arm:
        die(1, "no armature in " + a.clips)
    clip_bones = {b.name: (b.parent.name if b.parent else None) for b in clip_arm.data.bones}
    print("[2] clips %s: %d bones, %d action(s)"
          % (os.path.basename(a.clips), len(clip_bones), len(new_actions)))

    if a.control_noclips:
        print("[2] CONTROL --control-noclips: discarding the source actions")
        new_actions = []

    # ---- 3. THE RIG GUARD -------------------------------------------------
    if set(body_bones) != set(clip_bones):
        only_b = sorted(set(body_bones) - set(clip_bones))
        only_c = sorted(set(clip_bones) - set(body_bones))
        die(2, "the two rigs do not share bone names - copying actions would animate this body "
               "confidently and WRONGLY.\n  only on body:  %s\n  only on clips: %s"
            % (only_b, only_c))
    reparented = [n for n in body_bones if body_bones[n] != clip_bones[n]]
    if reparented:
        die(2, "bone names match but %d bone(s) have a different parent: %s"
            % (len(reparented), sorted(reparented)))
    print("[3] rigs agree: %d bones, identical names and parents" % len(body_bones))

    if not new_actions:
        die(3, "no actions came from " + a.clips + " - there is nothing to merge")

    # ---- 3b. RESCALE THE POSITION TRACKS TO THE TARGET SKELETON ----------
    #
    # 🚨 THE BUG THIS EXISTS FOR, AND IT SHIPPED ONCE. Matching bone NAMES makes rotation tracks
    # transfer correctly and says nothing at all about TRANSLATION tracks. A location keyframe is
    # an absolute distance in the DONOR skeleton's units, so replaying it on a body with different
    # proportions moves the root to the wrong place - and because the root is Hips, the whole
    # figure leaves the ground plane and drifts off its spot.
    #
    # John caught it by eye before any instrument did: "the last model can keep its feet centered
    # but the new one the feet are moving from the point and the animation doesn't look like its
    # on the same plane."
    #
    # Measured on these two: Lumi Bot Hips sit at 0.8471 (0.3137 of body height), the Friendly
    # Robot's at 0.7195 (0.2665) - 15% lower. The clips carry location f-curves with a range of
    # 326 units. Scaling every location value by the hips-height ratio puts the translation back
    # into the target's units.
    def hips_z(arm):
        b = arm.data.bones.get('Hips')
        if not b:
            die(2, "no Hips bone on " + arm.name + " - cannot derive a translation scale")
        return (arm.matrix_world @ b.head_local).z

    z_body = hips_z(body_arm)
    z_clip = hips_z(clip_arm)
    if z_clip <= 1e-6:
        die(2, "donor Hips height is %.6f - refusing to divide by it" % z_clip)
    ratio = z_body / z_clip
    print("[3b] hips %.4f (body) / %.4f (clips) -> scaling location tracks by %.4f"
          % (z_body, z_clip, ratio))

    scaled = 0
    for act in new_actions:
        for fc in act.fcurves:
            if not fc.data_path.endswith('location'):
                continue
            for k in fc.keyframe_points:
                k.co[1] *= ratio
                k.handle_left[1] *= ratio
                k.handle_right[1] *= ratio
            fc.update()
            scaled += 1
    print("[3b] rescaled %d location f-curve(s)" % scaled)
    if scaled == 0:
        die(3, "no location f-curves found to rescale - the donor clips carry no root motion, "
               "which contradicts the 326-unit range measured on them")

    # ---- 4. hand the actions to the body ----------------------------------
    #
    # The actions are already in the blend; what has to change is that they are exported against
    # the BODY's armature. glTF exports an action per NLA/animation on the object it is assigned
    # to, so each source action is stashed onto the body armature as its own NLA strip.
    if not body_arm.animation_data:
        body_arm.animation_data_create()
    body_arm.animation_data.action = None
    for track in list(body_arm.animation_data.nla_tracks):
        body_arm.animation_data.nla_tracks.remove(track)
    for act in new_actions:
        tr = body_arm.animation_data.nla_tracks.new()
        tr.name = act.name
        tr.strips.new(act.name, int(act.frame_range[0]), act)
    print("[4] stashed %d action(s) onto the body's armature" % len(new_actions))

    # drop the donor entirely so its mesh and skeleton cannot reach the export
    for o in clip_objs:
        bpy.data.objects.remove(o, do_unlink=True)

    # ⚠️ THERE IS NO "RIG JUNK" TO STRIP, AND TWO ROUNDS WERE SPENT BELIEVING THERE WAS.
    #
    # Every Blender import of a Meshy rig shows a stray `Icosphere` mesh, 42 verts, beside the
    # body. It is NOT in the GLB. Blender's glTF IMPORTER creates it locally as the viewport
    # display widget for the bones - all 24 pose bones list it as their `custom_shape` - and puts
    # it in a collection named, literally, `glTF_not_exported`.
    #
    # Deleting it "failed" in the most convincing possible way: the scene printed `['char1']`
    # before export and the re-imported file printed `Icosphere` again, because the importer had
    # simply recreated it. A file-level assertion did not help, since it was measuring the same
    # artefact. three.js never sees it - `char-lineup.js` logs a count when it strips one and has
    # never logged a single one.
    print("[4] meshes for export: %s"
          % [o.name for o in bpy.data.objects if o.type == 'MESH'])

    # ---- 5. export --------------------------------------------------------
    out = os.path.abspath(a.out)
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.data.objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB',
                              export_animations=True, export_nla_strips=True,
                              export_skins=True, use_selection=False)
    print("[5] wrote " + out)

    # ---- 6. READ IT BACK. A successful export is not a correct one. -------
    names_expected = sorted(x.name for x in new_actions)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=out)
    arm = armature_of(list(bpy.data.objects))
    got = sorted(x.name for x in bpy.data.actions)
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    tris = 0
    for m in meshes:
        m.data.calc_loop_triangles()
        tris += len(m.data.loop_triangles)
    print("[6] reloaded: %d bones, %d tris, %d action(s)"
          % (len(arm.data.bones) if arm else 0, tris, len(got)))
    if not arm:
        die(4, "the exported file has no armature")
    if len(got) < len(names_expected):
        die(4, "exported %d action(s) but only %d survived the round trip:\n  wanted %s\n  got %s"
            % (len(names_expected), len(got), names_expected, got))
    if tris == 0:
        die(4, "the exported file has no geometry")
    print("\nOK  %d clips on %d tris" % (len(got), tris))


try:
    main()
except SystemExit:
    raise
except Exception:
    import traceback
    traceback.print_exc()
    print("\n!! FAIL: unhandled exception\n")
    sys.exit(9)
