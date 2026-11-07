FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Training is split into cached layers, slowest first, so a rebuild only redoes what changed:
#   - editing the API or chatbot rules (main.py, smalltalk.py)       -> no retraining at all
#   - editing chatbot phrases (intents_data.py, intents_frames.py)   -> only the intent model (~2-3 min)
#   - editing complaint data or the complaint models                 -> everything (~15 min)
# Models are trained inside the image so they always match this image's scikit-learn version.

# 1) complaint dataset + category/priority models
COPY app/__init__.py app/baseline.py app/text.py ./app/
COPY training/__init__.py training/generate_dataset.py training/data_fr.py training/data_more.py training/train_all.py ./training/
# hand-written Arabizi test set (evaluation only, never trained on)
COPY data/arabizi_realistic.csv ./data/arabizi_realistic.csv
RUN python -m training.generate_dataset && python -m training.train_all

# 2) chatbot intent model
COPY training/intents_data.py training/intents_frames.py training/train_intent.py ./training/
RUN python -m training.train_intent

# 3) API code last: changing it never retrains
COPY app ./app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
