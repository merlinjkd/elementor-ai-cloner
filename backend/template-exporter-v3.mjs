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
  return `el-${Date.now()}-${++idCounter}`;
}

async function scrapePage(url) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2000);
  
  const data = await page.evaluate(() => {
    const sections = [];
    const pageBg = window.getComputedStyle(document.body).backgroundColor;
    
    // Selectors for major sections
    const selectors = ['section', '[class*="section"]', '[class*="hero"]', '.row', '.container > div', 'main > div'];
    const elements = document.querySelectorAll(selectors.join(', '));
    
    elements.forEach((el, idx) => {
      if (el.offsetHeight < 80) return;
      
      const style = window.getComputedStyle(el);
      
      const section = {
        index: idx,
        backgroundColor: style.backgroundColor === 'rgba(0, 0, 0, 0)' ? '' : style.backgroundColor,
        padding: {
          top: parseInt(style.paddingTop) || 50,
          right: parseInt(style.paddingRight) || 50,
          bottom: parseInt(style.paddingBottom) || 50,
          left: parseInt(style.paddingLeft) || 50
        },
        elements: []
      };
      
      // Get images
      el.querySelectorAll('img').forEach(img => {
        const src = img.currentSrc || img.src;
        if (src && !src.startsWith('data:')) {
          try {
            const url = new URL(src, window.location.href).href;
            section.elements.push({
              type: 'image',
              src: url,
              alt: img.alt || '',
              width: img.naturalWidth || 600,
              height: img.naturalHeight || 400
            });
          } catch (e) {}
        }
      });
      
      // Get headings
      el.querySelectorAll('h1, h2, h3, h4').forEach(h => {
        const text = h.innerText?.trim();
        if (text && text.length > 2) {
          const hStyle = window.getComputedStyle(h);
          section.elements.push({
            type: 'heading',
            level: parseInt(h.tagName[1]) || 2,
            text: text.substring(0, 200),
            fontSize: parseInt(hStyle.fontSize) || (h.tagName === 'H1' ? 36 : 24),
            fontFamily: hStyle.fontFamily?.replace(/["']/g, '').split(',')[0] || 'Arial',
            color: hStyle.color === 'rgba(0, 0, 0, 0)' ? '#000000' : hStyle.color,
            align: hStyle.textAlign || 'left'
          });
        }
      });
      
      // Get paragraphs
      el.querySelectorAll('p').forEach(p => {
        const text = p.innerText?.trim();
        if (text && text.length > 20 && !text.includes('cookie') && !text.includes('privacy')) {
          const pStyle = window.getComputedStyle(p);
          section.elements.push({
            type: 'text',
            text: text.substring(0, 500),
            fontSize: parseInt(pStyle.fontSize) || 16,
            fontFamily: pStyle.fontFamily?.replace(/["']/g, '').split(',')[0] || 'Arial',
            color: pStyle.color === 'rgba(0, 0, 0, 0)' ? '#333333' : pStyle.color,
            align: pStyle.textAlign || 'left'
          });
        }
      });
      
      // Get buttons/links
      el.querySelectorAll('a, button').forEach(btn => {
        const text = btn.innerText?.trim();
        if (text && text.length > 2 && text.length < 50) {
          const bStyle = window.getComputedStyle(btn);
          section.elements.push({
            type: 'button',
            text: text.substring(0, 50),
            href: btn.href || '#',
            fontSize: parseInt(bStyle.fontSize) || 14,
            color: bStyle.color === 'rgba(0, 0, 0, 0)' ? '#ffffff' : bStyle.color,
            backgroundColor: bStyle.backgroundColor === 'rgba(0, 0, 0, 0)' ? '#0073aa' : bStyle.backgroundColor
          });
        }
      });
      
      if (section.elements.length > 0) {
        sections.push(section);
      }
    });
    
    return { pageBackground: pageBg, sections: sections.slice(0, 5) };
  });
  
  await browser.close();
  return data;
}

function createTemplate(data, url) {
  idCounter = 0; // Reset counter
  
  const template = {
    version: "0.4",
    title: `Cloned: ${new URL(url).hostname}`,
    type: "page",
    page_settings: {}, // Empty object, not array!
    content: []
  };
  
  data.sections.forEach(section => {
    const sectionEl = {
      id: generateId(),
      elType: "section",
      settings: {}, // Empty object!
      elements: []
    };
    
    // Add background if exists
    if (section.backgroundColor && section.backgroundColor !== 'rgb(255, 255, 255)') {
      sectionEl.settings.background_color = section.backgroundColor;
    }
    
    // Add padding
    sectionEl.settings.padding = {
      unit: "px",
      top: String(section.padding.top),
      right: String(section.padding.right),
      bottom: String(section.padding.bottom),
      left: String(section.padding.left)
    };
    
    // Process elements
    section.elements.forEach(el => {
      let widget = null;
      
      switch (el.type) {
        case 'image':
          widget = {
            id: generateId(),
            elType: "widget",
            widgetType: "image",
            settings: {
              image: {
                url: el.src,
                alt: el.alt
                // No "source": "external" - Elementor doesn't use this!
              },
              image_size: "large",
              align: "center"
            }
          };
          if (el.width) {
            widget.settings.width = { unit: "px", size: Math.min(el.width, 800) };
          }
          break;
          
        case 'heading':
          widget = {
            id: generateId(),
            elType: "widget",
            widgetType: "heading",
            settings: {
              title: el.text,
              header_size: `h${el.level}`,
              align: el.align,
              title_color: el.color
            }
          };
          // Only add typography if non-default
          if (el.fontFamily !== 'Arial' && el.fontFamily !== 'serif') {
            widget.settings.typography_typography = "custom";
            widget.settings.typography_font_family = el.fontFamily;
            widget.settings.typography_font_size = { unit: "px", size: el.fontSize };
          }
          break;
          
        case 'text':
          widget = {
            id: generateId(),
            elType: "widget",
            widgetType: "text-editor",
            settings: {
              editor: `<p>${el.text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`,
              align: el.align,
              text_color: el.color
            }
          };
          if (el.fontFamily !== 'Arial' && el.fontFamily !== 'serif') {
            widget.settings.typography_typography = "custom";
            widget.settings.typography_font_family = el.fontFamily;
            widget.settings.typography_font_size = { unit: "px", size: el.fontSize };
          }
          break;
          
        case 'button':
          widget = {
            id: generateId(),
            elType: "widget",
            widgetType: "button",
            settings: {
              text: el.text,
              link: { url: el.href, is_external: el.href && !el.href.startsWith('#') && !el.href.startsWith('/') ? true : false },
              align: "center",
              button_text_color: el.color,
              background_color: el.backgroundColor,
              border_radius: { unit: "px", size: 4 }
            }
          };
          break;
      }
      
      if (widget) {
        // Clean empty/null values from settings
        Object.keys(widget.settings).forEach(key => {
          if (widget.settings[key] === null || widget.settings[key] === '' || 
              (typeof widget.settings[key] === 'object' && Object.keys(widget.settings[key]).length === 0)) {
            delete widget.settings[key];
          }
        });
        
        sectionEl.elements.push(widget);
      }
    });
    
    if (sectionEl.elements.length > 0) {
      template.content.push(sectionEl);
    }
  });
  
  return template;
}

// Routes
app.post('/export-template', async (req, res) => {
  try {
    const { url } = req.body;
    console.log(`Exporting: ${url}`);
    
    const data = await scrapePage(url);
    const template = createTemplate(data, url);
    
    const timestamp = Date.now();
    const filename = `elementor-v3-${timestamp}.json`;
    const templatesDir = path.join(__dirname, '..', 'templates');
    const filepath = path.join(templatesDir, filename);
    
    fs.mkdirSync(templatesDir, { recursive: true });
    fs.writeFileSync(filepath, JSON.stringify(template, null, 2));
    
    const summary = {
      url,
      timestamp: new Date().toISOString(),
      sections: template.content.length,
      totalElements: template.content.reduce((sum, s) => sum + s.elements.length, 0),
      images: template.content.reduce((sum, s) => sum + s.elements.filter(e => e.widgetType === 'image').length, 0)
    };
    
    res.json({
      success: true,
      template,
      summary,
      filename,
      download_url: `/download/${filename}`,
      filepath
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/download/:filename', (req, res) => {
  const filepath = path.join(__dirname, '..', 'templates', req.params.filename);
  if (fs.existsSync(filepath)) {
    res.download(filepath, req.params.filename);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

app.listen(3000, '0.0.0.0', () => {
  console.log('V3 Template Exporter running on :3000');
  console.log('Fixed: settings as objects, no source:external, clean settings');
});
