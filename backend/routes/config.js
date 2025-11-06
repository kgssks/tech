const express = require('express');
const router = express.Router();

// Frontend에 API 설정 제공
router.get('/api-config', (req, res) => {
  // Backend 서버의 기본 URL (프로토콜 + 호스트)
  const baseUrl = req.protocol + '://' + req.get('host');
  
  res.json({
    success: true,
    apiBaseUrl: baseUrl, // Frontend에서 사용할 API 기본 URL
    endpoints: {
      auth: {
        login: '/api/auth/login',
        verify: '/api/auth/verify'
      },
      data: {
        user: '/api/data/user',
        lotteryNumber: '/api/data/lottery-number'
      },
      booth: {
        scan: '/api/booth/scan',
        participation: '/api/booth/participation',
        generateQR: '/api/booth/generate-qr',
        generatePrizeQR: '/api/booth/generate-prize-qr'
      },
      survey: {
        submit: '/api/survey/submit',
        generateQR: '/api/survey/generate-qr'
      },
      admin: {
        login: '/api/admin/login',
        dashboard: '/api/admin/dashboard',
        surveys: '/api/admin/surveys',
        users: '/api/admin/users',
        boothParticipations: '/api/admin/booth-participations',
        prizeClaim: '/api/admin/prize-claim',
        prizeClaims: '/api/admin/prize-claims'
      },
      prize: {
        draw: '/api/prize/draw'
      },
      logs: {
        list: '/api/logs',
        stats: '/api/logs/stats',
        hourly: '/api/logs/hourly'
      }
    }
  });
});

// 서버 시간 체크 (행사 시작 5분 전부터 접근 허용)
router.get('/check-event-time', (req, res) => {
  try {
    // 행사 시작 시간: 2025.11.28 13:00 KST
    const eventStartTime = new Date('2025-11-28T13:00:00+09:00');
    
    // 현재 서버 시간을 KST로 변환
    // 서버가 어떤 타임존에서 실행되든 상관없이 KST 기준으로 계산
    const now = new Date();
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
    const kstTime = new Date(utcTime + (9 * 3600000)); // UTC+9 = 9시간 = 9 * 3600000ms
    
    // 5분 전 시간 계산 (5분 = 5 * 60 * 1000 밀리초)
    const fiveMinutesBefore = new Date(eventStartTime.getTime() - (5 * 60 * 1000));
    
    // 현재 시간이 행사 시작 5분 전 이후인지 확인
    const canAccess = kstTime >= fiveMinutesBefore;
    
    res.json({
      success: true,
      canAccess: canAccess,
      currentTime: kstTime.toISOString(),
      eventStartTime: eventStartTime.toISOString(),
      fiveMinutesBefore: fiveMinutesBefore.toISOString(),
      message: canAccess 
        ? '행사 생중계 시청이 가능합니다.' 
        : '행사 생중계 시간이 아닙니다. 일정을 확인 하시고 다시 접속 해 주세요'
    });
  } catch (error) {
    console.error('서버 시간 체크 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 시간 확인 중 오류가 발생했습니다.'
    });
  }
});

module.exports = router;

