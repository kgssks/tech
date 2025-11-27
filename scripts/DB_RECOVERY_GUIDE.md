# 데이터베이스 복구 가이드

## ⚠️ 중요: WAL 파일 삭제 주의사항

**WAL 모드에서 `forum.db-wal`과 `forum.db-shm` 파일을 직접 삭제하면 데이터베이스가 손상될 수 있습니다!**

### WAL 파일이란?

- **forum.db-wal**: Write-Ahead Log - 아직 메인 DB에 반영되지 않은 변경사항
- **forum.db-shm**: Shared Memory - 동시성 제어를 위한 공유 메모리

### 올바른 WAL 파일 정리 방법

**❌ 절대 하지 말아야 할 것:**

```bash
# 절대 이렇게 하지 마세요!
rm forum.db-wal forum.db-shm  # 데이터 손실 위험!
```

**✅ 올바른 방법:**

```bash
# 안전한 WAL 파일 정리 스크립트 사용
node scripts/db-safe-wal-cleanup.js
```

이 스크립트는:

1. 먼저 WAL 체크포인트를 수행하여 모든 변경사항을 메인 DB에 반영
2. 그 후에만 WAL 파일을 안전하게 삭제

### WAL 파일 삭제로 인한 손상 증상

- `SQLITE_CORRUPT: database disk image is malformed` 오류
- 참가자 목록이 사라짐
- 쿼리 실행 실패

## 긴급 상황: SQLITE_CORRUPT 오류

데이터베이스가 손상된 경우 다음 단계를 따라 복구하세요.

## 1단계: 현재 상태 확인

```bash
cd /home/ec2-user/tech
node scripts/db-quick-check.js
```

이 명령어는 다음을 확인합니다:

- 데이터베이스 파일 존재 여부
- 파일 크기 및 수정 시간
- 무결성 검사
- 기본 쿼리 테스트

## 2단계: 복구 시도

### 방법 A: 자동 복구 스크립트 (권장)

```bash
cd /home/ec2-user/tech

# 1. 무결성 검사만 수행 (복구하지 않음)
node scripts/db-recover.js --check-only

# 2. 백업 생성 후 복구 시도
node scripts/db-recover.js --backup

# 3. 확인 없이 자동 복구 (주의: 원본 파일 교체)
node scripts/db-recover.js --backup --force
```

### 방법 B: 수동 복구

```bash
cd /home/ec2-user/tech

# 1. 백업 생성
cp forum.db forum.db.backup.$(date +%Y%m%d_%H%M%S)
cp forum.db-wal forum.db-wal.backup.$(date +%Y%m%d_%H%M%S) 2>/dev/null || true
cp forum.db-shm forum.db-shm.backup.$(date +%Y%m%d_%H%M%S) 2>/dev/null || true

# 2. WAL 파일 체크포인트 시도
sqlite3 forum.db "PRAGMA wal_checkpoint(FULL);"

# 3. 덤프 생성
sqlite3 forum.db ".dump" > forum.dump

# 4. 새 데이터베이스로 복구
sqlite3 forum.db.recovered < forum.dump

# 5. 무결성 검사
sqlite3 forum.db.recovered "PRAGMA integrity_check;"

# 6. 정상이면 교체
mv forum.db forum.db.old
mv forum.db.recovered forum.db
rm -f forum.db-wal forum.db-shm

# 7. 서버 재시작
pm2 restart tech-forum
```

## 3단계: 백업에서 복원 (복구 실패 시)

```bash
cd /home/ec2-user/tech

# 최근 백업 파일 확인
ls -lth forum.db.backup*

# 백업에서 복원
cp forum.db.backup.YYYYMMDD_HHMMSS forum.db
rm -f forum.db-wal forum.db-shm

# 서버 재시작
pm2 restart tech-forum
```

## 4단계: 데이터 손실 최소화

복구 후 다음을 확인하세요:

```bash
# 사용자 수 확인
sqlite3 forum.db "SELECT COUNT(*) FROM users WHERE deleted = 0 OR deleted IS NULL;"

# 추첨번호 발급 수 확인
sqlite3 forum.db "SELECT COUNT(*) FROM lottery_numbers;"

# 부스 참여 수 확인
sqlite3 forum.db "SELECT COUNT(*) FROM booth_participations WHERE deleted = 0 OR deleted IS NULL;"
```

## 예방 조치

### 1. 정기 백업 설정

`crontab -e`에 다음 추가:

```bash
# 매일 새벽 2시에 백업
0 2 * * * cd /home/ec2-user/tech && cp forum.db forum.db.backup.$(date +\%Y\%m\%d) && find . -name "forum.db.backup.*" -mtime +7 -delete
```

### 2. 디스크 공간 모니터링

```bash
df -h
```

SQLite는 디스크 공간이 부족하면 손상될 수 있습니다.

### 3. WAL 파일 크기 모니터링

```bash
ls -lh forum.db-wal
```

WAL 파일이 너무 크면 (수백 MB 이상) 체크포인트를 실행하세요:

```bash
sqlite3 forum.db "PRAGMA wal_checkpoint(FULL);"
```

## 문제 해결

### "database disk image is malformed" 오류

1. **즉시 서버 중지** (데이터 손실 방지)

   ```bash
   pm2 stop tech-forum
   ```

2. **백업 확인**

   ```bash
   ls -lth forum.db.backup*
   ```

3. **복구 시도** (위의 2단계 참조)

4. **복구 실패 시**: 전문 복구 도구 사용 고려
   - `sqlite3_recover` (SQLite 공식 도구)
   - 또는 백업에서 복원

### WAL 파일 관련 오류

WAL 모드에서 문제가 발생하면:

```bash
# WAL 모드 비활성화 (주의: 동시성 성능 저하)
sqlite3 forum.db "PRAGMA journal_mode = DELETE;"
```

### 데이터베이스 잠금 오류

```bash
# 잠금 파일 확인
ls -la forum.db*

# 서버 재시작
pm2 restart tech-forum
```

## 복구 후 확인 사항

1. ✅ 서버 정상 시작 확인
2. ✅ 관리자 페이지 접속 확인
3. ✅ 참가자 목록 조회 확인
4. ✅ API 엔드포인트 동작 확인

## 연락처

복구가 불가능한 경우 즉시 개발팀에 연락하세요.
