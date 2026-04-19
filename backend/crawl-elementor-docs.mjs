import { chromium } from 'playwright';
import fs from 'fs';

const urls = [
  'https://developers.elementor.com/docs/data-structure/general-structure/',
  'https://developers.elementor.com/docs/data-structure/page-settings/',
  'https://developers.elementor.com/docs/data-structure/page-content/'
];

const browser = await chromium.launch();
const page = await browser.newPage();

const allDocs = {};

for (const url of urls) {
  console.log(`Crawling: ${url}`);
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000);
    
    const content = await page.evaluate(() => {
      // Get main article content
      const article = document.querySelector('article, main, .doc-content, .documentation, [class*="content"]');
      const mainContent = article || document.body;
      
      return {
        title: document.title,
        headings: Array.from(document.querySelectorAll('h1, h2, h3, h4')).map(h => ({
          level: h.tagName,
          text: h.innerText.trim(),
          id: h.id
        })),
        codeBlocks: Array.from(document.querySelectorAll('pre, code, .prism-code')).map(block => ({
          text: block.innerText.substring(0, 2000),
          isJson: block.innerText.trim().startsWith('{') || block.innerText.includes('"version"')
        })).filter(b => b.text.length > 50),
        tables: Array.from(document.querySelectorAll('table')).map(t => ({
          headers: Array.from(t.querySelectorAll('th')).map(th => th.innerText.trim()),
          rows: Array.from(t.querySelectorAll('tr')).slice(1).map(tr => 
            Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim())
          )
        })),
        keyText: mainContent.innerText.substring(0, 3000)
      };
    });
    
    const pageName = url.split('/').slice(-2)[0];
    allDocs[pageName] = content;
    
  } catch (e) {
    console.error(`Error on ${url}: ${e.message}`);
    allDocs[url.split('/').slice(-2)[0]] = { error: e.message };
  }
}

await browser.close();

fs.writeFileSync('/tmp/elementor-detailed-docs.json', JSON.stringify(allDocs, null, 2));
console.log('\n=== Results saved to /tmp/elementor-detailed-docs.json ===');

// Print summary
for (const [name, data] of Object.entries(allDocs)) {
  if (data.error) {
    console.log(`\n${name}: ERROR - ${data.error}`);
  } else {
    console.log(`\n${name}:`);
    console.log(`  Headings: ${data.headings?.length || 0}`);
    console.log(`  Code blocks: ${data.codeBlocks?.length || 0}`);
    console.log(`  Tables: ${data.tables?.length || 0}`);
    if (data.codeBlocks && data.codeBlocks.length > 0) {
      const jsonBlocks = data.codeBlocks.filter(b => b.isJson);
      console.log(`  JSON examples: ${jsonBlocks.length}`);
      if (jsonBlocks.length > 0) {
        console.log(`  First JSON preview: ${jsonBlocks[0].text.substring(0, 150)}...`);
      }
    }
  }
}
