const MOON_RADIUS_M = 1_737_400;
const RADIANS = Math.PI / 180;
const HALF_VIEW_M = 5_000;

export function quickMapSiteUrl({ latitude, longitude }: { latitude: number; longitude: number }) {
  const lat = latitude * RADIANS;
  const lon = longitude * RADIANS;
  const polar = Math.abs(latitude) >= 75;
  // QuickMap projections: equidistant cylindrical (16), south (17), north (19).
  const projection = polar ? (latitude < 0 ? 17 : 19) : 16;
  const x = polar ? MOON_RADIUS_M * Math.cos(lat) * Math.sin(lon) : MOON_RADIUS_M * lon;
  const y = polar
    ? -Math.sign(latitude) * MOON_RADIUS_M * Math.cos(lat) * Math.cos(lon)
    : MOON_RADIUS_M * lat;
  // Keep the viewport inside the cylindrical map at the ±180° seam.
  const edge = Math.PI * MOON_RADIUS_M - HALF_VIEW_M;
  const centerX = polar ? x : Math.min(edge, Math.max(-edge, x));
  const extent = [centerX - HALF_VIEW_M, y - HALF_VIEW_M, centerX + HALF_VIEW_M, y + HALF_VIEW_M];
  const url = new URL("https://quickmap.lroc.im-ldi.com/query");
  url.search = new URLSearchParams({
    proj: String(projection),
    prjExtent: extent.map((coordinate) => coordinate.toFixed(3)).join(","),
    features: `${longitude},${latitude}`,
  }).toString();
  return url.href;
}
