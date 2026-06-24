import { createSphere } from '../geo/sphere.js'
import { perspective, rotateX, rotateY, translate, multiply } from '../geo/mat4.js'
import { TileStitcher } from '../tiles/TileStitcher.js'

const VERT = `
attribute vec3 a_pos;
attribute vec2 a_uv;
uniform mat4 u_mvp;
varying vec2 v_uv;
varying vec3 v_normal;
void main() {
  gl_Position = u_mvp * vec4(a_pos, 1.0);
  v_uv = a_uv;
  v_normal = a_pos;
}
`

const FRAG = `
precision mediump float;
uniform sampler2D u_tex;
uniform vec3 u_light;
varying vec2 v_uv;
varying vec3 v_normal;
void main() {
  vec4 color = texture2D(u_tex, v_uv);
  vec3 n = normalize(v_normal);
  vec3 l = normalize(u_light);
  float diffuse = max(0.25, dot(n, l));
  float rim = 1.0 - max(0.0, dot(n, vec3(0.0, 0.0, 1.0)));
  vec3 atmo = vec3(0.3, 0.5, 1.0) * pow(rim, 3.0) * 0.4;
  gl_FragColor = vec4(color.rgb * diffuse + atmo, color.a);
}
`

function compileShader(gl, type, src) {
  const s = gl.createShader(type)
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    throw new Error('Shader: ' + gl.getShaderInfoLog(s))
  return s
}

function placeholder() {
  const c = document.createElement('canvas')
  c.width = c.height = 2
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#3a7ab5'
  ctx.fillRect(0, 0, 2, 2)
  return c
}

export class GlobeRenderer {
  constructor(canvas, camera, tileLoader) {
    this.canvas = canvas
    this.camera = camera
    this.stitcher = new TileStitcher(tileLoader)
    this._dirty = true
    this._rafId = null
    this._texture = null

    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    if (!gl) throw new Error('WebGL ikke støttet')
    this.gl = gl

    this._setupProgram()
    this._setupGeometry()

    gl.enable(gl.DEPTH_TEST)
    gl.enable(gl.CULL_FACE)
    gl.cullFace(gl.BACK)
    gl.clearColor(0.02, 0.02, 0.06, 1)

    this._setTexture(placeholder())
    this._loadTiles(2)
  }

  _setupProgram() {
    const gl = this.gl
    const prog = gl.createProgram()
    gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(prog))
    this.prog = prog
    this.locs = {
      aPos: gl.getAttribLocation(prog, 'a_pos'),
      aUv: gl.getAttribLocation(prog, 'a_uv'),
      uMvp: gl.getUniformLocation(prog, 'u_mvp'),
      uTex: gl.getUniformLocation(prog, 'u_tex'),
      uLight: gl.getUniformLocation(prog, 'u_light'),
    }
  }

  _setupGeometry() {
    const gl = this.gl
    const { positions, uvs, indices } = createSphere(64, 128)

    this.posBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf)
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)

    this.uvBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuf)
    gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW)

    this.idxBuf = gl.createBuffer()
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW)

    this.indexCount = indices.length
  }

  _setTexture(imgOrCanvas) {
    const gl = this.gl
    if (this._texture) gl.deleteTexture(this._texture)
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgOrCanvas)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    this._texture = tex
    this._dirty = true
  }

  _loadTiles(zoom) {
    this.stitcher.stitch(zoom, (canvas) => {
      this._setTexture(canvas)
      if (zoom < 3) setTimeout(() => this._loadTiles(3), 500)
    })
  }

  _getMVP() {
    const { canvas, camera } = this
    const w = canvas.clientWidth || 1
    const h = canvas.clientHeight || 1
    const dist = 1.12 + 2.2 * Math.exp(-0.65 * camera.zoom)
    const lng = camera.center.lng * Math.PI / 180
    const lat = camera.center.lat * Math.PI / 180
    const proj = perspective(40 * Math.PI / 180, w / h, 0.1, 10)
    const view = translate(0, 0, -dist)
    const model = multiply(rotateX(-lat), rotateY(-lng))
    return multiply(proj, multiply(view, model))
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
    this._resize()
    if (!this._dirty) return
    this._dirty = false

    const gl = this.gl
    const { locs } = this

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    if (!this._texture) return

    gl.useProgram(this.prog)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf)
    gl.enableVertexAttribArray(locs.aPos)
    gl.vertexAttribPointer(locs.aPos, 3, gl.FLOAT, false, 0, 0)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuf)
    gl.enableVertexAttribArray(locs.aUv)
    gl.vertexAttribPointer(locs.aUv, 2, gl.FLOAT, false, 0, 0)

    gl.uniformMatrix4fv(locs.uMvp, false, this._getMVP())
    gl.uniform1i(locs.uTex, 0)
    gl.uniform3f(locs.uLight, 1.2, 0.8, 1.5)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this._texture)

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf)
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0)
  }

  start() {
    const loop = () => { this._render(); this._rafId = requestAnimationFrame(loop) }
    this._rafId = requestAnimationFrame(loop)
  }

  stop() { if (this._rafId) cancelAnimationFrame(this._rafId) }
  markDirty() { this._dirty = true }
}
