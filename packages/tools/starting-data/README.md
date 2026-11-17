# Country and province starting data (F71, F06)

These files are the **source of each country's real-world starting data** (the campaign starts in
January 2025). The import turns them into `data/country_start.json` (per country: population, GDP,
government type and, since F06, birth and death rates, labor force, unemployment and armed forces)
and `data/province_start.json` (F06: each province's population), which the game loads:

```
npm run import:starting-data
```

It works offline, takes a second, and also writes `report.md` (every country in one table, the world
totals, and where the sources disagree). **Never edit `data/country_start.json` or
`data/province_start.json` by hand**: change the files here and run the import again.

## The files

- **`countries.json`** (written by hand): for every country of the curated list (map-config
  `countries.json`), its **government type** (an id from `data/government_types.json`) with a `note`
  for borderline cases, plus:
  - `population` / `gdpMillionUsd` (with `populationNote` / `gdpNote`): hand-written estimates where
    no source has a figure (North Korea's GDP, Vatican City);
  - `"gdp": "worldBank"`: use the World Bank's latest GDP instead of the IMF's, when the IMF's is
    unusable (Yemen);
  - `gdpNote`: a remark about the figure (for example how old it is);
  - `demographics` (F06): hand-written birth and death rates, labor force share, unemployment rate
    and armed forces share, each used only where the World Bank has no figure (Taiwan, Kosovo, the
    microstates), with a `note`.
  - At the top: `year` (must match the campaign's start year), `sourceCodes` (codes the sources use
    where they differ from the game's: Kosovo is `UVK` at the IMF and `XKX` at the World Bank;
    Guernsey and Jersey are one "Channel Islands" entry, `CHI`), `territoryEstimates` (merged
    territories no source covers, for example Western Sahara), and `provinceEstimates` (F06:
    hand-written populations for provinces the population grid gets wrong: Gibraltar, drawn as a
    disc bigger than it is, and Conakry, whose small shape misses most of the city; the rest of the
    country shares what is left).
- **`sources/imf-weo.json`** and **`sources/world-bank-wdi.json`** (made by the import's `--snapshot`
  step, see below): the source figures the game needs, saved with their edition and download date.
- **`sources/province-population.json`** (made by `npm run import:province-population`, see below):
  the people a gridded world population dataset counts inside every province.
- **`report.md`**: written by the import; read it after every change.

## How the numbers are chosen

- **Population:** the World Bank's figure for the year (World Development Indicators, based on the
  UN's World Population Prospects). Taiwan, which the World Bank doesn't list, comes from the IMF.
- **GDP:** nominal GDP in US dollars from the IMF's World Economic Outlook for the year. Countries
  the IMF doesn't cover (Cuba, Eritrea, Kosovo, Monaco, Palestine, Syria) use the World Bank's
  latest figure; its year is kept as `gdpYear` when it is older.
- **Merged territories** (map-config `includes`, for example Hong Kong and Macau in China, Puerto
  Rico in the USA, Greenland in Denmark): their population and GDP are added to the country's.
- **Demographics (F06):** births and deaths per 1,000 people (2024), the labor force as a share of
  the population and the unemployment rate (2025, ILO estimates) and the armed forces as a share of
  the labor force (2020), all from the World Bank. Merged territories take their country's rates.
- **Province populations (F06):** each country's population is shared among its provinces in
  proportion to the people counted in them, as whole numbers that add up to the country's figure.
- **Government types:** chosen by hand from how power really works in January 2025 (not only what
  the constitution says); borderline cases have a note. All [DEFAULT]: change any of them here.

## Updating the figures (when the IMF or the World Bank publish new ones)

The download needs `www.imf.org` and `api.worldbank.org` in the environment's network settings
(the `terra-scutum` environment has them). From the repository root:

```
mkdir -p .cache/starting-data
curl -sS -o .cache/starting-data/imf-NGDPD.json "https://www.imf.org/external/datamapper/api/v1/NGDPD"
curl -sS -o .cache/starting-data/imf-LP.json "https://www.imf.org/external/datamapper/api/v1/LP"
curl -sS -o .cache/starting-data/imf-indicators.json "https://www.imf.org/external/datamapper/api/v1/indicators"
curl -sS -o .cache/starting-data/wb-population.json "https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&date=2025&per_page=500"
curl -sS -o .cache/starting-data/wb-gdp.json "https://api.worldbank.org/v2/country/all/indicator/NY.GDP.MKTP.CD?format=json&mrnev=1&per_page=500"
for i in SP.DYN.CBRT.IN SP.DYN.CDRT.IN SL.TLF.TOTL.IN SL.UEM.TOTL.ZS MS.MIL.TOTL.P1; do
  curl -sS -o ".cache/starting-data/wb-$i.json" "https://api.worldbank.org/v2/country/all/indicator/$i?format=json&mrnev=1&per_page=500"
done
npm run import:starting-data -- --snapshot
```

`--snapshot` remakes the two files in `sources/` from the downloads (only the codes and years the
game needs), then runs the import. Compare `report.md` before and after.

## Where people live: the province populations (F06)

`sources/province-population.json` holds the number of people counted in every province. It is made
from **Kontur Population** (Global Population Density for 400m H3 Hexagons, edition 2023-11-01; built
from the Global Human Settlement Layer, Meta's population maps and OpenStreetMap; © Kontur,
**CC BY 4.0**, credited in the game and in `CREDITS.md`). **Run it again whenever `npm run import:map`
changed the provinces**, then run `npm run import:starting-data`:

```
mkdir -p .cache/population
curl -sS -o .cache/population/kontur_population_20231101.gpkg.gz "https://geodata-eu-central-1-kontur-public.s3.amazonaws.com/kontur_datasets/kontur_population_20231101.gpkg.gz"
gunzip .cache/population/kontur_population_20231101.gpkg.gz
npm run import:province-population
npm run import:starting-data
```

The download is 2.4 GB (6.7 GB unpacked, not committed; the host is reachable from the
`terra-scutum` cloud environment as it is); counting takes about two minutes. Each hexagon's people
go to the province its middle lies in (or the nearest province within about 30 km, for hexagons just
off a coast); about 0.1 % of the world's people fall in no province (places the game leaves out).

## Starting buildings (F85)

`data/building_start.json` lists every province's starting buildings (`[building, production
method, level]`), made by the same `npm run import:starting-data` from three things:

- **`sources/production.json`** (made by `--snapshot` or `--snapshot-production`, see below): per
  country the World Bank's jobs in farming and industry (% of employment, ILO estimates), value added
  by farming, industry and manufacturing (% of GDP), cereal and fisheries production (tonnes), and
  from **Our World in Data's energy dataset** (CC BY 4.0, built from the Energy Institute Statistical
  Review of World Energy and Ember) coal, oil and gas production, oil use and electricity by source
  (TWh, the latest year with figures, 2024). Merged territories are added to their country.
- **`production.json`** (written by hand, all [DEFAULT]):
  - `handTables`: steel, iron ore, copper (mined and refined), bauxite, aluminum and silicon
    production in 2024 (kt a year) of the countries that make almost all of it, **typed in
    approximately** from worldsteel's *World Steel in Figures 2025* and the USGS *Mineral Commodity
    Summaries 2025* (their websites can't be downloaded from the cloud sessions). Correct any
    figure there and run the import again.
  - `mainProvinces`: where the biggest producers really mine and drill (Texas, Shanxi, the
    Pilbara…), with a weight per province.
  - `placement`: how the rest is shared among a country's provinces (by people; by people with
    city provinces weighted less; coastal provinces; by land area without cities and near-empty
    provinces such as Greenland).
  - `rules`: unit conversions (TWh of coal, oil and gas to tonnes), world totals for farming and
    manufacturing, productivity and power settings.
- **`data/buildings.json`**: what one level of each building makes, with its production methods.

The rules, in short (the code is `src/starting-data/build-starting-buildings.ts`):

- **How much each country makes:** coal, crude oil and natural gas mines and fields from the energy
  figures; each kind of power plant from the electricity it really generated (other renewables,
  bioenergy and geothermal count as hydro, oil-fired as gas); refineries from the country's oil use;
  steel, iron, copper, bauxite, aluminum and silicon from the hand tables; fish from the World Bank;
  grain half from the real cereal harvest and half from the farm economy (value added at local
  prices), scaled to the world's 3.1 billion tonnes; livestock from the farm economy; chemicals,
  plastic, processed food, electronics and consumer goods from manufacturing (value added at local
  prices), scaled to world totals; quarries for the stone the silicon plants need.
- **Levels:** what a country makes ÷ what one level makes, rounded; at least one level from a
  quarter of a level.
- **Production methods (productivity):** farms, ranches and fisheries get the mix of methods
  (mechanized, traditional, subsistence…) at which they employ the country's **real farm workers**;
  consumer goods factories the mix at which they employ 24 % of its industry workers (light
  industry); everything else the mix that fits its value added per industry worker compared with the
  United States. The labor-intensive methods go to the provinces with the most workers per level,
  as far as the province and the country's pop groups have the workers.
- **Power:** a country whose power plants can't make what its buildings need (with 90 % of the
  electricity left for homes and the rest of the economy) gets more of its biggest kind of plant, or
  gas plants (a stand-in for imported electricity; listed in the report).

The result covers about **30 % of the world's jobs** (almost all farm jobs, and the industries in the
catalog); services, construction, vehicles and machinery stay with the stand-in economy.
**Read `buildings-report.md` after every change**: the world's output against the real one, every
country's jobs, and warnings (provinces with more jobs than workers, power plants added).

### Updating the production figures

The downloads need `api.worldbank.org` and `raw.githubusercontent.com` (both reachable from the
cloud sessions). From the repository root:

```
mkdir -p .cache/starting-data
for i in SL.AGR.EMPL.ZS SL.IND.EMPL.ZS NV.AGR.TOTL.ZS NV.IND.TOTL.ZS NV.IND.MANF.ZS AG.PRD.CREL.MT ER.FSH.PROD.MT; do
  curl -sS -o ".cache/starting-data/wb-$i.json" "https://api.worldbank.org/v2/country/all/indicator/$i?format=json&mrnev=1&per_page=500"
done
curl -sS -o .cache/starting-data/owid-energy-data.csv "https://raw.githubusercontent.com/owid/energy-data/master/owid-energy-data.csv"
npm run import:starting-data -- --snapshot-production
```

(The World Bank's server is slow with several downloads at once: run them one after another.)
