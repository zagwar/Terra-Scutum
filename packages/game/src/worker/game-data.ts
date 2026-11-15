import type { RawGameData } from '@terra-scutum/sim';
import countries from '../../../../data/countries.json';
import countryFlags from '../../../../data/country_flags.json';
import countryScreen from '../../../../data/country_screen.json';
import countryStart from '../../../../data/country_start.json';
import gameConfig from '../../../../data/game_config.json';
import governmentTypes from '../../../../data/government_types.json';
import mapView from '../../../../data/map_view.json';
import notifications from '../../../../data/notifications.json';
import provinces from '../../../../data/provinces.json';
import regions from '../../../../data/regions.json';
import seaZones from '../../../../data/sea_zones.json';
import terrainTiles from '../../../../data/terrain_tiles.json';

/**
 * The game's data files, bundled into the sim worker at build time. The sim
 * validates them when a campaign starts (`parseGameData`). The type makes
 * sure every file in the sim's `DATA_FILES` list is provided here.
 */
export const RAW_GAME_DATA: RawGameData = {
  gameConfig,
  countries,
  provinces,
  regions,
  seaZones,
  governmentTypes,
  countryStart,
  mapView,
  terrainTiles,
  notifications,
  countryScreen,
  countryFlags,
};
