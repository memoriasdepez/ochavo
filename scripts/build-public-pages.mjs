import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { BUSINESS } from '../src/business.js';
import { renderLegalContent } from '../src/legal-content.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

export const PUBLIC_PAGES = Object.freeze([
  { kind: 'privacy', route: 'privacidad', title: 'Política de privacidad', description: 'Qué datos utiliza Ochavo, dónde se guardan y cómo ejercer tus derechos.' },
  { kind: 'legal', route: 'aviso-legal', title: 'Aviso legal', description: 'Quién ofrece Ochavo y cómo utilizar esta aplicación educativa.' },
  { kind: 'delete', route: 'eliminar-cuenta', title: 'Eliminar mi cuenta', description: 'Cómo eliminar tu cuenta de Ochavo desde la app o solicitarlo por correo.' },
  { kind: 'help', route: 'ayuda', title: 'Ayuda y contacto', description: 'Contacta con Ochavo para resolver dudas de acceso, progreso o contenidos.' },
]);

/** Fail before writing any output if essential publication details are absent. */
export function validateBusiness(business) {
  if (!business || typeof business !== 'object') throw Error('Faltan los datos públicos de la empresa.');
  for (const key of ['name', 'taxId', 'address', 'appVersion']) {
    if (typeof business[key] !== 'string' || !business[key].trim()) throw Error('Falta BUSINESS.' + key + '. No se generan páginas incompletas.');
  }
  for (const key of ['supportEmail', 'privacyEmail']) {
    if (typeof business[key] !== 'string' || !/^[^\s<>@"\\]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(business[key].trim())) {
      throw Error('Configura un correo válido en BUSINESS.' + key + ' antes de publicar.');
    }
  }
  if (typeof business.supportPhone !== 'string' || !/^\+[1-9]\d{7,14}$/.test(business.supportPhone)) {
    throw Error('Configura un teléfono empresarial válido en BUSINESS.supportPhone antes de publicar.');
  }
  let site;
  try { site = new URL(business.siteUrl); } catch { throw Error('BUSINESS.siteUrl debe ser una URL HTTPS pública.'); }
  if (site.protocol !== 'https:' || site.username || site.password || site.search || site.hash || site.pathname !== '/') {
    throw Error('BUSINESS.siteUrl debe ser un origen HTTPS, sin credenciales, ruta ni parámetros.');
  }
  if (typeof business.policyDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(business.policyDate)) {
    throw Error('BUSINESS.policyDate debe usar el formato AAAA-MM-DD.');
  }
  const date = new Date(business.policyDate + 'T12:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== business.policyDate) {
    throw Error('BUSINESS.policyDate no contiene una fecha válida.');
  }
  return site.origin;
}

export function renderPublicPage(kind) {
  const origin = validateBusiness(BUSINESS);
  const page = PUBLIC_PAGES.find(candidate => candidate.kind === kind);
  if (!page) throw new RangeError('Página pública desconocida.');
  const nav = PUBLIC_PAGES.map(item => '<a href="/' + item.route + '/"' +
    (item.kind === kind ? ' aria-current="page"' : '') + '>' + escape(item.title) + '</a>').join('');
  // Deliberately no script, analytics, web font requests, login or data collection.
  return '<!doctype html>\n<html lang="es">\n<head>\n' +
    '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<meta name="color-scheme" content="light dark">\n' +
    '<meta name="referrer" content="strict-origin-when-cross-origin">\n' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'self\'; base-uri \'none\'; form-action \'none\'">\n' +
    '<title>' + escape(page.title) + ' · Ochavo</title>\n' +
    '<meta name="description" content="' + escape(page.description) + '">\n' +
    '<link rel="canonical" href="' + escape(origin + '/' + page.route + '/') + '">\n' +
    '<link rel="stylesheet" href="/info.css">\n</head>\n<body>\n' +
    '<a class="skip-link" href="#contenido">Ir al contenido</a>\n' +
    '<header class="public-header"><a class="brand" href="' + escape(origin + '/') + '" aria-label="Ochavo, abrir la app">ochavo<span aria-hidden="true">.</span></a>' +
    '<a class="back-link" href="' + escape(origin + '/') + '">Volver a la app <span aria-hidden="true">↗</span></a></header>\n' +
    '<div class="public-layout"><nav class="public-nav" aria-label="Información sobre Ochavo">' + nav + '</nav>\n' +
    '<main id="contenido" tabindex="-1"><p class="eyebrow">Aprender con confianza</p><h1>' + escape(page.title) + '</h1>' +
    renderLegalContent(kind) + '</main></div>\n' +
    '<footer class="public-footer"><p><strong>Ochavo</strong> · Aprender inversión, paso a paso.</p><p>' + escape(BUSINESS.name) + '</p></footer>\n' +
    '</body>\n</html>\n';
}

const CSS = String.raw`
:root {
  color-scheme: light dark;
  --bg: #f3f5ed;
  --paper: #fffef9;
  --ink: #223c2d;
  --muted: #526253;
  --line: #d9e0cf;
  --accent: #c9ed86;
  --link: #315d34;
  --soft: #edf4e2;
  --focus: #806016;
  font-family: Nunito, ui-rounded, "Segoe UI", system-ui, sans-serif;
  font-size: 17px;
  line-height: 1.65;
  color: var(--ink);
  background: var(--bg);
}
* { box-sizing: border-box; }
body { margin: 0; }
a { color: var(--link); text-underline-offset: .18em; text-decoration-thickness: .09em; }
a:hover { text-decoration-thickness: .15em; }
a:focus-visible, main:focus-visible { outline: 3px solid var(--focus); outline-offset: 5px; border-radius: 4px; }
.skip-link { position: fixed; top: 10px; left: 12px; z-index: 2; padding: 10px 16px; background: var(--paper); transform: translateY(-180%); }
.skip-link:focus { transform: translateY(0); }
.public-header, .public-layout, .public-footer { width: min(1080px, calc(100% - 48px)); margin-inline: auto; }
.public-header { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding-block: 24px; }
.brand { font-size: 2.1rem; line-height: 1.15; letter-spacing: -.06em; font-weight: 900; color: var(--ink); text-decoration: none; }
.brand span { color: var(--link); }
.back-link { min-height: 44px; display: inline-flex; align-items: center; gap: 10px; font-weight: 750; font-size: .9rem; }
.public-layout { display: grid; grid-template-columns: 205px minmax(0, 1fr); gap: 28px; align-items: start; padding-block: 12px 40px; }
.public-nav { display: grid; gap: 8px; position: sticky; top: 22px; }
.public-nav a { display: flex; align-items: center; min-height: 46px; padding: 10px 14px; border-radius: 14px; font-size: .9rem; font-weight: 750; text-decoration: none; }
.public-nav a[aria-current] { color: var(--ink); background: var(--accent); }
.public-nav a:hover { box-shadow: inset 0 0 0 2px var(--line); }
main { min-width: 0; background: var(--paper); border: 1px solid var(--line); border-radius: 26px; padding: clamp(22px, 4vw, 48px); }
.eyebrow { margin: 0 0 8px; color: var(--muted); font-size: .75rem; font-weight: 850; letter-spacing: .07em; text-transform: uppercase; }
h1 { font-size: clamp(2rem, 4.5vw, 2.9rem); line-height: 1.12; letter-spacing: -.045em; margin: 0 0 12px; }
h2 { font-size: 1.22rem; line-height: 1.3; letter-spacing: -.015em; margin: 0 0 14px; }
p { margin-block: 0 16px; }
.br-legal-updated { color: var(--muted); font-size: .79rem; margin-bottom: 24px; }
.br-legal-summary { padding: 20px; border-radius: 17px; background: var(--soft); font-size: 1.05rem; font-weight: 650; line-height: 1.55; margin-bottom: 30px; }
.br-legal-content section { margin-top: 32px; padding-top: 28px; border-top: 1px solid var(--line); }
.br-legal-content section > :last-child { margin-bottom: 0; }
.br-legal-content li { padding-left: 4px; margin-block: 0 12px; }
.br-legal-content ul, .br-legal-content ol { padding-left: 24px; margin-block: 0 18px; }
.br-legal-content strong { font-weight: 800; }
.br-legal-contact { margin: 0; }
.br-legal-contact > div { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 12px; margin-bottom: 14px; }
.br-legal-contact dt { font-weight: 800; }
.br-legal-contact dd { margin: 0; overflow-wrap: anywhere; }
.br-legal-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-block: 20px; }
.br-legal-button { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 12px 18px; border: 1px solid #81a747; border-bottom-width: 3px; border-radius: 14px; background: var(--accent); color: #223c2d; text-align: center; text-decoration: none; font-weight: 850; line-height: 1.4; }
.br-legal-button:hover { filter: brightness(.97); }
.public-footer { display: flex; justify-content: space-between; gap: 12px; padding-block: 0 32px; color: var(--muted); font-size: .78rem; }
.public-footer p { margin: 0; }
@media (prefers-color-scheme: dark) {
  :root { --bg: #14221b; --paper: #1b2c22; --ink: #edf5e6; --muted: #b3c4ae; --line: #3b5140; --accent: #c9ed86; --link: #cfeda9; --soft: #2d4130; --focus: #efc65e; }
  .public-nav a[aria-current] { color: #223c2d; }
}
@media (max-width: 780px) {
  .public-header, .public-layout, .public-footer { width: min(720px, calc(100% - 28px)); }
  .public-layout { grid-template-columns: 1fr; gap: 18px; padding-top: 0; }
  .public-nav { position: static; display: flex; flex-wrap: wrap; gap: 5px; }
  .public-nav a { padding: 8px 12px; font-size: .81rem; }
  .public-header { padding-block: 20px; }
  .public-footer { flex-direction: column; }
}
@media (max-width: 420px) {
  :root { font-size: 16px; }
  .back-link { font-size: .82rem; }
  main { border-radius: 20px; padding: 23px 19px; }
  .br-legal-contact > div { grid-template-columns: 1fr; gap: 2px; }
  .br-legal-summary { padding: 16px; }
}
@media print {
  :root { color-scheme: light; color: #111; background: #fff; font-size: 11pt; }
  .public-header, .public-nav, .public-footer, .skip-link { display: none; }
  .public-layout { display: block; width: 100%; padding: 0; }
  main { border: 0; padding: 0; }
  .br-legal-content section { break-inside: avoid; }
  .br-legal-button { background: none; color: #111; border: 1px solid #888; }
}
`;

export async function buildPublicPages() {
  validateBusiness(BUSINESS);
  // Prepare every page before touching output, so a configuration/render error
  // cannot replace one page while leaving the others from a previous build.
  const pages = PUBLIC_PAGES.map(page => ({ ...page, html: renderPublicPage(page.kind) }));
  const publicRoot = new URL('../public/', import.meta.url);
  for (const page of pages) {
    const directory = new URL(page.route + '/', publicRoot);
    await mkdir(directory, { recursive: true });
    await writeFile(new URL('index.html', directory), page.html, 'utf8');
  }
  await writeFile(new URL('info.css', publicRoot), CSS.trim() + '\n', 'utf8');
  return pages.map(page => fileURLToPath(new URL(page.route + '/index.html', publicRoot)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const outputs = await buildPublicPages();
    console.log('Páginas públicas de Ochavo generadas: ' + outputs.length + '.');
  } catch (error) {
    console.error('No se han podido generar las páginas públicas de Ochavo: ' + error.message);
    process.exitCode = 1;
  }
}
