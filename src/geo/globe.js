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

// Globens kameraavstand. Ved lav zoom rammer vi inn hele kloden; idet vi
// nærmer oss kart-overgangen tar skala-matchen over så kartet aligner.
export function globeCameraDistance(zoom, viewportH = 800) {
  return softMin(framingDistance(zoom), scaleMatchDistance(zoom, viewportH))
}
