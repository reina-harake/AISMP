FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Training only needs the text preprocessing modules; copying the rest of app/ AFTER training means
# editing the API or the chatbot rules (main.py, smalltalk.py) does not retrain the models.
COPY app/__init__.py app/baseline.py app/text.py ./app/
COPY training ./training
# hand-written Arabizi test set (evaluation only, never trained on)
COPY data/arabizi_realistic.csv ./data/arabizi_realistic.csv
# Build the dataset and train/evaluate the models inside the image, so the saved models
# always match this image's scikit-learn version. Takes ~15 minutes; cached afterwards.
RUN python -m training.generate_dataset && python -m training.train_all && python -m training.train_intent
COPY app ./app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
