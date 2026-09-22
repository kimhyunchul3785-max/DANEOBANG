# 단어방 디자인 시스템 — "quiet technology"

산업 제품 UI · 스위스 모더니즘 · 레트로 디지털 · 에디토리얼 대시보드를 섞은 시스템. 구현 파일: `src/app/globals.css`(토큰·컴포넌트 클래스), `src/components/Viz.tsx`(링·펄스 바·미터), `src/components/AppShell.tsx`.

## 색 (3단계)
| 역할 | 값 | 용도 |
|---|---|---|
| 배경 `--bg` | #E9E6E1 warm gray | 페이지 전체. 순백 없음 |
| 표면 `--surface` / `--surface-2` | #F3F1ED / #FAF9F6 | 모듈(카드)·입력. 테두리·그림자 없이 톤 차이로만 구분 |
| 강조 `--accent` | #E8431A orange-red | 페이지당 큰 모듈 1개, 재시험/미달/마감 임박, 제출 컨트롤. 그 외 금지 |
| 잉크 `--ink` / 차콜 `--charcoal` | #1B1A18 / #232220 | 텍스트, 선택 상태, 가로 필 모듈 |

## 타이포
- 라벨 `.lbl` : Space Grotesk 10.5px, 대문자, 자간 0.16em — TODAY · STUDENTS · SCAN QUEUE
- 큰 숫자 `.num-xl/.num-lg/.num-md` : Inter Tight 200~300, 숫자는 그래픽 요소
- 디지털 `.digital/.digital-lg` : DotGothic16 — 상태(READY/SAVED/PASS), 카운터(2/15, 01/20, D-6)에만
- 본문: Pretendard (한글)

## 레이아웃
- `.bento` 6열 그리드(모바일 2열), `.span-2/3/4/6` 로 비대칭 구성. 중요도 = 면적.
- 대형 1차 모듈(오늘 진행 %) · 강조 모듈(이번 주) · 소형 지원 모듈 3개 · 가로 필(재시험) · 목록 모듈 2개
- 모듈 반경: 대 24px, 소 18px, 상태·컨트롤 full pill. 간격 12px, 여백 넉넉히.

## 컨트롤
- `.btn-primary`(잉크 필) · `.btn-accent` · `.btn-secondary`(표면) · `.btn-ghost`(텍스트) — 모두 필 형태, 대문자 grotesk
- 카드 자체가 링크(대시보드 모듈), 선택 상태는 잉크 채움(응시 보기), 강조색은 제출·재시험에만
- 모션: 120ms 색 전환, 링/미터 320ms `.tick`, 바운스 없음

## 데이터 시각화
숫자 + 단순 형태만: `Ring`(진행/통과율), `PulseBars`(요일별 채점 수), `Meter`. 축·격자·범례 없음.
