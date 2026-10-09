import os
import tempfile

from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader, Docx2txtLoader, TextLoader

from src.ai.embeddings import embed_texts

CHUNK_SIZE    = 512
CHUNK_OVERLAP = 64

_SPLITTER = RecursiveCharacterTextSplitter(
    chunk_size=CHUNK_SIZE,
    chunk_overlap=CHUNK_OVERLAP,
    separators=["\n\n", "\n", ".", " ", ""],
)


def process_document(
    file_bytes: bytes,
    filename: str,
    tenant_id: int,
    document_id: int,
    db,
) -> int:
    from src.common.models import DocumentChunk

    suffix = os.path.splitext(filename)[1].lower()
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        if suffix == ".pdf":
            loader = PyPDFLoader(tmp_path)
        elif suffix in (".docx", ".doc"):
            loader = Docx2txtLoader(tmp_path)
        else:
            loader = TextLoader(tmp_path, encoding="utf-8")
        docs = loader.load()
    finally:
        os.unlink(tmp_path)

    chunks = _SPLITTER.split_documents(docs)
    if not chunks:
        return 0

    texts      = [c.page_content for c in chunks]
    embeddings = embed_texts(texts)

    for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
        db.add(DocumentChunk(
            document_id = document_id,
            tenant_id   = tenant_id,
            content     = chunk.page_content,
            embedding   = embedding,
            chunk_index = i,
            chunk_meta  = {
                "source": filename,
                "page":   chunk.metadata.get("page", 0),
            },
        ))

    db.commit()
    return len(chunks)
