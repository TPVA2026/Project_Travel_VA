import TravelForm from "../components/input/TravelForm";

function PlaneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 13l18-7-4 14-5-4-4 3 1-5z" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <div className="page">
      <header className="hero">
        <div className="hero-mark">
          <PlaneIcon />
        </div>
        <div>
          <h1>Travel Planning Assistant</h1>
          <p>Hãy cho chúng tôi biết nhu cầu của bạn để tạo hành trình phù hợp</p>
        </div>
      </header>
      <main>
        <TravelForm />
      </main>
    </div>
  );
}
