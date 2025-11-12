const express = require('express');
const router = express.Router();
const { getDB } = require('../database');

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// 경품 추첨 결과 확인 (프론트엔드에서 결정한 당첨번호 확인)
router.post('/check-winner', (req, res) => {
  const db = getDB();
  const { drawnNumber } = req.body;

  if (!drawnNumber || drawnNumber < 1) {
    return res.status(400).json({
      success: false,
      message: '유효하지 않은 추첨 번호입니다.'
    });
  }

  // 해당 번호의 사용자 정보 조회
  db.get(`SELECT u.empname, u.deptname, u.posname, ln.lottery_number
          FROM lottery_numbers ln
          JOIN users u ON ln.user_id = u.id
          WHERE ln.lottery_number = ?`,
    [drawnNumber], (err, winner) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: '서버 오류가 발생했습니다.'
        });
      }

      // 참가자 수 확인 (표시용)
      db.get('SELECT COUNT(*) as count FROM lottery_numbers', (err, countResult) => {
        const participantCount = countResult ? countResult.count : 0;

        res.json({
          success: true,
          drawnNumber: drawnNumber,
          participantCount: participantCount,
          winner: winner || null,
          hasWinner: !!winner
        });
      });
    }
  );
});

// 추첨 가능한 숫자 범위 조회 (각 자릿수별)
router.get('/lottery-digits', (req, res) => {
  const db = getDB();

  // 실제 추첨 번호를 가진 참가자 수 확인
  db.get('SELECT COUNT(*) as count, MAX(lottery_number) as maxNumber FROM lottery_numbers', (err, result) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: '서버 오류가 발생했습니다.'
      });
    }

    const participantCount = result.count || 0;
    const actualMaxNumber = result.maxNumber || 0;
    
    // 최대 번호 제한 없이 실제 최대 번호 사용 (120 검증 제거)
    const effectiveMaxNumber = actualMaxNumber || 999; // 기본값 999 (3자리 최대)
    
    // 백의 자리: 참가자 수에 따라 배정
    // - 100명 이하: [0, 1]
    // - 200명 이상: [0, 1, 2, 3, 4]
    const hundredsDigits = [0, 1];
    if (participantCount >= 200) {
      hundredsDigits.push(2, 3, 4);
    }
    
    // 십의 자리와 일의 자리는 0-9 모두 표시
    const tensDigitsArray = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const onesDigitsArray = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

    res.json({
      success: true,
      maxNumber: effectiveMaxNumber,
      participantCount: participantCount,
      canDraw: true, // 항상 추첨 가능 (120 검증 제거)
      digits: {
        hundreds: hundredsDigits,
        tens: tensDigitsArray,
        ones: onesDigitsArray
      }
    });
  });
});

// 다중 경품 추첨 (여러 명을 한 번에 추첨)
router.post('/draw-bulk', (req, res) => {
  const db = getDB();
  const { count } = req.body || {};
  const drawCount = parseInt(count, 10);

  if (!drawCount || drawCount < 1) {
    return res.status(400).json({
      success: false,
      message: '추첨 인원을 올바르게 입력해주세요.'
    });
  }

  // 추첨 대상자 조회 (QR 인증을 통해 추첨번호를 발급받은 모든 사용자)
  const query = `
    SELECT 
      u.id AS user_id,
      u.empno,
      u.empname,
      u.deptname,
      u.posname,
      ln.lottery_number
    FROM lottery_numbers ln
    JOIN users u ON ln.user_id = u.id
    LEFT JOIN prize_claims pc ON pc.user_id = u.id
    WHERE (u.deleted = 0 OR u.deleted IS NULL)
      AND pc.id IS NULL
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('다중 경품 추첨 조회 오류:', err);
      return res.status(500).json({
        success: false,
        message: '서버 오류가 발생했습니다.'
      });
    }

    if (!rows || rows.length === 0) {
      return res.json({
        success: true,
        requestedCount: drawCount,
        availableCount: 0,
        winners: []
      });
    }

    const shuffled = shuffleArray([...rows]);
    const winners = shuffled.slice(0, Math.min(drawCount, shuffled.length)).map(row => ({
      lottery_number: row.lottery_number,
      empname: row.empname,
      empno: row.empno,
      deptname: row.deptname,
      posname: row.posname
    }));

    res.json({
      success: true,
      requestedCount: drawCount,
      availableCount: rows.length,
      winners
    });
  });
});

module.exports = router;
