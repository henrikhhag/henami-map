import { Camera } from './Camera.js'
import { Renderer } from './Renderer.js'
import { GlobeRenderer } from './GlobeRenderer.js'
import { TileLoader } from '../tiles/TileLoader.js'
import { InputHandler } from '../events/InputHandler.js'
import { Marker } from '../ui/Marker.js'

const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const GLOBE_THRESHOLD = 3.5

export class Map {
  constructor(container, options = {}) {
    const el = typeof container === 'string' ? document.getElementById(container) : container
    if (!el) throw new Error('henami-map: container ikke funnet')

    el.style.position = 'relative'
    el.style.overflow = 'hidden'

    this._globeCanvas = this._makeCanvas()
    this._mapCanvas = this._makeCanvas()
    el.appendChild(this._globeCanvas)
    el.appendChild(this._mapCanvas)

    this._camera = new Camera({
      center: options.center || { lng: 10.75, lat: 59.91 },
      zoom: options.zoom ?? 1.5,
      minZoom: options.minZoom ?? 0.5,
      maxZoom: options.maxZoom ?? 19
    })

    this._tileLoader = new TileLoader(options.tileUrl || OSM_URL)

    this._globeRenderer = new GlobeRenderer(this._globeCanvas, this._camera, this._tileLoader)
    this._mapRenderer = new Renderer(this._mapCanvas, this._camera, this._tileLoader)

    this._input = new InputHandler(el, this._camera, () => this._onUpdate())
    this._events = {}

    this._updateMode()
    this._globeRenderer.start()
    this._mapRenderer.start()
  }

  _makeCanvas() {
    const c = document.createElement('canvas')
    c.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:block;'
    return c
  }

  _isGlobeMode() {
    return this._camera.zoom < GLOBE_THRESHOLD
  }

  _updateMode() {
    const globe = this._isGlobeMode()
    this._globeCanvas.style.opacity = globe ? '1' : '0'
    this._globeCanvas.style.pointerEvents = globe ? 'auto' : 'none'
    this._mapCanvas.style.opacity = globe ? '0' : '1'
    this._mapCanvas.style.pointerEvents = globe ? 'none' : 'auto'
    this._globeRenderer.markDirty()
    this._mapRenderer.markDirty()
  }

  _onUpdate() {
    this._updateMode()
  }

  getCenter() { return { ...this._camera.center } }
  getZoom() { return this._camera.zoom }

  setCenter(lng, lat) {
    this._camera.setCenter(lng, lat)
    this._onUpdate()
    return this
  }

  setZoom(z) {
    this._camera.setZoom(z)
    this._onUpdate()
    return this
  }

  flyTo(options, duration) {
    this._camera.flyTo(options, duration, () => this._onUpdate())
    return this
  }

  addMarker(options) {
    const marker = new Marker(options)
    this._mapRenderer.addMarker(marker)
    this._mapRenderer.markDirty()
    return marker
  }

  removeMarker(marker) {
    this._mapRenderer.removeMarker(marker)
    this._mapRenderer.markDirty()
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
    this._mapRenderer.stop()
    this._input.destroy()
    this._globeCanvas.remove()
    this._mapCanvas.remove()
  }
}
