"""
Render the bake three ways so the result can be judged by eye rather than by
the gate alone: the 1.96M reference, the 60k with a flat surface, and the 60k
with the baked normal map.

The three share one camera, one light rig and one grey material, so the only
thing that differs between frames is the thing under test.

  blender -b --factory-startup --python tools/_bake_look.py -- \
      --high assets/highpoly/hp_source.glb \
      --low  assets/highpoly/player60k.glb \
      --map  assets/highpoly/player60k_normal.png \
      --outdir <dir> [--azim 0]
"""

import bpy
import sys
import os
import math
import argparse


def parse():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--high', required=True)
    p.add_argument('--low', required=True)
    p.add_argument('--map', required=True)
    p.add_argument('--outdir', required=True)
    p.add_argument('--azim', type=float, default=0.0)
    p.add_argument('--res', type=int, default=900)
    return p.parse_args(argv)


def clean():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def stage(a):
    """Camera and lights sized to the subject, so all three frames match."""
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE_NEXT'
    sc.render.resolution_x = a.res
    sc.render.resolution_y = int(a.res * 1.3)
    sc.render.film_transparent = True   # alpha is what the frame check reads
    sc.world = bpy.data.worlds.new('w')
    sc.world.use_nodes = True
    sc.world.node_tree.nodes['Background'].inputs[0].default_value = (.05, .05, .06, 1)
    sc.world.node_tree.nodes['Background'].inputs[1].default_value = 1.0

    cam_d = bpy.data.cameras.new('cam')
    cam = bpy.data.objects.new('cam', cam_d)
    sc.collection.objects.link(cam)
    sc.camera = cam

    key = bpy.data.objects.new('key', bpy.data.lights.new('key', 'AREA'))
    key.data.energy = 900
    key.data.size = 4
    sc.collection.objects.link(key)
    rim = bpy.data.objects.new('rim', bpy.data.lights.new('rim', 'AREA'))
    rim.data.energy = 400
    rim.data.size = 4
    sc.collection.objects.link(rim)
    return cam, key, rim


def aim(obj, target):
    """Point obj at target with a constraint.

    Hand-rolled rotation_euler was tried first and rendered three EMPTY frames
    that still looked like results, so aiming is delegated to Blender.
    """
    c = obj.constraints.new('TRACK_TO')
    c.target = target
    c.track_axis = 'TRACK_NEGATIVE_Z'
    c.up_axis = 'UP_Y'


def frame_subject(obj, cam, key, rim, azim):
    """Put the camera on a fixed orbit around the subject's own bounds."""
    from mathutils import Vector
    bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    cx = sum(v.x for v in bb) / 8
    cy = sum(v.y for v in bb) / 8
    cz = sum(v.z for v in bb) / 8
    h = max(v.z for v in bb) - min(v.z for v in bb)
    print("    subject centre (%.3f, %.3f, %.3f)  height %.3f" % (cx, cy, cz, h))
    if h <= 0:
        raise RuntimeError("subject has zero height - nothing to frame")

    look = bpy.data.objects.new('look', None)
    bpy.context.scene.collection.objects.link(look)
    look.location = (cx, cy, cz)

    d = h * 1.75
    ar = math.radians(azim)
    cam.location = (cx + d * math.sin(ar), cy - d * math.cos(ar), cz)
    aim(cam, look)
    key.location = (cx + d * 0.8, cy - d * 0.8, cz + h * 0.8)
    aim(key, look)
    rim.location = (cx - d * 0.9, cy + d * 0.6, cz + h * 0.4)
    aim(rim, look)
    # lights are sized in metres; this subject is ~0.12 m tall, not ~1.8 m
    key.data.size = h * 1.2
    rim.data.size = h * 1.2
    key.data.energy = 60 * h * h
    rim.data.energy = 26 * h * h


def grey(normal_map_path=None):
    m = bpy.data.materials.new('grey')
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (0.55, 0.56, 0.58, 1)
    bsdf.inputs['Roughness'].default_value = 0.42
    bsdf.inputs['Metallic'].default_value = 0.0
    if normal_map_path:
        tex = m.node_tree.nodes.new('ShaderNodeTexImage')
        img = bpy.data.images.load(os.path.abspath(normal_map_path))
        img.colorspace_settings.name = 'Non-Color'
        tex.image = img
        nm = m.node_tree.nodes.new('ShaderNodeNormalMap')
        nm.inputs['Strength'].default_value = 1.0
        m.node_tree.links.new(tex.outputs['Color'], nm.inputs['Color'])
        m.node_tree.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    return m


def shot(a, glb, label, use_map):
    clean()
    cam, key, rim = stage(a)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(glb))
    obj = [o for o in bpy.data.objects if o.type == 'MESH'][0]
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth()
    obj.data.materials.clear()
    obj.data.materials.append(grey(a.map if use_map else None))
    frame_subject(obj, cam, key, rim, a.azim)
    out = os.path.join(os.path.abspath(a.outdir), label + '.png')
    bpy.context.scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    obj.data.calc_loop_triangles()

    # THE CHECK THAT WAS MISSING. The first version of this script wrote three
    # EMPTY frames and reported three successful renders. A render is only a
    # render if the subject is in it.
    #
    # The first version of THIS CHECK was also wrong, in the way that is worth
    # recording: it compared each pixel against the background COLOUR and read
    # 100% on every frame, i.e. it passed for the wrong reason. The view
    # transform lifts a 0.05 background to a mid grey before it reaches the
    # file, so no pixel ever matched. Alpha does not go through the view
    # transform, so the subject is counted on alpha instead.
    img = bpy.data.images.load(out)
    px = list(img.pixels)
    n = len(px) // 4
    subj = sum(1 for i in range(0, n * 4, 4) if px[i + 3] > 0.5)
    frac = subj / n
    bpy.data.images.remove(img)
    print("RENDERED %-16s %7d tris  map=%-5s  subject fills %.1f%%"
          % (label, len(obj.data.loop_triangles), bool(use_map), frac * 100))
    if frac < 0.05:
        raise RuntimeError("%s: subject fills only %.2f%% of frame - the "
                           "camera is not looking at it" % (label, frac * 100))


def main():
    a = parse()
    os.makedirs(a.outdir, exist_ok=True)
    shot(a, a.high, '1_high_reference', False)
    shot(a, a.low, '2_low_nomap', False)
    shot(a, a.low, '3_low_withmap', True)


try:
    main()
except SystemExit:
    raise
except Exception:
    import traceback
    traceback.print_exc()
    print("\n!! FAIL: unhandled exception\n")
    sys.exit(9)
