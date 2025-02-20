FROM nginx:alpine

COPY *.html /usr/share/nginx/html
COPY *.css /usr/share/nginx/html
COPY *.js /usr/share/nginx/html

ARG ENV=production
COPY nginx.$ENV.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
