/**
 * Parser Géant pour le playwright-service.
 * geantdrive.tn est un PrestaShop classique — pagination par URL.
 *
 * Méthodes exposées :
 *   parseHomepage(page, config, url)  → [{nom, url, parent, store}]
 *   parseCategory(page, config, url)  → {products: [...urls], next_url: null}
 *   parseProduct(page, config, url)   → {nom, prix_original, prix_promotion, ...}
 */

function parsePrice(priceStr) {
  if (!priceStr) return null;
  const cleaned = priceStr.replace(/[^\d,.]/g, '').replace(',', '.');
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}

async function parseHomepage(page, config, url) {
  await page.goto(url, { waitUntil: 'load', timeout: config.timeout });
  await page.waitForSelector('a.category_header', { state: 'attached', timeout: 15000 });

  const categories = [];
  const seenUrls = new Set();

  const parentEls = await page.$$('li.level-1.parent');
  for (const parentEl of parentEls) {
    const parentLink = await parentEl.$(':scope > a');
    let parentNom = '';
    if (parentLink) {
      const span = await parentLink.$('span');
      parentNom = span ? (await span.innerText()).trim() : '';
    }

    const subLinks = await parentEl.$$('a.category_header');
    for (const subLink of subLinks) {
      const href = await subLink.getAttribute('href');
      const nom = (await subLink.innerText()).trim();
      if (!href || !nom || seenUrls.has(href)) continue;
      seenUrls.add(href);
      categories.push({ name: nom, url: href, parent: parentNom, store: config.store });
    }
  }

  console.log(`[geant-${config.store}] ${categories.length} catégories découvertes`);
  return categories;
}

async function parseCategory(page, config, url) {
  const productUrls = [];
  let currentUrl = url;

  while (currentUrl) {
    await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: config.timeout });
    await page.waitForSelector('article.product-miniature', { timeout: 15000 });

    const articles = await page.$$('article.product-miniature');
    for (const article of articles) {
      const link = await article.$('a.thumbnail.product-thumbnail');
      if (!link) continue;
      const href = await link.getAttribute('href');
      if (href && !productUrls.includes(href)) productUrls.push(href);
    }

    const nextBtn = await page.$('nav.pagination a.next.js-search-link');
    currentUrl = nextBtn ? await nextBtn.getAttribute('href') : null;
  }

  console.log(`[geant-${config.store}] ${productUrls.length} produits dans ${url}`);
  return { products: productUrls, next_url: null };
}

async function parseProduct(page, config, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.timeout });
  await page.waitForSelector('h1.product-head1', { timeout: 15000 });

  const nomEl = await page.$('h1.product-head1');
  const nom = nomEl ? (await nomEl.innerText()).trim() : null;
  if (!nom) throw new Error('Nom produit introuvable');

  const prixEl = await page.$("div.current-price span[itemprop='price']");
  const prixStr = prixEl ? await prixEl.getAttribute('content') : null;
  let prix_original = parsePrice(prixStr);

  let prix_en_promotion = null;
  let est_en_promotion = false;
  const promoEl = await page.$('div.discount-details');
  if (promoEl) {
    const promoText = (await promoEl.innerText()).trim();
    if (promoText) {
      est_en_promotion = true;
      prix_en_promotion = prix_original;
      const oldEl = await page.$('span.regular-price');
      if (oldEl) prix_original = parsePrice(await oldEl.innerText());
    }
  }

  let prix_unitaire = null;
  const unitPriceEl = await page.$('.unit-price');
  if (unitPriceEl) {
    prix_unitaire = parsePrice((await unitPriceEl.innerText()).trim());
  }

  const marqueEl = await page.$('p.manufacturer_product a');
  const marque = marqueEl ? (await marqueEl.innerText()).trim() : null;

  const descEl = await page.$("div[itemprop='description'].prodes");
  const description = descEl ? (await descEl.innerText()).trim() : null;

  const imgEl = await page.$('img.img-responsive.center-block');
  const image = imgEl ? await imgEl.getAttribute('src') : null;

  const breadcrumbEls = await page.$$("ol.bread li span[itemprop='name']");
  const breadcrumb = [];
  for (const el of breadcrumbEls) {
    breadcrumb.push((await el.innerText()).trim());
  }
  const categorie_brute = breadcrumb.length > 2 ? breadcrumb.slice(1, -1).join(' > ') : null;

  const stockEl = await page.$("link[itemprop='availability']");
  const availabilityUrl = stockEl ? await stockEl.getAttribute('href') : '';
  const statut_stock = availabilityUrl && availabilityUrl.includes('InStock') ? 'IN_STOCK' : 'OUT_OF_STOCK';

  const idEl = await page.$('input#product_page_product_id');
  const id_prestashop = idEl ? await idEl.getAttribute('value') : null;

  return {
    nom,
    marque,
    description,
    image,
    categorie_brute,
    breadcrumb,
    prix_original,
    prix_en_promotion,
    prix_unitaire,
    est_en_promotion,
    statut_stock,
    id_prestashop,
    store: config.store,
  };
}

module.exports = { parseHomepage, parseCategory, parseProduct };