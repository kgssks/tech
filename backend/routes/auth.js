const express = require('express');
const router = express.Router();
const axios = require('axios');
const { getDB } = require('../database');
const { generateToken, verifyToken, extractSecret } = require('../utils/jwt');
const { log } = require('../utils/logger');

// KB 인증 API URL (환경 변수에서 가져오거나 기본값 사용)
const KB_AUTH_API_URL = process.env.KB_AUTH_API_URL || 'https://devlxp.kbstar.com/lmd/geibp';

// KB 인증 API 호출
async function callKBAuthAPI(empno, lastNumber) {
  try {
    log.debug(`KB 인증 API 호출: ${KB_AUTH_API_URL}`, { empno, lastNumber: '***' });
    
    const response = await axios.post(KB_AUTH_API_URL, {
      job: 'searchEmpCert',
      searchKbemp: empno,
      lastNumber: lastNumber
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10초 타임아웃
    });

    log.debug('KB 인증 API 응답:', { 
      status: response.status, 
      dataStatus: response.data?.data?.status 
    });

    return response.data;
  } catch (error) {
    log.error('KB 인증 API 오류:', {
      message: error.message,
      code: error.code,
      response: error.response?.data
    });

    if (error.response) {
      // API 응답이 있는 경우
      throw new Error('KB 인증 서버에서 오류가 발생했습니다.');
    } else if (error.request) {
      // 요청은 보냈지만 응답이 없는 경우
      throw new Error('KB 인증 서버에 연결할 수 없습니다. 네트워크를 확인해주세요.');
    } else {
      // 요청 설정 중 오류
      throw new Error('인증 요청 처리 중 오류가 발생했습니다.');
    }
  }
}

// 인증 처리
router.post('/login', async (req, res) => {
  try {
    const { empno, lastNumber } = req.body;

    // 입력값 검증
    if (!empno || !lastNumber) {
      log.warn('인증 요청: 필수 입력값 누락', { empno: !!empno, lastNumber: !!lastNumber });
      return res.status(400).json({
        success: false,
        message: '직원번호와 휴대번호 뒷4자리를 입력해주세요.'
      });
    }

    // 휴대번호 뒷4자리 형식 검증
    if (!/^\d{4}$/.test(lastNumber)) {
      log.warn('인증 요청: 잘못된 휴대번호 형식', { empno, lastNumber: '***' });
      return res.status(400).json({
        success: false,
        message: '휴대번호 뒷4자리는 숫자 4자리여야 합니다.'
      });
    }

    log.info('KB 인증 API 호출 시작', { empno, lastNumber: '***' });

    // KB 인증 API 호출
    const kbResponse = await callKBAuthAPI(empno, lastNumber);

    // KB API 응답 검증
    if (!kbResponse || !kbResponse.data) {
      log.error('KB 인증 API 응답 형식 오류', { response: kbResponse });
      return res.status(500).json({
        success: false,
        message: '인증 서버 응답 형식이 올바르지 않습니다.'
      });
    }

    // 인증 실패 처리
    if (kbResponse.data.status === 'fail') {
      log.warn('KB 인증 실패', { 
        empno, 
        message: kbResponse.data.message 
      });
      return res.status(401).json({
        success: false,
        message: kbResponse.data.message || '인증번호가 일치하지 않습니다.'
      });
    }

    // 인증 성공 처리
    if (kbResponse.data.status === 'success') {
      const { empname, deptname, posname, empno: empnoFromAPI } = kbResponse.data;

      // API 응답 데이터 검증
      if (!empnoFromAPI || !empname) {
        log.error('KB 인증 API 응답 데이터 누락', { 
          empnoFromAPI: !!empnoFromAPI, 
          empname: !!empname 
        });
        return res.status(500).json({
          success: false,
          message: '인증 서버에서 사용자 정보를 받아올 수 없습니다.'
        });
      }

      const db = getDB();
      
      // 토큰 생성
      const { token, secret } = generateToken(empnoFromAPI);

      // DB에 사용자 정보 저장 또는 업데이트
      return new Promise((resolve, reject) => {
        // 먼저 기존 사용자 확인
        db.get('SELECT id FROM users WHERE empno = ?', [empnoFromAPI], (err, existingUser) => {
          if (err) {
            log.error('기존 사용자 조회 오류', { err, empno: empnoFromAPI });
            reject(err);
            return;
          }

          let userId;
          let isNewUser = !existingUser;

          if (existingUser) {
            // 기존 사용자: 업데이트만 수행
            userId = existingUser.id;
            db.run(`UPDATE users 
                    SET empname = ?, deptname = ?, posname = ?, phone_last = ?, token_secret = ?, updated_at = datetime('now')
                    WHERE empno = ?`,
              [empname, deptname, posname, lastNumber, secret, empnoFromAPI],
              function(err) {
                if (err) {
                  log.error('사용자 정보 DB 업데이트 오류', { err, empno: empnoFromAPI });
                  reject(err);
                } else {
                  log.info('기존 사용자 정보 업데이트 완료', { 
                    empno: empnoFromAPI, 
                    empname,
                    userId 
                  });
                  
                  // 기존 사용자는 추첨 번호를 이미 가지고 있으므로 추가로 부여하지 않음
                  // 추첨 번호가 없을 가능성은 거의 없지만, 확인만 하고 로그만 남김
                  // user_id에 UNIQUE 제약이 있으므로 중복 방지됨
                  db.get('SELECT lottery_number FROM lottery_numbers WHERE user_id = ?', 
                    [userId], (err, existingLottery) => {
                    if (err) {
                      log.error('추첨 번호 조회 오류', { err, userId });
                    } else if (!existingLottery) {
                      // 기존 사용자지만 추첨 번호가 없는 경우 (이전 데이터 마이그레이션 등)
                      // INSERT OR IGNORE를 사용하여 중복 방지 및 안전하게 부여
                      // user_id에 UNIQUE 제약이 있어서 중복 방지됨
                      db.run('INSERT OR IGNORE INTO lottery_numbers (user_id, lottery_number) VALUES (?, ?)',
                        [userId, userId], (err) => {
                          if (err) {
                            log.error('추첨 번호 부여 오류', { err, userId });
                          } else {
                            log.info('기존 사용자 추첨 번호 부여 완료 (누락된 경우)', { userId, lotteryNumber: userId });
                          }
                        });
                    } else {
                      log.debug('기존 사용자 추첨 번호 확인됨 - 추가 부여하지 않음', { 
                        userId, 
                        lotteryNumber: existingLottery.lottery_number 
                      });
                    }
                  });

                  resolve(res.json({
                    success: true,
                    token,
                    user: {
                      empname,
                      deptname,
                      posname,
                      empno: empnoFromAPI
                    }
                  }));
                }
              }
            );
          } else {
            // 신규 사용자: INSERT 수행
            db.run(`INSERT INTO users 
                    (empno, empname, deptname, posname, phone_last, token_secret, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
              [empnoFromAPI, empname, deptname, posname, lastNumber, secret],
              function(err) {
                if (err) {
                  log.error('사용자 정보 DB 저장 오류', { err, empno: empnoFromAPI });
                  reject(err);
                } else {
                  userId = this.lastID;
                  log.info('신규 사용자 인증 성공 및 DB 저장 완료', { 
                    empno: empnoFromAPI, 
                    empname,
                    userId 
                  });

                  // 신규 사용자: 추첨 번호 부여
                  // INSERT OR IGNORE를 사용하여 중복 방지
                  db.run('INSERT OR IGNORE INTO lottery_numbers (user_id, lottery_number) VALUES (?, ?)',
                    [userId, userId], (err) => {
                      if (err) {
                        log.error('추첨 번호 부여 오류', { err, userId });
                      } else {
                        log.info('신규 사용자 추첨 번호 부여 완료', { userId, lotteryNumber: userId });
                      }
                    });

                  resolve(res.json({
                    success: true,
                    token,
                    user: {
                      empname,
                      deptname,
                      posname,
                      empno: empnoFromAPI
                    }
                  }));
                }
              }
            );
          }
        });
      });
    }

    // 예상치 못한 응답 상태
    log.error('KB 인증 API 예상치 못한 응답 상태', { 
      status: kbResponse.data.status,
      response: kbResponse.data 
    });
    return res.status(500).json({
      success: false,
      message: '인증 처리 중 오류가 발생했습니다.'
    });
  } catch (error) {
    log.error('인증 처리 오류', { 
      error: error.message, 
      stack: error.stack 
    });
    return res.status(500).json({
      success: false,
      message: error.message || '네트워크 오류가 발생했습니다. 다시 시도해주세요.'
    });
  }
});

// 토큰 검증 및 사용자 정보 조회
router.get('/verify', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || req.headers['kb-auth'];
    
    if (!authHeader) {
      log.warn('토큰 검증 실패: 토큰 없음');
      return res.status(401).json({
        success: false,
        message: '인증 토큰이 없습니다.'
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = verifyToken(token);

    if (!decoded) {
      log.warn('토큰 검증 실패: 토큰 만료 또는 유효하지 않음');
      return res.status(401).json({
        success: false,
        message: '인증 토큰이 만료되었습니다. 다시 로그인해주세요.'
      });
    }

    const secret = decoded.secret;
    const db = getDB();

    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE token_secret = ?', [secret], (err, user) => {
        if (err) {
          log.error('토큰 검증 중 DB 오류', { err, secret: '***' });
          reject(err);
        } else if (!user) {
          log.warn('토큰 검증 실패: 사용자 정보 없음', { secret: '***' });
          resolve(res.status(401).json({
            success: false,
            message: '사용자를 찾을 수 없습니다.'
          }));
        } else {
          log.debug('토큰 검증 성공', { empno: user.empno, empname: user.empname });
          resolve(res.json({
            success: true,
            user: {
              empname: user.empname,
              deptname: user.deptname,
              posname: user.posname,
              empno: user.empno
            }
          }));
        }
      });
    });
  } catch (error) {
    log.error('토큰 검증 오류', { 
      error: error.message, 
      stack: error.stack 
    });
    return res.status(500).json({
      success: false,
      message: '서버 오류가 발생했습니다.'
    });
  }
});

module.exports = router;

