// API 설정
// Frontend는 Backend API를 호출합니다.
// 같은 서버를 사용하므로 상대 경로를 직접 사용합니다.

// API 엔드포인트 상수
const API_ENDPOINTS = {
    AUTH: {
        LOGIN: '/api/auth/login',
        VERIFY: '/api/auth/verify'
    },
    DATA: {
        USER: '/api/data/user',
        LOTTERY_NUMBER: '/api/data/lottery-number'
    },
    BOOTH: {
        SCAN: '/api/booth/scan',
        PARTICIPATION: '/api/booth/participation',
        GENERATE_QR: '/api/booth/generate-qr',
        GENERATE_PRIZE_QR: '/api/booth/generate-prize-qr'
    },
    SURVEY: {
        SUBMIT: '/api/survey/submit',
        GENERATE_QR: '/api/survey/generate-qr'
    },
    ADMIN: {
        LOGIN: '/api/admin/login',
        DASHBOARD: '/api/admin/dashboard',
        SURVEYS: '/api/admin/surveys',
        USERS: '/api/admin/users',
        BOOTH_PARTICIPATIONS: '/api/admin/booth-participations',
        PRIZE_CLAIM: '/api/admin/prize-claim',
        PRIZE_CLAIMS: '/api/admin/prize-claims'
    },
    PRIZE: {
        DRAW: '/api/prize/draw'
    },
    LOGS: {
        LIST: '/api/logs',
        STATS: '/api/logs/stats',
        HOURLY: '/api/logs/hourly',
        PAGE_VIEW: '/api/logs/page-view',
        EVENT: '/api/logs/event'
    }
};
