import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildAdsCspPreview,localAssetPath,createPreviewServer} from '../scripts/ads-csp-preview.mjs';

const html='<!doctype html><html><head><script type="module" crossorigin src="/assets/app-abc_123.js"></script></head><body><script type="application/json" id="course">{"hello":true}</script></body></html>';
const csp="default-src 'self'; script-src 'self' https://js.stripe.com; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.stripe.com; img-src 'self' data:; frame-src https://js.stripe.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";

test('hash authorizes exactly the static bootstrap; data remains unchanged',()=>{
  const result=buildAdsCspPreview(html,csp);
  assert.equal(result.hash,'sha256-'+createHash('sha256').update(result.bootstrap).digest('base64'));
  assert.ok(result.html.includes('<script>'+result.bootstrap+'</script>'));
  assert.ok(result.html.includes('<script type="application/json" id="course">{"hello":true}</script>'));
  assert.equal(result.entry,'/assets/app-abc_123.js');
  assert.ok(result.bootstrap.includes("document.addEventListener('DOMContentLoaded'"));
  assert.match(result.csp,/script-src 'sha256-[^']+' 'strict-dynamic';/);
  assert.ok(!result.csp.includes('unsafe-eval'));assert.ok(!result.csp.includes('nonce-'));
});

test('preview preserves connection, frame and image restrictions and hardens base URI',()=>{
  const result=buildAdsCspPreview(html,csp);
  for(const part of csp.split('; ').filter(value=>!value.startsWith('script-src ')&&!value.startsWith('base-uri ')))assert.ok(result.csp.includes(part));
  assert.ok(result.csp.includes("base-uri 'none'"));assert.ok(!result.csp.includes('googlesyndication'));
  assert.equal(result.limitations.length,5);
});

test('unexpected scripts, inline code, paths or CSP structure fail closed',()=>{
  for(const input of [html.replace('/assets/app-abc_123.js','https://evil.example/a.js'),html.replace('/assets/app-abc_123.js','/assets/../a.js'),
    html.replace('</head>','<script>alert(1)</script></head>'),html.replace('crossorigin','onload="alert(1)"'),
    html.replace('</head>','<base href="https://evil.example/"></head>'),html.replace('></script>','>alert(1)</script>'),'<html></html>']){
    assert.throws(()=>buildAdsCspPreview(input,csp));
  }
  assert.throws(()=>buildAdsCspPreview(html,csp+"; script-src-elem 'self'"));
  assert.throws(()=>buildAdsCspPreview(html,csp+"; script-src 'self'"));
});

test('preview server stays read-only and serves a header rather than a meta policy',async()=>{
  const root=await mkdtemp(join(tmpdir(),'ochavo-ads-csp-'));
  const preview=buildAdsCspPreview(html,csp),server=createPreviewServer({root,preview});
  try{
    await mkdir(join(root,'assets'));await writeFile(join(root,'assets','app-abc_123.js'),'void 0');await writeFile(join(root,'secret.env'),'private');
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
    const page=await fetch(base+'/');assert.equal(page.headers.get('content-security-policy'),preview.csp);assert.equal(await page.text(),preview.html);
    const asset=await fetch(base+'/assets/app-abc_123.js');assert.equal(await asset.text(),'void 0');
    assert.equal((await fetch(base+'/secret.env')).status,404);assert.equal((await fetch(base+'/',{method:'POST'})).status,405);
    assert.equal(localAssetPath(root,'/%2e%2e%5csecret.env'),null);assert.equal(localAssetPath(root,'/%00'),null);
  }finally{await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}
});
