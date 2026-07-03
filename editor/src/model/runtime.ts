import type { DeckDoc } from './types.ts'

export const RUNTIME_VERSION = 2

/** 문서에 내장되는 뷰어 런타임 전체 — 템플릿 3종과 바이트 단위 동일해야 한다 (templates.test.ts가 강제) */
export const RUNTIME_SCRIPT = `<script data-webdeck-runtime="2">
(function () {
  'use strict';
  document.querySelectorAll('.slide').forEach(function (slide) {
    if (slide.dataset.bg) slide.style.background = slide.dataset.bg;
  });
  var deck = document.querySelector('.deck');
  if (!deck) return;
  var slideWidth = Number(deck.dataset.slideWidth) || 1280;
  var slideHeight = Number(deck.dataset.slideHeight) || 720;
  function fit() {
    deck.style.zoom = Math.min(1, (window.innerWidth - 48) / slideWidth);
  }
  window.addEventListener('resize', fit);
  window.addEventListener('beforeprint', function () { deck.style.zoom = 1; });
  window.addEventListener('afterprint', fit);
  fit();

  var slides = Array.prototype.slice.call(deck.querySelectorAll('.slide'));
  if (slides.length === 0) return;

  var style = document.createElement('style');
  style.textContent =
    '.wd-present-btn { position: fixed; top: 16px; right: 16px; z-index: 9000;' +
    ' font: 14px sans-serif; padding: 8px 16px; border: none; border-radius: 6px;' +
    ' background: rgba(17, 24, 39, 0.8); color: #fff; cursor: pointer; opacity: 0.35; }\\n' +
    '.wd-present-btn:hover { opacity: 1; }\\n' +
    '.wd-stage { position: fixed; inset: 0; z-index: 9500; background: #000; overflow: hidden; }\\n' +
    '.wd-stage .slide { position: absolute; left: 50%; top: 50%; margin: 0; box-shadow: none;' +
    ' transform: translate(-50%, -50%) scale(var(--wd-scale, 1)); }\\n' +
    '.wd-enter-fade { animation: wd-fade 0.35s ease both; }\\n' +
    '@keyframes wd-fade { from { opacity: 0; } to { opacity: 1; } }\\n' +
    '.wd-enter-push-next { animation: wd-push-next 0.3s ease both; }\\n' +
    '@keyframes wd-push-next { from { transform: translate(calc(-50% + 100vw), -50%) scale(var(--wd-scale, 1)); }' +
    ' to { transform: translate(-50%, -50%) scale(var(--wd-scale, 1)); } }\\n' +
    '.wd-enter-push-prev { animation: wd-push-prev 0.3s ease both; }\\n' +
    '@keyframes wd-push-prev { from { transform: translate(calc(-50% - 100vw), -50%) scale(var(--wd-scale, 1)); }' +
    ' to { transform: translate(-50%, -50%) scale(var(--wd-scale, 1)); } }\\n' +
    '@media print { .wd-present-btn, .wd-stage { display: none; } }';
  document.head.appendChild(style);

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'wd-present-btn';
  btn.textContent = '발표';
  document.body.appendChild(btn);

  var stage = null;
  var current = 0;

  function render(direction) {
    var src = slides[current];
    var clone = src.cloneNode(true);
    var scale = Math.min(window.innerWidth / slideWidth, window.innerHeight / slideHeight);
    clone.style.width = slideWidth + 'px';
    clone.style.height = slideHeight + 'px';
    clone.style.setProperty('--wd-scale', String(scale));
    var t = src.getAttribute('data-transition');
    if (direction > 0 && t === 'push') clone.classList.add('wd-enter-push-next');
    if (direction < 0 && t === 'push') clone.classList.add('wd-enter-push-prev');
    if (direction !== 0 && t === 'fade') clone.classList.add('wd-enter-fade');
    stage.textContent = '';
    stage.appendChild(clone);
  }

  function enter() {
    if (stage) return;
    stage = document.createElement('div');
    stage.className = 'wd-stage';
    stage.addEventListener('click', function () { move(1); });
    document.body.appendChild(stage);
    btn.style.display = 'none';
    current = 0;
    render(0);
    if (document.documentElement.requestFullscreen) {
      var p = document.documentElement.requestFullscreen();
      if (p && p.catch) p.catch(function () {});
    }
  }

  function exit() {
    if (!stage) return;
    stage.remove();
    stage = null;
    btn.style.display = '';
    if (document.fullscreenElement && document.exitFullscreen) {
      var p = document.exitFullscreen();
      if (p && p.catch) p.catch(function () {});
    }
  }

  function move(delta) {
    var next = Math.max(0, Math.min(slides.length - 1, current + delta));
    if (next === current) return;
    var direction = next > current ? 1 : -1;
    current = next;
    render(direction);
  }

  btn.addEventListener('click', enter);
  document.addEventListener('fullscreenchange', function () {
    if (!document.fullscreenElement && stage) exit();
  });
  window.addEventListener('resize', function () {
    if (stage) render(0);
  });
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (!stage) {
      if (e.key === 'p' || e.key === 'P') { e.preventDefault(); enter(); }
      return;
    }
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Home') { e.preventDefault(); move(-slides.length); }
    else if (e.key === 'End') { e.preventDefault(); move(slides.length); }
    else if (e.key === 'Escape') { e.preventDefault(); exit(); }
  });
})();
</script>`

const V1_SIGNATURES = ['dataset.slideWidth', 'beforeprint']

/** WebDeck 런타임 스크립트 판정 — 마커 우선, 없으면 v1 시그니처 휴리스틱 */
function isRuntimeScript(el: Element): boolean {
  if (el.hasAttribute('data-webdeck-runtime')) return true
  const text = el.textContent ?? ''
  return V1_SIGNATURES.every((sig) => text.includes(sig))
}

/**
 * bodyScript의 런타임을 최신본으로 정규화한다 (문서 열기 시 1회 — 스펙 §2.3).
 * 인식된 런타임은 첫 자리에 1개로 교체, 그 외 스크립트는 원문 보존.
 * 스크립트가 하나도 없으면 런타임을 추가. 변경 없으면 같은 객체 반환(멱등).
 */
export function normalizeRuntime(doc: DeckDoc): DeckDoc {
  const dom = new DOMParser().parseFromString(`<body>${doc.bodyScript}</body>`, 'text/html')
  const scripts = Array.from(dom.body.querySelectorAll('script'))
  const parts: string[] = []
  let replaced = false
  for (const s of scripts) {
    if (isRuntimeScript(s)) {
      if (!replaced) {
        parts.push(RUNTIME_SCRIPT)
        replaced = true
      }
    } else {
      parts.push(s.outerHTML)
    }
  }
  if (!replaced && scripts.length === 0) parts.push(RUNTIME_SCRIPT)
  const bodyScript = parts.join('\n')
  return bodyScript === doc.bodyScript ? doc : { ...doc, bodyScript }
}
