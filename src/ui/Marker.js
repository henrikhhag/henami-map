export class Marker {
  constructor({ lng, lat, color = '#e74c3c', size = 12, label = '' } = {}) {
    this.lng = lng
    this.lat = lat
    this.color = color
    this.size = size
    this.label = label
  }

  draw(ctx, px, py) {
    const r = this.size

    ctx.beginPath()
    ctx.arc(px, py - r, r, 0, Math.PI * 2)
    ctx.fillStyle = this.color
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(px, py)
    ctx.lineTo(px - r * 0.5, py - r)
    ctx.lineTo(px + r * 0.5, py - r)
    ctx.closePath()
    ctx.fillStyle = this.color
    ctx.fill()

    if (this.label) {
      ctx.font = `bold ${r}px sans-serif`
      ctx.textAlign = 'center'
      ctx.fillStyle = '#fff'
      ctx.fillText(this.label, px, py - r / 2)
    }
  }
}
