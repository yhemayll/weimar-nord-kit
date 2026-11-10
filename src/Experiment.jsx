// Experiment 1: variant switcher, write-up card and the variant network in the scene.
import { useMemo } from 'react'
import * as THREE from 'three'
import { useData, FatLines, Markers } from './primitives.jsx'
import { buildSegments, buildFill } from './geometry.js'
import { RAMP, rampColor } from './layers.js'
import { VARIANTS, MEASURES } from './variants.js'

const MODES = [
  ['ped', 'Pedestrians'],
  ['car', 'Cars'],
]

export function VariantBar({ variantId, onVariant, vmode, onMode }) {
  return (
    <div className="variant-bar" role="toolbar" aria-label="Network variants">
      <div className="seg" role="group" aria-label="Variant">
        {VARIANTS.map((v) => (
          <button key={v.id} className={v.id === variantId ? 'active' : ''} onClick={() => onVariant(v.id)} title={`${v.id}: ${v.title}`} aria-pressed={v.id === variantId}>
            {v.id}
            {v.id === 'V0' && <span className="seg-sub">current</span>}
          </button>
        ))}
      </div>
      <div className="seg" role="group" aria-label="Mode">
        {MODES.map(([m, label]) => (
          <button key={m} className={m === vmode ? 'active' : ''} onClick={() => onMode(m)} aria-pressed={m === vmode}>
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

function get(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj)
}

function fmt(v, kind) {
  if (v == null) return '–'
  if (kind === 'int') return Math.round(v).toLocaleString('en')
  if (kind === 'pct') return `${Math.round(v * 100)} %`
  if (kind === 'top') return `top ${Math.max(1, Math.round((1 - v) * 100))} %`
  return (v * 1000).toFixed(1) // betweenness in thousandths
}

function delta(v, base, m) {
  if (v == null || base == null || m.fmt === 'top') return null
  const d = v - base
  if (Math.abs(d) < 1e-9) return null
  const better = m.lowerIsBetter ? d < 0 : d > 0
  const txt = m.fmt === 'pct' ? `${d > 0 ? '+' : '−'}${Math.abs(Math.round(d * 100))}` : m.fmt === 'int' ? `${d > 0 ? '+' : '−'}${Math.abs(Math.round(d))}` : `${d > 0 ? '+' : '−'}${Math.abs(d * 1000).toFixed(1)}`
  return { txt, better }
}

function List({ title, items, kind }) {
  if (!items.length) return null
  return (
    <section className={`vc-list ${kind}`}>
      <h3>{title}</h3>
      <ul>
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </section>
  )
}

export function VariantCard({ variantId, meta }) {
  const v = VARIANTS.find((x) => x.id === variantId)
  const m = meta?.variants[variantId]
  const base = meta?.variants.V0
  if (!v) return null

  const removed = [...v.removed]
  if (m && m.removed_buildings.length) {
    const uses = Object.entries(m.removed_building_uses)
      .map(([u, n]) => `${n} ${u.toLowerCase()}`)
      .join(', ')
    removed.push(`In total ${m.removed_buildings.length} buildings (${uses}), about ${m.removed_floor_area_m2.toLocaleString('en')} m² of floor area.`)
  }
  if (m?.removed_segments) removed.push(`${m.removed_segments} service-lane segments inside the square.`)

  return (
    <aside className="variant-card" aria-label={`${v.id} ${v.title}`}>
      <div className="vc-head">
        <span className="vc-id">{v.id}</span>
        <div>
          <h2>{v.title}</h2>
          <div className="vc-goal">{v.goal}</div>
        </div>
      </div>
      <p className="vc-summary">{v.summary}</p>
      {v.issues && (
        <section className="vc-list issues">
          <h3>Issues (from the Experiment 1 brief)</h3>
          <ul>
            {v.issues.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </section>
      )}
      <List title="Added" items={v.added} kind="added" />
      <List title="Removed" items={removed} kind="removed" />
      <List title="Remodelled" items={v.remodelled} kind="remodelled" />
      {v.id !== 'V0' && <p className="vc-note">Includes everything from the earlier variants.</p>}

      {m && (
        <section className="vc-measures">
          <h3>Measures{v.id !== 'V0' && ' (change from V0)'}</h3>
          <table>
            <tbody>
              {MEASURES.map((mm) => {
                const val = get(m.measures, mm.key)
                if (val == null && mm.fmt !== 'int') return null
                const d = v.id === 'V0' ? null : delta(val, get(base.measures, mm.key), mm)
                return (
                  <tr key={mm.key}>
                    <th>{mm.label}</th>
                    <td>
                      {fmt(val, mm.fmt)}
                      {d && <span className={mm.neutral ? 'd' : d.better ? 'd good' : 'd bad'}>{d.txt}</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="vc-foot">
            Mean walk: average shortest walking distance between all pairs of junctions, a stand-in for integration (shorter = better connected). Betweenness in thousandths: the share of shortest routes between all junction pairs that use a segment, length-weighted, all pairs counted equally, whole kit network. Edge streets are Ettersburger Straße,
            Buttelstedter Straße and Nordstraße. Blocks are areas between public streets and the new routes.
          </p>
        </section>
      )}
      <div className="vc-key">
        <span>
          <i className="k-ramp" style={{ background: `linear-gradient(to right, ${RAMP.join(', ')})` }} /> low → high
        </span>
        <span>
          <i className="k-added" /> added
        </span>
        <span>
          <i className="k-square" /> square
        </span>
        <span>
          <i className="k-closed" /> closed to mode
        </span>
        <span>
          <i className="k-filter" /> modal filter
        </span>
        <span>
          <i className="k-removed" /> removed building
        </span>
      </div>
    </aside>
  )
}

export function useRemovedSet(variant) {
  return useMemo(() => new Set(variant?.meta?.variants[variant.id]?.removed_buildings ?? []), [variant?.meta, variant?.id])
}

const c1 = new THREE.Color()
const c2 = new THREE.Color()
function bcColor(v, max) {
  const [a, b, t] = rampColor(Math.sqrt(v / max))
  return '#' + c1.set(a).lerp(c2.set(b), t).getHexString()
}

// The network of one variant: coloured routes, halos on new ones, raised bridge, filters, square.
export function VariantNetwork({ variant, project, onPick }) {
  const data = useData(`variants/${variant.id}.geojson`)
  const { mode, meta } = variant
  const vm = meta.variants[variant.id]

  const built = useMemo(() => {
    if (!data) return null
    const key = mode === 'ped' ? 'ped_bc' : 'car_bc'
    const max = meta.max[mode]
    const live = data.features.filter((f) => !f.properties.removed)
    const isBridge = (f) => f.properties.class === 'bridge'
    const open = live.filter((f) => f.properties[key] != null)
    const closed = live.filter((f) => f.properties[key] == null)
    return {
      open: buildSegments(open.filter((f) => !isBridge(f)), project, 0.9, { colorOf: (f) => bcColor(f.properties[key], max) }),
      bridge: buildSegments(open.filter(isBridge), project, 7, { colorOf: (f) => bcColor(f.properties[key], max) }),
      closed: buildSegments(closed, project, 0.85),
      halo: buildSegments(live.filter((f) => f.properties.added), project, 0.8),
      bridgeHalo: buildSegments(live.filter((f) => f.properties.added && isBridge(f)), project, 6.9),
      open_features: open.filter((f) => !isBridge(f)),
    }
  }, [data, mode, meta, project])

  const square = useMemo(() => {
    if (!vm.square) return null
    const f = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [vm.square] } }
    return buildFill([f], project, 2, () => "#E3B566")
  }, [vm.square, project])

  const filters = useMemo(
    () =>
      vm.filters.map((f) => {
        const [x, y] = project(f.lonlat)
        return { x, y, fi: f }
      }),
    [vm.filters, project],
  )

  if (!built) return null
  const pick = (seg) => (e) => {
    e.stopPropagation()
    const f = built.open_features[seg.owners.find(e.faceIndex ?? 0)]
    if (f) onPick({ layer: f.properties.name || f.properties.class, properties: summarise(f.properties) })
  }
  return (
    <group>
      {square && (
        <mesh geometry={square.geometry}>
          <meshBasicMaterial vertexColors side={THREE.DoubleSide} />
        </mesh>
      )}
      {built.halo && <FatLines positions={built.halo.positions} color="#3D8BFD" width={7} />}
      {built.bridgeHalo && <FatLines positions={built.bridgeHalo.positions} color="#3D8BFD" width={9} />}
      {built.closed && <FatLines positions={built.closed.positions} color="#B9BEC4" width={1.2} />}
      {built.open && <FatLines positions={built.open.positions} colors={built.open.colors} width={3} onClick={pick(built.open)} />}
      {built.bridge && <FatLines positions={built.bridge.positions} colors={built.bridge.colors} width={4} />}
      {filters.length > 0 && (
        <Markers points={filters} height={9} radius={4} colorOf={() => '#D62828'} onPick={(f) => onPick({ layer: 'Modal filter', properties: { location: f.label, street: f.street, effect: 'closed to cars, open to walking and cycling' } })} />
      )}
    </group>
  )
}

function summarise(p) {
  return {
    name: p.name,
    type: p.class,
    new_in_variant: p.added ? 'yes' : 'no',
    open_to_cars: p.car ? 'yes' : p.filtered ? 'no (modal filter)' : 'no',
    open_to_walking: p.walk ? 'yes' : 'no',
    length_m: p.length_m,
    pedestrian_betweenness: p.ped_bc != null ? +(p.ped_bc * 1000).toFixed(2) : null,
    car_betweenness: p.car_bc != null ? +(p.car_bc * 1000).toFixed(2) : null,
  }
}

// Red outlines where the variant clears buildings.
export function VariantRemoved({ variant, project }) {
  const data = useData('layers/buildings.geojson')
  const removed = useRemovedSet(variant)
  const built = useMemo(() => {
    if (!data || !removed.size) return null
    const feats = data.features.filter((f) => removed.has(f.properties.id))
    return {
      fill: buildFill(feats, project, 1.6, () => '#F4C7C3'),
      outline: buildSegments(feats, project, 1.7, { lines: false, outlines: true }),
    }
  }, [data, removed, project])
  if (!built) return null
  return (
    <group>
      {built.fill && (
        <mesh geometry={built.fill.geometry}>
          <meshBasicMaterial vertexColors transparent opacity={0.7} depthWrite={false} />
        </mesh>
      )}
      {built.outline && <FatLines positions={built.outline.positions} color="#D62828" width={1.6} />}
    </group>
  )
}

export { VariantCard as VariantPanel }
