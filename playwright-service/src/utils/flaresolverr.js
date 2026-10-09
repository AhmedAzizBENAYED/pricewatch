const http = require('http');

const FLARESOLVERR_URL  = process.env.FLARESOLVERR_URL || 'http://flaresolverr:8191/v1';
const COOKIE_TTL_MS     = 30 * 60 * 1000;  // 30 min — how long cookies are considered fresh
const REFRESH_AHEAD_MS  = 5  * 60 * 1000;  // start background refresh 5 min before expiry
const COOLDOWN_MS       = 90 * 1000;        // after a failure, wait 90s before retrying

// Entry shapes:
//   { solution, expiresAt, refreshing? }  — resolved, actively used
//   { promise }                           — in-flight blocking solve
//   { cooldownUntil, error }              — failed, do not retry yet
const cache = new Map();

async function solveCloudflare(targetUrl) {
  const domain = new URL(targetUrl).hostname;
  const entry  = cache.get(domain);

  if (entry) {
    // ── In-flight: another request is already solving ─────────────────────
    if (entry.promise) {
      console.log(`[FLARESOLVERR] Waiting for in-flight solve for ${domain}`);
      return entry.promise;
    }

    // ── Cooldown: recent failure, do not hammer FlareSolverr ─────────────
    if (entry.cooldownUntil) {
      if (entry.cooldownUntil > Date.now()) {
        const waitSec = Math.round((entry.cooldownUntil - Date.now()) / 1000);
        throw new Error(`FlareSolverr en cooldown, réessai dans ${waitSec}s`);
      }
      cache.delete(domain); // cooldown expired — fall through to re-solve
    }

    // ── Fresh cache: serve immediately ────────────────────────────────────
    else if (entry.expiresAt > Date.now()) {
      const remainingSec = Math.round((entry.expiresAt - Date.now()) / 1000);
      console.log(`[FLARESOLVERR] Using cached cookies for ${domain} (${remainingSec}s remaining)`);

      // Proactive background refresh 5 min before expiry — no blocking
      if (!entry.refreshing && entry.expiresAt - Date.now() < REFRESH_AHEAD_MS) {
        entry.refreshing = true;
        console.log(`[FLARESOLVERR] Starting background refresh for ${domain}`);
        _doSolve(targetUrl)
          .then((solution) => {
            cache.set(domain, { solution, expiresAt: Date.now() + COOKIE_TTL_MS });
            console.log(`[FLARESOLVERR] Background refresh done for ${domain}`);
          })
          .catch((err) => {
            entry.refreshing = false;
            console.error(`[FLARESOLVERR] Background refresh failed for ${domain}: ${err.message}`);
            // Keep current (nearly-expired) cookies — they may still work
          });
      }

      return entry.solution;
    }

    // ── Expired: fall through to blocking solve ───────────────────────────
    else {
      cache.delete(domain);
    }
  }

  // ── No valid cache — blocking solve ──────────────────────────────────────
  const promise = _doSolve(targetUrl)
    .then((solution) => {
      cache.set(domain, { solution, expiresAt: Date.now() + COOKIE_TTL_MS });
      console.log(`[FLARESOLVERR] Cached solution for ${domain} (valid ${COOKIE_TTL_MS / 60000}min)`);
      return solution;
    })
    .catch((err) => {
      cache.set(domain, { cooldownUntil: Date.now() + COOLDOWN_MS, error: err.message });
      console.error(`[FLARESOLVERR] Solve failed for ${domain}, cooldown ${COOLDOWN_MS / 1000}s: ${err.message}`);
      throw err;
    });

  cache.set(domain, { promise });
  return promise;
}

function _doSolve(targetUrl) {
  const body     = JSON.stringify({ cmd: 'request.get', url: targetUrl, maxTimeout: 120000 });
  const endpoint = new URL(FLARESOLVERR_URL);

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: endpoint.hostname,
      port:     parseInt(endpoint.port || '8191', 10),
      path:     endpoint.pathname,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.status !== 'ok') {
            return reject(new Error(`FlareSolverr: ${parsed.message || parsed.status}`));
          }
          console.log(`[FLARESOLVERR] Challenge solved for ${targetUrl}`);
          resolve(parsed.solution);
        } catch (e) {
          reject(new Error(`FlareSolverr parse error: ${e.message}`));
        }
      });
    });

    req.setTimeout(130000, () => {
      req.destroy(new Error('FlareSolverr HTTP request timed out'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { solveCloudflare };