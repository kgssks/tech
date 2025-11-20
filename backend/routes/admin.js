const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDB } = require('../database');
const { decrypt } = require('../utils/encryption');
const { generateToken } = require('../utils/jwt');

// 관리자 인증 미들웨어
function authenticateAdmin(req, res, next) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(401).json({
      success: false,
      message: '관리자 ID와 비밀번호를 입력해주세요.'
    });
  }

  const db = getDB();

  db.get('SELECT * FROM admins WHERE username = ?', [username], (err, admin) => {
    if (err || !admin) {
      return res.status(401).json({
        success: false,
        message: '인증 정보가 올바르지 않습니다.'
      });
    }

    bcrypt.compare(password, admin.password_hash, (err, match) => {
      if (err || !match) {
        return res.status(401).json({
          success: false,
          message: '인증 정보가 올바르지 않습니다.'
        });
      }

      req.admin = admin;
      next();
    });
  });
}

// 관리자 로그인
router.post('/login', authenticateAdmin, (req, res) => {
  // 관리자 JWT 토큰 생성 (관리자용 토큰 생성 함수)
  const jwt = require('jsonwebtoken');
  const crypto = require('crypto');
  const JWT_SECRET = process.env.JWT_SECRET || 'kb-tech-forum-secret-key-change-in-production';
  const TOKEN_EXPIRY = '90d'; // 3개월
  
  const adminSecret = crypto.randomBytes(32).toString('hex');
  const token = jwt.sign(
    { 
      secret: adminSecret,
      role: 'admin',
      adminId: req.admin.id 
    }, 
    JWT_SECRET, 
    { expiresIn: TOKEN_EXPIRY }
  );
  
  res.json({
    success: true,
    message: '관리자 로그인 성공',
    token,
    admin: {
      username: req.admin.username,
      id: req.admin.id
    }
  });
});

// 관리자 토큰 검증
router.get('/verify', (req, res) => {
  const authHeader = req.headers.authorization || req.headers['kb-auth'];
  
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: '인증 토큰이 없습니다.'
    });
  }

  const { verifyToken } = require('../utils/jwt');
  const token = authHeader.replace('Bearer ', '');
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({
      success: false,
      message: '인증 토큰이 만료되었습니다. 다시 로그인해주세요.'
    });
  }

  // 관리자 토큰 확인 (role 필드 확인)
  if (decoded.role === 'admin' && decoded.adminId) {
    const adminId = decoded.adminId;
    const db = getDB();
    
    db.get('SELECT id, username FROM admins WHERE id = ?', [adminId], (err, admin) => {
      if (err || !admin) {
        return res.status(401).json({
          success: false,
          message: '관리자 정보를 찾을 수 없습니다.'
        });
      }

      res.json({
        success: true,
        admin: {
          username: admin.username,
          id: admin.id
        }
      });
    });
  } else {
    return res.status(401).json({
      success: false,
      message: '유효하지 않은 관리자 토큰입니다.'
    });
  }
});

// 대시보드 데이터
router.get('/dashboard', (req, res) => {
  const db = getDB();

  // 전체 참가자 수 (deleted 제외)
  db.get('SELECT COUNT(*) as total FROM users WHERE (deleted = 0 OR deleted IS NULL)', (err, userCount) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: '서버 오류가 발생했습니다.'
      });
    }

    // 설문 참여 수
    db.get('SELECT COUNT(*) as total FROM surveys', (err, surveyCount) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: '서버 오류가 발생했습니다.'
        });
      }

      // 부스 참여 현황 (deleted 제외)
      db.all(`SELECT booth_code, COUNT(*) as count 
              FROM booth_participations 
              WHERE (deleted = 0 OR deleted IS NULL)
              GROUP BY booth_code`,
        (err, boothStats) => {
          if (err) {
            return res.status(500).json({
              success: false,
              message: '서버 오류가 발생했습니다.'
            });
          }

          // 모바일상품권 추첨 자격자 수 (부스 3개 이상 참여, deleted 제외)
          db.all(`SELECT u.id, COUNT(bp.id) as booth_count
                  FROM users u
                  INNER JOIN booth_participations bp ON u.id = bp.user_id
                  WHERE (u.deleted = 0 OR u.deleted IS NULL)
                    AND (bp.deleted = 0 OR bp.deleted IS NULL)
                  GROUP BY u.id
                  HAVING COUNT(bp.id) >= 3`,
            (err, eligibleUsers) => {
              if (err) {
                return res.status(500).json({
                  success: false,
                  message: '서버 오류가 발생했습니다.'
                });
              }

              res.json({
                success: true,
                data: {
                  totalUsers: userCount.total,
                  totalSurveys: surveyCount.total,
                  boothStats: boothStats || [],
                  totalPrizes: eligibleUsers ? eligibleUsers.length : 0
                }
              });
            }
          );
        }
      );
    });
  });
});

// 설문 결과 조회 (5점 척도 통합 설문)
router.get('/surveys', (req, res) => {
  const db = getDB();

  // 통합 설문 통계 (5점 척도)
  db.all(`SELECT 
            AVG(overall_satisfaction) as avg_overall,
            AVG(booth_satisfaction) as avg_booth,
            AVG(session_satisfaction) as avg_session,
            AVG(website_satisfaction) as avg_website,
            AVG(prize_satisfaction) as avg_prize,
            COUNT(*) as count
          FROM surveys
          WHERE overall_satisfaction IS NOT NULL`,
    (err, stats) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: '서버 오류가 발생했습니다.'
        });
      }

      // 전체 설문 응답 (5점 척도)
      db.all(`SELECT overall_satisfaction, booth_satisfaction, session_satisfaction,
                     website_satisfaction, prize_satisfaction,
                     satisfied_points, improvement_points, submitted_at
              FROM surveys
              WHERE overall_satisfaction IS NOT NULL
              ORDER BY submitted_at DESC`,
        (err, allSurveys) => {
          if (err) {
            return res.status(500).json({
              success: false,
              message: '서버 오류가 발생했습니다.'
            });
          }

          // 서술형 설문 (만족한점 또는 개선사항이 있는 경우)
          const textSurveys = allSurveys.filter(s => 
            s.satisfied_points || s.improvement_points
          );

          // 기존 세션별 설문 통계 (하위 호환성)
          db.all(`SELECT 
                    session_id,
                    session_name,
                    AVG(lecture_satisfaction) as avg_lecture,
                    AVG(instructor_satisfaction) as avg_instructor,
                    AVG(application_score) as avg_application,
                    COUNT(*) as count
                  FROM surveys
                  WHERE lecture_satisfaction IS NOT NULL
                  GROUP BY session_id, session_name`,
            (err, oldSessionStats) => {
              res.json({
                success: true,
                stats: stats && stats[0] ? stats[0] : null, // 5점 척도 통계
                sessionStats: oldSessionStats || [], // 기존 세션별 통계 (하위 호환성)
                textSurveys: textSurveys || [],
                allSurveys: allSurveys || []
              });
            }
          );
        }
      );
    }
  );
});

// 참가자 목록
router.get('/users', (req, res) => {
  const db = getDB();

  db.all(`SELECT u.empno, u.empname, u.deptname, u.posname, u.created_at,
                 COUNT(CASE WHEN bp.deleted = 0 OR bp.deleted IS NULL THEN bp.id END) as booth_count,
                 (SELECT COUNT(*) FROM prize_claims WHERE user_id = u.id) as prize_claimed
          FROM users u
          LEFT JOIN booth_participations bp ON u.id = bp.user_id AND (bp.deleted = 0 OR bp.deleted IS NULL)
          WHERE (u.deleted = 0 OR u.deleted IS NULL)
          GROUP BY u.id
          ORDER BY u.created_at DESC`,
    (err, users) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: '서버 오류가 발생했습니다.'
        });
      }

      res.json({
        success: true,
        users: users || []
      });
    }
  );
});

// 부스 참여 상세
router.get('/booth-participations', (req, res) => {
  const db = getDB();

  db.all(`SELECT u.id as user_id, u.empname, u.deptname, u.posname, bp.id as participation_id, bp.booth_code, bp.scanned_at, bp.latitude, bp.longitude, bp.deleted
          FROM booth_participations bp
          JOIN users u ON bp.user_id = u.id
          WHERE (u.deleted = 0 OR u.deleted IS NULL)
            AND (bp.deleted = 0 OR bp.deleted IS NULL)
          ORDER BY bp.scanned_at DESC`,
    (err, participations) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: '서버 오류가 발생했습니다.'
        });
      }

      res.json({
        success: true,
        participations: participations || []
      });
    }
  );
});

// 경품 지급 처리
router.post('/prize-claim', (req, res) => {
  try {
    const { encryptedData } = req.body;

    if (!encryptedData) {
      return res.status(400).json({
        success: false,
        message: 'QR 코드 데이터가 필요합니다.'
      });
    }

    try {
      const decrypted = decrypt(encryptedData);
      const data = JSON.parse(decrypted);

      // 1분 이내인지 확인
      const age = Date.now() - data.timestamp;
      if (age > 60000) {
        return res.status(400).json({
          success: false,
          message: 'QR 코드가 만료되었습니다.'
        });
      }

      const db = getDB();

      // 사용자 정보 조회
      db.get('SELECT id, empname, deptname, posname FROM users WHERE token_secret = ?',
        [data.tokenSecret], (err, user) => {
          if (err || !user) {
            return res.status(400).json({
              success: false,
              message: '사용자를 찾을 수 없습니다.'
            });
          }

          // 이미 지급했는지 확인
          db.get('SELECT id FROM prize_claims WHERE user_id = ?', [user.id], (err, existing) => {
            if (err) {
              return res.status(500).json({
                success: false,
                message: '서버 오류가 발생했습니다.'
              });
            }

            if (existing) {
              return res.json({
                success: true,
                message: '이미 경품을 지급받은 사용자입니다.',
                user,
                alreadyClaimed: true
              });
            }

            // 경품 지급 기록
            db.run('INSERT INTO prize_claims (user_id, qr_data) VALUES (?, ?)',
              [user.id, encryptedData], function(err) {
                if (err) {
                  return res.status(500).json({
                    success: false,
                    message: '경품 지급 기록 중 오류가 발생했습니다.'
                  });
                }

                // WebSocket으로 사용자에게 알림 전송
                // 사용자 ID를 통해 WebSocket 클라이언트 찾기
                if (global.sendToClient) {
                  // user.id를 사용하거나, empno를 사용할 수 있음
                  // 실제 구현에서는 user.id를 사용하도록 수정 필요
                  try {
                    global.sendToClient(user.id, {
                      type: 'prize_claimed',
                      message: '경품 지급이 완료되었습니다!'
                    });
                  } catch (wsError) {
                    console.error('WebSocket 전송 오류:', wsError);
                  }
                }

                res.json({
                  success: true,
                  message: '경품 지급이 완료되었습니다.',
                  user
                });
              }
            );
          });
        }
      );
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'QR 코드 데이터가 유효하지 않습니다.'
      });
    }
  } catch (error) {
    console.error('경품 지급 오류:', error);
    res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

// 모바일상품권 추첨 자격자 목록 (부스 3개 이상 참여)
router.get('/prize-eligible', (req, res) => {
  const db = getDB();

  // 먼저 부스 3개 이상 참여한 사용자 조회 (deleted = 0인 것만)
  db.all(`SELECT 
            u.id,
            u.empno,
            u.empname,
            u.deptname,
            u.posname,
            COUNT(bp.id) as booth_count
          FROM users u
          INNER JOIN booth_participations bp ON u.id = bp.user_id
          WHERE (u.deleted = 0 OR u.deleted IS NULL)
            AND (bp.deleted = 0 OR bp.deleted IS NULL)
          GROUP BY u.id
          HAVING COUNT(bp.id) >= 3
          ORDER BY booth_count DESC, u.empname ASC`,
    (err, eligible) => {
      if (err) {
        console.error('추첨 자격자 조회 오류:', err);
        return res.status(500).json({
          success: false,
          message: '서버 오류가 발생했습니다.'
        });
      }

      if (!eligible || eligible.length === 0) {
        return res.json({
          success: true,
          eligible: []
        });
      }

      // 각 사용자의 참여 부스 목록 조회
      const userIds = eligible.map(u => u.id);
      
      if (userIds.length === 0) {
        return res.json({
          success: true,
          eligible: []
        });
      }
      
      const placeholders = userIds.map(() => '?').join(',');
      
      db.all(`SELECT 
                user_id,
                GROUP_CONCAT(booth_code, ', ') as booth_codes
              FROM booth_participations
              WHERE user_id IN (${placeholders})
                AND (deleted = 0 OR deleted IS NULL)
              GROUP BY user_id`,
        userIds,
        (err, boothCodes) => {
          if (err) {
            console.error('부스 코드 조회 오류:', err);
            // 에러가 나도 기본 정보는 반환
            return res.json({
              success: true,
              eligible: eligible.map(u => ({
                ...u,
                booth_codes: ''
              }))
            });
          }

          // 부스 코드를 사용자별로 매핑
          const boothCodeMap = {};
          boothCodes.forEach(bc => {
            boothCodeMap[bc.user_id] = bc.booth_codes || '';
          });

          // 결과 조합
          const result = eligible.map(user => ({
            ...user,
            booth_codes: boothCodeMap[user.id] || ''
          }));

          res.json({
            success: true,
            eligible: result
          });
        }
      );
    }
  );
});

// 경품 지급 현황 (기존 경품 지급 기록)
router.get('/prize-claims', (req, res) => {
  const db = getDB();

  db.all(`SELECT u.empname, u.deptname, u.posname, pc.claimed_at
          FROM prize_claims pc
          JOIN users u ON pc.user_id = u.id
          ORDER BY pc.claimed_at DESC`,
    (err, claims) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: '서버 오류가 발생했습니다.'
        });
      }

      res.json({
        success: true,
        claims: claims || []
      });
    }
  );
});

// 현장 QR 추첨번호 발급 현황 조회
router.get('/lottery-numbers', (req, res) => {
  const db = getDB();

  db.all(`SELECT 
            ln.lottery_number,
            u.empno,
            u.empname,
            u.deptname,
            u.posname,
            CASE WHEN pc.id IS NULL THEN '미수령' ELSE '수령완료' END as prize_status,
            pc.claimed_at
          FROM lottery_numbers ln
          JOIN users u ON ln.user_id = u.id
          LEFT JOIN prize_claims pc ON pc.user_id = u.id
          WHERE (u.deleted = 0 OR u.deleted IS NULL)
          ORDER BY ln.lottery_number ASC`,
    (err, numbers) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: '서버 오류가 발생했습니다.'
        });
      }

      // 통계 정보 추가
      const totalCount = numbers.length;
      const claimedCount = numbers.filter(n => n.prize_status === '수령완료').length;
      const unclaimedCount = totalCount - claimedCount;

      res.json({
        success: true,
        lotteryNumbers: numbers || [],
        statistics: {
          total: totalCount,
          claimed: claimedCount,
          unclaimed: unclaimedCount
        }
      });
    }
  );
});

// 경품 수령 기록 초기화 (모든 수령 기록 삭제)
router.post('/prize-claims/reset', verifyAdminToken, (req, res) => {
  const db = getDB();

  db.run('DELETE FROM prize_claims', [], function(err) {
    if (err) {
      console.error('경품 수령 기록 초기화 오류:', err);
      return res.status(500).json({
        success: false,
        message: '경품 수령 기록 초기화 중 오류가 발생했습니다.'
      });
    }

    res.json({
      success: true,
      message: `경품 수령 기록 ${this.changes}건이 초기화되었습니다.`,
      deletedCount: this.changes
    });
  });
});

// 추첨번호 초기화 (모든 추첨번호 삭제)
router.post('/lottery-numbers/reset', verifyAdminToken, (req, res) => {
  const db = getDB();

  db.run('DELETE FROM lottery_numbers', [], function(err) {
    if (err) {
      console.error('추첨번호 초기화 오류:', err);
      return res.status(500).json({
        success: false,
        message: '추첨번호 초기화 중 오류가 발생했습니다.'
      });
    }

    res.json({
      success: true,
      message: `추첨번호 ${this.changes}건이 초기화되었습니다.`,
      deletedCount: this.changes
    });
  });
});

// 경품 추첨 테스트 대상자 생성 (테스트 유저 생성 + 추첨번호 발급)
router.post('/generate-lottery-test-users', verifyAdminToken, async (req, res) => {
  const db = getDB();
  const crypto = require('crypto');
  const count = parseInt(req.body?.count, 10) || 150;
  
  // 가상 부서명 및 직책 목록
  const departments = ['테크그룹', '금융AI센터', '테크기획부', 'IT기획부', '디지털그룹', '데이터그룹', '보안그룹'];
  const positions = ['주임', '대리', '과장', '차장', '부장', '선임', '수석'];
  
  try {
    // 사용 가능한 가장 작은 테스트 사용자 번호 찾기
    const findAvailableTestNumbers = async (count) => {
      const usedTestNumbers = await new Promise((resolve, reject) => {
        db.all(`SELECT empno FROM users WHERE empno LIKE 'LOTTERY_TEST%' AND (deleted = 0 OR deleted IS NULL)`, (err, results) => {
          if (err) {
            reject(err);
            return;
          }
          
          const numbers = new Set();
          if (results && results.length > 0) {
            results.forEach(user => {
              const match = user.empno.match(/LOTTERY_TEST(\d+)/);
              if (match && match[1]) {
                numbers.add(parseInt(match[1], 10));
              }
            });
          }
          resolve(numbers);
        });
      });
      
      const availableNumbers = [];
      let currentNumber = 1;
      
      while (availableNumbers.length < count) {
        if (!usedTestNumbers.has(currentNumber)) {
          availableNumbers.push(currentNumber);
        }
        currentNumber++;
        
        if (currentNumber > 10000) {
          break;
        }
      }
      
      return availableNumbers;
    };
    
    const availableTestNumbers = await findAvailableTestNumbers(count);
    
    console.log(`[경품 추첨 테스트] 사용 가능한 테스트 번호: ${availableTestNumbers.length}개 (필요: ${count}개)`);
    
    if (availableTestNumbers.length < count) {
      return res.status(400).json({
        success: false,
        message: `사용 가능한 테스트 사용자 번호가 부족합니다. (필요: ${count}개, 사용 가능: ${availableTestNumbers.length}개)`
      });
    }
    
    // 100~999 범위에서 사용 가능한 랜덤 추첨번호 찾기
    const findAvailableLotteryNumbers = async (count) => {
      const usedNumbers = await new Promise((resolve, reject) => {
        db.all('SELECT lottery_number FROM lottery_numbers WHERE lottery_number >= 100 AND lottery_number <= 999', [], (err, rows) => {
          if (err) reject(err);
          else resolve(new Set(rows.map(row => row.lottery_number)));
        });
      });
      
      const allAvailableNumbers = [];
      
      // 100~999 범위에서 사용 가능한 번호 모두 찾기
      for (let num = 100; num <= 999; num++) {
        if (!usedNumbers.has(num)) {
          allAvailableNumbers.push(num);
        }
      }
      
      if (allAvailableNumbers.length < count) {
        return allAvailableNumbers; // 사용 가능한 만큼만 반환
      }
      
      // 사용 가능한 번호 중 랜덤으로 count개 선택
      const selectedNumbers = [];
      const availableNumbersCopy = [...allAvailableNumbers];
      
      for (let i = 0; i < count; i++) {
        const randomIndex = Math.floor(Math.random() * availableNumbersCopy.length);
        selectedNumbers.push(availableNumbersCopy[randomIndex]);
        availableNumbersCopy.splice(randomIndex, 1); // 선택된 번호 제거
      }
      
      return selectedNumbers;
    };
    
    const availableLotteryNumbers = await findAvailableLotteryNumbers(count);
    
    console.log(`[경품 추첨 테스트] 사용 가능한 추첨번호: ${availableLotteryNumbers.length}개 (필요: ${count}개)`);
    
    if (availableLotteryNumbers.length < count) {
      return res.status(400).json({
        success: false,
        message: `사용 가능한 추첨번호가 부족합니다. (필요: ${count}개, 사용 가능: ${availableLotteryNumbers.length}개)`
      });
    }
    
    let createdCount = 0;
    let errorCount = 0;
    const errors = [];
    
    // 사용자 생성 및 추첨번호 발급 (순차적으로 처리)
    for (let i = 0; i < count; i++) {
      const testNumber = availableTestNumbers[i];
      const empno = `LOTTERY_TEST${String(testNumber).padStart(3, '0')}`;
      const empname = `추첨테스트${testNumber}`;
      const deptname = departments[i % departments.length];
      const posname = positions[i % positions.length];
      const tokenSecret = crypto.randomBytes(32).toString('hex');
      const lotteryNumber = availableLotteryNumbers[i];
      
      try {
        // 사용자 생성 또는 업데이트 (삭제된 사용자가 있으면 재활용)
        await new Promise((resolve, reject) => {
          // 먼저 삭제된 사용자가 있는지 확인
          db.get(
            `SELECT id FROM users WHERE empno = ? AND deleted = 1`,
            [empno],
            (checkErr, existingUser) => {
              if (checkErr) {
                console.error(`[경품 추첨 테스트] 사용자 확인 실패 (${empno}):`, checkErr);
                reject(checkErr);
                return;
              }
              
              if (existingUser) {
                // 삭제된 사용자가 있으면 재활용 (deleted = 0으로 변경)
                const userId = existingUser.id;
                db.run(
                  `UPDATE users SET empname = ?, deptname = ?, posname = ?, token_secret = ?, deleted = 0 WHERE id = ?`,
                  [empname, deptname, posname, tokenSecret, userId],
                  function(updateErr) {
                    if (updateErr) {
                      console.error(`[경품 추첨 테스트] 사용자 업데이트 실패 (${empno}):`, updateErr);
                      reject(updateErr);
                      return;
                    }
                    
                    // 기존 추첨번호가 있으면 삭제
                    db.run(
                      `DELETE FROM lottery_numbers WHERE user_id = ?`,
                      [userId],
                      (deleteErr) => {
                        if (deleteErr) {
                          console.error(`[경품 추첨 테스트] 기존 추첨번호 삭제 실패 (${empno}):`, deleteErr);
                          reject(deleteErr);
                          return;
                        }
                        
                        // 새로운 추첨번호 발급
                        db.run(
                          `INSERT INTO lottery_numbers (user_id, lottery_number) VALUES (?, ?)`,
                          [userId, lotteryNumber],
                          (lotteryErr) => {
                            if (lotteryErr) {
                              console.error(`[경품 추첨 테스트] 추첨번호 발급 실패 (${empno}, 번호: ${lotteryNumber}):`, lotteryErr);
                              reject(lotteryErr);
                              return;
                            }
                            resolve();
                          }
                        );
                      }
                    );
                  }
                );
              } else {
                // 새 사용자 생성
                db.run(
                  `INSERT INTO users (empno, empname, deptname, posname, token_secret) VALUES (?, ?, ?, ?, ?)`,
                  [empno, empname, deptname, posname, tokenSecret],
                  function(insertErr) {
                    if (insertErr) {
                      console.error(`[경품 추첨 테스트] 사용자 생성 실패 (${empno}):`, insertErr);
                      reject(insertErr);
                      return;
                    }
                    
                    const userId = this.lastID;
                    
                    // 추첨번호 발급 (현장 QR을 찍었다고 가정)
                    db.run(
                      `INSERT INTO lottery_numbers (user_id, lottery_number) VALUES (?, ?)`,
                      [userId, lotteryNumber],
                      (lotteryErr) => {
                        if (lotteryErr) {
                          console.error(`[경품 추첨 테스트] 추첨번호 발급 실패 (${empno}, 번호: ${lotteryNumber}):`, lotteryErr);
                          reject(lotteryErr);
                          return;
                        }
                        resolve();
                      }
                    );
                  }
                );
              }
            }
          );
        });
        
        createdCount++;
        if (createdCount % 10 === 0) {
          console.log(`[경품 추첨 테스트] 진행 중: ${createdCount}/${count}명 생성 완료`);
        }
      } catch (error) {
        errorCount++;
        console.error(`[경품 추첨 테스트] 에러 (${empno}):`, error);
        errors.push({
          empno,
          error: error.message
        });
      }
    }
    
    console.log(`[경품 추첨 테스트] 완료: 생성 ${createdCount}명, 에러 ${errorCount}건`);
    
    res.json({
      success: true,
      message: `경품 추첨 테스트 대상자 ${createdCount}명이 생성되었습니다. (추첨번호 발급 완료)`,
      createdCount,
      errorCount,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('경품 추첨 테스트 대상자 생성 오류:', error);
    res.status(500).json({
      success: false,
      message: '경품 추첨 테스트 대상자 생성 중 오류가 발생했습니다.'
    });
  }
});

// 경품 추첨 테스트 대상자 삭제
router.post('/delete-lottery-test-users', verifyAdminToken, (req, res) => {
  const db = getDB();

  // 1. LOTTERY_TEST로 시작하는 유저들의 추첨번호 삭제
  db.run(
    `DELETE FROM lottery_numbers 
     WHERE user_id IN (
       SELECT id FROM users WHERE empno LIKE 'LOTTERY_TEST%' AND (deleted = 0 OR deleted IS NULL)
     )`,
    [],
    function(lotteryErr) {
      if (lotteryErr) {
        console.error('추첨번호 삭제 오류:', lotteryErr);
        return res.status(500).json({
          success: false,
          message: '추첨번호 삭제 중 오류가 발생했습니다.'
        });
      }

      const deletedLotteryCount = this.changes;

      // 2. LOTTERY_TEST로 시작하는 유저들을 deleted = 1로 처리
      db.run(
        `UPDATE users SET deleted = 1 
         WHERE empno LIKE 'LOTTERY_TEST%' AND (deleted = 0 OR deleted IS NULL)`,
        [],
        function(userErr) {
          if (userErr) {
            console.error('테스트 유저 삭제 오류:', userErr);
            return res.status(500).json({
              success: false,
              message: '테스트 유저 삭제 중 오류가 발생했습니다.'
            });
          }

          const deletedUserCount = this.changes;

          res.json({
            success: true,
            message: `경품 추첨 테스트 대상자 ${deletedUserCount}명과 추첨번호 ${deletedLotteryCount}건이 삭제되었습니다.`,
            deletedUserCount,
            deletedLotteryCount
          });
        }
      );
    }
  );
});

// 당일 랜딩페이지 접속 사용자 조회 (웹로그 기반)
router.get('/daily-participants', verifyAdminToken, (req, res) => {
  const db = getDB();
  const { date } = req.query; // YYYY-MM-DD 형식, 없으면 오늘 날짜
  
  // 날짜 설정 (기본값: 오늘)
  const targetDate = date || new Date().toISOString().split('T')[0];
  
  // SQLite의 date() 함수를 사용하여 날짜 비교 (ISO 형식 타임스탬프 지원)
  // date() 함수는 'YYYY-MM-DD' 형식으로 변환하여 비교
  // 각 사용자의 최초 접근 시간도 함께 조회
  db.all(`SELECT DISTINCT 
            u.id,
            u.empno,
            u.empname,
            u.deptname,
            u.posname,
            ln.lottery_number,
            CASE WHEN pc.id IS NULL THEN '미수령' ELSE '수령완료' END as prize_status,
            (SELECT MIN(wl2.timestamp) 
             FROM web_logs wl2 
             WHERE wl2.user_id = u.id 
               AND wl2.path = '/' 
               AND date(wl2.timestamp) = date(?)) as first_access_time
          FROM web_logs wl
          JOIN users u ON wl.user_id = u.id
          LEFT JOIN lottery_numbers ln ON ln.user_id = u.id
          LEFT JOIN prize_claims pc ON pc.user_id = u.id
          WHERE wl.path = '/' 
            AND date(wl.timestamp) = date(?)
            AND wl.user_id IS NOT NULL
            AND (u.deleted = 0 OR u.deleted IS NULL)
          ORDER BY u.empname ASC`, 
    [targetDate, targetDate], 
    (err, participants) => {
      if (err) {
        console.error('당일 참가자 조회 오류:', err);
        return res.status(500).json({
          success: false,
          message: '당일 참가자 조회 중 오류가 발생했습니다.'
        });
      }
      
      res.json({
        success: true,
        date: targetDate,
        participants: participants || [],
        count: participants ? participants.length : 0
      });
    }
  );
});

// 선택된 사용자에게 100~999 랜덤 번호 할당
router.post('/assign-lottery-numbers', verifyAdminToken, (req, res) => {
  const db = getDB();
  const { userIds } = req.body; // 배열
  
  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: '사용자 ID 목록이 필요합니다.'
    });
  }
  
  // 사용 중인 번호 조회 (100~999 범위)
  db.all('SELECT lottery_number FROM lottery_numbers WHERE lottery_number >= 100 AND lottery_number <= 999', [], (err, rows) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: '추첨번호 조회 중 오류가 발생했습니다.'
      });
    }
    
    const usedNumbers = new Set(rows.map(row => row.lottery_number));
    const availableNumbers = [];
    
    // 100~999 범위에서 사용 가능한 번호 찾기
    for (let num = 100; num <= 999; num++) {
      if (!usedNumbers.has(num)) {
        availableNumbers.push(num);
      }
    }
    
    if (availableNumbers.length < userIds.length) {
      return res.status(400).json({
        success: false,
        message: `사용 가능한 추첨번호가 부족합니다. (필요: ${userIds.length}개, 사용 가능: ${availableNumbers.length}개)`
      });
    }
    
    // 사용 가능한 번호 중 랜덤으로 선택
    const selectedNumbers = [];
    const availableNumbersCopy = [...availableNumbers];
    
    for (let i = 0; i < userIds.length; i++) {
      const randomIndex = Math.floor(Math.random() * availableNumbersCopy.length);
      selectedNumbers.push(availableNumbersCopy[randomIndex]);
      availableNumbersCopy.splice(randomIndex, 1);
    }
    
    let assignedCount = 0;
    let errorCount = 0;
    const errors = [];
    
    // 각 사용자에게 번호 할당
    userIds.forEach((userId, index) => {
      // 이미 번호가 있는지 확인
      db.get('SELECT lottery_number FROM lottery_numbers WHERE user_id = ?', [userId], (err, existing) => {
        if (err) {
          errorCount++;
          errors.push({ userId, error: '조회 오류' });
          checkComplete();
          return;
        }
        
        if (existing) {
          // 이미 번호가 있으면 업데이트
          db.run('UPDATE lottery_numbers SET lottery_number = ? WHERE user_id = ?',
            [selectedNumbers[index], userId],
            (updateErr) => {
              if (updateErr) {
                errorCount++;
                errors.push({ userId, error: updateErr.message });
              } else {
                assignedCount++;
              }
              checkComplete();
            }
          );
        } else {
          // 새로 할당
          db.run('INSERT INTO lottery_numbers (user_id, lottery_number) VALUES (?, ?)',
            [userId, selectedNumbers[index]],
            (insertErr) => {
              if (insertErr) {
                errorCount++;
                errors.push({ userId, error: insertErr.message });
              } else {
                assignedCount++;
              }
              checkComplete();
            }
          );
        }
      });
    });
    
    function checkComplete() {
      if (assignedCount + errorCount === userIds.length) {
        res.json({
          success: true,
          message: `추첨번호 ${assignedCount}개가 할당되었습니다.`,
          assignedCount,
          errorCount,
          errors: errors.length > 0 ? errors : undefined
        });
      }
    }
  });
});

// 할당한 번호 초기화 (선택된 사용자들의 번호만 삭제)
router.post('/reset-assigned-numbers', verifyAdminToken, (req, res) => {
  const db = getDB();
  const { userIds } = req.body; // 배열, 없으면 모든 할당된 번호 삭제
  
  if (userIds && Array.isArray(userIds) && userIds.length > 0) {
    // 선택된 사용자들의 번호만 삭제
    const placeholders = userIds.map(() => '?').join(',');
    db.run(`DELETE FROM lottery_numbers WHERE user_id IN (${placeholders})`,
      userIds,
      function(err) {
        if (err) {
          console.error('할당 번호 초기화 오류:', err);
          return res.status(500).json({
            success: false,
            message: '할당 번호 초기화 중 오류가 발생했습니다.'
          });
        }
        
        res.json({
          success: true,
          message: `할당된 추첨번호 ${this.changes}개가 삭제되었습니다.`,
          deletedCount: this.changes
        });
      }
    );
  } else {
    // 모든 할당된 번호 삭제 (테스트 사용자 제외)
    db.run(`DELETE FROM lottery_numbers 
            WHERE user_id NOT IN (
              SELECT id FROM users WHERE empno LIKE 'LOTTERY_TEST%' OR empno LIKE 'TEST%'
            )`,
      [],
      function(err) {
        if (err) {
          console.error('할당 번호 초기화 오류:', err);
          return res.status(500).json({
            success: false,
            message: '할당 번호 초기화 중 오류가 발생했습니다.'
          });
        }
        
        res.json({
          success: true,
          message: `모든 할당된 추첨번호 ${this.changes}개가 삭제되었습니다.`,
          deletedCount: this.changes
        });
      }
    );
  }
});

// 관리자 토큰 검증 미들웨어 (JWT 기반)
function verifyAdminToken(req, res, next) {
  const authHeader = req.headers.authorization || req.headers['kb-auth'];
  
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: '인증 토큰이 필요합니다.'
    });
  }

  const token = authHeader.replace('Bearer ', '');
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'kb-tech-forum-secret-key-change-in-production';

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: '관리자 권한이 필요합니다.'
      });
    }
    req.adminId = decoded.adminId;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: '유효하지 않은 토큰입니다.'
    });
  }
}

// 테스트 데이터 생성 (가상 사용자 150명 및 추첨번호 부여)
router.post('/generate-test-data', verifyAdminToken, async (req, res) => {
  const db = getDB();
  const crypto = require('crypto');
  
  // 가상 부서명 및 직책 목록
  const departments = ['테크그룹', '금융AI센터', '테크기획부', 'IT기획부', '디지털그룹', '데이터그룹', '보안그룹'];
  const positions = ['주임', '대리', '과장', '차장', '부장', '선임', '수석'];
  
  try {
    // 기존 테스트 사용자 중 최대 번호 확인 (삭제되지 않은 사용자만)
    // 삭제된 사용자의 번호를 재사용하기 위해 사용 가능한 가장 작은 번호 찾기
    const findAvailableTestNumbers = async (count) => {
      // 모든 사용 중인 테스트 사용자 번호 가져오기 (삭제되지 않은 것만)
      const usedTestNumbers = await new Promise((resolve, reject) => {
        db.all(`SELECT empno FROM users WHERE empno LIKE 'TEST%' AND (deleted = 0 OR deleted IS NULL)`, (err, results) => {
          if (err) {
            reject(err);
            return;
          }
          
          // empno에서 숫자 부분 추출하여 Set으로 변환
          const numbers = new Set();
          if (results && results.length > 0) {
            results.forEach(user => {
              const match = user.empno.match(/TEST(\d+)/);
              if (match && match[1]) {
                numbers.add(parseInt(match[1], 10));
              }
            });
          }
          resolve(numbers);
        });
      });
      
      const availableNumbers = [];
      let currentNumber = 1;
      
      while (availableNumbers.length < count) {
        if (!usedTestNumbers.has(currentNumber)) {
          availableNumbers.push(currentNumber);
        }
        currentNumber++;
        
        // 무한 루프 방지 (최대 10000번까지)
        if (currentNumber > 10000) {
          break;
        }
      }
      
      return availableNumbers;
    };
    
    const availableTestNumbers = await findAvailableTestNumbers(150);
    
    // 사용 가능한 테스트 번호가 150개 미만이면 에러
    if (availableTestNumbers.length < 150) {
      return res.status(400).json({
        success: false,
        message: `사용 가능한 테스트 사용자 번호가 부족합니다. (필요: 150개, 사용 가능: ${availableTestNumbers.length}개)`
      });
    }
    
    // 시작 번호는 사용 가능한 가장 작은 번호
    const startTestNumber = availableTestNumbers[0];
    
    // 사용 가능한 가장 작은 추첨번호 찾기 (1부터 시작하여 사용되지 않은 번호 찾기)
    const findAvailableLotteryNumbers = async (count) => {
      // 모든 사용 중인 번호를 한 번에 가져오기
      const usedNumbers = await new Promise((resolve, reject) => {
        db.all('SELECT lottery_number FROM lottery_numbers ORDER BY lottery_number', [], (err, rows) => {
          if (err) reject(err);
          else resolve(new Set(rows.map(row => row.lottery_number)));
        });
      });
      
      const availableNumbers = [];
      let currentNumber = 1;
      
      while (availableNumbers.length < count) {
        if (!usedNumbers.has(currentNumber)) {
          availableNumbers.push(currentNumber);
        }
        currentNumber++;
        
        // 무한 루프 방지 (최대 10000번까지)
        if (currentNumber > 10000) {
          break;
        }
      }
      
      return availableNumbers;
    };
    
    const availableLotteryNumbers = await findAvailableLotteryNumbers(150);
    
    // 사용 가능한 번호가 150개 미만이면 에러
    if (availableLotteryNumbers.length < 150) {
      return res.status(400).json({
        success: false,
        message: `사용 가능한 추첨번호가 부족합니다. (필요: 150개, 사용 가능: ${availableLotteryNumbers.length}개)`
      });
    }
    
    let createdCount = 0;
    let errorCount = 0;
    const errors = [];
    const usedLotteryNumbers = []; // 실제로 사용된 추첨번호 추적
    
    // 150명의 가상 사용자 생성 (Promise 배열로 변환)
    const createPromises = [];
    
    for (let i = 0; i < 150; i++) {
      // 사용 가능한 테스트 번호 목록에서 순서대로 사용
      const testNumber = availableTestNumbers[i];
      const empno = `TEST${String(testNumber).padStart(3, '0')}`;
      const empname = `테스트사용자${testNumber}`;
      const deptname = departments[i % departments.length];
      const posname = positions[i % positions.length];
      const tokenSecret = crypto.randomBytes(32).toString('hex');
      // 사용 가능한 추첨번호 목록에서 순서대로 사용 (반드시 배열에 있어야 함)
      const lotteryNumber = availableLotteryNumbers[i];
      
      // 사용자 생성 Promise (삭제된 사용자가 있으면 재활용, 없으면 새로 생성)
      const createUserPromise = new Promise((resolve) => {
        // 먼저 삭제된 사용자가 있는지 확인
        db.get(
          `SELECT id FROM users WHERE empno = ? AND deleted = 1`,
          [empno],
          (checkErr, existingUser) => {
            if (checkErr) {
              errorCount++;
              errors.push(`사용자 ${empno} 확인 실패: ${checkErr.message}`);
              resolve({ success: false, empno });
              return;
            }

            if (existingUser) {
              // 삭제된 사용자 재활용: 업데이트하고 deleted = 0으로 설정
              db.run(
                `UPDATE users 
                 SET empname = ?, deptname = ?, posname = ?, token_secret = ?, deleted = 0, updated_at = datetime('now')
                 WHERE id = ?`,
                [empname, deptname, posname, tokenSecret, existingUser.id],
                function(updateErr) {
                  if (updateErr) {
                    errorCount++;
                    errors.push(`사용자 ${empno} 업데이트 실패: ${updateErr.message}`);
                    resolve({ success: false, empno });
                  } else {
                    const userId = existingUser.id;
                    createdCount++;
                    
                    // 기존 추첨번호가 있으면 삭제하고 새로 부여
                    db.run(
                      `DELETE FROM lottery_numbers WHERE user_id = ?`,
                      [userId],
                      (deleteErr) => {
                        if (deleteErr) {
                          errors.push(`사용자 ${empno} 기존 추첨번호 삭제 실패: ${deleteErr.message}`);
                        }
                        
                        // 새 추첨번호 부여
                        db.run(
                          `INSERT INTO lottery_numbers (user_id, lottery_number) 
                           VALUES (?, ?)`,
                          [userId, lotteryNumber],
                          (insertErr) => {
                            if (insertErr) {
                              errors.push(`사용자 ${empno} 추첨번호 부여 실패: ${insertErr.message}`);
                            } else {
                              usedLotteryNumbers.push(lotteryNumber);
                            }
                            resolve({ success: true, empno, userId, lotteryNumber });
                          }
                        );
                      }
                    );
                  }
                }
              );
            } else {
              // 새 사용자 생성
              db.run(
                `INSERT INTO users (empno, empname, deptname, posname, token_secret) 
                 VALUES (?, ?, ?, ?, ?)`,
                [empno, empname, deptname, posname, tokenSecret],
                function(insertErr) {
                  if (insertErr) {
                    errorCount++;
                    errors.push(`사용자 ${empno} 생성 실패: ${insertErr.message}`);
                    resolve({ success: false, empno });
                  } else {
                    const userId = this.lastID;
                    createdCount++;
                    
                    // 추첨번호 부여
                    db.run(
                      `INSERT INTO lottery_numbers (user_id, lottery_number) 
                       VALUES (?, ?)`,
                      [userId, lotteryNumber],
                      (lotteryErr) => {
                        if (lotteryErr) {
                          errors.push(`사용자 ${empno} 추첨번호 부여 실패: ${lotteryErr.message}`);
                        } else {
                          usedLotteryNumbers.push(lotteryNumber);
                        }
                        resolve({ success: true, empno, userId, lotteryNumber });
                      }
                    );
                  }
                }
              );
            }
          }
        );
      });
      
      createPromises.push(createUserPromise);
    }
    
    // 모든 사용자 생성 완료 대기
    await Promise.all(createPromises);
    
    res.json({
      success: true,
      message: `테스트 데이터 생성 완료`,
      created: createdCount,
      errors: errorCount,
      errorDetails: errors.length > 0 ? errors : undefined,
      testUserRange: {
        start: `TEST${String(availableTestNumbers[0]).padStart(3, '0')}`,
        end: `TEST${String(availableTestNumbers[availableTestNumbers.length - 1]).padStart(3, '0')}`
      },
      lotteryNumberRange: {
        start: availableLotteryNumbers[0],
        end: availableLotteryNumbers[availableLotteryNumbers.length - 1]
      }
    });
    
  } catch (error) {
    console.error('테스트 데이터 생성 오류:', error);
    res.status(500).json({
      success: false,
      message: `데이터베이스 오류가 발생했습니다: ${error.message}`
    });
  }
});

// 부스 참여 삭제 (사용안함 처리)
router.post('/booth-participation/delete', (req, res) => {
  const { participationId } = req.body;
  const db = getDB();

  if (!participationId) {
    return res.status(400).json({
      success: false,
      message: '부스 참여 ID가 필요합니다.'
    });
  }

  // 부스 참여 정보 조회
  db.get(`SELECT bp.user_id, bp.booth_code, u.empname
          FROM booth_participations bp
          JOIN users u ON bp.user_id = u.id
          WHERE bp.id = ? AND (bp.deleted = 0 OR bp.deleted IS NULL)`,
    [participationId],
    (err, participation) => {
      if (err || !participation) {
        return res.status(404).json({
          success: false,
          message: '부스 참여 정보를 찾을 수 없습니다.'
        });
      }

      // 부스 참여를 사용안함 처리
      db.run(`UPDATE booth_participations SET deleted = 1 WHERE id = ?`,
        [participationId],
        function(updateErr) {
          if (updateErr) {
            return res.status(500).json({
              success: false,
              message: '부스 참여 삭제 중 오류가 발생했습니다.'
            });
          }

          // 삭제 후 해당 사용자의 유효한 부스 참여 수 확인
          db.get(`SELECT COUNT(*) as count
                  FROM booth_participations
                  WHERE user_id = ? AND (deleted = 0 OR deleted IS NULL)`,
            [participation.user_id],
            (countErr, countResult) => {
              if (!countErr && countResult && countResult.count < 3) {
                // 부스 참여가 3개 미만이 되면 자격 상실 메시지 포함
                res.json({
                  success: true,
                  message: '부스 참여가 삭제되었습니다.',
                  qualificationLost: true,
                  currentCount: countResult.count,
                  userName: participation.empname
                });
              } else {
                res.json({
                  success: true,
                  message: '부스 참여가 삭제되었습니다.',
                  qualificationLost: false
                });
              }
            }
          );
        }
      );
    }
  );
});

// 모바일상품권 추첨대상 삭제 (해당 사용자의 모든 부스 참여 삭제)
router.post('/prize-eligible/delete', (req, res) => {
  const { userId } = req.body;
  const db = getDB();

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: '사용자 ID가 필요합니다.'
    });
  }

  // 사용자 정보 조회
  db.get(`SELECT empname FROM users WHERE id = ?`, [userId], (err, user) => {
    if (err || !user) {
      return res.status(404).json({
        success: false,
        message: '사용자 정보를 찾을 수 없습니다.'
      });
    }

    // 해당 사용자의 모든 부스 참여를 사용안함 처리
    db.run(`UPDATE booth_participations SET deleted = 1 WHERE user_id = ? AND (deleted = 0 OR deleted IS NULL)`,
      [userId],
      function(updateErr) {
        if (updateErr) {
          return res.status(500).json({
            success: false,
            message: '부스 참여 삭제 중 오류가 발생했습니다.'
          });
        }

        res.json({
          success: true,
          message: `${user.empname}님의 모든 부스 참여가 삭제되었습니다.`,
          deletedCount: this.changes
        });
      }
    );
  });
});

// 테스트 사용자 삭제 (사용안함 처리)
router.post('/delete-test-users', verifyAdminToken, (req, res) => {
  const db = getDB();

  // empno가 'TEST'로 시작하는 모든 사용자를 사용안함 처리
  db.run(`UPDATE users SET deleted = 1 WHERE empno LIKE 'TEST%' AND (deleted = 0 OR deleted IS NULL)`,
    [],
    function(updateErr) {
      if (updateErr) {
        console.error('테스트 사용자 삭제 오류:', updateErr);
        return res.status(500).json({
          success: false,
          message: '테스트 사용자 삭제 중 오류가 발생했습니다.'
        });
      }

      const deletedCount = this.changes;

      // 삭제된 테스트 사용자들의 추첨번호 삭제 (실제 삭제)
      db.run(`DELETE FROM lottery_numbers 
              WHERE user_id IN (
                SELECT id FROM users WHERE empno LIKE 'TEST%' AND deleted = 1
              )`,
        [],
        function(lotteryErr) {
          if (lotteryErr) {
            console.error('테스트 사용자 추첨번호 삭제 오류:', lotteryErr);
          }

          const lotteryDeletedCount = lotteryErr ? 0 : this.changes;

          // 삭제된 테스트 사용자들의 부스 참여도 사용안함 처리
          db.run(`UPDATE booth_participations 
                  SET deleted = 1 
                  WHERE user_id IN (
                    SELECT id FROM users WHERE empno LIKE 'TEST%' AND deleted = 1
                  ) AND (deleted = 0 OR deleted IS NULL)`,
            [],
            function(boothErr) {
              if (boothErr) {
                console.error('테스트 사용자 부스 참여 삭제 오류:', boothErr);
                // 부스 참여 삭제 실패해도 사용자 삭제는 성공했으므로 경고만 반환
              }

              res.json({
                success: true,
                message: `테스트 사용자 ${deletedCount}명이 삭제(사용안함) 처리되었습니다.`,
                deletedCount: deletedCount,
                lotteryNumbersDeleted: lotteryDeletedCount,
                boothParticipationsDeleted: boothErr ? 0 : this.changes
              });
            }
          );
        }
      );
    }
  );
});

module.exports = router;

