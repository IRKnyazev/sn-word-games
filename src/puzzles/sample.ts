/**
 * The bundled sample Mini. Grid and clues are original (written for this
 * project), so nothing here is NYT content.
 */
import {buildGridPuzzle, type GridPuzzle} from '../model/grid';

export const SAMPLE_MINI: GridPuzzle = buildGridPuzzle({
  id: 'sample-1',
  title: 'Sample Mini',
  byline: 'Supernote Puzzles',
  rows: ['SPAS#', 'TILES', 'ALIVE', 'TOKEN', '#TENT'],
  across: {
    1: 'Places for a mud bath and a massage',
    5: 'Squares on a bathroom wall',
    7: '___ and kicking',
    8: 'Coin for an arcade game',
    9: "Camper's shelter",
  },
  down: {
    1: 'Right away, in the ER',
    2: 'Voice of cockpit announcements',
    3: 'Like two peas in a pod',
    4: 'Days in a week',
    6: 'Like a posted letter',
  },
});

export const PUZZLES: Record<string, GridPuzzle> = {
  [SAMPLE_MINI.id]: SAMPLE_MINI,
};
