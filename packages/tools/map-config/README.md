# Map configuration (F64)

These files are the **source of the game map**. The map import turns them, together with
[Natural Earth](https://www.naturalearthdata.com/)'s public-domain map data (version in
`settings.json`), into the game's map data:

| Output | What it holds |
|---|---|
| `data/countries.json`, `data/provinces.json`, `data/regions.json`, `data/sea_zones.json` | The map facts the simulation uses: owners, regions, borders (adjacency), coasts, areas |
| `data/geometry/*.topo.json` | The shapes (TopoJSON), drawn by the game |
| `locales/en.map.json` | The English names of every country, province, region and sea zone |
| `report/` | `map-report.md` (lists, counts, warnings) and preview pictures |

**Never edit the outputs by hand**: change the files here and run the import again:

```
npm run import:map
```

It downloads the Natural Earth files once (into `.cache/`, not committed), takes about a minute,
and always gives the same result for the same inputs.

## The files

- **`countries.json`**: the curated country list. Every Natural Earth territory (by its code) must
  appear exactly once: as a country's `source`, in a country's `includes` (merged into that
  country), or in `leftOut` (not part of the game world). The first draft was made by these
  [DEFAULT] rules: dependencies join their sovereign state; countries with fewer than 1 million
  people **and** smaller than 50,000 km² merge into the neighbor they share the longest border with,
  or are left out if they are islands; disputed areas follow the choices in the decision log.
- **`regions.json`**: the ~50 regions. Each has a name, a climate and one or more seed points
  `[longitude, latitude]`; every province joins the region with the nearest seed. `countries`
  puts a whole country in a region.
- **`sea-zones.json`**: the sea zones. Each grows through the water from its seed points (which
  must be in open water). `connections` adds links through straits too narrow for the import's
  grid (for example the Bosporus).
- **`province-names.json`**: better display names for generated provinces, by province id. Ids never
  change when a name does.
- **`settings.json`**: the [DEFAULT] numbers that shape the provinces:
  - `areaPerProvinceKm2` and `populationUnit`: each country gets about
    `area ÷ areaPerProvinceKm2 + √(population ÷ populationUnit)` provinces (so big and populous
    countries get more, but not proportionally more).
  - `maxLoad`: provinces heavier than this (in "average province" units) are split in two.
  - `mergeBelowLoad`, `minMergeLoad`, `seaMergeBelowLoad`, `wholeGroupingBelowLoad`,
    `groupingMergePenalty`: when small source provinces are merged.
  - `clusterDistanceKm`, `minClusterPopulation`, `minIsletAreaKm2`: islands and islets.
  - `cityNameMinPopulation`: split provinces are named after a city at least this big
    ("Texas (Houston)"), otherwise after a direction ("Sakha Republic (North)").

## How provinces are made

1. Natural Earth's ~4,600 states and provinces are assigned to countries (`countries.json`).
2. Each country's land is grouped into clusters (land that hangs together, or islands within
   `clusterDistanceKm`). Uninhabited clusters are left out.
3. Small source groupings (for example Greater London's boroughs) become single provinces; then
   small provinces merge with neighbors and heavy ones (large or populous) are split by a straight
   cut, until each cluster has about its target number of provinces.
4. Borders between provinces come from the shared shapes; coasts and sea zones come from a world
   grid (`raster.degreesPerPixel`).
