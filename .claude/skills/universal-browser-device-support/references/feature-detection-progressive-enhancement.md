# Feature Detection & Progressive Enhancement

The two techniques that make code survive across browsers you didn't personally test and
versions that don't exist yet.

## Progressive enhancement (build up from a working floor)

Layer the experience so each layer is optional:

1. **Content & structure** — semantic HTML that delivers the core task on its own.
2. **Presentation** — CSS enhances the look; if it fails, content is still readable.
3. **Behavior** — JavaScript enhances interaction; if it fails to load or throws, the
   core task still completes via the HTML layer.

The test: **disable JavaScript (or let a script 404) — can the user still accomplish the
primary task?** A form should submit via a real `<form action>`; a link should navigate
via a real `href`. Enhancement makes it *nicer* (inline validation, no full reload), not
*possible*. This is the opposite of "blank page until the JS bundle boots."

Graceful degradation (build the rich version, then patch older browsers) is the weaker
inverse — it tends to leave the floor broken. Prefer enhancement.

## Feature detection (ask what the browser can do)

Branch on **capabilities**, never on identity.

### In CSS — `@supports`

```css
/* fallback first — everyone gets this */
.card { display: block; }

/* enhancement only where supported */
@supports (display: grid) {
  .card { display: grid; grid-template-columns: repeat(3, 1fr); }
}
```

`@supports` also tests values and can negate: `@supports not (aspect-ratio: 1)`.

### In JavaScript — capability checks

```js
if ('IntersectionObserver' in window) {
  // use it
} else {
  // fallback: eager-load, or load a scoped polyfill
}
```

Detect the *specific* API you need (`'share' in navigator`,
`CSS.supports('gap: 1px')`, `'loading' in HTMLImageElement.prototype`), then provide a
fallback path. Wrap newer APIs in `try/catch` where they can throw.

## Never sniff the user agent

Parsing `navigator.userAgent` for a brand or version to decide behavior is banned:

- **It rots.** New versions ship weekly; your string match silently misclassifies them.
- **It lies.** UA strings are spoofed, frozen, and reduced by browsers on purpose.
- **It misses engines.** You'll branch for the browsers you thought of and break the
  ones you didn't.
- **It confuses identity with capability.** What you actually care about is "does this
  API exist," which feature detection answers directly.

The rare legitimate exception is working around a *known, documented* engine bug that
cannot be feature-detected — isolate it, comment it with the bug link, and delete it when
the bug is fixed.

## Don't assume the environment

Beyond browser features, don't assume: a fast network (handle slow/failed requests),
a mouse (see input modalities), a large screen, a specific color scheme, that fonts
loaded, that `localStorage` is available (private modes throw), or that third-party
scripts loaded (they get blocked). Each assumption is a bug on some device.
