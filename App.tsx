/**
 * Plugin view root: the full-screen Probes menu (M0).
 * @format
 */
import React from 'react';
import {BUILD_INFO} from './src/buildInfo';
import {getContext, SDK_VERSION} from './src/main';
import {ProbeMenu} from './src/ui/ProbeMenu';

function App(): React.JSX.Element {
  const header = `v${BUILD_INFO.versionName} (${BUILD_INFO.versionCode}) ${BUILD_INFO.gitSha} · sn-plugin-lib ${SDK_VERSION}`;
  return (
    <ProbeMenu ctx={getContext()} sdkVersion={SDK_VERSION} header={header} />
  );
}

export default App;
