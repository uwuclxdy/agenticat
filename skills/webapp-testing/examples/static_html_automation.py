from playwright.sync_api import sync_playwright
import os

# Example: Automating interaction with static HTML files using file:// URLs

html_file_path = os.path.abspath('path/to/your/file.html')
file_url = f'file://{html_file_path}'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1920, 'height': 1080})

    # Navigate to local HTML file
    page.goto(file_url)

    # Take screenshot
    page.screenshot(path='/tmp/static_page.png', full_page=True)

    # Interact with elements
    page.click('text=Click Me')
    page.fill('#name', 'John Doe')
    page.fill('#email', 'john@example.com')

    # Submit the form and wait for what the submit produces, not for a duration.
    # Replace the selector with whatever your page renders on success; a wait keyed
    # on that element fails loudly when the submit does nothing, where a sleep just
    # screenshots the unchanged page.
    page.click('button[type="submit"]')
    page.wait_for_selector('#result', state='visible')

    # Take final screenshot
    page.screenshot(path='/tmp/after_submit.png', full_page=True)

    browser.close()

print("Static HTML automation completed!")