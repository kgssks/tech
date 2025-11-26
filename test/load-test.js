/**
 * 부하 테스트 스크립트
 * 100명 동시 접속 시뮬레이션
 * 
 * 사용법:
 * node test/load-test.js
 * 
 * 옵션:
 * - --users=100: 동시 사용자 수 (기본값: 100)
 * - --endpoint=lottery: 테스트할 엔드포인트 (lottery, booth, auth) (기본값: lottery)
 * - --base-url=http://localhost:3000: 서버 URL (기본값: http://localhost:3000)
 */

const axios = require('axios');
const crypto = require('crypto');

// 명령줄 인자 파싱
const args = process.argv.slice(2);
const getArg = (name, defaultValue) => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg ? arg.split('=')[1] : defaultValue;
};

const CONCURRENT_USERS = parseInt(getArg('users', '100'));
const ENDPOINT = getArg('endpoint', 'lottery');
const BASE_URL = getArg('base-url', 'http://localhost:3000');

// 테스트 결과 통계
const stats = {
    total: 0,
    success: 0,
    failed: 0,
    errors: [],
    responseTimes: [],
    startTime: null,
    endTime: null
};

/**
 * 랜덤 사용자 생성 (테스트용)
 */
function generateTestUser() {
    const empno = `TEST${String(Math.floor(Math.random() * 1000000)).padStart(6, '0')}`;
    const tokenSecret = crypto.randomBytes(32).toString('hex');
    return { empno, tokenSecret };
}

/**
 * 추첨번호 발급 테스트
 */
async function testLotteryIssue(user, index) {
    const startTime = Date.now();
    try {
        // 실제로는 인증된 토큰이 필요하지만, 테스트를 위해 간단히 구현
        const response = await axios.post(`${BASE_URL}/api/lottery/issue`, {
            qrData: 'test-qr-data'
        }, {
            headers: {
                'Authorization': `Bearer test-token-${index}`,
                'kb-auth': `Bearer test-token-${index}`
            },
            timeout: 10000
        });
        
        const responseTime = Date.now() - startTime;
        stats.success++;
        stats.responseTimes.push(responseTime);
        return { success: true, responseTime, index };
    } catch (error) {
        const responseTime = Date.now() - startTime;
        stats.failed++;
        stats.errors.push({
            index,
            error: error.message,
            status: error.response?.status,
            responseTime
        });
        return { success: false, error: error.message, responseTime, index };
    } finally {
        stats.total++;
    }
}

/**
 * 부스 QR 스캔 테스트
 */
async function testBoothScan(user, index) {
    const startTime = Date.now();
    try {
        const boothCode = `booth${Math.floor(Math.random() * 6) + 1}`;
        const response = await axios.post(`${BASE_URL}/api/booth/scan`, {
            encryptedData: `test-booth-qr-${boothCode}`,
            latitude: 37.5665 + (Math.random() - 0.5) * 0.01,
            longitude: 126.9780 + (Math.random() - 0.5) * 0.01
        }, {
            headers: {
                'Authorization': `Bearer test-token-${index}`,
                'kb-auth': `Bearer test-token-${index}`
            },
            timeout: 10000
        });
        
        const responseTime = Date.now() - startTime;
        stats.success++;
        stats.responseTimes.push(responseTime);
        return { success: true, responseTime, index, boothCode };
    } catch (error) {
        const responseTime = Date.now() - startTime;
        stats.failed++;
        stats.errors.push({
            index,
            error: error.message,
            status: error.response?.status,
            responseTime
        });
        return { success: false, error: error.message, responseTime, index };
    } finally {
        stats.total++;
    }
}

/**
 * 인증 테스트
 */
async function testAuth(user, index) {
    const startTime = Date.now();
    try {
        const response = await axios.post(`${BASE_URL}/api/auth/login`, {
            empno: user.empno,
            lastNumber: String(Math.floor(Math.random() * 10000)).padStart(4, '0')
        }, {
            timeout: 10000
        });
        
        const responseTime = Date.now() - startTime;
        stats.success++;
        stats.responseTimes.push(responseTime);
        return { success: true, responseTime, index };
    } catch (error) {
        const responseTime = Date.now() - startTime;
        stats.failed++;
        stats.errors.push({
            index,
            error: error.message,
            status: error.response?.status,
            responseTime
        });
        return { success: false, error: error.message, responseTime, index };
    } finally {
        stats.total++;
    }
}

/**
 * 테스트 실행
 */
async function runLoadTest() {
    console.log('='.repeat(60));
    console.log('부하 테스트 시작');
    console.log('='.repeat(60));
    console.log(`동시 사용자 수: ${CONCURRENT_USERS}`);
    console.log(`테스트 엔드포인트: ${ENDPOINT}`);
    console.log(`서버 URL: ${BASE_URL}`);
    console.log('='.repeat(60));
    console.log('');

    stats.startTime = Date.now();
    
    // 테스트 함수 선택
    let testFunction;
    switch (ENDPOINT) {
        case 'lottery':
            testFunction = testLotteryIssue;
            break;
        case 'booth':
            testFunction = testBoothScan;
            break;
        case 'auth':
            testFunction = testAuth;
            break;
        default:
            console.error(`알 수 없는 엔드포인트: ${ENDPOINT}`);
            process.exit(1);
    }

    // 동시 요청 생성
    const users = Array.from({ length: CONCURRENT_USERS }, (_, i) => generateTestUser());
    const promises = users.map((user, index) => testFunction(user, index));

    // 진행 상황 모니터링
    const progressInterval = setInterval(() => {
        const completed = stats.total;
        const progress = ((completed / CONCURRENT_USERS) * 100).toFixed(1);
        process.stdout.write(`\r진행 상황: ${completed}/${CONCURRENT_USERS} (${progress}%) - 성공: ${stats.success}, 실패: ${stats.failed}`);
    }, 100);

    // 모든 요청 완료 대기
    await Promise.allSettled(promises);
    
    clearInterval(progressInterval);
    stats.endTime = Date.now();

    // 결과 출력
    console.log('\n');
    console.log('='.repeat(60));
    console.log('부하 테스트 결과');
    console.log('='.repeat(60));
    console.log(`총 요청 수: ${stats.total}`);
    console.log(`성공: ${stats.success} (${((stats.success / stats.total) * 100).toFixed(2)}%)`);
    console.log(`실패: ${stats.failed} (${((stats.failed / stats.total) * 100).toFixed(2)}%)`);
    console.log(`총 소요 시간: ${((stats.endTime - stats.startTime) / 1000).toFixed(2)}초`);
    
    if (stats.responseTimes.length > 0) {
        const avgResponseTime = stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length;
        const minResponseTime = Math.min(...stats.responseTimes);
        const maxResponseTime = Math.max(...stats.responseTimes);
        const sorted = [...stats.responseTimes].sort((a, b) => a - b);
        const p50 = sorted[Math.floor(sorted.length * 0.5)];
        const p95 = sorted[Math.floor(sorted.length * 0.95)];
        const p99 = sorted[Math.floor(sorted.length * 0.99)];
        
        console.log('\n응답 시간 통계:');
        console.log(`  평균: ${avgResponseTime.toFixed(2)}ms`);
        console.log(`  최소: ${minResponseTime}ms`);
        console.log(`  최대: ${maxResponseTime}ms`);
        console.log(`  중간값 (P50): ${p50}ms`);
        console.log(`  P95: ${p95}ms`);
        console.log(`  P99: ${p99}ms`);
    }
    
    if (stats.errors.length > 0) {
        console.log('\n주요 오류:');
        const errorCounts = {};
        stats.errors.forEach(e => {
            const key = e.error || `HTTP ${e.status}`;
            errorCounts[key] = (errorCounts[key] || 0) + 1;
        });
        Object.entries(errorCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .forEach(([error, count]) => {
                console.log(`  ${error}: ${count}회`);
            });
    }
    
    console.log('='.repeat(60));
    
    // 성공률이 95% 미만이면 경고
    const successRate = (stats.success / stats.total) * 100;
    if (successRate < 95) {
        console.warn(`\n⚠️  경고: 성공률이 95% 미만입니다 (${successRate.toFixed(2)}%)`);
        process.exit(1);
    }
}

// 스크립트 실행
if (require.main === module) {
    runLoadTest().catch(error => {
        console.error('부하 테스트 실행 중 오류:', error);
        process.exit(1);
    });
}

module.exports = { runLoadTest };

