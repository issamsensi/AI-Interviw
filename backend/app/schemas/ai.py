from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Project(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str = ""
    description: str = ""
    technologies: list[str] = Field(default_factory=list)
    key_achievements: list[str] = Field(default_factory=list)


class Experience(BaseModel):
    model_config = ConfigDict(extra="ignore")

    company: str = ""
    role: str = ""
    duration: str = ""
    description: str = ""


class Education(BaseModel):
    model_config = ConfigDict(extra="ignore")

    institution: str = ""
    degree: str = ""
    field: str = ""
    year: str = ""


class ResumeAnalysis(BaseModel):
    model_config = ConfigDict(extra="ignore")

    skills: list[str] = Field(default_factory=list)
    projects: list[Project] = Field(default_factory=list)
    experience: list[Experience] = Field(default_factory=list)
    education: list[Education] = Field(default_factory=list)
    tech_stack: list[str] = Field(default_factory=list)


class InterviewQuestion(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text: str = Field(min_length=1)
    category: str = "general"
    order: int = 0


class InterviewPlan(BaseModel):
    model_config = ConfigDict(extra="ignore")

    questions: list[InterviewQuestion] = Field(min_length=1)
    strategy: str = ""


class FollowUpResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    next_action: Literal["proceed", "end"] = "proceed"
    response: str = ""
    next_question: str | None = None


class Evaluation(BaseModel):
    model_config = ConfigDict(extra="ignore")

    overall_score: float = Field(ge=0, le=100)
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    question_scores: dict[str, float] = Field(default_factory=dict)
