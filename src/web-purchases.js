import {PURCHASE_PRODUCTS,GEM_PURCHASE_PRODUCTS,purchaseError} from './purchases-domain.js';

const defaultLoadModule=()=>import('@revenuecat/purchases-js');

/** Adapt the official Web SDK to the shared controller. No balance is read here. */
export async function createWebPurchasesSDK({loadModule=defaultLoadModule,environment='production'}={}) {
  const {Purchases,LogLevel}=await loadModule();
  let instance=null,offeringsRequest=null;
  const packages=new WeakMap();
  const current=()=>{if(!instance)throw purchaseError('not-configured','');return instance;};
  const assertEnvironment=()=>{
    if(current().isSandbox()!==(environment==='sandbox'))throw purchaseError('environment-mismatch','');
  };
  const mapPackage=rcPackage=>{
    const product=rcPackage?.product;
    if(!product || ![PURCHASE_PRODUCTS.subscription,PURCHASE_PRODUCTS.lives,...Object.keys(GEM_PURCHASE_PRODUCTS)].includes(product.identifier))return null;
    const subscription=product.productType==='subscription';
    const normalized={identifier:product.identifier,priceString:product.price?.formattedPrice,
      price:product.price?.amountMicros/1_000_000,currencyCode:product.price?.currency,
      productCategory:subscription?'SUBSCRIPTION':'NON_SUBSCRIPTION',
      productType:subscription?'AUTO_RENEWABLE_SUBSCRIPTION':product.productType==='consumable'?'CONSUMABLE':'NON_CONSUMABLE',
      subscriptionPeriod:product.period?.number===1&&product.period?.unit==='month'?'P1M':product.period?'unsupported':null};
    // The exact package that supplied the displayed price is used at checkout.
    packages.set(normalized,{rcPackage,uid:current().getAppUserId()});
    return normalized;
  };
  return {
    async setLogLevel(){Purchases.setLogLevel(LogLevel.Silent);},
    async configure({apiKey,appUserID}){
      if(!appUserID?.trim())throw purchaseError('unverified','');
      instance=Purchases.configure({apiKey,appUserId:appUserID,flags:{autoCollectUTMAsMetadata:false,collectAnalyticsEvents:false}});
      assertEnvironment();
    },
    async logIn({appUserID}){
      if(!appUserID?.trim())throw purchaseError('unverified','');
      await current().changeUser(appUserID);assertEnvironment();
    },
    async getAppUserID(){return {appUserID:current().getAppUserId()};},
    async getProducts({productIdentifiers,type}){
      assertEnvironment();
      // The controller requests the subscription and life pack concurrently.
      if(!offeringsRequest)offeringsRequest=current().getOfferings({currency:'EUR'}).finally(()=>{offeringsRequest=null;});
      const offerings=await offeringsRequest;
      const products=(offerings.current?.availablePackages||[]).map(mapPackage).filter(product=>product&&productIdentifiers.includes(product.identifier)&&product.productCategory===type);
      return {products};
    },
    async getCustomerInfo(){return {customerInfo:await current().getCustomerInfo()};},
    async purchaseStoreProduct({product}){
      assertEnvironment();
      const selected=packages.get(product);
      if(!selected)throw purchaseError('product-unavailable','');
      if(selected.uid!==current().getAppUserId())throw purchaseError('identity-changed','');
      const result=await current().purchase({rcPackage:selected.rcPackage,selectedLocale:'es',defaultLocale:'es'});
      return {...result,transaction:result?.storeTransaction?{productIdentifier:result.storeTransaction.productIdentifier,transactionIdentifier:result.storeTransaction.storeTransactionId}:null};
    },
    // Web purchases already belong to the signed-in UID. There is no store receipt
    // restoration; the shared controller reconciles that UID with the server.
    async restorePurchases(){return {customerInfo:await current().getCustomerInfo()};}
  };
}
