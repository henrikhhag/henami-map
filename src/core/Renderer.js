import { getVisibleTiles } from '../tiles/TileGrid.js'
import { worldToPixel, lngLatToWorld } from '../geo/mercator.js'

const TILE_SIZE = 256

export class Renderer {
  constructor(canvas, camera, tileLoader) {
    this.canvas = canvas
    this.camera = camera
    this.tileLoader = tileLoader
    this.ctx = canvas.getContext('2d')
    this._markers = []
    this._rafId = null
    this._dirty = true
  }

  markDirty() {
    this._dirty = true
  }

  addMarker(marker) {
    this._markers.push(marker)
  }

  removeMarker(marker) {
    this._markers = this._markers.filter(m => m !== marker)
  }

  _resize() {
    const { canvas } = this
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr
      canvas.height = h * dpr
      this.ctx.scale(dpr, dpr)
      this._dirty = true
    }
  }

  _render() {
    this._resize()
    if (!this._dirty) return
    this._dirty = false

    const { ctx, canvas, camera, tileLoader } = this
    const w = canvas.clientWidth
    const h = canvas.clientHeight

    ctx.clearRect(0, 0, w, h)

    const tiles = getVisibleTiles(camera.center, camera.zoom, w, h)
    const centerWorld = lngLatToWorld(camera.center.lng, camera.center.lat)
    const tileZ = Math.floor(camera.zoom)
    const scale = Math.pow(2, camera.zoom) * TILE_SIZE
    const renderSize = scale / Math.pow(2, tileZ)

    for (const tile of tiles) {
      const img = tileLoader.get(tile.x, tile.y, tile.z)
      if (img) {
        ctx.drawImage(img, Math.round(tile.px), Math.round(tile.py), Math.ceil(renderSize), Math.ceil(renderSize))
      } else {
        ctx.fillStyle = '#e8e8e8'
        ctx.fillRect(Math.round(tile.px), Math.round(tile.py), Math.ceil(renderSize), Math.ceil(renderSize))
        tileLoader.load(tile.x, tile.y, tile.z, () => { this._dirty = true })
      }
    }

    for (const marker of this._markers) {
      const world = lngLatToWorld(marker.lng, marker.lat)
      const { px, py } = worldToPixel(world.x, world.y, camera.zoom, w, h, centerWorld)
      marker.draw(ctx, px, py)
    }
  }

  start() {
    const loop = () => {
      this._render()
      this._rafId = requestAnimationFrame(loop)
    }
    this._rafId = requestAnimationFrame(loop)
  }

  stop() {
    if (this._rafId) cancelAnimationFrame(this._rafId)
  }
}
