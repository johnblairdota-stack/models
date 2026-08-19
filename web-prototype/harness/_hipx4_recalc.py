"""
THE ONE THING THE "SHADING NORMALS" ELIMINATION NEVER TESTED.

    "C:\\Program Files\\Blender Foundation\\Blender 4.5\\4.5\\python\\bin\\python.exe" ^
      harness/_hipx4_recalc.py <in.glb> <out.glb> [--smooth DEG] [--control-passthrough]

WHY. The hip-band thread's normals arm reads: "3 builds, IDENTICAL GEOMETRY, normal merge swept
5 / 30 / 75 deg -> pixel-identical band". That is a sweep of the MERGE THRESHOLD on the subdivided
asset, and it is sound as far as it goes. It does not test the thing that actually differs between
the two arms of the band measurement:

    player_norm30.glb  NORMAL = the GENERATOR'S normals, with a 30 deg complete-linkage merge
    player_bf65.glb    NORMAL = RECOMPUTED FROM SCRATCH, area-weighted over the refined mesh in
                       output split-index space, then the same 30 deg merge

Those are two different normal FIELDS, not two settings of one field. `subdivide_player.py` has to
recompute - a refined mesh has vertices the generator never had a normal for - and in doing so it
also replaces the normal on every ORIGINAL vertex. Sweeping the merge threshold cannot see that,
because all three swept builds recompute.

WHAT THIS ISOLATES. Recompute the normals the same way, with the SAME imported merge, on the
UNSUBDIVIDED body. Geometry, positions, uvs, skin, indices and all 15 clips are untouched to the
byte - only NORMAL changes, and only its own bufferView is rewritten, exactly as
`tools/smooth_normals.py` does and for the same safety argument. If the band opens on THAT, the
band is a normals defect that the subdivision merely carries, and no edit to the model is owed.
If the band does not move, the recompute is exonerated and the cause is elsewhere.

CONTROLS, because "a tool that writes its input back out" and "a tool that changes more than it
claims" are the two failures here:

    --control-passthrough  do NOT recompute: take the INPUT normals and run the identical merge.
                           On `player_norm30.glb` - which already IS the 30 deg merge of the
                           generator's normals - a correct implementation must change EXACTLY ZERO
                           normals and trip the no-op guard at exit 3. That is what makes the real
                           arm's number meaningful: it proves this file's merge is the same merge
                           that produced the baseline, so any difference the recompute arm reports
                           is the RECOMPUTE and not a second, subtly different merge.
    every run asserts      the JSON chunk is byte-identical; every BIN byte outside NORMAL's own
                           bufferView is byte-identical; the file length is unchanged; every
                           written normal is unit length; and the normals ACTUALLY changed.
"""
import sys
import os
import json
import math
import struct

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
from smooth_normals import (parse_glb, accessor_view, break_histogram,      # noqa: E402
                            cluster_complete_linkage, POSITION_EPS)


def main():
    args = sys.argv[1:]
    if len(args) < 2:
        raise SystemExit("usage: python harness/_hipx4_recalc.py <in.glb> <out.glb> "
                         "[--smooth DEG] [--control-passthrough]")
    src, dst = args[0], args[1]
    smooth_deg = float(args[args.index("--smooth") + 1]) if "--smooth" in args else 30.0
    passthrough = "--control-passthrough" in args

    raw = open(src, "rb").read()
    gltf, json_bytes, bin_bytes, (jo, jl, bo, bl) = parse_glb(raw)

    prim = [p for m in gltf["meshes"] for p in m["primitives"]
            if "POSITION" in p["attributes"] and "NORMAL" in p["attributes"]][0]
    positions, _ps, _pl = accessor_view(gltf, bin_bytes, prim["attributes"]["POSITION"], "VEC3")
    normals_in, nrm_start, nrm_len = accessor_view(gltf, bin_bytes,
                                                   prim["attributes"]["NORMAL"], "VEC3")
    positions = positions.astype(np.float64)
    normals_in = normals_in.astype(np.float64)
    normals_in = normals_in / np.maximum(
        np.linalg.norm(normals_in, axis=1, keepdims=True), 1e-12)

    idx_acc = gltf["accessors"][prim["indices"]]
    idx_bv = gltf["bufferViews"][idx_acc["bufferView"]]
    idx_dtype = {5121: "<u1", 5123: "<u2", 5125: "<u4"}[idx_acc["componentType"]]
    indices = np.frombuffer(bin_bytes, dtype=idx_dtype, count=idx_acc["count"],
                            offset=idx_bv.get("byteOffset", 0)
                            + idx_acc.get("byteOffset", 0)).astype(np.int64)
    tris = indices.reshape(-1, 3)
    n_v = len(positions)

    """
    THE RECOMPUTE, and it is deliberately the SAME arithmetic `subdivide_player.py` uses on its
    output: area-weighted face normals accumulated in the OUTPUT SPLIT index space, so the seam
    structure decides which faces meet at a vertex and every hard edge that the split encodes
    survives. The cross product's length is twice the triangle area, which IS the area weighting.
    """
    if passthrough:
        base = normals_in.copy()
        print("CONTROL: --control-passthrough - normals are NOT recomputed, only merged. On a body "
              "that already carries this merge, ZERO normals must change.")
    else:
        p0, p1, p2 = positions[tris[:, 0]], positions[tris[:, 1]], positions[tris[:, 2]]
        face_n = np.cross(p1 - p0, p2 - p0)
        acc = np.zeros((n_v, 3), dtype=np.float64)
        for k in range(3):
            np.add.at(acc, tris[:, k], face_n)
        ln = np.linalg.norm(acc, axis=1, keepdims=True)
        if float(ln.min()) < 1e-12:
            raise SystemExit("a vertex accumulated a zero-length normal")
        base = acc / ln

    keys = np.round(positions / POSITION_EPS).astype(np.int64)
    _, inverse = np.unique(keys, axis=0, return_inverse=True)
    inverse = inverse.reshape(-1)
    groups = [[] for _ in range(int(inverse.max()) + 1)]
    for vi, gi in enumerate(inverse):
        groups[int(gi)].append(vi)

    before_hist = break_histogram(groups, base)
    out = base.copy()
    smooth_cos = math.cos(math.radians(smooth_deg))
    for g in groups:
        if len(g) < 2:
            continue
        sub = base[g]
        clusters = cluster_complete_linkage(sub, smooth_cos)
        if len(clusters) == len(g):
            continue
        for cl in clusters:
            if len(cl) < 2:
                continue
            avg = sub[cl].mean(axis=0)
            n = np.linalg.norm(avg)
            if n < 1e-8:
                raise SystemExit("averaged normal collapsed to zero; --smooth too wide")
            for i in cl:
                out[g[i]] = avg / n
    after_hist = break_histogram(groups, out)

    moved = np.degrees(np.arccos(np.clip(
        np.einsum("ij,ij->i", out, normals_in), -1.0, 1.0)))
    changed = int((moved > 1e-4).sum())
    stats = {
        "src": src, "smooth": smooth_deg, "passthrough": passthrough,
        "verts": n_v, "positions": len(groups),
        "changedNormals": changed,
        "changedPct": round(changed / n_v * 100, 2),
        "meanMovedDeg": round(float(moved[moved > 1e-4].mean()), 3) if changed else 0.0,
        "maxMovedDeg": round(float(moved.max()), 3),
        "p90MovedDeg": round(float(np.percentile(moved, 90)), 3),
        "breaksBefore": before_hist["positionsWithBreak"],
        "breaksAfter": after_hist["positionsWithBreak"],
    }
    print("RECALC_STATS " + json.dumps(stats))

    """
    ⚠️ THE NO-OP GUARD. A file that is byte-identical to its input renders identically, so an A/B
    against it compares an asset with itself and reports "no difference, must not be the cause" -
    the single most convincing way to be wrong here. `--control-passthrough` is the arm that makes
    this fire on purpose.
    """
    if changed == 0:
        print(f"CONTROL: zero normals changed - nothing was written. On --control-passthrough "
              f"against player_norm30.glb this is the CORRECT and expected outcome, and it is what "
              f"proves this file's merge is the same merge that produced the baseline.")
        raise SystemExit(3)

    new_bin = bytearray(bin_bytes)
    new_bin[nrm_start:nrm_start + nrm_len] = out.astype("<f4").tobytes()
    out_raw = bytearray(raw)
    out_raw[bo:bo + bl] = new_bin

    problems = []
    if bytes(out_raw[jo:jo + jl]) != json_bytes:
        problems.append("the JSON chunk changed")
    if not (bytes(out_raw[bo:bo + nrm_start]) == bytes(bin_bytes[:nrm_start])
            and bytes(out_raw[bo + nrm_start + nrm_len:bo + bl])
            == bytes(bin_bytes[nrm_start + nrm_len:])):
        problems.append("BIN bytes OUTSIDE the NORMAL bufferView changed - POSITION, UV, "
                        "JOINTS/WEIGHTS, indices or an animation sampler was touched")
    if len(out_raw) != len(raw):
        problems.append(f"file length changed {len(raw)} -> {len(out_raw)}")
    rt = np.frombuffer(bytes(out_raw[bo + nrm_start:bo + nrm_start + nrm_len]),
                       dtype="<f4").reshape(-1, 3).astype(np.float64)
    worst = float(np.abs(np.linalg.norm(rt, axis=1) - 1.0).max())
    if worst > 1e-4:
        problems.append(f"a written normal is not unit length (worst {worst:.2e})")
    if problems:
        print("RECALC FAILED:\n  " + "\n  ".join(problems))
        raise SystemExit(2)

    open(dst, "wb").write(bytes(out_raw))
    print("RECALC_RESULT " + json.dumps({"out": dst, "bytes": len(out_raw), **stats}))


if __name__ == "__main__":
    main()
