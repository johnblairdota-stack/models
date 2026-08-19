"""
WHAT SHAPE IS THE HIP, ACTUALLY. Slice the skirt/thigh junction on radial planes and MEASURE the
cross-section, because eight rounds of this thread argued mechanism and nobody had looked at the
profile.

    "C:\\Program Files\\Blender Foundation\\Blender 4.5\\4.5\\python\\bin\\python.exe" ^
      harness/_hipx1_section.py public/models/anim/player_norm30.glb [--out section.json]

THE INSTRUMENT. For each leg, the leg axis is the vertical line through the UpLeg joint (taken
from the inverse bind matrix, so it is the rig's own number and not a typed box). A slice is the
half-plane containing that axis at azimuth theta; a point on the surface maps to (r, y) where r is
the distance along theta from the axis. Every triangle crossing the plane contributes one segment,
so the drawn set of segments IS the outline - no chaining, so nothing can be mis-chained.

THE MEASUREMENT THAT SEPARATES THE TWO CANDIDATE SHAPES, and it needs no judgement. Fire a ray
from the leg axis outward along theta at height y and count surface crossings:

    1 crossing   the skirt is FUSED to the thigh at this height - one continuous surface
    3 crossings  a FLANGE: leave the thigh (1), enter the hem's inner face (2), leave its outer
                 face (3). The air gap is r2 - r1 and the flange's own thickness is r3 - r2.
    5+           more structure than a single flange

A closed manifold shell always gives an ODD count on a ray starting inside it, so an even count is
a bug in the instrument, not a shape - it is reported and counted separately rather than silently
rounded.

WHERE THE SURFACE TURNS DOWNWARD. The band was measured to ride outward WITH the rim under
--skirt-thicken, i.e. it is the shadowed UNDERSIDE of the hem rather than a gap the hem fails to
bridge. So each segment carries its triangle's face normal projected into the (r, y) plane, and
segments whose normal points below the horizon (n_y < -0.20) are the candidate shadow surface.
`downSpanMm` is the vertical extent of that set and `overhangMm` the horizontal.

⚠️ THE RADIAL CAP, AND WITHOUT IT THE FIRST RUN OF THIS TOOL MEASURED THE ARM. The figure's arms
hang beside the hips, so a ray fired straight out sideways from the leg axis at y 0.55..0.95 leaves
the thigh, crosses air, and then crosses the FOREARM - which reads as a 121 mm "flange gap" over
321 consecutive heights. The cap is derived, not typed: the thigh's own outer radius is measured at
y = 0.60 (clearly below any hem) on that azimuth, and everything beyond `thighR + --pad` mm is
discarded. That means the tool can only ever see structure sitting within `pad` of the thigh, which
is exactly the question, and the discarded count is REPORTED so a cap that ate the answer is
visible rather than silent.
"""
import sys
import os
import json
import math
from collections import defaultdict

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
from subdivide_player import parse_glb, read_accessor, weld  # noqa: E402


def slice_plane(pos, tris, fn, P0, d, n):
    """Every triangle crossing the plane {x : dot(x-P0, n) = 0} -> one (r0,y0,r1,y1,nr,ny)."""
    s = (pos - P0) @ n
    out = []
    for ti in range(len(tris)):
        a, b, c = int(tris[ti, 0]), int(tris[ti, 1]), int(tris[ti, 2])
        sa, sb, sc = s[a], s[b], s[c]
        if (sa > 0 and sb > 0 and sc > 0) or (sa < 0 and sb < 0 and sc < 0):
            continue
        pts = []
        for u, v in ((a, b), (b, c), (c, a)):
            su, sv = s[u], s[v]
            if (su > 0) == (sv > 0) and su != 0 and sv != 0:
                continue
            if su == sv:
                continue
            t = su / (su - sv)
            pts.append(pos[u] + t * (pos[v] - pos[u]))
        if len(pts) < 2:
            continue
        p, q = pts[0], pts[1]
        f = fn[ti]
        out.append((float((p - P0) @ d), float(p[1]),
                    float((q - P0) @ d), float(q[1]),
                    float(f @ d), float(f[1])))
    return out


def crossings(segs, y, side=+1, rmax=None):
    """r values where the outline crosses height y, on the requested side of the axis."""
    rs, cut = [], 0
    for (r0, y0, r1, y1, _nr, _ny) in segs:
        if (y0 - y) * (y1 - y) > 0 or y0 == y1:
            continue
        t = (y - y0) / (y1 - y0)
        r = r0 + t * (r1 - r0)
        if side * r > 0:
            if rmax is not None and abs(r) > rmax:
                cut += 1
                continue
            rs.append(abs(r))
    return sorted(rs), cut


def main():
    src = sys.argv[1]
    out_path = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else None
    svg_path = sys.argv[sys.argv.index("--svg") + 1] if "--svg" in sys.argv else None
    pad = float(sys.argv[sys.argv.index("--pad") + 1]) / 1000.0 if "--pad" in sys.argv else 0.035
    raw = open(src, "rb").read()
    gltf, _jb, bb = parse_glb(raw)
    prim = [p for m in gltf["meshes"] for p in m["primitives"]
            if "POSITION" in p["attributes"]][0]
    pos = read_accessor(gltf, bb, prim["attributes"]["POSITION"]).astype(np.float64)
    idx = read_accessor(gltf, bb, prim["indices"]).reshape(-1).astype(np.int64)
    tris = idx.reshape(-1, 3)

    # weld so the outline is a real closed curve and not a pile of duplicate-vertex fragments
    inv = weld(pos)
    n_pos = int(inv.max()) + 1
    pw = np.zeros((n_pos, 3))
    for vi, gi in enumerate(inv):
        pw[int(gi)] = pos[vi]
    tw = inv[tris]
    keep = ~((tw[:, 0] == tw[:, 1]) | (tw[:, 1] == tw[:, 2]) | (tw[:, 2] == tw[:, 0]))
    tw = tw[keep]
    fn = np.cross(pw[tw[:, 1]] - pw[tw[:, 0]], pw[tw[:, 2]] - pw[tw[:, 0]])
    fn = fn / np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-12)

    joints = gltf["skins"][0]["joints"]
    jnames = [gltf["nodes"][nj].get("name", "?") for nj in joints]
    name2k = {n: k for k, n in enumerate(jnames)}
    ibm = read_accessor(gltf, bb, gltf["skins"][0]["inverseBindMatrices"]).astype(np.float64)
    jp = np.array([np.linalg.inv(ibm[k].reshape(4, 4).T)[:3, 3] for k in range(len(joints))])

    if "--cmp" in sys.argv:
        others = sys.argv[sys.argv.index("--cmp") + 1].split(",")
        zval = float(sys.argv[sys.argv.index("--zslice") + 1])
        win = [float(v) for v in sys.argv[sys.argv.index("--win") + 1].split(",")]
        outp = sys.argv[sys.argv.index("--cmpsvg") + 1]
        cols = ["#4aa8e2", "#ff9f2e", "#7ddc6a", "#e2444a"]
        sets = [(os.path.basename(src), cols[0], world_slice(pw, tw, fn, 2, zval))]
        for i, oth in enumerate(others):
            _g, _b, opw, otw, ofn = load_welded(oth)
            sets.append((os.path.basename(oth), cols[(i + 1) % len(cols)],
                         world_slice(opw, otw, ofn, 2, zval)))
        write_cmp_svg(sets, outp, win[0], win[1], win[2], win[3], pxmm=float(
            sys.argv[sys.argv.index("--pxmm") + 1]) if "--pxmm" in sys.argv else 20.0,
            title=f"BIND-POSE section at z={zval:.4f}   x across / y up, 5 mm grid.")
        print(f"wrote {outp}")
        return

    if "--world" in sys.argv:
        wsvg = sys.argv[sys.argv.index("--world") + 1]
        lz = float(jp[name2k["LeftUpLeg"]][2])
        panels = []
        # z-planes: front of the leg, through its axis, behind it. Plots (x, y) for the LEFT hip.
        for dz in (-0.030, 0.0, +0.030):
            segs = world_slice(pw, tw, fn, 2, lz + dz)
            panels.append((f"z = axis{dz*1000:+.0f}mm   (x across, LEFT hip)", segs))
        write_world_svg(panels, wsvg, 0.020, 0.150, 0.700, 0.900, pxmm=8.0,
                        title=f"{os.path.basename(src)}  LEFT hip, world z-slices")
        print(f"wrote {wsvg}")
        wsvg2 = wsvg.replace(".svg", "_x.svg")
        lx = float(jp[name2k["LeftUpLeg"]][0])
        panels2 = []
        # x-planes: through the leg axis and 20 mm either side. Plots (z, y) - the front/back profile.
        for dx in (-0.020, 0.0, +0.020):
            segs = world_slice(pw, tw, fn, 0, lx + dx)
            panels2.append((f"x = axis{dx*1000:+.0f}mm   (z across, LEFT hip)", segs))
        write_world_svg(panels2, wsvg2, -0.075, 0.140, 0.700, 0.900, pxmm=8.0,
                        title=f"{os.path.basename(src)}  LEFT hip, world x-slices")
        print(f"wrote {wsvg2}")
        return

    report = {"src": src, "legs": {}}
    for legname, side_sign in (("LeftUpLeg", +1), ("RightUpLeg", -1)):
        ax = jp[name2k[legname]]
        P0 = np.array([ax[0], 0.0, ax[2]])
        leg = {"axis": [round(float(x), 5) for x in ax], "slices": {}}
        # azimuths: 0 = straight out to the side (away from the body centreline)
        for deg in (0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330):
            th = math.radians(deg)
            d = np.array([side_sign * math.cos(th), 0.0, math.sin(th)])
            n = np.array([-side_sign * math.sin(th), 0.0, math.cos(th)])
            segs = slice_plane(pw, tw, fn, P0, d, n)
            # THE CAP, derived from the thigh at y = 0.60 on this very azimuth (see header)
            base, _ = crossings(segs, 0.60, side=+1)
            thigh_r = base[0] if base else 0.06
            rmax = thigh_r + pad
            # only the half we asked for, and only within the cap
            half = [s for s in segs if max(s[0], s[2]) > 0
                    and min(abs(s[0]), abs(s[2])) <= rmax]
            prof, cutting = [], 0
            for i in range(0, 401):
                y = 0.55 + i * 0.001
                rs, cut = crossings(segs, y, side=+1, rmax=rmax)
                cutting += cut
                prof.append({"y": round(y, 4), "n": len(rs),
                             "r": [round(v, 5) for v in rs]})
            band = [p for p in prof if p["n"] >= 3]
            even = [p for p in prof if p["n"] % 2 == 0]
            gaps = [(p["y"], p["r"][1] - p["r"][0], p["r"][2] - p["r"][1])
                    for p in band if len(p["r"]) >= 3]
            downsegs = [s for s in half if s[5] < -0.20 and 0.55 < min(s[1], s[3])
                        and max(s[1], s[3]) < 0.95]
            leg["slices"][deg] = {
                "thighRmm": round(thigh_r * 1000, 2),
                "rmaxMm": round(rmax * 1000, 2),
                "discardedCrossings": cutting,
                "flangeHeights": len(band),
                "flangeYRange": [band[0]["y"], band[-1]["y"]] if band else None,
                "maxGapMm": round(max((g[1] for g in gaps), default=0.0) * 1000, 3),
                "gapAtMaxY": round(max(gaps, key=lambda g: g[1])[0], 4) if gaps else None,
                "maxFlangeThickMm": round(max((g[2] for g in gaps), default=0.0) * 1000, 3),
                "evenCountHeights": len(even),
                "downSegs": len(downsegs),
                "downSpanMm": round((max((max(s[1], s[3]) for s in downsegs), default=0)
                                     - min((min(s[1], s[3]) for s in downsegs), default=0)) * 1000, 2)
                if downsegs else 0.0,
                "profile": prof,
                "segments": [[round(v, 5) for v in s] for s in half],
            }
        report["legs"][legname] = leg

    slim = {k: {dk: {kk: vv for kk, vv in dv.items() if kk not in ("profile", "segments")}
                for dk, dv in v["slices"].items()} for k, v in report["legs"].items()}
    print("HIPX_SUMMARY " + json.dumps(slim, indent=1))
    if out_path:
        open(out_path, "w").write(json.dumps(report))
        print(f"wrote {out_path}")
    if svg_path:
        write_svg(report, svg_path)
        print(f"wrote {svg_path}")


def load_welded(src):
    """Positions welded by POSITION, plus the welded triangles and their face normals."""
    raw = open(src, "rb").read()
    gltf, _jb, bb = parse_glb(raw)
    prim = [p for m in gltf["meshes"] for p in m["primitives"] if "POSITION" in p["attributes"]][0]
    pos = read_accessor(gltf, bb, prim["attributes"]["POSITION"]).astype(np.float64)
    idx = read_accessor(gltf, bb, prim["indices"]).reshape(-1).astype(np.int64)
    tris = idx.reshape(-1, 3)
    inv = weld(pos)
    pw = np.zeros((int(inv.max()) + 1, 3))
    for vi, gi in enumerate(inv):
        pw[int(gi)] = pos[vi]
    tw = inv[tris]
    keep = ~((tw[:, 0] == tw[:, 1]) | (tw[:, 1] == tw[:, 2]) | (tw[:, 2] == tw[:, 0]))
    tw = tw[keep]
    fn = np.cross(pw[tw[:, 1]] - pw[tw[:, 0]], pw[tw[:, 2]] - pw[tw[:, 0]])
    fn = fn / np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-12)
    return gltf, bb, pw, tw, fn


def write_cmp_svg(sets, path, u0, u1, y0, y1, pxmm=20.0, title=""):
    """
    TWO PROFILES OF THE SAME PLANE, OVERLAID, WHICH IS THE ONLY WAY TO SEE WHAT SUBDIVISION DID TO
    THE SHAPE. Each `sets` entry is (label, colour, segments). Drawn in bind pose, so nothing here
    depends on which animation frame the render happened to be on.
    """
    PW = int((u1 - u0) * 1000 * pxmm)
    PH = int((y1 - y0) * 1000 * pxmm)
    PAD, TOP = 60, 30
    W, H = PW + 2 * PAD, PH + PAD + TOP + 24
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
         f'<rect width="{W}" height="{H}" fill="#12151a"/>',
         f'<text x="{PAD}" y="20" fill="#cfd6e0" font-family="monospace" font-size="15">{title}'
         + ''.join(f' <tspan fill="{c}">■ {lbl}</tspan>' for lbl, c, _ in sets) + '</text>']
    ox, oy = PAD, TOP + 4

    def X(u):
        return ox + (u - u0) * 1000 * pxmm

    def Y(y):
        return oy + PH - (y - y0) * 1000 * pxmm
    o.append(f'<rect x="{ox}" y="{oy}" width="{PW}" height="{PH}" fill="#1b2027" stroke="#39414d"/>')
    for mm in range(0, int((u1 - u0) * 1000) + 1, 5):
        gx = ox + mm * pxmm
        major = (mm % 25 == 0)
        o.append(f'<line x1="{gx}" y1="{oy}" x2="{gx}" y2="{oy+PH}" '
                 f'stroke="{"#3a4450" if major else "#242b34"}"/>')
        if major:
            o.append(f'<text x="{gx+2}" y="{oy+PH+15}" fill="#7c8894" font-family="monospace" '
                     f'font-size="11">{u0*1000+mm:.0f}</text>')
    for mm in range(0, int((y1 - y0) * 1000) + 1, 5):
        gy = oy + PH - mm * pxmm
        major = (mm % 25 == 0)
        o.append(f'<line x1="{ox}" y1="{gy}" x2="{ox+PW}" y2="{gy}" '
                 f'stroke="{"#3a4450" if major else "#242b34"}"/>')
        if major:
            o.append(f'<text x="{ox-52}" y="{gy+4}" fill="#7c8894" font-family="monospace" '
                     f'font-size="11">y{y0*1000+mm:.0f}</text>')
    for lbl, col, segs in sets:
        for (a, ya, b, yb, _nu, _ny) in segs:
            if max(ya, yb) < y0 or min(ya, yb) > y1 or max(a, b) < u0 or min(a, b) > u1:
                continue
            o.append(f'<line x1="{X(a):.1f}" y1="{Y(ya):.1f}" x2="{X(b):.1f}" y2="{Y(yb):.1f}" '
                     f'stroke="{col}" stroke-width="1.8" stroke-opacity="0.95"/>')
            for (u, v) in ((a, ya), (b, yb)):
                if u0 <= u <= u1 and y0 <= v <= y1:
                    o.append(f'<circle cx="{X(u):.1f}" cy="{Y(v):.1f}" r="1.7" fill="{col}"/>')
    o.append('</svg>')
    open(path, "w", encoding="utf-8").write("\n".join(o))


def world_slice(pos, tris, fn, axis, value):
    """
    A slice on an AXIS-ALIGNED WORLD PLANE, which is the picture that can be read without a mental
    coordinate transform. `axis` 0 slices at x = value and plots (z, y); axis 2 slices at z = value
    and plots (x, y). Returns (u0, y0, u1, y1, n_u, n_y) per crossing triangle.
    """
    other = 2 if axis == 0 else 0
    s = pos[:, axis] - value
    out = []
    for ti in range(len(tris)):
        a, b, c = int(tris[ti, 0]), int(tris[ti, 1]), int(tris[ti, 2])
        sa, sb, sc = s[a], s[b], s[c]
        if (sa > 0 and sb > 0 and sc > 0) or (sa < 0 and sb < 0 and sc < 0):
            continue
        pts = []
        for u, v in ((a, b), (b, c), (c, a)):
            su, sv = s[u], s[v]
            if su == sv or ((su > 0) == (sv > 0) and su != 0 and sv != 0):
                continue
            t = su / (su - sv)
            pts.append(pos[u] + t * (pos[v] - pos[u]))
        if len(pts) < 2:
            continue
        p, q = pts[0], pts[1]
        f = fn[ti]
        out.append((float(p[other]), float(p[1]), float(q[other]), float(q[1]),
                    float(f[other]), float(f[1])))
    return out


def write_world_svg(slices, path, u0, u1, y0, y1, pxmm=8.0, title=""):
    """
    THE PICTURE THAT DECIDES WHAT THE SHAPE IS. One panel per world plane, at `pxmm` pixels per
    millimetre with a labelled 10 mm grid, so a 5 mm feature is 40 px and no feature can hide in a
    line width. Colour is the face normal's vertical component, which is the whole question:

        grey   n_y > +0.2    faces UP   - the top of a shelf
        BLUE   -0.2..+0.2    faces OUT  - a flank, or the rim's own face
        RED    n_y < -0.2    faces DOWN - the shadowed underside. This is the candidate band.
    """
    PW = int((u1 - u0) * 1000 * pxmm)
    PH = int((y1 - y0) * 1000 * pxmm)
    PAD, TOP = 58, 34
    cols = min(3, len(slices))
    rows = (len(slices) + cols - 1) // cols
    W, H = cols * (PW + PAD) + PAD, rows * (PH + PAD) + PAD + TOP
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
         f'<rect width="{W}" height="{H}" fill="#12151a"/>',
         f'<text x="{PAD}" y="22" fill="#cfd6e0" font-family="monospace" font-size="16">{title}'
         f'   |  {pxmm} px/mm, 10 mm grid.  '
         f'<tspan fill="#9aa4b2">grey=faces UP</tspan> '
         f'<tspan fill="#4aa8e2">blue=faces OUT</tspan> '
         f'<tspan fill="#e2444a">RED=faces DOWN</tspan></text>']
    for i, (label, segs) in enumerate(slices):
        ox = PAD + (i % cols) * (PW + PAD)
        oy = TOP + PAD + (i // cols) * (PH + PAD)
        o.append(f'<rect x="{ox}" y="{oy}" width="{PW}" height="{PH}" fill="#1b2027" stroke="#39414d"/>')

        def X(u):
            return ox + (u - u0) * 1000 * pxmm

        def Y(y):
            return oy + PH - (y - y0) * 1000 * pxmm
        for mm in range(0, int((u1 - u0) * 1000) + 1, 10):
            gx = ox + mm * pxmm
            major = (mm % 50 == 0)
            o.append(f'<line x1="{gx}" y1="{oy}" x2="{gx}" y2="{oy+PH}" '
                     f'stroke="{"#3a4450" if major else "#242b34"}"/>')
            if major:
                o.append(f'<text x="{gx+2}" y="{oy+PH+14}" fill="#7c8894" '
                         f'font-family="monospace" font-size="11">{int(u0*1000)+mm}</text>')
        for mm in range(0, int((y1 - y0) * 1000) + 1, 10):
            gy = oy + PH - mm * pxmm
            major = (mm % 50 == 0)
            o.append(f'<line x1="{ox}" y1="{gy}" x2="{ox+PW}" y2="{gy}" '
                     f'stroke="{"#3a4450" if major else "#242b34"}"/>')
            if major:
                o.append(f'<text x="{ox-52}" y="{gy+4}" fill="#7c8894" font-family="monospace" '
                         f'font-size="11">y{y0*1000+mm:.0f}</text>')
        for (a, ya, b, yb, nu, ny) in segs:
            if max(ya, yb) < y0 - 0.005 or min(ya, yb) > y1 + 0.005:
                continue
            if max(a, b) < u0 - 0.005 or min(a, b) > u1 + 0.005:
                continue
            col = "#e2444a" if ny < -0.2 else ("#4aa8e2" if ny < 0.2 else "#9aa4b2")
            o.append(f'<line x1="{X(a):.1f}" y1="{Y(ya):.1f}" x2="{X(b):.1f}" y2="{Y(yb):.1f}" '
                     f'stroke="{col}" stroke-width="{3 if ny < -0.2 else 2}"/>')
        o.append(f'<text x="{ox+6}" y="{oy+18}" fill="#f0c674" font-family="monospace" '
                 f'font-size="14">{label}</text>')
    o.append('</svg>')
    open(path, "w", encoding="utf-8").write("\n".join(o))


def write_svg(report, path, legname="LeftUpLeg", degs=(0, 30, 60, 90, 120, 150),
              y0=0.60, y1=0.92, rmm=135.0):
    """
    DRAW THE CROSS-SECTION. One panel per azimuth, r across and y up, at 4 px per mm so a 2 mm
    feature is 8 px and cannot be mistaken for a line width. Segments are coloured by which way
    their face normal points in the (r, y) plane:

        grey    outward-ish   (n_y > +0.2)    the top of the hem, the shoulder of the skirt
        BLUE    horizon       (-0.2..+0.2)    the flank of the thigh or the rim's own face
        RED     DOWNWARD      (n_y < -0.2)    the candidate shadow surface - the hem's underside
    """
    PW, PH, PAD = int(rmm * 4), int((y1 - y0) * 1000 * 4), 44
    cols = 3
    rows = (len(degs) + cols - 1) // cols
    W, H = cols * (PW + PAD) + PAD, rows * (PH + PAD) + PAD + 26
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
           f'viewBox="0 0 {W} {H}"><rect width="{W}" height="{H}" fill="#12151a"/>',
           f'<text x="{PAD}" y="20" fill="#cfd6e0" font-family="monospace" font-size="15">'
           f'{legname} cross-sections — r (mm from leg axis) across, y up, 4 px/mm. '
           f'RED = surface facing DOWN</text>']
    leg = report["legs"][legname]
    for i, deg in enumerate(degs):
        sl = leg["slices"][deg] if deg in leg["slices"] else leg["slices"][str(deg)]
        ox = PAD + (i % cols) * (PW + PAD)
        oy = 26 + PAD + (i // cols) * (PH + PAD)
        out.append(f'<rect x="{ox}" y="{oy}" width="{PW}" height="{PH}" fill="#1b2027" '
                   f'stroke="#39414d"/>')
        # 10 mm grid
        for g in range(0, int(rmm) + 1, 10):
            gx = ox + g * 4
            out.append(f'<line x1="{gx}" y1="{oy}" x2="{gx}" y2="{oy+PH}" stroke="#262d36"/>')
        for g in range(0, int((y1 - y0) * 1000) + 1, 10):
            gy = oy + PH - g * 4
            out.append(f'<line x1="{ox}" y1="{gy}" x2="{ox+PW}" y2="{gy}" stroke="#262d36"/>')

        def X(r):
            return ox + r * 1000 * 4

        def Y(y):
            return oy + PH - (y - y0) * 1000 * 4
        for (r0, ya, r1, yb, _nr, ny) in sl["segments"]:
            if max(ya, yb) < y0 or min(ya, yb) > y1:
                continue
            col = "#e2444a" if ny < -0.2 else ("#4aa8e2" if ny < 0.2 else "#9aa4b2")
            wid = 3 if ny < -0.2 else 2
            out.append(f'<line x1="{X(abs(r0)):.1f}" y1="{Y(ya):.1f}" x2="{X(abs(r1)):.1f}" '
                       f'y2="{Y(yb):.1f}" stroke="{col}" stroke-width="{wid}"/>')
        out.append(f'<text x="{ox+6}" y="{oy+16}" fill="#f0c674" font-family="monospace" '
                   f'font-size="13">az {deg}°  gap {sl["maxGapMm"]}mm  '
                   f'flange {sl["maxFlangeThickMm"]}mm  down {sl["downSegs"]}seg</text>')
    out.append('</svg>')
    open(path, "w", encoding="utf-8").write("\n".join(out))


if __name__ == "__main__":
    main()
