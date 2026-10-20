// Optional artwork export; generated native icons are checked in.
// All platforms use the exact current web glyph, with no runtime font dependency.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const sharp=require(process.argv.find(x=>x.startsWith('--sharp='))?.slice(8)||'sharp');
const brand=JSON.parse(readFileSync(path.join(root,'assets/brand/ochavo-mark.json'),'utf8'));
const svg=readFileSync(path.join(root,'assets/brand/ochavo-mark.svg'),'utf8');
const store=path.resolve(root,'../ochavo-beta/ficha/imagenes');
const delivery=path.resolve(root,'../ochavo-android-identidad-2026-10-09');
mkdirSync(store,{recursive:true});mkdirSync(delivery,{recursive:true});
const android=path.join(root,'android/app/src/main/res');
const header='<?xml version="1.0" encoding="utf-8"?>\n';
const symbol=`    <group android:pivotX="54" android:pivotY="54" android:rotation="${brand.rotation}">\n        <path android:fillColor="@color/brote_ink" android:pathData="${brand.path}" />\n    </group>\n`;
const vector=background=>header+'<vector xmlns:android="http://schemas.android.com/apk/res/android"\n    android:width="108dp" android:height="108dp"\n    android:viewportWidth="108" android:viewportHeight="108">\n'+(background?'    <path android:fillColor="@color/brote_lime" android:pathData="M26,4 L82,4 Q104,4 104,26 L104,82 Q104,104 82,104 L13,104 Q4,104 4,95 L4,26 Q4,4 26,4 Z" />\n':'')+symbol+'</vector>\n';
// Keep the historical resource names: they are already referenced by the manifest and theme.
writeFileSync(path.join(android,'drawable/brote_mark.xml'),vector(false));
writeFileSync(path.join(android,'drawable/brote_icon.xml'),vector(true));
writeFileSync(path.join(android,'mipmap-anydpi/brote_launcher.xml'),vector(true));
let colors=readFileSync(path.join(android,'values/brote_colors.xml'),'utf8');
colors=colors.replace(/(<color name="brote_lime">)[^<]+/,'$1'+brand.background).replace(/(<color name="brote_ink">)[^<]+/,'$1'+brand.foreground);
writeFileSync(path.join(android,'values/brote_colors.xml'),colors);
// iOS and Google Play apply their own masks to square, opaque artwork.
const ios=path.join(root,'ios/App/App/Assets.xcassets');
const icon1024=path.join(ios,'AppIcon.appiconset/AppIcon-512@2x.png');
await sharp(Buffer.from(svg)).resize(1024,1024).removeAlpha().png().toFile(icon1024);
copyFileSync(icon1024,path.join(ios,'BrandMark.imageset/viruta-mark.png'));
writeFileSync(path.join(root,'ios/brand/viruta-mark.svg'),svg);
copyFileSync(icon1024,path.join(delivery,'icono-ochavo-1024.png'));
writeFileSync(path.join(delivery,'icono-ochavo-1024.svg'),svg);
const icon512=path.join(store,'icono-google-play-512.png');
await sharp(Buffer.from(svg)).resize(512,512).removeAlpha().png().toFile(icon512);
writeFileSync(path.join(store,'icono-google-play-512.svg'),svg.replace('width="1024" height="1024"','width="512" height="512"'));
copyFileSync(icon512,path.join(delivery,'icono-google-play-512.png'));
const details=[];
for(const [file,size] of [[icon512,512],[icon1024,1024]]){
  const meta=await sharp(file).metadata();
  assert.equal(meta.width,size);assert.equal(meta.height,size);assert.equal(meta.hasAlpha,false);
  details.push({file:path.relative(root,file),width:meta.width,height:meta.height,hasAlpha:meta.hasAlpha,bytes:readFileSync(file).length});
}
// The glyph fits inside the adaptive-icon safe circle (radius 33 on a 108 canvas).
const contourNumbers=[...brand.path.matchAll(/-?\d+(?:\.\d+)?/g)].map(x=>Number(x[0]));
for(let i=0;i<contourNumbers.length;i+=2)assert.ok(Math.hypot(contourNumbers[i]-54,contourNumbers[i+1]-54)<33,'Brand glyph fits the adaptive mask');
writeFileSync(path.join(delivery,'iconos-verificados.json'),JSON.stringify({brand:'Ochavo, o actual de la web',source:'assets/brand/ochavo-mark.svg',legacyNamesPreserved:true,adaptiveSafeCircle:true,details},null,2)+'\n');
console.log('Marca actual exportada a Android, iOS y Google Play; dimensiones y opacidad verificadas.');
