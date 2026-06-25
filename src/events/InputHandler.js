import { lngLatToWorld, pixelToWorld, worldToLngLat } from '../geo/mercator.js'
import { globeCameraDistance, GLOBE_FOV as FOV } from '../geo/globe.js'

const GLOBE_THRESHOLD = 3.5

export class InputHandler {
  constructor(el, camera, onUpdate) {
    this.el = el
    this.camera = camera
    this.onUpdate = onUpdate
    this._dragging = false
    this._lastX = 0
    this._lastY = 0
    this._velX = 0
    this._velY = 0
    this._lastTime = 0
    this._inertiaId = null
    this._targetZoom = camera.zoom
    this._zoomId = null
    this._handlers = {}
    this._attach()
  }

  _attach() {
    const el = this.el

    this._handlers.mousedown = (e) => {
      if (this._inertiaId) { cancelAnimationFrame(this._inertiaId); this._inertiaId = null }
      this._dragging = true
      this._lastX = e.clientX
      this._lastY = e.clientY
      this._velX = this._velY = 0
      this._lastTime = performance.now()
      el.style.cursor = 'grabbing'
    }

    this._handlers.mousemove = (e) => {
      if (!this._dragging) return
      const dx = e.clientX - this._lastX
      const dy = e.clientY - this._lastY
      const now = performance.now()
      const dt = Math.max(1, now - this._lastTime)
      this._velX = dx / dt * 16
      this._velY = dy / dt * 16
      this._lastX = e.clientX
      this._lastY = e.clientY
      this._lastTime = now
      this._pan(dx, dy)
    }

    this._handlers.mouseup = () => {
      this._dragging = false
      this.el.style.cursor = 'grab'
      this._startInertia()
    }

    this._handlers.mouseleave = () => {
      if (!this._dragging) return
      this._dragging = false
      this.el.style.cursor = 'grab'
      this._startInertia()
    }

    this._handlers.dblclick = (e) => {
      e.preventDefault()
      this._captureZoomAnchor(e)
      this._zoomToward((this._zoomId ? this._targetZoom : this.camera.zoom) + 1)
    }

    this._handlers.wheel = (e) => {
      e.preventDefault()
      this._captureZoomAnchor(e)
      // Akkumulér mot et mål og glid mykt dit – mindre steg = roligere zoom
      const base = this._zoomId ? this._targetZoom : this.camera.zoom
      const step = -Math.sign(e.deltaY) * 0.35
      this._zoomToward(base + step)
    }

    this._handlers.touchstart = (e) => {
      if (this._inertiaId) { cancelAnimationFrame(this._inertiaId); this._inertiaId = null }
      if (e.touches.length === 1) {
        this._dragging = true
        this._lastX = e.touches[0].clientX
        this._lastY = e.touches[0].clientY
        this._velX = this._velY = 0
        this._lastTime = performance.now()
      }
    }

    this._handlers.touchmove = (e) => {
      e.preventDefault()
      if (e.touches.length === 1 && this._dragging) {
        const dx = e.touches[0].clientX - this._lastX
        const dy = e.touches[0].clientY - this._lastY
        const now = performance.now()
        const dt = Math.max(1, now - this._lastTime)
        this._velX = dx / dt * 16
        this._velY = dy / dt * 16
        this._lastX = e.touches[0].clientX
        this._lastY = e.touches[0].clientY
        this._lastTime = now
        this._pan(dx, dy)
      }
    }

    this._handlers.touchend = () => {
      this._dragging = false
      this._startInertia()
    }

    el.style.cursor = 'grab'
    for (const [evt, fn] of Object.entries(this._handlers)) {
      const passive = evt === 'wheel' || evt === 'touchmove' ? { passive: false } : undefined
      el.addEventListener(evt, fn, passive)
    }
  }

  _startInertia() {
    const decay = 0.88
    const step = () => {
      if (Math.abs(this._velX) < 0.05 && Math.abs(this._velY) < 0.05) {
        this._inertiaId = null
        return
      }
      this._pan(this._velX, this._velY)
      this._velX *= decay
      this._velY *= decay
      this._inertiaId = requestAnimationFrame(step)
    }
    this._inertiaId = requestAnimationFrame(step)
  }

  // Fang stedet under cursoren så vi kan holde det fast under zoom (som Mapbox).
  // Kun i kart-modus; på globen zoomer vi mot senter.
  _captureZoomAnchor(e) {
    if (this.camera.zoom < GLOBE_THRESHOLD) { this._zoomAnchor = null; return }
    const rect = this.el.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const w = this.el.clientWidth
    const h = this.el.clientHeight
    const cw = lngLatToWorld(this.camera.center.lng, this.camera.center.lat)
    const world = pixelToWorld(px, py, this.camera.zoom, w, h, cw)
    this._zoomAnchor = { px, py, world }
  }

  // Re-sentrér så det forankrede verdenspunktet havner under cursoren igjen.
  _applyZoomAnchor() {
    if (!this._zoomAnchor || this.camera.zoom < GLOBE_THRESHOLD) return
    const w = this.el.clientWidth
    const h = this.el.clientHeight
    const scale = Math.pow(2, this.camera.zoom) * 256
    const cx = this._zoomAnchor.world.x - (this._zoomAnchor.px - w / 2) / scale
    const cy = this._zoomAnchor.world.y - (this._zoomAnchor.py - h / 2) / scale
    const { lng, lat } = worldToLngLat(cx, cy)
    this.camera.setCenter(lng, Math.max(-85, Math.min(85, lat)))
  }

  _zoomToward(target) {
    this._targetZoom = this.camera.clampZoom(target)
    if (this._zoomId) return
    const ease = () => {
      const cur = this.camera.zoom
      const diff = this._targetZoom - cur
      if (Math.abs(diff) < 0.002) {
        this.camera.setZoom(this._targetZoom)
        this._applyZoomAnchor()
        this.onUpdate()
        this._zoomId = null
        return
      }
      // Eksponentiell innfasing → starter raskt, bremser mykt mot målet
      this.camera.setZoom(cur + diff * 0.15)
      this._applyZoomAnchor()
      this.onUpdate()
      this._zoomId = requestAnimationFrame(ease)
    }
    this._zoomId = requestAnimationFrame(ease)
  }

  _globeDegPerPixel() {
    const h = this.el.clientHeight || 600
    const dist = globeCameraDistance(this.camera.zoom, h)
    const f = 1 / Math.tan(FOV / 2)
    const globeScreenRadius = (h / 2) * (f / dist)
    return (1 / globeScreenRadius) * (180 / Math.PI)
  }

  _pan(dx, dy) {
    const { camera, el } = this
    if (camera.zoom < GLOBE_THRESHOLD) {
      const dpx = this._globeDegPerPixel()
      camera.center.lng -= dx * dpx
      camera.center.lat = Math.max(-85, Math.min(85, camera.center.lat + dy * dpx))
      camera.center.lng = ((camera.center.lng + 180) % 360 + 360) % 360 - 180
    } else {
      const w = el.clientWidth
      const h = el.clientHeight
      const centerWorld = lngLatToWorld(camera.center.lng, camera.center.lat)
      const newWorld = pixelToWorld(w / 2 - dx, h / 2 - dy, camera.zoom, w, h, centerWorld)
      const { lng, lat } = worldToLngLat(newWorld.x, newWorld.y)
      camera.setCenter(lng, lat)
    }
    this.onUpdate()
  }

  destroy() {
    if (this._inertiaId) cancelAnimationFrame(this._inertiaId)
    if (this._zoomId) cancelAnimationFrame(this._zoomId)
    for (const [evt, fn] of Object.entries(this._handlers)) {
      this.el.removeEventListener(evt, fn)
    }
  }
}
