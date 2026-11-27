"""Production browser smoke tests for the disposable GitHub CI site only."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

assert os.environ.get('GITHUB_ACTIONS') == 'true', 'CI only'
base = os.environ['CI_BROWSER_BASE'].rstrip('/')
assert base == 'http://127.0.0.1:5000', 'Do not test a live customer site'
output = Path('browser-smoke-output'); output.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'])
    for width, height in [(1366, 768), (390, 844), (320, 640)]:
        context = browser.new_context(viewport={'width':width,'height':height}, permissions=['camera'])
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        def check(name):
            expect(page.locator('body')).not_to_contain_text('This page could not be displayed.')
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 2'), f'Horizontal document overflow: {name} {width}'
            assert not errors, f'Browser exceptions: {name}: {errors}'
            page.screenshot(path=str(output / f'{width}-{name}.png'))
        page.goto(base + '/'); expect(page.get_by_text('Book an Appointment',exact=True).first).to_be_visible(); check('landing')
        for role in ('admin','staff','client'):
            page.goto(base+'/login')
            page.evaluate('localStorage.clear()'); page.reload()
            page.locator('input[type=email]').fill(f'ci-{role}@example.invalid')
            page.locator('input[type=password]').fill(os.environ['CI_BROWSER_PASSWORD'])
            page.get_by_role('button',name='Sign In',exact=True).click()
            page.wait_for_url(f'**/{role}/dashboard',timeout=15000)
            expect(page.locator('.workspace-page')).to_be_visible(); check(role+'-dashboard')
            routes={'admin':['appointments','queue','analytics','scanner'],'staff':['appointments','queue','scanner'],'client':['bookings','notifications']}[role]
            for route in routes:
                page.goto(f'{base}/{role}/{route}')
                expect(page.locator('.workspace-page h1').first).to_be_visible(timeout=15000)
                check(f'{role}-{route}')
                if route == 'scanner':
                    page.get_by_role('button',name='Open Camera',exact=True).click()
                    expect(page.get_by_role('button',name='Stop Camera',exact=True)).to_be_visible(timeout=10000)
                    page.wait_for_function('document.querySelector("video").readyState >= 2')
                    page.get_by_role('button',name='Stop Camera',exact=True).click()
                    expect(page.get_by_role('button',name='Open Camera',exact=True)).to_be_visible()
        context.close()
    browser.close()
print('Desktop and phone-width browser smoke checks passed.')
