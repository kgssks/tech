
let ws = null;
let userId = null;
let currentQRScanMode = 'booth';

const LOTTERY_EVENT_DAY = '2025-11-28';
const lotteryDateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
});

function isLotteryEventDay() {
    try {
        const todayInKorea = lotteryDateFormatter.format(new Date());
        return todayInKorea === LOTTERY_EVENT_DAY;
    } catch (error) {
        console.warn('행사일 판별 중 오류:', error);
        return false;
    }
}

function showMessageBox(title, message) {
    if (typeof showModal === 'function') {
        showModal(title, message);
        return;
    }

    let box = document.getElementById('eventInlineMessage');
    if (!box) {
        box = document.createElement('div');
        box.id = 'eventInlineMessage';
        box.style.position = 'fixed';
        box.style.top = '20px';
        box.style.left = '50%';
        box.style.transform = 'translateX(-50%)';
        box.style.zIndex = '1050';
        box.style.background = 'rgba(255,255,255,0.95)';
        box.style.border = '1px solid var(--kb-primary)';
        box.style.borderRadius = '12px';
        box.style.padding = '1rem 1.5rem';
        box.style.boxShadow = '0 12px 30px rgba(0,0,0,0.2)';
        box.style.maxWidth = '90%';
        box.style.fontFamily = "KBFGText, 'Noto Sans KR', sans-serif";
        document.body.appendChild(box);
    }

    box.innerHTML = `
        <strong style="display:block; font-size:1.1rem; margin-bottom:0.5rem; color: var(--kb-primary);">
            ${title}
        </strong>
        <span style="color: var(--kb-gray); font-size: 0.95rem; line-height: 1.5;">
            ${message}
        </span>
    `;
    box.style.display = 'block';

    clearTimeout(box._hideTimer);
    box._hideTimer = setTimeout(() => {
        box.style.display = 'none';
    }, 4000);
}

// GPS 정보 수집 함수
function getGPSLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('GPS 기능을 지원하지 않는 기기입니다.'));
            return;
        }

        const options = {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        };

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                });
            },
            (error) => {
                let errorMessage = 'GPS 정보를 가져올 수 없습니다.';
                switch(error.code) {
                    case error.PERMISSION_DENIED:
                        errorMessage = 'GPS 사용 권한이 거부되었습니다.';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errorMessage = 'GPS 위치 정보를 사용할 수 없습니다.';
                        break;
                    case error.TIMEOUT:
                        errorMessage = 'GPS 정보 요청 시간이 초과되었습니다.';
                        break;
                }
                reject(new Error(errorMessage));
            },
            options
        );
    });
}

// GPS 정보 요청 및 권한 확인 모달
async function requestGPSWithPermission() {
    return new Promise((resolve) => {
        if (typeof showConfirmModal === 'function') {
            showConfirmModal(
                '위치 정보 필요',
                '부스 참여 확인을 위해 위치 정보(GPS)가 필요합니다.\n\n위치 정보 사용 권한을 허용해주세요.',
                async () => {
                    try {
                        const location = await getGPSLocation();
                        resolve(location);
                    } catch (error) {
                        // 재시도 요청
                        if (typeof showConfirmModal === 'function') {
                            showConfirmModal(
                                '위치 정보 필요',
                                `${error.message}\n\n부스 참여를 위해 위치 정보가 필수입니다. 다시 시도하시겠습니까?`,
                                async () => {
                                    try {
                                        const location = await getGPSLocation();
                                        resolve(location);
                                    } catch (retryError) {
                                        if (typeof showModal === 'function') {
                                            showModal('위치 정보 오류', '위치 정보를 가져올 수 없어 부스 참여가 제한될 수 있습니다.\n\n설정에서 위치 정보 권한을 허용해주세요.');
                                        }
                                        resolve(null);
                                    }
                                },
                                () => {
                                    if (typeof showModal === 'function') {
                                        showModal('알림', '위치 정보 없이 부스 참여가 진행됩니다.');
                                    }
                                    resolve(null);
                                }
                            );
                        } else {
                            resolve(null);
                        }
                    }
                },
                () => {
                    if (typeof showModal === 'function') {
                        showModal('알림', '위치 정보 없이 부스 참여가 진행됩니다.');
                    }
                    resolve(null);
                }
            );
        } else {
            // showConfirmModal이 없는 경우 직접 시도
            getGPSLocation().then(resolve).catch(() => resolve(null));
        }
    });
}

// QR 스캔 제출 (전역 함수로 노출 - 먼저 선언)
window.submitQRScan = async function(encryptedData) {
    const token = getToken();
    if (!token) return;

    // GPS 정보 수집
    let location = null;
    try {
        location = await requestGPSWithPermission();
    } catch (error) {
        console.error('GPS 정보 수집 오류:', error);
    }

    try {
        const requestBody = {
            encryptedData
        };
        
        // GPS 정보가 있으면 포함
        if (location && location.latitude && location.longitude) {
            requestBody.latitude = location.latitude;
            requestBody.longitude = location.longitude;
        }

        const response = await fetch(`/api/booth/scan`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'kb-auth': `Bearer ${token}`
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        
        if (data.success) {
            if (data.alreadyParticipated) {
                if (typeof showModal === 'function') {
                    showModal('알림', '이미 참여한 부스입니다.');
                } else {
                    alert('이미 참여한 부스입니다.');
                }
            } else {
                if (typeof showModal === 'function') {
                    showModal('성공', '부스 참여가 완료되었습니다!');
                } else {
                    alert('부스 참여가 완료되었습니다!');
                }
                // 참여 현황 새로고침 (UI 업데이트)
                await loadParticipationStatus();
            }
        } else {
            if (typeof showModal === 'function') {
                showModal('오류', data.message || 'QR 코드 처리 중 오류가 발생했습니다.');
            } else {
                alert(data.message || 'QR 코드 처리 중 오류가 발생했습니다.');
            }
        }
    } catch (error) {
        console.error('QR 스캔 오류:', error);
        if (typeof showModal === 'function') {
            showModal('오류', '네트워크 오류가 발생했습니다. 다시 시도해주세요.');
        } else {
            alert('네트워크 오류가 발생했습니다. 다시 시도해주세요.');
        }
    }
};

function setLotteryDisplay(number, message, showButton) {
    const numberEl = document.getElementById('lotteryNumber');
    const messageEl = document.getElementById('lotteryNumberMessage');
    const issueBtn = document.getElementById('lotteryIssueButton');

    if (numberEl) {
        numberEl.textContent = number !== null && number !== undefined ? String(number).padStart(3, '0') : '-';
    }

    if (messageEl) {
        messageEl.textContent = message || '';
    }

    if (issueBtn) {
        issueBtn.style.display = showButton ? '' : 'none';
    }
}

// 페이지 로드 시 초기화 및 인증 확인
document.addEventListener('DOMContentLoaded', async () => {
    const authCheckMessage = document.getElementById('authCheckMessage');
    const authCompletedMessage = document.getElementById('authCompletedMessage');
    
    // URL 파라미터에서 인증 완료 플래그 확인
    const urlParams = new URLSearchParams(window.location.search);
    const authCompleted = urlParams.get('authCompleted') === 'true';
    
    // 인증 완료 플래그가 있으면 URL에서 제거 (재방문 시 중복 표시 방지)
    if (authCompleted) {
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    
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
            if (typeof showModal === 'function') {
                showModal('인증 만료', '인증이 만료되었습니다. 다시 로그인해주세요.', () => {
                    window.location.href = '/app/event/auth.html';
                });
            } else {
                alert('인증이 만료되었습니다. 다시 로그인해주세요.');
                window.location.href = '/app/event/auth.html';
            }
        }, 1500);
        return;
    }

    // 인증 확인 메시지 숨기기
    if (authCheckMessage) {
        authCheckMessage.style.display = 'none';
    }
    
    // 인증 완료 후 접근한 경우 안내 메시지 표시
    if (authCompleted && authCompletedMessage) {
        authCompletedMessage.style.display = 'block';
        
        // 10초 후 자동으로 메시지 숨김 (선택사항)
        setTimeout(() => {
            if (authCompletedMessage) {
                authCompletedMessage.style.transition = 'opacity 0.5s ease';
                authCompletedMessage.style.opacity = '0';
                setTimeout(() => {
                    authCompletedMessage.style.display = 'none';
                }, 500);
            }
        }, 10000);
    }

    // 인증된 사용자만 데이터 로드
    await loadUserData();
    await loadParticipationStatus();
    await loadLotteryNumber();
    displayParticipantInfo();
    
    // 페이지가 다시 보일 때 참여 현황 갱신 (관리자가 삭제한 경우 반영)
    document.addEventListener('visibilitychange', async () => {
        if (!document.hidden) {
            // 페이지가 보일 때 참여 현황 갱신
            await loadParticipationStatus();
        }
    });
    
    // 윈도우 포커스 시에도 참여 현황 갱신
    window.addEventListener('focus', async () => {
        await loadParticipationStatus();
    });
});

// 이벤트 페이지 참가자 정보 표시 (본문 섹션에 표시)
async function displayParticipantInfo() {
    const user = await checkAuth();
    const participantInfoSection = document.getElementById('participantInfo');
    const adminNavItem = document.getElementById('adminNavItem');
    
    // 관리자 토큰이 있으면 관리자 링크 표시
    if (adminNavItem && typeof getAdminToken === 'function') {
        const adminToken = getAdminToken();
        if (adminToken) {
            adminNavItem.style.display = 'block';
        } else {
            adminNavItem.style.display = 'none';
        }
    }
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
            if (typeof showModal === 'function') {
                showModal('인증 만료', '인증이 만료되었습니다. 다시 로그인해주세요.');
                setTimeout(() => {
                    window.location.href = '/app/event/auth.html';
                }, 2000);
            } else {
                alert('인증이 만료되었습니다. 다시 로그인해주세요.');
                window.location.href = '/app/event/auth.html';
            }
        }
    } catch (error) {
        console.error('사용자 데이터 로드 오류:', error);
        removeToken();
        if (typeof showModal === 'function') {
            showModal('오류', '네트워크 오류가 발생했습니다. 다시 시도해주세요.');
            setTimeout(() => {
                window.location.href = '/app/event/auth.html';
            }, 2000);
        } else {
            alert('네트워크 오류가 발생했습니다. 다시 시도해주세요.');
            window.location.href = '/app/event/auth.html';
        }
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
            // 참여 현황에 따라 UI 업데이트
            updateStamps(data.participations || []);
            
            const stampCountElement = document.getElementById('stampCountValue');
            if (stampCountElement) {
                stampCountElement.textContent = data.count || 0;
            }

            // 모바일상품추첨권 섹션 표시/숨김 처리
            const prizeQRSection = document.getElementById('prizeQRSection');
            if (prizeQRSection) {
                if (data.eligible && data.count >= 3) {
                    prizeQRSection.style.display = 'block';
                } else {
                    prizeQRSection.style.display = 'none';
                }
            }
        }
    } catch (error) {
        console.error('참여 현황 로드 오류:', error);
    }
}

// 스탬프 업데이트
function updateStamps(participations) {
    const stamps = ['stamp1', 'stamp2', 'stamp3'];
    const participationCount = participations ? participations.length : 0;
    
    stamps.forEach((stampId, index) => {
        const stampElement = document.getElementById(stampId);
        if (stampElement) {
            if (index < participationCount) {
                stampElement.classList.add('active');
            } else {
                stampElement.classList.remove('active');
            }
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
    modal.addEventListener('hidden.bs.modal', async () => {
        await stopQRScan();
    });
    
    // 모달이 닫히기 전에 스캔 중지 (부드러운 전환)
    modal.addEventListener('hide.bs.modal', async () => {
        await stopQRScan();
    });
    
    return qrScannerModal;
}

// QR 스캔 시작
async function scanQR(mode = 'booth') {
    currentQRScanMode = mode || 'booth';
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
    
    if (!qrReaderDiv) {
        if (typeof showModal === 'function') {
            showModal('오류', 'QR 스캔 영역을 찾을 수 없습니다.');
        } else {
            alert('QR 스캔 영역을 찾을 수 없습니다.');
        }
        return;
    }
    
    // 먼저 모달을 표시하여 사용자에게 카메라 접근 안내
    modal.show();
    qrResultsDiv.innerHTML = '<p class="text-muted">카메라 접근 권한을 요청하고 있습니다...</p>';
    
    try {
        // 기존 스캐너가 있으면 먼저 정리
        if (qrScanner) {
            try {
                await qrScanner.stop();
                qrScanner.clear();
            } catch (e) {
                console.log('기존 스캐너 정리 중 오류 (무시):', e);
            }
            qrScanner = null;
        }
        
        // qr-reader div 초기화
        qrReaderDiv.innerHTML = '';
        
        // Html5Qrcode 인스턴스 생성
        qrScanner = new Html5Qrcode("qr-reader");
        
        // 카메라 장치 목록 확인
        let cameraId = null;
        try {
            const devices = await Html5Qrcode.getCameras();
            console.log('사용 가능한 카메라:', devices);
            
            // 후방 카메라 우선 선택
            const backCamera = devices.find(device => 
                device.label.toLowerCase().includes('back') || 
                device.label.toLowerCase().includes('rear') ||
                device.label.toLowerCase().includes('environment')
            );
            
            if (backCamera) {
                cameraId = backCamera.id;
                console.log('후방 카메라 선택:', backCamera.label);
            } else if (devices.length > 0) {
                // 후방 카메라를 찾을 수 없으면 마지막 카메라 사용 (일반적으로 후방)
                cameraId = devices[devices.length - 1].id;
                console.log('사용 가능한 카메라 선택:', devices[devices.length - 1].label);
            }
        } catch (err) {
            console.warn('카메라 목록 조회 실패, 기본 설정 사용:', err);
        }
        
        // 카메라 시작 설정
        const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
            videoConstraints: {
                facingMode: "environment" // 후방 카메라 우선
            }
        };
        
        // 카메라 ID가 있으면 사용, 없으면 facingMode 사용
        const cameraConfig = cameraId ? cameraId : { facingMode: "environment" };
        
        qrResultsDiv.innerHTML = '<p class="text-muted">카메라를 활성화하고 있습니다...</p>';
        
        // 카메라 시작
        await qrScanner.start(
            cameraConfig,
            config,
            (decodedText, decodedResult) => {
                // QR 코드 스캔 성공
                console.log('QR 코드 스캔 성공:', decodedText);
                handleQRScanResult(decodedText);
                stopQRScan();
                modal.hide();
            },
            (errorMessage) => {
                // 스캔 중 오류 (계속 시도 중이므로 무시)
                // console.log('스캔 중 오류 (무시):', errorMessage);
            }
        );
        
        // 카메라가 성공적으로 시작된 후 안내 메시지 업데이트
        qrResultsDiv.innerHTML = '<p class="text-success">QR 코드를 카메라에 맞춰주세요.</p>';
        
    } catch (error) {
        console.error('QR 스캔 시작 오류:', error);
        
        // 에러 메시지 정리
        let errorMessage = '카메라를 사용할 수 없습니다.';
        if (error.name === 'NotAllowedError' || error.message.includes('permission')) {
            errorMessage = '카메라 접근 권한이 거부되었습니다. 브라우저 설정에서 카메라 권한을 허용해주세요.';
        } else if (error.name === 'NotFoundError' || error.message.includes('camera')) {
            errorMessage = '카메라를 찾을 수 없습니다. 카메라가 연결되어 있는지 확인해주세요.';
        } else if (error.message) {
            errorMessage = error.message;
        }
        
        qrResultsDiv.innerHTML = `<div class="alert alert-warning">${errorMessage}</div>`;
        
        // 기존 스캐너 정리
        if (qrScanner) {
            try {
                await qrScanner.stop().catch(() => {});
                qrScanner.clear();
            } catch (e) {}
            qrScanner = null;
        }
        
        // 폴백: 수동 입력
        setTimeout(() => {
            if (typeof showConfirmModal === 'function') {
                showConfirmModal(
                    '카메라 사용 불가',
                    '카메라를 사용할 수 없습니다. 수동 입력으로 진행하시겠습니까?',
                    () => {
                        stopQRScan();
                        modal.hide();
                        manualQRInput();
                    },
                    () => {
                        modal.hide();
                    }
                );
            } else if (confirm('카메라를 사용할 수 없습니다. 수동 입력으로 진행하시겠습니까?')) {
                stopQRScan();
                modal.hide();
                manualQRInput();
            } else {
                modal.hide();
            }
        }, 3000);
    }
}

// QR 스캔 중지
async function stopQRScan() {
    if (qrScanner) {
        try {
            await qrScanner.stop();
            qrScanner.clear();
            qrScanner = null;
            
            // qr-reader div 초기화
            const qrReaderDiv = document.getElementById('qr-reader');
            if (qrReaderDiv) {
                qrReaderDiv.innerHTML = '';
            }
        } catch (err) {
            console.error('QR 스캔 중지 오류:', err);
            // 에러가 발생해도 스캐너는 null로 설정
            qrScanner = null;
            
            // qr-reader div 초기화
            const qrReaderDiv = document.getElementById('qr-reader');
            if (qrReaderDiv) {
                qrReaderDiv.innerHTML = '';
            }
        }
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
            if (typeof showModal === 'function') {
                showModal('오류', '유효하지 않은 QR 코드입니다.');
            } else {
                alert('유효하지 않은 QR 코드입니다.');
            }
            return;
        }

        submitCurrentQRData(encryptedData);
    } catch (error) {
        // URL 파싱 실패 시 직접 입력된 데이터로 간주
        submitCurrentQRData(url);
    }
}

// QR 스캔 결과 처리
function submitCurrentQRData(payload) {
    if (currentQRScanMode === 'lottery') {
        return submitLotteryQRScan(payload);
    }
    return window.submitQRScan(payload);
}

function handleQRScanResult(decodedText) {
    try {
        // URL에서 data 파라미터 추출
        const urlObj = new URL(decodedText);
        const urlParams = new URLSearchParams(urlObj.search);
        const encryptedData = urlParams.get('data');

        if (encryptedData) {
            submitCurrentQRData(encryptedData);
        } else {
            // URL이 아닌 경우 직접 데이터로 간주
            submitCurrentQRData(decodedText);
        }
    } catch (error) {
        // URL 파싱 실패 시 직접 입력된 데이터로 간주
        submitCurrentQRData(decodedText);
    }
}

// 현장 추첨번호 발급 처리
async function submitLotteryQRScan(encryptedData) {
    const token = getToken();
    if (!token) {
        window.location.href = '/app/event/auth.html';
        return;
    }

    if (!encryptedData) {
        if (typeof showModal === 'function') {
            showModal('오류', '유효하지 않은 QR 코드입니다.');
        } else {
            alert('유효하지 않은 QR 코드입니다.');
        }
        return;
    }

    try {
        const response = await fetch('/api/lottery/issue', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'kb-auth': `Bearer ${token}`
            },
            body: JSON.stringify({ qrData: encryptedData })
        });

        const data = await response.json();

        if (data.success) {
            const message = data.alreadyIssued
                ? '이미 발급된 추첨번호입니다.'
                : '추첨번호가 발급되었습니다!';
            setLotteryDisplay(data.lotteryNumber, message, false);
        } else {
            const errorMessage = data.message || '추첨번호 발급 중 오류가 발생했습니다.';
            if (typeof showModal === 'function') {
                showModal('오류', errorMessage);
            } else {
                alert(errorMessage);
            }
        }
    } catch (error) {
        console.error('추첨번호 발급 오류:', error);
        if (typeof showModal === 'function') {
            showModal('오류', '추첨번호 발급 중 네트워크 오류가 발생했습니다.');
        } else {
            alert('추첨번호 발급 중 네트워크 오류가 발생했습니다.');
        }
    } finally {
        currentQRScanMode = 'booth';
        await loadLotteryNumber();
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
window.scanLotteryQR = function() {
    if (!isLotteryEventDay()) {
        const message = '추첨번호 발급은 행사 당일에 가능합니다.';
        showMessageBox('안내', message);
        return;
    }
    scanQR('lottery');
};

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
            setLotteryDisplay(data.lotteryNumber, '이미 추첨번호를 발급받으셨습니다.', false);
        } else {
            setLotteryDisplay(null, '현장 추첨 QR을 스캔하여 추첨번호를 발급받으세요.', true);
        }
    } catch (error) {
        console.error('추첨 번호 로드 오류:', error);
        setLotteryDisplay(null, '추첨번호를 불러오는 중 오류가 발생했습니다.', true);
    }
}

