import express from 'express';

const app = express();
app.use(express.json({ limit: '100mb' }));

async function callAI(input) {
  const layout = input?.section_layout;
  
  const elementorJSON = {
    title: `Cloned Section - ${new Date().toISOString()}`,
    page_settings: {
      background_color: layout?.styles?.backgroundColor || '#ffffff'
    },
    elements: [
      {
        id: 'section-' + Date.now(),
        elType: 'section',
        settings: {
          background_color: layout?.styles?.backgroundColor || '',
          margin: { unit: 'px', top: '0', right: '0', bottom: '0', left: '0' },
          padding: { unit: 'px', top: '50', right: '50', bottom: '50', left: '50' },
          height: { unit: 'px', size: layout?.height || 400 }
        },
        elements: generateElementsFromLayout(layout?.children || [])
      }
    ]
  };
  
  return elementorJSON;
}

function generateElementsFromLayout(children) {
  if (!children || children.length === 0) return [];
  
  return children.map((child, index) => {
    const elementType = determineElementType(child);
    
    return {
      id: 'element-' + Date.now() + '-' + index,
      elType: 'widget',
      widgetType: elementType,
      settings: {
        text: child.text || '',
        color: child.styles?.color || '#000000',
        font: {
          family: child.styles?.fontFamily || 'Arial',
          size: { unit: 'px', size: parseInt(child.styles?.fontSize) || 16 }
        },
        background_color: child.styles?.backgroundColor || '',
        width: { unit: '%', size: 100 },
        margin: { unit: 'px', top: '10', right: '0', bottom: '10', left: '0' },
        padding: { unit: 'px', top: '20', right: '20', bottom: '20', left: '20' },
        _element_width: '100'
      },
      elements: child.children && child.children.length > 0 
        ? generateElementsFromLayout(child.children) 
        : []
    };
  });
}

function determineElementType(node) {
  const tag = node.tag?.toLowerCase();
  const hasText = node.text && node.text.length > 0;
  
  if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
    return 'heading';
  } else if (tag === 'p' || tag === 'span' || (tag === 'div' && hasText)) {
    return 'text-editor';
  } else if (tag === 'button' || tag === 'a') {
    return 'button';
  } else if (tag === 'img') {
    return 'image';
  } else {
    return 'inner-section';
  }
}

function calculateDepth(node, current = 0) {
  if (!node || !node.children || node.children.length === 0) return current;
  return Math.max(current, ...node.children.map(child => calculateDepth(child, current + 1)));
}

app.post('/agent', async (req, res) => {
  try {
    const { skill, input } = req.body;
    
    if (skill === 'elementor_section_clone') {
      console.log('Processing Elementor clone request...');
      
      const elementorJSON = await callAI(input);
      
      res.json({
        elementor_json: elementorJSON,
        status: 'success',
        elements_count: elementorJSON.elements[0]?.elements?.length || 0,
        layout_depth: calculateDepth(input?.section_layout)
      });
    } else {
      res.status(400).json({ error: 'Unknown skill: ' + skill });
    }
  } catch (error) {
    console.error('Agent error:', error);
    res.status(500).json({ 
      error: 'Processing failed', 
      details: error.message 
    });
  }
});

app.listen(3001, () => console.log('AI Agent server on :3001'));
