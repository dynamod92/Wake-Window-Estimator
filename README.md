# Wake-Window-Estimator

A simple web app to help parents track and estimate their baby's *wake windows* over the day and project likely wake window lengths week-by-week.

## ✅ How to run

### 1) Install dependencies

```bash
npm install
```

### 2) Run locally

```bash
npm run dev
```

Then visit: http://localhost:3000

### 3) Build for production

```bash
npm run build
npm start
```

## 🧩 What’s included

- `app/` — Next.js app route and global layout
- `components/WakeWindowEstimator.tsx` — UI + calculation logic
- `app/globals.css` — styling

## 🔧 How it works

- Enter **wake up**, **nap start/end**, and **bedtime**.
- The app stores the schedule in **localStorage**.
- A chart displays the actual wake windows for the day.
- A second chart projects average wake window lengths week-by-week.

> Note: This tool is for planning and tracking. It is not medical advice.
