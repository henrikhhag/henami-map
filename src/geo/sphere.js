export function createSphere(latSegs = 64, lngSegs = 128) {
  const positions = []
  const uvs = []
  const indices = []
  const ring = lngSegs + 1

  // Hoved-rader: Mercator-breddegrader fra +85° (v=0) til -85° (v=1)
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
      const a = lat * ring + lng
      const b = a + ring
      indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }

  // Polkapper: Mercator dekker bare ±85°, så vi lukker hullene mot ±90°.
  // Kappene strekker øverste/nederste teksturrad ut til selve polen.
  const northRing = 0
  const northPole = positions.length / 3
  positions.push(0, 1, 0)
  uvs.push(0.5, 0)
  for (let lng = 0; lng < lngSegs; lng++) {
    const a = northRing + lng
    indices.push(northPole, a, a + 1)
  }

  const southRing = latSegs * ring
  const southPole = positions.length / 3
  positions.push(0, -1, 0)
  uvs.push(0.5, 1)
  for (let lng = 0; lng < lngSegs; lng++) {
    const a = southRing + lng
    indices.push(southPole, a + 1, a)
  }

  return {
    positions: new Float32Array(positions),
    uvs: new Float32Array(uvs),
    indices: new Uint16Array(indices)
  }
}
