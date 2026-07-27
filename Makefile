SHELL := /bin/sh
.DEFAULT_GOAL := help
.NOTPARALLEL:

# La configuración puede sobrescribirse al invocar make:
# make deploy-PROD TAG=v2 MAX_INSTANCES=5
PROJECT_ID ?= cosas-formantia
SERVICE ?= backend
REGION ?= europe-southwest1
REGISTRY ?= gcr.io
TAG ?= latest

IMAGE := $(REGISTRY)/$(PROJECT_ID)/$(SERVICE):$(TAG)
PLATFORM ?= linux/amd64
MEMORY ?= 5Gi
CPU ?= 2
TIMEOUT ?= 60m
MAX_INSTANCES ?= 10
MIN_INSTANCES ?= 0
CONCURRENCY ?= 1

.PHONY: help install check local deploy-PROD

help:
	@echo "Uso:"
	@echo "  make install       Instala las dependencias"
	@echo "  make check         Valida el código y las configuraciones"
	@echo "  make local         Ejecuta frontend y backend en http://127.0.0.1:8080"
	@echo "  make deploy-PROD   Construye y despliega Cloud Run y Firebase Hosting"
	@echo ""
	@echo "Variables: PROJECT_ID, SERVICE, REGION, REGISTRY, TAG, MEMORY, CPU,"
	@echo "           TIMEOUT, MAX_INSTANCES, MIN_INSTANCES y CONCURRENCY"

install:
	npm ci

check:
	npm run check
	@APP_ENV=development node -e "const { config } = require('./src/config/config.js'); if (config.environment !== 'development') process.exit(1)"
	@APP_ENV=production node -e "const { config } = require('./src/config/config.js'); if (config.environment !== 'production') process.exit(1)"

local: check
	npm run start:dev

# Hacer antes gcloud auth login y firebase login --reauth
# IMP! update-traffic para que la nueva versión reciba todo el tráfico, que a veces se lia
deploy-PROD: check
	@command -v gcloud >/dev/null || { echo "Error: gcloud no está instalado."; exit 1; }
	@command -v docker >/dev/null || { echo "Error: Docker no está instalado."; exit 1; }
	@command -v firebase >/dev/null || { echo "Error: Firebase CLI no está instalado."; exit 1; }
	@docker info >/dev/null 2>&1 || { echo "Error: Docker no está en ejecución."; exit 1; }
	@gcloud auth print-access-token >/dev/null || { echo "Error: inicia sesión con 'gcloud auth login'."; exit 1; }
	@gcloud projects describe "$(PROJECT_ID)" --format='value(projectId)' >/dev/null
	@firebase projects:list --json >/dev/null || { echo "Error: inicia sesión con 'firebase login --reauth'."; exit 1; }
	gcloud auth configure-docker "$(REGISTRY)" --quiet
	docker build --platform "$(PLATFORM)" --tag "$(IMAGE)" .
	docker push "$(IMAGE)"
	gcloud run deploy "$(SERVICE)" \
		--project "$(PROJECT_ID)" \
		--image "$(IMAGE)" \
		--platform managed \
		--region "$(REGION)" \
		--allow-unauthenticated \
		--memory "$(MEMORY)" \
		--cpu "$(CPU)" \
		--timeout "$(TIMEOUT)" \
		--max-instances "$(MAX_INSTANCES)" \
		--min-instances "$(MIN_INSTANCES)" \
		--concurrency "$(CONCURRENCY)" \
		--update-env-vars "APP_ENV=production"
	gcloud run services update-traffic "$(SERVICE)" \ 
		--project "$(PROJECT_ID)" \
		--region "$(REGION)" \
		--to-latest
	firebase deploy --only hosting --project "$(PROJECT_ID)"
	@echo "Despliegue completado: $$(gcloud run services describe "$(SERVICE)" --project "$(PROJECT_ID)" --region "$(REGION)" --format='value(status.url)')"
