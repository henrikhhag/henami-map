export function createSphere(latSegs = 64, lngSegs = 128) {
  const positions = []
  const uvs = []
  const indices = []

  for (let lat = 0; lat <= latSegs; lat++) {
    const v = lat / latSegs
    // Invert Mercator: uniform distribution in tile-space → correct lat
    const latRad = 2 * Math.atan(Math.exp((1 - 2 * v) * Math.PI)) - Math.PI / 2
    const cosLat = Math.cos(latRad)
    const sinLat = Math.sin(latRad)

    for (let lng = 0; lng <= lngSegs; lng++) {
      const u = lng / lngSegs
      const lngRad = -Math.PI + u * 2 * Math.PI
      positions.push(cosLat * Math.cos(lngRad), sinLat, cosLat * Math.sin(lngRad))
      uvs.push(u, v)
    }
  }

  for (let lat = 0; lat < latSegs; lat++) {
    for (let lng = 0; lng < lngSegs; lng++) {
      const a = lat * (lngSegs + 1) + lng
      const b = a + lngSegs + 1
      indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }

  return {
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    indices: new Uint16Array(indices)
  }
}
