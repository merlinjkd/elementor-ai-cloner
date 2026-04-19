import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();

// Try GitHub repo with Elementor examples
await page.goto('https://github.com/elementor/elementor/tree/master/docs', { 
  waitUntil: 'networkidle',
  timeout: 60000 
});

await page.waitForTimeout(2000);

const data = await page.evaluate(() => ({
  title: document.title,
  hasJsonFiles: document.body.innerText.includes('.json'),
  files: Array.from(document.querySelectorAll('[title*=".json"]')).map(el => el.title).slice(0, 10)
}));

console.log('GitHub docs:', data);

await browser.close();
