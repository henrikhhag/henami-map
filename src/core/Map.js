import { Camera } from './Camera.js'
import { GlobeRenderer } from './GlobeRenderer.js'
import { TileLoader } from '../tiles/TileLoader.js'
import { InputHandler } from '../events/InputHandler.js'
import { Marker } from '../ui/Marker.js'

// Mørkt standardkart (CARTO dark, gratis, ingen nøkkel) – Mapbox-aktig mørk globe.
// @2x = retina-tiles (512px) → skarpere landetekster, samme antall requests.
const DARK_URL = 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'

// Bygg tile-URL. Prioritet: eksplisitt tileUrl > Mapbox (med token) > CARTO dark.
function resolveTileUrl(o) {
  if (o.tileUrl) return o.tileUrl
  if (o.mapboxToken) {
    const style = o.mapboxStyle || 'mapbox/dark-v11'
    return `https://api.mapbox.com/styles/v1/${style}/tiles/256/{z}/{x}/{y}@2x?access_token=${o.mapboxToken}`
  }
  return DARK_URL
}

export class Map {
  constructor(container, options = {}) {
    const el = typeof container === 'string' ? document.getElementById(container) : container
    if (!el) throw new Error('henami-map: container ikke funnet')

    el.style.position = 'relative'
    el.style.overflow = 'hidden'

    // WebGL-globe nederst, lett 2D-overlay for markører øverst.
    this._globeCanvas = this._makeCanvas()
    this._overlay = this._makeCanvas()
    this._overlay.style.pointerEvents = 'none'
    el.appendChild(this._globeCanvas)
    el.appendChild(this._overlay)
    this._octx = this._overlay.getContext('2d')

    this._camera = new Camera({
      center: options.center || { lng: 10.75, lat: 59.91 },
      zoom: options.zoom ?? 1.5,
      minZoom: options.minZoom ?? 0.5,
      maxZoom: options.maxZoom ?? 19
    })

    this._tileLoader = new TileLoader(resolveTileUrl(options))
    this._globeRenderer = new GlobeRenderer(this._globeCanvas, this._camera, this._tileLoader)
    this._input = new InputHandler(el, this._camera, () => this._onUpdate(), this._globeRenderer)
    this._events = {}
    this._markers = []

    this._globeRenderer.start()
    this._drawMarkers()
  }

  _makeCanvas() {
    const c = document.createElement('canvas')
    c.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:block;'
    return c
  }

  _onUpdate() {
    this._globeRenderer.markDirty()
    this._drawMarkers()
  }

  // Tegn markørene på overlayet, projisert via globens kamera (skjul de på baksiden).
  _drawMarkers() {
    const o = this._overlay, ctx = this._octx
    if (!ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = o.clientWidth, h = o.clientHeight
    if (o.width !== Math.round(w * dpr) || o.height !== Math.round(h * dpr)) {
      o.width = Math.round(w * dpr)
      o.height = Math.round(h * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    for (const m of this._markers) {
      const p = this._globeRenderer.projectLngLat(m.lng, m.lat)
      if (p && p.front) m.draw(ctx, p.x, p.y)
    }
  }

  getCenter() { return { ...this._camera.center } }
  getZoom() { return this._camera.zoom }

  setCenter(lng, lat) { this._camera.setCenter(lng, lat); this._onUpdate(); return this }
  setZoom(z) { this._camera.setZoom(z); this._onUpdate(); return this }
  flyTo(options, duration) { this._camera.flyTo(options, duration, () => this._onUpdate()); return this }

  addMarker(options) {
    const marker = new Marker(options)
    this._markers.push(marker)
    this._drawMarkers()
    return marker
  }

  removeMarker(marker) {
    this._markers = this._markers.filter(m => m !== marker)
    this._drawMarkers()
    return this
  }

  on(event, fn) {
    if (!this._events[event]) this._events[event] = []
    this._events[event].push(fn)
    return this
  }

  off(event, fn) {
    if (this._events[event])
      this._events[event] = this._events[event].filter(f => f !== fn)
    return this
  }

  destroy() {
    this._globeRenderer.stop()
    this._input.destroy()
    this._globeCanvas.remove()
    this._overlay.remove()
  }
}
