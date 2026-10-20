import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readEmailAction, emailActionFailure, createEmailActionController} from '../src/email-action-domain.js';
import {clearPasswordFields, mountEmailActionUI} from '../src/email-action-ui.js';

const action = mode => readEmailAction(`?mode=${mode}&oobCode=one_time_code`);
function fixture(mode, overrides = {}) {
  const events = [], calls = [];
  const auth = {fixedProject: 'Ochavo'};
  const api = {
    checkActionCode: async (received, code) => { calls.push(['check', received, code]); return {operation: mode === 'recoverEmail' ? 'RECOVER_EMAIL' : 'VERIFY_EMAIL', data: {email: 'test@example.invalid'}}; },
    applyActionCode: async (received, code) => { calls.push(['apply', received, code]); },
    verifyPasswordResetCode: async (received, code) => { calls.push(['verifyReset', received, code]); return 'test@example.invalid'; },
    confirmPasswordReset: async (received, code, password) => { calls.push(['reset', received, code, password]); },
    ...overrides,
  };
  const controller = createEmailActionController({action: action(mode), auth, api, onState: state => events.push(state)});
  return {controller, events, calls, auth};
}

test('email links accept only supported actions and a single bounded code, ignoring query configuration and redirects', () => {
  assert.deepEqual(readEmailAction('?mode=verifyEmail&oobCode=a&apiKey=attacker&continueUrl=https%3A%2F%2Fattacker.invalid&lang=xx'), {mode: 'verifyEmail', code: 'a'});
  for (const query of ['', '?oobCode=a', '?mode=verifyEmail', '?mode=unknown&oobCode=a', '?mode=verifyEmail&mode=recoverEmail&oobCode=a', '?mode=verifyEmail&oobCode=a&oobCode=b', '?mode=verifyEmail&oobCode=%00', '?mode=verifyEmail&oobCode=a%20b', `?mode=verifyEmail&oobCode=${'a'.repeat(2049)}`]) assert.equal(readEmailAction(query), null);
});

test('verification checks the action type before applying to the fixed auth project, without emitting codes or redirects', async () => {
  const {controller, events, calls, auth} = fixture('verifyEmail');
  assert.equal(await controller.load(), true);
  assert.deepEqual(calls, [['check', auth, 'one_time_code'], ['apply', auth, 'one_time_code']]);
  assert.equal(events.at(-1).phase, 'verified');
  assert.ok(events.every(event => !JSON.stringify(event).includes('one_time_code')));
});

test('a recovery or reset code relabelled as verification is rejected without mutation', async () => {
  for (const operation of ['RECOVER_EMAIL', 'PASSWORD_RESET', 'VERIFY_AND_CHANGE_EMAIL']) {
    let mutated = false;
    const {controller, events} = fixture('verifyEmail', {checkActionCode: async () => ({operation, data: {email: 'a@b.invalid'}}), applyActionCode: async () => { mutated = true; }});
    assert.equal(await controller.load(), false); assert.equal(mutated, false);
    assert.equal(events.at(-1).kind, 'invalid');
  }
});

test('recovery only restores the checked email after the user confirms, and cannot be replayed', async () => {
  const {controller, calls, events} = fixture('recoverEmail');
  await controller.load(); assert.deepEqual(calls.map(call => call[0]), ['check']);
  assert.deepEqual(events.at(-1), {phase: 'recover-ready', email: 'test@example.invalid', mode: 'recoverEmail'});
  assert.equal(await controller.recover(), true);
  assert.equal(events.at(-1).phase, 'recover-done');
  assert.equal(await controller.recover(), false);
  assert.deepEqual(calls.map(call => call[0]), ['check', 'apply']);
});

test('recovery cannot proceed without a checked email or with a code for another operation', async () => {
  for (const information of [{operation: 'VERIFY_EMAIL', data: {email: 'a@b.invalid'}}, {operation: 'RECOVER_EMAIL', data: {}}]) {
    let mutated = false;
    const {controller} = fixture('recoverEmail', {checkActionCode: async () => information, applyActionCode: async () => { mutated = true; }});
    assert.equal(await controller.load(), false); assert.equal(await controller.recover(), false); assert.equal(mutated, false);
  }
});

test('password reset requires a valid code, the shared policy, and exact matching confirmation', async () => {
  const {controller, events, calls, auth} = fixture('resetPassword');
  assert.deepEqual(await controller.reset('Abcdefghij1!', 'Abcdefghij1!'), {accepted: false});
  await controller.load(); assert.equal(events.at(-1).phase, 'reset-ready');
  for (const password of ['Short1!', 'abcdefghij1!', 'ABCDEFGHIJ1!', 'Abcdefghijkl!', 'Abcdefghij1-']) {
    assert.deepEqual(await controller.reset(password, password), {accepted: false});
    assert.equal(events.at(-1).field, 'password');
  }
  for (const confirmation of ['', 'Abcdefghij1! ', 'abcdefghij1!']) {
    assert.deepEqual(await controller.reset('Abcdefghij1!', confirmation), {accepted: false});
    assert.equal(events.at(-1).field, 'confirmation');
  }
  assert.equal(calls.length, 1);
  assert.deepEqual(await controller.reset('Abcdefghij1!', 'Abcdefghij1!'), {accepted: true, succeeded: true});
  assert.deepEqual(calls.at(-1), ['reset', auth, 'one_time_code', 'Abcdefghij1!']);
  assert.equal(events.at(-1).phase, 'reset-done');
  assert.deepEqual(await controller.reset('Abcdefghij1!', 'Abcdefghij1!'), {accepted: false});
  assert.ok(events.every(event => !JSON.stringify(event).includes('Abcdefghij1!')));
});

test('invalid, expired, and network errors have distinct safe text; retry validates again before a mutation', async () => {
  assert.equal(emailActionFailure({code: 'auth/expired-action-code'}).kind, 'expired');
  assert.equal(emailActionFailure({code: 'auth/invalid-action-code'}).kind, 'invalid');
  const safe = emailActionFailure({code: 'other', message: 'SECRET_PASSWORD', customData: {oobCode: 'SECRET_CODE'}});
  assert.ok(!JSON.stringify(safe).includes('SECRET'));
  let checks = 0, applies = 0;
  const {controller, events} = fixture('verifyEmail', {
    checkActionCode: async () => { if (++checks === 1) throw {code: 'auth/network-request-failed'}; return {operation: 'VERIFY_EMAIL', data: {}}; },
    applyActionCode: async () => { applies++; },
  });
  assert.equal(await controller.load(), false); assert.equal(events.at(-1).retry, true); assert.equal(applies, 0);
  assert.equal(await controller.load(), true); assert.equal(checks, 2); assert.equal(applies, 1);
});

test('concurrent verification and late responses after disposal cannot apply or update the page', async () => {
  let release; let applies = 0;
  const pending = new Promise(resolve => { release = resolve; });
  const {controller, events} = fixture('verifyEmail', {checkActionCode: () => pending, applyActionCode: async () => { applies++; }});
  const first = controller.load(); assert.equal(await controller.load(), false);
  controller.dispose(); const count = events.length;
  release({operation: 'VERIFY_EMAIL', data: {}}); await first;
  assert.equal(applies, 0); assert.equal(events.length, count); assert.equal(await controller.load(), false);
});

test('a server password rejection allows retry while telling the UI to clear the attempted secret', async () => {
  let calls = 0;
  const {controller, events} = fixture('resetPassword', {confirmPasswordReset: async () => { if (++calls === 1) throw {code: 'auth/weak-password'}; }});
  await controller.load();
  assert.deepEqual(await controller.reset('Abcdefghij1!', 'Abcdefghij1!'), {accepted: true, succeeded: false});
  assert.equal(events.at(-1).kind, 'password');
  assert.deepEqual(await controller.reset('AnotherPass1!', 'AnotherPass1!'), {accepted: true, succeeded: true});
});

test('clearing password fields restores both independent visibility controls and clears invalid flags', () => {
  const fields = [0, 1].map(() => ({input: {value: 'SECRET', type: 'text', removeAttribute(name) { this.removed = name; }}, toggle: {textContent: 'Ocultar', setAttribute(name, value) { this[name] = value; }}}));
  clearPasswordFields(fields);
  for (const {input, toggle} of fields) { assert.equal(input.value, ''); assert.equal(input.type, 'password'); assert.equal(input.removed, 'aria-invalid'); assert.equal(toggle.textContent, 'Mostrar'); assert.equal(toggle['aria-pressed'], 'false'); }
});

test('standalone handler removes query state, uses the fixed public cloud, and contains no measurement, arbitrary links or remote assets', async () => {
  const [entry, html, config, css] = await Promise.all([
    readFile(new URL('../src/email-action.js', import.meta.url), 'utf8'), readFile(new URL('../cuenta/confirmar/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../vite.config.js', import.meta.url), 'utf8'), readFile(new URL('../src/email-action.css', import.meta.url), 'utf8'),
  ]);
  assert.match(entry, /history\.replaceState\(null, '', location\.pathname\)/);
  assert.ok(entry.indexOf('history.replaceState') < entry.indexOf('const cloud = createCloud()'));
  assert.match(entry, /const cloud = createCloud\(\)/); assert.doesNotMatch(entry, /parameters\.get\(['"]apiKey/);
  assert.doesNotMatch(entry, /import .*analytics|console\.|localStorage|sessionStorage|location\.assign|location\.replace/);
  assert.match(html, /name="referrer" content="no-referrer"/); assert.match(html, /br-mascot/); assert.doesNotMatch(html + css, /https:\/\//);
  assert.match(config, /cuenta\/confirmar\/index\.html/);
});

// Small DOM fixture exercises the real handlers, including both visibility buttons and exact-match feedback.
function uiFixture(callbacks) {
  const nodes = [];
  class Element extends EventTarget {
    constructor(tag) { super(); this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attrs = new Map(); this.value = ''; this.disabled = false; nodes.push(this); this.classList = {add: value => { this.className += ` ${value}`; }}; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(name, value) { this.attrs.set(name, value); }
    removeAttribute(name) { this.attrs.delete(name); }
    focus() { document.activeElement = this; }
    querySelector(selector) { return nodes.find(node => node.id === selector.slice(1)); }
    querySelectorAll(selector) { const descendants = node => node.children.flatMap(child => [child, ...descendants(child)]); return descendants(this).filter(node => selector === 'input, button' && ['INPUT', 'BUTTON'].includes(node.tagName)); }
  }
  const document = {createElement: tag => new Element(tag), activeElement: null};
  const root = new Element('main'); root.ownerDocument = document;
  for (const id of ['action-title', 'action-description', 'action-status', 'action-controls']) { const node = new Element('div'); node.id = id; root.append(node); }
  return {ui: mountEmailActionUI(root, callbacks), root, nodes, document};
}

test('the reset UI has two labelled, independently revealable fields and clears secrets after an attempted reset', async () => {
  const received = [];
  const {ui, nodes} = uiFixture({onReset: async (...credentials) => { received.push(credentials); return {accepted: true}; }});
  ui.update({phase: 'reset-ready'});
  const fields = nodes.filter(node => node.tagName === 'INPUT'); assert.equal(fields.length, 2);
  assert.equal(fields[0].minLength, 12); assert.equal(fields[0].autocomplete, 'new-password'); assert.equal(fields[1].autocomplete, 'new-password');
  const toggles = nodes.filter(node => node.attrs.has('aria-controls'));
  toggles[0].dispatchEvent(new Event('click')); assert.equal(fields[0].type, 'text'); assert.equal(fields[1].type, 'password');
  fields.forEach(field => { field.value = 'Abcdefghij1!'; });
  const form = nodes.find(node => node.tagName === 'FORM'); form.dispatchEvent(new Event('submit', {cancelable: true}));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(received, [['Abcdefghij1!', 'Abcdefghij1!']]);
  fields.forEach(field => { assert.equal(field.value, ''); assert.equal(field.type, 'password'); });
});

test('the reset UI focuses the mismatching confirmation and marks it as invalid', () => {
  const {ui, nodes, document} = uiFixture({}); ui.update({phase: 'reset-ready'});
  ui.update({phase: 'reset-validation', field: 'confirmation', message: 'Las contraseñas no coinciden.'});
  const confirmation = nodes.find(node => node.id === 'new-password-confirmation');
  assert.equal(document.activeElement, confirmation); assert.equal(confirmation.attrs.get('aria-invalid'), 'true');
  assert.equal(nodes.find(node => node.id === 'action-status').attrs.get('role'), 'alert');
});

test('untrusted email text is rendered as text and recovery only runs after the explicit button', () => {
  let recovered = 0;
  const {ui, nodes} = uiFixture({onRecover: () => { recovered++; }});
  ui.update({phase: 'recover-ready', email: '<img src=x onerror=alert(1)>@example.invalid'});
  assert.equal(recovered, 0); assert.equal(nodes.find(node => node.className === 'oa-recovery-email').textContent, '<img src=x onerror=alert(1)>@example.invalid');
  nodes.find(node => node.textContent === 'Restaurar mi correo anterior').dispatchEvent(new Event('click'));
  assert.equal(recovered, 1); assert.equal(nodes.filter(node => node.tagName === 'IMG').length, 0);
});
