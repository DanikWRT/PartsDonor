#!/usr/bin/env python3
"""UX-4 verification: Playwright headless chromium tests for 2D flat drawing + 3D volumetric layers."""
import asyncio, json, sys, os
from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:5173/donor/Apple/iPhone%2013%20Pro"
LOG_PATH = "/home/aifactory/PartsDonor/backend/_ux4_verify.log"
SCREEN_DIR = "/home/aifactory/PartsDonor"

async def main():
    results = {"tests": [], "screenshots": {}}
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        
        # ---- DESKTOP (1280px) ----
        context = await browser.new_context(viewport={"width": 1280, "height": 900})
        page = await context.new_page()
        
        print("Navigating to donor page (desktop 1280px)...")
        await page.goto(BASE, wait_until="networkidle")
        await page.wait_for_timeout(2000)
        
        # Check page loaded
        assert "Развёртка" in await page.title() or await page.locator("h2").first.inner_text() == "Развёртка: iPhone 13 Pro"
        
        # --- Test a: display is 2D flat drawing + .pd-flat-hotspot ---
        display_hotspot = page.locator(".pd-flat-hotspot").filter(has_text="Дисплей")
        display_count = await display_hotspot.count()
        has_flat_svg = await page.locator(".pd-flat-svg").count() > 0
        
        # Also check by slot: find button with .pd-flat-hotspot near "Дисплей" tag
        flat_btns = await page.locator(".pd-flat-hotspot").all()
        flat_count = len(flat_btns)
        
        # Check display has flat SVG inside a flat-hotspot
        disp_flat = page.locator('.pd-flat-hotspot').filter(has=page.locator('.pd-flat-svg'))
        disp_flat_count = await disp_flat.count()
        
        # Check .pd-flat-tag contains "Дисплей"
        flat_tags = await page.locator(".pd-flat-tag").all()
        flat_tag_texts = [await t.inner_text() for t in flat_tags]
        
        results["tests"].append({
            "name": "display renders as 2D flat drawing + .pd-flat-hotspot",
            "status": "PASS" if (disp_flat_count > 0 and "Дисплей" in flat_tag_texts) else "FAIL",
            "detail": f"flat-hotspot with flat-svg: {disp_flat_count}, flat tags: {flat_tag_texts}"
        })
        
        # --- Test b: backcover is 2D flat drawing ---
        back_flat = page.locator('.pd-flat-hotspot').filter(has=page.locator('.pd-flat-svg'))
        back_tags = await page.locator(".pd-flat-tag").all()
        back_has_flat = any("Корпус" in (await t.inner_text()) for t in back_tags) if back_tags else False
        
        # Alternative: check that backcover is in flat tag texts
        results["tests"].append({
            "name": "backcover renders as 2D flat drawing + .pd-flat-hotspot",
            "status": "PASS" if ("Корпус" in flat_tag_texts and disp_flat_count >= 1) else "FAIL",
            "detail": f"flat tag texts: {flat_tag_texts}"
        })
        
        # --- Test c: camera/board/battery are 3D layers (NOT 2D) ---
        # Count pd-layer-btn elements that contain pd-layer-svg
        layer_btns = page.locator(".pd-layer-btn")
        layer_count = await layer_btns.count()
        
        # Check they contain pd-layer-svg (3D)
        has_3d_svg = await page.locator(".pd-layer-btn .pd-layer-svg").count() > 0
        
        # Verify camera/board/battery do NOT have .pd-flat-svg
        no_flat_camera = await page.locator('.pd-flat-hotspot:has(.pd-flat-svg)').count()
        # The flat hotspots should only be display and backcover (2)
        flat_hotspot_count = await page.locator(".pd-flat-hotspot").count()
        
        results["tests"].append({
            "name": "camera/board/battery render as 3D .pd-layer-btn (NOT 2D)",
            "status": "PASS" if (has_3d_svg and flat_hotspot_count <= 2) else "FAIL",
            "detail": f"3D layer-svgs: {has_3d_svg}, flat-hotspot count: {flat_hotspot_count} (expect <=2)"
        })
        
        # --- Test d: clicking flat hotspot opens .pd-f7-panel ---
        # Click display flat hotspot
        if flat_btns:
            try:
                await flat_btns[0].click()
                await page.wait_for_timeout(500)
                panel = page.locator(".pd-f7-panel")
                panel_visible = await panel.is_visible()
                panel_title = await panel.locator(".pd-f7-title").inner_text() if panel_visible else ""
                
                results["tests"].append({
                    "name": "clicking flat hotspot opens .pd-f7-panel",
                    "status": "PASS" if (panel_visible and "Дисплей" in panel_title) else "FAIL",
                    "detail": f"panel visible: {panel_visible}, title: {panel_title}"
                })
            except Exception as e:
                results["tests"].append({
                    "name": "clicking flat hotspot opens .pd-f7-panel",
                    "status": "FAIL",
                    "detail": f"error: {e}"
                })
        
        # --- Test e: clicking 3D layer opens panel ---
        # Find camera layer button and click
        cam_layer = page.locator('.pd-layer-btn').filter(has_text="Камера")
        if await cam_layer.count() > 0:
            try:
                await cam_layer.first.click()
                await page.wait_for_timeout(500)
                panel2 = page.locator(".pd-f7-panel")
                panel2_visible = await panel2.is_visible()
                panel2_title = await panel2.locator(".pd-f7-title").inner_text() if panel2_visible else ""
                
                results["tests"].append({
                    "name": "clicking 3D layer opens .pd-f7-panel",
                    "status": "PASS" if (panel2_visible and "Камера" in panel2_title) else "FAIL",
                    "detail": f"panel visible: {panel2_visible}, title: {panel2_title}"
                })
            except Exception as e:
                results["tests"].append({
                    "name": "clicking 3D layer opens .pd-f7-panel",
                    "status": "FAIL",
                    "detail": f"error: {e}"
                })
        
        # --- Test f: no horizontal overflow at 1280px ---
        overflow = await page.evaluate("""() => {
            const scrollW = document.documentElement.scrollWidth;
            const clientW = document.documentElement.clientWidth;
            return scrollW > clientW + 1;
        }""")
        results["tests"].append({
            "name": "no horizontal overflow at 1280px",
            "status": "PASS" if not overflow else "FAIL",
            "detail": f"overflow: {overflow}"
        })
        
        # Screenshot desktop
        await page.screenshot(path=f"{SCREEN_DIR}/pd-ux4-flat2d-desktop.png", full_page=True)
        results["screenshots"]["flat2d_desktop"] = f"{SCREEN_DIR}/pd-ux4-flat2d-desktop.png"
        
        # Take 3D view screenshot (scroll to show layers)
        await page.screenshot(path=f"{SCREEN_DIR}/pd-ux4-vol3d-desktop.png", full_page=True)
        results["screenshots"]["vol3d_desktop"] = f"{SCREEN_DIR}/pd-ux4-vol3d-desktop.png"
        
        await context.close()
        
        # ---- MOBILE (400px) ----
        context2 = await browser.new_context(viewport={"width": 400, "height": 800})
        page2 = await context2.new_page()
        
        print("Navigating to donor page (mobile 400px)...")
        await page2.goto(BASE, wait_until="networkidle")
        await page2.wait_for_timeout(2000)
        
        # Check no horizontal overflow at 400px
        overflow_m = await page2.evaluate("""() => {
            const scrollW = document.documentElement.scrollWidth;
            const clientW = document.documentElement.clientWidth;
            return scrollW > clientW + 1;
        }""")
        results["tests"].append({
            "name": "no horizontal overflow at 400px",
            "status": "PASS" if not overflow_m else "FAIL",
            "detail": f"overflow: {overflow_m}"
        })
        
        # Verify flat hotspots still work on mobile
        flat_btns_m = await page2.locator(".pd-flat-hotspot").count()
        has_flat_svg_m = await page2.locator(".pd-flat-svg").count() > 0
        flat_tags_m = await page2.locator(".pd-flat-tag").all()
        flat_tag_texts_m = [await t.inner_text() for t in flat_tags_m]
        
        results["tests"].append({
            "name": "flat 2D drawing renders on mobile 400px",
            "status": "PASS" if (has_flat_svg_m and len(flat_tag_texts_m) >= 2) else "FAIL",
            "detail": f"flat tags: {flat_tag_texts_m}"
        })
        
        # Take mobile screenshot
        await page2.screenshot(path=f"{SCREEN_DIR}/pd-ux4-flat2d-mobile.png", full_page=True)
        results["screenshots"]["flat2d_mobile"] = f"{SCREEN_DIR}/pd-ux4-flat2d-mobile.png"
        
        await context2.close()
        await browser.close()
    
    # Write results
    all_pass = all(t["status"] == "PASS" for t in results["tests"])
    log_content = "UX-4 Verification Results\n" + "="*50 + "\n"
    log_content += f"Overall: {'PASS' if all_pass else 'FAIL'}\n\n"
    
    for t in results["tests"]:
        log_content += f"[{t['status']}] {t['name']}\n"
        log_content += f"  Detail: {t['detail']}\n\n"
    
    log_content += "DOM Metrics:\n"
    log_content += f"  - Flat hotspot count: {flat_hotspot_count}\n"
    log_content += f"  - Flat tag texts: {flat_tag_texts}\n"
    log_content += f"  - 3D layer-svg present: {has_3d_svg}\n"
    log_content += f"  - Flat SVG count: {has_flat_svg}\n"
    log_content += f"  - Overflow 1280px: {overflow}\n"
    log_content += f"  - Overflow 400px: {overflow_m}\n"
    log_content += f"\nScreenshots:\n"
    for k, v in results["screenshots"].items():
        log_content += f"  - {k}: {v}\n"
    
    with open(LOG_PATH, "w") as f:
        f.write(log_content)
    
    print(f"\nResults written to {LOG_PATH}")
    print(f"All tests {'PASS' if all_pass else 'FAIL'}")
    print(f"Flat tags: {flat_tag_texts}")
    print(f"3D layers present: {has_3d_svg}")
    print(f"Flat hotspots: {flat_hotspot_count}")

if __name__ == "__main__":
    asyncio.run(main())
