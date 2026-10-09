const { chromium } = require('playwright');

const BROWSER_POOL_SIZE = parseInt(process.env.BROWSER_POOL_SIZE || '2', 10);

let browserPool = [];
let poolIndex = 0;

async function initBrowserPool() {
  console.log(`Initialisation du pool de ${BROWSER_POOL_SIZE} browsers...`);

  for (let i = 0; i < BROWSER_POOL_SIZE; i++) {
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    browserPool.push(browser);
    console.log(`Browser ${i + 1}/${BROWSER_POOL_SIZE} prêt`);
  }
}

function getNextBrowser() {
  const browser = browserPool[poolIndex % browserPool.length];
  poolIndex += 1;
  return browser;
}

async function closeBrowserPool() {
  for (const browser of browserPool) {
    await browser.close().catch(() => {});
  }
}

module.exports = {
  initBrowserPool,
  getNextBrowser,
  closeBrowserPool,
};