"""
Compare two rigs' bone names, so retargeting is a decision rather than a hope.

  blender -b --factory-startup --python tools/_rig_compare.py -- --a <glb> --b <glb>

Prints each skeleton's bone list, the intersection, and what only one side has. If the names
match, the existing merged clips can drive the new body directly. If they do not, every clip
needs retargeting and that is a different job entirely.
"""

import bpy
import sys
import math
from mathutils import Vector
import os
import argparse


def parse():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--a', required=True)
    p.add_argument('--b', required=True)
    return p.parse_args(argv)


def rest_dirs(path):
    """Bone name -> (unit rest direction, rest length). The thing names and parents omit."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(path))
    arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    if not arms:
        return {}
    out = {}
    for b in arms[0].data.bones:
        v = b.tail_local - b.head_local
        out[b.name] = (v.normalized() if v.length > 1e-9 else Vector((0, 0, 1)), v.length)
    return out


def bones(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(path))
    arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    if not arms:
        return [], []
    names = [b.name for b in arms[0].data.bones]
    # parent -> child, so a rename can be told apart from a re-parent
    tree = [(b.name, b.parent.name if b.parent else None) for b in arms[0].data.bones]
    return names, tree


def main():
    a = parse()
    na, ta = bones(a.a)
    nb, tb = bones(a.b)
    print("A %s: %d bones" % (os.path.basename(a.a), len(na)))
    print("   " + ", ".join(na))
    print("B %s: %d bones" % (os.path.basename(a.b), len(nb)))
    print("   " + ", ".join(nb))

    sa, sb = set(na), set(nb)
    print("\nshared      %d: %s" % (len(sa & sb), sorted(sa & sb)))
    print("only in A   %d: %s" % (len(sa - sb), sorted(sa - sb)))
    print("only in B   %d: %s" % (len(sb - sa), sorted(sb - sa)))

    if sa == sb:
        da = dict(ta)
        db = dict(tb)
        diff = [n for n in sa if da.get(n) != db.get(n)]
        print("\nNAMES MATCH EXACTLY.")
        print("parent differs on %d bone(s): %s" % (len(diff), sorted(diff)))

        # 🚨 NAMES AND PARENTS ARE NOT ENOUGH, AND THIS TOOL SAID THEY WERE.
        #
        # Its first version printed "VERDICT: the existing clips can drive this body" for these
        # two rigs, `tools/merge_clips.py` believed it, and the merged character flew off the
        # ground plane on every clip. John caught it by eye: "the feet are moving from the point
        # and the animation doesn't look like its on the same plane."
        #
        # A rotation keyframe is RELATIVE TO THE BONE'S REST ORIENTATION. Two rigs can share every
        # name and every parent and still hold their bones pointing different ways, and then the
        # same key means a different pose. Measured on these two: `Hips` - the ROOT - differs by
        # 114.86 degrees, and the thigh bones differ in LENGTH by 52%.
        rest_a, rest_b = rest_dirs(a.a), rest_dirs(a.b)
        rows = []
        for n in sorted(sa):
            if n not in rest_a or n not in rest_b:
                continue
            ang = math.degrees(rest_a[n][0].angle(rest_b[n][0]))
            lr = (rest_b[n][1] / rest_a[n][1]) if rest_a[n][1] > 1e-9 else float('inf')
            rows.append((ang, n, lr))
        rows.sort(reverse=True)
        print("\nREST POSE, worst 6 by direction:")
        print("  %-16s %9s %9s" % ('bone', 'angle', 'lenB/lenA'))
        for ang, n, lr in rows[:6]:
            print("  %-16s %8.2f째 %9.3f" % (n, ang, lr))
        worst = rows[0][0] if rows else 0.0
        worst_len = max((abs(1 - r[2]) for r in rows), default=0.0)
        print("\nworst rest-direction difference: %.2f deg" % worst)
        print("worst bone-length difference:    %.1f%%" % (worst_len * 100))

        if diff:
            print("\nVERDICT: names match but the HIERARCHY differs - do not reuse clips.")
        elif worst > 5.0 or worst_len > 0.15:
            print("\nVERDICT: NOT A DROP-IN. Names and parents match, but the REST POSES do not, "
                  "so a rotation key means a different pose on each rig. Clips copied across will "
                  "look plausible in some frames and badly wrong in others. This needs a real "
                  "RETARGET, or the animations regenerated on the target rig.")
        else:
            print("\nVERDICT: the existing clips can drive this body.")
    else:
        print("\nVERDICT: the skeletons are NOT the same. Clips do not transfer without "
              "retargeting.")


try:
    main()
except SystemExit:
    raise
except Exception:
    import traceback
    traceback.print_exc()
    print("\n!! FAIL: unhandled exception\n")
    sys.exit(9)
