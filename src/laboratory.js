import {
  calculateCompound, calculateCagr, calculateRecovery,
  calculateFees, calculateInflation, calculateFreedom,
} from './lab-calculators.js';
import {dictionaryPage,dictionaryResults,DICTIONARY_TRACKS} from './dictionary.js';

const DICTIONARY={id:'dictionary',title:'Diccionario',description:'Todas las palabras del curso, con definición y ejemplos.',tone:'purple'};

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
const decimal = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
const scientificMoney = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', notation: 'scientific', maximumFractionDigits: 2 });
const scientificNumber = new Intl.NumberFormat('es-ES', { notation: 'scientific', maximumFractionDigits: 2 });
const number = value => Math.abs(value) >= 1e12 ? scientificNumber.format(value) : decimal.format(value);
const money = value => Math.abs(value) >= 1e15 ? scientificMoney.format(value) : euro.format(value);
const percent = value => `${number(value)} %`;
const signedPercent = value => `${value > 0 ? '+' : ''}${percent(value)}`;

const field = (key, label, unit, value, help, min = 0, max = 1e12, step = 'any') => ({ key, label, unit, value, help, min, max, step });
const TOOLS = [
  {
    id: 'compound', title: 'Interés compuesto', description: 'Descubre cómo crece tu dinero con el tiempo.', tone: 'green',
    lead: 'Al invertir, lo que ganas también puede generar nuevas ganancias. Prueba qué ocurre al añadir dinero cada mes y dejarlo invertido.',
    calculate: calculateCompound,
    fields: [
      field('initial', 'Dinero con el que empiezas', '€', 1000, 'La cantidad que inviertes hoy.'),
      field('monthly', 'Dinero que añades cada mes', '€/mes', 100, 'Puedes dejarlo en cero si no vas a añadir más.'),
      field('years', 'Tiempo invertido', 'años', 20, 'El cálculo redondea el tiempo al mes más cercano.', 0, 100),
      field('annualRate', 'Ganancia anual que supones', '%/año', 7, 'Es una hipótesis. Puede ser negativa si quieres simular pérdidas.', -99, 100),
    ],
    assumptions: 'Suponemos una rentabilidad anual constante, reinvertimos las ganancias y añadimos el dinero al final de cada mes. No incluimos comisiones, impuestos ni inflación.',
  },
  {
    id: 'cagr', title: 'CAGR', description: 'Convierte un resultado total en una tasa anual.', tone: 'blue',
    lead: 'CAGR es la tasa de crecimiento anual compuesto. Te dice qué porcentaje constante cada año convertiría la cantidad inicial en la final.',
    calculate: calculateCagr,
    fields: [
      field('initial', 'Valor al principio', '€', 1000, 'Cuánto valía la inversión al empezar.', 0.01),
      field('final', 'Valor al final', '€', 1800, 'Cuánto vale al terminar el período.'),
      field('years', 'Tiempo transcurrido', 'años', 5, 'Por ejemplo, 0,5 años son seis meses.', 1 / 12, 100),
    ],
    assumptions: 'Esta tasa resume el cambio entre dos valores; no muestra los altibajos de cada año. Solo sirve para comparar una inversión sin aportaciones ni retiradas durante el período.',
  },
  {
    id: 'recovery', title: 'Después de una caída', description: 'Calcula la subida necesaria para recuperarte.', tone: 'coral',
    lead: 'Una caída y una subida del mismo porcentaje no se compensan: la subida empieza desde una cantidad menor. Mira qué subida necesitas para volver al valor inicial.',
    calculate: calculateRecovery,
    fields: [field('lossPercent', 'Cuánto ha caído la inversión', '%', 30, 'Introduce la caída como un número positivo: por ejemplo, 30.', 0, 100)],
    assumptions: 'Comparamos el mismo dinero antes y después de la caída, sin añadir aportaciones. La subida necesaria es un cálculo, no una predicción de recuperación.',
  },
  {
    id: 'fees', title: 'Comisiones', description: 'Ve cuánto pesan los costes a lo largo de los años.', tone: 'purple',
    lead: 'Una comisión pequeña se cobra una y otra vez. Compara cuánto acumularías con una comisión anual y cuánto acumularías sin ese coste.',
    calculate: calculateFees,
    fields: [
      field('initial', 'Dinero con el que empiezas', '€', 10000, 'La cantidad que inviertes hoy.'),
      field('monthly', 'Dinero que añades cada mes', '€/mes', 100, 'Las aportaciones se hacen al final de cada mes.'),
      field('years', 'Tiempo invertido', 'años', 20, 'El cálculo redondea el tiempo al mes más cercano.', 0, 100),
      field('annualRate', 'Ganancia anual antes de comisiones', '%/año', 7, 'La misma hipótesis de rentabilidad en ambas opciones.', -99, 100),
      field('annualFee', 'Comisión anual', '%/año', 1, 'Se aplica al dinero invertido, no solo a las ganancias.', 0, 25),
    ],
    assumptions: 'Suponemos una rentabilidad constante. Aplicamos la comisión sobre el patrimonio; repartimos su efecto anual entre los meses. No incluimos costes de compra o venta, impuestos ni inflación.',
  },
  {
    id: 'inflation', title: 'Inflación', description: 'Comprueba qué podrás comprar con tu dinero.', tone: 'amber',
    lead: 'Cuando suben los precios, el mismo dinero compra menos. Compara cuánto costaría en el futuro lo que hoy compras y cuánto poder de compra conservarías.',
    calculate: calculateInflation,
    fields: [
      field('amount', 'Dinero de hoy', '€', 1000, 'La cantidad cuyo poder de compra quieres comparar.'),
      field('years', 'Tiempo que pasa', 'años', 10, 'Cuántos años quieres proyectar.', 0, 100),
      field('inflationRate', 'Subida anual de los precios', '%/año', 3, 'Una inflación negativa representa una bajada de precios.', -99, 100),
    ],
    assumptions: 'Suponemos que los precios cambian al mismo ritmo cada año y que el dinero no genera rentabilidad. Es una comparación de poder de compra, no una previsión de precios.',
  },
  {
    id: 'freedom', title: 'Libertad financiera', description: 'Explora el capital necesario para cubrir tus gastos.', tone: 'teal',
    lead: '¿Qué capital necesitarías para cubrir tus gastos con retiradas de tu inversión? Estima un objetivo y el tiempo que tardarías en alcanzarlo con tus aportaciones.',
    calculate: calculateFreedom,
    fields: [
      field('monthlyExpenses', 'Gastos que quieres cubrir al mes', '€/mes', 1500, 'Cuánto necesitas para mantener tu nivel de vida.'),
      field('withdrawalRate', 'Porcentaje que retirarías cada año', '%/año', 4, 'El 4 % es un ejemplo para simular, no una tasa garantizada.', 0.01, 25),
      field('initial', 'Dinero que ya tienes invertido', '€', 10000, 'El capital del que partes.'),
      field('monthly', 'Dinero que añadirías cada mes', '€/mes', 300, 'Las aportaciones se hacen al final de cada mes.'),
      field('annualRate', 'Ganancia anual que supones', '%/año', 7, 'La rentabilidad constante que usaremos mientras acumulas capital.', -99, 100),
    ],
    assumptions: 'El objetivo es tus gastos anuales divididos entre el porcentaje de retirada. Simulamos hasta 100 años con rentabilidad y gastos constantes, sin impuestos, comisiones ni inflación. No garantiza que el capital dure ni que puedas mantener esas retiradas: las pérdidas y su momento también importan.',
  },
];

function icon(id) {
  const shapes = {
    compound: '<path d="M21 83h18V65H21Zm28 0h18V48H49Zm28 0h18V26H77Z" fill="currentColor" fill-opacity=".16"/><path d="M21 83h18V65H21Zm28 0h18V48H49Zm28 0h18V26H77Z"/><path d="m24 49 29-18 31-14m-15-1 17-2-4 16"/><circle cx="25" cy="23" r="7" fill="currentColor" fill-opacity=".2"/>',
    cagr: '<rect x="20" y="27" width="67" height="59" rx="11" fill="currentColor" fill-opacity=".1"/><path d="M20 45h67M37 20v14m34-14v14"/><path d="m34 74 14-14 13 7 18-19m-12 0h12v12"/><circle cx="95" cy="90" r="8" fill="currentColor" fill-opacity=".2"/>',
    recovery: '<path d="M20 25v62h75"/><path d="m29 38 25 28 30-40"/><path d="M71 26h13v14"/><path d="M30 39 54 66 84 26" stroke-width="7"/><circle cx="54" cy="66" r="6" fill="currentColor" stroke="none"/>',
    fees: '<rect x="21" y="27" width="48" height="59" rx="10" fill="currentColor" fill-opacity=".16"/><path d="M32 40h23M32 52h15M31 66l6 4 6-4 6 4 6-4"/><circle cx="81" cy="65" r="23" fill="var(--oc-lab-icon-paper, #fff)"/><path d="m72 76 18-22"/><circle cx="72" cy="56" r="4"/><circle cx="91" cy="74" r="4"/>',
    inflation: '<path d="M23 39h66l-8 42H33Z" fill="currentColor" fill-opacity=".12"/><path d="M23 39h66l-8 42H33ZM45 39V25a13 13 0 0 1 26 0v14"/><path d="M20 92h74"/><path d="m87 33 13-17m-11 0h11v11"/><path d="M47 52h20m-23 9h20m2-12c-9-6-20 0-20 12s11 18 20 12"/>',
    freedom: '<path d="M23 53 58 24l35 29M30 50v38h56V50" fill="currentColor" fill-opacity=".12"/><path d="M47 88V67h21v21"/><path d="M83 27h19m-7-9v18"/><path d="m17 28 9 4-9 4"/><circle cx="59" cy="49" r="7" fill="currentColor" fill-opacity=".25"/>',
    dictionary: '<path d="M59 29c-13-9-27-9-39-4v58c13-5 26-4 39 4 13-8 26-9 39-4V25c-12-5-26-5-39 4Z" fill="currentColor" fill-opacity=".12"/><path d="M59 29v58M30 40h17M30 51h17M71 40h17M71 51h17M30 62h13M71 62h13"/>',
  };
  return `<svg class="oc-lab-icon" viewBox="0 0 120 112" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes[id]}</svg>`;
}

function chart(series, keys) {
  if (!series?.length) return '';
  const width = 560, height = 200, pad = 14;
  const values = series.flatMap(point => keys.map(item => point[item.key]));
  const min = Math.min(0, ...values), max = Math.max(1, ...values);
  const lastX = series.at(-1).years || 1;
  const x = value => pad + (value / lastX) * (width - pad * 2);
  const y = value => height - pad - ((value - min) / (max - min)) * (height - pad * 2);
  const paths = keys.map(item => `<polyline class="oc-calc-line oc-calc-line-${item.tone}" points="${series.map(point => `${x(point.years).toFixed(2)},${y(point[item.key]).toFixed(2)}`).join(' ')}" fill="none" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  return `<div class="oc-calc-chart"><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"><path class="oc-calc-chart-grid" d="M${pad} ${y(0)}H${width - pad}M${pad} ${pad}H${width - pad}M${pad} ${height / 2}H${width - pad}"/>${paths}</svg><div class="oc-calc-chart-axis"><span>Hoy</span><span>${decimal.format(series.at(-1).years)} años</span></div><div class="oc-calc-legend">${keys.map(item => `<span><i class="oc-calc-legend-dot oc-calc-line-${item.tone}" aria-hidden="true"></i>${item.label}</span>`).join('')}</div></div>`;
}

function bars(rows, formatter = money) {
  const maximum = Math.max(1, ...rows.map(row => Math.abs(row.value)));
  return `<div class="oc-calc-bars">${rows.map(row => `<div class="oc-calc-bar-row"><div class="oc-calc-bar-label"><span>${row.label}</span><strong>${esc(formatter(row.value))}</strong></div><div class="oc-calc-bar-track" aria-hidden="true"><span class="oc-calc-bar oc-calc-line-${row.tone}" style="width:${Math.min(100, Math.abs(row.value) / maximum * 100)}%"></span></div></div>`).join('')}</div>`;
}

function stats(items) {
  return `<div class="oc-calc-stats">${items.map(([label, value]) => `<div class="oc-calc-stat"><span>${label}</span><strong>${esc(value)}</strong></div>`).join('')}</div>`;
}

function duration(months) {
  const years = Math.floor(months / 12), rest = months % 12;
  if (!months) return 'Ya has alcanzado el objetivo';
  return [years ? `${years} ${years === 1 ? 'año' : 'años'}` : '', rest ? `${rest} ${rest === 1 ? 'mes' : 'meses'}` : ''].filter(Boolean).join(' y ');
}

function resultContent(tool, result, values) {
  let label, value, summary, visual = '', numbers = '', note = '';
  if (tool.id === 'compound') {
    label = 'Dinero al final'; value = money(result.total);
    summary = `Con esta hipótesis, tras ${decimal.format(result.years)} años habrías acumulado esta cantidad.`;
    numbers = stats([['Dinero que aportas', money(result.contributed)], [result.growth < 0 ? 'Pérdida acumulada' : 'Ganancias acumuladas', money(result.growth)]]);
    visual = chart(result.series, [{ key: 'balance', label: 'Dinero acumulado', tone: 'green' }, { key: 'contributed', label: 'Tus aportaciones', tone: 'muted' }]);
  } else if (tool.id === 'cagr') {
    label = 'Crecimiento anual equivalente'; value = signedPercent(result.cagr);
    summary = `Pasar de ${money(values.initial)} a ${money(values.final)} en ${decimal.format(values.years)} años equivale a este cambio constante cada año.`;
    numbers = stats([['Cambio total en el período', signedPercent(result.totalReturn)], ['Valor final / valor inicial', `${number(result.multiple)} veces`]]);
    visual = bars([{ label: 'Valor al principio', value: values.initial, tone: 'muted' }, { label: 'Valor al final', value: values.final, tone: 'blue' }]);
    note = 'La tasa anual equivalente no significa que hayas ganado o perdido ese porcentaje en cada año concreto.';
  } else if (tool.id === 'recovery') {
    label = result.recoverable ? 'Subida necesaria para recuperarte' : 'Se ha perdido todo el valor';
    value = result.recoverable ? `+${percent(result.requiredGain)}` : 'No basta una subida';
    summary = result.recoverable ? `Por cada 100 € iniciales, quedan ${money(result.remainingPercent)}. Esa cantidad tiene que subir ${percent(result.requiredGain)} para volver a 100 €.` : 'Si el valor llega a cero, ningún porcentaje de subida sobre cero lo devuelve al valor inicial.';
    visual = bars([{ label: 'Antes de la caída', value: 100, tone: 'muted' }, { label: 'Después de la caída', value: result.remainingPercent, tone: 'coral' }]);
  } else if (tool.id === 'fees') {
    label = 'Efecto de las comisiones al final'; value = money(result.cost);
    summary = `Tras ${decimal.format(result.years)} años, esta sería la diferencia entre ambas opciones. Incluye los costes y las ganancias que dejas de generar sobre ese dinero.`;
    numbers = stats([['Sin comisión anual', money(result.withoutFees)], ['Con comisión anual', money(result.withFees)]]);
    visual = chart(result.series, [{ key: 'withoutFees', label: 'Sin comisión', tone: 'green' }, { key: 'withFees', label: 'Con comisión', tone: 'purple' }]);
    note = `La ganancia anual después de aplicar esta comisión equivale a ${percent(result.netAnnualRate)} en el modelo.`;
  } else if (tool.id === 'inflation') {
    const priceChangePercent = ((1 + values.inflationRate / 100) ** result.years - 1) * 100;
    const powerChangePercent = (1 - (1 + values.inflationRate / 100) ** -result.years) * 100;
    label = 'Necesitarías en el futuro'; value = money(result.futureEquivalent);
    summary = `Para comprar dentro de ${decimal.format(result.years)} años lo mismo que hoy compras con ${money(values.amount)}.`;
    numbers = stats([['Poder de compra del dinero que conservas', `${money(result.purchasingPower)} de hoy`], ['Cambio de los precios', signedPercent(priceChangePercent)]]);
    visual = bars([{ label: 'Lo que cuesta hoy', value: values.amount, tone: 'muted' }, { label: 'Lo que costaría en el futuro', value: result.futureEquivalent, tone: 'amber' }]);
    note = `Si conservas ${money(values.amount)} sin invertirlos, su poder de compra ${powerChangePercent < 0 ? 'aumenta' : 'disminuye'} un ${percent(Math.abs(powerChangePercent))} en este escenario.`;
  } else if (tool.id === 'freedom') {
    label = 'Capital objetivo'; value = money(result.target);
    summary = `Retirar el ${percent(values.withdrawalRate)} de ese capital cada año cubriría ${money(values.monthlyExpenses)} al mes, antes de costes e impuestos.`;
    numbers = stats([['Tiempo estimado para llegar', result.reachable ? duration(result.months) : 'No se alcanza en 100 años'], ['Capital del que partes', money(values.initial)]]);
    visual = chart(result.series, [{ key: 'balance', label: 'Capital acumulado', tone: 'teal' }, { key: 'contributed', label: 'Tus aportaciones', tone: 'muted' }]);
    note = result.reachable ? 'Llegar al objetivo no garantiza vivir de ese capital: las ganancias varían y las retiradas pueden agotarlo.' : 'Con estas cantidades y esta rentabilidad no llegas al objetivo en el período simulado. Prueba a cambiar los gastos, las aportaciones o tus hipótesis.';
  }
  return `<p class="oc-calc-result-label">${label}</p><p class="oc-calc-result-value">${esc(value)}</p><p class="oc-calc-result-summary">${summary}</p>${numbers}${visual}${note ? `<p class="oc-calc-note">${note}</p>` : ''}`;
}

/** Local calculator UI. Values are held in memory and never become course progress. */
export function createLaboratory({ main, canUse = () => true, onIcons = () => {}, mascot = () => '', loadDictionary = () => import('./content/dictionary-data.json').then(module=>module.default) }) {
  const values = new Map();
  let active = null, disposed = false, lessonReturn = null;
  let dictionary=null,dictionaryPending=null,dictionaryTicket=0;
  let dictionaryState={query:'',track:'all',limit:30};
  const usable = () => !disposed && main.dataset.view === 'lab' && canUse() === true;
  const toolById = id => id==='dictionary'?DICTIONARY:TOOLS.find(tool => tool.id === id);
  const fieldsFor = tool => {
    if (!values.has(tool.id)) values.set(tool.id, Object.fromEntries(tool.fields.map(item => [item.key, String(item.value)])));
    return values.get(tool.id);
  };

  function readValues(tool) {
    const raw = fieldsFor(tool);
    return Object.fromEntries(tool.fields.map(item => {
      const value = raw[item.key];
      return [item.key, value === '' || value == null ? NaN : Number(value)];
    }));
  }

  function updateResult({ announce = false } = {}) {
    const tool = toolById(active);
    if (!tool || !usable()) return;
    const inputValues = readValues(tool), result = tool.calculate(inputValues);
    for (const item of tool.fields) {
      const input = main.querySelector(`[data-oc-calc-input="${item.key}"]`);
      const error = main.querySelector(`[data-oc-calc-error="${item.key}"]`);
      const message = result.ok ? '' : result.errors?.[item.key] || '';
      input?.setAttribute('aria-invalid', message ? 'true' : 'false');
      if (error) { error.textContent = message; error.hidden = !message; }
    }
    const output = main.querySelector('[data-oc-calc-result]');
    if (!output) return;
    output.dataset.state = result.ok ? 'valid' : 'invalid';
    output.innerHTML = result.ok ? resultContent(tool, result, inputValues) : '<div class="oc-calc-empty"><span aria-hidden="true">↗</span><h2>Completa las cantidades</h2><p>Revisa los campos marcados para ver la simulación.</p></div>';
    if (!announce) {
      const status = main.querySelector('[data-oc-calc-status]');
      if (status) status.textContent = '';
    }
    if (announce) {
      const status = main.querySelector('[data-oc-calc-status]');
      if (status) status.textContent = result.ok ? 'Cálculo actualizado. Puedes ver el resultado debajo.' : 'Revisa los campos marcados antes de calcular.';
      if (result.ok) {
        output.focus({ preventScroll: true });
        output.scrollIntoView?.({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      } else {
        main.querySelector('[aria-invalid="true"]')?.focus();
      }
    }
  }

  function renderHome() {
    main.innerHTML = `<div class="br-page oc-lab-home"><header class="oc-lab-hero"><div class="oc-lab-hero-body"><p class="oc-lab-eyebrow">Explora · calcula · compara</p><h1>Laboratorio</h1><p class="oc-lab-hero-title">Pon tus ideas a prueba.</p><p class="oc-lab-intro">Cambia las cantidades y descubre cómo influyen el tiempo, los costes y tus decisiones.</p></div><div class="oc-lab-mascot" aria-hidden="true">${mascot()}<span class="oc-lab-decor">%</span></div></header><div class="oc-lab-grid" aria-label="Herramientas">${[...TOOLS,DICTIONARY].map(tool => `<button type="button" class="oc-lab-card oc-lab-tone-${tool.tone} cursor-interaction" data-oc-lab-open="${tool.id}"><span class="oc-lab-card-art">${icon(tool.id)}</span><span class="oc-lab-card-title">${tool.title}</span><span class="oc-lab-card-description">${tool.description}</span><span class="oc-lab-card-open" aria-hidden="true">Probar <span>↗</span></span></button>`).join('')}</div><p class="oc-lab-footnote">Son simulaciones para aprender. Puedes probarlas tantas veces como quieras.</p></div>`;
    onIcons();
  }

  function renderTool(tool) {
    const raw = fieldsFor(tool);
    main.innerHTML = `<div class="br-page oc-calc-page oc-lab-tone-${tool.tone}"><button type="button" class="oc-calc-back br-link cursor-interaction" data-oc-lab-back><span aria-hidden="true">←</span> Todas las herramientas</button><header class="oc-calc-heading"><div class="oc-calc-heading-art">${icon(tool.id)}</div><div><p class="oc-lab-eyebrow">Laboratorio</p><h1 tabindex="-1" data-oc-calc-heading>${tool.title}</h1></div></header><p class="oc-calc-lead">${tool.lead}</p><div class="oc-calc-layout"><form class="oc-calc-form" data-oc-calc-form novalidate><div class="oc-calc-fields">${tool.fields.map(item => `<div class="oc-calc-field"><label for="oc-calc-${tool.id}-${item.key}">${item.label}</label><div class="oc-calc-input-wrap"><input type="number" inputmode="decimal" id="oc-calc-${tool.id}-${item.key}" name="${item.key}" value="${esc(raw[item.key])}" min="${item.min}" max="${item.max}" step="${item.step}" required autocomplete="off" data-oc-calc-input="${item.key}" aria-describedby="oc-help-${item.key} oc-error-${item.key}"/><span class="oc-calc-unit">${item.unit}</span></div><p class="oc-calc-help" id="oc-help-${item.key}">${item.help}</p><p class="oc-calc-error" id="oc-error-${item.key}" data-oc-calc-error="${item.key}" hidden></p></div>`).join('')}</div><button type="submit" class="br-main-button oc-calc-submit cursor-interaction">Calcular <span aria-hidden="true">↗</span></button><p class="oc-calc-status" data-oc-calc-status role="status" aria-live="polite"></p></form><section class="oc-calc-result" data-oc-calc-result tabindex="-1" aria-label="Resultado de la simulación"></section></div><aside class="oc-calc-assumptions"><h2>Qué estamos suponiendo</h2><p>${tool.assumptions}</p></aside></div>`;
    onIcons();
    updateResult();
  }

  function renderDictionary(){
    const ticket=++dictionaryTicket;
    if(dictionary){main.innerHTML=dictionaryPage(dictionary,dictionaryState);return;}
    main.innerHTML='<div class="br-page"><button type="button" class="oc-calc-back br-link" data-oc-lab-back>← Laboratorio</button><h1>Diccionario</h1><p role="status">Preparando las palabras del curso…</p></div>';
    dictionaryPending??=Promise.resolve().then(loadDictionary).then(entries=>{dictionary=entries;return entries;}).catch(error=>{dictionaryPending=null;throw error;});
    dictionaryPending.then(()=>{
      if(ticket!==dictionaryTicket||!usable()||active!=='dictionary')return;
      render();main.querySelector('[data-oc-calc-heading]')?.focus({preventScroll:true});
    },()=>{
      if(ticket!==dictionaryTicket||!usable()||active!=='dictionary')return;
      main.innerHTML='<div class="br-page"><button type="button" class="oc-calc-back br-link" data-oc-lab-back>← Laboratorio</button><h1>Diccionario</h1><p role="alert">No se ha podido cargar. Comprueba la conexión y vuelve a intentarlo.</p><button type="button" class="br-secondary" data-oc-dictionary-retry>Reintentar</button></div>';
    });
  }

  function updateDictionary(){
    if(!dictionary||active!=='dictionary'||!usable())return;
    const result=dictionaryResults(dictionary,dictionaryState);
    main.querySelector('[data-oc-dictionary-count]').textContent=result.count;
    main.querySelector('[data-oc-dictionary-results]').innerHTML=result.html;
    main.querySelectorAll?.('[data-oc-dictionary-track]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.ocDictionaryTrack===dictionaryState.track)));
  }

  function render({ reset = false } = {}) {
    if (!usable()) return;
    if (reset) active = null;
    const tool = toolById(active);
    if(active==='dictionary')renderDictionary();else if (tool) renderTool(tool); else renderHome();
    if (lessonReturn) main.insertAdjacentHTML('afterbegin', '<button type="button" class="oc-calc-back br-link cursor-interaction" data-oc-lab-return>← Volver a la lección</button>');
  }

  function reset() { active = null; lessonReturn = null; values.clear();++dictionaryTicket;dictionaryState={query:'',track:'all',limit:30}; }

  function open(id, { values: initial = {}, onReturn = null } = {}) {
    const tool = toolById(id);
    if (!usable() || !tool) return false;
    active = id;
    lessonReturn = typeof onReturn === 'function' ? onReturn : null;
    if(tool.fields){const raw = fieldsFor(tool);
      for (const item of tool.fields) if (Number.isFinite(initial[item.key])) raw[item.key] = String(initial[item.key]);}
    render();
    main.querySelector('[data-oc-calc-heading]')?.focus({ preventScroll: true });
    window.scrollTo?.({ top: 0, behavior: 'auto' });
    return true;
  }

  function returnToLesson() {
    if (!usable() || !lessonReturn) return false;
    const resume = lessonReturn;
    reset();
    resume();
    return true;
  }

  function back({ all = false } = {}) {
    if (!all && returnToLesson()) return true;
    if (!usable() || !active) return false;
    const previous = active;
    active = null;
    render();
    window.scrollTo?.({ top: 0, behavior: 'auto' });
    main.querySelector(`[data-oc-lab-open="${previous}"]`)?.focus({ preventScroll: true });
    return true;
  }

  function click(event) {
    if (!usable()) return;
    if(active==='dictionary'){
      if(event.target.closest('[data-oc-dictionary-retry]')){render();return;}
      if(event.target.closest('[data-oc-dictionary-more]')){dictionaryState.limit+=30;updateDictionary();return;}
      const filter=event.target.closest('[data-oc-dictionary-track]');
      if(filter&&main.contains(filter)&&['all',...DICTIONARY_TRACKS.map(t=>t[0])].includes(filter.dataset.ocDictionaryTrack)){
        dictionaryState.track=filter.dataset.ocDictionaryTrack;dictionaryState.limit=30;updateDictionary();return;
      }
    }
    if (event.target.closest('[data-oc-lab-return]')) { returnToLesson(); return; }
    const open = event.target.closest('[data-oc-lab-open]');
    if (open && main.contains(open)) {
      const tool = toolById(open.dataset.ocLabOpen);
      if (!tool) return;
      active = tool.id;
      render();
      main.querySelector('[data-oc-calc-heading]')?.focus({ preventScroll: true });
      window.scrollTo?.({ top: 0, behavior: 'auto' });
    } else if (event.target.closest('[data-oc-lab-back]')) {
      back({ all: true });
    }
  }

  function input(event) {
    if (!usable()) return;
    const search=event.target.closest('[data-oc-dictionary-search]');
    if(search&&active==='dictionary'&&main.contains(search)){
      dictionaryState.query=String(search.value).slice(0,120);dictionaryState.limit=30;updateDictionary();return;
    }
    const control = event.target.closest('[data-oc-calc-input]'), tool = toolById(active);
    if (!control || !tool || !main.contains(control)) return;
    fieldsFor(tool)[control.dataset.ocCalcInput] = control.value;
    updateResult();
  }

  function submit(event) {
    if (!event.target.matches('[data-oc-calc-form]')) return;
    event.preventDefault();
    if (!usable()) return;
    updateResult({ announce: true });
  }

  main.addEventListener('click', click);
  main.addEventListener('input', input);
  main.addEventListener('submit', submit);
  function dispose() {
    disposed = true;
    reset();
    main.removeEventListener('click', click);
    main.removeEventListener('input', input);
    main.removeEventListener('submit', submit);
  }
  return { render, reset, dispose, back, open };
}
