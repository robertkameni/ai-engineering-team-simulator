# Security

## Content rendering (XSS)

Debate messages and artifact panels render model and user text as **React text nodes only**. The UI never uses `dangerouslySetInnerHTML` for simulation content.

- **Strategy:** treat text-only React escaping as the sanitization boundary for chat and artifacts.
- **PDF export:** HTML is built server-side after escaping (`escapeHtml` / markdown formatters in `src/lib/export/`).
- **Future rich HTML:** if the product adds HTML or markdown-to-HTML rendering in the browser, require a sanitizer (for example DOMPurify) and a security review before merge. Do not reintroduce raw HTML without that gate.

## Content Security Policy

Document responses get a **per-request nonce** CSP from `src/proxy.ts` (`buildContentSecurityPolicy` in `src/lib/http/content-security-policy.ts`).

- **Production `script-src`:** `'self' 'nonce-<random>' 'strict-dynamic'` — no `'unsafe-inline'` / `'unsafe-eval'`.
- **Development `script-src`:** same plus `'unsafe-eval'` (React debug tooling).
- **`style-src`:** `'self' 'unsafe-inline'` (Tailwind / Radix inline styles).
- Next.js reads the request `Content-Security-Policy` / `x-nonce` and attaches the nonce to framework scripts. Root layout calls `connection()` so pages render per-request.

## Related controls

- Mutating `/api/*` routes require an allowlisted or same-host `Origin` (`src/proxy.ts`).
- Run access failures are masked as **404** (no IDOR oracle).
- Auth and guest sessions use httpOnly cookies; tokens are not stored in `localStorage`.
