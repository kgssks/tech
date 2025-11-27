#!/usr/bin/env node

/**
 * 빠른 데이터베이스 상태 확인 스크립트
 * 서버에서 간단히 상태를 확인할 때 사용
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'forum.db');

console.log('데이터베이스 상태 확인 중...\n');

// 파일 존재 확인
if (!fs.existsSync(dbPath)) {
  console.error('❌ 데이터베이스 파일이 없습니다.');
  process.exit(1);
}

const stats = fs.statSync(dbPath);
console.log(`파일 크기: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
console.log(`수정 시간: ${stats.mtime.toISOString()}\n`);

// WAL 파일 확인
const walPath = dbPath + '-wal';
const shmPath = dbPath + '-shm';
const walExists = fs.existsSync(walPath);
const shmExists = fs.existsSync(shmPath);

if (walExists) {
  const walStats = fs.statSync(walPath);
  console.log(`WAL 파일 크기: ${(walStats.size / 1024 / 1024).toFixed(2)} MB`);
}

console.log('');

// 무결성 검사
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('❌ 데이터베이스 열기 실패:', err.message);
    console.error('   오류 코드:', err.code);
    process.exit(1);
  }

  db.get('PRAGMA integrity_check', (err, result) => {
    if (err) {
      console.error('❌ 무결성 검사 실패:', err.message);
      db.close();
      process.exit(1);
    }

    const integrityResult = result.integrity_check;
    console.log(`무결성 검사: ${integrityResult === 'ok' ? '✅ 정상' : '❌ 문제 발견'}`);
    
    if (integrityResult !== 'ok') {
      console.log(`   상세: ${integrityResult}`);
    }

    // 간단한 쿼리 테스트
    db.get('SELECT COUNT(*) as count FROM users', (err, result) => {
      if (err) {
        console.error('❌ 쿼리 테스트 실패:', err.message);
        db.close();
        process.exit(1);
      }
      console.log(`사용자 수: ${result.count}`);
      
      db.get('SELECT COUNT(*) as count FROM lottery_numbers', (err, result) => {
        if (err) {
          console.error('❌ 쿼리 테스트 실패:', err.message);
          db.close();
          process.exit(1);
        }
        console.log(`추첨번호 발급 수: ${result.count}`);
        
        db.close();
        console.log('\n✅ 기본 상태 확인 완료');
        process.exit(integrityResult === 'ok' ? 0 : 1);
      });
    });
  });
});

