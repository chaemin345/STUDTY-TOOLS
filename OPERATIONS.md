# STUDTY TOOLS 운영 및 보안 런북

## 1. 환경 분리 및 백엔드 접근

- Production만 운영 Supabase 프로젝트와 기존 운영 암호화 키를 사용합니다.
- Vercel Preview / Development 백엔드는 기본적으로 비활성화됩니다.
- Preview / Development에서 백엔드를 켜려면 반드시 별도 비운영 Supabase 프로젝트를 만들고, 해당 환경에만 개발용 URL, Publishable Key, Secret Key, 고유한 AES-256-GCM 암호화 키를 설정합니다.
- `STUDTY_ALLOW_NON_PRODUCTION_BACKEND=true`만으로는 활성화되지 않습니다. 다음 값도 Preview / Development 환경에 별도로 설정해야 합니다.
  - `STUDTY_PRODUCTION_SUPABASE_PROJECT_REF`: 운영 Supabase 프로젝트 ref
  - `STUDTY_PRODUCTION_SUPABASE_SECRET_SHA256`: 운영 Supabase Secret/Service Role Key의 SHA-256 fingerprint
  - `STUDTY_PRODUCTION_ENCRYPTION_KEY_SHA256`: 운영 `INTEGRATION_ENCRYPTION_KEY`의 SHA-256 fingerprint
- 런타임은 비운영 Supabase URL의 project ref가 운영 ref와 다른지, 비운영 Secret Key와 암호화 키가 운영 fingerprint와 다른지 검증합니다. 값이 누락되거나 일치하면 fail-closed(503)입니다.
- fingerprint는 신뢰할 수 있는 보안 관리 환경에서 계산합니다. 운영 비밀값 원문을 Preview / Development 변수, 채팅, 이슈, 로그에 복사하지 않습니다.
- 운영 `INTEGRATION_ENCRYPTION_KEY`는 교체하거나 다른 환경에 복사하지 않습니다. 기존 저장 API 키의 복호화가 중단될 수 있습니다.
- 비운영 환경을 사용하지 않을 때는 opt-in 변수를 설정하지 않습니다.

## 2. AI 사용량 제어

- assistant, pattern-analysis, study-plan은 모두 `consumeMonthlyAiQuota` → `rpc/consume_ai_quota`를 호출합니다.
- RPC는 사용자/월별 단일 행을 원자적으로 증가시키며 한도 도달 시 추가 요청을 거부합니다. 동시 요청도 한도를 초과해 성공하지 않아야 합니다.
- 기본 한도: Pro 100회/월, Pro Max 500회/월, Master 10,000회/월.
- quota RPC 장애 또는 응답 검증 실패 시 AI 호출을 진행하지 않습니다.
- 월 경계는 UTC 기준입니다.

## 3. 요청 및 AI 입력 검증

- JSON 요청 본문은 UTF-8 기준 64 KiB(65,536 bytes) 이하만 허용합니다. Content-Length와 실제 본문 크기를 모두 검사합니다.
- 사용자 학습 기록은 AI provider 호출 전에 allow-list 필드만 남기고 문자열 길이, 세션/과제/메모리 개수를 제한합니다.
- 사용자 기록 속 문자열은 신뢰할 수 없는 데이터로 취급하며 시스템 지시문으로 실행하지 않습니다.
- 새 필드를 AI 프롬프트에 추가할 때는 sanitizer와 테스트도 함께 수정합니다.

## 4. 배포 절차

1. 기능별 브랜치에서 작업합니다.
2. `python tests/validate_app.py`와 `node --test tests/*.test.js`를 통과시킵니다.
3. Pull Request의 GitHub Actions CI를 확인합니다.
4. Preview는 별도 개발 DB가 설정되지 않았다면 정적 UI 확인만 합니다.
5. 검토 후 명시적으로 승인된 경우에만 `main`에 병합하고 Production 배포를 진행합니다.
6. 배포 직후 Google 로그인, 계정 권한 확인, API 키 저장·삭제, AI 세 기능, 브라우저 백업을 점검합니다.

## 5. 장애 대응

- Preview/Development에서 503: 기본 차단인지 확인하고, 별도 프로젝트 URL/ref와 세 개의 fingerprint/secret 설정을 점검합니다. 운영 프로젝트 ref 또는 운영 키 fingerprint와 일치하면 의도적으로 차단됩니다.
- quota 429: 해당 사용자의 UTC 월간 사용량 및 플랜 한도를 확인합니다. 한도를 임의로 증가시키거나 DB row를 직접 수정하지 않습니다.
- quota 503: Supabase RPC 응답, 서비스 키 권한, RPC 로그를 확인합니다. AI provider 호출은 fail-closed여야 합니다.
- 접속/빌드 오류: Vercel Deployments와 Build Logs
- 함수 4xx/5xx: Vercel Runtime Logs
- 로그인 및 토큰 오류: Supabase Auth Logs와 Google OAuth Redirect URI
- DB 권한/쿼리 오류: Supabase Logs 및 Security Advisor
- 최근 배포 후 장애: 마지막 정상 Production Deployment로 롤백합니다. DB 마이그레이션을 포함한 배포라면 코드 롤백만으로 복구된다고 가정하지 않습니다.

## 6. 월간 점검

- Supabase Security / Performance Advisor 확인
- 실제 복구 가능한 데이터베이스 백업 확인
- GitHub 협업자·토큰·브랜치 권한 점검
- Vercel 환경변수는 키 이름과 적용 환경만 점검하고, 비밀값은 채팅·이슈·로그에 복사하지 않기
- AI 제공자별 사용량과 비용 한도 확인
- 개인정보 처리방침, 약관, 보관·삭제 정책 최신화

## 7. 변경 범위 및 안전성

- 이 런북과 애플리케이션 코드는 Production DB schema 또는 사용자 row를 수정하지 않습니다.
- 운영 암호화 키 회전은 수행하지 않습니다.
- Preview/Development는 별도 Supabase 프로젝트와 고유 비밀값이 검증되기 전까지 backend-disabled 상태를 유지합니다.
