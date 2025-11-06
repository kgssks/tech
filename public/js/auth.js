
// 로컬스토리지에서 토큰 가져오기
function getToken() {
    return localStorage.getItem('forumUser');
}

// 로컬스토리지에 토큰 저장
function setToken(token) {
    localStorage.setItem('forumUser', token);
}

// 토큰 삭제
function removeToken() {
    localStorage.removeItem('forumUser');
}

// 관리자 토큰 가져오기
function getAdminToken() {
    return localStorage.getItem('adminToken');
}

// 관리자 토큰 삭제
function removeAdminToken() {
    localStorage.removeItem('adminToken');
}

// 인증 확인
async function checkAuth() {
    const token = getToken();
    if (!token) {
        return null;
    }

    try {
        const response = await fetch('/api/auth/verify', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'kb-auth': `Bearer ${token}`
            }
        });

        const data = await response.json();
        if (data.success) {
            return data.user;
        } else {
            removeToken();
            return null;
        }
    } catch (error) {
        console.error('인증 확인 오류:', error);
        return null;
    }
}

// 사용자 정보 표시
async function displayUserInfo() {
    const user = await checkAuth();
    const userInfoDiv = document.getElementById('userInfo');
    const userNameSpan = document.getElementById('userName');
    const userDeptSpan = document.getElementById('userDept');
    const adminNavItem = document.getElementById('adminNavItem');

    if (user && userInfoDiv) {
        if (userNameSpan) userNameSpan.textContent = `${user.empname} ${user.posname}`;
        if (userDeptSpan) userDeptSpan.textContent = user.deptname;
        userInfoDiv.style.display = 'flex';
        
        // 관리자 토큰이 있으면 관리자 링크 표시
        if (adminNavItem) {
            const adminToken = getAdminToken();
            if (adminToken) {
                adminNavItem.style.display = 'block';
            } else {
                adminNavItem.style.display = 'none';
            }
        }
    } else if (userInfoDiv) {
        userInfoDiv.style.display = 'none';
        if (adminNavItem) {
            adminNavItem.style.display = 'none';
        }
    }
    
    // 참가신청 섹션 업데이트 (main.js의 함수 사용)
    if (typeof updateRegistrationSection === 'function') {
        await updateRegistrationSection();
    }
    
    // 히어로 섹션 버튼 및 환영 메시지 업데이트 (main.js의 함수 사용)
    if (typeof updateRegistrationButtonTitle === 'function') {
        await updateRegistrationButtonTitle();
    }
}

// 로그인 이력 기록 (로컬스토리지)
function setLoginHistory() {
    try {
        localStorage.setItem('forumLoginHistory', 'true');
        localStorage.setItem('forumLoginHistoryDate', new Date().toISOString());
    } catch (error) {
        console.error('로그인 이력 저장 오류:', error);
    }
}

// 로그인 이력 확인
function hasLoginHistory() {
    try {
        return localStorage.getItem('forumLoginHistory') === 'true';
    } catch (error) {
        return false;
    }
}

// 로그인
async function login(empno, phoneLast) {
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                empno,
                lastNumber: phoneLast
            })
        });

        const data = await response.json();

        if (data.success) {
            setToken(data.token);
            // 관리자 토큰이 있으면 저장
            if (data.adminToken) {
                localStorage.setItem('adminToken', data.adminToken);
            }
            // 로그인 이력 기록
            setLoginHistory();
            return { 
                success: true, 
                user: data.user,
                isAdmin: data.isAdmin || false
            };
        } else {
            return { success: false, message: data.message || '로그인에 실패했습니다.' };
        }
    } catch (error) {
        console.error('로그인 오류:', error);
        return { success: false, message: '네트워크 오류가 발생했습니다. 다시 시도해주세요.' };
    }
}

// 전역 스코프에 노출 (다른 스크립트에서 사용 가능하도록)
window.login = login;
window.checkAuth = checkAuth;
window.displayUserInfo = displayUserInfo;
window.hasLoginHistory = hasLoginHistory;
window.getAdminToken = getAdminToken;
window.removeAdminToken = removeAdminToken;

// 로그아웃
function logout() {
    removeToken();
    removeAdminToken();
    window.location.href = '/';
}

// 경로 보호 (인증 필요)
async function protectRoute() {
    const path = window.location.pathname;
    if (path.startsWith('/app/event/') && !path.includes('/auth')) {
        const token = getToken();
        if (!token) {
            window.location.href = '/app/event/auth.html';
            return false;
        }
        
        // 토큰 유효성 검증
        const user = await checkAuth();
        if (!user) {
            removeToken();
            alert('인증이 만료되었습니다. 다시 로그인해주세요.');
            window.location.href = '/app/event/auth.html';
            return false;
        }
    }
    return true;
}

// 페이지 로드 시 인증 확인
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
        await displayUserInfo();
        await protectRoute();
    });
} else {
    (async () => {
        await displayUserInfo();
        await protectRoute();
    })();
}

