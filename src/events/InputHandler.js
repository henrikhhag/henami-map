import { lngLatToWorld, pixelToWorld, worldToLngLat } from '../geo/mercator.js'

export class InputHandler {
  constructor(canvas, camera, onUpdate) {
    this.canvas = canvas
    this.camera = camera
    this.onUpdate = onUpdate
    this._dragging = false
    this._lastX = 0
    this._lastY = 0
    this._handlers = {}
    this._attach()
  }

  _attach() {
    const el = this.canvas

    this._handlers.mousedown = (e) => {
      this._dragging = true
      this._lastX = e.clientX
      this._lastY = e.clientY
      el.style.cursor = 'grabbing'
    }

    this._handlers.mousemove = (e) => {
      if (!this._dragging) return
      const dx = e.clientX - this._lastX
      const dy = e.clientY - this._lastY
      this._lastX = e.clientX
      this._lastY = e.clientY
      this._pan(dx, dy)
    }

    this._handlers.mouseup = () => {
      this._dragging = false
      el.style.cursor = 'grab'
    }

    this._handlers.mouseleave = () => {
      this._dragging = false
      el.style.cursor = 'grab'
    }

    this._handlers.wheel = (e) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.25 : 0.25
      this.camera.setZoom(this.camera.zoom + delta)
      this.onUpdate()
    }

    this._handlers.touchstart = (e) => {
      if (e.touches.length === 1) {
        this._dragging = true
        this._lastX = e.touches[0].clientX
        this._lastY = e.touches[0].clientY
      }
    }

    this._handlers.touchmove = (e) => {
      e.preventDefault()
      if (e.touches.length === 1 && this._dragging) {
        const dx = e.touches[0].clientX - this._lastX
        const dy = e.touches[0].clientY - this._lastY
        this._lastX = e.touches[0].clientX
        this._lastY = e.touches[0].clientY
        this._pan(dx, dy)
      }
    }

    this._handlers.touchend = () => { this._dragging = false }

    el.style.cursor = 'grab'
    for (const [evt, fn] of Object.entries(this._handlers)) {
      const opts = evt === 'wheel' || evt === 'touchmove' ? { passive: false } : undefined
      el.addEventListener(evt, fn, opts)
    }
  }

  _pan(dx, dy) {
    const { camera, canvas } = this
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    const centerWorld = lngLatToWorld(camera.center.lng, camera.center.lat)
    const newWorld = pixelToWorld(w / 2 - dx, h / 2 - dy, camera.zoom, w, h, centerWorld)
    const { lng, lat } = worldToLngLat(newWorld.x, newWorld.y)
    camera.setCenter(lng, lat)
    this.onUpdate()
  }

  destroy() {
    for (const [evt, fn] of Object.entries(this._handlers)) {
      this.canvas.removeEventListener(evt, fn)
    }
  }
}
