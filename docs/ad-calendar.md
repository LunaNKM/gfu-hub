# 광고 캘린더 — 설계 메모

기존 `앱 런처` 탭을 대체하는 화면. 미디어믹스 기준으로 브랜드별 캠페인 일정과
매체별 목표 · 마크업 제외 일예산을 달력에 표시한다.

목업: [docs/mockups/ad-calendar.html](mockups/ad-calendar.html) (브라우저로 직접 열면 됨)

## 확정된 것

| 항목 | 결정 |
| --- | --- |
| 탭 | `앱 런처`(`/apps`) 제거 → `광고 캘린더`(`/calendar`) 신설 |
| 일예산 기준 | **JP 넷(¥)** = `JP예산(마크업제외) ÷ 산정일수`. 화면에서 ₩ 넷으로 토글 가능, 마크업 포함 금액은 표기하지 않음 |
| 브랜드 | 광고 캘린더 **전용 브랜드 목록**을 따로 둔다. 기존 `brands` 컬렉션(브랜드 관리 탭)과 분리 |
| 주 시작 | 월요일 (미디어믹스 `JP_総合캘린더` 시트와 동일) |

### 브랜드를 분리하는 이유

`brands` 는 브랜드사 공유 · 컨셉 · 공유 링크용 문서라 스키마 전제가 다르고,
`/share/[token]` 을 통해 비로그인 방문자에게도 열리는 문서가 딸려 있다.
광고 캘린더는 광고주(매체 집행 단위)만 알면 되고 색상 · 통화 · 마크업률 같은
집행 메타가 필요하므로 별도 컬렉션이 맞다.

나중에 두 목록을 이어야 하면 `linkedBrandId` 로 느슨하게 참조만 건다
(필수 필드로 만들지 않는다).

## 데이터 모델

3계층으로 나눈다. 목업의 `BRANDS` / `CAMPAIGNS` / `lines` 가 그대로 이 구조다.

```
adCalendarBrands/{brandId}
  name           string   // '위시컴퍼니'
  short          string   // 'WISH' — 달력 바에 붙는 약칭
  color          string   // '#3b82f6'
  market         string   // 'JP'
  markupRate     number   // 0.15 (표시용. 일예산 계산에는 쓰지 않음)
  order          number
  archived       boolean
  linkedBrandId  string?  // 브랜드 관리 탭 brands 문서 (선택)

adCalendarCampaigns/{campaignId}
  brandId        string
  name           string   // '3분기 메가와리'
  channel        string   // 'Qoo10' | '자사몰' | ...
  startDate      string   // 'YYYY-MM-DD'
  endDate        string
  months         string[] // ['2026-08','2026-09'] — 월별 조회용 (아래 참고)
  color          string
  targetRoas     number?
  source         { fileName, sheetName, importedAt }   // 어느 믹스안에서 왔는지
  lines          [{
    media          string  // 's-meta' | 'meta' | 'X' | 'TikTok'
    objective      string  // 'Purchase (+Catalog)'
    target         string
    budgetJpNet    number  // 마크업 제외 JP
    budgetKrNet    number  // 마크업 제외 KR
    days           number  // 일예산 산정일수
    startDate      string? // 라인이 캠페인 기간과 다를 때만
    endDate        string?
  }]
```

`lines` 를 서브컬렉션이 아닌 배열로 두는 이유: 한 캠페인당 최대 10줄 안팎이고
항상 캠페인과 함께 읽고 함께 저장하기 때문. 문서 크기 걱정할 수준이 아니다.

### 월별 조회

Firestore 는 `startDate <= 월말 && endDate >= 월초` 처럼 두 필드에 범위 조건을
못 건다. 저장 시점에 캠페인이 걸치는 달을 `months` 배열로 펼쳐 두고
`where('months', 'array-contains', '2026-08')` 로 읽는다.

정렬과 브랜드 필터는 클라이언트에서 한다. array-contains 에 `orderBy` 나 `in` 을
붙이면 복합 인덱스를 배포해야 하는데, 한 달 캠페인은 많아야 수십 건이라
그럴 이유가 없다. 단일 필드 인덱스는 Firestore 가 자동으로 만든다.

### 규칙

둘 다 스태프 전용. 공유 링크 대상이 아니다.

```
match /adCalendarBrands/{brandId}   { allow read, write: if isGfutures(); }
match /adCalendarCampaigns/{campId} { allow read, write: if isGfutures(); }
```

## 화면 구성 (목업 기준)

- **브랜드 바** — 브랜드 칩 다중 선택 + 그 달 매체비, `＋ 브랜드 추가`
- **요약 타일 4** — 이 달 캠페인 / 월 매체비(넷) / 선택일 설정 일예산 / 피크 일예산
- **월 뷰** — 캠페인이 기간만큼 뻗는 바, 날짜 칸마다 그날 일예산 합계
- **브랜드 뷰** — 브랜드가 행, 1~31일이 열인 스윔레인. 브랜드가 늘어도 세로로만 자람
- **목록 뷰** — 브랜드 그룹 + 캠페인별 라인 표
- **사이드 패널** — 선택한 날 진행 캠페인을 브랜드별로 묶어 매체 · 목표 · 타겟 · 일예산 표시
- **경고 배너** — `라인 산정일수 ≠ 캠페인 기간` 인 캠페인 자동 검출

## 남은 결정

1. **라인별 실제 기간** — 3분기 메가와리(8/15~9/9, 26일 표기)의 일예산이 라인별로
   17일 / 13일 / 9일 기준으로 나뉘어 있다. 26일로 다시 나누면 ATC 기준 ¥41,141 → ¥26,900 으로
   크게 달라져 임의로 정하지 않았다. 라인별 시작·종료일이 필요하다.
   (7월 큐텐LIVE 행들도 동일)
2. **데이터 소스** — xlsx 업로드 파싱 / Firestore 직접 입력 / 구글 시트 연동 중 무엇으로 채울지.
