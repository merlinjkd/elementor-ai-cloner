import { chromium } from 'playwright';
import fs from 'fs';

const browser = await chromium.launch();
const page = await browser.newPage();

// Search for "elementor json template structure example"
await page.goto('https://www.google.com/search?q=elementor+json+import+template+structure+example+site', { 
  waitUntil: 'networkidle',
  timeout: 60000 
});

await page.waitForTimeout(2000);

const results = await page.evaluate(() => {
  const links = [];
  document.querySelectorAll('a').forEach(a => {
    const href = a.href;
    const text = a.innerText;
    if (href && (href.includes('elementor') || href.includes('json')) && text.length > 10) {
      links.push({ href: href.substring(0, 100), text: text.substring(0, 100) });
    }
  });
  return links.slice(0, 10);
});

console.log('Found links:', results.length);
results.forEach((r, i) => console.log(`${i+1}. ${r.text.substring(0, 60)}...`));

await browser.close();
