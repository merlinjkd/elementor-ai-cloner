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

// Convert RGB/RGBA to hex
function colorToHex(color) {
  if (!color || color === 'rgba(0, 0, 0, 0)' || color === 'transparent') return '';
  
  const rgb = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgb) {
    const r = parseInt(rgb[1]).toString(16).padStart(2, '0');
    const g = parseInt(rgb[2]).toString(16).padStart(2, '0');
    const b = parseInt(rgb[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }
  return color;
}

async function scrapePage(url) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  
  console.log(`Scraping: ${url}`);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2000);
  
  const data = await page.evaluate(() => {
    const sections = [];
    
    const selectors = ['section', '[class*="section"]', '[class*="hero"]', '.row', '.container > div', 'main > div'];
    const elements = document.querySelectorAll(selectors.join(', '));
    
    elements.forEach((el, idx) => {
      if (el.offsetHeight < 80) return;
      
      const style = window.getComputedStyle(el);
      
      const section = {
        index: idx,
        backgroundColor: style.backgroundColor,
        padding: {
          top: parseInt(style.paddingTop) || 50,
          right: parseInt(style.paddingRight) || 50,
          bottom: parseInt(style.paddingBottom) || 50,
          left: parseInt(style.paddingLeft) || 50
        },
        elements: []
      };
      
      // Images
      el.querySelectorAll('img').forEach(img => {
        const src = img.currentSrc || img.src;
        if (src && !src.startsWith('data:')) {
          try {
            section.elements.push({
              type: 'image',
              src: new URL(src, window.location.href).href,
              alt: img.alt || '',
              width: img.naturalWidth || 600,
              height: img.naturalHeight || 400
            });
          } catch (e) {}
        }
      });
      
      // Headings
      el.querySelectorAll('h1, h2, h3, h4').forEach(h => {
        const text = h.innerText?.trim();
        if (text && text.length > 2) {
          const hStyle = window.getComputedStyle(h);
          section.elements.push({
            type: 'heading',
            level: parseInt(h.tagName[1]) || 2,
            text: text.substring(0, 200),
            fontSize: parseInt(hStyle.fontSize) || 24,
            fontFamily: hStyle.fontFamily?.replace(/["']/g, '').split(',')[0] || 'Arial',
            color: hStyle.color,
            align: hStyle.textAlign || 'left'
          });
        }
      });
      
      // Paragraphs
      el.querySelectorAll('p').forEach(p => {
        const text = p.innerText?.trim();
        if (text && text.length > 20) {
          const pStyle = window.getComputedStyle(p);
          section.elements.push({
            type: 'text',
            text: text.substring(0, 500),
            fontSize: parseInt(pStyle.fontSize) || 16,
            fontFamily: pStyle.fontFamily?.replace(/["']/g, '').split(',')[0] || 'Arial',
            color: pStyle.color,
            align: pStyle.textAlign || 'left'
          });
        }
      });
      
      // Buttons
      el.querySelectorAll('a, button').forEach(btn => {
        const text = btn.innerText?.trim();
        if (text && text.length > 2 && text.length < 50) {
          const bStyle = window.getComputedStyle(btn);
          section.elements.push({
            type: 'button',
            text: text.substring(0, 50),
            href: btn.href || '#',
            fontSize: parseInt(bStyle.fontSize) || 14,
            color: bStyle.color,
            backgroundColor: bStyle.backgroundColor
          });
        }
      });
      
      if (section.elements.length > 0) {
        sections.push(section);
      }
    });
    
    return { sections: sections.slice(0, 6) };
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
    page_settings: [],  // EMPTY ARRAY - per docs!
    content: []
  };
  
  data.sections.forEach(section => {
    const sectionEl = {
      id: generateId(),
      elType: "section",
      isInner: false,
      settings: [],  // EMPTY ARRAY - per docs!
      elements: []
    };
    
    // Build settings object ONLY if there are actual settings
    const settings = {};
    
    if (section.backgroundColor && section.backgroundColor !== 'rgba(0, 0, 0, 0)') {
      settings.background_color = colorToHex(section.backgroundColor);
    }
    
    settings.padding = {
      unit: "px",
      top: String(section.padding.top),
      right: String(section.padding.right),
      bottom: String(section.padding.bottom),
      left: String(section.padding.left)
    };
    
    // Only convert to object if we have settings
    if (Object.keys(settings).length > 0) {
      sectionEl.settings = settings;
    }
    // Otherwise stays as [] (empty array)
    
    // Process elements
    section.elements.forEach(el => {
      let widget = null;
      const widgetSettings = {};  // Start empty, build up
      
      switch (el.type) {
        case 'image':
          widget = {
            id: generateId(),
            elType: "widget",
            widgetType: "image",
            settings: {
              image: { url: el.src, alt: el.alt },
              image_size: "large",
              align: "center"
            }
          };
          if (el.width) {
            widget.settings.width = { unit: "px", size: Math.min(el.width, 800) };
          }
          break;
          
        case 'heading':
          widgetSettings.title = el.text;
          widgetSettings.header_size = `h${el.level}`;
          widgetSettings.align = el.align;
          if (el.color && el.color !== 'rgba(0, 0, 0, 0)') {
            widgetSettings.title_color = colorToHex(el.color);
          }
          if (el.fontFamily !== 'Arial' && el.fontFamily !== 'serif') {
            widgetSettings.typography_typography = "custom";
            widgetSettings.typography_font_family = el.fontFamily;
            widgetSettings.typography_font_size = { unit: "px", size: el.fontSize };
          }
          widget = {
            id: generateId(),
            elType: "widget",
            widgetType: "heading",
            settings: widgetSettings
          };
          break;
          
        case 'text':
          widgetSettings.editor = el.text;
          widgetSettings.align = el.align;
          if (el.color && el.color !== 'rgba(0, 0, 0, 0)') {
            widgetSettings.text_color = colorToHex(el.color);
          }
          if (el.fontFamily !== 'Arial' && el.fontFamily !== 'serif') {
            widgetSettings.typography_typography = "custom";
            widgetSettings.typography_font_family = el.fontFamily;
            widgetSettings.typography_font_size = { unit: "px", size: el.fontSize };
          }
          widget = {
            id: generateId(),
            elType: "widget",
            widgetType: "text-editor",
            settings: widgetSettings
          };
          break;
          
        case 'button':
          widgetSettings.text = el.text;
          widgetSettings.link = { url: el.href, is_external: true, target: "_blank" };
          widgetSettings.align = "center";
          if (el.color && el.color !== 'rgba(0, 0, 0, 0)') {
            widgetSettings.button_text_color = colorToHex(el.color);
          }
          if (el.backgroundColor && el.backgroundColor !== 'rgba(0, 0, 0, 0)') {
            widgetSettings.background_color = colorToHex(el.backgroundColor);
          }
          widgetSettings.border_radius = { unit: "px", size: 4 };
          widget = {
            id: generateId(),
            elType: "widget",
            widgetType: "button",
            settings: widgetSettings
          };
          break;
      }
      
      if (widget) {
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
    const filename = `elementor-v4-${timestamp}.json`;
    const templatesDir = path.join(__dirname, '..', 'templates');
    const filepath = path.join(templatesDir, filename);
    
    fs.mkdirSync(templatesDir, { recursive: true });
    fs.writeFileSync(filepath, JSON.stringify(template, null, 2));
    
    // Validate against Elementor docs
    const validation = {
      page_settings_type: Array.isArray(template.page_settings) ? 'array' : typeof template.page_settings,
      content_is_array: Array.isArray(template.content),
      sections_with_settings_array: template.content.filter(s => Array.isArray(s.settings)).length,
      sections_with_settings_object: template.content.filter(s => typeof s.settings === 'object' && !Array.isArray(s.settings)).length
    };
    
    res.json({
      success: true,
      template,
      validation,
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
  console.log('V4 Template Exporter running on :3000');
  console.log('FIXED: Empty settings = [], with settings = {} per Elementor docs');
});
