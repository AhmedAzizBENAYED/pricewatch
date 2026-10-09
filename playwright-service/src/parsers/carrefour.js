/**
 * Parser Carrefour pour le playwright-service.
 * carrefour.tn est un React SPA — toute interaction Playwright est ici.
 *
 * Méthodes exposées :
 *   parseHomepage(page, config, url)  → [{nom, url, parent}]
 *   parseCategory(page, config, url)  → {products: [...urls], next_url: null}
 *   parseProduct(page, config, url)   → {nom, prix_original, prix_promotion, ...}
 *   discoverCategories(page, config)  → [{nom, url, is_leaf}]
 */

const BASE_URL = 'https://www.carrefour.tn';

function parsePrice(integerStr, decimalStr) {
  if (integerStr === null || integerStr === undefined) return null;
  try {
    const intClean = integerStr.replace(/[^\d]/g, '');
    const decClean = (decimalStr || '0').replace(/[^\d]/g, '');
    return parseFloat(`${intClean}.${decClean}`);
  } catch {
    return null;
  }
}

function parseJsonLd(content) {
  try {
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function parseHomepage(page, config, url) {
  await page.goto(url || BASE_URL, { waitUntil: 'domcontentloaded', timeout: config.timeout });
  await page.waitForSelector('button.navTrigger-root-oad', { state: 'visible', timeout: 15000 });
  await page.click('button.navTrigger-root-oad');
  await page.waitForSelector('aside.navigation-root_open-LZy', { state: 'attached', timeout: 10000 });

  const categories = [];
  const seenUrls = new Set();
  const tabNames = ['Courses du quotidien', 'Maison et loisirs'];

  for (const tabName of tabNames) {
    try {
      const tabs = await page.$$('.navigation-menuTabs-EF5 button');
      for (const tab of tabs) {
        const text = await tab.innerText();
        if (text.toLowerCase().includes(tabName.toLowerCase())) {
          await tab.click();
          await page.waitForTimeout(1000);
          break;
        }
      }

      const links = await page.$$('a.menuLink-menuLink-Q3Q');
      for (const link of links) {
        const rawHref = await link.getAttribute('href');
        const span = await link.$('span.menuLink-title-rT3');
        const name = span ? (await span.innerText()).trim() : '';

        if (!rawHref || !name || seenUrls.has(rawHref)) continue;

        const skipWords = ['catalogues', 'services', 'recettes', 'bon-plan', 'promotions-du-moment'];
        if (skipWords.some(w => rawHref.includes(w))) continue;

        const absoluteUrl = rawHref.startsWith('/') ? BASE_URL + rawHref : rawHref;
        seenUrls.add(rawHref);
        categories.push({ name, url: absoluteUrl, parent: tabName });
      }
    } catch (err) {
      console.error(`[carrefour] Erreur discover tab '${tabName}': ${err.message}`);
    }
  }

  console.log(`[carrefour] ${categories.length} catégories découvertes`);
  return categories;
}

async function parseCategory(page, config, url) {
  const productUrls = [];
  const MAX_PAGES = 15;

  // Bloquer usercentrics AVANT le chargement de la page
  await page.route('**/*usercentrics*', route => route.abort());
  await page.route('**/*consent*', route => route.abort());

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.timeout });
  await page.waitForTimeout(3000);

  // Fermer la popup cookies Usercentrics si présente
  try {
    const cookieBtn = await page.$('button[data-testid="uc-accept-all-button"]');
    if (cookieBtn) {
      await cookieBtn.click();
      console.log('[carrefour] Popup cookies fermée via bouton');
      await page.waitForTimeout(1000);
    } else {
      await page.evaluate(() => {
        const el = document.querySelector('#usercentrics-cmp-ui');
        if (el) el.style.display = 'none';
      });
      console.log('[carrefour] Popup cookies masquée via JS');
    }
  } catch(e) {
    console.warn('[carrefour] Popup cookies non gérée:', e.message);
  }

  try {
    await page.waitForSelector('div.category-categoryItem-7pb', { timeout: 30000 });
  } catch {
    const title = await page.title();
    const htmlLen = (await page.content()).length;
    console.warn(`[carrefour] Aucun produit dans ${url} | titre=${title} | html=${htmlLen}`);
    return { products: [], next_url: null };
  }

  let pageCount = 0;
  while (true) {
    pageCount++;
    if (pageCount > MAX_PAGES) {
      console.warn(`[carrefour] Limite ${MAX_PAGES} pages atteinte pour ${url}`);
      break;
    }
    const links = await page.$$('a.item-nameContainer--mM');
    for (const link of links) {
      let href = await link.getAttribute('href');
      if (!href) continue;
      if (href.startsWith('/')) href = `${BASE_URL}${href}`;
      if (!productUrls.includes(href)) productUrls.push(href);
    }
    const countAvant = productUrls.length;
    const nextBtn = await page.$('div.category-buttonPagination-bhw button.category-buttonsPag-jTw');
    if (!nextBtn) break;
    const isVisible = await nextBtn.isVisible();
    const isDisabled = await nextBtn.isDisabled();
    if (!isVisible || isDisabled) break;

    // Bypass interception popup via JS click
    await page.evaluate(() => {
      const el = document.querySelector('#usercentrics-cmp-ui');
      if (el) el.remove();
      const btn = document.querySelector(
        'div.category-buttonPagination-bhw button.category-buttonsPag-jTw'
      );
      if (btn) btn.click();
    });
    try {
      await page.waitForFunction(
        (countAvant) => {
          const links = document.querySelectorAll('a.item-nameContainer--mM');
          return links.length > countAvant;
        },
        countAvant,
        { timeout: 15000 }
      );
    } catch {
      console.warn(`[carrefour] Timeout attente nouveaux produits page ${pageCount}`);
      break;
    }
    await page.waitForTimeout(1000);
  }
  console.log(`[carrefour] ${productUrls.length} produits dans ${url}`);
  return { products: productUrls, next_url: null };
}

async function parseProduct(page, config, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.timeout });
  await page.waitForTimeout(5000);
  await page.waitForSelector('h1.productFullDetail-productName-Qe1', { timeout: 60000 });
  await page.waitForSelector('div.productFullDetail-prices-rjb', { timeout: 15000 }).catch(() => {
    console.warn('[carrefour] Conteneur prix non trouvé, on continue...');
  });

  const nomEl = await page.$('h1.productFullDetail-productName-Qe1');
  const nom = nomEl ? (await nomEl.innerText()).trim() : null;
  if (!nom) throw new Error('Nom produit introuvable');

  const priceReductionEl = await page.$('div.productFullDetail-priceReduction-ekA');
  const intEl = priceReductionEl ? await priceReductionEl.$('span.productFullDetail-integerDetails-AHW') : null;
  const decEl = priceReductionEl ? await priceReductionEl.$('span.productFullDetail-decimalDetails-wQp') : null;
  const intStr = intEl ? await intEl.innerText() : null;
  const decStr = decEl ? await decEl.innerText() : null;
  let prix_original = parsePrice(intStr, decStr);

  if (prix_original === null) {
    const ldElPrice = await page.$('script#product-schema-ldjson');
    if (ldElPrice) {
      const ldData = parseJsonLd(await ldElPrice.innerText());
      const offerPrice = ldData?.offers?.price;
      if (offerPrice !== undefined && offerPrice !== null) {
        prix_original = parseFloat(offerPrice);
      }
    }
  }

  let prix_en_promotion = null;
  let est_en_promotion = false;
  const oldPriceEl = await page.$('div.productFullDetail-oldPrice-lGe');
  if (oldPriceEl) {
    const oldPriceText = (await oldPriceEl.innerText()).trim();
    if (oldPriceText && oldPriceText.length > 0) {
      est_en_promotion = true;
      prix_en_promotion = prix_original;

      const oldIntEl = await oldPriceEl.$('span.productFullDetail-integerDetails-AHW');
      const oldDecEl = await oldPriceEl.$('span.productFullDetail-decimalDetails-wQp');
      const oldIntStr = oldIntEl ? await oldIntEl.innerText() : null;
      const oldDecStr = oldDecEl ? await oldDecEl.innerText() : null;
      const oldPrice = parsePrice(oldIntStr, oldDecStr);
      if (oldPrice !== null) prix_original = oldPrice;
    }
  }

  let prix_unitaire = null;
  const unitPriceEl = await page.$('div.productFullDetail-pricePerUnit-Nw7, span.productFullDetail-unitPrice-rjb');
  if (unitPriceEl) {
    prix_unitaire = parsePrice((await unitPriceEl.innerText()).replace(/[^\d.,]/g, ''), null);
  }

  let marque = null;
  let quantite = null;
  let description = null;
  const productLdEl = await page.$('script#product-schema-ldjson');
  if (productLdEl) {
    const ldData = parseJsonLd(await productLdEl.innerText());
    const brand = ldData.brand || {};
    marque = typeof brand === 'object' ? brand.name || null : null;
    description = ldData.description || null;
    quantite = ldData.weight || ldData.size || null;
  }

  if (!description) {
    const descEl = await page.$('div.productFullDetail-productDescription-AWw');
    if (descEl) description = (await descEl.innerText()).trim();
  }

  let categorie_brute = null;
  const bcEl = await page.$('script#breadcrumb-schema-ldjson');
  if (bcEl) {
    const bcData = parseJsonLd(await bcEl.innerText());
    const items = bcData.itemListElement || [];
    const crumbs = items
      .map(i => i.name || '')
      .filter(n => n && n !== 'Home' && n !== nom);
    if (crumbs.length) categorie_brute = crumbs.join(' > ');
  }

  let image = null;
  let imgEl = await page.$('div.productFullDetail-imageCarousel-BQu img');
  if (!imgEl) imgEl = await page.$('img.image-img-rH-');
  if (imgEl) {
    image = await imgEl.getAttribute('src');
    if (image && image.startsWith('/')) image = BASE_URL + image;
  }

  let statut_stock = 'UNKNOWN';
  const stockEl = await page.$('div.productFullDetail-availability-n3L');
  if (stockEl) {
    const available = await page.$('.productFullDetail-available-Esn');
    const outOfStock = await page.$('.productFullDetail-outOfStock-Vit');
    if (available) statut_stock = 'IN_STOCK';
    else if (outOfStock) statut_stock = 'OUT_OF_STOCK';
  }

  return {
    nom,
    marque,
    quantite,
    description,
    prix_original,
    prix_en_promotion,
    prix_unitaire,
    est_en_promotion,
    image,
    categorie_brute,
    statut_stock,
  };
}

async function discoverCategories(page, config) {
  const BASE_URL = 'https://www.carrefour.tn';
  const SKIP_WORDS = ['catalogues', 'services', 'recettes', 'bon-plan', 'promotions-du-moment', 'jardin', 'nos-recettes'];
  const MENU_TABS = ['Courses du quotidien', 'Maison et loisirs'];
  const visited = new Set();
  const results = [];

  function makeAbsolute(href) {
    if (href && href.startsWith('/')) return BASE_URL + href;
    return href;
  }

  function shouldSkip(url) {
    return SKIP_WORDS.some(w => url.includes(w));
  }

  async function extractMenuLinks() {
    try {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: config.timeout });
      console.log(`[carrefour][discover] Page chargée: ${BASE_URL}`);
      await page.waitForSelector('button.navTrigger-root-oad', { state: 'visible', timeout: 15000 });
      console.log(`[carrefour][discover] Bouton menu trouvé`);
      await page.click('button.navTrigger-root-oad');
      console.log(`[carrefour][discover] Bouton menu cliqué`);
      await page.waitForSelector('aside.navigation-root_open-LZy', { state: 'attached', timeout: 10000 });
      console.log(`[carrefour][discover] Sidebar ouverte`);

      const allLinks = [];
      const seenUrls = new Set();

      for (const tabName of MENU_TABS) {
        const tabs = await page.$$('.navigation-menuTabs-EF5 button');
        for (const tab of tabs) {
          const text = await tab.innerText();
          if (text.toLowerCase().includes(tabName.toLowerCase())) {
            await tab.click();
            await page.waitForTimeout(1500);
            break;
          }
        }

        const linksData = await page.evaluate(() => {
          const links = document.querySelectorAll('a.menuLink-menuLink-Q3Q');
          return Array.from(links).map(a => ({
            href: a.getAttribute('href') || '',
            nom: (a.querySelector('span.menuLink-title-rT3') || a).innerText.trim()
          }));
        });

        for (const item of linksData) {
          const href = makeAbsolute(item.href);
          if (!href || !item.nom || seenUrls.has(href) || shouldSkip(href)) continue;
          seenUrls.add(href);
          allLinks.push({ nom: item.nom, url: href });
        }
      }

      console.log(`[carrefour][discover] ${allLinks.length} catégories mères extraites`);
      allLinks.forEach(l => console.log(`[carrefour][discover] MENU: ${l.nom} → ${l.url}`));
      return allLinks;

    } catch (err) {
      console.error(`[carrefour][discover] ❌ Erreur extractMenuLinks: ${err.message}`);
      return [];
    }
  }

  async function crawl(url, nom, depth = 0) {
    if (visited.has(url)) return;
    visited.add(url);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.timeout });
      await page.waitForTimeout(4000);

      try {
        await page.waitForSelector(
          '.category-tagsCategory-8N1, div.category-categoryItem-7pb',
          { timeout: 8000 }
        );
      } catch {
        // Page sans tags ni produits — on continue quand même
      }

      const tagData = await page.evaluate(() => {
        // Sélecteur original
        let tags = document.querySelectorAll(
          '.category-tagsCategory-8N1 .category-tag-H6M a'
        );

        // Fallback — sélecteur alternatif pour "Le marché", "Crèmerie", "Boissons"
        if (tags.length === 0) {
          tags = document.querySelectorAll(
            'ul.category-items-kE- button.label-root-N-K'
          );
          // Retourner les titres comme liens
          return Array.from(tags).map(btn => ({
            href: btn.closest('a')?.getAttribute('href') || '',
            nom: btn.getAttribute('title') || btn.innerText.trim()
          }));
        }

  return Array.from(tags).map(a => ({
    href: a.getAttribute('href') || '',
    nom: a.innerText.trim()
  }));
});

      const children = tagData
        .filter(t => t.href && t.nom && !shouldSkip(t.href))
        .map(t => ({ href: makeAbsolute(t.href), nom: t.nom }));

      if (children.length > 0) {
        console.log(`[carrefour][discover] ${'  '.repeat(depth)}📁 NŒUD ${nom} (${children.length} enfants)`);
        for (const child of children) {
          await crawl(child.href, child.nom, depth + 1);
        }
      } else {
        results.push({ nom, url, is_leaf: true });
        console.log(`[carrefour][discover] ${'  '.repeat(depth)}✅ FEUILLE ${nom}`);
      }

    } catch (err) {
      console.warn(`[carrefour][discover] ⚠️ Erreur ${nom}: ${err.message}`);
    }
  }

  const rootLinks = await extractMenuLinks();
  console.log(`[carrefour][discover] Début crawl de ${rootLinks.length} catégories mères`);
  for (const link of rootLinks) {
    await crawl(link.url, link.nom);
  }

  console.log(`[carrefour][discover] ${results.length} catégories feuilles trouvées`);
  return results;
}

module.exports = { parseHomepage, parseCategory, parseProduct, discoverCategories };