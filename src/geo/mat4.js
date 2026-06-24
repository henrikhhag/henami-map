export const identity = () => {
  const m = new Float32Array(16)
  m[0] = m[5] = m[10] = m[15] = 1
  return m
}

export const perspective = (fovY, aspect, near, far) => {
  const f = 1 / Math.tan(fovY / 2)
  const d = near - far
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / d, -1,
    0, 0, (2 * far * near) / d, 0
  ])
}

export const rotateY = (a) => {
  const c = Math.cos(a), s = Math.sin(a)
  return new Float32Array([c, 0, -s, 0,  0, 1, 0, 0,  s, 0, c, 0,  0, 0, 0, 1])
}

export const rotateX = (a) => {
  const c = Math.cos(a), s = Math.sin(a)
  return new Float32Array([1, 0, 0, 0,  0, c, s, 0,  0, -s, c, 0,  0, 0, 0, 1])
}

export const translate = (x, y, z) =>
  new Float32Array([1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  x, y, z, 1])

export const multiply = (a, b) => {
  const m = new Float32Array(16)
  for (let col = 0; col < 4; col++)
    for (let row = 0; row < 4; row++) {
      let s = 0
      for (let k = 0; k < 4; k++) s += a[k * 4 + row] * b[col * 4 + k]
      m[col * 4 + row] = s
    }
  return m
}
