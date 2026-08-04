#!/usr/bin/env python3
"""
READ-ONLY probe of the Spencers/DBS portal.
Logs in (reusing dbs_to_treeco helpers), opens the first few job detail pages,
and dumps: the job list, each charge-line row's location cell + outerHTML, and
every <select> whose options look like PE/location codes. Writes JSON to the
scratchpad. Makes NO writes to Supabase or the portal.
"""
import asyncio, json, os, re, sys
from playwright.async_api import async_playwright

sys.path.insert(0, os.path.dirname(__file__))
import dbs_to_treeco as D

OUT = os.environ.get("PROBE_OUT", "/private/tmp/probe_spencers.json")
MAX_JOBS = int(os.environ.get("PROBE_MAX", "4"))


async def dump_selects(page):
    """Return all <select> elements with their option texts (for finding PE dropdowns)."""
    return await page.evaluate("""() => {
        const out = [];
        document.querySelectorAll('select').forEach(sel => {
            const opts = Array.from(sel.options).map(o => (o.textContent||'').trim()).filter(Boolean);
            out.push({ id: sel.id||'', name: sel.name||'', options: opts });
        });
        return out;
    }""")


async def charge_line_rows(page):
    rows = await page.locator("tr[id^='show_hide_line_']").all()
    out = []
    for row in rows:
        rid = await row.get_attribute("id") or ""
        cells = await row.locator("td").all()
        texts = [(await c.text_content() or "").strip() for c in cells]
        html = await row.evaluate("el => el.outerHTML")
        out.append({"row_id": rid, "cell_texts": texts, "outer_html": html[:4000]})
    return out


async def main():
    D.HEADLESS = True
    result = {"jobs": [], "location_selects": [], "charge_line_samples": []}
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await (await browser.new_context()).new_page()
        try:
            await page.goto(f"{D.DBS_URL}/index.cfm", timeout=30_000)
            await page.wait_for_load_state("domcontentloaded")
            await D.dbs_login(page)

            await page.goto(f"{D.DBS_URL}{D.JOBS_PATH}", timeout=20_000)
            await page.wait_for_load_state("networkidle", timeout=15_000)
            await page.wait_for_timeout(2000)

            jobs = await D.extract_all_jobs(page)
            result["jobs"] = jobs
            D.log(f"PROBE: {len(jobs)} jobs in list")

            for i, job in enumerate(jobs[:MAX_JOBS]):
                jid = job["shl_job_id"]
                D.log(f"PROBE: opening job {jid}")
                try:
                    await page.evaluate(f"perform_action('SELECT_JOB','{jid}','1')")
                    await page.wait_for_timeout(4000)
                except Exception as e:
                    D.log(f"  nav err {e}")
                    continue
                selects = await dump_selects(page)
                loc_selects = [s for s in selects
                               if re.search(r'loc|pe|room|element|area', (s['id']+s['name']).lower())
                               or any(re.match(r'PE\s?\d', o, re.I) for o in s['options'])]
                rows = await charge_line_rows(page)
                result["location_selects"].append({"job": jid, "matched_selects": loc_selects,
                                                    "all_select_ids": [s['id'] or s['name'] for s in selects]})
                result["charge_line_samples"].append({"job": jid, "address": job.get("address"),
                                                       "rows": rows})
                # back to list
                await page.goto(f"{D.DBS_URL}{D.JOBS_PATH}", timeout=15_000)
                await page.wait_for_load_state("networkidle", timeout=10_000)
                await page.wait_for_timeout(1500)
        finally:
            await browser.close()
    with open(OUT, "w") as f:
        json.dump(result, f, indent=2)
    D.log(f"PROBE: wrote {OUT}")
    # concise stdout summary
    print(json.dumps({
        "job_count": len(result["jobs"]),
        "sample_job_ids": [j["shl_job_id"] for j in result["jobs"][:MAX_JOBS]],
        "location_selects": result["location_selects"],
        "first_charge_rows_cell0": [
            {"job": s["job"], "cell0": [r["cell_texts"][0] if r["cell_texts"] else "" for r in s["rows"]]}
            for s in result["charge_line_samples"]
        ],
    }, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
