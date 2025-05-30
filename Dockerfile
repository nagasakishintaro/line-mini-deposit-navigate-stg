FROM nginx:alpine

# HTMLファイルをコピー
COPY web_debit_navigate_page.html /usr/share/nginx/html/index.html

# ポート80を公開  
EXPOSE 80

# nginxを起動
CMD ["nginx", "-g", "daemon off;"]
