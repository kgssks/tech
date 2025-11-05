// 라디오 버튼과 점수 표시 동기화
function setupScoreInputs() {
    const inputs = [
        { radio: 'overallRadio', display: 'overallScoreDisplay' },
        { radio: 'boothRadio', display: 'boothScoreDisplay' },
        { radio: 'sessionRadio', display: 'sessionScoreDisplay' },
        { radio: 'websiteRadio', display: 'websiteScoreDisplay' },
        { radio: 'prizeRadio', display: 'prizeScoreDisplay' }
    ];

    inputs.forEach(({ radio, display }) => {
        const radioGroup = document.querySelectorAll(`input[name="${radio}"]`);
        const displayEl = document.getElementById(display);

        // 라디오 버튼 변경 시 점수 표시 업데이트
        radioGroup.forEach(radioEl => {
            radioEl.addEventListener('change', (e) => {
                displayEl.textContent = e.target.value;
            });
        });
    });
}

// 설문 제출
async function submitSurvey(formData) {
    try {
        const response = await fetch(`/api/survey/submit`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('설문 제출 오류:', error);
        return { success: false, message: '네트워크 오류가 발생했습니다.' };
    }
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', () => {
    setupScoreInputs();

    const form = document.getElementById('surveyForm');
    const messageDiv = document.getElementById('surveyMessage');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // 필수 항목 확인
        const overallValue = document.querySelector('input[name="overallRadio"]:checked')?.value;
        const boothValue = document.querySelector('input[name="boothRadio"]:checked')?.value;
        const sessionValue = document.querySelector('input[name="sessionRadio"]:checked')?.value;
        const websiteValue = document.querySelector('input[name="websiteRadio"]:checked')?.value;
        const prizeValue = document.querySelector('input[name="prizeRadio"]:checked')?.value;

        if (!overallValue || !boothValue || !sessionValue || !websiteValue || !prizeValue) {
            messageDiv.innerHTML = '<div class="alert alert-danger">필수 항목을 모두 입력해주세요.</div>';
            return;
        }

        const formData = {
            overallSatisfaction: parseInt(overallValue),
            boothSatisfaction: parseInt(boothValue),
            sessionSatisfaction: parseInt(sessionValue),
            websiteSatisfaction: parseInt(websiteValue),
            prizeSatisfaction: parseInt(prizeValue),
            satisfiedPoints: document.getElementById('satisfiedPoints').value.trim() || null,
            improvementPoints: document.getElementById('improvementPoints').value.trim() || null
        };

        const result = await submitSurvey(formData);

        if (result.success) {
            messageDiv.innerHTML = '<div class="alert alert-success">설문이 성공적으로 제출되었습니다! 감사합니다.</div>';
            form.reset();
            // 기본값으로 5점 설정
            document.querySelectorAll('input[type="radio"][value="5"]').forEach(radio => {
                radio.checked = true;
            });
            document.querySelectorAll('.score-display').forEach(display => {
                display.textContent = '5';
            });
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
        } else {
            messageDiv.innerHTML = `<div class="alert alert-danger">${result.message || '설문 제출에 실패했습니다.'}</div>`;
        }
    });
});
