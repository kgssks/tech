// 이벤트 데이터 페이지 JavaScript

let eventStatus = null;
let qrModal = null;

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM Content Loaded - Starting data.js initialization');
    
    // AIForum 객체가 로드될 때까지 기다림
    const waitForAIForum = () => {
        return new Promise((resolve) => {
            const checkAIForum = () => {
                if (typeof AIForum !== 'undefined' && AIForum.StorageManager && AIForum.ApiClient) {
                    console.log('AIForum is ready');
                    resolve();
                } else {
                    console.log('Waiting for AIForum...');
                    setTimeout(checkAIForum, 100);
                }
            };
            checkAIForum();
        });
    };
    
    waitForAIForum().then(() => {
        // 토큰 확인
        if (!AIForum.StorageManager.isTokenValid()) {
            console.log('Token invalid, redirecting to auth page');
            window.location.href = '/app/event/auth';
            return;
        }
        
        console.log('Token is valid, proceeding with page initialization');
        
        // URL 파라미터 확인 (부스 QR 코드로 접근한 경우)
        const urlParams = new URLSearchParams(window.location.search);
        const boothNumber = urlParams.get('booth');
        
        if (boothNumber) {
            console.log('Booth parameter found:', boothNumber);
            // 부스 참여 자동 처리
            handleBoothParticipationFromQR(parseInt(boothNumber));
            return;
        }
        
        console.log('No booth parameter, initializing normal page');
        initializePage();
        loadEventStatus();
    });
});

// QR 코드로 부스 참여 처리
async function handleBoothParticipationFromQR(boothNumber) {
    try {
        // 로딩 표시 (안전한 호출)
        if (typeof AIForum.showLoading === 'function') {
            AIForum.showLoading(true);
        }
        
        const response = await AIForum.ApiClient.post('/api/event/booth', {
            booth_number: boothNumber
        });
        
        if (response.ok) {
            const data = await response.json();
            AIForum.showAlert(data.message, 'success');
            
            // 경품 자격 확인
            if (data.lottery_number) {
                AIForum.showAlert(`경품 추첨 번호: ${data.lottery_number}`, 'info');
            }
            
            // 3초 후 이벤트 데이터 페이지로 이동
            setTimeout(() => {
                window.location.href = '/app/event/data';
            }, 3000);
        } else {
            const data = await response.json();
            AIForum.showAlert(data.error || '부스 참여 확인에 실패했습니다.', 'danger');
            
            // 에러 시에도 이벤트 데이터 페이지로 이동
            setTimeout(() => {
                window.location.href = '/app/event/data';
            }, 3000);
        }
    } catch (error) {
        console.error('Booth participation error:', error); // 디버깅용
        AIForum.showAlert('부스 참여 처리 중 오류가 발생했습니다.', 'danger');
        
        // 에러 시에도 이벤트 데이터 페이지로 이동
        setTimeout(() => {
            window.location.href = '/app/event/data';
        }, 3000);
    } finally {
        // 로딩 숨김 (안전한 호출)
        if (typeof AIForum.showLoading === 'function') {
            AIForum.showLoading(false);
        }
    }
}

function initializePage() {
    console.log('Initializing page...');
    
    // 모달 초기화
    qrModal = new bootstrap.Modal(document.getElementById('qrModal'));
    console.log('QR modal initialized:', qrModal);
    
    // 부스 그리드 초기화
    initializeBoothGrid();
    console.log('Booth grid initialized');
    
    // 설문 그리드 초기화
    initializeSurveyGrid();
    console.log('Survey grid initialized');
    
    console.log('Page initialization completed');
}

function initializeSurveyGrid() {
    const surveyGrid = document.getElementById('surveyGrid');
    const sessions = [
        { id: 'keynote', name: '키노트 세션', icon: 'fas fa-microphone' },
        { id: 'session1', name: '세션 1: AI 기초', icon: 'fas fa-lightbulb' },
        { id: 'session2', name: '세션 2: 딥러닝 최신 동향', icon: 'fas fa-brain' },
        { id: 'session3', name: '세션 3: 자연어 처리', icon: 'fas fa-comments' },
        { id: 'session4', name: '세션 4: 컴퓨터 비전', icon: 'fas fa-eye' },
        { id: 'session5', name: '세션 5: 강화학습', icon: 'fas fa-gamepad' },
        { id: 'panel', name: '패널 토론', icon: 'fas fa-users' }
    ];
    
    surveyGrid.innerHTML = '';
    
    sessions.forEach(session => {
        const surveyItem = document.createElement('div');
        surveyItem.className = 'survey-item pending';
        surveyItem.id = `survey-${session.id}`;
        surveyItem.innerHTML = `
            <div class="survey-icon">
                <i class="${session.icon}"></i>
            </div>
            <div class="survey-title">${session.name}</div>
            <div class="survey-status">미참여</div>
        `;
        surveyItem.onclick = () => showSurveyQR(session.id);
        surveyGrid.appendChild(surveyItem);
    });
}

function initializeBoothGrid() {
    const boothGrid = document.getElementById('boothGrid');
    const booths = [
        { id: 1, name: 'AI 체험', icon: 'fas fa-brain' },
        { id: 2, name: '로봇 체험', icon: 'fas fa-robot' },
        { id: 3, name: '컴퓨터 비전', icon: 'fas fa-eye' },
        { id: 4, name: 'NLP 체험', icon: 'fas fa-comments' },
        { id: 5, name: '데이터 분석', icon: 'fas fa-chart-line' }
    ];
    
    boothGrid.innerHTML = '';
    
    booths.forEach(booth => {
        const boothItem = document.createElement('div');
        boothItem.className = 'booth-item booth-pending';
        boothItem.id = `booth-${booth.id}`;
        boothItem.innerHTML = `
            <i class="${booth.icon} fa-2x mb-2"></i>
            <div class="fw-bold">${booth.name}</div>
            <small>부스 ${booth.id}</small>
        `;
        boothItem.onclick = () => showBoothQR(booth.id);
        boothGrid.appendChild(boothItem);
    });
}

async function loadEventStatus() {
    try {
        console.log('Loading event status...');
        const response = await AIForum.ApiClient.get('/api/event/status');
        
        console.log('Event status response:', response);
        
        if (response.ok) {
            eventStatus = await response.json();
            console.log('Event status data:', eventStatus);
            updateUI();
        } else {
            console.error('Event status request failed:', response.status, response.statusText);
            AIForum.showAlert('이벤트 상태를 불러오는데 실패했습니다.', 'danger');
        }
    } catch (error) {
        console.error('Event status loading error:', error);
        AIForum.showAlert('네트워크 오류가 발생했습니다.', 'danger');
    }
}

function updateUI() {
    console.log('Updating UI with event status:', eventStatus);
    
    if (!eventStatus) {
        console.warn('No event status data available');
        return;
    }
    
    // 부스 상태 업데이트
    updateBoothStatus();
    
    // 설문조사 상태 업데이트
    updateSurveyStatus();
    
    // 경품 자격 확인
    updatePrizeEligibility();
    
    // 진행 상황 업데이트
    updateProgress();
    
    console.log('UI update completed');
}


function updateBoothStatus() {
    for (let i = 1; i <= 5; i++) {
        const boothItem = document.getElementById(`booth-${i}`);
        const isCompleted = eventStatus[`booth_${i}`];
        
        if (isCompleted) {
            boothItem.className = 'booth-item booth-completed';
            boothItem.innerHTML = boothItem.innerHTML.replace('booth-pending', 'booth-completed');
        }
    }
}

function updateSurveyStatus() {
    // 세션별 설문 상태 업데이트
    if (eventStatus.session_surveys) {
        eventStatus.session_surveys.forEach(session => {
            const surveyItem = document.getElementById(`survey-${session.session_id}`);
            if (surveyItem) {
                surveyItem.className = 'survey-item completed';
                surveyItem.querySelector('.survey-status').textContent = '참여완료';
            }
        });
    }
}

function updatePrizeEligibility() {
    if (eventStatus.prize_eligible && eventStatus.lottery_number) {
        const lotterySection = document.getElementById('lotterySection');
        const lotteryNumber = document.getElementById('lotteryNumber');
        const prizeSection = document.getElementById('prizeSection');
        
        lotteryNumber.textContent = eventStatus.lottery_number;
        lotterySection.style.display = 'block';
        prizeSection.style.display = 'block';
    }
}

function updateProgress() {
    let completedCount = 0;
    let totalCount = 12; // 부스 5개 + 세션 설문 7개
    
    // 부스 참여 수 계산
    for (let i = 1; i <= 5; i++) {
        if (eventStatus[`booth_${i}`]) completedCount++;
    }
    
    // 세션 설문 참여 수 계산
    if (eventStatus.session_survey_participation) {
        completedCount += eventStatus.session_survey_participation;
    }
    
    const progress = Math.min((completedCount / totalCount) * 100, 100);
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const completedCountEl = document.getElementById('completedCount');
    const remainingCountEl = document.getElementById('remainingCount');
    
    progressBar.style.width = `${progress}%`;
    progressText.textContent = `${Math.round(progress)}%`;
    completedCountEl.textContent = completedCount;
    remainingCountEl.textContent = totalCount - completedCount;
}

async function showBoothQR(boothNumber) {
    try {
        const response = await fetch(`/api/qr/booth/${boothNumber}`);
        const data = await response.json();
        
        if (response.ok) {
            showQRModal(`부스 ${boothNumber}`, data.qr_code, `부스 ${boothNumber} QR 코드를 스캔하여 참여하세요`);
        } else {
            AIForum.showAlert('QR 코드 생성에 실패했습니다.', 'danger');
        }
    } catch (error) {
        AIForum.showAlert('네트워크 오류가 발생했습니다.', 'danger');
    }
}

async function showSurveyQR(sessionId = 'keynote') {
    try {
        const response = await fetch(`/api/qr/survey/${sessionId}`);
        const data = await response.json();
        
        if (response.ok) {
            showQRModal('설문조사', data.qr_code, 'QR 코드를 스캔하여 설문조사에 참여하세요');
        } else {
            AIForum.showAlert('QR 코드 생성에 실패했습니다.', 'danger');
        }
    } catch (error) {
        AIForum.showAlert('네트워크 오류가 발생했습니다.', 'danger');
    }
}

function showQRModal(title, qrCodeData, description) {
    document.getElementById('qrModalTitle').textContent = title;
    document.getElementById('qrCodeContainer').innerHTML = `<img src="${qrCodeData}" class="img-fluid" alt="QR Code">`;
    document.getElementById('qrDescription').textContent = description;
    qrModal.show();
}

// URL 파라미터 처리
function handleURLParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const booth = urlParams.get('booth');
    const session = urlParams.get('session');
    
    if (code === 'ENTRY2024') {
        confirmEntry();
    } else if (booth) {
        confirmBooth(parseInt(booth));
    } else if (session) {
        confirmSurvey();
    }
}

async function confirmEntry() {
    try {
        const response = await AIForum.ApiClient.post('/api/event/entry', {
            entry_code: 'ENTRY2024'
        });
        
        if (response.ok) {
            AIForum.showAlert('입장이 확인되었습니다!', 'success');
            loadEventStatus(); // 상태 새로고침
        } else {
            const data = await response.json();
            AIForum.showAlert(data.error || '입장 확인에 실패했습니다.', 'danger');
        }
    } catch (error) {
        AIForum.showAlert('네트워크 오류가 발생했습니다.', 'danger');
    }
}

async function confirmBooth(boothNumber) {
    try {
        const response = await AIForum.ApiClient.post('/api/event/booth', {
            booth_number: boothNumber
        });
        
        if (response.ok) {
            const data = await response.json();
            AIForum.showAlert(data.message, 'success');
            
            if (data.lottery_number) {
                AIForum.showAlert(`경품 추첨 번호: ${data.lottery_number}`, 'info');
            }
            
            loadEventStatus(); // 상태 새로고침
        } else {
            const data = await response.json();
            AIForum.showAlert(data.error || '부스 참여 확인에 실패했습니다.', 'danger');
        }
    } catch (error) {
        AIForum.showAlert('네트워크 오류가 발생했습니다.', 'danger');
    }
}

async function confirmSurvey() {
    try {
        const response = await AIForum.ApiClient.post('/api/event/survey', {});
        
        if (response.ok) {
            const data = await response.json();
            AIForum.showAlert(data.message, 'success');
            
            if (data.lottery_number) {
                AIForum.showAlert(`경품 추첨 번호: ${data.lottery_number}`, 'info');
            }
            
            loadEventStatus(); // 상태 새로고침
        } else {
            const data = await response.json();
            AIForum.showAlert(data.error || '설문조사 참여 확인에 실패했습니다.', 'danger');
        }
    } catch (error) {
        AIForum.showAlert('네트워크 오류가 발생했습니다.', 'danger');
    }
}

function logout() {
    if (confirm('로그아웃하시겠습니까?')) {
        AIForum.StorageManager.clearToken();
        window.location.href = '/app/event/auth';
    }
}

// 페이지 로드 시 URL 파라미터 처리
handleURLParameters();


