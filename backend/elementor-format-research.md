# Elementor JSON Import Format Research

Based on documentation and common issues:

## Standard Page/Template Format:
```json
{
  "version": "0.4",
  "title": "Template Name",
  "type": "page",  // or "section", "popup", etc.
  "page_settings": [],
  "content": [
    {
      "id": "unique-id",
      "elType": "section",
      "settings": {},
      "elements": [
        {
          "id": "widget-id",
          "elType": "widget",
          "widgetType": "heading",
          "settings": {
            "title": "Text"
          }
        }
      ]
    }
  ]
}
```

## Common Issues:
1. **settings must be object `{}` not array `[]`** - This is likely the issue!
2. **page_settings** should be object `{}` not array `[]`
3. **No `source: "external"`** in images - use just the URL
4. **Widget IDs must be unique** across the entire template
5. **Content escaping** - HTML in editor fields must be properly escaped

## Corrected Format:
```json
{
  "version": "0.4",
  "title": "Template",
  "type": "page",
  "page_settings": {},
  "content": [{
    "id": "sec-1",
    "elType": "section",
    "settings": {},
    "elements": [{
      "id": "wid-1",
      "elType": "widget", 
      "widgetType": "heading",
      "settings": {"title": "Hello"}
    }]
  }]
}
```
