const express = require('express');

const { SITE_CONFIGS } = require('./src/config/sites');
const mytekParser      = require('./src/parsers/mytek');
const spacenetParser   = require('./src/parsers/spacenet');
const tunisianetParser = require('./src/parsers/tunisianet');
const carrefourParser  = require('./src/parsers/carrefour');
const geantParser      = require('./src/parsers/geant');
const azizaParser      = require('./src/parsers/aziza');
const {
  initBrowserPool,
  getNextBrowser,
  closeBrowserPool,
} = require('./src/utils/browserPool');
const { solveCloudflare } = require('./src/utils/flaresolverr');

const app = express();
app.use(express.json());

const PORT = 3001;

const SITE_PARSERS = {
  mytek:               mytekParser,
  spacenet:            spacenetParser,
  tunisianet:          tunisianetParser,
  carrefour:           carrefourParser,
  'geant-tunis-city':  geantParser,
  'geant-azur-city':   geantParser,
  'geant-bourgo-mall': geantParser,
  'geant-sfax':        geantParser,
  aziza:               azizaParser,
};

async function withPage(url, timeout, handler, options = {}) {
  let context = null;
  let page = null;

  try {
    const contextOptions = {
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
    };

    let cookiesToInject = [];

    if (options.useFlaresolverr) {
      console.log(`[FLARESOLVERR] Pre-solving Cloudflare for ${url}`);
      const solution = await solveCloudflare(url);
      contextOptions.userAgent = solution.userAgent;
      cookiesToInject = solution.cookies || [];
    }

    context = await getNextBrowser().newContext(contextOptions);

    if (cookiesToInject.length > 0) {
      await context.addCookies(cookiesToInject.map(c => ({
        name:     c.name,
        value:    c.value,
        domain:   c.domain,
        path:     c.path || '/',
        expires:  c.expiry || -1,
        httpOnly: c.httpOnly || false,
        secure:   c.secure || false,
        sameSite: ['Strict', 'Lax', 'None'].includes(c.sameSite) ? c.sameSite : 'None',
      })));
      console.log(`[FLARESOLVERR] Injected ${cookiesToInject.length} cookies into context`);
    }

    page = await context.newPage();

    await page.route('**/*', route => {
      const resourceType = route.request().resourceType();
      if (['image', 'font', 'media'].includes(resourceType)) {
        route.abort();
      } else {
        route.continue();
      }
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });

    const result = await handler(page);

    await context.close();
    return result;
  } catch (error) {
    let screenshot = null;
    let pageHtml = null;
    try {
      if (page) {
        screenshot = await page.screenshot({ encoding: 'base64', fullPage: false }).catch(() => null);
        pageHtml   = await page.content().catch(() => null);
      }
    } catch (_) {}

    error.diagnostic = { screenshot, pageHtml, url };
    if (context) await context.close().catch(() => {});
    throw error;
  }
}

function resolveSite(site_id) {
  const config = SITE_CONFIGS[site_id];
  const parser = SITE_PARSERS[site_id];

  if (!config || !parser) {
    throw new Error(`site_id non supporté: ${site_id}`);
  }

  return { config, parser };
}

// ─────────────────────────────────────────────
// Health
// ─────────────────────────────────────────────
app.get('/health', (req, res) => {
  if (!poolReady) {
    return res.status(503).json({ status: 'initializing', service: 'playwright' });
  }
  res.json({ status: 'ok', service: 'playwright' });
});

// ─────────────────────────────────────────────
// Homepage
// ─────────────────────────────────────────────
app.post('/scrape/homepage', async (req, res) => {
  const { url, site_id, timeout = 60000 } = req.body;
  console.log(`[REQ] POST /scrape/homepage | site=${site_id} | url=${url}`);

  if (!url)     return res.status(400).json({ error: 'url requis' });
  if (!site_id) return res.status(400).json({ error: 'site_id requis' });

  try {
    const { config, parser } = resolveSite(site_id);
    const pageOptions = { useFlaresolverr: config.cloudflare === true };

    const categories = await withPage(
      url,
      timeout,
      (page) => parser.parseHomepage(page, config.homepage, url),
      pageOptions,
    );

    console.log(`[OK]  /scrape/homepage | site=${site_id} | ${categories.length} categories`);
    res.json({ categories, status: 'success', site_id });
  } catch (error) {
    console.error(`[ERR] /scrape/homepage | site=${site_id} | ${error.message}`);
    res.status(500).json({
      error:  error.message,
      status: 'failed',
      site_id,
      diagnostic: {
        screenshot_b64: error.diagnostic?.screenshot || null,
        page_url:       error.diagnostic?.url        || null,
      },
    });
  }
});

// ─────────────────────────────────────────────
// Category
// ─────────────────────────────────────────────
app.post('/scrape/category', async (req, res) => {
  const { url, site_id, timeout = 60000 } = req.body;
  console.log(`[REQ] POST /scrape/category | site=${site_id} | url=${url}`);

  if (!url)     return res.status(400).json({ error: 'url requis' });
  if (!site_id) return res.status(400).json({ error: 'site_id requis' });

  try {
    const { config, parser } = resolveSite(site_id);
    const pageOptions = { useFlaresolverr: config.cloudflare === true };

    const data = await withPage(url, timeout, async (page) => {
      return await parser.parseCategory(page, config.category, url);
    }, pageOptions);

    console.log(`[OK]  /scrape/category | site=${site_id} | ${(data.products || []).length} products`);
    res.json({
      products: data.products || [],
      next_url: data.next_url || null,
      status:   'success',
      site_id,
    });
  } catch (error) {
    console.error(`[ERR] /scrape/category | site=${site_id} | ${error.message}`);
    res.status(500).json({
      error:  error.message,
      status: 'failed',
      site_id,
      diagnostic: {
        screenshot_b64: error.diagnostic?.screenshot || null,
        page_url:       error.diagnostic?.url        || null,
      },
    });
  }
});

// ─────────────────────────────────────────────
// Product
// ─────────────────────────────────────────────
app.post('/scrape/product', async (req, res) => {
  const { url, site_id, timeout = 60000 } = req.body;
  console.log(`[REQ] POST /scrape/product | site=${site_id} | url=${url}`);

  if (!url)     return res.status(400).json({ error: 'url requis' });
  if (!site_id) return res.status(400).json({ error: 'site_id requis' });

  try {
    const { config, parser } = resolveSite(site_id);
    const pageOptions = { useFlaresolverr: config.cloudflare === true };

    const data = await withPage(url, timeout, async (page) => {
      return await parser.parseProduct(page, config.product, url);
    }, pageOptions);

    console.log(`[OK]  /scrape/product | site=${site_id} | name=${data.nom || 'N/A'}`);
    res.json({
      ...data,
      url,
      status: 'success',
      site_id,
    });
  } catch (error) {
    console.error(`[ERR] /scrape/product | site=${site_id} | ${error.message}`);
    res.status(500).json({
      error:  error.message,
      status: 'failed',
      site_id,
      diagnostic: {
        screenshot_b64: error.diagnostic?.screenshot || null,
        page_url:       error.diagnostic?.url        || null,
      },
    });
  }
});

// ─────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────
let poolReady = false;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Playwright service listening on port ${PORT}`);
});

initBrowserPool()
  .then(() => {
    poolReady = true;
    console.log('Browser pool ready');
  })
  .catch((err) => {
    console.error('Erreur init:', err);
    process.exit(1);
  });

process.on('SIGTERM', async () => {
  await closeBrowserPool();
  process.exit(0);
});