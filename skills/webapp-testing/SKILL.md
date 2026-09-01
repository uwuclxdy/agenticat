---
name: webapp-testing
description: "Playwright toolkit for local web apps: navigate, click, fill forms, screenshots, console logs."
when_to_use: "Use to verify or debug frontend behavior against a dev server or static HTML."
license: Complete terms in LICENSE.txt
metadata:
  author: "Anthropic, PBC, vendored from anthropics/skills (Apache-2.0)"
  version: "1.5"
---

> Vendored from [anthropics/skills](https://github.com/anthropics/skills) under Apache-2.0. Modified: description rewrite, a Delegating section pointing at the paired `webapp-tester` agent shipped in this repo, a tone pass (emoji and all-caps emphasis removed), a wait-discipline pass replacing the fixed-duration `wait_for_timeout` advice and its two example uses with condition waits, and a Limits note that a screenshot gets read and judged, with a pixel diff as the secondary check.

# Web Application Testing

To test local web applications, write native Python Playwright scripts.

**Helper Scripts Available**:
- `scripts/with_server.py` - Manages server lifecycle (supports multiple servers)

**Always run scripts with `--help` first** to see usage. Don't read the source until the script has been run and shown not to fit the task. These scripts can be large; reading them pollutes your context window. They exist to be called directly as black boxes.

## Decision Tree: Choosing Your Approach

UI/frontend only. For pure backend/API assertions without a browser, use Playwright's request context or a plain HTTP client instead (see Limits).

```
User task → Is it static HTML?
    ├─ Yes → Read HTML file directly to identify selectors
    │         ├─ Success → Write Playwright script using selectors
    │         └─ Fails/Incomplete → Treat as dynamic (below)
    │
    └─ No (dynamic webapp) → Is the server already running?
        ├─ No → Run: python scripts/with_server.py --help
        │        Then use the helper + write simplified Playwright script
        │
        └─ Yes → Reconnaissance-then-action:
            1. Navigate and wait for networkidle
            2. Take screenshot or inspect DOM
            3. Identify selectors from rendered state
            4. Execute actions with discovered selectors
```

## Example: Using with_server.py

To start a server, run `--help` first, then use the helper:

**Single server:**
```bash
python scripts/with_server.py --server "npm run dev" --port 5173 -- python your_automation.py
```

**Multiple servers (e.g., backend + frontend):**
```bash
python scripts/with_server.py \
  --server "cd backend && python server.py" --port 3000 \
  --server "cd frontend && npm run dev" --port 5173 \
  -- python your_automation.py
```

To create an automation script, include only Playwright logic (servers are managed automatically):
```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True) # Always launch chromium in headless mode
    page = browser.new_page()
    page.goto('http://localhost:5173') # Server already running and ready
    page.wait_for_load_state('networkidle') # wait for JS to execute before inspecting
    # ... your automation logic
    browser.close()
```

## Reconnaissance-Then-Action Pattern

1. **Inspect rendered DOM**:
   ```python
   page.screenshot(path='/tmp/inspect.png', full_page=True)
   content = page.content()
   page.locator('button').all()
   ```
   Note: `screenshot()` only saves an image, it does not diff against a baseline (see Limits).

2. **Identify selectors** from inspection results

3. **Execute actions** using discovered selectors

## Common Pitfall

Inspecting the DOM before `networkidle` on a dynamic app reads a half-rendered page. Wait for `page.wait_for_load_state('networkidle')` first.

## Best Practices

- **Use bundled scripts as black boxes** - To accomplish a task, consider whether one of the scripts available in `scripts/` can help. These scripts handle common, complex workflows reliably without cluttering the context window. Use `--help` to see usage, then invoke directly. 
- Use `sync_playwright()` for synchronous scripts
- Always close the browser when done
- Use descriptive selectors: `text=`, `role=`, CSS selectors, or IDs
- Wait on the observable the next assertion reads, never on a duration. `expect(locator).to_have_text(...)` and its siblings retry until the value arrives; `page.wait_for_selector()`, `page.wait_for_function()` and `page.expect_console_message(predicate)` cover what `expect` does not. Make the condition the one your code is actually about: a bare `expect_console_message()` returns on the first message and misses everything logged after it, so pass the predicate that matches the message meaning the work finished. A `page.wait_for_timeout()` is a bet that the page settles inside a number someone picked, and it goes wrong exactly when the machine is loaded, which is when CI runs. Where an action genuinely produces nothing observable, keep the duration and write one line beside it saying which condition could not be expressed.
- Two timeout budgets exist and they are set separately. Measured against Chromium: `expect()` defaults to 5000 ms, `page.wait_for_*` defaults to 30000 ms, and `expect.set_options()` moves only the first. A per-call `timeout=` beats both. Do not pass `timeout=0` to `set_options` expecting no wait: `0` is falsy, so the default comes back and every check passes for the wrong reason.

## Limits

- `screenshot()` only saves an image. `Read` it and judge it as a viewer would; that is the check for "looks right". A pixel diff (Pillow, pixelmatch) answers only "did anything move", and needs a baseline someone judged.
- UI/frontend only. For pure backend/API assertions without a browser, use Playwright's request context (`playwright.request`) or a plain HTTP client instead.

## Reference Files

- **examples/** - Examples showing common patterns:
  - `element_discovery.py` - Discovering buttons, links, and inputs on a page
  - `static_html_automation.py` - Using file:// URLs for local HTML
  - `console_logging.py` - Capturing console logs during automation

## Delegating

To verify an app as a subagent task, spawn the `webapp-tester` agent (`agents/webapp-tester.md` in this repo). It boots through `scripts/with_server.py`, drives the flows, and returns pass/fail with screenshot + console evidence. Use this skill inline only when driving the browser yourself.