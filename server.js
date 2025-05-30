const express = require('express');
const path = require('path');
const fs = require('fs');
const basicAuth = require('express-basic-auth');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const app = express();
const port = process.env.PORT || 8080;

// Basic認証用のパスワード（環境変数から取得）
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'DefaultAdmin123!';

console.log('✅ Server starting with POST credentials mode');

// セキュリティミドルウェア
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            formAction: ["'self'", "https://www.paymentstation.jp"],
            connectSrc: ["'self'"],
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

// Basic認証（本番環境では必須）
if (process.env.NODE_ENV === 'production' || process.env.ENABLE_AUTH === 'true') {
    app.use(basicAuth({
        users: { 'admin': ADMIN_PASSWORD },
        challenge: true,
        realm: 'Secure Bill Registration Area',
        unauthorizedResponse: (req) => {
            return `
                <!DOCTYPE html>
                <html lang="ja">
                <head>
                    <meta charset="UTF-8">
                    <title>認証が必要です</title>
                    <style>
                        body { 
                            font-family: sans-serif; 
                            text-align: center; 
                            padding: 50px;
                            background-color: #f5f5f5;
                        }
                        .container {
                            background: white;
                            padding: 30px;
                            border-radius: 12px;
                            max-width: 500px;
                            margin: 0 auto;
                            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>🔐 認証が必要です</h1>
                        <p>このページにアクセスするには認証が必要です。</p>
                        <p>管理者にお問い合わせください。</p>
                    </div>
                </body>
                </html>
            `;
        }
    }));
    console.log('🔐 Basic authentication enabled');
}

// レート制限
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分
    max: 20, // 最大20リクエスト
    message: {
        error: 'Too many requests',
        message: 'アクセス数が上限を超えました。15分後に再度お試しください。',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).send(`
            <!DOCTYPE html>
            <html lang="ja">
            <head>
                <meta charset="UTF-8">
                <title>アクセス制限</title>
                <style>
                    body { 
                        font-family: sans-serif; 
                        text-align: center; 
                        padding: 50px;
                        background-color: #f5f5f5;
                    }
                    .container {
                        background: white;
                        padding: 30px;
                        border-radius: 12px;
                        max-width: 500px;
                        margin: 0 auto;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>⚠️ アクセス制限</h1>
                    <p>アクセス数が上限を超えました。</p>
                    <p>15分後に再度お試しください。</p>
                </div>
            </body>
            </html>
        `);
    }
});

app.use('/', limiter);

// リクエスト処理ミドルウェア
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(__dirname));

// セキュリティログ
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent') || 'Unknown';
    
    console.log(`[${timestamp}] ${req.method} ${req.url} - IP: ${ip} - UA: ${userAgent.substring(0, 100)}`);
    next();
});

// GETアクセス（パラメータなしの場合のみ許可）
app.get('/', (req, res) => {
    console.log('GET request received');
    
    // URLパラメータがある場合は拒否
    if (Object.keys(req.query).length > 0) {
        console.log('GET request with parameters rejected');
        return res.status(400).send(`
            <!DOCTYPE html>
            <html lang="ja">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>不正なアクセス</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                        max-width: 600px;
                        margin: 50px auto;
                        padding: 20px;
                        background-color: #f5f5f5;
                    }
                    .error-container {
                        background: white;
                        padding: 30px;
                        border-radius: 12px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        text-align: center;
                    }
                    .error-icon {
                        font-size: 48px;
                        color: #e74c3c;
                        margin-bottom: 20px;
                    }
                    h1 {
                        color: #e74c3c;
                        margin-bottom: 20px;
                    }
                </style>
            </head>
            <body>
                <div class="error-container">
                    <div class="error-icon">🚫</div>
                    <h1>不正なアクセスです</h1>
                    <p>このページは正しいフォームからのみアクセス可能です。</p>
                    <p>URLパラメータを使用したアクセスは許可されていません。</p>
                </div>
            </body>
            </html>
        `);
    }
    
    // パラメータなしのアクセス - 通常のHTMLを返す
    res.sendFile(path.join(__dirname, 'web_debit_navigate_page.html'));
});

// POSTアクセス（機密情報含む）
app.post('/', (req, res) => {
    console.log('POST request received');
    console.log('POST data received:', {
        bill_no: req.body.bill_no ? '***masked***' : 'empty',
        bill_name: req.body.bill_name ? '***masked***' : 'empty',
        bill_kana: req.body.bill_kana ? '***masked***' : 'empty',
        bill_zip: req.body.bill_zip ? '***masked***' : 'empty',
        bill_adr_1: req.body.bill_adr_1 ? '***masked***' : 'empty',
        bill_phon: req.body.bill_phon ? '***masked***' : 'empty',
        bill_mail: req.body.bill_mail ? '***masked***' : 'empty',
        has_shop_pwd: !!req.body.shop_pwd,
        has_fs_token: !!req.body.fs_token
    });
    
    // POSTデータから値を取得
    const formData = {
        // 請求者データ
        bill_no: req.body.bill_no || '',
        bill_name: req.body.bill_name || '',
        bill_kana: req.body.bill_kana || '',
        bill_zip: req.body.bill_zip || '',
        bill_adr_1: req.body.bill_adr_1 || '',
        bill_phon: req.body.bill_phon || '',
        bill_mail: req.body.bill_mail || '',
        
        // 機密情報
        shop_pwd: req.body.shop_pwd || '',
        fs_token: req.body.fs_token || ''
    };
    
    // 必須フィールドの検証
    if (!formData.bill_no || !formData.bill_name || !formData.bill_kana) {
        console.log('Missing required fields');
        return res.status(400).send(`
            <!DOCTYPE html>
            <html lang="ja">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>エラー</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                        max-width: 600px;
                        margin: 50px auto;
                        padding: 20px;
                        background-color: #f5f5f5;
                    }
                    .error-container {
                        background: white;
                        padding: 30px;
                        border-radius: 12px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        text-align: center;
                    }
                    .error-icon {
                        font-size: 48px;
                        color: #e74c3c;
                        margin-bottom: 20px;
                    }
                    h1 {
                        color: #e74c3c;
                        margin-bottom: 20px;
                    }
                    .back-btn {
                        background-color: #5cb3a6;
                        color: white;
                        padding: 12px 24px;
                        border: none;
                        border-radius: 6px;
                        font-size: 16px;
                        cursor: pointer;
                        text-decoration: none;
                        display: inline-block;
                    }
                </style>
            </head>
            <body>
                <div class="error-container">
                    <div class="error-icon">⚠️</div>
                    <h1>必要な情報が不足しています</h1>
                    <p>請求番号、お名前、お名前（カナ）は必須項目です。</p>
                    <button onclick="history.back()" class="back-btn">
                        ← 前の画面に戻る
                    </button>
                </div>
            </body>
            </html>
        `);
    }
    
    // 機密情報の検証
    if (!formData.shop_pwd || !formData.fs_token) {
        console.log('Missing security credentials');
        return res.status(400).send(`
            <!DOCTYPE html>
            <html lang="ja">
            <head>
                <meta charset="UTF-8">
                <title>認証エラー</title>
                <style>
                    body {
                        font-family: sans-serif;
                        max-width: 600px;
                        margin: 50px auto;
                        padding: 20px;
                        background-color: #f5f5f5;
                        text-align: center;
                    }
                    .error-container {
                        background: white;
                        padding: 30px;
                        border-radius: 12px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    }
                </style>
            </head>
            <body>
                <div class="error-container">
                    <h1>❌ 認証情報エラー</h1>
                    <p>必要な認証情報が不足しています。</p>
                    <p>システム管理者にお問い合わせください。</p>
                </div>
            </body>
            </html>
        `);
    }
    
    sendHTMLWithData(res, formData);
});

// HTMLにデータを埋め込んで送信する関数
function sendHTMLWithData(res, formData) {
    try {
        // HTMLファイルを読み込み
        let html = fs.readFileSync(path.join(__dirname, 'web_debit_navigate_page.html'), 'utf8');
        
        // セキュリティのため、データをサニタイズ
        const sanitizedData = {
            bill_no: sanitizeInput(formData.bill_no),
            bill_name: sanitizeInput(formData.bill_name),
            bill_kana: sanitizeInput(formData.bill_kana),
            bill_zip: sanitizeInput(formData.bill_zip),
            bill_adr_1: sanitizeInput(formData.bill_adr_1),
            bill_phon: sanitizeInput(formData.bill_phon),
            bill_mail: sanitizeInput(formData.bill_mail),
            shop_pwd: sanitizeInput(formData.shop_pwd),
            fs_token: sanitizeInput(formData.fs_token)
        };
        
        // データをJavaScriptとして埋め込み（機密情報も含む）
        const dataScript = `
        <script>
            // POSTデータをJavaScriptグローバル変数として設定
            window.formData = ${JSON.stringify(sanitizedData)};
            window.dataReceived = true;
            
            // ページ読み込み後の処理
            window.addEventListener('DOMContentLoaded', function() {
                console.log('✅ POST data received and processed');
                
                // 必須項目が揃っている場合のみボタンを有効化
                if (window.formData && window.formData.bill_no && window.formData.bill_name && window.formData.bill_kana) {
                    document.getElementById('submitBtn').disabled = false;
                    console.log('✅ Required fields validated - button enabled');
                } else {
                    document.getElementById('submitBtn').disabled = true;
                    console.log('❌ Required fields missing - button disabled');
                }
            });
        </script>
        `;
        
        // </head>タグの直前にスクリプトを挿入
        html = html.replace('</head>', dataScript + '</head>');
        
        res.send(html);
        
        // セキュリティログ（機密情報はマスク）
        console.log('✅ HTML with form data sent to client:', {
            bill_no: sanitizedData.bill_no,
            has_bill_name: !!sanitizedData.bill_name,
            has_bill_kana: !!sanitizedData.bill_kana,
            has_shop_pwd: !!sanitizedData.shop_pwd,
            has_fs_token: !!sanitizedData.fs_token,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Error processing HTML template:', error);
        res.status(500).send(`
            <!DOCTYPE html>
            <html lang="ja">
            <head><meta charset="UTF-8"><title>サーバーエラー</title></head>
            <body>
                <h1>サーバーエラー</h1>
                <p>申し訳ございません。サーバーで問題が発生しました。</p>
            </body>
            </html>
        `);
    }
}

// 入力値のサニタイズ（XSS対策）
function sanitizeInput(input) {
    if (typeof input !== 'string') {
        return '';
    }
    return input
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;')
        .trim();
}

// 健康チェック用のエンドポイント
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'Secure Bill Registration Service (POST Credentials Mode)',
        environment: process.env.NODE_ENV || 'development',
        security: {
            basicAuth: process.env.NODE_ENV === 'production' || process.env.ENABLE_AUTH === 'true',
            rateLimit: true,
            helmet: true,
            postCredentials: true
        }
    });
});

// デバッグ用エンドポイント
app.get('/debug', (req, res) => {
    res.json({
        message: 'Server is running with POST credentials mode',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        environmentVariables: {
            ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ? '***SET***' : 'NOT_SET',
            ENABLE_AUTH: process.env.ENABLE_AUTH || 'false'
        },
        security: {
            basicAuth: process.env.NODE_ENV === 'production' || process.env.ENABLE_AUTH === 'true',
            rateLimit: '20 requests per 15 minutes',
            helmet: 'enabled',
            postCredentials: 'enabled - credentials sent via POST from client',
            urlParametersBlocked: true
        },
        endpoints: {
            'POST /': 'Main endpoint (credentials in POST data)',
            'GET /': 'Basic page (no parameters allowed)',
            'GET /health': 'Health check',
            'GET /debug': 'Debug info'
        }
    });
});

// 404エラーハンドリング
app.use((req, res) => {
    res.status(404).send(`
        <!DOCTYPE html>
        <html lang="ja">
        <head>
            <meta charset="UTF-8">
            <title>ページが見つかりません</title>
            <style>
                body { 
                    font-family: sans-serif; 
                    text-align: center; 
                    padding: 50px; 
                    background-color: #f5f5f5;
                }
                .container {
                    background: white;
                    padding: 30px;
                    border-radius: 12px;
                    max-width: 500px;
                    margin: 0 auto;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>404 - ページが見つかりません</h1>
                <p>お探しのページは存在しません。</p>
            </div>
        </body>
        </html>
    `);
});

// エラーハンドリング
app.use((error, req, res, next) => {
    console.error('Server error:', error.message);
    res.status(500).send(`
        <!DOCTYPE html>
        <html lang="ja">
        <head>
            <meta charset="UTF-8">
            <title>サーバーエラー</title>
        </head>
        <body>
            <h1>サーバーエラー</h1>
            <p>申し訳ございません。サーバーで問題が発生しました。</p>
        </body>
        </html>
    `);
});

app.listen(port, () => {
    console.log(`🚀 Secure Bill Registration Server running on port ${port}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔐 Basic Auth: ${process.env.NODE_ENV === 'production' || process.env.ENABLE_AUTH === 'true' ? 'ENABLED' : 'DISABLED'}`);
    console.log(`🛡️  Rate Limit: 20 requests per 15 minutes`);
    console.log(`🔒 Security headers: ENABLED`);
    console.log(`📮 POST credentials mode: ENABLED`);
    console.log(`🚫 URL parameters: BLOCKED`);
    console.log(`📝 Endpoints:`);
    console.log(`   POST / - Main endpoint (credentials via POST)`);
    console.log(`   GET /  - Basic page (no parameters allowed)`);
    console.log(`   GET /health - Health check`);
    console.log(`   GET /debug - Debug information`);
    console.log(`⚠️  Important: Credentials should be sent via POST from client!`);
});
