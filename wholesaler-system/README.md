# 중도매인 통합관리 시스템 (Google Apps Script)

농산물 공판장 중도매인의 기초정보·거래실적·동향·채권관리를 중도매인코드와 관리 건 ID로 연결하는 업무 시스템.
현재 **1단계(데이터 정의·기초자료·통합 조회)** 까지 구현했다. 저장소의 모든 자료는 가상이다.

| 문서 | 내용 |
|---|---|
| [docs/01_설계안_v0.1.md](docs/01_설계안_v0.1.md) | 전체 설계 |
| [docs/02_1단계_구현안내.md](docs/02_1단계_구현안내.md) | 파일 역할·시트 구조·설정·배포·검증·한계·복구 |
| [docs/03_1단계_검증결과.txt](docs/03_1단계_검증결과.txt) | 로컬 검증 출력(77개 통과) |

빠른 시작: `gas/` 를 Apps Script 프로젝트에 올린 뒤 편집기에서 `setupSystem` → `loadVirtualData` → `runPipeline` → 웹앱 배포(나로 실행, 나만 접근).

로컬 검증: `node tests/run_tests.js` (Node 18+, 추가 패키지 없음) · 화면 캡처: `node tests/render_ui.js <폴더>` (Playwright 필요)
