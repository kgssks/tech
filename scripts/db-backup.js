#!/usr/bin/env node

/**
 * 데이터베이스 자동 백업 스크립트
 * 
 * 기능:
 * - WAL 체크포인트 수행 (안전한 백업)
 * - 타임스탬프가 포함된 백업 파일 생성
 * - 오래된 백업 자동 정리 (기본 7일)
 * - 백업 상태 보고
 * 
 * 사용법:
 *   node scripts/db-backup.js [옵션]
 * 
 * 옵션:
 *   --keep-days N    : 백업 보관 기간 (일, 기본값: 7)
 *   --backup-dir DIR : 백업 디렉토리 (기본값: ./backups)
 *   --no-cleanup     : 오래된 백업 정리 안 함
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const keepDays = parseInt(args.find(arg => arg.startsWith('--keep-days='))?.split('=')[1] || '7', 10);
const backupDir = args.find(arg => arg.startsWith('--backup-dir='))?.split('=')[1] || path.join(__dirname, '..', 'backups');
const noCleanup = args.includes('--no-cleanup');

const dbPath = path.join(__dirname, '..', 'forum.db');
const walPath = dbPath + '-wal';
const shmPath = dbPath + '-shm';

console.log('='.repeat(60));
console.log('데이터베이스 백업 스크립트');
console.log('='.repeat(60));
console.log(`데이터베이스: ${dbPath}`);
console.log(`백업 디렉토리: ${backupDir}`);
console.log(`보관 기간: ${keepDays}일`);
console.log('');

// 데이터베이스 파일 존재 확인
if (!fs.existsSync(dbPath)) {
  console.error('❌ 오류: 데이터베이스 파일을 찾을 수 없습니다.');
  process.exit(1);
}

// 백업 디렉토리 생성
if (!fs.existsSync(backupDir)) {
  try {
    fs.mkdirSync(backupDir, { recursive: true });
    console.log(`✅ 백업 디렉토리 생성: ${backupDir}`);
  } catch (error) {
    console.error('❌ 백업 디렉토리 생성 실패:', error.message);
    process.exit(1);
  }
}

// 1단계: WAL 체크포인트 (안전한 백업을 위해)
function checkpointWAL() {
  return new Promise((resolve, reject) => {
    console.log('1단계: WAL 체크포인트 수행 중...');
    
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
      if (err) {
        console.warn('⚠️  데이터베이스 열기 실패 (계속 진행):', err.message);
        return resolve(); // 계속 진행
      }

      db.get('PRAGMA journal_mode', (err, result) => {
        if (err || !result || result.journal_mode !== 'wal') {
          db.close();
          return resolve(); // WAL 모드가 아니면 체크포인트 불필요
        }

        db.run('PRAGMA wal_checkpoint(TRUNCATE)', (err) => {
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
  });
}

// 2단계: 백업 생성
function createBackup() {
  return new Promise((resolve, reject) => {
    console.log('2단계: 백업 파일 생성 중...');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupFileName = `forum.db.backup.${timestamp}`;
    const backupPath = path.join(backupDir, backupFileName);
    
    try {
      // 데이터베이스 파일 복사
      fs.copyFileSync(dbPath, backupPath);
      
      // 파일 정보
      const stats = fs.statSync(backupPath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      
      console.log(`✅ 백업 생성 완료: ${backupFileName}`);
      console.log(`   크기: ${sizeMB} MB`);
      console.log(`   경로: ${backupPath}`);
      
      resolve({
        fileName: backupFileName,
        path: backupPath,
        size: stats.size,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('❌ 백업 생성 실패:', error.message);
      reject(error);
    }
  });
}

// 3단계: 오래된 백업 정리
function cleanupOldBackups(keepDays) {
  if (noCleanup) {
    console.log('3단계: 백업 정리 건너뜀 (--no-cleanup 옵션)');
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    console.log(`3단계: ${keepDays}일 이상 된 백업 정리 중...`);
    
    try {
      const files = fs.readdirSync(backupDir);
      const backupFiles = files.filter(f => f.startsWith('forum.db.backup.'));
      
      if (backupFiles.length === 0) {
        console.log('   정리할 백업이 없습니다.');
        return resolve();
      }

      const now = Date.now();
      const keepTime = keepDays * 24 * 60 * 60 * 1000; // 밀리초
      let deletedCount = 0;
      let totalFreed = 0;

      backupFiles.forEach(file => {
        const filePath = path.join(backupDir, file);
        try {
          const stats = fs.statSync(filePath);
          const age = now - stats.mtimeMs;

          if (age > keepTime) {
            const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
            fs.unlinkSync(filePath);
            deletedCount++;
            totalFreed += stats.size;
            console.log(`   삭제: ${file} (${sizeMB} MB, ${Math.floor(age / (24 * 60 * 60 * 1000))}일 경과)`);
          }
        } catch (error) {
          console.warn(`   ⚠️  파일 처리 실패: ${file} - ${error.message}`);
        }
      });

      if (deletedCount > 0) {
        const freedMB = (totalFreed / 1024 / 1024).toFixed(2);
        console.log(`✅ ${deletedCount}개 백업 삭제 완료 (${freedMB} MB 해제)`);
      } else {
        console.log('   삭제할 백업이 없습니다.');
      }

      resolve();
    } catch (error) {
      console.warn('⚠️  백업 정리 중 오류 (계속 진행):', error.message);
      resolve(); // 오류가 나도 계속 진행
    }
  });
}

// 4단계: 백업 목록 표시
function listBackups() {
  return new Promise((resolve) => {
    console.log('4단계: 백업 목록');
    console.log('');

    try {
      const files = fs.readdirSync(backupDir);
      const backupFiles = files
        .filter(f => f.startsWith('forum.db.backup.'))
        .map(f => {
          const filePath = path.join(backupDir, f);
          const stats = fs.statSync(filePath);
          return {
            name: f,
            path: filePath,
            size: stats.size,
            mtime: stats.mtime
          };
        })
        .sort((a, b) => b.mtime - a.mtime); // 최신순 정렬

      if (backupFiles.length === 0) {
        console.log('   백업 파일이 없습니다.');
      } else {
        console.log(`   총 ${backupFiles.length}개 백업:`);
        backupFiles.forEach((file, index) => {
          const sizeMB = (file.size / 1024 / 1024).toFixed(2);
          const age = Math.floor((Date.now() - file.mtime) / (24 * 60 * 60 * 1000));
          const marker = index === 0 ? ' ← 최신' : '';
          console.log(`   ${index + 1}. ${file.name}`);
          console.log(`      크기: ${sizeMB} MB, 생성: ${age}일 전${marker}`);
        });
      }

      resolve();
    } catch (error) {
      console.warn('⚠️  백업 목록 조회 실패:', error.message);
      resolve();
    }
  });
}

// 메인 실행
async function main() {
  try {
    // WAL 체크포인트
    await checkpointWAL();
    
    // 백업 생성
    const backup = await createBackup();
    
    // 오래된 백업 정리
    await cleanupOldBackups(keepDays);
    
    // 백업 목록 표시
    await listBackups();
    
    console.log('');
    console.log('='.repeat(60));
    console.log('✅ 백업 프로세스 완료');
    console.log('='.repeat(60));
    console.log('');
    console.log('백업 복원 방법:');
    console.log(`  cp ${backup.path} forum.db`);
    console.log('');
    
  } catch (error) {
    console.error('');
    console.error('❌ 백업 프로세스 실패:', error.message);
    process.exit(1);
  }
}

main();

