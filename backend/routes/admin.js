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

  // 전체 참가자 수
  db.get('SELECT COUNT(*) as total FROM users', (err, userCount) => {
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

      // 부스 참여 현황
      db.all(`SELECT booth_code, COUNT(*) as count 
              FROM booth_participations 
              GROUP BY booth_code`,
        (err, boothStats) => {
          if (err) {
            return res.status(500).json({
              success: false,
              message: '서버 오류가 발생했습니다.'
            });
          }

          // 모바일상품권 추첨 자격자 수 (부스 3개 이상 참여)
          db.all(`SELECT u.id, COUNT(bp.id) as booth_count
                  FROM users u
                  INNER JOIN booth_participations bp ON u.id = bp.user_id
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
                 COUNT(bp.id) as booth_count,
                 (SELECT COUNT(*) FROM prize_claims WHERE user_id = u.id) as prize_claimed
          FROM users u
          LEFT JOIN booth_participations bp ON u.id = bp.user_id
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

  db.all(`SELECT u.empname, u.deptname, u.posname, bp.booth_code, bp.scanned_at
          FROM booth_participations bp
          JOIN users u ON bp.user_id = u.id
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

  // 먼저 부스 3개 이상 참여한 사용자 조회
  db.all(`SELECT 
            u.id,
            u.empno,
            u.empname,
            u.deptname,
            u.posname,
            COUNT(bp.id) as booth_count
          FROM users u
          INNER JOIN booth_participations bp ON u.id = bp.user_id
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

module.exports = router;

