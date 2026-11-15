# Terrain configuration (F125)

The terrain import turns **public elevation and land cover data**, together with the map's province
shapes, into the game's terrain:

| Output | What it holds |
|---|---|
| `packages/game/public/terrain/<level>/<column>_<row>.bin` | The terrain tiles: heights and land cover, five levels of detail (about 1,500 small files, about 52 MB in all) |
| `data/terrain_tiles.json` | Which tiles exist, their version and the height range |
| `data/geometry/rivers.json` | The rivers, with a width class each |
| `report/` | `terrain-report.md` (sizes per level, land cover shares) and `terrain.png` (a shaded preview of the world) |

**Never edit the outputs by hand**: change `settings.json` and run the import again:

```
npm run import:terrain
```

It takes about five minutes and always gives the same result for the same inputs. **Run it again
after `npm run import:map` changed the provinces**: land and sea are told apart by the province
shapes (`data/geometry/provinces.topo.json`). The data check (`npm run check:data`) fails if the
tiles were made for another map projection than `data/map_view.json`.

## Where the data comes from

Everything is downloaded once into `.cache/` (not committed), about 350 MB:

| What | Source | Licence | Host to allow |
|---|---|---|---|
| **Elevation** | The [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) open dataset (Mapzen's "terrarium" tiles), zoom 6. At that zoom the land is **GMTED2010** (U.S. Geological Survey) and the sea floor **ETOPO1** (NOAA) | Public domain (U.S. government works); credit requested | `s3.amazonaws.com` |
| **Land cover** | [ESA WorldCover](https://esa-worldcover.org/) 2021 v200 (10 m); only each tile's coarsest overview (about 600 m) is read | **CC BY 4.0**: must be credited | `esa-worldcover.s3.eu-central-1.amazonaws.com` |
| **Rivers** | [Natural Earth](https://www.naturalearthdata.com/) `ne_10m_rivers_lake_centerlines_scale_rank` (version in `map-config/settings.json`) | Public domain | `raw.githubusercontent.com` |

The credits are shown in the game under **Settings → About this build** (texts `CREDITS_*` in
`locales/en.json`) and listed in `CREDITS.md`. If the terrain is ever made from other data, change
them too.

If a download is refused, the import says which host to allow: environment selector under the
message box → edit environment → network access → add the host.

## How the terrain is laid out

- **Levels.** Level 0 covers the world with 1,024 cells east to west (about 39 km per cell at the
  equator); each level after it has twice as many, up to level 4 (16,384 cells, about 2.4 km).
- **Tiles.** A level is cut into tiles of 256 × 256 cells. Columns count east from longitude −180°,
  rows count north from the map's southern edge; tile (c, r) of one level is covered by tiles
  (2c, 2r) … (2c + 1, 2r + 1) of the next. Tiles without land have no file.
- **A tile** (`packages/sim/src/data/terrain-format.ts`) holds heights in metres at the cells'
  corners (0 at sea; real depressions such as the Dead Sea stay below zero) and the land cover of
  the cells (ESA WorldCover's eleven classes). Levels 0–2 store each cell's two commonest classes
  and how they mix, for smoother colors from far away; levels 3–4 only the main class
  (`mixedCoverLevels`), which keeps them small.
- **Coarser levels** are made from the finest: heights are averaged, land cover counted again.

## `settings.json`

- `elevation`: the tile address and zoom (6 = 16,384 pixels around the world, matching level 4).
- `landCover`: the bucket and what its files look like.
- `rivers`: the Natural Earth file, how much the lines are simplified, and their precision.
- `tiles`: the layout above. Changing it changes every tile: the game's settings
  (`terrain` in `data/map_view.json`) must fit (`maxLevel`).
- `downloads.concurrency`: how many files are fetched at once.
