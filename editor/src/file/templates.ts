/** 리포의 templates/*.html을 빌드 시 번들에 원문으로 내장한다 (정적 SPA — 런타임 fetch 없음) */
const files = import.meta.glob('../../../templates/*.html', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const LABELS: Record<string, { label: string; description: string }> = {
  minimal: { label: '빈 문서', description: '슬라이드 1장으로 시작' },
  'business-report': { label: '업무 보고', description: '표지·목차·본문을 갖춘 보고서' },
  'project-proposal': { label: '프로젝트 제안', description: '제안 개요와 로드맵 구성' },
}

export interface Template {
  key: string
  label: string
  description: string
  html: string
}

export const TEMPLATES: Template[] = Object.entries(files)
  .map(([path, html]) => {
    const key = path.replace(/^.*\//, '').replace(/\.html$/, '')
    const meta = LABELS[key] ?? { label: key, description: '' }
    return { key, label: meta.label, description: meta.description, html }
  })
  .sort((a, b) => {
    if (a.key === 'minimal') return -1
    if (b.key === 'minimal') return 1
    return a.label.localeCompare(b.label, 'ko')
  })
