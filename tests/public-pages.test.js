import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BUSINESS} from '../src/business.js';
import {renderLegalContent} from '../src/legal-content.js';
import {validateBusiness,renderPublicPage} from '../scripts/build-public-pages.mjs';

const pages = [['privacy','privacidad'],['legal','aviso-legal'],['delete','eliminar-cuenta'],['help','ayuda']];

test('publication rejects missing contact, unsafe origins and invalid dates',()=>{
  assert.equal(validateBusiness(BUSINESS),BUSINESS.siteUrl);
  for(const change of [{supportEmail:''},{privacyEmail:'bad\r\nBcc:other@example.com'}, {siteUrl:'http://example.com'}, {siteUrl:'https://user:secret@example.com'}, {policyDate:'2026-02-30'}]) {
    assert.throws(()=>validateBusiness({...BUSINESS,...change}));
  }
});

test('every public information page works without the app or an authenticated session', async()=>{
  for(const [kind,path] of pages) {
    const html=await readFile(new URL(`../public/${path}/index.html`,import.meta.url),'utf8');
    assert.match(html,/<html[^>]+lang="es"/);
    assert.match(html,/<h1[\s>]/);
    assert.ok(html.includes(renderLegalContent(kind)),path+' must use the same information as the app');
    assert.doesNotMatch(html,/<(?:script|iframe|form)\b/i);
    assert.doesNotMatch(html,/\son\w+\s*=/i);
    assert.doesNotMatch(html,/\uFFFD/);
  }
});

test('contact links use corporate email and only the legal notice displays the public trader contacts',()=>{
  for(const [kind] of pages) {
    const html=renderLegalContent(kind);
    const visible=html.replace(/<[^>]*>/g,' ');
    assert.equal(visible.includes(BUSINESS.supportEmail),kind==='legal');
    assert.equal(visible.includes(BUSINESS.privacyEmail),kind==='legal');
    assert.equal(visible.includes(BUSINESS.supportPhone),kind==='legal');
    for(const match of html.matchAll(/<a\b([^>]*)href="mailto:([^"]*)"([^>]*)>([\s\S]*?)<\/a>/g)) {
      assert.equal(decodeURIComponent(match[2]),BUSINESS.supportEmail);
      assert.ok(match[4].trim().length>0);
      assert.doesNotMatch(match[1]+match[3],/\b(?:title|aria-label)=/);
    }
    assert.match(html,/href="mailto:/);
    assert.ok(html.includes(BUSINESS.name));
  }
});

test('public deletion offers a guarded account entry and a request channel without login',()=>{
  const html=renderLegalContent('delete');
  assert.ok(html.includes(`href="${BUSINESS.siteUrl}/?cuenta=eliminar"`));
  assert.match(html,/href="mailto:/);
  assert.match(html,/contraseña/);
  assert.match(html,/No elimina nada por sí solo/);
  assert.match(html,/manual/);
});

test('company details come from the central configuration and external legal links are isolated',()=>{
  const legal=renderLegalContent('legal');
  assert.ok(legal.includes(BUSINESS.name));
  assert.ok(legal.includes(BUSINESS.taxId));
  assert.ok(legal.includes(BUSINESS.address));
  assert.ok(BUSINESS.registry.length>0);
  assert.ok(legal.includes(BUSINESS.registry));
  assert.match(legal,/Registro Mercantil de Melilla/);
  assert.match(legal,/hoja ML 3342/);
  assert.match(legal,/inscripción 2/);
  assert.match(legal,/BORME-A-2026-102-52/);
  assert.doesNotMatch(legal,/Registro Mercantil de Madrid|tomo|folio|pendiente.{0,30}registral/i);
  for(const [kind] of pages) {
    for(const match of renderLegalContent(kind).matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
      assert.match(match[0],/rel="noopener noreferrer"/);
    }
  }
  assert.throws(()=>renderLegalContent('__proto__'),RangeError);
});

test('Ochavo branding is shared by app information and public page rendering without changing the service origin',async()=>{
  const packageInfo=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  assert.equal(BUSINESS.appVersion,packageInfo.version);
  assert.equal(BUSINESS.siteUrl,'https://ochavo.app');
  for(const [kind] of pages) {
    const html=renderPublicPage(kind);
    assert.ok(html.includes(renderLegalContent(kind)));
    assert.match(html,/<title>[^<]*Ochavo<\/title>/);
    const visible=html.replace(/<[^>]*>/g,' ');
    assert.match(visible,/Ochavo/);
    assert.doesNotMatch(visible,/\b(?:Brote|Viruta)\b/i);
    assert.doesNotMatch(html,/<(?:script|iframe|form)\b/i);
  }
});

test('deletion information distinguishes remote success, local failure and manual requests',()=>{
  for(const kind of ['privacy','delete']) {
    const html=renderLegalContent(kind);
    assert.match(html,/Firebase Authentication/);
    assert.match(html,/Firestore/);
    assert.match(html,/limpieza (?:local|falla)|limpieza falla/i);
    assert.match(html,/manual/);
    assert.match(html,/otros (?:dispositivos|teléfonos)/);
  }
  const deletion=renderLegalContent('delete');
  assert.match(deletion,/sin iniciar sesión/);
  assert.match(deletion,/No necesitas tener instalada la app/);
  assert.match(deletion,/No hay un borrado automático por enviar el correo/);
  const privacy=renderLegalContent('privacy');
  assert.match(privacy,/Estados Unidos/);
  assert.match(privacy,/Firestore está configurada en Madrid/);
  assert.match(privacy,/180 días posteriores al inicio del borrado en ese servicio/);
  assert.match(privacy,/versión de la app y la plataforma se añaden solo si marcas esa opción/);
});

test('privacy and deletion disclose the minimal marker and manual retention without promising automatic removal',()=>{
  for(const kind of ['privacy','delete']) {
    const html=renderLegalContent(kind);
    assert.match(html,/solo el identificador interno de la cuenta \(UID\) y la fecha/);
    assert.match(html,/No contiene correo, nombre, contraseña, respuestas ni progreso/);
    assert.match(html,/Este marcador no se borra automáticamente/);
    assert.match(html,/mantenimiento administrativo/);
    assert.match(html,/cuenta ya no existe en Authentication/);
    assert.match(html,/al menos dos horas/);
    assert.match(html,/no un plazo garantizado de retirada/);
    assert.match(html,/guardado de esa cuenta queda bloqueado/);
    assert.match(html,/Reintenta Eliminar cuenta o contacta desde Ayuda/);
  }
  assert.match(renderLegalContent('privacy'),/interés legítimo del artículo 6\.1\.f/);
  assert.match(renderLegalContent('help'),/su guardado puede quedar bloqueado/);
});

test('company values are HTML escaped in every information surface',async()=>{
  const source=await readFile(new URL('../src/legal-content.js',import.meta.url),'utf8');
  const unsafe={
    ...BUSINESS,
    name:'<script>bad()</script>',
    address:'"><img src=x onerror=bad()>',
    registry:'<svg onload=bad()>',
  };
  const fixture=source.replace("import { BUSINESS } from './business.js';",'const BUSINESS = '+JSON.stringify(unsafe)+';');
  const isolated=await import('data:text/javascript;base64,'+Buffer.from(fixture).toString('base64'));
  for(const [kind] of pages) {
    const html=isolated.renderLegalContent(kind);
    assert.doesNotMatch(html,/<(?:script|img|svg)\b/i);
    assert.ok(html.includes('&lt;script&gt;bad()&lt;/script&gt;'));
    assert.ok(html.includes('&lt;img src=x onerror=bad()&gt;'));
  }
  assert.ok(isolated.renderLegalContent('legal').includes('&lt;svg onload=bad()&gt;'));
});

test('privacy discloses game records and invitation associations without claiming they are all anonymous',()=>{
  const html=renderLegalContent('privacy');
  assert.match(html,/Saldo de gemas, vidas disponibles, días de actividad, racha actual y mejor racha/);
  assert.match(html,/identificador de intento/);
  assert.match(html,/no son anónimos mientras exista esa asociación/);
  assert.match(html,/vinculación entre el código y las cuentas participantes/);
  assert.match(html,/no el nombre, correo ni progreso de la persona invitada/);
  assert.match(html,/no accede a tu agenda de contactos ni envía invitaciones por ti/);
  assert.match(html,/casos históricos documentados/);
  assert.doesNotMatch(html,/Los casos del curso son ejercicios ficticios/);
});

test('help and legal copy require an account and describe the actual online boundary',()=>{
  for(const kind of ['privacy','help']){
    const html=renderLegalContent(kind);
    assert.match(html,/necesitas una cuenta|Necesitas una cuenta/);
    assert.doesNotMatch(html,/aprender como invitado|modo invitado|importaci[oó]n/i);
    assert.match(html,/casos de estudio necesitan una suscripción Plus activa y conexión/);
    assert.doesNotMatch(html,/Sin conexión[^.]*practicar (?:los )?casos/);
    assert.match(html,/conexión/);
  }
  assert.match(renderLegalContent('legal'),/confirmar respuestas del recorrido, entregas de exámenes y operaciones con gemas/);
  assert.match(renderLegalContent('legal'),/paquetes de compra opcional, todavía no disponibles/);
  assert.match(renderLegalContent('legal'),/No se transfieren a otras personas ni se canjean por efectivo/);
});

test('deletion covers game data and distinguishes other accounts invitation receipts',()=>{
  const html=renderLegalContent('delete');
  assert.match(html,/vidas, gemas, rachas, insignias, casos desbloqueados y registros/);
  assert.match(html,/código de invitación/);
  assert.match(html,/vinculaciones de invitaciones en las que participa/);
  assert.match(renderLegalContent('privacy'),/vinculaciones de invitaciones en las que participa/);
  assert.match(html,/comprobantes sin nombre, correo ni identificador del invitado/);
  assert.match(html,/recompensa de esa otra cuenta/);
  assert.match(html,/eliminación puede quedar incompleta/);
});

test('prepared purchases disclose store pricing and do not present billing or ads as active',()=>{
  for(const kind of ['legal','help']) {
    const html=renderLegalContent(kind);
    assert.match(html,/Las compras todavía no están disponibles/);
    assert.match(html,/9,99 € al mes/);
    assert.match(html,/vidas ilimitadas y acceso a todos los casos mientras esté activa/);
    assert.match(html,/<strong>5 vidas<\/strong>, de compra única, por <strong>0,99 €<\/strong>/);
    assert.match(html,/precio final será el que muestre la tienda o el formulario de pago web antes de confirmar/);
    for(const pack of ['200 gemas por 1,99 €','600 gemas por 4,99 €','1500 gemas por 9,99 €'])assert.ok(html.includes(pack));
    assert.match(html,/sin renovación automática; comprar gemas será opcional/);
    assert.match(html,/no vuelve a añadir vidas ya consumidas ni gemas compradas ya gastadas/);
    assert.match(html,/tus gemas ganadas al aprender no se retirarán/);
    assert.match(html,/Al gastar se usarán primero las ganadas/);
    assert.match(html,/14 días naturales desde la contratación/);
    assert.match(html,/no supone renunciar a ese derecho/);
    assert.match(html,/no se pierden por el reinicio de las vidas gratuitas/);
    assert.match(html,/correo verificado y conexión/);
    assert.match(html,/no vuelve a añadir vidas ya consumidas/);
    assert.match(html,/20 gemas/);
    assert.match(html,/no (?:se utilizan|sirven) para abrir nuevos casos/);
  }
  assert.match(renderLegalContent('legal'),/No hay anuncios comerciales activos/);
  assert.match(renderLegalContent('privacy'),/anuncios de prueba/);
});

test('deletion separates account erasure from subscription cancellation and purchase records',()=>{
  for(const kind of ['privacy','legal','delete','help']) {
    const html=renderLegalContent(kind);
    assert.match(html,/Eliminar tu cuenta de Ochavo no cancela una suscripción/);
    assert.match(html,/href="https:\/\/apps\.apple\.com\/account\/subscriptions"/);
    assert.match(html,/href="https:\/\/play\.google\.com\/store\/account\/subscriptions"/);
  }
  assert.match(renderLegalContent('delete'),/no borrará automáticamente los comprobantes de compra/);
  const privacy=renderLegalContent('privacy');
  assert.match(privacy,/RevenueCat, Inc/);
  assert.match(privacy,/historial estará vinculado a tu cuenta/);
  assert.match(privacy,/RevenueCat también ofrece informes de estas compras/);
  assert.match(privacy,/sin usar ese historial para seguimiento publicitario/);
  assert.match(privacy,/Ochavo y RevenueCat no recibirán tus datos de tarjeta/);
  assert.match(privacy,/href="https:\/\/www\.revenuecat\.com\/dpa"/);
  assert.match(privacy,/no elimina por sí solo los registros de Apple, Google Play o RevenueCat/);
  assert.match(privacy,/Stripe procesará el pago/);
  assert.match(privacy,/No guardamos el número completo de tarjeta/);
  assert.match(privacy,/https:\/\/stripe.com\/es\/privacy/);
  assert.match(renderLegalContent('delete'),/Gestionar mi suscripción web/);
  assert.match(renderLegalContent('delete'),/saldos de vidas y gemas compradas cuando se habiliten/);
  assert.match(privacy,/cantidades de vidas y gemas compradas, consumidas y disponibles/);
});
