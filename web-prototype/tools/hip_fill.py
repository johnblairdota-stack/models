"""
CLOSE THE HIP CAVITY FROM BELOW, so the skirt/thigh junction reads as a tight dark SEAM instead of
an open dark SLOT — and do it as a POSITION delta on the existing vertex set, so every guarantee
the subdivision thread established survives.

    "C:\\Program Files\\Blender Foundation\\Blender 4.5\\4.5\\python\\bin\\python.exe" ^
      tools/hip_fill.py <in.glb> <out.glb> [--fill MM] [--dry] [--control-nocap] [--control-rim]

WHY THIS AND NOT `--skirt-thicken`, AND THE DIFFERENCE IS THE WHOLE POINT. `subdivide_player.py`'s
thicken offsets the hem's RIM outward along its own normal. Swept 2/4/6 mm and then to 40 mm — 6.7x
over — the band did not move (1443 vs 1434): it SATURATES, because pushing the rim outward makes the
overhang LARGER and opens the cavity mouth wider. This moves the OTHER wall: the thigh's shoulder,
i.e. the cavity FLOOR, upward and outward into the cavity, which makes the cavity SHALLOWER. The rim
itself is never touched, so the silhouette John chose cannot move — that is a structural guarantee,
not a measurement, and it is asserted (no selected vertex may lie on the hem rim).

WHAT THE MEASUREMENT SAYS THE TARGET IS. `harness/_hipx2_whatisdark.mjs` raycasts every dark pixel
in the band ROI at the captured frame and reports what it hits. On `player_norm30.glb`:

    median hit height    model y 0.709      (the hem rim spans y 0.691..0.843)
    median face normal   n_y = +0.229       i.e. facing UP, not down
    faces DOWNWARD       11.9% of dark px   (bf65: 6.0%)
    BACKFACES            0 of 1333          so nothing is seen through a gap
    depth complexity     2 (median)         in and out of one limb; no see-through

⚠️ SO THE BAND IS NOT THE HEM'S DOWNWARD-FACING UNDERSIDE, which is what the thicken round
concluded from the fact that the band rode outward with the rim. Nine tenths of the dark pixels sit
on UP-FACING surface — the thigh's shoulder — seen through the slot mouth and darkened in it. Moving
the floor up is therefore aimed at the surface the dark pixels are actually ON.

THE SELECTION, DERIVED FROM THE RIG, never a typed box — the same principle as `skirt_rim`:
  * UpLeg-dominant (the thigh side of the skin boundary), so the skirt is never moved
  * inside the hem's radial envelope at its own height, so only surface that is TUCKED UNDER the
    hem is eligible and the exposed outer thigh below the hem is not
  * vertex normal facing up (n_y > +0.30), which is the cavity floor rather than its walls
  * NOT in `skirt_rim`'s hem set, asserted, so the silhouette is untouchable by construction

⚠️ THE MOVE IS CAPPED BY EACH VERTEX'S OWN CLEARANCE, WHICH IS WHAT MAKES IT SAFE. A flat offset
would drive the floor through the hem above it and produce an interpenetrating shell — the exact
defect a tri-tri test would then find, and which this asset currently does NOT have anywhere but the
hands. So each vertex fires a ray along its own normal, finds the first surface above it, and is
allowed to move at most `CAP_FRACTION` of that distance. A vertex with 1 mm of headroom moves
0.6 mm however large `--fill` is; the requested millimetres are a CEILING, not an instruction.

CONTROLS, because "a selection that reports a plausible count while sitting on the wrong part of the
model" has cost this project two rounds, and because a cap that silently does nothing is the failure
mode here:

    --dry             run the whole selection and the whole clearance measurement, write NOTHING,
                      and report the clearance distribution. This is how you find out whether there
                      is a cavity to fill BEFORE editing anything. It exits 3 so it can never be
                      mistaken for a successful build.
    --fill 0          run the full selection and cap, offset by nothing, trip the no-op guard and
                      exit 3. Armed on the FLAG'S PRESENCE, not its value — keying it on `mm > 0`
                      is the bypass that `subdivide_player.py`'s header records being caught at.
    --control-nocap   remove the clearance cap. The floor is then driven the full requested
                      distance regardless of headroom, which on this geometry pushes it THROUGH the
                      hem. The interpenetration assertion must fire. This is the arm that proves
                      the cap is doing something rather than being decorative.
    --control-rim     deliberately include the hem rim in the selection. The rim-exclusion
                      assertion must fire. Without this arm, "the silhouette cannot move" is a
                      claim about code nobody has watched break.

Every run asserts, and exits non-zero on any of them:
  * the JSON chunk is byte-identical, and every BIN byte outside POSITION's own bufferView is
    byte-identical — so NORMAL, TEXCOORD_0, JOINTS_0, WEIGHTS_0, the indices, the skin, the
    inverse-bind matrices and all 15 animation samplers are provably untouched
  * the file length is unchanged
  * the welded shell is EXACTLY as closed as the input (same boundary and non-manifold edge counts)
    and has the same number of unique positions — moving one copy of a split corner and not its
    twins would tear every UV seam crossing the hem, so the offset is applied PER WELDED POSITION
  * no moved vertex is on the hem rim
  * no moved vertex ends up on the far side of the surface it was capped against
  * the offset actually moved something
"""
import sys
import os
import json
import math
import struct
from collections import defaultdict

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from subdivide_player import (parse_glb, read_accessor, weld, edge_faces,   # noqa: E402
                              closure_report, skirt_rim, POSITION_EPS)

CAP_FRACTION = 0.60


def ray_first_hit(origin, direction, pos, tris, skip_mask=None, eps=1e-4):
    """
    Distance to the first triangle a ray meets, vectorised Moller-Trumbore over all `tris`.

    `eps` skips the surface the ray starts ON, which every vertex does by definition: without it
    every clearance would measure 0 and the cap would freeze the whole selection while reporting a
    perfectly plausible "0.000 mm of headroom".
    """
    v0 = pos[tris[:, 0]]
    e1 = pos[tris[:, 1]] - v0
    e2 = pos[tris[:, 2]] - v0
    p = np.cross(direction, e2)
    det = np.einsum("ij,ij->i", e1, p)
    ok = np.abs(det) > 1e-14
    inv = np.zeros_like(det)
    inv[ok] = 1.0 / det[ok]
    t0 = origin - v0
    u = np.einsum("ij,ij->i", t0, p) * inv
    q = np.cross(t0, e1)
    v = (q @ direction) * inv
    tt = np.einsum("ij,ij->i", e2, q) * inv
    good = ok & (u >= -1e-9) & (u <= 1.0 + 1e-9) & (v >= -1e-9) & (u + v <= 1.0 + 1e-9) & (tt > eps)
    if skip_mask is not None:
        good &= ~skip_mask
    if not good.any():
        return math.inf
    return float(tt[good].min())


def main():
    args = sys.argv[1:]
    if len(args) < 2:
        raise SystemExit("usage: python tools/hip_fill.py <in.glb> <out.glb> [--fill MM] [--dry] "
                         "[--control-nocap] [--control-rim]")
    src, dst = args[0], args[1]
    dry = "--dry" in args
    nocap = "--control-nocap" in args
    ctrl_rim = "--control-rim" in args
    fill_requested = "--fill" in args
    fill_mm = float(args[args.index("--fill") + 1]) if fill_requested else 0.0
    if not (dry or fill_requested):
        raise SystemExit("pass --fill MM to offset, or --dry to measure the cavity first")
    if fill_mm < 0:
        raise SystemExit("--fill must be >= 0 mm")

    raw = open(src, "rb").read()
    gltf, json_bytes, bin_bytes = parse_glb(raw)
    off, chunks = 12, {}
    while off < len(raw):
        clen, ctype = struct.unpack_from("<II", raw, off)
        chunks[ctype] = (off + 8, clen)
        off += 8 + clen
    jo, jl = chunks[0x4E4F534A]
    bo, bl = chunks[0x004E4942]

    prims = [p for m in gltf["meshes"] for p in m["primitives"]
             if "POSITION" in p["attributes"] and "NORMAL" in p["attributes"]]
    if len(prims) != 1:
        raise SystemExit(f"expected one primitive with POSITION+NORMAL, found {len(prims)}")
    prim = prims[0]
    pos_acc = gltf["accessors"][prim["attributes"]["POSITION"]]
    pos_bv = gltf["bufferViews"][pos_acc["bufferView"]]
    itemsize = 12
    if pos_bv.get("byteStride", itemsize) != itemsize:
        raise SystemExit("POSITION is INTERLEAVED; this tool only rewrites a tightly-packed view")
    pos_start = pos_bv.get("byteOffset", 0) + pos_acc.get("byteOffset", 0)
    pos_len = pos_acc["count"] * itemsize

    pos = read_accessor(gltf, bin_bytes, prim["attributes"]["POSITION"]).astype(np.float64)
    jnt = read_accessor(gltf, bin_bytes, prim["attributes"]["JOINTS_0"])
    wgt = read_accessor(gltf, bin_bytes, prim["attributes"]["WEIGHTS_0"]).astype(np.float64)
    idx = read_accessor(gltf, bin_bytes, prim["indices"]).reshape(-1).astype(np.int64)
    tris = idx.reshape(-1, 3)
    n_in = len(pos)

    inv = weld(pos)
    n_pos = int(inv.max()) + 1
    pos_w = np.zeros((n_pos, 3))
    for vi, gi in enumerate(inv):
        pos_w[int(gi)] = pos[vi]
    tris_w = inv[tris]
    keep = ~((tris_w[:, 0] == tris_w[:, 1]) | (tris_w[:, 1] == tris_w[:, 2])
             | (tris_w[:, 2] == tris_w[:, 0]))
    tris_w = tris_w[keep]

    joints = gltf["skins"][0]["joints"]
    jnames = [gltf["nodes"][nj].get("name", "?") for nj in joints]
    name2k = {n: k for k, n in enumerate(jnames)}
    for need in ("Hips", "LeftUpLeg", "RightUpLeg", "LeftLeg"):
        if need not in name2k:
            raise SystemExit(f"this skeleton has no joint named {need}: {jnames}")
    ibm = read_accessor(gltf, bin_bytes, gltf["skins"][0]["inverseBindMatrices"]).astype(np.float64)
    jointpos = np.array([np.linalg.inv(ibm[k].reshape(4, 4).T)[:3, 3] for k in range(len(joints))])

    W = np.zeros((n_pos, len(joints)))
    for vi, gi in enumerate(inv):
        for k in range(4):
            if wgt[vi, k] > 0:
                W[int(gi), int(jnt[vi, k])] = wgt[vi, k]
    adj = defaultdict(set)
    for t in tris_w:
        a, b, c = int(t[0]), int(t[1]), int(t[2])
        adj[a].update((b, c)); adj[b].update((a, c)); adj[c].update((a, b))

    # area-weighted vertex normals on the WELDED topology, and the signed-volume outwardness proof
    fnw = np.cross(pos_w[tris_w[:, 1]] - pos_w[tris_w[:, 0]],
                   pos_w[tris_w[:, 2]] - pos_w[tris_w[:, 0]])
    acc = np.zeros((n_pos, 3))
    for k in range(3):
        np.add.at(acc, tris_w[:, k], fnw)
    VN = acc / np.maximum(np.linalg.norm(acc, axis=1, keepdims=True), 1e-12)
    sv = float(np.einsum("ij,ij->i", pos_w[tris_w[:, 0]],
                         np.cross(pos_w[tris_w[:, 1]], pos_w[tris_w[:, 2]])).sum() / 6.0)
    if sv <= 0:
        raise SystemExit(f"signed volume {sv:.6f} <= 0: the winding puts normals INWARD, so "
                         "'along the vertex normal' would mean into the shell")

    rim = skirt_rim(pos_w, tris_w, W, jointpos, name2k, adj)
    if not rim:
        raise SystemExit("the hem rim rule selected ZERO vertices; without a rim there is nothing "
                         "to exclude and the silhouette guarantee would be vacuous")

    # the hem's radial envelope per leg: rim radius as a function of height
    HIPS = name2k["Hips"]
    env = {}
    for side, ul in (("L", name2k["LeftUpLeg"]), ("R", name2k["RightUpLeg"])):
        ax = jointpos[ul]
        rows = []
        for v in rim:
            if W[v, ul] < W[v, name2k["RightUpLeg" if side == "L" else "LeftUpLeg"]]:
                continue
            r = math.hypot(pos_w[v][0] - ax[0], pos_w[v][2] - ax[2])
            rows.append((pos_w[v][1], r))
        env[side] = (ax, sorted(rows), max((r for _y, r in rows), default=0.0))

    knee_y = jointpos[name2k["LeftLeg"]][1]
    pelvis_y = jointpos[HIPS][1]
    sel = []
    for v in range(n_pos):
        ul = name2k["LeftUpLeg"] if W[v, name2k["LeftUpLeg"]] >= W[v, name2k["RightUpLeg"]] \
            else name2k["RightUpLeg"]
        side = "L" if ul == name2k["LeftUpLeg"] else "R"
        if W[v, ul] <= W[v, HIPS]:
            continue                                   # skirt side: never moved
        y = pos_w[v][1]
        if not (knee_y < y < pelvis_y):
            continue
        if VN[v][1] <= 0.30:
            continue                                   # not the cavity FLOOR
        ax, rows, rmax = env[side]
        if not rows:
            continue
        r = math.hypot(pos_w[v][0] - ax[0], pos_w[v][2] - ax[2])
        if r > rmax:
            continue                                   # outside the hem's envelope: exposed thigh
        if (v in rim) and not ctrl_rim:
            continue
        sel.append(v)
    if ctrl_rim:
        sel = sorted(set(sel) | set(rim))
        print("CONTROL: --control-rim put the hem rim INTO the selection - the rim-exclusion "
              "assertion MUST fire.")
    if not sel:
        raise SystemExit("the cavity-floor rule selected ZERO vertices; a fill of nothing would "
                         "report success while changing nothing")

    # clearance: how far each selected vertex can travel along its own normal before it meets
    # surface. Triangles touching the vertex are excluded, or every clearance would be ~0.
    touch = np.zeros(len(tris_w), dtype=bool)
    tri_of = defaultdict(list)
    for ti, t in enumerate(tris_w):
        for k in range(3):
            tri_of[int(t[k])].append(ti)
    clearance = {}
    for v in sel:
        touch[:] = False
        touch[tri_of[v]] = True
        clearance[v] = ray_first_hit(pos_w[v], VN[v], pos_w, tris_w, skip_mask=touch)
    cl = np.array([clearance[v] for v in sel])
    finite = cl[np.isfinite(cl)]
    rep = {
        "selected": len(sel), "rimVerts": len(rim),
        "openToSky": int((~np.isfinite(cl)).sum()),
        "clearanceMm": {
            "min": round(float(finite.min()) * 1000, 3) if len(finite) else None,
            "p10": round(float(np.percentile(finite, 10)) * 1000, 3) if len(finite) else None,
            "median": round(float(np.median(finite)) * 1000, 3) if len(finite) else None,
            "p90": round(float(np.percentile(finite, 90)) * 1000, 3) if len(finite) else None,
            "max": round(float(finite.max()) * 1000, 3) if len(finite) else None,
        },
        "signedVolume": round(sv, 9),
        "capFraction": CAP_FRACTION,
    }
    print("HIPFILL_SELECTION " + json.dumps(rep))

    if dry:
        print("--dry: the selection and the clearance ran; no file was written.")
        raise SystemExit(3)

    """
    THE OFFSET, capped per vertex. `--control-nocap` removes the cap so the interpenetration
    assertion can be watched firing; the cap is otherwise what makes this edit unable to push the
    cavity floor through the hem above it.
    """
    delta_w = np.zeros((n_pos, 3))
    capped = 0
    for v in sel:
        want = fill_mm / 1000.0
        room = clearance[v]
        if nocap or not np.isfinite(room):
            d = want
        else:
            d = min(want, CAP_FRACTION * room)
            if d < want - 1e-12:
                capped += 1
        delta_w[v] = VN[v] * d

    out_pos = pos.copy()
    for vi, gi in enumerate(inv):
        out_pos[vi] = pos[vi] + delta_w[int(gi)]
    moved = np.linalg.norm(out_pos - pos, axis=1)
    stats = {
        "requestedMm": fill_mm, "cappedVerts": capped, "nocap": nocap,
        "movedVerts": int((moved > 0).sum()),
        "maxMoveMm": round(float(moved.max()) * 1000, 4),
        "meanMoveMm": round(float(moved[moved > 0].mean()) * 1000, 4) if (moved > 0).any() else 0.0,
        "maxMovePx518": round(float(moved.max()) * 1000 * 0.518, 3),
        **rep,
    }
    print("HIPFILL_STATS " + json.dumps(stats))

    if stats["maxMoveMm"] <= 1e-6:
        print(f"CONTROL: --fill {fill_mm} moved nothing - no file was written. The selection and "
              f"the clearance measurement both RAN, which is what separates this from a bypass.")
        raise SystemExit(3)

    new_bin = bytearray(bin_bytes)
    new_bin[pos_start:pos_start + pos_len] = out_pos.astype("<f4").tobytes()
    out_raw = bytearray(raw)
    out_raw[bo:bo + bl] = new_bin

    problems = []
    if bytes(out_raw[jo:jo + jl]) != json_bytes:
        problems.append("the JSON chunk changed")
    if not (bytes(out_raw[bo:bo + pos_start]) == bytes(bin_bytes[:pos_start])
            and bytes(out_raw[bo + pos_start + pos_len:bo + bl])
            == bytes(bin_bytes[pos_start + pos_len:])):
        problems.append("BIN bytes OUTSIDE the POSITION bufferView changed - NORMAL, UV, "
                        "JOINTS/WEIGHTS, indices, inverse-bind matrices or an animation sampler "
                        "was touched")
    if len(out_raw) != len(raw):
        problems.append(f"file length changed {len(raw)} -> {len(out_raw)}")

    """
    THE RIM-EXCLUSION ASSERTION. "The silhouette cannot move" is only a guarantee if the rim is
    provably outside the moved set. `--control-rim` is the arm that makes this fire.
    """
    moved_w = {v for v in range(n_pos) if np.linalg.norm(delta_w[v]) > 0}
    on_rim = sorted(moved_w & set(rim))
    if on_rim:
        problems.append(f"{len(on_rim)} moved vertices are ON THE HEM RIM (e.g. {on_rim[:5]}); the "
                        f"rim is the silhouette and this edit must not touch it")

    # the crack proof, re-welded by position exactly as subdivide_player.py does it
    before = closure_report(pos, tris)
    after = closure_report(out_pos, tris)
    if after["weldedPositions"] != before["weldedPositions"]:
        problems.append(f"unique positions {before['weldedPositions']} -> "
                        f"{after['weldedPositions']}: copies of a split corner moved apart and the "
                        f"UV seams are torn")
    if after["boundaryEdges"] != before["boundaryEdges"] or \
            after["nonManifoldEdges"] != before["nonManifoldEdges"]:
        problems.append(f"closure changed: boundary {before['boundaryEdges']} -> "
                        f"{after['boundaryEdges']}, non-manifold {before['nonManifoldEdges']} -> "
                        f"{after['nonManifoldEdges']}")

    """
    THE INTERPENETRATION ASSERTION, and `--control-nocap` is the arm that makes it fire. A vertex
    that travelled further than its own clearance has crossed the surface it was measured against,
    which produces a shell that passes every closure test while being self-intersecting.
    """
    out_w = np.zeros((n_pos, 3))
    for vi, gi in enumerate(inv):
        out_w[int(gi)] = out_pos[vi]
    through = []
    for v in sel:
        d = float(np.linalg.norm(delta_w[v]))
        if d > 0 and np.isfinite(clearance[v]) and d >= clearance[v]:
            through.append(v)
    if through:
        problems.append(f"{len(through)} vertices moved AT OR BEYOND their own clearance (worst "
                        f"{max(float(np.linalg.norm(delta_w[v])) / clearance[v] for v in through):.2f}x); "
                        f"the cavity floor has been pushed through the hem above it")

    if problems:
        print("HIPFILL FAILED:\n  " + "\n  ".join(problems))
        raise SystemExit(2)

    open(dst, "wb").write(bytes(out_raw))
    print("HIPFILL_RESULT " + json.dumps({"out": dst, "bytes": len(out_raw), **stats}))


if __name__ == "__main__":
    main()
