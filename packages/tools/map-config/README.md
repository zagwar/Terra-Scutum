# Map configuration (F64)

These files are the **source of the game map**. The map import turns them, together with
[Natural Earth](https://www.naturalearthdata.com/)'s public-domain map data (version in
`settings.json`), into the game's map data:

| Output | What it holds |
|---|---|
| `data/countries.json`, `data/provinces.json`, `data/regions.json`, `data/sea_zones.json` | The map facts the simulation uses: owners, regions, borders (adjacency), coasts, areas |
| `data/geometry/*.topo.json` | The shapes (TopoJSON), drawn by the game |
| `locales/en.map.json` | The English names of every country, province, region and sea zone |
| `report/` | `map-report.md` (lists, counts, warnings) and preview pictures (provinces, regions, sea zones) |

**Never edit the outputs by hand**: change the files here and run the import again:

```
npm run import:map
```

It downloads the Natural Earth files once (into `.cache/`, not committed), takes about a minute,
and always gives the same result for the same inputs.

## The files

- **`countries.json`**: the curated country list. Every Natural Earth territory (by its code) must
  appear exactly once: as a country's `source`, in a country's `includes` (merged into that
  country), or in `leftOut` (not part of the game world). Dependencies join their sovereign state;
  tiny island countries are left out; disputed areas follow the decision log.
- **`province-groups.json`**: states/provinces that are always combined into one province with a
  real name ("New England", "Transylvania", "Tōhoku"). A group lists its members by ISO 3166-2 code
  (`units`, e.g. `"US-CT"`), by source grouping (`groupings`, e.g. `"East Wales"`), by name
  (`names`) or by whole territory (`territories`, e.g. `"HKG"`). A group with `"keep": true` is never
  merged with another province (for areas that matter on their own, such as Transnistria). `keepSeparate` lists countries whose
  states are never combined automatically (only by their groups).
- **`regions.json`**: the ~60 regions, as real geographic areas. A region lists its territories
  (`countries`, Natural Earth codes: `"GBR"` is Great Britain itself, overseas territories have
  their own codes) and, for big countries split between regions, their states (`units`, ISO codes,
  which win over `countries`). Anything not listed joins the region with the nearest `seeds` point,
  and the import warns about it.
- **`sea-zones.json`**: the sea zones. Each grows through the water from its seed points (which
  must be in open water). `connections` adds links through straits too narrow for the import's
  grid (for example the Bosporus). If a zone grows around a coast that really faces another zone,
  add a seed for that other zone just off the coast; `report/sea_zones.png` shows every sea zone in
  its own color, so you can see which coasts each one touches.
- **`province-names.json`**: better display names for generated provinces, by province id. Ids never
  change when a name does.
- **`tiny-provinces.json`**: provinces that are too small for the map data's precision (their
  shape would have no area, so they could not be seen or clicked). `enlarge` lists the ones drawn as
  a small disc (`radiusKm` [DEFAULT], with `discPoints` corners) around `center`, as Paradox games do
  with microstates; the disc is cut out of whatever province lies under it, and `areaKm2` (the real
  area) is what goes into the data. `leaveOut` lists the ones that are not part of the game. The
  import warns if any other province comes out without a visible shape.
- **`country-colors.json`**: each country's traditional map color (the one commonly associated with
  it), by country id, as `#rrggbb`. A country keeps it unless a country that borders it (or faces it
  across a narrow sea) looks too much alike; then the one with fewer provinces is shifted to the
  nearest shade that can be told apart. The report lists every shifted country.
- **`settings.json`**: the [DEFAULT] numbers:
  - `areaPerProvinceKm2` and `populationUnit`: each country aims for about
    `area ÷ areaPerProvinceKm2 + √(population ÷ populationUnit)` provinces.
  - `mergeBelowLoad`, `seaMergeBelowLoad`, `wholeGroupingBelowLoad`, `groupingMergePenalty`:
    which small states are combined, and how.
  - `maxProvincesFactor`: the province budget. A country (each separate piece of land) may have at
    most this many times its target number of provinces; above it, provinces are merged further,
    even real regions and named groups (except groups marked `keep`), so small countries are not cut
    finer than big ones.
  - `dominantShare`: a combined province keeps its main member's name when the other members are
    tiny (Bremen added to Lower Saxony is still "Lower Saxony").
  - `clusterDistanceKm`, `minClusterPopulation`, `minIsletAreaKm2`: islands and islets.
  - `colors.nearCountryKm`, `colors.nearMinProvinceKm2`: countries whose land is closer together
    than this (across a strait or a narrow sea, counting only provinces at least this big) get
    clearly different map colors, as countries sharing a border always do.

## How provinces are made

Provinces always follow **real borders**: states and provinces are only ever combined, never cut.

1. Natural Earth's ~4,600 states and provinces are assigned to countries (`countries.json`).
2. Each country's land is grouped into clusters (land that hangs together, or islands within
   `clusterDistanceKm`). Uninhabited clusters are left out, but never a country's only land.
3. In each cluster: the named groups are combined first; then small source groupings that are still
   complete become single provinces with their real name ("Greater London", "Bretagne"); then, unless
   the country is in `keepSeparate`, the lightest provinces merge with a neighbor until the cluster
   reaches its target. If a cluster still has more provinces than its budget (`maxProvincesFactor`
   × target), merging goes on across real regions and named groups too (never `keep` groups),
   always joining the lightest province with the neighbor that gives the most compact result.
4. Combined provinces are named: the group's name, the source grouping's name, the main member's name
   (a tiny piece was added), "A and B" for two members, or a direction in the country ("Northern
   Algeria"). The report lists every combined province and how it got its name; better names go in
   `province-groups.json` or `province-names.json`.
5. The tiny provinces in `tiny-provinces.json` are enlarged or left out, and every province gets its
   label point (`center`): the point of its shape farthest from its outline.
6. Borders between provinces come from the shared shapes; coasts and sea zones come from a world grid
   (`raster.degreesPerPixel`). The world wraps east–west: sea zones grow across the date line.
