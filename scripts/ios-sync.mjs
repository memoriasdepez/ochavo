import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
if(args.some(arg=>arg!=='--skip-web-build'))throw new Error('Uso: node scripts/ios-sync.mjs [--skip-web-build]');
const run=(file,argv=[])=>{
  const result=spawnSync(process.execPath,[path.join(root,file),...argv],{cwd:root,stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error(`${file} terminó con código ${result.status}`);
};
if(!existsSync(path.join(root,'ios/App/App.xcodeproj/project.pbxproj')))throw new Error('Falta el proyecto iOS. Copia la carpeta ios incluida en el paquete de traspaso.');
if(!args.includes('--skip-web-build')){
  run('scripts/build-stocks-curriculum.mjs');
  run('scripts/build-stocks-variety.mjs');
  run('scripts/build-etfs-curriculum.mjs');
  run('scripts/build-etfs-variety.mjs');
  run('scripts/build-crypto-curriculum.mjs');
  run('scripts/build-crypto-variety.mjs');
  run('scripts/build-technical-curriculum.mjs');
  run('scripts/build-cases.mjs');
  run('scripts/build-course.mjs');
  run('scripts/build-game-catalog.mjs');
  run('scripts/build-public-pages.mjs');
  run('scripts/build-release.mjs');
}
run('node_modules/@capacitor/cli/bin/capacitor',['sync','ios']);
const projectPath=path.join(root,'ios/App/App.xcodeproj/project.pbxproj');
const version=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8')).version;
if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error('La versión iOS necesita el formato mayor.menor.parche.');
const project=readFileSync(projectPath,'utf8');
writeFileSync(projectPath,project.replace(/MARKETING_VERSION = [^;]+;/g,()=>`MARKETING_VERSION = ${version};`));
// CURRENT_PROJECT_VERSION remains independent: increment it in Xcode before a new upload.
run('scripts/ios-check.mjs');
console.log('Proyecto iOS sincronizado. Esto no compila, firma ni genera un IPA.');
