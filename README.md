# AI 기술테크포럼 2024 웹어플리케이션

## 개요
AI 기술테크포럼 2024를 위한 모바일 웹어플리케이션입니다. 참가자 등록, 이벤트 참여, 설문조사, 관리자 기능을 포함한 종합적인 이벤트 관리 시스템입니다.

## 주요 기능

### 🔐 인증 시스템
- JWT 토큰 기반 인증
- 직원번호 + 휴대번호 뒷4자리 인증
- 로컬스토리지 토큰 관리
- 1개월 토큰 만료

### 📱 모바일 웹 인터페이스
- Bootstrap 5 기반 반응형 디자인
- 모바일 최적화 UI/UX
- 터치 친화적 인터페이스

### 🎯 이벤트 시스템
- QR 코드 기반 입장 확인
- 5개 체험 부스 참여 추적
- 설문조사 참여 관리
- 경품 추첨 자격 부여

### 📊 관리자 기능
- 실시간 참여 현황 모니터링
- 설문조사 결과 분석
- 참가자 관리
- 데이터 시각화

## 기술 스택

### Backend
- **Node.js** - 서버 런타임
- **Express.js** - 웹 프레임워크
- **SQLite** - 데이터베이스
- **JWT** - 인증 토큰
- **bcryptjs** - 비밀번호 해싱

### Frontend
- **HTML5** - 마크업
- **CSS3** - 스타일링
- **Bootstrap 5** - UI 프레임워크
- **JavaScript (ES6+)** - 클라이언트 로직
- **Chart.js** - 데이터 시각화

### 기타
- **QRCode** - QR 코드 생성
- **CORS** - 크로스 오리진 요청 처리

## 설치 및 실행

### 1. 의존성 설치
```bash
npm install
```

### 2. 서버 실행
```bash
# 개발 모드
npm run dev

# 프로덕션 모드
npm start
```

### 3. 접속
- 메인 페이지: `http://localhost:3000`
- 관리자 페이지: `http://localhost:3000/app/admin/`

## 프로젝트 구조

```
tech/
├── server.js              # 메인 서버 파일
├── package.json           # 프로젝트 설정
├── forum.db              # SQLite 데이터베이스 (자동 생성)
├── public/               # 정적 파일
│   ├── css/
│   │   └── style.css     # 메인 스타일시트
│   ├── js/
│   │   ├── main.js       # 메인 JavaScript
│   │   ├── auth.js       # 인증 관련
│   │   ├── data.js       # 이벤트 데이터
│   │   ├── admin.js      # 관리자 기능
│   │   └── survey.js     # 설문조사
│   ├── index.html        # 메인 랜딩페이지
│   ├── intro.html        # 소개 페이지
│   ├── auth.html         # 로그인 페이지
│   ├── event.html        # 이벤트 안내 페이지
│   ├── data.html         # 이벤트 참여 페이지
│   ├── survey.html       # 설문조사 페이지
│   └── admin.html        # 관리자 페이지
└── README.md             # 프로젝트 문서
```

## API 엔드포인트

### 인증
- `POST /api/auth` - 사용자 로그인
- `POST /api/register` - 사용자 등록
- `POST /api/admin/auth` - 관리자 로그인

### 이벤트
- `GET /api/event/status` - 이벤트 참여 현황
- `POST /api/event/entry` - 입장 확인
- `POST /api/event/booth` - 부스 참여
- `POST /api/event/survey` - 설문조사 참여

### QR 코드
- `GET /api/qr/entry/:id` - 입장 QR 코드
- `GET /api/qr/booth/:id` - 부스 QR 코드
- `GET /api/qr/survey/:id` - 설문 QR 코드

### 관리자
- `GET /api/admin/overview` - 전체 현황
- `GET /api/admin/participants` - 참가자 목록
- `GET /api/admin/surveys` - 설문 결과

### 설문조사
- `POST /api/survey/submit` - 설문 제출

## 사용자 플로우

### 1. 참가자 플로우
1. 홈페이지 접속 → 참가신청
2. 로그인 → 이벤트 참여 페이지
3. QR 코드 스캔 → 입장 확인
4. 부스 방문 → QR 코드 스캔
5. 설문조사 참여 → QR 코드 스캔
6. 경품 추첨 자격 획득

### 2. 관리자 플로우
1. 관리자 로그인
2. 실시간 현황 모니터링
3. 참가자 관리
4. 설문 결과 분석

## 데이터베이스 스키마

### users 테이블
- `id` - 사용자 ID
- `employee_id` - 직원번호
- `phone_last4` - 휴대번호 뒷4자리
- `password_hash` - 비밀번호 해시
- `created_at` - 생성일시

### event_participation 테이블
- `user_id` - 사용자 ID
- `entry_confirmed` - 입장 확인
- `booth_1` ~ `booth_5` - 부스 참여
- `survey_participated` - 설문 참여
- `prize_eligible` - 경품 자격
- `lottery_number` - 추첨 번호

### surveys 테이블
- `session_id` - 세션 ID
- `session_name` - 세션명
- `satisfaction_score` - 만족도 점수
- `instructor_score` - 강사 점수
- `improvement_suggestions` - 개선사항

### admins 테이블
- `id` - 관리자 ID
- `username` - 사용자명
- `password_hash` - 비밀번호 해시

## 보안 고려사항

- JWT 토큰 기반 인증
- 비밀번호 해싱 (bcrypt)
- CORS 설정
- 입력 데이터 검증
- SQL 인젝션 방지

## 브라우저 지원

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
- 모바일 브라우저 지원

## 개발자 정보

- **프로젝트명**: AI 기술테크포럼 2024
- **버전**: 1.0.0
- **라이선스**: MIT
- **개발일**: 2024년 12월

## 문의사항

프로젝트 관련 문의사항이 있으시면 개발팀에 연락해주세요.

---

**AI 기술테크포럼 2024** - 인공지능의 미래를 함께 만들어가는 특별한 하루


