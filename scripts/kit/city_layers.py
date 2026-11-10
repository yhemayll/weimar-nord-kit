# /// script
# requires-python = ">=3.11"
# dependencies = ["requests", "shapely", "pyproj", "networkx", "numpy"]
# ///
"""Build the analysis layers of the kit from open data.

    uv run scripts/kit/city_layers.py            # fetch what is missing, then build
    uv run scripts/kit/city_layers.py --refresh  # fetch everything again

Run build.py first: this script reads the kit boundary (kit.json) and the street
graph (streets.graph.json) from public/data/ and writes to public/data/layers/.

Sources:
- ALKIS Vereinfacht WFS, Geoportal Thüringen (© GDI-Th, CC BY 4.0): parcels with
  their recorded land uses, buildings with function and floors, land-use areas.
- OpenStreetMap through the Overpass API (ODbL): public transport stops, railways
  and stations, parking, fuel and charging.
- The kit's own street graph (Overture Maps, ODbL): street types and a
  betweenness measure computed here.

Raw downloads are cached in scripts/kit/.cache/city_layers/.
"""

import argparse
import datetime as dt
import json
import re
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

import networkx as nx
import numpy as np
import requests
import shapely
from pyproj import Transformer
from shapely.geometry import LineString, Point, Polygon, mapping, shape

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
DATA = ROOT / "public" / "data"
OUT = DATA / "layers"
CACHE = HERE / ".cache" / "city_layers"
USER_AGENT = "ai-in-design city kit generator"

ALKIS_WFS = "https://www.geoproxy.geoportal-th.de/geoproxy/services/adv_alkis_wfs"
OVERPASS = [  # tried in order
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
NS = {
    "wfs": "http://www.opengis.net/wfs/2.0",
    "gml": "http://www.opengis.net/gml/3.2",
    "ave": "http://repository.gdi-de.org/schemas/adv/produkt/alkis-vereinfacht/1.0",
}

FLOOR_HEIGHT = 3.0  # metres per floor for the floor-based height estimate

_utm = Transformer.from_crs(4326, 25832, always_xy=True)
_wgs = Transformer.from_crs(25832, 4326, always_xy=True)


def transform(t, g):
    """Reprojects a shapely geometry with a pyproj transformer."""
    return shapely.transform(g, lambda xy: np.column_stack(t.transform(xy[:, 0], xy[:, 1])))


to_utm, to_wgs = _utm, _wgs


# ---------------------------------------------------------------------------
# Categories. Each list is in legend order; the last entry catches the rest.
# ---------------------------------------------------------------------------

# ALKIS building function (Gebäudefunktion) -> building use. Matching ignores case,
# umlauts (ä = ae) and punctuation; the first category with a matching key wins.
BUILDING_USE = [
    ("Housing with shops", ["Wohngebäude mit Handel", "Wohngebäude mit Gewerbe", "gemischt genutztes Gebäude mit Wohnen", "Wohngebäude mit Gemeinbedarf"]),
    ("Housing", ["Wohngebäude", "Wohnhaus", "Wohnheim", "Kinderheim", "Studentenwohnheim"]),
    ("Shops & services", ["Handel", "Dienstleistung", "Büro", "Geschäft", "Kaufhaus", "Bank", "Hotel", "Gaststätte", "Beherbergung", "Bewirtung", "Verwaltungsgebäude", "Gemischt genutztes Gebäude"]),
    ("Industry & workshops", ["Industrie", "Gewerbe", "Wirtschaft", "Produktion", "Fabrik", "Werkstatt", "Lager", "Handwerk", "Speicher", "Silo", "Kühlhaus"]),
    ("Schools & research", ["Schule", "Hochschul", "Universität", "Forschung", "Bildung", "Kindertagesstätte", "Kinderkrippe", "Kindergarten"]),
    ("Public services", ["öffentliche Zwecke", "Rathaus", "Gericht", "Polizei", "Feuerwehr", "Sicherheit", "Justiz", "Behörde", "Zoll"]),
    ("Health & social care", ["Gesundheit", "Krankenhaus", "Klinik", "Arzt", "Pflege", "soziale Zwecke", "Senioren"]),
    ("Culture & worship", ["Kirche", "Kapelle", "religiös", "kulturell", "Museum", "Theater", "Oper", "Bibliothek", "Veranstaltung", "Synagoge", "Moschee"]),
    ("Sport & leisure", ["Sport", "Turnhalle", "Schwimm", "Freizeit", "Erholung", "Hallenbad", "Stadion", "Vereinsheim"]),
    ("Mobility & parking", ["Garage", "Parkhaus", "Carport", "Bahnhof", "Verkehr", "Empfangsgebäude", "Tankstelle", "Fahrzeughalle", "Stellwerk", "Lokschuppen"]),
    ("Utilities", ["Versorgung", "Entsorgung", "Umformer", "Wasserwerk", "Kraftwerk", "Heizwerk", "Pumpstation", "Umspann", "Transformator", "Kläranlage", "Funkmast", "Schornstein", "Kommunikation"]),
    ("Sheds & canopies", ["Überdachung", "Schuppen", "Scheune", "Stall", "Gewächshaus", "Nebengebäude", "Land- und Forstwirtschaft"]),
    ("Other", []),
]

# ALKIS actual land use (tatsächliche Nutzung) -> land use. Same matching rules.
LAND_USE = [
    ("Housing", ["Wohnbaufläche"]),
    ("Mixed", ["Fläche gemischter Nutzung"]),
    ("Industry & commerce", ["Industrie und Gewerbefläche", "Tagebau", "Halde"]),
    ("Public facilities", ["Fläche besonderer funktionaler Prägung"]),
    ("Sport & green space", ["Sport Freizeit und Erholungsfläche", "Friedhof"]),
    ("Farmland", ["Landwirtschaft", "Ackerland", "Grünland"]),
    ("Woodland & shrubs", ["Wald", "Gehölz", "Heide", "Moor", "Sumpf"]),
    ("Streets & squares", ["Straßenverkehr", "Weg", "Platz"]),
    ("Railway", ["Bahnverkehr", "Flugverkehr", "Schiffsverkehr"]),
    ("Water", ["Fließgewässer", "Stehendes Gewässer", "Hafenbecken"]),
    ("Other", []),
]


def norm(text):
    text = text.lower()
    for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")):
        text = text.replace(a, b)
    return re.sub(r"[^a-z]", "", text)


def classify(value, scheme):
    if value:
        low = norm(value)
        for name, keys in scheme:
            if any(norm(k) in low for k in keys):
                return name
    return scheme[-1][0]


# ---------------------------------------------------------------------------
# Downloads
# ---------------------------------------------------------------------------
def cached(name, fetch, refresh):
    path = CACHE / name
    if refresh or not path.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        path.write_bytes(fetch())
    return path.read_bytes()


def alkis_pages(type_name, bbox_utm, refresh):
    """All features of one ALKIS type in a UTM box, page by page."""
    count, start, pages = 1000, 0, []
    while True:
        def fetch(start=start):
            r = requests.get(
                ALKIS_WFS,
                params={
                    "SERVICE": "WFS",
                    "VERSION": "2.0.0",
                    "REQUEST": "GetFeature",
                    "TYPENAMES": f"ave:{type_name}",
                    "BBOX": ",".join(f"{v:.0f}" for v in bbox_utm) + ",urn:ogc:def:crs:EPSG::25832",
                    "COUNT": count,
                    "STARTINDEX": start,
                },
                headers={"User-Agent": USER_AGENT},
                timeout=300,
            )
            r.raise_for_status()
            return r.content

        root = ET.fromstring(cached(f"alkis_{type_name}_{start}.xml", fetch, refresh))
        members = root.findall("wfs:member", NS)
        pages.extend(members)
        if len(members) < count:
            return pages
        start += count


def ring(el):
    """A ring may be one posList or a chain of curve segments (lines and arcs, arcs kept as their points)."""
    pts = []
    for pl in el.iter(f"{{{NS['gml']}}}posList"):
        vals = [float(v) for v in pl.text.split()]
        seg = list(zip(vals[0::2], vals[1::2]))
        pts.extend(seg[1:] if pts and seg and seg[0] == pts[-1] else seg)
    if pts and pts[0] != pts[-1]:
        pts.append(pts[0])
    return pts


def gml_polygons(el):
    polys = []
    for p in el.iter(f"{{{NS['gml']}}}Polygon"):
        shell = ring(p.find("gml:exterior", NS))
        holes = [h for h in (ring(i) for i in p.findall("gml:interior", NS)) if len(h) >= 4]
        if len(shell) >= 4:
            polys.append(Polygon(shell, holes))
    if not polys:
        return None
    g = shapely.union_all(polys) if len(polys) > 1 else polys[0]
    return g if g.is_valid else shapely.make_valid(g)


def alkis_features(type_name, bbox_utm, refresh):
    out = []
    for m in alkis_pages(type_name, bbox_utm, refresh):
        obj = m[0]
        props = {}
        geom = None
        for child in obj:
            tag = child.tag.split("}")[1]
            if tag == "geometrie":
                geom = gml_polygons(child)
            elif child.text and child.text.strip():
                props[tag] = child.text.strip()
        if geom is not None:
            out.append((geom, props))
    return out


def overpass(query, name, refresh):
    def fetch():
        errors = []
        for url in OVERPASS:
            try:
                r = requests.post(url, data={"data": query}, headers={"User-Agent": USER_AGENT}, timeout=300)
                r.raise_for_status()
                return r.content
            except requests.RequestException as err:
                errors.append(f"{url}: {err}")
        raise RuntimeError("all Overpass servers failed:\n" + "\n".join(errors))

    return json.loads(cached(name, fetch, refresh))


# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------
def to_wgs_geom(g):
    return shapely.set_precision(transform(to_wgs, g), 1e-7)


def write(name, features, counts):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{name}.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    counts[name] = len(features)
    print(f"{name:20s} {len(features):6d}")


def feature(geom, props):
    return {"type": "Feature", "properties": props, "geometry": mapping(geom)}


def cut(g, kit):
    """Part of a polygon inside the kit, polygons only."""
    g = g.intersection(kit)
    if g.geom_type == "GeometryCollection":
        g = shapely.union_all([p for p in g.geoms if p.geom_type in ("Polygon", "MultiPolygon")])
    return None if g.is_empty or g.area < 0.5 else g


# ---------------------------------------------------------------------------
# Layers
# ---------------------------------------------------------------------------
def dominant_use(tntxt):
    """'Gehoelz; 109|Weg; 2245' -> ('Weg', [('Weg', 2245), ('Gehoelz', 109)])"""
    uses = []
    for part in (tntxt or "").split("|"):
        if ";" in part:
            name, area = part.rsplit(";", 1)
            try:
                uses.append((name.strip(), float(area)))
            except ValueError:
                pass
    uses.sort(key=lambda u: -u[1])
    return (uses[0][0] if uses else None), uses


def build_alkis(kit_utm, bbox, refresh, counts, notes):
    # parcels
    parcels = []
    for g, p in alkis_features("Flurstueck", bbox, refresh):
        c = cut(g, kit_utm)
        if c is None:
            continue
        main, uses = dominant_use(p.get("tntxt"))
        parcels.append(
            feature(
                to_wgs_geom(c),
                {
                    "id": p.get("flstkennz"),
                    "number": p.get("flurstnr"),
                    "area_m2": float(p["flaeche"]) if p.get("flaeche") else None,
                    "address": p.get("lagebeztxt"),
                    "main_use": main,
                    "land_use": classify(main, LAND_USE),
                    "uses": "; ".join(f"{n} {a:.0f} m²" for n, a in uses) or None,
                    "cut_at_kit_edge": c.area < g.area - 1,
                },
            )
        )
    write("parcels", parcels, counts)

    # land-use areas
    landuse, raw = [], Counter()
    for g, p in alkis_features("Nutzung", bbox, refresh):
        c = cut(g, kit_utm)
        if c is None:
            continue
        raw[p.get("nutzart")] += 1
        landuse.append(
            feature(
                to_wgs_geom(c),
                {"use": p.get("nutzart"), "detail": p.get("bez") or p.get("zweck"), "land_use": classify(p.get("nutzart"), LAND_USE)},
            )
        )
    write("land_use", landuse, counts)
    notes["land_use_values"] = dict(raw.most_common())

    # buildings: kept whole when a point inside the footprint lies in the kit, as in build.py
    buildings, raw = [], Counter()
    for g, p in alkis_features("GebaeudeBauwerk", bbox, refresh):
        if not kit_utm.contains(g.representative_point()):
            continue
        function = p.get("funktion")
        raw[function] += 1
        floors = int(p["anzahlgs"]) if p.get("anzahlgs", "").isdigit() else None
        buildings.append(
            feature(
                to_wgs_geom(g),
                {
                    "id": p.get("oid"),
                    "function": function,
                    "use": classify(function, BUILDING_USE),
                    "floors": floors,
                    "height_est": floors * FLOOR_HEIGHT if floors else None,
                    "footprint_m2": round(g.area, 1),
                    "floor_area_m2": round(g.area * floors, 1) if floors else None,
                    "address": p.get("lagebeztxt"),
                    "kind": p.get("gebnutzbez"),
                },
            )
        )
    write("buildings", buildings, counts)
    notes["building_function_values"] = dict(raw.most_common())


def build_osm(kit_wgs, refresh, counts):
    w, s, e, n = kit_wgs.bounds
    bb = f"{s},{w},{n},{e}"
    q = f"""[out:json][timeout:120];
(
  node["highway"="bus_stop"]({bb});
  node["railway"="tram_stop"]({bb});
  node["public_transport"="platform"]({bb});
  nwr["railway"~"^(station|halt)$"]({bb});
  way["railway"~"^(rail|light_rail|tram|disused|siding)$"]({bb});
  nwr["amenity"="parking"]({bb});
  nwr["amenity"="fuel"]({bb});
  nwr["amenity"="charging_station"]({bb});
  nwr["amenity"="bicycle_parking"]({bb});
);
out geom;"""
    data = overpass(q, "overpass.json", refresh)

    def geom_of(el):
        if el["type"] == "node":
            return Point(el["lon"], el["lat"])
        pts = [(p["lon"], p["lat"]) for p in el.get("geometry", []) if p]
        if len(pts) >= 4 and pts[0] == pts[-1] and el["tags"].get("railway") not in ("rail", "light_rail", "tram", "disused", "siding"):
            return Polygon(pts)
        return LineString(pts) if len(pts) >= 2 else None

    groups = {k: [] for k in ["stops", "railways", "stations", "parking", "fuel", "charging", "bike_parking"]}
    seen_stops = set()
    for el in data["elements"]:
        t = el.get("tags", {})
        g = geom_of(el)
        if g is None or not g.intersects(kit_wgs):
            continue
        if g.geom_type == "LineString" and t.get("railway"):
            g = g.intersection(kit_wgs)
        props = {k: t.get(k) for k in ("name", "operator", "capacity", "access", "fee", "parking", "railway", "highway", "network", "route_ref") if t.get(k)}
        props["osm"] = f"{el['type'][0]}{el['id']}"
        if t.get("highway") == "bus_stop" or t.get("railway") == "tram_stop" or t.get("public_transport") == "platform":
            key = (t.get("name"), round(el.get("lat", 0), 4), round(el.get("lon", 0), 4))
            if key in seen_stops:
                continue
            seen_stops.add(key)
            props["mode"] = "tram" if t.get("railway") == "tram_stop" or t.get("tram") == "yes" else "bus"
            groups["stops"].append(feature(g, props))
        elif t.get("railway") in ("station", "halt"):
            groups["stations"].append(feature(g, props))
        elif t.get("railway"):
            groups["railways"].append(feature(g, props))
        elif t.get("amenity") == "parking":
            props["type"] = "building" if t.get("parking") in ("multi-storey", "underground", "rooftop") or t.get("building") else "surface"
            groups["parking"].append(feature(g, props))
        elif t.get("amenity") == "fuel":
            groups["fuel"].append(feature(g, props))
        elif t.get("amenity") == "charging_station":
            groups["charging"].append(feature(g, props))
        elif t.get("amenity") == "bicycle_parking":
            groups["bike_parking"].append(feature(g, props))
    for k, v in groups.items():
        write(k, v, counts)


STREET_KIND = {
    "primary": "main road", "secondary": "main road", "tertiary": "main road", "trunk": "main road", "motorway": "main road",
    "residential": "local street", "unclassified": "local street", "living_street": "local street", "unknown": "local street",
    "service": "service road",
    "footway": "footpath", "pedestrian": "footpath", "path": "footpath", "steps": "footpath", "cycleway": "footpath", "track": "footpath",
}


def build_network(kit_wgs, counts):
    """Street types and betweenness (how many shortest walks pass along each segment)."""
    graph = json.loads((DATA / "streets.graph.json").read_text(encoding="utf-8"))
    G = nx.Graph()
    for e in graph["edges"]:
        if e["walkable"]:
            G.add_edge(e["from"], e["to"], weight=e["length"], id=e["id"])
    bc = nx.edge_betweenness_centrality(G, weight="weight", normalized=True)
    by_id = {G.edges[u, v]["id"]: val for (u, v), val in bc.items()}
    top = max(by_id.values()) or 1
    out = []
    for e in graph["edges"]:
        line = LineString(e["coords"]).intersection(kit_wgs)  # the graph reaches a little past the kit edge
        if line.is_empty or line.geom_type not in ("LineString", "MultiLineString"):
            continue
        out.append(
            feature(
                line,
                {
                    "name": e["name"],
                    "class": e["class"],
                    "kind": STREET_KIND.get(e["class"], "local street"),
                    "length_m": e["length"],
                    "walkable": e["walkable"],
                    "betweenness": round(by_id[e["id"]] / top, 4) if e["id"] in by_id else None,
                },
            )
        )
    write("network", out, counts)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--refresh", action="store_true", help="download again instead of using the cache")
    args = ap.parse_args()

    kit_meta = json.loads((DATA / "kit.json").read_text(encoding="utf-8"))
    kit_wgs = Polygon(kit_meta["boundary"])
    kit_utm = transform(to_utm, kit_wgs)
    minx, miny, maxx, maxy = kit_utm.bounds
    bbox = (minx - 50, miny - 50, maxx + 50, maxy + 50)

    counts, notes = {}, {}
    build_alkis(kit_utm, bbox, args.refresh, counts, notes)
    build_osm(kit_wgs, args.refresh, counts)
    build_network(kit_wgs, counts)

    (OUT / "meta.json").write_text(
        json.dumps(
            {
                "generated": dt.date.today().isoformat(),
                "counts": counts,
                "floor_height_m": FLOOR_HEIGHT,
                "building_use": [n for n, _ in BUILDING_USE],
                "land_use": [n for n, _ in LAND_USE],
                **notes,
            },
            ensure_ascii=False,
            indent=1,
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
