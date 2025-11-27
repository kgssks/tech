# 데이터베이스 파일 Git 관리 가이드

## WAL/SHM 파일이 생긴 이유

### 언제 생성되나요?

`forum.db-wal`과 `forum.db-shm` 파일은 **서버가 실행되면서 자동으로 생성**됩니다.

**생성 시점:**

1. `backend/database.js`에서 `PRAGMA journal_mode = WAL` 실행
2. SQLite가 WAL 모드로 전환
3. 자동으로 `forum.db-wal`과 `forum.db-shm` 파일 생성

**코드 위치:**

```javascript
// backend/database.js (29번째 줄)
db.run("PRAGMA journal_mode = WAL", (err, result) => {
  // 이 코드가 실행되면 WAL 파일이 자동 생성됨
});
```

### 왜 갑자기 생겨났나요?

- **이전**: DELETE 모드 (기본값) → WAL 파일 없음
- **현재**: WAL 모드 (성능 향상) → WAL 파일 자동 생성

WAL 모드는 동시 읽기/쓰기 성능을 향상시키기 위해 추가되었습니다.

## Git 관리 방법

### ✅ 올바른 방법

**이미 `.gitignore`에 추가되어 있습니다:**

```
forum.db
forum.db-shm
forum.db-wal
*.db
*.db-shm
*.db-wal
```

따라서 **이 파일들은 Git에 커밋되지 않습니다.**

### 만약 이미 Git에 추적되고 있다면?

#### 1. Git에서 제거 (파일은 유지)

```bash
# Git 추적에서만 제거 (로컬 파일은 유지)
git rm --cached forum.db
git rm --cached forum.db-wal
git rm --cached forum.db-shm

# 커밋
git commit -m "Remove database files from git tracking"
```

#### 2. 원격 저장소에 푸시

```bash
git push origin master
```

### 로컬과 원격지에서의 동작

#### 로컬 개발 환경

- 서버 실행 시 → WAL/SHM 파일 자동 생성
- `.gitignore`로 인해 Git에 추가되지 않음
- **커밋할 필요 없음**

#### 원격 서버 (EC2)

- 서버 실행 시 → WAL/SHM 파일 자동 생성
- Git pull 후에도 자동 생성됨 (서버 실행 시)
- **커밋할 필요 없음**

### 정리

| 파일           | Git 추적  | 설명                      |
| -------------- | --------- | ------------------------- |
| `forum.db`     | ❌ 무시됨 | 메인 데이터베이스 파일    |
| `forum.db-wal` | ❌ 무시됨 | WAL 로그 (런타임 생성)    |
| `forum.db-shm` | ❌ 무시됨 | 공유 메모리 (런타임 생성) |

**결론: 이 파일들은 Git에 커밋하지 않아도 됩니다!**

## 주의사항

### ❌ 절대 하지 말아야 할 것

```bash
# 절대 이렇게 하지 마세요!
git add forum.db-wal
git commit -m "Add WAL file"  # ❌ 잘못된 방법
```

### ✅ 올바른 방법

1. **`.gitignore` 확인** (이미 설정됨)
2. **Git에 추가하지 않기** (자동으로 무시됨)
3. **서버 실행 시 자동 생성** (정상 동작)

## WAL 파일 정리 (필요한 경우)

WAL 파일을 정리해야 할 때는 안전한 스크립트 사용:

```bash
# 안전한 WAL 파일 정리
node scripts/db-safe-wal-cleanup.js
```

이 스크립트는:

1. 먼저 체크포인트 수행 (변경사항을 메인 DB에 반영)
2. 그 후에만 WAL 파일 삭제

## 요약

- ✅ **WAL/SHM 파일은 서버 실행 시 자동 생성** (정상)
- ✅ **`.gitignore`에 이미 추가됨** (Git 추적 안 됨)
- ✅ **커밋할 필요 없음** (런타임 파일)
- ❌ **직접 삭제하지 말 것** (데이터 손실 위험)
- ✅ **정리가 필요하면 `db-safe-wal-cleanup.js` 사용**
