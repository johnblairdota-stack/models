"""
PART-vs-JOINT PROBE — does the rig's pivot actually sit where the mesh's limb is?

    blender --background --python tools/probe_parts.py -- --in split.glb --rig assets/rig/unit4h_joints.json

John spotted it by eye: in the generated GLB the thigh meets the pelvis at an ANGLE, which means
the rig's hip pivot and the mesh's thigh axis are not the same line. A part rotated about a pivot
that is not on its own axis does not bend, it SWINGS — and the further the pivot is from the
axis, the more the limb scythes sideways instead of lifting.

This reports, per part, where the mesh's mass actually is against where the rig says the joint is.
It measures and does not fix: which one moves — the rig's joint or the mesh's part — is a design
call, and the numbers should exist before anyone makes it.
"""
import bpy
import sys
import os
import json
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def opt(name, default=None):
    return argv[argv.index("--" + name) + 1] if "--" + name in argv else default


SRC = os.path.abspath(opt("in"))
RIG = os.path.abspath(opt("rig"))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)

with open(RIG, "r", encoding="utf-8") as fh:
    rig = json.load(fh)
J = {k: Vector(v) for k, v in rig["joints"].items()}


def to_blender(v):
    """Rig JSON is glTF Y-up; Blender is Z-up. Same swap the conditioner uses."""
    return Vector((v.x, -v.z, v.y))


print("\n=== PART vs JOINT ===")
print("  part          joint at (x,y,z)        mesh centroid           offset   |dx|")
rows = []
for ob in sorted([o for o in bpy.context.scene.objects if o.type == "MESH"], key=lambda o: o.name):
    key = ob.name.split("__")[-1].split(".")[0]
    if key not in J:
        continue
    # Centroid of the part's own geometry, in world space.
    acc = Vector((0, 0, 0))
    n = 0
    for v in ob.data.vertices:
        acc += ob.matrix_world @ v.co
        n += 1
    if not n:
        continue
    c = acc / n
    j = to_blender(J[key])
    d = c - j
    rows.append((key, j, c, d))
    print("  %-11s (%6.3f %6.3f %6.3f)  (%6.3f %6.3f %6.3f)  %6.3f  %6.3f"
          % (key, j.x, j.y, j.z, c.x, c.y, c.z, d.length, abs(d.x)))

print("\n=== HIP READ ===")
for side in ("L", "R"):
    hk, kk = "hip" + side, "knee" + side
    hip = next((r for r in rows if r[0] == hk), None)
    knee = next((r for r in rows if r[0] == kk), None)
    if not (hip and knee):
        continue
    jhip, jknee = to_blender(J[hk]), to_blender(J[kk])
    rig_axis = (jknee - jhip).normalized()
    # The mesh's own thigh axis: from the thigh's centroid down to the shin's centroid.
    mesh_axis = (knee[2] - hip[2]).normalized()
    ang = rig_axis.angle(mesh_axis)
    print("  %s  rig hip x %+0.4f   thigh centroid x %+0.4f   -> pivot is %+0.4f m inboard"
          % (side, jhip.x, hip[2].x, hip[2].x - jhip.x))
    print("     rig bone axis %s" % ["%+0.3f" % v for v in rig_axis])
    print("     mesh limb axis %s   ANGLE BETWEEN: %.1f deg" % (["%+0.3f" % v for v in mesh_axis], ang * 57.2958))
print("")
