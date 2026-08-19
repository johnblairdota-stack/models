"""
Report what a GLB's textures actually contain, rather than that they exist.

Meshy ships base_color / metallic_roughness / normal with its textured assets.
A normal map that is present but FLAT (128,128,255) does nothing, and looks
identical to a working one in every file listing, so it is measured here with
the same written% statistic the bake gate uses.

  blender -b --factory-startup --python tools/_tex_probe.py -- --glb <file>
"""

import bpy
import sys
import os
import argparse


def parse():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--glb', required=True)
    return p.parse_args(argv)


def main():
    a = parse()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(a.glb))

    imgs = [i for i in bpy.data.images if i.name != 'Render Result']
    print("images in file: %r" % [i.name for i in imgs])
    if not imgs:
        print("!! FAIL: no textures in this GLB at all")
        sys.exit(2)
    for img in imgs:
        # do NOT gate on has_data: for a packed GLB it reads False until the
        # pixel buffer is touched, which silently skipped every image and
        # printed nothing at all while exiting 0.
        try:
            px = list(img.pixels)
        except Exception as e:
            print("%-22s could not read pixels: %s" % (img.name, e))
            continue
        n = len(px) // 4
        if n == 0:
            print("%-22s has no pixel data" % img.name)
            continue
        name = img.name.lower()
        if 'normal' in name:
            # deviation from flat tangent normal (0.5, 0.5, 1.0)
            devs = [max(abs(px[i] - .5), abs(px[i + 1] - .5), abs(px[i + 2] - 1.))
                    for i in range(0, n * 4, 4)]
            written = [d for d in devs if d > 0.004]
            fw = len(written) / n
            mean_w = (sum(written) / len(written)) if written else 0.0
            print("%-22s %dx%d  written %5.1f%%  mean(written) %.4f"
                  % (img.name, img.size[0], img.size[1], fw * 100, mean_w))
            print("    -> %s" % ("REAL - it carries detail" if fw >= 0.30
                                 else "FLAT OR NEARLY FLAT - it does nothing"))
        else:
            # how much of the map is not a single flat colour
            r0, g0, b0 = px[0], px[1], px[2]
            off = sum(1 for i in range(0, n * 4, 4)
                      if abs(px[i] - r0) > .02 or abs(px[i + 1] - g0) > .02
                      or abs(px[i + 2] - b0) > .02)
            print("%-22s %dx%d  non-uniform %5.1f%%"
                  % (img.name, img.size[0], img.size[1], off / n * 100))


try:
    main()
except SystemExit:
    raise
except Exception:
    import traceback
    traceback.print_exc()
    print("\n!! FAIL: unhandled exception\n")
    sys.exit(9)
