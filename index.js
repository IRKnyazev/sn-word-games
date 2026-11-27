/**
 * Plugin entry. Kept tiny: everything SDK-related lives in src/main.ts.
 * @format
 */
import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {start} from './src/main';

AppRegistry.registerComponent(appName, () => App);
start();
