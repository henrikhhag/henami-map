const PI = Math.PI

export function lngLatToWorld(lng, lat) {
  const x = (lng + 180) / 360
  const sinLat = Math.sin((lat * PI) / 180)
  const y = 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * PI)
  return { x, y }
}

export function worldToLngLat(x, y) {
  const lng = x * 360 - 180
  const n = PI - 2 * PI * y
  const lat = (180 / PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
  return { lng, lat }
}

export function worldToPixel(worldX, worldY, zoom, canvasW, canvasH, centerWorld) {
  const scale = Math.pow(2, zoom) * 256
  const px = (worldX - centerWorld.x) * scale + canvasW / 2
  const py = (worldY - centerWorld.y) * scale + canvasH / 2
  return { px, py }
}

export function pixelToWorld(px, py, zoom, canvasW, canvasH, centerWorld) {
  const scale = Math.pow(2, zoom) * 256
  const x = (px - canvasW / 2) / scale + centerWorld.x
  const y = (py - canvasH / 2) / scale + centerWorld.y
  return { x, y }
}

export function tileToWorld(tileX, tileY, tileZ) {
  const n = Math.pow(2, tileZ)
  return { x: tileX / n, y: tileY / n }
}
