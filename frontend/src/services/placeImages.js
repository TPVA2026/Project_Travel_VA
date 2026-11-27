import manifest from './placeImages.json'

export function getPlaceImageUrl(placeId) {
  if (!placeId) return null
  const id = String(placeId).trim().toUpperCase()
  const images = manifest[id]
  return Array.isArray(images) && images.length > 0 ? images[0] : null
}

export function getPlaceImages(placeId) {
  if (!placeId) return []
  const id = String(placeId).trim().toUpperCase()
  const images = manifest[id]
  return Array.isArray(images) ? images : []
}
