import WakeWindowEstimator from "../components/WakeWindowEstimator";

export default function Home() {
  return (
    <main>
      <header>
        <h1>Wake Window Estimator</h1>
        <p className="subtitle">
          Enter your baby’s daily schedule to see actual wake windows and a projected weekly trend.
        </p>
      </header>

      <WakeWindowEstimator />

      <footer className="footer">
        <small>
          Data is not medical advice. For personalized support, talk to your pediatrician.
        </small>
      </footer>
    </main>
  );
}
