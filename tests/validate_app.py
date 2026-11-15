#!/usr/bin/env python3
"""Static and browser smoke tests for STUDTY TOOLS."""
from __future__ import annotations

import re
import subprocess
import sys
import threading
import time
from collections import Counter
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = ROOT / "index.html"


def extract_script(source: str) -> str:
    match = re.search(r"<script>(.*?)</script>", source, flags=re.S)
    if not match:
        raise AssertionError("Inline application script was not found")
    return match.group(1)


def static_checks() -> str:
    source = HTML_PATH.read_text(encoding="utf-8")
    assert "<title>STUDTY TOOLS</title>" in source
    assert 'id="subjectForm"' in source
    assert 'id="taskForm"' in source
    assert 'id="blockForm"' in source
    assert 'id="focusStart"' in source
    assert 'id="page-pro"' in source
    assert 'id="authForm"' in source and 'id="providerList"' in source
    assert 'id="generateAiPlan"' in source
    assert 'data-page="pro"' in source
    assert 'id="exportData"' in source and 'id="importDataBtn"' in source
    assert "function normalizeData(value)" in source
    assert "localStorage.setItem(STORAGE_KEY" in source
    assert "TossPayments" not in source and "requestPayment" not in source
    assert "/api/billing/create-order" not in source and "/api/toss/confirm" not in source
    assert 'id="checkoutModal"' not in source and 'id="checkoutPayBtn"' not in source
    assert "TOSS_SECRET_KEY" not in source, "Toss secret key must never be present in frontend HTML"
    assert "SUPABASE_SERVICE_ROLE_KEY" not in source, "Supabase service role key must never be present in frontend HTML"
    assert "<title>FORM" not in source and ">FORM</div>" not in source, "Old product branding remains in the UI"

    ids = re.findall(r'\bid="([^"$][^"]*)"', source)
    duplicates = [key for key, count in Counter(ids).items() if count > 1]
    assert not duplicates, f"Duplicate HTML IDs: {duplicates}"

    js_path = ROOT / "tests" / ".inline_app_check.js"
    js_path.write_text(extract_script(source), encoding="utf-8")
    try:
        result = subprocess.run(
            ["node", "--check", str(js_path)],
            capture_output=True,
            text=True,
            check=False,
        )
        assert result.returncode == 0, result.stderr or result.stdout
    finally:
        js_path.unlink(missing_ok=True)

    # Check all server-side JavaScript files for syntax errors.
    js_files = sorted((ROOT / "api").rglob("*.js")) + sorted((ROOT / "lib").rglob("*.js"))
    for server_js in js_files:
        result = subprocess.run(["node", "--check", str(server_js)], capture_output=True, text=True, check=False)
        assert result.returncode == 0, f"{server_js.relative_to(ROOT)}: {result.stderr or result.stdout}"

    # Backend security invariants.
    schema = (ROOT / "supabase" / "schema.sql").read_text(encoding="utf-8")
    rls_tables = set(re.findall(r"alter table public\.([a-z_]+) enable row level security", schema, flags=re.I))
    expected_rls_tables = {
        "subscriptions", "api_credentials", "ai_usage",
        "user_workspaces", "admin_audit_logs",
    }
    assert rls_tables == expected_rls_tables, (
        f"RLS coverage mismatch: expected {sorted(expected_rls_tables)}, got {sorted(rls_tables)}"
    )
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    assert "SUPABASE_SECRET_KEY" in readme
    assert "결제" in readme and "아직 구현하지 않" in readme
    assert not any("TOSS_" in line for line in (ROOT / ".env.example").read_text(encoding="utf-8").splitlines())
    assert (ROOT / ".env.example").exists()
    assert (ROOT / "terms.html").exists() and (ROOT / "privacy.html").exists()

    # All direct DOM lookups must refer to an element that exists in the HTML.
    js = extract_script(source)
    refs = set(re.findall(r"\$\('([^']+)'\)", js))
    missing = sorted(refs - set(ids))
    assert not missing, f"JavaScript references missing element IDs: {missing}"
    return source


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args: Any) -> None:
        pass


def browser_checks() -> None:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise RuntimeError("Playwright is not installed. Run: pip install -r requirements-dev.txt") from exc

    html = HTML_PATH.read_text(encoding="utf-8")
    # The execution sandbox blocks file:// and localhost navigation. Load the same
    # application markup with set_content and replace only the browser storage
    # adapter with an in-memory equivalent for deterministic interaction tests.
    storage_adapter = r"""window.__mockLocalStorage = {
      _data: {},
      getItem(key) { return Object.prototype.hasOwnProperty.call(this._data, key) ? this._data[key] : null; },
      setItem(key, value) { this._data[key] = String(value); },
      removeItem(key) { delete this._data[key]; },
      clear() { this._data = {}; }
    };"""
    html, replacements = re.subn(
        r"(<script>)(.*?)(</script>)",
        lambda match: match.group(1) + storage_adapter + "\n" + match.group(2).replace("localStorage", "window.__mockLocalStorage") + match.group(3),
        html,
        count=1,
        flags=re.S,
    )
    assert replacements == 1, "Unable to inject test storage adapter"
    errors: list[str] = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.on("pageerror", lambda exc: errors.append(str(exc)))
        page.set_content(html, wait_until="domcontentloaded")
        assert page.title() == "STUDTY TOOLS", f"Unexpected document title: {page.title()!r}"
        assert page.locator("#pageTitle").inner_text() == "오늘", f"Unexpected initial page heading: {page.locator('#pageTitle').inner_text()!r}"

        # Add a subject and verify that it appears in the app selectors.
        page.locator("[data-page='subjects']").click()
        page.locator("#newSubject").fill("물리학")
        page.locator("#subjectForm button[type='submit']").click()
        assert page.locator("#subjectList").get_by_text("물리학").count() == 1, "New subject was not rendered in subject list"
        assert page.locator("#taskSubject option").filter(has_text="물리학").count() == 1, "New subject is missing from task selector"
        assert page.locator("#focusSubject option").filter(has_text="물리학").count() == 1, "New subject is missing from focus selector"

        # Create a task and confirm it appears in the task view.
        page.locator("[data-page='tasks']").click()
        page.locator("#taskTitle").fill("미적분 오답 정리")
        page.locator("#taskSubject").select_option(label="물리학")
        page.locator("#taskForm button[type='submit']").click()
        assert page.locator("#allTaskList").get_by_text("미적분 오답 정리").count() == 1, "Task creation did not update task view"

        # Create a schedule block and validate it is rendered.
        page.locator("[data-page='schedule']").click()
        page.locator("#blockTitle").fill("운동량 개념 복습")
        page.locator("#blockSubject").select_option(label="물리학")
        page.locator("#blockForm button[type='submit']").click()
        assert page.locator("#scheduleList").get_by_text("운동량 개념 복습").count() == 1, "Schedule block creation did not update schedule view"

        # Timer selection and start/pause should update without runtime errors.
        page.locator("[data-page='focus']").click()
        page.locator(".mode-btn[data-mode='15']").click()
        assert page.locator("#focusTimer").inner_text() == "15:00", "Selecting 15-minute focus mode did not update the timer"
        page.locator("#focusStart").click()
        time.sleep(1.2)
        assert page.locator("#focusTimer").inner_text() != "15:00", "Focus timer did not start counting down"
        page.locator("#focusStart").click()
        page.locator("#focusReset").click()
        assert page.locator("#focusTimer").inner_text() == "15:00"

        # Manual log, analytics, and browser persistence adapter.
        page.locator("#manualMinutes").fill("12")
        page.locator("#manualLog").click()
        page.locator("[data-page='analytics']").click()
        assert "12분" in page.locator("#historyList").inner_text(), "Manual study log did not appear in analytics history"
        saved = page.evaluate("window.__mockLocalStorage.getItem('form_study_os_v1')")
        assert saved and '미적분 오답 정리' in saved and '운동량 개념 복습' in saved, "Study data was not persisted by the browser storage adapter"

        # Pro screen is visible, while paid features remain locked for Free users.
        page.locator("[data-page='pro']").click()
        assert page.locator("#pageTitle").inner_text() == "플랜", "Plan navigation did not render its page heading"
        assert page.locator("#proStatusBadge").inner_text() == "FREE", "Anonymous browser session should remain on the Free plan"
        assert page.locator("#generateAiPlan").is_disabled(), "AI study plan button should be disabled for Free users"
        assert page.locator("#monthlyPlanCard").get_by_text("준비 중").count() == 2, "Monthly Pro plan should be marked as coming soon"
        assert page.locator("#yearlyPlanCard").get_by_text("준비 중").count() == 2, "Yearly Pro plan should be marked as coming soon"
        assert page.locator(".pro-max-card").get_by_text("준비 중").count() == 2, "Pro Max should be marked as coming soon"
        assert page.locator(".plan-card:not(:first-child) .plan-button:disabled").count() == 3, "Paid plan purchase buttons must remain disabled"

        # Backup download should be available.
        page.locator("[data-page='settings']").click()
        with page.expect_download() as download_info:
            page.locator("#exportData").click()
        download = download_info.value
        assert download.suggested_filename.endswith(".json"), f"Backup download has unexpected filename: {download.suggested_filename!r}"

        # Mobile layout remains navigable and does not throw.
        mobile = browser.new_page(viewport={"width": 390, "height": 844})
        mobile.on("pageerror", lambda exc: errors.append(str(exc)))
        mobile.set_content(html, wait_until="domcontentloaded")
        assert mobile.locator("[data-page='dashboard']").is_visible(), "Dashboard nav is not visible on mobile"
        assert mobile.locator(".sidebar").is_visible(), "Sidebar is not visible on mobile"
        horizontal_overflow = mobile.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        assert horizontal_overflow == 0, f"Mobile horizontal overflow: {horizontal_overflow}px"
        browser.close()

    assert not errors, "Browser runtime errors: " + " | ".join(errors)



def main() -> int:
    try:
        static_checks()
        print("PASS  HTML structure and required features")
        print("PASS  Frontend and server JavaScript syntax (node --check)")
        print("PASS  Auth/API security structure; paid checkout disabled")
        browser_checks()
        print("PASS  Browser flow: subject, task, schedule, timer, manual log, backup, Pro gates")
        print("PASS  Paid plan purchase and payment provider are disabled")
        print("PASS  Mobile viewport smoke test")
        print("All STUDTY TOOLS checks passed.")
        return 0
    except Exception as exc:  # show actionable test failures
        print(f"FAIL  {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())