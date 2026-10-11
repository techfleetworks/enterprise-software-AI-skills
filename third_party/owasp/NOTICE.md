# Third-party notice: vendored OWASP content

This directory holds content from the OWASP Foundation, fetched from source by `tools/vendor-owasp.mjs`
(`npm run vendor:owasp`). It is kept separate from the rest of this repository on purpose.

## What is here

- `cheatsheets-src/` : the source Markdown of the OWASP Cheat Sheet Series, one file per cheat sheet.
- `llm-top10-src/` : the top-level docs of the OWASP Top 10 for Large Language Model Applications project.
- `LICENSE-CheatSheetSeries.md` and `LICENSE-LLM-Top10.md` : the upstream licenses, fetched alongside the text.

The fetched files are gitignored, not committed. Run `npm run vendor:owasp` to populate this directory locally.

## Attribution and license (required)

Both projects are published by the OWASP Foundation under the Creative Commons Attribution-ShareAlike 4.0
International license (CC-BY-SA-4.0: <https://creativecommons.org/licenses/by-sa/4.0/>).

- OWASP Cheat Sheet Series, (c) the OWASP Foundation and contributors. Source:
  <https://github.com/OWASP/CheatSheetSeries> ; published at <https://cheatsheetseries.owasp.org/>.
- OWASP Top 10 for Large Language Model Applications, (c) the OWASP Foundation and contributors. Source:
  <https://github.com/OWASP/www-project-top-10-for-large-language-model-applications> ; published at
  <https://genai.owasp.org/llm-top-10/>.

This content is **CC-BY-SA-4.0, not MIT.** The rest of this repository is MIT licensed; this directory is a
separate aggregation under its own license. If you redistribute this text, or any adaptation of it, you must
keep the CC-BY-SA-4.0 license, give attribution to OWASP, indicate any changes, and license your adaptation
under CC-BY-SA-4.0. Do not copy this text into the MIT-licensed skill files; the per-sheet skill files instead
describe the controls in their own words and quote short, attributed excerpts, which is compatible with the
repository's MIT license.

Retrieved from upstream by whoever runs the vendor tool; see the tool output for the date and counts.
