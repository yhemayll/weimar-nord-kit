# /// script
# requires-python = ">=3.11"
# dependencies = ["shapely", "networkx", "numpy"]
# ///
"""Experiment 1: street network variants V0-V6 for Weimar Nord.

    uv run scripts/kit/variants.py

Builds the seven network states of "Experiment 1 – Weimar Nord Street Network:
Goals & Variations" on top of the kit street graph and measures each one for
pedestrians and cars. Reads public/data/streets.graph.json, kit.json and
layers/buildings.geojson (run build.py and city_layers.py first). Writes
public/data/variants/V0.geojson ... V6.geojson and variants/meta.json.

The variants are cumulative: each adds to the one before, as in the brief's
iteration list. All new geometry is drawn below in local metres around the kit
centre (x east, y north), the same projection as src/geometry.js.

Measures, per variant and mode:
- edge betweenness: share of shortest paths between all pairs of junctions
  that use each segment, weighted by length, all pairs weighted the same
  (the brief's "uniform weights"), over the whole kit network;
- segments, intersections (junctions with 3 or more segments);
- mean block size: blocks are the areas enclosed by all streets and paths;
- mean and maximum betweenness; values on the axis, the square and Rießnerstraße;
- share of car flow on the edge streets (betweenness × length).
"""

import json
import math
from collections import Counter
from pathlib import Path

import networkx as nx
import shapely
from shapely.geometry import LineString, MultiLineString, Point, Polygon, mapping
from shapely.ops import polygonize, substring, unary_union

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
DATA = ROOT / "public" / "data"
OUT = DATA / "variants"

PED_ONLY_CLASSES = {"footway", "path", "steps", "cycleway", "pedestrian", "track"}
PUBLIC_CLASSES = {"primary", "secondary", "tertiary", "residential", "unclassified", "living_street", "pedestrian"}
EDGE_STREETS = {"Ettersburger Straße", "Buttelstedter Straße", "Nordstraße"}
SNAP = 25  # metres: a new line's end moves onto an existing street this close

# Half-widths used to clear buildings for new routes (metres).
CLEAR = {"street": 9, "path": 1.5, "bridge": 0}  # paths only clear what stands right on their line

# ---------------------------------------------------------------------------
# The variants. Coordinates in local metres. kind: street (cars and people),
# path (people only), bridge (people only, over the railway).
# ---------------------------------------------------------------------------
V1_STREETS = [
    {"name": "New street A (y −130)", "kind": "street", "line": [(-262, -130), (245, -130)]},
    {"name": "New street B (y 0)", "kind": "street", "line": [(-266, 0), (245, 0)]},
    {"name": "New street C (x −145)", "kind": "street", "line": [(-145, -258), (-145, 95)]},
    {"name": "New street D (x 110)", "kind": "street", "line": [(110, -268), (110, 80)]},
]
AXIS = [
    {"name": "Station axis: park path", "kind": "path", "line": [(-165, 430), (-165, 300), (-145, 95)], "tags": ["axis"]},
    {"name": "Station axis: diagonal", "kind": "path", "line": [(-145, 0), (110, -130)], "tags": ["axis"]},
    {"name": "Station axis: south street", "kind": "street", "line": [(110, -268), (108, -420)], "tags": ["axis"]},
    {"name": "Station axis: rail bridge", "kind": "bridge", "line": [(108, -420), (108, -482)], "tags": ["axis"]},
]
# segments of earlier new streets that become part of the axis
AXIS_REUSE = [("New street C (x −145)", 0, 95), ("New street D (x 110)", -268, -130)]

SQUARE = Polygon([(68, -222), (140, -225), (140, -296), (68, -293)])
SQUARE_PATHS = [
    {"name": "Square: diagonal", "kind": "path", "line": [(68, -222), (140, -296)], "tags": ["square"]},
    {"name": "Square: diagonal", "kind": "path", "line": [(140, -225), (68, -293)], "tags": ["square"]},
    {"name": "Square: edge", "kind": "path", "line": [(68, -222), (68, -293)], "tags": ["square"]},
    {"name": "Square: edge", "kind": "path", "line": [(140, -225), (140, -296)], "tags": ["square"]},
]

# modal filters: (point, label). Cars cannot pass the segment nearest the point; people can.
FILTERS = [
    ((-11, -65), "Industriestraße between streets A and B"),
    ((-24, 250), "Industriestraße at the Stadtwerke"),
    ((-145, -65), "New street C"),
    ((110, -65), "New street D"),
    ((-289, 370), "Rödchenweg between Nordstraße and the housing"),
    ((240, 150), "Access road along the allotments"),
]

GREEN_LINK = [
    {"name": "Green link: west", "kind": "path", "line": [(-292, 150), (-27, 150)], "tags": ["green"]},
    {"name": "Green link: Stadtwerke edge", "kind": "path", "line": [(-22, 85), (240, 85)], "tags": ["green"]},
    {"name": "Green link: allotments", "kind": "path", "line": [(240, 85), (528, 85)], "tags": ["green"]},
]

V6_EXTRA = [
    {"name": "Rail promenade", "kind": "path", "line": [(-140, -412), (108, -420)], "tags": ["promenade"]},
    {"name": "Square to Am Alten Speicher", "kind": "path", "line": [(140, -262), (240, -268)], "tags": ["square"]},
]
V6_DROP_FILTERS = ["Access road along the allotments"]

VARIANTS = [
    {"id": "V0", "add": [], "filters": [], "square": False},
    {"id": "V1", "add": V1_STREETS, "filters": [], "square": False},
    {"id": "V2", "add": V1_STREETS + AXIS, "filters": [], "square": False, "axis": True},
    {"id": "V3", "add": V1_STREETS + AXIS + SQUARE_PATHS, "filters": [], "square": True, "axis": True},
    {"id": "V4", "add": V1_STREETS + AXIS + SQUARE_PATHS, "filters": FILTERS, "square": True, "axis": True},
    {"id": "V5", "add": V1_STREETS + AXIS + SQUARE_PATHS + GREEN_LINK, "filters": FILTERS, "square": True, "axis": True},
    {
        "id": "V6",
        "add": V1_STREETS + AXIS + SQUARE_PATHS + GREEN_LINK + V6_EXTRA,
        "filters": [f for f in FILTERS if f[1] not in V6_DROP_FILTERS],
        "square": True,
        "axis": True,
    },
]


# ---------------------------------------------------------------------------
# Projection (same formula as src/geometry.js)
# ---------------------------------------------------------------------------
def projection(lon0, lat0):
    phi = math.radians(lat0)
    m_lat = 111132.954 - 559.822 * math.cos(2 * phi) + 1.175 * math.cos(4 * phi)
    m_lon = 111412.84 * math.cos(phi) - 93.5 * math.cos(3 * phi)
    fwd = lambda lon, lat: ((lon - lon0) * m_lon, (lat - lat0) * m_lat)
    inv = lambda x, y: (round(lon0 + x / m_lon, 7), round(lat0 + y / m_lat, 7))
    return fwd, inv


# ---------------------------------------------------------------------------
# Network editing
# ---------------------------------------------------------------------------
def split_at(line, points):
    """Splits a LineString at the given points (which lie on or very near it)."""
    ds = sorted({round(line.project(p), 3) for p in points if 0.5 < line.project(p) < line.length - 0.5})
    if not ds:
        return [line]
    cuts = [0.0, *ds, line.length]
    return [substring(line, a, b) for a, b in zip(cuts, cuts[1:]) if b - a > 0.01]


def crossing_points(a, b):
    x = a.intersection(b)
    if x.is_empty:
        return []
    if x.geom_type == "Point":
        return [x]
    if hasattr(x, "geoms"):
        return [g if g.geom_type == "Point" else Point(g.coords[0]) for g in x.geoms]
    return [Point(x.coords[0])]


def add_line(edges, spec, next_id):
    """Adds a new route to the edge list, splitting it and the streets it meets at every crossing."""
    pts = [Point(p) for p in spec["line"]]
    # snap both ends onto the nearest street
    for i in (0, -1):
        best = min((e for e in edges if not e.get("removed")), key=lambda e: e["geom"].distance(pts[i]))
        if best["geom"].distance(pts[i]) <= SNAP:
            pts[i] = best["geom"].interpolate(best["geom"].project(pts[i]))
    line = LineString([p.coords[0] for p in pts])
    cut_new = []
    if spec["kind"] != "bridge":  # a bridge only meets the network at its ends
        for e in list(edges):
            if e.get("removed") or e["kind"] == "bridge":
                continue
            xs = crossing_points(line, e["geom"])
            if not xs:
                continue
            pieces = split_at(e["geom"], xs)
            if len(pieces) > 1:
                edges.remove(e)
                for g in pieces:
                    edges.append({**e, "geom": g, "id": next_id()})
            cut_new.extend(xs)
    for i in (0, -1):
        cut_new.append(pts[i])
        # the street an end landed on is split there, so the new route connects
        for e in list(edges):
            if not e.get("removed") and e["geom"].distance(pts[i]) < 0.01:
                pieces = split_at(e["geom"], [pts[i]])
                if len(pieces) > 1:
                    edges.remove(e)
                    for g in pieces:
                        edges.append({**e, "geom": g, "id": next_id()})
    for g in split_at(line, cut_new):
        edges.append(
            {
                "id": next_id(),
                "geom": g,
                "name": spec["name"],
                "class": spec["kind"],
                "kind": spec["kind"],
                "added": True,
                "walk": True,
                "car": spec["kind"] == "street",
                "tags": list(spec.get("tags", [])),
            }
        )


def tag_axis_reuse(edges):
    for name, y0, y1 in AXIS_REUSE:
        for e in edges:
            if e["name"] == name:
                ys = [c[1] for c in e["geom"].coords]
                if min(ys) >= min(y0, y1) - 1 and max(ys) <= max(y0, y1) + 1 and "axis" not in e["tags"]:
                    e["tags"].append("axis")


def apply_filters(edges, filters):
    placed = []
    for (x, y), label in filters:
        p = Point(x, y)
        e = min((e for e in edges if e["car"] and not e.get("removed")), key=lambda e: e["geom"].distance(p))
        e["car"] = False
        e["filtered"] = True
        q = e["geom"].interpolate(e["geom"].project(p))
        placed.append({"label": label, "x": q.x, "y": q.y, "street": e["name"]})
    return placed


# ---------------------------------------------------------------------------
# Measures
# ---------------------------------------------------------------------------
def node_key(c):
    return (round(c[0], 1), round(c[1], 1))


def betweenness(edges, mode):
    G = nx.Graph()
    owner = {}
    for e in edges:
        if e.get("removed") or not e[mode]:
            continue
        a, b = node_key(e["geom"].coords[0]), node_key(e["geom"].coords[-1])
        if a == b:
            continue
        w = e["geom"].length
        if G.has_edge(a, b) and G.edges[a, b]["weight"] <= w:
            owner.setdefault((a, b), []).append(e["id"])
            continue
        G.add_edge(a, b, weight=w)
        owner.setdefault((a, b), []).append(e["id"])
    bc = nx.edge_betweenness_centrality(G, weight="weight", normalized=True)
    out = {}
    for (u, v), val in bc.items():
        for i in owner.get((u, v), []) + owner.get((v, u), []):
            out[i] = val
    return out, G


def measures(edges, kit_local, ped, car, G_ped, G_car):
    live = [e for e in edges if not e.get("removed")]
    G_all = nx.Graph()
    for e in live:
        G_all.add_edge(node_key(e["geom"].coords[0]), node_key(e["geom"].coords[-1]))
    intersections = sum(1 for _, d in G_all.degree() if d >= 3)

    # blocks: areas enclosed by public routes (named streets, public paths and the new routes)
    # and the kit edge; service lanes and private paths inside plots do not make a block
    public = [e["geom"] for e in live if e["kind"] != "bridge" and (e["added"] or e["class"] in PUBLIC_CLASSES)]
    lines = unary_union(public + [kit_local.exterior])
    blocks = [p for p in polygonize(lines) if p.area > 400 and kit_local.contains(p.representative_point())]
    areas = [p.area for p in blocks]

    def stats(vals):
        vals = list(vals)
        return {"mean": sum(vals) / len(vals) if vals else 0, "max": max(vals) if vals else 0}

    def rank(tag, bc):
        """Share of segments whose value is below the tagged route's mean: 0.9 = in the top 10 %."""
        v = on(tag, bc)
        vals = list(bc.values())
        return round(sum(1 for x in vals if x < v) / len(vals), 3) if v is not None and vals else None

    def on(tag_or_name, bc):
        vals = [bc[e["id"]] for e in live if e["id"] in bc and (tag_or_name in e["tags"] or e["name"] == tag_or_name)]
        return sum(vals) / len(vals) if vals else None

    flow = lambda pred: sum(car[e["id"]] * e["geom"].length for e in live if e["id"] in car and pred(e))
    total = flow(lambda e: True) or 1
    edge_share = flow(lambda e: e["name"] in EDGE_STREETS) / total

    # interior car flow: car streets that are not edge streets
    interior = [car[e["id"]] for e in live if e["id"] in car and e["name"] not in EDGE_STREETS]

    # integration: mean walking distance between all pairs of junctions (shorter = better integrated)
    total_d, pairs = 0.0, 0
    for _, dists in nx.all_pairs_dijkstra_path_length(G_ped, weight="weight"):
        total_d += sum(dists.values())
        pairs += len(dists) - 1
    mean_walk = total_d / pairs if pairs else None

    return {
        "segments": len(live),
        "intersections": intersections,
        "blocks": len(blocks),
        "mean_block_area_ha": round(sum(areas) / len(areas) / 1e4, 2) if areas else None,
        "mean_block_side_m": round(sum(math.sqrt(a) for a in areas) / len(areas)) if areas else None,
        "ped": {**stats(ped.values()), "mean_walk_m": round(mean_walk) if mean_walk else None, "axis": on("axis", ped), "square": on("square", ped), "riessner": on("Rießnerstraße", ped), "axis_rank": rank("axis", ped), "square_rank": rank("square", ped)},
        "car": {
            **stats(car.values()),
            "axis": on("axis", car),
            "square": on("square", car),
            "riessner": on("Rießnerstraße", car),
            "interior_mean": sum(interior) / len(interior) if interior else 0,
        },
        "car_flow_on_edges": round(edge_share, 3),
        "ped_nodes": G_ped.number_of_nodes(),
        "car_nodes": G_car.number_of_nodes(),
    }


# ---------------------------------------------------------------------------
def main():
    kit = json.loads((DATA / "kit.json").read_text(encoding="utf-8"))
    fwd, inv = projection(*kit["center"])
    kit_local = Polygon([fwd(*c) for c in kit["boundary"]])
    graph = json.loads((DATA / "streets.graph.json").read_text(encoding="utf-8"))
    buildings = json.loads((DATA / "layers" / "buildings.geojson").read_text(encoding="utf-8"))["features"]

    def poly_local(g):
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        return shapely.union_all([Polygon([fwd(*c) for c in p[0]]) for p in polys])

    building_geoms = [(f["properties"], poly_local(f["geometry"])) for f in buildings]

    def base_edges():
        return [
            {
                "id": f"e{e['id']}",
                "geom": LineString([fwd(*c) for c in e["coords"]]),
                "name": e["name"],
                "class": e["class"],
                "kind": e["class"],
                "added": False,
                "walk": bool(e["walkable"]),
                "car": e["class"] not in PED_ONLY_CLASSES,
                "tags": [],
            }
            for e in graph["edges"]
        ]

    OUT.mkdir(parents=True, exist_ok=True)
    meta = {"variants": {}, "max": {"ped": 0, "car": 0}}
    for v in VARIANTS:
        counter = iter(range(10**6))
        next_id = lambda: f"n{next(counter)}"
        edges = base_edges()

        # the square replaces the service lanes inside it
        removed_edges = []
        if v["square"]:
            for e in edges:
                if e["name"] != "Rießnerstraße" and SQUARE.buffer(-2).contains(e["geom"].interpolate(0.5, normalized=True)):
                    e["removed"] = True
                    removed_edges.append(e)

        for spec in v["add"]:
            add_line(edges, spec, next_id)
        if v.get("axis"):
            tag_axis_reuse(edges)
        if v["square"]:
            for e in edges:
                if e["name"] == "Rießnerstraße" and SQUARE.buffer(1).contains(e["geom"]) and "square" not in e["tags"]:
                    e["tags"].append("square")
        filters = apply_filters(edges, v["filters"])

        ped, G_ped = betweenness(edges, "walk")
        car, G_car = betweenness(edges, "car")
        m = measures(edges, kit_local, ped, car, G_ped, G_car)
        meta["max"]["ped"] = max(meta["max"]["ped"], m["ped"]["max"])
        meta["max"]["car"] = max(meta["max"]["car"], m["car"]["max"])

        # buildings cleared for new routes and the square
        clear = [s for s in v["add"] if CLEAR[s["kind"]] > 0]
        cut = shapely.union_all([LineString(s["line"]).buffer(CLEAR[s["kind"]], cap_style="flat") for s in clear] + ([SQUARE] if v["square"] else []))
        removed_buildings = [p for p, g in building_geoms if not cut.is_empty and g.intersection(cut).area > 0.15 * g.area]

        feats = []
        for e in edges:
            shown = e["geom"].intersection(kit_local)  # measured on the whole graph, drawn inside the kit
            if shown.is_empty or shown.geom_type not in ("LineString", "MultiLineString"):
                continue
            parts = [shown] if shown.geom_type == "LineString" else list(shown.geoms)
            coords = [inv(x, y) for x, y in max(parts, key=lambda g: g.length).coords]
            feats.append(
                {
                    "type": "Feature",
                    "properties": {
                        "id": e["id"],
                        "name": e["name"],
                        "class": e["class"],
                        "added": e["added"],
                        "removed": bool(e.get("removed")),
                        "walk": e["walk"],
                        "car": e["car"],
                        "filtered": bool(e.get("filtered")),
                        "tags": e["tags"],
                        "length_m": round(e["geom"].length, 1),
                        "ped_bc": round(ped.get(e["id"], 0), 5) if e["walk"] and not e.get("removed") else None,
                        "car_bc": round(car.get(e["id"], 0), 5) if e["car"] and not e.get("removed") else None,
                    },
                    "geometry": {"type": "LineString", "coordinates": coords},
                }
            )
        (OUT / f"{v['id']}.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

        meta["variants"][v["id"]] = {
            "measures": m,
            "added_routes": [{"name": s["name"], "kind": s["kind"], "length_m": round(LineString(s["line"]).length)} for s in v["add"]],
            "filters": [{**f, "lonlat": inv(f["x"], f["y"])} for f in filters],
            "removed_buildings": [p["id"] for p in removed_buildings],
            "removed_building_uses": dict(Counter(p["use"] for p in removed_buildings).most_common()),
            "removed_floor_area_m2": round(sum(p.get("floor_area_m2") or p.get("footprint_m2") or 0 for p in removed_buildings)),
            "removed_segments": len(removed_edges),
            "square": [inv(x, y) for x, y in SQUARE.exterior.coords] if v["square"] else None,
        }
        print(
            f"{v['id']}: {m['segments']} segments, {m['intersections']} junctions, blocks {m['mean_block_side_m']} m, "
            f"ped mean {m['ped']['mean']:.4f}, car mean {m['car']['mean']:.4f}, car on edges {m['car_flow_on_edges']:.0%}, "
            f"interior car {m['car']['interior_mean']:.4f}, mean walk {m['ped']['mean_walk_m']} m, axis rank {m['ped']['axis_rank']}, square rank {m['ped']['square_rank']}, removed {len(removed_buildings)} buildings"
        )
    (OUT / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
