const express = require('express');
const router = express.Router();
const { getDB } = require('../database');

// 로그 조회 (관리자용)
router.get('/', (req, res) => {
  const db = getDB();
  const {
    page = 1,
    limit = 100,
    startDate,
    endDate,
    userId,
    path,
    ipAddress,
    statusCode,
    method
  } = req.query;

  const offset = (parseInt(page) - 1) * parseInt(limit);
  let whereConditions = [];
  let params = [];

  if (startDate) {
    whereConditions.push('timestamp >= ?');
    params.push(startDate);
  }

  if (endDate) {
    whereConditions.push('timestamp <= ?');
    params.push(endDate);
  }

  if (userId) {
    whereConditions.push('user_id = ?');
    params.push(userId);
  }

  if (path) {
    whereConditions.push('path LIKE ?');
    params.push(`%${path}%`);
  }

  if (ipAddress) {
    whereConditions.push('ip_address = ?');
    params.push(ipAddress);
  }

  if (statusCode) {
    whereConditions.push('status_code = ?');
    params.push(statusCode);
  }

  if (method) {
    whereConditions.push('method = ?');
    params.push(method);
  }

  const whereClause = whereConditions.length > 0 
    ? 'WHERE ' + whereConditions.join(' AND ')
    : '';

  // 전체 개수 조회
  db.get(`SELECT COUNT(*) as total FROM web_logs ${whereClause}`, params, (err, countResult) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: '로그 조회 중 오류가 발생했습니다.'
      });
    }

    // 로그 목록 조회
    db.all(`SELECT * FROM web_logs 
            ${whereClause}
            ORDER BY timestamp DESC 
            LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset],
      (err, logs) => {
        if (err) {
          return res.status(500).json({
            success: false,
            message: '로그 조회 중 오류가 발생했습니다.'
          });
        }

        res.json({
          success: true,
          logs: logs || [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: countResult.total,
            totalPages: Math.ceil(countResult.total / parseInt(limit))
          }
        });
      }
    );
  });
});

// 통계 조회
router.get('/stats', (req, res) => {
  const db = getDB();
  const { startDate, endDate } = req.query;

  let whereClause = '';
  let params = [];

  if (startDate && endDate) {
    whereClause = 'WHERE timestamp >= ? AND timestamp <= ?';
    params = [startDate, endDate];
  }

  // 전체 요청 수
  db.get(`SELECT COUNT(*) as total FROM web_logs ${whereClause}`, params, (err, totalResult) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: '통계 조회 중 오류가 발생했습니다.'
      });
    }

    // 경로별 통계
    db.all(`SELECT path, COUNT(*) as count, 
                   AVG(response_time_ms) as avg_response_time,
                   COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count
            FROM web_logs 
            ${whereClause}
            GROUP BY path
            ORDER BY count DESC
            LIMIT 20`,
      params,
      (err, pathStats) => {
        if (err) {
          return res.status(500).json({
            success: false,
            message: '통계 조회 중 오류가 발생했습니다.'
          });
        }

        // IP별 통계
        db.all(`SELECT ip_address, COUNT(*) as count
                FROM web_logs 
                ${whereClause}
                GROUP BY ip_address
                ORDER BY count DESC
                LIMIT 20`,
          params,
          (err, ipStats) => {
            if (err) {
              return res.status(500).json({
                success: false,
                message: '통계 조회 중 오류가 발생했습니다.'
              });
            }

            // 상태 코드별 통계
            db.all(`SELECT status_code, COUNT(*) as count
                    FROM web_logs 
                    ${whereClause}
                    GROUP BY status_code
                    ORDER BY status_code`,
              params,
              (err, statusStats) => {
                if (err) {
                  return res.status(500).json({
                    success: false,
                    message: '통계 조회 중 오류가 발생했습니다.'
                  });
                }

                // 사용자별 통계
                db.all(`SELECT user_id, user_empno, COUNT(*) as count
                        FROM web_logs 
                        ${whereClause}
                        WHERE user_id IS NOT NULL
                        GROUP BY user_id, user_empno
                        ORDER BY count DESC
                        LIMIT 20`,
                  params,
                  (err, userStats) => {
                    if (err) {
                      return res.status(500).json({
                        success: false,
                        message: '통계 조회 중 오류가 발생했습니다.'
                      });
                    }

                    res.json({
                      success: true,
                      stats: {
                        total: totalResult.total,
                        pathStats: pathStats || [],
                        ipStats: ipStats || [],
                        statusStats: statusStats || [],
                        userStats: userStats || []
                      }
                    });
                  }
                );
              }
            );
          }
        );
      }
    );
  });
});

// 시간대별 통계
router.get('/hourly', (req, res) => {
  const db = getDB();
  const { startDate, endDate } = req.query;

  let whereClause = '';
  let params = [];

  if (startDate && endDate) {
    whereClause = 'WHERE timestamp >= ? AND timestamp <= ?';
    params = [startDate, endDate];
  }

  db.all(`SELECT 
            strftime('%Y-%m-%d %H:00:00', timestamp) as hour,
            COUNT(*) as count,
            AVG(response_time_ms) as avg_response_time
          FROM web_logs 
          ${whereClause}
          GROUP BY hour
          ORDER BY hour DESC
          LIMIT 48`,
    params,
    (err, hourlyStats) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: '시간대별 통계 조회 중 오류가 발생했습니다.'
        });
      }

      res.json({
        success: true,
        hourlyStats: hourlyStats || []
      });
    }
  );
});

// 클라이언트 측 페이지 뷰 로깅
router.post('/page-view', (req, res) => {
  // 응답을 먼저 보내고 로그는 비동기로 처리
  res.json({ success: true });

  try {
    const { path, referrer, timestamp, screen, viewport, userAgent, language, hasAuth, action } = req.body;
    const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                     req.headers['x-real-ip'] ||
                     req.connection.remoteAddress ||
                     req.socket.remoteAddress ||
                     req.ip ||
                     'unknown';

    // 사용자 정보 추출 (토큰에서)
    const authHeader = req.headers.authorization;
    const db = getDB();
    
    if (authHeader && hasAuth) {
      const token = authHeader.replace('Bearer ', '');
      const { verifyToken } = require('../utils/jwt');
      const decoded = verifyToken(token);
      
      if (decoded) {
        db.get('SELECT id, empno, empname, deptname, posname FROM users WHERE token_secret = ?', 
          [decoded.secret], (err, user) => {
            const userId = (!err && user) ? user.id : null;
            const userEmpno = (!err && user) ? user.empno : null;
            const userEmpname = (!err && user) ? user.empname : null;
            const userDeptname = (!err && user) ? user.deptname : null;
            const userPosname = (!err && user) ? user.posname : null;
            savePageViewLog(userId, userEmpno, userEmpname, userDeptname, userPosname);
          });
      } else {
        savePageViewLog(null, null, null, null, null);
      }
    } else {
      savePageViewLog(null, null, null, null, null);
    }

    function savePageViewLog(userId, userEmpno, userEmpname, userDeptname, userPosname) {
      // 페이지 뷰 로그를 web_logs 테이블에 저장
      db.run(`INSERT INTO web_logs 
              (timestamp, ip_address, user_agent, method, path, query_params,
               status_code, user_id, user_empno, user_empname, user_deptname, user_posname, 
               referer, response_time_ms, request_body)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          timestamp || new Date().toISOString(),
          ipAddress,
          userAgent || req.headers['user-agent'] || 'unknown',
          'GET',
          path || req.path,
          null,
          200,
          userId || null,
          userEmpno || null,
          userEmpname || null,
          userDeptname || null,
          userPosname || null,
          referrer || req.headers.referer || null,
          null,
          JSON.stringify({
            screen,
            viewport,
            language,
            action: action || 'page_view',
            logType: 'page_view'
          }).substring(0, 1000)
        ],
        (err) => {
          if (err) {
            const { log } = require('../utils/logger');
            log.error('페이지 뷰 로그 저장 오류', { err });
          }
        }
      );
    }
  } catch (error) {
    const { log } = require('../utils/logger');
    log.error('페이지 뷰 로깅 오류', { error: error.message });
  }
});

// 클라이언트 측 이벤트 로깅
router.post('/event', (req, res) => {
  // 응답을 먼저 보내고 로그는 비동기로 처리
  res.json({ success: true });

  try {
    const { type, data, path, timestamp } = req.body;
    const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                     req.headers['x-real-ip'] ||
                     req.connection.remoteAddress ||
                     req.socket.remoteAddress ||
                     req.ip ||
                     'unknown';

    // 사용자 정보 추출
    const authHeader = req.headers.authorization;
    const db = getDB();
    
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { verifyToken } = require('../utils/jwt');
      const decoded = verifyToken(token);
      
      if (decoded) {
        db.get('SELECT id, empno, empname, deptname, posname FROM users WHERE token_secret = ?', 
          [decoded.secret], (err, user) => {
            const userId = (!err && user) ? user.id : null;
            const userEmpno = (!err && user) ? user.empno : null;
            const userEmpname = (!err && user) ? user.empname : null;
            const userDeptname = (!err && user) ? user.deptname : null;
            const userPosname = (!err && user) ? user.posname : null;
            saveEventLog(userId, userEmpno, userEmpname, userDeptname, userPosname);
          });
      } else {
        saveEventLog(null, null, null, null, null);
      }
    } else {
      saveEventLog(null, null, null, null, null);
    }

    function saveEventLog(userId, userEmpno, userEmpname, userDeptname, userPosname) {
      // 이벤트 로그를 web_logs 테이블에 저장
      db.run(`INSERT INTO web_logs 
              (timestamp, ip_address, user_agent, method, path, query_params,
               status_code, user_id, user_empno, user_empname, user_deptname, user_posname, 
               referer, response_time_ms, request_body)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          timestamp || new Date().toISOString(),
          ipAddress,
          req.headers['user-agent'] || 'unknown',
          'POST',
          path || '/api/logs/event',
          null,
          200,
          userId || null,
          userEmpno || null,
          userEmpname || null,
          userDeptname || null,
          userPosname || null,
          req.headers.referer || null,
          null,
          JSON.stringify({
            eventType: type,
            eventData: data,
            logType: 'client_event'
          }).substring(0, 1000)
        ],
        (err) => {
          if (err) {
            const { log } = require('../utils/logger');
            log.error('이벤트 로그 저장 오류', { err });
          }
        }
      );
    }
  } catch (error) {
    const { log } = require('../utils/logger');
    log.error('이벤트 로깅 오류', { error: error.message });
  }
});

module.exports = router;

