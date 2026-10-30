# Windline

Windline is a decision-support pilot for UK day-ahead electricity procurement. It compares Elexon national wind generation forecasts with actual wind output for January 2026.

## What is included

- React dashboard with latest forecast, confidence framing, error metrics, and a forecast-versus-actual chart.
- Python FastAPI backend that reads Elexon Insights API datasets `WINDFOR` and `FUELHH`.
- January 2026 date guardrails and explicit publish-time selection for day-ahead decisions.
- Docker Compose setup for local use.
- Small backend test suite covering the accuracy calculations.

## Start locally

### With Docker

```bash
docker compose up --build
```

Open http://localhost:5173.

### Without Docker

```bash
cd backend
python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend proxies `/api` to `http://localhost:8000`.

## Data and method

The backend uses Elexon Insights API endpoints:

- `https://data.elexon.co.uk/bmrs/api/v1/datasets/FUELHH/stream`
- `https://data.elexon.co.uk/bmrs/api/v1/forecast/generation/wind/history` for historical WINDFOR snapshots (the live WINDFOR stream is also the source dataset).

For a selected delivery half-hour, it chooses the latest forecast published no later than the day before delivery, then joins it to actual national wind output by `startTime`. Accuracy is reported as MAE, RMSE, bias, and mean absolute percentage error. Missing or zero actual values are excluded from percentage error only.

The Elexon API is public and does not require an API key. Data is fetched on demand and cached in memory for five minutes.

## Deploy

The included `Dockerfile` runs the backend and frontend in one container for a simple host deployment. The repository also includes `vercel.json` and Vercel Python Function adapters, so it can deploy as one Vercel project. Set the Vercel project root to the repository root; Vercel builds `frontend/dist` and serves `/api/analysis` and `/api/health` from `api/`.


## Submission checklist

- Push this project to a public GitHub repository with an anonymous name.
- Add the deployed app URL and unlisted YouTube URL to this README.
- Submit the repository, app, and video URLs in the Microsoft form.
- Verify each URL in an incognito window before submitting.

## AI disclosure

AI assistance was used to help structure and implement this pilot. All code and product decisions should be reviewed by the submitting developer before publication.
