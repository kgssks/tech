/**
 * 모니터링 유틸리티
 * 동시 접속 패턴 및 성능 추적
 */

const activeConnections = new Map(); // IP별 활성 연결 추적
const connectionHistory = []; // 연결 이력 (최근 1000개)
const MAX_HISTORY = 1000;

/**
 * 연결 시작 추적
 * @param {string} ip - 클라이언트 IP
 * @param {string} path - 요청 경로
 */
function trackConnectionStart(ip, path) {
  const timestamp = Date.now();
  const connectionId = `${ip}-${timestamp}-${Math.random()}`;
  
  activeConnections.set(connectionId, {
    ip,
    path,
    startTime: timestamp
  });
  
  // 이력에 추가 (최대 개수 제한)
  connectionHistory.push({
    connectionId,
    ip,
    path,
    startTime: timestamp,
    endTime: null,
    duration: null
  });
  
  if (connectionHistory.length > MAX_HISTORY) {
    connectionHistory.shift();
  }
  
  return connectionId;
}

/**
 * 연결 종료 추적
 * @param {string} connectionId - 연결 ID
 * @param {number} statusCode - HTTP 상태 코드
 */
function trackConnectionEnd(connectionId, statusCode) {
  const connection = activeConnections.get(connectionId);
  if (!connection) return;
  
  const endTime = Date.now();
  const duration = endTime - connection.startTime;
  
  // 이력 업데이트
  const historyItem = connectionHistory.find(h => h.connectionId === connectionId);
  if (historyItem) {
    historyItem.endTime = endTime;
    historyItem.duration = duration;
    historyItem.statusCode = statusCode;
  }
  
  activeConnections.delete(connectionId);
}

/**
 * 현재 활성 연결 수 조회
 */
function getActiveConnections() {
  return {
    count: activeConnections.size,
    connections: Array.from(activeConnections.entries()).map(([id, data]) => ({
      id,
      ...data,
      duration: Date.now() - data.startTime
    }))
  };
}

/**
 * IP별 통계 조회
 * @param {number} timeWindow - 시간 윈도우 (ms, 기본값: 60000 = 1분)
 */
function getIPStatistics(timeWindow = 60000) {
  const now = Date.now();
  const windowStart = now - timeWindow;
  
  // 시간 윈도우 내의 연결만 필터링
  const recentConnections = connectionHistory.filter(
    h => h.startTime >= windowStart && h.endTime
  );
  
  // IP별 통계 계산
  const ipStats = {};
  recentConnections.forEach(conn => {
    if (!ipStats[conn.ip]) {
      ipStats[conn.ip] = {
        ip: conn.ip,
        count: 0,
        avgResponseTime: 0,
        errorCount: 0,
        successCount: 0,
        totalResponseTime: 0
      };
    }
    
    const stats = ipStats[conn.ip];
    stats.count++;
    stats.totalResponseTime += conn.duration || 0;
    
    if (conn.statusCode) {
      if (conn.statusCode >= 400) {
        stats.errorCount++;
      } else {
        stats.successCount++;
      }
    }
  });
  
  // 평균 응답 시간 계산
  Object.values(ipStats).forEach(stats => {
    if (stats.count > 0) {
      stats.avgResponseTime = Math.round(stats.totalResponseTime / stats.count);
    }
  });
  
  return Object.values(ipStats).sort((a, b) => b.count - a.count);
}

/**
 * 경로별 통계 조회
 * @param {number} timeWindow - 시간 윈도우 (ms)
 */
function getPathStatistics(timeWindow = 60000) {
  const now = Date.now();
  const windowStart = now - timeWindow;
  
  const recentConnections = connectionHistory.filter(
    h => h.startTime >= windowStart && h.endTime
  );
  
  const pathStats = {};
  recentConnections.forEach(conn => {
    if (!pathStats[conn.path]) {
      pathStats[conn.path] = {
        path: conn.path,
        count: 0,
        avgResponseTime: 0,
        errorCount: 0,
        successCount: 0,
        totalResponseTime: 0
      };
    }
    
    const stats = pathStats[conn.path];
    stats.count++;
    stats.totalResponseTime += conn.duration || 0;
    
    if (conn.statusCode) {
      if (conn.statusCode >= 400) {
        stats.errorCount++;
      } else {
        stats.successCount++;
      }
    }
  });
  
  Object.values(pathStats).forEach(stats => {
    if (stats.count > 0) {
      stats.avgResponseTime = Math.round(stats.totalResponseTime / stats.count);
    }
  });
  
  return Object.values(pathStats).sort((a, b) => b.count - a.count);
}

/**
 * 동시 접속 피크 조회
 * @param {number} timeWindow - 시간 윈도우 (ms)
 */
function getPeakConcurrency(timeWindow = 60000) {
  const now = Date.now();
  const windowStart = now - timeWindow;
  
  // 시간대별 동시 접속 수 계산
  const timeSlots = {};
  connectionHistory.forEach(conn => {
    if (conn.startTime >= windowStart && conn.endTime) {
      const startSlot = Math.floor(conn.startTime / 1000) * 1000; // 1초 단위
      const endSlot = Math.floor(conn.endTime / 1000) * 1000;
      
      for (let slot = startSlot; slot <= endSlot; slot += 1000) {
        if (!timeSlots[slot]) {
          timeSlots[slot] = 0;
        }
        timeSlots[slot]++;
      }
    }
  });
  
  const peak = Math.max(...Object.values(timeSlots), 0);
  const peakTime = Object.entries(timeSlots).find(([_, count]) => count === peak)?.[0];
  
  return {
    peak,
    peakTime: peakTime ? new Date(parseInt(peakTime)).toISOString() : null,
    current: activeConnections.size
  };
}

/**
 * 통계 초기화 (테스트용)
 */
function resetStatistics() {
  activeConnections.clear();
  connectionHistory.length = 0;
}

module.exports = {
  trackConnectionStart,
  trackConnectionEnd,
  getActiveConnections,
  getIPStatistics,
  getPathStatistics,
  getPeakConcurrency,
  resetStatistics
};

