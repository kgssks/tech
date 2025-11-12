(() => {
    const params = new URLSearchParams(window.location.search);
    const qrData = params.get('data');

    const resultEl = document.getElementById('lotteryIssueResult');
    const messageEl = document.getElementById('lotteryIssueMessage');
    const alertEl = document.getElementById('lotteryIssueAlert');
    const issueButton = document.getElementById('lotteryIssueButton');
    const refreshButton = document.getElementById('lotteryIssueRefresh');

    function setAlert(type, text) {
        if (!alertEl) return;
        if (!text) {
            alertEl.style.display = 'none';
            alertEl.textContent = '';
            alertEl.className = 'alert alert-warning';
            return;
        }
        alertEl.className = `alert alert-${type}`;
        alertEl.textContent = text;
        alertEl.style.display = 'block';
    }

    function setResult(number, options = {}) {
        if (resultEl) {
            if (number === null || number === undefined) {
                resultEl.textContent = options.placeholder ?? '—';
            } else {
                resultEl.textContent = String(number).padStart(3, '0');
            }
        }

        if (messageEl) {
            messageEl.textContent = options.message ?? '';
        }
    }

    async function fetchCurrentLotteryNumber() {
        const token = getToken();
        if (!token) {
            setResult(null, { placeholder: '로그인 필요', message: '로그인을 다시 진행해주세요.' });
            return;
        }

        try {
            const response = await fetch('/api/data/lottery-number', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'kb-auth': `Bearer ${token}`
                }
            });

            const data = await response.json();

            if (data.success && data.lotteryNumber) {
                setResult(data.lotteryNumber, { message: '이미 부여된 추첨번호입니다.' });
                issueButton?.setAttribute('disabled', 'disabled');
            } else {
                setResult(null, { placeholder: '미발급', message: '아직 추첨번호가 없습니다. 아래 버튼을 눌러 발급받으세요.' });
                issueButton?.removeAttribute('disabled');
            }
        } catch (error) {
            console.error('추첨번호 조회 오류:', error);
            setAlert('danger', '추첨번호 조회 중 오류가 발생했습니다.');
        }
    }

    async function issueLotteryNumber() {
        const token = getToken();
        if (!token) {
            window.location.href = '/app/event/auth.html';
            return;
        }

        if (!qrData) {
            setAlert('danger', '유효한 QR 데이터가 없습니다. 현장 스태프에게 문의해주세요.');
            return;
        }

        issueButton?.setAttribute('disabled', 'disabled');
        setAlert('info', '추첨번호를 발급 중입니다. 잠시만 기다려주세요.');

        try {
            const response = await fetch('/api/lottery/issue', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'kb-auth': `Bearer ${token}`
                },
                body: JSON.stringify({ qrData })
            });

            const data = await response.json();

            if (data.success) {
                setAlert('success', data.alreadyIssued ? '이미 발급된 추첨번호를 안내해드렸습니다.' : '추첨번호가 발급되었습니다!');
                setResult(data.lotteryNumber, {
                    message: `${data.user?.deptname || ''} ${data.user?.empname || ''} ${data.user?.posname || ''}`.trim()
                });
                issueButton?.setAttribute('disabled', 'disabled');
            } else {
                setAlert('danger', data.message || '추첨번호 발급 중 오류가 발생했습니다.');
                issueButton?.removeAttribute('disabled');
            }
        } catch (error) {
            console.error('추첨번호 발급 오류:', error);
            setAlert('danger', '추첨번호 발급 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
            issueButton?.removeAttribute('disabled');
        }
    }

    if (!qrData) {
        setAlert('warning', 'QR 코드 데이터가 확인되지 않습니다. 현장 전용 QR을 다시 스캔해주세요.');
        issueButton?.setAttribute('disabled', 'disabled');
    }

    issueButton?.addEventListener('click', issueLotteryNumber);
    refreshButton?.addEventListener('click', fetchCurrentLotteryNumber);

    // 초기 상태 확인
    fetchCurrentLotteryNumber();
})();


