const logger = require('../config/logger');
const morgan = require('morgan');

// Morgan HTTP 로깅 설정
const morganFormat = ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" - :response-time ms';

// Morgan 스트림 설정 (Winston과 연동)
const morganStream = {
    write: (message) => {
        logger.http(message.trim());
    }
};

// Morgan 미들웨어 생성
const morganMiddleware = morgan(morganFormat, { stream: morganStream });

// 요청 로깅 미들웨어
const requestLogger = (req, res, next) => {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substr(2, 9);
    
    // 요청 ID를 req 객체에 추가
    req.requestId = requestId;
    
    // 요청 정보 로깅
    logger.info('Incoming request', {
        requestId,
        method: req.method,
        url: req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip || req.connection.remoteAddress,
        headers: {
            'content-type': req.get('Content-Type'),
            'authorization': req.get('Authorization') ? 'Bearer ***' : 'none'
        }
    });
    
    // 응답 완료 시 로깅
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        const logData = {
            requestId,
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            contentLength: res.get('Content-Length') || 0
        };
        
        if (res.statusCode >= 400) {
            logger.warn('Request completed with error', logData);
        } else {
            logger.info('Request completed successfully', logData);
        }
    });
    
    next();
};

// 에러 로깅 미들웨어
const errorLogger = (err, req, res, next) => {
    const requestId = req.requestId || 'unknown';
    
    logger.error('Request error', {
        requestId,
        error: {
            message: err.message,
            stack: err.stack,
            name: err.name
        },
        method: req.method,
        url: req.url,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent')
    });
    
    next(err);
};

// 데이터베이스 쿼리 로깅
const dbLogger = {
    logQuery: (query, params, duration) => {
        logger.debug('Database query executed', {
            query: query.replace(/\s+/g, ' ').trim(),
            params: params || [],
            duration: `${duration}ms`
        });
    },
    
    logError: (error, query, params) => {
        logger.error('Database query error', {
            error: {
                message: error.message,
                code: error.code,
                stack: error.stack
            },
            query: query.replace(/\s+/g, ' ').trim(),
            params: params || []
        });
    }
};

// 인증 관련 로깅
const authLogger = {
    logLogin: (userId, employeeId, ip, success, error = null) => {
        const logData = {
            userId,
            employeeId,
            ip,
            success,
            timestamp: new Date().toISOString()
        };
        
        if (success) {
            logger.info('User login successful', logData);
        } else {
            logger.warn('User login failed', { ...logData, error: error?.message });
        }
    },
    
    logLogout: (userId, employeeId, ip) => {
        logger.info('User logout', {
            userId,
            employeeId,
            ip,
            timestamp: new Date().toISOString()
        });
    },
    
    logTokenValidation: (token, valid, reason = null) => {
        const logData = {
            tokenPrefix: token ? token.substring(0, 10) + '...' : 'none',
            valid,
            timestamp: new Date().toISOString()
        };
        
        if (valid) {
            logger.debug('Token validation successful', logData);
        } else {
            logger.warn('Token validation failed', { ...logData, reason });
        }
    }
};

// 이벤트 관련 로깅
const eventLogger = {
    logEventParticipation: (userId, eventType, eventData, success, error = null) => {
        const logData = {
            userId,
            eventType,
            eventData,
            success,
            timestamp: new Date().toISOString()
        };
        
        if (success) {
            logger.info('Event participation recorded', logData);
        } else {
            logger.error('Event participation failed', { ...logData, error: error?.message });
        }
    },
    
    logQRCodeGeneration: (qrType, qrId, ip, success, error = null) => {
        const logData = {
            qrType,
            qrId,
            ip,
            success,
            timestamp: new Date().toISOString()
        };
        
        if (success) {
            logger.info('QR code generated', logData);
        } else {
            logger.error('QR code generation failed', { ...logData, error: error?.message });
        }
    },

    logPrizeQRGeneration: (userId, prizeNumber, ip, success, error = null) => {
        const logData = {
            userId,
            prizeNumber,
            ip,
            success,
            timestamp: new Date().toISOString()
        };
        
        if (success) {
            logger.info('Prize QR code generated', logData);
        } else {
            logger.error('Prize QR code generation failed', { ...logData, error: error?.message });
        }
    }
};

// 관리자 활동 로깅
const adminLogger = {
    logAdminAction: (adminId, action, details, ip) => {
        logger.info('Admin action performed', {
            adminId,
            action,
            details,
            ip,
            timestamp: new Date().toISOString()
        });
    },
    
    logDataAccess: (adminId, dataType, filters, ip) => {
        logger.info('Admin data access', {
            adminId,
            dataType,
            filters,
            ip,
            timestamp: new Date().toISOString()
        });
    },

    logPrizeExchange: (adminId, userId, prizeNumber, ip, success) => {
        logger.info('Admin prize exchange', {
            adminId,
            userId,
            prizeNumber,
            success,
            ip,
            timestamp: new Date().toISOString()
        });
    }
};

module.exports = {
    morganMiddleware,
    requestLogger,
    errorLogger,
    dbLogger,
    authLogger,
    eventLogger,
    adminLogger
};
