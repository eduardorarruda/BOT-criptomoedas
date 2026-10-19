# Coletor do MetaTrader 5: só HTTP interno + mt5linux (RPyC) falando com o container
# `mt5-terminal`. Não leva Wine nem o terminal: esses ficam na imagem do terminal.
FROM python:3.12-slim
RUN pip install --no-cache-dir mt5linux \
    && useradd --system --no-create-home coletor
COPY coletor.py /app/coletor.py
USER coletor
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8090/saude').status==200 else 1)"
CMD ["python", "/app/coletor.py"]
