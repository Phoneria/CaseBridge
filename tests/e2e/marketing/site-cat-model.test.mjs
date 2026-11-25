import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, statSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {
  BOOKING_URL, COPY, CROSSFADE_MS, CYCLE_MS, FAQ, MAX_USER_CHARS, MARGIN, POSES, SECTION_POSES, SLEEP_AFTER_MS,
  clampPosition, cycleFor, defaultPosition, faqAnswer, failureMessage, initialPose, languageOf, leftOf, linkParts,
  parsePosition, poseOf, poseReducer, snapPosition, visibleSection,
} from '../../../web-page/site-cat-model.mjs';

const root = new URL('../../../web-page/', import.meta.url);

test('the four quick questions answer in Turkish and English from the static FAQ', () => {
  assert.deepEqual(FAQ.map(item => item.q.tr), ['Neler yapabiliyor?', 'Verilerim güvende mi?', 'Yapay zekâ nasıl çalışıyor?', 'Demo nasıl alırım?']);
  for (const item of FAQ) {
    for (const lang of ['tr', 'en']) {
      assert.ok(item.q[lang] && faqAnswer(item.id, lang).length > 60, `${item.id}/${lang}`);
      // No invented numbers, prices or certifications in the static answers.
      assert.doesNotMatch(faqAnswer(item.id, lang), /\d|₺|\$|€|ISO|SOC ?2|sertifika|certif/i);
    }
  }
  assert.equal(faqAnswer('missing', 'tr'), null);
  assert.match(COPY.tr.notice, /kişisel veya dava bilgisi paylaşmayın/);
  assert.match(COPY.en.notice, /personal or case details/);
  assert.equal(BOOKING_URL, 'https://calendar.app.google/RL4CxQFEZAuVF2xP9');
});

test('language follows ?lang= first, then the page', () => {
  assert.equal(languageOf('tr', ''), 'tr');
  assert.equal(languageOf('en', ''), 'en');
  assert.equal(languageOf('tr', '?lang=en'), 'en');
  assert.equal(languageOf('', ''), 'tr');
  assert.equal(languageOf('en-GB', ''), 'en');
});

test('the section in view picks the pose', () => {
  assert.deepEqual(SECTION_POSES, {top: 'idle', gecmis: 'researching', olasilik: 'thinking', anonim: 'working', buro: 'reading', sufle: 'courtroom', simulasyon: 'courtroom', team: 'dancing'});
  const at = id => poseOf(poseReducer(initialPose, {type: 'section', id}));
  assert.equal(poseOf(initialPose), 'idle');
  assert.equal(at('gecmis'), 'researching');
  assert.equal(at('olasilik'), 'thinking');
  assert.equal(at('anonim'), 'working');
  assert.equal(at('buro'), 'reading');
  assert.equal(at('sufle'), 'courtroom');
  assert.equal(at('simulasyon'), 'courtroom');
  assert.equal(at('team'), 'dancing');
  assert.equal(at('sss'), 'idle'); // sections outside the map count as idle
  assert.equal(visibleSection({top: 0.1, gecmis: 0.7, olasilik: 0.2}), 'gecmis');
  assert.equal(visibleSection({top: 0, gecmis: 0}), null);
  for (const pose of POSES) for (const size of [128, 256]) assert.ok(statSync(new URL(`assets/site-cat/cat-${pose}@${size}.webp`, root)).size > 1000);
  for (const pose of Object.values(SECTION_POSES)) assert.ok(POSES.includes(pose));
  assert.equal(CYCLE_MS, 10000); assert.equal(SLEEP_AFTER_MS, 60000); assert.equal(CROSSFADE_MS, 300);
});

test('staying in a section alternates every tick in a fixed order, restarting on a new section', () => {
  assert.deepEqual(cycleFor('researching'), ['researching', 'idle', 'researching', 'tea-break']);
  assert.deepEqual(cycleFor('idle'), ['idle', 'tea-break']);
  let state = poseReducer(initialPose, {type: 'section', id: 'gecmis'});
  const seen = [];
  for (let i = 0; i < 6; i++) { seen.push(poseOf(state)); state = poseReducer(state, {type: 'tick'}); }
  assert.deepEqual(seen, ['researching', 'idle', 'researching', 'tea-break', 'researching', 'idle']);
  state = poseReducer(state, {type: 'section', id: 'team'});
  assert.equal(poseOf(state), 'dancing'); // tick reset
  assert.equal(poseReducer(state, {type: 'section', id: 'team'}), state); // same section: no reset
  let hero = initialPose;
  const heroSeen = [];
  for (let i = 0; i < 4; i++) { heroSeen.push(poseOf(hero)); hero = poseReducer(hero, {type: 'tick'}); }
  assert.deepEqual(heroSeen, ['idle', 'tea-break', 'idle', 'tea-break']);
});

test('panel and visitor poses take priority: thinking, working, victory once, sleeping', () => {
  let state = poseReducer(initialPose, {type: 'section', id: 'buro'});
  state = poseReducer(state, {type: 'send'}); assert.equal(poseOf(state), 'thinking');
  assert.equal(poseOf(poseReducer(state, {type: 'idle-timeout'})), 'thinking'); // never sleeps while waiting
  state = poseReducer(state, {type: 'received'}); assert.equal(poseOf(state), 'working');
  state = poseReducer(state, {type: 'done'}); assert.equal(poseOf(state), 'reading');
  state = poseReducer(state, {type: 'demo'}); assert.equal(poseOf(state), 'victory');
  state = poseReducer(state, {type: 'victory-end'}); assert.equal(poseOf(state), 'reading');
  assert.equal(poseOf(poseReducer(state, {type: 'demo'})), 'reading'); // only once per visit
  state = poseReducer(state, {type: 'idle-timeout'}); assert.equal(poseOf(state), 'sleeping');
  state = poseReducer(state, {type: 'tick'}); assert.equal(poseOf(state), 'sleeping');
  state = poseReducer(state, {type: 'activity'}); assert.equal(poseOf(state), 'idle'); // tick 1 of the reading cycle
});

test('reduced motion: the pose changes only with the section', () => {
  let state = poseReducer(initialPose, {type: 'section', id: 'gecmis'});
  for (const event of ['tick', 'send', 'received', 'demo', 'idle-timeout']) {
    state = poseReducer(state, {type: event});
    assert.equal(poseOf(state, true), 'researching', event);
  }
  assert.equal(poseOf(poseReducer(state, {type: 'section', id: 'team'}), true), 'dancing');
});

test('position snaps to the nearest side, stays on screen and survives bad storage', () => {
  const view = {width: 1200, height: 800};
  assert.deepEqual(snapPosition(100, 300, view, 76), {side: 'left', top: 300});
  assert.deepEqual(snapPosition(900, 300, view, 76), {side: 'right', top: 300});
  assert.deepEqual(snapPosition(500, -40, view, 76), {side: 'left', top: MARGIN});
  assert.deepEqual(clampPosition({side: 'right', top: 760}, {width: 390, height: 500}, 64), {side: 'right', top: 500 - 64 - MARGIN});
  assert.deepEqual(defaultPosition(view, 76), {side: 'right', top: 800 - 76 - 2 * MARGIN});
  assert.equal(leftOf({side: 'left', top: 0}, view, 76), MARGIN);
  assert.equal(leftOf({side: 'right', top: 0}, view, 76), 1200 - 76 - MARGIN);
  assert.deepEqual(parsePosition('{"side":"left","top":120}'), {side: 'left', top: 120});
  for (const bad of [null, '', 'nope', '{"side":"up","top":1}', '{"side":"left","top":"x"}']) assert.equal(parsePosition(bad), null);
});

test('API failures map to friendly states, preferring the server text', () => {
  assert.deepEqual(failureMessage(429, {detail: 'Yavaş'}, 'tr'), {kind: 'rate_limited', text: 'Yavaş'});
  assert.equal(failureMessage(503, {code: 'busy', detail: 'Şu an yoğunuz.'}, 'tr').kind, 'busy');
  assert.equal(failureMessage(503, {code: 'unavailable'}, 'en').text, COPY.en.busy);
  assert.equal(failureMessage(422, {code: 'turn_limit'}, 'tr').kind, 'turn_limit');
  assert.equal(failureMessage(422, {detail: [{msg: 'x'}]}, 'tr').text, COPY.tr.tooLong);
  assert.equal(failureMessage(403, null, 'en').kind, 'verification');
  assert.equal(failureMessage(0, null, 'tr').text, COPY.tr.network);
  assert.equal(failureMessage(500, null, 'en').kind, 'network');
  assert.equal(MAX_USER_CHARS, 500);
});

test('only the booking link becomes a link; other text stays text', () => {
  assert.deepEqual(linkParts(`Demo: ${BOOKING_URL} teşekkürler`), [{text: 'Demo: '}, {link: BOOKING_URL}, {text: ' teşekkürler'}]);
  assert.deepEqual(linkParts('<img src=x onerror=alert(1)> https://evil.example'), [{text: '<img src=x onerror=alert(1)> https://evil.example'}]);
});

test('every marketing page lazy-loads the widget, and the bundle stays small', () => {
  for (const page of ['index.html', 'olasilik-agaci.html', 'team.html', 'timeline.html', 'investors.html', 'gorsel-kaynaklari.html']) {
    const html = readFileSync(new URL(page, root), 'utf8');
    assert.match(html, /<script src="site-cat-loader\.js\?v=[\d.]+" data-api="https:\/\/app\.casebridge\.com\.tr\/api\/public\/site-chat" defer><\/script>/, page);
  }
  // Budget "about 30 KB": readable source under 34 KB, under 15 KB as served (the server compresses).
  const files = ['site-cat-loader.js', 'site-cat.js', 'site-cat-model.mjs', 'site-cat.css'].map(file => readFileSync(new URL(file, root)));
  const bytes = files.reduce((sum, data) => sum + data.length, 0);
  const gzipped = files.reduce((sum, data) => sum + gzipSync(data, {level: 9}).length, 0);
  assert.ok(bytes < 34 * 1024, `${bytes} bytes`);
  assert.ok(gzipped < 15 * 1024, `${gzipped} gzipped bytes`);
  const widget = readFileSync(new URL('site-cat.js', root), 'utf8');
  assert.doesNotMatch(widget, /innerHTML|sessionStorage|document\.cookie/);
  assert.match(widget, /credentials: 'omit'/);
});
