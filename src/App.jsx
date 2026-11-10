import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { useData, FatLines, Markers } from './primitives.jsx'
import { VariantBar, VariantPanel, VariantNetwork, VariantRemoved, useRemovedSet } from './Experiment.jsx'
import {
  LAYERS, VIEWS, PALETTES, RAMP, FLOOR_HEIGHT, OVERTURE_DEFAULT_HEIGHT, HEIGHT_SOURCE_GROUPS, itemKey, rampColor,
} from './layers.js'
import { makeProjection, buildFill, buildExtrude, buildSegments, buildPoints } from './geometry.js'
import StreetLabels from './StreetLabels.jsx'

const ATTRIBUTION =
  'Cadastre: © GDI-Th, CC BY 4.0 (ALKIS). Points of interest: © OpenStreetMap contributors (ODbL). Kit buildings and streets: Overture Maps Foundation, © OpenStreetMap contributors, Microsoft (ODbL).'

const PALETTE_MAPS = Object.fromEntries(Object.entries(PALETTES).map(([k, list]) => [k, Object.fromEntries(list)]))

function featuresOf(layer, data) {
  if (!data) return null
  if (!layer.filter) return data.features
  return data.features.filter((f) => Object.entries(layer.filter).every(([k, v]) => f.properties[k] === v))
}

// Colour of one feature, or null to leave it out (its category is switched off).
function colorFn(layer, hidden) {
  const cb = layer.colorBy
  if (!cb) return () => layer.fill ?? layer.lineColor ?? '#1d2329'
  if (cb.ramp) {
    const c = new THREE.Color()
    const b = new THREE.Color()
    return (f) => {
      const v = f.properties[cb.property]
      if (v == null) return null
      const [from, to, t] = rampColor(Math.sqrt(v)) // square root spreads out the many low values
      return '#' + c.set(from).lerp(b.set(to), t).getHexString()
    }
  }
  const palette = PALETTE_MAPS[cb.palette]
  return (f) => {
    const cat = f.properties[cb.property] ?? 'Other'
    if (hidden?.has(cat)) return null
    return palette[cat] ?? palette.Other ?? '#cccccc'
  }
}

function overtureSource(f) {
  const s = f.properties.height_source
  for (const [name, sources] of Object.entries(HEIGHT_SOURCE_GROUPS)) if (sources.includes(s)) return name
  return PALETTES.heightSource[2][0]
}

// ---------------------------------------------------------------------------
// App: view tabs, layer panel, scene, feature info
// ---------------------------------------------------------------------------
function defaultVisibility() {
  const v = {}
  for (const view of VIEWS) for (const g of view.groups) for (const it of g.items) v[itemKey(view.id, it)] = !!it.visible
  return v
}

function loadSaved(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // storage may be blocked; the app works without it
  }
}

export default function App() {
  const [viewId, setViewId] = useState(() => loadSaved('view', VIEWS[0].id))
  const [visible, setVisible] = useState(defaultVisibility)
  const [hiddenCats, setHiddenCats] = useState({})
  const [mode, setMode] = useState('3d')
  const [picked, setPicked] = useState(null)
  const [panelOpen, setPanelOpen] = useState(true)
  const [variantId, setVariantId] = useState('V0')
  const [vmode, setVmode] = useState('ped')
  const kit = useData('kit.json')
  const meta = useData('layers/meta.json')
  const streets = useData('streets.geojson')

  const view = VIEWS.find((v) => v.id === viewId) ?? VIEWS[0]
  const vmeta = useData(view.variants ? 'variants/meta.json' : null)
  const variant = useMemo(() => (view.variants && vmeta ? { id: variantId, mode: vmode, meta: vmeta } : null), [view.variants, vmeta, variantId, vmode])
  useEffect(() => save('view', view.id), [view.id])
  useEffect(() => setPicked(null), [view.id])

  const toggle = (key) => setVisible((v) => ({ ...v, [key]: !v[key] }))
  const toggleCat = (key, cat) =>
    setHiddenCats((h) => {
      const s = new Set(h[key])
      s.has(cat) ? s.delete(cat) : s.add(cat)
      return { ...h, [key]: s }
    })

  const items = view.groups.flatMap((g) => g.items).filter((it) => visible[itemKey(view.id, it)])
  const showLabels = items.some((it) => it.labels)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <strong>Weimar Nord</strong>
          <span>Urban analysis kit</span>
        </div>
        <nav className="tabs" aria-label="Views">
          {VIEWS.map((v) => (
            <button key={v.id} className={v.id === view.id ? 'tab active' : 'tab'} onClick={() => setViewId(v.id)} title={v.subtitle}>
              {v.title}
            </button>
          ))}
        </nav>
      </header>

      <div className="stage">
        {kit && (
          <Scene key={view.id} kit={kit} items={items} viewId={view.id} hiddenCats={hiddenCats} mode={mode} streets={showLabels ? streets : null} onPick={setPicked} variant={variant} />
        )}

        <aside className={panelOpen ? 'panel' : 'panel closed'}>
          <div className="panel-head">
            <div>
              <h1>{view.title}</h1>
              <div className="sub">{view.subtitle}</div>
            </div>
            <button className="icon-btn" onClick={() => setPanelOpen((o) => !o)} aria-label={panelOpen ? 'Hide layers' : 'Show layers'}>
              {panelOpen ? '‹' : '›'}
            </button>
          </div>
          {panelOpen && (
            <div className="panel-body">
              {view.notice && <p className="notice">{view.notice}</p>}
              {!kit && 'Loading…'}
              {view.groups.map((g) => (
                <section key={g.name} className="group">
                  <h2>{g.name}</h2>
                  {g.items.map((it) => {
                    const key = itemKey(view.id, it)
                    return (
                      <LayerRow
                        key={key}
                        item={it}
                        on={!!visible[key]}
                        onToggle={() => toggle(key)}
                        meta={meta}
                        hidden={hiddenCats[key]}
                        onToggleCat={(c) => toggleCat(key, c)}
                      />
                    )
                  })}
                </section>
              ))}
            </div>
          )}
        </aside>

        <div className="mode" role="group" aria-label="Camera">
          {['2d', '3d'].map((m) => (
            <button key={m} className={m === mode ? 'active' : ''} onClick={() => setMode(m)}>
              {m.toUpperCase()}
            </button>
          ))}
        </div>

        {view.variants && (
          <>
            <VariantBar variantId={variantId} onVariant={setVariantId} vmode={vmode} onMode={setVmode} />
            <VariantPanel variantId={variantId} meta={vmeta} />
          </>
        )}
        {picked && <InfoCard picked={picked} onClose={() => setPicked(null)} beside={!!view.variants} />}
        <div className="credit">{ATTRIBUTION}</div>
      </div>
    </div>
  )
}

function Check({ on }) {
  return (
    <span className={on ? 'check on' : 'check'} aria-hidden="true">
      {on && (
        <svg viewBox="0 0 12 12" width="10" height="10">
          <path d="M2.5 6.2 5 8.5 9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  )
}

function itemCount(item, meta) {
  if (!item.layers || !meta || item.layers.some((id) => LAYERS[id].kind.startsWith('variant'))) return null
  const names = new Set(item.layers.map((id) => LAYERS[id].file?.match(/^layers\/(.+)\.geojson$/)?.[1]).filter(Boolean))
  if (!names.size) return null
  return [...names].reduce((n, name) => n + (meta.counts[name] ?? 0), 0)
}

function LayerRow({ item, on, onToggle, meta, hidden, onToggleCat }) {
  const n = itemCount(item, meta)
  const description = item.layers?.map((id) => LAYERS[id].description).join(' ')
  return (
    <div className={`row${on ? ' on' : ''}${n === 0 ? ' empty' : ''}`}>
      <button className="row-toggle" onClick={onToggle} title={description} aria-pressed={on}>
        <Check on={on} />
        <span className="row-name">{item.name}</span>
        {n != null && <span className="row-count">{n === 0 ? 'none here' : n.toLocaleString('en')}</span>}
      </button>
      {on && item.legend && <Legend item={item} hidden={hidden} onToggleCat={onToggleCat} />}
      {on && description && <p className="row-desc">{description}</p>}
    </div>
  )
}

function Legend({ item, hidden, onToggleCat }) {
  const layer = LAYERS[item.layers[0]]
  const data = useData(layer.file)

  if (item.legend === 'ramp') {
    return (
      <div className="ramp">
        <span className="ramp-bar" style={{ background: `linear-gradient(to right, ${RAMP.join(', ')})` }} />
        <span className="ramp-labels">
          <span>few walks</span>
          <span>most walks</span>
        </span>
      </div>
    )
  }

  const counts = {}
  const features = featuresOf(layer, data) ?? []
  for (const f of features) {
    const cat = layer.kind === 'overture' ? overtureSource(f) : f.properties[layer.colorBy.property] ?? 'Other'
    counts[cat] = (counts[cat] ?? 0) + 1
  }
  const filterable = layer.kind !== 'overture'
  return (
    <ul className="legend">
      {PALETTES[item.legend]
        .filter(([name]) => counts[name])
        .map(([name, color]) => {
          const off = hidden?.has(name)
          const body = (
            <>
              <span className="swatch" style={{ background: color }} />
              <span className="legend-name">{name}</span>
              <span className="row-count">{counts[name]}</span>
            </>
          )
          return (
            <li key={name}>
              {filterable ? (
                <button className={off ? 'cat off' : 'cat'} onClick={() => onToggleCat(name)} aria-pressed={!off} title={off ? 'Show' : 'Hide'}>
                  {body}
                </button>
              ) : (
                <span className="cat static">{body}</span>
              )}
            </li>
          )
        })}
    </ul>
  )
}

function InfoCard({ picked, onClose, beside }) {
  const rows = Object.entries(picked.properties ?? {}).filter(([, v]) => v != null && v !== '')
  return (
    <div className={beside ? 'info beside' : 'info'}>
      <div className="info-head">
        <strong>{picked.layer}</strong>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <table>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th>{k.replaceAll('_', ' ')}</th>
              <td>{typeof v === 'number' ? +v.toFixed(3) : String(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
function Scene({ kit, items, viewId, hiddenCats, mode, streets, onPick, variant }) {
  const project = useMemo(() => makeProjection(kit.center), [kit])
  const span = Math.max(...kit.size_m)

  return (
    <Canvas
      camera={{ position: [-0.4 * span, 0.7 * span, 0.8 * span], fov: 40, near: 1, far: 20 * span }}
      dpr={[1, 2]}
      gl={{ logarithmicDepthBuffer: true }}
      onPointerMissed={() => onPick(null)}
    >
      <color attach="background" args={['#ECEEF0']} />
      <hemisphereLight args={['#ffffff', '#b8bcc0', 1.6]} />
      <directionalLight position={[-600, 1000, 400]} intensity={1.8} />

      <Ground boundary={kit.boundary} project={project} />
      {items.flatMap((it) =>
        (it.layers ?? []).map((id) => (
          <Layer key={`${it.name}/${id}`} id={id} name={it.name} kit={kit} project={project} hidden={hiddenCats[itemKey(viewId, it)]} onPick={onPick} variant={variant} />
        )),
      )}
      {streets && <StreetLabels features={streets.features} project={project} />}

      <CameraRig mode={mode} span={span} />
    </Canvas>
  )
}

function CameraRig({ mode, span }) {
  const controls = useRef()
  const { camera } = useThree()
  useEffect(() => {
    const c = controls.current
    if (!c) return
    const t = c.target
    if (mode === '2d') camera.position.set(t.x, 1.6 * span, t.z + 0.01)
    else camera.position.set(t.x - 0.4 * span, 0.7 * span, t.z + 0.8 * span)
    c.update()
  }, [mode, span, camera])
  return <OrbitControls ref={controls} makeDefault enableDamping enableRotate={mode === '3d'} screenSpacePanning={mode === '2d'} maxPolarAngle={Math.PI / 2.1} />
}

function Ground({ boundary, project }) {
  const shape = useMemo(() => new THREE.Shape(boundary.map((p) => new THREE.Vector2(...project(p)))), [boundary, project])
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
      <shapeGeometry args={[shape]} />
      <meshBasicMaterial color="#F7F6F2" />
    </mesh>
  )
}

function pickHandler(onPick, name, lookup) {
  return (e) => {
    e.stopPropagation()
    const props = lookup(e)
    if (props) onPick({ layer: name, properties: props })
  }
}

function Layer({ id, name, kit, project, hidden, onPick, variant }) {
  const layer = LAYERS[id]
  if (layer.kind === 'kitBoundary') return <KitBoundary layer={layer} kit={kit} project={project} />
  if (layer.kind === 'variantNetwork') return variant ? <VariantNetwork variant={variant} project={project} onPick={onPick} /> : null
  if (layer.kind === 'variantRemoved') return variant ? <VariantRemoved variant={variant} project={project} /> : null
  if (layer.kind === 'extrude' || layer.kind === 'overture')
    return <Extruded layer={layer} name={name} project={project} hidden={hidden} onPick={onPick} variant={variant} />
  return <GeoLayer layer={layer} name={name} project={project} hidden={hidden} onPick={onPick} />
}

function KitBoundary({ layer, kit, project }) {
  const positions = useMemo(() => {
    const c = kit.boundary.map(project)
    const pts = []
    for (let i = 1; i < c.length; i++) pts.push(c[i - 1][0], layer.z, -c[i - 1][1], c[i][0], layer.z, -c[i][1])
    return new Float32Array(pts)
  }, [kit, project, layer])
  return <FatLines positions={positions} color={layer.color} width={layer.width} />
}

// Polygons, lines and points from one GeoJSON file.
function GeoLayer({ layer, name, project, hidden, onPick }) {
  const data = useData(layer.file)
  const features = useMemo(() => featuresOf(layer, data), [layer, data])

  const built = useMemo(() => {
    if (!features?.length) return null
    const colorOf = colorFn(layer, hidden)
    const z = layer.z ?? 0.1
    const fills = layer.fill != null || layer.colorBy
    return {
      fill: fills ? buildFill(features, project, z, colorOf) : null,
      // outlines in the stroke colour, left out with their category
      outline: layer.stroke
        ? buildSegments(features, project, z + 0.02, { lines: false, outlines: true, colorOf: (f) => (colorOf(f) == null ? null : layer.stroke) })
        : null,
      lines: buildSegments(features, project, z, { colorOf: layer.colorBy ? colorOf : null }),
      points: buildPoints(features, project).filter((p) => colorOf(features[p.fi]) != null),
      colorOf,
    }
  }, [features, project, layer, hidden])

  if (!built) return null
  const props = (fi) => features[fi]?.properties
  return (
    <group>
      {built.fill && (
        <mesh geometry={built.fill.geometry} onClick={pickHandler(onPick, name, (e) => props(built.fill.owners.find(e.faceIndex)))}>
          <meshBasicMaterial vertexColors side={THREE.DoubleSide} transparent={layer.opacity != null} opacity={layer.opacity ?? 1} depthWrite={layer.opacity == null} />
        </mesh>
      )}
      {built.outline && <FatLines positions={built.outline.positions} colors={built.outline.colors} width={layer.width ?? 1} />}
      {built.lines && (
        <FatLines
          positions={built.lines.positions}
          colors={built.lines.colors}
          color={layer.lineColor ?? '#1d2329'}
          width={layer.width ?? 1.5}
          onClick={pickHandler(onPick, name, (e) => props(built.lines.owners.find(e.faceIndex ?? 0)))}
        />
      )}
      {built.points.length > 0 && (
        <Markers
          points={built.points}
          colorOf={(p) => layer.marker ?? built.colorOf(features[p.fi])}
          onPick={(fi) => onPick({ layer: name, properties: props(fi) })}
        />
      )}
    </group>
  )
}

function Extruded({ layer, name, project, hidden, onPick, variant }) {
  const raw = useData(layer.file)
  const removed = useRemovedSet(layer.excludeRemoved ? variant : null)
  const data = useMemo(() => (raw && removed.size ? { ...raw, features: raw.features.filter((f) => !removed.has(f.properties.id)) } : raw), [raw, removed])
  const built = useMemo(() => {
    if (!data?.features.length) return null
    if (layer.kind === 'overture') {
      const palette = PALETTE_MAPS.heightSource
      return buildExtrude(data.features, project, (f) => f.properties.height ?? OVERTURE_DEFAULT_HEIGHT, (f) => palette[overtureSource(f)])
    }
    return buildExtrude(data.features, project, (f) => f.properties[layer.height] ?? FLOOR_HEIGHT, colorFn(layer, hidden))
  }, [data, project, layer, hidden])

  if (!built) return null
  return (
    <mesh geometry={built.geometry} onClick={pickHandler(onPick, name, (e) => data.features[built.owners.find(e.faceIndex)]?.properties)}>
      <meshStandardMaterial vertexColors roughness={0.9} />
    </mesh>
  )
}
