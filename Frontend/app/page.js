'use client';

import { useState } from 'react';

export default function Home() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [questions, setQuestions] = useState(null);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [answers, setAnswers] = useState({});
  const [evaluation, setEvaluation] = useState(null);
  const [evaluationLoading, setEvaluationLoading] = useState(false);

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('http://localhost:8000/parse-resume', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      setResult(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleTopic = (topic) => {
    setSelectedTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]
    );
  };

  const handleGenerateQuestions = async () => {
    setQuestionsLoading(true);
    setError(null);
    setAnswers({});
    setEvaluation(null);

    try {
      const res = await fetch('http://localhost:8000/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...result.analysis,
          selected_topics: selectedTopics,
        }),
      });
      if (!res.ok) throw new Error('Question generation failed');
      const data = await res.json();
      setQuestions(data.questions);
    } catch (err) {
      setError(err.message);
    } finally {
      setQuestionsLoading(false);
    }
  };

  const handleAnswerChange = (question, value) => {
    setAnswers((prev) => ({ ...prev, [question]: value }));
  };

  const allAnswered = questions
    ? questions.every((q) => (answers[q] || '').trim().length > 0)
    : false;

  const handleSubmitEvaluation = async () => {
    setEvaluationLoading(true);
    setError(null);

    const qa_pairs = questions.map((q) => ({ question: q, answer: answers[q] }));

    try {
      const res = await fetch('http://localhost:8000/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...result.analysis,
          qa_pairs,
        }),
      });
      if (!res.ok) throw new Error('Evaluation failed');
      setEvaluation(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setEvaluationLoading(false);
    }
  };

  return (
    <main style={{ padding: '2rem', maxWidth: 600, margin: '0 auto' }}>
      <h1>Resume Parser</h1>

      <input
        type="file"
        accept="application/pdf"
        onChange={(e) => {
          setFile(e.target.files[0]);
          setResult(null);
          setSelectedTopics([]);
          setQuestions(null);
          setAnswers({});
          setEvaluation(null);
        }}
      />
      <button onClick={handleUpload} disabled={!file || loading}>
        {loading ? 'Parsing...' : 'Upload & Parse'}
      </button>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {result && (
        <div style={{ marginTop: '1.5rem' }}>
          <h3>{result.filename} — {result.pages} page(s)</h3>

          {result.analysis && (
            <div style={{ background: '#eef6ff', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', color: '#111' }}>
              <h4 style={{ margin: '0 0 0.5rem' }}>
                {result.analysis.candidate_name} — {result.analysis.experience_level}
              </h4>

              <p style={{ margin: '0.5rem 0 0.25rem' }}><strong>Skills:</strong></p>
              <div>
                {result.analysis.key_skills.map((skill) => (
                  <span
                    key={skill}
                    style={{
                      display: 'inline-block',
                      background: '#dbeafe',
                      borderRadius: '999px',
                      padding: '0.2rem 0.6rem',
                      margin: '0.2rem 0.2rem 0.2rem 0',
                      fontSize: '0.85rem',
                    }}
                  >
                    {skill}
                  </span>
                ))}
              </div>

              <p style={{ margin: '0.75rem 0 0.25rem' }}><strong>Notable projects:</strong></p>
              <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                {result.analysis.notable_projects.map((project) => (
                  <li key={project.title}>
                    <strong>{project.title}</strong> — {project.description}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.topics && (
            <div style={{ background: '#fef9e7', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', color: '#111' }}>
              <h4 style={{ margin: '0 0 0.5rem' }}>Choose topics to be interviewed on</h4>
              {result.topics.map((topic) => (
                <label key={topic} style={{ display: 'block', margin: '0.4rem 0' }}>
                  <input
                    type="checkbox"
                    checked={selectedTopics.includes(topic)}
                    onChange={() => toggleTopic(topic)}
                    style={{ marginRight: '0.5rem' }}
                  />
                  {topic}
                </label>
              ))}
              <button
                onClick={handleGenerateQuestions}
                disabled={selectedTopics.length === 0 || questionsLoading}
                style={{ marginTop: '0.75rem' }}
              >
                {questionsLoading ? 'Generating...' : 'Generate Questions'}
              </button>
            </div>
          )}

          {questions && (
            <div style={{ background: '#f0fdf4', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', color: '#111' }}>
              <h4 style={{ margin: '0 0 0.5rem' }}>Interview Questions</h4>
              {questions.map((question, i) => (
                <div key={question} style={{ marginBottom: '1rem' }}>
                  <p style={{ margin: '0 0 0.3rem' }}>
                    <strong>{i + 1}.</strong> {question}
                  </p>
                  <textarea
                    value={answers[question] || ''}
                    onChange={(e) => handleAnswerChange(question, e.target.value)}
                    placeholder="Type your answer..."
                    rows={3}
                    style={{ width: '100%', padding: '0.5rem', boxSizing: 'border-box', fontFamily: 'inherit' }}
                  />
                </div>
              ))}
              <button
                onClick={handleSubmitEvaluation}
                disabled={!allAnswered || evaluationLoading}
                style={{ marginTop: '0.5rem' }}
              >
                {evaluationLoading ? 'Evaluating...' : 'Submit for Evaluation'}
              </button>
            </div>
          )}

          {evaluation && (
            <div style={{ background: '#f3e8ff', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', color: '#111' }}>
              <h4 style={{ margin: '0 0 0.5rem' }}>Evaluation — Score: {evaluation.score}/100</h4>

              <p style={{ margin: '0.5rem 0 0.25rem' }}><strong>Strengths:</strong></p>
              <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                {evaluation.strengths.map((s) => <li key={s}>{s}</li>)}
              </ul>

              <p style={{ margin: '0.75rem 0 0.25rem' }}><strong>Areas for growth:</strong></p>
              <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                {evaluation.weaknesses.map((w) => <li key={w}>{w}</li>)}
              </ul>

              <p style={{ margin: '0.75rem 0 0.25rem' }}><strong>Feedback:</strong></p>
              <p style={{ margin: 0 }}>{evaluation.feedback}</p>
            </div>
          )}

          <pre style={{ whiteSpace: 'pre-wrap', background: '#f5f5f5', padding: '1rem', color: '#111' }}>
            {result.text}
          </pre>
        </div>
      )}
    </main>
  );
}