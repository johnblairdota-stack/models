"""
STEP 1 OF THE HEM-LIP ROUND: what is the DIHEDRAL of the hem rim's OWN edges?

    "C:\\Program Files\\Blender Foundation\\Blender 4.5\\4.5\\python\\bin\\python.exe" ^
      tools/_hipx5_hemdih.py public/models/anim/player_norm30.glb [--control-thighside]

WHY. `subdivide_player.py` creases at `--crease 65`, and a creased edge is placed at its
MIDPOINT (Loop) or on the interpolating 4-point curve (Butterfly) - either way it stays on the
original polygon. An UNCREASED edge takes the smooth stencil, which inscribes a curve INSIDE the
polygon's corners, so between two original vertices the surface RETREATS. If the hem loop's own
edges sit BELOW 65 degrees they are not creased at all: the lip is being smoothed, and one scallop
per original edge is a sawtooth.

THE SELECTION IS NOT REINVENTED. It is `skirt_rim` imported from `subdivide_player.py` - the same
Hips/UpLeg skin-influence rule `--skirt-thicken` uses, which measured 75 of 5,171 positions, one
chain per leg. A second hand-rolled hem selection would be a different question with the same name.

⚠️ THE CONTROL. A measurement that reports the mesh-wide distribution under a hem-shaped label is
the failure mode here: it would look like a result and mean nothing. `--control-thighside` runs the
identical machinery on the OTHER side of the same influence boundary (the thigh vertices whose
one-ring reaches back onto the Hips side). The rule still runs, still selects a loop of comparable
size, and lands on the wrong wall of the slot. If its distribution comes back equal to the hem's,
this script is not discriminating between hem edges and ordinary edges and its headline is void.
The mesh-wide distribution is printed alongside on every run for the same reason.
"""
import sys
import os
import json
import math
from collections import defaultdict

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from subdivide_player import (parse_glb, read_accessor, weld, edge_faces, skirt_rim)


def pct(a, q):
    return float(np.percentile(a, q)) if len(a) else float("nan")


def dist(name, degs, crease_deg):
    d = np.asarray(sorted(degs))
    if not len(d):
        return {"set": name, "edges": 0}
    return {
        "set": name, "edges": int(len(d)),
        "min": round(float(d.min()), 2), "p10": round(pct(d, 10), 2),
        "median": round(pct(d, 50), 2), "mean": round(float(d.mean()), 2),
        "p90": round(pct(d, 90), 2), "max": round(float(d.max()), 2),
        f"over{int(crease_deg)}": int((d >= crease_deg).sum()),
        f"over{int(crease_deg)}Pct": round(float((d >= crease_deg).mean() * 100), 1),
        "under30": int((d < 30).sum()),
        "under30Pct": round(float((d < 30).mean() * 100), 1),
    }


def main():
    args = sys.argv[1:]
    if not args:
        raise SystemExit(__doc__)
    src = args[0]
    crease_deg = float(args[args.index("--crease") + 1]) if "--crease" in args else 65.0
    thighside = "--control-thighside" in args

    gltf, _json_bytes, bin_bytes = parse_glb(open(src, "rb").read())
    prims = [p for m in gltf["meshes"] for p in m["primitives"]
             if "POSITION" in p["attributes"] and "NORMAL" in p["attributes"]]
    prim = prims[0]
    pos = read_accessor(gltf, bin_bytes, prim["attributes"]["POSITION"]).astype(np.float64)
    jnt = read_accessor(gltf, bin_bytes, prim["attributes"]["JOINTS_0"])
    wgt = read_accessor(gltf, bin_bytes, prim["attributes"]["WEIGHTS_0"]).astype(np.float64)
    idx = read_accessor(gltf, bin_bytes, prim["indices"]).reshape(-1).astype(np.int64)
    tris = idx.reshape(-1, 3)

    inv = weld(pos)
    n_pos = int(inv.max()) + 1
    pos_w = np.zeros((n_pos, 3))
    for vi, gi in enumerate(inv):
        pos_w[int(gi)] = pos[vi]
    tris_w = inv[tris]

    joints_list = gltf["skins"][0]["joints"]
    jnames = [gltf["nodes"][nj].get("name", "?") for nj in joints_list]
    name2k = {n: k for k, n in enumerate(jnames)}
    ibm = read_accessor(gltf, bin_bytes, gltf["skins"][0]["inverseBindMatrices"]).astype(np.float64)
    jointpos = np.array([np.linalg.inv(ibm[k].reshape(4, 4).T)[:3, 3] for k in range(len(joints_list))])
    W = np.zeros((n_pos, len(joints_list)))
    for vi, gi in enumerate(inv):
        for k in range(4):
            if wgt[vi, k] > 0:
                W[int(gi), int(jnt[vi, k])] = wgt[vi, k]

    adj = defaultdict(set)
    for t in tris_w:
        a, b, c = int(t[0]), int(t[1]), int(t[2])
        adj[a].update((b, c)); adj[b].update((a, c)); adj[c].update((a, b))

    if thighside:
        # CONTROL: the same rule, the OTHER wall of the slot. Thigh-dominant vertices whose
        # one-ring reaches back onto the Hips side.
        HIPS = name2k["Hips"]
        knee_y = jointpos[name2k["LeftLeg"]][1]
        pelvis_y = jointpos[HIPS][1]
        rim = {}
        for side, ul in (("L", name2k["LeftUpLeg"]), ("R", name2k["RightUpLeg"])):
            for v in range(n_pos):
                if W[v, ul] <= W[v, HIPS] or W[v, HIPS] <= 0.0:
                    continue
                if not (knee_y < pos_w[v][1] < pelvis_y):
                    continue
                if any(W[w, HIPS] > W[w, ul] for w in adj[v]):
                    rim[v] = 1.0
        label = "CONTROL thigh-side loop"
    else:
        rim = skirt_rim(pos_w, tris_w, W, jointpos, name2k, adj)
        label = "hem rim loop"

    if not rim:
        raise SystemExit("the selection found ZERO vertices; nothing was measured")

    # face normals, exactly as the tool computes them for its crease test
    p0, p1, p2 = pos[tris[:, 0]], pos[tris[:, 1]], pos[tris[:, 2]]
    fn = np.cross(p1 - p0, p2 - p0)
    fl = np.linalg.norm(fn, axis=1, keepdims=True)
    fn = np.where(fl > 1e-12, fn / np.maximum(fl, 1e-12), 0.0)

    ef = edge_faces(tris_w)
    rimset = set(rim)
    all_deg, loop_deg, spoke_deg = [], [], []
    for (u, v), faces in ef.items():
        if len(faces) != 2:
            continue
        d = float(np.clip(np.dot(fn[faces[0]], fn[faces[1]]), -1.0, 1.0))
        ang = math.degrees(math.acos(d))
        all_deg.append(ang)
        inu, inv_ = u in rimset, v in rimset
        if inu and inv_:
            loop_deg.append(ang)          # an edge ALONG the hem
        elif inu or inv_:
            spoke_deg.append(ang)         # an edge leaving the hem

    rows = [dist(label, loop_deg, crease_deg),
            dist("edges touching it (spokes)", spoke_deg, crease_deg),
            dist("whole mesh", all_deg, crease_deg)]

    print(f"SOURCE {src}   selection {len(rim)} of {n_pos} welded positions   crease {crease_deg}")
    hdr = ["set", "edges", "min", "p10", "median", "mean", "p90", "max",
           f"over{int(crease_deg)}", f"over{int(crease_deg)}Pct", "under30", "under30Pct"]
    print(" | ".join(h.rjust(12) for h in hdr))
    for r in rows:
        print(" | ".join(str(r.get(h, "")).rjust(12) for h in hdr))
    ys = np.array([pos_w[v][1] for v in rim])
    print(f"selection y range {ys.min():.3f}..{ys.max():.3f}")
    print("HEMDIH " + json.dumps({"rows": rows, "sel": len(rim),
                                  "control": bool(thighside)}))

    """
    SWEEP ITEM 2 OF THE ROUND: how low would `--crease` have to go to CATCH the hem loop, and what
    does that cost the rest of the mesh? A crease threshold cannot select the hem - it selects an
    ANGLE - so catching a 14.8 deg median lip means creasing everything else that bends 14.8 deg,
    which on this mesh is most of it. Creasing an edge preserves its facet, so this column is the
    price in the defect the subdivision exists to remove.
    """
    la = np.array(loop_deg)
    aa = np.array(all_deg)
    print("crease |  hem caught | hem caught % | mesh creased | mesh creased %")
    for t in (65.0, 45.0, 30.0, 20.0, 14.8, 10.0, 5.0, 3.8):
        print(f"{t:6.1f} | {int((la >= t).sum()):11d} | {float((la >= t).mean() * 100):12.1f} | "
              f"{int((aa >= t).sum()):12d} | {float((aa >= t).mean() * 100):14.1f}")

    """
    ⚠️ THE NUMBER THAT DECIDES WHETHER THE BUILD IS WORTH RUNNING. The hypothesis is that the lip
    RETREATS between original vertices - the smooth stencil inscribes a curve inside the polygon's
    corners. That displacement is computable here, before any asset is written: run the real
    Butterfly stencil, then ask how far each hem edge point sits from the chord midpoint the
    midpoint rule would have used, SIGNED along the outward surface normal. Negative is a retreat.
    At the 518 px/m the figure renders at, 1 mm is 0.518 screen px, so a retreat under ~1 mm cannot
    draw a sawtooth and the mechanism is dead on arithmetic.
    """
    if "--retreat" in args:
        from subdivide_player import subdivide_positions_butterfly
        crease_edges = set()
        cc = math.cos(math.radians(crease_deg))
        for (u, v), faces in ef.items():
            if len(faces) == 2 and float(np.clip(np.dot(fn[faces[0]], fn[faces[1]]), -1.0, 1.0)) < cc:
                crease_edges.add((u, v))
        _vp, edge_pt, st = subdivide_positions_butterfly(pos_w, tris_w, crease_edges, set())
        print("BUTTERFLY_STATS " + json.dumps(st))

        # outward vertex normal per welded position, area-weighted over welded faces
        vn = np.zeros((n_pos, 3))
        for ti in range(len(tris_w)):
            a, b, c = int(tris_w[ti, 0]), int(tris_w[ti, 1]), int(tris_w[ti, 2])
            w = np.cross(pos_w[b] - pos_w[a], pos_w[c] - pos_w[a])
            vn[a] += w; vn[b] += w; vn[c] += w
        ln = np.linalg.norm(vn, axis=1, keepdims=True)
        vn = np.where(ln > 1e-12, vn / np.maximum(ln, 1e-12), 0.0)

        def retreat(edges, name):
            out = []
            creased = 0
            for (u, v) in edges:
                mid = 0.5 * (pos_w[u] + pos_w[v])
                d = edge_pt[(u, v)] - mid
                nrm = vn[u] + vn[v]
                nl = np.linalg.norm(nrm)
                if nl < 1e-12:
                    continue
                nrm = nrm / nl
                out.append(float(np.dot(d, nrm)) * 1000.0)   # mm, + outward, - retreat
                if (u, v) in crease_edges:
                    creased += 1
            a = np.array(sorted(out))
            return {"set": name, "edges": len(a), "creasedOfThose": creased,
                    "mmMin": round(float(a.min()), 3), "mmP10": round(pct(a, 10), 3),
                    "mmMedian": round(pct(a, 50), 3), "mmP90": round(pct(a, 90), 3),
                    "mmMax": round(float(a.max()), 3),
                    "retreatOver1mm": int((a < -1.0).sum()),
                    "worstPx": round(float(abs(a.min())) * 0.518, 2)}

        loop_e = [e for e in ef if e[0] in rimset and e[1] in rimset and len(ef[e]) == 2]
        spoke_e = [e for e in ef if (e[0] in rimset) != (e[1] in rimset) and len(ef[e]) == 2]
        all_e = [e for e in ef if len(ef[e]) == 2]
        rr = [retreat(loop_e, label), retreat(spoke_e, "spokes"), retreat(all_e, "whole mesh")]
        h2 = ["set", "edges", "creasedOfThose", "mmMin", "mmP10", "mmMedian", "mmP90", "mmMax",
              "retreatOver1mm", "worstPx"]
        print(" | ".join(x.rjust(14) for x in h2))
        for r in rr:
            print(" | ".join(str(r.get(x, "")).rjust(14) for x in h2))
        print("RETREAT " + json.dumps(rr))

    """
    ⚠️ THE ASSERTION, AND ITS CONTROL IS THE `--control-thighside` ARM ABOVE. On the real hem this
    must report a population that is NOT the mesh-wide one; if the medians agree to within a degree
    the selection is not selecting anything and the headline number is void.
    """
    if not thighside:
        lm, am = pct(np.array(loop_deg), 50), pct(np.array(all_deg), 50)
        if abs(lm - am) < 1.0:
            print(f"SELECTION IS NOT DISCRIMINATING: hem median {lm:.2f} vs mesh-wide {am:.2f}. "
                  f"This number describes the mesh, not the hem.")
            raise SystemExit(2)
        if len(loop_deg) < 20:
            print(f"only {len(loop_deg)} hem-to-hem edges; that is not a loop and the "
                  f"distribution is not a hem's")
            raise SystemExit(2)


if __name__ == "__main__":
    main()
