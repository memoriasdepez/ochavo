// Match Firebase's project policy. Length uses UTF-16 code units, as its Web SDK does.
// https://firebase.google.com/docs/auth/web/password-auth#recommended_set_a_password_policy
export const PASSWORD_POLICY = Object.freeze({
  minLength: 12,
  maxLength: 4096,
  requireUppercase: true,
  requireLowercase: true,
  requireNumeric: true,
  requireNonAlphanumeric: true,
});

// Firebase's documented set: other Unicode characters may appear in a password,
// but do not satisfy the ASCII letter, number or supported-symbol requirements.
export const FIREBASE_PASSWORD_SYMBOLS = '^$*.[]{}()?"!@#%&/\\,><\':;|_~`';
export const PASSWORD_REQUIREMENTS_TEXT = 'Usa al menos 12 caracteres, una mayúscula (A–Z), una minúscula (a–z), un número (0–9) y un símbolo como !, @ o #.';

export function inspectPassword(password) {
  const value = typeof password === 'string' ? password : '';
  const checks = [
    {id: 'minLength', label: `Al menos ${PASSWORD_POLICY.minLength} caracteres`, met: value.length >= PASSWORD_POLICY.minLength},
    {id: 'uppercase', label: 'Una mayúscula (A–Z)', met: /[A-Z]/.test(value)},
    {id: 'lowercase', label: 'Una minúscula (a–z)', met: /[a-z]/.test(value)},
    {id: 'numeric', label: 'Un número (0–9)', met: /[0-9]/.test(value)},
    {id: 'symbol', label: 'Un símbolo (por ejemplo, !, @ o #)', met: [...value].some(character => FIREBASE_PASSWORD_SYMBOLS.includes(character))},
    {id: 'maxLength', label: `Como máximo ${PASSWORD_POLICY.maxLength} caracteres`, met: value.length <= PASSWORD_POLICY.maxLength},
  ];
  const missing = checks.filter(check => !check.met).map(check => check.id);
  return {valid: missing.length === 0, checks, missing};
}

export function passwordRequirementMessage(password) {
  const result = inspectPassword(password);
  if (result.valid) return '';
  return `Revisa tu contraseña: ${result.checks.filter(check => !check.met).map(check => check.label.toLowerCase()).join('; ')}.`;
}
