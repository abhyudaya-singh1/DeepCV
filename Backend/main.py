from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from ollama import chat
from pydantic import BaseModel, Field, create_model
from typing import Literal
import fitz  # this is pymupdf's import name

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class ProjectSummary(BaseModel):
    title: str
    description: str

class ResumeAnalysis(BaseModel):
    candidate_name: str
    experience_level: Literal['Junior', 'Mid', 'Senior']
    key_skills: list[str]
    notable_projects: list[ProjectSummary]

class QuestionRequest(BaseModel):
    candidate_name: str
    experience_level: Literal['Junior', 'Mid', 'Senior']
    key_skills: list[str]
    notable_projects: list[ProjectSummary]
    selected_topics: list[str]

class QuestionAnswer(BaseModel):
    question: str
    answer: str

class EvaluationRequest(BaseModel):
    candidate_name: str
    experience_level: Literal['Junior', 'Mid', 'Senior']
    key_skills: list[str]
    notable_projects: list[ProjectSummary]
    qa_pairs: list[QuestionAnswer]

class EvaluationResult(BaseModel):
    strengths: list[str] = Field(min_length=2, max_length=4)
    weaknesses: list[str] = Field(min_length=2, max_length=4)
    feedback: str
    score: int = Field(ge=0, le=100)

@app.post("/parse-resume")
async def parse_resume(file: UploadFile = File(...)):
    pdf_bytes = await file.read()
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")

    text = ""
    for page in doc:
        text += page.get_text()

    page_count = doc.page_count
    doc.close()

    analysis_prompt = f"""Extract structured information from the resume below.

For each notable project, include a one-sentence description drawn directly from what the resume actually says about it — do not add technical detail the resume doesn't state.

Rules:
- Only use information explicitly present in the text. Do not invent, guess, or infer any name, company, skill, or technical detail that isn't literally there.
- Judge experience_level from context clues (internships and student projects read as Junior; several years of professional roles read as Mid or Senior).
- For notable_projects, only include personal or academic projects the candidate built — typically listed under a "Projects" heading. Do not include jobs, internships, or work experience entries in notable_projects, even if they involve building, developing, or managing something.

Resume:
{text}"""

    analysis_response = chat(
        model='llama3.1',
        messages=[{'role': 'user', 'content': analysis_prompt}],
        format=ResumeAnalysis.model_json_schema(),
        options={'temperature': 0},
    )
    analysis = ResumeAnalysis.model_validate_json(analysis_response['message']['content'])

    topics = analysis.key_skills + [p.title for p in analysis.notable_projects]

    return {
        "filename": file.filename,
        "pages": page_count,
        "text": text,
        "analysis": analysis.model_dump(),
        "topics": topics,
    }

@app.post("/generate-questions")
async def generate_questions(request: QuestionRequest):
    selected_skills = [s for s in request.key_skills if s in request.selected_topics]
    selected_projects = [p for p in request.notable_projects if p.title in request.selected_topics]

    projects_text = "\n".join(
        f"- {p.title}: {p.description}" for p in selected_projects
    ) or "None selected."

    field_names = [f"topic_{i}" for i in range(len(request.selected_topics))]
    fields = {name: (list[str], Field(min_length=3, max_length=3)) for name in field_names}
    TopicQuestions = create_model('TopicQuestions', **fields)

    topic_list_text = "\n".join(
        f"{name}: {topic}" for name, topic in zip(field_names, request.selected_topics)
    )

    question_prompt = f"""Generate exactly 3 interview questions for each topic below, using only the information provided.

Candidate: {request.candidate_name}
Experience level: {request.experience_level}
Skills to cover: {', '.join(selected_skills) or 'None selected.'}

Projects to cover:
{projects_text}

Topics (generate exactly 3 questions for each):
{topic_list_text}

Rules:
- Every topic must get exactly 3 questions — no topic should get more or fewer.
- Only ask about the skills and projects listed above — nothing else, even if you can infer the candidate's general field.
- Only mention a specific technology in connection with a specific project if that project's description above actually names it. If a project's description doesn't specify a technology, ask about that project in general terms instead of guessing.
- Questions should be appropriate for a {request.experience_level}-level candidate."""

    response = chat(
        model='llama3.1',
        messages=[{'role': 'user', 'content': question_prompt}],
        format=TopicQuestions.model_json_schema(),
        options={'temperature': 0},
    )
    result = TopicQuestions.model_validate_json(response['message']['content'])

    all_questions = []
    for name in field_names:
        all_questions.extend(getattr(result, name))

    return {"questions": all_questions}

@app.post("/evaluate")
async def evaluate_answers(request: EvaluationRequest):
    projects_text = "\n".join(
        f"- {p.title}: {p.description}" for p in request.notable_projects
    )

    qa_text = "\n\n".join(
        f"Q: {qa.question}\nA: {qa.answer}" for qa in request.qa_pairs
    )

    evaluation_prompt = f"""Evaluate this candidate's interview answers.

Candidate: {request.candidate_name}
Experience level: {request.experience_level}
Skills: {', '.join(request.key_skills)}

Projects:
{projects_text}

Questions and answers:
{qa_text}

Rules:
- Base strengths and weaknesses only on what the candidate actually wrote in their answers — do not invent claims they didn't make.
- If an answer is empty, very short, or clearly doesn't address the question, treat that as a weakness rather than skipping it.
- The score should reflect the overall quality and completeness of the answers relative to a {request.experience_level}-level candidate, not just effort.

Score guide — the score must be consistent with your own strengths and weaknesses above, not chosen independently of them:
- 85-100: comprehensive, accurate, well-structured answers showing strong command of the material, few or no gaps
- 65-84: solid, correct answers with good understanding, some minor gaps in depth or examples
- 40-64: partial or surface-level understanding, several notable gaps
- 15-39: mostly incorrect, very thin, or largely off-topic answers
- 0-14: empty, nonsensical, or completely unrelated to the questions asked"""

    response = chat(
        model='llama3.1',
        messages=[{'role': 'user', 'content': evaluation_prompt}],
        format=EvaluationResult.model_json_schema(),
        options={'temperature': 0},
    )
    result = EvaluationResult.model_validate_json(response['message']['content'])

    return result.model_dump()