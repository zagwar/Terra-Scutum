# Country starting data (F71)

These files are the **source of each country's real-world starting data** (the campaign starts in
January 2025). The import turns them into `data/country_start.json`, which the game loads:

```
npm run import:starting-data
```

It works offline, takes a second, and also writes `report.md` (every country in one table, the world
totals, and where the sources disagree). **Never edit `data/country_start.json` by hand**: change the
files here and run the import again.

## The files

- **`countries.json`** (written by hand): for every country of the curated list (map-config
  `countries.json`), its **government type** (an id from `data/government_types.json`) with a `note`
  for borderline cases, plus:
  - `population` / `gdpMillionUsd` (with `populationNote` / `gdpNote`): hand-written estimates where
    no source has a figure (North Korea's GDP, Vatican City);
  - `"gdp": "worldBank"`: use the World Bank's latest GDP instead of the IMF's, when the IMF's is
    unusable (Yemen);
  - `gdpNote`: a remark about the figure (for example how old it is).
  - At the top: `year` (must match the campaign's start year), `sourceCodes` (codes the sources use
    where they differ from the game's: Kosovo is `UVK` at the IMF and `XKX` at the World Bank;
    Guernsey and Jersey are one "Channel Islands" entry, `CHI`), and `territoryEstimates` (merged
    territories no source covers, for example Western Sahara).
- **`sources/imf-weo.json`** and **`sources/world-bank-wdi.json`** (made by the import's `--snapshot`
  step, see below): the source figures the game needs, saved with their edition and download date.
- **`report.md`**: written by the import; read it after every change.

## How the numbers are chosen

- **Population:** the World Bank's figure for the year (World Development Indicators, based on the
  UN's World Population Prospects). Taiwan, which the World Bank doesn't list, comes from the IMF.
- **GDP:** nominal GDP in US dollars from the IMF's World Economic Outlook for the year. Countries
  the IMF doesn't cover (Cuba, Eritrea, Kosovo, Monaco, Palestine, Syria) use the World Bank's
  latest figure; its year is kept as `gdpYear` when it is older.
- **Merged territories** (map-config `includes`, for example Hong Kong and Macau in China, Puerto
  Rico in the USA, Greenland in Denmark): their population and GDP are added to the country's.
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
npm run import:starting-data -- --snapshot
```

`--snapshot` remakes the two files in `sources/` from the downloads (only the codes and years the
game needs), then runs the import. Compare `report.md` before and after.
