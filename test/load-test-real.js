/**
 * 개선된 부하 테스트 스크립트
 * 실제 인증된 사용자를 사용하여 정확한 부하 테스트 수행
 * 
 * 사용법:
 * node test/load-test-real.js
 * 
 * 옵션:
 * - --users=100: 동시 사용자 수 (기본값: 100)
 * - --endpoint=lottery: 테스트할 엔드포인트 (lottery, booth) (기본값: lottery)
 * - --base-url=http://localhost:3000: 서버 URL (기본값: http://localhost:3000)
 * - --create-users: 테스트 전에 사용자 생성 (기본값: true)
 * - --cleanup: 테스트 후 사용자 정리 (기본값: false)
 */

const axios = require('axios');
const crypto = require('crypto');

// 명령줄 인자 파싱
const args = process.argv.slice(2);
const getArg = (name, defaultValue) => {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg ? arg.split('=')[1] : defaultValue;
};

const getBoolArg = (name, defaultValue) => {
    const arg = args.find(a => a.startsWith(`--${name}`));
    if (!arg) return defaultValue;
    if (arg.includes('=')) {
        return arg.split('=')[1] === 'true';
    }
    return true;
};

const CONCURRENT_USERS = parseInt(getArg('users', '100'));
const ENDPOINT = getArg('endpoint', 'lottery');
const BASE_URL = getArg('base-url', 'http://localhost:3000');
const CREATE_USERS = getBoolArg('create-users', true);
const CLEANUP = getBoolArg('cleanup', false);

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

// 생성된 사용자 정보 저장
const createdUsers = [];

/**
 * 테스트 사용자 생성 (관리자 API 사용)
 */
async function createTestUsers(count) {
    console.log(`\n📝 테스트 사용자 ${count}명 생성 중...`);
    
    try {
        // 관리자 로그인
        const adminResponse = await axios.post(`${BASE_URL}/api/admin/login`, {
            username: 'foruma',
            password: 'forumPassPass'
        });
        
        if (!adminResponse.data.success) {
            throw new Error('관리자 로그인 실패');
        }
        
        const adminToken = adminResponse.data.token;
        
        // 테스트 사용자 생성 API 호출
        const createResponse = await axios.post(
            `${BASE_URL}/api/admin/generate-lottery-test-users`,
            { count },
            {
                headers: {
                    'Authorization': `Bearer ${adminToken}`,
                    'kb-auth': `Bearer ${adminToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        if (createResponse.data.success) {
            console.log(`✅ 테스트 사용자 ${count}명 생성 완료`);
            return true;
        } else {
            throw new Error(createResponse.data.message || '사용자 생성 실패');
        }
    } catch (error) {
        console.error('❌ 테스트 사용자 생성 실패:', error.message);
        if (error.response) {
            console.error('응답:', error.response.data);
        }
        return false;
    }
}

/**
 * 사용자 인증 및 토큰 획득
 */
async function authenticateUser(empno, index) {
    try {
        // 테스트용 휴대번호 뒷자리 (랜덤)
        const lastNumber = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
        
        const response = await axios.post(`${BASE_URL}/api/auth/login`, {
            empno: empno,
            lastNumber: lastNumber
        }, {
            timeout: 10000
        });
        
        if (response.data.success && response.data.token) {
            return {
                empno,
                token: response.data.token,
                user: response.data.user
            };
        }
        
        return null;
    } catch (error) {
        // 인증 실패는 무시 (테스트 사용자는 실제 KB API 인증이 안 될 수 있음)
        return null;
    }
}

/**
 * 추첨번호 발급 테스트 (실제 인증 토큰 사용)
 */
async function testLotteryIssue(userInfo, index) {
    const startTime = Date.now();
    
    if (!userInfo || !userInfo.token) {
        stats.failed++;
        stats.total++;
        stats.errors.push({
            index,
            error: '인증 실패',
            status: 401
        });
        return { success: false, error: '인증 실패', index };
    }
    
    try {
        // 실제 QR 데이터 생성 (간단한 테스트용)
        const qrData = Buffer.from(JSON.stringify({
            type: 'lottery_access',
            issuedAt: Date.now(),
            expiresAt: null,
            nonce: crypto.randomBytes(12).toString('hex')
        })).toString('base64');
        
        const response = await axios.post(`${BASE_URL}/api/lottery/issue`, {
            qrData: qrData
        }, {
            headers: {
                'Authorization': `Bearer ${userInfo.token}`,
                'kb-auth': `Bearer ${userInfo.token}`,
                'Content-Type': 'application/json'
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
async function testBoothScan(userInfo, index) {
    const startTime = Date.now();
    
    if (!userInfo || !userInfo.token) {
        stats.failed++;
        stats.total++;
        stats.errors.push({
            index,
            error: '인증 실패',
            status: 401
        });
        return { success: false, error: '인증 실패', index };
    }
    
    try {
        const boothCode = `booth${Math.floor(Math.random() * 6) + 1}`;
        const encryptedData = Buffer.from(JSON.stringify({
            boothCode,
            timestamp: Date.now()
        })).toString('base64');
        
        const response = await axios.post(`${BASE_URL}/api/booth/scan`, {
            encryptedData: encryptedData,
            latitude: 37.5665 + (Math.random() - 0.5) * 0.01,
            longitude: 126.9780 + (Math.random() - 0.5) * 0.01
        }, {
            headers: {
                'Authorization': `Bearer ${userInfo.token}`,
                'kb-auth': `Bearer ${userInfo.token}`,
                'Content-Type': 'application/json'
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
 * 테스트 사용자 정리
 */
async function cleanupTestUsers() {
    if (!CLEANUP) return;
    
    console.log('\n🧹 테스트 사용자 정리 중...');
    
    try {
        const adminResponse = await axios.post(`${BASE_URL}/api/admin/login`, {
            username: 'foruma',
            password: 'forumPassPass'
        });
        
        if (!adminResponse.data.success) {
            console.warn('⚠️  관리자 로그인 실패 - 수동 정리 필요');
            return;
        }
        
        const adminToken = adminResponse.data.token;
        
        // 테스트 사용자 삭제
        const deleteResponse = await axios.post(
            `${BASE_URL}/api/admin/delete-lottery-test-users`,
            {},
            {
                headers: {
                    'Authorization': `Bearer ${adminToken}`,
                    'kb-auth': `Bearer ${adminToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        if (deleteResponse.data.success) {
            console.log('✅ 테스트 사용자 정리 완료');
        }
    } catch (error) {
        console.warn('⚠️  테스트 사용자 정리 실패:', error.message);
    }
}

/**
 * 테스트 실행
 */
async function runLoadTest() {
    console.log('='.repeat(60));
    console.log('부하 테스트 시작 (실제 인증 사용)');
    console.log('='.repeat(60));
    console.log(`동시 사용자 수: ${CONCURRENT_USERS}`);
    console.log(`테스트 엔드포인트: ${ENDPOINT}`);
    console.log(`서버 URL: ${BASE_URL}`);
    console.log(`사용자 자동 생성: ${CREATE_USERS ? '예' : '아니오'}`);
    console.log(`테스트 후 정리: ${CLEANUP ? '예' : '아니오'}`);
    console.log('='.repeat(60));
    
    // 1. 테스트 사용자 생성
    if (CREATE_USERS) {
        const created = await createTestUsers(CONCURRENT_USERS);
        if (!created) {
            console.error('\n❌ 테스트 사용자 생성 실패. 테스트를 중단합니다.');
            process.exit(1);
        }
    }
    
    // 2. 사용자 인증 (순차적으로 처리하여 서버 부하 방지)
    console.log('\n🔐 사용자 인증 중...');
    const authenticatedUsers = [];
    const testEmpnos = Array.from({ length: CONCURRENT_USERS }, (_, i) => 
        `LOTTERY_TEST${String(i + 1).padStart(3, '0')}`
    );
    
    // 배치로 인증 (10명씩)
    const BATCH_SIZE = 10;
    for (let i = 0; i < testEmpnos.length; i += BATCH_SIZE) {
        const batch = testEmpnos.slice(i, i + BATCH_SIZE);
        const authPromises = batch.map((empno, idx) => 
            authenticateUser(empno, i + idx)
        );
        const results = await Promise.allSettled(authPromises);
        
        results.forEach((result, idx) => {
            if (result.status === 'fulfilled' && result.value) {
                authenticatedUsers.push(result.value);
            }
        });
        
        process.stdout.write(`\r인증 진행: ${Math.min(i + BATCH_SIZE, testEmpnos.length)}/${testEmpnos.length} (성공: ${authenticatedUsers.length})`);
    }
    
    console.log(`\n✅ 인증 완료: ${authenticatedUsers.length}/${CONCURRENT_USERS}명`);
    
    if (authenticatedUsers.length === 0) {
        console.error('\n❌ 인증된 사용자가 없습니다. 테스트를 중단합니다.');
        await cleanupTestUsers();
        process.exit(1);
    }
    
    // 3. 테스트 함수 선택
    let testFunction;
    switch (ENDPOINT) {
        case 'lottery':
            testFunction = testLotteryIssue;
            break;
        case 'booth':
            testFunction = testBoothScan;
            break;
        default:
            console.error(`알 수 없는 엔드포인트: ${ENDPOINT}`);
            await cleanupTestUsers();
            process.exit(1);
    }
    
    // 4. 부하 테스트 실행
    console.log('\n🚀 부하 테스트 시작...\n');
    stats.startTime = Date.now();
    
    // 인증된 사용자들로 동시 요청 생성
    const promises = authenticatedUsers.map((userInfo, index) => 
        testFunction(userInfo, index)
    );
    
    // 진행 상황 모니터링
    const progressInterval = setInterval(() => {
        const completed = stats.total;
        const total = authenticatedUsers.length;
        const progress = ((completed / total) * 100).toFixed(1);
        process.stdout.write(`\r진행 상황: ${completed}/${total} (${progress}%) - 성공: ${stats.success}, 실패: ${stats.failed}`);
    }, 100);
    
    // 모든 요청 완료 대기
    await Promise.allSettled(promises);
    
    clearInterval(progressInterval);
    stats.endTime = Date.now();
    
    // 5. 결과 출력
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
    
    // 6. 정리
    await cleanupTestUsers();
    
    // 7. 성공률 검증
    const successRate = (stats.success / stats.total) * 100;
    if (successRate < 95) {
        console.warn(`\n⚠️  경고: 성공률이 95% 미만입니다 (${successRate.toFixed(2)}%)`);
        process.exit(1);
    } else {
        console.log(`\n✅ 테스트 통과: 성공률 ${successRate.toFixed(2)}%`);
    }
}

// 스크립트 실행
if (require.main === module) {
    runLoadTest().catch(error => {
        console.error('\n❌ 부하 테스트 실행 중 오류:', error);
        cleanupTestUsers().finally(() => {
            process.exit(1);
        });
    });
}

module.exports = { runLoadTest };

