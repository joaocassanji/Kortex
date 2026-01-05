# Kortex User Guide

## Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+
- Docker
- vcluster

### Installation

1. **Backend Setup**
   ```bash
   cd backend
   pip install -r requirements.txt 
   python -m uvicorn app.main:app --reload
   ```
   The API will start at `http://localhost:8000`.

2. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   The UI will be available at `http://localhost:5173`.

## Features

### 1. Connect Cluster
- Enter your Kubeconfig path in the UI.
- Kortex will validate connectivity and build the dependency graph.

### 2. Visualize
- Navigate to the "Cluster Graph" tab.
- Users can zoom, pan, and filter nodes by kind.

### 3. AI Analysis
- Click "Analyze" to trigger the LangChain agent.
- View issues categorized by Security, Performance, and reliability.
- Click "Fix with AI" to generate a remediation plan.

### 4. Safety Simulation
- All remediations are tested in a `vcluster` shadow environment before application.
