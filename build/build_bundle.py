#!/usr/bin/env python3
"""
Bundle the three-page web/ source into a single self-contained
download-tool/fuzzy-tool.html that can be emailed around or downloaded.

CSS is inlined; ES modules are concatenated and stripped of import/export
keywords; cross-page links are intercepted by a small SPA-style nav.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
OUT = ROOT / "download-tool" / "fuzzy-tool.html"


def extract_body_section(html: str) -> str:
    """Return the inside of <body>, stripped of page-level chrome and any
    <script src="..."> tags. The bundle concatenates the source modules
    into one inline script — leaving relative-source <script> tags would
    cause harmless 404s as the browser tried to fetch files that don't
    exist alongside the bundle."""
    body = re.search(r"<body>(.*?)</body>", html, re.DOTALL).group(1)
    body = re.sub(r"\s*<nav class=\"page-nav\">.*?</nav>", "", body, flags=re.DOTALL, count=1)
    body = re.sub(r"\s*<footer>.*?</footer>", "", body, flags=re.DOTALL)
    body = re.sub(r"\s*<script\b[^>]*\bsrc=[^>]*></script>", "", body, flags=re.DOTALL)
    return body.strip()


IMPORT_RE = re.compile(
    r"^\s*import\s+\{([^}]+)\}\s+from\s+['\"][^'\"]+['\"];\s*$",
    re.MULTILINE,
)


def _rewrite_import(match: re.Match) -> str:
    """Replace a named-import line with `const` aliases for any `X as Y` bindings.

    Plain (non-aliased) imports become empty lines — the imported name is already
    a global in the bundled script. Aliased imports (`import { X as Y }`) need a
    `const Y = X;` line so the alias resolves; without it the bundle silently
    references an undefined identifier.
    """
    aliases = []
    for spec in match.group(1).split(","):
        spec = spec.strip()
        if not spec:
            continue
        parts = re.split(r"\s+as\s+", spec)
        if len(parts) == 2:
            original, alias = parts[0].strip(), parts[1].strip()
            aliases.append(f"const {alias} = {original};")
    return "\n".join(aliases)


def strip_module_syntax(js: str) -> str:
    """Remove import statements and the export keyword so JS works as one inline script."""
    js = IMPORT_RE.sub(_rewrite_import, js)
    # Catch any import form we didn't handle (default imports, namespace imports,
    # side-effect imports). Better to fail loudly than to ship a broken bundle.
    leftover = re.search(r"^\s*import\s+.*?from\s+['\"][^'\"]+['\"];", js, flags=re.MULTILINE)
    if leftover:
        raise ValueError(
            f"build_bundle.py can't translate this import line: {leftover.group(0)!r}. "
            "Extend strip_module_syntax to handle it."
        )
    js = re.sub(r"^\s*export\s+", "", js, flags=re.MULTILINE)
    return js


# Top-level declarations the collision check should pick up. We only look at
# *line-leading* declarations so we don't false-positive on inner-scope vars.
TOP_LEVEL_DECL_RE = re.compile(
    r"^(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)",
    re.MULTILINE,
)


def assert_no_top_level_collisions(chunks: dict[str, str]) -> None:
    """Fail the build if two source files declare the same top-level name.

    ES modules are file-scoped, but the bundle concatenates everything into
    one inline <script>, so top-level names become globals. `const`/`let`
    collisions are syntax errors (Node would catch them); silent killers
    are duplicate `function` declarations — they're hoisted, so the later
    one wins and any earlier code calling that name suddenly invokes the
    wrong function. (We hit this twice: `fmt` and `renderAll`.)

    Failing here means future collisions surface at build time, not as a
    section that mysteriously stopped rendering.
    """
    seen: dict[str, str] = {}
    collisions: list[str] = []
    for filename, src in chunks.items():
        for name in TOP_LEVEL_DECL_RE.findall(src):
            if name in seen and seen[name] != filename:
                collisions.append(f"  {name!r}: declared in both {seen[name]} and {filename}")
            else:
                seen[name] = filename
    if collisions:
        raise ValueError(
            "Top-level name collisions across bundled files (these would "
            "silently overwrite each other in the single-script bundle). "
            "Rename one, or extract the shared piece into a util module:\n"
            + "\n".join(collisions)
        )


def main() -> None:
    css = (WEB / "style.css").read_text()

    # Order matters: leaf modules first, then anything that depends on them.
    # `util.js` is the lowest-level shared module (nothing imports from
    # higher modules), `calculations.js` is consumed by both `app.js` and
    # `methods-page.js`, and `methods-page.js` runs its render entry at
    # module-load time — fine because the bundle script is at the end of
    # <body> and all three page divs are in the DOM by then.
    js_files = [
        "util.js",
        "normalization.js",
        "methods.js",
        "scenarios.js",
        "visualize.js",
        "calculations.js",
        "app.js",
        "methods-page.js",
    ]
    chunks_by_file: dict[str, str] = {}
    for name in js_files:
        src = (WEB / name).read_text()
        chunks_by_file[name] = strip_module_syntax(src)

    assert_no_top_level_collisions(chunks_by_file)

    bundled_js = "\n\n".join(
        f"// ─── {name} ───\n" + chunks_by_file[name] for name in js_files
    )

    try_body = extract_body_section((WEB / "index.html").read_text())
    concepts_body = extract_body_section((WEB / "concepts.html").read_text())
    methods_body = extract_body_section((WEB / "methods.html").read_text())

    bundle_css = """
/* ─── Bundle navigation (single-file deliverable) ─── */
.bundle-nav {
  max-width: var(--content-wide);
  margin: 0 auto;
  padding: 1.5rem 2rem 0;
  display: flex;
  gap: 2rem;
}
.bundle-nav-link {
  background: none;
  border: none;
  font: inherit;
  font-family: var(--sans);
  font-size: 0.78rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
  cursor: pointer;
  padding: 0.5rem 0 0.35rem;
  border-bottom: 1px solid transparent;
  transition: color 0.15s, border-color 0.15s;
}
.bundle-nav-link:hover { color: var(--accent); }
.bundle-nav-link.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
.page { display: none; }
.page.active { display: block; }
@media (max-width: 720px) {
  .bundle-nav { padding: 1.25rem 1.25rem 0; gap: 1.25rem; flex-wrap: wrap; }
}
"""

    toggle_js = """
// ─── Bundle nav toggle (single-file deliverable) ───
(function () {
  const links = document.querySelectorAll('.bundle-nav-link');
  const pages = document.querySelectorAll('.page');
  const PAGE_MAP = {
    'index.html': 'page-try',
    'concepts.html': 'page-concepts',
    'methods.html': 'page-methods',
  };
  function show(id) {
    pages.forEach((p) => p.classList.toggle('active', p.id === id));
    links.forEach((l) => l.classList.toggle('active', 'page-' + l.dataset.page === id));
    window.scrollTo(0, 0);
  }
  links.forEach((l) => {
    l.addEventListener('click', () => show('page-' + l.dataset.page));
  });
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (PAGE_MAP[href]) {
      e.preventDefault();
      show(PAGE_MAP[href]);
    }
  });
  show('page-try');
})();
"""

    output = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>fuzzy-tool — Jennifer Payne</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&family=Inter:wght@300;400;500;600&display=swap"
      rel="stylesheet"
    />
    <style>
{css}
{bundle_css}
    </style>
  </head>
  <body>
    <nav class="bundle-nav" aria-label="Sections">
      <button class="bundle-nav-link" data-page="try">Try it</button>
      <button class="bundle-nav-link" data-page="concepts">What is fuzzy matching?</button>
      <button class="bundle-nav-link" data-page="methods">The algorithms</button>
    </nav>

    <div class="page" id="page-try">
{try_body}
    </div>

    <div class="page" id="page-concepts">
{concepts_body}
    </div>

    <div class="page" id="page-methods">
{methods_body}
    </div>

    <footer>
      <p class="footer-name"><strong>Jennifer Payne</strong> — data scientist</p>
      <p class="footer-tagline">Making the complex simple, one tech project at a time.</p>
      <p class="footer-links">
        <a href="https://github.com/majorpayne-2021" target="_blank" rel="noopener">GitHub</a>
        ·
        <a href="https://www.linkedin.com/in/jenniferapayne25/" target="_blank" rel="noopener">LinkedIn</a>
      </p>
    </footer>

    <script>
{bundled_js}
    </script>
    <script>
{toggle_js}
    </script>
  </body>
</html>
"""

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(output)
    size = OUT.stat().st_size
    print(f"Wrote: {OUT.relative_to(ROOT)}")
    print(f"Size:  {size:,} bytes ({size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
