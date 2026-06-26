# henami-map

Open source WebGL map library, heavily inspired by Mapbox GL JS. Built from scratch with no dependencies — just vanilla JavaScript and the Canvas 2D API.

> **Status:** v0.1.0 — Phase 1 complete (raster tiles, pan/zoom/flyTo, markers). Vector tiles coming in Phase 2.

## Demo

```bash
git clone https://github.com/henrikhhag/henami-map.git
cd henami-map
npm install
npm run dev
```

Then open [http://localhost:3030](http://localhost:3030).

## Usage

```js
import { Map, Marker } from 'henami-map'

const map = new Map('map-container', {
  center: { lng: 10.75, lat: 59.91 },
  zoom: 11
})

map.addMarker({ lng: 10.75, lat: 59.91, color: '#3b82f6', label: 'Oslo' })

map.flyTo({ center: { lng: 5.32, lat: 60.39 }, zoom: 12 })
```

## API

### `new Map(container, options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `center` | `{ lng, lat }` | Oslo | Initial map center |
| `zoom` | `number` | `10` | Initial zoom level |
| `minZoom` | `number` | `1` | Minimum zoom |
| `maxZoom` | `number` | `19` | Maximum zoom |
| `tileUrl` | `string` | OSM | Custom tile URL template (`{z}/{x}/{y}`) |

### Methods

| Method | Description |
|---|---|
| `setCenter(lng, lat)` | Move map to coordinates |
| `setZoom(z)` | Set zoom level |
| `flyTo({ center, zoom }, duration?)` | Smooth animated transition |
| `getCenter()` | Returns `{ lng, lat }` |
| `getZoom()` | Returns current zoom |
| `addMarker(options)` | Add a marker, returns `Marker` instance |
| `removeMarker(marker)` | Remove a marker |
| `on(event, fn)` | Subscribe to events |
| `off(event, fn)` | Unsubscribe |
| `destroy()` | Clean up and remove canvas |

### `Marker` options

| Option | Default | Description |
|---|---|---|
| `lng`, `lat` | required | Position |
| `color` | `#e74c3c` | Marker color |
| `size` | `12` | Marker radius in px |
| `label` | `''` | Text label inside marker |

## Architecture

```
src/
├── core/
│   ├── Map.js          # Public API
│   ├── Camera.js       # Viewport state + flyTo animation
│   └── Renderer.js     # Canvas 2D render loop
├── tiles/
│   ├── TileGrid.js     # Mercator tile visibility calculation
│   └── TileLoader.js   # Image fetch + cache
├── geo/
│   └── mercator.js     # Coordinate math (lng/lat ↔ world ↔ pixel)
├── events/
│   └── InputHandler.js # Mouse/touch pan + scroll zoom
├── ui/
│   └── Marker.js       # Canvas marker drawing
└── index.js            # Public exports
```

## Tile sources

By default, henami-map uses [OpenStreetMap](https://www.openstreetmap.org/) tiles (free, no API key required). You can swap in any XYZ tile source:

```js
const map = new Map('container', {
  tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
})
```

Please follow the [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/) for production use.

## Roadmap

- [x] Phase 1 — Raster tiles, pan/zoom, markers, flyTo
- [x] Phase 2 — WebGL globe + seamless globe↔mercator projection morph, dark theme, retina tiles, pinch-zoom
- [ ] Phase 3 — Vector tile parsing (PBF/protobuf), style spec, line/polygon drawing
- [ ] Phase 4 — React wrapper (`<HenamiMap />`)
- [ ] Phase 5 — 3D terrain (terrain-RGB), custom light theme

## License

MIT — free to use, modify, and distribute.

Credits: map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright).
