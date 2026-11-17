# Credits

*Terra Scutum: The Last Line of Earth* is made with public data and open-source software. The
credits below are also shown in the game under **Settings → About this build**.

## Map data

- **Borders, coasts, rivers:** made with [Natural Earth](https://www.naturalearthdata.com/). Public domain.
- **Terrain heights:** [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Mapzen, hosted as
  Amazon open data). GMTED2010 terrain data courtesy of the U.S. Geological Survey; ETOPO1 terrain
  data by the U.S. National Oceanic and Atmospheric Administration. Public domain.
- **Land cover:** © ESA WorldCover project 2021 / contains modified Copernicus Sentinel data (2021)
  processed by the ESA WorldCover consortium. Licensed under
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The game uses a reduced version
  (the terrain tiles in `packages/game/public/terrain/`).

## Statistics

- **Starting population and economy:** World Bank (World Development Indicators: population, GDP,
  birth and death rates, labor force, unemployment, armed forces) and International Monetary Fund
  (World Economic Outlook). See `packages/tools/starting-data/README.md`.
- **Where people live (population per province):** [Kontur Population](https://data.humdata.org/dataset/kontur-population-dataset):
  Global Population Density for 400m H3 Hexagons, © Kontur. Licensed under
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The game uses only the number of
  people counted in each province (`data/province_start.json`).
- **Starting buildings (F85):** coal, oil and gas production, oil use and electricity by source from
  [Our World in Data's energy dataset](https://github.com/owid/energy-data) (built from the Energy
  Institute Statistical Review of World Energy and Ember), licensed under
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); jobs and value added by sector, cereal
  and fisheries production from the World Bank (World Development Indicators); steel, iron ore,
  copper, bauxite, aluminum and silicon production typed in approximately from worldsteel (*World
  Steel in Figures 2025*) and the U.S. Geological Survey (*Mineral Commodity Summaries 2025*). See
  `packages/tools/starting-data/README.md`.

## Pictures

- **Flags:** [flag-icons](https://github.com/lipis/flag-icons), MIT licence.
