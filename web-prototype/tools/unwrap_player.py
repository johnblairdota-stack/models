"""
RE-UNWRAP THE GENERATED PLAYER, so the shell's panel-seam network reads as plating.

    "C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe" --background --factory-startup ^
      --python tools/unwrap_player.py -- <in.glb> <out.glb>

WHY THIS EXISTS. `src/materials/surfaces/robot.js` bakes panel seams in UV SPACE — the right
choice, because a world- or object-space pattern swims across a skinned mesh as it walks. On the
procedural robot, which has an authored unwrap, it reads as machined plating. On this GLB it reads
as CRACKED PORCELAIN, and the cause is measured rather than guessed:

    Meshy's atlas is 405 charts, median uv-bbox diagonal 0.070 (about 14 cm of surface),
    at arbitrary orientations.

So almost every chart receives one or two grid lines, each at whatever angle that chart happens to
carry, and the eye reads a field of random slashes. Every material metric passed while it looked
like that — seam density 13.0-14.6% against the art's 12.1-13.6%, value spread 163-166 against
~159 — and only facet energy (17.9-18.7 against the art's 9-12) disagreed. **The material is
correct; the unwrap is the defect.**

WHAT THIS DOES, and the two settings that matter:

  Smart UV Project     projects each face group along its DOMINANT NORMAL, so islands come out
                       axis-aligned to the surface they came from rather than at arbitrary angles.
                       That is the whole point — a consistent local grid reads as plating.

  pack_islands(rotate=False)
                       packing is what would undo it. Blender's packer rotates islands to save
                       space by default, which restores exactly the arbitrary orientations this
                       script exists to remove.

WHAT THIS MUST NOT DO. `tools/condition_asset.py` JOINS meshes, and joining destroys a skin
binding. This script never joins, never decimates and never touches the armature, the vertex
groups or the animation data. It edits UVs and nothing else, and it verifies that afterwards.
"""
import sys
import json
import math

import bpy
import bmesh
from mathutils import Vector

# How much of the character one uv unit should cover. `robot.js` sizes its panel grid against
# "2.044 m per uv unit", and the ORIGINAL atlas measures 1.9875 m/uv (p25 1.55, p75 2.61 — the
# spread is why its texel density was uneven), so 2.0 keeps every existing `?seamn=` number
# meaning what its comment says.
TARGET_M_PER_UV = 2.0


def argv_after_ddash():
    if "--" not in sys.argv:
        raise SystemExit("usage: ... --python tools/unwrap_player.py -- <in.glb> <out.glb>")
    return sys.argv[sys.argv.index("--") + 1:]


def chart_stats(mesh_obj):
    """
    Describe the UV atlas the way the defect was described: how many islands, how big, and how
    consistently oriented. `orientDeg` is the circular standard deviation of each island's dominant
    edge direction, folded into 0-90 degrees — a low number means the islands agree on an axis,
    which is what makes a baked grid read as panelling.
    """
    bm = bmesh.new()
    bm.from_mesh(mesh_obj.data)
    uv_layer = bm.loops.layers.uv.active
    if uv_layer is None:
        bm.free()
        return {"charts": 0, "medianDiag": 0.0, "orientDeg": 0.0}

    # Islands: faces connected through shared UV coordinates.
    faces = list(bm.faces)
    seen = set()
    islands = []
    for f in faces:
        if f.index in seen:
            continue
        stack, group = [f], []
        seen.add(f.index)
        while stack:
            cur = stack.pop()
            group.append(cur)
            for loop in cur.loops:
                uv = loop[uv_layer].uv
                for other_loop in loop.vert.link_loops:
                    of = other_loop.face
                    if of.index in seen:
                        continue
                    if (other_loop[uv_layer].uv - uv).length < 1e-6:
                        seen.add(of.index)
                        stack.append(of)
        islands.append(group)

    diags, angles = [], []
    for group in islands:
        us, vs = [], []
        for f in group:
            for loop in f.loops:
                uv = loop[uv_layer].uv
                us.append(uv.x)
                vs.append(uv.y)
        diags.append(math.hypot(max(us) - min(us), max(vs) - min(vs)))
        # Dominant edge direction of the island, folded to 0..90 deg (a grid has no polarity).
        best, best_len = 0.0, -1.0
        for f in group:
            for e in f.edges:
                if len(e.link_loops) < 1:
                    continue
                a = e.link_loops[0][uv_layer].uv
                other = e.link_loops[0].link_loop_next[uv_layer].uv
                d = other - a
                if d.length > best_len:
                    best_len = d.length
                    best = math.degrees(math.atan2(d.y, d.x)) % 90.0
        angles.append(best)

    bm.free()
    diags.sort()
    median = diags[len(diags) // 2] if diags else 0.0
    # Circular spread on a 90-degree period.
    if angles:
        s = sum(math.sin(math.radians(a * 4)) for a in angles) / len(angles)
        c = sum(math.cos(math.radians(a * 4)) for a in angles) / len(angles)
        r = math.hypot(s, c)
        spread = math.degrees(math.sqrt(max(0.0, -2.0 * math.log(max(r, 1e-9))))) / 4.0
    else:
        spread = 0.0
    return {"charts": len(islands), "medianDiag": round(median, 4), "orientDeg": round(spread, 2)}


def uv_density(mesh_obj):
    """
    METRES OF SURFACE PER UV UNIT, and how uniform it is.

    This is the property that decides whether a baked grid reads: the median sets the plate size,
    and the SPREAD decides whether plates are the same size all over the body or three times
    bigger on the shins than the chest. Measured as world edge length over uv edge length across a
    sample of triangles — the same quantity `harness` measures on the exported GLB, so the two
    can be compared directly.
    """
    mw = mesh_obj.matrix_world
    me = mesh_obj.data
    me.calc_loop_triangles()
    uv = me.uv_layers.active.data
    ratios = []
    for tri in me.loop_triangles:
        if len(ratios) >= 4000:
            break
        l0, l1 = tri.loops[0], tri.loops[1]
        w = (mw @ me.vertices[tri.vertices[0]].co) - (mw @ me.vertices[tri.vertices[1]].co)
        d = (uv[l0].uv - uv[l1].uv).length
        if d > 1e-9 and w.length > 1e-9:
            ratios.append(w.length / d)
    if not ratios:
        return {"mPerUV": 0.0, "p25": 0.0, "p75": 0.0, "spread": 0.0}
    ratios.sort()
    q = lambda f: ratios[int(len(ratios) * f)]
    med, p25, p75 = q(0.5), q(0.25), q(0.75)
    return {"mPerUV": round(med, 4), "p25": round(p25, 4), "p75": round(p75, 4),
            "spread": round(p75 / max(p25, 1e-9), 3)}


def main():
    args = argv_after_ddash()
    if len(args) < 2:
        raise SystemExit("usage: ... -- <in.glb> <out.glb>")
    src, dst = args[0], args[1]

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)

    """
    ⚠️ PICK THE SKINNED MESH BY ITS ARMATURE, NOT BY BEING THE ONLY ONE. This GLB also carries an
    `Icosphere` — a leftover from generation. Asserting "exactly one mesh" made the script refuse
    to run at all, and blindly taking the first would have unwrapped the wrong object and exported
    a body whose atlas had not changed, which is a defect no downstream number would attribute to
    this step.
    """
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    skinned = [o for o in meshes
               if any(m.type == "ARMATURE" for m in o.modifiers) and len(o.vertex_groups) > 0]
    if len(skinned) != 1:
        raise SystemExit(
            f"expected exactly one SKINNED mesh, found {len(skinned)} "
            f"among {[(m.name, len(m.vertex_groups)) for m in meshes]}")
    obj = skinned[0]
    others = [m.name for m in meshes if m is not obj]
    if others:
        print(f"NOTE: leaving non-skinned meshes untouched: {others}")

    before = {
        "tris": len(obj.data.loop_triangles) or sum(len(p.vertices) - 2 for p in obj.data.polygons),
        "verts": len(obj.data.vertices),
        "groups": len(obj.vertex_groups),
        "actions": len(bpy.data.actions),
        "armatures": len([o for o in bpy.data.objects if o.type == "ARMATURE"]),
        "uv": chart_stats(obj),
        "density": uv_density(obj),
    }

    # ---- the unwrap itself
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    """
    ⚠️ CUBE PROJECTION, NOT SMART UV PROJECT, AND THE FIRST ATTEMPT PROVES WHY.

    Smart UV Project at a 66-degree angle limit took the atlas from 405 charts to **2,269** — it
    cuts at every crease, and this is a faceted 10k-triangle mesh, so it is nearly all creases.
    More, smaller, still-arbitrary islands is the defect made worse.

    Cube projection maps every face along its dominant WORLD AXIS. Islands are therefore
    axis-aligned by construction, which is exactly the property the panel grid needs: the seams
    become a world-aligned grid on the body instead of a slash per chart.

    OVERLAPPING UVs ARE FINE HERE and that is what makes this legitimate. The shell is a
    PROCEDURAL pattern sampled in uv, not a unique painted atlas — two parts landing on the same
    uv region simply carry the same plating, which is what a real assembly does anyway. So no
    packing step, and none of the orientation damage a packer would do.

    `cube_size` is the metres-per-uv-unit mapping, and 2.044 is deliberate: `robot.js` sizes its
    grid against "2.044 m per uv unit", so the existing `?seamn=` numbers keep meaning what their
    comments say they mean.
    """
    """
    ⚠️ `cube_size` IS DERIVED FROM THE OBJECT'S SCALE, NOT HARDCODED, AND THE FIRST RUN SHOWS WHY.

    cube_project divides LOCAL coordinates by cube_size, and this GLB carries the 0.01/100 scale
    pair the rest of the pipeline already trips over: the mesh data is ~170 units for a 1.7 m
    character. A hand-picked 0.489 therefore produced **0.005 m per uv unit** — a grid 400x too
    fine, which would have baked as flat grey mush and read as "the seams stopped working".

        m_per_uv = world_extent * cube_size / local_extent = cube_size * object_scale

    so cube_size = TARGET / object_scale. Self-correcting if the exporter's scaling ever changes.
    """
    obj_scale = sum(obj.matrix_world.to_scale()) / 3.0
    if obj_scale <= 0:
        raise SystemExit("object world scale is zero; cannot derive cube_size")
    cube_size = TARGET_M_PER_UV / obj_scale
    print(f"NOTE: object scale {obj_scale:.5f} -> cube_size {cube_size:.3f} "
          f"for {TARGET_M_PER_UV} m per uv unit")
    bpy.ops.uv.cube_project(cube_size=cube_size, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")

    obj.data.calc_loop_triangles()
    after = {
        "tris": len(obj.data.loop_triangles),
        "verts": len(obj.data.vertices),
        "groups": len(obj.vertex_groups),
        "actions": len(bpy.data.actions),
        "armatures": len([o for o in bpy.data.objects if o.type == "ARMATURE"]),
        "uv": chart_stats(obj),
        "density": uv_density(obj),
    }

    # ---- CONTROLS. Anything that changes here means the unwrap did more than unwrap.
    problems = []
    for key in ("verts", "groups", "actions", "armatures"):
        if before[key] != after[key]:
            problems.append(f"{key} changed {before[key]} -> {after[key]}")
    if after["uv"]["charts"] == 0:
        problems.append("the result has no UV islands at all")
    """
    ⚠️ THE CONTROL TESTS ORIENTATION, NOT CHART COUNT, AND THE FIRST VERSION TESTED THE WRONG
    THING. It asserted the atlas must CONSOLIDATE, which is not the defect — 405 charts would be
    perfectly fine if they agreed on an axis. What makes the seams read as cracks is that they do
    not. `orientDeg` is the circular spread of island orientation on a 90-degree period, so a
    world-axis projection should land near zero and the original's arbitrary charts land high.
    """
    """
    ⚠️ `orientDeg` IS REPORTED BUT NOT ASSERTED ON, AND THAT IS A CORRECTION. It measures each
    island's dominant EDGE direction, and on a triangulated mesh the diagonals run at every angle
    inside even a perfectly axis-aligned island — so it reads ~22 degrees before AND after and
    cannot see the property it was written to test. It blocked a probably-correct unwrap once.

    There is no cheap numeric stand-in for "will a baked grid read as plating", so the assertions
    below are limited to what IS checkable — that nothing except the UVs changed — and the look is
    judged from a render, which is the project's standing rule anyway.
    """
    """
    ⚠️ THE CHART-SIZE CONTROL WAS ALSO WRONG AND IS GONE. It asserted islands must GROW in uv
    space; a coarser, correct projection makes them smaller. Two numeric proxies in a row blocked
    a good unwrap, which is the tell that neither was measuring the property. What follows is the
    property: how much surface one uv unit covers, and whether that is uniform across the body.
    """
    d = after["density"]
    if not (TARGET_M_PER_UV * 0.8 <= d["mPerUV"] <= TARGET_M_PER_UV * 1.25):
        problems.append(
            f"uv density is {d['mPerUV']} m per uv unit, target {TARGET_M_PER_UV} — the panel grid "
            f"would bake at the wrong plate size")
    if d["spread"] > 1.6:
        problems.append(
            f"uv density is uneven: p75/p25 = {d['spread']} — plates would be visibly different "
            f"sizes on different body parts")
    print("UNWRAP_STATS " + json.dumps({"before": before, "after": after}))
    if problems:
        print("UNWRAP FAILED:\n  " + "\n  ".join(problems))
        raise SystemExit(2)

    bpy.ops.export_scene.gltf(
        filepath=dst,
        export_format="GLB",
        export_animations=True,
        export_skins=True,
        export_yup=True,
        export_apply=False,
    )
    print("UNWRAP_RESULT " + json.dumps({"before": before, "after": after}))


main()
