import {build, loadEnv} from 'vite';
import {readFileSync} from 'node:fs';
import {validateProductionBillingConfiguration} from './release-config.mjs';
import {validateAdsPublisherFiles} from '../src/ads-config.js';

// Do not inherit a test project's VITE_* overrides from the shell.
for (const key of Object.keys(process.env)) if (key.startsWith('VITE_')) delete process.env[key];
process.env.VITE_USE_EMULATORS = 'false';
const expected = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(line => /^VITE_FIREBASE_\w+=/.test(line)).map(line => {
  const split = line.indexOf('=');
  return [line.slice(0, split), line.slice(split + 1).trim().replace(/^['"]|['"]$/g, '')];
}));
const actual = loadEnv('production', process.cwd(), 'VITE_');
if (actual.VITE_FIREBASE_PROJECT_ID !== 'brote-62d26' || actual.VITE_USE_EMULATORS !== 'false') throw new Error('Unexpected publication environment.');
for (const [key, value] of Object.entries(expected)) {
  if (actual[key] !== value) throw new Error('Production Firebase configuration differs from the approved local configuration: ' + key);
}
validateProductionBillingConfiguration(actual);
validateAdsPublisherFiles(actual,{appAdsTxt:readFileSync('public/app-ads.txt','utf8'),adsTxt:readFileSync('public/ads.txt','utf8')});
await build({mode: 'production'});
