from playwright.sync_api import sync_playwright

# Example: Capturing console logs during browser automation

url = 'http://localhost:5173'  # Replace with your URL

console_logs = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1920, 'height': 1080})

    # Set up console log capture
    def handle_console_message(msg):
        console_logs.append(f"[{msg.type}] {msg.text}")
        print(f"Console: [{msg.type}] {msg.text}")

    page.on("console", handle_console_message)

    # Navigate to page
    page.goto(url)
    page.wait_for_load_state('networkidle')

    # Interact with the page (triggers console logs). Wait on the message that means
    # the work finished, not on a duration: this returns as soon as it arrives and
    # fails loudly if it never does. The handler above still records every message.
    #
    # The predicate is load-bearing. Without one the block returns on the FIRST
    # console message, so anything logged later is missed; measured on a page
    # logging three messages over 600ms, a bare expect_console_message() captured
    # one and this form captured all three.
    with page.expect_console_message(lambda msg: 'ready' in msg.text):
        page.click('text=Dashboard')

    browser.close()

# Save console logs to file
with open('/tmp/console.log', 'w') as f:
    f.write('\n'.join(console_logs))

print(f"\nCaptured {len(console_logs)} console messages")
print("Logs saved to: /tmp/console.log")