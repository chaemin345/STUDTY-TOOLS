# STUDTY TOOLS 운영 및 보안 지침

## 환경 분리

- Production만 운영 Supabase 프로젝트와 운영 암호화 키를 사용합니다.
- Vercel Preview / Development 백엔드는 기본적으로 비활성화됩니다.
- Preview 또는 Development에서 로그인이 필요한 테스트를 하려면 별도의 Supabase 개발 프로젝트를 먼저 만들고, 해당 환경에만 개발용 URL, Publishable Key, Secret Key, 고유한 AES-256-GCM 암호화 키를 설정합니다.
- 별도 개발 DB를 준비하기 전에는 `STUDTY_ALLOW_NON_PRODUCTION_BACKEND=true`를 설정하지 마세요.
- 운영 `INTEGRATION_ENCRYPTION_KEY`를 다른 환경에 복사하거나 교체하지 마세요. 기존 저장된 API 키를 복호화할 수 없게 될 수 있습니다.

## 배포 절차

1. 기능별 브랜치에서 작업합니다.
2. `python tests/validate_app.py`와 `node --test tests/*.test.js`를 통과시킵니다.
3. Pull Request의 GitHub Actions CI를 확인합니다.
4. Preview는 별도 개발 DB가 연결되지 않은 상태에서는 정적 UI 확인만 합니다.
5. 검토 후 `main`에 병합하고 Production 배포를 확인합니다.
6. 배포 직후 Google 로그인, 계정 권한 확인, API 키 저장·삭제, AI 3개 기능, 브라우저 백업을 점검합니다.

## 데이터베이스와 AI 비용

- AI assistant, pattern analysis, study plan은 동일한 원자적 월간 쿼터 RPC를 사용합니다.
- 현재 쿼터는 Free가 아니라 Pro 100회, Pro Max 500회, Master 10,000회 기준이며, 플랜명은 서버 구독 레코드에서 결정됩니다.
- 사용자 기록은 현재 브라우저 localStorage에 저장됩니다. 주기적으로 JSON 내보내기를 실행하고, 다른 기기에서 사용하려면 별도 동기화 기능이 필요합니다.
- SQL 스키마를 변경할 때는 마이그레이션 파일을 먼저 검토하고 Preview 데이터베이스에서 검증합니다. 운영 DB에 직접 수동 SQL을 반복 실행하지 않습니다.

## 장애 대응

- 접속/빌드 오류: Vercel Deployments와 Build Logs
- 함수 4xx/5xx: Vercel Runtime Logs
- 로그인 및 토큰 오류: Supabase Auth Logs와 Google OAuth Redirect URI
- DB 권한/쿼리 오류: Supabase Logs 및 Security Advisor
- 최근 배포 후 장애: 마지막 정상 Production Deployment로 롤백합니다. DB 마이그레이션을 포함한 배포라면 코드 롤백만으로 복구된다고 가정하지 않습니다.

## 월간 점검

- Supabase Security / Performance Advisor 확인
- 실제 복구 가능한 데이터베이스 백업 확인
- GitHub 협업자·토큰·브랜치 권한 점검
- Vercel 환경변수는 키 이름과 적용 환경만 점검하고, 비밀값은 채팅·이슈·로그에 복사하지 않기
- AI 제공자별 사용량과 비용 한도 확인
- 개인정보 처리방침, 약관, 보관·삭제 정책 최신화
