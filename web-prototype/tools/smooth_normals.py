"""
MERGE THE PLAYER'S SPURIOUS NORMAL BREAKS, so the shell stops reading as a triangle mosaic.

    "C:\\Program Files\\Blender Foundation\\Blender 4.5\\4.5\\python\\bin\\python.exe" ^
      tools/smooth_normals.py <in.glb> <out.glb> --threshold 30

WHY THIS EXISTS, AND IT IS NOT THE TRIANGLE COUNT. Two critics from different views with
different instruments both put low-poly FACETING at the top: facet energy 1.5-2.0x the art at
every threshold. Going to the mesh to find out why says it is only PARTLY polygon count:

    public/models/anim/player_unwrapped.glb   10,378 tris   13,039 vertices
    unique positions                           5,171        so 60% of vertices are duplicates
    positions carrying a HARD NORMAL BREAK     2,328        45% of every corner on the model
    worst disagreement between copies            165 deg

A SHADING BREAK RENDERS IDENTICALLY TO A POLYGON EDGE. 1,318 of those corners - a quarter of
the whole surface - carry a break under 30 degrees, which on a rounded robot body has no shape
behind it. The eye counts them as facets because there is nothing else they could be.

The breaks come from the GENERATOR, not from this pipeline: the raw Meshy source files carry
exactly the same 2,328, and `tools/unwrap_player.py` only ever writes TEXCOORD_0. Note that
`player_smooth.glb` is WORSE at 4,388 despite its name.

WHAT THIS DOES. For every position that carries more than one vertex copy, cluster the copies by
how far their normals disagree, average each cluster, and write the average back. Below the
threshold the copies become one smooth normal; above it they are left split, because that split
is a real edge - the boot sole rim, a panel lip, the jaw line.

    THE THRESHOLD IS THE WHOLE DESIGN DECISION. Too low fixes nothing; too high melts the hard
    edges the robot needs. It is swept and picked by looking, per the project's standing rule
    that a number hitting its target is not evidence it looks right.

⚠️ COMPLETE LINKAGE, NOT SINGLE LINKAGE, AND THE DIFFERENCE IS A MELTED EDGE. Single linkage
unions any two copies within the threshold, so a chain of four copies at 25 degrees apiece
merges normals a hundred degrees apart and the hard edge quietly dissolves. A cluster here is
only formed when EVERY member is within the threshold of every other, so the threshold means
what its name says: the widest break that will ever be merged.

⚠️ THIS IS NOT A BLENDER SCRIPT, DELIBERATELY, AND THAT IS THE WHOLE SAFETY ARGUMENT.
`tools/unwrap_player.py` and `tools/subdivide_player.py` run inside Blender because they need to
edit topology. This edits ONE ATTRIBUTE, and a Blender round-trip cannot promise what the job
requires: the exporter re-orders vertices, re-emits indices, re-writes every animation sampler
and re-derives the skin. The vertex split MUST SURVIVE - it exists for the UV seam and deleting
it would break the unwrap - and "same vertex count, same indices, same POSITION, same UV, same
JOINTS/WEIGHTS, same skeleton, same 15 clips" is only provable if those bytes are never touched.

So this reads the GLB container directly and rewrites the NORMAL accessor's bufferView IN PLACE.
Every other byte of the output file is identical to the input, and the tool ASSERTS that rather
than claiming it - see CONTROLS below. It runs on Blender's bundled Python (3.11 + numpy) purely
because that is the interpreter this box has; it imports no `bpy`.

CONTROLS, because the failure mode here is a tool that silently writes its input back out:

    --threshold 0   must change EXACTLY ZERO normals. Watched to fail-closed: the run prints
                    "CONTROL: zero normals changed" and exits 3, which is what a no-op looks
                    like. Any real run that produces that line is broken, not conservative.
    --control       deliberately perturbs POSITION as well, so the byte-identity assertion below
                    can be WATCHED failing. Never use it to produce a shipped asset.

    Every run asserts, and exits non-zero on any of them:
      * the JSON chunk is byte-identical (vertex counts, accessors, skins, all 15 animations)
      * every byte of the BIN chunk outside NORMAL's bufferView is identical
      * every output normal is unit length
      * the normals ACTUALLY DIFFER, and by how much - count and mean/max degrees moved
"""
import sys
import json
import math
import struct

import numpy as np

GLB_MAGIC = 0x46546C67
CHUNK_JSON = 0x4E4F534A
CHUNK_BIN = 0x004E4942

# How close two POSITIONs must be to count as the same corner. The duplicates this tool exists
# for are exact copies of one another, but a tolerance costs nothing and the model's own scale
# says what is safe: triangle edges are median 21.2 mm and p95 68.1 mm, so 1e-5 (0.01 mm) is
# three orders of magnitude below the smallest real feature and cannot fuse two distinct corners.
POSITION_EPS = 1e-5


def parse_glb(raw):
    """Split a GLB into (json_dict, json_bytes, bin_bytes, header) without touching anything."""
    magic, version, length = struct.unpack_from("<III", raw, 0)
    if magic != GLB_MAGIC:
        raise SystemExit("not a GLB (bad magic)")
    if length != len(raw):
        raise SystemExit(f"GLB header says {length} bytes, file is {len(raw)}")
    off, chunks = 12, {}
    while off < len(raw):
        clen, ctype = struct.unpack_from("<II", raw, off)
        chunks[ctype] = (off + 8, clen)
        off += 8 + clen
    if CHUNK_JSON not in chunks or CHUNK_BIN not in chunks:
        raise SystemExit("GLB is missing a JSON or BIN chunk")
    jo, jl = chunks[CHUNK_JSON]
    bo, bl = chunks[CHUNK_BIN]
    json_bytes = raw[jo:jo + jl]
    bin_bytes = raw[bo:bo + bl]
    return json.loads(json_bytes.decode("utf-8")), json_bytes, bin_bytes, (jo, jl, bo, bl)


def accessor_view(gltf, bin_bytes, index, expect_type, expect_component=5126):
    """
    Read one accessor as a numpy array, and REFUSE anything this tool cannot rewrite safely.

    ⚠️ THE STRIDE CHECK IS NOT PARANOIA. If NORMAL were interleaved with POSITION in a shared
    bufferView, writing normals would mean writing bytes that also carry positions, and the
    "nothing but NORMAL changed" promise would be false while every assertion still passed
    because they would be measuring the same interleaved range. This asset stores each attribute
    in its own tightly-packed view; the tool exits rather than guessing if that ever changes.
    """
    acc = gltf["accessors"][index]
    if acc["type"] != expect_type or acc["componentType"] != expect_component:
        raise SystemExit(f"accessor {index} is {acc['type']}/{acc['componentType']}, "
                         f"expected {expect_type}/{expect_component}")
    bv = gltf["bufferViews"][acc["bufferView"]]
    ncomp = {"VEC2": 2, "VEC3": 3, "VEC4": 4, "SCALAR": 1}[expect_type]
    itemsize = 4 * ncomp
    stride = bv.get("byteStride", itemsize)
    if stride != itemsize:
        raise SystemExit(f"accessor {index} is INTERLEAVED (stride {stride} != {itemsize}); "
                         f"this tool only rewrites tightly-packed attribute views")
    start = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    count = acc["count"]
    arr = np.frombuffer(bin_bytes, dtype="<f4", count=count * ncomp, offset=start)
    return arr.reshape(count, ncomp).astype(np.float64), start, count * itemsize


def break_histogram(pos_groups, normals):
    """
    How far the copies at each corner disagree - the statistic this whole round is about.

    Reports, per position that carries more than one copy, the WIDEST pairwise angle between its
    normals. A corner with no break is a corner whose copies all agree; a corner at 90 degrees is
    a real edge. The distribution across those two is the design decision.
    """
    bands = [(1, 15), (15, 30), (30, 45), (45, 60), (60, 90), (90, 181)]
    counts = [0] * len(bands)
    worst = 0.0
    broken = 0
    for idxs in pos_groups:
        if len(idxs) < 2:
            continue
        n = normals[idxs]
        d = np.clip(n @ n.T, -1.0, 1.0)
        ang = math.degrees(math.acos(float(d.min())))
        if ang <= 1.0:
            continue
        broken += 1
        worst = max(worst, ang)
        for bi, (lo, hi) in enumerate(bands):
            if lo <= ang < hi:
                counts[bi] += 1
                break
    return {
        "positionsWithBreak": broken,
        "worstDeg": round(worst, 1),
        "bands": {f"{lo}-{hi}": c for (lo, hi), c in zip(bands, counts)},
    }


def dihedral_report(positions, indices, pos_key_inverse):
    """
    HOW MUCH OF THE FACETING IS GENUINELY POLYGON COUNT - the number that decides whether a
    subdivision pass is worth buying, and the reason this tool reports something it does not fix.

    A normal break is a SHADING defect and this tool removes it. What it cannot remove is the
    mesh's actual angularity: the GEOMETRIC dihedral angle between two triangles sharing an edge.
    That is the floor on how smooth the surface can ever look at this triangle count, because it
    bounds both the silhouette's polygonalisation and the residual interpolation banding.

    Edges are matched through the POSITION-merged vertex ids, not raw indices - the mesh is split
    45% of the way round its own corners, so raw indices would report most shared edges as two
    unmatched boundary edges and the whole distribution would be wrong.
    """
    tris = indices.reshape(-1, 3)
    v = pos_key_inverse[tris]
    p0, p1, p2 = positions[tris[:, 0]], positions[tris[:, 1]], positions[tris[:, 2]]
    fn = np.cross(p1 - p0, p2 - p0)
    ln = np.linalg.norm(fn, axis=1, keepdims=True)
    ok = ln[:, 0] > 1e-12
    fn = np.where(ln > 1e-12, fn / np.maximum(ln, 1e-12), 0.0)

    edges = {}
    for ti in range(len(v)):
        if not ok[ti]:
            continue
        a, b, c = int(v[ti, 0]), int(v[ti, 1]), int(v[ti, 2])
        for e in ((a, b), (b, c), (c, a)):
            k = (e[0], e[1]) if e[0] < e[1] else (e[1], e[0])
            edges.setdefault(k, []).append(ti)

    angs = []
    for k, ts in edges.items():
        if len(ts) != 2:
            continue
        d = float(np.clip(np.dot(fn[ts[0]], fn[ts[1]]), -1.0, 1.0))
        angs.append(math.degrees(math.acos(d)))
    if not angs:
        return {}
    a = np.array(angs)
    return {
        "sharedEdges": int(len(a)),
        "medianDeg": round(float(np.median(a)), 2),
        "meanDeg": round(float(a.mean()), 2),
        "p90Deg": round(float(np.percentile(a, 90)), 2),
        "p99Deg": round(float(np.percentile(a, 99)), 2),
        "over10Deg": round(float((a > 10).mean() * 100), 1),
        "over20Deg": round(float((a > 20).mean() * 100), 1),
        "over30Deg": round(float((a > 30).mean() * 100), 1),
    }


def cluster_complete_linkage(normals_at_position, threshold_cos):
    """
    Group the copies at ONE corner so that every member of a group agrees with every other.

    Greedy agglomerative with a complete-linkage test. Groups here are tiny - the median corner
    carries 2 copies and the largest a handful - so the O(n^2) test is free and exact, and it is
    what stops a chain of small breaks from merging a large one (see the header).
    """
    n = len(normals_at_position)
    groups = [[i] for i in range(n)]
    merged = True
    while merged and len(groups) > 1:
        merged = False
        best = None
        best_dot = -2.0
        for a in range(len(groups)):
            for b in range(a + 1, len(groups)):
                # complete linkage: the WORST pair across the two groups decides
                worst = 2.0
                for i in groups[a]:
                    for j in groups[b]:
                        d = float(np.dot(normals_at_position[i], normals_at_position[j]))
                        worst = min(worst, d)
                if worst >= threshold_cos and worst > best_dot:
                    best_dot, best = worst, (a, b)
        if best is not None:
            a, b = best
            groups[a] = groups[a] + groups[b]
            groups.pop(b)
            merged = True
    return groups


def main():
    args = sys.argv[1:]
    if len(args) < 2:
        raise SystemExit("usage: python tools/smooth_normals.py <in.glb> <out.glb> "
                         "[--threshold DEG] [--control]")
    src, dst = args[0], args[1]
    threshold = 30.0
    control = False
    if "--threshold" in args:
        threshold = float(args[args.index("--threshold") + 1])
    if "--control" in args:
        control = True
    if not (0.0 <= threshold <= 180.0):
        raise SystemExit("--threshold must be 0..180 degrees")

    raw = open(src, "rb").read()
    gltf, json_bytes, bin_bytes, (jo, jl, bo, bl) = parse_glb(raw)

    prims = [p for m in gltf["meshes"] for p in m["primitives"]
             if "NORMAL" in p["attributes"] and "POSITION" in p["attributes"]]
    if len(prims) != 1:
        raise SystemExit(f"expected exactly one primitive with POSITION+NORMAL, found {len(prims)}")
    prim = prims[0]

    positions, _, _ = accessor_view(gltf, bin_bytes, prim["attributes"]["POSITION"], "VEC3")
    normals, nrm_start, nrm_len = accessor_view(gltf, bin_bytes, prim["attributes"]["NORMAL"], "VEC3")
    if len(positions) != len(normals):
        raise SystemExit("POSITION and NORMAL disagree on vertex count")

    # Normalise the inputs before measuring anything - a generator can ship slightly-off normals
    # and an un-normalised dot product would misreport every angle in the histogram.
    lens = np.linalg.norm(normals, axis=1, keepdims=True)
    if float(lens.min()) < 1e-8:
        raise SystemExit("input carries a zero-length normal; cannot proceed")
    normals = normals / lens

    # Corners: vertices sharing a position. Quantised, so the key is exact integer arithmetic
    # rather than a float compare that would depend on iteration order.
    keys = np.round(positions / POSITION_EPS).astype(np.int64)
    _, inverse = np.unique(keys, axis=0, return_inverse=True)
    inverse = inverse.reshape(-1)
    n_positions = int(inverse.max()) + 1
    groups = [[] for _ in range(n_positions)]
    for vi, gi in enumerate(inverse):
        groups[int(gi)].append(vi)

    before_hist = break_histogram(groups, normals)

    idx_acc = gltf["accessors"][prim["indices"]]
    idx_bv = gltf["bufferViews"][idx_acc["bufferView"]]
    idx_dtype = {5121: "<u1", 5123: "<u2", 5125: "<u4"}[idx_acc["componentType"]]
    indices = np.frombuffer(bin_bytes, dtype=idx_dtype, count=idx_acc["count"],
                            offset=idx_bv.get("byteOffset", 0) + idx_acc.get("byteOffset", 0))
    geometry = dihedral_report(positions, indices.astype(np.int64), inverse)

    # ---- the merge itself
    threshold_cos = math.cos(math.radians(threshold))
    out = normals.copy()
    merged_positions = 0
    merged_vertices = 0
    for idxs in groups:
        if len(idxs) < 2:
            continue
        sub = normals[idxs]
        # Fast path: the whole corner already agrees, or the threshold cannot merge anything.
        clusters = cluster_complete_linkage(sub, threshold_cos)
        if len(clusters) == len(idxs):
            continue
        touched = False
        for cl in clusters:
            if len(cl) < 2:
                continue
            avg = sub[cl].mean(axis=0)
            ln = np.linalg.norm(avg)
            if ln < 1e-8:
                # Cannot happen under complete linkage below 90 degrees, but a silent zero normal
                # would render as a black hole rather than an error, so it is refused loudly.
                raise SystemExit("averaged normal collapsed to zero; threshold too wide")
            avg = avg / ln
            for i in cl:
                if not np.allclose(out[idxs[i]], avg, atol=1e-9):
                    touched = True
                out[idxs[i]] = avg
                merged_vertices += 1
        if touched:
            merged_positions += 1

    after_hist = break_histogram(groups, out)

    # How far each normal actually moved, in degrees. This is the number that proves the tool
    # did something, and the `--threshold 0` control is the arm that proves it can say zero.
    dots = np.clip((normals * out).sum(axis=1), -1.0, 1.0)
    moved_deg = np.degrees(np.arccos(dots))
    """
    ⚠️ THE EPSILON IS 1e-3 DEGREES AND THE FIRST VERSION'S 1e-6 WAS WRONG - CAUGHT BY THE
    CONTROL, WHICH IS THE ONLY REASON IT IS NOT STILL IN HERE. At `--threshold 0` the tool still
    forms clusters out of copies whose normals agree EXACTLY (dot 1.0 >= cos(0) 1.0), averages
    them, and re-normalises, which is a no-op except for float noise around 1e-7 radians. At
    1e-6 that noise counted as 1,516 "changed" normals, so the no-op guard below did NOT fire on
    a run that changed nothing - the breaks-did-not-fall assertion caught it instead, by luck of
    ordering. A thousandth of a degree is far below anything that can shade differently and far
    above the noise, so the count now means what it says.
    """
    MOVE_EPS_DEG = 1e-3
    changed = int((moved_deg > MOVE_EPS_DEG).sum())

    stats = {
        "threshold": threshold,
        "vertices": int(len(normals)),
        "uniquePositions": n_positions,
        "before": before_hist,
        "after": after_hist,
        "geometry": geometry,
        "positionsMerged": merged_positions,
        "verticesInMergedClusters": merged_vertices,
        "normalsChanged": changed,
        "meanMoveDeg": round(float(moved_deg[moved_deg > 1e-6].mean()) if changed else 0.0, 3),
        "maxMoveDeg": round(float(moved_deg.max()), 3),
    }
    print("SMOOTH_STATS " + json.dumps(stats))

    """
    ⚠️ THE NO-OP GUARD. A tool that reads a GLB and writes it back out unchanged produces a file
    of the right size with the right name that renders exactly like the input, and every visual
    A/B after it would compare an asset against itself and report "no difference, must be the
    threshold". That is the failure this round is most exposed to, so it is an ERROR and not a
    warning, and `--threshold 0` is the arm that makes it fire on purpose.
    """
    if changed == 0:
        print(f"CONTROL: zero normals changed at threshold {threshold} - nothing was written.")
        raise SystemExit(3)

    # ---- write: rewrite ONLY the NORMAL bufferView's bytes inside the BIN chunk
    new_bin = bytearray(bin_bytes)
    new_bin[nrm_start:nrm_start + nrm_len] = out.astype("<f4").tobytes()

    if control:
        """
        ⚠️ THE CONTROL THAT MUST FAIL. This perturbs POSITION as well, so the byte-identity
        assertion below can be watched failing rather than trusted. A guard nobody has seen fail
        is not a guard.
        """
        pos_bv = gltf["bufferViews"][gltf["accessors"][prim["attributes"]["POSITION"]]["bufferView"]]
        ps = pos_bv.get("byteOffset", 0)
        new_bin[ps:ps + 4] = struct.pack("<f", float(positions[0][0]) + 0.01)
        print("CONTROL: POSITION deliberately perturbed - the assertion below MUST fail.")

    out_raw = bytearray(raw)
    out_raw[bo:bo + bl] = new_bin

    # ---- ASSERTIONS. Everything the job promised, checked against the bytes, not claimed.
    problems = []
    if bytes(out_raw[jo:jo + jl]) != json_bytes:
        problems.append("the JSON chunk changed - accessors/skins/animations are not identical")
    head = bytes(out_raw[bo:bo + nrm_start]) == bytes(bin_bytes[:nrm_start])
    tail = bytes(out_raw[bo + nrm_start + nrm_len:bo + bl]) == bytes(bin_bytes[nrm_start + nrm_len:])
    if not (head and tail):
        problems.append("BIN bytes OUTSIDE the NORMAL bufferView changed - POSITION, UV, "
                        "JOINTS/WEIGHTS, indices or an animation sampler was touched")
    if len(out_raw) != len(raw):
        problems.append(f"file length changed {len(raw)} -> {len(out_raw)}")
    rt = np.frombuffer(bytes(out_raw[bo + nrm_start:bo + nrm_start + nrm_len]),
                       dtype="<f4").reshape(-1, 3).astype(np.float64)
    bad = np.abs(np.linalg.norm(rt, axis=1) - 1.0)
    if float(bad.max()) > 1e-4:
        problems.append(f"a written normal is not unit length (worst error {float(bad.max()):.2e})")
    if after_hist["positionsWithBreak"] >= before_hist["positionsWithBreak"]:
        problems.append(f"breaks did not fall: {before_hist['positionsWithBreak']} -> "
                        f"{after_hist['positionsWithBreak']}")

    if problems:
        print("SMOOTH FAILED:\n  " + "\n  ".join(problems))
        raise SystemExit(2)

    open(dst, "wb").write(bytes(out_raw))
    print("SMOOTH_RESULT " + json.dumps({"out": dst, **stats}))


"""
The guard exists so `tools/subdivide_player.py` can IMPORT the merge rule rather than copy it.
Subdivision has to re-derive normals from scratch, and it must inherit this tool's 30-degree
complete-linkage merge or the new asset would silently lose the fix this one exists for. Two
copies of a clustering rule drift; one does not. Nothing else changed - the CLI is identical,
and that is asserted by re-running it and byte-comparing against the shipped player_norm30.glb.
"""
if __name__ == "__main__":
    main()
