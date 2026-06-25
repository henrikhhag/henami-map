// Kameraavstand fra globens sentrum (globe-radius = 1.0) ved gitt zoom.
// Tunet slik at hele kloden er synlig med luft rundt ved lav zoom, og
// fyller viewporten idet vi nærmer oss kart-overgangen (~zoom 3.5).
export function globeCameraDistance(zoom) {
  return 1.05 + 21.4 * Math.exp(-1.417 * zoom)
}

export const GLOBE_FOV = 40 * Math.PI / 180
