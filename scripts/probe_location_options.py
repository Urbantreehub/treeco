#!/usr/bin/env python3
"""READ-ONLY: dump the location_id <select> full option map (value|code|label) from one job."""
import asyncio, json, os, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(__file__))
import dbs_to_treeco as D

JID = os.environ.get("PROBE_JID", "2807624")
OUT = os.environ.get("PROBE_OUT", "/tmp/location_options.json")

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await (await browser.new_context()).new_page()
        try:
            await page.goto(f"{D.DBS_URL}/index.cfm", timeout=30_000)
            await page.wait_for_load_state("domcontentloaded")
            await D.dbs_login(page)
            await page.goto(f"{D.DBS_URL}{D.JOBS_PATH}", timeout=20_000)
            await page.wait_for_load_state("networkidle", timeout=15_000)
            await page.wait_for_timeout(1500)
            await page.evaluate(f"perform_action('SELECT_JOB','{JID}','1')")
            await page.wait_for_timeout(4000)
            data = await page.evaluate("""() => {
                const sel = document.querySelector('#location_id');
                if (!sel) return null;
                return Array.from(sel.options).map(o => ({
                    value: o.value, code: (o.textContent||'').trim(),
                    label: (o.getAttribute('title')||o.getAttribute('data-label')||'').trim()
                }));
            }""")
        finally:
            await browser.close()
    json.dump(data, open(OUT, "w"), indent=2)
    print(json.dumps(data, indent=2) if data else "NO location_id select found")

if __name__ == "__main__":
    asyncio.run(main())
