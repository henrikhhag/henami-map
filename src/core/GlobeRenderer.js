import { createSphere } from '../geo/sphere.js'
import { perspective, rotateX, rotateY, translate, multiply } from '../geo/mat4.js'
import { globeView } from '../geo/globe.js'
import { lngLatToWorld } from '../geo/mercator.js'

// ── Tile-patch (krummet kart-flekk på kula) ──────────────────────────────────

const TILE_VERT = `
attribute vec2 a_grid;        // 0..1 innenfor tilen
uniform mat4 u_mvp;
uniform mat4 u_mv;
uniform vec2 u_world0;        // mercator world (x,y) i [0,1] for nord-vest-hjørnet
uniform vec2 u_world1;        // sør-øst-hjørnet
uniform vec2 u_uvOffset;      // sub-rect i (forelder-)tekstur
uniform float u_uvScale;
varying vec2 v_uv;
varying vec3 v_normal;
const float PI = 3.141592653589793;
void main() {
  float wx = mix(u_world0.x, u_world1.x, a_grid.x);
  float wy = mix(u_world0.y, u_world1.y, a_grid.y);
  float lng = wx * 2.0 * PI - PI;
  float lat = 2.0 * atan(exp((1.0 - 2.0 * wy) * PI)) - PI * 0.5; // invers mercator
  vec3 p = vec3(cos(lat) * sin(lng), sin(lat), cos(lat) * cos(lng));
  gl_Position = u_mvp * vec4(p, 1.0);
  v_uv = a_grid * u_uvScale + u_uvOffset;
  v_normal = mat3(u_mv) * p;
}
`

const TILE_FRAG = `
precision mediump float;
uniform sampler2D u_tex;
varying vec2 v_uv;
varying vec3 v_normal;
void main() {
  vec4 color = texture2D(u_tex, v_uv);
  float facing = max(0.0, dot(normalize(v_normal), vec3(0.0, 0.0, 1.0)));
  float lit = 0.85 + 0.15 * facing;
  gl_FragColor = vec4(color.rgb * lit, 1.0);
}
`

// ── Atmosphere ───────────────────────────────────────────────────────────────

const ATMO_VERT = `
attribute vec3 a_pos;
uniform mat4 u_mvp;
uniform mat4 u_mv;
varying float v_rim;
void main() {
  gl_Position = u_mvp * vec4(a_pos * 1.035, 1.0);
  vec3 eye = normalize(mat3(u_mv) * a_pos);
  v_rim = 1.0 - abs(eye.z);
}
`

const ATMO_FRAG = `
precision mediump float;
uniform float u_fade;
varying float v_rim;
void main() {
  float glow = pow(v_rim, 3.5) * u_fade;
  vec3 color = mix(vec3(0.35, 0.55, 0.95), vec3(0.55, 0.75, 1.0), glow);
  gl_FragColor = vec4(color * glow, glow);
}
`

// ── Stars ────────────────────────────────────────────────────────────────────

const STAR_VERT = `
attribute vec2 a_pos;
attribute float a_bright;
varying float v_bright;
void main() {
  gl_Position = vec4(a_pos, 0.999, 1.0);
  gl_PointSize = a_bright * 2.2 + 0.8;
  v_bright = a_bright;
}
`

const STAR_FRAG = `
precision mediump float;
uniform float u_fade;
varying float v_bright;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float a = (1.0 - d * d) * v_bright * u_fade;
  gl_FragColor = vec4(0.88, 0.93, 1.0, a);
}
`

// ── Helpers ──────────────────────────────────────────────────────────────────

function compile(gl, type, src) {
  const s = gl.createShader(type)
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error('Shader: ' + gl.getShaderInfoLog(s))
  return s
}

function program(gl, vert, frag) {
  const p = gl.createProgram()
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vert))
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, frag))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(p))
  return p
}

function generateStars(count = 2500) {
  const pos = [], bright = []
  for (let i = 0; i < count; i++) {
    let x, y
    do { x = Math.random() * 2 - 1; y = Math.random() * 2 - 1 } while (Math.random() < 0.3 && x * x + y * y < 0.25)
    pos.push(x, y)
    bright.push(Math.pow(Math.random(), 0.5))
  }
  return { pos: new Float32Array(pos), bright: new Float32Array(bright), count }
}

// Et N×N rutenett (a_grid i [0,1]²) gjenbrukt for hver tile-flekk.
function createGrid(n) {
  const pos = [], idx = []
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++)
      pos.push(i / n, j / n)
  const row = n + 1
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const a = j * row + i, b = a + row
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  return { pos: new Float32Array(pos), idx: new Uint16Array(idx), count: idx.length }
}

const MAX_TILE_Z = 16

// ── GlobeRenderer ────────────────────────────────────────────────────────────

export class GlobeRenderer {
  constructor(canvas, camera, tileLoader) {
    this.canvas = canvas
    this.camera = camera
    this.tileLoader = tileLoader
    this._dirty = true
    this._active = true
    this._rafId = null
    this._texCache = new Map()   // "z/x/y" → WebGLTexture

    const opts = { antialias: true, alpha: true, premultipliedAlpha: false }
    const gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts)
    if (!gl) throw new Error('WebGL ikke støttet')
    this.gl = gl

    this._aniso = gl.getExtension('EXT_texture_filter_anisotropic')
      || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic')
    this._maxAniso = this._aniso ? gl.getParameter(this._aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 1

    this._setupTiles()
    this._setupAtmo()
    this._setupStars()

    gl.clearColor(0.015, 0.015, 0.04, 1)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)

    // Forhåndslast grovt basislag (zoom 0–2) så det alltid finnes et fallback.
    for (let z = 0; z <= 2; z++)
      for (let x = 0; x < (1 << z); x++)
        for (let y = 0; y < (1 << z); y++)
          this._loadTile(x, y, z)
  }

  _setupTiles() {
    const gl = this.gl
    const prog = program(gl, TILE_VERT, TILE_FRAG)
    const grid = createGrid(12)

    const gridBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, gridBuf)
    gl.bufferData(gl.ARRAY_BUFFER, grid.pos, gl.STATIC_DRAW)

    const idxBuf = gl.createBuffer()
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, grid.idx, gl.STATIC_DRAW)

    this._tile = {
      prog, gridBuf, idxBuf, count: grid.count,
      locs: {
        aGrid: gl.getAttribLocation(prog, 'a_grid'),
        uMvp: gl.getUniformLocation(prog, 'u_mvp'),
        uMv: gl.getUniformLocation(prog, 'u_mv'),
        uWorld0: gl.getUniformLocation(prog, 'u_world0'),
        uWorld1: gl.getUniformLocation(prog, 'u_world1'),
        uUvOffset: gl.getUniformLocation(prog, 'u_uvOffset'),
        uUvScale: gl.getUniformLocation(prog, 'u_uvScale'),
        uTex: gl.getUniformLocation(prog, 'u_tex'),
      }
    }
  }

  _setupAtmo() {
    const gl = this.gl
    const prog = program(gl, ATMO_VERT, ATMO_FRAG)
    const { positions, indices } = createSphere(32, 64)
    const posBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf)
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)
    const idxBuf = gl.createBuffer()
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW)
    this._atmo = {
      prog, posBuf, idxBuf, count: indices.length,
      locs: {
        aPos: gl.getAttribLocation(prog, 'a_pos'),
        uMvp: gl.getUniformLocation(prog, 'u_mvp'),
        uMv: gl.getUniformLocation(prog, 'u_mv'),
        uFade: gl.getUniformLocation(prog, 'u_fade'),
      }
    }
  }

  _setupStars() {
    const gl = this.gl
    const prog = program(gl, STAR_VERT, STAR_FRAG)
    const { pos, bright, count } = generateStars(2500)
    const posBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf)
    gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW)
    const brightBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, brightBuf)
    gl.bufferData(gl.ARRAY_BUFFER, bright, gl.STATIC_DRAW)
    this._stars = {
      prog, posBuf, brightBuf, count,
      locs: {
        aPos: gl.getAttribLocation(prog, 'a_pos'),
        aBright: gl.getAttribLocation(prog, 'a_bright'),
        uFade: gl.getUniformLocation(prog, 'u_fade'),
      }
    }
  }

  // ── Tile-teksturer ──────────────────────────────────────────────────────────

  _makeTex(img) {
    const gl = this.gl
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    if (this._aniso) gl.texParameterf(gl.TEXTURE_2D, this._aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(4, this._maxAniso))
    return tex
  }

  // Hent GL-tekstur for en tile (laster ved behov). Null hvis ikke klar ennå.
  _loadTile(x, y, z) {
    const key = z + '/' + x + '/' + y
    const cached = this._texCache.get(key)
    if (cached !== undefined) return cached            // tex eller null (laster)
    const img = this.tileLoader.get(x, y, z)
    if (img) { const t = this._makeTex(img); this._texCache.set(key, t); return t }
    this._texCache.set(key, null)
    this.tileLoader.load(x, y, z, (loaded) => {
      this._texCache.set(key, this._makeTex(loaded))
      this._dirty = true
    })
    return null
  }

  // Egen tekstur, ellers nærmeste lastede forelder (med UV-sub-rect).
  _resolveTile(x, y, z) {
    const own = this._loadTile(x, y, z)
    if (own) return { tex: own, scale: 1, offX: 0, offY: 0 }
    for (let k = 1; z - k >= 0; k++) {
      const ax = x >> k, ay = y >> k, az = z - k
      const key = az + '/' + ax + '/' + ay
      let tex = this._texCache.get(key)
      if (tex === undefined) tex = this._loadTile(ax, ay, az)
      if (tex) {
        const m = 1 << k
        return { tex, scale: 1 / m, offX: (x % m) / m, offY: (y % m) / m }
      }
    }
    return null
  }

  // ── Synlige tiles ────────────────────────────────────────────────────────────

  _tileZoom() {
    return Math.max(0, Math.min(MAX_TILE_Z, Math.round(this.camera.zoom)))
  }

  // Vinkel-radius (rad) av synlig flate i en gitt retning (FOV-halvvinkel beta).
  // Tar hensyn til at innsnevret FOV ved dyp zoom gir liten synlig flekk.
  _visibleAngle(beta, dist) {
    const cb = Math.cos(beta)
    const disc = dist * dist * cb * cb - (dist * dist - 1)
    if (disc < 0) return Math.acos(Math.max(-1, Math.min(1, 1 / dist))) // limb (ser space)
    const t = dist * cb - Math.sqrt(disc)
    const pz = dist - t * cb
    return Math.acos(Math.max(-1, Math.min(1, pz)))
  }

  _visibleTiles() {
    const w = this.canvas.clientWidth || 1
    const h = this.canvas.clientHeight || 1
    const { dist, fov } = globeView(this.camera.zoom, h)
    // Diagonal FOV-halvvinkel = skjermhjørnene → dekker hele den synlige disken.
    const tv = Math.tan(fov / 2)
    const th = tv * (w / h)
    const fovDiagHalf = Math.atan(Math.sqrt(tv * tv + th * th))
    const cap = this._visibleAngle(fovDiagHalf, dist) * 180 / Math.PI * 1.1
    const c = this.camera.center
    const z = this._tileZoom()
    const n = 1 << z

    const latMax = Math.min(85, c.lat + cap)
    const latMin = Math.max(-85, c.lat - cap)
    const lngHalf = Math.min(180, cap / Math.max(0.15, Math.cos(c.lat * Math.PI / 180)))

    const wTop = lngLatToWorld(0, latMax).y
    const wBot = lngLatToWorld(0, latMin).y
    let tyMin = Math.max(0, Math.floor(wTop * n))
    let tyMax = Math.min(n - 1, Math.floor(wBot * n))

    const wxMin = (c.lng - lngHalf + 180) / 360
    const wxMax = (c.lng + lngHalf + 180) / 360
    const txMin = Math.floor(wxMin * n)
    const txMax = Math.floor(wxMax * n)

    const tiles = []
    for (let ty = tyMin; ty <= tyMax; ty++) {
      // Strekk øverste/nederste rad mot polene (mercator dekker bare ±85°),
      // så polkappene fylles i stedet for å vise et svart hull.
      const w0y = ty === 0 ? -0.8 : ty / n
      const w1y = ty === n - 1 ? 1.8 : (ty + 1) / n
      for (let tx = txMin; tx <= txMax; tx++) {
        const wrapped = ((tx % n) + n) % n
        tiles.push({ x: wrapped, y: ty, z, w0x: tx / n, w0y, w1x: (tx + 1) / n, w1y })
      }
    }
    return tiles
  }

  // ── Matriser / projeksjon ────────────────────────────────────────────────────

  _matrices() {
    const { canvas, camera } = this
    const w = canvas.clientWidth || 1
    const h = canvas.clientHeight || 1
    const { dist, fov } = globeView(camera.zoom, h)
    const lng = camera.center.lng * Math.PI / 180
    const lat = camera.center.lat * Math.PI / 180
    const proj = perspective(fov, w / h, 0.1, 10)
    const view = translate(0, 0, -dist)
    // Senter → kulas forside (0,0,1): zoom virker, øst→høyre, nord→opp.
    const model = multiply(rotateX(lat), rotateY(-lng))
    const mv = multiply(view, model)
    const mvp = multiply(proj, mv)
    return { mvp, mv }
  }

  _angularDist(aLng, aLat, bLng, bLat) {
    const r = Math.PI / 180
    const dLat = (bLat - aLat) * r, dLng = (bLng - aLng) * r
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLng / 2) ** 2
    return 2 * Math.asin(Math.min(1, Math.sqrt(a))) * 180 / Math.PI
  }

  projectLngLat(lng, lat) {
    const w = this.canvas.clientWidth || 1
    const h = this.canvas.clientHeight || 1
    const { mvp } = this._matrices()
    const latR = lat * Math.PI / 180, lngR = lng * Math.PI / 180
    const p = [Math.cos(latR) * Math.sin(lngR), Math.sin(latR), Math.cos(latR) * Math.cos(lngR), 1]
    const c = [0, 0, 0, 0]
    for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) c[r] += mvp[k * 4 + r] * p[k]
    if (c[3] <= 0) return null
    const front = this._angularDist(this.camera.center.lng, this.camera.center.lat, lng, lat) < 90
    return { x: (c[0] / c[3] * 0.5 + 0.5) * w, y: (1 - (c[1] / c[3] * 0.5 + 0.5)) * h, front }
  }

  unprojectToLngLat(px, py) {
    const c = this.camera.center
    const search = (lng0, lat0, span, n) => {
      let best = null
      for (let i = 0; i <= n; i++) {
        for (let j = 0; j <= n; j++) {
          const lng = lng0 + (i / n - 0.5) * span
          const lat = Math.max(-89, Math.min(89, lat0 + (j / n - 0.5) * span))
          const p = this.projectLngLat(lng, lat)
          if (!p || !p.front) continue
          const d = (p.x - px) ** 2 + (p.y - py) ** 2
          if (!best || d < best.d) best = { lng, lat, d }
        }
      }
      return best
    }
    let r = search(c.lng, c.lat, 178, 28)
    if (!r) return null
    r = search(r.lng, r.lat, 14, 18)
    r = search(r.lng, r.lat, 1.6, 16)
    if (r.d > 36) return null
    let lng = ((r.lng + 180) % 360 + 360) % 360 - 180
    return { lng, lat: r.lat }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  _resize() {
    const { canvas, gl } = this
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = Math.round(canvas.clientWidth * dpr)
    const h = Math.round(canvas.clientHeight * dpr)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      gl.viewport(0, 0, w, h)
      this._dirty = true
    }
  }

  _render() {
    if (!this._active) return
    this._resize()
    if (!this._dirty) return
    this._dirty = false

    const gl = this.gl
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    const { mvp, mv } = this._matrices()
    const fade = 1 - Math.max(0, Math.min(1, (this.camera.zoom - 3.0) / 2.0)) // atmosfære/stjerner toner ut ved innzoom

    // ── Stjerner ────────────────────────────────────────────────────────
    if (fade > 0.01) {
      gl.disable(gl.DEPTH_TEST)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
      const st = this._stars
      gl.useProgram(st.prog)
      gl.uniform1f(st.locs.uFade, fade)
      gl.bindBuffer(gl.ARRAY_BUFFER, st.posBuf)
      gl.enableVertexAttribArray(st.locs.aPos)
      gl.vertexAttribPointer(st.locs.aPos, 2, gl.FLOAT, false, 0, 0)
      gl.bindBuffer(gl.ARRAY_BUFFER, st.brightBuf)
      gl.enableVertexAttribArray(st.locs.aBright)
      gl.vertexAttribPointer(st.locs.aBright, 1, gl.FLOAT, false, 0, 0)
      gl.drawArrays(gl.POINTS, 0, st.count)
    }

    // ── Tile-flekker (selve globen) ─────────────────────────────────────
    gl.enable(gl.DEPTH_TEST)
    gl.disable(gl.BLEND)
    gl.enable(gl.CULL_FACE)
    gl.cullFace(gl.BACK)
    const tp = this._tile
    gl.useProgram(tp.prog)
    gl.uniformMatrix4fv(tp.locs.uMvp, false, mvp)
    gl.uniformMatrix4fv(tp.locs.uMv, false, mv)
    gl.uniform1i(tp.locs.uTex, 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindBuffer(gl.ARRAY_BUFFER, tp.gridBuf)
    gl.enableVertexAttribArray(tp.locs.aGrid)
    gl.vertexAttribPointer(tp.locs.aGrid, 2, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, tp.idxBuf)

    for (const t of this._visibleTiles()) {
      const r = this._resolveTile(t.x, t.y, t.z)
      if (!r) continue
      gl.uniform2f(tp.locs.uWorld0, t.w0x, t.w0y)
      gl.uniform2f(tp.locs.uWorld1, t.w1x, t.w1y)
      gl.uniform2f(tp.locs.uUvOffset, r.offX, r.offY)
      gl.uniform1f(tp.locs.uUvScale, r.scale)
      gl.bindTexture(gl.TEXTURE_2D, r.tex)
      gl.drawElements(gl.TRIANGLES, tp.count, gl.UNSIGNED_SHORT, 0)
    }

    // ── Atmosfære ───────────────────────────────────────────────────────
    if (fade > 0.01) {
      gl.disable(gl.DEPTH_TEST)
      gl.disable(gl.CULL_FACE)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
      const at = this._atmo
      gl.useProgram(at.prog)
      gl.uniform1f(at.locs.uFade, fade)
      gl.bindBuffer(gl.ARRAY_BUFFER, at.posBuf)
      gl.enableVertexAttribArray(at.locs.aPos)
      gl.vertexAttribPointer(at.locs.aPos, 3, gl.FLOAT, false, 0, 0)
      gl.uniformMatrix4fv(at.locs.uMvp, false, mvp)
      gl.uniformMatrix4fv(at.locs.uMv, false, mv)
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, at.idxBuf)
      gl.drawElements(gl.TRIANGLES, at.count, gl.UNSIGNED_SHORT, 0)
    }

    gl.disable(gl.BLEND)
    gl.enable(gl.DEPTH_TEST)
  }

  start() {
    const loop = () => { this._render(); this._rafId = requestAnimationFrame(loop) }
    this._rafId = requestAnimationFrame(loop)
  }

  stop() { if (this._rafId) cancelAnimationFrame(this._rafId) }
  markDirty() { this._dirty = true }
  setActive(on) { if (on && !this._active) this._dirty = true; this._active = on }
}
