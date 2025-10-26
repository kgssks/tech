#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// 로그 관리 스크립트
class LogManager {
  constructor() {
    this.logDir = path.join(__dirname, '../logs');
    this.maxLogFiles = 10;
    this.maxLogSize = 50 * 1024 * 1024; // 50MB
  }

  // 로그 파일 정리
  async cleanupLogs() {
    console.log('로그 파일 정리를 시작합니다...');
    
    try {
      if (!fs.existsSync(this.logDir)) {
        console.log('로그 디렉토리가 존재하지 않습니다.');
        return;
      }

      const files = fs.readdirSync(this.logDir);
      const logFiles = files.filter(file => file.endsWith('.log'));
      
      console.log(`발견된 로그 파일: ${logFiles.length}개`);
      
      for (const file of logFiles) {
        const filePath = path.join(this.logDir, file);
        const stats = fs.statSync(filePath);
        
        // 파일 크기가 너무 큰 경우 압축
        if (stats.size > this.maxLogSize) {
          await this.compressLogFile(filePath);
        }
        
        // 오래된 로그 파일 삭제
        const fileAge = Date.now() - stats.mtime.getTime();
        const maxAge = 30 * 24 * 60 * 60 * 1000; // 30일
        
        if (fileAge > maxAge) {
          fs.unlinkSync(filePath);
          console.log(`오래된 로그 파일 삭제: ${file}`);
        }
      }
      
      console.log('로그 파일 정리가 완료되었습니다.');
    } catch (error) {
      console.error('로그 정리 중 오류 발생:', error.message);
    }
  }

  // 로그 파일 압축
  async compressLogFile(filePath) {
    return new Promise((resolve, reject) => {
      const compressedPath = filePath + '.gz';
      exec(`gzip -c "${filePath}" > "${compressedPath}"`, (error, stdout, stderr) => {
        if (error) {
          console.error(`압축 실패: ${filePath}`, error.message);
          reject(error);
        } else {
          fs.unlinkSync(filePath);
          console.log(`로그 파일 압축 완료: ${path.basename(filePath)}`);
          resolve();
        }
      });
    });
  }

  // 로그 통계 생성
  generateLogStats() {
    console.log('로그 통계를 생성합니다...');
    
    try {
      if (!fs.existsSync(this.logDir)) {
        console.log('로그 디렉토리가 존재하지 않습니다.');
        return;
      }

      const files = fs.readdirSync(this.logDir);
      const logFiles = files.filter(file => file.endsWith('.log'));
      
      let totalSize = 0;
      let totalLines = 0;
      const fileStats = [];

      for (const file of logFiles) {
        const filePath = path.join(this.logDir, file);
        const stats = fs.statSync(filePath);
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n').length - 1;
        
        totalSize += stats.size;
        totalLines += lines;
        
        fileStats.push({
          name: file,
          size: this.formatBytes(stats.size),
          lines: lines,
          modified: stats.mtime.toISOString()
        });
      }

      console.log('\n=== 로그 통계 ===');
      console.log(`총 파일 수: ${logFiles.length}개`);
      console.log(`총 크기: ${this.formatBytes(totalSize)}`);
      console.log(`총 라인 수: ${totalLines.toLocaleString()}줄`);
      console.log('\n=== 파일별 상세 ===');
      
      fileStats.forEach(stat => {
        console.log(`${stat.name}: ${stat.size} (${stat.lines.toLocaleString()}줄) - ${stat.modified}`);
      });
      
    } catch (error) {
      console.error('로그 통계 생성 중 오류 발생:', error.message);
    }
  }

  // 바이트를 읽기 쉬운 형태로 변환
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // 에러 로그 분석
  analyzeErrors() {
    console.log('에러 로그를 분석합니다...');
    
    try {
      const errorLogPath = path.join(this.logDir, 'error.log');
      if (!fs.existsSync(errorLogPath)) {
        console.log('에러 로그 파일이 존재하지 않습니다.');
        return;
      }

      const content = fs.readFileSync(errorLogPath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      
      const errors = lines.map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter(Boolean);

      console.log(`\n=== 에러 분석 (총 ${errors.length}개) ===`);
      
      // 에러 유형별 집계
      const errorTypes = {};
      errors.forEach(error => {
        const type = error.error?.message || 'Unknown';
        errorTypes[type] = (errorTypes[type] || 0) + 1;
      });

      Object.entries(errorTypes)
        .sort(([,a], [,b]) => b - a)
        .forEach(([type, count]) => {
          console.log(`${type}: ${count}회`);
        });

      // 최근 에러 5개 출력
      console.log('\n=== 최근 에러 5개 ===');
      errors.slice(-5).forEach((error, index) => {
        console.log(`${index + 1}. ${error.timestamp} - ${error.error?.message}`);
      });
      
    } catch (error) {
      console.error('에러 분석 중 오류 발생:', error.message);
    }
  }
}

// CLI 인터페이스
const args = process.argv.slice(2);
const command = args[0];

const logManager = new LogManager();

switch (command) {
  case 'cleanup':
    logManager.cleanupLogs();
    break;
  case 'stats':
    logManager.generateLogStats();
    break;
  case 'analyze':
    logManager.analyzeErrors();
    break;
  case 'all':
    logManager.generateLogStats();
    logManager.analyzeErrors();
    logManager.cleanupLogs();
    break;
  default:
    console.log('사용법: node log-manager.js [command]');
    console.log('명령어:');
    console.log('  cleanup  - 로그 파일 정리');
    console.log('  stats    - 로그 통계 생성');
    console.log('  analyze  - 에러 로그 분석');
    console.log('  all      - 모든 작업 실행');
    break;
}
