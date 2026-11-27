import {BUILD_INFO} from '../src/buildInfo';

test('build info has a version name', () => {
  expect(BUILD_INFO.versionName).toMatch(/^\d+\.\d+\.\d+$/);
});
