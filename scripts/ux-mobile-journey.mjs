import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

// Only contains geometry, booleans and fixed test labels: no message text,
// collector identifiers, URLs, tokens, or authenticated screenshots.
export function verifyUxMetrics(metrics, { phase, mode = 'page' } = {}) {
  assert.match(phase, /^[a-z][a-z0-9-]{0,49}$/);
  assert.ok(Number.isFinite(metrics.width) && metrics.width >= 320, 'Invalid UX viewport');
  assert.ok(Number.isFinite(metrics.overflow), 'Missing UX overflow measurement');
  assert.ok(['page','composer','outsider','closed'].includes(mode), 'Unknown UX inspection mode');
  assert.ok(metrics.overflow <= 2, 'UX horizontal overflow in ' + phase);
  if (mode === 'composer') {
    assert.equal(metrics.composerVisible, true, 'Case composer not visible in ' + phase);
    assert.equal(metrics.composerEnabled, true, 'Case composer cannot accept a message in ' + phase);
    assert.equal(metrics.guideVisible, true, 'Exchange next-step guide missing in ' + phase);
    assert.equal(metrics.editorNamed, true, 'Message editor lacks an accessible name in ' + phase);
    assert.ok(metrics.buttonHeight >= 44 && metrics.buttonWidth >= 44, 'Send target is too small in ' + phase);
    assert.ok(metrics.editorFontSize >= 16, 'Message editor may trigger mobile input zoom in ' + phase);
  } else if (mode === 'outsider') {
    assert.equal(metrics.composerVisible, false, 'Outsider sees case composer in ' + phase);
    assert.equal(metrics.caseActionCount, 0, 'Outsider sees exchange actions in ' + phase);
    assert.equal(metrics.unavailableVisible, true, 'Outsider access-denied state missing in ' + phase);
  } else if (mode === 'closed') {
    assert.equal(metrics.composerVisible, false, 'Completed exchange still allows messages in ' + phase);
    assert.equal(metrics.guideVisible, true, 'Completed exchange guide missing in ' + phase);
    assert.equal(metrics.guideClosed, true, 'Completed exchange does not say Closed in ' + phase);
  }
  return Object.freeze({
    phase, mode,
    viewport: metrics.width,
    horizontalOverflow: metrics.overflow,
    guideVisible: !!metrics.guideVisible,
    composerVisible: !!metrics.composerVisible,
    minimumComposerButtonHeight: metrics.buttonHeight || null
  });
}

export async function inspectConversationUx(page, { phase, mode = 'page' }) {
  const metrics = await page.evaluate(() => {
    const visible = el => {
      if (!el) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const composer = document.querySelector('#bc-msg-form');
    const editor = document.querySelector('#bc-msg-form textarea');
    const guide = document.querySelector('section[aria-label="Exchange next step"], [role="region"][aria-label="Exchange next step"]');
    const action = composer?.querySelector('button[type="submit"]');
    const buttons = [...document.querySelectorAll('[data-thread-case-action]')];
    const unavailable = [...document.querySelectorAll('h1,h2,h3')].some(el => visible(el) && el.textContent?.trim() === 'Conversation unavailable');
    return {
      width: document.documentElement.clientWidth,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      composerVisible: visible(composer),
      composerEnabled: visible(editor) && !editor.disabled && !editor.readOnly,
      editorNamed: !!editor?.getAttribute('aria-label')?.trim(),
      editorFontSize: editor ? parseFloat(getComputedStyle(editor).fontSize) : null,
      guideVisible: visible(guide),
      guideClosed: !!(visible(guide) && /\bClosed\b/i.test(guide.textContent || '')),
      caseActionCount: buttons.filter(visible).length,
      unavailableVisible: unavailable,
      buttonHeight: visible(action) ? action.getBoundingClientRect().height : null,
      buttonWidth: visible(action) ? action.getBoundingClientRect().width : null
    };
  });
  if (mode === 'composer' || mode === 'closed') {
    // Resolve the same accessible *active* guide used by the canonical
    // lifecycle assertions, rather than an unrelated DOM copy.
    const activeGuide = page.getByRole('region', { name: 'Exchange next step' });
    metrics.guideVisible = await activeGuide.isVisible();
    if (mode === 'closed' && metrics.guideVisible) {
      metrics.guideClosed = await activeGuide.locator('.bc-guide-heading .bc-pill')
        .filter({ hasText: /^Closed$/ }).isVisible();
    }
  }
  try {
    return verifyUxMetrics(metrics, { phase, mode });
  } catch {
    // Safe telemetry only: values are fixed labels, geometry and boolean flags.
    // Never include DOM text, URLs, credentials, messages or browser errors.
    const summary = 'UX '+phase+' metrics: width='+metrics.width+
      ' overflow='+metrics.overflow+' composer='+!!metrics.composerVisible+
      ' guide='+!!metrics.guideVisible+' closed='+!!metrics.guideClosed+
       ' unavailable='+!!metrics.unavailableVisible+
       ' actions='+metrics.caseActionCount+
       ' editorNamed='+!!metrics.editorNamed+' editorFont='+metrics.editorFontSize+
       ' sendHeight='+metrics.buttonHeight+' sendWidth='+metrics.buttonWidth;
    const error = new Error(summary);
    error.code = 'BC_UX_SAFE_METRICS';
    throw error;
  }
}

// Only call against wholly synthetic, locally mocked test sessions. Do not call
// in hosted staging: screenshots/traces there may contain credentials or messages.
export async function captureSyntheticUxScreenshot(page, phase) {
  assert.match(phase, /^[a-z][a-z0-9-]{0,49}$/);
  assert.equal(process.env.BC_UX_SYNTHETIC_ONLY, '1', 'Screenshot capture requires synthetic-only mode');
  await mkdir('ux-report/synthetic', { recursive: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const pathname = 'ux-report/synthetic/' + phase + '.png';
  const first = await page.screenshot({ path: pathname, animations: 'disabled' });
  const second = await page.screenshot({ animations: 'disabled' });
  assert.ok(first.equals(second), 'Synthetic screenshot is unstable in '+phase);
  return { phase, screenshot: pathname, stable: first.equals(second) };
}
