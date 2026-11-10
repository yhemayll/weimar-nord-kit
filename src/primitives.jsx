import { useEffect, useMemo, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'

// ---------------------------------------------------------------------------
// Data loading, cached per file
// ---------------------------------------------------------------------------
const cache = new Map()
export function fetchData(file) {
  if (!cache.has(file)) cache.set(file, fetch(`${import.meta.env.BASE_URL}data/${file}`).then((r) => r.json()))
  return cache.get(file)
}

export function useData(file) {
  const [data, setData] = useState(null)
  useEffect(() => {
    let live = true
    if (file) fetchData(file).then((d) => live && setData(d))
    return () => {
      live = false
    }
  }, [file])
  return data
}

// Lines with a width in screen pixels (WebGL lines are always 1 px). Optional per-segment colours.
export function FatLines({ positions, colors, color, width, onClick }) {
  const size = useThree((s) => s.size)
  const obj = useMemo(() => {
    const g = new LineSegmentsGeometry()
    g.setPositions(positions)
    if (colors) g.setColors(colors)
    const m = new LineMaterial({ color: colors ? '#ffffff' : color, linewidth: width, vertexColors: !!colors, worldUnits: false })
    return new LineSegments2(g, m)
  }, [positions, colors, color, width])
  useEffect(() => {
    obj.material.resolution.set(size.width, size.height)
  }, [obj, size])
  useEffect(
    () => () => {
      obj.geometry.dispose()
      obj.material.dispose()
    },
    [obj],
  )
  return <primitive object={obj} onClick={onClick} />
}

// Upright discs marking points; colorOf(point) gives each one its colour.
export function Markers({ points, colorOf, onPick, radius = 5, height = 2 }) {
  const ref = useRef()
  const geometry = useMemo(() => new THREE.CylinderGeometry(radius, radius, height, 20), [radius, height])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => {
    const m = new THREE.Matrix4()
    const c = new THREE.Color()
    points.forEach((p, i) => {
      ref.current.setMatrixAt(i, m.makeTranslation(p.x, height / 2 + 0.5, -p.y))
      ref.current.setColorAt(i, c.set(colorOf(p)))
    })
    ref.current.instanceMatrix.needsUpdate = true
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [points, colorOf, height])
  return (
    <instancedMesh
      key={points.length}
      ref={ref}
      args={[geometry, undefined, points.length]}
      onClick={(e) => {
        e.stopPropagation()
        onPick(points[e.instanceId].fi)
      }}
    >
      <meshBasicMaterial />
    </instancedMesh>
  )
}
