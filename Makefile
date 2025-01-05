# Makefile for local and production Nginx HTML development

# Variables
DOCKER_IMAGE_NAME=recipe-generator-frontend
DOCKER_PORT=1000
NGINX_PORT=80
LOCAL_ENV=local
PROD_ENV=production
DOCKER_REPO=ili16/recipe-generator-frontend
VERSION=latest

.PHONY: local production build run clean push

# Build the Docker image for local environment
build-local:
	docker build --build-arg ENV=$(LOCAL_ENV) -t $(DOCKER_IMAGE_NAME) .

# Build the Docker image for production environment
build-production:
	docker build --build-arg ENV=$(PROD_ENV) -t $(DOCKER_REPO):$(VERSION) .
	docker tag $(DOCKER_REPO):$(VERSION) $(DOCKER_REPO):latest

# Run the Docker container locally and map ports
run:
	docker run --rm -p $(DOCKER_PORT):$(NGINX_PORT) $(DOCKER_IMAGE_NAME)

# Shortcut to build and run for local development
local: build-local run

# Build and push the production image
production: build-production push

# Push the production image to the Docker repository
push:
	docker push $(DOCKER_REPO):$(VERSION)
	docker push $(DOCKER_REPO):latest

# Remove the Docker images
clean:
	docker rmi $(DOCKER_IMAGE_NAME) $(DOCKER_REPO):$(VERSION) $(DOCKER_REPO):latest
