import {Image} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {BUILD_INFO} from './buildInfo';

// Scaffold entry; replaced by the probe wiring in a later commit.
export function start(): void {
  PluginManager.init();
  console.log(
    `[SupernotePuzzles] start v${BUILD_INFO.versionName} (${BUILD_INFO.versionCode}) ${BUILD_INFO.gitSha}`,
  );
  PluginManager.registerButton(1, ['NOTE'], {
    id: 100,
    name: 'Puzzles',
    icon: Image.resolveAssetSource(require('../assets/icon.png')).uri,
    showType: 1,
  });
}
