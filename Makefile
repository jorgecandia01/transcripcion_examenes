SHELL := /bin/sh
.DEFAULT_GOAL := help
.NOTPARALLEL:

# Configuración histórica del despliegue. Se puede sobrescribir al invocar make:
# make deploy TAG=v2 MAX_INSTANCES=5
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
MAX_INSTANCES ?= 3
MIN_INSTANCES ?= 0
CONCURRENCY ?= 80

.PHONY: help check registry-auth build push deploy-run deploy describe url

help:
	@echo "Uso:"
	@echo "  make deploy        Comprueba, construye, publica y despliega el backend"
	@echo "  make build         Construye la imagen Docker $(IMAGE)"
	@echo "  make push          Publica la imagen en Google Artifact Registry (gcr.io)"
	@echo "  make deploy-run    Despliega en Cloud Run sin reconstruir la imagen"
	@echo "  make describe      Muestra la configuración actual del servicio"
	@echo "  make url           Muestra la URL pública del servicio"
	@echo ""
	@echo "Variables: PROJECT_ID, SERVICE, REGION, REGISTRY, TAG, MEMORY, CPU,"
	@echo "           TIMEOUT, MAX_INSTANCES, MIN_INSTANCES y CONCURRENCY"

check:
	@command -v gcloud >/dev/null || { echo "Error: gcloud no está instalado."; exit 1; }
	@command -v docker >/dev/null || { echo "Error: Docker no está instalado."; exit 1; }
	@docker info >/dev/null 2>&1 || { echo "Error: Docker no está en ejecución."; exit 1; }
	@gcloud auth print-access-token >/dev/null || { echo "Error: inicia sesión con 'gcloud auth login'."; exit 1; }
	@gcloud projects describe "$(PROJECT_ID)" --format='value(projectId)' >/dev/null

registry-auth:
	gcloud auth configure-docker "$(REGISTRY)" --quiet

build:
	docker build --platform "$(PLATFORM)" --tag "$(IMAGE)" .

push:
	docker push "$(IMAGE)"

deploy-run:
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
		--concurrency "$(CONCURRENCY)"

deploy: check registry-auth build push deploy-run
	@echo "Despliegue completado: $$(gcloud run services describe "$(SERVICE)" --project "$(PROJECT_ID)" --region "$(REGION)" --format='value(status.url)')"

describe:
	gcloud run services describe "$(SERVICE)" \
		--project "$(PROJECT_ID)" \
		--region "$(REGION)"

url:
	@gcloud run services describe "$(SERVICE)" \
		--project "$(PROJECT_ID)" \
		--region "$(REGION)" \
		--format='value(status.url)'
