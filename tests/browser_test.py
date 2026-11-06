"""Isolated Chromium acceptance checks. No author data or external services are used.

Run: python3 tests/browser_test.py
Requires Python playwright and a Chromium executable (CHROMIUM_PATH may override).
The test starts its own loopback HTTP server and uses temporary browser contexts.
ARCHIVE_SITE_DIR selects a staged Pages artifact instead of the source directory.
"""
from __future__ import annotations
import functools
from datetime import datetime, timezone
import time
import sys
import json
import os
from pathlib import Path
import threading
import unittest
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SITE_ROOT = Path(os.environ.get('ARCHIVE_SITE_DIR', str(ROOT))).resolve()
ARTIFACTS = ROOT / 'tests' / 'artifacts'


def fixture():
    def cs(s):
        return dict(appears=True, condition='생존', role=f'역할 {s}', groupIds=['g1'], change=f'변화 {s}', notes='')
    def ls(s):
        return dict(appears=True, function=f'용도 {s}', changed='', managementIds=['g1'], plan=[dict(id=f'z{s}', type='room', label=f'구역 {s}', notes='', x=40, y=40, w=140, h=90)])
    return dict(
        schemaVersion=1,
        project=dict(name='검증 전용 프로젝트', description='정식 설정이 아닌 자동 테스트 자료'),
        seasons=[dict(id=s, title=f'시즌 {s}', logline='') for s in range(1, 8)],
        characters=[
            dict(id='c1', name='검증 공통 인물', type='core', homeSeason=1, alias='', summary='', notes='', seasonStates={str(s):cs(s) for s in range(1,8)}),
            dict(id='c2', name='검증 시즌 전용 인물', type='guest', homeSeason=3, alias='', summary='', notes='', seasonStates={'3':cs(3)}),
        ],
        groups=[dict(id='g1', name='검증 집단', type='기타', headquartersId='p1', summary='', structure='', methods='', notes='', seasonStates={str(s):dict(appears=True, leader='', goal='', change='', notes='') for s in range(1,8)})],
        locations=[dict(id='p1', name='검증 장소', kind='건물', parentId='', summary='', notes='', seasonStates={str(s):ls(s) for s in range(1,8)})],
        events=[dict(id=f'e{s}', season=s, order=1, title=f'검증 사건 {s}', timeLabel='' if s==1 else f'{s}일 저녁', locationId='p1', zoneId=f'z{s}', personIds=['c2'] if s==3 else ['c1'], groupIds=['g1'], outline='', trigger='', aftermath='', reveal='', notes='') for s in range(1,4)],
    )


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


class BrowserAcceptance(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        ARTIFACTS.mkdir(parents=True, exist_ok=True)
        if not (SITE_ROOT / 'index.html').is_file():
            raise RuntimeError(f'Site entry point is missing: {SITE_ROOT / "index.html"}')
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(SITE_ROOT)))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f'http://127.0.0.1:{cls.server.server_port}'
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        self.context = self.browser.new_context(viewport={'width':1440, 'height':1050}, accept_downloads=True)
        self.page = self.context.new_page()
        self.errors = []
        self.page.on('pageerror', lambda error:self.errors.append(str(error)))
        self.page.on('dialog', lambda dialog:dialog.accept())
        self.page.set_default_timeout(8000)
        self.page.goto(self.url)

    def tearDown(self):
        try:
            self.assertEqual(self.errors, [], 'uncaught browser errors')
        finally:
            self.context.close()

    def action(self, name, **data):
        selector = f'[data-action="{name}"]' + ''.join(f'[data-{key}="{value}"]' for key,value in data.items())
        return self.page.locator(selector).first

    def field(self, kind, name):
        return self.page.locator(f'[data-bind="{kind}"][data-field="{name}"]').first

    def season(self, season):
        self.page.locator(f'.seasonrail [data-season="{season}"]').click()

    def tab(self, tab):
        self.action('tab', tab=tab).click()

    def seed(self, value=None):
        self.page.evaluate("""value => { const D=window.ArchiveData; const store=D.createStore(localStorage); store.import(value); }""", value or fixture())
        self.page.reload()

    def state(self):
        return self.page.evaluate('window.ArchiveData.createStore(localStorage).load()')

    def test_all_seasons_and_main_tabs(self):
        for s in range(8):
            self.season(s)
            self.assertIn('active', self.page.locator(f'.seasonrail [data-season="{s}"]').get_attribute('class'))
        for tab in ['people', 'events', 'background', 'overview']:
            self.tab(tab)
            self.assertTrue(self.page.locator('h2').is_visible())
        self.page.screenshot(path=str(ARTIFACTS / 'desktop-empty.png'), full_page=True)

    def test_legacy_import_has_seven_independent_character_states(self):
        self.seed()
        self.assertEqual(self.state()['schemaVersion'], 2)
        self.tab('people')
        self.action('select-person', id='c1').click()
        for s in range(1,8):
            self.season(s)
            self.field('person-season', 'role').fill(f'입력한 역할 {s}')
            self.field('person-season', 'change').fill(f'입력한 변화 {s}')
        states = self.state()['characters'][0]['seasonStates']
        self.assertEqual([states[str(s)]['role'] for s in range(1,8)], [f'입력한 역할 {s}' for s in range(1,8)])
        self.page.reload()
        self.assertEqual(self.state()['characters'][0]['seasonStates'], states)

    def test_guest_filter_and_bidirectional_conversion_preserves_states(self):
        self.seed()
        self.tab('people')
        self.season(3)
        self.assertTrue(self.action('select-person', id='c2').is_visible())
        self.season(2)
        self.assertEqual(self.page.locator('[data-action="select-person"][data-id="c2"]').count(), 0)
        self.season(0)
        self.assertTrue(self.action('select-person', id='c2').is_visible())
        self.action('select-person', id='c1').click()
        before = self.state()['characters'][0]['seasonStates']
        self.field('person', 'type').select_option('guest')
        self.field('person', 'type').select_option('core')
        self.assertEqual(self.state()['characters'][0]['seasonStates'], before)
        self.season(3)
        self.action('select-person', id='c2').click()
        before_guest = self.state()['characters'][1]['seasonStates']['3']
        self.field('person', 'type').select_option('core')
        self.assertEqual(self.state()['characters'][1]['seasonStates']['3'], before_guest)

    def test_membership_single_source(self):
        self.seed()
        self.tab('people')
        self.action('select-person', id='c1').click()
        person_check=self.page.locator('[data-bind="person-group"][data-group="g1"]')
        person_check.uncheck()
        self.tab('background')
        self.action('bg-tab', value='groups').click()
        self.action('select-group', id='g1').click()
        group_check=self.page.locator('[data-bind="group-member"][data-person="c1"]')
        self.assertFalse(group_check.is_checked())
        group_check.check()
        self.tab('people')
        self.action('select-person', id='c1').click()
        self.assertTrue(self.page.locator('[data-bind="person-group"][data-group="g1"]').is_checked())

    def test_edit_outside_click_and_refresh(self):
        self.tab('people')
        self.action('new-person').click()
        self.field('person','name').fill('새로고침 보존 인물')
        self.field('person','notes').fill('편집 도중 바깥 클릭 보존')
        self.page.locator('h2').click()
        self.assertEqual(self.field('person','notes').input_value(), '편집 도중 바깥 클릭 보존')
        self.season(2)
        self.tab('events')
        self.page.reload()
        person=self.state()['characters'][0]
        self.assertEqual(person['name'],'새로고침 보존 인물')
        self.assertEqual(person['notes'],'편집 도중 바깥 클릭 보존')

    def open_place(self, season=1):
        self.season(season)
        self.tab('background')
        self.action('bg-tab', value='places').click()
        self.action('select-place', id='p1').click()

    def plan_action(self, name, **data):
        selector=f'[data-plan-action="{name}"]'+''.join(f'[data-plan-{key}="{value}"]' for key,value in data.items())
        return self.page.locator(selector).first

    def test_plan_shapes_drag_resize_delete_undo(self):
        self.seed()
        self.open_place()
        self.plan_action('add', type='room').click()
        plan=self.state()['locations'][0]['seasonStates']['1']['plan']
        self.assertEqual(len(plan),2)
        zone_id=plan[-1]['id']
        zone=self.page.locator(f'[data-plan-zone="{zone_id}"]')
        zone.scroll_into_view_if_needed()
        box=zone.bounding_box()
        self.page.mouse.move(box['x']+30,box['y']+25)
        self.page.mouse.down()
        self.page.mouse.move(box['x']+90,box['y']+65,steps=8)
        self.page.mouse.up()
        after=self.state()['locations'][0]['seasonStates']['1']['plan'][-1]
        self.assertGreater(after['x'],plan[-1]['x'])
        self.assertGreater(after['y'],plan[-1]['y'])
        grip=self.page.locator(f'[data-plan-zone="{zone_id}"] .wdplan-resize')
        grip.scroll_into_view_if_needed()
        box=grip.bounding_box()
        self.page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2)
        self.page.mouse.down()
        self.page.mouse.move(box['x']+50,box['y']+40,steps=8)
        self.page.mouse.up()
        resized=self.state()['locations'][0]['seasonStates']['1']['plan'][-1]
        self.assertGreater(resized['w'],after['w'])
        self.assertGreater(resized['h'],after['h'])
        self.page.locator('[data-plan-field="label"]').fill('직접 편집한 구역')
        self.page.locator('[data-plan-field="color"]').fill('#123456')
        self.page.locator('[data-plan-field="display"]').select_option('dashed')
        self.assertEqual(self.state()['locations'][0]['seasonStates']['1']['plan'][-1]['color'],'#123456')
        self.plan_action('delete').click()
        self.assertEqual(len(self.state()['locations'][0]['seasonStates']['1']['plan']),1)
        self.plan_action('undo').click()
        restored=self.state()['locations'][0]['seasonStates']['1']['plan'][-1]
        self.assertEqual(restored['id'],zone_id)
        self.assertEqual(restored['label'],'직접 편집한 구역')
        self.page.screenshot(path=str(ARTIFACTS / 'desktop-plan.png'), full_page=True)

    def test_plan_copy_isolated_and_event_zone_references(self):
        self.seed()
        self.open_place(2)
        source=self.state()['locations'][0]['seasonStates']['1']['plan']
        self.page.locator('[data-plan-copy-source]').select_option('1')
        self.plan_action('copy').click()
        copied=self.state()['locations'][0]['seasonStates']['2']['plan']
        self.assertEqual(copied,source)
        self.page.locator(f'[data-plan-zone="{copied[0]["id"]}"]').click()
        self.page.locator('[data-plan-field="label"]').fill('시즌 2만 변경')
        self.assertEqual(self.state()['locations'][0]['seasonStates']['1']['plan'],source)
        self.assertEqual(self.state()['events'][1]['zoneId'],'')
        self.open_place(1)
        self.page.locator('[data-plan-zone="z1"]').click()
        self.assertTrue(self.page.locator('.wdplan-linked [data-action="jump-event"][data-id="e1"]').is_visible())
        self.plan_action('delete').click()
        self.assertEqual(self.state()['events'][0]['zoneId'],'')
        self.plan_action('undo').click()
        self.assertEqual(self.state()['events'][0]['zoneId'],'z1')
        self.assertEqual(self.state()['locations'][0]['seasonStates']['1']['plan'][0]['id'],'z1')

    def test_plan_zoom_pan_and_event_navigation(self):
        self.seed()
        self.open_place()
        self.plan_action('zoom-in').click()
        self.assertEqual(self.page.locator('[data-plan-zoom]').inner_text(),'115%')
        self.plan_action('zoom-out').click()
        self.assertEqual(self.page.locator('[data-plan-zoom]').inner_text(),'100%')
        self.plan_action('pan').click()
        area=self.page.locator('.wdplan-workspace')
        area.scroll_into_view_if_needed()
        box=area.bounding_box()
        self.page.mouse.move(box['x']+300,box['y']+200)
        self.page.mouse.down()
        self.page.mouse.move(box['x']+180,box['y']+140,steps=8)
        self.page.mouse.up()
        self.assertGreater(area.evaluate('(el)=>el.scrollLeft+el.scrollTop'),0)
        self.plan_action('pan').click()
        self.page.locator('.wdplan-linked [data-action="jump-event"][data-id="e1"]').click()
        self.assertEqual(self.field('event','title').input_value(),'검증 사건 1')

    def test_backup_import_restore_and_recovery(self):
        self.seed()
        expected=self.state()
        with self.page.expect_download() as info:
            self.action('export').click()
        backup=Path(info.value.path()).read_text()
        self.assertEqual(json.loads(backup),expected)
        self.tab('people')
        self.action('select-person',id='c1').click()
        self.field('person','name').fill('복구할 수정 이름')
        modified=self.state()
        self.page.locator('#import-file').set_input_files(dict(name='roundtrip.json',mimeType='application/json',buffer=backup.encode()))
        self.page.wait_for_function("JSON.parse(localStorage.getItem(ArchiveData.KEYS.current)).characters[0].name === '검증 공통 인물'")
        self.assertEqual(self.state(),expected)
        self.action('recover').click()
        self.assertEqual(self.state(),modified)

    def test_invalid_import_rejected_without_changing_saved_data(self):
        self.seed()
        expected=self.state()
        invalid=fixture()
        invalid['events'][0]['locationId']='missing-location'
        self.page.locator('#import-file').set_input_files(dict(name='invalid.json',mimeType='application/json',buffer=json.dumps(invalid).encode()))
        self.page.wait_for_function("document.getElementById('toast').textContent.includes('실패')")
        self.assertEqual(self.state(),expected)
        self.page.reload()
        self.assertEqual(self.state(),expected)

    def test_reference_cleanup_and_undo(self):
        self.seed()
        self.tab('people')
        self.action('select-person',id='c1').click()
        self.action('delete-person',id='c1').click()
        current=self.state()
        self.assertNotIn('c1',[c['id'] for c in current['characters']])
        self.assertTrue(all('c1' not in e['personIds'] for e in current['events']))
        self.action('undo').click()
        self.assertIn('c1',[c['id'] for c in self.state()['characters']])
        self.assertIn('c1',self.state()['events'][0]['personIds'])

    def test_mobile_navigation_and_primary_edit(self):
        self.seed()
        self.page.set_viewport_size({'width':390,'height':844})
        self.tab('people')
        self.action('select-person',id='c1').click()
        self.field('person','name').fill('좁은 화면 편집')
        self.assertEqual(self.state()['characters'][0]['name'],'좁은 화면 편집')
        self.season(7)
        self.assertEqual(self.field('person-season','role').input_value(),'역할 7')
        self.page.screenshot(path=str(ARTIFACTS / 'mobile-person.png'),full_page=True)
        self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'),392)

    def test_event_time_space_person_views_and_bidirectional_links(self):
        self.seed()
        self.tab('events')
        self.assertEqual(self.page.locator('[data-action="select-event"]').count(),3)
        self.action('select-event',id='e1').click()
        self.field('event','title').fill('세 보기에서 공유하는 제목')
        self.assertEqual(self.field('event','timeLabel').input_value(),'')
        self.field('event','zoneId').select_option('z1')
        self.page.locator('[data-bind="participant-role"][data-person="c1"]').fill('현장 목격자')
        self.assertEqual(self.state()['events'][0]['participantRoles']['c1'],'현장 목격자')
        self.action('event-view',value='space').click()
        self.page.locator('[data-event-filter]').select_option('p1')
        self.action('select-event',id='e1').click()
        self.assertEqual(self.field('event','title').input_value(),'세 보기에서 공유하는 제목')
        self.action('event-view',value='person').click()
        self.page.locator('[data-event-filter]').select_option('c1')
        self.assertEqual(self.page.locator('[data-action="select-event"]').count(),2)
        self.action('select-event',id='e1').click()
        self.assertEqual(self.field('event','title').input_value(),'세 보기에서 공유하는 제목')
        self.page.locator('[data-event-filter]').select_option('c2')
        self.assertEqual(self.page.locator('[data-action="select-event"]').count(),1)
        self.assertTrue(self.action('select-event',id='e3').is_visible())
        self.action('event-view',value='time').click()
        self.action('select-event',id='e1').click()
        self.page.screenshot(path=str(ARTIFACTS / 'desktop-event.png'), full_page=True)
        self.action('jump-person',id='c1').click()
        self.assertEqual(self.field('person','name').input_value(),'검증 공통 인물')
        self.tab('events')
        self.action('select-event',id='e1').click()
        self.action('jump-place',id='p1').click()
        self.assertEqual(self.field('place','name').input_value(),'검증 장소')
        self.assertTrue(self.page.locator('[data-archive-plan][data-plan-season="1"]').is_visible())
        self.tab('events')
        self.action('select-event',id='e1').click()
        self.action('jump-group',id='g1').click()
        self.assertEqual(self.field('group','name').input_value(),'검증 집단')

    def test_character_matrix_status_search_and_global_edit_undo(self):
        self.seed()
        self.tab('people')
        self.action('people-view',value='compare').click()
        self.assertEqual(self.page.locator('[data-action="compare-cell"][data-id="c1"]').count(),7)
        self.action('compare-cell',id='c1',season='6').click()
        self.assertEqual(self.field('person-season','role').input_value(),'역할 6')
        self.field('person','status').select_option('confirmed')
        self.assertEqual(self.state()['characters'][0]['status'],'confirmed')
        self.page.locator('[data-status-filter]').select_option('confirmed')
        self.assertEqual(self.page.locator('[data-action="select-person"]').count(),1)
        self.page.locator('[data-search]').fill('존재하지않는검색어')
        self.assertEqual(self.page.locator('[data-action="select-person"]').count(),0)
        self.page.locator('[data-search]').fill('검증')
        self.assertEqual(self.page.locator('[data-action="select-person"]').count(),1)
        self.field('person','name').fill('이름 변경 후 편집 취소')
        self.assertTrue(self.action('undo').is_enabled())
        self.action('undo').click()
        self.assertEqual(self.state()['characters'][0]['name'],'검증 공통 인물')
        self.action('redo').click()
        self.assertEqual(self.state()['characters'][0]['name'],'이름 변경 후 편집 취소')
        self.page.locator('[data-search]').fill('')
        self.page.screenshot(path=str(ARTIFACTS / 'desktop-matrix.png'),full_page=True)

    def test_storage_failure_reported_and_unsaved_data_exportable(self):
        self.seed()
        self.tab('people')
        self.action('select-person',id='c1').click()
        self.page.evaluate("""() => { window.originalSetItem=Storage.prototype.setItem; Storage.prototype.setItem=function(k,v){if(k===ArchiveData.KEYS.current)throw new DOMException('test quota','QuotaExceededError'); return window.originalSetItem.call(this,k,v);}; }""")
        self.field('person','name').fill('저장 실패 시 백업할 이름')
        self.assertIn('저장 실패',self.page.locator('#save-state').inner_text())
        self.assertTrue(self.page.locator('#storage-alert').is_visible())
        self.assertEqual(self.state()['characters'][0]['name'],'검증 공통 인물')
        with self.page.expect_download() as info:
            self.action('export').click()
        exported=json.loads(Path(info.value.path()).read_text())
        self.assertEqual(exported['characters'][0]['name'],'저장 실패 시 백업할 이름')
        self.page.evaluate('() => { Storage.prototype.setItem=window.originalSetItem; }')
        self.field('person','notes').fill('저장 공간 복구 후 다시 저장')
        self.assertEqual(self.state()['characters'][0]['name'],'저장 실패 시 백업할 이름')
        self.assertEqual(self.page.locator('#save-state').inner_text(),'자동 저장됨')

    def test_multitab_conflict_does_not_overwrite_other_tab(self):
        self.seed()
        self.tab('people')
        self.action('select-person',id='c1').click()
        other=self.context.new_page()
        other.goto(self.url)
        other.locator('[data-action="tab"][data-tab="people"]').first.click()
        other.locator('[data-action="select-person"][data-id="c1"]').click()
        other.locator('[data-bind="person"][data-field="name"]').fill('다른 창에서 저장')
        self.page.wait_for_function("document.getElementById('save-state').textContent.includes('다른 창')")
        self.assertTrue(self.field('person','name').is_disabled())
        self.assertEqual(self.state()['characters'][0]['name'],'다른 창에서 저장')
        other.close()

    def test_corrupted_current_data_is_preserved_for_repair(self):
        raw='{broken-json'
        self.page.evaluate('(raw)=>localStorage.setItem(ArchiveData.KEYS.current,raw)',raw)
        self.page.reload()
        self.assertTrue(self.page.locator('.fatal-error').is_visible())
        self.assertEqual(self.page.evaluate('localStorage.getItem(ArchiveData.KEYS.current)'),raw)
        with self.page.expect_download() as info:
            self.page.locator('#download-raw').click()
        self.assertEqual(Path(info.value.path()).read_text(),raw)

    def test_global_plan_undo_restores_event_zone_link(self):
        self.seed()
        self.open_place(1)
        self.page.locator('[data-plan-zone="z1"]').click()
        self.plan_action('delete').click()
        self.assertEqual(self.state()['events'][0]['zoneId'],'')
        self.action('undo').click()
        restored=self.state()
        self.assertEqual(restored['events'][0]['zoneId'],'z1')
        self.assertEqual(restored['locations'][0]['seasonStates']['1']['plan'][0]['id'],'z1')
        self.action('redo').click()
        self.assertEqual(self.state()['events'][0]['zoneId'],'')


class RecordingResult(unittest.TextTestResult):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.checks = {}

    def addSuccess(self, test):
        self.checks[str(test)] = 'passed'
        super().addSuccess(test)

    def addFailure(self, test, err):
        self.checks[str(test)] = 'failed'
        super().addFailure(test, err)

    def addError(self, test, err):
        self.checks[str(test)] = 'error'
        super().addError(test, err)

    def addSkip(self, test, reason):
        self.checks[str(test)] = 'skipped: ' + reason
        super().addSkip(test, reason)


if __name__ == '__main__':
    started = time.monotonic()
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(BrowserAcceptance)
    result = unittest.TextTestRunner(verbosity=2, resultclass=RecordingResult).run(suite)
    report = dict(
        executed_at_utc=datetime.now(timezone.utc).isoformat(),
        runner='Python unittest + Playwright, Chromium headless',
        tested_site_dir=str(SITE_ROOT),
        tests_run=result.testsRun,
        passed=sum(v == 'passed' for v in result.checks.values()),
        failures=len(result.failures), errors=len(result.errors), skipped=len(result.skipped),
        duration_seconds=round(time.monotonic() - started, 3), checks=result.checks,
        isolation='Ephemeral loopback HTTP server; separate temporary browser context per test; synthetic fixture only.',
        manual_review='Screenshots reviewed separately. Physical Windows Chrome/Edge checks not performed.',
    )
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    (ARTIFACTS / 'browser-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    sys.exit(0 if result.wasSuccessful() else 1)
