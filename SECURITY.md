# Security

## Content rendering (XSS)

Debate messages and artifact panels render model and user text as **React text nodes only**. The UI never uses `dangerouslySetInnerHTML` for simulation content.

- **Strategy:** treat text-only React escaping as the sanitization boundary for chat and artifacts.
- **PDF export:** HTML is built server-side after escaping (`escapeHtml` / markdown formatters in `src/lib/export/`).
- **Future rich HTML:** if the product adds HTML or markdown-to-HTML rendering in the browser, require a sanitizer (for example DOMPurify) and a security review before merge. Do not reintroduce raw HTML without that gate.

## Related controls

- Mutating `/api/*` routes require an allowlisted or same-host `Origin` (`src/proxy.ts`).
- Run access failures are masked as **404** (no IDOR oracle).
- Auth and guest sessions use httpOnly cookies; tokens are not stored in `localStorage`.
