import chromadb
from typing import List, Dict, Any
from chromadb.config import Settings

class VectorStoreAdapter:
    def __init__(self, persist_directory: str = "./chroma_db"):
        self.client = chromadb.PersistentClient(path=persist_directory)
        self.collection = self.client.get_or_create_collection(name="k8s_docs")

    def ingest_document(self, doc_id: str, content: str, metadata: Dict[str, Any]):
        self.collection.upsert(
            documents=[content],
            metadatas=[metadata],
            ids=[doc_id]
        )

    def search(self, query: str, n_results: int = 3) -> List[Dict[str, Any]]:
        results = self.collection.query(
            query_texts=[query],
            n_results=n_results
        )
        
        # Format results
        output = []
        if results["documents"]:
            for i, doc in enumerate(results["documents"][0]):
                meta = results["metadatas"][0][i] if results["metadatas"] else {}
                output.append({
                    "content": doc,
                    "metadata": meta
                })
        return output
