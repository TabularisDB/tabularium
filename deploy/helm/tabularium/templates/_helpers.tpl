{{/*
Expand the name of the chart.
*/}}
{{- define "tabularium.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "tabularium.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "tabularium.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "tabularium.labels" -}}
helm.sh/chart: {{ include "tabularium.chart" . }}
{{ include "tabularium.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "tabularium.selectorLabels" -}}
app.kubernetes.io/name: {{ include "tabularium.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "tabularium.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "tabularium.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Name of the chart-managed Secret (or existingSecret override).
*/}}
{{- define "tabularium.secretName" -}}
{{- if .Values.secrets.existingSecret }}
{{- .Values.secrets.existingSecret }}
{{- else }}
{{- include "tabularium.fullname" . }}
{{- end }}
{{- end }}

{{/*
Effective DATABASE_URL — sqlite mode points at the PVC mount, external mode
takes the user-supplied URL verbatim.
*/}}
{{- define "tabularium.databaseUrl" -}}
{{- if eq .Values.config.databaseMode "external" -}}
{{- required "config.databaseUrl is required when databaseMode=external" .Values.config.databaseUrl -}}
{{- else -}}
{{- printf "%s/registry.db" .Values.config.dataDir -}}
{{- end -}}
{{- end }}
