# Use the official NGINX image
FROM nginx:alpine

# Copy HTML files to the NGINX default HTML directory
COPY index.html /usr/share/nginx/html
COPY favicon.ico /usr/share/nginx/html
COPY markdownEditor.js /usr/share/nginx/html
COPY recipeSubmission.js /usr/share/nginx/html

ARG ENV=production
COPY nginx.$ENV.conf /etc/nginx/conf.d/default.conf

# Expose the default NGINX port
EXPOSE 80
