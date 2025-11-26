# KB금융 AI 기술 테크포럼 랜딩페이지

2025년 11월 28일 KB금융 AI 기술 테크포럼을 위한 랜딩페이지 및 이벤트 관리 시스템입니다.

## 기술 스택

- **Frontend**: HTML, CSS, Bootstrap 5, JavaScript
- **Backend**: Node.js, Express.js
- **Database**: SQLite
- **Authentication**: JWT
- **Real-time**: WebSocket

## 주요 기능

1. **랜딩페이지**

   - 행사 안내
   - 일정 정보
   - 연사 소개
   - 부스 소개
   - 참가신청
   - 이벤트 안내

2. **인증 시스템**

   - KB 인증 API 연동
   - JWT 토큰 기반 인증 (3개월 만료)
   - 로컬스토리지 토큰 관리

3. **이벤트 시스템**

   - QR 코드 기반 부스 스탬프 수집
   - 3개 이상 부스 방문 시 경품 지급 자격
   - 경품 수령용 QR 코드 생성
   - WebSocket 실시간 알림

4. **설문조사**

   - 세션별 설문 QR 코드 생성
   - 10점 척도 설문 (강의만족도, 강사만족도, 현업적용도)
   - 서술형 피드백 수집

5. **관리자 페이지**
   - 대시보드 (통계, 차트)
   - 부스 QR 코드 생성 (30초 자동 갱신)
   - 설문 QR 코드 생성
   - 경품 지급 처리
   - 경품 추첨 기능
   - 참가자, 부스 참여, 경품 지급, 설문 응답 조회

## 설치 및 실행

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env` 파일을 생성하고 다음 내용을 추가하세요:

```
PORT=3000
JWT_SECRET=your-secret-key-change-this-in-production
ENCRYPTION_KEY=your-encryption-key-32-characters-long
KB_AUTH_API_URL=https://devlxp.kbstar.com/lmd/geibp

# API 설정
# Frontend에서 Backend API를 호출할 때 사용하는 기본 URL
# 같은 서버를 사용하는 경우 빈 문자열 또는 설정하지 않음 (상대 경로 사용)
# 다른 서버를 사용하는 경우: API_BASE_URL=https://api.example.com

# 로그 설정 (선택사항)
ENABLE_CONSOLE_LOG=true  # 콘솔 로그 활성화 (기본값: true)
LOG_LEVEL=info           # 로그 레벨: debug, info, warn, error (기본값: info)
```

### 3. 서버 실행

```bash
npm start
```

개발 모드 (nodemon):

```bash
npm run dev
```

### 4. 접속

- 메인 페이지: http://localhost:3000
- 관리자 페이지: http://localhost:3000/app/admin/
  - ID: `foruma`
  - 비밀번호: `forumPassPass`

## 프로젝트 구조

```
tech2/
├── asset/              # 정적 자산 (폰트, 디자인 이미지)
├── backend/            # 백엔드 코드
│   ├── database.js     # 데이터베이스 설정
│   ├── routes/         # API 라우트
│   └── utils/        # 유틸리티 함수
├── public/             # 프론트엔드 파일
│   ├── app/           # 페이지들
│   ├── css/           # 스타일시트
│   └── js/            # JavaScript 파일
├── server.js          # 메인 서버 파일
└── package.json       # 프로젝트 설정
```

## API 엔드포인트

### 인증

- `POST /api/auth/login` - 로그인
- `GET /api/auth/verify` - 토큰 검증

### 데이터

- `GET /api/data/user` - 사용자 정보 조회
- `GET /api/data/lottery-number` - 추첨 번호 조회

### 부스

- `POST /api/booth/generate-qr` - 부스 QR 생성
- `POST /api/booth/scan` - QR 스캔 처리
- `GET /api/booth/participation` - 참여 현황 조회
- `POST /api/booth/generate-prize-qr` - 경품 수령 QR 생성

### 설문

- `POST /api/survey/submit` - 설문 제출
- `POST /api/survey/generate-qr` - 설문 QR 생성

### 관리자

- `POST /api/admin/login` - 관리자 로그인
- `GET /api/admin/dashboard` - 대시보드 데이터
- `GET /api/admin/surveys` - 설문 결과
- `GET /api/admin/users` - 참가자 목록
- `GET /api/admin/booth-participations` - 부스 참여 목록
- `POST /api/admin/prize-claim` - 경품 지급
- `GET /api/admin/prize-claims` - 경품 지급 현황

### 경품

- `POST /api/prize/draw` - 경품 추첨

## 데이터베이스

SQLite 데이터베이스는 자동으로 생성되며 다음 테이블을 포함합니다:

- `users` - 사용자 정보
- `booth_participations` - 부스 참여 기록
- `prize_claims` - 경품 지급 기록
- `surveys` - 설문 응답
- `lottery_numbers` - 경품 추첨 번호
- `admins` - 관리자 계정
- `web_logs` - 웹로그 (API 호출, 페이지 접속 기록)

## 로깅 기능

### 콘솔 로그

개발 편의성을 위해 모든 요청과 응답이 콘솔에 색상으로 구분되어 출력됩니다:

- **HTTP 메서드**: 색상으로 구분 (GET: 파란색, POST: 초록색, DELETE: 빨간색 등)
- **상태 코드**: 성공(200-299): 초록색, 클라이언트 오류(400-499): 노란색, 서버 오류(500+): 빨간색
- **응답 시간**: 밀리초 단위로 표시
- **디버그 모드**: `LOG_LEVEL=debug`로 설정 시 추가 정보 표시 (사용자 정보, IP, 쿼리 파라미터 등)

### 로그 레벨

- `debug`: 모든 로그와 상세 정보 출력
- `info`: 일반 정보 로그 출력 (기본값)
- `warn`: 경고 및 오류 로그만 출력
- `error`: 오류 로그만 출력

### 콘솔 로그 비활성화

프로덕션 환경에서 콘솔 로그를 비활성화하려면:

```bash
ENABLE_CONSOLE_LOG=false
```

### 예시 출력

```
[2025-01-15 14:30:25] GET    200    45ms /api/data/user
[2025-01-15 14:30:26] POST   201   123ms /api/auth/login
[2025-01-15 14:30:27] GET    404    12ms /api/invalid-path
  └─ Error: 리소스를 찾을 수 없습니다.
```

디버그 모드에서는:

```
[2025-01-15 14:30:25] GET    200    45ms /api/data/user
  └─ User: 1234567 │ IP: 192.168.1.1 │ Query: {"id":"123"}
```

## 부하 테스트

100명 동시 접속 시뮬레이션을 위한 부하 테스트 스크립트가 포함되어 있습니다.

### 부하 테스트 실행

```bash
# 기본 설정 (100명 동시 접속, 추첨번호 발급 테스트)
node test/load-test.js

# 옵션 지정
node test/load-test.js --users=150 --endpoint=booth --base-url=http://localhost:3000
```

### 옵션

- `--users=N`: 동시 사용자 수 (기본값: 100)
- `--endpoint=TYPE`: 테스트할 엔드포인트
  - `lottery`: 추첨번호 발급 (기본값)
  - `booth`: 부스 QR 스캔
  - `auth`: 인증
- `--base-url=URL`: 서버 URL (기본값: http://localhost:3000)

### 결과 해석

부하 테스트 결과는 다음 정보를 제공합니다:

- 총 요청 수 및 성공/실패 비율
- 평균/최소/최대 응답 시간
- 중간값(P50), P95, P99 응답 시간
- 주요 오류 유형 및 발생 횟수

성공률이 95% 미만이면 경고가 표시됩니다.

## 모니터링

### 실시간 모니터링

관리자 페이지에서 실시간 모니터링 통계를 확인할 수 있습니다:

- **활성 연결 수**: 현재 처리 중인 요청 수
- **IP별 통계**: IP 주소별 요청 수 및 평균 응답 시간
- **경로별 통계**: API 경로별 요청 수 및 성능
- **동시 접속 피크**: 최대 동시 접속 수 및 발생 시간

### 모니터링 API

```bash
GET /api/admin/monitor?timeWindow=60000
```

- `timeWindow`: 통계 조회 시간 윈도우 (밀리초, 기본값: 60000 = 1분)

### 클라이언트 재시도 로직

네트워크 오류나 일시적 서버 오류 시 자동 재시도 기능이 포함되어 있습니다:

- **최대 재시도 횟수**: 3회 (설정 가능)
- **재시도 대기 시간**: 지수 백오프 (1초, 2초, 3초)
- **타임아웃**: 10초
- **재시도 조건**: 네트워크 오류, 타임아웃, 500번대 서버 오류

중요한 API 호출(추첨번호 발급, 부스 QR 스캔 등)에는 자동으로 재시도 로직이 적용됩니다.

## 배포

GitHub Actions를 통한 AWS EC2 배포는 별도 설정이 필요합니다.

## 라이선스

ISC
