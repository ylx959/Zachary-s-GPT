from pydantic import BaseModel


class DocumentUploadResult(BaseModel):
    filename: str
    chunks: int
    message: str
