import { chromium } from 'playwright';
import fs from 'fs';

const browser = await chromium.launch();
const page = await browser.newPage();

console.log('Crawling Elementor docs...');
await page.goto('https://developers.elementor.com/docs/data-structure/', { 
  waitUntil: 'networkidle',
  timeout: 60000 
});

await page.waitForTimeout(3000);

const docs = await page.evaluate(() => {
  const data = { jsonExamples: [], sections: [] };
  
  // Get headings
  document.querySelectorAll('h1, h2, h3').forEach(h => {
    data.sections.push({
      level: h.tagName,
      text: h.innerText.trim()
    });
  });
  
  // Get JSON examples
  document.querySelectorAll('pre').forEach(pre => {
    const text = pre.innerText;
    if (text && text.includes('version') && text.includes('elements')) {
      data.jsonExamples.push(text.substring(0, 3000));
    }
  });
  
  return data;
});

await browser.close();

fs.writeFileSync('/tmp/elementor-docs.json', JSON.stringify(docs, null, 2));
console.log('Saved to /tmp/elementor-docs.json');
console.log('Sections:', docs.sections.length);
console.log('JSON examples:', docs.jsonExamples.length);

if (docs.jsonExamples[0]) {
  console.log('\n=== SAMPLE JSON ===');
  console.log(docs.jsonExamples[0].substring(0, 1000));
}
