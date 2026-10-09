const { parsePrice, uniqueByUrl, cleanText } = require('../utils/helpers');

async function parseHomepage(page, config, baseUrl) {
  await page.waitForSelector(config.wait_for, { timeout: 30000 })
    .catch((e) => console.warn(`[MYTEK] waitForSelector('${config.wait_for}') timeout: ${e.message}`));

  const categories = await page.evaluate(() => {
    const results = [];
    const seen = new Set();

    document.querySelectorAll(
      'ul.level3-popup.halfwidth-popup-sub-sub li.category-item a.clearfix'
    ).forEach((leafA) => {
      const href = leafA.href;
      const name = (leafA.textContent || '').trim();
      if (!href || href.includes('javascript') || seen.has(href) || !name) return;
      seen.add(href);

      // Walk up the DOM to collect ancestor category names (max 3 levels up).
      // Each ul.level3-popup is a direct child of a li that holds the level-2 link,
      // which itself is inside a ul that is a child of the level-1 li.
      const ancestors = [];
      let el = leafA.closest('ul.level3-popup')?.parentElement;

      while (el && ancestors.length < 3) {
        // A direct child <a> with an href is the category link for this level.
        const link = el.querySelector(':scope > a[href], :scope > span > a[href]');
        if (link) {
          const text = (link.textContent || '').trim();
          if (text && text !== name) ancestors.unshift(text);
        }
        el = el.parentElement;
      }

      const path = [...ancestors, name].join(' > ');
      results.push({ url: href, name, path });
    });

    return results;
  });

  return uniqueByUrl(categories);
}

async function parseCategory(page, config) {
  await page.waitForSelector(config.wait_for, { timeout: 30000 })
    .catch((e) => console.warn(`[MYTEK] waitForSelector('${config.wait_for}') timeout on category: ${e.message}`));

  return await page.evaluate((selectors) => {
    const links = document.querySelectorAll(selectors.product_links);
    const products = Array.from(links).map(a => a.href).filter(Boolean);

    const nextBtn = document.querySelector(selectors.next_link);
    const rawHref = nextBtn ? nextBtn.getAttribute('href') : null;
    const nextUrl = (rawHref && !rawHref.startsWith('#')) ? nextBtn.href : null;

    return {
      products,
      next_url: nextUrl,
    };
  }, config);
}

async function parseProduct(page, config) {
  await page.waitForSelector(config.wait_for, { timeout: 30000 })
    .catch((e) => console.warn(`[MYTEK] waitForSelector('${config.wait_for}') timeout on product: ${e.message}`));

  const data = await page.evaluate((selectors) => {
    const txt = (sel) => {
      const el = document.querySelector(sel);
      return el ? (el.textContent || '').trim() : null;
    };

    const attr = (sel, name) => {
      const el = document.querySelector(sel);
      return el ? el.getAttribute(name) : null;
    };

    const nom = txt(selectors.name);

    const prixFinal = attr(selectors.final_price, selectors.final_price_attr);
    const prixOriginal = attr(selectors.original_price, selectors.original_price_attr);

    const stockHref = attr(selectors.stock, selectors.stock_attr) || '';
    let statutStock = 'UNKNOWN';
    if (stockHref.includes('InStock')) {
      statutStock = 'IN_STOCK';
    } else if (stockHref.includes('OutOfStock')) {
      statutStock = 'OUT_OF_STOCK';
    } else if (stockHref.includes('PreOrder')) {
      statutStock = 'ON_ORDER';
    }

    const imageUrl = attr(selectors.image, selectors.image_attr);
    const description = txt(selectors.description);

    const ficheTechnique = {};
    const table = document.querySelector(selectors.specs_table);
    if (table) {
      table.querySelectorAll('tr').forEach((row) => {
        const label = row.querySelector('th');
        const value = row.querySelector('td');
        if (label && value) {
          ficheTechnique[label.textContent.trim()] = value.textContent.trim();
        }
      });
    }

    return {
      nom,
      prix_final: prixFinal,
      prix_original: prixOriginal,
      statut_stock: statutStock,
      image_url: imageUrl,
      description,
      fiche_technique: ficheTechnique,
    };
  }, config);

  const prixFinal = parsePrice(data.prix_final);
  const prixOriginal = parsePrice(data.prix_original);
  const estEnPromotion =
    prixFinal !== null &&
    prixOriginal !== null &&
    prixOriginal > prixFinal;

  return {
    nom: cleanText(data.nom),
    prix_original:    estEnPromotion ? prixOriginal : prixFinal,
    prix_en_promotion: estEnPromotion ? prixFinal : null,
    est_en_promotion: estEnPromotion,
    statut_stock: data.statut_stock || 'UNKNOWN',
    image_url: data.image_url || null,
    description: cleanText(data.description),
    fiche_technique: data.fiche_technique || {},
  };
}

module.exports = {
  parseHomepage,
  parseCategory,
  parseProduct,
};