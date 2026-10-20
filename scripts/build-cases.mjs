// Rebuild the current cases from their reviewed authoring sources. Historical
// case files are deliberately not regenerated or assigned to a different world.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
for (const name of ['stocks-v2','etfs-v2','crypto-v2','build-technical']) {
  const result=spawnSync(process.execPath,[fileURLToPath(new URL(`./cases-authoring/${name}.mjs`,import.meta.url))],{stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error(`No se pudieron generar los casos: ${name}.`);
}
