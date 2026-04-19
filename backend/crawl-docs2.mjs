import { chromium } from 'playwright';
import fs from 'fs';

const browser = await chromium.launch();
const page = await browser.newPage();

await page.goto('https://developers.elementor.com/docs/data-structure/', { 
  waitUntil: 'networkidle',
  timeout: 60000 
});

await page.waitForTimeout(3000);

const docs = await page.evaluate(() => {
  const data = { 
    jsonExamples: [], 
    allPreBlocks: [],
    codeSnippets: [],
    pageText: ''
  };
  
  // Get all pre and code blocks
  document.querySelectorAll('pre, code, .prism-code, .language-json').forEach(el => {
    const text = el.innerText || el.textContent;
    if (text && text.length > 20) {
      data.allPreBlocks.push({
        tag: el.tagName,
        class: el.className,
        text: text.substring(0, 500)
      });
    }
  });
  
  // Try to find JSON in any element
  const bodyText = document.body.innerText;
  const jsonMatches = bodyText.match(/\{[\s\S]*?"version"[\s\S]*?\}/g);
  if (jsonMatches) {
    data.jsonExamples = jsonMatches.slice(0, 3).map(m => m.substring(0, 2000));
  }
  
  // Look for specific Elementor structure mentions
  const elementorMatches = bodyText.match(/"elType"[\s\S]{0,100}/g);
  if (elementorMatches) {
    data.codeSnippets = elementorMatches.slice(0, 5);
  }
  
  // Get main article content
  const article = document.querySelector('article, main, .content, .documentation');
  if (article) {
    data.pageText = article.innerText.substring(0, 3000);
  }
  
  return data;
});

await browser.close();

fs.writeFileSync('/tmp/elementor-docs2.json', JSON.stringify(docs, null, 2));

console.log('Pre/code blocks found:', docs.allPreBlocks.length);
console.log('JSON matches:', docs.jsonExamples.length);
console.log('Elementor snippets:', docs.codeSnippets.length);

if (docs.jsonExamples[0]) {
  console.log('\n=== JSON EXAMPLE ===');
  console.log(docs.jsonExamples[0]);
}

if (docs.allPreBlocks[0]) {
  console.log('\n=== FIRST CODE BLOCK ===');
  console.log(docs.allPreBlocks[0]);
}
