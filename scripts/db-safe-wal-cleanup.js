#!/usr/bin/env node

/**
 * 안전한 WAL 파일 정리 스크립트
 * 
 * WAL 파일을 삭제하기 전에 반드시 체크포인트를 수행하여
 * 모든 변경사항을 메인 데이터베이스에 반영합니다.
 * 
 * 사용법:
 *   node scripts/db-safe-wal-cleanup.js
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'forum.db');
const walPath = dbPath + '-wal';
const shmPath = dbPath + '-shm';

console.log('='.repeat(60));
console.log('안전한 WAL 파일 정리 스크립트');
console.log('='.repeat(60));
console.log('');

// 데이터베이스 파일 존재 확인
if (!fs.existsSync(dbPath)) {
  console.error('❌ 오류: 데이터베이스 파일을 찾을 수 없습니다.');
  process.exit(1);
}

// WAL 파일 존재 확인
const walExists = fs.existsSync(walPath);
const shmExists = fs.existsSync(shmPath);

if (!walExists && !shmExists) {
  console.log('✅ WAL 파일이 없습니다. 정리할 것이 없습니다.');
  process.exit(0);
}

console.log(`WAL 파일 존재: ${walExists ? '예' : '아니오'}`);
console.log(`SHM 파일 존재: ${shmExists ? '예' : '아니오'}`);
console.log('');

// 1단계: 데이터베이스 연결 및 체크포인트
console.log('1단계: WAL 체크포인트 수행 중...');
console.log('   (WAL 파일의 모든 변경사항을 메인 데이터베이스에 반영)');
console.log('');

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error('❌ 데이터베이스 열기 실패:', err.message);
    console.error('');
    console.error('⚠️  데이터베이스가 다른 프로세스에서 사용 중일 수 있습니다.');
    console.error('   서버를 중지한 후 다시 시도하세요: pm2 stop tech-forum');
    process.exit(1);
  }

  // WAL 모드 확인
  db.get('PRAGMA journal_mode', (err, result) => {
    if (err) {
      console.error('❌ 저널 모드 확인 실패:', err.message);
      db.close();
      process.exit(1);
    }

    const journalMode = result.journal_mode;
    console.log(`현재 저널 모드: ${journalMode}`);
    console.log('');

    if (journalMode !== 'wal') {
      console.log('⚠️  WAL 모드가 아닙니다. WAL 파일이 없어야 합니다.');
      db.close();
      
      // WAL 파일이 있으면 삭제 (비정상 상태)
      if (walExists) {
        console.log('   비정상 WAL 파일 삭제 중...');
        try {
          fs.unlinkSync(walPath);
          console.log('   ✅ WAL 파일 삭제 완료');
        } catch (error) {
          console.error('   ❌ WAL 파일 삭제 실패:', error.message);
        }
      }
      if (shmExists) {
        console.log('   비정상 SHM 파일 삭제 중...');
        try {
          fs.unlinkSync(shmPath);
          console.log('   ✅ SHM 파일 삭제 완료');
        } catch (error) {
          console.error('   ❌ SHM 파일 삭제 실패:', error.message);
        }
      }
      process.exit(0);
    }

    // WAL 체크포인트 수행
    // TRUNCATE: 체크포인트 후 WAL 파일을 비움 (안전하게 정리)
    db.run('PRAGMA wal_checkpoint(TRUNCATE)', (err) => {
      if (err) {
        console.error('❌ WAL 체크포인트 실패:', err.message);
        db.close();
        process.exit(1);
      }

      console.log('✅ WAL 체크포인트 완료');
      console.log('   모든 변경사항이 메인 데이터베이스에 반영되었습니다.');
      console.log('');

      // 체크포인트 후 WAL 파일 크기 확인
      if (walExists) {
        const walStats = fs.statSync(walPath);
        const walSizeMB = (walStats.size / 1024 / 1024).toFixed(2);
        console.log(`WAL 파일 크기: ${walSizeMB} MB`);
        
        if (walStats.size > 0) {
          console.log('⚠️  WAL 파일이 아직 비어있지 않습니다.');
          console.log('   다른 프로세스가 데이터베이스를 사용 중일 수 있습니다.');
          console.log('   서버를 중지한 후 다시 시도하세요.');
          db.close();
          process.exit(1);
        }
      }

      db.close((err) => {
        if (err) {
          console.error('❌ 데이터베이스 닫기 실패:', err.message);
          process.exit(1);
        }

        // 2단계: WAL 파일 삭제
        console.log('2단계: WAL 파일 정리 중...');
        console.log('');

        let deleted = 0;

        if (walExists) {
          try {
            fs.unlinkSync(walPath);
            console.log('✅ WAL 파일 삭제 완료');
            deleted++;
          } catch (error) {
            console.error('❌ WAL 파일 삭제 실패:', error.message);
          }
        }

        if (shmExists) {
          try {
            fs.unlinkSync(shmPath);
            console.log('✅ SHM 파일 삭제 완료');
            deleted++;
          } catch (error) {
            console.error('❌ SHM 파일 삭제 실패:', error.message);
          }
        }

        console.log('');
        console.log('='.repeat(60));
        if (deleted > 0) {
          console.log(`✅ 정리 완료: ${deleted}개 파일 삭제됨`);
        } else {
          console.log('✅ 정리 완료: 삭제할 파일 없음');
        }
        console.log('='.repeat(60));
        console.log('');
        console.log('⚠️  중요: WAL 파일은 정상적으로 체크포인트된 후에만 삭제해야 합니다.');
        console.log('   이 스크립트를 사용하지 않고 직접 삭제하면 데이터 손실이 발생할 수 있습니다.');
        process.exit(0);
      });
    });
  });
});

