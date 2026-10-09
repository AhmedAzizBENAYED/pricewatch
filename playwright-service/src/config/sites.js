const SITE_CONFIGS = {
  mytek: {
    cloudflare: true,
    homepage: {
      wait_for: 'ul.level3-popup.halfwidth-popup-sub-sub',
      category_links: 'ul.level3-popup.halfwidth-popup-sub-sub li.category-item a.clearfix',
    },
    category: {
      wait_for: 'a.product-item-link',
      product_links: 'a.product-item-link',
      next_link: "li.page-item.active + li.page-item:not(.disabled) a.page-link",
      next_disabled: null,
    },
    product: {
      wait_for: 'div.product-info-main',
      name: 'h1.page-title span.base',
      final_price: "span.price-wrapper[data-price-type='finalPrice']",
      final_price_attr: 'data-price-amount',
      original_price: "span.price-wrapper[data-price-type='oldPrice']",
      original_price_attr: 'data-price-amount',
      stock: "link[itemprop='availability']",
      stock_attr: 'href',
      image: "div#gallery-container img[itemprop='image']",
      image_attr: 'src',
      description: 'div.product.attribute.overview div.value',
      specs_table: '#product-attribute-specs-table',
    },
  },

  spacenet: {
    homepage: {
      wait_for: '#sp-vermegamenu',
      category_links: [
        '#sp-vermegamenu .level-1 > li > a',
        '#sp-vermegamenu .level-2 > li > a',
        '#sp-vermegamenu .level-3 > li > a',
        'a.sp-megamenu-link'
      ],
    },
    category: {
      wait_for: '#js-product-list',
      product_links: '#js-product-list .products h2.product_name > a',
      product_card: 'div.js-product-miniature',
      card_image: 'img.img-responsive.product_image',
      card_stock: '.product-quantities label.label',
      current_page: 'nav.pagination ul.page-list li.current a',
      page_links: 'nav.pagination ul.page-list a.js-search-link',
      next_link: 'nav.pagination a.next.js-search-link',
      next_disabled: 'nav.pagination a.next.disabled.js-search-link',
    },
    product: {
      wait_for: 'div.product-Details, h1.h1',
      name: 'h1.h1',
      final_price: 'div.current-price > span[content]',
      final_price_attr: 'content',
      original_price: 'div.product-discount span.regular-price',
      stock: 'link[itemprop="availability"]',
      stock_attr: 'href',
      stock_text: '#product-availability, span[id*="availability"]',
      description: 'div[id^="product-description-short-"]',
      image: 'div.grid-thumb-product img.thumb.js-thumb, img.thumb.js-thumb',
      image_attr: 'data-image-large-src',
      specs_variants: [
        {
          type: 'dl_pairs',
          names: 'section.product-features dl.data-sheet dt.name',
          values: 'section.product-features dl.data-sheet dd.value',
        },
        {
          type: 'table_rows',
          rows: 'table tbody tr',
        },
        {
          type: 'product_information_table',
          rows: 'div.product-information table tbody tr',
        },
      ],
    },
  },

  tunisianet: {
    homepage: {
      wait_for: '#_desktop_top_menu ul.menu-content.top-menu',
      category_links: [
        '#_desktop_top_menu li.menu-item.item-header > a',
        '#_desktop_top_menu li.menu-item.item-line > a',
      ],
    },
    category: {
      wait_for: '#js-product-list',
      product_links: 'h2.h3.product-title > a',
      current_page: '#js-product-list nav.pagination ul.page-list.clearfix li.current a',
      page_links: '#js-product-list nav.pagination ul.page-list.clearfix a.js-search-link',
      next_link: '#js-product-list nav.pagination ul.page-list.clearfix a.next.js-search-link',
    },
    product: {
      wait_for: 'h1.h1[itemprop="name"]',
      name: 'h1.h1[itemprop="name"]',
      final_price: 'div.current-price span[itemprop="price"]',
      final_price_attr: 'content',
      original_price: 'span.regular-price',
      stock: '#stock_availability span',
      stock_attr: 'class',
      description: 'div[id^="product-description-short-"]',
      image: 'img.thumb.js-thumb',
      image_attr: 'data-image-large-src',
      specs_variants: [
        {
          type: 'dl_pairs',
          names: 'dl.data-sheet dt.name',
          values: 'dl.data-sheet dd.value',
        },
      ],
    },
  },

  // ── Carrefour (React SPA — all interaction handled inside the parser) ────────
  carrefour: {
    homepage: { timeout: 60000 },
    category:  { timeout: 60000 },
    product:   { timeout: 60000 },
  },

  // ── Géant Drive — one entry per store ───────────────────────────────────────
  'geant-tunis-city': {
    homepage: { timeout: 120000, store: 'tunis-city' },
    category:  { timeout: 120000 },
    product:   { timeout: 120000 },
  },
  'geant-azur-city': {
    homepage: { timeout: 120000, store: 'azur-city' },
    category:  { timeout: 120000 },
    product:   { timeout: 120000 },
  },
  'geant-bourgo-mall': {
    homepage: { timeout: 120000, store: 'bourgo-mall' },
    category:  { timeout: 120000 },
    product:   { timeout: 120000 },
  },
  'geant-sfax': {
    homepage: { timeout: 120000, store: 'sfax' },
    category:  { timeout: 120000 },
    product:   { timeout: 120000 },
  },

  // ── Aziza (Angular SPA — whole homepage is the single "category" page) ──────
  aziza: {
    homepage: { timeout: 60000 },
    category:  { timeout: 60000 },
    product:   { timeout: 60000 },
  },
};

module.exports = { SITE_CONFIGS };