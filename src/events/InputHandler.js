import { globeView } from '../geo/globe.js'

export class InputHandler {
  constructor(el, camera, onUpdate, globeRenderer) {
    this.el = el
    this.camera = camera
    this.onUpdate = onUpdate
    this.globe = globeRenderer
    this._dragging = false
    this._lastX = 0
    this._lastY = 0
    this._velX = 0
    this._velY = 0
    this._lastTime = 0
    this._inertiaId = null
    this._targetZoom = camera.zoom
    this._zoomId = null
    this._pinching = false
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
      // Skalér med faktisk deltaY (trackpad vs mushjul) men demp kraftig,
      // og tak per event så raske trackpad-events ikke hoper seg opp.
      const base = this._zoomId ? this._targetZoom : this.camera.zoom
      const raw = -e.deltaY * 0.004
      const step = Math.max(-0.5, Math.min(0.5, raw))
      this._zoomToward(base + step)
    }

    this._handlers.touchstart = (e) => {
      if (this._inertiaId) { cancelAnimationFrame(this._inertiaId); this._inertiaId = null }
      if (e.touches.length === 2) {
        // Pinch-start: lås zoom-referanse og forankre midtpunktet mellom fingrene
        this._dragging = false
        this._pinching = true
        this._pinchStartDist = this._touchDist(e.touches)
        this._pinchStartZoom = this.camera.zoom
        const mid = this._touchMid(e.touches)
        this._captureZoomAnchor({ clientX: mid.x, clientY: mid.y })
      } else if (e.touches.length === 1) {
        this._dragging = true
        this._pinching = false
        this._lastX = e.touches[0].clientX
        this._lastY = e.touches[0].clientY
        this._velX = this._velY = 0
        this._lastTime = performance.now()
      }
    }

    this._handlers.touchmove = (e) => {
      e.preventDefault()
      if (e.touches.length === 2 && this._pinching) {
        // Pinch-zoom: forhold mellom fingeravstand → zoom-endring, hold midtpunkt fast
        const d = this._touchDist(e.touches)
        const dz = Math.log2(d / this._pinchStartDist)
        this.camera.setZoom(this._pinchStartZoom + dz)
        this._applyZoomAnchor()
        this.onUpdate()
      } else if (e.touches.length === 1 && this._dragging) {
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

    this._handlers.touchend = (e) => {
      if (e.touches && e.touches.length < 2) this._pinching = false
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

  _touchDist(touches) {
    return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)
  }

  _touchMid(touches) {
    return { x: (touches[0].clientX + touches[1].clientX) / 2, y: (touches[0].clientY + touches[1].clientY) / 2 }
  }

  // Roter globen som ved en drag på (dx, dy) piksler – delt av pan og zoom-anker.
  _rotateGlobe(dx, dy) {
    const dpx = this._globeDegPerPixel()
    const c = this.camera.center
    c.lng -= dx * dpx
    c.lat = Math.max(-85, Math.min(85, c.lat + dy * dpx))
    c.lng = ((c.lng + 180) % 360 + 360) % 360 - 180
  }

  // Fang det geografiske punktet under cursoren (raycast) så vi holder det fast
  // under zoom (som Mapbox). Alltid globe-modus nå.
  _captureZoomAnchor(e) {
    // Behold ankeret under en pågående zoom-gest (unngår dyrt re-søk)
    if (this._zoomId && this._zoomAnchor) return
    const rect = this.el.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const ll = this.globe ? this.globe.unprojectToLngLat(px, py) : null
    this._zoomAnchor = ll ? { px, py, globe: ll } : null
  }

  // Nudge globen så det forankrede punktet projiserer tilbake til cursoren.
  _applyZoomAnchor() {
    const a = this._zoomAnchor
    if (!a || !a.globe || !this.globe) return
    for (let i = 0; i < 2; i++) {
      const p = this.globe.projectLngLat(a.globe.lng, a.globe.lat)
      if (!p) break
      this._rotateGlobe(a.px - p.x, a.py - p.y)
    }
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
      this.camera.setZoom(cur + diff * 0.22)
      this._applyZoomAnchor()
      this.onUpdate()
      this._zoomId = requestAnimationFrame(ease)
    }
    this._zoomId = requestAnimationFrame(ease)
  }

  _globeDegPerPixel() {
    const h = this.el.clientHeight || 600
    const { dist, fov } = globeView(this.camera.zoom, h)
    const f = 1 / Math.tan(fov / 2)
    const globeScreenRadius = (h / 2) * (f / dist)
    return (1 / globeScreenRadius) * (180 / Math.PI)
  }

  _pan(dx, dy) {
    this._rotateGlobe(dx, dy)
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
