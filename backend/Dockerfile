FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    git wget unzip ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Nuclei
RUN wget -q https://github.com/projectdiscovery/nuclei/releases/download/v3.3.7/nuclei_3.3.7_linux_amd64.zip \
    && unzip -q nuclei_3.3.7_linux_amd64.zip \
    && mv nuclei /usr/local/bin/ \
    && rm nuclei_3.3.7_linux_amd64.zip

RUN nuclei -update-templates \
    && echo "Nuclei templates installed" \
    && nuclei -version

# Katana
RUN wget -q https://github.com/projectdiscovery/katana/releases/download/v1.1.0/katana_1.1.0_linux_amd64.zip \
    && unzip -oq katana_1.1.0_linux_amd64.zip \
    && mv katana /usr/local/bin/ \
    && rm -f katana_1.1.0_linux_amd64.zip LICENSE.md README.md \
    && katana -version

# Gitleaks
RUN wget -q https://github.com/gitleaks/gitleaks/releases/download/v8.30.0/gitleaks_8.30.0_linux_x64.tar.gz \
    && tar -xzf gitleaks_8.30.0_linux_x64.tar.gz \
    && mv gitleaks /usr/local/bin/ \
    && rm -f gitleaks_8.30.0_linux_x64.tar.gz LICENSE README.md \
    && gitleaks version

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/

RUN mkdir -p /tmp/trust_scans

ENV PORT=8080
ENV PYTHONUNBUFFERED=1
ENV SCAN_OUTPUT_DIR=/tmp/trust_scans
ENV NUCLEI_TEMPLATES_DIR=/root/nuclei-templates

EXPOSE 8080

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
