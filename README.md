# Natya Vastra

Website for Natya Vastra, a classical Indian dance costume business — catalog galleries with a lightbox view, and WhatsApp-based ordering.

## Structure

```
natya-vastra/
├── index.html          # the whole site (HTML, CSS, JS in one file)
└── assets/
    └── images/          # costume photos, referenced by index.html
```

## Running it locally

No build step — it's a static site. Either:

- Double-click `index.html` to open it directly in a browser, or
- Serve it locally (recommended, avoids browser file:// restrictions):
  ```bash
  npx serve .
  # or
  python3 -m http.server 8000
  ```

## Notes

- Images used to be embedded as base64 directly in the HTML (this made the file over 5MB). They've been extracted into `assets/images/` and are now referenced by relative path — much easier to review changes to in git, and faster to load.
- WhatsApp ordering number is set via the `WA_NUMBER` constant near the bottom of `index.html`.

## Planned next

- A separate AI agent page, linked from the main site (scope still being finalized).
