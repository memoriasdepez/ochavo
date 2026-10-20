import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectPath = path.join(root, 'ios/App/App.xcodeproj/project.pbxproj');
if (process.env.CI !== 'true' || !process.env.CM_BUILD_ID) {
  throw new Error('Este paso solo debe ejecutarse en una compilación de Codemagic.');
}
const project = readFileSync(projectPath, 'utf8');
const existing = [...project.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map(match => Number(match[1]));
if (!existing.length || new Set(existing).size !== 1) throw new Error('Las versiones iOS no coinciden.');
const counter = process.env.PROJECT_BUILD_NUMBER;
if (!/^[1-9]\d*$/.test(counter ?? '')) throw new Error('Falta el contador de compilaciones de Codemagic.');
// Use the project counter, shared by both workflows, to avoid reusing a build number.
// An explicit override is needed if this Codemagic application is ever recreated.
const override = process.env.OCHAVO_IOS_BUILD_NUMBER;
const next = override === undefined ? existing[0] + Number(counter) : Number(override);
if (override !== undefined && !/^[1-9]\d*$/.test(override)) throw new Error('Número de compilación no válido.');
if (!Number.isSafeInteger(next) || next <= existing[0] || next > 999999999) {
  throw new Error('La nueva compilación debe superar la versión del proyecto y usar como máximo nueve dígitos.');
}
writeFileSync(projectPath, project.replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${next};`));
console.log(`Compilación iOS para esta ejecución: ${next}. La versión visible se conserva.`);
