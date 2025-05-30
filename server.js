const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 8080;

// POSTデータを受け取るためのミドルウェア
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(__dirname));

// セキュリティヘッダーを追加
app.use((req, res, next) => {
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// GETアクセス（テスト用・URLパラメータ）
app.get('/', (req, res) => {
    console.log('GET request received');
    console.log('Query params:', req.query);
    
    // URLパラメータがある場合（テスト用）
    if (Object.keys(req.query).length > 0) {
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
    console.log('Body data:', {
        bill_no: req.body.bill_no ? '***' : 'empty',
        bill_name: req.body.bill_name ? '***' : 'empty',
        bill_kana: req.body.bill_kana ? '***' : 'empty',
        bill_zip: req.body.bill_zip ? '***' : 'empty',
        bill_adr_1: req.body.bill_adr_1 ? '***' : 'empty',
        bill_phon: req.body.bill_phon ? '***' : 'empty',
        bill_mail: req.body.bill_mail ? '***' : 'empty'
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
                    p {
                        color: #666;
                        line-height: 1.6;
                        margin-bottom: 20px;
                    }
                    .required-fields {
                        background-color: #f8f9fa;
                        border: 1px solid #e9ecef;
                        border-radius: 6px;
                        padding: 15px;
                        margin: 20px 0;
                        text-align: left;
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
                    .back-btn:hover {
                        background-color: #4a9891;
                    }
                </style>
            </head>
            <body>
                <div class="error-container">
                    <div class="error-icon">⚠️</div>
                    <h1>必要な情報が不足しています</h1>
                    <p>口座振替登録を行うために、以下の情報が必要です。</p>
                    
                    <div class="required-fields">
                        <strong>必須項目:</strong><br>
                        • 請求番号 (bill_no)<br>
                        • お名前 (bill_name)<br>
                        • お名前カナ (bill_kana)
                    </div>
                    
                    <p>前の画面に戻って、必要な情報を入力してください。</p>
                    
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
        
        // データをJavaScriptとして埋め込み
        const dataScript = `
        <script>
            // POSTデータをJavaScriptグローバル変数として設定
            window.billData = ${JSON.stringify(sanitizedData)};
            
            // ページ読み込み後にフォームにデータをセット
            window.addEventListener('DOMContentLoaded', function() {
                console.log('Setting bill data from POST');
                
                // 各フィールドにデータを設定
                if (window.billData) {
                    document.getElementById('bill_no').value = window.billData.bill_no || '';
                    document.getElementById('bill_name').value = window.billData.bill_name || '';
                    document.getElementById('bill_kana').value = window.billData.bill_kana || '';
                    document.getElementById('bill_zip').value = window.billData.bill_zip || '';
                    document.getElementById('bill_adr_1').value = window.billData.bill_adr_1 || '';
                    document.getElementById('bill_phon').value = window.billData.bill_phon || '';
                    document.getElementById('bill_mail').value = window.billData.bill_mail || '';
                    
                    // 必須項目が揃っている場合のみボタンを有効化
                    if (window.billData.bill_no && window.billData.bill_name && window.billData.bill_kana) {
                        document.getElementById('submitBtn').disabled = false;
                        console.log('Required fields present, button enabled');
                    } else {
                        document.getElementById('submitBtn').disabled = true;
                        console.log('Missing required fields, button disabled');
                    }
                } else {
                    alert('データの読み込みに失敗しました。');
                    document.getElementById('submitBtn').disabled = true;
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
            <html><head><title>サーバーエラー</title></head>
            <body>
                <h1>サーバーエラー</h1>
                <p>申し訳ございません。サーバーで問題が発生しました。</p>
                <p>しばらく時間をおいてから再度お試しください。</p>
            </body></html>
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
        service: 'Secure Bill Registration Service'
    });
});

// デバッグ用エンドポイント（開発時のみ）
app.get('/debug', (req, res) => {
    res.json({
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        endpoints: {
            'POST /': 'Main secure endpoint',
            'GET /': 'Fallback endpoint with URL params',
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
                <p><a href="/">トップページに戻る</a></p>
            </div>
        </body>
        </html>
    `);
});

// エラーハンドリング
app.use((error, req, res, next) => {
    console.error('Server error:', error);
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
    console.log(`🔒 Security headers enabled`);
    console.log(`📝 Endpoints:`);
    console.log(`   POST / - Main secure endpoint (recommended)`);
    console.log(`   GET /  - Fallback with URL params (test only)`);
    console.log(`   GET /health - Health check`);
    console.log(`   GET /debug - Debug information`);
    console.log(`⚠️  Remember: No personal data in default values!`);
});
