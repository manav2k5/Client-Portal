import countries from "./mapCountries.json";
import places from "./mapPlaces.json";
export type Destination = { key: string; name: string; lon: number; lat: number };
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const countryAliases = new Map<string,string>();
for (const country of countries) for (const alias of country.aliases) countryAliases.set(normalize(alias),normalize(country.name));
const countryKey = (value: string) => countryAliases.get(normalize(value)) || normalize(value);
type Candidate = Destination & { region: string; country: string; kind: string };
const index = new Map<string,Candidate[]>();
function add(aliases: string[], candidate: Candidate) {
 for (const alias of new Set(aliases.map(normalize))) index.set(alias,[...(index.get(alias) || []),candidate]);
}
// Representative continent markers, not exact shipping addresses.
const continents = [
 { name: "Africa", lon: 20, lat: 2 },
 { name: "Asia", lon: 90, lat: 40 },
 { name: "Europe", lon: 20, lat: 52 },
 { name: "North America", lon: -105, lat: 45 },
 { name: "South America", lon: -60, lat: -15 },
 { name: "Oceania", lon: 140, lat: -25 },
 { name: "Antarctica", lon: 0, lat: -80 },
];
for (const continent of continents) add([continent.name], {
 ...continent, key: `continent:${continent.name}`, region: "", country: "", kind: "continent",
});
for (const country of countries.filter(country => !continents.some(continent => normalize(continent.name) === normalize(country.name)))) add(country.aliases,{...country,key:`country:${country.name}`,region:"",country:countryKey(country.name),kind:"country"});
for (const place of places) {
 const name = [...new Set([place.name,place.region,place.country].filter(Boolean))].join(", ");
 add(place.aliases,{key:`${place.kind}:${name}`,name,lon:place.lon,lat:place.lat,region:normalize(place.region),country:countryKey(place.country),kind:place.kind});
}
const cache = new Map<string,Destination[]>();
export function resolveDestination(raw: string): Destination[] {
 const parts = raw.split(/[,/]/).map(normalize).filter(Boolean);
 if (!parts.length) return [];
 const cacheKey = parts.join(",");
 const cached = cache.get(cacheKey); if(cached) return cached;
 const matches = (index.get(parts[0]) || []).filter(place => (parts.length === 1 || place.kind !== "country") && parts.slice(1).every(part => part === place.region || countryKey(part) === place.country));
 const result = [...new Map(matches.map(place => [place.key,place])).values()];
 if(cache.size >= 2000) cache.clear();
 cache.set(cacheKey,result);
 return result;
}
