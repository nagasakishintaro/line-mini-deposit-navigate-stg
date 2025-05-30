FROM nginx:alpine

# HTMLファイルをnginxの公開ディレクトリにコピー
COPY web_debit_navigate_page.html /usr/share/nginx/html/index.html

# 追加でオリジナル名でもアクセス可能にする
COPY web_debit_navigate_page.html /usr/share/nginx/html/web_debit_navigate_page.html

# ポート80を公開
EXPOSE 80

# nginxを起動
CMD ["nginx", "-g", "daemon off;"]
