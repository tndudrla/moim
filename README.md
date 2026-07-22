# 🍽 모심 (Mosim) — 상황 맞춤 식당 추천 AI

접대/회식 상황과 조건(장소·인원·연령대·예산·음식종류)을 고르면, **AI가 식당을 이유와 함께 추천**하고
지도·전사 법인카드 실적·현지 식문화·김영란법까지 반영하는 사내 웹앱.

> 팀 프로젝트. 기획 배경·전체 설계는 **[기획서.md](기획서.md)** 참고.

---

## 🚀 실행 방법 (30초)

**A. 그냥 열기** — `index.html` 더블클릭 (인터넷 필요: 폰트·지도 링크 CDN)

**B. 로컬 서버** (권장)
```bash
# demo/ 폴더에서
python -m http.server 5599
# 브라우저: http://localhost:5599
```

빌드·설치 없음. **순수 HTML/CSS/JS 단일 파일**(`index.html`).

---

## 📦 현재 상태 — "프론트 목업 데모"

- 화면·흐름·UX는 **완성**돼 있고, 데이터는 **전부 코드 안 샘플**(API 키 불필요).
- 즉 **껍데기는 다 됐고, 실제 데이터 소스 3곳만 연결**하면 진짜 서비스가 됨.

### 목업 → 실제로 바꿔야 할 3곳 (개발 핵심 작업)
`index.html` 안의 위치:

| 지금 (목업) | → 바꿀 것 | 코드 위치(변수/함수) |
|---|---|---|
| `RESTAURANTS` 샘플 배열 | **국내: 네이버 지역검색 / 해외: Google Places** 실호출 | `runRecommend()`의 후보 수집부 |
| `reasonFor()` 템플릿 문장 | **Claude API** 로 추천 이유 생성 | `reasonFor()` |
| `TX` / `LIKES` 메모리 배열 | **Supabase**(법인카드/회계 연동 테이블 + Realtime) | `aggOf()`, `renderDB()`, `like()`, `recvTx()` |

> 추천 **점수 로직**(`runRecommend`, `ageBoost`)·필터·김영란법·할랄·식문화(`CULTURE`)는 그대로 재사용 가능.

---

## 🧱 목표 아키텍처

```
[정적 프론트 (이 index.html 발전형 or React)]
   → [API: 서버리스]
        · 국내  → 네이버 지역검색 API
        · 해외  → Google Places API (New)   (가격/평점 제공)
        · 추천 이유 → Claude API
   → [Supabase: 법인카드/회계 실적 테이블 + Realtime + Auth]
   → 결과 카드 + 지도 + 딥링크(네이버/구글맵/캐치테이블)
```

- 배포: Vercel(정적+서버리스) + Supabase 를 상정 (상위 저장소가 이미 이 구조 사용).
- 비밀키는 코드 금지 → 환경변수: `NAVER_ID/SECRET`, `GOOGLE_PLACES_KEY`, `ANTHROPIC_API_KEY`, `SUPABASE_URL/SERVICE_KEY`.

### API 계약(프론트 ↔ 백엔드)
`기획서.md` 10절 참고. 프론트는 이 JSON 형식만 지키면 목업/실서버 교체가 자유로움.

---

## ✅ 이미 구현된 기능 (데모에서 동작)
- 두 모드: 🍷접대(프로필: 해외파트너/사장님/임원/거래처) · 🎉회식
- 필터: 연령대 · 1인 예산대 · 음식종류(한/중/일/양/아시안)
- 장소: 본사(서린빌딩 고정) · 해외법인 · **출장지 등록**(국내/해외)
- 해외: 국가별 **식문화 고려사항 + 할랄 필터**
- ⚖️ **김영란법** 1인 5만원 한도 자동 제외
- 📊 **전사 접대 실적**(법인카드/회계 집계): 횟수·금액·1인평균·부서 + 👍 + 실시간 수신
- 지도(도보 동심원·핀) · 예약 딥링크

---

## 🗺 로드맵 (이슈로 쪼개 쓰기 좋게)
1. **[BE] 네이버 지역검색 연동** — 국내 후보 실검색 + 좌표 변환/도보시간
2. **[BE] Google Places 연동** — 해외 후보 + 가격/평점
3. **[BE] Claude 추천 이유** — 후보+조건 → 이유 생성(후보 밖 금지)
4. **[BE] Supabase 스키마** — 법인카드 실적 테이블 + Realtime + 부서 인증
5. **[FE] index.html → 컴포넌트/React 이관**(선택) 또는 fetch 연결
6. **[FE] 결과·DB 화면을 실 API에 연결**
7. **[인프라] Vercel 배포 + 환경변수 세팅**

---

## 👥 협업 규칙(제안)
- `main`은 항상 동작하는 상태 유지. 작업은 브랜치에서.
  ```bash
  git switch -c feat/naver-search
  # ...작업...
  git add -A && git commit -m "feat: 네이버 지역검색 연동"
  git push -u origin feat/naver-search
  # GitHub에서 Pull Request 생성 → 리뷰 → merge
  ```
- 브랜치 이름: `feat/…`, `fix/…`, `chore/…`
- 작업 단위는 위 로드맵 항목 = GitHub Issue 하나로.
```
