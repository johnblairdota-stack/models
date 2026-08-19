"""
LOOP-SUBDIVIDE THE PLAYER BODY, so the shell stops reading as a triangle mosaic.

    "C:\\Program Files\\Blender Foundation\\Blender 4.5\\4.5\\python\\bin\\python.exe" ^
      tools/subdivide_player.py <in.glb> <out.glb> [--crease DEG] [--smooth DEG]

WHY THIS EXISTS, AND WHY IT IS THE SECOND HALF OF AN ANSWER. `tools/smooth_normals.py` fixed the
FREE half of the faceting: 2,328 of 5,171 corners carried a hard normal break straight from the
generator, 1,318 of them under 30 degrees with no shape behind them, and merging the spurious
ones cost zero triangles (-> `player_norm30.glb`, the body this file subdivides).

The residual is genuinely polygon count, and it was measured directly rather than argued. The
GEOMETRIC dihedral angle across the 15,567 shared edges of `player_norm30.glb`:

    median 16.75 deg   mean 27.48   p90 69.38   p99 130.74
    66.9% of edges bend more than 10 deg, 43.7% more than 20

A 16.75 degree median is a ~20-sided cylinder everywhere. The model is natively 1.700 units and
loads at 1.7 m, so scale is exactly 1.0, and at the ~518 px/m the figure renders at, the median
facet is 11 screen pixels wide. No shading trick removes that; only vertices can.

    10,378 tris -> 41,512, of a 60,000 budget. A second level is ~166,000 and blows it.

⚠️ THE CRUX, AND WHERE A NAIVE SUBDIVIDER PRODUCES A TORN MODEL. 60% of the vertices are
duplicates sitting on top of each other - 13,039 vertices over 5,171 unique positions - split for
UV seams and hard normals. Subdivision needs TOPOLOGY: which triangles share an edge. On the
SPLIT mesh, neighbouring triangles across a seam do not share vertex indices, so a subdivider
reading raw indices sees a shell full of boundaries. Its edge points still land on the seam (a
boundary edge point is the midpoint either way, so the tear does NOT show there) but its VERTEX
points do not: a seam vertex sees only half its true neighbourhood, so the two copies of one
corner get pulled to two DIFFERENT places and the shell rips open along every seam. That is the
quiet version of this failure - a cracked mesh that still loads and still animates.

So: WELD BY POSITION to build the topology, SUBDIVIDE on the welded topology, RE-SPLIT on the way
out. The re-split is what keeps the unwrap alive, and it is done by keying every new edge vertex
on the pair of ORIGINAL (split-space) vertex indices that made it:

    two triangles that shared an edge index-for-index  -> one key  -> one new vertex, welded
    two triangles either side of a UV seam             -> two keys -> two new vertices, split

Both copies take their POSITION from the same welded edge point, so they are coincident by
construction and no crack is possible; they take their UV, normal and skin from their own split
parents, so the seam network survives. The seams are not repaired and then re-cut - they are
never broken.

The fact that makes the weld safe was VERIFIED, not assumed (it is asserted on every run, and
re-measured on this input at the top of `main`): all 4,389 multi-copy positions carry IDENTICAL
`JOINTS_0` and `WEIGHTS_0`, to the byte. Welding therefore cannot corrupt the skin. The welded
mesh is also CLOSED AND PERFECTLY MANIFOLD - 15,567 edges, every one with exactly two faces, zero
boundary, zero non-manifold, zero degenerate and zero duplicate faces - which is the best case
Loop can be handed and is why the boundary rules below are implemented but never fire on this
asset.

WHAT IS INTERPOLATED, AND THE ONE THING THAT IS DELIBERATELY NOT.

  POSITION     Loop. This is the entire point: a 1-to-4 split that does not MOVE anything buys
               4x the cost and changes no silhouette. Loop is APPROXIMATING, so the mesh shrinks
               slightly and sharp edges round - both are measured and reported, see SHAPE COST.
  TEXCOORD_0   averaged per split-space edge. The unwrap is a world-axis cube projection, which
               is piecewise linear, so linear interpolation REPRODUCES the input's uv field on
               the refined mesh exactly. Metres-per-uv-unit is asserted unmoved, or the panel
               grid would change plate size as a side effect of a geometry change.
  JOINTS_0 /   a new EDGE vertex takes the union of its two parents' influences at half weight
  WEIGHTS_0    each, renormalised. glTF allows only 4 influences per set and averaging two
               different pairs can produce up to 8, so the 4 heaviest are kept and the tool
               REPORTS how many vertices that truncation touched and the largest weight it threw
               away. ⚠️ An ORIGINAL vertex KEEPS ITS OWN WEIGHTS BIT-FOR-BIT and is not smoothed
               against its neighbours - Loop's vertex rule is right for a surface and wrong for a
               skin, where it would blur every joint boundary across a one-ring. That gives a
               strong invariant instead of a judgement call, and it is asserted: the first 13,039
               output vertices must carry byte-identical JOINTS/WEIGHTS to the input.
  NORMAL       recomputed area-weighted in the OUTPUT SPLIT index space - so the seam structure
               decides which faces meet at a vertex - and then passed through
               `smooth_normals.py`'s own 30-degree complete-linkage merge, IMPORTED from that
               file rather than copied, so the new asset inherits the fix instead of losing it
               and the two tools cannot drift. Recomputing in WELDED space instead would have
               given every copy one normal, silently melting every hard edge on the model.

CREASES. Loop rounds sharp edges, and some of them are real: the boot sole rim, panel lips, the
jaw line. An edge whose input dihedral exceeds `--crease` is tagged, and Hoppe's rules apply -
a creased edge splits at its midpoint, a vertex on exactly two creases follows the crease curve,
and a vertex on three or more is a corner and does not move at all.

    ⚠️ `--crease 45` IS TOO TIGHT ON THIS MESH AND THE BRIEFED NUMBER WAS A DIFFERENT STATISTIC.
    "682 corners over 45 degrees" is `smooth_normals.py`'s NORMAL-BREAK histogram, counted over
    POSITIONS. The GEOMETRIC dihedral has 3,135 edges over 45 (20.1% of the surface) and 2,073
    over 60 (13.3%). Creasing a fifth of the model preserves a fifth of the faceting, which is
    the defect. The threshold is swept and picked BY LOOKING, per the standing rule that a number
    hitting its target is not evidence it looks right.

CONTROLS, because the failure modes here are a tool that silently writes its input back out, and
one that produces a cracked mesh that still loads. Both are watched failing, never trusted:

    --level 0        subdivide zero times. Must trip the no-op guard and exit 3. That is what
                     "the tool wrote its input back out" looks like from the outside.
    --control-noweld build the topology from RAW SPLIT INDICES instead of welded positions -
                     i.e. exactly the naive implementation described above. The seam vertices
                     tear apart and the CLOSURE assertion below must fire. Never ship its output.
                     WATCHED: boundary edges 0 -> 16,726, welded positions 5,171 -> 26,395.
    --control-uvseam give each new edge vertex ONE parent's uv instead of the midpoint - a sheared
                     atlas on perfect geometry, which no geometric check can see. The uv-area
                     assertion must fire. WATCHED, see below.
    --no-refit       skip the per-axis bbox restoration (see REFIT). Reproduces the first,
                     REJECTED build so the hip can be A/B'd against it. ⚠️ THIS IS NOT A CONTROL
                     AND WAS BRIEFLY MISTAKEN FOR ONE: it switches off the refit AND the assertion
                     that guards it, so it exits 0 and demonstrates nothing. A guard disabled
                     alongside the feature it guards has not been watched.
    --control-halfrefit  apply only half the correction, so the refit RUNS and lands short. This
                     is the arm that actually makes the bbox assertion fire.
                     WATCHED: "refit did not restore the bbox: worst axis error 8.689e-04 m".
    --skirt-thicken 0    run the whole hem selection, find the rim, offset it by nothing. Must
                     trip the thicken no-op guard and exit 3. The selection still RUNS, which is
                     what separates this from a bypass.
    --control-thicken-axis  offset the hem along world +X instead of each vertex's own outward
                     surface normal. The hem wraps the leg, so this drives one whole side of it
                     INTO the body: the thicken runs, moves the right vertices by the right
                     distance, and lands wrong. The outwardness assertion must fire.

⚠️ SKIRT THICKEN, AND WHAT MEASUREMENT SAID ABOUT THE CAUSE IT WAS COMMISSIONED FOR. The round
arrived with a stated mechanism - "the coarse mesh bridges a real recess at the skirt/thigh
junction, and any refinement follows the true concave form so the recess opens". Three
measurements say that is not what this asset does:

  * the hip's edge-point displacement under Butterfly is ORDINARY. Over y 0.55..0.80 the signed
    offset along the normal is median +0.3..+0.57 mm with a worst of -4.6 mm, while the TORSO at
    y 0.85..1.05 reaches -8.2 mm and carries no band at all. Nothing about the hip is extreme.
  * the shell is a SINGLE CONNECTED COMPONENT - 5,171 welded positions, one component. There is
    no separate skirt shell that could be pulled off a thigh.
  * a triangle-triangle intersection test over the whole hip band (3,202 triangles, 60,105 pairs)
    finds 8 intersecting pairs, ALL of them in the hands, crossing at a median 73 degrees. There
    is no shallow-angle contact whose intersection curve could be amplified.

A fourth measurement found something real but not sufficient: new edge vertices take INVENTED
skin weights, and linear blend skinning is not linear in the weights, so a new vertex sinks below
the span the coarse mesh drew. That is scheme-independent (Loop and Butterfly share `merge_skin`)
and invisible in bind pose, which is why nothing in this thread had seen it - but it peaks at the
SHOULDER (8.9 mm) and the toes, not the hip (max 5.6 mm at the capture frame), and the shoulder
shows no band. It is a contributor, not the driver.

So the thicken is a REMEDY TRIED ON THE SYMPTOM, and it is labelled as one everywhere it reports.

⚠️ HEM MIDPOINT (`--hem-midpoint`), ROUND TWELVE, AND IT FAILED TOO. The last mechanism the thread
had was that a smooth stencil places its edge point OFF the chord between two original vertices, so
a thin LIP retreats between them - one scallop per original edge, i.e. a sawtooth - and Butterfly's
0.000 mm vertex guarantee cannot help because it holds the VERTICES and not the CURVE BETWEEN them.
Two facts supported it, and one of them is true: `tools/_hipx5_hemdih.py` measured the hem loop's own
dihedral at median 14.80 deg over 79 edges, of which only 13 clear `--crease 65`, so THE LIP WAS
NEVER BEING CREASED - 66 of its 79 edges took the smooth stencil.

Forcing all 79 to the pure chord midpoint (`--hem-midpoint loop`) moved the band the WRONG WAY:
bf65 1647 -> bfhem 1660 against n30's 1333 bar, +13 px, inside a +-9 px redraw noise floor, and by
eye the sawtooth is the same teeth in the same places at the same depth. The edit was delivered and
checked - 102 vertices moved, all in y 0.692..0.839, max 8.736 mm = 4.5 screen px, with JOINTS,
WEIGHTS, TEXCOORD and indices byte-identical to bf65 - so this is a null RESULT, not a null EDIT.

A lower `--crease` cannot substitute: a threshold selects an ANGLE, not the hem, and catching 90% of
the hem loop needs 3.8 deg, which creases 87.5% of the mesh and so preserves the faceting this file
exists to remove. `--hem-midpoint loop` catches 100% of the loop at zero collateral, so it strictly
dominates that arm and there is nothing left to sweep there.

THE FLAG IS KEPT because it is the only way to re-run that elimination, and because its three
controls are the pattern the next lip-shaped hypothesis will need. It is OFF by default and it is
not a ship candidate.

Every run asserts, and exits non-zero on any of them:
  * the output, re-welded by position, is EXACTLY AS CLOSED as the input - same boundary-edge
    count, same non-manifold-edge count. This is the crack proof.
  * every original vertex's JOINTS_0/WEIGHTS_0 is byte-identical to the input's
  * every WEIGHTS_0 row sums to 1, and every joint index is in range
  * the carried-over JSON - skins, all 15 animations, nodes, scenes, every accessor and
    bufferView that existed before - is STRUCTURALLY IDENTICAL, and the whole original BIN chunk
    is a BYTE-IDENTICAL PREFIX of the new one (this tool only ever APPENDS, see WRITE STRATEGY)
  * triangles went up 4x, and the dihedral distribution actually got smoother
  * metres-per-uv-unit did not move
  * no output normal is zero-length or non-unit

WRITE STRATEGY, and it is the same safety argument `smooth_normals.py` makes. A Blender round
trip re-orders vertices, re-emits indices, re-writes every animation sampler and re-derives the
skin, so "nothing else changed" stops being provable. This tool cannot leave the BIN untouched -
the mesh genuinely changes - so it does the next strongest thing: it APPENDS the six new
attribute views to the end of the buffer, leaves every original byte where it was, and repoints
only `meshes[0].primitives[0]`. The old mesh views are orphaned rather than compacted, which
costs ~0.7 MB of dead space and buys an assertion that is trivial to check and impossible to fool
- the original BIN is a byte-identical prefix, so no animation sampler, inverse-bind matrix or
skin index can have moved. The dead bytes are reported.
"""
import sys
import os
import json
import math
import struct
from collections import defaultdict

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# The merge rule is IMPORTED, never copied - see NORMAL above. `smooth_normals.py` guards its
# own `main()` for exactly this.
from smooth_normals import cluster_complete_linkage, break_histogram, dihedral_report

GLB_MAGIC = 0x46546C67
CHUNK_JSON = 0x4E4F534A
CHUNK_BIN = 0x004E4942

# Same tolerance and same reasoning as `smooth_normals.py`: triangle edges on this model are
# median 21.2 mm and p95 68.1 mm, so 0.01 mm is three orders of magnitude below the smallest real
# feature and cannot fuse two distinct corners. The two tools MUST agree on this number - they
# are welding the same asset - so it is stated identically in both.
POSITION_EPS = 1e-5

COMPONENT_DTYPE = {5120: "<i1", 5121: "<u1", 5122: "<i2", 5123: "<u2", 5125: "<u4", 5126: "<f4"}
TYPE_NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def parse_glb(raw):
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
    return json.loads(raw[jo:jo + jl].decode("utf-8")), raw[jo:jo + jl], raw[bo:bo + bl]


def read_accessor(gltf, bin_bytes, index):
    """
    Read one accessor, and REFUSE anything this tool cannot rebuild safely.

    ⚠️ The stride check is the same one `smooth_normals.py` makes and for a stronger reason here:
    if an attribute were interleaved into a shared bufferView, the ORIGINAL views would still be
    referenced by the accessors this tool orphans, and reasoning about what is dead and what is
    live would stop being a per-view question. This asset stores each attribute tightly packed in
    its own view; the tool exits rather than guessing if that ever changes.
    """
    acc = gltf["accessors"][index]
    bv = gltf["bufferViews"][acc["bufferView"]]
    dtype = COMPONENT_DTYPE[acc["componentType"]]
    ncomp = TYPE_NCOMP[acc["type"]]
    itemsize = np.dtype(dtype).itemsize * ncomp
    stride = bv.get("byteStride", itemsize)
    if stride != itemsize:
        raise SystemExit(f"accessor {index} is INTERLEAVED (stride {stride} != {itemsize}); "
                         f"this tool only rebuilds tightly-packed attribute views")
    start = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    arr = np.frombuffer(bin_bytes, dtype=dtype, count=acc["count"] * ncomp, offset=start)
    return arr.reshape(acc["count"], ncomp)


def weld(positions):
    """Quantised exact-integer keys, so the grouping cannot depend on iteration order."""
    keys = np.round(positions.astype(np.float64) / POSITION_EPS).astype(np.int64)
    _, inverse = np.unique(keys, axis=0, return_inverse=True)
    return inverse.reshape(-1)


def edge_faces(tri_v):
    """edge -> list of incident face ids, over whatever index space is handed in."""
    ef = defaultdict(list)
    for ti in range(len(tri_v)):
        a, b, c = int(tri_v[ti, 0]), int(tri_v[ti, 1]), int(tri_v[ti, 2])
        for u, v in ((a, b), (b, c), (c, a)):
            ef[(u, v) if u < v else (v, u)].append(ti)
    return ef


def closure_report(positions, tri_idx):
    """
    THE CRACK PROOF. Re-weld by POSITION and ask how closed the shell is.

    A tear is invisible in index space - the torn copies still have valid indices and the model
    still loads and animates. It is only visible geometrically: two triangles that used to meet
    now have edges that no longer land on the same points, so re-welding finds two boundary edges
    where there was one interior edge. Counting boundary and non-manifold edges after a
    position-weld is therefore the one measurement that a cracked output cannot pass.
    """
    inv = weld(positions)
    v = inv[tri_idx]
    ef = edge_faces(v)
    counts = np.array([len(t) for t in ef.values()])
    return {
        "weldedPositions": int(inv.max()) + 1,
        "weldedEdges": int(len(ef)),
        "boundaryEdges": int((counts == 1).sum()),
        "manifoldEdges": int((counts == 2).sum()),
        "nonManifoldEdges": int((counts > 2).sum()),
    }


def areas(positions, uvs, tri_idx):
    """
    Total surface area (m^2) and total uv area, which are two DIFFERENT questions.

    ⚠️ THE OBVIOUS METRIC HERE IS WRONG AND IT FIRED ON A GOOD BUILD. The first version of this
    measured median `world edge length / uv edge length` and asserted it could not move. But
    subdivision halves every uv edge EXACTLY while Loop legitimately SHORTENS the world edge it
    sits on, so that ratio moves whenever the surface smooths - it reported -4.7% on an arm whose
    unwrap was provably untouched, i.e. it was reading Loop's shape cost as unwrap damage. It also
    sampled "the first 4000 triangles", which is a different population of edges before and after,
    so it was not even comparing like with like.

    The two questions are separated here:
      * UV AREA answers "is the unwrap intact" - but only as a REPORTED figure, never as the
        assertion. See `uv_quarter_deviation` for why the total is not enough.
      * SURFACE AREA answers "how much did Loop shrink the form". That is the shape cost, and it
        is REPORTED, never asserted - shrinking is what an approximating scheme does.
    """
    p = positions.astype(np.float64)
    u = uvs.astype(np.float64)
    e1 = p[tri_idx[:, 1]] - p[tri_idx[:, 0]]
    e2 = p[tri_idx[:, 2]] - p[tri_idx[:, 0]]
    surf = 0.5 * np.linalg.norm(np.cross(e1, e2), axis=1).sum()
    d1 = u[tri_idx[:, 1]] - u[tri_idx[:, 0]]
    d2 = u[tri_idx[:, 2]] - u[tri_idx[:, 0]]
    uva = 0.5 * np.abs(d1[:, 0] * d2[:, 1] - d1[:, 1] * d2[:, 0]).sum()
    return float(surf), float(uva)


def uv_quarter_deviation(out_uv, out_tris, n_parents):
    """
    THE UNWRAP-INTACT ASSERTION, and the TOTAL uv area is NOT it.

    ⚠️ CAUGHT BY ITS OWN CONTROL, WHICH IS THE ONLY REASON IT IS NOT STILL WRONG. The first
    version asserted that total uv area is invariant - true, since four midpoint sub-triangles
    each carry exactly a quarter of the parent. Then `--control-uvseam` (give each edge vertex ONE
    parent's uv instead of the midpoint - a fully sheared atlas) was run against it and it PASSED,
    exit 0, file written. Working it out on paper says why, and it is not bad luck: for a parent
    (A,B,C) with a<b<c the corrupted children become (A,A,A), (A,B,B), (A,B,C) and (A,B,A) - three
    degenerate triangles of area zero and one carrying the WHOLE parent area. The total is exactly
    preserved by a mapping that has destroyed the atlas. A sum over a partition cannot see a
    corruption that only redistributes within the partition.

    So the assertion is PER TRIANGLE: every child's uv area must be a quarter of its own parent's.
    That is the same invariant stated where it actually has content, it fails hard on the control
    (three quarters of the children go to zero), and it needs the parent's identity, which is why
    children are emitted in parent order, four at a time.
    """
    u = out_uv.astype(np.float64)
    d1 = u[out_tris[:, 1]] - u[out_tris[:, 0]]
    d2 = u[out_tris[:, 2]] - u[out_tris[:, 0]]
    child = 0.5 * np.abs(d1[:, 0] * d2[:, 1] - d1[:, 1] * d2[:, 0])
    child = child.reshape(n_parents, 4)
    parent = child.sum(axis=1)
    scale = max(float(parent.max()), 1e-12)
    # absolute tolerance scaled by the LARGEST parent, so a degenerate parent cannot divide by ~0
    expect = parent / 4.0
    return float(np.abs(child - expect[:, None]).max() / scale)


def ordered_rings(n_v, tris_w):
    """
    Each vertex's one-ring in ROTATIONAL order, which Butterfly needs and Loop did not.

    Loop's vertex rule is a plain average of the one-ring, so a set was enough. Butterfly's
    stencil is positional - it needs "the neighbour two steps round from the edge" - so the ring
    must be a cycle in order. For a face (a,b,c) the successor of b around a is c, of c around b
    is a, and of a around c is b; walking that map from any start returns the ring.

    Returns None for any vertex whose faces do not close into a single cycle. On this asset that
    never happens (the welded mesh is closed and manifold, 0 boundary and 0 non-manifold edges),
    but a None is handled at the call site rather than assumed away.
    """
    nxt = [dict() for _ in range(n_v)]
    for t in tris_w:
        a, b, c = int(t[0]), int(t[1]), int(t[2])
        nxt[a][b] = c
        nxt[b][c] = a
        nxt[c][a] = b
    rings = []
    for v in range(n_v):
        m = nxt[v]
        if not m:
            rings.append(None)
            continue
        start = next(iter(m))
        ring, cur, ok = [start], m[start], True
        while cur != start:
            ring.append(cur)
            if cur not in m or len(ring) > len(m):
                ok = False
                break
            cur = m[cur]
        rings.append(ring if ok and len(ring) == len(m) else None)
    return rings


def zorin_weights(K):
    """
    Zorin's stencil for an EXTRAORDINARY vertex (valence != 6), applied to its ordered one-ring
    starting at the far end of the edge. The centre carries 3/4 and these carry the rest; each
    set sums to exactly 1/4, so the whole stencil is affine-invariant and the scheme reproduces
    planes. K=3 and K=4 are the tabulated special cases; K>=5 is the closed form.
    """
    if K == 3:
        return [5.0 / 12.0, -1.0 / 12.0, -1.0 / 12.0]
    if K == 4:
        return [3.0 / 8.0, 0.0, -1.0 / 8.0, 0.0]
    return [(1.0 / K) * (0.25 + math.cos(2.0 * math.pi * j / K)
                         + 0.5 * math.cos(4.0 * math.pi * j / K)) for j in range(K)]


def loop_beta(n):
    """
    Loop's original vertex weight. At the regular valence 6 this is exactly 1/16, the same value
    Warren's simplified 3/(8n) gives, so the two agree everywhere the mesh is regular and differ
    only at irregular corners. The original is used because it is the rule the algorithm is named
    for.
    """
    if n == 3:
        return 3.0 / 16.0
    c = math.cos(2.0 * math.pi / n)
    return (1.0 / n) * (5.0 / 8.0 - (3.0 / 8.0 + 0.25 * c) ** 2)


def apply_force_midpoint(pos_w, tris_w, ef, edge_pt, force_mid, offchord=False):
    """
    ROUND TWELVE'S ONE ROUTING CHANGE: put a named set of edges on the PURE CHORD MIDPOINT,
    overriding both the smooth stencil and the crease rules.

    WHY THIS AND NOT ANOTHER SHAPE EDIT. Both smooth stencils place an edge point off the chord
    that joins its two original vertices - Loop's 3/8+1/8 and Butterfly's 8-point/Zorin stencils
    both do, by design, because that is what removes a facet. On a thin LIP that displacement is a
    scallop: the lip's silhouette between two original vertices moves off the original polygon, one
    scallop per original edge, which is what a sawtooth is. The midpoint rule is the only placement
    that leaves the polygon exactly where the coarse mesh drew it while the rest of the body
    refines normally. It is already implemented here as the crease fallback, so this is a ROUTE,
    not new maths.

    It is applied LAST and unconditionally, so a creased hem edge is forced too - the 4-point
    crease curve is interpolating at the vertices but still leaves the chord between them.

    ⚠️ EVERY FORCED EDGE MUST LAND EXACTLY ON ITS OWN CHORD, and `offchord=True` is the control
    that makes that assertion fire: it runs the whole selection, forces the right edges, and puts
    them 1 mm off the chord along the local surface normal. A reroute that moves the right vertices
    to the wrong place is the failure this file has been burned by before.
    """
    stats = {"forcedEdges": 0, "maxDeltaMm": 0.0, "medianDeltaMm": 0.0, "worstOffChordMm": 0.0}
    if not force_mid:
        return stats
    deltas = []
    for e in sorted(force_mid):
        if e not in ef:
            raise SystemExit(
                f"forced edge {e} is not an edge of the WELDED topology. The forced set was built "
                f"in the wrong index space - on this mesh 60% of vertices are split copies, so a "
                f"set keyed on raw indices selects a different loop or none at all.")
        u, v = e
        mid = 0.5 * (pos_w[u] + pos_w[v])
        before = edge_pt[e]
        target = mid
        if offchord:
            fn = np.zeros(3)
            for ti in ef[e]:
                a, b, c = int(tris_w[ti, 0]), int(tris_w[ti, 1]), int(tris_w[ti, 2])
                fn = fn + np.cross(pos_w[b] - pos_w[a], pos_w[c] - pos_w[a])
            nl = np.linalg.norm(fn)
            if nl > 1e-12:
                target = mid + (fn / nl) * 0.001
        edge_pt[e] = target
        deltas.append(float(np.linalg.norm(target - before)) * 1000.0)
        stats["worstOffChordMm"] = max(stats["worstOffChordMm"],
                                       float(np.linalg.norm(target - mid)) * 1000.0)
    stats["forcedEdges"] = len(deltas)
    stats["maxDeltaMm"] = round(max(deltas), 4)
    stats["medianDeltaMm"] = round(float(np.median(deltas)), 4)
    stats["worstOffChordMm"] = round(stats["worstOffChordMm"], 6)
    return stats


def subdivide_positions(pos_w, tris_w, crease_edges, boundary_edges,
                        force_mid=None, offchord=False):
    """
    Loop, with Hoppe's crease rules, on the WELDED topology.

    Returns (new vertex points, {welded edge -> edge point}).
    """
    n_v = len(pos_w)
    ef = edge_faces(tris_w)

    # one-ring adjacency, and the crease/boundary tag per incident edge
    neighbours = [set() for _ in range(n_v)]
    sharp_nb = [[] for _ in range(n_v)]
    for (u, v), faces in ef.items():
        neighbours[u].add(v)
        neighbours[v].add(u)
        if (u, v) in crease_edges or (u, v) in boundary_edges:
            sharp_nb[u].append(v)
            sharp_nb[v].append(u)

    # ---- edge points
    edge_pt = {}
    for (u, v), faces in ef.items():
        a, b = pos_w[u], pos_w[v]
        if (u, v) in crease_edges or (u, v) in boundary_edges or len(faces) != 2:
            # a crease, a boundary, or anything non-manifold: the midpoint, which keeps the
            # feature line exactly where it was
            edge_pt[(u, v)] = 0.5 * (a + b)
            continue
        opp = []
        for ti in faces:
            for k in range(3):
                w = int(tris_w[ti, k])
                if w != u and w != v:
                    opp.append(w)
        if len(opp) != 2:
            edge_pt[(u, v)] = 0.5 * (a + b)
            continue
        edge_pt[(u, v)] = 0.375 * (a + b) + 0.125 * (pos_w[opp[0]] + pos_w[opp[1]])

    force_stats = apply_force_midpoint(pos_w, tris_w, ef, edge_pt, force_mid, offchord)

    # ---- vertex points
    new_pos = np.empty_like(pos_w)
    corner_count = crease_count = smooth_count = 0
    for i in range(n_v):
        sharp = sharp_nb[i]
        if len(sharp) >= 3:
            # a corner where three or more feature lines meet: it does not move at all
            new_pos[i] = pos_w[i]
            corner_count += 1
        elif len(sharp) == 2:
            # on a feature line: follow the CURVE, ignoring the surface either side of it
            new_pos[i] = 0.75 * pos_w[i] + 0.125 * (pos_w[sharp[0]] + pos_w[sharp[1]])
            crease_count += 1
        else:
            # smooth interior (a lone sharp edge is a dart and uses the smooth rule)
            nb = list(neighbours[i])
            n = len(nb)
            if n == 0:
                new_pos[i] = pos_w[i]
                continue
            beta = loop_beta(n)
            new_pos[i] = (1.0 - n * beta) * pos_w[i] + beta * pos_w[nb].sum(axis=0)
            smooth_count += 1
    return new_pos, edge_pt, {
        "cornerVerts": corner_count, "creaseVerts": crease_count, "smoothVerts": smooth_count,
        **force_stats,
    }


def subdivide_positions_butterfly(pos_w, tris_w, crease_edges, boundary_edges, badring=False,
                                  force_mid=None, offchord=False):
    """
    MODIFIED BUTTERFLY - the INTERPOLATING scheme, and the reason this asset can be subdivided.

    WHY THIS AND NOT LOOP. Loop is approximating: it moves every original vertex toward its
    one-ring average, and the movement scales with local curvature, so a thin RIM contracts far
    harder than a broad flank. On this body the pelvis skirt overlaps the top of the thigh by a
    margin narrower than that contraction, so Loop pulled the skirt off the thigh and opened a
    sawtooth black band across both hips that read as a tear. It was measured, not guessed:
    original vertices moved inward by up to 10.907 mm. Restoring the bounding box per axis - the
    obvious fix - gives back only 1.112 mm at the widest point in Z, recovering 5.7% of the worst
    case, because a GLOBAL affine cannot undo a LOCAL contraction nine times its size.

    Butterfly's vertex rule is the IDENTITY. Original vertices do not move at all, so the skirt
    rim stays exactly where it was and the overlap is preserved BY CONSTRUCTION rather than by
    compensation. That is a structural guarantee against precisely the measured cause, and it is
    asserted on every run (max original-vertex displacement must be EXACTLY 0.0).

    THE STENCILS, and the irregular cases are where this scheme goes wrong if skipped:

      both endpoints valence 6   the regular 8-point stencil. For the ring of u written from v as
                                 [v, c, p2, p3, p4, d] and of v from u as [u, d, q2, q3, q4, c]:
                                     1/2 (u + v)  +  1/8 (c + d)  -  1/16 (p2 + p4 + q2 + q4)
                                 c and d complete the two triangles on the edge; the four
                                 negative terms are the wings across (u,c), (u,d), (v,d), (v,c).
      exactly one extraordinary  Zorin's stencil about THAT vertex only: 3/4 * u + sum s_j * ring
                                 (see `zorin_weights`). The regular side is ignored entirely -
                                 blending the two is what produces the classic Butterfly crease
                                 artefact around an extraordinary vertex.
      both extraordinary         the mean of the two one-sided Zorin results.

    CREASES. A creased edge (dihedral above --crease) takes the 4-POINT INTERPOLATING CURVE rule
    along the crease polyline, 9/16 (u+v) - 1/16 (prev + next), which is the 1-D analogue of this
    scheme: it is interpolating, so the feature line stays exactly on its original vertices, and
    it keeps the crease a distinct polyline instead of letting the smooth stencil round it. Where
    an endpoint is not a clean 2-crease vertex - a corner, or a dart - there is no well-defined
    "next along the crease", so the edge falls back to the MIDPOINT, which is still interpolating
    and still exactly on the feature. Boundaries would use the same rule; this mesh has none.
    """
    n_v = len(pos_w)
    rings = ordered_rings(n_v, tris_w)
    ef = edge_faces(tris_w)

    sharp_nb = [[] for _ in range(n_v)]
    for (u, v) in list(crease_edges) + list(boundary_edges):
        sharp_nb[u].append(v)
        sharp_nb[v].append(u)

    def ring_from(v, first):
        r = rings[v]
        if r is None or first not in r:
            return None
        i = r.index(first)
        return r[i:] + r[:i]

    stats = {"regular": 0, "oneExtraordinary": 0, "bothExtraordinary": 0,
             "crease4pt": 0, "creaseMidpoint": 0, "fallbackMidpoint": 0}
    edge_pt = {}
    for (u, v), faces in ef.items():
        a, b = pos_w[u], pos_w[v]

        if (u, v) in crease_edges or (u, v) in boundary_edges or len(faces) != 2:
            # a feature line: 4-point interpolating curve rule along the crease
            pu = [w for w in sharp_nb[u] if w != v]
            pv = [w for w in sharp_nb[v] if w != u]
            if len(sharp_nb[u]) == 2 and len(sharp_nb[v]) == 2 and len(pu) == 1 and len(pv) == 1:
                edge_pt[(u, v)] = (9.0 / 16.0) * (a + b) - (1.0 / 16.0) * (pos_w[pu[0]] + pos_w[pv[0]])
                stats["crease4pt"] += 1
            else:
                edge_pt[(u, v)] = 0.5 * (a + b)
                stats["creaseMidpoint"] += 1
            continue

        ru, rv = ring_from(u, v), ring_from(v, u)
        if badring and ru is not None:
            # CONTROL: rotate by one, so the ring keeps its length and members but loses its
            # phase. This is the exact silent error the assertion below exists for.
            ru = ru[1:] + ru[:1]
        if ru is None or rv is None:
            edge_pt[(u, v)] = 0.5 * (a + b)
            stats["fallbackMidpoint"] += 1
            continue
        Ku, Kv = len(ru), len(rv)

        def zorin(centre, ring):
            s = zorin_weights(len(ring))
            acc = 0.75 * pos_w[centre]
            for j, w in enumerate(s):
                acc = acc + w * pos_w[ring[j]]
            return acc

        """
        ⚠️ THE RING ORDER IS ASSERTED, NOT TRUSTED, AND ON THIS MESH NOTHING ELSE WOULD CATCH IT.
        The regular stencil is entirely positional - `ru[1]`/`ru[-1]` must be the two vertices
        that complete the faces on this edge, and `ru[2]`/`ru[4]` the wings beyond them. A ring
        walked the wrong way round, or rotated by one, still has the right LENGTH and the right
        MEMBERS, so the weights still sum to 1, the mesh is still closed, the skin is still
        byte-identical and every other check in this file passes on a surface whose points are
        quietly in the wrong places. Only 1,172 of 15,567 edges here are regular, so a silent
        error in this branch would move a small enough fraction of the model to look like a
        rendering quirk. The two face-opposite vertices are known independently from `faces`, so
        the check costs nothing and is exact.
        """
        opp = set()
        for ti in faces:
            for k in range(3):
                w = int(tris_w[ti, k])
                if w != u and w != v:
                    opp.add(w)
        if {ru[1], ru[-1]} != opp:
            raise SystemExit(
                f"ring order is wrong at edge ({u},{v}): the ring says the faces are completed by "
                f"{{{ru[1]}, {ru[-1]}}} but the topology says {sorted(opp)}. The Butterfly stencil "
                f"is positional and would silently place every regular edge point incorrectly.")
        if Ku == 6 and Kv == 6:
            c, d = ru[1], ru[5]
            edge_pt[(u, v)] = (0.5 * (a + b) + 0.125 * (pos_w[c] + pos_w[d])
                               - 0.0625 * (pos_w[ru[2]] + pos_w[ru[4]]
                                           + pos_w[rv[2]] + pos_w[rv[4]]))
            stats["regular"] += 1
        elif Ku != 6 and Kv == 6:
            edge_pt[(u, v)] = zorin(u, ru)
            stats["oneExtraordinary"] += 1
        elif Ku == 6 and Kv != 6:
            edge_pt[(u, v)] = zorin(v, rv)
            stats["oneExtraordinary"] += 1
        else:
            edge_pt[(u, v)] = 0.5 * (zorin(u, ru) + zorin(v, rv))
            stats["bothExtraordinary"] += 1

    stats.update(apply_force_midpoint(pos_w, tris_w, ef, edge_pt, force_mid, offchord))

    # THE GUARANTEE: the vertex rule is the identity.
    return pos_w.copy(), edge_pt, stats


def skirt_rim(pos_w, tris_w, W, jointpos, name2k, adj=None):
    """
    THE SKIRT HEM, DERIVED FROM THE RIG - never a hand-typed box.

    ⚠️ THE BRIEFED SELECTION RULE HAS NO REFERENT ON THIS ASSET, AND SAYING SO IS THE POINT. The
    instruction was "vertices whose one-ring is ONE-SIDED", i.e. an open rim. This shell is CLOSED
    and perfectly manifold - 0 boundary edges, 0 non-manifold edges, asserted on every run by
    `closure_report` and re-measured directly. There is no open rim anywhere on the body, so a
    literal one-sided one-ring selects the empty set and a thicken built on it would silently do
    nothing while reporting success. That is exactly the no-op failure this file exists to refuse.

    The reading that KEEPS the intent - derived rather than typed, and it moves with the rig
    because it is defined by the rig - is a SKIN-INFLUENCE rim: a vertex whose one-ring straddles
    the Hips -> UpLeg boundary, taken on the Hips (skirt) side. That is the hem where the skirt
    passes over the thigh. A box on a posed figure lands somewhere else the moment anything moves;
    this cannot, because it is stated in terms of bone influence and topology only.

    Measured on `player_norm30.glb`: 38 left + 37 right = 75 of 5,171 welded positions (1.45%),
    each leg's rim a single dominant chain (32 and 34) of mostly degree-2 vertices - a hem loop,
    not a scatter - spanning y 0.691..0.843 with the pelvis at 0.847 and the UpLeg at 0.765, and
    with outward normals correctly opposed between the two legs (mean x +0.166 / -0.246).

    Returns {welded index -> falloff weight in 0..1}, full weight on the rim itself and a cosine
    taper over `rings` rings on the SKIRT side, so the offset does not land as a step.
    """
    from collections import deque as _deque
    HIPS = name2k["Hips"]
    rim_all = {}
    for side, ul in (("L", name2k["LeftUpLeg"]), ("R", name2k["RightUpLeg"])):
        knee_y = jointpos[name2k["LeftLeg"]][1]
        pelvis_y = jointpos[HIPS][1]
        sel = []
        for v in range(len(pos_w)):
            if W[v, HIPS] <= W[v, ul] or W[v, ul] <= 0.0:
                continue
            if not (knee_y < pos_w[v][1] < pelvis_y):
                continue
            if any(W[w, ul] > W[w, HIPS] for w in adj[v]):
                sel.append(v)
        for v in sel:
            rim_all[v] = 1.0
    return rim_all


def thicken_skirt(pos, inv, tris_w, W, jointpos, name2k, adj, mm, rings, axis_control=False):
    """
    OFFSET THE SKIRT HEM OUTWARD ALONG ITS OWN SURFACE NORMAL, on the SOURCE mesh, before any
    subdivision.

    ⚠️ ALONG THE SURFACE NORMAL, NOT A WORLD AXIS. The hem wraps all the way around the leg, so
    any single world direction is correct on at most one side of it and drives the opposite side
    INTO the body. `--control-thicken-axis` is that mistake, wired in so the outwardness assertion
    can be watched firing rather than trusted.

    ⚠️ APPLIED PER WELDED POSITION, NOT PER VERTEX. 60% of this mesh's vertices are duplicates
    split for UV seams; moving one copy of a corner and not the others would tear the shell open
    along every seam that crosses the hem. Every copy of a position takes the same offset, so
    coincident vertices stay coincident by construction and the crack proof cannot be affected.

    The falloff exists because a hard offset on the rim alone would replace the band with a step.
    Weight 1.0 on the rim, cosine taper over `rings` rings measured on the SKIRT side only, so the
    thigh below the hem is never touched.
    """
    from collections import deque as _deque
    n_pos = len(np.unique(inv))
    pos_w = np.zeros((n_pos, 3))
    for vi, gi in enumerate(inv):
        pos_w[int(gi)] = pos[vi]

    rim = skirt_rim(pos_w, tris_w, W, jointpos, name2k, adj)
    if not rim:
        raise SystemExit("skirt-thicken selected ZERO vertices; the rim rule found no hem and a "
                         "thicken of nothing would report success while changing nothing")

    # cosine taper outward from the rim, over the SKIRT side only (Hips-dominant vertices)
    HIPS = name2k["Hips"]
    weight = dict(rim)
    frontier = set(rim)
    for r in range(1, rings + 1):
        nxt = set()
        for v in frontier:
            for w in adj[v]:
                if w in weight:
                    continue
                if W[w, HIPS] < max(W[w, name2k["LeftUpLeg"]], W[w, name2k["RightUpLeg"]]):
                    continue          # thigh side: never touched
                nxt.add(w)
        for w in nxt:
            weight[w] = 0.5 * (1.0 + math.cos(math.pi * r / (rings + 1)))
        frontier = nxt

    # area-weighted vertex normals on the WELDED topology
    fnw = np.cross(pos_w[tris_w[:, 1]] - pos_w[tris_w[:, 0]],
                   pos_w[tris_w[:, 2]] - pos_w[tris_w[:, 0]])
    acc = np.zeros((n_pos, 3))
    for k in range(3):
        np.add.at(acc, tris_w[:, k], fnw)
    VN = acc / np.maximum(np.linalg.norm(acc, axis=1, keepdims=True), 1e-12)

    """
    ⚠️ SIGNED VOLUME, so that "along the vertex normal" provably MEANS "outward". The whole
    direction argument rests on the normals pointing out of the shell rather than into it, and on
    a closed manifold that is decidable rather than assumed: the divergence theorem gives a
    positive signed volume exactly when the winding puts normals outward. Without this the
    direction guard below would be satisfied just as happily by a thicken that dented the hem
    inward all the way round.
    """
    sv = float(np.einsum("ij,ij->i", pos_w[tris_w[:, 0]],
                         np.cross(pos_w[tris_w[:, 1]], pos_w[tris_w[:, 2]])).sum() / 6.0)

    delta_w = np.zeros((n_pos, 3))
    for v, f in weight.items():
        d = np.array([1.0, 0.0, 0.0]) if axis_control else VN[v]
        delta_w[v] = d * (mm / 1000.0) * f

    """
    THE DIRECTION MEASUREMENT, and it replaces a WRONG ONE that I watched fire on a good build.
    The first version asserted that every rim vertex must gain RADIAL distance from its leg axis.
    That is not what this hem does: it faces DOWN-and-out, so on much of its length the normal is
    dominated by -Y and the horizontal residual is small and sign-noisy. Offsetting those vertices
    downward extends the skirt further over the thigh, which is precisely the intent - yet the
    radial test called it a failure and refused all three real arms (min radial -1.38 / -2.76 /
    -4.15 mm) while the mean was healthily positive (+1.15 / +2.31 / +3.46). It was measuring a
    component the operation was never trying to move.

    What actually has content is that the offset is PARALLEL TO EACH VERTEX'S OWN NORMAL, which is
    the thing `--control-thicken-axis` breaks and a world axis cannot satisfy on a hem that wraps.
    Radial outwardness is still REPORTED, because it is informative, but it is not the assertion.
    """
    align = []
    for v, f in weight.items():
        if f <= 0 or np.linalg.norm(delta_w[v]) < 1e-15:
            continue
        align.append(float(np.dot(delta_w[v] / np.linalg.norm(delta_w[v]), VN[v])))
    align = np.array(align) if align else np.array([1.0])

    outward = []
    for v in rim:
        ul = name2k["LeftUpLeg"] if W[v, name2k["LeftUpLeg"]] >= W[v, name2k["RightUpLeg"]] \
            else name2k["RightUpLeg"]
        radial = np.array([pos_w[v][0] - jointpos[ul][0], 0.0, pos_w[v][2] - jointpos[ul][2]])
        n = np.linalg.norm(radial)
        if n < 1e-9:
            continue
        outward.append(float(np.dot(delta_w[v], radial / n)))
    outward = np.array(outward)

    out = pos.copy()
    for vi, gi in enumerate(inv):
        out[vi] = pos[vi] + delta_w[int(gi)]

    moved = np.linalg.norm(out - pos, axis=1)
    stats = {
        "requestedMm": mm, "rings": rings,
        "rimVerts": len(rim), "taperedVerts": len(weight) - len(rim),
        "movedVerts": int((moved > 0).sum()),
        "maxMoveMm": round(float(moved.max()) * 1000, 4),
        "meanMoveMm": round(float(moved[moved > 0].mean()) * 1000, 4) if (moved > 0).any() else 0.0,
        "minOutwardMm": round(float(outward.min()) * 1000, 4) if len(outward) else 0.0,
        "meanOutwardMm": round(float(outward.mean()) * 1000, 4) if len(outward) else 0.0,
        "minNormalAlign": round(float(align.min()), 9),
        "signedVolume": round(sv, 9),
        "axisControl": bool(axis_control),
    }
    return out, stats, rim, weight


def merge_skin(j_a, w_a, j_b, w_b):
    """
    Union two parents' influences at half weight each, keep the 4 heaviest, renormalise.

    Returns (joints4, weights4, n_discarded, largest_discarded).
    """
    acc = defaultdict(float)
    for j, w in zip(j_a, w_a):
        if w > 0:
            acc[int(j)] += 0.5 * float(w)
    for j, w in zip(j_b, w_b):
        if w > 0:
            acc[int(j)] += 0.5 * float(w)
    items = sorted(acc.items(), key=lambda kv: -kv[1])
    dropped = items[4:]
    items = items[:4]
    total = sum(w for _, w in items)
    if total <= 0:
        raise SystemExit("an edge vertex ended with zero total skin weight")
    joints = [0, 0, 0, 0]
    weights = [0.0, 0.0, 0.0, 0.0]
    for k, (j, w) in enumerate(items):
        joints[k] = j
        weights[k] = w / total
    return joints, weights, len(dropped), (dropped[0][1] if dropped else 0.0)


def main():
    args = sys.argv[1:]
    if len(args) < 2:
        raise SystemExit("usage: python tools/subdivide_player.py <in.glb> <out.glb> "
                         "[--crease DEG] [--smooth DEG] [--level N] "
                         "[--scheme butterfly|loop] "
                         "[--skirt-thicken MM] [--thicken-rings N] "
                         "[--hem-midpoint loop|spokes|all|none] "
                         "[--control-noweld] [--control-uvseam] [--control-halfrefit] "
                         "[--control-thicken-axis] [--control-hem-offchord] "
                         "[--control-hem-splitkeys]")
    src, dst = args[0], args[1]
    crease_deg = 65.0
    smooth_deg = 30.0
    level = 1
    noweld = "--control-noweld" in args
    uvbreak = "--control-uvseam" in args
    halfrefit = "--control-halfrefit" in args
    scheme = args[args.index("--scheme") + 1] if "--scheme" in args else "butterfly"
    if scheme not in ("butterfly", "loop"):
        raise SystemExit(f"--scheme must be butterfly or loop, got {scheme}")
    """
    ⚠️ THE FLAG'S PRESENCE ARMS THE PASS, NOT ITS VALUE - and the difference is a BYPASS I watched
    happen. Keying the block on `thicken_mm > 0` meant `--skirt-thicken 0` skipped the selection
    entirely, exited 0 and wrote a perfectly ordinary subdivision: the no-op CONTROL silently
    stopped being a control, because it disabled the check along with the feature. Armed on
    presence, `--skirt-thicken 0` runs the full hem selection and then trips the no-op guard,
    which is the only version of that control worth having.
    """
    thicken_requested = "--skirt-thicken" in args
    thicken_mm = float(args[args.index("--skirt-thicken") + 1]) if thicken_requested else 0.0
    thicken_rings = int(args[args.index("--thicken-rings") + 1]) if "--thicken-rings" in args else 2
    thicken_axis = "--control-thicken-axis" in args
    if thicken_axis and "--skirt-thicken" not in args:
        raise SystemExit("--control-thicken-axis is a control FOR --skirt-thicken and does "
                         "nothing on its own; pass both or neither")
    if thicken_mm < 0:
        raise SystemExit("--skirt-thicken must be >= 0 mm")
    """
    ⚠️ THE HEM-MIDPOINT ROUTE, armed on PRESENCE for the same reason the thicken is. `none` is its
    no-op control: it runs the whole rim selection, forces the empty set, and must trip the guard.
    `loop` forces only hem-to-hem edges (the lip's own polyline); `spokes` only the edges leaving
    it; `all` both.
    """
    hem_requested = "--hem-midpoint" in args
    hem_mode = args[args.index("--hem-midpoint") + 1] if hem_requested else "off"
    if hem_requested and hem_mode not in ("loop", "spokes", "all", "none"):
        raise SystemExit(f"--hem-midpoint must be loop|spokes|all|none, got {hem_mode}")
    hem_offchord = "--control-hem-offchord" in args
    hem_splitkeys = "--control-hem-splitkeys" in args
    for ctl in ("--control-hem-offchord", "--control-hem-splitkeys"):
        if ctl in args and not hem_requested:
            raise SystemExit(f"{ctl} is a control FOR --hem-midpoint and does nothing on its "
                             f"own; pass both or neither")
    """
    ⚠️ THE REFIT IS A LOOP-ONLY PATCH AND MUST NOT BE ARMED UNDER BUTTERFLY. It exists to claw
    back an approximating scheme's global shrink, and it FAILED at that on this asset (see the
    header). Butterfly does not move original vertices at all, so the bbox is preserved by the
    identity rather than by a correction, and applying a scale on top would introduce exactly the
    distortion the scheme was chosen to avoid. Default off; `--refit` forces it on for the Loop
    A/B.
    """
    refit = ("--refit" in args) or (scheme == "loop" and "--no-refit" not in args)
    if "--crease" in args:
        crease_deg = float(args[args.index("--crease") + 1])
    if "--smooth" in args:
        smooth_deg = float(args[args.index("--smooth") + 1])
    if "--level" in args:
        level = int(args[args.index("--level") + 1])
    if level not in (0, 1):
        raise SystemExit("--level must be 0 (the no-op control) or 1")

    raw = open(src, "rb").read()
    gltf, json_bytes, bin_bytes = parse_glb(raw)

    prims = [p for m in gltf["meshes"] for p in m["primitives"]
             if "POSITION" in p["attributes"] and "NORMAL" in p["attributes"]]
    if len(prims) != 1:
        raise SystemExit(f"expected exactly one primitive with POSITION+NORMAL, found {len(prims)}")
    prim = prims[0]
    if prim.get("mode", 4) != 4:
        raise SystemExit("primitive is not TRIANGLES; Loop subdivision needs a triangle mesh")
    for need in ("TEXCOORD_0", "JOINTS_0", "WEIGHTS_0"):
        if need not in prim["attributes"]:
            raise SystemExit(f"primitive has no {need}; this tool is for the skinned player body")

    pos = read_accessor(gltf, bin_bytes, prim["attributes"]["POSITION"]).astype(np.float64)
    uv = read_accessor(gltf, bin_bytes, prim["attributes"]["TEXCOORD_0"]).astype(np.float64)
    jnt = read_accessor(gltf, bin_bytes, prim["attributes"]["JOINTS_0"])
    wgt = read_accessor(gltf, bin_bytes, prim["attributes"]["WEIGHTS_0"]).astype(np.float64)
    idx = read_accessor(gltf, bin_bytes, prim["indices"]).reshape(-1).astype(np.int64)
    tris = idx.reshape(-1, 3)
    n_in = len(pos)

    jnt_acc = gltf["accessors"][prim["attributes"]["JOINTS_0"]]
    wgt_acc = gltf["accessors"][prim["attributes"]["WEIGHTS_0"]]
    if jnt_acc["componentType"] != 5121 or wgt_acc["componentType"] != 5126:
        raise SystemExit("this tool expects JOINTS_0 as UNSIGNED_BYTE and WEIGHTS_0 as FLOAT")

    # ---- the weld, and the claim that makes it safe, re-measured rather than assumed
    inv = weld(pos)
    n_pos = int(inv.max()) + 1
    groups = [[] for _ in range(n_pos)]
    for vi, gi in enumerate(inv):
        groups[int(gi)].append(vi)
    multi = [g for g in groups if len(g) > 1]
    skin_disagree = 0
    for g in multi:
        if not (jnt[g] == jnt[g[0]]).all() or float(np.abs(wgt[g] - wgt[g[0]]).max()) > 1e-6:
            skin_disagree += 1
    if skin_disagree:
        raise SystemExit(
            f"{skin_disagree} multi-copy positions carry DIFFERENT JOINTS/WEIGHTS between their "
            f"copies. Welding by position would fuse two different skin bindings and corrupt the "
            f"deform. This tool refuses; the asset needs a real DCC pass.")

    tris_w = inv[tris]
    if ((tris_w[:, 0] == tris_w[:, 1]) | (tris_w[:, 1] == tris_w[:, 2]) |
            (tris_w[:, 2] == tris_w[:, 0])).any():
        raise SystemExit("a triangle is degenerate once welded by position")

    """
    ⚠️ SKIRT THICKEN — THE ONLY STEP IN THIS FILE THAT CHANGES JOHN'S CHOSEN SHAPE, so it is
    off by default, it reports exactly how far the silhouette moved, and it is applied to the
    SOURCE mesh before anything else measures it - so `before_*` below describe the mesh that is
    actually handed to the subdivider rather than a mesh that no longer exists.

    ⚠️ AND IT IS AIMED AT A CAUSE THAT THE BRIEFED ONE IS NOT. The round arrived with "the coarse
    mesh bridges a real recess and refinement opens it". That was measured here and is NOT what
    the numbers say: the hip's edge-point displacement under Butterfly is ORDINARY - median
    +0.3..0.57 mm over y 0.55..0.80, worst -4.6 mm - while the TORSO at y 0.85..1.05 moves
    further (-8.2 mm) and shows no band at all. The shell is also a SINGLE connected manifold, so
    there is no separate skirt shell to pull off the thigh, and a triangle-triangle test over the
    whole hip band finds 8 intersecting pairs, all of them in the HANDS. The thicken is therefore
    a REMEDY being tried on the symptom, not a fix derived from a proven cause, and it is reported
    that way.
    """
    pos_pre_thicken = pos.copy()
    thicken_stats = None
    thicken_rim = thicken_weight = None
    rig_rim_inputs = None
    if thicken_requested or thicken_axis or hem_requested:
        joints_list = gltf["skins"][0]["joints"]
        jnames = [gltf["nodes"][nj].get("name", "?") for nj in joints_list]
        name2k = {n: k for k, n in enumerate(jnames)}
        for need in ("Hips", "LeftUpLeg", "RightUpLeg", "LeftLeg"):
            if need not in name2k:
                raise SystemExit(f"the hem selection needs a joint named {need}; this skeleton has "
                                 f"{jnames}")
        ibm_acc = read_accessor(gltf, bin_bytes, gltf["skins"][0]["inverseBindMatrices"]).astype(np.float64)
        jointpos = np.array([np.linalg.inv(ibm_acc[k].reshape(4, 4).T)[:3, 3]
                             for k in range(len(joints_list))])
        Wfull = np.zeros((n_pos, len(joints_list)))
        for vi, gi in enumerate(inv):
            for k in range(4):
                if wgt[vi, k] > 0:
                    Wfull[int(gi), int(jnt[vi, k])] = wgt[vi, k]
        adj = defaultdict(set)
        for t in tris_w:
            a, b, c = int(t[0]), int(t[1]), int(t[2])
            adj[a].update((b, c)); adj[b].update((a, c)); adj[c].update((a, b))
        rig_rim_inputs = (Wfull, jointpos, name2k, adj)
    if thicken_requested or thicken_axis:
        Wfull, jointpos, name2k, adj = rig_rim_inputs
        pos, thicken_stats, thicken_rim, thicken_weight = thicken_skirt(
            pos, inv, tris_w, Wfull, jointpos, name2k, adj,
            thicken_mm, thicken_rings, thicken_axis)
        print("THICKEN_STATS " + json.dumps(thicken_stats))
        """
        ⚠️ THE NO-OP GUARD FOR THE THICKEN. `--skirt-thicken 0` runs the whole selection, finds
        the hem, computes a zero offset and lands nothing - which from the outside is
        indistinguishable from a working thicken whose selection quietly missed. It must fail
        rather than write a file that A/Bs against itself.
        """
        if thicken_stats["maxMoveMm"] <= 1e-6:
            print(f"CONTROL: --skirt-thicken {thicken_mm} moved nothing - no file was written.")
            raise SystemExit(3)
        """
        ⚠️ THE OUTWARDNESS GUARD, and `--control-thicken-axis` is the arm that makes it fire. The
        hem wraps the leg, so a world-axis offset drives one side of it INTO the body; that is a
        thicken which runs, moves the right vertices by the right distance, and makes the defect
        worse. Every rim vertex must gain radial distance from its own leg axis.
        """
        if thicken_stats["signedVolume"] <= 0.0:
            print(f"THICKEN FAILED: the shell's signed volume is "
                  f"{thicken_stats['signedVolume']:.6f}, so its normals point INWARD and "
                  f"offsetting along them would dent the hem into the body.")
            raise SystemExit(2)
        if thicken_stats["minNormalAlign"] < 1.0 - 1e-9:
            print(f"THICKEN FAILED: an offset is not parallel to its own vertex normal "
                  f"(worst alignment {thicken_stats['minNormalAlign']:.6f}, must be 1). The hem "
                  f"wraps the leg, so a single world direction is correct on at most one side of "
                  f"it and drives the opposite side into the body.")
            raise SystemExit(2)
        # the shell must not have been torn by moving one copy of a split corner and not another
        if int(weld(pos).max()) + 1 != n_pos:
            raise SystemExit("skirt-thicken changed the number of unique positions; copies of a "
                             "split corner were moved apart and the UV seams are torn")

    before_closure = closure_report(pos, tris)
    before_geom = dihedral_report(pos, idx, inv)
    before_surf, before_uva = areas(pos, uv, tris)
    before_bbox = (pos.min(axis=0), pos.max(axis=0))

    # ---- creases, from the INPUT dihedral
    pos_w = np.zeros((n_pos, 3), dtype=np.float64)
    for gi, g in enumerate(groups):
        pos_w[gi] = pos[g[0]]
    p0, p1, p2 = pos[tris[:, 0]], pos[tris[:, 1]], pos[tris[:, 2]]
    fn = np.cross(p1 - p0, p2 - p0)
    fl = np.linalg.norm(fn, axis=1, keepdims=True)
    fn = np.where(fl > 1e-12, fn / np.maximum(fl, 1e-12), 0.0)
    ef_in = edge_faces(tris_w)
    crease_edges, boundary_edges = set(), set()
    crease_cos = math.cos(math.radians(crease_deg))
    for e, faces in ef_in.items():
        if len(faces) == 1:
            boundary_edges.add(e)
        elif len(faces) == 2:
            d = float(np.clip(np.dot(fn[faces[0]], fn[faces[1]]), -1.0, 1.0))
            if d < crease_cos:
                crease_edges.add(e)

    """
    ⚠️ THE CONTROL THAT MUST FAIL. Building the topology from RAW SPLIT INDICES is precisely the
    naive implementation this tool's header warns about. It is wired in so the CLOSURE assertion
    can be WATCHED firing rather than trusted; a guard nobody has seen fail is not a guard.
    """
    if noweld:
        print("CONTROL: topology built from RAW SPLIT INDICES - the closure assertion MUST fail.")
        topo_inv = np.arange(n_in, dtype=np.int64)
        topo_pos = pos.copy()
        topo_tris = tris
        topo_crease, topo_boundary = set(), set()
        ef_topo = edge_faces(topo_tris)
        for e, faces in ef_topo.items():
            if len(faces) == 1:
                topo_boundary.add(e)
    else:
        topo_inv = inv
        topo_pos = pos_w
        topo_tris = tris_w
        topo_crease, topo_boundary = crease_edges, boundary_edges

    """
    ⚠️ THE HEM'S FORCED-MIDPOINT SET, and the number that made this round worth running. The hem
    loop's OWN dihedral was measured with `tools/_hipx5_hemdih.py` on `player_norm30.glb`: median
    14.80 deg over its 79 edges, and only 13 of them (16.5%) clear the 65 deg crease threshold. The
    lip is therefore NOT creased - 66 of its 79 edges take the smooth stencil, which places their
    edge points off the chord. This set routes them to the chord midpoint instead.

    ⚠️ THE SET IS BUILT IN WELDED INDEX SPACE, and `--control-hem-splitkeys` is the arm that proves
    the difference is not cosmetic: it keys the same selection on RAW SPLIT indices, which on this
    mesh is a different index space entirely, and `apply_force_midpoint`'s membership assertion must
    fire. That is the exact class of error this file's header opens with.
    """
    hem_force = set()
    hem_rim = None
    if hem_requested:
        Wfull, jointpos, name2k, adj = rig_rim_inputs
        hem_rim = skirt_rim(pos_w, tris_w, Wfull, jointpos, name2k, adj)
        if not hem_rim:
            raise SystemExit("--hem-midpoint selected ZERO vertices; the rim rule found no hem "
                             "and forcing the empty set would write an ordinary subdivision")
        rs = set(hem_rim)
        loop_e = [e for e in ef_in if e[0] in rs and e[1] in rs]
        spoke_e = [e for e in ef_in if (e[0] in rs) != (e[1] in rs)]
        if hem_mode == "loop":
            hem_force = set(loop_e)
        elif hem_mode == "spokes":
            hem_force = set(spoke_e)
        elif hem_mode == "all":
            hem_force = set(loop_e) | set(spoke_e)
        else:
            hem_force = set()          # `none`: the no-op control, guard below must fire
        if hem_splitkeys:
            print("CONTROL: --control-hem-splitkeys keys the forced set on RAW SPLIT indices - "
                  "the membership assertion MUST fail.")
            hem_force = {(int(a), int(b)) if a < b else (int(b), int(a))
                         for (a, b) in ((groups[u][0], groups[v][0]) for (u, v) in hem_force)
                         if a != b}
        print("HEM_SELECT " + json.dumps({
            "mode": hem_mode, "rimVerts": len(hem_rim),
            "loopEdges": len(loop_e), "spokeEdges": len(spoke_e),
            "forcedEdges": len(hem_force),
            "creasedAlready": len([e for e in hem_force if e in crease_edges])}))

    if level == 0:
        """
        ⚠️ THE NO-OP GUARD. A tool that reads a GLB and writes it back out unchanged produces a
        file of the right size with the right name that renders exactly like the input, and every
        visual A/B after it would compare an asset against itself and report "no difference, must
        be the threshold". `--level 0` is the arm that makes that fire on purpose.
        """
        print("CONTROL: --level 0 subdivides nothing - no file was written.")
        raise SystemExit(3)

    if scheme == "butterfly":
        new_vpos, edge_pt, vrule = subdivide_positions_butterfly(
            topo_pos, topo_tris, topo_crease, topo_boundary, badring="--control-badring" in args,
            force_mid=hem_force, offchord=hem_offchord)
    else:
        new_vpos, edge_pt, vrule = subdivide_positions(
            topo_pos, topo_tris, topo_crease, topo_boundary,
            force_mid=hem_force, offchord=hem_offchord)

    if hem_requested:
        print("HEM_MIDPOINT " + json.dumps({k: vrule[k] for k in
                                            ("forcedEdges", "maxDeltaMm", "medianDeltaMm",
                                             "worstOffChordMm")}))
        """
        ⚠️ TWO GUARDS ON THE ROUTE, BOTH WITH A WATCHED CONTROL.

        The no-op guard: a reroute that lands nothing writes a file that A/Bs against an ordinary
        subdivision and reads as "the hem is not the cause" when in fact the hem was never touched.
        `--hem-midpoint none` runs the whole rim selection and forces the empty set, so the
        selection is proven to RUN while the guard fires.

        The on-chord guard: `--control-hem-offchord` forces the right edges to the wrong place,
        1 mm off their own chord. A midpoint that is not on the chord is not a midpoint.
        """
        if vrule["forcedEdges"] == 0 or vrule["maxDeltaMm"] <= 1e-3:
            print(f"CONTROL: --hem-midpoint {hem_mode} moved no edge point "
                  f"({vrule['forcedEdges']} edges, max {vrule['maxDeltaMm']} mm) - no file was "
                  f"written.")
            raise SystemExit(3)
        if vrule["worstOffChordMm"] > 1e-6:
            print(f"HEM MIDPOINT FAILED: a forced edge point sits "
                  f"{vrule['worstOffChordMm']:.4f} mm off its own chord, so it is not the midpoint "
                  f"and the lip has been moved rather than held.")
            raise SystemExit(2)

    # ---- re-split: key every new edge vertex on its ORIGINAL split-space index pair
    out_pos = [new_vpos[topo_inv[v]] for v in range(n_in)]
    out_uv = [uv[v] for v in range(n_in)]
    out_jnt = [list(jnt[v]) for v in range(n_in)]
    out_wgt = [list(wgt[v]) for v in range(n_in)]

    edge_vert = {}
    trunc_count = 0
    trunc_worst = 0.0
    for t in tris:
        a, b, c = int(t[0]), int(t[1]), int(t[2])
        for u, v in ((a, b), (b, c), (c, a)):
            k = (u, v) if u < v else (v, u)
            if k in edge_vert:
                continue
            wu, wv = int(topo_inv[k[0]]), int(topo_inv[k[1]])
            ek = (wu, wv) if wu < wv else (wv, wu)
            p = edge_pt.get(ek)
            if p is None:
                # only reachable when the topology has an edge the subdivider never saw, which
                # is a bug rather than a data case - refuse loudly rather than invent a point
                raise SystemExit(f"no edge point for welded edge {ek}; topology is inconsistent")
            j4, w4, ndrop, worst = merge_skin(jnt[k[0]], wgt[k[0]], jnt[k[1]], wgt[k[1]])
            if ndrop:
                trunc_count += 1
                trunc_worst = max(trunc_worst, worst)
            edge_vert[k] = len(out_pos)
            out_pos.append(p)
            """
            ⚠️ THE CONTROL THAT MUST FAIL for the unwrap assertion. Taking ONE parent's uv instead
            of the midpoint is exactly what a subdivider that mishandles a seam does: the geometry
            is still perfect and the model still loads, but the atlas is sheared and the panel
            grid slides. It is invisible in every geometric measurement, so the uv-area assertion
            is the only thing that can catch it - and a guard nobody has watched fire is not a
            guard.
            """
            out_uv.append(uv[k[0]] if uvbreak else 0.5 * (uv[k[0]] + uv[k[1]]))
            out_jnt.append(j4)
            out_wgt.append(w4)

    new_tris = []
    for t in tris:
        a, b, c = int(t[0]), int(t[1]), int(t[2])
        ab = edge_vert[(a, b) if a < b else (b, a)]
        bc = edge_vert[(b, c) if b < c else (c, b)]
        ca = edge_vert[(c, a) if c < a else (a, c)]
        new_tris.extend([(a, ab, ca), (ab, b, bc), (ca, bc, c), (ab, bc, ca)])

    out_pos = np.asarray(out_pos, dtype=np.float64)
    out_uv = np.asarray(out_uv, dtype=np.float64)

    """
    ⚠️ REFIT — RESTORE THE INPUT BBOX PER AXIS, AND THIS IS WHY THE FIRST BUILD WAS REJECTED.

    Loop is APPROXIMATING, so it shrinks, and it shrinks ANISOTROPICALLY because the shrink at a
    vertex scales with local curvature: on this body Y lost 0.053% and Z lost 0.51%, ten times
    more. That is not a rounding detail, it is a visible defect. The pelvis skirt overlaps the top
    of the thigh by a thin margin; half a percent of LATERAL contraction is enough to pull the
    skirt back off the thigh and expose the dark interior behind it, and the exposed edge is the
    skirt's own triangle boundary, so it reads as a SAWTOOTH BLACK BAND across both hips - a tear
    in the model rather than a seam between two parts. It was a worse defect than the faceting the
    subdivision had just fixed.

    The compensation is a per-axis affine that maps the output extents back onto the input's:

        p' = in_min + (p - out_min) * (in_extent / out_extent)

    ⚠️ ANCHORED AT MIN, NOT AT CENTRE. The rig stands on y = 0 and is scaled to 1.7 m at load, so
    a centre-anchored Y scale would lift the feet off the floor by half the correction. Mapping
    out_min onto in_min pins the soles exactly where they were and returns the crown to 1.70000.

    It is safe by construction rather than by measurement, which is the reason to prefer it:
      * an affine map is a bijection, so coincident vertices stay coincident and distinct ones
        stay distinct - the closure/crack proof CANNOT be affected, and it is re-asserted anyway
      * it is applied to every vertex identically, so the weld structure is untouched
      * it runs BEFORE normals are recomputed, so the normals derive from the final geometry and
        no inverse-transpose correction is owed
      * uvs and skin are not functions of position here, so neither can move
    Dihedral angles are not strictly invariant under a non-uniform scale, but at 0.2-0.5% the
    change is negligible - the histogram is re-measured after the refit and asserted unmoved.

    `--no-refit` reproduces the pre-rejection build, so the hip can be A/B'd against it.
    """
    refit_scale = np.ones(3)
    if refit:
        in_min, in_max = pos.min(axis=0), pos.max(axis=0)
        out_min, out_max = out_pos.min(axis=0), out_pos.max(axis=0)
        in_ext, out_ext = in_max - in_min, out_max - out_min
        refit_scale = np.where(out_ext > 1e-9, in_ext / np.maximum(out_ext, 1e-12), 1.0)
        """
        ⚠️ THE CONTROL THAT MUST FAIL for the refit assertion, and the FIRST attempt at one was a
        BYPASS rather than a control. `--no-refit` skips the correction AND the check that guards
        it, so it exits 0 and proves nothing - a guard that is switched off with the feature it
        guards has never been watched. This applies only HALF the correction (in log space), so
        the refit runs, lands short, and the assertion fires on a residual of the same order as
        the defect being corrected.
        """
        if halfrefit:
            refit_scale = np.sqrt(refit_scale)
            print("CONTROL: half refit applied - the bbox assertion MUST fail.")
        out_pos = in_min + (out_pos - out_min) * refit_scale

    out_jnt = np.asarray(out_jnt, dtype=np.uint8)
    out_wgt = np.asarray(out_wgt, dtype=np.float64)
    out_idx = np.asarray(new_tris, dtype=np.int64).reshape(-1)
    n_out = len(out_pos)

    # ---- NORMAL: area-weighted in the OUTPUT SPLIT space, then smooth_normals' 30-degree merge
    ot = out_idx.reshape(-1, 3)
    q0, q1, q2 = out_pos[ot[:, 0]], out_pos[ot[:, 1]], out_pos[ot[:, 2]]
    face_n = np.cross(q1 - q0, q2 - q0)          # length is 2x area: the area weighting
    acc_n = np.zeros((n_out, 3), dtype=np.float64)
    for k in range(3):
        np.add.at(acc_n, ot[:, k], face_n)
    nl = np.linalg.norm(acc_n, axis=1, keepdims=True)
    if float(nl.min()) < 1e-12:
        raise SystemExit("an output vertex accumulated a zero-length normal")
    out_nrm = acc_n / nl

    out_inv = weld(out_pos)
    out_groups = [[] for _ in range(int(out_inv.max()) + 1)]
    for vi, gi in enumerate(out_inv):
        out_groups[int(gi)].append(vi)
    pre_merge_hist = break_histogram(out_groups, out_nrm)
    smooth_cos = math.cos(math.radians(smooth_deg))
    for g in out_groups:
        if len(g) < 2:
            continue
        sub = out_nrm[g]
        clusters = cluster_complete_linkage(sub, smooth_cos)
        if len(clusters) == len(g):
            continue
        for cl in clusters:
            if len(cl) < 2:
                continue
            avg = sub[cl].mean(axis=0)
            ln = np.linalg.norm(avg)
            if ln < 1e-8:
                raise SystemExit("averaged normal collapsed to zero; --smooth too wide")
            avg = avg / ln
            for i in cl:
                out_nrm[g[i]] = avg
    post_merge_hist = break_histogram(out_groups, out_nrm)

    after_closure = closure_report(out_pos, out_idx.reshape(-1, 3))
    after_geom = dihedral_report(out_pos, out_idx, out_inv)
    after_surf, after_uva = areas(out_pos, out_uv, out_idx.reshape(-1, 3))
    uv_quarter_dev = uv_quarter_deviation(out_uv, out_idx.reshape(-1, 3), len(tris))
    after_bbox = (out_pos.min(axis=0), out_pos.max(axis=0))

    in_size = before_bbox[1] - before_bbox[0]
    out_size = after_bbox[1] - after_bbox[0]
    shape = {
        "bboxIn": [round(float(x), 5) for x in in_size],
        "bboxOut": [round(float(x), 5) for x in out_size],
        "shrinkPct": [round(float((1 - o / i) * 100), 3) if i > 1e-9 else 0.0
                      for i, o in zip(in_size, out_size)],
        "heightIn": round(float(in_size[1]), 5),
        "heightOut": round(float(out_size[1]), 5),
        "maxVertMoveMm": round(float(np.abs(out_pos[:n_in] - pos).max() * 1000), 3),
        "meanVertMoveMm": round(float(np.linalg.norm(out_pos[:n_in] - pos, axis=1).mean() * 1000), 3),
        "surfaceAreaIn": round(before_surf, 6),
        "surfaceAreaOut": round(after_surf, 6),
        "surfaceShrinkPct": round((1 - after_surf / before_surf) * 100, 3),
        "refit": bool(refit),
        "refitScale": [round(float(s), 6) for s in refit_scale],
        "refitPct": [round(float((s - 1) * 100), 4) for s in refit_scale],
    }
    """
    HOW FAR THE SILHOUETTE ACTUALLY MOVED, measured against the mesh as it was BEFORE the thicken
    rather than against the subdivider's input - because the thicken IS the shape change and
    measuring it against its own output would report zero. This is the number that says whether a
    shape edit John did not ask for is visible: at the ~518 px/m the figure renders at, 1 mm is
    0.52 screen pixels.
    """
    if thicken_stats is not None:
        sil = np.linalg.norm(out_pos[:n_in] - pos_pre_thicken, axis=1)
        pre_bbox = pos_pre_thicken.max(axis=0) - pos_pre_thicken.min(axis=0)
        shape["silhouetteMaxMoveMm"] = round(float(sil.max()) * 1000, 4)
        shape["silhouetteMeanMoveMm"] = round(float(sil[sil > 1e-12].mean()) * 1000, 4)
        shape["silhouetteMovedVerts"] = int((sil > 1e-12).sum())
        shape["silhouetteMaxMovePx"] = round(float(sil.max()) * 1000 * 0.518, 3)
        shape["bboxPreThicken"] = [round(float(x), 5) for x in pre_bbox]
        shape["bboxGrowthMm"] = [round(float((o - p) * 1000), 4)
                                 for p, o in zip(pre_bbox, out_size)]

    stats = {
        "scheme": scheme, "crease": crease_deg, "smooth": smooth_deg,
        "trisIn": len(tris), "trisOut": len(out_idx) // 3,
        "vertsIn": n_in, "vertsOut": n_out,
        "uniquePositionsIn": n_pos, "uniquePositionsOut": after_closure["weldedPositions"],
        "multiCopyPositions": len(multi), "skinDisagreements": skin_disagree,
        "creasedEdges": len(crease_edges), "creasedPct": round(len(crease_edges) / len(ef_in) * 100, 1),
        "vertexRule": vrule,
        "skinTruncatedVerts": trunc_count,
        "skinTruncatedPct": round(trunc_count / max(n_out - n_in, 1) * 100, 2),
        "largestWeightDiscarded": round(trunc_worst, 5),
        "closureIn": before_closure, "closureOut": after_closure,
        "geomIn": before_geom, "geomOut": after_geom,
        "uvAreaIn": round(before_uva, 8), "uvAreaOut": round(after_uva, 8),
        "uvAreaDriftPct": round(abs(after_uva - before_uva) / max(before_uva, 1e-12) * 100, 8),
        "uvQuarterMaxDev": float(f"{uv_quarter_dev:.3e}"),
        "normalBreaksBeforeMerge": pre_merge_hist, "normalBreaksAfterMerge": post_merge_hist,
        "shape": shape, "thicken": thicken_stats,
    }
    print("SUBDIV_STATS " + json.dumps(stats))

    """
    DUMP THE SELECTION SO IT CAN BE LOOKED AT. A selection rule is exactly the kind of thing that
    reports a plausible count while sitting on the wrong part of the model, and this project has
    lost rounds to that twice. The sidecar carries every selected position and its falloff weight,
    for the marked-selection capture.
    """
    if thicken_stats is not None and os.environ.get("THICKEN_DUMP"):
        pw = np.zeros((n_pos, 3))
        for vi, gi in enumerate(inv):
            pw[int(gi)] = pos_pre_thicken[vi]
        dump = {"rim": [[float(x) for x in pw[v]] for v in sorted(thicken_rim)],
                "taper": [[float(x) for x in pw[v]] + [round(float(w), 4)]
                          for v, w in sorted(thicken_weight.items()) if v not in thicken_rim]}
        open(os.environ["THICKEN_DUMP"], "w").write(json.dumps(dump))
        print(f"THICKEN_DUMP wrote {len(dump['rim'])} rim + {len(dump['taper'])} tapered "
              f"positions to {os.environ['THICKEN_DUMP']}")

    # ---- build the output GLB: APPEND ONLY (see WRITE STRATEGY)
    out_gltf = json.loads(json_bytes.decode("utf-8"))
    new_bin = bytearray(bin_bytes)

    def append_view(payload, target):
        while len(new_bin) % 4:
            new_bin.append(0)
        offset = len(new_bin)
        new_bin.extend(payload)
        out_gltf["bufferViews"].append(
            {"buffer": 0, "byteOffset": offset, "byteLength": len(payload), "target": target})
        return len(out_gltf["bufferViews"]) - 1

    def append_accessor(src_index, payload, count, target, extra=None):
        """Copy the ORIGINAL accessor dict so `normalized` and friends carry over verbatim."""
        acc = dict(out_gltf["accessors"][src_index])
        acc.pop("byteOffset", None)
        acc["bufferView"] = append_view(payload, target)
        acc["count"] = count
        acc.pop("min", None)
        acc.pop("max", None)
        if extra:
            acc.update(extra)
        out_gltf["accessors"].append(acc)
        return len(out_gltf["accessors"]) - 1

    ARRAY_BUFFER, ELEMENT_ARRAY_BUFFER = 34962, 34963
    if out_idx.max() > 0xFFFFFFFF:
        raise SystemExit("index range exceeds uint32")
    if out_idx.max() <= 0xFFFF:
        idx_dtype, idx_ct = "<u2", 5123
    else:
        idx_dtype, idx_ct = "<u4", 5125
    if int(out_jnt.max()) > 255:
        raise SystemExit("a joint index exceeds 255 and JOINTS_0 is UNSIGNED_BYTE")

    a_pos = append_accessor(prim["attributes"]["POSITION"], out_pos.astype("<f4").tobytes(),
                            n_out, ARRAY_BUFFER,
                            {"min": [float(x) for x in out_pos.min(axis=0)],
                             "max": [float(x) for x in out_pos.max(axis=0)]})
    a_nrm = append_accessor(prim["attributes"]["NORMAL"], out_nrm.astype("<f4").tobytes(),
                            n_out, ARRAY_BUFFER)
    a_uv = append_accessor(prim["attributes"]["TEXCOORD_0"], out_uv.astype("<f4").tobytes(),
                           n_out, ARRAY_BUFFER)
    a_jnt = append_accessor(prim["attributes"]["JOINTS_0"], out_jnt.astype("<u1").tobytes(),
                            n_out, ARRAY_BUFFER)
    a_wgt = append_accessor(prim["attributes"]["WEIGHTS_0"], out_wgt.astype("<f4").tobytes(),
                            n_out, ARRAY_BUFFER)
    a_idx = append_accessor(prim["indices"], out_idx.astype(idx_dtype).tobytes(),
                            len(out_idx), ELEMENT_ARRAY_BUFFER, {"componentType": idx_ct})

    out_prim = out_gltf["meshes"][0]["primitives"][0]
    out_prim["attributes"]["POSITION"] = a_pos
    out_prim["attributes"]["NORMAL"] = a_nrm
    out_prim["attributes"]["TEXCOORD_0"] = a_uv
    out_prim["attributes"]["JOINTS_0"] = a_jnt
    out_prim["attributes"]["WEIGHTS_0"] = a_wgt
    out_prim["indices"] = a_idx

    while len(new_bin) % 4:
        new_bin.append(0)
    out_gltf["buffers"][0]["byteLength"] = len(new_bin)

    # ---- ASSERTIONS
    problems = []

    """
    THE CRACK PROOF. The input welded shell is closed - every edge has exactly two faces - so the
    output's must be too. `--control-noweld` is the arm that makes this fire.
    """
    if after_closure["boundaryEdges"] != before_closure["boundaryEdges"] * 2 and \
            not (before_closure["boundaryEdges"] == 0 and after_closure["boundaryEdges"] == 0):
        problems.append(
            f"CRACKED: boundary edges {before_closure['boundaryEdges']} -> "
            f"{after_closure['boundaryEdges']} (a closed input must stay closed; each boundary "
            f"edge of an open input must become exactly two)")
    if after_closure["nonManifoldEdges"] != before_closure["nonManifoldEdges"]:
        problems.append(f"non-manifold edges {before_closure['nonManifoldEdges']} -> "
                        f"{after_closure['nonManifoldEdges']}")

    # every original vertex keeps its skin, to the byte
    if not (out_jnt[:n_in] == jnt).all():
        problems.append("an original vertex's JOINTS_0 changed")
    if float(np.abs(out_wgt[:n_in] - wgt).max()) > 0:
        problems.append("an original vertex's WEIGHTS_0 changed")
    wsum = out_wgt.sum(axis=1)
    if float(np.abs(wsum - 1.0).max()) > 1e-5:
        problems.append(f"a WEIGHTS_0 row does not sum to 1 (worst {float(np.abs(wsum-1).max()):.2e})")

    n_joints = len(gltf["skins"][0]["joints"])
    if int(out_jnt.max()) >= n_joints:
        problems.append(f"joint index {int(out_jnt.max())} is outside the skin's {n_joints} joints")

    """
    THE REFIT LANDED. Asserted rather than assumed, because the whole reason the refit exists is
    that a sub-percent shape error was invisible in every number the first build printed and
    glaring in the picture. With the refit on, the output bbox must equal the input's on every
    axis to float precision; 1e-6 m is a thousandth of a millimetre, four orders below the
    0.5% (~1.7 mm) error being corrected. `--no-refit` is the arm that makes this fire.
    """
    """
    THE INTERPOLATION GUARANTEE, ASSERTED RATHER THAN ASSUMED. Butterfly's whole reason for being
    here is that original vertices do not move, which is what preserves the skirt/thigh overlap.
    The coordinator's instruction was to VERIFY it rather than take it on faith, and that is the
    right call for a second reason: a mistake in the stencil - a mis-rotated ring, a weight set
    that does not sum to 1 - shows up here FIRST and often nowhere else, because every other
    check (closure, skin, uv, triangle count) passes on a mesh whose points are simply in the
    wrong places. The tolerance is EXACTLY zero: these are copies, not computations.
    """
    if scheme == "butterfly":
        moved = float(np.abs(out_pos[:n_in] - pos).max())
        if moved != 0.0:
            problems.append(f"butterfly moved an ORIGINAL vertex by {moved:.3e} - the scheme is "
                            f"interpolating and this must be exactly 0; the stencil or the ring "
                            f"ordering is wrong")
    if refit:
        bbox_err = float(np.abs(out_size - in_size).max())
        if bbox_err > 1e-6:
            problems.append(f"refit did not restore the bbox: worst axis error {bbox_err:.3e} m "
                            f"(in {in_size}, out {out_size})")
    if stats["trisOut"] != stats["trisIn"] * 4:
        problems.append(f"triangles {stats['trisIn']} -> {stats['trisOut']}, expected 4x")
    if after_geom["medianDeg"] >= before_geom["medianDeg"]:
        problems.append(f"dihedral median did not fall: {before_geom['medianDeg']} -> "
                        f"{after_geom['medianDeg']} - the surface did not get smoother")
    """
    THE UNWRAP-INTACT ASSERTION, and it has an exact zero rather than a tolerance chosen by feel.
    Splitting each uv triangle at its edge midpoints produces four sub-triangles of exactly a
    quarter the area, so total uv area is invariant under this operation and any drift beyond
    float accumulation means a uv was not the midpoint of its parents - i.e. a seam was crossed
    and the panel-seam network is broken. 1e-4 percent is ~6 orders above the float noise on a
    41,512-term sum and ~4 below anything a single mis-assigned seam vertex could hide in.
    """
    if uv_quarter_dev > 1e-9:
        problems.append(f"a child triangle's uv area is not a quarter of its parent's "
                        f"(worst deviation {uv_quarter_dev:.3e} of the largest parent); an edge "
                        f"vertex did not take the midpoint of its parents' uvs and the "
                        f"panel-seam network is broken")
    nlen = np.linalg.norm(out_nrm, axis=1)
    if float(np.abs(nlen - 1.0).max()) > 1e-6:
        problems.append("a written normal is not unit length")

    # the carried-over JSON must be structurally identical, and the original BIN a byte prefix
    for key in ("animations", "skins", "nodes", "scenes", "scene", "asset", "materials"):
        if json.dumps(gltf.get(key), sort_keys=True) != json.dumps(out_gltf.get(key), sort_keys=True):
            problems.append(f"JSON '{key}' changed - it must be carried over untouched")
    n_bv, n_acc = len(gltf["bufferViews"]), len(gltf["accessors"])
    if json.dumps(gltf["bufferViews"], sort_keys=True) != \
            json.dumps(out_gltf["bufferViews"][:n_bv], sort_keys=True):
        problems.append("an ORIGINAL bufferView changed; this tool must only append")
    if json.dumps(gltf["accessors"], sort_keys=True) != \
            json.dumps(out_gltf["accessors"][:n_acc], sort_keys=True):
        problems.append("an ORIGINAL accessor changed; this tool must only append")
    if bytes(new_bin[:len(bin_bytes)]) != bytes(bin_bytes):
        problems.append("the original BIN chunk is not a byte-identical prefix of the output; "
                        "an animation sampler or inverse-bind matrix may have moved")

    if problems:
        print("SUBDIV FAILED:\n  " + "\n  ".join(problems))
        raise SystemExit(2)

    out_json = json.dumps(out_gltf, separators=(",", ":")).encode("utf-8")
    while len(out_json) % 4:
        out_json += b" "
    while len(new_bin) % 4:
        new_bin.append(0)
    total = 12 + 8 + len(out_json) + 8 + len(new_bin)
    blob = bytearray()
    blob.extend(struct.pack("<III", GLB_MAGIC, 2, total))
    blob.extend(struct.pack("<II", len(out_json), CHUNK_JSON))
    blob.extend(out_json)
    blob.extend(struct.pack("<II", len(new_bin), CHUNK_BIN))
    blob.extend(new_bin)
    open(dst, "wb").write(bytes(blob))

    dead = len(bin_bytes) - sum(
        gltf["bufferViews"][i]["byteLength"] for i in range(n_bv)
        if i not in {gltf["accessors"][prim["attributes"][k]]["bufferView"]
                     for k in ("POSITION", "NORMAL", "TEXCOORD_0", "JOINTS_0", "WEIGHTS_0")}
        | {gltf["accessors"][prim["indices"]]["bufferView"]})
    print("SUBDIV_RESULT " + json.dumps({
        "out": dst, "bytes": len(blob), "orphanedBytes": int(dead), **stats}))


if __name__ == "__main__":
    main()
