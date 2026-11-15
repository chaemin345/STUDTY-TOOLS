# STUDTY TOOLS

개인 학습 관리 앱. 과목, 과제, 시간표, 집중 기록을 관리하고, 서버에서 권한을 확인한 사용자에게 외부 AI API 연결과 AI 학습 기능을 제공합니다.

## 실행

정적 학습 기능은 index.html을 브라우저에서 바로 열어 사용할 수 있습니다.

```bash
python -m http.server 3000
```

http://localhost:3000 에서 실행합니다. 계정·AI API 기능은 Vercel Functions와 Supabase 설정이 필요합니다.

## 기능

- 오늘 대시보드, 과제, 과목, 시간표, 집중 타이머, 학습 분석
- 과목 추가·수정·삭제 및 기존 기록 자동 반영
- JSON 백업/복원과 학습 기록 CSV 내보내기
- Supabase Google 로그인 및 서버 검증 기반 Pro 권한 확인
- OpenAI, Anthropic, Google Gemini API 연결·연결 테스트
- 외부 AI API 키 AES-256-GCM 암호화 저장
- 연결한 AI API로 학습 계획 생성
- Pro / Pro Max 플랜 화면은 제공하지만, 유료 결제와 구매 기능은 아직 구현하지 않음

## Pro 권한

현재 앱에는 결제·주문 생성·결제사 SDK·결제 승인 API가 없습니다. Pro 권한은 서버에 등록된 구독 상태 또는 마스터 계정으로만 확인됩니다. 플랜 구매 버튼은 비활성화되어 있으며 화면에 '준비 중'으로 표시됩니다.

향후 결제를 구현하기 전까지는 결제 키, 결제 주문, 카드 정보 등을 앱에서 수집하거나 처리하지 않습니다. 기존 데이터베이스에 남아 있을 수 있는 과거 결제 관련 테이블은 이번 변경에서 삭제하지 않으며 앱에서 사용하지 않습니다.

## Vercel 설정

Vercel 프로젝트의 Root Directory는 비워 둡니다(저장소 루트가 앱입니다). 다음 환경변수를 설정합니다.

.env.example을 참고합니다.

- SUPABASE_URL
- SUPABASE_PUBLISHABLE_KEY — 브라우저 초기화용 공개 키. 기존 프로젝트는 SUPABASE_ANON_KEY도 지원합니다.
- SUPABASE_SECRET_KEY — 서버 함수 전용 비밀 키. 기존 프로젝트는 SUPABASE_SERVICE_ROLE_KEY도 지원합니다. 브라우저 코드나 GitHub에 절대 노출하지 마세요.
- INTEGRATION_ENCRYPTION_KEY — 32바이트(64자리 hex) 암호화 키
- MASTER_GOOGLE_EMAIL — (선택) 마스터 권한을 줄 Google 계정 이메일. 서버 전용.

암호화 키 생성 예시:
```bash
openssl rand -hex 32
```

Vercel의 Production / Preview / Development 환경에 필요한 값을 각각 등록합니다. 기존 암호화 키를 바꾸면 이미 저장된 외부 API 키를 복호화할 수 없으므로, 키 값은 임의로 교체하지 마세요.

## Supabase 준비

1. Supabase 프로젝트의 URL과 Publishable Key, Secret Key를 확인합니다.
2. Authentication에서 Google OAuth 로그인 제공자와 Redirect URL을 설정합니다.
3. supabase/schema.sql을 검토한 뒤 필요한 테이블을 준비합니다.
4. Project URL, Publishable Key, Secret Key를 Vercel 환경변수에 등록합니다.
5. Secret Key는 서버 전용으로 유지합니다. 모든 사용자 데이터 접근은 서버에서 JWT를 확인한 후 수행합니다.

## 외부 AI API 연결

서버에서 Pro 권한이 확인된 사용자만 OpenAI, Anthropic, Gemini API 키를 등록할 수 있습니다. API 키는 브라우저 localStorage에 보관하지 않습니다. 서버에서 AES-256-GCM으로 암호화한 뒤 Supabase에 저장하고, 연결 테스트 및 AI 요청 시에만 복호화해 해당 제공자에게 전달합니다.

외부 AI API 이용료는 각 제공자의 계정에 별도로 청구될 수 있습니다. AI 요청 시 과목, 목표 시험일, 미완료 과제 및 최근 집중 세션 요약이 선택한 제공자에게 전송됩니다.

## 개인정보·법적 문서

- terms.html, privacy.html은 개발용 초안입니다.
- 실제 운영자 정보, 고객 문의처, 개인정보 처리자 정보, 보유기간 및 국외 이전·위탁 사항을 확정하고 운영 전 법률 검토를 거쳐야 합니다.
- 현재 STUDTY는 결제를 제공하지 않으며 카드번호, CVC, 결제 키 또는 결제 정보를 수집하지 않습니다.

## 검증

```bash
python -m pip install -r requirements-dev.txt
python tests/validate_app.py
node --test tests/*.test.js
```

검증은 HTML 구조, JavaScript 문법, 서버 함수 문법, Supabase 환경변수 호환, 브라우저 상호작용, Pro 권한 게이트, 유료 결제 비활성 상태, 모바일 가로 넘침 및 API 키 암호화 round-trip을 확인합니다.
