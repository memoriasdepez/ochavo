import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createNativeSensoryAdapter } from '../src/sensory-native.js';

const native = platform => ({ isNativePlatform: () => true, getPlatform: () => platform });

test('native feedback forwards only validated effects and settings', async () => {
  const calls = [];
  const adapter = createNativeSensoryAdapter({ platform: native('android'), plugin: {
    play: async args => { calls.push(args); return { played: true, hapticPlayed: true, reason: 'played' }; },
    stop: async () => calls.push('stop'),
  } });
  assert.equal(adapter.native, true);
  assert.deepEqual(await adapter.play('correct'), { played: true, hapticPlayed: true, reason: 'played' });
  await adapter.play('chest', { haptics: false });
  await adapter.play('badge', { enabled: false });
  await adapter.play('../arbitrary-audio');
  assert.equal(await adapter.stop(), true);
  assert.deepEqual(calls, [
    { kind: 'correct', enabled: true, haptics: true },
    { kind: 'chest', enabled: true, haptics: false },
    'stop',
  ]);
});

test('unknown native support stays quiet without a web fallback', async () => {
  const plugin = { play: async () => { throw Error('unimplemented'); }, stop: async () => { throw Error('unimplemented'); } };
  const adapter = createNativeSensoryAdapter({ platform: native('ios'), plugin });
  assert.deepEqual(await adapter.play('correct'), { played: false, hapticPlayed: false, reason: 'native_unavailable' });
  assert.equal(await adapter.stop(), false);
  const web = createNativeSensoryAdapter({ platform: { isNativePlatform: () => false, getPlatform: () => 'web' }, plugin });
  assert.deepEqual(await web.play('correct'), { played: false, hapticPlayed: false, reason: 'not_native' });
  assert.equal(await web.stop(), false);
});

test('iOS plugin is linked into the native sources and both controller entry points', () => {
  const require = createRequire(realpathSync('node_modules/@capacitor/cli/package.json'));
  const xcode = require('xcode');
  const project = xcode.project('ios/App/App.xcodeproj/project.pbxproj');
  project.parseSync();
  const objects = project.hash.project.objects;
  for (const name of ['OchavoSensoryPlugin.swift', 'OchavoBridgeViewController.swift']) {
    const file = Object.entries(objects.PBXFileReference).find(([, value]) => value && typeof value === 'object' && value.path === name);
    assert.ok(file, `File reference: ${name}`);
    const build = Object.entries(objects.PBXBuildFile).find(([, value]) => value && typeof value === 'object' && value.fileRef === file[0]);
    assert.ok(build, `Build reference: ${name}`);
    assert.ok(Object.values(objects.PBXSourcesBuildPhase).some(value => value && typeof value === 'object' && value.files.some(f => f.value === build[0])));
  }
  const read = file => readFileSync(file, 'utf8');
  assert.match(read('ios/App/App/SceneDelegate.swift'), /rootViewController = OchavoBridgeViewController\(\)/);
  assert.match(read('ios/App/App/Base.lproj/Main.storyboard'), /customClass="OchavoBridgeViewController" customModule="App"/);
  assert.match(read('ios/App/App/OchavoBridgeViewController.swift'), /registerPluginInstance\(OchavoSensoryPlugin\(\)\)/);
  assert.match(read('android/app/src/main/java/app/brote/inversion/MainActivity.java'), /registerPlugin\(OchavoSensoryPlugin\.class\);\s*super\.onCreate/);
});
