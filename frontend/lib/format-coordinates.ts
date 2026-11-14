export function formatCoordinates(latitude: number, longitude: number, precision = 4) {
  const lat = `${Math.abs(latitude).toFixed(precision)}° ${latitude < 0 ? "S" : "N"}`;
  const lon = `${Math.abs(longitude).toFixed(precision)}° ${longitude < 0 ? "W" : "E"}`;
  return `${lat}, ${lon}`;
}
