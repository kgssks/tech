const { getDB } = require('../database');
const { verifyToken } = require('./jwt');

// 환경 변수에서 로그 설정 확인
const ENABLE_CONSOLE_LOG = process.env.ENABLE_CONSOLE_LOG !== 'false'; // 기본값: true
const LOG_LEVEL = process.env.LOG_LEVEL || 'info'; // debug, info, warn, error

// ANSI 색상 코드
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

// 상태 코드에 따른 색상
function getStatusColor(statusCode) {
  if (statusCode >= 500) return colors.red;
  if (statusCode >= 400) return colors.yellow;
  if (statusCode >= 300) return colors.cyan;
  if (statusCode >= 200) return colors.green;
  return colors.white;
}

// HTTP 메서드에 따른 색상
function getMethodColor(method) {
  switch (method) {
    case 'GET': return colors.blue;
    case 'POST': return colors.green;
    case 'PUT': return colors.yellow;
    case 'DELETE': return colors.red;
    case 'PATCH': return colors.magenta;
    default: return colors.white;
  }
}

// 콘솔에 로그 출력
function logToConsole(logData) {
  if (!ENABLE_CONSOLE_LOG) return;

  const timestamp = new Date(logData.timestamp || new Date()).toLocaleString('ko-KR');
  const methodColor = getMethodColor(logData.method);
  const statusColor = getStatusColor(logData.statusCode);
  const responseTime = logData.responseTimeMs ? `${logData.responseTimeMs}ms` : '-';
  
  // 메인 로그 라인
  const mainLog = [
    `${colors.dim}[${timestamp}]${colors.reset}`,
    `${methodColor}${logData.method.padEnd(6)}${colors.reset}`,
    `${statusColor}${logData.statusCode}${colors.reset}`,
    `${colors.bright}${responseTime.padStart(8)}${colors.reset}`,
    `${colors.cyan}${logData.path}${colors.reset}`
  ].join(' ');

  console.log(mainLog);

  // 추가 정보 (상세 모드)
  if (LOG_LEVEL === 'debug') {
    const details = [];
    
    // 사용자 정보 (인증된 경우)
    if (logData.userEmpno) {
      let userInfo = logData.userEmpno;
      if (logData.userEmpname) {
        userInfo = `${logData.userEmpname} (${logData.userEmpno})`;
        if (logData.userPosname) userInfo += ` ${logData.userPosname}`;
        if (logData.userDeptname) userInfo += ` [${logData.userDeptname}]`;
      }
      details.push(`User: ${colors.magenta}${userInfo}${colors.reset}`);
    }
    
    // IP 주소 (항상 표시)
    if (logData.ipAddress && logData.ipAddress !== 'unknown') {
      details.push(`IP: ${colors.dim}${logData.ipAddress}${colors.reset}`);
    }
    
    if (logData.queryParams) {
      details.push(`Query: ${colors.dim}${JSON.stringify(logData.queryParams)}${colors.reset}`);
    }
    
    if (logData.requestBody) {
      const bodyStr = JSON.stringify(logData.requestBody).substring(0, 100);
      details.push(`Body: ${colors.dim}${bodyStr}${bodyStr.length >= 100 ? '...' : ''}${colors.reset}`);
    }
    
    if (logData.referer) {
      details.push(`Referer: ${colors.dim}${logData.referer.substring(0, 50)}${colors.reset}`);
    }
    
    if (logData.errorMessage) {
      details.push(`Error: ${colors.red}${logData.errorMessage}${colors.reset}`);
    }

    if (details.length > 0) {
      console.log(`  ${colors.dim}└─${colors.reset} ${details.join(` ${colors.dim}│${colors.reset} `)}`);
    }
  } else {
    // info 레벨에서도 사용자 정보와 IP 주소 표시
    const details = [];
    
    // 사용자 정보 (인증된 경우)
    if (logData.userEmpno) {
      let userInfo = logData.userEmpno;
      if (logData.userEmpname) {
        userInfo = `${logData.userEmpname} (${logData.userEmpno})`;
      }
      details.push(`User: ${colors.magenta}${userInfo}${colors.reset}`);
    }
    
    // IP 주소 (항상 표시)
    if (logData.ipAddress && logData.ipAddress !== 'unknown') {
      details.push(`IP: ${colors.dim}${logData.ipAddress}${colors.reset}`);
    }
    
    if (logData.errorMessage) {
      details.push(`Error: ${colors.red}${logData.errorMessage}${colors.reset}`);
    }
    
    if (details.length > 0) {
      console.log(`  ${colors.dim}└─${colors.reset} ${details.join(` ${colors.dim}│${colors.reset} `)}`);
    }
  }
}

// IP 주소 추출 (프록시 환경 고려)
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection.remoteAddress ||
         req.socket.remoteAddress ||
         req.ip ||
         'unknown';
}

// 사용자 정보 추출 (토큰에서) - 동기적 조회 (Promise 사용)
function getUserInfoSync(req, callback) {
  let userId = null;
  let userEmpno = null;
  let userEmpname = null;
  let userDeptname = null;
  let userPosname = null;

  try {
    const authHeader = req.headers.authorization || req.headers['kb-auth'];
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const decoded = verifyToken(token);
      if (decoded) {
        const db = getDB();
        db.get('SELECT id, empno, empname, deptname, posname FROM users WHERE token_secret = ?', 
          [decoded.secret], (err, user) => {
            if (!err && user) {
              userId = user.id;
              userEmpno = user.empno;
              userEmpname = user.empname;
              userDeptname = user.deptname;
              userPosname = user.posname;
            }
            callback({ 
              userId, 
              userEmpno, 
              userEmpname, 
              userDeptname, 
              userPosname 
            });
          });
        return;
      }
    }
  } catch (error) {
    // 토큰 파싱 오류 무시
  }
  
  callback({ userId, userEmpno, userEmpname, userDeptname, userPosname });
}

// 로그 저장
function saveLog(logData) {
  // 콘솔에 로그 출력
  logToConsole(logData);

  // 데이터베이스에 로그 저장
  const db = getDB();
  
  db.run(`INSERT INTO web_logs 
          (timestamp, ip_address, user_agent, method, path, query_params, 
           status_code, user_id, user_empno, user_empname, user_deptname, user_posname, 
           session_id, referer, response_time_ms, error_message, request_body)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      logData.timestamp || new Date().toISOString(),
      logData.ipAddress,
      logData.userAgent,
      logData.method,
      logData.path,
      logData.queryParams ? JSON.stringify(logData.queryParams) : null,
      logData.statusCode,
      logData.userId || null,
      logData.userEmpno || null,
      logData.userEmpname || null,
      logData.userDeptname || null,
      logData.userPosname || null,
      logData.sessionId || null,
      logData.referer || null,
      logData.responseTimeMs || null,
      logData.errorMessage || null,
      logData.requestBody ? JSON.stringify(logData.requestBody).substring(0, 1000) : null // 최대 1000자 제한
    ],
    (err) => {
      if (err) {
        console.error(`${colors.red}[로그 저장 오류]${colors.reset}`, err);
      }
    }
  );
}

// 로깅 미들웨어
function loggingMiddleware(req, res, next) {
  const startTime = Date.now();
  const originalSend = res.send;

  // 요청 정보 수집
  const ipAddress = getClientIP(req);
  const userAgent = req.headers['user-agent'] || 'unknown';
  const method = req.method;
  const path = req.path || req.url.split('?')[0];
  const queryParams = Object.keys(req.query).length > 0 ? req.query : null;
  const referer = req.headers.referer || req.headers.referrer || null;

  // 요청 본문 (민감한 정보 제외)
  let requestBody = null;
  if (req.body && Object.keys(req.body).length > 0) {
    const bodyCopy = { ...req.body };
    // 비밀번호 등 민감한 정보 마스킹
    if (bodyCopy.password) bodyCopy.password = '***';
    if (bodyCopy.lastNumber) bodyCopy.lastNumber = '***';
    if (bodyCopy.adminPassword) bodyCopy.adminPassword = '***';
    requestBody = bodyCopy;
  }

  // 응답 전송 후처리
  res.send = function(data) {
    const responseTime = Date.now() - startTime;
    const statusCode = res.statusCode;
    
    // 에러 메시지 추출
    let errorMessage = null;
    if (statusCode >= 400) {
      try {
        const parsed = JSON.parse(data);
        errorMessage = parsed.message || parsed.error || null;
      } catch (e) {
        // JSON 파싱 실패 시 무시
      }
    }

    // 사용자 정보 조회 후 로그 저장
    getUserInfoSync(req, (userInfo) => {
      saveLog({
        timestamp: new Date().toISOString(),
        ipAddress,
        userAgent,
        method,
        path,
        queryParams,
        statusCode,
        userId: userInfo.userId,
        userEmpno: userInfo.userEmpno,
        userEmpname: userInfo.userEmpname,
        userDeptname: userInfo.userDeptname,
        userPosname: userInfo.userPosname,
        sessionId: req.sessionID || null,
        referer,
        responseTimeMs: responseTime,
        errorMessage,
        requestBody
      });
    });

    // 원본 send 호출
    originalSend.call(this, data);
  };

  next();
}

// 페이지 접속 로그 (HTML 페이지용)
function logPageAccess(req, res, next) {
  const ipAddress = getClientIP(req);
  const userAgent = req.headers['user-agent'] || 'unknown';
  const referer = req.headers.referer || req.headers.referrer || null;
  const path = req.path || req.url.split('?')[0];

  // 사용자 정보 조회 후 로그 저장
  getUserInfoSync(req, (userInfo) => {
    saveLog({
      timestamp: new Date().toISOString(),
      ipAddress,
      userAgent,
      method: 'GET',
      path,
      queryParams: Object.keys(req.query).length > 0 ? req.query : null,
      statusCode: 200,
      userId: userInfo.userId,
      userEmpno: userInfo.userEmpno,
      userEmpname: userInfo.userEmpname,
      userDeptname: userInfo.userDeptname,
      userPosname: userInfo.userPosname,
      sessionId: req.sessionID || null,
      referer,
      responseTimeMs: null,
      errorMessage: null,
      requestBody: null
    });
  });

  next();
}

// API 호출 로그 (별도 함수)
function logAPICall(req, res, next) {
  return loggingMiddleware(req, res, next);
}

// 간단한 로그 헬퍼 함수들
const log = {
  info: (message, ...args) => {
    if (LOG_LEVEL === 'debug' || LOG_LEVEL === 'info') {
      console.log(`${colors.cyan}[INFO]${colors.reset}`, message, ...args);
    }
  },
  warn: (message, ...args) => {
    if (LOG_LEVEL === 'debug' || LOG_LEVEL === 'info' || LOG_LEVEL === 'warn') {
      console.warn(`${colors.yellow}[WARN]${colors.reset}`, message, ...args);
    }
  },
  error: (message, ...args) => {
    console.error(`${colors.red}[ERROR]${colors.reset}`, message, ...args);
  },
  debug: (message, ...args) => {
    if (LOG_LEVEL === 'debug') {
      console.log(`${colors.dim}[DEBUG]${colors.reset}`, message, ...args);
    }
  }
};

module.exports = {
  loggingMiddleware,
  logPageAccess,
  logAPICall,
  saveLog,
  getClientIP,
  log
};

