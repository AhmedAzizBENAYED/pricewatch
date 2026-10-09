const { parsePrice, uniqueByUrl, cleanText } = require('../utils/helpers');

async function parseHomepage(page, config, baseUrl) {
  await page.waitForSelector(config.wait_for, { timeout: 30000 })
    .catch((e) => console.warn(`[TUNISIANET] waitForSelector('${config.wait_for}') timeout on homepage: ${e.message}`));

  const categories = await page.evaluate(({ selectors, url }) => {
    const results = [];
    const seen = new Set();

    const push = (a) => {
      if (!a) return;

      const href = a.getAttribute('href') || a.href;
      const name = (a.textContent || '').replace(/\s+/g, ' ').trim();

      if (!href || !name) return;
      if (href.startsWith('javascript')) return;
      if (href.startsWith('#')) return;

      let abs = null;
      try {
        abs = new URL(href, url).href;
      } catch {
        return;
      }

      if (seen.has(abs)) return;
      seen.add(abs);
      results.push({ url: abs, name });
    };

    for (const sel of selectors.category_links || []) {
      document.querySelectorAll(sel).forEach(push);
    }

    return results;
  }, { selectors: config, url: baseUrl });

  return uniqueByUrl(categories);
}

async function parseCategory(page, config) {
  await page.waitForSelector(config.wait_for, { timeout: 30000 })
    .catch((e) => console.warn(`[TUNISIANET] waitForSelector('${config.wait_for}') timeout on category: ${e.message}`));

  return page.evaluate((selectors) => {
    const toAbs = (href) => {
      if (!href) return null;
      try {
        return new URL(href, window.location.href).href;
      } catch {
        return null;
      }
    };

    const seen = new Set();
    const products = Array.from(
      document.querySelectorAll(selectors.product_links)
    )
      .map((a) => a.getAttribute('href') || a.href)
      .map(toAbs)
      .filter((href) => href && !seen.has(href) && seen.add(href));

    const currentPage =
      parseInt(
        document.querySelector(selectors.current_page)?.textContent?.trim() || '1',
        10
      ) || 1;

    const pageNumbers = Array.from(
      document.querySelectorAll(selectors.page_links)
    )
      .map((a) => parseInt((a.textContent || '').trim(), 10))
      .filter((n) => Number.isInteger(n) && n > 0);

    const lastPage = pageNumbers.length > 0 ? Math.max(...pageNumbers) : currentPage;

    const nextBtn = document.querySelector(selectors.next_link);
    const nextHref = nextBtn ? (nextBtn.getAttribute('href') || nextBtn.href) : null;

    let nextUrl = null;
    if (currentPage < lastPage && nextHref) {
      nextUrl = toAbs(nextHref);
    }

    return {
      products,
      next_url: nextUrl,
      pagination: {
        current_page: currentPage,
        last_page: lastPage,
      },
    };
  }, config);
}

async function parseProduct(page, config) {
  await page.waitForSelector(config.wait_for, { timeout: 30000 })
    .catch((e) => console.warn(`[TUNISIANET] waitForSelector('${config.wait_for}') timeout on product: ${e.message}`));

  const data = await page.evaluate((selectors) => {
    const txt = (sel) => {
      if (!sel) return null;
      const el = document.querySelector(sel);
      return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : null;
    };

    const attr = (sel, name) => {
      if (!sel || !name) return null;
      const el = document.querySelector(sel);
      return el ? el.getAttribute(name) : null;
    };

    const extractSpecs = (variants = []) => {
      for (const variant of variants) {
        const ficheTechnique = {};

        if (variant.type === 'dl_pairs') {
          const names = document.querySelectorAll(variant.names);
          const values = document.querySelectorAll(variant.values);

          const len = Math.min(names.length, values.length);
          for (let i = 0; i < len; i++) {
            const key = (names[i].textContent || '').replace(/\s+/g, ' ').trim();
            const value = (values[i].textContent || '').replace(/\s+/g, ' ').trim();

            if (key && value) {
              ficheTechnique[key] = value;
            }
          }
        }

        if (Object.keys(ficheTechnique).length > 0) {
          return ficheTechnique;
        }
      }

      return {};
    };

    const availabilityHref =
      attr('link[itemprop="availability"]', 'href') ||
      attr('div.product-price[itemprop="offers"] link[itemprop="availability"]', 'href') ||
      '';

    const stockClass = attr(selectors.stock, selectors.stock_attr) || '';
    const stockText = txt(selectors.stock) || '';

    let statutStock = 'UNKNOWN';

    // Prioritise the visible span class/text — schema.org link is unreliable on Tunisianet
    if (stockClass.includes('in-stock') || /en stock/i.test(stockText)) {
      statutStock = 'IN_STOCK';
    } else if (stockClass.includes('out-of-stock') || /rupture|épuisé/i.test(stockText)) {
      statutStock = 'OUT_OF_STOCK';
    } else if (/arrivage/i.test(stockText)) {
      statutStock = 'ARRIVING';
    } else if (/commande/i.test(stockText)) {
      statutStock = 'ON_ORDER';
    } else if (availabilityHref.includes('InStock')) {
      statutStock = 'IN_STOCK';
    } else if (availabilityHref.includes('OutOfStock')) {
      statutStock = 'OUT_OF_STOCK';
    } else if (availabilityHref.includes('PreOrder')) {
      statutStock = 'ON_ORDER';
    }

    const imageUrl =
      attr(selectors.image, selectors.image_attr) ||
      attr(selectors.image, 'src') ||
      attr('img.thumb.js-thumb.selected', 'data-image-large-src') ||
      attr('img.thumb.js-thumb.selected', 'src') ||
      null;

    return {
      nom: txt(selectors.name),
      prix_final_raw:
        attr(selectors.final_price, selectors.final_price_attr) ||
        txt(selectors.final_price),
      prix_original_raw: txt(selectors.original_price),
      statut_stock: statutStock,
      image_url: imageUrl,
      description: txt(selectors.description),
      fiche_technique: extractSpecs(selectors.specs_variants || []),
    };
  }, config);

  const prixFinal = parsePrice(data.prix_final_raw);
  const prixOriginal = parsePrice(data.prix_original_raw);

  const estPromo =
    prixFinal !== null &&
    prixOriginal !== null &&
    prixOriginal > prixFinal;

  return {
    nom: cleanText(data.nom),
    prix_original:     estPromo ? prixOriginal : prixFinal,
    prix_en_promotion: estPromo ? prixFinal : null,
    est_en_promotion: estPromo,
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