import express from 'express';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '100mb' }));

async function scrapePageAdvanced(url) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ 
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1
  });
  
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  
  // Scroll to load lazy images
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2000);
  
  const pageData = await page.evaluate(() => {
    // Define all helper functions INSIDE page.evaluate
    
    function analyzeLayout(element) {
      const computed = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      
      const display = computed.display;
      const flexDirection = computed.flexDirection;
      const gridTemplateColumns = computed.gridTemplateColumns;
      
      let layoutType = 'block';
      let columns = 1;
      
      if (display === 'flex' || display === 'inline-flex') {
        layoutType = flexDirection === 'row' ? 'row-flex' : 'column-flex';
        if (layoutType === 'row-flex') {
          columns = Math.min(element.children.length, 4);
        }
      } else if (display === 'grid' && gridTemplateColumns && gridTemplateColumns !== 'none') {
        layoutType = 'grid';
        columns = gridTemplateColumns.split(' ').length;
      }
      
      const className = element.className || '';
      if (className.includes('col-') || className.includes('column')) {
        const match = className.match(/col-(md|lg|sm)?-?(\d+)/);
        if (match) {
          columns = parseInt(match[2]) <= 6 ? 2 : 1;
        }
      }
      
      return {
        layoutType,
        columns: Math.min(columns, 4),
        width: rect.width,
        height: rect.height,
        hasBackgroundImage: computed.backgroundImage !== 'none',
        backgroundImage: computed.backgroundImage,
        backgroundColor: computed.backgroundColor,
        backgroundSize: computed.backgroundSize,
        backgroundPosition: computed.backgroundPosition,
        padding: {
          top: parseInt(computed.paddingTop) || 50,
          right: parseInt(computed.paddingRight) || 50,
          bottom: parseInt(computed.paddingBottom) || 50,
          left: parseInt(computed.paddingLeft) || 50
        }
      };
    }
    
    function extractImages(element) {
      const images = [];
      const imgElements = element.querySelectorAll('img');
      
      imgElements.forEach(img => {
        const src = img.currentSrc || img.src || img.dataset.src;
        const srcset = img.srcset;
        const alt = img.alt || '';
        
        if (src && !src.startsWith('data:')) {
          try {
            const url = new URL(src, window.location.href).href;
            images.push({
              src: url,
              srcset,
              alt,
              width: img.naturalWidth || img.width || 0,
              height: img.naturalHeight || img.height || 0,
              isBackground: false
            });
          } catch (e) {}
        }
      });
      
      // Background images
      const divs = element.querySelectorAll('div, section, article');
      divs.forEach(div => {
        const style = window.getComputedStyle(div);
        const bgImage = style.backgroundImage;
        
        if (bgImage && bgImage !== 'none' && bgImage.includes('url(')) {
          const urlMatch = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
          if (urlMatch && !urlMatch[1].startsWith('data:')) {
            try {
              const url = new URL(urlMatch[1], window.location.href).href;
              images.push({
                src: url,
                alt: 'Background',
                width: div.offsetWidth,
                height: div.offsetHeight,
                isBackground: true
              });
            } catch (e) {}
          }
        }
      });
      
      return images.slice(0, 5);
    }
    
    function detectElementType(element, computed) {
      const tag = element.tagName.toLowerCase();
      const role = element.getAttribute('role');
      const className = element.className || '';
      
      if (tag === 'img' || element.querySelector('img')) return 'image';
      if (tag.match(/^h[1-6]$/) || role === 'heading') {
        return { type: 'heading', level: parseInt(tag[1]) || 2 };
      }
      if (tag === 'button' || (tag === 'a' && (className.includes('btn') || className.includes('button')))) {
        return 'button';
      }
      if (tag === 'form' || tag === 'input' || tag === 'textarea') return 'form';
      if (tag === 'ul' || tag === 'ol') return 'list';
      if (className.includes('icon') || className.includes('fa-') || tag === 'svg') return 'icon';
      if (tag === 'video' || tag === 'iframe' || className.includes('video')) return 'video';
      if (tag === 'p' || (tag === 'div' && element.textContent.length > 50)) return 'text';
      
      return 'container';
    }
    
    // Main scraping logic
    const sections = [];
    const pageBg = window.getComputedStyle(document.body).backgroundColor;
    
    const sectionSelectors = [
      'section',
      '[class*="section"]',
      '[class*="hero"]',
      '[class*="banner"]',
      '[class*="features"]',
      '[class*="services"]',
      '[class*="about"]',
      '[class*="contact"]',
      '.row',
      '.container > div',
      'main > div',
      '#main > div'
    ];
    
    const sectionElements = document.querySelectorAll(sectionSelectors.join(', '));
    
    sectionElements.forEach((sectionEl, idx) => {
      if (sectionEl.offsetHeight < 100) return;
      
      const layout = analyzeLayout(sectionEl);
      const images = extractImages(sectionEl);
      
      const section = {
        id: `section-${idx}`,
        layout,
        images,
        elements: []
      };
      
      // Get direct text elements
      const textElements = sectionEl.querySelectorAll('h1, h2, h3, h4, h5, h6, p, .text, .content');
      textElements.forEach(el => {
        if (el.closest('nav') || el.closest('header') || el.closest('footer')) return;
        
        const computed = window.getComputedStyle(el);
        const typeInfo = detectElementType(el, computed);
        
        const text = el.innerText?.trim();
        if (!text || text.length < 3) return;
        
        const element = {
          type: typeof typeInfo === 'object' ? typeInfo.type : typeInfo,
          level: typeof typeInfo === 'object' ? typeInfo.level : null,
          text: text.substring(0, 500),
          fontSize: parseInt(computed.fontSize) || 16,
          fontFamily: computed.fontFamily?.replace(/["']/g, '').split(',')[0] || 'Arial',
          color: computed.color,
          backgroundColor: computed.backgroundColor,
          alignment: computed.textAlign || 'left'
        };
        
        // Add image
        const img = el.tagName === 'IMG' ? el : el.querySelector('img');
        if (img) {
          const src = img.currentSrc || img.src;
          if (src && !src.startsWith('data:')) {
            try {
              element.imageSrc = new URL(src, window.location.href).href;
              element.alt = img.alt;
            } catch (e) {}
          }
        }
        
        // Add link
        const link = el.tagName === 'A' ? el : el.querySelector('a');
        if (link && link.href) {
          element.href = link.href;
          if (element.type !== 'button') element.type = 'button';
        }
        
        section.elements.push(element);
      });
      
      if (section.elements.length > 0 || section.images.length > 0) {
        sections.push(section);
      }
    });
    
    return {
      pageBackground: pageBg,
      sections: sections.slice(0, 6)
    };
  });
  
  await browser.close();
  return pageData;
}

// Create Elementor template from scraped data
function createElementorTemplate(pageData, url) {
  const template = {
    "version": "0.4",
    "title": `Cloned: ${new URL(url).hostname}`,
    "type": "page",
    "page_settings": {
      "background_color": pageData.pageBackground === 'rgba(0, 0, 0, 0)' ? '#ffffff' : pageData.pageBackground
    },
    "content": []
  };
  
  pageData.sections.forEach((section, sidx) => {
    const sectionEl = {
      "id": `section-${sidx}`,
      "elType": "section",
      "settings": {
        "background_color": section.layout.backgroundColor === 'rgba(0, 0, 0, 0)' ? '' : section.layout.backgroundColor,
        "margin": { "unit": "px", "top": "0", "right": "0", "bottom": "0", "left": "0" },
        "padding": {
          "unit": "px",
          "top": String(section.layout.padding.top),
          "right": String(section.layout.padding.right),
          "bottom": String(section.layout.padding.bottom),
          "left": String(section.layout.padding.left)
        }
      },
      "elements": []
    };
    
    // Background image
    if (section.layout.hasBackgroundImage && section.layout.backgroundImage !== 'none') {
      const bgUrl = section.layout.backgroundImage.match(/url\(["']?([^"')]+)["']?\)/);
      if (bgUrl && !bgUrl[1].startsWith('data:')) {
        try {
          const fullUrl = new URL(bgUrl[1], url).href;
          sectionEl.settings.background_image = { url: fullUrl, source: "external" };
          sectionEl.settings.background_position = section.layout.backgroundPosition || 'center center';
          sectionEl.settings.background_size = section.layout.backgroundSize || 'cover';
          sectionEl.settings.background_repeat = 'no-repeat';
        } catch (e) {}
      }
    }
    
    // Process section images
    section.images.forEach((img, imgIdx) => {
      sectionEl.elements.push({
        "id": `img-${sidx}-${imgIdx}`,
        "elType": "widget",
        "widgetType": "image",
        "settings": {
          "image": { 
            "url": img.src, 
            "alt": img.alt,
            "source": "external"
          },
          "image_size": img.width > 800 ? "large" : "full",
          "align": "center",
          "width": { 
            "unit": "px", 
            "size": Math.min(img.width || 800, 800) 
          },
          "height": img.height ? { "unit": "px", "size": img.height } : undefined
        }
      });
    });
    
    // Process text elements
    section.elements.forEach((el, eidx) => {
      const base = {
        "id": `el-${sidx}-${eidx}`,
        "elType": "widget"
      };
      
      let widget = null;
      
      switch (el.type) {
        case 'heading':
          widget = {
            ...base,
            "widgetType": "heading",
            "settings": {
              "title": el.text,
              "header_size": `h${el.level || 2}`,
              "typography_typography": "custom",
              "typography_font_family": el.fontFamily || "Arial",
              "typography_font_size": { "unit": "px", "size": el.fontSize || 36 },
              "title_color": el.color || "#000000",
              "align": el.alignment || "left"
            }
          };
          break;
          
        case 'image':
          if (el.imageSrc) {
            widget = {
              ...base,
              "widgetType": "image",
              "settings": {
                "image": { 
                  "url": el.imageSrc, 
                  "alt": el.alt || "",
                  "source": "external"
                },
                "image_size": "full",
                "align": el.alignment || "center"
              }
            };
          }
          break;
          
        case 'button':
          widget = {
            ...base,
            "widgetType": "button",
            "settings": {
              "text": el.text.substring(0, 50),
              "link": el.href ? { "url": el.href, "is_external": true } : { "url": "#" },
              "typography_typography": "custom",
              "button_text_color": el.color || "#ffffff",
              "background_color": el.backgroundColor === 'rgba(0, 0, 0, 0)' ? '#0073aa' : el.backgroundColor,
              "border_radius": { "unit": "px", "size": 4 },
              "align": el.alignment || "center"
            }
          };
          break;
          
        case 'list':
          widget = {
            ...base,
            "widgetType": "icon-list",
            "settings": {
              "icon_list": el.text.split('\n').filter(item => item.trim()).slice(0, 6).map(item => ({
                "text": item.trim(),
                "selected_icon": { "value": "fas fa-check", "library": "fa-solid" }
              }))
            }
          };
          break;
          
        default:
          // Text editor for paragraphs
          if (el.text.length > 10) {
            widget = {
              ...base,
              "widgetType": "text-editor",
              "settings": {
                "editor": `<p>${el.text.replace(/\n/g, '</p><p>')}</p>`,
                "typography_typography": "custom",
                "typography_font_family": el.fontFamily || "Arial",
                "typography_font_size": { "unit": "px", "size": el.fontSize || 16 },
                "typography_line_height": { "unit": "em", "size": 1.6 },
                "text_color": el.color || "#333333",
                "align": el.alignment || "left"
              }
            };
          }
      }
      
      if (widget) {
        sectionEl.elements.push(widget);
      }
    });
    
    template.content.push(sectionEl);
  });
  
  return template;
}

// Routes
app.post('/export-template', async (req, res) => {
  try {
    const { url } = req.body;
    console.log(`Exporting template from: ${url}`);
    
    const pageData = await scrapePageAdvanced(url);
    const template = createElementorTemplate(pageData, url);
    
    const timestamp = Date.now();
    const filename = `elementor-template-v2-${timestamp}.json`;
    const templatesDir = path.join(__dirname, '..', 'templates');
    const filepath = path.join(templatesDir, filename);
    
    fs.mkdirSync(templatesDir, { recursive: true });
    fs.writeFileSync(filepath, JSON.stringify(template, null, 2));
    
    const summary = {
      url,
      timestamp: new Date().toISOString(),
      sections_count: pageData.sections.length,
      total_images: pageData.sections.reduce((sum, s) => sum + s.images.length, 0),
      total_elements: pageData.sections.reduce((sum, s) => sum + s.elements.length, 0),
      layout_types: [...new Set(pageData.sections.map(s => s.layout.layoutType))],
      avg_section_height: pageData.sections.reduce((sum, s) => sum + s.layout.height, 0) / pageData.sections.length
    };
    
    res.json({
      success: true,
      template,
      summary,
      filepath,
      filename,
      download_url: `/download/${filename}`
    });
    
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

app.get('/download/:filename', (req, res) => {
  const templatesDir = path.join(__dirname, '..', 'templates');
  const filepath = path.join(templatesDir, req.params.filename);
  
  if (fs.existsSync(filepath)) {
    res.download(filepath, req.params.filename);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

app.listen(3000, '0.0.0.0', () => {
  console.log('Template Exporter V2 running on :3000');
  console.log('Features: Images, background images, multi-column layouts, improved text detection');
});
