import { createSphere } from '../geo/sphere.js'
import { perspective, rotateX, rotateY, translate, multiply } from '../geo/mat4.js'
import { globeCameraDistance, GLOBE_FOV } from '../geo/globe.js'
import { TileStitcher } from '../tiles/TileStitcher.js'

// ── Globe ────────────────────────────────────────────────────────────────────

const GLOBE_VERT = `
attribute vec3 a_pos;
attribute vec2 a_uv;
uniform mat4 u_mvp;
uniform mat4 u_mv;
varying vec2 v_uv;
varying vec3 v_eye_normal;
void main() {
  gl_Position = u_mvp * vec4(a_pos, 1.0);
  v_uv = a_uv;
  v_eye_normal = mat3(u_mv) * a_pos;
}
`

const GLOBE_FRAG = `
precision mediump float;
uniform sampler2D u_tex;
varying vec2 v_uv;
varying vec3 v_eye_normal;
void main() {
  vec4 color = texture2D(u_tex, v_uv);
  // Lys fra kameraretningen: den synlige halvkulen er jevnt opplyst,
  // med en svak limb-mørkning mot kanten (gir 3D-følelse uten å bli mørk).
  float facing = max(0.0, dot(normalize(v_eye_normal), vec3(0.0, 0.0, 1.0)));
  float lit = 0.82 + 0.18 * facing;
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
  // Tynt skall like utenfor globen
  gl_Position = u_mvp * vec4(a_pos * 1.035, 1.0);
  vec3 eye = normalize(mat3(u_mv) * a_pos);
  v_rim = 1.0 - abs(eye.z);
}
`

const ATMO_FRAG = `
precision mediump float;
varying float v_rim;
void main() {
  // Høy potens → glødet konsentreres ved selve kanten (tynn halo, ikke vask)
  float glow = pow(v_rim, 3.5);
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
varying float v_bright;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float a = (1.0 - d * d) * v_bright;
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

function placeholder() {
  const c = document.createElement('canvas')
  c.width = c.height = 2
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#0c1320'
  ctx.fillRect(0, 0, 2, 2)
  return c
}

function generateStars(count = 2500) {
  const pos = [], bright = []
  for (let i = 0; i < count; i++) {
    // Avoid center (globe area) — sparse in middle, dense at edges
    let x, y
    do { x = Math.random() * 2 - 1; y = Math.random() * 2 - 1 } while (Math.random() < 0.3 && x * x + y * y < 0.25)
    pos.push(x, y)
    bright.push(Math.pow(Math.random(), 0.5))
  }
  return { pos: new Float32Array(pos), bright: new Float32Array(bright), count }
}

// ── GlobeRenderer ────────────────────────────────────────────────────────────

export class GlobeRenderer {
  constructor(canvas, camera, tileLoader) {
    this.canvas = canvas
    this.camera = camera
    this.stitcher = new TileStitcher(tileLoader)
    this._dirty = true
    this._active = true
    this._rafId = null
    this._texture = null

    const opts = { antialias: true, alpha: true, premultipliedAlpha: false }
    const gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts)
    if (!gl) throw new Error('WebGL ikke støttet')
    this.gl = gl

    // Anisotropisk filtrering gjør tiles skarpe på skrå (globekanten)
    this._aniso = gl.getExtension('EXT_texture_filter_anisotropic')
      || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic')
    this._maxAniso = this._aniso
      ? gl.getParameter(this._aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)
      : 1
    this._maxTexSize = gl.getParameter(gl.MAX_TEXTURE_SIZE)

    this._setupGlobe()
    this._setupAtmo()
    this._setupStars()

    gl.clearColor(0.015, 0.015, 0.04, 1)

    this._setTexture(placeholder())
    this._loadTiles(2)
  }

  _setupGlobe() {
    const gl = this.gl
    const prog = program(gl, GLOBE_VERT, GLOBE_FRAG)
    const { positions, uvs, indices } = createSphere(72, 144)

    const posBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf)
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)

    const uvBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf)
    gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW)

    const idxBuf = gl.createBuffer()
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW)

    this._globe = {
      prog, posBuf, uvBuf, idxBuf, count: indices.length,
      locs: {
        aPos: gl.getAttribLocation(prog, 'a_pos'),
        aUv:  gl.getAttribLocation(prog, 'a_uv'),
        uMvp: gl.getUniformLocation(prog, 'u_mvp'),
        uMv:  gl.getUniformLocation(prog, 'u_mv'),
        uTex: gl.getUniformLocation(prog, 'u_tex'),
      }
    }
  }

  _setupAtmo() {
    const gl = this.gl
    const prog = program(gl, ATMO_VERT, ATMO_FRAG)
    const g = this._globe
    this._atmo = {
      prog,
      locs: {
        aPos: gl.getAttribLocation(prog, 'a_pos'),
        uMvp: gl.getUniformLocation(prog, 'u_mvp'),
        uMv:  gl.getUniformLocation(prog, 'u_mv'),
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
        aPos:    gl.getAttribLocation(prog, 'a_pos'),
        aBright: gl.getAttribLocation(prog, 'a_bright'),
      }
    }
  }

  _setTexture(src) {
    const gl = this.gl
    if (this._texture) gl.deleteTexture(this._texture)
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    if (this._aniso) {
      gl.texParameterf(gl.TEXTURE_2D, this._aniso.TEXTURE_MAX_ANISOTROPY_EXT,
        Math.min(8, this._maxAniso))
    }
    this._texture = tex
    this._dirty = true
  }

  _loadTiles(zoom) {
    this.stitcher.stitch(zoom, (canvas) => {
      this._setTexture(canvas)
      // Oppgrader til skarpere nivå hvis neste tekstur får plass på GPU-en.
      const nextPx = Math.pow(2, zoom + 1) * 512
      if (zoom < 3 && nextPx <= this._maxTexSize) {
        setTimeout(() => this._loadTiles(zoom + 1), 600)
      }
    })
  }

  _matrices() {
    const { canvas, camera } = this
    const w = canvas.clientWidth || 1
    const h = canvas.clientHeight || 1
    const dist = globeCameraDistance(camera.zoom, h)
    const lng = camera.center.lng * Math.PI / 180
    const lat = camera.center.lat * Math.PI / 180
    const proj = perspective(GLOBE_FOV, w / h, 0.1, 10)
    const view = translate(0, 0, -dist)
    const model = multiply(rotateX(-lat), rotateY(lng + Math.PI / 2))
    const mv = multiply(view, model)
    const mvp = multiply(proj, mv)
    return { mvp, mv }
  }

  // Vinkelavstand (grader) mellom to geo-punkter.
  _angularDist(aLng, aLat, bLng, bLat) {
    const r = Math.PI / 180
    const dLat = (bLat - aLat) * r, dLng = (bLng - aLng) * r
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLng / 2) ** 2
    return 2 * Math.asin(Math.min(1, Math.sqrt(a))) * 180 / Math.PI
  }

  // Projiser geografisk punkt → skjermpiksel. `front` = på synlig halvkule
  // (innen 90° av senter), avgjort geografisk for å unngå matrise-tvetydighet.
  projectLngLat(lng, lat) {
    const { canvas } = this
    const w = canvas.clientWidth || 1
    const h = canvas.clientHeight || 1
    const { mvp } = this._matrices()
    const latR = lat * Math.PI / 180
    const lngR = lng * Math.PI / 180
    const p = [Math.cos(latR) * Math.cos(lngR), Math.sin(latR), Math.cos(latR) * Math.sin(lngR), 1]
    const c = [0, 0, 0, 0]
    for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) c[r] += mvp[k * 4 + r] * p[k]
    if (c[3] <= 0) return null
    const front = this._angularDist(this.camera.center.lng, this.camera.center.lat, lng, lat) < 90
    return { x: (c[0] / c[3] * 0.5 + 0.5) * w, y: (1 - (c[1] / c[3] * 0.5 + 0.5)) * h, front }
  }

  // Skjermpiksel → geografisk punkt på synlig halvkule. Søk via den verifiserte
  // projectLngLat (unngår invers-matrise-handedness), grov→fin rundt senter.
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
    let r = search(c.lng, c.lat, 178, 28)   // grovt over synlig halvkule
    if (!r) return null
    r = search(r.lng, r.lat, 14, 18)         // fin
    r = search(r.lng, r.lat, 1.6, 16)        // finere
    // utenfor kula hvis nærmeste treff fortsatt er langt unna cursor (> ~6px)
    if (r.d > 36) return null
    let lng = ((r.lng + 180) % 360 + 360) % 360 - 180
    return { lng, lat: r.lat }
  }

  _resize() {
    const { canvas, gl } = this
    const dpr = window.devicePixelRatio || 1
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

    // ── Stars (depth test off, alpha blend) ──────────────────────────────
    gl.disable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
    const st = this._stars
    gl.useProgram(st.prog)
    gl.bindBuffer(gl.ARRAY_BUFFER, st.posBuf)
    gl.enableVertexAttribArray(st.locs.aPos)
    gl.vertexAttribPointer(st.locs.aPos, 2, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ARRAY_BUFFER, st.brightBuf)
    gl.enableVertexAttribArray(st.locs.aBright)
    gl.vertexAttribPointer(st.locs.aBright, 1, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.POINTS, 0, st.count)

    // ── Globe (depth test on, no blend) ──────────────────────────────────
    gl.enable(gl.DEPTH_TEST)
    gl.disable(gl.BLEND)
    gl.enable(gl.CULL_FACE)
    gl.cullFace(gl.BACK)
    if (!this._texture) return
    const gb = this._globe
    gl.useProgram(gb.prog)
    gl.bindBuffer(gl.ARRAY_BUFFER, gb.posBuf)
    gl.enableVertexAttribArray(gb.locs.aPos)
    gl.vertexAttribPointer(gb.locs.aPos, 3, gl.FLOAT, false, 0, 0)
    gl.bindBuffer(gl.ARRAY_BUFFER, gb.uvBuf)
    gl.enableVertexAttribArray(gb.locs.aUv)
    gl.vertexAttribPointer(gb.locs.aUv, 2, gl.FLOAT, false, 0, 0)
    gl.uniformMatrix4fv(gb.locs.uMvp, false, mvp)
    gl.uniformMatrix4fv(gb.locs.uMv, false, mv)
    gl.uniform1i(gb.locs.uTex, 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this._texture)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gb.idxBuf)
    gl.drawElements(gl.TRIANGLES, gb.count, gl.UNSIGNED_SHORT, 0)

    // ── Atmosphere (depth test off, additiv glød) ─────────────────────────
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.CULL_FACE)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
    const at = this._atmo
    gl.useProgram(at.prog)
    gl.bindBuffer(gl.ARRAY_BUFFER, gb.posBuf)
    gl.enableVertexAttribArray(at.locs.aPos)
    gl.vertexAttribPointer(at.locs.aPos, 3, gl.FLOAT, false, 0, 0)
    gl.uniformMatrix4fv(at.locs.uMvp, false, mvp)
    gl.uniformMatrix4fv(at.locs.uMv, false, mv)
    gl.drawElements(gl.TRIANGLES, gb.count, gl.UNSIGNED_SHORT, 0)

    gl.disable(gl.BLEND)
    gl.enable(gl.DEPTH_TEST)
  }

  start() {
    const loop = () => { this._render(); this._rafId = requestAnimationFrame(loop) }
    this._rafId = requestAnimationFrame(loop)
  }

  stop() { if (this._rafId) cancelAnimationFrame(this._rafId) }
  markDirty() { this._dirty = true }
  setActive(on) {
    if (on && !this._active) this._dirty = true
    this._active = on
  }
}
