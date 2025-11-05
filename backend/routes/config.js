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

module.exports = router;

