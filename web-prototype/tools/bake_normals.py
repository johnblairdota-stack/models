"""
Bake the 1.96M-tri Meshy high-poly down to a 60k game mesh plus a tangent-space
normal map, in Blender 4.5.

WHY THIS EXISTS
---------------
Meshy gives two useful things and neither is shippable on its own:

  High Detail      1,960,264 tris   every panel gap and edge, unusable in a game
  Smart Topology      15,864 tris   clean, but capped at 15k and the budget is 60k

So the route to 60k is our own reduction of the high-poly, and the detail that
the reduction throws away is put back as a normal map baked FROM the high-poly.
The geometry carries the silhouette; the map carries the panel lines.

WHAT IT DOES
------------
  1. import the high-poly
  2. reduce it to --target tris (default 60000)
  3. unwrap the reduced mesh (it arrives with NO uvs at all)
  4. bake high -> low, tangent-space normal, --size px
  5. write <out>.glb and <out>_normal.png

CONTROLS THAT MUST FAIL
-----------------------
Every assertion here ships with a way to make it fail, so a green run means the
check ran rather than that it was never reached:

  --control-notarget   skips the reduction, so the tri-count assertion fires
  --control-nouv       skips the unwrap, so the uv assertion fires
  --control-flatbake   bakes the LOW onto itself, so the map comes out flat and
                       the "map carries detail" assertion fires

A flat tangent-space normal map is uniform (128,128,255). That is what a bake
that silently did nothing produces, and it is the failure this tool is most
likely to hit, so it is measured rather than assumed: the run reports the
fraction of pixels that differ from flat, and asserts on it.

USAGE
  blender -b --factory-startup --python tools/bake_normals.py -- \
      --high assets/highpoly/hp_source.glb \
      --out  assets/highpoly/player60k \
      --target 60000 --size 2048
"""

import bpy
import sys
import os
import argparse
import math
import time


# THE GATE, AND WHY IT IS THIS ONE AND NOT THE TWO OBVIOUS ONES.
#
# Both arms were run at both resolutions before this number was chosen:
#
#   arm            size   mean(all)   mean(written)   written%
#   real            256      0.1351          0.1784      75.5
#   flat control    256      0.0896          0.5544      15.9
#   real           2048      0.0848          0.1992      42.0
#   flat control   2048      0.0520          0.5963       8.4
#
# An AREA FRACTION over a fixed epsilon fails: the real bake reads 18.31% over
# eps 0.20 at 256 px and 11.03% at 2048 px, so the same asset passes or fails
# depending only on --size.
#
# MEAN(ALL) fails too, and less obviously: real@2048 is 0.0848 while
# flat@256 is 0.0896, so the control OUTSCORES the real bake across
# resolutions and any single threshold mislabels one of them.
#
# WRITTEN% separates by ~5x at both resolutions and in the same direction, so
# that is the gate. Proven at 256 and 2048; not proven above 2048.
#
# mean(written) is reported but not gated. It is the seam-garbage tell: the
# control's written pixels are almost all UV-island border garbage and average
# 0.55-0.60, where a real bake's average 0.18-0.20. If a future run ever shows
# a high written% together with a mean(written) near 0.55, the map is seams
# rather than detail and this gate would not catch it.
WRITTEN_GATE = 0.30


def parse():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--high', required=True)
    p.add_argument('--low', default=None,
                   help='existing low-poly to bake onto. Without it the '
                        'high-poly is decimated to --target instead.')
    p.add_argument('--out', required=True)
    p.add_argument('--target', type=int, default=60000)
    p.add_argument('--size', type=int, default=2048)
    p.add_argument('--extrusion', type=float, default=0.01)   # metres, cage push-out
    p.add_argument('--raydist', type=float, default=0.03)     # metres, max ray
    p.add_argument('--samples', type=int, default=1)
    p.add_argument('--control-notarget', action='store_true')
    p.add_argument('--control-nouv', action='store_true')
    p.add_argument('--control-flatbake', action='store_true')
    return p.parse_args(argv)


def die(code, msg):
    print("\n!! FAIL: " + msg + "\n")
    sys.exit(code)


def tri_count(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def main():
    a = parse()
    t0 = time.time()

    bpy.ops.wm.read_factory_settings(use_empty=True)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(a.high))
    meshes = [o for o in set(bpy.data.objects) - before if o.type == 'MESH']
    if len(meshes) != 1:
        die(1, "expected one mesh in " + a.high + ", found " + str(len(meshes)))
    high = meshes[0]
    high.name = 'HIGH'
    n_high = tri_count(high)
    print("[1] high-poly: %d verts, %d tris" % (len(high.data.vertices), n_high))
    if n_high < 500000:
        die(1, "high-poly is only %d tris - that is not the High Detail asset" % n_high)

    # ---- 2. get the low-poly --------------------------------------------
    if a.low:
        # Supplied low-poly. Meshy's own Remesh is the intended source: it
        # retopologises THIS high-poly, so the two are the same shape in the
        # same pose by construction. Run tools/_bake_align.py first - a
        # low-poly from a SEPARATE generation is a different robot and the
        # bake would paint detail onto empty space.
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.abspath(a.low))
        lm = [o for o in set(bpy.data.objects) - before if o.type == 'MESH']
        if len(lm) != 1:
            die(1, "expected one mesh in " + a.low + ", found " + str(len(lm)))
        low = lm[0]
        low.name = 'LOW'
        print("[2] supplied low-poly: " + a.low)
    else:
        low = high.copy()
        low.data = high.data.copy()
        low.name = 'LOW'
        bpy.context.collection.objects.link(low)

    if a.low:
        pass
    elif a.control_notarget:
        print("[2] CONTROL --control-notarget: skipping the reduction")
    else:
        ratio = a.target / n_high
        dec = low.modifiers.new('dec', 'DECIMATE')
        dec.decimate_type = 'COLLAPSE'
        dec.ratio = ratio
        dec.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = low
        bpy.ops.object.modifier_apply(modifier='dec')
        print("[2] reduced at ratio %.5f" % ratio)

    n_low = tri_count(low)
    print("    low-poly: %d verts, %d tris" % (len(low.data.vertices), n_low))
    if a.low:
        # a supplied mesh is whatever it is; only guard against the wrong file
        if n_low > n_high * 0.5:
            die(2, "supplied low-poly is %d tris against the high-poly's %d - "
                   "that is not a reduction" % (n_low, n_high))
    else:
        # 5 percent either side - decimate lands near the target, not on it
        if not (a.target * 0.95 <= n_low <= a.target * 1.05):
            die(2, "low-poly is %d tris, outside 5%% of the %d target"
                % (n_low, a.target))

    # ---- 3. unwrap -------------------------------------------------------
    # Meshy's Remesh ships a UVMap already. Keep it rather than overwrite it:
    # its islands are laid out for this body, and a re-project would throw that
    # away for nothing.
    if a.low and low.data.uv_layers and not a.control_nouv:
        print("[3] keeping the supplied uv layer %r"
              % low.data.uv_layers.active.name)
    elif a.control_nouv:
        print("[3] CONTROL --control-nouv: skipping the unwrap")
        while low.data.uv_layers:
            low.data.uv_layers.remove(low.data.uv_layers[0])
    else:
        bpy.ops.object.select_all(action='DESELECT')
        low.select_set(True)
        bpy.context.view_layer.objects.active = low
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003)
        bpy.ops.object.mode_set(mode='OBJECT')
        print("[3] smart-projected uvs")

    if not low.data.uv_layers:
        die(3, "low-poly has no uv layer - a normal map has nowhere to land")
    # a real unwrap spreads uvs across the square; a degenerate one collapses them
    uv = low.data.uv_layers.active.data
    us = [d.uv[0] for d in uv]
    vs = [d.uv[1] for d in uv]
    span_u = max(us) - min(us)
    span_v = max(vs) - min(vs)
    print("    uv span: u %.3f v %.3f  over %d loops" % (span_u, span_v, len(uv)))
    if span_u < 0.5 or span_v < 0.5:
        die(3, "uvs collapsed (span %.3f x %.3f) - unwrap failed" % (span_u, span_v))

    # ---- 4. bake ---------------------------------------------------------
    img = bpy.data.images.new('normal', a.size, a.size, alpha=False, float_buffer=False)
    img.colorspace_settings.name = 'Non-Color'

    mat = bpy.data.materials.new('bake')
    mat.use_nodes = True
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = img
    mat.node_tree.nodes.active = tex
    low.data.materials.clear()
    low.data.materials.append(mat)

    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = a.samples
    sc.render.bake.use_selected_to_active = True
    sc.render.bake.cage_extrusion = a.extrusion
    sc.render.bake.max_ray_distance = a.raydist
    sc.render.bake.margin = 8
    sc.render.bake.use_clear = True

    bpy.ops.object.select_all(action='DESELECT')
    if a.control_flatbake:
        # A DUPLICATE of the low, not the low itself: selected-to-active refuses
        # a source that is also the target ("No valid selected objects"), so
        # pointing src at `low` would crash rather than bake flat. A co-located
        # copy makes every ray land on the surface it started from, which is the
        # definition of a flat tangent-space normal.
        print("[4] CONTROL --control-flatbake: baking a COPY of LOW onto LOW")
        src = low.copy()
        src.data = low.data.copy()
        src.name = 'LOWCOPY'
        bpy.context.collection.objects.link(src)
        src.select_set(True)
    else:
        src = high
        src.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low

    print("[4] baking %dx%d from %s -> LOW (extrusion %g m, ray %g m) ..."
          % (a.size, a.size, src.name, a.extrusion, a.raydist))
    bpy.ops.object.bake(type='NORMAL', use_clear=True)
    print("    bake done at %.0fs" % (time.time() - t0))

    # Did the map actually receive detail, or is it flat?
    #
    # A count at one epsilon does NOT discriminate, which was measured rather
    # than assumed: at eps 0.02 the real bake reads 66.2% and --control-flatbake
    # reads 12.2%, because a smooth-shaded triangulated mesh baked onto itself
    # still shows interpolation noise. So the gate is read at several epsilons.
    # Noise dies as epsilon grows; real panel lines do not.
    px = list(img.pixels)
    n = len(px) // 4
    eps_list = (0.02, 0.05, 0.10, 0.20)
    counts = [0] * len(eps_list)
    devs = []
    for i in range(0, n * 4, 4):
        # flat tangent normal is (0.5, 0.5, 1.0) in linear float
        d = max(abs(px[i] - 0.5), abs(px[i + 1] - 0.5), abs(px[i + 2] - 1.0))
        devs.append(d)
        for k, e in enumerate(eps_list):
            if d > e:
                counts[k] += 1
    print("[5] fraction of map away from flat, by epsilon:")
    for e, c in zip(eps_list, counts):
        print("      eps %.2f : %7d/%d = %6.2f%%" % (e, c, n, c / n * 100))

    # See WRITTEN_GATE at the top for why this is the gate and the two obvious
    # alternatives are not.
    devs.sort()
    written = [d for d in devs if d > 0.004]      # untouched pixels sit at flat
    mean_all = sum(devs) / n
    mean_w = (sum(written) / len(written)) if written else 0.0
    frac_w = len(written) / n
    p50 = devs[n // 2]
    p99 = devs[int(n * 0.99)]
    print("      mean(all) %.4f   mean(written) %.4f   p50 %.4f   p99 %.4f   "
          "written %.1f%%" % (mean_all, mean_w, p50, p99, frac_w * 100))
    if frac_w < WRITTEN_GATE:
        die(4, "the bake wrote only %.1f%% of the map, under the %.0f%% gate - "
               "it carried no real detail" % (frac_w * 100, WRITTEN_GATE * 100))
    if mean_w > 0.45:
        die(4, "written pixels average %.4f deviation - that is UV-seam "
               "garbage, not panel detail" % mean_w)

    # ---- 5. write --------------------------------------------------------
    out = os.path.abspath(a.out)
    img.filepath_raw = out + '_normal.png'
    img.file_format = 'PNG'
    img.save()
    print("[6] wrote " + img.filepath_raw)

    bpy.data.objects.remove(high, do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    bpy.ops.export_scene.gltf(filepath=out + '.glb', export_format='GLB',
                              use_selection=True, export_normals=True,
                              export_tangents=True)
    print("[6] wrote " + out + ".glb")
    print("\nOK  %d tris -> %d tris + %dpx normal map in %.0fs"
          % (n_high, n_low, a.size, time.time() - t0))


# Blender exits 0 after an uncaught Python exception, so a crashed run reports
# SUCCESS to whatever called it. That was watched happening on the first version
# of --control-flatbake. Never let a traceback reach the exit code.
try:
    main()
except SystemExit:
    raise
except Exception:
    import traceback
    traceback.print_exc()
    print("\n!! FAIL: unhandled exception - see traceback above\n")
    sys.exit(9)
