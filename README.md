# Kortex

**Kortex** is an intelligent Kubernetes cluster scanning and analysis platform. It leverages Large Language Models (LLMs) to provide deep insights and automated workflows for Kubernetes environments.

## Project Structure

This repository is organized as a monorepo containing both the backend and frontend services:

### 📂 Backend (`/backend`)
Built with **Python**, the backend handles the core logic, including:
- **Kubernetes Adapters**: Interfacing with K8s clusters (via `k8s_adapter.py`).
- **LLM Integration**: AI-driven analysis using LLMs (via `llm_adapter.py`).
- **Workflow Services**: Management of scanning and analysis workflows.
- **Tools**: Includes integration with tools like Helm and vCluster.

### 📂 Frontend (`/frontend`)
Built with **TypeScript** and **Vite**, the frontend provides a modern web interface for:
- Visualizing cluster data.
- Managing scanning tasks.
- Displaying AI-generated insights.

## Getting Started

### Prerequisites
- Node.js (for Frontend)
- Python 3.8+ (for Backend)
- Access to a Kubernetes cluster (or use the built-in vCluster support)

### Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment (recommended).
3. Install dependencies (assuming a `requirements.txt` or `pyproject.toml` exists):
   ```bash
   pip install . 
   # or
   pip install -r requirements.txt
   ```
4. Start the development server:
   ```bash
   python -m uvicorn app.main:app --reload
   ```

### Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

## Key Configuration
The application uses local configuration files like `saved_clusters.json` and `settings.json` in the backend to manage cluster connections and user preferences. Ensure these are properly configured during the first run.