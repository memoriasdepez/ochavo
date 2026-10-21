import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeReportText, supportAddress, buildSupportDraft, mountProductUI } from '../src/product-ui.js';

test('report text retains readable paragraphs but removes control characters and limits length', () => {
  assert.equal(sanitizeReportText('  Línea 1\r\nLínea\t2\u0000\u202e  '), 'Línea 1\nLínea 2');
  assert.equal(sanitizeReportText('abcdef', 4), 'abcd');
  assert.equal(sanitizeReportText({ token: 'private' }), '');
});

test('support destination cannot add mail headers, recipients or URL parameters', () => {
  assert.equal(supportAddress(' support+app@example.com '), 'support+app@example.com');
  for (const value of ['a@example.com\r\nBcc: b@example.com', 'a@example.com?bcc=b@example.com', 'a@example.com,b@example.com', 'mailto:a@example.com', '', null]) {
    assert.equal(supportAddress(value), '');
  }
});

test('report includes no context unless the user opts in', () => {
  const draft = buildSupportDraft({ category: 'progreso', text: 'No continúa el paso.', context: {
    appVersion: '0.2.0', platform: 'android', email: 'private@example.com', uid: 'private-id', token: 'private-token',
  }, email: 'support@example.com' });
  assert.equal(draft.subject, 'Ochavo · Progreso o guardado');
  assert(!draft.body.includes('0.2.0'));
  assert(!draft.body.includes('android'));
  assert(!draft.body.includes('private'));
});

test('opted-in diagnostics contain only a validated app version and platform', () => {
  const draft = buildSupportDraft({ category: 'contenido', text: 'Una explicación no coincide.', includeContext: true,
    context: { appVersion: '0.2.0', platform: 'ios', email: 'private@example.com', uid: 'private-id', token: 'private-token', user: { email: 'nested@example.com' } } });
  assert(draft.body.includes('Versión de Ochavo: 0.2.0'));
  assert(draft.body.includes('Plataforma: iPhone / iPad'));
  assert(!draft.body.includes('private'));
  assert(!draft.body.includes('nested'));
});

test('unrecognized diagnostic strings cannot smuggle identifiers into the report', () => {
  const draft = buildSupportDraft({ text: 'El botón no responde.', includeContext: true,
    context: { appVersion: '0.2.0\nUID: hidden', platform: 'web private@example.com' } });
  assert(!draft.body.includes('UID'));
  assert(!draft.body.includes('private@example.com'));
  assert(draft.body.includes('Versión de Ochavo: Sin especificar'));
  assert(draft.body.includes('Plataforma: Sin especificar'));
});

test('mailto safely encodes user punctuation and never supplies hidden recipients', () => {
  const text = 'Al pulsar: &bcc=hidden@example.com? #ñ\nNo ocurre nada.';
  const draft = buildSupportDraft({ category: 'funcionamiento', text, email: 'support@example.com' });
  const url = new URL(draft.mailto);
  assert.equal(decodeURIComponent(url.pathname), 'support@example.com');
  assert.deepEqual([...url.searchParams.keys()], ['subject', 'body']);
  assert.equal(url.searchParams.get('body'), draft.body);
  assert.equal(url.searchParams.get('subject'), draft.subject);
  assert.equal(url.hash, '');
});

test('an unknown category is not copied into a mail subject', () => {
  const draft = buildSupportDraft({ category: 'otro\r\nBcc: a@example.com', text: 'Un problema concreto.' });
  assert.equal(draft.subject, 'Ochavo · Otro problema');
  assert(!draft.body.includes('Bcc'));
});

test('missing support email still produces a copyable report without a fake mailto', () => {
  const draft = buildSupportDraft({ text: 'Quiero explicar el problema.', email: '' });
  assert.equal(draft.mailto, '');
  assert(draft.body.includes('Quiero explicar el problema.'));
});

// Minimal non-rendering DOM for controller regressions; not a browser/UI test.
async function withDocument(run) {
  let document;
  class Element extends EventTarget {
    constructor(tag) { super(); this.tagName = tag.toUpperCase(); this.children = []; this.parentElement = null; this.attributes = new Map(); this.dataset = {}; this.hidden = false; this.open = false; this.disabled = false; }
    get isConnected() { return this === document.body || Boolean(this.parentElement?.isConnected); }
    set textContent(value) { this._text = value; this.replaceChildren(); }
    get textContent() { return this._text || this.children.map(child => child.textContent).join(''); }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); }
    append(...nodes) { for (const node of nodes) { node.remove(); node.parentElement = this; this.children.push(node); } }
    replaceChildren(...nodes) { this.children.forEach(node => { node.parentElement = null; }); this.children = []; this.append(...nodes); }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; }
    closest(selector) { for (let node = this; node; node = node.parentElement) { if (selector === 'dialog' && node.tagName === 'DIALOG') return node; if (selector === '[hidden]' && node.hidden) return node; if (selector === 'a[href]' && node.tagName === 'A' && node.href) return node; } return null; }
    querySelector() { return null; }
    focus() { document.activeElement = this; }
    showModal() { this.open = true; }
    close() { if (!this.open) return; this.open = false; this.dispatchEvent(new Event('close')); }
  }
  const all = (node = document.body) => [node, ...node.children.flatMap(child => all(child))];
  document = {
    body: new Element('body'), activeElement: null,
    createElement: tag => new Element(tag),
    getElementById: id => all().find(node => node.id === id),
    querySelectorAll: selector => selector === 'dialog[open]' ? all().filter(node => node.tagName === 'DIALOG' && node.open) : [],
  };
  const slot = new Element('div'); slot.id = 'br-help-slot'; document.body.append(slot);
  const storage = new Map();
  const values = { document, HTMLElement: Element, window: { localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } } };
  const prior = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  try { await run({ document, Element, all, storage }); }
  finally { for (const [key, descriptor] of prior) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } }
}

test('manual privacy can open above Account and returns focus; automatic welcome waits', async () => {
  await withDocument(async ({ document, Element, all, storage }) => {
    const account = new Element('dialog');
    const privacy = new Element('button');
    account.append(privacy); document.body.append(account); account.showModal(); privacy.focus();
    const ui = mountProductUI();
    assert.equal(ui.maybeWelcome(), false);
    assert.equal(storage.size, 0);
    assert.equal(ui.open('privacy'), true);
    const product = all().find(node => node.className === 'br-product-dialog');
    assert.equal(account.open, true);
    assert.equal(product.open, true);
    product.close();
    assert.equal(document.activeElement, privacy);
    account.close();
    assert.equal(ui.maybeWelcome(), true);
    assert.equal(storage.get('brote.onboarding.v1'), 'seen');
    product.close();
    assert.equal(ui.maybeWelcome(), false);
    assert.equal(ui.open('welcome'), true);
    ui.dispose();
    assert.equal(product.isConnected, false);
  });
});

test('account welcome is not repeated after logout and manual help remains available', async () => {
  await withDocument(async ({all}) => {
    let owner='a';const seen=new Set();
    const ui=mountProductUI({getWelcomeOwner:()=>owner,claimWelcome:async uid=>{if(seen.has(uid))return false;seen.add(uid);return true;}});
    const dialog=all().find(node=>node.className==='br-product-dialog');
    assert.equal(await ui.maybeWelcome(),true);dialog.close();
    owner=null;assert.equal(ui.maybeWelcome(),false);
    owner='a';assert.equal(await ui.maybeWelcome(),false);
    owner='b';assert.equal(await ui.maybeWelcome(),true);dialog.close();
    assert.equal(ui.open('welcome'),true);dialog.close();ui.dispose();
  });
});

test('a late welcome result cannot open over a different account', async () => {
  await withDocument(async ({all}) => {
    let owner='a',resolve;
    const ui=mountProductUI({getWelcomeOwner:()=>owner,claimWelcome:()=>new Promise(done=>{resolve=done;})});
    const pending=ui.maybeWelcome();await Promise.resolve();owner='b';resolve(true);
    assert.equal(await pending,false);
    assert.equal(all().find(node=>node.className==='br-product-dialog').open,false);ui.dispose();
  });
});

test('internal legal links stay in the dialog and account deletion runs after close', async () => {
  await withDocument(async ({ Element, all }) => {
    let callbackSawClosed = false;
    const ui = mountProductUI({ onDeleteAccount: () => { callbackSawClosed = !product.open; } });
    const product = all().find(node => node.className === 'br-product-dialog');
    const clickLink = path => {
      const wrapper = all().find(node => node.className === 'br-product-legal');
      const anchor = new Element('a'); anchor.href = `https://ochavo.app${path}`;
      const event = new Event('click', { cancelable: true });
      Object.defineProperty(event, 'target', { value: anchor });
      wrapper.dispatchEvent(event);
      assert.equal(event.defaultPrevented, true);
    };
    for (const [path, section] of [['/privacidad/', 'privacy'], ['/aviso-legal/', 'legal'], ['/eliminar-cuenta/', 'delete'], ['/ayuda/', 'help']]) {
      ui.open('legal'); clickLink(path);
      assert.equal(product.dataset.section, section);
      assert.equal(product.open, true);
    }
    ui.open('delete'); clickLink('/?cuenta=eliminar');
    assert.equal(product.open, false);
    await Promise.resolve();
    assert.equal(callbackSawClosed, true);
    ui.dispose();
  });
});

test('help requires an account while preserving online boundaries, free gems and referral privacy',async()=>{
  await withDocument(async({all})=>{
    const ui=mountProductUI();ui.open('help');
    const text=all().find(node=>node.className==='br-product-content').textContent;
    assert.match(text,/Crea una cuenta o inicia sesión para entrar en Ochavo/);
    assert.match(text,/Necesitas conexión para entrar en tu cuenta, confirmar respuestas del recorrido/);
    assert.match(text,/Si tu sesión sigue abierta, puedes consultar las explicaciones disponibles/);
    assert.match(text,/Los casos de estudio necesitan Plus activo y conexión/);
    assert.doesNotMatch(text,/aprender como invitado|modo invitado|importa del modo/);
    assert.match(text,/no se compran con dinero ni se transfieren/);
    assert.match(text,/no se utilizan para abrir nuevos casos/);
    assert.match(text,/9,99 € al mes/);
    assert.match(text,/Las compras todavía no están disponibles/);
    assert.match(text,/paquete de 5 vidas de compra única/);
  assert.match(text,/precio será el que muestre el formulario de pago o la tienda/);
  assert.match(text,/Para compras web, usa Comprobar compras con la misma cuenta/);
    assert.match(text,/Restaurar no repone vidas ya consumidas/);
    assert.match(text,/Eliminar la cuenta o desinstalar Ochavo no cancela esa suscripción/);
    assert.match(text,/no tu nombre, correo ni respuestas/);
    ui.open('welcome');
    const welcome=all().find(node=>node.className==='br-product-content').textContent;
    assert.match(welcome,/simulaciones y casos históricos documentados/);
    assert.doesNotMatch(welcome,/Los casos son ficticios/);
    ui.dispose();
  });
});
