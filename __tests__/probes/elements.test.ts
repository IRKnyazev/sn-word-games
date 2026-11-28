import {
  describeAll,
  describeElement,
  readPoints,
} from '../../src/probes/elements';
import type {ElementLike} from '../../src/sdk/types';
import {strokeWithPoints} from '../helpers/fakes';

const throwing = (where: 'size' | 'getRange'): ElementLike => ({
  uuid: `bad-${where}`,
  type: 0,
  layerNum: 0,
  numInPage: 5,
  stroke: {
    penType: 10,
    points: {
      size: async () => {
        if (where === 'size') {
          throw new Error('206 cache full');
        }
        return 3;
      },
      getRange: async () => {
        throw new Error('native gone');
      },
    },
  },
});

describe('element description', () => {
  it('readPoints tolerates missing accessors and an empty size', async () => {
    expect(await readPoints(undefined)).toEqual([]);
    expect(
      await readPoints({size: async () => -1, getRange: async () => []}),
    ).toEqual([]);
  });

  it.each(['size', 'getRange'] as const)(
    'a stroke whose %s() throws is described with no bounds, not thrown',
    async where => {
      const info = await describeElement(throwing(where), 0);
      expect(info.bounds).toBeNull();
      expect(info.nPoints).toBe(0);
      expect(info.readError).toMatch(/cache full|native gone/);
    },
  );

  it('one unreadable stroke does not stop the rest of the page', async () => {
    const good = strokeWithPoints([
      {x: 10, y: 20},
      {x: 30, y: 40},
    ]);
    const infos = await describeAll([throwing('size'), good]);
    expect(infos).toHaveLength(2);
    expect(infos[0].readError).toBeDefined();
    expect(infos[1].readError).toBeUndefined();
    expect(infos[1].bounds).toEqual({left: 10, top: 20, right: 30, bottom: 40});
  });
});
