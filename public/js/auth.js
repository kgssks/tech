// 인증 관련 JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // 토큰 확인
    if (AIForum.StorageManager.isTokenValid()) {
        window.location.href = '/app/event/data';
        return;
    }
    
    setupAuthForm();
});

function setupAuthForm() {
    const loginForm = document.getElementById('loginForm');
    
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // 입력 필드 포맷팅
    const phoneInput = document.getElementById('phoneLast4');
    if (phoneInput) {
        phoneInput.addEventListener('input', function(e) {
            // 숫자만 입력 허용
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
        });
    }
}

async function handleLogin(e) {
    e.preventDefault();
    
    const employeeId = document.getElementById('employeeId').value.trim();
    const phoneLast4 = document.getElementById('phoneLast4').value.trim();
    
    // 유효성 검사
    if (!employeeId) {
        AIForum.showAlert('직원번호를 입력해주세요.', 'warning');
        document.getElementById('employeeId').focus();
        return;
    }
    
    if (!phoneLast4 || phoneLast4.length !== 4) {
        AIForum.showAlert('휴대번호 뒷4자리를 정확히 입력해주세요.', 'warning');
        document.getElementById('phoneLast4').focus();
        return;
    }
    
    try {
        showLoading(true);
        
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                employee_id: employeeId,
                phone_last4: phoneLast4
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // 토큰 저장
            AIForum.StorageManager.setToken(data.token);
            
            AIForum.showAlert('로그인에 성공했습니다!', 'success');
            
            // 잠시 후 이벤트 페이지로 이동
            setTimeout(() => {
                window.location.href = '/app/event/data';
            }, 1500);
        } else {
            AIForum.showAlert(data.error || '로그인에 실패했습니다.', 'danger');
        }
    } catch (error) {
        AIForum.showAlert('네트워크 오류가 발생했습니다. 다시 시도해주세요.', 'danger');
    } finally {
        showLoading(false);
    }
}

function showLoading(show) {
    const submitBtn = document.querySelector('button[type="submit"]');
    if (submitBtn) {
        if (show) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner"></span> 로그인 중...';
        } else {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-sign-in-alt me-2"></i>로그인';
        }
    }
}


