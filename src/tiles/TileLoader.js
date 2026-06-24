export class TileLoader {
  constructor(urlTemplate = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png') {
    this.urlTemplate = urlTemplate
    this.cache = new Map()
    this.loading = new Set()
  }

  url(x, y, z) {
    return this.urlTemplate
      .replace('{x}', x)
      .replace('{y}', y)
      .replace('{z}', z)
  }

  key(x, y, z) {
    return `${z}/${x}/${y}`
  }

  load(x, y, z, onLoad) {
    const k = this.key(x, y, z)
    if (this.cache.has(k)) {
      onLoad(this.cache.get(k))
      return
    }
    if (this.loading.has(k)) return
    this.loading.add(k)

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      this.cache.set(k, img)
      this.loading.delete(k)
      onLoad(img)
    }
    img.onerror = () => {
      this.loading.delete(k)
    }
    img.src = this.url(x, y, z)
  }

  get(x, y, z) {
    return this.cache.get(this.key(x, y, z)) || null
  }
}
