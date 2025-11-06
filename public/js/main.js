
// 참가신청 폼 제출 핸들러
async function handleRegistrationSubmit(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const registrationForm = document.getElementById('registrationForm');
    const empno = document.getElementById('empno');
    const phoneLast = document.getElementById('phoneLast');
    const messageDiv = document.getElementById('registrationMessage');

    if (!empno || !phoneLast || !messageDiv) {
        console.error('참가신청 폼 요소를 찾을 수 없습니다.');
        return;
    }

    const empnoValue = empno.value.trim();
    const phoneLastValue = phoneLast.value.trim();

    if (!empnoValue || !phoneLastValue) {
        showMessage(messageDiv, '직원번호와 휴대번호 뒷4자리를 입력해주세요.', 'error');
        return;
    }

    if (phoneLastValue.length !== 4) {
        showMessage(messageDiv, '휴대번호 뒷4자리를 정확히 입력해주세요.', 'error');
        return;
    }

    // 버튼 비활성화 (중복 제출 방지)
    const submitButton = registrationForm.querySelector('button[type="submit"]');
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = '처리 중...';
    }

    try {
        // login 함수가 정의되어 있는지 확인
        if (typeof login !== 'function') {
            console.error('login 함수를 찾을 수 없습니다.');
            showMessage(messageDiv, '시스템 오류가 발생했습니다. 페이지를 새로고침해주세요.', 'error');
            if (submitButton) {
                submitButton.disabled = false;
                // 로그인 이력에 따라 버튼 텍스트 업데이트
                updateRegistrationButtonTitle();
            }
            return;
        }

        const result = await login(empnoValue, phoneLastValue);
        
        if (result.success) {
            // 사용자 정보 표시 및 UI 업데이트
            try {
                if (typeof displayUserInfo === 'function') {
                    await displayUserInfo();
                }
                if (typeof updateEventButton === 'function') {
                    await updateEventButton();
                }
                // 참가신청 섹션 숨김 처리
                await updateRegistrationSection();
            } catch (updateError) {
                console.error('UI 업데이트 오류:', updateError);
            }
            
            // 사용자명 포함 환영 메시지 표시
            const userName = result.user ? `${result.user.empname} ${result.user.posname || ''}`.trim() : '회원';
            const welcomeMessage = `${userName}님, 환영합니다!<br><small>잠시 후 이벤트 페이지로 이동합니다...</small>`;
            // 페이지 이동 전까지 메시지 유지 (autoHideDelay를 0으로 설정하여 자동 삭제 방지)
            showMessage(messageDiv, welcomeMessage, 'success', 0);
            
            // 폼 초기화 (입력 필드만 클리어)
            registrationForm.reset();
            
            // 버튼 상태 복원 (성공했으므로 더 이상 제출할 필요 없음)
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = '참가신청 완료';
                submitButton.classList.remove('btn-primary');
                submitButton.classList.add('btn-success');
            }
            
            // 2초 후 이벤트 페이지로 자동 이동
            setTimeout(() => {
                window.location.href = '/app/event/';
            }, 2000);
        } else {
            showMessage(messageDiv, result.message || '참가신청에 실패했습니다.', 'error');
            if (submitButton) {
                submitButton.disabled = false;
                // 로그인 이력에 따라 버튼 텍스트 업데이트
                updateRegistrationButtonTitle();
            }
        }
    } catch (error) {
        console.error('참가신청 오류:', error);
        showMessage(messageDiv, '네트워크 오류가 발생했습니다. 다시 시도해주세요.', 'error');
        if (submitButton) {
            submitButton.disabled = false;
            // 로그인 이력에 따라 버튼 텍스트 업데이트
            updateRegistrationButtonTitle();
        }
    }
}

// 참가신청 버튼 타이틀 업데이트 및 히어로 섹션 환영 메시지 표시
async function updateRegistrationButtonTitle() {
    // 인증 상태 확인
    const user = typeof checkAuth === 'function' ? await checkAuth() : null;
    
    // 히어로 섹션 버튼 및 환영 메시지 업데이트
    const heroButton = document.getElementById('heroRegisterButton');
    const heroWelcomeMessage = document.getElementById('heroWelcomeMessage');
    const heroWelcomeName = document.getElementById('heroWelcomeName');
    
    if (user) {
        // 인증된 상태: 버튼 숨기고 환영 메시지 표시
        if (heroButton) {
            heroButton.style.display = 'none';
        }
        if (heroWelcomeMessage && heroWelcomeName) {
            heroWelcomeName.textContent = user.empname || '참가자';
            heroWelcomeMessage.style.display = 'block';
        }
    } else {
        // 미인증 상태: 환영 메시지 숨기고 버튼 표시
        if (heroWelcomeMessage) {
            heroWelcomeMessage.style.display = 'none';
        }
        if (heroButton) {
            // 인라인 스타일 제거하여 CSS의 inline-block이 적용되도록 함
            heroButton.style.display = '';
            if (typeof hasLoginHistory === 'function' && hasLoginHistory()) {
                heroButton.textContent = '참가신청/로그인';
            } else {
                heroButton.textContent = '참가신청';
            }
        }
    }
    
    // 폼 제출 버튼 업데이트
    const registrationForm = document.getElementById('registrationForm');
    if (registrationForm) {
        const submitButton = registrationForm.querySelector('button[type="submit"]');
        if (submitButton) {
            // 로그인 이력 확인
            if (typeof hasLoginHistory === 'function' && hasLoginHistory()) {
                submitButton.textContent = '참가신청/로그인';
            } else {
                submitButton.textContent = '참가신청';
            }
        }
    }
    
    // 네비게이션 링크 업데이트
    const navLink = document.getElementById('navRegistrationLink');
    if (navLink) {
        if (typeof hasLoginHistory === 'function' && hasLoginHistory()) {
            navLink.textContent = '참가신청/로그인';
        } else {
            navLink.textContent = '참가신청';
        }
    }
}

// 참가신청 폼 이벤트 초기화
function initRegistrationForm() {
    const registrationForm = document.getElementById('registrationForm');
    if (!registrationForm) {
        console.warn('참가신청 폼을 찾을 수 없습니다.');
        return;
    }
    
    // 기존 이벤트 리스너 제거 후 새로 추가
    const newHandler = handleRegistrationSubmit;
    const oldHandler = registrationForm._submitHandler;
    
    if (oldHandler) {
        registrationForm.removeEventListener('submit', oldHandler);
    }
    
    registrationForm.addEventListener('submit', newHandler);
    registrationForm._submitHandler = newHandler; // 참조 저장
    
    console.log('참가신청 폼 이벤트 리스너 연결 완료');
    
    // 폼 제출 버튼이 제대로 연결되었는지 확인 및 타이틀 업데이트
    const submitButton = registrationForm.querySelector('button[type="submit"]');
    if (submitButton) {
        console.log('참가신청 제출 버튼 확인됨');
        updateRegistrationButtonTitle();
    }
}

// 이벤트 페이지로 이동 함수 (먼저 선언하여 initEventButton에서 사용 가능하도록)
async function goToEvent() {
    const user = await checkAuth();
    if (user) {
        // 인증된 사용자는 이벤트 페이지로 이동
        window.location.href = '/app/event/';
    } else {
        // 미인증 사용자는 참가신청 섹션으로 스크롤
        const registrationSection = document.getElementById('registration');
        if (registrationSection) {
            registrationSection.scrollIntoView({ behavior: 'smooth' });
            // 참가신청 폼에 포커스
            setTimeout(() => {
                const empnoInput = document.getElementById('empno');
                if (empnoInput) {
                    empnoInput.focus();
                }
            }, 500);
        }
    }
}

// 이벤트 버튼 클릭 이벤트 초기화
function initEventButton() {
    const eventButton = document.getElementById('eventButton');
    if (!eventButton) {
        console.warn('이벤트 버튼을 찾을 수 없습니다.');
        return;
    }
    
    // goToEvent 함수가 정의되어 있는지 확인
    if (typeof goToEvent !== 'function') {
        console.error('goToEvent 함수를 찾을 수 없습니다.');
        return;
    }
    
    // 기존 이벤트 리스너 제거 후 새로 추가
    const newHandler = goToEvent;
    const oldHandler = eventButton._clickHandler;
    
    if (oldHandler) {
        eventButton.removeEventListener('click', oldHandler);
    }
    
    eventButton.addEventListener('click', newHandler);
    eventButton._clickHandler = newHandler; // 참조 저장
    
    console.log('이벤트 버튼 클릭 리스너 연결 완료');
}

// 참가신청 섹션 표시/숨김 제어
async function updateRegistrationSection() {
    const registrationSection = document.getElementById('registration');
    if (!registrationSection) return;
    
    const user = await checkAuth();
    if (user) {
        // 인증 완료 시 참가신청 섹션 숨김
        registrationSection.style.display = 'none';
    } else {
        // 미인증 시 참가신청 섹션 표시
        registrationSection.style.display = 'block';
    }
}

// 네비게이션 메뉴 스크롤 이벤트 초기화
function initNavigationMenu() {
    // 네비게이션 링크에 부드러운 스크롤 추가
    document.querySelectorAll('a.nav-link[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', async function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            // 이벤트 링크는 특별 처리
            if (targetId === '#event') {
                // 인증 상태 확인
                if (typeof checkAuth === 'function') {
                    const user = await checkAuth();
                    if (user) {
                        // 인증된 사용자는 이벤트 페이지로 이동
                        window.location.href = '/app/event/';
                        return;
                    }
                }
                // 미인증 사용자는 이벤트 섹션으로 스크롤
                const targetElement = document.querySelector(targetId);
                if (targetElement) {
                    scrollToSectionWithOffset(targetElement);
                    
                    // 모바일에서 네비게이션 메뉴 자동 닫기
                    const navbarCollapse = document.getElementById('navbarNav');
                    if (navbarCollapse && navbarCollapse.classList.contains('show')) {
                        const bsCollapse = new bootstrap.Collapse(navbarCollapse, {
                            toggle: false
                        });
                        bsCollapse.hide();
                    }
                }
                return;
            }
            
            // 다른 링크는 헤더 높이를 고려한 스크롤 처리
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                scrollToSectionWithOffset(targetElement);
                
                // 모바일에서 네비게이션 메뉴 자동 닫기
                const navbarCollapse = document.getElementById('navbarNav');
                if (navbarCollapse && navbarCollapse.classList.contains('show')) {
                    const bsCollapse = new bootstrap.Collapse(navbarCollapse, {
                        toggle: false
                    });
                    bsCollapse.hide();
                }
            }
        });
    });
}

// 페이지 로드 시 초기화
function initMainPage() {
    // 참가신청 폼 초기화
    initRegistrationForm();
    
    // 이벤트 버튼 클릭 이벤트 초기화
    initEventButton();
    
    // 네비게이션 메뉴 초기화
    initNavigationMenu();
    
    // 참가신청 섹션 표시/숨김 업데이트
    updateRegistrationSection();
    
    // 참가신청 버튼 타이틀 업데이트 (로그인 이력 확인)
    updateRegistrationButtonTitle();
    
    // 이벤트 버튼 상태 업데이트 (비동기)
    if (typeof checkAuth === 'function') {
        updateEventButton().catch(err => {
            console.error('이벤트 버튼 업데이트 오류:', err);
        });
    }
}

// DOMContentLoaded 이벤트 처리
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMainPage);
} else {
    // DOM이 이미 로드된 경우 즉시 실행
    initMainPage();
}

// 이벤트 버튼 상태 업데이트
async function updateEventButton() {
    const eventButton = document.getElementById('eventButton');
    const eventMessage = document.getElementById('eventMessage');
    
    if (!eventButton || !eventMessage) return;

    const user = await checkAuth();
    if (user) {
        eventMessage.textContent = '인증이 완료되었습니다. 이벤트에 참여하세요!';
        eventButton.classList.remove('btn-secondary');
        eventButton.classList.add('btn-primary');
        eventButton.textContent = '이벤트 참여하기';
    } else {
        eventMessage.textContent = '경품 이벤트에 참여하려면 먼저 참가신청을 완료해주세요.';
        eventButton.classList.remove('btn-primary');
        eventButton.classList.add('btn-secondary');
        eventButton.textContent = '참가신청 먼저 하기';
    }
}

// 참가신청 섹션으로 스크롤
function scrollToRegistration() {
    const registrationSection = document.getElementById('registration');
    if (registrationSection) {
        scrollToSectionWithOffset(registrationSection);
    }
}

// 헤더 높이를 고려한 스크롤 함수
function scrollToSectionWithOffset(element) {
    if (!element) return;
    
    // 헤더 높이 계산 (sticky header)
    const header = document.querySelector('.header');
    const headerHeight = header ? header.offsetHeight : 80;
    const offset = headerHeight + 10; // 여유 공간 10px 추가
    
    // 요소의 현재 위치 계산
    const elementPosition = element.getBoundingClientRect().top + window.pageYOffset;
    const offsetPosition = elementPosition - offset;
    
    // 부드럽게 스크롤
    window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
    });
}

// 전역 스코프에 노출 (다른 스크립트에서 사용 가능하도록, 안전성을 위해)
if (typeof window !== 'undefined') {
    window.goToEvent = goToEvent;
    window.scrollToRegistration = scrollToRegistration;
}

// 메시지 표시
function showMessage(container, message, type, autoHideDelay = null) {
    if (!container) return;

    container.innerHTML = `<div class="alert alert-${type === 'success' ? 'success' : 'error'}">${message}</div>`;
    
    // autoHideDelay가 지정되지 않은 경우 기본값 사용
    const delay = autoHideDelay !== null ? autoHideDelay : (type === 'success' ? 3000 : null);
    
    if (delay && delay > 0) {
        setTimeout(() => {
            container.innerHTML = '';
        }, delay);
    }
}

