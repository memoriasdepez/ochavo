import assert from 'node:assert/strict';
import {readFileSync,realpathSync,existsSync,readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const req=createRequire(realpathSync(path.join(root,'node_modules/@capacitor/cli/package.json')));
const plist=req('plist'),xcode=req('xcode');
const {parseStringPromise}=req('xml2js');
const text=file=>readFileSync(path.join(root,file),'utf8');
const json=file=>JSON.parse(text(file));
const info=plist.parse(text('ios/App/App/Info.plist'));
const privacy=plist.parse(text('ios/App/App/PrivacyInfo.xcprivacy'));
const pkg=json('package.json'),config=json('capacitor.config.json');
const expectedVersion=json('node_modules/@capacitor/core/package.json').version;
for(const name of ['ios','android','cli'])assert.equal(json(`node_modules/@capacitor/${name}/package.json`).version,expectedVersion,`Capacitor ${name} must align with core`);
assert.equal(info.CFBundleDisplayName,'Ochavo');
assert.equal(config.appName,info.CFBundleDisplayName);
assert.equal(config.appId,'app.brote.inversion');
assert.equal(info.UIViewControllerBasedStatusBarAppearance,true);
assert.equal(info.CFBundleShortVersionString,'$(MARKETING_VERSION)');
assert.equal(info.NSAppTransportSecurity?.NSAllowsArbitraryLoads??false,false);
const project=xcode.project(path.join(root,'ios/App/App.xcodeproj/project.pbxproj'));project.parseSync();
const objects=project.hash.project.objects;
const settings=Object.values(objects.XCBuildConfiguration).filter(x=>x&&typeof x==='object').map(x=>x.buildSettings);
assert.equal(settings.length,4);
for(const build of settings){
  assert.equal(String(build.IPHONEOS_DEPLOYMENT_TARGET),'17.5');
  if(build.PRODUCT_BUNDLE_IDENTIFIER){
    assert.equal(build.PRODUCT_BUNDLE_IDENTIFIER,'app.brote.inversion');
    assert.equal(build.MARKETING_VERSION,pkg.version);
    assert.equal(String(build.TARGETED_DEVICE_FAMILY),'1');
    assert.match(String(build.CURRENT_PROJECT_VERSION),/^\d+$/);
  }
}
const resource=Object.entries(objects.PBXFileReference).find(([,v])=>v&&typeof v==='object'&&v.path==='PrivacyInfo.xcprivacy');
assert.ok(resource,'Privacy manifest must be part of the project');
const resourceBuild=Object.entries(objects.PBXBuildFile).find(([,v])=>v&&typeof v==='object'&&v.fileRef===resource[0]);
assert.ok(resourceBuild);
assert.ok(Object.values(objects.PBXResourcesBuildPhase).some(v=>v&&typeof v==='object'&&v.files.some(f=>f.value===resourceBuild[0])),'Privacy manifest must be copied to the app bundle');
assert.equal(privacy.NSPrivacyTracking,false);
assert.deepEqual(privacy.NSPrivacyTrackingDomains,[]);
assert.ok(privacy.NSPrivacyAccessedAPITypes.some(x=>x.NSPrivacyAccessedAPIType==='NSPrivacyAccessedAPICategoryUserDefaults'&&x.NSPrivacyAccessedAPITypeReasons.includes('CA92.1')));
for(const category of ['EmailAddress','Name','UserID','ProductInteraction','CustomerSupport']){
  const entry=privacy.NSPrivacyCollectedDataTypes.find(x=>x.NSPrivacyCollectedDataType==='NSPrivacyCollectedDataType'+category);
  assert.ok(entry);assert.equal(entry.NSPrivacyCollectedDataTypeTracking,false);assert.equal(entry.NSPrivacyCollectedDataTypeLinked,true);
  assert.deepEqual(entry.NSPrivacyCollectedDataTypePurposes,category==='UserID'?['NSPrivacyCollectedDataTypePurposeAppFunctionality','NSPrivacyCollectedDataTypePurposeAnalytics']:['NSPrivacyCollectedDataTypePurposeAppFunctionality']);
}
const purchasePrivacy=privacy.NSPrivacyCollectedDataTypes.find(x=>x.NSPrivacyCollectedDataType==='NSPrivacyCollectedDataTypePurchaseHistory');
assert.ok(purchasePrivacy);assert.equal(purchasePrivacy.NSPrivacyCollectedDataTypeTracking,false);assert.equal(purchasePrivacy.NSPrivacyCollectedDataTypeLinked,true);
assert.deepEqual(purchasePrivacy.NSPrivacyCollectedDataTypePurposes,['NSPrivacyCollectedDataTypePurposeAppFunctionality','NSPrivacyCollectedDataTypePurposeAnalytics']);
const spm=text('ios/App/CapApp-SPM/Package.swift');
assert.ok(spm.includes(`exact: "${expectedVersion}"`));
for(const plugin of ['CapacitorApp','CapacitorNetwork','CapacitorPreferences'])assert.ok(spm.includes(`name: "${plugin}"`));
for(const [,relative] of spm.matchAll(/\.package\(name: "[^"]+", path: "([^"]+)"\)/g))assert.ok(existsSync(path.resolve(root,'ios/App/CapApp-SPM',relative,'Package.swift')),'Local SPM package exists: '+relative);
for(const file of ['ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png','ios/App/App/Assets.xcassets/BrandMark.imageset/viruta-mark.png']){
  const png=readFileSync(path.join(root,file));assert.equal(png.toString('hex',0,8),'89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16),1024);assert.equal(png.readUInt32BE(20),1024);assert.equal(png[24],8);assert.equal(png[25],2,'Opaque RGB icon, without alpha');
}
assert.equal(json('ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json').images[0].filename,'AppIcon-512@2x.png');
assert.ok(text('ios/App/App/Base.lproj/LaunchScreen.storyboard').includes('image="BrandMark"'));
for(const file of ['Main.storyboard','LaunchScreen.storyboard'])await parseStringPromise(text('ios/App/App/Base.lproj/'+file));
const generated=json('ios/App/App/capacitor.config.json');
assert.equal(generated.appId,config.appId);assert.equal(generated.appName,config.appName);
assert.equal(generated.ios.contentInset,'never');assert.equal(generated.ios.webContentsDebuggingEnabled,false);
assert.equal(generated.server?.url,undefined);assert.equal(generated.server?.cleartext,false);
assert.ok(existsSync(path.join(root,'ios/App/App/public',generated.server.errorPath)));
assert.equal(text('ios/App/App/public/index.html'),text('dist/index.html'),'Re-sync after the latest web build');
assert.ok(readdirSync(path.join(root,'ios/App/App/public/assets')).some(x=>x.endsWith('.js')));
function verifyWebTree(relative=''){
  for(const item of readdirSync(path.join(root,'dist',relative),{withFileTypes:true})){
    const child=path.join(relative,item.name);
    if(item.isDirectory())verifyWebTree(child);
    else assert.ok(readFileSync(path.join(root,'dist',child)).equals(readFileSync(path.join(root,'ios/App/App/public',child))),'Web resource is current: '+child);
  }
}
verifyWebTree();
console.log('iOS: proyecto y plist analizables; versión alineada; mínimo 17.5; iconos RGB 1024; manifiesto incluido; plugins SPM y web sincronizada.');
console.log('Comprobación estática únicamente. Pendiente: resolver SPM, compilar, ejecutar y generar informe de privacidad en Xcode/Mac.');
