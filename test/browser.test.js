// Browser tests in Chromium, Firefox and WebKit: npm run build && npm test
// Each suite in test/suites/ receives the browser and its name
const pw = require('playwright');
const { results, check } = require('./helpers');

const SUITES = ['drawing', 'upstream', 'features', 'pull-requests', 'node-tools', 'module-meta'].map(name => require('./suites/' + name));

async function run(name) {
  const browser = await pw[name].launch();
  for (const suite of SUITES) {
    await suite(browser, name);
  }
  await browser.close();
}

(async () => {
  for (const b of (process.env.BROWSERS || 'chromium').split(',')) {
    try { await run(b); } catch (e) { check(b, 'execution', false, e.message.split('\n')[0]); }
  }
  const bad = results.filter(r => !r.ok);
  for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} [${r.browser}] ${r.name} ${r.info}`);
  console.log(`\n${results.length - bad.length}/${results.length} ok`);
  process.exit(bad.length ? 1 : 0);
})();
