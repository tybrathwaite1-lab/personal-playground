// City-level coordinates for distance estimates. Deliberately coarse: the app
// shows distances as approximate ("~8 mi") and never needs anyone's exact location.
export interface City {
  name: string;
  match: RegExp;
  lat: number;
  lon: number;
}

export interface LatLon {
  lat: number;
  lon: number;
}

export const HOME = { name: 'St. Petersburg', lat: 27.7676, lon: -82.6403 };

export const CITIES: City[] = [
  { name: 'St. Petersburg', match: /st\.?\s*pete(rsburg)?\b(?!\s*beach)|saint petersburg/i, lat: 27.7676, lon: -82.6403 },
  { name: 'St. Pete Beach', match: /st\.?\s*pete beach/i, lat: 27.7253, lon: -82.7412 },
  { name: 'Gulfport', match: /gulfport/i, lat: 27.7484, lon: -82.7034 },
  { name: 'Pinellas Park', match: /pinellas park/i, lat: 27.8428, lon: -82.6995 },
  { name: 'Treasure Island', match: /treasure island/i, lat: 27.7692, lon: -82.769 },
  { name: 'Madeira Beach', match: /madeira beach/i, lat: 27.7981, lon: -82.7974 },
  { name: 'Seminole', match: /seminole/i, lat: 27.8398, lon: -82.7912 },
  { name: 'Largo', match: /\blargo\b/i, lat: 27.9095, lon: -82.7873 },
  { name: 'Clearwater', match: /clearwater/i, lat: 27.9659, lon: -82.8001 },
  { name: 'Safety Harbor', match: /safety harbor/i, lat: 27.9906, lon: -82.6932 },
  { name: 'Dunedin', match: /dunedin/i, lat: 28.0197, lon: -82.7718 },
  { name: 'Oldsmar', match: /oldsmar/i, lat: 28.0342, lon: -82.6651 },
  { name: 'Tierra Verde', match: /tierra verde/i, lat: 27.6914, lon: -82.7234 },
  { name: 'Tampa', match: /\btampa\b/i, lat: 27.9506, lon: -82.4572 },
];

/** First city mentioned in a location string. */
export function cityFor(text: string | undefined | null): City | null {
  if (!text) return null;
  return CITIES.find((c) => c.match.test(text)) ?? null;
}

export function milesBetween(a: LatLon, b: LatLon): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
