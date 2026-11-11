import type { RawGameData } from '@terra-scutum/sim';
import gameConfig from '../../../../data/game_config.json';

/**
 * The game's data files, bundled into the sim worker at build time. The sim
 * validates them when a campaign starts (`parseGameData`). The type makes
 * sure every file in the sim's `DATA_FILES` list is provided here.
 */
export const RAW_GAME_DATA: RawGameData = {
  gameConfig,
};
