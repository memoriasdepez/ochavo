export const source = {
  eth: ['Ethereum · Qué es ETH', 'https://ethereum.org/what-is-ether/', 'ETH como activo nativo y pago de operaciones.'],
  bitcoinTx: ['Bitcoin Developer Guide · Transactions', 'https://developer.bitcoin.org/devguide/transactions.html', 'Entradas, salidas, cambio y comisiones de Bitcoin.'],
  pos: ['Ethereum · Proof of stake', 'https://ethereum.org/developers/docs/consensus-mechanisms/pos/', 'Validadores, capital depositado y penalizaciones.'],
  backup: ['Trezor · How to use a wallet backup', 'https://trezor.io/guides/backups-recovery/general-standards/how-to-use-a-wallet-backup', 'La copia permite recuperar el acceso y no se comparte con soporte.'],
  tags: ['XRP Ledger · Source and Destination Tags', 'https://xrpl.org/docs/concepts/transactions/source-and-destination-tags', 'Etiquetas para identificar destinatarios dentro de direcciones compartidas.'],
  approvals: ['MetaMask · Revocar autorizaciones de tokens', 'https://support.metamask.io/more-web3/learn/how-to-revoke-smart-contract-allowances-token-approvals/', 'La autorización de gasto y su revocación no equivalen a desconectar una web.'],
  swaps: ['Uniswap · Swaps', 'https://developers.uniswap.org/docs/get-started/concepts/traders/swaps', 'Intercambios y efecto de una operación sobre el precio.'],
  kraken: ['Kraken · Trading glossary', 'https://support.kraken.com/articles/115000364388-trading-glossary', 'Órdenes, libro de órdenes y liquidez.'],
  xrp: ['XRP Ledger · XRP', 'https://xrpl.org/about/xrp', 'XRP es el activo nativo; Ripple es una empresa distinta. La oferta original se creó al inicio.'],
  arb: ['Arbitrum Foundation · DAO Constitution', 'https://docs.arbitrum.foundation/dao-constitution', 'Gobernanza de ARB, propuestas y tesorería.'],
  upgrade: ['OpenZeppelin · Upgrades Plugins', 'https://docs.openzeppelin.com/upgrades-plugins/', 'Contratos actualizables y autorizaciones de actualización.'],
  circleReserve: ['Circle · Transparency', 'https://www.circle.com/transparency', 'Composición de reservas e informes de aseguramiento.'],
  lido: ['Lido · Tokens integration guide', 'https://docs.lido.fi/guides/lido-tokens-integration-guide/', 'stETH representa ETH en staking; recompensas y penalizaciones alteran el saldo.'],
  lp: ['Uniswap V2 · Understanding returns', 'https://developers.uniswap.org/docs/protocols/v2/concepts/understanding-returns', 'Comparación entre aportar liquidez y mantener los activos.'],
  aave: ['Aave · Health factor and liquidations', 'https://aave.com/help/borrowing/liquidations', 'Factor de salud, umbral y riesgo de liquidación por debajo de uno.'],
  bridge: ['Arbitrum · Bridge quickstart', 'https://docs.arbitrum.io/arbitrum-bridge/quickstart', 'Ruta estándar de retirada, espera, red de destino y activos admitidos.'],
  data: ['Ethereum · Data and analytics', 'https://ethereum.org/developers/docs/data-and-analytics/', 'Datos observables en la cadena y herramientas de análisis.'],
  btc: ['Bitcoin Developer Guide · Block chain', 'https://developer.bitcoin.org/devguide/block_chain.html', 'Prueba de trabajo, subsidio de bloque, halvings y comisiones.'],
  gas: ['Ethereum · Gas and fees', 'https://ethereum.org/developers/docs/gas/', 'Tarifa base quemada y propina del validador.'],
  sol: ['Solana · Transaction fees', 'https://solana.com/docs/core/fees', 'Comisión base y prioridad pagadas en SOL.'],
  bnb: ['BNB Chain · BNB Smart Chain introduction', 'https://docs.bnbchain.org/bnb-smart-chain/introduction/', 'BNB como activo nativo para comisiones en BNB Smart Chain.'],
  ada: ['Cardano · Delegation', 'https://docs.cardano.org/about-cardano/learn/delegation', 'Delegación de ADA conservando la posibilidad de gastar los activos.'],
  avax: ['Avalanche · Primary Network', 'https://build.avax.network/docs/primary-network', 'Funciones de las cadenas C, P y X y moneda nativa.'],
  dot: ['Polkadot · Relay chain', 'https://docs.polkadot.com/reference/polkadot-hub/consensus-and-security/relay-chain/', 'Seguridad compartida, cadenas conectadas y funciones de DOT.'],
  link: ['Chainlink · Price Feeds', 'https://docs.chain.link/data-feeds/price-feeds', 'Agregación de precios y publicación de datos para contratos.'],
  doge: ['Dogecoin · Can you put a cap on Dogecoin?', 'https://dogecoin.com/dogepedia/faq/putting-a-cap-on-dogecoin/', 'Emisión continuada a ritmo establecido, sin máximo final.'],
  tether: ['Tether · Transparency', 'https://tether.to/en/transparency/', 'Publicación de reservas y obligaciones.'],
  chains: ['Circle · Supported chains and currencies', 'https://developers.circle.com/circle-mint/references/supported-chains-and-currencies', 'Compatibilidad de moneda y red; activos nativos frente a versiones de puentes.'],
  eea: ['Circle Europe · MiCA Redemption Policy', 'https://www.circle.com/legal/mica-redemption-policy', 'Condiciones y procedimientos de reembolso para titulares del EEE.'],
};
export const table=(headers,rows,caption)=>({kind:'table',headers,rows,caption});
export const flow=(items,caption)=>({kind:'flow',items,caption});
export const bars=(labels,values,unit,caption)=>({kind:'bars',labels,values,unit,caption});
export const explore=(prompt,a,b)=>({prompt,options:[a,b].map(([label,title,body])=>({label,title,body}))});
export const learn=(title,body,takeaway,figure,exploreValue)=>({type:'learn',title,body,takeaway,...figure?{figure}:{},...exploreValue?{explore:exploreValue}:{}});
export const choice=(title,body,options,answer,explanation,hint)=>({type:'choice',title,body,options:options.map(text=>({text})),answer,explanation,hint});
export const multi=(title,body,options,answers,explanation,hint)=>({type:'multi',title,body,options:options.map(text=>({text})),answers,explanation,hint});
export const numeric=(title,body,answer,unit,explanation,hint,tolerance=0.01)=>({type:'numeric',title,body,answer,unit,tolerance,explanation,hint});
export const match=(title,body,pairs,explanation,hint)=>({type:'match',title,body,pairs:pairs.map(([left,right])=>({left,right})),explanation,hint});
export const order=(title,body,items,answer,explanation,hint)=>({type:'order',title,body,items,answer,explanation,hint});
export function study(n,title,company,summary,goals,keys,steps,takeaway){
  // Stable answer placement avoids making the first option a predictable shortcut.
  for(const [i,step] of steps.entries())if(step.options){
    const count=step.options.length,shift=(n*7+i*3)%count;
    step.options=[...step.options.slice(shift),...step.options.slice(0,shift)];
    if(step.type==='choice')step.answer=(step.answer-shift+count)%count;
    else step.answers=step.answers.map(a=>(a-shift+count)%count).sort((a,b)=>a-b);
  }
  return {id:`crypto-v2-${n}`,track:'crypto',world:114+n,revision:'cases-2026-10',lessonIds:Array.from({length:10},(_,i)=>(114+n)*10+i),learningGoals:goals,title,company,period:'Documentación consultada en octubre de 2026 · ejercicios simulados',summary,minutes:12,cover:{icon:['blocks','shield-check','coins','key-round','chart-no-axes-combined','network'][(n-1)%6],color:['#eee1f3','#e0eff5','#f9edce','#e7f1dc'][(n-1)%4]},sources:keys.map(k=>({title:source[k][0],url:source[k][1]})),steps,takeaway};
}
