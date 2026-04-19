import { chromium } from 'playwright';

export async function scrapeWithVision(url) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 3000 } });

  await page.goto(url, { waitUntil: 'networkidle' });

  const screenshot = await page.screenshot({ fullPage: true });

  const layout = await page.evaluate(() => {
    function node(el) {
      const r = el.getBoundingClientRect();
      const s = window.getComputedStyle(el);

      return {
        tag: el.tagName.toLowerCase(),
        text: el.innerText?.slice(0,120),
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        styles: {
          fontSize: s.fontSize,
          fontFamily: s.fontFamily,
          color: s.color,
          backgroundColor: s.backgroundColor
        },
        children: Array.from(el.children).map(node)
      };
    }
    return node(document.body);
  });

  await browser.close();

  return {
    layout,
    screenshot: screenshot.toString('base64')
  };
}
