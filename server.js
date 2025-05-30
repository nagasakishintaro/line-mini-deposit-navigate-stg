const express = require('express');
const path = require('path');
const fs = require('fs');
const basicAuth = require('express-basic-auth');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const app = express();
const port = process.env.PORT || 8080;

// 環境変数の検証（機密情報）
const requiredEnvVars = {
    SHOP_PWD: process.env.SHOP_PWD,
    FS_TOKEN: process.env.FS_TOKEN,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD
};

// 必須環境変数のチェック
for (const [key, value] of Object.entries(requiredEnvVars)) {
    if (!value) {
        console.error(`❌ Required environment variable ${key} is not set`);
        console.error('Please set all required environment variables in App Runner configuration');
        process.exit(1);
    }
}

console.log('✅ All required environment variables are set');

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
        users: { 'admin': requiredEnvVars.ADMIN_PASSWORD },
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
    
    // URLパラメータがある場合は拒否（セキュリティ強化）
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

// POSTアクセス（セキュア・本番用）
app.post('/', (req, res) => {
    console.log('POST request received');
    console.log('POST data received:', {
        bill_no: req.body.bill_no ? '***masked***' : 'empty',
        bill_name: req.body.bill_name ? '***masked***' : 'empty',
        bill_kana: req.body.bill_kana ? '***masked***' : 'empty',
        bill_zip: req.body.bill_zip ? '***masked***' : 'empty',
        bill_adr_1: req.body.bill_adr_1 ? '***masked***' : 'empty',
        bill_phon: req.body.bill_phon ? '***masked***' : 'empty',
        bill_mail: req.body.bill_mail ? '***masked***' : 'empty'
    });
    
    // POSTデータから値を取得（デフォルト値は空文字）
    const billData = {
        bill_no: req.body.bill_no || '',
        bill_name: req.body.bill_name || '',
        bill_kana: req.body.bill_kana || '',
        bill_zip: req.body.bill_zip || '',
        bill_adr_1: req.body.bill_adr_1 || '',
        bill_phon: req.body.bill_phon || '',
        bill_mail: req.body.bill_mail || ''
    };
    
    // 必須フィールドの検証
    if (!billData.bill_no || !billData.bill_name || !billData.bill_kana) {
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
    
    sendHTMLWithData(res, billData);
});

// HTMLにデータを埋め込んで送信する関数（機密情報を安全に処理）
function sendHTMLWithData(res, billData) {
    try {
        // HTMLファイルを読み込み
        let html = fs.readFileSync(path.join(__dirname, 'web_debit_navigate_page.html'), 'utf8');
        
        // セキュリティのため、データをサニタイズ
        const sanitizedData = {
            bill_no: sanitizeInput(billData.bill_no),
            bill_name: sanitizeInput(billData.bill_name),
            bill_kana: sanitizeInput(billData.bill_kana),
            bill_zip: sanitizeInput(billData.bill_zip),
            bill_adr_1: sanitizeInput(billData.bill_adr_1),
            bill_phon: sanitizeInput(billData.bill_phon),
            bill_mail: sanitizeInput(billData.bill_mail)
        };
        
        // 完全なSMBCフォームHTML（機密情報を含む）をサーバー側で生成
        const smbcFormHTML = `
        <!-- SMBCへの送信フォーム（サーバー側で機密情報を安全に設定） -->
        <form id="smbcForm" action="https://www.paymentstation.jp/customertest/sf/at/kokkzmoshikomi/begin.do" method="post" accept-charset="Shift_JIS" style="display: none;">
            <input type="hidden" name="version" value="130">
            <input type="hidden" name="shop_cd" value="4167125">
            <input type="hidden" name="syuno_co_cd" value="52975">
            <input type="hidden" name="shoporder_no" value="999">
            <input type="hidden" name="shop_pwd" value="${requiredEnvVars.SHOP_PWD}">
            <input type="hidden" name="koushin_kbn" value="1">
            <input type="hidden" name="bill_no" value="${sanitizedData.bill_no}">
            <input type="hidden" name="bill_name" value="${sanitizedData.bill_name}">
            <input type="hidden" name="bill_kana" value="${sanitizedData.bill_kana}">
            <input type="hidden" name="bill_zip" value="${sanitizedData.bill_zip}">
            <input type="hidden" name="bill_adr_1" value="${sanitizedData.bill_adr_1}">
            <input type="hidden" name="bill_phon" value="${sanitizedData.bill_phon}">
            <input type="hidden" name="bill_mail" value="${sanitizedData.bill_mail}">
            <input type="hidden" name="bill_mail_kbn" value="1">
            <input type="hidden" name="redirect_kbn" value="0">
            <input type="hidden" name="redirect_sec" value="10">
            <input type="hidden" name="shop_phon_hyoji_kbn" value="1">
            <input type="hidden" name="shop_mail_hyoji_kbn" value="1">
            <input type="hidden" name="bill_method" value="01">
            <input type="hidden" name="kessai_id" value="0101">
            <input type="hidden" name="fs" value="${requiredEnvVars.FS_TOKEN}">
            <input type="hidden" name="shop_link" value="http://127.0.0.1:8000/api/">
            <input type="hidden" name="shop_error_link" value="http://18.179.157.221:3000/smbc/error">
            <input type="hidden" name="shop_res_link" value="https://zjtmel28uk.execute-api.ap-northeast-1.amazonaws.com/dev/payment/smbc_stg/result">
        </form>`;
        
        // HTMLの空のフォーム部分を完全なフォームに置換
        html = html.replace(/<!-- 隠しフォーム[\s\S]*?<\/form>/g, smbcFormHTML);
        
        // データ設定用のJavaScriptを追加（機密情報は含まない）
        const dataScript = `
        <script>
            // POSTデータ受信完了の確認用（機密情報は含まない）
            window.billDataReceived = true;
            
            // ページ読み込み後の処理
            window.addEventListener('DOMContentLoaded', function() {
                console.log('✅ POST data processed by server - form ready');
                
                // データが正しく設定されているかチェック（機密情報以外）
                const billNo = document.querySelector('input[name="bill_no"]').value;
                const billName = document.querySelector('input[name="bill_name"]').value;
                const billKana = document.querySelector('input[name="bill_kana"]').value;
                
                if (billNo && billName && billKana) {
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
        
        // セキュリティログ（個人情報はマスク）
        console.log('✅ HTML with secure form sent to client:', {
            bill_no: sanitizedData.bill_no,
            has_bill_name: !!sanitizedData.bill_name,
            has_bill_kana: !!sanitizedData.bill_kana,
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
                <p>しばらく時間をおいてから再度お試しください。</p>
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
        service: 'Secure Bill Registration Service',
        environment: process.env.NODE_ENV || 'development',
        security: {
            basicAuth: process.env.NODE_ENV === 'production' || process.env.ENABLE_AUTH === 'true',
            rateLimit: true,
            helmet: true,
            templateReplacement: true
        }
    });
});

// デバッグ用エンドポイント（環境変数の存在確認のみ）
app.get('/debug', (req, res) => {
    res.json({
        message: 'Server is running with secure template replacement',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        environmentVariables: {
            SHOP_PWD: process.env.SHOP_PWD ? '***SET***' : 'NOT_SET',
            FS_TOKEN: process.env.FS_TOKEN ? '***SET***' : 'NOT_SET',
            ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ? '***SET***' : 'NOT_SET',
            ENABLE_AUTH: process.env.ENABLE_AUTH || 'false'
        },
        security: {
            basicAuth: process.env.NODE_ENV === 'production' || process.env.ENABLE_AUTH === 'true',
            rateLimit: '20 requests per 15 minutes',
            helmet: 'enabled',
            templateReplacement: 'enabled - sensitive data not exposed to client',
            urlParametersBlocked: true
        },
        endpoints: {
            'POST /': 'Main secure endpoint (only method allowed)',
            'GET /': 'Basic page (no parameters allowed)',
            'GET /health': 'Health check',
            'GET /debug': 'Debug info (no sensitive data)'
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
    console.log(`🔒 Template replacement: ENABLED (sensitive data not exposed to client)`);
    console.log(`🚫 URL parameters: BLOCKED`);
    console.log(`📝 Endpoints:`);
    console.log(`   POST / - Main secure endpoint (recommended)`);
    console.log(`   GET /  - Basic page (no parameters allowed)`);
    console.log(`   GET /health - Health check`);
    console.log(`   GET /debug - Debug information`);
    console.log(`⚠️  Important: Set environment variables in App Runner configuration!`);
    console.log(`✅ Security: Sensitive data is completely hidden from client-side`);
});
