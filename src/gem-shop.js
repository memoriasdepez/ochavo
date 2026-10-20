import {GEM_SVG} from './badges.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const count=value=>new Intl.NumberFormat('es-ES').format(value);

/** Prices come from the exact store package; availability comes from its controller. */
export function gemShopMarkup(view={},wallet={}) {
  const products=Array.isArray(view.gemProducts)?view.gemProducts:[];
  const cards=products.filter(p=>typeof p.productId==='string'&&Number.isSafeInteger(p.gems)&&p.gems>0&&typeof p.price==='string'&&p.price.trim()).map(p=>
    `<article class="vr-gem-pack"><span aria-hidden="true">${GEM_SVG}</span><div><strong>${count(p.gems)} gemas</strong><small>Compra única</small></div><button type="button" class="br-secondary" data-vr="paid-gems" data-value="${esc(p.productId)}" ${p.canPurchase&&!view.busy&&wallet.canSpend&&!wallet.pending?'':'disabled'}>Comprar · ${esc(p.price)}</button></article>`).join('');
  const debt=Number.isSafeInteger(wallet.gemDebt)&&wallet.gemDebt>0?`<p class="vr-status">Se devolvió una compra de la que ya habías gastado ${count(wallet.gemDebt)} gemas. Esa cantidad se descontará de tu próxima compra de gemas; las que ganas aprendiendo siguen disponibles.</p>`:'';
  return `<section class="vr-gem-shop" aria-label="Comprar gemas"><p class="br-eyebrow">UN IMPULSO A TU RITMO</p><h2>Tus gemas, tus atajos.</h2><p>Recupera tus vidas diarias o salta un mundo. Puedes seguir ganando gemas al aprender y, si quieres, comprar un paquete.</p><p class="vr-gem-balance">${GEM_SVG}<strong>${count(wallet.gems||0)} gemas</strong><span>en tu cuenta</span></p>${debt}${cards?`<div class="vr-gem-packs">${cards}</div>`:`<p class="vr-status">${esc(view.message||'Estamos terminando de activar la compra de gemas. Todavía no se realizará ningún cobro.')}</p>`}<p class="br-note">Compra única, sin renovación. Las gemas se comparten con tu misma cuenta en la web y las apps; no se transfieren ni se cambian por dinero. El precio final se muestra antes de confirmar el pago.</p><button type="button" class="br-link br-wide" data-vr="refresh-purchases">Comprobar mis compras</button></section>`;
}
