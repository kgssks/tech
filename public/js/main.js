// AI 기술테크포럼 2024 메인 JavaScript

// 전역 변수
const API_BASE_URL = window.location.origin;
const AUTH_TOKEN_KEY = 'auth_token';
const TOKEN_EXPIRY_KEY = 'token_expiry_date';

// DOM 로드 완료 시 실행
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupScrollAnimations();
    setTimeout(()=>{
        setupEventListeners();
    }, 1000)

});

// 앱 초기화
function initializeApp() {
    // 스무스 스크롤 설정
    setupSmoothScroll();
    
    // 네비게이션 활성화
    setupNavigation();
    
    // 로그인 상태 확인 및 UI 업데이트
    checkLoginStatus();
    
    // 폼 유효성 검사 설정
    setupFormValidation();
}

// 로그인 상태 확인 및 UI 업데이트
function checkLoginStatus() {
    const isLoggedIn = StorageManager.isTokenValid();
    
    if (isLoggedIn) {
        // 참가신청 버튼 숨기기
        hideRegistrationButtons();
        
        // 참가신청 섹션 숨기기
        hideRegistrationSection();
    }
}

// 참가신청 버튼 숨기기
function hideRegistrationButtons() {
    // 히어로 섹션의 참가신청 버튼 숨기기
    const heroRegistrationBtn = document.querySelector('.hero-section a[href="#registration"]');
    if (heroRegistrationBtn) {
        heroRegistrationBtn.style.display = 'none';
    }
    
    // 네비게이션의 참가신청 링크 숨기기
    const navRegistrationLink = document.querySelector('.nav-link[href="#registration"]');
    if (navRegistrationLink) {
        navRegistrationLink.style.display = 'none';
    }
}

// 참가신청 섹션 숨기기
function hideRegistrationSection() {
    const registrationSection = document.getElementById('registration');
    if (registrationSection) {
        registrationSection.style.display = 'none';
    }
}

// 이벤트 리스너 설정
function setupEventListeners() {
    // 참가신청 폼
    const registrationForm = document.getElementById('registrationForm');
    if (registrationForm) {
        registrationForm.addEventListener('submit', handleRegistration);
    }
    
    // 네비게이션 링크
    const navLinks = document.querySelectorAll('.nav-link[href^="#"]');
    navLinks.forEach(link => {
        link.addEventListener('click', handleNavClick);
        console.log("ckick nav check", link)
    });
    
    //모든 앵커 링크에 스크롤 기능 추가 (중복 방지)
    const allAnchorLinks = document.querySelectorAll('a[href^="#"]');
    allAnchorLinks.forEach(link => {
        // 이미 이벤트 리스너가 있는지 확인
        if (!link.hasAttribute('data-scroll-handler')) {
            link.setAttribute('data-scroll-handler', 'true');
            console.log("ckick anchor check", link)
            link.addEventListener('click', handleNavClick);
        }
    });
    
    // 스크롤 이벤트
    window.addEventListener('scroll', handleScroll);
}

// 스무스 스크롤 설정
function setupSmoothScroll() {
    // CSS로 스무스 스크롤 활성화
    document.documentElement.style.scrollBehavior = 'smooth';
}

// 네비게이션 설정
function setupNavigation() {
    const navbar = document.querySelector('.navbar');
    
    // 스크롤 시 네비게이션 스타일 변경
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('navbar-scrolled');
        } else {
            navbar.classList.remove('navbar-scrolled');
        }
    });
}

// 폼 유효성 검사 설정
function setupFormValidation() {
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        form.addEventListener('submit', validateForm);
    });
}

// 스크롤 애니메이션 설정
function setupScrollAnimations() {
    const animateElements = document.querySelectorAll('.card, .timeline-item');
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate');
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    });
    
    animateElements.forEach(element => {
        element.classList.add('scroll-animate');
        observer.observe(element);
    });
}

// 네비게이션 클릭 처리
function handleNavClick(e) {

    console.log("handleNav")
    e.preventDefault();
    
    // 클릭된 요소가 링크인지 확인하고, 아니면 부모 요소에서 href 찾기
    let linkElement = e.target;
    while (linkElement && !linkElement.hasAttribute('href')) {
        linkElement = linkElement.parentElement;
    }
    
    if (!linkElement) {
        console.warn("not element")
        return;
    }
    
    const targetId = linkElement.getAttribute('href');
    const targetElement = document.querySelector(targetId);
    
    if (targetElement) {
        // 네비게이션 높이를 동적으로 계산
        const navbar = document.querySelector('.navbar');
        const navbarHeight = navbar ? navbar.offsetHeight : 80;
        const offsetTop = targetElement.offsetTop - navbarHeight;
        
        window.scrollTo({
            top: offsetTop,
            behavior: 'smooth'
        });
    }
}

// 스크롤 이벤트 처리
function handleScroll() {
    // 네비게이션 활성화
    updateActiveNavLink();
}

// 활성 네비게이션 링크 업데이트
function updateActiveNavLink() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-link[href^="#"]');
    
    let currentSection = '';
    
    sections.forEach(section => {
        const sectionTop = section.offsetTop - 100;
        const sectionHeight = section.offsetHeight;
        
        if (window.scrollY >= sectionTop && window.scrollY < sectionTop + sectionHeight) {
            currentSection = section.getAttribute('id');
        }
    });
    
    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${currentSection}`) {
            link.classList.add('active');
        }
    });
}

// 폼 유효성 검사
function validateForm(e) {
    const form = e.target;
    const inputs = form.querySelectorAll('input[required]');
    let isValid = true;
    
    inputs.forEach(input => {
        if (!input.value.trim()) {
            showAlert('모든 필수 항목을 입력해주세요.', 'warning');
            input.focus();
            isValid = false;
            return false;
        }
    });
    
    if (!isValid) {
        e.preventDefault();
    }
}

// 참가신청 처리
async function handleRegistration(e) {
    e.preventDefault();
    
    const employeeId = document.getElementById('employeeId').value;
    const phoneLast4 = document.getElementById('phoneLast4').value;
    
    if (!employeeId || !phoneLast4) {
        showAlert('모든 필수 항목을 입력해주세요.', 'warning');
        return;
    }
    
    if (phoneLast4.length !== 4 || !/^\d{4}$/.test(phoneLast4)) {
        showAlert('휴대번호 뒷4자리는 숫자 4자리여야 합니다.', 'warning');
        return;
    }
    
    try {
        showLoading(true);
        
        const response = await fetch('/api/register', {
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
            showAlert('참가신청이 완료되었습니다! 이제 로그인하여 이벤트에 참여하세요.', 'success');
            document.getElementById('registrationForm').reset();
        } else {
            showAlert(data.error || '등록 중 오류가 발생했습니다.', 'danger');
        }
    } catch (error) {
        showAlert('네트워크 오류가 발생했습니다. 다시 시도해주세요.', 'danger');
    } finally {
        showLoading(false);
    }
}

// 로딩 상태 표시
function showLoading(show) {
    const buttons = document.querySelectorAll('button[type="submit"]');
    buttons.forEach(button => {
        if (show) {
            button.disabled = true;
            button.innerHTML = '<span class="spinner"></span> 처리 중...';
        } else {
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-user-plus me-2"></i>참가신청';
        }
    });
}

// 알림 표시
function showAlert(message, type = 'info') {
    // 기존 알림 제거
    const existingAlert = document.querySelector('.alert');
    if (existingAlert) {
        existingAlert.remove();
    }
    
    // 새 알림 생성
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    alertDiv.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(alertDiv);
    
    // 5초 후 자동 제거
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, 5000);
}

// 로컬 스토리지 관리
class StorageManager {
    static setToken(token) {
        localStorage.setItem(AUTH_TOKEN_KEY, token);
        const expiryDate = new Date();
        expiryDate.setMonth(expiryDate.getMonth() + 1); // 1개월 후
        localStorage.setItem(TOKEN_EXPIRY_KEY, expiryDate.toISOString());
    }
    
    static getToken() {
        const token = localStorage.getItem(AUTH_TOKEN_KEY);
        const expiryDate = localStorage.getItem(TOKEN_EXPIRY_KEY);
        
        if (!token || !expiryDate) {
            return null;
        }
        
        if (new Date() > new Date(expiryDate)) {
            this.clearToken();
            return null;
        }
        
        return token;
    }
    
    static clearToken() {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        localStorage.removeItem(TOKEN_EXPIRY_KEY);
    }
    
    static isTokenValid() {
        return this.getToken() !== null;
    }
}

// API 호출 헬퍼
class ApiClient {
    static async request(url, options = {}) {
        const token = StorageManager.getToken();
        
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                ...(token && { 'Authorization': `Bearer ${token}` })
            }
        };
        
        const mergedOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        };
        
        try {
            const response = await fetch(url, mergedOptions);
            
            if (response.status === 401) {
                StorageManager.clearToken();
                window.location.href = '/app/event/auth';
                return;
            }
            
            return response;
        } catch (error) {
            throw new Error('네트워크 오류가 발생했습니다. 다시 시도해주세요.');
        }
    }
    
    static async get(url) {
        return this.request(url);
    }
    
    static async post(url, data) {
        return this.request(url, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }
    
    static async put(url, data) {
        return this.request(url, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }
    
    static async delete(url) {
        return this.request(url, {
            method: 'DELETE'
        });
    }
}

// 유틸리티 함수들
const Utils = {
    // 디바운스 함수
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
    
    // 스로틀 함수
    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },
    
    // 숫자 포맷팅
    formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    },
    
    // 날짜 포맷팅
    formatDate(date) {
        return new Date(date).toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    },
    
    // 시간 포맷팅
    formatTime(date) {
        return new Date(date).toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }
};

// 모바일 최적화
function setupMobileOptimization() {
    // 터치 이벤트 최적화
    if ('ontouchstart' in window) {
        document.body.classList.add('touch-device');
    }
    
    // 뷰포트 높이 조정 (모바일 브라우저 주소창 고려)
    function setViewportHeight() {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    }
    
    setViewportHeight();
    window.addEventListener('resize', Utils.debounce(setViewportHeight, 100));
}

// 접근성 개선
function setupAccessibility() {
    // 키보드 네비게이션
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            document.body.classList.add('keyboard-navigation');
        }
    });
    
    document.addEventListener('mousedown', () => {
        document.body.classList.remove('keyboard-navigation');
    });
    
    // 스킵 링크
    const skipLink = document.createElement('a');
    skipLink.href = '#main-content';
    skipLink.textContent = '본문으로 건너뛰기';
    skipLink.className = 'sr-only';
    skipLink.style.cssText = 'position: absolute; top: -40px; left: 6px; z-index: 1000; background: #000; color: #fff; padding: 8px; text-decoration: none;';
    
    skipLink.addEventListener('focus', () => {
        skipLink.classList.remove('sr-only');
    });
    
    skipLink.addEventListener('blur', () => {
        skipLink.classList.add('sr-only');
    });
    
    document.body.insertBefore(skipLink, document.body.firstChild);
}

// 성능 최적화
function setupPerformanceOptimization() {
    // 이미지 지연 로딩
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.dataset.src;
                    img.classList.remove('lazy');
                    observer.unobserve(img);
                }
            });
        });
        
        document.querySelectorAll('img[data-src]').forEach(img => {
            imageObserver.observe(img);
        });
    }
    
    // 스크롤 성능 최적화
    let ticking = false;
    
    function updateScrollEffects() {
        // 스크롤 관련 효과들
        ticking = false;
    }
    
    window.addEventListener('scroll', () => {
        if (!ticking) {
            requestAnimationFrame(updateScrollEffects);
            ticking = true;
        }
    });
}

// 초기화 실행
setupMobileOptimization();
setupAccessibility();
setupPerformanceOptimization();

// 전역 함수로 내보내기
window.AIForum = {
    StorageManager,
    ApiClient,
    Utils,
    showAlert,
    showLoading
};


