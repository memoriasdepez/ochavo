import {readFileSync} from 'node:fs';
import {compileRevision,parseAuthoring} from '../scripts/course-authoring.mjs';
import {refineEtfs,refineFundsCrypto} from '../scripts/funds-crypto-editorial/refine.mjs';
import {CRYPTO_CASES} from '../scripts/funds-crypto-editorial/crypto-cases.mjs';
import {CRYPTO_TRANSFER_LATE} from '../scripts/funds-crypto-editorial/crypto-transfer-late.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url));
const cache=new Map();

// Historical stock-edit tests assert the unrelated ETF/Crypto bytes from their
// original publication stage. Rebuild that real stage; do not change its hashes
// to accept the later, independently authorised 0.35.4 prose restoration.
export function beforePublishedFile(path){
  const match=path.match(/^src\/content\/(etfs|crypto)-curriculum-v2\.json$/);
  if(!match)return read(path);
  if(!cache.has(path)){
    const track=match[1],start=track==='etfs'?950:1150,parts=track==='etfs'?2:3;
    const current=JSON.parse(read(path));
    const outline=JSON.parse(read(`src/content/${track}-outline-v2.json`));
    const records=parseAuthoring(Array.from({length:parts},(_,i)=>read(`src/content/${track}-v2-authoring/part-${i+1}.txt`).toString()),outline.worlds.length*10);
    const base=compileRevision({outline,records,start,sources:current.sources});
    const historical=track==='etfs'?refineEtfs(base,records,{publishedProse:false,clearWriting:false}):refineFundsCrypto(base,records,{track,cases:CRYPTO_CASES,transfers:CRYPTO_TRANSFER_LATE,publishedProse:false,clearWriting:false});
    cache.set(path,Buffer.from(JSON.stringify(historical,null,2)+'\n'));
  }
  return cache.get(path);
}
