import {validateAdsRelease} from '../src/ads-config.js';
const PRODUCTION_PROJECT = 'brote-62d26';
export const PRODUCTION_BILLING_URL = 'https://europe-west1-brote-62d26.cloudfunctions.net/billing';
const publicKeyPatterns = {
  VITE_REVENUECAT_ANDROID_KEY: /^goog_[A-Za-z0-9]+$/,
  VITE_REVENUECAT_IOS_KEY: /^appl_[A-Za-z0-9]+$/,
  VITE_REVENUECAT_WEB_KEY: /^rcb_(?!sb_)[A-Za-z0-9_.-]+$/,
};

/** Production assets must never turn a test receipt into a real account benefit. */
export function validateProductionBillingConfiguration(env = {}) {
  validateAdsRelease(env);
  if ((env.VITE_BILLING_ENVIRONMENT || 'production') !== 'production') {
    throw new Error('Las compras de prueba requieren una compilación y un proyecto Firebase separados de producción.');
  }
  for (const [name, pattern] of Object.entries(publicKeyPatterns)) {
    const value = env[name] || '';
    if (value && !pattern.test(value)) throw new Error('Clave pública de compras no válida para publicación: ' + name);
  }
  const endpoint = env.VITE_BILLING_API_URL || '';
  const hasBillingConfiguration = endpoint || Object.keys(publicKeyPatterns).some(key => !!env[key]);
  if (hasBillingConfiguration && env.VITE_FIREBASE_PROJECT_ID !== PRODUCTION_PROJECT) {
    throw new Error('Las compras de publicación deben usar el proyecto Firebase aprobado.');
  }
  // This endpoint is explicitly allowed by the published Content-Security-Policy.
  // Do not accept a test backend, credential-bearing URL, redirect or arbitrary host.
  if (endpoint && endpoint !== PRODUCTION_BILLING_URL) {
    throw new Error('El servidor de compras no coincide con el servidor aprobado para publicación.');
  }
}
