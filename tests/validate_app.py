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
    assert 'id="checkoutModal"' in source and 'id="checkoutPayBtn"' in source
    assert 'id="authForm"' in source and 'id="providerList"' in source
    assert 'id="generateAiPlan"' in source
    assert 'data-page="pro"' in source
    assert 'id="exportData"' in source and 'id="importDataBtn"' in source
    assert "function normalizeData(value)" in source
    assert "localStorage.setItem(STORAGE_KEY" in source
    assert "requestPayment({orderId:order.orderId" in source
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
    rls_tables = set(re.findall(r"alter table public\\.([a-z_]+) enable row level security", schema, flags=re.I))
    expected_rls_tables = {
        "billing_orders", "subscriptions", "api_credentials",
        "ai_usage", "user_workspaces", "admin_audit_logs",
    }
    assert rls_tables == expected_rls_tables, (
        f"RLS coverage mismatch: expected {sorted(expected_rls_tables)}, got {sorted(rls_tables)}"
    )
    assert "SUPABASE_SERVICE_ROLE_KEY" in (ROOT / "README.md").read_text(encoding="utf-8")
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
            executable_path="/usr/bin/chromium",
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.on("pageerror", lambda exc: errors.append(str(exc)))
        page.set_content(html, wait_until="domcontentloaded")
        assert page.title() == "STUDTY TOOLS"
        assert page.locator("#pageTitle").inner_text() == "오늘"

        # Add a subject and verify that it appears in the app selectors.
        page.locator("[data-page='subjects']").click()
        page.locator("#newSubject").fill("물리학")
        page.locator("#subjectForm button[type='submit']").click()
        assert page.locator("#subjectList").get_by_text("물리학").count() == 1
        assert page.locator("#taskSubject option").filter(has_text="물리학").count() == 1
        assert page.locator("#focusSubject option").filter(has_text="물리학").count() == 1

        # Create a task and confirm it appears in the task view.
        page.locator("[data-page='tasks']").click()
        page.locator("#taskTitle").fill("미적분 오답 정리")
        page.locator("#taskSubject").select_option(label="물리학")
        page.locator("#taskForm button[type='submit']").click()
        assert page.locator("#allTaskList").get_by_text("미적분 오답 정리").count() == 1

        # Create a schedule block and validate it is rendered.
        page.locator("[data-page='schedule']").click()
        page.locator("#blockTitle").fill("운동량 개념 복습")
        page.locator("#blockSubject").select_option(label="물리학")
        page.locator("#blockForm button[type='submit']").click()
        assert page.locator("#scheduleList").get_by_text("운동량 개념 복습").count() == 1

        # Timer selection and start/pause should update without runtime errors.
        page.locator("[data-page='focus']").click()
        page.locator(".mode-btn[data-mode='15']").click()
        assert page.locator("#focusTimer").inner_text() == "15:00"
        page.locator("#focusStart").click()
        time.sleep(1.2)
        assert page.locator("#focusTimer").inner_text() != "15:00"
        page.locator("#focusStart").click()
        page.locator("#focusReset").click()
        assert page.locator("#focusTimer").inner_text() == "15:00"

        # Manual log, analytics, and browser persistence adapter.
        page.locator("#manualMinutes").fill("12")
        page.locator("#manualLog").click()
        page.locator("[data-page='analytics']").click()
        assert "12분" in page.locator("#historyList").inner_text()
        saved = page.evaluate("window.__mockLocalStorage.getItem('form_study_os_v1')")
        assert saved and '미적분 오답 정리' in saved and '운동량 개념 복습' in saved

        # Pro screen is visible, while paid features remain locked for Free users.
        page.locator("[data-page='pro']").click()
        assert page.locator("#pageTitle").inner_text() == "Pro · API"
        assert page.locator("#proStatusBadge").inner_text() == "FREE"
        assert page.locator("#generateAiPlan").is_disabled()
        assert page.locator("#monthlyPlanCard").get_by_text("₩4,900").count() == 1
        assert page.locator("#yearlyPlanCard").get_by_text("₩49,000").count() == 1
        assert page.locator("#checkoutModal").is_hidden()

        # Backup download should be available.
        page.locator("[data-page='settings']").click()
        with page.expect_download() as download_info:
            page.locator("#exportData").click()
        download = download_info.value
        assert download.suggested_filename.endswith(".json")

        # Mobile layout remains navigable and does not throw.
        mobile = browser.new_page(viewport={"width": 390, "height": 844})
        mobile.on("pageerror", lambda exc: errors.append(str(exc)))
        mobile.set_content(html, wait_until="domcontentloaded")
        assert mobile.locator("[data-page='dashboard']").is_visible()
        assert mobile.locator(".sidebar").is_visible()
        horizontal_overflow = mobile.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        assert horizontal_overflow == 0, f"Mobile horizontal overflow: {horizontal_overflow}px"
        browser.close()

    assert not errors, "Browser runtime errors: " + " | ".join(errors)



def checkout_mock_checks() -> None:
    """Exercise the Pro checkout UI against mocked provider SDKs; no real charge is made."""
    import json
    from datetime import datetime, timedelta, timezone
    from playwright.sync_api import sync_playwright

    html = HTML_PATH.read_text(encoding="utf-8").replace("<head>", '<head><base href="https://studty.test/">', 1)
    storage_adapter = r"""window.__mockLocalStorage = {
      _data: {}, getItem(key) { return this._data[key] ?? null; },
      setItem(key, value) { this._data[key] = String(value); }, removeItem(key) { delete this._data[key]; }, clear() { this._data = {}; }
    };"""
    html = re.sub(
        r"(<script>)(.*?)(</script>)",
        lambda m: m.group(1) + storage_adapter + "\n" + m.group(2).replace("localStorage", "window.__mockLocalStorage") + m.group(3),
        html, count=1, flags=re.S,
    )
    expires = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    sdk_supabase = r"""window.supabase = { createClient: () => ({ auth: {
      getSession: async () => ({ data: { session: { access_token: 'mock-access', user: { id: '7a5b9d19-9b64-42ea-9e82-33bbf5f3b9c1', email: 'tester@example.test' } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({ error: null })
    } }) };"""
    sdk_toss = r"""window.TossPayments = () => ({ widgets: () => ({
      setAmount: async (amount) => { window.__widgetAmount = amount; },
      renderPaymentMethods: async () => { document.querySelector('#toss-payment-methods').textContent = 'Mock payment methods'; },
      renderAgreement: async () => { document.querySelector('#toss-terms').textContent = 'Mock payment agreement'; },
      requestPayment: async (request) => { window.__paymentRequest = request; }
    }) });"""
    config = {"supabaseUrl":"https://supabase.test","supabaseAnonKey":"anon-test","tossClientKey":"test_ck_sample","backendReady":True,"plans":{"monthly":{"amount":4900,"label":"PRO · 30일","days":30},"yearly":{"amount":49000,"label":"PRO · 365일","days":365}}}
    subscription = {"plan":"pro","subscription":{"plan":"monthly","status":"active","expires_at":expires}}

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
        page = browser.new_page(viewport={"width":1280,"height":900})

        def route_api(route):
            url = route.request.url
            if url.endswith('/api/config'):
                route.fulfill(status=200, content_type='application/json', body=json.dumps(config, ensure_ascii=False))
            elif url.endswith('/api/account/me'):
                route.fulfill(status=200, content_type='application/json', body=json.dumps(subscription, ensure_ascii=False))
            elif url.endswith('/api/integrations'):
                route.fulfill(status=200, content_type='application/json', body='{"integrations":[]}')
            elif url.endswith('/api/billing/create-order'):
                route.fulfill(status=200, content_type='application/json', body='{"orderId":"STUDTY-TEST-ORDER-0123456789","amount":4900,"orderName":"STUDTY PRO 30일 이용권","days":30}')
            else:
                route.continue_()

        page.route('https://studty.test/api/**', route_api)
        page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0', lambda route: route.fulfill(status=200, content_type='application/javascript', body=sdk_supabase))
        page.route('https://js.tosspayments.com/v2/standard', lambda route: route.fulfill(status=200, content_type='application/javascript', body=sdk_toss))
        page.set_content(html, wait_until='domcontentloaded')
        page.locator("[data-page='pro']").click()
        page.wait_for_function("document.querySelector('#proStatusBadge').textContent === 'PRO ACTIVE'")
        assert page.locator('#generateAiPlan').is_enabled()
        page.locator(".plan-button[data-plan='monthly']").click()
        page.wait_for_function("document.querySelector('#toss-payment-methods').textContent.includes('Mock payment methods')")
        page.locator('#checkoutConsent').check()
        assert page.locator('#checkoutPayBtn').is_enabled()
        page.locator('#checkoutPayBtn').click()
        page.wait_for_function("!!window.__paymentRequest")
        request = page.evaluate("window.__paymentRequest")
        assert request['orderId'] == 'STUDTY-TEST-ORDER-0123456789'
        assert request['orderName'] == 'PRO · 30일'
        assert page.evaluate('window.__widgetAmount.value') == 4900
        browser.close()

def main() -> int:
    try:
        static_checks()
        print("PASS  HTML structure and required features")
        print("PASS  Frontend and server JavaScript syntax (node --check)")
        print("PASS  Payment/auth/API security structure")
        browser_checks()
        print("PASS  Browser flow: subject, task, schedule, timer, manual log, backup, Pro gates")
        checkout_mock_checks()
        print("PASS  Pro checkout: mocked Supabase session + Toss SDK request (no charge)")
        print("PASS  Mobile viewport smoke test")
        print("All STUDTY TOOLS checks passed.")
        return 0
    except Exception as exc:  # show actionable test failures
        print(f"FAIL  {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())