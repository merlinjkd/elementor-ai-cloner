import express from 'express';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '100mb' }));

let idCounter = 0;
function generateId() {
  return `${Date.now().toString(36)}-${(++idCounter).toString(36)}`;
}

async function scrapePage(url) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(2000);
  
  const data = await page.evaluate(() => {
    const sections = [];
    const selectors = ['section', '[class*="section"]', '[class*="hero"]', '.row'];
    document.querySelectorAll(selectors.join(', ')).forEach((el, idx) => {
      if (el.offsetHeight < 80) return;
      const style = window.getComputedStyle(el);
      const section = {
        index: idx,
        elements: []
      };
      
      // Get content
      el.querySelectorAll('h1, h2, h3, p, img').forEach(child => {
        if (child.tagName === 'IMG') {
          const src = child.currentSrc || child.src;
          if (src && !src.startsWith('data:')) {
            section.elements.push({
              type: 'image',
              src: src,
              alt: child.alt || ''
            });
          }
        } else {
          const text = child.innerText?.trim();
          if (text && text.length > 10) {
            section.elements.push({
              type: child.tagName.toLowerCase(),
              text: text.substring(0, 300)
            });
          }
        }
      });
      
      if (section.elements.length > 0) {
        sections.push(section);
      }
    });
    return { sections: sections.slice(0, 3) };
  });
  
  await browser.close();
  return data;
}

function createTemplate(data, url) {
  idCounter = 0;
  
  const template = {
    version: "0.4",
    title: `Cloned: ${new URL(url).hostname}`,
    type: "page",
    page_settings: [],
    content: []
  };
  
  data.sections.forEach(section => {
    // Create column with widgets
    const columnElements = [];
    
    section.elements.forEach(el => {
      let widget = null;
      
      if (el.type === 'image') {
        widget = {
          id: generateId(),
          elType: "widget",
          widgetType: "image",
          settings: {
            image: { url: el.src, alt: el.alt },
            image_size: "large"
          }
        };
      } else if (['h1', 'h2', 'h3'].includes(el.type)) {
        widget = {
          id: generateId(),
          elType: "widget",
          widgetType: "heading",
          settings: { title: el.text, header_size: el.type }
        };
      } else if (el.type === 'p') {
        widget = {
          id: generateId(),
          elType: "widget",
          widgetType: "text-editor",
          settings: { editor: `<p>${el.text}</p>` }
        };
      }
      
      if (widget) {
        columnElements.push(widget);
      }
    });
    
    // Only add section if we have content
    if (columnElements.length > 0) {
      const sectionEl = {
        id: generateId(),
        elType: "section",
        settings: [],
        elements: [
          {
            id: generateId(),
            elType: "column",
            settings: [],
            elements: columnElements
          }
        ]
      };
      
      template.content.push(sectionEl);
    }
  });
  
  return template;
}

app.post('/export-template', async (req, res) => {
  try {
    const { url } = req.body;
    console.log(`Exporting: ${url}`);
    const data = await scrapePage(url);
    const template = createTemplate(data, url);
    
    const filename = `elementor-v5-${Date.now()}.json`;
    const filepath = path.join(__dirname, '..', 'templates', filename);
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, JSON.stringify(template, null, 2));
    
    res.json({ success: true, template, filename });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(3000, '0.0.0.0', () => {
  console.log('V5 running - section > column > widget structure');
});
