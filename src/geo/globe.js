export const GLOBE_FOV = 40 * Math.PI / 180
const F = 1 / Math.tan(GLOBE_FOV / 2)

// Avstand der globens senterskala (px per grad i midten) er nøyaktig lik
// 2D-mercator ved samme zoom/høyde. Brukes nær overgangen slik at globe→kart
// blir en sømløs utflating i stedet for to bilder med ulik skala.
function scaleMatchDistance(zoom, viewportH) {
  return (viewportH * F * Math.PI) / (256 * Math.pow(2, zoom))
}

// Ramme-avstand ved lav zoom: hele kloden synlig med litt luft rundt.
// Svak helning gir en liten zoom-følelse også i globe-området.
function framingDistance(zoom) {
  return 4.3 - 0.23 * zoom
}

// Myk minimum – som Math.min, men uten knekk i derivatet ved krysningspunktet,
// så zoomhastigheten blir kontinuerlig (ingen rykk i overgangen).
function softMin(a, b, k = 12) {
  return -Math.log(Math.exp(-k * a) + Math.exp(-k * b)) / k
}

const DIST_MIN = 1.12 // kameraet kommer aldri nærmere enn dette (alltid utenfor kula)

// Kamera-oppsett for globen: avstand + FOV. Ved lav zoom flyttes kameraet nærmere
// for å zoome; når det når DIST_MIN holdes avstanden, og videre zoom skjer ved å
// snevre inn FOV. Slik forblir det ALLTID en globe (kamera utenfor), skarpt på
// alle nivåer, uten utflating til 2D.
export function globeView(zoom, viewportH = 800) {
  let dist = softMin(framingDistance(zoom), scaleMatchDistance(zoom, viewportH))
  let fov = GLOBE_FOV
  if (dist < DIST_MIN) {
    const ratio = dist / DIST_MIN
    dist = DIST_MIN
    fov = 2 * Math.atan(Math.tan(GLOBE_FOV / 2) * ratio)
  }
  return { dist, fov }
}

export function globeCameraDistance(zoom, viewportH = 800) {
  return globeView(zoom, viewportH).dist
}

// Morph-faktor 0→1: kula flater ut til mercator-plan idet vi zoomer inn mot
// kart-overgangen. Ved 1.0 er geometrien identisk med 2D-rendereren.
// Lagt LANGT inn slik at det forblir en globe gjennom vanlig bruk (som Mapbox);
// utflatingen skjer først når du er godt innzoomet (og kula uansett er nær flat).
export const MORPH_START = 4.4
export const MORPH_END = 5.4
export function globeMorph(zoom) {
  const t = Math.max(0, Math.min(1, (zoom - MORPH_START) / (MORPH_END - MORPH_START)))
  return t * t * (3 - 2 * t) // smoothstep
}
