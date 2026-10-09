const { parsePrice, uniqueByUrl, cleanText } = require('../utils/helpers');

async function parseHomepage(page, config, baseUrl) {
  await page.waitForSelector(config.wait_for, { timeout: 30000 })
    .catch((e) => console.warn(`[SPACENET] waitForSelector('${config.wait_for}') timeout on homepage: ${e.message}`));

  const categories = await page.evaluate(({ selectors, url }) => {
    const results = [];
    const seen = new Set();

    const push = (a) => {
      if (!a) return;

      const href = a.getAttribute('href');
      const name = (a.textContent || '').trim();

      if (!href || !name) return;

      const abs = new URL(href, url).href;
      if (seen.has(abs)) return;

      seen.add(abs);
      results.push({ url: abs, name });
    };

    for (const sel of selectors.category_links) {
      document.querySelectorAll(sel).forEach(push);
    }

    return results;
  }, { selectors: config, url: baseUrl });

  return uniqueByUrl(categories);
}

async function parseCategory(page, config) {
  await page.waitForSelector(config.wait_for, { timeout: 30000 })
    .catch((e) => console.warn(`[SPACENET] waitForSelector('${config.wait_for}') timeout on category: ${e.message}`));

  return await page.evaluate((selectors) => {
    const products = Array.from(
      document.querySelectorAll(selectors.product_links)
    )
      .map((a) => {
        const url = a.href;
        if (!url) return null;

        const card = a.closest(selectors.product_card || 'article');
        const imageEl = card ? card.querySelector(selectors.card_image) : null;
        const stockEl = card ? card.querySelector(selectors.card_stock) : null;

        const stockText = stockEl ? (stockEl.textContent || '').trim() : '';
        let stock_status = 'UNKNOWN';
        if (/en stock|in stock/i.test(stockText)) {
          stock_status = 'IN_STOCK';
        } else if (/rupture|épuisé|out of stock/i.test(stockText)) {
          stock_status = 'OUT_OF_STOCK';
        } else if (/en arrivage/i.test(stockText)) {
          stock_status = 'ARRIVING';
        } else if (/sur commande/i.test(stockText)) {
          stock_status = 'ON_ORDER';
        }

        return {
          url,
          image_url: imageEl ? (imageEl.getAttribute('src') || null) : null,
          stock_status,
        };
      })
      .filter(Boolean);

    const currentPage =
      parseInt(
        document.querySelector(selectors.current_page)?.textContent?.trim() || '1',
        10
      ) || 1;

    const pageNumbers = Array.from(
      document.querySelectorAll(selectors.page_links)
    )
      .map((a) => parseInt((a.textContent || '').trim(), 10))
      .filter((n) => !Number.isNaN(n));

    const lastPage = pageNumbers.length ? Math.max(...pageNumbers) : currentPage;

    const nextBtn = document.querySelector(selectors.next_link);

    let nextUrl = null;
    if (currentPage < lastPage && nextBtn) {
      nextUrl = nextBtn.href || null;
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
    .catch((e) => console.warn(`[SPACENET] waitForSelector('${config.wait_for}') timeout on product: ${e.message}`));

  const data = await page.evaluate((selectors) => {
    const txt = (sel) => {
      const el = document.querySelector(sel);
      return el ? (el.textContent || '').trim() : null;
    };

    const attr = (sel, name) => {
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
            const key = (names[i].textContent || '').trim();
            const value = (values[i].textContent || '').trim();

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

    const stockHref = attr(selectors.stock, selectors.stock_attr) || '';
    const stockText = (selectors.stock_text
      ? (document.querySelector(selectors.stock_text)?.textContent || '')
      : ''
    ).trim().toLowerCase();
    let statutStock = 'UNKNOWN';

    if (stockHref.includes('InStock') || /en stock|in stock/i.test(stockText)) {
      statutStock = 'IN_STOCK';
    } else if (stockHref.includes('OutOfStock') || /rupture|épuisé|out of stock/i.test(stockText)) {
      statutStock = 'OUT_OF_STOCK';
    } else if (stockHref.includes('PreOrder') || /en arrivage|arrivage/i.test(stockText)) {
      statutStock = 'ARRIVING';
    } else if (stockHref.includes('BackOrder') || /sur commande|commande/i.test(stockText)) {
      statutStock = 'ON_ORDER';
    }

    const imageUrl =
      attr(selectors.image, selectors.image_attr) ||
      attr(selectors.image, 'src') ||
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