// 관리자 페이지 JavaScript

let adminToken = null;
let loginModal = null;
let participationChart = null;
let satisfactionChart = null;

// 관리자 토큰 관리
const AdminTokenManager = {
    setToken: (token) => {
        localStorage.setItem('adminToken', token);
    },
    getToken: () => {
        return localStorage.getItem('adminToken');
    },
    clearToken: () => {
        localStorage.removeItem('adminToken');
    },
    isTokenValid: () => {
        const token = localStorage.getItem('adminToken');
        if (!token) return false;
        
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload.exp > Date.now() / 1000;
        } catch {
            return false;
        }
    }
};

document.addEventListener('DOMContentLoaded', function() {
    // 관리자 토큰 확인
    adminToken = AdminTokenManager.getToken();
    
    if (!adminToken || !AdminTokenManager.isTokenValid()) {
        AdminTokenManager.clearToken();
        showLoginModal();
    } else {
        initializeAdminPage();
    }
});

function showLoginModal() {
    loginModal = new bootstrap.Modal(document.getElementById('loginModal'));
    loginModal.show();
}

async function handleAdminLogin() {
    const username = document.getElementById('adminUsername').value;
    const password = document.getElementById('adminPassword').value;
    
    if (!username || !password) {
        AIForum.showAlert('사용자명과 비밀번호를 입력해주세요.', 'warning');
        return;
    }
    
    try {
        const response = await fetch('/api/admin/auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: username,
                password: password
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            AdminTokenManager.setToken(data.token);
            adminToken = data.token;
            loginModal.hide();
            initializeAdminPage();
            AIForum.showAlert('로그인에 성공했습니다.', 'success');
        } else {
            AIForum.showAlert(data.error || '로그인에 실패했습니다.', 'danger');
        }
    } catch (error) {
        AIForum.showAlert('네트워크 오류가 발생했습니다.', 'danger');
    }
}

async function initializeAdminPage() {
    try {
        await loadOverviewData();
        await loadParticipantsData();
        await loadSurveysData();
        initializeCharts();
    } catch (error) {
        AIForum.showAlert('데이터를 불러오는데 실패했습니다.', 'danger');
    }
}

async function loadOverviewData() {
    try {
        const response = await fetch('/api/admin/overview', {
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            updateOverviewStats(data);
        } else {
            throw new Error('개요 데이터 로드 실패');
        }
    } catch (error) {
        console.error('개요 데이터 로드 오류:', error);
    }
}

function updateOverviewStats(data) {
    document.getElementById('totalUsers').textContent = data.total_users || 0;
    document.getElementById('entryConfirmed').textContent = data.entry_confirmed || 0;
    document.getElementById('prizeEligible').textContent = data.prize_eligible || 0;
    document.getElementById('totalSurveys').textContent = data.total_surveys || 0;
}

async function loadParticipantsData() {
    try {
        const response = await fetch('/api/admin/participants', {
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const participants = await response.json();
            updateParticipantsTable(participants);
        } else {
            throw new Error('참가자 데이터 로드 실패');
        }
    } catch (error) {
        console.error('참가자 데이터 로드 오류:', error);
    }
}

function updateParticipantsTable(participants) {
    const tbody = document.getElementById('participantsTable');
    tbody.innerHTML = '';
    
    participants.forEach(participant => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${participant.employee_id}</td>
            <td>${participant.entry_confirmed ? '<i class="fas fa-check text-success"></i>' : '<i class="fas fa-times text-danger"></i>'}</td>
            <td>${participant.booth_1 ? '<i class="fas fa-check text-success"></i>' : '<i class="fas fa-times text-danger"></i>'}</td>
            <td>${participant.booth_2 ? '<i class="fas fa-check text-success"></i>' : '<i class="fas fa-times text-danger"></i>'}</td>
            <td>${participant.booth_3 ? '<i class="fas fa-check text-success"></i>' : '<i class="fas fa-times text-danger"></i>'}</td>
            <td>${participant.booth_4 ? '<i class="fas fa-check text-success"></i>' : '<i class="fas fa-times text-danger"></i>'}</td>
            <td>${participant.booth_5 ? '<i class="fas fa-check text-success"></i>' : '<i class="fas fa-times text-danger"></i>'}</td>
            <td>${participant.survey_participated ? '<i class="fas fa-check text-success"></i>' : '<i class="fas fa-times text-danger"></i>'}</td>
            <td>${participant.prize_eligible ? '<i class="fas fa-check text-success"></i>' : '<i class="fas fa-times text-danger"></i>'}</td>
            <td>${participant.lottery_number || '-'}</td>
        `;
        tbody.appendChild(row);
    });
}

async function loadSurveysData() {
    try {
        const response = await fetch('/api/admin/surveys', {
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const surveys = await response.json();
            updateSurveysTable(surveys);
            updateSatisfactionChart(surveys);
        } else {
            throw new Error('설문 데이터 로드 실패');
        }
    } catch (error) {
        console.error('설문 데이터 로드 오류:', error);
    }
}

function updateSurveysTable(surveys) {
    const tbody = document.getElementById('surveysTable');
    tbody.innerHTML = '';
    
    surveys.forEach(survey => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${survey.session_name}</td>
            <td>${survey.avg_satisfaction ? survey.avg_satisfaction.toFixed(1) : '-'}</td>
            <td>${survey.avg_instructor ? survey.avg_instructor.toFixed(1) : '-'}</td>
            <td>${survey.response_count}</td>
        `;
        tbody.appendChild(row);
    });
}

function initializeCharts() {
    // 참여 현황 차트
    const participationCtx = document.getElementById('participationChart');
    if (participationCtx) {
        participationChart = new Chart(participationCtx, {
            type: 'doughnut',
            data: {
                labels: ['입장 확인', '부스 참여', '설문 참여', '경품 자격'],
                datasets: [{
                    data: [
                        parseInt(document.getElementById('entryConfirmed').textContent),
                        parseInt(document.getElementById('totalUsers').textContent) * 0.7, // 예상값
                        parseInt(document.getElementById('totalSurveys').textContent),
                        parseInt(document.getElementById('prizeEligible').textContent)
                    ],
                    backgroundColor: [
                        '#007bff',
                        '#28a745',
                        '#ffc107',
                        '#dc3545'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }
}

function updateSatisfactionChart(surveys) {
    const satisfactionCtx = document.getElementById('satisfactionChart');
    if (satisfactionCtx && surveys.length > 0) {
        satisfactionChart = new Chart(satisfactionCtx, {
            type: 'bar',
            data: {
                labels: surveys.map(s => s.session_name),
                datasets: [{
                    label: '만족도',
                    data: surveys.map(s => s.avg_satisfaction || 0),
                    backgroundColor: '#28a745'
                }, {
                    label: '강사 점수',
                    data: surveys.map(s => s.avg_instructor || 0),
                    backgroundColor: '#007bff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 5
                    }
                },
                plugins: {
                    legend: {
                        position: 'top'
                    }
                }
            }
        });
    }
}

function logout() {
    if (confirm('로그아웃하시겠습니까?')) {
        AdminTokenManager.clearToken();
        window.location.reload();
    }
}

// 탭 변경 시 데이터 새로고침
document.addEventListener('shown.bs.tab', function(e) {
    const targetTab = e.target.getAttribute('data-bs-target');
    
    if (targetTab === '#participants') {
        loadParticipantsData();
    } else if (targetTab === '#surveys') {
        loadSurveysData();
    }
});

// 자동 새로고침 (5분마다)
setInterval(() => {
    if (adminToken) {
        loadOverviewData();
    }
}, 300000); // 5분


