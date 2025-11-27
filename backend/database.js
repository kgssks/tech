const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'forum.db');
let db;

function init() {
  return new Promise((resolve, reject) => {
    // WAL 모드 활성화로 동시 읽기/쓰기 성능 향상
    db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
      if (err) {
        console.error('데이터베이스 연결 오류:', err);
        reject(err);
      } else {
        console.log('SQLite 데이터베이스 연결됨');
        
        // 먼저 무결성 검사
        db.get('PRAGMA integrity_check', (err, result) => {
          if (err) {
            console.error('⚠️  데이터베이스 무결성 검사 실패:', err.message);
            // 무결성 검사 실패해도 계속 진행 (복구 시도)
          } else if (result && result.integrity_check !== 'ok') {
            console.error('⚠️  데이터베이스 무결성 문제 발견:', result.integrity_check);
            console.error('   복구 스크립트 실행 권장: node scripts/db-recover.js');
            // 문제가 있어도 계속 진행 (서버는 시작되지만 쿼리 실패 가능)
          }
          
          // WAL 모드 설정 (동시성 향상)
          db.run('PRAGMA journal_mode = WAL', (err, result) => {
            if (err) {
              console.warn('WAL 모드 설정 실패 (계속 진행):', err);
            } else {
              console.log('WAL 모드 활성화됨 (동시성 향상)');
              
              // WAL 파일이 있으면 체크포인트 시도 (안전하게 WAL 내용을 메인 DB로 병합)
              db.run('PRAGMA wal_checkpoint(TRUNCATE)', (err) => {
                if (err) {
                  console.warn('WAL 체크포인트 실패 (무시):', err.message);
                } else {
                  console.log('WAL 체크포인트 완료');
                }
              });
            }
            
            // 외래 키 제약 활성화
            db.run('PRAGMA foreign_keys = ON', (err) => {
              if (err) {
                console.warn('외래 키 제약 활성화 실패:', err);
              }
              createTables().then(resolve).catch(reject);
            });
          });
        });
      }
    });
  });
}

function createTables() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // 사용자 테이블
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empno TEXT UNIQUE NOT NULL,
        empname TEXT NOT NULL,
        deptname TEXT,
        posname TEXT,
        phone_last TEXT,
        token_secret TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted INTEGER DEFAULT 0
      )`);
      
      // 사용안함 플래그 추가 (마이그레이션)
      db.run(`ALTER TABLE users ADD COLUMN deleted INTEGER DEFAULT 0`, (err) => {
        // 이미 존재하면 무시
      });

      // 부스 참여 테이블
      db.run(`CREATE TABLE IF NOT EXISTS booth_participations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        booth_code TEXT NOT NULL,
        scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        qr_data TEXT,
        latitude REAL,
        longitude REAL,
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(user_id, booth_code)
      )`);
      
      // GPS 정보 컬럼 추가 (마이그레이션)
      db.run(`ALTER TABLE booth_participations ADD COLUMN latitude REAL`, (err) => {
        // 이미 존재하면 무시
      });
      db.run(`ALTER TABLE booth_participations ADD COLUMN longitude REAL`, (err) => {
        // 이미 존재하면 무시
      });
      
      // 사용안함 플래그 추가 (마이그레이션)
      db.run(`ALTER TABLE booth_participations ADD COLUMN deleted INTEGER DEFAULT 0`, (err) => {
        // 이미 존재하면 무시
      });

      // 경품 지급 테이블
      db.run(`CREATE TABLE IF NOT EXISTS prize_claims (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        claimed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        qr_data TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`);

      // 설문조사 테이블
      db.run(`CREATE TABLE IF NOT EXISTS surveys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        session_name TEXT,
        lecture_satisfaction INTEGER,
        instructor_satisfaction INTEGER,
        application_score INTEGER,
        satisfied_points TEXT,
        improvement_points TEXT,
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      
      // 새로운 5점 척도 설문 필드 추가 (마이그레이션)
      db.run(`ALTER TABLE surveys ADD COLUMN overall_satisfaction INTEGER`, (err) => {
        // 이미 존재하면 무시
      });
      db.run(`ALTER TABLE surveys ADD COLUMN booth_satisfaction INTEGER`, (err) => {
        // 이미 존재하면 무시
      });
      db.run(`ALTER TABLE surveys ADD COLUMN session_satisfaction INTEGER`, (err) => {
        // 이미 존재하면 무시
      });
      db.run(`ALTER TABLE surveys ADD COLUMN website_satisfaction INTEGER`, (err) => {
        // 이미 존재하면 무시
      });
      db.run(`ALTER TABLE surveys ADD COLUMN prize_satisfaction INTEGER`, (err) => {
        // 이미 존재하면 무시
      });

      // 경품 추첨 번호 테이블
      db.run(`CREATE TABLE IF NOT EXISTS lottery_numbers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        lottery_number INTEGER UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`);

      // 관리자 테이블
      db.run(`CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // 웹로그 테이블
      db.run(`CREATE TABLE IF NOT EXISTS web_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        ip_address TEXT,
        user_agent TEXT,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        query_params TEXT,
        status_code INTEGER,
        user_id INTEGER,
        user_empno TEXT,
        user_empname TEXT,
        user_deptname TEXT,
        user_posname TEXT,
        session_id TEXT,
        referer TEXT,
        response_time_ms INTEGER,
        error_message TEXT,
        request_body TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`);
      
      // 기존 테이블에 사용자 정보 필드 추가 (마이그레이션)
      db.run(`ALTER TABLE web_logs ADD COLUMN user_empname TEXT`, (err) => {
        // 이미 존재하면 무시
      });
      db.run(`ALTER TABLE web_logs ADD COLUMN user_deptname TEXT`, (err) => {
        // 이미 존재하면 무시
      });
      db.run(`ALTER TABLE web_logs ADD COLUMN user_posname TEXT`, (err) => {
        // 이미 존재하면 무시
      });

      // 인덱스 생성 (조회 성능 향상)
      db.run(`CREATE INDEX IF NOT EXISTS idx_web_logs_timestamp ON web_logs(timestamp)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_web_logs_user_id ON web_logs(user_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_web_logs_path ON web_logs(path)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_web_logs_ip ON web_logs(ip_address)`);

      db.run(`SELECT 1`, (err) => {
        if (err) {
          reject(err);
        } else {
          // 기본 관리자 계정 생성
          const bcrypt = require('bcryptjs');
          const defaultPassword = 'forumPassPass';
          bcrypt.hash(defaultPassword, 10, (err, hash) => {
            if (!err) {
              db.run(`INSERT OR IGNORE INTO admins (username, password_hash) 
                      VALUES ('foruma', ?)`, [hash]);
            }
          });
          resolve();
        }
      });
    });
  });
}

function getDB() {
  return db;
}

module.exports = {
  init,
  getDB,
  createTables
};

