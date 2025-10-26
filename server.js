const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const bodyParser = require('body-parser');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const CryptoJS = require('crypto-js');

// 로깅 시스템 import
const logger = require('./config/logger');
const { 
    morganMiddleware, 
    requestLogger, 
    errorLogger, 
    dbLogger, 
    authLogger, 
    eventLogger, 
    adminLogger 
} = require('./middleware/logging');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'ai-tech-forum-secret-key-2024';
const TOKEN_EXPIRY = '30d';

// 서버 시작 로깅
logger.info('Starting AI Tech Forum server', {
    port: PORT,
    nodeEnv: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
});

// 미들웨어 설정
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// 로깅 미들웨어 추가
app.use(morganMiddleware);
app.use(requestLogger);

// SQLite 데이터베이스 초기화
const db = new sqlite3.Database('forum.db', (err) => {
    if (err) {
        logger.error('Database connection failed', {
            error: err.message,
            stack: err.stack
        });
    } else {
        logger.info('Database connected successfully', {
            database: 'forum.db',
            timestamp: new Date().toISOString()
        });
    }
});

// 데이터베이스 테이블 생성
db.serialize(() => {
    logger.info('Initializing database tables');
  // 사용자 테이블
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT UNIQUE NOT NULL,
    phone_last4 TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 이벤트 참여 현황 테이블
  db.run(`CREATE TABLE IF NOT EXISTS event_participation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    entry_confirmed BOOLEAN DEFAULT 0,
    booth_1 BOOLEAN DEFAULT 0,
    booth_2 BOOLEAN DEFAULT 0,
    booth_3 BOOLEAN DEFAULT 0,
    booth_4 BOOLEAN DEFAULT 0,
    booth_5 BOOLEAN DEFAULT 0,
    survey_participated BOOLEAN DEFAULT 0,
    prize_eligible BOOLEAN DEFAULT 0,
    lottery_number TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // 설문조사 테이블
  db.run(`CREATE TABLE IF NOT EXISTS surveys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    session_id TEXT NOT NULL,
    session_name TEXT NOT NULL,
    satisfaction_score INTEGER,
    instructor_score INTEGER,
    improvement_suggestions TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // 경품 교환 테이블
  db.run(`CREATE TABLE IF NOT EXISTS prize_exchanges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    prize_number INTEGER NOT NULL,
    prize_token TEXT NOT NULL,
    admin_id INTEGER NOT NULL,
    exchanged_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (admin_id) REFERENCES admins (id)
  )`);

  // 관리자 테이블
  db.run(`CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 기본 관리자 계정 생성 (비밀번호: admin123)
  const adminPassword = bcrypt.hashSync('admin123', 10);
  db.run(`INSERT OR IGNORE INTO admins (username, password_hash) VALUES ('admin', ?)`, [adminPassword]);
});

// JWT 토큰 검증 미들웨어
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '인증 토큰이 필요합니다.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: '토큰이 유효하지 않습니다.' });
    }
    req.user = user;
    next();
  });
};

// 관리자 인증 미들웨어
const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err || !user.isAdmin) {
      return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
    }
    req.user = user;
    next();
  });
};

// 인증 API
app.post('/api/auth', async (req, res) => {
  const startTime = Date.now();
  const { employee_id, phone_last4 } = req.body;
  const clientIp = req.ip || req.connection.remoteAddress;

  logger.info('Authentication attempt', {
    employee_id,
    ip: clientIp,
    userAgent: req.get('User-Agent'),
    requestId: req.requestId
  });

  try {
    if (!employee_id || !phone_last4) {
      logger.warn('Authentication failed - missing credentials', {
        employee_id: employee_id || 'missing',
        ip: clientIp,
        requestId: req.requestId
      });
      return res.status(400).json({ error: '직원번호와 휴대번호 뒷4자리를 입력해주세요.' });
    }

    // 사용자 조회
    const queryStart = Date.now();
    db.get('SELECT * FROM users WHERE employee_id = ?', [employee_id], async (err, user) => {
      const queryDuration = Date.now() - queryStart;
      dbLogger.logQuery('SELECT * FROM users WHERE employee_id = ?', [employee_id], queryDuration);

      if (err) {
        logger.error('Database error during authentication', {
          error: err.message,
          employee_id,
          ip: clientIp,
          requestId: req.requestId
        });
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
      }

      if (!user) {
        authLogger.logLogin(null, employee_id, clientIp, false, new Error('User not found'));
        return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
      }

      // 비밀번호 검증 (휴대번호 뒷4자리)
      if (user.phone_last4 !== phone_last4) {
        authLogger.logLogin(user.id, employee_id, clientIp, false, new Error('Invalid phone number'));
        return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
      }

      // JWT 토큰 생성
      const token = jwt.sign(
        { 
          userId: user.id, 
          employeeId: user.employee_id,
          isAdmin: false 
        },
        JWT_SECRET,
        { expiresIn: TOKEN_EXPIRY }
      );

      authLogger.logLogin(user.id, employee_id, clientIp, true);

      logger.info('Authentication successful', {
        userId: user.id,
        employee_id,
        ip: clientIp,
        duration: `${Date.now() - startTime}ms`,
        requestId: req.requestId
      });

      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          employee_id: user.employee_id
        }
      });
    });
  } catch (error) {
    logger.error('Authentication error', {
      error: error.message,
      stack: error.stack,
      employee_id,
      ip: clientIp,
      requestId: req.requestId
    });
    res.status(500).json({ error: '네트워크 오류가 발생했습니다. 다시 시도해주세요.' });
  }
});

// 토큰 검증 API
app.get('/api/auth/verify', authenticateToken, (req, res) => {
  const clientIp = req.ip || req.connection.remoteAddress;
  
  logger.info('Token verification successful', {
    userId: req.user.userId,
    employeeId: req.user.employeeId,
    ip: clientIp,
    requestId: req.requestId
  });

  res.json({
    success: true,
    user: {
      id: req.user.userId,
      employee_id: req.user.employeeId
    }
  });
});

// 관리자 인증 API
app.post('/api/admin/auth', async (req, res) => {
  const startTime = Date.now();
  const { username, password } = req.body;
  const clientIp = req.ip || req.connection.remoteAddress;

  logger.info('Admin authentication attempt', {
    username,
    ip: clientIp,
    userAgent: req.get('User-Agent'),
    requestId: req.requestId
  });

  try {
    if (!username || !password) {
      logger.warn('Admin authentication failed - missing credentials', {
        username: username || 'missing',
        ip: clientIp,
        requestId: req.requestId
      });
      return res.status(400).json({ error: '사용자명과 비밀번호를 입력해주세요.' });
    }

    const queryStart = Date.now();
    db.get('SELECT * FROM admins WHERE username = ?', [username], async (err, admin) => {
      const queryDuration = Date.now() - queryStart;
      dbLogger.logQuery('SELECT * FROM admins WHERE username = ?', [username], queryDuration);

      if (err) {
        logger.error('Database error during admin authentication', {
          error: err.message,
          username,
          ip: clientIp,
          requestId: req.requestId
        });
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
      }

      if (!admin) {
        authLogger.logLogin(null, username, clientIp, false, new Error('Admin not found'));
        return res.status(401).json({ error: '사용자명 또는 비밀번호가 올바르지 않습니다.' });
      }

      const validPassword = await bcrypt.compare(password, admin.password_hash);
      if (!validPassword) {
        authLogger.logLogin(admin.id, username, clientIp, false, new Error('Invalid password'));
        return res.status(401).json({ error: '사용자명 또는 비밀번호가 올바르지 않습니다.' });
      }

      const token = jwt.sign(
        { 
          adminId: admin.id, 
          username: admin.username,
          isAdmin: true 
        },
        JWT_SECRET,
        { expiresIn: TOKEN_EXPIRY }
      );

      authLogger.logLogin(admin.id, username, clientIp, true);
      adminLogger.logAdminAction(admin.id, 'login', { ip: clientIp }, clientIp);

      logger.info('Admin authentication successful', {
        adminId: admin.id,
        username,
        ip: clientIp,
        duration: `${Date.now() - startTime}ms`,
        requestId: req.requestId
      });

      res.json({
        success: true,
        token,
        admin: {
          id: admin.id,
          username: admin.username
        }
      });
    });
  } catch (error) {
    logger.error('Admin authentication error', {
      error: error.message,
      stack: error.stack,
      username,
      ip: clientIp,
      requestId: req.requestId
    });
    res.status(500).json({ error: '네트워크 오류가 발생했습니다. 다시 시도해주세요.' });
  }
});

// 사용자 등록 API
app.post('/api/register', async (req, res) => {
  const startTime = Date.now();
  const { employee_id, phone_last4 } = req.body;
  const clientIp = req.ip || req.connection.remoteAddress;

  logger.info('User registration attempt', {
    employee_id,
    ip: clientIp,
    userAgent: req.get('User-Agent'),
    requestId: req.requestId
  });

  try {
    if (!employee_id || !phone_last4) {
      logger.warn('Registration failed - missing credentials', {
        employee_id: employee_id || 'missing',
        ip: clientIp,
        requestId: req.requestId
      });
      return res.status(400).json({ error: '직원번호와 휴대번호 뒷4자리를 입력해주세요.' });
    }

    // 중복 확인
    const queryStart = Date.now();
    db.get('SELECT * FROM users WHERE employee_id = ?', [employee_id], (err, existingUser) => {
      const queryDuration = Date.now() - queryStart;
      dbLogger.logQuery('SELECT * FROM users WHERE employee_id = ?', [employee_id], queryDuration);

      if (err) {
        logger.error('Database error during registration check', {
          error: err.message,
          employee_id,
          ip: clientIp,
          requestId: req.requestId
        });
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
      }

      if (existingUser) {
        logger.warn('Registration failed - user already exists', {
          employee_id,
          ip: clientIp,
          requestId: req.requestId
        });
        return res.status(400).json({ error: '이미 등록된 직원번호입니다.' });
      }

      // 사용자 등록
      const passwordHash = bcrypt.hashSync(phone_last4, 10);
      const insertStart = Date.now();
      db.run(
        'INSERT INTO users (employee_id, phone_last4, password_hash) VALUES (?, ?, ?)',
        [employee_id, phone_last4, passwordHash],
        function(err) {
          const insertDuration = Date.now() - insertStart;
          dbLogger.logQuery('INSERT INTO users', [employee_id, phone_last4, '***'], insertDuration);

          if (err) {
            logger.error('Database error during user registration', {
              error: err.message,
              employee_id,
              ip: clientIp,
              requestId: req.requestId
            });
            return res.status(500).json({ error: '사용자 등록 중 오류가 발생했습니다.' });
          }

          logger.info('User registration successful', {
            userId: this.lastID,
            employee_id,
            ip: clientIp,
            duration: `${Date.now() - startTime}ms`,
            requestId: req.requestId
          });

          res.json({
            success: true,
            message: '등록이 완료되었습니다.'
          });
        }
      );
    });
  } catch (error) {
    logger.error('Registration error', {
      error: error.message,
      stack: error.stack,
      employee_id,
      ip: clientIp,
      requestId: req.requestId
    });
    res.status(500).json({ error: '네트워크 오류가 발생했습니다. 다시 시도해주세요.' });
  }
});

// 이벤트 참여 현황 조회 API
app.get('/api/event/status', authenticateToken, (req, res) => {
  const userId = req.user.userId;
  const clientIp = req.ip || req.connection.remoteAddress;

  logger.info('Event status request', {
    userId,
    employeeId: req.user.employeeId,
    ip: clientIp,
    requestId: req.requestId
  });

  const queryStart = Date.now();
  db.get(
    'SELECT * FROM event_participation WHERE user_id = ?',
    [userId],
    (err, participation) => {
      const queryDuration = Date.now() - queryStart;
      dbLogger.logQuery('SELECT * FROM event_participation WHERE user_id = ?', [userId], queryDuration);

      if (err) {
        logger.error('Database error during event status check', {
          error: err.message,
          userId,
          ip: clientIp,
          requestId: req.requestId
        });
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
      }

      if (!participation) {
        // 새로운 참여 기록 생성
        const insertStart = Date.now();
        db.run(
          'INSERT INTO event_participation (user_id) VALUES (?)',
          [userId],
          function(err) {
            const insertDuration = Date.now() - insertStart;
            dbLogger.logQuery('INSERT INTO event_participation', [userId], insertDuration);

            if (err) {
              logger.error('Database error during event participation creation', {
                error: err.message,
                userId,
                ip: clientIp,
                requestId: req.requestId
              });
              return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
            }

            logger.info('New event participation record created', {
              userId,
              participationId: this.lastID,
              ip: clientIp,
              requestId: req.requestId
            });

            res.json({
              entry_confirmed: false,
              booth_1: false,
              booth_2: false,
              booth_3: false,
              booth_4: false,
              booth_5: false,
              survey_participated: false,
              prize_eligible: false,
              lottery_number: null
            });
          }
        );
      } else {
        // 설문 참여 상태 확인 (세션별)
        const surveyCheckStart = Date.now();
        db.all(
          'SELECT session_id, session_name FROM surveys WHERE user_id = ? ORDER BY session_id',
          [userId],
          (err, surveyResults) => {
            const surveyCheckDuration = Date.now() - surveyCheckStart;
            dbLogger.logQuery('SELECT surveys by session', [userId], surveyCheckDuration);

            if (err) {
              logger.error('Database error during survey check', {
                error: err.message,
                userId,
                ip: clientIp,
                requestId: req.requestId
              });
              return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
            }

            // 부스 참여 수 계산
            const boothCount = [
              participation.booth_1,
              participation.booth_2,
              participation.booth_3,
              participation.booth_4,
              participation.booth_5
            ].filter(Boolean).length;

            // 세션별 설문 참여 수 계산
            const sessionSurveyCount = surveyResults.length;
            const surveyParticipated = sessionSurveyCount > 0;

            // 새로운 경품 자격 조건 적용
            // 부스 3개 이상 또는 세션 설문 3개 이상 또는 부스/세션 설문 합계 4개 이상
            const isPrizeEligible = boothCount >= 3 || sessionSurveyCount >= 3 || (boothCount + sessionSurveyCount) >= 4;

            // 세션별 설문 정보 구성
            const sessionSurveys = surveyResults.map(survey => ({
              session_id: survey.session_id,
              session_name: survey.session_name
            }));

            logger.info('Event status retrieved', {
              userId,
              participation: {
                entry_confirmed: participation.entry_confirmed,
                booth_participation: boothCount,
                session_survey_participation: sessionSurveyCount,
                survey_participated: surveyParticipated,
                prize_eligible: isPrizeEligible,
                session_surveys: sessionSurveys
              },
              ip: clientIp,
              requestId: req.requestId
            });

            res.json({
              ...participation,
              survey_participated: surveyParticipated,
              booth_participation: boothCount,
              session_survey_participation: sessionSurveyCount,
              prize_eligible: isPrizeEligible,
              session_surveys: sessionSurveys
            });
          }
        );
      }
    }
  );
});

// 입장 확인 API
// 입장 확인 API (비활성화됨 - 개선된 이벤트 조건에 따라 입장 확인 불필요)
app.post('/api/event/entry', authenticateToken, (req, res) => {
  res.status(410).json({ 
    error: '입장 확인 기능이 비활성화되었습니다.',
    message: '개선된 이벤트 조건에 따라 입장 확인이 더 이상 필요하지 않습니다.'
  });
});

// 부스 참여 API
app.post('/api/event/booth', authenticateToken, (req, res) => {
  const userId = req.user.userId;
  const { booth_number } = req.body;
  const clientIp = req.ip || req.connection.remoteAddress;

  logger.info('Booth participation attempt', {
    userId,
    employeeId: req.user.employeeId,
    boothNumber: booth_number,
    ip: clientIp,
    requestId: req.requestId
  });

  if (!booth_number || booth_number < 1 || booth_number > 5) {
    logger.warn('Booth participation failed - invalid booth number', {
      userId,
      boothNumber: booth_number,
      ip: clientIp,
      requestId: req.requestId
    });
    return res.status(400).json({ error: '올바르지 않은 부스 번호입니다.' });
  }

  const boothColumn = `booth_${booth_number}`;
  const updateStart = Date.now();
  db.run(
    `UPDATE event_participation SET ${boothColumn} = 1 WHERE user_id = ?`,
    [userId],
    function(err) {
      const updateDuration = Date.now() - updateStart;
      dbLogger.logQuery(`UPDATE event_participation SET ${boothColumn} = 1`, [userId], updateDuration);

      if (err) {
        logger.error('Database error during booth participation', {
          error: err.message,
          userId,
          boothNumber: booth_number,
          ip: clientIp,
          requestId: req.requestId
        });
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
      }

      // 3개 이상 부스 참여 시 경품 자격 부여
      const checkStart = Date.now();
      db.get(
        'SELECT booth_1, booth_2, booth_3, booth_4, booth_5, survey_participated FROM event_participation WHERE user_id = ?',
        [userId],
        (err, participation) => {
          const checkDuration = Date.now() - checkStart;
          dbLogger.logQuery('SELECT booth participation status', [userId], checkDuration);

          if (err) {
            logger.error('Database error during participation check', {
              error: err.message,
              userId,
              ip: clientIp,
              requestId: req.requestId
            });
            return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
          }

          const boothCount = [participation.booth_1, participation.booth_2, participation.booth_3, participation.booth_4, participation.booth_5].filter(Boolean).length;
          const totalCount = boothCount + (participation.survey_participated ? 1 : 0);

          eventLogger.logEventParticipation(userId, 'booth_participation', { booth_number, boothCount, totalCount }, true);

          if (totalCount >= 3 && !participation.prize_eligible) {
            const lotteryNumber = uuidv4().substring(0, 8).toUpperCase();
            const lotteryStart = Date.now();
            db.run(
              'UPDATE event_participation SET prize_eligible = 1, lottery_number = ? WHERE user_id = ?',
              [lotteryNumber, userId],
              (err) => {
                const lotteryDuration = Date.now() - lotteryStart;
                dbLogger.logQuery('UPDATE event_participation SET prize_eligible = 1', [lotteryNumber, userId], lotteryDuration);

                if (err) {
                  logger.error('Database error during lottery number assignment', {
                    error: err.message,
                    userId,
                    lotteryNumber,
                    ip: clientIp,
                    requestId: req.requestId
                  });
                  return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
                }

                logger.info('Prize eligibility granted', {
                  userId,
                  employeeId: req.user.employeeId,
                  lotteryNumber,
                  boothCount,
                  totalCount,
                  ip: clientIp,
                  requestId: req.requestId
                });

                res.json({ 
                  success: true, 
                  message: '부스 참여가 완료되었습니다.',
                  lottery_number: lotteryNumber
                });
              }
            );
          } else {
            logger.info('Booth participation completed', {
              userId,
              boothNumber: booth_number,
              boothCount,
              totalCount,
              prizeEligible: participation.prize_eligible,
              ip: clientIp,
              requestId: req.requestId
            });

            res.json({ 
              success: true, 
              message: '부스 참여가 완료되었습니다.' 
            });
          }
        }
      );
    }
  );
});

// 설문조사 참여 API
app.post('/api/event/survey', authenticateToken, (req, res) => {
  const userId = req.user.userId;
  const clientIp = req.ip || req.connection.remoteAddress;

  logger.info('Survey participation attempt', {
    userId,
    employeeId: req.user.employeeId,
    ip: clientIp,
    requestId: req.requestId
  });

  const updateStart = Date.now();
  db.run(
    'UPDATE event_participation SET survey_participated = 1 WHERE user_id = ?',
    [userId],
    function(err) {
      const updateDuration = Date.now() - updateStart;
      dbLogger.logQuery('UPDATE event_participation SET survey_participated = 1', [userId], updateDuration);

      if (err) {
        logger.error('Database error during survey participation', {
          error: err.message,
          userId,
          ip: clientIp,
          requestId: req.requestId
        });
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
      }

      // 3개 이상 참여 시 경품 자격 부여
      const checkStart = Date.now();
      db.get(
        'SELECT booth_1, booth_2, booth_3, booth_4, booth_5, survey_participated FROM event_participation WHERE user_id = ?',
        [userId],
        (err, participation) => {
          const checkDuration = Date.now() - checkStart;
          dbLogger.logQuery('SELECT survey participation status', [userId], checkDuration);

          if (err) {
            logger.error('Database error during participation check', {
              error: err.message,
              userId,
              ip: clientIp,
              requestId: req.requestId
            });
            return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
          }

          const boothCount = [participation.booth_1, participation.booth_2, participation.booth_3, participation.booth_4, participation.booth_5].filter(Boolean).length;
          const totalCount = boothCount + (participation.survey_participated ? 1 : 0);

          eventLogger.logEventParticipation(userId, 'survey_participation', { boothCount, totalCount }, true);

          if (totalCount >= 3 && !participation.prize_eligible) {
            const lotteryNumber = uuidv4().substring(0, 8).toUpperCase();
            const lotteryStart = Date.now();
            db.run(
              'UPDATE event_participation SET prize_eligible = 1, lottery_number = ? WHERE user_id = ?',
              [lotteryNumber, userId],
              (err) => {
                const lotteryDuration = Date.now() - lotteryStart;
                dbLogger.logQuery('UPDATE event_participation SET prize_eligible = 1', [lotteryNumber, userId], lotteryDuration);

                if (err) {
                  logger.error('Database error during lottery number assignment', {
                    error: err.message,
                    userId,
                    lotteryNumber,
                    ip: clientIp,
                    requestId: req.requestId
                  });
                  return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
                }

                logger.info('Prize eligibility granted via survey', {
                  userId,
                  employeeId: req.user.employeeId,
                  lotteryNumber,
                  boothCount,
                  totalCount,
                  ip: clientIp,
                  requestId: req.requestId
                });

                res.json({ 
                  success: true, 
                  message: '설문조사 참여가 완료되었습니다.',
                  lottery_number: lotteryNumber
                });
              }
            );
          } else {
            logger.info('Survey participation completed', {
              userId,
              boothCount,
              totalCount,
              prizeEligible: participation.prize_eligible,
              ip: clientIp,
              requestId: req.requestId
            });

            res.json({ 
              success: true, 
              message: '설문조사 참여가 완료되었습니다.' 
            });
          }
        }
      );
    }
  );
});

// 설문조사 제출 API
app.post('/api/survey/submit', (req, res) => {
  const { session_id, session_name, satisfaction_score, instructor_score, improvement_suggestions } = req.body;
  const clientIp = req.ip || req.connection.remoteAddress;

  logger.info('Survey submission attempt', {
    sessionId: session_id,
    sessionName: session_name,
    satisfactionScore: satisfaction_score,
    instructorScore: instructor_score,
    ip: clientIp,
    requestId: req.requestId
  });

  const insertStart = Date.now();
  db.run(
    'INSERT INTO surveys (session_id, session_name, satisfaction_score, instructor_score, improvement_suggestions) VALUES (?, ?, ?, ?, ?)',
    [session_id, session_name, satisfaction_score, instructor_score, improvement_suggestions],
    function(err) {
      const insertDuration = Date.now() - insertStart;
      dbLogger.logQuery('INSERT INTO surveys', [session_id, session_name, satisfaction_score, instructor_score, improvement_suggestions], insertDuration);

      if (err) {
        logger.error('Database error during survey submission', {
          error: err.message,
          sessionId: session_id,
          sessionName: session_name,
          ip: clientIp,
          requestId: req.requestId
        });
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
      }

      logger.info('Survey submission successful', {
        surveyId: this.lastID,
        sessionId: session_id,
        sessionName: session_name,
        satisfactionScore: satisfaction_score,
        instructorScore: instructor_score,
        ip: clientIp,
        requestId: req.requestId
      });

      res.json({ success: true, message: '설문조사가 제출되었습니다.' });
    }
  );
});

// 관리자 - 전체 현황 조회 API
app.get('/api/admin/overview', authenticateAdmin, (req, res) => {
  const adminId = req.user.adminId;
  const clientIp = req.ip || req.connection.remoteAddress;

  logger.info('Admin overview request', {
    adminId,
    ip: clientIp,
    requestId: req.requestId
  });

  const queries = [
    'SELECT COUNT(*) as total_users FROM users',
    'SELECT COUNT(*) as entry_confirmed FROM event_participation WHERE entry_confirmed = 1',
    'SELECT COUNT(*) as prize_eligible FROM event_participation WHERE prize_eligible = 1',
    'SELECT COUNT(*) as total_surveys FROM surveys'
  ];

  const queryStart = Date.now();
  Promise.all(queries.map(query => 
    new Promise((resolve, reject) => {
      db.get(query, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    })
  )).then(results => {
    const queryDuration = Date.now() - queryStart;
    dbLogger.logQuery('Admin overview queries', queries, queryDuration);

    const overviewData = {
      total_users: results[0].total_users,
      entry_confirmed: results[1].entry_confirmed,
      prize_eligible: results[2].prize_eligible,
      total_surveys: results[3].total_surveys
    };

    adminLogger.logDataAccess(adminId, 'overview', overviewData, clientIp);

    logger.info('Admin overview data retrieved', {
      adminId,
      overviewData,
      duration: `${queryDuration}ms`,
      ip: clientIp,
      requestId: req.requestId
    });

    res.json(overviewData);
  }).catch(err => {
    logger.error('Database error during admin overview', {
      error: err.message,
      adminId,
      ip: clientIp,
      requestId: req.requestId
    });
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  });
});

// 관리자 - 참여자 목록 조회 API
app.get('/api/admin/participants', authenticateAdmin, (req, res) => {
  const adminId = req.user.adminId;
  const clientIp = req.ip || req.connection.remoteAddress;

  logger.info('Admin participants request', {
    adminId,
    ip: clientIp,
    requestId: req.requestId
  });

  const queryStart = Date.now();
  db.all(`
    SELECT u.employee_id, ep.entry_confirmed, ep.booth_1, ep.booth_2, ep.booth_3, ep.booth_4, ep.booth_5, 
           ep.survey_participated, ep.prize_eligible, ep.lottery_number
    FROM users u
    LEFT JOIN event_participation ep ON u.id = ep.user_id
    ORDER BY u.created_at DESC
  `, (err, rows) => {
    const queryDuration = Date.now() - queryStart;
    dbLogger.logQuery('Admin participants query', [], queryDuration);

    if (err) {
      logger.error('Database error during participants retrieval', {
        error: err.message,
        adminId,
        ip: clientIp,
        requestId: req.requestId
      });
      return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }

    adminLogger.logDataAccess(adminId, 'participants', { count: rows.length }, clientIp);

    logger.info('Admin participants data retrieved', {
      adminId,
      participantCount: rows.length,
      duration: `${queryDuration}ms`,
      ip: clientIp,
      requestId: req.requestId
    });

    res.json(rows);
  });
});

// 관리자 - 설문조사 결과 조회 API
app.get('/api/admin/surveys', authenticateAdmin, (req, res) => {
  const adminId = req.user.adminId;
  const clientIp = req.ip || req.connection.remoteAddress;

  logger.info('Admin surveys request', {
    adminId,
    ip: clientIp,
    requestId: req.requestId
  });

  const queryStart = Date.now();
  db.all(`
    SELECT session_name, 
           AVG(satisfaction_score) as avg_satisfaction,
           AVG(instructor_score) as avg_instructor,
           COUNT(*) as response_count
    FROM surveys 
    GROUP BY session_id, session_name
    ORDER BY session_name
  `, (err, rows) => {
    const queryDuration = Date.now() - queryStart;
    dbLogger.logQuery('Admin surveys query', [], queryDuration);

    if (err) {
      logger.error('Database error during surveys retrieval', {
        error: err.message,
        adminId,
        ip: clientIp,
        requestId: req.requestId
      });
      return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }

    adminLogger.logDataAccess(adminId, 'surveys', { count: rows.length }, clientIp);

    logger.info('Admin surveys data retrieved', {
      adminId,
      surveyCount: rows.length,
      duration: `${queryDuration}ms`,
      ip: clientIp,
      requestId: req.requestId
    });

    res.json(rows);
  });
});

// QR 코드 생성 API
app.get('/api/qr/:type/:id', (req, res) => {
  const { type, id } = req.params;
  const clientIp = req.ip || req.connection.remoteAddress;
  let qrData = '';

  logger.info('QR code generation request', {
    qrType: type,
    qrId: id,
    ip: clientIp,
    requestId: req.requestId
  });

  switch (type) {
    case 'entry':
      return res.status(410).json({ 
        error: '입장 QR 생성 기능이 비활성화되었습니다.',
        message: '개선된 이벤트 조건에 따라 입장 확인이 더 이상 필요하지 않습니다.'
      });
    case 'booth':
      qrData = `${req.protocol}://${req.get('host')}/app/event/booth?booth=${id}`;
      break;
    case 'survey':
      // 세션 ID 매핑 (숫자 -> 문자열)
      const sessionIdMap = {
        '1': 'keynote',
        '2': 'session1', 
        '3': 'session2',
        '4': 'session3',
        '5': 'panel'
      };
      const sessionKey = sessionIdMap[id] || id;
      qrData = `${req.protocol}://${req.get('host')}/app/survey/?session_id=${sessionKey}`;
      break;
    default:
      logger.warn('Invalid QR code type requested', {
        qrType: type,
        qrId: id,
        ip: clientIp,
        requestId: req.requestId
      });
      return res.status(400).json({ error: '올바르지 않은 QR 코드 타입입니다.' });
  }

  const qrStart = Date.now();
  QRCode.toDataURL(qrData, (err, url) => {
    const qrDuration = Date.now() - qrStart;

    if (err) {
      eventLogger.logQRCodeGeneration(type, id, clientIp, false, err);
      logger.error('QR code generation failed', {
        error: err.message,
        qrType: type,
        qrId: id,
        qrData,
        ip: clientIp,
        requestId: req.requestId
      });
      return res.status(500).json({ error: 'QR 코드 생성 중 오류가 발생했습니다.' });
    }

    eventLogger.logQRCodeGeneration(type, id, clientIp, true);
    logger.info('QR code generated successfully', {
      qrType: type,
      qrId: id,
      qrData,
      duration: `${qrDuration}ms`,
      ip: clientIp,
      requestId: req.requestId
    });

    res.json({ qr_code: url, data: qrData });
  });
});

// 경품 QR 코드 생성 API
app.post('/api/prize/generate-qr', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  const clientIp = req.ip || req.connection.remoteAddress;
  const userId = req.user.userId;
  const employeeId = req.user.employeeId;

  logger.info('Prize QR generation request', {
    userId,
    employeeId,
    ip: clientIp,
    requestId: req.requestId
  });

  try {
    // 경품 자격 확인
    const queryStart = Date.now();
    db.get(`
      SELECT 
        u.id,
        u.employee_id,
        (CASE WHEN ep.booth_1 = 1 THEN 1 ELSE 0 END +
         CASE WHEN ep.booth_2 = 1 THEN 1 ELSE 0 END +
         CASE WHEN ep.booth_3 = 1 THEN 1 ELSE 0 END +
         CASE WHEN ep.booth_4 = 1 THEN 1 ELSE 0 END +
         CASE WHEN ep.booth_5 = 1 THEN 1 ELSE 0 END) as booth_count,
        COUNT(DISTINCT s.session_id) as session_survey_count,
        ep.entry_confirmed
      FROM users u
      LEFT JOIN event_participation ep ON u.id = ep.user_id
      LEFT JOIN surveys s ON u.id = s.user_id
      WHERE u.id = ?
      GROUP BY u.id
    `, [userId], async (err, user) => {
      const queryDuration = Date.now() - queryStart;
      dbLogger.logQuery('SELECT user prize eligibility', [userId], queryDuration);

      if (err) {
        logger.error('Database error in prize eligibility check', {
          error: err.message,
          userId,
          ip: clientIp,
          requestId: req.requestId
        });
        return res.status(500).json({ error: '데이터베이스 오류가 발생했습니다.' });
      }

      if (!user) {
        logger.warn('User not found for prize QR generation', {
          userId,
          ip: clientIp,
          requestId: req.requestId
        });
        return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
      }

      // 새로운 경품 자격 조건 적용
      // 부스 3개 이상 또는 세션 설문 3개 이상 또는 부스/세션 설문 합계 4개 이상
      const isEligible = user.booth_count >= 3 || user.session_survey_count >= 3 || (user.booth_count + user.session_survey_count) >= 4;
      
      if (!isEligible) {
        logger.warn('User not eligible for prize', {
          userId,
          employeeId,
          boothCount: user.booth_count,
          sessionSurveyCount: user.session_survey_count,
          ip: clientIp,
          requestId: req.requestId
        });
        return res.status(400).json({ 
          error: '경품 수령 자격이 없습니다.',
          details: {
            boothCount: user.booth_count,
            sessionSurveyCount: user.session_survey_count,
            required: {
              boothCount: 3,
              sessionSurveyCount: 3,
              combinedCount: 4
            }
          }
        });
      }

      // 이미 경품을 교환했는지 확인
      const exchangeCheckStart = Date.now();
      db.get('SELECT id, exchanged_at FROM prize_exchanges WHERE user_id = ? ORDER BY exchanged_at DESC LIMIT 1', [userId], (err, existingExchange) => {
        const exchangeCheckDuration = Date.now() - exchangeCheckStart;
        dbLogger.logQuery('SELECT existing prize exchange', [userId], exchangeCheckDuration);

        if (err) {
          logger.error('Database error in existing exchange check', {
            error: err.message,
            userId,
            ip: clientIp,
            requestId: req.requestId
          });
          return res.status(500).json({ error: '데이터베이스 오류가 발생했습니다.' });
        }

        if (existingExchange) {
          logger.warn('User already exchanged prize', {
            userId,
            employeeId,
            existingExchangeId: existingExchange.id,
            exchangedAt: existingExchange.exchanged_at,
            ip: clientIp,
            requestId: req.requestId
          });
          return res.status(400).json({ 
            error: '이미 경품을 수령하셨습니다.',
            details: {
              exchangeId: existingExchange.id,
              exchangedAt: existingExchange.exchanged_at
            }
          });
        }

        // 경품 번호 생성 (1-100)
        const prizeNumber = Math.floor(Math.random() * 100) + 1;
        
        // 위변조 방지 토큰 생성
        const prizeToken = uuidv4();
        const timestamp = Date.now();
        const signature = CryptoJS.HmacSHA256(
          `${userId}-${prizeNumber}-${timestamp}`,
          JWT_SECRET
        ).toString();

        // 경품 교환 데이터 생성
        const prizeData = {
          userId,
          employeeId,
          prizeNumber,
          prizeToken,
          timestamp,
          signature
        };

        // QR 코드 데이터 생성
        const qrData = JSON.stringify(prizeData);
        
        const qrStart = Date.now();
        QRCode.toDataURL(qrData, (err, url) => {
          const qrDuration = Date.now() - qrStart;
          
          if (err) {
            logger.error('QR code generation failed', {
              error: err.message,
              userId,
              prizeNumber,
              ip: clientIp,
              requestId: req.requestId
            });
            return res.status(500).json({ error: 'QR 코드 생성 중 오류가 발생했습니다.' });
          }

          eventLogger.logPrizeQRGeneration(userId, prizeNumber, clientIp, true);
          logger.info('Prize QR code generated successfully', {
            userId,
            employeeId,
            prizeNumber,
            prizeToken,
            duration: `${Date.now() - startTime}ms`,
            qrDuration: `${qrDuration}ms`,
            ip: clientIp,
            requestId: req.requestId
          });

          res.json({ 
            qr_code: url, 
            data: qrData,
            prizeNumber,
            prizeToken
          });
        });
      });
    });
  } catch (error) {
    logger.error('Prize QR generation error', {
      error: error.message,
      stack: error.stack,
      userId,
      ip: clientIp,
      requestId: req.requestId
    });
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 경품 QR 코드 검증 API (관리자용) - 교환 가능 여부만 확인
app.post('/api/prize/verify', authenticateAdmin, async (req, res) => {
  const startTime = Date.now();
  const clientIp = req.ip || req.connection.remoteAddress;
  const adminId = req.user.adminId;
  const { qrData } = req.body;

  logger.info('Prize verification request', {
    adminId,
    ip: clientIp,
    requestId: req.requestId
  });

  try {
    if (!qrData) {
      return res.status(400).json({ error: 'QR 데이터가 필요합니다.' });
    }

    // QR 데이터 파싱
    let prizeData;
    try {
      prizeData = JSON.parse(qrData);
    } catch (error) {
      logger.warn('Invalid QR data format', {
        qrData,
        error: error.message,
        ip: clientIp,
        requestId: req.requestId
      });
      return res.status(400).json({ error: '올바르지 않은 QR 데이터 형식입니다.' });
    }

    const { userId, employeeId, prizeNumber, prizeToken, timestamp, signature } = prizeData;

    // 위변조 방지 검증
    const expectedSignature = CryptoJS.HmacSHA256(
      `${userId}-${prizeNumber}-${timestamp}`,
      JWT_SECRET
    ).toString();

    if (signature !== expectedSignature) {
      logger.warn('Invalid prize QR signature', {
        userId,
        prizeNumber,
        prizeToken,
        ip: clientIp,
        requestId: req.requestId
      });
      return res.status(400).json({ 
        error: '위변조된 QR 코드입니다.',
        exchangeable: false
      });
    }

    // QR 코드 유효성 검증 (5분 이내)
    const now = Date.now();
    if (now - timestamp > 5 * 60 * 1000) {
      logger.warn('Expired prize QR code', {
        userId,
        prizeNumber,
        prizeToken,
        timestamp,
        currentTime: now,
        ip: clientIp,
        requestId: req.requestId
      });
      return res.status(400).json({ 
        error: '만료된 QR 코드입니다.',
        exchangeable: false
      });
    }

    // 중복 교환 방지 - 이미 교환된 토큰인지 확인
    const duplicateCheckStart = Date.now();
    db.get('SELECT id FROM prize_exchanges WHERE prize_token = ?', [prizeToken], (err, existingExchange) => {
      const duplicateCheckDuration = Date.now() - duplicateCheckStart;
      dbLogger.logQuery('SELECT duplicate prize exchange', [prizeToken], duplicateCheckDuration);

      if (err) {
        logger.error('Database error in duplicate check', {
          error: err.message,
          prizeToken,
          ip: clientIp,
          requestId: req.requestId
        });
        return res.status(500).json({ 
          error: '데이터베이스 오류가 발생했습니다.',
          exchangeable: false
        });
      }

      if (existingExchange) {
        logger.warn('Duplicate prize exchange attempt', {
          userId,
          prizeNumber,
          prizeToken,
          existingExchangeId: existingExchange.id,
          ip: clientIp,
          requestId: req.requestId
        });
        return res.status(400).json({ 
          error: '이미 교환된 경품입니다.',
          exchangeable: false,
          details: {
            exchangeId: existingExchange.id,
            exchangedAt: existingExchange.exchanged_at
          }
        });
      }

      // 사용자 존재 및 경품 자격 재확인
      const queryStart = Date.now();
      db.get(`
        SELECT 
          u.id,
          u.employee_id,
          (CASE WHEN ep.booth_1 = 1 THEN 1 ELSE 0 END +
           CASE WHEN ep.booth_2 = 1 THEN 1 ELSE 0 END +
           CASE WHEN ep.booth_3 = 1 THEN 1 ELSE 0 END +
           CASE WHEN ep.booth_4 = 1 THEN 1 ELSE 0 END +
           CASE WHEN ep.booth_5 = 1 THEN 1 ELSE 0 END) as booth_count,
          COUNT(DISTINCT s.session_id) as session_survey_count,
          ep.entry_confirmed
        FROM users u
        LEFT JOIN event_participation ep ON u.id = ep.user_id
        LEFT JOIN surveys s ON u.id = s.user_id
        WHERE u.id = ?
        GROUP BY u.id
      `, [userId], (err, user) => {
        const queryDuration = Date.now() - queryStart;
        dbLogger.logQuery('SELECT user for prize verification', [userId], queryDuration);

        if (err) {
          logger.error('Database error in prize verification', {
            error: err.message,
            userId,
            ip: clientIp,
            requestId: req.requestId
          });
          return res.status(500).json({ 
            error: '데이터베이스 오류가 발생했습니다.',
            exchangeable: false
          });
        }

        if (!user) {
          logger.warn('User not found for prize verification', {
            userId,
            ip: clientIp,
            requestId: req.requestId
          });
          return res.status(404).json({ 
            error: '사용자를 찾을 수 없습니다.',
            exchangeable: false
          });
        }

        // 새로운 경품 자격 재확인
        // 부스 3개 이상 또는 세션 설문 3개 이상 또는 부스/세션 설문 합계 4개 이상
        const isEligible = user.booth_count >= 3 || user.session_survey_count >= 3 || (user.booth_count + user.session_survey_count) >= 4;
        
        if (!isEligible) {
          logger.warn('User not eligible for prize verification', {
            userId,
            employeeId: user.employee_id,
            boothCount: user.booth_count,
            sessionSurveyCount: user.session_survey_count,
            ip: clientIp,
            requestId: req.requestId
          });
          return res.status(400).json({ 
            error: '경품 수령 자격이 없습니다.',
            exchangeable: false,
            details: {
              boothCount: user.booth_count,
              sessionSurveyCount: user.session_survey_count,
              required: {
                boothCount: 3,
                sessionSurveyCount: 3,
                combinedCount: 4
              }
            }
          });
        }

        // 모든 검증 통과 - 교환 가능
        logger.info('Prize verification successful', {
          userId,
          employeeId: user.employee_id,
          prizeNumber,
          prizeToken,
          adminId,
          duration: `${Date.now() - startTime}ms`,
          ip: clientIp,
          requestId: req.requestId
        });

        res.json({
          success: true,
          exchangeable: true,
          message: '교환이 가능합니다.',
          user: {
            id: user.id,
            employee_id: user.employee_id
          },
          prizeNumber,
          prizeToken,
          qrData: {
            userId,
            employeeId,
            prizeNumber,
            prizeToken,
            timestamp,
            signature
          }
        });
      });
    });
  } catch (error) {
    logger.error('Prize verification error', {
      error: error.message,
      stack: error.stack,
      adminId,
      ip: clientIp,
      requestId: req.requestId
    });
    res.status(500).json({ 
      error: '서버 오류가 발생했습니다.',
      exchangeable: false
    });
  }
});

// 경품 QR 코드 검증 및 교환 처리 API (관리자용)
app.post('/api/prize/verify-and-exchange', authenticateAdmin, async (req, res) => {
  const startTime = Date.now();
  const clientIp = req.ip || req.connection.remoteAddress;
  const adminId = req.user.adminId;
  const { qrData } = req.body;

  logger.info('Prize verification and exchange request', {
    adminId,
    ip: clientIp,
    requestId: req.requestId
  });

  try {
    if (!qrData) {
      return res.status(400).json({ error: 'QR 코드 데이터가 필요합니다.' });
    }

    // QR 데이터 파싱
    let prizeData;
    try {
      prizeData = JSON.parse(qrData);
    } catch (err) {
      logger.warn('Invalid QR data format', {
        qrData,
        ip: clientIp,
        requestId: req.requestId
      });
      return res.status(400).json({ error: '올바르지 않은 QR 코드입니다.' });
    }

    const { userId, employeeId, prizeNumber, prizeToken, timestamp, signature } = prizeData;

    // 위변조 방지 검증
    const expectedSignature = CryptoJS.HmacSHA256(
      `${userId}-${prizeNumber}-${timestamp}`,
      JWT_SECRET
    ).toString();

    if (signature !== expectedSignature) {
      logger.warn('Invalid prize QR signature', {
        userId,
        prizeNumber,
        prizeToken,
        ip: clientIp,
        requestId: req.requestId
      });
      return res.status(400).json({ error: '위변조된 QR 코드입니다.' });
    }

    // QR 코드 유효성 검증 (5분 이내)
    const now = Date.now();
    if (now - timestamp > 5 * 60 * 1000) {
      logger.warn('Expired prize QR code', {
        userId,
        prizeNumber,
        prizeToken,
        timestamp,
        currentTime: now,
        ip: clientIp,
        requestId: req.requestId
      });
      return res.status(400).json({ error: '만료된 QR 코드입니다.' });
    }

    // 중복 교환 방지 - 이미 교환된 토큰인지 확인
    const duplicateCheckStart = Date.now();
    db.get('SELECT id FROM prize_exchanges WHERE prize_token = ?', [prizeToken], (err, existingExchange) => {
      const duplicateCheckDuration = Date.now() - duplicateCheckStart;
      dbLogger.logQuery('SELECT duplicate prize exchange', [prizeToken], duplicateCheckDuration);

      if (err) {
        logger.error('Database error in duplicate check', {
          error: err.message,
          prizeToken,
          ip: clientIp,
          requestId: req.requestId
        });
        return res.status(500).json({ error: '데이터베이스 오류가 발생했습니다.' });
      }

      if (existingExchange) {
        logger.warn('Duplicate prize exchange attempt', {
          userId,
          prizeNumber,
          prizeToken,
          existingExchangeId: existingExchange.id,
          ip: clientIp,
          requestId: req.requestId
        });
        return res.status(400).json({ error: '이미 교환된 경품입니다.' });
      }

      // 중복이 아닌 경우 기존 로직 계속 실행
      processPrizeExchange();
    });

    function processPrizeExchange() {
      // 사용자 존재 및 경품 자격 재확인
    const queryStart = Date.now();
    db.get(`
      SELECT 
        u.id,
        u.employee_id,
        (CASE WHEN ep.booth_1 = 1 THEN 1 ELSE 0 END +
         CASE WHEN ep.booth_2 = 1 THEN 1 ELSE 0 END +
         CASE WHEN ep.booth_3 = 1 THEN 1 ELSE 0 END +
         CASE WHEN ep.booth_4 = 1 THEN 1 ELSE 0 END +
         CASE WHEN ep.booth_5 = 1 THEN 1 ELSE 0 END) as booth_count,
        COUNT(DISTINCT s.session_id) as session_survey_count,
        ep.entry_confirmed
      FROM users u
      LEFT JOIN event_participation ep ON u.id = ep.user_id
      LEFT JOIN surveys s ON u.id = s.user_id
      WHERE u.id = ?
      GROUP BY u.id
    `, [userId], (err, user) => {
      const queryDuration = Date.now() - queryStart;
      dbLogger.logQuery('SELECT user for prize exchange', [userId], queryDuration);

      if (err) {
        logger.error('Database error in prize exchange', {
          error: err.message,
          userId,
          ip: clientIp,
          requestId: req.requestId
        });
        return res.status(500).json({ error: '데이터베이스 오류가 발생했습니다.' });
      }

      if (!user) {
        logger.warn('User not found for prize exchange', {
          userId,
          ip: clientIp,
          requestId: req.requestId
        });
        return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
      }

      // 새로운 경품 자격 재확인
      // 부스 3개 이상 또는 세션 설문 3개 이상 또는 부스/세션 설문 합계 4개 이상
      const isEligible = user.booth_count >= 3 || user.session_survey_count >= 3 || (user.booth_count + user.session_survey_count) >= 4;
      
      if (!isEligible) {
        logger.warn('User not eligible for prize exchange', {
          userId,
          employeeId: user.employee_id,
          boothCount: user.booth_count,
          sessionSurveyCount: user.session_survey_count,
          ip: clientIp,
          requestId: req.requestId
        });
        return res.status(400).json({ 
          error: '경품 수령 자격이 없습니다.',
          details: {
            boothCount: user.booth_count,
            sessionSurveyCount: user.session_survey_count,
            required: {
              boothCount: 3,
              sessionSurveyCount: 3,
              combinedCount: 4
            }
          }
        });
      }

      // 중복 교환 확인
      const duplicateCheckStart = Date.now();
      db.get(`
        SELECT id, exchanged_at FROM prize_exchanges 
        WHERE user_id = ? AND prize_token = ?
      `, [userId, prizeToken], (err, existingExchange) => {
        const duplicateCheckDuration = Date.now() - duplicateCheckStart;
        dbLogger.logQuery('SELECT existing prize exchange', [userId, prizeToken], duplicateCheckDuration);

        if (err) {
          logger.error('Database error in duplicate check', {
            error: err.message,
            userId,
            prizeToken,
            ip: clientIp,
            requestId: req.requestId
          });
          return res.status(500).json({ error: '데이터베이스 오류가 발생했습니다.' });
        }

        if (existingExchange) {
          logger.warn('Duplicate prize exchange attempt', {
            userId,
            employeeId: user.employee_id,
            prizeToken,
            existingExchangeId: existingExchange.id,
            existingExchangeTime: existingExchange.exchanged_at,
            ip: clientIp,
            requestId: req.requestId
          });
          return res.status(400).json({ 
            error: '이미 교환된 경품입니다.',
            details: {
              exchangeId: existingExchange.id,
              exchangedAt: existingExchange.exchanged_at
            }
          });
        }

        // 경품 교환 기록 저장
        const exchangeStart = Date.now();
        db.run(`
          INSERT INTO prize_exchanges (user_id, prize_number, prize_token, admin_id, exchanged_at)
          VALUES (?, ?, ?, ?, ?)
        `, [userId, prizeNumber, prizeToken, adminId, new Date().toISOString()], function(err) {
          const exchangeDuration = Date.now() - exchangeStart;
          dbLogger.logQuery('INSERT prize exchange', [userId, prizeNumber, prizeToken, adminId], exchangeDuration);

          if (err) {
            logger.error('Database error in prize exchange record', {
              error: err.message,
              userId,
              prizeNumber,
              ip: clientIp,
              requestId: req.requestId
            });
            return res.status(500).json({ error: '경품 교환 기록 저장 중 오류가 발생했습니다.' });
          }

          // Socket.IO로 실시간 응답 전송
          const roomName = `prize-waiting-${userId}`;
          const emitData = {
            success: true,
            message: '경품 교환이 완료되었습니다.',
            prizeNumber,
            exchangeId: this.lastID,
            timestamp: new Date().toISOString()
          };
          
          io.to(roomName).emit('prize-exchange-result', emitData);
          
          logger.info('Socket.IO prize exchange result sent', {
            userId,
            roomName,
            emitData,
            timestamp: new Date().toISOString()
          });

          adminLogger.logPrizeExchange(adminId, userId, prizeNumber, clientIp, true);
          logger.info('Prize exchange completed successfully', {
            userId,
            employeeId: user.employee_id,
            prizeNumber,
            prizeToken,
            adminId,
            exchangeId: this.lastID,
            duration: `${Date.now() - startTime}ms`,
            ip: clientIp,
            requestId: req.requestId
          });

          res.json({
            success: true,
            message: '경품 교환이 완료되었습니다.',
            user: {
              id: user.id,
              employee_id: user.employee_id
            },
            prizeNumber,
            exchangeId: this.lastID
          });
        });
      });
    });
    }
  } catch (error) {
    logger.error('Prize verification and exchange error', {
      error: error.message,
      stack: error.stack,
      adminId,
      ip: clientIp,
      requestId: req.requestId
    });
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// 정적 파일 서빙
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/app/intro/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'intro.html'));
});

app.get('/app/event/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'event.html'));
});

app.get('/app/event/auth', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'auth.html'));
});

app.get('/app/event/data', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'data.html'));
});

app.get('/app/admin/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/app/survey/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'survey.html'));
});

// 경품 수령 페이지
app.get('/app/prize/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'prize.html'));
});

// 관리자 경품 배부 페이지
app.get('/app/admin/prize/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-prize.html'));
});

// 부스 참여 확인 라우트
app.get('/app/event/booth', (req, res) => {
  const boothNumber = req.query.booth;
  
  if (!boothNumber) {
    return res.status(400).json({ error: '부스 번호가 필요합니다.' });
  }
  
  // 부스 참여 확인 페이지로 리다이렉트 (토큰과 함께)
  res.sendFile(path.join(__dirname, 'public', 'data.html'));
});

// Chrome DevTools 요청 처리 (404 에러 방지)
app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// 에러 핸들링 미들웨어
app.use(errorLogger);

// 404 핸들러
app.use('*', (req, res) => {
  logger.warn('404 - Route not found', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    requestId: req.requestId
  });
  res.status(404).json({ error: '요청하신 페이지를 찾을 수 없습니다.' });
});

// Socket.IO 연결 처리
io.on('connection', (socket) => {
  logger.info('Client connected to Socket.IO', {
    socketId: socket.id,
    timestamp: new Date().toISOString()
  });

  // 경품 교환 대기방 입장
  socket.on('join-prize-waiting', (data) => {
    const { userId, prizeToken } = data;
    socket.join(`prize-waiting-${userId}`);
    logger.info('User joined prize waiting room', {
      socketId: socket.id,
      userId,
      prizeToken,
      roomName: `prize-waiting-${userId}`,
      timestamp: new Date().toISOString()
    });
  });

  // 경품 교환 대기방 퇴장
  socket.on('leave-prize-waiting', (data) => {
    const { userId } = data;
    socket.leave(`prize-waiting-${userId}`);
    logger.info('User left prize waiting room', {
      socketId: socket.id,
      userId,
      timestamp: new Date().toISOString()
    });
  });

  socket.on('disconnect', () => {
    logger.info('Client disconnected from Socket.IO', {
      socketId: socket.id,
      timestamp: new Date().toISOString()
    });
  });
});

// 서버 시작
server.listen(PORT, () => {
  logger.info('Server started successfully', {
    port: PORT,
    nodeEnv: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`http://localhost:${PORT} 에서 접속하세요.`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Server shutdown initiated', {
    signal: 'SIGINT',
    timestamp: new Date().toISOString()
  });
  console.log('\n서버를 종료합니다...');
  
  db.close((err) => {
    if (err) {
      logger.error('Database connection close error', {
        error: err.message,
        stack: err.stack
      });
      console.error('데이터베이스 연결 종료 중 오류:', err.message);
    } else {
      logger.info('Database connection closed successfully');
      console.log('데이터베이스 연결이 종료되었습니다.');
    }
    process.exit(0);
  });
});

// 예상치 못한 에러 처리
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', {
    error: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString()
  });
  console.error('예상치 못한 에러:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', {
    reason: reason.toString(),
    promise: promise.toString(),
    timestamp: new Date().toISOString()
  });
  console.error('처리되지 않은 Promise 거부:', reason);
});


