import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, statSync} from 'node:fs';
import {
  BOOKING_URL, COPY, FAQ, MAX_USER_CHARS, MARGIN, POSES, clampPosition, defaultPosition, faqAnswer, failureMessage,
  initialPose, languageOf, leftOf, linkParts, parsePosition, poseOf, poseReducer, snapPosition,
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

test('poses: thinking while waiting, dancing for the demo link, victory, sleep and wake', () => {
  let state = initialPose;
  assert.equal(poseOf(state), 'idle');
  state = poseReducer(state, 'send'); assert.equal(poseOf(state), 'thinking');
  assert.equal(poseOf(poseReducer(state, 'idle-timeout')), 'thinking'); // never sleeps while waiting
  state = poseReducer(state, 'answer'); assert.equal(poseOf(state), 'victory');
  state = poseReducer(state, 'victory-end'); assert.equal(poseOf(state), 'idle');
  state = poseReducer(state, 'idle-timeout'); assert.equal(poseOf(state), 'sleeping');
  state = poseReducer(state, 'activity'); assert.equal(poseOf(state), 'idle');
  state = poseReducer(state, 'dance'); assert.equal(poseOf(state), 'dancing');
  assert.equal(poseOf(poseReducer(state, 'send')), 'thinking');
  state = poseReducer(state, 'dance-end'); assert.equal(poseOf(state), 'idle');
  assert.equal(poseOf(poseReducer(poseReducer(initialPose, 'send'), 'fail')), 'idle');
  for (const pose of POSES) for (const size of [128, 256]) assert.ok(statSync(new URL(`assets/site-cat/cat-${pose}@${size}.webp`, root)).size > 1000);
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
  const bytes = ['site-cat-loader.js', 'site-cat.js', 'site-cat-model.mjs', 'site-cat.css'].reduce((sum, file) => sum + statSync(new URL(file, root)).size, 0);
  assert.ok(bytes < 30 * 1024, `${bytes} bytes`);
  const widget = readFileSync(new URL('site-cat.js', root), 'utf8');
  assert.doesNotMatch(widget, /innerHTML|sessionStorage|document\.cookie/);
  assert.match(widget, /credentials: 'omit'/);
});
