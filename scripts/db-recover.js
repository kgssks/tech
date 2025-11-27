#!/usr/bin/env node

/**
 * SQLite 데이터베이스 복구 스크립트
 * 
 * 사용법:
 *   node scripts/db-recover.js [옵션]
 * 
 * 옵션:
 *   --check-only    : 무결성 검사만 수행 (복구하지 않음)
 *   --backup        : 복구 전 백업 생성
 *   --force         : 확인 없이 복구 진행
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dbPath = path.join(__dirname, '..', 'forum.db');
const backupPath = path.join(__dirname, '..', 'forum.db.backup');
const recoveredPath = path.join(__dirname, '..', 'forum.db.recovered');

const args = process.argv.slice(2);
const checkOnly = args.includes('--check-only');
const createBackup = args.includes('--backup') || !checkOnly;
const force = args.includes('--force');

console.log('='.repeat(60));
console.log('SQLite 데이터베이스 복구 스크립트');
console.log('='.repeat(60));
console.log(`데이터베이스 경로: ${dbPath}`);
console.log(`백업 경로: ${backupPath}`);
console.log('');

// 데이터베이스 파일 존재 확인
if (!fs.existsSync(dbPath)) {
  console.error('❌ 오류: 데이터베이스 파일을 찾을 수 없습니다.');
  process.exit(1);
}

// WAL 파일 확인
const walPath = dbPath + '-wal';
const shmPath = dbPath + '-shm';
const walExists = fs.existsSync(walPath);
const shmExists = fs.existsSync(shmPath);

console.log(`WAL 파일 존재: ${walExists ? '예' : '아니오'}`);
console.log(`SHM 파일 존재: ${shmExists ? '예' : '아니오'}`);
console.log('');

// 1단계: 무결성 검사
function checkIntegrity() {
  return new Promise((resolve, reject) => {
    console.log('1단계: 데이터베이스 무결성 검사 중...');
    
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        console.error('❌ 데이터베이스 열기 실패:', err.message);
        return reject(err);
      }
    });

    db.get('PRAGMA integrity_check', (err, result) => {
      if (err) {
        console.error('❌ 무결성 검사 실패:', err.message);
        db.close();
        return reject(err);
      }

      const integrityResult = result.integrity_check;
      console.log(`무결성 검사 결과: ${integrityResult}`);
      
      if (integrityResult === 'ok') {
        console.log('✅ 데이터베이스가 정상입니다.');
        db.close();
        return resolve(true);
      } else {
        console.log('⚠️  데이터베이스에 문제가 발견되었습니다.');
        console.log(`   상세: ${integrityResult}`);
        db.close();
        return resolve(false);
      }
    });
  });
}

// 2단계: 백업 생성
function createBackupFile() {
  return new Promise((resolve, reject) => {
    if (!createBackup) {
      return resolve();
    }

    console.log('2단계: 백업 생성 중...');
    
    try {
      // 기존 백업이 있으면 타임스탬프 추가
      let finalBackupPath = backupPath;
      if (fs.existsSync(backupPath)) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        finalBackupPath = `${backupPath}.${timestamp}`;
      }

      // 데이터베이스 파일 복사
      fs.copyFileSync(dbPath, finalBackupPath);
      
      // WAL 파일도 복사
      if (walExists) {
        fs.copyFileSync(walPath, finalBackupPath + '-wal');
      }
      if (shmExists) {
        fs.copyFileSync(shmPath, finalBackupPath + '-shm');
      }

      console.log(`✅ 백업 생성 완료: ${finalBackupPath}`);
      resolve(finalBackupPath);
    } catch (error) {
      console.error('❌ 백업 생성 실패:', error.message);
      reject(error);
    }
  });
}

// 3단계: WAL 파일 체크포인트 (WAL 모드인 경우)
function checkpointWAL() {
  return new Promise((resolve, reject) => {
    if (!walExists) {
      return resolve();
    }

    console.log('3단계: WAL 파일 체크포인트 중...');
    
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
      if (err) {
        console.warn('⚠️  WAL 체크포인트 실패 (계속 진행):', err.message);
        return resolve();
      }

      // WAL 모드 체크포인트
      db.run('PRAGMA wal_checkpoint(FULL)', (err) => {
        if (err) {
          console.warn('⚠️  WAL 체크포인트 실패 (계속 진행):', err.message);
        } else {
          console.log('✅ WAL 체크포인트 완료');
        }
        db.close();
        resolve();
      });
    });
  });
}

// 4단계: 데이터베이스 덤프 및 복구
function recoverDatabase() {
  return new Promise((resolve, reject) => {
    console.log('4단계: 데이터베이스 복구 중...');
    
    try {
      // sqlite3 명령어로 덤프 생성
      const dumpPath = path.join(__dirname, '..', 'forum.dump');
      console.log('   덤프 파일 생성 중...');
      
      execSync(`sqlite3 "${dbPath}" .dump > "${dumpPath}"`, {
        stdio: 'inherit',
        encoding: 'utf8'
      });

      console.log('   덤프 파일에서 복구 중...');
      
      // 복구된 데이터베이스 생성
      if (fs.existsSync(recoveredPath)) {
        fs.unlinkSync(recoveredPath);
      }

      execSync(`sqlite3 "${recoveredPath}" < "${dumpPath}"`, {
        stdio: 'inherit',
        encoding: 'utf8'
      });

      // 복구된 데이터베이스 무결성 검사
      console.log('   복구된 데이터베이스 무결성 검사 중...');
      const db = new sqlite3.Database(recoveredPath, sqlite3.OPEN_READONLY);
      
      db.get('PRAGMA integrity_check', (err, result) => {
        db.close();
        
        if (err) {
          console.error('❌ 복구된 데이터베이스 무결성 검사 실패:', err.message);
          return reject(err);
        }

        if (result.integrity_check === 'ok') {
          console.log('✅ 복구된 데이터베이스가 정상입니다.');
          
          // 원본 파일 교체
          if (!force) {
            console.log('');
            console.log('⚠️  원본 데이터베이스를 복구된 버전으로 교체하시겠습니까?');
            console.log('   (수동으로 교체하려면 다음 명령어 실행:)');
            console.log(`   mv "${recoveredPath}" "${dbPath}"`);
            console.log(`   rm -f "${dbPath}-wal" "${dbPath}-shm"`);
          } else {
            // 자동 교체
            fs.renameSync(dbPath, dbPath + '.old');
            fs.renameSync(recoveredPath, dbPath);
            if (walExists) fs.unlinkSync(walPath);
            if (shmExists) fs.unlinkSync(shmPath);
            console.log('✅ 데이터베이스 복구 완료');
          }
          
          // 덤프 파일 정리
          fs.unlinkSync(dumpPath);
          resolve();
        } else {
          console.error('❌ 복구된 데이터베이스에도 문제가 있습니다.');
          console.error(`   상세: ${result.integrity_check}`);
          reject(new Error('복구 실패'));
        }
      });
    } catch (error) {
      console.error('❌ 복구 실패:', error.message);
      reject(error);
    }
  });
}

// 메인 실행
async function main() {
  try {
    // 무결성 검사
    const isHealthy = await checkIntegrity();
    
    if (isHealthy) {
      console.log('');
      console.log('✅ 데이터베이스가 정상입니다. 복구가 필요하지 않습니다.');
      process.exit(0);
    }

    if (checkOnly) {
      console.log('');
      console.log('⚠️  데이터베이스에 문제가 있습니다. --check-only 옵션을 제거하고 다시 실행하세요.');
      process.exit(1);
    }

    // 백업 생성
    await createBackupFile();
    
    // WAL 체크포인트
    await checkpointWAL();
    
    // 복구
    await recoverDatabase();
    
    console.log('');
    console.log('='.repeat(60));
    console.log('복구 프로세스 완료');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('');
    console.error('❌ 복구 프로세스 실패:', error.message);
    console.error('');
    console.error('수동 복구 방법:');
    console.error('1. 백업 파일 확인: ls -lh forum.db.backup*');
    console.error('2. SQLite 복구 도구 사용:');
    console.error('   sqlite3 forum.db ".dump" > forum.dump');
    console.error('   sqlite3 forum.db.recovered < forum.dump');
    console.error('3. 또는 전문 복구 도구 사용');
    process.exit(1);
  }
}

main();

