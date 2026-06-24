import { lngLatToWorld } from '../geo/mercator.js'

export class Camera {
  constructor({ center = { lng: 10.75, lat: 59.91 }, zoom = 10, minZoom = 1, maxZoom = 19 } = {}) {
    this.center = { ...center }
    this.zoom = zoom
    this.minZoom = minZoom
    this.maxZoom = maxZoom
    this._animFrame = null
  }

  clampZoom(z) {
    return Math.max(this.minZoom, Math.min(this.maxZoom, z))
  }

  setCenter(lng, lat) {
    this.center = { lng, lat }
  }

  setZoom(z) {
    this.zoom = this.clampZoom(z)
  }

  flyTo({ center, zoom }, duration = 600, onUpdate, onDone) {
    if (this._animFrame) cancelAnimationFrame(this._animFrame)

    const startCenter = { ...this.center }
    const startZoom = this.zoom
    const endCenter = center || startCenter
    const endZoom = zoom !== undefined ? this.clampZoom(zoom) : startZoom
    const startTime = performance.now()

    const ease = t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t

    const step = (now) => {
      const t = Math.min(1, (now - startTime) / duration)
      const e = ease(t)
      this.center = {
        lng: startCenter.lng + (endCenter.lng - startCenter.lng) * e,
        lat: startCenter.lat + (endCenter.lat - startCenter.lat) * e
      }
      this.zoom = startZoom + (endZoom - startZoom) * e
      onUpdate()
      if (t < 1) {
        this._animFrame = requestAnimationFrame(step)
      } else {
        this._animFrame = null
        onDone?.()
      }
    }

    this._animFrame = requestAnimationFrame(step)
  }
}
