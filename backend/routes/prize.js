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

// 룰렛 추첨용 번호 선택 (발급된 번호 중 경품 미수령자만 랜덤 선택)
router.get('/select-lottery-number', (req, res) => {
  const db = getDB();

  // 경품 미수령자 중 발급된 추첨번호 중 하나를 랜덤으로 선택
  // 주의: 모바일상품권 수령자는 제외하지 않음 (모바일상품권은 독립적)
  db.all(`SELECT ln.lottery_number
          FROM lottery_numbers ln
          JOIN users u ON ln.user_id = u.id
          LEFT JOIN prize_claims pc ON pc.user_id = u.id
          WHERE (u.deleted = 0 OR u.deleted IS NULL)
            AND (pc.id IS NULL OR pc.prize_type = 'mobile_gift_30')
            AND ln.lottery_number >= 100
            AND ln.lottery_number <= 999
          ORDER BY RANDOM()
          LIMIT 1`, [], (err, results) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: '서버 오류가 발생했습니다.'
      });
    }

    if (!results || results.length === 0) {
      return res.status(404).json({
        success: false,
        message: '추첨 가능한 번호가 없습니다.'
      });
    }

    const selectedNumber = results[0].lottery_number;
    
    // 선택된 번호의 각 자릿수 추출
    const hundreds = Math.floor(selectedNumber / 100);
    const tens = Math.floor((selectedNumber % 100) / 10);
    const ones = selectedNumber % 10;

    res.json({
      success: true,
      lotteryNumber: selectedNumber,
      digits: {
        hundreds,
        tens,
        ones
      }
    });
  });
});

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

  // 해당 번호의 사용자 정보 조회 (경품 미수령자만, 100~999 범위만)
  // 주의: 모바일상품권 수령자는 제외하지 않음 (모바일상품권은 독립적)
  db.get(`SELECT u.id as user_id, u.empname, u.deptname, u.posname, ln.lottery_number
          FROM lottery_numbers ln
          JOIN users u ON ln.user_id = u.id
          LEFT JOIN prize_claims pc ON pc.user_id = u.id
          WHERE ln.lottery_number = ?
            AND (u.deleted = 0 OR u.deleted IS NULL)
            AND (pc.id IS NULL OR pc.prize_type = 'mobile_gift_30')
            AND ln.lottery_number >= 100
            AND ln.lottery_number <= 999`,
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
        // 주의: 모바일상품권 수령자는 제외하지 않음 (모바일상품권은 독립적)
        db.get(`SELECT id FROM prize_claims 
                WHERE user_id = ? 
                AND (prize_type IS NULL OR prize_type != 'mobile_gift_30')`, [winner.user_id], (err, existing) => {
          if (err) {
            return res.status(500).json({
              success: false,
              message: '서버 오류가 발생했습니다.'
            });
          }

          if (!existing) {
            // 경품 수령 기록 추가 (INSERT OR IGNORE로 중복 방지, 룰렛/로또 추첨)
            db.run('INSERT OR IGNORE INTO prize_claims (user_id, prize_type) VALUES (?, ?)', [winner.user_id, 'roulette_lotto'], (insertErr) => {
              if (insertErr) {
                console.error('경품 수령 기록 추가 오류:', insertErr);
                // 기록 추가 실패해도 당첨 결과는 반환
              }
            });
          }

          // 경품 미수령 참가자 수 확인 (표시용, 100~999 범위만)
          // 주의: 모바일상품권 수령자는 포함 (모바일상품권은 독립적)
          db.get(`SELECT COUNT(*) as count 
                  FROM lottery_numbers ln
                  JOIN users u ON ln.user_id = u.id
                  LEFT JOIN prize_claims pc ON pc.user_id = u.id
                  WHERE (u.deleted = 0 OR u.deleted IS NULL)
                    AND (pc.id IS NULL OR pc.prize_type = 'mobile_gift_30')
                    AND ln.lottery_number >= 100
                    AND ln.lottery_number <= 999`, (err, countResult) => {
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
        // 당첨자가 없는 경우 (100~999 범위만)
        // 주의: 모바일상품권 수령자는 포함 (모바일상품권은 독립적)
        db.get(`SELECT COUNT(*) as count 
                FROM lottery_numbers ln
                JOIN users u ON ln.user_id = u.id
                LEFT JOIN prize_claims pc ON pc.user_id = u.id
                WHERE (u.deleted = 0 OR u.deleted IS NULL)
                  AND (pc.id IS NULL OR pc.prize_type = 'mobile_gift_30')
                  AND ln.lottery_number >= 100
                  AND ln.lottery_number <= 999`, (err, countResult) => {
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

  // 추첨 대상자 조회 (QR 인증을 통해 추첨번호를 발급받은 사용자, 100~999 범위만)
  // 주의: 모바일상품권 수령자는 제외하지 않음 (모바일상품권은 독립적)
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
      AND (pc.id IS NULL OR pc.prize_type = 'mobile_gift_30')
      AND ln.lottery_number >= 100
      AND ln.lottery_number <= 999
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
    
    // 먼저 이미 수령한 사용자 확인 (모바일상품권 수령자는 제외하지 않음)
    db.all(`SELECT user_id FROM prize_claims 
            WHERE user_id IN (${placeholders})
            AND (prize_type IS NULL OR prize_type != 'mobile_gift_30')`, winnerUserIds, (err, existingClaims) => {
      if (err) {
        console.error('경품 수령 기록 확인 오류:', err);
        // 오류가 나도 추첨 결과는 반환
      }

      const existingUserIds = existingClaims ? existingClaims.map(c => c.user_id) : [];
      const newClaimUserIds = winnerUserIds.filter(id => !existingUserIds.includes(id));

      // 새로 수령할 사용자들만 기록 추가 (INSERT OR IGNORE로 중복 방지)
      if (newClaimUserIds.length > 0) {
        // 각 사용자별로 개별 INSERT (SQLite에서 여러 VALUES 지원하지만 안전하게 개별 처리)
        let insertCount = 0;
        let completedCount = 0;
        newClaimUserIds.forEach(userId => {
          // 10명 일괄 추첨
          db.run('INSERT OR IGNORE INTO prize_claims (user_id, prize_type) VALUES (?, ?)', [userId, 'bulk_10'], (insertErr) => {
            if (insertErr) {
              console.error('경품 수령 기록 추가 오류:', insertErr);
            } else {
              insertCount++;
            }
            completedCount++;
            // 모든 INSERT 완료 후 응답
            if (completedCount === newClaimUserIds.length) {
              // 응답은 이미 위에서 처리됨
            }
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

// 모바일 상품권 추첨대상 다중 추첨 (부스 3개 이상 참여자만 대상)
router.post('/draw-bulk-prize-eligible', (req, res) => {
  const db = getDB();
  const { count } = req.body || {};
  const drawCount = parseInt(count, 10);

  if (!drawCount || drawCount < 1) {
    return res.status(400).json({
      success: false,
      message: '추첨 인원을 올바르게 입력해주세요.'
    });
  }

  // 추첨 대상자 조회 (부스 3개 이상 참여 + 모바일상품권 미수령)
  // 주의: 현장QR 발급번호 조건 없음 (추첨번호가 없어도 추첨 가능)
  // 주의: 룰렛/로또/10명 추첨 수령자는 포함 (모바일상품권은 독립적)
  const query = `
    SELECT 
      u.id AS user_id,
      u.empno,
      u.empname,
      u.deptname,
      u.posname,
      ln.lottery_number,
      COUNT(bp.id) as booth_count
    FROM users u
    INNER JOIN booth_participations bp ON u.id = bp.user_id
    LEFT JOIN lottery_numbers ln ON ln.user_id = u.id
    LEFT JOIN prize_claims pc ON pc.user_id = u.id
    WHERE (u.deleted = 0 OR u.deleted IS NULL)
      AND (bp.deleted = 0 OR bp.deleted IS NULL)
      AND (pc.id IS NULL OR pc.prize_type != 'mobile_gift_30')
    GROUP BY u.id, u.empno, u.empname, u.deptname, u.posname, ln.lottery_number
    HAVING COUNT(bp.id) >= 3
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('모바일 상품권 추첨 조회 오류:', err);
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
    
    // 먼저 이미 모바일상품권을 수령한 사용자 확인 (룰렛/로또/10명 추첨 수령자는 제외하지 않음)
    db.all(`SELECT user_id FROM prize_claims 
            WHERE user_id IN (${placeholders})
            AND prize_type = 'mobile_gift_30'`, winnerUserIds, (err, existingClaims) => {
      if (err) {
        console.error('경품 수령 기록 확인 오류:', err);
        // 오류가 나도 추첨 결과는 반환
      }

      const existingUserIds = existingClaims ? existingClaims.map(c => c.user_id) : [];
      const newClaimUserIds = winnerUserIds.filter(id => !existingUserIds.includes(id));

      // 새로 수령할 사용자들만 기록 추가 (INSERT OR IGNORE로 중복 방지)
      if (newClaimUserIds.length > 0) {
        let insertCount = 0;
        let completedCount = 0;
        newClaimUserIds.forEach(userId => {
          // 모바일상품권 30명 추첨
          db.run('INSERT OR IGNORE INTO prize_claims (user_id, prize_type) VALUES (?, ?)', [userId, 'mobile_gift_30'], (insertErr) => {
            if (insertErr) {
              console.error('경품 수령 기록 추가 오류:', insertErr);
            } else {
              insertCount++;
            }
            completedCount++;
          });
        });
      }

      const winners = selectedWinners.map(row => ({
        lottery_number: row.lottery_number || null, // 추첨번호가 없을 수 있음
        empname: row.empname,
        empno: row.empno,
        deptname: row.deptname,
        posname: row.posname,
        booth_count: row.booth_count
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
