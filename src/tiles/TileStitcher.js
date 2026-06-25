// Syr sammen alle tiles på ett zoom-nivå til én stor tekstur for globen.
// Hver tile tegnes inn i et fast TILE_PX-slot, så det funker uansett om
// kilden er 256px eller 512px (@2x retina).
const TILE_PX = 512

export class TileStitcher {
  constructor(tileLoader) {
    this.loader = tileLoader
    this.cache = new Map()
  }

  stitch(zoom, onComplete) {
    const key = `z${zoom}`
    if (this.cache.has(key)) { onComplete(this.cache.get(key)); return }

    const n = Math.pow(2, zoom)
    const size = n * TILE_PX
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')

    let loaded = 0
    const total = n * n

    for (let ty = 0; ty < n; ty++) {
      for (let tx = 0; tx < n; tx++) {
        const cx = tx * TILE_PX, cy = ty * TILE_PX
        this.loader.load(tx, ty, zoom, (img) => {
          ctx.drawImage(img, cx, cy, TILE_PX, TILE_PX)
          if (++loaded === total) {
            this.cache.set(key, canvas)
            onComplete(canvas)
          }
        })
      }
    }
  }
}
