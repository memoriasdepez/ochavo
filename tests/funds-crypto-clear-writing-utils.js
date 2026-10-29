import {readFileSync} from 'node:fs';
const baseline=JSON.parse(readFileSync(new URL('./fixtures/funds-crypto-clear-writing-0353-baseline.json',import.meta.url)));
// Historical Stocks tests retain their real, unchanged ETF/Cripto reference.
// Current content has separate exact-scope coverage in the new style tests.
export function beforeFundsCryptoFile(path){
 const track=path==='src/content/etfs-curriculum-v2.json'?'etfs':path==='src/content/crypto-curriculum-v2.json'?'crypto':null;
 return track?Buffer.from(JSON.stringify(baseline.before[track],null,2)+'\n'):readFileSync(new URL('../'+path,import.meta.url));
}
