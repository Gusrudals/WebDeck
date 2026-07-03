# 백로그 — Plan 3b 이후 잔여 항목

Plan 3b(편집 상호작용 + 저장)까지 완료된 시점의 잔여 항목.

## 편집 기능 확장 (추후)

- 텍스트 편집·INPUT 포커스 중 Ctrl+S/Ctrl+Shift+S가 preventDefault 없이 무시되어 브라우저 저장 대화상자가 뜸 — 저장 키만 조기 preventDefault 검토
- handleStart의 unknown 템플릿 key가 조용히 no-op — OPEN_ERROR 피드백 추가 검토
- vite.config fs.allow 축소 시 ['.', '../templates'] 형태 필수(단독 '../templates'는 dev를 깨뜨림) + npm run dev 스모크 동반
- 시작 화면 템플릿 카드에 미리보기 썸네일 (현재는 라벨·설명 텍스트만)
- 회사 커스텀 템플릿 등록 (현재는 빌드 시 templates/ 내장 3종 고정 — 파일 추가 후 재빌드 필요)
- 인라인 서식(굵게/크기/색)을 편집 모드 밖에서도 적용 (세로 정렬 등 박스 수준은 지원됨 — 저장된 html 변환 필요)
- 다중 이동에도 스냅 가이드 적용 (단일 이동·단일 리사이즈는 지원됨)
- 슬라이드 순서 드래그 시 삽입 위치 인디케이터 표시
- barrel `index.ts` 없음 — 딥 임포트 필요, UI 규모가 커지면 추가 검토
- 제스처(드래그/리사이즈) 중 전역 단축키 미차단 — Delete/Ctrl+Z가 끼어들면 pointerup의 스테일 커밋이 되돌림 (Escape 제스처 취소와 함께 검토)
- 붙여넣기 반복 시 오프셋 비누적(+16 고정) — PPT는 누적 오프셋
- undo/redo 시 영향받은 슬라이드로 자동 이동 없음
- 열기 시점 checkRoundTrip 사전 경고 검토 (열자마자 저장 불가인 문서의 안내 개선)
- saveError를 문자열 프리픽스 분기 대신 구조화된 타입으로
- dangerouslySetInnerHTML XSS 표면은 로컬 파일 도구 맥락(사용자가 직접 연 파일)에서 수용 — 사내망 호스팅 확장 시 재평가
- 외부(AI 생성) 문서의 목록 CSS 불일치 — 번들 템플릿엔 ul/ol 규칙을 미러했으나 기존 외부 문서는 UA 기본 여백으로 렌더됨. Plan 6 "저장 시 런타임 최신화 정책"과 연계 해결
- 그림자·채우기 무변경 클릭의 no-op APPLY_DOC — 분배·세로정렬처럼 값 비교 가드로 undo 오염 방지 (PropertiesPanel.applyStyle)
- 툴바 크기 입력 Escape 드래프트 폐기 없음 (패널 NumberField와 비대칭)
- 같은 요소 드래그 후 수치 입력 드래프트 잔존 UX 모호성 (요소별 key는 선택 변경만 커버)
- SNAP_THRESHOLD(6) 모델 좌표 고정 — 줌 배율에 따라 화면 체감 임계가 변함 (줌 보정 검토)
- 줌≠fit에서 스크롤바 클릭이 선택 해제를 유발
- 세로 정렬 텍스트 박스는 편집 중 정렬이 일시 무시됨 (blur 시 복귀, 데이터 무영향)
- 제스처 중 Ctrl+휠 줌 변경 시 이동량 배율 왜곡 — 기존 "제스처 중 전역 단축키" 항목과 동류
- Toolbar.tsx ~300줄 — 텍스트 서식 그룹 하위 컴포넌트 분리 검토 (스펙 §9)
- 테스트 갭 이월: 팝오버 pointerdown 셀렉션 보존 경로, 세로 분배 payload, 줄간격 select save/restore 릴레이, 코너 핸들 동시 스냅, 그림자 강하게, 투명도 onBlur 커밋

## 소소한 정리 (기회가 될 때)

- 검증기 `@import` 검사가 단순 부분 문자열 매치 (CSS 주석 내 오탐 가능, v1 허용)
- CLI 내부 오류 출력에서 비-Error throw 시 `undefined` 출력 가능
