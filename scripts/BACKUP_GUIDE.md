# 데이터베이스 백업 가이드

## 자동 백업 스크립트

데이터베이스 손상을 대비해 정기적인 백업을 수행하세요.

### 기본 사용법

```bash
cd /home/ec2-user/tech

# 기본 백업 (7일 보관)
node scripts/db-backup.js
```

### 옵션

```bash
# 백업 보관 기간 변경 (30일)
node scripts/db-backup.js --keep-days=30

# 백업 디렉토리 지정
node scripts/db-backup.js --backup-dir=/path/to/backups

# 오래된 백업 정리 안 함
node scripts/db-backup.js --no-cleanup
```

## 정기 백업 설정 (Crontab)

### 매일 새벽 2시 자동 백업

```bash
crontab -e
```

다음 내용 추가:

```bash
# 매일 새벽 2시에 데이터베이스 백업 (7일 보관)
0 2 * * * cd /home/ec2-user/tech && node scripts/db-backup.js >> logs/backup.log 2>&1
```

### 주간 백업 (매주 일요일 새벽 2시, 30일 보관)

```bash
# 매주 일요일 새벽 2시에 장기 백업
0 2 * * 0 cd /home/ec2-user/tech && node scripts/db-backup.js --keep-days=30 >> logs/backup.log 2>&1
```

## 백업 복원

### 방법 1: 최신 백업으로 복원

```bash
cd /home/ec2-user/tech

# 1. 서버 중지
pm2 stop tech-forum

# 2. 최신 백업 확인
ls -lth backups/forum.db.backup.* | head -1

# 3. 백업으로 복원
cp backups/forum.db.backup.YYYY-MM-DDTHH-MM-SS forum.db

# 4. WAL 파일 정리
rm -f forum.db-wal forum.db-shm

# 5. 서버 재시작
pm2 start tech-forum
```

### 방법 2: 특정 백업으로 복원

```bash
# 백업 목록 확인
ls -lth backups/forum.db.backup.*

# 특정 백업으로 복원
cp backups/forum.db.backup.2025-11-27T02-00-00 forum.db
```

## 백업 확인

### 백업 목록 보기

```bash
# 백업 스크립트 실행 시 자동으로 목록 표시
node scripts/db-backup.js

# 또는 직접 확인
ls -lth backups/forum.db.backup.*
```

### 백업 무결성 확인

```bash
# 백업 파일 무결성 검사
sqlite3 backups/forum.db.backup.YYYY-MM-DDTHH-MM-SS "PRAGMA integrity_check;"
```

## 백업 전략

### 권장 설정

1. **일일 백업**: 매일 새벽 2시 (7일 보관)
2. **주간 백업**: 매주 일요일 (30일 보관)
3. **월간 백업**: 매월 1일 (90일 보관) - 수동 또는 별도 스크립트

### 디스크 공간 관리

```bash
# 백업 디렉토리 크기 확인
du -sh backups/

# 백업 파일 개수 확인
ls -1 backups/forum.db.backup.* | wc -l
```

백업 디렉토리가 너무 커지면 `--keep-days` 옵션을 줄이거나 오래된 백업을 수동으로 삭제하세요.

## 원격 백업 (선택사항)

중요한 데이터는 원격 저장소에도 백업하는 것을 권장합니다.

### S3 백업 예시

```bash
# AWS CLI 설치 필요
aws s3 cp backups/forum.db.backup.YYYY-MM-DDTHH-MM-SS s3://your-bucket/backups/
```

### rsync 백업 예시

```bash
# 다른 서버로 백업
rsync -avz backups/ user@backup-server:/path/to/backups/
```

## 백업 모니터링

### 백업 로그 확인

```bash
# 최근 백업 로그 확인
tail -n 50 logs/backup.log

# 백업 실패 확인
grep -i error logs/backup.log
```

### 백업 실패 알림 설정

백업 실패 시 알림을 받으려면 스크립트를 수정하거나 별도의 모니터링 도구를 사용하세요.

## 문제 해결

### 백업 실패 시

1. **디스크 공간 확인**

   ```bash
   df -h
   ```

2. **백업 디렉토리 권한 확인**

   ```bash
   ls -ld backups/
   ```

3. **데이터베이스 잠금 확인**
   ```bash
   # 서버가 실행 중인지 확인
   pm2 status
   ```

### 백업 파일이 너무 큰 경우

```bash
# 백업 파일 압축 (선택사항)
gzip backups/forum.db.backup.YYYY-MM-DDTHH-MM-SS
```

복원 시:

```bash
gunzip backups/forum.db.backup.YYYY-MM-DDTHH-MM-SS.gz
cp backups/forum.db.backup.YYYY-MM-DDTHH-MM-SS forum.db
```

## 요약

- ✅ **자동 백업 스크립트**: `scripts/db-backup.js`
- ✅ **정기 백업**: Crontab으로 자동화
- ✅ **백업 보관**: 기본 7일 (옵션으로 변경 가능)
- ✅ **백업 복원**: 간단한 `cp` 명령어로 복원 가능
