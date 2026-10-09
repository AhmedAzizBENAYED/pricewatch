/**
 * Parser Aziza pour le playwright-service.
 * aziza.tn est une Angular SPA — scroll nécessaire pour lazy-load.
 *
 * Méthodes exposées :
 *   parseHomepage(page, config, url)  → [] (pas de catégories chez Aziza)
 *   parseCategory(page, config, url)  → {products: [...urls], next_url: null}
 *   parseProduct(page, config, url)   → {nom, prix_original, prix_promotion, ...}
 */

const BASE_URL = 'https://www.aziza.tn';

function parseAzizaPrice(integerStr, decimalStr) {
  if (!integerStr) return null;
  try {
    const intClean = integerStr.replace(/[^\d]/g, '');
    const decClean = (decimalStr || '0').replace(/[^\d]/g, '');
    return parseFloat(`${intClean}.${decClean}`);
  } catch {
    return null;
  }
}

function extractProductIdFromSrc(src) {
  if (!src) return null;
  let match = src.match(/\/(\d+)1\.(?:jpg|jpeg|png|webp)/);
  if (match) return match[1];
  match = src.match(/\/(\d+)\.(?:jpg|jpeg|png|webp)/);
  if (match) return match[1];
  return null;
}

async function parseHomepage(page, config, url) {
  return [];
}

async function parseCategory(page, config, url) {
  console.log('[aziza] Chargement de la page principale...');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.timeout });

  await page.waitForSelector('div.article-block', { state: 'attached', timeout: 60000 });

  console.log('[aziza] Scroll pour charger le deuxième container...');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2000);

  try {
    await page.waitForSelector(
      'div.container-articles:nth-child(2) div.article-block',
      { timeout: 10000 }
    );
    console.log('[aziza] Deuxième container chargé ✅');
  } catch {
    console.warn('[aziza] Deuxième container non chargé — scraping partiel');
  }

  const articleBlocks = await page.$$('div.article-block');
  console.log(`[aziza] ${articleBlocks.length} blocs trouvés`);

  const productUrls = [];
  const seenIds = new Set();

  for (const block of articleBlocks) {
    const imgEl = await block.$('img.fade-in-image');
    if (!imgEl) continue;
    const src = await imgEl.getAttribute('src');
    const productId = extractProductIdFromSrc(src || '');
    if (productId && !seenIds.has(productId)) {
      seenIds.add(productId);
      productUrls.push(`${BASE_URL}/details-article/${productId}.html`);
    }
  }

  console.log(`[aziza] ${productUrls.length} produits uniques`);
  return { products: productUrls, next_url: null };
}

async function parseProduct(page, config, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.timeout });
  await page.waitForTimeout(3000);

  await page.waitForSelector('div.title-article', { state: 'attached', timeout: 30000 });

  const nomEl = await page.$('div.title-article');
  const nom = nomEl ? (await nomEl.innerText()).trim() : null;
  if (!nom) throw new Error('Nom produit introuvable');

  const marqueEl = await page.$('div.marque-article');
  let marque = null;
  if (marqueEl) {
    const raw = (await marqueEl.innerText()).trim();
    marque = raw.replace(/^Marque\s*:\s*/i, '').trim() || null;
  }

  const qtyEl = await page.$('div.quantity-article');
  const quantite = qtyEl ? (await qtyEl.innerText()).trim() : null;

  const refEl = await page.$('div.ref-article');
  let reference = null;
  if (refEl) {
    const rawRef = (await refEl.innerText()).trim();
    reference = rawRef.replace(/^R[ée]f\.\s*:\s*/i, '').trim() || null;
  }

  const prixIntEl = await page.$('span.price-integer');
  const prixDecEl = await page.$('span.price-decimal');
  const prixIntStr = prixIntEl ? await prixIntEl.innerText() : null;
  const prixDecStr = prixDecEl ? await prixDecEl.innerText() : null;
  let prix_original = parseAzizaPrice(prixIntStr, prixDecStr);

  const remiseEl = await page.$('div.remise-badge');
  let remise_str = null;
  let est_en_promotion = false;
  let prix_en_promotion = null;

  if (remiseEl) {
    remise_str = (await remiseEl.innerText()).trim();
    est_en_promotion = true;
    if (remise_str && prix_original) {
      prix_en_promotion = prix_original;
      const match = remise_str.match(/-?(\d+)%/);
      if (match) {
        const remisePct = parseInt(match[1]) / 100;
        if (remisePct < 1) {
          prix_original = Math.round((prix_en_promotion / (1 - remisePct)) * 1000) / 1000;
        }
      }
    }
  }

  let prix_unitaire = null;
  const unitPriceEl = await page.$('div.prix-unitaire, span.unit-price-article');
  if (unitPriceEl) {
    prix_unitaire = parseAzizaPrice((await unitPriceEl.innerText()).replace(/[^\d.,]/g, ''), null);
  }

  // Angular lazy-loads images: getAttribute('src') returns empty/placeholder.
  // el.src is the resolved absolute URL after Angular has set it.
  // data-src is used by some lazy-loading directives before Angular hydration.
  let image = null;
  const imgEl = await page.$('img.img_prod');
  if (imgEl) {
    image = await imgEl.getAttribute('data-src')
      || await imgEl.evaluate(el => (el.src && !el.src.endsWith('/') ? el.src : ''))
      || null;
    if (image && image.startsWith('./')) image = `${BASE_URL}/${image.slice(2)}`;
    else if (image && image.startsWith('/')) image = `${BASE_URL}${image}`;
    if (!image || image === BASE_URL) image = null;
  }

  const selectEl = await page.$("select[name='gouvernorat']");
  const statut_stock = selectEl ? 'IN_STOCK' : 'UNKNOWN';

  return {
    nom,
    marque,
    quantite,
    reference,
    prix_original,
    prix_en_promotion,
    prix_unitaire,
    est_en_promotion,
    remise: remise_str,
    image,
    statut_stock,
  };
}

module.exports = { parseHomepage, parseCategory, parseProduct };