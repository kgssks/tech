
let ws = null;
let userId = null;

// QR 스캔 제출 (전역 함수로 노출 - 먼저 선언)
window.submitQRScan = async function(encryptedData) {
    const token = getToken();
    if (!token) return;

    try {
        const response = await fetch(`/api/booth/scan`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'kb-auth': `Bearer ${token}`
            },
            body: JSON.stringify({ encryptedData })
        });

        const data = await response.json();
        
        if (data.success) {
            if (data.alreadyParticipated) {
                alert('이미 참여한 부스입니다.');
            } else {
                alert('부스 참여가 완료되었습니다!');
                loadParticipationStatus();
            }
        } else {
            alert(data.message || 'QR 코드 처리 중 오류가 발생했습니다.');
        }
    } catch (error) {
        console.error('QR 스캔 오류:', error);
        alert('네트워크 오류가 발생했습니다. 다시 시도해주세요.');
    }
};

// 페이지 로드 시 초기화 및 인증 확인
document.addEventListener('DOMContentLoaded', async () => {
    const authCheckMessage = document.getElementById('authCheckMessage');
    
    // 먼저 인증 확인
    const token = getToken();
    if (!token) {
        if (authCheckMessage) {
            authCheckMessage.style.display = 'block';
            authCheckMessage.textContent = '인증이 필요합니다. 잠시 후 인증 페이지로 이동합니다...';
        }
        setTimeout(() => {
            window.location.href = '/app/event/auth.html';
        }, 1500);
        return;
    }

    // 토큰 유효성 검증
    const user = await checkAuth();
    if (!user) {
        removeToken();
        if (authCheckMessage) {
            authCheckMessage.style.display = 'block';
            authCheckMessage.textContent = '인증이 만료되었습니다. 잠시 후 인증 페이지로 이동합니다...';
        }
        setTimeout(() => {
            alert('인증이 만료되었습니다. 다시 로그인해주세요.');
            window.location.href = '/app/event/auth.html';
        }, 1500);
        return;
    }

    // 인증 확인 메시지 숨기기
    if (authCheckMessage) {
        authCheckMessage.style.display = 'none';
    }

    // 인증된 사용자만 데이터 로드
    await loadUserData();
    await loadParticipationStatus();
    await loadLotteryNumber();
    displayParticipantInfo();
});

// 이벤트 페이지 참가자 정보 표시 (본문 섹션에 표시)
async function displayParticipantInfo() {
    const user = await checkAuth();
    const participantInfoSection = document.getElementById('participantInfo');
    const eventUserName = document.getElementById('eventUserName');
    const eventUserDept = document.getElementById('eventUserDept');
    
    if (user && participantInfoSection) {
        if (eventUserName) eventUserName.textContent = `${user.empname} ${user.posname}`;
        if (eventUserDept) eventUserDept.textContent = user.deptname;
        participantInfoSection.style.display = 'block';
    } else if (participantInfoSection) {
        participantInfoSection.style.display = 'none';
    }
}

// 사용자 데이터 로드
async function loadUserData() {
    const token = getToken();
    if (!token) {
        window.location.href = '/app/event/auth.html';
        return;
    }

    try {
        const response = await fetch(`/api/data/user`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'kb-auth': `Bearer ${token}`
            }
        });

        const data = await response.json();
        if (data.success) {
            userId = data.user.empno;
        } else {
            // 인증 실패 시 토큰 삭제하고 인증 페이지로 이동
            removeToken();
            alert('인증이 만료되었습니다. 다시 로그인해주세요.');
            window.location.href = '/app/event/auth.html';
        }
    } catch (error) {
        console.error('사용자 데이터 로드 오류:', error);
        removeToken();
        alert('네트워크 오류가 발생했습니다. 다시 시도해주세요.');
        window.location.href = '/app/event/auth.html';
    }
}

// 참여 현황 로드
async function loadParticipationStatus() {
    const token = getToken();
    if (!token) return;

    try {
        const response = await fetch(`/api/booth/participation`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'kb-auth': `Bearer ${token}`
            }
        });

        const data = await response.json();
        if (data.success) {
            updateStamps(data.participations);
            document.getElementById('stampCountValue').textContent = data.count;

            if (data.eligible) {
                document.getElementById('prizeQRSection').style.display = 'block';
            }
        }
    } catch (error) {
        console.error('참여 현황 로드 오류:', error);
    }
}

// 스탬프 업데이트
function updateStamps(participations) {
    const stamps = ['stamp1', 'stamp2', 'stamp3'];
    stamps.forEach((stampId, index) => {
        const stampElement = document.getElementById(stampId);
        if (index < participations.length) {
            stampElement.classList.add('active');
        } else {
            stampElement.classList.remove('active');
        }
    });
}

// QR 스캔 모달 관련 변수
let qrScanner = null;
let qrScannerModal = null;

// QR 스캔 모달 생성
function createQRScannerModal() {
    if (qrScannerModal) return qrScannerModal;
    
    const modal = document.createElement('div');
    modal.id = 'qrScannerModal';
    modal.className = 'modal fade';
    modal.setAttribute('tabindex', '-1');
    modal.setAttribute('aria-labelledby', 'qrScannerModalLabel');
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="qrScannerModalLabel">QR 코드 스캔</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <div id="qr-reader" style="width: 100%;"></div>
                    <div id="qr-reader-results" class="mt-3"></div>
                    <div class="text-center mt-3">
                        <button type="button" class="btn btn-secondary" onclick="stopQRScan()">스캔 중지</button>
                        <button type="button" class="btn btn-outline-primary" onclick="manualQRInput()">수동 입력</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    qrScannerModal = new bootstrap.Modal(modal);
    
    // 모달이 닫힐 때 스캔 중지
    modal.addEventListener('hidden.bs.modal', () => {
        stopQRScan();
    });
    
    return qrScannerModal;
}

// QR 스캔 시작
async function scanQR() {
    // 모바일 기기 확인
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile && typeof Html5Qrcode !== 'undefined') {
        // 모바일: 카메라를 사용한 QR 스캔
        startMobileQRScan();
    } else {
        // 데스크톱: 수동 입력 또는 카메라 사용 시도
        if (typeof Html5Qrcode !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            startMobileQRScan();
        } else {
            // 폴백: 수동 입력
            manualQRInput();
        }
    }
}

// 모바일 QR 스캔 시작
async function startMobileQRScan() {
    const modal = createQRScannerModal();
    const qrReaderDiv = document.getElementById('qr-reader');
    const qrResultsDiv = document.getElementById('qr-reader-results');
    
    if (!qrReaderDiv) return;
    
    try {
        qrScanner = new Html5Qrcode("qr-reader");
        
        // 후방 카메라 우선 선택 (모바일)
        const facingMode = { facingMode: "environment" }; // 후방 카메라
        
        await qrScanner.start(
            facingMode,
            {
                fps: 10,
                qrbox: { width: 250, height: 250 },
                aspectRatio: 1.0
            },
            (decodedText, decodedResult) => {
                // QR 코드 스캔 성공
                handleQRScanResult(decodedText);
                stopQRScan();
                modal.hide();
            },
            (errorMessage) => {
                // 스캔 중 오류 (무시)
            }
        );
        
        modal.show();
        qrResultsDiv.innerHTML = '<p class="text-muted">QR 코드를 카메라에 맞춰주세요.</p>';
    } catch (error) {
        console.error('QR 스캔 시작 오류:', error);
        qrResultsDiv.innerHTML = `<div class="alert alert-warning">카메라 접근 권한이 필요합니다. 또는 수동 입력을 사용해주세요.</div>`;
        
        // 폴백: 수동 입력
        setTimeout(() => {
            if (confirm('카메라를 사용할 수 없습니다. 수동 입력으로 진행하시겠습니까?')) {
                stopQRScan();
                modal.hide();
                manualQRInput();
            }
        }, 2000);
    }
}

// QR 스캔 중지
function stopQRScan() {
    if (qrScanner) {
        qrScanner.stop().then(() => {
            qrScanner.clear();
            qrScanner = null;
        }).catch((err) => {
            console.error('QR 스캔 중지 오류:', err);
            qrScanner = null;
        });
    }
}

// 수동 QR 입력
function manualQRInput() {
    const url = prompt('QR 코드를 스캔하여 URL을 입력하거나 붙여넣으세요:');
    if (!url) return;

    try {
        // URL에서 data 파라미터 추출
        const urlObj = new URL(url);
        const urlParams = new URLSearchParams(urlObj.search);
        const encryptedData = urlParams.get('data');

        if (!encryptedData) {
            alert('유효하지 않은 QR 코드입니다.');
            return;
        }

        window.submitQRScan(encryptedData);
    } catch (error) {
        // URL 파싱 실패 시 직접 입력된 데이터로 간주
        window.submitQRScan(url);
    }
}

// QR 스캔 결과 처리
function handleQRScanResult(decodedText) {
    try {
        // URL에서 data 파라미터 추출
        const urlObj = new URL(decodedText);
        const urlParams = new URLSearchParams(urlObj.search);
        const encryptedData = urlParams.get('data');

        if (encryptedData) {
            window.submitQRScan(encryptedData);
        } else {
            // URL이 아닌 경우 직접 데이터로 간주
            window.submitQRScan(decodedText);
        }
    } catch (error) {
        // URL 파싱 실패 시 직접 입력된 데이터로 간주
        window.submitQRScan(decodedText);
    }
}

// 추첨상품 안내 모달 표시
function showPrizeInfo() {
    const modal = new bootstrap.Modal(document.getElementById('prizeInfoModal'));
    modal.show();
}

// 전역 함수로 노출
window.scanQR = scanQR;
window.stopQRScan = stopQRScan;
window.manualQRInput = manualQRInput;
window.showPrizeInfo = showPrizeInfo;

// 경품 수령용 QR 생성
// 경품 QR 생성 함수 제거됨 (모바일상품 추첨권은 안내 문구만 표시)
// WebSocket 연결 함수 제거됨 (교환 절차 제거)

// 경품 추첨 번호 로드
async function loadLotteryNumber() {
    const token = getToken();
    if (!token) return;

    try {
        const response = await fetch(`/api/data/lottery-number`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'kb-auth': `Bearer ${token}`
            }
        });

        const data = await response.json();
        if (data.success && data.lotteryNumber) {
            document.getElementById('lotteryNumber').textContent = data.lotteryNumber;
        }
    } catch (error) {
        console.error('추첨 번호 로드 오류:', error);
    }
}

