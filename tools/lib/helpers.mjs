export const DEFAULT_SLIDE = `<section class="slide" data-bg="#ffffff">
  <div class="el el-text" style="left:96px; top:80px; width:1088px; height:120px;"><p>제목</p></div>
</section>`

export function makeDoc({
  version = '1',
  deckAttrs = 'data-slide-width="1280" data-slide-height="720"',
  slides = DEFAULT_SLIDE,
  extraHead = '',
} = {}) {
  const versionAttr = version === null ? '' : ` data-webdeck-version="${version}"`
  return `<!DOCTYPE html>
<html lang="ko"${versionAttr}>
<head>
<meta charset="utf-8">
<title>테스트 문서</title>
<style>.el { position: absolute; }</style>
${extraHead}
</head>
<body>
<main class="deck" ${deckAttrs}>
${slides}
</main>
</body>
</html>`
}
