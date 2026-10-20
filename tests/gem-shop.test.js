import test from 'node:test';
import assert from 'node:assert/strict';
import {gemShopMarkup} from '../src/gem-shop.js';
const pack={productId:'ochavo_gems_200',gems:200,price:'1,99 €',canPurchase:true};
test('gem shop shows the provider price and approved SKU, and blocks purchases during balance uncertainty',()=>{
  const ready=gemShopMarkup({gemProducts:[pack]},{gems:600,canSpend:true});
  assert.match(ready,/200 gemas/);assert.match(ready,/Comprar · 1,99 €/);assert.match(ready,/data-value="ochavo_gems_200"/);assert.doesNotMatch(ready,/disabled/);
  for(const wallet of [{canSpend:false},{canSpend:true,pending:true}])assert.match(gemShopMarkup({gemProducts:[pack]},wallet),/disabled/);
  assert.match(gemShopMarkup({gemProducts:[pack],busy:true},{canSpend:true}),/disabled/);
});
test('gem shop cannot invent a price when product or payment service is missing',()=>{
  const unavailable=gemShopMarkup({},{});assert.doesNotMatch(unavailable,/data-vr="paid-gems"/);assert.match(unavailable,/Todavía no se realizará ningún cobro/);
  assert.doesNotMatch(gemShopMarkup({gemProducts:[{...pack,price:null}]},{}),/data-vr="paid-gems"/);
});
test('store display values cannot inject controls or markup',()=>{
  const html=gemShopMarkup({gemProducts:[{...pack,productId:'<script>',price:'<img src=x onerror=alert(1)>'}],message:'<script>'},{gems:20,canSpend:true});
  assert.doesNotMatch(html,/<script>|<img src=x/);assert.match(html,/&lt;img/);
});
test('a refunded purchase with spent gems explains the deduction before another checkout',()=>{
  assert.match(gemShopMarkup({gemProducts:[pack]},{gems:100,gemDebt:180,canSpend:true}),/gastado 180 gemas/);
  assert.doesNotMatch(gemShopMarkup({gemProducts:[pack]},{gemDebt:0,canSpend:true}),/Se devolvió/);
});
