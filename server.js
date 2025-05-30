const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 8080;

// 静的ファイルを提供
app.use(express.static('.'));

// ルートアクセス時にHTMLファイルを返す
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'web_debit_navigate_page.html'));
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
