import test from 'node:test';
import assert from 'node:assert/strict';
import {mountAccountUI} from '../src/account-ui.js';

// Exercise the real form handlers without a browser or an authentication service.
async function withDocument(run) {
  let document;
  const descendants = node => node.children.flatMap(child => [child, ...descendants(child)]);
  class Element extends EventTarget {
    constructor(tag) {
      super(); this.tagName = tag.toUpperCase(); this.children = []; this.parentElement = null;
      this.attributes = new Map(); this.dataset = {}; this.hidden = false; this.disabled = false;
      this.open = false; this.value = ''; this.required = false; this.checked = false; this.minLength = 0;
      this.classList = {add: (...names) => { this.className = [this.className, ...names].filter(Boolean).join(' '); }};
    }
    get isConnected() { return this === document.body || Boolean(this.parentElement?.isConnected); }
    set textContent(value) { this._text = value; this.replaceChildren(); }
    get textContent() { return this._text || this.children.map(child => child.textContent).join(''); }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); }
    append(...nodes) { for (const node of nodes) { node.remove(); node.parentElement = this; this.children.push(node); } }
    replaceChildren(...nodes) { this.children.forEach(node => { node.parentElement = null; }); this.children = []; this.append(...nodes); }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; }
    closest(selector) {
      for (let node = this; node; node = node.parentElement) {
        if (selector === 'dialog' && node.tagName === 'DIALOG') return node;
        if (selector === '[hidden]' && node.hidden) return node;
      }
      return null;
    }
    querySelectorAll(selector) {
      return descendants(this).filter(node => {
        if (selector === 'input') return node.tagName === 'INPUT';
        if (selector === '[aria-invalid]') return node.attributes.has('aria-invalid');
        if (selector === '[data-password-toggle]') return Boolean(node.dataset.passwordToggle);
        if (selector === 'input[type="password"], input[data-password]') return node.tagName === 'INPUT' && (node.type === 'password' || node.dataset.password);
        throw Error(`Unsupported test selector: ${selector}`);
      });
    }
    checkValidity() {
      if (this.disabled) return true;
      if (this.required && (this.type === 'checkbox' ? !this.checked : !this.value)) return false;
      return this.type !== 'email' || !this.value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.value);
    }
    focus() { document.activeElement = this; }
    showModal() { this.open = true; }
    close() { if (!this.open) return; this.open = false; this.dispatchEvent(new Event('close')); }
  }
  document = {body: new Element('body'), activeElement: null, createElement: tag => new Element(tag), getElementById: id => descendants(document.body).find(node => node.id === id)};
  for (const id of ['br-account-slot', 'br-sync-slot']) { const slot = new Element('div'); slot.id = id; document.body.append(slot); }
  const values = {document, HTMLElement: Element, requestAnimationFrame: callback => callback()};
  const prior = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, {configurable: true, writable: true, value});
  const all = () => descendants(document.body);
  const input = suffix => all().find(node => node.tagName === 'INPUT' && node.id.endsWith(`-${suffix}`));
  const submit = async field => { let form = field; while (form.tagName !== 'FORM') form = form.parentElement; form.dispatchEvent(new Event('submit', {cancelable: true})); await new Promise(resolve => setImmediate(resolve)); };
  try { await run({all, input, submit}); }
  finally { for (const [key, descriptor] of prior) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } }
}

test('login delegates existing six- and seven-character passwords to Auth, including when revealed', async () => {
  await withDocument(async ({all, input, submit}) => {
    const received = [];
    const ui = mountAccountUI({onLogin: async credentials => { received.push(credentials); return {message: 'Acceso comprobado'}; }});
    ui.update({ready: true, configured: true}); ui.open();
    all().find(node => node.getAttribute('role') === 'tab' && node.textContent === 'Acceso').dispatchEvent(new Event('click'));
    input('login-email').value = 'test@example.invalid';
    const password = input('login-password');
    for (const value of ['abc123', 'abc1234']) { password.value = value; await submit(password); }
    password.value = 'abc123';
    all().find(node => node.dataset.passwordToggle && node.getAttribute('aria-controls') === password.id).dispatchEvent(new Event('click'));
    assert.equal(password.type, 'text'); await submit(password);
    assert.deepEqual(received.map(item => item.password), ['abc123', 'abc1234', 'abc123']);
    password.value = ''; await submit(password);
    assert.equal(received.length, 3); assert.equal(password.getAttribute('aria-invalid'), 'true');
  });
});

test('registration requires twelve characters and all four character types, including when revealed', async () => {
  await withDocument(async ({all, input, submit}) => {
    const received = [];
    const ui = mountAccountUI({onSignup: async credentials => { received.push(credentials); }});
    ui.update({ready: true, configured: true}); ui.open();
    input('signup-email').value = 'test@example.invalid';
    const password = input('signup-password');
    assert.equal(password.minLength, 12);
    assert.equal(password.maxLength, 4096);
    assert.equal(password.autocomplete, 'new-password');
    const invalidValues = ['abc1234', 'abc12345', 'Abcdefghij1', 'abcdefghijkl1!', 'ABCDEFGHIJKL1!', 'Abcdefghijkl!', 'Abcdefghijkl1', 'Abcdefghij1-'];
    for (const value of invalidValues) {
      password.value = value; await submit(password);
      assert.equal(received.length, 0); assert.equal(password.getAttribute('aria-invalid'), 'true');
    }
    all().find(node => node.dataset.passwordToggle && node.getAttribute('aria-controls') === password.id).dispatchEvent(new Event('click'));
    assert.equal(password.type, 'text');
    password.value = 'Abcdefghij1'; await submit(password); assert.equal(received.length, 0);
    password.value = 'Abcdefghij1!'; input('signup-password-confirmation').value = password.value; await submit(password);
    assert.equal(received.length, 1); assert.equal(received[0].password, 'Abcdefghij1!');
    assert.equal(password.value, ''); assert.equal(password.type, 'password');
    password.value = 'Aa1!' + 'x'.repeat(4093); await submit(password); assert.equal(received.length, 1);
    assert.match(all().find(node=>node.getAttribute('role')==='alert'&&!node.hidden).textContent,/4096/);
    password.value = 'Aa1!' + 'x'.repeat(4092); input('signup-password-confirmation').value = password.value; await submit(password); assert.equal(received.length, 2);
  });
});

test('signup rejects an empty or different confirmation and sends only the original matching password',async()=>{
  await withDocument(async({all,input,submit})=>{
    const received=[],ui=mountAccountUI({onSignup:async value=>received.push(value)});
    ui.update({ready:true,configured:true});ui.open('signup');
    input('signup-email').value='confirm@example.invalid';
    const password=input('signup-password'),confirmation=input('signup-password-confirmation');
    assert.equal(confirmation.required,true);assert.equal(confirmation.autocomplete,'new-password');assert.equal(confirmation.type,'password');
    password.value=' Abcdefghij1! ';await submit(confirmation);
    assert.equal(received.length,0);assert.equal(document.activeElement,confirmation);
    assert.match(all().find(node=>node.getAttribute('role')==='alert'&&!node.hidden).textContent,/confirmarla/);
    for(const value of [' Abcdefghij2! ',' abcdefghij1! ','Abcdefghij1!']){
      confirmation.value=value;await submit(confirmation);
      assert.equal(received.length,0);assert.equal(confirmation.getAttribute('aria-invalid'),'true');
      const notice=all().find(node=>node.getAttribute('role')==='alert'&&!node.hidden).textContent;
      assert.match(notice,/no coinciden/);assert.ok(!notice.includes(password.value));
    }
    const toggle=all().find(node=>node.dataset.passwordToggle&&node.getAttribute('aria-controls')===confirmation.id);
    assert.equal(toggle.getAttribute('aria-label'),'Mostrar confirmación de contraseña');
    toggle.dispatchEvent(new Event('click'));assert.equal(confirmation.type,'text');
    confirmation.value=password.value;await submit(confirmation);
    assert.equal(received.length,1);assert.equal(received[0].password,' Abcdefghij1! ');
    assert.ok(!Object.keys(received[0]).some(key=>/confirm/i.test(key)));
    assert.equal(password.value,'');assert.equal(confirmation.value,'');assert.equal(confirmation.type,'password');
    assert.equal(toggle.getAttribute('aria-label'),'Mostrar confirmación de contraseña');
  });
});

test('editing the original password requires matching it again and closing clears both secret fields',async()=>{
  await withDocument(async({all,input,submit})=>{
    let attempts=0;const ui=mountAccountUI({onSignup:async()=>{attempts++;}});ui.update({ready:true,configured:true});ui.open('signup');
    input('signup-email').value='changed@example.invalid';
    const password=input('signup-password'),confirmation=input('signup-password-confirmation');
    password.value='Abcdefghij1!';confirmation.value=password.value;password.value='Abcdefghij2!';await submit(password);
    assert.equal(attempts,0);assert.equal(document.activeElement,confirmation);
    password.dispatchEvent(new Event('input'));assert.equal(confirmation.getAttribute('aria-invalid'),null);
    confirmation.value=password.value;
    all().find(node=>node.dataset.passwordToggle&&node.getAttribute('aria-controls')===confirmation.id).dispatchEvent(new Event('click'));
    all().find(node=>node.tagName==='DIALOG'&&node.id.endsWith('-main')).close();
    assert.equal(password.value,'');assert.equal(confirmation.value,'');assert.equal(confirmation.type,'password');
    ui.open('login');assert.equal(input('login-password-confirmation'),undefined);
    ui.open('reset');assert.equal(input('reset-password-confirmation'),undefined);
  });
});

test('newsletter signup is optional, unchecked and sends only the explicitly selected choice',async()=>{
  await withDocument(async ({input,submit})=>{
    const received=[],ui=mountAccountUI({onSignup:async value=>received.push(value)});ui.update({ready:true,configured:true});ui.open('signup');
    const choice=input('signup-newsletter'),password=input('signup-password');assert.equal(choice.checked,false);assert.equal(choice.required,false);
    input('signup-email').value='consent@example.invalid';password.value='StrongConsent2026!';input('signup-password-confirmation').value=password.value;await submit(password);assert.equal(received[0].newsletter,false);
    choice.checked=true;password.value='StrongConsent2026!';input('signup-password-confirmation').value=password.value;await submit(password);assert.equal(received[1].newsletter,true);assert.equal(choice.checked,false);
  });
});
test('signup checklist updates after input, autofill change, submission and dialog close without exposing the password', async () => {
  await withDocument(async ({all, input, submit}) => {
    const ui = mountAccountUI({onSignup: async()=>{}});
    ui.update({ready: true, configured: true}); ui.open('signup');
    const password = input('signup-password');
    const entries = () => all().filter(node => node.dataset.requirement);
    const summary = all().find(node => node.className === 'br-account-help br-account-password-summary');
    assert.equal(entries().filter(node=>!node.hidden).length,5);
    assert.equal(summary.getAttribute('aria-live'),'polite');
    password.value='abc';password.dispatchEvent(new Event('input'));
    assert.equal(entries().find(node=>node.dataset.requirement==='lowercase').dataset.met,'true');
    assert.equal(entries().find(node=>node.dataset.requirement==='uppercase').dataset.met,'false');
    password.value=' Abcdefghij1! ';password.dispatchEvent(new Event('change'));
    assert.ok(entries().every(node=>node.dataset.met==='true'));
    assert.equal(summary.textContent,'Cumple todos los requisitos.');
    assert.ok(password.getAttribute('aria-describedby').includes('-requirements'));
    assert.ok(!summary.textContent.includes(password.value));
    all().find(node=>node.tagName==='DIALOG'&&node.id.endsWith('-main')).close();
    assert.equal(password.value,'');
    assert.ok(entries().filter(node=>!node.hidden).every(node=>node.dataset.met==='false'));
    assert.match(summary.textContent,/Puedes pegar/);
    ui.open('signup');input('signup-email').value='test@example.invalid';
    password.value='abcdefghijkl1!';await submit(password);
    assert.equal(entries().find(node=>node.dataset.requirement==='uppercase').dataset.met,'false');
    assert.match(all().find(node=>node.getAttribute('role')==='alert'&&!node.hidden).textContent,/mayúscula/);
  });
});

test('deletion accepts an existing six- or seven-character password only with explicit confirmation', async () => {
  await withDocument(async ({all, input, submit}) => {
    const received = [];
    const ui = mountAccountUI({onDeleteAccount: async password => { received.push(password); }});
    ui.update({ready: true, configured: true, user: {email: 'test@example.invalid', emailVerified: true}}); ui.open();
    const openDelete = all().find(node => node.tagName === 'BUTTON' && node.textContent === 'Eliminar cuenta');
    for (const value of ['abc123', 'abc1234']) {
      openDelete.dispatchEvent(new Event('click'));
      const password = input('delete-password'), consent = input('delete-consent');
      password.value = value;
      const beforeConfirmation = received.length;
      await submit(password); assert.equal(received.length, beforeConfirmation);
      consent.checked = true; consent.dispatchEvent(new Event('change'));
      await submit(password);
      assert.equal(password.value, ''); assert.equal(consent.checked, false);
    }
    assert.deepEqual(received, ['abc123', 'abc1234']);
    openDelete.dispatchEvent(new Event('click'));
    const password = input('delete-password'), consent = input('delete-consent');
    consent.checked = true; consent.dispatchEvent(new Event('change'));
    await submit(password); assert.equal(received.length, 2); assert.equal(password.getAttribute('aria-invalid'), 'true');
  });
});

test('access loading and unavailable service keep help reachable without guest actions', async () => {
  await withDocument(async ({all}) => {
    const sections=[];
    const ui = mountAccountUI({onOpenInfo:section=>sections.push(section),onLogin:async()=>{}});
    ui.update({ready:true,configured:true,authLoading:true,accessRequired:true});
    const main=all().find(node=>node.tagName==='DIALOG'&&node.id.endsWith('-main'));
    assert.equal(main.open,false,'the exterior screen controls when a form opens');
    ui.open('login');
    assert.equal(main.open,true);
    assert.equal(all().find(node=>node.id?.endsWith('-login-email')).disabled,true);
    const privacy=all().find(node=>node.tagName==='BUTTON'&&node.textContent==='Privacidad');
    assert.equal(privacy.disabled,false);privacy.dispatchEvent(new Event('click'));
    assert.deepEqual(sections,['privacy']);
    main.dispatchEvent(new Event('cancel',{cancelable:true}));
    assert.equal(main.open,false,'Escape returns to the exterior account gate');
    ui.update({authLoading:false,ready:true,configured:false,status:'storage-error'});
    ui.open('signup');
    assert.doesNotMatch(main.textContent,/como invitado|Progreso de invitado|Copiar a mi cuenta/);
    assert.match(main.textContent,/Necesitas una cuenta para entrar en Ochavo/);
    const retry = all().find(node => node.tagName === 'BUTTON' && node.textContent === 'Reintentar');
    assert.equal(retry.hidden,true);assert.equal(retry.disabled,true);
    assert.equal(privacy.disabled,false);
  });
});

test('pending deletion disables synchronization while keeping deletion and logout available',async()=>{
  await withDocument(async({all})=>{
    const ui=mountAccountUI({onRetrySync:async()=>{},onDeleteAccount:async()=>{},onLogout:async()=>{}});
    ui.update({ready:true,configured:true,user:{email:'test@example.invalid',emailVerified:true},status:'deletion-pending'});
    const named=text=>all().find(node=>node.tagName==='BUTTON'&&node.textContent===text);
    assert.equal(named('Sincronizar de nuevo').disabled,true);
    assert.equal(named('Copiar progreso de invitado'),undefined);
    assert.equal(named('Eliminar cuenta').disabled,false);
    assert.equal(named('Cerrar sesión').disabled,false);
  });
});

test('deletion confirmations explain game data and subscription renewal before any action',async()=>{
  await withDocument(async({all})=>{
    let deletes=0;
    const ui=mountAccountUI({onDeleteAccount:async()=>{deletes++;}});
    ui.update({ready:true,configured:true,user:{email:'test@example.invalid',emailVerified:true}});
    const named=text=>all().find(node=>node.tagName==='BUTTON'&&node.textContent===text);
    assert.equal(all().find(node=>node.tagName==='DIALOG'&&node.id.endsWith('-import')),undefined);
    named('Eliminar cuenta').dispatchEvent(new Event('click'));
    const deleting=all().find(node=>node.tagName==='DIALOG'&&node.id.endsWith('-delete'));
    assert.ok(deleting.open);assert.match(deleting.textContent,/vidas, gemas, rachas y logros/);assert.match(deleting.textContent,/código de invitación/);
    assert.match(deleting.textContent,/vinculaciones de invitaciones en las que participa/);
    assert.match(deleting.textContent,/eliminar la cuenta no cancela su renovación/);
    assert.match(deleting.textContent,/se gestiona en Apple o Google Play/);
    assert.match(deleting.textContent,/retirada requiere mantenimiento/);assert.equal(deletes,0);
  });
});

test('open selects each access form and recovery remains available before sign-in',async()=>{
  await withDocument(async({all,input,submit})=>{
    const requests=[];
    const ui=mountAccountUI({onReset:async email=>{requests.push(email);return {message:'Revisa tu correo.'};}});
    ui.update({ready:true,configured:true,accessRequired:true});
    for(const mode of ['login','signup','reset']) {
      ui.open(mode);
      const selected=all().find(node=>node.getAttribute('role')==='tab'&&node.getAttribute('aria-selected')==='true');
      assert.ok(selected.id.endsWith('-'+mode));
    }
    input('reset-email').value='test@example.invalid';await submit(input('reset-email'));
    assert.deepEqual(requests,['test@example.invalid']);
  });
});

test('gate release waits for account work and does not close later voluntary account visits',async()=>{
  await withDocument(async({all,input,submit})=>{
    let finish;
    const ui=mountAccountUI({onLogin:()=>new Promise(resolve=>{finish=resolve;})});
    ui.update({ready:true,configured:true,accessRequired:true});ui.open('login');
    input('login-email').value='test@example.invalid';input('login-password').value='example-password';
    await submit(input('login-password'));
    const main=all().find(node=>node.tagName==='DIALOG'&&node.id.endsWith('-main'));
    ui.update({user:{email:'test@example.invalid',emailVerified:true},accessRequired:false});
    assert.equal(main.open,true,'the in-flight login must settle before closing');
    finish({message:'Has iniciado sesión.'});await new Promise(resolve=>setImmediate(resolve));
    assert.equal(main.open,false);
    ui.open();ui.update({status:'saved',accessRequired:false});assert.equal(main.open,true);
  });
});

test('unverified account retains verification and logout actions until the gate is released',async()=>{
  await withDocument(async({all})=>{
    let checks=0,ui;
    ui=mountAccountUI({onResendVerification:async()=>{},onLogout:async()=>{},onRefreshVerification:async()=>{
      checks++;ui.update({accessRequired:false,user:{email:'test@example.invalid',emailVerified:true}});
    }});
    ui.update({ready:true,configured:true,accessRequired:true,user:{email:'test@example.invalid',emailVerified:false}});ui.open();
    const named=text=>all().find(node=>node.tagName==='BUTTON'&&node.textContent===text);
    assert.equal(named('Reenviar correo de verificación').disabled,false);
    assert.equal(named('Cerrar sesión').disabled,false);
    named('Ya he verificado mi correo').dispatchEvent(new Event('click'));
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(checks,1);
    assert.equal(all().find(node=>node.tagName==='DIALOG'&&node.id.endsWith('-main')).open,false);
  });
});

test('a public deletion request survives sign-in instead of being dismissed by gate release',async()=>{
  await withDocument(async({all})=>{
    let deletions=0;
    const ui=mountAccountUI({onDeleteAccount:async()=>{deletions++;}});
    ui.update({ready:true,configured:true,accessRequired:true});ui.requestDeletion();
    ui.update({user:{email:'test@example.invalid',emailVerified:true},accessRequired:false});
    await Promise.resolve();
    assert.equal(all().find(node=>node.tagName==='DIALOG'&&node.id.endsWith('-delete')).open,true);
    assert.equal(deletions,0,'the confirmation must still be explicit');
  });
});

test('a signed-in account can log out while account preparation is unavailable',async()=>{
  await withDocument(async({all})=>{
    let exits=0;
    const ui=mountAccountUI({onLogout:async()=>{exits++;}});
    ui.update({ready:false,configured:false,authLoading:true,status:'storage-error',user:{uid:'account-a',email:'test@example.invalid',emailVerified:true}});
    ui.open();
    const buttons=all().filter(node=>node.tagName==='BUTTON'&&node.textContent==='Cerrar sesión');
    assert.equal(buttons.length,2,'both the recovery row and account window expose logout');
    assert.ok(buttons.every(node=>!node.disabled&&!node.closest('[hidden]')));
    await ui.logout();
    assert.equal(exits,1);
  });
});

test('a failed synchronization leaves a working logout action without deleting the account',async()=>{
  await withDocument(async({all})=>{
    let retries=0,exits=0,deletions=0;
    const ui=mountAccountUI({onRetrySync:async()=>{retries++;throw Error('No se ha podido guardar el progreso.');},onLogout:async()=>{exits++;},onDeleteAccount:async()=>{deletions++;}});
    ui.update({ready:true,configured:true,status:'error',user:{uid:'account-a',email:'test@example.invalid',emailVerified:true}});
    const retry=all().find(node=>node.tagName==='BUTTON'&&node.textContent==='Reintentar');
    retry.dispatchEvent(new Event('click'));
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(retries,1);
    assert.match(all().find(node=>node.getAttribute('role')==='alert'&&!node.hidden).textContent,/guardar el progreso/);
    const logout=all().find(node=>node.tagName==='BUTTON'&&node.textContent==='Cerrar sesión'&&!node.closest('[hidden]'));
    assert.equal(logout.disabled,false);
    logout.dispatchEvent(new Event('click'));
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(exits,1);
    assert.equal(deletions,0);
  });
});

test('a failed logout reports the error and remains available for another attempt',async()=>{
  await withDocument(async({all})=>{
    let exits=0;
    const ui=mountAccountUI({onLogout:async()=>{if(++exits===1)throw Error('La sesión sigue abierta. Vuelve a intentarlo.');}});
    ui.update({ready:true,configured:true,status:'error',user:{uid:'account-a',emailVerified:true}});
    await ui.logout();
    assert.match(all().find(node=>node.getAttribute('role')==='alert'&&!node.hidden).textContent,/sesión sigue abierta/);
    assert.ok(all().filter(node=>node.tagName==='BUTTON'&&node.textContent==='Cerrar sesión').every(node=>!node.disabled));
    await ui.logout();
    assert.equal(exits,2);
  });
});
