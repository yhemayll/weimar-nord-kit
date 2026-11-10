import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// The scene uses local metres: x to the east, y up, north towards -z.

// Longitude and latitude to metres around the kit centre; the same formula as latent-intuition.
export function makeProjection([lon0, lat0]) {
  const phi = (lat0 * Math.PI) / 180
  const mPerLat = 111132.954 - 559.822 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi)
  const mPerLon = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi)
  return ([lon, lat]) => [(lon - lon0) * mPerLon, (lat - lat0) * mPerLat]
}

// Splits any GeoJSON geometry into polygons (arrays of rings), lines and points.
export function parts(geometry, out = { polygons: [], lines: [], points: [] }) {
  if (!geometry) return out
  const c = geometry.coordinates
  switch (geometry.type) {
    case 'Polygon': out.polygons.push(c); break
    case 'MultiPolygon': out.polygons.push(...c); break
    case 'LineString': out.lines.push(c); break
    case 'MultiLineString': out.lines.push(...c); break
    case 'Point': out.points.push(c); break
    case 'MultiPoint': out.points.push(...c); break
    case 'GeometryCollection': geometry.geometries.forEach((g) => parts(g, out)); break
  }
  return out
}

// Records which feature each triangle (or segment) belongs to, for picking.
class Owners {
  starts = []
  owners = []
  add(start, owner) {
    this.starts.push(start)
    this.owners.push(owner)
  }
  find(i) {
    let lo = 0, hi = this.starts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (this.starts[mid] <= i) lo = mid
      else hi = mid - 1
    }
    return this.owners[lo]
  }
}

function paint(g, color) {
  const n = g.attributes.position.count
  const colors = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) color.toArray(colors, i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return g
}

function shapesOf(rings, project) {
  const [outer, ...holes] = rings.map((r) => r.map((p) => new THREE.Vector2(...project(p))))
  if (!outer || outer.length < 3) return null
  const shape = new THREE.Shape(outer)
  shape.holes = holes.filter((h) => h.length >= 3).map((h) => new THREE.Path(h))
  return shape
}

// Flat polygons at height z, one colour per feature. Returns the merged geometry and an
// owner lookup from triangle index to feature index.
export function buildFill(features, project, z, colorOf) {
  const color = new THREE.Color()
  const geoms = []
  const owners = new Owners()
  let tri = 0
  features.forEach((f, fi) => {
    const polygons = parts(f.geometry).polygons
    if (!polygons.length) return
    const c = colorOf(f)
    if (c == null) return
    color.set(c)
    for (const rings of polygons) {
      const shape = shapesOf(rings, project)
      if (!shape) continue
      let g = new THREE.ShapeGeometry(shape)
      g.rotateX(-Math.PI / 2)
      g.translate(0, z, 0)
      g = g.index ? g.toNonIndexed() : g
      owners.add(tri, fi)
      tri += g.attributes.position.count / 3
      geoms.push(paint(g, color))
    }
  })
  return geoms.length ? { geometry: mergeGeometries(geoms), owners } : null
}

// Footprints extruded to a height property, one colour per feature.
export function buildExtrude(features, project, heightOf, colorOf) {
  const color = new THREE.Color()
  const geoms = []
  const owners = new Owners()
  let tri = 0
  features.forEach((f, fi) => {
    const c = colorOf(f)
    if (c == null) return
    color.set(c)
    const depth = Math.max(0.1, heightOf(f))
    for (const rings of parts(f.geometry).polygons) {
      const shape = shapesOf(rings, project)
      if (!shape) continue
      let g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false })
      g.rotateX(-Math.PI / 2) // extrude upwards, with north towards -z
      g = g.index ? g.toNonIndexed() : g
      owners.add(tri, fi)
      tri += g.attributes.position.count / 3
      geoms.push(paint(g, color))
    }
  })
  return geoms.length ? { geometry: mergeGeometries(geoms), owners } : null
}

// Line segments (pairs of points) at height z: lines, plus polygon outlines when withOutlines.
// With colorOf, each segment gets its feature's colour (null skips the feature).
export function buildSegments(features, project, z, { lines = true, outlines = false, colorOf = null } = {}) {
  const pts = []
  const cols = []
  const color = new THREE.Color()
  const owners = new Owners()
  const push = (coords) => {
    const c = coords.map(project)
    for (let i = 1; i < c.length; i++) {
      pts.push(c[i - 1][0], z, -c[i - 1][1], c[i][0], z, -c[i][1])
      if (colorOf) cols.push(color.r, color.g, color.b, color.r, color.g, color.b)
    }
  }
  features.forEach((f, fi) => {
    if (colorOf) {
      const c = colorOf(f)
      if (c == null) return
      color.set(c)
    }
    owners.add(pts.length / 6, fi)
    const p = parts(f.geometry)
    if (lines) p.lines.forEach(push)
    if (outlines) p.polygons.forEach((rings) => rings.forEach(push))
  })
  return pts.length ? { positions: new Float32Array(pts), colors: colorOf ? new Float32Array(cols) : null, owners } : null
}

export function buildPoints(features, project) {
  const out = []
  features.forEach((f, fi) => {
    for (const p of parts(f.geometry).points) {
      const [x, y] = project(p)
      out.push({ x, y, fi })
    }
  })
  return out
}
