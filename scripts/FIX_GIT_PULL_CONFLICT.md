# Git Pull 충돌 해결 가이드 (forum.db-shm)

## 문제 상황

원격 서버에서 `git pull` 시 다음 오류 발생:

```
error: Your local changes to the following files would be overwritten by merge:
	forum.db-shm
Please commit your changes or stash them before you merge.
```

## 원인

`forum.db-shm`은 런타임 파일이지만 Git에 추적되고 있거나, 로컬에서 변경되어 충돌이 발생했습니다.

## 해결 방법

### 방법 1: 로컬 변경사항 무시하고 원격 버전 사용 (권장)

원격 서버에서 실행:

```bash
cd /home/ec2-user/tech

# 1. 로컬 변경사항 버리기 (forum.db-shm은 런타임 파일이므로 안전)
git checkout -- forum.db-shm

# 2. Git pull
git pull origin master

# 3. forum.db-shm을 Git 추적에서 제거 (이미 .gitignore에 있지만 확인)
git rm --cached forum.db-shm 2>/dev/null || true

# 4. 변경사항 커밋 (필요한 경우)
git commit -m "Remove forum.db-shm from git tracking" || true

# 5. 원격에 푸시
git push origin master || true
```

### 방법 2: Stash 후 Pull

```bash
cd /home/ec2-user/tech

# 1. 변경사항 임시 저장
git stash

# 2. Pull
git pull origin master

# 3. Stash 복원 (필요한 경우, 하지만 forum.db-shm은 무시해도 됨)
git stash drop  # 또는 git stash pop (충돌 시 drop)
```

### 방법 3: 강제로 원격 버전 사용

```bash
cd /home/ec2-user/tech

# 1. 로컬 파일 삭제 (서버 재시작 시 자동 재생성됨)
rm -f forum.db-shm forum.db-wal

# 2. Git에서 제거
git rm --cached forum.db-shm 2>/dev/null || true

# 3. Pull
git pull origin master

# 4. 서버 재시작 (WAL/SHM 파일 자동 재생성)
pm2 restart tech-forum
```

## 근본 원인 해결

### 1. Git 추적에서 완전히 제거

로컬 저장소에서 (원격 서버가 아닌 개발 머신):

```bash
# forum.db-shm이 Git에 추적되고 있는지 확인
git ls-files | grep forum.db-shm

# 추적되고 있다면 제거
git rm --cached forum.db-shm
git commit -m "Remove forum.db-shm from git tracking"
git push origin master
```

### 2. .gitignore 확인

`.gitignore`에 다음이 포함되어 있는지 확인:

```
forum.db
forum.db-shm
forum.db-wal
*.db
*.db-shm
*.db-wal
```

### 3. 원격 서버에서 정리

원격 서버에서:

```bash
cd /home/ec2-user/tech

# Git 상태 확인
git status

# forum.db-shm이 추적되고 있다면 제거
git rm --cached forum.db-shm 2>/dev/null || true

# 변경사항 커밋
git commit -m "Remove runtime database files from git" || true

# 원격에 푸시
git push origin master || true
```

## 빠른 해결 (원격 서버)

원격 서버에서 다음 명령어를 순서대로 실행:

```bash
cd /home/ec2-user/tech

# 1. 로컬 변경사항 버리기
git checkout -- forum.db-shm

# 2. Pull
git pull origin master

# 3. Git 추적에서 제거 (이미 .gitignore에 있지만)
git rm --cached forum.db-shm 2>/dev/null || true

# 4. 커밋 (변경사항이 있는 경우)
if [ -n "$(git status --porcelain)" ]; then
  git commit -m "Remove forum.db-shm from git tracking"
  git push origin master
fi

# 5. 서버 재시작 (WAL/SHM 파일 자동 재생성)
pm2 restart tech-forum
```

## 예방 조치

### 1. .gitignore 확인

`.gitignore`에 다음이 포함되어 있는지 확인:

```
forum.db
forum.db-shm
forum.db-wal
*.db
*.db-shm
*.db-wal
backups/
*.db.backup.*
```

### 2. Git 추적 상태 확인

```bash
# 추적 중인 데이터베이스 파일 확인
git ls-files | grep -E "\.(db|wal|shm)$"

# 있다면 제거
git rm --cached <파일명>
git commit -m "Remove database files from git"
git push origin master
```

## 요약

1. **즉시 해결**: `git checkout -- forum.db-shm && git pull`
2. **근본 해결**: `git rm --cached forum.db-shm` 후 커밋/푸시
3. **예방**: `.gitignore` 확인 및 Git 추적 상태 점검

`forum.db-shm`은 런타임 파일이므로 Git에 추적되지 않아야 합니다.
