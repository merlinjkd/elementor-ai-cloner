import express from 'express';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(express.json({ limit: '50mb' }));

// Elementor Template Format
function createElementorTemplate(pageData, url) {
  const template = {
    "version": "0.4",
    "title": `Cloned from ${new URL(url).hostname}`,
    "type": "page",
    "page_settings": {
      "background_color": pageData.backgroundColor || "#ffffff"
    },
    "content": []
  };

  // Convert scraped sections to Elementor sections
  pageData.sections.forEach((section, idx) => {
    const elementorSection = {
      "id": section.id || `section-${idx}`,
      "elType": "section",
      "settings": {
        "background_color": section.backgroundColor || "",
        "margin": { "unit": "px", "top": "0", "right": "0", "bottom": "0", "left": "0" },
        "padding": { 
          "unit": "px", 
          "top": String(section.padding?.top || 50),
          "right": String(section.padding?.right || 50),
          "bottom": String(section.padding?.bottom || 50),
          "left": String(section.padding?.left || 50)
        }
      },
      "elements": []
    };

    // Add widgets
    section.elements.forEach((el, widx) => {
      const widget = createElementorWidget(el, widx);
      if (widget) elementorSection.elements.push(widget);
    });

    template.content.push(elementorSection);
  });

  return template;
}

function createElementorWidget(element, index) {
  const base = {
    "id": `widget-${Date.now()}-${index}`,
    "elType": "widget",
    "settings": {}
  };

  switch (element.type) {
    case 'heading':
      return {
        ...base,
        "widgetType": "heading",
        "settings": {
          "title": element.text,
          "typography_typography": "custom",
          "typography_font_family": element.fontFamily || "Arial",
          "typography_font_size": { "unit": "px", "size": element.fontSize || 36 },
          "title_color": element.color || "#000000"
        }
      };

    case 'text':
    case 'paragraph':
      return {
        ...base,
        "widgetType": "text-editor",
        "settings": {
          "editor": element.text,
          "typography_typography": "custom",
          "typography_font_family": element.fontFamily || "Arial",
          "typography_font_size": { "unit": "px", "size": element.fontSize || 16 },
          "text_color": element.color || "#333333"
        }
      };

    case 'button':
      return {
        ...base,
        "widgetType": "button",
        "settings": {
          "text": element.text,
          "typography_typography": "custom",
          "button_text_color": element.color || "#ffffff",
          "background_color": element.backgroundColor || "#0073aa",
          "align": "center"
        }
      };

    case 'image':
      return {
        ...base,
        "widgetType": "image",
        "settings": {
          "image": { "url": element.src || "" },
          "image_size": "full"
        }
      };

    default:
      // Container/section widget
      return {
        ...base,
        "widgetType": "inner-section",
        "settings": {},
        "elements": element.children?.map((child, cidx) => createElementorWidget(child, cidx)) || []
      };
  }
}

async function scrapePage(url) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  
  const pageData = await page.evaluate(() => {
    const sections = [];
    
    // Find main content areas
    const mainContent = document.querySelector('main, #main, .main-content, [role="main"]') || document.body;
    
    // Get all major sections
    const sectionElements = mainContent.querySelectorAll('section, .section, [class*="section"], .row, .container');
    
    sectionElements.forEach((sectionEl, idx) => {
      const rect = sectionEl.getBoundingClientRect();
      const computed = window.getComputedStyle(sectionEl);
      
      const section = {
        id: `section-${idx}`,
        backgroundColor: computed.backgroundColor,
        padding: {
          top: parseInt(computed.paddingTop) || 50,
          right: parseInt(computed.paddingRight) || 50,
          bottom: parseInt(computed.paddingBottom) || 50,
          left: parseInt(computed.paddingLeft) || 50
        },
        elements: []
      };
      
      // Get text elements
      const headings = sectionEl.querySelectorAll('h1, h2, h3');
      headings.forEach(h => {
        const hStyle = window.getComputedStyle(h);
        section.elements.push({
          type: 'heading',
          text: h.innerText.trim(),
          fontSize: parseInt(hStyle.fontSize) || 36,
          fontFamily: hStyle.fontFamily.replace(/["']/g, '').split(',')[0],
          color: hStyle.color
        });
      });
      
      const paragraphs = sectionEl.querySelectorAll('p, .text, [class*="content"]');
      paragraphs.forEach(p => {
        if (p.innerText.trim().length > 20) {
          const pStyle = window.getComputedStyle(p);
          section.elements.push({
            type: 'paragraph',
            text: p.innerText.trim().substring(0, 500),
            fontSize: parseInt(pStyle.fontSize) || 16,
            fontFamily: pStyle.fontFamily.replace(/["']/g, '').split(',')[0],
            color: pStyle.color
          });
        }
      });
      
      const buttons = sectionEl.querySelectorAll('button, .button, .btn, a[class*="button"]');
      buttons.forEach(btn => {
        const bStyle = window.getComputedStyle(btn);
        section.elements.push({
          type: 'button',
          text: btn.innerText.trim(),
          color: bStyle.color,
          backgroundColor: bStyle.backgroundColor
        });
      });
      
      if (section.elements.length > 0) {
        sections.push(section);
      }
    });
    
    return {
      backgroundColor: window.getComputedStyle(document.body).backgroundColor,
      sections: sections.slice(0, 5) // Limit to first 5 sections
    };
  });
  
  await browser.close();
  return pageData;
}

app.post('/export-template', async (req, res) => {
  try {
    const { url } = req.body;
    
    console.log(`Exporting template from: ${url}`);
    const pageData = await scrapePage(url);
    
    const template = createElementorTemplate(pageData, url);
    
    // Save to file
    const filename = `elementor-template-${Date.now()}.json`;
    const filepath = path.join('/Users/merlin/Projects/elementor-ai-cloner/templates', filename);
    
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, JSON.stringify(template, null, 2));
    
    res.json({
      success: true,
      template: template,
      filepath: filepath,
      filename: filename,
      download_url: `/download/${filename}`,
      sections_count: template.content.length
    });
    
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Serve templates
app.get('/download/:filename', (req, res) => {
  const filepath = path.join('/Users/merlin/Projects/elementor-ai-cloner/templates', req.params.filename);
  if (fs.existsSync(filepath)) {
    res.download(filepath, req.params.filename);
  } else {
    res.status(404).send('File not found');
  }
});

app.listen(3000, '0.0.0.0', () => {
  console.log('Template Exporter running on :3000');
  console.log('POST /export-template - Generate Elementor template from URL');
});
