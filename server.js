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

// GETアクセス（テスト用・URLパラメータ）
app.get('/', (req, res) => {
    console.log('GET request received');
    
    // URLパラメータがある場合（テスト用）
    if (Object.keys(req.query).length > 0) {
        console.log('Processing URL parameters (test mode)');
        const billData = {
            bill_no: req.query.bill_no || '',
            bill_name: req.query.bill_name || '',
            bill_kana: req.query.bill_kana || '',
            bill_zip: req.query.bill_zip || '',
            bill_adr_1: req.query.bill_adr_1 || '',
            bill_phon: req.query.bill_phon || '',
            bill_mail: req.query.bill_mail || ''
        };
        
        return sendHTMLWithData(res, billData);
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

// HTMLにデータを埋め込んで送信する関数
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
        
        // SMBC送信用のデータ（機密情報を環境変数から取得）
        const smbcFormData = {
            version: "130",
            shop_cd: "4167125",
            syuno_co_cd: "52975",
            shoporder_no: "999",
            shop_pwd: requiredEnvVars.SHOP_PWD, // 環境変数から取得
            koushin_kbn: "1",
            bill_mail_kbn: "1",
            redirect_kbn: "0",
            redirect_sec: "10",
            shop_phon_hyoji_kbn: "1",
            shop_mail_hyoji_kbn: "1",
            bill_method: "01",
            kessai_id: "0101",
            fs: requiredEnvVars.FS_TOKEN, // 環境変数から取得
            shop_link: "http://127.0.0.1:8000/api/",
            shop_error_link: "http://18.179.157.221:3000/smbc/error",
            shop_res_link: "https://zjtmel28uk.execute-api.ap-northeast-1.amazonaws.com/dev/payment/smbc_stg/result"
        };
        
        // データをJavaScriptとして埋め込み
        const dataScript = `
        <script>
            // POSTデータをJavaScriptグローバル変数として設定
            window.billData = ${JSON.stringify(sanitizedData)};
            window.smbcFormData = ${JSON.stringify(smbcFormData)};
            
            // ページ読み込み後にフォームにデータをセット
            window.addEventListener('DOMContentLoaded', function() {
                console.log('Setting bill data from server');
                
                // 請求者情報をフォームに設定
                if (window.billData) {
                    document.getElementById('bill_no').value = window.billData.bill_no || '';
                    document.getElementById('bill_name').value = window.billData.bill_name || '';
                    document.getElementById('bill_kana').value = window.billData.bill_kana || '';
                    document.getElementById('bill_zip').value = window.billData.bill_zip || '';
                    document.getElementById('bill_adr_1').value = window.billData.bill_adr_1 || '';
                    document.getElementById('bill_phon').value = window.billData.bill_phon || '';
                    document.getElementById('bill_mail').value = window.billData.bill_mail || '';
                }
                
                // SMBC送信用の固定データを設定（機密情報含む）
                if (window.smbcFormData) {
                    document.getElementById('version').value = window.smbcFormData.version;
                    document.getElementById('shop_cd').value = window.smbcFormData.shop_cd;
                    document.getElementById('syuno_co_cd').value = window.smbcFormData.syuno_co_cd;
                    document.getElementById('shoporder_no').value = window.smbcFormData.shoporder_no;
                    document.getElementById('shop_pwd').value = window.smbcFormData.shop_pwd;
                    document.getElementById('koushin_kbn').value = window.smbcFormData.koushin_kbn;
                    document.getElementById('bill_mail_kbn').value = window.smbcFormData.bill_mail_kbn;
                    document.getElementById('redirect_kbn').value = window.smbcFormData.redirect_kbn;
                    document.getElementById('redirect_sec').value = window.smbcFormData.redirect_sec;
                    document.getElementById('shop_phon_hyoji_kbn').value = window.smbcFormData.shop_phon_hyoji_kbn;
                    document.getElementById('shop_mail_hyoji_kbn').value = window.smbcFormData.shop_mail_hyoji_kbn;
                    document.getElementById('bill_method').value = window.smbcFormData.bill_method;
                    document.getElementById('kessai_id').value = window.smbcFormData.kessai_id;
                    document.getElementById('fs').value = window.smbcFormData.fs;
                    document.getElementById('shop_link').value = window.smbcFormData.shop_link;
                    document.getElementById('shop_error_link').value = window.smbcFormData.shop_error_link;
                    document.getElementById('shop_res_link').value = window.smbcFormData.shop_res_link;
                }
                
                // 必須項目が揃っている場合のみボタンを有効化
                if (window.billData && window.billData.bill_no && window.billData.bill_name && window.billData.bill_kana) {
                    document.getElementById('submitBtn').disabled = false;
                    console.log('Required fields present, button enabled');
                } else {
                    document.getElementById('submitBtn').disabled = true;
                    console.log('Missing required fields, button disabled');
                }
                
                // URLからのパラメータは履歴から削除（セキュリティ対策）
                if (window.location.search) {
                    window.history.replaceState({}, document.title, window.location.pathname);
                }
            });
        </script>
        `;
        
        // </head>タグの直前にスクリプトを挿入
        html = html.replace('</head>', dataScript + '</head>');
        
        res.send(html);
    } catch (error) {
        console.error('Error reading HTML file:', error);
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
        service: 'Secure Bill Registration Service',
        environment: process.env.NODE_ENV || 'development',
        security: {
            basicAuth: process.env.NODE_ENV === 'production' || process.env.ENABLE_AUTH === 'true',
            rateLimit: true,
            helmet: true
        }
    });
});

// デバッグ用エンドポイント（環境変数の存在確認のみ）
app.get('/debug', (req, res) => {
    res.json({
        message: 'Server is running',
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
            helmet: 'enabled'
        },
        endpoints: {
            'POST /': 'Main secure endpoint (recommended)',
            'GET /': 'Fallback endpoint with URL params (test only)',
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
    console.log(`📝 Endpoints:`);
    console.log(`   POST / - Main secure endpoint (recommended)`);
    console.log(`   GET /  - Fallback with URL params (test only)`);
    console.log(`   GET /health - Health check`);
    console.log(`   GET /debug - Debug information`);
    console.log(`⚠️  Important: Set environment variables in App Runner configuration!`);
});
