import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BusIllustration } from "../common/Illustrations.jsx";
import { saveTripForResults } from "../../services/api";

const QUESTIONS = [
  "What kind of place do you want to go to?",
  "Who are you traveling with, and what should the trip feel like?",
  "When are you free, about how many days, and roughly what is your budget?",
  "Anything you want to prioritize or avoid?",
  "Is there anything you would like to include in this trip?",
];

export default function DescribeChat() {
  const navigate = useNavigate();
  const [answers, setAnswers] = useState([]);
  const [draft, setDraft] = useState("");
  const done = answers.length >= QUESTIONS.length;
  const progress = Math.round((answers.length / QUESTIONS.length) * 100);

  function send(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || done) return;
    const next = [...answers, text];
    setAnswers(next);
    setDraft("");
    if (next.length < QUESTIONS.length) return;
    saveTripForResults({
      notes: QUESTIONS.map((question, index) => ({ question, answer: next[index] })),
    });
    navigate("/results");
  }

  return (
    <div className="planner compact-form describe-chat">
      <section className="card describe-thread" aria-live="polite">
        {QUESTIONS.slice(0, answers.length + (done ? 0 : 1)).map((question, index) => (
          <div className="describe-turn" key={question}>
            <p className="describe-question">{question}</p>
            {answers[index] && <p className="describe-answer">{answers[index]}</p>}
          </div>
        ))}

      </section>
      {!done && (
        <form className="describe-composer" onSubmit={send}>
          <label htmlFor="describe-draft">Your answer</label>
          <textarea
            id="describe-draft"
            rows="3"
            value={draft}
            placeholder="Write a few sentences, then press Send"
            onChange={(event) => setDraft(event.target.value)}
          />
          <button className="primary" type="submit">Send</button>
        </form>
      )}
      <BusIllustration progress={progress} />
      <p className="completion-label" aria-live="polite">{progress}% complete</p>
    </div>
  );
}
