import { useMemo } from 'react'
import { Html } from '@react-three/drei'

// Street segments come in short pieces; join pieces with the same name that share an end point.
function chainStreets(features, project) {
  const byName = new Map()
  for (const f of features) {
    const name = f.properties.name
    if (!name) continue
    if (!byName.has(name)) byName.set(name, [])
    byName.get(name).push(f.geometry.coordinates.map(project))
  }
  const key = ([x, y]) => `${Math.round(x)},${Math.round(y)}`
  const chains = []
  for (const [name, pieces] of byName) {
    const left = new Set(pieces.keys())
    while (left.size) {
      const first = left.values().next().value
      left.delete(first)
      let chain = [...pieces[first]]
      let grown = true
      while (grown) {
        grown = false
        for (const i of left) {
          const p = pieces[i]
          const [head, tail] = [key(chain[0]), key(chain[chain.length - 1])]
          if (key(p[0]) === tail) chain = chain.concat(p.slice(1))
          else if (key(p[p.length - 1]) === tail) chain = chain.concat([...p].reverse().slice(1))
          else if (key(p[p.length - 1]) === head) chain = p.slice(0, -1).concat(chain)
          else if (key(p[0]) === head) chain = [...p].reverse().slice(0, -1).concat(chain)
          else continue
          left.delete(i)
          grown = true
        }
      }
      chains.push({ name, points: chain })
    }
  }
  return chains
}

// Point at a given distance along a polyline.
function pointAlong(points, distance) {
  let walked = 0
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1]
    const [bx, by] = points[i]
    const d = Math.hypot(bx - ax, by - ay)
    if (walked + d >= distance) {
      const t = d ? (distance - walked) / d : 0
      return [ax + (bx - ax) * t, ay + (by - ay) * t]
    }
    walked += d
  }
  return points[points.length - 1]
}

const LABEL_SPACING = 450 // metres between repeated labels on one street
const LABEL_MIN_GAP = 200 // skip a label this close to another of the same name (e.g. dual carriageways)

export default function StreetLabels({ features, project }) {
  const labels = useMemo(() => {
    const chains = chainStreets(features, project)
      .map((c) => {
        let length = 0
        for (let i = 1; i < c.points.length; i++) length += Math.hypot(c.points[i][0] - c.points[i - 1][0], c.points[i][1] - c.points[i - 1][1])
        return { ...c, length }
      })
      .sort((a, b) => b.length - a.length)
    const placed = new Map()
    const out = []
    for (const { name, points, length } of chains) {
      const n = Math.max(1, Math.floor(length / LABEL_SPACING))
      for (let k = 0; k < n; k++) {
        const p = pointAlong(points, (length * (k + 0.5)) / n)
        const near = (placed.get(name) ?? []).some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < LABEL_MIN_GAP)
        if (near) continue
        if (!placed.has(name)) placed.set(name, [])
        placed.get(name).push(p)
        out.push({ name, p })
      }
    }
    return out
  }, [features, project])

  return labels.map(({ name, p }, i) => (
    <Html key={i} position={[p[0], 2, -p[1]]} center zIndexRange={[10, 0]} className="street-label">
      {name}
    </Html>
  ))
}
