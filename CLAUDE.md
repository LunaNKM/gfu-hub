# GFU Hub AI Working Notes

## 브랜드 관리 탭

`/brands` 는 별도 앱(gfutures_operation_system)에서 통째로 옮겨온 화면이며,
브랜드 · 인플루언서 CRM · 숨긴 브랜드를 하위 탭으로 갖는다. 나머지 허브 화면과
전제가 다르니 손대기 전에 아래를 알고 있어야 한다.

- 스타일은 Tailwind 가 아니라 `src/app/(dashboard)/brands/brands.css` 의 시맨틱
  클래스다. 이 시트는 원본 `globals.css` 를 전부 `.brand-mgmt` 스코프로 감싼
  것이므로, 새 규칙을 넣을 때도 반드시 `.brand-mgmt` 하위로 작성한다. 스코프를
  벗기면 허브 전체의 버튼·폰트·리셋이 함께 바뀐다.
- 페이지 최상위 요소의 `brand-mgmt` 클래스를 지우면 화면 전체 스타일이 죽는다.
- 인증은 `(dashboard)/layout.tsx` 가 담당한다. 이 페이지 안에서 로그인 UI 를
  다시 만들지 않는다.
- `/share/[token]` 은 로그인 없이 열리는 공개 페이지라 인증 그룹 밖에 있다.
  같은 `brands.css` 를 쓰므로 역시 `.brand-mgmt` 래퍼가 필요하다.
- Firestore 컬렉션: `brands`, `shareLinks`(+ `edits`, `settings/concepts`).

## 검증

기본 검증 명령은 다음과 같다.

- `npm run verify` (lint + build)
