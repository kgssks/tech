const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 로깅 미들웨어
const { loggingMiddleware, logPageAccess } = require('./backend/utils/logger');

// 미들웨어
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API 라우트에 로깅 미들웨어 적용
app.use('/api', loggingMiddleware);

// 정적 파일 서빙
app.use('/asset', express.static('asset'));

// 정적 파일 (HTML 외)은 로깅 없이 서빙
app.use(express.static('public'));

// 데이터베이스 초기화
const db = require('./backend/database');
db.init().catch(err => {
  console.error('데이터베이스 초기화 실패:', err);
});

// 라우트
app.use('/api/config', require('./backend/routes/config'));
app.use('/api/auth', require('./backend/routes/auth'));
app.use('/api/data', require('./backend/routes/data'));
app.use('/api/admin', require('./backend/routes/admin'));
app.use('/api/booth', require('./backend/routes/booth'));
app.use('/api/survey', require('./backend/routes/survey'));
app.use('/api/prize', require('./backend/routes/prize'));
app.use('/api/lottery', require('./backend/routes/lottery'));
app.use('/api/logs', require('./backend/routes/logs'));

// 정적 파일 서빙 (페이지 접속 로그 기록)
app.get('/', logPageAccess, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 주요 페이지 접속 로그
app.get('/app/event/', logPageAccess, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app', 'event', 'index.html'));
});

app.get('/app/event/lottery/', logPageAccess, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app', 'event', 'lottery', 'index.html'));
});

app.get('/app/event/auth', logPageAccess, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app', 'event', 'auth.html'));
});

app.get('/app/survey/', logPageAccess, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app', 'survey', 'index.html'));
});

app.get('/app/admin/', logPageAccess, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app', 'admin', 'index.html'));
});

// WebSocket 연결 관리
const clients = new Map();

wss.on('connection', (ws, req) => {
  console.log('WebSocket 연결됨');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'register') {
        clients.set(data.userId, ws);
        ws.userId = data.userId;
      }
    } catch (error) {
      console.error('WebSocket 메시지 파싱 오류:', error);
    }
  });

  ws.on('close', () => {
    if (ws.userId) {
      clients.delete(ws.userId);
    }
  });
});

// WebSocket 클라이언트 전송 함수
global.sendToClient = (userId, data) => {
  const client = clients.get(userId);
  if (client && client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(data));
  }
};

const { log } = require('./backend/utils/logger');

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  log.info(`서버가 포트 ${PORT}에서 실행 중입니다.`);
  log.info(`환경: ${process.env.NODE_ENV || 'development'}`);
  log.info(`콘솔 로그: ${process.env.ENABLE_CONSOLE_LOG !== 'false' ? '활성화' : '비활성화'}`);
  log.info(`로그 레벨: ${process.env.LOG_LEVEL || 'info'}`);
  log.info(`KB 인증 API: ${process.env.KB_AUTH_API_URL || 'https://devlxp.kbstar.com/lmd/geibp'}`);
});

