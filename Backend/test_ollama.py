from ollama import chat
from pydantic import BaseModel
from typing import Literal

class ResumeAnalysis(BaseModel):
    candidate_name: str
    experience_level: Literal['Junior', 'Mid', 'Senior']
    key_skills: list[str]
    notable_projects: list[str]

resume_text = """
Rahul Singh
Full-Stack Developer

Experience:
- Built a task management web app using React and Node.js, deployed on AWS.
- Interned at a fintech startup, working on Python microservices with FastAPI.
- Contributed to an open-source data visualization library using D3.js.

Skills: Python, JavaScript, React, FastAPI, SQL, Git, Docker

Education: B.Tech in Computer Science Engineering, graduating 2027.
"""

prompt = f"""Extract structured information from the resume below.

Rules:
- Only use information explicitly present in the text. Do not invent, guess, or infer any name, company, or skill that isn't literally there.
- Judge experience_level from context clues (internships and student projects read as Junior; several years of professional roles read as Mid or Senior).

Resume:
{resume_text}"""

response = chat(
    model='llama3.1',
    messages=[{'role': 'user', 'content': prompt}],
    format=ResumeAnalysis.model_json_schema(),
    options={'temperature': 0},
)

result = ResumeAnalysis.model_validate_json(response['message']['content'])
print(result)