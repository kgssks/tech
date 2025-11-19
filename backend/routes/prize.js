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

  // 해당 번호의 사용자 정보 조회 (경품 미수령자만)
  db.get(`SELECT u.id as user_id, u.empname, u.deptname, u.posname, ln.lottery_number
          FROM lottery_numbers ln
          JOIN users u ON ln.user_id = u.id
          LEFT JOIN prize_claims pc ON pc.user_id = u.id
          WHERE ln.lottery_number = ?
            AND (u.deleted = 0 OR u.deleted IS NULL)
            AND pc.id IS NULL`,
    [drawnNumber], (err, winner) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: '서버 오류가 발생했습니다.'
        });
      }

      // 당첨자가 있으면 자동으로 경품 수령 처리
      if (winner && winner.user_id) {
        // 이미 수령했는지 다시 확인 (동시성 문제 방지)
        db.get('SELECT id FROM prize_claims WHERE user_id = ?', [winner.user_id], (err, existing) => {
          if (err) {
            return res.status(500).json({
              success: false,
              message: '서버 오류가 발생했습니다.'
            });
          }

          if (!existing) {
            // 경품 수령 기록 추가
            db.run('INSERT INTO prize_claims (user_id) VALUES (?)', [winner.user_id], (insertErr) => {
              if (insertErr) {
                console.error('경품 수령 기록 추가 오류:', insertErr);
                // 기록 추가 실패해도 당첨 결과는 반환
              }
            });
          }

          // 경품 미수령 참가자 수 확인 (표시용)
          db.get(`SELECT COUNT(*) as count 
                  FROM lottery_numbers ln
                  JOIN users u ON ln.user_id = u.id
                  LEFT JOIN prize_claims pc ON pc.user_id = u.id
                  WHERE (u.deleted = 0 OR u.deleted IS NULL)
                    AND pc.id IS NULL`, (err, countResult) => {
            const participantCount = countResult ? countResult.count : 0;

            res.json({
              success: true,
              drawnNumber: drawnNumber,
              participantCount: participantCount,
              winner: {
                empname: winner.empname,
                deptname: winner.deptname,
                posname: winner.posname,
                lottery_number: winner.lottery_number
              },
              hasWinner: true
            });
          });
        });
      } else {
        // 당첨자가 없는 경우
        db.get(`SELECT COUNT(*) as count 
                FROM lottery_numbers ln
                JOIN users u ON ln.user_id = u.id
                LEFT JOIN prize_claims pc ON pc.user_id = u.id
                WHERE (u.deleted = 0 OR u.deleted IS NULL)
                  AND pc.id IS NULL`, (err, countResult) => {
          const participantCount = countResult ? countResult.count : 0;

          res.json({
            success: true,
            drawnNumber: drawnNumber,
            participantCount: participantCount,
            winner: null,
            hasWinner: false
          });
        });
      }
    }
  );
});

// 추첨 가능한 숫자 범위 조회 (각 자릿수별) - 경품 미수령자만
router.get('/lottery-digits', (req, res) => {
  const db = getDB();

  // 경품 미수령자 중 실제 추첨 번호를 가진 참가자 수 및 범위 확인
  db.get(`SELECT 
            COUNT(*) as count, 
            MIN(ln.lottery_number) as minNumber,
            MAX(ln.lottery_number) as maxNumber
          FROM lottery_numbers ln
          JOIN users u ON ln.user_id = u.id
          LEFT JOIN prize_claims pc ON pc.user_id = u.id
          WHERE (u.deleted = 0 OR u.deleted IS NULL)
            AND pc.id IS NULL`, (err, result) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: '서버 오류가 발생했습니다.'
      });
    }

    const participantCount = result.count || 0;
    const actualMinNumber = result.minNumber || 1;
    const actualMaxNumber = result.maxNumber || 0;
    
    // 실제 발급된 추첨번호 범위 사용
    const effectiveMaxNumber = actualMaxNumber || 999; // 기본값 999 (3자리 최대)
    const effectiveMinNumber = actualMinNumber || 1;
    
    // 실제 발급된 추첨번호 목록 조회 (자릿수 계산용)
    db.all(`SELECT DISTINCT ln.lottery_number
            FROM lottery_numbers ln
            JOIN users u ON ln.user_id = u.id
            LEFT JOIN prize_claims pc ON pc.user_id = u.id
            WHERE (u.deleted = 0 OR u.deleted IS NULL)
              AND pc.id IS NULL
            ORDER BY ln.lottery_number`, [], (err, numbers) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: '서버 오류가 발생했습니다.'
        });
      }

      // 실제 발급된 번호들로부터 각 자릿수 추출
      const hundredsSet = new Set();
      const tensSet = new Set();
      const onesSet = new Set();

      numbers.forEach(row => {
        const num = row.lottery_number;
        const hundreds = Math.floor(num / 100);
        const tens = Math.floor((num % 100) / 10);
        const ones = num % 10;
        
        hundredsSet.add(hundreds);
        tensSet.add(tens);
        onesSet.add(ones);
      });

      // Set을 배열로 변환하고 정렬
      const hundredsDigits = Array.from(hundredsSet).sort((a, b) => a - b);
      const tensDigitsArray = Array.from(tensSet).sort((a, b) => a - b);
      const onesDigitsArray = Array.from(onesSet).sort((a, b) => a - b);

      // 빈 배열인 경우 기본값 설정
      if (hundredsDigits.length === 0) hundredsDigits.push(0);
      if (tensDigitsArray.length === 0) tensDigitsArray.push(0);
      if (onesDigitsArray.length === 0) onesDigitsArray.push(0);

      res.json({
        success: true,
        minNumber: effectiveMinNumber,
        maxNumber: effectiveMaxNumber,
        participantCount: participantCount,
        canDraw: true, // 항상 추첨 가능
        digits: {
          hundreds: hundredsDigits,
          tens: tensDigitsArray,
          ones: onesDigitsArray
        }
      });
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
    const selectedWinners = shuffled.slice(0, Math.min(drawCount, shuffled.length));
    
    // 당첨자들의 경품 수령 기록 추가
    const winnerUserIds = selectedWinners.map(row => row.user_id);
    const placeholders = winnerUserIds.map(() => '(?)').join(',');
    
    // 먼저 이미 수령한 사용자 확인
    db.all(`SELECT user_id FROM prize_claims WHERE user_id IN (${placeholders})`, winnerUserIds, (err, existingClaims) => {
      if (err) {
        console.error('경품 수령 기록 확인 오류:', err);
        // 오류가 나도 추첨 결과는 반환
      }

      const existingUserIds = existingClaims ? existingClaims.map(c => c.user_id) : [];
      const newClaimUserIds = winnerUserIds.filter(id => !existingUserIds.includes(id));

      // 새로 수령할 사용자들만 기록 추가
      if (newClaimUserIds.length > 0) {
        // 각 사용자별로 개별 INSERT (SQLite에서 여러 VALUES 지원하지만 안전하게 개별 처리)
        let insertCount = 0;
        newClaimUserIds.forEach(userId => {
          db.run('INSERT INTO prize_claims (user_id) VALUES (?)', [userId], (insertErr) => {
            if (insertErr) {
              console.error('경품 수령 기록 추가 오류:', insertErr);
            }
            insertCount++;
          });
        });
      }

      const winners = selectedWinners.map(row => ({
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
});

module.exports = router;
