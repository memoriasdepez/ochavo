import { CRYPTO_TRANSFERS_2_6 } from './crypto-transfers-2-6.mjs';
import { CRYPTO_TRANSFERS_7_11 } from './crypto-transfers-7-11.mjs';
import { CRYPTO_TRANSFERS_12_16 } from './crypto-transfers-12-16.mjs';

export const CRYPTO_TRANSFER_EARLY = {
  ...CRYPTO_TRANSFERS_2_6,
  ...CRYPTO_TRANSFERS_7_11,
  ...CRYPTO_TRANSFERS_12_16,
};
if (Object.keys(CRYPTO_TRANSFER_EARLY).length !== 150) throw new Error('Faltan contraejemplos Cripto 1160–1309');
if (new Set(Object.values(CRYPTO_TRANSFER_EARLY).map(c => c.scene)).size !== 150) throw new Error('Contraejemplos Cripto repetidos');
