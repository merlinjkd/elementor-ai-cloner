import express from 'express';
import { scrapeWithVision } from './scraper.js';

const app = express();
app.use(express.json({ limit: '50mb' }));

app.post('/clone-section', async (req, res) => {
  const { url } = req.body;

  const { layout, screenshot } = await scrapeWithVision(url);

  const response = await fetch("http://localhost:3001/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      skill: "elementor_section_clone",
      input: { section_layout: layout, section_screenshot: screenshot }
    })
  });

  const result = await response.json();
  res.json(result);
});

app.listen(3000, () => console.log("Backend running on :3000"));
