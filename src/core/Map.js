import { Camera } from './Camera.js'
import { Renderer } from './Renderer.js'
import { TileLoader } from '../tiles/TileLoader.js'
import { InputHandler } from '../events/InputHandler.js'
import { Marker } from '../ui/Marker.js'

const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

export class Map {
  constructor(container, options = {}) {
    const el = typeof container === 'string' ? document.getElementById(container) : container
    if (!el) throw new Error(`henam-map: container not found`)

    this._canvas = document.createElement('canvas')
    this._canvas.style.cssText = 'width:100%;height:100%;display:block;'
    el.style.overflow = 'hidden'
    el.appendChild(this._canvas)

    this._camera = new Camera({
      center: options.center || { lng: 10.75, lat: 59.91 },
      zoom: options.zoom ?? 10,
      minZoom: options.minZoom ?? 1,
      maxZoom: options.maxZoom ?? 19
    })

    this._tileLoader = new TileLoader(options.tileUrl || OSM_URL)

    this._renderer = new Renderer(this._canvas, this._camera, this._tileLoader)
    this._input = new InputHandler(this._canvas, this._camera, () => this._renderer.markDirty())
    this._events = {}

    this._renderer.start()
  }

  getCenter() { return { ...this._camera.center } }
  getZoom() { return this._camera.zoom }

  setCenter(lng, lat) {
    this._camera.setCenter(lng, lat)
    this._renderer.markDirty()
    return this
  }

  setZoom(z) {
    this._camera.setZoom(z)
    this._renderer.markDirty()
    return this
  }

  flyTo(options, duration) {
    this._camera.flyTo(options, duration, () => this._renderer.markDirty())
    return this
  }

  addMarker(options) {
    const marker = new Marker(options)
    this._renderer.addMarker(marker)
    this._renderer.markDirty()
    return marker
  }

  removeMarker(marker) {
    this._renderer.removeMarker(marker)
    this._renderer.markDirty()
    return this
  }

  on(event, fn) {
    if (!this._events[event]) this._events[event] = []
    this._events[event].push(fn)
    return this
  }

  off(event, fn) {
    if (this._events[event]) {
      this._events[event] = this._events[event].filter(f => f !== fn)
    }
    return this
  }

  destroy() {
    this._renderer.stop()
    this._input.destroy()
    this._canvas.remove()
  }
}
