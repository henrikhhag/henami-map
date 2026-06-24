import { lngLatToWorld, worldToLngLat, pixelToWorld, tileToWorld, worldToPixel } from '../geo/mercator.js'

export function getVisibleTiles(center, zoom, canvasW, canvasH) {
  const tileZ = Math.floor(zoom)
  const n = Math.pow(2, tileZ)
  const centerWorld = lngLatToWorld(center.lng, center.lat)

  const tileSize = 256
  const scale = Math.pow(2, zoom) * tileSize

  const tilesX = Math.ceil(canvasW / tileSize) + 2
  const tilesY = Math.ceil(canvasH / tileSize) + 2

  const centerTileX = centerWorld.x * n
  const centerTileY = centerWorld.y * n

  const tiles = []

  const startX = Math.floor(centerTileX - tilesX / 2)
  const startY = Math.floor(centerTileY - tilesY / 2)

  for (let dy = 0; dy <= tilesY; dy++) {
    for (let dx = 0; dx <= tilesX; dx++) {
      const tx = startX + dx
      const ty = startY + dy

      if (ty < 0 || ty >= n) continue
      const wrappedTx = ((tx % n) + n) % n

      const worldX = tx / n
      const worldY = ty / n
      const { px, py } = worldToPixel(worldX, worldY, zoom, canvasW, canvasH, centerWorld)

      tiles.push({ x: wrappedTx, y: ty, z: tileZ, px, py })
    }
  }

  return tiles
}
