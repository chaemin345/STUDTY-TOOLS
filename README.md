# STUDTY TOOLS

개인 학습 관리 앱. 과목, 과제, 시간표, 집중 기록을 관리하고, Pro 이용권에서는 외부 AI API 연결과 AI 주간 학습 계획을 제공합니다.

## 실행

정적 학습 기능은 `index.html`을 브라우저에서 바로 열어 사용할 수 있습니다.

```bash
python -m http.server 3000
```

`http://localhost:3000`에서 실행합니다. 계정·결제·API 기능은 Vercel Functions와 Supabase 설정이 필요합니다.

## 기능

- 오늘 대시보드, 과제, 과목, 시간표, 집중 타이머, 학습 분석
- 과목 추가·수정·삭제 및 기존 기록 자동 반영
- JSON 백업/복원과 학습 기록 CSV 내보내기
- Pro 30일 / 365일 일회성 이용권 결제 UI
- Supabase 이메일 인증 및 서버 검증 기반 Pro 권한
- Toss Payments SDK v2 주문서형 결제 연동 및 서버 승인 확인
- OpenAI, Anthropic, Google Gemini API 연결·연결 테스트
- 외부 API 키 AES-256-GCM 암호화 저장
- 연결한 AI API로 7일 학습 계획 생성

## 요금 정책 기본값

| 플랜 | 가격 | 기간 |
|---|---:|---:|
| Free | ₩0 | 기본 기능 |
| Pro 30일 | ₩4,900 | 30일 |
| Pro 365일 | ₩49,000 | 365일 |

현재는 자동 갱신 구독이 아니라 일회성 이용권입니다. 가격을 변경할 때는 `lib/server/plans.js`만 수정하면 프런트엔드 가격과 주문 서버가 `/api/config`를 통해 같은 값을 사용합니다.

## Vercel 설정

Vercel 프로젝트의 Root Directory는 비워 둡니다(저장소 루트가 곧 앱입니다). 다음 환경변수를 설정합니다. 처음에는 Toss 테스트 키로 연동을 확인하세요.

`.env.example`를 참고합니다.

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — 서버 함수 전용. 브라우저 코드나 GitHub에 절대 노출하지 마세요.
- `TOSS_CLIENT_KEY` — 테스트 키는 `test_ck_`로 시작
- `TOSS_SECRET_KEY` — 테스트 키는 `test_sk_`로 시작. 서버 함수 전용.
- `INTEGRATION_ENCRYPTION_KEY` — 32바이트(64자리 hex) 암호화 키
- `MASTER_GOOGLE_EMAIL` — (선택) 마스터 권한을 줄 Google 계정 이메일. 서버 전용.

암호화 키 생성 예시:

```bash
openssl rand -hex 32
```

Vercel의 Production / Preview / Development 환경에 필요한 값을 각각 등록합니다. 실제 결제를 열기 전에 Toss 라이브 키, 사업자/판매자 등록, 환불정책, 이용약관 및 개인정보 처리방침을 확정해야 합니다.

## Supabase 준비

1. Supabase 프로젝트를 생성합니다.
2. Authentication에서 Email 가입·로그인 정책과 이메일 인증 여부를 설정합니다.
3. SQL Editor에서 `supabase/schema.sql`을 실행합니다.
4. Project URL, anon key, service role key를 Vercel 환경변수에 등록합니다.
5. Service Role Key는 서버 전용으로 유지합니다. 모든 테이블에는 anon/authenticated용 RLS 정책을 추가하지 않았으며 서버에서 JWT 확인 후 Service Role로 접근합니다.

## Toss Payments 준비

1. Toss Payments 개발자센터에서 테스트 API 키를 발급합니다.
2. Client Key와 Secret Key를 Vercel 환경변수에 등록합니다.
3. `/api/config`가 `backendReady: true`를 반환하는지 확인합니다.
4. 로그인 후 Pro 30일 또는 365일 이용권을 선택하고 테스트 결제를 진행합니다.
5. 결제 인증 후 `/api/toss/confirm`에서 서버가 주문 금액·사용자·주문번호를 확인하고 Toss 승인 API를 호출합니다. 승인 상태가 `DONE`인 경우에만 구독 레코드가 갱신됩니다.

테스트 키는 실제 청구를 발생시키지 않습니다. 라이브 결제 전에는 반드시 테스트 구매·취소·중복 요청·결제 실패 경로를 확인하세요.

## 외부 AI API 연결

Pro 로그인 후 OpenAI, Anthropic, Gemini 중 하나를 선택해 API 키와 모델 ID를 등록할 수 있습니다. API 키는 브라우저 localStorage에 보관하지 않습니다. 서버에서 AES-256-GCM으로 암호화한 뒤 Supabase에 저장하고, 연결 테스트 및 AI 학습 계획 요청 시에만 복호화해 해당 제공자에게 전달합니다.

외부 AI API 이용료는 각 제공자의 계정에 별도로 청구될 수 있습니다. 학습 계획 요청 시 과목, 목표 시험일, 미완료 과제 및 최근 집중 세션 요약이 선택한 제공자에게 전송됩니다.

## 개인정보·법적 문서

- `terms.html`, `privacy.html`은 개발용 초안입니다.
- 실제 판매자/운영자 정보, 고객 문의처, 환불 및 청약철회 정책, 개인정보 처리자 정보, 보유기간, 국외 이전·위탁 사항을 확정하고 운영 전 법률 검토를 거쳐야 합니다.
- 카드 번호와 CVC는 STUDTY 서버에 저장하지 않으며 Toss Payments가 결제 UI를 처리합니다.
- 이용권은 현재 자동 갱신되지 않습니다.

## 검증

```bash
python -m pip install -r requirements-dev.txt
python tests/validate_app.py
node --test tests/security.test.js
```

검증은 HTML 구조, JavaScript 문법, 서버 함수 문법, 브라우저 상호작용, Pro 화면·무료 권한 게이트, 모바일 가로 넘침, API 키 암호화 round-trip을 확인합니다.