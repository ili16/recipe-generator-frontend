FROM nginx:alpine

COPY html/*.html /usr/share/nginx/html
COPY css/*.css /usr/share/nginx/html
COPY js/*.js /usr/share/nginx/html
COPY favicon.ico /usr/share/nginx/html

ARG ENV=production
COPY nginx.$ENV.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
