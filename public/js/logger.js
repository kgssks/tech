// 클라이언트 측 페이지 접속 로깅
// 서버 측 로깅과 함께 사용하여 더 정확한 사용자 행동 분석 가능

// 페이지 접속 로깅
function logPageView() {
    const pageInfo = {
        path: window.location.pathname,
        referrer: document.referrer,
        timestamp: new Date().toISOString(),
        screen: {
            width: window.screen.width,
            height: window.screen.height
        },
        viewport: {
            width: window.innerWidth,
            height: window.innerHeight
        },
        userAgent: navigator.userAgent,
        language: navigator.language
    };

    // 로컬스토리지에서 토큰 확인
    const token = localStorage.getItem('forumUser');
    if (token) {
        pageInfo.hasAuth = true;
    }

    // 서버에 로그 전송 (비동기, 오류 무시)
    try {
        fetch('/api/logs/page-view', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token ? `Bearer ${token}` : ''
            },
            body: JSON.stringify(pageInfo)
        }).catch(() => {
            // 로그 전송 실패는 무시 (사용자 경험에 영향 없음)
        });
    } catch (error) {
        // 로그 전송 오류 무시
    }
}

// 이벤트 로깅 (버튼 클릭, 폼 제출 등)
function logEvent(eventType, eventData) {
    const eventInfo = {
        type: eventType,
        data: eventData,
        path: window.location.pathname,
        timestamp: new Date().toISOString()
    };

    const token = localStorage.getItem('forumUser');
    
    try {
        fetch('/api/logs/event', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token ? `Bearer ${token}` : ''
            },
            body: JSON.stringify(eventInfo)
        }).catch(() => {
            // 로그 전송 실패는 무시
        });
    } catch (error) {
        // 로그 전송 오류 무시
    }
}

// 페이지 로드 시 로깅
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        logPageView();
    });
} else {
    logPageView();
}

// 페이지 이탈 시 로깅 (페이지 언로드)
window.addEventListener('beforeunload', () => {
    // navigator.sendBeacon을 사용하여 더 안정적으로 전송
    const pageInfo = {
        path: window.location.pathname,
        action: 'page_unload',
        timestamp: new Date().toISOString()
    };

    const token = localStorage.getItem('forumUser');
    const data = JSON.stringify(pageInfo);
    
    if (navigator.sendBeacon) {
        navigator.sendBeacon(
            '/api/logs/page-view',
            new Blob([data], { type: 'application/json' })
        );
    }
});

// 주요 이벤트 자동 로깅
document.addEventListener('click', (e) => {
    const target = e.target;
    
    // 버튼 클릭 로깅
    if (target.tagName === 'BUTTON' || target.tagName === 'A') {
        const buttonText = target.textContent?.trim() || target.innerText?.trim() || '';
        if (buttonText.length > 0 && buttonText.length < 50) {
            logEvent('button_click', {
                text: buttonText,
                id: target.id || null,
                class: target.className || null
            });
        }
    }
});

// 폼 제출 로깅
document.addEventListener('submit', (e) => {
    const form = e.target;
    if (form.tagName === 'FORM') {
        logEvent('form_submit', {
            formId: form.id || null,
            action: form.action || null,
            method: form.method || 'GET'
        });
    }
});

