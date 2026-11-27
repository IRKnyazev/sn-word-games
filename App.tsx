/**
 * Plugin view root: the Puzzles menu, or the Reveal screen when REVEAL was
 * tapped on a puzzle page.
 * @format
 */
import React from 'react';
import {BUILD_INFO} from './src/buildInfo';
import {getContext, SDK_VERSION} from './src/main';
import {ProbeMenu} from './src/ui/ProbeMenu';
import {RevealScreen} from './src/ui/RevealScreen';
import {useRoute} from './src/ui/route';

function App(): React.JSX.Element {
  const route = useRoute();
  if (route.screen === 'reveal') {
    return (
      <RevealScreen
        ctx={getContext()}
        puzzleId={route.puzzleId}
        notePath={route.notePath}
      />
    );
  }
  const header = `v${BUILD_INFO.versionName} (${BUILD_INFO.versionCode}) ${BUILD_INFO.gitSha} · sn-plugin-lib ${SDK_VERSION}`;
  return (
    <ProbeMenu ctx={getContext()} sdkVersion={SDK_VERSION} header={header} />
  );
}

export default App;
