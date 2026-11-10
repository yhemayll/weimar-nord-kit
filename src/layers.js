// Views, layers and palettes. Data in public/data/layers/ comes from scripts/kit/city_layers.py;
// the kit's own files (buildings, streets) from scripts/kit/build.py.

const ALKIS = '© GDI-Th, CC BY 4.0 (ALKIS)'
const OSM = '© OpenStreetMap contributors (ODbL)'
const OVERTURE = 'Overture Maps Foundation, © OpenStreetMap contributors, Microsoft (ODbL)'

export const PALETTES = {
  buildingUse: [
    ['Housing', '#E4B363'],
    ['Housing with shops', '#D98C4A'],
    ['Shops & services', '#C2553F'],
    ['Industry & workshops', '#6E5A7E'],
    ['Schools & research', '#3E7CB1'],
    ['Public services', '#5AA0A8'],
    ['Health & social care', '#D46A8C'],
    ['Culture & worship', '#8E4F9E'],
    ['Sport & leisure', '#7FAF5A'],
    ['Mobility & parking', '#8C949C'],
    ['Utilities', '#4E5D6C'],
    ['Sheds & canopies', '#C9BFAE'],
    ['Other', '#E2DED6'],
  ],
  landUse: [
    ['Housing', '#F1D9A6'],
    ['Mixed', '#EDBB8A'],
    ['Industry & commerce', '#C7B6D6'],
    ['Public facilities', '#A9CFD3'],
    ['Sport & green space', '#B9D79A'],
    ['Farmland', '#E8E3B0'],
    ['Woodland & shrubs', '#7FA86A'],
    ['Streets & squares', '#D6D6D1'],
    ['Railway', '#A3A3A3'],
    ['Water', '#8DB9DE'],
    ['Other', '#ECE9E2'],
  ],
  streetKind: [
    ['main road', '#2F3A45'],
    ['local street', '#66737F'],
    ['service road', '#A3ACB4'],
    ['footpath', '#3E8E6E'],
  ],
  parkingType: [
    ['surface', '#B8C4CF'],
    ['building', '#55606B'],
  ],
  heightSource: [
    ['height mapped', '#d9b48f'],
    ['height estimated', '#c9cfa0'],
    ['no height, shown at 9 m', '#a3a9ae'],
  ],
}

// Sequential ramp for 0..1 values (street betweenness): light sand to deep wine.
export const RAMP = ['#F3E9D2', '#E9C46A', '#E07A4F', '#B5523B', '#5B2333']

export const FLOOR_HEIGHT = 3

// kind: fill (flat polygons; lines and points in the same file are drawn too), extrude, overture, kitBoundary.
// z: height above the ground in metres, so flat layers stack without flicker.
// colorBy: { property, palette } for categories or { property, ramp: true } for 0..1 values.
export const LAYERS = {
  kit_boundary: { kind: 'kitBoundary', color: '#1d2329', width: 2, z: 1.4, description: 'Edge of the Weimar Nord kit area. Every layer is cut to it.' },

  parcels: {
    file: 'layers/parcels.geojson', kind: 'fill', fill: '#FBFAF7', stroke: '#9AA3AB', width: 0.7, z: 0.05, attribution: ALKIS,
    description: 'Cadastral parcels (Flurstücke) from ALKIS, cut at the kit edge, with number, official area and the land uses recorded on each.',
  },
  parcels_use: {
    file: 'layers/parcels.geojson', kind: 'fill', colorBy: { property: 'land_use', palette: 'landUse' }, stroke: '#FFFFFF', width: 0.6, z: 0.08, attribution: ALKIS,
    description: 'Parcels coloured by the land use that covers most of their area.',
  },
  land_use: {
    file: 'layers/land_use.geojson', kind: 'fill', colorBy: { property: 'land_use', palette: 'landUse' }, z: 0.06, attribution: ALKIS,
    description: 'Actual land use areas (tatsächliche Nutzung) from ALKIS. Unlike parcels, these follow the use on the ground, not ownership.',
  },
  footprints: {
    file: 'layers/buildings.geojson', kind: 'fill', fill: '#FFFFFF', stroke: '#1d2329', width: 0.8, z: 0.3, attribution: ALKIS,
    description: 'Building footprints from ALKIS with function, floors above ground, footprint and floor area.',
  },
  use_footprints: {
    file: 'layers/buildings.geojson', kind: 'fill', colorBy: { property: 'use', palette: 'buildingUse' }, stroke: '#1d2329', width: 0.4, z: 0.32, attribution: ALKIS,
    description: 'Footprints coloured by building use, grouped from the official ALKIS building function.',
  },
  massing: {
    file: 'layers/buildings.geojson', kind: 'extrude', height: 'height_est', fill: '#E7E4DE', attribution: ALKIS,
    description: `Footprints extruded to floors × ${FLOOR_HEIGHT} m: an estimate of the wall height without roofs. Buildings with no floor count (garages, canopies, sheds) are shown at ${FLOOR_HEIGHT} m.`,
  },
  use_massing: {
    file: 'layers/buildings.geojson', kind: 'extrude', height: 'height_est', colorBy: { property: 'use', palette: 'buildingUse' }, attribution: ALKIS,
    description: 'The same massing, coloured by building use.',
  },

  streets: {
    file: 'layers/network.geojson', kind: 'fill', colorBy: { property: 'kind', palette: 'streetKind' }, width: 1.6, z: 0.7, attribution: OVERTURE,
    description: 'The kit street network by type: main roads, local streets, service roads and footpaths.',
  },
  betweenness: {
    file: 'layers/network.geojson', kind: 'fill', colorBy: { property: 'betweenness', ramp: true }, width: 2.4, z: 0.75, filter: { walkable: true }, attribution: OVERTURE,
    description: 'Betweenness: the share of shortest walks between all pairs of street junctions that pass along each segment, scaled so the busiest segment is 1. Computed on the walkable network inside the kit only, so streets near the edge score lower than they would in the whole city.',
  },

  stops: { file: 'layers/stops.geojson', kind: 'fill', marker: '#E07A4F', attribution: OSM, description: 'Bus and tram stops (OpenStreetMap).' },
  railways: { file: 'layers/railways.geojson', kind: 'fill', lineColor: '#1d2329', width: 2.2, z: 0.85, attribution: OSM, description: 'Railway tracks and sidings (OpenStreetMap).' },
  stations: { file: 'layers/stations.geojson', kind: 'fill', fill: '#1d2329', stroke: '#1d2329', marker: '#1d2329', z: 0.4, attribution: OSM, description: 'Railway stations and halts (OpenStreetMap).' },
  parking: {
    file: 'layers/parking.geojson', kind: 'fill', colorBy: { property: 'type', palette: 'parkingType' }, stroke: '#55606B', width: 0.6, marker: '#55606B', z: 0.2, attribution: OSM,
    description: 'Car parks (OpenStreetMap): surface lots and parking buildings.',
  },
  bike_parking: { file: 'layers/bike_parking.geojson', kind: 'fill', marker: '#3E8E6E', attribution: OSM, description: 'Bicycle parking (OpenStreetMap).' },
  fuel: { file: 'layers/fuel.geojson', kind: 'fill', fill: '#C2553F', marker: '#C2553F', z: 0.25, attribution: OSM, description: 'Fuel stations (OpenStreetMap).' },
  charging: { file: 'layers/charging.geojson', kind: 'fill', marker: '#3E7CB1', attribution: OSM, description: 'EV charging stations (OpenStreetMap).' },

  overture_buildings: { file: 'buildings.geojson', kind: 'overture', attribution: OVERTURE, description: 'The kit’s Overture buildings, coloured by where their height comes from.' },
  overture_streets: { file: 'streets.geojson', kind: 'fill', lineColor: '#5d6b78', width: 1, z: 0.8, attribution: OVERTURE, description: 'The kit’s Overture streets and paths.' },
}

const edge = { name: 'Area', items: [{ name: 'Kit boundary', layers: ['kit_boundary'], visible: true }] }
const labels = { name: 'Labels', items: [{ name: 'Street names', labels: true, visible: true }] }

export const VIEWS = [
  {
    id: 'fabric',
    title: 'Urban Fabric',
    subtitle: 'Buildings, land, streets and mobility',
    groups: [
      edge,
      {
        name: 'Buildings',
        items: [
          { name: 'Footprints', layers: ['footprints'] },
          { name: 'Use (footprints)', layers: ['use_footprints'], legend: 'buildingUse', visible: true },
          { name: 'Massing', layers: ['massing'] },
          { name: 'Use (massing)', layers: ['use_massing'], legend: 'buildingUse' },
        ],
      },
      {
        name: 'Land',
        items: [
          { name: 'Parcels', layers: ['parcels'] },
          { name: 'Parcels by main use', layers: ['parcels_use'], legend: 'landUse' },
          { name: 'Land use areas', layers: ['land_use'], legend: 'landUse', visible: true },
        ],
      },
      { name: 'Streets', items: [{ name: 'Street types', layers: ['streets'], legend: 'streetKind', visible: true }] },
      {
        name: 'Transit & rail',
        items: [
          { name: 'Bus & tram stops', layers: ['stops'], visible: true },
          { name: 'Railway tracks', layers: ['railways'] },
          { name: 'Stations', layers: ['stations'] },
        ],
      },
      {
        name: 'Parking & energy',
        items: [
          { name: 'Car parks', layers: ['parking'], legend: 'parkingType' },
          { name: 'Bicycle parking', layers: ['bike_parking'] },
          { name: 'Fuel stations', layers: ['fuel'] },
          { name: 'EV charging', layers: ['charging'] },
        ],
      },
      labels,
    ],
  },
  {
    id: 'analysis',
    title: 'Analysis Model',
    subtitle: 'Clean geometry and measures for analysis',
    groups: [
      edge,
      {
        name: 'Land',
        items: [
          { name: 'Parcels', layers: ['parcels'], visible: true },
          { name: 'Parcels by main use', layers: ['parcels_use'], legend: 'landUse' },
        ],
      },
      {
        name: 'Buildings',
        items: [
          { name: 'Massing', layers: ['massing'], visible: true },
          { name: 'Use (massing)', layers: ['use_massing'], legend: 'buildingUse' },
          { name: 'Use (footprints)', layers: ['use_footprints'], legend: 'buildingUse' },
        ],
      },
      {
        name: 'Street network',
        items: [
          { name: 'Betweenness (walking)', layers: ['betweenness'], legend: 'ramp', visible: true },
          { name: 'Street types', layers: ['streets'], legend: 'streetKind' },
        ],
      },
      labels,
    ],
  },
  {
    id: 'detailed',
    title: 'Detailed 3D',
    subtitle: 'Buildings with roofs (LoD2)',
    notice:
      'The roof models (LoD2) come from the Thuringia 3D building download, which was offline for maintenance on 10 Nov 2026. Until it is back, this view shows the floor-based massing.',
    groups: [
      edge,
      { name: 'Land', items: [{ name: 'Parcels', layers: ['parcels'], visible: true }] },
      { name: 'Buildings', items: [{ name: 'Massing (until LoD2 is available)', layers: ['massing'], visible: true }] },
      labels,
    ],
  },
  {
    id: 'kit',
    title: 'Kit (Overture)',
    subtitle: 'The kit’s own buildings and streets',
    groups: [
      edge,
      {
        name: 'Overture',
        items: [
          { name: 'Buildings by height source', layers: ['overture_buildings'], visible: true, legend: 'heightSource' },
          { name: 'Streets', layers: ['overture_streets'], visible: true },
        ],
      },
      labels,
    ],
  },
]

export const OVERTURE_DEFAULT_HEIGHT = 9
export const HEIGHT_SOURCE_GROUPS = { 'height mapped': ['lod2', 'osm'], 'height estimated': ['floors', 'ml'] }

export function itemKey(viewId, item) {
  return `${viewId}/${item.name}`
}

export function rampColor(t) {
  const x = Math.min(1, Math.max(0, t)) * (RAMP.length - 1)
  const i = Math.min(RAMP.length - 2, Math.floor(x))
  return [RAMP[i], RAMP[i + 1], x - i]
}
