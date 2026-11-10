// Experiment 1 – Weimar Nord street network: the variants and what each one changes.
// Geometry and measures come from scripts/kit/variants.py (public/data/variants/).
// Variants are cumulative: each one keeps everything from the one before.

export const VARIANTS = [
  {
    id: 'V0',
    title: 'Existing network',
    goal: 'Baseline',
    summary: 'Today’s street network, unchanged. Every other variant is measured against it.',
    issues: [
      'The busiest streets are on the edges. Ettersburger Straße (west) and Buttelstedter Straße (east) are the only routes over the railway, so all north–south movement runs along the sides.',
      'Rießnerstraße is the only real east–west link. No other street carries movement across the site.',
      'The interior is poorly connected. Industriestraße, the Stadtwerke access road and the allotment edge carry little movement; cul-de-sacs, depots and fenced plots dominate.',
      'The allotments and the Stadtwerke land block east–west walking completely.',
      'The railway is a hard barrier. The station sits at the southern edge but can only be reached around the sides.',
      'The area between Rießnerstraße and the railway has no square and no boulevard.',
    ],
    added: [],
    removed: [],
    remodelled: [],
  },
  {
    id: 'V1',
    title: 'Break up the superblocks',
    goal: 'Goal 4 · Smaller blocks (pedestrians and cars)',
    summary:
      'Four new streets cut the central brownfield into blocks of about 115–135 m, the 80–150 m range the brief asks for. The residential edges, the green spaces and the Stadtwerke core are untouched.',
    added: [
      'New street A, east–west at the latitude of the central depots (y −130), from Mattstedter Weiden to Am Alten Speicher.',
      'New street B, east–west through the middle of the brownfield (y 0), from Mattstedter Weiden to Am Alten Speicher.',
      'New street C, north–south (x −145) from Rießnerstraße to the overgrown plot south of the allotment gardens.',
      'New street D, north–south (x 110) from Rießnerstraße to the southern edge of the Stadtwerke land.',
      'All four are ordinary streets, open to cars and people.',
    ],
    removed: ['Workshop, depot and storage buildings standing on the new street lines (18 m wide corridor).'],
    remodelled: ['Industriestraße, Mattstedter Weiden and Am Alten Speicher gain new junctions where the streets cross.'],
  },
  {
    id: 'V2',
    title: 'Station axis and rail crossing',
    goal: 'Goal 1 · Station axis (pedestrians)',
    summary:
      'A north–south pedestrian spine from Nordstraße to the station’s north side. It starts as a park path through the northwest woods and allotments, follows new street C, turns diagonally through the brownfield to new street D, crosses Rießnerstraße and ends on a new footbridge over the tracks.',
    added: [
      'Park path from Nordstraße south through the northwest green (the start of the axis, as the brief suggests), passing west of the public building at Nordstraße 11a.',
      'Diagonal pedestrian link from new street C to new street D across Industriestraße.',
      'New street south of Rießnerstraße through the low-density frontage to the rail edge.',
      'Pedestrian bridge over the railway to the station’s north side (about 60 m), the mobility-hub crossing.',
    ],
    removed: ['Buildings on the new street south of Rießnerstraße and on the diagonal link.'],
    remodelled: [
      'Parts of new streets C and D now carry the axis.',
      'Rießnerstraße gets a new crossing point where the axis meets it.',
    ],
  },
  {
    id: 'V3',
    title: 'Square at Rießnerstraße',
    goal: 'Goal 3 · Future square (pedestrians)',
    summary:
      'A square of about 72 × 72 m where the axis crosses Rießnerstraße, close to the station. Diagonal and edge paths across it tie the axis, Rießnerstraße and the frontage together.',
    added: [
      'Square surface across Rießnerstraße, between the discounter and the workshops, stopping short of the cultural building at Rießnerstraße 23.',
      'Two diagonal paths and two edge paths across the square.',
    ],
    removed: ['Buildings and service lanes inside the square: small shops, workshops and parking access on the Rießnerstraße frontage.'],
    remodelled: ['Rießnerstraße runs through the square as a shared space; it stays open to cars in this variant.'],
  },
  {
    id: 'V4',
    title: 'Modal filters',
    goal: 'Goals 2 and 6 · Calm interior, quiet residential edges (cars)',
    summary:
      'Six modal filters stop cars from cutting through the interior and the western housing, while people on foot and bike pass freely. Through traffic is pushed onto Ettersburger Straße, Buttelstedter Straße and Nordstraße.',
    added: [
      'Filters on Industriestraße (two: between new streets A and B, and at the Stadtwerke).',
      'Filters on new streets C and D, so each interior block is reached by car from one side only.',
      'Filter on Rödchenweg between Nordstraße and the housing, closing the rat-run (Goal 6).',
      'Filter on the access road along the allotments.',
    ],
    removed: ['No buildings or streets. Six street segments lose their car access.'],
    remodelled: ['Industriestraße becomes two dead ends for cars with a walking and cycling link in between.'],
  },
  {
    id: 'V5',
    title: 'Pedestrian green link',
    goal: 'Goal 5 · East–west green link (pedestrians only)',
    summary:
      'A walking route from the west residential edge through the woods, along the Stadtwerke’s southern edge and through the allotments to Buttelstedter Straße. It adds no car route.',
    added: [
      'Path from Rödchenweg east through the northwest green to Industriestraße.',
      'Path along the southern edge of the Stadtwerke land (opening up its surface parking, not cutting through the core).',
      'Public path through the allotment gardens to Buttelstedter Straße (adding a path, not removing plots).',
    ],
    removed: ['Sheds and small buildings on the path line at the Stadtwerke edge and in the allotments.'],
    remodelled: ['The axis and the green link cross in the northwest park.'],
  },
  {
    id: 'V6',
    title: 'Final refinement',
    goal: 'Base for the Density experiment',
    summary:
      'Keeps V5 and tries two links meant to bring more walks onto the axis and the square, because in V2–V5 the axis stayed just below the top-15 % target: a promenade along the rail edge from Hinter dem Bahnhof to the bridge, and a path from the square east to Am Alten Speicher. The filter on the allotment access road is dropped to keep car access to the allotments and the Stadtwerke yard from the north. Result: the axis does not move and the square ranks slightly lower than in V5, so these two links are candidates to drop or redraw before the Density experiment.',
    added: [
      'Rail promenade from Hinter dem Bahnhof along the rail buffer to the foot of the new bridge.',
      'Path from the square east to Am Alten Speicher.',
    ],
    removed: ['Buildings on the promenade line; the filter on the allotment access road.'],
    remodelled: ['The square now has four approaches: the axis from north and south, Rießnerstraße, and the new east path.'],
  },
]

// Plain-language names for the measures in variants/meta.json.
export const MEASURES = [
  { key: 'segments', label: 'Segments', fmt: 'int' },
  { key: 'intersections', label: 'Intersections', fmt: 'int' },
  { key: 'mean_block_side_m', label: 'Mean block size (m)', fmt: 'int', lowerIsBetter: true },
  { key: 'ped.mean_walk_m', label: 'Mean walk between junctions (m)', fmt: 'int', lowerIsBetter: true },
  { key: 'ped.mean', label: 'Pedestrian betweenness, mean', fmt: 'bc', neutral: true },
  { key: 'ped.max', label: 'Pedestrian betweenness, max', fmt: 'bc', neutral: true },
  { key: 'car.mean', label: 'Car betweenness, mean', fmt: 'bc', neutral: true },
  { key: 'car.max', label: 'Car betweenness, max', fmt: 'bc', neutral: true },
  { key: 'ped.axis', label: 'Axis, pedestrians', fmt: 'bc' },
  { key: 'ped.axis_rank', label: 'Axis rank (top %)', fmt: 'top' },
  { key: 'ped.square', label: 'Square, pedestrians', fmt: 'bc' },
  { key: 'ped.square_rank', label: 'Square rank (top %)', fmt: 'top' },
  { key: 'ped.riessner', label: 'Rießnerstraße, pedestrians', fmt: 'bc' },
  { key: 'car.riessner', label: 'Rießnerstraße, cars', fmt: 'bc' },
  { key: 'car.interior_mean', label: 'Interior car betweenness, mean', fmt: 'bc', lowerIsBetter: true },
  { key: 'car_flow_on_edges', label: 'Car flow on edge streets', fmt: 'pct' },
]
