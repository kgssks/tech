const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const { getDB } = require('../database');

// 설문조사 제출 (5점 척도 통합 설문)
router.post('/submit', (req, res) => {
  try {
    const { overallSatisfaction, boothSatisfaction, sessionSatisfaction,
            websiteSatisfaction, prizeSatisfaction, satisfiedPoints, improvementPoints } = req.body;

    // 필수 항목 확인 (1-5점 척도)
    if (overallSatisfaction === undefined || overallSatisfaction < 1 || overallSatisfaction > 5 ||
        boothSatisfaction === undefined || boothSatisfaction < 1 || boothSatisfaction > 5 ||
        sessionSatisfaction === undefined || sessionSatisfaction < 1 || sessionSatisfaction > 5 ||
        websiteSatisfaction === undefined || websiteSatisfaction < 1 || websiteSatisfaction > 5 ||
        prizeSatisfaction === undefined || prizeSatisfaction < 1 || prizeSatisfaction > 5) {
      return res.status(400).json({
        success: false,
        message: '필수 항목을 모두 입력해주세요. (1-5점 척도)'
      });
    }

    const db = getDB();
    const sessionId = 'general'; // 통합 설문이므로 세션 구분 없음
    const sessionName = 'KB금융 AI 기술 테크포럼 통합 설문';

    db.run(`INSERT INTO surveys 
            (session_id, session_name, overall_satisfaction, booth_satisfaction,
             session_satisfaction, website_satisfaction, prize_satisfaction,
             satisfied_points, improvement_points)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sessionId, sessionName, overallSatisfaction, boothSatisfaction,
       sessionSatisfaction, websiteSatisfaction, prizeSatisfaction,
       satisfiedPoints || null, improvementPoints || null],
      function(err) {
        if (err) {
          console.error('설문 저장 오류:', err);
          return res.status(500).json({
            success: false,
            message: '설문 제출 중 오류가 발생했습니다.'
          });
        }

        res.json({
          success: true,
          message: '설문이 성공적으로 제출되었습니다.'
        });
      }
    );
  } catch (error) {
    console.error('설문 제출 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 통합설문 QR 코드 생성 (관리자용)
router.post('/generate-qr', async (req, res) => {
  try {
    // 통합설문은 세션 구분 없이 생성
    const surveyUrl = `${req.protocol}://${req.get('host')}/app/survey`;

    QRCode.toDataURL(surveyUrl, (err, qrImage) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: 'QR 코드 생성 중 오류가 발생했습니다.'
        });
      }

      res.json({
        success: true,
        qrImage,
        surveyUrl
      });
    });
  } catch (error) {
    console.error('통합설문 QR 생성 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

module.exports = router;

