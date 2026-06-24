export class TileStitcher {
  constructor(tileLoader) {
    this.loader = tileLoader
    this.cache = new Map()
  }

  stitch(zoom, onComplete) {
    const key = `z${zoom}`
    if (this.cache.has(key)) { onComplete(this.cache.get(key)); return }

    const n = Math.pow(2, zoom)
    const size = n * 256
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')

    let loaded = 0
    const total = n * n

    for (let ty = 0; ty < n; ty++) {
      for (let tx = 0; tx < n; tx++) {
        const cx = tx * 256, cy = ty * 256
        this.loader.load(tx, ty, zoom, (img) => {
          ctx.drawImage(img, cx, cy)
          if (++loaded === total) {
            this.cache.set(key, canvas)
            onComplete(canvas)
          }
        })
      }
    }
  }
}
