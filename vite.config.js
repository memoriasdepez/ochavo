import { defineConfig, loadEnv } from 'vite';
import {fileURLToPath} from 'node:url';
import {validateProductionBillingConfiguration} from './scripts/release-config.mjs';
export default defineConfig(({mode}) => {
  const env=loadEnv(mode,process.cwd());
  if(mode==='production'&&env.VITE_USE_EMULATORS==='true')throw new Error('No se puede publicar el modo emulador.');
  if(mode==='production')validateProductionBillingConfiguration(env);
  return {server:{port:5173,strictPort:true,fs:{deny:['.env','.env.*','*.{crt,pem}','**/.git/**','**/.secret.local','**/functions/**','**/work/billing-local/**']}},preview:{port:4173,strictPort:true},build:{target:'es2022',rollupOptions:{input:{app:fileURLToPath(new URL('./index.html',import.meta.url)),emailAction:fileURLToPath(new URL('./cuenta/confirmar/index.html',import.meta.url))}}}};
});
