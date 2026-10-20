import {readFile,writeFile} from 'node:fs/promises';
import {parseAuthoring,compileRevision} from './course-authoring.mjs';
import {refineFundsCrypto} from './funds-crypto-editorial/refine.mjs';
import {CRYPTO_CASES} from './funds-crypto-editorial/crypto-cases.mjs';
import {CRYPTO_TRANSFER_LATE} from './funds-crypto-editorial/crypto-transfer-late.mjs';
const root=new URL('../',import.meta.url);
const outline=JSON.parse(await readFile(new URL('src/content/crypto-outline-v2.json',root),'utf8'));
const records=parseAuthoring(await Promise.all(Array.from({length:3},(_,i)=>readFile(new URL('src/content/crypto-v2-authoring/part-'+(i+1)+'.txt',root),'utf8'))),outline.worlds.length*10);
const sources=[
 ['Bitcoin · transacciones','https://developer.bitcoin.org/devguide/transactions.html'],
 ['Bitcoin · reglas de bloques','https://developer.bitcoin.org/reference/block_chain.html'],
 ['Ethereum · participación y validadores','https://ethereum.org/developers/docs/consensus-mechanisms/pos/'],
 ['Ethereum · puentes','https://ethereum.org/developers/docs/bridges/'],
 ['Uniswap · comparación con mantener','https://developers.uniswap.org/docs/protocols/v2/concepts/understanding-returns'],
 ['Aave · garantías y liquidaciones','https://aave.com/help/borrowing/liquidations'],
 ['Solana · transacciones','https://solana.com/docs/core/transactions'],
 ['Solana · comisiones','https://solana.com/docs/core/fees'],
 ['Solana · staking','https://solana.com/staking'],
 ['BNB Chain · validadores','https://docs.bnbchain.org/bnb-smart-chain/validator/overview/'],
 ['XRP Ledger · consenso','https://xrpl.org/docs/concepts/consensus-protocol'],
 ['XRP Ledger · reservas de cuentas','https://xrpl.org/docs/concepts/accounts/reserves'],
 ['XRP Ledger · bloqueos condicionados','https://xrpl.org/docs/concepts/payment-types/escrow'],
 ['Cardano · delegación','https://docs.cardano.org/learn/delegation/'],
 ['Cardano · representación de transacciones','https://docs.cardano.org/about-cardano/learn/eutxo-explainer'],
 ['Avalanche · AVAX','https://build.avax.network/docs/primary-network/avax-token'],
 ['Avalanche · participación','https://build.avax.network/docs/primary-network/validate/how-to-stake'],
 ['Polkadot · recursos y capacidad','https://docs.polkadot.com/polkadot-protocol/architecture/polkadot-chain/agile-coretime/'],
 ['Chainlink · datos','https://docs.chain.link/data-feeds/overview'],
 ['Chainlink · calidad de datos','https://docs.chain.link/docs/selecting-data-feeds'],
 ['Chainlink · comunicación entre redes','https://docs.chain.link/ccip/overview'],
 ['Dogecoin · documentación','https://dogecoin.com/dogepedia/'],
 ['Tether · reservas y circulación','https://tether.to/en/transparency/'],
 ['Tether · condiciones del token','https://tether.to/public/Relevant_Information_Document_-_Tether_International%2C_S.A._de_C.V..pdf'],
 ['Circle · reservas','https://www.circle.com/transparency'],
 ['Circle · redes y versiones admitidas','https://developers.circle.com/circle-mint/supported-chains-and-currencies']
].map(([title,url])=>({title,url}));
const result=refineFundsCrypto(compileRevision({outline,records,start:1150,sources}),records,{track:'crypto',cases:CRYPTO_CASES,transfers:CRYPTO_TRANSFER_LATE});
await writeFile(new URL('src/content/crypto-curriculum-v2.json',root),JSON.stringify(result,null,2)+'\n');
console.log('Cripto: '+result.lessons.length+' lecciones, '+result.exams.length+' exámenes, '+result.groups.length+' mundos.');
