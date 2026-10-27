# Screenshots of index.html: og.png (1200x630 preview), phone home and phone game views.
import sys, asyncio
from playwright.async_api import async_playwright
root = sys.argv[1] if len(sys.argv) > 1 else '.'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # OG image: trading floor a few weeks in
        pg = await b.new_page(viewport={'width':1200,'height':630}, color_scheme='dark')
        await pg.goto(f'file://{root}/index.html'); await pg.wait_for_timeout(300)
        await pg.evaluate("localStorage.clear()")
        await pg.fill('#company', 'Zurich Gas & Power'); await pg.click('[data-act="begin"]')
        for _ in range(6): await pg.click('[data-act="next"]'); await pg.wait_for_timeout(60)
        await pg.evaluate("window.scrollTo(0,0)"); await pg.wait_for_timeout(400)
        await pg.screenshot(path=f'{root}/og.png')
        # phone
        ph = await b.new_page(viewport={'width':390,'height':844}, device_scale_factor=2, color_scheme='dark')
        await ph.goto(f'file://{root}/index.html'); await ph.wait_for_timeout(300)
        await ph.evaluate("localStorage.clear()")
        await ph.screenshot(path=f'{root}/dist/phone_home.png', full_page=True)
        await ph.click('[data-act="begin"]')
        for _ in range(3): await ph.click('[data-act="next"]'); await ph.wait_for_timeout(60)
        await ph.evaluate("window.scrollTo(0,0)"); await ph.wait_for_timeout(300)
        await ph.screenshot(path=f'{root}/dist/phone_game.png')
        await ph.click('[data-act="buyModal"]'); await ph.wait_for_timeout(300)
        await ph.screenshot(path=f'{root}/dist/phone_buy.png')
        w = await ph.evaluate("document.documentElement.scrollWidth")
        print('phone scrollWidth', w)
        await b.close()
asyncio.run(main())
