let adminAuthenticated = false;
let surveyChart = null;
let boothChart = null;

// 관리자 토큰 관리
function setAdminToken(token) {
    try {
        localStorage.setItem('adminToken', token);
        localStorage.setItem('adminLoginTime', new Date().toISOString());
    } catch (error) {
        console.error('관리자 토큰 저장 오류:', error);
    }
}

function getAdminToken() {
    try {
        return localStorage.getItem('adminToken');
    } catch (error) {
        console.error('관리자 토큰 조회 오류:', error);
        return null;
    }
}

function removeAdminToken() {
    try {
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminLoginTime');
    } catch (error) {
        console.error('관리자 토큰 삭제 오류:', error);
    }
}

// 관리자 인증 확인
async function checkAdminAuth() {
    const token = getAdminToken();
    if (!token) {
        return null;
    }

    try {
        const response = await fetch(`/api/admin/verify`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'kb-auth': `Bearer ${token}`
            }
        });

        const data = await response.json();
        if (data.success) {
            return data.admin;
        } else {
            removeAdminToken();
            return null;
        }
    } catch (error) {
        console.error('관리자 인증 확인 오류:', error);
        removeAdminToken();
        return null;
    }
}

// 관리자 로그인
async function adminLogin() {
    const username = document.getElementById('adminUsername').value;
    const password = document.getElementById('adminPassword').value;
    const messageDiv = document.getElementById('adminLoginMessage');

    if (!username || !password) {
        messageDiv.innerHTML = '<div class="alert alert-error">ID와 비밀번호를 입력해주세요.</div>';
        return;
    }

    try {
        const response = await fetch(`/api/admin/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (data.success) {
            // 토큰 저장
            if (data.token) {
                setAdminToken(data.token);
            }
            
            adminAuthenticated = true;
            document.getElementById('loginSection').style.display = 'none';
            document.getElementById('dashboardSection').style.display = 'block';
            loadDashboard();
        } else {
            messageDiv.innerHTML = '<div class="alert alert-error">인증 정보가 올바르지 않습니다.</div>';
        }
    } catch (error) {
        console.error('로그인 오류:', error);
        messageDiv.innerHTML = '<div class="alert alert-error">네트워크 오류가 발생했습니다.</div>';
    }
}

// 대시보드 로드
async function loadDashboard() {
    await loadStats();
    await loadSurveyData();
    await loadBoothData();
    await loadUsers();
    await loadBoothParticipations();
    await loadPrizeClaims(); // 탭에서 추첨 자격자 목록 로드
    await loadSurveys();
    await initLotteryWheels(); // 룰렛 초기화
    // 로그는 탭 클릭 시 로드
}

// 테스트 데이터 생성 (가상 사용자 150명)
async function generateTestData() {
    const btn = document.getElementById('generateTestDataBtn');
    const resultDiv = document.getElementById('testDataResult');
    
    if (!btn || !resultDiv) return;
    
    // 확인
    if (typeof showConfirmModal === 'function') {
        showConfirmModal(
            '테스트 데이터 생성',
            '가상 사용자 150명을 생성하시겠습니까?\n기존 사용자와 중복되지 않도록 생성됩니다.',
            () => {
                proceedGenerateTestData();
            },
            () => {
                // 취소 처리 없음
            }
        );
        return;
    }
    
    if (!confirm('가상 사용자 150명을 생성하시겠습니까?\n기존 사용자와 중복되지 않도록 생성됩니다.')) {
        return;
    }
    
    proceedGenerateTestData();
}

// 테스트 데이터 생성 실행 함수
async function proceedGenerateTestData() {
    const btn = document.getElementById('generateTestDataBtn');
    const resultDiv = document.getElementById('testDataResult');
    
    btn.disabled = true;
    btn.textContent = '생성 중...';
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<div class="alert alert-info">테스트 데이터 생성 중입니다. 잠시만 기다려주세요...</div>';
    
    try {
        const token = localStorage.getItem('adminToken');
        if (!token) {
            throw new Error('관리자 로그인이 필요합니다.');
        }
        
        const response = await fetch('/api/admin/generate-test-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'kb-auth': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            resultDiv.innerHTML = `
                <div class="alert alert-success">
                    <h5>테스트 데이터 생성 완료</h5>
                    <p>생성된 사용자: ${data.created}명</p>
                    <p>오류 발생: ${data.errors}건</p>
                    ${data.testUserRange ? `<p>테스트 사용자 범위: ${data.testUserRange.start} ~ ${data.testUserRange.end}</p>` : ''}
                    <p>추첨번호 범위: ${data.lotteryNumberRange.start} ~ ${data.lotteryNumberRange.end}</p>
                    ${data.errorDetails && data.errorDetails.length > 0 ? `
                        <details class="mt-2">
                            <summary>오류 상세 (${data.errorDetails.length}건)</summary>
                            <pre style="max-height: 200px; overflow-y: auto;">${data.errorDetails.join('\n')}</pre>
                        </details>
                    ` : ''}
                </div>
            `;
            
            // 대시보드 새로고침
            await loadDashboard();
        } else {
            resultDiv.innerHTML = `<div class="alert alert-danger">오류: ${data.message || '테스트 데이터 생성에 실패했습니다.'}</div>`;
        }
    } catch (error) {
        console.error('테스트 데이터 생성 오류:', error);
        resultDiv.innerHTML = `<div class="alert alert-danger">오류: ${error.message || '네트워크 오류가 발생했습니다.'}</div>`;
    } finally {
        btn.disabled = false;
        btn.textContent = '테스트 사용자 150명 생성';
    }
}

// 테스트 사용자 삭제 함수
async function deleteTestUsers() {
    const btn = document.getElementById('deleteTestDataBtn');
    const resultDiv = document.getElementById('testDataResult');
    
    if (!btn || !resultDiv) return;
    
    // 확인
    if (typeof showConfirmModal === 'function') {
        showConfirmModal(
            '테스트 사용자 삭제',
            '모든 테스트 사용자(TEST001~TEST150)를 삭제(사용안함) 처리하시겠습니까?\n\n이 작업은 되돌릴 수 없으며, 해당 사용자들의 모든 부스 참여 기록도 함께 삭제됩니다.',
            async () => {
                await proceedDeleteTestUsers();
            },
            () => {
                // 취소 처리 없음
            }
        );
        return;
    }
    
    if (!confirm('모든 테스트 사용자(TEST001~TEST150)를 삭제(사용안함) 처리하시겠습니까?\n\n이 작업은 되돌릴 수 없으며, 해당 사용자들의 모든 부스 참여 기록도 함께 삭제됩니다.')) {
        return;
    }
    
    await proceedDeleteTestUsers();
}

// 테스트 사용자 삭제 실행 함수
async function proceedDeleteTestUsers() {
    const btn = document.getElementById('deleteTestDataBtn');
    const resultDiv = document.getElementById('testDataResult');
    
    btn.disabled = true;
    btn.textContent = '삭제 중...';
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<div class="alert alert-info">테스트 사용자 삭제 중입니다. 잠시만 기다려주세요...</div>';
    
    try {
        const token = localStorage.getItem('adminToken');
        if (!token) {
            throw new Error('관리자 로그인이 필요합니다.');
        }
        
        const response = await fetch('/api/admin/delete-test-users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'kb-auth': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            resultDiv.innerHTML = `
                <div class="alert alert-success">
                    <h5>테스트 사용자 삭제 완료</h5>
                    <p>삭제된 사용자: ${data.deletedCount}명</p>
                    <p>삭제된 부스 참여 기록: ${data.boothParticipationsDeleted || 0}건</p>
                    <p class="text-muted mt-2">모든 테스트 사용자가 사용안함 처리되었습니다.</p>
                </div>
            `;
            
            // 대시보드 새로고침
            await loadDashboard();
            loadBoothParticipations();
            loadPrizeEligible();
            loadPrizeClaims();
        } else {
            resultDiv.innerHTML = `<div class="alert alert-danger">오류: ${data.message || '테스트 사용자 삭제에 실패했습니다.'}</div>`;
        }
    } catch (error) {
        console.error('테스트 사용자 삭제 오류:', error);
        resultDiv.innerHTML = `<div class="alert alert-danger">오류: ${error.message || '네트워크 오류가 발생했습니다.'}</div>`;
    } finally {
        btn.disabled = false;
        btn.textContent = '테스트사용자 삭제';
    }
}

// 통계 로드
async function loadStats() {
    try {
        const response = await fetch(`/api/admin/dashboard`);
        const data = await response.json();

        if (data.success) {
            document.getElementById('totalUsers').textContent = data.data.totalUsers || 0;
            document.getElementById('totalSurveys').textContent = data.data.totalSurveys || 0;
            document.getElementById('totalPrizes').textContent = data.data.totalPrizes || 0;
            
            const totalBooths = data.data.boothStats.reduce((sum, stat) => sum + stat.count, 0);
            document.getElementById('totalBooths').textContent = totalBooths;
        }
    } catch (error) {
        console.error('통계 로드 오류:', error);
    }
}

// 설문 데이터 로드 및 차트 생성 (5점 척도 통합 설문)
async function loadSurveyData() {
    try {
        const response = await fetch(`/api/admin/surveys`);
        const data = await response.json();

        if (data.success) {
            const ctx = document.getElementById('surveyChart').getContext('2d');
            
            if (surveyChart) {
                surveyChart.destroy();
            }

            // 5점 척도 통합 설문 통계가 있는 경우
            if (data.stats && data.stats.count > 0) {
                const stats = data.stats;
                const labels = ['전반적 운영', '부스 운영', '세션 운영', '홈페이지', '경품'];
                const values = [
                    parseFloat(stats.avg_overall) || 0,
                    parseFloat(stats.avg_booth) || 0,
                    parseFloat(stats.avg_session) || 0,
                    parseFloat(stats.avg_website) || 0,
                    parseFloat(stats.avg_prize) || 0
                ];

                surveyChart = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: '평균 만족도 (5점 척도)',
                            data: values,
                            backgroundColor: [
                                'rgba(27, 79, 158, 0.8)',
                                'rgba(245, 166, 35, 0.8)',
                                'rgba(10, 37, 64, 0.8)',
                                'rgba(96, 88, 76, 0.8)',
                                'rgba(255, 188, 0, 0.8)'
                            ]
                        }]
                    },
                    options: {
                        responsive: true,
                        scales: {
                            y: {
                                beginAtZero: true,
                                max: 5,
                                ticks: {
                                    stepSize: 1
                                }
                            }
                        },
                        plugins: {
                            legend: {
                                display: false
                            },
                            title: {
                                display: true,
                                text: `총 ${stats.count}명 응답`
                            }
                        }
                    }
                });
            } 
            // 기존 세션별 설문 통계가 있는 경우 (하위 호환성)
            else if (data.sessionStats && data.sessionStats.length > 0) {
                const labels = data.sessionStats.map(s => s.session_name || s.session_id);
                const avgLecture = data.sessionStats.map(s => parseFloat(s.avg_lecture) || 0);
                const avgInstructor = data.sessionStats.map(s => parseFloat(s.avg_instructor) || 0);
                const avgApplication = data.sessionStats.map(s => parseFloat(s.avg_application) || 0);

                surveyChart = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: '강의만족도',
                                data: avgLecture,
                                backgroundColor: 'rgba(27, 79, 158, 0.8)'
                            },
                            {
                                label: '강사만족도',
                                data: avgInstructor,
                                backgroundColor: 'rgba(245, 166, 35, 0.8)'
                            },
                            {
                                label: '현업적용도',
                                data: avgApplication,
                                backgroundColor: 'rgba(10, 37, 64, 0.8)'
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        scales: {
                            y: {
                                beginAtZero: true,
                                max: 10
                            }
                        }
                    }
                });
            }
        }
    } catch (error) {
        console.error('설문 데이터 로드 오류:', error);
    }
}

// 부스 데이터 로드 및 차트 생성 (바 차트)
async function loadBoothData() {
    try {
        const response = await fetch(`/api/admin/dashboard`);
        const data = await response.json();

        if (data.success && data.data.boothStats) {
            const ctx = document.getElementById('boothChart').getContext('2d');
            
            if (boothChart) {
                boothChart.destroy();
            }

            const labels = data.data.boothStats.map(b => b.booth_code);
            const counts = data.data.boothStats.map(b => b.count);

            boothChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: '참여 인원수',
                        data: counts,
                        backgroundColor: [
                            'rgba(27, 79, 158, 0.8)',
                            'rgba(245, 166, 35, 0.8)',
                            'rgba(10, 37, 64, 0.8)',
                            'rgba(232, 244, 248, 0.8)'
                        ],
                        borderColor: [
                            'rgba(27, 79, 158, 1)',
                            'rgba(245, 166, 35, 1)',
                            'rgba(10, 37, 64, 1)',
                            'rgba(232, 244, 248, 1)'
                        ],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                stepSize: 1
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: false
                        }
                    }
                }
            });
        }
    } catch (error) {
        console.error('부스 데이터 로드 오류:', error);
    }
}

// 현재 선택된 QR 코드 정보 저장
let currentQRData = null;

// 부스 QR 코드 생성 (고정 QR)
async function generateBoothQR(boothCode) {
    try {
        const response = await fetch(`/api/booth/generate-qr`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ boothCode })
        });

        const data = await response.json();

        if (data.success) {
            const qrDiv = document.getElementById(`${boothCode}QR`);
            const boothName = getBoothName(boothCode);
            
            // QR 코드 이미지 클릭 시 팝업 표시
            qrDiv.innerHTML = `
                <img src="${data.qrImage}" alt="${boothCode} QR" 
                     style="cursor: pointer; max-width: 200px;" 
                     onclick="showQRCodePopup('${data.qrImage}', '${boothCode}', '${boothName.replace(/'/g, "\\'")}')">
                <p style="font-size: 0.8rem; margin-top: 0.5rem; color: var(--kb-gray);">${boothName}</p>
                <button class="btn btn-sm btn-outline-primary mt-1" onclick="showQRCodePopup('${data.qrImage}', '${boothCode}', '${boothName.replace(/'/g, "\\'")}')">
                    큰 이미지 보기 / 다운로드
                </button>
            `;
        }
    } catch (error) {
        console.error('QR 생성 오류:', error);
        if (typeof showModal === 'function') {
            showModal('오류', 'QR 코드 생성 중 오류가 발생했습니다.');
        } else {
            alert('QR 코드 생성 중 오류가 발생했습니다.');
        }
    }
}

// QR 코드 팝업 표시 및 텍스트 포함 이미지 생성
function showQRCodePopup(qrImageBase64, boothCode, boothName) {
    currentQRData = {
        qrImage: qrImageBase64,
        boothCode: boothCode,
        boothName: boothName
    };
    
    const canvas = document.getElementById('qrCodeCanvas');
    const ctx = canvas.getContext('2d');
    
    // QR 코드 이미지 로드
    const img = new Image();
    img.onload = function() {
        // 캔버스 크기 설정 (QR 코드 + 여백 + 텍스트)
        const qrSize = 800; // QR 코드 크기
        const padding = 40;
        const textHeight = 100;
        const canvasWidth = qrSize + (padding * 2);
        const canvasHeight = qrSize + (padding * 2) + textHeight;
        
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        
        // 배경색 (흰색)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        
        // QR 코드 이미지 그리기 (중앙 정렬)
        const qrX = padding;
        const qrY = padding;
        ctx.drawImage(img, qrX, qrY, qrSize, qrSize);
        
        // 텍스트 추가: "KB TECH FORUM . {{부스제목}}"
        const text = `KB TECH FORUM . ${boothName}`;
        ctx.fillStyle = '#60584C'; // KB Gray
        ctx.font = 'bold 48px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // 텍스트 위치 (QR 코드 하단 중앙)
        const textX = canvasWidth / 2;
        const textY = qrSize + padding + (textHeight / 2);
        
        // 텍스트 그리기 (그림자 효과)
        ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        ctx.fillText(text, textX, textY);
        
        // 그림자 효과 초기화
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
    };
    
    img.src = qrImageBase64;
    
    // 모달 표시
    const modal = new bootstrap.Modal(document.getElementById('qrCodeModal'));
    document.getElementById('qrCodeModalLabel').textContent = `${boothName} QR 코드`;
    modal.show();
}

// QR 코드 PNG 다운로드
function downloadQRCode() {
    if (!currentQRData) return;
    
    const canvas = document.getElementById('qrCodeCanvas');
    const filename = `KB_TECH_FORUM_${currentQRData.boothCode}_${currentQRData.boothName.replace(/\s+/g, '_')}.png`;
    
    // Canvas를 Blob으로 변환
    canvas.toBlob(function(blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 'image/png');
}

// 부스 코드에 따른 부스명 반환
function getBoothName(boothCode) {
    const boothNames = {
        'booth1': 'KB Agent 시연',
        'booth2': '바이브코딩 체험Zone',
        'booth3': 'AI기반 코드 어시스턴트 체험',
        'booth4': 'IT-CoP 우수사례'
    };
    return boothNames[boothCode] || boothCode;
}

// 통합설문 QR 코드 생성
async function generateSurveyQR() {
    try {
        const response = await fetch(`/api/survey/generate-qr`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.success) {
            const qrDiv = document.getElementById('surveyQRDisplay');
            qrDiv.innerHTML = `<img src="${data.qrImage}" alt="통합설문 QR" style="max-width: 300px;"><p style="margin-top: 0.5rem; font-size: 0.9rem; word-break: break-all;">${data.surveyUrl}</p>`;
        } else {
            if (typeof showModal === 'function') {
                showModal('오류', data.message || 'QR 코드 생성 중 오류가 발생했습니다.');
            } else {
                alert(data.message || 'QR 코드 생성 중 오류가 발생했습니다.');
            }
        }
    } catch (error) {
        console.error('통합설문 QR 생성 오류:', error);
        if (typeof showModal === 'function') {
            showModal('오류', '통합설문 QR 코드 생성 중 오류가 발생했습니다.');
        } else {
            alert('통합설문 QR 코드 생성 중 오류가 발생했습니다.');
        }
    }
}

// 경품 지급용 QR 스캔 모달 관련 변수
let adminQRScanner = null;
let adminQRScannerModal = null;

// 경품 지급용 QR 스캔 모달 생성
function createAdminQRScannerModal() {
    if (adminQRScannerModal) return adminQRScannerModal;
    
    const modal = document.createElement('div');
    modal.id = 'adminQRScannerModal';
    modal.className = 'modal fade';
    modal.setAttribute('tabindex', '-1');
    modal.setAttribute('aria-labelledby', 'adminQRScannerModalLabel');
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
        <div class="modal-dialog modal-dialog-centered modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="adminQRScannerModalLabel">경품 지급 QR 코드 스캔</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <div id="admin-qr-reader" style="width: 100%;"></div>
                    <div id="admin-qr-reader-results" class="mt-3"></div>
                    <div class="text-center mt-3">
                        <button type="button" class="btn btn-secondary" onclick="stopAdminQRScan()">스캔 중지</button>
                        <button type="button" class="btn btn-outline-primary" onclick="manualPrizeQRInput()">수동 입력</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    adminQRScannerModal = new bootstrap.Modal(modal);
    
    // 모달이 닫힐 때 스캔 중지
    modal.addEventListener('hidden.bs.modal', () => {
        stopAdminQRScan();
    });
    
    return adminQRScannerModal;
}

// 경품 지급용 QR 스캔 시작
async function scanPrizeQR() {
    // 모바일 기기 확인
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if ((isMobile || navigator.mediaDevices) && typeof Html5Qrcode !== 'undefined') {
        // 카메라를 사용한 QR 스캔
        startAdminMobileQRScan();
    } else {
        // 폴백: 수동 입력
        manualPrizeQRInput();
    }
}

// 관리자 모바일 QR 스캔 시작
async function startAdminMobileQRScan() {
    const modal = createAdminQRScannerModal();
    const qrReaderDiv = document.getElementById('admin-qr-reader');
    const qrResultsDiv = document.getElementById('admin-qr-reader-results');
    
    if (!qrReaderDiv) return;
    
    try {
        adminQRScanner = new Html5Qrcode("admin-qr-reader");
        
        // 후방 카메라 우선 선택 (모바일)
        const facingMode = { facingMode: "environment" }; // 후방 카메라
        
        await adminQRScanner.start(
            facingMode,
            {
                fps: 10,
                qrbox: { width: 300, height: 300 },
                aspectRatio: 1.0
            },
            (decodedText, decodedResult) => {
                // QR 코드 스캔 성공
                handleAdminQRScanResult(decodedText);
                stopAdminQRScan();
                modal.hide();
            },
            (errorMessage) => {
                // 스캔 중 오류 (무시)
            }
        );
        
        modal.show();
        qrResultsDiv.innerHTML = '<p class="text-muted">경품 지급용 QR 코드를 카메라에 맞춰주세요.</p>';
    } catch (error) {
        console.error('QR 스캔 시작 오류:', error);
        qrResultsDiv.innerHTML = `<div class="alert alert-warning">카메라 접근 권한이 필요합니다. 또는 수동 입력을 사용해주세요.</div>`;
        
        // 폴백: 수동 입력
        setTimeout(() => {
            if (typeof showConfirmModal === 'function') {
                showConfirmModal(
                    '카메라 사용 불가',
                    '카메라를 사용할 수 없습니다. 수동 입력으로 진행하시겠습니까?',
                    () => {
                        stopAdminQRScan();
                        modal.hide();
                        manualPrizeQRInput();
                    },
                    () => {
                        modal.hide();
                    }
                );
            } else if (confirm('카메라를 사용할 수 없습니다. 수동 입력으로 진행하시겠습니까?')) {
                stopAdminQRScan();
                modal.hide();
                manualPrizeQRInput();
            }
        }, 2000);
    }
}

// 관리자 QR 스캔 중지
function stopAdminQRScan() {
    if (adminQRScanner) {
        adminQRScanner.stop().then(() => {
            adminQRScanner.clear();
            adminQRScanner = null;
        }).catch((err) => {
            console.error('QR 스캔 중지 오류:', err);
            adminQRScanner = null;
        });
    }
}

// 수동 경품 QR 입력
function manualPrizeQRInput() {
    const url = prompt('QR 코드를 스캔하여 URL을 입력하거나 붙여넣으세요:');
    if (!url) return;

    try {
        // URL에서 data 파라미터 추출
        const urlObj = new URL(url);
        const urlParams = new URLSearchParams(urlObj.search);
        const encryptedData = urlParams.get('data');

        if (encryptedData) {
            document.getElementById('prizeQRInput').value = encryptedData;
            // 자동으로 경품 지급 처리
            claimPrize();
        } else {
            // URL이 아닌 경우 직접 데이터로 간주
            document.getElementById('prizeQRInput').value = url;
            claimPrize();
        }
    } catch (error) {
        // URL 파싱 실패 시 직접 입력된 데이터로 간주
        document.getElementById('prizeQRInput').value = url;
        claimPrize();
    }
}

// 관리자 QR 스캔 결과 처리
function handleAdminQRScanResult(decodedText) {
    try {
        // URL에서 data 파라미터 추출
        const urlObj = new URL(decodedText);
        const urlParams = new URLSearchParams(urlObj.search);
        const encryptedData = urlParams.get('data');

        if (encryptedData) {
            document.getElementById('prizeQRInput').value = encryptedData;
            // 자동으로 경품 지급 처리
            claimPrize();
        } else {
            // URL이 아닌 경우 직접 데이터로 간주
            document.getElementById('prizeQRInput').value = decodedText;
            claimPrize();
        }
    } catch (error) {
        // URL 파싱 실패 시 직접 입력된 데이터로 간주
        document.getElementById('prizeQRInput').value = decodedText;
        claimPrize();
    }
}

// 전역 함수로 노출
window.scanPrizeQR = scanPrizeQR;
window.stopAdminQRScan = stopAdminQRScan;
window.manualPrizeQRInput = manualPrizeQRInput;
window.showQRCodePopup = showQRCodePopup;
window.downloadQRCode = downloadQRCode;

// 경품 지급
async function claimPrize() {
    const encryptedData = document.getElementById('prizeQRInput').value;
    const messageDiv = document.getElementById('prizeClaimMessage');

    if (!encryptedData) {
        messageDiv.innerHTML = '<div class="alert alert-error">QR 코드 데이터를 입력해주세요.</div>';
        return;
    }

    try {
        const response = await fetch(`/api/admin/prize-claim`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ encryptedData })
        });

        const data = await response.json();

        if (data.success) {
            if (data.alreadyClaimed) {
                messageDiv.innerHTML = `<div class="alert alert-error">이미 경품을 지급받은 사용자입니다: ${data.user.empname}</div>`;
            } else {
                messageDiv.innerHTML = `<div class="alert alert-success">경품 지급 완료: ${data.user.empname} (${data.user.deptname})</div>`;
                document.getElementById('prizeQRInput').value = '';
                loadStats();
                loadPrizeClaims();
            }
        } else {
            messageDiv.innerHTML = `<div class="alert alert-error">${data.message}</div>`;
        }
    } catch (error) {
        console.error('경품 지급 오류:', error);
        messageDiv.innerHTML = '<div class="alert alert-error">네트워크 오류가 발생했습니다.</div>';
    }
}

// 룰렛 초기화 (각 자릿수별 가능한 숫자만 표시)
let lotteryDigits = { hundreds: [0,1,2,3], tens: [0,1,2,3,4,5,6,7,8,9], ones: [0,1,2,3,4,5,6,7,8,9] };
let maxLotteryNumber = 300;

// 룰렛 DOM 생성 함수 (재사용 가능)
function createWheelDOM(wheelInner, digits, label) {
    const itemHeight = 40;
    const wheelHeight = 200;
    const centerY = wheelHeight / 2;
    // 랜덤값의 2배 범위 내에서 여유분 추가
    // 백의자리: 최대 30, 30 * 2 = 60
    // 십의자리/일의자리: 최대 100, 100 * 2 = 200
    // 안전을 위해 최대값인 200을 기준으로 설정
    const maxRepeatCount = 200; // 최대 랜덤값(100) * 2 = 200
    const digitCount = digits.length;
    const totalItemsNeeded = maxRepeatCount;
    
    // 숫자 세트를 반복하여 생성 (위아래 패딩 포함)
    const topPaddingSets = Math.ceil(totalItemsNeeded / digitCount / 2);
    let html = '';
    
    // 위쪽 패딩: 중앙 위에 충분한 숫자
    for (let i = 0; i < topPaddingSets; i++) {
        digits.forEach(digit => {
            html += `<div class="wheel-item" data-digit="${digit}">${digit}</div>`;
        });
    }
    
    // 중앙 숫자 세트 (첫 번째 세트)
    digits.forEach(digit => {
        html += `<div class="wheel-item" data-digit="${digit}">${digit}</div>`;
    });
    
    // 아래쪽 패딩: 중앙 아래에 충분한 숫자
    for (let i = 0; i < topPaddingSets; i++) {
        digits.forEach(digit => {
            html += `<div class="wheel-item" data-digit="${digit}">${digit}</div>`;
        });
    }
    
    // DOM 새로 생성
    wheelInner.innerHTML = html;
    
    // 초기 위치 계산
    const paddingItemsCount = topPaddingSets * digitCount;
    const firstItemIndex = paddingItemsCount;
    const firstItemTop = firstItemIndex * itemHeight;
    const firstItemCenter = firstItemTop + (itemHeight / 2);
    const initialOffset = centerY - firstItemCenter;
    
    // 초기 위치 설정
    wheelInner.style.transition = 'none';
    wheelInner.style.transform = `translateY(${initialOffset}px)`;
    wheelInner.style.visibility = 'visible';
    wheelInner.style.opacity = '1';
    wheelInner.style.display = 'block';
    wheelInner.style.zIndex = '1';
    wheelInner.style.position = 'absolute';
    wheelInner.style.top = '0';
    wheelInner.style.left = '0';
    wheelInner.style.width = '100%';
    wheelInner.style.height = 'auto';
    
    // 강제 리플로우
    void wheelInner.offsetHeight;
    
    return {
        initialOffset,
        paddingItemsCount,
        firstItemIndex,
        topPaddingSets,
        totalItems: wheelInner.querySelectorAll('.wheel-item').length
    };
}

async function initLotteryWheels() {
    try {
        const response = await fetch(`/api/prize/lottery-digits`);
        const data = await response.json();

        if (data.success) {
            lotteryDigits = data.digits;
            maxLotteryNumber = data.maxNumber;
            
            // 참여인원 정보 업데이트 (120 검증 제거)
            const participantCount = data.participantCount || 0;
            const maxNumber = data.maxNumber || 999;
            
            // 추첨 범위 정보 표시
            document.getElementById('lotteryInfo').textContent = `전체 참여인원 ${participantCount}명 기준 추첨`;
            document.getElementById('drawLotteryBtn').disabled = false;
            
            // 각 룰렛에 숫자 생성 (무한 스크롤 효과를 위해 반복)
            const wheels = [
                { id: 'wheelInner1', digits: lotteryDigits.hundreds, label: '백의자리' },
                { id: 'wheelInner2', digits: lotteryDigits.tens, label: '십의자리' },
                { id: 'wheelInner3', digits: lotteryDigits.ones, label: '일의자리' }
            ];
            
            wheels.forEach(wheel => {
                const wheelInner = document.getElementById(wheel.id);
                if (!wheelInner) {
                    return;
                }
                
                // DOM 생성 함수 호출
                const result = createWheelDOM(wheelInner, wheel.digits, wheel.label);
                
                // DOM 렌더링 완료 후 검증 및 재조정
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        const items = wheelInner.querySelectorAll('.wheel-item');
                        const itemHeight = 40;
                        if (items.length > 0 && result.firstItemIndex < items.length) {
                            const firstItem = items[result.firstItemIndex];
                            const wheelContainer = wheelInner.parentElement;
                            const wheelRect = wheelContainer.getBoundingClientRect();
                            const wheelCenterY = wheelRect.height / 2;
                            
                            const firstItemRect = firstItem.getBoundingClientRect();
                            const wheelInnerRect = wheelInner.getBoundingClientRect();
                            const firstItemRelativeTop = firstItemRect.top - wheelInnerRect.top;
                            const firstItemCenterActual = firstItemRelativeTop + (itemHeight / 2);
                            const actualOffset = wheelCenterY - firstItemCenterActual;
                            
                            // 실제 위치와 계산된 위치가 다르면 조정
                            if (Math.abs(actualOffset - result.initialOffset) > 5) {
                                wheelInner.style.transition = 'none';
                                wheelInner.style.transform = `translateY(${actualOffset}px)`;
                                void wheelInner.offsetHeight;
                            }
                        }
                        
                    });
                });
            });
        }
    } catch (error) {
        // 룰렛 초기화 오류 처리
    }
}

// 룰렛 초기화 함수 (추첨 시작 전 모든 상태 초기화 및 DOM 재생성)
function resetLotteryWheels() {
    
    // 기존 타이머 모두 정리
    wheelCheckIntervals.forEach(interval => clearInterval(interval));
    wheelCheckIntervals = [];
    
    // 각 룰렛의 DOM을 새로 생성
    for (let i = 1; i <= 3; i++) {
        const wheelInner = document.getElementById(`wheelInner${i}`);
        if (!wheelInner) continue;
        
        // 애니메이션 클래스 제거
        wheelInner.classList.remove('spinning');
        wheelInner.classList.remove('spinning-slow');
        
        // 현재 자릿수의 숫자 배열 가져오기
        const availableDigits = i === 1 ? lotteryDigits.hundreds : 
                                i === 2 ? lotteryDigits.tens : lotteryDigits.ones;
        const label = i === 1 ? '백의자리' : i === 2 ? '십의자리' : '일의자리';
        
        // DOM 완전히 새로 생성 (기존 DOM 삭제 후 재생성)
        const result = createWheelDOM(wheelInner, availableDigits, label);
    }
    
    // DOM 렌더링 완료 후 위치 재확인 및 조정
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const itemHeight = 40;
            const wheelHeight = 200;
            const centerY = wheelHeight / 2;
            const maxRepeatCount = 200; // 랜덤값의 2배 범위 (100 * 2 = 200)
            
            for (let i = 1; i <= 3; i++) {
                const wheelInner = document.getElementById(`wheelInner${i}`);
                if (!wheelInner) continue;
                
                const availableDigits = i === 1 ? lotteryDigits.hundreds : 
                                        i === 2 ? lotteryDigits.tens : lotteryDigits.ones;
                const digitCount = availableDigits.length;
                const topPaddingSets = Math.ceil(maxRepeatCount / digitCount / 2);
                const paddingItemsCount = topPaddingSets * digitCount;
                const firstItemIndex = paddingItemsCount;
                const firstItemTop = firstItemIndex * itemHeight;
                const firstItemCenter = firstItemTop + (itemHeight / 2);
                const initialOffset = centerY - firstItemCenter;
                
                // 현재 위치 확인
                const currentTransform = window.getComputedStyle(wheelInner).transform;
                let currentY = 0;
                if (currentTransform && currentTransform !== 'none') {
                    const matrix = currentTransform.match(/matrix.*\((.+)\)/);
                    if (matrix && matrix[1]) {
                        const values = matrix[1].split(',');
                        if (values.length >= 6) {
                            currentY = parseFloat(values[5]) || 0;
                        }
                    }
                }
                
                // 위치가 다르면 재설정
                if (Math.abs(currentY - initialOffset) > 5) {
                    wheelInner.style.transition = 'none';
                    wheelInner.style.transform = `translateY(${initialOffset}px)`;
                    void wheelInner.offsetHeight;
                }
            }
        });
    });
}

// 경품 추첨 (룰렛 방식 - 랜덤 회전으로 당첨번호 결정)
async function drawLottery() {
    const drawBtn = document.getElementById('drawLotteryBtn');
    const resultDiv = document.getElementById('lotteryResult');
    
    // 버튼 비활성화
    drawBtn.disabled = true;
    drawBtn.textContent = '추첨 중...';
    
    // 결과 영역 초기화
    resultDiv.innerHTML = '';
    
    // 추첨 시작 전 모든 룰렛 초기화 (기존 상태 완전 제거)
    resetLotteryWheels();
    
    // 초기화 완료를 위한 짧은 대기 (DOM 렌더링 보장)
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
        // 각 자릿수별로 랜덤 스크롤 값 생성
        // 백의자리는 숫자가 적으므로(2개 또는 5개) 20~30 범위로 제한하여 배정된 숫자 범위 내에서만 회전
        // 십의자리, 일의자리는 0~9로 10개이므로 20~100 범위 유지
        const randomScrollValues = [
            Math.floor(Math.random() * (30 - 20 + 1)) + 20, // 백의자리: 20~30 (배정된 숫자 범위 내에서만 회전)
            Math.floor(Math.random() * (100 - 20 + 1)) + 20, // 십의자리: 20~100
            Math.floor(Math.random() * (100 - 20 + 1)) + 20  // 일의자리: 20~100
        ];
        
        // 각 룰렛을 랜덤 스크롤 값만큼 회전시킴
        spinWheelsRandom(randomScrollValues, (finalDigits) => {
            // 애니메이션 완료 후 화살표 위치의 숫자를 읽어서 당첨번호 결정
            const drawnNumber = parseInt(finalDigits.join(''));
            
            // 백엔드에 당첨번호 확인 요청
            checkWinner(drawnNumber, (data) => {
                const drawnNumberStr = drawnNumber.toString().padStart(3, '0');
                
                if (data.success) {
                    if (data.hasWinner) {
                        resultDiv.innerHTML = `
                            <div class="lottery-result">
                                <div class="lottery-result-number">${drawnNumberStr}</div>
                                <div class="lottery-result-winner">
                                    <h4>당첨자: ${data.winner.empname}</h4>
                                    <p>${data.winner.deptname} ${data.winner.posname || ''}</p>
                                </div>
                            </div>
                        `;
                    } else {
                        resultDiv.innerHTML = `
                            <div class="lottery-result" style="background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);">
                                <div class="lottery-result-number">${drawnNumberStr}</div>
                                <div class="lottery-result-winner">
                                    <h4>해당 번호의 참가자가 없습니다.</h4>
                                    <p>다시 추첨해주세요.</p>
                                </div>
                            </div>
                        `;
                    }
                } else {
                    resultDiv.innerHTML = `<div class="alert alert-error">${data.message || '추첨 확인 중 오류가 발생했습니다.'}</div>`;
                }
                
                // 버튼 활성화
                drawBtn.disabled = false;
                drawBtn.textContent = '추첨하기';
            });
        });
    } catch (error) {
        resultDiv.innerHTML = '<div class="alert alert-error">추첨 중 오류가 발생했습니다.</div>';
        drawBtn.disabled = false;
        drawBtn.textContent = '추첨하기';
    }
}

// 당첨번호 확인 (백엔드 API 호출)
async function checkWinner(drawnNumber, callback) {
    try {
        const response = await fetch(`/api/prize/check-winner`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ drawnNumber })
        });

        const data = await response.json();
        callback(data);
    } catch (error) {
        console.error('당첨번호 확인 오류:', error);
        callback({
            success: false,
            message: '당첨번호 확인 중 오류가 발생했습니다.'
        });
    }
}

// 각 룰렛의 애니메이션 완료 후 최종 위치 처리 함수
function processWheelCompletion(wheelNum, index, animationDuration, finalDigits, wheelCompletionFlags, callback) {
    // 이미 완료된 룰렛인 경우 중복 실행 방지
    if (wheelCompletionFlags[index] === true) {
        return;
    }
    
    const wheelInner = document.getElementById(`wheelInner${wheelNum}`);
    if (!wheelInner) {
        return;
    }
    
    const availableDigits = index === 0 ? lotteryDigits.hundreds : 
                            index === 1 ? lotteryDigits.tens : lotteryDigits.ones;
    
    // 애니메이션 클래스 제거 및 즉시 중단
    wheelInner.classList.remove('spinning');
    wheelInner.classList.remove('spinning-slow');
    
    // transition을 즉시 제거하여 애니메이션 중단
    wheelInner.style.transition = 'none';
    
    // 최종 위치를 정확히 조정하여 순환 처리 확보
    const itemHeight = 40;
    const digitCount = availableDigits.length;
    const oneCycle = digitCount * itemHeight;
    const wheelHeight = 200;
    const centerY = wheelHeight / 2;
    
    // 현재 transform 위치 가져오기
    const currentTransform = window.getComputedStyle(wheelInner).transform;
    let finalY = 0;
    if (currentTransform && currentTransform !== 'none') {
        const matrix = currentTransform.match(/matrix.*\((.+)\)/);
        if (matrix && matrix[1]) {
            const values = matrix[1].split(',');
            if (values.length >= 6) {
                finalY = parseFloat(values[5]) || 0;
            }
        }
    }
    
    // 애니메이션 완료 후 최종 위치를 순환 처리하여 보이는 범위로 조정
    const maxRepeatCount = 200; // 랜덤값의 2배 범위 (100 * 2 = 200)
    const topPaddingSets = Math.ceil(maxRepeatCount / digitCount / 2);
    const paddingItemsCount = topPaddingSets * digitCount;
    const centerItemIndex = paddingItemsCount;
    const centerItemCenter = (centerItemIndex * itemHeight) + (itemHeight / 2);
    const centerOffset = centerY - centerItemCenter;
    const initialPosition = centerOffset;
    
    // 애니메이션 종료 위치에서 초기 위치까지의 거리 계산
    const distanceFromInitial = initialPosition - finalY;
    
    // 순환 처리: 거리를 한 바퀴로 나눈 나머지 (양수로 변환)
    const normalizedDistance = ((distanceFromInitial % oneCycle) + oneCycle) % oneCycle;
    
    // 정규화된 거리를 사용하여 정확한 숫자 인덱스 계산
    const digitIndex = Math.round(normalizedDistance / itemHeight) % digitCount;
    const finalDigit = availableDigits[digitIndex];
    
    // 최종 위치 재계산 (순환 처리된 위치 - 정확히 해당 숫자가 중앙에 오도록)
    const finalNormalizedPosition = initialPosition - (digitIndex * itemHeight);
    
    // 정확한 위치로 재조정 (transition 없이 즉시) - 보이는 범위로 이동
    wheelInner.style.transition = 'none';
    wheelInner.style.transform = `translateY(${finalNormalizedPosition}px)`;
    wheelInner.style.visibility = 'visible';
    wheelInner.style.opacity = '1';
    
    // 강제 리플로우
    void wheelInner.offsetHeight;
    
    // 최종 숫자 저장 (순환 처리된 숫자 사용)
    finalDigits[index] = finalDigit;
    
    // 화살표 위치(중앙)에 있는 숫자 찾기 (검증용)
    const wheelRect = wheelInner.parentElement.getBoundingClientRect();
    const visualCenterY = wheelRect.top + wheelRect.height / 2;
    
    // 선택된 숫자 강조 및 반전 효과
    setTimeout(() => {
        // 모든 항목에서 selected 클래스 제거 및 스타일 초기화
        wheelInner.querySelectorAll('.wheel-item').forEach(item => {
            item.classList.remove('selected');
            item.style.background = '';
            item.style.color = '';
            item.style.opacity = '';
        });
        
        // 순환 처리된 숫자의 모든 항목 찾기
        const sameDigitItems = wheelInner.querySelectorAll(`.wheel-item[data-digit="${finalDigit}"]`);
        let selectedItem = null;
        let minDistance = Infinity;
        
        sameDigitItems.forEach(item => {
            const rect = item.getBoundingClientRect();
            const itemCenterY = rect.top + rect.height / 2;
            const distance = Math.abs(itemCenterY - visualCenterY);
            
            if (distance < minDistance) {
                minDistance = distance;
                selectedItem = item;
            }
        });
        
        if (selectedItem) {
            selectedItem.classList.add('selected');
            
            // 같은 숫자의 다른 항목도 약간 투명하게
            sameDigitItems.forEach(item => {
                if (item !== selectedItem) {
                    item.style.opacity = '0.6';
                }
            });
        }
        
        // 이 룰렛 완료 표시 (중복 방지를 위해 이미 체크했지만 다시 확인)
        if (wheelCompletionFlags[index] === false) {
            wheelCompletionFlags[index] = true;
            
            // 모든 룰렛이 완료되었는지 확인
            if (wheelCompletionFlags.every(flag => flag === true)) {
                // 모든 룰렛이 멈춘 후 콜백 실행 (최종 숫자 전달)
                // 콜백이 이미 실행되었는지 확인하기 위해 전역 플래그 사용
                if (callback && typeof callback === 'function' && !callbackExecuted) {
                    callbackExecuted = true; // 콜백 실행 플래그 설정
                    // 짧은 지연을 두어 모든 룰렛이 시각적으로 완전히 멈춘 후 콜백 실행
                    setTimeout(() => {
                        callback(finalDigits);
                    }, 200);
                }
            }
        }
    }, 100);
}

// 룰렛 랜덤 회전 애니메이션 (각 자릿수별 랜덤 스크롤 값만큼 회전)
// 전역 변수로 타이머 관리 (초기화 시 정리)
let wheelCheckIntervals = [];
// 콜백 중복 실행 방지를 위한 플래그 (각 추첨마다 새로 생성)
let callbackExecuted = false;

function spinWheelsRandom(randomScrollValues, callback) {
    const wheels = [1, 2, 3];
    const itemHeight = 40; // 각 숫자 항목의 높이
    
    // 기존 체크 인터벌 모두 정리
    wheelCheckIntervals.forEach(interval => clearInterval(interval));
    wheelCheckIntervals = [];
    
    // 콜백 실행 플래그 초기화 (새로운 추첨 시작)
    callbackExecuted = false;
    
    // 각 자릿수별로 5~10초 범위의 랜덤 애니메이션 시간 생성
    // 각 룰렛이 독립적으로 다른 시간으로 회전하여 자연스러운 효과
    const animationDurations = [
        Math.floor(Math.random() * (10000 - 5000 + 1)) + 5000, // 백의자리: 5~10초
        Math.floor(Math.random() * (10000 - 5000 + 1)) + 5000, // 십의자리: 5~10초
        Math.floor(Math.random() * (10000 - 5000 + 1)) + 5000  // 일의자리: 5~10초
    ];
    
    const finalDigits = []; // 각 자릿수의 최종 숫자
    const wheelCompletionFlags = [false, false, false]; // 각 룰렛의 완료 여부 추적
    
    wheels.forEach((wheelNum, index) => {
        const wheelInner = document.getElementById(`wheelInner${wheelNum}`);
        const availableDigits = index === 0 ? lotteryDigits.hundreds : 
                                index === 1 ? lotteryDigits.tens : lotteryDigits.ones;
        
        // 현재 위치 가져오기
        const currentTransform = window.getComputedStyle(wheelInner).transform;
        let currentY = 0;
        if (currentTransform && currentTransform !== 'none') {
            const matrix = currentTransform.match(/matrix.*\((.+)\)/);
            if (matrix && matrix[1]) {
                const values = matrix[1].split(',');
                if (values.length >= 6) {
                    currentY = parseFloat(values[5]) || 0;
                }
            }
        }
        
        // 초기 위치 계산 (룰렛이 항상 보이도록)
        const digitCount = availableDigits.length;
        const maxRepeatCount = 200; // 랜덤값의 2배 범위 (100 * 2 = 200)
        const topPaddingSets = Math.ceil(maxRepeatCount / digitCount / 2);
        const paddingItemsCount = topPaddingSets * digitCount;
        const firstItemIndex = paddingItemsCount;
        const firstItemTop = firstItemIndex * itemHeight;
        const firstItemCenter = firstItemTop + (itemHeight / 2);
        const wheelHeight = 200;
        const centerY = wheelHeight / 2;
        const initialOffset = centerY - firstItemCenter;
        
        // 현재 위치가 초기 위치 기준으로 정규화되지 않았으면 정규화
        const oneCycle = digitCount * itemHeight; // 한 바퀴 회전 거리
        
        // 현재 위치를 초기 위치 기준으로 정규화
        const offsetFromInitial = currentY - initialOffset;
        const normalizedOffset = ((offsetFromInitial % oneCycle) + oneCycle) % oneCycle;
        const normalizedCurrentY = initialOffset + normalizedOffset;
        
        // 요구사항: 각 자릿수별 랜덤 스크롤 값(20~100)을 픽셀로 변환
        // 랜덤값은 항목 개수로 변환 (각 항목 높이 40px)
        const randomScrollValue = randomScrollValues[index]; // 20~100
        const randomPixel = randomScrollValue * itemHeight; // 픽셀 단위로 변환
        
        // 각 룰렛별 애니메이션 시간
        const animationDuration = animationDurations[index];
        
        // 회전 거리를 한 바퀴 거리로 나눈 나머지를 사용하여 순환 처리
        const effectivePixel = randomPixel % oneCycle;
        const extraSpins = Math.floor(randomPixel / oneCycle);
        const totalSpinDistance = (extraSpins * oneCycle) + effectivePixel;
        
        // 애니메이션 시작/종료 위치 계산
        const animationStartPosition = normalizedCurrentY;
        const animationFinalPosition = normalizedCurrentY - totalSpinDistance;
        
        // 애니메이션 완료 후 최종 위치를 순환 처리하여 보이는 범위 내에 유지
        const finalOffsetFromInitial = animationFinalPosition - initialOffset;
        const normalizedFinalOffset = ((finalOffsetFromInitial % oneCycle) + oneCycle) % oneCycle;
        const normalizedFinalPosition = initialOffset + normalizedFinalOffset;
        const actualFinalPosition = normalizedFinalPosition;
        
        // 요구사항: 목표 랜덤값의 5% 이내인 경우 감속
        // 백의자리는 20~30 범위, 십의자리/일의자리는 20~100 범위
        const minRange = index === 0 ? 20 : 20; // 백의자리와 나머지는 동일한 최소값
        const maxRange = index === 0 ? 30 : 100; // 백의자리는 30, 나머지는 100
        const threshold = minRange + (maxRange - minRange) * 0.05; // 5% 임계값
        const isSlowAnimation = randomScrollValue < threshold;
        
        // 룰렛이 보이도록 초기 위치 조정 (회전 시작 전에 룰렛이 보이도록)
        wheelInner.style.visibility = 'visible';
        wheelInner.style.opacity = '1';
        wheelInner.style.display = 'block';
        wheelInner.style.zIndex = '1';
        
        // 현재 룰렛이 보이지 않으면 초기 위치 재설정
        const items = wheelInner.querySelectorAll('.wheel-item');
        if (items.length > 0) {
            if (Math.abs(currentY - initialOffset) > wheelHeight * 2) {
                wheelInner.style.transition = 'none';
                wheelInner.style.transform = `translateY(${initialOffset}px)`;
                void wheelInner.offsetHeight;
                currentY = initialOffset;
            }
        }
        
        
        // 약간의 지연을 두고 각 룰렛을 순차적으로 시작
        setTimeout(() => {
            if (isSlowAnimation) {
                // 두 단계 애니메이션: 처음 90%는 빠르게, 마지막 10%는 서서히 감속
                const fastDistance = totalSpinDistance * 0.9; // 처음 90%
                const slowDistance = totalSpinDistance * 0.1; // 마지막 10%
                // 애니메이션 중에는 실제 거리로 스크롤
                const midPosition = animationStartPosition - fastDistance;
                
                // DOM 요소 존재 확인 및 보장
                if (!wheelInner || !wheelInner.parentElement) {
                    return;
                }
                
                // 첫 번째 단계: 빠른 회전 (90%) - 실제 거리로 스크롤
                wheelInner.classList.add('spinning');
                // 동적 애니메이션 시간 설정 (90% 구간)
                wheelInner.style.transition = `transform ${animationDuration * 0.9}ms cubic-bezier(0.17, 0.67, 0.12, 0.99)`;
                
                // DOM 요소가 유지되도록 강제
                wheelInner.style.position = 'absolute';
                wheelInner.style.top = '0';
                wheelInner.style.left = '0';
                wheelInner.style.width = '100%';
                wheelInner.style.height = 'auto';
                wheelInner.style.transform = `translateY(${midPosition}px)`;
                wheelInner.style.visibility = 'visible';
                wheelInner.style.opacity = '1';
                wheelInner.style.display = 'block';
                wheelInner.style.zIndex = '1';
                
                // 강제 리플로우로 DOM 상태 확인
                void wheelInner.offsetHeight;
                
                // 회전 중간 지점 확인 (1초마다) 및 DOM/가시성 보장
                const checkInterval = setInterval(() => {
                    // DOM 요소 존재 확인
                    const currentElement = document.getElementById(`wheelInner${wheelNum}`);
                    if (!currentElement || !currentElement.parentElement) {
                        clearInterval(checkInterval);
                        return;
                    }
                    
                    const currentTransform = window.getComputedStyle(wheelInner).transform;
                    let checkY = 0;
                    if (currentTransform && currentTransform !== 'none') {
                        const matrix = currentTransform.match(/matrix.*\((.+)\)/);
                        if (matrix && matrix[1]) {
                            const values = matrix[1].split(',');
                            if (values.length >= 6) {
                                checkY = parseFloat(values[5]) || 0;
                            }
                        }
                    }
                    
                    // DOM 요소가 유지되도록 강제
                    wheelInner.style.position = 'absolute';
                    wheelInner.style.top = '0';
                    wheelInner.style.left = '0';
                    wheelInner.style.width = '100%';
                    wheelInner.style.visibility = 'visible';
                    wheelInner.style.opacity = '1';
                    wheelInner.style.display = 'block';
                    wheelInner.style.zIndex = '1';
                    
                    // 숫자 항목들도 보이도록 보장
                    const items = wheelInner.querySelectorAll('.wheel-item');
                    if (items.length > 0) {
                        items.forEach(item => {
                            item.style.visibility = 'visible';
                            item.style.opacity = '1';
                            item.style.display = 'flex';
                        });
                    }
                }, 1000);
                
                // 체크 인터벌을 전역 배열에 저장 (초기화 시 정리용)
                wheelCheckIntervals.push(checkInterval);
                
                // 두 번째 단계: 서서히 감속 (마지막 10%)
                setTimeout(() => {
                    clearInterval(checkInterval);
                    const intervalIndex = wheelCheckIntervals.indexOf(checkInterval);
                    if (intervalIndex > -1) {
                        wheelCheckIntervals.splice(intervalIndex, 1);
                    }
                    
                    // 중간 지점에서 목표 지점까지의 거리 계산
                    const remainingDistance = Math.abs(animationFinalPosition - midPosition);
                    const itemHeight = 40;
                    const digitCount = availableDigits.length;
                    const oneCycle = digitCount * itemHeight;
                    
                    // 현재 위치 기준으로 다음 숫자 항목의 중간 지점까지 도달 가능한지 확인
                    const currentOffsetFromInitial = midPosition - initialOffset;
                    const normalizedCurrentOffset = ((currentOffsetFromInitial % oneCycle) + oneCycle) % oneCycle;
                    const currentDigitIndex = Math.floor(normalizedCurrentOffset / itemHeight);
                    const nextDigitIndex = (currentDigitIndex + 1) % digitCount;
                    const nextDigitCenterOffset = nextDigitIndex * itemHeight + (itemHeight / 2);
                    const distanceToNextDigitCenter = nextDigitCenterOffset - normalizedCurrentOffset;
                    
                    // 목표 지점까지의 거리가 다음 숫자 중간 지점을 넘지 못하면 즉시 종료
                    // 이미 완료된 룰렛인 경우 처리하지 않음
                    if (remainingDistance < distanceToNextDigitCenter && wheelCompletionFlags[index] !== true) {
                        // 즉시 종료하고 최종 위치 처리
                        wheelInner.classList.remove('spinning');
                        wheelInner.style.transition = 'none';
                        wheelInner.style.transform = `translateY(${animationFinalPosition}px)`;
                        wheelInner.style.visibility = 'visible';
                        wheelInner.style.opacity = '1';
                        
                        // 즉시 최종 위치 처리
                        setTimeout(() => {
                            processWheelCompletion(wheelNum, index, animationDuration, finalDigits, wheelCompletionFlags, callback);
                        }, 50);
                        return;
                    }
                    
                    wheelInner.classList.remove('spinning');
                    wheelInner.classList.add('spinning-slow');
                    // 동적 애니메이션 시간 설정 (10% 구간)
                    wheelInner.style.transition = `transform ${animationDuration * 0.1}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
                    // 애니메이션 중에는 실제 거리로, 완료 후 정규화
                    wheelInner.style.transform = `translateY(${animationFinalPosition}px)`;
                    wheelInner.style.visibility = 'visible';
                    wheelInner.style.opacity = '1';
                    
                    // 느린 구간에서도 주기적으로 확인하여 즉시 종료 가능 여부 체크
                    let slowCheckCount = 0;
                    const slowCheckInterval = setInterval(() => {
                        slowCheckCount++;
                        const currentTransform = window.getComputedStyle(wheelInner).transform;
                        let currentSlowY = 0;
                        if (currentTransform && currentTransform !== 'none') {
                            const matrix = currentTransform.match(/matrix.*\((.+)\)/);
                            if (matrix && matrix[1]) {
                                const values = matrix[1].split(',');
                                if (values.length >= 6) {
                                    currentSlowY = parseFloat(values[5]) || 0;
                                }
                            }
                        }
                        
                        // 현재 위치에서 목표 지점까지의 남은 거리
                        const remainingDist = Math.abs(animationFinalPosition - currentSlowY);
                        
                        // 현재 위치 기준으로 다음 숫자 항목의 중간 지점까지 도달 가능한지 확인
                        const currentOffset = currentSlowY - initialOffset;
                        const normalizedOffset = ((currentOffset % oneCycle) + oneCycle) % oneCycle;
                        const currentDigitIdx = Math.floor(normalizedOffset / itemHeight);
                        const nextDigitIdx = (currentDigitIdx + 1) % digitCount;
                        const nextDigitCenterOff = nextDigitIdx * itemHeight + (itemHeight / 2);
                        const distToNextDigitCenter = nextDigitCenterOff - normalizedOffset;
                        
                        // 목표 지점까지의 거리가 다음 숫자 중간 지점을 넘지 못하면 즉시 종료
                        // 이미 완료된 룰렛인 경우 처리하지 않음
                        if (remainingDist < distToNextDigitCenter && remainingDist < itemHeight * 0.3 && wheelCompletionFlags[index] !== true) {
                            clearInterval(slowCheckInterval);
                            wheelInner.classList.remove('spinning-slow');
                            wheelInner.style.transition = 'none';
                            wheelInner.style.transform = `translateY(${animationFinalPosition}px)`;
                            wheelInner.style.visibility = 'visible';
                            wheelInner.style.opacity = '1';
                            
                            // 즉시 최종 위치 처리
                            setTimeout(() => {
                                processWheelCompletion(wheelNum, index, animationDuration, finalDigits, wheelCompletionFlags, callback);
                            }, 50);
                        }
                        
                        // 최대 확인 횟수 제한 (느린 구간 시간의 2배)
                        if (slowCheckCount > (animationDuration * 0.1 / 100) * 2) {
                            clearInterval(slowCheckInterval);
                        }
                    }, 100);
                    
                    // 느린 구간이 끝나면 체크 인터벌 정리
                    setTimeout(() => {
                        clearInterval(slowCheckInterval);
                    }, animationDuration * 0.1 + 200);
                    
                    // 이 룰렛의 애니메이션이 완전히 종료된 후 최종 위치 처리
                    // 이미 완료되지 않은 경우에만 처리
                    setTimeout(() => {
                        if (wheelCompletionFlags[index] !== true) {
                            processWheelCompletion(wheelNum, index, animationDuration, finalDigits, wheelCompletionFlags, callback);
                        }
                    }, animationDuration * 0.1 + 100); // 느린 구간 시간 + 여유 시간
                }, animationDuration * 0.9); // 90% 지점에서 전환
            } else {
                // 일반 애니메이션: 일정한 속도로 회전 - 실제 거리로 스크롤
                // DOM 요소 존재 확인 및 보장
                if (!wheelInner || !wheelInner.parentElement) {
                    return;
                }
                
                wheelInner.classList.add('spinning');
                // 동적 애니메이션 시간 설정
                wheelInner.style.transition = `transform ${animationDuration}ms cubic-bezier(0.17, 0.67, 0.12, 0.99)`;
                
                // DOM 요소가 유지되도록 강제
                wheelInner.style.position = 'absolute';
                wheelInner.style.top = '0';
                wheelInner.style.left = '0';
                wheelInner.style.width = '100%';
                wheelInner.style.height = 'auto';
                // 애니메이션 중에는 실제 거리로 스크롤
                wheelInner.style.transform = `translateY(${animationFinalPosition}px)`;
                wheelInner.style.visibility = 'visible';
                wheelInner.style.opacity = '1';
                wheelInner.style.display = 'block';
                wheelInner.style.zIndex = '1';
                
                // 강제 리플로우로 DOM 상태 확인
                void wheelInner.offsetHeight;
                
                // 애니메이션 진행 중 주기적으로 확인하여 즉시 종료 가능 여부 체크
                let checkCount = 0;
                const checkInterval = setInterval(() => {
                    checkCount++;
                    
                    // DOM 요소 존재 확인
                    const currentElement = document.getElementById(`wheelInner${wheelNum}`);
                    if (!currentElement || !currentElement.parentElement) {
                        clearInterval(checkInterval);
                        return;
                    }
                    
                    const currentTransform = window.getComputedStyle(wheelInner).transform;
                    let checkY = 0;
                    if (currentTransform && currentTransform !== 'none') {
                        const matrix = currentTransform.match(/matrix.*\((.+)\)/);
                        if (matrix && matrix[1]) {
                            const values = matrix[1].split(',');
                            if (values.length >= 6) {
                                checkY = parseFloat(values[5]) || 0;
                            }
                        }
                    }
                    
                    // DOM 요소가 유지되도록 강제
                    wheelInner.style.position = 'absolute';
                    wheelInner.style.top = '0';
                    wheelInner.style.left = '0';
                    wheelInner.style.width = '100%';
                    wheelInner.style.visibility = 'visible';
                    wheelInner.style.opacity = '1';
                    wheelInner.style.display = 'block';
                    wheelInner.style.zIndex = '1';
                    
                    // 숫자 항목들도 보이도록 보장
                    const items = wheelInner.querySelectorAll('.wheel-item');
                    if (items.length > 0) {
                        items.forEach(item => {
                            item.style.visibility = 'visible';
                            item.style.opacity = '1';
                            item.style.display = 'flex';
                        });
                    }
                    
                    // 목표 지점까지 남은 거리 계산
                    const remainingDistance = Math.abs(animationFinalPosition - checkY);
                    const digitCount = availableDigits.length;
                    const oneCycle = digitCount * itemHeight;
                    
                    // 현재 위치 기준으로 다음 숫자 항목의 중간 지점까지 도달 가능한지 확인
                    const currentOffsetFromInitial = checkY - initialOffset;
                    const normalizedCurrentOffset = ((currentOffsetFromInitial % oneCycle) + oneCycle) % oneCycle;
                    const currentDigitIndex = Math.floor(normalizedCurrentOffset / itemHeight);
                    const nextDigitIndex = (currentDigitIndex + 1) % digitCount;
                    const nextDigitCenterOffset = nextDigitIndex * itemHeight + (itemHeight / 2);
                    const distanceToNextDigitCenter = nextDigitCenterOffset - normalizedCurrentOffset;
                    
                    // 목표 지점까지의 거리가 다음 숫자 중간 지점을 넘지 못하고, 매우 가까운 경우 즉시 종료
                    // 이미 완료된 룰렛인 경우 처리하지 않음
                    if (remainingDistance < distanceToNextDigitCenter && remainingDistance < itemHeight * 0.3 && wheelCompletionFlags[index] !== true) {
                        clearInterval(checkInterval);
                        const intervalIndex = wheelCheckIntervals.indexOf(checkInterval);
                        if (intervalIndex > -1) {
                            wheelCheckIntervals.splice(intervalIndex, 1);
                        }
                        
                        // 즉시 종료하고 최종 위치 처리
                        wheelInner.classList.remove('spinning');
                        wheelInner.style.transition = 'none';
                        wheelInner.style.transform = `translateY(${animationFinalPosition}px)`;
                        wheelInner.style.visibility = 'visible';
                        wheelInner.style.opacity = '1';
                        
                        // 즉시 최종 위치 처리
                        setTimeout(() => {
                            processWheelCompletion(wheelNum, index, animationDuration, finalDigits, wheelCompletionFlags, callback);
                        }, 50);
                        return;
                    }
                    
                    // 최대 확인 횟수 제한 (애니메이션 시간의 2배)
                    if (checkCount > (animationDuration / 100) * 2) {
                        clearInterval(checkInterval);
                        const intervalIndex = wheelCheckIntervals.indexOf(checkInterval);
                        if (intervalIndex > -1) {
                            wheelCheckIntervals.splice(intervalIndex, 1);
                        }
                    }
                }, 100);
                
                // 체크 인터벌을 전역 배열에 저장 (초기화 시 정리용)
                wheelCheckIntervals.push(checkInterval);
                
                setTimeout(() => {
                    clearInterval(checkInterval);
                    const intervalIndex = wheelCheckIntervals.indexOf(checkInterval);
                    if (intervalIndex > -1) {
                        wheelCheckIntervals.splice(intervalIndex, 1);
                    }
                    
                    // 이 룰렛의 애니메이션이 완전히 종료된 후 최종 위치 처리
                    // 이미 완료되지 않은 경우에만 처리
                    setTimeout(() => {
                        if (wheelCompletionFlags[index] !== true) {
                            processWheelCompletion(wheelNum, index, animationDuration, finalDigits, wheelCompletionFlags, callback);
                        }
                    }, animationDuration + 100); // 전체 애니메이션 시간 + 여유 시간
                }, animationDuration + 100); // 여유 시간 추가
            }
        }, index * 100);
    });
}

// 룰렛 회전 애니메이션 (기존 - 사용하지 않음)
function spinWheels(targetDigits, callback) {
    const wheels = [1, 2, 3];
    const animationDuration = 10000; // 10초
    const itemHeight = 40; // 각 숫자 항목의 높이
    
    wheels.forEach((wheelNum, index) => {
        const wheelInner = document.getElementById(`wheelInner${wheelNum}`);
        const targetDigit = targetDigits[index];
        const availableDigits = index === 0 ? lotteryDigits.hundreds : 
                                index === 1 ? lotteryDigits.tens : lotteryDigits.ones;
        
        // 현재 위치 가져오기
        const currentTransform = window.getComputedStyle(wheelInner).transform;
        let currentY = 0;
        if (currentTransform && currentTransform !== 'none') {
            const matrix = currentTransform.match(/matrix.*\((.+)\)/);
            if (matrix && matrix[1]) {
                const values = matrix[1].split(',');
                if (values.length >= 6) {
                    currentY = parseFloat(values[5]) || 0;
                }
            }
        }
        
        // 목표 숫자의 인덱스 찾기
        const targetIndex = availableDigits.indexOf(targetDigit);
        if (targetIndex === -1) {
            console.error(`목표 숫자 ${targetDigit}가 ${availableDigits}에 없습니다.`);
            return;
        }
        
        // 중앙 위치 계산 (200px 높이의 룰렛에서 중앙은 100px, 즉 2.5개 항목)
        const centerOffset = -(itemHeight * 2.5);
        
        // 목표 숫자가 중앙에 오도록 하는 최종 위치 계산
        // 첫 번째 반복 세트의 목표 숫자 위치
        const targetPositionInFirstSet = -(targetIndex * itemHeight);
        const finalPosition = targetPositionInFirstSet + centerOffset;
        
        // 회전할 총 거리 계산 (여러 바퀴 + 목표 위치까지)
        const spins = 5 + Math.random() * 3; // 5-8바퀴 추가 회전
        const oneCycle = availableDigits.length * itemHeight;
        const totalSpinDistance = spins * oneCycle;
        
        // 회전할 총 거리 계산 (여러 바퀴 + 목표 위치까지)
        // translateY 설명:
        // - 음수값이 증가하면 (예: -100 -> -200) 요소가 위로 이동 (숫자가 위로 올라감)
        // - 룰렛이 아래로 회전 = 숫자가 위로 올라감 = translateY가 더 음수가 됨
        
        // 목표: currentY에서 시작 -> 아래로 spins만큼 회전 -> finalPosition에 정확히 도달
        // 아래로 회전하면 translateY가 totalSpinDistance만큼 더 음수가 됨
        // 따라서: currentY - totalSpinDistance = finalPosition
        // 즉, totalDistance = currentY - totalSpinDistance
        
        // 하지만 애니메이션은 currentY에서 totalDistance로 이동하므로:
        // totalDistance = currentY - totalSpinDistance
        // 이렇게 하면 currentY에서 시작해서 아래로 totalSpinDistance만큼 회전 후 finalPosition에 도달
        
        // 하지만 실제로는 currentY가 항상 finalPosition + totalSpinDistance가 아닐 수 있으므로
        // 목표 위치를 기준으로 계산: finalPosition에서 위로 totalSpinDistance만큼 떨어진 위치에서 시작
        // 즉: totalDistance = finalPosition - totalSpinDistance (아래로 회전)
        // 하지만 이건 finalPosition에서 위로 totalSpinDistance만큼 떨어진 위치
        
        // 정확한 계산: 목표 위치에 정확히 도달하도록 회전 애니메이션 구현
        // translateY는 위로 올라가면 더 음수가 됨 (예: -100 -> -200)
        // 룰렛이 아래로 회전 = 숫자가 위로 올라감 = translateY가 더 음수가 됨
        
        // 목표: 여러 바퀴 회전 후 finalPosition에 정확히 도달
        // 시작 위치를 finalPosition에서 위로 totalSpinDistance만큼 떨어진 위치로 설정
        // 아래로 totalSpinDistance만큼 회전하면 finalPosition에 도달
        const startPosition = finalPosition - totalSpinDistance;
        
        // 현재 위치를 즉시 조정 (애니메이션 없이)
        wheelInner.style.transition = 'none';
        wheelInner.style.transform = `translateY(${startPosition}px)`;
        
        // 강제 리플로우
        void wheelInner.offsetHeight;
        
        // 애니메이션 클래스 추가
        wheelInner.classList.add('spinning');
        
        // 약간의 지연을 두고 각 룰렛을 순차적으로 시작 (더 역동적인 효과)
        setTimeout(() => {
            // CSS transition을 다시 활성화 (인라인 스타일 제거하여 CSS 클래스의 transition 사용)
            wheelInner.style.transition = '';
            wheelInner.style.transform = `translateY(${finalPosition}px)`;
        }, index * 100);
    });
    
    // 모든 룰렛이 멈춘 후 콜백 실행
    setTimeout(() => {
        wheels.forEach((wheelNum, index) => {
            const wheelInner = document.getElementById(`wheelInner${wheelNum}`);
            const targetDigit = targetDigits[index];
            const availableDigits = index === 0 ? lotteryDigits.hundreds : 
                                    index === 1 ? lotteryDigits.tens : lotteryDigits.ones;
            
            wheelInner.classList.remove('spinning');
            
            // 최종 위치 정확히 조정 (애니메이션 완료 후 재계산)
            const targetIndex = availableDigits.indexOf(targetDigit);
            if (targetIndex === -1) {
                console.error(`목표 숫자 ${targetDigit}를 찾을 수 없습니다.`);
                return;
            }
            
            const itemHeight = 40;
            const centerOffset = -(itemHeight * 2.5);
            const targetPositionInFirstSet = -(targetIndex * itemHeight);
            const finalPosition = targetPositionInFirstSet + centerOffset;
            
            // 정확한 위치로 재조정 (transition 없이 즉시)
            wheelInner.style.transition = 'none';
            wheelInner.style.transform = `translateY(${finalPosition}px)`;
            
            // 강제 리플로우 후 다시 transition 활성화
            void wheelInner.offsetHeight;
            
            // 선택된 숫자 강조 및 반전 효과
            setTimeout(() => {
                // 모든 항목에서 selected 클래스 제거 및 스타일 초기화
                wheelInner.querySelectorAll('.wheel-item').forEach(item => {
                    item.classList.remove('selected');
                    // 스타일 초기화
                    item.style.background = '';
                    item.style.color = '';
                    item.style.opacity = '';
                });
                
                // 중앙에 있는 항목 찾기 (정확한 위치 계산)
                const wheelRect = wheelInner.parentElement.getBoundingClientRect();
                const centerY = wheelRect.top + wheelRect.height / 2;
                
                const items = wheelInner.querySelectorAll(`.wheel-item[data-digit="${targetDigit}"]`);
                let closestItem = null;
                let closestDistance = Infinity;
                
                items.forEach(item => {
                    const rect = item.getBoundingClientRect();
                    const itemCenterY = rect.top + rect.height / 2;
                    const distance = Math.abs(itemCenterY - centerY);
                    
                    if (distance < closestDistance) {
                        closestDistance = distance;
                        closestItem = item;
                    }
                });
                
                // 중앙에 가장 가까운 항목에 selected 클래스 추가 및 반전 효과 적용
                if (closestItem && closestDistance < itemHeight / 2) {
                    closestItem.classList.add('selected');
                    
                    // 추가 반전 효과: 모든 같은 숫자 항목도 강조
                    items.forEach(item => {
                        if (item !== closestItem) {
                            // 중앙이 아닌 같은 숫자 항목도 약간의 강조
                            item.style.opacity = '0.6';
                        }
                    });
                }
            }, 100);
        });
        
        if (callback) callback();
    }, animationDuration + 200);
}

// 사용자 목록 로드
async function loadUsers() {
    try {
        const response = await fetch(`/api/admin/users`);
        const data = await response.json();

        if (data.success) {
            const tbody = document.getElementById('usersTableBody');
            tbody.innerHTML = data.users.map(user => `
                <tr>
                    <td>${user.empno}</td>
                    <td>${user.empname}</td>
                    <td>${user.deptname || '-'}</td>
                    <td>${user.posname || '-'}</td>
                    <td>${user.booth_count || 0}</td>
                    <td>${user.prize_claimed ? '지급완료' : '-'}</td>
                </tr>
            `).join('');
        }
    } catch (error) {
        console.error('사용자 목록 로드 오류:', error);
    }
}

// 부스 참여 목록 로드
async function loadBoothParticipations() {
    try {
        const response = await fetch(`/api/admin/booth-participations`);
        const data = await response.json();

        if (data.success) {
            const tbody = document.getElementById('boothsTableBody');
            tbody.innerHTML = data.participations.map(p => {
                let locationText = '-';
                let locationLink = '';
                
                if (p.latitude && p.longitude) {
                    const lat = parseFloat(p.latitude).toFixed(6);
                    const lng = parseFloat(p.longitude).toFixed(6);
                    locationText = `${lat}, ${lng}`;
                    // Google Maps 링크 생성
                    locationLink = `<a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" class="btn btn-sm btn-outline-primary" title="지도에서 보기">지도</a>`;
                }
                
                return `
                    <tr>
                        <td>${p.empname}</td>
                        <td>${p.deptname || '-'}</td>
                        <td>${p.posname || '-'}</td>
                        <td>${p.booth_code}</td>
                        <td>${new Date(p.scanned_at).toLocaleString()}</td>
                        <td>${locationText}</td>
                        <td>${locationLink}</td>
                        <td>
                            <button class="btn btn-sm btn-danger" onclick="deleteBoothParticipation(${p.participation_id}, '${p.empname}', '${p.booth_code}')">
                                삭제
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    } catch (error) {
        console.error('부스 참여 목록 로드 오류:', error);
    }
}

// 모바일상품권 추첨 자격자 목록 로드
async function loadPrizeEligible() {
    try {
        const response = await fetch(`/api/admin/prize-eligible`);
        const data = await response.json();

        if (data.success) {
            const tbody = document.getElementById('prizeEligibleTableBody');
            if (data.eligible && data.eligible.length > 0) {
                tbody.innerHTML = data.eligible.map(user => {
                    const boothCodes = user.booth_codes ? user.booth_codes.split(', ').join(', ') : '-';
                    return `
                        <tr>
                            <td>${user.empname || '-'}</td>
                            <td>${user.empno || '-'}</td>
                            <td>${user.deptname || '-'}</td>
                            <td>${user.posname || '-'}</td>
                            <td><strong>${user.booth_count || 0}</strong></td>
                            <td>${boothCodes}</td>
                            <td>
                                <button class="btn btn-sm btn-danger" onclick="deletePrizeEligible(${user.id}, '${(user.empname || '').replace(/'/g, "\\'")}')">
                                    삭제
                                </button>
                            </td>
                        </tr>
                    `;
                }).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center">추첨 자격자가 없습니다.</td></tr>';
            }
        }
    } catch (error) {
        const tbody = document.getElementById('prizeEligibleTableBody');
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">데이터 로드 중 오류가 발생했습니다.</td></tr>';
    }
}

// 경품 지급 목록 로드 (탭에서 표시 - 추첨 자격자 목록)
async function loadPrizeClaims() {
    try {
        // 추첨 자격자 목록을 표시
        const response = await fetch(`/api/admin/prize-eligible`);
        const data = await response.json();

        if (data.success) {
            const tbody = document.getElementById('prizesTableBody');
            if (data.eligible && data.eligible.length > 0) {
                tbody.innerHTML = data.eligible.map(user => {
                    const boothCodes = user.booth_codes ? user.booth_codes.split(', ').join(', ') : '-';
                    return `
                        <tr>
                            <td>${user.empname || '-'}</td>
                            <td>${user.empno || '-'}</td>
                            <td>${user.deptname || '-'}</td>
                            <td>${user.posname || '-'}</td>
                            <td><strong>${user.booth_count || 0}</strong></td>
                            <td>${boothCodes}</td>
                            <td>
                                <button class="btn btn-sm btn-danger" onclick="deletePrizeEligible(${user.id}, '${(user.empname || '').replace(/'/g, "\\'")}')">
                                    삭제
                                </button>
                            </td>
                        </tr>
                    `;
                }).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center">추첨 자격자가 없습니다.</td></tr>';
            }
        }
    } catch (error) {
        const tbody = document.getElementById('prizesTableBody');
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">데이터 로드 중 오류가 발생했습니다.</td></tr>';
    }
}

// 부스 참여 삭제 함수
async function deleteBoothParticipation(participationId, empname, boothCode) {
    if (typeof showConfirmModal === 'function') {
        showConfirmModal(
            '부스 참여 삭제',
            `"${empname}"님의 "${boothCode}" 부스 참여를 삭제(사용안함) 처리하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`,
            async () => {
                try {
                    const response = await fetch('/api/admin/booth-participation/delete', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ participationId })
                    });

                    const data = await response.json();

                    if (data.success) {
                        let message = data.message;
                        if (data.qualificationLost) {
                            message += `\n\n⚠️ "${data.userName}"님의 부스 참여가 ${data.currentCount}개로 줄어 모바일상품권 추첨 자격이 상실되었습니다.`;
                        }

                        if (typeof showModal === 'function') {
                            showModal('삭제 완료', message, () => {
                                loadBoothParticipations();
                                loadPrizeEligible();
                                loadPrizeClaims();
                            });
                        } else {
                            alert(message);
                            loadBoothParticipations();
                            loadPrizeEligible();
                            loadPrizeClaims();
                        }
                    } else {
                        if (typeof showModal === 'function') {
                            showModal('오류', data.message || '부스 참여 삭제 중 오류가 발생했습니다.');
                        } else {
                            alert(data.message || '부스 참여 삭제 중 오류가 발생했습니다.');
                        }
                    }
                } catch (error) {
                    console.error('부스 참여 삭제 오류:', error);
                    if (typeof showModal === 'function') {
                        showModal('오류', '네트워크 오류가 발생했습니다. 다시 시도해주세요.');
                    } else {
                        alert('네트워크 오류가 발생했습니다. 다시 시도해주세요.');
                    }
                }
            },
            () => {
                // 취소 처리 없음
            }
        );
    } else if (confirm(`"${empname}"님의 "${boothCode}" 부스 참여를 삭제(사용안함) 처리하시겠습니까?`)) {
        try {
            const response = await fetch('/api/admin/booth-participation/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ participationId })
            });

            const data = await response.json();

            if (data.success) {
                alert(data.message);
                loadBoothParticipations();
                loadPrizeEligible();
                loadPrizeClaims();
            } else {
                alert(data.message || '부스 참여 삭제 중 오류가 발생했습니다.');
            }
        } catch (error) {
            console.error('부스 참여 삭제 오류:', error);
            alert('네트워크 오류가 발생했습니다. 다시 시도해주세요.');
        }
    }
}

// 모바일상품권 추첨대상 삭제 함수
async function deletePrizeEligible(userId, empname) {
    if (typeof showConfirmModal === 'function') {
        showConfirmModal(
            '추첨대상 삭제',
            `"${empname}"님을 모바일상품권 추첨대상에서 삭제하시겠습니까?\n\n이 작업은 해당 사용자의 모든 부스 참여 기록을 삭제(사용안함) 처리하며, 되돌릴 수 없습니다.`,
            async () => {
                try {
                    const response = await fetch('/api/admin/prize-eligible/delete', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ userId })
                    });

                    const data = await response.json();

                    if (data.success) {
                        if (typeof showModal === 'function') {
                            showModal('삭제 완료', data.message, () => {
                                loadBoothParticipations();
                                loadPrizeEligible();
                                loadPrizeClaims();
                            });
                        } else {
                            alert(data.message);
                            loadBoothParticipations();
                            loadPrizeEligible();
                            loadPrizeClaims();
                        }
                    } else {
                        if (typeof showModal === 'function') {
                            showModal('오류', data.message || '추첨대상 삭제 중 오류가 발생했습니다.');
                        } else {
                            alert(data.message || '추첨대상 삭제 중 오류가 발생했습니다.');
                        }
                    }
                } catch (error) {
                    console.error('추첨대상 삭제 오류:', error);
                    if (typeof showModal === 'function') {
                        showModal('오류', '네트워크 오류가 발생했습니다. 다시 시도해주세요.');
                    } else {
                        alert('네트워크 오류가 발생했습니다. 다시 시도해주세요.');
                    }
                }
            },
            () => {
                // 취소 처리 없음
            }
        );
    } else if (confirm(`"${empname}"님을 모바일상품권 추첨대상에서 삭제하시겠습니까?\n\n이 작업은 해당 사용자의 모든 부스 참여 기록을 삭제(사용안함) 처리합니다.`)) {
        try {
            const response = await fetch('/api/admin/prize-eligible/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ userId })
            });

            const data = await response.json();

            if (data.success) {
                alert(data.message);
                loadBoothParticipations();
                loadPrizeEligible();
                loadPrizeClaims();
            } else {
                alert(data.message || '추첨대상 삭제 중 오류가 발생했습니다.');
            }
        } catch (error) {
            console.error('추첨대상 삭제 오류:', error);
            alert('네트워크 오류가 발생했습니다. 다시 시도해주세요.');
        }
    }
}

// 설문 응답 로드 (5점 척도 통합 설문)
async function loadSurveys() {
    try {
        const response = await fetch(`/api/admin/surveys`);
        const data = await response.json();

        if (data.success && data.allSurveys) {
            const tbody = document.getElementById('surveysTableBody');
            
            // 5점 척도 설문이 있는 경우
            const newSurveys = data.allSurveys.filter(s => 
                s.overall_satisfaction !== undefined && s.overall_satisfaction !== null
            );
            
            // 기존 세션별 설문이 있는 경우 (하위 호환성)
            const oldSurveys = data.allSurveys.filter(s => 
                s.lecture_satisfaction !== undefined && s.lecture_satisfaction !== null
            );
            
            if (newSurveys.length > 0) {
                // 5점 척도 통합 설문 표시
                tbody.innerHTML = newSurveys.map(survey => {
                    const date = new Date(survey.submitted_at).toLocaleString('ko-KR');
                    return `
                        <tr>
                            <td>${date}</td>
                            <td>${survey.overall_satisfaction || '-'}</td>
                            <td>${survey.booth_satisfaction || '-'}</td>
                            <td>${survey.session_satisfaction || '-'}</td>
                            <td>${survey.website_satisfaction || '-'}</td>
                            <td>${survey.prize_satisfaction || '-'}</td>
                            <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis;">${survey.satisfied_points || '-'}</td>
                            <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis;">${survey.improvement_points || '-'}</td>
                        </tr>
                    `;
                }).join('');
            } else if (oldSurveys.length > 0) {
                // 기존 세션별 설문 표시 (하위 호환성)
                tbody.innerHTML = oldSurveys.map(survey => {
                    const date = new Date(survey.submitted_at).toLocaleString('ko-KR');
                    return `
                        <tr>
                            <td>${survey.session_name || survey.session_id || '-'}</td>
                            <td>${survey.lecture_satisfaction || '-'}</td>
                            <td>${survey.instructor_satisfaction || '-'}</td>
                            <td>${survey.application_score || '-'}</td>
                            <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis;">${survey.satisfied_points || '-'}</td>
                            <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis;">${survey.improvement_points || '-'}</td>
                            <td>${date}</td>
                        </tr>
                    `;
                }).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center">설문 응답이 없습니다.</td></tr>';
            }
        }
    } catch (error) {
        console.error('설문 응답 로드 오류:', error);
    }
}

// 로그아웃
function logout() {
    adminAuthenticated = false;
    removeAdminToken();
    document.getElementById('loginSection').style.display = 'block';
    document.getElementById('dashboardSection').style.display = 'none';
    document.getElementById('adminLoginForm').reset();
}

// 로그 로드
let currentLogPage = 1;

async function loadLogs() {
    const startDate = document.getElementById('logStartDate').value;
    const endDate = document.getElementById('logEndDate').value;
    const path = document.getElementById('logPath').value;
    const ipAddress = document.getElementById('logIP').value;

    const params = new URLSearchParams({
        page: currentLogPage,
        limit: 50
    });

    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (path) params.append('path', path);
    if (ipAddress) params.append('ipAddress', ipAddress);

    try {
        const response = await fetch(`/api/logs?${params}`);
        const data = await response.json();

        if (data.success) {
            const tbody = document.getElementById('logsTableBody');
            tbody.innerHTML = data.logs.map(log => {
                const timestamp = new Date(log.timestamp).toLocaleString('ko-KR');
                const responseTime = log.response_time_ms ? `${log.response_time_ms}ms` : '-';
                const statusClass = log.status_code >= 400 ? 'text-danger' : 
                                   log.status_code >= 300 ? 'text-warning' : 'text-success';
                
                // 사용자 정보 포맷팅
                let userInfo = '-';
                if (log.user_empno) {
                    const parts = [];
                    if (log.user_empname) parts.push(log.user_empname);
                    if (log.user_posname) parts.push(log.user_posname);
                    if (log.user_deptname) parts.push(`(${log.user_deptname})`);
                    if (parts.length > 0) {
                        userInfo = `${log.user_empno}<br><small class="text-muted">${parts.join(' ')}</small>`;
                    } else {
                        userInfo = log.user_empno;
                    }
                }
                
                // IP 주소 표시
                const ipAddress = log.ip_address || '-';
                
                return `
                    <tr>
                        <td>${timestamp}</td>
                        <td><code>${ipAddress}</code></td>
                        <td>${log.method}</td>
                        <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis;">${log.path}</td>
                        <td class="${statusClass}">${log.status_code}</td>
                        <td>${userInfo}</td>
                        <td>${responseTime}</td>
                    </tr>
                `;
            }).join('');

            // 페이지네이션
            const paginationDiv = document.getElementById('logsPagination');
            if (data.pagination.totalPages > 1) {
                let paginationHTML = '<nav><ul class="pagination justify-content-center">';
                
                if (data.pagination.page > 1) {
                    paginationHTML += `<li class="page-item"><a class="page-link" href="#" onclick="changeLogPage(${data.pagination.page - 1}); return false;">이전</a></li>`;
                }
                
                paginationHTML += `<li class="page-item active"><span class="page-link">${data.pagination.page} / ${data.pagination.totalPages}</span></li>`;
                
                if (data.pagination.page < data.pagination.totalPages) {
                    paginationHTML += `<li class="page-item"><a class="page-link" href="#" onclick="changeLogPage(${data.pagination.page + 1}); return false;">다음</a></li>`;
                }
                
                paginationHTML += '</ul></nav>';
                paginationDiv.innerHTML = paginationHTML;
            } else {
                paginationDiv.innerHTML = '';
            }
        }
    } catch (error) {
        console.error('로그 조회 오류:', error);
    }
}

function changeLogPage(page) {
    currentLogPage = page;
    loadLogs();
}

// 페이지 로드 시
document.addEventListener('DOMContentLoaded', async () => {
    // 폼 제출 이벤트
    document.getElementById('adminLoginForm').addEventListener('submit', (e) => {
        e.preventDefault();
        adminLogin();
    });
    
    // 저장된 관리자 토큰 확인하여 자동 로그인
    const admin = await checkAdminAuth();
    if (admin) {
        adminAuthenticated = true;
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('dashboardSection').style.display = 'block';
        loadDashboard();
    }
});

