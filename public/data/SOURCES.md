# Sources

The city kit: Weimar Nord, a square of 2000 × 2000 m around 50.99590 N, 11.32481 E. Generated on 2026-11-10 by `scripts/kit/build.py`. Don't edit these files by hand; run the generator again.

Bounding box, west, south, east, north: 11.313722, 50.990631, 11.336181, 51.000718. All coordinates are WGS84 longitude and latitude, longitude first.

| File | Source | Licence |
| --- | --- | --- |
| `buildings.geojson` | Overture Maps, release 2026-10-21.0 | ODbL |
| `streets.geojson`, `streets.graph.json` | Overture Maps, release 2026-10-21.0 | ODbL |
| `zensus.geojson` | Zensus 2022, 100 m grid | dl-de/by-2-0 |
| `kit.json` | the generator | |

## Attribution

Put this line on every map or page that uses the kit:

> Buildings and streets: Overture Maps Foundation, © OpenStreetMap contributors, Microsoft (ODbL). Census grid: Zensus 2022, © Statistische Ämter des Bundes und der Länder (dl-de/by-2-0).

## `buildings.geojson`

Building footprints from Overture Maps (https://overturemaps.org), release 2026-10-21.0, theme `buildings`. Overture combines OpenStreetMap with other sources; the sources in this area are: Microsoft ML Buildings, OpenStreetMap. Licence: Open Database License (ODbL), https://opendatacommons.org/licenses/odbl/. A building is in the kit when a point inside its footprint lies in the kit area. Underground buildings are left out.

900 buildings.

| Field | Meaning | Unit |
| --- | --- | --- |
| `id` | Overture id | |
| `class` | building type, such as `apartments`, `house` or `church`; `null` when unknown | |
| `name` | name, where there is one | |
| `floors` | floors above ground | floors |
| `height` | height of the building | metres |
| `height_source` | where `height` comes from | |

`height_source` is one of:

- `osm`: the height mapped in OpenStreetMap. 9 buildings.
- `floors`: the source gives the number of floors but no mapped height. The height is floors × 3 m, an estimate. 73 buildings.
- `ml`: a height that Microsoft estimated from aerial images with machine learning, not measured. 208 buildings.
- `null`: no height and no floors. `height` is `null` too. 610 buildings. Don't guess these; use a stated default and mark them.

## `streets.geojson` and `streets.graph.json`

Streets and paths from Overture Maps, release 2026-10-21.0, theme `transportation`, built from OpenStreetMap (ODbL, as above). Every road and path: roads, footways, paths, steps. Railways are left out.

`streets.geojson` is the drawing: one line per street segment, with `class`, `name` and `walkable`.

`streets.graph.json` is the network, for routing:

- `nodes`: `id`, `lon`, `lat`. A node is a junction or a dead end.
- `edges`: `id`, `from` and `to` (node ids), `length` in metres along the street, `walkable`, `class`, `name`, and `coords`, the line from `from` to `to`.

Edges have no direction; you can walk them both ways. `walkable` is false for motorways and trunk roads and for ways closed to people on foot. Edges that cross the edge of the kit are kept whole, so some lines end a little outside it. 1299 of 1305 edges are walkable, 1021 nodes, 51.8 km of streets and paths in total.

## `zensus.geojson`

The Zensus 2022 census on a 100 m grid, reference date 15 May 2022. Source: Statistische Ämter des Bundes und der Länder, https://www.zensus2022.de, files from https://www.zensus2022.de/DE/Ergebnisse-des-Zensus/gitterzellen.html. Licence: Datenlizenz Deutschland, Namensnennung, Version 2.0 (dl-de/by-2-0, https://www.govdata.de/dl-de/by-2-0).

73 cells, kept whole wherever a cell touches the kit area. Each cell is a 100 m square in the European grid (EPSG:3035), stored here as a polygon in longitude and latitude.

| Field | Meaning | Unit |
| --- | --- | --- |
| `id` | the census grid id of the cell | |
| `population` | residents | persons |
| `avg_age` | average age of the residents | years |
| `rent_eur_m2` | average net rent without heating and service charges (Nettokaltmiete) | € per m² per month |
| `vacancy_pct` | share of flats standing empty | percent |
| `heating_main` | the most common main heating type of the residential buildings in the cell; ties are joined with " / " | |
| `heating_buildings` | residential buildings counted for `heating_main` | buildings |
| `uncertain` | fields the census marks as statistically unreliable, because they rest on very few cases | |

How to read it:

- A cell is an area, not a building. To share a cell's residents out, use the part of the cell's area that you need.
- `null` means the census published no figure for that field in that cell. A cell with `population: null` is in the kit because another table lists it, for example because it has flats or residential buildings, but the census published no resident count for it. Don't read `null` as zero. Leave such cells out of sums and say how many you left out.
- The census protects privacy by changing small counts slightly at random (the cell-key method). Single cells are therefore approximate, and cell values don't add up exactly to official totals.
- In the source tables, "–" means exactly zero or set to zero. The kit stores it as `0`.

73 of the 73 cells have a resident count, 4174 residents in total. 53 cells have a rent figure.

## `kit.json`

The kit area: `label`, `center` as `[lon, lat]`, `bbox` as `[west, south, east, north]`, `size_m` as `[width, height]`, `overture_release` and `generated`.


## `layers/`

Analysis layers built by `scripts/kit/city_layers.py` (run it after `build.py`). Don't edit by hand. Feature counts and the raw ALKIS values behind each category are in `layers/meta.json`.

| File | Source | Licence |
| --- | --- | --- |
| `parcels.geojson` | ALKIS Vereinfacht WFS (Flurstueck), Geoportal Thüringen, cut at the kit edge | CC BY 4.0, © GDI-Th |
| `land_use.geojson` | ALKIS Vereinfacht WFS (Nutzung), cut at the kit edge | CC BY 4.0, © GDI-Th |
| `buildings.geojson` | ALKIS Vereinfacht WFS (GebaeudeBauwerk); kept whole when a point inside lies in the kit | CC BY 4.0, © GDI-Th |
| `stops`, `railways`, `stations`, `parking`, `bike_parking`, `fuel`, `charging` | OpenStreetMap via the Overpass API | ODbL |
| `network.geojson` | the kit street graph (Overture), cut at the kit edge | ODbL |

Fields worth knowing:

- `buildings`: `function` is the official ALKIS building function, `use` its group (see `BUILDING_USE` in the script), `floors` the floors above ground, `height_est` = floors × 3 m (an estimate of wall height without roof; `null` when ALKIS has no floor count), `footprint_m2`, `floor_area_m2`.
- `parcels`: `uses` lists every land use recorded on the parcel with its area; `main_use` is the largest, `land_use` its group (see `LAND_USE`).
- `network`: `kind` groups the Overture class into main road, local street, service road and footpath; `betweenness` (0–1) is edge betweenness on the walkable network inside the kit, weighted by length and scaled so the highest segment is 1. Edges near the kit edge are undercounted because walks beyond the kit are not included.

Not yet included: LoD2 roof models. The Thuringia 3D building download (`geoportal.geoportal-th.de/dienste/atom_th_gebaeude`) was offline for maintenance on 2026-11-10.

## variants/

Experiment 1 street-network variants V0–V6, built by `scripts/kit/variants.py` from `layers/network.geojson` and `layers/buildings.geojson` (sources above). New streets, paths, the square and the modal filters are drawn from the Experiment 1 brief; betweenness and the other measures are computed with networkx. `meta.json` holds the measures, filters, square and removed building ids for each variant.
