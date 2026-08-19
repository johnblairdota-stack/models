"""
Can the 1.96M high-poly be baked onto a DIFFERENT generation's low-poly?

A selected-to-active bake fires a ray from every point on the low-poly and
records what the high-poly looks like where the ray lands. That only means
anything if the two surfaces are in the same place. They came from separate
Meshy generations, so it is not safe to assume they are.

This measures it before any bake is run:

  1. the two bounding boxes, and the scale between them
  2. after aligning centres and scale, the distance from a sample of low-poly
     points to the nearest high-poly surface

If the p95 distance is a large share of the body's height, no cage setting
saves the bake and the answer is that these two assets are not a pair.

  blender -b --factory-startup --python tools/_bake_align.py -- \
      --high assets/highpoly/hp_source.glb --low assets/highpoly/smarttopo15k.glb
"""

import bpy
import sys
import argparse
import os


def parse():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--high', required=True)
    p.add_argument('--low', required=True)
    p.add_argument('--samples', type=int, default=4000)
    return p.parse_args(argv)


def load(path, name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(path))
    new = [o for o in set(bpy.data.objects) - before if o.type == 'MESH']
    if len(new) != 1:
        raise RuntimeError("expected one mesh in %s, got %d" % (path, len(new)))
    o = new[0]
    o.name = name
    return o


def bounds(o):
    from mathutils import Vector
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    lo = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
    hi = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
    return lo, hi, (hi - lo), (lo + hi) / 2


def main():
    a = parse()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    high = load(a.high, 'HIGH')
    low = load(a.low, 'LOW')

    hl, hh, hsize, hc = bounds(high)
    ll, lh, lsize, lc = bounds(low)
    print("HIGH  size %.4f %.4f %.4f   centre %.4f %.4f %.4f"
          % (hsize.x, hsize.y, hsize.z, hc.x, hc.y, hc.z))
    print("LOW   size %.4f %.4f %.4f   centre %.4f %.4f %.4f"
          % (lsize.x, lsize.y, lsize.z, lc.x, lc.y, lc.z))
    print("ratio high/low  x %.4f  y %.4f  z %.4f"
          % (hsize.x / lsize.x, hsize.y / lsize.y, hsize.z / lsize.z))

    # put the low on the high: match centre and overall height
    s = hsize.z / lsize.z
    low.scale = (s, s, s)
    bpy.context.view_layer.update()
    ll, lh, lsize, lc = bounds(low)
    low.location = (low.location[0] + (hc.x - lc.x),
                    low.location[1] + (hc.y - lc.y),
                    low.location[2] + (hc.z - lc.z))
    bpy.context.view_layer.update()
    ll, lh, lsize, lc = bounds(low)
    print("LOW aligned: scaled %.4f, size %.4f %.4f %.4f, centre %.4f %.4f %.4f"
          % (s, lsize.x, lsize.y, lsize.z, lc.x, lc.y, lc.z))

    # nearest-surface distance from low points to the high surface
    from mathutils.bvhtree import BVHTree
    import mathutils
    dg = bpy.context.evaluated_depsgraph_get()
    bvh = BVHTree.FromObject(high, dg)

    verts = low.data.vertices
    step = max(1, len(verts) // a.samples)
    dists = []
    miss = 0
    for i in range(0, len(verts), step):
        p = low.matrix_world @ verts[i].co
        loc, nor, idx, d = bvh.find_nearest(p)
        if loc is None:
            miss += 1
        else:
            dists.append(d)
    dists.sort()
    n = len(dists)
    h = hsize.z
    def pct(q):
        return dists[min(n - 1, int(n * q))]
    print("\nsampled %d low-poly points (%d found no surface)" % (n, miss))
    print("distance to nearest HIGH surface, in metres and as %% of body height %.3f m:" % h)
    for q, lab in ((0.50, 'p50'), (0.90, 'p90'), (0.95, 'p95'), (1.0, 'max')):
        v = pct(q if q < 1 else 0.999)
        print("  %-4s %.4f m   %5.2f%% of height" % (lab, v, v / h * 100))
    mean = sum(dists) / n
    print("  mean %.4f m   %5.2f%% of height" % (mean, mean / h * 100))

    p95 = pct(0.95)
    print("\nVERDICT")
    if p95 / h < 0.01:
        print("  PAIR. p95 is under 1%% of height - a normal cage will reach.")
    elif p95 / h < 0.03:
        print("  USABLE with a generous cage. p95 %.2f%% of height; set "
              "--raydist near %.3f m." % (p95 / h * 100, p95 * 2.5))
    else:
        print("  NOT A PAIR. p95 is %.2f%% of height - these two are different "
              "shapes and the bake would invent detail in the wrong places."
              % (p95 / h * 100))


try:
    main()
except SystemExit:
    raise
except Exception:
    import traceback
    traceback.print_exc()
    print("\n!! FAIL: unhandled exception\n")
    sys.exit(9)
