/**
 * 재시도 로직이 포함된 fetch 유틸리티
 * 네트워크 오류나 일시적 서버 오류 시 자동 재시도
 */

/**
 * 재시도 옵션
 * @typedef {Object} RetryOptions
 * @property {number} maxRetries - 최대 재시도 횟수 (기본값: 3)
 * @property {number} retryDelay - 재시도 대기 시간(ms) (기본값: 1000)
 * @property {number} timeout - 요청 타임아웃(ms) (기본값: 10000)
 * @property {boolean} retryOnNetworkError - 네트워크 오류 시 재시도 여부 (기본값: true)
 * @property {number[]} retryStatusCodes - 재시도할 HTTP 상태 코드 (기본값: [500, 502, 503, 504])
 */

/**
 * 재시도 로직이 포함된 fetch 함수
 * @param {string} url - 요청 URL
 * @param {RequestInit} options - fetch 옵션
 * @param {RetryOptions} retryOptions - 재시도 옵션
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options = {}, retryOptions = {}) {
    const {
        maxRetries = 3,
        retryDelay = 1000,
        timeout = 10000,
        retryOnNetworkError = true,
        retryStatusCodes = [500, 502, 503, 504]
    } = retryOptions;

    let lastError = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            // 타임아웃 설정
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            // 성공적인 응답 (2xx)
            if (response.ok) {
                return response;
            }
            
            // 재시도 가능한 상태 코드인지 확인
            if (retryStatusCodes.includes(response.status) && attempt < maxRetries) {
                console.warn(`요청 실패 (${response.status}), ${retryDelay}ms 후 재시도 ${attempt + 1}/${maxRetries}...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1))); // 지수 백오프
                continue;
            }
            
            // 재시도 불가능한 상태 코드 (4xx 등)
            return response;
            
        } catch (error) {
            lastError = error;
            
            // AbortError는 타임아웃
            if (error.name === 'AbortError') {
                if (attempt < maxRetries) {
                    console.warn(`요청 타임아웃, ${retryDelay}ms 후 재시도 ${attempt + 1}/${maxRetries}...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
                    continue;
                }
                throw new Error('요청 시간이 초과되었습니다. 네트워크를 확인해주세요.');
            }
            
            // 네트워크 오류
            if (retryOnNetworkError && attempt < maxRetries) {
                console.warn(`네트워크 오류 발생, ${retryDelay}ms 후 재시도 ${attempt + 1}/${maxRetries}...`, error.message);
                await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
                continue;
            }
            
            // 재시도 횟수 초과 또는 재시도 불가능한 오류
            throw error;
        }
    }
    
    // 모든 재시도 실패
    throw lastError || new Error('요청이 실패했습니다.');
}

/**
 * JSON 응답을 파싱하는 fetchWithRetry 래퍼
 * @param {string} url - 요청 URL
 * @param {RequestInit} options - fetch 옵션
 * @param {RetryOptions} retryOptions - 재시도 옵션
 * @returns {Promise<any>} 파싱된 JSON 데이터
 */
async function fetchJSONWithRetry(url, options = {}, retryOptions = {}) {
    const response = await fetchWithRetry(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        }
    }, retryOptions);
    
    const data = await response.json();
    return { response, data };
}

// 전역 스코프에 노출
if (typeof window !== 'undefined') {
    window.fetchWithRetry = fetchWithRetry;
    window.fetchJSONWithRetry = fetchJSONWithRetry;
}

