module.exports = {
    apps: [{
        name: 'tech-forum',
        script: './app.js', // 또는 실제 진입점 파일
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '1G',
        env: {
            NODE_ENV: 'development',
            PORT: 8000
        },
        env_production: {
            NODE_ENV: 'production',
            PORT: 8000
        },
        error_file: './logs/err.log',
        out_file: './logs/out.log',
        log_file: './logs/combined.log',
        time: true
    }]
};
