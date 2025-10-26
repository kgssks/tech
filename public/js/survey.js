// 설문조사 JavaScript

document.addEventListener('DOMContentLoaded', function() {
    initializeSurvey();
});

function initializeSurvey() {
    // URL 파라미터에서 세션 정보 가져오기
    const sessionInfo = getSessionFromURL();
    if (!sessionInfo) {
        showError('올바르지 않은 접근입니다. QR 코드를 통해 접속해주세요.');
        return;
    }
    
    // 세션 정보 설정
    setSessionInfo(sessionInfo);
    
    setupRatingOptions();
    setupFormValidation();
}

// URL 파라미터에서 세션 정보 가져오기
function getSessionFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    
    if (!sessionId) {
        return null;
    }
    
    // 세션 ID에 따른 세션 정보 매핑
    const sessionMap = {
        'keynote': {
            id: 'keynote',
            name: '키노트: AI의 미래와 전망'
        },
        'session1': {
            id: 'session1',
            name: '세션 1: 머신러닝 실무'
        },
        'session2': {
            id: 'session2',
            name: '세션 2: 딥러닝 최신 동향'
        },
        'session3': {
            id: 'session3',
            name: '세션 3: AI 윤리와 사회적 영향'
        },
        'panel': {
            id: 'panel',
            name: '패널 토론: AI의 미래'
        }
    };
    
    // 숫자 ID를 문자열 키로 매핑 (하위 호환성)
    const numericIdMap = {
        '1': 'keynote',
        '2': 'session1',
        '3': 'session2', 
        '4': 'session3',
        '5': 'panel'
    };
    
    // 숫자 ID인 경우 문자열 키로 변환
    const mappedSessionId = numericIdMap[sessionId] || sessionId;
    
    return sessionMap[mappedSessionId] || null;
}

// 세션 정보 설정
function setSessionInfo(sessionInfo) {
    document.getElementById('sessionId').value = sessionInfo.id;
    document.getElementById('sessionName').value = sessionInfo.name;
    document.getElementById('sessionDisplay').textContent = sessionInfo.name;
    
    // 세션 정보 표시 업데이트
    const sessionInfoElement = document.getElementById('sessionInfo');
    sessionInfoElement.className = 'alert alert-success';
    sessionInfoElement.innerHTML = `
        <i class="fas fa-check-circle me-2"></i>
        <strong>설문 대상 세션:</strong> ${sessionInfo.name}
    `;
}

// 에러 메시지 표시
function showError(message) {
    const sessionInfoElement = document.getElementById('sessionInfo');
    sessionInfoElement.className = 'alert alert-danger';
    sessionInfoElement.innerHTML = `
        <i class="fas fa-exclamation-triangle me-2"></i>
        ${message}
    `;
    
    // 폼 비활성화
    const form = document.getElementById('surveyForm');
    const inputs = form.querySelectorAll('input, textarea, button');
    inputs.forEach(input => {
        input.disabled = true;
    });
}

function setupRatingOptions() {
    // 만족도 평가 옵션
    const satisfactionOptions = document.querySelectorAll('input[name="satisfaction"]');
    satisfactionOptions.forEach(option => {
        option.addEventListener('change', function() {
            updateRatingSelection('satisfaction', this.value);
        });
    });

    // 강사 평가 옵션
    const instructorOptions = document.querySelectorAll('input[name="instructor"]');
    instructorOptions.forEach(option => {
        option.addEventListener('change', function() {
            updateRatingSelection('instructor', this.value);
        });
    });
}

function updateRatingSelection(type, value) {
    // 기존 선택 제거
    const options = document.querySelectorAll(`input[name="${type}"]`);
    options.forEach(option => {
        option.closest('.rating-option').classList.remove('selected');
    });

    // 새 선택 적용
    const selectedOption = document.querySelector(`input[name="${type}"][value="${value}"]`);
    if (selectedOption) {
        selectedOption.closest('.rating-option').classList.add('selected');
    }
}

function setupFormValidation() {
    const form = document.getElementById('surveyForm');
    if (form) {
        form.addEventListener('submit', handleSurveySubmit);
    }
}

async function handleSurveySubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const sessionId = document.getElementById('sessionId').value;
    const sessionName = document.getElementById('sessionName').value;
    const satisfactionScore = parseInt(formData.get('satisfaction'));
    const instructorScore = parseInt(formData.get('instructor'));
    const improvements = formData.get('improvements') || '';
    
    // 유효성 검사
    if (!sessionId) {
        AIForum.showAlert('세션 정보가 올바르지 않습니다.', 'warning');
        return;
    }
    
    if (!satisfactionScore) {
        AIForum.showAlert('강의 만족도를 평가해주세요.', 'warning');
        return;
    }
    
    if (!instructorScore) {
        AIForum.showAlert('강사 평가를 해주세요.', 'warning');
        return;
    }
    
    try {
        showLoading(true);
        
        const response = await fetch('/api/survey/submit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                session_id: sessionId,
                session_name: sessionName,
                satisfaction_score: satisfactionScore,
                instructor_score: instructorScore,
                improvement_suggestions: improvements
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            AIForum.showAlert('설문조사가 성공적으로 제출되었습니다. 감사합니다!', 'success');
            
            // 폼 초기화
            document.getElementById('surveyForm').reset();
            clearRatingSelections();
            
            // 3초 후 메인 페이지로 이동
            setTimeout(() => {
                window.location.href = '/';
            }, 3000);
        } else {
            AIForum.showAlert(data.error || '설문 제출에 실패했습니다.', 'danger');
        }
    } catch (error) {
        AIForum.showAlert('네트워크 오류가 발생했습니다. 다시 시도해주세요.', 'danger');
    } finally {
        showLoading(false);
    }
}

function clearRatingSelections() {
    // 모든 평가 선택 제거
    const ratingOptions = document.querySelectorAll('.rating-option');
    ratingOptions.forEach(option => {
        option.classList.remove('selected');
    });
}

function showLoading(show) {
    const submitBtn = document.querySelector('button[type="submit"]');
    if (submitBtn) {
        if (show) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner"></span> 제출 중...';
        } else {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-paper-plane me-2"></i>설문 제출';
        }
    }
}


// 페이지 로드 시 URL 파라미터 처리
getSessionFromURL();


