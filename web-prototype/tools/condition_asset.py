"""
CONDITION AN ASSET — plan Step 5. Raw generated mesh in, game-ready GLB out, one command.

    CONDITION.bat <raw.glb>                          (double-click friendly wrapper)
    blender --background --python tools/condition_asset.py -- --in raw.glb --class char

WHAT THIS IS FOR. A generator returns a mesh that is correct in shape and wrong in every way
that matters to a game: 1.96 million triangles on the first Run Robot Run test, arbitrary scale,
origin at the centre of its bounding box, and no material names anyone downstream recognises.
Fixing that by hand is the hour-per-asset tax the pipeline plan exists to delete. Everything
here is CHECKABLE — there is no aesthetic judgement anywhere in this file, which is exactly why
it is a script and not a conversation.

Contract: docs/STYLE_CONTRACT.md. Budgets, palette and origin rules all come from there.

⚠️ IT FAILS LOUDLY. Every stage verifies its own result and a non-zero exit means DO NOT SHIP.
A conditioning script that silently half-worked would put an over-budget asset in the game and
nobody would find out until a frame-time regression three weeks later.
"""
import bpy
import bmesh
import sys
import os
import json
import math

# ---------------------------------------------------------------- args
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def opt(name, default=None):
    return argv[argv.index("--" + name) + 1] if "--" + name in argv else default


SRC = opt("in")
OUT = opt("out")
ASSET_CLASS = opt("class", "char")
TARGET_HEIGHT = float(opt("height", "1.7"))
MANIFEST = opt("manifest")
SPLIT_JOINTS = opt("split")
INSPECT_ONLY = "--inspect" in argv

# docs/STYLE_CONTRACT.md §4. char is John-signed; the rest are still proposed.
TRI_BUDGET = {"char": 60000, "enemy": 25000, "prop": 15000, "bgprop": 4000, "arch": 2000}
# docs/STYLE_CONTRACT.md §3
PALETTE_SLOTS = ["shell", "chrome", "mint", "face", "decal", "gap", "sole"]

if not SRC:
    print("ERROR: --in <file.glb> is required")
    sys.exit(2)
if ASSET_CLASS not in TRI_BUDGET:
    print("ERROR: --class must be one of %s" % ", ".join(TRI_BUDGET))
    sys.exit(2)

BUDGET = TRI_BUDGET[ASSET_CLASS]
SRC = os.path.abspath(SRC)
OUT = os.path.abspath(OUT) if OUT else os.path.splitext(SRC)[0] + "_conditioned.glb"


def log(msg):
    print("  %s" % msg, flush=True)


def die(msg):
    print("\nCONDITIONING FAILED — %s\n" % msg, flush=True)
    sys.exit(1)


# ---------------------------------------------------------------- load
bpy.ops.wm.read_factory_settings(use_empty=True)

ext = os.path.splitext(SRC)[1].lower()
if ext == ".glb" or ext == ".gltf":
    bpy.ops.import_scene.gltf(filepath=SRC)
elif ext == ".obj":
    bpy.ops.wm.obj_import(filepath=SRC)
elif ext == ".fbx":
    bpy.ops.import_scene.fbx(filepath=SRC)
else:
    die("unsupported input %s — give me .glb, .gltf, .obj or .fbx" % ext)

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
if not meshes:
    die("no mesh objects in %s" % os.path.basename(SRC))


def tri_count():
    """Triangles AFTER modifiers, which is the only count that matters downstream."""
    dg = bpy.context.evaluated_depsgraph_get()
    total = 0
    for ob in [o for o in bpy.context.scene.objects if o.type == "MESH"]:
        me = ob.evaluated_get(dg).to_mesh()
        me.calc_loop_triangles()
        total += len(me.loop_triangles)
        ob.evaluated_get(dg).to_mesh_clear()
    return total


def world_bounds():
    lo = [1e9, 1e9, 1e9]
    hi = [-1e9, -1e9, -1e9]
    for ob in [o for o in bpy.context.scene.objects if o.type == "MESH"]:
        for corner in ob.bound_box:
            w = ob.matrix_world @ __import__("mathutils").Vector(corner)
            for i in range(3):
                lo[i] = min(lo[i], w[i])
                hi[i] = max(hi[i], w[i])
    return lo, hi


tris_in = tri_count()
lo, hi = world_bounds()
size = [hi[i] - lo[i] for i in range(3)]

print("\n=== CONDITION: %s ===" % os.path.basename(SRC))
log("class           %s   (budget %s tris)" % (ASSET_CLASS, format(BUDGET, ",")))
log("mesh objects    %d" % len(meshes))
log("triangles in    %s" % format(tris_in, ","))
log("bounds (x,y,z)  %.3f x %.3f x %.3f" % (size[0], size[1], size[2]))
log("materials in    %s" % (", ".join(sorted({s.material.name for o in meshes for s in o.material_slots if s.material})) or "(none)"))

if INSPECT_ONLY:
    print("\n  --inspect: nothing written.\n")
    sys.exit(0)

# ---------------------------------------------------------------- join
# One mesh per asset. Multi-object imports defeat the draw-call collapsing the engine
# already does, and the seam rules in the contract are written per PART, not per blob.
bpy.ops.object.select_all(action="DESELECT")
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
    log("joined %d objects -> 1" % len(meshes))
ob = bpy.context.view_layer.objects.active
ob.name = os.path.splitext(os.path.basename(OUT))[0]

# ---------------------------------------------------------------- orient + scale
# ⚠️ glTF is Y-up and Blender is Z-up; the importer already rotated for us. What it CANNOT know
# is how big the thing is meant to be. A generator returns arbitrary scale — the contract says
# 1 unit = 1 metre and the player is 1.7 m, so scale by measured height, never by a guess.
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
lo, hi = world_bounds()
height = hi[2] - lo[2]
if height <= 1e-6:
    die("measured height is zero — the mesh is flat or the import failed")
factor = TARGET_HEIGHT / height
ob.scale = (factor, factor, factor)
bpy.ops.object.transform_apply(scale=True)
log("scaled x%.4f  ->  height %.3f m" % (factor, TARGET_HEIGHT))

# ---------------------------------------------------------------- origin
# Contract §1: character origin is BETWEEN THE FEET, ON THE GROUND PLANE. Centred-on-mass is
# what every generator returns and it makes the asset float or sink the moment it is placed.
lo, hi = world_bounds()
cx = (lo[0] + hi[0]) / 2.0
cy = (lo[1] + hi[1]) / 2.0
bpy.context.scene.cursor.location = (cx, cy, lo[2])
bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
ob.location = (0.0, 0.0, 0.0)
bpy.context.scene.cursor.location = (0.0, 0.0, 0.0)
log("origin set to feet-centre, object moved to world zero")

# ---------------------------------------------------------------- decimate
tris_now = tri_count()
if tris_now > BUDGET:
    # Collapse preserves silhouette far better than un-subdivide on organic-ish generated
    # topology, and silhouette is what this project judges characters on.
    mod = ob.modifiers.new(name="rrr_decimate", type="DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.use_collapse_triangulate = True
    mod.ratio = float(BUDGET) / float(tris_now)
    got = tri_count()
    # One corrective pass: collapse does not hit the ratio exactly on non-manifold input.
    if got > BUDGET and got > 0:
        mod.ratio *= float(BUDGET) / float(got) * 0.98
        got = tri_count()
    log("decimated %s -> %s  (ratio %.5f)" % (format(tris_now, ","), format(got, ","), mod.ratio))
    bpy.ops.object.modifier_apply(modifier=mod.name)
else:
    log("under budget already, no decimation")

# ---------------------------------------------------------------- face aperture
#
# ⚠️ A GENERATED HEAD IS A CLOSED SURFACE, SO IT SEALS THE RIG'S FACE INSIDE IT. The first mount
# produced a robot with no eyes — the faceplate was there, lit, and entirely behind solid shell.
# Contract §6 already says the rig owns the faceplate, so the SHELL is what has to give way.
#
# Cut BEFORE the split, on the joined mesh, so the resulting hole is part of whichever part the
# splitter later assigns those faces to. Cutting afterwards would mean finding the head object by
# name and hoping the aperture lands inside it.
#
# The hole is an ELLIPSE in the head's frontal plane, sized from the faceplate's own measured box
# (harness/rig-joints.mjs dumps it) and shrunk slightly so the shell OVERLAPS the plate's rim
# rather than meeting it exactly — an exact match leaves a hairline of background showing through.
APERTURE = "--aperture" in argv
if APERTURE and SPLIT_JOINTS:
    from mathutils import Vector as _V

    with open(SPLIT_JOINTS, "r", encoding="utf-8") as fh:
        _rig = json.load(fh)
    face = _rig.get("face")
    if not face:
        die("--aperture needs a 'face' block in %s. Re-run harness/rig-joints.mjs." % SPLIT_JOINTS)

    fc = _V(face["center"])
    fs = _V(face["size"])
    # glTF Y-up -> Blender Z-up, same swap the splitter uses.
    cB = _V((fc.x, -fc.z, fc.y))
    # Half-extents in the head's frontal plane: x stays x, glTF y (height) becomes Blender z.
    OVERLAP = 0.92
    hx = max(fs.x, 1e-4) * 0.5 * OVERLAP
    hz = max(fs.y, 1e-4) * 0.5 * OVERLAP

    me = ob.data
    me.calc_loop_triangles()
    doomed = []
    for poly in me.polygons:
        c = poly.center
        # In front of the plate only. Blender -Y is forward (glTF +Z), so a face is in front
        # when its y is more negative than the plate's centre.
        if c.y > cB.y:
            continue
        u = (c.x - cB.x) / hx
        v = (c.z - cB.z) / hz
        if u * u + v * v <= 1.0:
            doomed.append(poly.index)

    if not doomed:
        die("--aperture selected 0 faces at the faceplate box — the head is not where the rig "
            "says it is, so cutting would put a hole in the wrong place.")

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    for i in doomed:
        me.polygons[i].select = True
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.delete(type="FACE")
    bpy.ops.object.mode_set(mode="OBJECT")
    log("face aperture: cut %d faces over the faceplate (%.3f x %.3f m at %.3f)"
        % (len(doomed), hx * 2, hz * 2, cB.z))

# ---------------------------------------------------------------- palette slot
# Resolved BEFORE the split, because every part produced by the split needs it.
manifest = {}
if MANIFEST and os.path.exists(MANIFEST):
    with open(MANIFEST, "r", encoding="utf-8") as fh:
        manifest = json.load(fh)
default_slot = manifest.get("defaultMaterial", "shell")
if default_slot not in PALETTE_SLOTS:
    die("manifest defaultMaterial '%s' is not in the palette %s" % (default_slot, PALETTE_SLOTS))

# ---------------------------------------------------------------- split by joint
#
# John's ruling: split in Blender rather than pay for Meshy's Auto Split. A generated character
# arrives as ONE welded surface covering all seventeen joints, and STYLE_CONTRACT §6 needs one
# part per joint, so the cut has to be inferred.
#
# ⚠️ NEAREST JOINT IS THE OBVIOUS ALGORITHM AND IT IS THE WRONG ONE. hips/spine/chest sit on one
# axis 6-12 cm apart, so a surface point between them flips owner over tiny distances and the
# result is confetti, not parts. Assign to the nearest BONE SEGMENT instead — the limb a point
# belongs to is the limb it lies alongside, which is a distance to a line, not to a dot.
#
# Terminal joints (head, wrists, ankles) own no segment, so each gets a stub extrapolated past
# it along its own bone. Without that, a hand is nearest the forearm segment and gets welded
# into the forearm, and the foot into the shin.
# (parent, child, owner) — owner is the joint the engine will PARENT that part to.
BONES = [
    ("hips", "spine", "hips"), ("spine", "chest", "spine"), ("chest", "neck", "chest"),
    ("neck", "head", "head"),
    ("chest", "shoulderL", "chest"), ("chest", "shoulderR", "chest"),
    ("shoulderL", "elbowL", "shoulderL"), ("shoulderR", "elbowR", "shoulderR"),
    ("elbowL", "wristL", "elbowL"), ("elbowR", "wristR", "elbowR"),
    ("hips", "hipL", "hips"), ("hips", "hipR", "hips"),
    ("hipL", "kneeL", "hipL"), ("hipR", "kneeR", "hipR"),
    ("kneeL", "ankleL", "kneeL"), ("kneeR", "ankleR", "kneeR"),
]
# (tip, from, owner, length-as-fraction-of-its-own-bone)
STUBS = [
    ("wristL", "elbowL", "wristL", 0.55), ("wristR", "elbowR", "wristR", 0.55),
    ("ankleL", "kneeL", "ankleL", 0.30), ("ankleR", "kneeR", "ankleR", 0.30),
]

if SPLIT_JOINTS:
    from mathutils import Vector

    if not os.path.exists(SPLIT_JOINTS):
        die("--split points at %s which does not exist. Run harness/rig-joints.mjs first." % SPLIT_JOINTS)
    with open(SPLIT_JOINTS, "r", encoding="utf-8") as fh:
        rig = json.load(fh)
    J = {k: Vector(v) for k, v in rig.get("joints", {}).items()}
    if not J:
        die("no joints in %s" % SPLIT_JOINTS)

    missing = {n for b in BONES for n in b[:2]} - set(J)
    if missing:
        die("rig file is missing joints the bone table needs: %s" % ", ".join(sorted(missing)))

    # ⚠️ glTF is Y-up and so is the rig dump, but Blender is Z-up and the importer rotated the
    # mesh on the way in. So the rig's (x, y, z) is Blender's (x, -z, y). Getting this wrong
    # produces a confident, complete, entirely wrong split — parts named for the head appearing
    # at the feet — which is exactly the class of silent failure this project keeps paying for.
    def to_blender(v):
        return Vector((v.x, -v.z, v.y))

    segs = []
    for a, b, owner in BONES:
        segs.append((to_blender(J[a]), to_blender(J[b]), owner))
    for tip, frm, owner, f in STUBS:
        if tip in J and frm in J:
            p0 = to_blender(J[tip])
            d = p0 - to_blender(J[frm])
            segs.append((p0, p0 + d * f, owner))

    def dist_to_seg(p, a, b):
        ab = b - a
        L2 = ab.dot(ab)
        if L2 < 1e-12:
            return (p - a).length
        t = max(0.0, min(1.0, (p - a).dot(ab) / L2))
        return (p - (a + ab * t)).length

    me = ob.data
    me.calc_loop_triangles()
    # A face's owner is decided once, at its centre, so a triangle is never split across parts.
    owners = {}
    face_owner = [None] * len(me.polygons)
    for poly in me.polygons:
        c = poly.center
        best, bestd = None, 1e18
        for (a, b, owner) in segs:
            d = dist_to_seg(c, a, b)
            if d < bestd:
                bestd, best = d, owner
        face_owner[poly.index] = best
        owners[best] = owners.get(best, 0) + 1

    raw_parts = len(owners)

    """
    ⚠️ NEAREST-BONE ALONE PRODUCES RAGGED SEAMS, AND JOHN CALLED IT ON SIGHT.
    Every face is assigned independently, so a face near a boundary flips owner over millimetres
    and nothing anywhere says "a thigh is ONE piece". The first run showed it exactly: torn green
    fringes where the chest meets the shoulders, and an isolated island of thigh sitting inside
    the other thigh's colour.

    It is invisible while every part shares one material — the parts sit flush and it renders
    identically to the unsplit mesh. It becomes very visible the moment parts take DIFFERENT
    palette slots, which is the entire point of splitting (mint caps on the shoulders). So it
    has to be fixed now, not when someone is chasing a shading bug.

    Two passes, both purely topological — no new geometry, no distances:

      1. MAJORITY SMOOTHING over the face-adjacency graph. A face whose edge-neighbours mostly
         disagree with it switches. Boundaries relax into smooth curves; a single stray face
         cannot survive. Requires a STRICT majority so two parts cannot oscillate forever.

      2. ISLAND ABSORPTION. Each owner should be exactly ONE connected component. Any smaller
         component is reassigned to whichever owner dominates its border. Repeated until stable,
         because absorbing one island can merge two others.
    """
    # Face adjacency via shared edges, built once and reused by both passes.
    edge_faces = {}
    for poly in me.polygons:
        for ek in poly.edge_keys:
            edge_faces.setdefault(ek, []).append(poly.index)
    nbrs = [[] for _ in range(len(me.polygons))]
    for fl in edge_faces.values():
        if len(fl) == 2:
            nbrs[fl[0]].append(fl[1])
            nbrs[fl[1]].append(fl[0])

    # --- pass 1: majority smoothing
    #
    # ⚠️ 8 IS A CEILING, NOT AN UNFINISHED JOB. This does not converge and is not meant to:
    # majority filtering on a face-adjacency graph is curvature flow, so it keeps shortening
    # boundaries forever and EATS SMALL REGIONS while it does. Measured on this asset:
    # `spine` is 253 faces raw and 125 after 8 iterations — half of it gone — because the
    # spine bone is 6 cm long and its region is thin enough for its own boundary to close in
    # on it. Running to 40 iterations still reported "did not settle", which is the tell.
    # Enough passes to kill speckle, few enough to keep a thin part alive.
    SMOOTH_ITERS = 8
    for it in range(SMOOTH_ITERS):
        nxt = list(face_owner)
        changed = 0
        for i in range(len(face_owner)):
            nb = nbrs[i]
            if not nb:
                continue
            counts = {}
            for j in nb:
                counts[face_owner[j]] = counts.get(face_owner[j], 0) + 1
            best = max(counts, key=lambda k: counts[k])
            # STRICT majority only. A simple plurality lets a boundary shuffle back and forth
            # between two parts on alternating iterations and never settle.
            if best != face_owner[i] and counts[best] * 2 > len(nb):
                nxt[i] = best
                changed += 1
        face_owner = nxt
        if not changed:
            log("smoothing settled after %d iteration(s)" % (it + 1))
            break
    else:
        log("smoothing ran the full %d iterations" % SMOOTH_ITERS)

    # --- pass 2: island absorption
    def components():
        seen = [False] * len(face_owner)
        comps = []
        for i in range(len(face_owner)):
            if seen[i]:
                continue
            own = face_owner[i]
            stack, comp = [i], []
            seen[i] = True
            while stack:
                f = stack.pop()
                comp.append(f)
                for j in nbrs[f]:
                    if not seen[j] and face_owner[j] == own:
                        seen[j] = True
                        stack.append(j)
            comps.append((own, comp))
        return comps

    absorbed = 0
    for _ in range(12):
        comps = components()
        biggest = {}
        for own, comp in comps:
            if own not in biggest or len(comp) > len(biggest[own]):
                biggest[own] = comp
        strays = [(own, comp) for own, comp in comps if comp is not biggest.get(own)]
        if not strays:
            break
        # Smallest first: absorbing it may join two larger neighbours next round.
        strays.sort(key=lambda t: len(t[1]))
        own, comp = strays[0]
        inside = set(comp)
        border = {}
        for f in comp:
            for j in nbrs[f]:
                if j not in inside:
                    border[face_owner[j]] = border.get(face_owner[j], 0) + 1
        if not border:
            break                      # fully enclosed by nothing — a detached shell, leave it
        winner = max(border, key=lambda k: border[k])
        for f in comp:
            face_owner[f] = winner
        absorbed += 1
    if absorbed:
        log("absorbed %d stray island(s) into their dominant neighbour" % absorbed)

    owners = {}
    for o in face_owner:
        owners[o] = owners.get(o, 0) + 1

    log("split into %d parts by nearest bone segment (from %d before cleanup):" % (len(owners), raw_parts))
    for k in sorted(owners, key=lambda n: -owners[n]):
        log("    %-11s %6d faces" % (k, owners[k]))

    # Materialise the split: one vertex group per owner, then separate.
    for name in owners:
        vg = ob.vertex_groups.new(name="rrrpart_%s" % name)
        verts = set()
        for poly in me.polygons:
            if face_owner[poly.index] == name:
                verts.update(poly.vertices)
        vg.add(list(verts), 1.0, "REPLACE")

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    # Assign real materials per part so `separate(type='MATERIAL')` does the cutting for us —
    # far more reliable than driving selection state through operator calls.
    ob.data.materials.clear()
    mat_index = {}
    for i, name in enumerate(sorted(owners)):
        m = bpy.data.materials.new(name="part_%s" % name)
        ob.data.materials.append(m)
        mat_index[name] = i
    for poly in me.polygons:
        poly.material_index = mat_index[face_owner[poly.index]]

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="MATERIAL")
    bpy.ops.object.mode_set(mode="OBJECT")

    parts = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    log("separated into %d objects" % len(parts))

    # Name each part for its joint and put its ORIGIN AT THAT JOINT — contract §6.1, and the
    # reason John asked for automated re-origining. A part whose origin is its own centre of
    # mass swings when the joint rotates.
    for pobj in parts:
        mname = pobj.data.materials[0].name if pobj.data.materials else ""
        owner = mname.replace("part_", "") or "shell"
        pobj.name = "%s__%s" % (ASSET_CLASS, owner)
        if owner in J:
            jb = to_blender(J[owner])
            bpy.context.scene.cursor.location = jb
            bpy.ops.object.select_all(action="DESELECT")
            pobj.select_set(True)
            bpy.context.view_layer.objects.active = pobj
            bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
        pobj.data.materials.clear()
        pobj.data.materials.append(bpy.data.materials.new(name=default_slot))
    bpy.context.scene.cursor.location = (0.0, 0.0, 0.0)

# ---------------------------------------------------------------- materials
# The engine re-materials from the shared palette (plan Step 6). What matters here is only that
# the SLOT NAMES are ones the engine recognises — an asset carrying a generator's material name
# has not been conditioned, and §3 says so. After a split the parts already carry it.
if not SPLIT_JOINTS:
    ob.data.materials.clear()
    mat = bpy.data.materials.new(name=default_slot)
    mat.use_nodes = True
    ob.data.materials.append(mat)
log("material slots  -> %s" % default_slot)

# ---------------------------------------------------------------- tidy
# Over EVERY mesh object: after a split there is no single `ob` any more.
for m_ob in [o for o in bpy.context.scene.objects if o.type == "MESH"]:
    bpy.ops.object.select_all(action="DESELECT")
    m_ob.select_set(True)
    bpy.context.view_layer.objects.active = m_ob
    bpy.ops.object.mode_set(mode="EDIT")
    bm = bmesh.from_edit_mesh(m_ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0001)
    bmesh.update_edit_mesh(m_ob.data)
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
log("welded doubles, normals made consistent")

bpy.ops.object.select_all(action="SELECT")

# ---------------------------------------------------------------- export
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_yup=True,
    export_draco_mesh_compression_enable=False,
)

# ---------------------------------------------------------------- verify, loudly
tris_out = tri_count()
lo, hi = world_bounds()
h_out = hi[2] - lo[2]
mb = os.path.getsize(OUT) / (1024.0 * 1024.0)

print("\n=== RESULT ===")
log("triangles       %s  (budget %s)" % (format(tris_out, ","), format(BUDGET, ",")))
log("height          %.3f m  (target %.3f)" % (h_out, TARGET_HEIGHT))
log("origin z        %.4f  (want 0.0000 = on the ground)" % lo[2])
log("file            %.2f MB  ->  %s" % (mb, OUT))

fails = []
if tris_out > BUDGET:
    fails.append("triangles %s over the %s budget" % (format(tris_out, ","), format(BUDGET, ",")))
if abs(h_out - TARGET_HEIGHT) > 0.01:
    fails.append("height %.3f m is not the target %.3f m" % (h_out, TARGET_HEIGHT))
if abs(lo[2]) > 0.001:
    fails.append("lowest point sits at z=%.4f, not on the ground plane" % lo[2])
if not os.path.exists(OUT) or mb <= 0:
    fails.append("no output file was written")

if fails:
    die("\n         - ".join([""] + fails).strip())

print("\n  PASS — every check green.\n")
